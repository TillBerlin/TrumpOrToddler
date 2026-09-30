import { describe, it, expect, beforeEach } from 'vitest';
import { consume, hashIp } from '../src/lib/ratelimit.js';
import { createTestDb } from './helpers/d1.js';

let db;
beforeEach(() => {
  db = createTestDb();
});

describe('rate limiting', () => {
  it('allows up to the limit and then refuses', async () => {
    const options = { limit: 3, windowMs: 60_000, now: 1_000_000 };

    expect((await consume(db, 'vote:a', options)).allowed).toBe(true);
    expect((await consume(db, 'vote:a', options)).allowed).toBe(true);
    expect((await consume(db, 'vote:a', options)).allowed).toBe(true);

    const refused = await consume(db, 'vote:a', options);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(0);
  });

  it('counts buckets separately, so one address cannot lock out another', async () => {
    const options = { limit: 1, windowMs: 60_000, now: 1_000_000 };

    expect((await consume(db, 'vote:a', options)).allowed).toBe(true);
    expect((await consume(db, 'vote:a', options)).allowed).toBe(false);
    expect((await consume(db, 'vote:b', options)).allowed).toBe(true);
  });

  it('lets the same caller back in once the window has passed', async () => {
    const start = 1_000_000;
    expect((await consume(db, 'vote:a', { limit: 1, windowMs: 60_000, now: start })).allowed).toBe(true);
    expect((await consume(db, 'vote:a', { limit: 1, windowMs: 60_000, now: start + 1_000 })).allowed).toBe(false);
    expect((await consume(db, 'vote:a', { limit: 1, windowMs: 60_000, now: start + 60_001 })).allowed).toBe(true);
  });

  it('drops rows it no longer needs instead of keeping a log', async () => {
    const start = 1_000_000;
    await consume(db, 'vote:a', { limit: 5, windowMs: 1_000, now: start });
    await consume(db, 'vote:a', { limit: 5, windowMs: 1_000, now: start + 5_000 });

    const { n } = db.raw.prepare('SELECT COUNT(*) AS n FROM rate_events').get();
    expect(n).toBe(1);
  });
});

describe('hashIp', () => {
  it('never returns the address itself', async () => {
    const hash = await hashIp('203.0.113.5', 'salt');
    expect(hash).not.toContain('203.0.113.5');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for one address and different for another', async () => {
    expect(await hashIp('203.0.113.5', 'salt')).toBe(await hashIp('203.0.113.5', 'salt'));
    expect(await hashIp('203.0.113.5', 'salt')).not.toBe(await hashIp('203.0.113.6', 'salt'));
  });

  it('changes with the salt, so hashes are not portable between deployments', async () => {
    expect(await hashIp('203.0.113.5', 'one')).not.toBe(await hashIp('203.0.113.5', 'two'));
  });
});
