/**
 * Shared Text-to-Speech helpers for the AIG question screens.
 *
 * Centralises the behaviour that used to be duplicated (and diverge) between
 * AIGQuestionResults and AIGQuestionRepository:
 *  - stripping HTML/LaTeX so the synthesiser never reads markup aloud
 *  - speaking mathematical / Greek symbols by name instead of skipping them
 *  - including the answer options (and passage) in the spoken text
 *  - detecting the script of a translated question so a matching voice is used
 */

import { getTableAnalysis } from './tableAnalysis';

// Greek letters and common math symbols read as words. Applied only when the
// surrounding text is not itself Greek (see shouldTransliterateGreek).
const SYMBOL_WORDS: Record<string, string> = {
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon',
  'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'ι': 'iota', 'κ': 'kappa',
  'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'ο': 'omicron',
  'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'ς': 'sigma', 'τ': 'tau',
  'υ': 'upsilon', 'φ': 'phi', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega',
  'Α': 'Alpha', 'Β': 'Beta', 'Γ': 'Gamma', 'Δ': 'Delta', 'Ε': 'Epsilon',
  'Ζ': 'Zeta', 'Η': 'Eta', 'Θ': 'Theta', 'Ι': 'Iota', 'Κ': 'Kappa',
  'Λ': 'Lambda', 'Μ': 'Mu', 'Ν': 'Nu', 'Ξ': 'Xi', 'Ο': 'Omicron',
  'Π': 'Pi', 'Ρ': 'Rho', 'Σ': 'Sigma', 'Τ': 'Tau', 'Υ': 'Upsilon',
  'Φ': 'Phi', 'Χ': 'Chi', 'Ψ': 'Psi', 'Ω': 'Omega',
  '√': 'square root of ', '∛': 'cube root of ', '∑': 'sum of ', '∏': 'product of ',
  '∫': 'integral of ', '∂': 'partial derivative ', '∞': 'infinity',
  '≈': ' approximately equal to ', '≠': ' not equal to ', '≤': ' less than or equal to ',
  '≥': ' greater than or equal to ', '±': ' plus or minus ', '×': ' times ',
  '÷': ' divided by ', '·': ' dot ', '→': ' tends to ', '⇒': ' implies ',
  '∈': ' belongs to ', '∉': ' does not belong to ', '⊂': ' subset of ',
  '∪': ' union ', '∩': ' intersection ', '∠': ' angle ', '°': ' degrees ',
  '∴': ' therefore ', '∵': ' because ', '≡': ' is congruent to ',
  '½': 'one half', '⅓': 'one third', '¼': 'one quarter', '¾': 'three quarters',
  '⅔': 'two thirds', '²': ' squared ', '³': ' cubed ',
};

// LaTeX commands mapped to the words they should be read as. Anything not listed
// is dropped (as before) rather than read out as a backslash command.
const LATEX_WORDS: Record<string, string> = {
  alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon',
  varepsilon: 'epsilon', zeta: 'zeta', eta: 'eta', theta: 'theta', vartheta: 'theta',
  iota: 'iota', kappa: 'kappa', lambda: 'lambda', mu: 'mu', nu: 'nu', xi: 'xi',
  pi: 'pi', rho: 'rho', sigma: 'sigma', varsigma: 'sigma', tau: 'tau',
  upsilon: 'upsilon', phi: 'phi', varphi: 'phi', chi: 'chi', psi: 'psi', omega: 'omega',
  Gamma: 'Gamma', Delta: 'Delta', Theta: 'Theta', Lambda: 'Lambda', Xi: 'Xi',
  Pi: 'Pi', Sigma: 'Sigma', Upsilon: 'Upsilon', Phi: 'Phi', Psi: 'Psi', Omega: 'Omega',
  infty: 'infinity', times: 'times', div: 'divided by', pm: 'plus or minus',
  leq: 'less than or equal to', geq: 'greater than or equal to', neq: 'not equal to',
  approx: 'approximately equal to', equiv: 'is congruent to', cdot: 'dot',
  rightarrow: 'tends to', to: 'to', in: 'belongs to', sum: 'sum of',
  prod: 'product of', int: 'integral of', partial: 'partial derivative',
  degree: 'degrees', angle: 'angle', therefore: 'therefore', because: 'because',
};

const GREEK_CHAR = /[Ͱ-Ͽἀ-῿]/;

// Matches anything that is NOT a letter / combining mark / digit / whitespace /
// ordinary punctuation, plus every character we have a spoken word for (some of
// which — Greek letters, ½, ² — are themselves letters or numbers).
// Built from SYMBOL_WORDS so the two can never drift apart.
const SYMBOL_OR_JUNK_RE = (() => {
  const escapeForClass = (s: string) => s.replace(/[\\\]^-]/g, '\\$&');
  const symbolChars = escapeForClass(Object.keys(SYMBOL_WORDS).join(''));
  return new RegExp(
    `[^\\p{L}\\p{M}\\p{N}\\s.,;:!?'"()\\[\\]%+\\-=<>/]|[${symbolChars}]`,
    'gu'
  );
})();

// Only spell Greek letters out when they are isolated symbols inside otherwise
// non-Greek text. A genuinely Greek-language question must be read as Greek.
const shouldTransliterateGreek = (text: string): boolean => {
  const greek = (text.match(/[Ͱ-Ͽἀ-῿]/g) || []).length;
  if (greek === 0) return false;
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (letters === 0) return false;
  return greek / letters < 0.3;
};

/**
 * Detects a BCP-47 language tag from the script the text is written in, so a
 * translated question (Thai, Hindi, Arabic, ...) is read by a matching voice
 * instead of an English one. Returns '' when the text is plain Latin script.
 */
export const detectLangFromText = (text: string): string => {
  if (!text) return '';
  const tests: Array<[RegExp, string]> = [
    [/[฀-๿]/, 'th'],      // Thai
    [/[ऀ-ॿ]/, 'hi'],      // Devanagari
    [/[ঀ-৿]/, 'bn'],      // Bengali
    [/[஀-௿]/, 'ta'],      // Tamil
    [/[ఀ-౿]/, 'te'],      // Telugu
    [/[ಀ-೿]/, 'kn'],      // Kannada
    [/[ഀ-ൿ]/, 'ml'],      // Malayalam
    [/[઀-૿]/, 'gu'],      // Gujarati
    [/[؀-ۿ]/, 'ar'],      // Arabic
    [/[֐-׿]/, 'he'],      // Hebrew
    [/[Ѐ-ӿ]/, 'ru'],      // Cyrillic
    [/[぀-ヿ]/, 'ja'],      // Kana
    [/[가-힯]/, 'ko'],      // Hangul
    [/[一-鿿]/, 'zh'],      // Han
    [/[຀-໿]/, 'lo'],      // Lao
    [/[က-႟]/, 'my'],      // Myanmar
    [/[ក-៿]/, 'km'],      // Khmer
  ];
  for (const [re, lang] of tests) {
    if (re.test(text)) return lang;
  }
  // Greek only counts as a language when the text is predominantly Greek.
  if (GREEK_CHAR.test(text) && !shouldTransliterateGreek(text)) return 'el';
  return '';
};

/**
 * Strips markup and normalises symbols so SpeechSynthesis reads real words.
 */
export const cleanTextForSpeech = (input: any): string => {
  if (input === null || input === undefined) return '';
  let str = String(input);
  if (!str.trim()) return '';

  // Drop base64 data URIs, which can be megabytes of encoded characters
  str = str.replace(/data:image\/[a-zA-Z]+;base64,[^"'\s>]+/g, ' ');

  // Extract text content, discarding images/scripts/styles/UI controls
  try {
    if (typeof DOMParser !== 'undefined' && /<[a-z!/]/i.test(str)) {
      const doc = new DOMParser().parseFromString(str, 'text/html');
      doc.querySelectorAll('img, style, script, svg, select, button, input, option, .no-speech').forEach(el => el.remove());
      // Keep a separator so adjacent block content does not run together
      doc.querySelectorAll('br, p, div, tr, li').forEach(el => el.after(doc.createTextNode(' ')));
      str = doc.body.textContent || str;
    }
  } catch {
    str = str.replace(/<[^>]*>/g, ' ');
  }

  // Strip UI control text like "Sort By : S.no"
  str = str.replace(/\bSort\s+By\s*:?\s*[A-Za-z0-9._-]*/gi, ' ');

  // Decode the few entities that survive textContent extraction
  str = str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' and ')
    .replace(/&lt;/gi, ' less than ')
    .replace(/&gt;/gi, ' greater than ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");

  // \frac{a}{b} -> "a over b" before generic LaTeX stripping
  str = str.replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1 over $2 ');
  str = str.replace(/\\sqrt\s*\{([^{}]*)\}/g, ' square root of $1 ');
  str = str.replace(/\\text\s*\{([^{}]*)\}/g, ' $1 ');

  // Named LaTeX commands -> words; unknown commands are dropped
  str = str.replace(/\\([a-zA-Z]+)/g, (_m, name: string) => {
    const word = LATEX_WORDS[name] || LATEX_WORDS[name.toLowerCase()];
    return word ? ` ${word} ` : ' ';
  });

  // Remaining LaTeX punctuation
  str = str.replace(/\^\{([^{}]*)\}/g, ' to the power of $1 ');
  str = str.replace(/\^(\w)/g, ' to the power of $1 ');
  str = str.replace(/_\{([^{}]*)\}/g, ' subscript $1 ');
  str = str.replace(/[{}$\\]/g, ' ');

  // "3/4" reads better as "3 over 4"
  str = str.replace(/(\d)\s*\/\s*(\d)/g, '$1 over $2');

  // Symbols -> words.
  // Only punctuation/symbols are touched: letters, combining marks and digits of
  // EVERY script are preserved. (An earlier `\w`-based class was ASCII-only, so it
  // silently deleted Thai, Hindi, Arabic and CJK question text entirely.)
  const transliterateGreek = shouldTransliterateGreek(str);
  str = str.replace(SYMBOL_OR_JUNK_RE, (ch) => {
    const word = SYMBOL_WORDS[ch];
    if (!word) return ' ';
    // Greek letters are only spelled out when they are isolated math symbols.
    if (GREEK_CHAR.test(ch) && !transliterateGreek) return ch;
    return ` ${word} `;
  });

  // Editor placeholders carry no meaning aloud
  str = str.replace(/[◻□]/g, ' blank ');

  return str.replace(/\s+/g, ' ').trim();
};

const stripOptionPrefix = (s: string): string =>
  String(s ?? '').replace(/^\s*[A-Ja-j][.):]\s*/, '').trim();

const optionText = (opt: any): string => {
  if (opt === null || opt === undefined) return '';
  if (typeof opt === 'string' || typeof opt === 'number') return String(opt);
  return String(opt?.text ?? opt?.value ?? opt?.label ?? opt?.Option ?? opt?.option ?? '');
};

/**
 * Collects the answer options of a question regardless of which shape the API
 * returned them in.
 */
/**
 * Options can arrive as a real array or as a JSON string of one — the repository's
 * LaTeX normaliser re-serialises a stringified array, so a converted question's
 * `values` often comes back as text. Only arrays were accepted, so those questions
 * were read out with the stem alone and no options at all.
 */
const toOptionArray = (source: any): any[] => {
  if (Array.isArray(source)) return source;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* not JSON — no options here */ }
    }
  }
  return [];
};

export const getSpeakableOptions = (question: any): string[] => {
  if (!question) return [];
  const candidates = [
    question.values, question.options, question.Options, question.Values,
    question.DropdownOptions, question.dropdownoptions, question.DropdownValues,
    question.dropdownValues, question?.raw?.values, question?.raw?.options,
  ];
  for (const candidate of candidates) {
    const list = toOptionArray(candidate);
    if (list.length > 0) {
      const texts = list.map(optionText).map(stripOptionPrefix).filter(Boolean);
      if (texts.length > 0) return texts;
    }
  }
  return [];
};

// The row number is already announced as "Row 1", so the serial-number column
// adds nothing but noise when spoken.
const isSerialColumn = (header: string): boolean =>
  /^(?:s\s*\.?\s*no\.?|sr\.?\s*no\.?|serial(?:\s*(?:no\.?|number))?|#)$/i.test(String(header ?? '').trim());

/**
 * Renders the reference table of a Table Analysis question as speech: the column
 * headers once, then every row as "column: value" pairs.
 *
 * The table is drawn on screen underneath the stem but was absent from the spoken
 * text entirely, so questions that can only be answered from the table were read
 * out with their data missing.
 */
export const buildTableSpeechText = (question: any): string => {
  const table = getTableAnalysis(question);
  if (!table || table.Rows.length === 0) return '';

  // Header text is cleaned once and reused as the label for every row cell.
  const headers = table.Columns.map(c => (isSerialColumn(c) ? '' : cleanTextForSpeech(c)));
  const spokenHeaders = headers.filter(Boolean);
  if (spokenHeaders.length === 0) return '';

  const parts: string[] = [`Table with columns ${spokenHeaders.join(', ')}`];

  table.Rows.forEach((row, i) => {
    const cells = row
      .map((cell, ci) => {
        if (ci < headers.length && !headers[ci]) return '';   // serial column
        const value = cleanTextForSpeech(cell);
        if (!value) return '';
        const header = headers[ci];
        return header ? `${header}: ${value}` : value;
      })
      .filter(Boolean);
    if (cells.length > 0) parts.push(`Row ${i + 1}. ${cells.join(', ')}`);
  });

  return parts.join('. ');
};

/**
 * Builds the full text spoken for a question: passage (when present), stem,
 * reference table and every answer option.
 */
export const buildSpeechText = (
  question: any,
  stem: string,
  opts?: { includePassage?: boolean }
): string => {
  const parts: string[] = [];

  if (opts?.includePassage !== false) {
    const tabs = Array.isArray(question?.Tabs) ? question.Tabs
      : (Array.isArray(question?.tabs) ? question.tabs : []);
    tabs.forEach((tab: any, i: number) => {
      // The generator returns the body under `TabContent` for every tab and only
      // sometimes also under `Passage` (often truncated), so prefer the longer one.
      const passage = String(tab?.Passage ?? tab?.passage ?? tab?.Content ?? tab?.content ?? '').trim();
      const tabContent = String(tab?.TabContent ?? tab?.tabContent ?? tab?.tab_content ?? '').trim();
      const source = !passage ? tabContent
        : (!tabContent ? passage : (tabContent.length > passage.length ? tabContent : passage));
      const cleaned = cleanTextForSpeech(source);
      if (cleaned) parts.push(`Passage ${i + 1}. ${cleaned}`);
    });
    if (tabs.length === 0) {
      const single = cleanTextForSpeech(question?.PassageContext ?? question?.passageContext ?? '');
      if (single) parts.push(`Passage. ${single}`);
    }
  }

  const cleanStem = cleanTextForSpeech(stem);
  if (cleanStem) parts.push(cleanStem);

  // The reference table is rendered under the stem, so read it in the same order.
  const tableText = buildTableSpeechText(question);
  if (tableText) parts.push(tableText);

  const options = getSpeakableOptions(question);
  if (options.length > 0) {
    // "Option A." is English. Spoken by a Hindi or Thai voice it comes out as noise
    // in the middle of the question, so a translated question reads its options
    // without the label.
    const questionLang = resolveLanguageCode(
      question?.quesOrigin ?? question?.originallanguage ?? question?.language ?? question?.Language
    ) || detectLangFromText(cleanStem);
    const labelOptions = !questionLang || questionLang.split('-')[0] === 'en';

    const letters = 'ABCDEFGHIJ';
    const spoken = options
      .map((o, i) => {
        const cleaned = cleanTextForSpeech(o);
        if (!cleaned) return '';
        return labelOptions ? `Option ${letters[i] || i + 1}. ${cleaned}` : cleaned;
      })
      .filter(Boolean);
    if (spoken.length > 0) parts.push(spoken.join('. '));
  }

  return parts.join('. ').replace(/\s+/g, ' ').trim();
};

// Voice names that identify a gender, per language. The engine rarely says which a
// voice is, and the previous list held English names only — so for a Hindi, Urdu,
// Tamil or Thai voice neither check matched, the requested gender was silently
// dropped and whichever voice the OS happened to list first was used. That is why
// choosing Male still read a converted question in a female voice.
const MALE_VOICE_NAMES = [
  // English
  'david', 'mark', 'george', 'james', 'richard', 'guy', 'tom', 'fred', 'alex', 'ravi', 'prabhat',
  'brian', 'christopher', 'eric', 'roger', 'steffan', 'liam', 'ryan', 'william',
  // Indian languages
  'hemant', 'madhur', 'valluvar', 'mohan', 'manohar', 'bashkar', 'niranjan', 'gagan',
  'midhun', 'prabhat', 'kunal', 'arjun',
  // Urdu / Arabic / Persian
  'asad', 'salman', 'naayf', 'hamed', 'shakir', 'fahed',
  // East & South-East Asia
  'pattara', 'niwat', 'kangkang', 'yunxi', 'yunjhe', 'ichiro', 'keita', 'injoon', 'namminh', 'andika',
  // Europe
  'pavel', 'dmitry', 'paul', 'henri', 'claude', 'stefan', 'conrad', 'pablo', 'alvaro',
  'daniel', 'antonio', 'cosimo', 'diego', 'maarten', 'sven',
];

const FEMALE_VOICE_NAMES = [
  // English
  'zira', 'hazel', 'catherine', 'susan', 'samantha', 'victoria', 'heera', 'neerja', 'veena',
  'moira', 'tessa', 'fiona', 'aria', 'jenny', 'michelle', 'ana', 'sonia', 'libby', 'natasha',
  // Indian languages
  'kalpana', 'swara', 'pallavi', 'shruti', 'aarohi', 'tanishaa', 'dhwani', 'sapna',
  'sobhana', 'chitra', 'ananya',
  // Urdu / Arabic / Persian
  'gul', 'uzma', 'hoda', 'zariyah', 'salma', 'dilara',
  // East & South-East Asia
  'premwadee', 'achara', 'huihui', 'xiaoxiao', 'hsiaochen', 'ayumi', 'haruka', 'nanami',
  'heami', 'sunhi', 'hoaimy', 'gadis', 'yasmin',
  // Europe
  'irina', 'svetlana', 'hortense', 'julie', 'denise', 'hedda', 'katja', 'helena', 'sabina',
  'elvira', 'maria', 'francisca', 'elsa', 'isabella',
];

/** 'male' | 'female' | '' when the voice gives nothing to go on. */
const voiceGender = (v: SpeechSynthesisVoice): string => {
  // Some engines report it outright; trust that before guessing from the name.
  const declared = String((v as any)?.gender ?? '').trim().toLowerCase();
  if (declared === 'male' || declared === 'female') return declared;

  const n = String(v?.name ?? '').toLowerCase();
  // 'male' is a substring of 'female', so check female first.
  if (n.includes('female')) return 'female';
  if (/male/.test(n)) return 'male';
  if (MALE_VOICE_NAMES.some(k => n.includes(k))) return 'male';
  if (FEMALE_VOICE_NAMES.some(k => n.includes(k))) return 'female';
  return '';
};

const voiceIsMale = (v: SpeechSynthesisVoice): boolean => voiceGender(v) === 'male';
const voiceIsFemale = (v: SpeechSynthesisVoice): boolean => voiceGender(v) === 'female';

export interface VoicePrefs {
  gender?: string;
  accent?: string;
  /** BCP-47 language of the text, e.g. 'th'. Takes priority over accent. */
  lang?: string;
}

/**
 * Language labels as stored on a converted question (`originallanguage` holds
 * "Thai", not "th"), mapped to the BCP-47 tag SpeechSynthesis expects.
 */
const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  english: 'en', malay: 'ms', tamil: 'ta', arabic: 'ar', chinese: 'zh',
  'chinese (traditional)': 'zh-TW', japanese: 'ja', spanish: 'es',
  'spanish (mexico)': 'es-MX', russian: 'ru', french: 'fr', vietnamese: 'vi',
  korean: 'ko', ukrainian: 'uk', welsh: 'cy', turkish: 'tr', polish: 'pl',
  greek: 'el', swedish: 'sv', latvian: 'lv', norwegian: 'no', hungarian: 'hu',
  lithuanian: 'lt', italian: 'it', thai: 'th', hindi: 'hi', bengali: 'bn',
  telugu: 'te', kannada: 'kn', malayalam: 'ml', gujarati: 'gu', marathi: 'mr',
  urdu: 'ur', german: 'de', portuguese: 'pt', dutch: 'nl', indonesian: 'id',
  hebrew: 'he', czech: 'cs', danish: 'da', finnish: 'fi', romanian: 'ro',
  slovak: 'sk', filipino: 'fil', khmer: 'km', lao: 'lo', burmese: 'my',
};

/**
 * Turns whatever language marker a question carries — "Thai", "th", "th-TH", or
 * the `_TH_` segment of a question GUID — into a BCP-47 tag.
 */
export const resolveLanguageCode = (hint: any): string => {
  const raw = String(hint ?? '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (LANGUAGE_NAME_TO_CODE[lower]) return LANGUAGE_NAME_TO_CODE[lower];
  // Already a code such as "th" or "th-TH"
  if (/^[a-z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(lower)) return lower;
  return '';
};

/** Pulls the language segment out of an identifier like IG_..._MC_L1_TH_ID19944. */
export const languageFromQuestionId = (id: any): string => {
  const match = String(id ?? '').match(/_([A-Z]{2})_ID\d+$/);
  if (!match) return '';
  const code = match[1].toLowerCase();
  return code === 'en' ? 'en' : code;
};

/**
 * Picks the best available voice. When `lang` is set (a translated question) a
 * voice for that language wins over the configured English accent, because an
 * English voice cannot pronounce e.g. Thai at all.
 */
export const pickVoice = (
  voices: SpeechSynthesisVoice[],
  prefs: VoicePrefs
): SpeechSynthesisVoice | undefined => {
  if (!voices || voices.length === 0) return undefined;

  const gender = (prefs.gender || 'female').toLowerCase();
  const accent = (prefs.accent || 'en-IN').toLowerCase();
  const wantMale = gender === 'male';
  const matchesGender = (v: SpeechSynthesisVoice) => (wantMale ? voiceIsMale(v) : voiceIsFemale(v));

  // Translated content: a voice that can actually pronounce the script wins.
  if (prefs.lang) {
    const target = prefs.lang.toLowerCase();
    const base = target.split('-')[0];
    const langVoices = voices.filter(v => {
      const l = v.lang.toLowerCase().replace('_', '-');
      return l === target || l.startsWith(`${target}-`) || l === base || l.startsWith(`${base}-`);
    });
    if (langVoices.length > 0) {
      // Requested gender first; then a voice whose gender is unknown, which is a
      // better guess than one known to be the opposite; only then anything at all.
      // Taking langVoices[0] straight away handed back the OS's first voice — usually
      // the female one — so a Male choice was ignored for translated questions.
      return langVoices.find(matchesGender)
        || langVoices.find(v => !voiceGender(v))
        || langVoices[0];
    }
    // No installed voice for this language. Returning an English voice here is
    // worse than returning nothing: an en-US voice cannot pronounce Thai and the
    // engine just stays silent. Leaving the voice unset lets the platform choose
    // from `utterance.lang` instead (including remote/network voices).
    return undefined;
  }

  const matchesAccent = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.toLowerCase();
    const name = v.name.toLowerCase();
    if (accent.includes('in')) return lang.startsWith('en-in') || name.includes('india') || name.includes('indian');
    if (accent.includes('us')) return lang === 'en-us';
    if (accent.includes('gb')) return lang === 'en-gb' || lang.includes('en-gb');
    return lang.startsWith('en');
  };

  return voices.find(v => matchesAccent(v) && matchesGender(v))
    || voices.find(matchesGender)
    || voices.find(matchesAccent)
    || voices.find(v => v.lang.startsWith('en') && v.localService)
    || voices.find(v => v.lang.startsWith('en'))
    || voices[0];
};

/** Reads the persisted TTS preferences (rate / gender / accent). */
export const readSpeechPrefs = (): { rate: number; gender: string; accent: string } => {
  const get = (key: string, fallback: string) => {
    try {
      return sessionStorage.getItem(key) || localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  };
  const rate = parseFloat(get('speechRate', '1.0'));
  return {
    rate: Number.isFinite(rate) ? rate : 1.0,
    gender: get('speechGender', 'female').toLowerCase(),
    accent: get('speechAccent', 'en-IN').toLowerCase(),
  };
};

/** Cancels any in-flight utterance. Safe to call when unsupported. */
export const cancelSpeech = (): void => {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch { /* ignore */ }
};

/**
 * Speaks `text`, choosing a voice from the persisted preferences and the script
 * the text is written in. Returns false when nothing could be spoken.
 */
/**
 * getVoices() is empty until the engine has loaded its list, which on Chrome
 * happens asynchronously after page load. Reading it too early meant no voice
 * was ever matched for the question's language.
 */
export const loadVoices = (timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> =>
  new Promise(resolve => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return resolve([]);
    const existing = window.speechSynthesis.getVoices() || [];
    if (existing.length > 0) return resolve(existing);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices() || []);
    };
    window.speechSynthesis.addEventListener('voiceschanged', finish);
    setTimeout(finish, timeoutMs);
  });

export interface SpeakOptions {
  onend?: () => void;
  onerror?: () => void;
  /**
   * Language of the content when it is known from the question itself
   * (e.g. `originallanguage` = "Thai"). More reliable than sniffing the script,
   * and the only signal available for languages written in Latin characters.
   */
  langHint?: any;
}

export const speakText = async (
  text: string,
  handlers?: SpeakOptions
): Promise<boolean> => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  const clean = (text || '').trim();
  if (!clean) return false;

  cancelSpeech();
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();

  const utterance = new SpeechSynthesisUtterance(clean);
  const prefs = readSpeechPrefs();
  // An explicit language on the question wins over script detection.
  const lang = resolveLanguageCode(handlers?.langHint) || detectLangFromText(clean);

  const voices = await loadVoices();
  const voice = pickVoice(voices, { ...prefs, lang });
  if (voice) utterance.voice = voice;

  // Setting lang explicitly matters on engines that ignore `voice`, and is the
  // only way a language with no installed voice can still be spoken.
  utterance.lang = voice?.lang || lang || prefs.accent || 'en-US';
  if (lang && !voice) {
    console.warn(`[speech] No installed voice for "${lang}"; relying on utterance.lang. ` +
      'Install a system voice for this language for reliable playback.');
  }
  utterance.rate = prefs.rate;
  utterance.pitch = 1.0;

  if (handlers?.onend) utterance.onend = handlers.onend;
  if (handlers?.onerror) utterance.onerror = handlers.onerror;

  window.speechSynthesis.speak(utterance);
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  return true;
};

/**
 * Stops speech when the page/tab is hidden or the component unmounts, so a
 * question does not keep reading after the user switches away.
 * Returns a cleanup function suitable for a React effect.
 */
export const installSpeechAutoStop = (onStopped: () => void): (() => void) => {
  if (typeof document === 'undefined') return () => { };

  const stop = () => {
    cancelSpeech();
    onStopped();
  };
  const onVisibility = () => {
    if (document.hidden) stop();
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', stop);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', stop);
    cancelSpeech();
  };
};
