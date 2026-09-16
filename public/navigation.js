(() => {
  const HISTORY_KEY = 'pratilipi.activeDrops.v1';
  const originalFetch = window.fetch.bind(window);

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeHistory(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50)));
  }

  function rememberDrop(drop) {
    if (!drop?.id || !drop?.uploadUrl) return;
    const history = readHistory().filter((item) => item.id !== drop.id);
    history.unshift({
      id: drop.id,
      uploadUrl: drop.uploadUrl,
      expiresAt: Number(drop.expiresAt || 0),
      createdAt: Date.now()
    });
    writeHistory(history);
  }

  window.fetch = async (input, init = {}) => {
    const response = await originalFetch(input, init);
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    const method = (init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    const path = new URL(requestUrl, location.href).pathname;
    if (method === 'POST' && path === '/api/drop' && response.ok) {
      try {
        const data = await response.clone().json();
        rememberDrop(data);
      } catch {
        // Ignore non-JSON responses.
      }
    }
    return response;
  };

  const style = document.createElement('style');
  style.textContent = `
    .primary-nav{display:flex;align-items:center;gap:6px;margin:0 auto 34px;padding:6px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(12,16,24,.72);backdrop-filter:blur(14px);max-width:560px}
    .primary-nav button{flex:1;border:0;background:transparent;color:#8e98aa;padding:11px 18px;border-radius:11px;font:600 14px/1.1 inherit;cursor:pointer;transition:.2s}
    .primary-nav button:hover{color:#eef2f8;background:rgba(255,255,255,.05)}
    .primary-nav button.active{background:#f1f4f8;color:#090d14}
    .history-view{display:none;max-width:1080px;margin:0 auto 60px}
    .history-view.active{display:block}
    .home-view.history-hidden{display:none}
    .history-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:10px 0 28px}
    .history-head h1{margin:5px 0 0;font-size:clamp(30px,4vw,48px);letter-spacing:-.04em}
    .history-head p{margin:0;color:#8792a4;max-width:590px}
    .history-grid{display:grid;gap:12px}
    .history-card{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;padding:20px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:linear-gradient(180deg,rgba(24,29,39,.78),rgba(15,19,27,.78));box-shadow:0 14px 40px rgba(0,0,0,.16)}
    .history-main{min-width:0}.history-title{font-weight:700;font-size:16px;margin-bottom:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-meta{color:#8792a4;font-size:13px;display:flex;gap:10px;flex-wrap:wrap}.history-url{color:#667286;font-size:12px;margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .history-actions{display:flex;gap:8px;align-items:center}.history-open{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;background:#eef2f7;color:#090d14}.history-remove{border:1px solid rgba(255,255,255,.1);background:transparent;color:#9ba5b6;border-radius:10px;padding:10px 12px;cursor:pointer}.history-remove:hover{color:#ff9292;border-color:rgba(255,100,100,.3)}
    .history-empty{padding:55px 24px;text-align:center;border:1px dashed rgba(255,255,255,.12);border-radius:18px;color:#8d97a8}.history-empty strong{display:block;color:#eef2f8;font-size:17px;margin-bottom:7px}.history-empty span{font-size:14px}
    .history-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;background:rgba(115,255,190,.08);color:#8ef2bd;font-size:12px;font-weight:700}.history-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:#65eaa5}
    .expiry-control{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:14px 0 4px}.expiry-control label{font-size:12px;color:#8993a5}.expiry-control select{appearance:auto;border:1px solid rgba(255,255,255,.1);background:#101520;color:#edf2f8;border-radius:9px;padding:8px 10px;font:600 12px inherit}.expiry-control span{font-size:11px;color:#626d7f}
    @media (max-width:720px){.primary-nav{margin-bottom:22px}.history-card{grid-template-columns:1fr}.history-actions{justify-content:flex-start}.history-open{flex:1}.history-remove{flex:0 0 auto}}
  `;
  document.head.appendChild(style);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;' })[char]);
  }

  function relativeExpiry(timestamp) {
    const delta = Number(timestamp) - Date.now();
    if (!Number.isFinite(delta) || delta <= 0) return 'Expired';
    const hours = Math.floor(delta / 3600000);
    const minutes = Math.max(1, Math.floor((delta % 3600000) / 60000));
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  }

  function ensureNav() {
    const topbar = document.querySelector('.topbar');
    const homeView = document.querySelector('.hero')?.parentElement;
    if (!topbar || !homeView || document.querySelector('.primary-nav')) return false;

    const shell = document.querySelector('.app-shell');
    const nav = document.createElement('nav');
    nav.className = 'primary-nav';
    nav.setAttribute('aria-label', 'Pratilipi navigation');
    nav.innerHTML = `<button type="button" data-route="home" class="active">Home · New Upload</button><button type="button" data-route="history">Active Uploads</button>`;

    const history = document.createElement('section');
    history.className = 'history-view';
    history.id = 'active-uploads';
    history.innerHTML = `
      <div class="history-head">
        <div><p class="eyebrow">YOUR ACTIVE SESSIONS</p><h1>Previous uploads</h1><p>Re-open any active Drop from this browser. Expired sessions disappear automatically.</p></div>
        <span class="history-badge">Active only</span>
      </div>
      <div id="history-grid" class="history-grid"></div>
    `;

    const firstSection = document.querySelector('.hero');
    shell.insertBefore(nav, firstSection);
    shell.appendChild(history);

    const homeControls = nav.querySelector('[data-route="home"]');
    const historyControls = nav.querySelector('[data-route="history"]');
    const homeSections = () => [...shell.children].filter((node) => node !== nav && node !== history && node.tagName !== 'FOOTER' && !node.classList.contains('toast') && !node.classList.contains('qr-dialog'));

    function switchView(view) {
      const isHistory = view === 'history';
      homeControls.classList.toggle('active', !isHistory);
      historyControls.classList.toggle('active', isHistory);
      homeSections().forEach((node) => node.classList.toggle('history-hidden', isHistory));
      history.classList.toggle('active', isHistory);
      if (isHistory) renderHistory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    homeControls.addEventListener('click', () => switchView('home'));
    historyControls.addEventListener('click', () => switchView('history'));

    const newDropButton = document.querySelector('#new-drop');
    newDropButton?.addEventListener('click', () => switchView('home'));

    function renderHistory() {
      const grid = document.querySelector('#history-grid');
      if (!grid) return;
      const entries = readHistory().filter((entry) => Number(entry.expiresAt) > Date.now());
      writeHistory(entries);
      if (!entries.length) {
        grid.innerHTML = `<div class="history-empty"><strong>No active uploads yet</strong><span>Create a new Drop from Home and it will appear here until it expires.</span></div>`;
        return;
      }

      grid.innerHTML = entries.map((entry) => `
        <article class="history-card" data-history-id="${escapeHtml(entry.id)}">
          <div class="history-main">
            <div class="history-title">Pratilipi Drop</div>
            <div class="history-meta"><span>${new Date(Number(entry.createdAt)).toLocaleString()}</span><span>·</span><span>${relativeExpiry(entry.expiresAt)}</span></div>
            <div class="history-url">${escapeHtml(entry.uploadUrl)}</div>
          </div>
          <div class="history-actions"><a class="history-open" href="${escapeHtml(entry.uploadUrl)}">Open Upload</a><button class="history-remove" data-remove-history="${escapeHtml(entry.id)}" type="button">Remove</button></div>
        </article>
      `).join('');

      grid.querySelectorAll('[data-remove-history]').forEach((button) => button.addEventListener('click', () => {
        const next = readHistory().filter((entry) => entry.id !== button.dataset.removeHistory);
        writeHistory(next);
        renderHistory();
      }));

      entries.forEach(async (entry) => {
        try {
          const response = await originalFetch(`/api/drop/${encodeURIComponent(entry.id)}`, { cache: 'no-store' });
          if (!response.ok) {
            writeHistory(readHistory().filter((item) => item.id !== entry.id));
            renderHistory();
          }
        } catch {
          // Keep local history during temporary offline/network failures.
        }
      });
    }

    window.pratilipiRenderHistory = renderHistory;
    return true;
  }

  const observer = new MutationObserver(() => ensureNav());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureNav, { once: true });
  else ensureNav();
})();
