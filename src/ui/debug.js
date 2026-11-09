// Panoul de diagnostic (?debug în adresă): ce se întâmplă pe telefon, ca să putem repara fără Mac lângă.
// Arată motorul AR, starea urmăririi, cadrele pe secundă, masa găsită, mâna (unde rulează recunoașterea, cât
// durează, ce vede), scara jocului, dispozitivul și ultimele erori. „Copiază” pune totul în clipboard.
const errors = [];
const keep = (kind, text) => {
  errors.push(`${new Date().toLocaleTimeString()} ${kind}: ${String(text).slice(0, 220)}`);
  if (errors.length > 6) errors.shift();
};
addEventListener('error', e => keep('eroare', e.message));
addEventListener('unhandledrejection', e => keep('promisiune', e.reason?.message || e.reason));
for (const level of ['warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => { keep(level, args.map(a => a?.message || (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')); original(...args); };
}

const ENGINES = { xr8: '8th Wall', alva: 'AlvaAR (rezervă)', marker: 'marker ArUco' };
const fmt = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '–');

export function startDebug(get) {
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = `<div class="debug-head"><b>Diagnostic</b><button data-act="copy">Copiază</button><button data-act="min">–</button></div><pre></pre>`;
  document.body.append(panel);
  const style = document.createElement('style');
  style.textContent = `
    #debug-panel { position: fixed; left: 8px; top: calc(env(safe-area-inset-top) + 64px); z-index: 50; max-width: min(360px, calc(100vw - 16px));
      background: rgba(10, 11, 14, .82); color: #d7ffd0; border: 1px solid rgba(255,255,255,.15); border-radius: 12px; padding: 6px 8px;
      font: 10.5px/1.45 ui-monospace, Menlo, monospace; pointer-events: auto; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
    #debug-panel pre { margin: 4px 0 0; white-space: pre-wrap; word-break: break-word; }
    #debug-panel .debug-head { display: flex; gap: 6px; align-items: center; }
    #debug-panel .debug-head b { flex: 1; color: #fff; }
    #debug-panel button { font: inherit; color: #fff; background: rgba(255,255,255,.12); border: 0; border-radius: 6px; padding: 3px 8px; }
    #debug-panel.min pre { display: none; }`;
  document.head.append(style);
  const pre = panel.querySelector('pre');
  let lastFrames = 0, lastT = performance.now(), fps = 0, text = '';

  function snapshot() {
    const { view, room } = get();
    const st = view?.stage, s = st?.stats ?? {}, h = s.hands;
    const now = performance.now();
    if (typeof s.frames === 'number') {
      const dt = (now - lastT) / 1000;
      if (dt >= 1) { fps = Math.max(0, (s.frames - lastFrames) / dt); lastFrames = s.frames; lastT = now; }
    }
    const lines = [];
    lines.push(`joc: ${room?.state?.game ?? 'lobby'} · ${room?.online ? `online ${room.code}` : 'local'} · ${room?.isHost ? 'gazdă' : 'invitat'}`);
    if (st) {
      lines.push(`mod: ${st.mode}${s.engine ? ` (${ENGINES[s.engine] ?? s.engine})` : ''} · stare: ${st.state ?? '–'}`);
      lines.push(`urmărire: ${s.tracking ?? '–'} · cadre/s: ${fmt(fps, 0)}${s.poses != null ? ` · poziții: ${s.poses}` : ''}`);
      if (s.table) lines.push(`masa: y ${fmt(s.table.y)} · ${s.table.count} puncte · ${s.table.sure ? 'sigură' : 'estimată'}`);
      if (h) {
        const hand = h.hand ? `${h.hand.gesture ?? '?'} · deschisă ${fmt(h.hand.open)} · ciupit ${fmt(h.hand.pinch)} · la ${fmt(h.hand.depth)} m` : 'nicio mână';
        lines.push(`mână: ${h.path}${h.delegate ? `/${h.delegate}` : ''} · ${h.perSecond}/s · ${fmt(h.ms, 0)} ms · ${hand}`);
        if (h.reason) lines.push(`  (pe firul principal: ${h.reason})`);
      }
      if (st.camera && view.content?.group) {
        const g = view.content.group, scale = g.getWorldScale(st.camera.position.clone()).x;
        const dist = st.camera.position.distanceTo(g.getWorldPosition(st.camera.position.clone()));
        lines.push(`scara: ${fmt(scale)} · camera la ${fmt(dist)} unități de joc · zoom ${st.zoomable ? 'da' : 'nu'}`);
      }
      const status = document.querySelector('#ar-status')?.textContent;
      if (status) lines.push(`mesaj: ${status}`);
    }
    lines.push(`ecran: ${innerWidth}×${innerHeight} @${devicePixelRatio}x · ${navigator.userAgent.replace(/.*?\(([^)]*)\).*/, '$1').slice(0, 60)}`);
    lines.push(`erori: ${errors.length ? '\n  ' + errors.join('\n  ') : 'niciuna'}`);
    return lines.join('\n');
  }

  setInterval(() => { text = snapshot(); if (!panel.classList.contains('min')) pre.textContent = text; }, 500);
  panel.addEventListener('click', async event => {
    const act = event.target.dataset?.act;
    if (act === 'min') { panel.classList.toggle('min'); event.target.textContent = panel.classList.contains('min') ? '+' : '–'; }
    if (act === 'copy') {
      const full = `Camera Arcade · ${new Date().toISOString()}\n${location.href}\n${text}`;
      try { await navigator.clipboard.writeText(full); event.target.textContent = 'Copiat!'; } catch {
        // fără clipboard: selectăm textul, ca să-l copiezi de mână
        const range = document.createRange(); range.selectNodeContents(pre);
        getSelection().removeAllRanges(); getSelection().addRange(range); event.target.textContent = 'Selectat';
      }
      setTimeout(() => { event.target.textContent = 'Copiază'; }, 1500);
    }
  });
}
