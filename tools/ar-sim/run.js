// Aplicația „pe iPhone”: Chromium cu UA de iPhone, cameră falsă = masa randată, 8th Wall real.
const { chromium, devices } = require('playwright');
const path = require('path');
const LIB = path.join(__dirname, '.libs');
const GAME = process.env.GAME || 'xo', SECS = Number(process.env.SECS || 30);
(async () => {
  const browser = await chromium.launch({ args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${__dirname}/.out/table.y4m`,
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices[process.env.DEVICE || 'Pixel 7'], permissions: ['camera', 'accelerometer', 'gyroscope', 'magnetometer'] });
  await ctx.addInitScript({ path: `${__dirname}/imu.js` });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', m => { const t = m.text(); if (!/Failed to load resource|performance warning|GL Driver|GUM /.test(t)) log.push(`[${m.type()}] ${t}`.slice(0, 300)); });
  page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
  const map = { three: 'three-0.186.1', 'cannon-es': 'cannon-es-0.20.0', '@8thwall/engine-binary': 'xr8', '@mediapipe/tasks-vision': 'mp' };
  await page.route('https://cdn.jsdelivr.net/npm/**', route => {
    let u = decodeURIComponent(new URL(route.request().url()).pathname.replace('/npm/', ''));
    const m = u.match(/^(@[^/]+\/[^@/]+|[^@/]+)@([^/]+)\/?(.*)$/);
    if (!m || !map[m[1]]) { log.push('ABORT ' + u); return route.abort(); }
    let file = m[3] || '';
    if (m[1] === '@mediapipe/tasks-vision' && file === '+esm') file = 'vision_bundle.mjs';
    const ct = file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.json') ? 'application/json' : 'application/javascript';
    return route.fulfill({ path: path.join(LIB, map[m[1]], 'package', file), contentType: ct, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route(/fonts\.googleapis|fonts\.gstatic|iconify|peerjs/, r => r.abort());
  await page.goto('http://localhost:8123/');
  await page.waitForTimeout(1500);
  for (const sel of ['#camera-screen button']) if (await page.isVisible(sel)) await page.click(sel);
  await page.waitForTimeout(800);
  if (await page.isVisible('#name-input')) { await page.fill('#name-input', 'Test'); await page.press('#name-input', 'Enter'); }
  await page.waitForTimeout(800);
  await page.click(`[data-game="${GAME}"]`);
  const t0 = Date.now();
  let shots = 0, placedAt = 0;
  while (Date.now() - t0 < SECS * 1000) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => {
      const st = window.__stage, root = document.querySelector('#stage-root');
      // adevărul: crucea roșie din imaginea camerei (canvas-ul desenat de 8th Wall)
      let cross = null;
      const feed = root.querySelector('canvas');
      if (feed) {
        const c = document.createElement('canvas'); c.width = feed.width / 4 | 0; c.height = feed.height / 4 | 0;
        const g = c.getContext('2d'); g.drawImage(feed, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height).data; let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) { const p = i / 4; sx += p % c.width; sy += Math.floor(p / c.width); n++; }
        if (n > 3) cross = [+(sx / n / c.width).toFixed(3), +(sy / n / c.height).toFixed(3)];
      }
      // unde desenăm noi jocul (ancora), în aceleași coordonate
      let game = null;
      if (st?.camera && st.content) {
        const v = st.content.group.parent.parent.parent.getWorldPosition(new st.camera.position.constructor());
        v.project(st.camera);
        game = [+((v.x + 1) / 2).toFixed(3), +((1 - v.y) / 2).toFixed(3)];
      }
      let pose = null;
      if (st?.camera) { const f = new st.camera.position.constructor(0, 0, -1).applyQuaternion(st.camera.quaternion); pose = { p: st.camera.position.toArray().map(v => +v.toFixed(3)), fwd: f.toArray().map(v => +v.toFixed(3)), truth: window.__truth() }; }
      return { pose, state: st?.state, stats: st?.stats && JSON.stringify(st.stats.table ?? {}), poses: st?.stats?.poses, frames: st?.stats?.frames, cross, game, place: !document.querySelector('#place-here').hidden && document.querySelector('#place-here').style.getPropertyValue('--p') };
    });
    if (s.state === 'found' && /"sure":true/.test(s.stats || '') && !placedAt) { await page.click('#place-here'); placedAt = Date.now(); }
    const off = s.cross && s.game?.[0] != null ? [+(s.game[0] - s.cross[0]).toFixed(3), +(s.game[1] - s.cross[1]).toFixed(3)] : null;
    console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', s.state, 'cross', JSON.stringify(s.cross), 'game', JSON.stringify(s.game), 'offset', JSON.stringify(off), process.env.FULL ? s.stats : '', process.env.POSE ? JSON.stringify({ xr: s.pose?.p, xf: s.pose?.fwd, tt: +s.pose?.truth?.t.toFixed(2), te: s.pose?.truth?.eye.map(v => +v.toFixed(3)), tf: s.pose?.truth?.fwd.map(v => +v.toFixed(3)) }) : '');
    if (process.env.SHOTS && shots < 12 && Math.round((Date.now() - t0) / 1000) % 10 === 0) await page.screenshot({ path: `${__dirname}/.out/shot${shots++}.png` });
  }
  console.log(log.slice(0, 40).join('\n'));
  await browser.close();
})();
