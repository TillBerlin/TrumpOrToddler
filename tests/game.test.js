import { describe, it, expect } from 'vitest';
import { computeSplit, balanceScore, pickNext, LOW_VOTE_THRESHOLD } from '../public/lib/game.js';

const statement = (id, trump, toddler) => ({ id, trump_votes: trump, toddler_votes: toddler });

/** rand() that walks a fixed list, so every pick in a test is deterministic. */
const sequence = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

const NEVER_FRESH = () => 0.99; // above LOW_VOTE_CHANCE, so the fresh branch is skipped
const ALWAYS_FRESH = sequence(0.01, 0); //  below it, then index 0 of the fresh pool

describe('computeSplit', () => {
  it('sits at 50/50 before anyone has voted', () => {
    expect(computeSplit(statement(1, 0, 0))).toEqual({ total: 0, trumpPct: 50, toddlerPct: 50 });
  });

  it('reports the real split once there are votes', () => {
    expect(computeSplit(statement(1, 3, 1))).toEqual({ total: 4, trumpPct: 75, toddlerPct: 25 });
  });

  it('always produces two percentages that add up to 100', () => {
    for (const [trump, toddler] of [[1, 2], [1, 3], [7, 11], [1, 0], [0, 1], [33, 67], [1, 199]]) {
      const { trumpPct, toddlerPct } = computeSplit(statement(1, trump, toddler));
      expect(trumpPct + toddlerPct).toBe(100);
    }
  });

  it('ignores negative counts rather than producing nonsense', () => {
    expect(computeSplit({ trump_votes: -5, toddler_votes: 10 })).toEqual({
      total: 10,
      trumpPct: 0,
      toddlerPct: 100,
    });
  });
});

describe('balanceScore', () => {
  it('is 0 for a perfectly even split and 0.5 for a unanimous one', () => {
    expect(balanceScore(statement(1, 50, 50))).toBe(0);
    expect(balanceScore(statement(2, 40, 0))).toBe(0.5);
  });

  it('ranks a closer split below a lopsided one', () => {
    expect(balanceScore(statement(1, 52, 48))).toBeLessThan(balanceScore(statement(2, 80, 20)));
  });
});

describe('pickNext', () => {
  it('returns null when there is nothing to show', () => {
    expect(pickNext([], [], NEVER_FRESH)).toBeNull();
  });

  it("returns null once the player has voted on everything", () => {
    const all = [statement(1, 30, 30), statement(2, 40, 20)];
    expect(pickNext(all, [1, 2], NEVER_FRESH)).toBeNull();
  });

  it('never returns a statement the player has already seen', () => {
    const all = [statement(1, 30, 30), statement(2, 31, 29), statement(3, 40, 20)];
    // #1 is the most even, so it would win if `seen` were not respected.
    expect(pickNext(all, [1], NEVER_FRESH).id).toBe(2);
  });

  it('accepts the seen list as a Set as well as an array', () => {
    const all = [statement(1, 30, 30), statement(2, 31, 29)];
    expect(pickNext(all, new Set([1]), NEVER_FRESH).id).toBe(2);
  });

  it('prefers the most evenly split statement', () => {
    const all = [statement(1, 90, 10), statement(2, 51, 49), statement(3, 70, 30)];
    expect(pickNext(all, [], NEVER_FRESH).id).toBe(2);
  });

  it('breaks ties towards the statement with more votes behind it', () => {
    const all = [statement(1, 10, 10), statement(2, 100, 100)];
    expect(pickNext(all, [], NEVER_FRESH).id).toBe(2);
  });

  it('shows a barely-voted statement when the roll says so', () => {
    const all = [statement(1, 100, 100), statement(2, 1, 0)];
    expect(pickNext(all, [], ALWAYS_FRESH).id).toBe(2);
  });

  it('skips the barely-voted ones when the roll says otherwise', () => {
    const all = [statement(1, 100, 100), statement(2, 1, 0)];
    expect(pickNext(all, [], NEVER_FRESH).id).toBe(1);
  });

  it('falls back to new statements when nothing is established yet', () => {
    // Every statement is under the threshold, so the roll must not matter --
    // otherwise a brand new site would show nothing three times in four.
    const all = [statement(1, 1, 1), statement(2, 0, 0)];
    expect(pickNext(all, [], NEVER_FRESH)).not.toBeNull();
    expect(pickNext(all, [], ALWAYS_FRESH)).not.toBeNull();
  });

  it('falls back to established statements when no new ones are left', () => {
    const all = [statement(1, 100, 100)];
    expect(pickNext(all, [], ALWAYS_FRESH).id).toBe(1);
  });

  it('treats the threshold as "fewer than", not "at most"', () => {
    const atThreshold = statement(1, LOW_VOTE_THRESHOLD, 0); // established, lopsided
    const belowThreshold = statement(2, LOW_VOTE_THRESHOLD - 1, 0); // still counts as new
    expect(pickNext([atThreshold, belowThreshold], [], ALWAYS_FRESH).id).toBe(2);
    expect(pickNext([atThreshold, belowThreshold], [], NEVER_FRESH).id).toBe(1);
  });

  it('walks through every statement exactly once as the player votes', () => {
    const all = [statement(1, 60, 40), statement(2, 100, 100), statement(3, 5, 5), statement(4, 30, 31)];
    const seen = new Set();
    const order = [];

    for (let i = 0; i < all.length; i += 1) {
      const next = pickNext(all, seen, Math.random);
      expect(next).not.toBeNull();
      order.push(next.id);
      seen.add(next.id);
    }

    expect(pickNext(all, seen, Math.random)).toBeNull();
    expect(new Set(order).size).toBe(all.length);
  });
});
