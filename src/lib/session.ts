export function getSessionCodes() {
  const raw = sessionStorage.getItem('user') || sessionStorage.getItem('userInfo') || '{}';
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw as string) || {};
  } catch (e) {
    parsed = {};
  }

  const usercode = (
    sessionStorage.getItem('usercode') ||
    sessionStorage.getItem('userCode') ||
    parsed?.userCode ||
    parsed?.usercode ||
    parsed?.user ||
    ''
  ).toString();
  const custcode = (
    sessionStorage.getItem('custcode') ||
    sessionStorage.getItem('customerCode') ||
    sessionStorage.getItem('customercode') ||
    parsed?.customerCode ||
    parsed?.custcode ||
    parsed?.cust_code ||
    ''
  ).toString();
  const orgcode = (
    sessionStorage.getItem('orgcode') ||
    sessionStorage.getItem('orgCode') ||
    sessionStorage.getItem('orgcode') ||
    parsed?.orgCode ||
    parsed?.orgcode ||
    parsed?.org_code ||
    parsed?.organizationCode ||
    ''
  ).toString();
  const appcode = (sessionStorage.getItem('appcode') || sessionStorage.getItem('appCode') || 'IG').toString();

  return {
    usercode,
    custcode,
    orgcode,
    appcode,
  };
}
