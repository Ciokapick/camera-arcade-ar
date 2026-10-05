// Zaruri pe masă: WebXR hit-test găsește suprafața reală, cannon-es simulează aruncarea.
// Suport: Chrome pe Android (ARCore). iOS Safari nu are WebXR immersive-ar.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';

const SIZE = 0.04; // 4 cm, puțin peste un zar real ca să se vadă bine pe telefon
// Ordinea materialelor la BoxGeometry: +X, -X, +Y, -Y, +Z, -Z. Fețele opuse însumează 7.
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const UP = new THREE.Vector3(0, 1, 0);

function faceTexture(value) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  const ivory = g.createRadialGradient(90, 70, 10, 128, 128, 200);
  ivory.addColorStop(0, '#fffdf8');
  ivory.addColorStop(1, '#e3dac8');
  g.fillStyle = ivory;
  g.fillRect(0, 0, 256, 256);
  for (const i of PIPS[value]) {
    const x = 56 + (i % 3) * 72, y = 56 + Math.floor(i / 3) * 72;
    g.fillStyle = value === 1 ? '#b3121f' : '#14161a';
    g.beginPath();
    g.arc(x, y, value === 1 ? 30 : 21, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function topValue(mesh) {
  let best = -2, value = 0;
  AXES.forEach((axis, i) => {
    const d = axis.clone().applyQuaternion(mesh.quaternion).dot(UP);
    if (d > best) { best = d; value = FACE_VALUES[i]; }
  });
  return value;
}

export async function startTableDice({ overlay, status, onEnd }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.shadowMap.enabled = true;
  document.body.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777766, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { near: 0.01, far: 3, left: -0.4, right: 0.4, top: 0.4, bottom: -0.4 });
  scene.add(sun, sun.target);

  // Cercul care arată unde a găsit suprafața
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.045, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc9ff4a }));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Plan invizibil care primește doar umbrele zarurilor
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.35 }));
  shadowPlane.receiveShadow = true;
  shadowPlane.visible = false;
  scene.add(shadowPlane);

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
  const diceMaterial = new CANNON.Material(), tableMaterial = new CANNON.Material();
  world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, tableMaterial, { friction: 0.3, restitution: 0.35 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, { friction: 0.2, restitution: 0.3 }));
  // ponytail: masa e un plan infinit, zarurile nu cad de pe margine; pentru margini reale -> plane detection (XRPlane)
  const table = new CANNON.Body({ mass: 0, material: tableMaterial, shape: new CANNON.Plane() });
  table.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(table);

  const geometry = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, SIZE * 0.14);
  const materials = FACE_VALUES.map(v => new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.35 }));
  const dice = [0, 1].map(() => {
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    const body = new CANNON.Body({ mass: 0.02, material: diceMaterial, shape: new CANNON.Box(new CANNON.Vec3(SIZE / 2, SIZE / 2, SIZE / 2)), sleepSpeedLimit: 0.05, sleepTimeLimit: 0.3 });
    world.addBody(body);
    body.sleep();
    return { mesh, body };
  });

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: overlay },
  });
  await renderer.xr.setSession(session);
  const hitSource = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });

  let rolling = false, thrownAt = 0, last = 0;

  function throwDice() {
    if (!reticle.visible) { status('Mișcă telefonul încet deasupra mesei până apare cercul'); return; }
    const target = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
    table.position.y = target.y;
    shadowPlane.position.set(target.x, target.y + 0.0005, target.z);
    shadowPlane.visible = true;
    sun.position.set(target.x + 0.25, target.y + 0.8, target.z + 0.15);
    sun.target.position.copy(target);

    const cam = renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
    const forward = target.clone().sub(cam).setY(0).normalize();
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    dice.forEach((d, i) => {
      const start = target.clone().addScaledVector(forward, -0.15).addScaledVector(side, i ? 0.03 : -0.03);
      d.body.position.set(start.x, target.y + 0.15, start.z);
      d.body.quaternion.setFromEuler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3);
      const speed = 0.6 + Math.random() * 0.3;
      d.body.velocity.set(forward.x * speed, 0.3, forward.z * speed);
      d.body.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
      d.body.wakeUp();
      d.mesh.visible = true;
    });
    rolling = true;
    thrownAt = performance.now();
    status('Se rostogolesc…');
  }

  session.addEventListener('select', throwDice);
  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    renderer.dispose();
    onEnd();
  });

  renderer.setAnimationLoop((time, frame) => {
    const dt = last ? Math.min((time - last) / 1000, 0.05) : 1 / 60;
    last = time;
    world.step(1 / 120, dt, 8);
    for (const d of dice) {
      d.mesh.position.copy(d.body.position);
      d.mesh.quaternion.copy(d.body.quaternion);
    }
    // gata când ambele zaruri dorm; după 6 s citim oricum, ca să nu rămână blocat
    if (rolling && (dice.every(d => d.body.sleepState === CANNON.Body.SLEEPING) || performance.now() - thrownAt > 6000)) {
      rolling = false;
      const [a, b] = dice.map(d => topValue(d.mesh));
      status(`${a} + ${b} = ${a + b}${a === b ? ' — dublă!' : ''} · atinge ecranul ca să arunci iar`);
    }
    const hit = frame?.getHitTestResults(hitSource)[0];
    reticle.visible = !!hit;
    if (hit) reticle.matrix.fromArray(hit.getPose(renderer.xr.getReferenceSpace()).transform.matrix);
    renderer.render(scene, camera);
  });

  status('Îndreaptă camera spre masă. Când apare cercul, atinge ecranul ca să arunci.');
  return session;
}
