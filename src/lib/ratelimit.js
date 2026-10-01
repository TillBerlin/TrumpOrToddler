/**
 * A small IP rate limiter backed by D1.
 *
 * Addresses are never stored: they are hashed with a salt first, and rows
 * outside the current window are deleted on every check, so the table holds
 * only what the limiter needs right now.
 */

const encoder = new TextEncoder();

export async function hashIp(ip, salt) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${ip || 'unknown'}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || '';
}

/**
 * Count this action against the bucket's allowance.
 *
 * @returns {{allowed: boolean, retryAfter: number}} retryAfter is in seconds
 */
/**
 * The longest window any caller uses. Rows older than this are of no use to
 * anyone, so they go. Raise this if a limiter ever needs a window longer than
 * an hour, or its rows will be swept while it still needs them.
 */
const RETENTION_MS = 60 * 60 * 1000;

export async function consume(db, bucket, { limit, windowMs, now = Date.now() }) {
  // Housekeeping, and only that: sweep every expired row rather than just this
  // bucket's. Deleting per bucket meant somebody who acted once and never came
  // back left their row sitting here indefinitely, because nothing ever looked
  // at that bucket again.
  const sweepBefore = now - Math.max(windowMs, RETENTION_MS);
  await db.prepare('DELETE FROM rate_events WHERE created_at < ?').bind(sweepBefore).run();

  // The window is enforced here rather than by the sweep above. Letting
  // deletion decide what counts would tie this caller's limit to whatever
  // horizon the sweep happens to use.
  const cutoff = now - windowMs;
  const row = await db
    .prepare('SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM rate_events WHERE bucket = ? AND created_at >= ?')
    .bind(bucket, cutoff)
    .first();

  if ((row?.n ?? 0) >= limit) {
    const oldest = row?.oldest ?? now;
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }

  await db.prepare('INSERT INTO rate_events (bucket, created_at) VALUES (?, ?)').bind(bucket, now).run();
  return { allowed: true, retryAfter: 0 };
}
