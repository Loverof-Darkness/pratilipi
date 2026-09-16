import QRCode from 'qrcode';
import './styles.css';

const API_BASE = (import.meta.env.VITE_API_ORIGIN || location.origin).replace(/\/$/, '');
const PUBLIC_ORIGIN = API_BASE;
const CLOUDINARY_CLOUD_NAME = 's7aopw6x';
const CLOUDINARY_UPLOAD_PRESET = 'pratilipi';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
const EXPIRY_OPTIONS = { '1h': '1 Hour', '12h': '12 Hours', '1d': '1 Day', '1w': '1 Week', '1m': '1 Month' };
const HISTORY_KEY = 'pratilipi.activeUploads.v1';

const state = { dropId: null, uploadUrl: null, expiresAt: null, expiry: '1d', files: [], texts: [], busy: 0 };
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' })[char]);
function apiUrl(path) { return `${API_BASE}${path}`; }

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function formatBytes(bytes) { if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function formatRemaining(expiresAt) { const ms = Number(expiresAt) - Date.now(); if (ms <= 0) return 'Expired'; const minutes = Math.ceil(ms / 60000); if (minutes < 60) return `${minutes}m left`; const hours = Math.floor(minutes / 60); if (hours < 48) return `${hours}h ${minutes % 60}m left`; const days = Math.floor(hours / 24); return `${days}d ${hours % 24}h left`; }
function iconFor(type) { if (type?.startsWith('image/')) return '▧'; if (type?.startsWith('audio/')) return '♫'; if (type?.startsWith('video/')) return '▶'; if (type?.includes('pdf')) return 'PDF'; if (type?.startsWith('text/')) return 'T'; return 'FILE'; }
function history() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
function saveHistory(items) { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50))); }
function rememberDrop(data) { const items = history().filter((item) => item.id !== data.id); items.unshift({ id: data.id, uploadUrl: data.uploadUrl || `${PUBLIC_ORIGIN}/u/${data.id}`, expiresAt: data.expiresAt, expiry: data.expiry || data.expiry_option || '1d', createdAt: data.createdAt || Date.now() }); saveHistory(items); }
function forgetDrop(id) { saveHistory(history().filter((item) => item.id !== id)); }

function renderShell() {
  document.title = 'प्रतिलिपि — Pratilipi';
  document.querySelector('#app').innerHTML = `
    <main class="app-shell">
      <header class="topbar"><a class="brand" href="/" aria-label="Pratilipi home"><span class="brand-devanagari">प्रतिलिपि</span><span class="brand-latin">Pratilipi</span></a><nav class="top-nav"><button id="nav-home" class="nav-btn active" type="button">Home</button><button id="nav-active" class="nav-btn" type="button">Active Uploads</button></nav><button id="new-drop" class="ghost-btn" type="button">New Upload</button></header>
      <section id="home-view">
        <section class="hero"><div><p class="eyebrow">COPY · STORE · SHARE</p><h1>Send anything.<br /><span>From anywhere.</span></h1><p class="hero-copy">Upload files, paste text, scan a QR from your phone, and create direct download links.</p></div><div class="session-card"><div class="session-label">Current upload session</div><div class="session-url-row"><input id="session-url" readonly aria-label="Upload session URL" /><button id="copy-session" class="icon-btn" type="button">Copy</button></div><div class="expiry-row"><label for="expiry-select">Keep files for</label><select id="expiry-select">${Object.entries(EXPIRY_OPTIONS).map(([key, label]) => `<option value="${key}"${key === '1d' ? ' selected' : ''}>${label}</option>`).join('')}</select></div><button id="show-session-qr" class="secondary-btn" type="button">Show QR for phone upload</button><p id="session-status" class="muted">Creating secure session…</p></div></section>
        <nav class="tabs"><button class="tab active" data-tab="files" type="button">Files & media</button><button class="tab" data-tab="text" type="button">Text paste</button></nav>
        <section id="panel-files" class="panel active-panel"><div id="drop-zone" class="drop-zone" tabindex="0"><input id="file-input" type="file" multiple hidden /><div class="drop-icon">＋</div><h2>Drop files here</h2><p>Drag & drop, paste from clipboard, or choose files directly.</p><button id="choose-files" class="primary-btn" type="button">Choose files</button><span class="helper">Images · songs · videos · PDFs · archives · any file type</span></div><div id="upload-queue" class="queue"></div></section>
        <section id="panel-text" class="panel"><div class="text-card"><textarea id="text-input" placeholder="Paste or type anything here…"></textarea><div class="text-toolbar"><span id="text-count">0 characters</span><button id="save-text" class="primary-btn" type="button">Save & create link</button></div></div><div id="text-list" class="result-list"></div></section>
        <section class="results-section"><div class="section-heading"><div><p class="eyebrow">SHAREABLE OUTPUTS</p><h2>Direct download links</h2></div><span id="item-count" class="count-pill">0 items</span></div><div id="file-list" class="result-list"></div></section>
      </section>
      <section id="active-view" hidden><section class="section-heading active-heading"><div><p class="eyebrow">LOCAL HISTORY</p><h1>Active uploads</h1><p class="hero-copy">Drops created on this browser/device. Each entry is checked with the server before it is shown.</p></div><button id="active-refresh" class="secondary-btn" type="button">Refresh</button></section><div id="active-list" class="active-list"></div></section>
      <footer class="footer">Pratilipi · Unlisted links · Cloudinary delivery · Cloudflare backend</footer>
    </main><div id="toast" class="toast" role="status" aria-live="polite"></div><dialog id="qr-dialog" class="qr-dialog"><div class="dialog-inner"><button id="close-qr" class="close-btn" aria-label="Close" type="button">×</button><p class="eyebrow">SCAN WITH PHONE</p><h3 id="qr-title">Pratilipi QR</h3><canvas id="qr-canvas"></canvas><input id="qr-url" readonly /><button id="copy-qr-url" class="secondary-btn" type="button">Copy URL</button></div></dialog>`;
}
function toast(message, kind = 'normal') { const el = $('#toast'); el.textContent = message; el.dataset.kind = kind; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600); }
function setBusy(delta) { state.busy = Math.max(0, state.busy + delta); document.body.classList.toggle('busy', state.busy > 0); }

async function createDrop(expiry = $('#expiry-select')?.value || '1d') {
  const data = await api('/api/drop', { method: 'POST', body: JSON.stringify({ label: 'Pratilipi drop', expiry }) });
  state.dropId = data.id; state.uploadUrl = data.uploadUrl; state.expiresAt = data.expiresAt; state.expiry = data.expiry;
  rememberDrop(data); history.replaceState({}, '', `${PUBLIC_ORIGIN}/u/${data.id}`); $('#session-url').value = data.uploadUrl; $('#expiry-select').value = data.expiry; $('#session-status').textContent = `Ready · ${EXPIRY_OPTIONS[data.expiry]} · ${new Date(data.expiresAt).toLocaleString()}`; return data;
}
async function loadDrop(dropId) { state.dropId = dropId; state.uploadUrl = `${PUBLIC_ORIGIN}/u/${dropId}`; $('#session-url').value = state.uploadUrl; const data = await api(`/api/drop/${dropId}`); state.expiresAt = Number(data.drop.expires_at); state.expiry = data.drop.expiry_option || '1d'; state.files = data.files || []; state.texts = data.texts || []; $('#expiry-select').value = state.expiry; rememberDrop({ id: dropId, uploadUrl: state.uploadUrl, expiresAt: state.expiresAt, expiry: state.expiry }); $('#session-status').textContent = `Active · ${formatRemaining(state.expiresAt)} · expires ${new Date(state.expiresAt).toLocaleString()}`; renderResults(); }

function renderResults() {
  const fileList = $('#file-list'); const textList = $('#text-list'); if (!fileList || !textList) return; const allCount = state.files.length + state.texts.length; $('#item-count').textContent = `${allCount} item${allCount === 1 ? '' : 's'}`;
  fileList.innerHTML = state.files.length ? state.files.map((file) => { const url = `${PUBLIC_ORIGIN}/d/${encodeURIComponent(file.id)}`; return `<article class="result-card"><div class="result-icon">${esc(iconFor(file.content_type))}</div><div class="result-main"><strong title="${esc(file.name)}">${esc(file.name)}</strong><span>${formatBytes(Number(file.size))} · ${esc(file.content_type || file.format || 'file')}</span><div class="link-row"><input readonly value="${esc(url)}" /><button data-copy="${esc(url)}" type="button">Copy</button></div></div><div class="result-actions"><a class="download-btn" href="${esc(url)}">Download</a><button data-qr="${esc(url)}" data-qr-title="${esc(file.name)}" class="mini-btn" type="button">QR</button><button data-delete="${esc(file.id)}" class="mini-btn danger" type="button">Delete</button></div></article>`; }).join('') : `<div class="empty-state">No files yet. Drop, paste, or choose a file to get a direct download link.</div>`;
  textList.innerHTML = state.texts.length ? state.texts.map((text) => { const url = `${PUBLIC_ORIGIN}/d/text/${encodeURIComponent(text.id)}`; return `<article class="result-card text-result"><div class="result-icon">T</div><div class="result-main"><strong>Text snippet</strong><span>${esc(text.content.slice(0, 140))}${text.content.length > 140 ? '…' : ''}</span><div class="link-row"><input readonly value="${esc(url)}" /><button data-copy="${esc(url)}" type="button">Copy</button></div></div><div class="result-actions"><a class="download-btn" href="${esc(url)}">Download</a><button data-qr="${esc(url)}" data-qr-title="Text download" class="mini-btn" type="button">QR</button></div></article>`; }).join('') : `<div class="empty-state">Your saved text snippets will appear here.</div>`;
  document.querySelectorAll('[data-copy]').forEach((button) => button.onclick = () => copyText(button.dataset.copy)); document.querySelectorAll('[data-qr]').forEach((button) => button.onclick = () => showQr(button.dataset.qr, button.dataset.qrTitle)); document.querySelectorAll('[data-delete]').forEach((button) => button.onclick = () => deleteFile(button.dataset.delete));
}

async function uploadFile(file) {
  setBusy(1); const queue = $('#upload-queue'); const item = document.createElement('div'); item.className = 'queue-item'; item.innerHTML = `<div><strong>${esc(file.name)}</strong><span>${formatBytes(file.size)}</span></div><div class="progress"><i></i></div>`; queue.prepend(item); const bar = item.querySelector('i');
  try { const form = new FormData(); form.append('file', file); form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET); form.append('folder', 'pratilipi'); const response = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: form }); const uploaded = await response.json(); if (!response.ok) throw new Error(uploaded.error?.message || `Cloudinary upload failed (${response.status})`); bar.style.width = '80%'; const done = await api(`/api/drop/${state.dropId}/complete`, { method: 'POST', body: JSON.stringify({ publicId: uploaded.public_id, secureUrl: uploaded.secure_url, resourceType: uploaded.resource_type, originalFilename: uploaded.original_filename, name: file.name, contentType: file.type || 'application/octet-stream', bytes: uploaded.bytes || file.size, format: uploaded.format || '' }) }); bar.style.width = '100%'; item.classList.add('done'); state.files.push(done.file); renderResults(); toast(`${file.name} uploaded`); }
  catch (error) { item.classList.add('failed'); item.querySelector('.progress').insertAdjacentHTML('afterend', `<small>${esc(error.message)}</small>`); toast(error.message, 'error'); }
  finally { setBusy(-1); }
}
async function saveText() { const textarea = $('#text-input'); const content = textarea.value; if (!content.trim()) return toast('Paste some text first.', 'error'); setBusy(1); try { await api(`/api/drop/${state.dropId}/text`, { method: 'POST', body: JSON.stringify({ content }) }); textarea.value = ''; updateTextCount(); await refreshDrop(); toast('Text saved'); } catch (error) { toast(error.message, 'error'); } finally { setBusy(-1); } }
async function refreshDrop() { if (!state.dropId) return; try { const data = await api(`/api/drop/${state.dropId}`); state.files = data.files || []; state.texts = data.texts || []; state.expiresAt = Number(data.drop.expires_at); state.expiry = data.drop.expiry_option || state.expiry; renderResults(); $('#session-status').textContent = `Active · ${formatRemaining(state.expiresAt)} · expires ${new Date(state.expiresAt).toLocaleString()}`; } catch (error) { if (error.message.includes('expired')) { forgetDrop(state.dropId); toast('This upload has expired.', 'error'); } } }
async function deleteFile(fileId) { try { await api(`/api/drop/${state.dropId}/file/${fileId}`, { method: 'DELETE', body: JSON.stringify({}) }); state.files = state.files.filter((file) => file.id !== fileId); renderResults(); toast('File deleted'); } catch (error) { toast(error.message, 'error'); } }
async function copyText(value) { try { await navigator.clipboard.writeText(value); toast('Copied'); } catch { toast('Clipboard permission was denied.', 'error'); } }
async function showQr(url, title = 'Pratilipi QR') { const dialog = $('#qr-dialog'); $('#qr-title').textContent = title; $('#qr-url').value = url; await QRCode.toCanvas($('#qr-canvas'), url, { width: 260, margin: 2, color: { dark: '#f4f7fb', light: '#0b0f16' } }); dialog.showModal(); }
function updateTextCount() { $('#text-count').textContent = `${$('#text-input').value.length.toLocaleString()} characters`; }

async function showActiveUploads() {
  const list = $('#active-list'); const records = history(); const valid = [];
  for (const record of records) { try { const data = await api(`/api/drop/${record.id}`); valid.push({ ...record, ...data.drop, files: data.files?.length || 0, texts: data.texts?.length || 0 }); } catch { /* expired/deleted */ } }
  saveHistory(valid.map((item) => ({ id: item.id, uploadUrl: `${PUBLIC_ORIGIN}/u/${item.id}`, expiresAt: item.expires_at, expiry: item.expiry_option, createdAt: item.created_at })));
  list.innerHTML = valid.length ? valid.map((item) => `<article class="active-card"><div><strong>Upload ${esc(item.id.slice(0, 10))}…</strong><span>${item.files + item.texts} item${item.files + item.texts === 1 ? '' : 's'} · ${esc(EXPIRY_OPTIONS[item.expiry_option] || item.expiry_option)} · ${formatRemaining(item.expires_at)}</span></div><div class="active-actions"><button data-open="${esc(item.id)}" class="primary-btn" type="button">Open</button><button data-copy-active="${esc(`${PUBLIC_ORIGIN}/u/${item.id}`)}" class="mini-btn" type="button">Copy URL</button><button data-remove-active="${esc(item.id)}" class="mini-btn danger" type="button">Remove</button></div></article>`).join('') : `<div class="empty-state">No active uploads on this browser yet.</div>`;
  list.querySelectorAll('[data-open]').forEach((button) => button.onclick = () => openDrop(button.dataset.open)); list.querySelectorAll('[data-copy-active]').forEach((button) => button.onclick = () => copyText(button.dataset.copyActive)); list.querySelectorAll('[data-remove-active]').forEach((button) => button.onclick = () => { forgetDrop(button.dataset.removeActive); showActiveUploads(); });
}
async function openDrop(id) { showView('home'); history.replaceState({}, '', `/u/${id}`); try { await loadDrop(id); } catch (error) { toast(error.message, 'error'); } }
function showView(view) { const active = view === 'active'; $('#home-view').hidden = active; $('#active-view').hidden = !active; $('#nav-home').classList.toggle('active', !active); $('#nav-active').classList.toggle('active', active); if (active) showActiveUploads(); }

function setupEvents() {
  $('#nav-home').onclick = () => showView('home'); $('#nav-active').onclick = () => showView('active'); $('#active-refresh').onclick = showActiveUploads;
  $('#new-drop').onclick = async () => { try { showView('home'); await createDrop($('#expiry-select')?.value || '1d'); state.files = []; state.texts = []; renderResults(); toast('New upload session created'); } catch (error) { toast(error.message, 'error'); } };
  $('#expiry-select').onchange = () => { if (state.dropId) toast('Expiry is fixed when a Drop is created. Use New Upload to choose a different duration.'); };
  $('#choose-files').onclick = () => $('#file-input').click(); $('#file-input').onchange = (event) => [...event.target.files].forEach(uploadFile);
  const zone = $('#drop-zone'); ['dragenter', 'dragover'].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.add('dragover'); })); ['dragleave', 'drop'].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.remove('dragover'); })); zone.ondrop = (event) => [...event.dataTransfer.files].forEach(uploadFile);
  document.addEventListener('paste', (event) => { const files = [...(event.clipboardData?.items || [])].map((item) => item.kind === 'file' ? item.getAsFile() : null).filter(Boolean); if (files.length) { event.preventDefault(); files.forEach(uploadFile); return; } const text = event.clipboardData?.getData('text/plain'); if (text && document.activeElement !== $('#text-input')) { $('#text-input').focus(); $('#text-input').setRangeText(text, $('#text-input').selectionStart, $('#text-input').selectionEnd, 'end'); updateTextCount(); } });
  $('#text-input').oninput = updateTextCount; $('#save-text').onclick = saveText; $('#copy-session').onclick = () => copyText($('#session-url').value); $('#show-session-qr').onclick = () => showQr($('#session-url').value, 'Phone upload'); $('#close-qr').onclick = () => $('#qr-dialog').close(); $('#copy-qr-url').onclick = () => copyText($('#qr-url').value);
  document.querySelectorAll('.tab').forEach((tab) => tab.onclick = () => { document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab)); $('#panel-files').classList.toggle('active-panel', tab.dataset.tab === 'files'); $('#panel-text').classList.toggle('active-panel', tab.dataset.tab === 'text'); });
}
async function boot() { renderShell(); setupEvents(); const match = location.pathname.match(/\/u\/([^/]+)/); try { if (match) await loadDrop(match[1]); else await createDrop('1d'); } catch (error) { $('#session-status').textContent = error.message; toast(error.message, 'error'); } setInterval(refreshDrop, 20000); setInterval(() => { if (state.expiresAt && state.dropId) $('#session-status').textContent = `Active · ${formatRemaining(state.expiresAt)} · expires ${new Date(state.expiresAt).toLocaleString()}`; }, 30000); }
boot();
