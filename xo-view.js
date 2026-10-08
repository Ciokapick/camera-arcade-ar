// X și 0 3D: patru plăci de sticlă stivuite (4×4 fiecare), X roșu și 0 albastru, linia câștigătoare luminează.
import * as THREE from 'three';
import { CELLS } from './xo.js';

const GAP = 0.03, LEVEL = 0.05, BASE = 0.01;
const cellPos = i => new THREE.Vector3(((i % 4) - 1.5) * GAP, BASE + Math.floor(i / 16) * LEVEL + 0.003, (Math.floor(i / 4) % 4 - 1.5) * GAP);

export function createXO() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.6 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, BASE, 0.14), wood);
  base.position.y = BASE / 2;
  base.castShadow = base.receiveShadow = true;
  group.add(base);
  const glass = new THREE.MeshStandardMaterial({ color: 0xa8dcff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  for (let z = 0; z < 4; z++) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.002, 0.13), glass);
    plate.position.y = BASE + z * LEVEL;
    group.add(plate);
  }
  const rod = new THREE.MeshStandardMaterial({ color: 0xc9b38a, roughness: 0.4, metalness: 0.3 });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 3 * LEVEL + 0.004, 8), rod);
    post.position.set(x * 0.063, BASE + 1.5 * LEVEL, z * 0.063);
    post.castShadow = true;
    group.add(post);
  }
  // punctele care arată celulele libere
  const dotGeometry = new THREE.SphereGeometry(0.0022, 10, 8);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
  const dots = Array.from({ length: CELLS }, (_, i) => {
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.copy(cellPos(i));
    group.add(dot);
    return dot;
  });

  const red = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0x550000, roughness: 0.3 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x3b9dff, emissive: 0x001f55, roughness: 0.3 });
  const bar = new THREE.BoxGeometry(0.022, 0.004, 0.0045);
  const ring = new THREE.TorusGeometry(0.0085, 0.0026, 10, 28).rotateX(Math.PI / 2);
  const makeMark = mark => {
    const m = new THREE.Group();
    if (mark === 'X') {
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const b = new THREE.Mesh(bar, red);
        b.rotation.y = angle;
        m.add(b);
      }
    } else {
      m.add(new THREE.Mesh(ring, blue));
    }
    m.traverse(o => { o.castShadow = true; });
    return m;
  };
  const marks = new Map(); // celulă → { mesh, born }
  let line = null, time = 0;

  return {
    group,
    footprint: 0.1,
    screen: { target: [0, 0.08, 0], elevation: 0.55, distance: 0.42 },
    setState(s) {
      s.cells.forEach((mark, i) => {
        dots[i].visible = !mark;
        if (mark && !marks.has(i)) {
          const mesh = makeMark(mark);
          mesh.position.copy(cellPos(i));
          group.add(mesh);
          marks.set(i, { mesh, born: time });
        } else if (!mark && marks.has(i)) {
          group.remove(marks.get(i).mesh);
          marks.delete(i);
        }
      });
      if (line) { group.remove(line); line = null; }
      if (s.line) {
        const a = cellPos(s.line[0]), b = cellPos(s.line[3]);
        line = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, a.distanceTo(b) + GAP, 10), new THREE.MeshBasicMaterial({ color: 0xc9ff4a }));
        line.position.copy(a).add(b).multiplyScalar(0.5);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        group.add(line);
      }
      this.winning = new Set(s.line ?? []);
    },
    winning: new Set(),
    // celula liberă cea mai apropiată (unghiular) de raza atingerii — merge la orice nivel care se vede
    pick(raycaster, cells) {
      let best = null, bestAngle = 0.06;
      const ray = raycaster.ray;
      for (let i = 0; i < CELLS; i++) {
        if (cells[i]) continue;
        const p = group.localToWorld(cellPos(i));
        const toPoint = p.clone().sub(ray.origin);
        const depth = toPoint.dot(ray.direction);
        if (depth <= 0) continue;
        const angle = ray.distanceToPoint(p) / depth;
        if (angle < bestAngle) { bestAngle = angle; best = i; }
      }
      return best;
    },
    update(dt) {
      time += dt;
      for (const [i, { mesh, born }] of marks) {
        const k = Math.min(1, (time - born) / 0.25);
        const pulse = this.winning.has(i) ? 1 + Math.sin(time * 8) * 0.15 : 1;
        mesh.scale.setScalar((0.3 + 0.7 * k) * pulse);
        mesh.position.y = cellPos(i).y + (1 - k) * 0.03;
      }
    },
  };
}
