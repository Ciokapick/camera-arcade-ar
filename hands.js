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

let trackerPromise;
export function loadHandTracker() {
  trackerPromise ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import(`${MEDIAPIPE}/+esm`);
    const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
    const create = delegate => HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    // GPU e mai rapid, dar pe unele iPhone-uri nu pornește; atunci mergem pe CPU
    return create('GPU').catch(() => create('CPU'));
  })();
  return trackerPromise;
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

/** Urmărește mâinile din `video` și le desenează pe `canvas`. onHands(hands) primește mâinile ordonate stânga → dreapta pe ecran. */
export async function trackHands({ video, canvas, mirrored, onHands }) {
  const tracker = await loadHandTracker();
  const context = canvas.getContext('2d');
  let lastTime = -1, raf = 0, stopped = false;
  const loop = () => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    const detection = tracker.detectForVideo(video, performance.now());
    if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    context.clearRect(0, 0, canvas.width, canvas.height);
    const flip = mirrored();
    const hands = (detection.landmarks || [])
      .map(landmarks => ({ landmarks, gesture: classify(landmarks), x: flip ? 1 - landmarks[0].x : landmarks[0].x }))
      .sort((a, b) => a.x - b.x);
    hands.forEach((hand, i) => drawHand(context, canvas, hand, COLORS[i], flip));
    onHands(hands);
  };
  loop();
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    context.clearRect(0, 0, canvas.width, canvas.height);
  };
}
