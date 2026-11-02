// @ts-ignore - CryptoJS types not available
import CryptoJS from 'crypto-js';

const SECRET_KEY = "Excelsoft_KB";

// Function to encrypt existing JWT token and generate URL
function encryptExistingToken(jwtToken: string, baseUrl: string = "http://localhost:8080") {
  try {
    // 1. Encrypt the JWT token using AES
    const encryptedToken = CryptoJS.AES.encrypt(jwtToken, SECRET_KEY).toString();
    
    // 2. URL encode the encrypted token
    const encodedToken = encodeURIComponent(encryptedToken);
    
    // 3. Generate the full URL
    const fullUrl = `${baseUrl}/login?enc=${encodedToken}`;
    
    console.log("\n=== Original JWT Token ===");
    console.log(jwtToken);
    
    console.log("\n=== Encrypted & Encoded 'enc' Parameter ===");
    console.log(encodedToken);
    
    console.log("\n=== Full Login URL ===");
    console.log(fullUrl);
    
    return fullUrl;
    
  } catch (error) {
    console.error("Error encrypting token:", error);
    return null;
  }
}

// Get JWT token from command line argument
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("Usage: npx tsx encrypt_existing_token.ts <jwt_token> [base_url]");
  console.log("Example: npx tsx encrypt_existing_token.ts \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\"");
  console.log("Example with custom URL: npx tsx encrypt_existing_token.ts \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\" \"https://aiapps.z29.web.core.windows.net\"");
  process.exit(1);
}

const jwtToken = args[0];
const baseUrl = args[1] || "http://localhost:8080";

encryptExistingToken(jwtToken, baseUrl);
