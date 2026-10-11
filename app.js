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
const EMOJI = { 'Piatră': '✊', 'Hârtie': '✋', 'Foarfecă': '✌️' };
const GAME_TITLES = { barbut: 'Barbut', rps: 'Piatră–Hârtie–Foarfecă', ludo: 'Nu te supăra, frate', xo: 'X și 0', jenga: 'Jenga' };

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
const dot = color => `<span class="dot" style="background:${ludo.COLOR_HEX[color]}"></span>`;
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
  // singur la barbut, „Nu te supăra” sau X și 0 → îți punem un calculator ca adversar
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
  // jucătorii ca etichete: a ta își schimbă culoarea la atingere, calculatorul se scoate cu ×
  $('#players').innerHTML = state.players.map(p => {
    const label = `${dot(p.color)}${escapeHtml(p.name)}${p.bot ? ' 🤖' : ''}`;
    if (p.id === self.id) return `<button class="pchip mine" id="my-chip" title="Schimbă culoarea">${label}</button>`;
    if (p.bot && room.isHost) return `<button class="pchip" data-kick="${p.id}" title="Scoate calculatorul">${label}<span class="x">×</span></button>`;
    return `<span class="pchip">${label}</span>`;
  }).join('') + (room.isHost && state.players.length < 4 ? '<button class="pchip" id="add-bot">+ Calculator</button>' : '');
  $('#games-title').textContent = room.isHost ? 'Ce jucăm?' : 'Jocuri';
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
  $('#flip-camera').hidden = game !== 'rps';
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
  $('#main-action').textContent = '🔄 Joc nou';
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
    v.content = { group: tower.group, footprint: tower.footprint, screen: tower.screen, get busy() { return tower.busy; }, pick: raycaster => pickBlock(raycaster), update: dt => { if (tower.update(dt)) settled(); } };
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
  $('#view-button').textContent = `${{ screen: '📱 Ecran', table: '🪑 Masă', marker: '🎯 Marker' }[v.mode]} ▾`;
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
  return `<span class="chip ${isTurn ? 'turn' : ''}">${dot(player.color)}${escapeHtml(player.name)}${player.id === room.selfId ? ' (tu)' : ''} · ${score}${extra}</span>`;
}

function renderBarbut(state, self) {
  const b = state.barbut;
  const turn = barbutTurn(b);
  const lei = v => `${v > 0 ? '+' : ''}${leiText(v)}`;
  $('#scoreboard').innerHTML = state.players.map(p => scoreChip(p, b.scores[p.id] ?? 0, p.id === turn, b.money ? ` · ${lei(b.balance[p.id] ?? 0)}` : '')).join('');
  const r = b.result;
  $('#info-big').textContent = r ? (r.type === 'win' ? `🏆 ${nameOf(r.id)} ia runda cu ${r.sum}!` : `Egalitate la ${r.sum}!`) : `Runda ${b.round}`;
  const tie = r?.type === 'tie' ? `Mai aruncă doar: ${r.ids.map(nameOf).join(', ')}. ` : '';
  // cine cât a câștigat / pierdut runda trecută
  const pay = b.payout;
  const payout = b.money && pay && r?.type === 'win' && r.id === pay.winner
    ? (pay.won > 0
      ? `💸 ${nameOf(pay.winner)} câștigă ${leiText(pay.won)} (${Object.entries(pay.lost).map(([id, v]) => `${nameOf(id)} −${leiText(v)}`).join(', ')}). `
      : `💸 ${nameOf(pay.winner)} își ia pariul înapoi (${leiText(pay.pot)}). `)
    : '';
  $('#info-small').textContent = payout + tie + (turn === self.id ? 'E rândul tău — apasă „Aruncă” sau atinge masa.' : `${nameOf(turn)} aruncă…`);
  const rolls = Object.keys(b.rolls).length ? b.rolls : b.lastRolls;
  const bets = b.money ? Object.entries(b.bets).map(([id, v]) => `<span class="chip">💵 ${escapeHtml(nameOf(id))}: ${leiText(v)}</span>`) : [];
  $('#picks').innerHTML = Object.entries(rolls).map(([id, [x, y]]) => `<span class="chip">${escapeHtml(nameOf(id))}: ${x} + ${y} = ${x + y}</span>`).join('') + bets.join('');
  view.newGame = false;
  $('#main-action').textContent = '🎲 Aruncă';
  $('#main-action').hidden = turn !== self.id;
  // pariul se pune înainte să arunci
  const canBet = b.money && b.contenders.includes(self.id) && !(self.id in b.rolls);
  $('#bet-button').hidden = !canBet;
  $('#bet-button').textContent = b.bets[self.id] ? `💵 Pariul tău: ${leiText(b.bets[self.id])} — mai pune` : '💵 Pune bani';
  $('#money-button').classList.toggle('on', b.money);
  $('#rps-bot').hidden = true;
  $('#pawn-buttons').innerHTML = '';
  if (!$('#bet-sheet').hidden) $('#bet-total').textContent = leiText(b.bets[self.id] ?? 0);
}

// ---------------------------------------------------------------- pariuri cu bancnote (barbut)

$('#money-button').addEventListener('click', () => {
  const b = room.state.barbut;
  room.dispatch({ type: 'money', on: !b.money });
  toast(b.money ? 'Pariurile sunt oprite.' : '💸 Barbut pe bani: fiecare pune bancnota înainte să arunce.');
});
$('#bet-notes').innerHTML = NOTES.map(v => `<button data-note="${v}">${leiText(v)}</button>`).join('');
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
  $('#bet-total').textContent = leiText(room.state.barbut.bets[room.selfId] ?? 0);
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
    $('#bet-confirm').textContent = `✅ Pun ${leiText(value)}`;
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
  toast(`💵 Ai pus ${leiText(value)}.`);
}
$('#bet-button').addEventListener('click', openBetSheet);
$('#bet-done').addEventListener('click', closeBetSheet);
$('#bet-clear').addEventListener('click', () => { room.dispatch({ type: 'bet-clear' }); toast('Pariul a fost anulat.'); });
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
    capture = `💥 Captură! Pionul lui ${L.last.captured.map(c => ownerOf(c.color)?.name ?? '').join(', ')} se întoarce la start. `;
  }
  if (L.phase === 'over') {
    $('#info-big').textContent = `🏆 ${ownerOf(L.winner)?.name ?? ludo.COLOR_NAMES[L.winner]} a câștigat!`;
    $('#info-small').textContent = room.isHost ? 'Din meniu poți porni o partidă nouă.' : 'Gazda poate porni o partidă nouă.';
  } else {
    $('#info-big').textContent = mine ? 'E rândul tău' : `${current?.name ?? ''} e la rând`;
    $('#info-small').textContent = capture + (L.phase === 'roll'
      ? (mine ? (L.tries === 2 ? 'Mai ai 2 încercări să dai 6. ' : L.tries === 1 ? 'Mai ai o încercare să dai 6. ' : '') + 'Dă cu zarul.' : `${current?.name ?? ''} dă cu zarul…`)
      : (mine ? `Ai dat ${L.die}. Alege pionul — atinge-l pe tablă sau mai jos.` : `${current?.name ?? ''} a dat ${L.die} și mută…`));
  }
  const moves = mine && L.phase === 'move' ? ludo.legalMoves(L, color, L.die) : [];
  $('#pawn-buttons').innerHTML = moves.map(m => `<button data-pawn="${m.pawn}">Pionul ${m.pawn + 1}${m.from === ludo.YARD ? ' · iese' : m.to >= ludo.TRACK ? ' · la final' : ''}</button>`).join('');
  view.newGame = false;
  $('#main-action').textContent = '🎲 Dă cu zarul';
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
  const mark = id => (s.players[0] === id ? '❌' : s.players[1] === id ? '⭕' : '👀');
  $('#scoreboard').innerHTML = state.players.map(p => `<span class="chip ${s.players[s.turn] === p.id && !s.winner ? 'turn' : ''}">${mark(p.id)} ${escapeHtml(p.name)}${p.id === room.selfId ? ' (tu)' : ''}</span>`).join('');
  const mine = s.players[s.turn] === self.id;
  if (s.winner) {
    $('#info-big').textContent = s.winner === 'draw' ? 'Remiză!' : `🏆 ${nameOf(s.winner)} a făcut linie!`;
    $('#info-small').textContent = room.isHost ? '' : 'Gazda poate porni un joc nou.';
  } else if (!s.players.includes(self.id)) {
    $('#info-big').textContent = `${nameOf(s.players[s.turn])} e la rând`;
    $('#info-small').textContent = 'Joacă primii doi din cameră; tu te uiți.';
  } else {
    $('#info-big').textContent = mine ? `E rândul tău ${mark(self.id)}` : `${nameOf(s.players[s.turn])} e la rând`;
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

function renderJenga(state, self) {
  const j = state.jenga;
  const turn = jengaTurn(j);
  $('#scoreboard').innerHTML = j.order.map(id => playerById(state, id)).filter(Boolean)
    .map(p => `<span class="chip ${p.id === turn && j.phase === 'pull' ? 'turn' : ''}">${dot(p.color)}${escapeHtml(p.name)}${p.id === room.selfId ? ' (tu)' : ''}${j.loser === p.id ? ' 💥' : ''}</span>`).join('');
  const mine = turn === self.id && j.phase === 'pull';
  const selected = view.jenga.selected;
  if (!mine && selected !== null) view.jenga.select(null);
  view.newGame = false;
  $('#main-action').hidden = true;
  if (j.phase === 'over') {
    $('#info-big').textContent = `💥 Turnul a căzut!`;
    $('#info-small').textContent = `${nameOf(j.loser)} a pierdut după ${j.moves} ${j.moves === 1 ? 'tragere' : 'trageri'}.`;
    newGameButton(true);
  } else if (mine) {
    $('#info-big').textContent = 'E rândul tău';
    if (selected !== null) {
      const o = jenga.outcome(j.slots, selected);
      $('#info-small').textContent = `Piesa aleasă — risc ${o.stable ? Math.round(o.risk * 100) : 100}%. Apasă „Trage piesa”.`;
      $('#main-action').textContent = '✋ Trage piesa';
      $('#main-action').hidden = false;
    } else {
      $('#info-small').textContent = 'Atinge o piesă din turn (nu din vârf). Trage cu degetul ca să rotești turnul.';
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

let rpsFacing = 'user';
async function startRpsCamera() {
  stopRpsCamera();
  const video = $('#rps-video');
  if (testVideo) {
    video.srcObject = null;
    video.src = testVideo;
    video.loop = true;
  } else {
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: rpsFacing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  }
  await video.play();
  $('#rps-view').classList.toggle('mirror', rpsFacing === 'user' && !testVideo);
}
function stopRpsCamera() {
  const video = $('#rps-video');
  video.srcObject?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
  video.removeAttribute('src');
  $('#rps-view').classList.remove('show');
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
      mirrored: () => $('#rps-view').classList.contains('mirror'),
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
$('#flip-camera').addEventListener('click', async () => {
  rpsFacing = rpsFacing === 'user' ? 'environment' : 'user';
  try { await startRpsCamera(); } catch (error) { toast(error.message); }
});
$('#rps-bot').addEventListener('click', () => room.dispatch({ type: 'add-bot' }));
const ARTICLE = { 'Piatră': 'Piatra', 'Hârtie': 'Hârtia', 'Foarfecă': 'Foarfeca' };

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
  $('#scoreboard').innerHTML = state.players.map(p => scoreChip(p, s.scores[p.id] ?? 0, false, s.phase === 'waiting' && (s.ready[p.id] || p.bot) ? ' ✋' : '')).join('');
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
    $('#info-big').textContent = r.type === 'win' ? `🏆 ${r.winners.map(nameOf).join(' și ')} câștigă!` : 'Egalitate!';
    $('#info-small').textContent = r.type === 'win' ? `${ARTICLE[r.gesture]} câștigă runda.` : 'Nimeni nu câștigă runda asta.';
    $('#picks').innerHTML = state.players.map(p => {
      const g = s.picks[p.id];
      return `<span class="chip ${r.winners.includes(p.id) ? 'win' : ''}">${escapeHtml(p.name)}: ${g ? `${EMOJI[g]} ${g}` : '🤷 nimic'}</span>`;
    }).join('');
  }
}

function runCountdown(v, round) {
  v.countdownRound = round;
  const words = ['Piatră…', 'Hârtie…', 'Foarfecă!'];
  const step = RPS_COUNTDOWN_MS / words.length;
  words.forEach((word, i) => setTimeout(() => {
    if (view === v && room.state.rps?.round === round) { $('#info-big').textContent = word; $('#info-small').textContent = ''; }
  }, i * step));
  v.countdownTimer = setTimeout(() => {
    if (view !== v) return;
    room.dispatch({ type: 'pick', round, gesture: myGesture(v) });
  }, RPS_COUNTDOWN_MS);
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
    }
  }
  if (L.phase === 'countdown') {
    const words = ['Piatră…', 'Hârtie…', 'Foarfecă!'];
    $('#info-big').textContent = words[Math.min(2, Math.floor((now - L.started) / (RPS_COUNTDOWN_MS / 3)))];
    $('#info-small').textContent = L.mode === 'duo' ? 'Doi jucători: stânga contra dreapta' : 'Tu contra calculatorului';
    if (now - L.started > RPS_COUNTDOWN_MS + 250) finishLocalRound(v, hands);
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
      $('#info-big').textContent = '🤷';
      $('#info-small').textContent = 'Nu am recunoscut ambele gesturi. Încă o dată!';
    } else {
      const w = left === right ? 0 : BEATS[left] === right ? -1 : 1;
      if (w < 0) score[0] += 1; else if (w > 0) score[1] += 1;
      $('#info-big').textContent = `${EMOJI[left]} vs ${EMOJI[right]}`;
      $('#info-small').textContent = w < 0 ? 'Stânga câștigă!' : w > 0 ? 'Dreapta câștigă!' : 'Egalitate';
    }
  } else {
    const mine = myGesture(v);
    if (!mine) {
      $('#info-big').textContent = '🤷';
      $('#info-small').textContent = 'Nu am recunoscut gestul. Ține mâna întreagă în cadru și încă o dată!';
    } else {
      const cpu = GESTURE_LIST[Math.floor(Math.random() * 3)];
      const w = mine === cpu ? 0 : BEATS[mine] === cpu ? -1 : 1;
      if (w < 0) score[0] += 1; else if (w > 0) score[1] += 1;
      $('#info-big').textContent = `${EMOJI[mine]} vs ${EMOJI[cpu]}`;
      $('#info-small').textContent = `Calculatorul: ${cpu}. ` + (w < 0 ? 'Ai câștigat!' : w > 0 ? 'Calculatorul câștigă.' : 'Egalitate.');
    }
  }
  L.phase = 'cooldown';
  L.started = performance.now();
  renderLocalScore(v);
}
function renderLocalScore(v) {
  const L = v.local;
  $('#scoreboard').innerHTML = L.mode === 'duo'
    ? `<span class="chip">Stânga · ${L.scores.duo[0]}</span><span class="chip">Dreapta · ${L.scores.duo[1]}</span>`
    : `<span class="chip">Tu · ${L.scores.cpu[0]}</span><span class="chip">Calculator · ${L.scores.cpu[1]}</span>`;
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
