/**
 * The image model returns ~750 KB of base64 per picture. A handful of those blows
 * the ~5 MB session-storage budget (each question keeps the image twice, plus one
 * per answer option), and the generated questions were then lost entirely.
 *
 * Re-encoding in the browser keeps the picture but cuts it to a fraction of the
 * size. Anything that cannot be re-encoded is returned unchanged.
 */

const MAX_DIMENSION = 900;
const JPEG_QUALITY = 0.72;

/** Decoding must never hang the save: a picture that will not load is left as it is. */
const DECODE_TIMEOUT_MS = 8000;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out decoding the generated image')), DECODE_TIMEOUT_MS);
    const img = new Image();
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Could not decode the generated image')); };
    img.src = src;
  });

/** Shrinks one data URI. Returns the original when it is already smaller. */
export const compressImageDataUrl = async (
  dataUrl: string,
  maxDimension: number = MAX_DIMENSION,
  quality: number = JPEG_QUALITY,
): Promise<string> => {
  const value = String(dataUrl || '');
  // Only raster data URIs are worth re-encoding; SVG and blob/http URLs are left alone.
  if (!value.startsWith('data:image/') || value.startsWith('data:image/svg')) return value;
  if (typeof document === 'undefined') return value;

  try {
    // Check for canvas support before decoding: without it (a test runner, an old
    // browser) there is nothing to re-encode with, and no point waiting for the image.
    const canvas = document.createElement('canvas');
    const context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!context || typeof canvas.toDataURL !== 'function') return value;

    const img = await loadImage(value);
    const largestSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
    if (!largestSide) return value;

    const scale = Math.min(1, maxDimension / largestSide);
    canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    context.drawImage(img, 0, 0, canvas.width, canvas.height);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    return compressed && compressed.length < value.length ? compressed : value;
  } catch {
    return value;
  }
};

/** Shrinks a list of data URIs, keeping the order. */
export const compressImageDataUrls = async (
  urls: string[],
  maxDimension: number = MAX_DIMENSION,
  quality: number = JPEG_QUALITY,
): Promise<string[]> => {
  const list = Array.isArray(urls) ? urls : [];
  const out: string[] = [];
  for (const url of list) {
    out.push(await compressImageDataUrl(url, maxDimension, quality));
  }
  return out;
};
