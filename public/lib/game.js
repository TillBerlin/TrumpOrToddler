/**
 * Pure game logic, with no browser or server dependencies.
 *
 * This file is loaded three ways, which is why it has no imports:
 *   - by the browser, as /lib/game.js
 *   - by the Cloudflare functions, via a relative import
 *   - by the tests in tests/
 */

/** Below this many votes a statement counts as "new" and needs exposure. */
export const LOW_VOTE_THRESHOLD = 20;

/** Roughly one pick in four goes to a statement that few people have seen. */
export const LOW_VOTE_CHANCE = 0.25;

/**
 * Percentages for a statement, as integers that always add up to 100.
 * With no votes yet the bar sits at an even 50/50, which is also where the
 * reveal animation starts from.
 */
export function computeSplit(statement) {
  const trump = Math.max(0, statement?.trump_votes ?? 0);
  const toddler = Math.max(0, statement?.toddler_votes ?? 0);
  const total = trump + toddler;
  if (total === 0) return { total: 0, trumpPct: 50, toddlerPct: 50 };
  const trumpPct = Math.round((trump / total) * 100);
  return { total, trumpPct, toddlerPct: 100 - trumpPct };
}

/**
 * How far a statement is from a perfect 50/50 split: 0 is dead even, 0.5 is
 * unanimous. Unvoted statements report 0, so only compare statements that
 * actually have votes.
 */
export function balanceScore(statement) {
  const trump = Math.max(0, statement?.trump_votes ?? 0);
  const toddler = Math.max(0, statement?.toddler_votes ?? 0);
  const total = trump + toddler;
  if (total === 0) return 0;
  return Math.abs(trump / total - 0.5);
}

export function totalVotes(statement) {
  return Math.max(0, statement?.trump_votes ?? 0) + Math.max(0, statement?.toddler_votes ?? 0);
}

/** Most evenly split first; ties go to the statement more votes back it up. */
function byBalance(a, b) {
  const diff = balanceScore(a) - balanceScore(b);
  if (diff !== 0) return diff;
  const votes = totalVotes(b) - totalVotes(a);
  if (votes !== 0) return votes;
  return a.id - b.id;
}

/** Fewest votes first, so genuinely new statements surface before older ones. */
function byFewestVotes(a, b) {
  const votes = totalVotes(a) - totalVotes(b);
  if (votes !== 0) return votes;
  return a.id - b.id;
}

/**
 * Choose the statement to show next.
 *
 * @param {Array}  statements  every approved statement
 * @param {Array|Set} seenIds  ids this player already voted on or skipped
 * @param {Function} rand      returns [0, 1); injectable so tests are exact
 * @returns {Object|null}      null once the player has seen everything
 */
export function pickNext(statements, seenIds = [], rand = Math.random) {
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds);
  const candidates = (statements ?? []).filter((s) => s && !seen.has(s.id));
  if (candidates.length === 0) return null;

  const fresh = candidates.filter((s) => totalVotes(s) < LOW_VOTE_THRESHOLD);
  const established = candidates.filter((s) => totalVotes(s) >= LOW_VOTE_THRESHOLD);

  // Every so often, show something barely anyone has voted on yet. Without
  // this, a newly approved statement could never accumulate the votes it needs
  // to compete on how evenly it splits.
  const wantsFresh = fresh.length > 0 && (established.length === 0 || rand() < LOW_VOTE_CHANCE);
  if (wantsFresh) {
    const pool = [...fresh].sort(byFewestVotes);
    // Pick among the least-seen few rather than always the single least-seen
    // one, so two players opening the link together don't walk the same path.
    const window = pool.slice(0, Math.min(5, pool.length));
    return window[Math.min(window.length - 1, Math.floor(rand() * window.length))];
  }

  const pool = established.length > 0 ? established : fresh;
  return [...pool].sort(byBalance)[0] ?? null;
}
