import { describe, it, expect } from 'vitest';
import { stripHtml, normalizeText, validateSubmission, MAX_TEXT_LENGTH } from '../src/lib/text.js';

describe('stripHtml', () => {
  it('removes tags and leaves the words', () => {
    expect(stripHtml('<b>This</b> mine!')).toBe('This mine!');
  });

  it('removes a script tag entirely', () => {
    expect(stripHtml('<script>alert(1)</script>Hello')).toBe('alert(1) Hello');
  });

  it('leaves no angle bracket behind, whatever shape it came in', () => {
    // Anything between < and > is dropped whole, so "a < b > c" loses the "b"
    // as well. That costs the occasional maths joke and is the right trade:
    // nothing tag-shaped ever reaches the database or the moderation page.
    expect(stripHtml('a < b > c')).toBe('a c');
    for (const input of ['<b>x', 'x</b>', '<<>>x', 'a<b>c<d', '5 < 6', 'x > y']) {
      expect(stripHtml(input)).not.toMatch(/[<>]/);
    }
  });

  it('collapses whitespace, newlines and control characters', () => {
    expect(stripHtml('  too    many\n\nspaces\t ')).toBe('too many spaces');
  });

  it('survives non-strings', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
    expect(stripHtml(42)).toBe('');
  });
});

describe('normalizeText', () => {
  it('ignores case and spacing when comparing', () => {
    expect(normalizeText('  This   MINE! ')).toBe(normalizeText('this mine!'));
  });

  it('ignores trailing punctuation', () => {
    expect(normalizeText('Wears diapers.')).toBe(normalizeText('wears diapers'));
  });

  it('keeps genuinely different statements apart', () => {
    expect(normalizeText('Has tantrums')).not.toBe(normalizeText('Has tantrums sometimes'));
  });
});

describe('validateSubmission', () => {
  it('accepts a normal statement', () => {
    const result = validateSubmission({ text: 'Wears diapers.', sourceNote: '' });
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ text: 'Wears diapers.', sourceNote: null });
  });

  it('rejects empty and whitespace-only text', () => {
    expect(validateSubmission({ text: '' }).ok).toBe(false);
    expect(validateSubmission({ text: '    ' }).ok).toBe(false);
    expect(validateSubmission({}).ok).toBe(false);
  });

  it('rejects text that is only markup', () => {
    expect(validateSubmission({ text: '<img src=x onerror=1>' }).ok).toBe(false);
  });

  it(`rejects text over ${MAX_TEXT_LENGTH} characters`, () => {
    expect(validateSubmission({ text: 'a'.repeat(MAX_TEXT_LENGTH) }).ok).toBe(true);
    expect(validateSubmission({ text: 'a'.repeat(MAX_TEXT_LENGTH + 1) }).ok).toBe(false);
  });

  it('rejects an over-long source note', () => {
    expect(validateSubmission({ text: 'Has tantrums.', sourceNote: 'x'.repeat(201) }).ok).toBe(false);
  });

  it('measures length after stripping, so padding does not smuggle text through', () => {
    const padded = `<b>${'a'.repeat(MAX_TEXT_LENGTH)}</b>`;
    expect(validateSubmission({ text: padded }).ok).toBe(true);
  });
});
