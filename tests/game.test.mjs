// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce, hostTimers, barbutTurn, rpsOutcome, RPS_COUNTDOWN_MS } from '../game.js';
import { botMove } from '../ludo.js';

const room = () => {
  let r = newRoom({ id: 'h', name: 'Denis' });
  r = reduce(r, { type: 'join', name: 'Ana' }, 'a');
  return r;
};

test('intrare în cameră: culori diferite, maxim 4, nume curățat', () => {
  let r = room();
  assert.deepEqual(r.players.map(p => p.color), ['rosu', 'albastru']);
  r = reduce(r, { type: 'join', name: '   ' }, 'b');
  r = reduce(r, { type: 'add-bot' }, 'h');
  assert.equal(r.players.length, 4);
  assert.equal(r.players[2].name, 'Jucător');
  const full = reduce(r, { type: 'join', name: 'X' }, 'x');
  assert.equal(full, r, 'camera plină: nimic nu se schimbă');
});

test('alegerea culorii: doar culori libere', () => {
  let r = room();
  assert.equal(reduce(r, { type: 'color', color: 'rosu' }, 'a'), r);
  r = reduce(r, { type: 'color', color: 'galben' }, 'a');
  assert.equal(r.players[1].color, 'galben');
});

test('doar gazda alege jocul și adaugă calculatoare', () => {
  const r = room();
  assert.equal(reduce(r, { type: 'select', game: 'barbut' }, 'a'), r);
  assert.equal(reduce(r, { type: 'add-bot' }, 'a'), r);
  assert.equal(reduce(r, { type: 'select', game: 'barbut' }, 'h').game, 'barbut');
});

test('barbut: pe rând, cea mai mare sumă ia runda', () => {
  let r = reduce(room(), { type: 'select', game: 'barbut' }, 'h');
  assert.equal(reduce(r, { type: 'roll', values: [6, 6] }, 'a'), r, 'nu e rândul Anei');
  r = reduce(r, { type: 'roll', values: [3, 4] }, 'h');
  assert.equal(barbutTurn(r.barbut), 'a');
  assert.equal(r.roll.by, 'h');
  r = reduce(r, { type: 'roll', values: [6, 2] }, 'a');
  assert.deepEqual(r.barbut.result, { type: 'win', id: 'a', sum: 8 });
  assert.equal(r.barbut.scores.a, 1);
  assert.equal(r.barbut.round, 2);
  assert.equal(barbutTurn(r.barbut), 'h');
});

test('barbut: la egalitate aruncă din nou doar cei la egalitate', () => {
  let r = reduce(room(), { type: 'join', name: 'Bob' }, 'b');
  r = reduce(r, { type: 'select', game: 'barbut' }, 'h');
  r = reduce(r, { type: 'roll', values: [5, 5] }, 'h');
  r = reduce(r, { type: 'roll', values: [1, 1] }, 'a');
  r = reduce(r, { type: 'roll', values: [6, 4] }, 'b');
  assert.deepEqual(r.barbut.result, { type: 'tie', ids: ['h', 'b'], sum: 10 });
  assert.equal(barbutTurn(r.barbut), 'h');
  r = reduce(r, { type: 'roll', values: [2, 2] }, 'h');
  assert.equal(reduce(r, { type: 'roll', values: [6, 6] }, 'a'), r, 'Ana nu mai e în joc runda asta');
  r = reduce(r, { type: 'roll', values: [3, 2] }, 'b');
  assert.deepEqual(r.barbut.result, { type: 'win', id: 'b', sum: 5 });
});

test('barbut: zaruri invalide refuzate', () => {
  const r = reduce(room(), { type: 'select', game: 'barbut' }, 'h');
  for (const values of [[7, 1], [1], [0, 3], ['6', 6]]) assert.equal(reduce(r, { type: 'roll', values }, 'h'), r);
});

test('barbut: dacă iese cel care trebuia să arunce, runda se închide', () => {
  let r = reduce(room(), { type: 'select', game: 'barbut' }, 'h');
  r = reduce(r, { type: 'roll', values: [2, 3] }, 'h');
  r = reduce(r, { type: 'leave' }, 'a');
  assert.equal(r.barbut.result.id, 'h');
});

test('PHF: rezultate pentru 2–4 jucători', () => {
  assert.deepEqual(rpsOutcome({ a: 'Piatră', b: 'Foarfecă' }), { type: 'win', gesture: 'Piatră', winners: ['a'] });
  assert.deepEqual(rpsOutcome({ a: 'Hârtie', b: 'Hârtie', c: 'Piatră' }), { type: 'win', gesture: 'Hârtie', winners: ['a', 'b'] });
  assert.equal(rpsOutcome({ a: 'Hârtie', b: 'Piatră', c: 'Foarfecă' }).type, 'draw');
  assert.equal(rpsOutcome({ a: 'Piatră', b: 'Piatră' }).type, 'draw');
  assert.deepEqual(rpsOutcome({ a: 'Piatră', b: null }), { type: 'draw', winners: [] });
});

test('PHF: runda pornește singură când toți au mâna în cadru', () => {
  let r = reduce(room(), { type: 'select', game: 'rps' }, 'h');
  const memo = {};
  r = reduce(r, { type: 'hand', visible: true }, 'h');
  assert.deepEqual(hostTimers(r, 0, memo), []);
  r = reduce(r, { type: 'hand', visible: true }, 'a');
  assert.deepEqual(hostTimers(r, 1000, memo), []);
  const [start] = hostTimers(r, 1800, memo);
  assert.equal(start.action.type, 'rps-start');
  r = reduce(r, start.action, start.from);
  assert.equal(r.rps.phase, 'countdown');
  assert.equal(reduce(r, { type: 'pick', round: 0, gesture: 'Piatră' }, 'h'), r, 'runda greșită');
  r = reduce(r, { type: 'pick', round: 1, gesture: 'Piatră' }, 'h');
  assert.equal(reduce(r, { type: 'pick', round: 1, gesture: 'Hârtie' }, 'h'), r, 'nu-ți schimbi alegerea');
  r = reduce(r, { type: 'pick', round: 1, gesture: 'Foarfecă' }, 'a');
  assert.equal(r.rps.phase, 'reveal');
  assert.deepEqual(r.rps.scores, { h: 1, a: 0 });
  // după reveal, gazda trece singură la runda următoare
  hostTimers(r, 2000, memo);
  const [next] = hostTimers(r, 5100, memo);
  assert.equal(next.action.type, 'rps-next');
});

test('PHF: cine nu trimite gestul la timp pierde runda', () => {
  let r = reduce(room(), { type: 'select', game: 'rps' }, 'h');
  r = reduce(r, { type: 'rps-start' }, 'h');
  r = reduce(r, { type: 'pick', round: 1, gesture: 'Hârtie' }, 'h');
  const memo = {};
  hostTimers(r, 0, memo);
  const [resolve] = hostTimers(r, RPS_COUNTDOWN_MS + 2600, memo);
  r = reduce(r, resolve.action, resolve.from);
  assert.equal(r.rps.phase, 'reveal');
  assert.equal(r.rps.picks.a, null);
  assert.equal(r.rps.result.type, 'draw', 'un singur gest arătat = nimeni nu bate pe nimeni');
});

test('PHF cu calculatorul: el alege la start, tu la final', () => {
  let r = newRoom({ id: 'h', name: 'Denis' });
  r = reduce(r, { type: 'add-bot' }, 'h');
  r = reduce(r, { type: 'select', game: 'rps' }, 'h');
  r = reduce(r, { type: 'hand', visible: true }, 'h');
  const memo = {};
  hostTimers(r, 0, memo, () => 0.1);
  const [start] = hostTimers(r, 800, memo, () => 0.1);
  r = reduce(r, start.action, start.from);
  const bot = r.players[1].id;
  assert.equal(r.rps.picks[bot], 'Piatră');
  r = reduce(r, { type: 'pick', round: 1, gesture: 'Hârtie' }, 'h');
  assert.deepEqual(r.rps.result.winners, ['h']);
});

test('Nu te supăra: minim 2 jucători, culorile din cameră', () => {
  const solo = newRoom({ id: 'h', name: 'Denis' });
  assert.equal(reduce(solo, { type: 'select', game: 'ludo' }, 'h'), solo);
  let r = reduce(room(), { type: 'color', color: 'verde' }, 'a');
  r = reduce(r, { type: 'select', game: 'ludo' }, 'h');
  assert.deepEqual(r.ludo.order, ['rosu', 'verde']);
  assert.equal(reduce(r, { type: 'join', name: 'Late' }, 'z'), r, 'nu intri în mijlocul partidei');
  assert.equal(reduce(r, { type: 'color', color: 'galben' }, 'a'), r, 'nu schimbi culoarea în timpul partidei');
});

test('Nu te supăra: aruncare și mutare prin cameră', () => {
  let r = reduce(room(), { type: 'select', game: 'ludo' }, 'h');
  assert.equal(reduce(r, { type: 'roll', values: [6] }, 'a'), r, 'nu e rândul Anei');
  r = reduce(r, { type: 'roll', values: [6] }, 'h');
  assert.equal(r.roll.values[0], 6);
  r = reduce(r, { type: 'move', pawn: 2 }, 'h');
  assert.deepEqual(r.ludo.pawns.rosu, [-1, -1, 0, -1]);
});

test('Nu te supăra: om + 2 calculatori, ceasul gazdei duce partida până la capăt', () => {
  let r = newRoom({ id: 'h', name: 'Denis' });
  r = reduce(r, { type: 'add-bot' }, 'h');
  r = reduce(r, { type: 'add-bot' }, 'h');
  assert.equal(reduce(r, { type: 'kick', id: 'h' }, 'h'), r, 'gazda nu poate fi scoasă');
  r = reduce(r, { type: 'select', game: 'ludo' }, 'h');
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const memo = {};
  let now = 0;
  for (let i = 0; i < 20000 && r.ludo.phase !== 'over'; i++) {
    now += 1500;
    const color = r.ludo.order[r.ludo.turn];
    if (color === 'rosu') {
      // omul (gazda) joacă la fel ca un calculator
      const action = r.ludo.phase === 'roll' ? { type: 'roll', values: [1 + Math.floor(rand() * 6)] } : { type: 'move', pawn: botMove(r.ludo, color) };
      const next = reduce(r, action, 'h');
      assert.notEqual(next, r);
      r = next;
      continue;
    }
    for (const { action, from } of hostTimers(r, now, memo, rand)) r = reduce(r, action, from);
  }
  assert.equal(r.ludo.phase, 'over');
});

test('X și 0: pe rând, X începe, câștig pe o linie de 4', () => {
  let r = reduce(room(), { type: 'select', game: 'xo' }, 'h');
  assert.equal(reduce(r, { type: 'place', cell: 0 }, 'a'), r, 'O nu începe');
  for (const [cell, who] of [[0, 'h'], [16, 'a'], [1, 'h'], [17, 'a'], [2, 'h'], [18, 'a']]) r = reduce(r, { type: 'place', cell }, who);
  assert.equal(reduce(r, { type: 'place', cell: 0 }, 'h'), r, 'celulă ocupată');
  r = reduce(r, { type: 'place', cell: 3 }, 'h');
  assert.equal(r.xo.winner, 'h');
  assert.deepEqual([...r.xo.line].sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.equal(reduce(r, { type: 'place', cell: 40 }, 'a'), r, 'jocul s-a terminat');
});

test('X și 0 cu calculatorul: partida se termină', () => {
  let r = newRoom({ id: 'h', name: 'Denis' });
  r = reduce(r, { type: 'add-bot' }, 'h');
  r = reduce(r, { type: 'add-bot' }, 'h');
  r = reduce(r, { type: 'select', game: 'xo' }, 'h');
  // gazda e X, primul calculator e O; gazda joacă și ea ca un calculator
  const memo = {};
  let now = 0;
  for (let i = 0; i < 200 && !r.xo.winner; i++) {
    now += 1000;
    if (r.xo.players[r.xo.turn] === 'h') r = reduce(r, { type: 'place', cell: r.xo.cells.indexOf(null) }, 'h');
    else for (const { action, from } of hostTimers(r, now, memo)) r = reduce(r, action, from);
  }
  assert.ok(r.xo.winner);
});

test('Jenga: pe rând; dacă turnul nu mai stă, cine a tras pierde', () => {
  let r = reduce(room(), { type: 'select', game: 'jenga' }, 'h');
  const at = (level, slot) => r.jenga.slots.findIndex(s => s.level === level && s.slot === slot);
  assert.equal(reduce(r, { type: 'pull', block: at(4, 1), dir: 1, luck: 0.9 }, 'a'), r, 'nu e rândul Anei');
  assert.equal(reduce(r, { type: 'pull', block: at(17, 1), dir: 1, luck: 0.9 }, 'h'), r, 'nu din vârf');
  r = reduce(r, { type: 'pull', block: at(4, 1), dir: 1, luck: 0.9 }, 'h');
  assert.equal(r.jenga.phase, 'pull');
  assert.equal(r.jenga.last.fell, false);
  r = reduce(r, { type: 'pull', block: at(4, 0), dir: -1, luck: 0.9 }, 'a');
  assert.equal(r.jenga.phase, 'over');
  assert.equal(r.jenga.loser, 'a');
});

test('Jenga: riscul — ghinionul sub risc dărâmă turnul', () => {
  let r = reduce(room(), { type: 'select', game: 'jenga' }, 'h');
  const at = (level, slot) => r.jenga.slots.findIndex(s => s.level === level && s.slot === slot);
  r = reduce(r, { type: 'pull', block: at(2, 1), dir: 1, luck: 0.001 }, 'h');
  assert.equal(r.jenga.loser, 'h', 'luck 0.001 < risc 1%');
});

test('Jenga cu calculatorul: el trage singur prin ceasul gazdei', () => {
  let r = newRoom({ id: 'h', name: 'Denis' });
  r = reduce(r, { type: 'add-bot' }, 'h');
  r = reduce(r, { type: 'select', game: 'jenga' }, 'h');
  const at = (level, slot) => r.jenga.slots.findIndex(s => s.level === level && s.slot === slot);
  r = reduce(r, { type: 'pull', block: at(3, 1), dir: 1, luck: 0.9 }, 'h');
  const memo = {};
  hostTimers(r, 0, memo, () => 0.5);
  const [act] = hostTimers(r, 3000, memo, () => 0.5);
  r = reduce(r, act.action, act.from);
  assert.equal(r.jenga.moves, 2);
  assert.equal(r.jenga.last.by, r.players[1].id);
});
