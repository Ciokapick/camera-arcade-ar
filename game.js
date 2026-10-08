// Starea unei camere de joc și toate regulile, ca reducer pur: (cameră, acțiune, cine) → cameră nouă.
// Gazda rulează reducer-ul și trimite starea tuturor; ceilalți doar trimit acțiuni.
// Fără DOM și fără rețea — testat în tests/game.test.mjs.
import * as ludo from './ludo.js';

export const COLORS = ludo.COLORS;
export const MAX_PLAYERS = 4;
export const GESTURES = ['Piatră', 'Hârtie', 'Foarfecă'];
const BEATS = { 'Piatră': 'Foarfecă', 'Foarfecă': 'Hârtie', 'Hârtie': 'Piatră' };
export const RPS_COUNTDOWN_MS = 2200; // „Piatră… Hârtie… Foarfecă!” pe fiecare telefon

export function newRoom(host) {
  return { seq: 0, hostId: host.id, players: [{ id: host.id, name: host.name, color: COLORS[0], bot: false }], game: null, barbut: null, rps: null, ludo: null, roll: null };
}

export const playerById = (room, id) => room.players.find(p => p.id === id);
const freeColor = room => COLORS.find(c => !room.players.some(p => p.color === c));
const cleanName = name => String(name || '').trim().slice(0, 20) || 'Jucător';

export function reduce(room, action, from) {
  const next = structuredClone(room);
  if (apply(next, action, from) === false) return room;
  next.seq += 1;
  return next;
}

function apply(r, a, from) {
  const me = playerById(r, from);
  const isHost = from === r.hostId;
  switch (a.type) {
    case 'join': {
      if (me) { me.name = cleanName(a.name); return; }
      if (r.players.length >= MAX_PLAYERS || r.game === 'ludo') return false;
      r.players.push({ id: from, name: cleanName(a.name), color: freeColor(r), bot: false });
      addToGames(r, from);
      return;
    }
    case 'add-bot': {
      if (!isHost || r.players.length >= MAX_PLAYERS || r.game === 'ludo') return false;
      const n = r.players.filter(p => p.bot).length + 1;
      const id = `bot-${r.seq}-${n}`;
      r.players.push({ id, name: `Calculator ${n}`, color: freeColor(r), bot: true });
      addToGames(r, id);
      return;
    }
    case 'leave':
    case 'kick': {
      const id = a.type === 'kick' ? a.id : from;
      if (a.type === 'kick' && !isHost) return false;
      if (!playerById(r, id) || id === r.hostId) return false;
      removePlayer(r, id);
      return;
    }
    case 'rename':
      if (!me) return false;
      me.name = cleanName(a.name);
      return;
    case 'color':
      if (!me || r.game === 'ludo' || !COLORS.includes(a.color) || r.players.some(p => p.color === a.color)) return false;
      me.color = a.color;
      return;
    case 'select':
      if (!isHost) return false;
      return startGame(r, a.game);
    case 'menu':
      if (!isHost) return false;
      r.game = null;
      return;
    case 'roll':
      if (!me) return false;
      return r.game === 'barbut' ? barbutRoll(r, me, a.values) : r.game === 'ludo' ? ludoRoll(r, me, a.values) : false;
    case 'move':
      if (r.game !== 'ludo' || !me || !ludo.move(r.ludo, me.color, a.pawn)) return false;
      return;
    case 'hand':
      if (r.game !== 'rps' || !me) return false;
      if (!!r.rps.ready[from] === !!a.visible) return false;
      r.rps.ready[from] = !!a.visible;
      return;
    case 'rps-start':
      if (!isHost || r.game !== 'rps' || r.rps.phase === 'countdown') return false;
      Object.assign(r.rps, { phase: 'countdown', round: r.rps.round + 1, picks: {}, result: null });
      // calculatorul „alege” la început (gazda trimite alegerile), ca să nu poată trișa după ce vede
      for (const p of r.players) if (p.bot) r.rps.picks[p.id] = GESTURES.includes(a.botPicks?.[p.id]) ? a.botPicks[p.id] : GESTURES[0];
      return;
    case 'pick': {
      const s = r.rps;
      if (r.game !== 'rps' || !me || s.phase !== 'countdown' || a.round !== s.round || from in s.picks) return false;
      s.picks[from] = GESTURES.includes(a.gesture) ? a.gesture : null;
      if (r.players.every(p => p.id in s.picks)) resolveRps(r);
      return;
    }
    case 'rps-resolve':
      if (!isHost || r.game !== 'rps' || r.rps.phase !== 'countdown') return false;
      resolveRps(r);
      return;
    case 'rps-next':
      if (!isHost || r.game !== 'rps' || r.rps.phase !== 'reveal') return false;
      r.rps.phase = 'waiting';
      return;
    default:
      return false;
  }
}

function startGame(r, game) {
  const ids = r.players.map(p => p.id);
  const zero = () => Object.fromEntries(ids.map(id => [id, 0]));
  if (game === 'barbut') {
    r.barbut = { order: ids, contenders: [...ids], rolls: {}, lastRolls: {}, scores: zero(), round: 1, result: null };
  } else if (game === 'rps') {
    r.rps = { phase: 'waiting', round: 0, ready: {}, picks: {}, scores: zero(), result: null };
  } else if (game === 'ludo') {
    if (r.players.length < 2) return false;
    r.ludo = ludo.newLudo(r.players);
  } else {
    return false;
  }
  r.game = game;
  r.roll = null;
}

function addToGames(r, id) {
  if (r.game === 'barbut') {
    r.barbut.order.push(id);
    r.barbut.scores[id] = 0;
  } else if (r.game === 'rps') {
    r.rps.scores[id] = 0;
  }
}

function removePlayer(r, id) {
  const player = playerById(r, id);
  r.players = r.players.filter(p => p.id !== id);
  if (r.barbut) {
    const b = r.barbut;
    b.order = b.order.filter(x => x !== id);
    b.contenders = b.contenders.filter(x => x !== id);
    delete b.rolls[id];
    delete b.scores[id];
    if (b.contenders.length && b.contenders.every(x => x in b.rolls)) resolveBarbut(r);
    if (!b.contenders.length) b.contenders = [...b.order];
  }
  if (r.rps) {
    delete r.rps.ready[id];
    delete r.rps.picks[id];
    delete r.rps.scores[id];
    if (r.rps.phase === 'countdown' && r.players.every(p => p.id in r.rps.picks)) resolveRps(r);
  }
  if (r.ludo) ludo.removeColor(r.ludo, player.color);
}

// ---------------------------------------------------------------- Barbut
// Fiecare aruncă două zaruri, pe rând; cea mai mare sumă ia runda.
// La egalitate pe primul loc, doar cei la egalitate mai aruncă o dată.

export const barbutTurn = b => b.contenders.find(id => !(id in b.rolls)) ?? null;

function validDice(values, count) {
  return Array.isArray(values) && values.length === count && values.every(v => Number.isInteger(v) && v >= 1 && v <= 6);
}

function barbutRoll(r, me, values) {
  const b = r.barbut;
  if (barbutTurn(b) !== me.id || !validDice(values, 2)) return false;
  b.rolls[me.id] = values;
  r.roll = { by: me.id, values, seq: r.seq + 1 };
  if (b.contenders.every(id => id in b.rolls)) resolveBarbut(r);
}

function resolveBarbut(r) {
  const b = r.barbut;
  const sum = id => b.rolls[id][0] + b.rolls[id][1];
  const best = Math.max(...b.contenders.map(sum));
  const top = b.contenders.filter(id => sum(id) === best);
  b.lastRolls = { ...b.rolls };
  b.rolls = {};
  if (top.length > 1) {
    b.result = { type: 'tie', ids: top, sum: best };
    b.contenders = top;
  } else {
    b.scores[top[0]] += 1;
    b.result = { type: 'win', id: top[0], sum: best };
    b.contenders = [...b.order];
    b.round += 1;
  }
}

// ---------------------------------------------------------------- Nu te supăra, frate

function ludoRoll(r, me, values) {
  if (!validDice(values, 1) || !ludo.roll(r.ludo, me.color, values[0])) return false;
  r.roll = { by: me.id, values, seq: r.seq + 1 };
}

// ---------------------------------------------------------------- Piatră-hârtie-foarfecă (2–4 jucători)
// Fiecare arată gestul pe telefonul lui. Dacă apar exact două gesturi diferite, câștigă cei cu gestul
// care îl bate pe celălalt; altfel (toți la fel sau toate trei) e egalitate. Cine n-a arătat nimic pierde runda.

export function rpsOutcome(picks) {
  const shown = Object.entries(picks).filter(([, g]) => g);
  const kinds = [...new Set(shown.map(([, g]) => g))];
  if (kinds.length !== 2) return { type: 'draw', winners: [] };
  const winning = BEATS[kinds[0]] === kinds[1] ? kinds[0] : kinds[1];
  return { type: 'win', gesture: winning, winners: shown.filter(([, g]) => g === winning).map(([id]) => id) };
}

function resolveRps(r) {
  const s = r.rps;
  for (const p of r.players) if (!(p.id in s.picks)) s.picks[p.id] = null;
  s.result = rpsOutcome(s.picks);
  for (const id of s.result.winners) s.scores[id] = (s.scores[id] ?? 0) + 1;
  s.phase = 'reveal';
}

// ---------------------------------------------------------------- Ceasul gazdei
// Ce trebuie să facă gazda singură, în timp: pornește runde PHF, închide rundele, joacă pentru calculator.
// Întoarce [{ action, from }] de aplicat. `memo` ține minte de când durează o stare.
export function hostTimers(room, now, memo, rand = Math.random) {
  const out = [];
  const host = room.hostId;
  const since = (key, active) => {
    if (!active) { delete memo[key]; return 0; }
    memo[key] ??= now;
    return now - memo[key];
  };
  if (room.game === 'rps') {
    const s = room.rps;
    const humans = room.players.filter(p => !p.bot);
    const allHands = room.players.length >= 2 && humans.every(p => s.ready[p.id]);
    if (since('rpsReady', s.phase === 'waiting' && allHands) > 700) {
      const botPicks = Object.fromEntries(room.players.filter(p => p.bot).map(p => [p.id, GESTURES[Math.floor(rand() * 3)]]));
      out.push({ action: { type: 'rps-start', botPicks }, from: host });
    }
    if (since('rpsCountdown', s.phase === 'countdown') > RPS_COUNTDOWN_MS + 2500) out.push({ action: { type: 'rps-resolve' }, from: host });
    if (since('rpsReveal', s.phase === 'reveal') > 3000) out.push({ action: { type: 'rps-next' }, from: host });
  }
  const die = () => 1 + Math.floor(rand() * 6);
  // botul așteaptă puțin la fiecare stare nouă, ca să se vadă ce face
  if (memo.botSeq !== room.seq) { delete memo.bot; memo.botSeq = room.seq; }
  if (room.game === 'barbut') {
    const turn = barbutTurn(room.barbut);
    const bot = room.players.find(p => p.id === turn && p.bot);
    if (since('bot', !!bot) > 1200) out.push({ action: { type: 'roll', values: [die(), die()] }, from: bot.id });
  }
  if (room.game === 'ludo' && room.ludo.phase !== 'over') {
    const s = room.ludo;
    const bot = room.players.find(p => p.color === ludo.current(s) && p.bot);
    if (since('bot', !!bot) > (s.phase === 'move' ? 700 : 1200)) {
      out.push(s.phase === 'roll'
        ? { action: { type: 'roll', values: [die()] }, from: bot.id }
        : { action: { type: 'move', pawn: ludo.botMove(s, bot.color) }, from: bot.id });
    }
  }
  return out;
}
