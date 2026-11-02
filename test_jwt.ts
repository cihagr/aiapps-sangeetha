import jwt from 'jsonwebtoken';
import CryptoJS from 'crypto-js';

const SECRET_KEY = "Excelsoft_KB";

// Generate JWT
const payload = {
  cust_code: 'ACCAO1',
  org_code: 'ACCA01_ES',
  program_id: 101,
  user_id: null,
  username: 'esiguser3',
  type: 'guidelines',
  isSSO: true,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
};

const jwtToken = jwt.sign(payload, SECRET_KEY);
console.log("Generated JWT:", jwtToken);

// Test verification
try {
  jwt.verify(jwtToken, SECRET_KEY);
  console.log("✅ JWT verification PASSED");
} catch (e) {
  console.log("❌ JWT verification FAILED:", e.message);
}

// Encrypt for URL
const encryptedToken = CryptoJS.AES.encrypt(jwtToken, SECRET_KEY).toString();
const encodedToken = encodeURIComponent(encryptedToken);
console.log("\n=== Full Login URL ===");
console.log(`http://localhost:8080/login?enc=${encodedToken}`);
