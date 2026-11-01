// Recunoașterea mâinii în fundal (Web Worker clasic): MediaPipe nu mai ține ocupat firul principal, unde rulează
// și urmărirea mesei (8th Wall / AlvaAR) și desenarea jocului. Primește cadre ca ImageBitmap, întoarce reperele.
// Folosim varianta .cjs a pachetului (cea .mjs ar cere un worker de tip modul, unde MediaPipe nu-și poate încărca
// WASM-ul cu importScripts). jsDelivr o trimite ca „application/node”, pe care importScripts o refuză, așa că o
// descărcăm ca text și o rulăm noi, cu exports / module ale ei.
const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function loadBundle() {
  const response = await fetch(`${MEDIAPIPE}/vision_bundle.cjs`);
  if (!response.ok) throw new Error(`MediaPipe: ${response.status}`);
  const module = { exports: {} };
  new Function('exports', 'module', await response.text())(module.exports, module);
  return module.exports;
}

let landmarker = null;
async function init(numHands) {
  const { FilesetResolver, HandLandmarker } = await loadBundle();
  const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
  let lastError = null;
  // GPU dacă se poate (în worker, pe un OffscreenCanvas), altfel CPU
  for (const delegate of typeof OffscreenCanvas === 'function' ? ['GPU', 'CPU'] : ['CPU']) {
    try {
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        ...(delegate === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {}),
        runningMode: 'VIDEO',
        numHands,
      });
      return delegate;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      postMessage({ type: 'ready', delegate: await init(data.numHands ?? 1) });
    } catch (error) {
      postMessage({ type: 'error', fatal: true, message: String(error?.message || error) });
    }
    return;
  }
  if (data.type === 'frame') {
    const t0 = performance.now();
    let landmarks = [], error = null;
    try {
      landmarks = landmarker.detectForVideo(data.bitmap, data.ts).landmarks || [];
    } catch (e) {
      error = String(e?.message || e);
    }
    data.bitmap.close();
    postMessage({ type: 'result', id: data.id, landmarks, ms: performance.now() - t0, error });
  }
};
