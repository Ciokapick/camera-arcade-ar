// Turnul de Jenga în 3D: piese din lemn, piesa trasă alunecă afară și urcă sus, iar la final turnul cade fizic.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';
import { L, W, H, slotPose, axisOf, collapse } from './jenga.js';
import { sound } from './sound.js';

function woodTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  let t = seed;
  const rand = () => ((t = (t * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = `hsl(${32 + rand() * 6}, ${45 + rand() * 10}%, ${68 + rand() * 8}%)`;
  g.fillRect(0, 0, 256, 64);
  // fibra lemnului
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(110, 70, 30, ${0.08 + rand() * 0.12})`;
    g.lineWidth = 1 + rand() * 2;
    g.beginPath();
    const y = rand() * 64;
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x / 40 + rand() * 6) * 3);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// turnul cade: o ploaie de piese de lemn
const rumble = () => { for (let i = 0; i < 9; i++) setTimeout(() => sound.wood(0.4 + Math.random() * 0.6), 80 + Math.random() * 1100); };

const poseToMesh = (mesh, p) => {
  mesh.position.set(p[0], p[1], p[2]);
  mesh.quaternion.set(p[3], p[4], p[5], p[6]);
};

export function createJenga() {
  const group = new THREE.Group();
  // turnul stă într-un grup al lui, ca să se poată clătina fără să miște tot conținutul
  const tower = new THREE.Group();
  group.add(tower);
  const geometry = new RoundedBoxGeometry(L, H, W, 2, 0.0012);
  const textures = Array.from({ length: 6 }, (_, i) => woodTexture(i * 977 + 13));
  const blocks = Array.from({ length: 54 }, (_, i) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: textures[i % 6], roughness: 0.7 }));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.index = i;
    tower.add(mesh);
    return mesh;
  });

  let slots = null, selected = null, hovered = null, anim = null, lastSeq = null, time = 0, fallen = false;
  // piesa trasă cu degetul: { i, axis, center, plane, s0, offset }; wobble = cât se clatină turnul (0..1)
  let held = null, wobble = 0;
  // unde va ajunge piesa sus: o piesă „fantomă”, transparentă
  const ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xc9ff4a, transparent: true, opacity: 0.35, depthWrite: false }));
  ghost.visible = false;
  tower.add(ghost);
  const plane = new THREE.Plane(), hit = new THREE.Vector3();
  // raza atingerii, în coordonatele turnului
  const localRay = raycaster => {
    tower.updateMatrixWorld(true);
    const origin = tower.worldToLocal(raycaster.ray.origin.clone());
    const dir = tower.worldToLocal(raycaster.ray.origin.clone().add(raycaster.ray.direction)).sub(origin).normalize();
    return new THREE.Ray(origin, dir);
  };
  const along = ray => (ray.intersectPlane(plane, hit) ? hit.clone().sub(held.center).dot(held.axis) : null);
  const restPose = i => slotPose(slots[i].level, slots[i].slot);

  function snap() {
    blocks.forEach((mesh, i) => poseToMesh(mesh, restPose(i)));
  }

  return {
    group,
    footprint: 0.07,
    screen: { target: [0, 0.14, 0], elevation: 0.35, distance: 0.62 },
    get busy() { return !!anim; },
    // aplică starea; o tragere nouă (last.seq) se animă: piesa iese, urcă sus, iar dacă turnul cade — cade
    setState(j) {
      const fresh = slots === null;
      slots = j.slots;
      if (!fresh && j.last && j.last.seq !== lastSeq) {
        lastSeq = j.last.seq;
        const { block, dir, from, fell } = j.last;
        // dacă ai tras-o tu cu degetul, continuă de unde ai lăsat-o (scoasă pe jumătate sau dusă deja spre vârf)
        const mine = held?.i === block ? held : null;
        held = null;
        ghost.visible = false;
        anim = { t: 0, i: block, start: slotPose(from.level, from.slot), axis: axisOf(from.level), dir, offset: mine?.offset ?? 0, end: restPose(block), fell, slotsAfter: j.slots };
        if (mine?.carrying) { anim.from = blocks[block].position.clone(); anim.t = 0.6; }
        sound.wood(0.5);
        return;
      }
      lastSeq = j.last?.seq ?? null;
      if (anim) return;
      if (j.phase === 'over') {
        // turnul căzut rămâne căzut (dacă intri în cameră după cădere, îl vezi căzând)
        if (!fallen) { fallen = true; anim = { t: 0, frames: collapse(CANNON, j.slots, j.moves + 1) }; rumble(); }
        return;
      }
      fallen = false;
      const carried = held?.carrying ? blocks[held.i].position.clone() : null;
      snap();
      if (carried) blocks[held.i].position.copy(carried);
      else if (held) blocks[held.i].position.copy(held.center).addScaledVector(held.axis, held.offset);
    },
    // apuci piesa i: planul de tragere conține axa lungă a piesei și e cât mai „cu fața” spre cameră
    grab(i, raycaster) {
      const p = restPose(i), axis = new THREE.Vector3(...axisOf(slots[i].level)), center = new THREE.Vector3(p[0], p[1], p[2]);
      const ray = localRay(raycaster);
      const normal = axis.clone().cross(ray.direction.clone().cross(axis));
      if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0);
      plane.setFromNormalAndCoplanarPoint(normal.normalize(), center);
      held = { i, axis, center, offset: 0, s0: 0 };
      held.s0 = along(ray) ?? 0;
    },
    // mută piesa după deget, doar pe axa ei; întoarce cât a ieșit (m, cu semn)
    // depth (opțional, de la mâna reală): { offset, weight } — cât s-a mutat mâna în 3D pe axa piesei; contează
    // cu atât mai mult cu cât piesa e orientată spre cameră (atunci pe ecran tragerea aproape că nu se vede)
    drag(raycaster, depth = null) {
      if (!held) return 0;
      const ray = localRay(raycaster), s = along(ray);
      let offset = s !== null ? s - held.s0 : held.offset;
      if (depth) {
        const w = Math.min(1, Math.abs(held.axis.dot(ray.direction)) * depth.weight);
        offset = offset * (1 - w) + depth.offset * w;
      }
      held.offset = Math.max(-L * 0.7, Math.min(L * 0.7, offset));
      blocks[held.i].position.copy(held.center).addScaledVector(held.axis, held.offset);
      return held.offset;
    },
    // a ieșit din turn: de-acum o duci liber (cu degetul / mâna), iar fantoma arată unde ajunge sus
    startCarry(target) {
      if (!held) return;
      held.carrying = true;
      poseToMesh(ghost, slotPose(target.level, target.slot));
      ghost.visible = true;
    },
    // piesa urmărește raza pe un plan vertical, cu fața spre cameră, prin locul unde e acum
    carry(raycaster) {
      if (!held?.carrying) return;
      const ray = localRay(raycaster), mesh = blocks[held.i];
      const normal = new THREE.Vector3(ray.direction.x, 0, ray.direction.z);
      if (normal.lengthSq() < 1e-6) return;
      plane.setFromNormalAndCoplanarPoint(normal.normalize(), mesh.position);
      if (ray.intersectPlane(plane, hit)) mesh.position.set(hit.x, Math.max(H / 2, hit.y), hit.z);
    },
    // ai dat drumul înainte să iasă: piesa se întoarce la loc
    release() {
      if (held) poseToMesh(blocks[held.i], restPose(held.i));
      held = null;
      ghost.visible = false;
    },
    // unde e piesa ținută (local față de grup), dacă ții una
    get heldPosition() { return held ? tower.localToWorld(blocks[held.i].position.clone()).applyMatrix4(group.matrixWorld.clone().invert()) : null; },
    // cât de tare se clatină (0 = deloc, 1 = tare)
    shake(level) { wobble = Math.max(wobble, Math.min(1, level)); },
    select(index) {
      if (selected !== null) blocks[selected].material.emissive.setHex(0x000000);
      selected = index;
      if (index !== null) blocks[index].material.emissive.setHex(0x3a5a00);
    },
    get selected() { return selected; },
    // axa piesei ținute, în coordonatele grupului (null dacă nu ții una)
    get heldAxis() { return held ? held.axis.clone() : null; },
    // piesa spre care țintește mâna (cu mâna reală nu nimerești niciodată fix): cea mai apropiată de rază ca
    // unghi (deci la fel de ușor de aproape sau de departe), dintre cele bune (ok), cu un mic avantaj pentru
    // cele din față; null dacă toate sunt mai departe de `tolerance` (radiani, ~6°)
    nearest(raycaster, ok, tolerance = 0.1) {
      // raza nimerește chiar o piesă (prima din față): aceea e
      const direct = raycaster.intersectObjects(blocks, false)[0];
      if (direct && ok(direct.object.userData.index)) return direct.object.userData.index;
      const ray = localRay(raycaster);
      let best = null, bestScore = Infinity;
      blocks.forEach((mesh, i) => {
        if (!ok(i)) return;
        const along = mesh.position.clone().sub(ray.origin).dot(ray.direction);
        if (along <= 0) return;
        const angle = ray.distanceToPoint(mesh.position) / along;
        if (angle > tolerance) return;
        const score = angle + 0.004 * along / W;
        if (score < bestScore) { bestScore = score; best = i; }
      });
      return best;
    },
    // evidențiere albastră = „asta prinzi dacă ciupești acum”
    hover(index) {
      if (hovered === index) return;
      if (hovered !== null && hovered !== selected) blocks[hovered].material.emissive.setHex(0x000000);
      hovered = index;
      if (index !== null && index !== selected) blocks[index].material.emissive.setHex(0x1d4ed8);
    },
    pick(raycaster) {
      const hit = raycaster.intersectObjects(blocks, false)[0];
      return hit ? hit.object.userData.index : null;
    },
    blockPosition: i => new THREE.Vector3(...restPose(i).slice(0, 3)),
    // întoarce true o singură dată, când s-a terminat animația
    update(dt) {
      time += dt;
      wobble *= Math.exp(-dt * 3);
      tower.rotation.set(Math.sin(time * 23) * wobble * 0.012, 0, Math.sin(time * 19) * wobble * 0.012);
      if (!anim) {
        if (held?.carrying) ghost.material.opacity = 0.25 + Math.sin(time * 6) * 0.1;
        if (selected !== null && held?.i !== selected) {
          // piesa aleasă iese puțin din turn și „respiră”
          const p = restPose(selected), a = axisOf(slots[selected].level), k = 0.004 + Math.sin(time * 5) * 0.002;
          blocks[selected].position.set(p[0] + a[0] * k, p[1], p[2] + a[2] * k);
        }
        return false;
      }
      anim.t += dt;
      if (anim.frames) {
        // prăbușire: cadre la 30 pe secundă
        const f = anim.frames[Math.min(anim.frames.length - 1, Math.floor(anim.t * 30))];
        f.forEach((p, i) => poseToMesh(blocks[i], p));
        if (anim.t * 30 >= anim.frames.length) { anim = null; return true; }
        return false;
      }
      const mesh = blocks[anim.i];
      const OUT = 0.6, CARRY = 0.6;
      if (anim.t < OUT) {
        const d = anim.offset + (anim.t / OUT) * (L * 1.25 * anim.dir - anim.offset);
        mesh.position.set(anim.start[0] + anim.axis[0] * d, anim.start[1], anim.start[2] + anim.axis[2] * d);
        mesh.quaternion.set(anim.start[3], anim.start[4], anim.start[5], anim.start[6]);
      } else if (anim.t < OUT + CARRY) {
        const k = (anim.t - OUT) / CARRY;
        const d = L * 1.25 * anim.dir;
        const from = anim.from ?? new THREE.Vector3(anim.start[0] + anim.axis[0] * d, anim.start[1], anim.start[2] + anim.axis[2] * d);
        const to = new THREE.Vector3(anim.end[0], anim.end[1], anim.end[2]);
        mesh.position.lerpVectors(from, to, k);
        mesh.position.y += Math.sin(k * Math.PI) * 0.06;
        mesh.quaternion.slerpQuaternions(new THREE.Quaternion(...anim.start.slice(3)), new THREE.Quaternion(...anim.end.slice(3)), k);
      } else if (anim.fell) {
        // a ajuns sus — și turnul cade
        fallen = true;
        anim = { t: 0, frames: collapse(CANNON, anim.slotsAfter, lastSeq) };
        rumble();
      } else {
        snap();
        anim = null;
        sound.wood();
        return true;
      }
      return false;
    },
  };
}
