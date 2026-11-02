import React, { useState, useEffect } from 'react';
import { withCustOrgCodes } from '@/utils/custOrgCodes';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { loginUser } from "@/api"; // <-- Make sure this path is correct
import CryptoJS from 'crypto-js';
/*
// import { decryptAESGCM, stringToKey } from '../utils/crypto';
*/
import axios from 'axios';
import { jwtDecode } from "jwt-decode";
import { jwtVerify } from 'jose';
import { API_ENDPOINTS, HELP_URL, PRIVACY_URL } from "@/config";
import { AIG_QUIZ_GEN_URL } from "@/utils/Aigapi";


const SECRET_KEY = import.meta.env.VITE_SECRET_KEY || "";
const AZURE_FUNCTION_KEY = import.meta.env.VITE_AZURE_FUNCTION_KEY || "";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showExpiredTokenDialog, setShowExpiredTokenDialog] = useState(false);
  const [isSSO, setisSSO] = useState(true);

  // Helper function to check if error is token expiration
  const isTokenExpiredError = (error: any) => {
    const errorString = String(error).toLowerCase();
    return errorString.includes('expired') ||
      errorString.includes('token') ||
      errorString.includes('jwt') ||
      errorString.includes('verification failed');
  };

  // Helper function for form data change
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const canSubmit = () => formData.username.trim() && formData.password.trim();

  // Main submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const userName = formData.username.trim();
    const password = formData.password.trim();
    sessionStorage.setItem('username', userName);

    if (!userName && !password) {
      setLoading(false);
      setError('Please enter User Name and Password.');
      return;
    }
    if (!userName) {
      setLoading(false);
      setError('Please enter User Name');
      return;
    }
    if (!password) {
      setLoading(false);
      setError('Please enter Password');
      return;
    }

    // Check for encryptedData in localStoragelocalStorage
    let encryptedData = sessionStorage.getItem('encryptedData') || '';
    if (encryptedData) {
      try {
        const decryptedBytes = CryptoJS.AES.decrypt(encryptedData, 'Excelsoft');
        const decryptedData = JSON.parse(decryptedBytes.toString(CryptoJS.enc.Utf8));
        if (decryptedData && decryptedData.username && decryptedData.email) {
          // Check username match
          if (userName !== decryptedData.username) {
            setLoading(false);
            setError('Username does not match');
            return;
          }
          await callIsActiveAPI(decryptedData.username, password, decryptedData.email);
          return;
        }
      } catch (error) {
        setLoading(false);
        setError('Invalid or corrupted data.');
        return;
      }
    }

    // Normal login flow
    try {
      const user = await loginUser(userName, password);
      const userData = user.data && user.data[0] ? user.data[0] : {};
      sessionStorage.setItem('userInfo', JSON.stringify(userData));
      sessionStorage.setItem('email', userName);
      sessionStorage.setItem('password', password);

      const role = (userData.userRole || userData.role || '').toString().trim().toLowerCase();
      if (role === 'superadmin') {
        navigate('/superadmin-dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Correct callIsActiveAPI definition
  const callIsActiveAPI = async (userName, password, email) => {
    sessionStorage.removeItem('encryptedData');
    const apiUrl = API_ENDPOINTS.UPDATE_ACTIVE_REGISTERED_USER;

    if (!userName || !email) {
      setLoading(false);
      alert('Username or email is missing.');
      return;
    }

    try {
      const payload = {
        username: userName,
        email: email
      };
      const isActiveResponse = await axios.post(apiUrl, payload);
      if (isActiveResponse.data.status === "S001") {
        const loginResponse = await loginUser(userName, password);

        if (loginResponse.status === "S001" && loginResponse.data?.length > 0) {
          const userData = loginResponse.data[0];

          sessionStorage.setItem('isLogin', 'true');

          sessionStorage.setItem('username', userName);
          sessionStorage.setItem('password', password);
          sessionStorage.setItem('userCode', userData.userCode);
          sessionStorage.setItem('orgCode', userData.orgCode);
          sessionStorage.setItem('customerCode', userData.customerCode);
          sessionStorage.setItem('UserNameDetails', userData.username);
          sessionStorage.setItem('Isloggedin', 'true');
          sessionStorage.setItem('userRole', userData.userRole);
          // Ensure dashboard can read consolidated user info
          try {
            sessionStorage.setItem('userInfo', JSON.stringify(userData));
          } catch (e) {
            // ignore storage exceptions
          }

          const redirectPath = userData.userRole.trim() === 'SuperAdmin' ? '/admin' : '/dashboard';
          navigate(redirectPath);
          window.history.replaceState({}, '', `${window.location.origin}/dashboard`);
        } else if (loginResponse.data.status === "FU001") {
          setError('User Name is invalid');
        } else if (loginResponse.data.status === "FP001") {
          setError('Password is invalid');
        } else {
          setError('Invalid Credentials');
        }
      } else {
        alert('User is not active or there was an issue.');
      }
    } catch (error) {
      alert('An error occurred during login. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // CRITICAL: Check if URL has enc parameter and if session loginType doesn't match
    const currentUrl = window.location.href;
    if (currentUrl.includes('?enc=')) {
      const urlParams = new URLSearchParams(window.location.search);
      const encFromUrl = urlParams.get('enc');
      const storedEnc = sessionStorage.getItem('lastEncToken');

      // If enc token changed, clear everything and reload
      if (encFromUrl && encFromUrl !== storedEnc) {
        console.log('[SSO Login] New enc token detected, clearing all session...');
        sessionStorage.clear();
        sessionStorage.setItem('lastEncToken', encFromUrl);
        window.location.reload();
        return;
      }
    }

    // REDIRECT: For SSO deep link (loginType === '4'), go to /book-base after session initialized
    const type = sessionStorage.getItem('loginType');
    const isSSO = sessionStorage.getItem('isSSO') === 'true';
    if (isSSO && String(type) === '4') {
      navigate('/book-base', { replace: true });
      return;
    }

    // Auth check
    const checkAuth = () => {
      const isLoggedIn = sessionStorage.getItem('isLogin') === 'true';
      const publicRoutes = ['/login'];

      // Check for 'enc' parameter in URL (supports both query param and hash)
      const currentUrl = window.location.href;
      let encryptedData = '';

      if (currentUrl.includes('?enc=')) {
        const urlParams = new URLSearchParams(window.location.search);
        encryptedData = urlParams.get('enc') || '';
      } else if (currentUrl.includes('#') && currentUrl.split('?enc=').length > 1) {
        // Fallback for hash router if param is after hash
        const parts = currentUrl.split('?enc=');
        if (parts.length > 1) {
          encryptedData = parts[1].split('&')[0];
        }
      }

      // SSO JWT or encrypted legacy handling (auto-detect)
      if (encryptedData) {
        // Clear all session storage to prevent cache issues when switching SSO URLs
        sessionStorage.clear();
        console.log('[SSO Login] Session cleared. Encrypted data detected:', encryptedData);
        (async () => {
          try {
            const maybeJwt = decodeURIComponent(encryptedData);
            console.log('[SSO Login] After decodeURIComponent:', maybeJwt);
            // If we see three dot-separated sections, it's a plain JWT; otherwise, it's encrypted
            if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(maybeJwt)) {
              // Direct JWT verify block (current SSO)
              console.log('[SSO Login] Detected plain JWT token, verifying directly.');
              const secret = new TextEncoder().encode(SECRET_KEY || "");
              console.log('[SSO Login] Using SECRET_KEY for verification');
              const { payload } = await jwtVerify(maybeJwt, secret);
              const decoded = payload as Record<string, any>;
              console.log('[SSO Login] JWT decoded payload:', decoded);
              // Session setup & redirect as before
              console.log('[SSO Login] Setting up session storage...');
              sessionStorage.setItem('isLogin', 'true');
              sessionStorage.setItem('isSSO', 'true');
              setisSSO(true);
              sessionStorage.setItem('username', String(decoded.username || decoded.user_id || decoded.userCode || ""));
              sessionStorage.setItem('userCode', String(decoded.user_id || decoded.userCode || ""));
              sessionStorage.setItem('orgCode', String(decoded.org_code || decoded.orgCode || ""));
              sessionStorage.setItem('orgcode', String(decoded.org_code || decoded.orgCode || ""));
              sessionStorage.setItem('customerCode', String(decoded.cust_code || decoded.customerCode || ""));
              sessionStorage.setItem('custcode', String(decoded.cust_code || decoded.customerCode || ""))
              sessionStorage.setItem('programCode', String(decoded.program_id || decoded.program_id || ""));
              // AIGQuestionGenerator reads this on mount (fetchDropdowns/fetchKnowledgeBases/
              // fetchGuidelines) — left unset, it silently blocks the dropdowns fetch and the
              // "Loading stats..." overlay never clears (isInitialLoad stays true forever).
              sessionStorage.setItem('appcode', 'AIG');
              // UNIT TESTING: Hardcode loginType here to test different flows
              //const loginType = '1'; // Test Knowledge Base
              //const loginType = '2'; // Test Guidelines
              //const loginType = '3'; // Test Advanced Question Generator
              //const loginType = '4'; // Test Book Base
              const loginType = String(decoded.loginType || decoded.logintype || decoded.login_type || decoded.type || '1');
              console.log('[SSO Login] Login type set to:', loginType);
              // Universal session clearing when switching loginType
              const prevLoginType = sessionStorage.getItem('loginType');
              if (prevLoginType && prevLoginType !== loginType) {
                const lastEncToken = sessionStorage.getItem('lastEncToken');
                sessionStorage.clear();
                if (lastEncToken) sessionStorage.setItem('lastEncToken', lastEncToken);
              }
              sessionStorage.setItem('loginType', loginType);
              sessionStorage.setItem('jwtToken', maybeJwt);
              sessionStorage.setItem('userRole', String(decoded.userRole || 'User'));
              const userinfo = {
                "customerCode": decoded.cust_code,
                "orgCode": decoded.org_code,
                "userCode": decoded.user_id,
                "userRole": "User",
                "username": decoded.user_id
              }
              console.log('[SSO Login] UserInfo object:', userinfo);
              sessionStorage.setItem('userInfo', JSON.stringify(userinfo));
              if (decoded.program_id) sessionStorage.setItem('programId', String(decoded.program_id));
              // redirect
              console.log('[SSO Login] Redirecting based on loginType:', loginType);
              if (loginType === '1') {
                console.log('[SSO Login] Navigating to /knowledge-base');
                navigate('/knowledge-base');
              } else if (loginType === '2') {
                console.log('[SSO Login] Navigating to /guidelines');
                navigate('/guidelines');
              } else if (loginType === '3') {
                sessionStorage.setItem('repository_id', String(decoded.repository_id || ''));
                sessionStorage.setItem('programname', String(decoded.program_name || ''));
                sessionStorage.setItem('IntegrationConfigId', String(decoded.integration_config_id || ''));
                console.log('[SSO Login] Navigating to /advanced-question-generator/book-5');
                // API call to get book_id/bookname if loginType === '3'
                try {
                  const bookResp = await axios.post(
                    API_ENDPOINTS.GET_BOOK_ID_NAME,
                    { par_integrationcode: String(decoded.program_id || "") }
                  );
                  console.log('[SSO Login] Book API response:', bookResp.data);

                  if (bookResp.data && bookResp.data.status === "success" && Array.isArray(bookResp.data.data) && bookResp.data.data.length > 0) {
                    const { bookid, bookname } = bookResp.data.data[0];
                    console.log('[SSO Login] ✅ Using bookid:', bookid, 'type:', typeof bookid);

                    // Store book details in sessionStorage
                    sessionStorage.setItem("book_id", String(bookid || ""));
                    sessionStorage.setItem("bookname", String(bookname || ""));
                    sessionStorage.setItem("bookCode", String(bookid || ""));
                    sessionStorage.setItem("bookType", String(bookid || ""));
                    sessionStorage.setItem("selectedBook", JSON.stringify({ id: bookid || 0, bookname: bookname || "" }));

                    // Call chapter API to get chapters/studies
                    try {
                      const chapterResp = await axios.get(
                        withCustOrgCodes(`${AIG_QUIZ_GEN_URL}/chapter?bookcode=${bookid}`, { custcode: decoded.cust_code, orgcode: decoded.org_code })
                      );
                      console.log('[SSO Login] Chapter API response:', chapterResp.data);

                      if (chapterResp.data && Array.isArray(chapterResp.data) && chapterResp.data.length > 0) {
                        const firstChapter = chapterResp.data[0];
                        const chapterCode = firstChapter.chapterCode || firstChapter.chapter_code || "";
                        const chapterName = firstChapter.chapterName || firstChapter.chapter_name || "";

                        sessionStorage.setItem("selectedChapter", chapterName);
                        sessionStorage.setItem("selectedChapterName", chapterName);
                        sessionStorage.setItem("chaptercode", chapterCode);
                        console.log('[SSO Login] Stored chapter:', { chapterCode, chapterName });

                        // Call LO API with the chapter code
                        if (chapterCode) {
                          try {
                            const loResp = await axios.get(
                              withCustOrgCodes(`${AIG_QUIZ_GEN_URL}/lo?chaptercode=${chapterCode}`, { custcode: decoded.cust_code, orgcode: decoded.org_code })
                            );
                            console.log('[SSO Login] LO API response:', loResp.data);

                            if (loResp.data && Array.isArray(loResp.data) && loResp.data.length > 0) {
                              const firstLO = loResp.data[0];
                              const loCode = firstLO.loCode || firstLO.lo_code || "";
                              const loName = firstLO.loName || firstLO.lo_name || "";

                              sessionStorage.setItem("selectedLO", loCode);
                              sessionStorage.setItem("learningObjectivesName", loName);
                              console.log('[SSO Login] Stored LO:', { loCode, loName });
                            }
                          } catch (loErr) {
                            console.error("[SSO Login] Error calling LO API:", loErr);
                          }
                        }
                      }
                    } catch (chapterErr) {
                      console.error("[SSO Login] Error calling chapter API:", chapterErr);
                    }

                    // dropdownloader, get-existing-knowledgebase and get-general-guidelines used to be
                    // pre-fetched here too. dropdownloader's response was never read anywhere; the other
                    // two get re-fetched by AIGQuestionGenerator as soon as it mounts, and that page's own
                    // effects override or clear whatever selection was set from here — so these were three
                    // extra requests on every SSO login (visible as doubled calls vs. direct app usage)
                    // for no effect on the final state. Removed; the generator page fetches its own data.
                  }
                } catch (bookErr) {
                  console.error("[SSO Login] Error fetching book details:", bookErr);
                }
                navigate('/advanced-question-generator/book-5');
              } else if (loginType === '4') {
                console.log('[SSO Login] Navigating to /book-base');
                // Call get-chapter-lo-details API for Book Base SSO
                try {
                  const bookId = sessionStorage.getItem("book_id") || "";
                  const orgCode = sessionStorage.getItem("orgcode") || "";
                  const custCode = sessionStorage.getItem("custcode") || "";
                  const appCode = sessionStorage.getItem("appcode") || "0";
                  // get-chapter-lo-details
                  await axios.post(
                    API_ENDPOINTS.GET_CHAPTER_LO_DETAILS,
                    {
                      par_bookid: bookId,
                      par_orgcode: orgCode,
                      par_custcode: custCode,
                      par_appcode: appCode
                    }
                  );
                  console.log('[SSO Login] Book Base get-chapter-lo-details API called successfully');
                } catch (bookBaseApiErr) {
                  console.error('[SSO Login] Error calling Book Base get-chapter-lo-details API:', bookBaseApiErr);
                }
                navigate('/book-base');
              } else {
                console.log('[SSO Login] Navigating to /dashboard');
                navigate('/dashboard');
              }
              return;
            } else {
              // Assume legacy AES-GCM encrypted: must call Azure Function first
              console.log('[SSO Login] Detected encrypted token, calling Azure Function to decrypt...');
              const apiUrl = `${API_ENDPOINTS.AZURE_DECRYPT_FUNCTION}?action=decrypt&text=${encodeURIComponent(encryptedData)}`;
              console.log('[SSO Login] Azure Function URL:', apiUrl);
              const response = await axios.get(apiUrl, {
                headers: {
                  'x-functions-key': AZURE_FUNCTION_KEY
                }
              });
              const jwtToken = response.data;
              console.log('[SSO Login] Decrypted JWT from Azure Function:', jwtToken);

              // Verify retrieved JWT
              const secret = new TextEncoder().encode(SECRET_KEY || "");
              console.log('[SSO Login] Verifying decrypted JWT...');
              const { payload } = await jwtVerify(jwtToken, secret);
              const decoded = payload as Record<string, any>;
              console.log('[SSO Login] Decrypted JWT payload:', decoded);
              // Standard session setup
              console.log('[SSO Login] Setting up session storage (legacy path)...');
              sessionStorage.setItem('isLogin', 'true');
              sessionStorage.setItem('isSSO', 'true');
              setisSSO(true);
              sessionStorage.setItem('username', String(decoded.username || decoded.user_id || decoded.userCode || ""));
              sessionStorage.setItem('userCode', String(decoded.user_id || decoded.userCode || ""));
              sessionStorage.setItem('orgcode', String(decoded.org_code || decoded.orgCode || ""));
              sessionStorage.setItem('customerCode', String(decoded.cust_code || decoded.customerCode || ""));
              sessionStorage.setItem('custcode', String(decoded.cust_code || decoded.customerCode || ""))
              sessionStorage.setItem('programCode', String(decoded.program_id || decoded.program_id || ""));
              // AIGQuestionGenerator reads this on mount (fetchDropdowns/fetchKnowledgeBases/
              // fetchGuidelines) — left unset, it silently blocks the dropdowns fetch and the
              // "Loading stats..." overlay never clears (isInitialLoad stays true forever).
              sessionStorage.setItem('appcode', 'AIG');
              // UNIT TESTING: Hardcode loginType here to test different flows
              //const loginType = '1'; // Test Knowledge Base
              //const loginType = '2'; // Test Guidelines
              //const loginType = '3'; // Test Advanced Question Generator
              //const loginType = '4'; // Test Book Base
              const loginType = String(decoded.loginType || decoded.logintype || decoded.login_type || decoded.type || '1');
              console.log('[SSO Login] Login type set to (legacy):', loginType);
              // Universal session clearing when switching loginType (legacy)
              const prevLoginType = sessionStorage.getItem('loginType');
              if (prevLoginType && prevLoginType !== loginType) {
                const lastEncToken = sessionStorage.getItem('lastEncToken');
                sessionStorage.clear();
                if (lastEncToken) sessionStorage.setItem('lastEncToken', lastEncToken);
              }
              sessionStorage.setItem('loginType', loginType);
              sessionStorage.setItem('jwtToken', jwtToken);
              sessionStorage.setItem('userRole', String(decoded.userRole || 'User'));
              const userinfo = {
                "customerCode": decoded.cust_code,
                "orgCode": decoded.org_code,
                "userCode": decoded.user_id,
                "userRole": "User",
                "username": decoded.user_id
              }
              console.log('[SSO Login] UserInfo object (legacy):', userinfo);
              sessionStorage.setItem('userInfo', JSON.stringify(userinfo));
              if (decoded.program_id) sessionStorage.setItem('programId', String(decoded.program_id));
              // redirect
              console.log('[SSO Login] Redirecting based on loginType (legacy):', loginType);
              if (loginType === '1') {
                console.log('[SSO Login] Navigating to /knowledge-base (legacy)');
                navigate('/knowledge-base');
              } else if (loginType === '2') {
                console.log('[SSO Login] Navigating to /guidelines (legacy)');
                navigate('/guidelines');
              } else if (loginType === '3') {
                sessionStorage.setItem('repository_id', String(decoded.repository_id || ''));
                sessionStorage.setItem('programname', String(decoded.program_name || ''));
                sessionStorage.setItem('IntegrationConfigId', String(decoded.integration_config_id || ''));
                console.log('[SSO Login] Navigating to /advanced-question-generator/' + decoded.program_id);
                // API call to get book_id/bookname if loginType === '3'
                try {
                  const bookResp = await axios.post(
                    API_ENDPOINTS.GET_BOOK_ID_NAME,
                    { par_integrationcode: String(decoded.program_id || "") }
                  );
                  console.log('[SSO Login] Book API response:', bookResp.data);

                  if (bookResp.data && bookResp.data.status === "success" && Array.isArray(bookResp.data.data) && bookResp.data.data.length > 0) {
                    const { bookid, bookname } = bookResp.data.data[0];
                    console.log('[SSO Login] ✅ Using bookid:', bookid, 'type:', typeof bookid);

                    // Store book details in sessionStorage
                    sessionStorage.setItem("book_id", String(bookid || ""));
                    sessionStorage.setItem("bookname", String(bookname || ""));
                    sessionStorage.setItem("bookCode", String(bookid || ""));
                    sessionStorage.setItem("bookType", String(bookid || ""));
                    sessionStorage.setItem("selectedBook", JSON.stringify({ id: bookid || 0, bookname: bookname || "" }));

                    // Call chapter API to get chapters/studies
                    try {
                      const chapterResp = await axios.get(
                        withCustOrgCodes(`${AIG_QUIZ_GEN_URL}/chapter?bookcode=${bookid}`, { custcode: decoded.cust_code, orgcode: decoded.org_code })
                      );
                      console.log('[SSO Login] Chapter API response:', chapterResp.data);

                      if (chapterResp.data && Array.isArray(chapterResp.data) && chapterResp.data.length > 0) {
                        const firstChapter = chapterResp.data[0];
                        const chapterCode = firstChapter.chapterCode || firstChapter.chapter_code || "";
                        const chapterName = firstChapter.chapterName || firstChapter.chapter_name || "";

                        sessionStorage.setItem("selectedChapter", chapterName);
                        sessionStorage.setItem("selectedChapterName", chapterName);
                        sessionStorage.setItem("chaptercode", chapterCode);
                        console.log('[SSO Login] Stored chapter:', { chapterCode, chapterName });

                        // Call LO API with the chapter code
                        if (chapterCode) {
                          try {
                            const loResp = await axios.get(
                              withCustOrgCodes(`${AIG_QUIZ_GEN_URL}/lo?chaptercode=${chapterCode}`, { custcode: decoded.cust_code, orgcode: decoded.org_code })
                            );
                            console.log('[SSO Login] LO API response:', loResp.data);

                            if (loResp.data && Array.isArray(loResp.data) && loResp.data.length > 0) {
                              const firstLO = loResp.data[0];
                              const loCode = firstLO.loCode || firstLO.lo_code || "";
                              const loName = firstLO.loName || firstLO.lo_name || "";

                              sessionStorage.setItem("selectedLO", loCode);
                              sessionStorage.setItem("learningObjectivesName", loName);
                              console.log('[SSO Login] Stored LO:', { loCode, loName });
                            }
                          } catch (loErr) {
                            console.error("[SSO Login] Error calling LO API:", loErr);
                          }
                        }
                      }
                    } catch (chapterErr) {
                      console.error("[SSO Login] Error calling chapter API:", chapterErr);
                    }

                    // dropdownloader, get-existing-knowledgebase and get-general-guidelines used to be
                    // pre-fetched here too. dropdownloader's response was never read anywhere; the other
                    // two get re-fetched by AIGQuestionGenerator as soon as it mounts, and that page's own
                    // effects override or clear whatever selection was set from here — so these were three
                    // extra requests on every SSO login (visible as doubled calls vs. direct app usage)
                    // for no effect on the final state. Removed; the generator page fetches its own data.
                  }
                } catch (bookErr) {
                  console.error("[SSO Login] Error fetching book details:", bookErr);
                }
                navigate('/advanced-question-generator/' + decoded.program_id);
              } else if (loginType === '4') {
                console.log('[SSO Login] Navigating to /book-base (legacy)');
                // Call get-chapter-lo-details API for Book Base SSO (legacy)
                try {
                  const bookId = sessionStorage.getItem("book_id") || "";
                  const orgCode = sessionStorage.getItem("orgcode") || "";
                  const custCode = sessionStorage.getItem("custcode") || "";
                  const appCode = sessionStorage.getItem("appcode") || "0";
                  // get-chapter-lo-details
                  await axios.post(
                    API_ENDPOINTS.GET_CHAPTER_LO_DETAILS,
                    {
                      par_bookid: bookId,
                      par_orgcode: orgCode,
                      par_custcode: custCode,
                      par_appcode: appCode
                    }
                  );
                  console.log('[SSO Login] Book Base get-chapter-lo-details API called successfully (legacy)');
                } catch (bookBaseApiErr) {
                  console.error('[SSO Login] Error calling Book Base get-chapter-lo-details API (legacy):', bookBaseApiErr);
                }
                navigate('/book-base');
              } else {
                console.log('[SSO Login] Navigating to /dashboard (legacy)');
                navigate('/dashboard');
              }
              return;
            }
          } catch (error) {
            console.error('[SSO Login] Error during decryption/verification:', error);
            if (isTokenExpiredError(error)) {
              console.log('[SSO Login] Token expired, showing dialog');
              setShowExpiredTokenDialog(true);
            }
            return;
          }
        })();
      }
      else {
        setisSSO(false);
      }

      // currentPath is not used, removed for clarity
      if (!isLoggedIn && !publicRoutes.includes(location.pathname)) {
        if (location.hash.split('/login?data=').length > 1) {
          // Get encryptedData from hash
          const urlWithoutHash = location.hash.split('#')[1] || '';
          const urlParams = new URLSearchParams(urlWithoutHash.split('?')[1] || '');
          const encryptedData = urlParams.get('data') || '';
          sessionStorage.setItem('encryptedData', encryptedData);
          navigate('/login');
        } else {
          navigate('/login');
          setisSSO(false);
        }
      }
    };
    checkAuth();
  }, [location, navigate]);

  return (

    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 relative overflow-hidden">
      {/* Animated Background Blobs */}
      {!isSSO && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-r from-blue-400/20 to-cyan-400/20 rounded-full blur-3xl animate-spin" style={{ animationDuration: '20s' }} />
          <div className="absolute top-1/3 -right-20 w-64 h-64 bg-gradient-to-r from-purple-400/15 to-pink-400/15 rounded-full blur-3xl animate-spin" style={{ animationDuration: '25s', animationDirection: 'reverse' }} />
          <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-gradient-to-r from-yellow-400/10 to-orange-400/10 rounded-full blur-3xl animate-spin" style={{ animationDuration: '30s' }} />

          {/* Floating Elements */}
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-400/40 rounded-full animate-pulse" />
          <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-purple-400/40 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-3/4 w-1.5 h-1.5 bg-cyan-400/40 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
      )}
      {!isSSO && (
        <div className="relative z-10 min-h-screen flex">
          {/* Left Side - AI Illustration Area */}
          <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12">
            <div className="max-w-md text-center space-y-8">
              {/* AI-Levate Logo */}
              <div className="flex items-center justify-center space-x-3 mb-8">
                <img
                  src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                  alt="AI-Levate"
                  className="h-12 w-auto"
                />
              </div>

              {/* Abstract AI Visualization */}
              <div className="relative mx-auto w-80 h-80">
                {/* Central Core */}
                <div className="absolute inset-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-gradient-to-r from-primary to-blue-500 rounded-full shadow-2xl animate-pulse" />

                {/* Orbiting Elements */}
                <div className="absolute inset-0 animate-spin" style={{ animationDuration: '20s' }}>
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full opacity-80" />
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full opacity-80" />
                </div>

                <div className="absolute inset-0 animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }}>
                  <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-10 h-10 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full opacity-80" />
                  <div className="absolute top-1/2 left-0 transform -translate-y-1/2 w-6 h-6 bg-gradient-to-r from-red-400 to-rose-400 rounded-full opacity-80" />
                </div>

                {/* Neural Network Lines */}
                <div className="absolute inset-0">
                  <svg className="w-full h-full opacity-30" viewBox="0 0 320 320">
                    <defs>
                      <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2e5c9e" />
                        <stop offset="100%" stopColor="#06B6D4" />
                      </linearGradient>
                    </defs>
                    <path d="M160,60 Q160,160 60,160" stroke="url(#lineGradient)" strokeWidth="2" fill="none" className="animate-pulse" />
                    <path d="M160,60 Q160,160 260,160" stroke="url(#lineGradient)" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: '0.5s' }} />
                    <path d="M60,160 Q160,160 160,260" stroke="url(#lineGradient)" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: '1s' }} />
                    <path d="M260,160 Q160,160 160,260" stroke="url(#lineGradient)" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: '1.5s' }} />
                  </svg>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-4xl font-bold text-gray-900 leading-tight">
                  Welcome Back to
                  <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent"> AI Innovation</span>
                </h2>
                <p className="text-lg text-gray-600 leading-relaxed">
                  Sign in to continue your AI-powered automation and intelligent workflows.
                </p>
              </div>
            </div>
          </div>

          {/* Right Side - Login Form */}
          <div className="flex-1 lg:w-1/2 flex items-center justify-center p-8">
            <div className="w-full max-w-md">
              {/* Mobile Logo */}
              <div className="lg:hidden flex items-center justify-center mb-8">
                <img
                  src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                  alt="AI-Levate"
                  className="h-10 w-auto"
                />
              </div>

              <Card className="border-0 shadow-2xl bg-white/70 backdrop-blur-sm">
                <CardContent className="p-8">
                  {/* Header */}
                  <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
                    <p className="text-gray-600">Sign in to your AI-powered platform</p>
                  </div>

                  {/* Login Form */}
                  <form className="space-y-6" onSubmit={handleSubmit}>
                    {loading && (
                      <div className="flex justify-center items-center text-blue-600 text-base font-medium py-2">
                        Signing in, please wait...
                      </div>
                    )}
                    <div>
                      <Input
                        placeholder="Username or Email"
                        value={formData.username}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        className="h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                        disabled={loading}
                      />
                    </div>

                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        className="h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200 pr-12"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        title={showPassword ? "Hide" : "Show"}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                        disabled={loading}
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>

                    {error && (
                      <div className="text-sm text-red-600 font-medium text-center">
                        {error}
                      </div>
                    )}
                    <div className="flex items-center justify-between hidden">
                      <button
                        type="button"
                        className="text-sm text-primary hover:text-primary/80 transition-colors"
                        disabled={loading}
                      >
                        Forgot password?
                      </button>
                    </div>

                    <Button
                      type="submit"
                      disabled={!canSubmit() || loading}
                      className="w-full h-12 bg-[#2563eb] hover:bg-[#2563eb]/90 text-white font-semibold rounded-lg transform transition-all duration-200 hover:scale-[1.02] disabled:opacity-50"
                    >
                      {loading ? "Signing In..." : "Sign In"}
                    </Button>
                  </form>

                  <div className="mt-6 text-center">
                    <p className="text-sm text-gray-600">
                      Don't have an account?{' '}
                      <button
                        onClick={() => navigate('/register')}
                        className="text-primary hover:text-primary/80 font-medium transition-colors underline"
                      >
                        Sign up
                      </button>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Footer */}
              <div className="mt-8 text-center space-y-2">
                <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
                  <Sparkles className="w-3 h-3" />
                  <span className="flex items-center gap-1">Powered By:
                    <img
                      src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                      alt="AI-Levate"
                      className="h-3 w-auto"
                    />
                  </span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Copyright © 2026 | Excelsoft Technologies Ltd.</p>
                  <div className="flex items-center justify-center space-x-4">
                    <a href={PRIVACY_URL} className="hover:text-primary transition-colors">Privacy and Cookie Policy</a>
                    <span>•</span>
                    <a href={HELP_URL} className="hover:text-primary transition-colors">Help</a>
                    <span>•</span>
                    <span>Version: V.1.0.0</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Expired Token Dialog */}
      <Dialog open={showExpiredTokenDialog} onOpenChange={setShowExpiredTokenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Token Expired</DialogTitle>
          </DialogHeader>
          <div className="text-center py-4">
            <p className="text-gray-600">
              Your SSO token has expired. Please log in again OR get the valid token to continue.
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => {
                setShowExpiredTokenDialog(false);
                // Clear any SSO-related session data
                sessionStorage.removeItem('isSSO');
                setisSSO(false);
                sessionStorage.removeItem('jwtToken');
                // Navigate to login page (already on login, but ensure clean state)
                navigate('/login');
              }}
              className="w-full sm:w-auto"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    //)}
  );
};

export default Login;