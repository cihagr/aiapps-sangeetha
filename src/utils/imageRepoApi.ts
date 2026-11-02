/**
 * Image repository requests, scoped to the signed-in Customer / Organisation.
 *
 * Every image now lives under `Customer/Organisation/...` in blob storage, and the
 * customer and organisation codes are sent as fields as well, so the server can
 * enforce the same segregation once it reads them.
 *
 * Images uploaded before that hierarchy existed sit at the unscoped path
 * (`Book/Chapter/`), so listing also reads the unscoped folder and merges the two —
 * without it every existing image would disappear from the pickers. Uploads only ever
 * write to the scoped path.
 */

import {
  buildImageFolderPath,
  buildImageScopePrefix,
  resolveImageScope,
  type ImageFolderParts,
} from './imageRepoPath';
import { AGENT_GENERATIVE_API_URL } from './Aigapi';

const BASE_URL = AGENT_GENERATIVE_API_URL;

export type ImageFolderSelection = Omit<ImageFolderParts, 'custCode' | 'orgCode'>;

/** The scoped path an upload writes to, plus the unscoped path older images use. */
export const buildScopedAndLegacyPaths = (parts: ImageFolderSelection) => {
  const { custCode, orgCode } = resolveImageScope();
  return {
    custCode,
    orgCode,
    scopedPath: buildImageFolderPath({ ...parts, custCode, orgCode }),
    legacyPath: buildImageFolderPath(parts),
  };
};

/** Identity used to drop images returned by both the scoped and unscoped folder. */
const imageKey = (image: any): string => {
  if (typeof image === 'string') return image;
  return String(
    image?.url ?? image?.image_url ?? image?.imageUrl ?? image?.path ?? image?.name ?? JSON.stringify(image)
  );
};

/**
 * As listScopedImages, but for a caller that already has the unscoped folder path
 * (everything below Customer/Organisation) rather than its parts.
 */
export const listScopedImagesByPath = (token: string, legacyFolderPath: string) => {
  const { custCode, orgCode } = resolveImageScope();
  const scope = buildImageScopePrefix(custCode, orgCode);
  return listFolders(token, `${scope}${legacyFolderPath}`, legacyFolderPath, custCode, orgCode);
};

/**
 * Lists the images of one folder for the current Customer / Organisation, merged with
 * the images stored at the same folder before the scope existed.
 */
export const listScopedImages = async (
  token: string,
  parts: ImageFolderSelection
): Promise<any[]> => {
  const { custCode, orgCode, scopedPath, legacyPath } = buildScopedAndLegacyPaths(parts);
  return listFolders(token, scopedPath, legacyPath, custCode, orgCode);
};

const listFolders = async (
  token: string,
  scopedPath: string,
  legacyPath: string,
  custCode: string,
  orgCode: string
): Promise<any[]> => {

  const fetchFolder = async (folderPath: string): Promise<any[]> => {
    const params = new URLSearchParams({ folder_path: folderPath, auth_token: token });
    // Sent alongside the path so the server can scope the response itself.
    if (custCode) params.set('custcode', custCode);
    if (orgCode) params.set('orgcode', orgCode);

    try {
      const response = await fetch(`${BASE_URL}/list-images?${params.toString()}`, {
        method: 'GET',
      });
      const data = await response.json();
      return data?.status === 'success' && Array.isArray(data.images) ? data.images : [];
    } catch {
      // One folder failing must not lose the other's images.
      return [];
    }
  };

  // Identical paths mean no customer is known, so there is only one folder to read.
  const folders = scopedPath === legacyPath ? [scopedPath] : [scopedPath, legacyPath];
  const results = await Promise.all(folders.map(fetchFolder));

  const seen = new Set<string>();
  const merged: any[] = [];
  results.flat().forEach((image: any) => {
    const key = imageKey(image);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(image);
  });
  return merged;
};

/**
 * Adds the customer / organisation codes to an upload request. The folder path itself
 * already carries them; these let the server apply its own scoping.
 */
export const appendImageScopeFields = (formData: FormData): void => {
  const { custCode, orgCode } = resolveImageScope();
  if (custCode) formData.append('custcode', custCode);
  if (orgCode) formData.append('orgcode', orgCode);
};
