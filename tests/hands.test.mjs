// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, openness } from '../hands.js';

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

// mână schematică (încheietura în 0, degetele în sus) — deschisă și strânsă în pumn
const OPEN = [[0, 0], [-0.15, -0.1], [-0.25, -0.2], [-0.32, -0.3], [-0.38, -0.38], [-0.1, -0.45], [-0.11, -0.65], [-0.12, -0.8], [-0.13, -0.95],
  [0, -0.48], [0, -0.7], [0, -0.87], [0, -1.0], [0.1, -0.45], [0.11, -0.65], [0.12, -0.8], [0.13, -0.92], [0.19, -0.4], [0.21, -0.55], [0.22, -0.67], [0.23, -0.77]];
const FIST = OPEN.map((p, i) => ({ 8: [-0.08, -0.38], 12: [0, -0.4], 16: [0.08, -0.38], 20: [0.15, -0.33] })[i] ?? p);
const pts = (list, tilt = 0) => list.map(([x, y]) => ({ x, y: y * Math.cos(tilt), z: y * Math.sin(tilt) }));

test('palma: deschisă vs pumn, și cu mâna înclinată (3D)', () => {
  for (const tilt of [0, 0.6, 1.1]) {
    assert.ok(openness(pts(OPEN, tilt)) > 1.55, `deschisă, înclinare ${tilt}`);
    assert.ok(openness(pts(FIST, tilt)) < 1.3, `pumn, înclinare ${tilt}`);
  }
  // fără z (doar 2D), mâna foarte înclinată ar părea mai strânsă decât e — de-asta folosim 3D
  const flat = pts(OPEN, 1.1).map(p => ({ ...p, z: 0 }));
  assert.ok(openness(flat) < openness(pts(OPEN, 1.1)) + 1e-9);
});
