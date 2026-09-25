// camera.js
// Handles getUserMedia access, camera device enumeration/switching, and
// keeping a canvas overlay sized to match the video element. All frames
// stay in the browser — nothing here ever uploads video anywhere.

let currentStream = null;

export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

/**
 * Requests webcam access and attaches the stream to the given <video>.
 * Resolves once the video has usable dimensions.
 */
export async function startCamera(videoEl, deviceId) {
  stopCamera();

  const constraints = {
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 960 } }
      : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  currentStream = stream;
  videoEl.srcObject = stream;

  await new Promise((resolve) => {
    if (videoEl.readyState >= 2) return resolve();
    videoEl.onloadedmetadata = () => resolve();
  });
  await videoEl.play();
  return stream;
}

export function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
}

export function isCameraActive() {
  return !!currentStream;
}

/**
 * Keeps a canvas's pixel size in sync with the rendered video element so
 * landmark coordinates (normalized 0..1) map onto the correct pixel grid.
 */
export function syncCanvasSize(videoEl, canvasEl) {
  const w = videoEl.videoWidth || videoEl.clientWidth;
  const h = videoEl.videoHeight || videoEl.clientHeight;
  if (canvasEl.width !== w || canvasEl.height !== h) {
    canvasEl.width = w;
    canvasEl.height = h;
  }
}

/**
 * Captures the current video frame as a small base64 JPEG thumbnail, used
 * only for the on-screen sample gallery (never sent anywhere but this app's
 * own project storage).
 */
export function captureThumbnail(videoEl, maxSize = 160) {
  const scale = Math.min(maxSize / videoEl.videoWidth, maxSize / videoEl.videoHeight) || 1;
  const w = Math.max(1, Math.round(videoEl.videoWidth * scale));
  const h = Math.max(1, Math.round(videoEl.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Mirror the thumbnail so it matches what the user sees on screen.
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.72);
}
