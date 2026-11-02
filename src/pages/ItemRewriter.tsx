import { useState, useEffect, useCallback, useRef } from "react";
// Dictionary of technical terms and their translations
const TECHNICAL_TERMS: Record<string, Record<string, string>> = {
  'hi': { // Hindi
    'Microsoft Excel': 'माइक्रोसॉफ्ट एक्सेल',
    'Excel': 'एक्सेल',
    'Windows': 'विंडोज',
    'PowerPoint': 'पावरपॉइंट',
    'Word': 'वर्ड',
    'Google': 'गूगल',
    'Chrome': 'क्रोम',
    'Android': 'ऍन्ड्रॉइड',
    'iPhone': 'आईफोन',
    'iOS': 'आईओएस',
    'macOS': 'मैकओएस',
    'Linux': 'लिनक्स',
    'Python': 'पायथन',
    'JavaScript': 'जावास्क्रिप्ट',
    'Java': 'जावा',
    'C++': 'सी++',
    'C#': 'सी#',
    'SQL': 'एसक्यूएल',
    'HTML': 'एचटीएमएल',
    'CSS': 'सीएसएस',
    'API': 'एपीआई',
    'URL': 'यूआरएल',
    'WiFi': 'वाईफाई',
    'Bluetooth': 'ब्लूटूथ',
    'PDF': 'पीडीएफ',
    'JPG': 'जेपीजी',
    'PNG': 'पीएनजी'
  },
  // Add more languages as needed
};
// Function to translate technical terms in text
const translateTechnicalTerms = (text: string, language: string): string => {
  if (!text || language === 'English') return text;

  const translations = TECHNICAL_TERMS[language.toLowerCase()] || {};
  let translatedText = text;

  // Replace all occurrences of technical terms
  Object.entries(translations).forEach(([en, translated]) => {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    translatedText = translatedText.replace(regex, translated);
  });

  return translatedText;
};
import { getTFOptions } from "@/utils/getTFOptions";
import { ArrowLeft, Upload, Download, FileText, RefreshCw, Trash2, Sparkles, Clock, BarChart3 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast, useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { VALIDATE_TOKEN_API_URL, ITEM_REWRITER_TEMPLATE_URL } from "@/config";
import { API_BASE_URL } from "@/api";
interface QuestionData {
  questionNo: string;
  passage: string;
  questions: string; // Changed to match API response
}

interface RewrittenQuestion {
  original: string;
  rewritten: string;
  passage: string;
  questionNo: string;
}

interface TokenData {
  utilizedtoken: number;
  totaltoken: number;
  remainingtoken: number;
}
interface AuthData {
  customerCode: string;
  orgCode: string;
  userCode: string;
  token: string | null;
  isAuthenticated: boolean;
}

interface MCQ {
  questionNo: string;
  question: string;
  MCQ?: string; // Raw MCQ string containing question and options
  rewrittenQuestion?: string;
  options: string[];
  correctAnswer: string | string[];
  explanation: string;
  passage: string;
  isMultipleResponse?: boolean;
}

interface UserData {
  userCode: string;
  orgCode: string;
  customerCode: string; // Add customerCode here
  email: string;
  appDetails: any;
}

interface MCQResponse {
  html?: string;
  // Add other possible response fields if needed
}

const ItemRewriter = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authToken, setAuthToken] = useState<string | null>(sessionStorage.getItem('token'));
  const [userData, setUserData] = useState<UserData | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedData, setUploadedData] = useState<QuestionData[]>([]);
  const [rewrittenQuestions, setRewrittenQuestions] = useState<RewrittenQuestion[]>([]);
  const [generatedMCQs, setGeneratedMCQs] = useState<MCQ[]>([]);
  const [selectedFormat, setSelectedFormat] = useState("Multiple Choice Question");
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [currentLanguage, setCurrentLanguage] = useState("English");
  const [currentFormat, setCurrentFormat] = useState("Multiple Choice Question");
  const [isRewriting, setIsRewriting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileUploadRequired, setFileUploadRequired] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiResponseHtml, setApiResponseHtml] = useState<string>('');
  const [authInitialized, setAuthInitialized] = useState(false);

  // Define loadTokenData with useCallback to prevent infinite re-renders
  const loadTokenData = useCallback(async () => {
    // Get the current token from state or session storage
    const currentAuthToken = authToken || sessionStorage.getItem('authToken') || sessionStorage.getItem('ssoToken');

    if (!currentAuthToken) {
      //console.log('No auth token available for token validation');
      setError('Authentication token not found. Please log in again.');
      setIsLoading(false);
      return;
    }

    try {
      //console.log('Loading token data for user...');

      // Debug: Log all session storage items
      //console.log('All session storage items:');
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        //console.log(`${key}: ${sessionStorage.getItem(key || '')}`);
      }

      // Get user data from session storage
      let userInfo = null;
      try {
        const userInfoStr = sessionStorage.getItem('userInfo');
        if (userInfoStr) {
          userInfo = JSON.parse(userInfoStr);
          //console.log('Parsed userInfo:', userInfo);
        }

      } catch (error) {
        console.error('Error parsing userInfo:', error);
      }

      // Extract user data from userInfo or fall back to individual keys
      const userCode = userInfo?.userCode || sessionStorage.getItem('userCode') || '';
      const orgCode = userInfo?.orgCode || sessionStorage.getItem('orgCode') || '';
      const customerCode = userInfo?.customerCode || sessionStorage.getItem('customerCode') || '';
      const email = userInfo?.email || sessionStorage.getItem('email') || '';
      const userName = userInfo?.username || sessionStorage.getItem('username') || '';
      const userRole = userInfo?.userRole || sessionStorage.getItem('userRole') || '';

      // If any required field is missing, check localStorage as fallback
      if (!userCode || !orgCode || !customerCode) {
        console.warn('Missing required user data in sessionStorage, checking localStorage...');
        const fallbackUserCode = localStorage.getItem('userCode') || '';
        const fallbackOrgCode = localStorage.getItem('orgCode') || '';
        const fallbackCustomerCode = localStorage.getItem('customerCode') || '';

        // If we found values in localStorage, use them and update sessionStorage
        if (fallbackUserCode || fallbackOrgCode || fallbackCustomerCode) {
          sessionStorage.setItem('userCode', fallbackUserCode);
          sessionStorage.setItem('orgCode', fallbackOrgCode);
          sessionStorage.setItem('customerCode', fallbackCustomerCode);

          // Return the fallback values
          return {
            userCode: fallbackUserCode,
            orgCode: fallbackOrgCode,
            customerCode: fallbackCustomerCode,
            email: localStorage.getItem('email') || '',
            username: localStorage.getItem('username') || '',
            userRole: localStorage.getItem('userRole') || ''
          };
        }

        // If we still don't have required data, log an error and redirect to login
        console.error('Required user data not found in sessionStorage or localStorage');
        setError('Session expired. Please log in again.');
        navigate('/login');
        setIsLoading(false);
        return null;
      }

      // Create user data object
      const userData = {
        userCode,
        orgCode,
        customerCode,
        email,
        username: userName,
        userRole
      };

      //console.log('Loaded user data from session storage:', userData);

      //console.log('Using user data:', {
      //   userCode: userData.userCode,
      //   orgCode: userData.orgCode,
      //   customerCode: userData.customerCode
      // });

      // Prepare query parameters for the ValidateToken API with fallback values
      const queryParams = new URLSearchParams({
        custcode: userData.customerCode,
        orgcode: userData.orgCode,
        usercode: userData.userCode,
        appcode: 'IR'
      });

      // Always use the production URL for token validation
      const url = `${VALIDATE_TOKEN_API_URL}?${queryParams}`;
      ////console.log('Fetching token data from:', url);

      try {
        // Clean up the token (remove any surrounding quotes)
        const cleanToken = (currentAuthToken || '').replace(/^"|"+$/g, '');

        // Set up headers with the auth token
        // const headers: Record<string, string> = { 
        //   'Accept': 'application/json',
        //   'Authorization': `Bearer ${cleanToken}`
        // };
        const headers = {
          "Authorization": `Bearer ${cleanToken}` // replace with your actual token
        };

        let resp;
        fetch(url, {
          method: "GET",
          headers: headers,
        })
          .then((response) => response.text())
          .then((data) => {
            //console.log("Response:", data);
            resp = data;
            // Parse the successful response
            const responseData = JSON.parse(resp);

            // Handle different response formats (array or object)
            let tokenInfo = null;
            if (Array.isArray(responseData) && responseData.length > 0) {
              tokenInfo = responseData[0];
            } else if (responseData && typeof responseData === 'object') {
              tokenInfo = responseData;
            }

            // Update token data in state
            if (tokenInfo) {
              const utilized = Number(tokenInfo.utilizedtoken) || 0;
              const total = Number(tokenInfo.totaltoken) || 0;
              const remaining = Number(tokenInfo.remainingtoken) || Math.max(total - utilized, 0);

              //console.log('Token data updated:', { utilized, total, remaining });
              setTokenData({
                utilizedtoken: utilized,
                totaltoken: total,
                remainingtoken: remaining
              });
            } else {
              console.warn('Unexpected token data format:', responseData);
              setTokenData({ utilizedtoken: 0, totaltoken: 0, remainingtoken: 0 });
            }

          })
          .catch((error) => {
            console.error("Error:", error);
          });

      } catch (error) {
        console.error('Error fetching token data:', error);
        setError('Failed to load token information. Please try again later.');
        setTokenData({ utilizedtoken: 0, totaltoken: 0, remainingtoken: 0 });
      }
    } catch (error) {
      console.error('Unexpected error in loadTokenData:', error);
      setError('An unexpected error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [authToken, navigate]);

  const validateToken = useCallback(async (token: string): Promise<boolean> => {
    // For development - bypass token validation
    if (process.env.NODE_ENV === 'development') {
      //console.log('Development mode: Bypassing token validation');
      return true;
    }

    try {
      //console.log('Starting token validation...');

      // Get user data from session storage with better error handling
      let storedUserData;
      try {
        storedUserData = sessionStorage.getItem('userData');
        if (!storedUserData) {
          console.warn('No user data found in session storage, checking localStorage...');
          storedUserData = localStorage.getItem('userData');
        }

        if (!storedUserData) {
          console.warn('No user data found in any storage');
          // Try to get minimal required data from auth token
          const token = sessionStorage.getItem('token') || localStorage.getItem('token');
          if (token) {
            //console.log('Found auth token, creating minimal user data');
            return true; // Allow login if we have a token, even without full user data
          }
          return false;
        }
      } catch (error) {
        console.error('Error getting user data:', error);
        return false;
      }

      const userData = JSON.parse(storedUserData);
      //console.log('Validating token for user:', {
      //   userCode: userData.userCode,
      //   orgCode: userData.orgCode,
      //   customerCode: userData.customerCode
      // });

      // Prepare request parameters
      const queryParams = new URLSearchParams({
        custcode: userData.customerCode || '',
        orgcode: userData.orgCode || '',
        usercode: userData.userCode || '',
        appcode: 'IR'
      });

      // Prefer calling our backend proxy to avoid CORS if VITE_FLASK_BASE is set.
      // Otherwise, call Excelsoft directly (may be blocked by browser CORS in dev).
      const proxyBase = (import.meta.env.VITE_FLASK_BASE as string) || '';
      const excelsoftBase = VALIDATE_TOKEN_API_URL;
      const url = proxyBase
        ? `${proxyBase.replace(/\/+$/, '')}/validate_token?${queryParams}`
        : `${excelsoftBase}?${queryParams}`;
      //console.log('Making token validation request to:', url);

      const authHeaderToken = (
        (sessionStorage.getItem('authToken') || sessionStorage.getItem('ssoToken') || token || '') as string
      ).replace(/^"|"+$/g, '');

      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFpYWRtaW4iLCJuYmYiOjE3NjMwMzA1ODgsImV4cCI6MTc2MzAzMjM4OCwiaWF0IjoxNzYzMDMwNTg4fQ.7ufiYwxqkWoTFuHeAvFdUotr_n9FRUk7rgZkE0hTu2E`
        },

      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        console.warn('ValidateToken failed:', resp.status, resp.statusText, txt);
        return false;
      }
      const vJson = await resp.json().catch(() => null);
      //console.log('ValidateToken response:', vJson);
      return true;
    } catch (error) {
      console.error('Unexpected error in validateToken:', error);
      return false;
    }
  }, [authToken]);

  // Authentication effect - runs once on component mount
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      let isMounted = true;
      // Guard: prevent duplicate calls using a sessionStorage flag and skip if token already exists
      const alreadyInitialized = sessionStorage.getItem('authInitDone') === '1';
      const existingToken = sessionStorage.getItem('authToken') || sessionStorage.getItem('ssoToken');
      if (alreadyInitialized || existingToken) {
        if (existingToken) {
          setAuthToken(existingToken);
        }
        setAuthInitialized(true);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);

      try {
        const email = sessionStorage.getItem('email');
        const password = sessionStorage.getItem('password');

        if (!email || !password) {
          console.error('Missing email or password in session storage');
          setError('Please log in to continue');
          setIsLoading(false);
          return;
        }

        //console.log('Starting authentication with email:', email);

        // Fetch a Bearer token (JWT) instead of SSO token
        const response = await fetch(`${API_BASE_URL}/aiapps/Login/GetBearerToken`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/plain, application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`SSO token generation failed: ${response.status} - ${errorText}`);
        }

        // GetBearerToken may return a plain string (JWT) or JSON; handle both
        const rawText = await response.text();
        let bearerToken = rawText?.trim();
        try {
          const asJson = JSON.parse(rawText);
          bearerToken = asJson?.token || asJson?.access_Token || asJson?.accessToken || bearerToken;
        } catch (_) {
          // Not JSON; token is plain text, possibly quoted
          if (bearerToken?.startsWith('"') && bearerToken?.endsWith('"')) {
            bearerToken = bearerToken.slice(1, -1);
          }
        }
        //console.log('Bearer token received (JWT):', bearerToken ? '[REDACTED]' : 'null');

        if (!bearerToken) {
          throw new Error('No token received in response');
        }

        if (!isMounted) return;

        // Store the token (strip any surrounding quotes just in case)
        const token = (bearerToken || '').replace(/^"+|"+$/g, '');
        setAuthToken(token);
        sessionStorage.setItem('authToken', token);
        sessionStorage.setItem('ssoToken', token);
        sessionStorage.setItem('authInitDone', '1');

        //console.log('Authentication completed, token set');
        setAuthInitialized(true);

      } catch (err: any) {
        console.error('Authentication error:', err);
        if (isMounted) {
          sessionStorage.clear();
          setError(`Authentication failed: ${err.message}. Please try again or contact support.`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          // Ensure we always have some token data for the UI
          if (!tokenData) {
            //console.log('Setting fallback token data in finally block');
            // setTokenData({ utilizedtoken: 0, totaltoken: 100, remainingtoken: 100 });
          }
        }
      }
    };

    initializeAuth();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - runs once on mount

  // Load token usage once authentication is initialized
  useEffect(() => {
    const hasToken = !!authToken || !!sessionStorage.getItem('authToken') || !!sessionStorage.getItem('ssoToken');
    if (authInitialized && hasToken && !tokenData) {
      //console.log('Loading token data after auth initialization');
      loadTokenData();
    }
  }, [authInitialized, authToken, loadTokenData, tokenData]);

  const handleApiCall = async (
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
    data: any = null,
    isFileUpload: boolean = false
  ) => {
    try {
      // Build URL against environment base to support dev proxy and prod config
      const basePath = ((import.meta.env.VITE_FLASK_BASE as string) || '');
      if (!basePath) {
        //console.log('Skipping API call: no backend base configured');
        return;
      }
      // Ensure we don't create double slashes
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
      const url = `${basePath.replace(/\/+$/, '')}/${cleanEndpoint}`;

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      // Add Content-Type header for non-GET requests and non-file uploads
      if (method !== 'GET' && !isFileUpload) {
        headers['Content-Type'] = 'application/json';
      }

      // Add auth token if available
      const token = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const options: RequestInit = {
        method,
        headers,
        // Only include body for non-GET requests
        body: method !== 'GET' ? (isFileUpload ? data : JSON.stringify(data)) : undefined,
      };

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error (${response.status}):`, errorText);

        if (response.status === 401) {
          sessionStorage.clear();
          navigate('/login');
          throw new Error('Session expired. Please log in again.');
        }

        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } catch (error) {
      console.error('API call failed:', {
        error,
        endpoint,
        method,
        isFileUpload,
      });
      throw error;
    }
  };

  const handleLogout = () => {
    sessionStorage.clear();
    setAuthToken(null);
    setUserData(null);
    setTokenData(null);
  };

  // Helper function to get True/False options in different languages
  const getTFOptions = (language: string): string[] => {
    const lang = language.toLowerCase();
    switch (lang) {
      case 'hindi':
        return ['सत्य', 'असत्य'];
      case 'bangla':
        return ['সত্য', 'মিথ্যা'];
      case 'french':
        return ['Vrai', 'Faux'];
      default:
        return ['True', 'False'];
    }
  };

  const localizeTrueFalse = (value: string, language: string): string => {
    const v = (value || '').trim();
    if (!v) return v;
    const lower = v.toLowerCase();
    const [t, f] = getTFOptions(language);
    if (['true', 'vrai', 'सत्य', 'সত্য'].includes(lower)) return t;
    if (['false', 'faux', 'असत्य', 'মিথ্যা'].includes(lower)) return f;
    return v;
  };

  const parseHtmlResponse = (html: string, format: string, language: string = 'English'): MCQ[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const mcqs: MCQ[] = [];

    // Check if the response contains unformatted question text
    if (html.toLowerCase().includes('[unformatted question]')) {
      throw new Error('The generated response contains unformatted questions. Please try again with different input.');
    }
    const isTFFormat = /true/i.test(format) && /false/i.test(format);
    const isMultipleResponse = /multiple\s*response/i.test(format.toLowerCase());

    // Helper function to clean markdown formatting
    const cleanMarkdownFormatting = (text: string): string => {
      if (!text) return '';
      return text
      // .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown
      // .replace(/\*(.*?)\*/g, '$1')     // Remove italic markdown
      // .replace(/^\s*\*\s*/, '')       // Remove leading bullet points
      // .replace(/^\s*•\s*/, '')        // Remove bullet symbols
      // .trim();
    };

    // Language-specific patterns
    const langPatterns = {
      optionMarkers: {
        'hindi': /^[\s\(\)\[\]\-:\.]*(?:[1-9]\d*[\.\)\]\-:]?\s*|(?:अ|आ|इ|ई|उ|ऊ|ए|ऐ|ओ|औ)[\s\.\)\]]|\d+[\s\.\)\]]|\b(?:उत्तर|विकल्प)\s*[\d:]+\s*)/i,
        'bangla': /^[\s\(\)\[\]\-:\.]*(?:[1-9]\d*[\.\)\]\-:]?\s*|(?:ক|খ|গ|ঘ|ঙ|চ|ছ|জ|ঝ|ঞ)[\s\.\)\]]|\d+[\s\.\)\]]|\b(?:উত্তর|বিকল্প)\s*[\d:]+\s*)/i,
        'french': /^[\s\(\)\[\]\-:\.]*(?:(?:[1-9]\d*[\.\)\]\-:]?\s*)|(?:[a-dA-D][\.\)\]\-:]?\s*)+|\d+[\s\.\)\]]|\b(?:R[ée]ponse|Option)\s*[\d:]+\s*|\([a-dA-D]\))/i,
        'default': /^[\s\(\)\[\]\-:\.]*(?:[1-9]\d*[\.\)\]\-:]?\s*|(?:[a-dA-D])[\s\.\)\]]|\d+[\s\.\)\]]|\b(?:Option|Answer)\s*[\d:]+\s*)/i
      },
      trueWords: {
        'hindi': ['सत्य', 'हाँ', 'सही', 'True'],
        'bangla': ['সত্য', 'হ্যাঁ', 'ঠিক', 'True'],
        'french': ['Vrai', 'Oui', 'Correct', 'True'],
        'default': ['True', 'Yes', 'Correct']
      },
      falseWords: {
        'hindi': ['असत्य', 'नहीं', 'गलत', 'False'],
        'bangla': ['মিথ্যা', 'না', 'ভুল', 'False'],
        'french': ['Faux', 'Non', 'Incorrect', 'False'],
        'default': ['False', 'No', 'Incorrect']
      }
    };

    // Get the appropriate language pattern
    const getLangPattern = (type: 'optionMarkers' | 'trueWords' | 'falseWords') => {
      const lang = language.toLowerCase();
      return langPatterns[type][lang] || langPatterns[type]['default'];
    };

    // Helpers
    const isOption = (text: string) => {
      const cleanText = cleanMarkdownFormatting(text);
      if (!cleanText) return false;

      // Check for language-specific option markers
      if (getLangPattern('optionMarkers').test(cleanText)) return true;

      // Check for true/false words in the current language
      const lowerT = cleanText.toLowerCase();
      if (isTFFormat) {
        const trueWords = getLangPattern('trueWords');
        const falseWords = getLangPattern('falseWords');
        if (trueWords.some((w: string) => lowerT.startsWith(w.toLowerCase()))) return true;
        if (falseWords.some((w: string) => lowerT.startsWith(w.toLowerCase()))) return true;
      }

      return false;
    };

    const cleanOption = (text: string) => {
      let cleaned = cleanMarkdownFormatting(text);
      const lang = language.toLowerCase();

      // Handle French-specific patterns first
      if (lang === 'french') {
        // Handle patterns like "a.à." or "à.â." at the start
        cleaned = cleaned
          // Handle the specific French pattern with accented characters
          .replace(/^([aàâ])\s*[.\s-]*\s*([aàâ])\s*[.\s-]*/i, '')

          .trim();
      } else {
        // Handle other languages with the original logic
        cleaned = cleaned
          // Handle patterns like "a. a. " at the start
          .replace(/^([a-zA-ZÀ-ÿ])\s*[.\s-]*\s*([a-zA-ZÀ-ÿ])\s*[.\s-]*/i, (match, p1, p2) => {
            return p1.toLowerCase() === p2.toLowerCase() ? `${p1}. ` : match;
          })
          // Handle any remaining repeated patterns
          .replace(/([a-zA-ZÀ-ÿ])\s*[.\s-]*\s*\1\s*[.\s-]*/gi, '$1. ')
          // Clean up any multiple spaces or dots
          .replace(/[.\s]+/g, '. ')
          .replace(/\.{2,}/g, '.')
          .replace(/\.\s*\./g, '. ')
          .trim();
      }

      // Remove any standard option markers and numbers
      cleaned = cleaned
        .replace(/^\s*[\(\[\{\s]*([a-dA-D]|[1-9]\d*)[\)\]\}\.\s\-:]+/g, '')
        // Remove any remaining single letter + punctuation at start (including accented letters)
        .replace(/^[a-zA-ZÀ-ÿ][.\s-]+/i, '')
        .trim();

      // Remove any remaining language-specific markers
      cleaned = cleaned.replace(getLangPattern('optionMarkers'), '').trim();

      // Final cleanup of any remaining leading/trailing punctuation
      return cleaned.replace(/^[\s\(\)\[\]\-:\.]+|[\s\(\)\[\]\-:\.]+$/g, '').trim();
    };

    const isCorrectMarker = (el: Element) => {
      const text = el.textContent || '';
      return /✓|✔|\b(?:correct|right|✓|✔|✅|☑|🗹)/i.test(text) ||
        el.classList.contains('correct') ||
        el.getAttribute('data-correct') === 'true';
    };

    // Normalize a stem by removing numbering, cleaning formatting, and removing (True/False) suffix
    const normalizeStem = (text: string): string => {
      if (!text) return '';
      let cleaned = cleanMarkdownFormatting(text);

      // First remove any numbering or question prefixes
      cleaned = cleaned
        .replace(/^\s*(?:Question\s*[:#-]?\s*)/i, '')
        .replace(/^\s*Q\s*\d+\s*[:).\-]?\s*/i, '')
        .replace(/^\s*\d+\s*[).:\-]?\s*/i, '')
        .replace(/^\s*[A-Da-d]\s*[).:\-]?\s*/i, '')
        .trim();

      // UPDATED: More comprehensive True/False pattern removal
      cleaned = cleaned
        // Handle patterns like (True/False), (सत्य/असत्य), etc. - FIXED the regex
        .replace(/\s*[\(\[\{]\s*(?:True|False|Vrai|Faux|सत्य|असत्य|সত্য|মিথ্যা|T|F|V|F|স|অ|স|মি)(?:\s*[\/\|]\s*(?:True|False|Vrai|Faux|सत्य|असत्य|সত্য|মিথ্যা|T|F|V|F|স|অ|স|মি))?\s*[\]\)\}]\s*$/i, '')
        // Handle patterns without parentheses - more specific
        .replace(/\s+(?:True|False|Vrai|Faux|सत्य|असत्य)(?:\s*[\/\|]\s*(?:True|False|Vrai|Faux|सत्य|असत्य))?\s*$/i, '')
        // Remove any remaining single characters in parentheses
        .replace(/\s*\([A-Za-zÀ-ÿ]\)\s*$/i, '')
        // ADDED: Remove incomplete True/False patterns like "(True/Fals"
        .replace(/\s*[\(\[\{]\s*(?:True|False)(?:\/(?:Fals?|Tru?)?)?\s*$/i, '')
        .trim();

      return cleaned.trim();
    };

    // Parse text content more carefully, looking for structured patterns
    const parseStructuredText = (textContent: string): { questions: MCQ[], rawText: string } => {
      const questions: MCQ[] = [];
      const lines = textContent.split('\n').filter(line => line.trim());

      let currentQuestion = '';
      let currentOptions: string[] = [];
      let currentPassage = '';
      let questionCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cleanedLine = cleanMarkdownFormatting(line);

        // Check if this line looks like a question (contains question mark or question-like patterns)
        const isQuestionLine = cleanedLine.includes('?') ||
          /^(?:what|how|why|when|where|which|who)/i.test(cleanedLine) ||
          /प्रश्न|सवाल/.test(cleanedLine) ||
          /প্রশ্ন|জিজ্ঞাসা/.test(cleanedLine) ||
          /question/i.test(cleanedLine);

        // Check if this line looks like an option
        const isOptionLine = isOption(line);

        if (isQuestionLine && !isOptionLine && currentOptions.length === 0) {
          // Save previous question if exists
          if (currentQuestion && currentOptions.length > 0) {
            questions.push({
              questionNo: `Q${questionCount + 1}`,
              question: '',
              rewrittenQuestion: normalizeStem(currentQuestion),
              options: currentOptions,
              correctAnswer: currentOptions[0] || '', // Default to first option
              explanation: '',
              passage: currentPassage,
            });
            questionCount++;
          }

          currentQuestion = cleanedLine;
          currentOptions = [];
          currentPassage = '';
        } else if (isOptionLine) {
          const cleanedOption = cleanOption(line);
          if (cleanedOption) {
            currentOptions.push(cleanedOption);
          }
        } else if (!isQuestionLine && !isOptionLine && currentQuestion && currentOptions.length === 0) {
          // This might be a passage or context
          if (cleanedLine.length > 50) { // Likely a passage if it's long
            currentPassage = cleanedLine;
          }
        }
      }

      // Don't forget the last question
      if (currentQuestion && currentOptions.length > 0) {
        questions.push({
          questionNo: `Q${questionCount + 1}`,
          question: '',
          rewrittenQuestion: normalizeStem(currentQuestion),
          options: currentOptions,
          correctAnswer: currentOptions[0] || '',
          explanation: '',
          passage: currentPassage,
        });
      }

      return { questions, rawText: textContent };
    };

    // First, try to parse structured HTML elements
    const tableRows = Array.from(doc.querySelectorAll('tr'));
    const standaloneLists = Array.from(doc.querySelectorAll('ul, ol')).filter(
      (list) => !list.closest('tr')
    );
    const elements: Element[] = [...tableRows, ...standaloneLists];

    // Process HTML elements first
    elements.forEach((el) => {
      let rewrittenQuestion = '';
      const options: string[] = [];
      let correctAnswer = '';
      let passage = '';

      if (el.tagName.toLowerCase() === 'tr') {
        const cells = Array.from(el.querySelectorAll('td, th'));
        if (cells.length === 0) return;

        const firstCell = cells[0];
        const secondCell = cells[1];

        // Passage from second cell (strip lists)
        if (secondCell) {
          const passageEl = secondCell.cloneNode(true) as HTMLElement;
          passageEl.querySelectorAll('ul, ol').forEach((list) => list.remove());
          passage = cleanMarkdownFormatting(passageEl.textContent?.trim() || '');
        }

        // Rewritten question and options
        const listItems = Array.from(el.querySelectorAll('li'));
        if (listItems.length > 0) {
          listItems.forEach((li) => {
            const text = li.textContent?.trim() || '';
            if (!text) return;

            if (isOption(text)) {
              const clean = cleanOption(text);
              if (clean) options.push(clean);
              if (isCorrectMarker(li)) correctAnswer = clean;
            } else if (!rewrittenQuestion) {
              rewrittenQuestion = normalizeStem(text);
            } else {
              const clean = cleanOption(text);
              if (clean) options.push(clean);
              if (isCorrectMarker(li)) correctAnswer = clean;
            }
          });

          // If still no question, take the cell text minus the list
          if (!rewrittenQuestion) {
            const containerCell = firstCell.querySelector('ul, ol')
              ? firstCell
              : secondCell?.querySelector('ul, ol')
                ? secondCell
                : firstCell;
            const clone = (containerCell || firstCell).cloneNode(true) as HTMLElement;
            clone.querySelectorAll('ul, ol').forEach((l) => l.remove());
            const cellText = normalizeStem(clone.textContent || '');
            if (cellText) rewrittenQuestion = cellText;
          }
        } else {
          // No list; use first cell text
          rewrittenQuestion = normalizeStem(firstCell.textContent || '');
        }
      } else {
        // Standalone UL/OL
        const listItems = Array.from(el.querySelectorAll(':scope > li'));
        listItems.forEach((li) => {
          const text = li.textContent?.trim() || '';
          if (!text) return;

          if (isOption(text)) {
            const clean = cleanOption(text);
            if (clean) options.push(clean);
            if (isCorrectMarker(li)) correctAnswer = clean;
          } else if (!rewrittenQuestion) {
            rewrittenQuestion = normalizeStem(text);
          }
        });

        // If no question yet, try previous sibling, then parent text (minus the list)
        if (!rewrittenQuestion && (el as HTMLElement).previousElementSibling) {
          const prevText = normalizeStem((el as HTMLElement).previousElementSibling?.textContent || '');
          if (prevText) rewrittenQuestion = prevText;
        }
        if (!rewrittenQuestion && el.parentElement) {
          const parentClone = el.parentElement.cloneNode(true) as HTMLElement;
          parentClone.querySelectorAll('ul, ol').forEach((l) => l.remove());
          const parentText = normalizeStem(parentClone.textContent || '');
          if (parentText) rewrittenQuestion = parentText;
        }
      }

      // Normalize and synthesize from passage if still empty
      rewrittenQuestion = normalizeStem(rewrittenQuestion || '');
      if (!rewrittenQuestion && passage) {
        const firstSent = passage.split(/(?<=[.!?])\s+/)[0]?.trim() || '';
        if (firstSent) {
          // Don't add 'True or False:' prefix as we'll show it as options
          rewrittenQuestion = firstSent;
        }
      }

      // If this is TF and we now have a stem but no options, add default TF options
      if (isTFFormat && rewrittenQuestion && options.length === 0) {
        const textContent = (el.textContent || '').trim();
        const tfOptions = getTFOptions(language);
        options.push(...tfOptions);

        const m = textContent.match(/(?:correct|answer|सही|उत्तर|ঠিক|উত্তর|correct|réponse)\s*[:\-]?\s*(true|false|सत्य|असत्य|সত্য|মিথ্যা|vrai|faux)/i);
        if (m) {
          const val = m[1].toLowerCase();
          if (['true', 'सत्य', 'সত্য', 'vrai'].includes(val)) {
            correctAnswer = tfOptions[0]; // True
          } else {
            correctAnswer = tfOptions[1]; // False
          }
        }
      }

      // Add only if valid
      if (rewrittenQuestion && options.length > 0) {
        const finalOptions = isTFFormat ? options.map((o) => localizeTrueFalse(o, language)) : options;
        const finalCorrectAnswer = isTFFormat ? localizeTrueFalse(correctAnswer, language) : correctAnswer;
        mcqs.push({
          questionNo: `Q${mcqs.length + 1}`,
          question: '',
          rewrittenQuestion,
          options: finalOptions,
          correctAnswer: finalCorrectAnswer,
          explanation: '',
          passage,
        });
      }
    });

    // If we didn't get enough from HTML elements, try parsing the raw text
    if (mcqs.length === 0) {
      const textContent = doc.body.textContent || '';
      if (textContent.trim()) {
        const { questions } = parseStructuredText(textContent);
        mcqs.push(...questions);
      }
    }

    return mcqs;
  };

  // Update the parseHtmlResponse call to include language
  // Update the handleRewriteQuestions function to include data validation
  const handleRewriteQuestions = useCallback(async () => {
    // Prevent action if no remaining tokens
    if (!tokenData || (typeof tokenData.remainingtoken === 'number' && tokenData.remainingtoken <= 0)) {
      toast({
        title: 'Insufficient Tokens',
        description: 'You have no remaining tokens. Please contact support or try again later.',
        variant: 'destructive',
      });
      return;
    }

    if (!uploadedFile) {
      setFileUploadRequired(true);
      toast({
        title: "File Required",
        description: "Please upload an Excel file before proceeding.",
        variant: "destructive"
      });
      return;
    }

    // NEW: Validate that uploaded data contains questions and passages
    if (!uploadedData || uploadedData.length === 0) {
      toast({
        title: "No Data Found",
        description: "No data was found in the uploaded file. Please check your Excel file and try again.",
        variant: "destructive"
      });
      return;
    }

    // Enhanced validation for uploaded questions
    const validateQuestion = (questionText: string): { isValid: boolean; reason?: string } => {
      if (!questionText || questionText.trim() === '') {
        return { isValid: false, reason: 'Question is empty' };
      }

      const text = questionText.trim();

      // Check for unformatted questions
      if (text.toLowerCase().includes('[unformatted question]')) {
        return { isValid: false, reason: 'Contains [Unformatted question] marker' };
      }

      // Check for chunked/incomplete questions
      if (text.endsWith('...') || text.endsWith('-') || text.endsWith(',')) {
        return { isValid: false, reason: 'Question appears to be cut off with "...", "-" or "," at the end' };
      }

      // Check for very short questions that might be incomplete


      // Check for questions that might be cut off mid-sentence
      const sentenceEnders = ['.', '?', '!'];
      const lastChar = text.trim().slice(-1);
      if (!sentenceEnders.includes(lastChar) && !text.endsWith('?')) {
        return { isValid: false, reason: 'Question doesn\'t end with proper punctuation' };
      }

      // Check for questions with placeholder text
      const placeholders = ['enter your question', 'type here', 'question text', 'your question'];
      if (placeholders.some(placeholder => text.toLowerCase().includes(placeholder))) {
        return { isValid: false, reason: 'Contains placeholder text' };
      }

      return { isValid: true };
    };

    // Validate all questions
    const validationResults = uploadedData
      .filter(item => item.questions && item.questions.trim() !== '')
      .map((item, index) => ({
        ...item,
        lineNumber: index + 2, // +2 for 1-based index and header row
        ...validateQuestion(item.questions)
      }));

    const invalidQuestions = validationResults.filter(q => !q.isValid);

    if (invalidQuestions.length > 0) {
      // Group invalid questions by reason for better error reporting
      const groupedByReason = invalidQuestions.reduce((acc, q) => {
        const reason = q.reason || 'Unknown issue';
        if (!acc[reason]) {
          acc[reason] = [];
        }
        acc[reason].push({
          line: q.lineNumber,
          preview: q.questions.substring(0, 50) + (q.questions.length > 50 ? '...' : '')
        });
        return acc;
      }, {} as Record<string, Array<{ line: number, preview: string }>>);

      // Create a detailed error message
      let errorMessage = 'Found issues with the uploaded questions:\n\n';

      Object.entries(groupedByReason).forEach(([reason, questions]) => {
        errorMessage += `• ${reason} (${questions.length} questions):\n`;
        // Show up to 3 examples per issue type
        questions.slice(0, 3).forEach((q, i) => {
          errorMessage += `  - Line ${q.line}: "${q.preview}"\n`;
        });
        if (questions.length > 3) {
          errorMessage += `  ...and ${questions.length - 3} more\n`;
        }
        errorMessage += '\n';
      });

      toast({
        title: 'Invalid Questions Found',
        description: errorMessage,
        variant: 'destructive',
        duration: 10000, // Show for longer to allow reading
      });
      return;
    }

    // Check if any questions or passages exist in the uploaded data
    const hasValidQuestions = uploadedData.some(item =>
      (item.questions && item.questions.trim().length > 0) ||
      (item.passage && item.passage.trim().length > 0)
    );

    if (!hasValidQuestions) {
      toast({
        title: "No Questions or Passages Found",
        description: "The uploaded file does not contain any valid questions or passages to rewrite. Please ensure your Excel file has content in the 'questions' or 'passage' columns.",
        variant: "destructive",
        duration: 6000, // Show for longer since it's an important validation message
      });
      return;
    }

    // NEW: Provide more detailed validation feedback
    const questionsCount = uploadedData.filter(item => item.questions && item.questions.trim().length > 0).length;
    const passagesCount = uploadedData.filter(item => item.passage && item.passage.trim().length > 0).length;

    if (questionsCount === 0 && passagesCount === 0) {
      toast({
        title: "Empty Content Detected",
        description: "All rows appear to have empty questions and passages. Please check your data and ensure the content is in the correct columns.",
        variant: "destructive",
        duration: 6000,
      });
      return;
    }

    // NEW: Warning for partial data
    if (questionsCount === 0) {
      toast({
        title: "No Questions Found",
        description: `Found ${passagesCount} passage(s) but no questions. The AI will try to generate questions from passages only.`,
        variant: "default", // Use default variant for warnings
        duration: 5000,
      });
    } else if (passagesCount === 0) {
      toast({
        title: "No Passages Found",
        description: `Found ${questionsCount} question(s) but no passages. The AI will rewrite questions without context.`,
        variant: "default",
        duration: 5000,
      });
    }

    // Set current language and format when rewriting starts
    setCurrentLanguage(selectedLanguage);
    setCurrentFormat(selectedFormat);

    if (!selectedFormat || !selectedLanguage) {
      toast({
        title: "Missing Information",
        description: "Please select both format and language.",
        variant: "destructive"
      });
      return;
    }

    setIsRewriting(true);
    setError('');
    setApiResponseHtml('');

    try {
      const ssoToken = sessionStorage.getItem('ssoToken');
      if (!ssoToken) {
        throw new Error('No authentication token found. Please log in again.');
      }

      const formData = new FormData();
      formData.append('dataTableJson', JSON.stringify(uploadedData));
      formData.append('format', selectedFormat);
      formData.append('language', selectedLanguage);
      formData.append('isSSO', '1');

      // Build generate URL (prefer env override, then local backend)
      const envGenerateUrl = (import.meta.env.VITE_GENERATE_URL as string) || '';
      const basePath = ((import.meta.env.VITE_FLASK_BASE as string) || '');
      const generateBase = envGenerateUrl || basePath;
      if (!generateBase) {
        //console.log('Skipping generate_mcq call: no backend base configured');
        setIsRewriting(false);
        toast({
          title: 'Backend not configured',
          description: 'No generate API configured. Set VITE_GENERATE_URL or VITE_FLASK_BASE.',
          variant: 'destructive',
        });
        return;
      }

      try {
        const generateUrl = `${generateBase.replace(/\/+$/, '')}?isSSO=1&token=${encodeURIComponent(ssoToken)}`;
        //console.log('Generate URL:', generateUrl);

        // Do not send cookies/credentials; the API relies on isSSO and token query params
        const response = await fetch(generateUrl, {
          method: 'POST',
          body: formData,
          credentials: 'omit',
          mode: 'cors',
        });

        const responseText = await response.text();

        if (
          responseText.trim().startsWith('<!DOCTYPE') ||
          responseText.trim().startsWith('<html>') ||
          responseText.includes('</html>')
        ) {
          // Parse HTML response
          const rewrittenMcqs = parseHtmlResponse(responseText, selectedFormat, selectedLanguage);

          // Always align with uploadedData: do not directly use parsed list to avoid count mismatches
          const mergedMcqs = uploadedData.map((original, index) => {
            let rw;
            if (selectedFormat == "True/False") {
              rw = rewrittenMcqs[index + 6] || ({} as Partial<MCQ>);
            }
            else {
              rw = rewrittenMcqs[index] || ({} as Partial<MCQ>);
            }
            const isTF = /true/i.test(selectedFormat) && /false/i.test(selectedFormat);

            const rewrittenQuestion = (rw.rewrittenQuestion || '').trim();

            const options = (rw.options && rw.options.length > 0)
              ? rw.options
              : (isTF ? getTFOptions(selectedLanguage) : []);

            return {
              questionNo: original?.questionNo || `Q${index + 1}`,
              question: (original?.questions || '').trim(),
              passage: original?.passage || '',
              rewrittenQuestion,
              options,
              correctAnswer: rw.correctAnswer || '',
              explanation: rw.explanation || '',
            } as MCQ;
          }).filter(mcq => mcq.rewrittenQuestion || mcq.question);

          setGeneratedMCQs(mergedMcqs);
          toast({
            title: "Success",
            description: `Generated ${mergedMcqs.length} items successfully!`,
            variant: "default",
          });
        } else {
          // Attempt to handle JSON response from Flask
          try {
            const jsonResponse = JSON.parse(responseText);
            //console.log('JSON Response:', jsonResponse);

            // Update remaining tokens if provided
            if (typeof jsonResponse?.remaining_token === 'number') {
              //console.log('Updating token data from MCQ response:', jsonResponse.remaining_token);
              setTokenData((prev) => ({
                utilizedtoken: prev?.utilizedtoken || 0,
                totaltoken: prev?.totaltoken || 0,
                remainingtoken: jsonResponse.remaining_token,
              }));
            } else {
              // Decrement remaining tokens by 1 for each question processed
              //console.log('Decrementing token count by', uploadedData.length);
              setTokenData((prev) => ({
                utilizedtoken: (prev?.utilizedtoken || 0) + uploadedData.length,
                totaltoken: prev?.totaltoken || 0,
                remainingtoken: Math.max((prev?.remainingtoken || 0) - uploadedData.length, 0),
              }));
            }

            const pairs = Array.isArray(jsonResponse?.question_mcq_pairs)
              ? jsonResponse.question_mcq_pairs
              : [];
            if (pairs.length === 0) {
              throw new Error('No MCQs returned by the service');
            }

            // Map Flask pairs to our UI model
            const mergedMcqs = uploadedData.map((original, index) => {
              const pair = pairs[index] || {};
              let rewrittenQuestion = (pair.MCQ || pair.Question || '').trim();
              const isTF = /true/i.test(selectedFormat) && /false/i.test(selectedFormat);
              const options = isTF ? getTFOptions(selectedLanguage) : [];

              // For True/False questions, we don't need to append (True/False) to the question
              // as the options will be shown separately
              return {
                questionNo: original?.questionNo || `Q${index + 1}`,
                question: (original?.questions || '').trim(),
                passage: original?.passage || '',
                rewrittenQuestion,
                options,
                correctAnswer: '',
                explanation: '',
              } as MCQ;
            }).filter(mcq => mcq.rewrittenQuestion || mcq.question);

            setGeneratedMCQs(mergedMcqs);

            // Get the display text for the selected format
            const formatMapping: Record<string, string> = {
              'Multiple Choice Question': 'Multiple Choice Questions',
              'Multiple Response Question': 'Multiple Response Questions',
              'True/False': 'True/False Questions',
              'True-False': 'True/False Questions'
            };

            const formatDisplayText = formatMapping[selectedFormat] || 'Questions';

            toast({
              title: 'Success',
              description: `Generated ${formatDisplayText} successfully!`,
              variant: 'default',
            });
          } catch (e) {
            console.error('Failed to parse response:', e);
            throw new Error('Received an unexpected response format from the server');
          }
        }
      } catch (err: any) {
        console.error('Error generating questions:', err);
        // Detect mixed-content scenario: page https but backend http
        const pageIsHttps = window.location.protocol === 'https:';
        const baseForCheck = (import.meta.env.VITE_FLASK_BASE as string) || `${pageIsHttps ? 'https' : 'http'}://127.0.0.1:5000`;
        if (pageIsHttps && baseForCheck.startsWith('http://')) {
          toast({
            title: 'Blocked by browser (mixed content)',
            description: 'Your page is served over HTTPS, but the backend URL is HTTP. Either set VITE_FLASK_BASE to an HTTPS URL, or run Flask with SSL (set FLASK_SSL=1 and FLASK_SSL_ADHOC=1) and use https://127.0.0.1:5000.',
            variant: 'destructive',
          });
        } else {
          // Show the error string; backend details are logged to console
          toast({ title: 'Rewrite failed', description: String(err?.message || err), variant: 'destructive' });
        }
        setIsRewriting(false);
        return;
      } finally {
        setIsRewriting(false);
      }
    } catch (outerErr: any) {
      console.error('Outer error in handleRewriteQuestions:', outerErr);
      setIsRewriting(false);
    }
  }, [uploadedData, selectedFormat, selectedLanguage, toast]);

  const validateFile = (file: File): boolean => {
    // Check file type (only allow Excel files)
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];

    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a valid Excel file (.xlsx or .xls)",
        variant: "destructive"
      });
      return false;
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive"
      });
      return false;
    }

    return true;
  };

  const processFile = async (file: File) => {
    try {
      setIsUploading(true);

      if (!validateFile(file)) {
        return;
      }

      setUploadedFile(file);

      const formData = new FormData();
      formData.append('file', file);

      const response = await handleApiCall(
        '/aiapps/item-rewrite/GPT/Import',
        'POST',
        formData,
        true // isFormData flag
      );

      //console.log('Upload response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error:', errorText);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();

      if (responseData && responseData.data) {
        // Validate that no passage or question is empty
        const invalidRows: number[] = [];

        const extractedData: QuestionData[] = responseData.data
          .map((item: any, index: number) => {
            const rowNumber = index + 1;
            const passage = item.passage?.trim() || '';
            const question = item.question?.trim() || '';

            if (!passage || !question) {
              invalidRows.push(rowNumber);
            }

            return {
              questionNo: `Q${rowNumber}`,
              passage: passage,
              questions: question
            };
          });

        if (invalidRows.length > 0) {
          // Clear the file input
          const fileInput = document.getElementById('file-upload') as HTMLInputElement;
          if (fileInput) fileInput.value = '';

          // Reset states
          setUploadedFile(null);
          setUploadedData([]);
          setFileUploadRequired(true);

          throw new Error(
            `Upload failed: Found empty passages or questions in rows ${invalidRows.join(', ')}. ` +
            'Please ensure all rows have both passage and question filled out.'
          );
        }

        setUploadedData(extractedData);

        toast({
          title: "File Uploaded Successfully",
          description: `Loaded ${extractedData.length} questions`,
        });
      } else {
        throw new Error('No valid data found in the response');
      }
    } catch (error) {
      console.error('Error in processFile:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to process the file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setGeneratedMCQs([]); // Clear the generated MCQs
    setRewrittenQuestions([]); // Clear rewritten questions
    setUploadedFile(null); // Clear the uploaded file
    setUploadedData([]); // Clear the uploaded data
    setFileUploadRequired(false);

    // Reset dropdowns to default values
    setSelectedFormat("Multiple Choice Question");
    setSelectedLanguage("English");

    // Clear the file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }

    toast({
      title: "File Removed",
      description: "File has been removed and settings reset",
    });
  };

  const MAX_FILE_SIZE_MB = 10;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; // 10MB in bytes

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({
        title: "File Too Large",
        description: `Please upload a file smaller than ${MAX_FILE_SIZE_MB}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`,
        variant: "destructive"
      });
      // Clear the file input
      event.target.value = '';
      return;
    }

    // Reset dropdowns to default values when a new file is uploaded
    setSelectedFormat("Multiple Choice Question");
    setSelectedLanguage("English");

    setFileUploadRequired(false);

    //console.log('=== FILE UPLOAD DEBUGGING ===');
    //console.log('File info:', {
    //   name: file.name,
    //   size: file.size,
    //   type: file.type,
    //   lastModified: new Date(file.lastModified).toISOString()
    // });

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive"
      });
      return;
    }

    setUploadedFile(file);

    try {
      const xlsx = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      //console.log('File size in bytes:', arrayBuffer.byteLength);

      const workbook = xlsx.read(arrayBuffer, { type: 'array' });
      //console.log('Workbook SheetNames:', workbook.SheetNames);

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      // Define the strict limits
      const MAX_ROWS = 25; // Maximum 25 data rows (26 total including header)
      const MAX_COLUMNS = 3; // Maximum 3 columns


      // Get all rows as arrays with strict limits
      type ExcelRow = (string | number | boolean | null)[];

      // Convert sheet to JSON with explicit range limits (26 rows x 3 columns)
      const allRows = xlsx.utils.sheet_to_json<ExcelRow>(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
        range: {
          s: { r: 0, c: 0 },  // Start at first cell (A1)
          e: { r: MAX_ROWS, c: MAX_COLUMNS - 1 }  // End at 25th row (0-based), 3rd column (0-based)
        }
      }) as ExcelRow[];

      // Process rows with strict 3-column limit
      const allProcessedRows = allRows.map((row: ExcelRow) => {
        // Ensure we have exactly 3 columns with proper string values
        const limitedRow = [
          row[0] !== null && row[0] !== undefined ? String(row[0]).trim() : '',
          row[1] !== null && row[1] !== undefined ? String(row[1]).trim() : '',
          row[2] !== null && row[2] !== undefined ? String(row[2]).trim() : ''
        ];

        return {
          questionNo: limitedRow[0],
          passage: limitedRow[1],
          questions: limitedRow[2]
        };
      });

      // Check if first row is a header (only if we have data)
      const hasHeader = allProcessedRows.length > 0 &&
        (allProcessedRows[0].questionNo?.toLowerCase().includes('question') ||
          allProcessedRows[0].passage?.toLowerCase().includes('passage'));

      // Remove header row if it exists and limit to MAX_ROWS
      const dataWithoutHeader = hasHeader ? allProcessedRows.slice(1, MAX_ROWS + 1) : allProcessedRows.slice(0, MAX_ROWS);

      // Filter out rows with empty passage or question
      const [validData, skippedRows] = dataWithoutHeader.reduce<[QuestionData[], number]>(
        ([valid, skipped], row) => {
          const hasEmptyPassage = !row.passage || row.passage.trim() === '';
          const hasEmptyQuestion = !row.questions || row.questions.trim() === '';

          if (hasEmptyPassage || hasEmptyQuestion) {
            return [valid, skipped + 1];
          }
          return [[...valid, row], skipped];
        },
        [[], 0]
      );

      // Final data with only valid rows
      const limitedData = validData;
      // Check for missing or chunked/corrupted data
      const validationErrors: string[] = [];

      limitedData.forEach((row, index) => {
        const rowNumber = hasHeader ? index + 2 : index + 1; // +2 because of 0-based index and header row
        const errors: string[] = [];

        // Check for missing or invalid data



        if (errors.length > 0) {
          validationErrors.push(`Row ${rowNumber}: ${errors.join(', ')}`);
        }
      });

      if (validationErrors.length > 0) {
        const errorMessage = `Validation failed for ${validationErrors.length} row(s):\n\n` +
          validationErrors.join('\n') +
          '\n\nPlease fix the issues in the Excel file and try again.';

        throw new Error(errorMessage);
      }
      //console.log('Processed data:', {
      //   totalRows: allRows.length,
      //   hasHeader,
      //   questionsFound: limitedData.length,
      //   firstFewQuestions: limitedData.slice(0, 3).map(q => q.questionNo)
      // });

      //console.log(`Processed ${limitedData.length} valid rows (${skippedRows} rows skipped due to empty fields, max ${MAX_ROWS} allowed) with ${MAX_COLUMNS} columns`);

      // Show a warning if any rows were skipped
      if (skippedRows > 0) {
        toast({
          title: "Some Rows Skipped",
          description: `Skipped ${skippedRows} row(s) with empty passage or question. Processed ${limitedData.length} valid row(s).`,
          variant: "default",
          duration: 5000
        });
      }

      if (limitedData.length === 0) {
        console.error('Excel file is empty or has no data');

        // Clear the file input
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }

        // Do not set uploaded file or data
        setUploadedFile(null);
        setUploadedData([]);
        setRewrittenQuestions([]);

        toast({
          title: "Empty File",
          description: `The Excel file contains no data. Please upload a file with valid questions and passages.`,
          variant: "destructive",
        });
        return;
      }


      // Check if all rows have empty data
      const hasData = limitedData.some(row => {
        return [row.questionNo, row.passage, row.questions].some(value =>
          value !== null && value !== undefined && value.toString().trim() !== ''
        );
      });






      if (!hasData) {
        //console.log('Excel file has no data in any column');

        // Clear the file input
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }

        // Do not set uploaded file or data
        setUploadedFile(null);
        setUploadedData([]);
        setRewrittenQuestions([]);

        toast({
          title: "Empty File",
          description: "The Excel file contains no data in any column. Please upload a file with valid questions and passages.",
          variant: "destructive",
        });
        return;
      }

      const questions: QuestionData[] = [];
      const columnMap: Record<string, string> = {};

      const firstRow = limitedData[0];
      const availableColumns = Object.keys(firstRow);
      const lowerCaseColumns = availableColumns.map(col => col.toLowerCase().trim());

      // Check for required columns (case-insensitive)
      const hasQuestionColumn = lowerCaseColumns.some(col =>
        col.includes('question') && !col.includes('no')
      );
      const hasPassageColumn = lowerCaseColumns.some(col => col.includes('passage'));

      if (!hasQuestionColumn || !hasPassageColumn) {
        const missingColumns = [];
        if (!hasQuestionColumn) missingColumns.push('Questions');
        if (!hasPassageColumn) missingColumns.push('Passage');

        toast({
          title: "Missing Required Columns",
          description: `The Excel file is missing required column(s): ${missingColumns.join(', ')}`,
          variant: "destructive",
        });
        return;
      }
      // Map the columns (case-insensitive)
      // Map the columns (case-insensitive)
      if (limitedData.length > 0) {
        const firstRow = limitedData[0];

        // Map the columns (case-insensitive)
        Object.keys(firstRow).forEach(key => {
          const lowerKey = key.toLowerCase().trim();
          if (lowerKey.includes('question') && !lowerKey.includes('no')) {
            columnMap['questions'] = key;
          } else if (lowerKey.includes('passage')) {
            columnMap['passage'] = key;
          } else if (lowerKey.includes('question no') || lowerKey.includes('question_no')) {
            columnMap['questionNo'] = key;
          }
        });
      }

      //console.log('Detected column mappings:', columnMap);

      // Filter out rows where questions are empty and check for chunked questions
      // First, validate the Excel structure
      const requiredColumns = ['passage', 'questions'];
      const missingColumns = requiredColumns.filter(col => !Object.values(columnMap).includes(col));

      if (missingColumns.length > 0) {
        throw new Error(
          `Invalid Excel format. Missing required columns: ${missingColumns.join(', ')}. ` +
          'Please ensure your Excel file has columns for "Passage" and "Questions".'
        );
      }

      // Function to check for unformatted text (no spaces, no punctuation, etc.)
      const isUnformattedText = (text: string): boolean => {
        const str = String(text).trim();
        // Check for lack of spaces (very long unbroken text)
        if (str.length > 50 && !/\s/.test(str)) return true;
        // Check for missing sentence-ending punctuation
        if (!/[.!?]$/.test(str)) return true;
        // Check for missing spaces after punctuation
        if (/[a-z][,.!?][A-Z]/.test(str)) return true;
        return false;
      };

      const validRows = limitedData.filter((row, index) => {
        const questionValue = row[columnMap['questions']];
        const passageValue = row[columnMap['passage']];
        const rowNumber = index + 1; // 1-based row number for error messages

        // Check if passage exists and is not just whitespace
        if (passageValue === undefined || passageValue === null || String(passageValue).trim() === '') {
          throw new Error(`Row ${rowNumber}: Passage cannot be empty.`);
        }

        // Check if question exists and is not just whitespace
        if (questionValue === undefined || questionValue === null || String(questionValue).trim() === '') {
          throw new Error(`Row ${rowNumber}: Question cannot be empty.`);
        }

        const passageText = String(passageValue).trim();
        const questionText = String(questionValue).trim();

        // Check for unformatted passage
        if (isUnformattedText(passageText)) {
          throw new Error(
            `Row ${rowNumber}: Passage appears to be unformatted or missing proper punctuation. ` +
            'Please ensure the text has proper spacing and punctuation.'
          );
        }

        // Check for unformatted question
        if (isUnformattedText(questionText)) {
          throw new Error(
            `Row ${rowNumber}: Question appears to be unformatted or missing proper punctuation. "${questionText.substring(0, 50)}${questionText.length > 50 ? '...' : ''}"`
          );
        }

        // Check for proper punctuation at the end
        const sentenceEnders = ['.', '?', '!'];
        const lastChar = questionText.slice(-1);
        if (!sentenceEnders.includes(lastChar)) {
          throw new Error(
            `Row ${rowNumber}: Question doesn't end with proper punctuation (., ?, !). "${questionText.substring(0, 50)}${questionText.length > 50 ? '...' : ''}"`
          );
        }

        // Check if the question is complete (doesn't end with a space or hyphen)
        if (questionText.endsWith(' ') || questionText.endsWith('-') || questionText.endsWith('...')) {
          throw new Error(
            `Row ${rowNumber}: Question appears to be cut off. "${questionText.substring(0, 30)}${questionText.length > 30 ? '...' : ''}"`
          );
        }

        return true;
      });

      if (validRows.length === 0) {
        // Set empty data to trigger table render with headers
        setUploadedData([{
          questionNo: null,
          passage: null,
          questions: null
        }]);
        setUploadedFile(file);
        setRewrittenQuestions([]);
        return;
      }

      validRows.forEach((row, index) => {
        questions.push({
          questionNo: columnMap['questionNo'] ? String(row[columnMap['questionNo']] || (index + 1)) : String(index + 1),
          passage: String(row[columnMap['passage']] || '').trim(),
          questions: String(row[columnMap['questions']] || '').trim()
        });
      });

      //console.log('Processed questions:', questions);

      if (questions.length === 0) {
        console.error('No valid questions found in the file');
        toast({
          title: "No Valid Data",
          description: "The file doesn't contain any valid questions or passages. Please check the file format.",
          variant: "destructive",
        });
        return;
      }

      // Additional validation for chunked questions
      const chunkedQuestions = questions.filter(q => {
        const questionText = q.questions.toLowerCase();
        return questionText.endsWith('...') ||
          questionText.endsWith('-') ||
          questionText.endsWith(' ') ||
          questionText.includes('...') && questionText.length < 30; // Short text with ellipsis
      });

      if (chunkedQuestions.length > 0) {
        const example = chunkedQuestions[0].questions.substring(0, 50) +
          (chunkedQuestions[0].questions.length > 50 ? '...' : '');
        throw new Error(`Found ${chunkedQuestions.length} questions that appear to be cut off. ` +
          `Example: "${example}" Please ensure all questions are complete before uploading.`);
      }

      setUploadedData(questions);

      toast({
        title: "File Ready",
        description: `Successfully loaded questions.`,
        variant: "default",
      });

    } catch (error) {
      console.error('Error processing file:', error);
      setUploadedFile(null);
      setUploadedData([]);
      setRewrittenQuestions([]);

      // Clear the file input
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }

      if (error instanceof Error) {
        // Handle empty file error
        if (error.message.includes('empty') || error.message.includes('no data') || error.message.includes('Empty file')) {
          toast({
            title: "Empty File",
            description: "The uploaded file is empty. Please upload a file containing questions and passages.",
            variant: "destructive",
          });
          return;
        }
        // Handle our custom error for chunked content
        else if (error.message.includes('chunked') || error.message.includes('cut off')) {
          toast({
            title: "Incomplete Questions Found",
            description: error.message,
            variant: "destructive",
          });
          return;
        }
        // Handle missing xlsx module
        else if (error.message.includes('Cannot find module')) {
          console.warn('xlsx package not found. Proceeding without validation.');
          toast({
            title: "File Uploaded",
            description: "File validation skipped. Click 'Rewrite Questions' to process.",
            variant: "default",
          });
          return;
        }
      }

      // Default error message for other cases
      toast({
        title: "Error Processing File",
        description: "An error occurred while processing the file. Please try again or upload a different file.",
        variant: "destructive",
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setFileUploadRequired(false);
    // Prefer items API to handle dragged directories or complex drag sources
    const dt = e.dataTransfer;
    let file: File | undefined;
    if (dt.items && dt.items.length) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
            file = f;
            break;
          }
        }
      }
    }
    if (!file && dt.files && dt.files.length) {
      const files = Array.from(dt.files);
      file = files.find(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    }
    if (file) {
      processFile(file);
    } else {
      toast({
        title: "Invalid File Type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive"
      });
    }
  };

  // Prevent default browser file-open behavior when dragging over the window
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  const handleDownloadTemplate = () => {
    // Create a temporary anchor element
    const link = document.createElement('a');
    link.href = ITEM_REWRITER_TEMPLATE_URL;
    link.download = 'Item_rewriter_Sample_Template.xlsx'; // This will be the filename when downloaded
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Update the success message
    toast({
      title: "Download Started",
      description: "The template file is being downloaded.",
      variant: "default",
    });
  };

  const handleClear = () => {
    setGeneratedMCQs([]); // Clear the generated MCQs
    setRewrittenQuestions([]); // Clear rewritten questions
    setUploadedFile(null); // Clear the uploaded file
    setUploadedData([]); // Clear the uploaded data
    setFileUploadRequired(false); // Reset file upload required state

    // Reset the file input element
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }

    toast({
      title: "Cleared",
      description: "All uploaded data and rewritten questions have been removed!",
    });
  };

  const handleDownloadResults = async () => {
    if (generatedMCQs.length === 0) {
      toast({
        title: "No Results",
        description: "No generated questions available to download",
        variant: "destructive"
      });
      return;
    }

    try {
      // Create a new workbook
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const formatColumnMap: Record<string, string> = {
        'Multiple Choice Question': 'Multiple Choice Question',
        'Multiple Response Question': 'Multiple Response Question',
        'True/False': 'True/False',
        'True-False': 'True/False'
      };

      // Define column header based on question format
      const questionColumnHeader = currentFormat === 'Multiple Choice Question' ? 'Multiple Choice Question' :
        currentFormat === 'Multiple Response Question' ? 'Multiple Response Question' :
          (currentFormat === 'True/False' || currentFormat === 'True-False') ? 'True/False' :
            'Question';

      // Convert MCQs to worksheet data with dynamic column header
      const data = generatedMCQs.map((mcq, index) => {
        const row: Record<string, any> = {
          'Question No': mcq.questionNo || `Q${index + 1}`,
          'Passage': mcq.passage || '',
          'Question': mcq.question || ''
        };

        // Add the dynamic column header for the rewritten question
        row[questionColumnHeader] = mcq.rewrittenQuestion || '';

        return row;
      });

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(data);

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Rewritten Questions');

      // Generate filename based on the current format
      const formatFilenameMap: Record<string, string> = {
        'Multiple Choice Question': 'Multiple Choice Questions',
        'Multiple Response Question': 'Multiple Response Questions',
        'True/False': 'True_False',
        'True-False': 'True_False'
      };

      const filenamePrefix = formatFilenameMap[currentFormat] || 'Questions';
      const filename = `${filenamePrefix}.xlsx`;

      // Generate file and trigger download
      XLSX.writeFile(wb, filename);

      toast({
        title: "Download Complete",
        description: `${filenamePrefix} results downloaded successfully!`,
        variant: "default"
      });

    } catch (error) {
      console.error('Error generating download:', error);
      toast({
        title: "Download Failed",
        description: "An error occurred while generating the download. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="text-gray-600">Authenticating...</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4 p-4 text-center">
        <div className="bg-red-100 p-4 rounded-full">
          <svg className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-800">Access Denied</h2>
        <p className="text-gray-600 max-w-md">{authError}</p>
        <Button
          onClick={() => window.location.href = '/dashboard'}
          className="mt-4"
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500 text-center p-4">
          <p className="text-lg font-semibold">Error</p>
          <p className="mt-2">{error}</p>
          <Button
            onClick={() => window.location.href = '/login'}
            className="mt-4"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  const htmlContentStyle: React.CSSProperties = {
    maxWidth: '100%',
    overflowX: 'auto' as const,
    margin: '20px 0',
    padding: '15px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    backgroundColor: '#fff',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
      {/* Enhanced Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg hover-scale">
                <span className="text-white font-bold text-sm">AL</span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-gray-900">Item Rewriter</span>
                <span className="text-xs text-gray-500">AI-Powered Question Transformation</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
              <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                <Sparkles className="w-2 h-2 text-white" />
              </div>
              <span className="text-sm text-blue-700 font-medium">
                Remaining Tokens: {tokenData?.remainingtoken || 'Loading...'}
              </span>
            </div>
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-gray-600 hover-primary">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>

          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Enhanced Page Title */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            <RefreshCw className="w-4 h-4" />
            Transform Your Questions
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
            Intelligent Question Rewriter
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your questions and transform them into different formats with AI-powered precision
          </p>
        </div>

        {/* Enhanced Upload Section */}
        <Card className="border-2 border-gray-200">
          <div className="p-8">
            <div className="text-center space-y-6">

              <div className="flex flex-col sm:flex-row items-center justify-between text-sm text-gray-500 gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Format: .xlsx and .xls only</Badge>
                  <Badge variant="outline" className="text-xs">Import 25 Questions only </Badge>
                </div>

                <Button
                  variant="outline"
                  className="border-2 border-blue-400 text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-500 hover:text-blue-800 transition-all duration-200"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
              </div>

              {!uploadedFile ? (
                <div
                  className={`border-2 border-dashed rounded-xl p-16 transition-all duration-300 ${isDragOver
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-gray-300 bg-gray-50/30'
                    }`}
                  aria-required="true"
                  aria-invalid={fileUploadRequired}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                  role="button"
                  tabIndex={0}
                  onClick={() => document.getElementById('file-upload')?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('file-upload')?.click(); }}
                >
                  <div className="text-center space-y-6">
                    <div className={`w-16 h-16 rounded-lg flex items-center justify-center mx-auto transition-all duration-300 ${isUploading
                      ? 'bg-blue-600'
                      : isDragOver
                        ? 'bg-blue-600'
                        : 'bg-gray-100 border-2 border-gray-300'
                      }`}>
                      {isUploading ? (
                        <RefreshCw className="w-8 h-8 text-white animate-spin" />
                      ) : (
                        <Upload className={`w-8 h-8 transition-all duration-300 ${isDragOver ? 'text-white' : 'text-gray-500'
                          }`} />
                      )}
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {isUploading ? 'Uploading file...' : 'Drop your Excel file here or use the button below'}
                      </h3>
                      <p className="text-gray-500">
                        {isUploading ? 'Please wait while we process your file' : 'Click the button below to browse for files'}
                      </p>
                      <p className={`text-sm ${fileUploadRequired ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {fileUploadRequired ? 'A file upload is required' : ''}
                      </p>
                    </div>

                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                      disabled={isUploading}
                      required
                      aria-required="true"
                    />

                    {!isUploading && (
                      <Button
                        variant="outline"
                        className="border-2 border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 hover:border-blue-500 hover:text-blue-800 transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          document.getElementById('file-upload')?.click();
                        }}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Browse Files
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-2 border-green-200 rounded-xl p-12 bg-green-50/30">
                  <div className="text-center space-y-6">
                    <div className="w-16 h-16 rounded-lg bg-green-100 border-2 border-green-300 flex items-center justify-center mx-auto">
                      <FileText className="w-8 h-8 text-green-600" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {uploadedFile.name}
                      </h3>
                      <p className="text-green-600 font-medium">
                        File uploaded successfully!
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button
                        variant="outline"
                        className="border-2 border-red-400 text-red-600 bg-white hover:bg-red-50 hover:border-red-500 transition-all duration-200"
                        onClick={handleRemoveFile}
                      >
                        Remove File
                      </Button>


                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Enhanced Uploaded Data Section */}
        {uploadedData.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 animate-fade-in">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Uploaded Data</h2>
                    <p className="text-gray-600 mt-1">Review your uploaded questions before processing</p>
                  </div>
                </div>

              </div>

              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-gray-100 to-gray-50 border-b border-gray-200">
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide">Question No</th>
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide">Passage</th>
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide">Question(s)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {uploadedData.map((item, index) => (
                        <tr key={index} className="hover:bg-green-50/50 transition-colors duration-200">
                          <td className="px-8 py-6 font-semibold text-green-600 text-lg">{item.questionNo}</td>
                          <td className="px-8 py-6 text-gray-700 leading-relaxed max-w-md">{item.passage}</td>
                          <td className="px-8 py-6 text-gray-700 leading-relaxed max-w-md font-medium">{item.questions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mt-8 p-6 bg-gradient-to-r from-blue-50 via-purple-50 to-blue-50 rounded-xl border border-blue-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-1">
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Question Format</label>
                    <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                      <SelectTrigger className="w-64 h-12 border border-gray-300 hover:border-blue-400 focus:border-blue-500 transition-colors bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-gray-200 z-50">
                        <SelectItem value="Multiple Choice Question">Multiple Choice Question</SelectItem>
                        <SelectItem value="Multiple Response Question">Multiple Response Question</SelectItem>
                        <SelectItem value="True/False">True/False</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Language</label>
                    <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                      <SelectTrigger className="w-40 h-12 border border-gray-300 hover:border-blue-400 focus:border-blue-500 transition-colors bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-gray-200 z-50">
                        <SelectItem value="English">English</SelectItem>
                        <SelectItem value="Hindi">Hindi</SelectItem>
                        <SelectItem value="French">French</SelectItem>
                        <SelectItem value="Bangla">Bangla</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-10 py-4 h-12 text-base font-semibold rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleRewriteQuestions}
                  disabled={isRewriting || !tokenData || tokenData.remainingtoken <= 0}
                >
                  {isRewriting ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                      Rewriting Questions...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-3" />
                      Rewrite Questions
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Rewritten Questions Section */}
        {generatedMCQs.length > 0 && isRewriting === false && (
          <div className="bg-white rounded-xl border border-gray-200 mt-6">
            <div className="p-8">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Rewritten Questions</h2>
                    <p className="text-gray-600 mt-1"> AI-generated {currentFormat} in {currentLanguage} ready for download</p>
                  </div>
                  <Badge className="bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 hover:border-purple-300 hover:text-purple-800 px-4 py-2 text-sm font-medium transition-colors duration-200">
                    {generatedMCQs.length} Questions Rewrittened
                  </Badge>
                </div>

              </div>

              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide w-1/2">Original Question</th>
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide w-1/2">Rewritten Question</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {generatedMCQs.map((mcq, index) => (
                        <tr key={index} className="hover:bg-gray-50/30">
                          {/* Original Question Column */}
                          <td className="px-8 py-6 align-top border-r border-gray-200 w-1/2">
                            <div className="space-y-4 sticky top-4">
                              <div>
                                <div id="originalQuestion" className="font-semibold text-gray-900 mb-2">Original Question:</div>
                                <div id="originalQuestions" className="text-gray-700 p-3 bg-gray-50 rounded border border-gray-200">
                                  {mcq.question}
                                </div>
                              </div>
                              {mcq.passage && (
                                <div className="mt-4">
                                  <div className="font-semibold text-gray-900 mb-2">Passage:</div>
                                  <div className="text-gray-700 p-3 bg-blue-50 rounded border border-blue-200 max-h-96 overflow-y-auto">
                                    {mcq.passage}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Rewritten Question Column */}
                          <td className="px-8 py-6 align-top w-1/2">
                            <div className="space-y-6">
                              {/* Rewritten Question */}
                              <div>
                                <div className="font-semibold text-gray-900 mb-2">Rewritten Question:</div>
                                <div className="text-gray-700 bg-white p-4 rounded-lg border border-gray-200 shadow-sm whitespace-pre-wrap">
                                  {(() => {
                                    // Get the question text without options
                                    const text = mcq.rewrittenQuestion || mcq.question || '';
                                    // If there are line breaks, take only the first line as the question
                                    const firstLine = text.split('\n')[0];

                                    // UPDATED: Better cleaning of trailing markers and incomplete patterns
                                    let cleanedText = firstLine
                                      // Remove trailing option markers
                                      .replace(/\s*[0-9]+[.)]?\s*$|[a-z][.)]?\s*$/i, '')
                                      // Remove incomplete True/False patterns
                                      .replace(/\s*[\(\[\{]\s*(?:True|False)(?:\/(?:Fals?|Tru?)?)?\s*$/i, '')
                                      // Remove complete True/False patterns  
                                      .replace(/\s*[\(\[\{]\s*(?:True|False)(?:\s*[\/\|]\s*(?:True|False))?\s*[\]\)\}]\s*$/i, '')
                                      .trim();

                                    return cleanedText || '—';
                                  })()}

                                </div>
                              </div>

                              {/* Options */}
                              <div className="mt-6">
                                <div className="font-semibold text-gray-900 mb-3">Options:</div>
                                <div className="space-y-3">
                                  {(() => {
                                    // Function to clean option text by removing common markers and formatting
                                    const cleanOptionText = (text: string) => {
                                      if (!text) return '';
                                      let t = text.normalize('NFKC').trim();

                                      // Remove any leading numbering or letters in any language
                                      // This handles patterns like "a. ", "1) ", "क. ", "ক. ", etc.
                                      t = t.replace(/^\s*([0-9]+[.)]?|\p{L}[.)]?)[\s.]*|^\s*[\p{Pd}\p{Pc}\p{Ps}\p{Pe}]\s*/u, '').trim();

                                      // Remove any existing trailing punctuation
                                      t = t.replace(/[.。．,;:!?]+$/, '').trim();

                                      // Add a single full stop at the end if needed
                                      return t && !/[.。．,;:!?]$/.test(t) ? t + '.' : t;
                                    };

                                    let optionsToRender: string[] = [];

                                    // First check if we have explicit options in the MCQ object
                                    if (mcq.options && mcq.options.length > 0) {
                                      optionsToRender = [...mcq.options];
                                    }
                                    // If no explicit options, try to extract from MCQ field
                                    else if (mcq.MCQ) {
                                      // Split the MCQ string by newline to separate the question from options
                                      const mcqLines = mcq.MCQ.split(/\r?\n/);
                                      // Remove the first line (question) and any empty lines
                                      const optionLines = mcqLines.slice(1).filter(line => line.trim() !== '');
                                      if (optionLines.length > 0) {
                                        // Clean leading markers including unicode letters and bullets
                                        optionsToRender = optionLines.map(line => cleanOptionText(line));
                                      }
                                    }

                                    // If no MCQ-derived options, try parsing from rewrittenQuestion/question when options are inline
                                    if (optionsToRender.length === 0 && (mcq.rewrittenQuestion || mcq.question)) {
                                      const rq = (mcq.rewrittenQuestion || mcq.question || '').replace(/\r/g, '');
                                      const rqLines = rq.split('\n');
                                      let optionLines: string[] = [];
                                      if (rqLines.length > 1) {
                                        optionLines = rqLines.slice(1).filter(l => l.trim() !== '');
                                      }
                                      if (optionLines.length === 0) {
                                        // Extract inline options using a more flexible regex that handles French text and special characters
                                        const inline = [] as string[];
                                        // Match options starting with a letter (A-D, a-d) followed by ) or . and space, then capture the text until next option or end
                                        const re = /^\s*([A-Da-d])[).]?\s+([^\n]+?)(?=\s*\n\s*[A-Da-d][).]?|\s*$)/gm;
                                        let match: RegExpExecArray | null;
                                        while ((match = re.exec(rq)) !== null) {
                                          // Use match[2] which contains the option text after the letter and space
                                          inline.push(match[2].trim());
                                        }
                                        // If no matches with letters, try to split by newlines as fallback
                                        if (inline.length === 0) {
                                          optionLines = rq.split('\n').filter(l => l.trim() !== '');
                                        } else {
                                          optionLines = inline;
                                        }
                                      }
                                      if (optionLines.length > 0) {
                                        optionsToRender = optionLines.map(l => cleanOptionText(l));
                                      }
                                    }

                                    // Fall back to options array if still empty
                                    if (optionsToRender.length === 0 && mcq.options && mcq.options.length > 0) {
                                      optionsToRender = mcq.options;
                                    }
                                    // Handle True/False case
                                    if (optionsToRender.length === 0 && /true/i.test(selectedFormat) && /false/i.test(selectedFormat)) {
                                      optionsToRender = getTFOptions(selectedLanguage);
                                    }

                                    // Get the appropriate prefix based on language
                                    const getOptionPrefix = (index: number, language: string) => {
                                      try {
                                        // Debug log
                                        //console.log('getOptionPrefix called with:', { language, index });

                                        // Normalize the language input
                                        const lang = (language || 'english').toString().toLowerCase().trim();

                                        // Define prefixes for different languages
                                        const prefixMap: Record<string, string[]> = {
                                          'hindi': ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ॠ', 'ऌ', 'ॡ', 'ए', 'ऐ', 'ओ', 'औ', 'अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ॠ', 'ऌ', 'ॡ', 'ए', 'ऐ', 'ओ', 'औ'],
                                          'bangla': ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'],
                                          'french': ['a', 'â', 'é', 'i', 'e', 'f', 'g', 'h'],
                                          'english': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
                                          'en': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
                                          'fr': ['a', 'â', 'é', 'i', 'e', 'f', 'g', 'h'],
                                          'hi': ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ॠ', 'ऌ', 'ॡ', 'ए', 'ऐ', 'ओ', 'औ', 'अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ॠ', 'ऌ', 'ॡ', 'ए', 'ऐ', 'ओ', 'औ'],
                                          'bn': ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ']
                                        };

                                        // Debug log
                                        //console.log('Normalized language:', lang);

                                        // Get the appropriate prefix array, default to English if not found
                                        const prefixes = prefixMap[lang] || prefixMap['en'] || [];

                                        // Debug log
                                        //console.log('Selected prefixes:', prefixes);

                                        // Return the prefix with a dot and space, or empty string if index is out of bounds
                                        const result = (index >= 0 && index < prefixes.length) ? `${prefixes[index]}. ` : '';
                                        //console.log('Returning prefix:', result);
                                        return result;
                                      } catch (error) {
                                        console.error('Error in getOptionPrefix:', error);
                                        return ''; // Return empty string on error
                                      }
                                    };

                                    return optionsToRender.map((option, optIndex) => {
                                      const optionLetter = getOptionPrefix(optIndex, currentLanguage || selectedLanguage);
                                      return (
                                        <div
                                          key={optIndex}
                                          className={`p-3 rounded border bg-gray-50 border-gray-200 mb-2`}
                                        >
                                          <div className="flex items-center">
                                            <span className="font-medium w-6">{optionLetter}</span>
                                            <span className="flex-1">{option}</span>
                                          </div>
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex justify-end flex-col mt-4 sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={handleClear}
                  className="border border-red-300 text-red-600 bg-white hover:bg-red-50 hover:border-red-400 hover:text-black transition-all duration-200 px-6 py-2"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
                <Button
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-2 transition-all duration-200 hover:scale-105"
                  onClick={handleDownloadResults}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Results
                </Button>
              </div>
            </div>
          </div>
        )}

        {apiResponseHtml && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold mb-4">Generated Questions</h2>
            <div
              style={htmlContentStyle}
              dangerouslySetInnerHTML={{ __html: apiResponseHtml }}
            />
          </div>
        )}

        {/* Enhanced Footer */}
        <div className="text-center py-8">
          <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center border-2 border-blue-200">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="font-medium">Powered by Advanced AI Technology</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemRewriter;