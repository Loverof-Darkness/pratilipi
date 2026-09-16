(() => {
  const options = {
    '1h': '1 Hour',
    '12h': '12 Hours',
    '1d': '1 Day',
    '1w': '1 Week',
    '1m': '1 Month'
  };
  let selected = '1d';

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
