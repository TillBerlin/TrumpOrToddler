/** Checking the address people leave on the "Get a copy" page. */

export const MAX_EMAIL_LENGTH = 254;

/**
 * Which wording of the notice on /copy the person agreed to. Stored with every
 * signup as the record of consent, so bump it whenever that wording changes in
 * a way that matters (for example, if the list is ever used for anything other
 * than the one "you can order it now" email).
 */
export const CONSENT_VERSION = 'copy-v1';

// Deliberately loose: one @, something on both sides, a dot in the domain, no
// spaces or angle brackets. The only real test of an address is mailing it.
const SHAPE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

/**
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 *          value is trimmed and lowercased, so the same address typed twice
 *          is recognised as the same.
 */
export function validateEmail(input) {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!email) return { ok: false, error: 'Please enter your email address.' };
  if (email.length > MAX_EMAIL_LENGTH || !SHAPE.test(email) || email.includes('..')) {
    return { ok: false, error: 'That does not look like an email address.' };
  }
  return { ok: true, value: email };
}
