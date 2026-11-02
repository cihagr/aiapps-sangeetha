/**
 * Turns a picked image File into a compact data URI.
 *
 * Images added from the local machine used to be stored on the question as a blob
 * URL only. The blob container sends no Access-Control-Allow-Origin header, so at
 * export time the browser could not read those bytes back and the Word/Excel files
 * ended up with a link instead of the picture.
 *
 * The bytes are right here while the user is picking the file, so they are captured
 * now — downscaled and re-encoded first, to keep the saved payload reasonable. This
 * is the same shape AI-generated images already use (`data:image/...;base64,...`),
 * so every consumer — the card, the preview, Word and Excel — handles it already.
 */

/** Longest edge kept, in pixels. Big enough for a full-width figure in a document. */
const DEFAULT_MAX_DIMENSION = 1400;
/** JPEG quality used when an image has to be re-encoded. */
const DEFAULT_QUALITY = 0.85;
/** Below this, re-encoding usually costs more bytes than it saves. */
const SMALL_FILE_BYTES = 120 * 1024;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the image file.'));
    img.src = src;
  });

export interface ImageDataOptions {
  maxDimension?: number;
  quality?: number;
}

/**
 * Reads an image File and returns a `data:` URI, downscaling when it is larger than
 * `maxDimension`. Falls back to the untouched file contents if anything goes wrong,
 * so a picked image is never lost.
 */
export const fileToStorableDataUrl = async (
  file: File,
  options: ImageDataOptions = {}
): Promise<string> => {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;

  const original = await readFileAsDataUrl(file);
  if (!original.startsWith('data:image/')) return original;

  // Small images are kept byte-for-byte: re-encoding a small PNG (a diagram or a
  // screenshot with flat colour) usually makes it bigger, not smaller.
  if (file.size <= SMALL_FILE_BYTES) return original;

  try {
    const img = await loadImage(original);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return original;

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;

    // Flatten onto white: a transparent PNG re-encoded as JPEG would otherwise
    // pick up black where the transparency was.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const encoded = canvas.toDataURL('image/jpeg', quality);
    if (!encoded.startsWith('data:image/')) return original;
    // Keep whichever is smaller.
    return encoded.length < original.length ? encoded : original;
  } catch {
    // Canvas unavailable or the image could not be decoded — keep the original.
    return original;
  }
};

export default fileToStorableDataUrl;
