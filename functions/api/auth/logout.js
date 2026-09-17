import { clearAuthCookie, json, withCors } from '../../_lib.js';

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return withCors(json({ error: 'Cross-origin logout is not allowed.' }, { status: 403 }), request);
  const result = json({ ok: true });
  const headers = new Headers(result.headers);
  headers.set('Set-Cookie', clearAuthCookie());
  return withCors(new Response(result.body, { status: 200, headers }), request);
}

export async function onRequestOptions({ request }) {
  return withCors(new Response(null, { status: 204 }), request);
}
