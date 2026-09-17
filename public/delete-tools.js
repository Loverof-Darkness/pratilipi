(() => {
  const HISTORY_KEY = 'pratilipi.activeUploads.v1';

  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  };

  const getHistory = () => {
    try {
      const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const removeFromHistory = (dropId) => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(getHistory().filter((item) => item.id !== dropId)));
  };

  const toast = (message, kind = 'normal') => {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
  };

  const confirmDelete = (message) => window.confirm(message);

  async function deleteEntireDrop(dropId, reload = false) {
    if (!dropId) return;
    if (!confirmDelete('Delete this entire Drop? All uploaded files and saved text in this Drop will be permanently deleted. This cannot be undone.')) return;

    const buttons = document.querySelectorAll(`[data-delete-drop="${CSS.escape(dropId)}"]`);
    buttons.forEach((button) => { button.disabled = true; button.textContent = 'Deleting…'; });

    try {
      const result = await api(`/api/drop/${encodeURIComponent(dropId)}`, { method: 'DELETE' });
      removeFromHistory(dropId);
      toast(`${result.deletedFiles || 0} file${result.deletedFiles === 1 ? '' : 's'} deleted`);

      if (reload) {
        location.href = location.origin;
        return;
      }

      document.querySelectorAll(`[data-history-drop="${CSS.escape(dropId)}"]`).forEach((card) => card.remove());
      if (typeof window.pratilipiRefreshActiveUploads === 'function') {
        window.pratilipiRefreshActiveUploads();
      }
    } catch (error) {
      buttons.forEach((button) => { button.disabled = false; button.textContent = button.dataset.originalLabel || 'Delete all'; });
      toast(error.message, 'error');
    }
  }

  async function deleteText(dropId, textId, button) {
    if (!confirmDelete('Delete this saved text permanently?')) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Deleting…';
    try {
      await api(`/api/drop/${encodeURIComponent(dropId)}/text/${encodeURIComponent(textId)}`, { method: 'DELETE' });
      button.closest('.text-result')?.remove();
      toast('Text deleted');
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      toast(error.message, 'error');
    }
  }

  function currentDropId() {
    const match = location.pathname.match(/\/u\/([^/]+)/);
    return match ? match[1] : null;
  }

  function injectStyle() {
    if (document.querySelector('#delete-tools-style')) return;
    const style = document.createElement('style');
    style.id = 'delete-tools-style';
    style.textContent = `
      .drop-delete-btn{width:100%;margin-top:8px;border:1px solid rgba(255,100,100,.35);background:rgba(255,85,85,.06);color:#ff9b9b;border-radius:10px;padding:9px 12px;font:600 13px inherit;cursor:pointer}
      .drop-delete-btn:hover{border-color:rgba(255,100,100,.65);background:rgba(255,85,85,.1)}
      .drop-delete-btn:disabled{opacity:.55;cursor:progress}
      .active-delete-btn{border:1px solid rgba(255,100,100,.28);background:transparent;color:#ff9999;border-radius:9px;padding:10px 12px;cursor:pointer}
      .active-delete-btn:hover{border-color:rgba(255,100,100,.6);background:rgba(255,80,80,.06)}
      .text-delete-btn{border:1px solid rgba(255,100,100,.25);background:transparent;color:#ff9999;border-radius:9px;padding:8px 10px;cursor:pointer}
      .text-delete-btn:hover{border-color:rgba(255,100,100,.55)}
      .active-card.is-deleted{opacity:.5;pointer-events:none}
    `;
    document.head.appendChild(style);
  }

  function injectCurrentDropDelete() {
    const card = document.querySelector('.session-card');
    const dropId = currentDropId();
    if (!card || !dropId || card.querySelector('[data-delete-drop]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'drop-delete-btn';
    button.dataset.deleteDrop = dropId;
    button.dataset.originalLabel = 'Delete this Drop';
    button.textContent = 'Delete this Drop';
    button.addEventListener('click', () => deleteEntireDrop(dropId, true));
    card.appendChild(button);
  }

  function injectActiveDropDeletes() {
    document.querySelectorAll('.active-card').forEach((card) => {
      const open = card.querySelector('[data-open]');
      if (!open) return;
      const dropId = open.dataset.open;
      if (!dropId || card.querySelector('[data-delete-drop]')) return;
      card.dataset.historyDrop = dropId;
      const actions = card.querySelector('.active-actions');
      if (!actions) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'active-delete-btn';
      button.dataset.deleteDrop = dropId;
      button.dataset.originalLabel = 'Delete all';
      button.textContent = 'Delete all';
      button.addEventListener('click', () => deleteEntireDrop(dropId, false));
      actions.appendChild(button);
    });
  }

  function injectTextDeletes() {
    const dropId = currentDropId();
    if (!dropId) return;
    document.querySelectorAll('.text-result').forEach((card) => {
      if (card.querySelector('[data-delete-text]')) return;
      const download = card.querySelector('.download-btn');
      const actions = card.querySelector('.result-actions');
      if (!download || !actions) return;
      const match = new URL(download.href, location.href).pathname.match(/\/d\/text\/([^/]+)/);
      if (!match) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-delete-btn';
      button.dataset.deleteText = match[1];
      button.textContent = 'Delete';
      button.addEventListener('click', () => deleteText(dropId, match[1], button));
      actions.appendChild(button);
    });
  }

  function enhance() {
    injectStyle();
    injectCurrentDropDelete();
    injectActiveDropDeletes();
    injectTextDeletes();
  }

  window.pratilipiRefreshActiveUploads = () => {
    const refresh = document.querySelector('#active-refresh');
    if (refresh) refresh.click();
  };

  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });
  else enhance();
})();
