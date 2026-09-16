import { AwsClient } from 'aws4fetch';

const TOKEN_BYTES = 18;

export const EXPIRY_OPTIONS = Object.freeze({
  '1h': 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000
});

export const DEFAULT_EXPIRY = '1d';

export function token(bytes = TOKEN_BYTES) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return [...array].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function now() {
  return Date.now();
}

export function resolveExpiry(value = DEFAULT_EXPIRY) {
  const key = Object.prototype.hasOwnProperty.call(EXPIRY_OPTIONS, value) ? value : DEFAULT_EXPIRY;
  const milliseconds = EXPIRY_OPTIONS[key];
  return { key, milliseconds, expiresAt: now() + milliseconds };
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {})
    }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, { status });
}

export function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export function withCors(response, request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function sanitizeFilename(name) {
  return (name || 'download').replace(/[\\"\r\n]/g, '_').slice(0, 240);
}

export function contentDisposition(filename) {
  const safe = sanitizeFilename(filename);
  const encoded = encodeURIComponent(filename || safe).replace(/['()]/g, escape);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export function r2Client(env) {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    throw new Error('R2 signing environment variables are not configured.');
  }
  return new AwsClient({
    service: 's3',
    region: 'auto',
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  });
}

export function r2ObjectUrl(env, key) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${encodedKey}`;
}

export async function presignedPut(env, key, contentType, expires = 3600) {
  const client = r2Client(env);
  const url = new URL(r2ObjectUrl(env, key));
  url.searchParams.set('X-Amz-Expires', String(expires));
  const signed = await client.sign(new Request(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType || 'application/octet-stream' }
  }), { aws: { signQuery: true } });
  return signed.url.toString();
}

export async function presignedGet(env, key, filename, expires = 86400) {
  const client = r2Client(env);
  const url = new URL(r2ObjectUrl(env, key));
  url.searchParams.set('X-Amz-Expires', String(expires));
  url.searchParams.set('response-content-disposition', contentDisposition(filename));
  url.searchParams.set('response-content-type', 'application/octet-stream');
  const signed = await client.sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } });
  return signed.url.toString();
}

export function fileObjectKey(dropId, fileId, filename) {
  const normalized = (filename || 'file').normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/\s+/g, '-').slice(0, 160);
  return `drops/${dropId}/${fileId}-${normalized}`;
}

export async function getDrop(env, id) {
  return env.DB.prepare('SELECT * FROM drops WHERE id = ?1').bind(id).first();
}

export async function ensureDrop(env, id) {
  const drop = await getDrop(env, id);
  if (!drop) return { error: 'Drop not found.' };
  if (drop.expires_at && Number(drop.expires_at) < now()) return { error: 'This drop has expired.' };
  return { drop };
}

export function appOrigin(request, env) {
  return env.APP_ORIGIN || new URL(request.url).origin;
}
