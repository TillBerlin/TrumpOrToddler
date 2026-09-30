import { json, error } from '../../lib/http.js';
import { requireAdmin } from '../../lib/admin.js';

/** Everything the admin page needs, in one request. */
export async function onRequestGet({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, text, source_note, status, trump_votes, toddler_votes, funny_votes, meh_votes, created_at
         FROM statements
        ORDER BY created_at DESC, id DESC`,
    ).all();

    const all = results ?? [];
    return json({
      pending: all.filter((s) => s.status === 'pending'),
      approved: all.filter((s) => s.status === 'approved'),
      hidden: all.filter((s) => s.status === 'hidden'),
    });
  } catch (err) {
    return error('Could not load statements.', 500);
  }
}
