/**
 * Sanitizes HTML content to remove unwanted tags and attributes
 * while preserving the visual appearance of text content
 */

 const decodePossiblyEscapedHtml = (input: string): string => {
   if (!input) return '';

   let out = String(input);
   for (let i = 0; i < 2; i += 1) {
     out = out
       .replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&nbsp;/g, ' ')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'");
   }
   return out;
 };

export const sanitizeHtml = (html: string): string => {
  if (!html) return '';

  // Create a temporary div to parse the HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = decodePossiblyEscapedHtml(html);

  // Remove transient cursor placeholders
  tempDiv.querySelectorAll('span.math-cursor-placeholder').forEach(el => {
    el.remove();
  });

  // Remove contenteditable attributes but keep the elements
  tempDiv.querySelectorAll('[contenteditable]').forEach(el => {
    el.removeAttribute('contenteditable');
  });

  // Convert common math elements to plain text
  tempDiv.querySelectorAll('sup, sub, .vk-frac, .vk-matrix, .vk-sqrt').forEach(el => {
    const tag = el.tagName.toLowerCase();
    const content = el.textContent || '';
    
    if (tag === 'sup') {
      // Handle superscripts (exponents)
      el.outerHTML = `^(${content})`;
    } 
    else if (tag === 'sub') {
      // Handle subscripts
      el.outerHTML = `_(${content})`;
    }
    else if (el.classList.contains('vk-frac')) {
      // Handle fractions
      const num = el.querySelector('.vk-num')?.textContent || '';
      const den = el.querySelector('.vk-den')?.textContent || '';
      el.outerHTML = `(${num})/(${den})`;
    }
    else if (el.classList.contains('vk-sqrt')) {
      // Handle square roots
      const content = el.textContent || '';
      el.outerHTML = `√(${content})`;
    }
    else if (el.classList.contains('vk-matrix')) {
      // Handle matrices (simplify to text representation)
      const rows = Array.from(el.querySelectorAll('tr')).map(tr => 
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent || '□').join(' ')
      );
      el.outerHTML = `[${rows.join('; ')}]`;
    }
  });

  // Clean up any remaining HTML tags
  let cleanHtml = tempDiv.innerHTML
    // Replace common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    // Remove any remaining HTML tags
    .replace(/<[^>]*>?/gm, '')
    // Collapse multiple spaces
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanHtml;
};

/**
 * Sanitizes HTML content for display in contenteditable areas
 * Keeps the structure but ensures no raw HTML tags are visible
 */
export const sanitizeForDisplay = (html: string): string => {
  if (!html) return '';

  // Create a temporary div to parse the HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = decodePossiblyEscapedHtml(html);

  tempDiv.querySelectorAll('[contenteditable]').forEach(el => {
    el.removeAttribute('contenteditable');
  });

  tempDiv.querySelectorAll('span.math-cursor-placeholder').forEach(el => {
    el.remove();
  });

  const allowedTags = new Set(['SUP', 'SUB', 'BR', 'DIV', 'P', 'SPAN', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TD', 'TH']);
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        node.textContent = node.textContent
          .replace(/&nbsp;/g, ' ')
          .replace(/\u00A0/g, ' ')
          .replace(/[\u200B-\u200D\uFEFF]/g, '');
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.classList.contains('math-cursor-placeholder')) {
      el.remove();
      return;
    }

    const tag = el.tagName.toUpperCase();
    if (!allowedTags.has(tag)) {
      el.replaceWith(document.createTextNode(el.textContent || ''));
      return;
    }

    el.removeAttribute('contenteditable');
    Array.from(el.attributes).forEach(attr => {
      if (attr.name !== 'class') {
        el.removeAttribute(attr.name);
      }
    });

    Array.from(el.childNodes).forEach(walk);

    if (tag === 'SPAN' && !el.className && !el.textContent?.trim() && el.childNodes.length === 0) {
      el.remove();
    }
  };

  Array.from(tempDiv.childNodes).forEach(walk);

  return tempDiv.innerHTML;
};

/**
 * Sanitizes HTML content for safe rendering with React's dangerouslySetInnerHTML
 */
export const sanitizeForRender = (html: string): { __html: string } => {
  return { __html: sanitizeForDisplay(html) };
};
