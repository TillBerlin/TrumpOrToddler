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
export async function consume(db, bucket, { limit, windowMs, now = Date.now() }) {
  const cutoff = now - windowMs;
  await db.prepare('DELETE FROM rate_events WHERE bucket = ? AND created_at < ?').bind(bucket, cutoff).run();

  const row = await db
    .prepare('SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM rate_events WHERE bucket = ?')
    .bind(bucket)
    .first();

  if ((row?.n ?? 0) >= limit) {
    const oldest = row?.oldest ?? now;
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }

  await db.prepare('INSERT INTO rate_events (bucket, created_at) VALUES (?, ?)').bind(bucket, now).run();
  return { allowed: true, retryAfter: 0 };
}
