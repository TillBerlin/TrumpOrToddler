import { describe, it, expect, beforeEach } from 'vitest';
import { onRequestPost as submit } from '../functions/api/submit.js';
import { createTestDb, postJson, makeEnv } from './helpers/d1.js';

let db;
let env;

beforeEach(() => {
  db = createTestDb();
  env = makeEnv(db);
});

const send = (body, options) => submit({ request: postJson('https://example.test/api/submit', body, options), env });
const rows = () => db.raw.prepare('SELECT * FROM statements ORDER BY id').all();

describe('submitting a statement', () => {
  it('stores it as pending, not live', async () => {
    const response = await send({ text: 'Refuses to nap.' });

    expect(response.status).toBe(201);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ text: 'Refuses to nap.', status: 'pending' });
  });

  it('keeps an optional source note', async () => {
    await send({ text: 'Would like a parade.', sourceNote: 'https://example.com/story' });
    expect(rows()[0].source_note).toBe('https://example.com/story');
  });

  it('strips HTML before storing', async () => {
    await send({ text: '<script>alert(1)</script>Has tantrums.' });
    expect(rows()[0].text).toBe('alert(1) Has tantrums.');
    expect(rows()[0].text).not.toContain('<');
  });

  it('rejects empty text', async () => {
    expect((await send({ text: '   ' })).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('rejects text over 120 characters', async () => {
    expect((await send({ text: 'a'.repeat(121) })).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('rejects a duplicate regardless of case and spacing', async () => {
    expect((await send({ text: 'Wears diapers.' })).status).toBe(201);

    const duplicate = await send({ text: '   WEARS   diapers.  ' });
    expect(duplicate.status).toBe(409);
    expect(rows()).toHaveLength(1);
  });

  it('rejects a statement that duplicates one already approved', async () => {
    db.raw
      .prepare(`INSERT INTO statements (text, norm_text, status) VALUES ('Wears diapers.', 'wears diapers', 'approved')`)
      .run();

    expect((await send({ text: 'wears diapers' })).status).toBe(409);
    expect(rows()).toHaveLength(1);
  });

  it('stops after five submissions from one address within the hour', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await send({ text: `Statement number ${i}.` })).status).toBe(201);
    }

    const sixth = await send({ text: 'One too many.' });
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('Retry-After')).toBeTruthy();
    expect(rows()).toHaveLength(5);
  });

  it('does not hold one address against another', async () => {
    for (let i = 0; i < 5; i += 1) await send({ text: `Statement number ${i}.` }, { ip: '198.51.100.1' });

    const other = await send({ text: 'From somewhere else.' }, { ip: '198.51.100.2' });
    expect(other.status).toBe(201);
  });
});
