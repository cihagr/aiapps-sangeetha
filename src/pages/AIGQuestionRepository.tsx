import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, ImageRun, AlignmentType, VerticalAlign } from "docx";
import { Link, useNavigate } from "react-router-dom";
import { formatForExport, formatOptionsForExport, formatStemForExport, formatFeedbackForExport, formatMatrixForExport, formatForWordExport } from "@/utils/exportFormatter";
import { toExportText, toExportOptionText } from "@/utils/exportText";
import { containsStemText, dedupeRepeatedText, dedupeStem } from "@/utils/stemText";
import { isDropdownBlankQuestion } from "@/utils/questionType";
import { fitWithin, loadExportImage, toEmbeddableImages } from "@/utils/exportImages";
import { embedRowImages, rowImageSources } from "@/utils/excelImages";
import { buildImageFolderPath, resolveImageBookName, resolveImageScope } from "@/utils/imageRepoPath";
import { listScopedImages, appendImageScopeFields } from "@/utils/imageRepoApi";
import { fileToStorableDataUrl } from "@/utils/imageData";
import {
  buildSpeechText,
  cancelSpeech,
  installSpeechAutoStop,
  speakText,
  languageFromQuestionId,
} from "@/utils/speech";
import { AppSidebar } from "@/components/AppSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import RepoImage from "@/components/RepoImage";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Filter,
  FileImage,
  Database,
  Brain,
  TrendingUp,
  Users,
  Eye,
  Edit,
  Trash2,
  Download,
  FileText,
  Edit3,
  Check,
  X,
  Hash,
  FileQuestion,
  MessageSquare,
  List,
  AlignLeft,
  CheckCircle2,
  Target,
  AlertCircle,
  Sparkles,
  RefreshCw,
  XCircle,
  Info,
  Plus,
  Trash,
  ListChecks,
  Star,
  GitCompare,
  RotateCcw,
  MoreVertical,
  ThumbsUp,
  ThumbsDown,
  Globe,
  Keyboard,
  Upload,
  ImagePlus,
  Loader2,
  Volume2,
  VolumeX,
  ShieldCheck,
  ShieldOff,
  Presentation,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Files,
  Table2
} from "lucide-react";
import { SignJWT } from "jose";
import axios from "axios";
import { getFromDB, AGENT_GENERATIVE_API_URL, AIG_QUIZ_GEN_URL, ITEM_VALIDATION_APP_URL, ITEM_VALIDATION_API_URL, ITEM_VALIDATION_RUN_API_URL, LANG_CONVERTOR_API_URL } from "@/utils/Aigapi";
import { API_ENDPOINTS } from "@/config";
import { getTableAnalysis, getSortedRows, getSortOptions, TableAnalysisData } from "@/utils/tableAnalysis";
import { chapterKeyOf, chapterNameOf, loKeyOf, loNameOf } from "@/utils/chapterLo";
import { deleteQuestion, fetchDropdownOptions, getLearningObjectives, getChapters } from "@/utils/Aigapi";
import { updateQuestion } from "@/utils/Aigapi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createAccordionScope } from "@radix-ui/react-accordion";
import BackToTop from "@/components/BackToTop";
import { FlashcardModal } from '@/components/FlashcardModal';
import LatexRenderer from './LatexRenderer';
import VirtualMathKeyboard from './VirtualMathKeyboard.jsx';
import { saveCaretPosition, restoreCaretPosition } from '../utils/caretUtils.js';
import katex from "katex";
import { regenerateQuestionImageWithOptions, getOptionImages, findOptionImageUrl, readOptionImagesField, type OptionImage } from '@/utils/questionImageGeneration';

// Word tables are exported full width with visible single-line borders. Without
// explicit borders and a fixed layout, docx renders a borderless auto-layout table
// whose columns do not line up with the header.
const DOCX_TABLE_BORDERS = {
  top: { style: 'single', size: 1, color: 'BFBFBF' },
  bottom: { style: 'single', size: 1, color: 'BFBFBF' },
  left: { style: 'single', size: 1, color: 'BFBFBF' },
  right: { style: 'single', size: 1, color: 'BFBFBF' },
  insideHorizontal: { style: 'single', size: 1, color: 'BFBFBF' },
  insideVertical: { style: 'single', size: 1, color: 'BFBFBF' },
} as any;

const showBulkValidate = 1;
const showExportMetadata = 1;
const showBulkMetadata = 1;

/**
 * Formats question text for Word export with enhanced fraction support
 * @param text The question text
 * @returns Formatted text with proper fraction display
 */
const formatQuestionTextForWord = (text: string): string => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let formatted = text;

  // Convert fractions to stacked format using Unicode characters
  formatted = formatted.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, (match, numerator, denominator) => {
    // Create a stacked fraction using Unicode superscripts/subscripts
    const cleanNumerator = numerator.trim();
    const cleanDenominator = denominator.trim();

    // For simple cases, use the fraction slash
    if (cleanNumerator.length <= 3 && cleanDenominator.length <= 3) {
      return `${cleanNumerator}⁄${cleanDenominator}`;
    }

    // For complex expressions, use a more readable format
    return `(${cleanNumerator})/(${cleanDenominator})`;
  });

  // Convert \frac{}{} LaTeX command to readable format
  formatted = formatted.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (match, numerator, denominator) => {
    const cleanNumerator = numerator.trim();
    const cleanDenominator = denominator.trim();

    // For simple cases, use the fraction slash
    if (cleanNumerator.length <= 3 && cleanDenominator.length <= 3) {
      return `${cleanNumerator}⁄${cleanDenominator}`;
    }

    // For complex expressions, use a more readable format
    return `(${cleanNumerator})/(${cleanDenominator})`;
  });

  // Convert integrals with proper formatting
  formatted = formatted.replace(/∫\s*\^?\{?([^}]*)\}?\_?\{?([^}]*)\}?\s*([^d]*?)\s*d([a-zA-Z]+)/g,
    (match, upper, lower, expr, variable) => {
      const lowerBound = lower || '0';
      const upperBound = upper || '∞';
      const expression = expr?.trim() || 'dx';
      const varName = variable || 'x';

      // Use Unicode integral symbol with subscript/superscript
      const lowerSub = lowerBound === '0' ? '₀' : lowerBound;
      const upperSuper = upperBound === '∞' ? '∞' : `^${upperBound}`;

      return `∫${upperSuper}${lowerSub} ${expression} d${varName}`;
    });

  // Convert exponents to Unicode superscripts
  const superscripts: { [key: string]: string } = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
  };

  formatted = formatted.replace(/\^\(([^)]+)\)/g, (match, exponent) => {
    const cleanExp = exponent.trim();
    // Convert digits to superscripts if possible
    let result = '';
    for (const char of cleanExp) {
      result += superscripts[char] || char;
    }
    return result;
  });

  // Convert subscripts to Unicode subscripts
  const subscripts: { [key: string]: string } = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
  };

  formatted = formatted.replace(/_\(([^)]+)\)/g, (match, subscript) => {
    const cleanSub = subscript.trim();
    let result = '';
    for (const char of cleanSub) {
      result += subscripts[char] || char;
    }
    return result;
  });

  // Convert square roots
  formatted = formatted.replace(/√\(([^)]+)\)/g, '√($1)');

  // Clean up any remaining HTML artifacts
  formatted = formatted.replace(/<[^>]*>/g, '');
  formatted = formatted.replace(/contenteditable="[^"]*"/g, '');
  formatted = formatted.replace(/class="[^"]*"/g, '');

  return formatted.trim();
};

const resolveQuestionImageUrl = (question: any): string => {
  const q = question?.[2] || question || {};
  const img = String(
    q.generatedImageUrl ||
    (q.generated_image ? `data:image/jpeg;base64,${q.generated_image}` : null) ||
    q.imageUrl ||
    question?.generatedImageUrl ||
    (question?.generated_image ? `data:image/jpeg;base64,${question.generated_image}` : null) ||
    question?.imageUrl ||
    ''
  ).trim();
  if (img.includes('NOT REQUIRED') || img.includes('NO_IMAGE_REQUIRED')) {
    return '';
  }
  return img;
};

const formatImageForExport = (imageUrl: string): string => {
  const v = String(imageUrl || '').trim();
  if (!v) return 'N/A';
  if (v.startsWith('data:image/')) return 'Embedded image (base64)';
  return v;
};

const parseEmbeddedImageDataUrl = (imageUrl: string): { extension: 'png' | 'jpg'; base64: string } | null => {
  const v = String(imageUrl || '').trim();
  const match = v.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  const extension = match[1].toLowerCase() === 'png' ? 'png' : 'jpg';
  return { extension, base64: match[2] };
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// ---- Shared helpers: "Question Specific" image folder chapter/LO dropdowns ----
// Field accessors tolerant of get-chapter-lo-details response shapes.
// Taxonomy filter values are held in state as names ("Apply") but the get_from_db
// API expects the numeric id. Shared by handleGo and fetchData's fallback so the two
// can never disagree about what the current taxonomy filter means.
const TAXONOMY_FILTER_IDS: Record<string, string> = {
  Remember: '1', Understand: '2', Apply: '3', Analyze: '4', Evaluate: '5', Create: '6',
};

// The Question Type dropdown holds type NAMES; get_from_db wants the numeric id.
// These ids match the ones the generator sends (see AIGQuestionGenerator's
// questionTypeId switch). Order matters below: "Multiple Response" and "Written
// Response" both contain "response", and "Select the Blank" contains "blank" just
// like "Fill In the Blank" — matching on a single word picked the wrong type.
const resolveQuestionTypeId = (value: any): number => {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '0') return 0;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;

  const t = raw.toLowerCase();
  if (t.includes('dropdown') || (t.includes('select') && t.includes('blank'))) return 9;
  if (t.includes('multi') && t.includes('tab')) return 10;
  if (t.includes('matrix')) return 8;
  if (t.includes('multiple') && t.includes('response')) return 2;
  if (t.includes('multiple') || t.includes('mcq') || t.includes('choice')) return 1;
  if (t.includes('true') || t.includes('false')) return 3;
  if (t.includes('fill') && t.includes('blank')) return 4;
  if (t.includes('written') || t.includes('essay') || t.includes('short')) return 7;
  return 0;
};

// Moved to utils/chapterLo so the Results screen's image picker reads these records
// exactly the same way (see the note in that file).
const uniqueByKey = (list: any[], keyFn: (x: any) => any) =>
  Array.from(new Set(list.map(keyFn))).map(k => list.find(x => keyFn(x) === k)).filter(Boolean);

// The image picker's chapter dropdown is keyed by chapter code. A question knows
// its chapter through `chaptercode` (or the session), so the picker can open
// already scoped to that chapter instead of listing every chapter's images.
const resolveModalChapterKey = (q: any): string => {
  const fromQuestion = String(
    q?.chaptercode ?? q?.chapterCode ?? q?.chapter_code ?? q?.chapternameid ?? ''
  ).trim();
  if (fromQuestion) return fromQuestion;
  try {
    const fromSession = String(sessionStorage.getItem('chaptercode') || '').trim();
    if (fromSession) return fromSession;
  } catch { /* ignore */ }
  return 'all';
};

// Resolve the current repository book's bookdetails_id (par_bookid).
const resolveParBookId = async (token: string): Promise<number | null> => {
  const direct = sessionStorage.getItem('par_bookid') || sessionStorage.getItem('bookdetails_id') || sessionStorage.getItem('bookDetailsId');
  if (direct && !isNaN(Number(direct))) return Number(direct);
  try {
    const custcode = sessionStorage.getItem('customerCode') || sessionStorage.getItem('custcode') || 'ES';
    const orgcode = sessionStorage.getItem('orgCode') || sessionStorage.getItem('orgcode') || 'Exc195';
    const resp = await fetch(API_ENDPOINTS.GET_BOOKS_DETAILS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ par_customercode: custcode, par_organizationcode: orgcode, par_appcode: '', auth_token: token }),
    });
    const data = await resp.json();
    const books = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
    const title = (sessionStorage.getItem('bookTitle') || '').trim().toLowerCase();
    const bookId = (sessionStorage.getItem('bookid') || '').trim();
    const match = books.find((b: any) =>
      (title && String(b.bookname || b.bookTitle || b.name || '').trim().toLowerCase() === title) ||
      (bookId && String(b.bookcode || '').replace(/\D/g, '') === bookId) ||
      (bookId && String(b.bookdetails_id ?? '') === bookId)
    );
    if (match) return Number(match.bookdetails_id ?? match.id ?? match.bookcode);
  } catch (e) {
    console.error('resolveParBookId failed', e);
  }
  return null;
};

// Load this book's chapter + LO rows via get-chapter-lo-details (scoped to the current book only).
const loadBookChapterLOs = async (): Promise<any[]> => {
  const { getKbAuthToken } = await import('@/lib/kb-auth');
  const token = await getKbAuthToken();
  const bookId = await resolveParBookId(token);
  if (!bookId) return [];
  const resp = await fetch(API_ENDPOINTS.GET_CHAPTER_LO_DETAILS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ par_bookid: bookId, auth_token: token }),
  });
  const data = await resp.json();
  return Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
};

const formatQuestionTextForDisplay = (rawText: any): string => {
  const base = String(rawText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!base) return '';

  return base
    .replace(/\s+\(([a-eA-E])\)\s*/g, (_match, label) => `\n(${String(label).toLowerCase()}) `)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Detects Select the Blank / Fill In the Blank Dropdown questions, which render an
// inline <select> over a [Dropdown1] token instead of a free-text gap.
const isFillBlankDropdownQuestion = (question: any) => isDropdownBlankQuestion(question);

// The gap placeholder in a Select the Blank stem is spelled differently depending on
// the generator/import: [Dropdown1], [Dropdown 1], [Blank1], [gap], {{blank}},
// <dropdown1> or a plain run of underscores. Wherever the stem is displayed the raw
// token must never reach the reader, so match every spelling in one place.
const GAP_TOKEN_RE = /\[\s*(?:dropdown|blank|gap)\s*\d*\s*\]|\{\{\s*[^{}]*\s*\}\}|<\s*(?:dropdown|blank|gap)\s*\d*\s*>|_{3,}/gi;
const GAP_BLANK = '________';

// Replaces every gap token with a visible blank so lists, cards and the question
// stem read as a sentence instead of showing bracketed placeholder text.
const replaceGapToken = (text: any, replacement: string = GAP_BLANK): string =>
  String(text ?? '').replace(GAP_TOKEN_RE, replacement);

const getDropdownOptionsFromQuestion = (question: any): string[] => {
  if (!question || typeof question !== 'object') return [];

  // An option can arrive as a plain string or wrapped in an object under any of
  // several keys. Falling back to String(option) turned an unrecognised object into
  // the literal "[object Object]", which was then shown as a dropdown choice and
  // carried into the exports; an object we cannot read is dropped instead.
  const optionToText = (option: any): string => {
    if (typeof option === 'string') return option;
    if (typeof option === 'number') return String(option);
    if (option && typeof option === 'object') {
      const text = option.text ?? option.value ?? option.label ?? option.choicetext
        ?? option.optiontext ?? option.Option ?? option.option ?? option.name;
      return typeof text === 'string' || typeof text === 'number' ? String(text) : '';
    }
    return option === null || option === undefined ? '' : String(option);
  };

  const extractOptions = (source: any): string[] => {
    if (source === undefined || source === null) return [];
    if (Array.isArray(source)) {
      return source.map(optionToText)
        .map((option: string) => option.trim())
        .filter((option: string) => option.length > 0);
    }
    return [];
  };

  let opts = extractOptions(question?.DropdownOptions || question?.dropdownoptions);
  if (opts.length > 0) return opts;

  try {
    if (typeof question?.values === 'string') {
      const parsed = JSON.parse(question.values);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === 'string') return extractOptions(parsed);
      }
    }
  } catch { }

  opts = extractOptions(question?.values || question?.options);
  if (opts.length > 1) return opts;

  return [];
};

// generatedimagetype: 0 = AI generated (/generate-image), 1 = manually uploaded/selected
// from the image repository. Always sent as 1 for manually uploaded and 0 for AI generated.
const toGeneratedImageType = (value: any): number => {
  if (value === 1 || value === '1' || Number(value) === 1) return 1;
  return 0;
};

const resolveImageType = (...candidates: any[]): number => {
  for (const c of candidates) {
    if (c === 1 || c === '1' || Number(c) === 1) return 1;
  }
  return 0;
};

const safeJsonParse = (value: any, fallback: any = null) => {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
};

const extractValueFromReasonString = (key: string, text: string): string => {
  const str = String(text || '').trim();
  if (!str) return '';

  if (str.length <= 25 && !str.includes('.') && !str.includes('\n') && !str.includes(' ')) {
    return str;
  }

  const k = key.toLowerCase();

  // 1. Cognitive Level Alignment
  if (k.includes('cognitive') || k.includes('bloom') || k.includes('level')) {
    const actualLevelMatch = str.match(/Actual Level:\s*([A-Za-z]+)/i);
    if (actualLevelMatch && actualLevelMatch[1]) return actualLevelMatch[1].trim();
    const cogMatch = str.match(/\b(Analyze|Analysis|Applying|Apply|Understanding|Understand|Remembering|Remember|Evaluating|Evaluate|Creating|Create)\b/i);
    if (cogMatch && cogMatch[1]) {
      const found = cogMatch[1].toLowerCase();
      if (found.includes('analy')) return 'Analyze';
      if (found.includes('appl')) return 'Apply';
      if (found.includes('underst')) return 'Understand';
      if (found.includes('rememb')) return 'Remember';
      if (found.includes('evalu')) return 'Evaluate';
      if (found.includes('creat')) return 'Create';
      return cogMatch[1];
    }
    return 'Analyze';
  }

  // 2. Construct Validity
  if (k.includes('validity') || k.includes('construct')) {
    if (/\b(invalid|impossible|flawed|error|cannot be solved|lacks)\b/i.test(str)) return 'Invalid';
    if (/\b(valid|sound|correct|solvable)\b/i.test(str)) return 'Valid';
    return 'Invalid';
  }

  // 3. Curriculum OR Syllabus Mapping
  if (k.includes('curriculum') || k.includes('syllabus') || k.includes('mapping')) {
    if (/\b(cannot determine|does not contain|not contained|unmapped|not mapped|no learning outcomes)\b/i.test(str)) return 'Cannot determine';
    if (/\b(mapped|aligned|covered)\b/i.test(str)) return 'Mapped';
    return 'Cannot determine';
  }

  // 4. Discrimination Index
  if (k.includes('discrimination')) {
    if (/\b(lacks|poor|low|negative|bad|forced to guess)\b/i.test(str)) return 'Low';
    if (/\b(high|strong|excellent)\b/i.test(str)) return 'High';
    if (/\b(moderate|medium|average)\b/i.test(str)) return 'Moderate';
    return 'Low';
  }

  // 5. Distractor quality
  if (k.includes('distractor')) {
    if (/\b(weak|cannot be evaluated|plausibility|flawed|poor|bad)\b/i.test(str)) return 'Weak';
    if (/\b(strong|good|plausible|effective)\b/i.test(str)) return 'Strong';
    if (/\b(moderate|acceptable)\b/i.test(str)) return 'Moderate';
    return 'Weak';
  }

  // 6. Duplication
  if (k.includes('duplication') || k.includes('duplicate')) {
    if (/\b(no other items|unique|none|not present)\b/i.test(str)) return 'Unique';
    if (/\b(duplicate|duplicated|identical|exists)\b/i.test(str)) return 'Duplicate';
    return 'Unique';
  }

  // 7. GuideLine
  if (k.includes('guideline') || k.includes('guide line')) {
    if (/\b(violates|non-compliant|non compliant|missing|not follow)\b/i.test(str)) return 'Non-Compliant';
    if (/\b(compliant|follows|adheres|valid)\b/i.test(str)) return 'Compliant';
    return 'Non-Compliant';
  }

  // 8. House Style Compliance
  if (k.includes('house style') || k.includes('style compliance')) {
    if (/\b(fully compliant|follows standard|fully adheres|standard formatting)\b/i.test(str)) return 'Fully Compliant';
    if (/\b(non-compliant|violates|does not follow)\b/i.test(str)) return 'Non-Compliant';
    if (/\b(compliant|follows)\b/i.test(str)) return 'Compliant';
    return 'Fully Compliant';
  }

  // 9. Item Difficulty Estimate
  if (k.includes('difficulty')) {
    if (/\b(hard|impossible|difficult|high)\b/i.test(str)) return 'Hard';
    if (/\b(easy|simple|low)\b/i.test(str)) return 'Easy';
    if (/\b(medium|moderate)\b/i.test(str)) return 'Medium';
    return 'Hard';
  }

  // 10. Item Type and Format Appropriateness
  if (k.includes('format') || k.includes('appropriateness') || k.includes('item type')) {
    if (/\b(acceptable|appropriate|suitable|valid)\b/i.test(str)) return 'Acceptable';
    if (/\b(inappropriate|unacceptable|poor)\b/i.test(str)) return 'Inappropriate';
    return 'Acceptable';
  }

  // 11. Learning Objectives
  if (k.includes('learning objective')) {
    if (/\b(cannot determine|does not identify|not identified|no specific|unmapped)\b/i.test(str)) return 'Cannot determine';
    if (/\b(aligned|mapped|covered)\b/i.test(str)) return 'Aligned';
    return 'Cannot determine';
  }

  // 12. Scaffolding and Cognitive Load
  if (k.includes('scaffolding') || k.includes('cognitive load')) {
    if (/\b(under-scaffolded|under scaffolded|missing|essential data source|failure)\b/i.test(str)) return 'Under-Scaffolded';
    if (/\b(over-scaffolded|over scaffolded)\b/i.test(str)) return 'Over-Scaffolded';
    if (/\b(appropriate|well-scaffolded|good)\b/i.test(str)) return 'Appropriate';
    return 'Under-Scaffolded';
  }

  // 13. Study
  if (k.includes('study')) {
    if (/\b(unsupported|contains no information|no information|missing|not covered)\b/i.test(str)) return 'Unsupported';
    if (/\b(supported|covered|present)\b/i.test(str)) return 'Supported';
    return 'Unsupported';
  }

  // 14. Technical Accuracy
  if (k.includes('technical accuracy') || k.includes('accuracy')) {
    if (/\baccurate|accurately|correct|no errors\b/i.test(str) && !/\binaccurate|technically inaccurate|error\b/i.test(str)) return 'Accurate';
    if (/\bsignificant errors|inaccurate|technically inaccurate|error|does not exist\b/i.test(str)) return 'Significant Errors';
  }

  const valMatch = str.match(/Value:\s*([A-Za-z0-9_\-\s]+?)(?:,|\.|$)/i);
  if (valMatch && valMatch[1]) return valMatch[1].trim();

  const firstWords = str.split(/\s+/).slice(0, 3).join(' ');
  return firstWords || str;
};

/**
 * Metadata rows for the Metadata Details popup: each metadata name with the `value`
 * the API returned (generate-item-metadata sends
 * `[{ metadataname, value, reason, confidence }]`).
 *
 * parseQuestionMetadata guesses a value from the reason sentence when none is sent —
 * the first three words ("The item uses") or a hard-coded default ("Analyze" for any
 * key containing "level"). The popup must show only the real value, so it reads the
 * metadata through this instead.
 */
const getMetadataDisplayRows = (metadata: any): { key: string; value: string }[] => {
  let data = metadata;
  for (let i = 0; i < 2 && typeof data === 'string'; i++) {
    try { data = JSON.parse(data); } catch { return []; }
  }
  if (!data || typeof data !== 'object') return [];

  const text = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
  const rows: { key: string; value: string }[] = [];

  if (Array.isArray(data)) {
    data.forEach((item: any) => {
      if (!item || typeof item !== 'object') return;
      const key = text(item.metadataname || item.metadataName || item.name || item.key);
      if (key) rows.push({ key, value: text(item.value) });
    });
    return rows;
  }

  Object.entries(data).forEach(([rawKey, val]: [string, any]) => {
    const key = text(rawKey);
    if (!key || val === undefined || val === null) return;
    if (typeof val === 'object' && !Array.isArray(val)) {
      rows.push({ key, value: text(val.value) });
    } else {
      // Stored as { name: text } — that text is what was saved for the key.
      rows.push({ key, value: text(val) });
    }
  });
  return rows;
};

const parseQuestionMetadata = (metadata: any): { key: string; value: string; reason?: string }[] => {
  if (!metadata) return [];

  let data = metadata;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { }
      }
    } catch {
      return [];
    }
  }

  if (!data) return [];

  const results: { key: string; value: string; reason?: string }[] = [];

  // Array of objects from API: [{"metadataname": "Cognitive Level Alignment", "value": "Understand", "reason": "..."}]
  if (Array.isArray(data)) {
    data.forEach((item: any) => {
      if (item && typeof item === 'object') {
        const key = item.metadataname || item.metadataName || item.name || item.key;
        if (key) {
          let val = (item.value !== undefined && item.value !== null && String(item.value).trim() !== '')
            ? String(item.value)
            : extractValueFromReasonString(key, String(item.reason || ''));
          results.push({
            key,
            value: val,
            reason: item.reason ? String(item.reason) : undefined
          });
        }
      }
    });
    return results;
  }

  // Object: { "Cognitive Level Alignment": "Actual Level: Analyze..." } or { "Cognitive Level Alignment": { value: "Analyze", reason: "..." } }
  if (typeof data === 'object') {
    Object.entries(data).forEach(([key, val]: [string, any]) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const valueStr = (val.value !== undefined && val.value !== null && String(val.value).trim() !== '')
          ? String(val.value)
          : extractValueFromReasonString(key, String(val.reason || val));
        results.push({
          key,
          value: valueStr,
          reason: val.reason ? String(val.reason) : undefined
        });
      } else if (typeof val === 'string') {
        const extractedVal = extractValueFromReasonString(key, val);
        results.push({
          key,
          value: extractedVal,
          reason: val
        });
      } else if (val !== null && val !== undefined) {
        results.push({
          key,
          value: String(val),
          reason: String(val)
        });
      }
    });
  }

  return results;
};

// Key points exactly as stored on the question.
//
// The preview screen's getKeyPointsFromQuestion falls back to a hardcoded sample list
// when a question has none, which must never be shown as if it belonged to the
// question. This reads the stored value only, so "no key points" stays empty.
const getStoredKeyPoints = (...sources: any[]): string[] => {
  for (const source of sources) {
    const raw = source?.KeyPoints ?? source?.keyPoints;
    const parsed = typeof raw === 'string' ? safeJsonParse(raw, null) : raw;
    const points = (Array.isArray(parsed) ? parsed : [])
      .map((item: any) => typeof item === 'string' ? item : String(item?.point ?? item?.text ?? ''))
      .filter((item: string) => item.trim().length > 0);
    if (points.length > 0) return points;
  }
  return [];
};

// Passage tabs may arrive as `Tabs` or `tabs`, as an array or as a JSON string, and
// may sit on the question itself or on its nested question-data payload under any of
// several keys — it depends on which load path produced the question.
//
// The array-only check missed the string form, which getPassageTabCount (the Passage
// Type filter) has always accepted: a question could be classed as multi-passage
// while every reader of this function saw no tabs at all.
const getQuestionTabs = (q: any): any[] => {
  const toTabs = (value: any): any[] => {
    const parsed = typeof value === 'string' ? safeJsonParse(value, null) : value;
    return Array.isArray(parsed) ? parsed : [];
  };

  const nestedRaw = q?.[2] ?? q?.questiondata ?? q?.questionData ?? q?.QuestionData;
  const nested = typeof nestedRaw === 'string' ? safeJsonParse(nestedRaw, null) : nestedRaw;

  const sources = [
    q?.Tabs, q?.tabs,
    nested?.Tabs, nested?.tabs,
    q?.QuestionData?.Tabs, q?.QuestionData?.tabs,
    q?.questiondata?.Tabs, q?.questiondata?.tabs,
    q?.questionData?.Tabs, q?.questionData?.tabs,
  ];

  for (const source of sources) {
    const tabs = toTabs(source);
    if (tabs.length > 0) return tabs;
  }
  return [];
};

const getTabTitle = (tab: any, tIdx: number): string =>
  tab?.TabTitle || tab?.TabName || tab?.tabName || tab?.Title || tab?.tabTitle || tab?.title ||
  tab?.Name || tab?.name || tab?.tab_title || `Passage ${tIdx + 1}`;

// The generator returns the passage body under `TabContent` for every tab and only
// sometimes also under `Passage` (and then often truncated), so `TabContent` is
// preferred when it holds more text. Without this the 2nd passage rendered blank.
const getTabPassage = (tab: any): string => {
  const passage = String(tab?.Passage ?? tab?.passage ?? tab?.Content ?? tab?.content ?? '').trim();
  const tabContent = String(tab?.TabContent ?? tab?.tabContent ?? tab?.tab_content ?? '').trim();
  if (!passage) return tabContent;
  if (!tabContent) return passage;
  return tabContent.length > passage.length ? tabContent : passage;
};

// With passage tabs the stored label holds the whole multi-tab blob (tab titles and
// every passage), so the displayable stem is the PartPrompt instead.
const getCleanStem = (q: any): string => {
  const partPrompt = String(q?.PartPrompt ?? q?.partPrompt ?? '').trim();
  if ((getQuestionTabs(q).length > 0 || Boolean(getTableAnalysis(q))) && partPrompt) return partPrompt;
  const label = String(q?.label ?? '').trim();
  if (label) return label;
  const questionStatement = String(q?.QuestionStatement ?? q?.Question ?? q?.question ?? q?.text ?? q?.QuestionText ?? '').trim();
  if (questionStatement && partPrompt && !questionStatement.includes(partPrompt)) {
    return `${questionStatement} ${partPrompt}`;
  }
  return questionStatement || partPrompt;
};

const checkIsOptionCorrect = (q: any, optionLetter: string, optionIndex: number, optionRaw: any): boolean => {
  if (!q) return false;

  const optUpper = String(optionLetter || '').trim().toUpperCase();

  // 1) ItemScoring.Marking e.g. "A, C" or "A,C."
  if (q.ItemScoring?.Marking) {
    const marking = String(q.ItemScoring.Marking).toUpperCase().split(',').map(s => s.trim().replace(/[\.\)]$/, ''));
    if (marking.includes(optUpper)) return true;
  }

  // 2) marks object e.g. { A: 1, C: 1 }
  if (q.marks) {
    if (typeof q.marks === 'object' && !Array.isArray(q.marks)) {
      const markVal = q.marks[optUpper] ?? q.marks[optUpper.toLowerCase()];
      if (markVal !== undefined && Number(markVal) > 0) return true;
    } else if (typeof q.marks === 'string') {
      try {
        const parsedMarks = JSON.parse(q.marks);
        const markVal = parsedMarks[optUpper] ?? parsedMarks[optUpper.toLowerCase()];
        if (markVal !== undefined && Number(markVal) > 0) return true;
      } catch (e) { }
    }
  }

  // 3) Extract raw correct answer from CorrectAnswer, correctanswer, answer, or correct
  const rawCA = q.CorrectAnswer ?? q.correctanswer ?? q.answer ?? q.correct;
  if (rawCA === undefined || rawCA === null || rawCA === '') return false;

  const normalizeText = (str: string) => {
    return String(str || '')
      .replace(/^[A-J][\.\)]\s*/i, '')
      .replace(/\$/g, '')
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const cleanOptionText = normalizeText(typeof optionRaw === 'string' ? optionRaw : (optionRaw?.text || optionRaw?.value || ''));

  // If rawCA is an Array e.g. ["A", "C"] or ["A. Option 1", "C. Option 3"] or [0, 2]
  if (Array.isArray(rawCA)) {
    return rawCA.some((item: any) => {
      if (item === null || item === undefined) return false;
      if (typeof item === 'number') return item === optionIndex || item === optionIndex + 1;
      const str = String(item).trim();
      const strUpper = str.toUpperCase();

      if (strUpper === optUpper || strUpper.startsWith(optUpper + '.') || strUpper.startsWith(optUpper + ')') || strUpper.startsWith(optUpper + ':')) return true;

      const cleanStr = normalizeText(str);
      if (cleanOptionText && cleanStr && cleanStr === cleanOptionText) return true;

      return false;
    });
  }

  // If rawCA is a Number e.g. 0 or 2
  if (typeof rawCA === 'number') {
    return rawCA === optionIndex || rawCA === optionIndex + 1;
  }

  const strCA = String(rawCA).trim();
  if (!strCA) return false;

  // Split multi-part answers by newline (\n), comma (,), semicolon (;), or |||
  const parts = strCA.split(/[\n,;]|\s*\|\|\|\s*/).map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    const partUpper = part.toUpperCase();

    // Match option letter prefix or standalone letter e.g. "A", "A.", "A)", "A:", "Option A"
    if (partUpper === optUpper ||
      partUpper.startsWith(optUpper + '.') ||
      partUpper.startsWith(optUpper + ')') ||
      partUpper.startsWith(optUpper + ':') ||
      partUpper.startsWith(optUpper + ' ') ||
      partUpper === `OPTION ${optUpper}` ||
      partUpper.startsWith(`OPTION ${optUpper}.`) ||
      partUpper.startsWith(`OPTION ${optUpper} `)) {
      return true;
    }

    // Match option text e.g. "3/5000" using strict equality to avoid matching "3/50000"
    const cleanPart = normalizeText(part);
    if (cleanOptionText && cleanPart && cleanPart === cleanOptionText) {
      return true;
    }
  }

  return false;
};

// Questions loaded from the API may carry their dropdown option list under any of several
// keys (or none). Normalise it onto values/DropdownOptions so the Select the Blank UI,
// which reads those fields, receives options regardless of the incoming shape.
//
// IMPORTANT: only run for questions that are genuinely dropdown-based. getDropdownOptionsFromQuestion
// falls back to `values`/`options`, so applying this unconditionally would copy a plain Multiple
// Choice question's options into DropdownOptions — which then makes isFillBlankDropdownQuestion
// misdetect it as Select the Blank and hide its Options section.
const ensureDropdownValues = (q: any): any => {
  // A single stored option is just the answer, so it must not promote a plain
  // Fill In the Blank into a dropdown question (which would render a <select>
  // over its gap). Same threshold as isDropdownBlankQuestion.
  const hasExplicitDropdownField =
    (Array.isArray(q?.DropdownOptions) && q.DropdownOptions.length > 1) ||
    (Array.isArray(q?.dropdownoptions) && q.dropdownoptions.length > 1) ||
    (Array.isArray(q?.DropdownValues) && q.DropdownValues.length > 1) ||
    (Array.isArray(q?.dropdownValues) && q.dropdownValues.length > 1);
  const hasDropdownToken = /\[\s*dropdown\d*\s*\]/i.test(
    String(q?.PartPrompt ?? q?.partPrompt ?? q?.label ?? q?.Question ?? q?.QuestionText ?? '')
  );
  if (!hasExplicitDropdownField && !hasDropdownToken) {
    return q;
  }

  const values = getDropdownOptionsFromQuestion(q);
  if (!values.length) {
    return q;
  }
  return {
    ...q,
    values,
    DropdownOptions: values,
    dropdownoptions: values,
    options: values,
  };
};

// Works out the similarity of one question on demand (the batch job covers the rest).
const CALL_SIMILARITY_API_URL = `${AIG_QUIZ_GEN_URL}/call_similarity_api`;
// Questions checked from the row menu this session; their similarity icon stays usable.
const SIMILARITY_READY_STORAGE_KEY = "similarityCheckedQuestionIds";

const ITEM_VALIDATION_BASE_URL = ITEM_VALIDATION_APP_URL;
const ITEM_VALIDATION_SSO_SECRET = "Excelsoftcorp";
const ITEM_VALIDATION_RUN_MAP_STORAGE_KEY = "itemValidationRunMap";
// How many recent analysis runs the per-row validation status scans. The status is a
// hint shown on every row, so it must not turn into an unbounded number of requests.
const VALIDATION_STATUS_RUN_LIMIT = 20;
const ITEM_VALIDATION_AUTH_URL = `${ITEM_VALIDATION_API_URL}/Auth/login`;
const ITEM_VALIDATION_API_AUTH_TOKEN_STORAGE_KEY = "itemValidationApiAuthToken";

const parseValidationItemsResponse = (payload: any): any[] => {
  let items = payload;

  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      return [];
    }
  }

  if (items && !Array.isArray(items)) {
    if (Array.isArray(items.data)) items = items.data;
    else if (Array.isArray(items.item_xml)) items = items.item_xml;
    else if (Array.isArray(items.question_xml)) items = items.question_xml;
    else if (items.status && Array.isArray(items.status)) items = items.status;
    else items = [items];
  }

  return Array.isArray(items) ? items : [];
};

const extractValidationRunId = (payload: any): string => {
  const readId = (value: any) =>
    value?.run_id ??
    value?.item_va_id ??
    value?.itemVaId ??
    value?.ItemVaId ??
    value?.runId ??
    value?.RunId ??
    value?.analysisId ??
    value?.AnalysisId ??
    value?.id ??
    value?.Id ??
    '';

  if (Array.isArray(payload)) {
    return String(readId(payload[0]) || '');
  }

  if (payload?.data && Array.isArray(payload.data)) {
    return String(readId(payload.data[0]) || '');
  }

  return String(readId(payload) || '');
};

const readValidationRunMap = (): Record<string, { runId?: string; analysisName?: string; updatedAt?: string }> => {
  try {
    const raw = sessionStorage.getItem(ITEM_VALIDATION_RUN_MAP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const getDirectQuestionItemCode = (question: any): string => {
  return String(
    question?.itemcode ??
    question?.itemCode ??
    question?.item_code ??
    question?.ItemCode ??
    ''
  ).trim();
};

const getQuestionLookupKeys = (question: any): string[] => {
  return Array.from(
    new Set(
      [
        question?.id,
        question?.numericId,
        question?.questionid,
        question?.questionId,
        question?.itemid,
        question?.itemId,
        question?.itemcode,
        question?.itemCode,
      ]
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
        .map((value) => String(value).trim())
    )
  );
};

/**
 * Removes an item's stored Item Validation data (analysis response + imported item).
 *
 * Editing a question leaves its previous analysis in place, so the 3-dot "Item Validate"
 * kept reopening the stale result and a fresh run was refused as "already validated".
 * Every call is best effort: a validation-service failure must never block the save.
 */
const purgeItemValidationData = async (itemCode: string): Promise<void> => {
  const code = String(itemCode || '').trim();
  if (!code) return;

  const post = async (url: string, body: any) => {
    try {
      const token = await getItemValidationApiAuthToken();
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.warn(`Failed to call ${url}`, err);
    }
  };

  await post(
    `${ITEM_VALIDATION_API_URL}/ItemValidation/DeleteItemValidationAnalysisResponse`,
    { itemId: "", itemCode: code }
  );
  await post(
    `${ITEM_VALIDATION_API_URL}/ItemValidation/DeleteItemData`,
    { itemCode: code, itemId: "" }
  );

  // The item is gone, so any cached read of the runs would still claim it exists.
  clearItemValidationApiCache();

  // Drop the cached run id too, otherwise the next click probes it and reopens the
  // analysis that was just deleted.
  try {
    const runMap = readValidationRunMap();
    if (runMap[code]) {
      delete runMap[code];
      sessionStorage.setItem(ITEM_VALIDATION_RUN_MAP_STORAGE_KEY, JSON.stringify(runMap));
    }
  } catch (err) {
    console.warn('Could not clear the cached item validation run', err);
  }
};

const buildItemValidationSsoToken = async (): Promise<string> => {
  const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
  const username =
    sessionStorage.getItem("username") ||
    sessionStorage.getItem("email") ||
    userInfo.username ||
    userInfo.userName ||
    userInfo.userCode ||
    "";
  const userCode = sessionStorage.getItem("userCode") || sessionStorage.getItem("usercode") || userInfo.userCode || "";
  const orgCode = sessionStorage.getItem("orgcode") || sessionStorage.getItem("orgCode") || userInfo.orgCode || "";
  const customerCode =
    sessionStorage.getItem("custcode") ||
    sessionStorage.getItem("customerCode") ||
    userInfo.customerCode ||
    userInfo.custCode ||
    "";
  const userRole = sessionStorage.getItem("userRole") || userInfo.userRole || "User";

  const secret = new TextEncoder().encode(ITEM_VALIDATION_SSO_SECRET);

  return new SignJWT({
    user_id: userCode,
    org_code: orgCode,
    cust_code: customerCode,
    userRole,
    username: username || userCode,
    loginType: "IV",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
};

const getValidationSessionContext = () => {
  const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");

  return {
    custCode:
      sessionStorage.getItem("custcode") ||
      sessionStorage.getItem("customerCode") ||
      userInfo.customerCode ||
      userInfo.custCode ||
      "",
    orgCode:
      sessionStorage.getItem("orgcode") ||
      sessionStorage.getItem("orgCode") ||
      userInfo.orgCode ||
      "",
    userCode:
      sessionStorage.getItem("userCode") ||
      sessionStorage.getItem("usercode") ||
      userInfo.userCode ||
      "",
  };
};

const requestItemValidationApiAuthToken = async (): Promise<string> => {
  const response = await fetch(ITEM_VALIDATION_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: "AILevateAPI",
      clientSecret: "excelsoftAILevateAPI",
    }),
  });

  if (!response.ok) {
    throw new Error(`Item Validation authentication failed (${response.status}).`);
  }

  const data = await response.json().catch(() => ({}));
  const token = String(data?.token || "").trim();

  if (!token) {
    throw new Error("Item Validation authentication token was not returned.");
  }

  sessionStorage.setItem(ITEM_VALIDATION_API_AUTH_TOKEN_STORAGE_KEY, token);
  return token;
};

const getItemValidationApiAuthToken = async (forceRefresh = false): Promise<string> => {
  if (!forceRefresh) {
    const storedToken = String(sessionStorage.getItem(ITEM_VALIDATION_API_AUTH_TOKEN_STORAGE_KEY) || "").trim();
    if (storedToken) return storedToken;
  }

  return requestItemValidationApiAuthToken();
};

/**
 * Short-lived cache for the Item Validation reads.
 *
 * The per-row status loader and the 3-dot Validate lookup ask the same endpoints for
 * the same runs — GetItemValidationAnalysisData, then a details page per run — so the
 * network tab showed each one two or more times for a single click. Identical GETs
 * now share one request: a call already in flight is awaited rather than repeated,
 * and a completed one is reused for a few seconds.
 *
 * The window is deliberately short, and anything that changes validation state
 * (a finished run, an edit that purges an item) clears it, so nothing goes stale.
 */
const ITEM_VALIDATION_CACHE_TTL_MS = 30000;
const itemValidationApiCache = new Map<string, { at: number; promise: Promise<any> }>();

// get-itemvalidation-data is asked for the same question request by the row status,
// the 3-dot Validate lookup and the delete check; identical calls share one request.
const validationItemsRequestCache = new Map<string, { at: number; promise: Promise<any> }>();

const fetchValidationItemsForRequest = (orgcode: string, custcode: string, questionRequestId: string) => {
  const key = `${orgcode}|${custcode}|${questionRequestId}`;
  const cached = validationItemsRequestCache.get(key);
  if (cached && Date.now() - cached.at < ITEM_VALIDATION_CACHE_TTL_MS) return cached.promise;
  const request = axios.get(`${AIG_QUIZ_GEN_URL}/get-itemvalidation-data`, {
    params: { orgcode, custcode, questionrequestid: questionRequestId },
  });
  validationItemsRequestCache.set(key, { at: Date.now(), promise: request });
  request.catch(() => validationItemsRequestCache.delete(key));
  return request;
};

const clearItemValidationApiCache = () => {
  itemValidationApiCache.clear();
  validationItemsRequestCache.clear();
};

const fetchItemValidationApiJson = async (
  endpoint: string,
  params: Record<string, string | number | undefined>,
  forceRefresh = false
) => {
  // Keyed without the auth token: a token refresh must not defeat the cache.
  const cacheKey = `${endpoint}?${Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join("&")}`;

  if (!forceRefresh) {
    const cached = itemValidationApiCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ITEM_VALIDATION_CACHE_TTL_MS) {
      return cached.promise;
    }
  }

  const request = fetchItemValidationApiJsonUncached(endpoint, params, forceRefresh);
  // A failure must not be remembered — drop it so the next call retries.
  itemValidationApiCache.set(cacheKey, { at: Date.now(), promise: request });
  request.catch(() => itemValidationApiCache.delete(cacheKey));
  return request;
};

const fetchItemValidationApiJsonUncached = async (
  endpoint: string,
  params: Record<string, string | number | undefined>,
  forceRefresh = false
) => {
  const authToken = await getItemValidationApiAuthToken(forceRefresh);
  const url = new URL(endpoint);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    url.searchParams.set(key, String(value));
  });
  url.searchParams.set("auth_token", authToken);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (response.status === 401 && !forceRefresh) {
    sessionStorage.removeItem(ITEM_VALIDATION_API_AUTH_TOKEN_STORAGE_KEY);
    // forceRefresh bypasses the cache, so this retries for real.
    return fetchItemValidationApiJson(endpoint, params, true);
  }

  if (!response.ok) {
    throw new Error(`Item Validation API failed (${response.status}).`);
  }

  return response.json();
};

const normalizeValidationLookupValue = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const matchesValidationDetailItem = (detail: any, targetItemCode: string): boolean => {
  const normalizedTarget = normalizeValidationLookupValue(targetItemCode);
  if (!normalizedTarget) return false;

  return [
    detail?.itemCode,
    detail?.ItemCode,
    detail?.itemcode,
    detail?.itemId,
    detail?.ItemId,
    detail?.itemid,
  ]
    .map(normalizeValidationLookupValue)
    .filter(Boolean)
    .includes(normalizedTarget);
};

const getValidationTotalPages = (payload: any, pageSize: number): number => {
  const totalPages = Number(
    payload?.totalPages ??
    payload?.TotalPages ??
    payload?.pageCount ??
    payload?.PageCount
  );

  if (Number.isFinite(totalPages) && totalPages > 0) {
    return totalPages;
  }

  const totalRows = Number(
    payload?.totalCount ??
    payload?.TotalCount ??
    payload?.total ??
    payload?.Total ??
    payload?.details?.[0]?.totalRows ??
    payload?.data?.[0]?.totalRows ??
    0
  );

  if (Number.isFinite(totalRows) && totalRows > 0) {
    return Math.max(1, Math.ceil(totalRows / pageSize));
  }

  return 1;
};

const fetchValidationRunDetailsPage = async (
  runId: string,
  pageNo: number,
  pageSize: number,
  searchText = ""
) => {
  const { custCode, orgCode, userCode } = getValidationSessionContext();

  return fetchItemValidationApiJson(
    `${ITEM_VALIDATION_API_URL}/ItemValidation/GetItemValidationAnalysisResponseData`,
    {
      CustCode: custCode,
      OrgCode: orgCode,
      ItemVaId: runId,
      ItemVarId: 0,
      UserCode: userCode,
      integrationType: 1,
      Status: 3,
      PageNo: pageNo,
      PageSize: pageSize,
      SearchText: searchText,
    }
  );
};

const findValidationItemRun = async (targetItemCode: string) => {
  const normalizedTarget = normalizeValidationLookupValue(targetItemCode);
  if (!normalizedTarget) return null;

  const probeRun = async (runId: string) => {
    const normalizedRunId = String(runId || "").trim();
    if (!normalizedRunId) return null;

    // Skip probing if the runId is a UUID or non-numeric, because ItemVaId must be an integer
    if (isNaN(Number(normalizedRunId))) {
      return null;
    }

    try {
      // Page 1 unfiltered first: it is needed for the page count anyway and is a
      // superset of the searched result. The previous order asked for page 1 twice —
      // once with SearchText and once without — on every probe.
      const firstPayload = await fetchValidationRunDetailsPage(normalizedRunId, 1, 100);
      const firstDetails = Array.isArray(firstPayload?.details) ? firstPayload.details : [];
      const firstMatch = firstDetails.find((detail: any) => matchesValidationDetailItem(detail, normalizedTarget));
      if (firstMatch) {
        return { runId: normalizedRunId, item: firstMatch };
      }

      const totalPages = Math.min(getValidationTotalPages(firstPayload, 100), 20);

      // Only worth a server-side search when the run spans more than one page —
      // it can find the item without walking every page.
      if (totalPages > 1) {
        const searchedPayload = await fetchValidationRunDetailsPage(normalizedRunId, 1, 100, targetItemCode);
        const searchedDetails = Array.isArray(searchedPayload?.details) ? searchedPayload.details : [];
        const searchedMatch = searchedDetails.find((detail: any) => matchesValidationDetailItem(detail, normalizedTarget));
        if (searchedMatch) {
          return { runId: normalizedRunId, item: searchedMatch };
        }
      }

      for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
        const pagedPayload = await fetchValidationRunDetailsPage(normalizedRunId, pageNo, 100);
        const pagedDetails = Array.isArray(pagedPayload?.details) ? pagedPayload.details : [];
        const pageMatch = pagedDetails.find((detail: any) => matchesValidationDetailItem(detail, normalizedTarget));
        if (pageMatch) {
          return { runId: normalizedRunId, item: pageMatch };
        }
        if (pagedDetails.length === 0) break;
      }
    } catch (err) {
      console.warn(`Failed to probe validation run ${normalizedRunId}:`, err);
    }

    return null;
  };

  const runMap = readValidationRunMap();
  const seededRunIds = Array.from(
    new Set(
      [
        runMap[targetItemCode]?.runId,
        sessionStorage.getItem("latestValidationRunId"),
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  for (const runId of seededRunIds) {
    const match = await probeRun(runId);
    if (match) return match;
  }

  const { custCode, orgCode, userCode } = getValidationSessionContext();
  const listPayload = await fetchItemValidationApiJson(
    `${ITEM_VALIDATION_API_URL}/ItemValidation/GetItemValidationAnalysisData`,
    {
      CustCode: custCode,
      OrgCode: orgCode,
      UserCode: userCode,
      ItemVaId: 0,
      integrationType: 1,
      Status: 3,
      PageNo: 1,
      PageSize: 100,
    }
  );

  const runs = (Array.isArray(listPayload?.details) ? listPayload.details : [])
    .map((run: any) => String(run?.itemVaId ?? run?.ItemVaId ?? run?.runId ?? run?.RunId ?? "").trim())
    .filter(Boolean);

  for (const runId of Array.from(new Set(runs)) as string[]) {
    if (seededRunIds.includes(runId)) continue;
    const match = await probeRun(runId);
    if (match) return match;
  }

  return null;
};

const AIGQuestionRepository = () => {
  const navigate = useNavigate();

  const [isImageInstructionModalOpen, setIsImageInstructionModalOpen] = useState(false);
  const [imageInstructionText, setImageInstructionText] = useState("");
  const [imageRegenerateTarget, setImageRegenerateTarget] = useState<any>(null);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);

  const [isImageSelectModalOpen, setIsImageSelectModalOpen] = useState(false);
  const [imageSelectTarget, setImageSelectTarget] = useState<any>(null);
  const [imageSelectDestination, setImageSelectDestination] = useState<"general" | "specific">("general");
  const [repositoryImages, setRepositoryImages] = useState<any[]>([]);
  const [isLoadingRepoImages, setIsLoadingRepoImages] = useState(false);
  const [selectedRepoImage, setSelectedRepoImage] = useState<string>("");
  const [selectedRepoImages, setSelectedRepoImages] = useState<string[]>([]);
  // Shown in red above the "Apply Selected Image" button instead of a browser alert.
  const [imageUploadError, setImageUploadError] = useState<string>("");
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const handleLocalImageBrowse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImageUploadError("");

    const imageFiles = Array.from(files).filter(file =>
      file.type.match(/^image\/(png|jpe?g)$/i) || file.name.match(/\.(png|jpe?g)$/i)
    );

    if (imageFiles.length === 0) {
      setImageUploadError("Please select a valid .png or .jpeg image file.");
      e.target.value = "";
      return;
    }

    // Anything over 5 MB is rejected up front, with the offending file named, rather
    // than being read into memory and failing part-way through the upload.
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const oversizedFiles = imageFiles.filter(file => file.size > MAX_IMAGE_BYTES);
    const validFiles = imageFiles.filter(file => file.size <= MAX_IMAGE_BYTES);

    if (oversizedFiles.length > 0) {
      const tooBig = oversizedFiles
        .map(file => `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`)
        .join(', ');
      setImageUploadError(`Please add an image less than 5 MB. ${tooBig}`);
    }

    // Every selected file was too large — nothing left to upload.
    if (validFiles.length === 0) {
      e.target.value = "";
      return;
    }

    setIsLoadingRepoImages(true);
    // Read the picture's bytes while the File is still in hand. The storage account
    // sends no Access-Control-Allow-Origin header, so once the image is only a blob
    // URL the browser can no longer read it back — which is why manually added
    // images came out as a link instead of a picture in the Word/Excel exports.
    const attachable: string[] = (await Promise.all(
      validFiles.map(file => fileToStorableDataUrl(file).catch(() => ''))
    )).filter(Boolean);
    let uploadedUrls: string[] = [];
    let uploadFailed = false;
    try {
      const { getKbAuthToken } = await import('@/lib/kb-auth');
      const token = await getKbAuthToken();
      const target = imageSelectTarget;

      // Upload into the SAME folder the picker is currently listing. Previously
      // the file always went to the book/chapter/LO folder even while "General
      // Images" was selected, so it landed somewhere the grid never showed and
      // the image was lost as soon as the list refreshed.
      let chapterName = "";
      if (modalSelectedChapter && modalSelectedChapter !== "all") {
        const chapterObj = modalChapters.find((c: any) => String(chapterKeyOf(c)) === modalSelectedChapter);
        chapterName = String(chapterObj ? chapterNameOf(chapterObj) : modalSelectedChapter);
      } else if (target?.chaptername || target?.ChapterName || target?.chapter_name || sessionStorage.getItem('selectedChapterName')) {
        chapterName = String(target?.chaptername || target?.ChapterName || target?.chapter_name || sessionStorage.getItem('selectedChapterName'));
      }

      let loName = "";
      if (modalSelectedLO && modalSelectedLO !== "all") {
        const loObj = modalLOs.find((l: any) => String(loKeyOf(l)) === modalSelectedLO);
        loName = String(loObj ? loNameOf(loObj) : modalSelectedLO);
      } else if (target?.learningObjective || target?.learningobjective || target?.lo_name) {
        loName = String(target?.learningObjective || target?.learningobjective || target?.lo_name);
      }

      // Customer / Organisation is the top of the blob hierarchy; with none known the
      // prefix is empty and the path is exactly what it was before.
      const { custCode: imageCustCode, orgCode: imageOrgCode } = resolveImageScope();
      const folderPath = buildImageFolderPath({
        custCode: imageCustCode,
        orgCode: imageOrgCode,
        destination: imageSelectDestination,
        bookName: resolveImageBookName(target),
        chapterName,
        loName,
      });

      const bookId = sessionStorage.getItem('bookid') || sessionStorage.getItem('bookDetailsId') || '2';
      const formData = new FormData();
      formData.append("folder_path", folderPath);
      formData.append("book_id", String(bookId));
      formData.append("auth_token", token);
      // Sent alongside the path so the server can apply the same scoping.
      appendImageScopeFields(formData);
      validFiles.forEach(file => formData.append("files", file));

      const response = await fetch(`${AGENT_GENERATIVE_API_URL}/upload-images`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      uploadedUrls = Array.isArray(data?.urls) && data.urls.length > 0
        ? data.urls
        : (data?.url ? [data.url] : []);

      if (uploadedUrls.length > 0) {
        const newImgObjs = uploadedUrls.map((url, idx) => ({
          backend_download_url: url,
          url: url,
          filename: validFiles[idx]?.name || 'uploaded_image'
        }));

        setRepositoryImages(prev => [...newImgObjs, ...prev]);
        setSelectedRepoImages(prev => Array.from(new Set([...prev, ...uploadedUrls])));
      } else {
        console.error('Upload returned no URL:', data);
        uploadFailed = true;
      }
    } catch (err) {
      console.error("Failed to upload image to blob storage:", err);
      uploadFailed = true;
    } finally {
      // Attach the picture straight away. Leaving the upload merely "selected"
      // meant closing the picker silently discarded it, which reads as the image
      // not saving. Cancelling the edit dialog still discards everything.
      // The embedded bytes are preferred over the blob URL so the Word/Excel
      // exports can render the image (see fileToStorableDataUrl).
      const toAttach = attachable.length ? attachable : uploadedUrls;
      if (toAttach.length) stageImagesForEdit(toAttach);
      if (uploadFailed) {
        alert(attachable.length
          ? 'The image was added to this question, but could not be saved to the shared image repository.'
          : 'The image could not be uploaded. Please try again.');
      }
      setIsLoadingRepoImages(false);
      e.target.value = "";
    }
  };

  const [modalChapters, setModalChapters] = useState<any[]>([]);
  const [modalLOs, setModalLOs] = useState<any[]>([]);
  const [modalSelectedChapter, setModalSelectedChapter] = useState<string>("all");
  const [modalSelectedLO, setModalSelectedLO] = useState<string>("all");
  const [modalChapterLOs, setModalChapterLOs] = useState<any[]>([]);

  // Fetch this book's chapters + LOs (get-chapter-lo-details) when the specific folder is chosen
  useEffect(() => {
    if (isImageSelectModalOpen && imageSelectDestination === "specific") {
      loadBookChapterLOs().then(list => {
        const chaptersList = uniqueByKey(list, chapterKeyOf);
        setModalChapterLOs(list);
        setModalChapters(chaptersList);
        setModalSelectedChapter(prev => {
          if (prev && prev !== 'all' && chaptersList.some((c: any) => String(chapterKeyOf(c)) === prev)) {
            return prev;
          }
          const resolved = resolveModalChapterKey(imageSelectTarget);
          if (resolved && resolved !== 'all' && chaptersList.some((c: any) => String(chapterKeyOf(c)) === resolved)) {
            return resolved;
          }
          if (chaptersList.length > 0) {
            return String(chapterKeyOf(chaptersList[0]));
          }
          return '';
        });
      }).catch(() => { setModalChapterLOs([]); setModalChapters([]); });
    }
  }, [isImageSelectModalOpen, imageSelectDestination]);

  // Filter LOs for the selected chapter (only that book/chapter's LOs)
  useEffect(() => {
    if (modalSelectedChapter && modalSelectedChapter !== "all") {
      const filtered = modalChapterLOs.filter((i: any) => String(chapterKeyOf(i)) === modalSelectedChapter);
      setModalLOs(uniqueByKey(filtered, loKeyOf));
    } else {
      setModalLOs([]);
    }
  }, [modalSelectedChapter, modalChapterLOs]);


  const fetchRepositoryImages = async (destination: "general" | "specific", target: any) => {
    setIsLoadingRepoImages(true);
    try {
      const { getKbAuthToken } = await import('@/lib/kb-auth');
      const token = await getKbAuthToken();
      // Built with the same helper the upload uses, so the folder being listed and
      // the folder written to can never disagree.
      const listChapterObj = modalSelectedChapter !== "all"
        ? modalChapters.find(c => String(chapterKeyOf(c)) === modalSelectedChapter)
        : null;
      const listLoObj = (modalSelectedChapter !== "all" && modalSelectedLO !== "all")
        ? modalLOs.find(l => String(loKeyOf(l)) === modalSelectedLO)
        : null;

      // Customer / Organisation is the top of the blob hierarchy; with none known the
      // prefix is empty and the path is exactly what it was before.
      const { custCode: imageCustCode, orgCode: imageOrgCode } = resolveImageScope();
      const folderPath = buildImageFolderPath({
        custCode: imageCustCode,
        orgCode: imageOrgCode,
        destination,
        bookName: resolveImageBookName(target),
        chapterName: modalSelectedChapter !== "all"
          ? String(listChapterObj ? chapterNameOf(listChapterObj) : modalSelectedChapter)
          : '',
        loName: listLoObj ? String(loNameOf(listLoObj)) : '',
      });

      // Reads the Customer/Organisation folder AND the unscoped one older images were
      // written to, merged — so nothing that is visible today disappears.
      setRepositoryImages(await listScopedImages(token, {
        destination,
        bookName: resolveImageBookName(target),
        chapterName: modalSelectedChapter !== "all"
          ? String(listChapterObj ? chapterNameOf(listChapterObj) : modalSelectedChapter)
          : '',
        loName: listLoObj ? String(loNameOf(listLoObj)) : '',
      }));
    } catch (e) {
      console.error(e);
      setRepositoryImages([]);
    } finally {
      setIsLoadingRepoImages(false);
    }
  };

  const handleOpenImageSelect = (q: any) => {
    setImageSelectTarget(q);
    // Open on the question's own book/chapter folder. Defaulting to "General
    // Images" listed the shared cross-book pool, so images from other subjects
    // and chapters showed up in the picker.
    setImageSelectDestination("specific");
    setModalSelectedChapter(resolveModalChapterKey(q));
    setModalSelectedLO("all");
    setSelectedRepoImage("");
    setSelectedRepoImages([]);
    setImageUploadError("");
    setIsImageSelectModalOpen(true);
    // The effect below refetches once the modal state settles.
  };

  useEffect(() => {
    if (isImageSelectModalOpen && imageSelectTarget) {
      fetchRepositoryImages(imageSelectDestination, imageSelectTarget);
      setSelectedRepoImage("");
    }
    // modalChapters / modalLOs are dependencies because the folder path is built from
    // the chapter and LO *names*, which are looked up in those lists. They load
    // asynchronously after the modal opens, so without them the first listing used the
    // raw chapter code and no LO at all — an empty folder — and never refreshed once
    // the real names arrived.
  }, [imageSelectDestination, isImageSelectModalOpen, imageSelectTarget, modalSelectedChapter, modalSelectedLO, modalChapters, modalLOs]);

  /**
   * Attaches image(s) to the targeted question. Shared by "Apply Selected Image"
   * and by a local upload, so both routes behave identically.
   */
  const stageImagesForEdit = (urls: string[]) => {
    const incoming = (urls || []).map(u => String(u || '').trim()).filter(Boolean);
    if (!imageSelectTarget || incoming.length === 0) return;
    applyImagesToTarget(incoming);
  };

  const applyImagesToTarget = (selectedRepoImages: string[]) => {
    const firstImage = selectedRepoImages[0];
    try {
      imageSelectTarget.generatedImageUrl = firstImage;
      (imageSelectTarget as any).generatedImages = selectedRepoImages;
      (imageSelectTarget as any).generatedimagetype = 1; // manually added
      if (imageSelectTarget.generated_image) {
        imageSelectTarget.generated_image = firstImage.split(',')[1] || firstImage;
      }

      // Update questions state to trigger re-render
      setQuestions(prev => {
        const newQuestions = [...prev];
        const idx = newQuestions.findIndex(q =>
          q === imageSelectTarget ||
          q.raw === imageSelectTarget ||
          q.raw?.[2] === imageSelectTarget ||
          q.id === imageSelectTarget.id ||
          q.questionid === imageSelectTarget.questionid
        );
        if (idx !== -1) {
          const prevQ = newQuestions[idx];
          newQuestions[idx] = {
            ...prevQ,
            generatedImageUrl: firstImage,
            generatedImages: selectedRepoImages,
            raw: Array.isArray(prevQ.raw)
              ? [prevQ.raw[0], prevQ.raw[1], { ...prevQ.raw[2], generatedImageUrl: firstImage, generatedImages: selectedRepoImages }, ...prevQ.raw.slice(3)]
              : { ...prevQ.raw, generatedImageUrl: firstImage, generatedImages: selectedRepoImages }
          };
        }
        return newQuestions;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsImageSelectModalOpen(false);
      setImageSelectTarget(null);
      setSelectedRepoImage("");
      setSelectedRepoImages([]);
    }
  };

  const handleImageSelectSubmit = async () => {
    if (!imageSelectTarget || selectedRepoImages.length === 0) return;
    applyImagesToTarget(selectedRepoImages);
  };

  const handleOpenImageRegenerate = (q: any) => {
    setImageRegenerateTarget(q);
    setImageInstructionText("");
    setIsImageInstructionModalOpen(true);
  };

  const handleRegenerateImageSubmit = async () => {
    if (!imageRegenerateTarget || !imageInstructionText.trim()) return;
    setIsRegeneratingImage(true);
    try {
      const { imageUrl: newImageUrl, optionImages } = await regenerateQuestionImageWithOptions(
        imageRegenerateTarget, imageInstructionText,
      );
      // Option images (Multiple Choice / Multiple Response) travel with the question.
      if (optionImages.length > 0) {
        imageRegenerateTarget.optionImages = optionImages;
      }
      if (newImageUrl) {
        imageRegenerateTarget.generatedImageUrl = newImageUrl;
        if (imageRegenerateTarget.generated_image) {
          imageRegenerateTarget.generated_image = newImageUrl.split(',')[1] || newImageUrl;
        }
      }
      if (newImageUrl || optionImages.length > 0) {
        // Update questions state to trigger re-render
        setQuestions(prev => {
          const newQuestions = [...prev];
          const idx = newQuestions.findIndex(q =>
            q === imageRegenerateTarget ||
            q.raw === imageRegenerateTarget ||
            q.raw?.[2] === imageRegenerateTarget ||
            q.id === imageRegenerateTarget.id ||
            q.questionid === imageRegenerateTarget.questionid
          );
          if (idx !== -1) {
            const prevQ = newQuestions[idx];
            const patch: any = {};
            if (newImageUrl) patch.generatedImageUrl = newImageUrl;
            if (optionImages.length > 0) patch.optionImages = optionImages;
            newQuestions[idx] = {
              ...prevQ,
              ...patch,
              raw: Array.isArray(prevQ.raw)
                ? [prevQ.raw[0], prevQ.raw[1], { ...prevQ.raw[2], ...patch }, ...prevQ.raw.slice(3)]
                : { ...prevQ.raw, ...patch }
            };
          }
          return newQuestions;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRegeneratingImage(false);
      setIsImageInstructionModalOpen(false);
      setImageInstructionText("");
      setImageRegenerateTarget(null);
    }
  };

  // Authentication check - redirect to login if not authenticated
  useEffect(() => {
    const checkAuthentication = () => {
      const username = sessionStorage.getItem('username');
      const userInfo = sessionStorage.getItem('userInfo');
      const custcode = sessionStorage.getItem('custcode');

      // Check if user is not authenticated (no username, userInfo, or custcode)
      if (!username && (!userInfo || userInfo === '{}') && !custcode) {
        navigate('/login', { replace: true });
        return;
      }
    };

    checkAuthentication();
  }, [navigate]);
  const [activeTab, setActiveTab] = useState("repository");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false)
  const [selectedQuestion, setSelectedQuestion] = useState<string>('')
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null)
  const [selectedQuestionRequestId, setSelectedQuestionRequestId] = useState<number | null>(null)
  const [questionRating, setQuestionRating] = useState<'up' | 'down' | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [questionRatings, setQuestionRatings] = useState<Record<string, 'up' | 'down'>>({})
  const [previewOpen, setPreviewOpen] = useState(false);
  // "View question image" opens just the image(s). It used to open the full
  // question preview dialog instead.
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerImages, setImageViewerImages] = useState<string[]>([]);
  const [imageViewerTitle, setImageViewerTitle] = useState<string>('');
  const [flashcardOpen, setFlashcardOpen] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [isFeedbackReadOnly, setIsFeedbackReadOnly] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [editQuestion, setEditQuestion] = useState<any>(null);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState({
    options: ['', '', '', ''], // Error messages for each option
    correctAnswer: '', // Error message for correct answer
    questionStem: '', // Error message for question stem
    sampleAnswer: '', // Error message for sample answer
    keyPoints: [], // Error messages for key points (written response)
  });
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Changes have been saved successfully.");
  const [questionType, setQuestionType] = useState("multiple-choice");
  const [selectedSourceType, setSelectedSourceType] = useState("0");
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  // Always default to "0" (All) for Question Type on navigation
  const [selectedQuestionType, setSelectedQuestionType] = useState(() => "0");
  const [taxonomyList, setTaxonomyList] = useState<string[]>([]);
  const [CreativityLevel, setCreativtyLevel] = useState<string[]>([]);
  const [NumberOfQuestions, setNumberOfQuestions] = useState<string[]>([]);
  const [savedQuestions, setSavedQuestions] = useState<Set<string>>(new Set());
  const [selectedTaxonomy, setSelectedTaxonomy] = useState("0");
  const [selectedRating, setSelectedRating] = useState("0"); // 0 = All
  // --- Creativity Level ---
  const [selectedCreativityLevel, setSelectedCreativityLevel] = useState("0");
  const [selectedCreatedBy, setSelectedCreatedBy] = useState("1");
  const [dropdownError, setDropdownError] = useState<string>("");
  // --- Study Domain (Chapter) ---
  const [chapters, setChapters] = useState<any[]>([]);
  const [currentBookName, setCurrentBookName] = useState('Book Based');
  const [bookName, setBookName] = useState('');
  // Always default to "0" (All) for Study Domain (Chapter) on navigation
  const [selectedChapter, setSelectedChapter] = useState(() => "0");
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersError, setChaptersError] = useState<string>("");
  const [isValidating, setIsValidating] = useState(false);
  // --- Learning Objective (LO) ---
  const [learningObjectives, setLearningObjectives] = useState<any[]>([]);
  // Always default to "0" (All) for Learning Objective on navigation
  const [selectedLO, setSelectedLO] = useState(() => "0");
  const [loLoading, setLoLoading] = useState(false);
  const [loError, setLoError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>("Loading questions...");

  const [dialogOpen, setDialogOpen] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [noResults, setNoResults] = useState(false);
  const [featurePreferences, setFeaturePreferences] = useState({
    isValidate: 0,
    isSimilarity: 0,
    isRewrite: 0
  });
  const [showBulkValidateState, setShowBulkValidateState] = useState(showBulkValidate);
  const [showExportMetadataState, setShowExportMetadataState] = useState(showExportMetadata);
  const [showBulkMetadataState, setShowBulkMetadataState] = useState(showBulkMetadata);
  const [isValidated, setIsValidated] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [validationErrorDialogOpen, setValidationErrorDialogOpen] = useState(false);
  const [validationErrorMessage, setValidationErrorMessage] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const [validationDetailsOpen, setValidationDetailsOpen] = useState(false);
  // Question whose Item Metadata dialog is open (opened from the Meta column).
  const [metadataDetailsQuestion, setMetadataDetailsQuestion] = useState<any | null>(null);
  const [validationDetailsLoading, setValidationDetailsLoading] = useState(false);
  const [validationDetailsError, setValidationDetailsError] = useState("");
  const [validationDetailsIframeUrl, setValidationDetailsIframeUrl] = useState("");
  const [validationDetailsItemCode, setValidationDetailsItemCode] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedPassageFilter, setSelectedPassageFilter] = useState(() => sessionStorage.getItem("selectedPassageFilter") || "0");

  /** Every image attached to a question, for the image-only viewer. */
  const collectQuestionImages = (q: any): string[] => {
    const data = q?.[2] || q || {};
    const list: string[] = Array.isArray(data?.generatedImages) && data.generatedImages.length
      ? data.generatedImages
      : (Array.isArray(q?.generatedImages) && q.generatedImages.length ? q.generatedImages : []);
    const resolved = list.length ? list : [resolveQuestionImageUrl(q)];
    return resolved
      .map((src: any) => String(src || '').trim())
      .filter((src: string) => src && !src.includes('NOT REQUIRED') && !src.includes('NO_IMAGE_REQUIRED'));
  };

  /**
   * Refinement (Regenerate / Rewrite) produces brand new question text, so the
   * source question's image no longer matches it. When the source question was
   * image based, generate a fresh image for each refined question — previously no
   * image was produced at all and image-based questions lost their visual.
   * Failures are non-fatal: the question is still saved, just without an image.
   */
  const attachImagesToRefinedQuestions = async (generated: any[], sourceQuestion: any): Promise<void> => {
    if (!Array.isArray(generated) || generated.length === 0) return;
    if (collectQuestionImages(sourceQuestion).length === 0) return;

    const { generateImageForQuestionWithOptions } = await import('@/utils/imageGeneration');
    for (const q of generated) {
      if (!q || typeof q !== 'object') continue;
      // Respect an image the generator already returned.
      if (collectQuestionImages(q).length > 0) continue;
      try {
        const { imageUrl, optionImages } = await generateImageForQuestionWithOptions(q);
        if (imageUrl) {
          q.generatedImageUrl = imageUrl;
          q.generatedImages = [imageUrl];
          q.generatedimagetype = 0;
        }
        // Multiple Choice / Multiple Response also get an image per option.
        if (optionImages.length > 0) {
          q.optionImages = optionImages;
        }
      } catch (err) {
        console.warn('Could not generate an image for a refined question:', err);
      }
    }
  };

  const openQuestionImageViewer = (q: any) => {
    setImageViewerImages(collectQuestionImages(q));
    setImageViewerTitle(String(q?.id || q?.questionid || ''));
    setImageViewerOpen(true);
  };

  const hasQuestionImage = (q: any): boolean => {
    if (!q) return false;
    if (q.generatedImageUrl && String(q.generatedImageUrl).trim().length > 0) return true;
    if (q.imageUrl && String(q.imageUrl).trim().length > 0) return true;
    if (q.image_url && String(q.image_url).trim().length > 0) return true;
    if (q.image && String(q.image).trim().length > 0) return true;
    if (q.hasImage || q.has_image || q.isImageBased) return true;

    const textContent = String(q.question || q.QuestionStatement || q.label || q.stem || '');
    if (/<img\s+[^>]*src=/i.test(textContent)) return true;

    return false;
  };

  // Classifies a question by its Passage Mode, matching how the Generator produces them:
  //   Normal  (passageMode 'single')            -> no Tabs, no TableAnalysis
  //   Multi + 1 passage  (Scenario_based)       -> exactly 1 entry in Tabs
  //   Multi + 2+ passages (Multi_Passage_based) -> 2 or more entries in Tabs
  //   Table   (Table_Analysis)                  -> TableAnalysis with Columns + Rows, no Tabs
  // Classification is driven by the stored data rather than the type label, because
  // passage mode is orthogonal to question type (any type can be multi-passage or table).
  const getPassageTabCount = (q: any): number => {
    const raw = q?.Tabs ?? q?.tabs
      ?? q?.QuestionData?.Tabs ?? q?.QuestionData?.tabs
      ?? q?.questiondata?.Tabs ?? q?.questiondata?.tabs
      ?? q?.[2]?.Tabs ?? q?.[2]?.tabs;
    const parsed = typeof raw === 'string' ? safeJsonParse(raw, null) : raw;
    return Array.isArray(parsed) ? parsed.length : 0;
  };

  const hasTableAnalysisData = (q: any): boolean => {
    const raw = q?.TableAnalysis ?? q?.tableAnalysis
      ?? q?.QuestionData?.TableAnalysis ?? q?.QuestionData?.tableAnalysis
      ?? q?.questiondata?.TableAnalysis ?? q?.questiondata?.tableAnalysis
      ?? q?.[2]?.TableAnalysis ?? q?.[2]?.tableAnalysis;
    const parsed = typeof raw === 'string' ? safeJsonParse(raw, null) : raw;
    return !!parsed && Array.isArray(parsed.Columns) && Array.isArray(parsed.Rows);
  };

  const isPassageMatching = (q: any, filterVal: string) => {
    if (!filterVal || filterVal === "0") return true;

    // Table is checked first: a table question never carries passage tabs.
    if (hasTableAnalysisData(q)) return filterVal === "table-passage";

    const tabCount = getPassageTabCount(q);
    if (filterVal === "single-passage") return tabCount === 1;
    if (filterVal === "multi-passage") return tabCount >= 2;
    if (filterVal === "table-passage") return false;

    return true;
  };

  // Same rule as everywhere else — see utils/questionType.
  const isFillBlankDropdownQuestion = (q: any) => isDropdownBlankQuestion(q);

  const isQuestionTypeMatching = (q: any, filterType: string) => {
    if (!filterType || filterType === "0" || filterType === "All") return true;

    const qType = String(q?.type || q?.questiontype || q?.QuestionType || '').toLowerCase().trim();
    const targetType = String(filterType).toLowerCase().trim();

    if (qType === targetType) return true;

    if (targetType.includes("select") && targetType.includes("blank")) {
      return (qType.includes("select") && qType.includes("blank")) || isFillBlankDropdownQuestion(q);
    }

    if (targetType.includes("fill") && targetType.includes("blank")) {
      return (qType.includes("fill") || qType.includes("fib")) && !qType.includes("select") && !isFillBlankDropdownQuestion(q);
    }

    if (targetType.includes("multiple") || targetType.includes("mcq")) {
      return (qType.includes("multiple") || qType.includes("mcq")) && !isFillBlankDropdownQuestion(q);
    }

    if (targetType.includes("written") || targetType.includes("essay") || targetType.includes("short")) {
      return qType.includes("written") || qType.includes("essay") || qType.includes("short");
    }

    if (targetType.includes("true") || targetType.includes("false")) {
      return qType.includes("true") || qType.includes("false");
    }

    return qType.includes(targetType) || targetType.includes(qType);
  };

  // Only the passage filter is applied client-side. Question type is already filtered
  // server-side via fetchData({ questionType }), so re-applying it here would risk
  // hiding rows the backend legitimately returned.
  const displayedQuestions = questions.filter(q =>
    isPassageMatching(q, selectedPassageFilter)
  );

  // Pagination is display-only: the API already returns every matching row, and
  // select-all, exports and validation keep working on displayedQuestions (all pages).
  const QUESTION_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const [questionPageSize, setQuestionPageSize] = useState<number>(10);
  const [questionPage, setQuestionPage] = useState<number>(1);
  const [questionGoToPage, setQuestionGoToPage] = useState<string>('');
  const questionTotalPages = Math.max(1, Math.ceil(displayedQuestions.length / questionPageSize));
  // Clamped so a delete that empties the last page shows the new last page, not a blank.
  const currentQuestionPage = Math.min(questionPage, questionTotalPages);
  const questionPageStart = (currentQuestionPage - 1) * questionPageSize;
  const pagedQuestions = displayedQuestions.slice(questionPageStart, questionPageStart + questionPageSize);
  // Up to five numbered buttons, kept around the current page.
  const questionPageNumbers = (() => {
    const windowSize = Math.min(5, questionTotalPages);
    let first = Math.max(1, currentQuestionPage - Math.floor(windowSize / 2));
    first = Math.min(first, questionTotalPages - windowSize + 1);
    return Array.from({ length: windowSize }, (_, i) => first + i);
  })();
  const goToQuestionPage = () => {
    const target = parseInt(questionGoToPage, 10);
    if (!isNaN(target)) {
      setQuestionPage(Math.min(Math.max(target, 1), questionTotalPages));
    }
    setQuestionGoToPage('');
  };

  const [playingQuestionId, setPlayingQuestionId] = useState<string | null>(null);

  // Text-to-speech preferences. The same session/local storage keys the Generate
  // screen writes, and the ones readSpeechPrefs() reads at speak time — so a choice
  // made on either screen applies to both, including the preview dialog's Audio.
  const readStoredPref = (key: string, fallback: string) => {
    try {
      return sessionStorage.getItem(key) || localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  };
  const [speechRate, setSpeechRate] = useState<string>(() => readStoredPref('speechRate', '1'));
  const [speechGender, setSpeechGender] = useState<string>(() => readStoredPref('speechGender', 'female'));
  const [speechAccent, setSpeechAccent] = useState<string>(() => readStoredPref('speechAccent', 'en-IN'));

  const persistSpeechPref = (key: string, value: string) => {
    try {
      sessionStorage.setItem(key, value);
      localStorage.setItem(key, value);
    } catch { /* storage unavailable — the choice just will not persist */ }
  };

  const speechControlsVisible =
    readStoredPref('isSpeechEnabled', 'true') !== 'false' &&
    readStoredPref('showTextToSpeech', '1') !== '0';

  // Stop reading as soon as the browser tab is hidden or this screen unmounts,
  // otherwise the question keeps being spoken after the user switches away.
  useEffect(() => installSpeechAutoStop(() => setPlayingQuestionId(null)), []);

  // Switching the in-page tab also stops playback.
  useEffect(() => {
    cancelSpeech();
    setPlayingQuestionId(null);
  }, [activeTab]);

  const handleSpeak = (question: any) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Stop if already playing the same question
    if (playingQuestionId === question.id) {
      cancelSpeech();
      setPlayingQuestionId(null);
      return;
    }

    // Read the passage, the stem AND every answer option — not just the stem —
    // with markup stripped and symbols spoken as words.
    const textToRead = getCleanStem(question) || question?.question || question?.label || question?.QuestionStatement || question?.text || '';

    // Read the passage, the stem AND every answer option — not just the stem —
    // with markup stripped and symbols spoken as words. A translated question
    // (Thai, Hindi, …) is matched to a voice for that language.
    const speechText = buildSpeechText(question, textToRead);
    if (!speechText) return;

    // A converted question knows its own language ("Thai"); fall back to the
    // language segment of the identifier (…_MC_L1_TH_ID19944) and finally to
    // sniffing the script.
    const langHint = question?.quesOrigin
      || question?.originallanguage
      || question?.language
      || question?.Language
      || languageFromQuestionId(question?.id || question?.questionguid);

    setPlayingQuestionId(question.id);
    speakText(speechText, {
      langHint,
      onend: () => setPlayingQuestionId(null),
      onerror: () => setPlayingQuestionId(null),
    }).then(started => {
      if (!started) setPlayingQuestionId(null);
    });
  };

  // const statsData = [
  //   {
  //     title: "Total Questions",
  //     value: "1,247",
  //     change: "+15% this month",
  //     icon: Database,
  //     valueColor: "#1c398e",
  //   },
  //   {
  //     title: "AI Generated",
  //     value: "892",
  //     change: "High quality",
  //     icon: Brain,
  //     valueColor: "#0d542b",
  //   },
  //   {
  //     title: "This Week",
  //     value: "47",
  //     change: "New questions",
  //     icon: TrendingUp,
  //     valueColor: "#59168b",
  //   },
  //   {
  //     title: "Contributors",
  //     value: "12",
  //     change: "Active authors",
  //     icon: Users,
  //     valueColor: "#7e2a0c",
  //   },
  // ];

  const clearFilters = () => {
    // Reset in-component state to defaults
    setSelectedQuestionType("0");
    setSelectedTaxonomy("0");
    setSelectedLO("0");
    setSelectedRating("0");
    setSelectedCreativityLevel("0");
    setSelectedChapter("0");
    setSelectedSourceType("0");
    setSelectedPassageFilter("0");

    // Clear persisted values so a reload doesn't restore prior selections
    try {
      sessionStorage.removeItem("selectedPassageFilter");
      sessionStorage.removeItem("selectedQuestionType");
      sessionStorage.removeItem("selectedTaxonomy");
      sessionStorage.removeItem("selectedLO");
      sessionStorage.removeItem("selectedRating");
      sessionStorage.removeItem("selectedCreativityLevel");
      sessionStorage.removeItem("selectedChapter");
      sessionStorage.removeItem("selectedSourceType");
    } catch { }
  };

  type Question = {
    id: string;
    question?: string;
    type?: string;
    topic?: string;
    creativityLevel?: string;
    created?: string;
    questionrequestid?: string;
    [key: string]: any;
  };


  // const [searchText, setSearchText] = useState("");
  // Fetch user preferences
  const fetchUserPreferences = async () => {
    try {
      const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
      let custcode = sessionStorage.getItem("custcode") || "";
      let orgcode = sessionStorage.getItem("orgcode") || "";
      let usercode = sessionStorage.getItem("userCode") || sessionStorage.getItem("usercode") || sessionStorage.getItem("username") || "";

      if (!custcode) custcode = userInfo.customerCode || userInfo.custCode || userInfo.custcode || "";
      if (!orgcode) orgcode = userInfo.orgCode || userInfo.orgcode || "";
      if (!usercode) usercode = userInfo.userCode || userInfo.usercode || userInfo.username || userInfo.userName || "";

      const response = await axios.post(
        `${AIG_QUIZ_GEN_URL}/get_preference`,
        {
          orgcode: orgcode,
          custcode: custcode,
          usercode: usercode,
          appcode: 'AIG'
        }
      );

      if (response.data) {
        setFeaturePreferences({
          isValidate: response.data.isvalidate || 0,
          isSimilarity: response.data.issimilarity || 0,
          isRewrite: response.data.isrewrite || 0
        });

        // itemvalidate controls Bulk Validate button
        if (response.data.itemvalidate !== undefined) {
          setShowBulkValidateState(Number(response.data.itemvalidate));
        }

        // metadata controls Export Metadata and Bulk Metadata buttons
        if (response.data.metadata !== undefined) {
          const metaVal = Number(response.data.metadata);
          setShowExportMetadataState(metaVal);
          setShowBulkMetadataState(metaVal);
        }
      }
    } catch (error) {
      console.error('Error fetching user preferences:', error);
    }
  };




  // Expose fetchData so it can be called after delete
  const fetchData = async (filters?: {
    searchText?: string;
    chapterCode?: string;
    questionType?: string;
    taxonomy?: string;
    learningObjective?: string;
    creativityLevel?: string; // Add creativityLevel to filters
    sourceType?: string;
    rating?: string;
    createdBy?: string;
  }) => {
    setLoading(true);
    if (filters) setQuestionPage(1);
    let usercode = "";
    let custcode = "";
    let orgcode = "";
    try {
      const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
      // Prefer explicit localStorage overrides if present
      usercode = sessionStorage.getItem("userCode") || userInfo.userCode || userInfo.usercode || "";
      // Some payloads use customerCode instead of custCode
      custcode = sessionStorage.getItem("custcode") || userInfo.customerCode || userInfo.custCode || "";
      orgcode = sessionStorage.getItem("orgcode") || userInfo.orgCode || userInfo.organizationCode || "";
    } catch (e) {
      usercode = "";
      custcode = "";
      orgcode = "";
    }
    // If Created By = 3 (All), send empty usercode so backend returns all
    const effectiveCreatedBy = filters?.createdBy !== undefined ? filters.createdBy : selectedCreatedBy;
    const effectiveUsercode = effectiveCreatedBy === "3" ? "" : usercode;
    // Only include filters if not "All" (value "0" or empty string).
    // A bare fetchData() — after a delete/save, or when another dropdown refetches —
    // must keep the filters the user already applied. Reading only `filters` meant
    // those calls silently dropped Study Domain, LO, Taxonomy, Creativity Level and
    // Source Type, so the list came back unfiltered while the dropdowns still showed
    // the selection. Every value now falls back to the current selection, the way
    // questionType / rating / searchText already did.
    const pickFilter = (given: string | undefined, current: any) => {
      const val = given !== undefined ? given : current;
      const str = val === null || val === undefined ? "" : String(val);
      return str && str !== "0" ? str : "";
    };
    const chaptercode = pickFilter(filters?.chapterCode, selectedChapter);
    const toNum = (val: any) => {
      const n = Number(val);
      return isNaN(n) ? 0 : n;
    };
    // Convert dropdown labels to numeric IDs expected by backend API get_from_db.
    // The previous inline mapping matched "Multiple Response" on the word "multiple"
    // and returned 1 (Multiple Choice), and used ids 2/3/4 for Fill In the Blank /
    // Written Response / True False where the backend expects 4/7/3.
    const questiontypeid = resolveQuestionTypeId(
      filters?.questionType !== undefined ? filters.questionType : selectedQuestionType
    );

    const taxonomyid = toNum(pickFilter(filters?.taxonomy, TAXONOMY_FILTER_IDS[selectedTaxonomy]));
    const locode = pickFilter(filters?.learningObjective, selectedLO);
    // booknameid should be a number, fallback to 2 (Cyber Risk default) or 0
    let booknameidRaw = sessionStorage.getItem("bookType") || sessionStorage.getItem("booknameid") || "2";
    let booknameid: number = toNum(booknameidRaw);

    // Convert selectedCreativityLevel to a number, default to 0 if "All Levels" or invalid
    const creativitylevel = toNum(pickFilter(filters?.creativityLevel, selectedCreativityLevel));
    const sourcetype = toNum(pickFilter(filters?.sourceType, selectedSourceType));
    const rating = toNum(filters?.rating ?? selectedRating ?? 0);
    const input = {
      custcode: custcode || "ES",
      orgcode: orgcode,
      usercode: effectiveUsercode,
      appcode: sessionStorage.getItem("appcode") || "AIG",
      booknameid: booknameid,
      chaptercode: chaptercode,
      locode: locode,
      questiontypeid: questiontypeid,
      taxonomyid: taxonomyid,
      difficultlevelid: 0,
      questionrequestid: 0,
      questionid: 1,
      sourcetype: sourcetype,
      pagesize: 0,
      pageno: 0,
      usertypeid: effectiveCreatedBy,
      searchtext: filters?.searchText !== undefined ? filters.searchText : searchText,
      creativitylevel: creativitylevel, // Use the dynamic creativity level
      rating: rating,
      rating_feedback: "",
    };

    //console.log('[QuestionRepository] API input:', input);

    try {
      const data = await getFromDB(input as any);
      //console.log('[QuestionRepository] getFromDB response:', data);
      if (data && data.question_xml) {
        //console.log('[QuestionRepository] question_xml:', data.question_xml);
      }

      const fixLatex = (s: any) => typeof s === 'string'
        ? s.replace(/\\{2,}([()\[\]a-zA-Z])/g, '\\$1')
          .replace(/\\{2,}/g, '\\\\')
        : s;

      // Options, matrix rows/columns, feedbacks and key points carry equations too
      // (e.g. a Matrix column of "\\\\(\\frac{1}{4}\\\\)"). Left unfixed they reach the
      // edit dialog as raw escaped LaTeX, which reads as junk characters.
      const fixLatexDeep = (value: any, depth = 0): any => {
        if (depth > 6) return value;
        if (typeof value === 'string') {
          // Several of these fields arrive as JSON documents (e.g. `columns` is the
          // string '[{"text":"\\\\(\\frac{1}{4}\\\\)"}]'). Fixing the backslashes on
          // the raw document would produce invalid JSON escapes, so parse it, fix the
          // values inside, and re-serialise — keeping the field a string for the
          // consumers that JSON.parse it.
          const trimmed = value.trim();
          if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed && typeof parsed === 'object') {
                return JSON.stringify(fixLatexDeep(parsed, depth + 1));
              }
            } catch { /* not JSON — fall through and fix as plain text */ }
          }
          return fixLatex(value);
        }
        if (Array.isArray(value)) return value.map(v => fixLatexDeep(v, depth + 1));
        if (value && typeof value === 'object') {
          const out: any = { ...value };
          Object.keys(out).forEach(k => { out[k] = fixLatexDeep(out[k], depth + 1); });
          return out;
        }
        return value;
      };

      const LATEX_BEARING_KEYS = [
        'label', 'QuestionStatement', 'PartPrompt', 'CorrectAnswer', 'question', 'stem',
        'values', 'options', 'Options', 'columns', 'rows', 'Columns', 'Rows',
        'Feedbacks', 'KeyPoints', 'DropdownOptions', 'dropdownoptions',
        'Tabs', 'tabs', 'TableAnalysis', 'tableAnalysis', 'ReferenceInfo', 'referenceinfo',
      ];

      const fixQuestionObject = (obj: any) => {
        if (!obj || typeof obj !== 'object') return obj;
        const newObj = { ...obj };
        LATEX_BEARING_KEYS.forEach(key => {
          if (newObj[key]) newObj[key] = fixLatexDeep(newObj[key]);
        });
        Object.keys(newObj).forEach(key => {
          if (key.startsWith('FeedbackOption')) {
            newObj[key] = fixLatex(newObj[key]);
          }
        });
        return newObj;
      };

      let questionsArr: Question[] = [];
      // Try to handle both array-of-arrays and array-of-objects
      if (data && Array.isArray(data.question_xml)) {
        if (data.question_xml.length > 0 && Array.isArray(data.question_xml[0])) {
          // Array of arrays (old logic)
          questionsArr = data.question_xml
            .map((item: any) => {
              if (
                Array.isArray(item) &&
                item.length >= 11
              ) {
                const f16 = typeof item[16] === 'string' ? String(item[16]) : '';
                const f17 = typeof item[17] === 'string' ? String(item[17]) : '';
                const chooseFeedback = (val: string) => {
                  const t = (val || '').trim();
                  if (!t) return '';
                  const looksLikeCode = /^[A-Za-z]{1,3}\d{1,4}$/.test(t);
                  const hasSentenceHint = /[\s,.!?]/.test(t) && t.length >= 10;
                  return !looksLikeCode && hasSentenceHint ? t : '';
                };
                const pickFeedback = chooseFeedback(f16) || chooseFeedback(f17) || '';
                // Normalise dropdown options and JSON-encoded TableAnalysis before the
                // question reaches the UI, which expects both in parsed/flat form.
                const rawParsed2 = typeof item[2] === 'string' ? safeJsonParse(item[2], {}) : (item[2] || {});
                const questionData = ensureDropdownValues(rawParsed2);
                questionData.Tabs = safeJsonParse(questionData.Tabs ?? questionData.tabs, null);
                questionData.tabs = questionData.Tabs;
                questionData.TableAnalysis = safeJsonParse(questionData.TableAnalysis ?? questionData.tableAnalysis, null);
                questionData.tableAnalysis = questionData.TableAnalysis;
                return {
                  id: item[7] || item[0], // string ID for UI
                  numericId: item[0], // numeric ID for API
                  questionrequestid: item[1],
                  // The question's own database id — what the similarity APIs expect.
                  // It is not always the number at the end of the identifier, so it is
                  // taken from the row itself.
                  similarityQuestionId: Number(item[1]) || null,
                  question: fixLatex(questionData?.label ?? "No question text"),
                  quesOrigin: questionData.originallanguage,
                  type: item[6] ?? "Multiple Choice",
                  topic: item[12] ?? item[11] ?? "Unknown",
                  creativityLevel: item[18],
                  created: "N/A",
                  userCode: item[3] || item[4] || item[5] || "Unknown", // User information from array
                  userName: item[11] || item[4] || item[5] || "Unknown", // User information from array
                  ...fixQuestionObject(questionData),
                  generatedImageUrl: questionData?.generatedImageUrl || questionData?.imageUrl || '',
                  // Per-option images saved with the question (Multiple Choice / Multiple
                  // Response). Kept exactly as the API sent them — a list, or the JSON
                  // text a blob column returns — and read by getOptionImages.
                  optionImages: readOptionImagesField(questionData) ?? [],
                  MaxMarks: questionData.MaxMarks || item[3] || 1,
                  source: item[12] == "1" ? "Book Based" : "LLM",
                  study: item[13],
                  learningObjective: item[9],
                  taxonomyid: item[14],
                  ratingid: item[15],
                  feedback: pickFeedback,
                  rating_feedback: item[16],
                  creativitylevelname: item[18] == 1 ? 'Moderate' : item[18] == 2 ? 'High' : 'Very High',
                  bookname: item[10],
                  taxonomy: item[8],
                  created_date: item[22],
                  kbid: item[23] || "",
                  gid: item[24] || "",
                  metadata: item[25] || null,
                  generatedimagetype: resolveImageType(
                    (questionData as any)?.generatedimagetype,
                    (questionData as any)?.generated_image_type,
                    (questionData as any)?.generatedImageType,
                    rawParsed2?.generatedimagetype,
                    rawParsed2?.generated_image_type,
                    rawParsed2?.generatedImageType,
                    item[26],
                    item[item.length - 1]
                  )
                };
              }
              return null;
            })
            .filter(Boolean);
        } else if (typeof data.question_xml[0] === "object") {
          // Array of objects (new logic)
          questionsArr = data.question_xml.map((item: any) => {
            const rawParsed = typeof item.question_xml === 'string'
              ? safeJsonParse(item.question_xml, null)
              : (typeof item.itemjson === 'string' ? safeJsonParse(item.itemjson, null) : null);
            const mergedItem = rawParsed && typeof rawParsed === 'object' ? { ...rawParsed, ...item } : item;
            const fixedItem = ensureDropdownValues(fixQuestionObject(mergedItem));
            fixedItem.Tabs = safeJsonParse(fixedItem.Tabs ?? fixedItem.tabs, null);
            fixedItem.tabs = fixedItem.Tabs;
            fixedItem.TableAnalysis = safeJsonParse(fixedItem.TableAnalysis ?? fixedItem.tableAnalysis, null);
            fixedItem.tableAnalysis = fixedItem.TableAnalysis;
            const normalizedFeedback = fixedItem.feedback ?? fixedItem.rating_feedback ?? fixedItem.ratingfeedback ?? fixedItem.RatingFeedback ?? fixedItem.feedbackText ?? fixedItem.FeedbackText ?? fixedItem.feedback_text ?? fixedItem.feedbackdescription ?? fixedItem.feedbackDescription ?? fixedItem.FeedbackDescription ?? fixedItem.comments ?? fixedItem.Remarks ?? '';
            return {
              id: fixedItem.id || fixedItem.questionid || fixedItem.questionId || Math.random().toString(36).slice(2),
              numericId: fixedItem.questionid || fixedItem.questionId || fixedItem.id || null,
              questionrequestid: fixedItem.questionrequestid || fixedItem.questionRequestId || "",
              // The question's own database id — what the similarity APIs expect.
              similarityQuestionId: Number(fixedItem.questionid || fixedItem.questionId) || null,
              question: fixedItem.label || fixedItem.QuestionStatement || fixedItem.question || fixedItem.stem || "No question text",
              type: fixedItem.type || fixedItem.questiontype || "Multiple Choice",
              topic: fixedItem.topic || fixedItem.topicname || "Unknown",
              creativityLevel: fixedItem.creativityLevel || fixedItem.difficulty || fixedItem.difficultylevel || "Moderate",
              created: fixedItem.created || fixedItem.createdAt || "N/A",
              userCode: fixedItem.usercode || fixedItem.userCode || fixedItem.createdBy || fixedItem.author || "Unknown",
              userName: fixedItem.username || fixedItem.userName || fixedItem.createdBy || fixedItem.author || "Unknown",
              creativitylevelname: fixedItem.creativityLevel == 1 ? 'Moderate' : fixedItem.creativityLevel == 2 ? 'High' : fixedItem.creativityLevel == 3 ? 'Very High' : 'Moderate', // Derive display name
              ratingid: fixedItem.ratingid || fixedItem.ratingId || fixedItem.RatingId || fixedItem.RatingID,
              ...fixedItem,
              generatedImageUrl: fixedItem.generatedImageUrl || fixedItem.imageUrl || '',
              // Per-option images saved with the question (Multiple Choice / Multiple
              // Response), in whatever shape the API sent them.
              optionImages: readOptionImagesField(fixedItem) ?? readOptionImagesField(item) ?? [],
              feedback: normalizedFeedback,
              // Preserve original rating feedback if it exists, don't override with normalized feedback
              rating_feedback: fixedItem.rating_feedback || fixedItem[16] || normalizedFeedback,
              kbid: fixedItem.kbid || fixedItem[23] || "",
              gid: fixedItem.gid || fixedItem[24] || "",
              metadata: fixedItem.metadata || fixedItem[25] || null,
              generatedimagetype: resolveImageType(
                fixedItem.generatedimagetype,
                fixedItem.generated_image_type,
                fixedItem.generatedImageType,
                item.generatedimagetype,
                item.generated_image_type,
                item.generatedImageType,
                rawParsed?.generatedimagetype,
                rawParsed?.generated_image_type,
                rawParsed?.generatedImageType
              )
            };
          });
        }
      }
      //console.log('[QuestionRepository] questionsArr after API parsing:', questionsArr);
      //console.log('[QuestionRepository] Number of questions parsed:', questionsArr.length);

      setQuestions(questionsArr);
      setSelectedQuestions([]); // Clear selected checkboxes whenever data refreshes
      setNoResults(questionsArr.length === 0);
      setError(null);
    } catch (err) {
      setError("Failed to load questions");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const loadData = async () => {
      await fetchData();
      await fetchUserPreferences();
    };
    loadData();
  }, []);

  // Debug: Monitor questions state changes
  // useEffect(() => {
  //   //console.log('[QuestionRepository] Questions state updated:', {
  //   //   count: questions.length,
  //   //   firstQuestion: questions[0]?.question || 'No questions',
  //   //   loading: loading,
  //   //   error: error
  //   // });
  // }, [questions, loading, error]);

  // Optional: Manual refresh button for user
  // Place this in the UI where appropriate if desired

  useEffect(() => {
    // Ensure localStorage has custcode, orgcode, appcode for dropdown API
    try {
      const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
      if (userInfo.custCode) sessionStorage.setItem("custcode", userInfo.custCode);
      if (userInfo.orgCode) sessionStorage.setItem("orgcode", userInfo.orgCode);

    } catch { }

    // Fetch dropdowns for taxonomy and question type
    const fetchDropdowns = async () => {
      try {
        const data = await fetchDropdownOptions();
        let taxonomy: string[] = [];
        let qtypes: string[] = [];
        let creativitylevel: string[] = [];
        let numberofquestions: string[] = [];
        data.forEach((item: any) => {
          let parsed = [];
          try {
            parsed = JSON.parse(item.jsonDetails);
          } catch (e) {
            parsed = [];
          }
          if (item.type === "taxonomy") {
            taxonomy = parsed.map((t: any) => t.taxonomy);
          }
          if (item.type == "Creativity_level") {
            creativitylevel = parsed.map((t: any) => t.creativitylevel);
          }
          if (item.type === "QuestionType") {
            qtypes = parsed
              .map((q: any) => q.questiontype)
              .filter((qt: string) => qt && !String(qt).toLowerCase().includes("scenario"));
          }
          if (item.type === "numberof_questions") {
            numberofquestions = parsed.map((q: any) => q.numberof_questions);
          }
        });
        setNumberOfQuestions(numberofquestions);
        setCreativtyLevel(creativitylevel);
        setTaxonomyList(taxonomy);
        setQuestionTypes(qtypes);


        if (!taxonomy.length || !qtypes.length) {
          setDropdownError("Dropdown data missing. Please check API response.");
        } else {
          setDropdownError("");
        }
      } catch (error) {
        setTaxonomyList([]);
        setQuestionTypes([]);
        setDropdownError("Failed to load dropdowns.");
      }
    };
    fetchDropdowns();
  }, []);
  // Get book code and name from URL or localStorage
  const getBookInfo = () => {
    // First try to get from URL parameters
    const params = new URLSearchParams(window.location.search);
    const bookCodeFromUrl = params.get('bookCode');

    // Then try localStorage
    const bookCodeFromStorage = sessionStorage.getItem('bookid') || sessionStorage.getItem('bookType');
    const bookNameFromStorage = sessionStorage.getItem('bookTitle');

    // Default values if nothing found
    const bookCode = bookCodeFromUrl || bookCodeFromStorage || '2';
    const bookName = bookNameFromStorage || 'Book Based';

    return { bookCode, bookName };
  };

  // Fetch chapters for Study Domain dropdown
  useEffect(() => {
    const loadChapters = async () => {
      setChaptersLoading(true);
      setChaptersError("");
      try {
        const { bookCode, bookName } = getBookInfo();
        setCurrentBookName(bookName);
        //console.log('Fetching chapters for book code:', bookCode, 'Book name:', bookName);
        const result = await getChapters(bookCode);
        if (Array.isArray(result) && result.length > 0) {
          setChapters(result);
          setSelectedChapter(() => {
            const stored = sessionStorage.getItem("selectedChapter");
            if (stored && result.some(ch => ch.chapterCode === stored)) return stored;
            // Always default to "0" (All) if no valid stored value
            return "0";
          });
        } else {
          setChapters([]);
          setSelectedChapter("0");
        }
      } catch (err) {
        setChaptersError("Failed to load chapters");
        setChapters([]);
        setSelectedChapter("0");
      } finally {
        setChaptersLoading(false);
      }
    };
    loadChapters();
  }, []);

  // Fetch LOs when selectedChapter changes
  useEffect(() => {
    if (!selectedChapter) {
      setLearningObjectives([]);
      setSelectedLO("");
      return;
    }
    setLoLoading(true);
    setLoError("");
    setLearningObjectives([]);
    setSelectedLO("0"); // Set to "All" by default when chapter changes
    const chapterCode = selectedChapter.trim();
    getLearningObjectives(chapterCode)
      .then((result) => {
        setLearningObjectives(result);
        // Always set to "All" when chapter changes, regardless of stored value
        setSelectedLO("0");
      })
      .catch(() => {
        setLoError("Failed to load learning objectives");
        setLearningObjectives([]);
        setSelectedLO("");
      })
      .finally(() => setLoLoading(false));
  }, [selectedChapter]);

  // Persist Study Domain (Chapter)
  useEffect(() => {
    if (selectedChapter) sessionStorage.setItem("selectedChapter", selectedChapter);
  }, [selectedChapter]);

  // Persist Learning Objective
  useEffect(() => {
    if (selectedLO) sessionStorage.setItem("selectedLO", selectedLO);
  }, [selectedLO]);

  // Persist Taxonomy
  useEffect(() => {
    if (selectedTaxonomy) sessionStorage.setItem("selectedTaxonomy", selectedTaxonomy);
  }, [selectedTaxonomy]);

  // Enhanced validation function for edit dialog with comprehensive validation
  const handleSaveChanges = () => {
    const questionStemTextarea = document.querySelector('[data-question-stem-textarea]') as HTMLTextAreaElement;
    const optionTextareas = document.querySelectorAll('[data-option-textarea]') as NodeListOf<HTMLTextAreaElement>;
    const correctAnswerTextarea = document.querySelector('[data-correct-answer-textarea]') as HTMLTextAreaElement;
    const correctAnswerEditor = document.querySelector('[data-correct-answer-editor]') as HTMLElement;
    const correctAnswerSelect = document.querySelector('[data-correct-answer-select]') as HTMLSelectElement;

    // Reset validation errors
    const newErrors = {
      options: ['', '', '', ''],
      correctAnswer: '',
      questionStem: '',
      sampleAnswer: '',
      keyPoints: [],
    };

    let hasErrors = false;

    if (correctAnswerSelect && optionTextareas.length === 4 && (correctAnswerTextarea || correctAnswerEditor)) {
      const selectedOption = correctAnswerSelect.value;
      const selectedIndex = ['A', 'B', 'C', 'D'].indexOf(selectedOption);
      const optionValues = Array.from(optionTextareas).map(textarea => textarea.value.trim());
      const correctAnswerText = correctAnswerTextarea ? correctAnswerTextarea.value.trim() : (correctAnswerEditor?.innerHTML || '').trim();
      const questionStemText = questionStemTextarea?.value.trim();

      // 1. Check if question stem is empty
      if (!questionStemText) {
        newErrors.questionStem = 'Question Stem cannot be empty.';
        hasErrors = true;
      }

      // 2. Check for empty options
      optionValues.forEach((value, index) => {
        if (!value) {
          newErrors.options[index] = 'This option cannot be empty.';
          hasErrors = true;
        }
      });

      // 3. Check if correct answer text is empty
      if (!correctAnswerText) {
        newErrors.correctAnswer = 'Correct Answer cannot be empty.';
        hasErrors = true;
      }

      // 4. Check for unique options (only if no empty options)
      if (!hasErrors) {
        const duplicateIndices = [];
        optionValues.forEach((value, index) => {
          const duplicateIndex = optionValues.findIndex((otherValue, otherIndex) =>
            otherIndex !== index && value.toLowerCase() === otherValue.toLowerCase()
          );
          if (duplicateIndex !== -1) {
            duplicateIndices.push(index);
          }
        });

        duplicateIndices.forEach(index => {
          newErrors.options[index] = 'Options should be different.';
          hasErrors = true;
        });
      }

      // 5. Check if correct answer matches any option
      if (correctAnswerText && !hasErrors) {
        const isCorrectAnswerPresentInValues = optionValues
          .map(value => value.toLowerCase())
          .includes(correctAnswerText.toLowerCase());

        if (!isCorrectAnswerPresentInValues) {
          newErrors.correctAnswer = 'Correct answer not present in options';
          hasErrors = true;
        }
      }

      // 6. Check if selected dropdown matches the correct answer text
      if (selectedOption && correctAnswerText && !hasErrors) {
        const selectedOptionText = optionValues[selectedIndex];
        if (selectedOptionText && selectedOptionText.toLowerCase() !== correctAnswerText.toLowerCase()) {
          newErrors.correctAnswer = 'Selected dropdown option does not match the correct answer text.';
          hasErrors = true;
        }
      }
    }

    // Validate sample answer
    const sampleAnswerTextarea = document.querySelector('[data-sample-answer-textarea]') as HTMLTextAreaElement;
    const updatedSampleAnswer = sampleAnswerTextarea?.value || '';
    if (!updatedSampleAnswer) {
      newErrors.sampleAnswer = 'Sample answer cannot be empty.';
      hasErrors = true;
    }

    // Validate key points
    const nonEmptyKeyPoints = keyPoints.filter(point => point.trim() !== '');
    if (nonEmptyKeyPoints.length === 0) {
      newErrors.keyPoints = ['At least one key point is required.'];
      hasErrors = true;
    }

    // Update validation errors state
    setValidationErrors(newErrors);

    // If validation passes, save changes and close dialog
    if (!hasErrors) {
      // Update the actual question data
      if (editQuestion && correctAnswerSelect && optionTextareas.length === 4 && (correctAnswerTextarea || correctAnswerEditor) && questionStemTextarea) {
        const updatedQuestionStem = questionStemTextarea.value.trim();
        const updatedOptions = Array.from(optionTextareas).map(textarea => textarea.value.trim());
        const selectedOption = correctAnswerSelect.value || 'A';
        const updatedCorrectAnswer = selectedOption + '. ' + (correctAnswerTextarea ? correctAnswerTextarea.value.trim() : (correctAnswerEditor?.innerHTML || '').trim());

        // Update the selected question object
        const updatedQuestion = {
          ...editQuestion,
          question: updatedQuestionStem,
          QuestionStatement: updatedQuestionStem,
          values: updatedOptions,
          options: updatedOptions,
          CorrectAnswer: updatedCorrectAnswer,
          answer: updatedCorrectAnswer,
          KeyPoints: nonEmptyKeyPoints.length > 0 ? nonEmptyKeyPoints : []
        };

        // Save to backend
        const saveToBackend = async () => {
          try {

            const payload = {
              ...updatedQuestion,
              id: updatedQuestion.id,
              questionrequestid: updatedQuestion.questionrequestid,
              question: updatedQuestionStem,
              type: updatedQuestion.type,
              options: updatedOptions,
              correct: updatedCorrectAnswer,
            };
            await updateQuestion(payload);

            // The stored validation result describes the question as it was before
            // this edit, so drop it and let Item Validate run again on the new content.
            await clearValidationForEditedQuestion(updatedQuestion);

            // Update local state
            setQuestions(prev => {
              const idx = prev.findIndex(q => q.id === updatedQuestion.id);
              if (idx === -1) return prev;
              const newArr = [...prev];
              newArr[idx] = { ...prev[idx], ...updatedQuestion };
              return newArr;
            });

            setEditOpen(false);
            setValidationErrors({ options: ['', '', '', ''], correctAnswer: '', questionStem: '', sampleAnswer: '', keyPoints: [] });
            // Always state what just happened: the dialog otherwise reuses whatever
            // message the previous action left behind.
            setSuccessMessage("Question updated successfully.");
            setShowSuccessDialog(true);
          } catch (e) {
            setShowErrorDialog(true);
          }
        };

        saveToBackend();
      }
    } else {
      // Auto-scroll to first error position
      setTimeout(() => {
        // Find the first error element and scroll to it
        let firstErrorElement = null;

        // Check question stem first
        if (!questionStemTextarea?.value.trim()) {
          firstErrorElement = questionStemTextarea;
        }
        // Then check options
        else {
          for (let i = 0; i < newErrors.options.length; i++) {
            if (newErrors.options[i]) {
              firstErrorElement = optionTextareas[i];
              break;
            }
          }
        }
        // Finally check correct answer
        if (!firstErrorElement && newErrors.correctAnswer) {
          firstErrorElement = correctAnswerEditor || correctAnswerTextarea || correctAnswerSelect;
        }
        // Check sample answer
        if (!firstErrorElement && newErrors.sampleAnswer) {
          firstErrorElement = sampleAnswerTextarea;
        }
        // Check key points
        if (!firstErrorElement && newErrors.keyPoints.length > 0) {
          firstErrorElement = document.querySelector('[data-key-points-container]');
        }

        if (firstErrorElement) {
          firstErrorElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
          firstErrorElement.focus();
        }
      }, 100); // Small delay to ensure DOM is updated with error messages
    }
  };

  // Real-time validation when correct answer dropdown changes
  const handleCorrectAnswerChange = (value: string) => {
    const correctAnswerTextarea = document.querySelector('[data-correct-answer-textarea]') as HTMLTextAreaElement;
    const correctAnswerEditor = document.querySelector('[data-correct-answer-editor]') as HTMLElement;
    const optionTextareas = document.querySelectorAll('[data-option-textarea]') as NodeListOf<HTMLTextAreaElement>;

    if ((correctAnswerTextarea || correctAnswerEditor) && optionTextareas.length === 4) {
      const selectedIndex = ['A', 'B', 'C', 'D'].indexOf(value);
      const optionValues = Array.from(optionTextareas).map(textarea => textarea.value.trim());
      const selectedOptionText = optionValues[selectedIndex];

      // Update the correct answer element with the selected option text
      if (selectedOptionText) {
        if (correctAnswerTextarea) {
          correctAnswerTextarea.value = selectedOptionText;
        } else if (correctAnswerEditor) {
          correctAnswerEditor.innerHTML = selectedOptionText;
        }
      }

      // Clear any existing validation errors for correct answer
      setValidationErrors(prev => ({
        ...prev,
        correctAnswer: '',
        questionStem: prev.questionStem || ''
      }));
    }
  };

  const [showErrorDialog, setShowErrorDialog] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteQuestionData, setDeleteQuestionData] = useState<{ id: string, questionrequestid: string } | null>(null);
  const [isDeletingQuestionValidated, setIsDeletingQuestionValidated] = useState(false);
  const [isCheckingDeleteValidation, setIsCheckingDeleteValidation] = useState(false);

  // Handler functions for dropdown actions


  const handleRateQuestion = (q: any) => {
    try {
      const qText = q?.question || q?.label || '';
      // Derive numeric question id
      const possibleId = q?.numericId ?? q?.questionid ?? q?.questionId ?? q?.id;
      const qId = possibleId !== undefined && possibleId !== null && !isNaN(Number(possibleId))
        ? Number(possibleId)
        : null;
      const qReqId = q?.questionrequestid !== undefined && q?.questionrequestid !== null && !isNaN(Number(q?.questionrequestid))
        ? Number(q?.questionrequestid)
        : null;

      // Pre-fill prior rating and feedback if available
      let prevRatingId = Number(q?.ratingid ?? q?.ratingId ?? q?.RatingId ?? q?.RatingID ?? 0);
      let prevRating: 'up' | 'down' | null = prevRatingId === 1 ? 'up' : prevRatingId === 2 ? 'down' : null;
      let prevFeedback = (
        q?.feedback ?? q?.rating_feedback ?? q?.ratingfeedback ?? q?.RatingFeedback ??
        q?.Feedback ?? q?.feedbackText ?? q?.FeedbackText ?? q?.feedback_text ??
        q?.feedbackdescription ?? q?.feedbackDescription ?? q?.FeedbackDescription ??
        q?.comments ?? q?.Remarks ?? ''
      ) as string;

      // Fallback to cached feedback if API doesn't include it
      try {
        const storageKey = `questionFeedback:${qReqId ?? 'null'}:${qId ?? 'null'}`;
        const cachedRaw = sessionStorage.getItem(storageKey);
        if ((!prevRating || !prevFeedback) && cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (!prevRating && (cached?.ratingid === 1 || cached?.ratingid === 2)) {
            prevRatingId = Number(cached.ratingid);
            prevRating = prevRatingId === 1 ? 'up' : 'down';
          }
          if (!prevFeedback && typeof cached?.feedback === 'string') {
            prevFeedback = cached.feedback;
          }
        }
      } catch { }

      const sanitizeFeedback = (val: string) => {
        const t = (val || '').trim();
        if (!t) return '';
        const looksLikeCode = /^[A-Za-z]{1,3}\d{1,4}$/.test(t);
        const hasSentenceHint = /[\s,.!?]/.test(t) && t.length >= 10;
        return looksLikeCode && !hasSentenceHint ? '' : t;
      };
      const prevFeedbackSan = sanitizeFeedback(prevFeedback);
      const readOnly = !!(prevRating && typeof prevFeedbackSan === 'string' && prevFeedbackSan.trim().length > 0);

      setSelectedQuestion(qText);
      setSelectedQuestionId(qId);
      setSelectedQuestionRequestId(qReqId);
      setQuestionRating(prevRating);
      setFeedbackText(typeof prevFeedbackSan === 'string' ? prevFeedbackSan : '');
      setIsFeedbackReadOnly(readOnly);
      setRatingDialogOpen(true);
      console.log('Rate/Feedback open:', { qId, qReqId, qText, prevRatingId, readOnly });
    } catch (e) {
      console.error('Failed to prepare rate question dialog:', e);
    }
  };

  // Helper function to check if a question was created today
  const isCreatedToday = (createdDate: string): boolean => {
    if (!createdDate || createdDate === 'N/A') return false;

    try {
      const created = new Date(createdDate);
      const today = new Date();

      return (
        created.getDate() === today.getDate() &&
        created.getMonth() === today.getMonth() &&
        created.getFullYear() === today.getFullYear()
      );
    } catch (error) {
      console.error('Error parsing date:', error);
      return false;
    }
  };

  const handleCheckSimilarity = (questionText: string) => {
    console.log('Check similarity:', questionText);
    // TODO: Implement check similarity functionality
  };

  const handleOpenRefinement = (question: any) => {
    resetRefinementForm();
    console.log('Question refinement:', question);
    setSelectedQuestionForRefinement(question);

    // Check if question is Non-English and set Language Conversion as default
    const quesOrigin = question?.quesOrigin;
    // If originallanguage is null or English, treat as English type question, else Non-English
    if (quesOrigin && quesOrigin !== 'English' && quesOrigin !== 'en') {
      setRefinementType('Language Conversion');
    }

    // Set default values from the selected question
    if (question) {
      const pick = (val: string, list: string[], fallback: string) =>
        list.find((x: string) => x.toLowerCase() === String(val).toLowerCase()) || fallback || list[0];

      // Map question type (distinguish Multiple Response vs Multiple Choice)
      const qt = String(question.type || question.questiontype || 'Multiple Choice').toLowerCase();
      let matchedType = 'Multiple Choice';
      if (qt.includes('multiple response')) matchedType = 'Multiple Response';
      else if (qt.includes('multiple choice') || (qt.includes('multiple') && !qt.includes('response'))) matchedType = 'Multiple Choice';
      else if (qt.includes('written')) matchedType = 'Written Response';
      else if (qt.includes('true')) matchedType = 'True False';
      else if (qt.includes('matrix')) matchedType = 'Matrix';
      else if (qt.includes('fill') || qt.includes('blank')) matchedType = 'Fill In the Blank';

      setRefinementQuestionType(pick(matchedType, questionTypes, matchedType));

      // Map taxonomy
      const tax = String(question.taxonomy || '').toLowerCase();
      let matchedTax = 'Remember';
      if (tax.includes('remember')) matchedTax = 'Remember';
      else if (tax.includes('understand')) matchedTax = 'Understand';
      else if (tax.includes('apply')) matchedTax = 'Apply';
      else if (tax.includes('analyze')) matchedTax = 'Analyze';
      else if (tax.includes('evaluate')) matchedTax = 'Evaluate';
      else if (tax.includes('create')) matchedTax = 'Create';

      setRefinementTaxonomy(pick(matchedTax, taxonomyList, matchedTax));

      // Map creativity level
      const cr = String(question.creativitylevelname || 'Moderate').toLowerCase();
      let matchedCr = 'Moderate';
      if (cr.includes('very high')) matchedCr = 'Very High';
      else if (cr.includes('high')) matchedCr = 'High';
      else if (cr.includes('moderate')) matchedCr = 'Moderate';
      else if (cr.includes('low')) matchedCr = 'Low';

      setRefinementCreativity(pick(matchedCr, CreativityLevel, matchedCr));

      // Set source type
      const source = question.source || '';
      if (source.toLowerCase().includes('book')) {
        setRefinementSourceType('Book Based');
      } else {
        setRefinementSourceType('LLM');
      }
    }

    setRefinementDialogOpen(true);
  };

  const handleSubmitFeedback = async () => {
    console.log("Submitting feedback:", {
      question: selectedQuestion,
      questionid: selectedQuestionId,
      questionrequestid: selectedQuestionRequestId,
      rating: questionRating,
      feedback: feedbackText
    });

    if (selectedQuestionId == null || selectedQuestionRequestId == null) {
      console.error('Missing IDs for UpdateFeedback', {
        selectedQuestionId,
        selectedQuestionRequestId
      });
      return;
    }

    // Allow submit when only feedback is provided (no rating)
    if (!questionRating && (!feedbackText || feedbackText.trim().length === 0)) {
      console.error('Nothing to submit: neither rating nor feedback provided');
      return;
    }

    const ratingId = questionRating === 'up' ? 1 : questionRating === 'down' ? 2 : 0;

    setIsSubmittingFeedback(true);

    try {

      const payload = {
        questionid: selectedQuestionId,
        questionrequestid: selectedQuestionRequestId,
        ratingid: ratingId,
        feedback: feedbackText
      };

      const response = await axios.post(`${AIG_QUIZ_GEN_URL}/UpdateFeedback`, payload);

      if (response.data.status?.[0]?.[0] === 'S001') {
        console.log('Feedback submitted successfully!');
        // Optimistically update local state so UI reflects the change immediately
        setQuestions(prev => prev.map(q => {
          const qNumeric = q.numericId !== undefined && q.numericId !== null ? Number(q.numericId) : null;
          const match = (qNumeric !== null && selectedQuestionId !== null && qNumeric === selectedQuestionId) ||
            (q.id !== undefined && selectedQuestionId !== null && Number(q.id) === selectedQuestionId);
          if (match) {
            return { ...q, ratingid: ratingId, feedback: feedbackText, rating_feedback: feedbackText };
          }
          return q;
        }));
        // Persist to sessionStorage so prefill works even if API doesn't return feedback
        try {
          const storageKey = `questionFeedback:${selectedQuestionRequestId ?? 'null'}:${selectedQuestionId ?? 'null'}`;
          sessionStorage.setItem(storageKey, JSON.stringify({ ratingid: ratingId, feedback: feedbackText }));
        } catch { }
        clearFilters();
        await fetchData();

        // Show success message
        setSuccessMessage("Feedback submitted successfully.");
        setShowSuccessDialog(true);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmittingFeedback(false);
      setRatingDialogOpen(false);
    }
  };

  const handleDelete = async (id: string, questionrequestid: string) => {
    setDeleteQuestionData({ id, questionrequestid });
    setIsCheckingDeleteValidation(true);
    setIsDeletingQuestionValidated(false);

    try {
      const q = questions.find(q => q.id === id);
      if (q) {
        const itemCode = await resolveValidationItemCode(q);
        if (itemCode) {
          const run = await findValidationItemRun(itemCode);
          if (run) {
            setIsDeletingQuestionValidated(true);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to check if question is validated before delete", e);
    } finally {
      setIsCheckingDeleteValidation(false);
      setShowDeleteDialog(true);
    }
  };

  const confirmDelete = async () => {
    setShowDeleteDialog(false);
    if (!deleteQuestionData) return;

    const { id, questionrequestid } = deleteQuestionData;
    let usercode = "Adm488";
    try {
      const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
      usercode = userInfo.userCode || "";
    } catch { }
    // Find the question object to get the numericId
    const q = questions.find(q => q.id === id);
    const questionid = q && q.numericId ? Number(q.numericId) : Number(id);
    const input = {
      questionid: questionid,
      questionrequestid: Number(questionrequestid),
      usercode: usercode,
    };

    try {
      if (q) {
        let itemCode = getDirectQuestionItemCode(q);
        let itemId = String(q.numericId || q.id || '');

        if (!itemCode) {
          const orgcode = sessionStorage.getItem('orgcode') || sessionStorage.getItem('orgCode') || '';
          const custcode = sessionStorage.getItem('custcode') || sessionStorage.getItem('customerCode') || '';
          if (orgcode && custcode && questionrequestid) {
            const response = await axios.get(`${AIG_QUIZ_GEN_URL}/get-itemvalidation-data`, {
              params: { orgcode, custcode, questionrequestid: questionrequestid }
            });
            const items = parseValidationItemsResponse(response.data);
            const lookupKeys = getQuestionLookupKeys(q);
            const matchedItem = items.find((item: any) => {
              const itId = Array.isArray(item) ? item[1] : item?.itemid ?? item?.itemId;
              const itCode = Array.isArray(item) ? item[7] : item?.itemcode ?? item?.itemCode;
              return lookupKeys.includes(String(itId ?? '').trim()) || lookupKeys.includes(String(itCode ?? '').trim());
            });
            if (matchedItem) {
              itemCode = String(Array.isArray(matchedItem) ? matchedItem[7] : matchedItem?.itemcode ?? matchedItem?.itemCode ?? '');
              itemId = String(Array.isArray(matchedItem) ? matchedItem[1] : matchedItem?.itemid ?? matchedItem?.itemId ?? itemId);
            }
          }
        }

        if (itemCode) {
          try {
            const token = await getItemValidationApiAuthToken();
            await fetch(`${ITEM_VALIDATION_API_URL}/ItemValidation/DeleteItemValidationAnalysisResponse`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ itemId: "", itemCode })
            });
          } catch (err) {
            console.warn("Failed to call DeleteItemValidationAnalysisResponse", err);
          }

          try {
            const token = await getItemValidationApiAuthToken();
            await fetch(`${ITEM_VALIDATION_API_URL}/ItemValidation/DeleteItemData`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ itemCode, itemId: "" })
            });
          } catch (err) {
            console.warn("Failed to call DeleteItemData", err);
          }
        }
      }
    } catch (e) {
      console.warn("Error calling validation delete APIs", e);
    }

    try {
      const result = await deleteQuestion(input);
      if (result === true) {
        // Reset filters so a reload doesn't carry previous selections
        clearFilters();
        await fetchData(); // Refresh data from backend after delete
        setShowDeleteDialog(false);
        setDeleteQuestionData(null);
        setSuccessMessage("Question deleted successfully.");
        setShowSuccessDialog(true);
      } else {
        setShowDeleteDialog(false);
        setDeleteQuestionData(null);
        setShowErrorDialog(true);
      }
    } catch (error) {
      setShowDeleteDialog(false);
      setDeleteQuestionData(null);
      setShowErrorDialog(true);
    }
  };

  const getCreativityLevelColor = (creativityLevel: string) => {
    switch (creativityLevel) {
      case "Moderate":
        return "bg-blue-100 text-blue-800";
      case "High":
        return "bg-purple-100 text-purple-800";
      case "Very High":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRatingColor = (rating: string) => {
    switch (rating.toLowerCase()) {
      case "good":
        return "bg-green-100 text-green-800";
      case "poor":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };


  const handleSelectQuestion = (questionId: string) => {
    //console.log('[QuestionRepository] handleSelectQuestion called with:', questionId);
    //console.log('[QuestionRepository] Current selectedQuestions:', selectedQuestions);
    setSelectedQuestions((prev) => {
      const newSelection = prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId];
      //console.log('[QuestionRepository] New selectedQuestions:', newSelection);
      return newSelection;
    });
  };

  /**
   * The question's own database id, which the similarity APIs work with. The number
   * after "_ID" in the identifier is not always the same value, so the row's own
   * column wins and the identifier is only a fallback.
   */
  const resolveSimilarityQuestionId = (question: any): number | null => {
    const candidates = [
      question?.similarityQuestionId,
      question?.questionid,
      question?.questionId,
      String(question?.id || '').split('_ID')[1],
      question?.numericId,
    ];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value > 0) return value;
    }
    return null;
  };

  // Opens the Check Similarity page for one question. Shared by the similarity
  // icon and by "Check Similarity" in the row menu, so both pass the same thing.
  const openSimilarityPage = (question: any) => {
    navigate('/check-similarity', {
      state: {
        question: {
          questiondata: question,
          identifier: question.id,
          text: question.question,
          type: question.type,
          values: question.values,
          userName: question.userName || question.userCode || question.createdBy,
          // The database id, so the page does not have to read it out of the identifier.
          questionNumericId: resolveSimilarityQuestionId(question),
        }
      }
    });
  };

  /**
   * Check Similarity for one question (the row menu). A question saved today has
   * no similarity yet — the batch job has not reached it — so this asks the server
   * to work it out for that question alone. It only calls call_similarity_api; the
   * results are viewed afterwards through the row's Similarity icon, which reads
   * them with get_similarity_data as it always has.
   *
   * Like Item Validate and Item Metadata, the popup can be closed straight away and
   * the check carries on in the background.
   */
  const handleSingleSimilarity = async (question: any) => {
    const rowKey = String(question?.id ?? '');
    const questionid = resolveSimilarityQuestionId(question);
    if (!questionid) {
      window.alert('Could not check similarity: this question has no database id.');
      return;
    }

    // Same session values the question list itself is fetched with.
    const session = (key: string) => {
      try { return sessionStorage.getItem(key) || ""; } catch { return ""; }
    };
    let userInfo: any = {};
    try { userInfo = JSON.parse(session("userInfo") || "{}") || {}; } catch { userInfo = {}; }
    const custcode = session("custcode") || userInfo.customerCode || userInfo.custCode || "";
    const orgcode = session("orgcode") || userInfo.orgCode || userInfo.organizationCode || "";
    const appcode = session("appcode") || "AIG";
    const booknameid = session("bookType") || session("booknameid") || session("bookid") || "";

    setSimilarityRunningIds(prev => new Set(prev).add(rowKey));
    setSimilarityStatusStr("Running");
    setSimilarityErrorStr("");
    setShowSimilarityProgressDialog(true);
    try {
      const response = await fetch(CALL_SIMILARITY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionid, custcode, orgcode, appcode, booknameid }),
      });
      const result = await response.json().catch(() => ({}));
      // A 200 means the similarity was worked out and stored. The body looks like
      // { status: "success", data: { question_id, stem_similarity, stem_option_similarity } }.
      const reported = String(result?.status || "").toLowerCase();
      const serverMessage = String(result?.message || result?.error || "");

      // The server answers 404 "not found or below similarity threshold" when the
      // question simply has nothing similar enough. That is an answer, not a failure,
      // but there is nothing to open either.
      if (response.status === 404 && /threshold/i.test(serverMessage)) {
        setSimilarityStatusStr("Empty");
        setSimilarityErrorStr(serverMessage);
        setShowSimilarityProgressDialog(true);
        return;
      }

      if (!response.ok || reported === "error" || reported === "failed" || reported === "failure") {
        throw new Error(serverMessage || `Request failed (status: ${response.status})`);
      }

      // The icon is disabled for questions saved today; once this has run there is
      // something to show, so it becomes available for this row.
      markSimilarityReady(rowKey);
      setSimilarityStatusStr("Completed");
      // The check runs in the background, so the popup may have been closed and the
      // user may be doing something else. Bring it back with the result.
      setShowSimilarityProgressDialog(true);
    } catch (e: any) {
      console.error('Check similarity failed:', e);
      setSimilarityStatusStr("Failed");
      setSimilarityErrorStr(e?.message || "The request failed.");
      setShowSimilarityProgressDialog(true);
    } finally {
      setSimilarityRunningIds(prev => {
        const next = new Set(prev);
        next.delete(rowKey);
        return next;
      });
    }
  };

  // Single Metadata: generate/apply item meta data for one question
  const handleSingleMetadata = async (question: any) => {
    console.log('Single Metadata for question:', question);

    // Runs like Item Validate: only this row is marked busy, so the list stays
    // usable instead of sitting behind the full-page loader until the LLM answers.
    setMetadataGeneratingIds(prev => new Set(prev).add(question.id));
    setMetadataStatusStr("Running");
    setShowMetadataProgressDialog(true);
    try {
      const orgcode = sessionStorage.getItem('orgcode') || "VTCT01";
      const custcode = sessionStorage.getItem('custcode') || "VTCT";
      const usercode = sessionStorage.getItem('userCode') || "";

      // kbid comes from the question itself (loaded from item[23]); never hardcoded.
      const kbid = String(question?.kbid ?? "").trim();

      const payload = {
        custcode: custcode,
        orgcode: orgcode,
        questionrequestid: question.questionrequestid?.toString() || "",
        metadatatype: 1,
        usercode: usercode,
        kbid: kbid
      };

      const response = await axios.post(`${AIG_QUIZ_GEN_URL}/generate-item-metadata`, payload);
      let apiMetadatajson: any = null;
      if (response.data && Array.isArray(response.data.results) && response.data.results.length > 0) {
        const itemRes = response.data.results[0];
        if (itemRes && itemRes.metadatajson) {
          apiMetadatajson = itemRes.metadatajson;
          setQuestions(prev => prev.map(q => q.id === question.id ? { ...q, metadata: apiMetadatajson } : q));
        }
      }

      // The response carries the metadata for this question, so only its row is
      // updated (above). Reloading the whole list would also drop the 'value' fields,
      // since the stored copy holds the reason text only.
      setMetadataStatusStr(apiMetadatajson ? "Completed" : "Failed");
    } catch (err) {
      console.error('Error generating single metadata:', err);
      setMetadataStatusStr("Failed");
    } finally {
      setMetadataGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(question.id);
        return next;
      });
    }
  };

  // Bulk Metadata: generate/apply item meta data for questions
  const executeBulkMetadata = async (targetQuestionIds?: string[]) => {
    const ids = targetQuestionIds && targetQuestionIds.length > 0 ? targetQuestionIds : selectedQuestions;
    console.log('Bulk Metadata for questions:', ids);
    if (!ids || ids.length === 0) {
      return;
    }

    // Filter out questions that already have metadata
    const selectedQuestionObjects = questions.filter(q =>
      ids.includes(q.id) &&
      !(q.metadata && parseQuestionMetadata(q.metadata).length > 0)
    );

    if (selectedQuestionObjects.length === 0) {
      setSuccessMessage(ids.length === questions.length ? "All questions already have metadata." : "All selected questions already have metadata.");
      setShowSuccessDialog(true);
      setSelectedQuestions([]); // Clear selection
      return;
    }

    setLoadingMessage(`Generating metadata for ${selectedQuestionObjects.length} questions...`);
    setLoading(true);
    try {
      const orgcode = sessionStorage.getItem('orgcode') || "VTCT01";
      const custcode = sessionStorage.getItem('custcode') || "VTCT";
      const usercode = sessionStorage.getItem('userCode') || "";

      // Pass every selected question that has no metadata as a comma-separated list of questionrequestids
      const questionRequestIds = Array.from(new Set(
        selectedQuestionObjects
          .map(q => q.questionrequestid?.toString()?.trim())
          .filter(Boolean)
      )).join(",");

      // kbid comes from the questions themselves (loaded from item[23]); never hardcoded.
      // De-duplicated and comma-joined, matching how questionrequestid is passed above.
      const kbids = Array.from(new Set(
        selectedQuestionObjects
          .map(q => String(q?.kbid ?? "").trim())
          .filter(Boolean)
      )).join(",");

      const payload = {
        custcode: custcode,
        orgcode: orgcode,
        questionrequestid: questionRequestIds,
        metadatatype: 1,
        usercode: usercode,
        kbid: kbids
      };

      const response = await axios.post(`${AIG_QUIZ_GEN_URL}/generate-item-metadata`, payload);
      let apiResultMap: Map<string, any> = new Map();
      if (response.data && Array.isArray(response.data.results) && response.data.results.length > 0) {
        apiResultMap = new Map(response.data.results.map((r: any) => [r.itemid?.toString(), r.metadatajson]));
        setQuestions(prev => prev.map(q => {
          const meta = apiResultMap.get(q.id?.toString()) || apiResultMap.get(q.numericId?.toString()) || apiResultMap.get(q.questionrequestid?.toString());
          return meta ? { ...q, metadata: meta } : q;
        }));
      }

      // Refresh from DB, then re-apply API metadata so the correct 'value' field is preserved
      await fetchData();
      if (apiResultMap.size > 0) {
        setQuestions(prev => prev.map(q => {
          const meta = apiResultMap.get(q.id?.toString()) || apiResultMap.get(q.numericId?.toString()) || apiResultMap.get(q.questionrequestid?.toString());
          return meta ? { ...q, metadata: meta } : q;
        }));
      }

      setSuccessMessage(`Metadata generated successfully for ${selectedQuestionObjects.length} questions.`);
      setShowSuccessDialog(true);
      setSelectedQuestions([]); // Clear selection after success
    } catch (err) {
      console.error('Error generating bulk metadata:', err);
      setShowErrorDialog(true);
    } finally {
      setSelectedQuestions([]); // Clear selection unconditionally
      setLoading(false);
      setLoadingMessage("Loading questions...");
    }
  };

  const handleBulkMetadata = async () => {
    if (selectedQuestions.length === 0) {
      setShowBulkMetadataConfirmDialog(true);
      return;
    }
    return executeBulkMetadata(selectedQuestions);
  };

  // Export to Word (Results-style): robust formatting and cross-browser save
  const handleExportToWord = async () => {
    try {
      const docxModule = await import('docx').then(m => m);
      const { Document, Packer, HeadingLevel } = docxModule;
      const DocxParagraph = docxModule.Paragraph;
      // Question text can carry virtual-keyboard HTML or LaTeX; written to the
      // document verbatim it renders as junk characters. Every paragraph built
      // from a plain string is normalised to readable notation first.
      const Paragraph: any = function (options: any) {
        if (typeof options === 'string') return new DocxParagraph(toExportText(options));
        if (options && typeof options === 'object' && typeof options.text === 'string') {
          return new DocxParagraph({ ...options, text: toExportText(options.text) });
        }
        return new DocxParagraph(options);
      };
      const { saveAs } = await import('file-saver');
      const { format } = await import('date-fns');

      // Passage Type is filtered client-side, so exporting `questions` shipped every
      // fetched row and ignored the filter. Export exactly what the table shows.
      let results: any[] = selectedQuestions.length > 0
        ? displayedQuestions.filter(q => selectedQuestions.includes(q.id))
        : displayedQuestions;
      results = Array.isArray(results) ? results.filter(Boolean) : [];
      if (!results.length) {
        window.alert('No questions to export.');
        return;
      }

      let bookTitle = sessionStorage.getItem('bookTitle') || 'questions';
      bookTitle = bookTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');

      // Load every attached image up front — the render loop below is synchronous.
      // Manually added images are blob URLs rather than data URIs, and used to be
      // written as a bare URL instead of being embedded in the document.
      const loadedImages = new Map<string, any>();
      for (const src of Array.from(new Set(results.flatMap((q: any) => collectQuestionImages(q))))) {
        const img = await loadExportImage(src as string);
        if (img) loadedImages.set(src as string, img);
      }

      const docChildren: any[] = [
        // new Paragraph({ text: 'Generated Questions', heading: HeadingLevel.HEADING_1 })
      ];

      results.forEach((q: any, idx: number) => {
        const cleanStemText = getCleanStem(q);
        const stem = formatStemForExport(cleanStemText);
        const isMatrix = q?.type?.toLowerCase()?.includes('matrix') || (Array.isArray(q?.rows) && Array.isArray(q?.columns));
        const isSelectBlank = isFillBlankDropdownQuestion(q) || (q?.type?.toLowerCase()?.includes('select') && q?.type?.toLowerCase()?.includes('blank'));
        const options = formatOptionsForExport(Array.isArray(q.values) ? q.values : (Array.isArray(q.options) ? q.options : []));
        const cleanOption = (opt: any) => {
          const s = typeof opt === 'string' ? opt : (opt?.text || opt?.value || '');
          return formatForExport(String(s).replace(/^[A-Z][\.,)]\s*/, '').trim());
        };
        // Build dynamic feedbacks array to handle any number of options
        const feedbacks = [];
        const feedbackLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let i = 0; i < options.length; i++) {
          const feedbackKey = `FeedbackOption${feedbackLetters[i]}`;
          feedbacks.push(formatFeedbackForExport(q[feedbackKey] || ''));
        }
        const correctAnswerRaw = q.CorrectAnswer ?? q.answer ?? '';
        const correctAnswer = Array.isArray(correctAnswerRaw) ? correctAnswerRaw.join(', ') : String(correctAnswerRaw);
        const maxMarks = q.MaxMarks ?? q.marks ?? q.Marks ?? 1;
        const generatedImageUrl = resolveQuestionImageUrl(q);
        const type = isMatrix ? 'Matrix' :
          (isSelectBlank ? 'Select the Blank' :
            (q?.type?.toLowerCase()?.includes('fill') || /_{3,}/.test(stem) || /\[\s*blank\s*\]/i.test(stem)) ? 'Fill In the Blank' :
              (q?.type?.toLowerCase()?.includes('true')) ? 'True False' :
                (q?.type?.toLowerCase()?.includes('multiple response')) ? 'Multiple Response' :
                  (options.length ? 'Multiple Choice' : 'Written Response'));

        // Build paragraphs for this question in the required format
        const taxonomyid = q.taxonomy == "Remember" ? 1 : q.taxonomy == "Understand" ? 2 : q.taxonomy == "Apply" ? 3 : q.taxonomy == "Analyze" ? 4 : q.taxonomy == "Evaluate" ? 5 : q.taxonomy == "Create" ? 6 : 0;
        const bookIdentifier = sessionStorage.getItem('bookIdentifier') || 'IG_V2025';
        const identifier = q.id;
        const creativity = (q.creativitylevelname || q.creativity || sessionStorage.getItem('creativitylevelname') || 'Moderate').toString();

        // Passages and Table Analysis support
        const passageTabs = getQuestionTabs(q);
        if (passageTabs.length > 0) {
          passageTabs.forEach((tab: any, tIdx: number) => {
            const tTitle = getTabTitle(tab, tIdx);
            const tPassage = formatQuestionTextForWord(getTabPassage(tab));
            docChildren.push(new Paragraph(`Passage ${tIdx + 1}${tTitle ? ` (${tTitle})` : ''}: ${tPassage}`));
          });
        }
        const tableData = getTableAnalysis(q);
        if (tableData && Array.isArray(tableData.Columns) && Array.isArray(tableData.Rows) && tableData.Columns.length > 0) {
          docChildren.push(new Paragraph('Reference Table:'));
          try {
            // Cell text is centred so the exported table matches the on-screen one,
            // which centres every header and cell.
            const centeredCell = (text: string) => new DocxTableCell({
              children: [new Paragraph({ text, alignment: AlignmentType.CENTER })],
              verticalAlign: VerticalAlign.CENTER,
            });
            const headerRow = new DocxTableRow({
              children: tableData.Columns.map((col: any) => centeredCell(formatQuestionTextForWord(String(col))))
            });
            const dataRows = tableData.Rows.map((r: any[]) => new DocxTableRow({
              children: r.map((c: any) => centeredCell(formatQuestionTextForWord(String(c))))
            }));
            docChildren.push(new DocxTable({
              rows: [headerRow, ...dataRows],
              // Full-width fixed layout with visible borders — the
              // default auto layout produced misaligned columns in Word.
              width: { size: 100, type: 'pct' },
              layout: 'fixed',
              borders: DOCX_TABLE_BORDERS
            }));
          } catch (err) {
            console.error('Error constructing DocxTable:', err);
          }
        }

        // Required format fields
        docChildren.push(new Paragraph(`Type: ${type}`));
        docChildren.push(new Paragraph(`Title: ${identifier}`));
        docChildren.push(new Paragraph(`Marks: ${maxMarks}`));
        // Format question text with enhanced fraction support
        const questionText = formatQuestionTextForWord(cleanStemText);
        docChildren.push(new Paragraph(`${idx + 1}. ${questionText}`));
        // Embed every attached image, whether AI generated (data URI) or manually
        // added (blob URL).
        collectQuestionImages(q).forEach((src: string) => {
          const embedded = loadedImages.get(src);
          if (embedded) {
            // Scale to fit the box while keeping the picture's own proportions —
            // a fixed box stretched anything that was not exactly that shape.
            docChildren.push(new Paragraph({
              children: [
                new ImageRun({
                  data: embedded.bytes,
                  type: embedded.extension,
                  transformation: fitWithin(embedded, 320, 240),
                })
              ]
            }));
          } else {
            // The bytes could not be read (the blob container sends no CORS header).
            // Emit a short clickable link rather than a wall of raw URL text.
            docChildren.push(new DocxParagraph({
              children: [
                new TextRun('Generated Image: '),
                new docxModule.ExternalHyperlink({
                  link: src,
                  children: [new TextRun({ text: 'View image', style: 'Hyperlink' })],
                }),
              ],
            }));
          }
        });

        if (isMatrix) {
          // Matrix table creation
          const parseJsonArray = (jsonStr: any) => {
            if (Array.isArray(jsonStr)) return jsonStr;
            if (typeof jsonStr === 'string') {
              try {
                const parsed = JSON.parse(jsonStr);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            }
            return [];
          };
          let rows: any[] = parseJsonArray(q.rows);
          let cols: any[] = parseJsonArray(q.columns);

          // Filter out hidden or empty rows/columns
          const isVisible = (node: any) => {
            const hidden = Boolean(node?.hidden || node?.isHidden);
            const explicitlyInvisible = node?.visible === false;
            const label = String(node?.text ?? node?.value ?? '').trim();
            return !hidden && !explicitlyInvisible && label.length > 0;
          };
          rows = rows.filter(isVisible);
          cols = cols.filter(isVisible);

          if (rows.length > 0 && cols.length > 0) {
            const matrixAnswers: any[] = parseJsonArray(q.answers).length > 0 ? parseJsonArray(q.answers) : parseJsonArray(q.CorrectAnswer);
            // const instruction = q.instruction || q.PartPrompt || '';
            // if (instruction) {
            //   docChildren.push(new Paragraph(`Instruction: ${instruction}`));
            // }

            // Create table header
            const headerRow = new DocxTableRow({
              children: [
                new DocxTableCell({ children: [new Paragraph('')] }),
                ...cols.map((c: any) => new DocxTableCell({ children: [new Paragraph(String(c?.text ?? c?.value ?? ''))] }))
              ]
            });

            // Create table rows with right marks
            const tableRows = rows.map((r: any, ri: number) => {
              const rowLabel = String(r?.text ?? r?.value ?? '');
              const cells = cols.map((c: any, ci: number) => {
                let checked = false;
                const ans = matrixAnswers[ri];
                if (typeof ans === 'number') {
                  checked = ans === ci;
                } else if (typeof ans === 'string') {
                  checked = ans.trim().toLowerCase() === String(c?.text ?? c?.value ?? '').trim().toLowerCase();
                } else if (ans && typeof ans === 'object') {
                  const aCi = Number(ans.colIndex ?? ans.columnIndex ?? ans.ci);
                  const aRi = Number(ans.rowIndex ?? ans.ri);
                  if (!Number.isNaN(aCi) && !Number.isNaN(aRi)) {
                    checked = aRi === ri && aCi === ci;
                  }
                }
                return new DocxTableCell({ children: [new Paragraph(checked ? '✔' : '')] });
              });
              return new DocxTableRow({ children: [new DocxTableCell({ children: [new Paragraph(rowLabel)] }), ...cells] });
            });

            // Add table to document
            docChildren.push(new DocxTable({
              rows: [headerRow, ...tableRows],
              // Full-width fixed layout with visible borders — the
              // default auto layout produced misaligned columns in Word.
              width: { size: 100, type: 'pct' },
              layout: 'fixed',
              borders: DOCX_TABLE_BORDERS
            }));

            // Add this right after the Matrix table creation (around line 1440, after the table is created)
            if (matrixAnswers && matrixAnswers.length > 0) {
              docChildren.push(new Paragraph('Correct Answers:'));
              const answerLines = rows.map((r: any, ri: number) => {
                const rowLabel = String(r?.text ?? r?.value ?? '');
                const answer = matrixAnswers[ri];
                let answerText = 'No answer';

                if (answer !== undefined && answer !== null) {
                  if (typeof answer === 'number' && cols[answer]) {
                    answerText = String(cols[answer]?.text ?? cols[answer]?.value ?? '');
                  } else if (typeof answer === 'string') {
                    answerText = answer;
                  } else if (answer && typeof answer === 'object') {
                    const aCi = Number(answer.colIndex ?? answer.columnIndex ?? answer.ci);
                    if (!isNaN(aCi) && cols[aCi]) {
                      answerText = String(cols[aCi]?.text ?? cols[aCi]?.value ?? '');
                    }
                  }
                }

                return ` ${rowLabel} => ${answerText}`;
              });

              answerLines.forEach(line => docChildren.push(new Paragraph(line)));
            }

            // Add feedbacks if any
            try {
              const fbsArr: string[] = Array.isArray(q.Feedbacks)
                ? q.Feedbacks
                : (Array.isArray((q as any).feedbacks) ? (q as any).feedbacks : []);
              const clean = fbsArr.map(f => String(f || '').trim()).filter(Boolean);
              if (clean.length) {
                docChildren.push(new Paragraph('Feedbacks:'));
                clean.forEach(f => docChildren.push(new Paragraph(`• ${f}`)));
              }
            } catch { }
          }
        } else if (options.length && type !== 'Fill In the Blank') {
          docChildren.push(new Paragraph('Options:'));
          // Build normalized option core texts (without leading labels like "A. ")
          const optionCore: string[] = options.map((opt) => cleanOption(opt).toLowerCase());
          // Build a robust set of correct letters (A-J) covering Multiple Response formats
          const correctSet: Set<string> = (() => {
            const letters = 'ABCDEFGHIJ';
            // Matrix handled in previous branch; here we consider MC/MR
            // Normalize ItemScoring and marks from possible JSON strings
            const itemScoring = (() => {
              try {
                if (typeof q?.ItemScoring === 'string') return JSON.parse(q.ItemScoring);
                return q?.ItemScoring || {};
              } catch { return q?.ItemScoring || {}; }
            })();
            const markingStr: string = typeof itemScoring?.Marking === 'string' ? itemScoring.Marking : '';
            const marksObj: any = (() => {
              try {
                if (typeof q?.marks === 'string') return JSON.parse(q.marks);
                return (q as any)?.marks && typeof (q as any).marks === 'object' ? (q as any).marks : null;
              } catch { return null; }
            })();
            // Determine MR using multiple signals (not just the type label)
            const isMR = (
              type === 'Multiple Response' ||
              Array.isArray(correctAnswerRaw) ||
              (typeof markingStr === 'string' && String(markingStr).split(',').map(s => s.trim()).filter(Boolean).length > 1) ||
              (marksObj && typeof marksObj === 'object' && Object.values(marksObj).filter((v: any) => Number(v) > 0).length > 1) ||
              (typeof correctAnswer === 'string' && correctAnswer.includes(','))
            );
            // Fast path for Multiple Response
            if (isMR) {
              // Case 1: CorrectAnswer provided as array
              if (Array.isArray(correctAnswerRaw)) {
                const arr = correctAnswerRaw as any[];
                const set = new Set<string>();
                arr.forEach((item) => {
                  // Support boolean arrays [true,false,true]
                  if (typeof item === 'boolean') {
                    // will handle after loop by index mapping
                    return;
                  }
                  if (typeof item === 'string') {
                    const s = String(item).trim();
                    // Leading letter e.g. "A" or "A. ..."
                    const L = (s.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase();
                    if (L) { set.add(L); return; }
                    // Numeric index (1-based or 0-based) as string
                    if (/^\d+$/.test(s)) {
                      const n = Number(s);
                      const idx = n > 0 ? n - 1 : n; // accept 1-based
                      if (idx >= 0 && idx < optionCore.length) set.add(letters[idx]);
                      return;
                    }
                    // Match by option text
                    const idxTxt = optionCore.findIndex((o) => o === s.replace(/^[A-Ja-j][\.)]\s*/, '').toLowerCase());
                    if (idxTxt >= 0) set.add(letters[idxTxt]);
                    return;
                  }
                  if (typeof item === 'number' && isFinite(item)) {
                    const idx = item > 0 && item % 1 === 0 ? item - 1 : item; // accept 1-based ints
                    if (idx >= 0 && idx < optionCore.length) set.add(letters[idx]);
                  }
                });
                // If it was a boolean array, map truthy indices as correct
                if (set.size === 0 && arr.some(v => typeof v === 'boolean')) {
                  arr.forEach((v, i) => { if (v) set.add(letters[i]); });
                }
                if (set.size) return set;
              }
              // Case 2: ItemScoring.Marking has comma-separated letters
              const marking = markingStr;
              if (typeof marking === 'string') {
                const set = new Set<string>(
                  marking
                    .split(',')
                    .map((s: string) => s.trim().replace(/\.$/, ''))
                    .map((s: string) => (s.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase())
                    .filter(Boolean)
                );
                if (set.size) return set;
              }
              // Case 2b: ItemScoring.Marking as array JSON
              try {
                const parsedMarking = Array.isArray(itemScoring?.Marking) ? itemScoring.Marking : (typeof itemScoring?.Marking === 'string' && itemScoring.Marking.trim().startsWith('[') ? JSON.parse(itemScoring.Marking) : null);
                if (Array.isArray(parsedMarking)) {
                  const set = new Set<string>();
                  parsedMarking.forEach((m: any) => {
                    if (typeof m === 'string') {
                      const L = (m.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase();
                      if (L) set.add(L);
                    } else if (typeof m === 'number' && isFinite(m)) {
                      const idx = m > 0 ? m - 1 : m;
                      if (idx >= 0 && idx < optionCore.length) set.add(letters[idx]);
                    }
                  });
                  if (set.size) return set;
                }
              } catch { }
              // Case 3: marks object with positive scores per letter
              if (marksObj && typeof marksObj === 'object') {
                const entries = Object.entries(marksObj).filter(([k, v]) => Number(v) > 0);
                if (entries.length) {
                  return new Set(entries.map(([k]) => String(k).toUpperCase()));
                }
              }
              // Case 4: Single string containing letters/indices separated by commas
              if (typeof correctAnswer === 'string' && correctAnswer.includes(',')) {
                const set = new Set<string>();
                correctAnswer.split(',').map(s => s.trim()).forEach((part) => {
                  const L = (part.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase();
                  if (L) { set.add(L); return; }
                  if (/^\d+$/.test(part)) {
                    const n = Number(part);
                    const idx = n > 0 ? n - 1 : n;
                    if (idx >= 0 && idx < optionCore.length) set.add(letters[idx]);
                  }
                });
                if (set.size) return set;
              }
              // Case 5: String separated by spaces/semicolons like "A C" or "1 3" or "A;C"
              if (typeof correctAnswer === 'string' && /[;\s]/.test(correctAnswer)) {
                const set = new Set<string>();
                correctAnswer.split(/[;\s]+/).map(s => s.trim()).filter(Boolean).forEach((part) => {
                  const L = (part.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase();
                  if (L) { set.add(L); return; }
                  if (/^\d+$/.test(part)) {
                    const n = Number(part);
                    const idx = n > 0 ? n - 1 : n;
                    if (idx >= 0 && idx < optionCore.length) set.add(letters[idx]);
                  }
                });
                if (set.size) return set;
              }
              // Case 6: CorrectAnswer is a JSON string array
              if (typeof correctAnswerRaw === 'string' && correctAnswerRaw.trim().startsWith('[')) {
                try {
                  const arr = JSON.parse(correctAnswerRaw);
                  if (Array.isArray(arr)) {
                    const set = new Set<string>();
                    arr.forEach((item: any) => {
                      if (typeof item === 'string') {
                        const s = String(item).trim();
                        const L = (s.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase();
                        if (L) { set.add(L); return; }
                        if (/^\d+$/.test(s)) {
                          const n = Number(s);
                          const idx = n > 0 ? n - 1 : n;
                          if (idx >= 0 && idx < optionCore.length) set.add(letters[idx]);
                          return;
                        }
                        const idxTxt = optionCore.findIndex((o) => o === s.replace(/^[A-Ja-j][\.)]\s*/, '').toLowerCase());
                        if (idxTxt >= 0) set.add(letters[idxTxt]);
                      } else if (typeof item === 'number' && isFinite(item)) {
                        const idx = item > 0 ? item - 1 : item;
                        if (idx >= 0 && idx < optionCore.length) set.add(letters[idx]);
                      }
                    });
                    if (set.size) return set;
                  }
                } catch { }
              }
              // Final fallback: scan combined string for letters / indices
              try {
                const combined = String((Array.isArray(correctAnswerRaw) ? correctAnswerRaw.join(',') : correctAnswerRaw) ?? correctAnswer ?? '').toUpperCase();
                if (combined) {
                  const set = new Set<string>();
                  const lettersArr = 'ABCDEFGHIJ'.split('');
                  lettersArr.forEach((L, idx) => {
                    if (combined.includes(L)) set.add(L);
                    const token = String(idx + 1);
                    if (combined.split(/[^0-9]/).includes(token)) set.add(L);
                  });
                  if (set.size) return set;
                }
              } catch { }
            }
            // Fallback: Multiple Choice single letter at start
            const caRaw = String(correctAnswer || '').trim();
            const L = (caRaw.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase();
            return L ? new Set([L]) : new Set();
          })();

          options.forEach((opt, i) => {
            const optionLabel = String.fromCharCode(65 + i);
            const isCorrect = correctSet.has(optionLabel);
            docChildren.push(new Paragraph(`${isCorrect ? '*' : ''}${optionLabel}. ${cleanOption(opt)}`));
            const fb = formatFeedbackForExport(feedbacks[i] || '');
            if (fb) {
              const prefix = isCorrect ? '~' : '@';
              docChildren.push(new Paragraph(`${prefix} ${fb}`));
            }
          });
          // Do not append a separate Correct Answer line for MR; we annotate inline instead
        } else {
          docChildren.push(new Paragraph(`Correct Answer: ${correctAnswer}`));
          const kp = Array.isArray(q.KeyPoints) ? q.KeyPoints : (q.KeyPoints ? String(q.KeyPoints).split('|||') : []);
          if (Array.isArray(kp) && kp.length) {
            docChildren.push(new Paragraph('Key Points:'));
            kp.forEach((p: string) => docChildren.push(new Paragraph(`• ${formatForExport(p)}`)));
          }
        }

        // Add additional fields for all question types
        const source = sessionStorage.getItem('selectedGenerationMode') || 'Book Based';
        const bookName = sessionStorage.getItem('bookTitle') || '';
        const study = q.study || sessionStorage.getItem('selectedChapterName') || '';
        const loName = q.learningObjective || '';
        const rating = q.ratingid == '1' ? "Good" : q.ratingid == '2' ? "Poor" : "N/A";
        const ratingFeedback = formatFeedbackForExport(q.rating_feedback || 'N/A');

        docChildren.push(new Paragraph(`Study: ${study}`));
        docChildren.push(new Paragraph(`Los: ${loName}`));
        docChildren.push(new Paragraph(`Taxonomy: ${q.taxonomy}`));
        docChildren.push(new Paragraph(`Creativity Level: ${creativity}`));
        docChildren.push(new Paragraph(`Rating: ${rating}`));
        docChildren.push(new Paragraph(`Rating Feedback: ${ratingFeedback}`));
        docChildren.push(new Paragraph(''));
      });

      const doc = new Document({ sections: [{ properties: {}, children: docChildren }] });
      const blob = await Packer.toBlob(doc);
      const now = new Date();

      const formattedDateTime = format(now, 'yyyy-MM-dd');
      try {
        saveAs(blob, `${bookTitle}_${formattedDateTime}.docx`);
      } catch {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${bookTitle}.docx`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
      }
      // The selection is deliberately kept: exporting reads the questions, it does not
      // consume them. Clearing it here meant a second export in another format found
      // no selection and shipped every question instead.
    } catch (e) {
      window.alert('Failed to export to Word.');
    }
  };

  // Export to Excel (Results-style): supports MC, WR, Matrix
  const parseItemJsonForValidation = (itemJsonStr: any, itemTypeName: string) => {
    const options = Array(10).fill('');
    let noOfOptions = 0;
    let correctOption = '';
    try {
      if (!itemJsonStr) return { options, noOfOptions, correctOption };
      const itemData = typeof itemJsonStr === 'string' ? JSON.parse(itemJsonStr) : itemJsonStr;
      const correctAnswerRaw = itemData.CorrectAnswer || '';
      const valuesList = itemData.values || itemData.options || [];

      // If there are no values/options, but there is a CorrectAnswer (e.g., Short Answer/Essay),
      // place the CorrectAnswer in Option 1.
      if ((!valuesList || valuesList.length === 0) && correctAnswerRaw) {
        options[0] = typeof correctAnswerRaw === 'string' ? correctAnswerRaw : JSON.stringify(correctAnswerRaw);
        correctOption = '1';
        noOfOptions = 0;
        return { options, noOfOptions, correctOption };
      }

      if (itemTypeName === 'Fill In the Blank') {
        noOfOptions = valuesList.length;
        options[0] = correctAnswerRaw;
        correctOption = '1';
        return { options, noOfOptions, correctOption };
      }

      let correctLetter = '';
      if (correctAnswerRaw) {
        const match = String(correctAnswerRaw).trim().match(/^([A-J])\./i);
        if (match) correctLetter = match[1].toUpperCase();
      }

      const optionMap: Record<string, string> = {};
      for (const value of valuesList) {
        const v = String(value).trim();
        const match = v.match(/^([A-J])\.\s+(.+)$/i);
        if (match) optionMap[match[1].toUpperCase()] = match[2].trim();
      }

      const sortedLetters = Object.keys(optionMap).sort();

      if (sortedLetters.length === 0 && valuesList.length > 0) {
        valuesList.forEach((v: string, i: number) => {
          if (i < 10) options[i] = String(v).replace(/^[A-J]\.?\s*/i, '').trim();
        });
        noOfOptions = Math.min(valuesList.length, 10);
        if (itemTypeName === 'Multiple Response') {
          try {
            const cl = Array.isArray(correctAnswerRaw) ? correctAnswerRaw : JSON.parse(correctAnswerRaw);
            if (Array.isArray(cl)) {
              const poses: number[] = [];
              cl.forEach(ans => {
                const idx = valuesList.findIndex((vl: string) => vl.includes(ans) || ans.includes(vl));
                if (idx >= 0) poses.push(idx + 1);
              });
              correctOption = poses.join(',');
            }
          } catch (e) { }
        } else {
          const idx = valuesList.findIndex((v: string) => String(v).trim().toLowerCase() === String(correctAnswerRaw).trim().toLowerCase());
          if (idx >= 0) correctOption = String(idx + 1);
        }
        return { options, noOfOptions, correctOption };
      }

      for (let i = 0; i < sortedLetters.length; i++) {
        if (i < 10) options[i] = optionMap[sortedLetters[i]];
      }
      noOfOptions = sortedLetters.length;

      if (itemTypeName === 'Multiple Response') {
        let correctList: string[] = [];
        try {
          correctList = typeof correctAnswerRaw === 'string' ? JSON.parse(correctAnswerRaw) : correctAnswerRaw;
          if (!Array.isArray(correctList)) correctList = [String(correctAnswerRaw)];
        } catch (e) {
          correctList = [String(correctAnswerRaw)];
        }
        const correctPositions: number[] = [];
        for (const ans of correctList) {
          const m = String(ans).trim().match(/^([A-J])\./i);
          if (m) {
            const letter = m[1].toUpperCase();
            const idx = sortedLetters.indexOf(letter);
            if (idx >= 0) correctPositions.push(idx + 1);
          }
        }
        correctOption = correctPositions.join(',');
      } else {
        if (correctLetter && sortedLetters.includes(correctLetter)) {
          correctOption = String(sortedLetters.indexOf(correctLetter) + 1);
        } else if (correctLetter) {
          correctOption = String(correctLetter.charCodeAt(0) - 65 + 1);
        }
      }
    } catch (e) {
      console.error("Error parsing item json:", e);
    }
    return { options, noOfOptions, correctOption };
  };

  const closeValidationDetailsDialog = (open: boolean) => {
    setValidationDetailsOpen(open);
    if (!open) {
      setValidationDetailsLoading(false);
      setValidationDetailsError('');
      setValidationDetailsIframeUrl('');
      setValidationDetailsItemCode('');
    }
  };

  const resolveValidationItemCode = async (question: Question): Promise<string> => {
    const directItemCode = getDirectQuestionItemCode(question);
    if (directItemCode) {
      return directItemCode;
    }

    const questionRequestId = String(question?.questionrequestid || '').trim();
    if (!questionRequestId) {
      return '';
    }

    const orgcode = sessionStorage.getItem('orgcode') || sessionStorage.getItem('orgCode') || '';
    const custcode = sessionStorage.getItem('custcode') || sessionStorage.getItem('customerCode') || '';
    const response = await fetchValidationItemsForRequest(orgcode, custcode, questionRequestId);

    const items = parseValidationItemsResponse(response.data);
    const lookupKeys = getQuestionLookupKeys(question);

    const matchedItem = items.find((item: any) => {
      const itemId = Array.isArray(item) ? item[1] : item?.itemid ?? item?.itemId;
      const itemCode = Array.isArray(item) ? item[7] : item?.itemcode ?? item?.itemCode;
      return lookupKeys.includes(String(itemId ?? '').trim()) || lookupKeys.includes(String(itemCode ?? '').trim());
    });

    if (matchedItem) {
      return String(Array.isArray(matchedItem) ? matchedItem[7] : matchedItem?.itemcode ?? matchedItem?.itemCode ?? '').trim();
    }

    if (items.length === 1) {
      return String(Array.isArray(items[0]) ? items[0][7] : items[0]?.itemcode ?? items[0]?.itemCode ?? '').trim();
    }

    const firstWithItemCode = items.find((item: any) => {
      const itemCode = Array.isArray(item) ? item[7] : item?.itemcode ?? item?.itemCode;
      return String(itemCode ?? '').trim() !== '';
    });

    return String(
      firstWithItemCode
        ? (Array.isArray(firstWithItemCode) ? firstWithItemCode[7] : firstWithItemCode?.itemcode ?? firstWithItemCode?.itemCode)
        : ''
    ).trim();
  };

  /**
   * Collects the item codes that Item Validation analysis runs already hold.
   *
   * This is deliberately the same source `findValidationItemRun` reads when the 3-dot
   * Validate decides between opening the report and asking to validate, so the row
   * icon and that menu can never disagree. Reading whether an item was merely
   * *imported* was not the same thing: an imported item with no analysis still shows
   * the confirmation.
   *
   * Runs are scanned once for the whole list rather than per question, so the cost
   * does not grow with the number of rows. Editing a question deletes its analysis
   * record, which is what makes it count as unvalidated again.
   */
  const validationScanRef = useRef<Promise<void> | null>(null);
  const singleValidateBusyRef = useRef(false);

  const refreshValidatedItemKeys = useCallback((list?: any[]): Promise<void> => {
    // A scan already running answers every caller: the row status and a 3-dot click
    // used to start one each and repeat the same GetItemValidationAnalysis* calls.
    if (validationScanRef.current) return validationScanRef.current;
    const scan = scanValidatedItemKeys(list);
    validationScanRef.current = scan;
    scan.finally(() => {
      if (validationScanRef.current === scan) validationScanRef.current = null;
    });
    return scan;
  }, []);

  const scanValidatedItemKeys = async (list?: any[]): Promise<void> => {
    try {
      const { custCode, orgCode, userCode } = getValidationSessionContext();

      // The analysis runs, newest first — the same list findValidationItemRun walks
      // when the menu decides between showing a result and asking to validate.
      const listPayload = await fetchItemValidationApiJson(
        `${ITEM_VALIDATION_API_URL}/ItemValidation/GetItemValidationAnalysisData`,
        {
          CustCode: custCode,
          OrgCode: orgCode,
          UserCode: userCode,
          ItemVaId: 0,
          integrationType: 1,
          Status: 3,
          PageNo: 1,
          PageSize: 100,
        }
      );

      const runIds = (Array.isArray(listPayload?.details) ? listPayload.details : [])
        .map((run: any) => String(run?.itemVaId ?? run?.ItemVaId ?? run?.runId ?? run?.RunId ?? "").trim())
        .filter((runId: string) => runId && !isNaN(Number(runId)));

      // Capped like probeRun caps its paging: the status is a hint, and the newest runs
      // hold the questions on screen.
      const found = new Map<string, { itemCode: string; runId: string }>();
      // Rows on screen: once every one has been found there is no reason to read the
      // older runs. A row that was never validated still needs the full pass.
      const wantedKeys = (Array.isArray(list) ? list : [])
        .map((q: any) => [getDirectQuestionItemCode(q), q?.id, q?.questionguid]
          .map((v) => String(v ?? '').trim().toLowerCase()).filter(Boolean));
      const allFound = () => wantedKeys.length > 0 && wantedKeys.every((keys: string[]) => keys.some((k) => found.has(k)));
      for (const runId of Array.from(new Set(runIds)).slice(0, VALIDATION_STATUS_RUN_LIMIT) as string[]) {
        if (allFound()) break;
        const payload = await fetchValidationRunDetailsPage(runId, 1, 100);
        (Array.isArray(payload?.details) ? payload.details : []).forEach((detail: any) => {
          const itemCode = String(detail?.itemCode ?? detail?.ItemCode ?? detail?.itemcode ?? '').trim();
          // Runs come newest first, so the first run holding an item is its latest one.
          if (itemCode && !found.has(itemCode.toLowerCase())) {
            found.set(itemCode.toLowerCase(), { itemCode, runId });
          }
        });
      }
      setValidatedItemRuns(found);
    } catch (err) {
      // Status is a hint, not a gate — a failure here must not disturb the list.
      console.warn('Could not load item validation status', err);
    }
  };

  // Refresh the per-row status when the listed questions actually change. Keyed by
  // the question ids, not the array: the list is rebuilt (same questions) on every
  // fetch, and each rebuild used to start another scan of the analysis runs.
  const questionIdsKey = (questions || []).map((q: any) => q?.id).join('|');
  useEffect(() => {
    if (!questions || questions.length === 0) {
      setValidatedItemRuns(new Map());
      return;
    }
    refreshValidatedItemKeys(questions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIdsKey, refreshValidatedItemKeys]);

  /**
   * The analysis run holding this question, or null when it has not been validated.
   *
   * Compared on the question's own code only — see the note in refreshValidatedItemKeys
   * about numeric ids colliding across questions.
   */
  const getValidatedRunFor = (question: any): { itemCode: string; runId: string } | null => {
    if (validatedItemRuns.size === 0) return null;
    const candidates = [getDirectQuestionItemCode(question), question?.id, question?.questionguid];
    for (const value of candidates) {
      const key = String(value ?? '').trim().toLowerCase();
      const match = key ? validatedItemRuns.get(key) : undefined;
      if (match) return match;
    }
    return null;
  };

  /** True when Item Validation holds a record for this question. */
  const isQuestionValidated = (question: any): boolean => !!getValidatedRunFor(question);

  // An edited question is no longer the item that was validated, so its previous
  // result is discarded on save. The next Item Validate then imports and analyses the
  // edited content instead of reopening the old analysis.
  const clearValidationForEditedQuestion = async (question: any): Promise<void> => {
    if (!question) return;
    const purge = (async () => {
      const itemCode = await resolveValidationItemCode(question as Question);
      await purgeItemValidationData(itemCode);
    })();
    try {
      // The question is already saved by this point, so a slow or unreachable
      // validation service must not hold the dialog open. The requests keep running
      // in the background; only the wait is capped.
      await Promise.race([
        purge,
        new Promise((resolve) => setTimeout(resolve, 15000)),
      ]);
    } catch (err) {
      console.warn('Could not clear item validation data after edit', err);
    }
  };

  /**
   * `resolved` carries the item code and run id when the caller has already looked
   * them up. Without it this repeated the whole lookup — get-itemvalidation-data plus
   * every GetItemValidationAnalysis* call — a second time for the same question.
   */
  const handleOpenValidationDetails = async (
    question: Question,
    resolved?: { itemCode?: string; runId?: string }
  ) => {
    try {
      setValidationDetailsOpen(true);
      setValidationDetailsLoading(true);
      setValidationDetailsError('');
      setValidationDetailsIframeUrl('');

      const itemCode = String(resolved?.itemCode || '').trim() || await resolveValidationItemCode(question);
      if (!itemCode) {
        throw new Error('Unable to find the Item Validation item code for this question.');
      }

      const token = await buildItemValidationSsoToken();
      const runId = String(resolved?.runId || '').trim()
        || String((await findValidationItemRun(itemCode))?.runId || '').trim();

      if (!runId) {
        throw new Error('Analysis is in progress please check after the analysis completes');
      }

      try {
        const validationRunMap = readValidationRunMap();
        validationRunMap[itemCode] = {
          ...validationRunMap[itemCode],
          runId,
          updatedAt: new Date().toISOString(),
        };
        sessionStorage.setItem(ITEM_VALIDATION_RUN_MAP_STORAGE_KEY, JSON.stringify(validationRunMap));
        sessionStorage.setItem('latestValidationRunId', runId);
      } catch (storageError) {
        console.warn('Could not persist resolved item validation run:', storageError);
      }
      const redirectPath =
        `/item-validation/analysis-runs?openRunId=${encodeURIComponent(runId)}&openItemCode=${encodeURIComponent(itemCode)}&hideSidebar=true&isIframe=true&isSSO=true`;
      const iframeUrl =
        `${ITEM_VALIDATION_BASE_URL}/login?enc=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirectPath)}&hideSidebar=true&isIframe=true&isSSO=true`;
      setValidationDetailsItemCode(itemCode);
      setValidationDetailsIframeUrl(iframeUrl);
    } catch (err: any) {
      setValidationDetailsError(err?.message || 'Unable to open validation details.');
      setValidationDetailsLoading(false);
    }
  };

  const handleValidateQuestions = async (questionIds: string[], isBulk: boolean = false) => {
    // Declared outside the try: the finally block reads it, and a `let` inside the
    // try is out of scope there (ReferenceError when validation finishes).
    let pollingStarted = false;
    try {
      setIsValidating(true);
      setValidatingQuestionIds(prev => {
        const next = new Set(prev);
        questionIds.forEach(id => next.add(id));
        return next;
      });

      const updateValidationStatus = (status: string) => {
        setValidationStatusStr(status);
        if (status === "Completed" || status === "Failed") {
          setShowValidationProgressDialog(true);
          // Clear the per-row loading spinner now that validation is done.
          setValidatingQuestionIds(prev => {
            const next = new Set(prev);
            questionIds.forEach(id => next.delete(id));
            return next;
          });
        }
        // Flip the per-row status icons as soon as a run finishes, without waiting for
        // the next list refresh. The cached reads are dropped first so the refresh
        // sees the run that just completed.
        if (status === "Completed") {
          clearItemValidationApiCache();
          refreshValidatedItemKeys(questions);
        }
      };

      // Reset progress states
      setValidationProgressPct(0);
      setValidationStatusStr("Running");
      setValidationRunDetails(null);

      const orgcode = sessionStorage.getItem('orgcode') || '';
      const custcode = sessionStorage.getItem('custcode') || '';
      const usercode = sessionStorage.getItem('userCode') || sessionStorage.getItem('usercode') || '';

      let reqId = '';
      if (questionIds.length > 0) {
        // Collect all request IDs for selected questions
        const reqIds = questionIds.map(id => {
          const q = questions.find(q => q.id === id);
          return q ? q.questionrequestid : null;
        }).filter(id => id); // remove falsy values

        // Remove duplicates and join
        reqId = Array.from(new Set(reqIds)).join(',');
      } else if (questions.length > 0) {
        // Fallback to first available question if none selected, or maybe just take its request ID
        reqId = questions[0].questionrequestid || '';
      }

      if (!reqId) {
        window.alert('No question request ID found for validation.');
        return;
      }

      // 1. Fetch item validation data
      const getRes = await axios.get(`${AIG_QUIZ_GEN_URL}/get-itemvalidation-data`, {
        params: { orgcode, custcode, questionrequestid: reqId }
      });
      console.log('Item validation data response:', getRes.data);

      let items = getRes.data;

      // Handle cases where the API returns a stringified JSON
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items);
        } catch (e) {
          console.warn('Could not parse get-itemvalidation-data response as JSON');
        }
      }

      // Handle cases where the array is wrapped in an object property (like { data: [...] } or { item_xml: [...] })
      if (items && !Array.isArray(items)) {
        if (Array.isArray(items.data)) items = items.data;
        else if (Array.isArray(items.item_xml)) items = items.item_xml;
        else if (Array.isArray(items.question_xml)) items = items.question_xml;
        else if (items.status && Array.isArray(items.status)) items = items.status; // Fallback for weird structures
        else items = [items]; // As a last resort, wrap the object in an array
      }

      if (!items || !Array.isArray(items)) {
        throw new Error('API response did not contain an iterable array of items.');
      }

      const selectedIdsStr = questionIds.map(String);
      const itemsToProcess = [];
      // get-itemvalidation-data's own "difficulty level" is never actually set by the
      // user anywhere in this app (the generator has no Difficulty Level control; it
      // is always written as a hardcoded default). Creativity Level is the one level
      // the user does pick, and it's already loaded on `questions` (the same field the
      // Question Details dialog shows) — look items up there instead.
      const questionsById = new Map(questions.map(q => [String(q.id), q]));

      for (const item of items) {
        let itemId, itemJson, itemTypeName, itemCode, maxScore, itemStem, diffLevel, taxLevel, bookName, chapterName, loName, kbid, gid;

        if (Array.isArray(item)) {
          itemId = item[1];
          itemJson = item[2];
          itemTypeName = item[6] || '';
          itemCode = item[7] || '';
          taxLevel = item[8] || '';
          bookName = item[10] || '';
          diffLevel = item[14] || '';
          chapterName = item[9] || item[19] || '';
          loName = item[20] || '';

          // Extract kbid and gid based on array structure indices 23 and 24
          kbid = item[23] || '';
          gid = item[24] || '';
        } else {
          itemId = item.itemid;
          itemJson = item.itemjson;
          itemTypeName = item.itemtypename;
          itemCode = item.itemcode;
          maxScore = item.max_score;
          itemStem = item.itemstem;
          diffLevel = item.difficultylevelname;
          taxLevel = item.taxonomyname;
          bookName = item.bookname;
          chapterName = item.chaptername;
          loName = item.loname;

          kbid = item.kbid || '';
          gid = item.gid || '';
        }

        let parsedJson: any = {};
        try {
          parsedJson = typeof itemJson === 'string' ? JSON.parse(itemJson) : (itemJson || {});
        } catch (e) { }

        itemStem = itemStem || parsedJson.label || parsedJson.QuestionStatement || parsedJson.text || '';
        maxScore = maxScore || parsedJson.MaxMarks || parsedJson.marks || 1;
        bookName = bookName || parsedJson.BookName || '';

        // Same Creativity Level the Question Details dialog shows for this question,
        // sent under the existing "DifficultyLevel" column so the CSV's column name
        // (and whatever downstream system expects it) stays unchanged.
        const matchedQuestion = questionsById.get(String(itemId)) || questionsById.get(String(itemCode));
        if (matchedQuestion?.creativitylevelname) diffLevel = matchedQuestion.creativitylevelname;

        if (questionIds.length > 0) {
          // Using loose comparison to match strings/numbers and also match against UI IDs vs DB ItemIDs
          if (!selectedIdsStr.includes(String(itemId)) && !selectedIdsStr.includes(String(itemCode))) {
            continue;
          }
        }

        itemsToProcess.push({
          itemId, itemJson: parsedJson, itemTypeName, itemCode, maxScore, itemStem, diffLevel, taxLevel, bookName, chapterName, loName, kbid, gid
        });
      }

      if (itemsToProcess.length === 0) {
        window.alert('No matching items found to validate.');
        return;
      }

      // 2. Generate CSV
      const headers = [
        "ItemCode", "ItemType", "MaxScore", "WrongScore", "NoOfOptions",
        "CorrectOption", "ItemStem",
        "Option 1", "Option 2", "Option 3", "Option 4",
        "Option 5", "Option 6", "Option 7", "Option 8",
        "Option 9", "Option 10",
        "DifficultyLevel", "TaxonomyLevel",
        "Subject", "Chapter", "LO", "kbid", "gid"
      ];

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '';
        const str = String(val);

        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
          // Special case: if it looks like the comma-separated ID list (only numbers and commas)
          if (/^[0-9,]+$/.test(str)) {
            // To force Excel to treat it as a string and keep it in one cell, 
            // the CSV formula ="639,280,277" itself needs to be properly CSV-escaped.
            const formula = `="${str}"`;
            return `"${formula.replace(/"/g, '""')}"`;
          }
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvRows = [headers.map(escapeCsv).join(',')];

      for (const item of itemsToProcess) {
        const { options, noOfOptions, correctOption } = parseItemJsonForValidation(item.itemJson, item.itemTypeName);

        const row = [
          item.itemCode,
          item.itemTypeName,
          item.maxScore,
          0, // WrongScore
          noOfOptions,
          correctOption,
          item.itemStem,
          ...options,
          item.diffLevel,
          item.taxLevel,
          item.bookName,
          item.chapterName,
          item.loName,
          item.kbid,
          item.gid
        ];
        csvRows.push(row.map(escapeCsv).join(','));
      }

      const csvString = csvRows.join('\n');
      const csvBlob = new Blob([csvString], { type: 'text/csv' });

      //Trigger file download
      // const downloadUrl = URL.createObjectURL(csvBlob);
      // const link = document.createElement('a');
      // link.href = downloadUrl;
      // link.download = 'selected_items.csv';
      // document.body.appendChild(link);
      // link.click();
      // document.body.removeChild(link);
      // URL.revokeObjectURL(downloadUrl);


      // 3. Post to ImportItemData API
      const formData = new FormData();
      formData.append('File', csvBlob, 'selected_items.csv');
      formData.append('custcode', custcode);
      formData.append('orgcode', orgcode);
      formData.append('folderid', '0');
      formData.append('usercode', usercode);
      formData.append('integrationtype', '2');

      const importApiUrl = `${ITEM_VALIDATION_API_URL}/ItemValidation/ImportItemData`;
      const importRes = await axios.post(importApiUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      console.log('Import API Response:', importRes.data);

      let isSuccess = false;
      let hasE001 = false;
      if (importRes.data && Array.isArray(importRes.data.details)) {
        const successDetails = importRes.data.details.filter((d: any) => d.status && String(d.status).toUpperCase().startsWith('S'));
        if (successDetails.length > 0) isSuccess = true;

        const e001Details = importRes.data.details.filter((d: any) => d.status && String(d.status).toUpperCase() === 'E001');
        if (e001Details.length > 0) hasE001 = true;
      } else if (importRes.status === 200) {
        isSuccess = true;
      }

      if (isSuccess) {
        // Validation started successfully, show the popup
        setShowBulkValidateStartDialog(true);

        // 4. Run Analysis API Call
        let analysisName = 'Itemgeneration';
        let runIdForPoll: string | null = null;
        try {
          const runAnalysisPayload = {
            itemAnalysisName: analysisName,
            itemset_id: 0,
            custcode: custcode,
            orgcode: orgcode,
            kbid: String(itemsToProcess[0]?.kbid || sessionStorage.getItem('kbid') || '988'),
            gid: String(itemsToProcess[0]?.gid || sessionStorage.getItem('gid') || '2982'),
            userCode: usercode,
            integrationtype: 2,
            integrationcode: itemsToProcess.map(item => item.itemCode).join(',')
          };

          const analysisRes = await axios.post(`${ITEM_VALIDATION_RUN_API_URL}/run-analysis`, runAnalysisPayload);
          console.log('Run Analysis Response:', analysisRes.data);
          const runId = extractValidationRunId(analysisRes.data);
          runIdForPoll = runId;
          if (runId) {
            sessionStorage.setItem('latestValidationRunId', String(runId));
            try {
              const validationRunMap = readValidationRunMap();
              const updatedAt = new Date().toISOString();
              itemsToProcess.forEach(item => {
                if (item.itemCode) {
                  validationRunMap[String(item.itemCode)] = {
                    runId: String(runId),
                    analysisName,
                    updatedAt
                  };
                }
              });
              sessionStorage.setItem(ITEM_VALIDATION_RUN_MAP_STORAGE_KEY, JSON.stringify(validationRunMap));
            } catch (storageError) {
              console.warn('Could not persist item validation run map:', storageError);
            }

            const pollValidation = async () => {
              try {
                const statusRes = await axios.get(`${ITEM_VALIDATION_RUN_API_URL}/run-status/${runId}`);
                const statusData = statusRes.data;
                if (statusData) {
                  setValidationProgressPct(statusData.progress_pct || 0);
                  setValidationRunDetails(statusData);
                  if (statusData.status === "Completed" || statusData.status === "Failed") {
                    updateValidationStatus(statusData.status);
                  } else {
                    // Increased polling interval to 10 seconds to minimize performance impact
                    setTimeout(pollValidation, 10000);
                  }
                } else {
                  setTimeout(pollValidation, 10000);
                }
              } catch (e) {
                updateValidationStatus("Failed");
              }
            };
            // Start first poll after 10 seconds, but popup is already shown immediately above
            pollingStarted = true;
            setTimeout(pollValidation, 10000);
          }
        } catch (analysisErr) {
          console.error('Run Analysis failed:', analysisErr);
          updateValidationStatus("Failed");
          window.alert('Run Analysis failed. Check console for details.');
        }

        setSuccessCount(itemsToProcess.length);
        // Store the latest analysis name so we can view details later
        sessionStorage.setItem('latestValidationAnalysisName', analysisName);

        if (!runIdForPoll) {
          updateValidationStatus("Failed");
          setSuccessDialogOpen(true);
        }
      } else {
        if (hasE001) {
          setShowValidationProgressDialog(false);
          if (!isBulk && questionIds.length === 1) {
            const q = questions.find(q => q.id === questionIds[0]);
            if (q) {
              handleOpenValidationDetails(q);
              return;
            }
          } else if (isBulk) {
            const itemCodes = itemsToProcess.map(item => item.itemCode).filter(Boolean).join(', ');
            setValidationErrorMessage(`Questions ${itemCodes} are already validated, please check.`);
            setValidationErrorDialogOpen(true);
            return;
          }
          const itemCodes = itemsToProcess.map(item => item.itemCode).filter(Boolean).join(', ');
          setValidationErrorMessage(`Question ${itemCodes} is already validated, please check.`);
          setValidationErrorDialogOpen(true);
        } else {
          updateValidationStatus("Failed");
          window.alert('Import API returned failure. Check console for details.');
        }
      }
    } catch (err: any) {
      console.error('Validation failed:', err);

      window.alert('Validation failed: ' + (err?.response?.data?.message || err?.message || 'Unknown error'));
    } finally {
      setSelectedQuestions([]);
      setIsValidating(false);
      // Only clear the per-row spinners if polling was never started.
      // When polling IS running, updateValidationStatus clears them on Completed/Failed.
      if (!pollingStarted) {
        setValidatingQuestionIds(prev => {
          const next = new Set(prev);
          questionIds.forEach(id => next.delete(id));
          return next;
        });
      }
    }
  };

  const handleSingleValidateClick = async (question: any) => {
    if (singleValidateBusyRef.current) return;   // a lookup is already running
    singleValidateBusyRef.current = true;
    try {
      setSingleQuestionToValidate(question.id);

      // The row status scan may still be reading the analysis runs: wait for it
      // instead of starting the same reads again.
      if (validationScanRef.current) {
        try { await validationScanRef.current; } catch { /* the scan reports its own errors */ }
      }

      // The row status already knows the run for a validated question, so open the
      // report straight away rather than resolving the item code and re-scanning the
      // analysis runs to learn what we were told at load time.
      const knownRun = getValidatedRunFor(question);
      if (knownRun) {
        handleOpenValidationDetails(question, knownRun);
        return;
      }

      const itemCode = await resolveValidationItemCode(question);
      if (itemCode) {
        const run = await findValidationItemRun(itemCode);
        if (run) {
          // Already validated, open details directly — hand over what was just
          // resolved so the details view does not repeat the same lookups.
          handleOpenValidationDetails(question, { itemCode, runId: String(run.runId || '') });
          return;
        }
      }

      // Not validated, show confirmation
      setShowSingleValidateConfirmDialog(true);
    } catch (e) {
      console.warn("Failed to check if question is validated before validate click", e);
      // Fallback to showing confirmation
      setShowSingleValidateConfirmDialog(true);
    } finally {
      singleValidateBusyRef.current = false;
    }
  };

  const handleBulkValidate = async () => {
    if (selectedQuestions.length === 0) {
      setShowBulkValidateConfirmDialog(true);
      return;
    }
    return handleValidateQuestions(selectedQuestions, true);
  };

  const handleExportToExcel = async () => {
    try {
      const ExcelJSImport: any = await import('exceljs');
      const ExcelJS: any = ExcelJSImport?.default || ExcelJSImport;
      const { saveAs } = await import('file-saver');
      const { format } = await import('date-fns');

      // Passage Type is filtered client-side, so exporting `questions` shipped every
      // fetched row and ignored the filter. Export exactly what the table shows.
      let results: any[] = selectedQuestions.length > 0
        ? displayedQuestions.filter(q => selectedQuestions.includes(q.id))
        : displayedQuestions;
      results = Array.isArray(results) ? results.filter(Boolean) : [];
      if (!results.length) {
        window.alert('No questions available to export.');
        return;
      }

      const chapterName = sessionStorage.getItem('bookTitle') || 'questions';

      const mcqData: any[] = [];
      const mrData: any[] = [];
      const tfData: any[] = [];
      const selectBlankData: any[] = [];
      const fibData: any[] = [];
      const wrData: any[] = [];
      const matrixData: any[] = [];

      const mapOptionValue = (value: any) => {
        if (typeof value === 'string') {
          const m = value.match(/[A-J]/i);
          if (m && m[0]) return m[0].toUpperCase().charCodeAt(0) - 64;
        }
        if (typeof value === 'number') return value;
        return '';
      };

      const mapTaxonomy = (taxonomy: any) => {
        switch (taxonomy) {
          case 'Remember': return 1;
          case 'Understand': return 2;
          case 'Apply': return 3;
          case 'Analyze': return 4;
          case 'Evaluate': return 5;
          case 'Create': return 6;
          default: return 'N/A';
        }
      };

      const parseNum = (v: any) => { const n = Number(v); return isFinite(n) ? n : NaN; };

      const getCreativityLevelText = (creativityId?: any, ratingFeedback?: any) => {
        // Keep as-is if already available on q; otherwise return empty
        return '';
      };

      results.forEach((q: any, index: number) => {
        const questionData = q;
        const taxonomy = q.taxonomy || sessionStorage.getItem('selectedTaxonomy') || 'N/A';
        const learningOutcome = q.learningObjective || sessionStorage.getItem('selectedLoName') || 'N/A';
        const creativitylevelname = q.creativitylevelname || 'N/A';
        const source = q.source || sessionStorage.getItem('selectedGenerationMode') || 'N/A';
        const generatedImageUrl = resolveQuestionImageUrl(q);
        // Every attached image, not just the first: a question can carry an AI
        // generated picture AND one the user added, and only the first was
        // reaching the sheet.
        const generatedImageList: string[] = collectQuestionImages(q);
        const bookName = q.bookname || sessionStorage.getItem('bookTitle') || 'N/A';
        const userDetails = (() => {
          try { const ui = JSON.parse(sessionStorage.getItem('userInfo') || '{}'); return ui.userName || ui.userCode || ui.email || ''; } catch { return ''; }
        })();
        const study = q.study || sessionStorage.getItem('studyName') || sessionStorage.getItem('chaptercode') || 'N/A';

        // Build identifier same pattern as existing page
        const taxonomyid = mapTaxonomy(taxonomy);
        const bookIdentifier = sessionStorage.getItem('bookIdentifier') || 'BK';
        const typeStr = String(q?.type || q?.QuestionType || '').toLowerCase();

        const values: string[] = Array.isArray(q.values) ? q.values : (Array.isArray(q.options) ? q.options : []);
        const cleanedValues = formatOptionsForExport(values).map(v => String(v ?? '').replace(/^[A-J][\.)]\s*/, ''));

        // Detect type - check Select the Blank first, then FIB, Matrix, etc.
        let questionType = 'Written Response';
        const cleanStemText = getCleanStem(q);
        const stem = formatStemForExport(cleanStemText);
        const isMatrix = typeStr.includes('matrix') || (Array.isArray(q.rows) && Array.isArray(q.columns));
        const isSelectBlank = isFillBlankDropdownQuestion(q) || (typeStr.includes('select') && typeStr.includes('blank'));
        const isFillBlankText = !isSelectBlank && (typeStr.includes('fill') || /_{3,}/.test(stem) || /\[\s*blank\s*\]/i.test(stem));

        // Separate Passage text and Reference Table text into distinct fields
        const passageTabs = getQuestionTabs(q);
        const passageText = passageTabs.length > 0
          ? passageTabs.map((tab: any, tIdx: number) => {
            const title = getTabTitle(tab, tIdx);
            const content = getTabPassage(tab);
            return `[Passage ${tIdx + 1}${title ? `: ${title}` : ''}]\n${content}`;
          }).join('\n\n')
          : '';

        const tableData = getTableAnalysis(q);
        const referenceTableText = (tableData && Array.isArray(tableData.Columns) && Array.isArray(tableData.Rows) && tableData.Columns.length > 0)
          ? `[Reference Table]\n${tableData.Columns.join(' | ')}\n` +
          tableData.Rows.map((r: any[]) => r.join(' | ')).join('\n')
          : '';

        if (isSelectBlank) {
          questionType = 'Select the Blank';
        } else if (isFillBlankText) {
          questionType = 'Fill In the Blank';
        } else if (isMatrix) {
          questionType = 'Matrix';
        } else if (typeStr.includes('true')) {
          questionType = 'True False';
        } else if (cleanedValues.length > 0) {
          const isTF = cleanedValues.length === 2 && cleanedValues.every(o => /^(true|false)$/i.test(String(o).trim()));
          const caRaw = q.CorrectAnswer ?? q.answer ?? '';
          const caStr = Array.isArray(caRaw) ? caRaw.join(',') : String(caRaw || '').trim();
          const isMR = Array.isArray(caRaw) ? caRaw.length > 1 : caStr.split(',').map(s => s.trim()).filter(Boolean).length > 1;
          questionType = isTF ? 'True False' : (isMR ? 'Multiple Response' : 'Multiple Choice');
        }

        // Compute Max Score robustly
        const computedMaxScore = (() => {
          try {
            const itemScoring = typeof questionData?.ItemScoring === 'string'
              ? JSON.parse(questionData.ItemScoring)
              : questionData?.ItemScoring;
            const fullScore = parseNum(itemScoring?.FullScore);
            const maxMarks = parseNum(questionData?.MaxMarks);
            const itemScore = parseNum(q?.Marks ?? q?.marks);
            return (!isNaN(fullScore) && fullScore > 0)
              ? fullScore
              : (!isNaN(maxMarks) && maxMarks > 0)
                ? maxMarks
                : (!isNaN(itemScore) && itemScore > 0)
                  ? itemScore
                  : 0;
          } catch {
            const maxMarks = parseNum(questionData?.MaxMarks);
            const itemScore = parseNum(q?.Marks ?? q?.marks);
            return (!isNaN(maxMarks) && maxMarks > 0)
              ? maxMarks
              : (!isNaN(itemScore) && itemScore > 0)
                ? itemScore
                : 0;
          }
        })();

        const identifier = (() => {
          // Use existing identifier from data if available 
          const existingId = q.questionidentifier || q.QuestionIdentifier || q.question_id || q.id;
          if (existingId) {
            return String(existingId).replace('$', '_');
          }
          // Fallback: construct identifier using the same pattern as database
          const chaptercode = String(sessionStorage.getItem('chaptercode') || '00').padStart(2, '0');
          const lo = sessionStorage.getItem('selectedLO') || '0';
          const typeCode = questionType === 'Written Response' ? 'WR' : (questionType === 'Matrix' ? 'MM' : 'MC');
          const questionId = q.id || (index + 1);
          return `IG_V2025_${chaptercode}_LO${lo}_${typeCode}_L${taxonomyid}_EN_ID${questionId}`;
        })();

        // Compute Correct Answer formats
        let correctanswer = '';
        if (questionType === 'Multiple Response') {
          const caRaw = q.CorrectAnswer;
          if (Array.isArray(caRaw)) {
            correctanswer = caRaw
              .map(ans => mapOptionValue(ans))
              .filter(val => val !== '' && val !== undefined && val !== null && !isNaN(val as any))
              .join(',');
          } else {
            correctanswer = String(caRaw || '')
              .split(',')
              .map(s => mapOptionValue(String(s).trim()))
              .filter(val => val !== '' && val !== undefined && val !== null && !isNaN(val as any))
              .join(',');
          }
        } else if (questionType === 'Matrix') {
          try {
            const rows = typeof q.rows === 'string' ? JSON.parse(q.rows) : q.rows || [];
            const cols = typeof q.columns === 'string' ? JSON.parse(q.columns) : q.columns || [];
            const ca = typeof q.CorrectAnswer === 'string' ? JSON.parse(q.CorrectAnswer) : q.CorrectAnswer || [];
            if (Array.isArray(rows) && Array.isArray(cols) && Array.isArray(ca)) {
              correctanswer = rows.map((row: any, ri: number) => {
                const ci = ca[ri];
                if (ci !== undefined && cols[ci]) return `* ${row.text} => ${cols[ci].text}`;
                return `* ${row.text}: N/A`;
              }).join('\n');
            }
          } catch { }
        } else if (questionType === 'Fill In the Blank') {
          const ca = q?.CorrectAnswer;
          correctanswer = Array.isArray(ca) ? ca.join(', ') : String(ca ?? '');
        } else if (questionType === 'Multiple Choice' || questionType === 'True False') {
          const answer = String(q?.CorrectAnswer || '').trim();
          if (/^[A-Za-z]$/.test(answer)) {
            correctanswer = (answer.toUpperCase().charCodeAt(0) - 64).toString();
          } else if (cleanedValues.length) {
            const matchedIndex = cleanedValues.findIndex(opt => opt.trim().toLowerCase() === answer.replace(/^[A-Z]\.?\s*/, '').trim().toLowerCase());
            correctanswer = matchedIndex >= 0 ? String(matchedIndex + 1) : '';
          } else {
            correctanswer = answer;
          }
        }

        // Parse marks for options (A-J)
        let optionMarks: any[] = new Array(10).fill('');
        if (q?.marks) {
          try {
            let marksObj: any;
            if (typeof q.marks === 'string') marksObj = JSON.parse(q.marks);
            else if (typeof q.marks === 'object' && !Array.isArray(q.marks)) marksObj = q.marks;
            else marksObj = {};
            optionMarks = 'ABCDEFGHIJ'.split('').map(k => (marksObj[k] !== undefined ? parseFloat(marksObj[k]) : ''));
          } catch { }
        }

        // Build row objects per type, with richText Question Stem
        const stemRich = {
          richText: [
            { text: formatStemForExport(cleanStemText) }
          ]
        } as any;

        // NEW: Store original image URL for embedding in Excel later
        const rowData = { __imageDataUrl: generatedImageUrl, __imageDataUrls: generatedImageList } as any;

        if (questionType === 'Multiple Response') {
          const row: any = {
            ...rowData,
            'Question Identifier': identifier.replace('$', '_'),
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': questionType,
            'Max Score': computedMaxScore,
            'Correct Answer': correctanswer,
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Creativity Level': creativitylevelname,
            'Rating': (() => {
              const rating = q.Rating ?? q.rating ?? q.ratingid ?? q[15];
              if (rating === 1 || rating === '1') return 'Good';
              if (rating === 2 || rating === '2') return 'Poor';
              return 'N/A';
            })(),
            'Rating Feedback': (() => {
              // Check sessionStorage cache first (where feedback is stored after submission)
              const storageKey = `questionFeedback:${q.questionrequestid}:${q.numericId}`;
              const cachedFeedback = (() => {
                try {
                  const cached = sessionStorage.getItem(storageKey);
                  return cached ? JSON.parse(cached).feedback : null;
                } catch { return null; }
              })();

              // Use cached feedback, then field values, then array index
              const feedback = cachedFeedback ?? q.rating_feedback ?? q.Rating_Feedback ?? q.rating_feedback ?? q.ratingfeedback ?? q.RatingFeedback ?? q[16];
              console.log(`Rating Feedback for Question ID ${q.id}:`, feedback, '(cached:', cachedFeedback, ')');
              return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A';
            })(),
            'Generated Image URL': formatImageForExport(generatedImageUrl)
          };
          cleanedValues.forEach((val, i) => {
            const idx = i + 1;
            row[`Option${idx}`] = val;
            // Handle feedback options with proper fallback for E-J
            const feedbackKey = `FeedbackOption${String.fromCharCode(65 + i)}`;
            const fallbackKey = `FeedbackOption${idx}`;
            row[`Feedback Option${idx}`] = formatFeedbackForExport((q as any)[feedbackKey] || (q as any)[fallbackKey] || '');
          });
          mrData.push(row);
        } else if (questionType === 'Multiple Choice') {

          const row: any = {
            ...rowData,
            'Question Identifier': identifier.replace('$', '_'),
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': questionType,
            'Max Score': computedMaxScore,
            'Correct Answer': correctanswer,
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Creativity Level': creativitylevelname,
            'Rating': (() => {
              const rating = q.Rating ?? q.rating ?? q.ratingid ?? q[15];
              if (rating === 1 || rating === '1') return 'Good';
              if (rating === 2 || rating === '2') return 'Poor';
              return 'N/A';
            })(),
            'Rating Feedback': (() => {
              // Check sessionStorage cache first (where feedback is stored after submission)
              const storageKey = `questionFeedback:${q.questionrequestid}:${q.numericId}`;
              const cachedFeedback = (() => {
                try {
                  const cached = sessionStorage.getItem(storageKey);
                  return cached ? JSON.parse(cached).feedback : null;
                } catch { return null; }
              })();

              // Use cached feedback, then field values, then array index
              const feedback = cachedFeedback ?? q.rating_feedback ?? q.Rating_Feedback ?? q.rating_feedback ?? q.ratingfeedback ?? q.RatingFeedback ?? q[16];
              console.log(`MCQ Rating Feedback for Question ID ${q.id}:`, feedback, '(cached:', cachedFeedback, ')');
              return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A';
            })(),
            'Generated Image URL': formatImageForExport(generatedImageUrl)
          };
          cleanedValues.forEach((val, i) => {
            const idx = i + 1;
            row[`Option${idx}`] = val;
            // Handle feedback options with proper fallback for E-J
            const feedbackKey = `FeedbackOption${String.fromCharCode(65 + i)}`;
            const fallbackKey = `FeedbackOption${idx}`;
            row[`Feedback Option${idx}`] = formatFeedbackForExport((q as any)[feedbackKey] || (q as any)[fallbackKey] || '');
          });
          mcqData.push(row);
        } else if (questionType === 'True False') {
          const row: any = {
            ...rowData,
            'Question Identifier': identifier.replace('$', '_'),
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': 'True False',
            'Max Score': computedMaxScore,
            'Correct Answer': correctanswer,
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Creativity Level': creativitylevelname,
            'Rating': (() => {
              const rating = q.Rating ?? q.rating ?? q.ratingid ?? q[15];
              if (rating === 1 || rating === '1') return 'Good';
              if (rating === 2 || rating === '2') return 'Poor';
              return 'N/A';
            })(),
            'Rating Feedback': (() => {
              // Check sessionStorage cache first (where feedback is stored after submission)
              const storageKey = `questionFeedback:${q.questionrequestid}:${q.numericId}`;
              const cachedFeedback = (() => {
                try {
                  const cached = sessionStorage.getItem(storageKey);
                  return cached ? JSON.parse(cached).feedback : null;
                } catch { return null; }
              })();

              // Use cached feedback, then field values, then array index
              const feedback = cachedFeedback ?? q.rating_feedback ?? q.Rating_Feedback ?? q.rating_feedback ?? q.ratingfeedback ?? q.RatingFeedback ?? q[16];
              console.log(`Rating Feedback for Question ID ${q.id}:`, feedback, '(cached:', cachedFeedback, ')');
              return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A';
            })(),
            'Generated Image URL': formatImageForExport(generatedImageUrl)
          };
          row['Option1'] = cleanedValues[0] || 'True';
          row['Option2'] = cleanedValues[1] || 'False';
          row['Option1 Marks'] = optionMarks[0] !== '' ? parseFloat(optionMarks[0]) : '';
          row['Option2 Marks'] = optionMarks[1] !== '' ? parseFloat(optionMarks[1]) : '';
          row['Feedback Option1'] = formatFeedbackForExport((q as any)['FeedbackOptionA'] || '');
          row['Feedback Option2'] = formatFeedbackForExport((q as any)['FeedbackOptionB'] || '');
          tfData.push(row);
        } else if (questionType === 'Select the Blank') {
          const row: any = {
            ...rowData,
            __imageDataUrl: '',
            __imageDataUrls: [],
            'Question Identifier': identifier.replace('$', '_'),
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': 'Select the Blank',
            'Max Score': computedMaxScore,
            'Correct Answer': Array.isArray(q?.CorrectAnswer) ? q.CorrectAnswer.join(', ') : String(q?.CorrectAnswer ?? ''),
            // Stored key points only — the preview's getKeyPointsFromQuestion
            // substitutes a sample list, which must never reach the sheet.
            'KeyPoints': getStoredKeyPoints(q).join('\n'),
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Creativity Level': creativitylevelname,
            'Rating': (() => {
              const rating = q.Rating ?? q.rating ?? q.ratingid ?? q[15];
              if (rating === 1 || rating === '1') return 'Good';
              if (rating === 2 || rating === '2') return 'Poor';
              return 'N/A';
            })(),
            'Rating Feedback': (() => {
              const storageKey = `questionFeedback:${q.questionrequestid}:${q.numericId}`;
              const cachedFeedback = (() => {
                try {
                  const cached = sessionStorage.getItem(storageKey);
                  return cached ? JSON.parse(cached).feedback : null;
                } catch { return null; }
              })();
              const feedback = cachedFeedback ?? q.rating_feedback ?? q.Rating_Feedback ?? q.rating_feedback ?? q.ratingfeedback ?? q.RatingFeedback ?? q[16];
              return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A';
            })(),
            'Generated Image URL': generatedImageUrl || 'N/A'
          };
          cleanedValues.forEach((optVal, optIdx) => {
            row[`Option${optIdx + 1}`] = optVal;
            if (optionMarks[optIdx] !== '') row[`Option${optIdx + 1} Marks`] = parseFloat(optionMarks[optIdx]);
            const feedbackLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const feedbackKey = `FeedbackOption${feedbackLetters[optIdx]}`;
            row[`Feedback Option${optIdx + 1}`] = formatFeedbackForExport((q as any)[feedbackKey] || '');
          });
          selectBlankData.push(row);
        } else if (questionType === 'Fill In the Blank') {
          const row: any = {
            ...rowData,
            'Question Identifier': identifier.replace('$', '_'),
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': 'Fill In the Blank',
            'Max Score': computedMaxScore,
            'Correct Answer': Array.isArray(q?.CorrectAnswer) ? q.CorrectAnswer.join(', ') : String(q?.CorrectAnswer ?? ''),
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Creativity Level': creativitylevelname,
            'Rating': (() => {
              const rating = q.Rating ?? q.rating ?? q.ratingid ?? q[15];
              if (rating === 1 || rating === '1') return 'Good';
              if (rating === 2 || rating === '2') return 'Poor';
              return 'N/A';
            })(),
            'Rating Feedback': (() => {
              // Check sessionStorage cache first (where feedback is stored after submission)
              const storageKey = `questionFeedback:${q.questionrequestid}:${q.numericId}`;
              const cachedFeedback = (() => {
                try {
                  const cached = sessionStorage.getItem(storageKey);
                  return cached ? JSON.parse(cached).feedback : null;
                } catch { return null; }
              })();

              // Use cached feedback, then field values, then array index
              const feedback = cachedFeedback ?? q.rating_feedback ?? q.Rating_Feedback ?? q.rating_feedback ?? q.ratingfeedback ?? q.RatingFeedback ?? q[16];
              console.log(`Rating Feedback for Question ID ${q.id}:`, feedback, '(cached:', cachedFeedback, ')');
              return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A';
            })(),
            'Generated Image URL': formatImageForExport(generatedImageUrl)
          };
          const val0 = q.values?.[0];
          if (typeof val0 !== 'undefined') row['Option'] = String(val0).substring(3);
          if (typeof (q as any)['FeedbackOptionA'] !== 'undefined') row['Feedback Option'] = (q as any)['FeedbackOptionA'];
          fibData.push(row);
        } else if (questionType === 'Written Response') {
          const row: any = {
            ...rowData,
            'Question Identifier': identifier.replace('$', '_'),
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': 'Written Response',
            'Max Score': computedMaxScore,
            'Correct Answer': (() => { const ca = q?.CorrectAnswer; return Array.isArray(ca) ? ca.join(', ') : String(ca ?? ''); })(),
            'KeyPoints': Array.isArray(q?.KeyPoints) ? q.KeyPoints.join('\n') : (q?.KeyPoints || ''),
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Creativity Level': creativitylevelname,
            'Rating': (() => {
              const rating = q.Rating ?? q.rating ?? q.ratingid ?? q[15];
              if (rating === 1 || rating === '1') return 'Good';
              if (rating === 2 || rating === '2') return 'Poor';
              return 'N/A';
            })(),
            'Rating Feedback': (() => {
              // Check sessionStorage cache first (where feedback is stored after submission)
              const storageKey = `questionFeedback:${q.questionrequestid}:${q.numericId}`;
              const cachedFeedback = (() => {
                try {
                  const cached = sessionStorage.getItem(storageKey);
                  return cached ? JSON.parse(cached).feedback : null;
                } catch { return null; }
              })();

              // Use cached feedback, then field values, then array index
              const feedback = cachedFeedback ?? q.rating_feedback ?? q.Rating_Feedback ?? q.rating_feedback ?? q.ratingfeedback ?? q.RatingFeedback ?? q[16];
              console.log(`Rating Feedback for Question ID ${q.id}:`, feedback, '(cached:', cachedFeedback, ')');
              return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A';
            })(),
            'Generated Image URL': formatImageForExport(generatedImageUrl)
          };
          wrData.push(row);
        } else if (questionType === 'Matrix') {
          // Build Matrix row similar to abc
          try {
            const rows = typeof q.rows === 'string' ? JSON.parse(q.rows) : q.rows || [];
            const cols = typeof q.columns === 'string' ? JSON.parse(q.columns) : q.columns || [];
            const ca = typeof q.CorrectAnswer === 'string' ? JSON.parse(q.CorrectAnswer) : q.CorrectAnswer || [];
            let fbsArr: string[] = [];
            try {
              const feedbacksRaw = (q as any).Feedbacks || (q as any).feedbacks;
              if (typeof feedbacksRaw === 'string') {
                fbsArr = JSON.parse(feedbacksRaw) || [];
              } else if (Array.isArray(feedbacksRaw)) {
                fbsArr = feedbacksRaw;
              }
            } catch {
              fbsArr = [];
            }
            const cleanFbs = fbsArr.map(f => String(f || '').trim()).filter(Boolean);
            const formattedFeedbacks = cleanFbs.length > 0
              ? cleanFbs.map((fb, index) => `Row ${index + 1}: ${fb}`).join('\n')
              : 'N/A';
            const row: any = {
              ...rowData,
              'Question Identifier': identifier.replace('$', '_'),
              'Question Stem': stemRich,
              'Passage': passageText,
              'Reference Table': referenceTableText,
              'Type': 'Matrix',
              'Max Score': computedMaxScore,
              'Rows': Array.isArray(rows) ? rows.map((r: any) => `* ${String(r?.text ?? '')}`).join('\n') : '',
              'Columns': Array.isArray(cols) ? cols.map((c: any) => `* ${String(c?.text ?? '')}`).join('\n') : '',
              'Correct Answer': Array.isArray(rows) && Array.isArray(cols) && Array.isArray(ca)
                ? rows.map((r: any, ri: number) => {
                  const ci = ca[ri];
                  if (ci !== undefined && cols[ci]) return `* ${r.text} => ${cols[ci].text}`;
                  return `* ${r.text}: N/A`;
                }).join('\n')
                : '',
              'Feedbacks': formattedFeedbacks,
              'Source': source,
              'Book Name': bookName,
              'User Details': userDetails,
              'Study': study,
              'Learning Objectives': learningOutcome,
              'Creativity Level': creativitylevelname,
              'Taxonomy': taxonomy,
              'Rating': (() => {
                const rating = q.Rating ?? q.rating ?? q.ratingid ?? q[15];
                if (rating === 1 || rating === '1') return 'Good';
                if (rating === 2 || rating === '2') return 'Poor';
                return 'N/A';
              })(),
              'Rating Feedback': (() => {
                // Check sessionStorage cache first (where feedback is stored after submission)
                const storageKey = `questionFeedback:${q.questionrequestid}:${q.numericId}`;
                const cachedFeedback = (() => {
                  try {
                    const cached = sessionStorage.getItem(storageKey);
                    return cached ? JSON.parse(cached).feedback : null;
                  } catch { return null; }
                })();

                // Use cached feedback, then field values, then array index
                const feedback = cachedFeedback ?? q.rating_feedback ?? q.Rating_Feedback ?? q.rating_feedback ?? q.ratingfeedback ?? q.RatingFeedback ?? q[16];
                console.log(`Matrix Rating Feedback for Question ID ${q.id}:`, feedback, '(cached:', cachedFeedback, ')');
                return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A';
              })(),
              'Generated Image URL': formatImageForExport(generatedImageUrl)
            };
            matrixData.push(row);
          } catch { }
        }
      });

      const workbook = new ExcelJS.Workbook();

      const autoWrap = (sheet: any) => {
        sheet.columns.forEach((col: any, idx: number) => {
          sheet.getColumn(idx + 1).alignment = { wrapText: true, vertical: 'top' };
        });
      };

      // Question text can carry virtual-keyboard HTML or LaTeX. Written to the
      // sheet as-is it shows up as junk characters, so every text cell is
      // normalised to readable notation on the way out. URL/image/number cells
      // are left untouched.
      // Only the columns that actually carry question content are rewritten.
      // Metadata such as the identifier or the book name ("Grade_6-Math_Fractions")
      // must be written through untouched.
      const CONTENT_EXCEL_KEYS = new Set([
        'Question Stem', 'Passage', 'Reference Table', 'Correct Answer',
        'Key Points', 'KeyPoints', 'Feedbacks', 'Rating Feedback',
      ]);
      const isContentColumn = (key: string) =>
        CONTENT_EXCEL_KEYS.has(key) || /^Option\d+$/.test(key) || key.startsWith('Feedback Option');

      const normalizeRowForExcel = (row: any) => {
        if (!row || typeof row !== 'object') return row;
        const out: any = {};
        Object.keys(row).forEach(key => {
          const value = row[key];
          if (!isContentColumn(key) || value === null || value === undefined) {
            out[key] = value;
            return;
          }
          if (typeof value === 'string') {
            out[key] = toExportText(value);
            return;
          }
          // Rich-text stem cells: { richText: [{ text }] }
          if (typeof value === 'object' && Array.isArray((value as any).richText)) {
            out[key] = {
              ...value,
              richText: (value as any).richText.map((part: any) => ({
                ...part,
                text: toExportText(part?.text),
              })),
            };
            return;
          }
          out[key] = value;
        });
        return out;
      };

      // Images are loaded before the (synchronous) sheet writers run. Manually added
      // images are blob URLs rather than data URIs and previously were not embedded
      // at all; they are now fetched like any other image.
      const excelImageCache = new Map<string, any>();
      const preloadExcelImages = async (rowSets: any[][]) => {
        const sources = Array.from(new Set(
          rowSets.flat().flatMap(rowImageSources)
        ));
        for (const src of sources) {
          const img = await loadExportImage(src);
          if (img) excelImageCache.set(src, img);
        }
      };
      await preloadExcelImages([mcqData, mrData, tfData, selectBlankData, fibData, wrData, matrixData]);

      const addSheet = (name: string, rows: any[], config: { base: any[], dynamic?: (rows: any[]) => any[], tail: any[] }) => {
        if (!rows.length) return;
        const sheet = workbook.addWorksheet(name);
        const columns: any[] = [...config.base];
        if (config.dynamic) columns.push(...config.dynamic(rows));
        columns.push(...config.tail);
        sheet.columns = columns;
        // The last configured column is "Generated Image URL"; the pictures start
        // there and, when a question has more than one, continue into extra columns.
        const imgColIndex = columns.length - 1;

        rows.forEach((r) => {
          sheet.addRow(normalizeRowForExcel(r));
        });

        // One column per picture; see utils/excelImages. A question can carry an AI
        // generated image AND one the user added, and only the first used to reach
        // the sheet.
        embedRowImages(workbook, sheet, rows, {
          firstImageColumn: imgColIndex + 1,
          cache: excelImageCache,
          keepFirstHeader: true,
          headerLabel: 'Generated Image',
        });

        sheet.getRow(1).font = { bold: true };
        return sheet;
      };

      // MCQ sheet
      // Shared dynamic column builder: adds Passage/Reference Table when present, then options/feedback
      const buildDynamicCols = (rows: any[], extraAfterPassage: any[] = []) => {
        const cols: any[] = [];
        const hasPassage = rows.some((r: any) => String(r?.Passage || '').trim() !== '');
        const hasTable = rows.some((r: any) => String(r?.['Reference Table'] || '').trim() !== '');
        if (hasPassage) cols.push({ header: 'Passage', key: 'Passage', width: 150 });
        if (hasTable) cols.push({ header: 'Reference Table', key: 'Reference Table', width: 150 });
        cols.push(...extraAfterPassage);
        return cols;
      };

      const mcqSheet = addSheet('Multiple Choice', mcqData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 }
        ],
        dynamic: (rows) => {
          const allKeys = rows.flatMap((row: any) => Object.keys(row));
          const optionKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Option') && !k.includes('Marks'))))
            .sort((a, b) => parseInt(a.replace('Option', ''), 10) - parseInt(b.replace('Option', ''), 40));
          const feedbackKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Feedback Option'))))
            .sort((a, b) => parseInt(a.replace('Feedback Option', ''), 10) - parseInt(b.replace('Feedback Option', ''), 10));
          const optionCols: any[] = [];
          optionKeys.forEach(key => { optionCols.push({ header: key, key, width: 30 }); });
          feedbackKeys.forEach(key => optionCols.push({ header: key, key, width: 40 }));
          return buildDynamicCols(rows, optionCols);
        },
        tail: [
          { header: 'Correct Answer', key: 'Correct Answer', width: 20 },
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Rating', key: 'Rating', width: 20 },
          { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 }
        ]
      });
      if (mcqSheet) autoWrap(mcqSheet);

      // Select the Blank sheet
      const selectBlankSheet = addSheet('Select the Blank', selectBlankData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 150 }
        ],
        dynamic: (rows) => {
          const cols: any[] = [];
          const hasPassage = rows.some((r: any) => String(r?.Passage || '').trim() !== '');
          const hasTable = rows.some((r: any) => String(r?.['Reference Table'] || '').trim() !== '');
          if (hasPassage) cols.push({ header: 'Passage', key: 'Passage', width: 150 });
          if (hasTable) cols.push({ header: 'Reference Table', key: 'Reference Table', width: 150 });
          cols.push({ header: 'Type', key: 'Type', width: 15 });
          cols.push({ header: 'Max Score', key: 'Max Score', width: 10 });
          cols.push({ header: 'Correct Answer', key: 'Correct Answer', width: 25 });
          // Only when at least one exported question has key points, so the column
          // never appears empty for the questions that carry none.
          if (rows.some((r: any) => String(r?.KeyPoints || '').trim() !== '')) {
            cols.push({ header: 'Key Points', key: 'KeyPoints', width: 200 });
          }

          const allKeys = rows.flatMap((row: any) => Object.keys(row));
          const optionKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Option') && !k.includes('Marks'))))
            .sort((a, b) => parseInt(a.replace('Option', ''), 10) - parseInt(b.replace('Option', ''), 10));
          const feedbackKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Feedback Option'))))
            .sort((a, b) => parseInt(a.replace('Feedback Option', ''), 10) - parseInt(b.replace('Feedback Option', ''), 10));
          optionKeys.forEach(key => cols.push({ header: key, key, width: 30 }));
          feedbackKeys.forEach(key => cols.push({ header: key, key, width: 40 }));
          return cols;
        },
        tail: [
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Rating', key: 'Rating', width: 20 },
          { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 }
        ]
      });
      if (selectBlankSheet) autoWrap(selectBlankSheet);

      // MR sheet
      const mrSheet = addSheet('Multiple Response', mrData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 }
        ],
        dynamic: (rows) => {
          const allKeys = rows.flatMap((row: any) => Object.keys(row));
          const optionKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Option') && !k.includes('Marks'))))
            .sort((a, b) => parseInt(a.replace('Option', ''), 10) - parseInt(b.replace('Option', ''), 40));
          const feedbackKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Feedback Option'))))
            .sort((a, b) => parseInt(a.replace('Feedback Option', ''), 10) - parseInt(b.replace('Feedback Option', ''), 10));
          const optionCols: any[] = [];
          optionKeys.forEach(key => { optionCols.push({ header: key, key, width: 30 }); });
          feedbackKeys.forEach(key => optionCols.push({ header: key, key, width: 40 }));
          return buildDynamicCols(rows, optionCols);
        },
        tail: [
          { header: 'Correct Answer', key: 'Correct Answer', width: 20 },
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Rating', key: 'Rating', width: 20 },
          { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 }
        ]
      });
      if (mrSheet) autoWrap(mrSheet);

      // WR sheet
      const wrSheet = addSheet('Written Response', wrData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 },
          { header: 'Correct Answer', key: 'Correct Answer', width: 200 },
          { header: 'Key Points', key: 'KeyPoints', width: 200 }
        ],
        dynamic: (rows) => buildDynamicCols(rows),
        tail: [
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Rating', key: 'Rating', width: 20 },
          { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 }
        ]
      });
      if (wrSheet) autoWrap(wrSheet);

      // TF sheet
      const tfSheet = addSheet('True False', tfData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 },
          { header: 'Option1', key: 'Option1', width: 20 },
          { header: 'Option1 Marks', key: 'Option1 Marks', width: 15 },
          { header: 'Option2', key: 'Option2', width: 20 },
          { header: 'Option2 Marks', key: 'Option2 Marks', width: 15 }
        ],
        dynamic: (rows) => buildDynamicCols(rows),
        tail: [
          { header: 'Correct Answer', key: 'Correct Answer', width: 20 },
          { header: 'Feedback Option1', key: 'Feedback Option1', width: 20 },
          { header: 'Feedback Option2', key: 'Feedback Option2', width: 20 },
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Rating', key: 'Rating', width: 20 },
          { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 }
        ]
      });
      if (tfSheet) autoWrap(tfSheet);

      // FIB sheet
      const fibSheet = addSheet('Fill In the Blank', fibData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 }
        ],
        dynamic: (rows) => buildDynamicCols(rows),
        tail: [
          { header: 'Correct Answer', key: 'Correct Answer', width: 20 },
          { header: 'Feedback Option', key: 'Feedback Option', width: 20 },
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Rating', key: 'Rating', width: 20 },
          { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 }
        ]
      });
      if (fibSheet) autoWrap(fibSheet);

      // Matrix sheet
      const matrixSheet = addSheet('Matrix', matrixData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 },
          { header: 'Rows', key: 'Rows', width: 60 },
          { header: 'Columns', key: 'Columns', width: 60 },
          { header: 'Correct Answer', key: 'Correct Answer', width: 115 },
          { header: 'Feedbacks', key: 'Feedbacks', width: 115 }
        ],
        dynamic: (rows) => buildDynamicCols(rows),
        tail: [
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Rating', key: 'Rating', width: 20 },
          { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 }
        ]
      });
      if (matrixSheet) autoWrap(matrixSheet);

      const now = new Date();
      const formattedDateTime = format(now, 'yyyy-MM-dd');
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `${chapterName}_${formattedDateTime}.xlsx`);
      // See the Word export: the selection is kept so it still applies afterwards.
    } catch (e) {
      window.alert('Failed to export to Excel.');
    }
  };

  const handleExportMetadataToExcel = async () => {
    try {
      const ExcelJSImport: any = await import('exceljs');
      const ExcelJS: any = ExcelJSImport?.default || ExcelJSImport;
      const { saveAs } = await import('file-saver');
      const { format } = await import('date-fns');

      // See the note on the Word export: honour the client-side Passage Type filter.
      let results: any[] = selectedQuestions.length > 0
        ? displayedQuestions.filter(q => selectedQuestions.includes(q.id))
        : displayedQuestions;

      // Only export questions that actually have metadata
      results = Array.isArray(results) ? results.filter(q => q && q.metadata && parseQuestionMetadata(q.metadata).length > 0) : [];

      if (!results.length) {
        // Shown in the app's own dialog rather than a browser alert, matching how the
        // metadata actions already report their outcome.
        setSuccessMessage('No selected questions contain metadata to export.');
        setShowSuccessDialog(true);
        return;
      }

      const chapterName = sessionStorage.getItem('bookTitle') || 'questions_metadata';
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Metadata');

      // Discover all unique metadata keys across all questions to build columns dynamically
      const metadataKeys = new Set<string>();
      // Same reader as the Metadata Details popup: the exported cell is exactly the
      // value that was saved, never a value guessed from an explanation sentence.
      results.forEach(q => {
        const metaList = getMetadataDisplayRows(q.metadata);
        metaList.forEach(m => metadataKeys.add(m.key));
      });
      const sortedKeys = Array.from(metadataKeys).sort();

      const columns = [
        { header: 'Item code', key: 'Item code', width: 40 },
        { header: 'Item name', key: 'Item name', width: 100 },
        ...sortedKeys.map(k => ({ header: k, key: k, width: 30 }))
      ];

      sheet.columns = columns;

      results.forEach((q: any) => {
        const rowData: any = {
          'Item code': String(q.questionidentifier || q.QuestionIdentifier || q.question_id || q.id || '').replace('$', '_'),
          'Item name': formatStemForExport(q.label || q.QuestionStatement || q.Question || q.text || q.QuestionText || '')
        };

        const metaList = getMetadataDisplayRows(q.metadata);
        const metaMap = new Map(metaList.map(m => [m.key, m.value]));

        sortedKeys.forEach(k => {
          rowData[k] = metaMap.has(k) ? metaMap.get(k) || '' : '';
        });

        sheet.addRow(rowData);
      });

      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((col: any, idx: number) => {
        sheet.getColumn(idx + 1).alignment = { wrapText: true, vertical: 'top' };
      });

      const now = new Date();
      const formattedDateTime = format(now, 'yyyy-MM-dd');
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `${chapterName}_metadata_${formattedDateTime}.xlsx`);
      // See the Word export: the selection is kept so it still applies afterwards.
    } catch (e) {
      window.alert('Failed to export metadata to Excel.');
    }
  };

  function handleGo() {
    fetchData({
      searchText,
      chapterCode: selectedChapter,
      // Same resolver as fetchData, so Go and the dropdown can never disagree. The
      // old inline chain also had no case for Select the Blank, which sent "0" (All).
      questionType: String(resolveQuestionTypeId(selectedQuestionType)),
      taxonomy: TAXONOMY_FILTER_IDS[selectedTaxonomy] || "0",
      learningObjective: selectedLO,
      creativityLevel: selectedCreativityLevel, // Pass creativity level to fetchData
      sourceType: selectedSourceType,
      rating: selectedRating,
    });
  }
  function handleSelectAll(questions: { [key: string]: any; id: string; question?: string; type?: string; topic?: string; creativityLevel?: string; created?: string; questionrequestid?: string; }[]): void {
    //console.log('[QuestionRepository] handleSelectAll called');
    //console.log('[QuestionRepository] Current selectedQuestions count:', selectedQuestions.length);
    //console.log('[QuestionRepository] Total questions count:', questions.length);

    if (selectedQuestions.length === questions.length) {
      //console.log('[QuestionRepository] Deselecting all questions');
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(questions.map(q => q.id));
    }
  }
  const handleEditClick = (question: any) => {
    setEditQuestion(question);

    // Initialize key points from the question
    if (question?.KeyPoints) {
      if (Array.isArray(question.KeyPoints)) {
        setKeyPoints(question.KeyPoints.length > 0 ? [...question.KeyPoints] : ['']);
      } else if (typeof question.KeyPoints === 'string') {
        try {
          const parsed = JSON.parse(question.KeyPoints);
          setKeyPoints(Array.isArray(parsed) && parsed.length > 0 ? parsed : ['']);
        } catch (e) {
          setKeyPoints(['']);
        }
      } else {
        setKeyPoints(['']);
      }
    } else {
      setKeyPoints(['']);
    }

    setEditOpen(true);
  };

  // Handle adding a new key point
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isCheckingBulkDeleteValidation, setIsCheckingBulkDeleteValidation] = useState(false);
  const [isBulkDeletingQuestionValidated, setIsBulkDeletingQuestionValidated] = useState(false);
  const [showBulkValidateConfirmDialog, setShowBulkValidateConfirmDialog] = useState(false);
  const [showSelectPromptDialog, setShowSelectPromptDialog] = useState(false);
  const [showBulkMetadataConfirmDialog, setShowBulkMetadataConfirmDialog] = useState(false);
  const [showSelectMetadataPromptDialog, setShowSelectMetadataPromptDialog] = useState(false);

  // Validation Progress states
  const [showBulkValidateStartDialog, setShowBulkValidateStartDialog] = useState(false);
  const [showSingleValidateConfirmDialog, setShowSingleValidateConfirmDialog] = useState(false);
  const [singleQuestionToValidate, setSingleQuestionToValidate] = useState<string | null>(null);
  const [showValidationProgressDialog, setShowValidationProgressDialog] = useState(false);
  const [validationProgressPct, setValidationProgressPct] = useState(0);
  const [validationStatusStr, setValidationStatusStr] = useState("");
  const [validationRunDetails, setValidationRunDetails] = useState<any>(null);
  // Item code -> the analysis run holding it, for every question already validated.
  // Each row reads its state from this without opening the 3-dot menu, and because the
  // run id is kept too, opening the report needs no lookup at all. Editing a question
  // removes its record (see clearValidationForEditedQuestion), which is what makes an
  // edited question count as unvalidated again.
  const [validatedItemRuns, setValidatedItemRuns] = useState<Map<string, { itemCode: string; runId: string }>>(new Map());
  // Question IDs currently being validated — drives the per-row loading spinner.
  const [validatingQuestionIds, setValidatingQuestionIds] = useState<Set<string>>(new Set());
  // Question IDs whose metadata is being generated — same per-row treatment as
  // validation, so the page stays usable while the request runs.
  const [metadataGeneratingIds, setMetadataGeneratingIds] = useState<Set<string>>(new Set());
  // Question IDs whose similarity is being worked out from the row menu, and the
  // ones it has finished for (those become clickable even when saved today).
  // The finished ones are remembered for the session, so coming back from the
  // Check Similarity page does not grey the icon out again.
  const [similarityRunningIds, setSimilarityRunningIds] = useState<Set<string>>(new Set());
  const [similarityReadyIds, setSimilarityReadyIds] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(SIMILARITY_READY_STORAGE_KEY) || '[]');
      return new Set(Array.isArray(stored) ? stored.map(String) : []);
    } catch {
      return new Set<string>();
    }
  });

  const markSimilarityReady = useCallback((rowKey: string) => {
    setSimilarityReadyIds(prev => {
      const next = new Set(prev).add(rowKey);
      try { sessionStorage.setItem(SIMILARITY_READY_STORAGE_KEY, JSON.stringify([...next])); } catch { }
      return next;
    });
  }, []);
  // Progress popup for metadata generation — the same shape as the validation one.
  const [showMetadataProgressDialog, setShowMetadataProgressDialog] = useState(false);
  const [metadataStatusStr, setMetadataStatusStr] = useState<string>("");
  // Progress popup for the single similarity check — same shape again.
  const [showSimilarityProgressDialog, setShowSimilarityProgressDialog] = useState(false);
  const [similarityStatusStr, setSimilarityStatusStr] = useState<string>("");
  const [similarityErrorStr, setSimilarityErrorStr] = useState<string>("");
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);
  const [showBulkDeleteResult, setShowBulkDeleteResult] = useState(false);

  const handleBulkDeleteClick = async () => {
    if (selectedQuestions.length === 0) {
      setBulkDeleteCount(0);
      setShowBulkDeleteResult(true);
      return;
    }

    setIsCheckingBulkDeleteValidation(true);
    setIsBulkDeletingQuestionValidated(false);

    try {
      for (const qid of selectedQuestions) {
        const q = questions.find(q => q.id === qid);
        if (q) {
          const itemCode = await resolveValidationItemCode(q);
          if (itemCode) {
            const run = await findValidationItemRun(itemCode);
            if (run) {
              setIsBulkDeletingQuestionValidated(true);
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to check if any questions in bulk are validated before delete", e);
    } finally {
      setIsCheckingBulkDeleteValidation(false);
      setShowBulkDeleteDialog(true);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    setShowBulkDeleteDialog(false);
    let successCount = 0;
    let usercode = "";
    try {
      const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
      usercode = userInfo.userCode || "";
    } catch { }

    const itemCodesToProcess: string[] = [];

    // Collect itemCodes for validation API calls
    for (const qid of selectedQuestions) {
      const q = questions.find(q => q.id === qid);
      if (!q) continue;

      let itemCode = getDirectQuestionItemCode(q);
      const questionrequestid = q.questionrequestid;

      if (!itemCode && questionrequestid) {
        const orgcode = sessionStorage.getItem('orgcode') || sessionStorage.getItem('orgCode') || '';
        const custcode = sessionStorage.getItem('custcode') || sessionStorage.getItem('customerCode') || '';
        if (orgcode && custcode) {
          try {
            const response = await axios.get(`${AIG_QUIZ_GEN_URL}/get-itemvalidation-data`, {
              params: { orgcode, custcode, questionrequestid: questionrequestid }
            });
            const items = parseValidationItemsResponse(response.data);
            const lookupKeys = getQuestionLookupKeys(q);
            const matchedItem = items.find((item: any) => {
              const itId = Array.isArray(item) ? item[1] : item?.itemid ?? item?.itemId;
              const itCode = Array.isArray(item) ? item[7] : item?.itemcode ?? item?.itemCode;
              return lookupKeys.includes(String(itId ?? '').trim()) || lookupKeys.includes(String(itCode ?? '').trim());
            });
            if (matchedItem) {
              itemCode = String(Array.isArray(matchedItem) ? matchedItem[7] : matchedItem?.itemcode ?? matchedItem?.itemCode ?? '');
            }
          } catch (err) {
            console.warn("Failed to fetch item validation data for bulk delete", err);
          }
        }
      }

      if (itemCode) {
        itemCodesToProcess.push(itemCode);
      }
    }

    if (itemCodesToProcess.length > 0) {
      const commaSeparatedItemCodes = itemCodesToProcess.join(',');
      console.log('Bulk delete item codes payload:', commaSeparatedItemCodes);

      try {
        const token = await getItemValidationApiAuthToken();
        await fetch(`${ITEM_VALIDATION_API_URL}/ItemValidation/DeleteItemValidationAnalysisResponse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itemId: "", itemCode: commaSeparatedItemCodes })
        });
      } catch (err) {
        console.warn("Failed to call DeleteItemValidationAnalysisResponse in bulk", err);
      }

      try {
        const token = await getItemValidationApiAuthToken();
        await fetch(`${ITEM_VALIDATION_API_URL}/ItemValidation/DeleteItemData`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itemCode: commaSeparatedItemCodes, itemId: "" })
        });
      } catch (err) {
        console.warn("Failed to call DeleteItemData in bulk", err);
      }
    }

    for (const qid of selectedQuestions) {
      const q = questions.find(q => q.id === qid);
      if (!q) continue;
      const questionid = q.numericId ? Number(q.numericId) : Number(q.id);
      const input = {
        questionid: questionid,
        questionrequestid: Number(q.questionrequestid),
        usercode: usercode || "",
      };
      try {
        const result = await deleteQuestion(input);
        if (
          result === true ||
          (
            result &&
            typeof result === "object" &&
            result !== null &&
            "status" in result &&
            Array.isArray((result as any).status) &&
            (result as any).status?.[0]?.[0] === "S001"
          )
        ) {
          successCount++;
        }
      } catch (error) { }
    }
    setBulkDeleteCount(successCount);
    setSelectedQuestions([]);
    // Reset filters so a reload doesn't carry previous selections
    clearFilters();
    await fetchData();
    setShowBulkDeleteResult(true);
  };

  const [refinementDialogOpen, setRefinementDialogOpen] = useState(false);
  const [refinementType, setRefinementType] = useState("Rewrite");
  const [refinementQuestionType, setRefinementQuestionType] = useState("");
  const [refinementNumQuestions, setRefinementNumQuestions] = useState(NumberOfQuestions?.[0] || "1");
  const [refinementTaxonomy, setRefinementTaxonomy] = useState("Remember");
  const [refinementCreativity, setRefinementCreativity] = useState("Moderate");
  const [refinementNumOptions, setRefinementNumOptions] = useState("4");
  const [refinementSourceType, setRefinementSourceType] = useState("Book Based");
  const [refinementLanguage, setRefinementLanguage] = useState("");
  const [selectedQuestionForRefinement, setSelectedQuestionForRefinement] = useState<any>(null);
  const [showRefinementSuccessDialog, setShowRefinementSuccessDialog] = useState(false);
  const [showRefinementErrorDialog, setShowRefinementErrorDialog] = useState(false);
  const [refinementSuccessMessage, setRefinementSuccessMessage] = useState("");
  const [refinementErrorMessage, setRefinementErrorMessage] = useState("");
  // Function to reset refinement form to default values
  const resetRefinementForm = () => {
    setRefinementType("Rewrite");
    setRefinementQuestionType("Multiple Choice");
    setRefinementNumQuestions(NumberOfQuestions?.[0] || "1");
    setRefinementTaxonomy("Remember");
    setRefinementCreativity("Moderate");
    setRefinementNumOptions("4");
    setRefinementSourceType("Book Based");
    setRefinementLanguage("");
    setSelectedQuestionForRefinement(null);
  };

  // Additional state variables needed for language conversion
  const [allTaxonomies, setAllTaxonomies] = useState<any[]>([]);
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [BookId, setBookId] = useState<string>("");
  const [selectedChapterCode, setSelectedChapterCode] = useState<string>("");
  const [selectedChapterName, setSelectedChapterName] = useState<string>("");
  const [looutcomesId, setLooutcomesId] = useState<string>("");
  const [looutcomesName, setLooutcomesName] = useState<string>("");
  const [difficultylevelid, setDifficultylevelid] = useState<number>(0);
  const [rewriteSourceType, setRewriteSourceType] = useState<string>("1");
  const [rewriteQuestionType, setRewriteQuestionType] = useState<string>("1");
  const [rewriteTaxonomy, setRewriteTaxonomy] = useState<string>("1");
  const [rewriteCreativityLevel, setRewriteCreativityLevel] = useState<string>("1");
  const [rewriteLanguage, setRewriteLanguage] = useState<string>("en");
  const [rewriteQuestionTarget, setRewriteQuestionTarget] = useState<any>(null);
  const [rewriteQuestionCount, setRewriteQuestionCount] = useState<string>("1");
  const [rewriteNumOptions, setRewriteNumOptions] = useState<string>("4");
  const [rewriteNumCorrect, setRewriteNumCorrect] = useState<string>("2");

  // Auto-set language default only if unset when opening dialog
  useEffect(() => {
    if (refinementDialogOpen && refinementType === 'Language Conversion') {
      // Reset language state when switching to Language Conversion to ensure fresh selection
      setRefinementLanguage("");
      // Set a sensible default after reset
      const options = getAvailableLanguages();
      if (options.length > 0) {
        setRefinementLanguage(options[0].value);
      }
    } else if (refinementDialogOpen && refinementType !== 'Language Conversion') {
      // Clear language state when switching away from Language Conversion
      setRefinementLanguage("");
    }
  }, [refinementDialogOpen, refinementType]);

  // Language map for conversion
  const languageMap: { [key: string]: string } = {
    'en': 'English',
    'ms': 'Malay',
    'ta': 'Tamil',
    'ar': 'Arabic',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'es': 'Spanish',
    'ru': 'Russian',
    'fr': 'French',
    'vi': 'Vietnamese',
    'ko': 'Korean',
    'uk': 'Ukrainian',
    'cy': 'Welsh',
    'tr': 'Turkish',
    'pl': 'Polish',
    'es-MX': 'Spanish (Mexico)',
    'el': 'Greek',
    'zh-TW': 'Chinese (Traditional)',
    'sv': 'Swedish',
    'lv': 'Latvian',
    'no': 'Norwegian',
    'hu': 'Hungarian',
    'lt': 'Lithuanian',
    'it': 'Italian',
    'th': 'Thai',
    'hi': 'Hindi',
    'de': 'German'
  };

  // Normalize language input (accept codes like 'en', locales like 'en-US', or labels like 'English')
  const normalizeLanguageCode = (val?: string) => {
    if (!val) return '';
    const v = String(val).trim();
    // Exact code match
    if (languageMap[v]) return v;
    // If label provided, find corresponding key (case-insensitive)
    const foundKey = Object.keys(languageMap).find(k => languageMap[k].toLowerCase() === v.toLowerCase());
    if (foundKey) return foundKey;
    // If locale (e.g., en-US), try primary subtag
    const parts = v.split(/[-_]/);
    if (parts.length > 1 && languageMap[parts[0]]) return parts[0];
    // Try first two letters
    const short = v.slice(0, 2).toLowerCase();
    if (languageMap[short]) return short;
    return '';
  };

  // When opening the refinement dialog for Language Conversion, preselect a sensible default
  // useEffect(() => {
  //   if (refinementDialogOpen && refinementType === 'Language Conversion') {
  //     const options = getAvailableLanguages();
  //     if ((!refinementLanguage || refinementLanguage.trim().length === 0) && options.length > 0) {
  //       setRefinementLanguage(options[0].value);
  //     }
  //   }
  // }, [refinementDialogOpen, refinementType, selectedQuestionForRefinement]);

  // Get available languages based on current question language
  // Return all supported languages except the source language so user can pick any target
  const getAvailableLanguages = () => {
    const currentLanguageRaw = selectedQuestionForRefinement?.language || selectedQuestionForRefinement?.Language || '';
    const currentLanguage = normalizeLanguageCode(currentLanguageRaw);
    const entries = Object.entries(languageMap).map(([value, label]) => ({ value, label }));

    // Check if this is an English-type question (including converted from other languages)
    const quesOrigin = selectedQuestionForRefinement?.quesOrigin;
    const isEnglishType = !quesOrigin || quesOrigin === 'English' || quesOrigin === 'en';

    // If current language is NOT English, only allow converting to English
    if (currentLanguage && currentLanguage !== 'en') {
      return [{ value: 'en', label: languageMap['en'] }];
    }

    // If this is an English-type question, show all languages
    // If this is an English-type question, show all languages except English
    if (isEnglishType) {
      return entries.filter(lang => lang.value !== 'en'); // Show all languages except English
    }

    // For non-English questions, only show English as target
    return [{ value: 'en', label: languageMap['en'] }];
  };

  // Ensure sensible default selection for Language Conversion
  // useEffect(() => {
  //   if (refinementDialogOpen && refinementType === 'Language Conversion') {
  //     const srcLang = normalizeLanguageCode(selectedQuestionForRefinement?.language || selectedQuestionForRefinement?.Language);
  //     // If source is non-English, force target to English
  //     if (srcLang && srcLang !== 'en') {
  //       setRefinementLanguage('en');
  //     } else {
  //       // Source is English: default selection should be English
  //       setRefinementLanguage('en');
  //     }
  //   }
  // }, [refinementDialogOpen, refinementType, selectedQuestionForRefinement]);

  // Language-specific instruction text for Multiple Response questions
  const selectInstructionMap: { [key: string]: (count: number) => string } = {
    'en': (count) => `Select the ${count} correct options`,
    'ms': (count) => `Pilih ${count} pilihan yang betul`,
    'ta': (count) => `${count} சரியான விருப்பங்களைத் தேர்ந்தெடுக்கவும்`,
    'ar': (count) => `اختر ${count} خيارات صحيحة`,
    'zh': (count) => `选择 ${count} 个正确选项`,
    'ja': (count) => `${count} つの正しいオプションを選択してください`,
    'es': (count) => `Seleccione las ${count} opciones correctas`,
    'ru': (count) => `Выберите ${count} правильных ответов`,
    'fr': (count) => `Sélectionnez les ${count} options correctes`,
    'vi': (count) => `Chọn ${count} tùy chọn đúng`,
    'ko': (count) => `${count}개의 정답을 선택하세요`,
    'uk': (count) => `Виберіть ${count} правильних варіантів`,
    'cy': (count) => `Dewiswch yr ${count} opsiwn cywir`,
    'tr': (count) => `${count} doğru seçeneği seçin`,
    'pl': (count) => `Wybierz ${count} poprawnych opcji`,
    'es-MX': (count) => `Seleccione las ${count} opciones correctas`,
    'el': (count) => `Επιλέξτε τις ${count} σωστές επιλογές`,
    'zh-TW': (count) => `選擇 ${count} 個正確選項`,
    'sv': (count) => `Välj de ${count} korrekta alternativen`,
    'lv': (count) => `Izvēlieties ${count} pareizās opcijas`,
    'no': (count) => `Velg de ${count} riktige alternativene`,
    'hu': (count) => `Válassza ki a(z) ${count} helyes lehetőséget`,
    'lt': (count) => `Pasirinkite ${count} teisingus variantus`,
    'it': (count) => `Seleziona le ${count} opzioni corrette`,
    'th': (count) => `เลือก ${count} ตัวเลือกที่ถูกต้อง`,
    'hi': (count) => `${count} सही विकल्प चुनें`,
    'de': (count) => `Wählen Sie die ${count} richtigen Optionen`
  };

  const getSelectInstruction = (count: number) => {
    const instructionFn = selectInstructionMap[rewriteLanguage] || selectInstructionMap['en'];
    return instructionFn(count);
  };

  // Function to check if current refinement parameters match the original question
  const areParametersSameAsOriginal = () => {
    if (!selectedQuestionForRefinement) return false;

    // Check question type
    const originalQuestionType = selectedQuestionForRefinement.type || selectedQuestionForRefinement.questiontype || 'Multiple Choice';
    let currentQuestionType = refinementQuestionType;
    if (currentQuestionType === 'multiple-choice') currentQuestionType = 'Multiple Choice';
    if (currentQuestionType === 'Multiple Response') currentQuestionType = 'Multiple Response';
    if (currentQuestionType === 'Written Response') currentQuestionType = 'Written Response';
    if (currentQuestionType === 'True False') currentQuestionType = 'True False';
    if (currentQuestionType === 'Matrix') currentQuestionType = 'Matrix';
    if (currentQuestionType === 'Fill In the Blank') currentQuestionType = 'Fill In the Blank';

    const questionTypeMatch = originalQuestionType.toLowerCase() === currentQuestionType.toLowerCase();

    // Check taxonomy
    const originalTaxonomy = selectedQuestionForRefinement.taxonomy || '';
    let currentTaxonomy = refinementTaxonomy;
    if (currentTaxonomy === 'remember') currentTaxonomy = 'Remember';
    if (currentTaxonomy === 'understand') currentTaxonomy = 'Understand';
    if (currentTaxonomy === 'apply') currentTaxonomy = 'Apply';
    if (currentTaxonomy === 'analyze') currentTaxonomy = 'Analyze';
    if (currentTaxonomy === 'evaluate') currentTaxonomy = 'Evaluate';
    if (currentTaxonomy === 'create') currentTaxonomy = 'Create';

    const taxonomyMatch = originalTaxonomy.toLowerCase() === currentTaxonomy.toLowerCase();

    const originalCreativityLevel = selectedQuestionForRefinement.creativitylevelname || 'Moderate';
    let currentCreativityLevel = refinementCreativity;
    if (currentCreativityLevel === 'low') currentCreativityLevel = 'Low';
    if (currentCreativityLevel === 'moderate') currentCreativityLevel = 'Moderate';
    if (currentCreativityLevel === 'high') currentCreativityLevel = 'High';
    if (currentCreativityLevel === 'very high') currentCreativityLevel = 'Very High';

    const creativityMatch = originalCreativityLevel.toLowerCase() === currentCreativityLevel.toLowerCase();

    const originalSourceType = selectedQuestionForRefinement.source || 'Book Based';
    let currentsourcetype = refinementSourceType;
    if (currentsourcetype === 'llm') currentsourcetype = 'LLM';
    if (currentsourcetype === 'book based') currentsourcetype = 'Book Based';

    const sourcetypeMatch = originalSourceType.toLowerCase() === currentsourcetype.toLowerCase();



    // For Rewrite flow: disable only when BOTH question type and taxonomy are unchanged
    if (refinementType === 'Rewrite') {
      return questionTypeMatch && taxonomyMatch && creativityMatch && sourcetypeMatch;
    }

    // Check creativity level
    const originalCreativity = String(selectedQuestionForRefinement.creativityLevel ||
      selectedQuestionForRefinement.creativitylevelname ||
      'Moderate').trim().toLowerCase();
    const currentCreativity = refinementCreativity.trim().toLowerCase();

    // For Generate Similar and Rewrite, only enable if creativity level is different
    if (refinementType === 'Generate Similar' || refinementType === 'Rewrite') {
      return originalCreativity !== currentCreativity;
    }

    // For Language Conversion, check all parameters
    return questionTypeMatch &&
      taxonomyMatch &&
      originalCreativity === currentCreativity;
  };



  const handleRewriteQuestion = async () => {
    setRefinementDialogOpen(false);
    setLoading(true);
    if (!selectedQuestionForRefinement) {
      console.error('No question selected for refinement');
      return;
    }

    try {
      // Get session storage values
      const bookTitle = sessionStorage.getItem("bookTitle") || "";
      const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
      const usercode = sessionStorage.getItem("userCode");
      const custcode = sessionStorage.getItem("custcode");
      const orgcode = sessionStorage.getItem("orgcode");
      const appcode = sessionStorage.getItem("appcode") || "AIG";
      const booknameid = sessionStorage.getItem("bookid");
      const chaptercode = sessionStorage.getItem("chaptercode");
      const locode = sessionStorage.getItem("locode");

      // Map current values to API payload format
      const questionTypeMap: { [key: string]: string } = {
        'Multiple Choice': '1',
        'multiple-choice': '1',
        'Multiple Response': '2',
        'True False': '3',
        'Written Response': '7',
        'Matrix': '8',
        'Fill In the Blank': '4',
        // Select the Blank was missing, so refining one silently fell back to
        // Multiple Choice (id 1) and no Select the Blank item was produced.
        'Select the Blank': '9',
        'Fill In the Blank Dropdown': '9'
      };

      const taxonomyMap: { [key: string]: string } = {
        'remember': '1',
        'understand': '2',
        'apply': '3',
        'analyze': '4',
        'evaluate': '5',
        'create': '6'
      };

      const creativityMap: { [key: string]: string } = {
        'low': '1',
        'moderate': '1',
        'high': '2',
        'very high': '3'
      };

      const questiontypeid = questionTypeMap[refinementQuestionType] || '1';
      const normalizedTaxonomy = refinementTaxonomy.trim().toLowerCase();
      const taxonomyid = taxonomyMap[normalizedTaxonomy] || '1';
      // Normalize the creativity level to match map keys and handle case sensitivity
      const normalizedCreativity = refinementCreativity.trim().toLowerCase();
      const creativitylevelid = creativityMap[normalizedCreativity] || '2';

      // Generate comprehensive question prompt based on question type
      let questionPrompt = '';
      const targetQuestionType = (refinementQuestionType === 'multiple-choice' || refinementQuestionType === 'Multiple Choice') ? 'Multiple Choice' :
        refinementQuestionType === 'Multiple Response' ? 'Multiple Response' :
          refinementQuestionType === 'True False' ? 'True False' :
            refinementQuestionType === 'Written Response' ? 'Written Response' :
              // Select the Blank must be checked before Fill In the Blank, and
              // must not fall through to Multiple Choice.
              (refinementQuestionType === 'Select the Blank' || refinementQuestionType === 'Fill In the Blank Dropdown') ? 'Select the Blank' :
                refinementQuestionType === 'Fill In the Blank' ? 'Fill In the Blank' :
                  refinementQuestionType === 'Matrix' ? 'Matrix' : 'Multiple Choice';

      const originalQuestionID = selectedQuestionForRefinement.id || '';
      const extractChapter = (guid: string) => {
        const parts = String(guid || '').split('_');
        return parts.find(p => /^S\d+$/i.test(p)) || parts.find(p => /^C\d+$/i.test(p)) || '';
      };
      const chapterPart = extractChapter(originalQuestionID) || String(chaptercode || '0').padStart(2, '0');
      const marks = (() => {
        const fromArray = (selectedQuestionForRefinement as any)?.[3];
        const fromObj = (selectedQuestionForRefinement as any)?.MaxMarks ?? (selectedQuestionForRefinement as any)?.maxmarks;
        const fromMarks = (selectedQuestionForRefinement as any)?.marks;
        const numeric = fromArray ?? fromObj ?? fromMarks;
        const parsed = typeof numeric === 'string' ? parseFloat(numeric) : numeric;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      })();

      const marksMappingPromptValue = (() => {
        const questionData =
          (selectedQuestionForRefinement as any)?.[2] ??
          (selectedQuestionForRefinement as any)?.questiondata ??
          (selectedQuestionForRefinement as any)?.questionData ??
          selectedQuestionForRefinement ??
          {};

        const raw = (questionData as any)?.marks ?? (selectedQuestionForRefinement as any)?.marks;
        if (!raw) return null;

        if (typeof raw === 'string') {
          try { return JSON.stringify(JSON.parse(raw)); } catch { return null; }
        }
        if (typeof raw === 'object') {
          try { return JSON.stringify(raw); } catch { return null; }
        }
        return null;
      })();
      const sourcetype = refinementSourceType === 'Book Based' ? 1 : 2;
      const taxonomyName = refinementTaxonomy.charAt(0).toUpperCase() + refinementTaxonomy.slice(1);
      const creativityLevelName = refinementCreativity === 'low' ? 'moderate' : refinementCreativity === 'moderate' ? 'high' : 'very-high';

      // Get context variables for the prompts
      const questionText = selectedQuestionForRefinement.question || selectedQuestionForRefinement.label || "";
      const enablingObjective = selectedQuestionForRefinement.learningObjective || "";
      const domain = selectedQuestionForRefinement.study || selectedQuestionForRefinement.bookname || "";

      if (targetQuestionType === 'Multiple Choice' || targetQuestionType === 'Multiple Response') {
        const optionCount = parseInt(refinementNumOptions);
        const numberOfCorrectOptions = targetQuestionType === 'Multiple Response' ? 2 : 1; // Default to 2 correct for MRQ
        const perCorrectScore = numberOfCorrectOptions > 1 ? (marks / numberOfCorrectOptions) : 0;

        if (sourcetype === 2) {
          // LLM Source Prompt
          questionPrompt = `Generate exactly ${refinementNumQuestions} ${targetQuestionType} questions based exclusively on the Domain '${domain}' and aligned with the Enabling Objective: ${enablingObjective}. 
        Each question should align with the content of the study material and the corresponding Enabling Objective, but **do not repeat or closely mirror the exact wording** of the EO statement. Instead, the questions should assess the application and deeper understanding of the content related to that Enabling objective.
        Each question must adhere to the specified Taxonomy: ${taxonomyName}. 
        Each question must reflect content strictly from the specified study material.
        
        
        
        Important:
        1. For options that are complete sentences, **add a period at the end**.
        2. For options that are not complete sentences (e.g., single words, double words, phrases), **do not add a period**.
        3. Do not provide options with missing punctuation or inconsistent use of periods.
        4. Options must start with prefix A, B, C... Ensure exactly ${optionCount} options per question.
        5. Avoid repeating correct options across number of questions generated.
        6. Options should be exactly ${optionCount}.
        7. All Options/distractors should be in same length.
        8. Avoid decimal points in options and question stem, use whole numbers only.
        9. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        
        ${targetQuestionType === 'Multiple Response' ? `
        Multiple-Response Logic:
        - There must be exactly ${numberOfCorrectOptions} correct answers.
        - Avoid repeating correct answer positions across questions.
        - No discernible patterns in correct answer placement.
        - Even distribution of correct answers across all options.
        - Plausible distractors that are relevant and related to the content.
        
        Instruction:
        - The question stem must end with: "Select the ${numberOfCorrectOptions} correct options.".
        - Provide exactly ${numberOfCorrectOptions} correct answers among the options.
        
        
        Scoring:
        - Full Marks: if all correct answers are selected.
        - Partial Marks: award ${perCorrectScore.toFixed(2)} marks for each correct option selected (no negative marking). Do not award marks for incorrect options.
        - Zero Marks: if none are correct.
        ` : ''}
        
        Ensure the options follow these punctuation rules strictly.
        The output format should be in JSON, structured as follows:
        [ { 
          "QuestionStatement": "{A concise, passage or scenario-based setup}",
          "PartPrompt": "{A clear, direct question derived from the scenario}", 
          "label": "{combination of QuestionStatement and PartPrompt}",
          "values": [<provide exactly ${optionCount} Options with prefix A, B, C... up to Z depending on the optionCount. All distractors(options) should be in same length. Apply punctuation rules: complete sentences end with a period, phrases/words do not.>],
          "CorrectAnswer": ${targetQuestionType === 'Multiple Response' ? `<ARRAY of ${numberOfCorrectOptions} correct options with full text, e.g., ["A. First correct option.", "C. Second correct option."]>` : `<Correct option alphabet with full text. It must match one of the provided options (e.g., 'B. It is the correct definition.')>`},
          "FeedbackOption<option>": <Correct/Incorrect. Feedback for the particular option. (e.g., 'FeedbackOptionA: Incorrect. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.', 'FeedbackOptionB: Correct. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.'). In Json LHS side don't use the format like this 'FeedbackOption<B>, FeedbackOption<A>...' use 'FeedbackOptionA, FeedbackOptionB...'. Must provide Feedback for the options>,
          ${targetQuestionType === 'Multiple Response' ? `"Marking": <For Multiple Response, list only the correct option alphabets: if exactly two are correct, join with ' & ' (e.g., 'A & C'); if three or more are correct, list them comma-separated with spaces (e.g., 'A, C, E').>,` : `"Marking": <display the correct option alphabet>,`}
          "MaxMarks": ${marks},
          "ItemScoring": {
            "FullScore": ${marks},
            "PartialScore": ${targetQuestionType === 'Multiple Response' ? perCorrectScore.toFixed(2) : 0},
            "ScoringLogic": "${targetQuestionType === 'Multiple Response' ? `Award Partial Score for each correct option selected (no marks for incorrect selections). Full Score is awarded only if all correct options are selected.` : `Full marks if correct answer is selected. Zero if not correct.`}"
          },
          "marks": ${marksMappingPromptValue ?? '{"A":value from context,"B":value from context based on the correct answer suffle from A - J}'},
          "EnablingObjective": <for which Enabling objective question belongs to. Provide Enabling objective name, it should be same as in book, not number. Do not give word like this 'Consider all Enabling Objectives within study'>,
          "ISOClause": "<e.g., 4.4>",
          "BookName": <Book>,
          "originalquestionid": ${originalQuestionID},
          "creativityLevel": "${creativityLevelName}"
        } ]
        The number of questions should be exactly ${refinementNumQuestions}.
        Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
        } else {
          // Book Source Prompt (similar but with ReferenceInfo)
          questionPrompt = `Generate exactly ${refinementNumQuestions} ${targetQuestionType} questions based exclusively on the Domain '${domain}' and aligned with the Enabling Objective: ${enablingObjective}. 
        Each question should align with the content of the study material and the corresponding Enabling Objective, but **do not repeat or closely mirror the exact wording** of the EO statement. Instead, the questions should assess the application and deeper understanding of the content related to that Enabling objective.
        Each question must adhere to the specified Taxonomy: ${taxonomyName}. 
        Each question must reflect content strictly from the specified study material.
        
        
        
        Important:
        1. For options that are complete sentences, **add a period at the end**.
        2. For options that are not complete sentences (e.g., single words, double words, phrases), **do not add a period**.
        3. Do not provide options with missing punctuation or inconsistent use of periods.
        4. Options must start with prefix A, B, C... Ensure exactly ${optionCount} options per question.
        5. Avoid repeating correct options across number of questions generated.
        6. Options should be exactly ${optionCount}.
        7. All Options/distractors should be in same length.
        8. Avoid decimal points in options and question stem, use whole numbers only.
        9. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        
        ${targetQuestionType === 'Multiple Response' ? `
        Multiple-Response Logic:
        - There must be exactly ${numberOfCorrectOptions} correct answers.
        - Avoid repeating correct answer positions across questions.
        - No discernible patterns in correct answer placement.
        - Even distribution of correct answers across all options.
        - Plausible distractors that are relevant and related to the content.
        
        Instruction:
        - The question stem must end with: "Select the ${numberOfCorrectOptions} correct options.".
        - Provide exactly ${numberOfCorrectOptions} correct answers among the options.
        
        
        Scoring:
        - Full Marks: if all correct answers are selected.
        - Partial Marks: award ${perCorrectScore.toFixed(2)} marks for each correct option selected (no negative marking). Do not award marks for incorrect options.
        - Zero Marks: if none are correct.
        ` : ''}
        
        Ensure the options follow these punctuation rules strictly.
        The output format should be in JSON, structured as follows:
        [ { 
        "QuestionStatement": "{A concise, passage or scenario-based setup}",
        "PartPrompt": "{A clear, direct question derived from the scenario}",   
        "label": "{combination of QuestionStatement and PartPrompt}",
          "values": [<provide exactly ${optionCount} Options with prefix A, B, C... up to Z depending on the optionCount. All distractors(options) should be in same length. Apply punctuation rules: complete sentences end with a period, phrases/words do not.>],
          "CorrectAnswer": ${targetQuestionType === 'Multiple Response' ? `<ARRAY of ${numberOfCorrectOptions} correct options with full text, e.g., ["A. First correct option.", "C. Second correct option."]>` : `<Correct option alphabet with full text. It must match one of the provided options (e.g., 'B. It is the correct definition.')>`},
          "FeedbackOption<option>": <Correct/Incorrect. Feedback for the particular option. (e.g., 'FeedbackOptionA: Incorrect. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.', 'FeedbackOptionB: Correct. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.'). In Json LHS side don't use the format like this 'FeedbackOption<B>, FeedbackOption<A>...' use 'FeedbackOptionA, FeedbackOptionB...'. Must provide Feedback for the options>,
          ${targetQuestionType === 'Multiple Response' ? `"Marking": <For Multiple Response, list only the correct option alphabets: if exactly two are correct, join with ' & ' (e.g., 'A & C'); if three or more are correct, list them comma-separated with spaces (e.g., 'A, C, E').>,` : `"Marking": <display the correct option alphabet>,`}
          "MaxMarks": ${marks},
          "ItemScoring": {
            "FullScore": ${marks},
            "PartialScore": ${targetQuestionType === 'Multiple Response' ? perCorrectScore.toFixed(2) : 0},
            "ScoringLogic": "${targetQuestionType === 'Multiple Response' ? `Award Partial Score for each correct option selected (no marks for incorrect selections). Full Score is awarded only if all correct options are selected.` : `Full marks if correct answer is selected. Zero if not correct.`}"
          },
          "marks": {"A":value from context,"B":value from context based on the correct answer suffle from A - J},
          "EnablingObjective": <for which Enabling objective question belongs to. Provide Enabling objective name, it should be same as in book, not number. Do not give word like this 'Consider all Enabling Objectives within study'>,
          "ISOClause": "<e.g., 4.4>",
          "BookName": <Book>,
          "originalquestionid": ${originalQuestionID},
          "creativityLevel": "${creativityLevelName}"
        } ]
        The number of questions should be exactly ${refinementNumQuestions}.
        Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
        }
      } else if (targetQuestionType === 'Written Response') {
        const minword = marks === 10 ? 250 : 100;

        if (sourcetype === 2) {
          questionPrompt = `Generate exactly ${refinementNumQuestions} Long Answer questions for ${marks} marks.
        Questions based exclusively on the Domain '${domain}'. 
        Each question should align with the content of the study material and the corresponding Enabling Objective: ${enablingObjective}, but **do not repeat or closely mirror the exact wording** of the EO statement. Instead, the questions should assess the application and deeper understanding of the content related to that Enabling objective.
        Each question must adhere to the specified Taxonomy: ${taxonomyName}.
        Each question must reflect content strictly from the specified study material.
        
        Important: 
        1. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        2. Do not create or include multi-part questions labeled with (a), (b), etc. Always write questions as a single, unified prompt without splitting into sub-parts. Ensure the question flows naturally and assesses all required elements cohesively.
        
        Key Points Structure:
        - Provide Header and it's detailed complete explaination with min 20 words and max 50 words. Explination should be minimum 20 words.
        Example:
        1. Initial deductible ~ The insured pays the first $500 of a claim before coverage applies.
        2. Insurer's liability ~ The insurer covers all valid claims after the deductible is met.
        3. Risk mitigation ~ Deductibles discourage small claims by sharing financial responsibility.
        4. Premium adjustment ~ Higher deductibles reduce premiums by transferring risk to the insured.


        Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        The output format should be in JSON, structured as follows:
        [{
        "QuestionStatement": "{A concise, passage or scenario-based setup}",
        "PartPrompt": "{A clear, direct question derived from the scenario}", 
        "label":{questionstatement } { PartPrompt } ,
        "values":[],
        "CorrectAnswer":<Correct Answer(minimum ${minword} words). Do not include textbook references, page numbers, study names, or Enabling Objective (EO) names in the correct answer.>,
        "KeyPoints":<Must follow the above key points Structure. List exactly ${marks} key points, each contributing 1 mark. Do not include any references, study numbers, Enabling Objectives, examples, or page numbers within the key points. Focus only on the essential content of the chapter and format should be <Keypoint> ~ <Explanation of the key point>. Provide keypoints in an array>,
        "MaxMarks":${marks},
        "BookName":<List the book name which have refered if possible>,
        "originalquestionid": ${originalQuestionID},
        "EnablingObjective": <for which Enabling objective question belongs to. Provide Enabling objective name, it should be same as in book, not number. Do not give word like this 'Consider all Enabling Objectives within study'>
        }].
        The number of questions should be exactly ${refinementNumQuestions}.
        Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
        } else {
          questionPrompt = `Generate exactly ${refinementNumQuestions} Long Answer questions for ${marks} marks.
        Questions based exclusively on the Domain '${domain}'.
        Each question should align with the content of the study material and the corresponding Enabling Objective: ${enablingObjective}, but **do not repeat or closely mirror the exact wording** of the EO statement. Instead, the questions should assess the application and deeper understanding of the content related to that Enabling objective.
        Each question must adhere to the specified Taxonomy: ${taxonomyName}. Each question must reflect content strictly from the specified study material.
        
        Important: 
        1. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        2. Do not create or include multi-part questions labeled with (a), (b), etc. Always write questions as a single, unified prompt without splitting into sub-parts. Ensure the question flows naturally and assesses all required elements cohesively.
        
        Key Points Structure:
        - Provide Header and it's detailed complete explaination with min 20 words and max 50 words. Explination should be minimum 20 words.
        Example:
        1. Initial deductible ~ The insured pays the first $500 of a claim before coverage applies.
        2. Insurer's liability ~ The insurer covers all valid claims after the deductible is met.
        3. Risk mitigation ~ Deductibles discourage small claims by sharing financial responsibility.
        4. Premium adjustment ~ Higher deductibles reduce premiums by transferring risk to the insured.


        The output format should be in JSON, structured as follows:
        [{
        "QuestionStatement": "{A concise, passage or scenario-based setup}",
        "PartPrompt": "{A clear, direct question derived from the scenario}",
        "label":{questionstatement } { PartPrompt } ,
        "values":[],
        "CorrectAnswer":<Correct Answer(minimum ${minword} words). Do not include textbook references, page numbers, study names, or Enabling Objective (EO) names in the correct answer.>,
        "KeyPoints":<Must follow the above key points Structure. List exactly ${marks} key points, each contributing 1 mark. Do not include any references, study numbers, Enabling Objectives, examples, or page numbers within the key points. Focus only on the essential content of the chapter and format should be <Keypoint> ~ <Explanation of the key point>. Provide keypoints in an array>,
        "MaxMarks":${marks},
        "BookName":<List the book name which have refered if possible>,
        "originalquestionid": ${originalQuestionID},
        "EnablingObjective": <for which Enabling objective question belongs to. Provide Enabling objective name, it should be same as in book, not number. Do not give word like this 'Consider all Enabling Objectives within study'>
        }].
        The number of questions should be exactly ${refinementNumQuestions}.
        Important: - Only provide the output in the exact JSON format specified. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
        }
      } else if (targetQuestionType === 'Fill In the Blank') {
        questionPrompt = `Generate exactly ${refinementNumQuestions} Fill In the Blank questions based exclusively on the Domain '${domain}' and aligned with the Enabling Objective: ${enablingObjective}. 
        Each question should align with the content of the study material and the corresponding Enabling Objective, but **do not repeat or closely mirror the exact wording** of the EO statement. Instead, the questions should assess the application and deeper understanding of the content related to that Enabling objective.
        Each question must adhere to the specified Taxonomy: ${taxonomyName}. 
        Each question must reflect content strictly from the specified study material.


        Important guidelines:
        1. Create a statement with a blank (represented by [gap1]) where a key term should be filled in.
        2. The correct answer should be a single word or short phrase that fits the blank.
        3. The blank should test understanding of a key concept, not trivial details.
        4. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary.
        5. Generate exactly ${refinementNumQuestions} question(s).


        Output must be strictly in valid JSON format as shown below:
        [
        {
        
            "QuestionStatement": "<Full paragraph context, no gaps.>",
            "PartPrompt": "<Sentence with one gap [gap1]>",
            "label": "<QuestionStatement> <PartPrompt>",
            "values": [],
            "CorrectAnswer": <The word or phrase that fills the blank>,
            "FeedbackOptionA": <Feedback for correct answer and do not include the "Correct" text in the Feedback provide>,
            "MaxMarks": ${marks},
            "ItemScoring": {
                            "FullScore": ${marks},
                            "PartialScore": 0,
                            "ScoringLogic": "Full marks if correct answer is selected. Zero if not correct."
                        }, 
            "marks": ${marksMappingPromptValue ?? '{"A":"Take the value from the context (do not hardcode; use the context value)"}'},
            "originalquestionid": ${originalQuestionID},
            "EnablingObjective": <for which Enabling objective question belongs to. Provide Enabling objective name, it should be same as in book, not number. Do not give word like this 'Consider all Enabling Objectives within study'>,
        }
        ]


        Use Canadian English for all grammar, spelling, and vocabulary. Do not include any explanations or commentary outside the JSON response.`;
      } else if (targetQuestionType === 'Select the Blank') {
        // Select the Blank previously had no prompt branch of its own and fell
        // through to the generic prompt, which produced Multiple Choice items.
        const dropdownOptionCount = Math.max(3, Number(refinementNumOptions) || 4);
        questionPrompt = `Generate exactly ${refinementNumQuestions} Select the Blank (dropdown) questions based exclusively on the Domain '${domain}' and aligned with the Enabling Objective: ${enablingObjective}.
        Each question should align with the content of the study material and the corresponding Enabling Objective, but **do not repeat or closely mirror the exact wording** of the EO statement. Instead, the questions should assess the application and deeper understanding of the content related to that Enabling objective.
        Each question must adhere to the specified Taxonomy: ${taxonomyName}.
        Each question must reflect content strictly from the specified study material.


        Important guidelines:
        1. Create a statement with exactly one gap, represented by the token [Dropdown1].
        2. Provide exactly ${dropdownOptionCount} dropdown options: one correct answer plus plausible distractors of a similar length.
        3. The correct answer must be one of the dropdown options, given as its full text.
        4. The blank should test understanding of a key concept, not trivial details.
        5. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary.
        6. Generate exactly ${refinementNumQuestions} question(s).


        Output must be strictly in valid JSON format as shown below:
        [
        {
            "QuestionStatement": "<Full paragraph context, no gaps.>",
            "PartPrompt": "<Sentence with one gap [Dropdown1]>",
            "label": "<QuestionStatement> <PartPrompt>",
            "DropdownOptions": [<exactly ${dropdownOptionCount} option strings, without A./B. prefixes>],
            "values": [<the same ${dropdownOptionCount} option strings>],
            "CorrectAnswer": <the option text that fills the blank; must match one of the options exactly>,
            "FeedbackOptionA": <Feedback for the correct answer, without the word "Correct" in the text>,
            "MaxMarks": ${marks},
            "ItemScoring": {
                            "FullScore": ${marks},
                            "PartialScore": 0,
                            "ScoringLogic": "Full marks if correct answer is selected. Zero if not correct."
                        },
            "marks": ${marksMappingPromptValue ?? '{"A":"Take the value from the context (do not hardcode; use the context value)"}'},
            "originalquestionid": ${originalQuestionID},
            "EnablingObjective": <for which Enabling objective question belongs to. Provide Enabling objective name, it should be same as in book, not number. Do not give word like this 'Consider all Enabling Objectives within study'>
        }
        ]


        Use Canadian English for all grammar, spelling, and vocabulary. Do not include any explanations or commentary outside the JSON response.`;
      } else if (targetQuestionType === 'True False') {
        questionPrompt = `Generate exactly ${refinementNumQuestions} True/False questions based exclusively on the Domain '${domain}' and study name is '${domain}', but **do not repeat or closely mirror the exact wording** of the LO statement. Instead, the questions should assess the application and deeper understanding of the content related to that learning objective.
                        The questions must adhere to the specified Taxonomy: ${taxonomyName}. 
                        Each question must reflect content strictly from the specified study material.
                        
                        **CRITICAL TRUE/FALSE FORMAT:**
                        - The question label should be a clear statement WITHOUT "True or False" at the end
                        - The 'values' field MUST be exactly: ['A. True', 'B. False']
                        - The 'CorrectAnswer' field MUST be either 'A. True' or 'B. False' (with the prefix)
                        - Example: 
                        'label': 'An organisation commits to a quality management system in order to structure its processes and improve customer satisfaction'
                        'values': ['A. True', 'B. False']
                        'CorrectAnswer': 'A. True'
                        
                        Important: 
                        1. For options at the end **do not add a period**.
                        2. DO NOT include "True or False" in the question label
                        3. The question label should be a statement only
                        
                        The number of questions should be exactly ${refinementNumQuestions} with Taxonomy level ${taxonomyName}.
                        
                        Important: 
                        - Only provide the output in the exact JSON format specified. 
                        - Ensure that all questions are generated from the mentioned chapter only, without any additional explanations, comments, or apologies.
                        - TAXONOMY LEVEL TO USE: '${taxonomyName}'
                        - Avoid using escape characters in json output unless absolutely necessary.
                        
                        Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
                        
                        The output format should be in JSON, structured as follows:
                        [ { 
                        
                        "QuestionStatement": "{A concise, passage or scenario-based setup}",
                        "PartPrompt": "{A clear, direct question derived from the scenario}",
                        "label": <Question statement WITHOUT "True or False" at the end>,
                        "values": ["A. True", "B. False"],
                        "CorrectAnswer": <Either 'A. True' or 'B. False'>,
                        "FeedbackOptionA": <Correct/Incorrect. Feedback for True option>,
                        "FeedbackOptionB": <Correct/Incorrect. Feedback for False option>,
                        "Marking": <Either 'A' or 'B'>,
                        "MaxMarks": ${marks},
                        "ItemScoring": {
                            "FullScore": ${marks},
                            "PartialScore": 0,
                            "ScoringLogic": "Full marks if correct answer is selected. Zero if not correct."
                        }, 
                        "marks": ${marksMappingPromptValue ?? '{"A":value from context,"B":value from context}'},
                        "EnablingObjective": <for which Enabling objective question belongs to. Provide Enabling objective name, it should be same as in book, not number.>, 
                        "BookName": <Book>,
                        "originalquestionid": ${originalQuestionID},
                        "creativityLevel": <moderate/high/very-high>
                        } ]`;
      } else if (targetQuestionType === 'Matrix') {
        const originalQuestionData = selectedQuestionForRefinement?.[2] || selectedQuestionForRefinement?.questiondata || selectedQuestionForRefinement || {};
        questionPrompt = `Generate ${refinementNumQuestions} Matrix question(s) based on the following context.


        Context:
        Domain: ${domain}
        Enabling Objective: ${enablingObjective}
        Taxonomy: ${taxonomyName}
        Max Marks: ${marks}
        
        
        Generate set Matrix question base specify criterion , ensure adherence follow guideline : 


        1 . Question Format : 
        - question phrase complete sentence end question mark . 
        - candidate able recognise context question read answer option . 
        - question unique label . 
        - reuse repeat exact word previous question label . 
       
        2 . row Columns : 
        - row represent sub - element scenario derive study content . 
        - column represent possible response classification . 
        - row column phrase canadian English , grammatically parallel , contextually relevant . 


        3 . Output Format ( json ): 
        generate question follow json structure : 
        [ { 
            "id" : str , 
            "QuestionStatement" : " { concise , passage scenario - base setup } " , 
            "PartPrompt" : " { clear , direct question derive scenario } " , 
            "label":{questionstatement } { PartPrompt } , 
            "type":"Matrix " , 
            "rows" : [ { 
                    " value":str , 
                    " text":str , 
            } , ..... ] , 
            "columns" : [ { 
                    " value":str , 
                    " text":str , 
            } , ..... ] , 
            "CorrectAnswer" : [ int , ... ] , 
            "Feedbacks":[str , .... ] , 
            "MaxMarks " : ${marks}, 
            "ItemScoring " : { 
            "FullScore " : ${marks}, 
            "PartialScore" : 0 , 
            "ScoringLogic" : "mark correct answer select . zero correct." 
            } , 
            "EnablingObjective" : " < enable objective question belong . provide Enabling objective , book , number . word like ' consider Enabling Objectives study ' > " , 
            "BookName" : "< book >",
            "originalquestionid": ${originalQuestionID},
        } ] 
        
        important : 
            " ' answer ' array integer represent index select column answer row . " 
            " Feedbacks " array string provide feedback row matrix question . feedback string correspond correct answer index specify " CorrectAnswer " . feedback explain correct answer appropriate row . use clear , constructive language reinforce understand .


        - TAXONOMY LEVEL TO USE: '${taxonomyName}'
        - Avoid using escape characters in json output unless absolutely necessary.
        
        Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.`;
      } else {
        // Generic prompt for any other question types
        questionPrompt = `Generate exactly ${refinementNumQuestions} ${targetQuestionType} question(s) based exclusively on the Domain '${domain}' and aligned with the Enabling Objective: ${enablingObjective}. 
        Each question should align with the content of the study material and the corresponding Enabling Objective, but **do not repeat or closely mirror the exact wording** of the EO statement. Instead, the questions should assess the application and deeper understanding of the content related to that Enabling objective.
        Each question must adhere to the specified Taxonomy: ${taxonomyName}. 
        Each question must reflect content strictly from the specified study material.


        Important guidelines:
        1. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary.
        2. Return ONLY valid JSON array format.
        3. If the domain or reference material contains any mathematical equations or formulas, you must retain and format them properly using LaTeX enclosed in \\( and \\) for inline equations, and \\[ and \\] for block equations.


        The output format should be in JSON array format with 'label', 'values', and 'CorrectAnswer' fields.`;
      }

      questionPrompt += `\n\nImportant: If the domain or reference material contains any mathematical equations or formulas, you must retain and format them properly using LaTeX enclosed in \\( and \\) for inline equations, and \\[ and \\] for block equations.`;

      const payload = {
        agent_status: "1",
        job_id: "",
        url: "ACCA/BUSINESS_AND_TECHNOLOGY",
        question: questionPrompt,
        source: refinementSourceType,
        appcode: appcode,
        questiontypeid: parseInt(questiontypeid),
        noofquestions: parseInt(refinementNumQuestions),
        creativitylevelid: parseInt(creativitylevelid),
        creativityLevelName: refinementCreativity,
        taxonomyid: parseInt(taxonomyid),
        taxonomyname: refinementTaxonomy.charAt(0).toUpperCase() + refinementTaxonomy.slice(1),
        custcode: custcode,
        orgcode: orgcode,
        kbname: bookTitle.replace(/\s+/g, '_'),
        sourcename: sessionStorage.getItem('bookTitle').replace(/\s+/g, '_'),
        agentname: "itemregenerate",
        // The backend expects the underscored enum (WRITTEN_RESPONSE), so spaces
        // have to be replaced — plain .toUpperCase() produced "WRITTEN RESPONSE".
        question_type: targetQuestionType.toUpperCase().replace(/\s+/g, '_'),
        usercode: usercode,
        booknameid: parseInt(booknameid),
        bookname: bookTitle,
        questiontypename: targetQuestionType,
        difficultylevelid: 0,
        chaptercode: chapterPart,
        // creativitylevel: parseInt(creativitylevelid),
        validate_content: "No",
        task_content: bookTitle.replace(/\s+/g, '_'),
        locode: locode,
        sourcetype: refinementSourceType === 'Book Based' ? 1 : 2,
        referenceinfo: "",
        Rating: "",
        Rating_Feedback: ""
      };

      console.log('Sending rewrite request:', payload);

      const response = await fetch(`${AIG_QUIZ_GEN_URL}/agentic_item_gen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload).replace(/[\u221a\u221A]/g, 'sqrt')
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Rewrite response:', result);

      // Parse the generated questions from the response
      let generatedQuestions = [];
      if (result && Array.isArray(result)) {
        generatedQuestions = result;
      } else if (result && result.data && Array.isArray(result.data)) {
        generatedQuestions = result.data;
      }

      if (generatedQuestions.length > 0) {
        // Image-based source question -> the refined questions need their own image.
        await attachImagesToRefinedQuestions(generatedQuestions, selectedQuestionForRefinement);

        // Prepare questions for database insertion
        const questionsPayload = generatedQuestions.map((q: any, index: number) => {
          // Derive GUID from original identifier, preserving chapter, LO, and level
          const originalId = selectedQuestionForRefinement?.questionguid || selectedQuestionForRefinement?.id || '';

          // Use the target question type resolved above (from the refinement UI),
          // not the model's q.type, so the GUID type segment always reflects the
          // requested type — Select the Blank included.
          const questionTypeCode = targetQuestionType === 'Written Response' ? 'WR' :
            targetQuestionType === 'Multiple Response' ? 'MR' :
              targetQuestionType === 'True False' ? 'TF' :
                targetQuestionType === 'Matrix' ? 'MM' :
                  targetQuestionType === 'Select the Blank' ? 'STB' :
                    targetQuestionType === 'Fill In the Blank' ? 'FB' : 'MC';

          const numericTaxonomyId = parseInt(taxonomyid || '0', 10) || 0;
          const langCode = 'EN';

          const buildGuidFromOriginal = (original: string, newType: string, fallback: string) => {
            if (!original) return fallback;
            const match = original.match(/^(.*_)(MC|MR|TF|FIB|WR|MM|TR|FB|MM)(_L\d+_[A-Z-]+_ID)(\d*)$/);
            if (match) {
              return `${match[1]}${newType}${match[3]}`;
            }
            return fallback;
          };

          const loPart = (originalId.split('_').find(p => p.startsWith('LO')) || locode || '').replace(/^_+/, '');

          const fallbackGuid = `IG_V2025_${chapterPart}_${loPart}_${questionTypeCode}_L${numericTaxonomyId}_${langCode}_ID`;
          const questionguid = buildGuidFromOriginal(originalId, questionTypeCode, fallbackGuid);

          return {
            usercode: sessionStorage.getItem('userCode'),
            orgcode: sessionStorage.getItem('orgcode'),
            custcode: sessionStorage.getItem('custcode'),
            appcode: sessionStorage.getItem('appcode'),
            referenceinfo: q.referenceinfo || '',
            booknameid: sessionStorage.getItem('bookid'),
            noofquestions: parseInt(refinementNumQuestions),
            questiontypeid: parseInt(questiontypeid),
            taxonomy: taxonomyName,
            taxonomyid: parseInt(taxonomyid),
            questiondata: q,
            AIquestiondata: q,
            difficultylevelid: 1, // Default difficulty level
            chaptercode: chapterPart,
            locode: loPart,
            LearningObjective: q.learningObjective || selectedQuestionForRefinement.learningObjective || '',
            sourcetype: refinementSourceType === 'Book Based' ? 1 : 2,
            questionguid: questionguid,
            previousQuestionData: selectedQuestionForRefinement,
            creativitylevelname: refinementCreativity,
            creativitylevelid: parseInt(creativitylevelid),
            creativitylevel: refinementCreativity,
            currentversion: '1',
            instructions: q.instructions || [],
            maininstruction: q.maininstruction || '',
            feedback: q.feedback || [],
            duplicateguid: '',
            generatedimagetype: toGeneratedImageType(
              q?.generatedimagetype ?? selectedQuestionForRefinement?.generatedimagetype
            )
          };
        });

        // Insert questions into database
        const insertPayload = { questionsPayload };
        console.log('Inserting questions into DB:', insertPayload);

        const insertResponse = await fetch(`${AIG_QUIZ_GEN_URL}/insert_to_db`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(insertPayload).replace(/[\u221a\u221A]/g, 'sqrt')
        });

        if (insertResponse.ok) {
          setLoading(false);
          const insertResult = await insertResponse.json();
          console.log('Questions inserted successfully:', insertResult);

          // Extract question IDs from the response (like the old code)
          const results = (insertResult && Array.isArray(insertResult.question_results)) ? insertResult.question_results : [];
          let insertedCount = 0;

          // Count successful insertions
          results.forEach((result, index) => {
            try {
              const r = result?.result?.[0];
              if (r && (r.questionrequestid || r.questionid)) {
                insertedCount++;
              }
            } catch (_) { /* noop */ }
          });

          // Show success message in modal
          if (insertedCount > 0) {
            setRefinementSuccessMessage(`Successfully generated and saved ${insertedCount} question(s) to the database.`);
          } else {
            setRefinementSuccessMessage(`Questions were generated but database insertion may have issues. Please check the results.`);
          }
          setShowRefinementSuccessDialog(true);
        } else {
          const errorText = await insertResponse.text();
          console.error('Failed to insert questions:', errorText);
          setRefinementErrorMessage(`Failed to save questions to database: ${errorText}`);
          setShowRefinementErrorDialog(true);
        }
      } else {
        console.log('No questions generated in the response');
        setRefinementErrorMessage('No questions were generated. Please try different parameters.');
        setShowRefinementErrorDialog(true);
      }

      // Close dialog and refresh data
      setRefinementDialogOpen(false);
      clearFilters();
      await fetchData();

    } catch (error) {
      console.error('Error rewriting question:', error);
      // You might want to show an error message to the user here
    }
    setLoading(false);
  };

  const handleRefinementSubmit = async () => {
    if (refinementType === 'Generate Similar') {
      await handleGenerateSimilar();
      return;
    }
    if (refinementType === 'Language Conversion') {
      await handleLanguageConversion();
      return;
    }
    await handleRewriteQuestion();
  };

  const handleLanguageConversion = async () => {
    try {
      // Close dialog first, then show global loader
      setRefinementDialogOpen(false);
      setLoadingMessage("Converting...");
      setLoading(true);

      // Check if the selected question is already in the target language
      const currentLanguage = selectedQuestionForRefinement?.language || selectedQuestionForRefinement?.Language || selectedQuestionForRefinement?.originallanguage || '';
      const targetLanguage = refinementLanguage;

      // Prevent conversion to the same language
      if (currentLanguage && targetLanguage && normalizeLanguageCode(currentLanguage) === normalizeLanguageCode(targetLanguage)) {
        setRefinementErrorMessage('Cannot convert question to the same language. Please select a different target language.');
        setShowRefinementErrorDialog(true);
        setLoading(false);
        return;
      }

      // Only allow conversion to English from other languages
      if (currentLanguage === 'en' && targetLanguage === 'en') {
        setRefinementErrorMessage('Language conversion only allows conversion to English from other languages. Please select English as the target language.');
        setShowRefinementErrorDialog(true);
        setLoading(false);
        return;
      }

      // Set variables for language conversion
      setRewriteLanguage(refinementLanguage);
      setRewriteQuestionTarget(selectedQuestionForRefinement);
      setRewriteSourceType(refinementSourceType === 'Book Based' ? '1' : '2');

      // Extract question type from selected question.
      // Select the Blank was missing here, so it fell through to '1' — the converted
      // copy was stored as Multiple Choice, with an _MC_ identifier, even though the
      // translation response correctly said "Select the Blank".
      const questionTypeMap: { [key: string]: string } = {
        'Multiple Choice': '1',
        'Multiple Response': '2',
        'True False': '3',
        'Fill In the Blank': '4',
        'Written Response': '7',
        'Matrix': '8',
        'Select the Blank': '9',
        'Fill In the Blank Dropdown': '9'
      };
      // The stored `type` can legitimately read "Fill In the Blank" for a dropdown
      // item, so the data check decides first — same rule as everywhere else.
      const originalQuestionType = isFillBlankDropdownQuestion(selectedQuestionForRefinement)
        ? 'Select the Blank'
        : (selectedQuestionForRefinement?.type || 'Multiple Choice');
      setRewriteQuestionType(questionTypeMap[originalQuestionType] || '1');

      // Extract taxonomy from selected question
      const taxonomyMap: { [key: string]: string } = {
        'Remember': '1',
        'Understand': '2',
        'Apply': '3',
        'Analyze': '4',
        'Evaluate': '5',
        'Create': '6'
      };
      const originalTaxonomy = selectedQuestionForRefinement?.taxonomy || 'Remember';
      setRewriteTaxonomy(taxonomyMap[originalTaxonomy] || '1');

      // Extract creativity level from selected question
      const creativityMap: { [key: string]: string } = {
        'low': '1',
        'moderate': '1',
        'high': '2',
        'very-high': '3'
      };
      const originalCreativity = selectedQuestionForRefinement?.creativityLevel || 'low';
      setRewriteCreativityLevel(creativityMap[originalCreativity] || '1');

      // Call the actual language conversion function with direct parameters instead of relying on state
      await performLanguageConversion(selectedQuestionForRefinement, refinementLanguage);

    } catch (error) {
      console.error('Language conversion error:', error);
      setRefinementErrorMessage('Failed to convert question. Please try again.');
      setShowRefinementErrorDialog(true);
    } finally {
      setLoading(false);
      setLoadingMessage("Loading questions...");
    }
  };

  // Rewrite logic (Generate Similar)
  const handleGenerateSimilar = async () => {
    try {
      setRefinementDialogOpen(false);
      setLoading(true);

      // Set variables for similar generation
      setRewriteQuestionTarget(selectedQuestionForRefinement);
      setRewriteSourceType(refinementSourceType === 'Book Based' ? '1' : '2');

      // Extract question type from selected question
      const questionTypeMap: { [key: string]: string } = {
        'Multiple Choice': 'multiple-choice',
        'Multiple Response': 'multiple-response',
        'True False': 'true-false',
        'Written Response': 'written-response',
        'Long Answer': 'long-answer',
        'Fill In the Blank': 'fill-in-the-blank',
        'Matrix': 'matrix'
      };
      const originalQuestionType = selectedQuestionForRefinement?.type || 'Multiple Choice';
      const resolvedQuestionType = questionTypeMap[originalQuestionType] || 'multiple-choice';
      setRewriteQuestionType(resolvedQuestionType);

      // Extract taxonomy from selected question
      const taxonomyMap: { [key: string]: string } = {
        'Remember': '1',
        'Understand': '2',
        'Apply': '3',
        'Analyze': '4',
        'Evaluate': '5',
        'Create': '6'
      };
      const originalTaxonomy = selectedQuestionForRefinement?.taxonomy || 'Understand';
      const RWtaxonomy = taxonomyMap[originalTaxonomy] || '2';
      setRewriteTaxonomy(RWtaxonomy);

      // Extract creativity level from selected question
      const creativityMap: { [key: string]: string } = {
        'low': '1',
        'moderate': '1',
        'high': '2',
        'very-high': '3'
      };
      const originalCreativity = selectedQuestionForRefinement?.creativityLevel || 'low';
      const resolvedCreativity = creativityMap[originalCreativity] || '1';
      setRewriteCreativityLevel(resolvedCreativity);

      // Pass the values through directly: the setState calls above have not been
      // applied yet, so performSimilarGeneration would otherwise read stale state.
      await performSimilarGeneration({
        questionType: resolvedQuestionType,
        taxonomy: RWtaxonomy,
        creativityLevel: resolvedCreativity,
      });
      clearFilters();

    } catch (error) {
      console.error('Similar generation error:', error);
      setRefinementErrorMessage('Failed to generate similar questions. Please try again.');
      // setShowRefinementErrorDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const performLanguageConversion = async (questionTarget: any = null, targetLanguage: string = null) => {
    try {

      // Use the passed parameters, fallback to state if not provided
      const actualQuestionTarget = questionTarget || rewriteQuestionTarget;
      const actualTargetLanguage = targetLanguage || rewriteLanguage;

      // Disable/guard no-op conversions: if target equals source language
      const sourceLang = normalizeLanguageCode(
        actualQuestionTarget?.language || actualQuestionTarget?.Language ||
        selectedQuestionForRefinement?.language || selectedQuestionForRefinement?.Language
      );
      const targetLang = normalizeLanguageCode(actualTargetLanguage) || 'en';
      if (sourceLang && sourceLang === targetLang) {
        console.warn('No-op language conversion requested (source == target).');
        setRefinementErrorMessage('Selected target language matches the source (English). Please choose a different language.');
        setShowRefinementErrorDialog(true);
        return;
      }

      const languageName = languageMap[actualTargetLanguage] || 'English';


      // Fix: Check the actual structure of the question data
      let originalQuestionData = null;
      let questionIdentifier = '';

      if (actualQuestionTarget) {
        // Try different possible structures
        if (actualQuestionTarget[2]) {
          originalQuestionData = actualQuestionTarget[2];
          questionIdentifier = actualQuestionTarget.id || '';
        } else if (actualQuestionTarget.questiondata) {
          originalQuestionData = actualQuestionTarget.questiondata;
          questionIdentifier = actualQuestionTarget.id || actualQuestionTarget.originalquestionid || '';
        } else if (actualQuestionTarget.label) {
          // If it's already the question data itself
          originalQuestionData = actualQuestionTarget;
          questionIdentifier = actualQuestionTarget.id || actualQuestionTarget.originalquestionid || '';
        }
      }

      if (!originalQuestionData) {
        throw new Error('Invalid question data for conversion - no question data found');
      }

      const creativityLevelName =
        rewriteCreativityLevel === '1' ? 'moderate' :
          rewriteCreativityLevel === '2' ? 'high' : 'very-high';


      // Helpers for array parsing and normalization
      const parseJsonMaybe = (v: any, fallback: any) => {
        if (Array.isArray(v) || (v && typeof v === 'object')) return v;
        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
        return fallback;
      };

      // Normalize CorrectAnswer to API-required type (string or list of strings)
      const normalizeCorrectAnswer = (q: any) => {
        const ca = q?.CorrectAnswer;
        const parseArr = (v: any) => {
          if (Array.isArray(v)) return v;
          if (typeof v === 'string') {
            try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
          }
          return [];
        };
        const colsRaw = parseArr(parseJsonMaybe(q?.columns, q?.columns));
        const cols: any[] = colsRaw.map((c: any) => typeof c === 'string' ? c : (c?.text ?? ''));
        const getColText = (idx: any) => {
          const i = Number(idx);
          if (Number.isFinite(i) && i >= 0 && i < cols.length) {
            const c = cols[i];
            return typeof c === 'string' ? c : String(i);
          }
          return String(idx);
        };
        if (Array.isArray(ca)) {
          return ca.map((v: any) => typeof v === 'number' ? getColText(v) : String(v));
        }
        if (typeof ca === 'number') {
          return getColText(ca);
        }
        if (typeof ca === 'string') {
          return ca;
        }
        return String(ca ?? '');
      };
      const normalizedCorrectAnswer = normalizeCorrectAnswer(originalQuestionData);

      // Table Analysis questions keep their reference table in TableAnalysis. It was
      // never part of the payload, so the table came back untouched and stayed in
      // English while the stem was converted.
      const tableForPayload = getTableAnalysis(originalQuestionData);

      // Passage content was missing from the payload entirely, so only the question
      // text was ever translated. A multi-tab question holds it in Tabs, a single
      // passage question in PassageContext.
      //
      // Which object carries it depends on how the refinement was opened, so check the
      // question data, the raw row and the selected question in turn rather than
      // assuming it sits on originalQuestionData.
      const passageCandidates = [
        originalQuestionData,
        actualQuestionTarget,
        selectedQuestionForRefinement,
      ].filter(Boolean);

      const tabsForPayload = passageCandidates
        .map((candidate: any) => getQuestionTabs(candidate))
        .find((tabs: any[]) => tabs.length > 0) || [];

      const passageForPayload = passageCandidates
        .map((candidate: any) => String(candidate?.PassageContext ?? candidate?.passageContext ?? '').trim())
        .find(Boolean) || '';

      // Include Matrix-specific fields (rows, columns, Feedbacks) for better translation fidelity
      const isMatrix = (originalQuestionData?.type || selectedQuestionForRefinement?.type || '').toString().toLowerCase().includes('matrix');
      const rowsForPayload = parseJsonMaybe(originalQuestionData?.rows, originalQuestionData?.rows) || [];
      const colsForPayload = parseJsonMaybe(originalQuestionData?.columns, originalQuestionData?.columns) || [];
      const fbsForPayload = parseJsonMaybe(originalQuestionData?.Feedbacks, originalQuestionData?.Feedbacks) || [];

      const conversionPayload = {
        BookName: rewriteQuestionTarget?.[10] || selectedBook?.title || originalQuestionData.BookName || '',
        CorrectAnswer: normalizedCorrectAnswer,
        EnablingObjective: rewriteQuestionTarget?.[9] || originalQuestionData.EnablingObjective || '',
        FeedbackOptionA: originalQuestionData.FeedbackOptionA || '',
        FeedbackOptionB: originalQuestionData.FeedbackOptionB || '',
        FeedbackOptionC: originalQuestionData.FeedbackOptionC || '',
        FeedbackOptionD: originalQuestionData.FeedbackOptionD || '',
        FeedbackOptionE: originalQuestionData.FeedbackOptionE || '',
        FeedbackOptionF: originalQuestionData.FeedbackOptionF || '',
        FeedbackOptionG: originalQuestionData.FeedbackOptionG || '',
        FeedbackOptionH: originalQuestionData.FeedbackOptionH || '',
        FeedbackOptionI: originalQuestionData.FeedbackOptionI || '',
        FeedbackOptionJ: originalQuestionData.FeedbackOptionJ || '',
        ItemScoring: typeof originalQuestionData.ItemScoring === 'string' ? JSON.parse(originalQuestionData.ItemScoring) : originalQuestionData.ItemScoring,
        MaxMarks: originalQuestionData.MaxMarks || rewriteQuestionTarget?.[3] || 1,
        ReferenceInfo: originalQuestionData.ReferenceInfo || '',
        creativityLevel: creativityLevelName,
        Questiontype: originalQuestionData.type,
        PartPrompt: originalQuestionData.PartPrompt,
        QuestionStatement: originalQuestionData.label || originalQuestionData.QuestionStatement,
        label: originalQuestionData.label || originalQuestionData.QuestionStatement,
        values: originalQuestionData.values,
        Language: languageName,
        originalquestionid: questionIdentifier,
        originallanguage: languageMap[actualTargetLanguage] || '',
        // Reference table, so its headers and cells are translated with the stem
        ...(tableForPayload && { TableAnalysis: tableForPayload }),
        // Passage(s), so the reading context is translated with the question
        ...(tabsForPayload.length > 0 && { Tabs: tabsForPayload }),
        ...(passageForPayload && { PassageContext: passageForPayload }),
        // Matrix-specific fields
        ...(isMatrix && { type: 'Matrix' }),
        ...(isMatrix && { rows: rowsForPayload }),
        ...(isMatrix && { columns: colsForPayload }),
        ...(isMatrix && { Feedbacks: fbsForPayload }),
        // Add KeyPoints for Written Response questions. join() on an array of objects
        // produced the literal "[object Object]", so each entry's text is read first.
        ...(originalQuestionData.KeyPoints && {
          KeyPoints: Array.isArray(originalQuestionData.KeyPoints)
            ? originalQuestionData.KeyPoints
              .map((kp: any) => typeof kp === 'string'
                ? kp
                : String(kp?.point ?? kp?.text ?? kp?.keypoint ?? kp?.KeyPoint ?? ''))
              .filter((kp: string) => kp.trim().length > 0)
              .join('|||')
            : originalQuestionData.KeyPoints
        }),
        // Only include values if it's not a Written Response question
        ...(originalQuestionData.values && !originalQuestionData.KeyPoints && {
          values: originalQuestionData.values
        })
      };

      console.log('Conversion payload:', JSON.stringify(conversionPayload, null, 2));

      const resp = await axios.post(`${LANG_CONVERTOR_API_URL}/GetQuestionDatawithLang`, JSON.parse(JSON.stringify(conversionPayload).replace(/[\u221A\u221A]/g, 'sqrt')));
      console.log('API Response:', resp.data);

      const translatedData = resp.data.translations[languageName];
      console.log('Translated data:', translatedData);

      if (!translatedData) {
        throw new Error(`No translation found for language: ${languageName}`);
      }

      let merged = { ...originalQuestionData, ...translatedData } as any;

      // Accept the translated table only when it comes back with the same shape it was
      // sent in; anything else keeps the original, so a malformed response can never
      // destroy the table.
      if (tableForPayload) {
        const translatedTable = getTableAnalysis(translatedData);
        const sameShape = translatedTable
          && translatedTable.Columns.length === tableForPayload.Columns.length
          && translatedTable.Rows.length === tableForPayload.Rows.length;
        merged.TableAnalysis = sameShape ? translatedTable : tableForPayload;
        merged.tableAnalysis = merged.TableAnalysis;
      }

      // Keep the translated passage only when it comes back in the shape it was sent
      // in, so a partial response can never drop or scramble the passage.
      if (tabsForPayload.length > 0) {
        const translatedTabs = getQuestionTabs(translatedData);
        merged.Tabs = translatedTabs.length === tabsForPayload.length ? translatedTabs : tabsForPayload;
        merged.tabs = merged.Tabs;
      }
      if (passageForPayload) {
        const translatedPassage = String(
          translatedData?.PassageContext ?? translatedData?.passageContext ?? ''
        ).trim();
        merged.PassageContext = translatedPassage || passageForPayload;
      }

      // Normalize translated Matrix structure and preserve index-based answers if translation changed format
      if (isMatrix) {
        const ensureArray = (v: any) => Array.isArray(v) ? v : parseJsonMaybe(v, []) || [];
        merged.type = 'Matrix';
        merged.rows = ensureArray(translatedData?.rows ?? originalQuestionData?.rows);
        merged.columns = ensureArray(translatedData?.columns ?? originalQuestionData?.columns);
        merged.Feedbacks = ensureArray(translatedData?.Feedbacks ?? originalQuestionData?.Feedbacks);

        // If translated CorrectAnswer is not an array of numbers, fall back to original indices
        const origCA = parseJsonMaybe(originalQuestionData?.CorrectAnswer, originalQuestionData?.CorrectAnswer);
        const isArrayNumbers = Array.isArray(merged?.CorrectAnswer) && merged.CorrectAnswer.every((x: any) => typeof x === 'number');
        if (!isArrayNumbers) {
          merged.CorrectAnswer = Array.isArray(origCA) ? origCA : origCA;
        }
      }
      const generatedQuestions = [merged];
      const generatedCount = generatedQuestions.length;
      console.log('Generated questions:', generatedQuestions);

      let QGuid = '';
      const LoId = questionIdentifier.split('_').find(p => p.startsWith('LO')) || looutcomesId || '';
      let chapterCode = questionIdentifier.split('_').find(p => p.startsWith('S')) || '';
      if (questionIdentifier) {
        const parts = questionIdentifier.split('_');
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].startsWith('CQI') && parts[i].length > 3 && !isNaN(parseInt(parts[i].substring(3)))) {
            chapterCode = parts[i];
          }
        }
      }
      if (rewriteQuestionTarget?.[13]) {
        const chapterObj = chapters.find(c => c.chapterName === rewriteQuestionTarget[13]);
        if (chapterObj) {
          chapterCode = chapterObj.chapterCode;
        }
      }
      const langCode = (actualTargetLanguage || 'en').toUpperCase();
      console.log('GUID components:', { chapterCode, LoId, langCode, rewriteQuestionType, rewriteTaxonomy });

      if (Number(rewriteQuestionType) === 1) {
        QGuid = `IG_V2025_${chapterCode}_${LoId}_MC_L${rewriteTaxonomy}_${langCode}_ID`;
      } else if (Number(rewriteQuestionType) === 2) {
        QGuid = `IG_V2025_${chapterCode}_${LoId}_MR_L${rewriteTaxonomy}_${langCode}_ID`;
      } else if (Number(rewriteQuestionType) === 3) {
        QGuid = `IG_V2025_${chapterCode}_${LoId}_TF_L${rewriteTaxonomy}_${langCode}_ID`;
      } else if (Number(rewriteQuestionType) === 4) {
        QGuid = `IG_V2025_${chapterCode}_${LoId}_FIB_L${rewriteTaxonomy}_${langCode}_ID`;
      } else if (Number(rewriteQuestionType) === 7) {
        QGuid = `IG_V2025_${chapterCode}_${LoId}_WR_L${rewriteTaxonomy}_${langCode}_ID`;
      } else if (Number(rewriteQuestionType) === 8) {
        QGuid = `IG_V2025_${chapterCode}_${LoId}_MM_L${rewriteTaxonomy}_${langCode}_ID`;
      } else if (Number(rewriteQuestionType) === 9) {
        // Select the Blank — matches the STB segment the refinement path already uses.
        QGuid = `IG_V2025_${chapterCode}_${LoId}_STB_L${rewriteTaxonomy}_${langCode}_ID`;
      }
      console.log('Generated QGuid:', QGuid);

      const questionsWithLanguage = generatedQuestions.map((q, index) => {
        const taxObj = allTaxonomies.find(t => t.id === Number(rewriteTaxonomy));
        const taxonomyName = taxObj?.taxonomy || '';
        const allFeedbackOptions = {
          FeedbackOptionA: q.FeedbackOptionA || '', FeedbackOptionB: q.FeedbackOptionB || '',
          FeedbackOptionC: q.FeedbackOptionC || '', FeedbackOptionD: q.FeedbackOptionD || '',
          FeedbackOptionE: '', FeedbackOptionF: '', FeedbackOptionG: '', FeedbackOptionH: '',
          FeedbackOptionI: '', FeedbackOptionJ: '', FeedbackOptionK: '', FeedbackOptionL: '',
          FeedbackOptionM: '', FeedbackOptionN: '', FeedbackOptionO: ''
        };
        const currentDateTime = new Date().toISOString();
        return {
          ...q,
          language: actualTargetLanguage,
          languageName: languageMap[actualTargetLanguage] || 'English',
          // Add capitalized Language field to match downstream expectations
          Language: languageMap[actualTargetLanguage] || 'English',
          taxonomy: taxonomyName,
          slno: index + 1,
          instruction: '',
          checkvalues: q.values ? q.values.map(() => true) : [true, true, true, true],
          Rating: 0,
          Rating_Feedback: '',
          Isdeleted: 0,
          ISFeedbackProvided: false,
          version: 1,
          CreatedAt: currentDateTime,
          creativitylevel: Number(rewriteCreativityLevel),
          creativitylevelname: rewriteCreativityLevel === '1' ? 'Moderate' : rewriteCreativityLevel === '2' ? 'High' : 'Very High',
          PreviousVersions: [],
          AllFeedbackOptions: allFeedbackOptions,
          originalquestionid: questionIdentifier,
          originallanguage: languageMap[actualTargetLanguage] || '',
          // A translation is the same question in another language, so it keeps the
          // source question's image. Without this an image-based question came back
          // from Language Conversion with no image at all.
          ...(() => {
            const sourceImages = collectQuestionImages(
              actualQuestionTarget || selectedQuestionForRefinement || originalQuestionData
            );
            return sourceImages.length
              ? { generatedImageUrl: sourceImages[0], generatedImages: sourceImages }
              : {};
          })(),
          RegenerateInstrcutions: [''], Regeneratefeedback: ['']
        };
      });

      // Resolve identifiers safely from session storage with robust fallbacks
      const usercode = sessionStorage.getItem('userCode') || sessionStorage.getItem('usercode') || '';
      const orgcode = sessionStorage.getItem('orgcode') || sessionStorage.getItem('orgCode') || '';
      const custcode = sessionStorage.getItem('custcode') || sessionStorage.getItem('customerCode') || '';
      const appcode = sessionStorage.getItem('appcode') || 'AIG';
      const booknameid = sessionStorage.getItem('bookid') || BookId || '';

      // Guard: prevent DB insert with empty critical fields to avoid bigint errors
      if (!usercode || !orgcode || !custcode || !appcode || !booknameid) {
        const missing = [
          !usercode ? 'usercode' : null,
          !orgcode ? 'orgcode' : null,
          !custcode ? 'custcode' : null,
          !appcode ? 'appcode' : null,
          !booknameid ? 'booknameid' : null,
        ].filter(Boolean).join(', ');
        throw new Error(`Missing required identifiers: ${missing}. Please ensure session values are set before conversion.`);
      }
      // This is the id the converted copy is STORED with. Select the Blank was missing
      // from the map, so it fell through to '1' and the translated question came back
      // into the repository as Multiple Choice.
      const questionTypeMap: { [key: string]: string } = {
        'Multiple Choice': '1',
        'Multiple Response': '2',
        'True False': '3',
        'Fill In the Blank': '4',
        'Written Response': '7',
        'Matrix': '8',
        'Select the Blank': '9',
        'Fill In the Blank Dropdown': '9'
      };
      // A dropdown item's stored `type` can read "Fill In the Blank", so the data
      // check wins — checked against the question itself and the row it came from.
      const isDropdownItem = isFillBlankDropdownQuestion(originalQuestionData)
        || isFillBlankDropdownQuestion(actualQuestionTarget)
        || isFillBlankDropdownQuestion(selectedQuestionForRefinement);
      const originalQuestionType = isDropdownItem
        ? 'Select the Blank'
        : (originalQuestionData.type || 'Multiple Choice');
      const questiontypeid = questionTypeMap[originalQuestionType] || '1';

      const questionsPayload = questionsWithLanguage.map((item, index) => {
        const newQuestionIdentifier = `${QGuid}${String(index + 1)}`;
        const originalChapterName = rewriteQuestionTarget?.[13] || selectedChapterName || '';
        const originalLoName = rewriteQuestionTarget?.[9] || looutcomesName || '';
        return {
          usercode: usercode,
          orgcode: orgcode,
          custcode: custcode,
          appcode: appcode,
          referenceinfo: item.ReferenceInfo || '',
          booknameid: Number(booknameid),
          noofquestions: generatedCount,
          questiontypeid: questiontypeid,
          taxonomyid: Number(rewriteTaxonomy),
          questiondata: item,
          AIquestiondata: item,
          difficultylevelid: difficultylevelid || 0,
          chaptercode: chapterCode,
          chaptername: originalChapterName,
          locode: LoId,
          loname: originalLoName,
          LearningObjective: originalLoName || item.EnablingObjective || item.LearningObjective || '',
          sourcetype: Number(rewriteSourceType),
          questionguid: newQuestionIdentifier,
          previousQuestionData: item,
          creativitylevelid: Number(rewriteCreativityLevel),
          originalquestionid: questionIdentifier,
          originallanguage: languageMap[actualTargetLanguage] || '',
          currentversion: '1',
          instructions: [''],
          maininstruction: '',
          feedback: [''],
          duplicateguid: '',
          // Preserve the source question's image type through translate/rewrite
          // (index 26 is generatedimagetype on the raw repository row).
          generatedimagetype: toGeneratedImageType(
            (item as any)?.generatedimagetype
            ?? (rewriteQuestionTarget as any)?.generatedimagetype
            ?? (rewriteQuestionTarget as any)?.[26]
          )
        };
      });

      console.log('Final payload for DB insertion:', JSON.stringify(questionsPayload, null, 2));

      const insertResponse = await axios.post(`${AIG_QUIZ_GEN_URL}/insert_to_db`, JSON.parse(JSON.stringify({ questionsPayload }).replace(/[\u221A\u221A]/g, 'sqrt')));
      console.log('DB Insertion Response:', insertResponse.data);

      setRefinementSuccessMessage(`Successfully converted question to ${languageName}.`);
      setShowRefinementSuccessDialog(true);
      await fetchData();


    } catch (e) {
      const msg = (e && (e.response?.data?.message || e.message)) || 'Unknown error during language conversion.';
      // setRefinementErrorMessage(`Failed to convert question. ${msg}`);
      setShowRefinementErrorDialog(true);
    }
  };

  // The caller resolves the question type / taxonomy from the selected question and
  // passes them in. Reading them from state here used to give the PREVIOUS value —
  // the setState calls in handleGenerateSimilar have not been applied yet when this
  // runs — so the very first refinement sent the default "1" as the question type
  // and the request failed with an error screen.
  const performSimilarGeneration = async (overrides?: {
    questionType?: string;
    taxonomy?: string;
    creativityLevel?: string;
  }) => {
    try {
      const effectiveQuestionType = overrides?.questionType ?? rewriteQuestionType;
      const effectiveTaxonomy = overrides?.taxonomy ?? rewriteTaxonomy;

      // Get session storage values
      const appcode = sessionStorage.getItem('appcode') || '';
      const custcode = sessionStorage.getItem('custcode') || '';
      const orgcode = sessionStorage.getItem('orgcode') || '';
      const usercode = sessionStorage.getItem('userCode') || '';
      const bookTitle = sessionStorage.getItem('bookTitle') || '';
      const booknameid = sessionStorage.getItem('bookid') || '';
      const BookId = sessionStorage.getItem('bookid') || '';

      // Extract chaptercode and locode from the selected question (same logic as language conversion)
      let questionIdentifier = '';
      if (selectedQuestionForRefinement) {
        questionIdentifier = selectedQuestionForRefinement.questionguid || selectedQuestionForRefinement.id || '';
      }

      const LoId = questionIdentifier.split('_').find(p => p.startsWith('LO')) || looutcomesId || '';
      let chapterCode = selectedChapterCode || '';
      if (questionIdentifier) {
        const parts = questionIdentifier.split('_');
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].startsWith('CQI') && parts[i].length > 3 && !isNaN(parseInt(parts[i].substring(3)))) {
            chapterCode = parts[i];
          }
        }
      }
      if (selectedQuestionForRefinement?.[13]) {
        const chapterObj = chapters.find(c => c.chapterName === selectedQuestionForRefinement[13]);
        if (chapterObj) {
          chapterCode = chapterObj.chapterCode;
        }
      }

      // Get question type ID
      const normalizeTypeid = selectedQuestionForRefinement.type.toLowerCase();

      const questionTypeIdMap: Record<string, string> = {
        "multiple-choice": "1",
        "multiple choice": "1",
        "multiple-response": "2",
        "multiple response": "2",
        "true-false": "3",
        "true false": "3",
        "written-response": "7",
        "written response": "7",
        "long-answer": "5",
        "long answer": "5",
        "fill-in-the-blank": "4",
        "fill in the blank": "4",
        "matrix": "8",
        "select-the-blank": "9",
        "select the blank": "9",
        "fill in the blank dropdown": "9",
      };

      const questiontypeid = questionTypeIdMap[normalizeTypeid] ?? "1";

      // Get taxonomy name
      const taxonomyName = effectiveTaxonomy === '1' ? 'Remember' :
        effectiveTaxonomy === '2' ? 'Understand' :
          effectiveTaxonomy === '3' ? 'Apply' :
            effectiveTaxonomy === '4' ? 'Analyze' :
              effectiveTaxonomy === '5' ? 'Evaluate' : 'Create';

      // Create reference info from selected question
      const referenceQuestion = selectedQuestionForRefinement;
      const referenceInfo = {
        question: referenceQuestion?.label || referenceQuestion?.question || referenceQuestion?.QuestionStatement || '',
        type: referenceQuestion?.type || 'Multiple Choice',
        options: referenceQuestion?.options || referenceQuestion?.values || [],
        correctAnswer: referenceQuestion?.CorrectAnswer || referenceQuestion?.answer || '',
        taxonomy: referenceQuestion?.taxonomy || 'Understand',
        creativityLevel: referenceQuestion?.creativityLevel || 'low'
      };

      // Get context variables for the prompts (same as rewrite)
      const questionText = selectedQuestionForRefinement.question || selectedQuestionForRefinement.label || "";
      const enablingObjective = selectedQuestionForRefinement.learningObjective || "";
      const domain = selectedQuestionForRefinement.study || selectedQuestionForRefinement.bookname || "";
      const marks = selectedQuestionForRefinement.MaxMarks || selectedQuestionForRefinement.marks || 1;
      const originalquesitonid = selectedQuestionForRefinement.id;
      // creativityLevel can come back as a name ("Moderate") or be absent, and
      // parseInt of either produced NaN in the request payload.
      const creativityid = (() => {
        const raw = selectedQuestionForRefinement.creativityLevel;
        const numeric = parseInt(String(raw ?? ''), 10);
        if (Number.isFinite(numeric) && numeric > 0) return String(numeric);
        const name = String(raw ?? '').toLowerCase().replace(/[\s_-]+/g, '');
        if (name === 'high') return '2';
        if (name === 'veryhigh') return '3';
        return overrides?.creativityLevel ?? '1';
      })();
      const tanxonomyname = selectedQuestionForRefinement.taxonomy;


      // Create comprehensive prompt for similar generation using rewrite format
      const normalizeType = referenceQuestion.type.toLowerCase();

      const questionTypeMap: Record<string, string> = {
        "multiple-choice": "Multiple Choice",
        "multiple choice": "Multiple Choice",
        "multiple-response": "Multiple Response",
        "multiple response": "Multiple Response",
        "true-false": "True False",
        "true false": "True False",
        "written-response": "Written Response",
        "written response": "Written Response",
        "fill-in-the-blank": "Fill In the Blank",
        "fill in the blank": "Fill In the Blank",
        "matrix": "Matrix",
      };

      const targetQuestionType =
        questionTypeMap[normalizeType] ?? "Multiple Choice";


      const sourcetype = refinementSourceType === 'Book Based' ? 1 : 2;

      let questionPrompt = '';

      if (targetQuestionType === 'Multiple Choice' || targetQuestionType === 'Multiple Response') {
        const optionCount = selectedQuestionForRefinement.values.length;
        const numberOfCorrectOptions = targetQuestionType === 'Multiple Response' ? JSON.parse(selectedQuestionForRefinement.CorrectAnswer).length : 1;
        const perCorrectScore = numberOfCorrectOptions > 1 ? (marks / numberOfCorrectOptions) : 0;

        if (sourcetype === 2) {
          // LLM Source Prompt for Similar Generation
          questionPrompt = `Generate exactly ${refinementNumQuestions} ${targetQuestionType} questions similar to the following reference question, based exclusively on the Domain '${domain}' and aligned with the Enabling Objective: ${enablingObjective}.

          Reference Question:
          ${JSON.stringify(referenceInfo, null, 2)}

          Generate questions that:
          1. Are similar in style and difficulty level to the reference question
          2. Cover the same topic/concept but with different wording  
          3. Maintain the same question type and taxonomy level: ${tanxonomyname}
          4. Are based on the same domain and learning objectives
          5. Do not repeat the exact same wording as the reference question
          6. Each question should align with the content of the study material and the corresponding Enabling Objective, but **do not repeat or closely mirror the exact wording** of the EO statement
          7. Each question must adhere to the specified Taxonomy: ${tanxonomyname}
          8. Each question must reflect content strictly from the specified study material

          Important:
          1. For options that are complete sentences, **add a period at the end**.
          2. For options that are not complete sentences (e.g., single words, double words, phrases), **do not add a period**.
          3. Do not provide options with missing punctuation or inconsistent use of periods.
          4. Options must start with prefix A, B, C... Ensure exactly ${optionCount} options per question.
          5. Avoid repeating correct options across number of questions generated.
          6. Options should be exactly ${optionCount}.
          7. All Options/distractors should be in same length.
          8. Avoid decimal points in options and question stem, use whole numbers only.
          9. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.

       

          ${targetQuestionType === 'Multiple Response' ? `
          Multiple-Response Logic:
          - There must be exactly ${numberOfCorrectOptions} correct answers.
          - Avoid repeating correct answer positions across questions.
          - No discernible patterns in correct answer placement.
          - Even distribution of correct answers across all options.
          - Plausible distractors that are relevant and related to the content.

          Instruction:
          - The question stem must end with: "Select the ${numberOfCorrectOptions} correct options.".
          - Provide exactly ${numberOfCorrectOptions} correct answers among the options.

          Scoring:
          - Full Marks: if all correct answers are selected.
          - Partial Marks: award ${perCorrectScore.toFixed(2)} marks for each correct option selected (no negative marking). Do not award marks for incorrect options.
          - Zero Marks: if none are correct.
          ` : ''}

          Ensure the options follow these punctuation rules strictly.
          The output format should be in JSON, structured as follows:
          [ { 
            "QuestionStatement": "{A concise, passage or scenario-based setup}",
            "PartPrompt": "{A clear, direct question derived from the scenario}", 
            "label": {questionstatement } { PartPrompt },
            "FeedbackOption<option>": <Correct/Incorrect. Feedback for the particular option. (e.g., 'FeedbackOptionA: Incorrect. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.', 'FeedbackOptionB: Correct. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.'). In Json LHS side don't use the format like this 'FeedbackOption<B>, FeedbackOption<A>...' use 'FeedbackOptionA, FeedbackOptionB...'. Must provide Feedback for the options>,
            "values": [<provide exactly ${optionCount} Options with prefix A, B, C... up to Z depending on the optionCount. All distractors(options) should be in same length. Apply punctuation rules: complete sentences end with a period, phrases/words do not.>],
            "CorrectAnswer": ${targetQuestionType === 'Multiple Response' ? `<ARRAY of ${numberOfCorrectOptions} correct options with full text, e.g., ["A. First correct option.", "C. Second correct option."]>` : `<Correct option alphabet with full text. It must match one of the provided options (e.g., 'B. It is the correct definition.')>`},
            ${targetQuestionType === 'Multiple Response' ? `"Marking": <For Multiple Response, list only the correct option alphabets: if exactly two are correct, join with ' & ' (e.g., 'A & C'); if three or more are correct, list them comma-separated with spaces (e.g., 'A, C, E').>,` : `"Marking": <display the correct option alphabet>,`}
            "MaxMarks": ${marks},
            "ItemScoring": {
              "FullScore": ${marks},
              ${targetQuestionType === 'Multiple Response' ? `"PartialScore": ${perCorrectScore.toFixed(2)},` : ''}
              "ZeroScore": 0
            },
            "EnablingObjective": "${enablingObjective}",
            "Domain": "${domain}",
            "Taxonomy": "${tanxonomyname}",
            "QuestionType": "${targetQuestionType}",
            "originalquestionid": "${selectedQuestionForRefinement?.id || ''}",
            "creativityLevel": "${creativityid === '1' ? 'moderate' : creativityid === '2' ? 'high' : 'very-high'}"
          } ]
          The number of questions should be exactly ${refinementNumQuestions}.
          Important: - Only provide the output in the exact JSON format specified in reference info. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
        } else {
          // Book Source Prompt for Similar Generation (similar but with ReferenceInfo)
          questionPrompt = `Generate exactly ${refinementNumQuestions} ${targetQuestionType} questions similar to the following reference question, based exclusively on the Domain '${domain}' and aligned with the Enabling Objective: ${enablingObjective}.

          Reference Question:
          ${JSON.stringify(referenceInfo, null, 2)}

          Generate questions that:
          1. Are similar in style and difficulty level to the reference question
          2. Cover the same topic/concept but with different wording  
          3. Maintain the same question type and taxonomy level: ${tanxonomyname}
          4. Are based on the same domain and learning objectives
          5. Do not repeat the exact same wording as the reference question
          6. Each question should align with the content of the study material and the corresponding Enabling Objective, but **do not repeat or closely mirror the exact wording** of the EO statement
          7. Each question must adhere to the specified Taxonomy: ${tanxonomyname}
          8. Each question must reflect content strictly from the specified study material

          Important:
          1. For options that are complete sentences, **add a period at the end**.
          2. For options that are not complete sentences (e.g., single words, double words, phrases), **do not add a period**.
          3. Do not provide options with missing punctuation or inconsistent use of periods.
          4. Options must start with prefix A, B, C... Ensure exactly ${optionCount} options per question.
          5. Avoid repeating correct options across number of questions generated.
          6. Options should be exactly ${optionCount}.
          7. All Options/distractors should be in same length.
          8. Avoid decimal points in options and question stem, use whole numbers only.
          9. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
          10. Follow the same structure json format as in the reference question.

      

          ${targetQuestionType === 'Multiple Response' ? `
          Multiple-Response Logic:
          - There must be exactly ${numberOfCorrectOptions} correct answers.
          - Avoid repeating correct answer positions across questions.
          - No discernible patterns in correct answer placement.
          - Even distribution of correct answers across all options.
          - Plausible distractors that are relevant and related to the content.

          Instruction:
          - The question stem must end with: "Select the ${numberOfCorrectOptions} correct options.".
          - Provide exactly ${numberOfCorrectOptions} correct answers among the options.

          Scoring:
          - Full Marks: if all correct answers are selected.
          - Partial Marks: award ${perCorrectScore.toFixed(2)} marks for each correct option selected (no negative marking). Do not award marks for incorrect options.
          - Zero Marks: if none are correct.
          ` : ''}

          Ensure the options follow these punctuation rules strictly.
          The output format should be in JSON, structured as follows:
          [ { 
            "QuestionStatement": "{A concise, passage or scenario-based setup}",
            "PartPrompt": "{A clear, direct question derived from the scenario}", 
            "label": {questionstatement } { PartPrompt },
            "FeedbackOption<option>": <Correct/Incorrect. Feedback for the particular option. (e.g., 'FeedbackOptionA: Incorrect. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.', 'FeedbackOptionB: Correct. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.'). In Json LHS side don't use the format like this 'FeedbackOption<B>, FeedbackOption<A>...' use 'FeedbackOptionA, FeedbackOptionB...'. Must provide Feedback for the options>,
            "values": [<provide exactly ${optionCount} Options with prefix A, B, C... up to Z depending on the optionCount. All distractors(options) should be in same length. Apply punctuation rules: complete sentences end with a period, phrases/words do not.>],
            "CorrectAnswer": ${targetQuestionType === 'Multiple Response' ? `<ARRAY of ${numberOfCorrectOptions} correct options with full text, e.g., ["A. First correct option.", "C. Second correct option."]>` : `<Correct option alphabet with full text. It must match one of the provided options (e.g., 'B. It is the correct definition.')>`},
            ${targetQuestionType === 'Multiple Response' ? `"Marking": <For Multiple Response, list only the correct option alphabets: if exactly two are correct, join with ' & ' (e.g., 'A & C'); if three or more are correct, list them comma-separated with spaces (e.g., 'A, C, E').>,` : `"Marking": <display the correct option alphabet>,`}
            "MaxMarks": ${marks},
            "ItemScoring": {
              "FullScore": ${marks},
              ${targetQuestionType === 'Multiple Response' ? `"PartialScore": ${perCorrectScore.toFixed(2)},` : ''}
              "ZeroScore": 0
            },
            "EnablingObjective": "${enablingObjective}",
            "Domain": "${domain}",
            "Taxonomy": "${tanxonomyname}",
            "QuestionType": "${targetQuestionType}",
            "originalquestionid": "${selectedQuestionForRefinement?.id || ''}",
            "creativityLevel": "${creativityid === '1' ? 'moderate' : creativityid === '2' ? 'high' : 'very-high'}"
          } ]
          The number of questions should be exactly ${refinementNumQuestions}.
          Important: - Only provide the output in the exact JSON format specified in reference info. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
        }
      } else if (targetQuestionType === 'Written Response') {
        const minword = marks === 10 ? 250 : 100;

        questionPrompt = `Generate exactly ${refinementNumQuestions} Long Answer questions for ${marks} marks, similar to the following reference question:

        Reference Question:
        ${JSON.stringify(referenceInfo, null, 2)}

        Generate questions that:
        1. Are similar in style and difficulty level to the reference question but not exactly same content as the reference question.
        2. Cover the same topic/concept but with different wording  
        3. Maintain the same question type and taxonomy level: ${tanxonomyname}
        4. Are based on the same domain and learning objectives
        5. Do not repeat the exact same wording as the reference question
        6. Questions based exclusively on the Domain '${domain}'. 
        7. Each question should align with the content of the study material and the corresponding Enabling Objective: ${enablingObjective}, but **do not repeat or closely mirror the exact wording** of the EO statement
        8. Each question must adhere to the specified Taxonomy: ${tanxonomyname}
        9. Each question must reflect content strictly from the specified study material
        10. Follow the same structure json format as in the reference question.

        Important: 
        1. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        2. Do not create or include multi-part questions labeled with (a), (b), etc. Always write questions as a single, unified prompt without splitting into sub-parts. Ensure the question flows naturally and assesses all required elements cohesively.

        Key Points Structure:
        - based on the number of Marks in reference question give only that much keypoints(eg. if reference question has 1 Marks give 1 key points if 3 give 3 key points).
        - Each key point should be detailed and comprehensive.
        - Each key point should be relevant to the question and answer.
        - Each key point should be written in Canadian English.
        - Each key point should be written in simple and easy to understand language.

        Output must be strictly in valid JSON format as shown below:
        [
        {
            "QuestionStatement": "{A concise, passage or scenario-based setup}",
            "PartPrompt": "{A clear, direct question derived from the scenario}",
            "label": {questionstatement } { PartPrompt },
            "values": [],
            "CorrectAnswer": <Detailed answer with minimum ${minword} words>,
            "Marking": <display the correct option alphabet>,
            "MaxMarks":${marks},
            "ItemScoring": {
                "FullScore": ${marks},
                "ZeroScore": 0
            },
            "EnablingObjective": <for which Enabling objective question belongs to. Provide Enabling objective name, it should be same as in book, not number. Do not give word like this 'Consider all Enabling Objectives within study'>,
            "Domain": <for which Domain question belongs to. Provide Domain name, it should be same as in book, not number>,
            "KeyPoints":<Must follow the above key points Structure. List exactly ${marks} key points, each contributing 1 mark. Do not include any references, study numbers, Enabling Objectives, examples, or page numbers within the key points. Focus only on the essential content of the chapter and format should be <Keypoint> ~ <Explanation of the key point>. Provide keypoints in an array>
            "Taxonomy": "${tanxonomyname}",
            "QuestionType": "${targetQuestionType}",
            "originalquestionid": "${selectedQuestionForRefinement?.id || originalquesitonid}",
            "creativityLevel": "${creativityid === '1' ? 'moderate' : creativityid === '2' ? 'high' : 'very-high'}"
        }
        ]
        The number of questions should be exactly ${refinementNumQuestions}.
        Important: - Only provide the output in the exact JSON format specified in reference info. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
      } else if (targetQuestionType === 'Fill In the Blank') {

        questionPrompt = `Generate exactly ${refinementNumQuestions} Fill In the Blank questions for ${marks} marks, similar to the following reference question:

        Reference Question:
        ${JSON.stringify(referenceInfo, null, 2)}
        Generate questions that:
        1. Are similar in style and difficulty level to the reference question but not exactly same content as the reference question.
        2. Cover the same topic/concept but with different wording  
        3. Maintain the same question type and taxonomy level: ${tanxonomyname}
        4. Are based on the same domain and learning objectives
        5. Do not repeat the exact same wording as the reference question
        6. Questions based exclusively on the Domain '${domain}'. 
        7. Each question should align with the content of the study material and the corresponding Enabling Objective: ${enablingObjective}, but **do not repeat or closely mirror the exact wording** of the EO statement
        8. Each question must adhere to the specified Taxonomy: ${tanxonomyname}
        9. Each question must reflect content strictly from the specified study material
        10. Follow the same structure json format as in the reference question.

        Important: 
        1. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        2. Do not create or include multi-part questions labeled with (a), (b), etc. Always write questions as a single, unified prompt without splitting into sub-parts. Ensure the question flows naturally and assesses all required elements cohesively.


        Output must be strictly in valid JSON format as shown below:
        [
        {
        
            "QuestionStatement": "<Full paragraph context, no gaps.>",
            "PartPrompt": "<Sentence with one gap [gap1]>",
            "label": "<QuestionStatement> <PartPrompt>",
            "values": [],
            "CorrectAnswer": <The word or phrase that fills the blank>,
            "FeedbackOptionA": <Feedback for correct answer and do not include the "Correct" text in the Feedback provide>,
            "MaxMarks": ${marks},
            "ItemScoring": {
                            "FullScore": ${marks},
                            "PartialScore": 0,
                            "ScoringLogic": "Full marks if correct answer is selected. Zero if not correct."
                        }, 
            "marks": ${marks ?? '{"A":"Take the value from the context (do not hardcode; use the context value)"}'},
            "originalquestionid": "${selectedQuestionForRefinement?.id || originalquesitonid}",
            "EnablingObjective": <for which Enabling objective question belongs to. Provide Enabling objective name, it should be same as in book, not number. Do not give word like this 'Consider all Enabling Objectives within study'>,
        }
        ]
        Use Canadian English for all grammar, spelling, and vocabulary. Do not include any explanations or commentary outside the JSON response.`;


      } else if (targetQuestionType === 'Matrix') {

        questionPrompt = `Generate exactly ${refinementNumQuestions} matrix questions for ${marks} marks, similar to the following reference question:

        Reference Question:
        ${JSON.stringify(referenceInfo, null, 2)}

        Generate ${refinementNumQuestions} Matrix question(s) based on the following context.


        Context:
        Domain: ${domain}
        Enabling Objective: ${enablingObjective}
        Taxonomy: ${tanxonomyname}
        Max Marks: ${marks}

        Generate questions that:
        1. Are similar in style and difficulty level to the reference question but not exactly same content as the reference question
        2. Cover the same topic/concept but with different wording  
        3. Maintain the same question type and taxonomy level: ${tanxonomyname}
        4. Are based on the same domain and learning objectives
        5. Do not repeat the exact same wording as the reference question
        6. Questions based exclusively on the Domain '${domain}'. 
        7. Each question should align with the content of the study material and the corresponding Enabling Objective: ${enablingObjective}, but **do not repeat or closely mirror the exact wording** of the EO statement
        8. Each question must adhere to the specified Taxonomy: ${tanxonomyname}
        9. Each question must reflect content strictly from the specified study material
        10. Follow the same structure json format as in the reference question.

        Important: 
        1. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.
        2. Do not create or include multi-part questions labeled with (a), (b), etc. Always write questions as a single, unified prompt without splitting into sub-parts. Ensure the question flows naturally and assesses all required elements cohesively.

        1 . Question Format : 
        - question phrase complete sentence end question mark . 
        - candidate able recognise context question read answer option . 
        - question unique label . 
        - reuse repeat exact word previous question label . 
       
        2 . row Columns : 
        - row represent sub - element scenario derive study content . 
        - column represent possible response classification . 
        - row column phrase canadian English , grammatically parallel , contextually relevant . 


        3 . Output Format ( json ): 
        generate question follow json structure : 
        [ { 
            "id" : str , 
            "QuestionStatement" : " { concise , passage scenario - base setup } " , 
            "PartPrompt" : " { clear , direct question derive scenario } " , 
            "label":{questionstatement } { PartPrompt } , 
            "type":"Matrix " , 
            "rows" : [ { 
                    " value":str , 
                    " text":str , 
            } , ..... ] , 
            "columns" : [ { 
                    " value":str , 
                    " text":str , 
            } , ..... ] , 
            "CorrectAnswer" : [ int , ... ] , 
            "Feedbacks":[str , .... ] , 
            "MaxMarks " : ${marks}, 
            "ItemScoring " : { 
            "FullScore " : ${marks}, 
            "PartialScore" : 0 , 
            "ScoringLogic" : "mark correct answer select . zero correct." 
            } , 
            "EnablingObjective" : " < enable objective question belong . provide Enabling objective , book , number . word like ' consider Enabling Objectives study ' > " , 
            "BookName" : "< book >",
            "originalquestionid": "${selectedQuestionForRefinement?.id || originalquesitonid}",
        } ] 
        
        important : 
            " ' answer ' array integer represent index select column answer row . " 
            " Feedbacks " array string provide feedback row matrix question . feedback string correspond correct answer index specify " CorrectAnswer " . feedback explain correct answer appropriate row . use clear , constructive language reinforce understand .


        - TAXONOMY LEVEL TO USE: '${tanxonomyname}'
        - Avoid using escape characters in json output unless absolutely necessary.
        
        Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary in every word.


        The number of questions should be exactly ${refinementNumQuestions}.
        Important: - Only provide the output in the exact JSON format specified in reference info. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
      } else {
        // Generic prompt for other question types (True False, Fill In the Blank)
        questionPrompt = `Generate exactly ${refinementNumQuestions} ${targetQuestionType} question(s) similar to the following reference question:

        Reference Question:
        ${JSON.stringify(referenceInfo, null, 2)}

        Generate questions that:
        1. Are similar in style and difficulty level to the reference question
        2. Cover the same topic/concept but with different wording  
        3. Maintain the same question type and taxonomy level: ${tanxonomyname}
        4. Are based on the same domain and learning objectives
        5. Do not repeat the exact same wording as the reference question
        6. Each question should align with the content of the study material and the corresponding Enabling Objective: ${enablingObjective}, but **do not repeat or closely mirror the exact wording** of the EO statement
        7. Each question must adhere to the specified Taxonomy: ${tanxonomyname}
        8. Each question must reflect content strictly from the specified study material

        Important guidelines:
        1. Response must be in Canadian English, ensuring the use of Canadian spelling conventions, grammar, and vocabulary.
        2. Return ONLY valid JSON array format.
        3. If the domain or reference material contains any mathematical equations or formulas, you must retain and format them properly using LaTeX enclosed in \\( and \\) for inline equations, and \\[ and \\] for block equations.
        3. Each question should be unique but similar in nature to the reference question but not exactly same content as the reference question.

        The output format should be in JSON, structured as follows:
        [
        {
            "QuestionStatement": "{A concise, passage or scenario-based setup}",
            "PartPrompt": "{A clear, direct question derived from the scenario}",
            "label": {questionstatement } { PartPrompt },
            "values": [<Options if applicable>],
            ${targetQuestionType === 'Fill In the Blank' ? `"FeedbackOptionA": <Feedback for correct answer>,` : `"FeedbackOption<option>": <Correct/Incorrect. Feedback for the particular option. (e.g., 'FeedbackOptionA: Incorrect. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.', 'FeedbackOptionB: Correct. Disregarding past claims is not a prudent approach to assessing risk and determining coverage.'). In Json LHS side don't use the format like this 'FeedbackOption<B>, FeedbackOption<A>...' use 'FeedbackOptionA, FeedbackOptionB...'. Must provide Feedback for the options>,`}            
            "CorrectAnswer": <Correct answer>,
            "Marking": <display the correct option alphabet>,
            "MaxMarks": ${marks},
            "ItemScoring": {
                "FullScore": ${marks},
                "ZeroScore": 0
            },
            "EnablingObjective": "${enablingObjective}",
            "Domain": "${domain}",
            "Taxonomy": "${tanxonomyname}",
            "QuestionType": "${targetQuestionType}",
            "originalquestionid": "${selectedQuestionForRefinement?.id || ''}",
            "creativityLevel": "${creativityid === '1' ? 'moderate' : creativityid === '2' ? 'high' : 'very-high'}"
        }
        ]
        Important: - Only provide the output in the exact JSON format specified in reference info. - Ensure that all questions are generated from the mentioned study only, without any additional explanations, comments, or apologies.`;
      }

      questionPrompt += `\n\nImportant: If the domain or reference material contains any mathematical equations or formulas, you must retain and format them properly using LaTeX enclosed in \\( and \\) for inline equations, and \\[ and \\] for block equations.`;

      const payload = {
        agent_status: "1",
        job_id: "",
        url: "ACCA/BUSINESS_AND_TECHNOLOGY",
        question: questionPrompt,
        source: refinementSourceType,
        appcode: appcode,
        questiontypeid: parseInt(questiontypeid),
        noofquestions: parseInt(refinementNumQuestions),
        creativitylevelid: parseInt(creativityid),
        taxonomyid: parseInt(effectiveTaxonomy),
        taxonomyname: tanxonomyname,
        custcode: custcode,
        orgcode: orgcode,
        kbname: bookTitle.replace(/\s+/g, '_'),
        sourcename: sessionStorage.getItem('bookTitle').replace(/\s+/g, '_'),
        agentname: "itemrewrite",
        question_type: String(effectiveQuestionType || '').toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        usercode: usercode,
        booknameid: parseInt(booknameid),
        bookname: bookTitle,
        questiontypename: effectiveQuestionType === 'multiple-choice' ? 'Multiple Choice' : effectiveQuestionType.replace('-', ' '),
        difficultylevelid: 0,
        chaptercode: sessionStorage.getItem('chaptercode'),
        creativitylevel: parseInt(creativityid),
        validate_content: "No",
        task_content: bookTitle.replace(/\s+/g, '_'),
        locode: LoId,
        sourcetype: refinementSourceType === 'Book Based' ? 1 : 2,
        referenceinfo: JSON.stringify(referenceInfo),
        Rating: "",
        Rating_Feedback: ""
      };

      console.log('Sending similar generation request:', payload);

      const response = await fetch(`${AIG_QUIZ_GEN_URL}/agentic_item_gen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload).replace(/[\u221a\u221A]/g, 'sqrt')
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Similar generation response:', result);

      // Parse the generated questions from the response
      let generatedQuestions = [];
      if (result && Array.isArray(result)) {
        generatedQuestions = result;
      } else if (result && result.data && Array.isArray(result.data)) {
        generatedQuestions = result.data;
      }
      let locode = ""

      if (generatedQuestions.length > 0) {
        // Image-based source question -> the refined questions need their own image.
        await attachImagesToRefinedQuestions(generatedQuestions, referenceQuestion);

        // Prepare questions for database insertion
        const questionsPayload = generatedQuestions.map((q: any, index: number) => {
          // Derive GUID from original identifier, preserving chapter, LO, and level
          const originalId = referenceQuestion?.questionguid || referenceQuestion?.id || '';
          const questionTypeCode = (() => {
            const t = String(effectiveQuestionType || '').toLowerCase();
            if (t === 'multiple-choice' || t === 'multiple choice') return 'MC';
            if (t === 'multiple-response' || t === 'multiple response') return 'MR';
            if (t === 'true-false' || t === 'true false') return 'TF';
            if (t === 'matrix') return 'MM';
            if (t === 'fill-in-the-blank' || t === 'fill in the blank') return 'FB';
            if (t === 'written-response' || t === 'written response' || t === 'long-answer' || t === 'long answer') return 'WR';

            // Fallback to model output only if effectiveQuestionType is unknown
            return q.type === 'Written Response' ? 'WR' :
              q.type === 'Multiple Response' ? 'MR' :
                q.type === 'True False' ? 'TF' :
                  q.type === 'Matrix' ? 'MM' :
                    q.type === 'Fill In the Blank' ? 'FB' : 'MC';
          })();

          const numericTaxonomyId = parseInt(effectiveTaxonomy || '0', 10) || 0;
          const langCode = 'EN';

          const buildGuidFromOriginal = (original: string, newType: string, fallback: string) => {
            if (!original) return fallback;
            const match = original.match(/^(.*_)(MC|MR|TF|FIB|WR|MM|TR|FB|MM)(_L\d+_[A-Z-]+_ID.*)$/);
            if (match) {
              return `${match[1]}${newType}${match[3]}`;
            }
            return fallback;
          };

          const loPart = (originalId.split('_').find(p => p.startsWith('LO')) || LoId || '').replace(/^_+/, '');
          const extractChapter = (guid: string) => {
            const parts = String(guid || '').split('_');
            return parts.find(p => /^S\d+$/i.test(p)) || parts.find(p => /^C\d+$/i.test(p)) || '';
          };
          const chapterPart = extractChapter(originalId) || String(chapterCode || '0').padStart(2, '0');

          const fallbackGuid = `IG_V2025_${chapterPart}_${loPart}_${questionTypeCode}_L${numericTaxonomyId}_${langCode}_ID`;
          const questionguid = buildGuidFromOriginal(originalId, questionTypeCode, fallbackGuid);

          return {
            usercode: sessionStorage.getItem('userCode'),
            orgcode: sessionStorage.getItem('orgcode'),
            custcode: sessionStorage.getItem('custcode'),
            appcode: sessionStorage.getItem('appcode'),
            referenceinfo: JSON.stringify(referenceInfo),
            booknameid: sessionStorage.getItem('bookid'),
            noofquestions: parseInt(refinementNumQuestions),
            questiontypeid: parseInt(questiontypeid),
            taxonomyid: parseInt(effectiveTaxonomy),
            questiondata: { ...q },
            AIquestiondata: { ...q },
            difficultylevelid: 1,
            chaptercode: sessionStorage.getItem('chaptercode'),
            locode: loPart,
            LearningObjective: referenceQuestion?.learningObjective || referenceQuestion?.LearningObjective || '',
            sourcetype: refinementSourceType === 'Book Based' ? 1 : 2,
            questionguid: questionguid.match(/.*ID/)?.[0] || fallbackGuid,
            previousQuestionData: referenceQuestion,
            creativitylevelid: parseInt(creativityid),
            originalquestionid: referenceQuestion?.id || referenceQuestion?.id?.match(/.*ID/)?.[0],
            currentversion: '1',
            instructions: [''],
            maininstruction: '',
            feedback: [''],
            duplicateguid: '',
            generatedimagetype: toGeneratedImageType(
              q?.generatedimagetype ?? referenceQuestion?.generatedimagetype
            )
          };
        });

        console.log('Final payload for DB insertion:', JSON.stringify(questionsPayload, null, 2));

        const insertResponse = await axios.post(`${AIG_QUIZ_GEN_URL}/insert_to_db`, JSON.parse(JSON.stringify({ questionsPayload }).replace(/[\u221A\u221A]/g, 'sqrt')));
        console.log('DB Insertion Response:', insertResponse.data);

        // Check if database insertion was successful
        let insertedCount = 0;
        if (insertResponse.data && insertResponse.data.question_results) {
          const results = Array.isArray(insertResponse.data.question_results) ? insertResponse.data.question_results : [];
          results.forEach((result: any) => {
            try {
              const r = result?.result?.[0];
              if (r && (r.questionrequestid || r.questionid)) {
                insertedCount++;
              }
            } catch (_) { /* noop */ }
          });
        }

        if (insertedCount > 0) {
          setRefinementSuccessMessage(`Successfully generated and saved ${insertedCount} similar question(s) to the database.`);
        } else {
          setRefinementSuccessMessage(`Successfully generated ${refinementNumQuestions} similar questions, but there may be issues with database insertion. Please check the results.`);
        }
        setShowRefinementSuccessDialog(true);
        await fetchData();
      } else {
        throw new Error('No questions were generated');
      }

    } catch (e) {
      console.error('=== SIMILAR GENERATION ERROR ===');
      console.error('Full error object:', e);
      console.error('Error response:', e?.response?.data);
      console.error('Error status:', e?.response?.status);
      console.error('Error message:', e?.message);

      let errorMessage = 'Failed to generate similar questions.';

      // Check if it's specifically a database insertion error
      if (e?.response?.status === 500 && e?.response?.data?.includes('database')) {
        errorMessage = 'Questions were generated successfully but failed to save to database. Please try again or contact support.';
      } else if (e?.response?.data?.message) {
        errorMessage = `Failed to generate similar questions: ${e.response.data.message}`;
      } else if (e?.message) {
        errorMessage = `Failed to generate similar questions: ${e.message}`;
      }

      console.error('Final error message:', errorMessage);
      setRefinementErrorMessage(errorMessage);
      setShowRefinementErrorDialog(true);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* <AppSidebar /> */}

      <div className="pl-63">
        {loading && (
          <PageLoader text={loadingMessage} />
        )}
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">

                <img
                  src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                  alt="AI-Levate"
                  className="h-10 w-auto"
                />

              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-purple-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs">✦</span>
                </div>
                <span className="text-sm text-purple-600 font-medium">Book Name: {sessionStorage.getItem("bookTitle")}</span>
              </div>
              <Link to="/advanced-item-generation">
                <Button variant="ghost" size="sm" className="text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  Back to Dashboard
                </Button>
              </Link>
              {/* <ProfileDropdown /> */}
            </div>
          </div>
        </header>

        <main className="p-6 space-y-6" style={{ marginBottom: '100px' }}>
          {/* Navigation Tabs */}
          <div className="flex justify-center mb-8">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 max-w-lg">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setActiveTab("generate");
                    navigate("/advanced-question-generator/:bookCode");
                  }}
                  className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${window.location.pathname === "/advanced-item-generation" || activeTab === "generate"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                >
                  <Sparkles className="h-4 w-4" />
                  Generate Questions
                </button>
                <button
                  onClick={() => setActiveTab("repository")}
                  className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === "repository"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                >
                  <FileText className="h-4 w-4" />
                  Question Repository
                </button>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statsData.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <Card key={index} className="border border-border/40">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                        <p className="text-2xl font-bold" style={{ color: stat.valueColor, fontSize: '1.25rem' }}>
                          {stat.value}
                        </p>
                        <p className="text-xs text-muted-foreground">{stat.change}</p>
                      </div>
                      <Icon className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div> */}

          {/* Filters & Search */}
          <Card className="border border-border/40">
            <CardContent className="p-6">
              <div className="space-y-4">
                {dropdownError && <div className="text-xs text-red-500">{dropdownError}</div>}
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Filter className="h-4 w-4" />
                  Filters & Search
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Source Type */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Source Type</label>
                    <Select
                      value={selectedSourceType}
                      onValueChange={(val) => {
                        setSelectedSourceType(val);
                        sessionStorage.setItem("selectedSourceType", val);
                        fetchData({ sourceType: val });
                      }}
                      defaultValue="0"
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        <SelectItem value="1">{currentBookName}</SelectItem>
                        <SelectItem value="2">LLM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>


                  {/* Study Domain (Chapter) - Dynamic */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Study Domain</label>
                    <Select
                      value={selectedChapter}
                      onValueChange={val => {
                        setSelectedChapter(val);
                        // Picking a chapter resets Learning Objective to All (see the
                        // effect on selectedChapter), so refetch with it cleared.
                        fetchData({ chapterCode: val, learningObjective: "0" });
                      }}
                      disabled={chaptersLoading || chapters.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={chaptersLoading ? "Loading..." : "Select study domain"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        {chapters.map((ch) => (
                          <SelectItem key={ch.chapterCode} value={ch.chapterCode}>
                            {ch.chapterName || ch.chapterCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {chaptersError && <div className="text-xs text-red-500">{chaptersError}</div>}
                  </div>

                  {/* Learning Objective - Dynamic */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Learning Objective</label>
                    <Select
                      value={selectedLO}
                      onValueChange={val => {
                        setSelectedLO(val);
                        fetchData({ learningObjective: val });
                      }}
                      disabled={loLoading || learningObjectives.length === 0 || !selectedChapter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loLoading ? "Loading..." : (!selectedChapter ? "Select study domain first" : "All")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        {learningObjectives.map((lo) => (
                          <SelectItem key={lo.loCode} value={lo.loCode}>
                            {lo.loName || lo.loCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {loError && <div className="text-xs text-red-500">{loError}</div>}
                  </div>

                  {/* Taxonomy */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Taxonomy</label>
                    <Select
                      value={selectedTaxonomy}
                      onValueChange={(val) => {
                        setSelectedTaxonomy(val);
                        sessionStorage.setItem("selectedTaxonomy", val);
                        fetchData({ taxonomy: TAXONOMY_FILTER_IDS[val] || "0" });
                      }}
                      disabled={taxonomyList.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={taxonomyList.length === 0 ? "No data" : "Select taxonomy"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        {taxonomyList.map((taxonomy) => (
                          <SelectItem key={taxonomy} value={taxonomy}>
                            {taxonomy}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {dropdownError && <div className="text-xs text-red-500">{dropdownError}</div>}
                  </div>

                  {/* Question Type */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Question Type</label>
                    <Select
                      value={selectedQuestionType}
                      onValueChange={(val) => {
                        setSelectedQuestionType(val);
                        sessionStorage.setItem("selectedQuestionType", val);
                        fetchData({ questionType: val });
                      }}
                      disabled={questionTypes.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={questionTypes.length === 0 ? "No data" : "Select question type"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        {questionTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Passage Type — client-side filter over the loaded questions */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Passage Type</label>
                    <Select
                      value={selectedPassageFilter}
                      onValueChange={(val) => {
                        setSelectedPassageFilter(val);
                        sessionStorage.setItem("selectedPassageFilter", val);
                        setQuestionPage(1);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        <SelectItem value="single-passage">Single Passage</SelectItem>
                        <SelectItem value="multi-passage">Multi Passage</SelectItem>
                        <SelectItem value="table-passage">Table Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Creativity Level */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Creativity Level</label>
                    <Select
                      value={selectedCreativityLevel}
                      onValueChange={(val) => {
                        setSelectedCreativityLevel(val);
                        sessionStorage.setItem("selectedCreativityLevel", val);
                        fetchData({ creativityLevel: val });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        <SelectItem value="1">Moderate</SelectItem>
                        <SelectItem value="2">High</SelectItem>
                        <SelectItem value="3">Very High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Created By */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Created By</label>
                    <Select
                      value={selectedCreatedBy}
                      onValueChange={(val) => {
                        setSelectedCreatedBy(val as "all" | "me" | "others");
                        fetchData({ createdBy: val });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">All</SelectItem>
                        <SelectItem value="1">Me</SelectItem>
                        <SelectItem value="2">Others</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Rating */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Rating</label>
                    <Select
                      value={selectedRating}
                      onValueChange={(val) => {
                        setSelectedRating(val);
                        sessionStorage.setItem("selectedRating", val);
                        fetchData({ rating: val });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        <SelectItem value="1">Good</SelectItem>
                        <SelectItem value="2">Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>


                {/* Search Bar */}
                <div className="grid grid-cols-0 md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Search</label>
                    <input
                      type="text"
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter search text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleGo(); }}
                    />
                  </div>
                  <div >
                    <Button onClick={handleGo}
                    >
                      Go
                    </Button>
                  </div>
                </div>


              </div>
            </CardContent>
          </Card>


          <Dialog open={ratingDialogOpen} onOpenChange={setRatingDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold">{isFeedbackReadOnly ? 'Feedback description' : 'Share feedback'}</DialogTitle>
              </DialogHeader>

              <div className="space-y-6 pt-2">
                {/* Question Display */}
                {!isFeedbackReadOnly && (
                  <div>
                    <p className="text-sm text-foreground leading-relaxed">
                      <span className="font-semibold">1.</span> {selectedQuestion}
                    </p>
                  </div>
                )}

                {/* Rating Section */}
                {!isFeedbackReadOnly && (
                  <div className="flex items-center justify-center gap-6">
                    <button
                      onClick={() => setQuestionRating("up")}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all border-2 ${questionRating === "up"
                        ? "bg-green-500 border-green-600 scale-110 shadow-lg"
                        : "bg-white border-gray-300 hover:border-green-400 hover:scale-105"
                        }`}
                    >
                      <ThumbsUp
                        className={`h-8 w-8 ${questionRating === "up" ? "text-white" : "text-gray-400"}`}
                        fill={questionRating === "up" ? "white" : "none"}
                      />
                    </button>
                    <button
                      onClick={() => setQuestionRating("down")}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all border-2 ${questionRating === "down"
                        ? "bg-red-500 border-red-600 scale-110 shadow-lg"
                        : "bg-white border-gray-300 hover:border-red-400 hover:scale-105"
                        }`}
                    >
                      <ThumbsDown
                        className={`h-8 w-8 ${questionRating === "down" ? "text-white" : "text-gray-400"}`}
                        fill={questionRating === "down" ? "white" : "none"}
                      />
                    </button>
                  </div>
                )}

                {/* Feedback Content */}
                {isFeedbackReadOnly ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Feedback:</label>
                    <div className="min-h-[120px] rounded-md border border-input bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                      {feedbackText || '—'}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Description:</label>
                    <Textarea
                      placeholder="Enter your feedback."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      className="min-h-[120px] resize-none"
                    />
                  </div>
                )}

                {/* Note */}
                {/* {!isFeedbackReadOnly && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-800 italic leading-relaxed">
                      Note: This feedback will be triaged by Development team and will be accounted for further training the model.
                    </p>
                  </div>
                )} */}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setRatingDialogOpen(false)}
                    className="px-6"
                  >
                    Close
                  </Button>
                  {!isFeedbackReadOnly && (
                    <Button
                      onClick={handleSubmitFeedback}
                      disabled={isSubmittingFeedback}
                      className="px-6">
                      {isSubmittingFeedback ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Submitting...
                        </>
                      ) : (
                        'Submit'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>


          {/* Text-to-Speech settings. Read aloud lives in the preview dialog; these
              choose the voice it uses. Same storage keys as the Generate screen. */}
          {speechControlsVisible && (
            <Card className="border border-purple-200/60 bg-purple-50/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Volume2 className="h-4 w-4 text-purple-700" />
                  <span className="text-sm font-semibold text-purple-900">Text-to-Speech (Audio)</span>
                  <span className="text-xs text-purple-700/80">Applies to the Audio button in question preview</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-purple-900 block mb-1">Speed</label>
                    <Select
                      value={['0.5', '1', '2'].includes(speechRate) ? speechRate : '1'}
                      onValueChange={(val) => { setSpeechRate(val); persistSpeechPref('speechRate', val); }}
                    >
                      <SelectTrigger className="h-9 bg-white border-purple-200 text-xs">
                        <SelectValue placeholder="Select Speed" />
                      </SelectTrigger>
                      <SelectContent className="bg-white z-50">
                        <SelectItem value="0.5" className="text-xs">Slow (0.5x)</SelectItem>
                        <SelectItem value="1" className="text-xs">Normal (1.0x)</SelectItem>
                        <SelectItem value="2" className="text-xs">Fast (2.0x)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-purple-900 block mb-1">Voice Gender</label>
                    <Select
                      value={speechGender}
                      onValueChange={(val) => { setSpeechGender(val); persistSpeechPref('speechGender', val); }}
                    >
                      <SelectTrigger className="h-9 bg-white border-purple-200 text-xs">
                        <SelectValue placeholder="Select Gender" />
                      </SelectTrigger>
                      <SelectContent className="bg-white z-50">
                        <SelectItem value="female" className="text-xs">Female</SelectItem>
                        <SelectItem value="male" className="text-xs">Male</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-purple-900 block mb-1">Accent / Region</label>
                    <Select
                      value={speechAccent}
                      onValueChange={(val) => { setSpeechAccent(val); persistSpeechPref('speechAccent', val); }}
                    >
                      <SelectTrigger className="h-9 bg-white border-purple-200 text-xs">
                        <SelectValue placeholder="Select Accent" />
                      </SelectTrigger>
                      <SelectContent className="bg-white z-50">
                        <SelectItem value="en-IN" className="text-xs">English (India)</SelectItem>
                        <SelectItem value="en-US" className="text-xs">English (US)</SelectItem>
                        <SelectItem value="en-GB" className="text-xs">English (UK)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Questions Table */}
          <Card className="border border-border/40">
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-6 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{displayedQuestions.length} Questions</span>
                  {error && <span className="text-xs text-red-500 ml-2">{error}</span>}
                </div>
                <div className="flex items-center gap-2">

                  {/* <Button
                    variant="outline"
                    size="sm"
                    className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 shadow-sm"
                    onClick={() => setFlashcardOpen(true)}
                    disabled={noResults || questions.length === 0}
                  >
                    <Presentation className="h-4 w-4 mr-1 text-purple-600" />
                    Flashcards
                  </Button> */}

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={handleBulkDeleteClick}
                    disabled={selectedQuestions.length === 0}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete Selected
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportToWord}
                    disabled={noResults || displayedQuestions.length === 0}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Export to Word
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportToExcel}
                    disabled={noResults || displayedQuestions.length === 0}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export to Excel
                  </Button>

                  {showBulkValidate === 1 && showBulkValidateState === 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkValidate}
                      disabled={noResults || displayedQuestions.length === 0 || isValidating}
                    >
                      <ListChecks className="h-4 w-4 mr-1" />
                      {isValidating ? "Validating..." : "Bulk Item Validate"}
                    </Button>
                  )}

                  {showExportMetadata === 1 && showExportMetadataState === 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportMetadataToExcel}
                      disabled={noResults || displayedQuestions.length === 0}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export Metadata
                    </Button>
                  )}

                  {showBulkMetadata === 1 && showBulkMetadataState === 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkMetadata}
                      disabled={noResults || displayedQuestions.length === 0 || loading}
                    >
                      <Database className="h-4 w-4 mr-1" />
                      Bulk Item Metadata
                    </Button>
                  )}

                </div>
              </div>

              <Table>
                {!noResults && (
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        {/* Master checkbox for select all */}
                        <SelectAllCheckbox
                          selectedCount={selectedQuestions.length}
                          totalCount={displayedQuestions.length}
                          onChange={(checked: boolean) => {
                            if (checked) {
                              setSelectedQuestions(displayedQuestions.map(q => q.id));
                            } else {
                              setSelectedQuestions([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead className="w-10 px-1 text-center">Rating</TableHead>
                      <TableHead className="w-48">Question ID</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>User Name</TableHead>
                      <TableHead className="w-10 px-1 text-center">Preview</TableHead>
                      <TableHead className="w-10 px-1 text-center">Edit</TableHead>
                      {featurePreferences.isSimilarity === 1 && <TableHead className="w-10 px-1 text-center" title="Check Similarity">Similarity</TableHead>}
                      <TableHead className="w-10 px-1 text-center" title="Item Validation">Valid</TableHead>
                      <TableHead className="w-10 px-1 text-center" title="Item Metadata">Meta</TableHead>
                      <TableHead className="w-10 px-1 text-center">Delete</TableHead>
                      <TableHead className="w-10 px-1 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                )}
                <TableBody>
                  {noResults || displayedQuestions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-gray-500">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Search className="h-12 w-12 text-gray-300" />
                          <p className="text-lg font-medium">No Questions Found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedQuestions.map((question, index) => (
                      <TableRow key={question.id}>
                        <TableCell>
                          {/* Individual row checkbox */}
                          <input
                            type="checkbox"
                            checked={selectedQuestions.includes(question.id)}
                            onChange={() => handleSelectQuestion(question.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {questionPageStart + index + 1}
                          </div>
                        </TableCell>
                        <TableCell className="w-10 px-1 text-center">
                          {question.ratingid === 1 ? (
                            <ThumbsUp className="h-3 w-3 text-green-600 inline-block" fill="currentColor" />
                          ) : question.ratingid === 2 ? (
                            <ThumbsDown className="h-3 w-3 text-red-600 inline-block" fill="currentColor" />
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{question.id}</span>
                            {/* Passage type, decided by the same rule as the Passage Type
                                filter (table first, then 1 tab / 2+ tabs), so a row's icon
                                always agrees with what that filter returns. */}
                            {(() => {
                              if (hasTableAnalysisData(question)) {
                                return (
                                  <span title="Table Based" aria-label="Table based question"
                                    className="inline-flex items-center text-emerald-600 flex-shrink-0 select-none">
                                    <Table2 className="h-3.5 w-3.5" />
                                  </span>
                                );
                              }
                              const tabCount = getPassageTabCount(question);
                              if (tabCount >= 2) {
                                return (
                                  <span title={`Multi Passage (${tabCount} passages)`}
                                    aria-label={`Multi passage question with ${tabCount} passages`}
                                    className="inline-flex items-center gap-0.5 text-violet-600 flex-shrink-0 select-none">
                                    <Files className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-semibold leading-none">{tabCount}</span>
                                  </span>
                                );
                              }
                              if (tabCount === 1) {
                                return (
                                  <span title="Single Passage" aria-label="Single passage question"
                                    className="inline-flex items-center text-amber-600 flex-shrink-0 select-none">
                                    <FileText className="h-3.5 w-3.5" />
                                  </span>
                                );
                              }
                              return null;
                            })()}
                            {hasQuestionImage(question) && (
                              <span
                                title="Contains image"
                                aria-label="Question contains image"
                                className="inline-flex items-center text-blue-600 flex-shrink-0 select-none"
                              >
                                <FileImage className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="truncate"><LatexRenderer content={replaceGapToken(getCleanStem(question))}></LatexRenderer></div>
                        </TableCell>
                        <TableCell>{question.type}</TableCell>
                        <TableCell>
                          <span style={{ color: "#7e2a0c", fontSize: '0.875rem' }}>
                            {question.userName || question.userCode || question.createdBy || 'Unknown'}
                          </span>
                        </TableCell>
                        <TableCell className="px-1 text-center">
                          {/* Read aloud lives inside the preview dialog now, not in the
                              list; the Actions cell carries the validation status. */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                            title="Preview question"
                            aria-label={`Preview question ${question.id || ''}`}
                            onClick={() => { setSelectedQuestions([]); setPreviewQuestion(question); setPreviewOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        <TableCell className="px-1 text-center">
                          {!savedQuestions.has(question.id?.toString() || '') && (() => {
                            const quesOrigin = question?.quesOrigin;
                            // If originallanguage is null or English, treat as English type question (editable), else Non-English (not editable)
                            const isEditable = !quesOrigin || quesOrigin === 'English' || quesOrigin === 'en';

                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-green-600 hover:text-green-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                                title={isEditable ? "Edit question" : "Cannot edit Non-English question"}
                                aria-label={`Edit question ${question.id || ''}`}
                                disabled={!isEditable}
                                onClick={() => { setSelectedQuestions([]); setEditQuestion(question); setEditOpen(true); }}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            );
                          })()}
                        </TableCell>

                        {/* Check Similarity Next to Edit */}
                        {featurePreferences.isSimilarity === 1 && (
                          <TableCell className="px-1 text-center">
                            {(() => {
                              // Similarity data is not available yet for a question saved
                              // today, so the action is disabled until the next day. The
                              // stored date is GMT; it is compared as the user's local day.
                              const createdAt = question.created_date ? new Date(question.created_date) : null;
                              const savedToday = !!createdAt && !isNaN(createdAt.getTime())
                                && createdAt.toDateString() === new Date().toDateString();
                              // "Check Similarity" in the row menu works it out on demand,
                              // so afterwards the icon is available for that question too.
                              const isDisabled = savedToday && !similarityReadyIds.has(String(question.id));
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-8 w-8 p-0 ${isDisabled ? 'text-gray-400 opacity-50 cursor-not-allowed' : 'text-purple-600 hover:text-purple-700 cursor-pointer'}`}
                                  title={isDisabled ? "Not available for today's questions" : "Check Similarity"}
                                  aria-label={`Check similarity for question ${question.id || ''}`}
                                  disabled={isDisabled}
                                  onClick={() => {
                                    if (!isDisabled) {
                                      openSimilarityPage(question);
                                    }
                                  }}
                                >
                                  <GitCompare className="h-4 w-4" />
                                </Button>
                              );
                            })()}
                          </TableCell>
                        )}

                        {/* Item Validation status. Enabled once a validation run holds
                            the question — clicking opens its report, exactly as the
                            3-dot Validate does for a validated item — and greyed out
                            while it has not been validated. Same enabled/disabled
                            reading the Image and Similarity icons use. Editing a
                            question clears its record, so it greys out again. */}
                        <TableCell className="px-1 text-center">
                          {(() => {
                            // The run is already known from the status load, so opening the
                            // report hands it straight over — no get-itemvalidation-data and
                            // no re-scan of the analysis runs on click.
                            const validatedRun = getValidatedRunFor(question);
                            const validated = !!validatedRun;
                            const currentlyValidating = validatingQuestionIds.has(question.id);
                            // A disabled button ignores the mouse (pointer-events: none), so
                            // its own title never shows. The wrapper carries the message.
                            const validationHint = currentlyValidating
                              ? "Validating this item… the report will be available once it finishes."
                              : validated
                                ? "Validated — view the validation report"
                                : "This item has not been validated yet. Use Item Validate in the ⋮ menu to validate it.";
                            return (
                              <span className="inline-flex" title={validationHint}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-8 w-8 p-0 ${currentlyValidating
                                  ? 'text-gray-400 cursor-wait'
                                  : validated
                                    ? 'text-green-600 hover:text-green-700 cursor-pointer'
                                    : 'text-gray-400 opacity-50 cursor-not-allowed'
                                  }`}
                                title={validationHint}
                                aria-label={
                                  currentlyValidating
                                    ? `Validating question ${question.id || ''}`
                                    : validated
                                      ? `View validation report for question ${question.id || ''}`
                                      : 'Not validated'
                                }
                                disabled={!validated || currentlyValidating}
                                onClick={() => {
                                  if (validatedRun) {
                                    setSelectedQuestions([]);
                                    handleOpenValidationDetails(question, validatedRun);
                                  }
                                }}
                              >
                                {currentlyValidating
                                  ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                  : validated
                                    ? <ShieldCheck className="h-4 w-4" />
                                    : <ShieldOff className="h-4 w-4" />
                                }
                              </Button>
                              </span>
                            );
                          })()}
                        </TableCell>

                        {/* Item Metadata — enabled when the question has metadata; opens the
                            details that used to sit at the bottom of the Preview. */}
                        <TableCell className="px-1 text-center">
                          {(() => {
                            const hasMetadata = getMetadataDisplayRows(question.metadata).length > 0;
                            // Spins while metadata is being generated for this row, the
                            // same reading the Valid icon gives during a validation run.
                            const isGeneratingMetadata = metadataGeneratingIds.has(question.id);
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-8 w-8 p-0 ${isGeneratingMetadata
                                  ? 'text-gray-400 cursor-wait'
                                  : hasMetadata
                                    ? 'text-indigo-600 hover:text-indigo-700 cursor-pointer'
                                    : 'text-gray-400 opacity-50 cursor-not-allowed'
                                  }`}
                                title={isGeneratingMetadata
                                  ? "Generating metadata..."
                                  : hasMetadata ? "View item metadata" : "No metadata"}
                                aria-label={isGeneratingMetadata
                                  ? `Generating metadata for question ${question.id || ''}`
                                  : hasMetadata ? `View metadata for question ${question.id || ''}` : 'No metadata'}
                                disabled={!hasMetadata || isGeneratingMetadata}
                                onClick={() => {
                                  if (hasMetadata && !isGeneratingMetadata) {
                                    setSelectedQuestions([]);
                                    setMetadataDetailsQuestion(question);
                                  }
                                }}
                              >
                                {isGeneratingMetadata
                                  ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                  : <Database className="h-4 w-4" />}
                              </Button>
                            );
                          })()}
                        </TableCell>

                        <TableCell className="px-1 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            title="Delete question"
                            aria-label={`Delete question ${question.id || ''}`}
                            onClick={() => { setSelectedQuestions([]); handleDelete(question.id, question.questionrequestid); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        <TableCell className="px-1 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  title="More actions">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setSelectedQuestions([]); handleRateQuestion(question); }}>
                                  {(() => {
                                    const hasRating = question.ratingid === 1 || question.ratingid === 2;
                                    const hasInline = ((question.feedback ?? question.rating_feedback)?.toString().trim()?.length > 0);
                                    let hasCached = false;
                                    try {
                                      const qReq = question.questionrequestid ?? null;
                                      const qId = (question.numericId ?? (isNaN(Number(question.id)) ? null : Number(question.id)) ?? null);
                                      const key = `questionFeedback:${qReq ?? 'null'}:${qId ?? 'null'}`;
                                      const cachedRaw = sessionStorage.getItem(key);
                                      if (cachedRaw) {
                                        const cached = JSON.parse(cachedRaw);
                                        hasCached = !!(cached?.feedback && String(cached.feedback).trim().length > 0);
                                      }
                                    } catch { }
                                    const isFeedback = hasRating && (hasInline || hasCached);
                                    return (
                                      <>
                                        {isFeedback ? (
                                          <Info className="h-4 w-4 mr-2" />
                                        ) : (
                                          <Star className="h-4 w-4 mr-2" />
                                        )}
                                        {isFeedback ? 'Feedback' : 'Rate Question'}
                                      </>
                                    );
                                  })()}
                                </DropdownMenuItem>
                                {featurePreferences.isRewrite === 1 && (
                                  <DropdownMenuItem onClick={() => { setSelectedQuestions([]); handleOpenRefinement(question); }}>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Question Refinement
                                  </DropdownMenuItem>
                                )}
                                {featurePreferences.isValidate === 1 && showBulkValidateState === 1 && (() => {
                                  const isValidated = isQuestionValidated(question);
                                  const isValidatingItem = validatingQuestionIds.has(question.id);
                                  const isValidateDisabled = isValidated || isValidatingItem;
                                  return (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (!isValidateDisabled) {
                                          handleSingleValidateClick(question);
                                        }
                                      }}
                                      disabled={isValidateDisabled}
                                    >
                                      <CheckCircle2 className={`mr-2 h-4 w-4 ${isValidateDisabled ? 'text-gray-400' : 'text-green-500'}`} />
                                      {isValidatingItem ? 'Validating...' : 'Item Validate'}
                                    </DropdownMenuItem>
                                  );
                                })()}
                                {showBulkMetadataState === 1 && (() => {
                                  const isGeneratingMetadata = metadataGeneratingIds.has(question.id);
                                  const hasMetadata = !!(question.metadata && typeof question.metadata === 'object' && Object.keys(question.metadata).length > 0);
                                  const isMetadataDisabled = hasMetadata || isGeneratingMetadata;
                                  return (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (!isMetadataDisabled) {
                                          setSelectedQuestions([]);
                                          handleSingleMetadata(question);
                                        }
                                      }}
                                      disabled={isMetadataDisabled}
                                    >
                                      <Database className={`h-4 w-4 mr-2 ${isMetadataDisabled ? 'text-gray-400' : ''}`} />
                                      {isGeneratingMetadata ? 'Generating...' : 'Item Metadata'}
                                    </DropdownMenuItem>
                                  );
                                })()}
                                {featurePreferences.isSimilarity === 1 && (() => {
                                  const isChecking = similarityRunningIds.has(String(question.id));
                                  return (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        // Keep the menu open while the request runs.
                                        if (isChecking) { e.preventDefault(); return; }
                                        setSelectedQuestions([]);
                                        handleSingleSimilarity(question);
                                      }}
                                      disabled={isChecking}
                                    >
                                      <GitCompare className={`h-4 w-4 mr-2 ${isChecking ? 'text-gray-400' : 'text-purple-600'}`} />
                                      {isChecking ? 'Checking...' : 'Check Similarity'}
                                    </DropdownMenuItem>
                                  );
                                })()}
                                <DropdownMenuSeparator />
                                {/* <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => { setSelectedQuestions([]); handleDelete(question.id, question.questionrequestid); }}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem> */}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    )))}
                </TableBody>
              </Table>

              {!noResults && displayedQuestions.length > 0 && (
                <div className="mt-2 flex flex-col gap-3 border-t border-gray-200 px-2 pt-4 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      Showing{' '}
                      <span className="font-semibold text-gray-900">
                        {questionPageStart + 1}–{Math.min(questionPageStart + questionPageSize, displayedQuestions.length)}
                      </span>{' '}
                      of <span className="font-semibold text-gray-900">{displayedQuestions.length}</span> items
                    </span>
                    <span className="h-4 w-px bg-gray-300" aria-hidden="true" />
                    <span>Rows per page</span>
                    <Select
                      value={String(questionPageSize)}
                      onValueChange={(val) => {
                        setQuestionPageSize(Number(val));
                        setQuestionPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[72px] rounded-full" aria-label="Rows per page">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_PAGE_SIZE_OPTIONS.map(size => (
                          <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { label: 'First page', icon: <ChevronsLeft className="h-4 w-4" />, page: 1, disabled: currentQuestionPage <= 1 },
                      { label: 'Previous page', icon: <ChevronLeft className="h-4 w-4" />, page: currentQuestionPage - 1, disabled: currentQuestionPage <= 1 },
                    ].map(btn => (
                      <button
                        key={btn.label}
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                        disabled={btn.disabled}
                        onClick={() => setQuestionPage(btn.page)}
                        title={btn.label}
                        aria-label={btn.label}
                      >
                        {btn.icon}
                      </button>
                    ))}

                    {questionPageNumbers.map(pageNo => (
                      <button
                        key={pageNo}
                        type="button"
                        className={`flex h-8 min-w-[2rem] items-center justify-center rounded-full px-2 text-sm font-medium ${pageNo === currentQuestionPage
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        onClick={() => setQuestionPage(pageNo)}
                        aria-label={`Page ${pageNo}`}
                        aria-current={pageNo === currentQuestionPage ? 'page' : undefined}
                      >
                        {pageNo}
                      </button>
                    ))}

                    {[
                      { label: 'Next page', icon: <ChevronRight className="h-4 w-4" />, page: currentQuestionPage + 1, disabled: currentQuestionPage >= questionTotalPages },
                      { label: 'Last page', icon: <ChevronsRight className="h-4 w-4" />, page: questionTotalPages, disabled: currentQuestionPage >= questionTotalPages },
                    ].map(btn => (
                      <button
                        key={btn.label}
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                        disabled={btn.disabled}
                        onClick={() => setQuestionPage(btn.page)}
                        title={btn.label}
                        aria-label={btn.label}
                      >
                        {btn.icon}
                      </button>
                    ))}

                    <span className="mx-2 h-6 w-px bg-gray-300" aria-hidden="true" />
                    <span>Go to</span>
                    <input
                      type="number"
                      min={1}
                      max={questionTotalPages}
                      value={questionGoToPage}
                      onChange={(e) => setQuestionGoToPage(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') goToQuestionPage(); }}
                      className="h-8 w-14 rounded-full border border-gray-300 px-2 text-center text-sm focus:border-blue-500 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label="Go to page"
                    />
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300"
                      onClick={goToQuestionPage}
                      title="Go to page"
                      aria-label="Go to page"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
      <BackToTop loading={loading} />
      <QuestionPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} question={previewQuestion} />
      <FlashcardModal open={flashcardOpen} onClose={() => setFlashcardOpen(false)} questions={selectedQuestions.length > 0 ? questions.filter(q => selectedQuestions.includes(q.id)) : questions} />

      {/* Edit Question Modal */}
      <EditQuestionModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        question={editQuestion}
        featurePreferences={featurePreferences}
        validationErrors={validationErrors}
        onCorrectAnswerChange={() => { }}
        onSave={async (updatedQuestion) => {
          // Construct payload expected by backend
          try {
            // Prefer the parent editQuestion (source used to open modal) for stable ids
            const source = editQuestion || updatedQuestion;
            const qObj = (updatedQuestion && updatedQuestion[2]) || (source && source[2]) || updatedQuestion || source || {};

            // Derive questionid and questionrequestid robustly.
            //
            // The row's `id` is the GUID string (IG_..._ID9940), so Number() on it is
            // NaN — the numeric database id lives in `numericId`. Reading `id` first
            // meant the chain fell through to a hardcoded `questionid = 1`, so the
            // update was applied to question 1 and this question never changed.
            // `numericId` is now looked for on both objects before anything else, and
            // a question with no numeric id fails loudly instead of writing elsewhere.
            const toPositiveId = (value: any): number | null => {
              if (value === null || value === undefined || value === '') return null;
              const n = Number(value);
              return Number.isFinite(n) && n > 0 ? n : null;
            };

            const idCandidates = [
              source?.numericId, qObj?.numericId,
              source?.numericID, qObj?.numericID,
              source?.numericid, qObj?.numericid,
              source?.questionid, qObj?.questionid,
              source?.[0], qObj?.[0],
              source?.id, qObj?.id,
            ];
            const questionid = idCandidates.map(toPositiveId).find((v) => v !== null) ?? null;

            const questionrequestidRaw = source && (source[1] ?? source.questionrequestid ?? null);
            const questionrequestid = questionrequestidRaw === null || questionrequestidRaw === undefined ? null : Number(questionrequestidRaw);

            if (questionid === null) {
              console.error('Could not determine the numeric question id for this update.', { source, qObj });
              setShowErrorDialog(true);
              return;
            }

            // Fields the edit dialog can change have to be copied across explicitly —
            // the `...qObj` spread only carries the ORIGINAL values, so passages,
            // matrix rows/columns, the extra images and the image origin were all
            // silently dropped on save.
            const pick = (key: string, fallback: any = undefined) =>
              updatedQuestion?.[key] !== undefined && updatedQuestion?.[key] !== null
                ? updatedQuestion[key]
                : (qObj?.[key] !== undefined ? qObj[key] : fallback);

            const questionxml = {
              ...qObj,
              QuestionStatement: updatedQuestion.label || updatedQuestion.QuestionStatement || qObj.label || qObj.QuestionStatement || qObj.question || '',
              label: updatedQuestion.label || qObj.label || updatedQuestion.QuestionStatement || qObj.QuestionStatement || qObj.question || '',
              CorrectAnswer: updatedQuestion.CorrectAnswer || qObj.CorrectAnswer || '',
              values: updatedQuestion.values || qObj.values || [],
              generatedImageUrl: updatedQuestion.generatedImageUrl || qObj.generatedImageUrl || '',
              // Full image set + origin (0 = AI generated, 1 = manually added)
              generatedImages: pick('generatedImages', []),
              generatedimagetype: toGeneratedImageType(pick('generatedimagetype', 0)),
              // Per-option images (Multiple Choice / Multiple Response)
              optionImages: pick('optionImages', []),
              // Passage tabs and the stem that goes with them
              Tabs: pick('Tabs', qObj?.Tabs ?? null),
              tabs: pick('tabs', qObj?.tabs ?? null),
              PartPrompt: pick('PartPrompt', ''),
              // Matrix / table content
              rows: pick('rows', qObj?.rows),
              columns: pick('columns', qObj?.columns),
              Feedbacks: pick('Feedbacks', qObj?.Feedbacks),
              TableAnalysis: pick('TableAnalysis', qObj?.TableAnalysis ?? null),
              KeyPoints: pick('KeyPoints', qObj?.KeyPoints),
              DropdownOptions: pick('DropdownOptions', qObj?.DropdownOptions),
              FeedbackOptionA: updatedQuestion.FeedbackOptionA || qObj.FeedbackOptionA || '',
              FeedbackOptionB: updatedQuestion.FeedbackOptionB || qObj.FeedbackOptionB || '',
              FeedbackOptionC: updatedQuestion.FeedbackOptionC || qObj.FeedbackOptionC || '',
              FeedbackOptionD: updatedQuestion.FeedbackOptionD || qObj.FeedbackOptionD || ''
            };

            // keypoints: for Multiple Choice backend expects null when none
            const rawKeyPoints = (updatedQuestion.KeyPoints || updatedQuestion.keyPoints || qObj.KeyPoints || qObj.keyPoints) || null;
            const keypoints = Array.isArray(rawKeyPoints) ? (rawKeyPoints.length > 0 ? rawKeyPoints : null) : (rawKeyPoints ? rawKeyPoints : null);

            const payload: any = {
              questionid: questionid,
              questionrequestid: questionrequestid,
              questionxml: questionxml,
              questiontype: updatedQuestion.type || qObj.type || updatedQuestion[5] || 'Multiple Choice',
              usercode: sessionStorage.getItem('userCode') || sessionStorage.getItem('usercode') || '',
              keypoints: keypoints,
            };

            // Call API
            const res = await updateQuestion(payload);

            // See the note on the other save path: the previous validation result no
            // longer matches the question, so remove it before refreshing the list.
            await clearValidationForEditedQuestion({
              ...qObj,
              ...updatedQuestion,
              id: updatedQuestion?.id ?? qObj?.id,
              numericId: updatedQuestion?.numericId ?? qObj?.numericId ?? questionid,
              questionrequestid,
            });

            // Backend may respond with success object; refresh list
            await fetchData();

            // Reset dropdowns after successful save
            setSelectedLO("0");
            setSelectedChapter("0");
            setSelectedSourceType("0");
            setSelectedTaxonomy("0");
            setSelectedCreativityLevel("0");
            setSelectedQuestionType("0");
            // Close the modal after resetting dropdowns
            setEditOpen(false);

            // Add question ID to saved questions set
            const questionId = questionid?.toString();
            if (questionId) {
              setSavedQuestions(prev => new Set([...prev, questionId]));
            }
            // Clear editQuestion to ensure fresh data on next edit
            setEditQuestion(null);
            setEditOpen(false);
            // See the note on the other save path: set the message every time.
            setSuccessMessage("Question updated successfully.");
            setShowSuccessDialog(true);
          } catch (err) {
            console.error('Failed to update question:', err);
            setShowErrorDialog(true);
          }
        }}
      />

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Success
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {successMessage}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSuccessDialog(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Metadata Progress Dialog — mirrors the validation one below. */}
      {/* Closable while it runs: generation carries on in the background and the row's
          Meta icon keeps spinning until it finishes. */}
      <Dialog open={showMetadataProgressDialog} onOpenChange={setShowMetadataProgressDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <Database className="h-5 w-5" />
              Metadata Status
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center justify-center space-y-6">
            <div className="w-full flex flex-col items-center space-y-4">
              <p className="text-base text-gray-700 font-medium">
                {metadataStatusStr === "Completed" ? "Metadata generation is Completed!" :
                  metadataStatusStr === "Failed" ? "Metadata generation Failed" :
                    "Metadata generation is in progress..."}
              </p>

              <div className="relative w-36 h-36 flex items-center justify-center my-4">
                {metadataStatusStr === "Completed" ? (
                  <Check className="w-20 h-20 text-indigo-500" strokeWidth={3} />
                ) : metadataStatusStr === "Failed" ? (
                  <X className="w-20 h-20 text-red-500" strokeWidth={3} />
                ) : (
                  <Loader2 className="w-20 h-20 animate-spin text-indigo-600" />
                )}
              </div>

              <p className="text-sm text-gray-600 text-center">
                {metadataStatusStr === "Completed"
                  ? "Open the Meta icon on the question row to view the metadata."
                  : metadataStatusStr === "Failed"
                    ? "Please try again from the question's 3-dot menu."
                    : ""}
              </p>
            </div>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setShowMetadataProgressDialog(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Similarity Progress Dialog — mirrors the metadata one above. */}
      {/* Closable while it runs: the check carries on in the background and the row's
          Check Similarity entry keeps showing "Checking..." until it finishes. */}
      <Dialog open={showSimilarityProgressDialog} onOpenChange={setShowSimilarityProgressDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-600">
              <GitCompare className="h-5 w-5" />
              Similarity Status
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center justify-center space-y-6">
            <div className="w-full flex flex-col items-center space-y-4">
              <p className="text-base text-gray-700 font-medium">
                {similarityStatusStr === "Completed" ? "Similarity check is Completed!" :
                  similarityStatusStr === "Empty" ? "No similar questions found" :
                    similarityStatusStr === "Failed" ? "Similarity check Failed" :
                      "Checking similarity for this question..."}
              </p>

              <div className="relative w-36 h-36 flex items-center justify-center my-4">
                {similarityStatusStr === "Completed" ? (
                  <Check className="w-20 h-20 text-purple-500" strokeWidth={3} />
                ) : similarityStatusStr === "Empty" ? (
                  <Info className="w-20 h-20 text-amber-500" strokeWidth={2} />
                ) : similarityStatusStr === "Failed" ? (
                  <X className="w-20 h-20 text-red-500" strokeWidth={3} />
                ) : (
                  <Loader2 className="w-20 h-20 animate-spin text-purple-600" />
                )}
              </div>

              <p className="text-sm text-gray-600 text-center">
                {similarityStatusStr === "Completed"
                  ? "You can view the result by clicking the Similarity icon on the question row."
                  : similarityStatusStr === "Empty"
                    ? "This question has nothing similar enough in the book, so there is nothing to view."
                    : similarityStatusStr === "Failed"
                      ? (similarityErrorStr || "Please try again from the question's 3-dot menu.")
                      : ""}
              </p>
            </div>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setShowSimilarityProgressDialog(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Progress Dialog */}
      <Dialog
        open={showValidationProgressDialog}
        onOpenChange={(open) => {
          if (!open && validationStatusStr !== "Completed" && validationStatusStr !== "Failed") return;
          setShowValidationProgressDialog(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Brain className="h-5 w-5" />
              Validation Status
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center justify-center space-y-6">
            <div className="w-full flex flex-col items-center space-y-4">
              <p className="text-base text-gray-700 font-medium">
                {validationStatusStr === "Completed" ? "Validation is Completed!" :
                  validationStatusStr === "Failed" ? "Validation Failed" :
                    "Validation is in progress..."}
              </p>

              {/* Circular Progress Indicator */}
              <div className="relative w-36 h-36 flex items-center justify-center my-4">
                {validationStatusStr === "Completed" ? (
                  <div className="flex flex-col items-center justify-center">
                    <Check className="w-20 h-20 text-blue-500" strokeWidth={3} />
                  </div>
                ) : validationStatusStr === "Failed" ? (
                  <div className="flex flex-col items-center justify-center">
                    <X className="w-20 h-20 text-red-500" strokeWidth={3} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <Loader2 className="w-20 h-20 animate-spin text-blue-600" />
                  </div>
                )}
              </div>
            </div>

            {validationRunDetails && validationStatusStr === "Completed" && (() => {
              // run-status reports three outcomes — pass_count, review_count and
              // fail_count. Only "Passed" was shown, so an item that came back for
              // review read as 0 passed with nothing explaining where it went.
              const count = (value: any) => {
                const n = Number(value);
                return Number.isFinite(n) ? n : 0;
              };
              const cells = [
                { label: 'Total Items', value: count(validationRunDetails.total_items), color: '' },
                { label: 'Processed', value: count(validationRunDetails.processed), color: '' },
                { label: 'Avg Score', value: `${count(validationRunDetails.avg_score)}%`, color: '' },
                { label: 'Passed', value: count(validationRunDetails.pass_count), color: 'text-green-600' },
                { label: 'Review', value: count(validationRunDetails.review_count), color: 'text-amber-600' },
                { label: 'Failed', value: count(validationRunDetails.fail_count), color: 'text-red-600' },
              ];
              return (
                <div className="w-full bg-gray-50 rounded-md p-4 text-sm text-gray-700 grid grid-cols-3 gap-x-2 gap-y-4">
                  {cells.map((cell) => (
                    <div key={cell.label} className="flex flex-col items-center justify-center text-center px-1">
                      <span className="text-gray-500 text-[10px] sm:text-xs uppercase tracking-wider mb-1">{cell.label}</span>
                      <span className={`font-semibold text-lg sm:text-xl ${cell.color}`}>{cell.value}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setShowValidationProgressDialog(false)}
              variant="outline"
              className="w-full sm:w-auto"
              disabled={validationStatusStr !== "Completed" && validationStatusStr !== "Failed"}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Error Dialog */}
      <Dialog open={validationErrorDialogOpen} onOpenChange={setValidationErrorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Already Validated
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {validationErrorMessage}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setValidationErrorDialogOpen(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!metadataDetailsQuestion}
        onOpenChange={(open) => { if (!open) setMetadataDetailsQuestion(null); }}
      >
        <DialogContent className="w-[96vw] max-w-3xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Database className="h-5 w-5" />
              Metadata Details
            </DialogTitle>
            <DialogDescription className="break-words">
              {metadataDetailsQuestion
                ? `Item metadata for ${String(metadataDetailsQuestion.questionidentifier || metadataDetailsQuestion.id || '')}.`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                {getMetadataDisplayRows(metadataDetailsQuestion?.metadata).map((item, index) => (
                  <div key={`${item.key}-${index}`} className="break-words">
                    <strong className="text-gray-700 block mb-1">{item.key}:</strong>
                    <span className="text-gray-900 leading-relaxed font-medium">
                      {item.value || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button onClick={() => setMetadataDetailsQuestion(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={validationDetailsOpen} onOpenChange={closeValidationDetailsDialog}>
        <DialogContent className="w-[96vw] max-w-7xl h-[92vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <ListChecks className="h-5 w-5" />
              Item Validation Details
            </DialogTitle>
            <DialogDescription>
              {validationDetailsItemCode
                ? `Showing Item Validation report for ${validationDetailsItemCode}.`
                : 'Opening the selected Item Validation report.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 bg-slate-50">
            {validationDetailsError ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className={`max-w-md rounded-lg border p-4 text-sm ${validationDetailsError.includes('Analysis is in progress')
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-red-200 bg-red-50 text-red-700'
                  }`}>
                  {validationDetailsError}
                </div>
              </div>
            ) : validationDetailsIframeUrl ? (
              <div className="relative h-full w-full">
                {validationDetailsLoading && (
                  <div className="absolute inset-0 z-10 flex h-full w-full items-center justify-center bg-white">
                    <div className="flex flex-col items-center gap-2 text-indigo-600">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="text-sm font-medium">Loading details...</span>
                    </div>
                  </div>
                )}
                <iframe
                  title="Item Validation Details"
                  src={validationDetailsIframeUrl}
                  className="h-full w-full border-0 bg-white"
                  allow="clipboard-write; fullscreen; display-capture;"
                  onLoad={() => {
                    // Delay removing the loader to cover the client-side redirect in the iframe
                    setTimeout(() => setValidationDetailsLoading(false), 1500);
                  }}
                />
              </div>
            ) : validationDetailsLoading ? (
              <div className="flex h-full items-center justify-center gap-3 text-sm text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading Item Validation details...
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button onClick={() => closeValidationDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog for validation */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Validation started
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {successCount > 0
                ? `Validation started for ${successCount} question(s)`
                : 'Validation started for selected question(s)'}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setSuccessDialogOpen(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <X className="h-5 w-5" />
              Error
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Failed to save changes. Please try again.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowErrorDialog(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Confirm Delete
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this question? This action cannot be undone.
              {!isCheckingDeleteValidation && isDeletingQuestionValidated ? (
                <>
                  <br />
                  <span>
                    This question is already validated, deleting this question will also get deleted on analysis run as well in item bank.
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteQuestionData(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirm Dialog */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Confirm Delete
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete the selected questions? This action cannot be undone.
              {!isCheckingBulkDeleteValidation && isBulkDeletingQuestionValidated ? (
                <>
                  <br />
                  <br />
                  <span>
                    Some of these questions are already validated, deleting them will also get deleted on analysis run as well in item bank.
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Validate Confirm Dialog */}
      <Dialog open={showSingleValidateConfirmDialog} onOpenChange={setShowSingleValidateConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <CheckCircle2 className="h-5 w-5" />
              Confirm Validation
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-base text-gray-700 font-medium">
              The question selected has been chosen for validation. Do you really want to validate this question?
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button variant="outline" onClick={() => setShowSingleValidateConfirmDialog(false)}>
              No
            </Button>
            <Button
              onClick={() => {
                setShowSingleValidateConfirmDialog(false);
                if (singleQuestionToValidate) {
                  handleValidateQuestions([singleQuestionToValidate], false);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Validate Confirm Dialog */}
      <Dialog open={showBulkValidateConfirmDialog} onOpenChange={setShowBulkValidateConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <ListChecks className="h-5 w-5" />
              Confirm Bulk Validate
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-base text-gray-700 font-medium">
              Do you want to validate all questions?
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button variant="outline" onClick={() => {
              setShowBulkValidateConfirmDialog(false);
              setShowSelectPromptDialog(true);
            }}>
              No
            </Button>
            <Button
              onClick={() => {
                setShowBulkValidateConfirmDialog(false);
                const allQuestionIds = questions.map(q => q.id);
                handleValidateQuestions(allQuestionIds, true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Check className="h-4 w-4 mr-2" />
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Validate Start Confirmation */}
      <Dialog open={showBulkValidateStartDialog} onOpenChange={setShowBulkValidateStartDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <CheckCircle2 className="h-5 w-5" />
              Validation Started
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-base text-gray-700 font-medium">
              Validation has started and will be completed within a few minutes.
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowBulkValidateStartDialog(false)} className="bg-blue-600 hover:bg-blue-700 text-white">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Questions Prompt Dialog */}
      <Dialog open={showSelectPromptDialog} onOpenChange={setShowSelectPromptDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Info className="h-5 w-5" />
              Notice
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-base text-gray-700 font-medium">
              Please select the questions you need to validate
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowSelectPromptDialog(false)} className="bg-amber-600 hover:bg-amber-700">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Metadata Confirm Dialog */}
      <Dialog open={showBulkMetadataConfirmDialog} onOpenChange={setShowBulkMetadataConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Database className="h-5 w-5" />
              Confirm Bulk Metadata
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-base text-gray-700 font-medium">
              Do you want metadata generation for all questions?
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button variant="outline" onClick={() => {
              setShowBulkMetadataConfirmDialog(false);
              setShowSelectMetadataPromptDialog(true);
            }}>
              No
            </Button>
            <Button
              onClick={() => {
                setShowBulkMetadataConfirmDialog(false);
                const allQuestionIds = questions.map(q => q.id);
                executeBulkMetadata(allQuestionIds);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Check className="h-4 w-4 mr-2" />
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Metadata Questions Prompt Dialog */}
      <Dialog open={showSelectMetadataPromptDialog} onOpenChange={setShowSelectMetadataPromptDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Info className="h-5 w-5" />
              Notice
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-base text-gray-700 font-medium">
              Please select the questions you need to generate metadata
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowSelectMetadataPromptDialog(false)} className="bg-amber-600 hover:bg-amber-700">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Result Dialog */}
      <Dialog open={showBulkDeleteResult} onOpenChange={setShowBulkDeleteResult}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${bulkDeleteCount > 0 ? "text-green-600" : "text-yellow-600"}`}>
              <CheckCircle2 className="h-5 w-5" />
              {bulkDeleteCount > 0
                ? "Bulk Delete Success"
                : "No Questions Selected"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {bulkDeleteCount > 0
                ? `✅ Deleted ${bulkDeleteCount} question(s)`
                : "No questions selected for deletion."}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowBulkDeleteResult(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refinementDialogOpen} onOpenChange={setRefinementDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col px-4">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <DialogTitle className="text-xl font-semibold">Question Refinement</DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pt-2 px-4 pb-8">
            <p className="text-sm text-muted-foreground">
              Choose the target question type and specify how many variations you'd like to generate.
            </p>

            {/* Question Refinement Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Question Refinement Type</label>
              <Select value={refinementType} onValueChange={setRefinementType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="Rewrite"
                    disabled={(() => {
                      const quesOrigin = selectedQuestionForRefinement?.quesOrigin;
                      // If originallanguage is null or English, allow Rewrite, else disable for Non-English
                      return quesOrigin && quesOrigin !== 'English' && quesOrigin !== 'en';
                    })()}
                  >
                    Regenerate
                  </SelectItem>
                  <SelectItem
                    value="Generate Similar"
                    disabled={(() => {
                      const quesOrigin = selectedQuestionForRefinement?.quesOrigin;
                      // If originallanguage is null or English, allow Generate Similar, else disable for Non-English
                      return quesOrigin && quesOrigin !== 'English' && quesOrigin !== 'en';
                    })()}
                  >
                    Rewrite
                  </SelectItem>
                  <SelectItem value="Language Conversion">Language Conversion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {refinementType !== 'Generate Similar' && refinementType !== 'Language Conversion' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Question Type</label>
                <Select
                  value={refinementQuestionType}
                  onValueChange={setRefinementQuestionType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select question type" />
                  </SelectTrigger>
                  <SelectContent>
                    {questionTypes?.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {refinementType !== 'Language Conversion' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Number of Questions</label>
                <Select value={refinementNumQuestions} onValueChange={setRefinementNumQuestions}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NumberOfQuestions?.map((NumberOfQuestions) => (
                      <SelectItem key={NumberOfQuestions} value={NumberOfQuestions}>
                        {NumberOfQuestions}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {refinementType !== 'Generate Similar' && refinementType !== 'Language Conversion' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Taxonomy</label>
                <Select value={refinementTaxonomy} onValueChange={setRefinementTaxonomy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taxonomyList?.map((taxonomyName) => (
                      <SelectItem key={taxonomyName} value={taxonomyName}>
                        {taxonomyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {refinementType !== 'Generate Similar' && refinementType !== 'Language Conversion' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Creativity Level</label>
                <Select value={refinementCreativity} onValueChange={setRefinementCreativity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CreativityLevel?.map((creativitylevel) => (
                      <SelectItem key={creativitylevel} value={creativitylevel}>
                        {creativitylevel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {refinementType !== 'Generate Similar' && refinementType !== 'Language Conversion' && refinementQuestionType === 'Multiple Response' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Number of Response Options</label>
                <Select value={refinementNumOptions} onValueChange={setRefinementNumOptions}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="6">6</SelectItem>
                    <SelectItem value="7">7</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                    <SelectItem value="9">9</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {refinementType !== 'Generate Similar' && refinementType !== 'Language Conversion' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Source Type</label>
                <Select value={refinementSourceType} onValueChange={setRefinementSourceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Book Based">Book Based</SelectItem>
                    <SelectItem value="LLM">LLM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {refinementType === 'Language Conversion' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Language</label>
                <Select value={refinementLanguage} onValueChange={setRefinementLanguage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableLanguages().map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                    {getAvailableLanguages().length === 0 && (
                      <SelectItem value="en" disabled>
                        English
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

          </div>

          {/* Fixed Footer */}
          <DialogFooter className="flex-shrink-0 border-t pt-4">
            {(() => {
              // Compute disabled state for no-op language conversion (e.g., English -> English)
              const srcLangRaw = selectedQuestionForRefinement?.language || selectedQuestionForRefinement?.Language || selectedQuestionForRefinement?.originallanguage;
              const srcLang = normalizeLanguageCode(srcLangRaw);
              const tgtLang = normalizeLanguageCode(refinementLanguage) || 'en';
              const isNoOpLanguageConversion = refinementType === 'Language Conversion' && !!srcLang && srcLang === tgtLang;
              return (
                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => { setRefinementDialogOpen(false); }}
                    className="px-6">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRefinementSubmit}
                    className="px-6 bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={(refinementType === 'Rewrite' && areParametersSameAsOriginal()) || isNoOpLanguageConversion}
                  >
                    {refinementType === 'Generate Similar' ? 'Rewrite' : refinementType === 'Language Conversion' ? 'Convert' : 'Regenerate'}
                  </Button>
                </div>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refinement Success Dialog */}
      <Dialog open={showRefinementSuccessDialog} onOpenChange={setShowRefinementSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Question Refinement Success
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {refinementSuccessMessage}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowRefinementSuccessDialog(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refinement Error Dialog */}
      <Dialog open={showRefinementErrorDialog} onOpenChange={setShowRefinementErrorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <X className="h-5 w-5" />
              Question Refinement Error
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {refinementErrorMessage}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowRefinementErrorDialog(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Image Regeneration Modal */}
      <Dialog open={isImageInstructionModalOpen} onOpenChange={setIsImageInstructionModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Regenerate Image</DialogTitle>
            <DialogDescription>
              Provide specific instructions on how to regenerate the image for this question.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="repository-instructions" className="text-right">
                Additional Instructions
              </Label>
              <Textarea
                id="repository-instructions"
                value={imageInstructionText}
                onChange={(e) => setImageInstructionText(e.target.value)}
                placeholder="e.g., Make it a bar chart instead of a pie chart, remove the labels..."
                className="col-span-3 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImageInstructionModalOpen(false)}>Cancel</Button>
            <Button onClick={handleRegenerateImageSubmit} disabled={isRegeneratingImage || !imageInstructionText.trim()}>
              {isRegeneratingImage ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Generating...
                </>
              ) : 'Regenerate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Select Modal */}
      <Dialog open={isImageSelectModalOpen} onOpenChange={setIsImageSelectModalOpen}>
        <DialogContent className="sm:max-w-2xl w-[95vw] sm:w-full max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-3 sm:p-4 gap-2">
          <DialogHeader>
            <DialogTitle>Select Image from Repository</DialogTitle>
            <DialogDescription>
              Choose an image from Repository
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="flex flex-col gap-4">
              <div className="flex gap-4 items-center justify-between">
                <div className="flex gap-4 items-center">
                  <Label>Destination:</Label>
                  <Select value={imageSelectDestination} onValueChange={(val: any) => setImageSelectDestination(val)}>
                    <SelectTrigger className="w-[200px] focus:ring-offset-0 focus:ring-inset">
                      <SelectValue placeholder="Select Destination" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Images</SelectItem>
                      <SelectItem value="specific">Question Specific Folder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <input
                    type="file"
                    ref={localFileInputRef}
                    accept=".png, .jpg, .jpeg, image/png, image/jpeg"
                    onChange={handleLocalImageBrowse}
                    className="hidden"
                    multiple
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => localFileInputRef.current?.click()}
                    className="flex items-center gap-2 text-xs border-gray-300 hover:bg-gray-50"
                  >
                    <Upload className="h-4 w-4 text-blue-600" />
                    Browse Local Image
                  </Button>
                </div>
              </div>
              {imageSelectDestination === "specific" && (
                <div className="text-xs text-gray-700 bg-blue-50 p-3 rounded-lg border border-blue-100 flex flex-col gap-2">
                  <div>
                    <Label className="mb-1 block font-semibold">Book</Label>
                    <Input readOnly value={imageSelectTarget?.bookname || imageSelectTarget?.BookName || sessionStorage.getItem('bookTitle') || 'Book'} className="bg-white h-8 text-xs cursor-default focus-visible:ring-0" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1 block font-semibold">Chapter</Label>
                      <Select value={modalSelectedChapter} onValueChange={setModalSelectedChapter}>
                        <SelectTrigger className="h-8 bg-white text-xs focus:ring-offset-0 focus:ring-inset">
                          <SelectValue placeholder="Select Chapter" />
                        </SelectTrigger>
                        <SelectContent>
                          {modalChapters.map((c: any) => (
                            <SelectItem key={String(chapterKeyOf(c))} value={String(chapterKeyOf(c))}>
                              {chapterNameOf(c)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-1 block font-semibold">Learning Objective (LO)</Label>
                      <Select value={modalSelectedLO} onValueChange={setModalSelectedLO} disabled={modalSelectedChapter === "all"}>
                        <SelectTrigger className="h-8 bg-white text-xs focus:ring-offset-0 focus:ring-inset">
                          <SelectValue placeholder="All LOs" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All LOs</SelectItem>
                          {modalLOs.map((l: any) => (
                            <SelectItem key={String(loKeyOf(l))} value={String(loKeyOf(l))}>
                              {loNameOf(l)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Select Image</Label>
                <div className="h-[clamp(120px,24vh,240px)] overflow-y-auto border rounded-md p-2 bg-gray-50">
                  {isLoadingRepoImages ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : repositoryImages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      No images found in this folder.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {repositoryImages.map((img: any, idx: number) => {
                        const url = img.backend_download_url || img.url;
                        const isSelected = selectedRepoImages.includes(url);
                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedRepoImages(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url])}
                            className={`relative cursor-pointer border-2 rounded overflow-hidden aspect-square ${isSelected ? 'border-blue-600 ring-2 ring-blue-300' : 'border-transparent hover:border-blue-300'}`}
                          >
                            <img src={url} alt={img.filename || 'repo image'} className="w-full h-full object-contain bg-white" title={img.filename} loading="lazy" />
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="absolute top-1 left-1 w-4 h-4 accent-blue-600 pointer-events-none"
                            />
                            {isSelected && (
                              <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shadow">
                                {selectedRepoImages.indexOf(url) + 1}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {imageUploadError && (
            <p role="alert" className="text-sm font-medium text-red-600 px-1">{imageUploadError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImageSelectModalOpen(false)}>Cancel</Button>
            <Button onClick={handleImageSelectSubmit} disabled={selectedRepoImages.length === 0}>
              {selectedRepoImages.length > 1 ? `Apply ${selectedRepoImages.length} Images` : 'Apply Selected Image'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image-only viewer for the "View question image" action */}
      <Dialog open={imageViewerOpen} onOpenChange={setImageViewerOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {imageViewerImages.length > 1 ? `Question Images (${imageViewerImages.length})` : 'Question Image'}
            </DialogTitle>
            {imageViewerTitle ? (
              <DialogDescription>{imageViewerTitle}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto flex flex-wrap gap-4 justify-center py-2">
            {imageViewerImages.length === 0 ? (
              <p className="text-sm text-gray-500 py-8">No image attached to this question.</p>
            ) : (
              imageViewerImages.map((src, i) => (
                <RepoImage
                  key={i}
                  src={src}
                  alt={`Question illustration ${i + 1}`}
                  className="max-w-full h-auto rounded-lg border border-gray-300 shadow-sm"
                  style={{ maxHeight: '60vh' }}
                />
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageViewerOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AIGQuestionRepository;

// Master checkbox extracted to a proper component to respect Hooks rules
function SelectAllCheckbox({ selectedCount, totalCount, onChange }: { selectedCount: number; totalCount: number; onChange: (checked: boolean) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    }
  }, [selectedCount, totalCount]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="rounded border-gray-300"
      checked={totalCount > 0 && selectedCount === totalCount}
      onChange={(e) => onChange(e.currentTarget.checked)}
      aria-label="Select all questions"
    />
  );
}

// QuestionPreviewModal component - matches QuestionResults.tsx exactly
function QuestionPreviewModal({ open, onClose, question }: { open: boolean; onClose: () => void; question: any }) {
  const [activeTab, setActiveTab] = useState("question");
  // Read aloud inside the preview dialog.
  const [isPreviewSpeaking, setIsPreviewSpeaking] = useState(false);

  // Never keep reading after the dialog closes or the page is left.
  useEffect(() => {
    if (!open) {
      cancelSpeech();
      setIsPreviewSpeaking(false);
    }
  }, [open]);
  useEffect(() => installSpeechAutoStop(() => setIsPreviewSpeaking(false)), []);
  const [previewTableSort, setPreviewTableSort] = useState<string>('S.no');
  const [activePassageTab, setActivePassageTab] = useState(0);
  const [previewDropdownSelection, setPreviewDropdownSelection] = useState('');

  // Image regeneration (Additional Instructions popup) â€” local to this modal
  const [isImageInstructionModalOpen, setIsImageInstructionModalOpen] = useState(false);
  const [imageInstructionText, setImageInstructionText] = useState("");
  const [imageRegenerateTarget, setImageRegenerateTarget] = useState<any>(null);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [regeneratedImageUrl, setRegeneratedImageUrl] = useState<string>("");
  const [regeneratedImages, setRegeneratedImages] = useState<string[]>([]);
  // Per-option images from the last regeneration here; until then the saved ones show.
  const [regeneratedOptionImages, setRegeneratedOptionImages] = useState<OptionImage[] | null>(null);
  const [imagesEdited, setImagesEdited] = useState(false);
  // 1 = manually uploaded / picked from the repository, 0 = AI generated. Without
  // this the "AI Generated" badge stayed on manually added images.
  const [stagedImageType, setStagedImageType] = useState<number | null>(null);

  const [isImageSelectModalOpen, setIsImageSelectModalOpen] = useState(false);
  const [imageSelectTarget, setImageSelectTarget] = useState<any>(null);
  const [imageSelectDestination, setImageSelectDestination] = useState<"general" | "specific">("general");
  const [repositoryImages, setRepositoryImages] = useState<any[]>([]);
  const [isLoadingRepoImages, setIsLoadingRepoImages] = useState(false);
  const [selectedRepoImage, setSelectedRepoImage] = useState<string>("");
  const [selectedRepoImages, setSelectedRepoImages] = useState<string[]>([]);
  // Shown in red above the "Apply Selected Image" button instead of a browser alert.
  const [imageUploadError, setImageUploadError] = useState<string>("");
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const handleLocalImageBrowse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImageUploadError("");

    const imageFiles = Array.from(files).filter(file =>
      file.type.match(/^image\/(png|jpe?g)$/i) || file.name.match(/\.(png|jpe?g)$/i)
    );

    if (imageFiles.length === 0) {
      setImageUploadError("Please select a valid .png or .jpeg image file.");
      e.target.value = "";
      return;
    }

    // Anything over 5 MB is rejected up front, with the offending file named, rather
    // than being read into memory and failing part-way through the upload.
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const oversizedFiles = imageFiles.filter(file => file.size > MAX_IMAGE_BYTES);
    const validFiles = imageFiles.filter(file => file.size <= MAX_IMAGE_BYTES);

    if (oversizedFiles.length > 0) {
      const tooBig = oversizedFiles
        .map(file => `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`)
        .join(', ');
      setImageUploadError(`Please add an image less than 5 MB. ${tooBig}`);
    }

    // Every selected file was too large — nothing left to upload.
    if (validFiles.length === 0) {
      e.target.value = "";
      return;
    }

    setIsLoadingRepoImages(true);
    // Read the picture's bytes while the File is still in hand. The storage account
    // sends no Access-Control-Allow-Origin header, so once the image is only a blob
    // URL the browser can no longer read it back — which is why manually added
    // images came out as a link instead of a picture in the Word/Excel exports.
    const attachable: string[] = (await Promise.all(
      validFiles.map(file => fileToStorableDataUrl(file).catch(() => ''))
    )).filter(Boolean);
    let uploadedUrls: string[] = [];
    let uploadFailed = false;
    try {
      const { getKbAuthToken } = await import('@/lib/kb-auth');
      const token = await getKbAuthToken();
      const target = imageSelectTarget || question;

      // Upload into the SAME folder the picker is currently listing. Previously
      // the file always went to the book/chapter/LO folder even while "General
      // Images" was selected, so it landed somewhere the grid never showed and
      // the image was lost as soon as the list refreshed.
      let chapterName = "";
      if (modalSelectedChapter && modalSelectedChapter !== "all") {
        const chapterObj = modalChapters.find((c: any) => String(chapterKeyOf(c)) === modalSelectedChapter);
        chapterName = String(chapterObj ? chapterNameOf(chapterObj) : modalSelectedChapter);
      } else if (target?.chaptername || target?.ChapterName || target?.chapter_name || sessionStorage.getItem('selectedChapterName')) {
        chapterName = String(target?.chaptername || target?.ChapterName || target?.chapter_name || sessionStorage.getItem('selectedChapterName'));
      }

      let loName = "";
      if (modalSelectedLO && modalSelectedLO !== "all") {
        const loObj = modalLOs.find((l: any) => String(loKeyOf(l)) === modalSelectedLO);
        loName = String(loObj ? loNameOf(loObj) : modalSelectedLO);
      } else if (target?.learningObjective || target?.learningobjective || target?.lo_name) {
        loName = String(target?.learningObjective || target?.learningobjective || target?.lo_name);
      }

      // Customer / Organisation is the top of the blob hierarchy; with none known the
      // prefix is empty and the path is exactly what it was before.
      const { custCode: imageCustCode, orgCode: imageOrgCode } = resolveImageScope();
      const folderPath = buildImageFolderPath({
        custCode: imageCustCode,
        orgCode: imageOrgCode,
        destination: imageSelectDestination,
        bookName: resolveImageBookName(target),
        chapterName,
        loName,
      });

      const bookId = sessionStorage.getItem('bookid') || sessionStorage.getItem('bookDetailsId') || '2';
      const formData = new FormData();
      formData.append("folder_path", folderPath);
      formData.append("book_id", String(bookId));
      formData.append("auth_token", token);
      // Sent alongside the path so the server can apply the same scoping.
      appendImageScopeFields(formData);
      validFiles.forEach(file => formData.append("files", file));

      const response = await fetch(`${AGENT_GENERATIVE_API_URL}/upload-images`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      uploadedUrls = Array.isArray(data?.urls) && data.urls.length > 0
        ? data.urls
        : (data?.url ? [data.url] : []);

      if (uploadedUrls.length > 0) {
        const newImgObjs = uploadedUrls.map((url, idx) => ({
          backend_download_url: url,
          url: url,
          filename: validFiles[idx]?.name || 'uploaded_image'
        }));

        setRepositoryImages(prev => [...newImgObjs, ...prev]);
        setSelectedRepoImages(prev => Array.from(new Set([...prev, ...uploadedUrls])));
      } else {
        console.error('Upload returned no URL:', data);
        uploadFailed = true;
      }
    } catch (err) {
      console.error("Failed to upload image to blob storage:", err);
      uploadFailed = true;
    } finally {
      // Attach the picture straight away. Leaving the upload merely "selected"
      // meant closing the picker silently discarded it, which reads as the image
      // not saving. Cancelling the edit dialog still discards everything.
      // The embedded bytes are preferred over the blob URL so the Word/Excel
      // exports can render the image (see fileToStorableDataUrl).
      const toAttach = attachable.length ? attachable : uploadedUrls;
      if (toAttach.length) stageImagesForEdit(toAttach);
      if (uploadFailed) {
        alert(attachable.length
          ? 'The image was added to this question, but could not be saved to the shared image repository.'
          : 'The image could not be uploaded. Please try again.');
      }
      setIsLoadingRepoImages(false);
      e.target.value = "";
    }
  };
  const [modalChapters, setModalChapters] = useState<any[]>([]);
  const [modalLOs, setModalLOs] = useState<any[]>([]);
  const [modalSelectedChapter, setModalSelectedChapter] = useState<string>("all");
  const [modalSelectedLO, setModalSelectedLO] = useState<string>("all");
  const [modalChapterLOs, setModalChapterLOs] = useState<any[]>([]);

  // Clear any unsaved image selection when the modal (re)opens, so a previously
  // selected-but-not-saved image does not linger after Cancel.
  useEffect(() => {
    if (open) {
      setRegeneratedImageUrl("");
      setRegeneratedImages([]);
      setImagesEdited(false);
      setSelectedRepoImage("");
      setSelectedRepoImages([]);
    }
  }, [open]);

  // Fetch this book's chapters + LOs (get-chapter-lo-details) when the specific folder is chosen
  useEffect(() => {
    if (isImageSelectModalOpen && imageSelectDestination === "specific") {
      loadBookChapterLOs().then(list => {
        const chaptersList = uniqueByKey(list, chapterKeyOf);
        setModalChapterLOs(list);
        setModalChapters(chaptersList);
        setModalSelectedChapter(prev => {
          if (prev && prev !== 'all' && chaptersList.some((c: any) => String(chapterKeyOf(c)) === prev)) {
            return prev;
          }
          const resolved = resolveModalChapterKey(imageSelectTarget);
          if (resolved && resolved !== 'all' && chaptersList.some((c: any) => String(chapterKeyOf(c)) === resolved)) {
            return resolved;
          }
          if (chaptersList.length > 0) {
            return String(chapterKeyOf(chaptersList[0]));
          }
          return '';
        });
      }).catch(() => { setModalChapterLOs([]); setModalChapters([]); });
    }
  }, [isImageSelectModalOpen, imageSelectDestination]);

  // Filter LOs for the selected chapter (only that book/chapter's LOs)
  useEffect(() => {
    if (modalSelectedChapter && modalSelectedChapter !== "all") {
      const filtered = modalChapterLOs.filter((i: any) => String(chapterKeyOf(i)) === modalSelectedChapter);
      setModalLOs(uniqueByKey(filtered, loKeyOf));
    } else {
      setModalLOs([]);
    }
  }, [modalSelectedChapter, modalChapterLOs]);

  const fetchRepositoryImages = async (destination: "general" | "specific", target: any) => {
    setIsLoadingRepoImages(true);
    try {
      const { getKbAuthToken } = await import('@/lib/kb-auth');
      const token = await getKbAuthToken();
      // Built with the same helper the upload uses, so the folder being listed and
      // the folder written to can never disagree.
      const listChapterObj = modalSelectedChapter !== "all"
        ? modalChapters.find(c => String(chapterKeyOf(c)) === modalSelectedChapter)
        : null;
      const listLoObj = (modalSelectedChapter !== "all" && modalSelectedLO !== "all")
        ? modalLOs.find(l => String(loKeyOf(l)) === modalSelectedLO)
        : null;

      // Customer / Organisation is the top of the blob hierarchy; with none known the
      // prefix is empty and the path is exactly what it was before.
      const { custCode: imageCustCode, orgCode: imageOrgCode } = resolveImageScope();
      const folderPath = buildImageFolderPath({
        custCode: imageCustCode,
        orgCode: imageOrgCode,
        destination,
        bookName: resolveImageBookName(target),
        chapterName: modalSelectedChapter !== "all"
          ? String(listChapterObj ? chapterNameOf(listChapterObj) : modalSelectedChapter)
          : '',
        loName: listLoObj ? String(loNameOf(listLoObj)) : '',
      });

      // Reads the Customer/Organisation folder AND the unscoped one older images were
      // written to, merged — so nothing that is visible today disappears.
      setRepositoryImages(await listScopedImages(token, {
        destination,
        bookName: resolveImageBookName(target),
        chapterName: modalSelectedChapter !== "all"
          ? String(listChapterObj ? chapterNameOf(listChapterObj) : modalSelectedChapter)
          : '',
        loName: listLoObj ? String(loNameOf(listLoObj)) : '',
      }));
    } catch (e) {
      console.error(e);
      setRepositoryImages([]);
    } finally {
      setIsLoadingRepoImages(false);
    }
  };

  const handleOpenImageSelect = (q: any) => {
    setImageSelectTarget(q);
    // Open on the question's own book/chapter folder. Defaulting to "General
    // Images" listed the shared cross-book pool, so images from other subjects
    // and chapters showed up in the picker.
    setImageSelectDestination("specific");
    setModalSelectedChapter(resolveModalChapterKey(q));
    setModalSelectedLO("all");
    setSelectedRepoImage("");
    setSelectedRepoImages([]);
    setImageUploadError("");
    setIsImageSelectModalOpen(true);
    // The effect below refetches once the modal state settles.
  };

  useEffect(() => {
    if (isImageSelectModalOpen && imageSelectTarget) {
      fetchRepositoryImages(imageSelectDestination, imageSelectTarget);
      setSelectedRepoImage("");
    }
    // modalChapters / modalLOs are dependencies because the folder path is built from
    // the chapter and LO *names*, which are looked up in those lists. They load
    // asynchronously after the modal opens, so without them the first listing used the
    // raw chapter code and no LO at all — an empty folder — and never refreshed once
    // the real names arrived.
  }, [imageSelectDestination, isImageSelectModalOpen, imageSelectTarget, modalSelectedChapter, modalSelectedLO, modalChapters, modalLOs]);

  /**
   * Stages image(s) onto the question being edited, keeping whatever is already
   * attached. Shared by "Apply Selected Image" and by a local upload, so both
   * routes behave identically. Committed to the question on "Save Changes".
   */
  const stageImagesForEdit = (urls: string[]) => {
    const incoming = (urls || []).map(u => String(u || '').trim()).filter(Boolean);
    if (incoming.length === 0) return;
    // Merge with the already-attached/staged images so the previous one is kept.
    // Once the images have been edited, the staged list is the whole truth — an
    // empty one means the user deleted every image. Testing `regeneratedImages.length`
    // could not tell that apart from "nothing staged yet", so it fell through to the
    // question's stored images and merged a just-deleted image back in.
    const existing = imagesEdited
      ? regeneratedImages
      : (Array.isArray((imageSelectTarget as any)?.generatedImages) && (imageSelectTarget as any).generatedImages.length
        ? (imageSelectTarget as any).generatedImages
        : (regeneratedImageUrl
          ? [regeneratedImageUrl]
          : ((imageSelectTarget as any)?.generatedImageUrl ? [(imageSelectTarget as any).generatedImageUrl] : [])));
    const merged = Array.from(new Set([...existing, ...incoming]));
    setRegeneratedImages(merged);
    setRegeneratedImageUrl(merged[0] || "");
    setStagedImageType(1); // manually uploaded / selected from the repository
    setImagesEdited(true);
  };

  const handleImageSelectSubmit = async () => {
    if (!imageSelectTarget || selectedRepoImages.length === 0) return;
    try {
      // Store the picture itself where the bytes can be read, so the Word/Excel
      // exports embed it instead of falling back to a link.
      stageImagesForEdit(await toEmbeddableImages(selectedRepoImages));
    } catch (e) {
      console.error(e);
    } finally {
      setIsImageSelectModalOpen(false);
      setImageSelectTarget(null);
      setSelectedRepoImage("");
      setSelectedRepoImages([]);
    }
  };

  const handleOpenImageRegenerate = (q: any) => {
    setImageRegenerateTarget(q);
    setImageInstructionText("");
    setIsImageInstructionModalOpen(true);
  };

  const handleRegenerateImageSubmit = async () => {
    if (!imageRegenerateTarget || !imageInstructionText.trim()) return;
    setIsRegeneratingImage(true);
    try {
      const { imageUrl: newImageUrl, optionImages } = await regenerateQuestionImageWithOptions(
        imageRegenerateTarget, imageInstructionText,
      );
      // Option images (Multiple Choice / Multiple Response) travel with the question.
      if (optionImages.length > 0) {
        imageRegenerateTarget.optionImages = optionImages;
        setRegeneratedOptionImages(optionImages);
      }
      if (newImageUrl) {
        imageRegenerateTarget.generatedImageUrl = newImageUrl;
        if (imageRegenerateTarget.generated_image) {
          imageRegenerateTarget.generated_image = newImageUrl.split(',')[1] || newImageUrl;
        }
        setRegeneratedImageUrl(newImageUrl);
        setRegeneratedImages([newImageUrl]);
        setStagedImageType(0); // produced by /generate-image
        setImagesEdited(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRegeneratingImage(false);
      setIsImageInstructionModalOpen(false);
      setImageInstructionText("");
      setImageRegenerateTarget(null);
    }
  };
  // Determine question type based on the question object
  // Note: Select the Blank / Fill In the Blank Dropdown must be detected before the
  // generic fill/blank check, otherwise it collapses into plain Fill In the Blank.
  const questionType = question?.type?.toLowerCase().includes('written') ? 'written-response' :
    question?.type?.toLowerCase().includes('multiple response') ? 'multiple-response' :
      question?.type?.toLowerCase().includes('true false') ? 'true-false' :
        question?.type?.toLowerCase().includes('matrix') ? 'matrix' :
          isFillBlankDropdownQuestion(question) ? 'select-the-blank' :
            question?.type?.toLowerCase().includes('fill') || question?.type?.toLowerCase().includes('blank') ? 'fill-in-the-blank' :
              'multiple-choice';

  // Extract question data from the nested structure if it exists
  const questionData = question?.[2] || question || {};
  //console.log('Question Data:', questionData); // Debug log

  // Get question text with fallbacks (prefer label)
  const questionStem = getCleanStem(questionData) || questionData.label || questionData.QuestionStatement || questionData.question || question?.[2]?.question || '';

  // Get options - handle both array and object formats
  let options = [];
  if (Array.isArray(questionData.values)) {
    options = questionData.values.map(opt => (typeof opt === 'string' ? opt : JSON.stringify(opt)));
  } else if (Array.isArray(question?.[2]?.values)) {
    // Handle the case where values are in question[2].values
    options = question[2].values.map(opt => (typeof opt === 'string' ? opt : JSON.stringify(opt)));
  } else if (Array.isArray(questionData.options)) {
    options = questionData.options.map(opt => (typeof opt === 'string' ? opt : opt.text || JSON.stringify(opt)));
  } else {
    // If no options array is found, try to get options from the question object
    options = [
      questionData.OptionA || question?.[2]?.OptionA || '',
      questionData.OptionB || question?.[2]?.OptionB || '',
      questionData.OptionC || question?.[2]?.OptionC || '',
      questionData.OptionD || question?.[2]?.OptionD || ''
    ].filter(opt => opt !== '');
  }

  // Get correct answer with fallbacks
  let correctAnswer = questionData.CorrectAnswer || question?.[2]?.CorrectAnswer || questionData.answer || questionData.correctanswer;

  // Handle Multiple Response questions where correctAnswer might be a string array
  if (questionType === 'multiple-response' && typeof correctAnswer === 'string') {
    try {
      // Try to parse as JSON array if it's a string representation of array
      if (correctAnswer.startsWith('[') && correctAnswer.endsWith(']')) {
        correctAnswer = JSON.parse(correctAnswer);
      } else if (correctAnswer.includes(',')) {
        // If it's a comma-separated string, split and trim
        correctAnswer = correctAnswer.split(',').map(ans => ans.trim()).filter(ans => ans);
      }
    } catch (e) {
      // If parsing fails, keep as is
      console.warn('Failed to parse correct answer for Multiple Response:', e);
    }
  }

  const normStr = (v: any): string => v === null || v === undefined ? '' : String(v);
  const correctAnswerPrefix = Array.isArray(correctAnswer)
    ? correctAnswer.map((ans) => {
      const s = normStr(ans);
      return s.match(/^[A-D][\.\)]?/)?.[0] || '';
    }).filter(Boolean).join(', ')
    : (() => { const s = normStr(correctAnswer); return s.match(/^[A-D][\.\)]?/)?.[0] || ''; })();
  const correctAnswerText = Array.isArray(correctAnswer)
    ? correctAnswer.map((ans) => {
      const s = normStr(ans);
      return s.replace(/^[A-D][\.\)]?\s*/, '');
    }).filter(Boolean).join(', ')
    : normStr(correctAnswer).replace(/^[A-D][\.\)]?\s*/, '');

  // Get feedbacks with fallbacks - support up to 10 options (A-J)
  const feedbacks = [];
  const feedbackLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  for (let i = 0; i < feedbackLetters.length; i++) {
    const letter = feedbackLetters[i];
    const feedbackKey = `FeedbackOption${letter}`;
    const feedback = questionData[feedbackKey] || question?.[2]?.[feedbackKey] || '';
    // Only add feedback if it exists or if we're within the options range
    if (feedback || i < options.length) {
      feedbacks.push(feedback);
    }
  }

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
  };

  //console.log('Options:', options); // Debug log
  //console.log('Correct Answer:', correctAnswer); // Debug log

  // Dynamic key points that will be loaded from selected question
  const getKeyPointsFromQuestion = (question: any) => {
    if (!question) return [];

    // Try to get key points from various possible fields and formats
    if (question.KeyPoints) {
      if (Array.isArray(question.KeyPoints)) {
        return question.KeyPoints;
      }
      // Handle case where KeyPoints is a JSON string
      if (typeof question.KeyPoints === 'string') {
        try {
          const parsed = JSON.parse(question.KeyPoints);
          if (Array.isArray(parsed)) {
            // Handle both formats: array of strings or array of objects with 'point' property
            return parsed.map((item: any) => {
              if (typeof item === 'string') return item;
              if (item.point) return item.point;
              return JSON.stringify(item);
            });
          }
        } catch (e) {
          console.error('Error parsing KeyPoints:', e);
        }
      }
    }

    if (question.keyPoints) {
      if (Array.isArray(question.keyPoints)) {
        return question.keyPoints;
      }
      // Handle case where keyPoints is a JSON string
      if (typeof question.keyPoints === 'string') {
        try {
          const parsed = JSON.parse(question.keyPoints);
          if (Array.isArray(parsed)) {
            return parsed.map((item: any) => {
              if (typeof item === 'string') return item;
              if (item.point) return item.point;
              return JSON.stringify(item);
            });
          }
        } catch (e) {
          console.error('Error parsing keyPoints:', e);
        }
      }
    }

    // Default key points if none exist
    return [
      "Speculative risks - Include the potential for financial gain, which is incompatible with insurance principles.",
      "Pure risks - Only involve loss or no loss, making them insurable and predictable.",
      "Risk predictability - Insurance relies on statistical data to assess and cover pure risks.",
      "Financial gain exclusion - Insurance is designed to restore, not profit from losses.",
      "Statistical analysis - Pure risks can be analyzed and priced using historical data."
    ];
  };

  if (!question) return null;

  // Read aloud, moved here from the question list. Uses the same helpers the list used,
  // so the spoken text (passage, stem, table and options) is identical.
  const speechAvailable =
    sessionStorage.getItem('isSpeechEnabled') !== 'false' &&
    localStorage.getItem('isSpeechEnabled') !== 'false' &&
    sessionStorage.getItem('showTextToSpeech') !== '0';

  const handlePreviewSpeak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (isPreviewSpeaking) {
      cancelSpeech();
      setIsPreviewSpeaking(false);
      return;
    }

    const textToRead = getCleanStem(questionData) || question?.question || question?.label
      || question?.QuestionStatement || question?.text || '';
    const speechText = buildSpeechText(question, textToRead);
    if (!speechText) return;

    const langHint = question?.quesOrigin || question?.originallanguage || question?.language
      || question?.Language || languageFromQuestionId(question?.id || question?.questionguid);

    setIsPreviewSpeaking(true);
    speakText(speechText, {
      langHint,
      onend: () => setIsPreviewSpeaking(false),
      onerror: () => setIsPreviewSpeaking(false),
    }).then(started => {
      if (!started) setIsPreviewSpeaking(false);
    });
  };

  // With passage tabs the stored label holds the whole multi-tab blob (tab titles
  // included), so the visible stem is the PartPrompt instead.
  const tabsForStem = getQuestionTabs(questionData);
  const partPromptForStem = String(questionData?.PartPrompt ?? questionData?.partPrompt ?? '').trim();
  const stemSource = (tabsForStem.length > 0 && partPromptForStem) ? partPromptForStem : questionStem;
  const normalized = String(stemSource || '')
    .replace(/e\^\{sin x\}/g, "e^{\\sin x}")
    .replace(/g\(x\)\s*=\s*e\^\{\\sin x\}\s*-\s*1/g, "$g(x)=e^{\\sin x}-1$");

  // Safe: use "Book Based" if value is "1", "LLM" if value is "2", fallback to label
  const getSourceLabel = (question) => {
    // Try .source, .sourceType, or the raw value (item[12]) as your code provides
    if (question?.source) {
      if (typeof question.source === "string") {
        // If already a label, just return it
        if (question.source.toLowerCase().includes("llm")) return "LLM";
        if (question.source.toLowerCase().includes("book")) return "Book Based";
        // If raw value, convert
        if (question.source === "2") return "LLM";
        if (question.source === "1") return "Book Based";
      }
      // If number (unlikely, but just in case)
      if (question.source === 2) return "LLM";
      if (question.source === 1) return "Book Based";
    }
    // Fallback to other fields if available
    if (question?.sourceType === "2" || question?.sourceType === 2) return "LLM";
    if (question?.sourceType === "1" || question?.sourceType === 1) return "Book Based";
    // If you store the raw field (e.g. item[12]) somewhere else, check that too
    if (question?.rawSource === "2" || question?.rawSource === 2) return "LLM";
    if (question?.rawSource === "1" || question?.rawSource === 1) return "Book Based";
    // Fallback: if nothing matches, show "Book Based"
    return "Book Based";
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="pb-6 border-b relative">
          <DialogClose asChild>
            {/* <button className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 p-1">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button> */}
          </DialogClose>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                {(() => {
                  switch (questionType?.toLowerCase()) {
                    case 'written-response':
                      return 'Preview Written Response';
                    case 'multiple-choice':
                      return 'Preview Multiple Choice';
                    case 'multiple-response':
                      return 'Preview Multiple Response';
                    case 'true false':
                    case 'true-false':
                      return 'Preview True False';
                    case 'matrix':
                      return 'Preview Matrix';
                    case 'select-the-blank':
                      return 'Preview Select the Blank';
                    case 'fill-in-the-blank':
                      return 'Preview Fill in the Blank';
                    default:
                      return 'Preview Question';
                  }
                })()}
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                {questionType === "written-response"
                  ? "Review the complete written response question with sample answer and key points."
                  : "Review the complete question with all options and feedback."
                }
              </p>
            </div>

            {/* Read aloud — moved here from the question list. */}
            {speechAvailable && (
              <Button
                variant="outline"
                size="sm"
                className={`ml-auto mr-8 flex items-center gap-2 ${isPreviewSpeaking ? 'text-blue-600 border-blue-300' : 'text-gray-700'}`}
                title={isPreviewSpeaking ? "Stop reading" : "Read this question aloud"}
                aria-label={isPreviewSpeaking ? "Stop reading" : "Read this question aloud"}
                onClick={handlePreviewSpeak}
              >
                {isPreviewSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {isPreviewSpeaking ? 'Stop' : 'Audio'}
              </Button>
            )}
          </div>

        </DialogHeader>

        <div className="space-y-8 py-6">
          {activeTab === "question" && (
            <>
              {/* Original Question Information - Only show for converted questions */}
              {question?.originalquestionid && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                      <Globe className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Original Question Information</h3>
                  </div>
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-purple-900">Original Question ID:</span>
                      <span className="text-sm text-purple-800">{question.originalquestionid}</span>
                    </div>
                    {question?.originallanguage && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-purple-900">Translated Language:</span>
                        <span className="text-sm text-purple-800">{question.originallanguage}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Passage tabs — full-width pill switcher above the question */}
              {getQuestionTabs(questionData).length > 0 && (() => {
                const tabsList = getQuestionTabs(questionData);
                const safeIdx = Math.min(activePassageTab, tabsList.length - 1);
                return (
                  <div className="w-full mb-4">
                    <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-1 flex-wrap">
                      {tabsList.map((tab: any, tIdx: number) => {
                        const isActive = tIdx === safeIdx;
                        return (
                          <button
                            key={tIdx}
                            type="button"
                            onClick={() => setActivePassageTab(tIdx)}
                            className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ease-out ${isActive
                              ? 'bg-white text-blue-700 shadow-md shadow-black/5 ring-1 ring-black/5'
                              : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                              }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full transition-colors ${isActive ? 'bg-blue-600' : 'bg-gray-300'}`} />
                              {getTabTitle(tab, tIdx)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <div className="text-gray-900 text-base leading-relaxed whitespace-pre-line">
                        <LatexRenderer content={getTabPassage(tabsList[safeIdx] || {})} />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Question Stem */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Question Stem:</h3>
                </div>


                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="text-gray-900 leading-relaxed mb-4">
                    {(() => {
                      // Refinement (e.g. Multiple Response -> True False) can return a
                      // label that repeats the stem, so collapse any duplicated
                      // sentence, not just an exact "X X".
                      let mainText = dedupeRepeatedText(normalized);

                      // Select the Blank: the stem reads as one uninterrupted sentence
                      // with a visible blank at the gap, and the dropdown sits on its own
                      // line under the completed question. Splitting the sentence around
                      // an inline <select> broke the stem across lines instead.
                      if (questionType === 'select-the-blank' || isFillBlankDropdownQuestion(questionData)) {
                        const dropdownOptions = getDropdownOptionsFromQuestion(questionData).length > 0
                          ? getDropdownOptionsFromQuestion(questionData)
                          : getDropdownOptionsFromQuestion(question);
                        const stemWithBlank = replaceGapToken(mainText);
                        return (
                          <>
                            <LatexRenderer content={stemWithBlank} />
                            {dropdownOptions.length > 0 && (
                              <div className="mt-3">
                                <select
                                  className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  value={previewDropdownSelection}
                                  onChange={(e) => setPreviewDropdownSelection(e.target.value)}
                                >
                                  <option value="" disabled>-- Select an option --</option>
                                  {dropdownOptions.map((opt: string, i: number) => (
                                    <option key={i} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </>
                        );
                      }
                      return <LatexRenderer content={mainText} />;
                    })()}
                  </div>

                  {/* Table Analysis */}
                  {getTableAnalysis(questionData) && (() => {
                    const tableData = getTableAnalysis(questionData)!;
                    const sortCol = previewTableSort || 'S.no';
                    const sortedRows = getSortedRows(tableData, sortCol === 'S.no' ? null : sortCol);

                    return (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-sm font-semibold text-gray-800">Sort By :</label>
                          <select
                            value={sortCol}
                            onChange={(e) => setPreviewTableSort(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                          >
                            {getSortOptions(tableData).map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                        <div className="overflow-x-auto border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
                          <table className="w-full border border-gray-300 rounded-md">
                            <thead>
                              <tr className="bg-gray-50">
                                {tableData.Columns.map((col) => (
                                  <th key={col} className="border border-gray-300 p-2 text-center font-semibold text-gray-800">
                                    <LatexRenderer content={String(col)} />
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sortedRows.map((row, rIdx) => (
                                <tr key={rIdx}>
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="border border-gray-300 p-2 text-center text-gray-700">
                                      <LatexRenderer content={String(cell)} />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* With tabs the stem above IS the PartPrompt, so don't repeat it */}
                  {(questionData.PartPrompt || question?.PartPrompt) && tabsForStem.length === 0 && !containsStemText(normalized, questionData.PartPrompt || question?.PartPrompt) && (
                    <div className="text-base text-gray-900 mt-3 font-bold">
                      <strong>
                        <LatexRenderer content={questionData.PartPrompt || question?.PartPrompt} />
                      </strong>
                    </div>
                  )}
                </div>
                {(() => {
                  const committed = Array.isArray((question as any)?.generatedImages) && (question as any).generatedImages.length
                    ? (question as any).generatedImages
                    : (() => { const s = resolveQuestionImageUrl(question); return s ? [s] : []; })();
                  const imgs = (regeneratedImages.length ? regeneratedImages : committed)
                    .filter((u: string) => u && !u.includes('NOT REQUIRED') && !u.includes('NO_IMAGE_REQUIRED'));
                  const hasImage = imgs.length > 0;
                  const rawType = (imagesEdited && stagedImageType !== null)
                    ? stagedImageType
                    : (
                      (questionData as any)?.generatedimagetype ??
                      (questionData as any)?.generated_image_type ??
                      (questionData as any)?.generatedImageType ??
                      (question as any)?.generatedimagetype ??
                      (question as any)?.generated_image_type ??
                      (question as any)?.generatedImageType ??
                      (question as any)?.[26]
                    );
                  const imgType = toGeneratedImageType(rawType);
                  return (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-sm text-gray-600">{hasImage ? (imgs.length > 1 ? `Images (${imgs.length})` : 'Question Image') : 'Question Image'}</p>
                        {hasImage && (
                          imgType === 1 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-400 shadow-sm" title="Manually Uploaded / Selected Image">
                              <Upload className="w-4 h-4 text-white" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 shadow-sm" title="AI Generated Image">
                              <Sparkles className="w-4 h-4 text-indigo-600" />
                            </span>
                          )
                        )}
                      </div>
                      {hasImage ? (
                        <div className="flex flex-wrap gap-3">
                          {imgs.map((src: string, i: number) => (
                            <RepoImage
                              key={i}
                              src={src}
                              alt={`Question illustration ${i + 1}`}
                              className="max-w-full h-auto rounded-lg border border-gray-300 shadow-sm"
                              style={{ maxHeight: '320px' }}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No image yet. Click the icon to generate one with additional instructions.</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {questionType === "written-response" ? (
                <>
                  {/* Answer */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-purple-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Answer</h3>
                    </div>

                    <div className="p-4 bg-purple-50 border border-purple-200 border rounded-lg">
                      <div className="text-purple-900 font-medium">
                        <LatexRenderer content={correctAnswerText ||
                          (question && question.CorrectAnswer ?
                            question.CorrectAnswer.replace(/^[A-D]\.\s*/, '') :
                            ""
                          )
                        } />
                      </div>
                    </div>
                  </div>
                  {/* Key Points */}
                  {questionType === 'written-response' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                          <List className="w-4 h-4 text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Key Points:</h3>
                      </div>

                      <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                        <div>
                          {/* <p><strong>Key Points:</strong></p> */}
                          {getKeyPointsFromQuestion(question).length > 0 ? (
                            <ul className="list-style-none">
                              {getKeyPointsFromQuestion(question).map((val, i) => {
                                const s = String(val ?? '');
                                if (s.includes(' ~ ')) {
                                  const [underlinePart, restOfVal] = s.split('~');
                                  return (
                                    <li key={i}>
                                      <strong><u><LatexRenderer content={String(underlinePart ?? '').trim()} /></u></strong> - <span style={{ whiteSpace: 'pre-wrap' }}><LatexRenderer content={String(restOfVal ?? '').trim()} /></span>
                                    </li>
                                  );
                                }
                                return <li key={i}><span style={{ whiteSpace: 'pre-wrap' }}><LatexRenderer content={s} /></span></li>;
                              })}
                            </ul>
                          ) : (
                            <p>N/A</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-8">
                  {/* Matrix view */}
                  {questionType === 'matrix' ? (
                    <>
                      {/* Part Prompt (optional) */}
                      {(() => {
                        const partPrompt = String(questionData.PartPrompt || '');
                        if (!partPrompt.trim()) return null;
                        // return (
                        //   <div className="space-y-4">
                        //     <div className="flex items-center gap-3">
                        //       <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                        //         <AlignLeft className="w-4 h-4 text-purple-600" />
                        //       </div>
                        //       <h3 className="text-lg font-semibold text-gray-900">Part Prompt</h3>
                        //     </div>
                        //     <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        //       <p className="text-gray-900 leading-relaxed">{partPrompt}</p>
                        //     </div>
                        //   </div>
                        // );
                      })()}

                      {/* Matrix Grid */}
                      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800">Matrix</h3>
                            <p className="text-sm text-gray-500">Rows, columns and selected answers</p>
                          </div>
                        </div>
                        {(() => {
                          const parseArr = (v: any) => {
                            if (Array.isArray(v)) return v;
                            if (typeof v === 'string') {
                              try {
                                const p = JSON.parse(v);
                                return Array.isArray(p) ? p : [];
                              } catch { return []; }
                            }
                            return [];
                          };
                          const rowsRaw = parseArr(questionData.rows);
                          const colsRaw = parseArr(questionData.columns);
                          const ansRaw = parseArr(questionData.CorrectAnswer);
                          const rows = rowsRaw.map((r: any) => typeof r === 'string' ? r : (r?.text || ''));
                          const cols = colsRaw.map((c: any) => typeof c === 'string' ? c : (c?.text || ''));
                          let answers = ansRaw.map((a: any) => Number(a));
                          // Defensive: align lengths and clamp to columns range
                          if (answers.length < rows.length) {
                            answers = [...answers, ...Array(rows.length - answers.length).fill(Math.min(0, Math.max(0, cols.length - 1)))];
                          } else if (answers.length > rows.length) {
                            answers = answers.slice(0, rows.length);
                          }
                          answers = answers.map((a) => {
                            if (!Number.isFinite(a) || cols.length === 0) return -1;
                            if (a < 0) return -1;
                            if (a >= cols.length) return cols.length - 1;
                            return a;
                          });
                          return (
                            <div className="overflow-x-auto">
                              {rows.length === 0 || cols.length === 0 ? (
                                <div className="p-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded">
                                  {rows.length === 0 && cols.length === 0 ? 'No rows and columns to display.' : rows.length === 0 ? 'No rows to display.' : 'No columns to display.'}
                                </div>
                              ) : (
                                <table className="table-fixed w-full">
                                  <thead>
                                    <tr className="bg-gray-50">
                                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 border-b border-r">Row</th>
                                      {cols.map((c, i) => (
                                        <th key={i} className="px-3 py-2 text-left text-sm font-medium text-gray-700 border-b border-r"><LatexRenderer content={c || `Col ${i + 1}`}></LatexRenderer></th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r, ri) => (
                                      <tr key={ri} className="odd:bg-white even:bg-gray-50">
                                        <td className="px-3 py-2 text-sm text-gray-900 border-b border-r font-medium"><LatexRenderer content={r || `Row ${ri + 1}`}></LatexRenderer></td>
                                        {cols.map((_, ci) => {
                                          const selected = Number(answers[ri]) === ci;
                                          return (
                                            <td key={ci} className={`px-3 py-2 text-center border-b border-r ${selected ? 'bg-green-50' : ''}`}>
                                              <input
                                                type="radio"
                                                name={`matrix-preview-row-${ri}`}
                                                className="accent-blue-600"
                                                readOnly
                                                onClick={(e) => e.preventDefault()}
                                                checked={selected}
                                                aria-label={`Row ${ri + 1} option ${ci + 1}`}
                                              />
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Matrix Feedbacks */}
                      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800">Feedbacks</h3>
                            <p className="text-sm text-gray-500">Per-row feedback</p>
                          </div>
                        </div>
                        {(() => {
                          const parseArr = (v: any) => {
                            if (Array.isArray(v)) return v;
                            if (typeof v === 'string') {
                              try {
                                const p = JSON.parse(v);
                                return Array.isArray(p) ? p : [];
                              } catch { return []; }
                            }
                            return [];
                          };
                          const feedbacks = parseArr((questionData as any).Feedbacks).map((f: any) => String(f));
                          const rowsRaw = parseArr(questionData.rows);
                          const rows = rowsRaw.map((r: any) => typeof r === 'string' ? r : (r?.text || ''));
                          const colsRaw = parseArr((questionData as any).columns);
                          const cols = colsRaw.map((c: any) =>
                            typeof c === 'string' ? c : (c?.text || c?.value || '')
                          );

                          const rawCA = (questionData as any).CorrectAnswer
                            ?? (questionData as any).answers
                            ?? (questionData as any).correct;

                          let ca: any[] = [];

                          if (Array.isArray(rawCA)) {
                            // Already an array of indices/values
                            ca = rawCA;
                          } else if (typeof rawCA === 'string') {
                            // Try to parse JSON string like "[0,1,2]"
                            try {
                              const parsed = JSON.parse(rawCA);
                              if (Array.isArray(parsed)) {
                                ca = parsed;
                              }
                            } catch {
                              // leave ca as [] if parsing fails
                            }
                          } else if (rawCA && typeof rawCA === 'object') {
                            // Object shapes: { answers: [...] } / { correct: [...] } / { indices: [...] } / { value: [...] }
                            const obj = rawCA as any;
                            ca = Array.isArray(obj.answers) ? obj.answers
                              : Array.isArray(obj.correct) ? obj.correct
                                : Array.isArray(obj.indices) ? obj.indices
                                  : Array.isArray(obj.value) ? obj.value
                                    : ca;
                          }

                          return feedbacks.length > 0 ? (
                            <div className="space-y-4">
                              {feedbacks.map((fb: any, i: number) => {
                                const rowLabel = rows[i] || `Row ${i + 1}`;

                                // Correct response for this row
                                const picked = Array.isArray(ca) && i < ca.length ? ca[i] : undefined;

                                const correctResponse = (() => {
                                  if (!cols.length) return 'N/A';
                                  if (picked === undefined || picked === null) return 'N/A';

                                  if (typeof picked === 'number') {
                                    const c = cols[picked];
                                    return c || `Col ${Number(picked) + 1}`;
                                  }
                                  if (typeof picked === 'string') {
                                    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                                    const asIdx = letters.indexOf(picked.toUpperCase());
                                    if (asIdx >= 0 && cols[asIdx]) {
                                      return cols[asIdx] || `Col ${asIdx + 1}`;
                                    }
                                    const idx = cols.findIndex(c =>
                                      String(c).trim().toLowerCase() === picked.trim().toLowerCase()
                                    );
                                    if (idx >= 0 && cols[idx]) {
                                      return cols[idx] || `Col ${idx + 1}`;
                                    }
                                  }
                                  return 'N/A';
                                })();

                                // Clean feedback text
                                const rawFeedback = String(fb || '');
                                const feedbackText = rawFeedback.replace(/^\s*(Correct|Incorrect)[:.]?\s*/i, '');

                                return (
                                  <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="flex flex-col gap-3">
                                      <div className="flex items-start gap-2">
                                        <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">
                                          Row value:
                                        </span>
                                        <div className="text-sm text-gray-800 flex-1"><LatexRenderer content={rowLabel}></LatexRenderer></div>
                                      </div>
                                      <div className="flex items-start gap-2">
                                        <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">
                                          Correct response:
                                        </span>
                                        <div className="text-sm text-gray-800 flex-1"><LatexRenderer content={correctResponse}></LatexRenderer></div>
                                      </div>
                                      <div className="flex items-start gap-2">
                                        <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">
                                          Feedback:
                                        </span>
                                        <div className="text-sm text-gray-800 flex-1 min-h-[60px]">
                                          <LatexRenderer content={feedbackText || 'No feedback provided.'}></LatexRenderer>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-gray-500">No feedbacks available.</div>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Options — hidden for Select the Blank too: its choices already
                          appear in the inline dropdown within the question stem. */}
                      {questionType !== 'fill-in-the-blank' && questionType !== 'select-the-blank' && (
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-gray-800">Options</h3>
                              <p className="text-sm text-gray-500">Configured answer choices</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {options && options.length > 0 ? (
                              options.map((option, i) => {
                                // Extract option text, handling different formats
                                let optionText = '';
                                if (typeof option === 'string') {
                                  // Remove the leading letter and dot if present (e.g., "A. ")
                                  //optionText = option.replace(/^[A-Z]\.?\s*/, '').trim();
                                  optionText = option.replace(/^[A-Z][\.\)]\s+/, '').trim();
                                } else if (option && typeof option === 'object') {
                                  optionText = option.text || option.label || JSON.stringify(option);
                                } else {
                                  optionText = String(option);
                                }
                                const rawOpt = optionText || '';

                                const normalizedOpt = rawOpt
                                  .replace(/\bsin\b/g, "\\sin")
                                  .replace(/\bcos\b/g, "\\cos")
                                  .replace(/g\(x\)\s*=\s*e\^\{\\sin\s*x\}\s*-\s*1/g, (m) => `$${m}$`);

                                const optionLetter = String.fromCharCode(65 + i);

                                // Check if this option is the correct answer (handle both single and multiple correct answers)
                                const isCorrect = checkIsOptionCorrect(questionData || question, optionLetter, i, option);

                                return (
                                  <div
                                    key={i}
                                    className={`flex items-start gap-4 p-4 rounded-lg border ${isCorrect ? 'border-2 border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'} transition-colors`}
                                  >
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 mt-1 ${isCorrect ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-white border border-gray-300 text-gray-700'} shadow-sm`}>
                                      {optionLetter}
                                    </div>
                                    <div className="flex-1">
                                      <div className={`${isCorrect ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                                        <LatexRenderer content={normalizedOpt}></LatexRenderer>
                                      </div>
                                      {(() => {
                                        // Image generated for this option (Multiple Choice / Multiple Response).
                                        const url = findOptionImageUrl(getOptionImages(questionData || question), i, rawOpt);
                                        if (!url) return null;
                                        return (
                                          <RepoImage
                                            src={url}
                                            alt={`Option ${optionLetter} illustration`}
                                            className="mt-3 max-w-full h-auto rounded-lg border border-gray-300 shadow-sm"
                                            style={{ maxHeight: '180px' }}
                                          />
                                        );
                                      })()}
                                    </div>
                                    {isCorrect && (
                                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 flex-shrink-0 mt-1">
                                        <Check className="w-4 h-4" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-center py-4 text-gray-500">
                                No options available for this question.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Correct Answer */}
                      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                            <Target className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800">Correct Answer</h3>
                            <p className="text-sm text-gray-500">The correct option with explanation</p>
                          </div>
                        </div>

                        {Array.isArray(correctAnswer) ? (
                          // Display multiple correct answers in separate blocks
                          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                            {(Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer]).map((answer, index) => (
                              <div key={index} className="text-purple-900 font-medium">
                                <LatexRenderer content={String(answer)} isQuestion />
                              </div>
                            ))}
                          </div>
                        ) : (
                          // Display single correct answer
                          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                            <div className="text-purple-900 font-medium">
                              <LatexRenderer content={correctAnswer || 'No correct answer specified'}></LatexRenderer>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Feedback */}
                      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800">Feedback</h3>
                            <p className="text-sm text-gray-500">Explanations for each option</p>
                          </div>
                        </div>

                        {/* For Fill in the Blank, show a single green feedback without option labels and without requiring options */}
                        {questionType === 'select-the-blank' ? (
                          (() => {
                            // Only the correct option's feedback, matching the compact card layout
                            const dropdownOptions = getDropdownOptionsFromQuestion(question);
                            const correctRaw = String(correctAnswer || '').replace(/^[A-Da-d]\.\s*/, '').trim().toLowerCase();
                            const correctIdx = dropdownOptions.findIndex((o: string) => String(o).trim().toLowerCase() === correctRaw);
                            const letterFeedback = correctIdx >= 0
                              ? questionData[`FeedbackOption${String.fromCharCode(65 + correctIdx)}`]
                              : '';
                            const feedbackText = letterFeedback || questionData.FeedbackOptionA || feedbacks[0] || '';
                            if (!feedbackText) return (<div className="text-gray-500">No feedback available.</div>);
                            return (
                              <div className="p-4 rounded-lg border bg-green-50 border-green-200">
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-green-100 text-green-700">
                                    <CheckCircle2 className="w-4 h-4" />
                                  </div>
                                  <div className="mt-1 text-green-800">
                                    <LatexRenderer content={String(feedbackText)} />
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        ) : questionType === 'fill-in-the-blank' ? (
                          (() => {
                            const firstFeedback = feedbacks.find(fb => String(fb || '').trim().length > 0) || '';
                            const text = firstFeedback || 'No feedback available.';
                            return (
                              <div className="p-4 rounded-lg border bg-green-50 border-green-200">
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-green-100 text-green-700">
                                    <CheckCircle2 className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="mt-1 text-green-800">{text}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="space-y-4">
                            {options.map((option, i) => {
                              const optionLetter = String.fromCharCode(65 + i);
                              // Handle both single correct answer and multiple correct answers
                              const isCorrect = Array.isArray(correctAnswer)
                                ? correctAnswer.some(ans => ans.startsWith(optionLetter))
                                : correctAnswer && correctAnswer.startsWith(optionLetter);
                              const feedback = feedbacks[i] || (isCorrect
                                ? 'Correct. This option is the right answer.'
                                : `Incorrect. This option is not the correct answer.`);

                              // Check if feedback starts with "Correct." for green styling
                              const isCorrectFeedback = feedback.trim().toLowerCase().startsWith('correct.');

                              return (
                                <div
                                  key={i}
                                  className={`p-4 rounded-lg border ${isCorrectFeedback ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isCorrectFeedback ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                      {isCorrectFeedback ? (
                                        <CheckCircle2 className="w-4 h-4" />
                                      ) : (
                                        <XCircle className="w-4 h-4" />
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-sm font-medium text-gray-600">Option {optionLetter}:</span>
                                      <div className={`mt-1 ${isCorrectFeedback ? 'text-green-800' : 'text-red-800'}`}>
                                        <LatexRenderer content={feedback}></LatexRenderer>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Key Points — the written-response view has its own section
                          above; Select the Blank gets one here. It reads the stored
                          value directly, so a question without key points shows
                          nothing rather than the sample list. */}
                      {questionType === 'select-the-blank' && getStoredKeyPoints(questionData, question).length > 0 && (
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                              <List className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-gray-800">Key Points</h3>
                              <p className="text-sm text-gray-500">Points the answer should cover</p>
                            </div>
                          </div>
                          <ul className="space-y-2 list-disc pl-5">
                            {getStoredKeyPoints(questionData, question).map((point: string, i: number) => (
                              <li key={i} className="text-gray-800">
                                <span style={{ whiteSpace: 'pre-wrap' }}><LatexRenderer content={point} /></span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* {activeTab === "feedback" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-orange-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Feedffffback:</h3>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                {feedbacks.map((feedback, index) => (
                  <p key={index} className="text-gray-900 leading-relaxed">
                    <strong>{String.fromCharCode(65 + index)}:</strong> {feedback}
                  </p>
                ))}
              </div>
            </div>
          )} */}

          {/* Question Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                <FileQuestion className="w-4 h-4 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Question Details</h3>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <p className="break-words"><strong>Type:</strong> {question?.type || 'N/A'}</p>
                <p className="break-words"><strong>Marks:</strong> {question?.MaxMarks || 'N/A'}</p>
                <p className="break-words"><strong>Source:</strong> {question?.source || 'N/A'}</p>
                <p className="break-words"><strong>Book Name:</strong> {question?.bookname || 'N/A'}</p>
                {/* The question carries its own chapter (item[13]); the session value is
                    whatever the Generate screen last selected, so it reported the wrong
                    chapter for every question it was shown against. */}
                <p className="break-words"><strong>Study:</strong> {question?.study || sessionStorage.getItem('selectedChapterName') || 'N/A'}</p>
                <p className="break-words"><strong>Learning Objective:</strong> {question?.learningObjective || 'N/A'}</p>
                <p className="break-words"><strong>Taxonomy:</strong> {question?.taxonomy || 'N/A'}</p>
                <p className="break-words"><strong>Creativity Level:</strong> {question.creativitylevelname}</p>
                {/* <p className="md:col-span-2"><strong>Reference info:</strong> {question?.ReferenceInfo || 'N/A'}</p> */}
                <p className="break-words"><strong>User Name:</strong> {question?.userName || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Metadata Details moved out of the Preview to the Meta column in the table. */}
        </div>
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-10">
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: -25,
              background: "#fff",
              borderTop: "1px solid #eee",
              padding: "16px 24px",
              zIndex: 20,
              boxShadow: "0 -2px 8px rgba(0,0,0,0.02)"
            }}
            className="flex justify-end gap-3"
          >
            <Button
              variant="outline"
              onClick={onClose}
              className="flex items-center gap-2" title="Close"
            >
              <X className="w-4 h-4" />
              Close Preview
            </Button>
          </div>
        </div>

        {/* Image Regeneration Modal (Additional Instructions) */}
        <Dialog open={isImageInstructionModalOpen} onOpenChange={setIsImageInstructionModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Regenerate Image</DialogTitle>
              <DialogDescription>
                Provide specific instructions on how to regenerate the image for this question.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="preview-image-instructions" className="text-right">
                  Additional Instructions
                </Label>
                <Textarea
                  id="preview-image-instructions"
                  value={imageInstructionText}
                  onChange={(e) => setImageInstructionText(e.target.value)}
                  placeholder="e.g., Make it a bar chart instead of a pie chart, remove the labels..."
                  className="col-span-3 min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsImageInstructionModalOpen(false)}>Cancel</Button>
              <Button onClick={handleRegenerateImageSubmit} disabled={isRegeneratingImage || !imageInstructionText.trim()}>
                {isRegeneratingImage ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generating...
                  </>
                ) : 'Regenerate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Image Select Modal */}
        <Dialog open={isImageSelectModalOpen} onOpenChange={setIsImageSelectModalOpen}>
          <DialogContent className="sm:max-w-2xl w-[95vw] sm:w-full max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-3 sm:p-4 gap-2">
            <DialogHeader>
              <DialogTitle>Select Image from Repository</DialogTitle>
              <DialogDescription>
                Choose an image from Repository
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="flex flex-col gap-4">
                <div className="flex gap-4 items-center justify-between">
                  <div className="flex gap-4 items-center">
                    <Label>Destination:</Label>
                    <Select value={imageSelectDestination} onValueChange={(val: any) => setImageSelectDestination(val)}>
                      <SelectTrigger className="w-[200px] focus:ring-offset-0 focus:ring-inset">
                        <SelectValue placeholder="Select Destination" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General Images</SelectItem>
                        <SelectItem value="specific">Question Specific Folder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <input
                      type="file"
                      ref={localFileInputRef}
                      accept=".png, .jpg, .jpeg, image/png, image/jpeg"
                      onChange={handleLocalImageBrowse}
                      className="hidden"
                      multiple
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => localFileInputRef.current?.click()}
                      className="flex items-center gap-2 text-xs border-gray-300 hover:bg-gray-50"
                    >
                      <Upload className="h-4 w-4 text-blue-600" />
                      Browse Local Image
                    </Button>
                  </div>
                </div>
                {imageSelectDestination === "specific" && (
                  <div className="text-xs text-gray-700 bg-blue-50 p-3 rounded-lg border border-blue-100 flex flex-col gap-2">
                    <div>
                      <Label className="mb-1 block font-semibold">Book</Label>
                      <Input readOnly value={imageSelectTarget?.bookname || imageSelectTarget?.BookName || sessionStorage.getItem('bookTitle') || 'Book'} className="bg-white h-8 text-xs cursor-default focus-visible:ring-0" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1 block font-semibold">Chapter</Label>
                        <Select value={modalSelectedChapter} onValueChange={setModalSelectedChapter}>
                          <SelectTrigger className="h-8 bg-white text-xs focus:ring-offset-0 focus:ring-inset">
                            <SelectValue placeholder="Select Chapter" />
                          </SelectTrigger>
                          <SelectContent>
                            {modalChapters.map((c: any) => (
                              <SelectItem key={String(chapterKeyOf(c))} value={String(chapterKeyOf(c))}>
                                {chapterNameOf(c)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="mb-1 block font-semibold">Learning Objective (LO)</Label>
                        <Select value={modalSelectedLO} onValueChange={setModalSelectedLO} disabled={modalSelectedChapter === "all"}>
                          <SelectTrigger className="h-8 bg-white text-xs focus:ring-offset-0 focus:ring-inset">
                            <SelectValue placeholder="All LOs" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All LOs</SelectItem>
                            {modalLOs.map((l: any) => (
                              <SelectItem key={String(loKeyOf(l))} value={String(loKeyOf(l))}>
                                {loNameOf(l)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Select Image</Label>
                  <div className="h-[clamp(120px,24vh,240px)] overflow-y-auto border rounded-md p-2 bg-gray-50">
                    {isLoadingRepoImages ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : repositoryImages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        No images found in this folder.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {repositoryImages.map((img: any, idx: number) => {
                          const url = img.backend_download_url || img.url;
                          const isSelected = selectedRepoImages.includes(url);
                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedRepoImages(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url])}
                              className={`relative cursor-pointer border-2 rounded overflow-hidden aspect-square ${isSelected ? 'border-blue-600 ring-2 ring-blue-300' : 'border-transparent hover:border-blue-300'}`}
                            >
                              <img src={url} alt={img.filename || 'repo image'} className="w-full h-full object-contain bg-white" title={img.filename} loading="lazy" />
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="absolute top-1 left-1 w-4 h-4 accent-blue-600 pointer-events-none"
                              />
                              {isSelected && (
                                <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shadow">
                                  {selectedRepoImages.indexOf(url) + 1}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {imageUploadError && (
              <p role="alert" className="text-sm font-medium text-red-600 px-1">{imageUploadError}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsImageSelectModalOpen(false)}>Cancel</Button>
              <Button onClick={handleImageSelectSubmit} disabled={selectedRepoImages.length === 0}>
                {selectedRepoImages.length > 1 ? `Apply ${selectedRepoImages.length} Images` : 'Apply Selected Image'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </DialogContent>
    </Dialog>
  );
}

// Enhanced EditQuestionModal component matching QuestionResults.tsx design
// Helper function to get key points from question object
const getKeyPointsFromQuestion = (question: any) => {
  if (!question) return [];

  // Try to get key points from various possible fields and formats
  if (question.KeyPoints) {
    if (Array.isArray(question.KeyPoints)) {
      return question.KeyPoints;
    }
    // Handle case where KeyPoints is a JSON string
    if (typeof question.KeyPoints === 'string') {
      try {
        const parsed = JSON.parse(question.KeyPoints);
        if (Array.isArray(parsed)) {
          // Handle both formats: array of strings or array of objects with 'point' property
          return parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            if (item.point) return item.point;
            return JSON.stringify(item);
          });
        }
      } catch (e) {
        console.error('Error parsing KeyPoints:', e);
      }
    }
  }

  if (question.keyPoints) {
    if (Array.isArray(question.keyPoints)) {
      return question.keyPoints;
    }
    // Handle case where keyPoints is a JSON string
    if (typeof question.keyPoints === 'string') {
      try {
        const parsed = JSON.parse(question.keyPoints);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            if (item.point) return item.point;
            return JSON.stringify(item);
          });
        }
      } catch (e) {
        console.error('Error parsing keyPoints:', e);
      }
    }
  }

  return [];
};

interface FormData {
  questionStem: string;
  options: string[];
  correctAnswer: string;
  [key: string]: any; // Allow any additional string keys
}

interface FormErrors {
  questionStem?: string;
  options?: string[];
  correctAnswer?: string;
  keyPoints?: string[];
  [key: string]: any; // Allow any additional string keys for error messages
}

const EditQuestionModal: React.FC<{
  open: boolean;
  onClose: () => void;
  question: any;
  onSave: (updatedQuestion: any) => void;
  validationErrors: {
    options: string[];
    correctAnswer: string;
    questionStem: string;
    sampleAnswer: string;
    keyPoints: string[];
  };
  onCorrectAnswerChange: (value: string) => void;
  featurePreferences: {
    isValidate: number;
    isSimilarity: number;
    isRewrite: number;
  };
}> = ({ open, onClose, question, onSave, validationErrors, onCorrectAnswerChange, featurePreferences }) => {
  const questionData = question?.[2] || question || {};

  // Image regeneration (Additional Instructions popup) â€” local to this modal
  const [isImageInstructionModalOpen, setIsImageInstructionModalOpen] = useState(false);
  const [imageInstructionText, setImageInstructionText] = useState("");
  const [imageRegenerateTarget, setImageRegenerateTarget] = useState<any>(null);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [regeneratedImageUrl, setRegeneratedImageUrl] = useState<string>("");
  const [regeneratedImages, setRegeneratedImages] = useState<string[]>([]);
  // Per-option images produced by the last regeneration in this modal; until then
  // the ones saved on the question are shown.
  const [regeneratedOptionImages, setRegeneratedOptionImages] = useState<OptionImage[] | null>(null);
  const [imagesEdited, setImagesEdited] = useState(false);
  // 1 = manually uploaded / picked from the repository, 0 = AI generated. Without
  // this the "AI Generated" badge stayed on manually added images.
  const [stagedImageType, setStagedImageType] = useState<number | null>(null);

  const [isImageSelectModalOpen, setIsImageSelectModalOpen] = useState(false);
  const [imageSelectTarget, setImageSelectTarget] = useState<any>(null);
  const [imageSelectDestination, setImageSelectDestination] = useState<"general" | "specific">("general");
  const [repositoryImages, setRepositoryImages] = useState<any[]>([]);
  const [isLoadingRepoImages, setIsLoadingRepoImages] = useState(false);
  const [selectedRepoImage, setSelectedRepoImage] = useState<string>("");
  const [selectedRepoImages, setSelectedRepoImages] = useState<string[]>([]);
  // Shown in red above the "Apply Selected Image" button instead of a browser alert.
  const [imageUploadError, setImageUploadError] = useState<string>("");
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const handleLocalImageBrowse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImageUploadError("");

    const imageFiles = Array.from(files).filter(file =>
      file.type.match(/^image\/(png|jpe?g)$/i) || file.name.match(/\.(png|jpe?g)$/i)
    );

    if (imageFiles.length === 0) {
      setImageUploadError("Please select a valid .png or .jpeg image file.");
      e.target.value = "";
      return;
    }

    // Anything over 5 MB is rejected up front, with the offending file named, rather
    // than being read into memory and failing part-way through the upload.
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const oversizedFiles = imageFiles.filter(file => file.size > MAX_IMAGE_BYTES);
    const validFiles = imageFiles.filter(file => file.size <= MAX_IMAGE_BYTES);

    if (oversizedFiles.length > 0) {
      const tooBig = oversizedFiles
        .map(file => `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`)
        .join(', ');
      setImageUploadError(`Please add an image less than 5 MB. ${tooBig}`);
    }

    // Every selected file was too large — nothing left to upload.
    if (validFiles.length === 0) {
      e.target.value = "";
      return;
    }

    setIsLoadingRepoImages(true);
    // Read the picture's bytes while the File is still in hand. The storage account
    // sends no Access-Control-Allow-Origin header, so once the image is only a blob
    // URL the browser can no longer read it back — which is why manually added
    // images came out as a link instead of a picture in the Word/Excel exports.
    const attachable: string[] = (await Promise.all(
      validFiles.map(file => fileToStorableDataUrl(file).catch(() => ''))
    )).filter(Boolean);
    let uploadedUrls: string[] = [];
    let uploadFailed = false;
    try {
      const { getKbAuthToken } = await import('@/lib/kb-auth');
      const token = await getKbAuthToken();
      const target = imageSelectTarget || question;

      // Upload into the SAME folder the picker is currently listing. Previously
      // the file always went to the book/chapter/LO folder even while "General
      // Images" was selected, so it landed somewhere the grid never showed and
      // the image was lost as soon as the list refreshed.
      let chapterName = "";
      if (modalSelectedChapter && modalSelectedChapter !== "all") {
        const chapterObj = modalChapters.find((c: any) => String(chapterKeyOf(c)) === modalSelectedChapter);
        chapterName = String(chapterObj ? chapterNameOf(chapterObj) : modalSelectedChapter);
      } else if (target?.chaptername || target?.ChapterName || target?.chapter_name || sessionStorage.getItem('selectedChapterName')) {
        chapterName = String(target?.chaptername || target?.ChapterName || target?.chapter_name || sessionStorage.getItem('selectedChapterName'));
      }

      let loName = "";
      if (modalSelectedLO && modalSelectedLO !== "all") {
        const loObj = modalLOs.find((l: any) => String(loKeyOf(l)) === modalSelectedLO);
        loName = String(loObj ? loNameOf(loObj) : modalSelectedLO);
      } else if (target?.learningObjective || target?.learningobjective || target?.lo_name) {
        loName = String(target?.learningObjective || target?.learningobjective || target?.lo_name);
      }

      // Customer / Organisation is the top of the blob hierarchy; with none known the
      // prefix is empty and the path is exactly what it was before.
      const { custCode: imageCustCode, orgCode: imageOrgCode } = resolveImageScope();
      const folderPath = buildImageFolderPath({
        custCode: imageCustCode,
        orgCode: imageOrgCode,
        destination: imageSelectDestination,
        bookName: resolveImageBookName(target),
        chapterName,
        loName,
      });

      const bookId = sessionStorage.getItem('bookid') || sessionStorage.getItem('bookDetailsId') || '2';
      const formData = new FormData();
      formData.append("folder_path", folderPath);
      formData.append("book_id", String(bookId));
      formData.append("auth_token", token);
      // Sent alongside the path so the server can apply the same scoping.
      appendImageScopeFields(formData);
      validFiles.forEach(file => formData.append("files", file));

      const response = await fetch(`${AGENT_GENERATIVE_API_URL}/upload-images`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      uploadedUrls = Array.isArray(data?.urls) && data.urls.length > 0
        ? data.urls
        : (data?.url ? [data.url] : []);

      if (uploadedUrls.length > 0) {
        const newImgObjs = uploadedUrls.map((url, idx) => ({
          backend_download_url: url,
          url: url,
          filename: validFiles[idx]?.name || 'uploaded_image'
        }));

        setRepositoryImages(prev => [...newImgObjs, ...prev]);
        setSelectedRepoImages(prev => Array.from(new Set([...prev, ...uploadedUrls])));
      } else {
        console.error('Upload returned no URL:', data);
        uploadFailed = true;
      }
    } catch (err) {
      console.error("Failed to upload image to blob storage:", err);
      uploadFailed = true;
    } finally {
      // Attach the picture straight away. Leaving the upload merely "selected"
      // meant closing the picker silently discarded it, which reads as the image
      // not saving. Cancelling the edit dialog still discards everything.
      // The embedded bytes are preferred over the blob URL so the Word/Excel
      // exports can render the image (see fileToStorableDataUrl).
      const toAttach = attachable.length ? attachable : uploadedUrls;
      if (toAttach.length) stageImagesForEdit(toAttach);
      if (uploadFailed) {
        alert(attachable.length
          ? 'The image was added to this question, but could not be saved to the shared image repository.'
          : 'The image could not be uploaded. Please try again.');
      }
      setIsLoadingRepoImages(false);
      e.target.value = "";
    }
  };
  const [modalChapters, setModalChapters] = useState<any[]>([]);
  const [modalLOs, setModalLOs] = useState<any[]>([]);
  const [modalSelectedChapter, setModalSelectedChapter] = useState<string>("all");
  const [modalSelectedLO, setModalSelectedLO] = useState<string>("all");
  const [modalChapterLOs, setModalChapterLOs] = useState<any[]>([]);

  // Clear any unsaved image selection when the modal (re)opens, so a previously
  // selected-but-not-saved image does not linger after Cancel.
  useEffect(() => {
    if (open) {
      setRegeneratedImageUrl("");
      setRegeneratedImages([]);
      setImagesEdited(false);
      setSelectedRepoImage("");
      setSelectedRepoImages([]);
    }
  }, [open]);

  // Fetch this book's chapters + LOs (get-chapter-lo-details) when the specific folder is chosen
  useEffect(() => {
    if (isImageSelectModalOpen && imageSelectDestination === "specific") {
      loadBookChapterLOs().then(list => {
        const chaptersList = uniqueByKey(list, chapterKeyOf);
        setModalChapterLOs(list);
        setModalChapters(chaptersList);
        setModalSelectedChapter(prev => {
          if (prev && prev !== 'all' && chaptersList.some((c: any) => String(chapterKeyOf(c)) === prev)) {
            return prev;
          }
          const resolved = resolveModalChapterKey(imageSelectTarget);
          if (resolved && resolved !== 'all' && chaptersList.some((c: any) => String(chapterKeyOf(c)) === resolved)) {
            return resolved;
          }
          if (chaptersList.length > 0) {
            return String(chapterKeyOf(chaptersList[0]));
          }
          return '';
        });
      }).catch(() => { setModalChapterLOs([]); setModalChapters([]); });
    }
  }, [isImageSelectModalOpen, imageSelectDestination]);

  // Filter LOs for the selected chapter (only that book/chapter's LOs)
  useEffect(() => {
    if (modalSelectedChapter && modalSelectedChapter !== "all") {
      const filtered = modalChapterLOs.filter((i: any) => String(chapterKeyOf(i)) === modalSelectedChapter);
      setModalLOs(uniqueByKey(filtered, loKeyOf));
    } else {
      setModalLOs([]);
    }
  }, [modalSelectedChapter, modalChapterLOs]);

  const fetchRepositoryImages = async (destination: "general" | "specific", target: any) => {
    setIsLoadingRepoImages(true);
    try {
      const { getKbAuthToken } = await import('@/lib/kb-auth');
      const token = await getKbAuthToken();
      // Built with the same helper the upload uses, so the folder being listed and
      // the folder written to can never disagree.
      const listChapterObj = modalSelectedChapter !== "all"
        ? modalChapters.find(c => String(chapterKeyOf(c)) === modalSelectedChapter)
        : null;
      const listLoObj = (modalSelectedChapter !== "all" && modalSelectedLO !== "all")
        ? modalLOs.find(l => String(loKeyOf(l)) === modalSelectedLO)
        : null;

      // Customer / Organisation is the top of the blob hierarchy; with none known the
      // prefix is empty and the path is exactly what it was before.
      const { custCode: imageCustCode, orgCode: imageOrgCode } = resolveImageScope();
      const folderPath = buildImageFolderPath({
        custCode: imageCustCode,
        orgCode: imageOrgCode,
        destination,
        bookName: resolveImageBookName(target),
        chapterName: modalSelectedChapter !== "all"
          ? String(listChapterObj ? chapterNameOf(listChapterObj) : modalSelectedChapter)
          : '',
        loName: listLoObj ? String(loNameOf(listLoObj)) : '',
      });

      // Reads the Customer/Organisation folder AND the unscoped one older images were
      // written to, merged — so nothing that is visible today disappears.
      setRepositoryImages(await listScopedImages(token, {
        destination,
        bookName: resolveImageBookName(target),
        chapterName: modalSelectedChapter !== "all"
          ? String(listChapterObj ? chapterNameOf(listChapterObj) : modalSelectedChapter)
          : '',
        loName: listLoObj ? String(loNameOf(listLoObj)) : '',
      }));
    } catch (e) {
      console.error(e);
      setRepositoryImages([]);
    } finally {
      setIsLoadingRepoImages(false);
    }
  };

  const handleOpenImageSelect = (q: any) => {
    setImageSelectTarget(q);
    // Open on the question's own book/chapter folder. Defaulting to "General
    // Images" listed the shared cross-book pool, so images from other subjects
    // and chapters showed up in the picker.
    setImageSelectDestination("specific");
    setModalSelectedChapter(resolveModalChapterKey(q));
    setModalSelectedLO("all");
    setSelectedRepoImage("");
    setSelectedRepoImages([]);
    setImageUploadError("");
    setIsImageSelectModalOpen(true);
    // The effect below refetches once the modal state settles.
  };

  useEffect(() => {
    if (isImageSelectModalOpen && imageSelectTarget) {
      fetchRepositoryImages(imageSelectDestination, imageSelectTarget);
      setSelectedRepoImage("");
    }
    // modalChapters / modalLOs are dependencies because the folder path is built from
    // the chapter and LO *names*, which are looked up in those lists. They load
    // asynchronously after the modal opens, so without them the first listing used the
    // raw chapter code and no LO at all — an empty folder — and never refreshed once
    // the real names arrived.
  }, [imageSelectDestination, isImageSelectModalOpen, imageSelectTarget, modalSelectedChapter, modalSelectedLO, modalChapters, modalLOs]);

  /**
   * Stages image(s) onto the question being edited, keeping whatever is already
   * attached. Shared by "Apply Selected Image" and by a local upload, so both
   * routes behave identically. Committed to the question on "Save Changes".
   */
  const stageImagesForEdit = (urls: string[]) => {
    const incoming = (urls || []).map(u => String(u || '').trim()).filter(Boolean);
    if (incoming.length === 0) return;
    // Merge with the already-attached/staged images so the previous one is kept.
    // Once the images have been edited, the staged list is the whole truth — an
    // empty one means the user deleted every image. Testing `regeneratedImages.length`
    // could not tell that apart from "nothing staged yet", so it fell through to the
    // question's stored images and merged a just-deleted image back in.
    const existing = imagesEdited
      ? regeneratedImages
      : (Array.isArray((imageSelectTarget as any)?.generatedImages) && (imageSelectTarget as any).generatedImages.length
        ? (imageSelectTarget as any).generatedImages
        : (regeneratedImageUrl
          ? [regeneratedImageUrl]
          : ((imageSelectTarget as any)?.generatedImageUrl ? [(imageSelectTarget as any).generatedImageUrl] : [])));
    const merged = Array.from(new Set([...existing, ...incoming]));
    setRegeneratedImages(merged);
    setRegeneratedImageUrl(merged[0] || "");
    setStagedImageType(1); // manually uploaded / selected from the repository
    setImagesEdited(true);
  };

  const handleImageSelectSubmit = async () => {
    if (!imageSelectTarget || selectedRepoImages.length === 0) return;
    try {
      // Store the picture itself where the bytes can be read, so the Word/Excel
      // exports embed it instead of falling back to a link.
      stageImagesForEdit(await toEmbeddableImages(selectedRepoImages));
    } catch (e) {
      console.error(e);
    } finally {
      setIsImageSelectModalOpen(false);
      setImageSelectTarget(null);
      setSelectedRepoImage("");
      setSelectedRepoImages([]);
    }
  };

  const handleOpenImageRegenerate = (q: any) => {
    setImageRegenerateTarget(q);
    setImageInstructionText("");
    setIsImageInstructionModalOpen(true);
  };

  const handleRegenerateImageSubmit = async () => {
    if (!imageRegenerateTarget || !imageInstructionText.trim()) return;
    setIsRegeneratingImage(true);
    try {
      const { imageUrl: newImageUrl, optionImages } = await regenerateQuestionImageWithOptions(
        imageRegenerateTarget, imageInstructionText,
      );
      // Option images (Multiple Choice / Multiple Response) travel with the question.
      if (optionImages.length > 0) {
        imageRegenerateTarget.optionImages = optionImages;
        setRegeneratedOptionImages(optionImages);
      }
      if (newImageUrl) {
        imageRegenerateTarget.generatedImageUrl = newImageUrl;
        if (imageRegenerateTarget.generated_image) {
          imageRegenerateTarget.generated_image = newImageUrl.split(',')[1] || newImageUrl;
        }
        setRegeneratedImageUrl(newImageUrl);
        setRegeneratedImages([newImageUrl]);
        setStagedImageType(0); // produced by /generate-image
        setImagesEdited(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRegeneratingImage(false);
      setIsImageInstructionModalOpen(false);
      setImageInstructionText("");
      setImageRegenerateTarget(null);
    }
  };

  // Store the original question data
  const [originalQuestion, setOriginalQuestion] = useState<any>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);

  const [questionType, setQuestionType] = useState(
    question?.type || (question?.[2]?.type) || 'Multiple Choice'
  );
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [formData, setFormData] = useState<FormData>({
    questionStem: '',
    options: ['', '', '', ''],
    correctAnswer: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [validationMessage, setValidationMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info' | '';
    details?: {
      reasoning?: string;
      items?: Array<{
        item: string;
        status: 'PASS' | 'FAIL';
        details: string;
      }>;
      conclusion?: string;
    };
  }>({ text: '', type: '' });
  const [isValidating, setIsValidating] = useState(false);
  const [editQuestion, setEditQuestion] = useState<any>(null);
  const [editAnswer, setEditAnswer] = useState<any>(null);
  const [editingFields, setEditingFields] = useState<Record<string, boolean>>({});
  const [editingTable, setEditingTable] = useState<TableAnalysisData | null>(null);
  const [editTableSortColumn, setEditTableSortColumn] = useState<string>('S.no');
  const [editingTabs, setEditingTabs] = useState<any[]>([]);
  const [editingPassageTabIndex, setEditingPassageTabIndex] = useState(0);

  // Select the Blank / Fill In the Blank Dropdown share the fill-in-the-blank layout
  // but render a read-only option list instead of a free-text answer.
  // The data check wins outright: it only returns true when the question actually has a
  // [DropdownN] token or a DropdownOptions list, which a plain Fill In the Blank never has.
  // The stored `type` can legitimately read "Fill In the Blank"/"FIB" for these items, so
  // gating on it would misclassify them.
  const isSelectTheBlankQuestion = isFillBlankDropdownQuestion(question)
    || ((String(questionType).toLowerCase().includes('select the blank')
      || String(questionType).toLowerCase().includes('fill in the blank dropdown')
      || String(questionType).toLowerCase().includes('fill-in-the-blank-dropdown'))
      && String(questionType).toLowerCase() !== 'fill in the blank'
      && String(questionType).toLowerCase() !== 'fill-blank');

  const toggleEdit = (field: string, isEditing: boolean) => {
    if (!isEditing) {
      setFormData(prev => {
        const updated = { ...prev };
        if (field === 'questionStem' && typeof updated.questionStem === 'string') {
          updated.questionStem = updated.questionStem.replace(/&nbsp;/gi, ' ');
        } else if (field.startsWith('option-')) {
          const idx = parseInt(field.replace('option-', ''), 10);
          if (!isNaN(idx) && Array.isArray(updated.options) && typeof updated.options[idx] === 'string') {
            const newOptions = [...updated.options];
            newOptions[idx] = newOptions[idx].replace(/&nbsp;/gi, ' ');
            updated.options = newOptions;
          }
        } else if (field in updated && typeof (updated as any)[field] === 'string') {
          (updated as any)[field] = (updated as any)[field].replace(/&nbsp;/gi, ' ');
        }
        return updated;
      });

      setMatrixEdit(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          questionStatement: prev.questionStatement ? prev.questionStatement.replace(/&nbsp;/gi, ' ') : prev.questionStatement
        };
      });
    }
    setEditingFields(prev => ({ ...prev, [field]: isEditing }));
  };

  // Ref to track cursor position in contentEditable
  const questionStemRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const answerRefs = useRef<(HTMLDivElement | null)[]>([]);


  const insertRawFromClipboard = React.useCallback((e: React.ClipboardEvent<HTMLElement>) => {
    try {
      e.preventDefault();
      const clipboard = e.clipboardData;
      const rawText = clipboard?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, rawText);

      // Keep selection + state in sync after paste.
      const target = e.currentTarget as HTMLElement;
      if (target) {
        if (target.id === 'question') setEditQuestion(target.innerHTML);
        if (target.id === 'answer') setEditAnswer(target.innerHTML);
      }
    } catch {
      // fallback: let the browser paste
    }
  }, [setEditAnswer, setEditQuestion]);

  useEffect(() => {
    if (!open) setShowKeyboard(false);
  }, [open]);

  // Matrix edit local state (for Matrix format questions)
  // const [matrixEdit, setMatrixEdit] = useState({
  //   questionStatement: '',
  //   partPrompt: '',
  //   rows: [] as string[],
  //   columns: [] as string[],
  //   answers: [] as number[],
  //   feedbacks: [] as string[]
  // });

  // Initialize form data when the modal opens or when the question changes
  useEffect(() => {
    if (open && question) {
      // Store the original question data
      setOriginalQuestion(question);

      const type = questionData.type || question.type || 'Multiple Choice';
      setQuestionType(type);

      const points = getKeyPointsFromQuestion(question);
      setKeyPoints(points.length > 0 ? points : type === 'Written Response' ? [''] : []);

      const isTF = String(type).toLowerCase().includes('true false');
      // Select the Blank shares Fill In the Blank's form shape (single correct answer +
      // per-option feedback), so it must satisfy the same initialisation branches.
      const isBlankLike = String(type).toLowerCase().includes('fill in the blank')
        || String(type).toLowerCase().includes('select the blank')
        || isFillBlankDropdownQuestion(questionData)
        || isFillBlankDropdownQuestion(question);

      let cleanedOptions: string[] = [];
      let baseCorrect: string = "";
      let feedbackA: string = "", feedbackB: string = "";

      if (isTF) {
        // For display, strip prefixes from options - show just "True" and "False"
        cleanedOptions = ["True", "False"];
        // Strip prefix from correct answer for display
        if (typeof questionData.CorrectAnswer === "string") {
          if (questionData.CorrectAnswer === "A. True" || questionData.CorrectAnswer === "B. False") {
            baseCorrect = questionData.CorrectAnswer.replace(/^[A-B]\.\s*/, '');
          } else if (questionData.CorrectAnswer === "True" || questionData.CorrectAnswer === "False") {
            baseCorrect = questionData.CorrectAnswer;
          } else if (Array.isArray(questionData.values) && questionData.values.includes(questionData.CorrectAnswer)) {
            baseCorrect = questionData.CorrectAnswer.replace(/^[A-B]\.\s*/, '');
          } else {
            baseCorrect = questionData.CorrectAnswer === true ? "True" : "False";
          }
        } else {
          baseCorrect = questionData.CorrectAnswer === true ? "True" : "False";
        }
        feedbackA = questionData.FeedbackOptionA || "";
        feedbackB = questionData.FeedbackOptionB || "";
      } else {
        let rawOptions = [];
        if (Array.isArray(questionData.values)) {
          rawOptions = [...questionData.values];
        } else if (Array.isArray(question?.[2]?.values)) {
          rawOptions = [...question[2].values];
        } else if (Array.isArray(questionData.options)) {
          rawOptions = [...questionData.options];
        } else if (Array.isArray(questionData.Options)) {
          rawOptions = [...questionData.Options];
        } else if (Array.isArray(question.options)) {
          rawOptions = [...question.options];
        } else if (Array.isArray(question.Options)) {
          rawOptions = [...question.Options];
        } else if (Array.isArray(question.values)) {
          rawOptions = [...question.values];
        } else {
          rawOptions = [
            questionData.OptionA || '',
            questionData.OptionB || '',
            questionData.OptionC || '',
            questionData.OptionD || ''
          ];
        }
        // Ensure we have at least 4 empty strings for the form if needed
        while (rawOptions.length < 4) {
          rawOptions.push('');
        }
        cleanedOptions = rawOptions.map(opt => cleanOptionText(opt));
        if (String(type).toLowerCase().includes('multiple response')) {
          try {
            const marks = JSON.parse(questionData.marks || '{}');
            baseCorrect = Object.keys(marks).filter(key => marks[key] === 1).join(', ');
          } catch (e) {
            baseCorrect = '';
          }
        } else {
          let correctAnswer = cleanOptionText(questionData.CorrectAnswer || questionData.answer || questionData.correctanswer || questionData.correct || question.CorrectAnswer || question.answer || question.correctanswer || question.correct || '');
          if (!correctAnswer && questionData.marks) {
            try {
              const marks = JSON.parse(questionData.marks);
              const correctKey = Object.keys(marks).find(key => marks[key] === 1);
              if (correctKey) {
                const correctIndex = correctKey.charCodeAt(0) - 'A'.charCodeAt(0);
                if (cleanedOptions[correctIndex]) {
                  correctAnswer = cleanedOptions[correctIndex];
                }
              }
            } catch (e) { }
          }
          baseCorrect = correctAnswer;
        }
      }

      const initialFormData: any = {
        // Prefer label for editable text binding
        // With passage tabs the label holds the whole multi-tab blob (tab titles and every
        // passage), so the editable stem is the PartPrompt instead.
        questionStem: (() => {
          if (getQuestionTabs(questionData).length > 0 && String(questionData.PartPrompt ?? questionData.partPrompt ?? '').trim()) {
            return String(questionData.PartPrompt ?? questionData.partPrompt).trim();
          }
          let baseLabel = String(questionData.label ?? questionData.QuestionStatement ?? questionData.text ?? questionData.question ?? questionData.stem ?? questionData.QuestionText ?? question.label ?? question.question ?? '').trim();

          // Collapse duplicated stem text (see dedupeRepeatedText)
          baseLabel = dedupeRepeatedText(baseLabel);
          const half1 = baseLabel.substring(0, Math.floor(baseLabel.length / 2)).trim();
          const half2 = baseLabel.substring(Math.floor(baseLabel.length / 2)).trim();
          if (half1.length > 10 && half1 === half2) {
            baseLabel = half1;
          }

          return baseLabel;
        })(),
        options: cleanedOptions,
        correctAnswer: isTF ? baseCorrect : baseCorrect,
      };

      if (isTF) {
        initialFormData.FeedbackOptionA = feedbackA;
        initialFormData.FeedbackOptionB = feedbackB;
      } else if (type === 'Multiple Choice' || isBlankLike || String(type).toLowerCase().includes('multiple response')) {
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach(letter => {
          const feedbackKey = `FeedbackOption${letter}`;
          initialFormData[feedbackKey] = questionData[feedbackKey] || question[feedbackKey] || '';
        });
        if (isBlankLike) {
          initialFormData.correctAnswer = questionData.CorrectAnswer || (Array.isArray(questionData.values) && questionData.values[0]) || questionData.answer || '';
        } else if (String(type).toLowerCase().includes('multiple response')) {
          let correctAnswers = [];
          try {
            // First try to parse as JSON string
            if (typeof questionData.CorrectAnswer === 'string' && questionData.CorrectAnswer.trim().startsWith('[')) {
              correctAnswers = JSON.parse(questionData.CorrectAnswer);
            }
            // If not a JSON array, try to get from marks
            else if (questionData.marks) {
              try {
                const marks = JSON.parse(questionData.marks || '{}');
                correctAnswers = Object.entries(marks)
                  .filter(([_, value]) => value === 1)
                  .map(([key]) => {
                    const index = key.charCodeAt(0) - 'A'.charCodeAt(0);
                    return cleanedOptions[index] || '';
                  })
                  .filter(Boolean);
              } catch (e) {
                console.error('Error parsing marks:', e);
              }
            }
            // If still no answers, try to get from values array
            if (!correctAnswers.length && Array.isArray(questionData.values)) {
              correctAnswers = (questionData.CorrectAnswer || '')
                .split(',')
                .map((a: string) => a.trim())
                .filter(Boolean);
            }
          } catch (e) {
            console.error('Error parsing correct answers:', e);
            correctAnswers = [];
          }
          initialFormData.correctAnswer = Array.isArray(correctAnswers) ? correctAnswers.join('|||') : '';
        }
      } else if (type === 'Written Response' && (questionData.correctAnswer || questionData.ModelAnswer)) {
        initialFormData.correctAnswer = questionData.correctAnswer || questionData.ModelAnswer;
      }

      setFormData(initialFormData);
      setErrors({});
      setValidationMessage({ text: '', type: '' }); // Clear validation message when modal opens
      const tableData = getTableAnalysis(questionData);
      setEditingTable(tableData ? JSON.parse(JSON.stringify(tableData)) : null);
      setEditTableSortColumn('S.no');
      const tabsData = getQuestionTabs(questionData);
      setEditingTabs(tabsData.length ? JSON.parse(JSON.stringify(tabsData)) : []);
      setEditingPassageTabIndex(0);
    }
  }, [open, question]);

  // Function to clean option text by removing any letter prefixes (A., B., etc.)
  const cleanOptionText = (text: any): string => {
    if (!text || typeof text !== 'string') return '';
    // Remove any leading letter followed by a dot and space (e.g., "A. ")
    return text.replace(/^[A-Za-z]\.\s*/, '');
  };

  // Handle validation
  const handleValidate = async () => {
    // Add blur effect to the modal
    const modal = document.querySelector('[role="dialog"]');
    if (modal) {
      modal.classList.add('backdrop-blur-sm');
    }

    // Clear any previous messages
    setValidationMessage({ text: '', type: '' });
    setErrors({}); // Clear all errors

    // Force a re-render to ensure the message is cleared
    await new Promise(resolve => setTimeout(resolve, 0));

    // Use existing validateForm function to check all validation rules
    // Pass true to enable all validation including feedback validation
    const isValid = validateForm(true);

    if (!isValid) {
      setValidationMessage({
        text: 'Validation failed: Please check the form for errors.',
        type: 'error'
      });
      return;
    }

    // If we get here, basic validation passed
    setIsValidating(true);

    try {
      // Prepare the question data for validation
      const questionForValidation = { ...question };

      // Update the question data with the current form values
      questionForValidation[2] = {
        ...questionForValidation[2],
        label: formData.questionStem,
        QuestionStatement: formData.questionStem,
        CorrectAnswer: formData.correctAnswer,
        values: formData.options,
        // Add feedback fields if they exist
        ...(formData.FeedbackOptionA && { FeedbackOptionA: formData.FeedbackOptionA }),
        ...(formData.FeedbackOptionB && { FeedbackOptionB: formData.FeedbackOptionB }),
        ...(formData.FeedbackOptionC && { FeedbackOptionC: formData.FeedbackOptionC }),
        ...(formData.FeedbackOptionD && { FeedbackOptionD: formData.FeedbackOptionD }),
      };

      // Prepare the payload for the validation API

      const payload = {
        url: questionForValidation[12] === '1' ? (questionForValidation[10]?.bookpath || '').replace(/\n/g, '').replace('IIC/', '') : '',
        question: JSON.stringify(questionForValidation[2]),
        source: questionForValidation[12] === '1' ? 'Book Based' : 'LLM',
        custcode: sessionStorage.getItem('custcode'),
        orgcode: sessionStorage.getItem('orgcode'),
        usercode: sessionStorage.getItem('userCode'),
        appcode: sessionStorage.getItem('appcode'),
        booknameid: questionForValidation[10]?.id || 0,
        bookname: questionForValidation.bookname || '',
        questiontypename: questionForValidation.type || '',
        questiontypeid: questionForValidation[5] || 0,
        taxonomyid: questionForValidation[8] ? parseInt(questionForValidation[8]) : 0,
        difficultylevelid: questionForValidation[14] || '1',
        chaptercode: questionForValidation[11] || '',
        looutcomes: questionForValidation[9] || '',
        sourcetype: Number(questionForValidation[12] || 1),
        referenceinfo: "",
        noofquestions: 1,
        creativitylevel: questionForValidation[14] || '1',
        agentname: "Retrieval",
        agent_status: "1",
        Rating: "",
        Rating_Feedback: "",
        job_id: sessionStorage.getItem('job_id') || null,
        kbname: (questionForValidation.study || '').replace(/,/g, '').replace(/:/g, '').replace(/\s+/g, '_'),
        sourcename: questionForValidation.bookname,
        validate_content: 'Yes',
        taxonomyname: (questionForValidation.taxonomy || '').toUpperCase(),
        task_content: "",
        question_type: questionForValidation.type || ''
      };

      console.log('Validation Payload:', payload);

      // First call to /retrieval to get the job_id
      const retrievalResponse = await axios.post(
        `${AGENT_GENERATIVE_API_URL}/retrieval`,
        payload
      );

      const jobId = retrievalResponse.data.job_id;

      // Second call to /compliance with the new job_id
      const compliancePayload = { ...payload, job_id: jobId };
      const response = await axios.post(
        `${AGENT_GENERATIVE_API_URL}/compliance`,
        compliancePayload
      );

      console.log('Validation Response:', response.data);

      if (response.data && response.data.compliant_content) {
        let content;

        // Handle different response formats
        if (response.data.compliant_content.choices && response.data.compliant_content.choices[0]) {
          // ChatCompletion response format
          content = response.data.compliant_content.choices[0].message.content;
        } else if (typeof response.data.compliant_content === 'string') {
          // Direct string response
          content = response.data.compliant_content;
        } else {
          content = JSON.stringify(response.data.compliant_content);
        }

        content = content.replace(/\\n/g, '\n');
        console.log('Raw validation content:', content);

        // Extract the main validation result
        const validationResultMatch = content.match(/VALIDATION_RESULT:\s*([^\n]+)/i);
        const validationResult = validationResultMatch ? validationResultMatch[1].trim() : 'Validation completed';

        // Extract reasoning section
        const reasoningMatch = content.match(/REASONING:\s*([\s\S]*?)(?=---|\n\w|$)/i);
        const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';

        // Extract individual validation items
        const validationItems = [];
        const itemRegex = /([^:]+):\s*(PASS|FAIL)\s*\(([^)]+)\)/gi;
        let match;

        console.log('Attempting to parse validation items from content:', content);

        while ((match = itemRegex.exec(content)) !== null) {
          const [, item, status, details] = match;
          console.log('Found validation item:', { item, status, details });
          validationItems.push({
            item: item.trim(),
            status: status.trim(),
            details: details.trim()
          });
        }

        console.log('Total validation items found:', validationItems.length);

        // Extract conclusion if available
        const conclusionMatch = content.match(/Conclusion:([\s\S]*?)(?=\n\w|$)/i);
        const conclusion = conclusionMatch ? conclusionMatch[1].trim() : '';

        // Determine if the overall validation passed or failed
        const hasFailures = validationItems.some(item => item.status === 'FAIL');
        const validationType = hasFailures ? 'error' : 'success';

        // Set validation message with structured data
        setValidationMessage({
          text: validationResult,
          type: validationType,
          details: {
            reasoning,
            items: validationItems,
            conclusion
          }
        });
      } else {
        throw new Error('Invalid response from validation service');
      }
    } catch (error) {
      console.error('Validation error:', error);
      setValidationMessage({
        text: error.response?.data?.message || 'Error during validation. Please try again.',
        type: 'error'
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Scroll to errors when they occur
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      // Small delay to ensure the DOM is updated with error states
      const timer = setTimeout(() => {
        let firstErrorElement = null;

        // Check for question stem error
        if (errors.questionStem) {
          firstErrorElement = document.querySelector('#question-stem');
        }
        // Check for option errors (for multiple choice)
        else if (errors.options && errors.options.some(err => err)) {
          const firstErrorIndex = errors.options.findIndex(err => err);
          if (firstErrorIndex !== -1) {
            firstErrorElement = document.querySelector(`#option-${firstErrorIndex}`);
          }
        }
        // Check for correct answer error (for both MC and written response)
        else if (errors.correctAnswer) {
          // Check for written response contentEditable first
          firstErrorElement = document.querySelector('[data-correct-answer-editor]') ||
            document.querySelector('#correct-answer-textarea') ||
            document.querySelector('#correct-answer-select');
        }
        // Check for key points errors
        else if (errors.keyPoints && errors.keyPoints.some(kp => kp)) {
          const firstErrorIndex = errors.keyPoints.findIndex(kp => kp);
          if (firstErrorIndex !== -1) {
            firstErrorElement = document.querySelector(`#key-point-${firstErrorIndex}`);
          }
        }

        // Fallback to more generic selectors if specific element not found
        if (!firstErrorElement) {
          firstErrorElement = document.querySelector('.border-red-500, [class*="border-red-500"], .text-red-500');
        }

        // Scroll to the error element if found
        if (firstErrorElement) {
          firstErrorElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
          // Focus the element for better accessibility
          (firstErrorElement as HTMLElement)?.focus();
        }
      }, 100); // Small delay to ensure DOM is updated

      return () => clearTimeout(timer);
    }
  }, [errors]);

  // Handle dialog close
  const handleClose = () => {
    // Reset to original data when closing without saving
    if (originalQuestion) {
      const type = originalQuestion.type || 'Multiple Choice';
      setQuestionType(type);

      const points = getKeyPointsFromQuestion(originalQuestion);
      setKeyPoints(points.length > 0 ? points : type === 'Written Response' ? [''] : []);

      const rawOptions = Array.isArray(originalQuestion.values) ? [...originalQuestion.values] :
        (Array.isArray(originalQuestion.options) ? [...originalQuestion.options] : ['', '', '', '']);
      const cleanedOptions = rawOptions.map(opt => cleanOptionText(opt));

      const initialFormData: any = {
        questionStem: originalQuestion.label || originalQuestion.QuestionStatement || originalQuestion.question || '',
        options: cleanedOptions,
        correctAnswer: cleanOptionText(originalQuestion.CorrectAnswer || originalQuestion.answer || ''),
      };

      if (type === 'Multiple Choice') {
        ['A', 'B', 'C', 'D'].forEach(letter => {
          const feedbackKey = `FeedbackOption${letter}`;
          initialFormData[feedbackKey] = originalQuestion[feedbackKey] || '';
        });
      } else if (type === 'Written Response' && (originalQuestion.correctAnswer || originalQuestion.ModelAnswer)) {
        initialFormData.correctAnswer = originalQuestion.correctAnswer || originalQuestion.ModelAnswer;
      }

      setFormData(initialFormData);
    }

    // Close the dialog
    onClose();
  };

  // Handle adding a new key point
  // const addKeyPoint = () => {
  //   // Only add a new key point if the last one isn't empty
  //   if (keyPoints.length === 0 || keyPoints[keyPoints.length - 1].trim() !== '') {
  //     setKeyPoints([...keyPoints, '']);
  //   }
  // };
  // Matrix edit local state (for Matrix format questions)
  const [matrixEdit, setMatrixEdit] = useState({
    questionStatement: '',
    partPrompt: '',
    label: '',
    rows: [] as string[],
    columns: [] as string[],
    answers: [] as number[],
    feedbacks: [] as string[]
  });

  // Populate matrix state when modal opens or question changes
  useEffect(() => {
    if (!open || !question) return;
    try {
      const q = (question as any) || {};
      const qd = (question as any)[2] || q;
      const parseArr = (v: any) => {
        if (Array.isArray(v)) return v;
        if (typeof v === 'string') {
          try {
            const p = JSON.parse(v);
            return Array.isArray(p) ? p : [];
          } catch { return []; }
        }
        return [];
      };
      const rowsRaw = parseArr(qd.rows);
      const colsRaw = parseArr(qd.columns);
      const ansRaw = parseArr(qd.CorrectAnswer);
      const fbsRaw = parseArr((qd as any).Feedbacks);
      const rows = rowsRaw.map((r: any) => typeof r === 'string' ? r : (r?.text || ''));
      const cols = colsRaw.map((c: any) => typeof c === 'string' ? c : (c?.text || ''));
      let answers = ansRaw.map((a: any) => Number(a));
      let feedbacks = fbsRaw.map((f: any) => String(f));
      // Ensure arrays align to rows length
      if (answers.length < rows.length) {
        answers = [...answers, ...Array(rows.length - answers.length).fill(Math.min(0, cols.length - 1))];
      } else if (answers.length > rows.length) {
        answers = answers.slice(0, rows.length);
      }
      if (feedbacks.length < rows.length) {
        feedbacks = [...feedbacks, ...Array(rows.length - feedbacks.length).fill('')];
      } else if (feedbacks.length > rows.length) {
        feedbacks = feedbacks.slice(0, rows.length);
      }
      setMatrixEdit({
        // Prefer label for displayed question text, including the PartPrompt
        questionStatement: String(qd.label || qd.QuestionStatement || qd.text || qd.question || '').trim(),
        partPrompt: String(qd.PartPrompt || ''),
        label: String(qd.label || qd.QuestionStatement || qd.question || ''),
        rows,
        columns: cols,
        answers,
        feedbacks
      });
    } catch { }
  }, [open, question]);

  // If question is not available, render nothing (after hooks to keep order stable)
  if (!question) return null;

  // Handle updating a key point
  const updateKeyPoint = (index: number, value: string) => {
    const newKeyPoints = [...keyPoints];
    newKeyPoints[index] = value;

    // If key point is being cleared and it's last one, keep it as an empty field
    // Don't remove the entire element - allow users to re-enter text
    setKeyPoints(newKeyPoints);

    // Clear any key points errors when user types
    if (errors.keyPoints) {
      setErrors(prev => ({
        ...prev,
        keyPoints: undefined
      }));
    }
  };

  // Handle input changes
  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (field.startsWith('FeedbackOption') && errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    } else if (field === 'options' && errors.options) {
      // For options, we need to clear the entire options error array
      const newErrors = { ...errors };
      delete newErrors.options;
      setErrors(newErrors);
    } else if (errors[field as keyof typeof errors]) {
      // For other fields
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  // Handle option changes
  // Select the Blank stores its correct answer as the option's text rather than a
  // letter, so renaming the correct option has to rename the stored answer too —
  // otherwise it no longer matches any option and the question saves with an answer
  // that cannot be selected.
  const handleSelectBlankOptionChange = (index: number, value: string) => {
    const previous = String(formData.options?.[index] ?? '').trim();
    const currentAnswer = String(formData.correctAnswer || '').trim();
    const wasCorrect = !!previous && previous.toLowerCase() === currentAnswer.toLowerCase();

    handleOptionChange(index, value);

    if (wasCorrect) {
      // handleOptionChange strips a leading "A. " prefix, so mirror that here.
      handleInputChange('correctAnswer', value.replace(/^[A-Za-z]\.\s*/, ''));
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    // For other question types, clean the input value by removing any letter prefixes
    const cleanedValue = value.replace(/^[A-Za-z]\.\s*/, '');

    const newOptions = [...formData.options];
    newOptions[index] = cleanedValue;

    // Update form data
    setFormData(prev => ({
      ...prev,
      options: newOptions
    }));

    // Clear the specific option error if it exists
    if (errors.options?.[index]) {
      const newOptionErrors = [...(errors.options || [])];
      newOptionErrors[index] = '';

      // If all option errors are cleared, remove the options from errors
      if (newOptionErrors.every(err => !err)) {
        const newErrors = { ...errors };
        delete newErrors.options;
        setErrors(newErrors);
      } else {
        setErrors(prev => ({
          ...prev,
          options: newOptionErrors
        }));
      }
    }

    // Sync correct answer text if this option was the selected correct answer
    setFormData(prev => {
      const currentCorrect = prev.correctAnswer || '';
      // If currentCorrect matches this option (case-insensitive), update it
      if (currentCorrect && currentCorrect.trim().toLowerCase() === cleanedValue.trim().toLowerCase()) {
        // no change needed
        return prev;
      }

      // If the previous correct answer matched the old option value, replace it with the new one
      const oldOption = prev.options[index] || '';
      if (oldOption && currentCorrect && oldOption.trim().toLowerCase() === currentCorrect.trim().toLowerCase()) {
        const updatedCorrect = cleanedValue;
        return { ...prev, correctAnswer: updatedCorrect };
      }

      return prev;
    });
  };

  // Validate form
  const validateForm = (isSaving = false): boolean => {
    const newErrors: FormErrors = {};
    let isValid = true;

    // Skip validation if we're not saving (just opening the dialog)
    if (!isSaving) {
      return true;
    }

    // Validate question stem
    if (String(questionType).toLowerCase().includes('matrix')) {
      // For Matrix questions, validate matrixEdit.questionStatement
      if (!matrixEdit.questionStatement.trim()) {
        newErrors.questionStem = 'Question stem is required';
      }
    } else {
      // For other question types, validate formData.questionStem
      if (!formData.questionStem.trim()) {
        newErrors.questionStem = 'Question stem is required';
      }
    }

    // Validate key points for written response
    if (questionType === 'Written Response' && keyPoints.length > 0) {
      const keyPointErrors: string[] = [];
      const seen = new Set<string>();
      let hasEmpty = false;

      keyPoints.forEach((point, index) => {
        const trimmed = point.trim();
        if (trimmed === '') {
          keyPointErrors[index] = 'Key point cannot be empty';
          hasEmpty = true;
        } else if (seen.has(trimmed.toLowerCase())) {
          keyPointErrors[index] = 'Duplicate key point';
        } else {
          seen.add(trimmed.toLowerCase());
        }
      });

      if (hasEmpty || keyPointErrors.length > 0) {
        newErrors.keyPoints = keyPointErrors;
      }
    }

    // Add this after the Multiple Choice validation block and before the final validation checks
    else if (questionType === 'Fill In the Blank' || questionType === 'Fill in the Blank') {
      // Get the question stem and correct answer
      const questionStem = formData.questionStem.trim().toLowerCase();
      const correctAnswer = formData.correctAnswer.trim();

      // Check if question stem is empty
      if (!questionStem) {
        newErrors.questionStem = 'Question stem cannot be empty.';
      }

      // Check if correct answer is empty
      if (!correctAnswer) {
        newErrors.correctAnswer = 'Correct answer cannot be empty.';
      }

      // Check if question stem and correct answer are the same
      if (questionStem && correctAnswer && questionStem === correctAnswer.toLowerCase()) {
        newErrors.correctAnswer = 'Question stem and correct answer cannot be the same.';
      }

      // Check feedback textareas if they exist
      // Check feedback fields from form data instead of querying DOM
      const feedbacks = [
        formData.FeedbackOptionA,
        formData.FeedbackOptionB,
        formData.FeedbackOptionC,
        formData.FeedbackOptionD
        // Add more if you have more feedback options
      ];

      feedbacks.forEach((feedback, index) => {
        const feedbackText = (feedback || '').trim();

        if (feedbackText) {
          const feedbackKey = `FeedbackOption${String.fromCharCode(65 + index)}`;

          // Check if feedback is same as question stem (case-insensitive)
          if (feedbackText.toLowerCase() === questionStem) {
            newErrors[feedbackKey] = 'Feedback cannot be the same as the question stem.';
          }
          // Check if feedback is same as correct answer (case-insensitive)
          else if (feedbackText.toLowerCase() === correctAnswer.toLowerCase()) {
            newErrors[feedbackKey] = 'Feedback cannot be the same as the correct answer.';
          }
        }
      });
    }


    // For multiple choice questions
    const isMultipleResponse = String(questionType).toLowerCase().includes('multiple response');
    if (questionType === 'Multiple Choice' || isMultipleResponse) {
      const optionErrors: string[] = [];
      const uniqueOptions = new Map<string, number>(); // Track first occurrence of each option
      let hasEmptyOption = false;

      // Filter out empty options for validation
      const nonEmptyOptions = formData.options.filter(opt => opt.trim() !== '');

      // Check if we have at least 2 options
      if (nonEmptyOptions.length < 2) {
        formData.options.forEach((_, index) => {
          optionErrors[index] = 'At least 2 options are required';
        });
        hasEmptyOption = true;
      } else {
        // First pass: Check for empty options
        formData.options.forEach((opt, index) => {
          const trimmedOpt = opt.trim();
          if (!trimmedOpt) {
            optionErrors[index] = 'Option cannot be empty';
            hasEmptyOption = true;
          } else {
            // Store the first occurrence of this option (case-insensitive)
            const lowerOpt = trimmedOpt.toLowerCase();
            if (!uniqueOptions.has(lowerOpt)) {
              uniqueOptions.set(lowerOpt, index);
            }
          }
        });

        // Second pass: Check for duplicates (only if no empty options)
        if (!hasEmptyOption) {
          formData.options.forEach((opt, index) => {
            const trimmedOpt = opt.trim();
            if (trimmedOpt) {
              const lowerOpt = trimmedOpt.toLowerCase();
              const firstOccurrence = uniqueOptions.get(lowerOpt);
              if (firstOccurrence !== undefined && firstOccurrence !== index) {
                optionErrors[index] = 'Duplicate option';
              }
            }
          });
        }
      }
      // Inside the Multiple Choice validation block, after checking for empty options and duplicates,
      // and before validating the correct answer, add:

      // For Multiple Choice questions, check if any option is the same as the question stem
      const questionStem = formData.questionStem.trim().toLowerCase();
      formData.options.forEach((opt, index) => {
        const trimmedOpt = opt.trim();
        if (trimmedOpt && trimmedOpt.toLowerCase() === questionStem) {
          optionErrors[index] = 'Option cannot be the same as the Question Stem';
          hasEmptyOption = true; // This will prevent form submission
        }
      });

      // Validate correct answer for multiple choice or multiple response
      if (!formData.correctAnswer || !formData.correctAnswer.trim()) {
        newErrors.correctAnswer = isMultipleResponse ? 'At least one Correct Answer is Required' : 'Correct Answer cannot be Empty';
      } else {
        // Check if correct answer is the same as the question stem
        if (formData.correctAnswer.trim().toLowerCase() === questionStem) {
          newErrors.correctAnswer = 'Correct Answer cannot be the same as the Question Stem';
        }
      }


      // Only set options errors if there are any
      if (optionErrors.some(err => err)) {
        newErrors.options = optionErrors;
      }

      // Validate correct answer for multiple choice or multiple response
      if (!formData.correctAnswer || !formData.correctAnswer.trim()) {
        newErrors.correctAnswer = isMultipleResponse ? 'At least one correct answer is required' : 'Correct Answer cannot be empty';
      } else if (isMultipleResponse) {
        // For multiple response questions, split by comma and validate each answer
        const correctAnswers = formData.correctAnswer.split('|||').map(a => a.trim()).filter(Boolean);
        if (correctAnswers.length === 0) {
          newErrors.correctAnswer = 'At least one correct answer is required';
        } else if (correctAnswers.length < 2) {
          newErrors.correctAnswer = 'At least two correct answers are required for Multiple Response questions';
        } else if (nonEmptyOptions.length > 0) {
          // Create a mapping of option text (without prefix) to full option text
          const optionMap = new Map();
          nonEmptyOptions.forEach(opt => {
            // Remove the prefix (e.g., "A. ", "B. ") for comparison
            const text = opt.replace(/^[A-Z]\.\s*/, '').trim().toLowerCase();
            optionMap.set(text, opt);
          });

          // Check each correct answer against the options
          const invalidAnswers = [];
          const validAnswers = [];

          correctAnswers.forEach(ans => {
            // Remove any prefix from the answer for comparison
            const cleanAns = ans.replace(/^[A-Z]\.\s*/, '').trim().toLowerCase();
            if (!optionMap.has(cleanAns)) {
              invalidAnswers.push(ans);
            } else {
              // Store the properly formatted answer
              validAnswers.push(optionMap.get(cleanAns));
            }
          });

          if ((invalidAnswers.length > 0)) {
            newErrors.correctAnswer = `The following answers are not in the options`;
          } else {
            // Check for duplicate correct answers
            const uniqueCorrectAnswers = new Set(validAnswers.map(ans => ans.toLowerCase().trim()));
            if (uniqueCorrectAnswers.size !== validAnswers.length) {
              newErrors.correctAnswer = 'Correct answers must be unique';
            } else {
              // Update the correct answers to use the exact format from options
              // Handle both empty and non-empty cases
              if (validAnswers.length > 0) {
                handleInputChange('correctAnswer', validAnswers.join('|||'));
              } else {
                handleInputChange('correctAnswer', '');
              }
            }
          }
        }
      } else if (nonEmptyOptions.length > 0) {
        // For single correct answer
        const isAnswerValid = nonEmptyOptions.some(opt =>
          opt.trim().toLowerCase() === formData.correctAnswer.trim().toLowerCase()
        );

        if (!isAnswerValid) {
          newErrors.correctAnswer = 'Correct answer must match one of the options';
        }
      }

      // Validate feedback for each option
      const feedbackValues: string[] = [];
      const feedbackSuffixes: string[] = []; // Store only the suffix parts for duplicate checking
      for (let i = 0; i < formData.options.length; i++) {
        const optionLetter = String.fromCharCode(65 + i);
        const feedbackKey = `FeedbackOption${optionLetter}`;
        const feedback = formData[feedbackKey] || '';
        // Treat 'Correct.' or 'Incorrect.' (with no explanatory text) as empty
        const suffix = feedback.replace(/^(Correct\.|Incorrect\.)\s*/i, '').trim();
        if (!suffix) {
          newErrors[feedbackKey] = 'Feedback cannot be empty';
        }
        feedbackValues.push(feedback.trim().toLowerCase());
        feedbackSuffixes.push(suffix.toLowerCase());
      }




      // Inside the Multiple Choice validation block, after the existing feedback validation, add:

      // Check if any feedback is the same as any option
      for (let i = 0; i < formData.options.length; i++) {
        const optionLetter = String.fromCharCode(65 + i);
        const feedbackKey = `FeedbackOption${optionLetter}`;
        const feedback = formData[feedbackKey] || '';
        const currentOption = formData.options[i]?.trim().toLowerCase();

        // Only check non-empty feedback and options
        if (feedback && currentOption) {
          // Get just the feedback text without "Correct." or "Incorrect." prefix
          const feedbackText = feedback.replace(/^(Correct\.|Incorrect\.)\s*/i, '').trim().toLowerCase();

          // Check if feedback is the same as its corresponding option
          if (feedbackText === currentOption) {
            newErrors[feedbackKey] = 'Feedback cannot be the same as the Option';
          }

          // Check if feedback is the same as the correct answer
          if (formData.correctAnswer && feedbackText === formData.correctAnswer.trim().toLowerCase()) {
            newErrors[feedbackKey] = 'Feedback cannot be the same as the Correct Answer';
          }
        }
      }

      // Also, check if any feedback is the same as the question stem
      for (let i = 0; i < formData.options.length; i++) {
        const optionLetter = String.fromCharCode(65 + i);
        const feedbackKey = `FeedbackOption${optionLetter}`;
        const feedback = formData[feedbackKey] || '';

        if (feedback) {
          const feedbackText = feedback.replace(/^(Correct\.|Incorrect\.)\s*/i, '').trim().toLowerCase();
          if (feedbackText === questionStem) {
            newErrors[feedbackKey] = 'Feedback cannot be the same as the Question Stem';
          }
        }
      }


      // Check for duplicate feedbacks (only non-empty feedbacks)
      const nonEmptyFeedbackSuffixes = feedbackSuffixes.filter(val => val);
      const feedbackCounts = nonEmptyFeedbackSuffixes.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (let i = 0; i < formData.options.length; i++) {
        const optionLetter = String.fromCharCode(65 + i);
        const feedbackKey = `FeedbackOption${optionLetter}`;
        const feedback = formData[feedbackKey] || '';
        const suffix = feedback.replace(/^(Correct\.|Incorrect\.)\s*/i, '').trim().toLowerCase();
        // Only check for duplicates if feedback is not empty
        if (suffix && feedbackCounts[suffix] > 1) {
          newErrors[feedbackKey] = 'Feedback cannot be duplicated';
        }
      }
    } else if (questionType === 'Written Response') {
      // Validate answer for written response
      const questionStem = formData.questionStem.trim().toLowerCase();
      const correctAnswer = formData.correctAnswer.trim().toLowerCase();

      // Check if any key point is the same as the question stem
      keyPoints.forEach((point, index) => {
        const trimmedPoint = point.trim().toLowerCase();
        if (trimmedPoint && trimmedPoint === questionStem) {
          newErrors.keyPoints = newErrors.keyPoints || [];
          newErrors.keyPoints[index] = 'Key point cannot be the same as the Question Stem';
        }
      });
      // Check if correct answer is the same as the question stem
      if (correctAnswer && correctAnswer === questionStem) {
        newErrors.correctAnswer = 'Correct answer cannot be the same as the Question Stem';
      }
      // Check if any key point is the same as the correct answer
      if (correctAnswer) {
        keyPoints.forEach((point, index) => {
          const trimmedPoint = point.trim().toLowerCase();
          if (trimmedPoint && trimmedPoint === correctAnswer) {
            newErrors.keyPoints = newErrors.keyPoints || [];
            newErrors.keyPoints[index] = 'Key point cannot be the same as the Correct Answer';
          }
        });
      }
      if (!formData.correctAnswer || !formData.correctAnswer.trim()) {
        newErrors.correctAnswer = 'Answer is required for Written Response';
      }
      // Check if question stem and correct answer are the same
      else if (formData.questionStem.trim().toLowerCase() === formData.correctAnswer.trim().toLowerCase()) {
        newErrors.correctAnswer = 'Question Stem and correct answer cannot be the same';
      }
    } else if (String(questionType).toLowerCase().includes('fill in the blank')) {
      if (!formData.correctAnswer || !formData.correctAnswer.trim()) {
        newErrors.correctAnswer = 'Correct answer is required';
      }
      if (!formData.FeedbackOptionA || !formData.FeedbackOptionA.trim()) {
        newErrors.FeedbackOptionA = 'Feedback is required';
      }
    } else if (String(questionType).toLowerCase().includes('true false')) {
      const optionErrors: string[] = [];
      const uniqueOptions = new Map<string, number>();
      const questionStem = formData.questionStem.trim().toLowerCase();


      formData.options.forEach((opt, index) => {
        const trimmedOpt = opt.trim();
        if (!trimmedOpt) {
          optionErrors[index] = 'Option cannot be empty';
        } else {
          const lowerOpt = trimmedOpt.toLowerCase();
          // Check if option is same as question stem
          if (lowerOpt === questionStem) {
            optionErrors[index] = 'Option cannot be the same as the Question Stem';
          }
          // Check for duplicate options
          if (!uniqueOptions.has(lowerOpt)) {
            uniqueOptions.set(lowerOpt, index);
          } else {
            optionErrors[index] = 'Duplicate option';
          }
        }
      });

      if (optionErrors.some(err => err)) {
        newErrors.options = optionErrors;
      }

      const correctAnswerInput = String(formData.correctAnswer || '').trim();
      if (!correctAnswerInput) {
        newErrors.correctAnswer = 'Correct answer is required';
      } else if (!formData.options.some(opt => opt.trim().toLowerCase() === correctAnswerInput.toLowerCase())) {
        newErrors.correctAnswer = 'Correct answer must match one of the options';
      } else if (correctAnswerInput.toLowerCase() === questionStem) {
        // Check if correct answer is same as question stem
        newErrors.correctAnswer = 'Correct answer cannot be the same as the Question Stem';
      }
      // Validate feedbacks for True/False questions
      const feedbackKeys = ['FeedbackOptionA', 'FeedbackOptionB'];
      feedbackKeys.forEach((feedbackKey, index) => {
        const feedback = formData[feedbackKey] || '';
        const feedbackText = feedback.replace(/^(Correct\.|Incorrect\.)/, '').trim();

        if (!feedbackText) {
          newErrors[feedbackKey] = 'Feedback cannot be empty';
        } else if (feedbackText.toLowerCase() === questionStem) {
          newErrors[feedbackKey] = 'Feedback cannot be the same as the question stem';
        } else if (feedbackText.toLowerCase() === correctAnswerInput.toLowerCase()) {
          newErrors[feedbackKey] = 'Feedback cannot be the same as the correct answer';
        }
      });
    }

    // Validate Matrix table rows and columns
    if (String(questionType).toLowerCase().includes('matrix')) {
      // Validate rows - ensure no empty rows
      const hasEmptyRows = matrixEdit.rows.some(row => !row || !row.trim());
      if (hasEmptyRows) {
        newErrors.matrixRows = 'All row labels are required';
      }

      // Validate columns - ensure no empty columns
      const hasEmptyColumns = matrixEdit.columns.some(col => !col || !col.trim());
      if (hasEmptyColumns) {
        newErrors.matrixColumns = 'All column labels are required';
      }

      const hasEmptyFeedback = matrixEdit.feedbacks.some(fb => !fb || !fb.trim());
      if (hasEmptyFeedback) {
        newErrors.matrixFeedbacks = 'All feedbacks are required';
      }


      // Validate that question stem and feedback are not the same
      const questionStem = matrixEdit.questionStatement?.trim().toLowerCase() || '';
      // Check each feedback in the feedbacks array


      if (matrixEdit.feedbacks && matrixEdit.feedbacks.length > 0) {
        const hasMatchingFeedback = matrixEdit.feedbacks.some(fb =>
          fb.trim().toLowerCase() === questionStem
        );

        if (hasMatchingFeedback) {
          newErrors.questionStem = 'Feedback cannot be the same as the question stem';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle removing a key point
  const removeKeyPoint = (index: number) => {
    const newKeyPoints = keyPoints.filter((_, i) => i !== index);
    setKeyPoints(newKeyPoints);

    // Clear key points errors if all key points are now valid
    if (errors.keyPoints) {
      const hasEmptyOrDuplicate = validateKeyPoints(newKeyPoints);
      if (!hasEmptyOrDuplicate) {
        setErrors(prev => ({
          ...prev,
          keyPoints: undefined
        }));
      }
    }
  };

  // Validate key points (returns true if there are validation errors)
  const validateKeyPoints = (points: string[]): boolean => {
    if (points.length === 0) return false; // No key points is valid

    const seen = new Set<string>();
    let hasEmpty = false;

    for (const point of points) {
      const trimmed = point.trim();
      if (trimmed === '') {
        hasEmpty = true;
        break;
      }
      if (seen.has(trimmed.toLowerCase())) {
        return true; // Duplicate found
      }
      seen.add(trimmed.toLowerCase());
    }

    return hasEmpty;
  };

  // Update the question object with key points and feedback when saving
  const handleSave = () => {
    // Pass true to indicate we're saving
    if (!validateForm(true)) {
      return; // Don't proceed if validation fails
    }
    onClose();
    // Filter out any empty key points
    const filteredKeyPoints = keyPoints.filter(point => point.trim() !== '');

    // Create base updated question object
    const updatedQuestion: any = {
      ...question,
      type: questionType,
      generatedImageUrl: imagesEdited
        ? (regeneratedImages[0] || '')
        : (questionData.generatedImageUrl || question?.generatedImageUrl || ''),
      // Full set of attached images (falls back to the single image for backward-compat)
      generatedImages: imagesEdited
        ? regeneratedImages
        : (Array.isArray(questionData.generatedImages) && questionData.generatedImages.length
          ? questionData.generatedImages
          : ((questionData.generatedImageUrl || question?.generatedImageUrl)
            ? [questionData.generatedImageUrl || question?.generatedImageUrl]
            : [])),
      // Carry the image origin through the save, otherwise a manually picked image
      // kept the previous value and still showed the "AI Generated" badge.
      generatedimagetype: (imagesEdited && stagedImageType !== null)
        ? stagedImageType
        : toGeneratedImageType(questionData?.generatedimagetype ?? question?.generatedimagetype),
      // Per-option images: the ones regenerated in this modal, else what was saved.
      optionImages: regeneratedOptionImages ?? getOptionImages(question),
      // Always include key points, even if empty
      KeyPoints: filteredKeyPoints,
      keyPoints: filteredKeyPoints, // Include both variations for compatibility
    };

    // Set question stem based on question type
    if (String(questionType).toLowerCase().includes('matrix')) {
      // For Matrix questions, use matrixEdit.questionStatement
      updatedQuestion.QuestionStatement = (matrixEdit.questionStatement || '').trim();
      updatedQuestion.label = (matrixEdit.questionStatement || '').trim();
    } else if (editingTabs.length > 0) {
      // With passage tabs the edited stem is the PartPrompt — writing it to `label`
      // would destroy the stored multi-tab passage blob.
      updatedQuestion.PartPrompt = formData.questionStem.trim();
      updatedQuestion.partPrompt = formData.questionStem.trim();
    } else {
      // For other question types, use formData.questionStem
      updatedQuestion.QuestionStatement = formData.questionStem.trim();
      updatedQuestion.label = formData.questionStem.trim();
    }

    if (editingTable) {
      updatedQuestion.TableAnalysis = editingTable;
    }

    if (editingTabs.length > 0) {
      updatedQuestion.Tabs = editingTabs;
      updatedQuestion.tabs = editingTabs;
    }

    // Handle question type specific fields
    if (questionType === 'Multiple Choice' || String(questionType).toLowerCase().includes('fill in the blank') || isSelectTheBlankQuestion || String(questionType).toLowerCase().includes('multiple response')) {
      // For multiple choice/multiple response, include options and feedback
      updatedQuestion.values = [...formData.options];

      // Select the Blank also round-trips its dropdown option list
      if (isSelectTheBlankQuestion) {
        const dropdownOpts = (formData.options || []).map((o: any) => String(o ?? '').trim()).filter((o: string) => o.length > 0);
        updatedQuestion.DropdownOptions = dropdownOpts;
        updatedQuestion.dropdownoptions = dropdownOpts;
      }

      // For Multiple Response, format correct answer with letter prefixes
      if (String(questionType).toLowerCase().includes('multiple response')) {
        const correctAnswerText = formData.correctAnswer.trim();
        // First try splitting by |||, if that doesn't work, try comma as fallback
        let correctOptions = correctAnswerText.split('|||').map(opt => opt.trim()).filter(opt => opt);
        if (correctOptions.length <= 1) {
          correctOptions = correctAnswerText.split(',').map(opt => opt.trim()).filter(opt => opt);
        }

        // Format correct answer as JSON array with letter prefixes (e.g., ["A. Option1", "B. Option3"])
        const formattedCorrectAnswer = correctOptions.map(option => {
          // Find the option that matches (case-insensitive and trimmed)
          const index = formData.options.findIndex(opt =>
            opt.trim().toLowerCase() === option.toLowerCase().trim()
          );
          if (index !== -1) {
            const letter = String.fromCharCode(65 + index); // A, B, C, ...
            return `${letter}. ${formData.options[index].trim()}`;
          }
          return option; // fallback if not found
        });

        updatedQuestion.CorrectAnswer = JSON.stringify(formattedCorrectAnswer);

        const marks: Record<string, number> = {};

        formData.options.forEach((option: string, index: number) => {
          const letter = String.fromCharCode(65 + index); // A, B, C, ...

          // Normalize correctOptions: strip "A. ", "B. ", etc.
          const isCorrect = correctOptions.some(correctOption => {
            const normalized = correctOption.trim().replace(/^[A-Z]\.\s*/, '').toLowerCase();
            return normalized === option.trim().toLowerCase();
          });

          marks[letter] = isCorrect ? 1 : 0;
        });

        updatedQuestion.marks = JSON.stringify(marks);
      } else if (String(questionType).toLowerCase().includes('multiple choice')) {
        // For Multiple Choice, format correct answer with letter prefix
        const correctAnswerText = formData.correctAnswer.trim();
        const index = formData.options.findIndex(opt => opt.trim() === correctAnswerText);

        if (index !== -1) {
          const letter = String.fromCharCode(65 + index); // A, B, C, ...
          updatedQuestion.CorrectAnswer = `${letter}. ${correctAnswerText}`;
        } else {
          // Fallback if not found in options
          updatedQuestion.CorrectAnswer = correctAnswerText;
        }
      } else {
        // For other question types, save correct answer as-is
        updatedQuestion.CorrectAnswer = formData.correctAnswer.trim();
      }

      // Include feedback fields if they exist (support up to 10 options A-J)
      if (String(questionType).toLowerCase().includes('multiple choice')) {
        // For Multiple Choice, determine correct letter from CorrectAnswer field
        const correctAnswerField = String(updatedQuestion.CorrectAnswer || '').trim();
        const correctLetterMatch = correctAnswerField.match(/^([A-J])\./);
        const correctLetter = correctLetterMatch ? correctLetterMatch[1] : null;

        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach(letter => {
          const feedbackKey = `FeedbackOption${letter}`;
          if (formData[feedbackKey] !== undefined) {
            const originalFeedback = formData[feedbackKey];

            // Decide prefix based on whether this letter is the correct answer
            const prefix = letter === correctLetter ? "Correct." : "Incorrect.";
            // Replace any existing "Correct."/"Incorrect." prefix with the new one 
            updatedQuestion[feedbackKey] = originalFeedback.replace(/^(Correct\.|Incorrect\.)/, prefix);
          }
        });
      } else if (isSelectTheBlankQuestion) {
        // Select the Blank keeps a single feedback — the correct answer's — stored
        // under FeedbackOptionA whichever option is correct, so a marks-derived
        // Correct./Incorrect. prefix would mislabel it. Carry the text through as typed.
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach(letter => {
          const feedbackKey = `FeedbackOption${letter}`;
          if (formData[feedbackKey] !== undefined) {
            updatedQuestion[feedbackKey] = formData[feedbackKey];
          }
        });
      } else {
        // For other question types (like Multiple Response), use marks object.
        // `marks` is stored as a JSON object by the generator and as a JSON string by
        // the Multiple Response branch above, so JSON.parse on the raw value threw
        // ("[object Object]" is not valid JSON) and aborted the whole save — the
        // dialog had already closed, so the update simply never reached the API.
        const marksObj = (() => {
          const raw = updatedQuestion.marks;
          if (!raw) return {} as Record<string, any>;
          if (typeof raw === 'object') return raw as Record<string, any>;
          try {
            const parsed = JSON.parse(String(raw));
            return parsed && typeof parsed === 'object' ? parsed : {};
          } catch {
            return {} as Record<string, any>;
          }
        })();
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach(letter => {
          const feedbackKey = `FeedbackOption${letter}`;
          if (formData[feedbackKey] !== undefined) {
            const originalFeedback = formData[feedbackKey];
            const mark = marksObj[letter];

            // Decide prefix based on mark 
            const prefix = mark === 1 ? "Correct." : "Incorrect.";
            // Replace any existing "Correct."/"Incorrect." prefix with the new one 
            updatedQuestion[feedbackKey] = originalFeedback.replace(/^(Correct\.|Incorrect\.)/, prefix);
          }
        });
      }
    } else if (questionType === 'True False') {
      // For True/False, auto-prefix the options and correct answer
      const prefixedOptions = ['A. True', 'B. False'];
      updatedQuestion.values = prefixedOptions;

      // Auto-prefix the correct answer based on the input value
      let correctAnswerInput = String(formData.correctAnswer || '').trim().toLowerCase();
      let prefixedCorrectAnswer = '';

      if (correctAnswerInput === 'true') {
        prefixedCorrectAnswer = 'A. True';
      } else if (correctAnswerInput === 'false') {
        prefixedCorrectAnswer = 'B. False';
      } else if (correctAnswerInput === 'a. true') {
        prefixedCorrectAnswer = 'A. True';
      } else if (correctAnswerInput === 'b. false') {
        prefixedCorrectAnswer = 'B. False';
      } else {
        // Default to 'A. True' if input is unclear
        prefixedCorrectAnswer = 'A. True';
      }

      updatedQuestion.CorrectAnswer = prefixedCorrectAnswer;

      // Include feedback fields if they exist
      ['A', 'B'].forEach(letter => {
        const feedbackKey = `FeedbackOption${letter}`;
        if (formData[feedbackKey] !== undefined) {
          updatedQuestion[feedbackKey] = formData[feedbackKey];
        }
      });
    } else if (questionType === 'Written Response') {
      // For written response, include the model answer and key points
      updatedQuestion.CorrectAnswer = formData.correctAnswer.trim();
      updatedQuestion.ModelAnswer = formData.correctAnswer.trim();
      updatedQuestion.values = []; // Clear any multiple choice options

      // Filter out any empty key points before saving
      const nonEmptyKeyPoints = keyPoints.filter(point => point.trim() !== '');
      updatedQuestion.KeyPoints = nonEmptyKeyPoints;
      updatedQuestion.keyPoints = nonEmptyKeyPoints;
    } else if (String(questionType).toLowerCase().includes('matrix')) {
      // For Matrix format, persist rows, columns, answers, and feedbacks
      const rows = (matrixEdit.rows || []).filter((t) => String(t).trim().length > 0).map((t) => ({ text: String(t).trim() }));
      const columns = (matrixEdit.columns || []).filter((t) => String(t).trim().length > 0).map((t, i) => ({ text: String(t).trim(), value: i }));
      const answers = (matrixEdit.answers || []).slice();
      const feedbacks = (matrixEdit.feedbacks || []).map((f) => String(f));

      updatedQuestion.type = 'Matrix';
      updatedQuestion.PartPrompt = (matrixEdit.partPrompt || updatedQuestion.PartPrompt || '').trim();
      updatedQuestion.rows = rows;
      updatedQuestion.columns = columns;
      updatedQuestion.CorrectAnswer = answers;
      (updatedQuestion as any).Feedbacks = feedbacks;
    }

    onSave(updatedQuestion);

    // Set formData's correctAnswer to updatedQuestion's correctAnswer
    let formattedCorrectAnswer = updatedQuestion.CorrectAnswer;
    if (typeof updatedQuestion.CorrectAnswer === 'string' && updatedQuestion.CorrectAnswer.trim().startsWith('[')) {
      try {
        const parsedAnswers = JSON.parse(updatedQuestion.CorrectAnswer);
        formattedCorrectAnswer = Array.isArray(parsedAnswers) ? parsedAnswers.join('|||') : updatedQuestion.CorrectAnswer;
      } catch (e) {
        console.error('Error parsing correct answer:', e);
        formattedCorrectAnswer = updatedQuestion.CorrectAnswer;
      }
    }

    // if (String(questionType).toLowerCase().includes('multiple response')) {
    //   // Remove letter prefix (like "B.", "A.", etc.) from formatted correct answer
    //   if (typeof formattedCorrectAnswer === 'string') {
    //     formattedCorrectAnswer = formattedCorrectAnswer.replace(/^[A-D][\.\)]?\s*/, '');
    //   }
    // }

    setFormData(prev => ({
      ...prev,
      correctAnswer: formattedCorrectAnswer
    }));
  };

  // Use formData for all form fields
  const { questionStem, options, correctAnswer } = formData;

  // Extract correct answer prefix (A., B., C., D.) safely
  const caStr = correctAnswer === null || correctAnswer === undefined ? '' : String(correctAnswer);
  const correctAnswerPrefix = caStr.match(/^[A-D][\.\)]?/)?.[0] || 'A.';
  const correctAnswerText = caStr.replace(/^[A-D][\.\)]?\s*/, '');

  // Safe: use "Book Based" if value is "1", "LLM" if value is "2", fallback to label
  const getSourceLabel = (question: any) => {
    // Try .source, .sourceType, or the raw value (item[12]) as your code provides
    if (question?.source) {
      if (typeof question.source === "string") {
        // If already a label, just return it
        if (question.source.toLowerCase().includes("llm")) return "LLM";
        if (question.source.toLowerCase().includes("book")) return "Book Based";
        // If raw value, convert
        if (question.source === "2") return "LLM";
        if (question.source === "1") return "Book Based";
      }
      // If number (unlikely, but just in case)
      if (question.source === 2) return "LLM";
      if (question.source === 1) return "Book Based";
    }
    // Fallback to other fields if available
    if (question?.sourceType === "2" || question?.sourceType === 2) return "LLM";
    if (question?.sourceType === "1" || question?.sourceType === 1) return "Book Based";
    // If you store the raw field (e.g. item[12]) somewhere else, check that too
    if (question?.rawSource === "2" || question?.rawSource === 2) return "LLM";
    if (question?.rawSource === "1" || question?.rawSource === 1) return "Book Based";
    // Fallback: if nothing matches, show "Book Based"
    return "Book Based";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="pb-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold text-gray-900">
                {questionType?.toLowerCase().includes("written")
                  ? "Edit Written Response"
                  : String(questionType).toLowerCase().includes("true false")
                    ? "Edit True False"
                    : String(questionType).toLowerCase().includes('matrix')
                      ? "Edit Matrix"
                      : isSelectTheBlankQuestion
                        ? "Edit Select the Blank"
                        : String(questionType).toLowerCase().includes('fill in the blank')
                          ? "Edit Fill in the Blank"
                          : String(questionType).toLowerCase().includes('multiple response')
                            ? "Edit Multiple Response"
                            : "Edit Multiple Choice"}
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                Modify the question content, options, feedback, and metadata below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowKeyboard((v) => !v)}
              className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              title={showKeyboard ? 'Hide Keyboard' : 'Show Keyboard'}>
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-8 py-6">
          {/* Original Question Information - Only show for converted questions */}
          {question?.originalquestionid && (
            <div className="space-y-4">
              {/* <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                  <Globe className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Original Question Information</h3>
              </div> */}
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-purple-900">Original Question ID:</span>
                  <span className="text-sm text-purple-800">{question.originalquestionid}</span>
                </div>
                {question?.originallanguage && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-purple-900">Translated Language:</span>
                    <span className="text-sm text-purple-800">{question.originallanguage}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Passages (multi-tab) — switch tabs and edit the selected passage */}
          {editingTabs.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Passages</h3>
              </div>

              <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-1 flex-wrap">
                {editingTabs.map((tab: any, tIdx: number) => {
                  const isActive = tIdx === editingPassageTabIndex;
                  return (
                    <button
                      key={tIdx}
                      type="button"
                      onClick={() => setEditingPassageTabIndex(tIdx)}
                      className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ease-out ${isActive
                        ? 'bg-white text-blue-700 shadow-md shadow-black/5 ring-1 ring-black/5'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                        }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full transition-colors ${isActive ? 'bg-blue-600' : 'bg-gray-300'}`} />
                        {getTabTitle(tab, tIdx)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <Textarea
                value={getTabPassage(editingTabs[Math.min(editingPassageTabIndex, editingTabs.length - 1)] || {})}
                onChange={(e) => {
                  const newPassage = e.target.value;
                  // Write every alias the reader looks at, otherwise a stale
                  // `TabContent` keeps shadowing the passage the user just typed.
                  setEditingTabs(prev => prev.map((t: any, i: number) =>
                    i === editingPassageTabIndex
                      ? { ...t, Passage: newPassage, TabContent: newPassage }
                      : t
                  ));
                }}
                className="min-h-[120px] text-gray-900 bg-gray-50 resize-none border-gray-200"
                placeholder="Enter passage text..."
              />
            </div>
          )}

          {/* Table Analysis (editable) */}
          {editingTable && (() => {
            const indexedRows = editingTable.Rows.map((row, originalIndex) => ({ originalIndex, row }));
            const colIndex = editingTable.Columns.indexOf(editTableSortColumn);
            const sortedIndexedRows = editTableSortColumn === 'S.no' || colIndex === -1
              ? indexedRows
              : [...indexedRows].sort((a, b) => {
                const av = a.row[colIndex]; const bv = b.row[colIndex];
                const an = Number(av); const bn = Number(bv);
                if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
                return String(av).localeCompare(String(bv));
              });

            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                    <List className="w-4 h-4 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Table Analysis</h3>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-semibold text-gray-800">Sort By :</label>
                  <select
                    value={editTableSortColumn}
                    onChange={(e) => setEditTableSortColumn(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                  >
                    {getSortOptions(editingTable).map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
                <div className="overflow-x-auto border border-gray-200 rounded-xl p-4 bg-gray-50">
                  <table className="w-full border border-gray-300 rounded-md">
                    <thead>
                      <tr className="bg-gray-50">
                        {editingTable.Columns.map((col, colIdx) => (
                          <th key={colIdx} className="border border-gray-300 p-2 text-center font-semibold text-gray-800">
                            {colIdx === 0 ? (
                              <span className="font-semibold text-gray-700">{col}</span>
                            ) : (
                              <Input
                                value={col}
                                onChange={(e) => {
                                  const newCols = [...editingTable.Columns];
                                  newCols[colIdx] = e.target.value;
                                  setEditingTable(prev => prev ? { ...prev, Columns: newCols } : null);
                                }}
                                className="h-8 text-xs font-semibold bg-white border-gray-200"
                              />
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sortedIndexedRows.map(({ originalIndex, row }) => (
                        <tr key={originalIndex}>
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} className="border border-gray-300 p-2 text-center text-gray-700">
                              {cellIdx === 0 ? (
                                <span className="font-medium text-gray-600">{cell}</span>
                              ) : (
                                <Input
                                  value={String(cell ?? '')}
                                  onChange={(e) => {
                                    const newRows = editingTable.Rows.map((r, rI) =>
                                      rI === originalIndex ? r.map((c, cI) => cI === cellIdx ? e.target.value : c) : r
                                    );
                                    setEditingTable(prev => prev ? { ...prev, Rows: newRows } : null);
                                  }}
                                  className="h-8 text-xs bg-white border-gray-200"
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Question Stem */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Question Stem</h3>
              </div>
            </div>

            {!editingFields['questionStem'] ? (
              <div
                className={`min-h-[100px] text-gray-900 bg-gray-50 border p-3 rounded-md w-full cursor-pointer hover:border-blue-400 transition-colors relative group ${errors.questionStem ? 'border-red-500' : 'border-gray-200'}`}
                onClick={() => toggleEdit('questionStem', true)}
              >
                {/* <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="secondary" className="h-7 text-xs">✏️ Edit</Button>
                </div> */}
                <LatexRenderer content={String(questionType).toLowerCase().includes('matrix') ? matrixEdit.questionStatement : questionStem} />
              </div>
            ) : (
              <div className="relative">
                <div
                  id="questionStem"
                  ref={questionStemRef}
                  contentEditable
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{
                    __html: String(questionType).toLowerCase().includes('matrix')
                      ? matrixEdit.questionStatement
                      : questionStem
                  }}
                  onPaste={(e) => {
                    // Save cursor position before paste
                    const selection = window.getSelection();
                    const range = selection?.getRangeAt(0);
                    const cursorOffset = range?.startOffset || 0;
                    const cursorContainer = range?.startContainer;

                    insertRawFromClipboard(e);
                    requestAnimationFrame(() => {
                      const html = (e.currentTarget as HTMLElement).innerHTML;
                      if (String(questionType).toLowerCase().includes('matrix')) {
                        setMatrixEdit(prev => ({ ...prev, questionStatement: html }));
                      } else {
                        handleInputChange('questionStem', html);
                      }

                      // Restore cursor position after state update
                      requestAnimationFrame(() => {
                        if (questionStemRef.current && cursorContainer) {
                          try {
                            const newRange = document.createRange();

                            // Use the current cursor container and offset directly
                            if (cursorContainer && questionStemRef.current.contains(cursorContainer)) {
                              const offset = Math.min(cursorOffset, cursorContainer.textContent?.length || 0);
                              newRange.setStart(cursorContainer, offset);
                              newRange.collapse(true);
                              const newSelection = window.getSelection();
                              newSelection?.removeAllRanges();
                              newSelection?.addRange(newRange);
                            } else {
                              // Fallback: place cursor at the end
                              const range = document.createRange();
                              range.selectNodeContents(questionStemRef.current);
                              range.collapse(false);
                              const selection = window.getSelection();
                              selection?.removeAllRanges();
                              selection?.addRange(range);
                            }
                          } catch (error) {
                            // Fallback: place cursor at the end
                            if (questionStemRef.current) {
                              const range = document.createRange();
                              range.selectNodeContents(questionStemRef.current);
                              range.collapse(false);
                              const selection = window.getSelection();
                              selection?.removeAllRanges();
                              selection?.addRange(range);
                            }
                          }
                        }
                      });
                    });
                  }}
                  onInput={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    const caretPos = saveCaretPosition(el);

                    const html = el.innerHTML;
                    if (String(questionType).toLowerCase().includes('matrix')) {
                      setMatrixEdit(prev => ({ ...prev, questionStatement: html }));
                    } else {
                      handleInputChange('questionStem', html);
                    }

                    requestAnimationFrame(() => {
                      restoreCaretPosition(el, caretPos);
                    });
                  }}
                  className={`min-h-[100px] text-gray-900 bg-gray-50 resize-none border p-2 rounded-md w-full pr-16 ${errors.questionStem ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                    }`}
                  data-question-stem-textarea
                />
                <Button
                  size="sm"
                  variant="default"
                  className="absolute top-2 right-2 h-7"
                  onClick={() => toggleEdit('questionStem', false)}
                >
                  Done
                </Button>
              </div>
            )}

            {errors.questionStem && (
              <p className="text-red-500 text-sm mt-1">{errors.questionStem}</p>
            )}
            {(() => {
              const committed = Array.isArray((questionData as any)?.generatedImages) && (questionData as any).generatedImages.length
                ? (questionData as any).generatedImages
                : (() => { const s = resolveQuestionImageUrl(questionData); return s ? [s] : []; })();
              const imgs = (imagesEdited ? regeneratedImages : committed)
                .filter((u: string) => u && !u.includes('NOT REQUIRED') && !u.includes('NO_IMAGE_REQUIRED'));
              const hasImage = imgs.length > 0;
              const removeImageAt = (removeIdx: number) => {
                const next = imgs.filter((_: string, j: number) => j !== removeIdx);
                setRegeneratedImages(next);
                setRegeneratedImageUrl(next[0] || "");
                // Removing the last image must clear the origin too, otherwise the
                // question is saved as "manually added" with no image at all.
                if (next.length === 0) setStagedImageType(null);
                setImagesEdited(true);
              };
              // A staged image wins over the stored type so the badge updates as soon
              // as the user picks or regenerates an image, not only after saving.
              const rawType = (imagesEdited && stagedImageType !== null)
                ? stagedImageType
                : (
                  (questionData as any)?.generatedimagetype ??
                  (questionData as any)?.generated_image_type ??
                  (questionData as any)?.generatedImageType ??
                  (question as any)?.generatedimagetype ??
                  (question as any)?.generated_image_type ??
                  (question as any)?.generatedImageType ??
                  (question as any)?.[26]
                );
              const imgType = toGeneratedImageType(rawType);
              return (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm text-gray-600">{hasImage ? (imgs.length > 1 ? `Images (${imgs.length})` : 'Question Image') : 'Question Image'}</p>
                    {hasImage && (
                      imgType === 1 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-400 shadow-sm" title="Manually Uploaded / Selected Image">
                          <Upload className="w-4 h-4 text-white" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 shadow-sm" title="AI Generated Image">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                        </span>
                      )
                    )}
                    {/* The hints sit ABOVE these icons: the browser's own tooltip drops
                        below the pointer and covered the line underneath. */}
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenImageRegenerate(questionData)} className="h-6 w-6 p-0 rounded-full" aria-label={hasImage ? 'Regenerate Image' : 'Generate Image'}>
                          <RotateCcw className="w-3 h-3 text-blue-600" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="px-2 py-1 text-xs">
                        {hasImage ? 'Regenerate Image' : 'Generate Image'}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenImageSelect(questionData)} className="h-6 w-6 p-0 rounded-full" aria-label="Select Image(s) from Repository">
                          <ImagePlus className="w-3 h-3 text-blue-600" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="px-2 py-1 text-xs">
                        Select Image(s) from Repository
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {hasImage ? (
                    <div className="flex flex-wrap gap-3">
                      {imgs.map((src: string, i: number) => (
                        <div key={i} className="relative">
                          <RepoImage
                            src={src}
                            alt={`Question illustration ${i + 1}`}
                            className="max-w-full h-auto rounded-lg border border-gray-300 shadow-sm"
                            style={{ maxHeight: '260px' }}
                          />
                          <button
                            type="button"
                            onClick={() => removeImageAt(i)}
                            title="Delete image"
                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white text-red-600 hover:bg-red-600 hover:text-white shadow-md ring-1 ring-red-200 flex items-center justify-center transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No image yet. Click the icon to generate one with additional instructions.</p>
                  )}
                </div>
              );
            })()}
          </div>


          {/* Correct Answer and Feedback for Fill in the Blanks */}
          {(String(questionType).toLowerCase().includes('fill in the blank') || isSelectTheBlankQuestion) && (
            <div className="space-y-6">
              {/* Options (Select the Blank only) — the text is editable, and the circle
                  marks which option is the correct answer. The text used to be
                  display-only, so a dropdown option could never be corrected. */}
              {isSelectTheBlankQuestion && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                      <Target className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Options</h3>
                      <p className="text-sm text-gray-500">Click the text to edit an option, or the circle to mark it correct</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {/* Indexes come from the unfiltered list: filtering first would shift
                        them and write the edit into the wrong option. */}
                    {(formData.options || [])
                      .map((opt: any, index: number) => ({ opt, index }))
                      .filter(({ opt }: { opt: any }) => String(opt ?? '').trim())
                      .map(({ opt, index }: { opt: any; index: number }) => {
                        const value = String(opt ?? '');
                        const isCorrectValue = value.trim().toLowerCase() === String(formData.correctAnswer || '').trim().toLowerCase();
                        const fieldKey = `option-${index}`;
                        return (
                          <div key={index}
                            className={`flex items-start gap-4 p-4 rounded-lg border ${isCorrectValue ? 'border-2 border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'} transition-colors`}>
                            <button
                              type="button"
                              title={isCorrectValue ? 'Correct answer' : 'Mark as the correct answer'}
                              aria-label={isCorrectValue ? 'Correct answer' : 'Mark as the correct answer'}
                              onClick={() => handleInputChange('correctAnswer', value.trim())}
                              className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 mt-2 transition-colors ${isCorrectValue ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-300 border-gray-300 hover:text-green-600 hover:border-green-400'}`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <div className="flex-1">
                              {!editingFields[fieldKey] ? (
                                <div
                                  className={`w-full min-h-[40px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-white ${errors.options?.[index] ? 'border-red-500' : 'border-gray-200'}`}
                                  onClick={() => toggleEdit(fieldKey, true)}
                                >
                                  <LatexRenderer content={value} />
                                </div>
                              ) : (
                                <div className="relative">
                                  <Textarea
                                    value={value}
                                    onChange={(e) => handleSelectBlankOptionChange(index, e.target.value)}
                                    className={`w-full min-h-[40px] resize-none pr-16 bg-white ${errors.options?.[index] ? 'border-red-500' : 'border-gray-200'}`}
                                    placeholder="Enter option text..."
                                  />
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="absolute top-1 right-1 h-7"
                                    onClick={() => toggleEdit(fieldKey, false)}
                                  >
                                    Done
                                  </Button>
                                </div>
                              )}
                              {errors.options?.[index] && (
                                <p className="text-red-500 text-sm mt-1">{errors.options[index]}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {!(formData.options || []).some((opt: any) => String(opt ?? '').trim()) && (
                    <p className="text-sm text-gray-500">No options available for this question.</p>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Correct Answer</h3>
                </div>
                {isSelectTheBlankQuestion ? (() => {
                  // Correct answer is chosen from the option list above, so it is read-only here.
                  const correctVal = String((formData.correctAnswer || '')).replace(/^[A-Da-d]\.\s*/, '').trim();
                  return (
                    <div className="flex items-start gap-4 p-4 rounded-lg border-2 border-green-300 bg-green-50">
                      <div className="flex-1 mt-1">
                        <div className="text-gray-900 font-medium">
                          {correctVal ? <LatexRenderer content={correctVal} /> : 'No correct answer specified'}
                        </div>
                      </div>
                      {correctVal && (
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 flex-shrink-0 mt-1">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })() : !editingFields['correctAnswer'] ? (
                  <div
                    className={`w-full min-h-[40px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-gray-50 relative group ${errors.correctAnswer ? 'border-red-500' : 'border-gray-200'}`}
                    onClick={() => toggleEdit('correctAnswer', true)}
                  >
                    {/* <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="secondary" className="h-6 py-0 px-2 text-xs">✏️ Edit</Button>
                    </div> */}
                    <LatexRenderer content={formData.correctAnswer || ''} />
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={formData.correctAnswer || ''}
                      onChange={(e) => handleInputChange('correctAnswer', e.target.value)}
                      className={`w-full pr-16 ${errors.correctAnswer ? 'border-red-500' : ''}`}
                      placeholder="Enter the correct answer..."
                    />
                    <Button
                      size="sm"
                      variant="default"
                      className="absolute top-1 right-1 h-8"
                      onClick={() => toggleEdit('correctAnswer', false)}
                    >
                      Done
                    </Button>
                  </div>
                )}
                {errors.correctAnswer && (
                  <p className="text-red-500 text-sm mt-1">{errors.correctAnswer}</p>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Feedback</h3>
                </div>
                {isSelectTheBlankQuestion ? (() => {
                  // Select the Blank carries a single feedback — the correct answer's —
                  // because that is all the generator produces for it. Rendering one box
                  // per dropdown option therefore left every distractor permanently blank,
                  // so only the correct answer's feedback is edited here. A distractor that
                  // does have stored feedback still gets its own box, so nothing already
                  // saved becomes unreachable.
                  const stbOptions = (formData.options || []).filter((opt: any) => String(opt ?? '').trim());
                  const correctText = String(formData.correctAnswer || '').replace(/^[A-Ja-j][.)]\s*/, '').trim().toLowerCase();
                  const keyFor = (i: number) => `FeedbackOption${String.fromCharCode(65 + i)}`;
                  const hasFeedback = (i: number) => String(formData[keyFor(i)] ?? '').trim().length > 0;
                  const matchedIdx = stbOptions.findIndex((opt: any) => String(opt).trim().toLowerCase() === correctText);
                  const correctIdx = matchedIdx >= 0 ? matchedIdx : 0;
                  // The generator writes the correct answer's feedback to FeedbackOptionA
                  // whichever option is correct, so fall back to it as the preview does.
                  const correctKey = hasFeedback(correctIdx) ? keyFor(correctIdx) : 'FeedbackOptionA';
                  const visible = stbOptions
                    .map((option: any, index: number) => ({ option, index }))
                    // `keyFor(index) !== correctKey` stops the same feedback appearing twice:
                    // when the correct option has none of its own the box above borrows
                    // FeedbackOptionA, so option A must not render it again as a distractor.
                    .filter(({ index }: { index: number }) => index === correctIdx || (hasFeedback(index) && keyFor(index) !== correctKey));
                  return (
                    <div className="space-y-3">
                      {visible.map(({ option, index }: { option: any; index: number }) => {
                        const optionLetter = String.fromCharCode(65 + index);
                        const feedbackKey = index === correctIdx ? correctKey : keyFor(index);
                        const isCorrect = index === correctIdx;

                        const rawFeedback = formData[feedbackKey] || '';
                        const isCorrectFeedback = String(rawFeedback).trim().toLowerCase().startsWith('correct.');
                        const isIncorrectFeedback = String(rawFeedback).trim().toLowerCase().startsWith('incorrect.');
                        const finalIsCorrect = isCorrectFeedback ? true : (isIncorrectFeedback ? false : isCorrect);

                        return (
                          <div key={optionLetter} className={`p-4 rounded-lg border ${finalIsCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="flex gap-3 items-start">
                              <div className="flex flex-col items-center gap-2 mt-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${finalIsCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {finalIsCorrect ? (<CheckCircle2 className="w-4 h-4" />) : (<XCircle className="w-4 h-4" />)}
                                </div>
                              </div>
                              <div className="flex-1">
                                {!editingFields[feedbackKey] ? (
                                  <div
                                    className={`w-full min-h-[80px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-white ${errors[feedbackKey] ? 'border-red-500' : 'border-gray-200'}`}
                                    onClick={() => toggleEdit(feedbackKey, true)}
                                  >
                                    <LatexRenderer content={String(rawFeedback)} />
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <Textarea
                                      value={String(rawFeedback)}
                                      onChange={(e) => handleInputChange(feedbackKey, e.target.value)}
                                      className={`w-full min-h-[80px] resize-none pr-16 border-gray-200 ${errors[feedbackKey] ? 'border-red-500' : ''}`}
                                      placeholder="Enter feedback for option..."
                                    />
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="absolute top-2 right-2 h-7"
                                      onClick={() => toggleEdit(feedbackKey, false)}
                                    >
                                      Done
                                    </Button>
                                  </div>
                                )}
                                {errors[feedbackKey] && (
                                  <p className="text-red-500 text-sm mt-1">{errors[feedbackKey] as React.ReactNode}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })() : !editingFields['FeedbackOptionA'] ? (
                  <div
                    className={`w-full min-h-[80px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-gray-50 relative group ${errors.FeedbackOptionA ? 'border-red-500' : 'border-gray-200'}`}
                    onClick={() => toggleEdit('FeedbackOptionA', true)}
                  >
                    {/* <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="secondary" className="h-7 text-xs">✏️ Edit</Button>
                    </div> */}
                    <LatexRenderer content={formData.FeedbackOptionA || ''} />
                  </div>
                ) : (
                  <div className="relative">
                    <Textarea
                      value={formData.FeedbackOptionA || ''}
                      onChange={(e) => handleInputChange('FeedbackOptionA', e.target.value)}
                      className={`w-full min-h-[80px] resize-none pr-16 border-gray-200 ${errors.FeedbackOptionA ? 'border-red-500' : ''}`}
                      placeholder="Enter feedback for the correct answer..."
                    />
                    <Button
                      size="sm"
                      variant="default"
                      className="absolute top-2 right-2 h-7"
                      onClick={() => toggleEdit('FeedbackOptionA', false)}
                    >
                      Done
                    </Button>
                  </div>
                )}
                {!isSelectTheBlankQuestion && errors.FeedbackOptionA && (
                  <p className="text-red-500 text-sm mt-1">{errors.FeedbackOptionA}</p>
                )}
              </div>
            </div>
          )}

          {/* Options - Multiple Choice, Multiple Response and True/False only */}
          {questionType !== 'Written Response' && !String(questionType).toLowerCase().includes('matrix') && !String(questionType).toLowerCase().includes('fill in the blank') && !isSelectTheBlankQuestion && (
            <>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <Label className="text-lg font-semibold text-gray-800">Options</Label>
                    <p className="text-sm text-gray-500">
                      {String(questionType).toLowerCase().includes('true false')
                        ? "Edit True False statements below"
                        : "Configure answer choices"}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {String(questionType).toLowerCase().includes('true false')
                    ? [0, 1].map((index) => {
                      const optionLetter = String.fromCharCode(65 + index); // A, B
                      const initialValue = formData.options[index] || (index === 0 ? "True" : "False");
                      return (
                        <div key={index} className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-sm font-medium text-blue-700 flex-shrink-0">
                            {optionLetter}.
                          </div>
                          <div className="flex-1">
                            {/* <Input
                              value={formData.options[index] || (index === 0 ? "True" : "False")}
                              onChange={(e) => handleOptionChange(index, e.target.value)}
                              className={`w-full ${errors.options?.[index] ? 'border-red-500' : ''}`}
                              placeholder={index === 0 ? "True" : "False"}
                            /> */}
                            {!editingFields[`option-${index}`] ? (
                              <div
                                className={`w-full min-h-[40px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-gray-50 relative group ${errors.options?.[index] ? 'border-red-500' : 'border-gray-200'}`}
                                onClick={() => toggleEdit(`option-${index}`, true)}
                              >
                                {/* <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button size="sm" variant="secondary" className="h-6 py-0 px-2 text-xs">✏️ Edit</Button>
                                </div> */}
                                <LatexRenderer content={initialValue} />
                              </div>
                            ) : (
                              <div className="relative">
                                <div
                                  contentEditable
                                  suppressContentEditableWarning
                                  dangerouslySetInnerHTML={{ __html: initialValue }}

                                  onInput={(e) => {
                                    const el = e.currentTarget as HTMLElement;
                                    const caretPos = saveCaretPosition(el);
                                    const newValue = el.innerHTML;
                                    // update your state here
                                    handleOptionChange(index, newValue);
                                    requestAnimationFrame(() => {
                                      restoreCaretPosition(el, caretPos);
                                    });
                                  }}
                                  className={`w-full min-h-[40px] p-2 pr-16 border rounded-md bg-white ${errors.options?.[index] ? "border-red-500" : "border-gray-200"
                                    }`}
                                  data-option-index={index}
                                  data-option-textarea
                                />
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="absolute top-1 right-1 h-6 py-0 px-2 text-xs"
                                  onClick={() => toggleEdit(`option-${index}`, false)}
                                >
                                  Done
                                </Button>
                              </div>
                            )}

                            {errors.options?.[index] && (
                              <p className="text-red-500 text-sm mt-1">{errors.options[index]}</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                    : options.map((opt, index) => {


                      const optionLetter = String.fromCharCode(65 + index); // A, B, C, D
                      return (
                        <div key={index} className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-sm font-medium text-blue-700 flex-shrink-0">
                            {optionLetter}.
                          </div>
                          <div className="flex-1">
                            {!editingFields[`option-${index}`] ? (
                              <div
                                className={`w-full min-h-[40px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-gray-50 relative group ${errors.options?.[index] ? 'border-red-500' : 'border-gray-200'}`}
                                onClick={() => toggleEdit(`option-${index}`, true)}
                              >
                                {/* <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button size="sm" variant="secondary" className="h-6 py-0 px-2 text-xs">✏️ Edit</Button>
                                </div> */}
                                <LatexRenderer content={opt} />
                              </div>
                            ) : (
                              <div className="relative">
                                <div
                                  ref={el => optionRefs.current[index] = el}
                                  contentEditable
                                  suppressContentEditableWarning
                                  dangerouslySetInnerHTML={{ __html: opt }}
                                  onInput={(e) => {
                                    const el = e.currentTarget as HTMLElement;
                                    const caretPos = saveCaretPosition(el);

                                    const html = el.innerHTML;
                                    handleOptionChange(index, html);

                                    requestAnimationFrame(() => {
                                      restoreCaretPosition(el, caretPos);
                                    });
                                  }}

                                  onPaste={(e) => {
                                    insertRawFromClipboard(e);
                                    requestAnimationFrame(() => {
                                      const html = (e.currentTarget as HTMLElement).innerHTML;
                                      handleOptionChange(index, html);
                                    });
                                  }}
                                  className={`w-full min-h-[40px] pr-16 p-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${errors.options?.[index] ? 'border-red-500' : 'border-gray-200'}`}
                                  data-placeholder={`Enter option`}
                                  data-option-input={index}
                                  data-option-textarea
                                />
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="absolute top-1 right-1 h-6 py-0 px-2 text-xs"
                                  onClick={() => toggleEdit(`option-${index}`, false)}
                                >
                                  Done
                                </Button>
                              </div>
                            )}

                            {errors.options?.[index] && (
                              <p className="text-red-500 text-sm mt-1">{errors.options[index]}</p>
                            )}

                            {(() => {
                              // Image generated for this option; a regeneration in this
                              // modal replaces the saved one.
                              const url = findOptionImageUrl(
                                regeneratedOptionImages ?? getOptionImages(question), index, opt,
                              );
                              if (!url) return null;
                              return (
                                <RepoImage
                                  src={url}
                                  alt={`Option ${optionLetter} illustration`}
                                  className="mt-2 max-w-full h-auto rounded-lg border border-gray-300 shadow-sm"
                                  style={{ maxHeight: '160px' }}
                                />
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Correct Answer Section */}
                <div className="mt-8 space-y-4" id="correct-answer-section">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Correct Answer</h3>
                  </div>

                  {String(questionType).toLowerCase().includes('multiple response') ? (
                    <div className="space-y-3">
                      {formData.correctAnswer ? (
                        formData.correctAnswer.split('|||').map((answer, index, array) => {
                          const answerText = answer.trim().replace(/^[A-Z]\.\s*/, '');
                          const matchingIndex = formData.options?.findIndex(opt =>
                            opt.trim().toLowerCase() === answerText.toLowerCase()
                          );

                          return (
                            <div key={index} className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center text-sm font-medium text-green-700 flex-shrink-0">
                                {(() => {
                                  // If match found, show the corresponding letter (A, B, C, D...)
                                  if (matchingIndex !== -1 && matchingIndex !== undefined) {
                                    return String.fromCharCode(65 + matchingIndex);
                                  }

                                  // Default to checkmark if no match
                                  return '✓';
                                })()}
                              </div>
                              <div className="flex-1">
                                <div

                                  contentEditable
                                  suppressContentEditableWarning
                                  dangerouslySetInnerHTML={{ __html: answerText }}

                                  onInput={(e) => {
                                    const el = e.currentTarget as HTMLElement;
                                    const caretPos = saveCaretPosition(el);
                                    const newValue = el.innerHTML;
                                    const newAnswers = [...array];
                                    newAnswers[index] = newValue;
                                    handleInputChange('correctAnswer', newAnswers.join('|||'));
                                    if (errors.correctAnswer) {
                                      setErrors(prev => ({ ...prev, correctAnswer: '' }));
                                    }

                                    requestAnimationFrame(() => {
                                      restoreCaretPosition(el, caretPos);
                                    });
                                  }}
                                  onPaste={(e) => {
                                    insertRawFromClipboard(e);
                                    requestAnimationFrame(() => {
                                      const newValue = (e.currentTarget as HTMLElement).innerHTML;
                                      const newAnswers = [...array];
                                      newAnswers[index] = newValue;
                                      handleInputChange('correctAnswer', newAnswers.join('|||'));
                                    });
                                  }}
                                  className={`w-full min-h-[40px] p-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.correctAnswer ? 'border-red-500' : 'border-gray-200'}`}
                                  data-placeholder={`Option ${index + 1}`}
                                  data-correct-answer-input={index}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-gray-500 italic">No correct answers selected</div>
                      )}
                      {errors.correctAnswer && (
                        <div className="text-red-500 text-sm mt-2">
                          {errors.correctAnswer}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center text-sm font-medium text-green-700 flex-shrink-0">
                        {(() => {
                          // Find which option matches the correct answer
                          //const correctAnswerText = (formData.correctAnswer || '').trim().toLowerCase();
                          const correctAnswerText = (formData.correctAnswer || '').trim().toLowerCase().replace(/^[a-j][\.\)]+\s*/, '');
                          const matchingIndex = formData.options?.findIndex(opt =>
                            opt.trim().toLowerCase() === correctAnswerText
                          );

                          // If match found, show the corresponding letter (A, B, C, D...)
                          if (matchingIndex !== -1 && matchingIndex !== undefined) {
                            return String.fromCharCode(65 + matchingIndex);
                          }

                          // Default to checkmark if no match
                          return '✓';
                        })()}
                      </div>
                      <div className="flex-1">
                        {!editingFields['correct-answer-single'] ? (
                          <div
                            className={`w-full min-h-[40px] p-2 border rounded-md cursor-pointer hover:border-green-400 bg-gray-50 ${errors.correctAnswer ? 'border-red-500' : 'border-gray-200'}`}
                            onClick={() => toggleEdit('correct-answer-single', true)}
                          >
                            <LatexRenderer content={formData.correctAnswer || ''} />
                          </div>
                        ) : (
                          <div className="relative">
                            <div
                              contentEditable
                              suppressContentEditableWarning
                              dangerouslySetInnerHTML={{ __html: formData.correctAnswer || '' }}
                              onInput={(e) => {
                                const el = e.currentTarget as HTMLElement;
                                const caretPos = saveCaretPosition(el);

                                const newValue = el.innerHTML;
                                handleInputChange('correctAnswer', newValue);

                                if (errors.correctAnswer) {
                                  setErrors(prev => ({ ...prev, correctAnswer: '' }));
                                }

                                requestAnimationFrame(() => {
                                  restoreCaretPosition(el, caretPos);
                                });
                              }}
                              onPaste={(e) => {
                                insertRawFromClipboard(e);
                                requestAnimationFrame(() => {
                                  const newValue = (e.currentTarget as HTMLElement).innerHTML;
                                  handleInputChange('correctAnswer', newValue);
                                });
                              }}
                              className={`w-full min-h-[40px] p-2 pr-16 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.correctAnswer ? 'border-red-500' : 'border-gray-200'}`}
                              data-placeholder={String(questionType).toLowerCase().includes('true false') ? 'True or False' : 'Enter correct answer'}
                              data-correct-answer-single="true"
                            />
                            <Button
                              size="sm"
                              variant="default"
                              className="absolute top-1 right-1 h-6 py-0 px-2 text-xs"
                              onClick={() => toggleEdit('correct-answer-single', false)}
                            >
                              Done
                            </Button>
                          </div>
                        )}
                        {errors.correctAnswer && (
                          <p className="text-red-500 text-sm mt-1">{errors.correctAnswer}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Matrix editor - match AIGQuestionResults.tsx */}
          {String(questionType).toLowerCase().includes('matrix') && (
            <>
              <div className="space-y-8 mt-8">
                {/* Rows and Answers */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <List className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <Label className="text-lg font-semibold text-gray-800">Matrix Table</Label>
                        <p className="text-sm text-gray-500">Edit row labels and select the correct column per row</p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    {matrixEdit.rows.length === 0 || matrixEdit.columns.length === 0 ? (
                      <div className="p-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded">
                        {matrixEdit.rows.length === 0 && matrixEdit.columns.length === 0 ? 'Add rows and columns to edit the matrix.' : matrixEdit.rows.length === 0 ? 'Add rows to edit the matrix.' : 'Add columns to edit the matrix.'}
                      </div>
                    ) : (
                      <table className="table-fixed w-full">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 p-2 text-left" style={{ width: '30%' }}></th>
                            {matrixEdit.columns.map((col, colIndex) => (
                              <th key={colIndex} className="border border-gray-300 p-2 text-center w-[120px]">
                                {/* Click to edit. A column label can be LaTeX (\(rac{2}{8}\)),
                                    and a contentEditable box shows the raw source — the same
                                    click-to-edit pattern the rest of this dialog uses renders it
                                    while it is not being typed in. */}
                                {!editingFields[`matrixColumn-${colIndex}`] ? (
                                  <div
                                    className="w-full min-h-[40px] p-2 border rounded-md border-gray-200 bg-white text-center cursor-pointer hover:border-blue-400"
                                    onClick={() => toggleEdit(`matrixColumn-${colIndex}`, true)}
                                    title="Click to edit"
                                  >
                                    {String(col ?? '').trim()
                                      ? <LatexRenderer content={col} />
                                      : <span className="text-gray-400">{`Column ${colIndex + 1}`}</span>}
                                  </div>
                                ) : (
                                  <div
                                    contentEditable
                                    suppressContentEditableWarning
                                    dangerouslySetInnerHTML={{ __html: col }}
                                    onInput={(e) => {
                                      const el = e.currentTarget as HTMLElement;
                                      const caretPos = saveCaretPosition(el);

                                      const newValue = el.innerHTML;
                                      setMatrixEdit(prev => ({
                                        ...prev,
                                        columns: prev.columns.map((cc, i) => i === colIndex ? newValue : cc)
                                      }));

                                      requestAnimationFrame(() => {
                                        restoreCaretPosition(el, caretPos);
                                      });
                                    }}
                                    onPaste={(e) => {
                                      const el = e.currentTarget as HTMLElement;
                                      const caretPos = saveCaretPosition(el);

                                      insertRawFromClipboard(e);
                                      requestAnimationFrame(() => {
                                        const newValue = el.innerHTML;
                                        setMatrixEdit(prev => ({
                                          ...prev,
                                          columns: prev.columns.map((cc, i) => i === colIndex ? newValue : cc)
                                        }));
                                        restoreCaretPosition(el, caretPos);
                                      });
                                    }}
                                    className="w-full min-h-[40px] p-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-200 bg-white text-center"
                                    data-placeholder={`Column ${colIndex + 1}`}
                                    data-matrix-column={colIndex}
                                  />
                                )}
                                {editingFields[`matrixColumn-${colIndex}`] && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="mt-1 h-6 py-0 px-2 text-xs"
                                    onClick={() => toggleEdit(`matrixColumn-${colIndex}`, false)}
                                  >
                                    Done
                                  </Button>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matrixEdit.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              <td className="border p-2 w-[200px] align-top">
                                <div className="flex items-start gap-2">
                                  {/* See the column header note: rendered until clicked. */}
                                  {!editingFields[`matrixRow-${rowIndex}`] ? (
                                    <div
                                      className="w-full min-h-[50px] p-2 border rounded-md border-gray-200 bg-white cursor-pointer hover:border-blue-400"
                                      onClick={() => toggleEdit(`matrixRow-${rowIndex}`, true)}
                                      title="Click to edit"
                                    >
                                      {String(row ?? '').trim()
                                        ? <LatexRenderer content={row} />
                                        : <span className="text-gray-400">{`Enter row ${rowIndex + 1} label...`}</span>}
                                    </div>
                                  ) : (
                                    <div
                                      contentEditable
                                      suppressContentEditableWarning
                                      dangerouslySetInnerHTML={{ __html: row }}
                                      onInput={(e) => {
                                        const el = e.currentTarget as HTMLElement;
                                        const caretPos = saveCaretPosition(el);

                                        const newValue = el.innerHTML;
                                        setMatrixEdit(prev => ({
                                          ...prev,
                                          rows: prev.rows.map((rr, i) => i === rowIndex ? newValue : rr)
                                        }));

                                        requestAnimationFrame(() => {
                                          restoreCaretPosition(el, caretPos);
                                        });
                                      }}
                                      onPaste={(e) => {
                                        const el = e.currentTarget as HTMLElement;
                                        const caretPos = saveCaretPosition(el);

                                        insertRawFromClipboard(e);
                                        requestAnimationFrame(() => {
                                          const newValue = el.innerHTML;
                                          setMatrixEdit(prev => ({
                                            ...prev,
                                            rows: prev.rows.map((rr, i) => i === rowIndex ? newValue : rr)
                                          }));
                                          restoreCaretPosition(el, caretPos);
                                        });
                                      }}
                                      className="w-full min-h-[50px] p-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-200 relative z-10"
                                      data-placeholder={`Enter row ${rowIndex + 1} label...`}
                                      data-matrix-row={rowIndex}
                                    />
                                  )}
                                  {editingFields[`matrixRow-${rowIndex}`] && (
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-6 py-0 px-2 text-xs mt-2"
                                      onClick={() => toggleEdit(`matrixRow-${rowIndex}`, false)}
                                    >
                                      Done
                                    </Button>
                                  )}
                                </div>
                              </td>
                              {matrixEdit.columns.map((_, colIndex) => (
                                <td key={colIndex} className="border border-gray-300 p-2 text-center align-top">
                                  <input
                                    type="radio"
                                    name={`matrix-row-${rowIndex}`}
                                    className="accent-blue-600"
                                    checked={matrixEdit.answers[rowIndex] === colIndex}
                                    onChange={() => setMatrixEdit(prev => ({
                                      ...prev,
                                      answers: prev.answers.map((a, i) => i === rowIndex ? colIndex : a)
                                    }))}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Matrix Table Validation Errors */}
                  {errors.matrixRows && (
                    <p className="text-red-500 text-sm mt-2">{errors.matrixRows}</p>
                  )}
                  {errors.matrixColumns && (
                    <p className="text-red-500 text-sm mt-2">{errors.matrixColumns}</p>
                  )}

                  {errors.correctAnswer && (
                    <p className="text-red-500 text-sm mt-2">{errors.correctAnswer}</p>
                  )}

                </div>
              </div>
            </>
          )}

          {/* Feedback Section - For Matrix Questions */}
          {String(questionType).toLowerCase().includes('matrix') && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <Label className="text-lg font-semibold text-gray-800">Feedback</Label>
                  <p className="text-sm text-gray-500">Provide explanations for each option</p>
                </div>
              </div>

              <div className="space-y-6">
                {matrixEdit.rows.map((row, index) => {
                  const feedbackKey = `FeedbackOption${String.fromCharCode(65 + index)}`;
                  const selectedColumnIndex = matrixEdit.answers[index];
                  const correctResponse = selectedColumnIndex >= 0 && matrixEdit.columns[selectedColumnIndex]
                    ? matrixEdit.columns[selectedColumnIndex]
                    : 'N/A';
                  const rawFeedback = matrixEdit.feedbacks[index] || '';
                  const feedbackText = rawFeedback.replace(/^\s*(Correct|Incorrect)[:.]?\s*/i, '');

                  return (
                    <div key={feedbackKey} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">Row value:</span>
                          <div className="text-sm text-gray-800 flex-1"><LatexRenderer content={row}></LatexRenderer></div>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">Correct response:</span>
                          <div className="text-sm text-gray-800 flex-1"><LatexRenderer content={correctResponse}></LatexRenderer></div>
                        </div>
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex items-start gap-2">
                            <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0 mt-2">Feedback:</span>
                            {!editingFields[`matrixFeedback-${index}`] ? (
                              <div
                                className="w-full flex-1 min-h-[40px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-gray-50 relative group border-gray-200"
                                onClick={() => toggleEdit(`matrixFeedback-${index}`, true)}
                              >
                                {/* <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button size="sm" variant="secondary" className="h-6 py-0 px-2 text-xs">✏️ Edit</Button>
                                </div> */}
                                <LatexRenderer content={feedbackText} />
                              </div>
                            ) : (
                              <div className="relative flex-1">
                                <div
                                  contentEditable
                                  suppressContentEditableWarning
                                  dangerouslySetInnerHTML={{ __html: feedbackText }}

                                  onInput={(e) => {
                                    const el = e.currentTarget as HTMLElement;
                                    const caretPos = saveCaretPosition(el);
                                    const newValue = el.innerHTML;
                                    setMatrixEdit(prev => ({
                                      ...prev,
                                      feedbacks: prev.feedbacks.map((fb, i) =>
                                        i === index ? newValue : fb
                                      ),
                                    }));
                                    requestAnimationFrame(() => {
                                      restoreCaretPosition(el, caretPos);
                                    });

                                  }}
                                  className="text-sm text-gray-800 w-full min-h-[60px] border border-gray-200 bg-white resize-none p-2 pr-16 rounded"
                                  data-placeholder="Enter feedback explanation..."
                                />
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="absolute top-1 right-1 h-6 py-0 px-2 text-xs"
                                  onClick={() => toggleEdit(`matrixFeedback-${index}`, false)}
                                >
                                  Done
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {errors.matrixFeedbacks && (
                <p className="text-red-500 text-sm mt-2">{errors.matrixFeedbacks}</p>
              )}
            </div>
          )}

          {/* Answer Section - Only for Written Response */}
          {questionType === 'Written Response' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Answer</h3>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="space-y-3">
                  {/* HTML Editor */}
                  {!editingFields['writtenResponseAnswer'] ? (
                    <div
                      className={`min-h-[150px] w-full p-4 border rounded-md cursor-pointer hover:border-blue-400 bg-white relative group ${errors.correctAnswer ? 'border-red-500' : 'border-gray-200'}`}
                      onClick={() => toggleEdit('writtenResponseAnswer', true)}
                    >
                      {/* <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="secondary" className="h-7 text-xs">✏️ Edit</Button>
                      </div> */}
                      <LatexRenderer content={formData.correctAnswer || ''} />
                    </div>
                  ) : (
                    <div className="relative">
                      <div
                        ref={questionStemRef}
                        contentEditable
                        suppressContentEditableWarning
                        data-correct-answer-editor
                        className={`min-h-[150px] text-gray-900 bg-white border border-gray-200 rounded-md p-4 pr-16 whitespace-pre-wrap break-words focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.correctAnswer ? 'border-red-500 focus:ring-red-500' : ''}`}
                        dangerouslySetInnerHTML={{ __html: formData.correctAnswer || '' }}

                        onInput={(e) => {
                          const el = e.currentTarget as HTMLElement;
                          const caretPos = saveCaretPosition(el);

                          const value = el.innerHTML;
                          handleInputChange('correctAnswer', value);
                          if (onCorrectAnswerChange) {
                            onCorrectAnswerChange(value);
                          }

                          if (errors.correctAnswer) {
                            setErrors(prev => ({ ...prev, correctAnswer: '' }));
                          }

                          requestAnimationFrame(() => {
                            restoreCaretPosition(el, caretPos);
                          });
                        }}
                      />
                      <Button
                        size="sm"
                        variant="default"
                        className="absolute top-2 right-2 h-7"
                        onClick={() => toggleEdit('writtenResponseAnswer', false)}
                      >
                        Done
                      </Button>
                    </div>
                  )}
                  {errors.correctAnswer && (
                    <p className="text-red-500 text-sm mt-2">{errors.correctAnswer}</p>
                  )}
                </div>
              </div>

              {/* Key Points Section */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                    <ListChecks className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <Label className="text-lg font-semibold text-gray-800">Key Points</Label>
                    <p className="text-sm text-gray-500">Add key points that should be included in the answer</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {keyPoints.length > 0 ? (
                    keyPoints.map((point, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="flex-1">
                          {!editingFields[`keyPoint-${index}`] ? (
                            <div
                              className={`w-full min-h-[40px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-gray-50 relative group ${errors.keyPoints?.[index] ? 'border-red-500' : 'border-gray-200'}`}
                              onClick={() => toggleEdit(`keyPoint-${index}`, true)}
                            >
                              {/* <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" variant="secondary" className="h-6 py-0 px-2 text-xs">✏️ Edit</Button>
                              </div> */}
                              <LatexRenderer content={point} />
                            </div>
                          ) : (
                            <div className="relative">
                              <div
                                ref={questionStemRef}
                                contentEditable
                                suppressContentEditableWarning
                                dangerouslySetInnerHTML={{ __html: point }}
                                onInput={(e) => {
                                  // Save cursor position before state update
                                  const selection = window.getSelection();
                                  const range = selection?.getRangeAt(0);
                                  const cursorOffset = range?.startOffset || 0;
                                  const cursorContainer = range?.startContainer;

                                  const newValue = (e.currentTarget as HTMLElement).innerHTML;
                                  updateKeyPoint(index, newValue);

                                  // Restore cursor position after state update
                                  requestAnimationFrame(() => {
                                    if (questionStemRef.current && cursorContainer) {
                                      try {
                                        const newRange = document.createRange();

                                        // Use the current cursor container and offset directly
                                        // since we want to maintain the cursor position after the input
                                        if (cursorContainer && questionStemRef.current.contains(cursorContainer)) {
                                          // Use the same container and offset from before state update
                                          const offset = Math.min(cursorOffset, cursorContainer.textContent?.length || 0);
                                          newRange.setStart(cursorContainer, offset);
                                          newRange.collapse(true);
                                          const newSelection = window.getSelection();
                                          newSelection?.removeAllRanges();
                                          newSelection?.addRange(newRange);
                                        } else {
                                          // Fallback: place cursor at the end
                                          const range = document.createRange();
                                          range.selectNodeContents(questionStemRef.current);
                                          range.collapse(false);
                                          const selection = window.getSelection();
                                          selection?.removeAllRanges();
                                          selection?.addRange(range);
                                        }
                                      } catch (error) {
                                        // Fallback: place cursor at the end
                                        if (questionStemRef.current) {
                                          const range = document.createRange();
                                          range.selectNodeContents(questionStemRef.current);
                                          range.collapse(false);
                                          const selection = window.getSelection();
                                          selection?.removeAllRanges();
                                          selection?.addRange(range);
                                        }
                                      }
                                    }
                                  });
                                }}
                                onPaste={(e) => {
                                  insertRawFromClipboard(e);
                                  requestAnimationFrame(() => {
                                    const newValue = (e.currentTarget as HTMLElement).innerHTML;
                                    updateKeyPoint(index, newValue);
                                  });
                                }}
                                className={`w-full min-h-[40px] pr-16 p-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${errors.keyPoints?.[index] ? 'border-red-500' : 'border-gray-200'}`}
                                data-placeholder={`Key point ${index + 1}`}
                                data-key-point-input={index}
                              />
                              <Button
                                size="sm"
                                variant="default"
                                className="absolute top-1 right-1 h-6 py-0 px-2 text-xs"
                                onClick={() => toggleEdit(`keyPoint-${index}`, false)}
                              >
                                Done
                              </Button>
                            </div>
                          )}
                          {errors.keyPoints?.[index] && (
                            <p className="mt-1 text-sm text-red-500">
                              {errors.keyPoints[index]}
                            </p>
                          )}
                        </div>
                        {/* {keyPoints.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeKeyPoint(index)}
                            className="text-gray-400 hover:text-red-500 mt-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )} */}
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 italic">No key points added yet</div>
                  )}
                  {/* <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    onClick={addKeyPoint}
                    disabled={keyPoints.length > 0 && keyPoints[keyPoints.length - 1]?.trim() === ''}>
                    <Plus className="w-4 h-4" />
                    Add Key Point
                  </Button> */}
                </div>
              </div>
            </div>
          )}

          {/* Feedback Section - Only for Multiple Choice and True/False */}
          {/* Select the Blank has its own per-option feedback editor above. Its stored
              `type` reads "Select the Blank" (not "Fill In the Blank"), so without this
              guard the generic card rendered underneath it as a second Feedback section —
              the Options section at the top already excludes it the same way. */}
          {questionType !== 'Written Response' && !String(questionType).toLowerCase().includes('fill in the blank') && !String(questionType).toLowerCase().includes('matrix') && !isSelectTheBlankQuestion && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <Label className="text-lg font-semibold text-gray-800">Feedback</Label>
                  <p className="text-sm text-gray-500">Provide explanations for each option</p>
                </div>
              </div>

              <div className="space-y-6">
                {String(questionType).toLowerCase().includes('true false')
                  ? [0, 1].map((index) => {
                    const optionLetter = String.fromCharCode(65 + index);
                    const feedbackKey = `FeedbackOption${optionLetter}`;
                    const isCorrect = formData.correctAnswer === (index === 0 ? "True" : "False");
                    const full = formData[feedbackKey] || '';
                    const match = full.trim().match(/^(Correct\.|Incorrect\.)\s*(.*)$/i);
                    const prefix = match ? match[1] : (isCorrect ? 'Correct.' : 'Incorrect.');
                    const suffix = match ? match[2] : full;

                    return (
                      <div key={optionLetter} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                              {optionLetter}
                            </span>
                            <span className="text-sm font-semibold text-gray-800">
                              {isCorrect ? 'Correct Answer' : 'Option ' + optionLetter}
                            </span>
                          </div>
                          {isCorrect && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <Check className="w-3 h-3 mr-1" /> Correct
                            </span>
                          )}
                        </div>
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          dangerouslySetInnerHTML={{ __html: suffix }}
                          onInput={(e) => {
                            const el = e.currentTarget as HTMLElement;
                            const caretPos = saveCaretPosition(el);

                            const newSuffix = el.innerHTML.trim();
                            const newFull = ((prefix || (isCorrect ? 'Correct.' : 'Incorrect.')) + ' ' + newSuffix).trim();
                            handleInputChange(feedbackKey, newFull);

                            requestAnimationFrame(() => {
                              restoreCaretPosition(el, caretPos);
                            });
                          }}


                          className={`flex-1 min-h-[80px] p-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${errors[`FeedbackOption${optionLetter}`] ? "border-red-500" : "border-gray-200"
                            }`}
                          data-placeholder={`Enter feedback for option ${optionLetter}...`}
                          data-feedback-input={optionLetter}
                        />
                        {errors[`FeedbackOption${optionLetter}`] && <p className="text-red-500 text-sm mt-1">{errors[`FeedbackOption${optionLetter}`]}</p>}
                      </div>
                    );
                  })
                  : options.map((option, index) => {
                    const optionLetter = String.fromCharCode(65 + index);
                    const feedbackKey = `FeedbackOption${optionLetter}`;
                    // Handle both Multiple Choice and Multiple Response correct answer detection
                    const isCorrect = String(questionType).toLowerCase().includes('multiple response')
                      ? formData.correctAnswer?.split('|||').some(answer => {
                        const cleanAnswer = answer.trim().replace(/^[A-Z]\.\s*/, '').toLowerCase();
                        const cleanOption = option.replace(/^[A-Z]\.\s*/, '').toLowerCase();
                        return cleanAnswer === cleanOption || answer.trim() === option || answer.trim() === `${optionLetter}. ${option}`;
                      })
                      : formData.correctAnswer === option;
                    const full = formData[feedbackKey] || '';
                    const match = full.trim().match(/^(Correct\.|Incorrect\.)\s*(.*)$/i);
                    const suffix = match ? match[2] : full;
                    const prefix = isCorrect ? 'Correct.' : 'Incorrect.';

                    return (
                      <div key={optionLetter} className={`p-4 rounded-lg border ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                              {optionLetter}
                            </span>
                            <span className="text-sm font-semibold text-gray-800">
                              {isCorrect ? 'Correct Answer' : 'Option ' + optionLetter}
                            </span>
                          </div>
                          {isCorrect && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <Check className="w-3 h-3 mr-1" /> Correct
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 items-start w-full">
                          <div data-feedback-prefix={optionLetter} className={`min-w-[110px] text-sm font-medium p-2 rounded ${prefix.toLowerCase().startsWith('correct') ? 'text-green-700 bg-green-100 border border-green-200' : 'text-red-700 bg-red-100 border border-red-200'}`}>
                            {prefix || (isCorrect ? 'Correct.' : 'Incorrect.')}
                          </div>

                          {!editingFields[`FeedbackOption${optionLetter}`] ? (
                            <div
                              className={`w-full flex-1 min-h-[40px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-gray-50 relative group ${errors[`FeedbackOption${optionLetter}`] ? 'border-red-500' : 'border-gray-200'}`}
                              onClick={() => toggleEdit(`FeedbackOption${optionLetter}`, true)}
                            >
                              {/* <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" variant="secondary" className="h-6 py-0 px-2 text-xs">✏️ Edit</Button>
                              </div> */}
                              <LatexRenderer content={suffix || ''} />
                            </div>
                          ) : (
                            <div className="relative flex-1">
                              <div
                                contentEditable
                                suppressContentEditableWarning
                                dangerouslySetInnerHTML={{ __html: suffix }}
                                onInput={(e) => {
                                  const el = e.currentTarget as HTMLElement;
                                  const caretPos = saveCaretPosition(el);

                                  const newSuffix = el.innerHTML.trim();
                                  const newFull = ((prefix || (isCorrect ? 'Correct.' : 'Incorrect.')) + ' ' + newSuffix).trim();
                                  handleInputChange(feedbackKey, newFull);

                                  requestAnimationFrame(() => {
                                    restoreCaretPosition(el, caretPos);
                                  });
                                }}
                                onPaste={(e) => {
                                  insertRawFromClipboard(e);
                                  requestAnimationFrame(() => {
                                    const newSuffix = (e.currentTarget as HTMLElement).innerHTML.trim();
                                    const newFull = ((prefix || (isCorrect ? 'Correct.' : 'Incorrect.')) + ' ' + newSuffix).trim();
                                    handleInputChange(feedbackKey, newFull);
                                  });
                                }}
                                className={`w-full min-h-[80px] p-2 pr-16 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white ${errors[`FeedbackOption${optionLetter}`] ? 'border-red-500' : 'border-gray-200'}`}
                                data-placeholder={`Enter feedback for option ${optionLetter}...`}
                                data-feedback-input={optionLetter}
                              />
                              <Button
                                size="sm"
                                variant="default"
                                className="absolute top-1 right-1 h-6 py-0 px-2 text-xs"
                                onClick={() => toggleEdit(`FeedbackOption${optionLetter}`, false)}
                              >
                                Done
                              </Button>
                            </div>
                          )}
                        </div>
                        {errors[`FeedbackOption${optionLetter}`] && <p className="text-red-500 text-sm mt-1 ml-[122px]">{errors[`FeedbackOption${optionLetter}`]}</p>}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Question Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                <FileQuestion className="w-4 h-4 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Question Details</h3>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 text-sm">
                {/* Column 1 */}
                <div className="space-y-4">
                  <p className="break-words"><strong>Type:</strong> {question?.type || 'N/A'}</p>
                  <p className="break-words"><strong>Source:</strong> {getSourceLabel(question) || 'N/A'}</p>
                  {/* See the note in the preview dialog: prefer the question's own chapter. */}
                  <p className="break-words"><strong>Study:</strong> {questionData?.study || question?.study || sessionStorage.getItem('selectedChapterName') || 'N/A'}</p>
                  <p className="break-words"><strong>Taxonomy:</strong> {questionData?.taxonomy || 'N/A'}</p>
                  {/* <p><strong>Reference info:</strong> {question?.ReferenceInfo || 'N/A'}</p> */}
                  <p className="break-words"><strong>User Name:</strong> {question?.userName || 'N/A'}</p>
                </div>
                {/* Column 2 */}
                <div className="space-y-4">
                  <p className="break-words"><strong>Marks:</strong> {question?.MaxMarks || 'N/A'}</p>
                  <p className="break-words"><strong >Book Name:</strong> {question?.bookname || 'N/A'}</p>
                  <p className="break-words"><strong>Learning Objective:</strong> {question?.learningObjective || 'N/A'}</p>
                  <p className="break-words"><strong>Creativity Level:</strong> {question?.creativitylevelname || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Key Points. The condition was `questionType === 'written-response'`, a slug
              this dialog never produces (it holds the label, e.g. "Written Response"),
              so the block never rendered; Written Response has its own section above.
              It now shows Select the Blank's key points, and only when it has some. */}
          {isSelectTheBlankQuestion && keyPoints.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Key Points</h3>
                </div>
              </div>

              <div className="space-y-2">
                {keyPoints.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                    No key points added yet. Click the button above to add one.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {keyPoints.map((point, index) => (
                      <div key={index} className="flex flex-col gap-2 group w-full">
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium mt-1 flex-shrink-0">
                            {index + 1}
                          </div>
                          {!editingFields[`keyPoint-${index}`] ? (
                            <div
                              className={`w-full flex-1 min-h-[40px] p-2 border rounded-md cursor-pointer hover:border-blue-400 bg-gray-50 relative group ${errors.keyPoints?.[index] ? 'border-red-500' : 'border-gray-200'}`}
                              onClick={() => toggleEdit(`keyPoint-${index}`, true)}
                            >
                              {/* <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" variant="secondary" className="h-6 py-0 px-2 text-xs">✏️ Edit</Button>
                              </div> */}
                              <LatexRenderer content={point} />
                            </div>
                          ) : (
                            <div className="relative flex-1">
                              <Textarea
                                id="correct-answer-textarea"
                                value={point}
                                onChange={(e) => updateKeyPoint(index, e.target.value)}
                                className={`min-h-[40px] w-full pr-16 ${errors.keyPoints?.[index] ? 'border-red-500' : ''}`}
                                placeholder={`Key point ${index + 1}...`}
                              />
                              <Button
                                size="sm"
                                variant="default"
                                className="absolute top-1 right-1 h-6 py-0 px-2 text-xs"
                                onClick={() => toggleEdit(`keyPoint-${index}`, false)}
                              >
                                Done
                              </Button>
                            </div>
                          )}
                        </div>
                        {errors.keyPoints?.[index] && (
                          <p className="ml-8 text-sm text-red-500 mt-1">{errors.keyPoints[index]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Validation Message - Always render but control visibility with opacity */}
        <div className={`px-4 transition-all duration-300 ${validationMessage.text ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
          <div
            className={`p-4 mb-4 rounded-md transition-all duration-200 transform hover:scale-[1.005] hover:shadow-md ${validationMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200 hover:border-green-300'
              : validationMessage.type === 'error'
                ? 'bg-red-50 text-red-800 border border-red-200 hover:border-red-300'
                : 'bg-blue-50 text-blue-800 border border-blue-200 hover:border-blue-300'
              }`}
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
            }}
          >
            <div className="space-y-3">
              <div className="flex items-start">
                {validationMessage.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 mr-2 text-green-600 flex-shrink-0 mt-0.5" />
                ) : validationMessage.type === 'error' ? (
                  <AlertCircle className="w-5 h-5 mr-2 text-red-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-5 h-5 mr-2 text-blue-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium break-words">{validationMessage.text}</p>

                  {validationMessage.details?.reasoning && (
                    <div className="mt-2 p-3 bg-white bg-opacity-50 rounded-md whitespace-pre-line">
                      <h4 className="font-medium text-sm text-gray-700 mb-1">Reasoning:</h4>
                      <p className="text-sm">{validationMessage.details.reasoning.replace(/\\n/g, '\n').trim()}</p>
                    </div>
                  )}

                  {validationMessage.details?.items && validationMessage.details.items.length > 0 && (
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-gray-700">Validation Details:</h4>
                      <div className="space-y-2">
                        {validationMessage.details.items.map((item, idx) => (
                          <div key={idx} className="flex items-start text-sm">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 flex-shrink-0 mt-0.5 ${item.status === 'PASS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                              {item.status === 'PASS' ? '✓' : '✗'}
                            </span>
                            <div className="whitespace-pre-line">
                              <span className="font-medium">{item.item}:</span>
                              <span className="text-gray-700 ml-1">{item.details.replace(/^n/, '').replace(/\\n/g, '\n').trim()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {validationMessage.details?.conclusion && (
                    <div className="mt-3 p-3 bg-white bg-opacity-50 rounded-md border-l-4 border-yellow-300">
                      <h4 className="font-medium text-sm text-gray-700 mb-1">Conclusion:</h4>
                      <p className="text-sm">{validationMessage.details.conclusion}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-10">
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: -25,
              background: "#fff",
              borderTop: "1px solid #eee",
              padding: "16px 24px",
              zIndex: 20,
              boxShadow: "0 -2px 8px rgba(0,0,0,0.02)"
            }}
            className="flex justify-end gap-3"
          >
            <Button
              variant="outline"
              onClick={onClose}
              className="flex items-center gap-2"
              title="Cancel"
              disabled={isValidating}
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>

            {/* {featurePreferences.isValidate === 1 && (
              <Button
                type="button"
                onClick={handleValidate}
                disabled={isValidating}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                title="Validate Question">
                {isValidating ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
                    Validating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Validate
                  </>
                )}
              </Button>
            )} */}
            <Button
              onClick={handleSave}
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white flex items-center gap-2"
              title="Save"
              disabled={isValidating}>
              <Check className="w-4 h-4" />
              Save Changes
            </Button>
          </div>
        </div>
        {showKeyboard && open && createPortal(
          <VirtualMathKeyboard onClose={() => setShowKeyboard(false)} />,
          document.body
        )}

        {/* Image Regeneration Modal (Additional Instructions) */}
        <Dialog open={isImageInstructionModalOpen} onOpenChange={setIsImageInstructionModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Regenerate Image</DialogTitle>
              <DialogDescription>
                Provide specific instructions on how to regenerate the image for this question.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-image-instructions" className="text-right">
                  Additional Instructions
                </Label>
                <Textarea
                  id="edit-image-instructions"
                  value={imageInstructionText}
                  onChange={(e) => setImageInstructionText(e.target.value)}
                  placeholder="e.g., Make it a bar chart instead of a pie chart, remove the labels..."
                  className="col-span-3 min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsImageInstructionModalOpen(false)}>Cancel</Button>
              <Button onClick={handleRegenerateImageSubmit} disabled={isRegeneratingImage || !imageInstructionText.trim()}>
                {isRegeneratingImage ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generating...
                  </>
                ) : 'Regenerate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Select Image from Repository Modal */}
        <Dialog open={isImageSelectModalOpen} onOpenChange={setIsImageSelectModalOpen}>
          <DialogContent className="sm:max-w-2xl w-[95vw] sm:w-full max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-3 sm:p-4 gap-2">
            <DialogHeader>
              <DialogTitle>Select Image from Repository</DialogTitle>
              <DialogDescription>
                Choose an image from Repository
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="flex flex-col gap-4">
                <div className="flex gap-4 items-center justify-between">
                  <div className="flex gap-4 items-center">
                    <Label>Destination:</Label>
                    <Select value={imageSelectDestination} onValueChange={(val: any) => setImageSelectDestination(val)}>
                      <SelectTrigger className="w-[200px] focus:ring-offset-0 focus:ring-inset">
                        <SelectValue placeholder="Select Destination" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General Images</SelectItem>
                        <SelectItem value="specific">Question Specific Folder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <input
                      type="file"
                      ref={localFileInputRef}
                      accept=".png, .jpg, .jpeg, image/png, image/jpeg"
                      onChange={handleLocalImageBrowse}
                      className="hidden"
                      multiple
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => localFileInputRef.current?.click()}
                      className="flex items-center gap-2 text-xs border-gray-300 hover:bg-gray-50"
                    >
                      <Upload className="h-4 w-4 text-blue-600" />
                      Browse Local Image
                    </Button>
                  </div>
                </div>
                {imageSelectDestination === "specific" && (
                  <div className="text-xs text-gray-700 bg-blue-50 p-3 rounded-lg border border-blue-100 flex flex-col gap-2">
                    <div>
                      <Label className="mb-1 block font-semibold">Book</Label>
                      <Input readOnly value={imageSelectTarget?.bookname || imageSelectTarget?.BookName || sessionStorage.getItem('bookTitle') || 'Book'} className="bg-white h-8 text-xs cursor-default focus-visible:ring-0" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1 block font-semibold">Chapter</Label>
                        <Select value={modalSelectedChapter} onValueChange={setModalSelectedChapter}>
                          <SelectTrigger className="h-8 bg-white text-xs focus:ring-offset-0 focus:ring-inset">
                            <SelectValue placeholder="Select Chapter" />
                          </SelectTrigger>
                          <SelectContent>
                            {modalChapters.map((c: any) => (
                              <SelectItem key={String(chapterKeyOf(c))} value={String(chapterKeyOf(c))}>
                                {chapterNameOf(c)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="mb-1 block font-semibold">Learning Objective (LO)</Label>
                        <Select value={modalSelectedLO} onValueChange={setModalSelectedLO} disabled={modalSelectedChapter === "all"}>
                          <SelectTrigger className="h-8 bg-white text-xs focus:ring-offset-0 focus:ring-inset">
                            <SelectValue placeholder="All LOs" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All LOs</SelectItem>
                            {modalLOs.map((l: any) => (
                              <SelectItem key={String(loKeyOf(l))} value={String(loKeyOf(l))}>
                                {loNameOf(l)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Select Image</Label>
                  <div className="h-[clamp(120px,24vh,240px)] overflow-y-auto border rounded-md p-2 bg-gray-50">
                    {isLoadingRepoImages ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : repositoryImages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        No images found in this folder.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {repositoryImages.map((img: any, idx: number) => {
                          const url = img.backend_download_url || img.url;
                          const isSelected = selectedRepoImages.includes(url);
                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedRepoImages(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url])}
                              className={`relative cursor-pointer border-2 rounded overflow-hidden aspect-square ${isSelected ? 'border-blue-600 ring-2 ring-blue-300' : 'border-transparent hover:border-blue-300'}`}
                            >
                              <img src={url} alt={img.filename || 'repo image'} className="w-full h-full object-contain bg-white" title={img.filename} loading="lazy" />
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="absolute top-1 left-1 w-4 h-4 accent-blue-600 pointer-events-none"
                              />
                              {isSelected && (
                                <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shadow">
                                  {selectedRepoImages.indexOf(url) + 1}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {imageUploadError && (
              <p role="alert" className="text-sm font-medium text-red-600 px-1">{imageUploadError}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsImageSelectModalOpen(false)}>Cancel</Button>
              <Button onClick={handleImageSelectSubmit} disabled={selectedRepoImages.length === 0}>
                {selectedRepoImages.length > 1 ? `Apply ${selectedRepoImages.length} Images` : 'Apply Selected Image'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};
