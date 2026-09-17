import {
  authIsConfigured,
  clearAuthCookie,
  createAuthCookie,
  error,
  getAuthSession,
  json,
  withCors
} from '../_lib.js';

function response(body, request) {
  return withCors(body, request);
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function onRequestOptions({ request }) {
  return response(new Response(null, { status: 204 }), request);
}

export async function onRequest({ request, env, params }) {
  const method = request.method.toUpperCase();
  const action = String(params?.action || '');

  if (action === 'me' && method === 'GET') {
    if (!authIsConfigured(env)) return response(json({ authenticated: false, configured: false }), request);
    const session = await getAuthSession(request, env);
    return response(json({
      authenticated: Boolean(session),
      configured: true,
      loginId: session?.loginId || null,
      expiresAt: session?.expiresAt || null
    }), request);
  }

  if (action === 'login' && method === 'POST') {
    if (!sameOrigin(request)) return response(error('Cross-origin login is not allowed.', 403), request);
    if (!authIsConfigured(env)) return response(error('Authentication is not configured. Add PRATILIPI_LOGIN_ID and PRATILIPI_PASSKEY in Cloudflare.', 503), request);

    let input = {};
    try { input = await request.json(); } catch { /* handled by generic invalid credentials below */ }

    const loginId = String(input.loginId || '');
    const passkey = String(input.passkey || '');
    if (!loginId || !passkey || loginId !== String(env.PRATILIPI_LOGIN_ID) || passkey !== String(env.PRATILIPI_PASSKEY)) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return response(error('Invalid login ID or passkey.', 401), request);
    }

    const cookie = await createAuthCookie(env);
    const result = json({ ok: true, loginId });
    const headers = new Headers(result.headers);
    headers.set('Set-Cookie', cookie);
    headers.set('Cache-Control', 'no-store');
    return response(new Response(result.body, { status: 200, headers }), request);
  }

  if (action === 'logout' && method === 'POST') {
    if (!sameOrigin(request)) return response(error('Cross-origin logout is not allowed.', 403), request);
    const result = json({ ok: true });
    const headers = new Headers(result.headers);
    headers.set('Set-Cookie', clearAuthCookie());
    headers.set('Cache-Control', 'no-store');
    return response(new Response(result.body, { status: 200, headers }), request);
  }

  return response(error('Auth route not found.', 404), request);
}
