/**
 * Folder paths for the AIG image repository (Azure blob).
 *
 * The picker lists `folder_path` and the "Browse Local Image" button uploads to
 * `folder_path`. Those two used to be built by separate pieces of code: the list
 * honoured the General / Question-Specific choice while the upload ALWAYS wrote to
 * the book/chapter/LO folder. A file uploaded while "General Images" was selected
 * therefore landed in a folder the picker was not showing — it looked fine until
 * the list refreshed, and the image never made it onto the question.
 *
 * Both sides now call this helper so they can never disagree.
 */

/** Blob folder names cannot contain these characters. */
export const sanitizeFolderSegment = (value: any): string =>
  String(value ?? '').replace(/[/\\?%*:|"<> ]/g, '_');

/**
 * The book folder the image repository stores under.
 *
 * `bookTitle` is the book the user opened (set from the dashboard card) and is what
 * the Image Repository page and the question picker both list. A question's own
 * `bookname` can be a different label for the same material — a generated question
 * carried "Grade_6-Math-Book" while its images live under "Grade_6-Math_Fractions" —
 * so reading it first pointed the picker at a folder that does not exist.
 */
export const resolveImageBookName = (target?: any): string => {
  let sessionTitle = '';
  try {
    sessionTitle = String(sessionStorage.getItem('bookTitle') || '').trim();
  } catch {
    sessionTitle = '';
  }
  return sessionTitle
    || String(target?.bookname ?? target?.BookName ?? '').trim()
    || 'Book';
};

export interface ImageFolderParts {
  /** "general" lists/uploads the shared pool; "specific" scopes to the book. */
  destination: 'general' | 'specific';
  /** Customer code — the first level of the blob hierarchy. */
  custCode?: any;
  /** Organisation code — the second level, below the customer. */
  orgCode?: any;
  bookName?: any;
  chapterName?: any;
  loName?: any;
}

/**
 * The Customer / Organisation prefix every image path sits under:
 * `Customer/Organisation/`, `Customer/` when no organisation is known, and `''` when
 * neither is — which reproduces exactly the paths used before this hierarchy existed.
 */
export const buildImageScopePrefix = (custCode?: any, orgCode?: any): string => {
  const cust = sanitizeFolderSegment(custCode);
  if (!cust) return '';
  const org = sanitizeFolderSegment(orgCode);
  return org ? `${cust}/${org}/` : `${cust}/`;
};

/** Customer / Organisation of the signed-in user, read from the session. */
export const resolveImageScope = (): { custCode: string; orgCode: string } => {
  const read = (...keys: string[]): string => {
    try {
      for (const key of keys) {
        const value = String(sessionStorage.getItem(key) ?? '').trim();
        if (value) return value;
      }
    } catch { /* storage unavailable */ }
    return '';
  };

  let custCode = read('custcode', 'customerCode', 'custCode');
  let orgCode = read('orgcode', 'orgCode', 'organizationCode');

  if (!custCode || !orgCode) {
    try {
      const info = JSON.parse(sessionStorage.getItem('userInfo') || '{}') || {};
      custCode = custCode || String(info.customerCode ?? info.custCode ?? info.custcode ?? '').trim();
      orgCode = orgCode || String(info.orgCode ?? info.organizationCode ?? info.orgcode ?? '').trim();
    } catch { /* not stored / not JSON */ }
  }

  return { custCode, orgCode };
};

/**
 * Returns the `folder_path` to send to list-images / upload-images.
 * An empty string means the shared "general images" pool.
 */
export const buildImageFolderPath = ({
  destination,
  custCode,
  orgCode,
  bookName,
  chapterName,
  loName,
}: ImageFolderParts): string => {
  // Everything hangs off Customer/Organisation, the general pool included. With no
  // customer known the prefix is empty and the path is exactly what it was before.
  const scope = buildImageScopePrefix(custCode, orgCode);

  if (destination !== 'specific') return scope;

  const book = sanitizeFolderSegment(bookName);
  if (!book) return scope;

  let path = `${scope}${book}/`;
  const chapter = sanitizeFolderSegment(chapterName);
  if (!chapter) return path;

  path += `${chapter}/`;
  const lo = sanitizeFolderSegment(loName);
  if (lo) path += `${lo}/`;
  return path;
};

export default buildImageFolderPath;
