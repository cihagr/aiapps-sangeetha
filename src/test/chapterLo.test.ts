import { describe, it, expect } from 'vitest';
import { chapterKeyOf, chapterNameOf, loKeyOf, loNameOf } from '@/utils/chapterLo';

// Regression: the image picker builds its blob folder path from the chapter/LO NAME,
// looked up by the key the dropdown holds. The Results screen used a narrower set of
// field names than the Repository, so a record keyed by `chapternameid` was never
// found — the path fell back to the raw code and the picker listed an empty folder.
describe('chapterKeyOf / chapterNameOf', () => {
  it('prefers the id the dropdowns use', () => {
    expect(chapterKeyOf({ chapternameid: 11, chaptercode: 'S1882' })).toBe(11);
  });

  it.each([
    ['chapterid', { chapterid: 7 }, 7],
    ['chapter_id', { chapter_id: 7 }, 7],
    ['chaptercode', { chaptercode: 'S1882' }, 'S1882'],
    ['chapterCode', { chapterCode: 'S1882' }, 'S1882'],
    ['chapter_code', { chapter_code: 'S1882' }, 'S1882'],
    ['chaptername', { chaptername: 'Fractions' }, 'Fractions'],
  ])('reads a record keyed by %s', (_label, record, expected) => {
    expect(chapterKeyOf(record)).toBe(expected);
  });

  it('returns the display name used as the folder segment', () => {
    expect(chapterNameOf({ chapternameid: 11, chaptername: 'Fractions' })).toBe('Fractions');
  });

  it('falls back to the key when the record carries no name', () => {
    expect(chapterNameOf({ chapternameid: 11 })).toBe('11');
  });
});

describe('loKeyOf / loNameOf', () => {
  it('prefers the id the dropdowns use', () => {
    expect(loKeyOf({ learningoutcomenameid: 42, locode: 'LO-1' })).toBe(42);
  });

  it.each([
    ['loid', { loid: 42 }, 42],
    ['lo_id', { lo_id: 42 }, 42],
    ['locode', { locode: 'LO-1' }, 'LO-1'],
    ['loCode', { loCode: 'LO-1' }, 'LO-1'],
    ['lo_code', { lo_code: 'LO-1' }, 'LO-1'],
  ])('reads a record keyed by %s', (_label, record, expected) => {
    expect(loKeyOf(record)).toBe(expected);
  });

  it('returns the display name used as the folder segment', () => {
    expect(loNameOf({ learningoutcomenameid: 42, loname: 'FRACTION AS A PART OF A WHOLE' }))
      .toBe('FRACTION AS A PART OF A WHOLE');
  });

  it('falls back to the key when the record carries no name', () => {
    expect(loNameOf({ loid: 42 })).toBe('42');
  });
});
