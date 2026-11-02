import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  collectOptionTexts,
  extractOptionImages,
  findOptionImageUrl,
  getOptionImages,
  questionTypeWantsOptionImages,
  regenerateQuestionImageWithOptions,
} from '@/utils/questionImageGeneration';

const PNG = 'data:image/png;base64,' + 'A'.repeat(200);

describe('questionTypeWantsOptionImages', () => {
  it('accepts Multiple Choice and Multiple Response', () => {
    expect(questionTypeWantsOptionImages({ type: 'Multiple Choice' })).toBe(true);
    expect(questionTypeWantsOptionImages({ type: 'multiple response' })).toBe(true);
  });

  it('rejects the types that have no options', () => {
    expect(questionTypeWantsOptionImages({ type: 'Written Response' })).toBe(false);
    expect(questionTypeWantsOptionImages({ type: 'Fill In the Blank' })).toBe(false);
    expect(questionTypeWantsOptionImages({ type: 'True False' })).toBe(false);
    expect(questionTypeWantsOptionImages({ type: 'Matrix' })).toBe(false);
  });

  it('reads the type out of the nested question shapes', () => {
    expect(questionTypeWantsOptionImages({ raw: [0, 0, { type: 'Multiple Choice' }] })).toBe(true);
    expect(questionTypeWantsOptionImages({ questiondata: { questiontype: 'Multiple Response' } })).toBe(true);
  });
});

describe('collectOptionTexts', () => {
  it('reads plain string options', () => {
    expect(collectOptionTexts({ values: ['A. Square', 'B. Rectangle'] })).toEqual(['A. Square', 'B. Rectangle']);
  });

  it('reads object options and drops the empty ones', () => {
    expect(collectOptionTexts({ values: [{ text: 'Heart' }, { value: 'Lungs' }, { text: '  ' }, null] }))
      .toEqual(['Heart', 'Lungs']);
  });

  it('falls back to options and to the nested question data', () => {
    expect(collectOptionTexts({ options: ['One', 'Two'] })).toEqual(['One', 'Two']);
    expect(collectOptionTexts({ raw: [0, 0, { values: ['Nested'] }] })).toEqual(['Nested']);
  });
});

describe('extractOptionImages', () => {
  it('takes the ready-made data URI', () => {
    const images = extractOptionImages({
      option_images: [{ label: 'A', text: 'Square', generatedImageUrl: PNG }],
    });
    expect(images).toEqual([{ label: 'A', text: 'Square', url: PNG }]);
  });

  it('builds the data URI from raw base64 when no URL is given', () => {
    const images = extractOptionImages({
      option_images: [{ label: 'B', text: 'Rectangle', image: 'B'.repeat(200), mime_type: 'image/jpeg' }],
    });
    expect(images[0].url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('skips options whose image failed and keeps the rest', () => {
    const images = extractOptionImages({
      option_images: [
        { label: 'A', text: 'Square', error: 'Image model returned no images.' },
        { label: 'B', text: 'Rectangle', generatedImageUrl: PNG },
      ],
    });
    expect(images.map((i) => i.label)).toEqual(['B']);
  });

  it('returns nothing for a question-only response', () => {
    expect(extractOptionImages({ status: 'success', images: ['x'] })).toEqual([]);
    expect(extractOptionImages(null)).toEqual([]);
  });
});

describe('findOptionImageUrl', () => {
  const images = [
    { label: 'A', text: 'Square', url: 'url-a' },
    { label: 'B', text: 'Rectangle', url: 'url-b' },
  ];

  it('matches on the option letter', () => {
    expect(findOptionImageUrl(images, 0)).toBe('url-a');
    expect(findOptionImageUrl(images, 1)).toBe('url-b');
  });

  it('matches on the text when the letters are missing', () => {
    const unlabelled = [{ label: '', text: 'Rectangle', url: 'url-b' }];
    expect(findOptionImageUrl(unlabelled, 0, 'B. Rectangle')).toBe('url-b');
  });

  it('falls back to the position', () => {
    const unlabelled = [{ label: '', text: '', url: 'first' }, { label: '', text: '', url: 'second' }];
    expect(findOptionImageUrl(unlabelled, 1, 'anything')).toBe('second');
  });

  it('returns an empty string when there is nothing to show', () => {
    expect(findOptionImageUrl([], 0, 'Square')).toBe('');
    expect(findOptionImageUrl(images, 5)).toBe('');
  });
});

describe('getOptionImages', () => {
  const blob = 'https://esknowledgebase.blob.core.windows.net/esaiknowledgebase/option-a.png';

  it('reads them off the question and off the nested data', () => {
    expect(getOptionImages({ optionImages: [{ label: 'A', text: 'Square', url: blob }] }))
      .toEqual([{ label: 'A', text: 'Square', url: blob }]);
    expect(getOptionImages({ raw: [0, 0, { optionImages: [{ label: 'B', url: blob }] }] }))
      .toEqual([{ label: 'B', text: '', url: blob }]);
    expect(getOptionImages({ questiondata: { optionImages: [{ label: 'C', url: PNG }] } }))
      .toEqual([{ label: 'C', text: '', url: PNG }]);
  });

  // The repository response has used several names for the same thing.
  it('accepts the other field names the API sends', () => {
    const expected = [{ label: 'A', text: 'Square', url: blob }];
    expect(getOptionImages({ option_images: [{ label: 'A', text: 'Square', url: blob }] })).toEqual(expected);
    expect(getOptionImages({ optionimages: [{ label: 'A', text: 'Square', imageUrl: blob }] })).toEqual(expected);
    expect(getOptionImages({ OptionImages: [{ label: 'A', text: 'Square', image_url: blob }] })).toEqual(expected);
    expect(getOptionImages({ optionImageUrls: [{ label: 'A', text: 'Square', generatedImageUrl: blob }] })).toEqual(expected);
  });

  it('accepts a plain list of URLs, in option order', () => {
    expect(getOptionImages({ optionImages: [blob, PNG] })).toEqual([
      { label: 'A', text: '', url: blob },
      { label: 'B', text: '', url: PNG },
    ]);
  });

  it('accepts the list stored as JSON text', () => {
    expect(getOptionImages({ optionImages: JSON.stringify([{ label: 'A', text: 'Square', url: blob }]) }))
      .toEqual([{ label: 'A', text: 'Square', url: blob }]);
  });

  it('accepts one field per option', () => {
    expect(getOptionImages({ OptionImageA: blob, OptionImageB: PNG })).toEqual([
      { label: 'A', text: '', url: blob },
      { label: 'B', text: '', url: PNG },
    ]);
    expect(getOptionImages({ optionimage1: blob, optionimage2: PNG })).toEqual([
      { label: 'A', text: '', url: blob },
      { label: 'B', text: '', url: PNG },
    ]);
  });

  it('accepts options that carry their own picture', () => {
    expect(getOptionImages({ values: [{ text: 'Square', imageUrl: blob }, { text: 'Rectangle' }] }))
      .toEqual([{ label: 'A', text: 'Square', url: blob }]);
  });

  it('drops entries without an image and handles questions with none', () => {
    expect(getOptionImages({ optionImages: [{ label: 'A', url: '' }] })).toEqual([]);
    expect(getOptionImages({ optionImages: [{ label: 'A', url: 'not-an-image' }] })).toEqual([]);
    expect(getOptionImages({})).toEqual([]);
    expect(getOptionImages({ values: ['A. Square', 'B. Rectangle'] })).toEqual([]);
  });
});

describe('regenerateQuestionImageWithOptions request body', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null, setItem: () => { }, removeItem: () => { }, clear: () => { },
    } as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  const capture = () => {
    const calls: any[] = [];
    global.fetch = vi.fn(async (_url: any, init: any) => {
      calls.push(JSON.parse(init.body));
      return {
        text: async () => JSON.stringify({
          status: 'success',
          image_required: true,
          generatedImageUrl: PNG,
          option_images: [{ label: 'A', text: 'Square', generatedImageUrl: PNG }],
        }),
      } as any;
    }) as any;
    return calls;
  };

  it('sends the options for a Multiple Choice question and returns their images', async () => {
    const calls = capture();
    const result = await regenerateQuestionImageWithOptions(
      { type: 'Multiple Choice', label: 'Which shape?', values: ['A. Square', 'B. Rectangle'] },
      'make it clearer',
    );
    expect(calls[0].options).toEqual(['A. Square', 'B. Rectangle']);
    expect(calls[0].option_aspect_ratio).toBe('1:1');
    expect(calls[0].prompt).toContain('Which shape?');
    expect(result.imageUrl).toBe(PNG);
    expect(result.optionImages).toEqual([{ label: 'A', text: 'Square', url: PNG }]);
  });

  it('leaves the body unchanged for a Written Response question', async () => {
    const calls = capture();
    await regenerateQuestionImageWithOptions(
      { type: 'Written Response', label: 'Explain photosynthesis.', values: [] },
      'add a diagram',
    );
    expect(calls[0].options).toBeUndefined();
    expect(calls[0].option_aspect_ratio).toBeUndefined();
    expect(Object.keys(calls[0]).sort()).toEqual(['aspect_ratio', 'number_of_images', 'prompt']);
  });
});
