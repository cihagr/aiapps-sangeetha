import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINTS } from '@/config';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const bookDetailsFetchedRef = useRef(false);

  useEffect(() => {
    const checkAuth = async () => {
      const userInfo = sessionStorage.getItem('userInfo');
      const user = sessionStorage.getItem('user');
      const isSSO = sessionStorage.getItem('isSSO') === 'true';
      const type = sessionStorage.getItem('loginType');
      const bookcode = sessionStorage.getItem('programCode');
      const custcode = sessionStorage.getItem('customerCode');
      const orgcode = sessionStorage.getItem('orgcode');
      const usercode = sessionStorage.getItem('orgCode');

      // DEBUG LOG: output session values at the time AuthGuard runs
      console.log("[AuthGuard] session=", {
        userInfo, user, isSSO, type, bookcode, custcode, orgcode, usercode,
        // show raw sessionStorage as safety net
        all: { ...sessionStorage }
      });

      // This should navigate to knowledge-base regardless of the current URL
      if (isSSO && String(type).toLowerCase() === '1') {
        // Allow access to edit-kb routes for SSO Type 1 users
        if (location.pathname.startsWith('/edit-kb/')) {
          return;
        }
        if (location.pathname !== '/knowledge-base') {
          navigate('/knowledge-base', { replace: true });
        }
        return;
      }
      else if (isSSO && String(type).toLowerCase() === '2') {
        if (location.pathname !== '/guidelines') {
          navigate('/guidelines', { replace: true });
        }
        return;
      }
      else if (isSSO && String(type).toLowerCase() === '3') {
        sessionStorage.setItem('appcode','AIG')
        const userinfo={
            "customerCode": custcode,
            "orgCode": orgcode,
            "userCode": usercode,
            "userRole": "User",
            "username": usercode 
        }
        sessionStorage.setItem('custcode', String(custcode || ""))
        sessionStorage.setItem('orgcode', String(orgcode || ""));
        sessionStorage.setItem('userInfo',JSON.stringify(userinfo));
        const targetPath = '/advanced-question-generator/' + bookcode;
        if (location.pathname !== targetPath) {
          navigate(targetPath, { replace: true });
        }
        return;
      }
      else if (isSSO && String(type).toLowerCase() === '4') {
        console.log('[AuthGuard] Type 4 detected - Setting up session for Edit LO');

        // DYNAMIC from session/JWT
        const appCode = 'AIG';
        const dynamicCustCode = custcode || '';      // From session (JWT)
        const dynamicOrgCode = orgcode || '';   // From session (JWT)

        // Get book_id and bookname from sessionStorage or API (if not already fetched)
        let dynamicBookId = sessionStorage.getItem('book_id') || sessionStorage.getItem('ssoBookId') || '';
        let dynamicBookName = sessionStorage.getItem('bookname') || sessionStorage.getItem('ssoBookName') || '';

        // Only call API if book_id is not already in sessionStorage and we haven't fetched yet
        if (!dynamicBookId && !bookDetailsFetchedRef.current) {
          bookDetailsFetchedRef.current = true; // Mark as fetched immediately to prevent concurrent calls
          try {
            const integrationCode = sessionStorage.getItem('programCode') || '';
            console.log('[AuthGuard] Fetching book details from API for integrationCode:', integrationCode);
            if (!integrationCode) {
              console.warn('[AuthGuard] Missing programCode/integrationCode in sessionStorage; skipping get-book-id-name call');
              return;
            }
            const bookResp = await fetch(API_ENDPOINTS.GET_BOOK_ID_NAME, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ par_integrationcode: integrationCode })
            });
            if (bookResp.ok) {
              const bookData = await bookResp.json();
              const rows = Array.isArray(bookData)
                ? bookData
                : (Array.isArray((bookData as any)?.data) ? (bookData as any).data : []);
              if (rows.length > 0) {
                const row = rows[0] || {};
                const rawBookId = (row as any).book_id ?? (row as any).bookid ?? (row as any).bookId ?? (row as any).id;
                const rawBookName = (row as any).bookname ?? (row as any).bookName ?? (row as any).name;
                dynamicBookId = String(rawBookId ?? '');
                dynamicBookName = String(rawBookName ?? '');
                console.log('[AuthGuard] Fetched book details from API:', {
                  book_id: dynamicBookId,
                  bookname: dynamicBookName,
                  raw: row
                });
              } else {
                console.warn('[AuthGuard] get-book-id-name returned no rows:', bookData);
              }
            }
          } catch (apiErr) {
            console.error('[AuthGuard] Error fetching book details from API:', apiErr);
          }
        } else {
          console.log('[AuthGuard] Using existing book_id from sessionStorage or already fetched:', dynamicBookId);
        }

        sessionStorage.setItem('appcode', appCode);
        sessionStorage.setItem('appname', 'Advanced Item Generator');
        sessionStorage.setItem('custcode', dynamicCustCode);
        sessionStorage.setItem('orgcode', dynamicOrgCode);
        sessionStorage.setItem('customerCode', dynamicCustCode);
        sessionStorage.setItem('selectedCustomerCode', dynamicCustCode);
        sessionStorage.setItem('ssoBookName', dynamicBookName);
        sessionStorage.setItem('ssoBookId', dynamicBookId);
        sessionStorage.setItem('book_id', dynamicBookId);
        sessionStorage.setItem('bookname', dynamicBookName);

        if (!userInfo) {
          const userinfoObj={
              "customerCode": dynamicCustCode,
              "orgCode": dynamicOrgCode,
              "userCode": usercode,
              "userRole": "User",
              "username": usercode
          }
          sessionStorage.setItem('userInfo', JSON.stringify(userinfoObj));
        }
        sessionStorage.setItem('isEditingStudyLO', 'true');
        sessionStorage.setItem('ssoEditLOParams', JSON.stringify({
          appcode: appCode,
          custcode: dynamicCustCode,
          orgcode: dynamicOrgCode,
          sourcename: dynamicBookName,
          bookid: dynamicBookId
        }));
        console.log('[AuthGuard] Session setup complete:', {
          appcode: appCode,
          custcode: dynamicCustCode,
          orgcode: dynamicOrgCode,
          sourcename: dynamicBookName,
          bookid: dynamicBookId
        });
        console.log('[AuthGuard] Navigating to Edit LO - APIs will be called on page load');
        if (location.pathname !== '/book-base') {
          navigate('/book-base', { replace: true });
        }
        return;
      }

      // For all other cases: if no userInfo and no user, redirect to login
      if (!userInfo && !user) {
        navigate('/login', { replace: true });
        return;
      }
    };

    checkAuth();
  }, [navigate, location]);

  return <>{children}</>;
};

export default AuthGuard;
