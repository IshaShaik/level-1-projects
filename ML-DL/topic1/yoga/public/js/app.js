// app.js
// Entry point. Detects which page is loaded (via body[data-page]) and wires
// together storage.js, camera.js, poseDetector.js, trainer.js, predictor.js
// and ui.js. Keeping page bootstrapping in one file mirrors the required
// project file layout (no per-page JS files).

import * as storage from './storage.js';
import * as ui from './ui.js';
import * as camera from './camera.js';
import * as detector from './poseDetector.js';
import * as trainer from './trainer.js';
import * as predictor from './predictor.js';
import { POSE_LIBRARY, getPoseImage } from './poseLibrary.js';

const page = document.body.dataset.page;

if (page === 'index') initIndexPage();
if (page === 'train') initTrainPage();
if (page === 'test') initTestPage();
if (page === 'explore') initExplorePage();

// =====================================================================
// Shared helpers
// =====================================================================

function modelKeyFor(projectId) {
  return `ypt-model-${projectId}`;
}

function totalSamples(project) {
  return project.poses.reduce((sum, p) => sum + p.samples.length, 0);
}

/** Resolves which project this page (train/test/explore) should load. */
async function resolveProjectOrRedirect() {
  const params = new URLSearchParams(location.search);
  let id = params.get('project') || storage.getCurrentProjectId();
  if (!id) {
    location.href = 'index.html';
    return null;
  }
  storage.setCurrentProjectId(id);
  try {
    const { project } = await storage.getProject(id);
    return project;
  } catch (err) {
    ui.toast('That project could not be found.', 'error');
    setTimeout(() => { location.href = 'index.html'; }, 900);
    return null;
  }
}

function refreshHeaderCounts(project) {
  ui.setCounts(project.poses.length, totalSamples(project));
  if (project.model && project.model.status === 'trained') {
    ui.setModelStatus('ready');
  } else {
    ui.setModelStatus('untrained');
  }
}

// =====================================================================
// INDEX PAGE — create / open / delete projects
// =====================================================================

async function initIndexPage() {
  const listEl = document.getElementById('project-list');
  const emptyEl = document.getElementById('project-empty');
  const newBtn = document.getElementById('btn-new-project');

  async function refresh() {
    listEl.innerHTML = '';
    let projects = [];
    try {
      const res = await storage.listProjects();
      projects = res.projects;
    } catch (err) {
      ui.toast('Could not reach the server. Is it running?', 'error');
      return;
    }

    emptyEl.classList.toggle('hidden', projects.length > 0);

    projects.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'glass featured-card';
      row.style.justifyContent = 'space-between';
      row.innerHTML = `
        <div class="featured-meta">
          <h4>${ui.escapeHtml(p.name)}</h4>
          <p>${p.poseCount} pose${p.poseCount === 1 ? '' : 's'} · ${p.sampleCount} sample${p.sampleCount === 1 ? '' : 's'}</p>
          <span class="badge ${p.modelStatus === 'trained' ? 'ready' : 'pending'}">${p.modelStatus === 'trained' ? 'Model ready' : 'Not trained'}</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn" data-act="open">Open</button>
          <button class="icon-btn" data-act="delete" title="Delete project">✕</button>
        </div>
      `;
      row.querySelector('[data-act="open"]').onclick = () => {
        storage.setCurrentProjectId(p.id);
        location.href = `train.html?project=${p.id}`;
      };
      row.querySelector('[data-act="delete"]').onclick = async () => {
        const ok = await ui.confirmModal({
          title: 'Delete this project?',
          message: `"${p.name}" and all of its captured samples will be permanently removed.`,
          confirmLabel: 'Delete project'
        });
        if (!ok) return;
        await storage.deleteProject(p.id);
        ui.toast('Project deleted.', 'success');
        refresh();
      };
      listEl.appendChild(row);
    });
  }

  newBtn.onclick = async () => {
    const name = await ui.promptModal({
      title: 'Name your project',
      message: 'Give your yoga pose model a name. You can change this later.',
      placeholder: 'e.g. My Yoga Model',
      defaultValue: 'My Yoga Model'
    });
    if (!name) return;
    const { project } = await storage.createProject(name);
    storage.setCurrentProjectId(project.id);
    location.href = `train.html?project=${project.id}`;
  };

  refresh();
}

// =====================================================================
// TRAIN PAGE
// =====================================================================

async function initTrainPage() {
  ui.renderHeader('train');
  const project = await resolveProjectOrRedirect();
  if (!project) return;

  // First time opening this project: seed the 10 beginner pose classes
  // automatically so the student never has to type a pose name.
  if (project.poses.length === 0) {
    for (const entry of POSE_LIBRARY) {
      const { pose } = await storage.addPose(project.id, entry.name);
      project.poses.push(pose);
    }
  }

  refreshHeaderCounts(project);

  const els = {
    projectName: document.getElementById('project-name'),
    featuredRow: document.getElementById('featured-row'),
    poseGrid: document.getElementById('pose-grid'),
    addPoseCard: document.getElementById('add-pose-card'),
    video: document.getElementById('camera-video'),
    canvas: document.getElementById('camera-canvas'),
    cameraFrame: document.getElementById('camera-frame'),
    cameraPlaceholder: document.getElementById('camera-placeholder'),
    cameraSelect: document.getElementById('camera-select'),
    startCameraBtn: document.getElementById('btn-start-camera'),
    detectPill: document.getElementById('detect-pill'),
    qualityStack: document.getElementById('quality-stack'),
    captureFlash: document.getElementById('capture-flash'),
    trainBtn: document.getElementById('btn-train-model'),
    trainMessage: document.getElementById('train-message'),
    trainingPanel: document.getElementById('training-panel'),
    trainingLog: document.getElementById('training-log'),
    progressFill: document.getElementById('progress-fill'),
    epochLabel: document.getElementById('epoch-label'),
    metricAcc: document.getElementById('metric-acc'),
    metricLoss: document.getElementById('metric-loss'),
    resultBanner: document.getElementById('result-banner')
  };

  els.projectName.textContent = project.name;

  let latestLandmarks = null; // raw MediaPipe landmarks for current frame
  let rafId = null;

  // ---------------- rendering ----------------

  function renderFeatured() {
    els.featuredRow.innerHTML = '';
    const featuredIds = project.featured && project.featured.length
      ? project.featured
      : project.poses.slice(0, 3).map((p) => p.id);

    for (let i = 0; i < 3; i++) {
      const poseId = featuredIds[i];
      const pose = project.poses.find((p) => p.id === poseId);
      if (!pose) {
        const ph = document.createElement('div');
        ph.className = 'featured-placeholder glass';
        ph.textContent = '+ ADD POSE';
        ph.onclick = () => els.addPoseCard.click();
        els.featuredRow.appendChild(ph);
        continue;
      }
      const last = pose.samples[pose.samples.length - 1];
      const card = document.createElement('div');
      card.className = 'featured-card glass';
      card.innerHTML = `
        ${last && last.thumbnail
          ? `<img class="featured-thumb" src="${last.thumbnail}" alt="${ui.escapeHtml(pose.name)}" />`
          : `<div class="featured-thumb"></div>`}
        <div class="featured-meta">
          <h4>${ui.escapeHtml(pose.name)}</h4>
          <p>${pose.samples.length} sample${pose.samples.length === 1 ? '' : 's'}</p>
          <span class="badge ${pose.samples.length >= trainer.MIN_SAMPLES_PER_CLASS ? 'ready' : 'pending'}">
            ${pose.samples.length >= trainer.MIN_SAMPLES_PER_CLASS ? 'Ready to train' : 'Needs more samples'}
          </span>
        </div>
      `;
      els.featuredRow.appendChild(card);
    }

    if (project.poses.length > 3) {
      const more = document.createElement('div');
      more.className = 'featured-placeholder glass';
      more.textContent = `+ ${project.poses.length - 3} MORE POSE${project.poses.length - 3 === 1 ? '' : 'S'}`;
      more.onclick = () => els.poseGrid.scrollIntoView({ behavior: 'smooth' });
      els.featuredRow.appendChild(more);
    }
  }

  function renderPoseCard(pose) {
    const card = document.createElement('div');
    card.className = 'pose-card glass';
    card.dataset.poseId = pose.id;
    card.innerHTML = `
      <div class="pose-ref-image-wrap">
        <img src="${getPoseImage(pose.name)}" alt="${ui.escapeHtml(pose.name)} reference" />
      </div>
      <div class="pose-card-head">
        <div class="pose-name-row">
          <p class="pose-name-static">${ui.escapeHtml(pose.name)}</p>
        </div>
        <div class="pose-card-actions">
          <button class="icon-btn" data-act="delete" title="Delete pose">✕</button>
        </div>
      </div>
      <div class="sample-count-line">
        <span>Samples: <strong data-role="count">${pose.samples.length}</strong></span>
        <span>${pose.samples.length >= trainer.MIN_SAMPLES_PER_CLASS ? '✓ enough to train' : `need ${trainer.MIN_SAMPLES_PER_CLASS}+`}</span>
      </div>
      <div class="gallery" data-role="gallery"></div>
      <button class="btn btn-primary btn-block" data-act="capture">CAPTURE</button>
    `;

    card.querySelector('[data-act="delete"]').onclick = async () => {
      const ok = await ui.confirmModal({
        title: `Delete "${pose.name}"?`,
        message: `This removes the pose class and its ${pose.samples.length} captured sample(s).`,
        confirmLabel: 'Delete pose'
      });
      if (!ok) return;
      await storage.deletePose(project.id, pose.id);
      project.poses = project.poses.filter((p) => p.id !== pose.id);
      card.remove();
      renderFeatured();
      refreshHeaderCounts(project);
      ui.toast('Pose deleted.', 'success');
    };

    card.querySelector('[data-act="capture"]').onclick = () => captureForPose(pose, card);

    renderGallery(card, pose);
    return card;
  }

  function renderGallery(card, pose) {
    const gallery = card.querySelector('[data-role="gallery"]');
    gallery.innerHTML = '';
    if (pose.samples.length === 0) {
      gallery.innerHTML = '<div class="gallery-empty">No samples yet — strike the pose and capture one.</div>';
      return;
    }
    pose.samples.forEach((sample) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.innerHTML = `
        ${sample.thumbnail ? `<img src="${sample.thumbnail}" />` : ''}
        <button class="del" title="Delete sample">✕</button>
      `;
      item.querySelector('.del').onclick = async () => {
        await storage.deleteSample(project.id, sample.id);
        pose.samples = pose.samples.filter((s) => s.id !== sample.id);
        renderGallery(card, pose);
        card.querySelector('[data-role="count"]').textContent = pose.samples.length;
        renderFeatured();
        refreshHeaderCounts(project);
      };
      gallery.appendChild(item);
    });
  }

  function renderPoseGrid() {
    els.poseGrid.querySelectorAll('.pose-card').forEach((c) => c.remove());
    project.poses.forEach((pose) => {
      els.poseGrid.insertBefore(renderPoseCard(pose), els.addPoseCard);
    });
  }

  renderFeatured();
  renderPoseGrid();

  // ---------------- add pose ----------------

  els.addPoseCard.onclick = async () => {
    const defaultName = `POSE ${project.poses.length + 1}`;
    const name = await ui.promptModal({
      title: 'Name this pose',
      message: 'What should this pose class be called?',
      placeholder: 'e.g. Tree Pose',
      defaultValue: defaultName
    });
    if (!name) return;
    const { pose } = await storage.addPose(project.id, name);
    project.poses.push(pose);
    els.poseGrid.insertBefore(renderPoseCard(pose), els.addPoseCard);
    renderFeatured();
    refreshHeaderCounts(project);
    ui.toast(`"${pose.name}" added.`, 'success');
  };

  // ---------------- camera ----------------

  async function bootCamera() {
    try {
      const devices = await camera.listCameras();
      els.cameraSelect.innerHTML = devices
        .map((d, i) => `<option value="${d.deviceId}">${d.label || `Camera ${i + 1}`}</option>`)
        .join('');
    } catch (_) { /* permission not granted yet; list will populate after start */ }

    els.startCameraBtn.onclick = async () => {
      ui.setCameraStatus('connecting');
      try {
        await camera.startCamera(els.video, els.cameraSelect.value || undefined);
        els.cameraPlaceholder.classList.add('hidden');
        ui.setCameraStatus('on');
        const devices = await camera.listCameras();
        els.cameraSelect.innerHTML = devices
          .map((d, i) => `<option value="${d.deviceId}">${d.label || `Camera ${i + 1}`}</option>`)
          .join('');
        await bootPoseLoop();
      } catch (err) {
        ui.setCameraStatus('off');
        ui.toast('Camera access was denied or is unavailable.', 'error');
      }
    };

    els.cameraSelect.onchange = async () => {
      if (!camera.isCameraActive()) return;
      await camera.startCamera(els.video, els.cameraSelect.value);
    };
  }

  let detectorReady = false;
  async function bootPoseLoop() {
    if (!detectorReady) {
      try {
        await detector.initializePoseDetector();
        detectorReady = true;
      } catch (err) {
        ui.toast('MediaPipe failed to load. Check your internet connection.', 'error');
        return;
      }
    }
    if (rafId) cancelAnimationFrame(rafId);
    const ctx = els.canvas.getContext('2d');

    const loop = () => {
      camera.syncCanvasSize(els.video, els.canvas);
      const { landmarks } = detector.detectPose(els.video);
      if (landmarks) latestLandmarks = landmarks;
      detector.drawLandmarks(ctx, landmarks, els.canvas.width, els.canvas.height);
      const quality = detector.assessQuality(landmarks);
      els.detectPill.classList.toggle('active', !!landmarks);
      ui.renderQuality(els.qualityStack, landmarks ? quality : { poseDetected: false, fullBody: false });
      rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  bootCamera();

  // ---------------- capture ----------------

  function captureForPose(pose, card) {
    if (!camera.isCameraActive()) {
      ui.toast('Start the camera before capturing a sample.', 'error');
      return;
    }
    if (!latestLandmarks) {
      ui.toast('No pose detected — move into camera view.', 'error');
      return;
    }
    ui.runCaptureFlash(els.captureFlash, async () => {
      const flat = detector.extractLandmarks(latestLandmarks);
      const normalized = detector.normalizeLandmarks(flat);
      const thumbnail = camera.captureThumbnail(els.video);
      try {
        const { sample } = await storage.addSample(project.id, pose.id, normalized, thumbnail);
        pose.samples.push(sample);
        renderGallery(card, pose);
        card.querySelector('[data-role="count"]').textContent = pose.samples.length;
        renderFeatured();
        refreshHeaderCounts(project);
        ui.toast(`Sample #${pose.samples.length} added to "${pose.name}".`, 'success');
      } catch (err) {
        ui.toast('Could not save that sample.', 'error');
      }
    });
  }

  // ---------------- train model ----------------

  els.trainBtn.onclick = async () => {
    const validation = trainer.validateTrainingData(project.poses);
    els.trainMessage.textContent = '';
    if (!validation.valid) {
      els.trainMessage.textContent = validation.message;
      return;
    }

    els.trainingPanel.classList.remove('hidden');
    els.resultBanner.classList.add('hidden');
    els.trainBtn.disabled = true;
    els.trainingLog.innerHTML = '';
    els.progressFill.style.width = '0%';
    els.epochLabel.textContent = 'Epoch 0 / 50';
    els.metricAcc.textContent = '—';
    els.metricLoss.textContent = '—';

    const logLine = (text) => {
      const line = document.createElement('div');
      line.className = 'line active';
      line.textContent = text;
      els.trainingLog.appendChild(line);
      els.trainingLog.scrollTop = els.trainingLog.scrollHeight;
      return line;
    };
    const markDone = (line) => { if (line) line.classList.replace('active', 'done'); };

    let prepLine, normLine, buildLine;

    try {
      const result = await trainer.trainModel(project.poses, (stage, data) => {
        if (stage === 'preparing') prepLine = logLine('Preparing training data...');
        if (stage === 'normalizing') { markDone(prepLine); normLine = logLine('Normalizing landmarks...'); }
        if (stage === 'building') {
          markDone(normLine);
          buildLine = logLine(`Building neural network (${data.numClasses} classes, ${data.numSamples} samples)...`);
        }
        if (stage === 'epoch') {
          markDone(buildLine);
          els.epochLabel.textContent = `Epoch ${data.epoch} / ${data.totalEpochs}`;
          els.progressFill.style.width = `${(data.epoch / data.totalEpochs) * 100}%`;
          els.metricAcc.textContent = `${(data.accuracy * 100).toFixed(1)}%`;
          els.metricLoss.textContent = data.loss.toFixed(3);
        }
      });

      await trainer.saveModelLocal(result.model, modelKeyFor(project.id));

      const updatedModel = {
        status: 'trained',
        classNames: result.classNames,
        trainedAt: new Date().toISOString(),
        accuracy: result.accuracy,
        metadata: { numSamples: result.numSamples }
      };
      await storage.updateProject(project.id, { model: updatedModel, featured: project.featured });
      project.model = updatedModel;

      els.resultBanner.classList.remove('hidden');
      els.resultBanner.innerHTML = `
        <h4>✓ MODEL TRAINED SUCCESSFULLY</h4>
        <div class="stats">
          <div><strong>${project.poses.length}</strong>Pose Classes</div>
          <div><strong>${result.numSamples}</strong>Training Samples</div>
          <div><strong>${(result.accuracy * 100).toFixed(1)}%</strong>Training Accuracy</div>
        </div>
        <a class="btn btn-primary" href="test.html">TEST MODEL</a>
      `;
      refreshHeaderCounts(project);
      ui.toast('Model trained successfully.', 'success');
    } catch (err) {
      console.error(err);
      els.trainMessage.textContent = 'Training failed unexpectedly. Please try again.';
    } finally {
      els.trainBtn.disabled = false;
    }
  };
}

// =====================================================================
// TEST PAGE
// =====================================================================

async function initTestPage() {
  ui.renderHeader('test');
  const project = await resolveProjectOrRedirect();
  if (!project) return;
  refreshHeaderCounts(project);

  const els = {
    notTrained: document.getElementById('not-trained-message'),
    predictArea: document.getElementById('predict-area'),
    video: document.getElementById('camera-video'),
    canvas: document.getElementById('camera-canvas'),
    cameraPlaceholder: document.getElementById('camera-placeholder'),
    startCameraBtn: document.getElementById('btn-start-camera'),
    detectPill: document.getElementById('detect-pill'),
    predictionCard: document.getElementById('prediction-card'),
    poseNameBig: document.getElementById('pose-name-big'),
    confidenceBig: document.getElementById('confidence-big'),
    confBars: document.getElementById('conf-bars')
  };

  if (!project.model || project.model.status !== 'trained') {
    els.notTrained.classList.remove('hidden');
    els.predictArea.classList.add('hidden');
    return;
  }
  els.notTrained.classList.add('hidden');
  els.predictArea.classList.remove('hidden');

  let model = null;
  try {
    model = await trainer.loadModelLocal(modelKeyFor(project.id));
  } catch (err) {
    els.notTrained.classList.remove('hidden');
    els.predictArea.classList.add('hidden');
    els.notTrained.querySelector('p').textContent =
      'The trained model could not be found in this browser. Please retrain it on the Train page.';
    return;
  }

  const classNames = project.model.classNames;
  classNames.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'conf-bar-row';
    row.dataset.name = name;
    row.innerHTML = `
      <div class="conf-bar-label"><span>${ui.escapeHtml(name)}</span><span data-role="pct">0%</span></div>
      <div class="conf-bar-track"><div class="conf-bar-fill" data-role="fill"></div></div>
    `;
    els.confBars.appendChild(row);
  });

  let detectorReady = false;
  let rafId = null;

  els.startCameraBtn.onclick = async () => {
    ui.setCameraStatus('connecting');
    try {
      await camera.startCamera(els.video);
      els.cameraPlaceholder.classList.add('hidden');
      ui.setCameraStatus('on');
      if (!detectorReady) {
        await detector.initializePoseDetector();
        detectorReady = true;
      }
      ui.setModelStatus('live');
      startLoop();
    } catch (err) {
      ui.setCameraStatus('off');
      ui.toast('Camera access was denied or is unavailable.', 'error');
    }
  };

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    const ctx = els.canvas.getContext('2d');

    const loop = () => {
      camera.syncCanvasSize(els.video, els.canvas);
      const { landmarks } = detector.detectPose(els.video);
      els.detectPill.classList.toggle('active', !!landmarks);

      if (landmarks) {
        detector.drawLandmarks(ctx, landmarks, els.canvas.width, els.canvas.height);
        const flat = detector.extractLandmarks(landmarks);
        const normalized = detector.normalizeLandmarks(flat);
        const result = predictor.predict(model, classNames, normalized);
        updatePredictionUI(result);
      } else {
        ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
      }
      rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  function updatePredictionUI(result) {
    els.predictionCard.classList.toggle('unknown', result.isUnknown);
    if (result.isUnknown) {
      els.poseNameBig.textContent = 'UNKNOWN POSE';
      els.confidenceBig.textContent = 'Pose not confidently recognized';
    } else {
      els.poseNameBig.textContent = result.label.toUpperCase();
      els.confidenceBig.textContent = `${(result.confidence * 100).toFixed(1)}% confidence`;
    }

    result.probabilities.forEach((p, i) => {
      const row = els.confBars.querySelector(`[data-name="${CSS.escape(p.name)}"]`);
      if (!row) return;
      const pct = Math.round(p.prob * 100);
      row.querySelector('[data-role="pct"]').textContent = `${pct}%`;
      row.querySelector('[data-role="fill"]').style.width = `${pct}%`;
      row.querySelector('[data-role="fill"]').classList.toggle('top', i === 0 && !result.isUnknown);
      row.querySelector('.conf-bar-label').classList.toggle('top', i === 0 && !result.isUnknown);
    });
  }
}

// =====================================================================
// EXPLORE PAGE
// =====================================================================

async function initExplorePage() {
  ui.renderHeader('explore');
  const project = await resolveProjectOrRedirect();
  if (!project) return;
  refreshHeaderCounts(project);

  const trained = project.model && project.model.status === 'trained';

  document.getElementById('sum-name').textContent = project.name;
  document.getElementById('sum-classes').textContent = project.poses.length;
  document.getElementById('sum-samples').textContent = totalSamples(project);
  const statusEl = document.getElementById('sum-status');
  statusEl.textContent = trained ? 'Ready' : 'Not trained';
  statusEl.style.color = trained ? 'var(--mint)' : 'var(--amber)';

  const exportModelBtn = document.getElementById('btn-export-model');
  const exportDataBtn = document.getElementById('btn-export-data');
  const pythonBtn = document.getElementById('btn-python-guide');
  const pythonBlock = document.getElementById('python-block');

  exportModelBtn.disabled = !trained;
  exportModelBtn.onclick = async () => {
    try {
      const model = await trainer.loadModelLocal(modelKeyFor(project.id));
      await trainer.exportModel(model, project.model.classNames);
      ui.toast('Model exported.', 'success');
    } catch (err) {
      ui.toast('Could not find the trained model in this browser. Retrain it on the Train page.', 'error');
    }
  };

  exportDataBtn.onclick = () => {
    if (totalSamples(project) === 0) {
      ui.toast('Capture some samples first.', 'error');
      return;
    }
    trainer.exportDataset(project);
    ui.toast('Training dataset exported.', 'success');
  };

  pythonBtn.onclick = () => {
    pythonBlock.classList.toggle('show');
  };
}
