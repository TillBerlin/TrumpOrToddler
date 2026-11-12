import { describe, it, expect, beforeEach } from 'vitest';
import { onRequestPost as waitlist } from '../src/api/waitlist.js';
import { onRequestGet as adminList, onRequestPost as adminRemove } from '../src/api/admin/waitlist.js';
import { validateEmail, CONSENT_VERSION } from '../src/lib/email.js';
import { createTestDb, postJson, makeEnv } from './helpers/d1.js';

let db;
let env;

beforeEach(() => {
  db = createTestDb();
  env = makeEnv(db);
});

const human = { consent: true, elapsedMs: 4000, website: '' };
const join = (body, options) =>
  waitlist({ request: postJson('https://example.test/api/waitlist', { ...human, ...body }, options), env });
const rows = () => db.raw.prepare('SELECT * FROM waitlist ORDER BY email').all();

const list = (token = 'test-token') =>
  adminList({ request: new Request('https://example.test/api/admin/waitlist', { headers: { 'X-Admin-Token': token } }), env });
const adminDelete = (email, token = 'test-token') =>
  adminRemove({
    request: postJson('https://example.test/api/admin/waitlist', { email }, { headers: { 'X-Admin-Token': token } }),
    env,
  });

describe('checking an email address', () => {
  it('accepts ordinary addresses and tidies them', () => {
    expect(validateEmail('  Till@Example.COM ')).toEqual({ ok: true, value: 'till@example.com' });
    expect(validateEmail('a.b+deck@mail.example.co.uk').ok).toBe(true);
  });

  it('refuses things that are not addresses', () => {
    for (const bad of ['', 'nope', 'a@b', 'a@b.c', 'two@@example.com', 'sp ace@example.com', '<x>@example.com', 'a..b@example.com', `${'a'.repeat(250)}@example.com`, 42]) {
      expect(validateEmail(bad).ok).toBe(false);
    }
  });
});

describe('joining the waitlist', () => {
  it('stores the address with the consent it was given under', async () => {
    const response = await join({ email: 'Fan@Example.com' });

    expect(response.status).toBe(201);
    expect(rows()).toEqual([expect.objectContaining({ email: 'fan@example.com', consent: CONSENT_VERSION })]);
  });

  it('needs the consent box ticked', async () => {
    expect((await join({ email: 'fan@example.com', consent: false })).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('rejects a malformed address', async () => {
    expect((await join({ email: 'not an email' })).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('answers the same for an address already on the list, and keeps one copy', async () => {
    const first = await join({ email: 'fan@example.com' });
    const again = await join({ email: ' FAN@example.com' });

    expect(again.status).toBe(first.status);
    expect(await again.json()).toEqual(await first.json());
    expect(rows()).toHaveLength(1);
  });

  it('quietly drops a bot that fills in the hidden field', async () => {
    const response = await join({ email: 'bot@example.com', website: 'https://spam.example' });
    expect(response.status).toBe(201);
    expect(rows()).toHaveLength(0);
  });

  it('quietly drops a form sent faster than a person could fill it in', async () => {
    expect((await join({ email: 'bot@example.com', elapsedMs: 200 })).status).toBe(201);
    expect((await join({ email: 'bot2@example.com', elapsedMs: undefined })).status).toBe(201);
    expect(rows()).toHaveLength(0);
  });

  it('stops after five tries from one address within the hour', async () => {
    for (let i = 0; i < 5; i += 1) expect((await join({ email: `fan${i}@example.com` })).status).toBe(201);

    const sixth = await join({ email: 'fan5@example.com' });
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('Retry-After')).toBeTruthy();
    expect(rows()).toHaveLength(5);

    expect((await join({ email: 'other@example.com' }, { ip: '198.51.100.9' })).status).toBe(201);
  });

  it('never stores the IP address', async () => {
    await join({ email: 'fan@example.com' }, { ip: '198.51.100.77' });
    const everything = JSON.stringify(db.raw.prepare('SELECT * FROM rate_events').all()) + JSON.stringify(rows());
    expect(everything).not.toContain('198.51.100.77');
  });
});

describe('leaving the waitlist', () => {
  it('removes the address, without needing the consent box', async () => {
    await join({ email: 'fan@example.com' });
    const response = await join({ email: 'FAN@example.com', remove: true, consent: false });

    expect(response.status).toBe(200);
    expect(rows()).toHaveLength(0);
  });

  it('gives the same answer for an address that was never on it', async () => {
    const response = await join({ email: 'stranger@example.com', remove: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, removed: true });
  });
});

describe('the admin view of the waitlist', () => {
  it('needs the admin token', async () => {
    expect((await list('wrong')).status).toBe(401);
    expect((await adminDelete('fan@example.com', 'wrong')).status).toBe(401);
  });

  it('lists everyone with a count', async () => {
    await join({ email: 'a@example.com' });
    await join({ email: 'b@example.com' });

    const data = await (await list()).json();
    expect(data.count).toBe(2);
    expect(data.signups.map((s) => s.email).sort()).toEqual(['a@example.com', 'b@example.com']);
    expect(data.signups[0]).toHaveProperty('created_at');
  });

  it('can take one address off', async () => {
    await join({ email: 'a@example.com' });

    expect((await adminDelete('a@example.com')).status).toBe(200);
    expect(rows()).toHaveLength(0);
    expect((await adminDelete('a@example.com')).status).toBe(404);
  });
});
