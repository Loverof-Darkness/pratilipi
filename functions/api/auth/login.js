import { authIsConfigured, createAuthCookie, error, json, withCors } from '../../_lib.js';

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

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return response(error('Cross-origin login is not allowed.', 403), request);
  if (!authIsConfigured(env)) return response(error('Authentication is not configured. Add PRATILIPI_LOGIN_ID and PRATILIPI_PASSKEY in Cloudflare.', 503), request);

  let input = {};
  try { input = await request.json(); } catch { /* invalid credentials below */ }
  const loginId = String(input.loginId || '');
  const passkey = String(input.passkey || '');

  if (!loginId || !passkey || loginId !== String(env.PRATILIPI_LOGIN_ID) || passkey !== String(env.PRATILIPI_PASSKEY)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return response(error('Invalid login ID or passkey.', 401), request);
  }

  const result = json({ ok: true, loginId });
  const headers = new Headers(result.headers);
  headers.set('Set-Cookie', await createAuthCookie(env));
  return response(new Response(result.body, { status: 200, headers }), request);
}
