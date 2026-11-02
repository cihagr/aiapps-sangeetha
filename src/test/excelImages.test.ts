import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { embedRowImages, rowImageSources, type EmbeddableImage } from '@/utils/excelImages';

// 200x140 landscape PNG
const LANDSCAPE_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAACMCAIAAAD/1/vjAAAAWklEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwbSAAAAV1F1sYAAAAASUVORK5CYII=';
// 100x200 portrait PNG
const PORTRAIT_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAADIAQAAAAAmZ7uJAAAAH0lEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjIJhCwAIAAAB9J5cvQAAAABJRU5ErkJggg==';

const AI_IMAGE = `data:image/png;base64,${LANDSCAPE_B64}`;
const MANUAL_IMAGE = 'https://esknowledgebase.blob.core.windows.net/esaiknowledgebase/image_repository/general_images/one.png';

const img = (base64: string, width: number, height: number): EmbeddableImage =>
  ({ extension: 'png', base64, width, height });

const cache = new Map<string, EmbeddableImage>([
  [AI_IMAGE, img(LANDSCAPE_B64, 200, 140)],
  [MANUAL_IMAGE, img(PORTRAIT_B64, 100, 200)],
]);

const buildSheet = async (rows: any[]) => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('S');
  sheet.columns = [
    { header: 'Question Identifier', key: 'id', width: 30 },
    { header: 'Question Stem', key: 'stem', width: 50 },
  ];
  rows.forEach(r => sheet.addRow({ id: r.id, stem: r.stem }));
  const used = embedRowImages(wb, sheet, rows, {
    firstImageColumn: sheet.columnCount + 1,
    cache,
  });
  const buffer = await wb.xlsx.writeBuffer();
  return { wb, sheet, used, buffer };
};

describe('rowImageSources', () => {
  it('prefers the full list', () => {
    expect(rowImageSources({ __imageDataUrls: ['a', 'b'], __imageDataUrl: 'a' })).toEqual(['a', 'b']);
  });

  it('falls back to the single legacy field', () => {
    expect(rowImageSources({ __imageDataUrl: 'a' })).toEqual(['a']);
  });

  it('ignores blanks', () => {
    expect(rowImageSources({ __imageDataUrls: ['', '  ', 'a'] })).toEqual(['a']);
  });
});

describe('embedRowImages', () => {
  it('embeds BOTH images when a question has an AI one and a manual one', async () => {
    const rows = [{
      id: 'q1',
      stem: 'has two images',
      __imageDataUrl: AI_IMAGE,
      __imageDataUrls: [AI_IMAGE, MANUAL_IMAGE],
    }];
    const { wb, sheet, used } = await buildSheet(rows);

    expect(used).toBe(2);
    const images = sheet.getImages();
    expect(images).toHaveLength(2);

    // One column each, so they cannot overlap.
    const cols = images.map((i: any) => i.range.tl.nativeCol).sort();
    expect(new Set(cols).size).toBe(2);
    expect(cols[1] - cols[0]).toBe(1);

    // Both anchored to the same (first) data row.
    expect(new Set(images.map((i: any) => i.range.tl.nativeRow)).size).toBe(1);

    expect(wb.model.media).toHaveLength(2);
  });

  it('keeps each picture at its own aspect ratio', async () => {
    const rows = [{ id: 'q1', stem: 's', __imageDataUrls: [AI_IMAGE, MANUAL_IMAGE] }];
    const { sheet } = await buildSheet(rows);
    const [first, second] = sheet.getImages();

    const extOf = (i: any) => i.range.ext as { width: number; height: number };
    const r1 = extOf(first).width / extOf(first).height;
    const r2 = extOf(second).width / extOf(second).height;
    expect(r1).toBeCloseTo(200 / 140, 2);
    expect(r2).toBeCloseTo(100 / 200, 2);
  });

  it('labels the columns when there is more than one image', async () => {
    const rows = [{ id: 'q1', stem: 's', __imageDataUrls: [AI_IMAGE, MANUAL_IMAGE] }];
    const { sheet } = await buildSheet(rows);
    expect(sheet.getCell(1, 3).value).toBe('Generated Image 1');
    expect(sheet.getCell(1, 4).value).toBe('Generated Image 2');
  });

  it('uses a single unnumbered column when every question has one image', async () => {
    const rows = [{ id: 'q1', stem: 's', __imageDataUrls: [AI_IMAGE] }];
    const { sheet, used } = await buildSheet(rows);
    expect(used).toBe(1);
    expect(sheet.getCell(1, 3).value).toBe('Generated Image');
    expect(sheet.getImages()).toHaveLength(1);
  });

  it('handles a mix: one question with two images, one with a single image', async () => {
    const rows = [
      { id: 'q1', stem: 'two', __imageDataUrls: [AI_IMAGE, MANUAL_IMAGE] },
      { id: 'q2', stem: 'one', __imageDataUrls: [AI_IMAGE] },
    ];
    const { sheet, used } = await buildSheet(rows);
    expect(used).toBe(2);
    expect(sheet.getImages()).toHaveLength(3);

    const rowsOfImages = sheet.getImages().map((i: any) => i.range.tl.nativeRow);
    // two on the first data row, one on the second
    expect(rowsOfImages.filter((r: number) => r === 1)).toHaveLength(2);
    expect(rowsOfImages.filter((r: number) => r === 2)).toHaveLength(1);
  });

  it('skips images that could not be loaded, keeping the rest', async () => {
    const rows = [{ id: 'q1', stem: 's', __imageDataUrls: ['https://unreadable/x.png', AI_IMAGE] }];
    const { sheet, used } = await buildSheet(rows);
    expect(used).toBe(1);
    expect(sheet.getImages()).toHaveLength(1);
  });

  it('does nothing when the question has no image', async () => {
    const rows = [{ id: 'q1', stem: 's', __imageDataUrls: [] }];
    const { sheet, used } = await buildSheet(rows);
    expect(used).toBe(0);
    expect(sheet.getImages()).toHaveLength(0);
  });
});
