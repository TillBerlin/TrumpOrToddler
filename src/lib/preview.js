/**
 * What a shared link should say when it is pasted into a chat.
 *
 * Link-preview bots do not run JavaScript, so these have to be in the HTML
 * before it leaves the Worker. Pure and dependency-free so it can be tested
 * without a Worker runtime.
 */

export const DEFAULT_TITLE = 'Trump or Toddler';
export const DEFAULT_DESCRIPTION = 'One statement. Two possible culprits. Can you tell?';

/** The line under the statement in a preview. */
export const SHARED_DESCRIPTION = 'Trump, or a toddler? Decide, then see how everyone else voted.';

/**
 * The statement goes in the title, because that is the bold line in a chat
 * preview and it is the whole hook. It gives nothing away -- the statement is
 * the question, not the answer.
 */
export function previewFor(statement) {
  const text = typeof statement?.text === 'string' ? statement.text.trim() : '';
  if (!text) return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
  return { title: text, description: SHARED_DESCRIPTION };
}
