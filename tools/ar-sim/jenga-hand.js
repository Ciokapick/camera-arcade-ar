// Mână simulată la Jenga (modul ?screen): țintește o piesă, ciupește, trage, duce sus, dă drumul.
const { chromium } = require('playwright');
const path = require('path');
const LIB = path.join(__dirname, '.libs');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.text().startsWith('DBG')) console.log(m.text()); });
  const map = { three: 'three-0.186.1', 'cannon-es': 'cannon-es-0.20.0' };
  await page.route('https://cdn.jsdelivr.net/npm/**', r => { const u = new URL(r.request().url()).pathname.replace('/npm/', ''); const m = u.match(/^([^@/]+)@([^/]+)\/(.*)$/); return m && map[m[1]] ? r.fulfill({ path: path.join(LIB, map[m[1]], 'package', m[3]), contentType: 'application/javascript' }) : r.abort(); });
  await page.route(/fonts\.googleapis|iconify|peerjs|mediapipe/, r => r.abort());
  await page.goto('http://localhost:8123/?screen');
  await page.waitForTimeout(1500);
  if (await page.isVisible('#name-input')) { await page.fill('#name-input', 'T'); await page.press('#name-input', 'Enter'); }
  await page.waitForTimeout(600);
  await page.click('[data-game="jenga"]');
  await page.waitForTimeout(2000);
  // implicit: piesa din față a nivelului 8 (slot 2). Cea din mijloc (slot 1) are fața ascunsă de cea din față: raza
  // spre ea trece deasupra și nimerește nivelul de sus — aplicația apucă (corect) piesa pe care o vezi.
  const result = await page.evaluate(async ({ level, slot, aimOff }) => {
    const THREE = await import('three');
    const { makeHand } = await import('./src/ar/ar.js');
    const st = window.__stage, cam = st.camera, canvas = document.querySelector('#stage-root canvas');
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const tower = st.content.group.children[0];
    const mesh = tower.children.find(m => m.userData.index === level * 3 + slot);
    const toScreen = local => { const v = tower.localToWorld(local.clone()).project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2]; };
    const focal = H / 2 / Math.tan(cam.fov * Math.PI / 360);
    // mâna la punctul 3D `local` (al turnului): vârful degetului mare (4) și al arătătorului (8) în jurul lui, palma mai
    // jos; mărimea palmei pe ecran = cea a unei palme reale (7 cm lată) la distanța aceea — din ea aplicația află adâncimea
    const hand = (local, gap) => {
      const world = tower.localToWorld(local.clone()), d = world.distanceTo(cam.position);
      const v = world.clone().project(cam), px = (v.x + 1) / 2, py = (1 - v.y) / 2;
      const palm = focal * 0.07 / d; // px
      const nx = palm / W, ny = palm / H;
      const L = Array.from({ length: 21 }, () => ({ x: px, y: py + ny * 1.5, z: 0 }));
      L[4] = { x: px - nx * gap / 2, y: py, z: 0 }; L[8] = { x: px + nx * gap / 2, y: py, z: 0 };
      L[5] = { x: px - nx / 2, y: py + ny, z: 0 }; L[17] = { x: px + nx / 2, y: py + ny, z: 0 };
      L[9] = { x: px, y: py + ny, z: 0 }; L[0] = { x: px, y: py + ny * (1 + 0.085 / 0.07), z: 0 };
      return makeHand(L, { width: W, height: H, focal, camera: cam });
    };
    const frame = (p, gap) => new Promise(r => requestAnimationFrame(() => { const h = hand(p, gap); if (window.__dbg) console.log('DBG hand', JSON.stringify(h.mid(4, 8)), h.depth.toFixed(3), p.toArray().map(x => x.toFixed(3)).join(',')); st.content.hands([h]); r(); }));
    const log = [];
    // ținta: fața piesei dinspre cameră (aia o vezi și spre ea duci degetele), nu centrul ei ascuns
    const axis0 = level % 2 === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const toCam = tower.worldToLocal(cam.position.clone()).sub(mesh.position).setY(0).normalize();
    const half = Math.abs(axis0.dot(toCam)) > 0.5 ? 0.0375 : 0.0125; // capătul (L/2) sau fața lungă (W/2)
    const c = mesh.position.clone().addScaledVector(toCam.clone().projectOnVector(Math.abs(axis0.dot(toCam)) > 0.5 ? axis0 : new THREE.Vector3(1, 0, 1).sub(axis0)).normalize(), half * 0.95).add(new THREE.Vector3(...aimOff));
    // 1) țintit cu degetele deschise, puțin pe lângă
    for (let i = 0; i < 6; i++) await frame(c, 0.85);
    log.push('aim: ' + document.querySelector('#info-small').textContent);
    // 2) ciupit
    for (let i = 0; i < 3; i++) await frame(c, 0.15);
        // 3) tras încet pe axa piesei (nivel par = axa X)
    const axis = level % 2 === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    // spre partea dinspre cameră (cum tragi o piesă de Jenga: spre tine)
    const camLocal = tower.worldToLocal(cam.position.clone()), dir = Math.sign(camLocal.clone().sub(c).dot(axis)) || 1;
    for (let i = 1; i <= 40; i++) await frame(c.clone().addScaledVector(axis, dir * 0.07 * i / 40), 0.15 + (i % 7 === 0 ? 0.5 : 0)); // ciupitul „pâlpâie” uneori
    log.push('pulled: ' + document.querySelector('#info-small').textContent);
    // 4) dus sus
    const top = new THREE.Vector3(0, 0.3, 0);
    const out = c.clone().addScaledVector(axis, dir * 0.07);
    for (let i = 1; i <= 25; i++) await frame(out.clone().lerp(top, i / 25), 0.15);
    // 5) dat drumul
    for (let i = 0; i < 5; i++) await frame(top, 0.9);
    const seen = new Set();
    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 150)); seen.add(document.querySelector('#info-big').textContent + ' | ' + document.querySelector('#info-small').textContent); }
    log.push('timeline: ' + [...seen].join('  →  '));
    // aplicația alege piesa prinsă (de obicei cea din față): verificăm că o piesă a ajuns pe un nivel nou, deasupra turnului
    const highest = Math.max(...tower.children.filter(m => m.userData.index !== undefined).map(m => m.position.y));
    log.push(highest > 0.27 ? `OK: o piesă a ajuns sus (${highest.toFixed(3)} m)` : `EȘEC: nicio piesă sus (cea mai înaltă la ${highest.toFixed(3)} m)`);
    log.push('after: ' + document.querySelector('#info-big').textContent + ' | ' + document.querySelector('#info-small').textContent);
    return log;
  }, { level: Number(process.env.LEVEL || 8), slot: Number(process.env.SLOT || 2), aimOff: JSON.parse(process.env.OFF || '[0,0,0]') });
  console.log(result.join('\n'), errs);
  await page.screenshot({ path: `${__dirname}/.out/jenga-after.png` });
  await browser.close();
})();
