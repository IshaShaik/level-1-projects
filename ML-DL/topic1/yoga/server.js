// server.js
// Yoga Pose Trainer — Express backend.
// Serves the static frontend and stores projects/samples as JSON on disk.
// No webcam video ever reaches this file: only landmark arrays + small thumbnails.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'projects.json');

app.use(cors());
app.use(express.json({ limit: '50mb' })); // thumbnails are base64-encoded, so allow generous payloads
app.use(express.static(path.join(__dirname, 'public')));

// ---------- storage helpers ----------

function readDB() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { projects: [] };
  }
}

function writeDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function findProject(db, id) {
  return db.projects.find((p) => p.id === id);
}

// ---------- API: projects ----------

// List all projects (summary only, no heavy sample data)
app.get('/api/projects', (req, res) => {
  const db = readDB();
  const summaries = db.projects.map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    poseCount: p.poses.length,
    sampleCount: p.poses.reduce((sum, cls) => sum + cls.samples.length, 0),
    modelStatus: p.model ? p.model.status : 'untrained'
  }));
  res.json({ projects: summaries });
});

// Create a new project
app.post('/api/projects', (req, res) => {
  const db = readDB();
  const name = (req.body && req.body.name) ? String(req.body.name).trim() : 'Untitled Project';
  const project = {
    id: newId('proj'),
    name: name || 'Untitled Project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    poses: [],
    featured: [],
    model: {
      status: 'untrained', // untrained | trained
      classNames: [],
      metadata: null,
      trainedAt: null,
      accuracy: null
    }
  };
  db.projects.push(project);
  writeDB(db);
  res.status(201).json({ project });
});

// Get full project (including samples)
app.get('/api/projects/:id', (req, res) => {
  const db = readDB();
  const project = findProject(db, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ project });
});

// Update project (rename, poses metadata, featured list, model info, etc.)
app.put('/api/projects/:id', (req, res) => {
  const db = readDB();
  const project = findProject(db, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const allowed = ['name', 'poses', 'featured', 'model'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      project[key] = req.body[key];
    }
  }
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ project });
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
  const db = readDB();
  const idx = db.projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  db.projects.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ---------- API: pose classes ----------

// Add a new pose class to a project
app.post('/api/projects/:id/poses', (req, res) => {
  const db = readDB();
  const project = findProject(db, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const name = (req.body && req.body.name) ? String(req.body.name).trim() : `POSE ${project.poses.length + 1}`;
  const pose = {
    id: newId('pose'),
    name: name || `POSE ${project.poses.length + 1}`,
    createdAt: new Date().toISOString(),
    samples: []
  };
  project.poses.push(pose);
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.status(201).json({ pose });
});

// Rename / update a pose class
app.put('/api/projects/:id/poses/:poseId', (req, res) => {
  const db = readDB();
  const project = findProject(db, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const pose = project.poses.find((p) => p.id === req.params.poseId);
  if (!pose) return res.status(404).json({ error: 'Pose not found' });

  if (req.body.name !== undefined) pose.name = String(req.body.name).trim() || pose.name;
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ pose });
});

// Delete a pose class
app.delete('/api/projects/:id/poses/:poseId', (req, res) => {
  const db = readDB();
  const project = findProject(db, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const idx = project.poses.findIndex((p) => p.id === req.params.poseId);
  if (idx === -1) return res.status(404).json({ error: 'Pose not found' });
  project.poses.splice(idx, 1);
  project.featured = project.featured.filter((fid) => fid !== req.params.poseId);
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true });
});

// ---------- API: samples ----------

// Add a sample (landmarks + optional thumbnail) to a pose class
app.post('/api/projects/:id/samples', (req, res) => {
  const db = readDB();
  const project = findProject(db, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { poseId, landmarks, thumbnail } = req.body;
  if (!poseId || !Array.isArray(landmarks)) {
    return res.status(400).json({ error: 'poseId and landmarks[] are required' });
  }
  const pose = project.poses.find((p) => p.id === poseId);
  if (!pose) return res.status(404).json({ error: 'Pose not found' });

  const sample = {
    id: newId('sample'),
    landmarks,
    thumbnail: thumbnail || null,
    timestamp: new Date().toISOString()
  };
  pose.samples.push(sample);
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.status(201).json({ sample, sampleCount: pose.samples.length });
});

// Delete a sample
app.delete('/api/projects/:id/samples/:sampleId', (req, res) => {
  const db = readDB();
  const project = findProject(db, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  let removed = false;
  for (const pose of project.poses) {
    const idx = pose.samples.findIndex((s) => s.id === req.params.sampleId);
    if (idx !== -1) {
      pose.samples.splice(idx, 1);
      removed = true;
      break;
    }
  }
  if (!removed) return res.status(404).json({ error: 'Sample not found' });
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true });
});

// Explicit save endpoint (kept for parity with the required API surface;
// PUT already persists, this simply confirms + timestamps a save)
app.post('/api/projects/:id/save', (req, res) => {
  const db = readDB();
  const project = findProject(db, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, savedAt: project.updatedAt });
});

// ---------- fallback ----------

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('  YOGA POSE TRAINER — AI Lab server running');
  console.log(`  → http://localhost:${PORT}`);
  console.log('');
});
