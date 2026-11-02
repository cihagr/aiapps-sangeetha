import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogOverlay } from "@/components/ui/dialog"
import { useState, useEffect, useRef, type ReactNode, type HTMLAttributes } from "react"
import { createPortal } from "react-dom";
const API_QUIZ_URL = import.meta.env.VITE_API_QUIZ_URL;
import { Link, useNavigate } from "react-router-dom"
import LatexRenderer from './LatexRenderer';
import RepoImage from '@/components/RepoImage';
import VirtualMathKeyboard from './VirtualMathKeyboard.jsx';
import { regenerateQuestionImageWithOptions, getOptionImages, findOptionImageUrl, type OptionImage } from '@/utils/questionImageGeneration';
import { generateImageForQuestion } from '@/utils/imageGeneration';
import { getChapters, getLearningObjectives, AGENT_GENERATIVE_API_URL, AIG_QUIZ_GEN_URL } from '@/utils/Aigapi';
import { API_ENDPOINTS } from '@/config';
import { getTableAnalysis, getSortedRows, getSortOptions } from '@/utils/tableAnalysis';
import { Input } from '@/components/ui/input';

import {
  ArrowLeft,
  Zap,
  CheckCircle2,
  Clock,
  BookOpen,
  FileText,
  FileSpreadsheet,
  Database,
  Edit3,
  Eye,
  Trash2,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Target,
  User,
  Hash,
  AlignLeft,
  X,
  XCircle,
  AlertCircle,
  Plus,
  Star,
  GraduationCap,
  FileQuestion,
  MessageSquare,
  List,
  Check,
  Info,
  Settings2,
  ThumbsUp,
  ThumbsDown,
  Keyboard,
  Upload,
  ImagePlus,
  Volume2,
  VolumeX,
  RefreshCw,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

import { getFromDB, fetchUsageStats } from "@/utils/Aigapi";
import axios from "axios";
import { saveAs } from "file-saver"
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, ImageRun, AlignmentType, VerticalAlign } from "docx"
import {
  buildSpeechText,
  cancelSpeech,
  cleanTextForSpeech as cleanTextForSpeechShared,
  installSpeechAutoStop,
  speakText,
  languageFromQuestionId,
} from "@/utils/speech"
import { toExportText, toExportOptionText } from "@/utils/exportText"
import { containsStemText, dedupeRepeatedText, dedupeStem } from "@/utils/stemText"
import { isDropdownBlankQuestion } from "@/utils/questionType"
import { fitWithin, loadExportImage, toEmbeddableImages } from "@/utils/exportImages"
import { embedRowImages, rowImageSources } from "@/utils/excelImages"
import { buildImageFolderPath, resolveImageBookName, resolveImageScope } from "@/utils/imageRepoPath"
import { listScopedImages, appendImageScopeFields } from "@/utils/imageRepoApi"
import { chapterKeyOf, chapterNameOf, loKeyOf, loNameOf } from "@/utils/chapterLo";
import { fileToStorableDataUrl } from "@/utils/imageData"

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

function generateUniqueId() {
  return 'q_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
}

/** Option editors are contentEditable divs; read plain text for validation / comparisons. */
function readOptionEditorPlain(el: Element | null): string {
  if (!el) return '';
  return ((el as HTMLElement).textContent || '').trim();
}

/** Persist option markup like the question stem (innerHTML when non-empty). */
function readOptionEditorStored(el: Element | null): string {
  if (!el) return '';
  const h = el as HTMLElement;
  const plain = readOptionEditorPlain(h);
  if (!plain) return '';
  const html = (h.innerHTML || '').trim();
  return html || plain;
}

/** Plain text from stored HTML or LaTeX source (for comparisons / validation). */
function storedMarkupToPlain(s: string): string {
  const t = String(s || '').trim();
  if (!t) return '';
  if (!optionPreviewHasHtml(t)) return t;
  const d = document.createElement('div');
  d.innerHTML = t;
  return (d.textContent || '').trim();
}

/** Plain text from editor HTML (for matching / validation). */
function htmlToPlain(html: string): string {
  const d = document.createElement('div');
  d.innerHTML = String(html || '');
  return (d.textContent || '').trim();
}

function optionPreviewHasHtml(value: string): boolean {
  return typeof value === 'string' && /<[^>]+>/.test(value);
}

function renderOptionPreviewContent(value: string): ReactNode {
  const content = String(value || '');
  if (!content) return null;
  if (optionPreviewHasHtml(content)) {
    return <div className="leading-relaxed text-sm whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: content }} />;
  }
  return <LatexRenderer content={content} />;
}

function resolveQuestionImageUrl(question: any, imageMap?: Map<string, string>): string {
  const direct = String(question?.generatedImageUrl || (question?.generated_image ? `data:image/jpeg;base64,${question.generated_image}` : null) || question?.imageUrl || '').trim();
  let img = direct;
  if (!img) {
    const id = String(question?.id || question?.questionid || '').trim();
    if (id && imageMap?.get(id)) img = String(imageMap.get(id) || '').trim();
  }
  if (img.includes('NOT REQUIRED') || img.includes('NO_IMAGE_REQUIRED')) {
    return '';
  }
  return img;
}

// Collapse a duplicated question stem (mirrors the list rendering logic):
// 1) if the text is exactly two identical halves, keep one half;
// 2) if the text ends with / contains the PartPrompt duplicate, strip it.
function dedupeStemText(rawText: string, partPrompt?: string): string {
  return dedupeStem(rawText, partPrompt);
}

function formatImageForExport(imageUrl: string): string {
  const v = String(imageUrl || '').trim();
  if (!v) return 'N/A';
  if (v.startsWith('data:image/')) return 'Embedded image (base64)';
  return v;
}

function parseEmbeddedImageDataUrl(imageUrl: string): { extension: 'png' | 'jpg'; base64: string } | null {
  const v = String(imageUrl || '').trim();
  const match = v.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  const extension = match[1].toLowerCase() === 'png' ? 'png' : 'jpg';
  return { extension, base64: match[2] };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

type RichHtmlLatexFieldProps = {
  initialHtml: string;
  remountKey: string;
  editorClassName: string;
  validationError?: string;
  editLabel?: string;
  previewLabel?: string;
  showPreview?: boolean;
  editorDataProps?: Record<string, string | number | boolean | undefined>;
  onEditorInput?: (html: string) => void;
  onEditorBlur?: (html: string) => void;
};

function RichHtmlLatexField({
  initialHtml,
  remountKey,
  editorClassName,
  validationError,
  editLabel,
  previewLabel = 'Preview',
  showPreview = true,
  editorDataProps = {},
  onEditorInput,
  onEditorBlur,
}: RichHtmlLatexFieldProps) {
  const [previewSource, setPreviewSource] = useState(initialHtml);

  useEffect(() => {
    setPreviewSource(initialHtml);
  }, [initialHtml, remountKey]);

  return (
    <div className="w-full space-y-2">
      {showPreview ? (
        <div>
          {/* <p className="text-xs font-medium text-gray-500 mb-1">{previewLabel}</p> */}
          {/* <div className="min-h-[36px] w-full rounded-md border border-gray-100 bg-white px-3 py-2 text-sm text-gray-900 whitespace-pre-wrap break-words [&_.latex-renderer]:text-[15px] [&_.latex-renderer]:whitespace-pre-wrap">
            {renderOptionPreviewContent(previewSource)}
          </div> */}
        </div>
      ) : null}
      <div>
        {editLabel ? (
          <p className="text-xs font-medium text-gray-500 mb-1">{editLabel}</p>
        ) : null}
        <div
          key={remountKey}
          contentEditable
          suppressContentEditableWarning
          className={editorClassName}
          dangerouslySetInnerHTML={{ __html: initialHtml }}
          onInput={(e) => {
            const html = (e.currentTarget as HTMLDivElement).innerHTML;
            setPreviewSource(html);
            onEditorInput?.(html);
          }}
          onBlur={(e) => onEditorBlur?.((e.currentTarget as HTMLDivElement).innerHTML)}
          {...(editorDataProps as HTMLAttributes<HTMLDivElement>)}
        />
      </div>

      {validationError ? <p className="text-red-500 text-sm mt-1">{validationError}</p> : null}
    </div>
  );
}

const isSameGeneratedQuestion = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  const getId = (item: any) => {
    const value = item?.id ?? item?.questionid ?? item?.QuestionID ?? item?.questionguid ?? item?.question_uuid ?? item?.uuid ?? null;
    return value != null ? String(value).trim() : '';
  };
  const idA = getId(a);
  const idB = getId(b);
  if (idA && idB && idA === idB) return true;
  const getText = (item: any) => String(item?.label || item?.Question || item?.text || item?.QuestionText || '').trim();
  const textA = getText(a);
  const textB = getText(b);
  return !!textA && !!textB && textA === textB;
};

// Key points exactly as stored on the question.
//
// getKeyPointsFromQuestion falls back to a hardcoded sample list when a question has
// none, which must never be shown as if it belonged to the question. This reads the
// stored value only, so "no key points" stays empty.
const getStoredKeyPoints = (...sources: any[]): string[] => {
  for (const source of sources) {
    const raw = source?.KeyPoints ?? source?.keyPoints;
    let parsed: any = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
    }
    const points = (Array.isArray(parsed) ? parsed : [])
      .map((item: any) => typeof item === 'string' ? item : String(item?.point ?? item?.text ?? ''))
      .filter((item: string) => item.trim().length > 0);
    if (points.length > 0) return points;
  }
  return [];
};

// A dropdown question has exactly one gap. When the stem already carries the gap
// token it has rendered the <select> itself, so repeating the PartPrompt underneath
// would add a SECOND dropdown for the same blank. That happened as soon as an edit
// left the stem no longer containing the PartPrompt verbatim.
const stemAlreadyHasDropdownGap = (q: any): boolean =>
  isDropdownBlankQuestion(q) && /\[\s*(?:dropdown|blank)\s*\d*\s*\]/i.test(getCleanStem(q) || '');

// Select the Blank / Fill In the Blank Dropdown can arrive from the API in a nested
// Blanks[] shape ({ acceptedAnswers, distractors }). Flatten it into the DropdownOptions /
// values / CorrectAnswer fields the rest of the UI reads, leaving already-flat questions alone.
const normalizeBlanksFormat = (q: any): any => {
  if (!q || typeof q !== 'object') return q;
  const imgType = typeof q.generatedimagetype === 'number'
    ? q.generatedimagetype
    : (q.generatedimagetype !== undefined && q.generatedimagetype !== null && q.generatedimagetype !== '')
      ? Number(q.generatedimagetype)
      : 0;
  q.generatedimagetype = imgType;
  const hasBlanks = Array.isArray(q.Blanks) && q.Blanks.length > 0;
  const hasFlatOptions =
    (Array.isArray(q.DropdownOptions) && q.DropdownOptions.length > 0) ||
    (Array.isArray(q.values) && q.values.length > 0);
  if (!hasBlanks || hasFlatOptions) return q;

  const firstBlank = q.Blanks[0] || {};
  const accepted = Array.isArray(firstBlank.acceptedAnswers) ? firstBlank.acceptedAnswers : [];
  const distractors = Array.isArray(firstBlank.distractors) ? firstBlank.distractors : [];
  const correctAnswer = accepted[0] || '';
  const mergedOptions = [correctAnswer, ...distractors].filter(Boolean);

  return {
    ...q,
    generatedimagetype: imgType,
    DropdownOptions: mergedOptions,
    dropdownoptions: mergedOptions,
    values: mergedOptions,
    options: mergedOptions,
    CorrectAnswer: correctAnswer,
    answer: correctAnswer,
    FeedbackOptionA: q.FeedbackOptionA || q.FeedbackBlanks || '',
  };
};

const collectGeneratedQuestions = (source: any): any[] => {
  if (!source) return [];
  if (Array.isArray(source)) return source.map(normalizeBlanksFormat);
  if (typeof source !== 'object') return [];

  // NEW: Handle assessment with tabs format
  if (source.assessment) {
    const ass = source.assessment;
    let q = { ...ass };
    // If question is an object (nested format)
    if (ass.question && typeof ass.question === 'object') {
      q = { ...q, ...ass.question };
      q.question = ass.question.text || ass.question.question || '';
    }

    if (!q.values && q.options) {
      q.values = Array.isArray(q.options)
        ? q.options.map((opt: any) => typeof opt === 'object' ? (opt.text || opt.value || '') : opt)
        : q.options;
    }
    if (!q.CorrectAnswer && q.correct_answer) {
      q.CorrectAnswer = q.correct_answer;
    }
    if (!q.Question && q.question) {
      q.Question = q.question;
    }
    if (!q.QuestionStatement && q.question) {
      q.QuestionStatement = q.question;
    }
    return [normalizeBlanksFormat(q)];
  }



  // Handle MULTI_TAB_PASSAGE format
  if (Array.isArray((source as any).Tabs)) {
    const allTabs = (source as any).Tabs;
    const accumulator: any[] = [];
    allTabs.forEach((tab: any) => {
      if (Array.isArray(tab.Questions)) {
        tab.Questions.forEach((q: any) => {
          // Attach passage and tab info to the question for rendering.
          // Carry the FULL tab list too — the passage-tab switcher binds to it, and
          // keeping only this question's own passage is what stopped the tabs rendering.
          const enhancedQuestion = {
            ...q,
            PassageContext: tab.Passage,
            TabTitle: tab.TabTitle,
            Tabs: Array.isArray(q?.Tabs) && q.Tabs.length > 0 ? q.Tabs : allTabs,
            tabs: Array.isArray(q?.tabs) && q.tabs.length > 0 ? q.tabs : allTabs,
          };
          accumulator.push(enhancedQuestion);
        });
      }
    });
    if (accumulator.length > 0) return accumulator.map(normalizeBlanksFormat);
  }

  if (Array.isArray((source as any).data)) return (source as any).data.map(normalizeBlanksFormat);
  if (Array.isArray((source as any).questions)) return (source as any).questions.map(normalizeBlanksFormat);
  if (Array.isArray((source as any).result)) return (source as any).result.map(normalizeBlanksFormat);

  if (Array.isArray((source as any).results)) {
    const accumulator: any[] = [];
    const traverse = (node: any, depth = 0) => {
      if (!node || depth > 4) return;
      if (Array.isArray(node)) {
        node.forEach(child => traverse(child, depth + 1));
        return;
      }
      if (typeof node === 'object') {
        if (node.label || node.Question || node.question || node.text || node.QuestionText || Array.isArray(node.values) || Array.isArray(node.options)) {
          accumulator.push(node);
        }
        Object.values(node).forEach(child => traverse(child, depth + 1));
      }
    };
    (source as any).results.forEach((entry: any) => traverse(entry?.data ?? entry, 0));
    if (accumulator.length) return accumulator.map(normalizeBlanksFormat);
    return (source as any).results.map(normalizeBlanksFormat);
  }

  const keys = Object.keys(source);
  if (keys.length && keys.every(k => !isNaN(Number(k)))) {
    const arrLike = keys.map(k => (source as any)[k]);
    if (arrLike.every(item => typeof item === 'object')) return arrLike.map(normalizeBlanksFormat);
  }

  if (source.label || source.Question || source.text || source.QuestionText) {
    return [normalizeBlanksFormat(source)];
  }

  return [];
};

const readStoredGeneratedResultsArray = (): any[] => {
  try {
    if (typeof sessionStorage === 'undefined') return [];
    const stored = sessionStorage.getItem('questionGenResults');
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return collectGeneratedQuestions(parsed);
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Regenerate Item — rebuilds one generated question through the itemregenerate
// agent. regenerate_scope tells the backend what it may rewrite:
//   "question" = the stem only (options are kept), "options" = the options only
//   (the stem is kept), "both" = the whole item.
// ---------------------------------------------------------------------------
const AGENTIC_ITEM_GEN_URL = `${AIG_QUIZ_GEN_URL}/agentic_item_gen`;

type RegenerateScope = 'question' | 'options' | 'both';

/** The current question, in the shape the itemregenerate agent expects to keep. */
const buildExistingItem = (q: any): any => {
  if (!q || typeof q !== 'object') return {};
  const item: any = {
    QuestionStatement: q.QuestionStatement || q.questionstatement || '',
    PartPrompt: q.PartPrompt || q.partPrompt || '',
    label: q.label || q.Question || q.text || q.QuestionText || '',
    values: Array.isArray(q.values)
      ? q.values.map((v: any) => (typeof v === 'string' ? v : (v?.text ?? v?.value ?? '')))
      : [],
    CorrectAnswer: q.CorrectAnswer ?? q.correctanswer ?? '',
  };
  if (q.Marking || q.ItemScoring?.Marking) item.Marking = q.Marking || q.ItemScoring?.Marking;
  if (q.marks && typeof q.marks === 'object') item.marks = q.marks;
  if (Array.isArray(q.KeyPoints) && q.KeyPoints.length) item.KeyPoints = q.KeyPoints;
  // FeedbackOptionA … FeedbackOptionJ, only the ones this question actually has.
  for (let i = 0; i < 10; i++) {
    const key = `FeedbackOption${String.fromCharCode(65 + i)}`;
    if (q[key]) item[key] = q[key];
  }
  return item;
};

const replaceGeneratedQuestion = (arr: any[], target: any, replacement: any): { data: any[]; replaced: boolean } => {
  if (!Array.isArray(arr)) return { data: [], replaced: false };
  let replaced = false;
  const updated = arr.map(item => {
    if (isSameGeneratedQuestion(item, target)) {
      replaced = true;
      return replacement;
    }
    return item;
  });
  return { data: updated, replaced };
};

// Drops one question from the list. The card hands back the very object held in the
// list, so an exact match is preferred; ids / text are only the fallback for a list
// that was rebuilt in between (they can also match a twin with the same text).
const removeGeneratedQuestion = (arr: any[], target: any): any[] => {
  if (!Array.isArray(arr)) return [];
  if (arr.includes(target)) return arr.filter(item => item !== target);
  return arr.filter(item => !isSameGeneratedQuestion(item, target));
};

const getGeneratedQuestionKey = (item: any): string => {
  if (!item) return '';
  const id = item?.id ?? item?.questionid ?? item?.QuestionID ?? item?.questionguid ?? item?.question_uuid ?? item?.uuid;
  if (id != null && id !== '') return `id:${String(id).trim()}`;
  const text = String(item?.label || item?.Question || item?.text || item?.QuestionText || '').trim().toLowerCase();
  if (text) return `text:${text}`;
  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
};

const filterGeneratedQuestionSet = (items: any[]): any[] => {
  if (!Array.isArray(items)) return [];
  const sanitized = items.filter(Boolean);
  if (!sanitized.length) return sanitized;

  const matrixRoots = sanitized.filter((entry: any) => entry?.type === 'matrix' || (Array.isArray(entry?.rows) && Array.isArray(entry?.columns)));
  const matrixChildTexts = new Set<string>();
  matrixRoots.forEach((root: any) => {
    (root?.rows || []).forEach((row: any) => {
      const label = String(row?.text ?? row?.value ?? '').trim().toLowerCase();
      if (label) matrixChildTexts.add(label);
    });
    (root?.columns || []).forEach((col: any) => {
      const text = String(col?.text ?? col?.value ?? '').trim().toLowerCase();
      if (text) matrixChildTexts.add(text);
    });
  });

  const seen = new Set<string>();
  return sanitized.filter((entry: any) => {
    const isMatrixRoot = entry?.type === 'matrix' || (Array.isArray(entry?.rows) && Array.isArray(entry?.columns));
    if (!isMatrixRoot) {
      const label = String(entry?.label || entry?.Question || entry?.text || entry?.QuestionText || '').trim().toLowerCase();
      if (label && matrixChildTexts.has(label)) {
        return false;
      }
    }
    const key = getGeneratedQuestionKey(entry);
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const formatQuestionTextForDisplay = (rawText: any): string => {
  const base = String(rawText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!base) return '';

  // Enforce each labeled sentence on a new line: (a), (b), (c), (d), (e)
  const withLabelLines = base
    .replace(/\s+\(([a-eA-E])\)\s*/g, (_match, label) => `\n(${String(label).toLowerCase()}) `)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return withLabelLines;
};


// Passage tabs may arrive on the question as either `Tabs` or `tabs`.
const getQuestionTabs = (q: any): any[] =>
  Array.isArray(q?.Tabs) ? q.Tabs : (Array.isArray(q?.tabs) ? q.tabs : []);

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

const getQuestionPartPrompt = (q: any): string =>
  q?.PartPrompt ?? q?.partPrompt ?? '';

// With passage tabs the raw label holds the whole multi-tab blob (including the tab
// titles), so the visible stem is the PartPrompt instead. Falls back to the canonical
// stem fields for ordinary single-passage questions.
const getCleanStem = (q: any): string => {
  if ((getQuestionTabs(q).length > 0 || Boolean(getTableAnalysis(q))) && getQuestionPartPrompt(q)) return getQuestionPartPrompt(q);
  const label = String(q?.label ?? '').trim();
  if (label) return label;
  const questionStatement = String(q?.QuestionStatement ?? q?.Question ?? q?.question ?? q?.text ?? q?.QuestionText ?? '').trim();
  const partPrompt = String(getQuestionPartPrompt(q)).trim();
  if (questionStatement && partPrompt && !questionStatement.includes(partPrompt)) {
    return `${questionStatement} ${partPrompt}`;
  }
  return questionStatement || partPrompt;
};

// When passage tabs exist the visible stem is the PartPrompt, not the full question text.
const applyTabsAndPartPrompt = (updatedQuestion: any, sourceQuestion: any, stem: string): any => {
  const tabs = getQuestionTabs(sourceQuestion);
  if (tabs.length > 0) {
    updatedQuestion.Tabs = tabs;
    updatedQuestion.tabs = tabs;
    updatedQuestion.PartPrompt = stem;
    updatedQuestion.partPrompt = stem;
  }
  return updatedQuestion;
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

const PassageTabsViewer = ({ tabs }: { tabs: any[] }) => {
  const [activeTab, setActiveTab] = useState(0);
  if (!tabs || tabs.length === 0) return null;

  return (
    <div className="mb-4 p-0 bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
      <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
        {tabs.map((t, idx) => (
          <button
            key={idx}
            className={`px-6 py-3 font-semibold text-sm transition-colors whitespace-nowrap ${activeTab === idx ? 'text-blue-700 bg-white border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
            onClick={() => setActiveTab(idx)}
          >
            {t.tab_title || t.TabTitle || t.Title || t.tabTitle || t.title || t.Name || t.name || `Passage ${idx + 1}`}
          </button>
        ))}
      </div>
      <div className="p-5 text-gray-700 leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
        <LatexRenderer content={(() => {
          const t = tabs[Math.min(activeTab, tabs.length - 1)] || {};
          return t.content || t.Content || t.Passage || t.passage || '';
        })()} />
      </div>
    </div>
  );
};

// Feature flag: set to 1 to show the TTS panel and Speak buttons, 0 to hide completely
const showTextToSpeech = 1;

const AIGQuestionResults = () => {
  const navigate = useNavigate()
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
  const [activeTab, setActiveTab] = useState("generate")
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false)
  const [selectedQuestion, setSelectedQuestion] = useState(null)
  const [playingQuestionId, setPlayingQuestionId] = useState<string | null>(null);

  // TTS preference state — initialized from storage so settings survive page navigation
  const [isSpeechEnabled, setIsSpeechEnabled] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem('isSpeechEnabled') || localStorage.getItem('isSpeechEnabled');
      if (saved !== null) return saved === 'true';
      return true;
    } catch { return true; }
  });
  const [speechRate, setSpeechRate] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem('speechRate') || localStorage.getItem('speechRate');
      return saved ? parseFloat(saved) : 1.0;
    } catch { return 1.0; }
  });
  const [speechGender, setSpeechGender] = useState<string>(() => {
    try {
      return sessionStorage.getItem('speechGender') || localStorage.getItem('speechGender') || 'female';
    } catch { return 'female'; }
  });
  const [speechAccent, setSpeechAccent] = useState<string>(() => {
    try {
      return sessionStorage.getItem('speechAccent') || localStorage.getItem('speechAccent') || 'en-IN';
    } catch { return 'en-IN'; }
  });

  // Persist TTS settings to both storages whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem('isSpeechEnabled', String(isSpeechEnabled));
      localStorage.setItem('isSpeechEnabled', String(isSpeechEnabled));
    } catch { }
  }, [isSpeechEnabled]);

  // Write showTextToSpeech flag to sessionStorage on mount so the Repository page
  // (which reads from storage) can also respect this feature flag.
  useEffect(() => {
    try {
      sessionStorage.setItem('showTextToSpeech', String(showTextToSpeech));
    } catch { }
  }, []);


  // Pre-load voices on mount so SpeechSynthesis doesn't lag looking up voices over network
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        if (window.speechSynthesis) {
          window.speechSynthesis.getVoices();
        }
      };
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
      return () => {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  const cleanTextForSpeech = cleanTextForSpeechShared;

  // Stop reading as soon as the browser tab is hidden or this screen unmounts,
  // otherwise the question keeps being spoken after the user switches away.
  useEffect(() => installSpeechAutoStop(() => setPlayingQuestionId(null)), []);

  // Switching the in-page tab also stops playback.
  useEffect(() => {
    cancelSpeech();
    setPlayingQuestionId(null);
  }, [activeTab]);

  const handleSpeak = (question: any, questionKey: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Stop if already playing the same question
    if (playingQuestionId === questionKey) {
      cancelSpeech();
      setPlayingQuestionId(null);
      return;
    }

    const rawText = getCleanStem(question) || question?.question || question?.label || question?.QuestionStatement || question?.text || '';

    // Read the passage, the stem AND every answer option — not just the stem.
    const speechText = buildSpeechText(question, rawText);
    if (!speechText) return;

    const langHint = question?.quesOrigin
      || question?.originallanguage
      || question?.language
      || question?.Language
      || languageFromQuestionId(question?.id || question?.questionguid);

    setPlayingQuestionId(questionKey);
    speakText(speechText, {
      langHint,
      onend: () => setPlayingQuestionId(null),
      onerror: () => setPlayingQuestionId(null),
    }).then(started => {
      if (!started) setPlayingQuestionId(null);
    });
  };
  const [activeTableSort, setActiveTableSort] = useState<Record<string, string | null>>({})
  const [editTableSortColumn, setEditTableSortColumn] = useState<string>('S.no')
  // Staged (not-yet-saved) image(s) selected/regenerated inside the edit dialog.
  // They only preview; committed to the question on "Save Changes".
  // stagedEditImageUrl keeps the first image for single-image consumers/backward-compat.
  const [stagedEditImageUrl, setStagedEditImageUrl] = useState<string>("")
  const [stagedEditImages, setStagedEditImages] = useState<string[]>([])
  const [stagedGeneratedImageType, setStagedGeneratedImageType] = useState<number | null>(null)
  // Per-option images regenerated in this edit session (Multiple Choice / Multiple
  // Response); committed to the question on "Save Changes" like the image above.
  const [stagedOptionImages, setStagedOptionImages] = useState<OptionImage[] | null>(null)
  // Regenerate Item dialog (stem only / options only / both)
  const [isRegenerateItemOpen, setIsRegenerateItemOpen] = useState(false)
  const [regenerateItemTarget, setRegenerateItemTarget] = useState<any>(null)
  const [regenerateScope, setRegenerateScope] = useState<RegenerateScope>('question')
  const [regenerateItemInstruction, setRegenerateItemInstruction] = useState("")
  const [isRegeneratingItem, setIsRegeneratingItem] = useState(false)
  const [regenerateItemError, setRegenerateItemError] = useState("")
  // True once the user has added/regenerated/deleted images this edit session,
  // so stagedEditImages becomes the source of truth (even when emptied).
  const [imagesEdited, setImagesEdited] = useState(false)
  const [questionType, setQuestionType] = useState("multiple-choice")
  const [validationErrors, setValidationErrors] = useState({
    options: ['', '', '', ''], // Error messages for each option
    correctAnswer: '', // Error message for correct answer (single answer)
    correctAnswers: ['', '', '', '', '', '', '', '', '', ''], // Error messages for each correct answer (multiple response)
    questionStem: '', // Error message for question stem
    sampleAnswer: '', // Error message for Correct Answer
    keyPoints: ['', '', '', '', ''], // Error messages for key points
    feedbacks: ['', '', '', ''], // Error messages for each feedback
  })
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [editingKeyPoints, setEditingKeyPoints] = useState<string[]>([]) // Dynamic key points for editing
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(true) // Track if user has unsaved changes
  const [showNavigationDialog, setShowNavigationDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [pendingTabChange, setPendingTabChange] = useState<string | null>(null)

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
  // Multi-select: all repository images picked in the select modal (attached together to the question)
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

  // Fetch chapters for the locked book
  useEffect(() => {
    if (isImageSelectModalOpen && imageSelectDestination === "specific") {
      const bookCode = sessionStorage.getItem('bookid') || sessionStorage.getItem('bookType') || '2';
      getChapters(bookCode).then(res => {
        if (Array.isArray(res) && res.length > 0) {
          setModalChapters(res);
          setModalSelectedChapter(prev => {
            if (prev && prev !== 'all' && res.some((c: any) => String(chapterKeyOf(c)) === prev)) {
              return prev;
            }
            const sessCode = sessionStorage.getItem('chaptercode');
            const sessName = sessionStorage.getItem('selectedChapter') || sessionStorage.getItem('selectedChapterName');
            const matched = res.find((c: any) =>
              String(chapterKeyOf(c)) === sessCode || String(chapterNameOf(c)) === sessName
            );
            return String(chapterKeyOf(matched || res[0]) ?? 'all');
          });
        } else {
          setModalChapters([]);
        }
      }).catch(() => setModalChapters([]));
    }
  }, [isImageSelectModalOpen, imageSelectDestination]);

  // Fetch LOs when chapter changes
  useEffect(() => {
    if (modalSelectedChapter && modalSelectedChapter !== "all") {
      getLearningObjectives(modalSelectedChapter).then(res => {
        if (Array.isArray(res)) setModalLOs(res);
      }).catch(() => setModalLOs([]));
    } else {
      setModalLOs([]);
    }
  }, [modalSelectedChapter]);


  const fetchRepositoryImages = async (destination: "general" | "specific", target: any) => {
    setIsLoadingRepoImages(true);
    try {
      const { getKbAuthToken } = await import('@/lib/kb-auth');
      const token = await getKbAuthToken();
      // Built with the same helper the upload uses, so the folder being listed and
      // the folder written to can never disagree.
      const chapterObj = modalSelectedChapter !== "all"
        ? modalChapters.find(c => String(chapterKeyOf(c)) === modalSelectedChapter)
        : null;
      const loObj = (modalSelectedChapter !== "all" && modalSelectedLO !== "all")
        ? modalLOs.find(l => String(loKeyOf(l)) === modalSelectedLO)
        : null;

      // Reads the Customer/Organisation folder AND the unscoped one older images were
      // written to, merged — so nothing that is visible today disappears.
      setRepositoryImages(await listScopedImages(token, {
        destination,
        bookName: resolveImageBookName(target),
        chapterName: modalSelectedChapter !== "all"
          ? String(chapterObj ? chapterNameOf(chapterObj) : modalSelectedChapter)
          : '',
        loName: loObj ? String(loNameOf(loObj)) : '',
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
    // Open on the question's own book/chapter folder, exactly as the Question
    // Repository does. Defaulting to "General Images" listed the shared cross-book
    // pool, so images from other subjects and chapters showed up in the picker.
    //
    // The LO stays on "All LOs": preselecting the question's own LO listed the
    // book/chapter/LO folder, which is usually empty because images are uploaded at
    // chapter level — so the picker opened with no images at all.
    setImageSelectDestination("specific");
    const chapterCode = String(chapterKeyOf(q) ?? '').trim()
      || String(sessionStorage.getItem('chaptercode') || '').trim();
    setModalSelectedChapter(chapterCode || "all");
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
    // Once the images have been edited, the staged list is the whole truth — an
    // empty one means the user deleted every image. Testing `stagedEditImages.length`
    // could not tell that apart from "nothing staged yet", so it fell through to the
    // question's stored images and merged a just-deleted image back in.
    const existing = imagesEdited
      ? stagedEditImages
      : (Array.isArray((imageSelectTarget as any)?.generatedImages) && (imageSelectTarget as any).generatedImages.length
        ? (imageSelectTarget as any).generatedImages
        : (() => { const s = resolveQuestionImageUrl(imageSelectTarget, questionImages); return s ? [s] : []; })());
    const merged = Array.from(new Set([...existing, ...incoming]));
    setStagedEditImages(merged);
    setStagedEditImageUrl(merged[0] || "");
    setStagedGeneratedImageType(1); // 1 = uploaded/selected manually
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
      if (newImageUrl) {
        // Stage the regenerated image for preview only (replaces the set). It is
        // committed to the question (map / genResults / sessionStorage) on "Save Changes".
        setStagedEditImageUrl(newImageUrl);
        setStagedEditImages([newImageUrl]);
        setStagedGeneratedImageType(0); // 0 = generated through /generate-image
        setImagesEdited(true);
      }
      if (optionImages.length > 0) {
        setStagedOptionImages(optionImages);
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
  const openRegenerateItem = (q: any) => {
    setRegenerateItemTarget(q);
    setRegenerateScope('question');
    setRegenerateItemInstruction("");
    setRegenerateItemError("");
    setIsRegenerateItemOpen(true);
  };

  /**
   * Sends the question back through the itemregenerate agent and swaps the result
   * into the card. The instruction is optional. The rest of the request is the
   * same context the questions were generated with, so the regenerated item stays
   * on the same book / study / learning objective.
   */
  const handleRegenerateItemSubmit = async () => {
    const target = regenerateItemTarget;
    if (!target) return;
    setIsRegeneratingItem(true);
    setRegenerateItemError("");
    try {
      const getSession = (key: string, fallback = "") => {
        try { return sessionStorage.getItem(key) ?? fallback; } catch { return fallback; }
      };

      // The payload the generation used; without it (results reopened later) fall
      // back to the same session values the generator reads.
      let base: any = {};
      try {
        base = JSON.parse(getSession("aigLastGenPayload", "{}")) || {};
      } catch { base = {}; }
      if (!base || typeof base !== 'object' || !base.question) {
        base = {
          url: getSession("aig_url", getSession("url", "")),
          question: getSession("aigQuestionPrompt", getSession("questionPrompt", "")),
          source: getSession("selectedGenerationMode", "Book Based"),
          custcode: getSession("custcode", ""),
          orgcode: getSession("orgCode", getSession("orgcode", "")),
          usercode: getSession("usercode", ""),
          appcode: getSession("appcode", "AIG"),
          booknameid: Number(getSession("bookType", "")) || undefined,
          bookname: getSession("bookTitle", ""),
          bookcode: getSession("bookcode", ""),
          questiontypename: getSession("selectedQuestionType", "Multiple Choice"),
          questiontypeid: Number(getSession("questiontypeid", "1")) || 1,
          taxonomyid: Number(getSession("taxonomyid", "1")) || 1,
          taxonomyname: getSession("selectedTaxonomy", ""),
          difficultylevelid: Number(getSession("difficultylevelid", "1")) || 1,
          chaptercode: getSession("chaptercode", getSession("selectedChapter", "")),
          locode: getSession("selectedLO", ""),
          sourcetype: Number(getSession("sourcetype", "1")) || 1,
          referenceinfo: getSession("referenceinfo", ""),
          validate_content: getSession("validate_content", "No"),
          task_content: getSession("task_content", ""),
          kbid: getSession("selectedKnowledgeBaseIdsCsv", "") || undefined,
          Rating: "",
          Rating_Feedback: "",
        };
      }

      const instruction = regenerateItemInstruction.trim();
      const payload = {
        ...base,
        agentname: "itemregenerate",
        agent_status: "1",
        job_id: "",
        noofquestions: 1,
        // Anything the user typed is guidance for this one item only.
        question: instruction
          ? `${base.question || ''}\n\nUser Instructions:\n${instruction}`
          : (base.question || ''),
        regenerate_scope: regenerateScope,
        existing_item: buildExistingItem(target),
      };

      const response = await axios.post(AGENTIC_ITEM_GEN_URL, payload);
      const regenerated = collectGeneratedQuestions(response?.data)[0];
      if (!regenerated) {
        setRegenerateItemError("The regeneration did not return a question. Please try again.");
        return;
      }

      const updatedQuestion = {
        ...target,
        ...regenerated,
        // Identity and images belong to the card, not to the regenerated payload.
        id: target.id,
        questionid: target.questionid,
        questionguid: target.questionguid,
        generatedImageUrl: target.generatedImageUrl,
        generatedImages: target.generatedImages,
        generatedimagetype: target.generatedimagetype,
        // Option images no longer match once the options were rewritten.
        optionImages: regenerateScope === 'question' ? target.optionImages : [],
        RegenerateInstrcutions: instruction ? [instruction] : (target.RegenerateInstrcutions || ['']),
      };

      if (genResults && Array.isArray(genResults)) {
        const { data: updatedResults } = replaceGeneratedQuestion(genResults, target, updatedQuestion);
        setGenResults(updatedResults);
        try { sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults)); } catch { }
      } else {
        const storedArray = readStoredGeneratedResultsArray();
        if (storedArray.length) {
          const { data: updatedResults } = replaceGeneratedQuestion(storedArray, target, updatedQuestion);
          setGenResults(updatedResults);
          try { sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults)); } catch { }
        }
      }

      // Keep the display list in step with the regenerated question.
      setQuestions(prev => prev.map(item => (
        isSameGeneratedQuestion(item?.raw, target)
          ? {
            ...item,
            text: updatedQuestion.label || updatedQuestion.QuestionStatement || item.text,
            raw: updatedQuestion,
          }
          : item
      )));

      setRefreshKey(k => k + 1);
      setIsRegenerateItemOpen(false);
      setRegenerateItemTarget(null);
      setRegenerateItemInstruction("");
    } catch (e: any) {
      console.error('Regenerate item failed:', e);
      setRegenerateItemError(e?.message || "Could not regenerate this question. Please try again.");
    } finally {
      setIsRegeneratingItem(false);
    }
  };

  // Clear any staged (unsaved) image whenever the edit dialog opens or closes,
  // so a selected-but-not-saved image never leaks between edits.
  useEffect(() => {
    setStagedEditImageUrl("");
    setStagedEditImages([]);
    setStagedGeneratedImageType(null);
    setStagedOptionImages(null);
    setImagesEdited(false);
  }, [isEditDialogOpen]);
  const [hasSavedAll, setHasSavedAll] = useState(false) // Track if Save All has been clicked
  const [hasInsertedToDB, setHasInsertedToDB] = useState(false) // Track if data has been inserted to database
  const [remainingTokens, setRemainingTokens] = useState(0);
  // Force UI re-render after saves to reflect latest edits in lists/previews
  const [refreshKey, setRefreshKey] = useState(0);
  // Edit dialog: track selected correct option letter for highlighting
  const [editSelectedCorrectLetter, setEditSelectedCorrectLetter] = useState<string>('A');
  // Multiple Response: track multiple selected correct option letters (A–J)
  const [editSelectedCorrectLettersMulti, setEditSelectedCorrectLettersMulti] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const isSSO = sessionStorage.getItem("isSSO") === "true"
  // Initialize editSelectedCorrectLettersMulti when selectedQuestion changes
  useEffect(() => {

    if (selectedQuestion && isMultipleResponse(selectedQuestion)) {
      // For multiple response questions, parse the correct answers
      const correctAnswers = selectedQuestion.CorrectAnswer || [];
      let correctLetters: string[] = [];
      if (Array.isArray(correctAnswers)) {
        // If it's an array, extract the first character of each answer
        correctLetters = correctAnswers
          .map((ans: any) => {
            const str = String(ans || '').trim().toUpperCase();
            return str.length > 0 ? str[0] : '';
          })
          .filter((letter: string) => /^[A-J]$/.test(letter));
      } else if (typeof correctAnswers === 'string') {
        // If it's a string, split by comma or space and get first characters
        correctLetters = correctAnswers
          .split(/[,\s]+/)
          .map(letter => letter.trim().toUpperCase())
          .filter(letter => /^[A-J]$/.test(letter));
      }

      setEditSelectedCorrectLettersMulti(correctLetters);
    } else {
      // Reset for non-multiple response questions
      setEditSelectedCorrectLettersMulti([]);
    }
  }, [selectedQuestion]);

  const [userPreferences, setUserPreferences] = useState({
    isrewrite: 0,
    issimilarity: 0,
    isvalidate: 0
  });
  const [isValidating, setIsValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState({ text: '', type: '', details: null });
  const [formData, setFormData] = useState({
    questionStem: '',
    correctAnswer: '',
    options: ['', '', '', ''],
    FeedbackOptionA: '',
    FeedbackOptionB: '',
    FeedbackOptionC: '',
    FeedbackOptionD: ''
  });
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false)
  const [selectedQuestionForRating, setSelectedQuestionForRating] = useState<string>('')
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null)
  const [selectedQuestionRequestId, setSelectedQuestionRequestId] = useState<number | null>(null)
  const [questionRating, setQuestionRating] = useState<'up' | 'down' | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [isFeedbackReadOnly, setIsFeedbackReadOnly] = useState(false);
  const getSession = (key: string, fallback: any = "") => {
    const v = sessionStorage.getItem(key)
    return v !== null && v !== undefined && v !== "undefined" ? v : fallback
  };
  const isStudyLOEnabled = getSession("isStudyLOEnabled") !== "false";
  const [questionRatings, setQuestionRatings] = useState<Record<string, { rating: 'up' | 'down' | null; feedback: string }>>({})
  const [errors, setErrors] = useState({
    questionStem: '',
    correctAnswer: '',
    options: ['', '', '', '']
  });

  const isMultipleResponse = (q: any): boolean => {
    if (!q) return false;
    const qt = String(q?.QuestionType || q?.type || '').toLowerCase();
    if (qt.includes('multiple response')) return true;
    if (Array.isArray(q?.CorrectAnswer)) return true;
    const marking = q?.ItemScoring?.Marking;
    if (marking && String(marking).split(',').filter((s: string) => s.trim()).length > 1) return true;
    const marksObj = q?.marks;
    if (marksObj && typeof marksObj === 'object') {
      const positives = Object.values(marksObj).filter((v: any) => Number(v) > 0);
      if (positives.length > 1) return true;
    }
    return false;
  };

  // Detect if a question is True/False
  const isTrueFalseQuestion = (question: any) => {
    if (!question) return false;
    const typeLabel = String(question?.QuestionType || question?.type || '').toLowerCase();
    if (/true\s*[-\/]?\s*false|^tf$|^t\/?f$/i.test(typeLabel)) return true;
    const values = Array.isArray((question as any)?.values)
      ? (question as any).values
      : (Array.isArray((question as any)?.options) ? (question as any).options : []);
    if (values.length === 2) {
      const norm = (v: any) => String(typeof v === 'string' ? v : (v?.text || v?.value || '')).trim().toLowerCase();
      const a = norm(values[0]);
      const b = norm(values[1]);
      const set = new Set([a, b]);
      if (set.has('true') && set.has('false')) return true;
      // Handle prefixed labels like "A. True", "B. False"
      const strippedA = a.replace(/^[a-z]\.\s*/, '');
      const strippedB = b.replace(/^[a-z]\.\s*/, '');
      if (strippedA === 'true' && strippedB === 'false') return true;
      if (strippedA === 'false' && strippedB === 'true') return true;
    }
    return false;
  };

  // Matrix edit local state
  const [matrixEdit, setMatrixEdit] = useState({
    questionStatement: '',
    partPrompt: '',
    rows: [] as string[],
    columns: [] as string[],
    answers: [] as number[], // selected column index per row
    feedbacks: [] as string[] // per-row feedback
  })

  const handleExportToExcel = async () => {
    try {
      const ExcelJSImport: any = await import('exceljs');
      const ExcelJS: any = ExcelJSImport?.default || ExcelJSImport;
      const { format } = await import('date-fns');

      let results: any[] = Array.isArray(genResults as any) && (genResults as any).length ? (genResults as any) : [];
      if (!results.length) {
        try {
          const raw = sessionStorage.getItem('questionGenResults');
          const data = raw ? JSON.parse(raw) : null;
          if (Array.isArray(data)) results = data;
          else if (data?.data && Array.isArray(data.data)) results = data.data;
          else if (data?.questions && Array.isArray(data.questions)) results = data.questions;
          else if (data?.result && Array.isArray(data.result)) results = data.result;
          else if (data?.results && Array.isArray(data.results)) {
            const extracted: any[] = [];
            const extractDeep = (node: any, depth = 0) => {
              if (!node || depth > 3) return;
              if (Array.isArray(node)) { node.forEach(n => extractDeep(n, depth + 1)); return; }
              if (typeof node === 'object') {
                if (node.label || node.Question || node.question || node.text || node.QuestionText || Array.isArray(node.values) || Array.isArray(node.options)) extracted.push(node);
                Object.values(node).forEach(v => extractDeep(v, depth + 1));
              }
            };
            try { data.results.forEach((r: any) => extractDeep(r?.data)); } catch { }
            results = extracted;
          } else if (data && typeof data === 'object') {
            const keys = Object.keys(data);
            if (keys.length > 1 && keys.every(k => !isNaN(Number(k)))) {
              const arrLike = keys.map(k => (data as any)[k]);
              if (arrLike.every((q: any) => typeof q === 'object' && (q.label || q.Question || q.text))) results = arrLike;
            } else if (data?.label || data?.Question || data?.text) {
              results = [data];
            }
          }
        } catch { }
      }

      results = Array.isArray(results) ? results.filter(Boolean) : [];
      if (!results.length) { window.alert('No questions available to export.'); return; }


      // Apply the same filtering as Word export to remove matrix child questions
      results = filterGeneratedQuestionSet(results);


      const chapterName = sessionStorage.getItem('bookTitle') || '';

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

      results.forEach((q: any, index: number) => {
        console.log(`[SaveAll] Inspecting q[${index}]:`, JSON.stringify(q, null, 2));
        const taxonomy = q.taxonomy || sessionStorage.getItem('selectedTaxonomy') || 'N/A';
        const creativitylevelname = sessionStorage.getItem('selectedCreativityLevel') || 'Moderate';
        const learningOutcome = sessionStorage.getItem('learningObjectivesName') || sessionStorage.getItem('selectedLoName') || 'N/A';
        const source = q.source || sessionStorage.getItem('selectedGenerationMode') || 'N/A';
        const bookName = sessionStorage.getItem('bookTitle') || 'N/A';
        const userDetails = (() => {
          try { const ui = JSON.parse(sessionStorage.getItem('userInfo') || '{}'); return ui.userName || ui.userCode || ui.email || ''; } catch { return ''; }
        })();
        const study = q.study || sessionStorage.getItem('selectedChapterName') || sessionStorage.getItem('studyName') || sessionStorage.getItem('chaptercode') || 'N/A';
        const generatedImageUrl = resolveQuestionImageUrl(q, questionImages);
        // Every attached image, not just the first: a question can carry an AI
        // generated picture AND one the user added, and only the first was
        // reaching the sheet.
        const generatedImageList: string[] = (Array.isArray((q as any)?.generatedImages) && (q as any).generatedImages.length
          ? (q as any).generatedImages
          : (generatedImageUrl ? [generatedImageUrl] : []))
          .map((u: any) => String(u || '').trim())
          .filter((u: string) => u && !u.includes('NOT REQUIRED') && !u.includes('NO_IMAGE_REQUIRED'));
        const taxonomyid = mapTaxonomy(taxonomy);
        const typeStr = String(q?.type || q?.QuestionType || '').toLowerCase();
        const values: string[] = Array.isArray(q.values) ? q.values : (Array.isArray(q.options) ? q.options : []);
        const cleanedValues = values.map(v => String(v ?? '').replace(/^[A-J][\.)]\s*/, ''));
        const cleanStemText = getCleanStem(q);
        const stem = cleanStemText.trim();

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

        const isMatrix = typeStr.includes('matrix') || (Array.isArray(q.rows) && Array.isArray(q.columns)) ||
          (typeStr.includes('table') && Array.isArray(q.rows) && Array.isArray(q.columns));

        const isFIBDropdown = isFillBlankDropdownQuestion(q);
        const isFIB = isFillBlankQuestion(q) && !isFIBDropdown;

        let questionType = 'Written Response';
        if (isFIBDropdown) {
          questionType = 'Select the Blank';
        } else if (isFIB) {
          questionType = 'Fill In the Blank';
        } else if (isMatrix) {
          questionType = 'Matrix';
        } else if (cleanedValues.length > 0) {
          const isTF = cleanedValues.length === 2 && cleanedValues.every(o => /^(true|false)$/i.test(String(o).trim()));
          const caRaw = q.CorrectAnswer ?? q.answer ?? '';
          const isMR = Array.isArray(caRaw) && caRaw.length > 1;

          questionType = isTF ? 'True False' : (isMR ? 'Multiple Response' : 'Multiple Choice');
        }

        const pointValue = parseNum(sessionStorage.getItem('pointValue'));


        const chaptercode = String(sessionStorage.getItem('chaptercode') || '00').padStart(2, '0');
        const loStored = String(sessionStorage.getItem('selectedLO') || '0');
        const loNumeric = loStored.replace(/^LO/i, '');
        const typeCode = (() => {
          switch (questionType) {
            case 'Written Response': return 'WR';
            case 'Matrix': return 'MM';
            case 'Multiple Response': return 'MR';
            case 'True False': return 'TF';
            case 'Fill In the Blank': return 'FIB';
            default: return 'MC';
          }
        })();
        const questionId = q.id || (index + 1);
        const identifier = (() => {
          // Use existing identifier from data if available (same as repository)
          // const existingId = q.questionidentifier || q.QuestionIdentifier || q.question_id || q.id;
          // if (existingId) {
          //   return String(existingId).replace('$', '_');
          // }
          // Fallback: construct identifier using the same pattern as Save All functionality
          const chaptercode = sessionStorage.getItem('chaptercode') || 'S11';
          const lo = sessionStorage.getItem('selectedLO') || 'LO0';
          const typeCode = (() => {
            switch (questionType) {
              case 'Written Response': return 'WR';
              case 'Matrix': return 'MM';
              case 'Multiple Response': return 'MR';
              case 'True False': return 'TF';
              case 'Fill In the Blank': return 'FIB';
              default: return 'MC';
            }
          })();
          const questionId = q.id || (index + 1);
          return `IG_V2025_${String(chaptercode || '0')}_${sessionStorage.getItem('selectedLO') || 'LO0'}_${typeCode}_L${sessionStorage.getItem('taxonomyid')}_EN_ID${index + 1}`;
        })();

        let correctanswer = '';
        if (questionType === 'Multiple Response') {
          const caRaw = q.CorrectAnswer;
          if (Array.isArray(caRaw)) {
            correctanswer = caRaw.map((ans: any) => mapOptionValue(ans)).filter((val: any) => val !== '' && val !== undefined && val !== null && !isNaN(val as any)).join(',');
          } else {
            correctanswer = String(caRaw || '').split(',').map(s => mapOptionValue(String(s).trim())).filter((val: any) => val !== '' && val !== undefined && val !== null && !isNaN(val as any)).join(',');
          }
        } else if (questionType === 'Matrix') {
          try {
            const rows = typeof q.rows === 'string' ? JSON.parse(q.rows) : q.rows || [];
            const cols = typeof q.columns === 'string' ? JSON.parse(q.columns) : q.columns || [];
            // Check both answers and CorrectAnswer fields like Word export does
            const ca = typeof q.CorrectAnswer === 'string' ? JSON.parse(q.CorrectAnswer) : (Array.isArray(q.answers) ? q.answers : (Array.isArray(q.CorrectAnswer) ? q.CorrectAnswer : []));
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

        let optionMarks: any[] = new Array(10).fill('');
        if ((q as any)?.marks) {
          try {
            let marksObj: any;
            if (typeof (q as any).marks === 'string') marksObj = JSON.parse((q as any).marks);
            else if (typeof (q as any).marks === 'object' && !Array.isArray((q as any).marks)) marksObj = (q as any).marks;
            else marksObj = {};
            optionMarks = 'ABCDEFGHIJ'.split('').map(k => (marksObj[k] !== undefined ? parseFloat(marksObj[k]) : ''));
          } catch { }
        }

        const stemRich = { richText: [{ text: stem }] } as any;

        if (questionType === 'Multiple Response') {
          const row: any = {
            'Question Identifier': identifier,
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': questionType,
            'Max Score': pointValue,
            'Correct Answer': correctanswer,
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Rating': (() => { const rating = q.Rating ?? q.rating ?? q.ratingid ?? (q as any)[15]; if (rating === 1 || rating === '1') return 'Good'; if (rating === 2 || rating === '2') return 'Poor'; return 'N/A'; })(),
            'Rating Feedback': (() => { const feedback = q.rating_feedback ?? (q as any).Rating_Feedback ?? (q as any).ratingfeedback ?? (q as any).RatingFeedback ?? (q as any)[16]; return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A'; })(),
            'Creativity Level': creativitylevelname || '',
            'Generated Image URL': formatImageForExport(generatedImageUrl),
            '__imageDataUrl': generatedImageUrl,
            '__imageDataUrls': generatedImageList
          };
          cleanedValues.forEach((val, i) => {
            const idx = i + 1;
            (row as any)[`Option${idx}`] = val;

            // Handle feedback options with proper fallback for E-J
            const feedbackKey = `FeedbackOption${String.fromCharCode(65 + i)}`;
            const fallbackKey = `FeedbackOption${idx}`;
            (row as any)[`Feedback Option${idx}`] = (q as any)[feedbackKey] || (q as any)[fallbackKey] || '';
          });
          mrData.push(row);
        } else if (questionType === 'Multiple Choice') {
          const row: any = {
            'Question Identifier': identifier,
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': questionType,
            'Max Score': pointValue,
            'Correct Answer': correctanswer,
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Rating': (() => { const rating = q.Rating ?? q.rating ?? q.ratingid ?? (q as any)[15]; if (rating === 1 || rating === '1') return 'Good'; if (rating === 2 || rating === '2') return 'Poor'; return 'N/A'; })(),
            'Rating Feedback': (() => { const feedback = q.rating_feedback ?? (q as any).Rating_Feedback ?? (q as any).ratingfeedback ?? (q as any).RatingFeedback ?? (q as any)[16]; return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A'; })(),
            'Creativity Level': creativitylevelname || '',
            'Generated Image URL': formatImageForExport(generatedImageUrl),
            '__imageDataUrl': generatedImageUrl,
            '__imageDataUrls': generatedImageList
          };
          cleanedValues.forEach((val, i) => { const idx = i + 1; (row as any)[`Option${idx}`] = val; (row as any)[`Feedback Option${idx}`] = (q as any)[`FeedbackOption${String.fromCharCode(65 + i)}`]; });
          mcqData.push(row);
        } else if (questionType === 'True False') {
          const row: any = {
            'Question Identifier': identifier,
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': 'True False',
            'Max Score': pointValue,
            'Correct Answer': correctanswer,
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Rating': (() => { const rating = q.Rating ?? q.rating ?? q.ratingid ?? (q as any)[15]; if (rating === 1 || rating === '1') return 'Good'; if (rating === 2 || rating === '2') return 'Poor'; return 'N/A'; })(),
            'Rating Feedback': (() => { const feedback = q.rating_feedback ?? (q as any).Rating_Feedback ?? (q as any).ratingfeedback ?? (q as any).RatingFeedback ?? (q as any)[16]; return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A'; })(),
            'Creativity Level': creativitylevelname || '',
            'Generated Image URL': formatImageForExport(generatedImageUrl),
            '__imageDataUrl': generatedImageUrl,
            '__imageDataUrls': generatedImageList
          };
          (row as any)['Option1'] = cleanedValues[0] || 'True';
          (row as any)['Option2'] = cleanedValues[1] || 'False';
          (row as any)['Option1 Marks'] = optionMarks[0] !== '' ? parseFloat(optionMarks[0]) : '';
          (row as any)['Option2 Marks'] = optionMarks[1] !== '' ? parseFloat(optionMarks[1]) : '';
          (row as any)['Feedback Option1'] = (q as any)['FeedbackOptionA'];
          (row as any)['Feedback Option2'] = (q as any)['FeedbackOptionB'];
          tfData.push(row);
        } else if (questionType === 'Select the Blank') {
          const row: any = {
            'Question Identifier': identifier,
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': 'Select the Blank',
            'Max Score': pointValue || sessionStorage.getItem('pointValue'),
            'Correct Answer': Array.isArray(q?.CorrectAnswer) ? q.CorrectAnswer.join(', ') : String(q?.CorrectAnswer ?? ''),
            // Stored key points only, so a question without any exports an empty cell
            // rather than the sample list getKeyPointsFromQuestion would substitute.
            'KeyPoints': getStoredKeyPoints(q).join('\n'),
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Rating': (() => { const rating = q.Rating ?? q.rating ?? q.ratingid ?? (q as any)[15]; if (rating === 1 || rating === '1') return 'Good'; if (rating === 2 || rating === '2') return 'Poor'; return 'N/A'; })(),
            'Rating Feedback': (() => { const feedback = q.rating_feedback ?? (q as any).Rating_Feedback ?? (q as any).ratingfeedback ?? (q as any).RatingFeedback ?? (q as any)[16]; return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A'; })(),
            'Creativity Level': creativitylevelname || '',
            'Generated Image URL': generatedImageUrl || 'N/A'
          };
          cleanedValues.forEach((val, i) => {
            const idx = i + 1;
            (row as any)[`Option${idx}`] = val;
            (row as any)[`Feedback Option${idx}`] = (q as any)[`FeedbackOption${String.fromCharCode(65 + i)}`];
          });
          selectBlankData.push(row);
        } else if (questionType === 'Fill In the Blank') {
          const row: any = {
            'Question Identifier': identifier,
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': 'Fill In the Blank',
            'Max Score': pointValue || sessionStorage.getItem('pointValue'),
            'Correct Answer': Array.isArray(q?.CorrectAnswer) ? q.CorrectAnswer.join(', ') : String(q?.CorrectAnswer ?? ''),
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Rating': (() => { const rating = q.Rating ?? q.rating ?? q.ratingid ?? (q as any)[15]; if (rating === 1 || rating === '1') return 'Good'; if (rating === 2 || rating === '2') return 'Poor'; return 'N/A'; })(),
            'Rating Feedback': (() => { const feedback = q.rating_feedback ?? (q as any).Rating_Feedback ?? (q as any).ratingfeedback ?? (q as any).RatingFeedback ?? (q as any)[16]; return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A'; })(),
            'Creativity Level': creativitylevelname || '',
            'Generated Image URL': formatImageForExport(generatedImageUrl),
            '__imageDataUrl': generatedImageUrl,
            '__imageDataUrls': generatedImageList
          };
          const val0 = (q as any).values?.[0];
          // if (typeof val0 !== 'undefined') (row as any)['Option'] = String(val0).substring(3);
          if (typeof (q as any)['FeedbackOptionA'] !== 'undefined') (row as any)['Feedback Option'] = (q as any)['FeedbackOptionA'];
          fibData.push(row);
        } else if (questionType === 'Written Response') {
          const row: any = {
            'Question Identifier': identifier,
            'Question Stem': stemRich,
            'Passage': passageText,
            'Reference Table': referenceTableText,
            'Type': 'Written Response',
            'Max Score': pointValue,
            'Correct Answer': (() => { const ca = q?.CorrectAnswer || q?.correctanswer; return Array.isArray(ca) ? ca.join(', ') : String(ca ?? ''); })(),
            'KeyPoints': Array.isArray(q?.KeyPoints) ? q.KeyPoints.join('\n') : (q?.KeyPoints || ''),
            'Source': source,
            'Book Name': bookName,
            'User Details': userDetails,
            'Study': study,
            'Taxonomy': taxonomy,
            'Learning Objectives': learningOutcome,
            'Rating': (() => { const rating = q.Rating ?? q.rating ?? q.ratingid ?? (q as any)[15]; if (rating === 1 || rating === '1') return 'Good'; if (rating === 2 || rating === '2') return 'Poor'; return 'N/A'; })(),
            'Rating Feedback': (() => { const feedback = q.rating_feedback ?? (q as any).Rating_Feedback ?? (q as any).ratingfeedback ?? (q as any).RatingFeedback ?? (q as any)[16]; return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A'; })(),
            'Creativity Level': creativitylevelname || '',
            'Generated Image URL': formatImageForExport(generatedImageUrl),
            '__imageDataUrl': generatedImageUrl,
            '__imageDataUrls': generatedImageList
          };
          wrData.push(row);
        } else if (questionType === 'Matrix') {
          try {
            const rows = typeof q.rows === 'string' ? JSON.parse(q.rows) : q.rows || [];
            const cols = typeof q.columns === 'string' ? JSON.parse(q.columns) : q.columns || [];
            // Check both answers and CorrectAnswer fields like Word export does
            const ca = typeof q.CorrectAnswer === 'string' ? JSON.parse(q.CorrectAnswer) : (Array.isArray(q.answers) ? q.answers : (Array.isArray(q.CorrectAnswer) ? q.CorrectAnswer : []));
            const fbsArr: string[] = Array.isArray((q as any).Feedbacks) ? (q as any).Feedbacks : (Array.isArray((q as any).feedbacks) ? (q as any).feedbacks : []);
            const cleanFbs = fbsArr.map(f => `* ${String(f || '').trim()}`).filter(Boolean).join('\n');
            const row: any = {
              'Question Identifier': identifier.replace('$', '_'),
              'Question Stem': stemRich,
              'Passage': passageText,
              'Reference Table': referenceTableText,
              'Type': 'Matrix',
              'Max Score': pointValue,
              'Rows': Array.isArray(rows) ? rows.map((r: any) => `* ${r?.text ?? ''}`).join('\n') : '',
              'Columns': Array.isArray(cols) ? cols.map((c: any) => `* ${c?.text ?? ''}`).join('\n') : '',
              'Correct Answer': Array.isArray(rows) && Array.isArray(cols) && Array.isArray(ca)
                ? rows.map((r: any, ri: number) => {
                  const ci = ca[ri];
                  if (ci !== undefined && cols[ci]) return `* ${r.text} => ${cols[ci].text}`;
                  return `* ${r.text}: N/A`;
                }).join('\n')
                : '',
              'Feedbacks': cleanFbs,
              'Source': source,
              'Book Name': bookName,
              'User Details': userDetails,
              'Study': study,
              'Learning Objectives': learningOutcome,
              'Taxonomy': taxonomy,
              'Creativity Level': creativitylevelname || '',
              'Rating': (() => { const rating = q.Rating ?? q.rating ?? q.ratingid ?? (q as any)[15]; if (rating === 1 || rating === '1') return 'Good'; if (rating === 2 || rating === '2') return 'Poor'; return 'N/A'; })(),
              'Rating Feedback': (() => { const feedback = q.rating_feedback ?? (q as any).Rating_Feedback ?? (q as any).ratingfeedback ?? (q as any).RatingFeedback ?? (q as any)[16]; return feedback && String(feedback).trim() !== '' ? String(feedback).trim() : 'N/A'; })(),
              'Generated Image URL': formatImageForExport(generatedImageUrl),
              '__imageDataUrl': generatedImageUrl,
              '__imageDataUrls': generatedImageList
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

      const addSheet = (name: string, rows: any[], config: { base: any[], dynamic?: (rows: any[]) => any[], tail: any[] }) => {
        if (!rows.length) return;
        const sheet = workbook.addWorksheet(name);
        const columns: any[] = [...config.base];
        if (config.dynamic) columns.push(...config.dynamic(rows));
        columns.push(...config.tail);
        sheet.columns = columns;
        rows.forEach(r => sheet.addRow(normalizeRowForExcel(r)));
        sheet.getRow(1).font = { bold: true };
        return sheet;
      };

      // Shared helper: inserts Passage/Reference Table cols dynamically, then any extra cols
      const buildDynamicCols = (rows: any[], extraCols: any[] = []) => {
        const cols: any[] = [];
        const hasPassage = rows.some((r: any) => String(r?.Passage || '').trim() !== '');
        const hasTable = rows.some((r: any) => String(r?.['Reference Table'] || '').trim() !== '');
        if (hasPassage) cols.push({ header: 'Passage', key: 'Passage', width: 150 });
        if (hasTable) cols.push({ header: 'Reference Table', key: 'Reference Table', width: 150 });
        cols.push(...extraCols);
        return cols;
      };

      // Images are loaded before the (synchronous) sheet writers run. Manually added
      // images are blob URLs rather than data URIs and previously were not embedded
      // at all; they are now fetched like any other image.
      const excelImageCache = new Map<string, any>();
      const preloadExcelImages = async (rowSets: any[][]) => {
        const sources = Array.from(new Set(rowSets.flat().flatMap(rowImageSources)));
        for (const src of sources) {
          const img = await loadExportImage(src);
          if (img) excelImageCache.set(src, img);
        }
      };

      const embedImagesInSheet = (sheet: any, rows: any[]) => {
        if (!sheet || !rows?.length) return;
        // One column per picture; see utils/excelImages.
        embedRowImages(workbook, sheet, rows, {
          firstImageColumn: sheet.columnCount + 1,
          cache: excelImageCache,
        });
      };

      await preloadExcelImages([mcqData, mrData, tfData, selectBlankData, fibData, wrData, matrixData]);

      const mcqSheet = addSheet('Multiple Choice', mcqData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 }
        ], dynamic: (rows) => {
          const allKeys = rows.flatMap((row: any) => Object.keys(row));
          const optionKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Option') && !k.includes('Marks'))))
            .sort((a, b) => parseInt(a.replace('Option', ''), 10) - parseInt(b.replace('Option', ''), 10));
          const feedbackKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Feedback Option'))))
            .sort((a, b) => parseInt(a.replace('Feedback Option', ''), 10) - parseInt(b.replace('Feedback Option', ''), 10));
          const cols: any[] = [];
          optionKeys.forEach(key => { cols.push({ header: key, key, width: 40 }); });
          feedbackKeys.forEach(key => cols.push({ header: key, key, width: 40 }));
          // Through buildDynamicCols so Passage / Reference Table get a column when the
          // rows carry one. Returning the option columns alone meant the row data was
          // there but no column was declared for it, so ExcelJS dropped the table.
          return buildDynamicCols(rows, cols);
        }, tail: [
          { header: 'Correct Answer', key: 'Correct Answer', width: 20 },
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 },
          // { header: 'Rating', key: 'Rating', width: 20 },
          // { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 }
        ]
      });
      if (mcqSheet) autoWrap(mcqSheet);
      embedImagesInSheet(mcqSheet, mcqData);

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
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 }
        ]
      });
      if (selectBlankSheet) autoWrap(selectBlankSheet);

      const mrSheet = addSheet('Multiple Response', mrData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 }
        ], dynamic: (rows) => {
          const allKeys = rows.flatMap((row: any) => Object.keys(row));
          const optionKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Option') && !k.includes('Marks'))))
            .sort((a, b) => parseInt(a.replace('Option', ''), 10) - parseInt(b.replace('Option', ''), 10));
          const feedbackKeys = Array.from(new Set(allKeys.filter(k => k.startsWith('Feedback Option'))))
            .sort((a, b) => parseInt(a.replace('Feedback Option', ''), 10) - parseInt(b.replace('Feedback Option', ''), 10));
          const cols: any[] = [];
          optionKeys.forEach(key => { cols.push({ header: key, key, width: 40 }); });
          feedbackKeys.forEach(key => cols.push({ header: key, key, width: 40 }));
          // Through buildDynamicCols so Passage / Reference Table get a column when the
          // rows carry one. Returning the option columns alone meant the row data was
          // there but no column was declared for it, so ExcelJS dropped the table.
          return buildDynamicCols(rows, cols);
        }, tail: [
          { header: 'Correct Answer', key: 'Correct Answer', width: 20 },
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 },
          // { header: 'Rating', key: 'Rating', width: 20 },
          // { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 }
        ]
      });
      if (mrSheet) autoWrap(mrSheet);
      embedImagesInSheet(mrSheet, mrData);

      const wrSheet = addSheet('Written Response', wrData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 },
          { header: 'Correct Answer', key: 'Correct Answer', width: 200 },
          { header: 'Key Points', key: 'KeyPoints', width: 200 }
        ], dynamic: (rows) => buildDynamicCols(rows), tail: [
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 },
          // { header: 'Rating', key: 'Rating', width: 20 },
          // { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 }
        ]
      });
      if (wrSheet) autoWrap(wrSheet);
      embedImagesInSheet(wrSheet, wrData);

      const tfSheet = addSheet('True False', tfData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Max Score', key: 'Max Score', width: 10 },
          { header: 'Option1', key: 'Option1', width: 20 },
          // { header: 'Option1 Marks', key: 'Option1 Marks', width: 15 },
          { header: 'Option2', key: 'Option2', width: 20 },
          // { header: 'Option2 Marks', key: 'Option2 Marks', width: 15 }
        ], dynamic: (rows) => buildDynamicCols(rows), tail: [
          { header: 'Correct Answer', key: 'Correct Answer', width: 20 },
          { header: 'Feedback Option1', key: 'Feedback Option1', width: 40 },
          { header: 'Feedback Option2', key: 'Feedback Option2', width: 40 },
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 },
          // { header: 'Rating', key: 'Rating', width: 20 },
          // { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 }
        ]
      });
      if (tfSheet) autoWrap(tfSheet);
      embedImagesInSheet(tfSheet, tfData);

      const fibSheet = addSheet('Fill In the Blank', fibData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 40 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 30 },
          { header: 'Max Score', key: 'Max Score', width: 10 }
        ], dynamic: (rows) => buildDynamicCols(rows), tail: [
          { header: 'Correct Answer', key: 'Correct Answer', width: 20 },
          { header: 'Feedback Option', key: 'Feedback Option', width: 30 },
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 },
          // { header: 'Rating', key: 'Rating', width: 20 },
          // { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 }
        ]
      });
      if (fibSheet) autoWrap(fibSheet);
      embedImagesInSheet(fibSheet, fibData);

      const matrixSheet = addSheet('Matrix', matrixData, {
        base: [
          { header: 'Question Identifier', key: 'Question Identifier', width: 20 },
          { header: 'Question Stem', key: 'Question Stem', width: 200 },
          { header: 'Type', key: 'Type', width: 30 },
          { header: 'Max Score', key: 'Max Score', width: 10 },
          { header: 'Rows', key: 'Rows', width: 60 },
          { header: 'Columns', key: 'Columns', width: 60 },
          { header: 'Correct Answer', key: 'Correct Answer', width: 115 },
          { header: 'Feedbacks', key: 'Feedbacks', width: 115 }
        ], dynamic: (rows) => buildDynamicCols(rows), tail: [
          { header: 'Source', key: 'Source', width: 20 },
          { header: 'Book Name', key: 'Book Name', width: 20 },
          { header: 'User Details', key: 'User Details', width: 20 },
          { header: 'Study', key: 'Study', width: 20 },
          { header: 'LOs', key: 'Learning Objectives', width: 20 },
          { header: 'Taxonomy', key: 'Taxonomy', width: 20 },
          { header: 'Creativity Level', key: 'Creativity Level', width: 20 },
          { header: 'Generated Image URL', key: 'Generated Image URL', width: 60 },
          // { header: 'Rating', key: 'Rating', width: 20 },
          // { header: 'Rating Feedback', key: 'Rating Feedback', width: 20 }
        ]
      });
      if (matrixSheet) autoWrap(matrixSheet);
      embedImagesInSheet(matrixSheet, matrixData);

      const now = new Date();
      const formattedDateTime = format(now, 'yyyy-MM-dd');
      const buffer = await workbook.xlsx.writeBuffer();
      const fileType =
        mcqData.length ? 'MCQ' :
          mrData.length ? 'MRQ' :
            wrData.length ? 'WR' :
              tfData.length ? 'TF' :
                fibData.length ? 'FIB' :
                  matrixData.length ? 'MM' :
                    'Questions';
      saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `${chapterName}_${fileType}_${formattedDateTime}.xlsx`);
    } catch (e) {
      window.alert('Failed to export to Excel.');
    }
  };

  const [showSaveAllDialog, setShowSaveAllDialog] = useState(false);
  const [saveAllDialogMessage, setSaveAllDialogMessage] = useState("");
  const [saveAllDialogType, setSaveAllDialogType] = useState("success"); // or "error" or "info"
  const [isAlreadySavedToRepository, setIsAlreadySavedToRepository] = useState(false);
  // SSO-only: drives the Save All loader. Never set outside SSO mode, so every
  // piece of UI gated on it is inert on the non-SSO path.
  const [isSavingAll, setIsSavingAll] = useState(false);
  // Blocks a second Save All that lands before React re-renders the disabled
  // button — a ref is read synchronously, state would still be false.
  const saveAllInFlight = useRef(false);
  // Enhanced validation function for edit dialog

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState(null);

  const getStemEditor = () => document.querySelector('[data-question-stem-editor]') as HTMLElement | null;
  const getStemEditorHtml = () => {
    const editor = getStemEditor();
    if (!editor) return '';
    return editor.innerHTML || '';
  };
  const getStemEditorText = () => {
    const editor = getStemEditor();
    if (!editor) return '';
    return (editor.textContent || '').trim();
  };
  const hasHtmlTags = (value: any) => typeof value === 'string' && /<[^>]+>/.test(value);
  const renderStemContent = (value: any) => {
    const content = String(value || '');
    if (!content) return <></>;
    if (hasHtmlTags(content)) {
      return <div className="leading-relaxed" dangerouslySetInnerHTML={{ __html: content }} />;
    }
    return <LatexRenderer content={content} />;
  };

  const handleSaveChanges = () => {
    const questionStemEditor = getStemEditor();
    const sampleAnswerEl = document.querySelector('[data-sample-answer-textarea]');
    const keyPointEls = document.querySelectorAll('[data-key-point-textarea]');
    const optionTextareas = document.querySelectorAll('[data-option-textarea]');
    const correctAnswerEl = document.querySelector('[data-correct-answer-textarea]');
    const correctAnswerSelect = document.querySelector('[data-correct-answer-select]') as HTMLTextAreaElement;
    // feedback suffix editors (editable part only)
    const feedbackEditors = document.querySelectorAll('[data-feedback-option-suffix]');

    // Reset validation errors
    const newErrors = {
      options: ['', '', '', ''],
      correctAnswer: '',
      correctAnswers: ['', '', '', '', '', '', '', '', '', '', ''],
      questionStem: '',
      sampleAnswer: '',
      keyPoints: ['', '', '', '', ''],
      feedbacks: ['', '', '', ''],
    };

    let hasErrors = false;
    const questionStemText = getStemEditorText();
    const questionStemHtml = getStemEditorHtml();

    // 1. Check if question stem is empty (required for both types)
    if (!questionStemText) {
      newErrors.questionStem = 'Question Stem cannot be empty.';
      hasErrors = true;
    }

    // Declare variables for written response
    let sampleAnswerText = '';
    let keyPointValues: string[] = [];

    if (questionType === "written-response") {
      // Written Response validation (plain text for comparisons)
      sampleAnswerText = readOptionEditorPlain(sampleAnswerEl) || '';
      keyPointValues = Array.from(keyPointEls).map(el => readOptionEditorPlain(el));

      // 2. Check if Correct Answer is empty
      if (!sampleAnswerText) {
        newErrors.sampleAnswer = 'Correct Answer cannot be empty.';
        hasErrors = true;
      }
      else if (questionStemText && questionStemText.toLowerCase() === sampleAnswerText.toLowerCase()) {
        newErrors.sampleAnswer = 'Question stem and correct answer cannot be the same';
        hasErrors = true;
      }

      // 3. Check if any key point is empty
      // keyPointValues.forEach((value, index) => {
      //   if (!value) {
      //     // Ensure newErrors.keyPoints array is large enough
      //     while (newErrors.keyPoints.length <= index) {
      //       newErrors.keyPoints.push('');
      //     }
      //     newErrors.keyPoints[index] = 'Key point cannot be empty.';
      //     hasErrors = true;
      //   }
      // });
      // 3. Check if any key point is empty and not same as question stem or correct answer
      keyPointValues.forEach((value, index) => {
        // Ensure newErrors.keyPoints array is large enough
        while (newErrors.keyPoints.length <= index) {
          newErrors.keyPoints.push('');
        }

        // Check if empty
        if (!value) {
          newErrors.keyPoints[index] = 'Key Point cannot be empty.';
          hasErrors = true;
        }
        // Check if same as question stem
        else if (questionStemText && value.toLowerCase() === questionStemText.toLowerCase()) {
          newErrors.keyPoints[index] = 'Key Point cannot be same as Question Stem';
          hasErrors = true;
        }
        // Check if same as correct answer
        else if (sampleAnswerText && value.toLowerCase() === sampleAnswerText.toLowerCase()) {
          newErrors.keyPoints[index] = 'Key Point cannot be same as Correct Answer';
          hasErrors = true;
        }
      });

      // 4. Check for duplicate key points (only if no empty key points)
      if (!hasErrors) {
        const duplicateIndices: number[] = [];
        keyPointValues.forEach((value, index) => {
          if (!value) return; // Skip empty values (should be caught above)

          // Check for duplicates
          const duplicateIndex = keyPointValues.findIndex((otherValue, otherIndex) =>
            otherIndex !== index &&
            otherValue && // Skip empty values
            value.toLowerCase() === otherValue.toLowerCase()
          );

          if (duplicateIndex !== -1 && !duplicateIndices.includes(index)) {
            duplicateIndices.push(index);
          }
        });

        duplicateIndices.forEach(index => {
          newErrors.keyPoints[index] = 'Key points must be unique';
          hasErrors = true;
        });
      }

      // 4. Check for unique key points (only if no empty key points)
      if (!hasErrors) {
        const duplicateIndices: number[] = [];
        keyPointValues.forEach((value, index) => {
          const duplicateIndex = keyPointValues.findIndex((otherValue, otherIndex) =>
            otherIndex !== index && value.toLowerCase() === otherValue.toLowerCase()
          );
          if (duplicateIndex !== -1) {
            duplicateIndices.push(index);
          }
        });

        duplicateIndices.forEach(index => {
          // Ensure newErrors.keyPoints array is large enough
          while (newErrors.keyPoints.length <= index) {
            newErrors.keyPoints.push('');
          }
          newErrors.keyPoints[index] = 'Key points should be unique.';
          hasErrors = true;
        });
      }
    } else if (questionType === "fill-blank" || questionType === "select-blank") {
      // Fill in the Blank validation
      const questionStemEditor = getStemEditor();
      const isDropdownQuestion = isFillBlankDropdownQuestion(selectedQuestion) || questionType === 'select-blank';
      // Dropdown questions render their per-option feedback under the MC-style attribute
      const fibFeedbackEls = isDropdownQuestion
        ? document.querySelectorAll('[data-feedback-option-suffix]')
        : document.querySelectorAll('[data-fill-blank-feedback-textarea]');

      const questionStem = getStemEditorText();
      // For dropdown questions the correct answer is picked from the read-only option
      // list, so there is no editor to read it from — fall back to the question record.
      const correctAnswerText = isDropdownQuestion
        ? String(selectedQuestion?.CorrectAnswer || selectedQuestion?.correctanswer || selectedQuestion?.answer || '').replace(/^[A-Da-d]\.\s*/, '').trim()
        : (readOptionEditorPlain(correctAnswerEl) || '');

      // Check if Question Stem is empty
      if (!questionStem) {
        newErrors.questionStem = 'Question stem cannot be empty.';
        hasErrors = true;
      }

      // Validate dropdown options (each must be non-empty and unique)
      if (isDropdownQuestion) {
        const optionTexts = getDropdownOptionsFromQuestion(selectedQuestion).map(o => String(o).trim());
        if (!newErrors.options) newErrors.options = [];
        optionTexts.forEach((text, index) => {
          while (newErrors.options.length <= index) newErrors.options.push('');
          if (!text) {
            newErrors.options[index] = 'Dropdown option cannot be empty.';
            hasErrors = true;
          }
        });
        optionTexts.forEach((text, index) => {
          if (!text) return;
          const dupIndex = optionTexts.findIndex((t, i2) => i2 !== index && t && t.toLowerCase() === text.toLowerCase());
          if (dupIndex !== -1) {
            while (newErrors.options.length <= index) newErrors.options.push('');
            newErrors.options[index] = 'Dropdown options must be unique.';
            hasErrors = true;
          }
        });

        // Correct answer must match one of the visible dropdown options
        if (correctAnswerText && optionTexts.length) {
          const matchIndex = optionTexts.findIndex(opt => opt.toLowerCase() === correctAnswerText.toLowerCase());
          if (matchIndex === -1) {
            newErrors.correctAnswer = 'Correct answer must match one of the dropdown options.';
            hasErrors = true;
          }
        }
      }

      // Check if Correct Answer is empty
      if (!correctAnswerText) {
        newErrors.correctAnswer = 'Correct Answer cannot be empty.';
        hasErrors = true;
      }

      // Check if Question Stem and Correct Answer are the same
      if (questionStem && correctAnswerText && questionStem.toLowerCase() === correctAnswerText.toLowerCase()) {
        newErrors.correctAnswer = 'Question stem and correct answer cannot be the same.';
        hasErrors = true;
      }

      // Check feedback editors
      fibFeedbackEls.forEach((el, index) => {
        const feedbackText = readOptionEditorPlain(el);

        if (!feedbackText) {
          while (newErrors.feedbacks.length <= index) {
            newErrors.feedbacks.push('');
          }
          newErrors.feedbacks[index] = 'Feedback cannot be empty.';
          hasErrors = true;
        }
        // Check if feedback is same as question stem
        else if (questionStem && feedbackText.toLowerCase() === questionStem.toLowerCase()) {
          while (newErrors.feedbacks.length <= index) {
            newErrors.feedbacks.push('');
          }
          newErrors.feedbacks[index] = 'Feedback cannot be the same as the question stem.';
          hasErrors = true;
        }
        // Check if feedback is same as correct answer
        else if (correctAnswerText && feedbackText.toLowerCase() === correctAnswerText.toLowerCase()) {
          while (newErrors.feedbacks.length <= index) {
            newErrors.feedbacks.push('');
          }
          newErrors.feedbacks[index] = 'Feedback cannot be the same as the correct answer.';
          hasErrors = true;
        }
      });
    } else if (questionType === "true-false") {
      // True/False validation (two options only)
      if (correctAnswerSelect && optionTextareas.length >= 2 && correctAnswerEl) {
        const selectedOption = correctAnswerSelect.value || 'A';
        const selectedIndex = ['A', 'B'].indexOf(selectedOption);
        const optionElsTF = Array.from(optionTextareas).slice(0, 2);
        const optionValuesStoredTF = optionElsTF.map(el => readOptionEditorStored(el));
        const optionValuesPlainTF = optionElsTF.map(el => readOptionEditorPlain(el));
        const correctAnswerText = readOptionEditorPlain(correctAnswerEl);

        optionValuesPlainTF.forEach((value, index) => {
          if (!value) {
            while (newErrors.options.length <= index) newErrors.options.push('');
            newErrors.options[index] = 'This option cannot be empty.';
            hasErrors = true;
          }
        });

        const feedbackValues: string[] = [];
        let feedBackA = "";
        let feedBackB = "";
        Array.from(feedbackEditors).forEach((el) => {
          const opt = (el as HTMLElement).dataset.feedbackOptionSuffix;
          if (opt === 'A' || opt === 'B') {
            const idx = opt === 'A' ? 0 : 1;
            const prefixEl = document.querySelector(`[data-feedback-prefix="${opt}"]`);
            const prefixText = prefixEl?.textContent?.trim() || '';
            const suffix = readOptionEditorStored(el);
            if (opt === 'A') {
              feedBackA = suffix
            }
            else {
              feedBackB = suffix
            }
            if (!suffix) {
              while (newErrors.feedbacks.length <= idx) newErrors.feedbacks.push('');
              newErrors.feedbacks[idx] = 'Feedback cannot be empty.';
              hasErrors = true;
            }
            feedbackValues[idx] = ((prefixText ? prefixText + ' ' : '') + suffix).trim();
          }
        });

        // Check if feedbacks are unique
        if (feedBackA && feedBackB && feedBackA.trim() === feedBackB.trim()) {
          // Ensure feedbacks array has enough elements
          while (newErrors.feedbacks.length <= 1) newErrors.feedbacks.push('');
          newErrors.feedbacks[0] = 'Feedbacks should be unique.';
          newErrors.feedbacks[1] = 'Feedbacks should be unique.';
          hasErrors = true;
        }
        if (!correctAnswerText) {
          newErrors.correctAnswer = 'Correct Answer cannot be empty.';
          hasErrors = true;
        }

        if (!hasErrors) {
          const caPlainTF = storedMarkupToPlain(correctAnswerText).toLowerCase();
          const isCorrectAnswerPresentInValues = optionValuesPlainTF
            .map(value => value.toLowerCase())
            .includes(caPlainTF);
          if (!isCorrectAnswerPresentInValues) {
            newErrors.correctAnswer = 'Correct answer not present in options';
            hasErrors = true;
          }
        }
        const questionStemEditor = getStemEditor();
        const questionStem = getStemEditorText();
        // Check if Question Stem is empty
        if (!questionStem) {
          newErrors.questionStem = 'Question stem cannot be empty.';
          hasErrors = true;
        }

        // Check if Question Stem and Correct Answer are the same
        if (questionStem && correctAnswerText && questionStem.toLowerCase() === storedMarkupToPlain(correctAnswerText).toLowerCase()) {
          newErrors.correctAnswer = 'Question stem and correct answer cannot be the same.';
          hasErrors = true;
        }

        if (selectedOption && correctAnswerText && !hasErrors) {
          const selectedOptionText = optionValuesStoredTF[selectedIndex];
          const selPlain = storedMarkupToPlain(selectedOptionText || '');
          if (selectedOptionText && selPlain.toLowerCase() !== storedMarkupToPlain(correctAnswerText).toLowerCase()) {
            newErrors.correctAnswer = 'Selected dropdown option does not match the correct answer text.';
            hasErrors = true;
          }
        }
      }
    } else if (questionType === "matrix") {
      // Enhanced matrix validation


      const rows = matrixEdit.rows || [];
      const cols = matrixEdit.columns || [];
      const answers = matrixEdit.answers || [];
      const feedbacks = matrixEdit.feedbacks || [];
      const questionStemText = getStemEditorText().toLowerCase() || '';
      if (questionStemText) {
        const matchingRowIndex = rows.findIndex(row =>
          row && String(row).toLowerCase().trim() === questionStemText
        );
        if (matchingRowIndex !== -1) {
          newErrors.questionStem = 'Question stem cannot be the same as any row text.';
          hasErrors = true;
        }
      }
      // 2. Check if question stem matches any column text
      if (questionStemText) {
        const matchingColIndex = cols.findIndex(col =>
          col && String(col).toLowerCase().trim() === questionStemText
        );
        if (matchingColIndex !== -1) {
          newErrors.questionStem = 'Question stem cannot be the same as any column text.';
          hasErrors = true;
        }
      }

      if (questionStemText) {
        const matchingFeedbackIndex = feedbacks.findIndex(feedback =>
          feedback && String(feedback).toLowerCase().trim() === questionStemText
        );
        if (matchingFeedbackIndex !== -1) {
          newErrors.questionStem = 'Question stem cannot be the same as any feedback text.';
          hasErrors = true;
        }
      }
      // 4. Check for duplicate feedback (case-insensitive)
      const feedbackMap = new Map<string, number>();
      const duplicateFeedbacks = new Set<number>();
      feedbacks.forEach((feedback, index) => {
        if (!feedback) return;
        const lowerFeedback = String(feedback).toLowerCase().trim();
        if (feedbackMap.has(lowerFeedback)) {
          duplicateFeedbacks.add(feedbackMap.get(lowerFeedback)!);
          duplicateFeedbacks.add(index);
        } else {
          feedbackMap.set(lowerFeedback, index);
        }
      });

      // 5. Check for row text matching any feedback
      rows.forEach((row, rowIndex) => {
        if (!row) return;
        const lowerRow = String(row).toLowerCase().trim();
        const matchingFeedbackIndex = feedbacks.findIndex(feedback =>
          feedback && String(feedback).toLowerCase().trim() === lowerRow
        );

        if (matchingFeedbackIndex !== -1) {
          if (!newErrors.feedbacks) {
            newErrors.feedbacks = new Array(10).fill('');
          }
          newErrors.feedbacks[matchingFeedbackIndex] = 'Feedback cannot be the same as any row text';
          hasErrors = true;
        }
      });

      // 6. Check for column text matching any feedback
      cols.forEach((col, colIndex) => {
        if (!col) return;
        const lowerCol = String(col).toLowerCase().trim();
        const matchingFeedbackIndex = feedbacks.findIndex(feedback =>
          feedback && String(feedback).toLowerCase().trim() === lowerCol
        );

        if (matchingFeedbackIndex !== -1) {
          if (!newErrors.feedbacks) {
            newErrors.feedbacks = new Array(10).fill('');
          }
          newErrors.feedbacks[matchingFeedbackIndex] = 'Feedback cannot be the same as any column text';
          hasErrors = true;
        }
      });



      if (duplicateFeedbacks.size > 0) {
        if (!newErrors.feedbacks) {
          newErrors.feedbacks = new Array(10).fill('');
        }
        duplicateFeedbacks.forEach(index => {
          newErrors.feedbacks[index] = 'Feedback text must be unique';
        });
        hasErrors = true;
      }

      // Reset correctAnswer error
      newErrors.correctAnswer = '';

      // Check for empty rows or columns
      if (!rows.length || !cols.length) {
        newErrors.correctAnswer = 'Matrix must have at least one row and one column.';
        hasErrors = true;
      }

      // Check for empty row values
      const emptyRowIndices = rows.reduce((acc: number[], row, index) => {
        if (!row || String(row).trim() === '') {
          acc.push(index);
        }
        return acc;
      }, []);

      if (emptyRowIndices.length > 0) {
        newErrors.correctAnswer = `Row ${emptyRowIndices.map(i => i + 1).join(', ')} cannot be empty.`;
        hasErrors = true;
      }

      // Check for empty column values
      const emptyColIndices = cols.reduce((acc: number[], col, index) => {
        if (!col || String(col).trim() === '') {
          acc.push(index);
        }
        return acc;
      }, []);

      if (emptyColIndices.length > 0) {
        newErrors.correctAnswer = `Column ${emptyColIndices.map(i => i + 1).join(', ')} cannot be empty.`;
        hasErrors = true;
      }
      // Check for any row value matching any column value (case-insensitive, trimmed)
      const rowColConflicts: string[] = [];
      rows.forEach((row, rowIdx) => {
        const rowVal = String(row).trim().toLowerCase();
        const colIdx = cols.findIndex(col => String(col).trim().toLowerCase() === rowVal);
        if (rowVal && colIdx !== -1) {
          rowColConflicts.push(`Row ${rowIdx + 1} ("${row}") and Column ${colIdx + 1} ("${cols[colIdx]}")`);
        }
      });
      if (rowColConflicts.length > 0) {
        newErrors.correctAnswer = `Row and column values cannot be the same.`;
        hasErrors = true;
      }


      // Check for duplicate rows (case-insensitive)
      const rowMap = new Map<string, number>();
      const duplicateRows = new Set<number>();
      rows.forEach((row, index) => {
        if (!row) return;
        const lowerRow = String(row).toLowerCase().trim();
        if (rowMap.has(lowerRow)) {
          duplicateRows.add(rowMap.get(lowerRow)!);
          duplicateRows.add(index);
        } else {
          rowMap.set(lowerRow, index);
        }
      });

      if (duplicateRows.size > 0) {
        newErrors.correctAnswer = `Row ${Array.from(duplicateRows).map(i => i + 1).join(', ')} cannot have the same text.`;
        hasErrors = true;
      }

      // Check for duplicate columns (case-insensitive)
      const colMap = new Map<string, number>();
      const duplicateCols = new Set<number>();
      cols.forEach((col, index) => {
        if (!col) return;
        const lowerCol = String(col).toLowerCase().trim();
        if (colMap.has(lowerCol)) {
          duplicateCols.add(colMap.get(lowerCol)!);
          duplicateCols.add(index);
        } else {
          colMap.set(lowerCol, index);
        }
      });

      if (duplicateCols.size > 0) {
        newErrors.correctAnswer = `Column ${Array.from(duplicateCols).map(i => i + 1).join(', ')} cannot have the same text.`;
        hasErrors = true;
      }

      // Check for missing feedback
      const missingFeedbackIndices = feedbacks.reduce((acc: number[], feedback, index) => {
        if (!feedback || String(feedback).trim() === '') {
          acc.push(index);
        }
        return acc;
      }, []);

      // In the handleSaveChanges function, update the feedback validation:
      if (missingFeedbackIndices.length > 0) {
        // Initialize feedback errors array if not already done
        if (!newErrors.feedbacks) {
          newErrors.feedbacks = ['', '', '', '', '', '', '', '', '', ''];
        }

        // Set error for each missing feedback
        missingFeedbackIndices.forEach(index => {
          newErrors.feedbacks[index] = 'Feedback cannot be empty';
        });
        hasErrors = true;
      }

      // Original validations
      if (rows.length && answers.length !== rows.length) {
        newErrors.correctAnswer = 'Please select an answer for every row.';
        hasErrors = true;
      }

      if (!hasErrors) {
        const anyUnselected = answers.some(a => typeof a !== 'number' || a < 0 || a >= cols.length);
        if (anyUnselected) {
          newErrors.correctAnswer = 'Please select a valid column for every row.';
          hasErrors = true;
        }
      }
    } else {
      // Multiple Choice validation (dynamic up to A–J). Supports Multiple Response.
      if (optionTextareas.length >= 2) {
        const mrCheckboxes = document.querySelectorAll('[data-correct-answer-checkbox]') as NodeListOf<HTMLInputElement>;
        const isMRUI = mrCheckboxes && mrCheckboxes.length > 0;
        const count = Math.min(optionTextareas.length, 10);
        const letters = Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
        const optionEditorEls = Array.from(optionTextareas).slice(0, count);
        const optionValuesStored = optionEditorEls.map(el => readOptionEditorStored(el));
        const optionValuesPlain = optionEditorEls.map(el => readOptionEditorPlain(el));
        const selectedLetters = isMRUI ? Array.from(mrCheckboxes).filter(cb => cb.checked).map(cb => cb.value.toUpperCase()) : [];
        const correctAnswerText = isMRUI ? '' : (selectedQuestion && selectedQuestion.CorrectAnswer ? String(selectedQuestion.CorrectAnswer).replace(/^[A-Ja-j][\.)]?\s*/, '') : '');
        const selectedOptionRaw = isMRUI ? '' : (selectedQuestion && selectedQuestion.CorrectAnswer ? String(selectedQuestion.CorrectAnswer).charAt(0).toUpperCase() : '');
        const selectedOption = isMRUI ? '' : selectedOptionRaw.trim().toUpperCase().charAt(0);
        const selectedIndex = isMRUI ? -1 : letters.indexOf(selectedOption);

        // 2. Check for empty options and feedbacks
        optionValuesPlain.forEach((value, index) => {
          if (!value) {
            newErrors.options[index] = 'This option cannot be empty.';
            hasErrors = true;
          }
        });


        // Build full feedback values by concatenating prefix (fixed) + suffix (editable)
        const feedbackValues: string[] = [];
        Array.from(feedbackEditors).forEach((el, idx) => {
          const opt = (el as HTMLElement).dataset.feedbackOptionSuffix;
          const prefixEl = document.querySelector(`[data-feedback-prefix="${opt}"]`);
          const prefixText = prefixEl?.textContent?.trim() || '';
          const suffix = readOptionEditorStored(el);
          // Treat suffix-only empty (i.e., only prefix present) as empty
          if (!suffix) {
            // mark the corresponding validation slot
            newErrors.feedbacks[idx] = 'Feedback cannot be empty.';
            hasErrors = true;
          }
          feedbackValues[idx] = ((prefixText ? prefixText + ' ' : '') + suffix).trim();
        });

        // Check for duplicate feedbacks if no empty ones are found
        // if (!newErrors.feedbacks.some(e => e)) {
        //     const feedbackCounts = new Map();
        //     feedbackValues.forEach(value => {
        //         // Normalize by removing reserved prefixes
        //         const normalized = value
        //             .replace(/^correct\.\s*/i, "")
        //             .replace(/^incorrect\.\s*/i, "")
        //             .trim()
        //             .toLowerCase();

        //         if (normalized) {
        //             feedbackCounts.set(normalized, (feedbackCounts.get(normalized) || 0) + 1);
        //         }
        //     });

        //     // feedbackValues already contains full feedback strings
        //     feedbackValues.forEach((value, index) => {
        //         const normalized = value
        //             .replace(/^correct\.\s*/i, "")
        //             .replace(/^incorrect\.\s*/i, "")
        //             .trim()
        //             .toLowerCase();

        //         if (normalized && feedbackCounts.get(normalized) > 1) {
        //             if (!newErrors.feedbacks[index]) {
        //                 newErrors.feedbacks[index] = 'Feedback is duplicate.';
        //                 hasErrors = true;
        //             }
        //         }
        //     });
        // }
        if (!newErrors.feedbacks.some(e => e)) {
          const feedbackCounts = new Map();
          const questionStem = getStemEditorText().toLowerCase() || '';
          const optionPlainLower = Array.from(optionTextareas).slice(0, count).map(el => readOptionEditorPlain(el).toLowerCase());
          const correctAnswer = storedMarkupToPlain(correctAnswerText).toLowerCase() || '';

          // 1. Check if any option is the same as the question stem
          optionPlainLower.forEach((option, index) => {
            if (option && option === questionStem) {
              newErrors.options = newErrors.options || [];
              newErrors.options[index] = 'Option cannot be the same as the Question Stem';
              hasErrors = true;
            }
          });

          // 2. Check if correct answer is the same as question stem
          if (correctAnswer && correctAnswer === questionStem) {
            newErrors.correctAnswer = 'Correct Answer cannot be the same as the Question Stem';
            hasErrors = true;
          }

          // Track all values for comparison
          const allValues = new Map<string, { type: string, index?: number }>();
          if (questionStem) allValues.set(questionStem, { type: 'Question Stem' });

          optionPlainLower.forEach((opt, idx) => {
            if (opt) allValues.set(opt, { type: 'Option', index: idx });
          });
          if (correctAnswer) allValues.set(correctAnswer, { type: 'Correct Answer' });

          feedbackValues.forEach((value, index) => {
            // Normalize by removing reserved prefixes and trim
            const normalized = value
              .replace(/^correct\.\s*/i, "")
              .replace(/^incorrect\.\s*/i, "")
              .trim()
              .toLowerCase();

            if (normalized) {
              // Check for duplicate feedback
              feedbackCounts.set(normalized, (feedbackCounts.get(normalized) || 0) + 1);

              // Check against question stem, options, and correct answer
              if (allValues.has(normalized)) {
                newErrors.feedbacks[index] = `Feedback cannot be the same as Options`;
                hasErrors = true;
              }
            }
          });

          // Check for duplicate feedback messages
          feedbackValues.forEach((value, index) => {
            const normalized = value
              .replace(/^correct\.\s*/i, "")
              .replace(/^incorrect\.\s*/i, "")
              .trim()
              .toLowerCase();

            if (normalized && feedbackCounts.get(normalized) > 1) {
              if (!newErrors.feedbacks[index]) {
                newErrors.feedbacks[index] = 'Feedback is Duplicate.';
                hasErrors = true;
              }
            }
          });

          // 3. Check if any feedback is the same as question stem
          feedbackValues.forEach((feedback, index) => {
            const normalizedFeedback = feedback
              .replace(/^correct\.\s*/i, "")
              .replace(/^incorrect\.\s*/i, "")
              .trim()
              .toLowerCase();

            if (normalizedFeedback && normalizedFeedback === questionStem) {
              newErrors.feedbacks[index] = 'Feedback cannot be the same as the Question Stem';
              hasErrors = true;
            }
          });
        }


        // 3. Ensure at least one answer is selected
        if (isMRUI) {
          // Get the actual selected correct answers from the UI or existing data
          const selectedToCheck = selectedLetters.length > 0
            ? selectedLetters
            : (Array.isArray(selectedQuestion?.CorrectAnswer)
              ? selectedQuestion.CorrectAnswer
                .map((ans: any) => String(ans || '').trim().toUpperCase().charAt(0))
                .filter((l: string) => letters.includes(l))
              : []);

          if (selectedToCheck.length === 0) {
            newErrors.correctAnswer = 'Select at least one correct option.';
            hasErrors = true;
          } else {
            // Additional validation for multiple response: ensure correct answer values are not empty and are among options
            const mrAnswerTextareas = document.querySelectorAll('[data-mr-correct-answer-textarea]');
            const mrAnswerTexts = Array.from(mrAnswerTextareas).map(el => readOptionEditorPlain(el));

            // Initialize correctAnswers array if not present
            if (!newErrors.correctAnswers) {
              newErrors.correctAnswers = ['', '', '', '', '', '', '', '', '', ''];
            }

            // Check each correct answer text individually
            mrAnswerTexts.forEach((answerText: string, index: number) => {
              const letter = mrAnswerTextareas[index]?.getAttribute('data-mr-correct-answer-textarea') || String.fromCharCode(65 + index);
              const letterIndex = letter.charCodeAt(0) - 65;

              // Check if correct answer text is empty
              if (!answerText) {
                newErrors.correctAnswers[letterIndex] = 'Correct Answer cannot be empty.';
                hasErrors = true;
              } else {
                // Check if correct answer text matches any of the available option texts
                const isValidAnswer = optionValuesPlain.some((plain: string) =>
                  plain && plain.trim().toLowerCase() === answerText.trim().toLowerCase()
                );

                if (!isValidAnswer) {
                  newErrors.correctAnswers[letterIndex] = 'Correct Answer should be one of the options.';
                  hasErrors = true;
                } else {
                  // Clear error for this specific answer if it's valid
                  newErrors.correctAnswers[letterIndex] = '';
                }
              }
            });
            // Check for duplicate MR answers (case-insensitive, trimmed)
            if (!hasErrors) {
              const map = new Map<string, number[]>();
              mrAnswerTexts.forEach((text, idx) => {
                const norm = String(text || '').trim().toLowerCase();
                if (!norm) return;
                const arr = map.get(norm) || [];
                arr.push(idx);
                map.set(norm, arr);
              });

              for (const [, idxs] of map.entries()) {
                if (idxs.length > 1) {
                  idxs.forEach(i => {
                    const letter = mrAnswerTextareas[i]?.getAttribute('data-mr-correct-answer-textarea') || String.fromCharCode(65 + i);
                    const letterIndex = Math.max(0, letter.charCodeAt(0) - 65);
                    if (!newErrors.correctAnswers[letterIndex]) {
                      newErrors.correctAnswers[letterIndex] = 'Both answers cannot be same';
                    }
                  });
                  newErrors.correctAnswer = 'Both answers cannot be same';
                  hasErrors = true;
                }
              }
            }

            // Set general error only if there are any specific errors
            const hasCorrectAnswerErrors = newErrors.correctAnswers.some((error: string) => error);
            if (hasCorrectAnswerErrors) {
              newErrors.correctAnswer = 'Please fix the errors in correct answers below.';
            }
          }
        } else {
          // Single answer path
          if (!correctAnswerText) {
            newErrors.correctAnswer = 'Correct Answer cannot be empty.';
            hasErrors = true;
          }
        }

        // 4. Check for unique options (only if no empty options)
        if (!hasErrors) {
          const duplicateIndices: number[] = [];
          optionValuesPlain.forEach((value, index) => {
            if (!value) return; // Skip empty values (already handled)
            const duplicateIndex = optionValuesPlain.findIndex(
              (otherValue, otherIndex) =>
                otherIndex !== index &&
                otherValue && // Skip empty values
                value.toLowerCase() === otherValue.toLowerCase()
            );
            if (duplicateIndex !== -1 && !duplicateIndices.includes(index)) {
              duplicateIndices.push(index);
            }
          });

          duplicateIndices.forEach(index => {
            newErrors.options[index] = 'Options should be different.';
            hasErrors = true;
          });
        }

        // 5. Correct answer present in options
        if (!hasErrors) {
          if (isMRUI) {
            // For multiple response, check each selected answer
            const selectedToCheck = selectedLetters.length > 0
              ? selectedLetters
              : (Array.isArray(selectedQuestion?.CorrectAnswer)
                ? selectedQuestion.CorrectAnswer
                  .map((ans: any) => String(ans || '').trim().toUpperCase().charAt(0))
                  .filter((l: string) => letters.includes(l))
                : []);

            const invalid = selectedToCheck.some((L: string) => {
              const idx = letters.indexOf(L);
              return idx === -1 || !optionValuesPlain[idx];
            });
            if (invalid) {
              newErrors.correctAnswer = 'One or more selected options are invalid or empty.';
              hasErrors = true;
            }
          } else if (correctAnswerText) {
            // For single answer, check if the answer text exists in options
            const caPlainNorm = storedMarkupToPlain(correctAnswerText).toLowerCase();
            const isPresent = optionValuesPlain.some(opt =>
              opt && opt.toLowerCase() === caPlainNorm
            );
            if (!isPresent) {
              newErrors.correctAnswer = 'Correct answer not present in options';
              hasErrors = true;
            }
          }
        }

        // 6. For single answer questions, ensure the correct answer text matches the selected option
        if (!isMRUI && selectedOption && !hasErrors) {
          const selectedOptionText = optionValuesStored[selectedIndex] || '';
          // Update the correct answer editor to match the selected option
          if (correctAnswerEl) {
            (correctAnswerEl as HTMLElement).innerHTML = selectedOptionText;
          }
        }
      }
    }

    // Update validation errors state
    setValidationErrors(newErrors);

    // If validation passes, save changes and close dialog
    if (!hasErrors) {
      // Commit any staged image(s) (selected/regenerated in this edit session) now that
      // Save Changes is confirmed. resolveQuestionImageUrl prioritizes generatedImageUrl,
      // so mutating it here makes every branch below pick up the new image.
      if (imagesEdited && selectedQuestion) {
        const stagedList = stagedEditImages;
        const firstImage = stagedList[0] || "";
        // First image stays in the single field for backward-compat; full set in generatedImages.
        (selectedQuestion as any).generatedImageUrl = firstImage;
        (selectedQuestion as any).generatedImages = stagedList;
        if (stagedGeneratedImageType !== null) {
          (selectedQuestion as any).generatedimagetype = stagedGeneratedImageType;
        }
        const stagedId = (selectedQuestion as any).id;
        if (stagedId) {
          const newMap = new Map(questionImages);
          if (firstImage) newMap.set(stagedId, firstImage);
          else newMap.delete(stagedId);
          setQuestionImages(newMap);
        }
      }
      // Option images are regenerated together with the question image; commit them
      // here so every branch below carries them into genResults / sessionStorage.
      if (stagedOptionImages && selectedQuestion) {
        (selectedQuestion as any).optionImages = stagedOptionImages;
      }
      // Save Matrix changes
      if (questionType === "matrix" && selectedQuestion) {
        const updatedQuestionStem = getStemEditorText() ||
          String(selectedQuestion.label || selectedQuestion.Question || selectedQuestion.text || selectedQuestion.QuestionText || '');
        const updatedQuestionStemHtml = getStemEditorHtml() || String(selectedQuestion.label || selectedQuestion.Question || selectedQuestion.text || selectedQuestion.QuestionText || '');

        // Create updated question with preserved ID
        const updatedQuestion = {
          ...selectedQuestion,
          generatedImageUrl: resolveQuestionImageUrl(selectedQuestion, questionImages),
          id: selectedQuestion.id || generateUniqueId(), // Ensure ID exists
          label: updatedQuestionStemHtml,
          Question: updatedQuestionStemHtml,
          text: updatedQuestionStemHtml,
          QuestionText: updatedQuestionStemHtml,
          labelText: updatedQuestionStem,
          QuestionStatement: matrixEdit.questionStatement || selectedQuestion.QuestionStatement || '',
          PartPrompt: matrixEdit.partPrompt || selectedQuestion.PartPrompt || '',
          rows: (matrixEdit.rows || []).map(t => ({ text: t })),
          columns: (matrixEdit.columns || []).map((t, i) => ({ text: t, value: i })),
          CorrectAnswer: (matrixEdit.answers || []).slice(),
          Feedbacks: (matrixEdit.feedbacks || []).slice()
        };

        // Update genResults state
        setGenResults((prevResults: any[]) => {
          if (!Array.isArray(prevResults)) {
            return [updatedQuestion];
          }

          // Find the index of the question to update
          const index = prevResults.findIndex(q =>
            (q.id && q.id === selectedQuestion.id) ||
            (q.questionid && q.questionid === selectedQuestion.id) ||
            (q.QuestionID && q.QuestionID === selectedQuestion.QuestionID) ||
            (q.questionguid && q.questionguid === selectedQuestion.questionguid) ||
            (q.label && q.label === selectedQuestion.label)
          );

          const newResults = [...prevResults];
          if (index >= 0) {
            // Replace existing question
            newResults[index] = updatedQuestion;
          } else {
            // If not found (shouldn't happen), add as new
            newResults.push(updatedQuestion);
          }

          // Update session storage
          try {
            sessionStorage.setItem('questionGenResults', JSON.stringify(newResults));
          } catch (e) {
            console.error('Error updating sessionStorage:', e);
          }

          return newResults;
        });

        // Update questions state
        setQuestions(prev =>
          prev.map(q => {
            const raw = q.raw || {};
            const isMatch =
              (raw.id && raw.id === selectedQuestion.id) ||
              (raw.questionid && raw.questionid === selectedQuestion.id) ||
              (raw.QuestionID && raw.QuestionID === selectedQuestion.QuestionID) ||
              (raw.questionguid && raw.questionguid === selectedQuestion.questionguid) ||
              (raw.label && raw.label === selectedQuestion.label);

            return isMatch
              ? {
                ...q,
                text: updatedQuestionStemHtml,
                raw: updatedQuestion,
                // Preserve other question properties
                id: updatedQuestion.id,
                options: [], // Clear options for matrix questions
                answer: '' // Clear answer for matrix questions
              }
              : q;
          })
        );

        setSelectedQuestion(updatedQuestion);
        setHasUnsavedChanges(false);
        setIsEditDialogOpen(false);
        setRefreshKey(k => k + 1);
        setValidationErrors({
          options: ['', '', '', ''],
          correctAnswer: '',
          correctAnswers: ['', '', '', '', '', '', '', '', '', ''],
          questionStem: '',
          sampleAnswer: '',
          keyPoints: ['', '', '', '', ''],
          feedbacks: ['', '', '', '']
        });
        setShowSuccessDialog(true);
        return; // Avoid running other branches
      }
      if (questionType === "written-response" && selectedQuestion) {
        // Save written response question changes (preserve HTML / LaTeX source)
        const sampleAnswerStored = readOptionEditorStored(sampleAnswerEl);
        const keyPointsStored = Array.from(keyPointEls).map(el => readOptionEditorStored(el));
        const updatedQuestion = {
          ...selectedQuestion,
          generatedImageUrl: resolveQuestionImageUrl(selectedQuestion, questionImages),
          label: questionStemHtml || questionStemText,
          Question: questionStemHtml || questionStemText,
          text: questionStemHtml || questionStemText,
          QuestionText: questionStemHtml || questionStemText,
          labelText: questionStemText,
          CorrectAnswer: sampleAnswerStored,
          answer: sampleAnswerStored,
          KeyPoints: keyPointsStored,
          keyPoints: keyPointsStored
        };
        // With passage tabs the edited stem is the PartPrompt, and the tab list must survive the save.
        applyTabsAndPartPrompt(updatedQuestion, selectedQuestion, getStemEditorText());

        // Update the genResults array
        if (genResults && Array.isArray(genResults)) {
          const isSameQuestion = (a: any, b: any) => {
            if (!a || !b) return false;
            if (a === b) return true;
            const aid = a.id || a.questionid || a.QuestionID || a.questionguid;
            const bid = b.id || b.questionid || b.QuestionID || b.questionguid;
            if (aid && bid && String(aid) === String(bid)) return true;
            const aText = String(a.label || a.Question || a.text || a.QuestionText || '').trim();
            const bText = String(b.label || b.Question || b.text || b.QuestionText || '').trim();
            return !!aText && !!bText && aText === bText;
          };
          const updatedResults = genResults.map(q =>
            isSameQuestion(q, selectedQuestion) ? updatedQuestion : q
          );
          setGenResults(updatedResults);

          // Update localStorage
          sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults));

          // Update the questions state for display
          setQuestions(prev => prev.map(q => {
            const raw = q.raw || {};
            const same = raw === selectedQuestion ||
              (String(raw.id || raw.questionid || raw.QuestionID || raw.questionguid) &&
                String(raw.id || raw.questionid || raw.QuestionID || raw.questionguid) === String(selectedQuestion?.id || selectedQuestion?.questionid || selectedQuestion?.QuestionID || selectedQuestion?.questionguid)) ||
              (String(raw.label || raw.Question || raw.text || raw.QuestionText || '').trim() === String(selectedQuestion?.label || selectedQuestion?.Question || selectedQuestion?.text || selectedQuestion?.QuestionText || '').trim());
            if (same) {
              return {
                ...q,
                label: questionStemHtml || questionStemText,
                text: questionStemHtml || questionStemText,
                answer: sampleAnswerStored,
                raw: updatedQuestion
              };
            }
            return q;
          }));
          setHasUnsavedChanges(false);
        } else {
          // Fallback: update session storage if in-memory state is not an array
          try {
            const storedArray = readStoredGeneratedResultsArray();
            if (storedArray.length) {
              const replacement = replaceGeneratedQuestion(storedArray, selectedQuestion, updatedQuestion);
              const updatedResults = replacement.replaced ? replacement.data : storedArray.map((q: any) => q === selectedQuestion ? updatedQuestion : q);
              sessionStorage.setItem('questionGenResults', JSON.stringify(updatedResults));
              setGenResults(updatedResults);
            }
          } catch { }
        }

        // Update selectedQuestion state
        setSelectedQuestion(updatedQuestion);
        setRefreshKey((k) => k + 1);
      }
      // Save Fill in the Blank question changes
      else if ((questionType === "fill-blank" || questionType === "select-blank") && selectedQuestion && questionStemEditor) {
        const updatedQuestionStem = getStemEditorText();
        const updatedQuestionStemHtml = getStemEditorHtml() || updatedQuestionStem;
        const isDropdownQuestion = isFillBlankDropdownQuestion(selectedQuestion) || questionType === 'select-blank';
        const fibFbEls = isDropdownQuestion
          ? document.querySelectorAll('[data-feedback-option-suffix]')
          : document.querySelectorAll('[data-fill-blank-feedback-textarea]');
        // Dropdown questions have a read-only correct answer, so keep whatever the
        // option list already selected onto the question record.
        const updatedCorrectAnswer = isDropdownQuestion
          ? String(selectedQuestion?.CorrectAnswer || selectedQuestion?.correctanswer || selectedQuestion?.answer || '').trim()
          : (readOptionEditorStored(document.querySelector('[data-correct-answer-textarea]')) || '');

        // Preserve the dropdown option list across the save
        const updatedDropdownOptions = isDropdownQuestion
          ? getDropdownOptionsFromQuestion(selectedQuestion)
          : null;

        // Collect feedback values
        const updatedFeedbacks: { [key: string]: string } = {};
        const q = selectedQuestion || {};
        const fbKeys = Object.keys(q || {}).filter(k => /^FeedbackOption[A-J1-9]/.test(k) && q[k]);

        if (isDropdownQuestion) {
          // Feedback editors carry their option letter, so map them back directly
          Array.from(fibFbEls).forEach((el) => {
            const suffix = (el as HTMLElement).getAttribute('data-feedback-option-suffix') || '';
            if (!suffix) return;
            updatedFeedbacks[`FeedbackOption${suffix}`] = readOptionEditorStored(el) || '';
          });
        } else if (!fbKeys.length) {
          // No existing feedback keys, create a default one
          const feedbackText = fibFbEls[0] ? readOptionEditorStored(fibFbEls[0]) : '';
          updatedFeedbacks['FeedbackOption1'] = feedbackText;
        } else {
          // Map existing feedback keys to new values
          fbKeys.forEach((k, i) => {
            const feedbackText = fibFbEls[i] ? readOptionEditorStored(fibFbEls[i]) : '';
            updatedFeedbacks[k] = feedbackText;
          });
        }

        const updatedQuestion = {
          ...selectedQuestion,
          generatedImageUrl: resolveQuestionImageUrl(selectedQuestion, questionImages),
          label: updatedQuestionStemHtml,
          Question: updatedQuestionStemHtml,
          text: updatedQuestionStemHtml,
          QuestionText: updatedQuestionStemHtml,
          labelText: updatedQuestionStem,
          CorrectAnswer: updatedCorrectAnswer,
          answer: updatedCorrectAnswer,
          ...(updatedDropdownOptions ? {
            DropdownOptions: updatedDropdownOptions,
            dropdownoptions: updatedDropdownOptions,
            values: updatedDropdownOptions,
            options: updatedDropdownOptions,
          } : {}),
          ...updatedFeedbacks
        };
        // With passage tabs the edited stem is the PartPrompt, and the tab list must survive the save.
        applyTabsAndPartPrompt(updatedQuestion, selectedQuestion, getStemEditorText());

        // Update the genResults array
        if (genResults && Array.isArray(genResults)) {
          const isSameQuestion = (a: any, b: any) => {
            if (!a || !b) return false;
            if (a === b) return true;
            const aid = a.id || a.questionid || a.QuestionID || a.questionguid;
            const bid = b.id || b.questionid || b.QuestionID || b.questionguid;
            if (aid && bid && String(aid) === String(bid)) return true;
            const aText = String(a.label || a.Question || a.text || a.QuestionText || '').trim();
            const bText = String(b.label || b.Question || b.text || b.QuestionText || '').trim();
            return !!aText && !!bText && aText === bText;
          };
          const updatedResults = genResults.map(q =>
            isSameQuestion(q, selectedQuestion) ? updatedQuestion : q
          );
          setGenResults(updatedResults);

          // Update localStorage
          sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults));

          // Update the questions state for display
          setQuestions(prev => prev.map(q => {
            const raw = q.raw || {};
            const same = raw === selectedQuestion ||
              (String(raw.id || raw.questionid || raw.QuestionID || raw.questionguid) &&
                String(raw.id || raw.questionid || raw.QuestionID || raw.questionguid) === String(selectedQuestion?.id || selectedQuestion?.questionid || selectedQuestion?.QuestionID || selectedQuestion?.questionguid)) ||
              (String(raw.label || raw.Question || raw.text || raw.QuestionText || '').trim() ===
                String(selectedQuestion?.label || selectedQuestion?.Question || selectedQuestion?.text || selectedQuestion?.QuestionText || '').trim() &&
                raw.label && selectedQuestion?.label);
            if (same) {
              return {
                ...q,
                raw: updatedQuestion
              };
            }
            return q;
          }));
          setHasUnsavedChanges(false);
        } else {
          // Fallback: update session storage if in-memory state is not an array
          try {
            const storedArray = readStoredGeneratedResultsArray();
            if (storedArray.length) {
              const replacement = replaceGeneratedQuestion(storedArray, selectedQuestion, updatedQuestion);
              const updatedResults = replacement.replaced ? replacement.data : storedArray.map((q: any) => q === selectedQuestion ? updatedQuestion : q);
              sessionStorage.setItem('questionGenResults', JSON.stringify(updatedResults));
              setGenResults(updatedResults);
            }
          } catch { }
        }

        // Update selectedQuestion state
        setSelectedQuestion(updatedQuestion);
        setRefreshKey((k) => k + 1);
      }
      // Save True/False question changes
      else if (questionType === "true-false" && selectedQuestion && correctAnswerSelect && correctAnswerEl && questionStemEditor) {
        const updatedQuestionStem = getStemEditorText();
        const updatedQuestionStemHtml = getStemEditorHtml() || updatedQuestionStem;
        const optionValuesAll = Array.from(document.querySelectorAll('[data-option-textarea]')).map(el => readOptionEditorStored(el));
        const updatedOptions = optionValuesAll.slice(0, 2);
        const selectedOption = (correctAnswerSelect.value || 'A').trim().toUpperCase().charAt(0) || 'A';
        const caBody = readOptionEditorStored(correctAnswerEl) || updatedOptions[0] || 'True';
        const updatedCorrectAnswer = selectedOption + '. ' + caBody;

        const updatedFeedbacks: { [key: string]: string } = {};
        Array.from(document.querySelectorAll('[data-feedback-option-suffix]')).forEach(el => {
          const option = (el as HTMLElement).dataset.feedbackOptionSuffix;
          if (option === 'A' || option === 'B') {
            const prefixEl = document.querySelector(`[data-feedback-prefix="${option}"]`);
            const prefixText = prefixEl?.textContent?.trim() || '';
            updatedFeedbacks[`FeedbackOption${option}`] = ((prefixText ? prefixText + ' ' : '') + readOptionEditorStored(el)).trim();
          }
        });

        const updatedQuestion = {
          ...selectedQuestion,
          generatedImageUrl: resolveQuestionImageUrl(selectedQuestion, questionImages),
          label: updatedQuestionStemHtml,
          Question: updatedQuestionStemHtml,
          text: updatedQuestionStemHtml,
          QuestionText: updatedQuestionStemHtml,
          labelText: updatedQuestionStem,
          values: updatedOptions,
          CorrectAnswer: updatedCorrectAnswer,
          FeedbackOptionA: updatedFeedbacks['FeedbackOptionA'] || '',
          FeedbackOptionB: updatedFeedbacks['FeedbackOptionB'] || ''
        };
        // With passage tabs the edited stem is the PartPrompt, and the tab list must survive the save.
        applyTabsAndPartPrompt(updatedQuestion, selectedQuestion, getStemEditorText());

        if (genResults && Array.isArray(genResults)) {
          const isSameQuestion = (a: any, b: any) => {
            if (!a || !b) return false;
            if (a === b) return true;
            const aid = a.id || a.questionid || a.QuestionID || a.questionguid;
            const bid = b.id || b.questionid || b.QuestionID || b.questionguid;
            if (aid && bid && String(aid) === String(bid)) return true;
            const aText = String(a.label || a.Question || a.text || a.QuestionText || '').trim();
            const bText = String(b.label || b.Question || b.text || b.QuestionText || '').trim();
            return !!aText && !!bText && aText === bText;
          };
          const updatedResults = genResults.map(q => isSameQuestion(q, selectedQuestion) ? updatedQuestion : q);
          setGenResults(updatedResults);
          sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults));
          setQuestions(prev => prev.map(q => {
            const raw = q.raw || {};
            const same = raw === selectedQuestion ||
              (String(raw.id || raw.questionid || raw.QuestionID || raw.questionguid) &&
                String(raw.id || raw.questionid || raw.QuestionID || raw.questionguid) === String(selectedQuestion?.id || selectedQuestion?.questionid || selectedQuestion?.QuestionID || selectedQuestion?.questionguid)) ||
              (String(raw.label || raw.Question || raw.text || raw.QuestionText || '').trim() === String(selectedQuestion?.label || selectedQuestion?.Question || selectedQuestion?.text || selectedQuestion?.QuestionText || '').trim());
            if (same) {
              return {
                ...q,
                label: updatedQuestionStem,
                text: updatedQuestionStem,
                options: updatedOptions.map((opt, i) => ({
                  id: String.fromCharCode(65 + i),
                  text: opt,
                  isCorrect: updatedCorrectAnswer.startsWith(String.fromCharCode(65 + i))
                })),
                answer: updatedCorrectAnswer,
                raw: updatedQuestion
              };
            }
            return q;
          }));
          setHasUnsavedChanges(false);
        } else {
          try {
            const stored = sessionStorage.getItem("questionGenResults");
            const parsed = JSON.parse(stored || "null");
            let arr = Array.isArray(parsed) ? parsed : (parsed?.data || parsed?.questions || parsed?.result || []);
            if (Array.isArray(arr)) {
              const updatedResults = arr.map((q: any) => q === selectedQuestion ? updatedQuestion : q);
              sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults));
              setGenResults(updatedResults);
            }
          } catch { }
        }

        setSelectedQuestion(updatedQuestion);
        setEditSelectedCorrectLetter(selectedOption);  // ADD THIS LINE
        setRefreshKey((k) => k + 1);
      }
      // Update the actual question data for multiple choice questions (support up to 10 options)
      else if (questionType === "multiple-choice" && selectedQuestion && optionTextareas.length >= 2 && questionStemEditor) {
        const updatedQuestionStem = getStemEditorText();
        const updatedQuestionStemHtml = getStemEditorHtml() || updatedQuestionStem;
        const count = Math.min(optionTextareas.length, 10);
        const updatedOptions = Array.from(optionTextareas).slice(0, count).map(el => readOptionEditorStored(el));
        const mrCheckboxes = document.querySelectorAll('[data-correct-answer-checkbox]') as NodeListOf<HTMLInputElement>;
        const isMRUI = mrCheckboxes && mrCheckboxes.length > 0;
        let updatedCorrectAnswer: any = '';
        // Collect all textarea elements
        const textareaEls = document.querySelectorAll('[data-mr-correct-answer-textarea]');
        const textareaElsMC = document.querySelectorAll('[data-correct-answer-textarea]');
        if (isMRUI) {
          // Multiple response: build an array of answers
          updatedCorrectAnswer = Array.from(textareaEls).map((el, i) => {
            const letter = el.getAttribute('data-mr-correct-answer-textarea') || String.fromCharCode(65 + i);
            const text = readOptionEditorStored(el);
            return text ? `${letter}. ${text}` : letter;
          }).filter(Boolean); // remove empty entries
        } else {
          // Single response: use select + first textarea
          const correctAnswerSelectEl = document.querySelector('[data-correct-answer-select]') as HTMLSelectElement;
          const selectedOption = (correctAnswerSelectEl?.value || 'A').trim().toUpperCase().charAt(0) || 'A';
          const text = textareaElsMC[0] ? readOptionEditorStored(textareaElsMC[0]) : '';
          updatedCorrectAnswer = `${selectedOption}. ${text}`;
        }

        const updatedFeedbacks: { [key: string]: string } = {};
        feedbackEditors.forEach(el => {
          const option = (el as HTMLElement).dataset.feedbackOptionSuffix;
          if (option) {
            const prefixEl = document.querySelector(`[data-feedback-prefix="${option}"]`);
            const prefixText = prefixEl?.textContent?.trim() || '';
            updatedFeedbacks[`FeedbackOption${option}`] = ((prefixText ? prefixText + ' ' : '') + readOptionEditorStored(el)).trim();
          }
        });

        // Update the selected question object
        const updatedQuestion = {
          ...selectedQuestion,
          generatedImageUrl: resolveQuestionImageUrl(selectedQuestion, questionImages),
          label: updatedQuestionStemHtml,
          Question: updatedQuestionStemHtml,
          text: updatedQuestionStemHtml,
          QuestionText: updatedQuestionStemHtml,
          labelText: updatedQuestionStem,
          values: updatedOptions,
          CorrectAnswer: updatedCorrectAnswer,
          ...updatedFeedbacks,
          // Add this part to update ItemScoring.Marking
          ...(isMRUI && {
            ItemScoring: {
              ...selectedQuestion.ItemScoring,
              Marking: Array.isArray(updatedCorrectAnswer)
                ? updatedCorrectAnswer
                  .map((ans: string) => {
                    // Extract the first letter (A, B, C, etc.) from each correct answer
                    const match = String(ans || '').match(/^([A-J])/i);
                    return match ? match[1].toUpperCase() : '';
                  })
                  .filter(Boolean)
                  .join(',')
                : String(selectedQuestion.ItemScoring?.Marking || '')
            }
          })
        };
        // With passage tabs the edited stem is the PartPrompt, and the tab list must survive the save.
        applyTabsAndPartPrompt(updatedQuestion, selectedQuestion, getStemEditorText());

        // Update the genResults array
        if (genResults && Array.isArray(genResults)) {
          const isSameQuestion = (a: any, b: any) => {
            if (!a || !b) return false;
            if (a === b) return true;
            const aid = a.id || a.questionid || a.QuestionID || a.questionguid;
            const bid = b.id || b.questionid || b.QuestionID || b.questionguid;
            if (aid && bid && String(aid) === String(bid)) return true;
            const aText = String(a.label || a.Question || a.text || a.QuestionText || '').trim();
            const bText = String(b.label || b.Question || b.text || b.QuestionText || '').trim();
            return !!aText && !!bText && aText === bText;
          };
          const updatedResults = genResults.map(q =>
            isSameQuestion(q, selectedQuestion) ? updatedQuestion : q
          );
          setGenResults(updatedResults);

          // Update localStorage
          sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults));

          // Update the questions state for display
          setQuestions(prev => prev.map(q => {
            const raw = q.raw || {};
            const same = raw === selectedQuestion ||
              (String(raw.id || raw.questionid || raw.QuestionID || raw.questionguid) &&
                String(raw.id || raw.questionid || raw.QuestionID || raw.questionguid) === String(selectedQuestion?.id || selectedQuestion?.questionid || selectedQuestion?.QuestionID || selectedQuestion?.questionguid)) ||
              (String(raw.label || raw.Question || raw.text || raw.QuestionText || '').trim() === String(selectedQuestion?.label || selectedQuestion?.Question || selectedQuestion?.text || selectedQuestion?.QuestionText || '').trim());
            if (same) {
              return {
                ...q,
                label: updatedQuestionStem,
                text: updatedQuestionStem,
                options: updatedOptions.map((opt, i) => ({
                  id: String.fromCharCode(65 + i),
                  text: opt,
                  isCorrect: Array.isArray(updatedCorrectAnswer)
                    ? updatedCorrectAnswer.some((s: string) => s.toUpperCase().startsWith(String.fromCharCode(65 + i)))
                    : updatedCorrectAnswer.startsWith(String.fromCharCode(65 + i))
                })),
                answer: Array.isArray(updatedCorrectAnswer) ? updatedCorrectAnswer.join('; ') : updatedCorrectAnswer,
                raw: updatedQuestion
              };
            }
            return q;
          }));
          setHasUnsavedChanges(false);
        } else {
          // Fallback: update session storage if in-memory state is not an array
          try {
            const storedArray = readStoredGeneratedResultsArray();
            if (storedArray.length) {
              const replacement = replaceGeneratedQuestion(storedArray, selectedQuestion, updatedQuestion);
              const updatedResults = replacement.replaced ? replacement.data : storedArray.map((q: any) => q === selectedQuestion ? updatedQuestion : q);
              sessionStorage.setItem('questionGenResults', JSON.stringify(updatedResults));
              setGenResults(updatedResults);
            }
          } catch { }
        }

        // Update selectedQuestion state
        setSelectedQuestion(updatedQuestion);
        setRefreshKey((k) => k + 1);
      }

      setIsEditDialogOpen(false);
      setValidationErrors({ options: ['', '', '', ''], correctAnswer: '', correctAnswers: ['', '', '', '', '', '', '', '', '', ''], questionStem: '', sampleAnswer: '', keyPoints: ['', '', '', '', ''], feedbacks: ['', '', '', ''] }); // Reset errors
      setShowSuccessDialog(true);
    } else {
      // Auto-scroll to first error position
      setTimeout(() => {
        // Find the first error element and scroll to it
        let firstErrorElement = null;

        // Check question stem first (common to both types)
        if (newErrors.questionStem) {
          firstErrorElement = questionStemEditor;
        }
        // For written response questions
        else if (questionType === "written-response") {
          // Check Correct Answer
          if (newErrors.sampleAnswer) {
            firstErrorElement = sampleAnswerEl;
          }
          // Check key points
          else {
            for (let i = 0; i < newErrors.keyPoints.length; i++) {
              if (newErrors.keyPoints[i]) {
                firstErrorElement = keyPointEls[i];
                break;
              }
            }
          }
        }
        // For fill in the blank questions
        else if (questionType === "fill-blank" || questionType === "select-blank") {
          const isDropdownQuestionScroll = isFillBlankDropdownQuestion(selectedQuestion) || questionType === 'select-blank';
          // Check Correct Answer
          if (newErrors.correctAnswer) {
            firstErrorElement = correctAnswerEl;
          }
          // Check feedback
          else {
            const fibFbElsScroll = isDropdownQuestionScroll
              ? document.querySelectorAll('[data-feedback-option-suffix]')
              : document.querySelectorAll('[data-fill-blank-feedback-textarea]');

            // Handle both single feedback and multiple feedbacks scenarios
            if (fibFbElsScroll.length === 1 && newErrors.feedbacks[0]) {
              firstErrorElement = fibFbElsScroll[0];
            } else if (fibFbElsScroll.length > 1) {
              for (let i = 0; i < Math.min(newErrors.feedbacks.length, fibFbElsScroll.length); i++) {
                if (newErrors.feedbacks[i]) {
                  firstErrorElement = fibFbElsScroll[i];
                  break;
                }
              }
            }
          }
        }
        // For multiple choice questions
        else {
          // Check options
          for (let i = 0; i < newErrors.options.length; i++) {
            if (newErrors.options[i]) {
              firstErrorElement = optionTextareas[i];
              break;
            }
          }
          // Check correct answer for Multiple Response (individual correct answer textareas)
          if (!firstErrorElement && newErrors.correctAnswers) {
            const mrAnswerElsScroll = document.querySelectorAll('[data-mr-correct-answer-textarea]');
            for (let i = 0; i < newErrors.correctAnswers.length; i++) {
              if (newErrors.correctAnswers[i]) {
                firstErrorElement = mrAnswerElsScroll[i];
                break;
              }
            }
          }
          // Check feedback validation errors
          if (!firstErrorElement && newErrors.feedbacks) {
            const feedbackElsScroll = document.querySelectorAll('[data-feedback-option-suffix]');
            for (let i = 0; i < Math.min(newErrors.feedbacks.length, feedbackElsScroll.length); i++) {
              if (newErrors.feedbacks[i]) {
                firstErrorElement = feedbackElsScroll[i];
                break;
              }
            }
          }
          // Check correct answer (single answer or fallback)
          if (!firstErrorElement && newErrors.correctAnswer) {
            firstErrorElement = correctAnswerEl || correctAnswerSelect;
          }
        }

        if (firstErrorElement) {
          // Scroll the dialog content container to the error element
          const dialogContent = firstErrorElement.closest('.overflow-y-auto');
          if (dialogContent) {
            const elementRect = firstErrorElement.getBoundingClientRect();
            const containerRect = dialogContent.getBoundingClientRect();
            const scrollTop = dialogContent.scrollTop + elementRect.top - containerRect.top - 100;

            dialogContent.scrollTo({
              top: scrollTop,
              behavior: 'smooth'
            });
          } else {
            // Fallback to regular scroll
            firstErrorElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }

          // Focus the element after scrolling
          setTimeout(() => {
            firstErrorElement.focus();
          }, 300);
        }
      }, 150); // Increased delay to ensure DOM is updated with error messages
    }
  }

  // Real-time validation when correct answer dropdown changes
  const handleCorrectAnswerChange = (value: string) => {
    const sanitized = (value || '').trim().toUpperCase().charAt(0);
    const caEl = document.querySelector('[data-correct-answer-textarea]') as HTMLElement | null;
    const optionTextareas = document.querySelectorAll('[data-option-textarea]');
    if (!sanitized) {
      if (caEl) {
        caEl.innerHTML = '';
      }
      setEditSelectedCorrectLetter('');
      return;
    }

    if (caEl && optionTextareas.length >= 2) {
      const count = Math.min(optionTextareas.length, 10);
      const letters = Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
      const selectedIndex = letters.indexOf(sanitized);
      const optionValues = Array.from(optionTextareas).slice(0, count).map(el => readOptionEditorStored(el));
      const selectedOptionText = optionValues[selectedIndex];

      if (selectedOptionText) {
        caEl.innerHTML = selectedOptionText;
      }

      // Clear any existing validation errors for correct answer
      setValidationErrors(prev => ({
        ...prev,
        correctAnswer: '',
        correctAnswers: ['', '', '', '', '', '', '', '', '', '', ''],
        questionStem: prev.questionStem || '',
        sampleAnswer: prev.sampleAnswer || '',
        keyPoints: prev.keyPoints || ['', '', '', '', '']
      }));
    }
    // Update UI highlighting state
    setEditSelectedCorrectLetter(sanitized);
  }

  const handleSubmitFeedback = async () => {
    console.log("Storing feedback:", {
      question: selectedQuestionForRating,
      questionid: selectedQuestionId,
      questionrequestid: selectedQuestionRequestId,
      rating: questionRating,
      feedback: feedbackText
    });

    // Use index as fallback if question ID is null
    let questionKey = '';
    let questionId = selectedQuestionId;

    if (questionId == null) {
      // Find the question in the questions array and use its index as ID
      const questionIndex = questions.findIndex(q => {
        const text = q?.label || q?.Question || q?.text || q?.QuestionText || '';
        return text === selectedQuestionForRating;
      });

      if (questionIndex >= 0) {
        questionId = questionIndex + 1; // Use 1-based index
      } else {
        console.error('Could not determine question ID for storing feedback');
        return;
      }
    }

    // Allow submit when only feedback is provided (no rating)
    if (!questionRating && (!feedbackText || feedbackText.trim().length === 0)) {
      console.error('Nothing to submit: neither rating nor feedback provided');
      return;
    }

    // Store rating in state instead of calling API
    questionKey = `question_${questionId}`;
    setQuestionRatings(prev => ({
      ...prev,
      [questionKey]: {
        rating: questionRating,
        feedback: feedbackText
      }
    }));

    // Update the question in local state to show the rating immediately
    setQuestions(prev => prev.map(q => {
      const qNumeric = q.numericId !== undefined && q.numericId !== null ? Number(q.numericId) : null;
      const qId = q.id !== undefined ? Number(q.id) : (q.questionid !== undefined ? Number(q.questionid) : null);
      const match = (qNumeric !== null && questionId !== null && qNumeric === questionId) ||
        (qId !== null && questionId !== null && qId === questionId) ||
        (q?.label || q?.Question || q?.text || q?.QuestionText || '') === selectedQuestionForRating;
      if (match) {
        const ratingId = questionRating === 'up' ? 1 : questionRating === 'down' ? 2 : 0;
        return { ...q, ratingid: ratingId, feedback: feedbackText, rating_feedback: feedbackText };
      }
      return q;
    }));

    // Reset form and close dialog
    setQuestionRating(null);
    setFeedbackText('');
    setRatingDialogOpen(false);
  };

  const [selectedQuestionType, setSelectedQuestionType] = useState("Multiple Choice")
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  type Question = {
    id: number;
    questionid?: number;
    text: string;
    type: string;
    marks: number;
    options: { id: string; text: string; isCorrect: boolean }[];
    answer: string;
    createdat: string;
    [key: string]: any; // for any extra fields from API
  };


  // --- Load generated questions from localStorage if present ---
  const [questions, setQuestions] = useState<Question[]>([])
  const [genResults, setGenResults] = useState<any>(null);
  const [savedQuestionIds, setSavedQuestionIds] = useState<Set<string>>(new Set());
  // Tracks the value a user picks from a Fill-in-the-Blank dropdown, keyed by that question's card key
  const [fibDropdownSelections, setFibDropdownSelections] = useState<Record<string, string>>({});
  // Active passage tab per question card (and per dialog), keyed by card key
  const [activePassageTab, setActivePassageTab] = useState<Record<string, number>>({});
  // Which passage tab is being edited in the edit dialog
  const [editingPassageTabIndex, setEditingPassageTabIndex] = useState(0);
  const [questionImages, setQuestionImages] = useState<Map<string, string>>(new Map());
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);

  // Function to generate images for questions
  const generateImagesForQuestions = async (questionsList: any[]) => {
    setIsGeneratingImages(true);
    const newImages = new Map<string, string>();

    for (const question of questionsList) {
      const questionText = question.label || question.QuestionStatement || question.Question || question.text || '';
      const studyVal = sessionStorage.getItem('selectedChapterName') || sessionStorage.getItem('bookTitle') || question.BookName || question.study || question.chapter || question.bookname || question.Topic || question.topic || "";
      const loVal = sessionStorage.getItem('learningObjectivesName') || sessionStorage.getItem('selectedLO') || question.EnablingObjective || question.learningObjective || question.lo || question.learningobjective || question.LearningObjective || "";
      if (questionText.trim()) {
        try {
          const imageUrl = await generateImageForQuestion(questionText, studyVal, loVal);
          if (imageUrl && question.id) {
            newImages.set(question.id, imageUrl);
          }
        } catch (error) {
          console.error('Failed to generate image for question:', question.id, error);
        }
      }
    }

    setQuestionImages(newImages);
    setIsGeneratingImages(false);
  };

  useEffect(() => {
    // Try to load questionGenResults from localStorage
    const stored = sessionStorage.getItem("questionGenResults");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Support both array and object with array inside
        let arr = Array.isArray(parsed) ? parsed : (parsed.data || parsed.questions || parsed.result || parsed.results || []);

        // If the parsed object contains an array of agent results (like from AIGQuestionGenerationLoading)
        if (parsed.results && Array.isArray(parsed.results)) {
          arr = [];
          parsed.results.forEach((res: any) => {
            const actualData = res.data || res;
            if (actualData.data && Array.isArray(actualData.data)) arr.push(...actualData.data);
            else if (actualData.questions && Array.isArray(actualData.questions)) arr.push(...actualData.questions);
            else if (actualData.result && Array.isArray(actualData.result)) arr.push(...actualData.result);
            else if (actualData.results && Array.isArray(actualData.results)) arr.push(...actualData.results);
            else if (Array.isArray(actualData)) arr.push(...actualData);
          });
        }
        // If the array is in the root, or in .data/.questions/.result
        if (Array.isArray(arr) && arr.length > 0 && arr[0].label) {
          // First, ensure each question has an ID
          const questionsWithIds = arr.map(q => {
            const id = q.id || q.questionid || q.QuestionID || q.questionguid || q.question_uuid || q.uuid || generateUniqueId();
            // Assign back to the question object if it doesn't have an ID
            if (!q.id) q.id = id;
            return q;
          });

          // Update the array in storage with the new IDs
          if (JSON.stringify(questionsWithIds) !== JSON.stringify(arr)) {
            const updatedStorage = Array.isArray(parsed)
              ? questionsWithIds
              : { ...parsed, data: questionsWithIds };
            sessionStorage.setItem("questionGenResults", JSON.stringify(updatedStorage));
          }

          // Map to Question[] shape for display
          setQuestions(questionsWithIds.map((q) => {
            const id = q.id; // Now guaranteed to exist
            return {
              id,
              text: q.label || q.QuestionStatement || q.Question || q.text || '',
              type: q.type || (q.values ? 'multiple-choice' : 'written-response'),
              marks: q.MaxMarks || q.marks || 1,
              options: Array.isArray(q.values) ? q.values.map((v, i) => {
                const optionId = String.fromCharCode(65 + i);
                const correctSet = (() => {
                  if (Array.isArray(q.CorrectAnswer)) {
                    return new Set(q.CorrectAnswer
                      .map((s: string) => String(s).trim())
                      .map((s: string) => (s.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase())
                      .filter(Boolean));
                  }
                  // If ItemScoring.Marking has comma-separated letters
                  if (q.ItemScoring && typeof q.ItemScoring.Marking === 'string') {
                    return new Set(q.ItemScoring.Marking.split(',')
                      .map((s: string) => s.trim().replace(/\.$/, '').toUpperCase())
                      .filter(Boolean));
                  }
                  // If marks object per option provided
                  if (q.marks && typeof q.marks === 'object') {
                    return new Set(Object.entries(q.marks)
                      .filter(([key, val]) => Number(val) > 0)
                      .map(([key]) => String(key).toUpperCase()));
                  }
                  // Fallback to single CorrectAnswer string like "A. ..."
                  if (typeof q.CorrectAnswer === 'string') {
                    const letter = (q.CorrectAnswer.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase();
                    return new Set(letter ? [letter] : []);
                  }
                  return new Set<string>();
                })();
                return {
                  id: optionId,
                  text: v,
                  isCorrect: correctSet.has(optionId)
                };
              }) : [],
              answer: q.CorrectAnswer || q.answer || '',
              createdat: '',
              LearningObjective: q.LearningObjective,
              ReferenceInfo: q.ReferenceInfo,
              BookName: q.BookName,
              Feedback: Object.keys(q).filter(k => k.startsWith('FeedbackOption')).map(k => ({
                option: k.replace('FeedbackOption', ''),
                feedback: q[k]
              })),
              raw: q
            };
          }));

          setGenResults(questionsWithIds);

          return;
        }
      } catch { }
    }
    // fallback: keep existing questions state
  }, []);

  useEffect(() => {
    if (!genResults) return;
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // ignore errors (e.g., if window is not available)
    }
  }, [genResults]);

  useEffect(() => {
    let userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");

    const payload = {
      custcode: sessionStorage.getItem('custcode') || userInfo["custcode"] || "",
      orgcode: sessionStorage.getItem('orgcode') || userInfo["orgcode"] || "",
      usercode: sessionStorage.getItem('userCode') || userInfo["usercode"] || "",
      appcode: sessionStorage.getItem('appcode'), type: 1
      // add other fields as needed
    };

    const getStats = async () => {
      try {
        const stats = await fetchUsageStats(payload);
        // Normalize and pick index 0 robustly
        const deepFlatten = (arr: any[]): any[] =>
          arr.reduce((acc: any[], val: any) => acc.concat(Array.isArray(val) ? deepFlatten(val) : val), []);
        let remaining = 0;
        if (Array.isArray(stats)) {
          const first: any = stats[0];
          if (typeof first === 'number') {
            remaining = first;
          } else if (Array.isArray(first)) {
            // Prefer the very first numeric entry from the first row
            const val = (first as any[])[2];
            if (typeof val === 'number' && Number.isFinite(val)) remaining = val;
            else if (typeof val === 'string' && /^\d[\d,]*$/.test(val)) remaining = Number(String(val).replace(/,/g, '')) || 0;
          } else if (typeof first === 'object' && first) {
            // Try common keys
            const f: any = first as any;
            const candidate = (f?.remainingTokens ?? f?.tokensRemaining ?? f?.balance ?? f?.[0]);
            if (typeof candidate === 'number' && Number.isFinite(candidate)) remaining = candidate;
            else if (typeof candidate === 'string') remaining = Number(String(candidate).replace(/,/g, '')) || 0;
          }
        }

        // Fallback: attempt from sessionStorage 'usageStats'
        if (!remaining || !Number.isFinite(remaining)) {
          try {
            const raw = sessionStorage.getItem('usageStats') || 'null';
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const p0 = parsed[0];
              if (typeof p0 === 'number') remaining = p0;
              else if (Array.isArray(p0)) {
                const val = (p0 as any[])[2];
                if (typeof val === 'number' && Number.isFinite(val)) remaining = val as number;
                else if (typeof val === 'string') remaining = Number(val.replace(/,/g, '')) || 0;
              } else if (typeof p0 === 'string') {
                remaining = Number(p0.replace(/,/g, '')) || 0;
              }
            }
          } catch { }
        }

        setRemainingTokens(Number.isFinite(remaining) ? remaining : 0);
      } catch (err) {
        setError((err as Error).message);
      }
    };

    getStats();
  }, []);

  // Fetch user preferences
  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        let userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");

        const payload = {
          orgcode: sessionStorage.getItem('orgcode') || userInfo["orgcode"] || "ACCA01_ES",
          custcode: sessionStorage.getItem('custcode') || userInfo["custcode"] || "ACCAO1",
          usercode: sessionStorage.getItem('userCode') || userInfo["usercode"] || "esiguser3",
          appcode: sessionStorage.getItem('appcode') || "AIG"
        };

        const response = await axios.post(`${AIG_QUIZ_GEN_URL}/get_preference`, payload);

        if (response.data) {
          setUserPreferences({
            isrewrite: response.data.isrewrite || 0,
            issimilarity: response.data.issimilarity || 0,
            isvalidate: response.data.isvalidate || 0
          });
        }
      } catch (error) {
        console.error('Failed to fetch user preferences:', error);
      }
    };

    fetchPreferences();
  }, []);


  // Dynamic key points that will be loaded from selected question
  const getKeyPointsFromQuestion = (question: any) => {
    if (!question) return [];

    // Try to get key points from various possible fields
    if (question.KeyPoints && Array.isArray(question.KeyPoints)) {
      return question.KeyPoints;
    }
    if (question.keyPoints && Array.isArray(question.keyPoints)) {
      return question.keyPoints;
    }

    // Default key points if none exist
    return [
      "Speculative risks - Include the potential for financial gain, which is incompatible with insurance principles.",
      "Pure risks - Only involve loss or no loss, making them insurable and predictable.",
      "Risk predictability - Insurance relies on statistical data to assess and cover pure risks.",
      "Profit exclusion - Insurance excludes risks with potential profit to avoid gambling",
      "Actuarial basis - Insurers use pure risks for accurate premium calculations and risk management."
    ];
  };

  // Detect if a question should be treated as Fill-in-the-Blank
  const isFillBlankQuestion = (question: any) => {
    if (!question) return false;
    try {
      const sel = sessionStorage.getItem('selectedQuestionType') || '';
      if (/fill|blank|fib|gap/i.test(sel)) return true;
    } catch { }

    const typeLabel = String(question.QuestionType || question.type || question.questiontype || question.questiontypename || question.questiontypeName || '');
    if (/fill|blank|fib|gap/i.test(typeLabel)) return true;

    // Check question text for common gap patterns (allow for HTML-encoded brackets)
    const text = String(question.label || question.Question || question.text || question.QuestionText || '');
    // match [gap], [gap1], (gap1), ____, or HTML-encoded brackets like &#91;gap1&#93;
    // if (/\[\s*gap\s*\d*\s*\]|\(\s*gap\s*\d*\s*\)|__+|\bblank\b|&#91;\s*gap\s*\d*\s*&#93;/i.test(text)) return true;

    // If only a single value exists and the correct answer is not a labeled option, treat as FIB
    const values = Array.isArray(question.values) ? question.values : (Array.isArray(question.options) ? question.options : []);
    if (values.length === 1) {
      const ca = String(question.CorrectAnswer || question.answer || '');
      // If CA starts with A. or A) or A space, treat as MC
      if (!/^[A-Da-d][\.\)\s]/.test(ca.trim())) return true;
    }

    return false;
  };

  const isFillBlankDropdownQuestion = (question: any) => isDropdownBlankQuestion(question);

  const getDropdownOptionsFromQuestion = (question: any): string[] => {
    if (!question || typeof question !== 'object') return [];

    const normalizeOption = (value: any) => {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') return value?.text || value?.value || String(value);
      return String(value ?? '');
    };

    const sources = [
      question.DropdownOptions,
      question.dropdownoptions,
      question.DropdownValues,
      question.dropdownValues,
      question.values,
      question.options,
      question?.questiondata?.DropdownOptions,
      question?.questiondata?.dropdownoptions,
      question?.questiondata?.values,
      question?.questiondata?.options,
      question?.AIquestiondata?.DropdownOptions,
      question?.AIquestiondata?.dropdownoptions,
      question?.AIquestiondata?.values,
      question?.AIquestiondata?.options,
      question?.[2]?.DropdownOptions,
      question?.[2]?.dropdownoptions,
      question?.[2]?.values,
      question?.[2]?.options,
    ];

    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      const normalized = source
        .map(normalizeOption)
        .map((value: string) => String(value).trim())
        .filter((value: string) => value.length > 0);
      if (normalized.length > 0) return normalized;
    }

    return [];
  };


  // Update key point at specific index
  const updateKeyPoint = (index: number, value: string) => {
    setEditingKeyPoints(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const updateMatrixRowText = (rowIndex: number, value: string) => {
    setMatrixEdit(prev => ({
      ...prev,
      rows: prev.rows.map((row, idx) => (idx === rowIndex ? value : row))
    }));
  };

  const updateMatrixColumnText = (colIndex: number, value: string) => {
    setMatrixEdit(prev => ({
      ...prev,
      columns: prev.columns.map((col, idx) => (idx === colIndex ? value : col))
    }));
  };

  const updateMatrixAnswer = (rowIndex: number, colIndex: number) => {
    setMatrixEdit(prev => ({
      ...prev,
      answers: prev.answers.map((answer, idx) => (idx === rowIndex ? colIndex : answer))
    }));
  };

  const updateMatrixFeedback = (rowIndex: number, value: string) => {
    setMatrixEdit(prev => ({
      ...prev,
      feedbacks: prev.feedbacks.map((feedback, idx) => (idx === rowIndex ? value : feedback))
    }));
  };

  // Navigation guard function
  const handleNavigation = (path: string, tabName?: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(path);
      if (tabName) {
        setPendingTabChange(tabName);
      }
      setShowNavigationDialog(true);
    } else {
      try {
        if (typeof path === 'string' && path.includes('/advanced-question-generator')) {
          sessionStorage.setItem('AIG_QGEN_RESET', '1');
        }
      } catch { }
      if (tabName) {
        setActiveTab(tabName);
      }
      navigate(path);
    }
  };

  // Update formData from actual form elements
  const updateFormDataFromForm = () => {
    const questionStemEditor = getStemEditor();
    const correctAnswerElForm = document.querySelector('[data-correct-answer-textarea]');
    const correctAnswerSelect = document.querySelector('[data-correct-answer-select]') as HTMLSelectElement;
    const optionTextareas = document.querySelectorAll('[data-option-textarea]');
    const feedbackElsForm = document.querySelectorAll('[data-feedback-option-suffix]');

    const updatedFormData = {
      ...formData,
      questionStem: getStemEditorText() || '',
      correctAnswer: (correctAnswerElForm ? readOptionEditorPlain(correctAnswerElForm) : '') || correctAnswerSelect?.value || '',
      options: Array.from(optionTextareas).slice(0, 4).map(el => readOptionEditorStored(el)),
    };

    // Update feedback fields
    Array.from(feedbackElsForm).forEach((el) => {
      const option = (el as HTMLElement).dataset.feedbackOptionSuffix;
      if (option === 'A' || option === 'B' || option === 'C' || option === 'D') {
        const prefixEl = document.querySelector(`[data-feedback-prefix="${option}"]`);
        const prefixText = prefixEl?.textContent?.trim() || '';
        const suffix = readOptionEditorStored(el);
        updatedFormData[`FeedbackOption${option}`] = ((prefixText ? prefixText + ' ' : '') + suffix).trim();
      }
    });

    setFormData(updatedFormData);
    return updatedFormData;
  };

  const handleValidate = async () => {
    // Update formData from actual form elements
    const currentFormData = updateFormDataFromForm();
    // Clear any previous messages
    // setValidationMessage({text: '', type: '', details: null});

    // Force a re-render to ensure that message is cleared
    await new Promise(resolve => setTimeout(resolve, 0));

    // Basic validation first
    if (!currentFormData.questionStem || !currentFormData.questionStem.trim()) {
      setErrors(prev => ({
        ...prev,
        questionStem: 'Question Stem cannot be empty.'
      }));
      setValidationMessage({
        text: 'Validation failed: Please check the form for errors.',
        type: 'error',
        details: null
      });
      return;
    }

    // Validate options for multiple choice questions.
    // `questionType` holds kebab-case values ("multiple-choice"), so comparing it
    // to 'Multiple Choice' never matched and these checks never ran.
    const normalizedType = String(questionType || '').toLowerCase().replace(/[\s_]+/g, '-');
    const isOptionBasedType = normalizedType === 'multiple-choice'
      || normalizedType === 'multiple-response'
      || normalizedType === 'true-false';
    if (isOptionBasedType) {
      const optionErrors = currentFormData.options.map(opt => {
        if (!opt || !opt.trim()) return 'Option cannot be empty';
        return '';
      });

      if (optionErrors.some(err => err)) {
        setErrors(prev => ({
          ...prev,
          options: optionErrors
        }));
        setValidationMessage({
          text: 'Validation failed: Please fill in all options.',
          type: 'error',
          details: null
        });
        return;
      }

      // Check for duplicate options
      const uniqueOptions = new Set(currentFormData.options.map(opt => opt.trim().toLowerCase()));
      if (uniqueOptions.size !== currentFormData.options.length) {
        setValidationMessage({
          text: 'Validation failed: Options must be unique.',
          type: 'error',
          details: null
        });
        return;
      }

      // Validate correct answer
      if (!currentFormData.correctAnswer || !currentFormData.correctAnswer.trim()) {
        setErrors(prev => ({
          ...prev,
          correctAnswer: 'Please select a correct answer.'
        }));
        setValidationMessage({
          text: 'Validation failed: Please select a correct answer.',
          type: 'error',
          details: null
        });
        return;
      }
    }

    // If we get here, basic validation passed
    setIsValidating(true);

    try {
      // Prepare question data for validation
      const questionForValidation = { ...selectedQuestion };

      // Update question data with current form values
      questionForValidation.label = currentFormData.questionStem;
      questionForValidation.QuestionStatement = currentFormData.questionStem;
      questionForValidation.CorrectAnswer = currentFormData.correctAnswer;
      questionForValidation.values = currentFormData.options;
      // Add feedback fields if they exist
      if (currentFormData.FeedbackOptionA) questionForValidation.FeedbackOptionA = currentFormData.FeedbackOptionA;
      if (currentFormData.FeedbackOptionB) questionForValidation.FeedbackOptionB = currentFormData.FeedbackOptionB;
      if (currentFormData.FeedbackOptionC) questionForValidation.FeedbackOptionC = currentFormData.FeedbackOptionC;
      if (currentFormData.FeedbackOptionD) questionForValidation.FeedbackOptionD = currentFormData.FeedbackOptionD;

      // Prepare the payload for validation API
      // The stored source label is "Book Based", so an exact 'Book' comparison
      // always fell through to LLM and never sent the book path.
      const isBookSource = /book/i.test(String(questionForValidation.source || ''));
      const payload = {
        url: isBookSource ? (questionForValidation.bookpath || '').replace(/\n/g, '').replace('IIC/', '') : '',
        question: JSON.stringify(questionForValidation),
        source: isBookSource ? 'Book' : 'LLM',
        custcode: sessionStorage.getItem('custcode'),
        orgcode: sessionStorage.getItem('orgcode'),
        usercode: sessionStorage.getItem('userCode'),
        appcode: sessionStorage.getItem('appcode'),
        booknameid: questionForValidation.bookId || 0,
        bookname: questionForValidation.BookName || '',
        questiontypename: questionForValidation.type || '',
        questiontypeid: questionForValidation.questionTypeId || 0,
        taxonomyid: questionForValidation.taxonomyId ? parseInt(questionForValidation.taxonomyId) : 0,
        difficultylevelid: questionForValidation.difficultyLevelId || '1',
        chaptercode: questionForValidation.chapterCode || '',
        looutcomes: questionForValidation.learningOutcomes || '',
        sourcetype: Number(questionForValidation.sourceType || 1),
        referenceinfo: "",
        noofquestions: 1,
        creativitylevel: questionForValidation.creativityLevel || '1',
        agentname: "Retrieval",
        agent_status: "1",
        Rating: "",
        Rating_Feedback: "",
        job_id: sessionStorage.getItem('job_id') || null,
        // selectedChapter can be absent (e.g. after a page refresh); calling
        // .replace on null threw before the request was ever sent, so validation
        // silently failed with a generic error.
        kbname: String(sessionStorage.getItem('selectedChapter') || sessionStorage.getItem('bookTitle') || '')
          .replace(/,/g, '').replace(/:/g, '').replace(/\s+/g, '_'),
        sourcename: questionForValidation.bookname,
        validate_content: 'Yes',
        taxonomyname: (questionForValidation.taxonomy || '').toUpperCase(),
        task_content: "",
        question_type: questionForValidation.type || ''
      };

      // First call to /retrieval to get job_id
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

      if (response.data && response.data.compliant_content) {
        const content = response.data.compliant_content.replace(/\\n/g, '\n');
        // Extract main validation result
        const validationResultMatch = content.match(/VALIDATION_RESULT:\s*([^\n]+)/i);
        const validationResult = validationResultMatch ? validationResultMatch[1].trim() : 'Validation completed';

        // Extract reasoning section
        const reasoningMatch = content.match(/REASONING\([^)]+\):([\s\S]*?)(?=\n\w|$)/i);
        const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';

        // Extract individual validation items
        const validationItems = [];
        const itemRegex = /([\w\s]+):\s*(PASS|FAIL)\s*\(([^)]+)\)/gi;
        let match;

        while ((match = itemRegex.exec(content)) !== null) {
          const [, item, status, details] = match;
          validationItems.push({
            item: item.trim(),
            status: status.trim(),
            details: details.trim()
          });
        }

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
        type: 'error',
        details: null
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Confirm navigation without saving
  const confirmNavigation = () => {
    if (pendingNavigation) {
      if (pendingTabChange) {
        setActiveTab(pendingTabChange);
      }
      navigate(pendingNavigation);
    }
    setShowNavigationDialog(false);
    setPendingNavigation(null);
    setPendingTabChange(null);
  };

  // Cancel navigation
  const cancelNavigation = () => {
    setShowNavigationDialog(false);
    setPendingNavigation(null);
    setPendingTabChange(null);
  };

  const stats = [
    {
      title: "Remaining Tokens",
      value: remainingTokens,
      icon: <Zap className="w-5 h-5 text-blue-600" />,
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200"
    },
    {
      title: "Questions Generated",
      value: sessionStorage.getItem("selectedQuantity") || "1",
      icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
      bgColor: "bg-green-50",
      borderColor: "border-green-200"
    },
    {
      title: "Book Name",
      value: sessionStorage.getItem('bookTitle') || "",
      icon: <BookOpen className="w-5 h-5 text-orange-600" />,
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200"
    }
  ]



  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      {!isSSO && (
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
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
                <span className="text-base text-purple-600 font-medium">Book Name: {sessionStorage.getItem('bookTitle') || ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs">⚡</span>
                </div>
                <span className="text-base text-blue-600 font-medium">
                  Remaining Tokens: {remainingTokens}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-600"
                onClick={() => {
                  try {
                    // Use existing bookTitle if set, otherwise default
                    const current = sessionStorage.getItem('bookTitle');
                    // Build a URL-safe slug from the book title (lowercase, non-alphanum -> hyphen)
                    const slug = String(current)
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/(^-|-$)/g, '');
                    // Persist normalized title back to session (defensive)
                    sessionStorage.setItem('bookTitle', current);
                    handleNavigation(`/advanced-question-generator/${slug}`);
                  } catch (e) {
                    // Fallback to a known route
                    handleNavigation('/advanced-question-generator/business-and-technology');
                  }
                }}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Generation Page
              </Button>
              {/* <Button
              variant="ghost"
              size="sm"
              className="text-gray-600"
              onClick={() => {
                sessionStorage.removeItem('authToken')
                sessionStorage.removeItem('userSession')
                sessionStorage.clear()
                window.location.href = "/"
              }}
            >
              Sign Out
            </Button> */}
            </div>

          </div>
        </div>
      )}
      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto">
        {/* Navigation Tabs */}
        {!isSSO && (
          <div className="flex justify-center mb-8">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 max-w-lg">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    handleNavigation("/advanced-question-generator/cyber-risk", "generate");
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
                  onClick={() => {
                    handleNavigation("/advanced-question-repository", "repository");
                  }}
                  className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${window.location.pathname === "/advanced-question-repository" || activeTab === "repository"
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
        )}

        {/* Statistics Cards */}
        {!isSSO && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {stats.map((stat, index) => (
              <Card key={index} className={`p-6 ${stat.bgColor} border ${stat.borderColor} shadow-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">{stat.title}</span>
                  {stat.icon}
                </div>
                <div className="text-2xl font-bold text-gray-900 break-words max-w-xs">{stat.value}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Generated Questions from localStorage (AI results) */}

        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
            {isSSO && (
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-600"
                onClick={() => {
                  try {
                    // Use existing bookTitle if set, otherwise default
                    const current = sessionStorage.getItem('bookTitle');
                    // Build a URL-safe slug from the book title (lowercase, non-alphanum -> hyphen)
                    const slug = String(current)
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/(^-|-$)/g, '');
                    // Persist normalized title back to session (defensive)
                    sessionStorage.setItem('bookTitle', current);
                    handleNavigation(`/advanced-question-generator/${slug}`);
                  } catch (e) {
                    // Fallback to a known route
                    handleNavigation('/advanced-question-generator/business-and-technology');
                  }
                }}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Generated Questions</h3>
              <p className="text-sm text-gray-500">These are the latest AI-generated questions based on your request.</p>
            </div>
            <div className="flex gap-2 mt-2 md:mt-0">
              <Button
                className="bg-green-100 hover:bg-green-200 text-green-800 border border-green-300 disabled:opacity-70 disabled:cursor-not-allowed"
                disabled={isSavingAll}
                onClick={async () => {
                  // Check if questions are already saved to repository
                  if (isAlreadySavedToRepository) {
                    setSaveAllDialogType("info");
                    setSaveAllDialogMessage("Question is already saved to repository");
                    setShowSaveAllDialog(true);
                    return;
                  }

                  // SSO mode only: show a loader and refuse re-entry until this
                  // save settles. Non-SSO keeps its original click behaviour.
                  const ssoSaveMode = sessionStorage.getItem("isSSO") === "true";
                  if (ssoSaveMode) {
                    if (saveAllInFlight.current) return;
                    saveAllInFlight.current = true;
                    setIsSavingAll(true);
                  }

                  // Proceed to save regardless of hasUnsavedChanges; rely on results presence
                  try {
                    // Prefer in-memory state if present
                    let results: any = Array.isArray(genResults) && genResults.length ? genResults : undefined;
                    if (!results) {
                      const raw = sessionStorage.getItem("questionGenResults");
                      const data = JSON.parse(raw || "null");
                      // Try all common array locations
                      if (Array.isArray(data)) {
                        results = data;
                      } else if (data && Array.isArray(data?.data)) {
                        results = data.data;
                      } else if (data && Array.isArray(data?.questions)) {
                        results = data.questions;
                      } else if (data && Array.isArray(data?.result)) {
                        results = data.result;
                      } else if (data && Array.isArray(data?.results)) {
                        // agentic workflow: unwrap nested results
                        const extracted: any[] = [];
                        const extractDeep = (node: any, depth = 0) => {
                          if (!node || depth > 3) return;
                          if (Array.isArray(node)) {
                            node.forEach(n => extractDeep(n, depth + 1));
                            return;
                          }
                          if (typeof node === 'object') {
                            if (
                              node.label ||
                              node.Question ||
                              node.text ||
                              node.QuestionText ||
                              Array.isArray(node.values)
                            ) {
                              extracted.push(node);
                            }
                            Object.values(node).forEach(v => extractDeep(v, depth + 1));
                          }
                        };
                        try {
                          data.results.forEach((r: any) => extractDeep(r?.data));
                        } catch { }
                        results = extracted;
                      } else if (data && typeof data === 'object') {
                        // array-like object with numeric keys
                        const keys = Object.keys(data);
                        if (keys.length > 1 && keys.every(k => !isNaN(Number(k)))) {
                          const arrLike = keys.map(k => (data as any)[k]);
                          if (arrLike.every((q: any) => typeof q === 'object' && (q.label || q.Question || q.text))) {
                            results = arrLike;
                          }
                        } else if (data.label || data.Question || data.text) {
                          results = [data];
                        }
                      }
                    }
                    // Normalize shape
                    if (!Array.isArray(results)) results = [];
                    // Flatten defensive
                    if (results.length === 1 && Array.isArray(results[0])) results = results[0];
                    // Wrap single object defensively
                    if (!Array.isArray(results) && results && typeof results === 'object') results = [results];
                    results = results.filter(Boolean);

                    // Deduplicate like UI and drop matrix child artifacts
                    const uniqueResults: any[] = [];
                    const seen = new Set<string>();
                    const matrixRoots = (results as any[]).filter((r: any) => r?.type === 'matrix' || (Array.isArray(r?.rows) && Array.isArray(r?.columns)));
                    const matrixChildTexts = new Set<string>();
                    matrixRoots.forEach((root: any) => {
                      (root.columns || []).forEach((c: any) => {
                        if (c && c.text) matrixChildTexts.add(String(c.text).trim().toLowerCase());
                        if (c && c.value) matrixChildTexts.add(String(c.value).trim().toLowerCase());
                      });
                      (root.rows || []).forEach((rr: any) => {
                        if (rr && rr.text) matrixChildTexts.add(String(rr.text).trim().toLowerCase());
                        if (rr && rr.value) matrixChildTexts.add(String(rr.value).trim().toLowerCase());
                      });
                    });
                    (results as any[]).forEach((r: any) => {
                      const isMatrixRoot = r?.type === 'matrix' || (Array.isArray(r?.rows) && Array.isArray(r?.columns));
                      const candidateText = String(r?.label || r?.Question || r?.text || '').trim().toLowerCase();
                      if (!isMatrixRoot && candidateText && matrixChildTexts.has(candidateText)) return;
                      const key = String(
                        r.id || r.questionid || r.questionguid || r.label || r.Question || r.text || (r.type ? `${r.type}::${r.label || ''}` : JSON.stringify(r))
                      );
                      if (!seen.has(key)) { seen.add(key); uniqueResults.push(r); }
                    });
                    results = uniqueResults;
                    if (!results.length) {
                      setSaveAllDialogType("error");
                      setSaveAllDialogMessage("No questions to save.");
                      setShowSaveAllDialog(true);
                      return;
                    }
                    // Prepare payload for API (normalize session identifiers with fallbacks)
                    let userInfo: Record<string, any> = {};
                    try { userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}'); } catch { }
                    const usercode = sessionStorage.getItem('userCode') || userInfo["usercode"] || userInfo["userCode"] || '';
                    const orgcode = sessionStorage.getItem('orgcode') || userInfo["orgcode"] || userInfo["orgCode"] || '';
                    const custcode = sessionStorage.getItem('custcode') || userInfo["custcode"] || userInfo["customerCode"] || 'ES';
                    const appcode = sessionStorage.getItem('appcode') || 'AIG';
                    const booknameid = Number(sessionStorage.getItem('bookid')) || 2;
                    const questiontypeid = Number(sessionStorage.getItem('questiontypeid')) || 1;
                    const taxonomy = sessionStorage.getItem('selectedTaxonomy');
                    const taxonomyid = taxonomy == "Remember" ? 1 : taxonomy == "Understand" ? 2 : taxonomy == "Apply" ? 3 : taxonomy == "Analyze" ? 4 : taxonomy == "Evaluate" ? 5 : taxonomy == "Create" ? 6 : 0;
                    const difficultlevelid = Number(sessionStorage.getItem('difficultlevelid')) || 1;
                    const chaptercode = sessionStorage.getItem('chaptercode') || 'S11';
                    const sourcetype = Number(sessionStorage.getItem('sourcetype')) || 1;
                    const source = sessionStorage.getItem('selectedGenerationMode') || 'Book Based';
                    const creativitylevelname = sessionStorage.getItem('selectedCreativityLevel') || 'Moderate';
                    const bookIdentifier = sessionStorage.getItem('bookIdentifier') || 'B2';
                    // Map results to API payload structure
                    const questionsPayload = results.map((q, idx) => {
                      // Get rating data for this question
                      const questionKey = `question_${q.id || q.questionid || (idx + 1)}`;
                      const ratingData = questionRatings[questionKey] || { rating: null, feedback: '' };
                      const ratingId = ratingData.rating === 'up' ? 1 : ratingData.rating === 'down' ? 2 : 0;
                      // Convert creativity level name to ID
                      let creativitylevelid;
                      switch (creativitylevelname.toLowerCase()) {
                        case "high":
                          creativitylevelid = 2;
                          break;
                        case "very high":
                          creativitylevelid = 3;
                          break;
                        case "moderate":
                        default:
                          creativitylevelid = 1;
                          break;
                      }
                      const isMatrix = q?.type === 'matrix' || (Array.isArray(q?.rows) && Array.isArray(q?.columns));
                      const generatedImageUrl = resolveQuestionImageUrl(q, questionImages);
                      const generatedImages = Array.isArray((q as any)?.generatedImages) && (q as any).generatedImages.length
                        ? (q as any).generatedImages
                        : (generatedImageUrl ? [generatedImageUrl] : []);
                      const generatedimagetype = typeof (q as any).generatedimagetype === 'number'
                        ? (q as any).generatedimagetype
                        : ((q as any).generatedimagetype !== undefined && (q as any).generatedimagetype !== null && (q as any).generatedimagetype !== '')
                          ? Number((q as any).generatedimagetype)
                          : 0;
                      // Per-option images (Multiple Choice / Multiple Response) travel with the
                      // question JSON, the same way the question image does.
                      const optionImages = Array.isArray((q as any)?.optionImages) ? (q as any).optionImages : [];
                      const caNormalized = isMatrix
                        ? (Array.isArray(q?.CorrectAnswer) ? q.CorrectAnswer : (Array.isArray(q?.answers) ? q.answers : []))
                        : (Array.isArray(q?.CorrectAnswer) ? String(q.CorrectAnswer[0] || '') : String(q?.CorrectAnswer || q?.correctAnswer || q?.answer || ''));

                      // Determine types and map to correct questiontypeid
                      const isFIB = isFillBlankQuestion(q);
                      const isFIBDropdown = isFillBlankDropdownQuestion(q);
                      const selectedQuestionType = sessionStorage.getItem('selectedQuestionType') || '';
                      const selectedQty = String(Number(sessionStorage.getItem('selectedQuantity')) || 1);

                      // Map question types to their correct questiontypeid
                      let qtIdStr = "1"; // default for Multiple Choice
                      if (isMatrix) {
                        qtIdStr = "8"; // Matrix
                      } else if (selectedQuestionType === 'Select the Blank') {
                        qtIdStr = "9"; // Fill In the Blank Dropdown
                      } else if (isFIB) {
                        qtIdStr = "4"; // Fill In the Blank
                      } else {
                        // Use selectedQuestionType to determine the correct typeid
                        switch (selectedQuestionType) {
                          case "Multiple Response":
                            qtIdStr = "2";
                            break;
                          case "True False":
                            qtIdStr = "3";
                            break;
                          case "Fill In the Blank":
                            qtIdStr = "4";
                            break;
                          case "Select the Blank":
                            qtIdStr = "9";
                            break;
                          case "Written Response":
                            qtIdStr = "7";
                            break;
                          case "Matrix":
                            qtIdStr = "8";
                            break;
                          default:
                            qtIdStr = "1"; // Multiple Choice
                            break;
                        }
                      }
                      const taxonomyName = sessionStorage.getItem('selectedTaxonomy') || q.taxonomy || '';
                      const loNameTop = q.LearningObjective || sessionStorage.getItem('learningObjectivesName') || '';

                      // Determine question type code for questionguid before creating the object
                      let questionTypeCode = 'MC'; // default for Multiple Choice
                      if (isMatrix) {
                        questionTypeCode = 'MM'; // Matrix
                      } else if (isFIBDropdown || selectedQuestionType === 'Select the Blank') {
                        questionTypeCode = 'FIBD'; // Fill In the Blank Dropdown
                      } else if (isFIB) {
                        questionTypeCode = 'FIB'; // Fill In the Blank
                      } else {
                        // Use selectedQuestionType to determine the correct code
                        switch (selectedQuestionType) {
                          case 'Multiple Response':
                            questionTypeCode = 'MR';
                            break;
                          case 'True False':
                            questionTypeCode = 'TF';
                            break;
                          case 'Fill In the Blank':
                            questionTypeCode = 'FIB';
                            break;
                          case 'Select the Blank':
                          case 'Fill In the Blank Dropdown':
                            questionTypeCode = 'FIBD';
                            break;
                          case 'Written Response':
                            questionTypeCode = 'WR';
                            break;
                          case 'Matrix':
                            questionTypeCode = 'MM';
                            break;
                          default:
                            questionTypeCode = 'MC'; // Multiple Choice
                            break;
                        }
                      }

                      // Base envelope fields (match required schema/types)
                      const safeJsonParseLocal = (value: any, fallback: any = null) => {
                        if (value == null) return fallback;
                        if (typeof value !== 'string') return value;
                        try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
                      };

                      const baseEnvelope = {
                        usercode,
                        orgcode,
                        custcode,
                        appcode,
                        booknameid,
                        noofquestions: selectedQty,
                        questiontypeid: qtIdStr,
                        taxonomyid,
                        // Top-level LO text
                        LearningObjective: loNameTop,
                        // Add CorrectAnswer at the top level for Written Response questions
                        CorrectAnswer: q.correctanswer || '',
                        questiondata: isMatrix ? {
                          BookName: q.BookName || 'Business and Technology (BT)',
                          CorrectAnswer: caNormalized,
                          EnablingObjective: q.EnablingObjective || '',
                          Feedbacks: q.Feedbacks || [],
                          ItemScoring: q.ItemScoring || { FullScore: q.MaxMarks || 3, PartialScore: 0, ScoringLogic: '' },
                          MaxMarks: sessionStorage.getItem('pointValue') || 1,
                          PartPrompt: q.PartPrompt || '',
                          QuestionStatement: q.label || q.QuestionStatement || dedupeStemText(q.label || '', q.PartPrompt),
                          TableAnalysis: safeJsonParseLocal(q.TableAnalysis, null) ?? safeJsonParseLocal(q.tableAnalysis, null),
                          tableAnalysis: safeJsonParseLocal(q.TableAnalysis, null) ?? safeJsonParseLocal(q.tableAnalysis, null),
                          Tabs: Array.isArray(q?.Tabs) ? q.Tabs : (Array.isArray(q?.tabs) ? q.tabs : null),
                          NumberOfPassages: q.NumberOfPassages || (Array.isArray(q?.Tabs) ? String(q.Tabs.length) : undefined),
                          columns: q.columns || [],
                          id: q.id || '',
                          label: dedupeStemText(q.label || '', q.PartPrompt),
                          rows: q.rows || [],
                          type: 'Matrix',
                          taxonomy: q.taxonomy || (sessionStorage.getItem('selectedTaxonomy') || 'Remember'),
                          slno: idx + 1,
                          instruction: q.instruction || '',
                          Rating: ratingId,
                          Rating_Feedback: ratingData.feedback,
                          Isdeleted: q.Isdeleted || 0,
                          ISFeedbackProvided: q.ISFeedbackProvided || false,
                          version: q.version || 1,
                          CreatedAt: q.CreatedAt || new Date().toISOString(),
                          creativitylevel: creativitylevelid,
                          creativitylevelname: creativitylevelname || 'Moderate',
                          answers: Array.isArray(q?.answers) ? q.answers : (Array.isArray(q?.CorrectAnswer) ? q.CorrectAnswer : []),
                          PreviousVersions: q.PreviousVersions || [],
                          RegenerateInstrcutions: q.RegenerateInstrcutions || [''],
                          Regeneratefeedback: q.Regeneratefeedback || [''],
                          generatedImageUrl,
                          generatedImages,
                          optionImages
                        } : {
                          BookName: q.BookName || (sessionStorage.getItem('bookTitle') || 'Book'),
                          CorrectAnswer: q.CorrectAnswer || q.correctanswer,
                          KeyPoints: q.KeyPoints || q.keyPoints || [],
                          source: source,
                          LearningObjective: loNameTop,
                          MaxMarks: sessionStorage.getItem('pointValue') || 1,
                          ReferenceInfo: q.ReferenceInfo || q.referenceinfo || '',
                          // Use canonical stem fields alongside legacy 'label' (de-duplicated)
                          label: dedupeStemText(q.label || q.question || q.Question || '', q.PartPrompt),
                          questionstem: dedupeStemText(q.label || q.question || q.Question || q.QuestionText || '', q.PartPrompt),
                          QuestionStem: dedupeStemText(q.label || q.question || q.Question || q.QuestionText || '', q.PartPrompt),
                          values: isFIBDropdown
                            ? (Array.isArray(q.DropdownOptions) && q.DropdownOptions.length
                              ? q.DropdownOptions
                              : (Array.isArray(q.dropdownoptions) ? q.dropdownoptions : [])
                            ).map((v: any) => (typeof v === 'string' ? v : (v?.text || v?.value || '')))
                            : (Array.isArray(q.values) ? q.values : (Array.isArray(q.options) ? q.options : [])).map((v: any) => (typeof v === 'string' ? v : (v?.text || v?.value || ''))),
                          // Include FIB-specific fields when present
                          PartPrompt: q.PartPrompt || '',
                          partPrompt: q.PartPrompt || '',
                          QuestionStatement: q.label || q.QuestionStatement || '',
                          questionstatement: q.label || q.QuestionStatement || '',
                          TableAnalysis: safeJsonParseLocal(q.TableAnalysis, null) ?? safeJsonParseLocal(q.tableAnalysis, null),
                          tableAnalysis: safeJsonParseLocal(q.TableAnalysis, null) ?? safeJsonParseLocal(q.tableAnalysis, null),
                          Tabs: Array.isArray(q?.Tabs) ? q.Tabs : (Array.isArray(q?.tabs) ? q.tabs : null),
                          NumberOfPassages: q.NumberOfPassages || (Array.isArray(q?.Tabs) ? String(q.Tabs.length) : undefined),
                          DropdownOptions: (Array.isArray(q.DropdownOptions) && q.DropdownOptions.length)
                            ? q.DropdownOptions
                            : (Array.isArray(q.dropdownoptions) ? q.dropdownoptions : []),
                          type: sessionStorage.getItem('selectedQuestionType'),
                          slno: idx + 1,
                          instruction: q.instruction || '',
                          checkvalues: q.checkvalues || Array((q.values || q.options || []).length).fill(true),
                          Rating: ratingId,
                          Rating_Feedback: ratingData.feedback,
                          Isdeleted: q.Isdeleted || 0,
                          ISFeedbackProvided: q.ISFeedbackProvided || false,
                          version: q.version || 1,
                          CreatedAt: q.CreatedAt || new Date().toISOString(),
                          FeedbackOptionA: q.FeedbackOptionA || q.FeedbackOption1 || '',
                          FeedbackOptionB: q.FeedbackOptionB || q.FeedbackOption2 || '',
                          FeedbackOptionC: q.FeedbackOptionC || q.FeedbackOption3 || '',
                          FeedbackOptionD: q.FeedbackOptionD || q.FeedbackOption4 || '',
                          FeedbackOptionE: q.FeedbackOptionE || q.FeedbackOption5 || '',
                          FeedbackOptionF: q.FeedbackOptionF || q.FeedbackOption6 || '',
                          FeedbackOptionG: q.FeedbackOptionG || q.FeedbackOption7 || '',
                          FeedbackOptionH: q.FeedbackOptionH || q.FeedbackOption8 || '',
                          FeedbackOptionI: q.FeedbackOptionI || q.FeedbackOption9 || '',
                          FeedbackOptionJ: q.FeedbackOptionJ || q.FeedbackOption10 || '',
                          taxonomy: taxonomyName,
                          marks: q.marks || undefined,
                          creativitylevel: String(creativitylevelid),
                          creativitylevelname: creativitylevelname || 'Moderate',
                          PreviousVersions: q.PreviousVersions || [],
                          RegenerateInstrcutions: q.RegenerateInstrcutions || [''],
                          Regeneratefeedback: q.Regeneratefeedback || [''],
                          generatedImageUrl,
                          generatedImages,
                          optionImages
                        },
                        AIquestiondata: {
                          ...q,
                          // generatedimagetype is a standalone SP parameter (par_generatedimagetype)
                          // and is sent once at the end of the envelope — strip the copy the
                          // spread pulls in so it is not duplicated inside the JSON blobs.
                          generatedimagetype: undefined,
                          generatedImageUrl,
                          generatedImages,
                          optionImages,
                          // De-duplicate the legacy stem fields carried over from the raw question
                          label: dedupeStemText((q as any).label || (q as any).question || (q as any).Question || '', (q as any).PartPrompt),
                          questionstem: dedupeStemText((q as any).questionstem || (q as any).label || (q as any).question || (q as any).Question || '', (q as any).PartPrompt),
                          QuestionStem: dedupeStemText((q as any).QuestionStem || (q as any).label || (q as any).question || (q as any).Question || '', (q as any).PartPrompt),
                          CorrectAnswer: q.AIquestiondata && q.AIquestiondata.correctanswer ? q.AIquestiondata.correctanswer : q.CorrectAnswer,
                          KeyPoints: q.KeyPoints || q.keyPoints || [],
                          creativitylevel: String(creativitylevelid),
                          instruction: "",
                          slno: idx + 1
                        },
                        difficultlevelid,
                        chaptercode,
                        locode: sessionStorage.getItem('selectedLO') || '',
                        sourcetype: source === 'Book Based' ? 1 : 2,
                        // Use IG_V2025 style; fall back to bookIdentifier if present
                        questionguid: `IG_V2025_${String(chaptercode || '0')}_${sessionStorage.getItem('selectedLO') || 'LO0'}_${questionTypeCode}_L${sessionStorage.getItem('taxonomyid')}_EN_ID`,
                        previousQuestionData: {
                          ...((q.PreviousVersions && q.PreviousVersions[0]) ? q.PreviousVersions[0] : (q as any)),
                          // Sent once at the end of the envelope, not inside the JSON blobs.
                          generatedimagetype: undefined,
                          generatedImageUrl,
                          generatedImages
                        },
                        creativitylevelid,
                        currentversion: String(q.version || '1'),
                        instructions: q.RegenerateInstrcutions || q.instruction ? [q.RegenerateInstrcutions || q.instruction] : [''],
                        maininstruction: "",
                        feedback: q.Regeneratefeedback ? [q.Regeneratefeedback] : [''],
                        duplicateguid: "",
                        kbid: sessionStorage.getItem('selectedKnowledgeBase') || '',
                        gid: sessionStorage.getItem('selectedGuidelineIdsFromGuidlines') || '',
                        generatedimagetype
                      };

                      return baseEnvelope;
                    });
                    // Backend expects an object; wrap array under 'questionsPayload'
                    // const payload = { questionsPayload };

                    const isSSO = sessionStorage.getItem("isSSO") === "true";
                    const selectedTypeGlobal = sessionStorage.getItem('selectedQuestionType') || '';
                    const kbid = sessionStorage.getItem("selectedKnowledgeBaseIdsCsv") || "";
                    let payload: any = { questionsPayload };
                    if (isSSO) {
                      const productguid = sessionStorage.getItem("programId");
                      const organizationguid = "00000000-0000-0000-0000-000000000000";
                      const repositoryguid = sessionStorage.getItem("repository_id");
                      const userguid = sessionStorage.getItem("userCode");
                      const kbidList = sessionStorage.getItem("selectedKnowledgeBaseIdsCsv") || "";
                      // Always send kbid as an array (even if only one value or empty)
                      const kbid = kbidList
                        ? kbidList
                          .split(',')
                          .map(x => {
                            const n = parseInt(x.trim(), 10);
                            return isNaN(n) ? null : n;
                          })
                          .filter(x => x !== null)
                        : [];
                      const items = results.map((q: any, idx: number) => {
                        const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
                        const correctRawGeneral = Array.isArray(q?.CorrectAnswer) ? q.CorrectAnswer : (q?.CorrectAnswer ?? q?.correctAnswers ?? q?.answer);
                        let choices: any[] = [];
                        let answers: any[] = [];

                        const isTF = q.values && q.values.length === 2;
                        // A generated Multiple Response question's own CorrectAnswer shape isn't a
                        // reliable signal on its own — it can arrive as a comma-separated string
                        // rather than an array, so the old `Array.isArray(...) && length > 1` check
                        // missed it and the item went out as a single-answer MCQ, dropping every
                        // correct answer but one. Every question in a batch shares the format
                        // chosen on the generator page (selectedTypeGlobal, the same value isFIB/
                        // isWR below already trust), so check that first — same authority, just
                        // applied here too — and keep isMultipleResponse (used elsewhere on this
                        // page for the same detection, via type label / ItemScoring.Marking / a
                        // marks map) as a fallback for a mixed-type or regenerated batch.
                        const isMR = selectedTypeGlobal === 'Multiple Response' || isMultipleResponse(q);
                        const isMC = q.values && q.values.length > 0 && !isTF && !isMR;
                        const isFIB = selectedTypeGlobal === 'Fill In the Blank';
                        const isWR = selectedTypeGlobal === 'Written Response';
                        // This question's configured marks, split evenly across however many
                        // choices end up correct below — so a 4-mark question with 2 correct
                        // answers gives each one score: 2 (they used to always get a flat 1,
                        // regardless of Marks/Point Value).
                        const itemMarks = Number(q.maxmarks || q.MaxMarks || sessionStorage.getItem('pointValue') || '1') || 1;

                        if (isTF) {
                          const rawVals = Array.isArray(q.values) ? q.values : [];
                          const t0 = rawVals[0] ? String(rawVals[0]).replace(/^[A-J]\.\s*/, '') : 'True';
                          const t1 = rawVals[1] ? String(rawVals[1]).replace(/^[A-J]\.\s*/, '') : 'False';
                          choices = [
                            { choiceid: 1, choiceguid: '00000000-0000-0000-0000-000000000000', choicetext: t0, choicefeedbacktext: (q as any).FeedbackOptionA || '' },
                            { choiceid: 2, choiceguid: '00000000-0000-0000-0000-000000000000', choicetext: t1, choicefeedbacktext: (q as any).FeedbackOptionB || '' },
                          ];
                          let idxTF = -1;
                          if (typeof correctRawGeneral === 'string') {
                            const s = correctRawGeneral.trim();
                            if (/^true$/i.test(s) || s.toUpperCase() === 'A' || s === '1' || s === t0) idxTF = 0;
                            else if (/^false$/i.test(s) || s.toUpperCase() === 'B' || s === '2' || s === t1) idxTF = 1;
                          } else if (Array.isArray(correctRawGeneral) && correctRawGeneral.length) {
                            const s = String(correctRawGeneral[0]).trim();
                            if (/^true$/i.test(s) || s.toUpperCase() === 'A' || s === '1' || s === t0) idxTF = 0;
                            else if (/^false$/i.test(s) || s.toUpperCase() === 'B' || s === '2' || s === t1) idxTF = 1;
                          } else if (typeof correctRawGeneral === 'number') {
                            idxTF = correctRawGeneral === 1 ? 0 : correctRawGeneral === 2 ? 1 : -1;
                          }
                          if (idxTF < 0) idxTF = 0;
                          answers = [
                            { choiceid: 1, score: idxTF === 0 ? itemMarks : 0, iscorrect: idxTF === 0 },
                            { choiceid: 2, score: idxTF === 1 ? itemMarks : 0, iscorrect: idxTF === 1 },
                          ];
                        } else {
                          const options = (Array.isArray(q.values) ? q.values : (Array.isArray(q.options) ? q.options : [])).map((v: any) => (typeof v === 'string' ? v : (v?.text || v?.value || '')));
                          const correctRaw = Array.isArray(q?.CorrectAnswer) ? String(q.CorrectAnswer[0] || '') : String(q?.CorrectAnswer || q?.correctAnswer || q?.answer || '');
                          let correctIndex = -1;
                          const letterIndex = letters.indexOf(String(correctRaw).toUpperCase());
                          if (letterIndex >= 0) {
                            correctIndex = letterIndex;
                          } else {
                            const normalizedOptions = options.map(o => String(o).trim());
                            const idxByText = normalizedOptions.findIndex(o => o === String(correctRaw).trim());
                            correctIndex = idxByText >= 0 ? idxByText : 1;
                          }
                          choices = options.map((text: string, i: number) => {
                            const letter = String.fromCharCode(65 + i);
                            const feedbackKey = `FeedbackOption${letter}`;
                            const feedbackText = (q as any)[feedbackKey] || '';
                            return {
                              choiceid: i + 1,
                              choiceguid: '00000000-0000-0000-0000-000000000000',
                              choiceorder: i + 1,
                              choicetext: String(text).replace(/^[A-Za-z][\.)]?\s*/, ''),
                              choicefeedbacktext: feedbackText
                            };
                          });
                          if (isMC) {
                            answers = choices.map((c: any, i: number) => ({
                              choiceid: c.choiceid,
                              score: i === correctIndex ? itemMarks : 0,
                              iscorrect: i === correctIndex,
                            }));
                          } else {
                            const raw = q?.CorrectAnswer ?? q?.correctAnswers ?? q?.answer;
                            let correctSet = new Set<number>();
                            if (Array.isArray(raw)) {
                              raw.forEach((r: any) => {
                                const s = String(r).trim();
                                const li = letters.indexOf(s.toUpperCase());
                                if (li >= 0) correctSet.add(li);
                                else {
                                  const idxByText = options.map(o => String(o).trim()).findIndex(o => o === s);
                                  if (idxByText >= 0) correctSet.add(idxByText);
                                  else {
                                    const n = Number(s);
                                    if (Number.isFinite(n) && n >= 1 && n <= options.length) correctSet.add(n - 1);
                                  }
                                }
                              });
                            } else if (typeof raw === 'string') {
                              const parts = String(raw).split(/[,\|;/\s]+/).filter(Boolean);
                              parts.forEach(p => {
                                const s = String(p).trim();
                                const li = letters.indexOf(s.toUpperCase());
                                if (li >= 0) correctSet.add(li);
                                else {
                                  const idxByText = options.map(o => String(o).trim()).findIndex(o => o === s);
                                  if (idxByText >= 0) correctSet.add(idxByText);
                                  else {
                                    const n = Number(s);
                                    if (Number.isFinite(n) && n >= 1 && n <= options.length) correctSet.add(n - 1);
                                  }
                                }
                              });
                            }
                            if (correctSet.size === 0 && correctIndex >= 0) correctSet.add(correctIndex);
                            // Split this item's marks across every correct choice as whole numbers,
                            // never a fraction. When it doesn't divide evenly (e.g. 4 marks over 3
                            // correct choices), the leftover mark(s) go one each to the first
                            // correct choices in order: 4/3 -> 2, 1, 1 (not 1.33 each).
                            const correctIndices = Array.from(correctSet);
                            const correctCount = correctIndices.length;
                            const baseScore = correctCount > 0 ? Math.floor(itemMarks / correctCount) : 0;
                            const remainder = correctCount > 0 ? Math.round(itemMarks - baseScore * correctCount) : 0;
                            const scoreByChoiceIndex = new Map<number, number>();
                            correctIndices.forEach((choiceIdx, pos) => {
                              scoreByChoiceIndex.set(choiceIdx, baseScore + (pos < remainder ? 1 : 0));
                            });
                            answers = choices.map((c: any, i: number) => ({
                              choiceid: c.choiceid,
                              score: scoreByChoiceIndex.get(i) ?? 0,
                              iscorrect: correctSet.has(i),
                            }));
                          }
                        }
                        // q.label holds the complete generated stem (what the card on screen
                        // actually renders — see getCleanStem/dedupeStemText usage everywhere
                        // else in this file). q.QuestionStatement was tried first here, but for
                        // an MCQ it's often only the leading context sentence, not the full
                        // question — putting it before q.label silently truncated questiontext
                        // to that first sentence and dropped the actual question.
                        const questionText = dedupeStemText(q.label || q.QuestionStatement || q.QuestionStem || q.questionstem || q.Question || q.question || '', q.PartPrompt || q.raw?.PartPrompt);
                        const creativityRaw =
                          (q as any).creativitylevelid ??
                          (q as any).creativitylevel ??
                          (q?.AIquestiondata?.creativitylevel) ??
                          sessionStorage.getItem('creativitylevelid') ??
                          sessionStorage.getItem('selectedCreativityLevel');
                        const levelRaw = (q as any).difficultylevelid ?? (q as any).difficultyLevelId ?? null;
                        let questionlevelid = Number(creativityRaw);
                        if (!Number.isFinite(questionlevelid) || questionlevelid <= 0) {
                          const nameKey = String(creativityRaw || '').toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
                          questionlevelid =
                            nameKey === 'moderate' ? 1 :
                              nameKey === 'high' ? 2 :
                                nameKey === 'veryhigh' ? 3 : 0;
                        }
                        if (!Number.isFinite(questionlevelid) || questionlevelid <= 0) {
                          questionlevelid = Number(
                            (levelRaw !== null && levelRaw !== undefined && String(levelRaw) !== '')
                              ? levelRaw
                              : (sessionStorage.getItem('difficultlevelid') ?? '')
                          ) || 0;
                        }
                        const classification = String(sessionStorage.getItem('selectedTaxonomy') || (q as any).taxonomy || '');
                        const itemBase: any = {
                          questionguid: '00000000-0000-0000-0000-000000000000',
                          questioncode: `Test-001-Item-TYU123-${isWR ? 'WR' :
                            isFIB ? 'FIB' :
                              isMR ? 'MRQ' :
                                isTF ? 'TF' : 'MCQ'
                            }-${idx + 1}`,
                          questiontext: `<p>${String(questionText)}</p>`,
                          questiontype: isWR ? 'WR' :
                            isFIB ? 'FIB' :
                              isMR ? 'MRQ' :
                                (isTF ? 'TF' : 'MCQ'),
                          questionlevelid,
                          answeringtime: 0,
                          classification,
                          language: 'English',
                          metadata: [],
                          feedback: {
                            isquestionfeedback: false,
                            ischoicefeedback: isWR || isFIB ? false : true
                          },
                          data: isWR
                            ? {
                              correctanswer: q.correctanswer || q.CorrectAnswer || '',
                              keypoints: q.KeyPoints || q.keyPoints || [],
                              feedback: q.FeedbackOptionA || '',
                              partprompt: q.PartPrompt || '',
                              maxmarks: q.maxmarks || q.MaxMarks || sessionStorage.getItem('pointValue') || '1'
                            }
                            : isFIB
                              ? {
                                correctanswer: Array.isArray(q.CorrectAnswer) ? q.CorrectAnswer : [q.CorrectAnswer || q.correctanswer || ''],
                                feedback: q.FeedbackOptionA || '',
                                partprompt: q.PartPrompt || ''
                              }
                              : isMR
                                ? {
                                  maxchoices: (() => {
                                    const n = Number(sessionStorage.getItem('numberOfCorrectOptions'));
                                    if (Number.isFinite(n) && n > 0) return n;
                                    const count = answers.filter(a => a.iscorrect).length;
                                    return count > 0 ? count : 1;
                                  })(),
                                  minchoices: (() => {
                                    const m = Number(sessionStorage.getItem('minchoices'));
                                    if (Number.isFinite(m) && m >= 0) return m;
                                    return 1;
                                  })(),
                                  choices,
                                  preferences: { ishorizontalalignment: true, shuffle: true },
                                }
                                : isTF
                                  ? {
                                    choices,
                                    preferences: { ishorizontalalignment: true, shuffle: true },
                                  }
                                  : {
                                    choices,
                                    preferences: { ishorizontalalignment: true, shuffle: true },
                                  },
                          answers: isWR || isFIB ? [] : answers,
                          hints: { hint1: '', hint2: '', hint3: '' },
                          passageid: null,
                        };
                        return itemBase;
                      });
                      payload = { productguid, organizationguid, repositoryguid, userguid, kbid, items };
                    }

                    // Debug: Log payload for troubleshooting (toggleable by session flag)
                    try {
                      const debugSave = sessionStorage.getItem('AIG_DEBUG_SAVE_ALL');
                      if (debugSave === '1' || debugSave === 'true') {
                        console.debug('[SaveAll] Payload preview:', payload);
                      }
                    } catch { }
                    let res: Response;
                    if (isSSO) {
                      const IntegrationConfigId = sessionStorage.getItem('IntegrationConfigId') || 'excelassess-dev';
                      res = await fetch(API_ENDPOINTS.IMPORT_ITEMS, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "X-Client-Id": IntegrationConfigId,
                          "x-custcode": custcode,
                          "x-orgcode": orgcode
                        },
                        body: JSON.stringify(payload),
                      });
                      if (res.ok) {
                        const result = await res.json();
                        if (result.status === "failed") {
                          // Handle API-level failure even when HTTP 200
                          setSaveAllDialogType("error");
                          setSaveAllDialogMessage(result.external_response || "Save operation failed. Please try again.");
                          setShowSaveAllDialog(true);
                          return;
                        }
                        else if (result.status === "success") {
                          setSaveAllDialogType("success");
                          setSaveAllDialogMessage(result.external_response || "Data saved successfully!");
                          setShowSaveAllDialog(true);
                        }
                      }
                    } else {
                      const kbid = sessionStorage.getItem("selectedKnowledgeBaseIdsCsv") || "";
                      res = await fetch(`${AIG_QUIZ_GEN_URL}/insert_to_db`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify(payload), // only questionsPayload with kbid inside each object
                      });
                      // Common error handling for HTTP failures
                      if (!res.ok) {
                        let errText = '';
                        try { errText = await res.text(); } catch { }
                        try {
                          const debugSave = sessionStorage.getItem('AIG_DEBUG_SAVE_ALL');
                          if (debugSave === '1' || debugSave === 'true') {
                            console.error('[SaveAll] HTTP request failed', { status: res.status, statusText: res.statusText, body: errText });
                          }
                        } catch { }
                        setSaveAllDialogType("error");
                        setSaveAllDialogMessage(`Save operation failed (${res.status}). Please check your connection and try again.`);
                        setShowSaveAllDialog(true);
                        return;
                      }

                      // results already validated above
                      // ...
                      if (res.ok) {
                        const result = await res.json();
                        if (!isSSO) {
                          setHasUnsavedChanges(false);
                          setIsAlreadySavedToRepository(true);
                          setHasSavedAll(true);
                          setHasInsertedToDB(true);
                          setSaveAllDialogType("success");
                          setSaveAllDialogMessage(result.message || 'Questions inserted successfully');
                          setShowSaveAllDialog(true);
                        }
                      } else {
                        let errText = '';
                        try { errText = await res.text(); } catch { }
                        try {
                          const debugSave = sessionStorage.getItem('AIG_DEBUG_SAVE_ALL');
                          if (debugSave === '1' || debugSave === 'true') {
                            console.error('[SaveAll] Save failed', { status: res.status, statusText: res.statusText, body: errText });
                          }
                        } catch { }
                        setSaveAllDialogType("error");
                        setSaveAllDialogMessage(`Failed to save questions (HTTP ${res.status}): ${errText || res.statusText || 'Unknown error'}`);
                        setShowSaveAllDialog(true);
                      }
                    }

                  } catch (e) {
                    //window.alert('Failed to save all questions.');
                    setSaveAllDialogType("error");
                    try {
                      const debugSave = sessionStorage.getItem('AIG_DEBUG_SAVE_ALL');
                      if (debugSave === '1' || debugSave === 'true') {
                        console.error('[SaveAll] Exception', e);
                      }
                    } catch { }
                    setSaveAllDialogMessage('Failed to save all questions.');
                    setShowSaveAllDialog(true);
                  } finally {
                    // Runs for every exit path above, including the early
                    // returns on "no questions" and HTTP failure.
                    if (ssoSaveMode) {
                      saveAllInFlight.current = false;
                      setIsSavingAll(false);
                    }
                  }
                }}>
                {isSavingAll ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-green-800 border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : 'Save All'}
              </Button>
              {!isSSO && (
                <Button
                  type="button"
                  className="relative z-10 bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300"
                  onClick={async () => {
                    // Export all questions to Word
                    try {
                      // Prefer in-memory generated results if present
                      let results: any = Array.isArray(genResults) && genResults.length ? genResults : undefined;
                      if (!results) {
                        const raw = sessionStorage.getItem("questionGenResults");
                        const data = JSON.parse(raw || "null");
                        // Try all common array locations
                        if (Array.isArray(data)) {
                          results = data;
                        } else if (data && Array.isArray(data?.data)) {
                          results = data.data;
                        } else if (data && Array.isArray(data?.questions)) {
                          results = data.questions;
                        } else if (data && Array.isArray(data?.result)) {
                          results = data.result;
                        } else if (data && Array.isArray(data?.results)) {
                          // agentic workflow: unwrap nested results
                          const extracted: any[] = [];
                          const extractDeep = (node: any, depth = 0) => {
                            if (!node || depth > 3) return;
                            if (Array.isArray(node)) {
                              node.forEach(n => extractDeep(n, depth + 1));
                              return;
                            }
                            if (typeof node === 'object') {
                              if (
                                node.label ||
                                node.Question ||
                                node.text ||
                                node.QuestionText ||
                                Array.isArray(node.values)
                              ) {
                                extracted.push(node);
                              }
                              Object.values(node).forEach(v => extractDeep(v, depth + 1));
                            }
                          };
                          try { data.results.forEach((r: any) => extractDeep(r?.data)); } catch { }
                          results = extracted;
                        } else if (data && typeof data === 'object') {
                          // array-like object with numeric keys
                          const keys = Object.keys(data);
                          if (keys.length > 1 && keys.every(k => !isNaN(Number(k)))) {
                            const arrLike = keys.map(k => (data as any)[k]);
                            if (arrLike.every((q: any) => typeof q === 'object' && (q.label || q.Question || q.text))) {
                              results = arrLike;
                            }
                          } else if (data?.label || data?.Question || data?.text) {
                            results = [data];
                          }
                        }
                      }
                      // Normalize shape
                      if (!Array.isArray(results)) results = [];
                      if (results.length === 1 && Array.isArray(results[0])) results = results[0];
                      if (!Array.isArray(results) && results && typeof results === 'object') results = [results];
                      results = filterGeneratedQuestionSet(results.filter(Boolean));
                      if (!results.length) {
                        window.alert('No questions to export.');
                        return;
                      }
                      // For matrix items, skip those without a valid table during rendering; include others.
                      // Get book title from localStorage, fallback to 'questions'
                      let bookTitle = sessionStorage.getItem('bookTitle') || 'questions';
                      // Clean filename: remove illegal characters
                      bookTitle = bookTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
                      // Dynamically import docx and build document in the requested format
                      const docx = await import('docx');
                      const { Document, Packer, Table, TableRow, TableCell, TextRun, ImageRun } = docx;
                      const DocxParagraph = docx.Paragraph;
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

                      // Load every attached image up front — the render loop below is
                      // synchronous. Manually added images are blob URLs rather than
                      // data URIs, and used to be written as a bare URL instead of
                      // being embedded in the document.
                      const questionImageSources = (results as any[]).flatMap((q: any) => {
                        const list = Array.isArray(q?.generatedImages) && q.generatedImages.length
                          ? q.generatedImages
                          : [resolveQuestionImageUrl(q, questionImages)];
                        return list.map((s: any) => String(s || '').trim()).filter(Boolean);
                      });
                      const loadedImages = new Map<string, any>();
                      for (const src of Array.from(new Set(questionImageSources))) {
                        const img = await loadExportImage(src);
                        if (img) loadedImages.set(src, img);
                      }

                      const docChildren = [] as any[];
                      let hasMCQ = false;
                      let hasMRQ = false;
                      let hasWR = false;
                      let hasTF = false;
                      let hasFIB = false;
                      let hasMM = false;
                      let fileType = 'Questions';
                      results.forEach((q, idx) => {
                        // Resolve fields
                        const cleanStemText = formatQuestionTextForDisplay(getCleanStem(q));
                        const questionText = cleanStemText;
                        const isMatrix = q?.type === 'matrix' || (Array.isArray(q?.rows) && Array.isArray(q?.columns));
                        let options: string[] = [];
                        if (Array.isArray(q.values)) {
                          options = q.values.map((v: any) => (typeof v === 'string' ? v : (v?.text || v?.value || '')));
                        } else if (Array.isArray(q.options)) {
                          options = q.options.map((v: any) => (typeof v === 'string' ? v : (v?.text || v?.value || '')));
                        }
                        options = options.map((o: string) => String(o).replace(/^[A-Ja-j][\.)]\s*/, '').trim());
                        // Determine type
                        const isFIBDropdown = isFillBlankDropdownQuestion(q);
                        const isFIB = isFillBlankQuestion(q) && !isFIBDropdown;
                        const isMC = !isMatrix && !isFIB && !isFIBDropdown && options && options.length > 0;
                        const isMR = isMultipleResponse(q);
                        const isTF = isTrueFalseQuestion(q);
                        const typeLabel = isMatrix
                          ? 'Matrix'
                          : (isFIBDropdown
                            ? 'Select the Blank'
                            : (isFIB
                              ? 'Fill In the Blank'
                              : (isMC ? (isMR ? 'Multiple Response' : 'Multiple Choice') : 'Written Response')));
                        // SET fileType BASED ON THE FIRST QUESTION ONLY
                        if (idx === 0) {
                          fileType = isMatrix
                            ? 'MM'
                            : (isFIBDropdown ? 'STB' : (isFIB
                              ? 'FIB'
                              : isTF
                                ? 'TF'
                                : (isMC && isMR)
                                  ? 'MRQ'
                                  : isMC
                                    ? 'MCQ'
                                    : 'WR'));
                        }
                        const taxonomyid = q.taxonomy == "Remember" ? 1 : q.taxonomy == "Understand" ? 2 : q.taxonomy == "Apply" ? 3 : q.taxonomy == "Analyze" ? 4 : q.taxonomy == "Evaluate" ? 5 : q.taxonomy == "Create" ? 6 : 0;
                        const bookIdentifier = sessionStorage.getItem('bookIdentifier') || 'IG_V2025';
                        const identifier = `${bookIdentifier}_${(sessionStorage.getItem('chaptercode') || '0').padStart(2, '0')}_${sessionStorage.getItem('selectedLO')}_${isMatrix ? 'MM' : (isFIBDropdown ? 'STB' : (isFIB ? 'FIB' : (isMC ? 'MC' : 'WR')))}_L${taxonomyid}_EN_ID${idx + 1}`;
                        const creativity = (q.CreativityLevel || q.creativity || sessionStorage.getItem('selectedCreativityLevel') || 'Moderate').toString();

                        // Determine correct indexes (supports MR arrays and single string)
                        let answersArray: string[];
                        let correctIndexes: number[] = [];
                        if (Array.isArray(q.CorrectAnswer)) {
                          answersArray = q.CorrectAnswer.map(a => String(a ?? ''));
                        } else if (Array.isArray((q as any).correctanswer)) {
                          answersArray = (q as any).correctanswer.map((a: any) => String(a ?? ''));
                        } else if (typeof (q as any).correctanswer === 'string') {
                          answersArray = (q as any).correctanswer
                            .split(',')
                            .map(s => s.trim())
                            .filter(Boolean);
                        } else {
                          const single = (q.CorrectAnswer || q.answer || '').toString();
                          answersArray = single ? [single] : [];
                        }
                        const normalizedOptions = options.map((o: string) => o.replace(/^[A-Ja-j][\.)]?\s*/, '').trim().toLowerCase());
                        if (!isMatrix) {
                          answersArray.forEach((ans) => {
                            const caRaw = String(ans || '');
                            const letterMatch = caRaw.trim().match(/^([A-Ja-j])\b/);
                            if (letterMatch) {
                              const letter = letterMatch[1].toUpperCase();
                              const idx = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(letter);
                              if (idx >= 0) correctIndexes.push(idx);
                            } else if (caRaw) {
                              const normalizedCA = caRaw.replace(/^[A-Ja-j][\.)]?\s*/, '').trim().toLowerCase();
                              const idx = normalizedOptions.findIndex(o => o === normalizedCA);
                              if (idx >= 0) correctIndexes.push(idx);
                            }
                          });
                          // Deduplicate
                          correctIndexes = Array.from(new Set(correctIndexes)).filter(i => i >= 0 && i < options.length);
                        }

                        // Feedback mapping (A–J or 1–10)
                        const fbs: string[] = (() => {
                          const out: string[] = [];
                          const letters = 'ABCDEFGHIJ';
                          for (let i = 0; i < Math.max(options.length, 10); i++) {
                            const L = letters[i] || '';
                            const fb = (q[`FeedbackOption${i + 1}`] || q[`feedback${i + 1}`] || q[`FeedbackOption${L}`] || q[`feedback${L}`] || '').toString();
                            out.push(fb);
                          }
                          return out;
                        })();

                        // Passages and Table Analysis support
                        const passageTabs = getQuestionTabs(q);
                        if (passageTabs.length > 0) {
                          passageTabs.forEach((tab: any, tIdx: number) => {
                            const tTitle = getTabTitle(tab, tIdx);
                            const tPassage = formatQuestionTextForDisplay(getTabPassage(tab));
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
                              children: tableData.Columns.map((col: any) => centeredCell(formatQuestionTextForDisplay(String(col))))
                            });
                            const dataRows = tableData.Rows.map((r: any[]) => new DocxTableRow({
                              children: r.map((c: any) => centeredCell(formatQuestionTextForDisplay(String(c))))
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

                        // Build paragraphs for this question
                        docChildren.push(new Paragraph(`Type: ${typeLabel}`));
                        docChildren.push(new Paragraph(`Title: ${identifier}`));
                        const maxScore = sessionStorage.getItem('pointValue');
                        docChildren.push(new Paragraph(`Marks: ${maxScore}`));
                        const questionLines = questionText.split('\n').filter((line: string) => line.trim().length > 0);
                        if (questionLines.length > 0) {
                          docChildren.push(new Paragraph(`${idx + 1}. ${questionLines[0]}`));
                          questionLines.slice(1).forEach((line: string) => docChildren.push(new Paragraph(line)));
                        } else {
                          docChildren.push(new Paragraph(`${idx + 1}.`));
                        }

                        if (isMatrix) {
                          let rows: any[] = Array.isArray(q.rows) ? q.rows : [];
                          let cols: any[] = Array.isArray(q.columns) ? q.columns : [];
                          // Filter out hidden or empty rows/columns
                          const isVisible = (node: any) => {
                            const hidden = Boolean(node?.hidden || node?.isHidden);
                            const explicitlyInvisible = node?.visible === false;
                            const label = String(node?.text ?? node?.value ?? '').trim();
                            return !hidden && !explicitlyInvisible && label.length > 0;
                          };
                          rows = rows.filter(isVisible);
                          cols = cols.filter(isVisible);
                          if (!(rows.length > 0 && cols.length > 0)) {
                            // Skip this matrix item if no valid table
                            return;
                          }
                          const matrixAnswers: any[] = Array.isArray(q.answers) ? q.answers : (Array.isArray(q.CorrectAnswer) ? q.CorrectAnswer : []);
                          const instruction = q.instruction || q.PartPrompt || '';
                          if (instruction) {
                            docChildren.push(new Paragraph(`Instruction: ${instruction}`));
                          }
                          const headerRow = new TableRow({
                            children: [
                              new TableCell({ children: [new Paragraph('')] }),
                              ...cols.map((c: any) => new TableCell({ children: [new Paragraph(String(c?.text ?? c?.value ?? ''))] }))
                            ]
                          });
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
                              return new TableCell({ children: [new Paragraph(checked ? '✔' : '')] });
                            });
                            return new TableRow({ children: [new TableCell({ children: [new Paragraph(rowLabel)] }), ...cells] });
                          });
                          docChildren.push(new Table({
                            rows: [headerRow, ...tableRows],
                            // Full-width fixed layout with visible borders — the
                            // default auto layout produced misaligned columns in Word.
                            width: { size: 100, type: 'pct' },
                            layout: 'fixed',
                            borders: DOCX_TABLE_BORDERS
                          }));
                          //Append Correct Answers mapping section
                          try {
                            const mappingLines: string[] = rows.map((r: any, ri: number) => {
                              const rowLabel = String(r?.text ?? r?.value ?? '').trim();
                              let selectedCol = -1;
                              const ans = matrixAnswers[ri];
                              if (typeof ans === 'number') {
                                selectedCol = ans;
                              } else if (typeof ans === 'string') {
                                const idx = cols.findIndex((c: any) => String(c?.text ?? c?.value ?? '').trim().toLowerCase() === ans.trim().toLowerCase());
                                selectedCol = idx;
                              } else if (ans && typeof ans === 'object') {
                                const aCi = Number(ans.colIndex ?? ans.columnIndex ?? ans.ci);
                                const aRi = Number(ans.rowIndex ?? ans.ri);
                                if (!Number.isNaN(aCi) && !Number.isNaN(aRi) && aRi === ri) selectedCol = aCi;
                              }
                              const colLabel = selectedCol >= 0 && cols[selectedCol]
                                ? String(cols[selectedCol]?.text ?? cols[selectedCol]?.value ?? '').trim()
                                : '';
                              return colLabel ? `${rowLabel}. => ${colLabel}` : `${rowLabel}.`;
                            });
                            if (mappingLines.some(l => l && l.trim().length)) {
                              docChildren.push(new Paragraph('Correct Answers:'));
                              mappingLines.forEach(line => docChildren.push(new Paragraph(line)));
                            }
                          } catch { }
                          // Append Feedbacks if any
                          try {
                            const fbsArr: string[] = Array.isArray((q as any).Feedbacks)
                              ? (q as any).Feedbacks
                              : (Array.isArray((q as any).feedbacks) ? (q as any).feedbacks : []);
                            const clean = fbsArr.map(f => String(f || '').trim()).filter(Boolean);
                            if (clean.length) {
                              docChildren.push(new Paragraph('Feedbacks:'));
                              clean.forEach(f => docChildren.push(new Paragraph(`• ${f}`)));
                            }
                          } catch { }
                        } else if (isMC) {
                          options.forEach((opt, i) => {
                            const letter = String.fromCharCode(97 + i); // a, b, c, d, e...
                            const isCorrect = correctIndexes.includes(i);
                            // const marksText = `[Marks: ${isCorrect ? 1 : 0}]`;
                            const optLine = `${isCorrect ? '*' : ''}${letter}) ${opt} `;
                            docChildren.push(new Paragraph(optLine));
                            const fbText = (fbs[i] || '').toString().trim();
                            if (fbText) {
                              const explain = isCorrect
                                ? `~ ${fbText}`
                                : `@ ${fbText}`;
                              docChildren.push(new Paragraph(explain));
                            }
                          });
                          // Add explicit Correct Answer(s) line for clarity
                          // if (correctIndexes.length) {
                          //   const parts = correctIndexes
                          //     .sort((a,b)=>a-b)
                          //     .map(i => {
                          //       const L = String.fromCharCode(65 + i);
                          //       const core = options[i];
                          //       return `${L}. ${core}`;
                          //     });
                          //   docChildren.push(new Paragraph(`Correct Answer(s): ${parts.join(', ')}`));
                          // }
                        } else if (isFIB) {
                          // Fill in the Blank: include Correct Answer and Feedback (no Key Points)
                          const ans = (answersArray.join('; ') || '').trim();
                          if (ans) {
                            docChildren.push(new Paragraph(`Correct Answer: ${ans}`));
                          }
                          // Add feedback for Fill in the Blank questions
                          try {
                            const fbKeys = Object.keys(q || {}).filter(k => /^FeedbackOption[A-J1-9]/.test(k) && q[k]);
                            if (fbKeys.length > 0) {
                              docChildren.push(new Paragraph('Feedback:'));
                              fbKeys.forEach((k, i) => {
                                const text = String(q[k] || '').replace(/^\s*Option\s*[A-J1-9]:\s*/i, '').trim();
                                if (text) {
                                  docChildren.push(new Paragraph(`• ${text}`));
                                }
                              });
                            }
                          } catch { }
                        } else {
                          // Written response: include Correct Answer and Key Points
                          const ans = (answersArray.join('; ') || '').trim();
                          if (ans) {
                            docChildren.push(new Paragraph(`Correct Answer: ${ans}`));
                          }
                          const keyPoints: string[] = Array.isArray((q as any).KeyPoints)
                            ? (q as any).KeyPoints
                            : (Array.isArray((q as any).keyPoints) ? (q as any).keyPoints : []);
                          if (keyPoints.length) {
                            docChildren.push(new Paragraph('Key Points:'));
                            keyPoints.forEach((kp: string, i: number) => {
                              const line = `${String(kp || '').trim()}`;
                              docChildren.push(new Paragraph(line));
                            });
                          }
                        }

                        const source = sessionStorage.getItem('selectedGenerationMode') || '';
                        const bookName = sessionStorage.getItem('bookTitle') || '';
                        const study = sessionStorage.getItem('selectedChapterName') || '';
                        const loName = sessionStorage.getItem('learningObjectivesName') || '';
                        const rating = (q.Rating ?? 'N/A').toString();
                        const ratingFeedback = (q.Rating_Feedback ?? 'N/A').toString();
                        const generatedImageUrl = resolveQuestionImageUrl(q, questionImages);
                        //if (!isMatrix) {
                        docChildren.push(new Paragraph(`Source: ${source || 'Book Based'}`));
                        docChildren.push(new Paragraph(`Book Name: ${bookName || ''}`));
                        docChildren.push(new Paragraph(`Study: ${study || ''}`));
                        docChildren.push(new Paragraph(`LOs: ${loName || ''}`));
                        docChildren.push(new Paragraph(`Taxonomy: ${sessionStorage.getItem('selectedTaxonomy') || ''}`));
                        docChildren.push(new Paragraph(`Creativity Level: ${creativity}`));
                        // Embed every attached image, whether AI generated (data URI)
                        // or manually added (blob URL).
                        const questionImageList: string[] = Array.isArray((q as any)?.generatedImages) && (q as any).generatedImages.length
                          ? (q as any).generatedImages.map((s: any) => String(s || '').trim()).filter(Boolean)
                          : (generatedImageUrl ? [generatedImageUrl] : []);
                        questionImageList.forEach((src: string) => {
                          const embedded = loadedImages.get(src);
                          if (embedded) {
                            // Scale to fit the box while keeping the picture's own
                            // proportions — a fixed box stretched anything that was
                            // not exactly that shape.
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
                            // The bytes could not be read (the blob container sends no
                            // CORS header). Emit a short clickable link rather than a
                            // wall of raw URL text.
                            docChildren.push(new DocxParagraph({
                              children: [
                                new TextRun('Generated Image: '),
                                new docx.ExternalHyperlink({
                                  link: src,
                                  children: [new TextRun({ text: 'View image', style: 'Hyperlink' })],
                                }),
                              ],
                            }));
                          }
                        });
                        // docChildren.push(new Paragraph(`Rating: ${rating}`));
                        // docChildren.push(new Paragraph(`Rating Feedback: ${ratingFeedback}`));
                        docChildren.push(new Paragraph(''));
                        //}
                      });

                      const doc = new Document({
                        sections: [
                          {
                            properties: {},
                            children: docChildren
                          }
                        ]
                      });
                      const { format } = await import('date-fns');
                      const blob = await Packer.toBlob(doc);
                      const now = new Date();
                      const formattedDateTime = format(now, 'yyyy-MM-dd');
                      try {
                        // Prefer file-saver to ensure download across browsers
                        saveAs(blob, `${bookTitle}_${fileType}_${formattedDateTime}.docx`);
                      } catch {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${bookTitle}_${fileType}.docx`;
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                          document.body.removeChild(a);
                          window.URL.revokeObjectURL(url);
                        }, 100);
                      }
                    } catch (e) {
                      window.alert('Failed to export to Word.');
                    }
                  }}>
                  Export to Word
                </Button>
              )}
              {!isSSO && (
                <Button
                  type="button"
                  className="relative z-10 bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300"
                  onClick={handleExportToExcel}
                >
                  Export to Excel
                </Button>
              )}
            </div>
          </div>
          {/* Enable Text-to-Speech (Speaker) Settings Panel — only rendered when showTextToSpeech === 1 and not SSO */}
          {showTextToSpeech === 1 && !isSSO && (
            <div className="mb-4 p-4 bg-purple-50 border border-purple-100 rounded-lg">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-purple-900 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-purple-700" />
                    Enable Text-to-Speech (Speaker)
                  </p>
                  <p className="text-xs text-purple-700 mt-1">
                    Enable this to show the Speak button on generated questions and repository.
                  </p>
                </div>
                <Switch
                  checked={isSpeechEnabled}
                  onCheckedChange={(checked) => {
                    const val = Boolean(checked);
                    setIsSpeechEnabled(val);
                    try {
                      sessionStorage.setItem('isSpeechEnabled', String(val));
                      localStorage.setItem('isSpeechEnabled', String(val));
                    } catch { }
                  }}
                />
              </div>

              {/* Expandable Speech Options (Speed, Gender & Accent) when Toggle is ON */}
              {isSpeechEnabled && (
                <div className="mt-4 pt-3 border-t border-purple-200/60 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-purple-900 block mb-1">Speed</label>
                    <Select
                      value={(() => {
                        const num = Number(speechRate);
                        if (isNaN(num) || ![0.5, 1, 2].includes(num)) return '1';
                        return String(num);
                      })()}
                      onValueChange={(val) => {
                        const rateNum = parseFloat(val);
                        setSpeechRate(rateNum);
                        try {
                          sessionStorage.setItem('speechRate', String(rateNum));
                          localStorage.setItem('speechRate', String(rateNum));
                        } catch { }
                      }}
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
                      onValueChange={(val) => {
                        setSpeechGender(val);
                        try {
                          sessionStorage.setItem('speechGender', val);
                          localStorage.setItem('speechGender', val);
                        } catch { }
                      }}
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
                      onValueChange={(val) => {
                        setSpeechAccent(val);
                        try {
                          sessionStorage.setItem('speechAccent', val);
                          localStorage.setItem('speechAccent', val);
                        } catch { }
                      }}
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
              )}
            </div>
          )}

          {/* Display questions from genResults state */}
          {(() => {
            // Use genResults state if available, otherwise fall back to localStorage
            let results = genResults;
            if (!results || !Array.isArray(results)) {
              try {
                const raw = sessionStorage.getItem("questionGenResults");
                const data = JSON.parse(raw || "null");
                // Try all common array locations
                if (Array.isArray(data)) {
                  results = data;
                } else if (data && Array.isArray(data.data)) {
                  results = data.data;
                } else if (data && Array.isArray(data.questions)) {
                  results = data.questions;
                } else if (data && Array.isArray(data.result)) {
                  results = data.result;
                } else if (data && Array.isArray(data.results)) {
                  // New: agentic workflow stored as { agents, results: [{ index, data }] }
                  // We need to unwrap and collect question objects from each step's data
                  const extracted: any[] = [];
                  const extractDeep = (node: any, depth = 0) => {
                    if (!node || depth > 3) return;
                    if (Array.isArray(node)) {
                      node.forEach(n => extractDeep(n, depth + 1));
                      return;
                    }
                    if (typeof node === 'object') {
                      if (
                        node.label ||
                        node.Question ||
                        node.text ||
                        node.QuestionText ||
                        Array.isArray(node.values)
                      ) {
                        extracted.push(node);
                      }
                      Object.values(node).forEach(v => extractDeep(v, depth + 1));
                    }
                  };
                  try {
                    data.results.forEach((r: any) => extractDeep(r?.data));
                  } catch { }
                  results = extracted;
                } else if (data && typeof data === 'object') {
                  // If the object has multiple numbered keys (0,1,2,3...), treat as array-like
                  const keys = Object.keys(data);
                  if (keys.length > 1 && keys.every(k => !isNaN(Number(k)))) {
                    // Only treat as array if all values are objects with a question/label property
                    const arrLike = keys.map(k => data[k]);
                    if (arrLike.every(q => typeof q === 'object' && (q.label || q.Question || q.text))) {
                      results = arrLike;
                    }
                  } else if (data.label || data.Question || data.text) {
                    results = [data];
                  }
                }
              } catch { }
              // Flatten if any nested arrays (defensive)
              if (Array.isArray(results) && results.length === 1 && Array.isArray(results[0])) {
                results = results[0];
              }
              // Defensive: if results is not an array but is a non-null object, wrap it
              if (!Array.isArray(results) && results && typeof results === 'object') {
                results = [results];
              }
            }
            // Remove any null/undefined entries
            results = Array.isArray(results) ? results.filter(Boolean) : [];

            if (!results || results.length === 0) {
              return <div className="p-8 text-center text-gray-500">No generated questions found. Please generate questions first.</div>;
            }
            // Deduplicate results but keep full matrix root objects and
            // filter out any row/column-derived items that were produced separately
            const uniqueResults: any[] = [];
            const seen = new Set<string>();

            // Collect texts/labels from matrix roots so we can skip their child items
            const matrixRoots = results.filter((r: any) => r?.type === 'matrix' || (Array.isArray(r?.rows) && Array.isArray(r?.columns)));
            const matrixChildTexts = new Set<string>();
            matrixRoots.forEach((root: any) => {
              (root.columns || []).forEach((c: any) => {
                if (c && c.text) matrixChildTexts.add(String(c.text).trim().toLowerCase());
                if (c && c.value) matrixChildTexts.add(String(c.value).trim().toLowerCase());
              });
              (root.rows || []).forEach((rr: any) => {
                if (rr && rr.text) matrixChildTexts.add(String(rr.text).trim().toLowerCase());
                if (rr && rr.value) matrixChildTexts.add(String(rr.value).trim().toLowerCase());
              });
            });

            results.forEach((r: any) => {
              // If this item looks like a matrix root, always keep it
              const isMatrixRoot = r?.type === 'matrix' || (Array.isArray(r?.rows) && Array.isArray(r?.columns));

              // If this item appears to be a child (row/column) of any matrix root, skip it
              const candidateText = String(r?.label || r?.Question || r?.text || '').trim().toLowerCase();
              if (!isMatrixRoot && candidateText && matrixChildTexts.has(candidateText)) {
                return; // skip column/row-derived duplicate
              }

              const key = String(
                r.id || r.questionid || r.questionguid || r.label || r.Question || r.text || (r.type ? `${r.type}::${r.label || ''}` : JSON.stringify(r))
              );
              if (!seen.has(key)) {
                seen.add(key);
                uniqueResults.push(r);
              }
            });
            return uniqueResults.map((q, idx) => (
              <Card key={`${refreshKey}-${q.id || idx}`} className="mb-6 border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="bg-black text-white px-3 py-1 rounded text-sm font-medium">Question {idx + 1}</span>
                      {(() => {
                        const raw = q.MaxMarks ?? q.maxmarks ?? q.Marks ?? q.marks;
                        let computed: any = null;
                        try {
                          if (raw == null) {
                            computed = null;
                          } else if (typeof raw === 'object') {
                            const fallback = q.MaxMarks ?? q.Marks ?? q.maxmarks ?? 1;
                            computed = fallback;
                          } else {
                            const asNum = typeof raw === 'number' ? raw : Number(String(raw).trim());
                            const value = Number.isFinite(asNum) ? asNum : String(raw).trim();
                            computed = (value === '' || value == null) ? null : value;
                          }
                        } catch {
                          computed = null;
                        }

                        // Prefer the globally-selected point value (if present) so the
                        // Application tab and UI reflect the selected Point Value.
                        let sessionPV: string | null = null;
                        try {
                          sessionPV = sessionStorage.getItem('pointValue');
                        } catch { }
                        const display = sessionStorage.getItem('pointValue');
                        // if (display == null) return null;
                        return <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-sm">{display} Marks</span>;
                      })()}
                      <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded text-sm">
                        {sessionStorage.getItem('selectedQuestionType')}
                      </span>
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm">
                        {sessionStorage.getItem('selectedTaxonomy')}
                      </span>

                    </div>
                    <div className="flex gap-2">
                      {/* Speaker button — only shown when feature flag is on AND toggle is enabled AND not SSO */}
                      {showTextToSpeech === 1 && !isSSO && isSpeechEnabled && (() => {
                        const qKey = String(q.id || q.questionid || q.questionguid || `q_${idx}`);
                        const isPlaying = playingQuestionId === qKey;
                        return (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={isPlaying ? "text-blue-600 font-medium" : "text-gray-600 hover:text-gray-900"}
                            title={isPlaying ? "Stop reading" : "Read question"}
                            aria-label={isPlaying ? "Stop reading question" : "Read question"}
                            onClick={() => handleSpeak(q, qKey)}
                          >
                            {isPlaying ? (
                              <>
                                <VolumeX className="w-4 h-4 mr-1" />
                                Stop
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-4 h-4 mr-1" />
                                Speak
                              </>
                            )}
                          </Button>
                        );
                      })()}
                      {/* Hide edit button after data is inserted to database */}
                      {!hasInsertedToDB && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-600"
                          onClick={() => {
                            const isMatrix = (q?.type === 'matrix') || (Array.isArray(q?.rows) && Array.isArray(q?.columns));
                            if (isMatrix) {
                              setSelectedQuestion(q)
                              setQuestionType('matrix')
                              try {
                                const cols = (q.columns || []).map((c: any, idx: number) => {
                                  const text = String(c?.text ?? c?.value ?? '').trim();
                                  return text || `Column ${idx + 1}`;
                                });
                                const rows = (q.rows || []).map((r: any, idx: number) => {
                                  const text = String(r?.text ?? r?.value ?? '').trim();
                                  return text || `Row ${idx + 1}`;
                                });
                                const rawAnswers = Array.isArray(q.CorrectAnswer)
                                  ? q.CorrectAnswer.slice()
                                  : Array(rows.length).fill(-1);
                                const normalizedAnswers = rows.map((_, rowIdx) => {
                                  const value = rawAnswers[rowIdx];
                                  if (typeof value === 'number' && value >= 0 && value < cols.length) return value;
                                  if (typeof value === 'string') {
                                    const trimmed = value.trim();
                                    if (!trimmed) return -1;
                                    const letterIdx = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(trimmed.toUpperCase());
                                    if (letterIdx >= 0 && letterIdx < cols.length) return letterIdx;
                                    const colMatch = cols.findIndex(col => col.trim().toLowerCase() === trimmed.toLowerCase());
                                    if (colMatch >= 0) return colMatch;
                                  }
                                  return -1;
                                });
                                const rawFeedbacks = Array.isArray(q.Feedbacks) ? q.Feedbacks.slice() : [];
                                const normalizedFeedbacks = rows.map((_, idx) => String(rawFeedbacks[idx] ?? ''));
                                setMatrixEdit({
                                  questionStatement: String(q.QuestionStatement || ''),
                                  partPrompt: String(q.PartPrompt || ''),
                                  rows,
                                  columns: cols,
                                  answers: normalizedAnswers,
                                  feedbacks: normalizedFeedbacks
                                })
                              } catch {
                                setMatrixEdit({ questionStatement: String(q.QuestionStatement || ''), partPrompt: String(q.PartPrompt || ''), rows: [], columns: [], answers: [], feedbacks: [] })
                              }
                              // Keep default validation shape
                              setValidationErrors({ options: ['', '', '', ''], correctAnswer: '', correctAnswers: ['', '', '', '', '', '', '', '', '', ''], questionStem: '', sampleAnswer: '', keyPoints: ['', '', '', '', ''], feedbacks: ['', '', '', ''] })
                              setEditingPassageTabIndex(0)
                              setIsEditDialogOpen(true)
                              return
                            }
                            // Build a sanitized question for editing so UI matches preview
                            const isFillBlank = isFillBlankQuestion(q)
                            const isFillBlankDropdown = isFillBlankDropdownQuestion(q)
                            const rawOptions = Array.isArray(q.DropdownOptions) && q.DropdownOptions.length
                              ? q.DropdownOptions.map((o: any) => (typeof o === 'string' ? o : (o?.text || o?.value || '')))
                              : Array.isArray(q.dropdownoptions) && q.dropdownoptions.length
                                ? q.dropdownoptions.map((o: any) => (typeof o === 'string' ? o : (o?.text || o?.value || '')))
                                : Array.isArray(q.values) && q.values.length
                                  ? q.values.map((o: any) => (typeof o === 'string' ? o : (o?.text || o?.value || '')))
                                  : [];
                            const isTF = !isFillBlank && rawOptions.length === 2 && rawOptions.every((o: string) => /^(true|false)$/i.test(String(o).trim()))
                            const isMC = !isFillBlank && rawOptions.length > 0 && !isTF
                            let sanitized: any = { ...q }
                            if (Array.isArray(sanitized.CorrectAnswer)) {
                              if (sanitized.CorrectAnswer.length === 1) {
                                // unwrap single-element array into string
                                sanitized.CorrectAnswer = String(sanitized.CorrectAnswer[0] || '')
                              }
                              // if length > 1 → keep array as-is
                            } else {
                              // not an array → force into string
                              sanitized.CorrectAnswer = String(sanitized.CorrectAnswer || '')
                            }
                            // Preserve the dropdown option list for Select the Blank /
                            // Fill In the Blank Dropdown, whose options are sometimes stored
                            // under `values`.
                            // Only for the DROPDOWN variant: doing this for a plain Fill In
                            // the Blank wrote a DropdownOptions array onto the question, and
                            // once saved that made it look like a dropdown question, so an
                            // extra <select> appeared in the stem after edit + update.
                            if (isFillBlankDropdown) {
                              const preservedOptions = Array.isArray(q.DropdownOptions) && q.DropdownOptions.length
                                ? q.DropdownOptions
                                : Array.isArray(q.dropdownoptions) && q.dropdownoptions.length
                                  ? q.dropdownoptions
                                  : rawOptions;
                              sanitized.DropdownOptions = preservedOptions;
                              sanitized.dropdownoptions = preservedOptions;
                              sanitized.values = preservedOptions;
                              sanitized.options = preservedOptions;
                            }

                            setSelectedQuestion(sanitized)
                            setQuestionType(isFillBlankDropdown ? "select-blank" : (isFillBlank ? "fill-blank" : (isTF ? "true-false" : (isMC ? "multiple-choice" : "written-response"))))
                            // Reset validation errors sized to question type
                            setValidationErrors({
                              options: isFillBlank ? [] : (isTF ? ['', ''] : (isMC ? ['', '', '', ''] : [])),
                              correctAnswer: '',
                              correctAnswers: ['', '', '', '', '', '', '', '', '', ''],
                              questionStem: '',
                              sampleAnswer: '',
                              keyPoints: ['', '', '', '', ''],
                              feedbacks: isFillBlank ? [] : (isTF ? ['', ''] : (isMC ? ['', '', '', ''] : []))
                            })
                            // Initialize edit form arrays to match type (limit to 2 for True/False)
                            try {
                              const normalizedOptions = rawOptions.map((o: string) => String(o).trim())
                              const initialOptions = isFillBlank
                                ? []
                                : (isTF
                                  ? [normalizedOptions[0] || 'True', normalizedOptions[1] || 'False']
                                  : [normalizedOptions[0] || '', normalizedOptions[1] || '', normalizedOptions[2] || '', normalizedOptions[3] || ''])
                              // Gather feedbacks from question
                              const fbA = q.FeedbackOptionA || q.FeedbackOption1 || q.feedback1 || ''
                              const fbB = q.FeedbackOptionB || q.FeedbackOption2 || q.feedback2 || ''
                              const fbC = q.FeedbackOptionC || q.FeedbackOption3 || q.feedback3 || ''
                              const fbD = q.FeedbackOptionD || q.FeedbackOption4 || q.feedback4 || ''
                              const initialFeedbacks = isFillBlank
                                ? []
                                : (isTF ? [String(fbA || ''), String(fbB || '')] : [String(fbA || ''), String(fbB || ''), String(fbC || ''), String(fbD || '')])
                              // If these setters exist, use them to prime the dialog
                              // @ts-expect-error optional setters may exist in component state
                              if (typeof setEditingOptions === 'function') setEditingOptions(initialOptions)
                              // @ts-expect-error optional setters may exist in component state
                              if (typeof setEditingFeedbacks === 'function') setEditingFeedbacks(initialFeedbacks)
                            } catch { }
                            // Initialize editing key points from question data
                            const keyPoints = getKeyPointsFromQuestion(q)
                            setEditingKeyPoints(keyPoints)
                            setEditingPassageTabIndex(0)
                            setIsEditDialogOpen(true)
                          }}>
                          <Edit3 className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      )}
                      {/* Show Rate button only if question doesn't have both rating and feedback */}
                      {(() => {
                        const questionText = q?.label || q?.Question || q?.text || q?.QuestionText || '';

                        // Use question ID if available, otherwise find by index
                        let questionId = q?.id || q?.questionid || q?.raw?.id || q?.raw?.questionid;
                        if (questionId == null) {
                          // Find the question index and use it as ID
                          const questionIndex = questions.findIndex(q => {
                            const text = q?.label || q?.Question || q?.text || q?.QuestionText || '';
                            return text === questionText;
                          });
                          questionId = questionIndex >= 0 ? questionIndex + 1 : null;
                        }

                        const questionKey = `question_${questionId}`;
                        const ratingData = questionRatings[questionKey];
                        const hasRating = ratingData?.rating !== null && ratingData?.rating !== undefined;
                        const hasFeedback = ratingData?.feedback && ratingData.feedback.trim().length > 0;
                        const existingRating = q?.ratingid || q?.Rating || 0;
                        const existingFeedback = q?.rating_feedback || q?.Rating_Feedback || q?.feedback || '';

                        // Hide button if both rating and feedback are provided either in state or from API
                        if ((hasRating && hasFeedback) || (existingRating > 0 && existingFeedback.trim().length > 0)) {
                          return null;
                        }
                        return (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hidden"
                            onClick={() => {
                              // Set up rating dialog
                              const questionText = q?.label || q?.Question || q?.text || q?.QuestionText || '';
                              setSelectedQuestionForRating(questionText);

                              // Use question ID if available, otherwise find by index
                              let questionId = q?.id ? Number(q.id) : (q?.questionid ? Number(q.questionid) : null);
                              if (questionId == null) {
                                // Find the question index and use it as ID
                                const questionIndex = questions.findIndex(q => {
                                  const text = q?.label || q?.Question || q?.text || q?.QuestionText || '';
                                  return text === questionText;
                                });
                                questionId = questionIndex >= 0 ? questionIndex + 1 : null;
                              }

                              setSelectedQuestionId(questionId);
                              setSelectedQuestionRequestId(q?.questionrequestid ? Number(q.questionrequestid) : null);
                              setQuestionRating(null);
                              setFeedbackText('');
                              setIsFeedbackReadOnly(false);
                              setRatingDialogOpen(true);
                            }}>
                            <ThumbsUp className="w-4 h-4 mr-1" />
                            Rate
                          </Button>
                        );
                      })()}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-purple-600"
                        onClick={() => {
                          // Prepare sanitized question for preview
                          let sanitized: any = { ...q }
                          // Determine if this is Matrix before touching CorrectAnswer
                          const isMatrix = (q?.type === 'matrix') || (Array.isArray(q?.rows) && Array.isArray(q?.columns));
                          // Only normalize CorrectAnswer for non-matrix questions
                          if (!isMatrix && Array.isArray(sanitized.CorrectAnswer)) {
                            sanitized.CorrectAnswer = String(sanitized.CorrectAnswer[0] || '')
                          }
                          if (isMatrix) {
                            setSelectedQuestion(sanitized)
                            setQuestionType('matrix')
                            setIsPreviewDialogOpen(true)
                            return
                          }
                          const opts = Array.isArray(sanitized.values) ? sanitized.values.map((o: any) => (typeof o === 'string' ? o : (o?.text || o?.value || ''))) : []
                          const isTrueFalse = opts.length === 2 && opts.every((o: string) => /^(true|false)$/i.test(String(o).trim()))
                          const isMC = opts.length > 0 && !isTrueFalse
                          // Normalize MC CorrectAnswer to A./B./... form if it's plain text
                          if (isMC && sanitized.CorrectAnswer && !/^[A-Da-d]\b/.test(String(sanitized.CorrectAnswer))) {
                            const coreOpts = opts.map((o: string) => String(o).replace(/^[A-Da-d][\.)]\s*/, '').trim().toLowerCase())
                            const caCore = String(sanitized.CorrectAnswer).replace(/^[A-Da-d][\.)]\s*/, '').trim().toLowerCase()
                            const idxMatch = coreOpts.findIndex(o => o === caCore)
                            if (idxMatch >= 0) {
                              const letter = String.fromCharCode(65 + idxMatch)
                              const optText = opts[idxMatch].toString().replace(/^[A-Da-d][\.)]\s*/, '').trim()
                              sanitized.CorrectAnswer = `${letter}. ${optText}`
                            }
                          }
                          setSelectedQuestion(sanitized)
                          const isFillBlankDropdown = isFillBlankDropdownQuestion(sanitized)
                          const isFillBlank = isFillBlankQuestion(sanitized)
                          setQuestionType(isFillBlankDropdown ? "select-blank" : (isFillBlank ? "fill-blank" : (isTrueFalse ? "true-false" : (isMC ? "multiple-choice" : "written-response"))))
                          setActivePassageTab(prev => ({ ...prev, "preview-modal": 0 }))
                          setIsPreviewDialogOpen(true)
                        }}>
                        <Eye className="w-4 h-4 mr-1" />
                        Preview
                      </Button>
                      {/* Hide delete button after data is inserted to database */}
                      {!hasInsertedToDB && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => {
                            setQuestionToDelete(q);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      )}
                      {/* Regenerate the item itself (stem only / options only / both).
                          Hidden once saved, like Delete, so the repository copy cannot
                          drift from what is on screen. Also hidden for SSO users. */}
                      {!isSSO && !hasInsertedToDB && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600"
                          title="Regenerate question"
                          aria-label={`Regenerate question ${idx + 1}`}
                          onClick={() => openRegenerateItem(q)}
                        >
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Regenerate
                        </Button>
                      )}
                    </div>
                  </div>

                  <div>
                    {/* Passage tabs — full-width pill switcher above the question */}
                    {getQuestionTabs(q).length > 0 && (() => {
                      const tabsList = getQuestionTabs(q);
                      const cardKey = `${q.id || idx}`;
                      const activeIdx = activePassageTab[cardKey] ?? 0;
                      const safeIdx = Math.min(activeIdx, tabsList.length - 1);
                      const activeTabObj = tabsList[safeIdx] || {};
                      const getTitle = getTabTitle;
                      const getPassage = getTabPassage;

                      return (
                        <div className="w-full mb-4">
                          <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-1">
                            {tabsList.map((tab: any, tIdx: number) => {
                              const isActive = tIdx === safeIdx;
                              return (
                                <button
                                  key={tIdx}
                                  type="button"
                                  onClick={() => setActivePassageTab(prev => ({ ...prev, [cardKey]: tIdx }))}
                                  className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ease-out ${isActive
                                    ? 'bg-white text-blue-700 shadow-md shadow-black/5 ring-1 ring-black/5'
                                    : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                                    }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <span className={`h-1.5 w-1.5 rounded-full transition-colors ${isActive ? 'bg-blue-600' : 'bg-gray-300'}`} />
                                    {getTitle(tab, tIdx)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                            <div className="text-gray-900 text-base leading-relaxed whitespace-pre-line">
                              <LatexRenderer content={getPassage(activeTabObj)} />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {q.PassageContext && getQuestionTabs(q).length === 0 && (
                      <div className="mb-4 p-4 bg-white rounded-lg border border-blue-200 shadow-sm">
                        <h4 className="font-semibold text-blue-800 mb-2">
                          {q.TabTitle || 'Passage'}
                        </h4>
                        <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                          <LatexRenderer content={q.PassageContext} />
                        </div>
                      </div>
                    )}
                    <div>
                      <h4 className="text-lg font-medium text-gray-900 mb-4">
                        {(() => {
                          // Refinement can return a label that repeats the stem, so
                          // collapse any duplicated sentence, not just an exact "X X".
                          let mainText = dedupeRepeatedText(getCleanStem(q));
                          // Do not strip PartPrompt from mainText, so the complete label is rendered as a single stem
                          // Select the Blank / Fill In the Blank Dropdown: render an inline <select>
                          // in place of the gap token. Accepts the [Dropdown1] token or the legacy [Blank1].
                          // Only a dropdown-type question gets the inline <select>. A plain
                          // Fill In the Blank whose edit added extra `values` was picking up
                          // this branch and rendering a dropdown it should not have.
                          if (isFillBlankDropdownQuestion(q)) {
                            const gapToken = mainText.includes('[Dropdown1]')
                              ? '[Dropdown1]'
                              : (mainText.includes('[Blank1]') ? '[Blank1]' : null);
                            const rawDropdownOptions = q.DropdownOptions || q.dropdownoptions
                              || (Array.isArray(q.values) && q.values.length > 1 ? q.values : []);
                            const dropdownOptions = Array.isArray(rawDropdownOptions)
                              ? rawDropdownOptions.map((o: any) => (typeof o === 'string' ? o : (o?.text || o?.value || String(o)))).filter(Boolean)
                              : [];
                            if (gapToken && dropdownOptions.length > 0) {
                              const parts = mainText.split(gapToken);
                              const cardKey = `${q.id || idx}`;
                              const selectedValue = fibDropdownSelections[cardKey] ?? '';
                              return (
                                <span>
                                  <LatexRenderer content={parts[0]} />
                                  <select
                                    className="mx-2 px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={selectedValue}
                                    onChange={(e) => {
                                      const newValue = e.target.value;
                                      // Save the selection locally so it persists across re-renders
                                      setFibDropdownSelections(prev => ({ ...prev, [cardKey]: newValue }));
                                      // Also persist the selection onto the underlying question record
                                      // (as SelectedAnswer) without touching CorrectAnswer or scoring fields.
                                      setGenResults((prev: any) => {
                                        if (!Array.isArray(prev)) return prev;
                                        return prev.map((item: any) => (item === q ? { ...item, SelectedAnswer: newValue } : item));
                                      });
                                    }}
                                  >
                                    <option value="" disabled>-- Select an option --</option>
                                    {dropdownOptions.map((opt: string, i: number) => (
                                      <option key={i} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                  <LatexRenderer content={parts.slice(1).join(gapToken)} />
                                </span>
                              );
                            }
                          }
                          return <LatexRenderer content={mainText} />;
                        })()}
                      </h4>

                      {getTableAnalysis(q) && (() => {
                        const tableData = getTableAnalysis(q)!;
                        const cardKey = `${q.id || idx}`;
                        const sortCol = activeTableSort[cardKey] || 'S.no';
                        const sortedRows = getSortedRows(tableData, sortCol === 'S.no' ? null : sortCol);

                        return (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2">
                              <label className="text-sm font-semibold text-gray-800">Sort By :</label>
                              <select
                                value={sortCol}
                                onChange={(e) => setActiveTableSort(prev => ({ ...prev, [cardKey]: e.target.value }))}
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
                      {/* When tabs exist the stem above IS the PartPrompt, so don't repeat it here */}
                      {(q.PartPrompt || q.raw?.PartPrompt) && getQuestionTabs(q).length === 0 && !(Array.isArray(q.values) && q.values.length > 0 && !isFillBlankQuestion(q) && !getTableAnalysis(q)) && !containsStemText(getCleanStem(q), q.PartPrompt || q.raw?.PartPrompt) && !stemAlreadyHasDropdownGap(q) && (
                        <div className="text-base text-gray-900 mb-4 mt-3 font-bold">
                          <strong>
                            {(() => {
                              const promptContent = String(q.PartPrompt || q.raw?.PartPrompt || '');

                              // Dropdown-type only — see the note on the stem above.
                              if (isFillBlankDropdownQuestion(q)) {
                                const gapToken = promptContent.includes('[Dropdown1]')
                                  ? '[Dropdown1]'
                                  : (promptContent.includes('[Blank1]') ? '[Blank1]' : null);
                                const rawDropdownOptions = q.DropdownOptions || q.dropdownoptions
                                  || (Array.isArray(q.values) && q.values.length > 1 ? q.values : []);
                                const dropdownOptions = Array.isArray(rawDropdownOptions)
                                  ? rawDropdownOptions.map((o: any) => (typeof o === 'string' ? o : (o?.text || o?.value || String(o)))).filter(Boolean)
                                  : [];

                                if (gapToken && dropdownOptions.length > 0) {
                                  const parts = promptContent.split(gapToken);
                                  const cardKey = `${q.id || idx}_prompt`;
                                  const selectedValue = fibDropdownSelections[cardKey] ?? '';
                                  return (
                                    <span className="font-normal">
                                      <LatexRenderer content={parts[0]} />
                                      <select
                                        className="mx-2 px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-normal"
                                        value={selectedValue}
                                        onChange={(e) => {
                                          const newValue = e.target.value;
                                          setFibDropdownSelections(prev => ({ ...prev, [cardKey]: newValue }));
                                          setGenResults((prev: any) => {
                                            if (!Array.isArray(prev)) return prev;
                                            return prev.map((item: any) => (item === q ? { ...item, SelectedAnswer: newValue } : item));
                                          });
                                        }}
                                      >
                                        <option value="" disabled>-- Select an option --</option>
                                        {dropdownOptions.map((opt: string, i: number) => (
                                          <option key={i} value={opt}>{opt}</option>
                                        ))}
                                      </select>
                                      <LatexRenderer content={parts.slice(1).join(gapToken)} />
                                    </span>
                                  );
                                }
                              }
                              return <LatexRenderer content={promptContent} />;
                            })()}
                          </strong>
                        </div>
                      )}
                      {/* Display generated image(s) if available */}
                      {(() => {
                        // Show every attached image, not just the first: adding a second
                        // image in the edit dialog populates `generatedImages`.
                        // The map fallback keyed off `selectedQuestion` instead of this
                        // card's own question, so a newly added image never appeared here.
                        const attached: string[] = Array.isArray((q as any).generatedImages) && (q as any).generatedImages.length
                          ? (q as any).generatedImages
                          : (() => {
                            const single = resolveQuestionImageUrl(q, questionImages);
                            return single ? [single] : [];
                          })();

                        const imgs = attached.filter((src: string) =>
                          src && !src.includes('NOT REQUIRED') && !src.includes('NO_IMAGE_REQUIRED')
                        );
                        if (imgs.length === 0) return null;

                        return (
                          <div className="mt-4 flex flex-wrap gap-3 justify-center">
                            {imgs.map((src: string, i: number) => (
                              <img
                                key={i}
                                src={src}
                                alt={`Question illustration ${i + 1}`}
                                className="max-w-full h-auto rounded-lg border border-gray-300 shadow-sm"
                                style={{ maxHeight: '300px' }}
                              />
                            ))}
                          </div>
                        );
                      })()}


                      {/* Show loading state for image generation */}
                      {/* {selectedQuestion && selectedQuestion.id && isGeneratingImages && !questionImages.get(selectedQuestion.id) && (
                  <div className="mt-4 flex flex-col items-center">
                    <div className="text-sm text-gray-600 mb-2">Generating image...</div>
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )} */}


                      {/* Matrix rendering */}
                      {q.type === 'matrix' || (Array.isArray(q.rows) && Array.isArray(q.columns)) ? (
                        <>
                          <div className="overflow-x-auto">
                            <table className="min-w-full border border-gray-300 rounded-md mt-2">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="border border-gray-300 p-2 text-left" style={{ width: '25%' }}></th>
                                  {(q.columns || []).map((col: any, colIndex: number) => (
                                    <th key={colIndex} className="border border-gray-300 p-2 text-center"><LatexRenderer content={col.text}></LatexRenderer></th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(q.rows || []).map((row: any, rowIndex: number) => (
                                  <tr key={rowIndex}>
                                    <td className="border border-gray-300 p-2"><LatexRenderer content={row.text}></LatexRenderer></td>
                                    {(q.columns || []).map((col: any, colIndex: number) => (
                                      <td key={colIndex} className="border border-gray-300 p-2 text-center">
                                        <input
                                          type="radio"
                                          name={`matrix-${idx}-row-${rowIndex}`}
                                          value={col.value}
                                          className="accent-blue-600"
                                          readOnly
                                          checked={Array.isArray(q.CorrectAnswer) && q.CorrectAnswer[rowIndex] === colIndex}
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className='text-green-700 mt-3'>
                            <strong>Correct Answers:</strong>
                            {(q.rows || []).map((row: any, rowIndex: number) => (
                              <span key={rowIndex}>
                                <LatexRenderer content={`${String(row.text)} => ${String(q.columns[q.CorrectAnswer[rowIndex]]?.text)}`}></LatexRenderer>
                              </span>
                            ))}
                          </div>
                          {Array.isArray(q.Feedbacks) && q.Feedbacks.length > 0 && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-3">
                              <div className="font-medium mb-1">Feedbacks:</div>
                              <ul className="list-disc ml-6">
                                {q.Feedbacks.map((fb: string, i: number) => (
                                  <li key={i}><LatexRenderer content={fb}></LatexRenderer></li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (isFillBlankQuestion(q) || isFillBlankDropdownQuestion(q)) ? (
                        /* Fill in the Blank / Select the Blank: single correct answer + single feedback.
                           The option list is intentionally not shown — it already appears in the
                           inline dropdown within the question stem above. */
                        <div className="space-y-4">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="text-sm font-medium text-blue-900 mb-2">Correct Answer:</div>
                            <div className="text-blue-900 font-semibold">
                              <LatexRenderer content={String(q.CorrectAnswer || q.correctanswer || q.answer || 'N/A').replace(/^[A-D]\.\s*/, '')} />
                            </div>
                          </div>
                          {(() => {
                            // Prefer the feedback for whichever option is actually correct
                            const dropdownOptions = getDropdownOptionsFromQuestion(q);
                            const correctRaw = String(q.CorrectAnswer || q.correctanswer || q.answer || '').replace(/^[A-Da-d]\.\s*/, '').trim().toLowerCase();
                            const correctIdx = dropdownOptions.findIndex((o: string) => String(o).trim().toLowerCase() === correctRaw);
                            const letterFeedback = correctIdx >= 0
                              ? q[`FeedbackOption${String.fromCharCode(65 + correctIdx)}`]
                              : '';
                            const feedbackText = letterFeedback || q.FeedbackOptionA || q.FeedbackOption1 || '';
                            if (!feedbackText) return null;
                            return (
                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                <div className="text-sm font-medium text-orange-800 mb-1">Feedback:</div>
                                <div className="text-orange-900 text-sm">
                                  <LatexRenderer content={String(feedbackText)} />
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (!isFillBlankQuestion(q) && q.values && Array.isArray(q.values) && q.values.length > 0) ? (
                        <>
                          {(() => {
                            const options: string[] = (Array.isArray(q.values) ? q.values : [])
                              .map((o: any) => (typeof o === 'string' ? o : (o?.text || o?.value || '')));
                            const optionCore = options.map((o) => String(o).replace(/^[A-Ja-j][\.)]\s*/, '').trim());
                            // Build a set of correct letters/indices supporting multiple responses
                            const correctSet = (() => {
                              // Fast path: Check single CorrectAnswer string first (Multiple Choice)
                              const caRaw = String(q.CorrectAnswer || q.correctanswer || q.answer || q.correct_answer || '');
                              const letter = (caRaw.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase();
                              if (letter && !Array.isArray(q.CorrectAnswer)) {
                                return new Set([letter]);
                              }

                              // Case 1: CorrectAnswer is array of labeled strings (e.g., "A. ...", "B. ...") - Multiple Response
                              if (Array.isArray(q.CorrectAnswer)) {
                                return new Set(
                                  q.CorrectAnswer
                                    .map((s: any) => String(s || '').trim())
                                    .map((s: string) => (s.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase())
                                    .filter(Boolean)
                                );
                              }
                              // Case 2: ItemScoring.Marking contains comma-separated letters - Multiple Response
                              if (q.ItemScoring && typeof q.ItemScoring.Marking === 'string') {
                                return new Set(
                                  q.ItemScoring.Marking.split(',')
                                    .map((s: string) => s.trim().replace(/\.$/, '').toUpperCase())
                                    .filter(Boolean)
                                );
                              }
                              // Case 3: marks object per option provided - Multiple Response
                              if (q.marks && typeof q.marks === 'object') {
                                return new Set(
                                  Object.entries(q.marks)
                                    .filter(([key, val]) => Number(val) > 0)
                                    .map(([key]) => String(key).toUpperCase())
                                );
                              }
                              // Fallback: single CorrectAnswer string (if not caught above)
                              if (letter) {
                                return new Set([letter]);
                              }
                              return new Set([]);
                            })();
                            const renderCorrectText = () => {
                              const letters = Array.from(correctSet) as string[];
                              if (letters.length) {
                                const parts = letters
                                  .map((L) => {
                                    const idx = 'ABCDEFGHIJ'.indexOf(L as string);
                                    const text = idx >= 0 && idx < optionCore.length ? optionCore[idx] : '';
                                    return `${L}. ${text}`.trim();
                                  })
                                  .filter(Boolean);
                                return parts.join(', ');
                              }
                              return 'N/A';
                            };
                            return (
                              <>
                                <div className="space-y-3 mb-4">
                                  {options.map((option, i) => {
                                    const letter = String.fromCharCode(65 + i);
                                    const isCorrect = correctSet.has(letter);
                                    return (
                                      <div
                                        key={i}
                                        className={`flex items-center gap-3 p-3 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200' : 'border border-gray-200'}`}
                                      >
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${isCorrect ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{letter}</span>
                                        <span className={isCorrect ? 'text-gray-900' : 'text-gray-700'}>
                                          <LatexRenderer content={String(option).replace(/^[A-Ja-j][\.)]\s*/, '')}></LatexRenderer></span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-2">
                                  <div className="text-sm text-blue-900">
                                    <strong>Correct Answer:</strong>
                                    {(() => {
                                      // renderCorrectText currently returns string of comma-separated parts; switch to point-wise list
                                      const letters = Array.from(correctSet) as string[];
                                      if (!letters.length) return <span> N/A</span>;
                                      const items = letters.map((L) => {
                                        const idx = 'ABCDEFGHIJ'.indexOf(L as string);
                                        const text = idx >= 0 && idx < optionCore.length ? optionCore[idx] : '';
                                        return `${L}. ${text}`.trim();
                                      }).filter(Boolean);
                                      return (
                                        <div className="mt-2 space-y-1 ml-0">
                                          {items.map((it, i) => (
                                            <div key={i}>
                                              <LatexRenderer content={it} />
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </>
                            );
                          })()}

                          {/* Feedback for each option if present */}
                          {Object.keys(q).filter(k => k.startsWith('FeedbackOption')).length > 0 && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-2">
                              <div className="font-medium mb-1">Feedback:</div>
                              <div className="ml-0 space-y-1">
                                {Object.keys(q).filter(k => k.startsWith('FeedbackOption')).map((k, i) => (
                                  <div key={i}>
                                    <LatexRenderer content={`${k.replace('FeedbackOption', '')}: ${String(q[k] ?? '')}`} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {(() => {
                            const isFIB = isFillBlankQuestion(q);
                            if (isFIB) {
                              // Tolerate `values` being absent (Select the Blank carries DropdownOptions instead)
                              const preferredAns = [q.CorrectAnswer || q.answer || q.correctanswer].filter(Boolean);
                              const answers = preferredAns.length ? preferredAns : (Array.isArray(q.values) ? q.values : []);
                              const fbKeys = Object.keys(q || {}).filter(k => /^FeedbackOption[A-J1-9]/.test(k) && q[k]);
                              return (
                                <>
                                  {/* Answers box (green) without bullets */}
                                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-2">
                                    <div className="flex items-start gap-3 mb-2">
                                      <MessageSquare className="w-5 h-5 text-green-600 mt-0.5" />
                                      <h5 className="font-medium text-green-900">Answers:</h5>
                                    </div>
                                    <div className="ml-0 space-y-1 text-green-800">
                                      {answers.map((a: any, i: number) => (
                                        <div key={i}><LatexRenderer content={String(typeof a === 'string' ? a : (a?.text || a?.value || ''))}></LatexRenderer></div>
                                      ))}
                                    </div>
                                  </div>
                                  {/* Feedback box (separate, grey) without bullets */}
                                  {fbKeys.length > 0 && (
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-2">
                                      <div className="font-medium mb-1">Feedback:</div>
                                      <div className="ml-0 space-y-1">
                                        {fbKeys.map((k, i) => (
                                          <div key={i}> <LatexRenderer content={String(q[k])}></LatexRenderer></div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            }
                            return (
                              <>
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-2">
                                  <div className="flex items-start gap-3 mb-3">
                                    <MessageSquare className="w-5 h-5 text-green-600 mt-0.5" />
                                    <h5 className="font-medium text-green-900">Correct Answer:</h5>
                                  </div>
                                  <div className="text-green-800 leading-relaxed"><LatexRenderer content={Array.isArray(q.CorrectAnswer) ? (q.CorrectAnswer.join('; ')) : (q.CorrectAnswer || q.correctanswer || q.answer)}></LatexRenderer></div>
                                </div>
                                {Array.isArray(q.KeyPoints) && q.KeyPoints.length > 0 && (
                                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-2">
                                    <div className="font-medium mb-1">Key Points:</div>
                                    <ul className="list-style-none">
                                      {q.KeyPoints.map((kp: string, i: number) => {
                                        const s = String(kp ?? '');
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
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </>
                      )}
                      {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {q.study && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                        <span className="font-medium">Study: </span> {sessionStorage.getItem('selectedChapterName')}
                      </div>
                    )}
                    {q.LearningObjective && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                        <span className="font-medium">Learning Objective: </span> {sessionStorage.getItem('learningObjectivesName')}
                      </div>
                    )}
                    {q.BookName && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                        <span className="font-medium">Book Name: </span>{sessionStorage.getItem("bookTitle")}
                      </div>
                    )}
                  </div> */}
                    </div>
                  </div>
                </div>
              </Card>
            ));
          })()}
        </div>
        {/* Footer */}
        {activeTab === "generate" && !isSSO && (

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white text-xs">⚡</span>
              </div>
              <span>Powered by advanced AI technology</span>
            </div>
          </div>

        )}

        {/* Repository Tab Content */}
        {activeTab === "repository" && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-600">Total Questions</p>
                      <p className="text-2xl font-bold" style={{ color: "#1c398e", fontSize: '1.25rem' }}>
                        1,247
                      </p>
                      <p className="text-xs text-gray-500">+15% this month</p>
                    </div>
                    <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Database className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-600">AI Generated</p>
                      <p className="text-2xl font-bold" style={{ color: "#0d542b", fontSize: '1.25rem' }}>
                        892
                      </p>
                      <p className="text-xs text-gray-500">High quality</p>
                    </div>
                    <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-purple-600" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-600">This Week</p>
                      <p className="text-2xl font-bold" style={{ color: "#59168b", fontSize: '1.25rem' }}>
                        47
                      </p>
                      <p className="text-xs text-gray-500">New questions</p>
                    </div>
                    <div className="h-8 w-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <FileText className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-600">Contributors</p>
                      <p className="text-2xl font-bold" style={{ color: "#7e2a0c", fontSize: '1.25rem' }}>
                        12
                      </p>
                      <p className="text-xs text-gray-500">Active authors</p>
                    </div>
                    <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
                      <User className="h-5 w-5 text-orange-600" />
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Filters & Search */}
            <Card className="border border-gray-200">
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Settings2 className="h-4 w-4" />
                    Filters & Search
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Source Type</label>
                      <Select defaultValue="all-sources">
                        <SelectTrigger className="bg-white border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="all-sources">All Sources</SelectItem>
                          <SelectItem value="book-based">Book Based</SelectItem>
                          <SelectItem value="ai-generated">AI Generated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Study Area</label>
                      <Select defaultValue="all-areas">
                        <SelectTrigger className="bg-white border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="all-areas">All Areas</SelectItem>
                          <SelectItem value="cyber-risk">Cyber Risk</SelectItem>
                          <SelectItem value="risk-management">Risk Management</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Question Type</label>
                      <Select defaultValue="all-types">
                        <SelectTrigger className="bg-white border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="all-types">All Types</SelectItem>
                          <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                          <SelectItem value="true-false">True/False</SelectItem>
                          <SelectItem value="short-answer">Short Answer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Difficulty</label>
                      <Select defaultValue="all-levels">
                        <SelectTrigger className="bg-white border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="all-levels">All Levels</SelectItem>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Search Questions</label>
                    <div className="relative">
                      <Sparkles className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <input
                        placeholder="Search questions, topics, or content..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Questions Table */}
            <Card className="border border-gray-200">
              <div className="p-0">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">3 Questions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 border-gray-200">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Selected
                    </Button>
                    <Button variant="outline" size="sm" className="border-gray-200">
                      <FileText className="h-4 w-4 mr-1" />
                      Export to Word
                    </Button>
                    <Button variant="outline" size="sm" className="border-gray-200">
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      Export to Excel
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left p-4 text-sm font-medium text-gray-700 w-12">
                          <input type="checkbox" className="rounded border-gray-300" />
                        </th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700 w-16">#</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700 w-48">Question ID</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Question</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Type</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Topic</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Difficulty</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Created</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Render API data here */}
                      {loading ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-gray-500">Loading...</td>
                        </tr>
                      ) : error ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-red-500">{error}</td>
                        </tr>
                      ) : questions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-gray-500">No questions found.</td>
                        </tr>
                      ) : (
                        questions.map((q, idx) => (
                          <tr key={q.id || q.questionid || idx} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="p-4">
                              <input type="checkbox" className="rounded border-gray-300" />
                            </td>
                            <td className="p-4 text-sm font-medium text-gray-900">{idx + 1}</td>
                            <td className="p-4 text-xs font-mono text-gray-600">{q.QuestionID || q.questionid || q.id}</td>
                            <td className="p-4 text-sm text-gray-900 max-w-md">
                              <p className="truncate">{q.Question || q.question || q.text || q.QuestionText}</p>
                            </td>
                            <td className="p-4 text-sm text-gray-700">{q.QuestionType || q.type || q.questiontype || q.questiontypeid || 'N/A'}</td>
                            <td className="p-4 text-sm" style={{ color: "#7e2a0c" }}>{q.Topic || q.topic || q.topicname || q.subject || 'N/A'}</td>
                            <td className="p-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${q.Difficulty === 'Easy' ? 'bg-green-100 text-green-800' : q.Difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800' : q.Difficulty === 'Hard' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>
                                {q.Difficulty || q.difficulty || q.difficultylevel || 'N/A'}
                              </span>
                            </td>
                            <td className="p-4 text-sm text-gray-500">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {(() => {
                                  // Try all possible date fields
                                  const dateVal = q.CreatedAt || q.createdat || q.created || q.date || q.created_date || q.createdDate;
                                  if (!dateVal || typeof dateVal !== 'string' || dateVal.trim() === '' || dateVal === 'null' || dateVal === 'undefined') return 'N/A';
                                  // Try parsing as date string
                                  const parsed = new Date(dateVal);
                                  if (!isNaN(parsed.getTime())) return parsed.toLocaleString();
                                  // Try parsing as timestamp
                                  if (!isNaN(Number(dateVal))) {
                                    const ts = Number(dateVal);
                                    const parsedTs = new Date(ts);
                                    if (!isNaN(parsedTs.getTime())) return parsedTs.toLocaleString();
                                  }
                                  // Try parsing as ISO string
                                  try {
                                    const iso = new Date(Date.parse(dateVal));
                                    if (!isNaN(iso.getTime())) return iso.toLocaleString();
                                  } catch { }
                                  // Fallback: show N/A, never blank
                                  return 'N/A';
                                })()}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        // Keep the edit dialog open while a nested image select/regenerate modal is active.
        if (!open && (isImageSelectModalOpen || isImageInstructionModalOpen)) return;
        setIsEditDialogOpen(open);
        if (!open) setShowKeyboard(false);
      }}>
        <DialogContent
          className={`max-w-4xl max-h-[90vh] overflow-y-auto ${isValidating ? 'backdrop-blur-sm bg-opacity-80' : ''
            }`}
          onInteractOutside={(e) => {
            if (isValidating || isImageSelectModalOpen || isImageInstructionModalOpen) {
              e.preventDefault();
              return;
            }
            setIsEditDialogOpen(false);
          }}
          onEscapeKeyDown={(e) => {
            if (isValidating || isImageSelectModalOpen || isImageInstructionModalOpen) {
              e.preventDefault();
              return;
            }
            setIsEditDialogOpen(false);
          }}
        >
          {/* Add loading overlay when validating */}
          {isValidating && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
            </div>
          )}



          <DialogHeader className="pb-6 border-b relative">
            {/* <DialogClose asChild>
              <button className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 p-1">
                <span className="sr-only">Close</span>
                <X className="h-4 w-4" />
              </button>
            </DialogClose> */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Edit3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-gray-900">
                  {questionType === 'matrix'
                    ? 'Edit Matrix'
                    : (isTrueFalseQuestion(selectedQuestion) || questionType === 'true-false'
                      ? 'Edit True False'
                      : ((isFillBlankDropdownQuestion(selectedQuestion) || questionType === 'select-blank') && questionType !== 'fill-blank'
                        ? 'Edit Select the Blank'
                        : (isFillBlankQuestion(selectedQuestion)
                          ? 'Edit Fill in the Blank'
                          : (questionType === 'written-response'
                            ? 'Edit Written Response'
                            : (isMultipleResponse(selectedQuestion)
                              ? 'Edit Multiple Response'
                              : 'Edit Multiple Choice')))))}
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  {questionType === 'matrix'
                    ? 'Modify the matrix statement, rows, columns, correct selections, and feedbacks.'
                    : (isTrueFalseQuestion(selectedQuestion) || questionType === 'true-false'
                      ? 'Modify the statement and pick the correct option (True/False).'
                      : (isFillBlankDropdownQuestion(selectedQuestion) || questionType === 'select-blank'
                        ? 'Modify the question content, correct answer selection, and feedback below.'
                        : (isFillBlankQuestion(selectedQuestion)
                          ? 'Modify the gap(s), correct answer(s), and feedback below.'
                          : (questionType === 'written-response'
                            ? 'Modify the question content, Correct Answer, key points, and metadata below.'
                            : 'Modify the question content, options, feedback and metadata below.'))))}
                </p>
              </div>
              {!isSSO && (
                <button
                  type="button"
                  onClick={() => setShowKeyboard((v) => !v)}
                  className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  title={showKeyboard ? 'Hide Keyboard' : 'Show Keyboard'}>
                  <Keyboard className="w-4 h-4" />
                </button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-8 py-6">
            {/* Passages (multi-tab) — switch tabs and edit the selected passage */}
            {getQuestionTabs(selectedQuestion).length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Passages</h3>
                </div>

                <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-1 flex-wrap">
                  {getQuestionTabs(selectedQuestion).map((tab: any, tIdx: number) => {
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
                  value={getTabPassage(getQuestionTabs(selectedQuestion)[editingPassageTabIndex] || {})}
                  onChange={(e) => {
                    const newPassage = e.target.value;
                    setSelectedQuestion((prev: any) => {
                      const tabs = getQuestionTabs(prev || {});
                      if (!tabs.length) return prev;
                      // Write every alias the reader looks at, otherwise a stale
                      // `TabContent` keeps shadowing the passage the user just typed.
                      const newTabs = tabs.map((t: any, i: number) =>
                        i === editingPassageTabIndex
                          ? { ...t, Passage: newPassage, TabContent: newPassage }
                          : t
                      );
                      return { ...prev, Tabs: newTabs, tabs: newTabs };
                    });
                    setHasUnsavedChanges(true);
                  }}
                  className="min-h-[120px] text-gray-900 bg-gray-50 resize-none border-gray-200"
                  placeholder="Enter passage text..."
                />
              </div>
            )}

            {/* Table Analysis (editable) */}
            {getTableAnalysis(selectedQuestion) && (() => {
              const tableData = getTableAnalysis(selectedQuestion)!;
              const indexedRows = tableData.Rows.map((row, originalIndex) => ({ originalIndex, row }));
              const colIndex = tableData.Columns.indexOf(editTableSortColumn);
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
                      {getSortOptions(tableData).map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                  <div className="overflow-x-auto border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <table className="w-full border border-gray-300 rounded-md">
                      <thead>
                        <tr className="bg-gray-50">
                          {tableData.Columns.map((col, colIdx) => (
                            <th key={colIdx} className="border border-gray-300 p-2 text-center font-semibold text-gray-800">
                              {colIdx === 0 ? (
                                <span className="font-semibold text-gray-700">{col}</span>
                              ) : (
                                <Input
                                  value={col}
                                  onChange={(e) => {
                                    const newCols = [...tableData.Columns];
                                    newCols[colIdx] = e.target.value;
                                    const newTable = { ...tableData, Columns: newCols };
                                    setSelectedQuestion((prev: any) => ({ ...prev, TableAnalysis: newTable, tableAnalysis: newTable }));
                                    setHasUnsavedChanges(true);
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
                                      const newRows = tableData.Rows.map((r, rI) =>
                                        rI === originalIndex ? r.map((c, cI) => cI === cellIdx ? e.target.value : c) : r
                                      );
                                      const newTable = { ...tableData, Rows: newRows };
                                      setSelectedQuestion((prev: any) => ({ ...prev, TableAnalysis: newTable, tableAnalysis: newTable }));
                                      setHasUnsavedChanges(true);
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
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Question Stem</h3>
              </div>

              <RichHtmlLatexField
                initialHtml={String(selectedQuestion ? (() => {
                  if (getQuestionTabs(selectedQuestion).length > 0) return getCleanStem(selectedQuestion);
                  let baseLabel = String(selectedQuestion.label ?? selectedQuestion.QuestionStatement ?? selectedQuestion.Question ?? selectedQuestion.text ?? selectedQuestion.QuestionText ?? "").trim();

                  // Collapse duplicated stem text (see dedupeRepeatedText)
                  baseLabel = dedupeRepeatedText(baseLabel);
                  const half1 = baseLabel.substring(0, Math.floor(baseLabel.length / 2)).trim();
                  const half2 = baseLabel.substring(Math.floor(baseLabel.length / 2)).trim();
                  if (half1.length > 10 && half1 === half2) {
                    baseLabel = half1;
                  }

                  return baseLabel;
                })() : "Why are speculative risks generally excluded from insurance coverage, and how does this differ from the treatment of pure risks?")}
                remountKey={`${refreshKey}-stem-${selectedQuestion?.id ?? selectedQuestion?.questionid ?? selectedQuestion?.QuestionID ?? selectedQuestion?.questionguid ?? 'new'}`}
                // editLabel="Edit stem (HTML and LaTeX source)"
                validationError={validationErrors.questionStem}
                editorClassName={`min-h-[100px] text-gray-900 bg-gray-50 resize-none border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none ${validationErrors.questionStem ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                  }`}
                editorDataProps={{ 'data-question-stem-editor': '' }}
              />
              {!isSSO && (() => {
                const committed = Array.isArray((selectedQuestion as any)?.generatedImages) && (selectedQuestion as any).generatedImages.length
                  ? (selectedQuestion as any).generatedImages
                  : (() => { const s = resolveQuestionImageUrl(selectedQuestion, questionImages); return s ? [s] : []; })();
                const imgs = (imagesEdited ? stagedEditImages : committed)
                  .filter((u: string) => u && !u.includes('NOT REQUIRED') && !u.includes('NO_IMAGE_REQUIRED'));
                const hasImage = imgs.length > 0;
                const removeImageAt = (removeIdx: number) => {
                  const next = imgs.filter((_: string, j: number) => j !== removeIdx);
                  setStagedEditImages(next);
                  setStagedEditImageUrl(next[0] || "");
                  // Removing the last image must clear the origin too, otherwise the
                  // question is saved as "manually added" with no image at all.
                  if (next.length === 0) setStagedGeneratedImageType(null);
                  setImagesEdited(true);
                };
                // Always render the section — with no image the placeholder plus the two
                // action icons are what let the user generate or pick one.
                return (
                  <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm text-gray-600">{hasImage && imgs.length > 1 ? `Question Images (${imgs.length})` : 'Question Image'}</p>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenImageRegenerate(selectedQuestion)} className="h-6 w-6 p-0 rounded-full" title={hasImage ? 'Regenerate Image' : 'Generate Image'}>
                        <RotateCcw className="w-3 h-3 text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenImageSelect(selectedQuestion)} className="h-6 w-6 p-0 rounded-full" title="Select Image(s) from Repository">
                        <ImagePlus className="w-3 h-3 text-blue-600" />
                      </Button>
                    </div>
                    {hasImage ? (
                      <div className="flex flex-wrap gap-3">
                        {imgs.map((src: string, i: number) => (
                          <div key={i} className="relative group">
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


            {questionType === 'matrix' ? (
              <div className="space-y-8">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                        <List className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <Label className="text-lg font-semibold text-gray-800">Matrix Columns</Label>
                        <p className="text-sm text-gray-500">Edit column headings</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                    </div>
                  </div>
                  <div className="p-6 overflow-x-auto">
                    <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr>
                          <th className="bg-gray-50 border border-gray-200 p-3 text-left text-sm font-medium text-gray-600">Activity</th>
                          {matrixEdit.columns.map((col, colIndex) => (
                            <th key={colIndex} className="bg-gray-50 border border-gray-200 p-3 align-top">
                              <RichHtmlLatexField
                                initialHtml={col}
                                remountKey={`${refreshKey}-mcol-${colIndex}`}
                                previewLabel="Column preview"
                                // editLabel="Edit column (HTML / LaTeX)"
                                showPreview
                                editorClassName="w-full min-h-[56px] text-gray-900 bg-white border border-gray-200 rounded-md px-2 py-2 text-center font-medium whitespace-pre-wrap break-words outline-none"
                                editorDataProps={{ 'data-matrix-column-editor': colIndex }}
                                onEditorBlur={(html) => updateMatrixColumnText(colIndex, html)}
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixEdit.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-t border-gray-200">
                            <td className="border border-gray-200 p-3 align-top">
                              <RichHtmlLatexField
                                initialHtml={row}
                                remountKey={`${refreshKey}-mrow-${rowIndex}`}
                                previewLabel="Row preview"
                                // editLabel="Edit row (HTML / LaTeX)"
                                showPreview
                                editorClassName="min-h-[80px] text-gray-900 bg-gray-50 resize-none border border-gray-200 rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none"
                                editorDataProps={{ 'data-matrix-row-editor': rowIndex }}
                                onEditorBlur={(html) => updateMatrixRowText(rowIndex, html)}
                              />
                            </td>
                            {matrixEdit.columns.map((_, colIndex) => {
                              const selectedValue = matrixEdit.answers[rowIndex];
                              const isChecked = selectedValue === colIndex;
                              return (
                                <td key={colIndex} className="border border-gray-200 p-3 text-center align-middle">
                                  <label className="inline-flex items-center justify-center">
                                    <input
                                      type="radio"
                                      name={`matrix-row-${rowIndex}`}
                                      className="accent-purple-600 h-4 w-4"
                                      checked={isChecked}
                                      onChange={() => updateMatrixAnswer(rowIndex, colIndex)}
                                    />
                                  </label>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {validationErrors.correctAnswer && (
                      <p className="text-red-500 text-sm mt-3">{validationErrors.correctAnswer}</p>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Feedback</h3>
                      <p className="text-sm text-gray-500">Provide guidance for each activity selection.</p>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    {matrixEdit.rows.map((row, rowIndex) => {
                      const rowLabel = row;
                      const selectedColumnIndex = matrixEdit.answers[rowIndex];
                      const correctResponse = selectedColumnIndex >= 0 && matrixEdit.columns[selectedColumnIndex]
                        ? matrixEdit.columns[selectedColumnIndex]
                        : 'N/A';
                      const rawFeedback = matrixEdit.feedbacks[rowIndex] || '';
                      const feedbackText = rawFeedback.replace(/^\s*(Correct|Incorrect)[:.]?\s*/i, '');
                      return (
                        <div key={rowIndex} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-2">
                              <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">Row value:</span>
                              <div className="text-sm text-gray-800 flex-1">{renderOptionPreviewContent(String(rowLabel || ''))}</div>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">Correct response:</span>
                              <div className="text-sm text-gray-800 flex-1">{renderOptionPreviewContent(String(correctResponse || ''))}</div>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">Feedback:</span>
                              <div className="flex-1 min-w-0">
                                <RichHtmlLatexField
                                  initialHtml={feedbackText}
                                  remountKey={`${refreshKey}-mfb-${rowIndex}`}
                                  previewLabel="Preview"
                                  // editLabel="Edit feedback (HTML / LaTeX)"
                                  validationError={validationErrors.feedbacks?.[rowIndex]}
                                  editorClassName={`text-sm text-gray-800 w-full min-h-[60px] border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none bg-white ${validationErrors.feedbacks?.[rowIndex] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'}`}
                                  onEditorBlur={(html) => updateMatrixFeedback(rowIndex, html)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : questionType === "written-response" ? (
              <>
                {/* Correct Answer */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Correct Answer</h3>
                  </div>

                  <RichHtmlLatexField
                    initialHtml={(function () {
                      if (!selectedQuestion) {
                        return "Speculative risks involve the possibility of gain or loss, making them unsuitable for insurance coverage, which is designed for predictable and measurable risks like pure risks. Pure risks only involve the chance of loss or no loss, allowing insurers to calculate premiums and manage claims effectively.";
                      }
                      const ca = selectedQuestion.CorrectAnswer || selectedQuestion.correctanswer || selectedQuestion.answer || "";
                      const txt = String(ca);
                      return txt ? txt.replace(/^[A-D]\.\s*/, '') : "Speculative risks involve the possibility of gain or loss, making them unsuitable for insurance coverage, which is designed for predictable and measurable risks like pure risks. Pure risks only involve the chance of loss or no loss, allowing insurers to calculate premiums and manage claims effectively.";
                    })()}
                    remountKey={`${refreshKey}-sample-ans-${selectedQuestion?.id ?? selectedQuestion?.questionid ?? ''}`}
                    // editLabel="Edit correct answer (HTML / LaTeX)"
                    validationError={validationErrors.sampleAnswer}
                    editorClassName={`min-h-[120px] text-gray-900 bg-gray-50 resize-none border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none ${validationErrors.sampleAnswer ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                      }`}
                    editorDataProps={{ 'data-sample-answer-textarea': '' }}
                  />
                </div>

                {/* Key Points - only for written-response questions */}
                {questionType === "written-response" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                          <List className="w-4 h-4 text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Key Points</h3>
                      </div>

                    </div>

                    <div className="space-y-3">
                      {editingKeyPoints.map((point, index) => (
                        <div key={index} className="relative flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          {/* <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 mt-1">
                            {index + 1}
                          </div> */}
                          <div className="flex-1">
                            <RichHtmlLatexField
                              initialHtml={point}
                              remountKey={`${refreshKey}-kp-${index}-${selectedQuestion?.id ?? selectedQuestion?.questionid ?? ''}`}
                              // editLabel={`Edit key point ${index + 1} (HTML / LaTeX)`}
                              validationError={validationErrors.keyPoints[index]}
                              editorClassName={`w-full min-h-[60px] bg-white resize-none border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none ${validationErrors.keyPoints[index] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                                }`}
                              editorDataProps={{ 'data-key-point-textarea': '', 'data-key-point-index': index }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : isFillBlankQuestion(selectedQuestion) || questionType === "fill-blank" || questionType === "select-blank" ? (
              <>
                {/* Options (Select the Blank / Fill In the Blank Dropdown) */}
                {(() => {
                  const q: any = selectedQuestion || {};
                  const dropdownOptionsRaw = getDropdownOptionsFromQuestion(q);
                  const dropdownOptions = (dropdownOptionsRaw.length > 0) ? dropdownOptionsRaw : (Array.isArray(q.values) && q.values.length > 0 ? q.values : (Array.isArray(q.options) && q.options.length > 0 ? q.options : []));
                  const isDropdownQuestion = isFillBlankDropdownQuestion(q) || questionType === 'select-blank';
                  if (!isDropdownQuestion || dropdownOptions.length === 0) return null;

                  const correctRaw = String(q.CorrectAnswer || q.correctanswer || q.answer || '').replace(/^[A-Da-d]\.\s*/, '').trim();
                  const correctIndex = dropdownOptions.findIndex((option: string) => typeof option === 'string' && option.trim().toLowerCase() === correctRaw.toLowerCase());

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                          <Target className="w-4 h-4 text-purple-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Options</h3>
                      </div>
                      <div className="space-y-4">
                        {dropdownOptions.map((optRaw: any, i: number) => {
                          const opt = String(optRaw ?? '').trim();
                          const isCorrect = i === correctIndex;
                          return (
                            <div
                              key={`${opt}-${i}`}
                              onClick={() => {
                                if (setSelectedQuestion) {
                                  const newText = opt.trim();
                                  setSelectedQuestion((prev: any) => ({
                                    ...prev,
                                    CorrectAnswer: newText,
                                    correctanswer: newText,
                                    answer: newText
                                  }));
                                  setHasUnsavedChanges(true);
                                }
                              }}
                              className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${isCorrect ? 'border-2 border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'}`}>
                              <div className="flex-1 mt-1">
                                <div className={`${isCorrect ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                                  <LatexRenderer content={opt} />
                                </div>
                              </div>
                              {isCorrect && (
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 flex-shrink-0 mt-1">
                                  <Check className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Correct Answer */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Correct Answer</h3>
                  </div>

                  {(isFillBlankDropdownQuestion(selectedQuestion) || questionType === 'select-blank') ? (() => {
                    // Dropdown questions take their correct answer from the option list above,
                    // so it is shown read-only here rather than as a free-text editor.
                    const correctVal = String((selectedQuestion?.CorrectAnswer || selectedQuestion?.correctanswer || selectedQuestion?.answer || '')).replace(/^[A-Da-d]\.\s*/, '').trim();
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
                  })() : (
                    <RichHtmlLatexField
                      initialHtml={(function () {
                        if (!selectedQuestion) {
                          return "Sample answer for fill in the blank";
                        }
                        const ca =
                          selectedQuestion.CorrectAnswer ||
                          selectedQuestion.correctanswer ||
                          selectedQuestion.answer ||
                          "";
                        const txt = String(ca);
                        return txt ? txt.replace(/^[A-D]\.\s*/, "") : "Sample answer for fill in the blank";
                      })()}
                      remountKey={`${refreshKey}-fib-ca-${selectedQuestion?.id ?? selectedQuestion?.questionid ?? ''}`}
                      // editLabel="Edit correct answer (HTML / LaTeX)"
                      validationError={validationErrors.correctAnswer}
                      editorClassName={`min-h-[120px] text-gray-900 bg-gray-50 border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none ${validationErrors.correctAnswer ? "border-red-500 focus:border-red-500" : "border-gray-200"
                        }`}
                      editorDataProps={{ 'data-correct-answer-textarea': '' }}
                    />
                  )}
                </div>

                {/* Feedback */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Feedback</h3>
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const q = selectedQuestion || {};
                      const isDropdownQuestion = isFillBlankDropdownQuestion(q) || questionType === 'select-blank';

                      if (isDropdownQuestion) {
                        const dropdownOptions = getDropdownOptionsFromQuestion(q);
                        const correctRaw = String(q.CorrectAnswer || q.correctanswer || q.answer || '').replace(/^[A-Da-d]\.\s*/, '').trim().toLowerCase();

                        // Select the Blank carries a single feedback — the correct answer's —
                        // because that is all the generator produces for it. Rendering one box
                        // per dropdown option therefore left every distractor permanently blank,
                        // so only the correct answer's feedback is edited here. A distractor that
                        // does have stored feedback still gets its own box, so nothing already
                        // saved becomes unreachable.
                        const keyFor = (i: number) => `FeedbackOption${String.fromCharCode(65 + i)}`;
                        const hasFeedback = (i: number) => String(q[keyFor(i)] ?? '').trim().length > 0;
                        const matchedIdx = dropdownOptions.findIndex((o: string) => o.trim().toLowerCase() === correctRaw && correctRaw.length > 0);
                        const correctIdx = matchedIdx >= 0 ? matchedIdx : 0;
                        // The generator writes the correct answer's feedback to FeedbackOptionA
                        // whichever option is correct, so fall back to it as the preview does.
                        const correctKey = hasFeedback(correctIdx) ? keyFor(correctIdx) : 'FeedbackOptionA';

                        return dropdownOptions
                          .map((opt: string, i: number) => ({ opt, i }))
                          // `keyFor(i) !== correctKey` stops the SAME feedback being shown
                          // twice: when the correct option has no feedback of its own the box
                          // above borrows FeedbackOptionA, so option A must not also render it
                          // as a distractor — that is the duplicate red/green pair.
                          .filter(({ i }: { i: number }) => i === correctIdx || (hasFeedback(i) && keyFor(i) !== correctKey))
                          .map(({ opt, i }: { opt: string; i: number }) => {
                            // The suffix drives which FeedbackOption* key the save writes back to.
                            const optionLetter = i === correctIdx
                              ? correctKey.replace('FeedbackOption', '')
                              : String.fromCharCode(65 + i);
                            const isCorrect = i === correctIdx;
                            const feedbackKey = i === correctIdx ? correctKey : keyFor(i);
                            const rawFeedback = String(q[feedbackKey] || '');

                            const isCorrectFeedback = rawFeedback.trim().toLowerCase().startsWith('correct.');
                            const isIncorrectFeedback = rawFeedback.trim().toLowerCase().startsWith('incorrect.');
                            const finalIsCorrect = isCorrectFeedback ? true : (isIncorrectFeedback ? false : isCorrect);

                            return (
                              <div key={i} className={`p-4 rounded-lg border ${finalIsCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                <div className="flex gap-3 items-start">
                                  <div className="flex flex-col items-center gap-2 mt-2">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${finalIsCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                      {finalIsCorrect ? (<CheckCircle2 className="w-4 h-4" />) : (<XCircle className="w-4 h-4" />)}
                                    </div>
                                  </div>
                                  <div className="flex-1">
                                    <RichHtmlLatexField
                                      initialHtml={rawFeedback}
                                      remountKey={`${refreshKey}-fibd-fb-${optionLetter}-${selectedQuestion?.id ?? ''}`}
                                      validationError={validationErrors.feedbacks[i]}
                                      editorClassName={`w-full min-h-[80px] bg-white resize-none border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none ${validationErrors.feedbacks[i] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                                        }`}
                                      editorDataProps={{ 'data-feedback-option-suffix': optionLetter }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          });
                      }

                      const fbKeys = Object.keys(q || {}).filter(k => /^FeedbackOption[A-J1-9]/.test(k) && q[k]);
                      if (!fbKeys.length) {
                        return (
                          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                            <RichHtmlLatexField
                              initialHtml=""
                              remountKey={`${refreshKey}-fib-fb-0-${selectedQuestion?.id ?? ''}`}
                              // editLabel="Edit feedback (HTML / LaTeX)"
                              validationError={validationErrors.feedbacks[0]}
                              editorClassName={`w-full min-h-[80px] bg-white resize-none border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none ${validationErrors.feedbacks[0] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                                }`}
                              editorDataProps={{ 'data-fill-blank-feedback-textarea': '', 'data-fill-blank-feedback-index': 0 }}
                            />
                          </div>
                        );
                      }
                      return fbKeys.map((k, i) => {
                        const text = String(q[k] || '').replace(/^\s*Option\s*[A-J1-9]:\s*/i, '').trim();
                        return (
                          <div key={i} className="p-4 bg-50 border border-200 rounded-lg">
                            <RichHtmlLatexField
                              initialHtml={text}
                              remountKey={`${refreshKey}-fib-fb-${i}-${selectedQuestion?.id ?? ''}`}
                              // editLabel="Edit feedback (HTML / LaTeX)"
                              validationError={validationErrors.feedbacks[i]}
                              editorClassName={`w-full min-h-[80px] bg-white resize-none border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none ${validationErrors.feedbacks[i] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                                }`}
                              editorDataProps={{ 'data-fill-blank-feedback-textarea': '', 'data-fill-blank-feedback-index': i }}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Key Points — shown for Select the Blank when the question carries
                    them. Read-only, matching the written-response section, whose edits
                    are not persisted either. */}
                {isFillBlankDropdownQuestion(selectedQuestion) && getStoredKeyPoints(selectedQuestion).length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                        <List className="w-4 h-4 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Key Points</h3>
                    </div>
                    <ul className="space-y-2 list-disc pl-5">
                      {getStoredKeyPoints(selectedQuestion).map((point: string, i: number) => (
                        <li key={i} className="text-gray-800">
                          <span style={{ whiteSpace: 'pre-wrap' }}><LatexRenderer content={point} /></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div>
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <Label className="text-lg font-semibold text-gray-800">Options</Label>
                      <p className="text-sm text-gray-500">Configure answer choices</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(() => {
                      const rawValues = Array.isArray(selectedQuestion?.values) ? selectedQuestion.values as any[] : [];
                      const maxOptions = Math.min(rawValues.length || 0, 10);
                      const letters = Array.from({ length: maxOptions }, (_, i) => String.fromCharCode(65 + i));
                      const values = rawValues.slice(0, maxOptions);
                      return letters.map((option, index) => {
                        const isMR = isMultipleResponse(selectedQuestion);
                        // For single choice, determine correct answer from selectedQuestion.CorrectAnswer
                        const correctAnswerPrefix = selectedQuestion && selectedQuestion.CorrectAnswer ?
                          String(selectedQuestion.CorrectAnswer).charAt(0).toUpperCase() : '';
                        const isSelected = isMR ? editSelectedCorrectLettersMulti.includes(option) : option === correctAnswerPrefix;
                        return (
                          <div key={option} className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${isSelected ? 'bg-green-50 border-green-300 hover:border-green-400' : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}>
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold mt-1 shadow-sm ${isSelected ? 'bg-green-600 text-white border-2 border-green-600' : 'bg-white text-gray-700 border-2 border-gray-300'}`}>
                              {option}
                            </div>
                            {(() => {
                              const optionInitial = (() => {
                                if (values && values[index]) {
                                  const v = values[index];
                                  const s = typeof v === 'string' ? v : (v?.text || v?.value || '');
                                  return String(s).replace(/^[A-Ja-j][\.\)]\s*/, '');
                                }
                                return '';
                              })();
                              const qid = selectedQuestion?.id ?? selectedQuestion?.questionid ?? selectedQuestion?.QuestionID ?? selectedQuestion?.questionguid ?? '';
                              return (
                                <RichHtmlLatexField
                                  initialHtml={optionInitial}
                                  // editLabel={`Edit option ${option} (HTML and LaTeX source)`}
                                  validationError={validationErrors.options[index]}
                                  editorClassName={`w-full min-h-[80px] resize-none focus:border-purple-400 focus:ring-purple-100 rounded-md border px-3 py-2 whitespace-pre-wrap break-words outline-none text-gray-900 bg-white ${validationErrors.options[index] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                                    }`}
                                  remountKey={`${refreshKey}-opt-${option}-${index}-${qid}`}
                                  editorDataProps={{ 'data-option-textarea': '' }}
                                />
                              );
                            })()}
                            {(() => {
                              // Image generated for this option; the staged set wins while a
                              // regeneration is unsaved.
                              const optionText = typeof values[index] === 'string'
                                ? values[index]
                                : (values[index]?.text || values[index]?.value || '');
                              const url = findOptionImageUrl(
                                stagedOptionImages ?? getOptionImages(selectedQuestion), index, optionText,
                              );
                              if (!url) return null;
                              return (
                                <RepoImage
                                  src={url}
                                  alt={`Option ${option} illustration`}
                                  className="w-24 h-24 object-contain rounded-lg border border-gray-300 bg-white shadow-sm flex-shrink-0 mt-1"
                                />
                              );
                            })()}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Correct Answer */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Target className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <Label className="text-lg font-semibold text-gray-800">Correct Answer(s)</Label>
                      <p className="text-sm text-gray-500">{isMultipleResponse(selectedQuestion) ? 'Select one or more correct options' : 'Select the correct option'}</p>
                    </div>
                  </div>

                  {isMultipleResponse(selectedQuestion) ? (
                    <div className="space-y-3">
                      {(() => {
                        const count = Math.min(Array.isArray(selectedQuestion?.values) ? selectedQuestion.values.length : 0, 10);
                        const letters = Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));

                        // Get options with fallbacks
                        const options = Array.isArray(selectedQuestion?.values)
                          ? selectedQuestion.values
                          : selectedQuestion?.Options || selectedQuestion?.options || [];



                        const selectedAnswers = (() => {
                          const correctArray = Array.isArray(selectedQuestion?.CorrectAnswer)
                            ? selectedQuestion.CorrectAnswer
                            : (selectedQuestion?.CorrectAnswer ? [selectedQuestion.CorrectAnswer] : []);

                          return correctArray.map((ans: any) => {
                            const str = String(ans || '').trim();
                            const match = str.match(/^([A-Ja-j])/);
                            const letter = match ? match[1].toUpperCase() : '';
                            const idx = letter ? Math.max(0, letter.charCodeAt(0) - 65) : -1;

                            const option = idx >= 0 ? (options[idx] || {}) : {};
                            const sourceText =
                              typeof option === 'string'
                                ? option
                                : (option.text || option.Text || option.value || option.Value || '');
                            const cleaned = typeof sourceText === 'string'
                              ? sourceText.replace(/^[A-Ja-j][\.\)]\s*/, '')
                              : '';

                            return { letter, text: cleaned };
                          });
                        })();

                        // Get all options text for display
                        const optionCore = letters.map(letter => {
                          const idx = letter.charCodeAt(0) - 65;
                          const option = options[idx] || {};
                          return String(option.text || option.Text || option.value || option.Value || option);
                        });

                        return (
                          <div className="space-y-3">
                            {/* Editable textareas for each selected answer */}
                            {selectedAnswers.map(({ letter, text }, index) => {
                              return (
                                <div key={index} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                                  <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                                    {letter}
                                  </div>
                                  <div className="flex-1">
                                    <RichHtmlLatexField
                                      initialHtml={text ? text : ''}
                                      remountKey={`${refreshKey}-mr-ca-${letter}-${index}-${selectedQuestion?.id ?? ''}`}
                                      // editLabel={`Edit answer for option ${letter} (HTML / LaTeX)`}
                                      validationError={validationErrors.correctAnswers && validationErrors.correctAnswers[letter.charCodeAt(0) - 65]}
                                      editorClassName={`w-full min-h-[80px] resize-none bg-white border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none focus:border-blue-400 focus:ring-blue-100 ${validationErrors.correctAnswers && validationErrors.correctAnswers[letter.charCodeAt(0) - 65] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                                        }`}
                                      editorDataProps={{ 'data-mr-correct-answer-textarea': letter }}
                                      onEditorBlur={(html) => {
                                        const optionEls = Array.from(document.querySelectorAll('[data-option-textarea]'));
                                        const optionPlains = optionEls.map(t => readOptionEditorPlain(t));
                                        const newPlain = htmlToPlain(html).toLowerCase();
                                        const matchedIndex = optionPlains.findIndex(option =>
                                          option.toLowerCase() === newPlain
                                        );
                                        const newText = html;

                                        if (matchedIndex !== -1) {
                                          const newLetter = String.fromCharCode(65 + matchedIndex);
                                          const newAnswers = [...selectedAnswers];
                                          newAnswers[index] = {
                                            ...newAnswers[index],
                                            letter: newLetter,
                                            text: newText
                                          };

                                          if (setSelectedQuestion) {
                                            setSelectedQuestion(prev => {
                                              const updatedValues = [...(prev.values || [])];
                                              const letterIndex = matchedIndex;
                                              if (updatedValues[letterIndex]) {
                                                updatedValues[letterIndex] = {
                                                  ...updatedValues[letterIndex],
                                                  text: newText,
                                                  Text: newText,
                                                  value: newText,
                                                  Value: newText
                                                };
                                              }

                                              return {
                                                ...prev,
                                                values: updatedValues,
                                                CorrectAnswer: newAnswers.map(a => `${a.letter}. ${a.text}`)
                                              };
                                            });
                                          }
                                        } else {
                                          const newAnswers = [...selectedAnswers];
                                          newAnswers[index] = {
                                            ...newAnswers[index],
                                            text: newText
                                          };

                                          if (setSelectedQuestion) {
                                            setSelectedQuestion(prev => {
                                              const updatedValues = [...(prev.values || [])];
                                              const currentLetter = newAnswers[index].letter;
                                              const letterIndex = currentLetter.charCodeAt(0) - 65;
                                              if (updatedValues[letterIndex]) {
                                                updatedValues[letterIndex] = {
                                                  ...updatedValues[letterIndex],
                                                  text: newText,
                                                  Text: newText,
                                                  value: newText,
                                                  Value: newText
                                                };
                                              }

                                              return {
                                                ...prev,
                                                values: updatedValues,
                                                CorrectAnswer: newAnswers.map(a => `${a.letter}. ${a.text}`)
                                              };
                                            });
                                          }
                                        }
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                            {/* Preserve MR detection for existing code */}
                            <div className="hidden">
                              {letters.map((L) => (
                                <input key={L} type="hidden" value={L} data-correct-answer-checkbox />
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (

                    <div className="space-y-2">
                      <div className="flex items-center gap-4">
                        <Textarea
                          value={selectedQuestion && selectedQuestion.CorrectAnswer ? String(selectedQuestion.CorrectAnswer).charAt(0).toUpperCase() : "A"}
                          rows={1}
                          maxLength={1}
                          readOnly
                          className={`w-24 h-12 resize-none text-center uppercase bg-gray-100 cursor-not-allowed ${validationErrors.correctAnswer ? 'border-red-500' : 'border-gray-200'
                            }`}
                          data-correct-answer-select
                          title="Not editable"
                          placeholder="A"
                        />

                        <div className="flex-1">
                          <RichHtmlLatexField
                            initialHtml={(() => {
                              if (!selectedQuestion || !selectedQuestion.CorrectAnswer) return '';
                              const correctAnswerStr = String(selectedQuestion.CorrectAnswer);
                              const correctOption = selectedQuestion?.CorrectAnswer;
                              if (correctOption) {
                                const text = typeof correctOption === 'string'
                                  ? correctOption.replace(/^[A-Ja-j][\.)]?\s*/, '').trim()
                                  : (correctOption?.text || correctOption?.Text || correctOption?.value || correctOption?.Value || '');
                                return String(text);
                              }
                              return correctAnswerStr.replace(/^[A-Ja-j][\.)]?\s*/, '').trim();
                            })()}
                            remountKey={`${refreshKey}-mc-ca-${selectedQuestion?.id ?? selectedQuestion?.questionid ?? ''}`}
                            // editLabel="Edit selected answer (HTML / LaTeX)"
                            validationError={validationErrors.correctAnswer}
                            editorClassName={`w-full min-h-[80px] resize-none border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none focus:border-purple-400 focus:ring-purple-100 ${validationErrors.correctAnswer ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                              }`}
                            editorDataProps={{ 'data-correct-answer-textarea': '' }}
                            onEditorBlur={(html) => {
                              const newText = html;
                              const optionTextareas = document.querySelectorAll('[data-option-textarea]');
                              const optionPlains = Array.from(optionTextareas).map(el => readOptionEditorPlain(el));
                              const newPlain = htmlToPlain(newText).toLowerCase();
                              const matchedIndex = optionPlains.findIndex(option =>
                                option.toLowerCase() === newPlain
                              );
                              let newPrefix = "A";
                              if (matchedIndex !== -1) {
                                newPrefix = String.fromCharCode(65 + matchedIndex);
                              } else {
                                newPrefix = selectedQuestion && selectedQuestion.CorrectAnswer ?
                                  String(selectedQuestion.CorrectAnswer).charAt(0).toUpperCase() : "A";
                              }
                              if (setSelectedQuestion) {
                                setSelectedQuestion(prev => ({
                                  ...prev,
                                  CorrectAnswer: newPrefix + '. ' + newText
                                }));
                              }
                            }}
                          />
                        </div>
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
                      <Label className="text-lg font-semibold text-gray-800">Feedback</Label>
                      <p className="text-sm text-gray-500">Provide explanations for each option</p>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {(() => {
                      const isTF = (
                        questionType === 'true-false' ||
                        String(selectedQuestion?.QuestionType || '').toLowerCase().includes('true') ||
                        ((selectedQuestion?.values || []).length > 0 && (selectedQuestion?.values || []).length <= 2)
                      );
                      const count = isTF ? 2 : Math.min(Array.isArray(selectedQuestion?.values) ? selectedQuestion.values.length : 4, 10);
                      const letters = Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
                      return letters.map((option, index) => {
                        const feedbackKey = `FeedbackOption${option}`;
                        const defaultFeedbacks = (isTF)
                          ? [
                            'Correct. The statement is true.',
                            'Incorrect. The statement is false.'
                          ]
                          : Array.from({ length: count }, (_, i) =>
                            `${letters[i] === (String(selectedQuestion?.CorrectAnswer || '').toUpperCase().charAt(0)) ? 'Correct.' : 'Incorrect.'} Explain why option ${letters[i]} is ${letters[i] === (String(selectedQuestion?.CorrectAnswer || '').toUpperCase().charAt(0)) ? 'right' : 'not right'}.`
                          );
                        const fullFeedback = selectedQuestion && selectedQuestion[feedbackKey] ? selectedQuestion[feedbackKey] : (defaultFeedbacks[index] || '');
                        // Split into prefix (Correct./Incorrect.) and suffix
                        const match = fullFeedback.trim().match(/^(Correct\.|Incorrect\.)\s*(.*)$/i);
                        const prefix = match ? match[1] : '';
                        const suffix = match ? match[2] : fullFeedback;

                        const isMR = isMultipleResponse(selectedQuestion);
                        // For single choice, determine correct answer from selectedQuestion.CorrectAnswer
                        const correctAnswerPrefix = selectedQuestion && selectedQuestion.CorrectAnswer ?
                          String(selectedQuestion.CorrectAnswer).charAt(0).toUpperCase() : '';
                        const isSelected = isMR ? editSelectedCorrectLettersMulti.includes(option) : option === correctAnswerPrefix;
                        return (
                          <div key={option} className={`p-4 rounded-lg border ${isSelected ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
                            <Label className="text-sm font-semibold text-gray-800 mb-3 block flex items-center gap-2">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isSelected ? 'bg-green-600 text-white border border-green-600' : 'bg-white text-gray-800 border border-gray-300'}`}>
                                {option}
                              </span>
                              Option {option} Feedback
                            </Label>
                            <div className="flex gap-3 items-start">
                              <div data-feedback-prefix={option} className={`min-w-[110px] text-sm font-medium p-2 rounded ${isSelected ? 'text-green-700 bg-green-100 border border-green-200' : 'text-red-700 bg-red-100 border border-red-200'}`}>
                                {isSelected ? 'Correct.' : 'Incorrect.'}
                              </div>
                              <RichHtmlLatexField
                                initialHtml={suffix}
                                remountKey={`${refreshKey}-fb-suf-${option}-${selectedQuestion?.id ?? ''}`}
                                previewLabel="Preview"
                                // editLabel="Edit feedback (HTML / LaTeX)"
                                validationError={validationErrors.feedbacks[index]}
                                editorClassName={`flex-1 min-h-[80px] w-full resize-none border rounded-md px-3 py-2 whitespace-pre-wrap break-words outline-none focus:border-orange-400 focus:ring-orange-100 bg-white ${validationErrors.feedbacks[index] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                                  }`}
                                editorDataProps={{ 'data-feedback-option-suffix': option }}
                              />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
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
                    {isStudyLOEnabled && (<p className="break-words"><strong>Study:</strong> {sessionStorage.getItem('selectedChapterName') || sessionStorage.getItem('selectedChapter') || 'N/A'}</p>)}
                    <p className="break-words"><strong>Source:</strong> {sessionStorage.getItem("selectedGenerationMode") || selectedQuestion?.source || 'N/A'}</p>
                    {!isSSO && (<p className="break-words"><strong>Taxonomy:</strong> {sessionStorage.getItem("selectedTaxonomy") || selectedQuestion?.taxonomy || 'N/A'}</p>)}
                    {isSSO && (<p className="break-words"><strong>Classification:</strong> {sessionStorage.getItem("selectedTaxonomy") || selectedQuestion?.taxonomy || 'N/A'}</p>)}
                    {!isSSO && (<p className="break-words"><strong>User Name:</strong> {JSON.parse(sessionStorage.getItem("userInfo") || '{}').username || selectedQuestion?.userName || 'N/A'}</p>)}
                  </div>
                  {/* Column 2 */}
                  <div className="space-y-4">
                    <p className="break-words"><strong>Marks:</strong> {sessionStorage.getItem('pointValue')}</p>
                    {!isSSO && (<p className="break-words"><strong>Book Name:</strong> {sessionStorage.getItem("bookTitle") || 'N/A'}</p>)}
                    {isStudyLOEnabled && (<p className="break-words"><strong>Learning Objective:</strong> {sessionStorage.getItem('learningObjectivesName') || 'N/A'}</p>)}
                    {!isSSO && (<p className="break-words"><strong>Creativity Level:</strong> {sessionStorage.getItem("selectedCreativityLevel") || selectedQuestion?.creativitylevelname || 'N/A'}</p>)}
                    {isSSO && (<p className="break-words"><strong>Complexity:</strong> {sessionStorage.getItem("selectedCreativityLevel") || selectedQuestion?.creativitylevelname || 'N/A'}</p>)}
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
              className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                className="flex items-center gap-2" title="Cancel">
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button
                onClick={handleSaveChanges}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" title="save">
                <Check className="w-4 h-4" />
                Save Changes
              </Button>
            </div>
          </div>

          {/* Validation Message Display */}
          {validationMessage.text && (
            <div className={`mt-4 p-4 rounded-lg border ${validationMessage.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
              }`}>
              <div className="flex items-start gap-2">
                {validationMessage.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{validationMessage.text}</p>
                  {validationMessage.details && (
                    <div className="mt-2 space-y-2">
                      {validationMessage.details.reasoning && (
                        <p className="text-sm opacity-90">{validationMessage.details.reasoning}</p>
                      )}
                      {validationMessage.details.items && validationMessage.details.items.length > 0 && (
                        <div className="text-sm">
                          <p className="font-medium mb-1">Validation Details:</p>
                          {validationMessage.details.items.map((item, index) => (
                            <div key={index} className="flex items-center gap-2 py-1">
                              <span className={`w-2 h-2 rounded-full ${item.status === 'PASS' ? 'bg-green-500' : 'bg-red-500'
                                }`} />
                              <span>{item.item}: {item.details}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {validationMessage.details.conclusion && (
                        <p className="text-sm font-medium mt-2">Conclusion: {validationMessage.details.conclusion}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {showKeyboard && isEditDialogOpen && createPortal(
            <VirtualMathKeyboard onClose={() => setShowKeyboard(false)} />,
            document.body
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent key={refreshKey} className="max-w-4xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader className="pb-6 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <Eye className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-gray-900">
                  {questionType === 'matrix'
                    ? 'Preview Matrix'
                    : (isTrueFalseQuestion(selectedQuestion) || questionType === 'true-false'
                      ? 'Preview True False'
                      : ((isFillBlankDropdownQuestion(selectedQuestion) || questionType === 'select-blank') && questionType !== 'fill-blank'
                        ? 'Preview Select the Blank'
                        : (isFillBlankQuestion(selectedQuestion)
                          ? 'Preview Fill in the Blank'
                          : (isMultipleResponse(selectedQuestion))
                            ? 'Preview Multiple Response'
                            : (questionType === 'written-response'
                              ? 'Preview Written Response'
                              : 'Preview Multiple Choice'))))}
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  {questionType === 'matrix'
                    ? 'Review the complete matrix question with rows, columns, correct selections, and feedbacks.'
                    : (isTrueFalseQuestion(selectedQuestion) || questionType === 'true-false'
                      ? 'Review the true/false question, including the selected correct option.'
                      : (isFillBlankDropdownQuestion(selectedQuestion) || questionType === 'select-blank'
                        ? 'Review the select-the-blank question with the correct option and feedback.'
                        : (isFillBlankQuestion(selectedQuestion)
                          ? 'Review the fill-in-the-blank question with the correct answer and feedback.'
                          : (questionType === 'written-response'
                            ? 'Review the complete written response question with Correct Answer, key points, and metadata details.'
                            : 'Review the complete question with all options, feedback and metadata details.'))))}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-8 py-6">
            {/* Question Stem */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Question Stem:</h3>
              </div>

              {/* Passage tabs for MULTI_TAB_PASSAGE — full-width pill switcher */}
              {getQuestionTabs(selectedQuestion).length > 0 && (() => {
                const tabsList = getQuestionTabs(selectedQuestion);
                const cardKey = 'preview-modal';
                const activeIdx = activePassageTab[cardKey] ?? 0;
                const safeIdx = Math.min(activeIdx, tabsList.length - 1);
                const activeTabObj = tabsList[safeIdx] || {};
                const getTitle = getTabTitle;
                const getPassage = getTabPassage;

                return (
                  <div className="w-full mb-4">
                    <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-1">
                      {tabsList.map((tab: any, tIdx: number) => {
                        const isActive = tIdx === safeIdx;
                        return (
                          <button
                            key={tIdx}
                            type="button"
                            onClick={() => setActivePassageTab(prev => ({ ...prev, [cardKey]: tIdx }))}
                            className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ease-out ${isActive
                              ? 'bg-white text-blue-700 shadow-md shadow-black/5 ring-1 ring-black/5'
                              : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                              }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full transition-colors ${isActive ? 'bg-blue-600' : 'bg-gray-300'}`} />
                              {getTitle(tab, tIdx)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <div className="text-gray-900 text-base leading-relaxed whitespace-pre-line">
                        <LatexRenderer content={getPassage(activeTabObj)} />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Passage Context fallback (single-passage questions) */}
              {(selectedQuestion as any)?.PassageContext && getQuestionTabs(selectedQuestion).length === 0 && (
                <div className="mb-4 p-4 bg-white rounded-lg border border-blue-200 shadow-sm">
                  <h4 className="font-semibold text-blue-800 mb-2">
                    {(selectedQuestion as any)?.TabTitle || 'Passage'}
                  </h4>
                  <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    <LatexRenderer content={(selectedQuestion as any).PassageContext} />
                  </div>
                </div>
              )}

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
                  {(() => {
                    let mainText = String(selectedQuestion ? getCleanStem(selectedQuestion) : "").trim();

                    // Select the Blank: render an inline <select> in place of the gap token
                    // Dropdown-type only: a plain Fill In the Blank must keep a
                    // free-text gap, never a <select>.
                    if (selectedQuestion && isFillBlankDropdownQuestion(selectedQuestion)) {
                      const gapToken = mainText.includes('[Dropdown1]')
                        ? '[Dropdown1]'
                        : (mainText.includes('[Blank1]') ? '[Blank1]' : null);
                      const dropdownOptions = getDropdownOptionsFromQuestion(selectedQuestion);
                      if (gapToken && dropdownOptions.length > 0) {
                        const parts = mainText.split(gapToken);
                        const previewKey = 'preview-modal';
                        return (
                          <span>
                            <LatexRenderer content={parts[0]} />
                            <select
                              className="mx-2 px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              value={fibDropdownSelections[previewKey] ?? ''}
                              onChange={(e) => setFibDropdownSelections(prev => ({ ...prev, [previewKey]: e.target.value }))}
                            >
                              <option value="" disabled>-- Select an option --</option>
                              {dropdownOptions.map((opt: string, i: number) => (
                                <option key={i} value={opt}>{opt}</option>
                              ))}
                            </select>
                            <LatexRenderer content={parts.slice(1).join(gapToken)} />
                          </span>
                        );
                      }
                    }
                    return <LatexRenderer content={mainText} />;
                  })()}
                </div>

                {getTableAnalysis(selectedQuestion) && (() => {
                  const tableData = getTableAnalysis(selectedQuestion)!;
                  const indexedRows = tableData.Rows.map((row, originalIndex) => ({ originalIndex, row }));
                  const colIndex = tableData.Columns.indexOf(editTableSortColumn);
                  const sortedIndexedRows = editTableSortColumn === 'S.no' || colIndex === -1
                    ? indexedRows
                    : [...indexedRows].sort((a, b) => {
                      const av = a.row[colIndex]; const bv = b.row[colIndex];
                      const an = Number(av); const bn = Number(bv);
                      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
                      return String(av).localeCompare(String(bv));
                    });

                  return (
                    <div className="mt-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-sm font-semibold text-gray-800">Sort By :</label>
                        <select
                          value={editTableSortColumn}
                          onChange={(e) => setEditTableSortColumn(e.target.value)}
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
                              {tableData.Columns.map((col, colIdx) => (
                                <th key={colIdx} className="border border-gray-300 p-2 text-center font-semibold text-gray-800">
                                  <span className="font-semibold text-gray-700">{col}</span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {sortedIndexedRows.map(({ originalIndex, row }) => (
                              <tr key={originalIndex}>
                                {row.map((cell, cellIdx) => (
                                  <td key={cellIdx} className="border border-gray-300 p-2 text-center text-gray-700">
                                    <span className={cellIdx === 0 ? "font-medium text-gray-600" : "text-sm text-gray-800"}>
                                      {cell}
                                    </span>
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

                {/* PartPrompt (Bolded question piece) for Preview Modal */}
                {((selectedQuestion as any)?.PartPrompt || (selectedQuestion as any)?.raw?.PartPrompt) && getQuestionTabs(selectedQuestion).length === 0 && !(Array.isArray((selectedQuestion as any)?.values) && (selectedQuestion as any).values.length > 0 && !isFillBlankQuestion(selectedQuestion) && !getTableAnalysis(selectedQuestion)) && !containsStemText(selectedQuestion ? getCleanStem(selectedQuestion) : "", (selectedQuestion as any)?.PartPrompt || (selectedQuestion as any)?.raw?.PartPrompt) && !stemAlreadyHasDropdownGap(selectedQuestion) && (
                  <div className="text-base text-gray-900 mb-4 mt-3 font-bold">
                    <strong>
                      {(() => {
                        const promptContent = String((selectedQuestion as any)?.PartPrompt || (selectedQuestion as any)?.raw?.PartPrompt || '');

                        // Dropdown-type only - see the note on the stem above.
                        if (isFillBlankDropdownQuestion(selectedQuestion)) {
                          const gapToken = promptContent.includes('[Dropdown1]')
                            ? '[Dropdown1]'
                            : (promptContent.includes('[Blank1]') ? '[Blank1]' : null);
                          const dropdownOptions = getDropdownOptionsFromQuestion(selectedQuestion);

                          if (gapToken && dropdownOptions.length > 0) {
                            const parts = promptContent.split(gapToken);
                            const previewKey = 'preview-modal_prompt';
                            const selectedValue = fibDropdownSelections[previewKey] ?? '';
                            return (
                              <span className="font-normal">
                                <LatexRenderer content={parts[0]} />
                                <select
                                  className="mx-2 px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-normal"
                                  value={selectedValue}
                                  onChange={(e) => setFibDropdownSelections(prev => ({ ...prev, [previewKey]: e.target.value }))}
                                >
                                  <option value="" disabled>-- Select an option --</option>
                                  {dropdownOptions.map((opt: string, i: number) => (
                                    <option key={i} value={opt}>{opt}</option>
                                  ))}
                                </select>
                                <LatexRenderer content={parts.slice(1).join(gapToken)} />
                              </span>
                            );
                          }
                        }
                        return <LatexRenderer content={promptContent} />;
                      })()}
                    </strong>
                  </div>
                )}

                {/* Display generated image(s) if available */}
                {(() => {
                  const committed = Array.isArray((selectedQuestion as any)?.generatedImages) && (selectedQuestion as any).generatedImages.length
                    ? (selectedQuestion as any).generatedImages
                    : (() => {
                      const s = selectedQuestion ? (selectedQuestion.generatedImageUrl || questionImages.get(selectedQuestion.id)) : '';
                      return s ? [s] : [];
                    })();
                  const imgs = committed.filter((u: string) => u && !u.includes('NOT REQUIRED') && !u.includes('NO_IMAGE_REQUIRED'));
                  if (imgs.length === 0) return null;

                  return (
                    <div className="mt-4 flex flex-wrap gap-3 justify-center">
                      {imgs.map((src: string, i: number) => (
                        <RepoImage
                          key={i}
                          src={src}
                          alt={`Question illustration ${i + 1}`}
                          className="max-w-full h-auto rounded-lg border border-gray-300 shadow-sm"
                          style={{ maxHeight: '300px' }}
                        />
                      ))}
                    </div>
                  );
                })()}

                {/* Show loading state for image generation */}
                {/* {selectedQuestion && selectedQuestion.id && isGeneratingImages && !questionImages.get(selectedQuestion.id) && (
                  <div className="mt-4 flex flex-col items-center">
                    <div className="text-sm text-gray-600 mb-2">Generating image...</div>
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )} */}
              </div>
            </div>

            {questionType === 'matrix' ? (
              <div className="space-y-8">
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-300 border-collapse" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 p-2 text-left" style={{ width: '25%' }}></th>
                        {(((selectedQuestion as any)?.columns) || []).map((col: any, colIndex: number) => (
                          <th key={colIndex} className="border border-gray-300 p-2 text-center"><LatexRenderer content={col?.text || col?.value || `Col ${colIndex + 1}`}></LatexRenderer></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(((selectedQuestion as any)?.rows) || []).map((row: any, rowIndex: number) => (
                        <tr key={rowIndex}>
                          <td className="border border-gray-300 p-2"><LatexRenderer content={row?.text || row?.value || `Row ${rowIndex + 1}`}></LatexRenderer></td>
                          {(((selectedQuestion as any)?.columns) || []).map((col: any, colIndex: number) => (
                            <td key={colIndex} className="border border-gray-300 p-2 text-center">
                              <input
                                type="radio"
                                name={`preview-matrix-row-${rowIndex}`}
                                className="accent-blue-600 pointer-events-none"
                                checked={(() => {
                                  // Prefer edit state answers when available (mirrors edit dialog behavior)
                                  let ca: any[] | undefined = Array.isArray((matrixEdit as any)?.answers) ? (matrixEdit as any)?.answers : undefined;
                                  if (!ca || ca.length === 0) {
                                    // Normalize CorrectAnswer to an array of per-row selections
                                    const rawCA = (selectedQuestion as any)?.CorrectAnswer ?? (selectedQuestion as any)?.answers ?? (selectedQuestion as any)?.correct;
                                    ca = Array.isArray(rawCA) ? rawCA : [];
                                    if (!Array.isArray(rawCA) && rawCA && typeof rawCA === 'object') {
                                      // Support shapes like { answers: [...], correct: [...], indices: [...], value: [...] }
                                      const obj = rawCA as any;
                                      ca = Array.isArray(obj.answers) ? obj.answers
                                        : Array.isArray(obj.correct) ? obj.correct
                                          : Array.isArray(obj.indices) ? obj.indices
                                            : Array.isArray(obj.value) ? obj.value
                                              : ca;
                                    }
                                  }
                                  if (!Array.isArray(ca) || typeof rowIndex !== 'number') return false;
                                  const picked = ca[rowIndex];
                                  const cols = (selectedQuestion as any)?.columns || [];
                                  const colObj = cols[colIndex];
                                  const colVal = (typeof colObj === 'string') ? colObj : (colObj?.value ?? colObj?.text);

                                  // Accept: exact index (number), numeric-string index, 1-based numeric index, value/text match, or letter mapping
                                  // exact index
                                  if (picked === colIndex) return true;

                                  // numeric string index e.g. "0", "1"
                                  if (typeof picked === 'string' && /^\d+$/.test(picked) && Number(picked) === colIndex) return true;

                                  // 1-based numeric index (number or numeric-string)
                                  if ((typeof picked === 'number' && picked - 1 === colIndex) ||
                                    (typeof picked === 'string' && /^\d+$/.test(picked) && Number(picked) - 1 === colIndex)) return true;

                                  // value/text match
                                  if (colVal != null && (picked === colVal)) return true;

                                  // letter mapping or direct text/value equality
                                  if (typeof picked === 'string') {
                                    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                                    const letterIdx = letters.indexOf(picked.toUpperCase());
                                    if (letterIdx === colIndex) return true;
                                    // Also allow matching to column text/value
                                    if ((colObj?.text && picked === colObj.text) || (colObj?.value && picked === colObj.value)) return true;
                                  }
                                  return false;
                                })()}
                                readOnly
                                tabIndex={-1}
                                aria-disabled="true"
                                onClick={(e) => e.preventDefault()}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={(((selectedQuestion as any)?.columns) || []).length + 1} className="border-t border-gray-300 p-0"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {/* Matrix Row Preview: Row value, Correct response, Feedback */}
                {Array.isArray((selectedQuestion as any)?.rows) && ((selectedQuestion as any)?.rows.length > 0) && (
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

                    <div className="space-y-4">
                      {(((selectedQuestion as any)?.rows) || []).map((row: any, rowIndex: number) => {
                        const rowLabel = row?.text || row?.value || `Row ${rowIndex + 1}`;

                        // Compute correct response for this row (reuse your existing logic)
                        const correctResponse = (() => {
                          const cols = ((selectedQuestion as any)?.columns || []);
                          // Prefer edit state answers when available
                          let ca: any[] | undefined = Array.isArray((matrixEdit as any)?.answers) ? (matrixEdit as any)?.answers : undefined;
                          if (!ca || ca.length === 0) {
                            const rawCA = (selectedQuestion as any)?.CorrectAnswer ?? (selectedQuestion as any)?.answers ?? (selectedQuestion as any)?.correct;
                            ca = Array.isArray(rawCA) ? rawCA : [];
                            if (!Array.isArray(rawCA) && rawCA && typeof rawCA === 'object') {
                              const obj = rawCA as any;
                              ca = Array.isArray(obj.answers) ? obj.answers
                                : Array.isArray(obj.correct) ? obj.correct
                                  : Array.isArray(obj.indices) ? obj.indices
                                    : Array.isArray(obj.value) ? obj.value
                                      : ca;
                            }
                          }
                          const picked = ca[rowIndex];
                          if (typeof picked === 'number') {
                            const c = cols[picked];
                            return (typeof c === 'string') ? c : (c?.text || c?.value || `Col ${Number(picked) + 1}`);
                          }
                          if (typeof picked === 'string') {
                            const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                            const asIdx = letters.indexOf(picked.toUpperCase());
                            if (asIdx >= 0) {
                              const c = cols[asIdx];
                              return (typeof c === 'string') ? c : (c?.text || c?.value || `Col ${asIdx + 1}`);
                            }
                          }
                          const idx = cols.findIndex((c: any) => {
                            if (typeof c === 'string') return c === picked;
                            return c?.value === picked || c?.text === picked;
                          });
                          const c = cols[idx];
                          return (typeof c === 'string') ? c : (c?.text || c?.value || (idx >= 0 ? `Col ${idx + 1}` : 'N/A'));
                        })();

                        // Feedback for this row (parallel to Feedbacks[index])
                        const fbArray = ((selectedQuestion as any)?.Feedbacks || []) as string[];
                        const rawFeedback = fbArray[rowIndex] || '';
                        const feedbackText = rawFeedback.replace(/^\s*(Correct|Incorrect)[:.]?\s*/i, '');

                        return (
                          <div key={rowIndex} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-start gap-2">
                                <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">Row value:</span>
                                <div className="text-sm text-gray-800 flex-1"><LatexRenderer content={rowLabel}></LatexRenderer></div>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">Correct response:</span>
                                <div className="text-sm text-gray-800 flex-1"><LatexRenderer content={correctResponse}></LatexRenderer></div>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-sm font-semibold text-gray-600 w-28 flex-shrink-0">Feedback:</span>
                                <div className="text-sm text-gray-800 flex-1 min-h-[60px]">
                                  <LatexRenderer content={feedbackText || 'No feedback provided.'}></LatexRenderer>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : questionType === "written-response" ? (
              <>
                {/* Answer */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Correct Answer</h3>
                  </div>

                  <div className="p-6 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-purple-900 font-medium">
                      {(() => {
                        if (!selectedQuestion) return "Speculative risks involve the possibility of gain or loss, making them unsuitable for insurance coverage, which is designed for predictable and measurable risks like pure risks. Pure risks only involve the chance of loss or no loss, allowing insurers to calculate premiums and manage claims effectively.";
                        const ca = selectedQuestion.CorrectAnswer || selectedQuestion.correctanswer || selectedQuestion.answer || "";
                        const txt = String(ca);
                        return <LatexRenderer content={txt.replace(/^[A-D]\.\s*/, '')}></LatexRenderer>;
                      })()}
                    </p>
                  </div>
                </div>

                {/* Key Points */}
                {questionType === "written-response" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                        <List className="w-4 h-4 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Key Points</h3>
                    </div>
                    <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                      <div>
                        {/* <p><strong>Key Points:</strong></p> */}
                        {getKeyPointsFromQuestion(selectedQuestion).length > 0 ? (
                          <ul className="list-style-none">
                            {getKeyPointsFromQuestion(selectedQuestion).map((val, i) => {
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
                {/* Options */}
                {(() => {
                  const q: any = selectedQuestion || {};
                  const isFIB = isFillBlankQuestion(q);
                  const isDropdownBlank = isFillBlankDropdownQuestion(q);
                  // Fill in the Blank hides the Options section.
                  // For Select the Blank, the choices appear in the inline dropdown, 
                  // but we also render them here explicitly in preview mode to mirror edit mode.
                  if (isFIB) {
                    return null;
                  }

                  if (isDropdownBlank) {
                    const dropdownOptionsRaw = getDropdownOptionsFromQuestion(q);
                    const dropdownOptions = (dropdownOptionsRaw.length > 0) ? dropdownOptionsRaw : (Array.isArray(q.values) && q.values.length > 0 ? q.values : (Array.isArray(q.options) && q.options.length > 0 ? q.options : []));
                    if (dropdownOptions.length === 0) return null;

                    const correctRaw = String(q.CorrectAnswer || q.correctanswer || q.answer || '').replace(/^[A-Da-d]\.\s*/, '').trim();
                    const correctIndex = dropdownOptions.findIndex((option: string) => typeof option === 'string' && option.trim().toLowerCase() === correctRaw.toLowerCase());

                    return (
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
                          {dropdownOptions.map((optRaw: any, i: number) => {
                            const opt = String(optRaw ?? '').trim();
                            const isCorrect = i === correctIndex;
                            return (
                              <div
                                key={`${opt}-${i}`}
                                className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${isCorrect ? 'border-2 border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                                <div className="flex-1 mt-1">
                                  <div className={`${isCorrect ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                                    <LatexRenderer content={opt} />
                                  </div>
                                </div>
                                {isCorrect && (
                                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 flex-shrink-0 mt-1">
                                    <Check className="w-4 h-4" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return (
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
                        {selectedQuestion && selectedQuestion.values && Array.isArray(selectedQuestion.values) && selectedQuestion.values.length > 0 ? (
                          selectedQuestion.values.map((option, i) => {
                            const optionLetter = String.fromCharCode(65 + i);
                            const isCorrect = checkIsOptionCorrect(selectedQuestion, optionLetter, i, option);
                            const optionText = typeof option === 'string' ? option : (option?.text || '');
                            // Image generated for this option (Multiple Choice / Multiple Response).
                            const optionImageUrl = findOptionImageUrl(getOptionImages(selectedQuestion), i, optionText);

                            return (
                              <div key={i} className={`flex items-start gap-4 p-4 rounded-lg border ${isCorrect ? 'border-2 border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                                } transition-colors`}>
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 mt-1 ${isCorrect ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-white border border-gray-300 text-gray-700'
                                  } shadow-sm`}>
                                  {optionLetter}
                                </div>
                                <div className="flex-1 whitespace-pre-wrap break-words">
                                  <div className={`${isCorrect ? 'text-gray-900' : 'text-gray-700'}`}>
                                    <LatexRenderer content={typeof option === 'string' ? option.replace(/^[A-Ja-j][\.\)]\s*/, '') : option.text || ''} />
                                  </div>
                                  {optionImageUrl && (
                                    <RepoImage
                                      src={optionImageUrl}
                                      alt={`Option ${optionLetter} illustration`}
                                      className="mt-3 max-w-full h-auto rounded-lg border border-gray-300 shadow-sm"
                                      style={{ maxHeight: '180px' }}
                                    />
                                  )}
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
                          <div className="text-center py-4 text-gray-500">No options available</div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Correct Answer */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Target className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">Correct Answer:</h3>
                      <p className="text-sm text-gray-500">The correct option with explanation</p>
                    </div>
                  </div>

                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="text-purple-900 font-medium">
                      {(() => {
                        if (!selectedQuestion) return 'No correct answer specified';
                        const q: any = selectedQuestion;
                        const isFIB = isFillBlankQuestion(q);
                        if (isFIB) {
                          // For FIB: bind answer from CorrectAnswer text, falling back to values[0],
                          // stripping any leading labels. Select the Blank arrives with
                          // DropdownOptions and no `values`, so this must tolerate values being absent.
                          const preferred = [q.CorrectAnswer || q.answer || q.correctanswer].filter(Boolean);
                          const answers = preferred.length ? preferred : (Array.isArray(q.values) ? q.values : []);
                          const first = answers[0];
                          const raw = String(typeof first === 'string' ? first : (first?.text || first?.value || ''));
                          const text = raw.replace(/^[A-Ja-j]\s*[\.)\-:]+\s+/, '').trim();
                          return <LatexRenderer content={text || 'No correct answer specified'}></LatexRenderer>;
                        }
                        const options: string[] = Array.isArray(q.values) ? q.values.map((o: any) => (typeof o === 'string' ? o : (o?.text || o?.value || ''))) : [];
                        const optionCore = options.map((o) => String(o).replace(/^[A-Ja-j][\.\)]\s*/, '').trim());
                        const correctSet = (() => {
                          if (Array.isArray(q?.CorrectAnswer)) {
                            return new Set(
                              q.CorrectAnswer
                                .map((s: any) => String(s || '').trim())
                                .map((s: string) => (s.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase())
                                .filter(Boolean)
                            );
                          }
                          if (q?.ItemScoring && typeof q.ItemScoring.Marking === 'string') {
                            return new Set(
                              q.ItemScoring.Marking
                                .split(',')
                                .join(',')  // First split by comma
                                .replace(/&/g, ',')  // Then replace all & with ,
                                .split(',')  // Split again to handle any new commas
                                .map((s: string) => s.trim().replace(/\.$/, '').toUpperCase())
                                .filter(Boolean)
                            );
                          }

                          // 🔹 Move this block BEFORE q.marks
                          const caRaw = String(q?.CorrectAnswer || q?.answer || '');
                          const letter = (caRaw.match(/^([A-Ja-j])/)?.[1] || '').toUpperCase();
                          if (letter) {
                            return new Set([letter]);
                          }

                          if (q?.marks && typeof q.marks === 'object') {
                            return new Set(
                              Object.entries(q.marks)
                                .filter(([_, val]) => Number(val) > 0)
                                .map(([key]) => String(key).toUpperCase())
                            );
                          }

                          return new Set(); // fallback empty set
                        })();

                        const letters = Array.from(correctSet) as string[];
                        if (!letters.length) return 'No correct answer specified';
                        const parts = letters.map((L) => {
                          const idx = 'ABCDEFGHIJ'.indexOf(L as string);
                          const text = idx >= 0 && idx < optionCore.length ? optionCore[idx] : '';
                          return `${L}. ${text}`.trim();
                        }).filter(Boolean);
                        return (
                          <div className="mt-2 space-y-1 ml-0">
                            {parts.map((p, i) => (<div key={i}><LatexRenderer content={p}></LatexRenderer></div>))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Feedback */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">Feedback</h3>
                      <p className="text-sm text-gray-500">Explanations for each option</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(() => {
                      const q: any = selectedQuestion || {};
                      const isFIB = isFillBlankQuestion(q);

                      // Select the Blank: show only the feedback for the correct option,
                      // matching the compact card layout (no per-option list).
                      if (isFillBlankDropdownQuestion(q) || questionType === 'select-blank') {
                        const dropdownOptions = getDropdownOptionsFromQuestion(q);
                        const correctRaw = String(q.CorrectAnswer || q.correctanswer || q.answer || '').replace(/^[A-Da-d]\.\s*/, '').trim().toLowerCase();
                        const correctIdx = dropdownOptions.findIndex((o: string) => String(o).trim().toLowerCase() === correctRaw);
                        const letterFeedback = correctIdx >= 0
                          ? q[`FeedbackOption${String.fromCharCode(65 + correctIdx)}`]
                          : '';
                        const feedbackText = letterFeedback || q.FeedbackOptionA || q.FeedbackOption1 || '';
                        if (!feedbackText) return (<div className="text-gray-500">No feedback provided.</div>);
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
                      }

                      if (isFIB) {
                        // For FIB: show consolidated feedback without "Option X:" prefixes
                        const fbKeys = Object.keys(q || {}).filter(k => /^FeedbackOption[A-J1-9]/.test(k) && q[k]);
                        if (!fbKeys.length) return (<div className="text-gray-500">No feedback provided.</div>);
                        return fbKeys.map((k, i) => {
                          const text = String(q[k] || '').replace(/^\s*Option\s*[A-J1-9]:\s*/i, '').trim();
                          return (
                            <div key={i} className="p-4 rounded-lg border bg-gray-50 border-gray-200">
                              <div className="text-gray-800"><LatexRenderer content={text}></LatexRenderer></div>
                            </div>
                          );
                        });
                      }
                      // Non-FIB: per-option feedback with correctness styling
                      return (selectedQuestion?.values || []).map((option: any, i: number) => {
                        const optionLetter = String.fromCharCode(65 + i);
                        const isCorrect = checkIsOptionCorrect(selectedQuestion, optionLetter, i, option);
                        let feedback = '';
                        if (isCorrect) {
                          feedback = selectedQuestion[`FeedbackOption${optionLetter}`] || ' ';
                        } else {
                          feedback = selectedQuestion[`FeedbackOption${optionLetter}`] || ' ';
                        }
                        return (
                          <div key={i} className={`p-4 rounded-lg border ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {isCorrect ? (<CheckCircle2 className="w-4 h-4" />) : (<XCircle className="w-4 h-4" />)}
                              </div>
                              <div>
                                <span className="text-sm font-medium text-gray-600">Option {optionLetter}:</span>
                                <div className={`mt-1 ${isCorrect ? 'text-green-800' : 'text-red-800'}`}><LatexRenderer content={feedback}></LatexRenderer></div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Key Points — the written-response view has its own section; this is
                    the branch Select the Blank renders in. It reads the stored value
                    directly because getKeyPointsFromQuestion substitutes a sample list
                    when a question has none. */}
                {isFillBlankDropdownQuestion(selectedQuestion) && getStoredKeyPoints(selectedQuestion).length > 0 && (
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
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
                      {getStoredKeyPoints(selectedQuestion).map((point: string, i: number) => (
                        <li key={i} className="text-gray-800">
                          <span style={{ whiteSpace: 'pre-wrap' }}><LatexRenderer content={point} /></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                    {isStudyLOEnabled && (<p><strong>Study:</strong> {sessionStorage.getItem('selectedChapterName') || sessionStorage.getItem('selectedChapter') || 'N/A'}</p>)}
                    <p><strong>Source:</strong> {sessionStorage.getItem("selectedGenerationMode") || 'N/A'}</p>
                    {/* <p><strong>Study:</strong> {sessionStorage.getItem("studyName") || 'N/A'}</p> */}
                    {!isSSO && (<p><strong>Taxonomy:</strong> {sessionStorage.getItem("selectedTaxonomy") || 'N/A'}</p>)}
                    {isSSO && (<p><strong>Classification:</strong> {sessionStorage.getItem("selectedTaxonomy") || 'N/A'}</p>)}
                    {!isSSO && (<p><strong>User Name:</strong> {JSON.parse(sessionStorage.getItem("userInfo") || '{}').username || 'N/A'}</p>)}
                  </div>
                  {/* Column 2 */}
                  <div className="space-y-4">
                    <p><strong>Marks:</strong> {sessionStorage.getItem('pointValue')}</p>
                    {!isSSO && (<p><strong>Book:</strong> {sessionStorage.getItem("bookTitle") || 'N/A'}</p>)}
                    {isStudyLOEnabled && (<p><strong>Learning Objective:</strong> {sessionStorage.getItem('learningObjectivesName') || 'N/A'}</p>)}
                    {!isSSO && (<p><strong>Creativity Level:</strong> {sessionStorage.getItem("selectedCreativityLevel") || 'N/A'}</p>)}
                    {isSSO && (<p><strong>Complexity:</strong> {sessionStorage.getItem("selectedCreativityLevel") || 'N/A'}</p>)}
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
                onClick={() => setIsPreviewDialogOpen(false)}
                className="flex items-center gap-2"
                title="Close"
              >
                <X className="w-4 h-4" />
                Close Preview
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900">
                  Changes Updated Successfully!
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Your question has been updated.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex justify-end pt-4">
            <Button
              onClick={() => setShowSuccessDialog(false)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Navigation Confirmation Dialog */}
      <Dialog open={showNavigationDialog} onOpenChange={setShowNavigationDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900">
                  Unsaved Changes
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  You have unsaved changes. Do you want to leave without saving?
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={cancelNavigation}
              className="flex items-center gap-2"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmNavigation}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Leave Without Saving
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* SSO-only full-page Save All loader. isSavingAll is never true outside
          SSO mode, so this never renders on the non-SSO path. Portaled to
          document.body so no transformed/overflow ancestor can clip it and it
          always covers the whole viewport. */}
      {isSavingAll && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm"
          role="status"
          aria-live="assertive"
          aria-busy="true"
          // Swallow anything that reaches the overlay while the save is running.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.preventDefault()}
        >
          <div className="relative flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-green-200 border-t-green-600"></div>
            <Database className="h-8 w-8 text-green-600" />
          </div>
          <p className="mt-6 text-lg font-semibold text-gray-800">Saving questions…</p>
          <p className="mt-2 text-sm text-gray-500">
            This may take a moment. Please don’t close or refresh this page.
          </p>
        </div>,
        document.body
      )}
      {/*Save All to DB Dialog*/}
      <Dialog open={showSaveAllDialog} onOpenChange={setShowSaveAllDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${saveAllDialogType === "success" ? "bg-green-100" : saveAllDialogType === "info" ? "bg-blue-100" : "bg-red-100"
                }`}>
                {saveAllDialogType === "success" ? (
                  <Check className="w-6 h-6 text-green-600" />
                ) : saveAllDialogType === "info" ? (
                  <Info className="w-6 h-6 text-blue-600" />
                ) : (
                  <X className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900">
                  {saveAllDialogType === "success" ? "Save Successful!" : saveAllDialogType === "info" ? "Note" : "Save Failed"}
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  {saveAllDialogMessage}
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="flex justify-end pt-4">
            <Button
              onClick={() => {
                setShowSaveAllDialog(false);
                if (isSSO && saveAllDialogType === "success") {
                  navigate('/advanced-question-generator/:bookCode');
                }
              }}
              className={saveAllDialogType === "success"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : saveAllDialogType === "info"
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"}
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/*Delete confirm dialog*/}
      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) setQuestionToDelete(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900">
                  Delete Question
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Are you sure you want to delete this question? This action cannot be undone.
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="flex items-center gap-2"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Delete from the list that is on screen (genResults). It is where the cards get
                // their ids: those ids are made in memory at load and never written back, so the
                // copy in session storage cannot be matched by id (nothing was removed before).
                // The stored copy is only the source when genResults is not an array, as in Regenerate.
                if (questionToDelete) {
                  const source = Array.isArray(genResults) ? genResults : readStoredGeneratedResultsArray();
                  const updatedResults = removeGeneratedQuestion(source, questionToDelete);

                  // Nothing matched -> leave everything as it is rather than rewrite the list.
                  if (updatedResults.length !== source.length) {
                    setGenResults(updatedResults);
                    try { sessionStorage.setItem('questionGenResults', JSON.stringify(updatedResults)); } catch { }
                    setQuestions(prev => prev.filter(item => !isSameGeneratedQuestion(item?.raw, questionToDelete)));
                  }
                }
                setShowDeleteDialog(false);
                setQuestionToDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rating Dialog */}
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
                  <span className="font-semibold">1.</span> {selectedQuestionForRating}
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
                  className="px-6">
                  Submit
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Regenerate Item — pick what to rewrite, with optional guidance */}
      <Dialog open={isRegenerateItemOpen} onOpenChange={(open) => { if (!isRegeneratingItem) setIsRegenerateItemOpen(open); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              Regenerate Item
            </DialogTitle>
            <DialogDescription>
              Choose what to regenerate and provide guidance
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-800">Regeneration Target</Label>
              <div className="space-y-2">
                {([
                  { value: 'question', label: 'Question body only' },
                  { value: 'options', label: 'Options only' },
                  { value: 'both', label: 'Both Question body and options' },
                ] as { value: RegenerateScope; label: string }[]).map(({ value, label }) => (
                  <label
                    key={value}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${regenerateScope === value
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <input
                      type="radio"
                      name="regenerate-scope"
                      className="h-4 w-4 accent-blue-600"
                      value={value}
                      checked={regenerateScope === value}
                      onChange={() => setRegenerateScope(value)}
                      disabled={isRegeneratingItem}
                    />
                    <span className="text-sm text-gray-800">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="regenerate-instruction" className="text-sm font-semibold text-gray-800">
                Instruction which will be considered for generating the questions
              </Label>
              <Textarea
                id="regenerate-instruction"
                placeholder="Enter specific instructions for how you'd like the question to be regenerated…"
                value={regenerateItemInstruction}
                onChange={(e) => setRegenerateItemInstruction(e.target.value)}
                className="min-h-[96px] resize-none"
                disabled={isRegeneratingItem}
              />
            </div>

            {regenerateItemError && (
              <p className="text-sm text-red-600">{regenerateItemError}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setIsRegenerateItemOpen(false)}
              disabled={isRegeneratingItem}
            >
              Cancel
            </Button>
            <Button onClick={handleRegenerateItemSubmit} disabled={isRegeneratingItem}>
              {isRegeneratingItem ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Regenerating…
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </>
              )}
            </Button>
          </div>
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
              <Label htmlFor="instructions" className="text-right">
                Additional Instructions
              </Label>
              <Textarea
                id="instructions"
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
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Select Image from Repository</DialogTitle>
            <DialogDescription>
              Choose an image from Repository.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex gap-4 items-center justify-between">
                <div className="flex gap-4 items-center">
                  <Label>Destination:</Label>
                  <Select value={imageSelectDestination} onValueChange={(val: any) => setImageSelectDestination(val)}>
                    <SelectTrigger className="w-[200px]">
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
                <div className="text-xs text-gray-700 bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col gap-3">
                  <div>
                    <Label className="mb-1 block font-semibold">Book</Label>
                    <Input readOnly value={imageSelectTarget?.bookname || imageSelectTarget?.BookName || sessionStorage.getItem('bookTitle') || 'Book'} className="bg-white h-8 text-xs cursor-default focus-visible:ring-0" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1 block font-semibold">Chapter</Label>
                      <Select value={modalSelectedChapter} onValueChange={setModalSelectedChapter}>
                        <SelectTrigger className="h-8 bg-white text-xs">
                          <SelectValue placeholder="Select Chapter" />
                        </SelectTrigger>
                        <SelectContent>
                          {modalChapters.map((c: any) => (
                            <SelectItem key={String(chapterKeyOf(c))} value={String(chapterKeyOf(c))}>
                              {String(chapterNameOf(c))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-1 block font-semibold">Learning Objective (LO)</Label>
                      <Select value={modalSelectedLO} onValueChange={setModalSelectedLO} disabled={modalSelectedChapter === "all"}>
                        <SelectTrigger className="h-8 bg-white text-xs">
                          <SelectValue placeholder="All LOs" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All LOs</SelectItem>
                          {modalLOs.map((l: any) => (
                            <SelectItem key={String(loKeyOf(l))} value={String(loKeyOf(l))}>
                              {String(loNameOf(l))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select Image(s)</Label>
                  {selectedRepoImages.length > 0 && (
                    <span className="text-xs font-medium text-blue-600">{selectedRepoImages.length} selected</span>
                  )}
                </div>
                <div className="h-[300px] overflow-y-auto border rounded-md p-2 bg-gray-50">
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
    </div>
  )
}

export default AIGQuestionResults
