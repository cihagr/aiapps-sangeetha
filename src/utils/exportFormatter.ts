/**
 * Export Formatting Utilities
 * Converts mathematical content from HTML/virtual keyboard format to clean, human-readable notation
 * Compatible with Microsoft Word (DOCX) and Microsoft Excel (XLSX)
 */

import { sanitizeHtml } from './htmlSanitizer';

/**
 * Converts mathematical content to clean, human-readable notation for export
 * @param content The content containing mathematical expressions in HTML/virtual keyboard format
 * @returns Clean text with properly formatted mathematical expressions
 */
export function formatForExport(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  let clean = content;

  // First, use the existing HTML sanitizer to remove editor artifacts
  clean = sanitizeHtml(clean);

  // Additional cleanup for export-specific requirements
  
  // Convert fractions to inline format "a/b"
  clean = clean.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '$1/$2');
  clean = clean.replace(/\(([^)]+)\)\/([^)]+)/g, '$1/$2');
  clean = clean.replace(/([^)]+)\)\/\(([^)]+)\)/g, '$1/$2');
  
  // Convert any remaining fraction patterns
  clean = clean.replace(/(\d+)\/(\d+)/g, '$1/$2');
  
  // Handle integrals - convert to readable format
  clean = clean.replace(/∫\s*\^?\{?([^}]*)\}?\_?\{?([^}]*)\}?\s*([^d]*?)\s*d([a-zA-Z]+)/g, 
    (match, upper, lower, expr, variable) => {
      const lowerBound = lower || '0';
      const upperBound = upper || '∞';
      const expression = expr?.trim() || 'dx';
      const varName = variable || 'x';
      return `∫ from ${lowerBound} to ${upperBound} ${expression} d${varName}`;
    });
  
  // Simple integral patterns
  clean = clean.replace(/∫\s*([^d]*?)\s*d([a-zA-Z]+)/g, 
    (match, expr, variable) => {
      const expression = expr?.trim() || '';
      const varName = variable || 'x';
      return `∫ ${expression} d${varName}`;
    });
  
  // Convert exponents to readable format
  clean = clean.replace(/\^\(([^)]+)\)/g, '^$1');
  clean = clean.replace(/\^\{([^}]+)\}/g, '^$1');
  clean = clean.replace(/\^(\d)/g, '²');
  clean = clean.replace(/\^(\d)/g, (match, digit) => {
    const superscripts: { [key: string]: string } = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
    };
    return superscripts[digit] || `^${digit}`;
  });
  
  // Convert subscripts
  clean = clean.replace(/_\(([^)]+)\)/g, '_$1');
  clean = clean.replace(/_\{([^}]+)\}/g, '_$1');
  
  // Convert square roots
  clean = clean.replace(/√\(([^)]+)\)/g, '√($1)');
  clean = clean.replace(/sqrt\(([^)]+)\)/g, '√($1)');
  
  // Convert logarithms
  clean = clean.replace(/log_10\(([^)]+)\)/g, 'log₁₀($1)');
  clean = clean.replace(/logₐ\(([^)]+)\)/g, 'logₐ($1)');
  clean = clean.replace(/log\(([^)]+)\)/g, 'log($1)');
  clean = clean.replace(/ln\(([^)]+)\)/g, 'ln($1)');
  
  // Convert trigonometric functions
  clean = clean.replace(/sin\^-1\(([^)]+)\)/g, 'sin⁻¹($1)');
  clean = clean.replace(/cos\^-1\(([^)]+)\)/g, 'cos⁻¹($1)');
  clean = clean.replace(/tan\^-1\(([^)]+)\)/g, 'tan⁻¹($1)');
  clean = clean.replace(/sin\(([^)]+)\)/g, 'sin($1)');
  clean = clean.replace(/cos\(([^)]+)\)/g, 'cos($1)');
  clean = clean.replace(/tan\(([^)]+)\)/g, 'tan($1)');
  
  // Convert limits
  clean = clean.replace(/lim_\{([^}]+)→([^}]+)\}\(([^)]+)\)/g, 'lim as $1→$2 of ($3)');
  
  // Convert sums and products
  clean = clean.replace(/∑_\{i=([^}]+)\}\^\{([^}]+)\}\s*(.+)/g, '∑ from i=$1 to $2 of $3');
  clean = clean.replace(/∏_\{i=([^}]+)\}\^\{([^}]+)\}\s*(.+)/g, '∏ from i=$1 to $2 of $3');
  
  // Convert derivatives
  clean = clean.replace(/\(d\/d([^)]+)\)([^)]+)/g, '(d/d$1)$2');
  clean = clean.replace(/\(dⁿ\/d([^)]+)ⁿ\)([^)]+)/g, '(dⁿ/d$1ⁿ)$2');
  
  // Convert matrices to readable format
  clean = clean.replace(/\[([^;]+);\s*([^]]+)\]/g, '[$1; $2]');
  clean = clean.replace(/matrix\(\[\[([^\]]+)\]\]/g, 'matrix([[$1]]');
  
  // Convert absolute values and norms
  clean = clean.replace(/\|\|([^|]+)\|\|/g, '||$1||');
  clean = clean.replace(/\|([^|]+)\|/g, '|$1|');
  
  // Remove any remaining HTML artifacts
  clean = clean.replace(/contenteditable="[^"]*"/g, '');
  clean = clean.replace(/class="[^"]*"/g, '');
  clean = clean.replace(/<[^>]*>/g, '');
  
  // Clean up whitespace and formatting
  clean = clean.replace(/\s+/g, ' ');
  clean = clean.replace(/\(\s+/g, '(');
  clean = clean.replace(/\s+\)/g, ')');
  clean = clean.replace(/\{\s+/g, '{');
  clean = clean.replace(/\s+\}/g, '}');
  
  // Remove placeholder boxes
  clean = clean.replace(/◻/g, '');
  clean = clean.replace(/□/g, '');
  
  return clean.trim();
}

/**
 * Formats question options for export
 * @param options Array of option texts or objects
 * @returns Array of formatted option texts
 */
export function formatOptionsForExport(options: any[]): string[] {
  if (!Array.isArray(options)) {
    return [];
  }
  
  return options.map(option => {
    const text = typeof option === 'string' 
      ? option 
      : (option?.text || option?.value || '');
    
    // Remove leading letters/numbers and punctuation
    const cleanText = String(text).replace(/^[A-Z0-9][\.,)]\s*/, '').trim();
    
    return formatForExport(cleanText);
  });
}

/**
 * Formats question stem/text for export
 * @param stem The question text
 * @returns Formatted question text
 */
export function formatStemForExport(stem: string): string {
  if (!stem || typeof stem !== 'string') {
    return '';
  }
  
  return formatForExport(stem);
}

/**
 * Formats feedback text for export
 * @param feedback The feedback text
 * @returns Formatted feedback text
 */
export function formatFeedbackForExport(feedback: string): string {
  if (!feedback || typeof feedback !== 'string') {
    return '';
  }
  
  return formatForExport(feedback);
}

/**
 * Formats content for Word with proper mathematical equations
 * @param content The content containing mathematical expressions
 * @returns Array of Word-compatible content (text and equations)
 */
export function formatForWordExport(content: string): any[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // First, use the existing HTML sanitizer to remove editor artifacts
  let clean = sanitizeHtml(content);
  const result: any[] = [];
  
  // Convert fractions to Word equation format
  clean = clean.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, (match, numerator, denominator) => {
    // Create a Word equation for the fraction
    result.push({ type: 'text', content: match }); // Keep original as fallback
    result.push({ 
      type: 'equation', 
      content: `\\f(${numerator},${denominator})`,
      original: match
    });
    return ''; // Remove from text stream
  });
  
  // Convert integrals to Word equation format
  clean = clean.replace(/∫\s*\^?\{?([^}]*)\}?\_?\{?([^}]*)\}?\s*([^d]*?)\s*d([a-zA-Z]+)/g, 
    (match, upper, lower, expr, variable) => {
      const lowerBound = lower || '0';
      const upperBound = upper || '∞';
      const expression = expr?.trim() || 'dx';
      const varName = variable || 'x';
      
      result.push({ type: 'text', content: match }); // Keep original as fallback
      result.push({ 
        type: 'equation', 
        content: `\\i\\u${upperBound}\\l${lowerBound}(${expression})d${varName}`,
        original: match
      });
      return '';
    });
  
  // Convert exponents to Word equation format
  clean = clean.replace(/\^\(([^)]+)\)/g, (match, exponent) => {
    result.push({ type: 'text', content: match });
    result.push({ 
      type: 'equation', 
      content: `^(${exponent})`,
      original: match
    });
    return '';
  });
  
  // Convert subscripts to Word equation format
  clean = clean.replace(/_\(([^)]+)\)/g, (match, subscript) => {
    result.push({ type: 'text', content: match });
    result.push({ 
      type: 'equation', 
      content: `_(${subscript})`,
      original: match
    });
    return '';
  });
  
  // Convert square roots to Word equation format
  clean = clean.replace(/√\(([^)]+)\)/g, (match, radicand) => {
    result.push({ type: 'text', content: match });
    result.push({ 
      type: 'equation', 
      content: `\\r(${radicand})`,
      original: match
    });
    return '';
  });
  
  // Add any remaining text
  if (clean.trim()) {
    result.push({ type: 'text', content: clean.trim() });
  }
  
  return result;
}

/**
 * Formats matrix content for export
 * @param rows Array of row objects
 * @param columns Array of column objects
 * @returns Formatted matrix representation
 */
export function formatMatrixForExport(rows: any[], columns: any[]): string {
  if (!Array.isArray(rows) || !Array.isArray(columns)) {
    return '';
  }
  
  const visibleRows = rows.filter(row => 
    !row?.hidden && !row?.isHidden && String(row?.text || row?.value || '').trim()
  );
  
  const visibleCols = columns.filter(col => 
    !col?.hidden && !col?.isHidden && String(col?.text || col?.value || '').trim()
  );
  
  if (visibleRows.length === 0 || visibleCols.length === 0) {
    return '';
  }
  
  const header = '\t' + visibleCols.map(col => String(col?.text || col?.value || '')).join('\t');
  const matrixRows = visibleRows.map(row => {
    const rowLabel = String(row?.text || row?.value || '');
    return rowLabel + '\t' + visibleCols.map(() => '').join('\t');
  });
  
  return [header, ...matrixRows].join('\n');
}
