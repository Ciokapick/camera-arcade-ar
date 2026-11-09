// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as xo from '../src/rules/xo.js';

test('tabla 3×3 are 8 linii', () => {
  assert.equal(xo.LINES.length, 8);
});

test('câștig pe rând, coloană și diagonală', () => {
  const at = cells => { const c = Array(9).fill(null); cells.forEach(i => { c[i] = 'X'; }); return c; };
  assert.equal(xo.winner(at([0, 1, 2])).mark, 'X');
  assert.deepEqual(xo.winner(at([1, 4, 7])).line, [1, 4, 7]);
  assert.ok(xo.winner(at([2, 4, 6])));
  assert.equal(xo.winner(at([0, 1, 5])), null);
});

test('calculatorul câștigă când poate și blochează când trebuie', () => {
  const c = Array(9).fill(null);
  c[0] = c[1] = 'O';
  c[3] = c[4] = 'X';
  assert.equal(xo.botMove(c, 'O'), 2, 'completează linia lui');
  const d = Array(9).fill(null);
  d[0] = d[4] = 'X';
  d[1] = 'O';
  assert.equal(xo.botMove(d, 'O'), 8, 'blochează diagonala');
  assert.equal(xo.botMove(Array(9).fill(null), 'X', () => 0.9), 4, 'începe din centru');
});
