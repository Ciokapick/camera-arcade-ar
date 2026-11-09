// Recunoașterea bancnotelor românești din cameră, pentru pariurile de la barbut.
//
// O rețea neuronală (MediaPipe Image Embedder, MobileNet v3) transformă imaginea din chenar într-o „amprentă”
// (vector de 1024 de numere). O comparăm (cosinus) cu amprentele bancnotelor cunoscute și alegem cea mai apropiată
// (k-NN). Amprentele de bază (banknote-refs.json) sunt calculate din scanările oficiale, față și verso, câte 4 variante
// (normal, mai întunecat, întors 180°, ușor mărit) — domeniu public, Wikimedia Commons; poți adăuga și ale tale
// cu „Învăț bancnota”.
//
// Măsurat: 10/10 pe fotografii reale (5, 10, 50, 100 lei; pe masă, din teanc), 111/112 pe scanări cu perspectivă,
// lumină slabă/caldă, blur, fundal de lemn, decupaj. Ce nu e bancnotă (mâini, masa goală) iese cu scor 0.08–0.12,
// bancnotele 0.6–0.85 — de-aici pragul de 0.4. Doar culoarea nu merge (1/10 pe fotografii reale).
import { NOTES } from '../rules/game.js';

const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const EMBEDDER = 'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite';
const STORAGE_KEY = 'camera-arcade-notes';
export const MIN_SCORE = 0.4, MIN_MARGIN = 0.02;

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na * nb) || 1);
};

// cea mai apropiată bancnotă după amprentă; null dacă nu seamănă destul cu niciuna
export function classify(embedding, refs) {
  const best = {};
  for (const ref of refs) best[ref.value] = Math.max(best[ref.value] ?? -1, cosine(embedding, ref.embedding));
  const ranked = Object.entries(best).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const [value, score] = ranked[0];
  const margin = score - (ranked[1]?.[1] ?? -1);
  return score >= MIN_SCORE && margin >= MIN_MARGIN ? { value: Number(value), score, margin } : null;
}

let embedderPromise, builtinPromise;
function loadEmbedder() {
  embedderPromise ??= (async () => {
    const { FilesetResolver, ImageEmbedder } = await import(`${MEDIAPIPE}/+esm`);
    const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
    return ImageEmbedder.createFromOptions(vision, { baseOptions: { modelAssetPath: EMBEDDER }, l2Normalize: true, quantize: false, runningMode: 'IMAGE' });
  })();
  return embedderPromise;
}
const builtin = () => (builtinPromise ??= fetch(new URL('./banknote-refs.json', import.meta.url)).then(r => r.json()));

export function learned() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

async function embed(canvas) {
  const embedder = await loadEmbedder();
  return Array.from(embedder.embed(canvas).embeddings[0].floatEmbedding, v => Math.round(v * 1000) / 1000);
}

// pornește încărcarea modelului din timp (cât se deschide camera)
export const preload = () => Promise.all([loadEmbedder(), builtin()]);

// ține minte cum arată bancnota de valoare `value` (imaginea din chenar)
export async function teach(canvas, value) {
  if (!NOTES.includes(value)) return;
  const list = learned();
  list.push({ value, embedding: await embed(canvas) });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* mod privat */ }
}

/** Ce bancnotă e în chenar? { value, score } sau null. */
export async function recognize(canvas) {
  const [embedding, refs] = await Promise.all([embed(canvas), builtin()]);
  return classify(embedding, refs.concat(learned()));
}
