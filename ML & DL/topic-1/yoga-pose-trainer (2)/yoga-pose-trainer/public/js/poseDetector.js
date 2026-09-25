// poseDetector.js
// Wraps MediaPipe Tasks Vision (PoseLandmarker) so the rest of the app only
// deals with plain landmark arrays — never with MediaPipe's own types.

import {
  PoseLandmarker,
  FilesetResolver
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

// Standard 33-point BlazePose skeleton connections.
export const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10]
];

// Landmark indices used for normalization / quality checks.
const L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;
const CORE_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

let landmarker = null;
let lastVideoTime = -1;

/**
 * Loads the MediaPipe WASM runtime + pose landmark model.
 * Must resolve before startCamera()/detectPose() are used.
 */
export async function initializePoseDetector() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numPoses: 1
  });
  return landmarker;
}

export function isReady() {
  return !!landmarker;
}

/**
 * Runs detection on a single video frame.
 * Returns { landmarks: [{x,y,z,visibility}, ...33] } or { landmarks: null }.
 */
export function detectPose(videoEl) {
  if (!landmarker || !videoEl || videoEl.readyState < 2) return { landmarks: null };

  const now = performance.now();
  if (videoEl.currentTime === lastVideoTime) return { landmarks: null };
  lastVideoTime = videoEl.currentTime;

  const result = landmarker.detectForVideo(videoEl, now);
  if (!result || !result.landmarks || result.landmarks.length === 0) {
    return { landmarks: null };
  }
  return { landmarks: result.landmarks[0] };
}

/**
 * Draws landmark dots + skeleton connections onto a canvas overlay.
 * Canvas is expected to already be sized to match the video element.
 */
export function drawLandmarks(ctx, landmarks, width, height) {
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;

  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(77, 217, 255, 0.9)';
  ctx.shadowColor = 'rgba(77, 217, 255, 0.9)';
  ctx.shadowBlur = 10;

  POSE_CONNECTIONS.forEach(([a, b]) => {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) return;
    ctx.beginPath();
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
    ctx.stroke();
  });

  ctx.shadowBlur = 14;
  ctx.shadowColor = 'rgba(155, 123, 255, 0.95)';
  ctx.fillStyle = '#eef3ff';
  landmarks.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/**
 * Flattens raw MediaPipe landmarks into a plain [x,y,z,...] array (99 numbers
 * for 33 landmarks) so it can be stored as JSON / fed into TensorFlow.js.
 */
export function extractLandmarks(landmarks) {
  const out = [];
  landmarks.forEach((p) => {
    out.push(p.x, p.y, p.z);
  });
  return out;
}

/**
 * Re-centers landmarks on the hip midpoint and scales by torso length, so
 * the model is invariant to where the person stands and how close they are
 * to the camera. Input/output are flat [x,y,z, x,y,z, ...] arrays.
 */
export function normalizeLandmarks(flatLandmarks) {
  const n = flatLandmarks.length / 3;
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push({
      x: flatLandmarks[i * 3],
      y: flatLandmarks[i * 3 + 1],
      z: flatLandmarks[i * 3 + 2]
    });
  }

  const hipX = (pts[L_HIP].x + pts[R_HIP].x) / 2;
  const hipY = (pts[L_HIP].y + pts[R_HIP].y) / 2;
  const hipZ = (pts[L_HIP].z + pts[R_HIP].z) / 2;

  const shoulderX = (pts[L_SHOULDER].x + pts[R_SHOULDER].x) / 2;
  const shoulderY = (pts[L_SHOULDER].y + pts[R_SHOULDER].y) / 2;

  let torso = Math.hypot(shoulderX - hipX, shoulderY - hipY);
  if (!torso || torso < 1e-5) torso = 1;

  const out = [];
  pts.forEach((p) => {
    out.push((p.x - hipX) / torso, (p.y - hipY) / torso, (p.z - hipZ) / torso);
  });
  return out;
}

/**
 * Quality check used before allowing a capture: is a body detected, and are
 * the core landmarks (shoulders/hips/knees/etc.) visible enough?
 */
export function assessQuality(landmarks) {
  if (!landmarks) return { poseDetected: false, fullBody: false };
  const visibleEnough = CORE_INDICES.every((i) => {
    const p = landmarks[i];
    return p && (p.visibility === undefined || p.visibility > 0.4);
  });
  return { poseDetected: true, fullBody: visibleEnough };
}

export const FEATURE_LENGTH = 33 * 3; // 99
