// Zaruri pe masă. Întâi găsim o suprafață plană, apoi zarurile cad pe ea cu fizică reală.
// Două moduri de tracking, aceeași scenă și aceeași fizică:
//  - WebXR hit-test: Chrome pe Android (ARCore)
//  - AlvaAR (SLAM monocular în WebAssembly): iPhone Safari și orice browser fără WebXR
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';

// AlvaAR, GPL-3.0 (github.com/alanross/AlvaAR), fixat pe commit; WASM-ul e inclus în fișier (~4 MB)
const ALVA_URL = 'https://cdn.jsdelivr.net/gh/alanross/AlvaAR@7796af500ee92001ac2a9888363ff64d7a3bee75/examples/public/assets/alva_ar.js';

const SIZE = 0.04; // 4 cm, puțin peste un zar real ca să se vadă bine pe telefon
// Ordinea materialelor la BoxGeometry: +X, -X, +Y, -Y, +Z, -Z. Fețele opuse însumează 7.
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const LIME = 0xc9ff4a;

// Calibrare pentru modul SLAM (camera unui telefon nu e niciodată ideală, de-asta sunt reglabile din URL):
// FOV pe latura lungă a camerei principale de telefon ≈ 67°  (?fov=70)
// distanța presupusă telefon → masă când o găsim ≈ 45 cm, de aici scara lumii SLAM (?dist=0.45)
const params = new URLSearchParams(location.search);
const CAMERA_FOV_LONG = Number(params.get('fov')) || 67;
const ASSUMED_DISTANCE = Number(params.get('dist')) || 0.45;

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

// Masa: tot ce e aici e în metri, în cadrul local al suprafeței (+Y = normala, suprafața la y = 0).
// Driverul de tracking doar mută/rotește/scalează grupul `group`.
function createDiceTable(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777766, 2));

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(0.25, 0.8, 0.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  group.add(sun, sun.target);

  // Cercul cu grilă = „am găsit suprafața aici”
  const marker = new THREE.Group();
  const grid = new THREE.PolarGridHelper(0.16, 8, 4, 48, LIME, LIME);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.16, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.12, depthWrite: false }));
  marker.add(grid, disc);
  group.add(marker);

  // Plan invizibil care primește doar umbrele: ce leagă vizual zarurile de masa reală
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.4 }));
  shadowPlane.receiveShadow = true;
  shadowPlane.position.y = 0.0005;
  group.add(shadowPlane);

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
  const diceMaterial = new CANNON.Material(), tableMaterial = new CANNON.Material();
  world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, tableMaterial, { friction: 0.3, restitution: 0.35 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, { friction: 0.2, restitution: 0.3 }));
  // ponytail: masa e un plan infinit, zarurile nu cad de pe margine; margini reale -> plane detection cu contur
  const table = new CANNON.Body({ mass: 0, material: tableMaterial, shape: new CANNON.Plane() });
  table.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(table);

  const geometry = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, SIZE * 0.14);
  const materials = FACE_VALUES.map(v => new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.35 }));
  const dice = [0, 1].map(() => {
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.visible = false;
    group.add(mesh);
    const body = new CANNON.Body({ mass: 0.02, material: diceMaterial, shape: new CANNON.Box(new CANNON.Vec3(SIZE / 2, SIZE / 2, SIZE / 2)), sleepSpeedLimit: 0.05, sleepTimeLimit: 0.3 });
    world.addBody(body);
    body.sleep();
    return { mesh, body };
  });

  let rolling = false, thrownAt = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const topValue = mesh => {
    let best = -2, value = 0;
    AXES.forEach((axis, i) => {
      const d = axis.clone().applyQuaternion(mesh.quaternion).dot(up);
      if (d > best) { best = d; value = FACE_VALUES[i]; }
    });
    return value;
  };

  return {
    group,
    marker,
    dice,
    // umbra se calculează în unități de lume, deci trebuie să urmeze scara mesei
    setScale(s) {
      group.scale.setScalar(s);
      Object.assign(sun.shadow.camera, { near: 0.01 * s, far: 3 * s, left: -0.4 * s, right: 0.4 * s, top: 0.4 * s, bottom: -0.4 * s });
      sun.shadow.camera.updateProjectionMatrix();
    },
    // aruncă dinspre cameră spre centrul mesei
    throwFrom(cameraWorldPosition) {
      group.updateMatrixWorld(true);
      const cam = group.worldToLocal(cameraWorldPosition.clone());
      const forward = new THREE.Vector3(-cam.x, 0, -cam.z);
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      const side = new THREE.Vector3(-forward.z, 0, forward.x);
      // aruncare scurtă cu mult spin: zarurile se rostogolesc, dar rămân lângă punctul ales
      dice.forEach((d, i) => {
        const start = forward.clone().multiplyScalar(-0.06).addScaledVector(side, i ? 0.025 : -0.025);
        d.body.position.set(start.x, 0.12, start.z);
        d.body.quaternion.setFromEuler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3);
        const speed = 0.15 + Math.random() * 0.15;
        d.body.velocity.set(forward.x * speed, 0.2, forward.z * speed);
        d.body.angularVelocity.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
        d.body.wakeUp();
        d.mesh.visible = true;
      });
      marker.visible = false;
      rolling = true;
      thrownAt = performance.now();
    },
    // pas de fizică; întoarce [a, b] o singură dată, când zarurile s-au oprit
    step(dt) {
      world.step(1 / 120, dt, 8);
      for (const d of dice) {
        d.mesh.position.copy(d.body.position);
        d.mesh.quaternion.copy(d.body.quaternion);
      }
      // după 6 s citim oricum, ca să nu rămână blocat
      if (rolling && (dice.every(d => d.body.sleepState === CANNON.Body.SLEEPING) || performance.now() - thrownAt > 6000)) {
        rolling = false;
        return dice.map(d => topValue(d.mesh));
      }
      return null;
    },
    reset() {
      rolling = false;
      dice.forEach(d => { d.mesh.visible = false; d.body.sleep(); });
      marker.visible = true;
    },
  };
}

const resultText = ([a, b]) => `${a} + ${b} = ${a + b}${a === b ? ' — dublă!' : ''} · atinge ecranul ca să arunci iar`;

function makeRenderer(width, height) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export async function webXRSupported() {
  return !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
}

// ---------------------------------------------------------------- WebXR (Android)

export async function startWebXR({ overlay, status, setState, onEnd }) {
  const renderer = makeRenderer(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  document.body.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const table = createDiceTable(scene);
  table.setScale(1);
  table.group.matrixAutoUpdate = false;

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: overlay },
  });
  await renderer.xr.setSession(session);
  const hitSource = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });

  // scanning → found (cercul urmărește suprafața) → placed (masa fixată, aruncăm)
  let state = 'scanning', stableHits = 0, last = 0;
  const go = next => { state = next; setState(next); };
  go('scanning');
  status('Caut o suprafață plană… îndreaptă camera spre masă și mișc-o încet.');

  session.addEventListener('select', () => {
    if (state === 'scanning') return;
    if (state === 'found') go('placed');
    table.throwFrom(renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()));
    status('Se rostogolesc…');
  });
  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    renderer.dispose();
    onEnd();
  });

  renderer.setAnimationLoop((time, frame) => {
    const dt = last ? Math.min((time - last) / 1000, 0.05) : 1 / 60;
    last = time;
    if (state !== 'placed') {
      const hit = frame?.getHitTestResults(hitSource)[0];
      stableHits = hit ? stableHits + 1 : 0;
      if (hit) {
        // pose-ul hit-test-ului are axa Y pe normala suprafeței, exact cadrul mesei
        table.group.matrix.fromArray(hit.getPose(renderer.xr.getReferenceSpace()).transform.matrix);
        table.group.updateMatrixWorld(true);
      }
      table.group.visible = stableHits > 0;
      if (state === 'scanning' && stableHits > 15) {
        go('found');
        status('Am găsit suprafața! Atinge ecranul ca să arunci zarurile pe ea.');
      }
    }
    const result = table.step(dt);
    if (result) status(resultText(result));
    renderer.render(scene, camera);
  });

  return {
    end: () => session.end(),
    replace: () => { table.reset(); stableHits = 0; go('scanning'); status('Caut din nou suprafața…'); },
  };
}

// ---------------------------------------------------------------- AlvaAR SLAM (iPhone & restul)

// Același mapping ca AlvaARConnectorTHREE din exemplele AlvaAR
function applyPose(pose, quaternion, position) {
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(pose));
  quaternion.set(-q.x, q.y, q.z, q.w);
  position.set(pose[12], -pose[13], -pose[14]);
}

async function openSource(videoUrl) {
  const video = document.createElement('video');
  Object.assign(video, { muted: true, playsInline: true, autoplay: true });
  video.setAttribute('playsinline', '');
  if (videoUrl) {
    // pentru teste: un video înregistrat în loc de cameră
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.src = videoUrl;
  } else {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  }
  await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Video indisponibil')); });
  await video.play();
  return video;
}

export async function startSlam({ root, status, setState, onEnd, videoUrl }) {
  status('Pornesc camera…');
  const video = await openSource(videoUrl);
  status('Încarc motorul de tracking (~4 MB)…');
  const { AlvaAR } = await import(ALVA_URL);

  const viewW = root.clientWidth, viewH = root.clientHeight;
  // SLAM-ul rulează pe o imagine mai mică (≈0.4 MP) ca să țină pasul pe telefon
  const k = Math.min(1, Math.sqrt(400000 / (viewW * viewH)));
  const w = Math.round(viewW * k), h = Math.round(viewH * k);

  // video-ul e afișat „cover” în canvas; focala în pixeli de canvas vine din FOV-ul camerei
  const vw = video.videoWidth, vh = video.videoHeight;
  const cover = Math.max(w / vw, h / vh);
  const focal = (Math.max(vw, vh) / 2) / Math.tan(CAMERA_FOV_LONG * Math.PI / 360) * cover;
  const dx = (w - vw * cover) / 2, dy = (h - vh * cover) / 2;
  // AlvaAR își deduce singur intrinsecii dintr-un FOV generic; îi dăm focala calculată
  AlvaAR.prototype.getCameraIntrinsics = (width, height) => ({ width, height, fx: focal, fy: focal, cx: width / 2, cy: height / 2, k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 });
  const alva = await AlvaAR.Initialize(w, h);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.className = 'slam-layer';
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  video.className = 'slam-video';
  const renderer = makeRenderer(viewW, viewH);
  renderer.domElement.className = 'slam-layer';
  root.append(video, canvas, renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(2 * Math.atan(h / 2 / focal) * 180 / Math.PI, w / h, 0.001, 1000);
  scene.add(camera);
  const table = createDiceTable(scene);

  // „Sus” din giroscop, în cadrul camerei. Normala dată de AlvaAR are ~7° eroare (măsurat pe video
  // cu adevăr cunoscut), iar o masă e mereu orizontală, așa că preferăm gravitația când o avem.
  // ponytail: presupune telefon în portret; pentru landscape -> compensat cu screen.orientation.angle
  let up = null;
  const onOrientation = event => {
    if (event.beta == null || event.gamma == null) return;
    const b = event.beta * Math.PI / 180, g = event.gamma * Math.PI / 180;
    up = new THREE.Vector3(-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g));
  };
  addEventListener('deviceorientation', onOrientation);

  let state = 'scanning', frameCount = 0, raf = 0, last = 0, everTracked = false;
  const stats = { frames: 0, poses: 0, planeTries: 0 };
  const debug = {};
  const go = next => { state = next; setState(next); };
  go('scanning');
  status('Mișcă telefonul încet stânga–dreapta deasupra mesei. Punctele albe = ce vede camera.');

  function placeTable(planePose) {
    debug.planePose = Array.from(planePose);
    debug.cameraPoseAtPlane = camera.matrixWorld.toArray();
    const q = new THREE.Quaternion(), p = new THREE.Vector3();
    applyPose(planePose, q, p);
    const toCamera = camera.position.clone().sub(p);
    // normala: din gravitație dacă avem giroscop, altfel axa +Z a planului AlvaAR, întoarsă spre cameră
    const normal = up ? up.clone().applyQuaternion(camera.quaternion) : new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    if (normal.dot(toCamera) < 0) normal.negate();
    table.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.normalize());
    table.group.position.copy(p);
    debug.normalSource = up ? 'gyro' : 'alva';
    surface.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0).applyQuaternion(table.group.quaternion), p);
    // SLAM-ul monocular nu știe metri: scara reiese din distanța presupusă până la masă
    table.setScale(toCamera.length() / ASSUMED_DISTANCE);
    table.group.visible = true;
    go('found');
    status('Am găsit masa! Atinge ecranul ca să arunci zarurile pe ea.');
  }

  // punctul de pe masă de sub un punct de pe ecran (NDC); null dacă raza nu atinge masa
  const surface = new THREE.Plane(), raycaster = new THREE.Raycaster();
  function pointOnSurface(x, y) {
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    return raycaster.ray.intersectPlane(surface, new THREE.Vector3());
  }

  function onTap(event) {
    if (event.target.closest('button')) return;
    if (state === 'scanning') { status('Încă nu am găsit masa — mișcă telefonul încet, cu masa în cadru.'); return; }
    if (state === 'found') {
      // masa se fixează exact unde ai atins
      const rect = root.getBoundingClientRect();
      const hit = pointOnSurface((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      if (hit) table.group.position.copy(hit);
      table.setScale(camera.position.distanceTo(table.group.position) / ASSUMED_DISTANCE);
      go('placed');
    }
    table.throwFrom(camera.position);
    status('Se rostogolesc…');
  }
  root.addEventListener('click', onTap);

  function loop(time) {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((time - last) / 1000, 0.05) : 1 / 60;
    last = time;
    frameCount += 1;

    ctx.drawImage(video, dx, dy, vw * cover, vh * cover);
    const pose = alva.findCameraPose(ctx.getImageData(0, 0, w, h));
    stats.frames += 1;
    if (pose) stats.poses += 1;

    if (pose) {
      everTracked = true;
      applyPose(pose, camera.quaternion, camera.position);
      if (state === 'scanning' && frameCount % 5 === 0) {
        stats.planeTries += 1;
        const planePose = alva.findPlane();
        // findPlane raportează uneori succes cu rotație NaN; o ignorăm și reîncercăm
        if (planePose && planePose.every(Number.isFinite)) placeTable(planePose);
      }
      // cât căutăm locul, cercul urmărește centrul ecranului pe suprafață
      if (state === 'found') {
        const hit = pointOnSurface(0, 0);
        if (hit) {
          table.group.position.copy(hit);
          table.setScale(camera.position.distanceTo(hit) / ASSUMED_DISTANCE);
        }
      }
      table.group.visible = state !== 'scanning';
    } else {
      table.group.visible = false;
      ctx.fillStyle = '#fff';
      for (const point of alva.getFramePoints()) ctx.fillRect(point.x - 1, point.y - 1, 3, 3);
      if (everTracked && state !== 'scanning') status('Am pierdut urmărirea — revino încet cu camera spre masă.');
    }

    const result = table.step(dt);
    if (result) status(resultText(result));
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);

  // pentru testele automate
  window.__tableDice = { get state() { return state; }, stats, debug, dice: table.dice, group: table.group, camera, size: { w, h, focal } };

  const end = () => {
    cancelAnimationFrame(raf);
    root.removeEventListener('click', onTap);
    removeEventListener('deviceorientation', onOrientation);
    video.srcObject?.getTracks().forEach(track => track.stop());
    video.pause();
    root.replaceChildren();
    renderer.dispose();
    onEnd();
  };
  return {
    end,
    replace: () => { table.reset(); table.group.visible = false; go('scanning'); status('Caut din nou masa… mișcă telefonul încet.'); },
  };
}
