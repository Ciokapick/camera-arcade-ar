// Piatră–hârtie–foarfecă în AR: deasupra fiecărei mâini din cameră plutește gestul ei, ca obiect 3D (o piatră,
// o foaie, o foarfecă). Adversarul (calculatorul sau ceilalți din cameră) apare sus, „gândindu-se” cât numărăm.
// La final obiectele se ciocnesc: câștigătorul zboară spre cel învins, care se sparge în bucăți.
import * as THREE from 'three';
import { makeHand, CAMERA_FOV } from './ar.js';

const COLORS = { 'Piatră': 0x9aa0a8, 'Hârtie': 0xf4f1e8, 'Foarfecă': 0xd8dde3 };
const GESTURES = ['Piatră', 'Hârtie', 'Foarfecă'];

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

export function createRpsScene(container, video) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'rps-3d';
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(0.3, 1, 0.6);
  scene.add(sun);
  // camera three = camera telefonului: în origine, privind spre -z; câmpul vizual potrivit cu video-ul afișat „cover”
  const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  let layout = null;
  function resize() {
    const W = container.clientWidth, H = container.clientHeight, vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    const cover = Math.max(W / vw, H / vh);
    const focal = (Math.max(vw, vh) / 2) / Math.tan(CAMERA_FOV * Math.PI / 360) * cover;
    layout = { W, H, vw, vh, cover, focal, offX: (W - vw * cover) / 2, offY: (H - vh * cover) / 2 };
    camera.aspect = W / H;
    camera.fov = 2 * Math.atan(H / 2 / focal) * 180 / Math.PI;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }
  resize();

  // locuri: mâna 0 și 1 (stânga → dreapta pe ecran) și adversarii, sus
  const slots = new Map(); // key → { root, model, gesture, target, alive }
  function slot(key) {
    if (!slots.has(key)) {
      const root = new THREE.Group();
      root.visible = false;
      scene.add(root);
      slots.set(key, { root, model: null, gesture: null, target: new THREE.Vector3(), pop: 0 });
    }
    return slots.get(key);
  }
  function setModel(s, gesture) {
    if (s.gesture === gesture) return;
    if (s.model) s.root.remove(s.model);
    s.gesture = gesture;
    s.model = gesture ? makeModel(gesture) : null;
    if (s.model) { s.root.add(s.model); s.pop = 0; }
  }

  const pieces = [];
  function shatter(s) {
    const color = COLORS[s.gesture] ?? 0xffffff;
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.004 + Math.random() * 0.006), new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true }));
      m.position.copy(s.root.position);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(0.6);
      scene.add(m);
      pieces.push({ m, v, life: 1.3 });
    }
    s.root.visible = false;
    s.broken = true;
  }

  let thinking = 0, clash = null, time = 0, raf = 0, last = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
    last = now;
    time += dt;
    for (const [key, s] of slots) {
      if (!s.model) continue;
      s.pop = Math.min(1, s.pop + dt * 5);
      const breathe = clash ? 1 : 1 + Math.sin(time * 3 + key.length) * 0.04;
      s.root.scale.setScalar((0.4 + 0.6 * s.pop) * breathe);
      s.root.position.lerp(s.target, Math.min(1, dt * (clash ? 6 : 14)));
      s.model.rotation.y = time * 1.2;
      if (s.model.userData.scissors) s.model.children.forEach(arm => { arm.rotation.z = arm.userData.side * (0.12 + Math.abs(Math.sin(time * 6)) * 0.3); });
    }
    // adversarul se „gândește”: își tot schimbă gestul
    if (thinking) for (const [key, s] of slots) if (key.startsWith('opp') && s.thinking) setModel(s, GESTURES[Math.floor(time * 7 + key.length) % 3]);
    if (clash) {
      clash.t += dt;
      if (!clash.hit && clash.t > 0.5) {
        clash.hit = true;
        for (const s of clash.losers) shatter(s);
      }
      if (clash.t > 0.85 && !clash.back) {
        clash.back = true;
        for (const s of clash.movers) s.target.copy(s.home);
      }
      if (clash.t > 1.9) {
        for (const s of clash.losers) { s.broken = false; s.root.visible = !!s.model; }
        clash = null;
      }
    }
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.life -= dt;
      p.v.y -= 1.2 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += dt * 8;
      p.m.scale.setScalar(Math.max(0, p.life));
      if (p.life <= 0) { scene.remove(p.m); pieces.splice(i, 1); }
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);
  addEventListener('resize', resize);

  // din reperele MediaPipe (normalizate pe video) → mâna în coordonatele ecranului afișat
  const toDisplay = landmarks => landmarks.map(p => ({ x: (p.x * layout.vw * layout.cover + layout.offX) / layout.W, y: (p.y * layout.vh * layout.cover + layout.offY) / layout.H, z: p.z }));

  return {
    /** mâinile din cameră (cum le dă trackHands): fiecare primește deasupra gestul ei */
    setHands(hands) {
      if (clash) return;
      if (layout.vw !== video.videoWidth && video.videoWidth) resize();
      for (let i = 0; i < 2; i++) {
        const s = slot(`hand${i}`), hand = hands[i];
        if (!hand || !hand.gesture) { s.root.visible = false; continue; }
        const h = makeHand(toDisplay(hand.landmarks), { width: layout.W, height: layout.H, focal: layout.focal, camera });
        const p = h.world(h.palm());
        // deasupra mâinii (în sus pe ecran), cam cât o palmă
        const target = p.clone().add(new THREE.Vector3(0, h.depth * 0.32, 0));
        if (!s.root.visible) s.root.position.copy(target);
        s.target.copy(target);
        s.home = target.clone();
        setModel(s, hand.gesture);
        s.root.visible = !s.broken;
      }
    },
    /** adversarii, sus pe ecran: gesturi cunoscute, sau '?' cât se gândesc */
    setOpponents(list) {
      const n = list.length;
      for (const [key, s] of slots) if (key.startsWith('opp') && Number(key.slice(3)) >= n) { s.root.visible = false; setModel(s, null); }
      thinking = list.some(g => g === '?');
      list.forEach((g, i) => {
        const s = slot(`opp${i}`);
        // sus, deasupra mâinilor: unul singur în dreapta, mai mulți pe un rând
        const z = -0.45, half = Math.tan(camera.fov * Math.PI / 360) * -z, halfW = half * camera.aspect;
        const x = n === 1 ? halfW * 0.55 : (i / (n - 1) - 0.5) * halfW * 1.2;
        s.target.set(x, half * 0.5, z);
        s.home = s.target.clone();
        if (!s.root.visible) s.root.position.copy(s.target);
        s.thinking = g === '?';
        if (g !== '?') setModel(s, g);
        s.root.visible = true;
      });
    },
    /** ciocnirea: results = { hand0, hand1, opp0, … } → 'win' | 'lose' | 'tie' */
    clash(results) {
      thinking = 0;
      const all = Object.entries(results).map(([key, r]) => ({ s: slot(key), r })).filter(x => x.s.model && x.s.root.visible);
      if (all.length < 2) return;
      const center = all.reduce((c, x) => c.add(x.s.root.position), new THREE.Vector3()).divideScalar(all.length);
      const movers = [];
      for (const { s, r } of all) {
        s.home = s.root.position.clone();
        s.thinking = false;
        // câștigătorii zboară până în cel învins; la egalitate se ating amândoi și se întorc
        if (r === 'win' || r === 'tie') { s.target.copy(center).lerp(s.home, r === 'tie' ? 0.35 : 0.1); movers.push(s); }
      }
      clash = { t: 0, losers: all.filter(x => x.r === 'lose').map(x => x.s), movers };
    },
    clear() {
      for (const s of slots.values()) { s.root.visible = false; setModel(s, null); s.broken = false; }
      thinking = 0;
      clash = null;
    },
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      renderer.domElement.remove();
      renderer.dispose();
    },
  };
}
