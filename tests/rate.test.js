import { describe, it, expect, beforeEach } from 'vitest';
import { onRequestPost as rate } from '../src/api/rate.js';
import { onRequestPost as vote } from '../src/api/vote.js';
import { createTestDb, addStatement, getStatement, getVote, postJson, makeEnv } from './helpers/d1.js';

const PLAYER_A = 'player-aaaaaaaa';
const PLAYER_B = 'player-bbbbbbbb';

let db;
let env;

beforeEach(() => {
  db = createTestDb();
  env = makeEnv(db);
});

const castVote = (body) => vote({ request: postJson('https://example.test/api/vote', { decisionMs: 3000, ...body }), env });
const sendRating = (body) => rate({ request: postJson('https://example.test/api/rate', body), env });

describe('rating a statement', () => {
  it('records a laugh against the statement', async () => {
    const id = addStatement(db, { text: 'Would like a parade.' });
    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' });

    const response = await sendRating({ statementId: id, playerId: PLAYER_A, rating: 'funny' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ counted: true });
    expect(getStatement(db, id)).toMatchObject({ funny_votes: 1, meh_votes: 0 });
  });

  it('records a shrug on the other side of the ledger', async () => {
    const id = addStatement(db, { text: 'Cannot ride a monocycle.' });
    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' });

    await sendRating({ statementId: id, playerId: PLAYER_A, rating: 'meh' });

    expect(getStatement(db, id)).toMatchObject({ funny_votes: 0, meh_votes: 1 });
  });

  it('counts each player once, however many times they press', async () => {
    const id = addStatement(db, { text: 'Has tantrums.' });
    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' });

    const first = await (await sendRating({ statementId: id, playerId: PLAYER_A, rating: 'funny' })).json();
    const second = await (await sendRating({ statementId: id, playerId: PLAYER_A, rating: 'funny' })).json();
    const changedMind = await (await sendRating({ statementId: id, playerId: PLAYER_A, rating: 'meh' })).json();

    expect(first.counted).toBe(true);
    expect(second.counted).toBe(false);
    expect(changedMind.counted).toBe(false);
    expect(getStatement(db, id)).toMatchObject({ funny_votes: 1, meh_votes: 0 });
  });

  it('adds up ratings from different players', async () => {
    const id = addStatement(db, { text: 'Throws food.' });
    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' });
    await castVote({ statementId: id, playerId: PLAYER_B, choice: 'toddler' });

    await sendRating({ statementId: id, playerId: PLAYER_A, rating: 'funny' });
    await sendRating({ statementId: id, playerId: PLAYER_B, rating: 'meh' });

    expect(getStatement(db, id)).toMatchObject({ funny_votes: 1, meh_votes: 1 });
  });

  it('ignores a rating from someone who never voted on it', async () => {
    const id = addStatement(db, { text: 'Wears diapers.' });

    const response = await sendRating({ statementId: id, playerId: PLAYER_A, rating: 'funny' });

    expect(await response.json()).toMatchObject({ counted: false });
    expect(getStatement(db, id)).toMatchObject({ funny_votes: 0 });
  });

  it('rejects anything that is not hihi or meh', async () => {
    const id = addStatement(db, { text: 'Has tantrums.' });
    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' });

    expect((await sendRating({ statementId: id, playerId: PLAYER_A, rating: 'brilliant' })).status).toBe(400);
    expect((await sendRating({ statementId: id, playerId: PLAYER_A })).status).toBe(400);
    expect((await sendRating({ statementId: id, rating: 'funny' })).status).toBe(400);
    expect(getStatement(db, id)).toMatchObject({ funny_votes: 0, meh_votes: 0 });
  });

  it('stores the rating on the vote it belongs to', async () => {
    const id = addStatement(db, { text: 'Needs constant supervision.' });
    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'toddler' });
    await sendRating({ statementId: id, playerId: PLAYER_A, rating: 'funny' });

    expect(getVote(db, id, PLAYER_A)).toMatchObject({ choice: 'toddler', rating: 'funny' });
  });
});
