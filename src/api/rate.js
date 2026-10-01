import { json, error, readJson } from '../lib/http.js';
import { clientIp, consume, hashIp } from '../lib/ratelimit.js';

// Per IP, and a whole university or office shares one. Set high enough
// that a room full of people on the same Wi-Fi cannot lock each other
// out; the one-per-player database constraint is what actually protects
// the numbers.
const RATINGS_PER_HOUR = 2000;
const HOUR = 60 * 60 * 1000;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * "hihi" or "meh", collected after the result is revealed.
 *
 * This is what decides which statement comes next. Only a player who already
 * voted on a statement can rate it, and only once -- the rating column on their
 * existing vote row starts NULL and can only be filled in one time.
 */
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const statementId = Number(body.statementId);
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  const rating = body.rating === 'funny' || body.rating === 'meh' ? body.rating : null;

  if (!Number.isInteger(statementId) || statementId <= 0) return error('Unknown statement.');
  if (!PLAYER_ID_PATTERN.test(playerId)) return error('Missing or malformed player id.');
  if (!rating) return error('Rating has to be "funny" or "meh".');

  const salt = env.RATE_SALT || env.ADMIN_TOKEN || 'trump-or-toddler';
  const bucket = `rate:${await hashIp(clientIp(request), salt)}`;
  const limit = await consume(env.DB, bucket, { limit: RATINGS_PER_HOUR, windowMs: HOUR });
  if (!limit.allowed) {
    return error('Slow down a moment.', 429, { 'Retry-After': String(limit.retryAfter) });
  }

  const update = await env.DB.prepare(
    'UPDATE votes SET rating = ? WHERE statement_id = ? AND player_id = ? AND rating IS NULL',
  )
    .bind(rating, statementId, playerId)
    .run();

  const counted = (update.meta?.changes ?? 0) === 1;
  if (counted) {
    const column = rating === 'funny' ? 'funny_votes' : 'meh_votes';
    await env.DB.prepare(`UPDATE statements SET ${column} = ${column} + 1 WHERE id = ?`).bind(statementId).run();
  }

  return json({ id: statementId, counted });
}
