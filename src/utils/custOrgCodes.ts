/**
 * The chapter and learning-objective APIs are scoped by customer and
 * organisation, so each call sends custcode and orgcode with it.
 *
 * The signed-in user's codes are read the way the rest of the app reads them:
 * the session keys first, then the userInfo object saved at login.
 */
export const getSessionCustOrgCodes = (): { custcode: string; orgcode: string } => {
  let userInfo: any = {};
  try {
    userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}') || {};
  } catch {
    userInfo = {};
  }
  const read = (key: string) => {
    try { return sessionStorage.getItem(key) || ''; } catch { return ''; }
  };
  return {
    custcode: String(read('custcode') || userInfo.customerCode || userInfo.custCode || userInfo.customercode || ''),
    orgcode: String(read('orgcode') || userInfo.orgCode || userInfo.organizationCode || userInfo.organizationcode || ''),
  };
};

/**
 * Appends custcode and orgcode to a GET url. Codes passed in win (for example
 * the customer / organisation picked on an admin screen, or the ones in the
 * login token); anything missing falls back to the signed-in user's.
 */
export const withCustOrgCodes = (
  url: string,
  codes?: { custcode?: string | null; orgcode?: string | null },
): string => {
  const fallback = getSessionCustOrgCodes();
  const custcode = String(codes?.custcode || fallback.custcode || '');
  const orgcode = String(codes?.orgcode || fallback.orgcode || '');
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}custcode=${encodeURIComponent(custcode)}&orgcode=${encodeURIComponent(orgcode)}`;
};
