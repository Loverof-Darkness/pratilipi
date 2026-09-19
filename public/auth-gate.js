(() => {
  const gate = document.createElement('div');
  gate.id = 'pratilipi-auth-gate';
  gate.innerHTML = `
    <section class="pr-auth-card" aria-labelledby="pr-auth-title">
      <div class="pr-auth-brand">
        <span class="pr-auth-mark">✦</span>
        <div><strong>प्रतिलिपि</strong><small>Private access</small></div>
      </div>
      <p class="pr-auth-kicker">SECURE STARTUP</p>
      <h1 id="pr-auth-title" class="pr-auth-title">Unlock Pratilipi.</h1>
      <p class="pr-auth-sub">This private instance requires your access ID and passkey before you can create or manage Drops.</p>
      <form class="pr-auth-form" id="pr-auth-form" autocomplete="on">
        <div class="pr-auth-field">
          <label for="pr-auth-id">Access ID</label>
          <input class="pr-auth-input" id="pr-auth-id" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required />
        </div>
        <div class="pr-auth-field">
          <label for="pr-auth-pass">Passkey</label>
          <div class="pr-auth-input-wrap">
            <input class="pr-auth-input" id="pr-auth-pass" name="password" type="password" autocomplete="current-password" required />
            <button class="pr-auth-pass-toggle" id="pr-auth-pass-toggle" type="button">Show</button>
          </div>
        </div>
        <div class="pr-auth-error" id="pr-auth-error" aria-live="polite"></div>
        <button class="pr-auth-submit" id="pr-auth-submit" type="submit">Unlock Pratilipi</button>
      </form>
      <p class="pr-auth-foot">Access is controlled by Cloudflare environment secrets.</p>
    </section>`;

  const lockButton = document.createElement('button');
  lockButton.id = 'pratilipi-lock-button';
  lockButton.type = 'button';
  lockButton.innerHTML = '<span class="pratilipi-lock-dot"></span>Lock';

  function lockScreen() {
    document.documentElement.classList.add('auth-locked');
    document.body.classList.add('auth-locked');
    document.body.classList.remove('pr-authenticated');
    gate.classList.remove('auth-hidden');
    document.querySelector('#pr-auth-id')?.focus();
  }

  function unlockScreen() {
    document.documentElement.classList.remove('auth-locked');
    document.body.classList.remove('auth-locked');
    document.body.classList.add('pr-authenticated');
    gate.classList.add('auth-hidden');
  }

  async function getStatus() {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function bootstrap() {
    if (/^\/u\/[^/]+\/?$/.test(location.pathname) || /^\/d(?:\/text)?\/[^/]+\/?$/.test(location.pathname)) return;
    document.documentElement.classList.add('auth-locked');
    document.body.classList.add('auth-locked');
    document.body.prepend(gate);
    document.body.append(lockButton);

    try {
      const { response, data } = await getStatus();
      if (data.configured === false || response.status === 503) {
        document.querySelector('#pr-auth-error').textContent = 'Authentication is not configured on this Cloudflare deployment yet.';
        return;
      }
      if (data.authenticated) unlockScreen();
      else lockScreen();
    } catch {
      document.querySelector('#pr-auth-error').textContent = 'Unable to reach the authentication service. Refresh and try again.';
      lockScreen();
    }
  }

  document.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'pr-auth-form') return;
    event.preventDefault();
    const error = document.querySelector('#pr-auth-error');
    const submit = document.querySelector('#pr-auth-submit');
    const loginId = document.querySelector('#pr-auth-id')?.value || '';
    const passkey = document.querySelector('#pr-auth-pass')?.value || '';
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Checking…';
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ loginId, passkey })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Login failed (${response.status})`);
      document.querySelector('#pr-auth-pass').value = '';
      unlockScreen();
      window.dispatchEvent(new CustomEvent('pratilipi:authenticated'));
    } catch (loginError) {
      error.textContent = loginError.message;
      document.querySelector('#pr-auth-pass')?.select();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Unlock Pratilipi';
    }
  });

  document.addEventListener('click', async (event) => {
    if (event.target?.id === 'pr-auth-pass-toggle') {
      const input = document.querySelector('#pr-auth-pass');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      event.target.textContent = input.type === 'password' ? 'Show' : 'Hide';
    }

    if (event.target?.closest('#pratilipi-lock-button')) {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      } finally {
        lockScreen();
      }
    }
  });

  setInterval(async () => {
    if (!document.body.classList.contains('pr-authenticated')) return;
    try {
      const { data } = await getStatus();
      if (!data.authenticated) lockScreen();
    } catch { /* keep the current UI during short network failures */ }
  }, 5 * 60 * 1000);

  bootstrap();
})();
