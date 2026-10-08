// Tabla 3D „Nu te supăra, frate”: grilă 11×11, traseu de 40 de căsuțe, pioni animați pas cu pas.
// Totul în metri, centrul tablei în origine, fața tablei la y = TOP.
import * as THREE from 'three';
import { COLORS, YARD, TRACK, square, COLOR_HEX as HEX } from './ludo.js';
import { createDice } from './dice.js';

export const CELL = 0.026;
export const SIZE = CELL * 11 + 0.016;
export const TOP = 0.012;

// traseul, pornind de la startul roșu (0,4), în sensul acelor de ceasornic
const TRACK_CELLS = [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [4, 1], [4, 0], [5, 0], [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [10, 5], [10, 6], [9, 6], [8, 6], [7, 6], [6, 6], [6, 7], [6, 8], [6, 9], [6, 10], [5, 10], [4, 10], [4, 9], [4, 8], [4, 7], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 5]];
const HOME_CELLS = {
  rosu: [[1, 5], [2, 5], [3, 5], [4, 5]],
  albastru: [[5, 1], [5, 2], [5, 3], [5, 4]],
  verde: [[9, 5], [8, 5], [7, 5], [6, 5]],
  galben: [[5, 9], [5, 8], [5, 7], [5, 6]],
};
const YARD_CELLS = {
  rosu: [[0, 0], [1, 0], [0, 1], [1, 1]],
  albastru: [[9, 0], [10, 0], [9, 1], [10, 1]],
  verde: [[9, 9], [10, 9], [9, 10], [10, 10]],
  galben: [[0, 9], [1, 9], [0, 10], [1, 10]],
};
// de unde „stă” fiecare culoare la masă (direcția spre jucător, în coordonatele tablei)
export const SEAT = {
  rosu: new THREE.Vector3(-1, 0, 0),
  albastru: new THREE.Vector3(0, 0, -1),
  verde: new THREE.Vector3(1, 0, 0),
  galben: new THREE.Vector3(0, 0, 1),
};

const cellPos = ([col, row], y = TOP) => new THREE.Vector3((col - 5) * CELL, y, (row - 5) * CELL);
export function pawnCell(color, index, progress) {
  if (progress === YARD) return YARD_CELLS[color][index];
  if (progress < TRACK) return TRACK_CELLS[square(color, progress)];
  return HOME_CELLS[color][progress - TRACK];
}

function boardTexture() {
  const px = 100, n = 11, canvas = document.createElement('canvas');
  canvas.width = canvas.height = px * n;
  const g = canvas.getContext('2d');
  const wood = g.createLinearGradient(0, 0, px * n, px * n);
  wood.addColorStop(0, '#f6ead0');
  wood.addColorStop(1, '#ead8b2');
  g.fillStyle = wood;
  g.fillRect(0, 0, px * n, px * n);
  const circle = ([c, r], fill, radius = 38, stroke = '#3b2f22') => {
    g.beginPath();
    g.arc(c * px + px / 2, r * px + px / 2, radius, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = stroke;
    g.stroke();
  };
  // curțile colorate în colțuri
  for (const color of COLORS) {
    const [c, r] = YARD_CELLS[color][0];
    g.fillStyle = HEX[color] + '33';
    g.beginPath();
    g.roundRect(c * px + 6, r * px + 6, px * 2 - 12, px * 2 - 12, 30);
    g.fill();
  }
  TRACK_CELLS.forEach((cell, i) => {
    const owner = COLORS.find(color => square(color, 0) === i);
    circle(cell, owner ? HEX[owner] : '#fffdf6');
  });
  for (const color of COLORS) {
    HOME_CELLS[color].forEach(cell => circle(cell, HEX[color] + 'aa'));
    YARD_CELLS[color].forEach(cell => circle(cell, HEX[color]));
  }
  // centrul: patru triunghiuri colorate
  const cx = 5.5 * px, cy = 5.5 * px, h = px / 2 - 4;
  [['albastru', [[-h, -h], [h, -h]]], ['verde', [[h, -h], [h, h]]], ['galben', [[h, h], [-h, h]]], ['rosu', [[-h, h], [-h, -h]]]].forEach(([color, [[x1, y1], [x2, y2]]]) => {
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + x1, cy + y1);
    g.lineTo(cx + x2, cy + y2);
    g.closePath();
    g.fillStyle = HEX[color];
    g.fill();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function pawnMesh(color) {
  const material = new THREE.MeshStandardMaterial({ color: HEX[color], roughness: 0.3, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.0085, 0), new THREE.Vector2(0.0085, 0.0025), new THREE.Vector2(0.006, 0.0045),
    new THREE.Vector2(0.0036, 0.015), new THREE.Vector2(0.005, 0.0175), new THREE.Vector2(0, 0.0185),
  ], 24), material);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 20, 14), material);
  head.position.y = 0.0225;
  const pawn = new THREE.Group();
  pawn.add(body, head);
  pawn.traverse(o => { o.castShadow = true; });
  return pawn;
}

export function createBoard() {
  const group = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.8 });
  const side = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(SIZE, TOP, SIZE), [side, side, top, side, side, side]);
  board.position.y = TOP / 2;
  board.receiveShadow = true;
  board.castShadow = true;
  group.add(board);

  const dice = createDice(group, { count: 1, size: 0.02, floor: TOP, bounds: SIZE / 2 - 0.012 });

  // inelul care arată pionii pe care îi poți muta
  const ringGeometry = new THREE.RingGeometry(0.0095, 0.0125, 32).rotateX(-Math.PI / 2);
  const pawns = {}; // culoare → [{ mesh, ring, path, progress }]

  function ensure(color) {
    if (pawns[color]) return pawns[color];
    pawns[color] = [0, 1, 2, 3].map(index => {
      const mesh = pawnMesh(color);
      mesh.userData = { color, index };
      mesh.position.copy(cellPos(YARD_CELLS[color][index]));
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xc9ff4a, transparent: true, opacity: 0.9, depthWrite: false }));
      ring.visible = false;
      group.add(mesh, ring);
      return { mesh, ring, path: [], progress: YARD };
    });
    return pawns[color];
  }

  // drumul pe care îl face un pion de la `from` la `to` (căsuță cu căsuță)
  function route(color, index, from, to) {
    if (to === YARD || from === YARD || to < from) return [cellPos(pawnCell(color, index, to))];
    const cells = [];
    for (let p = from + 1; p <= to; p++) cells.push(cellPos(pawnCell(color, index, p)));
    return cells;
  }

  let time = 0;
  return {
    group,
    dice,
    // aduce pionii la starea din joc; mutările noi se animă pas cu pas
    setState(ludo) {
      for (const color of Object.keys(pawns)) if (!ludo.order.includes(color)) pawns[color].forEach(p => { p.mesh.visible = false; p.ring.visible = false; });
      for (const color of ludo.order) {
        ensure(color).forEach((pawn, index) => {
          const progress = ludo.pawns[color][index];
          pawn.mesh.visible = true;
          if (progress !== pawn.progress) {
            pawn.path.push(...route(color, index, pawn.progress, progress));
            pawn.progress = progress;
          }
        });
      }
    },
    highlight(color, indices) {
      for (const list of Object.values(pawns)) list.forEach(p => { p.ring.visible = false; });
      if (color && pawns[color]) indices.forEach(i => { pawns[color][i].ring.visible = true; });
    },
    // pionul (al culorii date) atins de rază, dacă e unul dintre cei evidențiați
    pick(raycaster, color) {
      const candidates = (pawns[color] ?? []).filter(p => p.ring.visible).map(p => p.mesh);
      const hit = raycaster.intersectObjects(candidates, true)[0];
      let node = hit?.object;
      while (node && node.userData.index === undefined) node = node.parent;
      return node ? node.userData.index : null;
    },
    get animating() { return Object.values(pawns).some(list => list.some(p => p.path.length)); },
    update(dt) {
      time += dt;
      for (const list of Object.values(pawns)) {
        for (const pawn of list) {
          const target = pawn.path[0];
          if (target) {
            // salt de o căsuță: 0.16 s, cu arc
            pawn.hop = (pawn.hop ?? 0) + dt / 0.16;
            pawn.from ??= pawn.mesh.position.clone().setY(TOP);
            const k = Math.min(1, pawn.hop);
            pawn.mesh.position.lerpVectors(pawn.from, target, k);
            pawn.mesh.position.y = TOP + Math.sin(k * Math.PI) * (pawn.from.distanceTo(target) > CELL * 1.5 ? 0.04 : 0.012);
            if (k >= 1) { pawn.path.shift(); pawn.hop = 0; pawn.from = null; }
          }
          pawn.ring.position.set(pawn.mesh.position.x, TOP + 0.0006, pawn.mesh.position.z);
          if (pawn.ring.visible && !target) pawn.mesh.position.y = TOP + 0.004 + Math.sin(time * 6) * 0.003;
          else if (!target) pawn.mesh.position.y = TOP;
        }
      }
      return dice.update(dt);
    },
  };
}
