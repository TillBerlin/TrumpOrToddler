import { describe, it, expect } from 'vitest';
import {
  computeSplit,
  laughRate,
  laughs,
  shrugs,
  parseSharedId,
  pickNext,
  sampleBeta,
  totalVotes,
} from '../public/lib/game.js';

const statement = (id, { trump = 0, toddler = 0, funny = 0, meh = 0 } = {}) => ({
  id,
  trump_votes: trump,
  toddler_votes: toddler,
  funny_votes: funny,
  meh_votes: meh,
});

/** Seeded PRNG, so a failing test fails the same way every time. */
function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How often `pickNext` chooses each id over many runs. */
function pickShare(pool, id, runs = 4000, seed = 1) {
  const rand = seeded(seed);
  let hits = 0;
  for (let i = 0; i < runs; i += 1) if (pickNext(pool, [], rand).id === id) hits += 1;
  return hits / runs;
}

describe('parseSharedId', () => {
  it('reads the statement id out of a shared link', () => {
    expect(parseSharedId('?s=12')).toBe(12);
    expect(parseSharedId('?other=1&s=7')).toBe(7);
  });

  it('is null when there is no shared id', () => {
    expect(parseSharedId('')).toBeNull();
    expect(parseSharedId('?other=1')).toBeNull();
    expect(parseSharedId(undefined)).toBeNull();
  });

  it('treats a mangled id as absent rather than as an error', () => {
    // A link that got cut in half should still open the game.
    for (const search of ['?s=', '?s=abc', '?s=-1', '?s=0', '?s=1.5', '?s=NaN', '?s=99e99999']) {
      expect(parseSharedId(search)).toBeNull();
    }
  });
});

describe('computeSplit', () => {
  it('sits at 50/50 before anyone has voted', () => {
    expect(computeSplit(statement(1))).toEqual({ total: 0, trumpPct: 50, toddlerPct: 50 });
  });

  it('reports the real split once there are votes', () => {
    expect(computeSplit(statement(1, { trump: 3, toddler: 1 }))).toEqual({ total: 4, trumpPct: 75, toddlerPct: 25 });
  });

  it('always produces two percentages that add up to 100', () => {
    for (const [trump, toddler] of [[1, 2], [1, 3], [7, 11], [1, 0], [0, 1], [33, 67], [1, 199]]) {
      const { trumpPct, toddlerPct } = computeSplit(statement(1, { trump, toddler }));
      expect(trumpPct + toddlerPct).toBe(100);
    }
  });

  it('ignores negative counts rather than producing nonsense', () => {
    expect(computeSplit({ trump_votes: -5, toddler_votes: 10 })).toEqual({ total: 10, trumpPct: 0, toddlerPct: 100 });
    expect(totalVotes({ trump_votes: -5, toddler_votes: 10 })).toBe(10);
  });
});

describe('laughRate', () => {
  it('is null until somebody rates it, rather than pretending to be 0', () => {
    expect(laughRate(statement(1))).toBeNull();
  });

  it('is the share of raters who laughed', () => {
    expect(laughRate(statement(1, { funny: 3, meh: 1 }))).toBe(0.75);
    expect(laughs(statement(1, { funny: 3 }))).toBe(3);
    expect(shrugs(statement(1, { meh: 4 }))).toBe(4);
  });
});

describe('sampleBeta', () => {
  it('stays inside [0, 1]', () => {
    const rand = seeded(7);
    for (let i = 0; i < 2000; i += 1) {
      const draw = sampleBeta(1 + (i % 9), 1 + (i % 5), rand);
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThanOrEqual(1);
    }
  });

  it('centres on a/(a+b), which is what makes it a belief about the laugh rate', () => {
    const rand = seeded(11);
    for (const [a, b] of [[1, 1], [9, 3], [2, 8], [21, 1]]) {
      const draws = Array.from({ length: 20000 }, () => sampleBeta(a, b, rand));
      const mean = draws.reduce((x, y) => x + y, 0) / draws.length;
      expect(mean).toBeCloseTo(a / (a + b), 1);
    }
  });

  it('gets narrower as the counts grow, which is the whole point', () => {
    const rand = seeded(13);
    const spread = (a, b) => {
      const draws = Array.from({ length: 20000 }, () => sampleBeta(a, b, rand));
      const mean = draws.reduce((x, y) => x + y, 0) / draws.length;
      return Math.sqrt(draws.reduce((s, d) => s + (d - mean) ** 2, 0) / draws.length);
    };
    // Same 50% laugh rate, one backed by 4 ratings and one by 200.
    expect(spread(3, 3)).toBeGreaterThan(spread(101, 101) * 3);
  });
});

describe('pickNext', () => {
  it('returns null when there is nothing to show', () => {
    expect(pickNext([], [], seeded(1))).toBeNull();
  });

  it('returns null once the player has seen everything', () => {
    const all = [statement(1), statement(2)];
    expect(pickNext(all, [1, 2], seeded(1))).toBeNull();
  });

  it('never returns a statement the player has already voted on', () => {
    const all = [statement(1, { funny: 50 }), statement(2, { funny: 1 })];
    // #1 would win on merit every time, so this only passes if `seen` is honoured.
    for (let i = 0; i < 200; i += 1) expect(pickNext(all, [1], seeded(i)).id).toBe(2);
  });

  it('accepts the seen list as a Set as well as an array', () => {
    const all = [statement(1, { funny: 50 }), statement(2)];
    expect(pickNext(all, new Set([1]), seeded(1)).id).toBe(2);
  });

  it('all but stops showing a statement people keep calling meh', () => {
    const good = statement(1, { funny: 20, meh: 0 });
    const dud = statement(2, { funny: 0, meh: 20 });
    expect(pickShare([good, dud], 2)).toBeLessThan(0.01);
  });

  it('drops a dud further the more people shrug at it', () => {
    const rival = statement(1, { funny: 10, meh: 10 });
    const afterFive = pickShare([rival, statement(2, { funny: 0, meh: 5 })], 2, 4000, 3);
    const afterTwenty = pickShare([rival, statement(2, { funny: 0, meh: 20 })], 2, 4000, 3);
    expect(afterTwenty).toBeLessThan(afterFive);
    expect(afterTwenty).toBeLessThan(0.02);
  });

  it('gives a statement nobody has rated a fair hearing', () => {
    // An unrated statement knows nothing, so against a proven 50% one it should
    // win about half the time. This is the exploration, and it needs no tuning.
    const share = pickShare([statement(1, { funny: 6, meh: 6 }), statement(2)], 2, 4000, 5);
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
  });

  it('lets a good statement recover from an unlucky start', () => {
    // One laugh out of four is bad luck, not proof. A plain sort by laugh rate
    // would bury this permanently; sampling keeps giving it chances.
    const share = pickShare([statement(1, { funny: 30, meh: 30 }), statement(2, { funny: 1, meh: 3 })], 2, 4000, 9);
    expect(share).toBeGreaterThan(0.05);
  });

  it('prefers the funnier of two well-established statements', () => {
    const share = pickShare([statement(1, { funny: 80, meh: 20 }), statement(2, { funny: 50, meh: 50 })], 1, 4000, 4);
    expect(share).toBeGreaterThan(0.95);
  });

  it('does not hand every new player the same statement first', () => {
    // The old rule sorted and took the top, so everybody arriving saw the same
    // one. Sampling has to spread that out.
    const pool = Array.from({ length: 10 }, (_, i) => statement(i + 1, { funny: 10, meh: 10 }));
    const rand = seeded(21);
    const firsts = new Set(Array.from({ length: 200 }, () => pickNext(pool, [], rand).id));
    expect(firsts.size).toBeGreaterThan(5);
  });

  it('walks a player through every statement exactly once', () => {
    const all = Array.from({ length: 12 }, (_, i) => statement(i + 1, { funny: i, meh: 12 - i }));
    const rand = seeded(33);
    const seen = new Set();
    const order = [];

    for (let i = 0; i < all.length; i += 1) {
      const next = pickNext(all, seen, rand);
      expect(next).not.toBeNull();
      order.push(next.id);
      seen.add(next.id);
    }

    expect(pickNext(all, seen, rand)).toBeNull();
    expect(new Set(order).size).toBe(all.length);
  });
});
