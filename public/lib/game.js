/**
 * Pure game logic, with no browser or server dependencies.
 *
 * This file is loaded three ways, which is why it has no imports:
 *   - by the browser, as /lib/game.js
 *   - by the Worker, via a relative import
 *   - by the tests in tests/
 */

/** Votes cast faster than this are recorded but not counted. */
export const MIN_DECISION_MS = 800;

/** Below this many votes the footer stays quiet rather than looking deserted. */
export const SHOW_TOTAL_FROM = 50;

/* ------------------------------------------------------------------ *
 * Shared links
 * ------------------------------------------------------------------ */

/**
 * The statement id out of a shared link's query string (`?s=12`), or null.
 * Anything that is not a positive whole number is treated as absent rather
 * than as an error -- a mangled link should still open the game.
 */
export function parseSharedId(search) {
  const raw = new URLSearchParams(search ?? '').get('s');
  if (raw === null || raw.trim() === '') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/* ------------------------------------------------------------------ *
 * The Trump/Toddler split
 * ------------------------------------------------------------------ */

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

export function totalVotes(statement) {
  return Math.max(0, statement?.trump_votes ?? 0) + Math.max(0, statement?.toddler_votes ?? 0);
}

/* ------------------------------------------------------------------ *
 * How funny people found it
 * ------------------------------------------------------------------ */

export function laughs(statement) {
  return Math.max(0, statement?.funny_votes ?? 0);
}

export function shrugs(statement) {
  return Math.max(0, statement?.meh_votes ?? 0);
}

/** Share of raters who laughed, or null when nobody has rated it yet. */
export function laughRate(statement) {
  const total = laughs(statement) + shrugs(statement);
  return total === 0 ? null : laughs(statement) / total;
}

/* ------------------------------------------------------------------ *
 * Sampling
 * ------------------------------------------------------------------ */

function standardNormal(rand) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Marsaglia-Tsang. Only ever called with shape >= 1 here, since every shape is
 * 1 + a vote count. The naive "sum of logs" method would be simpler but costs
 * one call per vote, which gets slow once a statement has hundreds.
 */
function sampleGamma(shape, rand) {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const x = standardNormal(rand);
    const t = 1 + c * x;
    if (t <= 0) continue;
    const v = t * t * t;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d; // the loop above accepts within a few tries in practice
}

/** A draw from Beta(a, b). Both shapes must be >= 1. */
export function sampleBeta(a, b, rand = Math.random) {
  const x = sampleGamma(a, rand);
  const y = sampleGamma(b, rand);
  return x + y === 0 ? 0.5 : x / (x + y);
}

/* ------------------------------------------------------------------ *
 * Which statement comes next
 * ------------------------------------------------------------------ */

/**
 * Thompson sampling over how funny each statement is.
 *
 * Every statement carries a belief about its laugh rate rather than a score:
 * Beta(1 + laughs, 1 + shrugs). We draw one number from each unseen
 * statement's belief and show whichever drew highest.
 *
 * Exploration falls out of the shape of those beliefs, so there is no rate to
 * tune. A statement nobody has rated has a flat belief and often draws high,
 * so it gets its chance. One with twenty shrugs and no laughs has a belief
 * pinned near zero and effectively stops appearing. And a good statement whose
 * first few raters happened not to laugh still draws high often enough to
 * recover, which a plain sort by laugh rate would never allow.
 *
 * @param {Array}  statements  every approved statement
 * @param {Array|Set} seenIds  ids this player already voted on
 * @param {Function} rand      returns [0, 1); injectable so tests are exact
 * @returns {Object|null}      null once the player has seen everything
 */
export function pickNext(statements, seenIds = [], rand = Math.random) {
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds);
  const candidates = (statements ?? []).filter((s) => s && !seen.has(s.id));
  if (candidates.length === 0) return null;

  let best = null;
  let bestDraw = -Infinity;
  for (const statement of candidates) {
    const draw = sampleBeta(1 + laughs(statement), 1 + shrugs(statement), rand);
    if (draw > bestDraw) {
      bestDraw = draw;
      best = statement;
    }
  }
  return best;
}
