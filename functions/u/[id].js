export async function onRequest({ request, env }) {
  // A shared Drop is a client-rendered public view. Always serve the application
  // shell for this route rather than relying on a static-host SPA fallback, which
  // is not available for Pages Function routes.
  const response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
