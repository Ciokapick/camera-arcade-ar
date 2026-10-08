// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ludo from '../ludo.js';

const game = (...colors) => ludo.newLudo(colors.map((color, i) => ({ id: `p${i}`, color })));

test('ieși din casă doar cu 6, iar cu 6 mai arunci', () => {
  const s = game('rosu', 'verde');
  assert.equal(ludo.roll(s, 'rosu', 3), true);
  assert.equal(s.phase, 'roll', 'fără pioni afară, mai încerci');
  assert.equal(ludo.current(s), 'rosu');
  ludo.roll(s, 'rosu', 6);
  assert.equal(s.phase, 'move');
  assert.equal(ludo.move(s, 'rosu', 0), true);
  assert.deepEqual(s.pawns.rosu, [0, -1, -1, -1]);
  assert.equal(ludo.current(s), 'rosu', 'după 6 tot tu arunci');
  assert.equal(s.phase, 'roll');
});

test('trei încercări fără pioni pe traseu, apoi trece rândul', () => {
  const s = game('rosu', 'verde');
  ludo.roll(s, 'rosu', 1);
  ludo.roll(s, 'rosu', 2);
  assert.equal(ludo.current(s), 'rosu');
  ludo.roll(s, 'rosu', 3);
  assert.equal(ludo.current(s), 'verde');
});

test('cu pion pe traseu ai o singură aruncare', () => {
  const s = game('rosu', 'verde');
  s.pawns.rosu = [5, -1, -1, -1];
  ludo.roll(s, 'rosu', 3);
  ludo.move(s, 'rosu', 0);
  assert.deepEqual(s.pawns.rosu, [8, -1, -1, -1]);
  assert.equal(ludo.current(s), 'verde');
});

test('nu e rândul tău / faza greșită', () => {
  const s = game('rosu', 'verde');
  assert.equal(ludo.roll(s, 'verde', 6), false);
  assert.equal(ludo.move(s, 'rosu', 0), false);
  assert.equal(ludo.roll(s, 'rosu', 7), false);
});

test('captură: pionul advers se întoarce în casă', () => {
  const s = game('rosu', 'verde');
  // verde pornește din căsuța 20; un pion verde la progres 2 stă pe căsuța 22
  s.pawns.verde = [2, -1, -1, -1];
  s.pawns.rosu = [20, -1, -1, -1];
  ludo.roll(s, 'rosu', 2);
  ludo.move(s, 'rosu', 0);
  assert.equal(ludo.square('rosu', 22), 22);
  assert.deepEqual(s.pawns.verde, [-1, -1, -1, -1]);
  assert.deepEqual(s.last.captured, [{ color: 'verde', pawn: 0 }]);
});

test('captură pe căsuța de start a adversarului când ieși', () => {
  const s = game('rosu', 'albastru');
  // un pion roșu stă pe căsuța de start a albastrului (10) → albastrul iese cu 6 și îl trimite acasă
  s.turn = 1;
  s.pawns.rosu = [10, -1, -1, -1];
  ludo.roll(s, 'albastru', 6);
  ludo.move(s, 'albastru', 0);
  assert.deepEqual(s.pawns.rosu, [-1, -1, -1, -1]);
});

test('nu poți ateriza pe propriul pion și nu treci de capăt', () => {
  const s = game('rosu', 'verde');
  s.pawns.rosu = [4, 7, 41, -1];
  const moves = ludo.legalMoves(s, 'rosu', 3);
  assert.deepEqual(moves.map(m => m.pawn), [1], 'pionul 0 ar ateriza pe pionul 1, pionul 2 ar depăși 43');
});

test('traseul trece pe culoarul final după 39 de căsuțe', () => {
  const s = game('rosu', 'verde');
  s.pawns.rosu = [38, -1, -1, -1];
  ludo.roll(s, 'rosu', 5);
  ludo.move(s, 'rosu', 0);
  assert.equal(s.pawns.rosu[0], 43);
  assert.equal(ludo.square('albastru', 39), 9, 'ultima căsuță a albastrului e chiar înainte de start');
});

test('pe culoarul final nu se capturează', () => {
  const s = game('rosu', 'verde');
  s.pawns.rosu = [39, -1, -1, -1];
  s.pawns.verde = [20, -1, -1, -1]; // căsuța 0, adică startul roșu
  ludo.roll(s, 'rosu', 2);
  ludo.move(s, 'rosu', 0);
  assert.deepEqual(s.pawns.verde, [20, -1, -1, -1]);
});

test('câștigă cine are toți pionii pe culoarul final', () => {
  const s = game('rosu', 'verde');
  s.pawns.rosu = [40, 41, 42, 37];
  ludo.roll(s, 'rosu', 6);
  ludo.move(s, 'rosu', 3);
  assert.equal(s.winner, 'rosu');
  assert.equal(s.phase, 'over');
  assert.equal(ludo.roll(s, 'rosu', 3), false);
});

test('un jucător iese: rândul trece mai departe; ultimul rămas câștigă', () => {
  const s = game('rosu', 'albastru', 'verde');
  s.turn = 1;
  ludo.removeColor(s, 'albastru');
  assert.equal(ludo.current(s), 'verde');
  ludo.removeColor(s, 'rosu');
  assert.equal(s.winner, 'verde');
});

test('calculatorul preferă captura, apoi ieșirea din casă', () => {
  const s = game('rosu', 'verde');
  s.pawns.rosu = [16, -1, -1, -1];
  s.pawns.verde = [2, -1, -1, -1]; // pe căsuța 22
  s.die = 6;
  assert.equal(ludo.botMove(s, 'rosu'), 0, '16 + 6 = 22 → captură');
  s.pawns.verde = [-1, -1, -1, -1];
  assert.equal(ludo.botMove(s, 'rosu'), 1, 'altfel scoate un pion nou');
});

test('o partidă întreagă între doi calculatori se termină', () => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = game('rosu', 'galben');
  for (let i = 0; i < 5000 && s.phase !== 'over'; i++) {
    const color = ludo.current(s);
    if (s.phase === 'roll') assert.ok(ludo.roll(s, color, 1 + Math.floor(rand() * 6)));
    else assert.ok(ludo.move(s, color, ludo.botMove(s, color)));
  }
  assert.equal(s.phase, 'over');
  assert.ok(s.pawns[s.winner].every(p => p >= ludo.TRACK));
});
