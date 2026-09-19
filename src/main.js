import QRCode from 'qrcode';
import './styles.css';

const API_BASE = location.origin.replace(/\/$/, '');
const PUBLIC_ORIGIN = location.origin.replace(/\/$/, '');
const CLOUDINARY_CLOUD_NAME = 's7aopw6x';
const CLOUDINARY_UPLOAD_PRESET = 'pratilipi';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
const EXPIRY_OPTIONS = { '1h': '1 Hour', '12h': '12 Hours', '1d': '1 Day', '1w': '1 Week', '1m': '1 Month' };
const HISTORY_KEY = 'pratilipi.activeUploads.v1';

const state = {
  dropId: null,
  uploadUrl: null,
  expiresAt: null,
  expiry: '1d',
  files: [],
  texts: [],
  view: 'home',
  uploading: 0,
  batchId: 0,
  publicShare: false,
  uploadController: null,
  uploadAssets: [],
  authenticated: false,
  authConfigured: true
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatRemaining(expiresAt) {
  const ms = Number(expiresAt) - Date.now();
  if (ms <= 0) return 'Expired';
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m left`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h left`;
}

function iconFor(type) {
  if (type?.startsWith('image/')) return 'IMG';
  if (type?.startsWith('audio/')) return 'AUD';
  if (type?.startsWith('video/')) return 'VID';
  if (type?.includes('pdf')) return 'PDF';
  if (type?.startsWith('text/')) return 'TXT';
  if (type?.includes('zip') || type?.includes('archive')) return 'ZIP';
  return 'FILE';
}

function getHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30)));
}

function rememberDrop(data) {
  if (!data?.id) return;
  const next = getHistory().filter((item) => item.id !== data.id);
  next.unshift({
    id: data.id,
    uploadUrl: data.uploadUrl || `${PUBLIC_ORIGIN}/u/${data.id}`,
    expiresAt: Number(data.expiresAt || data.expires_at || 0),
    expiry: data.expiry || data.expiry_option || '1d',
    createdAt: Number(data.createdAt || data.created_at || Date.now())
  });
  saveHistory(next);
}

function forgetDrop(dropId) {
  saveHistory(getHistory().filter((item) => item.id !== dropId));
}

function toast(message, kind = 'normal') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3000);
}

function setMode(mode) {
  document.body.dataset.mode = mode;
}

function setBusy(delta) {
  state.uploading = Math.max(0, state.uploading + delta);
  document.body.classList.toggle('busy', state.uploading > 0);
}

function renderShell() {
  document.title = 'प्रतिलिपि — Your Files, Your Way';
  document.querySelector('#app').innerHTML = \`
    <div class="app-bg" aria-hidden="true">
      <div class="nebula nebula-a"></div><div class="nebula nebula-b"></div>
      <div class="stars stars-a"></div><div class="stars stars-b"></div>
      <div class="glow-orb orb-a"></div><div class="glow-orb orb-b"></div>
      <svg class="leaf-frame leaf-left" viewBox="0 0 280 720"><defs><linearGradient id="lg1" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#321bff"/><stop offset=".48" stop-color="#7d49ff"/><stop offset="1" stop-color="#36dcff"/></linearGradient></defs><path d="M36 714C77 561 31 358 105 156C134 79 181 31 238 2" fill="none" stroke="url(#lg1)" stroke-width="6"/><g fill="url(#lg1)"><path d="M78 570C22 548 7 490 15 441C57 449 92 493 78 570Z"/><path d="M74 488C25 460 19 407 42 370C80 390 92 431 74 488Z"/><path d="M92 399C44 374 39 326 62 290C99 309 110 349 92 399Z"/><path d="M119 299C81 269 82 221 108 193C141 219 148 257 119 299Z"/><path d="M151 210C128 176 138 132 168 109C190 145 183 178 151 210Z"/></g></svg>
      <svg class="leaf-frame leaf-right" viewBox="0 0 280 720"><defs><linearGradient id="lg2" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#244fff"/><stop offset=".52" stop-color="#7540ff"/><stop offset="1" stop-color="#ef48cf"/></linearGradient></defs><path d="M275 714C249 558 286 414 216 281C181 216 147 172 73 120" fill="none" stroke="url(#lg2)" stroke-width="5"/><g fill="url(#lg2)"><path d="M235 564C292 535 306 482 294 436C252 447 218 489 235 564Z"/><path d="M224 474C271 445 275 404 257 366C221 383 209 422 224 474Z"/><path d="M207 384C245 360 248 325 232 293C200 307 190 344 207 384Z"/><path d="M185 301C216 280 219 246 201 217C175 234 168 266 185 301Z"/></g></svg>
    </div>

    <header class="topbar">
      <a class="brand" href="/" aria-label="Pratilipi home">
        <span class="brand-icon"><svg viewBox="0 0 64 64"><defs><linearGradient id="brandGrad" x1="0" x2="1"><stop stop-color="#ff4fe6"/><stop offset=".55" stop-color="#9b67ff"/><stop offset="1" stop-color="#52e4ff"/></linearGradient></defs><path d="M16 6h23l13 13v38H16z" fill="none" stroke="url(#brandGrad)" stroke-width="4" stroke-linejoin="round"/><path d="M39 6v14h13M24 30h17M24 38h14M24 46h11" fill="none" stroke="url(#brandGrad)" stroke-width="3" stroke-linecap="round"/></svg></span>
        <span class="brand-copy"><strong>प्रतिलिपि</strong><small>Your Files, Your Way</small></span>
      </a>

      <nav class="primary-nav" aria-label="Primary">
        <button class="nav-link active" id="nav-home" type="button">Home</button>
        <button class="nav-link" id="nav-active" type="button">Active Shares</button>
        <button class="nav-link" id="nav-about" type="button">About</button>
      </nav>

      <div class="top-right">
        <span class="tagline">Simple <i>•</i> Secure <i>•</i> Yours</span>
        <button class="dashboard-btn" id="access-dashboard" type="button"><span class="lock-icon">▣</span><span>Access Dashboard</span></button>
      </div>
    </header>

    <main class="page">
      <section class="home-page" id="home-page">
        <div class="hero-heading">
          <div><h1>One Platform. <span>Many Possibilities.</span></h1><p>Every Upload Tells a Story</p></div>
          <div class="random-banner"><span class="swap-icon">⤨</span><div><strong>Random Theme Active</strong><small>Each visit shows a different style!</small></div></div>
          <div class="script-badge">Share<br>Store<br>Anywhere <b>♥</b></div>
        </div>

        <div class="mode-grid">
          <section class="mode-card file-card" id="upload-card">
            <div class="card-title-row"><span class="step-dot violet">1</span><div><h2>Upload Files</h2><p>Select, Drag &amp; Drop or Choose Files</p></div></div>
            <div class="visual-logo file-logo"><svg viewBox="0 0 660 180"><defs><linearGradient id="fileWord" x1="0" x2="1"><stop stop-color="#d56cff"/><stop offset=".48" stop-color="#9b7cff"/><stop offset="1" stop-color="#52eaff"/></linearGradient><filter id="fileGlow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M72 141C134 96 183 44 251 25C315 8 367 23 426 53" fill="none" stroke="#7a42ff" stroke-width="2"/><path d="M96 149C160 122 213 110 267 104C331 98 383 79 438 51" fill="none" stroke="#d04cff" stroke-width="2" opacity=".85"/><text x="332" y="119" text-anchor="middle" fill="url(#fileWord)" filter="url(#fileGlow)" font-size="91" font-family="Noto Sans Devanagari,Mangal,sans-serif" font-weight="900">प्रतिलिपि</text><path d="M120 132C85 94 80 52 101 16C138 30 158 71 144 111C137 128 125 139 120 132Z" fill="url(#fileWord)"/><path d="M503 143C540 114 578 63 589 15C550 15 517 33 503 66C490 97 490 127 503 143Z" fill="url(#fileWord)"/><path d="M130 119C100 93 91 59 103 28M518 125C546 91 566 57 582 26" fill="none" stroke="#e2d5ff" stroke-width="3"/></svg><h3>Drop Your Files. Create Your Story.</h3></div>

            <div class="drop-zone" id="drop-zone" tabindex="0" role="button" aria-label="Select files to send">
              <input id="file-input" type="file" multiple hidden>
              <div class="drop-cloud">⇧</div><strong>Drag &amp; Drop files here</strong><span>or</span><button class="choose-btn" id="choose-files" type="button"><span>▱</span> Choose Files</button>
            </div>

            <div class="file-type-row"><span class="type-pill c">▧<small>All File Types</small></span><span class="type-pill r">PDF<small>Images</small></span><span class="type-pill b">▤<small>Docs</small></span><span class="type-pill p">▣<small>Videos</small></span><span class="type-pill m">♫<small>Audio</small></span><span class="type-pill o">▦<small>Archives</small></span><span class="type-pill v">◌<small>Others</small></span></div>
            <div class="card-bottom-row"><button class="ghost-btn" id="paste-files" type="button">⌘ &nbsp; Paste</button><label class="expiry-label">Keep for <select id="expiry-select"><option value="1h">1 Hour</option><option value="12h">12 Hours</option><option value="1d" selected>1 Day</option><option value="1w">1 Week</option><option value="1m">1 Month</option></select></label></div>
          </section>

          <div class="or-separator"><span>OR</span></div>

          <section class="mode-card text-card" id="text-panel">
            <div class="card-title-row"><span class="step-dot gold">1</span><div><h2>Paste Text</h2><p>Write, Share &amp; Preserve</p></div></div>
            <div class="visual-logo text-logo"><svg viewBox="0 0 660 180"><defs><linearGradient id="textWord" x1="0" x2="1"><stop stop-color="#ffe267"/><stop offset=".52" stop-color="#ffb74b"/><stop offset="1" stop-color="#ff4b2e"/></linearGradient><filter id="textGlow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><text x="325" y="121" text-anchor="middle" fill="url(#textWord)" filter="url(#textGlow)" font-size="92" font-family="Noto Sans Devanagari,Mangal,sans-serif" font-weight="900">प्रतिलिपि</text><path d="M121 132C83 94 80 52 100 14C141 27 155 69 139 111C133 126 125 139 121 132Z" fill="url(#textWord)"/><path d="M513 143C550 123 579 95 596 65C620 24 614 -5 590 5C552 18 527 44 512 80C499 105 500 129 513 143Z" fill="none" stroke="url(#textWord)" stroke-width="14" stroke-linecap="round"/><path d="M540 32C569 41 584 58 596 80C570 89 547 82 526 65" fill="none" stroke="#ff6a30" stroke-width="7" stroke-linecap="round"/></svg><h3>Write. Share. Preserve.</h3></div>
            <textarea id="text-input" placeholder="Paste your text here..."></textarea>
            <div class="text-count" id="text-count">0 characters</div>
            <div class="text-chip-row"><button class="text-chip" data-template="Notes" type="button"><span>▣</span> Notes</button><button class="text-chip" data-template="Code" type="button"><span>&lt;/&gt;</span> Code</button><button class="text-chip" data-template="Ideas" type="button"><span>◉</span> Ideas</button><button class="text-chip" data-template="Content" type="button"><span>▤</span> Content</button></div>
            <button class="save-text-btn" id="save-text" type="button">Save Text</button>
          </section>
        </div>

        <section class="upload-status-panel" id="upload-progress" hidden>
          <div class="status-steps"><div class="status-step active"><span class="ring"></span><span>Preparing your files...</span></div><div class="status-step active"><span class="ring"></span><span>Uploading to cloud...</span></div><div class="status-step"><span class="ring"></span><span>Processing...</span></div><div class="status-step"><span class="ring"></span><span>Creating your Pratilipi...</span></div></div>
          <div class="status-main"><div class="status-art"><div class="upload-mark">प्रतिलिपि</div><p>Uploading your files...</p><div class="progress-track"><i id="progress-bar"></i></div><div class="progress-value" id="progress-percent">0%</div></div></div>
          <div class="status-side"><div class="status-metric"><span>▱</span><strong id="progress-files">0 files</strong></div><div class="status-metric"><span>♧</span><strong id="progress-bytes">0 B / 0 B</strong></div><div class="status-metric"><span>◷</span><strong id="progress-time">Estimated time: —</strong></div><button class="cancel-btn" id="cancel-upload" type="button"><span>■</span> Cancel Upload</button></div>
          <div class="upload-queue" id="upload-queue"></div>
        </section>

        <section class="success-panel" id="success-panel" hidden>
          <div class="success-left"><div class="success-check">✓</div><div><h3>Your Pratilipi Created!</h3><p>Your files have been uploaded successfully.</p></div></div>
          <div class="success-actions"><button class="success-btn primary" id="preview-files" type="button">◉ &nbsp; View Files</button><button class="success-btn" id="copy-result-link" type="button">↗ &nbsp; Copy Share Link</button><button class="success-btn" id="show-result-qr" type="button">▦ &nbsp; Show QR Code</button><button class="success-btn" id="download-zip" type="button">⇩ &nbsp; Download All (ZIP)</button></div>
          <input id="result-link" hidden readonly>
          <div id="ready-files" class="ready-files-hidden" hidden></div>
        </section>

        <section class="home-footer-note"><span>Simple Sharing. Beautifully Done.</span><i></i><b>— MORE THAN FILES — IT'S YOUR STORY —</b><i></i><strong>Built for You ♥</strong></section>
      </section>

      <section class="view-page" id="active-view" hidden>
        <div class="page-head"><div><div class="mini-kicker">YOUR LOCAL HISTORY</div><h2>Active Shares</h2><p>Pratilipi rechecks these Drops with the server whenever you open this list.</p></div><button class="secondary-btn" id="active-refresh" type="button">Refresh</button></div>
        <div id="active-list" class="active-list"></div>
      </section>

      <footer class="footer"><span>प्रतिलिपि • Temporary sharing, beautifully done.</span><div><button id="footer-active" type="button">Active Shares</button><button id="footer-new" type="button">Home</button></div></footer>
    </main>

    <dialog class="modal" id="auth-dialog"><div class="modal-inner auth-inner"><button class="modal-close" data-close="auth-dialog" type="button">×</button><div class="modal-icon">▣</div><div class="modal-kicker">SECURE DASHBOARD ACCESS</div><h3>Unlock Pratilipi</h3><p>Enter your private Access ID and passkey to create and manage Drops.</p><form id="auth-form"><label>Access ID<input id="auth-id" autocomplete="username" required></label><label>Passkey<div class="pass-wrap"><input id="auth-pass" type="password" autocomplete="current-password" required><button type="button" id="toggle-pass">Show</button></div></label><div class="auth-error" id="auth-error"></div><button class="save-text-btn" id="auth-submit" type="submit">Access Dashboard</button></form></div></dialog>
    <dialog class="modal" id="about-dialog"><div class="modal-inner"><button class="modal-close" data-close="about-dialog" type="button">×</button><div class="modal-kicker">ABOUT PRATILIPI</div><h3>More Than Files. It's Your Story.</h3><p>Pratilipi is a private, temporary sharing space for files and text with direct public share links. Drops expire automatically.</p><div class="about-grid"><span>Temporary Drops</span><span>Direct Downloads</span><span>QR Sharing</span><span>Public Share Links</span></div></div></dialog>
    <dialog class="modal" id="review-dialog"><div class="modal-inner"><button class="modal-close" data-close="review-dialog" type="button">×</button><div class="modal-kicker">REVIEW BEFORE UPLOAD</div><h3>Ready to upload?</h3><p>Nothing is sent until you press Upload Files.</p><div id="review-list" class="review-list"></div><div class="modal-actions"><button class="secondary-btn" data-close="review-dialog" type="button">Cancel</button><button class="save-text-btn" id="confirm-upload" type="button">Upload Files</button></div></div></dialog>
    <dialog class="modal" id="files-dialog"><div class="modal-inner"><button class="modal-close" data-close="files-dialog" type="button">×</button><div class="modal-kicker">YOUR PRATILIPI</div><h3>Files in this Drop</h3><div id="files-list" class="modal-files-list"></div></div></dialog>
    <dialog class="modal qr-modal" id="qr-dialog"><div class="modal-inner"><button class="modal-close" data-close="qr-dialog" type="button">×</button><div class="modal-kicker">SCAN WITH PHONE</div><h3 id="qr-title">Pratilipi QR</h3><canvas id="qr-canvas"></canvas><input id="qr-url" readonly><div class="modal-actions"><button class="secondary-btn" id="copy-qr-url" type="button">Copy URL</button><button class="save-text-btn" data-close="qr-dialog" type="button">Done</button></div></div></dialog>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  \`;
  updateExpiryHelp();
}

function updateExpiryHelp() {
  const value = $('#expiry-select')?.value || '1d';
  $('#expiry-help').textContent = `After ${EXPIRY_OPTIONS[value]}`;
}

async function createDrop(expiry = $('#expiry-select')?.value || '1d') {
  const data = await api('/api/drop', { method: 'POST', body: JSON.stringify({ label: 'Pratilipi drop', expiry }) });
  state.dropId = data.id;
  state.uploadUrl = data.uploadUrl || `${PUBLIC_ORIGIN}/u/${data.id}`;
  state.expiresAt = Number(data.expiresAt);
  state.expiry = data.expiry || expiry;
  rememberDrop(data);
  $('#expiry-select').value = state.expiry;
  $('#expiry-select').disabled = true;
  updateExpiryHelp();
  return data;
}

async function ensureDrop() {
  if (state.dropId) {
    try {
      const existing = await api(`/api/drop/${state.dropId}`);
      state.files = existing.files || [];
      state.texts = existing.texts || [];
      state.expiresAt = Number(existing.drop.expires_at);
      state.expiry = existing.drop.expiry_option || state.expiry;
      $('#expiry-select').disabled = true;
      return existing;
    } catch {
      state.dropId = null;
    }
  }
  return createDrop($('#expiry-select').value || '1d');
}

async function loadDrop(dropId) {
  const data = await api(`/api/drop/${dropId}`);
  state.dropId = dropId;
  state.uploadUrl = `${PUBLIC_ORIGIN}/u/${dropId}`;
  state.expiresAt = Number(data.drop.expires_at);
  state.expiry = data.drop.expiry_option || '1d';
  state.files = data.files || [];
  state.texts = data.texts || [];
  rememberDrop({ id: dropId, uploadUrl: state.uploadUrl, expiresAt: state.expiresAt, expiry: state.expiry, createdAt: data.drop.created_at });
  $('#expiry-select').value = state.expiry;
  $('#expiry-select').disabled = true;
  updateExpiryHelp();
  await renderReadyState();
}

function setProgress(percent, activeLabel = '') {
  const pct = Math.max(0, Math.min(100, percent));
  $('#progress-bar').style.width = `${pct}%`;
  $('#progress-total').textContent = activeLabel || `${Math.round(pct)}%`;
}

function addQueueItem(file) {
  const row = document.createElement('div');
  row.className = 'queue-item';
  row.innerHTML = `<span class="queue-icon">${esc(iconFor(file.type))}</span><div class="queue-main"><strong title="${esc(file.name)}">${esc(file.name)}</strong><small>Starting…</small><div class="queue-track"><i></i></div></div><span class="queue-pct">0%</span>`;
  $('#upload-queue').append(row);
  return row;
}

function updateQueueItem(row, percent, label) {
  row.querySelector('.queue-track i').style.width = `${Math.max(0, Math.min(100, percent))}%`;
  row.querySelector('.queue-pct').textContent = `${Math.round(percent)}%`;
  row.querySelector('small').textContent = label;
}

async function cloudinaryUpload(file, onProgress, signal) {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', 'pratilipi');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_UPLOAD_URL);
    xhr.responseType = 'json';
    const abort = () => xhr.abort();
    if (signal) signal.addEventListener('abort', abort, { once: true });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onerror = () => reject(new Error('Network error while uploading to Cloudinary.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'));
    xhr.onload = () => {
      const payload = xhr.response || (() => { try { return JSON.parse(xhr.responseText || '{}'); } catch { return {}; } })();
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new Error(payload.error?.message || 'Cloudinary upload failed (' + xhr.status + ')'));
    };
    xhr.send(form);
  });
}

async function uploadOne(file, row, onProgress, signal) {
  updateQueueItem(row, 0, 'Uploading...');
  const uploaded = await cloudinaryUpload(file, onProgress, signal);
  updateQueueItem(row, 100, 'Registering...');
  const done = await api('/api/drop/' + state.dropId + '/complete', {
    method: 'POST',
    body: JSON.stringify({
      publicId: uploaded.public_id,
      secureUrl: uploaded.secure_url,
      resourceType: uploaded.resource_type,
      originalFilename: uploaded.original_filename,
      name: file.name,
      contentType: file.type || 'application/octet-stream',
      bytes: uploaded.bytes || file.size,
      format: uploaded.format || ''
    })
  });
  state.uploadAssets.push({ publicId: uploaded.public_id, resourceType: uploaded.resource_type });
  state.files.push(done.file);
  updateQueueItem(row, 100, 'Uploaded');
  row.classList.add('done');
  return done.file;
}

function setAggregateProgress(loaded, total, startedAt, count) {
  const pct = total ? (loaded / total) * 100 : 0;
  $('#progress-bar').style.width = pct + '%';
  $('#progress-percent').textContent = Math.round(pct) + '%';
  $('#progress-bytes').textContent = formatBytes(loaded) + ' / ' + formatBytes(total);
  const elapsed = (Date.now() - startedAt) / 1000;
  const speed = elapsed > 0 ? loaded / elapsed : 0;
  const remaining = speed > 0 ? Math.max(0, total - loaded) / speed : 0;
  $('#progress-time').textContent = remaining > 0 ? 'Estimated time: ' + Math.ceil(remaining) + 's' : 'Estimated time: —';
  return pct;
}

async function startUploadBatch(files) {
  const valid = files.filter((file) => file instanceof File && file.size >= 0);
  if (!valid.length || state.uploading) return;
  state.uploading = 1;
  state.uploadController = new AbortController();
  state.uploadAssets = [];
  state.files = [];
  state.texts = [];
  const controller = state.uploadController;
  const batchId = ++state.batchId;
  const totalBytes = valid.reduce((sum, file) => sum + file.size, 0);
  const loaded = new Array(valid.length).fill(0);
  const startedAt = Date.now();

  $('#upload-progress').hidden = false;
  $('#success-panel').hidden = true;
  $('#upload-queue').innerHTML = '';
  $('#progress-files').textContent = valid.length + ' files';
  $('#progress-bytes').textContent = '0 B / ' + formatBytes(totalBytes);
  $('#progress-percent').textContent = '0%';
  $('#progress-bar').style.width = '0%';
  $('#progress-time').textContent = 'Estimated time: —';
  $('#upload-progress').scrollIntoView({ behavior: 'smooth', block: 'center' });

  try {
    await ensureDrop();
    const rows = valid.map(addQueueItem);
    const results = await Promise.all(valid.map(async (file, index) => {
      try {
        return await uploadOne(file, rows[index], (bytes, fileTotal) => {
          loaded[index] = bytes;
          setAggregateProgress(loaded.reduce((a, b) => a + b, 0), totalBytes, startedAt, valid.length);
          updateQueueItem(rows[index], fileTotal ? (bytes / fileTotal) * 100 : 0, 'Uploading...');
        }, controller.signal);
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        updateQueueItem(rows[index], 0, error.message);
        rows[index].classList.add('error');
        return null;
      }
    }));

    if (batchId !== state.batchId || controller.signal.aborted) return;
    const successCount = results.filter(Boolean).length;
    await refreshDrop();
    $('#progress-bar').style.width = '100%';
    $('#progress-percent').textContent = '100%';
    $('#progress-bytes').textContent = formatBytes(totalBytes) + ' / ' + formatBytes(totalBytes);
    $('#progress-time').textContent = 'Upload complete';
    if (!successCount) throw new Error('No files were uploaded.');
    setTimeout(() => {
      if (batchId === state.batchId) {
        state.uploading = 0;
        state.uploadController = null;
        $('#upload-progress').hidden = true;
        $('#success-panel').hidden = false;
        $('#result-link').value = state.uploadUrl || (PUBLIC_ORIGIN + '/u/' + state.dropId);
        renderReadyFiles();
        toast(successCount === valid.length ? 'Your Pratilipi is ready to share.' : successCount + ' of ' + valid.length + ' files uploaded.');
        $('#success-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
  } catch (error) {
    if (error.name === 'AbortError') return;
    state.uploading = 0;
    state.uploadController = null;
    $('#upload-progress').hidden = true;
    toast(error.message, 'error');
  }
}

async function cancelUpload() {
  if (!state.uploading) return;
  state.batchId++;
  state.uploadController?.abort();
  const assets = state.uploadAssets.slice();
  state.uploading = 0;
  state.uploadController = null;
  try {
    if (state.dropId && assets.length) {
      await api('/api/drop/' + state.dropId + '/cancel', { method: 'POST', body: JSON.stringify({ assets }) });
    }
  } catch {}
  state.uploadAssets = [];
  $('#upload-progress').hidden = true;
  toast('Upload cancelled.', 'error');
}

async function refreshDrop() {
  if (!state.dropId) return null;
  try {
    const data = await api(`/api/drop/${state.dropId}`);
    state.files = data.files || [];
    state.texts = data.texts || [];
    state.expiresAt = Number(data.drop.expires_at);
    state.expiry = data.drop.expiry_option || state.expiry;
    rememberDrop({ id: state.dropId, uploadUrl: state.uploadUrl, expiresAt: state.expiresAt, expiry: state.expiry });
    return data;
  } catch (error) {
    const message = error.message.toLowerCase();
    if (message.includes('expired') || message.includes('not found')) {
      forgetDrop(state.dropId);
      state.dropId = null;
      state.files = [];
      state.texts = [];
      state.uploadUrl = null;
      state.expiresAt = null;
    }
    throw error;
  }
}

function fileUrl(file) {
  return `${PUBLIC_ORIGIN}/d/${encodeURIComponent(file.id)}`;
}

function textUrl(text) {
  return `${PUBLIC_ORIGIN}/d/text/${encodeURIComponent(text.id)}`;
}

function renderReadyFiles() {
  const list = $('#ready-files');
  if (!list) return;
  const entries = [
    ...state.files.map((file) => ({ kind: 'file', id: file.id, name: file.name, type: file.content_type || '', meta: `${formatBytes(Number(file.size))} · ${file.content_type || file.format || 'file'}`, url: fileUrl(file), preview: file.content_type?.startsWith('image/') ? file.secure_url : '' })),
    ...state.texts.map((text) => ({ kind: 'text', id: text.id, name: text.content.slice(0, 70) || 'Text', meta: `${text.content.length.toLocaleString()} characters`, url: textUrl(text) }))
  ];
  list.innerHTML = entries.length ? entries.map((item) => `
    <article class="ready-file">
      <div class="ready-file-icon">${item.preview ? `<img src="${esc(item.preview)}" alt="" />` : `<span>${esc(item.kind === 'text' ? 'TXT' : iconFor(item.type))}</span>`}</div>
      <div class="ready-file-main"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${esc(item.meta)}</small><input readonly value="${esc(item.url)}" /></div>
      <div class="ready-file-actions"><button data-copy="${esc(item.url)}" type="button">Copy</button><button data-qr="${esc(item.url)}" data-qr-title="${esc(item.name)}" type="button">QR</button><a href="${esc(item.url)}">Open</a>${item.kind === 'file' ? `<button data-delete-file="${esc(item.id)}" type="button">Delete</button>` : `<button data-delete-text="${esc(item.id)}" type="button">Delete</button>`}</div>
    </article>`).join('') : '<div class="empty-state">No uploaded items in this Drop.</div>';
  if (state.publicShare) {
    list.querySelectorAll('[data-delete-file], [data-delete-text]').forEach((button) => { button.hidden = true; });
  }
  bindDynamicActions();
}

async function renderReadyState() {
  $('#success-panel').hidden = false;
  $('#home-page').hidden = false;
  $('#active-view').hidden = true;
  if (state.uploadUrl) $('#result-link').value = state.uploadUrl;
  renderReadyFiles();
}

function renderTextList() {
  const list = $('#text-list');
  if (!list) return;
  if (!state.texts.length) {
    list.innerHTML = '<div class="mini-empty">Saved text appears here.</div>';
    return;
  }
  list.innerHTML = state.texts.map((text) => {
    const url = textUrl(text);
    return `<article class="mini-result"><div><strong>${esc(text.content.slice(0, 80))}${text.content.length > 80 ? '…' : ''}</strong><small>${text.content.length.toLocaleString()} characters</small></div><div><button data-copy="${esc(url)}" type="button">Copy</button><a href="${esc(url)}">Open</a><button data-delete-text="${esc(text.id)}" type="button">Delete</button></div></article>`;
  }).join('');
  bindDynamicActions();
}

async function saveText() {
  const content = $('#text-input').value;
  if (!content.trim()) return toast('Paste some text first.', 'error');
  setBusy(1);
  setMode('uploading');
  try {
    await ensureDrop();
    await api(`/api/drop/${state.dropId}/text`, { method: 'POST', body: JSON.stringify({ content }) });
    $('#text-input').value = '';
    updateTextCount();
    await refreshDrop();
    $('#text-panel').hidden = false;
    await renderReadyState();
    toast('Text saved and ready to share.');
  } catch (error) {
    setMode('home');
    toast(error.message, 'error');
  } finally {
    setBusy(-1);
  }
}

function updateTextCount() {
  $('#text-count').textContent = `${$('#text-input').value.length.toLocaleString()} characters`;
}

function toggleTextPanel(force) {
  const panel = $('#text-panel');
  panel.hidden = force === undefined ? !panel.hidden : !force;
  if (!panel.hidden) setTimeout(() => $('#text-input').focus(), 60);
}

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement('textarea');
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    toast('Copied to clipboard.');
  } catch {
    toast('Clipboard permission was denied.', 'error');
  }
}

async function shareCurrentDrop() {
  const url = $('#result-link').value;
  if (!url) return;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'प्रतिलिपि — Pratilipi', text: 'Shared from Pratilipi', url });
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }
  await copyText(url);
}

async function showQr(url, title = 'Pratilipi QR') {
  $('#qr-title').textContent = title;
  $('#qr-url').value = url;
  await QRCode.toCanvas($('#qr-canvas'), url, { width: 260, margin: 2, color: { dark: '#f7ecff', light: '#110a18' } });
  $('#qr-dialog').showModal();
}

async function deleteFile(fileId) {
  if (!window.confirm('Delete this file permanently?')) return;
  try {
    await api(`/api/drop/${encodeURIComponent(state.dropId)}/file/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    state.files = state.files.filter((file) => file.id !== fileId);
    await afterContentMutation();
    toast('File deleted.');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteText(textId) {
  if (!window.confirm('Delete this saved text permanently?')) return;
  try {
    await api(`/api/drop/${encodeURIComponent(state.dropId)}/text/${encodeURIComponent(textId)}`, { method: 'DELETE' });
    state.texts = state.texts.filter((text) => text.id !== textId);
    await afterContentMutation();
    toast('Text deleted.');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function afterContentMutation() {
  if (state.files.length + state.texts.length) {
    await renderReadyState();
  } else {
    newDrop();
  }
  renderRecent();
}

async function deleteEntireDrop(dropId, goHome = true) {
  if (!dropId) return;
  if (!window.confirm('Delete this entire Drop? All uploaded files and saved text will be permanently deleted. This cannot be undone.')) return;
  try {
    await api(`/api/drop/${encodeURIComponent(dropId)}`, { method: 'DELETE' });
    forgetDrop(dropId);
    if (state.dropId === dropId) {
      state.dropId = null;
      state.uploadUrl = null;
      state.expiresAt = null;
      state.files = [];
      state.texts = [];
    }
    toast('Drop deleted.');
    renderRecent();
    if (goHome) newDrop(); else renderActive();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function bindDynamicActions() {
  $$('[data-copy]').forEach((button) => { button.onclick = () => copyText(button.dataset.copy); });
  $$('[data-qr]').forEach((button) => { button.onclick = () => showQr(button.dataset.qr, button.dataset.qrTitle || 'Pratilipi QR'); });
  $$('[data-delete-file]').forEach((button) => { button.onclick = () => deleteFile(button.dataset.deleteFile); });
  $$('[data-delete-text]').forEach((button) => { button.onclick = () => deleteText(button.dataset.deleteText); });
}

async function recheckHistory() {
  const history = getHistory().filter((item) => Number(item.expiresAt) > Date.now());
  if (!history.length) {
    saveHistory([]);
    return [];
  }
  const checked = await Promise.all(history.map(async (item) => {
    try {
      const data = await api(`/api/drop/${encodeURIComponent(item.id)}`);
      return { ...item, expiresAt: Number(data.drop.expires_at), expiry: data.drop.expiry_option || item.expiry, uploadUrl: `${PUBLIC_ORIGIN}/u/${item.id}` };
    } catch {
      return null;
    }
  }));
  const active = checked.filter(Boolean).filter((item) => Number(item.expiresAt) > Date.now());
  saveHistory(active);
  return active;
}

async function renderRecent() {
  const list = $('#recent-list');
  if (!list) return;
  const records = getHistory().filter((item) => Number(item.expiresAt) > Date.now()).slice(0, 4);
  if (!records.length) {
    list.innerHTML = '<div class="recent-empty">No recent Drops yet. Select a file to create your first one.</div>';
    return;
  }
  list.innerHTML = records.map((item) => `<article class="recent-card"><div class="recent-main"><span>DROP</span><strong>${esc(item.id.slice(0, 12))}…</strong><small>${esc(EXPIRY_OPTIONS[item.expiry] || item.expiry)} · ${formatRemaining(item.expiresAt)}</small></div><div class="recent-actions"><button data-open-recent="${esc(item.id)}" type="button">Open</button><button data-delete-recent="${esc(item.id)}" type="button">Delete</button></div></article>`).join('');
  $$('[data-open-recent]').forEach((button) => { button.onclick = () => openDrop(button.dataset.openRecent); });
  $$('[data-delete-recent]').forEach((button) => { button.onclick = () => deleteEntireDrop(button.dataset.deleteRecent, false); });
}

async function renderActive() {
  const list = $('#active-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-state">Checking your active Drops…</div>';
  const records = await recheckHistory();
  if (!records.length) {
    list.innerHTML = '<div class="empty-state large">No active uploads on this browser yet.</div>';
    return;
  }
  list.innerHTML = records.map((item) => `<article class="active-card"><div class="active-main"><span class="recent-label">ACTIVE DROP</span><h3>${esc(item.id.slice(0, 16))}…</h3><p>${esc(EXPIRY_OPTIONS[item.expiry] || item.expiry)} · ${formatRemaining(item.expiresAt)}</p><small>${esc(item.uploadUrl)}</small></div><div class="active-actions"><button data-open-active="${esc(item.id)}" class="cta small" type="button">Open</button><button data-copy-active="${esc(item.uploadUrl)}" class="ready-btn" type="button">Copy URL</button><button data-delete-active="${esc(item.id)}" class="ready-btn danger" type="button">Delete all</button></div></article>`).join('');
  $$('[data-open-active]').forEach((button) => { button.onclick = () => openDrop(button.dataset.openActive); });
  $$('[data-copy-active]').forEach((button) => { button.onclick = () => copyText(button.dataset.copyActive); });
  $$('[data-delete-active]').forEach((button) => { button.onclick = () => deleteEntireDrop(button.dataset.deleteActive, false); });
}

function showView(view) {
  state.view = view;
  $('#home-page').hidden = view === 'active';
  $('#active-view').hidden = view !== 'active';
  $('#nav-home').classList.toggle('active', view !== 'active');
  $('#nav-active').classList.toggle('active', view === 'active');
  if (view === 'active') renderActive();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function newDrop() {
  ++state.batchId;
  state.dropId = null;
  state.uploadUrl = null;
  state.expiresAt = null;
  state.expiry = '1d';
  state.files = [];
  state.texts = [];
  state.uploadAssets = [];
  state.uploadController = null;
  state.uploading = 0;
  if ($('#expiry-select')) {
    $('#expiry-select').disabled = false;
    $('#expiry-select').value = '1d';
  }
  $('#home-page').hidden = false;
  $('#active-view').hidden = true;
  $('#upload-progress').hidden = true;
  $('#success-panel').hidden = true;
  if ($('#text-input')) $('#text-input').value = '';
  if ($('#file-input')) $('#file-input').value = '';
  updateTextCount();
  updateExpiryHelp();
  history.replaceState({}, '', '/');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal(id) { const el = $('#' + id); if (el && !el.open) el.showModal(); }
function closeModal(id) { const el = $('#' + id); if (el && el.open) el.close(); }

async function checkAuth() {
  try {
    const data = await api('/api/auth/me', { method: 'GET', headers: {} });
    state.authenticated = Boolean(data.authenticated);
    state.authConfigured = data.configured !== false;
  } catch {
    state.authConfigured = false;
  }
}

function openAuth() {
  $('#auth-error').textContent = state.authConfigured ? '' : 'Authentication is not configured on this deployment.';
  openModal('auth-dialog');
}

async function requireDashboardAccess() {
  if (state.authenticated) return true;
  openAuth();
  return false;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const loginId = $('#auth-id').value.trim();
  const passkey = $('#auth-pass').value;
  $('#auth-error').textContent = '';
  $('#auth-submit').disabled = true;
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ loginId, passkey }) });
    state.authenticated = true;
    $('#auth-pass').value = '';
    closeModal('auth-dialog');
    toast('Dashboard unlocked.');
  } catch (error) {
    $('#auth-error').textContent = error.message;
  } finally {
    $('#auth-submit').disabled = false;
  }
}

async function downloadZip() {
  if (!state.files.length && !state.texts.length) {
    toast('Nothing to download yet.', 'error');
    return;
  }
  const zip = new JSZip();
  toast('Preparing ZIP...');
  try {
    for (const file of state.files) {
      const response = await fetch(fileUrl(file), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not fetch ' + file.name);
      zip.file(file.name, await response.blob());
    }
    for (const text of state.texts) {
      const response = await fetch(textUrl(text), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not fetch text');
      zip.file('text-' + text.id + '.txt', await response.blob());
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pratilipi-files.zip';
    a.click();
    URL.revokeObjectURL(url);
    toast('ZIP downloaded.');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function setupEvents() {
  const zone = $('#drop-zone');
  $('#choose-files').onclick = () => $('#file-input').click();
  $('#file-input').onchange = (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    startUpload(files);
  };

  ['dragenter', 'dragover'].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.remove('dragover');
  }));
  zone.addEventListener('drop', (event) => startUpload([...event.dataTransfer.files]));

  document.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.items || [])].map((item) => item.kind === 'file' ? item.getAsFile() : null).filter(Boolean);
    if (files.length) {
      event.preventDefault();
      startUpload(files);
    }
  });

  $('#paste-files').onclick = async () => {
    if (!(await requireDashboardAccess())) return;
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        const type = item.types.find((value) => value.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        if (blob) files.push(new File([blob], 'clipboard-' + Date.now() + '.png', { type }));
      }
      if (files.length) openReview(files);
      else toast('No image files found in clipboard.', 'error');
    } catch {
      toast('Clipboard access was denied by the browser.', 'error');
    }
  };

  $('#text-input').oninput = updateTextCount;
  $('#save-text').onclick = saveText;
  $('.text-chip').forEach((chip) => chip.onclick = () => {
    if (!$('#text-input').value.trim()) {
      const kind = chip.dataset.template;
      $('#text-input').value = kind === 'Notes' ? '# Notes\\n\\n' : kind === 'Code' ? '// Code\\n\\n' : kind === 'Ideas' ? 'Ideas\\n\\n' : 'Content\\n\\n';
    }
    $('#text-input').focus();
    updateTextCount();
  });

  $('#cancel-upload').onclick = cancelUpload;
  $('#preview-files').onclick = () => { renderReadyFiles(); openModal('files-dialog'); };
  $('#copy-result-link').onclick = () => { if ($('#result-link').value) copyText($('#result-link').value); };
  $('#show-result-qr').onclick = () => { if ($('#result-link').value) showQr($('#result-link').value, 'Pratilipi share link'); };
  $('#download-zip').onclick = downloadZip;
  $('#confirm-upload').onclick = confirmUpload;
  $('#copy-qr-url').onclick = () => copyText($('#qr-url').value);

  $('#nav-home').onclick = () => { newDrop(); showView('home'); };
  $('#nav-active').onclick = openActive;
  $('#nav-about').onclick = () => openModal('about-dialog');
  $('#access-dashboard').onclick = () => state.authenticated ? toast('Dashboard is already unlocked.') : openAuth();
  $('#active-refresh').onclick = renderActive;
  $('#footer-active').onclick = openActive;
  $('#footer-new').onclick = () => { newDrop(); showView('home'); };
  $('#expiry-select').onchange = updateExpiryHelp;

  $('[data-close]').forEach((button) => button.onclick = () => closeModal(button.dataset.close));
  $('#toggle-pass').onclick = () => {
    const input = $('#auth-pass');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#toggle-pass').textContent = input.type === 'password' ? 'Show' : 'Hide';
  };
  $('#auth-form').onsubmit = handleAuthSubmit;
}

async function openDrop(dropId) {
  history.replaceState({}, '', `/u/${dropId}`);
  try {
    await loadDrop(dropId);
    showView('ready');
  } catch (error) {
    showView('home');
    toast(error.message, 'error');
  }
}

function startClock() {
  setInterval(() => {
    if (state.expiresAt && state.view === 'ready') {
      $('#ready-expiry-time').textContent = `Expires ${new Date(state.expiresAt).toLocaleString()} · ${formatRemaining(state.expiresAt)}`;
    }
    if (state.view === 'home') renderRecent();
  }, 30000);
  setInterval(async () => {
    if (state.dropId && state.view === 'ready' && !state.uploading) {
      try { await refreshDrop(); await renderReadyState(); } catch { /* next refresh will reconcile the state */ }
    }
  }, 20000);
}

async function boot() {
  renderShell();
  await checkAuth();
  setupEvents();
  const match = location.pathname.match(/^\/u\/([^/]+)\/?$/);
  if (match) {
    state.publicShare = true;
    try {
      await loadDrop(match[1]);
      $('#access-dashboard').style.display = 'none';
      $('#nav-active').style.display = 'none';
      $('#nav-about').style.display = 'none';
    } catch (error) {
      toast(error.message, 'error');
    }
  } else {
    newDrop();
  }
  startClock();
}

boot();
