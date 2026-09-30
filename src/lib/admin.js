import { error, secretsMatch } from './http.js';

/**
 * Admin routes are protected by a single shared secret in ADMIN_TOKEN --
 * no accounts, no sessions. Returns a Response when the caller should be
 * turned away, or null when they may proceed.
 */
export function requireAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) {
    return error('ADMIN_TOKEN is not set on this deployment, so the admin page is disabled.', 503);
  }
  const provided = request.headers.get('X-Admin-Token') || '';
  if (!secretsMatch(provided, expected)) {
    return error('Not authorised.', 401);
  }
  return null;
}
