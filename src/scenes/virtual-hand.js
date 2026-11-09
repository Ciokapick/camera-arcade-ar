import * as THREE from 'three';

// Mănușă stilizată: palma în XY, degetele spre +Y, îndoire spre +Z.
export function createVirtualHand(color = 0xffd2a5) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x536dfe, roughness: 0.55 });
  const ball = new THREE.SphereGeometry(1, 12, 8);
  function part(parent, xyz, scale, material = skin) {
    const mesh = new THREE.Mesh(ball, material);
    mesh.position.set(...xyz); mesh.scale.set(...scale);
    mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  part(group, [0, 0, 0], [0.032, 0.036, 0.012]);
  part(group, [0, -0.038, 0], [0.025, 0.012, 0.013], cuff);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const joints = [], length = [0.024, 0.027, 0.025, 0.020][i];
    let parent = group;
    for (let j = 0; j < 3; j++) {
      const joint = new THREE.Group();
      joint.position.set(j ? 0 : (i - 1.5) * 0.015, j ? length * 0.78 : 0.022, 0);
      parent.add(joint);
      part(joint, [0, length * 0.4, 0], [0.007, length * 0.52, 0.007]);
      joints.push(joint); parent = joint;
    }
    fingers.push(joints);
  }
  const thumb = new THREE.Group();
  thumb.position.set(-0.027, -0.006, 0.004); thumb.rotation.z = 0.8;
  group.add(thumb);
  part(thumb, [0, 0.014, 0], [0.009, 0.023, 0.009]);
  const targets = [0, 0, 0, 0];
  let thumbTarget = 0;
  function pose(gesture) {
    const open = gesture === 'Hârtie' || gesture === 'open';
    const cup = gesture === 'cup';
    targets.forEach((_, i) => { targets[i] = open || (gesture === 'Foarfecă' && i < 2) ? 0.04 : cup ? 0.45 : 1.35; });
    thumbTarget = open ? 0.1 : cup ? 0.5 : 1.1;
  }
  function update(dt) {
    const k = 1 - Math.exp(-Math.max(0, dt) * 18);
    fingers.forEach((joints, i) => joints.forEach(joint => { joint.rotation.x += (targets[i] - joint.rotation.x) * k; }));
    fingers[0][0].rotation.z += ((targets[0] < 0.1 && targets[2] > 1 ? 0.15 : 0.03) - fingers[0][0].rotation.z) * k;
    fingers[1][0].rotation.z += ((targets[1] < 0.1 && targets[2] > 1 ? -0.15 : 0) - fingers[1][0].rotation.z) * k;
    thumb.rotation.x += (thumbTarget - thumb.rotation.x) * k;
  }
  return { group, pose, update, dispose() { ball.dispose(); skin.dispose(); cuff.dispose(); } };
}
