// JS file for implementing Google's MediaPipe API for all face mapping. 

// ─────────────────────────────────────────────────────────────
//  PASSAGES — { quote, author }
//  Defaults used when passages.csv cannot be loaded.
//  CSV format: two columns — "Quote" and "Author"
// ─────────────────────────────────────────────────────────────
let PASSAGES = [
  { quote: "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!", author: "" },
  { quote: "In the beginning the Universe was created. This has made a lot of people very angry and been widely regarded as a bad move.", author: "Douglas Adams" },
  { quote: "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.", author: "Charles Dickens" },
  { quote: "All that is gold does not glitter, not all those who wander are lost; the old that is strong does not wither, deep roots are not reached by the frost.", author: "J.R.R. Tolkien" },
  { quote: "To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune.", author: "William Shakespeare" },
  { quote: "The greatest trick the devil ever pulled was convincing the world he did not exist. And like that, he is gone.", author: "Charles Baudelaire" },
];


// ─────────────────────────────────────────────────────────────
//  CSV LOADER
//  Fetches passages.csv from the same directory at startup.
//  Falls back silently to the built-in passages above.
// ─────────────────────────────────────────────────────────────
async function tryLoadCSV() {
  try {
    const res = await fetch('passages.csv');
    if (!res.ok) return;
    const text = await res.text();
    const parsed = parseCSV(text);
    if (parsed.length > 0) {
      PASSAGES = parsed;
      console.log(`Loaded ${PASSAGES.length} passages from passages.csv`);
    }
  } catch (e) {
    // No CSV found — silently use defaults
  }
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const quoteIdx  = header.findIndex(h => h === 'quote');
  const authorIdx = header.findIndex(h => h === 'author');
  if (quoteIdx === -1) return [];
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols   = splitCSVRow(lines[i]);
    const quote  = (cols[quoteIdx]  || '').trim().replace(/^"|"$/g, '').trim();
    const author = authorIdx !== -1 ? (cols[authorIdx] || '').trim().replace(/^"|"$/g, '').trim() : '';
    if (quote) results.push({ quote, author });
  }
  return results;
}

function splitCSVRow(row) {
  // Handles quoted fields containing commas
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"')              { inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
    else                        { cur += c; }
  }
  cols.push(cur);
  return cols;
}


// ─────────────────────────────────────────────────────────────
//  FACE FEATURES — removed one per mistake, in this order
// ─────────────────────────────────────────────────────────────
const FEATURES = [
  { name: "Left Eyebrow",  key: "leftBrow"  },
  { name: "Right Eyebrow", key: "rightBrow" },
  { name: "Nose",          key: "nose"      },
  { name: "Left Eye",      key: "leftEye"   },
  { name: "Right Eye",     key: "rightEye"  },
  { name: "Mouth",         key: "mouth"     },
  { name: "Ears",          key: "ears"      },
];

// MediaPipe landmark indices per feature
const LANDMARK_GROUPS = {
  leftBrow:  [336, 296, 334, 293, 300, 283, 282, 295, 285, 276, 283, 282, 295, 285, 336, 296, 334],
  rightBrow: [70,   63, 105,  66, 107,  55,  65,  52,  53,  46,  55,  65,  52,  53,  70,  63, 105],
  leftEye:   [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  rightEye:  [33,    7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  nose:      [168,   6, 197, 195,   5,   4,   1,  19,  94,   2, 164,   0],
  mouth:     [61,  185,  40,  39,  37,   0, 267, 269, 270, 409, 291, 375, 321, 405, 314,  17,  84, 181, 91, 146, 61],
  ears:      [234, 227, 116, 123, 147, 213, 215, 454, 447, 345, 352, 376, 433, 435],
};


// ─────────────────────────────────────────────────────────────
//  END MESSAGES — shown on failure, never repeats consecutively
// ─────────────────────────────────────────────────────────────
const END_MESSAGES = [
  "Try again. You can always find your self within.",
  "One must imagine Sisyphus happy. Keep going.",
  "The mirror looks back. Keep going.",
  "It takes time.",
];
let lastEndMessageIdx = -1;

function getEndMessage() {
  let idx;
  do { idx = Math.floor(Math.random() * END_MESSAGES.length); }
  while (idx === lastEndMessageIdx && END_MESSAGES.length > 1);
  lastEndMessageIdx = idx;
  return END_MESSAGES[idx];
}


// ─────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────
let currentPassageIdx = 0;
let passageChars  = [];
let charState     = [];   // 'pending' | 'correct' | 'incorrect'
let typedIndex    = 0;
let mistakeCount  = 0;
let totalMistakes = 0;
let startTime     = null;
let timerInterval = null;
let testActive    = false;
let testComplete  = false;
let hiddenFeatures = new Set();

// Camera / MediaPipe
let cameraActive   = false;
let latestLandmarks = null;
let faceMesh       = null;
let mpCamera       = null;


// ─────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────
function init() {
  loadPassage(0);
  document.getElementById('type-input').addEventListener('input',   onInput);
  document.getElementById('type-input').addEventListener('keydown', onKeydown);
}


// ─────────────────────────────────────────────────────────────
//  PASSAGE LOADING
// ─────────────────────────────────────────────────────────────
function loadPassage(idx) {
  const entry  = PASSAGES[idx];
  passageChars = entry.quote.split('');
  typedIndex   = 0;
  mistakeCount = 0;
  totalMistakes = 0;
  hiddenFeatures = new Set();
  testActive   = false;
  testComplete = false;

  clearTimer();
  initCharState();
  fullRenderPassage();
  updateStats();

  document.getElementById('type-input').value    = '';
  document.getElementById('type-input').disabled = false;
  document.getElementById('type-input').focus();
  document.getElementById('mistake-count-display').textContent = '0';

  // Author line
  const authorEl = document.getElementById('author-text');
  authorEl.textContent = entry.author ? '— ' + entry.author : '';
}


// ─────────────────────────────────────────────────────────────
//  PASSAGE RENDERING
// ─────────────────────────────────────────────────────────────
function initCharState() {
  charState = passageChars.map(() => 'pending');
}

function escHtml(ch) {
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  if (ch === '&') return '&amp;';
  return ch;
}

function fullRenderPassage() {
  const el = document.getElementById('passage');
  let html = '';
  for (let i = 0; i < passageChars.length; i++) {
    const ch  = passageChars[i] === ' ' ? '&nbsp;' : escHtml(passageChars[i]);
    let   cls = 'char';
    if      (charState[i] === 'correct')   cls += ' correct';
    else if (charState[i] === 'incorrect') cls += ' incorrect';
    if (i === typedIndex && !testComplete) cls += ' cursor';
    html += `<span class="${cls}">${ch}</span>`;
  }
  el.innerHTML = html;
}


// ─────────────────────────────────────────────────────────────
//  TYPING LOGIC
// ─────────────────────────────────────────────────────────────
function onKeydown(e) {
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (typedIndex > 0) {
      typedIndex--;
      charState[typedIndex] = 'pending';
      fullRenderPassage();
      updateStats();
    }
  }
}

function onInput(e) {
  if (testComplete) { e.target.value = ''; return; }

  const input = e.target;
  const typed = input.value;
  if (!typed.length) return;

  // Start timer on first keystroke
  if (!testActive) {
    startTimer();
    testActive = true;
  }

  const char     = typed[typed.length - 1];
  input.value    = '';   // we manage state manually

  if (typedIndex >= passageChars.length) return;

  const expected = passageChars[typedIndex];
  if (char === expected) {
    charState[typedIndex] = 'correct';
  } else {
    charState[typedIndex] = 'incorrect';
    totalMistakes++;
    mistakeCount++;
    onMistake();
  }
  typedIndex++;

  fullRenderPassage();
  updateStats();

  if (typedIndex >= passageChars.length) endTest();
}

function onMistake() {
  document.getElementById('mistake-count-display').textContent = totalMistakes;
  document.getElementById('err-val').textContent = totalMistakes;

  // Flash passage area
  const wrapper = document.getElementById('passage-wrapper');
  wrapper.classList.remove('flash-red');
  void wrapper.offsetWidth;
  wrapper.classList.add('flash-red');

  // Remove the next face feature
  const featureToRemove = FEATURES.find(f => !hiddenFeatures.has(f.key));
  if (featureToRemove) hiddenFeatures.add(featureToRemove.key);
}


// ─────────────────────────────────────────────────────────────
//  STATS & TIMER
// ─────────────────────────────────────────────────────────────
function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    document.getElementById('timer-display').textContent = `${m}:${s}`;
    updateWPM();
  }, 500);
}

function clearTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  startTime     = null;
  document.getElementById('timer-display').textContent = '00:00';
}

function updateWPM() {
  if (!startTime) return;
  const elapsed    = (Date.now() - startTime) / 1000 / 60;
  const wordsTyped = typedIndex / 5;
  const wpm        = elapsed > 0 ? Math.round(wordsTyped / elapsed) : 0;
  document.getElementById('wpm-val').textContent = wpm;
}

function updateStats() {
  const correct  = charState.filter(s => s === 'correct').length;
  const total    = typedIndex;
  const acc      = total > 0 ? Math.round((correct / total) * 100) : 100;
  const progress = Math.round((typedIndex / passageChars.length) * 100);

  document.getElementById('acc-val').textContent  = acc + '%';
  document.getElementById('prog-val').textContent = progress + '%';
  document.getElementById('err-val').textContent  = totalMistakes;
}


// ─────────────────────────────────────────────────────────────
//  END TEST
// ─────────────────────────────────────────────────────────────
function endTest() {
  testComplete = true;
  testActive   = false;
  clearTimer();

  const elapsed = startTime ? (Date.now() - startTime) / 1000 / 60 : 1;
  const wpm     = Math.round((passageChars.length / 5) / elapsed);
  const correct = charState.filter(s => s === 'correct').length;
  const acc     = Math.round((correct / passageChars.length) * 100);

  document.getElementById('r-wpm').textContent = wpm;
  document.getElementById('r-acc').textContent = acc + '%';
  document.getElementById('r-err').textContent = totalMistakes;
  document.getElementById('type-input').disabled = true;

  if (totalMistakes > 6) { // Changing the number to >0 so it's less stringent
    document.getElementById('end-message').textContent = getEndMessage();
    document.getElementById('end-overlay').style.display = 'flex';
  } else {
    document.getElementById('success-overlay').style.display = 'flex';
  }
}

function closeEnd() {
  document.getElementById('end-overlay').style.display     = 'none';
  document.getElementById('success-overlay').style.display = 'none';
}


// ─────────────────────────────────────────────────────────────
//  CONTROLS
// ─────────────────────────────────────────────────────────────
function startTest() {
  loadPassage(currentPassageIdx);
}

function resetTest() {
  loadPassage(currentPassageIdx);
}

function cyclePassage() {
  currentPassageIdx = (currentPassageIdx + 1) % PASSAGES.length;
  loadPassage(currentPassageIdx);
}


// ─────────────────────────────────────────────────────────────
//  CAMERA & FACE MESH
// ─────────────────────────────────────────────────────────────
async function startCamera() {
  const video = document.getElementById('video');
  const msg   = document.getElementById('no-camera-msg');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    video.style.display = 'block';
    msg.style.display   = 'none';
    cameraActive        = true;

    document.getElementById('cam-status-dot').className      = 'status-dot live'; // Modify
    document.getElementById('cam-status-text').textContent   = 'Camera On'; // Moidfy

    await video.play();
    initFaceMesh(video);
  } catch (err) {
    console.warn('Camera error:', err);
    msg.innerHTML = `
      <div class="camera-icon">🚫</div>
      <div style="color:var(--red)">Camera access denied</div>
      <div style="font-size:0.7rem;color:rgba(0,0,0,0.4)">Check browser permissions</div>`;
  }
}

function initFaceMesh(videoEl) {
  const canvas = document.getElementById('face-canvas');
  const ctx    = canvas.getContext('2d');

  function syncCanvasSize() {
    const rect   = videoEl.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
  }
  syncCanvasSize();
  window.addEventListener('resize', syncCanvasSize);

  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces:          1,
    refineLandmarks:      true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence:  0.5,
  });

  faceMesh.onResults((results) => {
    syncCanvasSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      latestLandmarks = results.multiFaceLandmarks[0];
      document.getElementById('face-status').innerHTML = 'Face: <span style="color:var(--red)">Detected</span>'; // Modifying
      drawFaceMesh(ctx, canvas, latestLandmarks);
    } else {
      latestLandmarks = null;
      document.getElementById('face-status').innerHTML = 'Face: <span style="color:rgba(255,0,0,0.4)">Not Found</span>'; // Modifying
    }
  });

  mpCamera = new Camera(videoEl, {
    onFrame: async () => { await faceMesh.send({ image: videoEl }); },
    width:  640,
    height: 480,
  });
  mpCamera.start();
}

function drawFaceMesh(ctx, canvas, landmarks) {
  const W = canvas.width;
  const H = canvas.height;

  function lm(idx) {
    const p = landmarks[idx];
    return { x: p.x * W, y: p.y * H };
  }

  ctx.clearRect(0, 0, W, H);

  // Draw red redaction blocks for each lost feature — no dots or mesh lines
  Object.entries(LANDMARK_GROUPS).forEach(([key, indices]) => {
    if (!hiddenFeatures.has(key)) return;

    const pts  = indices.map(i => lm(i));
    const xs   = pts.map(p => p.x);
    const ys   = pts.map(p => p.y);
    const minX = Math.min(...xs),  maxX = Math.max(...xs);
    const minY = Math.min(...ys),  maxY = Math.max(...ys);
    const padX = (maxX - minX) * 1.2 + W * 0.06;
    const padY = (maxY - minY) * 1.4 + H * 0.05;

    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#ff0000';
    ctx.fillRect(minX - padX, minY - padY, (maxX - minX) + padX * 1.5, (maxY - minY) + padY * 1.5); // Modify the size of padding here to make the rectangle bigger or smaller.
  });
}


// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await tryLoadCSV();
  init();
});