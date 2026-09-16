export async function onRequest({ request, env }) {
  return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
}
