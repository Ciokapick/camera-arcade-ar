// Interfața: nume → cameră (pe telefonul ăsta sau online) → joc.
// Starea jocului vine mereu de la gazdă (net.js + game.js); aici doar o arătăm și trimitem acțiuni.
import * as THREE from 'three';
import { hostRoom, joinRoom } from './net.js';
import { COLORS, RPS_COUNTDOWN_MS, barbutTurn, playerById } from './game.js';
import * as ludo from './ludo.js';
import { createDice } from './dice.js';
import { createBoard, SEAT, SIZE as BOARD_SIZE } from './board.js';
import { openStage, webXRSupported } from './ar.js';
import { trackHands } from './hands.js';

const $ = selector => document.querySelector(selector);
const testVideo = new URLSearchParams(location.search).get('test-video');
const storage = {
  get: key => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* mod privat */ } },
};
const d6 = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 6);
const EMOJI = { 'Piatră': '✊', 'Hârtie': '✋', 'Foarfecă': '✌️' };
const GAME_TITLES = { barbut: 'Barbut', rps: 'Piatră–Hârtie–Foarfecă', ludo: 'Nu te supăra, frate' };

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
  // singur la barbut sau „Nu te supăra” → îți punem un calculator ca adversar
  if (players === 1 && game !== 'rps') room.dispatch({ type: 'add-bot' });
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
  animateNewRoll(state);
  // nu stricăm surpriza: textele se actualizează după ce se opresc zarurile
  if (view.content?.dice.busy) { view.pending = true; return; }
  view.pending = false;
  if (state.game === 'barbut') renderBarbut(state, self);
  else renderLudo(state, self);
}

function settled() {
  if (view?.pending && room?.state.game === view.game) renderGame(room.state, me());
}

// ---------------------------------------------------------------- scena 3D (barbut + Nu te supăra)

function startStageView(v) {
  if (v.game === 'barbut') {
    const group = new THREE.Group();
    const dice = createDice(group, { count: 2, size: 0.035 });
    v.content = { group, dice, footprint: 0.16, update: dt => { if (dice.update(dt)) settled(); } };
  } else {
    const board = createBoard();
    v.board = board;
    v.content = {
      group: board.group,
      dice: board.dice,
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
      onTap: () => mainAction(),
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
  if (!state || !self || !view || view.content?.dice.busy) return;
  if (state.game === 'barbut' && barbutTurn(state.barbut) === self.id) {
    room.dispatch({ type: 'roll', values: [d6(), d6()] });
  } else if (state.game === 'ludo' && state.ludo.phase === 'roll' && ludo.current(state.ludo) === self.color && !view.board.animating) {
    room.dispatch({ type: 'roll', values: [d6()] });
  }
}
$('#main-action').addEventListener('click', mainAction);

function scoreChip(player, score, isTurn, extra = '') {
  return `<span class="chip ${isTurn ? 'turn' : ''}">${dot(player.color)}${escapeHtml(player.name)}${player.id === room.selfId ? ' (tu)' : ''} · ${score}${extra}</span>`;
}

function renderBarbut(state, self) {
  const b = state.barbut;
  const turn = barbutTurn(b);
  $('#scoreboard').innerHTML = state.players.map(p => scoreChip(p, b.scores[p.id] ?? 0, p.id === turn)).join('');
  const r = b.result;
  $('#info-big').textContent = r ? (r.type === 'win' ? `🏆 ${nameOf(r.id)} ia runda cu ${r.sum}!` : `Egalitate la ${r.sum}!`) : `Runda ${b.round}`;
  const tie = r?.type === 'tie' ? `Mai aruncă doar: ${r.ids.map(nameOf).join(', ')}. ` : '';
  $('#info-small').textContent = tie + (turn === self.id ? 'E rândul tău — apasă „Aruncă” sau atinge masa.' : `${nameOf(turn)} aruncă…`);
  const rolls = Object.keys(b.rolls).length ? b.rolls : b.lastRolls;
  $('#picks').innerHTML = Object.entries(rolls).map(([id, [x, y]]) => `<span class="chip">${escapeHtml(nameOf(id))}: ${x} + ${y} = ${x + y}</span>`).join('');
  $('#main-action').textContent = '🎲 Aruncă';
  $('#main-action').hidden = turn !== self.id;
  $('#rps-bot').hidden = true;
  $('#pawn-buttons').innerHTML = '';
}

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
  $('#main-action').textContent = '🎲 Dă cu zarul';
  $('#main-action').hidden = !(mine && L.phase === 'roll');
  $('#rps-bot').hidden = true;
  $('#picks').innerHTML = '';
  syncBoard();
}
$('#pawn-buttons').addEventListener('click', event => {
  const pawn = event.target.closest('[data-pawn]')?.dataset.pawn;
  if (pawn !== undefined) room.dispatch({ type: 'move', pawn: Number(pawn) });
});

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
  v.local = { phase: 'idle', since: 0, score: [0, 0] };
  try {
    await startRpsCamera();
    if (view !== v) return;
    const stop = await trackHands({ video: $('#rps-video'), canvas: $('#rps-canvas'), mirrored: () => $('#rps-view').classList.contains('mirror'), onHands: hands => onHands(v, hands) });
    if (view !== v) { stop(); return; }
    v.stopHands = stop;
  } catch (error) {
    console.error(error);
    if (view === v) toast('Nu pot porni camera: ' + (error.message || error));
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
  if (solo()) return localTwoHands(v, hands);
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
  if (solo()) return renderLocalTwoHands(v);
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

// singur pe telefon: doi jucători, câte o mână (stânga vs dreapta), ca înainte
const BEATS = { 'Piatră': 'Foarfecă', 'Foarfecă': 'Hârtie', 'Hârtie': 'Piatră' };
function localTwoHands(v, hands) {
  const L = v.local;
  const now = performance.now();
  if (L.phase === 'idle') {
    if (hands.length !== 2) { L.since = 0; }
    else {
      L.since ||= now;
      if (now - L.since > 600) {
        L.phase = 'countdown';
        L.started = now;
      }
    }
  }
  if (L.phase === 'countdown') {
    const words = ['Piatră…', 'Hârtie…', 'Foarfecă!'];
    const i = Math.min(2, Math.floor((now - L.started) / (RPS_COUNTDOWN_MS / 3)));
    $('#info-big').textContent = words[i];
    if (now - L.started > RPS_COUNTDOWN_MS + 250) {
      const [left, right] = hands.length === 2 ? hands.map(h => h.gesture) : [];
      if (!left || !right) {
        $('#info-big').textContent = '🤷';
        $('#info-small').textContent = 'Nu am recunoscut ambele gesturi. Încă o dată!';
      } else {
        const w = left === right ? 0 : BEATS[left] === right ? -1 : 1;
        if (w < 0) L.score[0] += 1; else if (w > 0) L.score[1] += 1;
        $('#info-big').textContent = `${EMOJI[left]} vs ${EMOJI[right]}`;
        $('#info-small').textContent = w < 0 ? 'Stânga câștigă!' : w > 0 ? 'Dreapta câștigă!' : 'Egalitate';
      }
      L.phase = 'cooldown';
      L.started = now;
      renderLocalScore(v);
    }
  } else if (L.phase === 'cooldown' && now - L.started > 2500) {
    L.phase = 'idle';
    L.since = 0;
  }
  if (L.phase === 'idle') renderLocalTwoHands(v);
}
function renderLocalScore(v) {
  $('#scoreboard').innerHTML = `<span class="chip">Stânga · ${v.local.score[0]}</span><span class="chip">Dreapta · ${v.local.score[1]}</span>`;
}
function renderLocalTwoHands(v) {
  renderLocalScore(v);
  if (v.local.phase !== 'idle') return;
  const hands = v.hands ?? [];
  $('#info-big').textContent = hands.length === 2 ? `${hands[0].gesture ?? '?'} vs ${hands[1].gesture ?? '?'}` : 'Arătați două mâini';
  $('#info-small').textContent = 'Doi jucători pe același telefon, câte o mână. Runda pornește singură.';
  $('#picks').innerHTML = '';
}

// ---------------------------------------------------------------- start

if (myName) startLocal(); else askName();
