import { describe, it, expect } from 'vitest';
import { fitWithin, readImageSize } from '@/utils/exportImages';

const bytesOf = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

// 200x140 PNG
const PNG_200x140 =
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAACMCAIAAAD/1/vjAAAAWklEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwbSAAAAV1F1sYAAAAASUVORK5CYII=';

// 1x1 GIF
const GIF_1x1 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

describe('readImageSize', () => {
  it('reads PNG dimensions from the header', () => {
    expect(readImageSize(bytesOf(PNG_200x140))).toEqual({ width: 200, height: 140 });
  });

  it('reads GIF dimensions', () => {
    expect(readImageSize(bytesOf(GIF_1x1))).toEqual({ width: 1, height: 1 });
  });

  it('reads JPEG dimensions by walking to the start-of-frame', () => {
    // Minimal JPEG: SOI, APP0 (16 bytes), SOF0 declaring 300x200, EOI.
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
      0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03,
      0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xff, 0xd9,
    ]);
    expect(readImageSize(jpeg)).toEqual({ width: 300, height: 200 });
  });

  it('returns null for something that is not an image', () => {
    expect(readImageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe('fitWithin', () => {
  it('keeps the aspect ratio of a landscape image', () => {
    // 200x140 into a 170x120 box -> limited by width, ratio preserved.
    const fitted = fitWithin({ width: 200, height: 140 }, 170, 120);
    expect(fitted).toEqual({ width: 170, height: 119 });
    expect(fitted.width / fitted.height).toBeCloseTo(200 / 140, 1);
  });

  it('keeps the aspect ratio of a portrait image', () => {
    const fitted = fitWithin({ width: 600, height: 1200 }, 170, 120);
    expect(fitted).toEqual({ width: 60, height: 120 });
    expect(fitted.width / fitted.height).toBeCloseTo(600 / 1200, 2);
  });

  it('never enlarges a small image', () => {
    expect(fitWithin({ width: 40, height: 30 }, 170, 120)).toEqual({ width: 40, height: 30 });
  });

  it('falls back to the box when the size is unknown', () => {
    expect(fitWithin(null, 170, 120)).toEqual({ width: 170, height: 120 });
    expect(fitWithin({ width: 0, height: 0 }, 170, 120)).toEqual({ width: 170, height: 120 });
  });

  it('would have distorted the image before this fix', () => {
    // The old code forced 170x110 on every picture regardless of its shape.
    const oldRatio = 170 / 110;
    const trueRatio = 200 / 140;
    expect(Math.abs(oldRatio - trueRatio)).toBeGreaterThan(0.1); // visibly stretched
    const fitted = fitWithin({ width: 200, height: 140 }, 170, 120);
    expect(Math.abs(fitted.width / fitted.height - trueRatio)).toBeLessThan(0.02);
  });
});
