import QRCode from 'qrcode';
import './styles.css';

const API_BASE = (import.meta.env.VITE_API_ORIGIN || location.origin).replace(/\/$/, '');
const PUBLIC_ORIGIN = API_BASE;
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
  batchId: 0
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
  document.title = 'प्रतिलिपि — Pratilipi';
  document.querySelector('#app').innerHTML = `
    <div class="space-bg" aria-hidden="true">
      <span class="warp warp-a"></span><span class="warp warp-b"></span><span class="warp warp-c"></span>
      <span class="stars stars-a"></span><span class="stars stars-b"></span><span class="dust"></span>
    </div>
    <main class="site-shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="Pratilipi home">
          <span class="brand-mark"><span>✦</span></span>
          <span><strong class="brand-word">प्रतिलिपि</strong><small class="brand-sub">Pratilipi</small></span>
        </a>
        <nav class="top-actions" aria-label="Primary">
          <button class="nav-pill" id="nav-active" type="button">Active uploads</button>
          <button class="nav-pill primary" id="new-drop" type="button">Send files</button>
        </nav>
      </header>

      <section id="home-view" class="home-view">
        <div class="home-intro">
          <p class="eyebrow">PRIVATE · TEMPORARY · SIMPLE</p>
          <h1>Send files through<br /><span>your own wormhole.</span></h1>
          <p class="intro-copy">Drop anything here, watch it travel, then share one clean link.</p>
        </div>

        <section class="wormhole-card" id="upload-card">
          <div class="card-topline">
            <span class="tiny-state"><i></i> Ready to send</span>
            <label class="expiry-picker"><span>Keep for</span><select id="expiry-select" aria-label="Keep files for">${Object.entries(EXPIRY_OPTIONS).map(([key, label]) => `<option value="${key}"${key === '1d' ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
          </div>

          <div id="drop-zone" class="drop-zone" tabindex="0" role="button" aria-label="Select files to send">
            <input id="file-input" type="file" multiple hidden />
            <div class="wormhole-orbit" aria-hidden="true"><span class="orbit-core">↑</span><i class="orbit-ring ring-1"></i><i class="orbit-ring ring-2"></i><i class="orbit-ring ring-3"></i></div>
            <h2>Select files to send</h2>
            <p>Or drag stuff here</p>
            <button id="choose-files" class="cta" type="button">Select files</button>
            <small>Paste files with Ctrl/⌘+V · multiple files supported · no account needed</small>
          </div>

          <div class="quick-tools">
            <button id="paste-files" class="soft-btn" type="button"><span>⌘</span> Paste from clipboard</button>
            <button id="paste-text-toggle" class="soft-btn" type="button"><span>T</span> Paste text</button>
            <button id="new-drop-inline" class="soft-btn" type="button"><span>↻</span> New drop</button>
          </div>

          <div class="privacy-row">
            <div><b>Auto-expires</b><span id="expiry-help">After 24 hours</span></div>
            <div><b>Direct download</b><span>No dashboard on file links</span></div>
            <div><b>QR ready</b><span>Open from your phone</span></div>
          </div>

          <div id="upload-progress" class="upload-progress" hidden>
            <div class="progress-head"><strong>Sending your files</strong><span id="progress-total">0%</span></div>
            <div class="progress-track"><i id="progress-bar"></i></div>
            <div id="upload-queue" class="upload-queue"></div>
          </div>
        </section>

        <section id="text-panel" class="utility-card" hidden>
          <div class="utility-head"><div><p class="eyebrow">TEXT DROP</p><h2>Paste anything</h2></div><button id="paste-text-close" class="icon-btn" type="button">×</button></div>
          <textarea id="text-input" placeholder="Paste or type text here…"></textarea>
          <div class="utility-footer"><span id="text-count">0 characters</span><button id="save-text" class="cta small" type="button">Save text</button></div>
          <div id="text-list" class="mini-results"></div>
        </section>

        <section class="recent-section">
          <div class="section-heading"><div><p class="eyebrow">ON THIS DEVICE</p><h2>Recent drops</h2></div><button id="open-active" class="text-button" type="button">View all →</button></div>
          <div id="recent-list" class="recent-grid"></div>
        </section>
      </section>

      <section id="ready-view" class="ready-view" hidden>
        <div class="ready-card" id="ready-card">
          <span class="ready-glow"></span>
          <p class="eyebrow">YOUR FILES ARE READY</p>
          <div class="ready-icon" aria-hidden="true"><span>✓</span></div>
          <h1>Your files are<br /><span>ready to share.</span></h1>
          <p class="ready-sub">Copy the link to share your Drop.</p>
          <div class="ready-link-row"><input id="result-link" readonly aria-label="Share link" /><button id="copy-result-link" class="cta" type="button">Copy link</button></div>
          <div class="ready-actions"><button id="share-result" class="ready-btn" type="button">Share</button><button id="show-result-qr" class="ready-btn" type="button">Show QR</button><button id="preview-files" class="ready-btn" type="button">Preview files</button></div>
          <div class="ready-statuses">
            <div class="status-badge"><span class="check green">✓</span><div><strong>Uploaded</strong><small>Files are online and ready</small></div></div>
            <div class="status-badge"><span class="check blue">✓</span><div><strong id="ready-expiry-label">Expires in 24 hours</strong><small id="ready-expiry-time">Auto-delete is enabled</small></div></div>
          </div>
          <div class="ready-toolbar"><button id="send-more" class="cta" type="button">Send more files</button><button id="delete-result-drop" class="ready-danger" type="button">Delete this Drop</button></div>
          <div id="ready-files" class="ready-files" hidden></div>
        </div>
      </section>

      <section id="active-view" class="active-view" hidden>
        <div class="active-header"><div><p class="eyebrow">YOUR LOCAL HISTORY</p><h1>Active uploads</h1><p>Pratilipi rechecks these Drops with the server when you open this list.</p></div><button id="active-refresh" class="ready-btn" type="button">Refresh</button></div>
        <div id="active-list" class="active-grid"></div>
      </section>

      <footer class="footer"><div><strong>प्रतिलिपि</strong><span>Temporary sharing, simple by design.</span></div><div class="footer-links"><a href="/">Home</a><button id="footer-active" type="button">Active uploads</button><button id="footer-new" type="button">Send files</button></div></footer>
    </main>

    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <dialog id="qr-dialog" class="qr-dialog"><div class="dialog-inner"><button id="close-qr" class="close-btn" type="button" aria-label="Close">×</button><p class="eyebrow">SCAN WITH PHONE</p><h3 id="qr-title">Pratilipi QR</h3><canvas id="qr-canvas"></canvas><input id="qr-url" readonly /><div class="dialog-actions"><button id="copy-qr-url" class="ready-btn" type="button">Copy URL</button><button id="close-qr-bottom" class="ready-btn" type="button">Done</button></div></div></dialog>
  `;
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

async function cloudinaryUpload(file, onProgress) {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', 'pratilipi');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_UPLOAD_URL);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    };
    xhr.onerror = () => reject(new Error('Network error while uploading to Cloudinary.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.onload = () => {
      const payload = xhr.response || (() => { try { return JSON.parse(xhr.responseText || '{}'); } catch { return {}; } })();
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new Error(payload.error?.message || `Cloudinary upload failed (${xhr.status})`));
    };
    xhr.send(form);
  });
}

async function uploadOne(file, row) {
  try {
    await ensureDrop();
    updateQueueItem(row, 0, 'Uploading…');
    const uploaded = await cloudinaryUpload(file, (pct) => updateQueueItem(row, pct, `Uploading · ${Math.round(pct)}%`));
    updateQueueItem(row, 100, 'Registering…');
    const done = await api(`/api/drop/${state.dropId}/complete`, {
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
    state.files.push(done.file);
    updateQueueItem(row, 100, 'Uploaded');
    row.classList.add('done');
    return done.file;
  } catch (error) {
    updateQueueItem(row, 0, error.message);
    row.classList.add('error');
    return null;
  }
}

async function startUploadBatch(files) {
  const valid = files.filter((file) => file instanceof File && file.size >= 0);
  if (!valid.length || state.uploading) return;

  const batch = ++state.batchId;
  setBusy(1);
  setMode('uploading');
  $('#upload-progress').hidden = false;
  $('#upload-queue').innerHTML = '';
  $('#progress-total').textContent = `0 / ${valid.length}`;
  $('#progress-bar').style.width = '0%';
  valid.forEach(addQueueItem);
  const rows = $$('#upload-queue .queue-item');

  try {
    await ensureDrop();
    let completed = 0;
    await Promise.all(valid.map(async (file, index) => {
      await uploadOne(file, rows[index]);
      completed += 1;
      setProgress((completed / valid.length) * 100, `${completed} / ${valid.length}`);
    }));

    if (batch !== state.batchId) return;
    await refreshDrop();
    $('#upload-progress').hidden = true;
    if (state.files.length + state.texts.length) {
      await renderReadyState();
      toast(completed === valid.length ? 'Drop ready to share.' : 'Some files could not be uploaded.', completed === valid.length ? 'normal' : 'error');
    } else {
      setMode('home');
      toast('No files were uploaded.', 'error');
    }
  } catch (error) {
    $('#upload-progress').hidden = true;
    setMode('home');
    toast(error.message, 'error');
  } finally {
    setBusy(-1);
  }
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
  bindDynamicActions();
}

async function renderReadyState() {
  if (!state.files.length && !state.texts.length) return;
  setMode('ready');
  $('#home-view').hidden = true;
  $('#active-view').hidden = true;
  $('#ready-view').hidden = false;
  const mainLink = state.files[0] ? fileUrl(state.files[0]) : textUrl(state.texts[0]);
  $('#result-link').value = mainLink;
  const expiryLabel = EXPIRY_OPTIONS[state.expiry] || state.expiry;
  $('#ready-expiry-label').textContent = `Expires in ${expiryLabel.toLowerCase()}`;
  $('#ready-expiry-time').textContent = state.expiresAt ? new Date(state.expiresAt).toLocaleString() : 'Auto-delete is enabled';
  $('#ready-card').classList.remove('reveal');
  requestAnimationFrame(() => $('#ready-card').classList.add('reveal'));
  renderReadyFiles();
  renderTextList();
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
  const active = view === 'active';
  const ready = view === 'ready';
  $('#home-view').hidden = active || ready;
  $('#ready-view').hidden = !ready;
  $('#active-view').hidden = !active;
  $('#nav-active').classList.toggle('active', active);
  setMode(ready ? 'ready' : active ? 'home' : 'home');
  if (active) renderActive();
  else if (!ready) renderRecent();
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
  if ($('#expiry-select')) {
    $('#expiry-select').disabled = false;
    $('#expiry-select').value = '1d';
  }
  $('#home-view').hidden = false;
  $('#ready-view').hidden = true;
  $('#active-view').hidden = true;
  $('#text-panel').hidden = true;
  $('#upload-progress').hidden = true;
  $('#file-input').value = '';
  setMode('home');
  updateExpiryHelp();
  history.replaceState({}, '', '/');
  renderRecent();
}

function setupEvents() {
  const zone = $('#drop-zone');
  $('#choose-files').onclick = () => $('#file-input').click();
  $('#file-input').onchange = (event) => startUploadBatch([...event.target.files]);

  ['dragenter', 'dragover'].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.add('dragover');
    setMode('dragover');
  }));
  ['dragleave', 'drop'].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.remove('dragover');
    if (!state.uploading) setMode('home');
  }));
  zone.addEventListener('drop', (event) => startUploadBatch([...event.dataTransfer.files]));
  zone.addEventListener('keydown', (event) => {
    if (event.target !== zone) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#file-input').click(); }
  });

  document.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.items || [])].map((item) => item.kind === 'file' ? item.getAsFile() : null).filter(Boolean);
    if (files.length) { event.preventDefault(); startUploadBatch(files); return; }
    const text = event.clipboardData?.getData('text/plain');
    if (text && document.activeElement !== $('#text-input')) {
      toggleTextPanel(true);
      $('#text-input').focus();
      $('#text-input').setRangeText(text, $('#text-input').selectionStart, $('#text-input').selectionEnd, 'end');
      updateTextCount();
    }
  });

  $('#paste-files').onclick = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        const type = item.types.find((value) => value.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        if (blob) files.push(new File([blob], `clipboard-${Date.now()}.${type.split('/')[1] || 'png'}`, { type }));
      }
      if (files.length) startUploadBatch(files);
      else toast('No files found in clipboard.', 'error');
    } catch {
      toast('Clipboard access was denied by the browser.', 'error');
    }
  };

  $('#paste-text-toggle').onclick = () => toggleTextPanel(true);
  $('#paste-text-close').onclick = () => toggleTextPanel(false);
  $('#save-text').onclick = saveText;
  $('#text-input').oninput = updateTextCount;
  $('#copy-result-link').onclick = () => copyText($('#result-link').value);
  $('#share-result').onclick = shareCurrentDrop;
  $('#show-result-qr').onclick = () => $('#result-link').value && showQr($('#result-link').value, 'Pratilipi share link');
  $('#preview-files').onclick = () => { $('#ready-files').hidden = !$('#ready-files').hidden; if (!$('#ready-files').hidden) $('#ready-files').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  $('#send-more').onclick = () => { newDrop(); showView('home'); };
  $('#delete-result-drop').onclick = () => state.dropId && deleteEntireDrop(state.dropId, true);
  $('#expiry-select').onchange = updateExpiryHelp;
  $('#new-drop').onclick = () => { newDrop(); showView('home'); };
  $('#new-drop-inline').onclick = () => { newDrop(); showView('home'); };
  $('#open-active').onclick = () => showView('active');
  $('#nav-active').onclick = () => showView('active');
  $('#footer-active').onclick = () => showView('active');
  $('#footer-new').onclick = () => { newDrop(); showView('home'); };
  $('#active-refresh').onclick = renderActive;
  $('#close-qr').onclick = () => $('#qr-dialog').close();
  $('#close-qr-bottom').onclick = () => $('#qr-dialog').close();
  $('#copy-qr-url').onclick = () => copyText($('#qr-url').value);
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
  setupEvents();
  await renderRecent();
  const match = location.pathname.match(/\/u\/([^/]+)/);
  if (match) {
    try {
      await loadDrop(match[1]);
      showView('ready');
    } catch (error) {
      showView('home');
      toast(error.message, 'error');
    }
  } else {
    newDrop();
  }
  startClock();
}

boot();
