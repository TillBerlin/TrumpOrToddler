import { describe, it, expect } from 'vitest';
import { previewFor, DEFAULT_TITLE, DEFAULT_DESCRIPTION, SHARED_DESCRIPTION } from '../src/lib/preview.js';

describe('previewFor', () => {
  it('puts the statement in the title, where a chat shows it in bold', () => {
    expect(previewFor({ text: 'Wears diapers.' })).toEqual({
      title: 'Wears diapers.',
      description: SHARED_DESCRIPTION,
    });
  });

  it('falls back to the generic tags when there is no statement', () => {
    const fallback = { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
    expect(previewFor(null)).toEqual(fallback);
    expect(previewFor(undefined)).toEqual(fallback);
    expect(previewFor({})).toEqual(fallback);
    expect(previewFor({ text: '   ' })).toEqual(fallback);
    expect(previewFor({ text: 42 })).toEqual(fallback);
  });

  it('keeps the statement exactly as written, quotes and all', () => {
    expect(previewFor({ text: '“This mine!”' }).title).toBe('“This mine!”');
  });

  it('gives nothing away: the preview is the question, never the answer', () => {
    const { title, description } = previewFor({ text: 'Would like a parade.' });
    for (const text of [title, description]) {
      expect(text.toLowerCase()).not.toContain('%');
      expect(text).not.toMatch(/\d+\s*(votes?|hihi|meh)/i);
    }
  });
});
