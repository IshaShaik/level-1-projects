// storage.js
// Thin wrapper around the backend REST API. Nothing here touches the camera
// or TensorFlow — it only persists project/pose/sample data as JSON.

const API_BASE = '/api/projects';

async function handle(res) {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && body.error) msg = body.error;
    } catch (_) { /* ignore parse errors */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function listProjects() {
  const res = await fetch(API_BASE);
  return handle(res);
}

export async function createProject(name) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return handle(res);
}

export async function getProject(id) {
  const res = await fetch(`${API_BASE}/${id}`);
  return handle(res);
}

export async function updateProject(id, patch) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  return handle(res);
}

export async function deleteProject(id) {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  return handle(res);
}

export async function addPose(projectId, name) {
  const res = await fetch(`${API_BASE}/${projectId}/poses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return handle(res);
}

export async function renamePose(projectId, poseId, name) {
  const res = await fetch(`${API_BASE}/${projectId}/poses/${poseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return handle(res);
}

export async function deletePose(projectId, poseId) {
  const res = await fetch(`${API_BASE}/${projectId}/poses/${poseId}`, { method: 'DELETE' });
  return handle(res);
}

export async function addSample(projectId, poseId, landmarks, thumbnail) {
  const res = await fetch(`${API_BASE}/${projectId}/samples`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ poseId, landmarks, thumbnail })
  });
  return handle(res);
}

export async function deleteSample(projectId, sampleId) {
  const res = await fetch(`${API_BASE}/${projectId}/samples/${sampleId}`, { method: 'DELETE' });
  return handle(res);
}

export async function saveProject(projectId) {
  const res = await fetch(`${API_BASE}/${projectId}/save`, { method: 'POST' });
  return handle(res);
}

// ---------- local convenience (which project is currently open) ----------

const CURRENT_KEY = 'ypt_current_project';

export function setCurrentProjectId(id) {
  localStorage.setItem(CURRENT_KEY, id);
}

export function getCurrentProjectId() {
  return localStorage.getItem(CURRENT_KEY);
}
