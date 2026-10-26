// Senzori simulați (giroscop + accelerometru + orientare), potriviți exact cu mișcarea camerei din table.y4m.
// Rulează în pagină (addInitScript). Timpul pornește când se deschide camera (atunci începe și video-ul).
(() => {
  // SLOW: video-ul e redat de 20× mai încet decât a fost „filmat” (vezi render.py), la fel și senzorii
  const SECS = 14, w = 2 * Math.PI / SECS, SLOW = 20;
  const sub = (a, b) => a.map((v, i) => v - b[i]), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  const eye = t => [0.10 * Math.sin(w * t), 0.42 + 0.03 * Math.sin(2 * w * t), 0.33 + 0.05 * Math.cos(w * t)];
  const target = t => [0.02 * Math.sin(w * t), 0, 0];
  const enu = v => [v[0], -v[2], v[1]];
  // matricea device → ENU (coloane = axele telefonului: x dreapta, y sus, z spre utilizator)
  function M(t) {
    const F = norm(sub(target(t), eye(t))), R = norm(cross(F, [0, 1, 0])), U = cross(R, F);
    const dx = enu(R), dy = enu(U), dz = enu(F.map(v => -v));
    return [[dx[0], dy[0], dz[0]], [dx[1], dy[1], dz[1]], [dx[2], dy[2], dz[2]]];
  }
  const mulT = (m, v) => [0, 1, 2].map(j => m[0][j] * v[0] + m[1][j] * v[1] + m[2][j] * v[2]);
  const deg = r => r * 180 / Math.PI;
  let start = null;
  window.__truth = () => { if (start === null) return null; const t = ((performance.now() - start) / 1000 / SLOW) % SECS; const e = eye(t), F = norm(sub(target(t), e)); return { t, eye: e, fwd: F }; };
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async c => { console.log('GUM ' + JSON.stringify(c)); let s; try { s = await gum(c?.video ? { video: true, audio: false } : c); } catch (e) { console.log('GUM FAIL ' + e.name + ' ' + e.message); throw e; } if (c?.video) start = performance.now(); /* video-ul fals o ia de la capăt la fiecare deschidere */ return s; };
  if (window.DeviceOrientationEvent) DeviceOrientationEvent.requestPermission = async () => 'granted';
  if (window.DeviceMotionEvent) DeviceMotionEvent.requestPermission = async () => 'granted';
  window.__imuNoise = 0;
  setInterval(() => {
    if (start === null) return;
    const t = ((performance.now() - start) / 1000 / SLOW) % SECS, h = 0.016;
    const m = M(t), m2 = M(t + h);
    const beta = Math.asin(Math.max(-1, Math.min(1, m[2][1]))), gamma = Math.atan2(-m[2][0], m[2][2]);
    let alpha = Math.atan2(-m[0][1], m[1][1]); if (alpha < 0) alpha += 2 * Math.PI;
    dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: deg(alpha), beta: deg(beta), gamma: deg(gamma), absolute: false }));
    // viteza unghiulară în cadrul telefonului: Mᵀ(t)·M(t+h) ≈ I + [ω]× h
    const r = [0, 1, 2].map(i => [0, 1, 2].map(j => m[0][i] * m2[0][j] + m[1][i] * m2[1][j] + m[2][i] * m2[2][j]));
    const wx = (r[2][1] - r[1][2]) / 2 / h, wy = (r[0][2] - r[2][0]) / 2 / h, wz = (r[1][0] - r[0][1]) / 2 / h;
    const p0 = enu(eye(t - h)), p1 = enu(eye(t)), p2 = enu(eye(t + h));
    const a = p0.map((v, i) => (p2[i] - 2 * p1[i] + v) / h / h);
    const n = () => (Math.random() - 0.5) * window.__imuNoise;
    const a2 = a.map(v => v / SLOW / SLOW), acc = mulT(m, a2), accG = mulT(m, [a2[0], a2[1], a2[2] + 9.81]);
    dispatchEvent(new DeviceMotionEvent('devicemotion', {
      acceleration: { x: acc[0] + n(), y: acc[1] + n(), z: acc[2] + n() },
      accelerationIncludingGravity: { x: accG[0] + n(), y: accG[1] + n(), z: accG[2] + n() },
      rotationRate: { alpha: deg(wz) / SLOW, beta: deg(wx) / SLOW, gamma: deg(wy) / SLOW },
      interval: 16,
    }));
  }, 16);
})();
