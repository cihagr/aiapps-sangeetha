/**
 * Field accessors for chapter and learning-objective records.
 *
 * The APIs return these with wildly inconsistent key names (`chapternameid`,
 * `chapterid`, `chaptercode`, `chapterCode`, ...), and each screen had its own
 * hand-written subset. Where a screen's subset missed the key the API actually
 * used, the record could not be found: the image picker then built its folder path
 * from the raw selected code instead of the chapter/LO *name* and listed a folder
 * that does not exist, so it showed no images.
 *
 * Both screens now read these records through the same helpers.
 */

/** Stable identity for a chapter — used as the dropdown value and for lookups. */
export const chapterKeyOf = (i: any) =>
  i?.chapternameid ?? i?.chapterid ?? i?.chapter_id ?? i?.chaptercode ?? i?.chapterCode ??
  i?.chapter_code ?? i?.chaptername ?? i?.chapter_name;

/** Display/folder name for a chapter, falling back to its key. */
export const chapterNameOf = (i: any) =>
  i?.chaptername ?? i?.chapterName ?? i?.chapter_name ?? String(chapterKeyOf(i) ?? '');

/** Stable identity for a learning objective. */
export const loKeyOf = (i: any) =>
  i?.learningoutcomenameid ?? i?.loid ?? i?.lo_id ?? i?.locode ?? i?.loCode ?? i?.lo_code ??
  i?.learningoutcomename ?? i?.loname ?? i?.lo_name;

/** Display/folder name for a learning objective, falling back to its key. */
export const loNameOf = (i: any) =>
  i?.learningoutcomename ?? i?.loname ?? i?.loName ?? i?.lo_name ?? String(loKeyOf(i) ?? '');
