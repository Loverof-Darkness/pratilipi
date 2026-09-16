import {
  appOrigin,
  ensureDrop,
  error,
  expiry,
  fileObjectKey,
  json,
  now,
  presignedPut,
  token,
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
    const id = token();
    const createdAt = now();
    const expiresAt = expiry();
    await env.DB.prepare('INSERT INTO drops (id, created_at, expires_at, label) VALUES (?1, ?2, ?3, ?4)')
      .bind(id, createdAt, expiresAt, typeof input.label === 'string' ? input.label.slice(0, 80) : null).run();
    const origin = appOrigin(request, env);
    return response(json({ id, uploadUrl: `${origin}/u/${id}`, apiUrl: `${origin}/api/drop/${id}`, expiresAt }), request);
  }

  if (path[0] === 'drop' && path.length >= 2) {
    const dropId = path[1];
    const checked = await ensureDrop(env, dropId);
    if (checked.error) return response(error(checked.error, checked.error === 'Drop not found.' ? 404 : 410), request);

    if (path.length === 2 && method === 'GET') {
      const [filesResult, textsResult] = await Promise.all([
        env.DB.prepare('SELECT id, name, content_type, size, created_at FROM files WHERE drop_id = ?1 ORDER BY created_at ASC').bind(dropId).all(),
        env.DB.prepare('SELECT id, content, created_at FROM texts WHERE drop_id = ?1 ORDER BY created_at ASC').bind(dropId).all()
      ]);
      return response(json({ drop: checked.drop, files: filesResult.results || [], texts: textsResult.results || [] }), request);
    }

    if (path.length === 3 && path[2] === 'presign' && method === 'POST') {
      const input = await body();
      const name = String(input.name || 'file').slice(0, 240);
      const contentType = String(input.contentType || 'application/octet-stream').slice(0, 200);
      const fileId = token(12);
      const key = fileObjectKey(dropId, fileId, name);
      let uploadUrl;
      try {
        uploadUrl = await presignedPut(env, key, contentType, 3600);
      } catch (cause) {
        console.error(cause);
        return response(error('R2 signing is not configured yet.', 500), request);
      }
      return response(json({ fileId, key, uploadUrl, expiresIn: 3600 }), request);
    }

    if (path.length === 3 && path[2] === 'complete' && method === 'POST') {
      const input = await body();
      const fileId = String(input.fileId || '');
      const name = String(input.name || 'file').slice(0, 240);
      const key = String(input.key || '');
      const contentType = String(input.contentType || 'application/octet-stream').slice(0, 200);
      const size = Math.max(0, Number(input.size || 0));
      if (!fileId || !key.startsWith(`drops/${dropId}/`)) return response(error('Invalid upload completion payload.'), request);
      await env.DB.prepare('INSERT INTO files (id, drop_id, name, object_key, content_type, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .bind(fileId, dropId, name, key, contentType, size, now()).run();
      const origin = appOrigin(request, env);
      return response(json({ ok: true, file: { id: fileId, name, content_type: contentType, size, downloadUrl: `${origin}/d/${fileId}` } }), request);
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
      const file = await env.DB.prepare('SELECT object_key FROM files WHERE id = ?1 AND drop_id = ?2').bind(fileId, dropId).first();
      if (!file) return response(error('File not found.', 404), request);
      try { await env.BUCKET.delete(file.object_key); } catch (cause) { console.error(cause); }
      await env.DB.prepare('DELETE FROM files WHERE id = ?1 AND drop_id = ?2').bind(fileId, dropId).run();
      return response(json({ ok: true }), request);
    }
  }

  return response(error('API route not found.', 404), request);
}
