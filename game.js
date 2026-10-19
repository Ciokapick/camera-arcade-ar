// Starea unei camere de joc și toate regulile, ca reducer pur: (cameră, acțiune, cine) → cameră nouă.
// Gazda rulează reducer-ul și trimite starea tuturor; ceilalți doar trimit acțiuni.
// Fără DOM și fără rețea — testat în tests/game.test.mjs.
import * as ludo from './ludo.js';
import * as xo from './xo.js';
import * as jenga from './jenga.js';

export const COLORS = ludo.COLORS;
export const MAX_PLAYERS = 4;
export const GESTURES = ['Piatră', 'Hârtie', 'Foarfecă'];
const BEATS = { 'Piatră': 'Foarfecă', 'Foarfecă': 'Hârtie', 'Hârtie': 'Piatră' };
// cât durează (cu încetinitorul din dice.js) până se opresc zarurile, plus un pic să citești punctele
const DICE_SETTLE_MS = 3200;
export const RPS_COUNTDOWN_MS = 2700; // 3… 2… 1… (câte 0,9 s), apoi „Acum!”
// bancnotele românești în circulație (lei)
export const NOTES = [1, 5, 10, 20, 50, 100, 200, 500];

export function newRoom(host) {
  return { seq: 0, hostId: host.id, players: [{ id: host.id, name: host.name, color: COLORS[0], bot: false }], game: null, barbut: null, rps: null, ludo: null, xo: null, jenga: null, roll: null };
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
      return r.game === 'barbut' ? barbutRoll(r, me, a.values, a.fling) : r.game === 'ludo' ? ludoRoll(r, me, a.values, a.fling) : false;
    case 'move':
      if (r.game !== 'ludo' || !me || !ludo.move(r.ludo, me.color, a.pawn)) return false;
      return;
    case 'money':
      if (!isHost || r.game !== 'barbut') return false;
      r.barbut.money = !!a.on;
      if (!a.on) r.barbut.bets = {};
      return;
    case 'bet':
      return r.game === 'barbut' && me ? barbutBet(r, me, a.amount) : false;
    case 'bet-clear':
      if (r.game !== 'barbut' || !me || !(me.id in r.barbut.bets) || me.id in r.barbut.rolls) return false;
      delete r.barbut.bets[me.id];
      return;
    case 'place':
      return r.game === 'xo' && me ? xoPlace(r, me, a.cell) : false;
    case 'pull':
      return r.game === 'jenga' && me ? jengaPull(r, me, a) : false;
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
    r.barbut = { order: ids, contenders: [...ids], rolls: {}, lastRolls: {}, scores: zero(), round: 1, result: null, money: r.barbut?.money ?? false, bets: {}, balance: zero(), payout: null };
  } else if (game === 'rps') {
    r.rps = { phase: 'waiting', round: 0, ready: {}, picks: {}, scores: zero(), result: null };
  } else if (game === 'ludo') {
    if (r.players.length < 2) return false;
    r.ludo = ludo.newLudo(r.players);
  } else if (game === 'xo') {
    // joacă primii doi din cameră (X începe); ceilalți se uită
    if (r.players.length < 2) return false;
    r.xo = { players: ids.slice(0, 2), cells: Array(xo.CELLS).fill(null), turn: 0, winner: null, line: null, last: null };
  } else if (game === 'jenga') {
    r.jenga = { order: ids, turn: 0, slots: jenga.newTower(), phase: 'pull', loser: null, last: null, moves: 0 };
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
    r.barbut.balance[id] = 0;
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
    delete b.balance[id];
    delete b.bets[id];
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
  if (r.xo && r.xo.players.includes(id) && !r.xo.winner) {
    // a ieșit un jucător: celălalt câștigă
    r.xo.winner = r.xo.players.find(p => p !== id) ?? null;
  }
  if (r.jenga) {
    const j = r.jenga;
    const index = j.order.indexOf(id);
    if (index >= 0) {
      j.order.splice(index, 1);
      if (index < j.turn) j.turn -= 1;
      if (j.turn >= j.order.length) j.turn = 0;
    }
  }
}

// ---------------------------------------------------------------- X și 0 (cub 4×4×4)

function xoPlace(r, me, cell) {
  const s = r.xo;
  if (s.winner || s.players[s.turn] !== me.id || !Number.isInteger(cell) || cell < 0 || cell >= xo.CELLS || s.cells[cell]) return false;
  const mark = s.turn === 0 ? 'X' : 'O';
  s.cells[cell] = mark;
  s.last = cell;
  const win = xo.winner(s.cells);
  if (win) {
    s.winner = me.id;
    s.line = win.line;
  } else if (s.cells.every(Boolean)) {
    s.winner = 'draw';
  } else {
    s.turn = 1 - s.turn;
  }
}

// ---------------------------------------------------------------- Jenga

export const jengaTurn = j => j.order[j.turn] ?? null;

function jengaPull(r, me, { block, dir, luck }) {
  const j = r.jenga;
  if (j.phase !== 'pull' || jengaTurn(j) !== me.id || !jenga.pullable(j.slots, block)) return false;
  const from = j.slots[block];
  const o = jenga.outcome(j.slots, block);
  // luck vine de la cel care trage (0..1); sub risc = turnul se clatină și cade
  const fell = !o.stable || (Number(luck) < o.risk);
  j.slots = o.slots;
  j.moves += 1;
  j.last = { block, dir: dir < 0 ? -1 : 1, by: me.id, from, to: o.slots[block], fell, seq: r.seq + 1 };
  if (fell) {
    j.phase = 'over';
    j.loser = me.id;
  } else {
    j.turn = (j.turn + 1) % j.order.length;
  }
}

// ---------------------------------------------------------------- Barbut
// Fiecare aruncă două zaruri, pe rând; cea mai mare sumă ia runda.
// La egalitate pe primul loc, doar cei la egalitate mai aruncă o dată.

export const barbutTurn = b => b.contenders.find(id => !(id in b.rolls)) ?? null;

function validDice(values, count) {
  return Array.isArray(values) && values.length === count && values.every(v => Number.isInteger(v) && v >= 1 && v <= 6);
}

// fling: cum a aruncat (direcția pe masă x/z și puterea 0..1), ca toți să vadă aceeași aruncare
// din mână: start (unde era mâna, m) și vel (viteza ei, m/s), local față de masă — limitate la ceva rezonabil
function cleanFling(f) {
  const x = Number(f?.x), z = Number(f?.z), power = Number(f?.power);
  if (![x, z, power].every(Number.isFinite) || Math.hypot(x, z) < 1e-6) return null;
  const n = Math.hypot(x, z);
  const fling = { x: x / n, z: z / n, power: Math.max(0, Math.min(1, power)) };
  const vec = v => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.map(Number) : null);
  const start = vec(f.start), vel = vec(f.vel);
  if (start && vel) {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // mâna e între telefon și masă: cel mult ~1 m de centrul mesei, cel mult 80 cm deasupra ei
    const r = Math.hypot(start[0], start[2]), k = r > 1 ? 1 / r : 1;
    fling.start = [start[0] * k, clamp(start[1], 0.03, 0.8), start[2] * k];
    const speed = Math.hypot(...vel), m = speed > 2 ? 2 / speed : 1;
    fling.vel = vel.map(v => v * m);
    // fiecare zar cum era în mână: poziție (lângă start) și rotație (normalizată)
    if (Array.isArray(f.dice) && f.dice.length <= 2) {
      const dice = f.dice.map(d => ({ p: vec(d?.p), q: Array.isArray(d?.q) && d.q.length === 4 && d.q.every(Number.isFinite) ? d.q.map(Number) : null }));
      if (dice.every(d => d.p && d.q && Math.hypot(d.p[0] - start[0], d.p[1] - start[1], d.p[2] - start[2]) < 0.1)) {
        const shift = fling.start.map((v, i) => v - start[i]); // dacă startul a fost limitat, mutăm și zarurile
        fling.dice = dice.map(d => { const n = Math.hypot(...d.q) || 1; return { p: d.p.map((v, i) => v + shift[i]), q: d.q.map(v => v / n) }; });
      }
    }
  }
  return fling;
}

function barbutRoll(r, me, values, fling) {
  const b = r.barbut;
  if (barbutTurn(b) !== me.id || !validDice(values, 2)) return false;
  b.rolls[me.id] = values;
  r.roll = { by: me.id, values, seq: r.seq + 1, fling: cleanFling(fling) };
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
    // la egalitate potul rămâne pe masă pentru aruncarea de departajare
    b.result = { type: 'tie', ids: top, sum: best };
    b.contenders = top;
  } else {
    const winner = top[0];
    b.scores[winner] += 1;
    b.result = { type: 'win', id: winner, sum: best };
    b.contenders = [...b.order];
    b.round += 1;
    // pariuri: câștigătorul ia tot potul
    const pot = Object.values(b.bets).reduce((sum, v) => sum + v, 0);
    if (pot > 0) {
      const lost = Object.fromEntries(Object.entries(b.bets).filter(([id]) => id !== winner));
      for (const [id, amount] of Object.entries(lost)) b.balance[id] = (b.balance[id] ?? 0) - amount;
      b.balance[winner] = (b.balance[winner] ?? 0) + pot - (b.bets[winner] ?? 0);
      b.payout = { winner, pot, won: pot - (b.bets[winner] ?? 0), lost };
    } else {
      b.payout = null;
    }
    b.bets = {};
  }
}

// un pariu se pune cu bancnote, înainte să arunci (se adună dacă pui mai multe)
function barbutBet(r, me, amount) {
  const b = r.barbut;
  if (!b.money || !NOTES.includes(amount) || !b.contenders.includes(me.id) || me.id in b.rolls) return false;
  b.bets[me.id] = (b.bets[me.id] ?? 0) + amount;
}

// ---------------------------------------------------------------- Nu te supăra, frate

function ludoRoll(r, me, values, fling) {
  if (!validDice(values, 1) || !ludo.roll(r.ludo, me.color, values[0])) return false;
  r.roll = { by: me.id, values, seq: r.seq + 1, fling: cleanFling(fling) };
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
  // … și să se oprească zarurile aruncate înainte (ca să apuci să vezi punctele)
  if (room.roll && room.roll.seq !== memo.rollSeq) { memo.rollSeq = room.roll.seq; memo.rollAt = now; }
  const diceSettled = !room.roll || now - memo.rollAt > DICE_SETTLE_MS;
  if (room.game === 'barbut') {
    const b = room.barbut;
    const turn = barbutTurn(b);
    const bot = room.players.find(p => p.id === turn && p.bot);
    if (since('bot', !!bot) > 1200 && diceSettled) {
      // pe bani, calculatorul pune și el o bancnotă înainte să arunce
      out.push(b.money && !(bot.id in b.bets)
        ? { action: { type: 'bet', amount: [5, 10, 20, 50][Math.floor(rand() * 4)] }, from: bot.id }
        : { action: { type: 'roll', values: [die(), die()] }, from: bot.id });
    }
  }
  if (room.game === 'xo' && !room.xo.winner) {
    const s = room.xo;
    const bot = room.players.find(p => p.id === s.players[s.turn] && p.bot);
    if (since('bot', !!bot) > 900) out.push({ action: { type: 'place', cell: xo.botMove(s.cells, s.turn === 0 ? 'X' : 'O', rand) }, from: bot.id });
  }
  if (room.game === 'jenga' && room.jenga.phase === 'pull') {
    const j = room.jenga;
    const bot = room.players.find(p => p.id === jengaTurn(j) && p.bot);
    // așteaptă și animația piesei de dinainte
    if (since('bot', !!bot) > 2600) out.push({ action: { type: 'pull', block: jenga.botPull(j.slots, rand), dir: rand() < 0.5 ? -1 : 1, luck: rand() }, from: bot.id });
  }
  if (room.game === 'ludo' && room.ludo.phase !== 'over') {
    const s = room.ludo;
    const bot = room.players.find(p => p.color === ludo.current(s) && p.bot);
    if (since('bot', !!bot) > (s.phase === 'move' ? 700 : 1200) && diceSettled) {
      out.push(s.phase === 'roll'
        ? { action: { type: 'roll', values: [die()] }, from: bot.id }
        : { action: { type: 'move', pawn: ludo.botMove(s, bot.color) }, from: bot.id });
    }
  }
  return out;
}
