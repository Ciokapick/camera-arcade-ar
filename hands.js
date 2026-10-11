// Recunoașterea mâinilor (MediaPipe Hand Landmarker) și clasificarea gestului piatră/hârtie/foarfecă.
const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Deget întins = vârful e mai departe de încheietură decât articulația PIP.
// Merge și cu mâna înclinată/orizontală, nu doar verticală.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function classify(landmarks) {
  const wrist = landmarks[0];
  const [index, middle, ring, pinky] = [[8, 6], [12, 10], [16, 14], [20, 18]]
    .map(([tip, pip]) => distance(landmarks[tip], wrist) > distance(landmarks[pip], wrist) * 1.1);
  const raised = [index, middle, ring, pinky].filter(Boolean).length;
  if (raised >= 4) return 'Hârtie';
  if (index && middle && !ring && !pinky) return 'Foarfecă';
  if (raised === 0) return 'Piatră';
  return null;
}

let vision;
const trackers = {};
// GPU e mai rapid; pe unele iPhone-uri nu pornește sau dă erori la detecție — atunci trecem pe CPU
export function loadHandTracker(delegate = 'GPU') {
  trackers[delegate] ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import(`${MEDIAPIPE}/+esm`);
    vision ??= await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
    return HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  })();
  return trackers[delegate];
}

const COLORS = ['#c9ff4a', '#4cc3ff'];
const JOINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17, 0]];

function drawHand(context, canvas, { landmarks, gesture }, color, mirrored) {
  const px = point => [point.x * canvas.width, point.y * canvas.height];
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 5;
  JOINS.forEach(chain => {
    context.beginPath();
    chain.forEach((point, i) => context[i ? 'lineTo' : 'moveTo'](...px(landmarks[point])));
    context.stroke();
  });
  landmarks.forEach(point => {
    context.beginPath();
    context.arc(...px(point), 6, 0, Math.PI * 2);
    context.fill();
  });
  // eticheta stă ancorată sub încheietură; pe camera frontală canvas-ul e oglindit, așa că întoarcem textul la loc
  const [x, y] = px(landmarks[0]);
  context.save();
  context.translate(x, y + 46);
  if (mirrored) context.scale(-1, 1);
  context.font = '900 34px system-ui';
  context.textAlign = 'center';
  context.lineWidth = 6;
  context.strokeStyle = '#000';
  context.strokeText(gesture || '?', 0, 0);
  context.fillText(gesture || '?', 0, 0);
  context.restore();
}

/**
 * Urmărește mâinile din `video` și le desenează pe `canvas`. onHands(hands) primește mâinile ordonate stânga → dreapta
 * pe ecran; onStatus(text) primește mesaje pentru utilizator (sau '' când totul e bine).
 */
export async function trackHands({ video, canvas, mirrored, onHands, onStatus = () => {} }) {
  let tracker = await loadHandTracker('GPU').catch(() => loadHandTracker('CPU'));
  const context = canvas.getContext('2d');
  let stopped = false, handle = 0, lastSeen = performance.now(), hinted = false, failures = 0, lastStamp = 0;
  // un cadru nou de la cameră: requestVideoFrameCallback unde există (Safari 15.4+, Chrome), altfel ~30 fps
  const next = () => {
    if (stopped) return;
    if (video.requestVideoFrameCallback) handle = video.requestVideoFrameCallback(detect);
    else handle = setTimeout(detect, 33);
  };
  async function detect() {
    if (stopped) return;
    if (video.readyState >= 2 && video.videoWidth) {
      let detection;
      try {
        // timestamp strict crescător, cerut de MediaPipe
        lastStamp = Math.max(lastStamp + 1, performance.now());
        detection = tracker.detectForVideo(video, lastStamp);
        failures = 0;
      } catch (error) {
        console.warn('Detecția mâinilor a dat eroare', error);
        if (++failures >= 3) {
          failures = 0;
          onStatus('Trec recunoașterea pe procesor…');
          tracker = await loadHandTracker('CPU');
          onStatus('');
        }
        return next();
      }
      if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
      context.clearRect(0, 0, canvas.width, canvas.height);
      const flip = mirrored();
      const hands = (detection.landmarks || [])
        .map(landmarks => ({ landmarks, gesture: classify(landmarks), x: flip ? 1 - landmarks[0].x : landmarks[0].x }))
        .sort((a, b) => a.x - b.x);
      hands.forEach((hand, i) => drawHand(context, canvas, hand, COLORS[i], flip));
      const now = performance.now();
      if (hands.length) {
        lastSeen = now;
        if (hinted) { hinted = false; onStatus(''); }
      } else if (!hinted && now - lastSeen > 6000) {
        hinted = true;
        onStatus('Nu văd nicio mână. Ține mâna întreagă în cadru, la 30–50 cm, cu lumină bună.');
      }
      onHands(hands);
    }
    next();
  }
  next();
  return () => {
    stopped = true;
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle);
    clearTimeout(handle);
    context.clearRect(0, 0, canvas.width, canvas.height);
  };
}
