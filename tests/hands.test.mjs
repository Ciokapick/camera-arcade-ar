// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../hands.js';

// mână sintetică: încheietura în origine, degetele pe o direcție dată (rotește mâna);
// întins = vârful la 2, îndoit = vârful la 0.5 (articulația PIP la 1)
function hand(up, angle = 0) {
  const dir = [Math.sin(angle), -Math.cos(angle)];
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  [[8, 6], [12, 10], [16, 14], [20, 18]].forEach(([tip, pip], i) => {
    const side = [(i - 1.5) * 0.2 * -dir[1], (i - 1.5) * 0.2 * dir[0]];
    lm[pip] = { x: side[0] + dir[0], y: side[1] + dir[1] };
    lm[tip] = { x: side[0] + dir[0] * (up[i] ? 2 : 0.5), y: side[1] + dir[1] * (up[i] ? 2 : 0.5) };
  });
  return lm;
}

for (const angle of [0, Math.PI / 2, -Math.PI / 3]) {
  test(`gesturi recunoscute cu mâna rotită ${Math.round(angle * 180 / Math.PI)}°`, () => {
    assert.equal(classify(hand([0, 0, 0, 0], angle)), 'Piatră');
    assert.equal(classify(hand([1, 1, 1, 1], angle)), 'Hârtie');
    assert.equal(classify(hand([1, 1, 0, 0], angle)), 'Foarfecă');
    assert.equal(classify(hand([1, 0, 0, 0], angle)), null);
  });
}
