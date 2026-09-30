import { json, error, readJson } from '../lib/http.js';
import { clientIp, consume, hashIp } from '../lib/ratelimit.js';
import { validateSubmission } from '../lib/text.js';

const SUBMISSIONS_PER_HOUR = 5;
const HOUR = 60 * 60 * 1000;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const check = validateSubmission({ text: body.text, sourceNote: body.sourceNote });
  if (!check.ok) return error(check.error);

  const salt = env.RATE_SALT || env.ADMIN_TOKEN || 'trump-or-toddler';
  const bucket = `submit:${await hashIp(clientIp(request), salt)}`;
  const limit = await consume(env.DB, bucket, { limit: SUBMISSIONS_PER_HOUR, windowMs: HOUR });
  if (!limit.allowed) {
    return error('You have sent us a few already. Try again in an hour.', 429, {
      'Retry-After': String(limit.retryAfter),
    });
  }

  const { text, sourceNote, normText } = check.value;

  // norm_text is UNIQUE, so a duplicate quietly changes nothing.
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO statements (text, norm_text, source_note, status)
     VALUES (?, ?, ?, 'pending')`,
  )
    .bind(text, normText, sourceNote)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return error('Someone already suggested that one.', 409);
  }

  return json({ ok: true }, 201);
}
