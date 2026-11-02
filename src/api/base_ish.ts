// Centralized base URL picker for API calls
export const getApiBase = (): string => {
  const mode = import.meta.env.MODE;
  const prodBase = import.meta.env.VITE_API_BASE as string | undefined;
  if (mode === 'development') return '/api';
  // In production, we must return an absolute URL. Falls back to VITE_SPEECH_EVAL_API_URL (from .env).
  return (prodBase && prodBase.trim().length > 0)
    ? prodBase
    : import.meta.env.VITE_SPEECH_EVAL_API_URL as string;
};
