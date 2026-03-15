/**
 * Cloudflare Worker — Framer Site Mirror
 *
 * Routes page requests to the correct HTML file and serves
 * static assets from the dist/ directory with proper headers.
 *
 * CUSTOMIZE: Update the `routes` object below with your site's pages.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;

    // CUSTOMIZE: Map URL paths to HTML files
    const routes = {
      '/': '/index.html',
      // '/about': '/about.html',
      // '/contact': '/contact.html',
      // '/article/my-post': '/article-my-post.html',
    };

    if (routes[path]) {
      path = routes[path];
    }

    try {
      const asset = await env.ASSETS.fetch(new Request(new URL(path, request.url), request));
      if (asset.status === 200) {
        const headers = new Headers(asset.headers);

        // Cache immutable assets for 1 year
        if (path.startsWith('/_deps/')) {
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (path.endsWith('.html')) {
          headers.set('Cache-Control', 'public, max-age=3600');
        }

        // CORS for font files
        if (path.endsWith('.woff2') || path.endsWith('.woff')) {
          headers.set('Access-Control-Allow-Origin', '*');
        }

        return new Response(asset.body, { status: asset.status, headers });
      }
    } catch {}

    // 404 fallback
    try {
      const notFound = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url), request));
      return new Response(notFound.body, { status: 404, headers: notFound.headers });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  },
};
