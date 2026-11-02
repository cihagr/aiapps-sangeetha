import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

import { cn } from "@/lib/utils";

type LatexSegment =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "math";
      content: string;
      raw: string;
      displayMode: boolean;
    };

interface TruncatedLatexTextProps {
  content: string | number | null | undefined;
  className?: string;
}

const decodeTextSegment = (value: string) => value.replace(/\\\$/g, "$");

const isEscaped = (value: string, index: number) => {
  let slashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
};

const findClosingDelimiter = (value: string, startIndex: number, delimiter: "$" | "$$") => {
  for (let cursor = startIndex; cursor < value.length; cursor += 1) {
    if (value[cursor] !== "$" || isEscaped(value, cursor)) {
      continue;
    }

    if (delimiter === "$$") {
      if (value[cursor + 1] === "$" && !isEscaped(value, cursor + 1)) {
        return cursor;
      }

      continue;
    }

    if (value[cursor + 1] !== "$") {
      return cursor;
    }
  }

  return -1;
};

export const splitLatexSegments = (value: string): LatexSegment[] => {
  if (!value) {
    return [{ type: "text", content: "" }];
  }

  const segments: LatexSegment[] = [];
  let textStart = 0;
  let cursor = 0;

  while (cursor < value.length) {
    if (value[cursor] !== "$" || isEscaped(value, cursor)) {
      cursor += 1;
      continue;
    }

    const isDisplayMode = value[cursor + 1] === "$" && !isEscaped(value, cursor + 1);
    const delimiter = isDisplayMode ? "$$" : "$";
    const closingIndex = findClosingDelimiter(value, cursor + delimiter.length, delimiter);

    if (closingIndex === -1) {
      cursor += delimiter.length;
      continue;
    }

    if (textStart < cursor) {
      segments.push({
        type: "text",
        content: decodeTextSegment(value.slice(textStart, cursor)),
      });
    }

    segments.push({
      type: "math",
      content: value.slice(cursor + delimiter.length, closingIndex),
      raw: value.slice(cursor, closingIndex + delimiter.length),
      displayMode: isDisplayMode,
    });

    cursor = closingIndex + delimiter.length;
    textStart = cursor;
  }

  if (textStart < value.length) {
    segments.push({
      type: "text",
      content: decodeTextSegment(value.slice(textStart)),
    });
  }

  return segments.length > 0 ? segments : [{ type: "text", content: decodeTextSegment(value) }];
};

const renderMathSegment = (segment: Extract<LatexSegment, { type: "math" }>, index: number) => {
  try {
    const html = katex.renderToString(segment.content, {
      displayMode: segment.displayMode,
      throwOnError: true,
      output: "html",
      strict: "ignore",
    });

    return (
      <span
        key={`math-${index}`}
        className={cn("latex-math-segment", segment.displayMode && "latex-display-segment")}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <span
        key={`math-${index}`}
        className="latex-error-fallback"
        title="Invalid LaTeX syntax"
      >
        {segment.raw}
      </span>
    );
  }
};

const TruncatedLatexText = ({ content, className }: TruncatedLatexTextProps) => {
  const normalizedContent = content == null ? "" : String(content);
  const segments = useMemo(() => splitLatexSegments(normalizedContent), [normalizedContent]);

  return (
    <p
      className={cn("latex-truncate-content truncate", className)}
      data-testid="truncated-latex-text"
      title={normalizedContent}
    >
      {segments.map((segment, index) =>
        segment.type === "text" ? (
          <span key={`text-${index}`}>{segment.content}</span>
        ) : (
          renderMathSegment(segment, index)
        ),
      )}
    </p>
  );
};

export default TruncatedLatexText;
