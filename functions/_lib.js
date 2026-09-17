const TOKEN_BYTES = 18;
const AUTH_COOKIE = 'pratilipi_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  return { key, milliseconds: EXPIRY_OPTIONS[key], expiresAt: now() + EXPIRY_OPTIONS[key] };
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

export async function sha1Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cloudinaryEnv(env) {
  if (!env.CLOUDINARY_CLOUD_NAME) throw new Error('Cloudinary cloud name is not configured.');
  return env.CLOUDINARY_CLOUD_NAME;
}

export function cloudinaryUploadUrl(env) {
  return `https://api.cloudinary.com/v1_1/${cloudinaryEnv(env)}/auto/upload`;
}

export function validateCloudinaryUrl(env, value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' &&
      url.pathname.startsWith(`/${cloudinaryEnv(env)}/`);
  } catch {
    return false;
  }
}

export async function destroyCloudinaryAsset(env, { publicId, resourceType = 'raw', invalidate = true }) {
  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary API key/secret are required for deletion cleanup.');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    invalidate: invalidate ? 'true' : 'false',
    public_id: publicId,
    timestamp: String(timestamp)
  };
  const serialized = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  const signature = await sha1Hex(`${serialized}${env.CLOUDINARY_API_SECRET}`);
  const form = new URLSearchParams({
    ...params,
    api_key: env.CLOUDINARY_API_KEY,
    signature
  });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryEnv(env)}/${resourceType}/destroy`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.result && !['ok', 'not found'].includes(data.result))) {
    throw new Error(`Cloudinary deletion failed: ${data.error?.message || data.result || response.status}`);
  }
  return data;
}

function authConfigured(env) {
  return Boolean(String(env?.PRATILIPI_LOGIN_ID || '').trim() && String(env?.PRATILIPI_PASSKEY || '').trim());
}

function base64urlEncode(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function authCryptoKey(env) {
  const material = `${env.PRATILIPI_PASSKEY}|${env.PRATILIPI_LOGIN_ID}|pratilipi-session-v1`;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(material),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signSessionPayload(env, payload) {
  const key = await authCryptoKey(env);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64urlEncode(new Uint8Array(signature));
}

async function verifySessionPayload(env, payload, signature) {
  try {
    const key = await authCryptoKey(env);
    return await crypto.subtle.verify('HMAC', key, base64urlDecode(signature), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

export async function getAuthSession(request, env) {
  if (!authConfigured(env)) return null;
  const value = readCookie(request, AUTH_COOKIE);
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!(await verifySessionPayload(env, payload, signature))) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64urlDecode(payload)));
    if (!decoded || Number(decoded.exp) <= now() || decoded.sub !== env.PRATILIPI_LOGIN_ID) return null;
    return { loginId: decoded.sub, expiresAt: Number(decoded.exp) };
  } catch {
    return null;
  }
}

export async function createAuthCookie(env) {
  const payload = base64urlEncode(JSON.stringify({
    sub: String(env.PRATILIPI_LOGIN_ID),
    exp: now() + SESSION_TTL_MS,
    nonce: token(18)
  }));
  const signature = await signSessionPayload(env, payload);
  const value = `${payload}.${signature}`;
  return `${AUTH_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function clearAuthCookie() {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function requireAuth(request, env) {
  if (!authConfigured(env)) return error('Authentication is not configured. Add PRATILIPI_LOGIN_ID and PRATILIPI_PASSKEY in Cloudflare.', 503);
  const session = await getAuthSession(request, env);
  if (!session) return error('Authentication required.', 401);
  return null;
}

export function authIsConfigured(env) {
  return authConfigured(env);
}

export async function getDrop(env, id) {
  return env.DB.prepare('SELECT * FROM drops WHERE id = ?1').bind(id).first();
}

export async function ensureDrop(env, id) {
  const drop = await getDrop(env, id);
  if (!drop) return { error: 'Drop not found.' };
  if (drop.expires_at && Number(drop.expires_at) <= now()) return { error: 'This drop has expired.' };
  return { drop };
}

export function appOrigin(request) {
  return new URL(request.url).origin;
}
