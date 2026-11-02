import { compressImageDataUrl } from './imageCompression';

/**
 * Saving the generated questions into session storage used to be a bare
 * setItem. With "Generate Images for Questions" on, the payload carries a
 * base64 picture per question (and one per answer option), which overflows the
 * ~5 MB session-storage budget — setItem threw, the fallback threw for the same
 * reason, and the results screen opened with no questions at all.
 *
 * Now the pictures are re-encoded smaller until the payload fits, and the
 * questions themselves are never the thing that gets dropped.
 */

export const GENERATED_RESULTS_KEY = 'questionGenResults';
/** Set when pictures had to be given up, so the results screen can say so. */
export const GENERATED_IMAGES_DROPPED_KEY = 'questionGenResultsImagesDropped';

export type StoreResult = {
  stored: boolean;
  /** What had to be given up: nothing, only the option images, or every image. */
  dropped: 'none' | 'option-images' | 'all-images';
  /** True when the pictures were re-encoded smaller to make room. */
  recompressed: boolean;
  bytes: number;
};

const isDataImage = (value: any): value is string =>
  typeof value === 'string' && value.startsWith('data:image/');

/** Deep copy, running every embedded picture through `convert`. */
const mapImages = async (value: any, convert: (url: string) => Promise<string>): Promise<any> => {
  if (isDataImage(value)) return convert(value);
  if (Array.isArray(value)) {
    const out: any[] = [];
    for (const item of value) out.push(await mapImages(item, convert));
    return out;
  }
  if (!value || typeof value !== 'object') return value;
  const out: any = {};
  for (const key of Object.keys(value)) out[key] = await mapImages((value as any)[key], convert);
  return out;
};

/** Deep copy with the embedded pictures removed (links and text are kept). */
const stripImages = (value: any, alsoQuestionImages: boolean): any => {
  if (Array.isArray(value)) return value.map((item) => stripImages(item, alsoQuestionImages));
  if (!value || typeof value !== 'object') return value;

  const out: any = {};
  Object.keys(value).forEach((key) => {
    const item = (value as any)[key];

    if (key === 'optionImages' && Array.isArray(item)) {
      out[key] = item.map((entry: any) => ({ ...entry, url: isDataImage(entry?.url) ? '' : entry?.url }));
      return;
    }
    if (alsoQuestionImages && (key === 'generatedImageUrl' || key === 'imageUrl' || key === 'generated_image')) {
      out[key] = isDataImage(item) || key === 'generated_image' ? '' : item;
      return;
    }
    if (alsoQuestionImages && (key === 'generatedImages' || key === 'images') && Array.isArray(item)) {
      out[key] = item.filter((entry: any) => !isDataImage(entry));
      return;
    }
    out[key] = stripImages(item, alsoQuestionImages);
  });
  return out;
};

const write = (payload: any): number | null => {
  try {
    const text = JSON.stringify(payload);
    sessionStorage.setItem(GENERATED_RESULTS_KEY, text);
    return text.length;
  } catch {
    return null;
  }
};

const flag = (value: string | null) => {
  try {
    if (value) sessionStorage.setItem(GENERATED_IMAGES_DROPPED_KEY, value);
    else sessionStorage.removeItem(GENERATED_IMAGES_DROPPED_KEY);
  } catch { /* storage unavailable */ }
};

/**
 * Stores the generated results, making the pictures smaller as needed and only
 * giving them up when even the smallest ones do not fit.
 */
export const storeGeneratedResults = async (payload: any): Promise<StoreResult> => {
  const asIs = write(payload);
  if (asIs !== null) {
    flag(null);
    return { stored: true, dropped: 'none', recompressed: false, bytes: asIs };
  }

  // Too big: re-encode the pictures smaller, twice over, before losing any of them.
  for (const [maxDimension, quality] of [[600, 0.6], [400, 0.5]] as const) {
    const smaller = await mapImages(payload, (url) => compressImageDataUrl(url, maxDimension, quality));
    const bytes = write(smaller);
    if (bytes !== null) {
      flag(null);
      console.warn(`Generated results were too large for session storage: images re-encoded at ${maxDimension}px.`);
      return { stored: true, dropped: 'none', recompressed: true, bytes };
    }
  }

  // Still too big: option images first — the question's own picture matters more.
  const withoutOptionImages = write(stripImages(payload, false));
  if (withoutOptionImages !== null) {
    flag('option-images');
    console.warn('Generated results were too large for session storage: option images were dropped.');
    return { stored: true, dropped: 'option-images', recompressed: true, bytes: withoutOptionImages };
  }

  const withoutImages = write(stripImages(payload, true));
  if (withoutImages !== null) {
    flag('all-images');
    console.warn('Generated results were too large for session storage: images were dropped.');
    return { stored: true, dropped: 'all-images', recompressed: true, bytes: withoutImages };
  }

  console.error('Generated results could not be stored in session storage.');
  return { stored: false, dropped: 'all-images', recompressed: true, bytes: 0 };
};
