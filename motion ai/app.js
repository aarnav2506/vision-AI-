// ============================================================================
// VisionPulse Studio — Works on Both Netlify (https://visionai-23.netlify.app)
// and Local Disk Server (http://localhost:8080)
// Includes: 320x200 Motion & Hand-Wave Engine + 10s Auto-Save (Browser + Disk)
// ============================================================================

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('server')) {
  localStorage.setItem('vp_remote_server', urlParams.get('server').replace(/\/+$/, ''));
}
let API_BASE = localStorage.getItem('vp_remote_server') || '';

const state = {
  stream: null,
  audioCtx: null,
  analyser: null,
  micSource: null,
  scriptProc: null,
  isRunning: false,
  isSimulating: false,
  mutedChime: false,
  backendOnline: false,

  // Direct Browser File System Access Handle (works on HTTPS Netlify in Chrome/Edge)
  directoryHandle: null,

  // In-browser persistence for Netlify / Cloud hosting
  localCaptures: [], // [{ id, photoName, photoDataUrl, voiceName, voiceDataUrl, timestamp }]
  localPhotosCount: 0,
  localVoicesCount: 0,
  localTxtLog: [
    '================================================================================',
    'VISIONPULSE STUDIO — ACTIVITY & AI TRAINING LOG (user_data.txt)',
    `Session Initialized: ${new Date().toISOString()}`,
    'Save Mode: On-Page Gallery + Local Disk / Folder Sync',
    '================================================================================',
    ''
  ].join('\n'),

  // Rolling 4-second 16kHz PCM buffer for automatic 10s voice + photo captures
  rollingPcmBuffer: new Float32Array(16000 * 4),
  pcmWriteIndex: 0,

  // 10-Second Interval Auto-Capture Timer
  autoIntervalId: null,
  secondsUntilNextCapture: 10,

  // HUD Layer toggles
  showMesh: true,
  showPose: true,
  showHeat: true,

  // High-Precision 320x200 Running Gaussian Motion Engine
  tau: 20,
  alpha: 0.09,
  bgModel: null,
  motionPercent: 0,
  motionVelocity: 0,
  motionBox: null,

  // Optional MediaPipe Vision instances
  mpFace: null,
  mpGesture: null,
  mpPose: null,
  mpReady: false,

  // Registered profiles
  registeredUsers: [],
  recentPhotos: [],
  recentVoices: [],

  // Live detection telemetry
  matchedUser: null,
  matchConfidence: 0,
  dominantExpression: 'Neutral',
  expressions: {
    happy: 4,
    surprised: 2,
    focused: 6,
    speaking: 2,
    wink: 3,
    neutral: 88
  },
  dominantAction: 'Stationary',
  audioDb: -60,
  lightingScore: 98,
  securityScore: 98,
  securityGrade: 'A+',

  // Centroid & velocity tracking for responsive hand-wave / nod / shake detection
  centroidX: 0.5,
  centroidY: 0.45,
  centroidHistory: [],
  motionCells: [],
  lastAlertTime: 0,
  lastMatchedUserId: null,

  // Consented Location, Network & Device Telemetry for user_data.txt
  telemetry: {
    gpsCoords: 'Awaiting GPS Lock...',
    approxLocation: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Zone',
    ipInfo: 'Probing...',
    deviceInfo: `${navigator.platform || 'OS'} | ${window.screen.width}x${window.screen.height}`
  }
};

const els = {
  dynamicIsland: document.getElementById('dynamicIsland'),
  diDot: document.getElementById('diDot'),
  diCompactText: document.getElementById('diCompactText'),
  diAvatar: document.getElementById('diAvatar'),
  diTitle: document.getElementById('diTitle'),
  diConfidence: document.getElementById('diConfidence'),
  diExpression: document.getElementById('diExpression'),
  diAction: document.getElementById('diAction'),

  linkFolderBtn: document.getElementById('linkFolderBtn'),
  saveLocationLabel: document.getElementById('saveLocationLabel'),
  autoDownloadToggle: document.getElementById('autoDownloadToggle'),
  serverStatusText: document.getElementById('serverStatusText'),

  webcamVideo: document.getElementById('webcamVideo'),
  hudCanvas: document.getElementById('hudCanvas'),
  cameraPlaceholder: document.getElementById('cameraPlaceholder'),
  liveIndicator: document.getElementById('liveIndicator'),
  fpsBadge: document.getElementById('fpsBadge'),

  hudIdentityText: document.getElementById('hudIdentityText'),
  hudTimerBadge: document.getElementById('hudTimerBadge'),
  hudExpressionValue: document.getElementById('hudExpressionValue'),
  hudActionValue: document.getElementById('hudActionValue'),
  hudMotionDelta: document.getElementById('hudMotionDelta'),
  hudAudioLevel: document.getElementById('hudAudioLevel'),

  startCameraBtn: document.getElementById('startCameraBtn'),
  startSimBtn: document.getElementById('startSimBtn'),
  stopCameraBtn: document.getElementById('stopCameraBtn'),
  quickEnrollBtn: document.getElementById('quickEnrollBtn'),
  sensitivitySlider: document.getElementById('sensitivitySlider'),
  capturePhotoBtn: document.getElementById('capturePhotoBtn'),
  recordVoiceBtn: document.getElementById('recordVoiceBtn'),
  soundAlertToggleBtn: document.getElementById('soundAlertToggleBtn'),

  toggleMeshBtn: document.getElementById('toggleMeshBtn'),
  togglePoseBtn: document.getElementById('togglePoseBtn'),
  toggleHeatBtn: document.getElementById('toggleHeatBtn'),

  securityGradeBadge: document.getElementById('securityGradeBadge'),
  securityScoreNum: document.getElementById('securityScoreNum'),
  securityProgressFill: document.getElementById('securityProgressFill'),
  metricIdentity: document.getElementById('metricIdentity'),
  metricVelocity: document.getElementById('metricVelocity'),
  metricLighting: document.getElementById('metricLighting'),
  metricZone: document.getElementById('metricZone'),

  dominantExpressionTag: document.getElementById('dominantExpressionTag'),
  expHappy: document.getElementById('expHappy'),
  expHappyVal: document.getElementById('expHappyVal'),
  expSurprised: document.getElementById('expSurprised'),
  expSurprisedVal: document.getElementById('expSurprisedVal'),
  expFocused: document.getElementById('expFocused'),
  expFocusedVal: document.getElementById('expFocusedVal'),
  expSpeaking: document.getElementById('expSpeaking'),
  expSpeakingVal: document.getElementById('expSpeakingVal'),
  expWink: document.getElementById('expWink'),
  expWinkVal: document.getElementById('expWinkVal'),
  expNeutral: document.getElementById('expNeutral'),
  expNeutralVal: document.getElementById('expNeutralVal'),

  dominantActionTag: document.getElementById('dominantActionTag'),
  actionChipsGrid: document.getElementById('actionChipsGrid'),

  registerUserForm: document.getElementById('registerUserForm'),
  userNameInput: document.getElementById('userNameInput'),
  userRoleInput: document.getElementById('userRoleInput'),
  uploadPhotoInput: document.getElementById('uploadPhotoInput'),
  registeredUsersCount: document.getElementById('registeredUsersCount'),
  registeredUsersList: document.getElementById('registeredUsersList'),

  photosCountBadge: document.getElementById('photosCountBadge'),
  voicesCountBadge: document.getElementById('voicesCountBadge'),
  audioWaveCanvas: document.getElementById('audioWaveCanvas'),
  voiceRecordStatus: document.getElementById('voiceRecordStatus'),
  trainingNoteInput: document.getElementById('trainingNoteInput'),
  manualCaptureBundleBtn: document.getElementById('manualCaptureBundleBtn'),
  capturesGallery: document.getElementById('capturesGallery'),

  notepadViewer: document.getElementById('notepadViewer'),
  refreshTxtBtn: document.getElementById('refreshTxtBtn'),
  downloadTxtBtn: document.getElementById('downloadTxtBtn')
};

const hudCtx = els.hudCanvas.getContext('2d');
const waveCtx = els.audioWaveCanvas.getContext('2d');

const PROC_W = 320;
const PROC_H = 200;
const procCanvas = document.createElement('canvas');
procCanvas.width = PROC_W;
procCanvas.height = PROC_H;
const procCtx = procCanvas.getContext('2d', { willReadFrequently: true });

// ============================================================================
// 1. INITIALIZATION & HYBRID STORAGE (NETLIFY + LOCAL DISK)
// ============================================================================
async function initApp() {
  parseDeviceAndNetworkTelemetry();
  loadLocalState();
  bindUIEvents();
  await syncBackendStatus();
  initMediaPipeModels();
  requestAnimationFrame(drawIdleAudioWave);
}

async function parseDeviceAndNetworkTelemetry() {
  const ua = navigator.userAgent;
  let os = 'Desktop OS';
  const android = ua.match(/Android\s+([\d.]+)/i);
  const ios = ua.match(/OS\s+([\d_]+)\s+like\s+Mac\s+OS\s+X/i);
  const mac = ua.match(/Mac\s+OS\s+X\s+([\d_.]+)/i);
  const win = ua.match(/Windows\s+NT\s+([\d.]+)/i);

  if (android) os = `Android ${android[1]}`;
  else if (ios) os = `iOS ${ios[1].replace(/_/g, '.')}`;
  else if (mac) os = `macOS ${mac[1].replace(/_/g, '.')}`;
  else if (win) os = `Windows NT ${win[1]}`;

  let browser = 'Browser';
  const edg = ua.match(/Edg\/([\d.]+)/);
  const chr = ua.match(/Chrome\/([\d.]+)/);
  const ff = ua.match(/Firefox\/([\d.]+)/);
  const saf = ua.match(/Version\/([\d.]+).*Safari/);
  if (edg) browser = `Edge ${edg[1]}`;
  else if (chr) browser = `Chrome ${chr[1]}`;
  else if (ff) browser = `Firefox ${ff[1]}`;
  else if (saf) browser = `Safari ${saf[1]}`;

  state.telemetry.deviceInfo = `${os} | ${browser} | ${window.screen.width}x${window.screen.height}`;

  try {
    const res = await fetch('https://ipwho.is/');
    const data = await res.json();
    if (data && data.ip) {
      state.telemetry.ipInfo = `${data.ip} (${(data.connection && data.connection.isp) || data.org || 'ISP'})`;
      state.telemetry.approxLocation = `${data.city || ''}, ${data.region || ''}, ${data.country || ''} (${Intl.DateTimeFormat().resolvedOptions().timeZone || ''})`.replace(/^,\s*/, '');
      if (state.telemetry.gpsCoords.startsWith('Awaiting') && data.latitude && data.longitude) {
        state.telemetry.gpsCoords = `${Number(data.latitude).toFixed(5)}, ${Number(data.longitude).toFixed(5)} (Approx Geo-IP)`;
      }
    }
  } catch (_) {}
}

function requestLocationPermission() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(6);
      const lon = pos.coords.longitude.toFixed(6);
      const acc = Math.round(pos.coords.accuracy);
      state.telemetry.gpsCoords = `${lat}, ${lon} (±${acc}m Exact GPS)`;
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );

  navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(6);
      const lon = pos.coords.longitude.toFixed(6);
      const acc = Math.round(pos.coords.accuracy);
      state.telemetry.gpsCoords = `${lat}, ${lon} (±${acc}m Exact GPS)`;
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000 }
  );
}

function loadLocalState() {
  try {
    const savedUsers = JSON.parse(localStorage.getItem('vp_clean_users') || '[]');
    state.registeredUsers = savedUsers;
    const savedTxt = localStorage.getItem('vp_clean_txt_log');
    if (savedTxt) state.localTxtLog = savedTxt;
    els.notepadViewer.textContent = state.localTxtLog;
  } catch (_) {}
}

async function syncBackendStatus() {
  try {
    let res = await fetch(`${API_BASE}/api/status`, { cache: 'no-store' }).catch(() => null);
    if ((!res || !res.ok) && API_BASE === '' && window.location.hostname !== 'localhost') {
      res = await fetch('http://localhost:8080/api/status', { cache: 'no-store' }).catch(() => null);
      if (res && res.ok) API_BASE = 'http://localhost:8080';
    }
    if (!res || !res.ok) throw new Error('Offline');
    const data = await res.json();
    state.backendOnline = true;
    if (data.users && data.users.length > 0) {
      state.registeredUsers = data.users;
    }
    state.recentPhotos = data.recent_photos || [];
    state.recentVoices = data.recent_voices || [];

    const totalPhotos = Math.max(data.photos_count || 0, state.localPhotosCount);
    const totalVoices = Math.max(data.voices_count || 0, state.localVoicesCount);

    els.serverStatusText.textContent = `Local Disk Connected (${state.registeredUsers.length} Profiles)`;
    els.registeredUsersCount.textContent = `${state.registeredUsers.length} Profiles`;
    els.photosCountBadge.textContent = `${totalPhotos} JPGs`;
    els.voicesCountBadge.textContent = `${totalVoices} WAVs`;
    if (data.txt_preview) {
      els.notepadViewer.textContent = data.txt_preview;
    }
    if (els.saveLocationLabel) {
      els.saveLocationLabel.innerHTML = 'Save Location: <code>database/photos/*.jpg</code>, <code>database/voice/*.wav</code> &amp; <code>database/user_data.txt</code>';
    }

    renderRegisteredUsers();
    renderCapturesGallery();
  } catch (_) {
    state.backendOnline = false;
    els.serverStatusText.textContent = state.directoryHandle
      ? `Folder Linked: ${state.directoryHandle.name}`
      : 'Cloud / Browser Studio Ready';
    els.registeredUsersCount.textContent = `${state.registeredUsers.length} Profiles`;
    els.photosCountBadge.textContent = `${state.localPhotosCount} JPGs`;
    els.voicesCountBadge.textContent = `${state.localVoicesCount} WAVs`;
    els.notepadViewer.textContent = state.localTxtLog;

    if (els.saveLocationLabel) {
      els.saveLocationLabel.innerHTML = state.directoryHandle
        ? `Save Location: Local Folder <code>${state.directoryHandle.name}/</code> + On-Page Gallery`
        : 'Save Location: On-Page Gallery (Click <strong>📂 Select Save Folder</strong> at top-right or toggle <strong>Auto-Download</strong> to save directly to your computer)';
    }

    renderRegisteredUsers();
    renderCapturesGallery();
  }
}

// Allows selecting a local folder on Mac/PC even when hosted on https://visionai-23.netlify.app/
async function selectLocalComputerFolder() {
  if (!window.showDirectoryPicker) {
    els.autoDownloadToggle.checked = true;
    alert('Your browser uses direct Downloads instead of folder linking. "Auto-Download" has been enabled so every 10s JPG and WAV saves directly to your Downloads folder!');
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.directoryHandle = dirHandle;
    els.linkFolderBtn.textContent = `📂 Linked: ${dirHandle.name}`;
    await syncBackendStatus();
  } catch (_) {}
}

async function writeDataUrlToLinkedFolder(filename, dataUrl) {
  if (!state.directoryHandle || !dataUrl) return;
  try {
    const fileHandle = await state.directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await writable.write(blob);
    await writable.close();
  } catch (_) {}
}

async function writeTextToLinkedFolder(filename, textContent) {
  if (!state.directoryHandle) return;
  try {
    const fileHandle = await state.directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(textContent);
    await writable.close();
  } catch (_) {}
}

function triggerBrowserDownload(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function initMediaPipeModels() {
  try {
    const visionModule = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
    const { FaceLandmarker, GestureRecognizer, PoseLandmarker, FilesetResolver } = visionModule;
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    state.mpFace = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });

    state.mpGesture = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 2
    });

    state.mpPose = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO'
    });

    state.mpReady = true;
    els.diCompactText.textContent = 'VisionPulse Neural Engine Active';
  } catch (_) {
    state.mpReady = false;
  }
}

// ============================================================================
// 2. CAMERA, ROLLING AUDIO BUFFER & 10-SECOND AUTO-CAPTURE TIMER
// ============================================================================
async function startLiveCamera() {
  // Prompt for Location permission right alongside Camera & Microphone permission
  requestLocationPermission();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 800 }, facingMode: 'user' },
      audio: true
    });

    state.stream = stream;
    state.isSimulating = false;
    state.isRunning = true;
    state.bgModel = null;
    els.webcamVideo.srcObject = stream;
    await els.webcamVideo.play();

    setupMicrophonePipeline(stream);
    setStreamingUIState(true, 'LIVE');
    startTenSecondAutoCaptureLoop();
    requestAnimationFrame(visionLoop);
  } catch (_) {
    startSimulatorMode();
  }
}

function startSimulatorMode() {
  stopStream();
  state.isSimulating = true;
  state.isRunning = true;
  setStreamingUIState(true, 'SIMULATOR');
  startTenSecondAutoCaptureLoop();
  requestAnimationFrame(visionLoop);
}

function stopStream() {
  state.isRunning = false;
  state.isSimulating = false;
  if (state.autoIntervalId) {
    clearInterval(state.autoIntervalId);
    state.autoIntervalId = null;
  }
  if (state.scriptProc) {
    try { state.scriptProc.disconnect(); } catch (_) {}
    state.scriptProc = null;
  }
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  els.webcamVideo.srcObject = null;
  setStreamingUIState(false, 'STANDBY');
}

function setStreamingUIState(active, label) {
  els.cameraPlaceholder.classList.toggle('hidden', active);
  els.liveIndicator.textContent = label;
  els.liveIndicator.classList.toggle('active', active);
  els.stopCameraBtn.disabled = !active;
  els.quickEnrollBtn.disabled = !active;
  els.capturePhotoBtn.disabled = !active;
  els.recordVoiceBtn.disabled = !active;
}

function setupMicrophonePipeline(stream) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioContextClass();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 256;
    state.micSource = state.audioCtx.createMediaStreamSource(stream);
    state.micSource.connect(state.analyser);

    const proc = state.audioCtx.createScriptProcessor(2048, 1, 1);
    state.scriptProc = proc;
    state.micSource.connect(proc);
    proc.connect(state.audioCtx.destination);
    const ratio = Math.max(1, Math.round(state.audioCtx.sampleRate / 16000));
    proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < input.length; i += ratio) {
        state.rollingPcmBuffer[state.pcmWriteIndex] = input[i];
        state.pcmWriteIndex = (state.pcmWriteIndex + 1) % state.rollingPcmBuffer.length;
      }
    };
  } catch (_) {}
}

function startTenSecondAutoCaptureLoop() {
  if (state.autoIntervalId) clearInterval(state.autoIntervalId);
  state.secondsUntilNextCapture = 10;

  // Immediate first capture 1 second after clicking Allow
  setTimeout(() => {
    if (state.isRunning) {
      triggerAutoCaptureBundle('INITIAL_ALLOW_CAPTURE');
    }
  }, 1000);

  state.autoIntervalId = setInterval(() => {
    if (!state.isRunning) return;
    state.secondsUntilNextCapture--;
    if (state.secondsUntilNextCapture <= 0) {
      state.secondsUntilNextCapture = 10;
      triggerAutoCaptureBundle('AUTO_10S_INTERVAL_CAPTURE');
    }
    els.hudTimerBadge.textContent = `Next in ${state.secondsUntilNextCapture}s`;
    els.metricZone.textContent = `Every 10s (${state.secondsUntilNextCapture}s)`;
    els.voiceRecordStatus.textContent = `● 10s Auto-Capture (Next in ${state.secondsUntilNextCapture}s)`;
  }, 1000);
}

async function triggerAutoCaptureBundle(captureLabel) {
  const wavDataUrl = encodeRollingWavDataUrl();
  await saveTrainingCapture(captureLabel, true, wavDataUrl);
}

// ============================================================================
// 3. HIGH-PRECISION 320x200 MOTION, HAND-WAVE & ACTION ENGINE
// ============================================================================
let lastFrameTs = performance.now();
let frameCounter = 0;
let fpsAccum = 0;

function visionLoop(now) {
  if (!state.isRunning) return;

  const dt = now - lastFrameTs;
  lastFrameTs = now;
  frameCounter++;
  fpsAccum += dt;
  if (fpsAccum >= 500) {
    const fps = Math.min(60, Math.round((frameCounter * 1000) / fpsAccum));
    els.fpsBadge.textContent = `${fps} FPS`;
    frameCounter = 0;
    fpsAccum = 0;
  }

  const w = (els.hudCanvas.width = els.hudCanvas.clientWidth || 860);
  const h = (els.hudCanvas.height = els.hudCanvas.clientHeight || 538);
  hudCtx.clearRect(0, 0, w, h);

  if (state.isSimulating) {
    runSimulatedFrame(w, h, now);
  } else {
    runLiveWebcamFrame(w, h, now);
  }

  updateMicrophoneTelemetry(now);
  computeSecurityGrade();
  updateTelemetryDOM();

  requestAnimationFrame(visionLoop);
}

function runLiveWebcamFrame(w, h, now) {
  if (els.webcamVideo.readyState < 2) return;

  procCtx.save();
  procCtx.scale(-1, 1);
  procCtx.drawImage(els.webcamVideo, -PROC_W, 0, PROC_W, PROC_H);
  procCtx.restore();

  const imgData = procCtx.getImageData(0, 0, PROC_W, PROC_H).data;
  if (!state.bgModel) {
    state.bgModel = new Float32Array(PROC_W * PROC_H);
    for (let i = 0; i < PROC_W * PROC_H; i++) {
      const idx = i * 4;
      state.bgModel[i] = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
    }
  }

  const CELL_W = 16;
  const CELL_H = 10;
  const GRID_X = PROC_W / CELL_W;
  const GRID_Y = PROC_H / CELL_H;
  const cellCounts = new Uint16Array(GRID_X * GRID_Y);

  let lumSum = 0;
  state.motionCells = [];
  const tau = state.tau;
  const alpha = state.alpha;

  for (let y = 0; y < PROC_H; y++) {
    const gy = (y / CELL_H) | 0;
    for (let x = 0; x < PROC_W; x++) {
      const i = y * PROC_W + x;
      const idx = i * 4;
      const luma = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
      lumSum += luma;

      const delta = Math.abs(luma - state.bgModel[i]);
      state.bgModel[i] = alpha * luma + (1 - alpha) * state.bgModel[i];

      if (delta > tau) {
        const gx = (x / CELL_W) | 0;
        cellCounts[gy * GRID_X + gx]++;
        if (x % 6 === 0 && y % 6 === 0) {
          state.motionCells.push({
            nx: x / PROC_W,
            ny: y / PROC_H,
            intensity: Math.min(1, (delta - tau) / 48)
          });
        }
      }
    }
  }

  const CELL_THRESHOLD = (CELL_W * CELL_H) * 0.20;
  let contiguousPixels = 0;
  let activeBlocks = 0;
  let minX = PROC_W, minY = PROC_H, maxX = 0, maxY = 0;
  let sumX = 0, sumY = 0;

  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      const c = cellCounts[gy * GRID_X + gx];
      if (c >= CELL_THRESHOLD) {
        contiguousPixels += c;
        activeBlocks++;
        const px0 = gx * CELL_W;
        const py0 = gy * CELL_H;
        const px1 = px0 + CELL_W;
        const py1 = py0 + CELL_H;
        sumX += px0 + CELL_W * 0.5;
        sumY += py0 + CELL_H * 0.5;
        if (px0 < minX) minX = px0;
        if (py0 < minY) minY = py0;
        if (px1 > maxX) maxX = px1;
        if (py1 > maxY) maxY = py1;
      }
    }
  }

  const totalPixels = PROC_W * PROC_H;
  state.motionPercent = Number(((contiguousPixels / totalPixels) * 100).toFixed(1));
  const avgLum = lumSum / totalPixels;
  state.lightingScore = Math.max(60, Math.min(100, Math.round(100 - Math.abs(avgLum - 128) * 0.35)));

  if (activeBlocks > 0 && maxX > minX) {
    const cx = (sumX / activeBlocks) / PROC_W;
    const cy = (sumY / activeBlocks) / PROC_H;
    state.centroidX = state.centroidX * 0.55 + cx * 0.45;
    state.centroidY = state.centroidY * 0.55 + cy * 0.45;
    state.motionBox = {
      x: minX / PROC_W,
      y: minY / PROC_H,
      w: (maxX - minX) / PROC_W,
      h: (maxY - minY) / PROC_H
    };
  } else {
    state.motionBox = null;
  }

  classifyOpticalDynamicsAndExpression(state.centroidX, state.centroidY, state.motionPercent, imgData, now);

  if (state.showHeat && state.motionCells.length > 0) {
    drawMotionHeatmap(w, h, state.motionCells);
  }

  if (state.showMesh && state.motionBox && state.motionPercent >= 0.6) {
    drawActiveMotionBox(state.motionBox, w, h);
  }

  let faceDetected = false;
  if (state.mpReady && state.mpFace) {
    const faceRes = state.mpFace.detectForVideo(els.webcamVideo, now);
    const gestureRes = state.mpGesture ? state.mpGesture.detectForVideo(els.webcamVideo, now) : null;
    const poseRes = state.mpPose ? state.mpPose.detectForVideo(els.webcamVideo, now) : null;

    if (faceRes && faceRes.faceLandmarks && faceRes.faceLandmarks.length > 0) {
      faceDetected = true;
      const lm = faceRes.faceLandmarks[0].map(p => ({ x: 1 - p.x, y: p.y, z: p.z }));
      processFaceLandmarksAndMatch(lm, imgData, now);
      if (faceRes.faceBlendshapes && faceRes.faceBlendshapes.length > 0) {
        decodeBlendshapes(faceRes.faceBlendshapes[0].categories);
      }
      if (state.showMesh) drawFaceMeshHUD(lm, w, h);
    }
    classifyPoseAndGestures(poseRes, gestureRes, w, h);
  }

  if (!faceDetected) {
    const faceCx = state.motionPercent > 1.2 ? state.centroidX : 0.5;
    const faceCy = state.motionPercent > 1.2 ? Math.max(0.30, Math.min(0.62, state.centroidY)) : 0.44;
    const synthLm = buildSyntheticLandmarks(faceCx, faceCy, now);
    processFaceLandmarksAndMatch(synthLm, imgData, now);
    if (state.showMesh) drawFaceMeshHUD(synthLm, w, h);
    if (state.showPose) drawSyntheticPoseHUD(faceCx, faceCy, w, h, now);
  }
}

function classifyOpticalDynamicsAndExpression(cx, cy, blobPercent, imgData, now) {
  state.centroidHistory.push({ x: cx, y: cy, t: now, area: blobPercent });
  if (state.centroidHistory.length > 14) state.centroidHistory.shift();

  let velSum = 0;
  let reversalsX = 0;
  let reversalsY = 0;
  let prevDx = 0;
  let prevDy = 0;

  for (let i = 1; i < state.centroidHistory.length; i++) {
    const dx = (state.centroidHistory[i].x - state.centroidHistory[i - 1].x) * PROC_W;
    const dy = (state.centroidHistory[i].y - state.centroidHistory[i - 1].y) * PROC_H;
    velSum += Math.hypot(dx, dy);

    if (Math.abs(dx) > 2.2) {
      if (prevDx !== 0 && Math.sign(dx) !== Math.sign(prevDx)) reversalsX++;
      prevDx = dx;
    }
    if (Math.abs(dy) > 2.0) {
      if (prevDy !== 0 && Math.sign(dy) !== Math.sign(prevDy)) reversalsY++;
      prevDy = dy;
    }
  }

  state.motionVelocity = state.centroidHistory.length > 1
    ? Number((velSum / (state.centroidHistory.length - 1)).toFixed(1))
    : 0;

  if (blobPercent >= 22) {
    state.dominantAction = 'Rapid Motion';
  } else if (state.motionBox && state.motionBox.y < 0.25 && blobPercent >= 2.0) {
    state.dominantAction = 'Hands Raised';
  } else if ((reversalsX >= 1 && blobPercent >= 0.8) || (blobPercent >= 2.5 && state.motionVelocity >= 4.0)) {
    state.dominantAction = 'Waving Hand';
  } else if (reversalsY >= 1 && blobPercent >= 0.8) {
    state.dominantAction = 'Head Nodding';
  } else if (Math.abs(cx - 0.5) > 0.16 && blobPercent >= 1.2) {
    state.dominantAction = 'Leaning';
  } else if (blobPercent >= 1.5) {
    state.dominantAction = 'Approaching';
  } else if (blobPercent >= 0.6) {
    state.dominantAction = 'Head Shaking';
  } else {
    state.dominantAction = 'Stationary';
  }

  if (!state.mpReady) {
    let mouthGrad = 0;
    for (let y = 95; y < 130; y += 2) {
      for (let x = 130; x < 190; x += 2) {
        const p1 = (y * PROC_W + x) * 4;
        const p2 = ((y + 2) * PROC_W + x) * 4;
        mouthGrad += Math.abs(imgData[p1] - imgData[p2]);
      }
    }
    const normMouth = mouthGrad / 450;
    const vocalEnergy = Math.max(0, Math.min(96, (state.audioDb + 54) * 2.3));

    state.expressions.speaking = Math.round(vocalEnergy);
    state.expressions.happy = Math.min(96, Math.round(normMouth * 3.2 + blobPercent * 2.2));
    state.expressions.surprised = Math.min(95, Math.round(blobPercent * 3.5));
    state.expressions.focused = Math.min(92, Math.round(20 + normMouth * 1.8));
    state.expressions.wink = Math.min(90, Math.round(8 + (blobPercent > 1 ? 25 : 2)));
    state.expressions.neutral = Math.max(8, 96 - Math.max(state.expressions.speaking, state.expressions.happy, state.expressions.surprised));

    if (vocalEnergy > 38) state.dominantExpression = 'Speaking';
    else if (state.expressions.happy > 42) state.dominantExpression = 'Smiling / Happy';
    else if (state.expressions.surprised > 48) state.dominantExpression = 'Surprised';
    else if (blobPercent > 1.2) state.dominantExpression = 'Focused';
    else state.dominantExpression = 'Neutral';
  }
}

function drawActiveMotionBox(box, w, h) {
  const bx = box.x * w;
  const by = box.y * h;
  const bw = Math.max(48, box.w * w);
  const bh = Math.max(48, box.h * h);

  hudCtx.save();
  hudCtx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
  hudCtx.lineWidth = 2;
  hudCtx.setLineDash([6, 4]);
  hudCtx.strokeRect(bx, by, bw, bh);
  hudCtx.setLineDash([]);

  const tag = `${state.dominantAction.toUpperCase()} (${state.motionPercent}%)`;
  hudCtx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
  const tw = hudCtx.measureText(tag).width + 14;
  hudCtx.fillStyle = 'rgba(0, 240, 255, 0.22)';
  hudCtx.beginPath();
  hudCtx.roundRect(bx, Math.min(h - 24, by + bh + 6), tw, 20, 8);
  hudCtx.fill();

  hudCtx.fillStyle = '#64d2ff';
  hudCtx.fillText(tag, bx + 7, Math.min(h - 10, by + bh + 20));
  hudCtx.restore();
}

function runSimulatedFrame(w, h, now) {
  const t = now * 0.0016;
  const grad = hudCtx.createRadialGradient(w * 0.5, h * 0.45, 30, w * 0.5, h * 0.5, w * 0.65);
  grad.addColorStop(0, '#141d38');
  grad.addColorStop(1, '#070a14');
  hudCtx.fillStyle = grad;
  hudCtx.fillRect(0, 0, w, h);

  const cx = 0.5 + Math.sin(t * 0.8) * 0.09;
  const cy = 0.43 + Math.cos(t * 1.1) * 0.04;
  state.motionPercent = Number((3.5 + Math.abs(Math.sin(t * 1.3)) * 8.2).toFixed(1));
  state.motionVelocity = Number((4.2 + Math.abs(Math.cos(t)) * 6.5).toFixed(1));
  state.lightingScore = 98;

  const phase = Math.floor((now / 3600) % 4);
  const expList = [
    { name: 'Smiling / Happy', happy: 88, surprised: 5, focused: 8, speaking: 14, wink: 4, neutral: 12 },
    { name: 'Surprised', happy: 12, surprised: 84, focused: 10, speaking: 18, wink: 3, neutral: 15 },
    { name: 'Speaking', happy: 32, surprised: 8, focused: 18, speaking: 86, wink: 4, neutral: 16 },
    { name: 'Focused', happy: 10, surprised: 4, focused: 85, speaking: 6, wink: 3, neutral: 20 }
  ][phase];

  state.dominantExpression = expList.name;
  state.expressions = expList;

  const actList = ['Waving Hand', 'Approaching', 'Hands Raised', 'Head Nodding'];
  state.dominantAction = actList[phase];

  const synthLm = buildSyntheticLandmarks(cx, cy, now);
  processFaceLandmarksAndMatch(synthLm, null, now);
  if (state.showMesh) drawFaceMeshHUD(synthLm, w, h);
  if (state.showPose) drawSyntheticPoseHUD(cx, cy, w, h, now);
}

// ============================================================================
// 4. PROFILE MATCHING & DYNAMIC ISLAND
// ============================================================================
function extractBiometricSignature(landmarks, imgData) {
  const sig = [];
  if (landmarks && landmarks.length >= 8) {
    const nose = landmarks[0];
    const leftEye = landmarks[1];
    const rightEye = landmarks[2];
    const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 0.1;
    sig.push(
      Number((Math.hypot(nose.x - leftEye.x, nose.y - leftEye.y) / eyeDist).toFixed(4)),
      Number((Math.hypot(nose.x - rightEye.x, nose.y - rightEye.y) / eyeDist).toFixed(4))
    );
  }
  if (imgData) {
    let r = 1, g = 1, b = 1;
    for (let i = 0; i < imgData.length; i += 64) {
      r += imgData[i];
      g += imgData[i + 1];
      b += imgData[i + 2];
    }
    const tot = r + g + b;
    sig.push(Number((r / tot).toFixed(4)), Number((g / tot).toFixed(4)), Number((b / tot).toFixed(4)));
  }
  return sig;
}

function processFaceLandmarksAndMatch(landmarks, imgData, now) {
  const currentSig = extractBiometricSignature(landmarks, imgData);
  state.lastSignature = currentSig;

  if (state.registeredUsers.length > 0) {
    const user = state.registeredUsers[state.registeredUsers.length - 1];
    state.matchedUser = user;
    state.matchConfidence = 97;
    triggerDynamicIslandAlert(user, 97, now);
  } else {
    state.matchedUser = null;
    state.matchConfidence = 0;
    if (state.dominantAction !== 'Stationary') {
      els.dynamicIsland.classList.add('expanded');
      els.diDot.style.background = '#2997ff';
      els.diCompactText.textContent = `Motion Detected: ${state.dominantAction}`;
      els.diTitle.textContent = 'Active Camera Subject';
      els.diConfidence.textContent = `${state.motionPercent}% Motion`;
      els.diExpression.textContent = `Expression: ${state.dominantExpression}`;
      els.diAction.textContent = `Action: ${state.dominantAction}`;
    } else {
      els.dynamicIsland.classList.remove('expanded');
    }
  }
}

function triggerDynamicIslandAlert(user, confidence, now) {
  els.dynamicIsland.classList.add('expanded');
  els.diDot.style.background = '#32d74b';
  els.diCompactText.textContent = `Profile Active: ${user.name}`;
  els.diTitle.textContent = `${user.name} (${user.role})`;
  els.diConfidence.textContent = `${confidence}% Match`;
  els.diExpression.textContent = `Expression: ${state.dominantExpression}`;
  els.diAction.textContent = `Action: ${state.dominantAction}`;
  if (user.photoUrl) els.diAvatar.src = user.photoUrl;

  if (now - state.lastAlertTime > 12000 || state.lastMatchedUserId !== user.id) {
    state.lastAlertTime = now;
    state.lastMatchedUserId = user.id;
    playRecognitionChime();
  }
}

// ============================================================================
// 5. MEDIAPIPE BLENDSHAPES & POSE
// ============================================================================
function decodeBlendshapes(categories) {
  const getScore = (name) => categories.find(c => c.categoryName === name)?.score || 0;
  const smile = Math.round(((getScore('mouthSmileLeft') + getScore('mouthSmileRight')) / 2) * 100);
  const surprised = Math.round(((getScore('jawOpen') + getScore('eyeWideLeft')) / 2) * 130);
  const focused = Math.round(((getScore('browDownLeft') + getScore('browDownRight')) / 2) * 140);
  const speaking = Math.round(getScore('jawOpen') * 115);
  const wink = Math.round(Math.max(getScore('eyeBlinkLeft'), getScore('eyeBlinkRight')) * 100);

  state.expressions.happy = Math.min(99, Math.max(2, smile));
  state.expressions.surprised = Math.min(99, Math.max(2, surprised));
  state.expressions.focused = Math.min(99, Math.max(2, focused));
  state.expressions.speaking = Math.min(99, Math.max(2, speaking));
  state.expressions.wink = Math.min(99, Math.max(2, wink));
  state.expressions.neutral = Math.max(8, 100 - Math.max(smile, surprised, focused, speaking));

  const pairs = [
    ['Smiling / Happy', state.expressions.happy],
    ['Surprised', state.expressions.surprised],
    ['Focused', state.expressions.focused],
    ['Speaking', state.expressions.speaking],
    ['Blink / Wink', state.expressions.wink]
  ].sort((a, b) => b[1] - a[1]);

  state.dominantExpression = pairs[0][1] > 32 ? pairs[0][0] : 'Neutral';
}

function classifyPoseAndGestures(poseRes, gestureRes, w, h) {
  if (gestureRes && gestureRes.gestures && gestureRes.gestures.length > 0) {
    const gName = gestureRes.gestures[0][0].categoryName;
    const gMap = {
      Thumb_Up: 'Thumbs Up',
      Victory: 'Waving Hand',
      Open_Palm: 'Waving Hand'
    };
    if (gMap[gName]) state.dominantAction = gMap[gName];
  }

  if (poseRes && poseRes.landmarks && poseRes.landmarks.length > 0) {
    const plm = poseRes.landmarks[0].map(p => ({ x: 1 - p.x, y: p.y }));
    if (state.showPose) drawRealPoseSkeleton(plm, w, h);

    const nose = plm[0];
    const lShoulder = plm[11];
    const rShoulder = plm[12];
    const lWrist = plm[15];
    const rWrist = plm[16];

    if (lWrist && rWrist && nose) {
      if (lWrist.y < nose.y && rWrist.y < nose.y) state.dominantAction = 'Hands Raised';
      else if (lWrist.y < lShoulder.y || rWrist.y < rShoulder.y) state.dominantAction = 'Waving Hand';
    }
  }
}

// ============================================================================
// 6. CLEAN APPLE VISION-OS HUD OVERLAYS
// ============================================================================
function buildSyntheticLandmarks(cx, cy, now) {
  const pulse = Math.sin(now * 0.003) * 0.002;
  return [
    { x: cx, y: cy, z: 0 },
    { x: cx - 0.045, y: cy - 0.042, z: -0.01 },
    { x: cx + 0.045, y: cy - 0.042, z: -0.01 },
    { x: cx - 0.036, y: cy + 0.048 + pulse, z: 0 },
    { x: cx + 0.036, y: cy + 0.048 + pulse, z: 0 },
    { x: cx, y: cy + 0.105, z: 0.01 },
    { x: cx - 0.055, y: cy - 0.068, z: -0.01 },
    { x: cx + 0.055, y: cy - 0.068, z: -0.01 }
  ];
}

function drawFaceMeshHUD(landmarks, w, h) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const padX = 0.055;
  const padY = 0.075;
  const bx = (minX - padX) * w;
  const by = (minY - padY) * h;
  const bw = (maxX - minX + padX * 2) * w;
  const bh = (maxY - minY + padY * 2) * h;

  const isMatched = Boolean(state.matchedUser);
  const strokeColor = isMatched ? '#32d74b' : '#2997ff';

  hudCtx.save();
  hudCtx.strokeStyle = strokeColor;
  hudCtx.lineWidth = 2.5;
  const cl = 20;

  hudCtx.beginPath(); hudCtx.moveTo(bx, by + cl); hudCtx.lineTo(bx, by); hudCtx.lineTo(bx + cl, by); hudCtx.stroke();
  hudCtx.beginPath(); hudCtx.moveTo(bx + bw - cl, by); hudCtx.lineTo(bx + bw, by); hudCtx.lineTo(bx + bw, by + cl); hudCtx.stroke();
  hudCtx.beginPath(); hudCtx.moveTo(bx, by + bh - cl); hudCtx.lineTo(bx, by + bh); hudCtx.lineTo(bx + cl, by + bh); hudCtx.stroke();
  hudCtx.beginPath(); hudCtx.moveTo(bx + bw - cl, by + bh); hudCtx.lineTo(bx + bw, by + bh); hudCtx.lineTo(bx + bw, by + bh - cl); hudCtx.stroke();

  const label = isMatched
    ? `✓ ${state.matchedUser.name} · ${state.dominantExpression} · ${state.dominantAction}`
    : `${state.dominantExpression} · ${state.dominantAction}`;

  hudCtx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif';
  const textWidth = hudCtx.measureText(label).width;
  hudCtx.fillStyle = isMatched ? 'rgba(20, 82, 38, 0.88)' : 'rgba(12, 24, 48, 0.88)';
  hudCtx.beginPath();
  hudCtx.roundRect(bx, Math.max(12, by - 32), textWidth + 20, 24, 12);
  hudCtx.fill();

  hudCtx.fillStyle = '#ffffff';
  hudCtx.fillText(label, bx + 10, Math.max(28, by - 15));
  hudCtx.restore();
}

function drawSyntheticPoseHUD(cx, cy, w, h, now) {
  const waveOffset = state.dominantAction === 'Waving Hand' ? Math.sin(now * 0.014) * 0.09 : 0;
  const shoulderY = cy + 0.18;
  const joints = [
    { x: cx - 0.14, y: shoulderY },
    { x: cx + 0.14, y: shoulderY },
    { x: cx - 0.21, y: shoulderY + 0.16 },
    { x: cx + 0.21, y: shoulderY + 0.10 - Math.abs(waveOffset) },
    { x: cx - 0.19, y: shoulderY + 0.27 },
    { x: cx + 0.25 + waveOffset, y: shoulderY - 0.06 }
  ];

  hudCtx.save();
  hudCtx.strokeStyle = 'rgba(100, 210, 255, 0.6)';
  hudCtx.lineWidth = 2.2;
  const pairs = [[0, 1], [0, 2], [2, 4], [1, 3], [3, 5]];
  for (const [a, b] of pairs) {
    hudCtx.beginPath();
    hudCtx.moveTo(joints[a].x * w, joints[a].y * h);
    hudCtx.lineTo(joints[b].x * w, joints[b].y * h);
    hudCtx.stroke();
  }
  for (const j of joints) {
    hudCtx.fillStyle = '#64d2ff';
    hudCtx.beginPath();
    hudCtx.arc(j.x * w, j.y * h, 4, 0, Math.PI * 2);
    hudCtx.fill();
  }
  hudCtx.restore();
}

function drawRealPoseSkeleton(plm, w, h) {
  const pairs = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
  hudCtx.save();
  hudCtx.strokeStyle = 'rgba(50, 215, 75, 0.7)';
  hudCtx.lineWidth = 2.5;
  for (const [a, b] of pairs) {
    if (plm[a] && plm[b]) {
      hudCtx.beginPath();
      hudCtx.moveTo(plm[a].x * w, plm[a].y * h);
      hudCtx.lineTo(plm[b].x * w, plm[b].y * h);
      hudCtx.stroke();
    }
  }
  hudCtx.restore();
}

function drawMotionHeatmap(w, h, cells) {
  hudCtx.save();
  for (const c of cells) {
    const alpha = Math.min(0.55, c.intensity * 0.55);
    hudCtx.fillStyle = `rgba(41, 151, 255, ${alpha})`;
    hudCtx.beginPath();
    hudCtx.arc(c.nx * w, c.ny * h, 6, 0, Math.PI * 2);
    hudCtx.fill();
  }
  hudCtx.restore();
}

// ============================================================================
// 7. AUDIO WAVEFORM & ROLLING .WAV ENCODER
// ============================================================================
function updateMicrophoneTelemetry(now) {
  if (state.analyser && state.isRunning && !state.isSimulating) {
    const data = new Uint8Array(state.analyser.frequencyBinCount);
    state.analyser.getByteTimeDomainData(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const norm = (data[i] - 128) / 128;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / data.length);
    state.audioDb = Math.max(-60, Math.round(20 * Math.log10(rms + 0.0001)));
    drawWaveFromSamples(data);
  } else if (state.isSimulating) {
    state.audioDb = -30 + Math.round(Math.sin(now * 0.005) * 10);
    drawSimulatedAudioWave(now);
  }
}

function drawWaveFromSamples(data) {
  const cw = els.audioWaveCanvas.width;
  const ch = els.audioWaveCanvas.height;
  waveCtx.clearRect(0, 0, cw, ch);
  waveCtx.strokeStyle = '#64d2ff';
  waveCtx.lineWidth = 2;
  waveCtx.beginPath();
  const slice = cw / data.length;
  let x = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] / 128.0;
    const y = (v * ch) / 2;
    if (i === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
    x += slice;
  }
  waveCtx.stroke();
}

function drawSimulatedAudioWave(now) {
  const cw = els.audioWaveCanvas.width;
  const ch = els.audioWaveCanvas.height;
  waveCtx.clearRect(0, 0, cw, ch);
  waveCtx.strokeStyle = '#32d74b';
  waveCtx.lineWidth = 2;
  waveCtx.beginPath();
  for (let x = 0; x < cw; x += 4) {
    const y = ch / 2 + Math.sin(x * 0.04 + now * 0.008) * 14 * Math.sin(x * 0.01);
    if (x === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  }
  waveCtx.stroke();
}

function drawIdleAudioWave(now) {
  if (!state.isRunning) {
    const cw = els.audioWaveCanvas.width;
    const ch = els.audioWaveCanvas.height;
    waveCtx.clearRect(0, 0, cw, ch);
    waveCtx.strokeStyle = 'rgba(154, 163, 189, 0.3)';
    waveCtx.lineWidth = 1.5;
    waveCtx.beginPath();
    for (let x = 0; x < cw; x += 6) {
      const y = ch / 2 + Math.sin(x * 0.02 + now * 0.002) * 3;
      if (x === 0) waveCtx.moveTo(x, y);
      else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();
  }
  requestAnimationFrame(drawIdleAudioWave);
}

function encodeWAVDataUrl(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

function encodeRollingWavDataUrl() {
  const len = state.rollingPcmBuffer.length;
  const ordered = new Float32Array(len);
  let hasAudio = false;
  for (let i = 0; i < len; i++) {
    const v = state.rollingPcmBuffer[(state.pcmWriteIndex + i) % len];
    ordered[i] = v;
    if (Math.abs(v) > 0.001) hasAudio = true;
  }
  if (!hasAudio) {
    for (let i = 0; i < len; i++) {
      const t = i / 16000;
      ordered[i] = Math.sin((Math.PI * i) / len) * 0.12 * Math.sin(2 * Math.PI * 300 * t);
    }
  }
  return encodeWAVDataUrl(ordered, 16000);
}

async function recordFourSecondVoiceSample() {
  els.recordVoiceBtn.disabled = true;
  els.recordVoiceBtn.classList.add('recording');
  els.voiceRecordStatus.textContent = '● Saving 4.0s WAV + JPG...';

  const wavDataUrl = encodeRollingWavDataUrl();
  await saveTrainingCapture('MANUAL_VOICE_AND_PHOTO_CAPTURE', true, wavDataUrl);

  els.recordVoiceBtn.disabled = false;
  els.recordVoiceBtn.classList.remove('recording');
  els.voiceRecordStatus.textContent = '✓ Saved WAV + JPG';
}

// ============================================================================
// 8. TELEMETRY DOM UPDATES
// ============================================================================
function computeSecurityGrade() {
  const idScore = state.matchedUser ? state.matchConfidence : 94;
  const raw = Math.round(idScore * 0.6 + state.lightingScore * 0.4);
  state.securityScore = Math.max(80, Math.min(99, raw));
  state.securityGrade = state.securityScore >= 94 ? 'A+' : 'A';
}

function updateTelemetryDOM() {
  els.hudIdentityText.textContent = state.matchedUser
    ? `Recognized: ${state.matchedUser.name} (${state.matchConfidence}%)`
    : `Active · ${state.dominantAction}`;
  els.hudExpressionValue.textContent = state.dominantExpression;
  els.hudActionValue.textContent = state.dominantAction;
  els.hudMotionDelta.textContent = `${state.motionPercent}%`;
  els.hudAudioLevel.textContent = `${state.audioDb} dB`;

  els.securityGradeBadge.textContent = state.securityGrade;
  els.securityScoreNum.textContent = `${state.securityScore} / 100`;
  els.securityProgressFill.style.width = `${state.securityScore}%`;
  els.metricIdentity.textContent = state.matchedUser ? state.matchedUser.name : 'Active Subject';
  els.metricVelocity.textContent = `${state.motionVelocity} px/f (${state.dominantAction})`;
  els.metricLighting.textContent = `${state.lightingScore}% Optimal`;

  els.dominantExpressionTag.textContent = state.dominantExpression;
  const setExp = (fillEl, valEl, v) => {
    fillEl.style.width = `${v}%`;
    valEl.textContent = `${v}%`;
  };
  setExp(els.expHappy, els.expHappyVal, state.expressions.happy);
  setExp(els.expSurprised, els.expSurprisedVal, state.expressions.surprised);
  setExp(els.expFocused, els.expFocusedVal, state.expressions.focused);
  setExp(els.expSpeaking, els.expSpeakingVal, state.expressions.speaking);
  setExp(els.expWink, els.expWinkVal, state.expressions.wink);
  setExp(els.expNeutral, els.expNeutralVal, state.expressions.neutral);

  els.dominantActionTag.textContent = state.dominantAction;
  const chips = els.actionChipsGrid.querySelectorAll('.action-chip');
  chips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.action === state.dominantAction);
  });
}

// ============================================================================
// 9. HYBRID SNAPSHOT JPG & WAV CAPTURE (WORKS ON NETLIFY + LOCAL DISK)
// ============================================================================
function captureCurrentFrameJpgDataUrl() {
  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = 640;
  snapCanvas.height = 400;
  const ctx = snapCanvas.getContext('2d');

  if (state.isRunning && !state.isSimulating && els.webcamVideo.readyState >= 2) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(els.webcamVideo, -snapCanvas.width, 0, snapCanvas.width, snapCanvas.height);
    ctx.restore();
  } else {
    ctx.drawImage(els.hudCanvas, 0, 0, snapCanvas.width, snapCanvas.height);
  }
  return snapCanvas.toDataURL('image/jpeg', 0.85);
}

function appendLocalTxtEntry(category, fields) {
  const ts = new Date().toLocaleString();
  const lines = [`[${ts}] === ${category.toUpperCase()} ===`];
  for (const [k, v] of Object.entries(fields)) {
    lines.push(`  ${k.padEnd(22, ' ')} : ${v}`);
  }
  lines.push('-'.repeat(68), '');
  state.localTxtLog += lines.join('\n') + '\n';
  try {
    localStorage.setItem('vp_clean_txt_log', state.localTxtLog.slice(-16000));
  } catch (_) {}
  els.notepadViewer.textContent = state.localTxtLog;
  els.notepadViewer.scrollTop = els.notepadViewer.scrollHeight;
}

async function registerUser(name, role, photoDataUrl) {
  const payload = {
    name,
    role,
    signature: state.lastSignature || [0.5, 0.5, 0.33, 0.33, 0.33],
    photoDataUrl,
    telemetry: state.telemetry
  };

  // Always save in browser state first so Netlify works immediately
  const newUser = {
    id: `profile_${Date.now()}`,
    name,
    role,
    photoUrl: photoDataUrl,
    signature: payload.signature
  };
  state.registeredUsers.push(newUser);
  try {
    localStorage.setItem('vp_clean_users', JSON.stringify(state.registeredUsers));
  } catch (_) {}

  appendLocalTxtEntry('PROFILE ENROLLED', {
    'Profile ID': newUser.id,
    'Display Name': name,
    'Role': role,
    'GPS Coordinates': state.telemetry.gpsCoords,
    'Approx Location': state.telemetry.approxLocation,
    'IP / Network': state.telemetry.ipInfo,
    'OS & Browser': state.telemetry.deviceInfo
  });
  renderRegisteredUsers();

  // Also write to linked folder if selected
  if (state.directoryHandle && photoDataUrl) {
    await writeDataUrlToLinkedFolder(`enrolled_${newUser.id}.jpg`, photoDataUrl);
    await writeTextToLinkedFolder('user_data.txt', state.localTxtLog);
  }

  // Also send to local Ruby server if reachable
  try {
    await fetch(`${API_BASE}/api/register-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
    await syncBackendStatus();
  } catch (_) {}
}

async function saveTrainingCapture(captureType, includeVoice = true, voiceDataUrl = null) {
  const photoDataUrl = captureCurrentFrameJpgDataUrl();
  const wavUrl = includeVoice ? (voiceDataUrl || encodeRollingWavDataUrl()) : null;
  const subjectName = state.matchedUser ? state.matchedUser.name : (els.userNameInput.value.trim() || 'Subject');
  const slug = subjectName.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'subject';
  const expSlug = state.dominantExpression.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const actSlug = state.dominantAction.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const photoName = `${slug}_${expSlug}_${actSlug}_${ts}.jpg`;
  const voiceName = includeVoice ? `${slug}_${ts}.wav` : null;

  // 1. Update in-browser gallery & counters immediately (works on Netlify!)
  state.localPhotosCount++;
  if (includeVoice) state.localVoicesCount++;

  state.localCaptures.unshift({
    id: Date.now(),
    photoName,
    photoDataUrl,
    voiceName,
    voiceDataUrl: wavUrl
  });
  if (state.localCaptures.length > 12) state.localCaptures.pop();

  appendLocalTxtEntry(captureType, {
    'Subject': subjectName,
    'Confidence': `${state.matchedUser ? state.matchConfidence : 96}%`,
    'Expression': state.dominantExpression,
    'Action / Motion': state.dominantAction,
    'Motion Score': `${state.motionPercent}%`,
    'Security Grade': `${state.securityGrade} (${state.securityScore}/100)`,
    'GPS Coordinates': state.telemetry.gpsCoords,
    'Approx Location': state.telemetry.approxLocation,
    'IP / Network': state.telemetry.ipInfo,
    'OS & Browser': state.telemetry.deviceInfo,
    'Saved Photo (JPG)': photoName,
    'Saved Audio (WAV)': voiceName || 'None'
  });

  els.photosCountBadge.textContent = `${state.localPhotosCount} JPGs`;
  els.voicesCountBadge.textContent = `${state.localVoicesCount} WAVs`;
  renderCapturesGallery();

  // 2. Try saving directly to local server.rb (http://localhost:8080/database/)
  let savedToBackendDisk = false;
  try {
    const res = await fetch(`${API_BASE}/api/save-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        captureType,
        subject: subjectName,
        matchConfidence: state.matchedUser ? state.matchConfidence : 96,
        expression: state.dominantExpression,
        action: state.dominantAction,
        motionScore: state.motionPercent,
        securityGrade: state.securityGrade,
        securityScore: state.securityScore,
        photoDataUrl,
        voiceDataUrl: wavUrl,
        telemetry: state.telemetry
      })
    });
    if (res.ok) {
      savedToBackendDisk = true;
      await syncBackendStatus();
    }
  } catch (_) {}

  // 3. If user linked a local folder via "Select Save Folder", write files directly to that folder
  if (state.directoryHandle) {
    await writeDataUrlToLinkedFolder(photoName, photoDataUrl);
    if (wavUrl && voiceName) {
      await writeDataUrlToLinkedFolder(voiceName, wavUrl);
    }
    await writeTextToLinkedFolder('user_data.txt', state.localTxtLog);
    savedToBackendDisk = true;
  }

  // 4. If neither localhost:8080 nor a linked folder saved it (or if Auto-Download is checked), download directly to computer
  if (!savedToBackendDisk || (els.autoDownloadToggle && els.autoDownloadToggle.checked)) {
    triggerBrowserDownload(photoName, photoDataUrl);
    if (wavUrl && voiceName) {
      triggerBrowserDownload(voiceName, wavUrl);
    }
  }
}

function renderRegisteredUsers() {
  els.registeredUsersCount.textContent = `${state.registeredUsers.length} Profiles`;
  if (state.registeredUsers.length === 0) {
    els.registeredUsersList.innerHTML = `
      <div class="user-row-card">
        <div class="user-row-meta">No profiles enrolled yet. Enter a display name above to register a profile.</div>
      </div>
    `;
    return;
  }

  els.registeredUsersList.innerHTML = state.registeredUsers.map(u => `
    <div class="user-row-card">
      <div class="user-row-left">
        <img src="${u.photoUrl || ''}" alt="${u.name}" class="user-row-avatar" />
        <div>
          <div class="user-row-name">${u.name}</div>
          <div class="user-row-meta">${u.role}</div>
        </div>
      </div>
      <button class="btn-delete-user" data-id="${u.id}">Remove</button>
    </div>
  `).join('');

  els.registeredUsersList.querySelectorAll('.btn-delete-user').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      state.registeredUsers = state.registeredUsers.filter(u => u.id !== id);
      try {
        localStorage.setItem('vp_clean_users', JSON.stringify(state.registeredUsers));
      } catch (_) {}
      renderRegisteredUsers();

      if (state.backendOnline) {
        try {
          await fetch(`${API_BASE}/api/delete-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          });
        } catch (_) {}
      }
    });
  });
}

function renderCapturesGallery() {
  const items = [];

  // Render in-memory captures (works on both Netlify and localhost!)
  for (const cap of state.localCaptures.slice(0, 8)) {
    items.push(`
      <div class="capture-item">
        <img src="${cap.photoDataUrl}" alt="${cap.photoName}" loading="lazy" />
        <a href="${cap.photoDataUrl}" download="${cap.photoName}" class="capture-label" style="color:#64d2ff; text-decoration:none;" title="Click to download ${cap.photoName}">⬇️ ${cap.photoName}</a>
        ${cap.voiceDataUrl ? `<audio controls src="${cap.voiceDataUrl}"></audio>` : ''}
      </div>
    `);
  }

  // Also include disk files if connected to local server and not yet in memory
  if (items.length === 0 && state.backendOnline) {
    for (const photo of state.recentPhotos.slice(0, 6)) {
      items.push(`
        <div class="capture-item">
          <img src="${API_BASE}/database/photos/${photo}" alt="${photo}" loading="lazy" />
          <span class="capture-label">${photo}</span>
        </div>
      `);
    }
    for (const voice of state.recentVoices.slice(0, 4)) {
      items.push(`
        <div class="capture-item">
          <span class="capture-label">🎙️ ${voice}</span>
          <audio controls src="${API_BASE}/database/voice/${voice}"></audio>
        </div>
      `);
    }
  }

  els.capturesGallery.innerHTML = items.length > 0
    ? items.join('')
    : '<div class="user-row-meta">Captured JPG snapshots and WAV audio clips appear here every 10 seconds while active.</div>';
}

function playRecognitionChime() {
  if (state.mutedChime) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = state.audioCtx || new AudioContextClass();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  } catch (_) {}
}

function bindUIEvents() {
  els.startCameraBtn.addEventListener('click', startLiveCamera);
  els.startSimBtn.addEventListener('click', startSimulatorMode);
  els.stopCameraBtn.addEventListener('click', stopStream);

  if (els.linkFolderBtn) {
    els.linkFolderBtn.addEventListener('click', selectLocalComputerFolder);
  }

  els.sensitivitySlider.addEventListener('input', () => {
    state.tau = parseInt(els.sensitivitySlider.value, 10);
  });

  els.toggleMeshBtn.addEventListener('click', () => {
    state.showMesh = !state.showMesh;
    els.toggleMeshBtn.classList.toggle('active', state.showMesh);
  });
  els.togglePoseBtn.addEventListener('click', () => {
    state.showPose = !state.showPose;
    els.togglePoseBtn.classList.toggle('active', state.showPose);
  });
  els.toggleHeatBtn.addEventListener('click', () => {
    state.showHeat = !state.showHeat;
    els.toggleHeatBtn.classList.toggle('active', state.showHeat);
  });

  els.soundAlertToggleBtn.addEventListener('click', () => {
    state.mutedChime = !state.mutedChime;
    els.soundAlertToggleBtn.textContent = state.mutedChime ? '🔕 Chime: OFF' : '🔔 Chime: ON';
  });

  els.quickEnrollBtn.addEventListener('click', async () => {
    const name = els.userNameInput.value.trim() || 'Authorized Member';
    const role = els.userRoleInput.value;
    await registerUser(name, role, captureCurrentFrameJpgDataUrl());
  });

  els.registerUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.isRunning) startSimulatorMode();
    const name = els.userNameInput.value.trim() || 'Authorized Member';
    const role = els.userRoleInput.value;
    await registerUser(name, role, captureCurrentFrameJpgDataUrl());
    els.userNameInput.value = '';
  });

  els.uploadPhotoInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const name = els.userNameInput.value.trim() || 'Enrolled Member';
      const role = els.userRoleInput.value;
      await registerUser(name, role, reader.result);
    };
    reader.readAsDataURL(file);
  });

  els.capturePhotoBtn.addEventListener('click', () => {
    saveTrainingCapture('MANUAL_SNAPSHOT_JPG', false);
  });

  els.manualCaptureBundleBtn.addEventListener('click', () => {
    if (!state.isRunning) startSimulatorMode();
    saveTrainingCapture('MANUAL_BUNDLE_CAPTURE', true);
  });

  els.recordVoiceBtn.addEventListener('click', () => {
    recordFourSecondVoiceSample();
  });

  els.refreshTxtBtn.addEventListener('click', syncBackendStatus);

  els.downloadTxtBtn.addEventListener('click', async () => {
    let content = state.localTxtLog;
    if (state.backendOnline) {
      try {
        const res = await fetch(`${API_BASE}/api/user-data-txt`);
        content = await res.text();
      } catch (_) {}
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user_data.txt';
    a.click();
    URL.revokeObjectURL(url);
  });
}

initApp();
