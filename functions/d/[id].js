import { appOrigin, contentDisposition, error, ensureDrop, withCors } from '../_lib.js';

function attachmentUrl(secureUrl) {
  try {
    const url = new URL(secureUrl);
    const match = url.pathname.match(/^\/(image|video|raw)\/upload\//);
    if (!match) return secureUrl;
    url.pathname = url.pathname.replace(match[0], `/${match[1]}/upload/fl_attachment/`);
    return url.toString();
  } catch {
    return secureUrl;
  }
}

export async function onRequestGet({ request, env, params }) {
  const file = await env.DB.prepare(
    'SELECT id, name, secure_url, drop_id FROM files WHERE id = ?1'
  ).bind(params.id).first();
  if (!file) return withCors(error('Download not found.', 404), request);

  const checked = await ensureDrop(env, file.drop_id);
  if (checked.error) return withCors(error(checked.error, checked.error === 'Drop not found.' ? 404 : 410), request);

  const location = attachmentUrl(file.secure_url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Disposition': contentDisposition(file.name),
      'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
      'Vary': 'Origin'
    }
  });
}
