// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as xo from '../xo.js';

test('cubul 4×4×4 are exact 76 de linii, fiecare de 4 celule', () => {
  assert.equal(xo.LINES.length, 76);
  assert.ok(xo.LINES.every(l => l.length === 4 && new Set(l).size === 4));
});

test('câștig pe rând, prin niveluri și pe diagonala mare a cubului', () => {
  const at = cells => { const c = Array(64).fill(null); cells.forEach(i => { c[i] = 'X'; }); return c; };
  assert.equal(xo.winner(at([0, 1, 2, 3])).mark, 'X');
  const vertical = [0, 1, 2, 3].map(z => xo.index(2, 1, z));
  assert.deepEqual(xo.winner(at(vertical)).line.sort((a, b) => a - b), vertical);
  const diagonal = [0, 1, 2, 3].map(k => xo.index(k, k, k));
  assert.ok(xo.winner(at(diagonal)));
  assert.equal(xo.winner(at([0, 1, 2, 7])), null);
});

test('calculatorul câștigă când poate și blochează când trebuie', () => {
  const c = Array(64).fill(null);
  [0, 1, 2].forEach(i => { c[i] = 'O'; });
  assert.equal(xo.botMove(c, 'O'), 3, 'completează linia');
  const d = Array(64).fill(null);
  [xo.index(0, 0, 0), xo.index(1, 1, 1), xo.index(2, 2, 2)].forEach(i => { d[i] = 'X'; });
  assert.equal(xo.botMove(d, 'O'), xo.index(3, 3, 3), 'blochează diagonala');
});
