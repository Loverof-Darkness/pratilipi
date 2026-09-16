import QRCode from 'qrcode';
import './styles.css';

const state = {
  dropId: null,
  uploadUrl: null,
  files: [],
  texts: [],
  busy: 0,
  poller: null,
  tab: 'files'
};

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' })[char]);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function iconFor(type) {
  if (type?.startsWith('image/')) return '▧';
  if (type?.startsWith('audio/')) return '♫';
  if (type?.startsWith('video/')) return '▶';
  if (type?.startsWith('text/')) return 'T';
  if (type?.includes('pdf')) return 'PDF';
  return 'FILE';
}

function renderShell() {
  document.title = 'प्रतिलिपि — Pratilipi';
  document.querySelector('#app').innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="Pratilipi home">
          <span class="brand-devanagari">प्रतिलिपि</span>
          <span class="brand-latin">Pratilipi</span>
        </a>
        <button id="new-drop" class="ghost-btn" type="button">New Drop</button>
      </header>
      <section class="hero">
        <div>
          <p class="eyebrow">COPY · STORE · SHARE</p>
          <h1>Send anything.<br /><span>From anywhere.</span></h1>
          <p class="hero-copy">Upload files, paste text, scan a QR from your phone, and create direct download links without exposing a storage dashboard.</p>
        </div>
        <div class="session-card">
          <div class="session-label">Current upload session</div>
          <div class="session-url-row">
            <input id="session-url" readonly aria-label="Upload session URL" />
            <button id="copy-session" class="icon-btn" title="Copy upload URL" type="button">Copy</button>
          </div>
          <button id="show-session-qr" class="secondary-btn" type="button">Show QR for phone upload</button>
          <p id="session-status" class="muted">Creating secure session…</p>
        </div>
      </section>

      <nav class="tabs" aria-label="Pratilipi sections">
        <button class="tab active" data-tab="files" type="button">Files & media</button>
        <button class="tab" data-tab="text" type="button">Text paste</button>
      </nav>

      <section id="panel-files" class="panel active-panel">
        <div id="drop-zone" class="drop-zone" tabindex="0">
          <input id="file-input" type="file" multiple hidden />
          <div class="drop-icon">＋</div>
          <h2>Drop files here</h2>
          <p>Drag & drop, paste from clipboard, or choose files directly.</p>
          <button id="choose-files" class="primary-btn" type="button">Choose files</button>
          <span class="helper">Images · songs · videos · PDFs · archives · any file type</span>
        </div>
        <div id="upload-queue" class="queue"></div>
      </section>

      <section id="panel-text" class="panel">
        <div class="text-card">
          <textarea id="text-input" placeholder="Paste or type anything here…"></textarea>
          <div class="text-toolbar">
            <span id="text-count">0 characters</span>
            <button id="save-text" class="primary-btn" type="button">Save & create link</button>
          </div>
        </div>
        <div id="text-list" class="result-list"></div>
      </section>

      <section class="results-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">SHAREABLE OUTPUTS</p>
            <h2>Direct download links</h2>
          </div>
          <span id="item-count" class="count-pill">0 items</span>
        </div>
        <div id="file-list" class="result-list"></div>
      </section>

      <footer class="footer">Pratilipi · Unlisted links · Cloudflare Pages + R2</footer>
    </main>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <dialog id="qr-dialog" class="qr-dialog">
      <div class="dialog-inner">
        <button id="close-qr" class="close-btn" aria-label="Close" type="button">×</button>
        <p class="eyebrow">SCAN WITH PHONE</p>
        <h3 id="qr-title">Pratilipi QR</h3>
        <canvas id="qr-canvas"></canvas>
        <input id="qr-url" readonly />
        <button id="copy-qr-url" class="secondary-btn" type="button">Copy URL</button>
      </div>
    </dialog>
  `;
}

function toast(message, kind = 'normal') {
  const el = $('#toast');
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function createDrop() {
  const data = await api('/api/drop', { method: 'POST', body: JSON.stringify({ label: 'Pratilipi drop' }) });
  state.dropId = data.id;
  state.uploadUrl = data.uploadUrl;
  history.replaceState({}, '', `/u/${data.id}`);
  $('#session-url').value = data.uploadUrl;
  $('#session-status').textContent = 'Ready · Share this upload URL or scan its QR.';
}

async function loadDrop(dropId) {
  state.dropId = dropId;
  state.uploadUrl = `${location.origin}/u/${dropId}`;
  $('#session-url').value = state.uploadUrl;
  try {
    const data = await api(`/api/drop/${dropId}`);
    state.files = data.files || [];
    state.texts = data.texts || [];
    $('#session-status').textContent = data.drop?.expires_at ? `Active · expires ${new Date(Number(data.drop.expires_at)).toLocaleString()}` : 'Active session';
    renderResults();
  } catch (error) {
    $('#session-status').textContent = error.message;
    toast(error.message, 'error');
  }
}

function setBusy(delta) {
  state.busy = Math.max(0, state.busy + delta);
  document.body.classList.toggle('busy', state.busy > 0);
}

async function uploadFile(file) {
  setBusy(1);
  const queue = $('#upload-queue');
  const item = document.createElement('div');
  item.className = 'queue-item';
  item.innerHTML = `<div><strong>${esc(file.name)}</strong><span>${formatBytes(file.size)}</span></div><div class="progress"><i></i></div>`;
  queue.prepend(item);
  const bar = item.querySelector('i');
  try {
    const signed = await api(`/api/drop/${state.dropId}/presign`, {
      method: 'POST',
      body: JSON.stringify({ name: file.name, contentType: file.type || 'application/octet-stream' })
    });
    const put = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!put.ok) throw new Error(`R2 upload failed (${put.status})`);
    bar.style.width = '85%';
    const done = await api(`/api/drop/${state.dropId}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        fileId: signed.fileId,
        key: signed.key,
        name: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size
      })
    });
    bar.style.width = '100%';
    item.classList.add('done');
    state.files.push(done.file);
    renderResults();
    toast(`${file.name} uploaded`);
  } catch (error) {
    item.classList.add('failed');
    item.querySelector('.progress').insertAdjacentHTML('afterend', `<small>${esc(error.message)}</small>`);
    toast(error.message, 'error');
  } finally {
    setBusy(-1);
  }
}

function queueFiles(fileList) {
  [...fileList].forEach(uploadFile);
}

async function saveText() {
  const textarea = $('#text-input');
  const content = textarea.value;
  if (!content.trim()) return toast('Paste some text first.', 'error');
  setBusy(1);
  try {
    await api(`/api/drop/${state.dropId}/text`, { method: 'POST', body: JSON.stringify({ content }) });
    textarea.value = '';
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
    renderResults();
  } catch { /* keep current view during transient poll failures */ }
}

function renderResults() {
  const fileList = $('#file-list');
  const textList = $('#text-list');
  const allCount = state.files.length + state.texts.length;
  $('#item-count').textContent = `${allCount} item${allCount === 1 ? '' : 's'}`;

  fileList.innerHTML = state.files.length ? state.files.map((file) => `
    <article class="result-card" data-file-id="${esc(file.id)}">
      <div class="result-icon">${esc(iconFor(file.content_type))}</div>
      <div class="result-main">
        <strong title="${esc(file.name)}">${esc(file.name)}</strong>
        <span>${formatBytes(Number(file.size))} · ${esc(file.content_type || 'file')}</span>
        <div class="link-row"><input readonly value="${esc(`${location.origin}/d/${file.id}`)}" /><button data-copy="${esc(`${location.origin}/d/${file.id}`)}" type="button">Copy</button></div>
      </div>
      <div class="result-actions"><a class="download-btn" href="/d/${encodeURIComponent(file.id)}">Download</a><button data-qr="${esc(`${location.origin}/d/${file.id}`)}" data-qr-title="${esc(file.name)}" class="mini-btn" type="button">QR</button><button data-delete="${esc(file.id)}" class="mini-btn danger" type="button">Delete</button></div>
    </article>`).join('') : `<div class="empty-state">No files yet. Drop, paste, or choose a file to get a direct download link.</div>`;

  textList.innerHTML = state.texts.length ? state.texts.map((text) => `
    <article class="result-card text-result">
      <div class="result-icon">T</div>
      <div class="result-main"><strong>Text snippet</strong><span>${esc(text.content.slice(0, 140))}${text.content.length > 140 ? '…' : ''}</span><div class="link-row"><input readonly value="${esc(`${location.origin}/d/text/${text.id}`)}" /><button data-copy="${esc(`${location.origin}/d/text/${text.id}`)}" type="button">Copy</button></div></div>
      <div class="result-actions"><a class="download-btn" href="/d/text/${encodeURIComponent(text.id)}">Download</a><button data-qr="${esc(`${location.origin}/d/text/${text.id}`)}" data-qr-title="Text download" class="mini-btn" type="button">QR</button></div>
    </article>`).join('') : `<div class="empty-state">Your saved text snippets will appear here.</div>`;

  fileList.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', () => copyText(button.dataset.copy)));
  fileList.querySelectorAll('[data-qr]').forEach((button) => button.addEventListener('click', () => showQr(button.dataset.qr, button.dataset.qrTitle)));
  fileList.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => deleteFile(button.dataset.delete)));
  textList.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', () => copyText(button.dataset.copy)));
  textList.querySelectorAll('[data-qr]').forEach((button) => button.addEventListener('click', () => showQr(button.dataset.qr, button.dataset.qrTitle)));
}

async function deleteFile(fileId) {
  try {
    await api(`/api/drop/${state.dropId}/file/${fileId}`, { method: 'DELETE', body: JSON.stringify({}) });
    state.files = state.files.filter((file) => file.id !== fileId);
    renderResults();
    toast('File deleted');
  } catch (error) { toast(error.message, 'error'); }
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
  const dialog = $('#qr-dialog');
  $('#qr-title').textContent = title;
  $('#qr-url').value = url;
  const canvas = $('#qr-canvas');
  await QRCode.toCanvas(canvas, url, { width: 260, margin: 2, color: { dark: '#f4f7fb', light: '#0b0f16' } });
  dialog.showModal();
}

function updateTextCount() {
  $('#text-count').textContent = `${$('#text-input').value.length.toLocaleString()} characters`;
}

function setupEvents() {
  $('#choose-files').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (event) => queueFiles(event.target.files));
  const zone = $('#drop-zone');
  ['dragenter', 'dragover'].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', (event) => queueFiles(event.dataTransfer.files));
  zone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') $('#file-input').click(); });
  document.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.items || [])].map((item) => item.kind === 'file' ? item.getAsFile() : null).filter(Boolean);
    if (files.length) { event.preventDefault(); queueFiles(files); return; }
    const text = event.clipboardData?.getData('text/plain');
    if (text && document.activeElement !== $('#text-input')) { $('#text-input').focus(); $('#text-input').setRangeText(text, $('#text-input').selectionStart, $('#text-input').selectionEnd, 'end'); updateTextCount(); }
  });
  $('#text-input').addEventListener('input', updateTextCount);
  $('#save-text').addEventListener('click', saveText);
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    state.tab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
    $('#panel-files').classList.toggle('active-panel', state.tab === 'files');
    $('#panel-text').classList.toggle('active-panel', state.tab === 'text');
  }));
  $('#copy-session').addEventListener('click', () => copyText(state.uploadUrl));
  $('#show-session-qr').addEventListener('click', () => showQr(state.uploadUrl, 'Upload from phone'));
  $('#copy-qr-url').addEventListener('click', () => copyText($('#qr-url').value));
  $('#close-qr').addEventListener('click', () => $('#qr-dialog').close());
  $('#new-drop').addEventListener('click', async () => {
    try { await createDrop(); await refreshDrop(); toast('New drop created'); } catch (error) { toast(error.message, 'error'); }
  });
}

async function boot() {
  renderShell();
  setupEvents();
  const match = location.pathname.match(/^\/u\/([^/]+)/);
  try {
    if (match) await loadDrop(match[1]);
    else { await createDrop(); await refreshDrop(); }
  } catch (error) {
    $('#session-status').textContent = error.message;
    toast(error.message, 'error');
  }
  state.poller = setInterval(refreshDrop, 4000);
}

boot();
