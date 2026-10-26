// Interfața: nume → cameră (pe telefonul ăsta sau online) → joc.
// Starea jocului vine mereu de la gazdă (net.js + game.js); aici doar o arătăm și trimitem acțiuni.
import * as THREE from 'three';
import { hostRoom, joinRoom } from './net.js';
import { COLORS, NOTES, RPS_COUNTDOWN_MS, barbutTurn, jengaTurn, playerById } from './game.js';
import * as banknotes from './banknotes.js';
import * as ludo from './ludo.js';
import { createDice } from './dice.js';
import { createBoard, SEAT, SIZE as BOARD_SIZE, TOP as TOP_Y } from './board.js';
import { createXO } from './xo-view.js';
import { createJenga } from './jenga-view.js';
import * as jenga from './jenga.js';
import { openStage, webXRSupported } from './ar.js';
import { trackHands } from './hands.js';
import { createRpsScene } from './rps-ar.js';
import { sound, vibrate, celebrate, lost } from './sound.js';

const $ = selector => document.querySelector(selector);
const testVideo = new URLSearchParams(location.search).get('test-video');
// jocurile merg doar cu camera (AR); ?screen = vedere 3D fără cameră, doar pentru dezvoltare și teste
const SCREEN = new URLSearchParams(location.search).has('screen');
const storage = {
  get: key => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* mod privat */ } },
};
// „1 leu”, „5 lei”
const leiText = v => (Math.abs(v) === 1 ? `${v} leu` : `${v} lei`);
const d6 = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 6);
const GESTURE_ICON = { 'Piatră': 'hand-fist', 'Hârtie': 'hand-palm', 'Foarfecă': 'hand-peace' };
const GAME_TITLES = { barbut: 'Joc de zaruri', rps: 'Piatră–Hârtie–Foarfecă', ludo: 'Nu te supăra, frate', xo: 'X și 0', jenga: 'Jenga' };

let myName = storage.get('camera-arcade-name') || '';
let room = null;
let roomGen = 0;
let view = null; // jocul deschis acum: { game, stage, content, … }

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3500);
}

const showScreen = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id));
const me = () => room && playerById(room.state, room.selfId);
const nameOf = id => playerById(room.state, id)?.name ?? '?';
const nm = id => escapeHtml(nameOf(id));
const dot = color => `<span class="dot" style="background:${ludo.COLOR_HEX[color]}"></span>`;
// iconițe Phosphor prin Iconify
const ic = name => `<iconify-icon icon="ph:${name}"></iconify-icon>`;
const label = (icon, text) => `${ic(icon)}<span>${text}</span>`;
// pentru ce se redesenează la fiecare cadru al camerei: rescriem doar dacă s-a schimbat, altfel iconițele nu apucă să apară
const setHtml = (selector, html) => { const el = $(selector); if (el.innerHTML !== html) el.innerHTML = html; };
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- nume

function askName() {
  $('#name-input').value = myName;
  showScreen('name-screen');
}
$('#name-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#name-input').value.trim().slice(0, 20);
  if (!name) return;
  myName = name;
  storage.set('camera-arcade-name', name);
  if (room) {
    room.dispatch({ type: 'rename', name });
    render();
  } else {
    startLocal();
  }
});
$('#rename').addEventListener('click', askName);

// ---------------------------------------------------------------- camere de joc

async function useRoom(open, onError) {
  const gen = ++roomGen;
  leaveGameView();
  room?.leave();
  room = null;
  try {
    const next = await open(() => { if (gen === roomGen && room) render(); });
    if (gen !== roomGen) { next.leave(); return; }
    room = next;
    render();
  } catch (error) {
    console.error(error);
    if (gen !== roomGen) return;
    if (onError) onError(error); else toast(error.message || 'Nu am putut intra în cameră');
    startLocal();
  }
}
const startLocal = () => useRoom(onState => hostRoom({ name: myName, online: false, onState }));

$('#create-room').addEventListener('click', () => {
  toast('Creez camera…');
  useRoom(onState => hostRoom({ name: myName, online: true, onState }));
});
$('#join-form').addEventListener('submit', event => {
  event.preventDefault();
  const code = $('#join-code').value.trim().toUpperCase();
  const status = (text, error = false) => { $('#join-status').textContent = text; $('#join-status').hidden = !text; $('#join-status').classList.toggle('error', error); };
  if (code.length !== 4) return status('Codul are 4 litere.', true);
  const button = $('#join-form button');
  button.disabled = true;
  button.textContent = 'Mă conectez…';
  status(`Intru în camera ${code}…`);
  useRoom(onState => joinRoom({
    code,
    name: myName,
    onState,
    onProgress: text => status(text),
    onClose: () => { toast('Gazda a închis camera.'); startLocal(); },
  }), error => status(error.message || 'Nu am putut intra în cameră.', true)).finally(() => {
    button.disabled = false;
    button.textContent = 'Intră';
  });
});
$('#leave-room').addEventListener('click', startLocal);
$('#show-join').addEventListener('click', () => {
  $('#join-form').hidden = false;
  $('#join-code').focus();
});
$('#games').addEventListener('click', event => {
  const game = event.target.closest('[data-game]')?.dataset.game;
  if (!game || !room.isHost) return;
  const players = room.state.players.length;
  // singur la zaruri, „Nu te supăra” sau X și 0 → îți punem un calculator ca adversar
  if (players === 1 && ['barbut', 'ludo', 'xo'].includes(game)) room.dispatch({ type: 'add-bot' });
  room.dispatch({ type: 'select', game });
});

function render() {
  if (!myName) return askName();
  const state = room?.state;
  if (!state) return;
  const self = me();
  if (!self) {
    toast('Nu mai ești în camera asta.');
    return startLocal();
  }
  if (!state.game) {
    leaveGameView();
    renderLobby(state, self);
    showScreen('lobby');
  } else {
    enterGameView(state.game);
    renderGame(state, self);
    showScreen('game');
  }
}

function renderLobby(state, self) {
  $('#hello-name').textContent = myName;
  $('#room-local').hidden = room.online;
  $('#room-online').hidden = !room.online;
  $('#code-big').textContent = room.code ?? '';
  if (room.online) { $('#join-status').hidden = true; $('#join-form').hidden = true; }
  $('#room-hint').textContent = room.isHost
    ? 'Prietenii apasă „Intră cu un cod” și scriu codul ăsta. Tu alegi jocul. Ține aplicația deschisă cât intră.'
    : `Gazda (${nameOf(state.hostId)}) alege jocul — intri automat în el.`;
  // jucătorii ca avatare cu inițiala: al tău își schimbă culoarea la atingere; gazda scoate calculatorul atingându-l
  const initial = name => escapeHtml([...String(name).trim()][0]?.toUpperCase() ?? '?');
  const avatar = (p, badge = '') => `<span class="avatar" style="background:${ludo.COLOR_HEX[p.color]}">${initial(p.name)}${badge ? `<span class="badge">${ic(badge)}</span>` : ''}</span>`;
  $('#players').innerHTML = state.players.map(p => {
    const name = `<span class="name">${escapeHtml(p.name)}</span>`;
    const badge = p.bot ? 'robot' : p.id === state.hostId ? 'crown' : '';
    if (p.id === self.id) return `<button class="player mine" id="my-chip" aria-label="Schimbă culoarea">${avatar(p, badge)}${name}</button>`;
    if (p.bot && room.isHost) return `<button class="player" data-kick="${p.id}" aria-label="Scoate calculatorul">${avatar(p, 'x')}${name}</button>`;
    return `<span class="player">${avatar(p, badge)}${name}</span>`;
  }).join('') + (room.isHost && state.players.length < 4 ? `<button class="player" id="add-bot" aria-label="Adaugă calculator"><span class="avatar add">${ic('plus')}</span><span class="name">Calculator</span></button>` : '');
  $('#games-title').textContent = 'Jocuri';
  document.querySelectorAll('#games button').forEach(b => { b.disabled = !room.isHost; });
  $('#games-hint').textContent = room.isHost ? '' : 'Gazda alege jocul.';
}
$('#players').addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.id === 'add-bot') return room.dispatch({ type: 'add-bot' });
  if (target.dataset.kick) return room.dispatch({ type: 'kick', id: target.dataset.kick });
  if (target.id === 'my-chip') {
    // următoarea culoare liberă
    const state = room.state, self = me();
    const taken = new Set(state.players.filter(p => p.id !== self.id).map(p => p.color));
    const start = COLORS.indexOf(self.color);
    const next = [1, 2, 3].map(i => COLORS[(start + i) % COLORS.length]).find(c => !taken.has(c));
    if (next) room.dispatch({ type: 'color', color: next });
  }
});

// ---------------------------------------------------------------- ecranul de joc

function enterGameView(game) {
  if (view?.game === game) return;
  leaveGameView();
  view = { game, mode: SCREEN ? 'screen' : 'table', animatedSeq: room.state.roll?.seq ?? 0, appliedLudoSeq: -1 };
  $('#game-title').textContent = GAME_TITLES[game];
  $('#view-button').hidden = game === 'rps';
  $('#money-button').hidden = game !== 'barbut' || !room.isHost;
  $('#bet-button').hidden = true;
  $('#sheet').hidden = true;
  $('#pawn-buttons').innerHTML = '';
  $('#picks').innerHTML = '';
  $('#ar-status').textContent = '';
  if (game === 'rps') startRpsView(view);
  else startStageView(view);
}

function leaveGameView() {
  if (!view) return;
  const v = view;
  view = null;
  v.stage?.close();
  v.stopHands?.();
  v.rps3d?.dispose();
  clearTimeout(v.countdownTimer);
  stopRpsCamera();
  showBeat(null);
  $('#rps-view').classList.remove('show');
  closeBetSheet();
  $('#stage-root').replaceChildren();
  $('#zoom-controls').hidden = true;
}

$('#back').addEventListener('click', () => {
  $('#sheet').hidden = true;
  if (room.isHost) room.dispatch({ type: 'menu' });
  else startLocal();
});

function renderGame(state, self) {
  $('#back').setAttribute('aria-label', room.isHost ? 'Înapoi la meniu' : 'Ieși din cameră');
  $('#game-code').hidden = !room.online;
  $('#game-code').textContent = room.code ?? '';
  if (state.game === 'rps') return renderRps(state, self);
  if (view.content?.dice) animateNewRoll(state);
  if (state.game === 'xo') view.xo.setState(state.xo);
  if (state.game === 'jenga') view.jenga.setState(state.jenga);
  // nu stricăm surpriza: textele se actualizează după ce se opresc zarurile / piesa
  if (view.content?.busy) { view.pending = true; $('#main-action').hidden = true; return; }
  view.pending = false;
  if (state.game === 'barbut') renderBarbut(state, self);
  else if (state.game === 'ludo') renderLudo(state, self);
  else if (state.game === 'xo') renderXO(state, self);
  else renderJenga(state, self);
}

// la finalul partidei, gazda poate porni direct una nouă
function newGameButton(over) {
  if (!over || !room.isHost) return false;
  $('#main-action').innerHTML = label('arrows-clockwise', 'Joc nou');
  $('#main-action').hidden = false;
  view.newGame = true;
  return true;
}

// câștig / pierdere: confetti sau sunet trist, o singură dată pentru fiecare rezultat (key)
function outcome(key, won) {
  if (!view || view.outcome === key) return;
  view.outcome = key;
  if (won === true) celebrate();
  else if (won === false) lost();
}

function settled() {
  if (view?.pending && room?.state.game === view.game) renderGame(room.state, me());
}

// ---------------------------------------------------------------- scena 3D (barbut + Nu te supăra)

const GAME_ZOOM = { jenga: 1.5, xo: 1.6, ludo: 1.3, barbut: 1 };
function startStageView(v) {
  if (v.game === 'barbut') {
    const group = new THREE.Group();
    const dice = createDice(group, { count: 2, size: 0.035 });
    v.content = { group, dice, footprint: 0.16, groundShadow: false, get busy() { return dice.busy; }, drag: { start: flickStart, move: flickMove, end: flickEnd, cancel: () => { flick = null; } }, hands: diceHands, holes: heldDiceHole(0.07), get handsFast() { return myDiceTurn(); }, get handsActive() { return myDiceTurn(); }, update: dt => { botShake(v, dt); if (dice.update(dt)) settled(); } };
  } else if (v.game === 'xo') {
    const cube = createXO();
    v.xo = cube;
    v.xoArmed = true;
    v.content = {
      group: cube.group, footprint: cube.footprint, busy: false, handOpacity: 0.7, pick: raycaster => pickCell(raycaster), hands: xoHands, update: dt => cube.update(dt),
      get handsActive() { const s = room?.state.xo; return !!s && !s.winner && s.players[s.turn] === room.selfId; },
    };
  } else if (v.game === 'jenga') {
    const tower = createJenga();
    v.jenga = tower;
    v.content = {
      group: tower.group, footprint: tower.footprint, screen: tower.screen, get busy() { return tower.busy; },
      pick: raycaster => pickBlock(raycaster),
      drag: { start: grabBlock, move: dragBlock, end: dropBlock },
      hands: jengaHands,
      get handsActive() { const j = room?.state.jenga; return !!j && j.phase === 'pull' && jengaTurn(j) === room.selfId; },
      // piesa ținută rămâne în fața degetelor
      holes: () => { const p = tower.heldPosition; return p ? [{ world: tower.group.localToWorld(p), radius: 0.045 }] : []; },
      update: dt => { if (tower.update(dt)) settled(); },
    };
  } else {
    const board = createBoard();
    v.board = board;
    v.content = {
      group: board.group,
      dice: board.dice,
      get busy() { return board.dice.busy; },
      footprint: BOARD_SIZE * 0.62,
      facing: SEAT[me().color],
      pick: raycaster => pickPawn(raycaster),
      hands: ludoHands,
      drag: { start: pawnGrab, move: pawnCarry, end: pawnRelease },
      // în fața mâinii: zarul din palmă și pionul ținut
      holes: () => {
        const pawn = board.carriedPosition;
        return pawn ? [{ world: board.group.localToWorld(pawn), radius: 0.016 }] : heldDiceHole(0.03)();
      },
      get handsFast() { return myLudoRoll(); },
      get handsActive() { const L = room?.state.ludo; return !!L && ludo.current(L) === me()?.color; },
      update: dt => {
        botShake(v, dt);
        if (board.update(dt)) settled();
        syncBoard();
      },
    };
    syncBoard();
  }
  // în AR tablele sunt mai mari decât cele reale (lângă mâna din fața camerei păreau de jucărie);
  // cu două degete le mărești / micșorezi, iar mărimea aleasă rămâne pentru data viitoare
  const key = `zoom-${v.game}`;
  let saved = null;
  try { saved = Number(localStorage.getItem(key)) || null; } catch {}
  v.content.zoom = saved ?? GAME_ZOOM[v.game] ?? 1;
  v.content.onZoom = z => { try { localStorage.setItem(key, z.toFixed(2)); } catch {} };
  openMode(SCREEN ? 'screen' : 'table');
}

async function openMode(mode) {
  const v = view;
  if (!v?.content) return;
  // ultima alegere câștigă: dacă între timp s-a cerut alt mod, scena care tocmai a pornit se închide
  const token = v.openToken = {};
  v.stage?.close();
  v.stage = null;
  $('#stage-root').replaceChildren();
  $('#ar-status').textContent = '';
  try {
    // pe masă: SLAM peste tot (vedem imaginea camerei, deci și mâinile); WebXR (Android) doar cu ?webxr
    const real = mode !== 'table' ? mode : (!testVideo && new URLSearchParams(location.search).has('webxr') && await webXRSupported()) ? 'webxr' : 'slam';
    const stage = await openStage({
      root: $('#stage-root'),
      overlay: $('#ui'),
      mode: real,
      content: v.content,
      videoUrl: testVideo,
      status: text => { if (view === v) $('#ar-status').textContent = text; },
      // WebXR închis din sistem → alegi din nou din butonul cu cubul
      setState: s => {
        // WebXR n-are așezare automată: doar butonul
        if (real === 'webxr' && view === v) { $('#place-here').hidden = s !== 'found'; document.body.classList.toggle('placing', s === 'found'); }
        // + / − pentru mărimea jocului, cât timp e pus pe masă
        if (view === v) $('#zoom-controls').hidden = !(s === 'placed' && real !== 'screen');
        if (s === 'closed' && view === v && v.stage === stage) { v.stage = null; v.mode = null; $('#ar-status').textContent = 'AR-ul s-a închis — apasă butonul cu cubul, sus.'; }
      },
      onTap: tapAction,
      placing: p => {
        if (view !== v && p !== null) return; // ascunderea merge mereu (scena se poate închide după ce ai ieșit din joc)
        $('#place-here').hidden = p === null;
        $('#place-here').style.setProperty('--p', `${Math.round((p ?? 0) * 100)}%`);
        document.body.classList.toggle('placing', p !== null);
      },
    });
    if (view !== v || v.openToken !== token) { stage.close(); return; }
    v.stage = stage;
    v.mode = mode;
  } catch (error) {
    console.error(error);
    if (v.openToken !== token) return;
    if (view === v && mode !== 'screen') {
      // fără cameră nu avem variantă: spunem ce e de făcut
      v.mode = null;
      $('#ar-status').textContent = `Nu merge camera (${error.message || error}). Permite camera pentru site și apasă butonul cu cubul, sus.`;
    }
  }
  document.querySelectorAll('#sheet [data-mode]').forEach(b => b.classList.toggle('selected', b.dataset.mode === v.mode));
  $('#replace-table').hidden = v.mode !== 'table';
  $('#view-button').innerHTML = ic({ screen: 'device-mobile', table: 'cube-focus', marker: 'qr-code' }[v.mode]);
  // indicațiile diferă: pe ecran atingi, pe masă folosești mâna
  if (view === v && room?.state.game === v.game) renderGame(room.state, me());
}

$('#view-button').addEventListener('click', () => { $('#sheet').hidden = false; });
$('#sheet-close').addEventListener('click', () => { $('#sheet').hidden = true; });
$('#sheet').addEventListener('click', event => {
  if (event.target.id === 'sheet') $('#sheet').hidden = true; // atingere pe fundal
  const mode = event.target.closest('[data-mode]')?.dataset.mode;
  if (!mode) return;
  $('#sheet').hidden = true;
  if (mode === view?.mode) return;
  // iOS cere permisiunea pentru giroscop direct din atingere (înainte de orice await)
  if (mode === 'table') window.DeviceOrientationEvent?.requestPermission?.().catch(() => {});
  openMode(mode);
});
$('#place-here').addEventListener('click', () => view?.stage?.placeHere?.());
$('#zoom-in').addEventListener('click', () => view?.stage?.zoomBy?.(1.25));
$('#zoom-out').addEventListener('click', () => view?.stage?.zoomBy?.(0.8));
$('#replace-table').addEventListener('click', () => { $('#sheet').hidden = true; view?.stage?.replace(); });
// în WebXR, atingerile pe butoane nu trebuie să ajungă și la scenă
$('#ui').addEventListener('beforexrselect', event => { if (event.target.closest('.panel, button')) event.preventDefault(); });

function animateNewRoll(state) {
  const roll = state.roll;
  if (!roll || roll.seq === view.animatedSeq || !view.content) return;
  view.animatedSeq = roll.seq;
  const roller = playerById(state, roll.by);
  let from;
  if (state.game === 'ludo' && roller) from = SEAT[roller.color].clone(); // zarul vine dinspre locul celui care aruncă
  else if (roll.fling) from = new THREE.Vector3(-roll.fling.x, 0, -roll.fling.z); // cum a aruncat, la fel pentru toți
  else if (roll.by === room.selfId && view.stage) from = view.stage.cameraLocal();
  else {
    const angle = (roll.seq * 2.399) % (Math.PI * 2);
    from = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  }
  const f = roll.fling;
  let launch = f?.start ? { start: new THREE.Vector3(...f.start), vel: new THREE.Vector3(...f.vel), dice: f.dice } : null;
  // calculatorul le aruncă din „mâna” în care le-a agitat, spre mijlocul mesei
  const shake = view.botShake;
  if (!launch && roller?.bot && shake?.on && shake.bot.id === roller.id) {
    const start = view.content.dice.meshes.reduce((sum, m) => sum.add(m.position), new THREE.Vector3()).divideScalar(view.content.dice.meshes.length);
    const vel = new THREE.Vector3(-start.x, 0, -start.z).setLength(state.game === 'ludo' ? 0.35 : 0.55);
    vel.y = 0.3;
    launch = { start, vel, dice: view.content.dice.heldState() };
    shake.on = false;
  }
  view.content.dice.throw({ values: roll.values, seed: roll.seq * 7919 + 17, from, power: f?.power, launch });
}

// Calculatorul „ia” zarurile și le agită ~1,5 s înainte să arunce (gazda așteaptă BOT_SHAKE_MS),
// ca să vezi că urmează el: zarurile plutesc în partea lui de masă, se scutură și clănțăne.
const BOT_PICKUP_MS = 1200, BOT_IDLE_MS = 500;
function botAboutToRoll(state) {
  if (state?.game === 'barbut') {
    const b = state.barbut, bot = state.players.find(p => p.id === barbutTurn(b) && p.bot);
    return bot && !(b.money && !(bot.id in b.bets)) ? bot : null;
  }
  if (state?.game === 'ludo' && state.ludo.phase === 'roll') return state.players.find(p => p.bot && p.color === ludo.current(state.ludo)) ?? null;
  return null;
}
function botShake(v, dt) {
  const dice = v.content.dice, state = room?.state, bot = botAboutToRoll(state), now = performance.now();
  const key = bot ? `${bot.id}:${state.seq}` : null;
  if (v.botShake?.key !== key) {
    if (v.botShake?.on && !dice.busy) dice.hold(null);
    v.botShake = key ? { key, bot, since: now, idle: 0, on: false, rattle: 0 } : null;
  }
  const S = v.botShake;
  if (!S) return;
  S.idle = dice.busy ? 0 : S.idle + dt * 1000;
  if (!S.on) {
    if (now - S.since < BOT_PICKUP_MS || S.idle < BOT_IDLE_MS) return;
    S.on = true;
    S.at = botHandPoint(v, bot, state);
    $('#info-small').textContent = `${bot.name} agită zarurile…`;
  }
  // tremurat mai tare spre final, ca și cum s-ar pregăti să arunce
  const t = (now - S.since - BOT_PICKUP_MS) / 1000;
  const wobble = new THREE.Vector3(Math.sin(t * 17) * 0.012, Math.abs(Math.sin(t * 11)) * 0.015, Math.cos(t * 13) * 0.008).multiplyScalar(state.game === 'ludo' ? 0.6 : 1);
  dice.hold(S.at.clone().add(wobble), true);
  S.rattle -= dt;
  if (S.rattle <= 0) { sound.clack(0.2 + Math.random() * 0.25); S.rattle = 0.1 + Math.random() * 0.14; }
}
// unde „ține” calculatorul zarurile: la Ludo în dreptul locului lui, la zaruri vizavi de tine (ca să le vezi)
function botHandPoint(v, bot, state) {
  if (state.game === 'ludo') return SEAT[bot.color].clone().multiplyScalar(BOARD_SIZE * 0.36).setY(TOP_Y + 0.05);
  const cam = v.stage?.cameraLocal() ?? new THREE.Vector3(0, 0.4, 0.4);
  const away = new THREE.Vector3(-cam.x, 0, -cam.z);
  if (away.lengthSq() < 1e-6) away.set(0, 0, -1);
  away.normalize();
  const bots = state.players.filter(p => p.bot), i = bots.findIndex(p => p.id === bot.id);
  const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar((i - (bots.length - 1) / 2) * 0.09);
  return away.multiplyScalar(0.11).add(side).setY(0.07);
}

function mainAction() {
  const state = room?.state, self = me();
  if (!state || !self || !view || view.content?.busy) return;
  if (view.newGame && room.isHost) { view.newGame = false; return room.dispatch({ type: 'select', game: state.game }); }
  if (state.game === 'jenga') return pullSelected();
  if (state.game === 'barbut' && barbutTurn(state.barbut) === self.id) {
    throwDice();
  } else if (state.game === 'ludo' && state.ludo.phase === 'roll' && ludo.current(state.ludo) === self.color && !view.board.animating) {
    room.dispatch({ type: 'roll', values: [d6()] });
  }
}
$('#main-action').addEventListener('click', mainAction);
// Zarurile aruncate „pe bune”: dai cu degetul peste masă în direcția în care vrei să meargă (cât de repede = cât de tare),
// sau scuturi telefonul. Direcția și puterea pleacă la toți odată cu aruncarea (fling).
const myDiceTurn = () => room?.state.game === 'barbut' && barbutTurn(room.state.barbut) === room.selfId && view?.content && !view.content.busy && $('#bet-sheet').hidden;
function throwDice(fling) {
  if (!myDiceTurn()) return;
  room.dispatch({ type: 'roll', values: [d6(), d6()], fling });
}
const FLICK_MIN = 250; // px/s — mai încet nu e aruncare
function tablePoint(raycaster) {
  const g = view.content.group;
  g.updateMatrixWorld(true);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0).transformDirection(g.matrixWorld), g.getWorldPosition(new THREE.Vector3()));
  const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  return hit && g.worldToLocal(hit);
}
let flick = null; // urma degetului: [{ x, y, t, p }]
const flickSample = (raycaster, e) => ({ x: e.clientX, y: e.clientY, t: performance.now(), p: tablePoint(raycaster) });
function flickStart(raycaster, e) {
  if (!myDiceTurn()) return false;
  flick = [flickSample(raycaster, e)];
  return true;
}
function flickMove(raycaster, e) {
  flick?.push(flickSample(raycaster, e));
}
function flickEnd() {
  if (!flick) return;
  const samples = flick;
  flick = null;
  const last = samples.at(-1), first = samples.find(s => last.t - s.t < 150) ?? samples[0];
  if (Math.hypot(last.x - samples[0].x, last.y - samples[0].y) < 12) return throwDice(); // doar atingere
  const speed = Math.hypot(last.x - first.x, last.y - first.y) / Math.max((last.t - first.t) / 1000, 0.016);
  if (speed < FLICK_MIN) return toast('Dă mai repede cu degetul, ca și cum ai arunca.');
  const power = Math.max(0.25, Math.min(1, 0.25 + (speed - FLICK_MIN) / 2500));
  const dir = first.p && last.p ? last.p.clone().sub(first.p) : null;
  throwDice(dir && Math.hypot(dir.x, dir.z) > 1e-4 ? { x: dir.x, z: dir.z, power } : null);
}

// Cu mâna reală (AR): palma deschisă → zarurile îți apar în palmă; strângi pumnul → sunt în mână și le agiți
// (clinchet la fiecare schimbare de sens); deschizi mâna → le arunci de acolo, cu viteza mâinii.
// La fel la „Nu te supăra” (un zar): canThrow() = e rândul tău să dai cu zarul; onThrow(fling) = aruncarea.
const diceHands = hands => handDice(hands, myDiceTurn, throwDice, 'Zarurile sunt în palma ta');
// Palma, analizată mai atent:
//  - mâna cea mai apropiată de cameră (dacă vede două);
//  - deschis / închis după cât de întinse sunt degetele, în 3D (hands.js → openness), netezit și cu două praguri
//    (se închide sub CLOSE, se deschide peste OPEN; între ele rămâne cum era) + confirmat 2 cadre la rând,
//    ca să nu „pâlpâie” când mâna e pe jumătate strânsă;
//  - poziția palmei netezită (zarurile nu tremură, viteza aruncării iese curată).
const CLOSE = 1.3, OPEN = 1.55, SMOOTH = 0.45;
// zarul ținut în mână rămâne desenat în fața degetelor (gaură în silueta mâinii, vezi ar.js → handOcclusion)
const heldDiceHole = radius => () => {
  const H = view?.hand;
  return H?.pos && (H.state === 'palm' || H.state === 'fist') ? [{ world: view.content.group.localToWorld(H.pos.clone()), radius }] : [];
};
function handDice(hands, canThrow, onThrow, inPalm) {
  const v = view, dice = v.content.dice;
  const hand = hands.reduce((best, h) => (!best || h.depth < best.depth ? h : best), null);
  const H = (v.hand ??= { state: 'idle', track: [], shakes: 0 });
  if (!canThrow() || !hand) {
    if (H.state !== 'idle' && !v.content.busy) dice.hold(null);
    Object.assign(H, { state: 'idle', track: [], shakes: 0, pos: null, open: null, closed: false, votes: 0 });
    return;
  }
  const g = v.content.group, now = performance.now();
  // zarurile stau puțin în fața palmei (spre cameră), nu „în” ea
  const raw = g.worldToLocal(hand.world(hand.palm(), 0.02));
  H.pos = H.pos ? H.pos.lerp(raw, SMOOTH) : raw;
  H.open = H.open === null || H.open === undefined ? hand.open : H.open + (hand.open - H.open) * SMOOTH;
  // histerezis + 2 cadre la rând
  const wants = H.closed ? H.open > OPEN : H.open < CLOSE;
  H.votes = wants ? (H.votes ?? 0) + 1 : 0;
  if (H.votes >= 2) { H.closed = !H.closed; H.votes = 0; }
  const at = H.pos.clone();
  // urma: poziția brută (netezirea ar înmuia agitatul și ar întârzia viteza aruncării)
  H.track.push({ t: now, p: raw.clone() });
  while (H.track.length && now - H.track[0].t > 300) H.track.shift();
  if (H.closed) {
    if (H.state !== 'fist') Object.assign(H, { state: 'fist', since: now, shakes: 0, dir: 0 });
    dice.hold(at, true); // în pumn: tot le vezi, strânse, scuturându-se
    // agitat: schimbare de sens pe direcția mișcării, cu viteză destulă
    const prev = H.track.at(-3);
    if (prev) {
      const d = at.clone().sub(prev.p), speed = d.length() / ((now - prev.t) / 1000);
      const dir = Math.sign(d.x + d.y + d.z);
      if (speed > 0.25 && dir && dir !== H.dir) {
        if (H.dir) { H.shakes += 1; sound.clack(0.5); vibrate(15); }
        H.dir = dir;
      }
    }
    $('#info-small').textContent = H.shakes ? `Agită… (${H.shakes}) și deschide mâna spre masă ca să arunci!` : 'Agită pumnul!';
    return;
  }
  if (H.state === 'fist' && now - H.since > 300) {
    // deschis după pumn: aruncarea, cu viteza mâinii din ultimele ~150 ms
    const first = H.track.find(s => now - s.t < 150) ?? H.track[0];
    const vel = at.clone().sub(first.p).divideScalar(Math.max((now - first.t) / 1000, 0.05));
    if (Math.hypot(vel.x, vel.z) < 0.3) {
      // mâna aproape nemișcată: le lași să cadă spre mijlocul mesei
      const toCenter = new THREE.Vector3(-at.x, 0, -at.z);
      if (toCenter.lengthSq() > 1e-6) vel.add(toCenter.normalize().multiplyScalar(0.4));
    }
    const power = Math.min(1, 0.3 + H.shakes * 0.1);
    Object.assign(H, { state: 'idle', track: [], shakes: 0 });
    const dir = Math.hypot(vel.x, vel.z) > 1e-4 ? vel : new THREE.Vector3(0, 0, -1);
    // pleacă exact cum erau în mână (poziție + rotație), deci le vezi rostogolindu-se din palmă
    onThrow({ x: dir.x, z: dir.z, power, start: at.toArray(), vel: vel.toArray(), dice: dice.heldState() });
    return;
  }
  H.state = 'palm';
  dice.hold(at);
  $('#info-small').textContent = `${inPalm}. Strânge pumnul și agită!`;
}

// scuturat: accelerație (fără gravitație) peste ~14 m/s²; iPhone cere voie, o dată, dintr-o atingere
let lastShake = 0, shakeOn = false;
function onMotion(e) {
  const a = e.acceleration?.x != null ? e.acceleration : null, g = e.accelerationIncludingGravity;
  const force = a ? Math.hypot(a.x, a.y, a.z) : g?.x != null ? Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81) : 0;
  if (force < 14 || performance.now() - lastShake < 1500 || !myDiceTurn()) return;
  lastShake = performance.now();
  const from = view.stage?.cameraLocal() ?? new THREE.Vector3(0, 0, 1); // zarurile pleacă dinspre tine spre masă
  throwDice({ x: -from.x, z: -from.z, power: Math.min(1, 0.4 + (force - 14) / 25) });
}
addEventListener('pointerdown', () => {
  if (shakeOn || room?.state.game !== 'barbut') return;
  shakeOn = true;
  const listen = () => addEventListener('devicemotion', onMotion);
  const ask = window.DeviceMotionEvent?.requestPermission;
  if (ask) ask().then(r => { if (r === 'granted') listen(); else shakeOn = false; }).catch(() => { shakeOn = false; });
  else listen();
}, { capture: true });

// atingerea pe masă la X și 0 / Jenga nu aruncă nimic — acolo alegi celula sau piesa
const tapAction = () => { if (!['xo', 'jenga'].includes(room?.state.game)) mainAction(); };

function scoreChip(player, score, isTurn, extra = '') {
  return `<span class="pill ${isTurn ? 'turn' : ''}">${dot(player.color)}${escapeHtml(player.name)}${player.id === room.selfId ? ' (tu)' : ''} <strong>${score}</strong>${extra}</span>`;
}

function renderBarbut(state, self) {
  const b = state.barbut;
  const turn = barbutTurn(b);
  const lei = v => `${v > 0 ? '+' : ''}${leiText(v)}`;
  $('#scoreboard').innerHTML = state.players.map(p => scoreChip(p, b.scores[p.id] ?? 0, p.id === turn, b.money ? ` · ${lei(b.balance[p.id] ?? 0)}` : '')).join('');
  const r = b.result;
  // cine cât a câștigat / pierdut runda trecută
  const pay = b.payout;
  const payout = b.money && pay && r?.type === 'win' && r.id === pay.winner
    ? (pay.won > 0
      ? `${nm(pay.winner)} câștigă ${leiText(pay.won)} (${Object.entries(pay.lost).map(([id, v]) => `${nm(id)} −${leiText(v)}`).join(', ')}). `
      : `${nm(pay.winner)} își ia pariul înapoi (${leiText(pay.pot)}). `)
    : '';
  const next = turn !== self.id ? `Urmează: ${nm(turn)}.`
    : view.mode === 'screen' ? 'E rândul tău — dă cu degetul peste masă, scutură telefonul sau apasă „Aruncă”.'
      : 'E rândul tău — arată palma în fața camerei: zarurile îți apar în mână.';
  const thrown = Object.keys(b.rolls).length > 0; // runda curentă a început
  let big, small;
  if (thrown && state.roll) {
    // tocmai a aruncat cineva: punctele lui, din prima
    const [x, y] = state.roll.values;
    big = `${state.roll.by === self.id ? 'Ai dat' : `${nm(state.roll.by)} a dat`} ${x} + ${y} = ${x + y} puncte`;
    small = next;
  } else if (r?.type === 'win') {
    outcome(`zaruri-${b.round}`, r.id === self.id);
    big = `${ic('trophy')} ${r.id === self.id ? 'Ai câștigat runda' : `${nm(r.id)} câștigă runda`}`;
    small = `Cu ${r.sum} puncte. ${payout}${next}`;
  } else if (r?.type === 'tie') {
    big = `Egalitate la ${r.sum}`;
    small = `Mai aruncă doar: ${r.ids.map(nm).join(', ')}. ${next}`;
  } else {
    big = `Runda ${b.round}`;
    small = next;
  }
  $('#info-big').innerHTML = big;
  $('#info-small').innerHTML = small;
  // punctele fiecăruia în runda asta (sau în cea abia încheiată, cu câștigătorul evidențiat)
  const rolls = thrown ? b.rolls : b.lastRolls;
  const winner = !thrown && r?.type === 'win' ? r.id : null;
  const points = state.players.filter(p => rolls[p.id]).map(p => {
    const [x, y] = rolls[p.id];
    return `<span class="pill ${p.id === winner ? 'win' : ''}">${p.id === winner ? ic('trophy') : ''}${escapeHtml(p.name)}: ${x} + ${y} = <strong>${x + y}</strong></span>`;
  });
  const bets = b.money ? Object.entries(b.bets).map(([id, v]) => `<span class="pill">${ic('money')}${nm(id)}: <strong>${leiText(v)}</strong></span>`) : [];
  $('#picks').innerHTML = points.join('') + bets.join('');
  view.newGame = false;
  $('#main-action').innerHTML = label('dice-five', 'Aruncă');
  $('#main-action').hidden = turn !== self.id;
  // pariul se pune înainte să arunci
  const canBet = b.money && b.contenders.includes(self.id) && !(self.id in b.rolls);
  $('#bet-button').hidden = !canBet;
  $('#bet-button').innerHTML = label('hand-coins', b.bets[self.id] ? `Pariul tău: ${leiText(b.bets[self.id])} · mai pune` : 'Pune bani');
  $('#money-button').classList.toggle('on', b.money);
  $('#rps-bot').hidden = true;
  $('#pawn-buttons').innerHTML = '';
  $('#bet-total').textContent = leiText(b.bets[self.id] ?? 0);
  $('#bet-clear').hidden = !b.bets[self.id];
}

// ---------------------------------------------------------------- pariuri cu bancnote (barbut)

$('#money-button').addEventListener('click', () => {
  const b = room.state.barbut;
  room.dispatch({ type: 'money', on: !b.money });
  toast(b.money ? 'Pariurile sunt oprite.' : 'Zaruri pe bani: fiecare pune bancnota înainte să arunce.');
});
$('#bet-notes').innerHTML = NOTES.map(v => `<button class="btn" data-note="${v}">${leiText(v)}</button>`).join('');
$('#bet-panel').querySelector('#bet-hint').insertAdjacentHTML('beforebegin', '<p class="muted">Pariul tău: <b id="bet-total">0 lei</b></p>');

let bet = null; // { stream, timer, canvas, seen }
async function openBetSheet() {
  if (bet) return;
  bet = { canvas: document.createElement('canvas'), seen: null, streak: 0 };
  $('#bet-sheet').hidden = false;
  $('#bet-seen').textContent = 'Încarc recunoașterea bancnotelor…';
  banknotes.preload().catch(error => console.warn(error));
  const video = $('#bet-video');
  try {
    // pe iPhone nu merg două camere deodată: folosim fluxul camerei scenei, dacă e pornită; 8th Wall își
    // ține camera pentru el, așa că îl punem pe pauză cât pui banii
    const shared = view?.stage?.video?.srcObject;
    if (!shared) view?.stage?.pause?.();
    if (shared) video.srcObject = shared;
    else if (testVideo) { video.src = testVideo; video.loop = true; } else {
      bet.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = bet.stream;
    }
    await video.play();
  } catch (error) {
    $('#bet-seen').textContent = 'Nu merge camera — alege valoarea de jos.';
    return;
  }
  const tick = async () => {
    if (!bet) return;
    try { await scanNote(); } catch (error) { console.warn(error); }
    if (bet) bet.timer = setTimeout(tick, 350);
  };
  tick();
}
function closeBetSheet() {
  if (!bet) return;
  view?.stage?.resume?.();
  clearTimeout(bet.timer);
  bet.stream?.getTracks().forEach(t => t.stop());
  const video = $('#bet-video');
  video.srcObject = null;
  video.removeAttribute('src');
  bet = null;
  $('#bet-sheet').hidden = true;
}
// ce e în chenar, decupat din video (care e afișat „cover”)
function cropGuide() {
  const video = $('#bet-video'), guide = $('#bet-guide');
  if (!video.videoWidth) return null;
  const area = $('#bet-view').getBoundingClientRect(), g = guide.getBoundingClientRect();
  const scale = Math.max(area.width / video.videoWidth, area.height / video.videoHeight);
  const offX = (area.width - video.videoWidth * scale) / 2, offY = (area.height - video.videoHeight * scale) / 2;
  // luăm și puțin din jurul chenarului (15%): rețeaua recunoaște mai sigur o bancnotă „pe masă” decât una decupată la milimetru
  const pad = 0.15;
  const sw = g.width / scale * (1 + 2 * pad), sh = g.height / scale * (1 + 2 * pad);
  const sx = (g.left - area.left - offX) / scale - g.width / scale * pad, sy = (g.top - area.top - offY) / scale - g.height / scale * pad;
  const c = bet.canvas;
  c.width = 320;
  c.height = 160;
  c.getContext('2d', { willReadFrequently: true }).drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
async function scanNote() {
  const canvas = cropGuide();
  if (!canvas) return;
  const found = await banknotes.recognize(canvas);
  if (!bet) return;
  // cerem aceeași valoare de două ori la rând, ca să nu sară eticheta
  const value = found?.value ?? null;
  bet.streak = value !== null && value === bet.last ? bet.streak + 1 : 0;
  bet.last = value;
  if (value !== null && bet.streak >= 1) {
    bet.seen = value;
    $('#bet-seen').textContent = `Văd: ${leiText(value)}`;
    $('#bet-confirm').innerHTML = label('check', `Pun ${leiText(value)}`);
    $('#bet-confirm').disabled = false;
  } else if (value === null) {
    bet.seen = null;
    $('#bet-seen').textContent = 'Pune bancnota în chenar';
    $('#bet-confirm').textContent = 'Caut bancnota…';
    $('#bet-confirm').disabled = true;
  }
}
function placeBet(value) {
  room.dispatch({ type: 'bet', amount: value });
  toast(`Ai pus ${leiText(value)}.`);
}
$('#bet-button').addEventListener('click', openBetSheet);
$('#bet-done').addEventListener('click', closeBetSheet);
$('#bet-clear').addEventListener('click', () => {
  closeBetSheet();
  room.dispatch({ type: 'bet-clear' });
  toast('Pariul a fost anulat.');
});
$('#bet-confirm').addEventListener('click', () => { if (bet?.seen) placeBet(bet.seen); });
$('#bet-notes').addEventListener('click', async event => {
  const value = Number(event.target.closest('[data-note]')?.dataset.note);
  if (!value) return;
  if ($('#bet-teach').checked) {
    const canvas = bet && cropGuide();
    if (!canvas) return toast('Pornește camera întâi.');
    toast('Învăț bancnota…');
    await banknotes.teach(canvas, value);
    toast(`Am învățat ${leiText(value)} (${banknotes.learned().filter(r => r.value === value).length} exemple).`);
  } else {
    placeBet(value);
  }
});

// ---------------------------------------------------------------- Nu te supăra, frate

function syncBoard() {
  const v = view, state = room?.state;
  if (!v?.board || !state?.ludo || v.content.dice.busy || v.appliedLudoSeq === state.seq) return;
  v.appliedLudoSeq = state.seq;
  v.board.setState(state.ludo);
  const self = me(), L = state.ludo;
  const mine = L.phase === 'move' && ludo.current(L) === self.color;
  const moves = mine ? ludo.legalMoves(L, self.color, L.die) : [];
  v.board.highlight(self.color, moves.map(m => m.pawn));
  if (!v.pawnGrab) v.board.marks(self.color, moves); // cât ții un pion, nu refacem marcajele de sub el
}

// „Nu te supăra” cu mâna: zarul din palmă (ca la zaruri), iar pionul îl ciupești, îl duci deasupra tablei
// (inelul verde arată unde ajunge) și desfaci degetele.
const myLudoRoll = () => {
  const L = room?.state.ludo;
  return room?.state.game === 'ludo' && L.phase === 'roll' && ludo.current(L) === me()?.color && !view.board.animating && !view.content.busy;
};
const ludoThrow = fling => { if (myLudoRoll()) room.dispatch({ type: 'roll', values: [d6()], fling }); };
function boardPoint(ray) {
  const g = view.content.group, local = g.worldToLocal(ray.ray.origin.clone()), far = g.worldToLocal(ray.ray.origin.clone().add(ray.ray.direction));
  const dir = far.sub(local);
  if (Math.abs(dir.y) < 1e-6) return null;
  const t = (TOP_Y + 0.02 - local.y) / dir.y;
  return t > 0 ? local.addScaledVector(dir, t) : null;
}
// Pionul îl muți tu: îl apuci (degetul pe ecran sau ciupit cu mâna), îl duci și îl lași pe căsuța colorată.
// Lăsat în altă parte → se întoarce. Aceleași trei funcții pentru atingere (content.drag) și pentru mână.
function pawnGrab(ray) {
  const L = room?.state.ludo, self = me();
  if (!L || L.phase !== 'move' || ludo.current(L) !== self?.color || view.board.animating || view.pawnGrab) return false;
  const pawn = view.board.pick(ray, self.color);
  const move = pawn === null ? null : ludo.legalMoves(L, self.color, L.die).find(m => m.pawn === pawn);
  if (!move) return false;
  view.pawnGrab = move;
  view.board.grab(self.color, pawn);
  sound.tick();
  $('#info-small').textContent = 'Du-l pe căsuța colorată și dă-i drumul.';
  return true;
}
function pawnCarry(ray) {
  if (!view.pawnGrab) return;
  const point = boardPoint(ray);
  if (!point) return;
  const over = view.board.carry(point);
  if (over !== view.pawnOver) {
    view.pawnOver = over;
    if (over) { sound.tick(); vibrate(15); }
    $('#info-small').textContent = over ? 'Aici! Dă-i drumul.' : 'Du-l pe căsuța colorată și dă-i drumul.';
  }
}
function pawnRelease() {
  const grab = view.pawnGrab;
  if (!grab) return;
  view.pawnGrab = null;
  view.pawnOver = false;
  if (view.board.carrying?.over) {
    view.board.drop();
    room.dispatch({ type: 'move', pawn: grab.pawn });
  } else {
    view.board.cancel();
    toast('Pune pionul pe căsuța colorată.');
    renderLudo(room.state, me());
  }
}
function ludoHands(hands) {
  const v = view, L = room?.state.ludo, self = me();
  if (!L || !self) return;
  if (L.phase === 'roll') return handDice(hands, myLudoRoll, ludoThrow, 'Zarul e în palma ta');
  const hand = hands.reduce((best, h) => (!best || h.depth < best.depth ? h : best), null);
  if (!hand) { if (v.pawnGrab && ++v.pawnLost > 6) pawnRelease(); return; }
  const ray = hand.ray(hand.mid(4, 8));
  if (hand.pinch) {
    v.pawnLost = 0;
    if (!v.pawnGrab) pawnGrab(ray);
    else pawnCarry(ray);
  } else if (v.pawnGrab && ++v.pawnLost >= 3) {
    pawnRelease();
  }
}

function pickPawn(raycaster) {
  const state = room?.state, self = me();
  if (!state?.ludo || state.ludo.phase !== 'move' || ludo.current(state.ludo) !== self.color) return false;
  const pawn = view.board.pick(raycaster, self.color);
  if (pawn === null) return false;
  room.dispatch({ type: 'move', pawn });
  return true;
}

function renderLudo(state, self) {
  const L = state.ludo;
  const color = ludo.current(L);
  const ownerOf = c => state.players.find(p => p.color === c);
  $('#scoreboard').innerHTML = L.order.map(c => ownerOf(c)).filter(Boolean)
    .map(p => scoreChip(p, `${L.pawns[p.color].filter(x => x >= ludo.TRACK).length}/4`, p.color === color && L.phase !== 'over')).join('');
  const mine = color === self.color;
  const current = ownerOf(color);
  let capture = '';
  if (L.last?.type === 'move' && L.last.captured.length) {
    capture = `Captură! Pionul lui ${L.last.captured.map(c => escapeHtml(ownerOf(c.color)?.name ?? '')).join(', ')} se întoarce la start. `;
  }
  if (L.phase !== 'over') view.outcome = null;
  else outcome('ludo', L.winner === self.color);
  if (L.phase === 'over') {
    $('#info-big').innerHTML = `${ic('trophy')} ${escapeHtml(ownerOf(L.winner)?.name ?? ludo.COLOR_NAMES[L.winner])} a câștigat`;
    $('#info-small').textContent = room.isHost ? 'Din meniu poți porni o partidă nouă.' : 'Gazda poate porni o partidă nouă.';
  } else {
    $('#info-big').textContent = mine ? 'E rândul tău' : `${current?.name ?? ''} e la rând`;
    $('#info-small').textContent = capture + (L.phase === 'roll'
      ? (mine ? (L.tries === 2 ? 'Mai ai 2 încercări să dai 6. ' : L.tries === 1 ? 'Mai ai o încercare să dai 6. ' : '') + (view.mode === 'screen' ? 'Dă cu zarul.' : 'Arată palma: zarul îți apare în mână.') : `${current?.name ?? ''} dă cu zarul…`)
      : (mine ? (view.mode === 'screen' ? `Ai dat ${L.die}. Trage un pion cu degetul pe căsuța colorată.` : `Ai dat ${L.die}. Ia un pion (cu degetul pe ecran sau ciupit cu mâna) și du-l pe căsuța colorată.`) : `${current?.name ?? ''} a dat ${L.die} și mută…`));
  }
  const moves = mine && L.phase === 'move' ? ludo.legalMoves(L, color, L.die) : [];
  $('#pawn-buttons').innerHTML = moves.map(m => `<button class="btn" data-pawn="${m.pawn}">Pionul ${m.pawn + 1}${m.from === ludo.YARD ? ' · iese' : m.to >= ludo.TRACK ? ' · la final' : ''}</button>`).join('');
  view.newGame = false;
  $('#main-action').innerHTML = label('dice-five', 'Dă cu zarul');
  $('#main-action').hidden = !(mine && L.phase === 'roll');
  newGameButton(L.phase === 'over');
  $('#rps-bot').hidden = true;
  $('#picks').innerHTML = '';
  syncBoard();
}
$('#pawn-buttons').addEventListener('click', event => {
  const pawn = event.target.closest('[data-pawn]')?.dataset.pawn;
  if (pawn !== undefined) room.dispatch({ type: 'move', pawn: Number(pawn) });
});

// ---------------------------------------------------------------- X și 0

// Cu degetul real: vârful arătătorului pus pe o căsuță a tablei (raza prin vârf lovește tabla exact sub deget).
// Ții degetul acolo DWELL_MS → pui X / 0. Apoi trebuie să ridici degetul de pe căsuță înainte de următoarea.
const DWELL_MS = 800;
function xoHands(hands) {
  const v = view, s = room?.state.xo, self = me();
  const mine = s && !s.winner && s.players[s.turn] === self?.id;
  const finger = hands.find(h => h.gesture !== 'Piatră'); // pumnul strâns nu arată nimic
  const cell = mine && finger ? v.xo.pick(finger.ray(8)) : null;
  const free = cell !== null && !s.cells[cell];
  const now = performance.now();
  if (!free || cell !== v.xoHover?.cell) v.xoHover = free ? { cell, since: now } : null;
  if (!free) v.xoArmed = true; // degetul a plecat de pe căsuță
  const h = v.xoHover;
  const progress = h ? Math.min(1, (now - h.since) / DWELL_MS) : 0;
  v.xo.hover(h && v.xoArmed ? h.cell : null, progress);
  if (h && v.xoArmed && progress >= 1) {
    v.xoArmed = false;
    v.xoHover = null;
    v.xo.hover(null);
    room.dispatch({ type: 'place', cell: h.cell });
  }
}

function pickCell(raycaster) {
  const state = room?.state, self = me();
  const s = state?.xo;
  if (!s || s.winner || s.players[s.turn] !== self.id) return false;
  const cell = view.xo.pick(raycaster);
  if (cell === null || s.cells[cell]) return false;
  room.dispatch({ type: 'place', cell });
  return true;
}

function renderXO(state, self) {
  const s = state.xo;
  const mark = id => (s.players[0] === id ? `<span style="color:#f87171">${ic('x-bold')}</span>` : s.players[1] === id ? `<span style="color:#60a5fa">${ic('circle-bold')}</span>` : ic('eye'));
  $('#scoreboard').innerHTML = state.players.map(p => `<span class="pill ${s.players[s.turn] === p.id && !s.winner ? 'turn' : ''}">${mark(p.id)}${escapeHtml(p.name)}${p.id === room.selfId ? ' (tu)' : ''}</span>`).join('');
  const mine = s.players[s.turn] === self.id;
  const placed = s.cells.filter(Boolean).length;
  if (placed > (view.xoPlaced ?? placed)) sound.tick();
  view.xoPlaced = placed;
  if (!s.winner) view.outcome = null;
  else if (s.players.includes(self.id)) outcome('xo', s.winner === 'draw' ? null : s.winner === self.id);
  if (s.winner) {
    $('#info-big').innerHTML = s.winner === 'draw' ? 'Remiză' : `${ic('trophy')} ${nm(s.winner)} a făcut linie`;
    $('#info-small').textContent = room.isHost ? '' : 'Gazda poate porni un joc nou.';
  } else if (!s.players.includes(self.id)) {
    $('#info-big').textContent = `${nameOf(s.players[s.turn])} e la rând`;
    $('#info-small').textContent = 'Joacă primii doi din cameră; tu te uiți.';
  } else {
    $('#info-big').innerHTML = mine ? `E rândul tău ${mark(self.id)}` : `${nm(s.players[s.turn])} e la rând`;
    $('#info-small').textContent = mine ? (view.mode === 'screen' ? 'Atinge o căsuță liberă de pe tablă.' : 'Pune degetul pe o căsuță liberă și ține-l o clipă (sau atinge ecranul).') : 'Trei în linie câștigă.';
  }
  $('#picks').innerHTML = '';
  $('#pawn-buttons').innerHTML = '';
  $('#rps-bot').hidden = true;
  view.newGame = false;
  $('#main-action').hidden = true;
  newGameButton(!!s.winner);
}

// ---------------------------------------------------------------- Jenga

function pickBlock(raycaster) {
  const state = room?.state, self = me();
  const j = state?.jenga;
  if (!j || j.phase !== 'pull' || jengaTurn(j) !== self.id || view.content.busy) return false;
  const block = view.jenga.pick(raycaster);
  if (block === null) return false;
  if (!jenga.pullable(j.slots, block)) {
    toast('Nu poți trage din vârful turnului.');
    return true;
  }
  view.jenga.select(view.jenga.selected === block ? null : block);
  renderJenga(state, self);
  return true;
}

function pullSelected() {
  const state = room.state, self = me(), j = state.jenga, block = view.jenga.selected;
  if (block === null || j.phase !== 'pull' || jengaTurn(j) !== self.id) return;
  // piesa iese spre tine: semnul vine din poziția camerei față de piesă, pe axa ei lungă
  const cam = view.stage?.cameraLocal() ?? new THREE.Vector3(0, 0, 1);
  const axis = jenga.axisOf(j.slots[block].level);
  const towards = cam.sub(view.jenga.blockPosition(block));
  const dir = towards.x * axis[0] + towards.z * axis[2] >= 0 ? 1 : -1;
  view.jenga.select(null);
  room.dispatch({ type: 'pull', block, dir, luck: Math.random() });
}

// Tras cu degetul: prinzi piesa și o scoți încet pe axa ei. Peste SAFE_SPEED turnul se clatină,
// iar la final „norocul” se micșorează proporțional (luck < risc = turnul cade), deci smucitul crește riscul.
const SAFE_SPEED = 0.12; // m/s — piesa (7,5 cm) scoasă în ~0,5 s
let pulling = null; // { block, t, offset, speed, maxSpeed }
// forced: piesa aleasă dinainte (cea țintită cu mâna), altfel cea atinsă
function grabBlock(raycaster, _event, forced = null) {
  const state = room?.state, self = me(), j = state?.jenga;
  if (!j || j.phase !== 'pull' || jengaTurn(j) !== self?.id || view.content.busy) return false;
  const block = forced ?? view.jenga.pick(raycaster);
  if (block === null || !jenga.pullable(j.slots, block)) return false; // atingerea normală spune de ce nu
  view.jenga.select(block);
  view.jenga.grab(block, raycaster);
  sound.tick();
  pulling = { block, t: performance.now(), offset: 0, maxSpeed: 0 };
  renderJenga(state, self);
  return true;
}
function dragBlock(raycaster, _event, depth = null) {
  if (!pulling) return;
  if (pulling.carrying) return view.jenga.carry(raycaster);
  const offset = view.jenga.drag(raycaster, depth), now = performance.now(), dt = (now - pulling.t) / 1000;
  if (dt < 0.04) return;
  const speed = Math.abs(offset - pulling.offset) / dt;
  Object.assign(pulling, { offset, t: now, maxSpeed: Math.max(pulling.maxSpeed, speed) });
  view.jenga.shake(speed / SAFE_SPEED - 1);
  $('#info-small').textContent = speed > SAFE_SPEED ? 'Prea repede — turnul se clatină!' : 'Încet… încet…';
  if (Math.abs(offset) >= jenga.L * 0.55) {
    // a ieșit: de-acum o duci tu sus; norocul se fixează acum, după cât de lin ai tras
    const steady = Math.max(0.35, Math.min(1, SAFE_SPEED / Math.max(pulling.maxSpeed, 1e-6)));
    Object.assign(pulling, { carrying: true, dir: Math.sign(offset), luck: Math.random() * steady });
    view.jenga.startCarry(jenga.nextSlot(room.state.jenga.slots, pulling.block));
    sound.wood(0.6);
    $('#info-small').textContent = 'A ieșit! Du-o sus, pe vârful turnului, și dă-i drumul.';
  }
}
function dropBlock() {
  if (!pulling) return;
  const { block, carrying, dir, luck } = pulling, moved = Math.abs(pulling.offset) > 0.003;
  pulling = null;
  if (carrying) {
    view.jenga.select(null);
    room.dispatch({ type: 'pull', block, dir, luck });
    return;
  }
  view.jenga.release();
  // doar atinsă (n-ai tras): rămâne aleasă, cu butonul „Trage piesa”; trasă pe jumătate: se întoarce la loc
  if (moved) view.jenga.select(null);
  renderJenga(room.state, me());
}

// Cu mâna reală: duci degetul mare și arătătorul în jurul unei piese → se colorează albastru (asta prinzi);
// ciupești → o apuci; muți mâna → o tragi / o duci; desfaci degetele → îi dai drumul.
// Ciupitul are două praguri (se prinde sub PINCH_ON, scapă abia peste PINCH_OFF) și „pâlpâie” uneori,
// așa că îi dăm drumul abia după 3 cadre deschise. Piesa țintită rămâne aleasă o clipă, cât închizi degetele.
const PINCH_ON = 0.6, PINCH_OFF = 0.8, AIM_KEEP_MS = 400;
function jengaHands(hands) {
  const v = view, hand = hands[0], now = performance.now();
  const j = room?.state.jenga, mine = j?.phase === 'pull' && jengaTurn(j) === room.selfId && !v.content.busy;
  if (!hand) {
    v.jenga.hover(null);
    v.aim = null;
    v.handAt = null;
    if (v.grab && ++v.grabLost > 6) { v.grab = false; dropBlock(); }
    return;
  }
  const ray = hand.ray(hand.mid(4, 8));
  const pinched = hand.pinchRatio < (v.grab ? PINCH_OFF : PINCH_ON);
  if (!v.grab) {
    const aim = mine ? v.jenga.nearest(ray, i => jenga.pullable(j.slots, i)) : null;
    if (aim !== null && !(pinched && v.aim)) {
      if (v.aim?.block !== aim) $('#info-small').textContent = 'Piesa albastră: ciupește-o (degetul mare + arătătorul) ca s-o prinzi.';
      v.aim = { block: aim, t: now };
    }
    else if (v.aim && (!mine || now - v.aim.t > AIM_KEEP_MS)) v.aim = null;
    v.jenga.hover(v.aim?.block ?? null);
  }
  if (pinched) {
    v.grabLost = 0;
    // unde e mâna în 3D (din mărimea palmei), netezit — cu ea tragi piesele orientate spre tine
    const g = v.content.group, at = g.worldToLocal(hand.world(hand.mid(4, 8)));
    v.handAt = v.handAt ? v.handAt.lerp(at, 0.35) : at;
    if (!v.grab && v.aim) {
      v.grab = grabBlock(ray, null, v.aim.block);
      if (v.grab) { v.jenga.hover(null); v.aim = null; v.grabAt = v.handAt.clone(); vibrate(15); }
    } else if (v.grab) {
      const axis = v.jenga.heldAxis;
      dragBlock(ray, null, axis && { offset: v.handAt.clone().sub(v.grabAt).dot(axis), weight: 1.4 });
    }
  } else if (v.grab && ++v.grabLost >= 3) {
    v.grab = false;
    dropBlock();
  }
}

function renderJenga(state, self) {
  const j = state.jenga;
  const turn = jengaTurn(j);
  $('#scoreboard').innerHTML = j.order.map(id => playerById(state, id)).filter(Boolean)
    .map(p => `<span class="pill ${p.id === turn && j.phase === 'pull' ? 'turn' : ''}">${dot(p.color)}${escapeHtml(p.name)}${p.id === room.selfId ? ' (tu)' : ''}${j.loser === p.id ? ` <span style="color:#f87171">${ic('warning-circle')}</span>` : ''}</span>`).join('');
  const mine = turn === self.id && j.phase === 'pull';
  const selected = view.jenga.selected;
  if (!mine && selected !== null) view.jenga.select(null);
  view.newGame = false;
  $('#main-action').hidden = true;
  if (j.phase !== 'over') view.outcome = null;
  else if (j.order.includes(self.id)) outcome('jenga', j.loser !== self.id);
  if (j.phase === 'over') {
    $('#info-big').innerHTML = `${ic('warning-circle')} Turnul a căzut`;
    $('#info-small').textContent = `${nameOf(j.loser)} a pierdut după ${j.moves} ${j.moves === 1 ? 'tragere' : 'trageri'}.`;
    newGameButton(true);
  } else if (mine) {
    $('#info-big').textContent = 'E rândul tău';
    if (selected !== null) {
      const o = jenga.outcome(j.slots, selected);
      $('#info-small').textContent = pulling?.carrying ? 'A ieșit! Du-o sus, pe vârful turnului, și dă-i drumul.' : pulling ? 'Încet… încet…' : `Risc ${o.stable ? Math.round(o.risk * 100) : 100}%. Trage piesa afară cu degetul, încet — sau apasă butonul.`;
      $('#main-action').innerHTML = label('hand-grabbing', 'Trage piesa');
      $('#main-action').hidden = false;
    } else {
      $('#info-small').textContent = view.mode === 'screen'
        ? 'Prinde o piesă cu degetul (nu din vârf), trage-o încet afară și du-o sus. Tras pe lângă turn îl rotește.'
        : 'Prinde o piesă între degetul mare și arătător (nu din vârf), scoate-o încet și du-o sus pe turn.';
    }
  } else {
    $('#info-big').textContent = `${nameOf(turn)} e la rând`;
    $('#info-small').textContent = `${j.moves} ${j.moves === 1 ? 'piesă trasă' : 'piese trase'} până acum.`;
  }
  $('#picks').innerHTML = '';
  $('#pawn-buttons').innerHTML = '';
  $('#rps-bot').hidden = true;
}

// ---------------------------------------------------------------- piatră-hârtie-foarfecă

async function startRpsCamera() {
  stopRpsCamera();
  const video = $('#rps-video');
  if (testVideo) {
    video.srcObject = null;
    video.src = testVideo;
    video.loop = true;
  } else {
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  }
  await playOrAsk(video);
}
// Camera pornește singură când intri în joc, nu dintr-o atingere; iPhone-ul (mai ales în Low Power Mode)
// refuză atunci să redea video-ul — îi cerem o atingere.
async function playOrAsk(video) {
  try {
    await video.play();
  } catch (error) {
    if (error.name !== 'NotAllowedError') throw error;
    const button = $('#rps-start');
    button.hidden = false;
    await new Promise((resolve, reject) => {
      button.onclick = () => { button.hidden = true; video.play().then(resolve, reject); };
    });
  }
}
function stopRpsCamera() {
  $('#rps-start').hidden = true;
  const video = $('#rps-video');
  video.srcObject?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
  video.removeAttribute('src');
}

async function startRpsView(v) {
  $('#rps-view').classList.add('show');
  v.hands = [];
  v.local = { phase: 'idle', since: 0, count: -1, mode: 'cpu', scores: { cpu: [0, 0], duo: [0, 0] } };
  const status = text => { if (view === v) $('#ar-status').textContent = text; };
  try {
    status('Pornesc camera…');
    await startRpsCamera();
    if (view !== v) return;
    status('Încarc recunoașterea mâinilor…');
    const stop = await trackHands({
      video: $('#rps-video'),
      canvas: $('#rps-canvas'),
      mirrored: () => false, // mereu camera din spate, fără oglindire
      onHands: hands => onHands(v, hands),
      onStatus: status,
    });
    if (view !== v) { stop(); return; }
    v.stopHands = stop;
    v.trackerReady = true;
    v.rps3d = createRpsScene($('#rps-view'), $('#rps-video'));
    status('');
    renderGame(room.state, me());
  } catch (error) {
    console.error(error);
    status('Nu merge camera sau recunoașterea: ' + (error.message || error));
  }
}
$('#rps-bot').addEventListener('click', () => room.dispatch({ type: 'add-bot' }));
const ARTICLE = { 'Piatră': 'Piatra', 'Hârtie': 'Hârtia', 'Foarfecă': 'Foarfeca' };

// Numărătoarea: 3… 2… 1… Acum! — câte o bătaie la 0,9 s, cu bip și vibrație (sound.js), ca să arătați gestul pe ritm.
// Gestul se citește puțin după „Acum!” (GRACE_MS), cât ajunge mâna în poziție.
const BEAT_MS = RPS_COUNTDOWN_MS / 3, GRACE_MS = 350;
// beat: 0, 1, 2 → „3”, „2”, „1”; 3 → „Acum!”; null → ascunde
function showBeat(beat) {
  const el = $('#rps-count');
  el.classList.remove('pop', 'go');
  if (beat === null) { el.textContent = ''; return; }
  el.textContent = beat < 3 ? String(3 - beat) : 'Acum!';
  void el.offsetWidth; // repornește animația
  el.classList.add('pop');
  el.classList.toggle('go', beat === 3);
  sound.beep(beat === 3);
  vibrate(beat === 3 ? 120 : 40);
}

const solo = () => room.state.players.length === 1;

function onHands(v, hands) {
  v.hands = hands;
  v.rps3d?.setHands(hands);
  if (view !== v) return;
  if (solo()) return localRound(v, hands);
  // multiplayer: spunem gazdei când avem mâna în cadru (stabil 300 ms), runda pornește când toți au
  const visible = hands.length > 0;
  const now = performance.now();
  if (visible !== v.lastVisible) { v.lastVisible = visible; v.visibleSince = now; }
  if (visible !== v.reported && now - v.visibleSince > 300) {
    v.reported = visible;
    room.dispatch({ type: 'hand', visible });
  }
  if (room.state.rps.phase === 'waiting') renderRps(room.state, me());
}

const myGesture = v => v.hands.find(h => h.gesture)?.gesture ?? null;

function renderRps(state, self) {
  const v = view;
  const s = state.rps;
  $('#rps-bot').hidden = !solo();
  $('#main-action').hidden = true;
  $('#pawn-buttons').innerHTML = '';
  if (solo()) return renderLocalIdle(v);
  setHtml('#scoreboard', state.players.map(p => scoreChip(p, s.scores[p.id] ?? 0, false, s.phase === 'waiting' && (s.ready[p.id] || p.bot) ? ic('hand-palm') : '')).join(''));
  const others = state.players.filter(p => p.id !== self.id);
  const outcomeOf = id => (s.result?.type === 'win' ? (s.result.winners.includes(id) ? 'win' : 'lose') : 'tie');
  if (s.phase === 'waiting') v.rps3d?.setOpponents([]);
  else if (s.phase === 'countdown') v.rps3d?.setOpponents(others.map(() => '?'));
  else if (s.phase === 'reveal' && v.clashRound !== s.round) {
    // adversarii își arată gestul, apoi ciocnirea: mâna ta (hand0) contra fiecăruia
    v.clashRound = s.round;
    const shown = others.filter(p => s.picks[p.id]);
    v.rps3d?.setOpponents(shown.map(p => s.picks[p.id]));
    v.rps3d?.clash({ hand0: outcomeOf(self.id), ...Object.fromEntries(shown.map((p, i) => [`opp${i}`, outcomeOf(p.id)])) });
  }
  if (s.phase === 'waiting') {
    const ready = state.players.filter(p => s.ready[p.id] || p.bot).length;
    $('#info-big').textContent = 'Arătați mâna!';
    $('#info-small').textContent = `Gata: ${ready} din ${state.players.length}. Runda pornește singură când toți au mâna în cadru.` + (myGesture(v) ? ` Tu: ${myGesture(v)}` : '');
    $('#picks').innerHTML = '';
  } else if (s.phase === 'countdown') {
    if (v.countdownRound !== s.round) runCountdown(v, s.round);
    $('#picks').innerHTML = '';
  } else if (s.phase === 'reveal') {
    const r = s.result;
    if (s.picks[self.id] !== undefined) outcome(`rps-${s.round}`, r.type === 'win' ? r.winners.includes(self.id) : null);
    $('#info-big').innerHTML = r.type !== 'win' ? 'Egalitate'
      : r.winners.includes(self.id) ? `${ic('trophy')} Ai câștigat${r.winners.length > 1 ? ` (cu ${r.winners.filter(id => id !== self.id).map(nm).join(', ')})` : ''}`
        : `${ic('trophy')} ${r.winners.map(nm).join(' și ')} câștigă`;
    $('#info-small').textContent = r.type === 'win' ? `${ARTICLE[r.gesture]} câștigă runda.` : 'Nimeni nu câștigă runda asta.';
    $('#picks').innerHTML = state.players.map(p => {
      const g = s.picks[p.id];
      return `<span class="pill ${r.winners.includes(p.id) ? 'win' : ''}">${escapeHtml(p.name)}: ${g ? `${ic(GESTURE_ICON[g])}${g}` : `${ic('question')}nimic`}</span>`;
    }).join('');
  }
}

function runCountdown(v, round) {
  v.countdownRound = round;
  $('#info-big').textContent = '';
  $('#info-small').textContent = 'Arată gestul pe „Acum!”';
  for (let beat = 0; beat <= 3; beat++) {
    setTimeout(() => { if (view === v && room.state.rps?.round === round) showBeat(beat); }, beat * BEAT_MS);
  }
  v.countdownTimer = setTimeout(() => {
    if (view !== v) return;
    showBeat(null);
    room.dispatch({ type: 'pick', round, gesture: myGesture(v) });
  }, RPS_COUNTDOWN_MS + GRACE_MS);
}

// Singur pe telefon: o mână = tu contra calculatorului; două mâini = doi jucători (stânga vs dreapta).
// Runda pornește singură când mâinile stau în cadru ~0.6 s.
const BEATS = { 'Piatră': 'Foarfecă', 'Foarfecă': 'Hârtie', 'Hârtie': 'Piatră' };
const GESTURE_LIST = ['Piatră', 'Hârtie', 'Foarfecă'];
function localRound(v, hands) {
  const L = v.local;
  const now = performance.now();
  if (L.phase === 'idle') {
    const count = Math.min(hands.length, 2);
    if (count !== L.count) { L.count = count; L.since = now; }
    if (count > 0 && now - L.since > 600) {
      L.phase = 'countdown';
      if (count === 1) v.rps3d?.setOpponents(['?']); // calculatorul se gândește
      L.mode = count === 2 ? 'duo' : 'cpu';
      L.started = now;
      L.beat = -1;
    }
  }
  if (L.phase === 'countdown') {
    const beat = Math.min(3, Math.floor((now - L.started) / BEAT_MS));
    if (beat !== L.beat) { L.beat = beat; showBeat(beat); }
    $('#info-big').textContent = '';
    $('#info-small').textContent = (L.mode === 'duo' ? 'Stânga contra dreapta' : 'Tu contra calculatorului') + ' · arată gestul pe „Acum!”';
    if (now - L.started > RPS_COUNTDOWN_MS + GRACE_MS) { showBeat(null); finishLocalRound(v, hands); }
  } else if (L.phase === 'cooldown' && now - L.started > 2500) {
    v.rps3d?.setOpponents([]);
    L.phase = 'idle';
    L.count = -1;
  }
  if (L.phase === 'idle') renderLocalIdle(v);
}
function finishLocalRound(v, hands) {
  const L = v.local;
  const score = L.scores[L.mode];
  if (L.mode === 'duo') {
    const [left, right] = hands.length >= 2 ? hands.map(h => h.gesture) : [];
    if (!left || !right) {
      $('#info-big').innerHTML = ic('question');
      $('#info-small').textContent = 'Nu am recunoscut ambele gesturi. Încă o dată!';
    } else {
      const w = left === right ? 0 : BEATS[left] === right ? -1 : 1;
      if (w < 0) score[0] += 1; else if (w > 0) score[1] += 1;
      $('#info-big').innerHTML = `${ic(GESTURE_ICON[left])} vs ${ic(GESTURE_ICON[right])}`;
      $('#info-small').textContent = w < 0 ? 'Stânga câștigă!' : w > 0 ? 'Dreapta câștigă!' : 'Egalitate';
      v.rps3d?.clash({ hand0: w < 0 ? 'win' : w > 0 ? 'lose' : 'tie', hand1: w > 0 ? 'win' : w < 0 ? 'lose' : 'tie' });
      if (w) celebrate();
    }
  } else {
    const mine = myGesture(v);
    if (!mine) {
      $('#info-big').innerHTML = ic('question');
      $('#info-small').textContent = 'Nu am recunoscut gestul. Ține mâna întreagă în cadru și încă o dată!';
    } else {
      const cpu = GESTURE_LIST[Math.floor(Math.random() * 3)];
      const w = mine === cpu ? 0 : BEATS[mine] === cpu ? -1 : 1;
      if (w < 0) score[0] += 1; else if (w > 0) score[1] += 1;
      $('#info-big').innerHTML = `${ic(GESTURE_ICON[mine])} vs ${ic(GESTURE_ICON[cpu])}`;
      $('#info-small').textContent = `Calculatorul: ${cpu}. ` + (w < 0 ? 'Ai câștigat!' : w > 0 ? 'Calculatorul câștigă.' : 'Egalitate.');
      v.rps3d?.setOpponents([cpu]);
      v.rps3d?.clash({ hand0: w < 0 ? 'win' : w > 0 ? 'lose' : 'tie', opp0: w > 0 ? 'win' : w < 0 ? 'lose' : 'tie' });
      if (w < 0) celebrate(); else if (w > 0) lost();
    }
  }
  L.phase = 'cooldown';
  L.started = performance.now();
  renderLocalScore(v);
}
function renderLocalScore(v) {
  const L = v.local;
  const html = L.mode === 'duo'
    ? `<span class="pill">Stânga <strong>${L.scores.duo[0]}</strong></span><span class="pill">Dreapta <strong>${L.scores.duo[1]}</strong></span>`
    : `<span class="pill">Tu <strong>${L.scores.cpu[0]}</strong></span><span class="pill">${ic('robot')}Calculator <strong>${L.scores.cpu[1]}</strong></span>`;
  setHtml('#scoreboard', html);
}
function renderLocalIdle(v) {
  renderLocalScore(v);
  const hands = v.hands ?? [];
  if (!v.trackerReady) return;
  $('#info-big').textContent = hands.length === 0 ? 'Arată mâna'
    : hands.length === 1 ? `Văd: ${hands[0].gesture ?? 'mâna'}`
      : `${hands[0].gesture ?? '?'} vs ${hands[1].gesture ?? '?'}`;
  $('#info-small').textContent = hands.length === 0
    ? 'O mână = tu contra calculatorului. Două mâini = doi jucători pe același telefon. Runda pornește singură.'
    : 'Ține mâna nemișcată — pornește runda…';
  $('#picks').innerHTML = '';
}

// ---------------------------------------------------------------- start

const begin = () => (myName ? startLocal() : askName());
// La pornire cerem camera (și, pe iPhone, giroscopul — trebuie cerut dintr-o atingere, înainte de orice await).
$('#camera-allow').addEventListener('click', async () => {
  window.DeviceOrientationEvent?.requestPermission?.().catch(() => {});
  window.DeviceMotionEvent?.requestPermission?.().catch(() => {});
  $('#camera-error').hidden = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    stream.getTracks().forEach(t => t.stop());
    begin();
  } catch (error) {
    $('#camera-error').textContent = `Fără cameră nu se poate juca (${error.name || error.message}). Permite camera pentru acest site — pe iPhone: „aA” în bara de adresă → Setări site → Cameră — și apasă din nou.`;
    $('#camera-error').hidden = false;
  }
});
if (SCREEN || testVideo) begin(); else showScreen('camera-screen');
