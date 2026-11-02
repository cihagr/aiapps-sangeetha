import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyRound, Menu, Pencil, Trash2, Loader2, X, Plus } from "lucide-react";
import { SuperAdminSidebar } from "@/components/SuperAdminSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { API_ENDPOINTS } from "../config";
import { getKbAuthToken } from "@/lib/kb-auth";
import { getAppDetails } from "@/api";
import { getSessionCustOrgCodes } from "@/utils/custOrgCodes";
import { toast } from "@/components/ui/use-toast";
import CryptoJS from "crypto-js";

const LLM_PROVIDERS = ["Azure", "Gemini", "Vertex"] as const;
type LLMProvider = (typeof LLM_PROVIDERS)[number];

// "LLM" = chat/generation model, "Embedding" = the model knowledge-base vector
// stores are built and queried with. Saved in the configtype column.
const CONFIG_TYPES = ["LLM", "Embedding"] as const;
type ConfigType = (typeof CONFIG_TYPES)[number];

const EMBEDDING_PROVIDERS = ["Azure", "Gemini"] as const;
type EmbeddingProvider = (typeof EMBEDDING_PROVIDERS)[number];

type LLMConfig = {
  id: number;
  custcode: string;
  orgcode: string;
  appcode: string;
  configtype: ConfigType;
  llmprovider: string;
  projectname: string;
  apikey: string;
  endpoint: string;
  deploymentname: string;
  modelname: string;
  apiversion: string;
};

// Inline "new entry" draft id — the save endpoint treats this as an insert.
const NEW_DRAFT_ID = -1;

// Customer / Organization are optional. Left empty, the row is the DEFAULT:
// used for every customer/organisation that has no row of its own.
// (Radix Select items can't use "" as a value, hence the sentinel.)
const NONE = "__none__";
const DEFAULT_CUSTOMER_LABEL = "All customers (default)";
const DEFAULT_ORG_LABEL = "All organizations (default)";

const getUserCode = (): string => {
  try {
    const ui = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    return String(
      sessionStorage.getItem("userCode") || ui?.usercode || ui?.userCode || ui?.userId || ""
    );
  } catch {
    return sessionStorage.getItem("userCode") || "";
  }
};

const readList = (json: any): any[] => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.result)) return json.result;
  if (Array.isArray(json?.items)) return json.items;
  return [];
};

const assertOk = (response: Response, json: any) => {
  if (!response.ok || String(json?.status || "").toLowerCase() === "error") {
    throw new Error(json?.message || json?.error || `Request failed (status: ${response.status})`);
  }
};

const toConfig = (row: any): LLMConfig => ({
  id: Number(row?.id ?? 0),
  custcode: String(row?.custcode ?? ""),
  orgcode: String(row?.orgcode ?? ""),
  appcode: String(row?.appcode ?? ""),
  // Rows saved before Config Type existed are LLM rows.
  configtype: String(row?.configtype ?? "").toLowerCase() === "embedding" ? "Embedding" : "LLM",
  llmprovider: String(row?.llmprovider ?? ""),
  projectname: String(row?.projectname ?? ""),
  apikey: decryptApiKey(String(row?.apikey ?? "")),
  endpoint: String(row?.endpoint ?? ""),
  deploymentname: String(row?.deploymentname ?? ""),
  modelname: String(row?.modelname ?? ""),
  apiversion: String(row?.apiversion ?? ""),
});

const maskKey = (key: string): string => {
  if (!key) return "—";
  const tail = key.slice(-4);
  return `••••${tail}`;
};

// Same AES scheme already used elsewhere in this app (Login.tsx / Register.tsx)
// — reusing their shared key rather than introducing a new secret. This is
// obfuscation, not real security: the key ships in the frontend bundle and is
// visible to anyone who views the built JS. It keeps the key out of plaintext
// at rest in the database (a DB leak/backup/DBA glance), nothing stronger.
const API_KEY_CIPHER_SECRET = "Excelsoft";

const encryptApiKey = (plain: string): string => {
  if (!plain) return "";
  return CryptoJS.AES.encrypt(plain, API_KEY_CIPHER_SECRET).toString();
};

const decryptApiKey = (cipher: string): string => {
  if (!cipher) return "";
  try {
    const text = CryptoJS.AES.decrypt(cipher, API_KEY_CIPHER_SECRET).toString(CryptoJS.enc.Utf8);
    // Rows saved before this change are still plaintext — decrypting those
    // yields "" (or garbage), so fall back to the raw value instead of
    // blanking out an existing key.
    return text || cipher;
  } catch {
    return cipher;
  }
};

export default function LLMConfiguration() {
  const navigate = useNavigate();
  const [accessChecked, setAccessChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);

  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedOrganization, setSelectedOrganization] = useState("");
  const [selectedApp, setSelectedApp] = useState("");
  // Editing a row sets Customer, Organization and App together; these carry the
  // row's Organization / App past the cascades below, which otherwise clear them.
  const pendingOrgRef = useRef<string | null>(null);
  const pendingAppRef = useRef<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>("Azure");
  const [selectedConfigType, setSelectedConfigType] = useState<ConfigType>("LLM");
  const [selectedEmbeddingProvider, setSelectedEmbeddingProvider] = useState<EmbeddingProvider>("Azure");

  const [formProjectName, setFormProjectName] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formEndpoint, setFormEndpoint] = useState("");
  const [formDeploymentName, setFormDeploymentName] = useState("");
  const [formModelName, setFormModelName] = useState("");
  const [formApiVersion, setFormApiVersion] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LLMConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Real redirect guard — this page holds credentials, so unlike the rest of the
  // admin pages (which only hide the menu item) a non-superadmin is sent away.
  useEffect(() => {
    try {
      let role = sessionStorage.getItem("userRole") || "";
      if (!role) {
        const uiRaw = sessionStorage.getItem("userInfo");
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || "{}");
          role = ui?.userRole || ui?.role || "";
        }
      }
      if (String(role || "").trim().toLowerCase() === "superadmin") {
        setAccessChecked(true);
      } else {
        navigate("/login", { replace: true });
      }
    } catch {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // Dropdown 1 — Customer
  useEffect(() => {
    if (!accessChecked) return;
    const fetchCustomers = async () => {
      try {
        const token = await getKbAuthToken();
        const res = await fetch(`${API_ENDPOINTS.GET_CUSTOMER_DATA}?auth_token=${encodeURIComponent(token)}`);
        const json = await res.json();
        setCustomers(readList(json));
      } catch (err) {
        console.error("Failed to fetch customers", err);
      }
    };
    fetchCustomers();
  }, [accessChecked]);

  // Dropdown 2 — Organization (cascades off Customer)
  useEffect(() => {
    const keepOrg = pendingOrgRef.current;
    pendingOrgRef.current = null;
    if (!selectedCustomer) {
      setOrganizations([]);
      setSelectedOrganization(keepOrg ?? "");
      return;
    }
    setSelectedOrganization(keepOrg ?? "");

    const fetchOrgs = async () => {
      try {
        const token = await getKbAuthToken();
        const payload = {
          par_custcode: selectedCustomer,
          // Intentionally blank for this page only — other callers of this
          // endpoint still pass the real usercode.
          par_usercode: "",
          auth_token: token,
        };
        const res = await fetch(API_ENDPOINTS.GET_ORGANIZATION_DETAILS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        setOrganizations(readList(json));
      } catch (err) {
        console.error("Failed to fetch organizations", err);
      }
    };
    fetchOrgs();
  }, [selectedCustomer]);

  // Dropdown 3 — App (cascades off Organization). Different auth model (no token,
  // just query params) — getAppDetails already implements this call. With no
  // Organization selected (a default row), the signed-in user's organization
  // supplies the app list.
  useEffect(() => {
    const keepApp = pendingAppRef.current;
    pendingAppRef.current = null;
    setSelectedApp(keepApp ?? "");

    const orgForApps = selectedOrganization || getSessionCustOrgCodes().orgcode;
    if (!orgForApps) {
      setApps([]);
      return;
    }

    const fetchApps = async () => {
      try {
        const list = await getAppDetails(getUserCode(), orgForApps, 1);
        setApps(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error("Failed to fetch apps", err);
      }
    };
    fetchApps();
  }, [selectedOrganization]);

  const fetchConfigurations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getKbAuthToken();
      const payload = { par_custcode: "", par_orgcode: "", par_appcode: "", auth_token: token };
      const res = await fetch(API_ENDPOINTS.GET_LLM_CONFIGURATIONS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      assertOk(res, json);
      setConfigs(readList(json).map(toConfig));
    } catch (err: any) {
      setError(err?.message || "Failed to load saved configurations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessChecked) fetchConfigurations();
  }, [accessChecked, fetchConfigurations]);

  const resetForm = () => {
    setEditingId(null);
    setFormProjectName("");
    setFormApiKey("");
    setFormEndpoint("");
    setFormDeploymentName("");
    setFormModelName("");
    setFormApiVersion("");
  };

  const openEdit = (cfg: LLMConfig) => {
    setEditingId(cfg.id);
    // A cascade runs only when its dropdown's value actually changes.
    if (cfg.custcode !== selectedCustomer) pendingOrgRef.current = cfg.orgcode;
    if (cfg.orgcode !== selectedOrganization) pendingAppRef.current = cfg.appcode;
    setSelectedCustomer(cfg.custcode);
    setSelectedOrganization(cfg.orgcode);
    setSelectedApp(cfg.appcode);
    setSelectedConfigType(cfg.configtype);
    if (cfg.configtype === "Embedding") {
      setSelectedEmbeddingProvider((cfg.llmprovider as EmbeddingProvider) || "Azure");
    } else {
      setSelectedProvider((cfg.llmprovider as LLMProvider) || "Azure");
    }
    setFormProjectName(cfg.projectname);
    setFormApiKey(cfg.apikey);
    setFormEndpoint(cfg.endpoint);
    setFormDeploymentName(cfg.deploymentname);
    setFormModelName(cfg.modelname);
    setFormApiVersion(cfg.apiversion);
  };

  // App choices: the loaded list, plus apps already used by saved rows and the
  // app being edited, so a row's app can always be shown and kept.
  const appOptions = useMemo(() => {
    const out: { appCode: string; applicationName: string }[] = [];
    const seen = new Set<string>();
    const add = (code: any, name?: any) => {
      const c = String(code ?? "").trim();
      if (!c || seen.has(c.toLowerCase())) return;
      seen.add(c.toLowerCase());
      out.push({ appCode: c, applicationName: String(name || c) });
    };
    apps.forEach((a) => add(a.appCode, a.applicationName));
    configs.forEach((c) => add(c.appcode));
    add(selectedApp);
    return out;
  }, [apps, configs, selectedApp]);

  const isEmbedding = selectedConfigType === "Embedding";
  // The provider column holds the LLM provider or the embedding provider,
  // depending on the config type being saved.
  const activeProvider: string = isEmbedding ? selectedEmbeddingProvider : selectedProvider;
  const isAzure = activeProvider === "Azure";
  const isVertex = !isEmbedding && activeProvider === "Vertex";
  const apiKeyLabel = isVertex ? "Service Account Credentials" : "API Key";
  const modelNamePlaceholder = isEmbedding
    ? isAzure ? "e.g. text-embedding-ada-002" : "e.g. gemini-embedding-001"
    : "Enter model name";

  // Each customer + organisation + app + project can have one LLM
  // configuration and one Embedding configuration per embedding model (so
  // knowledge bases built with Azure or Gemini embeddings both work). The
  // saved row that clashes with this one, if any.
  const norm = (v: string) => (v || "").trim().toLowerCase();
  const existingOfType =
    selectedApp && formProjectName.trim()
      ? configs.find(
          (c) =>
            c.id !== editingId &&
            c.configtype === selectedConfigType &&
            norm(c.custcode) === norm(selectedCustomer) &&
            norm(c.orgcode) === norm(selectedOrganization) &&
            norm(c.appcode) === norm(selectedApp) &&
            norm(c.projectname) === norm(formProjectName) &&
            (selectedConfigType !== "Embedding" || norm(c.modelname) === norm(formModelName))
        )
      : undefined;

  const saveConfiguration = async () => {
    if (!selectedApp) {
      toast({
        title: "Missing selection",
        description: "Select an App to continue. Customer and Organization are optional: leave them empty to save the default configuration.",
        variant: "destructive",
      });
      return;
    }
    if (!formProjectName.trim()) {
      toast({ title: "Project Name is required", description: "Enter a project name for this configuration.", variant: "destructive" });
      return;
    }
    if (!formApiKey.trim()) {
      toast({
        title: `${apiKeyLabel} is required`,
        description: isVertex
          ? "Enter the Vertex AI service-account credentials and configuration."
          : "Enter the API key for this provider.",
        variant: "destructive",
      });
      return;
    }
    if (isAzure && (!formEndpoint.trim() || !formDeploymentName.trim())) {
      toast({ title: "Missing Azure fields", description: "Endpoint and Deployment Name are required for Azure.", variant: "destructive" });
      return;
    }
    if (isEmbedding && !formModelName.trim()) {
      toast({
        title: "Model Name is required",
        description: "Enter the embedding model name your knowledge bases use (e.g. text-embedding-ada-002).",
        variant: "destructive",
      });
      return;
    }
    // A Gemini LLM has no deployment: its Model Name is the model every service calls.
    if (!isEmbedding && activeProvider === "Gemini" && !formModelName.trim()) {
      toast({
        title: "Model Name is required",
        description: "Enter the Gemini model name to use (for example gemini-3-flash-preview).",
        variant: "destructive",
      });
      return;
    }
    if (isEmbedding && isAzure && !formApiVersion.trim()) {
      toast({ title: "API Version is required", description: "Azure embeddings need an API version (e.g. 2023-05-15).", variant: "destructive" });
      return;
    }
    if (existingOfType) {
      toast({
        title: `${selectedConfigType} configuration already exists`,
        description: isEmbedding
          ? `This app and project already have an Embedding configuration for model ${existingOfType.modelname}. Edit that one instead.`
          : `This app and project already use a ${existingOfType.llmprovider} ${selectedConfigType} configuration. Edit that one instead.`,
        variant: "destructive",
      });
      return;
    }

    const isAdd = editingId === null || editingId === NEW_DRAFT_ID;
    setFormSaving(true);
    try {
      const token = await getKbAuthToken();
      const payload = {
        id: isAdd ? 0 : editingId,
        custcode: selectedCustomer,
        orgcode: selectedOrganization,
        appcode: selectedApp,
        configtype: selectedConfigType,
        llmprovider: activeProvider,
        projectname: formProjectName.trim(),
        // Vertex has a single free-form field (formApiKey) holding its service-account
        // credentials and config together, so the other provider-specific columns stay blank.
        apikey: encryptApiKey(formApiKey.trim()),
        endpoint: isAzure ? formEndpoint.trim() : "",
        deploymentname: isAzure ? formDeploymentName.trim() : "",
        modelname: isVertex ? "" : formModelName.trim(),
        apiversion: isAzure ? formApiVersion.trim() : "",
        usercode: getUserCode(),
        auth_token: token,
      };

      // Single upsert endpoint: id 0 (isAdd) creates a row, an existing id updates it.
      const res = await fetch(API_ENDPOINTS.SAVE_LLM_CONFIGURATION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      assertOk(res, json);

      toast({
        title: isAdd ? "Configuration saved" : "Configuration updated",
        description: `${activeProvider} ${selectedConfigType} configuration was saved successfully.`,
      });
      resetForm();
      await fetchConfigurations();
    } catch (err: any) {
      toast({ title: "Could not save configuration", description: err?.message || "Failed to save LLM configuration.", variant: "destructive" });
    } finally {
      setFormSaving(false);
    }
  };

  const deleteConfiguration = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const token = await getKbAuthToken();
      const res = await fetch(API_ENDPOINTS.DELETE_LLM_CONFIGURATION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingDelete.id, auth_token: token }),
      });
      const json = await res.json().catch(() => ({}));
      assertOk(res, json);

      toast({ title: "Configuration deleted", description: `The ${pendingDelete.configtype} configuration was removed.` });
      if (editingId === pendingDelete.id) resetForm();
      setPendingDelete(null);
      await fetchConfigurations();
    } catch (err: any) {
      toast({ title: "Could not delete configuration", description: err?.message || "Failed to delete LLM configuration.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (!accessChecked) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-background to-muted/20 overflow-hidden">
      <div className="hidden md:block w-64 flex-shrink-0">
        <SuperAdminSidebar />
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SuperAdminSidebar onNavigate={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-border/20 bg-white/70 backdrop-blur-xl px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <KeyRound className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">LLM Configuration</h1>
          </div>
          <ProfileDropdown />
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <Card>
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Customer</label>
                  <Select
                    value={selectedCustomer || NONE}
                    onValueChange={(v) => setSelectedCustomer(v === NONE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={DEFAULT_CUSTOMER_LABEL} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{DEFAULT_CUSTOMER_LABEL}</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.customercode} value={String(c.customercode)}>
                          {c.customername}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Organization</label>
                  <Select
                    value={selectedOrganization || NONE}
                    onValueChange={(v) => setSelectedOrganization(v === NONE ? "" : v)}
                    disabled={!selectedCustomer}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={DEFAULT_ORG_LABEL} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{DEFAULT_ORG_LABEL}</SelectItem>
                      {organizations.map((o) => (
                        <SelectItem key={o.organizationcode} value={String(o.organizationcode)}>
                          {o.organizationname}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">App</label>
                  <Select value={selectedApp} onValueChange={setSelectedApp}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select app" />
                    </SelectTrigger>
                    <SelectContent>
                      {appOptions.map((a) => (
                        <SelectItem key={a.appCode} value={a.appCode}>
                          {a.applicationName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Config Type</label>
                  <Select value={selectedConfigType} onValueChange={(v) => setSelectedConfigType(v as ConfigType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select config type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONFIG_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isEmbedding ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Embedding Provider</label>
                    <Select
                      value={selectedEmbeddingProvider}
                      onValueChange={(v) => setSelectedEmbeddingProvider(v as EmbeddingProvider)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select embedding provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {EMBEDDING_PROVIDERS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">LLM Provider</label>
                    <Select value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as LLMProvider)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {LLM_PROVIDERS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border/20">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Project Name</label>
                  <Input
                    placeholder="Enter project name"
                    value={formProjectName}
                    onChange={(e) => setFormProjectName(e.target.value)}
                  />
                </div>

                {isVertex ? (
                  <div className="space-y-1.5 md:col-span-3">
                    <label className="text-sm font-medium">{apiKeyLabel}</label>
                    <Textarea
                      placeholder="Enter everything Vertex AI needs: service-account JSON credentials, project id, location and model name"
                      value={formApiKey}
                      onChange={(e) => setFormApiKey(e.target.value)}
                      className="font-mono text-xs h-28"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{apiKeyLabel}</label>
                    <Input
                      type="password"
                      placeholder="Enter API key"
                      value={formApiKey}
                      onChange={(e) => setFormApiKey(e.target.value)}
                    />
                  </div>
                )}

                {isAzure && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Endpoint</label>
                      <Input
                        placeholder="https://your-resource.openai.azure.com/"
                        value={formEndpoint}
                        onChange={(e) => setFormEndpoint(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Deployment Name</label>
                      <Input
                        placeholder="Enter deployment name"
                        value={formDeploymentName}
                        onChange={(e) => setFormDeploymentName(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {!isVertex && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{isEmbedding ? "Embedding Model Name" : "Model Name"}</label>
                    <Input
                      placeholder={modelNamePlaceholder}
                      value={formModelName}
                      onChange={(e) => setFormModelName(e.target.value)}
                    />
                    {isEmbedding && (
                      <p className="text-xs text-muted-foreground">
                        Must match the embedding model your knowledge bases were built with.
                      </p>
                    )}
                  </div>
                )}

                {isAzure && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">API Version</label>
                    <Input
                      placeholder={isEmbedding ? "e.g. 2023-05-15" : "e.g. 2024-06-01"}
                      value={formApiVersion}
                      onChange={(e) => setFormApiVersion(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {existingOfType && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <span>
                    {isEmbedding
                      ? `This app and project already have an Embedding configuration for model ${existingOfType.modelname}. Each embedding model can be saved once.`
                      : `This app and project already have a ${existingOfType.llmprovider} LLM configuration. Only one LLM configuration is allowed.`}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => openEdit(existingOfType)}>
                    Edit existing
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button onClick={saveConfiguration} disabled={formSaving || !!existingOfType}>
                  {formSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {editingId !== null ? "Update Configuration" : "Save Configuration"}
                </Button>
                {editingId !== null && (
                  <Button variant="ghost" onClick={resetForm}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 md:p-6">
              {error && <p className="text-sm text-destructive mb-4">{error}</p>}
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project Name</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>App</TableHead>
                      <TableHead>Config Type</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>API Key</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No LLM configurations saved yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      configs.map((cfg) => (
                        <TableRow key={cfg.id}>
                          <TableCell>{cfg.projectname}</TableCell>
                          <TableCell>{cfg.custcode || <span className="text-muted-foreground">All (default)</span>}</TableCell>
                          <TableCell>{cfg.orgcode || <span className="text-muted-foreground">All (default)</span>}</TableCell>
                          <TableCell>{cfg.appcode}</TableCell>
                          <TableCell>{cfg.configtype}</TableCell>
                          <TableCell>{cfg.llmprovider}</TableCell>
                          <TableCell className="font-mono text-xs">{maskKey(cfg.apikey)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(cfg)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setPendingDelete(cfg)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.configtype ?? "LLM"} Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the {pendingDelete?.llmprovider} {pendingDelete?.configtype} configuration for this app. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteConfiguration} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
