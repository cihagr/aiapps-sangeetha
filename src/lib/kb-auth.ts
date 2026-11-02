import config from "../config";

let cachedKbToken: { token: string; expiresAt: number } | null = null;
let kbRefreshTimer: ReturnType<typeof setTimeout> | null = null;

const KB_TOKEN_LIFETIME_MS = 14 * 60 * 1000;

async function fetchKbToken(): Promise<string> {
  const formData = new FormData();
  formData.append("client_id", String((config as any)?.CLIENT_ID || ""));
  formData.append("client_secret", String((config as any)?.CLIENT_SECRET_KEY || ""));

  const resp = await fetch((config as any)?.API_ENDPOINTS?.GENERATE_AUTH_TOKEN, {
    method: "POST",
    body: formData,
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.access_token) {
    const msg = json?.detail || json?.message || `Failed to generate auth token (status: ${resp.status})`;
    throw new Error(msg);
  }
  return String(json.access_token);
}

function scheduleKbTokenRefresh(): void {
  if (kbRefreshTimer) clearTimeout(kbRefreshTimer);
  kbRefreshTimer = setTimeout(async () => {
    try {
      const token = await fetchKbToken();
      cachedKbToken = { token, expiresAt: Date.now() + KB_TOKEN_LIFETIME_MS };
      scheduleKbTokenRefresh();
    } catch (e) {
      console.error("[kbAuth] Token refresh failed:", e);
      kbRefreshTimer = setTimeout(scheduleKbTokenRefresh, 30_000);
    }
  }, KB_TOKEN_LIFETIME_MS);
}

export async function getKbAuthToken(): Promise<string> {
  if (cachedKbToken && Date.now() < cachedKbToken.expiresAt) return cachedKbToken.token;
  const token = await fetchKbToken();
  cachedKbToken = { token, expiresAt: Date.now() + KB_TOKEN_LIFETIME_MS };
  scheduleKbTokenRefresh();
  return token;
}

export function clearKbAuthTokenCache(): void {
  cachedKbToken = null;
  if (kbRefreshTimer) {
    clearTimeout(kbRefreshTimer);
    kbRefreshTimer = null;
  }
}
