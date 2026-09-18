import { error, getAuthSession, withCors } from '../_lib.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;
  if (
    path === '/api/auth/login' ||
    path === '/api/auth/logout' ||
    path === '/api/auth/me' ||
    (path.startsWith('/api/drop/') && request.method === 'GET') ||
    request.method === 'OPTIONS'
  ) {
    return next();
  }

  const session = await getAuthSession(request, env);
  if (!session) return withCors(error('Authentication required.', 401), request);
  return next();
}
