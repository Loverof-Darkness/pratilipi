import { error, getAuthSession } from '../_lib.js';

export async function onRequest({ request, env, next }) {
  const session = await getAuthSession(request, env);
  if (!session) return error('Authentication required.', 401);
  return next();
}
