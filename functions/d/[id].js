import { ensureDrop, error, withCors } from '../_lib.js';

export async function onRequestGet({ request, env, params }) {
  const file = await env.DB.prepare(
    'SELECT id, name, secure_url, drop_id FROM files WHERE id = ?1'
  ).bind(params.id).first();
  if (!file) return withCors(error('Download not found.', 404), request);

  const checked = await ensureDrop(env, file.drop_id);
  if (checked.error) return withCors(error(checked.error, checked.error === 'Drop not found.' ? 404 : 410), request);

  return new Response(null, {
    status: 302,
    headers: {
      Location: file.secure_url,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
