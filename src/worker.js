/**
 * The Worker entry point.
 *
 * Static files in public/ are served by Cloudflare before this runs, so this
 * only ever sees requests that did not match a file: the /api/... endpoints,
 * and anything genuinely missing.
 */

import { onRequestGet as getStatements } from './api/statements.js';
import { onRequestPost as postVote } from './api/vote.js';
import { onRequestPost as postRate } from './api/rate.js';
import { onRequestPost as postSubmit } from './api/submit.js';
import { onRequestGet as getAdminStatements } from './api/admin/statements.js';
import { onRequestPost as postAdminAction } from './api/admin/action.js';
import { error } from './lib/http.js';
import { previewFor } from './lib/preview.js';
import { parseSharedId } from '../public/lib/game.js';

const routes = {
  '/api/statements': { GET: getStatements },
  '/api/vote': { POST: postVote },
  '/api/rate': { POST: postRate },
  '/api/submit': { POST: postSubmit },
  '/api/admin/statements': { GET: getAdminStatements },
  '/api/admin/action': { POST: postAdminAction },
};

/**
 * Serve the game page, and for a shared link (/?s=12) rewrite the preview tags
 * so a chat shows the statement itself rather than a generic title.
 *
 * Preview bots do not run JavaScript, so this has to happen server-side. It is
 * also strictly best-effort: anything that goes wrong falls back to the page
 * with its default tags rather than failing the request.
 */
async function page(request, env, url) {
  const asset = await env.ASSETS.fetch(request);

  const id = parseSharedId(url.search);
  if (id === null || !asset.ok) return asset;

  let statement = null;
  try {
    statement = await env.DB.prepare(`SELECT text FROM statements WHERE id = ? AND status = 'approved'`)
      .bind(id)
      .first();
  } catch {
    return asset;
  }
  if (!statement) return asset;

  const { title, description } = previewFor(statement);
  const shareUrl = `${url.origin}/?s=${id}`;
  const set = (value) => ({ element: (element) => element.setAttribute('content', value) });

  return new HTMLRewriter()
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(description))
    .on('meta[property="og:url"]', set(shareUrl))
    .on('meta[name="twitter:title"]', set(title))
    .on('meta[name="twitter:description"]', set(description))
    .on('meta[name="description"]', set(description))
    .transform(asset);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // The root runs the Worker first (see wrangler.toml), so serve it here.
    if (pathname === '/') return page(request, env, url);

    const route = routes[pathname];

    if (!route) {
      return pathname.startsWith('/api/')
        ? error('No such endpoint.', 404)
        : new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }

    const handler = route[request.method === 'HEAD' ? 'GET' : request.method];
    if (!handler) {
      return error('Method not allowed.', 405, { Allow: Object.keys(route).join(', ') });
    }

    try {
      return await handler({ request, env, ctx });
    } catch {
      // Never leak a stack trace to the player; the details are in the logs.
      return error('Something went wrong.', 500);
    }
  },
};
