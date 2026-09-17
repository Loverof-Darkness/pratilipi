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
  busy: 0,
  view: 'home'
};

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' })[char]);

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
  toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
}

function setBusy(delta) {
  state.busy = Math.max(0, state.busy + delta);
  document.body.classList.toggle('busy', state.busy > 0);
}

function renderShell() {
  document.title = 'प्रतिलिपि — Pratilipi';
  document.querySelector('#app').innerHTML = `
    <div class="space-bg" aria-hidden="true"><span class="nebula nebula-a"></span><span class="nebula nebula-b"></span><span class="stars stars-a"></span><span class="stars stars-b"></span></div>
    <main class="site-shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="Pratilipi home">
          <span class="brand-mark">✦</span>
          <span class="brand-word">प्रतिलिपि</span>
          <span class="brand-sub">Pratilipi</span>
        </a>
        <nav class="top-actions" aria-label="Primary">
          <button class="nav-pill" id="nav-active" type="button">Active uploads</button>
          <button class="nav-pill primary" id="new-drop" type="button">Send files</button>
        </nav>
      </header>

      <section id="home-view" class="home-view">
        <div class="hero-grid">
          <section class="upload-card">
            <div class="upload-head">
              <div>
                <p class="kicker">COPY · STORE · SHARE</p>
                <h1>Share files.<br /><span>Without the clutter.</span></h1>
              </div>
              <div class="status-dot" title="Ready"></div>
            </div>

            <div id="drop-zone" class="drop-zone" tabindex="0">
              <input id="file-input" type="file" multiple hidden />
              <div class="drop-orbit"><span>↑</span></div>
              <h2>Select files to send</h2>
              <p>Or drag stuff here</p>
              <button id="choose-files" class="select-btn" type="button">Select files</button>
              <small>Upload images, music, videos, documents and any other file type.</small>
            </div>

            <div class="quick-row">
              <button id="paste-files" class="quick-btn" type="button">Paste from clipboard</button>
              <button id="new-drop-inline" class="quick-btn" type="button">New drop</button>
            </div>

            <div class="privacy-strip">
              <div class="privacy-item"><span class="privacy-icon">◷</span><div><strong>Auto-delete</strong><small>Choose 1h to 1 month</small></div></div>
              <div class="privacy-item"><span class="privacy-icon">QR</span><div><strong>Phone ready</strong><small>Scan a QR to upload</small></div></div>
              <div class="privacy-item"><span class="privacy-icon">↗</span><div><strong>Direct links</strong><small>No dashboard after download</small></div></div>
            </div>
          </section>

          <aside class="side-panel">
            <div class="side-card share-card">
              <div class="side-card-head"><div><p class="kicker">CURRENT DROP</p><h2>Share your drop</h2></div><span class="live-badge">LIVE</span></div>
              <div class="share-link-box"><input id="session-url" readonly aria-label="Upload URL" placeholder="Create a drop to get a link" /><button id="copy-session" class="copy-btn" type="button">Copy</button></div>
              <div class="share-buttons"><button id="show-session-qr" class="share-btn" type="button">Show QR</button><button id="delete-drop" class="share-btn danger" type="button">Delete drop</button></div>
              <div class="expiry-row"><label for="expiry-select">Keep files for</label><select id="expiry-select">${Object.entries(EXPIRY_OPTIONS).map(([key, label]) => `<option value="${key}"${key === '1d' ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
              <p id="session-status" class="side-note">Create a drop by selecting a file.</p>
            </div>

            <div class="side-card text-card">
              <div class="side-card-head"><div><p class="kicker">TEXT</p><h2>Paste anything</h2></div><span class="text-badge">TXT</span></div>
              <textarea id="text-input" placeholder="Paste or type text here…"></textarea>
              <div class="text-actions"><span id="text-count">0 characters</span><button id="save-text" class="select-btn small" type="button">Save text</button></div>
              <div id="text-list" class="mini-results"></div>
            </div>
          </aside>
        </div>

        <section class="recent-section">
          <div class="section-title-row"><div><p class="kicker">RECENT SHARES</p><h2>Active uploads</h2></div><button id="open-active" class="text-btn" type="button">View all →</button></div>
          <div id="recent-list" class="recent-grid"></div>
        </section>

        <section class="upload-results" id="upload-results" hidden>
          <div class="section-title-row"><div><p class="kicker">YOUR FILES</p><h2>Ready to share</h2></div><span id="item-count" class="count-pill">0 items</span></div>
          <div class="result-card">
            <div class="file-column"><div id="file-list" class="file-list"></div></div>
            <div class="share-column"><p class="kicker">SHARE LINK</p><h3>Your files are ready.</h3><p class="muted">Anyone with the direct link can download the selected item.</p><div class="share-link-box big"><input id="result-link" readonly /><button id="copy-result-link" class="copy-btn">Copy</button></div><div class="share-buttons"><button id="show-result-qr" class="share-btn" type="button">Show QR</button><button id="delete-result-drop" class="share-btn danger" type="button">Delete all</button></div><div class="result-meta"><span>Expires</span><strong id="result-expiry">—</strong></div></div>
          </div>
        </section>
      </section>

      <section id="active-view" class="active-view" hidden>
        <div class="active-header"><div><p class="kicker">YOUR LOCAL HISTORY</p><h1>Active uploads</h1><p>Previous Drops from this browser. Expired or deleted Drops disappear automatically.</p></div><button id="active-refresh" class="share-btn" type="button">Refresh</button></div>
        <div id="active-list" class="active-grid"></div>
      </section>

      <footer class="footer">
        <div><strong>प्रतिलिपि</strong><span>Temporary sharing, simple by design.</span></div>
        <div class="footer-links"><a href="#home">Home</a><button id="footer-active" type="button">Active uploads</button><button id="footer-new" type="button">Send files</button></div>
      </footer>
    </main>

    <div id="upload-queue" class="upload-queue" aria-live="polite"></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <dialog id="qr-dialog" class="qr-dialog">
      <div class="dialog-inner"><button id="close-qr" class="close-btn" type="button" aria-label="Close">×</button><p class="kicker">SCAN WITH PHONE</p><h3 id="qr-title">Pratilipi QR</h3><canvas id="qr-canvas"></canvas><input id="qr-url" readonly /><button id="copy-qr-url" class="share-btn" type="button">Copy URL</button></div>
    </dialog>
  `;
}

async function createDrop(expiry = $('#expiry-select')?.value || '1d') {
  const data = await api('/api/drop', { method: 'POST', body: JSON.stringify({ label: 'Pratilipi drop', expiry }) });
  state.dropId = data.id;
  state.uploadUrl = data.uploadUrl;
  state.expiresAt = data.expiresAt;
  state.expiry = data.expiry;
  rememberDrop(data);
  $('#session-url').value = data.uploadUrl;
  $('#expiry-select').value = data.expiry;
  $('#session-status').textContent = `Ready · ${EXPIRY_OPTIONS[data.expiry]} · ${new Date(data.expiresAt).toLocaleString()}`;
  return data;
}

async function ensureDrop() {
  if (state.dropId) {
    try {
      const existing = await api(`/api/drop/${state.dropId}`);
      state.files = existing.files || [];
      state.texts = existing.texts || [];
      state.expiresAt = Number(existing.drop.expires_at);
      return;
    } catch {
      state.dropId = null;
    }
  }
  await createDrop($('#expiry-select').value || '1d');
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
  $('#session-url').value = state.uploadUrl;
  $('#expiry-select').value = state.expiry;
  $('#session-status').textContent = `Active · ${formatRemaining(state.expiresAt)} · expires ${new Date(state.expiresAt).toLocaleString()}`;
  renderResultState();
}

function renderFileList() {
  const list = $('#file-list');
  if (!list) return;
  if (!state.files.length) {
    list.innerHTML = `<div class="empty-state">No files uploaded yet.</div>`;
    return;
  }
  list.innerHTML = state.files.map((file) => {
    const url = `${PUBLIC_ORIGIN}/d/${encodeURIComponent(file.id)}`;
    return `<article class="file-row"><div class="file-icon">${esc(iconFor(file.content_type))}</div><div class="file-main"><strong title="${esc(file.name)}">${esc(file.name)}</strong><small>${formatBytes(Number(file.size))} · ${esc(file.content_type || file.format || 'file')}</small><div class="file-link"><input readonly value="${esc(url)}" /><button data-copy="${esc(url)}" type="button">Copy</button></div></div><div class="file-actions"><a class="open-link" href="${esc(url)}">Open</a><button data-qr="${esc(url)}" data-qr-title="${esc(file.name)}" type="button">QR</button><button data-delete-file="${esc(file.id)}" type="button">Delete</button></div></article>`;
  }).join('');
}

function renderTextList() {
  const list = $('#text-list');
  if (!list) return;
  if (!state.texts.length) {
    list.innerHTML = `<div class="mini-empty">Saved text appears here.</div>`;
    return;
  }
  list.innerHTML = state.texts.map((text) => {
    const url = `${PUBLIC_ORIGIN}/d/text/${encodeURIComponent(text.id)}`;
    return `<article class="mini-result"><div><strong>${esc(text.content.slice(0, 70))}${text.content.length > 70 ? '…' : ''}</strong><small>${text.content.length.toLocaleString()} characters</small></div><div><button data-copy="${esc(url)}" type="button">Copy</button><a href="${esc(url)}">Open</a><button data-delete-text="${esc(text.id)}" type="button">Delete</button></div></article>`;
  }).join('');
}

function renderResultState() {
  const hasItems = state.files.length + state.texts.length > 0;
  $('#upload-results').hidden = !hasItems;
  $('#result-link').value = state.files[0] ? `${PUBLIC_ORIGIN}/d/${state.files[0].id}` : (state.texts[0] ? `${PUBLIC_ORIGIN}/d/text/${state.texts[0].id}` : '');
  $('#result-expiry').textContent = state.expiresAt ? `${formatRemaining(state.expiresAt)} · ${new Date(state.expiresAt).toLocaleString()}` : '—';
  $('#item-count').textContent = `${state.files.length + state.texts.length} item${state.files.length + state.texts.length === 1 ? '' : 's'}`;
  renderFileList();
  renderTextList();
  bindDynamicActions();
}

function renderRecent() {
  const list = $('#recent-list');
  if (!list) return;
  const records = getHistory().filter((item) => Number(item.expiresAt) > Date.now()).slice(0, 4);
  if (!records.length) {
    list.innerHTML = `<div class="recent-empty">No recent Drops yet. Select a file to create your first one.</div>`;
    return;
  }
  list.innerHTML = records.map((item) => `<article class="recent-card"><div><span class="recent-label">DROP</span><strong>${esc(item.id.slice(0, 12))}…</strong><small>${esc(EXPIRY_OPTIONS[item.expiry] || item.expiry)} · ${formatRemaining(item.expiresAt)}</small></div><div class="recent-actions"><button data-open-recent="${esc(item.id)}" type="button">Open</button><button data-delete-recent="${esc(item.id)}" type="button">Delete</button></div></article>`).join('');
  list.querySelectorAll('[data-open-recent]').forEach((button) => button.onclick = () => openDrop(button.dataset.openRecent));
  list.querySelectorAll('[data-delete-recent]').forEach((button) => button.onclick = () => deleteEntireDrop(button.dataset.deleteRecent, false));
}

function renderActive() {
  const list = $('#active-list');
  if (!list) return;
  const records = getHistory();
  if (!records.length) {
    list.innerHTML = `<div class="empty-state large">No active uploads on this browser yet.</div>`;
    return;
  }
  list.innerHTML = records.map((item) => `<article class="active-card"><div><span class="recent-label">ACTIVE DROP</span><h3>${esc(item.id.slice(0, 16))}…</h3><p>${esc(EXPIRY_OPTIONS[item.expiry] || item.expiry)} · ${formatRemaining(item.expiresAt)}</p><small>${esc(item.uploadUrl)}</small></div><div class="active-actions"><button data-open-active="${esc(item.id)}" class="select-btn small" type="button">Open</button><button data-copy-active="${esc(item.uploadUrl)}" class="share-btn" type="button">Copy URL</button><button data-delete-active="${esc(item.id)}" class="share-btn danger" type="button">Delete all</button></div></article>`).join('');
  list.querySelectorAll('[data-open-active]').forEach((button) => button.onclick = () => openDrop(button.dataset.openActive));
  list.querySelectorAll('[data-copy-active]').forEach((button) => button.onclick = () => copyText(button.dataset.copyActive));
  list.querySelectorAll('[data-delete-active]').forEach((button) => button.onclick = () => deleteEntireDrop(button.dataset.deleteActive, false));
}

function showView(view) {
  state.view = view;
  const active = view === 'active';
  $('#home-view').hidden = active;
  $('#active-view').hidden = !active;
  $('#nav-active').classList.toggle('active', active);
  if (active) renderActive(); else renderRecent();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function uploadFile(file) {
  setBusy(1);
  const queue = $('#upload-queue');
  const item = document.createElement('div');
  item.className = 'queue-toast';
  item.innerHTML = `<strong>${esc(file.name)}</strong><span>Uploading…</span><i></i>`;
  queue.append(item);
  try {
    await ensureDrop();
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    form.append('folder', 'pratilipi');
    const response = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: form });
    const uploaded = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(uploaded.error?.message || `Cloudinary upload failed (${response.status})`);
    item.querySelector('i').style.width = '75%';
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
    item.querySelector('i').style.width = '100%';
    state.files.push(done.file);
    renderResultState();
    renderRecent();
    toast(`${file.name} uploaded`);
  } catch (error) {
    item.classList.add('error');
    item.querySelector('span').textContent = error.message;
    toast(error.message, 'error');
  } finally {
    setBusy(-1);
    setTimeout(() => item.remove(), 1500);
  }
}

async function saveText() {
  const content = $('#text-input').value;
  if (!content.trim()) return toast('Paste some text first.', 'error');
  setBusy(1);
  try {
    await ensureDrop();
    await api(`/api/drop/${state.dropId}/text`, { method: 'POST', body: JSON.stringify({ content }) });
    $('#text-input').value = '';
    updateTextCount();
    await refreshDrop();
    toast('Text saved');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(-1);
  }
}

async function refreshDrop() {
  if (!state.dropId) return;
  try {
    const data = await api(`/api/drop/${state.dropId}`);
    state.files = data.files || [];
    state.texts = data.texts || [];
    state.expiresAt = Number(data.drop.expires_at);
    state.expiry = data.drop.expiry_option || state.expiry;
    $('#session-url').value = state.uploadUrl;
    $('#expiry-select').value = state.expiry;
    $('#session-status').textContent = `Active · ${formatRemaining(state.expiresAt)} · expires ${new Date(state.expiresAt).toLocaleString()}`;
    renderResultState();
  } catch (error) {
    if (error.message.toLowerCase().includes('expired') || error.message.toLowerCase().includes('not found')) {
      forgetDrop(state.dropId);
      toast('This Drop has expired or was deleted.', 'error');
      state.dropId = null;
      state.files = [];
      state.texts = [];
      $('#upload-results').hidden = true;
      renderRecent();
    }
  }
}

async function deleteFile(fileId) {
  if (!window.confirm('Delete this file permanently?')) return;
  try {
    await api(`/api/drop/${state.dropId}/file/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    state.files = state.files.filter((file) => file.id !== fileId);
    renderResultState();
    toast('File deleted');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteText(textId) {
  if (!window.confirm('Delete this saved text permanently?')) return;
  try {
    await api(`/api/drop/${state.dropId}/text/${encodeURIComponent(textId)}`, { method: 'DELETE' });
    state.texts = state.texts.filter((text) => text.id !== textId);
    renderResultState();
    toast('Text deleted');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteEntireDrop(dropId, redirectHome = true) {
  if (!window.confirm('Delete this entire Drop? All files and saved text will be permanently deleted. This cannot be undone.')) return;
  try {
    await api(`/api/drop/${encodeURIComponent(dropId)}`, { method: 'DELETE' });
    forgetDrop(dropId);
    if (state.dropId === dropId) {
      state.dropId = null;
      state.files = [];
      state.texts = [];
      state.uploadUrl = null;
      $('#upload-results').hidden = true;
    }
    toast('Drop deleted');
    renderRecent();
    if (redirectHome) showView('home'); else renderActive();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function bindDynamicActions() {
  document.querySelectorAll('[data-copy]').forEach((button) => { button.onclick = () => copyText(button.dataset.copy); });
  document.querySelectorAll('[data-qr]').forEach((button) => { button.onclick = () => showQr(button.dataset.qr, button.dataset.qrTitle); });
  document.querySelectorAll('[data-delete-file]').forEach((button) => { button.onclick = () => deleteFile(button.dataset.deleteFile); });
  document.querySelectorAll('[data-delete-text]').forEach((button) => { button.onclick = () => deleteText(button.dataset.deleteText); });
}

function updateTextCount() {
  $('#text-count').textContent = `${$('#text-input').value.length.toLocaleString()} characters`;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast('Copied');
  } catch {
    toast('Clipboard permission was denied.', 'error');
  }
}

async function showQr(url, title = 'Pratilipi QR') {
  $('#qr-title').textContent = title;
  $('#qr-url').value = url;
  await QRCode.toCanvas($('#qr-canvas'), url, { width: 260, margin: 2, color: { dark: '#f9f6ff', light: '#181020' } });
  $('#qr-dialog').showModal();
}

function newDrop() {
  state.dropId = null;
  state.uploadUrl = null;
  state.expiresAt = null;
  state.files = [];
  state.texts = [];
  $('#session-url').value = '';
  $('#session-status').textContent = 'New Drop · select a file to create it.';
  $('#upload-results').hidden = true;
  renderRecent();
}

function setupEvents() {
  $('#choose-files').onclick = () => $('#file-input').click();
  $('#file-input').onchange = (event) => [...event.target.files].forEach(uploadFile);

  const zone = $('#drop-zone');
  ['dragenter', 'dragover'].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', (event) => [...event.dataTransfer.files].forEach(uploadFile));
  zone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') $('#file-input').click(); });

  document.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.items || [])].map((item) => item.kind === 'file' ? item.getAsFile() : null).filter(Boolean);
    if (files.length) { event.preventDefault(); files.forEach(uploadFile); return; }
    const text = event.clipboardData?.getData('text/plain');
    if (text && document.activeElement !== $('#text-input')) {
      $('#text-input').focus();
      $('#text-input').setRangeText(text, $('#text-input').selectionStart, $('#text-input').selectionEnd, 'end');
      updateTextCount();
    }
  });

  $('#paste-files').onclick = async () => {
    try {
      const items = await navigator.clipboard.read();
      let found = false;
      for (const item of items) {
        for (const type of item.types) {
          if (!type.startsWith('image/')) continue;
          const blob = await item.getType(type);
          const ext = type.split('/')[1] || 'png';
          uploadFile(new File([blob], `clipboard-${Date.now()}.${ext}`, { type }));
          found = true;
        }
      }
      if (!found) toast('No image files found in clipboard.', 'error');
    } catch {
      toast('Clipboard access was denied by the browser.', 'error');
    }
  };

  $('#save-text').onclick = saveText;
  $('#text-input').oninput = updateTextCount;
  $('#copy-session').onclick = () => $('#session-url').value && copyText($('#session-url').value);
  $('#show-session-qr').onclick = () => $('#session-url').value && showQr($('#session-url').value, 'Phone upload');
  $('#delete-drop').onclick = () => state.dropId && deleteEntireDrop(state.dropId);
  $('#delete-result-drop').onclick = () => state.dropId && deleteEntireDrop(state.dropId);
  $('#copy-result-link').onclick = () => $('#result-link').value && copyText($('#result-link').value);
  $('#show-result-qr').onclick = () => $('#result-link').value && showQr($('#result-link').value, 'Download QR');
  $('#expiry-select').onchange = () => { if (state.dropId) toast('Expiry is fixed for an existing Drop. Use New drop for a different duration.'); };
  $('#new-drop').onclick = () => { newDrop(); showView('home'); };
  $('#new-drop-inline').onclick = () => { newDrop(); showView('home'); };
  $('#open-active').onclick = () => showView('active');
  $('#nav-active').onclick = () => showView('active');
  $('#footer-active').onclick = () => showView('active');
  $('#footer-new').onclick = () => { newDrop(); showView('home'); };
  $('#active-refresh').onclick = renderActive;
  $('#close-qr').onclick = () => $('#qr-dialog').close();
  $('#copy-qr-url').onclick = () => copyText($('#qr-url').value);
}

async function openDrop(dropId) {
  showView('home');
  history.replaceState({}, '', `/u/${dropId}`);
  try {
    await loadDrop(dropId);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function boot() {
  renderShell();
  setupEvents();
  renderRecent();
  const match = location.pathname.match(/\/u\/([^/]+)/);
  if (match) {
    try {
      await loadDrop(match[1]);
    } catch (error) {
      $('#session-status').textContent = error.message;
      toast(error.message, 'error');
    }
  } else {
    newDrop();
  }
  setInterval(refreshDrop, 20000);
  setInterval(() => {
    if (state.expiresAt) $('#session-status').textContent = `Active · ${formatRemaining(state.expiresAt)} · expires ${new Date(state.expiresAt).toLocaleString()}`;
    renderRecent();
  }, 30000);
}

boot();
