import { json, error, readJson } from '../lib/http.js';
import { clientIp, consume, hashIp } from '../lib/ratelimit.js';
import { CONSENT_VERSION, validateEmail } from '../lib/email.js';

const ATTEMPTS_PER_HOUR = 5;
const HOUR = 60 * 60 * 1000;

/**
 * Forms filled in faster than this were not filled in by a person. The page
 * reports how long it was open; a bot posting straight to the endpoint sends
 * nothing, which counts as zero.
 */
export const MIN_FILL_MS = 1500;

/**
 * Join the waitlist, or leave it ({ email, remove: true }).
 *
 * Every accepted request gets the same answer whether or not the address was
 * already on the list, so the form cannot be used to find out who signed up.
 * Requests that look automated (the hidden `website` field filled in, or the
 * form sent too quickly) get that same answer too, and are dropped -- telling
 * a bot it was caught only teaches it to try harder.
 */
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);

  const salt = env.RATE_SALT || env.ADMIN_TOKEN || 'trump-or-toddler';
  const bucket = `waitlist:${await hashIp(clientIp(request), salt)}`;
  const limit = await consume(env.DB, bucket, { limit: ATTEMPTS_PER_HOUR, windowMs: HOUR });
  if (!limit.allowed) {
    return error('That is a few tries already. Give it an hour.', 429, {
      'Retry-After': String(limit.retryAfter),
    });
  }

  const check = validateEmail(body.email);
  if (!check.ok) return error(check.error);
  const email = check.value;

  const remove = body.remove === true;
  const looksAutomated =
    (typeof body.website === 'string' && body.website.trim() !== '') || !(Number(body.elapsedMs) >= MIN_FILL_MS);

  if (remove) {
    if (!looksAutomated) await env.DB.prepare('DELETE FROM waitlist WHERE email = ?').bind(email).run();
    return json({ ok: true, removed: true });
  }

  if (body.consent !== true) {
    return error('Please tick the box so we are allowed to email you.');
  }

  if (!looksAutomated) {
    await env.DB.prepare('INSERT OR IGNORE INTO waitlist (email, consent) VALUES (?, ?)')
      .bind(email, CONSENT_VERSION)
      .run();
  }
  return json({ ok: true }, 201);
}
