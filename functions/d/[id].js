import { contentDisposition, error, ensureDrop, withCors } from '../_lib.js';

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
    'SELECT id, name, secure_url, content_type, size, drop_id FROM files WHERE id = ?1'
  ).bind(params.id).first();
  if (!file) return withCors(error('Download not found.', 404), request);

  const checked = await ensureDrop(env, file.drop_id);
  if (checked.error) {
    return withCors(
      error(checked.error, checked.error === 'Drop not found.' ? 404 : 410),
      request
    );
  }

  const location = attachmentUrl(file.secure_url);

  let upstream;
  try {
    // Proxy the asset instead of returning a 302. This keeps the public
    // download URL on Pratilipi and makes the attachment header reliable.
    upstream = await fetch(location, {
      redirect: 'follow',
      cf: { cacheTtl: 0, cacheEverything: false }
    });
  } catch (cause) {
    console.error('Cloudinary download fetch failed', file.id, cause);
    return withCors(error('Unable to fetch the stored file.', 502), request);
  }

  if (!upstream.ok) {
    console.error('Cloudinary download failed', file.id, upstream.status);
    return withCors(error('Stored file is unavailable.', 502), request);
  }

  const headers = new Headers();
  headers.set('Content-Disposition', contentDisposition(file.name));
  headers.set('Content-Type', file.content_type || upstream.headers.get('content-type') || 'application/octet-stream');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);

  return withCors(new Response(upstream.body, {
    status: 200,
    headers
  }), request);
}
