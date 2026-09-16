import {
  appOrigin,
  destroyCloudinaryAsset,
  ensureDrop,
  error,
  EXPIRY_OPTIONS,
  json,
  now,
  resolveExpiry,
  token,
  validateCloudinaryUrl,
  withCors
} from '../_lib.js';

function response(body, request) {
  return withCors(body, request);
}

export async function onRequestOptions({ request }) {
  return response(new Response(null, { status: 204 }), request);
}

export async function onRequest({ request, env, params }) {
  const path = (params.path || []).filter(Boolean);
  const method = request.method.toUpperCase();
  const body = async () => {
    try { return await request.json(); } catch { return {}; }
  };

  if (path.length === 1 && path[0] === 'drop' && method === 'POST') {
    const input = await body();
    const expiry = resolveExpiry(input.expiry);
    const id = token();
    const createdAt = now();
    await env.DB.prepare(
      'INSERT INTO drops (id, created_at, expires_at, expiry_option, label) VALUES (?1, ?2, ?3, ?4, ?5)'
    ).bind(id, createdAt, expiry.expiresAt, expiry.key, typeof input.label === 'string' ? input.label.slice(0, 80) : null).run();
    const origin = appOrigin(request, env);
    return response(json({
      id,
      expiry: expiry.key,
      expiresAt: expiry.expiresAt,
      uploadUrl: `${origin}/u/${id}`,
      apiUrl: `${origin}/api/drop/${id}`,
      expiryOptions: Object.keys(EXPIRY_OPTIONS)
    }), request);
  }

  if (path.length === 1 && path[0] === 'config' && method === 'GET') {
    return response(json({
      cloudinary: {
        cloudName: env.CLOUDINARY_CLOUD_NAME || '',
        uploadPreset: env.CLOUDINARY_UPLOAD_PRESET || 'pratilipi',
        uploadEndpoint: env.CLOUDINARY_CLOUD_NAME
          ? `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`
          : ''
      }
    }), request);
  }

  if (path[0] === 'drop' && path.length >= 2) {
    const dropId = path[1];
    const checked = await ensureDrop(env, dropId);
    if (checked.error) return response(error(checked.error, checked.error === 'Drop not found.' ? 404 : 410), request);

    if (path.length === 2 && method === 'GET') {
      const [filesResult, textsResult] = await Promise.all([
        env.DB.prepare('SELECT id, name, resource_type, content_type, size, format, created_at FROM files WHERE drop_id = ?1 ORDER BY created_at ASC').bind(dropId).all(),
        env.DB.prepare('SELECT id, content, created_at FROM texts WHERE drop_id = ?1 ORDER BY created_at ASC').bind(dropId).all()
      ]);
      const origin = appOrigin(request, env);
      return response(json({
        drop: checked.drop,
        files: (filesResult.results || []).map((file) => ({ ...file, downloadUrl: `${origin}/d/${file.id}` })),
        texts: (textsResult.results || []).map((text) => ({ ...text, downloadUrl: `${origin}/d/text/${text.id}` }))
      }), request);
    }

    if (path.length === 3 && path[2] === 'complete' && method === 'POST') {
      const input = await body();
      const publicId = String(input.publicId || '');
      const secureUrl = String(input.secureUrl || '');
      const resourceType = ['image', 'video', 'raw'].includes(input.resourceType) ? input.resourceType : 'raw';
      const name = String(input.name || input.originalFilename || 'file').slice(0, 240);
      const contentType = String(input.contentType || 'application/octet-stream').slice(0, 200);
      const size = Math.max(0, Number(input.size || input.bytes || 0));
      const format = input.format ? String(input.format).slice(0, 32) : null;
      if (!publicId || !secureUrl || !validateCloudinaryUrl(env, secureUrl)) {
        return response(error('Invalid Cloudinary upload response.'), request);
      }
      const id = token(12);
      await env.DB.prepare(
        'INSERT INTO files (id, drop_id, name, public_id, resource_type, secure_url, content_type, size, format, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)'
      ).bind(id, dropId, name, publicId, resourceType, secureUrl, contentType, size, format, now()).run();
      const origin = appOrigin(request, env);
      return response(json({ ok: true, file: {
        id,
        name,
        resource_type: resourceType,
        content_type: contentType,
        size,
        format,
        downloadUrl: `${origin}/d/${id}`
      } }), request);
    }

    if (path.length === 3 && path[2] === 'text' && method === 'POST') {
      const input = await body();
      const content = String(input.content ?? '');
      if (!content.trim()) return response(error('Text cannot be empty.'), request);
      if (content.length > 2000000) return response(error('Text is limited to 2 MB.'), request);
      const id = token(12);
      await env.DB.prepare('INSERT INTO texts (id, drop_id, content, created_at) VALUES (?1, ?2, ?3, ?4)')
        .bind(id, dropId, content, now()).run();
      const origin = appOrigin(request, env);
      return response(json({ ok: true, text: { id, downloadUrl: `${origin}/d/text/${id}` } }), request);
    }

    if (path.length === 4 && path[2] === 'file' && method === 'DELETE') {
      const fileId = path[3];
      const file = await env.DB.prepare('SELECT id, public_id, resource_type FROM files WHERE id = ?1 AND drop_id = ?2').bind(fileId, dropId).first();
      if (!file) return response(error('File not found.', 404), request);
      try {
        await destroyCloudinaryAsset(env, { publicId: file.public_id, resourceType: file.resource_type || 'raw', invalidate: true });
      } catch (cause) {
        console.error(cause);
        return response(error('Cloudinary deletion is not configured. Add the API key and secret to the Cloudflare environment.', 503), request);
      }
      await env.DB.prepare('DELETE FROM files WHERE id = ?1 AND drop_id = ?2').bind(fileId, dropId).run();
      return response(json({ ok: true }), request);
    }
  }

  return response(error('API route not found.', 404), request);
}
