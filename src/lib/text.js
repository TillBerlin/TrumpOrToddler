/** Sanitising and validating whatever people type into the submission form. */

export const MAX_TEXT_LENGTH = 120;
export const MAX_SOURCE_NOTE_LENGTH = 200;

/**
 * Remove anything that could turn into markup, then tidy the whitespace.
 * The statement is rendered as text content rather than HTML, so this is a
 * second line of defence rather than the only one.
 */
export function stripHtml(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, ' ') // whole tags
    .replace(/[<>]/g, ' ') // stray angle brackets
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // control characters
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The form used to detect duplicates: same words, ignoring case, spacing and
 * trailing punctuation. "This mine!" and "  this MINE!  " are the same
 * statement; "This mine" is too.
 */
export function normalizeText(input) {
  return stripHtml(input)
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {{ok: true, value: {text: string, sourceNote: string|null, normText: string}}
 *          | {ok: false, error: string}}
 */
export function validateSubmission({ text, sourceNote } = {}) {
  const cleanText = stripHtml(text);
  if (!cleanText) {
    return { ok: false, error: 'Please write a statement.' };
  }
  if (cleanText.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `Statements have to be ${MAX_TEXT_LENGTH} characters or fewer.` };
  }

  const cleanNote = stripHtml(sourceNote);
  if (cleanNote.length > MAX_SOURCE_NOTE_LENGTH) {
    return { ok: false, error: `Source notes have to be ${MAX_SOURCE_NOTE_LENGTH} characters or fewer.` };
  }

  const normText = normalizeText(cleanText);
  if (!normText) {
    return { ok: false, error: 'Please write a statement.' };
  }

  return {
    ok: true,
    value: { text: cleanText, sourceNote: cleanNote || null, normText },
  };
}
