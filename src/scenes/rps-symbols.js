import * as THREE from 'three';

const COLORS = { 'Piatră': 0x9aa0a8, 'Hârtie': 0xf4f1e8, 'Foarfecă': 0xd8dde3 };

function linedPaper() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 170;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, 128, 170);
  g.strokeStyle = 'rgba(70, 110, 200, .45)'; g.lineWidth = 2;
  for (let y = 22; y < 170; y += 14) { g.beginPath(); g.moveTo(8, y); g.lineTo(120, y); g.stroke(); }
  g.strokeStyle = 'rgba(220, 60, 60, .5)'; g.beginPath(); g.moveTo(22, 0); g.lineTo(22, 170); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeModel(gesture) {
  const group = new THREE.Group();
  if (gesture === 'Piatră') {
    const geometry = new THREE.IcosahedronGeometry(0.03, 1);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.82 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.3;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.85, pos.getZ(i) * k);
    }
    geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: COLORS['Piatră'], roughness: 0.95, flatShading: true })));
  } else if (gesture === 'Hârtie') {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.073, 6, 1), new THREE.MeshStandardMaterial({ map: linedPaper(), roughness: 0.9, side: THREE.DoubleSide }));
    // ușor curbată
    const pos = sheet.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 0.055 + 0.5) * Math.PI) * 0.006);
    sheet.geometry.computeVertexNormals();
    group.add(sheet);
  } else {
    const steel = new THREE.MeshStandardMaterial({ color: COLORS['Foarfecă'], metalness: 0.8, roughness: 0.25 });
    const grip = new THREE.MeshStandardMaterial({ color: 0xe5484d, roughness: 0.5 });
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.002), steel);
      blade.position.y = 0.025;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0028, 8, 20), grip);
      ring.position.y = -0.012;
      arm.add(blade, ring);
      arm.rotation.z = side * 0.32;
      arm.userData.side = side;
      group.add(arm);
    }
    group.userData.scissors = true;
  }
  group.traverse(o => { o.castShadow = false; });
  return group;
}

export function createGestureSymbols() {
  const group = new THREE.Group(), models = new Map();
  group.position.y = 0.13;
  group.scale.setScalar(0.75);
  return {
    group,
    show(gesture) {
      if (Object.hasOwn(COLORS, gesture) && !models.has(gesture)) {
        const model = makeModel(gesture);
        models.set(gesture, model);
        group.add(model);
      }
      for (const [name, model] of models) model.visible = name === gesture;
    },
    dispose() {
      const resources = new Set();
      group.traverse(o => {
        if (!o.isMesh) return;
        resources.add(o.geometry); resources.add(o.material);
        if (o.material.map) resources.add(o.material.map);
      });
      for (const resource of resources) resource.dispose();
    },
  };
}

