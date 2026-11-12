import { json, error, readJson } from '../../lib/http.js';
import { requireAdmin } from '../../lib/admin.js';
import { validateEmail } from '../../lib/email.js';

/** Everyone on the waitlist, newest first. */
export async function onRequestGet({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const { results } = await env.DB.prepare(
    'SELECT email, consent, created_at FROM waitlist ORDER BY created_at DESC, email',
  ).all();
  const signups = results ?? [];
  return json({ count: signups.length, signups });
}

/** Take one address off the list: { email }. */
export async function onRequestPost({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const check = validateEmail(body.email);
  if (!check.ok) return error(check.error);

  const result = await env.DB.prepare('DELETE FROM waitlist WHERE email = ?').bind(check.value).run();
  if ((result.meta?.changes ?? 0) === 0) return error('That address is not on the list.', 404);
  return json({ ok: true });
}
