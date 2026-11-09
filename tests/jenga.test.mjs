// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as J from '../src/rules/jenga.js';

const at = (slots, level, slot) => slots.findIndex(s => s.level === level && s.slot === slot);

test('turnul nou: 54 de piese, stă, risc minim', () => {
  const t = J.newTower();
  assert.equal(t.length, 54);
  assert.ok(J.stable(t));
  assert.equal(J.risk(t), 0.01);
});

test('nu tragi din vârf; piesa trasă ajunge sus, pe un nivel nou rotit', () => {
  const t = J.newTower();
  assert.equal(J.pullable(t, at(t, 17, 1)), false);
  assert.equal(J.pullable(t, at(t, 3, 1)), true);
  const o = J.outcome(t, at(t, 3, 1));
  assert.deepEqual(o.slots[at(t, 3, 1)], { level: 18, slot: 0 });
  // cât timp nivelul 18 e incomplet, nu tragi nici din 17
  assert.equal(J.pullable(o.slots, at(o.slots, 17, 1)), false);
  assert.equal(J.pullable(o.slots, at(o.slots, 16, 1)), true);
});

test('fără piesa din mijloc sau fără o laterală turnul stă', () => {
  let t = J.newTower();
  t = J.outcome(t, at(t, 3, 1)).slots;
  assert.ok(J.stable(t), 'rămân cele două laterale');
  let u = J.newTower();
  u = J.outcome(u, at(u, 5, 0)).slots;
  assert.ok(J.stable(u), 'rămân mijlocul și o laterală');
});

test('o singură piesă laterală pe un nivel: turnul cade; doar mijlocul: stă, dar crește riscul', () => {
  let t = J.newTower();
  t = J.outcome(t, at(t, 4, 1)).slots;
  const o = J.outcome(t, at(t, 4, 0));
  assert.equal(o.stable, false);
  assert.equal(J.weakLevel(o.slots), 4);
  let u = J.newTower();
  u = J.outcome(u, at(u, 6, 0)).slots;
  const p = J.outcome(u, at(u, 6, 2));
  assert.equal(p.stable, true);
  assert.equal(p.risk, 0.06);
});

test('calculatorul nu dărâmă turnul cu bună știință', () => {
  let t = J.newTower();
  let seed = 5;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 25; k++) {
    const i = J.botPull(t, rand);
    const o = J.outcome(t, i);
    assert.ok(o.stable, `mutarea ${k}`);
    t = o.slots;
  }
});

test('prăbușirea (fizică): piesele de sus ajung jos', async () => {
  const { CANNON } = await import('./cannon.mjs');
  let t = J.newTower();
  t = J.outcome(t, at(t, 4, 1)).slots;
  t = J.outcome(t, at(t, 4, 0)).slots;
  const frames = J.collapse(CANNON, t, 7);
  const topBefore = Math.max(...t.map(s => J.slotPose(s.level, s.slot)[1]));
  const topAfter = Math.max(...frames.at(-1).map(p => p[1]));
  assert.ok(topAfter < topBefore / 2, `vârful a coborât de la ${topBefore.toFixed(3)} la ${topAfter.toFixed(3)}`);
});
