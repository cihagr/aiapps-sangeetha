import { compressImageDataUrl } from './imageCompression';
import {
  extractGeneratedImage,
  extractOptionImages,
  collectOptionTexts,
  questionTypeWantsOptionImages,
  type OptionImage,
} from './questionImageGeneration';
import axios from 'axios';
import { AGENT_GENERATIVE_API_URL } from './Aigapi';
import { getSessionCustOrgCodes } from './custOrgCodes';

const IMAGE_GENERATION_URL = `${AGENT_GENERATIVE_API_URL}/generate-image`;

/**
 * Helper to format passage and multi-tab passages into readable prompt text.
 */
const formatPassageForPrompt = (passage?: string, tabs?: any[]): string => {
  let result = '';
  if (Array.isArray(tabs) && tabs.length > 0) {
    const formattedTabs = tabs.map((t, idx) => {
      const title = t.TabTitle || t.Title || t.title || t.Name || t.name || `Passage Tab ${idx + 1}`;
      const content = t.Passage || t.passage || t.Content || t.content || '';
      return `[Tab ${idx + 1}: ${title}]\n${content}`;
    }).filter(Boolean).join('\n\n');
    if (formattedTabs.trim()) {
      result += `PASSAGE CONTEXT:\n${formattedTabs.trim()}`;
    }
  } else if (passage && typeof passage === 'string' && passage.trim()) {
    result += `PASSAGE CONTEXT:\n${passage.trim()}`;
  }
  return result;
};

/**
 * Safely extracts table data across all possible property shapes and nested structures.
 */
const extractTableData = (q: any): any => {
  if (!q) return null;

  const rawData =
    q.TableAnalysis || q.tableAnalysis ||
    q.TableData || q.tableData ||
    q.Table || q.table ||
    q.questiondata?.TableAnalysis || q.questiondata?.tableAnalysis ||
    q.AIquestiondata?.TableAnalysis || q.AIquestiondata?.tableAnalysis ||
    q.raw?.[2]?.TableAnalysis || q.raw?.[2]?.tableAnalysis ||
    q?.[2]?.TableAnalysis || q?.[2]?.tableAnalysis ||
    q.data?.TableAnalysis || q.data?.tableAnalysis ||
    q.TableContent || q.tableContent || null;

  if (!rawData) return null;

  if (typeof rawData === 'string') {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      return rawData;
    }
  }

  return rawData;
};

/**
 * Helper to format table data / table analysis into readable prompt text.
 */
const formatTableForPrompt = (tableData?: any): string => {
  if (!tableData) return '';

  let dataObj = tableData;
  if (typeof dataObj === 'string' && dataObj.trim()) {
    try {
      const parsed = JSON.parse(dataObj);
      if (parsed && typeof parsed === 'object') {
        dataObj = parsed;
      } else {
        return `TABLE CONTEXT:\n${dataObj.trim()}`;
      }
    } catch {
      return `TABLE CONTEXT:\n${dataObj.trim()}`;
    }
  }

  if (typeof dataObj === 'object' && dataObj !== null) {
    const columns = dataObj.Columns || dataObj.columns || dataObj.headers || dataObj.Header || dataObj.Headers || [];
    const rows = dataObj.Rows || dataObj.rows || dataObj.data || [];

    let tableStr = '';

    if (Array.isArray(columns) && columns.length > 0) {
      tableStr += columns.map((h: any) => typeof h === 'object' ? (h.title || h.label || JSON.stringify(h)) : String(h)).join(' | ') + '\n';
      tableStr += columns.map(() => '---').join(' | ') + '\n';
    }

    if (Array.isArray(rows) && rows.length > 0) {
      rows.forEach((row: any) => {
        if (Array.isArray(row)) {
          tableStr += row.map((cell: any) => typeof cell === 'object' ? (cell.text || cell.value || JSON.stringify(cell)) : String(cell)).join(' | ') + '\n';
        } else if (typeof row === 'object' && row !== null) {
          tableStr += Object.values(row).map(val => String(val ?? '')).join(' | ') + '\n';
        } else {
          tableStr += String(row) + '\n';
        }
      });
    }

    if (tableStr.trim()) {
      return `TABLE CONTEXT:\n${tableStr.trim()}`;
    }
  }

  return '';
};

/**
 * Generates an image for a question, handling plain text or complex objects with
 * passage, multi-tab passages, table data, study context, and learning objectives.
 */
export const generateImageForQuestion = async (
  questionOrText: string | any,
  study?: string,
  learningObjective?: string,
  passage?: string,
  tableData?: any
): Promise<string | null> => {
  const { imageUrl } = await generateImageForQuestionWithOptions(questionOrText, study, learningObjective, passage, tableData);
  return imageUrl;
};

/**
 * Same call as generateImageForQuestion, and for Multiple Choice / Multiple Response
 * it also returns one image per answer option. Options are taken from the question
 * object; passing plain text gives the question image only.
 */
export const generateImageForQuestionWithOptions = async (
  questionOrText: string | any,
  study?: string,
  learningObjective?: string,
  passage?: string,
  tableData?: any,
  optionsOverride?: string[],
): Promise<{ imageUrl: string | null; optionImages: OptionImage[] }> => {
  try {
    let questionText = '';
    let passageText = passage || '';
    let tableVal = tableData || null;
    let tabsList: any[] = [];
    let studyVal = study || '';
    let loVal = learningObjective || '';

    if (typeof questionOrText === 'object' && questionOrText !== null) {
      const q = questionOrText;
      const qData = q.raw?.[2] || q?.[2] || q.raw || q.questiondata || q.AIquestiondata || q;
      questionText = qData.label || qData.QuestionStatement || qData.Question || qData.text || qData.QuestionText || qData.partPrompt || qData.PartPrompt || q.label || q.QuestionStatement || '';
      passageText = passageText || qData.Passage || qData.passage || qData.PassageText || qData.passagetext || qData.Scenario || qData.scenario || q.Passage || q.passage || '';
      tabsList = Array.isArray(qData.Tabs) ? qData.Tabs : (Array.isArray(qData.tabs) ? qData.tabs : (Array.isArray(q.Tabs) ? q.Tabs : []));
      tableVal = tableVal || extractTableData(q);
      studyVal = studyVal || qData.BookName || qData.study || qData.chapter || qData.bookname || qData.Topic || qData.topic || q.BookName || q.study || '';
      loVal = loVal || qData.EnablingObjective || qData.learningObjective || qData.lo || qData.learningobjective || qData.LearningObjective || q.learningObjective || '';
    } else {
      questionText = String(questionOrText || '');
    }

    questionText = questionText.trim();

    // Deduplicate repetitive half text if needed
    const half1 = questionText.substring(0, Math.floor(questionText.length / 2)).trim();
    const half2 = questionText.substring(Math.floor(questionText.length / 2)).trim();
    if (half1.length > 10 && half1 === half2) {
      questionText = half1;
    }

    const promptParts: string[] = [];

    const passageFormatted = formatPassageForPrompt(passageText, tabsList);
    if (passageFormatted) {
      promptParts.push(passageFormatted);
    }

    const tableFormatted = formatTableForPrompt(tableVal);
    if (tableFormatted) {
      promptParts.push(tableFormatted);
    }

    if (questionText) {
      promptParts.push(`QUESTION:\n${questionText}`);
    }

    if (studyVal) {
      promptParts.push(`STUDY CONTEXT: ${studyVal}`);
    }

    if (loVal) {
      promptParts.push(`LEARNING OBJECTIVE: ${loVal}`);
    }

    const finalPrompt = promptParts.join('\n\n');

    // Multiple Choice / Multiple Response also get an image per answer option.
    const optionTexts = Array.isArray(optionsOverride) && optionsOverride.length > 0
      ? optionsOverride
      : (typeof questionOrText === 'object' && questionOrText !== null && questionTypeWantsOptionImages(questionOrText)
        ? collectOptionTexts(questionOrText)
        : []);

    const response = await fetch(IMAGE_GENERATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: finalPrompt,
        aspect_ratio: "1:1",
        number_of_images: 1,
        ...(optionTexts.length > 0 ? { options: optionTexts, option_aspect_ratio: "1:1" } : {}),
        // Lets the API use this customer's own Gemini key from LLM Configuration.
        ...getSessionCustOrgCodes(),
      })
    });

    const responseText = await response.text();
    // Only the image fields decide whether an image came back. The API echoes the
    // prompt in `reasoning` / `image_prompt`, so matching "NO_IMAGE_REQUIRED"
    // against the whole body discarded images that were actually generated.
    const data = JSON.parse(responseText);
    // Shrink before anything stores them: the raw images are ~750 KB each.
    const rawImage = extractGeneratedImage(data);
    const imageUrl = rawImage ? await compressImageDataUrl(rawImage) : null;
    const optionImages: OptionImage[] = [];
    for (const entry of extractOptionImages(data)) {
      optionImages.push({ ...entry, url: await compressImageDataUrl(entry.url) });
    }
    return { imageUrl, optionImages };
  } catch (error) {
    console.error('Error generating image:', error);
    return { imageUrl: null, optionImages: [] };
  }
};
