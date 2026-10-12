// Zaruri 3D cu fizică reală (cannon-es).
// Valoarea e decisă înainte (de cel care aruncă, trimisă tuturor), iar animația o respectă:
// simulăm aruncarea, vedem ce față a ieșit sus și rotim „eticheta” zarului în corpul lui
// astfel încât sus să apară valoarea cerută. Rostogolirea rămâne naturală, rezultatul e același pe toate telefoanele.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';
import { sound } from './sound.js';

// Ordinea materialelor la BoxGeometry: +X, -X, +Y, -Y, +Z, -Z. Fețele opuse însumează 7.
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const STEP = 1 / 120;
// la scară reală un zar de 3,5 cm se oprește în ~0,6 s — prea repede ca să-l urmărești; îl redăm cu încetinitorul
const PLAYBACK_SPEED = 0.55;
const UP = new THREE.Vector3(0, 1, 0);

let materials;
function faceMaterials() {
  materials ??= FACE_VALUES.map(value => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const g = canvas.getContext('2d');
    const ivory = g.createRadialGradient(90, 70, 10, 128, 128, 200);
    ivory.addColorStop(0, '#fffdf8');
    ivory.addColorStop(1, '#e3dac8');
    g.fillStyle = ivory;
    g.fillRect(0, 0, 256, 256);
    for (const i of PIPS[value]) {
      g.fillStyle = value === 1 ? '#b3121f' : '#14161a';
      g.beginPath();
      g.arc(56 + (i % 3) * 72, 56 + Math.floor(i / 3) * 72, value === 1 ? 30 : 21, 0, Math.PI * 2);
      g.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35 });
  });
  return materials;
}

// generator determinist: aceeași „sămânță” → aceeași aruncare pe toate telefoanele
export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function topValue(quaternion) {
  let best = -2, index = 0;
  AXES.forEach((axis, i) => {
    const d = axis.clone().applyQuaternion(quaternion).dot(UP);
    if (d > best) { best = d; index = i; }
  });
  return FACE_VALUES[index];
}

// rotația (în corpul zarului) care mută fața `want` acolo unde a aterizat fața `got`
function relabel(got, want) {
  const from = AXES[FACE_VALUES.indexOf(want)], to = AXES[FACE_VALUES.indexOf(got)];
  return new THREE.Quaternion().setFromUnitVectors(from, to);
}

/**
 * @param parent  grup în metri, +Y în sus, suprafața la y = floor
 * @param count   câte zaruri
 * @param size    latura zarului (m)
 * @param bounds  jumătatea laturii zonei închise de pereți invizibili (m), sau null pentru masă liberă
 */
export function createDice(parent, { count, size, floor = 0, bounds = null }) {
  const geometry = new RoundedBoxGeometry(size, size, size, 4, size * 0.14);
  const meshes = Array.from({ length: count }, () => {
    const mesh = new THREE.Mesh(geometry, faceMaterials());
    mesh.castShadow = true;
    mesh.visible = false;
    parent.add(mesh);
    return mesh;
  });

  let playback = null; // { frames, fix, t, values, done }
  let held = null, holdTime = 0; // zarurile ținute în palmă (punct local)

  // power 0..1: cât de tare ai aruncat (degetul / scuturatul); 0.5 = aruncare obișnuită
  // launch { start, vel } (local, m și m/s): aruncate din mână — pleacă exact de acolo, cu viteza mâinii
  function simulate(seed, from, power = 0.5, launch = null) {
    const rand = seededRandom(seed);
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
    const diceMaterial = new CANNON.Material(), tableMaterial = new CANNON.Material();
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, tableMaterial, { friction: 0.3, restitution: 0.35 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, { friction: 0.2, restitution: 0.3 }));
    const table = new CANNON.Body({ mass: 0, material: tableMaterial, shape: new CANNON.Plane() });
    table.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    table.position.y = floor;
    world.addBody(table);
    if (bounds) {
      for (const [x, z, w, d] of [[bounds, 0, 0.01, bounds], [-bounds, 0, 0.01, bounds], [0, bounds, bounds, 0.01], [0, -bounds, bounds, 0.01]]) {
        const wall = new CANNON.Body({ mass: 0, material: tableMaterial, shape: new CANNON.Box(new CANNON.Vec3(w, 0.15, d)) });
        wall.position.set(x, floor + 0.15, z);
        world.addBody(wall);
      }
    }
    // aruncare scurtă cu mult spin dinspre `from`, ca zarurile să rămână în zona văzută
    const forward = (launch ? launch.vel.clone().negate() : from.clone()).setY(0);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    forward.normalize().negate();
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const reach = bounds ? Math.min(bounds * 0.6, 0.06) : 0.06;
    const impacts = [];
    let step = 0;
    const bodies = meshes.map((mesh, i) => {
      const body = new CANNON.Body({ mass: 0.02, material: diceMaterial, shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)), sleepSpeedLimit: 0.05, sleepTimeLimit: 0.3, linearDamping: 0.1, angularDamping: 0.35 });
      const offset = (i - (count - 1) / 2) * size * 1.6;
      const start = launch ? launch.start.clone().addScaledVector(side, offset) : forward.clone().multiplyScalar(-reach).addScaledVector(side, offset);
      body.position.set(start.x, launch ? Math.max(floor + size, start.y) : floor + 0.1 + size * 2, start.z);
      body.quaternion.setFromEuler(rand() * 6.3, rand() * 6.3, rand() * 6.3);
      const speed = (0.15 + rand() * 0.15) * (0.5 + power);
      if (launch) body.velocity.set(launch.vel.x + (rand() - 0.5) * 0.08, launch.vel.y, launch.vel.z + (rand() - 0.5) * 0.08);
      else body.velocity.set(forward.x * speed + (rand() - 0.5) * 0.05, 0.2, forward.z * speed + (rand() - 0.5) * 0.05);
      const spin = 24 * (0.6 + power * 0.8);
      body.angularVelocity.set((rand() - 0.5) * spin, (rand() - 0.5) * spin, (rand() - 0.5) * spin);
      // fiecare lovitură (de masă, de perete, de celălalt zar) → un clinchet la redare
      body.addEventListener('collide', e => {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v > 0.05) impacts.push({ frame: Math.floor(step / 2), strength: v / 0.8 });
      });
      world.addBody(body);
      return body;
    });
    // simulăm tot dinainte și înregistrăm la 60 fps
    const frames = [];
    for (step = 0; step < 5 / STEP; step++) {
      world.step(STEP);
      if (step % 2 === 0) frames.push(bodies.map(b => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
      if (bodies.every(b => b.sleepState === CANNON.Body.SLEEPING)) break;
    }
    return { frames, impacts };
  }

  return {
    meshes,
    get busy() { return !!playback && !playback.done; },
    /** values: valorile cerute; seed: același pe toate telefoanele; from: direcția (locală) din care vin zarurile */
    throw({ values, seed, from, power, launch }) {
      held = null;
      const { frames, impacts } = simulate(seed, from, power, launch);
      const last = frames.at(-1);
      const fix = last.map((f, i) => relabel(topValue(new THREE.Quaternion(f[3], f[4], f[5], f[6])), values[i]));
      playback = { frames, impacts, fix, t: 0, frame: -1, values, done: false };
      meshes.forEach(m => { m.visible = true; });
    },
    // zarurile în mână: urmăresc punctul `at` (local) lin, rotindu-se ușor; null = le ascunzi (în pumn)
    hold(at) {
      if (this.busy) return;
      playback = null;
      held = at ? at.clone() : null;
      meshes.forEach(m => { m.visible = !!at; });
    },
    // avansează animația; întoarce valorile o singură dată, când zarurile s-au oprit
    update(dt) {
      if (held) {
        holdTime += dt;
        meshes.forEach((m, i) => {
          const target = held.clone().add(new THREE.Vector3((i - (count - 1) / 2) * size * 1.15, size * 0.6, 0));
          m.position.lerp(target, Math.min(1, dt * 12));
          m.rotation.set(holdTime * 0.7 + i, holdTime * 0.5, 0);
        });
        return null;
      }
      if (!playback || playback.done) return null;
      playback.t += dt * PLAYBACK_SPEED;
      const index = Math.min(playback.frames.length - 1, Math.floor(playback.t * 60));
      for (const hit of playback.impacts) if (hit.frame > playback.frame && hit.frame <= index) sound.clack(hit.strength);
      playback.frame = index;
      const q = new THREE.Quaternion();
      playback.frames[index].forEach((f, i) => {
        meshes[i].position.set(f[0], f[1], f[2]);
        meshes[i].quaternion.copy(q.set(f[3], f[4], f[5], f[6])).multiply(playback.fix[i]);
      });
      if (index === playback.frames.length - 1) {
        playback.done = true;
        return playback.values;
      }
      return null;
    },
    hide() {
      playback = null;
      meshes.forEach(m => { m.visible = false; });
    },
  };
}
