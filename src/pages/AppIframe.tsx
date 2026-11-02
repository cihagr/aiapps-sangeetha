import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loader";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppDetail, getAppDetails, API_BASE_URL } from "@/api";
import { ITEM_VALIDATION_APP_URL } from "@/utils/Aigapi";
import { SignJWT } from "jose";

const SSO_ENDPOINT = `${API_BASE_URL}/aiapps/Login/ssoTokenGen`;

// Local Item Validation SSO: build JWT with same secret used by Item Validation Login.tsx
const IV_LOCAL_URL = ITEM_VALIDATION_APP_URL;
const IV_SSO_SECRET = "Excelsoftcorp";

async function buildIVSsoToken(userInfo: Record<string, any>): Promise<string> {
  const secret = new TextEncoder().encode(IV_SSO_SECRET);
  return new SignJWT({
    user_id: userInfo.userCode || "",
    org_code: userInfo.orgCode || "",
    cust_code: userInfo.customerCode || "",
    userRole: userInfo.userRole || "User",
    username: userInfo.username || userInfo.userCode || "",
    loginType: "IV",   // custom type: tells IV Login to go to /item-validation
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

const AppIframe = () => {
  const { appCode = "" } = useParams<{ appCode: string }>();
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(null);
  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load app details to discover URL and validate redirect-eligibility
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
        const usercode = userInfo.userCode || "";
        const orgcode = userInfo.orgCode || "";
        if (!usercode || !orgcode) {
          throw new Error("User not logged in or missing codes");
        }
        const apps = await getAppDetails(usercode, orgcode, 1);
        const match = (apps || []).find(a => (a.appCode || "").toLowerCase() === appCode.toLowerCase());
        if (!match) {
          throw new Error(`App ${appCode} not found`);
        }
        if (!(match as any).isRedirect && appCode.toUpperCase() !== "IV") {
          // If not an iframe/redirect type, send user to mapped internal route or back
          throw new Error("This app is not configured for iframe redirection.");
        }
        setApp(match);
      } catch (e: any) {
        const msg = e?.message || "Failed to load app details";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [appCode]);

  // Generate SSO token — for IV (local), build JWT directly; otherwise call remote SSO
  useEffect(() => {
    const fetchToken = async () => {
      try {
        setLoading(true);
        setError(null);

        if (appCode.toUpperCase() === "IV") {
          // Local SSO: generate JWT, store in state so iframe renders with it
          const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
          const jwt = await buildIVSsoToken(userInfo);
          setToken(jwt);
          setLoading(false);
          return;
        }

        const res = await fetch(SSO_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: sessionStorage.getItem("email"),
            password: sessionStorage.getItem("password"),
            appcode: appCode,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const t = data?.token as string | undefined;
        if (!t) throw new Error("Token not present in response");
        setToken(t);
      } catch (err: any) {
        const msg = err?.message || "Failed to generate SSO token";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    if (appCode) fetchToken();
  }, [appCode]);

  // Build iframe source from applicationURL and token
  const iframeSrc = useMemo(() => {
    if (!token) return undefined;

    // IV: the Item Validation app (VITE_ITEM_VALIDATION_APP_URL)
    if (appCode.toUpperCase() === "IV") {
      return `${IV_LOCAL_URL}/login?enc=${encodeURIComponent(token)}`;
    }

    if (!app?.applicationURL) return undefined;
    const base = app.applicationURL;
    if (base.includes("#")) {
      const joiner = base.includes("?") ? "&" : "?";
      return `${base}${joiner}isSSO=1&token=${encodeURIComponent(token)}`;
    }
    return `${base}#/isSSO=1&token=${encodeURIComponent(token)}`;
  }, [token, app?.applicationURL, appCode]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
              alt="AI-Levate"
              className="h-8 w-auto"
            />
            <div>
              {/* Intentionally minimal header */}
            </div>
          </div>
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="text-gray-600">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      {loading && <PageLoader text="Loading tools..." />}

      <main className="p-0">
        {error && (
          <div className="p-6">
            <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
              <p className="font-semibold">Unable to load {app?.applicationName || appCode}</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}
        {iframeSrc && !loading && !error && (
          <iframe
            title={app?.applicationName || appCode}
            src={iframeSrc}
            className="w-full h-[calc(100vh-64px)] border-0"
            allow="clipboard-write; fullscreen; display-capture;"
          />
        )}
      </main>
    </div>
  );
};

export default AppIframe;
