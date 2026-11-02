import jwt from 'jsonwebtoken';
import CryptoJS from 'crypto-js';

// Configuration - MUST MATCH FRONTEND VITE_SECRET_KEY in .env
const SECRET_KEY = "Excelsoft_KB";

// Get command line arguments
const args = process.argv.slice(2);

const usernameInput = args[0] || "esiguser3";
const orgCodeInput = args[1] || "ACCA01_ES";
const customerCodeInput = args[2] || "ACCAO1";
const typeInput = args[3] || "knowledgebase";
const programIdInput = parseInt(args[4] || "101", 10);
const userIdInput = parseInt(args[0] || "3", 10); // Attempting integer if possible, else use string in login
const isSSOInput = args[5] !== "false"; // Default to true unless explicitly set to "false"

console.log(`Generating token for Username: ${usernameInput}, Org: ${orgCodeInput}, Customer: ${customerCodeInput}, Type: ${typeInput}, ProgramID: ${programIdInput}, isSSO: ${isSSOInput}`)

// 1. Define the User Payload
const userPayload = {
    cust_code: customerCodeInput,
    org_code: orgCodeInput,
    program_id: programIdInput,
    user_id: userIdInput,
    username: usernameInput, // Add username to payload
    type: typeInput,
    isSSO: isSSOInput, // Flag to indicate SSO authentication
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
};

// 2. Generate JWT (using the same key for consistency)
const token = jwt.sign(userPayload, SECRET_KEY);

console.log("\n=== Generated JWT Token ===");
console.log(token);


// 3. Encrypt the Token (AES) - This is what the frontend expects in 'enc' param
const encryptedToken = CryptoJS.AES.encrypt(token, SECRET_KEY).toString();
const encodedToken = encodeURIComponent(encryptedToken);

console.log("\n=== Encrypted & Encoded 'enc' Parameter ===");
console.log(encodedToken);

console.log("\n=== Full Login URL ===");
console.log(`http://localhost:8080/login?enc=${encodedToken}`);

console.log("\n\nTo run this script with defaults: npx tsx generate_token.ts");
console.log("To run with custom values: npx tsx generate_token.ts <username> <org_code> <cust_code> [type] [program_id_int] [isSSO]");
console.log("Example KB: npx tsx generate_token.ts esiguser3 ACCA01_ES ACCAO1 knowledgebase 101");
console.log("Example Guidelines: npx tsx generate_token.ts esiguser3 ACCA01_ES ACCAO1 guidelines 101");
console.log("Example AIG: npx tsx generate_token.ts esiguser3 ACCA01_ES ACCAO1 aig 101");
console.log("Example Non-SSO: npx tsx generate_token.ts esiguser3 ACCA01_ES ACCAO1 knowledgebase 101 false");
