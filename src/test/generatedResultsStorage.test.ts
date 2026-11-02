import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GENERATED_IMAGES_DROPPED_KEY,
  GENERATED_RESULTS_KEY,
  storeGeneratedResults,
} from '@/utils/generatedResultsStorage';

// A generated image is ~750 KB of base64; session storage allows about 5 MB.
const image = (tag: string, kb = 750) => `data:image/jpeg;base64,${tag}${'A'.repeat(kb * 1024)}`;

const makeQuestion = (n: number) => ({
  id: `q${n}`,
  label: `Question ${n}`,
  values: ['A. one', 'B. two'],
  generatedImageUrl: image(`q${n}`),
  generatedImages: [image(`q${n}`)],
  generatedimagetype: 0,
  optionImages: [
    { label: 'A', text: 'one', url: image(`q${n}a`) },
    { label: 'B', text: 'two', url: image(`q${n}b`) },
  ],
});

/** Session storage with a byte budget, the way a browser behaves. */
const installStorage = (limitBytes: number) => {
  const data = new Map<string, string>();
  const used = (skip: string) => [...data.entries()]
    .filter(([k]) => k !== skip)
    .reduce((total, [k, v]) => total + k.length + v.length, 0);

  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (used(k) + k.length + v.length > limitBytes) {
        const err: any = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      data.set(k, v);
    },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  } as any);
  return data;
};

/** Stands in for the browser decoder/canvas: re-encoding shrinks by the size ratio. */
const installBrowserImaging = (shrinkPerCall: Record<number, number> = { 600: 0.12, 400: 0.05 }) => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 1024;
    naturalHeight = 1024;
    private value = '';
    set src(v: string) { this.value = v; lastSrc = v; setTimeout(() => this.onload?.(), 0); }
  }
  let lastSrc = '';
  vi.stubGlobal('Image', FakeImage as any);
  const canvas: any = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: () => { } }),
    toDataURL: () => {
      const ratio = shrinkPerCall[canvas.width] ?? 0.1;
      return `data:image/jpeg;base64,${'Z'.repeat(Math.max(10, Math.round(lastSrc.length * ratio)))}`;
    },
  };
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    (tag === 'canvas' ? canvas : ({} as any))) as any);
};

describe('storeGeneratedResults', () => {
  beforeEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('stores everything when it fits', async () => {
    const store = installStorage(50 * 1024 * 1024);
    const payload = { agents: [], results: [makeQuestion(1), makeQuestion(2)] };

    const outcome = await storeGeneratedResults(payload);

    expect(outcome).toMatchObject({ stored: true, dropped: 'none', recompressed: false });
    const saved = JSON.parse(store.get(GENERATED_RESULTS_KEY)!);
    expect(saved.results[0].generatedImageUrl.startsWith('data:image/')).toBe(true);
    expect(saved.results[0].optionImages[0].url.startsWith('data:image/')).toBe(true);
    expect(store.has(GENERATED_IMAGES_DROPPED_KEY)).toBe(false);
  });

  // The reported bug: with images on, the first save threw and nothing was stored.
  it('re-encodes the images smaller instead of losing them', async () => {
    const store = installStorage(5 * 1024 * 1024);
    installBrowserImaging();
    const payload = { agents: [], results: [makeQuestion(1), makeQuestion(2), makeQuestion(3)] };

    const outcome = await storeGeneratedResults(payload);

    expect(outcome).toMatchObject({ stored: true, dropped: 'none', recompressed: true });
    const saved = JSON.parse(store.get(GENERATED_RESULTS_KEY)!);
    expect(saved.results).toHaveLength(3);
    // Every picture is still there, just smaller.
    expect(saved.results[0].generatedImageUrl.startsWith('data:image/')).toBe(true);
    expect(saved.results[0].optionImages.every((o: any) => o.url.startsWith('data:image/'))).toBe(true);
    expect(saved.results[0].generatedImageUrl.length).toBeLessThan(200 * 1024);
    expect(store.has(GENERATED_IMAGES_DROPPED_KEY)).toBe(false);
  });

  it('gives up the option images before the question image', async () => {
    // Fits the two question images (2 x 1.5 MB, each kept twice) but not the
    // option images on top. Re-encoding barely helps here, so something has to go.
    const store = installStorage(3500 * 1024);
    installBrowserImaging({ 600: 0.95, 400: 0.9 });
    const payload = { agents: [], results: [makeQuestion(1), makeQuestion(2)] };

    const outcome = await storeGeneratedResults(payload);

    expect(outcome.stored).toBe(true);
    expect(outcome.dropped).toBe('option-images');
    const saved = JSON.parse(store.get(GENERATED_RESULTS_KEY)!);
    expect(saved.results).toHaveLength(2);
    expect(saved.results[0].generatedImageUrl.startsWith('data:image/')).toBe(true);
    expect(saved.results[0].optionImages.map((o: any) => o.url)).toEqual(['', '']);
    // Option labels and texts survive, only the picture is gone.
    expect(saved.results[0].optionImages[0].label).toBe('A');
    expect(store.get(GENERATED_IMAGES_DROPPED_KEY)).toBe('option-images');
  });

  it('gives up every image rather than the questions', async () => {
    const store = installStorage(200 * 1024);
    installBrowserImaging({ 600: 0.95, 400: 0.9 });
    const payload = { agents: [], results: [makeQuestion(1), makeQuestion(2), makeQuestion(3)] };

    const outcome = await storeGeneratedResults(payload);

    expect(outcome.stored).toBe(true);
    expect(outcome.dropped).toBe('all-images');
    const saved = JSON.parse(store.get(GENERATED_RESULTS_KEY)!);
    expect(saved.results.map((q: any) => q.label)).toEqual(['Question 1', 'Question 2', 'Question 3']);
    expect(saved.results[0].generatedImageUrl).toBe('');
    expect(saved.results[0].generatedImages).toEqual([]);
    expect(store.get(GENERATED_IMAGES_DROPPED_KEY)).toBe('all-images');
  });

  it('keeps picked repository images, which are links rather than embedded data', async () => {
    const store = installStorage(600 * 1024);
    installBrowserImaging({ 600: 0.95, 400: 0.9 });
    const payload = {
      agents: [],
      results: [{
        ...makeQuestion(1),
        generatedImageUrl: 'https://example.com/picture.png',
        generatedImages: ['https://example.com/picture.png'],
      }],
    };

    await storeGeneratedResults(payload);

    const saved = JSON.parse(store.get(GENERATED_RESULTS_KEY)!);
    expect(saved.results[0].generatedImageUrl).toBe('https://example.com/picture.png');
    expect(saved.results[0].generatedImages).toEqual(['https://example.com/picture.png']);
  });

  it('reports failure when even the text does not fit', async () => {
    installStorage(10);
    installBrowserImaging({ 600: 0.95, 400: 0.9 });
    const outcome = await storeGeneratedResults({ agents: [], results: [makeQuestion(1)] });
    expect(outcome.stored).toBe(false);
  });

  it('clears the dropped flag once everything fits again', async () => {
    const store = installStorage(50 * 1024 * 1024);
    store.set(GENERATED_IMAGES_DROPPED_KEY, 'all-images');
    await storeGeneratedResults({ agents: [], results: [{ id: 'q1', label: 'Question 1' }] });
    expect(store.has(GENERATED_IMAGES_DROPPED_KEY)).toBe(false);
  });
});
