import { describe, it, expect } from 'vitest';
import { containsStemText, dedupeRepeatedText, dedupeStem } from '@/utils/stemText';

// Real record from the repository: question 9945, produced by converting the
// Multiple Response item IG_V2025_S1882_LO5759_MR_L1_EN_ID9927 to True/False.
// The generator returns the same sentence twice, differing only by a full stop.
const Q9945_LABEL =
  'The denominator of a fraction indicates the total number of equal parts into which a whole is divided';
const Q9945_PART_PROMPT =
  'The denominator of a fraction indicates the total number of equal parts into which a whole is divided.';

describe('containsStemText', () => {
  it('treats a trailing full stop as already contained (question 9945)', () => {
    // The screens render the PartPrompt as a second block only when the stem does
    // not already contain it. An exact includes() missed this and showed the same
    // sentence twice in the preview.
    expect(Q9945_LABEL.includes(Q9945_PART_PROMPT)).toBe(false); // the old check
    expect(containsStemText(Q9945_LABEL, Q9945_PART_PROMPT)).toBe(true);
  });

  it('ignores case and spacing differences', () => {
    expect(containsStemText('What is  a Fraction?', 'what is a fraction')).toBe(true);
  });

  it('still reports a genuinely different PartPrompt as missing', () => {
    expect(containsStemText(
      'A pizza is divided into four equal slices.',
      'Which fraction represents one slice?'
    )).toBe(false);
  });

  it('treats an empty PartPrompt as nothing to add', () => {
    expect(containsStemText('Any stem', '')).toBe(true);
    expect(containsStemText('Any stem', null)).toBe(true);
  });

  it('matches when the stem is the statement plus the prompt', () => {
    const statement = 'In mathematics, fractions represent parts of a whole.';
    expect(containsStemText(`${statement} ${Q9945_PART_PROMPT}`, Q9945_PART_PROMPT)).toBe(true);
  });
});

describe('dedupeRepeatedText', () => {
  it('collapses the same sentence repeated with differing punctuation', () => {
    expect(dedupeRepeatedText(`${Q9945_LABEL} ${Q9945_PART_PROMPT}`)).toBe(Q9945_LABEL);
  });

  it('leaves a stem made of two different sentences alone', () => {
    const s = 'A pizza is divided into four equal slices. Which fraction represents one slice?';
    expect(dedupeRepeatedText(s)).toBe(s);
  });
});

describe('dedupeStem', () => {
  it('does not lose content when the PartPrompt is genuinely additional', () => {
    const statement = 'In mathematics, fractions represent parts of a whole.';
    const stem = `${statement} ${Q9945_PART_PROMPT}`;
    expect(dedupeStem(stem, Q9945_PART_PROMPT)).toBe(stem);
  });
});
