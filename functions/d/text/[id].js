import { contentDisposition, ensureDrop, error, withCors } from '../../_lib.js';

export async function onRequestGet({ request, env, params }) {
  const text = await env.DB.prepare(
    'SELECT t.id, t.content, t.drop_id FROM texts t WHERE t.id = ?1'
  ).bind(params.id).first();
  if (!text) return withCors(error('Text not found.', 404), request);

  const checked = await ensureDrop(env, text.drop_id);
  if (checked.error) return withCors(error(checked.error, checked.error === 'Drop not found.' ? 404 : 410), request);

  return new Response(text.content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': contentDisposition('pratilipi-text.txt'),
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
