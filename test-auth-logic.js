// Test script to verify AuthGuard logic
// This simulates the sessionStorage state and tests the conditions

// Test case 1: SSO URL with enc parameter, isSSO=true, no userInfo/user
console.log('=== Test Case 1: SSO with enc parameter, isSSO=true, no userInfo/user ===');
sessionStorage.clear();
sessionStorage.setItem('isSSO', 'true');
// userInfo and user are not set

const userInfo = sessionStorage.getItem('userInfo');
const user = sessionStorage.getItem('user');
const isSSO = sessionStorage.getItem('isSSO') === 'true';

console.log('userInfo:', userInfo);
console.log('user:', user);
console.log('isSSO:', isSSO);

if (isSSO && !userInfo && !user) {
  console.log('✅ Should navigate to /knowledge-base');
} else if (!userInfo && !user) {
  console.log('❌ Would navigate to /login');
} else {
  console.log('✅ Would allow access');
}

// Test case 2: Normal user with userInfo
console.log('\n=== Test Case 2: Normal user with userInfo ===');
sessionStorage.clear();
sessionStorage.setItem('userInfo', '{"username":"test","role":"user"}');

const userInfo2 = sessionStorage.getItem('userInfo');
const user2 = sessionStorage.getItem('user');
const isSSO2 = sessionStorage.getItem('isSSO') === 'true';

console.log('userInfo:', userInfo2);
console.log('user:', user2);
console.log('isSSO:', isSSO2);

if (isSSO2 && !userInfo2 && !user2) {
  console.log('❌ Would navigate to /knowledge-base');
} else if (!userInfo2 && !user2) {
  console.log('❌ Would navigate to /login');
} else {
  console.log('✅ Would allow access');
}

// Test case 3: No authentication at all
console.log('\n=== Test Case 3: No authentication ===');
sessionStorage.clear();

const userInfo3 = sessionStorage.getItem('userInfo');
const user3 = sessionStorage.getItem('user');
const isSSO3 = sessionStorage.getItem('isSSO') === 'true';

console.log('userInfo:', userInfo3);
console.log('user:', user3);
console.log('isSSO:', isSSO3);

if (isSSO3 && !userInfo3 && !user3) {
  console.log('❌ Would navigate to /knowledge-base');
} else if (!userInfo3 && !user3) {
  console.log('✅ Would navigate to /login');
} else {
  console.log('❌ Would allow access');
}
