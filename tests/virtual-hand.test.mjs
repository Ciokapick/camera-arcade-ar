import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { registerHooks } from 'node:module';
import './cannon.mjs';

// Același three.js ca în importmap; cache local, ca testul existent de fizică.
const modules = {
  three: ['three.core.js', 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.core.js'],
  'three/addons/geometries/RoundedBoxGeometry.js': ['RoundedBoxGeometry.js', 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/geometries/RoundedBoxGeometry.js'],
};
for (const [file, url] of Object.values(modules)) {
  const target = new URL(`./.cache/${file}`, import.meta.url);
  try { await fs.access(target); } catch {
    const response = await fetch(url);
    assert.ok(response.ok, `Download ${url}: ${response.status}`);
    await fs.mkdir(new URL('./.cache/', import.meta.url), { recursive: true });
    await fs.writeFile(target, await response.text());
  }
}
const hook = registerHooks({ resolve(specifier, context, next) {
  if (modules[specifier]) return { url: new URL(`./.cache/${modules[specifier][0]}`, import.meta.url).href, shortCircuit: true };
  if (specifier === 'cannon-es') return { url: new URL('./.cache/cannon-es.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
globalThis.addEventListener = () => {};
globalThis.document = { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {} }) }) };
const THREE = await import('three');
const { createVirtualHand } = await import('../virtual-hand.js');
const { createGestureSymbols } = await import('../rps-symbols.js');
const { createDice, topValue } = await import('../dice.js');
// Renderer fără WebGL; restul scenei folosește aceleași modele și repere ca aplicația.
globalThis.location = { search: '' };
const sceneSource = (await fs.readFile(new URL('../rps-ar.js', import.meta.url), 'utf8'))
  .replace('new THREE.WebGLRenderer(', 'new globalThis.RpsTestRenderer(')
  .replaceAll("from './", `from '${new URL('../', import.meta.url).href}`);
const { createRpsScene } = await import(`data:text/javascript;base64,${Buffer.from(sceneSource).toString('base64')}`);
hook.deregister();

test('PHF: simboluri distincte deasupra mâinii, ascunse la numărătoare și refolosite', () => {
  const symbols = createGestureSymbols();
  assert.ok(symbols.group.position.y > 0.1);
  const resources = new Set(), disposed = new Set();
  for (const gesture of ['Piatră', 'Hârtie', 'Foarfecă']) {
    symbols.show(gesture);
    const visible = symbols.group.children.filter(x => x.visible);
    assert.equal(visible.length, 1);
    visible[0].traverse(o => {
      if (!o.isMesh) return;
      assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));
      resources.add(o.geometry); resources.add(o.material);
      if (o.material.map) resources.add(o.material.map);
    });
  }
  for (const gesture of [null, '?']) {
    symbols.show(gesture);
    assert.ok(symbols.group.children.every(x => !x.visible));
  }
  symbols.show('Piatră');
  assert.equal(symbols.group.children.length, 3, 'nu reconstruiește modelele între runde');
  assert.equal(symbols.group.children[0].visible, true, 'aceeași alegere reapare după numărătoare');
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.add(resource));
  symbols.dispose();
  assert.equal(disposed.size, resources.size, 'eliberează inclusiv textura hârtiei');
});

test('mâna: pumn, palmă și foarfecă au degete distincte și tranziții finite', () => {
  const hand = createVirtualHand();
  const fingers = hand.group.children.filter(x => x.isGroup).slice(0, 4);
  for (const [gesture, curls] of [['Piatră', [true,true,true,true]], ['Hârtie',[false,false,false,false]], ['Foarfecă',[false,false,true,true]]]) {
    hand.pose(gesture);
    for (let i=0;i<60;i++) hand.update(1/60);
    assert.deepEqual(fingers.map(x=>x.rotation.x > 1), curls);
    hand.group.traverse(x => assert.ok([...x.position,...x.quaternion].every(Number.isFinite)));
  }
  hand.dispose();
});

test('zaruri: mână virtuală repetabilă, rezultat păstrat, ascundere completă', () => {
  const group = new THREE.Group(), dice = createDice(group, {count:2,size:0.035});
  const hand = group.children.find(x=>x.isGroup);
  for (let run=0;run<2;run++) {
    dice.hold(new THREE.Vector3(0,0.12,0),true,true);
    dice.update(0.1);
    assert.ok(hand.visible && hand.scale.x > 0);
    if (run === 0) dice.hold(null); // aruncare tactilă; a doua rundă pleacă din mâna botului
    dice.throw({values:[3,6],seed:123,from:new THREE.Vector3(0,0,1)});
    assert.ok(dice.busy && hand.visible);
    let result=null;
    for(let i=0;i<1500 && !result;i++) result=dice.update(1/60);
    assert.deepEqual(result,[3,6]);
    assert.deepEqual(dice.meshes.map(m=>topValue(m.quaternion)),[3,6]);
    assert.equal(hand.visible,false);
  }
  dice.hold(new THREE.Vector3(0,0.1,0),false);
  assert.equal(hand.visible,false,'mâna reală nu este dublată de avatar');
  dice.hide(); dice.update(0.1);
  assert.ok(dice.meshes.every(m=>!m.visible));
  dice.dispose();
});


test('PHF: mâinile reale au doar simboluri; adversarul păstrează mâna și ascunde alegerea', () => {
  let scene, frame;
  const resources = new Set(), disposed = new Set();
  globalThis.devicePixelRatio = 1;
  globalThis.removeEventListener = () => {};
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.RpsTestRenderer = class {
    domElement = { remove() {} };
    setPixelRatio() {} setSize() {} dispose() {}
    render(value) { scene = value; }
  };
  const rps = createRpsScene({ clientWidth: 640, clientHeight: 480, append() {} }, { videoWidth: 640, videoHeight: 480 });
  try {
    const landmarks = Array.from({ length: 21 }, (_, i) => ({ x: 0.4 + (i % 5) * 0.02, y: 0.6 - i * 0.01, z: 0 }));
    rps.setHands(['Piatră', 'Hârtie'].map(gesture => ({ gesture, landmarks })));
    rps.setOpponents(['?']);
    frame(16);
    const [human0, human1, opponent] = scene.children.filter(x => x.isGroup);
    for (const human of [human0, human1]) {
      assert.equal(human.children[0].children.length, 1, 'doar grupul de simboluri, fără geometria unei mâini');
      assert.equal(human.children[0].children[0].children.filter(x => x.visible).length, 1);
      assert.ok([...human.position].every(Number.isFinite));
    }
    const bot = opponent.children[0], symbols = bot.children.at(-1);
    assert.ok(bot.children.length > 1, 'adversarul păstrează geometria mâinii articulate');
    assert.ok(symbols.children.every(x => !x.visible), 'numărătoarea nu dezvăluie simbolul');
    rps.setOpponents(['Piatră']);
    assert.equal(symbols.children.filter(x => x.visible).length, 1, 'aceeași piatră reapare la rezultat');
    rps.clash({ hand0: 'win', hand1: 'tie', opp0: 'lose' });
    for (let i = 2; i < 65; i++) frame(i * 50);
    assert.ok(bot.rotation.z < 0, 'mâna învinsă reacționează la impact');
    rps.clear();
    assert.ok([human0, human1, opponent].every(x => !x.visible));
    rps.setHands([{ gesture: 'Foarfecă', landmarks }]);
    assert.ok(human0.visible && !human1.visible, 'simbolurile se refolosesc și dispar când mâna lipsește');
    scene.traverse(o => {
      if (!o.isMesh) return;
      resources.add(o.geometry); resources.add(o.material);
      if (o.material.map) resources.add(o.material.map);
    });
    for (const resource of resources) resource.addEventListener('dispose', () => disposed.add(resource));
  } finally {
    rps.dispose();
    delete globalThis.RpsTestRenderer;
  }
  assert.equal(disposed.size, resources.size, 'eliberează atât simbolurile umane, cât și mâna adversarului');
});
