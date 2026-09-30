import { json, error, readJson } from '../lib/http.js';
import { clientIp, consume, hashIp } from '../lib/ratelimit.js';
import { MIN_DECISION_MS } from '../../public/lib/game.js';

const VOTES_PER_HOUR = 200;
const HOUR = 60 * 60 * 1000;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Whether this answer came fast enough to have been read.
 *
 * The timing comes from the player's own browser, so it is a hygiene filter
 * against genuine click-through rather than a defence against someone
 * determined -- they could send any number they liked. A missing value counts,
 * so a stale cached script does not silently stop recording votes.
 */
function wasConsidered(decisionMs) {
  if (decisionMs === null || decisionMs === undefined) return true;
  const ms = Number(decisionMs);
  return !Number.isFinite(ms) || ms >= MIN_DECISION_MS;
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const statementId = Number(body.statementId);
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  const choice = body.choice === 'trump' || body.choice === 'toddler' ? body.choice : null;
  const decisionMs = Number.isFinite(Number(body.decisionMs)) ? Math.round(Number(body.decisionMs)) : null;

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
  // if the insert changes nothing, this player already voted.
  const insert = await env.DB.prepare(
    'INSERT OR IGNORE INTO votes (statement_id, player_id, choice, decision_ms) VALUES (?, ?, ?, ?)',
  )
    .bind(statementId, playerId, choice, decisionMs)
    .run();

  const isNew = (insert.meta?.changes ?? 0) === 1;
  // A vote too fast to have been read still gets a row, so the statement is not
  // shown again, but it does not move the numbers.
  const counted = isNew && wasConsidered(decisionMs);
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
