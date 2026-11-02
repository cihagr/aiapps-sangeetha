// src/utils/config.ts
// Both URLs come from .env (VITE_LOCAL_API_PROXY_URL for dev, VITE_AI_URL for prod).
export const getApiBaseUrl = () => {
    if (import.meta.env.DEV) {
      return import.meta.env.VITE_LOCAL_API_PROXY_URL; // Local proxy
    }
    return import.meta.env.VITE_AI_URL;
  };
