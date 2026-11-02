// src/utils/mathConverters.ts
// Conversion helpers: plain markup <-> display HTML

// Plain markup conventions used here:
// frac(a,b)             -> fraction
// a upon b              -> fraction (preferred format)
// sup(x)                -> <sup>x</sup>
// sqrt(x)               -> √(x) (we keep sqrt as √(x) plain)
// matrix([[a,b],[c,d]]) -> matrix representation (basic)
// Other templates map to TEMPLATES keys: log_10, sin_inv, etc.

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Convert a template name + optional args into HTML fraction/matrix etc.
// Very small templating to match TEMPLATES used in your keyboard.
export function templateToHTML(name: string, plainTemplate?: string) : string {
  if (!name && !plainTemplate) return '';
  const t = name || '';
  // handle specific ones
  if (t === 'frac' || (plainTemplate && plainTemplate.includes('───'))) {
    // Render a 2-slot fraction placeholder
    return `<span class="vk-frac" contenteditable="false"><span class="vk-num" contenteditable="true">◻</span><span class="vk-bar"></span><span class="vk-den" contenteditable="true">◻</span></span>`;
  }
  if (t === 'matrix') {
    // small 2x2 placeholder matrix
    return `<span class="vk-matrix" contenteditable="false"><span class="vk-matrix-paren">(</span><table contenteditable="false"><tbody><tr><td contenteditable="true">◻</td><td contenteditable="true">◻</td></tr><tr><td contenteditable="true">◻</td><td contenteditable="true">◻</td></tr></tbody></table><span class="vk-matrix-paren">)</span></span>`;
  }
  if (t === 'sup' || (plainTemplate && plainTemplate.includes('^{'))) {
    return `<sup contenteditable="true">◻</sup>`;
  }
  if (t === 'pow' || plainTemplate === '◻²') {
    return `◻<sup contenteditable="true">2</sup>`;
  }
  if (t === 'sqrt') {
    return `<span class="vk-sqrt" contenteditable="false">√(<span contenteditable="true">◻</span>)</span>`;
  }
  if (t === 'int_inf') {
    return `∫<sub contenteditable="true">0</sub><sup contenteditable="true">∞</sup> <span contenteditable="true">◻</span>`;
  }
  if (['sin','cos','tan','log','ln','exp'].includes(t)) {
    return `${t}(<span contenteditable="true">◻</span>)`;
  }
  if (['sin_inv','cos_inv','tan_inv'].includes(t)) {
    const base = t.split('_')[0];
    return `${base}<sup contenteditable="false">-1</sup>(<span contenteditable="true">◻</span>)`;
  }
  if (t === 'log_10') {
    return `log₁₀(<span contenteditable="true">◻</span>)`;
  }
  if (t === 'abs' || t === 'modulus') {
    return `|<span contenteditable="true">◻</span>|`;
  }
  if (t === 'norm') {
    return `||<span contenteditable="true">◻</span>||`;
  }
  if (t === 'lim') {
    return `lim<sub contenteditable="true">◻→◻</sub>(<span contenteditable="true">◻</span>)`;
  }
  if (t === 'integral' || t === 'int') {
    return `∫<sub contenteditable="true">◻</sub><sup contenteditable="true">◻</sup> <span contenteditable="true">◻</span> d<span contenteditable="true">◻</span>`;
  }
  if (t === 'overline' || t === 'conjugate') {
    return `<span style="text-decoration: overline;"><span contenteditable="true">◻</span></span>`;
  }
  if (t === 'underbrace') {
    return `<span class="vk-underbrace" contenteditable="false"><span contenteditable="true">◻</span></span>`;
  }
  if (t === 'derivative') {
    return `(d/d<span contenteditable="true">◻</span>)<span contenteditable="true">◻</span>`;
  }
  if (t === 'nth_derivative') {
    return `(dⁿ/d<span contenteditable="true">◻</span>ⁿ)<span contenteditable="true">◻</span>`;
  }
  if (t === 'sum') {
    return `∑<sub contenteditable="true">i=◻</sub><sup contenteditable="true">◻</sup> <span contenteditable="true">◻</span>`;
  }
  if (t === 'prod') {
    return `∏<sub contenteditable="true">i=◻</sub><sup contenteditable="true">◻</sup> <span contenteditable="true">◻</span>`;
  }
  if (t === 'argument') {
    return `arg(<span contenteditable="true">◻</span>)`;
  }
  if (t === 'real_part') {
    return `Re(<span contenteditable="true">◻</span>)`;
  }
  if (t === 'imag_part') {
    return `Im(<span contenteditable="true">◻</span>)`;
  }
  if (t === 'nthrt') {
    return `<span contenteditable="true">ⁿ</span>√(<span contenteditable="true">◻</span>)`;
  }
  if (t === 'log_a') {
    return `logₐ(<span contenteditable="true">◻</span>)`;
  }
  // fallback: try to use plainTemplate by escaping and replacing box placeholder with editable span
  if (plainTemplate) {
    // replace '◻' with editable spans
    const escaped = escapeHtml(plainTemplate);
    return escaped.replace(/◻/g, `<span contenteditable="true">◻</span>`).replace(/\n───\n/, `<span class="vk-bar"></span>`);
  }
  // default: simple text node
  return escapeHtml(name);
}

// Render plain markup (what we store in DB) into HTML UI for contentEditable
export function renderMathHTML(plain: string): string {
  if (!plain) return '';

  let s = plain;

  // Convert inline "a upon b" to an HTML fraction without swallowing the whole line
  // Replace only the minimal phrase, not the entire string before/after
  s = s.replace(/\b([^\s<>]+)\s+upon\s+([^\s<>]+)\b/gi, (_m, a, b) => {
    const num = escapeHtml(String(a).trim());
    const den = escapeHtml(String(b).trim());
    return `<span class="vk-frac" contenteditable="false"><span class="vk-num" contenteditable="true">${num || '◻'}</span><span class="vk-bar"></span><span class="vk-den" contenteditable="true">${den || '◻'}</span></span>`;
  });

  // Convert frac(a,b) or frac(a,b,c?) -> HTML frac
  s = s.replace(/frac\(\s*([^,]+?)\s*,\s*([^,]+?)\s*\)/g, (_m, a, b) => {
    const num = escapeHtml(a.trim());
    const den = escapeHtml(b.trim());
    return `<span class="vk-frac" contenteditable="false"><span class="vk-num" contenteditable="true">${num || '◻'}</span><span class="vk-bar"></span><span class="vk-den" contenteditable="true">${den || '◻'}</span></span>`;
  });

  // Convert \frac{a}{b} (LaTeX) — quick support
  s = s.replace(/\\frac\{\s*([^}]+)\s*\}\{\s*([^}]+)\s*\}/g, (_m, a, b) => {
    const num = escapeHtml(a.trim());
    const den = escapeHtml(b.trim());
    return `<span class="vk-frac" contenteditable="false"><span class="vk-num" contenteditable="true">${num || '◻'}</span><span class="vk-bar"></span><span class="vk-den" contenteditable="true">${den || '◻'}</span></span>`;
  });

  // Conservative: simple numeric fraction like 7/9 -> inline fraction
  // Only match single-digit numerator/denominator to avoid false positives like dates/paths
  s = s.replace(/\b(\d)\s*\/\s*(\d)\b/g, (_m, a, b) => {
    return `<span class="vk-frac" contenteditable="false"><span class="vk-num" contenteditable="true">${a}</span><span class="vk-bar"></span><span class="vk-den" contenteditable="true">${b}</span></span>`;
  });

  // sup(x) -> <sup>x</sup>
  s = s.replace(/sup\(\s*([^)]+?)\s*\)/g, (_m, x) => `<sup contenteditable="true">${escapeHtml(x.trim())}</sup>`);

  // sup literal ^{x}
  s = s.replace(/\^\{([^}]+)\}/g, (_m, x) => `<sup contenteditable="true">${escapeHtml(x)}</sup>`);

  // sqrt(x) -> √(x) but make x editable
  s = s.replace(/sqrt\(\s*([^)]+?)\s*\)/g, (_m, x) => `√(<span contenteditable="true">${escapeHtml(x.trim())}</span>)`);

  // log_10(◻) or log₁₀(◻) -> keep text but ensure editable slot
  s = s.replace(/log(?:_10)?\(\s*([^)]+?)\s*\)/g, (_m, x) => `log₁₀(<span contenteditable="true">${escapeHtml(x.trim())}</span>)`);

  // Keep numeric / text etc. Convert any remaining '◻' to editable placeholders
  s = s.replace(/◻/g, `<span contenteditable="true">◻</span>`);

  // Matrices saved in syntax matrix([[a,b],[c,d]]) -> convert to simple 2x2
  s = s.replace(/matrix\(\s*\[\s*\[\s*([^\]]+?)\s*\]\s*,\s*\[\s*([^\]]+?)\s*\]\s*\]\s*\)/g, (_m, r1, r2) => {
    const c1 = r1.split(',').map(x => escapeHtml(x.trim()));
    const c2 = r2.split(',').map(x => escapeHtml(x.trim()));
    return `<span class="vk-matrix" contenteditable="false"><span class="vk-matrix-paren">(</span><table contenteditable="false"><tbody><tr><td contenteditable="true">${c1[0]||'◻'}</td><td contenteditable="true">${c1[1]||'◻'}</td></tr><tr><td contenteditable="true">${c2[0]||'◻'}</td><td contenteditable="true">${c2[1]||'◻'}</td></tr></tbody></table><span class="vk-matrix-paren">)</span></span>`;
  });

  s = s.replace(/\b(sin|cos|tan|log|ln|exp)\(\s*([^)]+?)\s*\)/g, (_m, fn, x) => `${fn}(<span contenteditable="true">${escapeHtml(x.trim())}</span>)`);
  s = s.replace(/\b(sin|cos|tan)⁻¹\(\s*([^)]+?)\s*\)/g, (_m, fn, x) => `${fn}<sup contenteditable="false">-1</sup>(<span contenteditable="true">${escapeHtml(x.trim())}</span>)`);
  s = s.replace(/\|\|\s*(.*?)\s*\|\|/g, (_m, x) => `||<span contenteditable="true">${escapeHtml(x)}</span>||`);
  s = s.replace(/\|(.*?)\|/g, (_m, x) => `|<span contenteditable="true">${escapeHtml(x)}</span>|`);
  s = s.replace(/lim_\{\s*([^}]+?)\s*→\s*([^}]+?)\s*\}\(\s*([^)]+?)\s*\)/g, (_m, a, b, c) => `lim<sub contenteditable="true">${escapeHtml(a)}→${escapeHtml(b)}</sub>(<span contenteditable="true">${escapeHtml(c)}</span>)`);
  s = s.replace(/∫_\{\s*([^}]+?)\s*\}\^\{\s*([^}]+?)\s*\}\s*(.*?)\s*d(\S+)/g, (_m, lo, hi, expr, v) => `∫<sub contenteditable="true">${escapeHtml(lo)}</sub><sup contenteditable="true">${escapeHtml(hi)}</sup> <span contenteditable="true">${escapeHtml(expr.trim())}</span> d<span contenteditable="true">${escapeHtml(v)}</span>`);
  s = s.replace(/overline\(\s*([^)]+?)\s*\)/g, (_m, x) => `<span style="text-decoration: overline;"><span contenteditable="true">${escapeHtml(x)}</span></span>`);
  s = s.replace(/underbrace\(\s*([^)]+?)\s*\)/g, (_m, x) => `<span class="vk-underbrace" contenteditable="false"><span contenteditable="true">${escapeHtml(x)}</span></span>`);
  s = s.replace(/\(d\/d([^\)]+)\)([^]*)/g, (_m, v, f) => `(d/d<span contenteditable="true">${escapeHtml(v.trim())}</span>)<span contenteditable="true">${escapeHtml(f.trim())}</span>`);
  s = s.replace(/\(dⁿ\/d([^\)]+)ⁿ\)([^]*)/g, (_m, v, f) => `(dⁿ/d<span contenteditable="true">${escapeHtml(v.trim())}</span>ⁿ)<span contenteditable="true">${escapeHtml(f.trim())}</span>`);
  s = s.replace(/∑_\{\s*i\s*=\s*([^}]+?)\s*\}\^\{\s*([^}]+?)\s*\}\s*(.*)/g, (_m, from, to, expr) => `∑<sub contenteditable="true">i=${escapeHtml(from)}</sub><sup contenteditable="true">${escapeHtml(to)}</sup> <span contenteditable="true">${escapeHtml(expr.trim())}</span>`);
  s = s.replace(/∏_\{\s*i\s*=\s*([^}]+?)\s*\}\^\{\s*([^}]+?)\s*\}\s*(.*)/g, (_m, from, to, expr) => `∏<sub contenteditable="true">i=${escapeHtml(from)}</sub><sup contenteditable="true">${escapeHtml(to)}</sup> <span contenteditable="true">${escapeHtml(expr.trim())}</span>`);
  s = s.replace(/arg\(\s*([^)]+?)\s*\)/g, (_m, x) => `arg(<span contenteditable="true">${escapeHtml(x.trim())}</span>)`);
  s = s.replace(/Re\(\s*([^)]+?)\s*\)/g, (_m, x) => `Re(<span contenteditable="true">${escapeHtml(x.trim())}</span>)`);
  s = s.replace(/Im\(\s*([^)]+?)\s*\)/g, (_m, x) => `Im(<span contenteditable="true">${escapeHtml(x.trim())}</span>)`);
  s = s.replace(/logₐ\(\s*([^)]+?)\s*\)/g, (_m, x) => `logₐ(<span contenteditable="true">${escapeHtml(x.trim())}</span>)`);
  s = s.replace(/ⁿ√\(\s*([^)]+?)\s*\)/g, (_m, x) => `<span contenteditable="true">ⁿ</span>√(<span contenteditable="true">${escapeHtml(x.trim())}</span>)`);

  // Basic escaping already done above; return final HTML
  return s;
}

// Convert contentEditable HTML back to plain markup to save to DB
export function htmlToPlain(html: string): string {
  if (!html) return '';

  let s = html;

  // Fraction -> plain text using slash: "num/den"
  // Primary pattern - exact match for vk-frac structure
  s = s.replace(/<span[^>]*class="vk-frac"[^>]*>.*?<span[^>]*class="vk-num"[^>]*>(.*?)<\/span>.*?<span[^>]*class="vk-bar"[^>]*><\/span>.*?<span[^>]*class="vk-den"[^>]*>(.*?)<\/span>.*?<\/span>/gsi, (_m, a, b) => {
    const num = a ? a.replace(/<[^>]+>/g, '').trim() : '';
    const den = b ? b.replace(/<[^>]+>/g, '').trim() : '';
    const left = num || '◻';
    const right = den || '◻';
    console.log('Converting fraction (primary):', { num, den, left, right }); // Debug log
    return `${left}/${right}`;
  });

  // Fallback pattern - more permissive for any fraction-like structure
  s = s.replace(/<span[^>]*class="vk-frac"[^>]*>(.*?)<\/span>/gsi, (_m, content) => {
    console.log('Fallback fraction pattern:', { content }); // Debug log
    // Extract numerator and denominator from content
    const numMatch = content.match(/<span[^>]*class="vk-num"[^>]*>(.*?)<\/span>/si);
    const denMatch = content.match(/<span[^>]*class="vk-den"[^>]*>(.*?)<\/span>/si);
    
    if (numMatch && denMatch) {
      const num = numMatch[1].replace(/<[^>]+>/g, '').trim() || '◻';
      const den = denMatch[1].replace(/<[^>]+>/g, '').trim() || '◻';
      console.log('Converting fraction (fallback):', { num, den }); // Debug log
      return `${num}/${den}`;
    }
    return _m; // Return original if no match
  });

  // Matrix -> matrix([[a,b],[c,d]]) (handles the 2x2 we created)
  s = s.replace(/<span[^>]*class=["']vk-matrix["'][^>]*>.*?<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>.*?<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>.*?<\/span>/gsi, (_m, a,b,c,d) => {
    const A = (a||'').replace(/<[^>]+>/g,'').trim() || '◻';
    const B = (b||'').replace(/<[^>]+>/g,'').trim() || '◻';
    const C = (c||'').replace(/<[^>]+>/g,'').trim() || '◻';
    const D = (d||'').replace(/<[^>]+>/g,'').trim() || '◻';
    return `matrix([[${A},${B}],[${C},${D}]])`;
  });

  // <sup> -> caret notation: ^x or ^{...}
  s = s.replace(/<sup[^>]*>(.*?)<\/sup>/gsi, (_m, x) => {
    const clean = x.replace(/<[^>]+>/g,'').trim();
    if (!clean) return '';
    return clean.length === 1 ? `^${clean}` : `^{${clean}}`;
  });

  // √(<span>...</span>) -> sqrt(x)
  s = s.replace(/√\(\s*<span[^>]*>(.*?)<\/span>\s*\)/gsi, (_m, x) => `sqrt(${x.replace(/<[^>]+>/g,'').trim()})`);

  // log₁₀(<span>x</span>) -> log_10(x)
  s = s.replace(/log₁₀\(\s*<span[^>]*>(.*?)<\/span>\s*\)/gsi, (_m, x) => `log_10(${x.replace(/<[^>]+>/g,'').trim()})`);

  // Remove any remaining tags but preserve simple text separators
  s = s.replace(/<br\s*\/?>/gi, '\n');

  // collapse tags to text
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');

  // Trim whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}
