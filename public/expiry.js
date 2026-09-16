(() => {
  const options = {
    '1h': '1 Hour',
    '12h': '12 Hours',
    '1d': '1 Day',
    '1w': '1 Week',
    '1m': '1 Month'
  };
  let selected = '1d';

  const style = document.createElement('style');
  style.textContent = `
    .expiry-control{display:grid;grid-template-columns:1fr auto;gap:7px 12px;margin:14px 0 2px;padding:12px 13px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025)}
    .expiry-control label{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;align-self:center;color:rgba(255,255,255,.72)}
    .expiry-control select{min-width:128px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#101621;color:#f4f7fb;padding:8px 10px;outline:none}
    .expiry-control select:focus{border-color:rgba(255,255,255,.35)}
    .expiry-control span{grid-column:1/-1;font-size:12px;color:rgba(255,255,255,.48)}
    @media(max-width:640px){.expiry-control{grid-template-columns:1fr}.expiry-control select{width:100%}}
  `;
  document.head.appendChild(style);

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    const method = (init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    if (method === 'POST' && new URL(requestUrl, location.href).pathname === '/api/drop' && init.body) {
      try {
        const body = JSON.parse(init.body);
        body.expiry = selected;
        return originalFetch(input, { ...init, body: JSON.stringify(body) });
      } catch {
        // Let the original request proceed if its body is not JSON.
      }
    }
    return originalFetch(input, init);
  };

  function injectExpiryControl() {
    const card = document.querySelector('.session-card');
    if (!card || document.querySelector('#expiry-control')) return;
    const status = document.querySelector('#session-status');
    if (!status) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'expiry-control';
    wrapper.className = 'expiry-control';
    wrapper.innerHTML = `
      <label for="expiry-select">Keep files for</label>
      <select id="expiry-select" aria-label="Keep files for">
        ${Object.entries(options).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
      <span id="expiry-hint">Default: 1 Day</span>
    `;
    status.before(wrapper);
    const select = wrapper.querySelector('#expiry-select');
    select.addEventListener('change', () => {
      selected = select.value;
      wrapper.querySelector('#expiry-hint').textContent = `New drops: ${options[selected]}`;
    });
  }

  const observer = new MutationObserver(injectExpiryControl);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectExpiryControl, { once: true });
  else injectExpiryControl();
})();
