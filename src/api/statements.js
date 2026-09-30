import { json, error } from '../lib/http.js';

/**
 * Every approved statement with its current counts. The player's browser picks
 * which one to show next (see public/lib/game.js), because it is the only side
 * that knows what this player has already seen -- and that list stays on their
 * device.
 */
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, text, source_note, trump_votes, toddler_votes
         FROM statements
        WHERE status = 'approved'
        ORDER BY id`,
    ).all();

    return json({ statements: results ?? [] });
  } catch (err) {
    return error('Could not load statements.', 500);
  }
}
