import { authIsConfigured, getAuthSession, json, withCors } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  const loginIdConfigured = Boolean(String(env?.PRATILIPI_LOGIN_ID || '').trim());
  const passkeyConfigured = Boolean(String(env?.PRATILIPI_PASSKEY || '').trim());

  if (!loginIdConfigured || !passkeyConfigured) {
    return withCors(json({
      authenticated: false,
      configured: false,
      diagnostics: {
        loginIdConfigured,
        passkeyConfigured,
        secretNamesExpected: ['PRATILIPI_LOGIN_ID', 'PRATILIPI_PASSKEY']
      }
    }), request);
  }

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
