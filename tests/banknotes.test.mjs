// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classify, MIN_SCORE } from '../banknotes.js';

const refs = JSON.parse(fs.readFileSync(new URL('../banknote-refs.json', import.meta.url)));

test('amprentele de bază: toate cele 8 bancnote, față și verso, câte 4 variante', () => {
  assert.deepEqual([...new Set(refs.map(r => r.value))].sort((a, b) => a - b), [1, 5, 10, 20, 50, 100, 200, 500]);
  assert.equal(refs.length, 64);
  assert.ok(refs.every(r => r.embedding.length === 1024));
});

test('o amprentă aproape de cea a lui 50 de lei e recunoscută ca 50', () => {
  const fifty = refs.find(r => r.value === 50).embedding;
  const noisy = fifty.map((v, i) => v + (((i * 7919) % 13) - 6) * 0.002);
  assert.equal(classify(noisy, refs).value, 50);
});

test('ceva care nu seamănă cu nicio bancnotă nu e luat drept bani', () => {
  const random = Array.from({ length: 1024 }, (_, i) => Math.sin(i * 12.9898) * 0.03);
  const r = classify(random, refs);
  assert.ok(r === null, `scor prea mic (< ${MIN_SCORE}) → nimic`);
});

test('bancnotele învățate de tine contează la fel', () => {
  const mine = Array.from({ length: 1024 }, (_, i) => (i % 2 ? 0.05 : -0.05));
  assert.equal(classify(mine, refs.concat([{ value: 200, embedding: mine }])).value, 200);
});
