import { authIsConfigured, getAuthSession, json, withCors } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  if (!authIsConfigured(env)) return withCors(json({ authenticated: false, configured: false }), request);
  const session = await getAuthSession(request, env);
  return withCors(json({
    authenticated: Boolean(session),
    configured: true,
    loginId: session?.loginId || null,
    expiresAt: session?.expiresAt || null
  }), request);
}

export async function onRequestOptions({ request }) {
  return withCors(new Response(null, { status: 204 }), request);
}
