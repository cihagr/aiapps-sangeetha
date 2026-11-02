/**
 * Converts question content to clean, human-readable text for Word / Excel export.
 *
 * Question text can arrive in three different shapes and often mixes them:
 *  - virtual-keyboard HTML (`<span class="vk-frac">`, `<sup>`, `<span class="vk-matrix">`)
 *  - LaTeX, delimited (`\( \frac{1}{2} \)`) or bare (`\frac{1}{2}`)
 *  - plain text
 *
 * Exporting any of the first two verbatim is what produced the "junk characters"
 * in the exported files, so everything is normalised to readable notation here.
 */

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ',
};

const SUBSCRIPTS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '(': '₍', ')': '₎',
};

const VULGAR_FRACTIONS: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾',
  '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘', '1/6': '⅙',
  '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
};

// LaTeX commands that map onto a single readable character.
const LATEX_SYMBOLS: Record<string, string> = {
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', infty: '∞', partial: '∂', nabla: '∇',
  in: '∈', notin: '∉', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇',
  cup: '∪', cap: '∩', forall: '∀', exists: '∃', neg: '¬',
  rightarrow: '→', to: '→', leftarrow: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
  therefore: '∴', because: '∵', angle: '∠', circ: '°', degree: '°',
  sum: '∑', prod: '∏', int: '∫', alpha: 'α', beta: 'β', gamma: 'γ',
  delta: 'δ', epsilon: 'ε', varepsilon: 'ϵ', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', varsigma: 'ς', tau: 'τ',
  upsilon: 'υ', phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  ldots: '…', dots: '…', cdots: '…', quad: ' ', qquad: '  ',
};

const toScript = (text: string, map: Record<string, string>): string | null => {
  const chars = Array.from(text);
  if (chars.length === 0) return null;
  const out: string[] = [];
  for (const ch of chars) {
    const mapped = map[ch];
    if (!mapped) return null;
    out.push(mapped);
  }
  return out.join('');
};

/** Empty virtual-keyboard slots are placeholders, not content. */
const stripPlaceholders = (s: string): string => String(s ?? '').replace(/[◻□]/g, '');

/** "1/2" reads better as "½"; longer expressions keep the slash form. */
const renderFraction = (num: string, den: string): string => {
  const n = stripPlaceholders(num).trim();
  const d = stripPlaceholders(den).trim();
  if (!n && !d) return '';
  const vulgar = VULGAR_FRACTIONS[`${n}/${d}`];
  if (vulgar) return vulgar;
  const simple = /^[\w.]+$/.test(n) && /^[\w.]+$/.test(d);
  return simple ? `${n}/${d}` : `(${n})/(${d})`;
};

const decodeEntities = (input: string): string => {
  let out = String(input);
  // Content is sometimes double-escaped on its way through the API.
  for (let i = 0; i < 2; i += 1) {
    out = out
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
  }
  return out;
};

const looksLikeHtml = (s: string): boolean => /<[a-z!/][^>]*>/i.test(s);

/**
 * Converts virtual-keyboard HTML to readable text. Elements are processed
 * deepest-first so nested structures (a `<sup>` inside a fraction numerator)
 * survive the conversion.
 */
const htmlToReadableText = (html: string): string => {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ');
  }

  const root = document.createElement('div');
  root.innerHTML = decodeEntities(html);

  root.querySelectorAll('span.math-cursor-placeholder, style, script').forEach(el => el.remove());
  root.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));

  const convert = (el: Element): void => {
    // Virtual-keyboard containers are read whole, before their children are
    // flattened — otherwise the <table> inside a matrix is gone by the time the
    // matrix itself is processed.
    if (el.classList.contains('vk-frac')) {
      const num = el.querySelector('.vk-num')?.textContent ?? '';
      const den = el.querySelector('.vk-den')?.textContent ?? '';
      el.replaceWith(document.createTextNode(renderFraction(num, den)));
      return;
    }

    if (el.classList.contains('vk-matrix')) {
      const rows = Array.from(el.querySelectorAll('tr')).map(tr =>
        Array.from(tr.querySelectorAll('td'))
          .map(td => stripPlaceholders(td.textContent || '').trim())
          .join(' ')
          .trim()
      );
      el.replaceWith(document.createTextNode(`[${rows.filter(Boolean).join('; ')}]`));
      return;
    }

    if (el.classList.contains('vk-sqrt')) {
      const inner = el.querySelector('.vk-sqrt-content')?.textContent
        ?? (el.textContent || '').replace(/^√\(?|\)?$/g, '');
      el.replaceWith(document.createTextNode(`√(${stripPlaceholders(inner).trim()})`));
      return;
    }

    // Depth-first for everything else: children are plain text by the time the
    // parent runs.
    Array.from(el.children).forEach(convert);

    const tag = el.tagName.toLowerCase();
    const text = el.textContent || '';

    if (tag === 'sup') {
      el.replaceWith(document.createTextNode(toScript(text, SUPERSCRIPTS) ?? `^(${text})`));
      return;
    }

    if (tag === 'sub') {
      el.replaceWith(document.createTextNode(toScript(text, SUBSCRIPTS) ?? `_(${text})`));
      return;
    }

    if (tag === 'br') {
      el.replaceWith(document.createTextNode('\n'));
      return;
    }

    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr')).map(tr =>
        Array.from(tr.querySelectorAll('td, th')).map(td => (td.textContent || '').trim()).join(' | ')
      );
      el.replaceWith(document.createTextNode(rows.join('\n')));
      return;
    }

    // Block-level elements need a separator so words do not run together.
    if (tag === 'p' || tag === 'div' || tag === 'li' || tag === 'tr') {
      el.replaceWith(document.createTextNode(`${text}\n`));
      return;
    }
  };

  Array.from(root.children).forEach(convert);
  return root.textContent || '';
};

/**
 * True when the text actually contains LaTeX. The conversions below rewrite `_x`
 * and `^x`, which would otherwise mangle ordinary values such as the book name
 * "Grade_6-Math_Fractions", so they only run when there is LaTeX to convert.
 */
const hasLatexMarkers = (s: string): boolean =>
  s.includes('\\') || /\$[^$\n]+\$/.test(s) || /[_^]\s*\{/.test(s);

/** Converts LaTeX (delimited or bare) to readable inline notation. */
const latexToReadableText = (input: string): string => {
  let s = String(input);
  if (!hasLatexMarkers(s)) return s;

  // Collapse the over-escaped forms the API stores ("\\\\(" -> "\(")
  s = s.replace(/\\{2,}([()[\]a-zA-Z])/g, '\\$1');

  // Strip the math delimiters themselves; the content stays inline.
  s = s.replace(/\\\[|\\\]|\\\(|\\\)/g, ' ');
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ');
  s = s.replace(/\$([^$\n]+?)\$/g, ' $1 ');

  // Fractions, roots and text runs. Repeated so nested cases resolve.
  for (let i = 0; i < 3; i += 1) {
    s = s.replace(/\\(?:d)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a, b) => renderFraction(a, b));
    s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, (_m, n, x) => `${n}√(${x})`);
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, x) => `√(${x})`);
    s = s.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1');
  }

  // Superscript / subscript
  s = s.replace(/\^\s*\{([^{}]*)\}/g, (_m, x) => toScript(x, SUPERSCRIPTS) ?? `^(${x})`);
  s = s.replace(/\^\s*(\w)/g, (_m, x) => toScript(x, SUPERSCRIPTS) ?? `^${x}`);
  s = s.replace(/_\s*\{([^{}]*)\}/g, (_m, x) => toScript(x, SUBSCRIPTS) ?? `_(${x})`);
  s = s.replace(/_\s*(\w)/g, (_m, x) => toScript(x, SUBSCRIPTS) ?? `_${x}`);

  // Named symbols
  s = s.replace(/\\([a-zA-Z]+)/g, (m, name: string) => {
    const sym = LATEX_SYMBOLS[name] ?? LATEX_SYMBOLS[name.toLowerCase()];
    if (sym !== undefined) return sym;
    // Unknown command: keep the readable word rather than the backslash.
    return name;
  });

  // Leftover grouping braces from the LaTeX source
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\\/g, '');

  return s;
};

/**
 * Main entry point: normalises any question content for export.
 */
export const toExportText = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map(toExportText).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    const text = (value as any).text ?? (value as any).value ?? (value as any).label;
    if (text !== undefined) return toExportText(text);
    return '';
  }

  let s = String(value);
  if (!s.trim()) return '';

  // Base64 images never belong in a text cell.
  s = s.replace(/data:image\/[a-zA-Z]+;base64,[^"'\s>]+/g, '');

  if (looksLikeHtml(s)) {
    s = htmlToReadableText(s);
  } else {
    s = decodeEntities(s);
  }

  s = latexToReadableText(s);

  return stripPlaceholders(s)
    // Invisible characters are what show up as "junk" in Word/Excel.
    .replace(/[​-‍﻿­]/g, '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    // Stripping math delimiters leaves a gap before trailing punctuation.
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/** Strips a leading "A. " / "b) " option label, then normalises the option text. */
export const toExportOptionText = (value: any): string => {
  const raw = typeof value === 'string' ? value : toExportText(value);
  return toExportText(String(raw).replace(/^\s*[A-Ja-j][.):]\s*/, ''));
};

export default toExportText;
