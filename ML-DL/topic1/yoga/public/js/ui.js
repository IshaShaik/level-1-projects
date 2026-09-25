// ui.js
// Shared, reusable interface pieces: header/status strip, toasts, a small
// confirm modal, and render helpers used by more than one page.

export function renderHeader(activePage) {
  const root = document.getElementById('header-root');
  if (!root) return;

  root.innerHTML = `
    <div class="lab-header-inner">
      <div class="brand">
        <div class="brand-mark"></div>
        <div class="brand-text">
          <h1>YOGA POSE TRAINER</h1>
          <p>AI-Powered Pose Recognition Lab</p>
        </div>
      </div>
      <nav class="lab-nav">
        <a href="train.html" data-page="train">TRAIN</a>
        <a href="test.html" data-page="test">TEST</a>
        <a href="explore.html" data-page="explore">EXPLORE</a>
      </nav>
      <div class="status-strip" id="status-strip">
        <div class="status-chip" id="chip-camera"><span class="dot off"></span><span>Camera: <strong>Off</strong></span></div>
        <div class="status-chip" id="chip-model"><span class="dot off"></span><span>Model: <strong>Not Trained</strong></span></div>
        <div class="status-chip" id="chip-poses"><span class="dot"></span><span>Poses: <strong>0</strong></span></div>
        <div class="status-chip" id="chip-samples"><span class="dot"></span><span>Samples: <strong>0</strong></span></div>
      </div>
    </div>
  `;

  root.querySelectorAll('.lab-nav a').forEach((a) => {
    if (a.dataset.page === activePage) a.classList.add('active');
  });
}

export function setCameraStatus(state) {
  // state: 'off' | 'connecting' | 'on'
  const chip = document.getElementById('chip-camera');
  if (!chip) return;
  const dot = chip.querySelector('.dot');
  const strong = chip.querySelector('strong');
  dot.className = 'dot ' + (state === 'on' ? 'on' : state === 'connecting' ? 'warn' : 'off');
  strong.textContent = state === 'on' ? 'Connected' : state === 'connecting' ? 'Connecting…' : 'Off';
}

export function setModelStatus(state) {
  // state: 'untrained' | 'ready' | 'live'
  const chip = document.getElementById('chip-model');
  if (!chip) return;
  const dot = chip.querySelector('.dot');
  const strong = chip.querySelector('strong');
  if (state === 'ready') { dot.className = 'dot on'; strong.textContent = 'Ready'; }
  else if (state === 'live') { dot.className = 'dot on'; strong.textContent = 'Live Prediction'; }
  else { dot.className = 'dot off'; strong.textContent = 'Not Trained'; }
}

export function setCounts(poseCount, sampleCount) {
  const poseChip = document.getElementById('chip-poses');
  const sampleChip = document.getElementById('chip-samples');
  if (poseChip) poseChip.querySelector('strong').textContent = String(poseCount);
  if (sampleChip) sampleChip.querySelector('strong').textContent = String(sampleCount);
}

// ---------- toasts ----------

export function toast(message, type = 'info') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

// ---------- confirm modal ----------

export function confirmModal({ title, message, confirmLabel = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal glass glass-glow">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="btn" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) { backdrop.remove(); resolve(false); }
    });
    backdrop.querySelector('[data-act="cancel"]').onclick = () => { backdrop.remove(); resolve(false); };
    backdrop.querySelector('[data-act="ok"]').onclick = () => { backdrop.remove(); resolve(true); };
  });
}

export function promptModal({ title, message, placeholder = '', defaultValue = '' }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal glass glass-glow">
        <h3>${title}</h3>
        <p>${message}</p>
        <input type="text" placeholder="${placeholder}" value="${defaultValue}" />
        <div class="modal-actions">
          <button class="btn" data-act="cancel">Cancel</button>
          <button class="btn btn-primary" data-act="ok">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector('input');
    input.focus();
    input.select();
    const submit = () => { const v = input.value.trim(); backdrop.remove(); resolve(v || null); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    backdrop.querySelector('[data-act="cancel"]').onclick = () => { backdrop.remove(); resolve(null); };
    backdrop.querySelector('[data-act="ok"]').onclick = submit;
  });
}

// ---------- capture countdown overlay ----------

export function runCaptureFlash(flashEl, onCapture) {
  const seq = ['3', '2', '1', 'CAPTURED ✓'];
  let i = 0;
  flashEl.classList.remove('show');
  flashEl.textContent = seq[0];
  // force reflow so the animation restarts cleanly
  void flashEl.offsetWidth;
  flashEl.classList.add('show');

  const step = () => {
    i += 1;
    if (i < seq.length) {
      flashEl.textContent = seq[i];
      if (i === seq.length - 1 && typeof onCapture === 'function') onCapture();
      setTimeout(step, 320);
    }
  };
  setTimeout(step, 320);
}

// ---------- quality indicator ----------

export function renderQuality(el, { poseDetected, fullBody }) {
  el.innerHTML = '';
  const items = [
    { label: 'POSE DETECTED', ok: poseDetected },
    { label: 'FULL BODY VISIBLE', ok: fullBody }
  ];
  items.forEach((it) => {
    const div = document.createElement('div');
    div.className = 'quality-item ' + (it.ok ? 'ok' : 'bad');
    div.textContent = (it.ok ? '✓ ' : '· ') + it.label;
    el.appendChild(div);
  });
  if (!poseDetected) {
    const div = document.createElement('div');
    div.className = 'quality-item bad';
    div.textContent = 'Move into camera view';
    el.appendChild(div);
  }
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
