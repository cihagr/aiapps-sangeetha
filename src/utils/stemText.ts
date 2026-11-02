/**
 * Collapses a duplicated question stem.
 *
 * Refinement (e.g. converting a Multiple Response item to True/False) can return a
 * `label` that already concatenates QuestionStatement and PartPrompt while the two
 * hold the same sentence, so the preview showed the question text twice. The old
 * check only caught the exact "X X" case, which misses any difference in spacing
 * or punctuation between the two copies.
 */

/** Shortest sentence length that may be dropped as a duplicate. */
const MIN_DUPLICATE_SENTENCE = 20;

const collapseWhitespace = (s: string): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Ignores case, whitespace and punctuation when comparing two fragments. */
const comparisonKey = (s: string): string =>
  collapseWhitespace(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * True when `haystack` already contains `needle`, ignoring case, whitespace and
 * punctuation.
 *
 * The screens render the PartPrompt as a second block only when the stem does not
 * already include it. That guard used an exact `includes()`, so a stem ending
 * "…is divided" did not match a PartPrompt ending "…is divided." and the same
 * sentence was shown twice — visible after converting a Multiple Response item to
 * True/False, where the generator returns exactly that pair.
 */
export const containsStemText = (haystack: any, needle: any): boolean => {
  const n = comparisonKey(String(needle ?? ''));
  if (!n) return true; // nothing extra to show
  return comparisonKey(String(haystack ?? '')).includes(n);
};

export const dedupeRepeatedText = (rawText: string): string => {
  const text = collapseWhitespace(rawText);
  if (text.length < MIN_DUPLICATE_SENTENCE) return text;

  // 1. Exact "X X" duplication, tolerating a separator between the copies.
  //    The half has to be substantial — a short run like "True. False." repeated
  //    as the two answer options is legitimate content, not a duplicated stem.
  const half = Math.floor(text.length / 2);
  const first = text.slice(0, half).trim();
  const second = text.slice(half).trim();
  if (first.length >= MIN_DUPLICATE_SENTENCE && comparisonKey(first) === comparisonKey(second)) {
    return first;
  }

  // 2. The same sentence repeated anywhere in the stem.
  const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  if (sentences.length > 1) {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const sentence of sentences) {
      const key = comparisonKey(sentence);
      // Only long sentences are safe to drop — a repeated "True." is legitimate.
      if (key.length >= MIN_DUPLICATE_SENTENCE && seen.has(key)) continue;
      seen.add(key);
      kept.push(sentence);
    }
    if (kept.length !== sentences.length) return kept.join(' ');
  }

  return text;
};

/**
 * Collapses a duplicated stem and, when the PartPrompt is already contained in the
 * stem, removes the trailing repeat of it.
 */
export const dedupeStem = (rawText: string, partPrompt?: string): string => {
  let text = dedupeRepeatedText(rawText);

  const prompt = collapseWhitespace(partPrompt);
  if (prompt && prompt.length >= MIN_DUPLICATE_SENTENCE) {
    const promptKey = comparisonKey(prompt);
    // Strip a trailing second copy of the PartPrompt.
    const withoutTail = text.slice(0, text.length - prompt.length).trim();
    if (
      withoutTail &&
      comparisonKey(text.slice(-prompt.length)) === promptKey &&
      comparisonKey(withoutTail).includes(promptKey)
    ) {
      text = withoutTail;
    }
  }

  return text;
};

export default dedupeRepeatedText;
