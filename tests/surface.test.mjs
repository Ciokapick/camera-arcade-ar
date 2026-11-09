import test from 'node:test';
import assert from 'node:assert/strict';
import { tableHeight } from '../src/ar/surface.js';

// zgomot determinist
let t = 7;
const rand = () => ((t = (t * 9301 + 49297) % 233280) / 233280);

test('masa: înălțimea la care se adună punctele, nu mâna de deasupra', () => {
  const table = Array.from({ length: 120 }, () => -0.21 + (rand() - 0.5) * 0.008);
  const hand = Array.from({ length: 60 }, () => -0.08 + (rand() - 0.5) * 0.06); // mâna: mai sus și împrăștiată
  const est = tableHeight([...hand, ...table]);
  assert.ok(Math.abs(est.y + 0.21) < 0.004, `y = ${est.y}`);
  assert.ok(est.support > 0.5);
});

test('masa: prea puține puncte = încă nu știm', () => {
  assert.equal(tableHeight([0, 0.01, 0.02]), null);
});

test('masa: două suprafețe egale → cea de jos (masa, nu cutia de pe ea)', () => {
  const ys = [...Array(30).fill(-0.3), ...Array(30).fill(-0.2)];
  assert.ok(Math.abs(tableHeight(ys).y + 0.3) < 1e-9);
});
