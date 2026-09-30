import { json, error, readJson } from '../lib/http.js';
import { clientIp, consume, hashIp } from '../lib/ratelimit.js';

const VOTES_PER_HOUR = 200;
const HOUR = 60 * 60 * 1000;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const statementId = Number(body.statementId);
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  const choice = body.choice === 'trump' || body.choice === 'toddler' ? body.choice : null;

  if (!Number.isInteger(statementId) || statementId <= 0) return error('Unknown statement.');
  if (!PLAYER_ID_PATTERN.test(playerId)) return error('Missing or malformed player id.');
  if (!choice) return error('Choice has to be "trump" or "toddler".');

  const salt = env.RATE_SALT || env.ADMIN_TOKEN || 'trump-or-toddler';
  const bucket = `vote:${await hashIp(clientIp(request), salt)}`;
  const limit = await consume(env.DB, bucket, { limit: VOTES_PER_HOUR, windowMs: HOUR });
  if (!limit.allowed) {
    return error('That is a lot of voting. Try again in a bit.', 429, { 'Retry-After': String(limit.retryAfter) });
  }

  const statement = await env.DB.prepare(
    `SELECT id, source_note FROM statements WHERE id = ? AND status = 'approved'`,
  )
    .bind(statementId)
    .first();
  if (!statement) return error('That statement is not in play.', 404);

  // One vote per (statement, player). The unique primary key does the work:
  // if the insert changes nothing, this player already voted and the counters
  // stay where they are.
  const insert = await env.DB.prepare(
    'INSERT OR IGNORE INTO votes (statement_id, player_id, choice) VALUES (?, ?, ?)',
  )
    .bind(statementId, playerId, choice)
    .run();

  const counted = (insert.meta?.changes ?? 0) === 1;
  if (counted) {
    const column = choice === 'trump' ? 'trump_votes' : 'toddler_votes';
    await env.DB.prepare(`UPDATE statements SET ${column} = ${column} + 1 WHERE id = ?`).bind(statementId).run();
  }

  const counts = await env.DB.prepare('SELECT trump_votes, toddler_votes FROM statements WHERE id = ?')
    .bind(statementId)
    .first();

  return json({
    id: statementId,
    counted,
    trump_votes: counts?.trump_votes ?? 0,
    toddler_votes: counts?.toddler_votes ?? 0,
    source_note: statement.source_note ?? null,
  });
}
