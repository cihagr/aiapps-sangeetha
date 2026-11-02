import axios from 'axios';
import { compressImageDataUrl } from './imageCompression';
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

/** One answer option and the image generated for it. */
export type OptionImage = {
  label: string;
  text: string;
  url: string;
};

/**
 * Option images are asked for on Multiple Choice and Multiple Response only —
 * the other types have no answer options to illustrate.
 */
export const questionTypeWantsOptionImages = (question: any): boolean => {
  const qData = question?.raw?.[2] || question?.[2] || question?.raw || question?.questiondata || question?.AIquestiondata || question || {};
  const type = String(
    question?.type || question?.questiontype || question?.QuestionType ||
    qData?.type || qData?.questiontype || qData?.QuestionType ||
    (() => { try { return sessionStorage.getItem('selectedQuestionType') || ''; } catch { return ''; } })()
  ).trim().toLowerCase().replace(/\s+/g, ' ');
  return type === 'multiple choice' || type === 'multiple response';
};

/** The option texts of a question, in order, as the image API expects them. */
export const collectOptionTexts = (question: any): string[] => {
  const qData = question?.raw?.[2] || question?.[2] || question?.raw || question?.questiondata || question?.AIquestiondata || question || {};
  const raw = Array.isArray(qData?.values) ? qData.values
    : Array.isArray(qData?.options) ? qData.options
      : Array.isArray(question?.values) ? question.values
        : Array.isArray(question?.options) ? question.options
          : [];
  return raw
    .map((v: any) => String(typeof v === 'string' ? v : (v?.text ?? v?.value ?? '')).trim())
    .filter((v: string) => v.length > 0);
};

const looksLikeImage = (value: any): boolean => {
  const v = String(value || '').trim();
  return v.startsWith('data:image/') || /^https?:\/\//i.test(v) || v.startsWith('blob:');
};

/** The image URL of one entry, whichever name the API used for it. */
const readEntryUrl = (entry: any): string => {
  if (typeof entry === 'string') return looksLikeImage(entry) ? entry.trim() : '';
  if (!entry || typeof entry !== 'object') return '';
  const candidates = [
    entry.url, entry.generatedImageUrl, entry.imageUrl, entry.image_url, entry.imageurl,
    entry.optionImageUrl, entry.optionimageurl, entry.src, entry.image, entry.Image,
  ];
  const found = candidates.find((value) => looksLikeImage(value));
  return found ? String(found).trim() : '';
};

/** "optionImages", "option_images", "OptionImageUrls" … all name the same thing. */
const isOptionImagesKey = (key: string): boolean =>
  /^option[\s_-]?images?([\s_-]?urls?)?$/i.test(String(key || '').trim());

/**
 * The raw option-images field of one object, under whichever name it carries,
 * returned untouched (a list, or the JSON text a blob column gives back).
 * `undefined` when the object has no such field.
 */
export const readOptionImagesField = (source: any): any => {
  if (!source || typeof source !== 'object') return undefined;
  const key = Object.keys(source).find((name) => isOptionImagesKey(name));
  return key ? (source as any)[key] : undefined;
};

const toOptionImageList = (value: any): OptionImage[] => {
  let list = value;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((entry: any, index: number) => ({
      label: String((typeof entry === 'object' && entry ? (entry.label ?? entry.option ?? entry.Option) : '') || '').trim()
        || String.fromCharCode(65 + index),
      text: String((typeof entry === 'object' && entry ? (entry.text ?? entry.value ?? entry.optiontext) : '') || ''),
      url: readEntryUrl(entry),
    }))
    .filter((entry: OptionImage) => entry.url.length > 0);
};

/** Per-option fields such as OptionImageA / optionimage1 / imageOptionB. */
const toLetteredOptionImages = (source: any): OptionImage[] => {
  const found: { index: number; image: OptionImage }[] = [];
  Object.keys(source || {}).forEach((key) => {
    const match = /^(?:option[\s_-]?image|image[\s_-]?option)[\s_-]?([A-J]|\d{1,2})$/i.exec(key.trim());
    if (!match) return;
    const url = readEntryUrl(source[key]);
    if (!url) return;
    const token = match[1];
    const index = /\d/.test(token) ? Math.max(0, Number(token) - 1) : token.toUpperCase().charCodeAt(0) - 65;
    found.push({ index, image: { label: String.fromCharCode(65 + index), text: '', url } });
  });
  return found.sort((a, b) => a.index - b.index).map((entry) => entry.image);
};

/** Options that carry their own picture, e.g. values: [{ text, imageUrl }]. */
const toImagesFromValues = (source: any): OptionImage[] => {
  const values = Array.isArray(source?.values) ? source.values : (Array.isArray(source?.options) ? source.options : []);
  return values
    .map((entry: any, index: number) => ({
      label: String.fromCharCode(65 + index),
      text: String((entry && typeof entry === 'object' ? (entry.text ?? entry.value) : '') || ''),
      url: entry && typeof entry === 'object' ? readEntryUrl(entry) : '',
    }))
    .filter((entry: OptionImage) => entry.url.length > 0);
};

/**
 * Reads the saved per-option images off a question. The repository serves them
 * inside the question JSON, and the field has been seen under several names, so
 * every known shape is accepted: a list, per-letter fields, or images carried on
 * the options themselves.
 */
export const getOptionImages = (question: any): OptionImage[] => {
  const sources = [
    question,
    question?.raw?.[2], question?.[2], question?.raw,
    question?.questiondata, question?.AIquestiondata,
    question?.questiondata?.[2], question?.questionData,
  ];

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;

    const listKey = Object.keys(source).find((key) => isOptionImagesKey(key));
    if (listKey) {
      const list = toOptionImageList((source as any)[listKey]);
      if (list.length) return list;
    }

    const lettered = toLetteredOptionImages(source);
    if (lettered.length) return lettered;

    const fromValues = toImagesFromValues(source);
    if (fromValues.length) return fromValues;
  }
  return [];
};

/**
 * The image for one option: matched on its letter first, then on the option text,
 * and finally on position — an option can be reworded after the image was made.
 */
export const findOptionImageUrl = (images: OptionImage[], index: number, optionText?: string): string => {
  if (!Array.isArray(images) || images.length === 0) return '';
  const letter = String.fromCharCode(65 + index);
  const byLetter = images.find((img) => img.label.trim().toUpperCase() === letter);
  if (byLetter) return byLetter.url;

  const clean = (value: string) => String(value || '').replace(/^[A-Ja-j][.)]\s*/, '').replace(/<[^>]*>/g, '').trim().toLowerCase();
  const wanted = clean(optionText || '');
  if (wanted) {
    const byText = images.find((img) => clean(img.text) === wanted);
    if (byText) return byText.url;
  }
  return images[index]?.url || '';
};

/**
 * Pulls the per-option images out of a /generate-image response. Options whose
 * image failed are skipped — the rest still show.
 */
export const extractOptionImages = (data: any): OptionImage[] => {
  if (!data || !Array.isArray(data.option_images)) return [];
  const images: OptionImage[] = [];
  data.option_images.forEach((entry: any, index: number) => {
    const direct = String(entry?.generatedImageUrl || '').trim();
    const url = direct.startsWith('data:image/')
      ? direct
      : (typeof entry?.image === 'string' && entry.image.length > 100
        ? `data:${entry?.mime_type || 'image/png'};base64,${entry.image}`
        : '');
    if (!url || isPlaceholderImage(url)) return;
    images.push({
      label: String(entry?.label || String.fromCharCode(65 + index)),
      text: String(entry?.text || ''),
      url,
    });
  });
  return images;
};

const isPlaceholderImage = (value: any): boolean => {
  if (typeof value !== 'string') return true;
  const v = value.trim();
  if (v.length < 100) return true;
  return v.includes('NO_IMAGE_REQUIRED') || v.includes('NOT REQUIRED');
};

/**
 * Pulls the image out of a /generate-image response.
 *
 * Only the image fields and the explicit `image_required` flag are considered —
 * `reasoning` and `image_prompt` are free text from the model and routinely
 * mention "NO_IMAGE_REQUIRED", so matching against the whole body threw away
 * images that had actually been generated.
 */
export const extractGeneratedImage = (data: any): string | null => {
  if (!data || data.status !== 'success') return null;
  if (data.image_required === false) return null;

  // The API returns a ready-made data URI as well as the raw base64 list.
  const direct = data.generatedImageUrl
    ?? (Array.isArray(data.generatedImageUrls) ? data.generatedImageUrls[0] : undefined);
  if (typeof direct === 'string' && direct.startsWith('data:image/') && !isPlaceholderImage(direct)) {
    return direct;
  }

  const base64ImageData = Array.isArray(data.images) ? data.images[0] : undefined;
  if (isPlaceholderImage(base64ImageData)) return null;

  const mime = Array.isArray(data.mime_types) && typeof data.mime_types[0] === 'string'
    ? data.mime_types[0]
    : 'image/jpeg';
  return `data:${mime};base64,${base64ImageData}`;
};

export const regenerateQuestionImage = async (question: any, instructions: string): Promise<string | null> => {
  const { imageUrl } = await regenerateQuestionImageWithOptions(question, instructions);
  return imageUrl;
};

/**
 * Same call as regenerateQuestionImage, and for Multiple Choice / Multiple Response
 * it also returns one image per answer option.
 */
export const regenerateQuestionImageWithOptions = async (
  question: any,
  instructions: string,
): Promise<{ imageUrl: string | null; optionImages: OptionImage[] }> => {
  try {
    const qData = question?.raw?.[2] || question?.[2] || question?.raw || question?.questiondata || question?.AIquestiondata || question || {};
    let questionText = qData.label || qData.QuestionStatement || qData.Question || qData.text || qData.QuestionText || question.label || question.QuestionStatement || '';
    questionText = questionText.trim();
    const half1 = questionText.substring(0, Math.floor(questionText.length / 2)).trim();
    const half2 = questionText.substring(Math.floor(questionText.length / 2)).trim();
    if (half1.length > 10 && half1 === half2) {
      questionText = half1;
    }

    const passageText = qData.Passage || qData.passage || qData.PassageText || qData.passagetext || qData.Scenario || qData.scenario || question.Passage || question.passage || '';
    const tabsList = Array.isArray(qData.Tabs) ? qData.Tabs : (Array.isArray(qData.tabs) ? qData.tabs : (Array.isArray(question.Tabs) ? question.Tabs : []));
    const tableVal = extractTableData(question);

    const studyVal = sessionStorage.getItem('selectedChapterName') || sessionStorage.getItem('bookTitle') || qData.BookName || qData.study || qData.chapter || qData.bookname || qData.Topic || qData.topic || '';
    const loVal = sessionStorage.getItem('learningObjectivesName') || sessionStorage.getItem('selectedLO') || qData.EnablingObjective || qData.learningObjective || qData.lo || qData.learningobjective || qData.LearningObjective || '';

    const passageFormatted = formatPassageForPrompt(passageText, tabsList);
    const tableFormatted = formatTableForPrompt(tableVal);

    const contextParts: string[] = [];
    if (passageFormatted) contextParts.push(passageFormatted);
    if (tableFormatted) contextParts.push(tableFormatted);
    contextParts.push(`ORIGINAL QUESTION:\n${questionText}`);
    if (studyVal) contextParts.push(`STUDY CONTEXT: ${studyVal}`);
    if (loVal) contextParts.push(`LEARNING OBJECTIVE: ${loVal}`);

    const finalPrompt = `${contextParts.join('\n\n')}

USER ADDITIONAL INSTRUCTIONS FOR THE NEW IMAGE:
"${instructions}"

IMPORTANT INSTRUCTION FOR VISUAL PLANNER:
The user explicitly triggered an image regeneration with the above additional instructions.
1. YOU MUST set 'image_required' to true. DO NOT evaluate whether the image is needed for the question—the user has manually demanded it.
2. The ORIGINAL QUESTION (together with its STUDY CONTEXT, PASSAGE, TABLE, and LEARNING OBJECTIVE) is the single source of truth for what the image must depict. The generated image MUST stay strictly within the context of the original question and must NOT deviate from it.
3. Evaluate whether the USER ADDITIONAL INSTRUCTIONS are relevant to the original question:
   - If they ARE relevant (e.g., they refine the same subject: "make it a bar chart instead of a pie chart", "use a blue background", "label the axes"), you MUST strictly follow them and explicitly incorporate them into your 'image_prompt'.
   - If they are UNRELATED or IRRELEVANT to the original question (e.g., they ask for a subject that has nothing to do with the question, or would change what the question is about), you MUST IGNORE them entirely and generate an image that faithfully represents ONLY the original question's context.
4. Under no circumstances let the additional instructions pull the image away from the original question's subject matter.
5. Do NOT output NO_IMAGE_REQUIRED under any circumstances. Ensure the final image_prompt is faithful to the original question and applies the additional instructions only when they are relevant.`;

    // Multiple Choice / Multiple Response also get an image per answer option.
    const optionTexts = questionTypeWantsOptionImages(question) ? collectOptionTexts(question) : [];

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
    // NOTE: do NOT scan the whole response body for "NO_IMAGE_REQUIRED". The API
    // echoes the prompt back in `reasoning` / `image_prompt`, and this prompt asks
    // the model *not* to output NO_IMAGE_REQUIRED — so a substring match on the raw
    // text discarded perfectly good images. Inspect the parsed fields instead.
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
    console.error('Failed to regenerate image for question:', error);
    return { imageUrl: null, optionImages: [] };
  }
};

export const generateImagesForGeneratedQuestions = async (results: any[]) => {
  try {
    console.log('Starting image generation for questions...');

    const questions: any[] = [];

    results.forEach(result => {
      const actualData = result.data || result;

      if (actualData.data && Array.isArray(actualData.data)) {
        questions.push(...actualData.data);
      } else if (actualData.questions && Array.isArray(actualData.questions)) {
        questions.push(...actualData.questions);
      } else if (actualData.result && Array.isArray(actualData.result)) {
        questions.push(...actualData.result);
      } else if (Array.isArray(actualData)) {
        questions.push(...actualData);
      } else if (actualData.results && Array.isArray(actualData.results)) {
        questions.push(...actualData.results);
      } else if (actualData.answer && Array.isArray(actualData.answer)) {
        // agentic_item_gen's actual shape: { answer: [...], inputtokens, outputtoken }
        questions.push(...actualData.answer);
      } else if (actualData && typeof actualData === 'object') {
        // Unrecognized shape — fall back to the first non-empty array found
        // anywhere on the object, so a future/unnamed key still works instead
        // of silently finding 0 questions like the named checks above would.
        const firstArray = Object.values(actualData).find(
          (v): v is any[] => Array.isArray(v) && v.length > 0
        );
        if (firstArray) {
          questions.push(...firstArray);
        }
      }
    });

    console.log(`Found ${questions.length} questions to generate images for`);

    for (const question of questions) {
      if (question && (question.label || question.Question || question.text || question.QuestionText)) {
        try {
          const qData = question.raw?.[2] || question?.[2] || question.raw || question.questiondata || question.AIquestiondata || question;
          let questionText = qData.label || qData.QuestionStatement || qData.Question || qData.text || qData.QuestionText || question.label || question.QuestionStatement || '';
          questionText = questionText.trim();
          const half1 = questionText.substring(0, Math.floor(questionText.length / 2)).trim();
          const half2 = questionText.substring(Math.floor(questionText.length / 2)).trim();
          if (half1.length > 10 && half1 === half2) {
            questionText = half1;
          }

          const passageText = qData.Passage || qData.passage || qData.PassageText || qData.passagetext || qData.Scenario || qData.scenario || question.Passage || question.passage || '';
          const tabsList = Array.isArray(qData.Tabs) ? qData.Tabs : (Array.isArray(qData.tabs) ? qData.tabs : (Array.isArray(question.Tabs) ? question.Tabs : []));
          const tableVal = extractTableData(question);

          const studyVal = sessionStorage.getItem('selectedChapterName') || sessionStorage.getItem('bookTitle') || qData.BookName || qData.study || qData.chapter || qData.bookname || qData.Topic || qData.topic || '';
          const loVal = sessionStorage.getItem('learningObjectivesName') || sessionStorage.getItem('selectedLO') || qData.EnablingObjective || qData.learningObjective || qData.lo || qData.learningobjective || qData.LearningObjective || '';

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
            promptParts.push(`Question:\n${questionText}`);
          }

          if (studyVal) {
            promptParts.push(`Study: ${studyVal}`);
          }

          if (loVal) {
            promptParts.push(`Learning Objective: ${loVal}`);
          }

          let actualPrompt = promptParts.join('\n\n');

          const lowercaseQuestion = questionText.toLowerCase();
          const needsImageExplicitly = lowercaseQuestion.includes('image') ||
            lowercaseQuestion.includes('diagram') ||
            lowercaseQuestion.includes('figure') ||
            lowercaseQuestion.includes('picture') ||
            lowercaseQuestion.includes('graph');

          if (needsImageExplicitly) {
            actualPrompt += `\n\n[CRITICAL INSTRUCTION: This question explicitly refers to a visual element. You MUST generate a relevant image. DO NOT output NO_IMAGE_REQUIRED.]`;
          }

          // Multiple Choice / Multiple Response also get an image per answer option.
          const optionTexts = questionTypeWantsOptionImages(question) ? collectOptionTexts(question) : [];

          const response = await fetch(IMAGE_GENERATION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              prompt: actualPrompt,
              aspect_ratio: "1:1",
              number_of_images: 1,
              ...(optionTexts.length > 0 ? { options: optionTexts, option_aspect_ratio: "1:1" } : {}),
              // Lets the API use this customer's own Gemini key from LLM Configuration.
              ...getSessionCustOrgCodes(),
            })
          });

          const responseText = await response.text();
          // See extractGeneratedImage: matching "NO_IMAGE_REQUIRED" against the raw
          // body also matched the model's own `reasoning` text and discarded images
          // that had in fact been generated.
          const data = JSON.parse(responseText);
          // Shrink before anything stores them: the raw images are ~750 KB each,
          // which overflows session storage after a few questions.
          const rawImage = extractGeneratedImage(data);
          const imageUrl = rawImage ? await compressImageDataUrl(rawImage) : null;
          const optionImages: OptionImage[] = [];
          for (const entry of extractOptionImages(data)) {
            optionImages.push({ ...entry, url: await compressImageDataUrl(entry.url) });
          }

          if (imageUrl) {
            question.generatedImageUrl = imageUrl;
            question.generatedImages = [imageUrl];
            question.generatedimagetype = 0;
            console.log("Image generated successfully for question");
          } else {
            console.log('No image required for this question based on model response.');
          }

          if (optionImages.length > 0) {
            question.optionImages = optionImages;
            console.log(`Option images generated: ${optionImages.length}`);
          }
        } catch (error) {
          console.error('Failed to generate image for question:', error);
        }
      }
    }

    console.log('Image generation completed');
    return results;
  } catch (error) {
    console.error('Error in generateImagesForGeneratedQuestions:', error);
    return results;
  }
};
