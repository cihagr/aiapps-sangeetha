/**
 * Shared question-type detection.
 *
 * This lived as two hand-copied blocks (one per screen), which is how a fix to one
 * of them left the other broken. Both screens now call this single implementation.
 */

const readSelectedTypeHint = (): string => {
  try {
    return sessionStorage.getItem('selectedQuestionType') || '';
  } catch {
    return '';
  }
};

const typeLabelOf = (question: any): string =>
  String(
    question?.type || question?.questiontype || question?.QuestionType ||
    question?.questiontypename || question?.questionTypeName || question?.question_type || ''
  );

const stemTextOf = (question: any): string =>
  String(
    question?.PartPrompt || question?.label || question?.Question ||
    question?.text || question?.QuestionText || ''
  );

/**
 * Detects Select the Blank / Fill In the Blank Dropdown questions, which render an
 * inline <select> over a [Dropdown1] token instead of a free-text gap.
 *
 * A plain Fill In the Blank must never match: it keeps a free-text gap.
 */
export const isDropdownBlankQuestion = (question: any): boolean => {
  if (!question) return false;

  // The question's own data is stronger evidence than the session hint, which is a
  // global and may be stale (the Repository lists questions of every type while
  // sessionStorage still holds whatever was last generated). Check it first.
  const ownType = typeLabelOf(question);

  // An explicit "Fill In the Blank" type is decisive: it is NOT a dropdown item.
  if (/fill[\s_]*in[\s_]*the[\s_]*blank/i.test(ownType) && !/dropdown/i.test(ownType)) return false;

  const hasDropdownToken = /\[\s*dropdown\d*\s*\]/i.test(stemTextOf(question));

  // A single stored option is just the answer, not a set of choices. Requiring more
  // than one stops a stray DropdownOptions array — older saves wrote one for plain
  // fill-in-the-blank items — from turning the gap into a <select>.
  const dropdownOptionCount = Math.max(
    Array.isArray(question?.DropdownOptions) ? question.DropdownOptions.length : 0,
    Array.isArray(question?.dropdownoptions) ? question.dropdownoptions.length : 0
  );
  if (hasDropdownToken || dropdownOptionCount > 1) return true;

  const sel = readSelectedTypeHint();
  if (/fill\s*in\s*the\s*blank$/i.test(sel.trim()) || sel.trim() === 'fill-blank') return false;

  if (/dropdown|select\s+the\s+blank/i.test(ownType)) return true;

  const text = String(question?.label || question?.Question || question?.text || question?.QuestionText || '');
  if (/\[\s*dropdown\d*\s*\]/i.test(text) || /dropdown\d*/i.test(text)) return true;

  if (/fill\s*in\s*the\s*blank\s*dropdown/i.test(sel)) return true;
  if (/select\s*the\s*blank/i.test(sel)) return true;

  return false;
};

export default isDropdownBlankQuestion;
