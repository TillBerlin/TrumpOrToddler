/**
 * The Worker entry point.
 *
 * Static files in public/ are served by Cloudflare before this runs, so this
 * only ever sees requests that did not match a file: the /api/... endpoints,
 * and anything genuinely missing.
 */

import { onRequestGet as getStatements } from './api/statements.js';
import { onRequestPost as postVote } from './api/vote.js';
import { onRequestPost as postSubmit } from './api/submit.js';
import { onRequestGet as getAdminStatements } from './api/admin/statements.js';
import { onRequestPost as postAdminAction } from './api/admin/action.js';
import { error } from './lib/http.js';

const routes = {
  '/api/statements': { GET: getStatements },
  '/api/vote': { POST: postVote },
  '/api/submit': { POST: postSubmit },
  '/api/admin/statements': { GET: getAdminStatements },
  '/api/admin/action': { POST: postAdminAction },
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
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
