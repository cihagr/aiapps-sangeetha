// config.js
// Centralized API configuration. Every base URL/host below comes from .env
// (import.meta.env.VITE_*) — never hardcode a URL here or in a consuming file.
// NOTE: VITE_API_BASE_URL is the bare host (also used by src/api.ts for
// /aiapps/Login and /aiapps/AIProductApi paths) — this module needs the
// knowledgebase prefix appended. VITE_API_QUIZ_URL (used by src/api.ts) is a
// different, unrelated, currently-unused path — VITE_AIG_ITEM_GEN_API_URL is
// the real existing key for "/aiapps/AIG/QuizGenApi" (same value src/utils/
// Aigapi.ts already uses, aliased there as AIG_QUIZ_GEN_URL).
const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL}/aiapps/knowledgebase`;
const API_QUIZ_GEN = import.meta.env.VITE_AIG_ITEM_GEN_API_URL;
const API_APPS_URL = import.meta.env.VITE_API_APPS_URL;
const LLM_CONFIG_API_URL = import.meta.env.VITE_LLM_CONFIG_API_URL;
const CLIENT_ID = "APPINTEGRATION";
const CLIENT_SECRET_KEY = "Excelsoftcorp";

// Service-family bases used by pages that don't already import from
// src/api.ts or src/utils/Aigapi.ts.
const AZURE_DECRYPT_FUNCTION_URL = import.meta.env.VITE_AZURE_DECRYPT_FUNCTION_URL;
const BLOB_STORAGE_URL = import.meta.env.VITE_BLOB_STORAGE_URL;
const IMAGE_BLOB_STORAGE_URL = import.meta.env.VITE_IMAGE_BLOB_STORAGE_URL;
const IMAGE_BLOB_SAS_TOKEN = import.meta.env.VITE_IMAGE_BLOB_SAS_TOKEN;

// Where uploaded book/KB images live. Must match the backend's
// VECTOR_STORAGE_PROVIDER (knowledgebase .env): "azure" or "aws".
const STORAGE_PROVIDER = (import.meta.env.VITE_STORAGE_PROVIDER || "azure").trim().toLowerCase();

const STORAGE_CONFIG = {
  azure: {
    // Images are read straight from the blob container.
    imageBaseUrl: IMAGE_BLOB_STORAGE_URL || "",
    imageQuery: IMAGE_BLOB_SAS_TOKEN || "",
  },
  aws: {
    // The S3 bucket is private and AWS keys must never be in the frontend
    // (Vite bakes VITE_* values into the public JS bundle). The knowledgebase
    // API's /image/<key> endpoint redirects to a short-lived signed S3 URL.
    // Override with VITE_AWS_IMAGE_BASE_URL only for a public bucket/CDN.
    imageBaseUrl: import.meta.env.VITE_AWS_IMAGE_BASE_URL || `${API_BASE_URL}/image`,
    imageQuery: "",
  },
};

const ACTIVE_STORAGE = STORAGE_CONFIG[STORAGE_PROVIDER] || STORAGE_CONFIG.azure;

/**
 * Full URL for an uploaded image path such as "/assets/images/123_cover.png".
 * azure: exactly the original IMAGE_BLOB_STORAGE_URL + path + SAS token.
 * aws:   the knowledgebase /image endpoint (absolute/data/blob URLs pass
 *        through; non-upload paths load from the app itself).
 */
function getImageUrl(imagePath) {
  if (STORAGE_PROVIDER !== "aws") {
    // Unchanged pre-AWS behaviour -- do not normalise anything here.
    return IMAGE_BLOB_STORAGE_URL + imagePath + IMAGE_BLOB_SAS_TOKEN;
  }
  if (!imagePath) return "";
  if (/^(https?:|data:|blob:)/i.test(imagePath)) return imagePath;
  const path = String(imagePath).replace(/^\.?\/+/, "");
  // On AWS only uploads (assets/images/...) are in S3; anything else, like
  // the default card image, is a static file served with the app itself.
  if (STORAGE_PROVIDER === "aws" && !path.startsWith("assets/images/")) {
    return `/${path}`;
  }
  const base = ACTIVE_STORAGE.imageBaseUrl.replace(/\/+$/, "");
  return `${base}/${path}${ACTIVE_STORAGE.imageQuery}`;
}
const ESSAY_EVAL_API_URL = import.meta.env.VITE_ESSAY_EVAL_API_URL;
const ESSAY_EVAL_DEMO_USERNAME = import.meta.env.VITE_ESSAY_EVAL_DEMO_USERNAME;
const ESSAY_EVAL_DEMO_PASSWORD = import.meta.env.VITE_ESSAY_EVAL_DEMO_PASSWORD;
const METADATA_API_URL = import.meta.env.VITE_METADATA_API_URL;
const METADATA_TEMPLATE_URL = import.meta.env.VITE_METADATA_TEMPLATE_URL;
const ITEM_SIMILARITY_API_URL = import.meta.env.VITE_ITEM_SIMILARITY_API_URL;
const ITEM_SIMILARITY_TEMPLATE_URL = import.meta.env.VITE_ITEM_SIMILARITY_TEMPLATE_URL;
const ITEM_REWRITER_TEMPLATE_URL = import.meta.env.VITE_ITEM_REWRITER_TEMPLATE_URL;
const VALIDATE_TOKEN_API_URL = import.meta.env.VITE_VALIDATE_TOKEN_API_URL;
const DOCUMENT_CHAT_API_URL = import.meta.env.VITE_DOCUMENT_CHAT_API_URL;
// Dedicated key — do NOT reuse VITE_API_BASE/getApiBase() from src/api/base.ts:
// that helper's dev-mode branch proxies to a different, unrelated backend
// (see vite.config.ts's '/api' proxy target), so it's unsafe for Speech Eval.
const SPEECH_EVAL_API_URL = import.meta.env.VITE_SPEECH_EVAL_API_URL;
const HELP_URL = import.meta.env.VITE_HELP_URL;
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL;
const EULA_URL = import.meta.env.VITE_EULA_URL;
const APP_PUBLIC_URL = import.meta.env.VITE_APP_PUBLIC_URL;
const REGISTER_EMAIL_IMAGE_URL = import.meta.env.VITE_REGISTER_EMAIL_IMAGE_URL;
const BOT_WIDGET_SCRIPT_URL = import.meta.env.VITE_BOT_WIDGET_SCRIPT_URL;

export const API_ENDPOINTS = {
  GET_CUSTOMER_DATA: `${API_BASE_URL}/get-customer-data`,
  UPDATE_ACTIVE_REGISTERED_USER: `${API_APPS_URL}/updateActiveRegisteredUser`,
  AZURE_DECRYPT_FUNCTION: AZURE_DECRYPT_FUNCTION_URL,
  GET_CUSTOMER_DATA_SLASH: `${API_BASE_URL}/get-customer-data/`,
  GET_EXISTING_KB: `${API_BASE_URL}/get-existing-knowledgebase`,
  GET_KB_DETAILS: `${API_BASE_URL}/get_kb_details`,
  LIST_BOOK_IMAGES: `${API_BASE_URL}/list_book_images`,
  LIST_KB_FILES: `${API_BASE_URL}/list_kb_files`,
  // Document and image management endpoints
  PROCESS_DOCUMENTS: `${API_BASE_URL}/process_documents`,
  GENERATE_AUTH_TOKEN: `${API_BASE_URL}/generate_auth_token`,
  CREATE_KNOWLEDGEBASE: `${API_BASE_URL}/create-knowledgebase`,
  UPDATE_KNOWLEDGEBASE: `${API_BASE_URL}/update-knowledgebase`,
  REMOVE_KB_FILES: `${API_BASE_URL}/remove-kb-files`,
  DOWNLOAD_KB_FILE: `${API_BASE_URL}/download_kb_file`,
  REMOVE_IMAGE: `${API_BASE_URL}/remove-image`,
  DELETE_KB_DATAS: `${API_BASE_URL}/delete-kb-datas`,
  DELETE_BOOK_DETAILS: `${API_BASE_URL}/delete-book-details`,
  IMPORT_ITEMS: `${API_BASE_URL}/import-items`,
  UPLOAD_STUDY_LO: `${API_BASE_URL}/upload-study-lo`,
  // Option metadata and LOVs
  GET_METADATA: `${API_BASE_URL}/get-metadata`, // usage: `${GET_METADATA}/{id}`
  GET_BOOK_ID_NAME: `${API_BASE_URL}/get-book-id-name`,
  // Master Item Meta Data + mapping (Manage Item Meta Data page)
  GET_MASTER_ITEM_METADATA: `${API_QUIZ_GEN}/get-master-item-metadata`,
  SAVE_MASTER_ITEM_METADATA: `${API_QUIZ_GEN}/save-master-item-metadata`,
  DELETE_MASTER_ITEM_METADATA: `${API_QUIZ_GEN}/delete-master-item-metadata`,
  GET_ITEM_METADATA_MAPPING: `${API_QUIZ_GEN}/get-item-metadata-mapping`,
  TAG_ITEM_METADATA: `${API_QUIZ_GEN}/tag-item-metadata`,
  GET_BOOKS_DETAILS: `${API_BASE_URL}/get-books-details`,
  GET_CHAPTER_LO_DETAILS: `${API_BASE_URL}/get-chapter-lo-details`,
  UPDATE_CHAPTER_LO_DETAILS: `${API_BASE_URL}/update-chapter-lo-details`,
  DELETE_ALL_CHAPTER_LO_DETAILS: `${API_BASE_URL}/delete-chapter-lo-details`,
  GET_ORGANIZATION_DETAILS: `${API_BASE_URL}/get-organization-details`,
  GET_APPS: `${API_BASE_URL}/get-apps`,
  GET_LLM_CONFIGURATIONS: `${API_QUIZ_GEN}/get-llm-configurations`,
  // Single upsert endpoint: id 0/omitted = create, existing id = update.
  SAVE_LLM_CONFIGURATION: `${API_QUIZ_GEN}/save-llm-configuration`,
  DELETE_LLM_CONFIGURATION: `${API_QUIZ_GEN}/delete-llm-configuration`,
  // External AIG quiz chapters
 
  // External AIG quiz chapters
  AIG_CHAPTERS: `${API_QUIZ_GEN}/chapter`,
  // Add other endpoints here as needed (future-proofing)
  // Guidelines endpoints
  GET_GUIDELINE: `${API_BASE_URL}/get-guideline`,
  GET_GENERAL_GUIDELINES: `${API_BASE_URL}/get-general-guidelines`,
  SAVE_BOOK: `${API_BASE_URL}/save-book`,

  SAVE_KB_GUIDELINE_MAPPING: `${API_BASE_URL}/save-kb-guideline-mapping`,
  SAVE_GUIDELINE: `${API_BASE_URL}/save-guideline`,
  DELETE_GUIDELINE: `${API_BASE_URL}/delete-guideline`,
  DELETE_GUIDELINE_DOCUMENT: `${API_BASE_URL}/delete-guideline-document`,
  CHECK_GUIDELINE: `${API_BASE_URL}/check-guideline`,
  // Dynamic dropdown endpoints
  GUIDELINE_TYPES: `${API_BASE_URL}/guideline-types`,
  GUIDELINE_SUBTYPES: `${API_BASE_URL}/guideline-subtypes`,
  // Chat endpoint
  ASK_QUESTION: `${API_BASE_URL}/ask_question`,
  CHECK_KB: `${API_BASE_URL}/check-kb`,
  CHECK_BOOK: `${API_BASE_URL}/check-book`,
  GET_AGENT_CONFIG: `${API_QUIZ_GEN}/get-agent-config`,
  INSERT_AGENT_CONFIG: `${API_QUIZ_GEN}/insert_agent_config`,
  GET_AGENTS: `${API_QUIZ_GEN}/get-agents`,
  // Static templates
  DOWNLOAD_STUDY_LO_TEMPLATE: `${BLOB_STORAGE_URL}/ChapterAndLODetails.csv`,
};

export default {
  API_BASE_URL,
  API_QUIZ_GEN,
  API_APPS_URL,
  API_ENDPOINTS,
  CLIENT_ID,
  CLIENT_SECRET_KEY,
  BLOB_STORAGE_URL,
  IMAGE_BLOB_STORAGE_URL,
  IMAGE_BLOB_SAS_TOKEN,
  STORAGE_PROVIDER,
  STORAGE_CONFIG,
  getImageUrl,
  ESSAY_EVAL_API_URL,
  ESSAY_EVAL_DEMO_USERNAME,
  ESSAY_EVAL_DEMO_PASSWORD,
  METADATA_API_URL,
  METADATA_TEMPLATE_URL,
  ITEM_SIMILARITY_API_URL,
  ITEM_SIMILARITY_TEMPLATE_URL,
  ITEM_REWRITER_TEMPLATE_URL,
  VALIDATE_TOKEN_API_URL,
  DOCUMENT_CHAT_API_URL,
  SPEECH_EVAL_API_URL,
  HELP_URL,
  PRIVACY_URL,
  EULA_URL,
  APP_PUBLIC_URL,
  REGISTER_EMAIL_IMAGE_URL,
  BOT_WIDGET_SCRIPT_URL,
};

export {
  STORAGE_PROVIDER,
  STORAGE_CONFIG,
  getImageUrl,
  BLOB_STORAGE_URL,
  IMAGE_BLOB_STORAGE_URL,
  IMAGE_BLOB_SAS_TOKEN,
  ESSAY_EVAL_API_URL,
  ESSAY_EVAL_DEMO_USERNAME,
  ESSAY_EVAL_DEMO_PASSWORD,
  METADATA_API_URL,
  METADATA_TEMPLATE_URL,
  ITEM_SIMILARITY_API_URL,
  ITEM_SIMILARITY_TEMPLATE_URL,
  ITEM_REWRITER_TEMPLATE_URL,
  VALIDATE_TOKEN_API_URL,
  DOCUMENT_CHAT_API_URL,
  SPEECH_EVAL_API_URL,
  HELP_URL,
  PRIVACY_URL,
  EULA_URL,
  APP_PUBLIC_URL,
  REGISTER_EMAIL_IMAGE_URL,
  BOT_WIDGET_SCRIPT_URL,
};
