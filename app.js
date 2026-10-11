// Interfața: nume → cameră (pe telefonul ăsta sau online) → joc.
// Starea jocului vine mereu de la gazdă (net.js + game.js); aici doar o arătăm și trimitem acțiuni.
import * as THREE from 'three';
import { hostRoom, joinRoom } from './net.js';
import { COLORS, NOTES, RPS_COUNTDOWN_MS, barbutTurn, jengaTurn, playerById } from './game.js';
import * as banknotes from './banknotes.js';
import * as ludo from './ludo.js';
import { createDice } from './dice.js';
import { createBoard, SEAT, SIZE as BOARD_SIZE } from './board.js';
import { createXO } from './xo-view.js';
import { createJenga } from './jenga-view.js';
import * as jenga from './jenga.js';
import { openStage, webXRSupported } from './ar.js';
import { trackHands } from './hands.js';

const $ = selector => document.querySelector(selector);
const testVideo = new URLSearchParams(location.search).get('test-video');
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

async function useRoom(open) {
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
    toast(error.message || 'Nu am putut intra în cameră');
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
  if (code.length !== 4) return toast('Codul are 4 litere');
  toast(`Intru în camera ${code}…`);
  useRoom(onState => joinRoom({
    code,
    name: myName,
    onState,
    onClose: () => { toast('Gazda a închis camera.'); startLocal(); },
  }));
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
  $('#room-hint').textContent = room.isHost
    ? 'Prietenii apasă „Am un cod” și scriu codul ăsta. Tu alegi jocul.'
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
  view = { game, mode: 'screen', animatedSeq: room.state.roll?.seq ?? 0, appliedLudoSeq: -1 };
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
  clearTimeout(v.countdownTimer);
  stopRpsCamera();
  showBeat(null);
  $('#rps-view').classList.remove('show');
  closeBetSheet();
  $('#stage-root').replaceChildren();
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

function settled() {
  if (view?.pending && room?.state.game === view.game) renderGame(room.state, me());
}

// ---------------------------------------------------------------- scena 3D (barbut + Nu te supăra)

function startStageView(v) {
  if (v.game === 'barbut') {
    const group = new THREE.Group();
    const dice = createDice(group, { count: 2, size: 0.035 });
    v.content = { group, dice, footprint: 0.16, get busy() { return dice.busy; }, update: dt => { if (dice.update(dt)) settled(); } };
  } else if (v.game === 'xo') {
    const cube = createXO();
    v.xo = cube;
    v.content = { group: cube.group, footprint: cube.footprint, busy: false, pick: raycaster => pickCell(raycaster), update: dt => cube.update(dt) };
  } else if (v.game === 'jenga') {
    const tower = createJenga();
    v.jenga = tower;
    v.content = {
      group: tower.group, footprint: tower.footprint, screen: tower.screen, get busy() { return tower.busy; },
      pick: raycaster => pickBlock(raycaster),
      drag: { start: grabBlock, move: dragBlock, end: dropBlock },
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
      update: dt => {
        if (board.update(dt)) settled();
        syncBoard();
      },
    };
    syncBoard();
  }
  openMode('screen');
}

async function openMode(mode) {
  const v = view;
  if (!v?.content || v.opening) return;
  v.opening = true;
  v.stage?.close();
  v.stage = null;
  $('#stage-root').replaceChildren();
  $('#ar-status').textContent = '';
  try {
    const real = mode !== 'table' ? mode : (!testVideo && await webXRSupported()) ? 'webxr' : 'slam';
    const stage = await openStage({
      root: $('#stage-root'),
      overlay: $('#ui'),
      mode: real,
      content: v.content,
      videoUrl: testVideo,
      status: text => { if (view === v) $('#ar-status').textContent = text; },
      // WebXR închis din sistem → revenim pe ecran
      setState: s => { if (s === 'closed' && view === v && v.stage === stage) { v.stage = null; openMode('screen'); } },
      onTap: tapAction,
    });
    if (view !== v) { stage.close(); return; }
    v.stage = stage;
    v.mode = mode;
  } catch (error) {
    console.error(error);
    if (view === v && mode !== 'screen') {
      toast('Nu am putut porni AR-ul: ' + (error.message || error));
      v.opening = false;
      return openMode('screen');
    }
  } finally {
    v.opening = false;
  }
  document.querySelectorAll('#sheet [data-mode]').forEach(b => b.classList.toggle('selected', b.dataset.mode === v.mode));
  $('#replace-table').hidden = v.mode !== 'table';
  $('#view-button').innerHTML = ic({ screen: 'device-mobile', table: 'cube-focus', marker: 'qr-code' }[v.mode]);
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
  else if (roll.by === room.selfId && view.stage) from = view.stage.cameraLocal();
  else {
    const angle = (roll.seq * 2.399) % (Math.PI * 2);
    from = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  }
  view.content.dice.throw({ values: roll.values, seed: roll.seq * 7919 + 17, from });
}

function mainAction() {
  const state = room?.state, self = me();
  if (!state || !self || !view || view.content?.busy) return;
  if (view.newGame && room.isHost) { view.newGame = false; return room.dispatch({ type: 'select', game: state.game }); }
  if (state.game === 'jenga') return pullSelected();
  if (state.game === 'barbut' && barbutTurn(state.barbut) === self.id) {
    room.dispatch({ type: 'roll', values: [d6(), d6()] });
  } else if (state.game === 'ludo' && state.ludo.phase === 'roll' && ludo.current(state.ludo) === self.color && !view.board.animating) {
    room.dispatch({ type: 'roll', values: [d6()] });
  }
}
$('#main-action').addEventListener('click', mainAction);
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
  const next = turn === self.id ? 'E rândul tău — apasă „Aruncă” sau atinge masa.' : `Urmează: ${nm(turn)}.`;
  const thrown = Object.keys(b.rolls).length > 0; // runda curentă a început
  let big, small;
  if (thrown && state.roll) {
    // tocmai a aruncat cineva: punctele lui, din prima
    const [x, y] = state.roll.values;
    big = `${state.roll.by === self.id ? 'Ai dat' : `${nm(state.roll.by)} a dat`} ${x} + ${y} = ${x + y} puncte`;
    small = next;
  } else if (r?.type === 'win') {
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
  // pe iPhone nu pot merge două camere deodată: AR-ul trece pe ecran cât pui banii
  if (view?.mode && view.mode !== 'screen') { toast('AR-ul trece pe ecran cât pui banii.'); await openMode('screen'); }
  bet = { canvas: document.createElement('canvas'), seen: null, streak: 0 };
  $('#bet-sheet').hidden = false;
  $('#bet-seen').textContent = 'Încarc recunoașterea bancnotelor…';
  banknotes.preload().catch(error => console.warn(error));
  const video = $('#bet-video');
  try {
    if (testVideo) { video.src = testVideo; video.loop = true; } else {
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
  v.board.highlight(self.color, mine ? ludo.legalMoves(L, self.color, L.die).map(m => m.pawn) : []);
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
  if (L.phase === 'over') {
    $('#info-big').innerHTML = `${ic('trophy')} ${escapeHtml(ownerOf(L.winner)?.name ?? ludo.COLOR_NAMES[L.winner])} a câștigat`;
    $('#info-small').textContent = room.isHost ? 'Din meniu poți porni o partidă nouă.' : 'Gazda poate porni o partidă nouă.';
  } else {
    $('#info-big').textContent = mine ? 'E rândul tău' : `${current?.name ?? ''} e la rând`;
    $('#info-small').textContent = capture + (L.phase === 'roll'
      ? (mine ? (L.tries === 2 ? 'Mai ai 2 încercări să dai 6. ' : L.tries === 1 ? 'Mai ai o încercare să dai 6. ' : '') + 'Dă cu zarul.' : `${current?.name ?? ''} dă cu zarul…`)
      : (mine ? `Ai dat ${L.die}. Alege pionul — atinge-l pe tablă sau mai jos.` : `${current?.name ?? ''} a dat ${L.die} și mută…`));
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
  if (s.winner) {
    $('#info-big').innerHTML = s.winner === 'draw' ? 'Remiză' : `${ic('trophy')} ${nm(s.winner)} a făcut linie`;
    $('#info-small').textContent = room.isHost ? '' : 'Gazda poate porni un joc nou.';
  } else if (!s.players.includes(self.id)) {
    $('#info-big').textContent = `${nameOf(s.players[s.turn])} e la rând`;
    $('#info-small').textContent = 'Joacă primii doi din cameră; tu te uiți.';
  } else {
    $('#info-big').innerHTML = mine ? `E rândul tău ${mark(self.id)}` : `${nm(s.players[s.turn])} e la rând`;
    $('#info-small').textContent = mine ? 'Atinge o căsuță liberă de pe tablă.' : 'Trei în linie câștigă.';
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
function grabBlock(raycaster) {
  const state = room?.state, self = me(), j = state?.jenga;
  if (!j || j.phase !== 'pull' || jengaTurn(j) !== self?.id || view.content.busy) return false;
  const block = view.jenga.pick(raycaster);
  if (block === null || !jenga.pullable(j.slots, block)) return false; // atingerea normală spune de ce nu
  view.jenga.select(block);
  view.jenga.grab(block, raycaster);
  pulling = { block, t: performance.now(), offset: 0, maxSpeed: 0 };
  renderJenga(state, self);
  return true;
}
function dragBlock(raycaster) {
  if (!pulling) return;
  const offset = view.jenga.drag(raycaster), now = performance.now(), dt = (now - pulling.t) / 1000;
  if (dt < 0.04) return;
  const speed = Math.abs(offset - pulling.offset) / dt;
  Object.assign(pulling, { offset, t: now, maxSpeed: Math.max(pulling.maxSpeed, speed) });
  view.jenga.shake(speed / SAFE_SPEED - 1);
  $('#info-small').textContent = speed > SAFE_SPEED ? 'Prea repede — turnul se clatină!' : 'Încet… încet…';
  if (Math.abs(offset) >= jenga.L * 0.55) {
    const { block, maxSpeed } = pulling;
    pulling = null;
    view.jenga.select(null);
    const steady = Math.max(0.35, Math.min(1, SAFE_SPEED / Math.max(maxSpeed, 1e-6)));
    room.dispatch({ type: 'pull', block, dir: Math.sign(offset), luck: Math.random() * steady });
  }
}
function dropBlock() {
  if (!pulling) return;
  const moved = Math.abs(pulling.offset) > 0.003;
  pulling = null;
  view.jenga.release();
  // doar atinsă (n-ai tras): rămâne aleasă, cu butonul „Trage piesa”; trasă pe jumătate: se întoarce la loc
  if (moved) view.jenga.select(null);
  renderJenga(room.state, me());
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
  if (j.phase === 'over') {
    $('#info-big').innerHTML = `${ic('warning-circle')} Turnul a căzut`;
    $('#info-small').textContent = `${nameOf(j.loser)} a pierdut după ${j.moves} ${j.moves === 1 ? 'tragere' : 'trageri'}.`;
    newGameButton(true);
  } else if (mine) {
    $('#info-big').textContent = 'E rândul tău';
    if (selected !== null) {
      const o = jenga.outcome(j.slots, selected);
      $('#info-small').textContent = pulling ? 'Încet… încet…' : `Risc ${o.stable ? Math.round(o.risk * 100) : 100}%. Trage piesa afară cu degetul, încet — sau apasă butonul.`;
      $('#main-action').innerHTML = label('hand-grabbing', 'Trage piesa');
      $('#main-action').hidden = false;
    } else {
      $('#info-small').textContent = 'Prinde o piesă cu degetul (nu din vârf) și trage-o încet afară. Tras pe lângă turn îl rotește.';
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
    status('');
    renderGame(room.state, me());
  } catch (error) {
    console.error(error);
    status('Nu merge camera sau recunoașterea: ' + (error.message || error));
  }
}
$('#rps-bot').addEventListener('click', () => room.dispatch({ type: 'add-bot' }));
const ARTICLE = { 'Piatră': 'Piatra', 'Hârtie': 'Hârtia', 'Foarfecă': 'Foarfeca' };

// Numărătoarea: 3… 2… 1… Acum! — câte o bătaie la 0,9 s, cu bip și vibrație, ca să arătați gestul pe ritm.
// Gestul se citește puțin după „Acum!” (GRACE_MS), cât ajunge mâna în poziție.
const BEAT_MS = RPS_COUNTDOWN_MS / 3, GRACE_MS = 350;
let audio = null;
// pe iPhone sunetul pornește doar după o atingere, așa că îl deblocăm la prima atingere din aplicație
addEventListener('pointerdown', () => {
  try { audio ??= new AudioContext(); audio.resume(); } catch { /* fără sunet */ }
}, { capture: true });
function beep(go) {
  navigator.vibrate?.(go ? 120 : 40);
  if (audio?.state !== 'running') return;
  const osc = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime;
  osc.frequency.value = go ? 1320 : 880;
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + (go ? 0.3 : 0.12));
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.3);
}
// beat: 0, 1, 2 → „3”, „2”, „1”; 3 → „Acum!”; null → ascunde
function showBeat(beat) {
  const el = $('#rps-count');
  el.classList.remove('pop', 'go');
  if (beat === null) { el.textContent = ''; return; }
  el.textContent = beat < 3 ? String(3 - beat) : 'Acum!';
  void el.offsetWidth; // repornește animația
  el.classList.add('pop');
  el.classList.toggle('go', beat === 3);
  beep(beat === 3);
}

const solo = () => room.state.players.length === 1;

function onHands(v, hands) {
  v.hands = hands;
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
    $('#info-big').innerHTML = r.type === 'win' ? `${ic('trophy')} ${r.winners.map(nm).join(' și ')} câștigă` : 'Egalitate';
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

if (myName) startLocal(); else askName();
