/**
 * Normalises the over-escaped LaTeX the generator/API produce.
 *
 * Equations come back as `\\(\frac{3}{8}\\)` (double backslash before the
 * delimiters). Renderers cope with that, but every raw-text surface — the edit
 * dialog, Word/Excel export, the saved payload — showed the extra backslashes as
 * junk. Collapsing them once, as soon as the results are stored, keeps the
 * generate flow consistent with the repository, which already does this.
 */

const fixLatexString = (s: string): string =>
  s
    // "\\(" -> "\(", "\\frac" -> "\frac"
    .replace(/\\{2,}([()[\]a-zA-Z])/g, '\\$1')
    // Any other run of backslashes collapses to an escaped pair.
    .replace(/\\{2,}/g, '\\\\');

/** Fields that can carry equations. Everything else is left untouched. */
const LATEX_BEARING_KEYS = new Set([
  'label', 'QuestionStatement', 'PartPrompt', 'partPrompt', 'CorrectAnswer',
  'question', 'Question', 'stem', 'text', 'QuestionText',
  'values', 'options', 'Options', 'columns', 'rows', 'Columns', 'Rows',
  'Feedbacks', 'feedbacks', 'KeyPoints', 'keyPoints',
  'DropdownOptions', 'dropdownoptions', 'Tabs', 'tabs',
  'TableAnalysis', 'tableAnalysis', 'ReferenceInfo', 'referenceinfo',
  'Passage', 'passage', 'TabContent', 'PassageContext',
]);

const isLatexBearingKey = (key: string): boolean =>
  LATEX_BEARING_KEYS.has(key) || key.startsWith('FeedbackOption');

const fixValue = (value: any, depth: number): any => {
  if (depth > 8) return value;

  if (typeof value === 'string') {
    // Never touch embedded images.
    if (value.startsWith('data:image/')) return value;
    const trimmed = value.trim();
    // JSON documents are parsed, fixed inside, and re-serialised — collapsing the
    // backslashes on the raw document would create invalid JSON escapes.
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          return JSON.stringify(fixValue(parsed, depth + 1));
        }
      } catch { /* not JSON — fall through */ }
    }
    return fixLatexString(value);
  }

  if (Array.isArray(value)) return value.map(v => fixValue(v, depth + 1));

  if (value && typeof value === 'object') {
    const out: any = { ...value };
    Object.keys(out).forEach(k => { out[k] = fixValue(out[k], depth + 1); });
    return out;
  }

  return value;
};

/**
 * Walks an arbitrary generation result and normalises LaTeX in the fields that
 * can contain it. Structure is preserved; unknown keys are recursed into so
 * questions nested inside agent envelopes are covered too.
 */
export const normalizeGeneratedLatex = (node: any, depth = 0): any => {
  if (depth > 8 || node === null || node === undefined) return node;
  if (Array.isArray(node)) return node.map(n => normalizeGeneratedLatex(n, depth + 1));
  if (typeof node !== 'object') return node;

  const out: any = { ...node };
  Object.keys(out).forEach(key => {
    const value = out[key];
    if (isLatexBearingKey(key)) {
      out[key] = fixValue(value, depth + 1);
    } else if (value && typeof value === 'object') {
      out[key] = normalizeGeneratedLatex(value, depth + 1);
    }
  });
  return out;
};

export default normalizeGeneratedLatex;
