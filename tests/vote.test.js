import { describe, it, expect, beforeEach } from 'vitest';
import { onRequestPost as vote } from '../src/api/vote.js';
import { onRequestGet as listStatements } from '../src/api/statements.js';
import { createTestDb, addStatement, getStatement, getVote, postJson, makeEnv } from './helpers/d1.js';

const PLAYER_A = 'player-aaaaaaaa';
const PLAYER_B = 'player-bbbbbbbb';

let db;
let env;

beforeEach(() => {
  db = createTestDb();
  env = makeEnv(db);
});

const castVote = (body, options) =>
  vote({ request: postJson('https://example.test/api/vote', body, options), env });

describe('vote counting', () => {
  it('records a vote and returns the updated counts', async () => {
    const id = addStatement(db, { text: 'Wears diapers.' });

    const response = await castVote({ statementId: id, playerId: PLAYER_A, choice: 'toddler' });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ counted: true, trump_votes: 0, toddler_votes: 1 });
    expect(getStatement(db, id)).toMatchObject({ trump_votes: 0, toddler_votes: 1 });
  });

  it('counts each side into its own column', async () => {
    const id = addStatement(db, { text: 'Would like a parade.' });

    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' });
    await castVote({ statementId: id, playerId: PLAYER_B, choice: 'toddler' });

    expect(getStatement(db, id)).toMatchObject({ trump_votes: 1, toddler_votes: 1 });
  });

  it('counts a player only once per statement, however often they ask', async () => {
    const id = addStatement(db, { text: 'Has tantrums.' });

    const first = await (await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' })).json();
    const second = await (await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' })).json();
    const switched = await (await castVote({ statementId: id, playerId: PLAYER_A, choice: 'toddler' })).json();

    expect(first.counted).toBe(true);
    expect(second.counted).toBe(false);
    expect(switched.counted).toBe(false);
    // Neither the repeat nor the change of mind moves the numbers.
    expect(getStatement(db, id)).toMatchObject({ trump_votes: 1, toddler_votes: 0 });
  });

  it('still returns the current split to a player who already voted', async () => {
    const id = addStatement(db, { text: 'Throws food.', trump: 9, toddler: 0 });

    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' });
    const repeat = await (await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' })).json();

    expect(repeat).toMatchObject({ counted: false, trump_votes: 10, toddler_votes: 0 });
  });

  it('keeps the counts of different statements separate', async () => {
    const one = addStatement(db, { text: 'Needs a nap.' });
    const two = addStatement(db, { text: 'Would like a parade.' });

    await castVote({ statementId: one, playerId: PLAYER_A, choice: 'trump' });
    await castVote({ statementId: two, playerId: PLAYER_A, choice: 'toddler' });

    expect(getStatement(db, one)).toMatchObject({ trump_votes: 1, toddler_votes: 0 });
    expect(getStatement(db, two)).toMatchObject({ trump_votes: 0, toddler_votes: 1 });
  });

  it('returns the source note so the reveal can show it', async () => {
    const id = addStatement(db, { text: 'Would like a parade.', sourceNote: 'Reported at the time.' });

    const data = await (await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' })).json();
    expect(data.source_note).toBe('Reported at the time.');
  });
});

describe('vote validation', () => {
  it('rejects a choice that is neither side', async () => {
    const id = addStatement(db, { text: 'Has tantrums.' });
    const response = await castVote({ statementId: id, playerId: PLAYER_A, choice: 'both' });

    expect(response.status).toBe(400);
    expect(getStatement(db, id)).toMatchObject({ trump_votes: 0, toddler_votes: 0 });
  });

  it('rejects a missing or malformed player id', async () => {
    const id = addStatement(db, { text: 'Has tantrums.' });
    expect((await castVote({ statementId: id, choice: 'trump' })).status).toBe(400);
    expect((await castVote({ statementId: id, playerId: 'short', choice: 'trump' })).status).toBe(400);
    expect((await castVote({ statementId: id, playerId: 'has spaces and stuff', choice: 'trump' })).status).toBe(400);
  });

  it('rejects a statement id that is not a positive integer', async () => {
    expect((await castVote({ statementId: 'abc', playerId: PLAYER_A, choice: 'trump' })).status).toBe(400);
    expect((await castVote({ statementId: -1, playerId: PLAYER_A, choice: 'trump' })).status).toBe(400);
  });

  it('will not accept votes on a pending statement', async () => {
    const id = addStatement(db, { text: 'Not approved yet.', status: 'pending' });
    const response = await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' });

    expect(response.status).toBe(404);
    expect(getStatement(db, id)).toMatchObject({ trump_votes: 0, toddler_votes: 0 });
  });

  it('will not accept votes on a hidden statement', async () => {
    const id = addStatement(db, { text: 'Taken out of play.', status: 'hidden' });
    expect((await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' })).status).toBe(404);
  });
});

describe('answers that came too fast to be real', () => {
  it('does not count a vote cast quicker than anyone could read the statement', async () => {
    const id = addStatement(db, { text: 'Refuses to wear a coat, no matter how cold it is.' });

    const response = await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump', decisionMs: 120 });

    expect(await response.json()).toMatchObject({ counted: false, trump_votes: 0, toddler_votes: 0 });
    expect(getStatement(db, id)).toMatchObject({ trump_votes: 0, toddler_votes: 0 });
  });

  it('still records the row, so a click-through does not see it again', async () => {
    const id = addStatement(db, { text: 'Has tantrums.' });
    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump', decisionMs: 50 });

    expect(getVote(db, id, PLAYER_A)).toMatchObject({ choice: 'trump', decision_ms: 50 });
  });

  it('will not let someone re-vote properly after a discarded one', async () => {
    const id = addStatement(db, { text: 'Throws food.' });
    await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump', decisionMs: 50 });

    const retry = await (await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump', decisionMs: 5000 })).json();

    expect(retry.counted).toBe(false);
    expect(getStatement(db, id)).toMatchObject({ trump_votes: 0 });
  });

  it('counts a vote from someone who actually stopped to think', async () => {
    const id = addStatement(db, { text: 'Would like a parade.' });

    const response = await castVote({ statementId: id, playerId: PLAYER_A, choice: 'toddler', decisionMs: 2400 });

    expect(await response.json()).toMatchObject({ counted: true, toddler_votes: 1 });
    expect(getVote(db, id, PLAYER_A).decision_ms).toBe(2400);
  });

  it('counts votes on the threshold itself', async () => {
    const id = addStatement(db, { text: 'Wears diapers.' });
    const response = await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump', decisionMs: 800 });
    expect(await response.json()).toMatchObject({ counted: true });
  });

  it('counts a vote with no timing rather than silently dropping it', async () => {
    // A stale cached script would send no timing. Better to trust it than to
    // stop recording votes without anyone noticing.
    const id = addStatement(db, { text: 'Needs help with buttons.' });
    const response = await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump' });

    expect(await response.json()).toMatchObject({ counted: true, trump_votes: 1 });
    expect(getVote(db, id, PLAYER_A).decision_ms).toBeNull();
  });

  it('ignores a nonsense timing value instead of trusting it', async () => {
    const id = addStatement(db, { text: 'Gets carried when tired.' });
    const response = await castVote({ statementId: id, playerId: PLAYER_A, choice: 'trump', decisionMs: 'quick' });
    expect(await response.json()).toMatchObject({ counted: true });
  });
});

describe('what players are served', () => {
  it('only lists approved statements', async () => {
    addStatement(db, { text: 'Live one.', status: 'approved' });
    addStatement(db, { text: 'Waiting one.', status: 'pending' });
    addStatement(db, { text: 'Hidden one.', status: 'hidden' });

    const { statements } = await (await listStatements({ env })).json();

    expect(statements.map((s) => s.text)).toEqual(['Live one.']);
  });
});
