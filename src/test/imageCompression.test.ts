import { describe, it, expect, afterEach, vi } from 'vitest';
import { compressImageDataUrl, compressImageDataUrls } from '@/utils/imageCompression';

const big = `data:image/jpeg;base64,${'A'.repeat(750 * 1024)}`;

/** Stands in for the browser's decoder and canvas, which jsdom does not provide. */
const installBrowserImaging = (output: string, size = { width: 1024, height: 1024 }) => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = size.width;
    naturalHeight = size.height;
    set src(_value: string) { setTimeout(() => this.onload?.(), 0); }
  }
  vi.stubGlobal('Image', FakeImage as any);

  const drawn: any[] = [];
  const canvas: any = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: (...args: any[]) => drawn.push(args) }),
    toDataURL: () => output,
  };
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    (tag === 'canvas' ? canvas : ({} as any))) as any);
  return { canvas, drawn };
};

describe('compressImageDataUrl', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('re-encodes a large generated image to a much smaller one', async () => {
    const small = `data:image/jpeg;base64,${'B'.repeat(80 * 1024)}`;
    const { canvas } = installBrowserImaging(small);

    const out = await compressImageDataUrl(big);

    expect(out).toBe(small);
    expect(out.length).toBeLessThan(big.length / 5);
    // 1024 px capped at 900 px, aspect ratio kept.
    expect([canvas.width, canvas.height]).toEqual([900, 900]);
  });

  it('keeps the original when re-encoding would not be smaller', async () => {
    installBrowserImaging(`data:image/jpeg;base64,${'C'.repeat(900 * 1024)}`);
    expect(await compressImageDataUrl(big)).toBe(big);
  });

  it('leaves links, SVG and empty values alone', async () => {
    installBrowserImaging('data:image/jpeg;base64,small');
    expect(await compressImageDataUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(await compressImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
    expect(await compressImageDataUrl('')).toBe('');
  });

  it('returns the original when the image cannot be decoded', async () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) { setTimeout(() => this.onerror?.(), 0); }
    }
    vi.stubGlobal('Image', BrokenImage as any);
    expect(await compressImageDataUrl(big)).toBe(big);
  });

  it('does not scale up a small image', async () => {
    const out = `data:image/jpeg;base64,${'D'.repeat(10)}`;
    const { canvas } = installBrowserImaging(out, { width: 200, height: 100 });
    await compressImageDataUrl(big);
    expect([canvas.width, canvas.height]).toEqual([200, 100]);
  });

  it('compresses a list in order', async () => {
    const out = `data:image/jpeg;base64,${'E'.repeat(10)}`;
    installBrowserImaging(out);
    expect(await compressImageDataUrls([big, 'https://example.com/a.png', big]))
      .toEqual([out, 'https://example.com/a.png', out]);
  });
});
