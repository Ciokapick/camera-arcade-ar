// Mâini articulate deasupra gesturilor reale; adversarii bat ritmul cu pumnul și dezvăluie gestul la rezultat.
import * as THREE from 'three';
import { makeHand, CAMERA_FOV } from './ar.js';
import { createVirtualHand } from './virtual-hand.js';
import { createGestureSymbols } from './rps-symbols.js';

const COLORS = { 'Piatră': 0x9aa0a8, 'Hârtie': 0xf4f1e8, 'Foarfecă': 0xd8dde3 };

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
    s.symbols?.show(s.thinking ? null : gesture);
    if (s.gesture === gesture) return;
    if (!s.hand && gesture) {
      s.hand = createVirtualHand();
      s.model = s.hand.group;
      s.symbols = createGestureSymbols();
      s.model.add(s.symbols.group);
      s.symbols.show(s.thinking ? null : gesture);
      s.model.scale.setScalar(0.55);
      s.root.add(s.model);
    }
    s.gesture = gesture;
    if (s.hand) { s.hand.pose(gesture || 'Piatră'); s.model.visible = !!gesture; }
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
    // Feedback de înfrângere fără a sparge mâna în bucăți.
    s.defeated = true;
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
      s.hand?.update(dt);
      const tilt = s.defeated ? -0.6 : s.thinking ? Math.sin(time * Math.PI * 2 / 0.9) * 0.3 : Math.sin(time * 2) * 0.06;
      s.model.rotation.z = THREE.MathUtils.lerp(s.model.rotation.z, tilt, Math.min(1, dt * 10));
      s.model.rotation.x = s.thinking ? -0.2 : 0;
    }
    // Pumnul bate ritmul fără să dezvăluie simbolul adversarului.
    if (thinking) for (const [key, s] of slots) if (key.startsWith('opp') && s.thinking) setModel(s, 'Piatră');
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
        for (const s of clash.losers) { s.defeated = false; }
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
      if (p.life <= 0) { scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); pieces.splice(i, 1); }
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);
  addEventListener('resize', resize);

  // din reperele MediaPipe (normalizate pe video) → mâna în coordonatele ecranului afișat
  const toDisplay = landmarks => landmarks.map(p => ({ x: (p.x * layout.vw * layout.cover + layout.offX) / layout.W, y: (p.y * layout.vh * layout.cover + layout.offY) / layout.H, z: p.z }));

  return {
    /** Mâinile din cameră primesc fiecare un avatar al gestului recunoscut. */
    setHands(hands) {
      if (clash) return;
      if (layout.vw !== video.videoWidth && video.videoWidth) resize();
      for (let i = 0; i < 2; i++) {
        const s = slot(`hand${i}`), hand = hands[i];
        if (!hand || !hand.gesture) { s.root.visible = false; continue; }
        const h = makeHand(toDisplay(hand.landmarks), { width: layout.W, height: layout.H, focal: layout.focal, camera });
        const p = h.world(h.palm());
        // deasupra mâinii (în sus pe ecran), cam cât o palmă
        const target = p.clone().add(new THREE.Vector3(0, h.depth * 0.12, 0));
        const halfH = Math.tan(camera.fov * Math.PI / 360) * Math.abs(target.z);
        target.x = THREE.MathUtils.clamp(target.x, -halfH * camera.aspect * 0.7, halfH * camera.aspect * 0.7);
        const scale = Math.min(0.55, h.depth * 0.9, halfH * 3);
        target.y = THREE.MathUtils.clamp(target.y, -halfH * 0.5, halfH * 0.7 - scale * 0.17);
        if (!s.root.visible) s.root.position.copy(target);
        s.target.copy(target);
        s.home = target.clone();
        setModel(s, hand.gesture);
        s.model.scale.setScalar(scale);
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
        s.target.set(x, half * 0.15, z);
        s.home = s.target.clone();
        if (!s.root.visible) s.root.position.copy(s.target);
        s.thinking = g === '?';
        setModel(s, s.thinking ? 'Piatră' : g);
        s.model?.scale.setScalar(Math.min(0.55, half * 3));
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
      for (const s of slots.values()) { s.root.visible = false; setModel(s, null); s.broken = false; s.defeated = false; }
      thinking = 0;
      clash = null;
    },
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      for (const s of slots.values()) { s.hand?.dispose(); s.symbols?.dispose(); }
      for (const p of pieces) { p.m.geometry.dispose(); p.m.material.dispose(); }
      renderer.domElement.remove();
      renderer.dispose();
    },
  };
}
