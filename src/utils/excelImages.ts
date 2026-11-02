/**
 * Places a question's pictures into an Excel sheet.
 *
 * Shared by both export screens. It used to be hand-copied into each of them, and
 * the copies drifted: one embedded only the first picture, so a question carrying
 * an AI-generated image AND one the user added exported just the AI one.
 */

export interface EmbeddableImage {
  extension: string;
  bytes?: Uint8Array;
  base64?: string;
  width?: number;
  height?: number;
}

/** Every image source on a row, newest export format first. */
export const rowImageSources = (row: any): string[] => {
  const list = Array.isArray(row?.__imageDataUrls) && row.__imageDataUrls.length
    ? row.__imageDataUrls
    : [row?.__imageDataUrl];
  return list.map((u: any) => String(u || '').trim()).filter(Boolean);
};

/**
 * Scales a picture to fit inside a box without distorting it. Never enlarges.
 * (Duplicated from exportImages so this module stays free of fetch concerns.)
 */
const fitWithin = (
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

export interface EmbedRowImagesOptions {
  /** 1-based column that holds the first picture. */
  firstImageColumn: number;
  /** Images already loaded, keyed by their source string. */
  cache: Map<string, EmbeddableImage>;
  /** 1-based sheet row of the first data row. Defaults to 2 (row 1 is the header). */
  firstDataRow?: number;
  /** Header for the image columns. */
  headerLabel?: string;
  /** Keep whatever header the first image column already has. */
  keepFirstHeader?: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * Writes one column per picture and anchors each image inside its own cell.
 *
 * One column per picture is deliberate: ExcelJS converts a FRACTIONAL column offset
 * against a default column width rather than the width actually set, so placing
 * several images side by side within a single cell makes them overlap.
 *
 * Returns how many image columns were used.
 */
export const embedRowImages = (
  workbook: any,
  sheet: any,
  rows: any[],
  options: EmbedRowImagesOptions
): number => {
  if (!workbook || !sheet || !Array.isArray(rows) || rows.length === 0) return 0;

  const {
    firstImageColumn,
    cache,
    firstDataRow = 2,
    headerLabel = 'Generated Image',
    keepFirstHeader = false,
    maxWidth = 170,
    maxHeight = 120,
  } = options;

  const imagesFor = (row: any): EmbeddableImage[] =>
    rowImageSources(row).map(src => cache.get(src)).filter(Boolean) as EmbeddableImage[];

  const maxImagesPerRow = rows.reduce(
    (most: number, row: any) => Math.max(most, imagesFor(row).length),
    0
  );
  if (maxImagesPerRow === 0) return 0;

  for (let i = 0; i < maxImagesPerRow; i += 1) {
    const col = firstImageColumn + i;
    try {
      if (!(keepFirstHeader && i === 0)) {
        sheet.getCell(1, col).value = maxImagesPerRow > 1 ? `${headerLabel} ${i + 1}` : headerLabel;
      }
      // Excel column width is roughly (chars * 7 + 5) pixels.
      sheet.getColumn(col).width = Math.round((maxWidth + 16 - 5) / 7);
      sheet.getColumn(col).alignment = { vertical: 'middle', horizontal: 'center' };
    } catch { /* a sheet without these helpers still gets its images */ }
  }

  rows.forEach((row: any, idx: number) => {
    const images = imagesFor(row);
    if (images.length === 0) return;

    const excelRow = firstDataRow + idx;
    let tallest = 0;

    images.forEach((image, imgIdx) => {
      try {
        const imageId = image.base64
          ? workbook.addImage({
            base64: `data:image/${image.extension};base64,${image.base64}`,
            extension: image.extension,
          })
          : workbook.addImage({ buffer: image.bytes, extension: image.extension });

        // Keep the picture's own proportions: forcing a fixed box stretched
        // anything that was not exactly that shape.
        const size = fitWithin(image, maxWidth, maxHeight);
        tallest = Math.max(tallest, size.height);

        // A small offset keeps each picture inside its own cell rather than
        // sitting on the gridline.
        sheet.addImage(imageId, {
          tl: { col: firstImageColumn - 1 + imgIdx + 0.05, row: excelRow - 1 + 0.05 },
          ext: { width: size.width, height: size.height },
          editAs: 'oneCell',
        });
      } catch (e) {
        console.warn('Failed embedding Excel image at row', excelRow, e);
      }
    });

    try {
      // Excel row heights are in points (1px = 0.75pt).
      sheet.getRow(excelRow).height = Math.max(30, Math.round((tallest + 12) * 0.75));
      sheet.getRow(excelRow).alignment = { vertical: 'middle', wrapText: true };
    } catch { /* ignore */ }
  });

  return maxImagesPerRow;
};

export default embedRowImages;
