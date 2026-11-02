
import React, { useEffect, useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';
import { fontWeight } from 'html2canvas/dist/types/css/property-descriptors/font-weight';
import 'katex/dist/katex.min.css';
import { Weight } from 'lucide-react';

interface LatexRendererProps {
  content: string | any;
  displayMode?: boolean;
  className?: string;
  isQuestion?: boolean;
  assumeMath?: boolean;   // NEW
}

// --- ERROR BOUNDARY (React) ---
// Use a class-based error boundary to catch render-time errors from KaTeX
// components and prevent the whole app from unmounting (blank page).
class LaTeXErrorBoundary extends React.Component<{ children: React.ReactNode; fallbackText?: string }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    // Log the error for debugging (can be sent to an error service)
    // Avoid calling error.preventDefault here; React handles errors.
    // console.error('LaTeX render error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <span>{this.props.fallbackText ?? '[LaTeX error]'}</span>;
    }
    return this.props.children as React.ReactElement;
  }
}

function fixPlainSymbols(text: string): string {
  if (!text) return '';
  let str = String(text);

  // Split by existing math blocks ($...$, \(...\)) to ONLY fix plain text outside $
  const DELIM_RE = /(\$[^$]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$)/g;
  const parts = str.split(DELIM_RE);

  return parts.map((part) => {
    if (!part) return '';
    // Skip existing math blocks completely
    if (part.startsWith('$') || part.startsWith('\\(') || part.startsWith('\\[')) {
      return part;
    }

    let prose = part;

    // 1. Degree: "60deg", "(60deg)", "60 deg", "60°", "-120°" -> "$60^\circ$"
    prose = prose.replace(/(?<!\$)(-?\d+)\s*(?:deg|°)\b(?!\$)/gi, '$$$1^\\circ$');

    // 2. Theta: plain word "theta" outside LaTeX -> "$\theta$"
    prose = prose.replace(/(?<![\\$])\btheta\b(?!\$)/gi, '$$\\theta$');

    // 3. Pi: plain "pi" outside LaTeX (e.g. "pi/2", "pi/5", "13pi/2", "pi") -> "$\pi$"
    prose = prose.replace(/(?<![\\$])(?:\b|(?<=\d))pi\b(?!\$)/gi, '$$\\pi$');

    // 4. Sqrt: plain "sqrt(2)", "sqrt{2}", "sqrt2" -> "$\sqrt{2}$"
    prose = prose.replace(/(?<![\\$])sqrt[\{(\(]?([0-9a-zA-Z]+)[\}\)]?(?!\$)/gi, '$$\\sqrt{$1}$');

    return prose;
  }).join('');
}

// --- BASIC DECODER ---
function decodeLatexFromDB(str: string): string {
  if (!str) return '';
  let decoded = String(str);

  decoded = decoded.replace(/&nbsp;/gi, ' ');
  decoded = decoded.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');
  decoded = decoded.replace(/\\{2,}([()\[\]a-zA-Z])/g, '\\$1');
  decoded = decoded.replace(/\\{2,}/g, '\\\\');
  decoded = decoded.replace(/\r\n|\r/g, '\n').replace(/[ \t]+/g, ' ');

  decoded = fixPlainSymbols(decoded);

  const MATH_RE = /(\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$(?!\d))/g;
  const blocks: string[] = [];
  let temp = decoded.replace(MATH_RE, (match) => {
    blocks.push(match);
    return `__MATH_BLOCK_${blocks.length - 1}__`;
  });

  temp = temp.replace(/([A-Za-z0-9_]\s*=\s*)?(\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\})/g, '$$$1$2$$');

  decoded = temp.replace(/__MATH_BLOCK_(\d+)__/g, (_, i) => blocks[Number(i)]);

  return decoded;
}

const hasDelimiters = (s: string) =>
  /\$[^$]+\$(?!\d)|\\\([^)]*\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/.test(s);

const looksLikeLatex = (s: string) =>
  /(\\[a-zA-Z]+)|([A-Za-z0-9]\s*[\^_]\s*(\{[^}]+\}|[A-Za-z0-9]))|([=+\-*/])|\\frac|\\sqrt/.test(s);

const looksLikeHtml = (s: string) => /<[^>]+>/.test(s);

const LatexRenderer: React.FC<LatexRendererProps> = ({
  content,
  displayMode = false,
  className = '',
  isQuestion = false,
  assumeMath = false,
}) => {
  const processLaTeX = (raw: string): React.ReactNode[] => {
    const baseStyle = { fontSize: '1em' };
    if (!raw) return [];
    let text = decodeLatexFromDB(raw);

    if (looksLikeHtml(text)) {
      const MATH_RE = /(\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$(?!\d))/g;

      const htmlWithMath = text.replace(MATH_RE, (match) => {
        let expr = null;
        let display = false;

        if (match.startsWith('\\(') && match.endsWith('\\)')) {
          expr = match.slice(2, -2);
        } else if (match.startsWith('\\[') && match.endsWith('\\]')) {
          expr = match.slice(2, -2);
          display = true;
        } else if (match.startsWith('$$') && match.endsWith('$$')) {
          expr = match.slice(2, -2);
          display = true;
        } else if (match.startsWith('$') && match.endsWith('$')) {
          expr = match.slice(1, -1);
        }

        if (expr === null) return match;

        try {
          // Render directly to HTML string
          return katex.renderToString(expr.trim(), {
            throwOnError: false,
            displayMode: display,
          });
        } catch (e) {
          return match;
        }
      });

      return [
        <span
          key="html"
          className="inline-html"
          dangerouslySetInnerHTML={{ __html: htmlWithMath }}
          style={baseStyle as React.CSSProperties}
        />,
      ];
    }

    if (assumeMath && !hasDelimiters(text)) {
      if (!looksLikeLatex(text)) {
        return [text];
      }

      return [
        <LaTeXErrorBoundary key="inl" fallbackText={text.trim()}>
          <InlineMath math={text.trim()} />
        </LaTeXErrorBoundary>
      ];
    }

    const MATH_RE = /(\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$(?!\d))/g;
    const parts = text.split(MATH_RE).filter(Boolean);

    return parts.map((seg, i) => {
      let expr = null;
      let display = false;

      if (seg.startsWith('\\(') && seg.endsWith('\\)')) {
        expr = seg.slice(2, -2);
      } else if (seg.startsWith('\\[') && seg.endsWith('\\]')) {
        expr = seg.slice(2, -2);
        display = true;
      } else if (seg.startsWith('$$') && seg.endsWith('$$')) {
        expr = seg.slice(2, -2);
        display = true;
      } else if (seg.startsWith('$') && seg.endsWith('$')) {
        expr = seg.slice(1, -1);
      }

      if (expr === null) {
        return <span key={i} className="latex-part" style={baseStyle}>{seg}</span>;
      }

      return (
        <LaTeXErrorBoundary key={`math-${i}`} fallbackText={expr.trim()}>
          <span style={display ? { display: 'block', margin: '4px 0', ...baseStyle } : baseStyle}>
            {display ? <BlockMath math={expr.trim()} /> : <InlineMath math={expr.trim()} />}
          </span>
        </LaTeXErrorBoundary>
      );
    });
  };

  // // Extract content
  // const extractContent = (raw: any): React.ReactNode => {
  //   let parsed: any = raw;
  //   if (typeof raw === "string") {
  //     try {
  //       parsed = JSON.parse(raw);
  //     } catch {
  //       parsed = raw;
  //     }
  //   }

  //   if (Array.isArray(parsed)) {
  //     return parsed.map((q: any, index: number) => {
  //       const questionText = decodeLatexFromDB(q.questiontext || "");
  //       let options: string[] = [];
  //       if (Array.isArray(q.options)) {
  //         options = q.options.map((opt: any) => String(opt).trim()).filter(Boolean);
  //       }
  //       return (
  //         <div key={index} className="mb-4">
  //           {questionText && (
  //             <div className="mb-2">
  //               <LatexRenderer content={questionText} isQuestion />
  //             </div>
  //           )}
  //           {/* {options.length > 0 && (
  //             <div className="ml-6 space-y-4">
  //               {options.map((opt: string, i: number) => (
  //                 <div key={i} className="flex items-start py-2">
  //                   <div className="flex-1 text-lg leading-relaxed">
  //                     <LatexRenderer content={decodeLatexFromDB(opt)} assumeMath />
  //                   </div>
  //                 </div>
  //               ))}
  //             </div>
  //           )} */}
  //           {options.length > 0 && (
  //             <div className="ml-6 space-y-4">
  //               {options.map((opt: string, i: number) => (
  //                 <div key={i} className="flex items-start py-2">
  //                   <div
  //                     className="flex-1 text-lg leading-relaxed font-normal not-italic"
  //                     style={{ fontWeight: 400, fontStyle: "normal" }}
  //                   >
  //                     <LatexRenderer
  //                       content={decodeLatexFromDB(opt)}
  //                       assumeMath
  //                     />
  //                   </div>
  //                 </div>
  //               ))}
  //             </div>
  //           )}

  //         </div>
  //       );
  //     });
  //   }

  //   if (parsed && typeof parsed === "object" && parsed.questiontext) {
  //     const questionText = decodeLatexFromDB(parsed.questiontext || "");
  //     const options: string[] = Array.isArray(parsed.options)
  //       ? parsed.options.map((opt: any) => String(opt).trim()).filter(Boolean)
  //       : [];
  //     return (
  //       <div className="mb-4">
  //         {questionText && (
  //           <div className="mb-2">
  //             <LatexRenderer content={questionText} isQuestion />
  //           </div>
  //         )}
  //         {options.length > 0 && (
  //           <div className="ml-4 space-y-3">
  //             {options.map((opt: string, i: number) => (
  //               <div key={i} className="flex items-start py-1">
  //                 <div className="flex-1" style={{ fontSize: "15px" }}>
  //                   <LatexRenderer content={decodeLatexFromDB(opt)} assumeMath />
  //                 </div>
  //               </div>
  //             ))}
  //           </div>
  //         )}
  //       </div>
  //     );
  //   }

  //   if (typeof parsed === "string") {
  //     const processed = processLaTeX(parsed);
  //     return processed.map((part, index) => (
  //       <span key={index} style={{ fontSize: 'inherit' }}>
  //         {part}
  //       </span>
  //     ));
  //   }
  //   return null;
  // };

  // Extract content
  const extractContent = (raw: any): React.ReactNode => {
    let parsed: any = raw;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      const isNumericOnly = /^-?\d+(?:\.\d+)?$/.test(trimmed);
      if (isNumericOnly) {
        parsed = trimmed; // keep as string, do NOT JSON.parse
      } else {
        try {
          let temp = trimmed;
          if (temp.startsWith('"') && temp.endsWith('"')) {
            temp = temp.slice(1, -1);
          }
          const maybe = JSON.parse(temp);
          parsed = (typeof maybe === 'number') ? String(maybe) : maybe;
        } catch {
          parsed = raw;
        }
      }
    } else if (typeof raw === 'number') {
      parsed = String(raw);
    }


    if (Array.isArray(parsed)) {
      return parsed.map((q: any, index: number) => {
        const questionText = decodeLatexFromDB(q.questiontext || "");
        let options: string[] = [];
        if (Array.isArray(q.options)) {
          options = q.options.map((opt: any) => {
            // Convert any value to string, handling null/undefined
            if (opt === null || opt === undefined) return '';
            // Convert to string and trim
            return String(opt).trim();
          }).filter(opt => opt !== ''); // Only keep non-empty strings
        }

        return (
          <div key={index} className="mb-4">
            {/* --- Question Text (BOLD & NON-ITALIC) --- */}
            {questionText && (
              <div className="mb-2 font-bold ">
                <LatexRenderer content={questionText} isQuestion />
              </div>
            )}

            {/* --- Options (NORMAL WEIGHT & NON-ITALIC) --- */}
            {options.length > 0 && (
              <div className="ml-6 space-y-4">
                {options.map((opt: string, i: number) => (
                  <div key={i} className="flex items-start py-2">
                    <div
                      className="flex-1 text-lg leading-relaxed font-normal not-italic"
                      style={{ fontWeight: 400, fontStyle: "normal" }}
                    >
                      <LatexRenderer
                        content={decodeLatexFromDB(opt)}
                        assumeMath
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      });
    }

    if (parsed && typeof parsed === "object" && parsed.questiontext) {
      const questionText = decodeLatexFromDB(parsed.questiontext || "");
      const options: string[] = Array.isArray(parsed.options)
        ? parsed.options.map((opt: any) => String(opt).trim()).filter(Boolean)
        : [];

      return (
        <div className="mb-4">
          {/* --- Question Text (BOLD & NON-ITALIC) --- */}
          {questionText && (
            <div className="mb-2 font-bold not-italic">
              <LatexRenderer content={questionText} isQuestion />
            </div>
          )}



          {/* --- Options (NORMAL WEIGHT & NON-ITALIC) --- */}
          {options.length > 0 && (
            <div className="ml-4 space-y-3">
              {options.map((opt: string, i: number) => (
                <div key={i} className="flex items-start py-1">
                  <div
                    className="flex-1 font-normal not-italic"
                    style={{ fontSize: "15px", fontWeight: 'bold', fontStyle: "normal" }}
                  >
                    <LatexRenderer
                      content={decodeLatexFromDB(opt)}
                      assumeMath
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (typeof parsed === "string") {
      const processed = processLaTeX(parsed);
      return processed.map((part, index) => (
        <span
          key={index}
          className="font-normal not-italic"
          style={{ fontSize: "inherit", fontWeight: 400, fontStyle: "normal" }}
        >
          {part}
        </span>
      ));
    }

    return null;
  };

  const renderedContent = useMemo(() => {
    if (!content) return null;

    // Handle case where content is a string that might be a number
    const processedContent = (() => {
      if (typeof content === 'string') {
        // If it's a string that looks like a number, ensure it's treated as a string
        if (/^\d+$/.test(content.trim())) {
          return content.trim();
        }
        try {
          // Try to parse as JSON first
          const parsed = JSON.parse(content);
          // If the parsed result is a number, convert it back to string
          if (typeof parsed === 'number') {
            return String(parsed);
          }
          return parsed;
        } catch {
          return content;
        }
      }
      // If content is a number, convert to string
      if (typeof content === 'number') {
        return String(content);
      }
      return content;
    })();

    return extractContent(processedContent);
  }, [content, isQuestion, assumeMath]);

  if (!content) return null;
  return (
    <div
      className={`latex-renderer ${className}`}
      style={{
        fontSize: "17px",
        lineHeight: "1.6",
        fontFamily: "'KaTeX_Main', 'Times New Roman', serif",
        // Allow long unbroken tokens to wrap and preserve newlines
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word'
      }}
    >
      <style dangerouslySetInnerHTML={{
        __html: `
    /* Base KaTeX styles */
    .katex {
      font-size: 1em !important;
      line-height: 1.4 !important;
      text-rendering: auto;
    }
      /* Ensure KaTeX math is upright and non-bold for option labels */
.katex .mathit,
.katex .mathnormal,
.katex .mord {
  font-style: normal !important;
  font-weight: 400 !important;
}


    /* --- Fix: Make fractions and subscripts scale properly --- */
    .katex .mfrac {
      font-size: 1.2em !important;       /* Slightly enlarge fraction block */
      transform: scale(1.08);            /* Compensate for KaTeX’s downscale */
      transform-origin: center;
    }
    .katex .frac-line {
      border-bottom-width: 0.05em;
    }

    /* Subscript & superscript scaling fix */
    .katex .msup, .katex .msub {
      font-size: 1em !important;
    }

    /* Inline fractions (within text) */
    .katex .mfrac .frac-line {
      min-height: 0.08em;
    }

    /* Prevent nested fraction from shrinking too much */
    .katex .mfrac .mfrac {
      font-size: 0.95em !important;
    }

    /* Display math environments */
    .katex-display {
      margin: 0.75em 0;
      padding: 0.25em 0.5em;
    }

    /* Font smoothing for consistency */
    .katex * {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Ensure long words inside rendered content can break to avoid overflow */
    .latex-renderer {
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .latex-renderer .latex-part {
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: pre-wrap;
      display: inline;
      max-width: 100%;
    }
  `
      }} />
      {renderedContent}
    </div>
  );
};

export default LatexRenderer;