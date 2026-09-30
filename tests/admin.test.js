import { describe, it, expect, beforeEach } from 'vitest';
import { onRequestGet as adminList } from '../src/api/admin/statements.js';
import { onRequestPost as adminAction } from '../src/api/admin/action.js';
import { onRequestGet as listStatements } from '../src/api/statements.js';
import { createTestDb, addStatement, getStatement, postJson, makeEnv } from './helpers/d1.js';

const TOKEN = 'test-token';

let db;
let env;

beforeEach(() => {
  db = createTestDb();
  env = makeEnv(db);
});

const act = (body, token = TOKEN) =>
  adminAction({
    request: postJson('https://example.test/api/admin/action', body, { headers: { 'X-Admin-Token': token } }),
    env,
  });

const list = (token = TOKEN) =>
  adminList({ request: new Request('https://example.test/api/admin/statements', { headers: { 'X-Admin-Token': token } }), env });

const livePage = async () => (await (await listStatements({ env })).json()).statements;

describe('admin access', () => {
  it('refuses a missing or wrong token', async () => {
    expect((await list('')).status).toBe(401);
    expect((await list('nearly-right')).status).toBe(401);
    expect((await act({ id: 1, action: 'approve' }, 'wrong')).status).toBe(401);
  });

  it('lets the right token through', async () => {
    expect((await list()).status).toBe(200);
  });

  it('turns itself off when ADMIN_TOKEN is not configured', async () => {
    env = makeEnv(db, { ADMIN_TOKEN: undefined });
    expect((await list('anything')).status).toBe(503);
  });
});

describe('the moderation queue', () => {
  it('groups statements by status', async () => {
    addStatement(db, { text: 'Waiting.', status: 'pending' });
    addStatement(db, { text: 'Live.', status: 'approved' });
    addStatement(db, { text: 'Taken down.', status: 'hidden' });

    const data = await (await list()).json();

    expect(data.pending.map((s) => s.text)).toEqual(['Waiting.']);
    expect(data.approved.map((s) => s.text)).toEqual(['Live.']);
    expect(data.hidden.map((s) => s.text)).toEqual(['Taken down.']);
  });
});

describe('moderation actions', () => {
  it('approving puts a statement into play', async () => {
    const id = addStatement(db, { text: 'Waiting.', status: 'pending' });
    expect(await livePage()).toHaveLength(0);

    expect((await act({ id, action: 'approve' })).status).toBe(200);
    expect(await livePage()).toHaveLength(1);
  });

  it('editing then approving stores the new wording', async () => {
    const id = addStatement(db, { text: 'has tantrums', status: 'pending' });

    await act({ id, action: 'approve', text: 'Has tantrums.', sourceNote: 'Tidied up.' });

    expect(getStatement(db, id)).toMatchObject({
      text: 'Has tantrums.',
      source_note: 'Tidied up.',
      status: 'approved',
    });
  });

  it('editing an approved statement leaves it approved and keeps its votes', async () => {
    const id = addStatement(db, { text: 'Throws food', status: 'approved', trump: 12, toddler: 8 });

    await act({ id, action: 'update', text: 'Throws food.' });

    expect(getStatement(db, id)).toMatchObject({
      text: 'Throws food.',
      status: 'approved',
      trump_votes: 12,
      toddler_votes: 8,
    });
  });

  it('refuses an edit that collides with an existing statement', async () => {
    addStatement(db, { text: 'Wears diapers.', status: 'approved' });
    const id = addStatement(db, { text: 'Something else.', status: 'pending' });

    const response = await act({ id, action: 'approve', text: 'wears diapers' });

    expect(response.status).toBe(409);
    expect(getStatement(db, id)).toMatchObject({ text: 'Something else.', status: 'pending' });
  });

  it('refuses an edit that empties the statement', async () => {
    const id = addStatement(db, { text: 'Waiting.', status: 'pending' });

    expect((await act({ id, action: 'approve', text: '   ' })).status).toBe(400);
    expect(getStatement(db, id)).toMatchObject({ status: 'pending' });
  });

  it('hiding takes a statement out of play without deleting it', async () => {
    const id = addStatement(db, { text: 'Live.', status: 'approved', trump: 4, toddler: 6 });

    await act({ id, action: 'hide' });

    expect(await livePage()).toHaveLength(0);
    expect(getStatement(db, id)).toMatchObject({ status: 'hidden', trump_votes: 4, toddler_votes: 6 });
  });

  it('unhiding puts it back', async () => {
    const id = addStatement(db, { text: 'Taken down.', status: 'hidden' });

    await act({ id, action: 'unhide' });

    expect(await livePage()).toHaveLength(1);
  });

  it('rejecting removes the statement and its votes', async () => {
    const id = addStatement(db, { text: 'No thanks.', status: 'pending' });
    db.raw.prepare(`INSERT INTO votes (statement_id, player_id, choice) VALUES (?, 'player-aaaaaaaa', 'trump')`).run(id);

    await act({ id, action: 'reject' });

    expect(getStatement(db, id)).toBeUndefined();
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM votes WHERE statement_id = ?').get(id).n).toBe(0);
  });

  it('refuses an unknown action or a statement that is gone', async () => {
    const id = addStatement(db, { text: 'Live.', status: 'approved' });
    expect((await act({ id, action: 'destroy' })).status).toBe(400);
    expect((await act({ id: 9999, action: 'approve' })).status).toBe(404);
  });
});
