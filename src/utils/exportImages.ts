/**
 * Loads question images as raw bytes so they can be embedded in Word / Excel
 * exports.
 *
 * AI-generated images arrive as `data:` URIs and can be decoded locally.
 * Manually added images are Azure blob URLs, which previously were not embedded
 * at all — only the URL text was written into the export. Those are fetched here
 * and embedded when the browser is allowed to read them.
 *
 * NOTE: the blob container currently serves no `Access-Control-Allow-Origin`
 * header, so the fetch can be blocked by CORS. That is handled as a soft failure:
 * the export still succeeds and falls back to printing the image URL, exactly as
 * before. Enabling CORS for the app origin on the storage account (or exposing a
 * backend image proxy) makes the embedding work with no further code change.
 */

import { AGENT_GENERATIVE_API_URL } from './Aigapi';

const REFRESH_IMAGE_URL = `${AGENT_GENERATIVE_API_URL}/refresh-image-url`;

/**
 * Same-origin path that proxies the image blobs, used to sidestep the missing CORS
 * headers on the storage account.
 *
 * Contract: `<prefix>/<blob path>` must return the raw image bytes, where the blob
 * path is everything after the container — e.g.
 *   /blob-image/image_repository/general_images/one.png
 * maps to
 *   https://esknowledgebase.blob.core.windows.net/esaiknowledgebase/image_repository/general_images/one.png
 *
 * Wired up automatically in `npm run dev` (see the proxy in vite.config.ts). For a
 * deployed build set VITE_BLOB_IMAGE_PROXY to the equivalent rewrite; leave it
 * unset if the storage account has CORS enabled instead, in which case the direct
 * fetch below already works.
 */
const BLOB_IMAGE_PROXY: string = (() => {
  try {
    const configured = (import.meta as any)?.env?.VITE_BLOB_IMAGE_PROXY;
    if (configured) return String(configured).replace(/\/+$/, '');
    return (import.meta as any)?.env?.DEV ? '/blob-image' : '';
  } catch {
    return '';
  }
})();

export type ExportImageExtension = 'png' | 'jpg' | 'gif' | 'bmp';

export interface ExportImage {
  extension: ExportImageExtension;
  bytes: Uint8Array;
  /** base64 payload without the data: prefix — ExcelJS wants this form. */
  base64: string;
  /** Intrinsic pixel size, when it could be read from the file header. */
  width?: number;
  height?: number;
}

/**
 * Reads the intrinsic pixel size straight out of the image header.
 *
 * Word and Excel need an explicit display size. Forcing a fixed box on every
 * picture stretched anything that was not exactly that shape, which is what made
 * the exported images look misaligned/squashed. Knowing the real size lets the
 * export preserve the aspect ratio.
 */
export const readImageSize = (
  bytes: Uint8Array
): { width: number; height: number } | null => {
  try {
    // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
    if (bytes.length > 24 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }

    // GIF: little-endian uint16 width/height at offset 6.
    if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }

    // BMP: little-endian int32 width/height at offset 18.
    if (bytes.length > 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
    }

    // JPEG: walk the markers to the start-of-frame, which carries the dimensions.
    if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (view.getUint8(offset) !== 0xff) { offset += 1; continue; }
        const marker = view.getUint8(offset + 1);
        // Standalone markers carry no length.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        const length = view.getUint16(offset + 2);
        // SOF0..SOF15, excluding the non-frame markers DHT/JPG/DAC.
        const isFrame = marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isFrame) {
          return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        }
        if (length <= 0) break;
        offset += 2 + length;
      }
    }
  } catch {
    // Unreadable header — the caller falls back to its default box.
  }
  return null;
};

/**
 * Scales a picture to fit inside a box without distorting it. Never enlarges,
 * so a small diagram is not blown up and blurred.
 */
export const fitWithin = (
  image: { width?: number; height?: number } | null | undefined,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } => {
  const w = image?.width;
  const h = image?.height;
  if (!w || !h || w <= 0 || h <= 0) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(maxWidth / w, maxHeight / h, 1);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000; // avoid "too many arguments" on large images
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const normalizeExtension = (raw: string): ExportImageExtension => {
  const v = raw.toLowerCase();
  if (v.includes('png')) return 'png';
  if (v.includes('gif')) return 'gif';
  if (v.includes('bmp')) return 'bmp';
  return 'jpg';
};

/** Everything after the blob container, used to ask the backend for a fresh URL. */
const extractBlobPath = (url: string): string => {
  const m = String(url || '').match(/blob\.core\.windows\.net\/[^/]+\/([^?]+)/i);
  return m ? decodeURIComponent(m[1]) : '';
};

const fromDataUrl = (src: string): ExportImage | null => {
  const match = src.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const extension = normalizeExtension(match[1]);
  try {
    const bytes = base64ToUint8Array(match[2]);
    return { extension, base64: match[2], bytes, ...(readImageSize(bytes) || {}) };
  } catch {
    return null;
  }
};

const fromResponse = async (response: Response, src: string): Promise<ExportImage | null> => {
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) return null;
  const bytes = new Uint8Array(buffer);
  const contentType = response.headers.get('content-type') || '';
  // Azure serves these as application/octet-stream, so fall back to the extension
  // in the URL rather than trusting the content type alone.
  const extension = /image\//i.test(contentType)
    ? normalizeExtension(contentType)
    : normalizeExtension((src.split('?')[0].match(/\.([a-zA-Z0-9]+)$/)?.[1]) || 'jpg');
  return { extension, bytes, base64: uint8ArrayToBase64(bytes), ...(readImageSize(bytes) || {}) };
};

/** Loads a single image. Returns null when it cannot be read (never throws). */
export const loadExportImage = async (src: string): Promise<ExportImage | null> => {
  const value = String(src || '').trim();
  if (!value) return null;
  if (value.includes('NOT REQUIRED') || value.includes('NO_IMAGE_REQUIRED')) return null;

  if (value.startsWith('data:image/')) return fromDataUrl(value);
  if (!/^https?:\/\//i.test(value)) return null;

  const path = extractBlobPath(value);

  // 1. Same-origin proxy, when one is configured. This is the only route that
  //    works while the storage account has no Access-Control-Allow-Origin header.
  if (BLOB_IMAGE_PROXY && path) {
    try {
      const proxied = `${BLOB_IMAGE_PROXY}/${path.split('/').map(encodeURIComponent).join('/')}`;
      const resp = await fetch(proxied);
      const parsed = await fromResponse(resp, value);
      if (parsed) return parsed;
    } catch {
      // Proxy not deployed here — fall through to the direct fetch.
    }
  }

  // 2. Direct fetch. Works as soon as CORS is enabled on the storage account.
  try {
    const direct = await fetch(value);
    const parsed = await fromResponse(direct, value);
    if (parsed) return parsed;
  } catch {
    // Most likely CORS or an expired SAS token — try a freshly signed URL below.
  }

  // 3. Re-sign the URL (handles an expired SAS token) and retry.
  if (!path) return null;
  try {
    const resp = await fetch(`${REFRESH_IMAGE_URL}?path=${encodeURIComponent(path)}`);
    const data = await resp.json();
    if (!data?.url) return null;
    const refreshed = await fetch(data.url);
    return await fromResponse(refreshed, data.url);
  } catch (err) {
    console.warn(
      'Could not read the image bytes for export, so it is exported as a link instead. ' +
      'Enable CORS for this origin on the storage account (or set VITE_BLOB_IMAGE_PROXY) ' +
      'to embed images in Word/Excel:', value, err
    );
    return null;
  }
};

/**
 * Converts image URLs to `data:` URIs where the bytes can be read, so the picture
 * travels with the question instead of being a link the exports cannot resolve.
 *
 * Called when the user attaches an image, so the conversion happens once and every
 * later export embeds it. A URL that cannot be read is returned unchanged — the
 * export then falls back to a link, exactly as before.
 */
export const toEmbeddableImages = async (urls: string[]): Promise<string[]> => {
  const list = (urls || []).map(u => String(u || '').trim()).filter(Boolean);
  return Promise.all(list.map(async (url) => {
    if (url.startsWith('data:')) return url;
    try {
      const img = await loadExportImage(url);
      return img ? `data:image/${img.extension};base64,${img.base64}` : url;
    } catch {
      return url;
    }
  }));
};

/** Loads several images, dropping the ones that cannot be read. */
export const loadExportImages = async (sources: string[]): Promise<ExportImage[]> => {
  const unique = Array.from(new Set((sources || []).map(s => String(s || '').trim()).filter(Boolean)));
  const loaded = await Promise.all(unique.map(loadExportImage));
  return loaded.filter((img): img is ExportImage => img !== null);
};

export default loadExportImage;
