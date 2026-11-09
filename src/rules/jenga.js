// Jenga: turn de 18 niveluri × 3 piese. Pe rând tragi o piesă și ea se pune sus; cine dărâmă turnul pierde.
//
// Dacă turnul cade se decide geometric, nu prin simulare: pentru fiecare nivel, centrul de greutate al pieselor
// de deasupra trebuie să cadă în zona de sprijin a pieselor rămase pe acel nivel. (Am încercat simularea completă
// cu cannon-es: un turn de 54 de cutii e la limita oricărui motor fizic — uneori cade singur, iar pe telefon ar
// dura 10+ secunde.) Peste asta vine un risc mic care crește cu fiecare nivel șubrezit, ca să existe tensiune.
// Prăbușirea, când se întâmplă, e simulată fizic (collapse) — doar pentru imagine.
// Totul aici e pur (fără DOM); testat în tests/jenga.test.mjs.

// piesa reală de Jenga: 75 × 25 × 15 mm
export const L = 0.075, W = 0.025, H = 0.015;
export const LEVELS = 18;
const ROT_Y = [0, Math.SQRT1_2, 0, Math.SQRT1_2]; // 90° în jurul lui Y
const MARGIN = 0.002;

// poziția unei piese: nivelurile pare au piesele pe X, cele impare pe Z
export function slotPose(level, slot) {
  const y = H / 2 + level * H, offset = (slot - 1) * W;
  return level % 2 === 0 ? [0, y, offset, 0, 0, 0, 1] : [offset, y, 0, ...ROT_Y];
}
export const axisOf = level => (level % 2 === 0 ? [1, 0, 0] : [0, 0, 1]);

export function newTower() {
  const slots = [];
  for (let level = 0; level < LEVELS; level++) for (let slot = 0; slot < 3; slot++) slots.push({ level, slot });
  return slots;
}

const topLevel = (slots, skip = -1) => Math.max(...slots.filter((_, i) => i !== skip).map(s => s.level));

// nu tragi din ultimul nivel, nici din cel de sub el cât timp ultimul nu e complet
export function pullable(slots, i) {
  const top = topLevel(slots);
  const topCount = slots.filter(s => s.level === top).length;
  const level = slots[i]?.level;
  return level !== undefined && level !== top && !(topCount < 3 && level === top - 1);
}

// unde ajunge piesa trasă: următorul loc liber de sus
export function nextSlot(slots, pulled) {
  const top = topLevel(slots, pulled);
  const used = slots.filter((s, i) => i !== pulled && s.level === top).map(s => s.slot);
  if (used.length < 3) return { level: top, slot: [0, 1, 2].find(s => !used.includes(s)) };
  return { level: top + 1, slot: 0 };
}

// amprenta unei piese pe orizontală: [minX, maxX, minZ, maxZ]
function footprint({ level, slot }) {
  const offset = (slot - 1) * W;
  return level % 2 === 0
    ? [-L / 2, L / 2, offset - W / 2, offset + W / 2]
    : [offset - W / 2, offset + W / 2, -L / 2, L / 2];
}

// primul nivel care nu mai susține ce e deasupra (centrul de greutate iese din zona de sprijin), sau -1
export function weakLevel(slots) {
  const top = topLevel(slots);
  for (let level = 0; level < top; level++) {
    const here = slots.filter(s => s.level === level);
    const above = slots.filter(s => s.level > level);
    if (!here.length) return level;
    const boxes = here.map(footprint);
    const minX = Math.min(...boxes.map(b => b[0])), maxX = Math.max(...boxes.map(b => b[1]));
    const minZ = Math.min(...boxes.map(b => b[2])), maxZ = Math.max(...boxes.map(b => b[3]));
    const cx = above.reduce((s, b) => s + slotPose(b.level, b.slot)[0], 0) / above.length;
    const cz = above.reduce((s, b) => s + slotPose(b.level, b.slot)[2], 0) / above.length;
    if (cx < minX + MARGIN || cx > maxX - MARGIN || cz < minZ + MARGIN || cz > maxZ - MARGIN) return level;
  }
  return -1;
}
export const stable = slots => weakLevel(slots) === -1;

// riscul să se clatine și să cadă oricum: 1% + 5% pentru fiecare nivel (de sub vârf) rămas cu o singură piesă
export function risk(slots) {
  const top = topLevel(slots);
  let singles = 0;
  for (let level = 0; level < top - 1; level++) if (slots.filter(s => s.level === level).length === 1) singles += 1;
  return Math.round(Math.min(0.6, 0.01 + 0.05 * singles) * 100) / 100;
}

// ce se întâmplă dacă tragi piesa i: unde ajunge, dacă turnul mai stă și ce risc are
export function outcome(slots, i) {
  const after = slots.map((s, k) => (k === i ? nextSlot(slots, i) : s));
  return { slots: after, stable: stable(after), risk: risk(after) };
}

// Calculatorul: dintre piesele care nu dărâmă turnul, o alege pe cea cu riscul cel mai mic (puțin la întâmplare)
export function botPull(slots, rand = Math.random) {
  let best = null, bestScore = Infinity;
  slots.forEach((_, i) => {
    if (!pullable(slots, i)) return;
    const o = outcome(slots, i);
    const score = (o.stable ? 0 : 10) + o.risk + rand() * 0.02;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/**
 * Prăbușirea, simulată cu cannon-es (doar pentru imagine): pornește din turnul curent și dă un brânci
 * pieselor de deasupra nivelului slab. Întoarce cadre (30 pe secundă) cu pozițiile tuturor pieselor.
 */
export function collapse(CANNON, slots, seed = 1) {
  let t = seed >>> 0;
  const rand = () => ((t = (Math.imul(t, 1664525) + 1013904223) >>> 0) / 4294967296);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.solver.iterations = 20;
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.05;
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const shape = new CANNON.Box(new CANNON.Vec3(L / 2, H / 2, W / 2));
  const top = topLevel(slots);
  let weak = weakLevel(slots);
  if (weak < 0) weak = Math.floor(rand() * Math.max(1, top / 2)); // a căzut din „clătinare”: de undeva din jumătatea de jos
  const angle = rand() * Math.PI * 2;
  const bodies = slots.map(s => {
    const p = slotPose(s.level, s.slot);
    const body = new CANNON.Body({ mass: 0.012, shape });
    body.position.set(p[0], p[1], p[2]);
    body.quaternion.set(p[3], p[4], p[5], p[6]);
    if (s.level > weak) {
      // tot ce e deasupra nivelului slab pornește spre o parte, mai tare cu cât e mai sus
      const k = 0.25 + (s.level - weak) * 0.02;
      body.velocity.set(Math.cos(angle) * k, 0, Math.sin(angle) * k);
      body.angularVelocity.set((rand() - 0.5) * 2, 0, (rand() - 0.5) * 2);
    }
    world.addBody(body);
    return body;
  });
  const frames = [];
  for (let step = 0; step < 3 * 120; step++) {
    world.step(1 / 120);
    if (step % 4 === 0) frames.push(bodies.map(b => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
  }
  return frames;
}
