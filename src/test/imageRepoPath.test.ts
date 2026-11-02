import { describe, it, expect, beforeEach } from 'vitest';
import { buildImageFolderPath, buildImageScopePrefix, resolveImageBookName, resolveImageScope, sanitizeFolderSegment } from '@/utils/imageRepoPath';

describe('buildImageFolderPath', () => {
  // Verified against the live API: folder_path "" resolves to
  // image_repository/general_images/, which is exactly what the picker lists
  // when "General Images" is selected.
  it('returns the shared pool for the general destination', () => {
    expect(buildImageFolderPath({
      destination: 'general',
      bookName: 'Grade_6-Math_Fractions',
      chapterName: 'Fractions',
      loName: 'FRACTION AS A PART OF A WHOLE',
    })).toBe('');
  });

  it('scopes to the book when specific', () => {
    expect(buildImageFolderPath({ destination: 'specific', bookName: 'Grade_6-Math_Fractions' }))
      .toBe('Grade_6-Math_Fractions/');
  });

  it('adds the chapter when one is chosen', () => {
    expect(buildImageFolderPath({
      destination: 'specific',
      bookName: 'Grade_6-Math_Fractions',
      chapterName: 'Fractions',
    })).toBe('Grade_6-Math_Fractions/Fractions/');
  });

  it('adds the LO and replaces spaces, matching the stored blob path', () => {
    expect(buildImageFolderPath({
      destination: 'specific',
      bookName: 'Grade_6-Math_Fractions',
      chapterName: 'Fractions',
      loName: 'FRACTION AS A PART OF A WHOLE',
    })).toBe('Grade_6-Math_Fractions/Fractions/FRACTION_AS_A_PART_OF_A_WHOLE/');
  });

  it('ignores the LO when no chapter is chosen', () => {
    expect(buildImageFolderPath({
      destination: 'specific',
      bookName: 'Book',
      loName: 'Some LO',
    })).toBe('Book/');
  });

  it('falls back to the shared pool when the book is unknown', () => {
    expect(buildImageFolderPath({ destination: 'specific', bookName: '' })).toBe('');
  });

  it('sanitises characters blob folders cannot contain', () => {
    expect(sanitizeFolderSegment('a/b\\c?d%e*f:g|h"i<j>k l')).toBe('a_b_c_d_e_f_g_h_i_j_k_l');
  });
});

// Regression: the picker listed Grade_6-Math-Book/Fractions/ on the Results screen
// while the images live under Grade_6-Math_Fractions/Fractions/ — the generated
// question's own `bookname` differed from the book the user opened.
describe('resolveImageBookName', () => {
  const setTitle = (value: string | null) => {
    if (value === null) sessionStorage.removeItem('bookTitle');
    else sessionStorage.setItem('bookTitle', value);
  };

  it('prefers the opened book over the label on the question', () => {
    setTitle('Grade_6-Math_Fractions');
    expect(resolveImageBookName({ bookname: 'Grade_6-Math-Book' })).toBe('Grade_6-Math_Fractions');
  });

  it('falls back to the question when no book is open', () => {
    setTitle(null);
    expect(resolveImageBookName({ bookname: 'Grade_6-Math-Book' })).toBe('Grade_6-Math-Book');
  });

  it('ignores a blank stored title', () => {
    setTitle('   ');
    expect(resolveImageBookName({ BookName: 'Fallback Book' })).toBe('Fallback Book');
  });

  it('returns the neutral default when nothing is known', () => {
    setTitle(null);
    expect(resolveImageBookName({})).toBe('Book');
  });
});

// Every image lives under Customer/Organisation. Existing paths must be unchanged when
// no customer is known, so nothing that works today can break.
describe('Customer / Organisation scope', () => {
  const SCOPE = { custCode: 'VTCT', orgCode: 'VTCT01' };

  it('puts the general pool under the customer and organisation', () => {
    expect(buildImageFolderPath({ destination: 'general', ...SCOPE })).toBe('VTCT/VTCT01/');
  });

  it('nests book, chapter and LO below the scope', () => {
    expect(buildImageFolderPath({
      ...SCOPE,
      destination: 'specific',
      bookName: 'Grade_6-Math_Fractions',
      chapterName: 'Fractions',
      loName: 'FRACTION AS A PART OF A WHOLE',
    })).toBe('VTCT/VTCT01/Grade_6-Math_Fractions/Fractions/FRACTION_AS_A_PART_OF_A_WHOLE/');
  });

  it('falls back to the scope when the book is unknown', () => {
    expect(buildImageFolderPath({ ...SCOPE, destination: 'specific', bookName: '' })).toBe('VTCT/VTCT01/');
  });

  it('builds exactly the old paths when no customer is known', () => {
    expect(buildImageFolderPath({ destination: 'general' })).toBe('');
    expect(buildImageFolderPath({
      destination: 'specific',
      bookName: 'Grade_6-Math_Fractions',
      chapterName: 'Fractions',
    })).toBe('Grade_6-Math_Fractions/Fractions/');
  });

  it('uses the customer alone when the organisation is unknown', () => {
    expect(buildImageScopePrefix('VTCT', '')).toBe('VTCT/');
    expect(buildImageScopePrefix('', 'VTCT01')).toBe('');
    expect(buildImageScopePrefix('VTCT', 'VTCT01')).toBe('VTCT/VTCT01/');
  });

  it('sanitises codes that cannot be folder names', () => {
    expect(buildImageScopePrefix('VT CT', 'ORG/01')).toBe('VT_CT/ORG_01/');
  });
});

describe('resolveImageScope', () => {
  beforeEach(() => sessionStorage.clear());

  it('reads the codes from the session', () => {
    sessionStorage.setItem('custcode', 'VTCT');
    sessionStorage.setItem('orgcode', 'VTCT01');
    expect(resolveImageScope()).toEqual({ custCode: 'VTCT', orgCode: 'VTCT01' });
  });

  it('falls back to userInfo', () => {
    sessionStorage.setItem('userInfo', JSON.stringify({ customerCode: 'ES', orgCode: 'Exc195' }));
    expect(resolveImageScope()).toEqual({ custCode: 'ES', orgCode: 'Exc195' });
  });

  it('returns empty codes when nothing is stored', () => {
    expect(resolveImageScope()).toEqual({ custCode: '', orgCode: '' });
  });
});
