// Scena 3D în care stau zarurile sau tabla. Patru moduri, același conținut:
//  - screen:  fără cameră, vedere 3D pe ecran (merge oriunde)
//  - webxr:   AR pe masă cu WebXR hit-test (Chrome pe Android)
//  - slam:    AR pe masă cu AlvaAR (SLAM în WebAssembly) + giroscop (iPhone și restul)
//  - marker:  AR pe un marker printat — toți cei din cameră văd tabla exact în același loc
//
// Conținutul (`content`) e în metri, +Y în sus, suprafața la y = 0: { group, update(dt), pick?(raycaster) → bool,
// facing?: direcția (locală) care trebuie să fie spre jucător, footprint: raza zonei ocupate,
// hands?(list): mâinile reale din cameră (doar slam și marker — WebXR nu dă acces la imaginea camerei) }.
import * as THREE from 'three';
import { loadHandTracker, classify, openness } from './hands.js';

// 8th Wall Engine (Niantic Spatial) — urmărirea mesei principală: SLAM testat ani de zile în Safari pe iPhone.
// Binarul e gratuit, cu licență proprie (nu open source): github.com/8thwall/engine/blob/main/LICENSE
const XR8_URL = 'https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1.0.0/dist/xr.js';
// AlvaAR, GPL-3.0 (github.com/alanross/AlvaAR), fixat pe commit; WASM-ul e inclus în fișier (~4 MB) — rezervă
const ALVA_URL = 'https://cdn.jsdelivr.net/gh/alanross/AlvaAR@7796af500ee92001ac2a9888363ff64d7a3bee75/examples/public/assets/alva_ar.js';
// js-aruco2 (MIT): detecție markeri ArUco + POSIT pentru poziția 3D
const ARUCO_BASE = 'https://cdn.jsdelivr.net/npm/js-aruco2@2.0.0/src/';
export const MARKER_ID = 7;

// Calibrare (camera unui telefon nu e niciodată ideală, de-asta sunt reglabile din URL):
// ?fov=67  câmpul vizual al camerei pe latura lungă (grade); ?dist=0.45 distanța presupusă telefon → masă (m);
// ?marker=0.15 latura markerului printat (m)
const params = new URLSearchParams(location.search);
const CAMERA_FOV_LONG = Number(params.get('fov')) || 67;
const ASSUMED_DISTANCE = Number(params.get('dist')) || 0.45;
export const MARKER_SIZE = Number(params.get('marker')) || 0.15;
export const CAMERA_FOV = CAMERA_FOV_LONG;
const LIME = 0xc9ff4a;

export async function webXRSupported() {
  return !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
}

function makeRenderer(width, height, alpha) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

// Lumini, umbre și cercul de plasare — comune tuturor modurilor. `anchor` e cadrul suprafeței.
function createWorld(content) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777766, 2));
  const anchor = new THREE.Group();
  scene.add(anchor);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(0.25, 0.8, 0.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  anchor.add(sun, sun.target);
  // plan invizibil care primește doar umbrele: ce leagă vizual obiectele de masa reală
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.4 }));
  shadowPlane.receiveShadow = true;
  shadowPlane.position.y = 0.0005;
  anchor.add(shadowPlane);
  // cercul cu grilă = „am găsit suprafața aici”
  const r = content.footprint ?? 0.16;
  const reticle = new THREE.Group();
  const grid = new THREE.PolarGridHelper(r, 8, 4, 48, LIME, LIME);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  reticle.add(grid, new THREE.Mesh(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.12, depthWrite: false })));
  anchor.add(reticle, content.group);

  const setScale = s => {
    anchor.scale.setScalar(s);
    Object.assign(sun.shadow.camera, { near: 0.01 * s, far: 3 * s, left: -0.4 * s, right: 0.4 * s, top: 0.4 * s, bottom: -0.4 * s });
    sun.shadow.camera.updateProjectionMatrix();
  };
  setScale(1);
  return { scene, anchor, reticle, shadowPlane, setScale };
}

// Rotește conținutul ca direcția `facing` să fie spre cameră (ex.: culoarea ta în fața ta)
function faceCamera(content, cameraWorld) {
  if (!content.facing) return;
  content.group.rotation.y = 0;
  content.group.updateMatrixWorld(true);
  const c = content.group.worldToLocal(cameraWorld.clone());
  content.group.rotation.y = Math.atan2(c.x, c.z) - Math.atan2(content.facing.x, content.facing.z);
}

// Camera / video de test, cu calculul focalei (în pixeli de canvas) pentru afișare „cover”
async function openSource(videoUrl, facingMode = 'environment') {
  const video = document.createElement('video');
  Object.assign(video, { muted: true, playsInline: true, autoplay: true });
  video.setAttribute('playsinline', '');
  if (videoUrl) {
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.src = videoUrl;
  } else {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  }
  await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Video indisponibil')); });
  await video.play();
  video.className = 'stage-video';
  return video;
}

function coverLayout(video, viewW, viewH, maxPixels) {
  const k = Math.min(1, Math.sqrt(maxPixels / (viewW * viewH)));
  const w = Math.round(viewW * k), h = Math.round(viewH * k);
  const vw = video.videoWidth, vh = video.videoHeight;
  const cover = Math.max(w / vw, h / vh);
  const focal = (Math.max(vw, vh) / 2) / Math.tan(CAMERA_FOV_LONG * Math.PI / 360) * cover;
  return { w, h, vw, vh, cover, focal, dx: (w - vw * cover) / 2, dy: (h - vh * cover) / 2 };
}

// ---------------------------------------------------------------- mâinile reale în scenă
// Hand Landmarker rulează pe cadrul din canvas (cel pe care îl vede și tracking-ul), deci un reper al mâinii
// (x, y normalizate) dă direct o rază prin camera three. Distanța până la mână o estimăm din mărimea ei:
// încheietură → baza degetului mijlociu ≈ 8,5 cm, lățimea palmei ≈ 7 cm.
const dist2 = (a, b, w, h) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
export function makeHand(landmarks, { width, height, focal, camera, metersToWorld = 1 }) {
  const pxPerMeter = Math.max(dist2(landmarks[0], landmarks[9], width, height) / 0.085, dist2(landmarks[5], landmarks[17], width, height) / 0.07);
  const depth = focal / pxPerMeter; // metri
  const at = p => (typeof p === 'number' ? landmarks[p] : p);
  return {
    landmarks,
    gesture: classify(landmarks),
    open: openness(landmarks, width / height),
    depth,
    // degetul mare lipit de arătător (relativ la mărimea palmei)
    pinch: dist2(landmarks[4], landmarks[8], width, height) < dist2(landmarks[5], landmarks[17], width, height) * 0.55,
    mid: (a, b) => ({ x: (landmarks[a].x + landmarks[b].x) / 2, y: (landmarks[a].y + landmarks[b].y) / 2 }),
    // centrul palmei: media încheieturii și a bazelor celor 4 degete
    palm: () => ({ x: [0, 5, 9, 13, 17].reduce((s, i) => s + landmarks[i].x, 0) / 5, y: [0, 5, 9, 13, 17].reduce((s, i) => s + landmarks[i].y, 0) / 5 }),
    ray(p) {
      const q = at(p), r = new THREE.Raycaster();
      r.setFromCamera(new THREE.Vector2(q.x * 2 - 1, 1 - q.y * 2), camera);
      return r;
    },
    // poziția 3D aproximativă (în lume) a unui reper: pe raza lui, la distanța estimată (minus `nearer` metri, spre cameră)
    world(p, nearer = 0) {
      const r = this.ray(p).ray;
      return r.origin.clone().addScaledVector(r.direction, (depth - nearer) * metersToWorld);
    },
  };
}

// Din câte în câte cadre căutăm mâna: la fiecare cât ții zarul (content.handsFast), din 2 în 2 pe rândul tău,
// din 4 în 4 când nu e rândul tău (content.handsActive === false) — doar ca mâna să rămână peste tablă.
const handEvery = content => (content.handsFast ? 1 : content.handsActive === false ? 4 : 2);

// Rulează detecția pe `source` (canvas) cât timp scena e deschisă; dă conținutului mâinile. null dacă nu le vrea.
// view (opțional): { width, height, map(p) } — când `source` nu e încadrat ca ecranul, reperele se mută în
// coordonatele ecranului (map), iar mâna se calculează pe dimensiunile ecranului.
function handTracking(source, camera, focal, content, view = null) {
  if (!content.hands) return null;
  let tracker = null, stamp = 0, failed = false;
  loadHandTracker('GPU', 1).catch(() => loadHandTracker('CPU', 1)).then(t => { tracker = t; }, error => { console.warn(error); failed = true; });
  const scale = new THREE.Vector3();
  return {
    get ready() { return !!tracker; },
    get failed() { return failed; },
    // apelat după ce s-a desenat cadrul; întoarce mâinile (ca să le poată desena scena)
    frame() {
      if (!tracker) return [];
      stamp = Math.max(stamp + 1, performance.now());
      let result;
      try { result = tracker.detectForVideo(source, stamp); } catch (error) { console.warn(error); return []; }
      content.group.getWorldScale(scale);
      const f = typeof focal === 'function' ? focal() : focal;
      const hands = (result.landmarks || []).map(l => (view
        ? makeHand(l.map(view.map), { width: view.width, height: view.height, focal: f, camera, metersToWorld: scale.x })
        : makeHand(l, { width: source.width, height: source.height, focal: f, camera, metersToWorld: scale.x })));
      content.hands(hands);
      return hands;
    },
  };
}
// Mâna reală peste tabla virtuală (ocluzie): din imaginea camerei decupăm silueta mâinii — oasele degetelor ca
// linii groase + palma — și o desenăm pe un strat deasupra scenei 3D. Ce ții în mână (zarul, pionul, piesa) rămâne
// în față: content.holes() → [{ world, radius (m) }] = găuri în siluetă acolo unde e obiectul.
const BONES = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]];
// silueta mâinilor pe ctx: oasele degetelor ca linii groase (thickness × lățimea palmei) + palma
function paintHands(ctx, hands, color, thickness = 0.32) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = color;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const hand of hands) {
    const p = i => [hand.landmarks[i].x * width, hand.landmarks[i].y * height];
    ctx.lineWidth = Math.hypot(p(5)[0] - p(17)[0], p(5)[1] - p(17)[1]) * thickness;
    for (const chain of BONES) {
      ctx.beginPath();
      chain.forEach((i, k) => ctx[k ? 'lineTo' : 'moveTo'](...p(i)));
      ctx.stroke();
    }
    ctx.beginPath();
    [0, 1, 2, 5, 9, 13, 17].forEach((i, k) => ctx[k ? 'lineTo' : 'moveTo'](...p(i)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
export function handOcclusion(root, width, height) {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  layer.className = 'stage-layer';
  layer.style.pointerEvents = 'none';
  root.append(layer);
  const ctx = layer.getContext('2d');
  const mask = document.createElement('canvas');
  mask.width = width;
  mask.height = height;
  const m = mask.getContext('2d');
  const v = new THREE.Vector3();
  return {
    ctx,
    draw(frame, hands, camera, focal, content, rect = [0, 0, width, height]) {
      ctx.clearRect(0, 0, width, height);
      if (!hands.length) return;
      m.clearRect(0, 0, width, height);
      paintHands(m, hands, '#fff'); // grosimea unui deget ≈ 0,32 × lățimea palmei
      // găurile: obiectele ținute în mână rămân în fața degetelor
      m.globalCompositeOperation = 'destination-out';
      const scale = content.group.getWorldScale(new THREE.Vector3()).x;
      for (const { world, radius } of content.holes?.() ?? []) {
        v.copy(world).project(camera);
        const depth = camera.position.distanceTo(world);
        if (v.z > 1 || depth <= 0) continue;
        m.beginPath();
        m.arc((v.x + 1) / 2 * width, (1 - v.y) / 2 * height, focal * radius * scale / depth, 0, Math.PI * 2);
        m.fill();
      }
      m.globalCompositeOperation = 'source-over';
      // pixelii camerei, doar unde e mâna
      ctx.drawImage(frame, ...rect);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    },
    remove() { layer.remove(); },
  };
}

// puncte mici pe vârful degetelor mare și arătător (verzi când le ții lipite) — ca să vezi că te vede.
// Cu zarul în mână (content.handsFast) și conturul palmei: verde = deschisă, portocaliu = pumn.
const PALM = [0, 1, 5, 9, 13, 17];
function drawHandHints(ctx, hands, palms = false) {
  for (const hand of hands) {
    if (palms) {
      ctx.beginPath();
      PALM.forEach((i, k) => ctx[k ? 'lineTo' : 'moveTo'](hand.landmarks[i].x * ctx.canvas.width, hand.landmarks[i].y * ctx.canvas.height));
      ctx.closePath();
      // doar conturul (umplut ar colora zarul ținut în palmă)
      ctx.strokeStyle = hand.open < 1.4 ? '#fb923c' : '#c9ff4a';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const i of [4, 8]) {
      const p = hand.landmarks[i];
      ctx.beginPath();
      ctx.arc(p.x * ctx.canvas.width, p.y * ctx.canvas.height, 7, 0, Math.PI * 2);
      ctx.fillStyle = hand.pinch ? '#c9ff4a' : 'rgba(255,255,255,.85)';
      ctx.fill();
    }
  }
}

const ndcFromEvent = (event, element) => {
  const rect = element.getBoundingClientRect();
  return new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
};

/**
 * Deschide scena. Întoarce { mode, close(), replace(), cameraLocal() }.
 * status(text) / setState(state) informează interfața; onTap() = atingere care nu a nimerit un pion.
 */
export async function openStage({ root, overlay, mode, content, status, setState = () => {}, onTap = () => {}, videoUrl }) {
  const world = createWorld(content);
  const common = { root, overlay, content, world, status, setState, onTap, videoUrl };
  const stage = mode === 'webxr' ? await startWebXR(common)
    : mode === 'slam' ? await startTable(common)
      : mode === 'marker' ? await startMarker(common)
        : startScreen(common);
  stage.mode = mode;
  stage.content = content;
  // pentru testele automate
  window.__stage = stage;
  return stage;
}

// Atingeri pe scenă: o atingere scurtă = pick/onTap. Dacă `content.drag` acceptă atingerea (ex.: o piesă de Jenga),
// mișcarea degetului merge la drag.move până la ridicare. `canDrag` trebuie să fie fără efecte (isReady poate pune masa).
function tapHandler(root, camera, content, world, onTap, isReady, canDrag = isReady) {
  const raycaster = new THREE.Raycaster();
  const ray = event => raycaster.setFromCamera(ndcFromEvent(event, root), camera);
  let down = null, dragging = false;
  const onDown = event => {
    down = { x: event.clientX, y: event.clientY };
    if (event.target.closest('button, input, a, .panel') || !content.drag || !canDrag(event)) return;
    ray(event);
    dragging = content.drag.start(raycaster, event);
    // degetul poate ieși de pe scenă (peste butoane, în afara ecranului) — ridicarea tot ajunge aici
    if (dragging) root.setPointerCapture?.(event.pointerId);
  };
  const onMove = event => {
    if (!dragging) return;
    ray(event);
    content.drag.move(raycaster, event);
  };
  const onUp = event => {
    if (dragging) { dragging = false; content.drag.end(event); return; }
    if (event.target.closest('button, input, a, .panel')) return;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12) return; // a fost tras, nu atins
    if (!isReady(event)) return;
    ray(event);
    if (!content.pick?.(raycaster)) onTap();
  };
  const onCancel = () => { if (dragging) { dragging = false; content.drag.end(); } };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onCancel);
  const off = () => {
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onCancel);
  };
  off.dragging = () => dragging;
  return off;
}

// ---------------------------------------------------------------- screen: fără AR

function startScreen({ root, content, world, status, setState, onTap }) {
  const renderer = makeRenderer(root.clientWidth, root.clientHeight, false);
  renderer.domElement.className = 'stage-layer';
  root.append(renderer.domElement);
  const { scene, anchor, reticle } = world;
  scene.background = new THREE.Color(0x0b0c0f);
  reticle.visible = false;
  // o suprafață grafit, ca să aibă zarurile și tabla pe ce sta
  const felt = new THREE.Mesh(new THREE.CircleGeometry(3, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.95 }));
  felt.receiveShadow = true;
  felt.position.y = -0.0005;
  anchor.add(felt);
  content.group.visible = true;
  const camera = new THREE.PerspectiveCamera(42, root.clientWidth / root.clientHeight, 0.01, 10);
  if (content.screen) {
    // conținut înalt (turnul, cubul): privim din lateral, spre mijlocul lui
    const { target, elevation, distance } = content.screen;
    const d = distance * (camera.aspect < 0.6 ? 1.2 : 1);
    camera.position.set(0, target[1] + d * Math.sin(elevation), d * Math.cos(elevation));
    camera.lookAt(...target);
  } else {
    const fit = (content.footprint ?? 0.16) * 2.4 / Math.min(1, camera.aspect);
    camera.position.set(0, fit * 1.05, fit * 0.85);
    camera.lookAt(0, 0, 0.01);
  }
  faceCamera(content, camera.position);
  // suprafața se pierde în fundal, fără margine vizibilă — ceața începe abia după joc
  const d = camera.position.length();
  scene.fog = new THREE.Fog(0x0b0c0f, d * 1.3, d * 3.2);

  // tras orizontal = rotești masa
  let drag = null;
  const onDown = e => { drag = { x: e.clientX, yaw: anchor.rotation.y }; };
  // (nu și când tragi de o piesă)
  const onMove = e => { if (drag && e.buttons && !offTap.dragging()) anchor.rotation.y = drag.yaw + (e.clientX - drag.x) * 0.01; };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  const offTap = tapHandler(root, camera, content, world, onTap, () => true);

  setState('placed');
  status('');
  let last = 0, raf = 0;
  const loop = time => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((time - last) / 1000, 0.05) : 1 / 60;
    last = time;
    content.update(dt);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  return {
    camera,
    cameraLocal: () => content.group.worldToLocal(camera.position.clone()),
    replace() {},
    close() {
      cancelAnimationFrame(raf);
      offTap();
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      renderer.domElement.remove();
      renderer.dispose();
    },
  };
}

// ---------------------------------------------------------------- webxr: Android

async function startWebXR({ overlay, content, world, status, setState, onTap }) {
  const renderer = makeRenderer(innerWidth, innerHeight, true);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  document.body.append(renderer.domElement);
  const { scene, anchor, reticle } = world;
  const camera = new THREE.PerspectiveCamera();
  anchor.matrixAutoUpdate = false;
  content.group.visible = false;

  const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay } });
  await renderer.xr.setSession(session);
  const hitSource = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });

  // scanning → found (cercul urmărește suprafața) → placed (masa fixată)
  let state = 'scanning', stableHits = 0, last = 0, closed = false;
  const go = next => { state = next; setState(next); };
  go('scanning');
  status('Caut o suprafață plană… îndreaptă camera spre masă și mișc-o încet.');
  const raycaster = new THREE.Raycaster();
  const cameraWorld = () => renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());

  session.addEventListener('select', event => {
    if (state === 'scanning') return;
    if (state === 'found') {
      go('placed');
      reticle.visible = false;
      content.group.visible = true;
      faceCamera(content, cameraWorld());
      status('');
      return;
    }
    const pose = event.frame.getPose(event.inputSource.targetRaySpace, renderer.xr.getReferenceSpace());
    if (pose) {
      const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
      raycaster.ray.origin.setFromMatrixPosition(m);
      raycaster.ray.direction.set(0, 0, -1).transformDirection(m);
      if (content.pick?.(raycaster)) return;
    }
    onTap();
  });
  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    renderer.dispose();
    if (!closed) setState('closed');
  });

  renderer.setAnimationLoop((time, frame) => {
    const dt = last ? Math.min((time - last) / 1000, 0.05) : 1 / 60;
    last = time;
    if (state !== 'placed') {
      const hit = frame?.getHitTestResults(hitSource)[0];
      stableHits = hit ? stableHits + 1 : 0;
      if (hit) {
        // pose-ul hit-test-ului are axa Y pe normala suprafeței, exact cadrul mesei
        anchor.matrix.fromArray(hit.getPose(renderer.xr.getReferenceSpace()).transform.matrix);
        anchor.updateMatrixWorld(true);
      }
      reticle.visible = stableHits > 0;
      if (state === 'scanning' && stableHits > 15) {
        go('found');
        status('Am găsit suprafața! Atinge ecranul ca să pui jocul acolo.');
      }
    }
    content.update(dt);
    renderer.render(scene, camera);
  });

  return {
    camera,
    cameraLocal: () => content.group.worldToLocal(cameraWorld()),
    replace() { content.group.visible = false; stableHits = 0; go('scanning'); status('Caut din nou suprafața…'); },
    close() { closed = true; session.end().catch(() => {}); },
  };
}

// ---------------------------------------------------------------- pe masă: 8th Wall, altfel AlvaAR

// 8th Wall dacă se poate (nu merge pe video de test); dacă nu se încarcă sau dă eroare, AlvaAR. ?alva = forțat AlvaAR.
async function startTable(common) {
  if (!common.videoUrl && !params.has('alva')) {
    try {
      return await startXR8(common);
    } catch (error) {
      console.warn('8th Wall nu a pornit, trec pe AlvaAR', error);
      common.root.replaceChildren();
    }
  }
  return startSlam(common);
}

let xr8Promise = null;
function loadXR8() {
  xr8Promise ??= new Promise((resolve, reject) => {
    if (window.XR8) return resolve(window.XR8);
    const script = document.createElement('script');
    script.src = XR8_URL;
    script.dataset.preloadChunks = 'slam';
    script.onerror = () => reject(new Error('8th Wall nu s-a încărcat'));
    addEventListener('xrloaded', () => resolve(window.XR8), { once: true });
    setTimeout(() => reject(new Error('8th Wall: timeout')), 30000);
    document.head.append(script);
  }).catch(error => { xr8Promise = null; throw error; });
  return xr8Promise;
}

async function startXR8({ root, content, world, status, setState, onTap }) {
  status('Încarc motorul de tracking (8th Wall)…');
  const XR8 = await loadXR8();
  await XR8.loadChunk?.('slam');
  const W = root.clientWidth, H = root.clientHeight, dpr = Math.min(devicePixelRatio, 2);
  // stratul cu imaginea camerei (îl desenează 8th Wall) și deasupra scena noastră
  const feed = document.createElement('canvas');
  feed.width = Math.round(W * dpr);
  feed.height = Math.round(H * dpr);
  feed.className = 'stage-layer';
  const renderer = makeRenderer(W, H, true);
  renderer.domElement.className = 'stage-layer';
  root.append(feed, renderer.domElement);
  const { scene, anchor, reticle, setScale } = world;
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.01, 1000);
  scene.add(camera);
  anchor.visible = false;
  content.group.visible = false;
  setScale(1);

  let state = 'scanning', frameCount = 0, last = 0, closed = false, focal = H, failed = null;
  const stats = { frames: 0, poses: 0, engine: 'xr8' };
  const go = next => { state = next; setState(next); };
  go('scanning');
  status('Îndreaptă camera spre masă și mișc-o puțin…');

  // „Pământul” lui 8th Wall (y = 0) e masa: pornim camera la ~45 cm deasupra ei, deci unitățile ≈ metri
  XR8.XrController.configure({ scale: 'responsive', disableWorldTracking: false });
  const setOrigin = () => XR8.XrController.updateCameraProjectionMatrix({
    cam: { pixelRectWidth: feed.width, pixelRectHeight: feed.height, nearClipPlane: 0.01, farClipPlane: 1000 },
    origin: { x: 0, y: ASSUMED_DISTANCE, z: 0 },
    facing: { w: 1, x: 0, y: 0, z: 0 },
  });

  // mâinile: le căutăm exact în imaginea pe care o vezi (canvas-ul desenat de 8th Wall), copiată mic (360 px) —
  // deci fără grija orientării / încadrării imaginii brute a camerei
  const handCanvas = document.createElement('canvas');
  handCanvas.width = 360;
  handCanvas.height = Math.round(360 * H / W);
  const handCtx = handCanvas.getContext('2d', { willReadFrequently: true });
  const handsTracking = content.hands ? handTracking(handCanvas, camera, () => focal * handCanvas.width / W, content) : null;
  const occlusion = handsTracking && handOcclusion(root, W, H);
  let lastHands = [];

  // punctul de pe masă de sub (x, y) ∈ [0, 1]: suprafața găsită de 8th Wall, altfel planul y = 0 (masa)
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ray = new THREE.Raycaster();
  const hitAt = (x, y) => {
    const hits = XR8.XrController.hitTest(x, y, ['FEATURE_POINT', 'ESTIMATED_SURFACE', 'DETECTED_SURFACE']);
    const hit = hits.find(h => h.type === 'DETECTED_SURFACE') ?? hits.find(h => h.type === 'ESTIMATED_SURFACE');
    if (hit && Number.isFinite(hit.position.x)) return new THREE.Vector3(hit.position.x, hit.position.y, hit.position.z);
    ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
    return ray.ray.intersectPlane(tablePlane, new THREE.Vector3());
  };
  const place = point => {
    anchor.position.copy(point);
    anchor.quaternion.identity(); // masa = planul y = 0 al lui 8th Wall
    reticle.visible = false;
    content.group.visible = true;
    anchor.visible = true;
    anchor.updateMatrixWorld(true);
    faceCamera(content, camera.position);
    go('placed');
    status('');
  };

  const offTap = tapHandler(root, camera, content, world, onTap, event => {
    if (state === 'scanning') { status('Încă pornesc urmărirea — mișcă puțin telefonul, cu masa în cadru.'); return false; }
    if (state === 'found') {
      const rect = root.getBoundingClientRect();
      const point = hitAt((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height) ?? anchor.position.clone();
      place(point);
      return false;
    }
    return true;
  }, () => state === 'placed');

  const module = {
    name: 'camera-arcade',
    onException: error => { console.warn('8th Wall', error); failed = error; },
    onUpdate: ({ processCpuResult }) => {
      if (closed) return;
      const r = processCpuResult.reality;
      if (r?.intrinsics && Number.isFinite(r.intrinsics[0])) {
        camera.projectionMatrix.fromArray(r.intrinsics);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        focal = r.intrinsics[5] * H / 2;
        camera.position.set(r.position.x, r.position.y, r.position.z);
        camera.quaternion.set(r.rotation.x, r.rotation.y, r.rotation.z, r.rotation.w);
        camera.updateMatrixWorld(true);
        stats.poses += 1;
        if (state === 'scanning' && r.trackingStatus === 'NORMAL') {
          go('found');
          reticle.visible = true;
          anchor.visible = true;
          status('Atinge masa unde vrei să pui jocul.');
        }
        if (state === 'found') {
          const point = hitAt(0.5, 0.55);
          if (point) { anchor.position.copy(point); anchor.quaternion.identity(); }
        }
        if (state === 'placed') status(r.trackingStatus === 'LIMITED' ? 'Urmărirea e slabă — mișcă telefonul mai încet, cu masa în cadru.' : '');
      }
    },
    onRender: () => {
      if (closed) return;
      const now = performance.now(), dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      frameCount += 1;
      stats.frames += 1;
      if (handsTracking && state === 'placed' && frameCount % handEvery(content) === 0) {
        handCtx.drawImage(feed, 0, 0, handCanvas.width, handCanvas.height); // imaginea camerei de pe ecran, abia desenată
        lastHands = handsTracking.frame();
      }
      content.update(dt);
      renderer.render(scene, camera);
      if (occlusion) {
        occlusion.draw(feed, state === 'placed' ? lastHands : [], camera, focal, content);
        if (state === 'placed') drawHandHints(occlusion.ctx, lastHands, content.handsFast);
      }
    },
  };
  XR8.clearCameraPipelineModules();
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.XrController.pipelineModule(),
    module,
  ]);
  // pornește camera; dacă în 12 s nu vine niciun cadru, lăsăm loc rezervei (AlvaAR)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('8th Wall nu a pornit camera')), 12000);
    XR8.addCameraPipelineModule({
      name: 'camera-arcade-start',
      onCameraStatusChange: ({ status: s }) => { if (s === 'failed') { clearTimeout(timer); reject(new Error('camera')); } },
      onStart: () => { clearTimeout(timer); setOrigin(); resolve(); },
    });
    try { XR8.run({ canvas: feed, glContextConfig: { preserveDrawingBuffer: true } }); } catch (error) { clearTimeout(timer); reject(error); }
  }).catch(error => { closed = true; XR8.stop(); XR8.clearCameraPipelineModules(); offTap(); throw error; });

  return {
    camera,
    stats,
    get state() { return state; },
    get failed() { return failed; },
    cameraLocal: () => content.group.worldToLocal(camera.position.clone()),
    replace() { content.group.visible = false; reticle.visible = true; go('found'); status('Atinge masa unde vrei să pui jocul.'); },
    // pe iPhone nu merg două camere deodată (ex.: pariul cu bancnote): oprim 8th Wall cât e nevoie
    pause() { XR8.pause(); },
    resume() { XR8.resume(); },
    close() {
      closed = true;
      offTap();
      XR8.stop();
      XR8.clearCameraPipelineModules();
      occlusion?.remove();
      feed.remove();
      renderer.domElement.remove();
      renderer.dispose();
    },
  };
}

// ---------------------------------------------------------------- slam: AlvaAR (rezervă)

// Același mapping ca AlvaARConnectorTHREE din exemplele AlvaAR
function applyAlvaPose(pose, quaternion, position) {
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(pose));
  quaternion.set(-q.x, q.y, q.z, q.w);
  position.set(pose[12], -pose[13], -pose[14]);
}

async function startSlam({ root, content, world, status, setState, onTap, videoUrl }) {
  status('Pornesc camera…');
  const video = await openSource(videoUrl);
  status('Încarc motorul de tracking (~4 MB)…');
  const { AlvaAR } = await import(ALVA_URL);
  const viewW = root.clientWidth, viewH = root.clientHeight;
  // SLAM-ul rulează pe o imagine mai mică (≈0.4 MP) ca să țină pasul pe telefon
  const L = coverLayout(video, viewW, viewH, 400000);
  // AlvaAR își deduce singur intrinsecii dintr-un FOV generic; îi dăm focala calculată
  AlvaAR.prototype.getCameraIntrinsics = (width, height) => ({ width, height, fx: L.focal, fy: L.focal, cx: width / 2, cy: height / 2, k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 });
  const alva = await AlvaAR.Initialize(L.w, L.h);

  const canvas = document.createElement('canvas');
  canvas.width = L.w;
  canvas.height = L.h;
  canvas.className = 'stage-layer';
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const renderer = makeRenderer(viewW, viewH, true);
  renderer.domElement.className = 'stage-layer';
  root.append(video, canvas, renderer.domElement);

  const { scene, anchor, reticle, setScale } = world;
  const camera = new THREE.PerspectiveCamera(2 * Math.atan(L.h / 2 / L.focal) * 180 / Math.PI, L.w / L.h, 0.001, 1000);
  scene.add(camera);
  anchor.visible = false;
  content.group.visible = false;

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
  const go = next => { state = next; setState(next); };
  go('scanning');
  status('Mișcă telefonul încet stânga–dreapta deasupra mesei. Punctele albe = ce vede camera.');

  const surface = new THREE.Plane(), raycaster = new THREE.Raycaster();
  const pointOnSurface = ndc => {
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(surface, new THREE.Vector3());
  };

  function foundPlane(planePose) {
    const q = new THREE.Quaternion(), p = new THREE.Vector3();
    applyAlvaPose(planePose, q, p);
    const toCamera = camera.position.clone().sub(p);
    // normala: din gravitație dacă avem giroscop, altfel axa +Z a planului AlvaAR, întoarsă spre cameră
    const normal = up ? up.clone().applyQuaternion(camera.quaternion) : new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    if (normal.dot(toCamera) < 0) normal.negate();
    anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.normalize());
    anchor.position.copy(p);
    surface.setFromNormalAndCoplanarPoint(normal, p);
    stats.normalSource = up ? 'gyro' : 'alva';
    go('found');
    status('Am găsit masa! Atinge ecranul unde vrei să pui jocul.');
  }

  const handsTracking = handTracking(canvas, camera, L.focal, content);
  const occlusion = handsTracking && handOcclusion(root, L.w, L.h);
  const slamCanvas = document.createElement('canvas');
  slamCanvas.width = L.w;
  slamCanvas.height = L.h;
  const slamCtx = slamCanvas.getContext('2d', { willReadFrequently: true });
  const smoothQ = new THREE.Quaternion(), smoothP = new THREE.Vector3();
  const offTap = tapHandler(root, camera, content, world, onTap, event => {
    if (state === 'scanning') { status('Încă nu am găsit masa — mișcă telefonul încet, cu masa în cadru.'); return false; }
    if (state === 'found') {
      // jocul se fixează exact unde ai atins; scara SLAM-ului (care nu știe metri) vine din distanța presupusă
      const hit = pointOnSurface(ndcFromEvent(event, root));
      if (hit) anchor.position.copy(hit);
      setScale(camera.position.distanceTo(anchor.position) / ASSUMED_DISTANCE);
      reticle.visible = false;
      content.group.visible = true;
      anchor.updateMatrixWorld(true);
      faceCamera(content, camera.position);
      go('placed');
      status('');
      return false;
    }
    return true;
  }, () => state === 'placed');

  function loop(time) {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((time - last) / 1000, 0.05) : 1 / 60;
    last = time;
    frameCount += 1;
    ctx.drawImage(video, L.dx, L.dy, L.vw * L.cover, L.vh * L.cover);
    // mâna nu e parte din masă: o acoperim în copia pe care o vede tracking-ul, altfel „trage” tabla după ea
    let input = ctx;
    if (lastHands.length) {
      slamCtx.drawImage(canvas, 0, 0);
      paintHands(slamCtx, lastHands, '#7f7f7f', 0.6);
      input = slamCtx;
    }
    const pose = alva.findCameraPose(input.getImageData(0, 0, L.w, L.h));
    stats.frames += 1;
    if (pose) {
      stats.poses += 1;
      everTracked = true;
      applyAlvaPose(pose, smoothQ, smoothP);
      // netezim puțin tremuratul (o urmărire perfectă la fiecare cadru nu există); un salt mare = imediat
      if (camera.position.distanceTo(smoothP) > 0.3 * Math.max(0.01, camera.position.distanceTo(anchor.position))) { camera.position.copy(smoothP); camera.quaternion.copy(smoothQ); }
      else { camera.position.lerp(smoothP, 0.6); camera.quaternion.slerp(smoothQ, 0.6); }
      if (state === 'scanning' && frameCount % 5 === 0) {
        stats.planeTries += 1;
        const planePose = alva.findPlane();
        // findPlane raportează uneori succes cu rotație NaN; o ignorăm și reîncercăm
        if (planePose && planePose.every(Number.isFinite)) foundPlane(planePose);
      }
      if (state === 'found') {
        // cât alegi locul, cercul urmărește centrul ecranului pe suprafață
        const hit = pointOnSurface(new THREE.Vector2(0, 0));
        if (hit) {
          anchor.position.copy(hit);
          setScale(camera.position.distanceTo(hit) / ASSUMED_DISTANCE);
        }
      }
      anchor.visible = state !== 'scanning';
    } else {
      anchor.visible = false;
      ctx.fillStyle = '#fff';
      for (const point of alva.getFramePoints()) ctx.fillRect(point.x - 1, point.y - 1, 3, 3);
      if (everTracked && state === 'placed') status('Am pierdut urmărirea — revino încet cu camera spre masă.');
      else if (state === 'placed') status('');
    }
    if (pose && state === 'placed') status('');
    // mâinile (pe telefon tracking-ul + mâinile deodată sunt grele, așa că nu la fiecare cadru — vezi handEvery)
    if (handsTracking && state === 'placed' && frameCount % handEvery(content) === 0) lastHands = handsTracking.frame();
    content.update(dt);
    renderer.render(scene, camera);
    if (occlusion) {
      occlusion.draw(canvas, state === 'placed' ? lastHands : [], camera, L.focal, content);
      if (state === 'placed') drawHandHints(occlusion.ctx, lastHands, content.handsFast);
    }
  }
  let lastHands = [];
  raf = requestAnimationFrame(loop);

  return {
    camera,
    video,
    stats,
    get state() { return state; },
    cameraLocal: () => content.group.worldToLocal(camera.position.clone()),
    replace() { content.group.visible = false; reticle.visible = true; anchor.visible = false; go('scanning'); status('Caut din nou masa… mișcă telefonul încet.'); },
    close() {
      cancelAnimationFrame(raf);
      offTap();
      removeEventListener('deviceorientation', onOrientation);
      video.srcObject?.getTracks().forEach(track => track.stop());
      video.pause();
      video.remove();
      canvas.remove();
      occlusion?.remove();
      renderer.domElement.remove();
      renderer.dispose();
    },
  };
}

// ---------------------------------------------------------------- marker: tabla comună

let arucoReady;
function loadAruco() {
  // js-aruco2 e scris ca scripturi clasice care pun AR / CV / POS pe window
  arucoReady ??= ['cv.js', 'aruco.js', 'svd.js', 'posit1.js'].reduce((chain, file) => chain.then(() => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ARUCO_BASE + file;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Nu am putut încărca ' + file));
    document.head.append(script);
  })), Promise.resolve());
  return arucoReady;
}

async function startMarker({ root, content, world, status, setState, onTap, videoUrl }) {
  status('Pornesc camera…');
  const video = await openSource(videoUrl);
  await loadAruco();
  const viewW = root.clientWidth, viewH = root.clientHeight;
  const L = coverLayout(video, viewW, viewH, 640 * 480);
  const detector = new window.AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12' });
  const posit = new window.POS.Posit(MARKER_SIZE, L.focal);

  const canvas = document.createElement('canvas');
  canvas.width = L.w;
  canvas.height = L.h;
  canvas.className = 'stage-layer';
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const renderer = makeRenderer(viewW, viewH, true);
  renderer.domElement.className = 'stage-layer';
  root.append(video, canvas, renderer.domElement);

  const { scene, anchor, reticle } = world;
  reticle.visible = false;
  // orientarea vine din marker, la fel pentru toți — fără rotația „culoarea ta spre tine”
  content.group.rotation.y = 0;
  content.group.visible = true;
  // camera stă în origine; markerul dă poziția mesei față de cameră
  const camera = new THREE.PerspectiveCamera(2 * Math.atan(L.h / 2 / L.focal) * 180 / Math.PI, L.w / L.h, 0.01, 100);
  scene.add(camera);
  anchor.visible = false;

  let state = 'scanning', raf = 0, last = 0, seenAt = -1e9;
  const go = next => { if (state !== next) { state = next; setState(next); } };
  setState('scanning');
  status(`Îndreaptă camera spre markerul comun (pagina „Marker”, printat pe masă).`);

  const target = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  const M = new THREE.Matrix4();
  function onMarker(corners) {
    // POSIT vrea colțurile cu originea în centrul imaginii și y în sus
    const pose = posit.pose(corners.map(c => ({ x: c.x - L.w / 2, y: L.h / 2 - c.y })));
    const R = pose.bestRotation, t = pose.bestTranslation;
    // cadrul POSIT (x dreapta, y sus, z înainte) → cadrul three (z înapoi): D·R·A, cu A = marker → masă (+Y sus)
    // A: x_marker = x, y_marker = -z, z_marker = -y (masa în sus = spre cameră); D = diag(1, 1, -1)
    M.set(
      R[0][0], -R[0][2], -R[0][1], t[0],
      R[1][0], -R[1][2], -R[1][1], t[1],
      -R[2][0], R[2][2], R[2][1], -t[2],
      0, 0, 0, 1,
    );
    target.copy(M);
    target.decompose(position, quaternion, scale);
    if (performance.now() - seenAt > 500) {
      anchor.position.copy(position);
      anchor.quaternion.copy(quaternion);
    } else {
      // netezire: markerul „tremură” puțin de la un cadru la altul
      anchor.position.lerp(position, 0.5);
      anchor.quaternion.slerp(quaternion, 0.5);
    }
    seenAt = performance.now();
  }

  const offTap = tapHandler(root, camera, content, world, onTap, () => state === 'placed');
  const handsTracking = handTracking(canvas, camera, L.focal, content);
  const occlusion = handsTracking && handOcclusion(root, L.w, L.h);
  let frameCount = 0, lastHands = [];

  function loop(time) {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((time - last) / 1000, 0.05) : 1 / 60;
    last = time;
    frameCount += 1;
    ctx.drawImage(video, L.dx, L.dy, L.vw * L.cover, L.vh * L.cover);
    const markers = detector.detect(ctx.getImageData(0, 0, L.w, L.h));
    const marker = markers.find(m => m.id === MARKER_ID);
    if (marker) onMarker(marker.corners);
    // mâna acoperă des markerul când muți un pion: tabla rămâne unde era încă 1,5 s
    const visible = performance.now() - seenAt < 1500;
    anchor.visible = visible;
    go(visible ? 'placed' : 'scanning');
    status(visible ? '' : 'Caut markerul… ține-l întreg în cadru.');
    if (handsTracking && visible && frameCount % handEvery(content) === 0) lastHands = handsTracking.frame();
    content.update(dt);
    renderer.render(scene, camera);
    if (occlusion) {
      occlusion.draw(canvas, visible ? lastHands : [], camera, L.focal, content);
      if (visible) drawHandHints(occlusion.ctx, lastHands, content.handsFast);
    }
  }
  raf = requestAnimationFrame(loop);

  return {
    camera,
    video,
    get state() { return state; },
    cameraLocal: () => content.group.worldToLocal(new THREE.Vector3()),
    replace() {},
    close() {
      cancelAnimationFrame(raf);
      offTap();
      video.srcObject?.getTracks().forEach(track => track.stop());
      video.pause();
      video.remove();
      canvas.remove();
      occlusion?.remove();
      renderer.domElement.remove();
      renderer.dispose();
    },
  };
}
