// X și 0 pe masă: o tablă de lemn 3×3, X roșu și 0 albastru, linia câștigătoare luminează.
import * as THREE from 'three';

export const CELL = 0.045;
const TOP = 0.008;
const cellPos = i => new THREE.Vector3(((i % 3) - 1) * CELL, TOP, (Math.floor(i / 3) - 1) * CELL);

export function createXO() {
  const group = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(CELL * 3 + 0.016, TOP, CELL * 3 + 0.016), new THREE.MeshStandardMaterial({ color: 0xe9d6b0, roughness: 0.75 }));
  board.position.y = TOP / 2;
  board.castShadow = board.receiveShadow = true;
  group.add(board);
  // liniile grilei
  const lineMaterial = new THREE.MeshStandardMaterial({ color: 0x3b2f22, roughness: 0.6 });
  for (const k of [-0.5, 0.5]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0015, CELL * 3), lineMaterial);
    a.position.set(k * CELL, TOP + 0.0007, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(CELL * 3, 0.0015, 0.003), lineMaterial);
    b.position.set(0, TOP + 0.0007, k * CELL);
    group.add(a, b);
  }

  const red = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0x440000, roughness: 0.3 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x3b9dff, emissive: 0x001a44, roughness: 0.3 });
  const bar = new THREE.BoxGeometry(CELL * 0.75, 0.006, 0.008);
  const ring = new THREE.TorusGeometry(CELL * 0.27, 0.0045, 12, 36).rotateX(Math.PI / 2);
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
  let line = null, time = 0, winning = new Set();
  const plane = new THREE.Plane();

  return {
    group,
    footprint: 0.09,
    setState(s) {
      s.cells.forEach((mark, i) => {
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
      winning = new Set(s.line ?? []);
      if (s.line) {
        const a = cellPos(s.line[0]), b = cellPos(s.line[2]);
        line = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, a.distanceTo(b) + CELL * 0.8, 12), new THREE.MeshBasicMaterial({ color: 0xc9ff4a }));
        line.position.copy(a).add(b).multiplyScalar(0.5).setY(TOP + 0.008);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        group.add(line);
      }
    },
    // celula de pe tablă unde a nimerit atingerea (raza intersectată cu planul tablei)
    pick(raycaster) {
      group.updateMatrixWorld(true);
      const normal = new THREE.Vector3(0, 1, 0).transformDirection(group.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(normal, group.localToWorld(new THREE.Vector3(0, TOP, 0)));
      const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return null;
      const local = group.worldToLocal(hit);
      const x = Math.round(local.x / CELL) + 1, y = Math.round(local.z / CELL) + 1;
      return x >= 0 && x < 3 && y >= 0 && y < 3 ? x + 3 * y : null;
    },
    update(dt) {
      time += dt;
      for (const [i, { mesh, born }] of marks) {
        const k = Math.min(1, (time - born) / 0.25);
        mesh.scale.setScalar((0.3 + 0.7 * k) * (winning.has(i) ? 1 + Math.sin(time * 8) * 0.12 : 1));
        mesh.position.y = TOP + 0.003 + (1 - k) * 0.03;
      }
    },
  };
}

