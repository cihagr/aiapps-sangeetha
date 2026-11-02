import { describe, it, expect, beforeEach } from 'vitest';
import { isDropdownBlankQuestion } from '@/utils/questionType';

// Real record from the repository (question 9913, a plain Fill In the Blank).
const PLAIN_FIB = {
  type: 'Fill In the Blank',
  PartPrompt: 'The resulting equivalent fraction in its simplest form is [Blank1].',
  values: ['1/3'],
  CorrectAnswer: '1/3',
};

const SELECT_THE_BLANK = {
  type: 'Select the Blank',
  PartPrompt: 'The total number of equal parts is called the [Dropdown1].',
  DropdownOptions: ['numerator', 'denominator', 'quotient', 'divisor'],
};

describe('isDropdownBlankQuestion', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('does not treat a plain Fill In the Blank as a dropdown question', () => {
    expect(isDropdownBlankQuestion(PLAIN_FIB)).toBe(false);
  });

  it('still says no after an edit copied the answer into DropdownOptions', () => {
    // Opening the edit dialog used to write DropdownOptions from `values`; once
    // saved, that made the card render an extra <select> over the gap.
    const edited = {
      ...PLAIN_FIB,
      DropdownOptions: ['1/3'],
      dropdownoptions: ['1/3'],
      options: ['1/3'],
    };
    expect(isDropdownBlankQuestion(edited)).toBe(false);
  });

  it('says no even when the session hint is stale from a Select the Blank batch', () => {
    sessionStorage.setItem('selectedQuestionType', 'Select the Blank');
    expect(isDropdownBlankQuestion(PLAIN_FIB)).toBe(false);
  });

  it('recognises a genuine Select the Blank question', () => {
    expect(isDropdownBlankQuestion(SELECT_THE_BLANK)).toBe(true);
  });

  it('recognises a dropdown token even without an explicit type', () => {
    expect(isDropdownBlankQuestion({ PartPrompt: 'Pick the [Dropdown1] value.' })).toBe(true);
  });

  it('recognises several stored options as a real choice list', () => {
    expect(isDropdownBlankQuestion({ DropdownOptions: ['a', 'b', 'c'] })).toBe(true);
  });

  it('does not treat a Multiple Choice question as a dropdown blank', () => {
    expect(isDropdownBlankQuestion({
      type: 'Multiple Choice',
      label: 'Which fraction is one half?',
      values: ['A. 1/2', 'B. 1/3', 'C. 1/4'],
    })).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(isDropdownBlankQuestion(null)).toBe(false);
    expect(isDropdownBlankQuestion(undefined)).toBe(false);
  });
});
