import { useState, useEffect, useRef, useCallback } from "react";
import { withCustOrgCodes } from '@/utils/custOrgCodes';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Search, FileText, Edit, Eye, MessageSquare, Trash2, ArrowLeft, BookOpen, Plus, Menu, GraduationCap, Library, HelpCircle, ScrollText, RefreshCw, Send, Bot, User, X, Save, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AppSidebar } from "@/components/AppSidebar";
import { SuperAdminSidebar } from "@/components/SuperAdminSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import BackToTop from "@/components/BackToTop";
import { API_ENDPOINTS } from "../config";
import config from "../config";

const KnowledgeBase = () => {
  // --- KB Name Availability state ---
  const [kbNameInput, setKbNameInput] = useState("");
  const [kbNameCheckStatus, setKbNameCheckStatus] = useState("unknown"); // "unknown", "checking", "exists", "not_exists", "error"
  const [kbNameCheckMsg, setKbNameCheckMsg] = useState("");
  const [kbNameCheckTimer, setKbNameCheckTimer] = useState<NodeJS.Timeout | null>(null);
  // Guideline delete dialog and pending guideline state
  const [guidelinePendingDelete, setGuidelinePendingDelete] = useState(null);
  const [showGuidelineDeleteDialog, setShowGuidelineDeleteDialog] = useState(false);
  // Confirmation dialog state for removing previously uploaded file
  const [showPrevFileDeleteDialog, setShowPrevFileDeleteDialog] = useState(false);

  const [studyLoBookOpen, setStudyLoBookOpen] = useState(false);
  const [studyLoBookSearch, setStudyLoBookSearch] = useState("");
  const studyLoBookInputRef = useRef<HTMLInputElement | null>(null);
  const isSSO = sessionStorage.getItem('isSSO') === 'true';
  const handleBackNavigation = () => {
    let customerCode = selectedCustomerCode;
    let orgCode = selectedOrganization;
    let appCode = selectedApp;
    if (!customerCode && (kbDetails as any)?.customercode) customerCode = String((kbDetails as any).customercode || '');
    if (!orgCode && (kbDetails as any)?.organizationcode) orgCode = String((kbDetails as any).organizationcode || '');
    if (!appCode && (kbDetails as any)?.appcode) appCode = String((kbDetails as any).appcode || '');
    if (!orgCode) {
      try {
        const uiRaw = sessionStorage.getItem('userInfo');
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || '{}');
          orgCode = ui?.orgCode || ui?.organizationcode || orgCode;
        }
      } catch { }
    }
    const orgName = orgSearchQuery;
    const appName = appSearchQuery;

    clearCreateForm(true);
    if (orgCode) {
      setSelectedOrganization(String(orgCode));
      setOrgSearchQuery(orgName);
    }
    if (appCode && String(appCode) !== '0') {
      setSelectedApp(String(appCode));
      setAppSearchQuery(appName);
    }
    setShowAppDropdown(false);
    setIsCreating(false);
    setIsCreatingStudyLO(false);
    setIsTaggingAgents(false);
    setIsViewingGuidelines(false);
    setSelectedKBForGuidelines(null);
    setIsChatMode(false);
    setSelectedKBForChat(null);
    setSelectedKBForAgents(null);
    clearGuidelinesState();

    if (customerCode) {
      try {
        fetch(buildExistingKbUrl(String(customerCode), String(orgCode || ''), String(appCode || '')))
          .then((r) => r.json())
          .then((d) => setKnowledgeBases(Array.isArray(d?.data) ? d.data : []))
          .catch(() => {});
      } catch { }
    }

    if (customerCode && orgCode) {
      fetchData(String(customerCode), String(orgCode));
    }
  };

  const fetchOrgSpecificGuidelines = async () => {
    try {
      setOrgSpecificGuidelinesLoading(true);
      setGuidelinesError(null);

      let sessCust = '';
      let sessOrg = '';
      try {
        const uiRaw = sessionStorage.getItem('userInfo');
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || '{}');
          sessCust = ui?.customerCode || ui?.custCode || ui?.customercode || '';
          sessOrg = ui?.orgCode || ui?.organizationcode || '';
        }
      } catch { }

      const payload = {
        par_kid: "0",
        par_guidelinetype: "0",
        par_guidelinename: "0",
        par_orgcode: String(sessOrg || '0'),
        par_appcode: "0",
        par_custcode: String(sessCust || '0'),
      };

      const res = await fetch(API_ENDPOINTS.GET_GUIDELINE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const statusStr = String(data?.status || '').toUpperCase();
      const hasArrayData = Array.isArray(data?.data);
      const isOkStatus = statusStr === 'SUCCESS' || /^A\d{3}$/.test(statusStr);
      if (res.ok && hasArrayData && isOkStatus) {
        setOrgSpecificGuidelines(data.data);
      } else if (res.ok && hasArrayData) {
        // Some environments return non-standard status codes but still provide a usable data array.
        setOrgSpecificGuidelines(data.data);
      } else {
        throw new Error(data?.message || data?.error || 'Failed to fetch organization specific guidelines');
      }
    } catch (e: any) {
      setGuidelinesError(e?.message || "Failed to load organization specific guidelines");
      setOrgSpecificGuidelines([]);
    } finally {
      setOrgSpecificGuidelinesLoading(false);
    }
  };
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  // Customers dropdown and knowledge base data
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerCode, setSelectedCustomerCode] = useState("");
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerLocked, setCustomerLocked] = useState(false);
  const [organizationLocked, setOrganizationLocked] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [orgSearchQuery, setOrgSearchQuery] = useState("");
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [appSearchQuery, setAppSearchQuery] = useState("");
  const [showAppDropdown, setShowAppDropdown] = useState(false);

  // Filter customers based on search query and ensure uniqueness
  const filteredCustomers = customers.filter((customer: any) => {
    // Show all when search is empty or when "All" is selected/searched
    if (!customerSearchQuery.trim() || customerSearchQuery.trim().toLowerCase() === "all") return true;
    const searchLower = customerSearchQuery.toLowerCase().trim();
    const nameMatch = customer.customername?.toLowerCase().includes(searchLower);
    const codeMatch = customer.customercode?.toLowerCase().includes(searchLower);
    return nameMatch || codeMatch;
  }).filter((customer: any, index: number, self: any[]) =>
    // Remove duplicates based on customercode
    self.findIndex((c: any) => c.customercode === customer.customercode) === index
  );

  // Get display name for selected customer
  const getSelectedCustomerName = () => {
    if (selectedCustomerCode === "_ALL") return "All";
    const customer = customers.find((c: any) => c.customercode === selectedCustomerCode);
    return customer?.customername || "Select Customer";
  };

  // Handle customer selection
  const handleCustomerSelect = (customerCode: string, customerName: string) => {
    if (customerLocked) return;
    setSelectedCustomerCode(customerCode);
    setCustomerSearchQuery(customerName);
    try {
      sessionStorage.setItem('selectedCustomerCode', customerCode );
      sessionStorage.setItem('selectedCustomerName', customerName );
    } catch { }
    setSearchQuery(""); // Clear search when customer changes
    setShowCustomerDropdown(false);
  };

  // Handle input change
  const handleCustomerInputChange = (value: string) => {
    if (customerLocked) return;
    setCustomerSearchQuery(value);
    setShowCustomerDropdown(true);
  };

  // Handle input focus
  const handleCustomerInputFocus = () => {
    setShowCustomerDropdown(prev => !prev);
    if (!customersLoading && !customerLocked) {
      setCustomerSearchQuery("");
    }
  };

  // Reset organization and app dropdowns when component unmounts
  useEffect(() => {
    return () => {
      // Close dropdown popovers when navigating away
      setShowOrgDropdown(false);
      setShowAppDropdown(false);
      setShowCustomerDropdown(false);
    };
  }, []);

  useEffect(() => {
    try {
      let role = sessionStorage.getItem('userRole') || '';
      if (!role) {
        const uiRaw = sessionStorage.getItem('userInfo');
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || '{}');
          role = ui?.userRole || ui?.role || '';
        }
      }
      setIsSuperAdmin(String(role || '').trim().toLowerCase() === 'superadmin');
    } catch {
      setIsSuperAdmin(false);
    }
  }, []);

  // Prime selectedCustomerCode from session to avoid disabled state while customers load
  useEffect(() => {
    if (selectedCustomerCode) return;
    try {
      const persisted = sessionStorage.getItem('selectedCustomerCode');
      if (persisted) { setSelectedCustomerCode(persisted); return; }
      const uiRaw = sessionStorage.getItem('userInfo');
      if (uiRaw) {
        const ui = JSON.parse(uiRaw || '{}');
        const code = ui?.customerCode || ui?.customercode || '';
        if (code) setSelectedCustomerCode(code);
      }
    } catch { }
  }, [selectedCustomerCode]);

  const handleOrgInputChange = (value: string) => {
    setOrgSearchQuery(value);
    setShowOrgDropdown(true);
  };

  const handleOrgInputFocus = () => {
    setShowOrgDropdown(prev => !prev);
    if (!organizationLoading && selectedCustomerCode && selectedCustomerCode !== '_ALL') {
      setOrgSearchQuery("");
      if (organizationOptions.length === 0) {
        fetchOrganizationData();
      }
    }
  };

  const handleOrgSelect = (orgCode: string, orgName: string) => {
    setSelectedOrganization(orgCode);
    setOrgSearchQuery(orgName);
    setShowOrgDropdown(false);
    setSelectedApp(null);
    setAppSearchQuery("");
    setShowAppDropdown(false);
  };

  const handleAppInputChange = (value: string) => {
    setAppSearchQuery(value);
    setShowAppDropdown(true);
  };

  const handleAppInputFocus = () => {
    const willOpen = !showAppDropdown;
    setShowAppDropdown(willOpen);
    if (
      willOpen &&
      !appsLoading &&
      selectedCustomerCode &&
      selectedCustomerCode !== '_ALL' &&
      selectedOrganization
    ) {
      setAppSearchQuery("");
      fetchAppsData();
    }
  };

  const handleAppSelect = (appCode: string, appName: string) => {
    setSelectedApp(appCode);
    setAppSearchQuery(appName);
    setShowAppDropdown(false);
  };

  const buildExistingKbUrl = (custCode: string, orgCode?: string | null, appCode?: string | null) => {
    const parCust = custCode === '_ALL' ? '0' : String(custCode || '0');
    const parOrg = orgCode ? String(orgCode) : '0';
    const parApp = appCode ? String(appCode) : '0';
    const params = new URLSearchParams({
      par_custcode: parCust,
      par_orgcode: parOrg,
      par_appcode: parApp,
book_id: isSSO ? String(sessionStorage.getItem('book_id') || sessionStorage.getItem('ssoBookId') || '') : String(sessionStorage.getItem('programCode') || '')
    });
    return `${API_ENDPOINTS.GET_EXISTING_KB}?${params.toString()}`;
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.customer-dropdown-container')) {
        setShowCustomerDropdown(false);
      }
      if (!target.closest('.org-dropdown-container')) {
        setShowOrgDropdown(false);
      }
      if (!target.closest('.app-dropdown-container')) {
        setShowAppDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [typeFilter, setTypeFilter] = useState("All");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingGuideline, setIsCreatingGuideline] = useState(false);
  const [guidelineCreationType, setGuidelineCreationType] = useState<'new' | 'existing' | 'org_specific'>('new');
  const [existingGuidelines, setExistingGuidelines] = useState<any[]>([]);
  const [existingGuidelinesLoading, setExistingGuidelinesLoading] = useState(false);
  const [selectedExistingGuidelines, setSelectedExistingGuidelines] = useState<Record<string, boolean>>({});
  const [orgSpecificGuidelines, setOrgSpecificGuidelines] = useState<any[]>([]);
  const [orgSpecificGuidelinesLoading, setOrgSpecificGuidelinesLoading] = useState(false);
  const [selectedOrgSpecificGuidelines, setSelectedOrgSpecificGuidelines] = useState<Record<string, boolean>>({});
  const [guidelinesError, setGuidelinesError] = useState<string | null>(null);
  const [previewGuideline, setPreviewGuideline] = useState<any | null>(null);

  // ---- Create Study LO State additions from abc.tsx ----
  const [isCreatingStudyLO, setIsCreatingStudyLO] = useState(false);
  const [booksOptions, setBooksOptions] = useState<{ value: string; label: string; bookId?: number }[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);

  const [selectedBook, setSelectedBook] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

  // Org/app selects used in Study LO form (reuses some states from existing create form)
  // -- organizationOptions, selectedOrganization, organizationLoading, appsOptions, selectedApp, appsLoading already exist above --

  // Agent config states for Study LO
  const [agentConfig, setAgentConfig] = useState<any[]>([]);
  const [agentConfigLoading, setAgentConfigLoading] = useState(false);
  const [agentConfigError, setAgentConfigError] = useState<string | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<any[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Record<string, boolean>>({});
  const [agentPriorities, setAgentPriorities] = useState<Record<string, number>>({});
  // Study LO upload/preview states
  const [studyLODocuments, setStudyLODocuments] = useState<File[]>([]);
  const [studyLOPreview, setStudyLOPreview] = useState<any[]>([]);
  // Drag and drop state for Study LO
  const [isDraggingStudyLO, setIsDraggingStudyLO] = useState(false);
  // Chapter & LO details table
  const [chapterLODetails, setChapterLODetails] = useState<any[]>([]);
  const [chapterLOLoading, setChapterLOLoading] = useState(false);
  const [chapterLOError, setChapterLOError] = useState<string | null>(null);
  // Delete/Editing dialogs
  const [showChapterLODeleteDialog, setShowChapterLODeleteDialog] = useState(false);
  const [pendingChapterLODelete, setPendingChapterLODelete] = useState<any>(null);
  const [chapterLODeleteLoading, setChapterLODeleteLoading] = useState(false);
  const [showChapterLOSuccessDialog, setShowChapterLOSuccessDialog] = useState(false);
  const [chapterLODeleteType, setChapterLODeleteType] = useState<'row' | 'all' | null>(null);
  const [editingChapterLOIndex, setEditingChapterLOIndex] = useState<number | null>(null);
  const [editingChapterLOBackup, setEditingChapterLOBackup] = useState<any | null>(null);
  const [isAddingNewChapterLO, setIsAddingNewChapterLO] = useState(false);
  // ---- End Create Study LO State additions ----



  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbError, setKbError] = useState(null);

  const [levelType, setLevelType] = useState<"book" | "study">("book");
  const [isViewingGuidelines, setIsViewingGuidelines] = useState(false);
  const [selectedKBForGuidelines, setSelectedKBForGuidelines] = useState<{ id: number; name: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingGuideline, setEditingGuideline] = useState<{ name: string; type: string; subtype?: string } | null>(null);
  const [isChatMode, setIsChatMode] = useState(false);
  const [isTaggingAgents, setIsTaggingAgents] = useState(false);
  const [selectedKBForAgents, setSelectedKBForAgents] = useState<{
    id: number;
    name: string;
    bookName: string;
    customercode?: string;
    organizationcode?: string;
    appcode?: string;
  } | null>(null);
  const [selectedKBForChat, setSelectedKBForChat] = useState<{ id: number; name: string; bookName: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("GPT-4o");
  // Chat message send loader
  const [chatLoading, setChatLoading] = useState(false);

  // Chat-specific KB and Customer details (payload safety)
  const [chatKbDetails, setChatKbDetails] = useState<any>(null);
  const [chatCustomerDetails, setChatCustomerDetails] = useState<any>(null);
  const [chatDetailsLoading, setChatDetailsLoading] = useState(false);
  const [chatDetailsError, setChatDetailsError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [kbToDelete, setKbToDelete] = useState<{
    id: number;
    name: string;
    bookName: string;
    customercode?: string;
    organizationcode?: string;
    sourcename?: string;
    bookdetails_id?: number | null;
  } | null>(null);
  const [deleteKbLoading, setDeleteKbLoading] = useState(false);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [coverImage, setCoverImage] = useState<File | null>(null);

  // Drag and drop states
  const [isDraggingDocument, setIsDraggingDocument] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  // State for Create form (wired to API flow from abc.tsx)
  const [bookName, setBookName] = useState<string>("");
  const [bookNameFormatError, setBookNameFormatError] = useState<string | null>(null);
  const [kbNameFormatError, setKbNameFormatError] = useState<string | null>(null);
  const [studyLevel, setStudyLevel] = useState<string>("");
  const [bookLovOptions, setBookLovOptions] = useState<{ value: string; label: string; bookid?: number }[]>([]);
  const [bookLovLoading, setBookLovLoading] = useState(false);
  const [bookLovFetched, setBookLovFetched] = useState(false);
  const [studyLovOptions, setStudyLovOptions] = useState<{ value: string; label: string }[]>([]);
  const studyCacheRef = useRef<Record<number, { value: string; label: string }[]>>({});
  // selectedBookId/setSelectedBookId already declared at top (remove duplicate)
  const [studyLovLoading, setStudyLovLoading] = useState(false);
  const [organizationOptions, setOrganizationOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [appsOptions, setAppsOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  // Tracks an in-flight get-apps call. A ref, not the appsLoading state, so the
  // guard reads the current value instead of the one captured when the callback
  // was last created.
  const appsFetchInFlight = useRef(false);

  const fetchData = async (customerCode: string, orgCode: string) => {
    if (!customerCode || !orgCode) return;
    setAppsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.GET_APPS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ par_custcode: customerCode, par_orgcode: orgCode }),
      });
      const data = await response.json();
      if (Array.isArray(data.data)) {
        const options = data.data.map((app: any) => ({
          value: app.appcode,
          label: app.applicationname || app.applicationName || app.appname || app.name || app.appcode,
        }));
        setAppsOptions(options);
      } else {
        console.error('[KnowledgeBase] get-apps returned no app list:', data);
        setAppsOptions([]);
      }
    } catch (error) {
      console.error('[KnowledgeBase] Failed to fetch apps:', error);
      setAppsOptions([]);
    } finally {
      setAppsLoading(false);
    }
  };
  type Option = { value: string; label: string; disabled?: boolean };
  const [retrievalOptions, setRetrievalOptions] = useState<Option[]>([]);
  const [chunkSizeOptions, setChunkSizeOptions] = useState<Option[]>([]);
  const [overlapOptions, setOverlapOptions] = useState<Option[]>([]);
  const [chunkingOptions, setChunkingOptions] = useState<Option[]>([]);
  const [dbTypeOptions, setDbTypeOptions] = useState<Option[]>([]);
  const [embeddingOptions, setEmbeddingOptions] = useState<Option[]>([]);
  const [metaLoading, setMetaLoading] = useState<Record<number, boolean>>({});
  const [metaError, setMetaError] = useState<Record<number, string | null>>({});
  const [searchType, setSearchType] = useState<'mmr' | 'similarity' | 'hybrid'>("hybrid");
  const [rerankK, setRerankK] = useState<number>(5);
  const [rerankKInput, setRerankKInput] = useState<string>('5');
  const [chunkSize, setChunkSize] = useState<string>('1000');
  const [overlap, setOverlap] = useState<string>('20');
  const [chunkingStrategy, setChunkingStrategy] = useState<string>('recursive');
  const [embeddingModel, setEmbeddingModel] = useState<string>('text-embedding-ada-002');
  const [vectorDb, setVectorDb] = useState<string>('faiss');

  useEffect(() => {
    let cancelled = false;
    async function fetchAgents() {
      if (!selectedApp) {
        setAvailableAgents([]);
        return;
      }
      setAgentsLoading(true);
      setAgentsError(null);
      try {
        const res = await fetch(API_ENDPOINTS.GET_AGENTS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || 'Failed to fetch agents');
        const arr = Array.isArray(json?.data) ? json.data : [];
        if (!cancelled) setAvailableAgents(arr);
      } catch (e: any) {
        if (!cancelled) {
          setAgentsError(e?.message || 'Failed to load agents');
          setAvailableAgents([]);
        }
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    }
    fetchAgents();
    return () => { cancelled = true; };
  }, [selectedApp]);

  // Computed state for filtered embedding options based on retrieval strategy
  const getFilteredEmbeddingOptions = () => {
    if (searchType === 'mmr') {
      // When MMR is selected, disable all-MiniLM-L6-v2
      return embeddingOptions.map(option => ({
        ...option,
        disabled: option.value === 'all-MiniLM-L6-v2'
      }));
    } else if (searchType === 'similarity') {
      // When Similarity is selected, enable only all-MiniLM-L6-v2
      return embeddingOptions.map(option => ({
        ...option,
        disabled: option.value !== 'all-MiniLM-L6-v2'
      }));
    }
    return embeddingOptions;
  };

  // Create flow UI state
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogMessage, setSuccessDialogMessage] = useState('');

  // Lock body scroll when submitting or when success dialog is open
  useEffect(() => {
    // Store original overflow style
    const originalOverflow = document.body.style.overflow;

    const updateOverflow = () => {
      if (createSubmitting || successDialogOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = originalOverflow || '';
      }
    };

    updateOverflow();

    // Cleanup function to restore original scroll on unmount
    return () => {
      document.body.style.overflow = originalOverflow || '';
    };
  }, [createSubmitting, successDialogOpen]);

  // Additional safety net: ensure scroll is restored if component unmounts or states change unexpectedly
  useEffect(() => {
    const handleScrollLockChange = () => {
      if (!createSubmitting && !successDialogOpen) {
        document.body.style.overflow = '';
      }
    };

    // Add a small delay to ensure all state updates are processed
    const timeoutId = setTimeout(handleScrollLockChange, 100);

    return () => clearTimeout(timeoutId);
  }, [createSubmitting, successDialogOpen]);

  // Canonicalize DB type for submit parity with abc.tsx
  const getDbTypeCanonical = (input: string): 'faiss' | 'chroma' => {
    const val = String(input || '').toLowerCase().trim();
    if (val.includes('faiss')) return 'faiss';
    if (val.includes('chromadb')) return 'chroma';
    if (val.includes('chroma')) return 'chroma';
    return 'faiss';
  };

  // === Guidelines state/hooks START ===
  const [guidelineType, setGuidelineType] = useState(null); // string | null
  const [guidelineSubType, setGuidelineSubType] = useState(null); // string | null
  const [guidelineName, setGuidelineName] = useState(''); // string
  const [guidelineNameError, setGuidelineNameError] = useState(''); // string
  const [guidelinesText, setGuidelinesText] = useState(''); // string

  const validateGuidelineName = (name: string) => {
    if (!name) {
      setGuidelineNameError('');
      return;
    }
    const allowedChars = /^[a-zA-Z0-9._-]*$/;
    const startEnd = /^[a-zA-Z0-9].*[a-zA-Z0-9]$/;
    if (!allowedChars.test(name)) {
      setGuidelineNameError('Only [a-zA-Z0-9._-] allowed.');
    } else if (!startEnd.test(name)) {
      setGuidelineNameError('Must start and end with [a-zA-Z0-9].');
    } else {
      setGuidelineNameError('');
    }
  };

  // Check guideline name availability using backend API
  const checkGuidelineAvailability = async (name: string, type: string | null) => {
    // Do not call API if name is empty
    if (!name.trim()) {
      return '';
    }

    // Decide payload based on whether this is a General Guideline (id = 0) or KB-specific
    const isGeneralGuideline = kbDetails.id === 0;

    const payload = isGeneralGuideline
      ? {
          par_custcode: "",
          par_orgcode: "",
          par_appcode: "",
          par_guidelinename: name.trim(),
          par_guidelinetype: type || "",
          par_type: 0,
          par_kbid: "0",
        }
      : {
          par_custcode: String(kbDetails.customercode || ''),
          par_orgcode: String(kbDetails.organizationcode || ''),
          par_appcode: String(kbDetails.appcode || ''),
          par_guidelinename: name.trim(),
          par_guidelinetype: type || "",
          par_type: 1,
          par_kbid: String(kbDetails.id || ''),
        };

    const res = await fetch(API_ENDPOINTS.CHECK_GUIDELINE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({} as any));
    if (!res.ok || data.status !== 'success') {
      throw new Error(data.message || data.error || 'Failed to check guideline name');
    }

    // Backend returns par_statuscode: "NE001" (not existing) or "S001" (already exists)
    return String(data.par_statuscode || '');
  };

  const [guidelineFile, setGuidelineFile] = useState(null); // File | null
  const [previouslyUploadedFileName, setPreviouslyUploadedFileName] = useState(null); // string | null
  const [wasPreviouslyUploadedFileRemoved, setWasPreviouslyUploadedFileRemoved] = useState(false); // boolean - track if user removed previously uploaded file
  const [allGuidelines, setAllGuidelines] = useState([]); // array of guideline objects
  const [guidelinesLoading, setGuidelinesLoading] = useState(false); // boolean
  const [isGuidelineEditing, setIsGuidelineEditing] = useState(false); // boolean
  const [editingGuidelineId, setEditingGuidelineId] = useState(null); // string | null
  const [isDraggingOver, setIsDraggingOver] = useState(false); // boolean for drag-and-drop UI
  const [guidelineScope, setGuidelineScope] = useState<'general' | 'org_specific'>('general');
  // (Removed duplicate declaration of showGuidelineDeleteDialog and guidelinePendingDelete)
  const MAX_GUIDELINE_FILE_BYTES = 5 * 1024 * 1024; // 5MB

  const handleGuidelineFileChange = (event: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList | null } }) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      return;
    }

    const allowedTypes = ['text/plain', 'application/pdf'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !(fileExtension === 'txt' || fileExtension === 'pdf')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a .txt or .pdf file.",
        variant: "destructive"
      });
      return;
    }

    if (file.size > MAX_GUIDELINE_FILE_BYTES) {
      toast({
        title: "File Too Large",
        description: `The selected file exceeds the 5MB limit. Please choose a smaller file.`,
        variant: "destructive"
      });
      return;
    }

    setGuidelineFile(file);
    setPreviouslyUploadedFileName(null);
    setWasPreviouslyUploadedFileRemoved(false);
  };
  // Guidelines-related KB details for API payloads
  const [kbDetails, setKbDetails] = useState({
    id: null,
    organizationcode: null,
    knowladgebasename: null,
    customercode: null,
    appcode: null,
    dbtype: 'faiss',
  });

  // Function to clear all guidelines state
  const clearGuidelinesState = () => {
    setGuidelineType(null);
    setGuidelineSubType(null);
    setGuidelineName('');
    setGuidelinesText('');
    setGuidelineFile(null);
    setPreviouslyUploadedFileName(null);
    setGuidelineScope('general');
    setAllGuidelines([]);
    setGuidelinesLoading(false);
    setGuidelinesError(null);
    setIsGuidelineEditing(false);
    setEditingGuidelineId(null);
    setKbDetails({
      id: null,
      organizationcode: null,
      knowladgebasename: null,
      customercode: null,
      appcode: null,
      dbtype: 'faiss',
    });
  };
  // === Guidelines state/hooks END ===

  // --- Debounced KB QA Check (abc pattern) ---
  useEffect(() => {
    if (!isCreating || isCreatingStudyLO || isViewingGuidelines || isChatMode) return;
    if (
      kbNameInput.trim().length < 3 ||
      !!kbNameFormatError ||
      !selectedCustomerCode ||
      !selectedOrganization
    ) {
      setKbNameCheckStatus("unknown");
      setKbNameCheckMsg("");
      if (kbNameCheckTimer) clearTimeout(kbNameCheckTimer);
      return;
    }
    setKbNameCheckStatus("checking");
    setKbNameCheckMsg("");
    if (kbNameCheckTimer) clearTimeout(kbNameCheckTimer);
    const handle = setTimeout(async () => {
      try {
        const url = `${API_ENDPOINTS.CHECK_KB}?custcode=${encodeURIComponent(selectedCustomerCode)}&orgcode=${encodeURIComponent(selectedOrganization)}&kbname=${encodeURIComponent(kbNameInput.trim())}`;
        const resp = await fetch(url);
        const json = await resp.json().catch(() => ({}));
        const status = String(json?.status || '').toUpperCase();
        if (status.startsWith('E001')) {
          setKbNameCheckStatus("exists");
          setKbNameCheckMsg('A knowledge base with this name already exists.');
        } else if (status.startsWith('NE001')) {
          setKbNameCheckStatus("not_exists");
          setKbNameCheckMsg('Name is available.');
        } else {
          setKbNameCheckStatus("unknown");
          setKbNameCheckMsg('');
        }
      } catch (e) {
        setKbNameCheckStatus('error');
        setKbNameCheckMsg('Failed to check KB availability.');
      }
    }, 400);
    setKbNameCheckTimer(handle as any);
    return () => clearTimeout(handle);
    // eslint-disable-next-line
  }, [kbNameInput, kbNameFormatError, selectedCustomerCode, selectedOrganization, isCreating, isCreatingStudyLO, isViewingGuidelines, isChatMode]);

  // Fetch customers on mount
  useEffect(() => {
    async function fetchCustomers() {
      setCustomersLoading(true);
      setCustomersError(null);
      try {
        const res = await fetch(API_ENDPOINTS.GET_CUSTOMER_DATA_SLASH);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        const arr = Array.isArray(data.data) ? data.data : [];
        setCustomers(arr);
        const isLoggedIn = (sessionStorage.getItem('isLogin') === 'true')
          || (sessionStorage.getItem('Isloggedin') === 'true')
          || !!sessionStorage.getItem('userInfo');

        let userCustomerCode: string | null = sessionStorage.getItem('customerCode');
        if (!userCustomerCode) {
          try {
            const uiRaw = sessionStorage.getItem('userInfo');
            if (uiRaw) {
              const ui = JSON.parse(uiRaw || '{}');
              userCustomerCode = (ui?.customerCode || ui?.customercode || '').toString();
            }
          } catch { /* ignore parse errors */ }
        }

        let role = sessionStorage.getItem('userRole') || '';
        if (!role) {
          try {
            const uiRaw = sessionStorage.getItem('userInfo');
            if (uiRaw) {
              const ui = JSON.parse(uiRaw || '{}');
              role = ui?.userRole || ui?.role || '';
            }
          } catch { }
        }
        const superAdmin = String(role || '').trim().toLowerCase() === 'superadmin';
        const persistedCode = sessionStorage.getItem('selectedCustomerCode') || '';

        if (superAdmin) {
          // Prefer persisted selection if valid; else default to All
          let applied = false;
          if (persistedCode) {
            const pmatch = arr.find((c: any) => String(c?.customercode || '') === persistedCode);
            if (pmatch) {
              setSelectedCustomerCode(pmatch.customercode);
              setCustomerSearchQuery(pmatch.customername || pmatch.customercode);
              applied = true;
            }
          }
          if (!applied) {
            setSelectedCustomerCode('_ALL');
            setCustomerSearchQuery('All');
            try {
              sessionStorage.setItem('selectedCustomerCode', '_ALL');
              sessionStorage.setItem('selectedCustomerName', 'All');
            } catch { }
          }
          setCustomerLocked(false);
        } else if (isLoggedIn && userCustomerCode) {
          const codeNorm = String(userCustomerCode).trim().toLowerCase();
          const match = arr.find((c: any) => String(c?.customercode || '').toLowerCase() === codeNorm);
          if (match) {
            setSelectedCustomerCode(match.customercode);
            setCustomerSearchQuery(match.customername || match.customercode);
            setCustomerLocked(true);
            try {
              sessionStorage.setItem('selectedCustomerCode', match.customercode || '');
              sessionStorage.setItem('selectedCustomerName', match.customername || match.customercode || '');
            } catch { }
          } else if (arr.length > 0) {
            setSelectedCustomerCode(arr[0].customercode);
            setCustomerSearchQuery(arr[0].customername || arr[0].customercode);
            setCustomerLocked(true);
            try {
              sessionStorage.setItem('selectedCustomerCode', arr[0].customercode || '');
              sessionStorage.setItem('selectedCustomerName', arr[0].customername || arr[0].customercode || '');
            } catch { }
          } else {
            setSelectedCustomerCode('');
            setCustomerSearchQuery('');
            setCustomerLocked(false);
          }
        } else {
          // Not logged in or no user code: do not default to All for non-superadmin
          if (arr.length > 0) {
            setSelectedCustomerCode(arr[0].customercode);
            setCustomerSearchQuery(arr[0].customername || arr[0].customercode);
            setCustomerLocked(false);
          } else {
            setSelectedCustomerCode('');
            setCustomerSearchQuery('');
            setCustomerLocked(false);
          }
        }
      } catch (err) {
        setCustomersError(err.message || "Error fetching customers");
        setCustomers([]);
      } finally {
        setCustomersLoading(false);
      }
    }
    fetchCustomers();
  }, []);

  // Fetch KBs when customer/org/app filter changes
  useEffect(() => {
    if (!selectedCustomerCode) {
      setKnowledgeBases([]);
      return;
    }
    // For specific customers, wait until organization is selected/resolved.
    // This prevents initial fetches with par_orgcode=0 before the org is auto-selected.
    if (selectedCustomerCode !== '_ALL' && !selectedOrganization) {
      // setKnowledgeBases([]);
      return;
    }
    async function fetchKBs() {
      setKbLoading(true);
      setKbError(null);
      try {
        const url = buildExistingKbUrl(selectedCustomerCode, selectedOrganization, selectedApp);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        const arr = Array.isArray(data.data) ? data.data : [];
        setKnowledgeBases(arr);
      } catch (err) {
        setKbError(err.message || "Error fetching knowledge bases");
        setKnowledgeBases([]);
      } finally {
        setKbLoading(false);
      }
    }
    fetchKBs();
  }, [selectedCustomerCode, selectedOrganization, selectedApp]);

  // Refreshes guidelines from API
  const handleRefreshGuidelines = async () => {
    setIsRefreshing(true);
    setGuidelinesError(null);
    try {
      if (!kbDetails.id && kbDetails.id !== 0) {
        throw new Error("Knowledge base not loaded");
      }

      // Use different endpoint and payload for general guidelines vs specific KB guidelines
      const isGeneralGuideline = kbDetails.id === 0;
      const payload = {
        par_kid: isGeneralGuideline ? "0" : String(kbDetails.id),
        par_guidelinetype: "0",
        par_guidelinename: "0",
        par_orgcode: "0",
        par_appcode: "0",
        par_custcode: "0",
        book_id:''
      };

      const endpoint = isGeneralGuideline ? API_ENDPOINTS.GET_GENERAL_GUIDELINES : API_ENDPOINTS.GET_GUIDELINE;

      const guidelineRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const guidelineJson = await guidelineRes.json().catch(() => ({}));
      if (!guidelineRes.ok) {
        throw new Error(guidelineJson?.message || "Failed to fetch guidelines list");
      }
      setAllGuidelines(Array.isArray(guidelineJson?.data) ? guidelineJson.data : []);
    } catch (error) {
      setGuidelinesError(error?.message || "Failed to load guidelines");
      setAllGuidelines([]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Existing guidelines fetch for 'Creation of Guideline' = Existing
  // Handle tagging selected guidelines
  const handleTagGuidelines = async () => {
    try {
      if (!selectedKBForGuidelines?.id) {
        toast({
          title: 'Error',
          description: 'No knowledge base selected',
          variant: 'destructive'
        });
        return;
      }

      const selectedMap = guidelineCreationType === 'org_specific' ? selectedOrgSpecificGuidelines : selectedExistingGuidelines;
      const sourceList = guidelineCreationType === 'org_specific' ? orgSpecificGuidelines : existingGuidelines;
      const refreshFn = guidelineCreationType === 'org_specific' ? fetchOrgSpecificGuidelines : fetchExistingGuidelines;

      const selectedGuides = Object.entries(selectedMap)
        .filter(([_, isSelected]) => isSelected)
        .map(([key]) => {
          const guideline = sourceList.find(g => g.guidelinename === key);
          return guideline?.guidelineid || key.split('_').pop(); // Fallback to key part if guidelineid not found
        });

      if (selectedGuides.length === 0) {
        toast({
          title: 'No Guidelines Selected',
          description: 'Please select at least one guideline to tag',
          variant: 'destructive'
        });
        return;
      }

      const payload = {
        par_kbid: selectedKBForGuidelines.id,
        par_guidelineids: selectedGuides.join(',')
      };

      const response = await fetch(API_ENDPOINTS.SAVE_KB_GUIDELINE_MAPPING, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        if (data.procedure_status === 'S001') {
          toast({
            title: 'Success',
            description: 'Guidelines tagged successfully',
            variant: 'default'
          });
        } else if (data.procedure_status === 'F001') {
          toast({
            title: 'Note :',
            description: 'Guidelines are already tagged to the KB, Please select other General Guideline',
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'Success',
            description: 'Guidelines processed successfully',
            variant: 'default'
          });
        }

        // Clear selection after successful tagging
        if (guidelineCreationType === 'org_specific') setSelectedOrgSpecificGuidelines({});
        else setSelectedExistingGuidelines({});

        setPreviewGuideline(null);

        // Refresh the guidelines list
        await refreshFn();

        // Also refresh the KB-specific guideline list so switching back to "New Guideline" shows newly tagged items.
        await handleRefreshGuidelines();
      } else {
        throw new Error(data.message || 'Failed to tag guidelines');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to tag guidelines',
        variant: 'destructive'
      });
    }
  };

  const fetchExistingGuidelines = async () => {
    try {
      setExistingGuidelinesLoading(true);
      setGuidelinesError(null);
      const payload = {
        par_kid: "0",
        par_guidelinetype: "0",
        par_guidelinename: "0",
        par_orgcode: "0",
        par_custcode: "0",
        par_appcode: "0",
        book_id:''
      };
      const res = await fetch(API_ENDPOINTS.GET_GENERAL_GUIDELINES, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success' && Array.isArray(data.data)) {
        setExistingGuidelines(data.data);
        // Also populate allGuidelines for display in "All Guidelines" section
        setAllGuidelines(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch guidelines');
      }
    } catch (e: any) {
      setGuidelinesError(e?.message || "Failed to load existing guidelines");
      setExistingGuidelines([]);
      setAllGuidelines([]);
    } finally {
      setExistingGuidelinesLoading(false);
    }
  };

  useEffect(() => {
    if (!isViewingGuidelines) return;
    // In General Guideline mode (Create New Guideline button sets id = 0), always fetch the general list
    if (selectedKBForGuidelines?.id === 0) {
      fetchExistingGuidelines();
      return;
    }
    // In KB mode, only fetch general guidelines when selecting 'existing'
    if (guidelineCreationType === 'existing') {
      fetchExistingGuidelines();
    }
    if (guidelineCreationType === 'org_specific') {
      fetchOrgSpecificGuidelines();
    }
  }, [isViewingGuidelines, guidelineCreationType, selectedKBForGuidelines]);

  useEffect(() => {
    if (!isViewingGuidelines) {
      setGuidelineCreationType('new');
    }
  }, [isViewingGuidelines]);

  useEffect(() => {
    if (organizationLocked) {
      setShowOrgDropdown(false);
    }
  }, [organizationLocked]);

  // Adapted: Real backend-driven Chat
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !selectedKBForChat || !chatKbDetails || !chatCustomerDetails || chatDetailsLoading || chatDetailsError || chatLoading) return;
    setChatLoading(true);
    // Immediately clear chatbox for better UX
    setChatInput("");

    // Add user message to the state
    setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]);

    // Strictly allow only backend-accepted values for search_type
    let safeSearchType = (chatKbDetails.retrivalstrategy || searchType || "mmr").toLowerCase().trim();
    if (!["similarity", "similarity_score_threshold", "mmr"].includes(safeSearchType)) {
      // Map hybrid/others → default to similarity
      safeSearchType = "similarity";
    }

    const payload = {
      customer: chatCustomerDetails.customercode,
      question: chatInput.trim(),
      k: 5, // Later can expose as config/select
      vector_db: chatKbDetails.dbtype || "faiss",
      embedding_model: chatKbDetails.embeddingmodel || embeddingModel || "text-embedding-ada-002",
      search_type: safeSearchType,
      rerank_k: chatKbDetails.numberofrerankingcandidates || rerankK || 10,
      knowledge_base_name: chatKbDetails.knowladgebasename || chatKbDetails.knowledge_base_name || selectedKBForChat.bookName || selectedKBForChat.name || "",
      llm_model: selectedModel === "GPT-4o" ? "gpt-4o"
        : selectedModel === "GPT-4" ? "gpt-4"
          : selectedModel === "GPT-3.5" ? "gpt-3.5"
            : selectedModel || "gpt-4o"
    };

    try {
      const resp = await fetch(API_ENDPOINTS.ASK_QUESTION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      let assistantText = "";
      if (data.status === "success") {
        if (typeof data.answer === "string" && data.answer.trim().length > 0) {
          assistantText = data.answer.trim();
        } else if (Array.isArray(data.results) && data.results.length > 0) {
          assistantText = `Here are the top ${Math.min(data.results.length, payload.k)} results:\n\n` +
            data.results.slice(0, payload.k).map((d, i) => {
              const metaBits = [];
              if (d.metadata?.source) metaBits.push(`source: ${d.metadata.source}`);
              if (d.metadata?.page) metaBits.push(`page: ${d.metadata.page}`);
              const meta = metaBits.length ? `\n_${metaBits.join(", ")}_` : "";
              return `${i + 1}. ${d.content}${meta}`;
            }).join("\n\n");
        } else {
          assistantText = "No results found.";
        }
      } else {
        assistantText = data.message || "No results found.";
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: assistantText }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Error contacting backend." }]);
    }

    setChatLoading(false);
    // Reset textarea height
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.style.height = 'auto';
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const allowed = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];
      const maxSize = 50 * 1024 * 1024; // 50MB limit

      const validFiles = filesArray.filter(f => {
        const ext = f.name.toLowerCase().split('.').pop() || '';
        const isValidType = allowed.includes(f.type) || ['pdf', 'docx', 'txt'].includes(ext);

        if (!isValidType) {
          toast({
            title: 'Invalid File Type',
            description: `File "${f.name}" is not supported. Please upload only PDF, DOCX, or TXT files.`,
            variant: 'destructive'
          });
          return false;
        }

        if (f.size > maxSize) {
          toast({
            title: 'File Too Large',
            description: `File "${f.name}" exceeds the 50MB limit.`,
            variant: 'destructive'
          });
          return false;
        }

        return true;
      });

      if (validFiles.length > 0) {
        setDocumentFiles(prev => [...prev, ...validFiles]);
      }

      // Clear the input to allow re-selecting the same files if needed
      e.target.value = '';
    }
  };

  // Drag and drop handlers for documents
  const handleDocumentDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingDocument(true);
  };

  const handleDocumentDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingDocument(false);
  };

  const handleDocumentDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingDocument(false);

    const files = Array.from(e.dataTransfer.files);
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    const allowedExtensions = ['pdf', 'docx', 'txt'];

    const validFiles = files.filter(file => {
      const fileExtension = file.name.toLowerCase().split('.').pop() || '';
      const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension);

      if (!isValidType) {
        toast({
          title: 'Invalid File Type',
          description: `File "${file.name}" is not supported. Please upload only PDF, DOCX, or TXT files.`,
          variant: 'destructive'
        });
        return false;
      }

      // Check file size (50MB limit)
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: 'File Too Large',
          description: `File "${file.name}" exceeds the 50MB limit.`,
          variant: 'destructive'
        });
        return false;
      }

      return true;
    });

    if (validFiles.length > 0) {
      setDocumentFiles(prev => [...prev, ...validFiles]);
      toast({
        title: 'Files Uploaded',
        description: `${validFiles.length} file(s) uploaded successfully.`,
      });
    }
  };

  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      const allowedExtensions = ['jpg', 'jpeg', 'png'];
      const fileExtension = file.name.toLowerCase().split('.').pop() || '';

      // Check file type and extension
      if (!allowedTypes.includes(file.type) || !allowedExtensions.includes(fileExtension)) {
        toast({
          title: 'Invalid File Type',
          description: 'Please upload only JPEG or PNG image files.',
          variant: 'destructive'
        });
        // Clear the input
        e.target.value = '';
        return;
      }

      // Check file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast({
          title: 'File Too Large',
          description: 'Please upload an image smaller than 10MB.',
          variant: 'destructive'
        });
        // Clear the input
        e.target.value = '';
        return;
      }

      setCoverImage(file);

      // Clear the input to allow re-selecting the same file if needed
      e.target.value = '';
    }
  };

  // Drag and drop handlers for cover image
  const handleImageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImage(true);
  };

  const handleImageDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImage(false);
  };

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImage(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0]; // Only allow one image file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const allowedExtensions = ['jpg', 'jpeg', 'png'];
    const fileExtension = file.name.toLowerCase().split('.').pop() || '';

    // Check file type and extension
    if (!allowedTypes.includes(file.type) || !allowedExtensions.includes(fileExtension)) {
      toast({
        title: 'Invalid File Type',
        description: `File "${file.name}" is not supported. Please upload only JPEG or PNG image files.`,
        variant: 'destructive'
      });
      return;
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: 'File Too Large',
        description: `File "${file.name}" exceeds the 10MB limit.`,
        variant: 'destructive'
      });
      return;
    }

    setCoverImage(file);
    toast({
      title: 'Image Uploaded',
      description: 'Cover image uploaded successfully.',
    });

    // Also clear the file input to allow re-selecting the same file
    const fileInput = document.getElementById('cover-image-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  // ===== Helpers ported from abc.tsx (adapted) =====
  // Use correct mappings as in abc.tsx to ensure UI states match API codes
  const mapValueById = (id: number, row: any): string => {
    const code: string = String(row?.code || '').toUpperCase();
    const name: string = String(row?.name || '').trim();
    switch (id) {
      case 1: // Retrieval Strategy
        if (code === 'RS_001') return 'hybrid';
        if (code === 'RS_002') return 'similarity';
        if (code === 'RS_003') return 'mmr';
        return name.toLowerCase();
      case 2: // Chunk Size
        {
          const cs = (row?.name || '').match(/\d+/);
          return cs ? cs[0] : '1000';
        }
      case 3: // Overlap Percentage
        {
          const ov = (row?.name || '').match(/\d+/);
          return ov ? ov[0] : '20';
        }
      case 4: // Chunking Strategy
        if (code === 'CS_001') return 'recursive';
        if (code === 'CS_002') return 'paragraph';
        return name.toLowerCase();
      case 5: // Database Type
        if (code === 'DB_001') return 'faiss';
        if (code === 'DB_002') return 'chromadb';
        return name.toLowerCase();
      case 6: // Embedding Model
        if (code === 'EM_001') return 'text-embedding-ada-002';
        if (code === 'EM_002') return 'text-embedding-3-large';
        if (code === 'EM_003') return 'all-MiniLM-L6-v2';
        return name;
      default:
        return String(row?.code || row?.name || '').trim();
    }
  };

  const rowsToOptions = (id: number, rows: any[]): Option[] => {
    const opts: Option[] = rows.map((r: any) => {
      const label = (r?.name && String(r.name).trim()) || (r?.label && String(r.label).trim()) || (r?.code && String(r.code).trim()) || '';
      const value = mapValueById(id, r);
      return label ? { value, label } : { value, label: value };
    });
    const seen = new Set<string>();
    const unique: Option[] = [];
    for (const o of opts) {
      if (!seen.has(o.value)) { seen.add(o.value); unique.push(o); }
    }
    return unique;
  };

  const fetchMetadata = useCallback(async (id: number, setter: (opts: Option[]) => void) => {
    setMetaError(prev => ({ ...prev, [id]: null }));
    setMetaLoading(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`${API_ENDPOINTS.GET_METADATA}/${id}`);
      const json = await res.json();
      const rows = Array.isArray(json?.options) ? json.options : [];
      const options = rowsToOptions(id, rows);
      setter(options);
      if (options.length === 0) {
        setMetaError(prev => ({ ...prev, [id]: 'No options found' }));
      }
    } catch (e) {
      setMetaError(prev => ({ ...prev, [id]: 'Failed to load options' }));
      setter([]);
    } finally {
      setMetaLoading(prev => ({ ...prev, [id]: false }));
    }
  }, []);

  useEffect(() => {
    // Load metadata options once when entering the page
    fetchMetadata(1, setRetrievalOptions);
    fetchMetadata(2, setChunkSizeOptions);
    fetchMetadata(3, setOverlapOptions);
    fetchMetadata(4, setChunkingOptions);
    fetchMetadata(5, setDbTypeOptions);
    fetchMetadata(6, setEmbeddingOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also ensure metadata is loaded/refreshed when opening Create form
  useEffect(() => {
    if (!isCreating) return;
    fetchMetadata(1, setRetrievalOptions);
    fetchMetadata(2, setChunkSizeOptions);
    fetchMetadata(3, setOverlapOptions);
    fetchMetadata(4, setChunkingOptions);
    fetchMetadata(5, setDbTypeOptions);
    fetchMetadata(6, setEmbeddingOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreating]);

  // Normalize selected processing settings to available metadata options
  useEffect(() => {
    if (retrievalOptions.length && !retrievalOptions.some(o => o.value === searchType)) {
      setSearchType((retrievalOptions[0]?.value as 'mmr' | 'similarity' | 'hybrid') || 'hybrid');
    }
  }, [retrievalOptions, searchType]);
  useEffect(() => {
    if (chunkSizeOptions.length && !chunkSizeOptions.some(o => o.value === chunkSize)) {
      setChunkSize(chunkSizeOptions[0]?.value || '1000');
    }
  }, [chunkSizeOptions]);
  useEffect(() => {
    if (overlapOptions.length && !overlapOptions.some(o => o.value === overlap)) {
      setOverlap(overlapOptions[0]?.value || '20');
    }
  }, [overlapOptions]);
  useEffect(() => {
    if (chunkingOptions.length && !chunkingOptions.some(o => o.value === chunkingStrategy)) {
      setChunkingStrategy(chunkingOptions[0]?.value || 'recursive');
    }
  }, [chunkingOptions]);
  useEffect(() => {
    if (dbTypeOptions.length && !dbTypeOptions.some(o => o.value === vectorDb)) {
      setVectorDb(dbTypeOptions[0]?.value || 'faiss');
    }
  }, [dbTypeOptions]);
  useEffect(() => {
    if (embeddingOptions.length && !embeddingOptions.some(o => o.value === embeddingModel)) {
      setEmbeddingModel(embeddingOptions[0]?.value || 'text-embedding-ada-002');
    }
  }, [embeddingOptions]);

  // Auto-switch embedding model when retrieval strategy changes
  useEffect(() => {
    if (searchType === 'similarity') {
      // When switching to Similarity, auto-select all-MiniLM-L6-v2 if available
      const miniLMOption = embeddingOptions.find(o => o.value === 'all-MiniLM-L6-v2');
      if (miniLMOption) {
        setEmbeddingModel('all-MiniLM-L6-v2');
      }
    } else if (searchType === 'mmr') {
      // When switching to MMR, if current model is all-MiniLM-L6-v2, switch to first available non-disabled option
      if (embeddingModel === 'all-MiniLM-L6-v2') {
        const firstAvailableOption = embeddingOptions.find(o => o.value !== 'all-MiniLM-L6-v2');
        if (firstAvailableOption) {
          setEmbeddingModel(firstAvailableOption.value);
        }
      }
    }
  }, [searchType, embeddingOptions, embeddingModel]);

  const fetchBookLov = useCallback(async () => {
    if (bookLovLoading || bookLovFetched) return;
    if (!selectedCustomerCode || selectedCustomerCode === '_ALL') return;
    setBookLovLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.GET_BOOKS_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          par_customercode: selectedCustomerCode || '',
          par_organizationcode: selectedOrganization || '',
          par_appcode: selectedApp || '',
        }),
      });
      const data = await response.json();
      const books = Array.isArray(data) ? data : (data.data || []);
      if (Array.isArray(books)) {
        const options = books
          .map((book: any) => {
            const rawName = typeof book?.bookname === 'string' ? book.bookname.trim() : '';
            if (!rawName) return null;
            const mappedId = book?.bookid ?? book?.id;
            const numericId = mappedId != null ? Number(mappedId) : undefined;
            return {
              value: rawName,
              label: rawName,
              bookid: numericId && !Number.isNaN(numericId) ? numericId : undefined,
            };
          })
          .filter(Boolean) as { value: string; label: string; bookid?: number }[];
        const seen = new Set<string>();
        const unique = options.filter((o) => {
          if (seen.has(o.value)) return false;
          seen.add(o.value);
          return true;
        });
        setBookLovOptions(unique);
        setBookLovFetched(true);
      } else {
        setBookLovOptions([]);
        setBookLovFetched(false);
      }
    } catch (error) {
      // silent fail
    } finally {
      setBookLovLoading(false);
    }
  }, [bookLovLoading, bookLovFetched, selectedCustomerCode, selectedOrganization, selectedApp]);

  const fetchStudyLov = useCallback(async (bookId?: number, force = false) => {
    const idToUse = bookId ?? selectedBookId;
    if (!idToUse) return;
    if (!force && studyCacheRef.current[idToUse]) {
      setStudyLovOptions(studyCacheRef.current[idToUse]);
      return;
    }
    try {
      setStudyLovLoading(true);
      const response = await fetch(withCustOrgCodes(`${API_ENDPOINTS.AIG_CHAPTERS}?bookcode=${idToUse}`, { custcode: selectedCustomerCode, orgcode: selectedOrganization }));
      const responseData = await response.json();
      if (responseData && Array.isArray(responseData.data)) {
        const options = responseData.data
          .map((chapter: { chapterCode: string; chapterName: string }) => ({
            value: chapter.chapterName,
            label: chapter.chapterName,
          }))
          .filter((opt: any) => typeof opt.value === 'string' && opt.value.trim().length > 0);
        const seen = new Set<string>();
        const unique = options.filter((o: any) => {
          if (seen.has(o.value)) return false;
          seen.add(o.value);
          return true;
        });
        studyCacheRef.current[idToUse] = unique;
        setStudyLovOptions(unique);
      } else {
        setStudyLovOptions([]);
      }
    } catch (error) {
      setStudyLovOptions([]);
    } finally {
      setStudyLovLoading(false);
    }
  }, [selectedBookId, selectedCustomerCode, selectedOrganization]);

  // Organization and apps
  const fetchOrganizationData = useCallback(async () => {
    if (!selectedCustomerCode || organizationLoading) return;
    setOrganizationLoading(true);
    try {
      const orgResponse = await fetch(API_ENDPOINTS.GET_ORGANIZATION_DETAILS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ par_custcode: selectedCustomerCode }),
      });
      const orgData = await orgResponse.json();
      if (Array.isArray(orgData.data)) {
        const options = orgData.data.map((org: any) => ({
          value: org.organizationcode,
          label: `${org.organizationname} `,
        }));
        setOrganizationOptions(options);
      } else {
        setOrganizationOptions([]);
      }
    } catch (error) {
      setOrganizationOptions([]);
    } finally {
      setOrganizationLoading(false);
    }
  }, [selectedCustomerCode]);

  const fetchAppsData = useCallback(async () => {
    if (!selectedCustomerCode || !selectedOrganization || appsFetchInFlight.current) return;
    appsFetchInFlight.current = true;
    setAppsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.GET_APPS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ par_custcode: selectedCustomerCode, par_orgcode: selectedOrganization }),
      });
      const data = await response.json();
      if (Array.isArray(data.data)) {
        const options = data.data.map((app: any) => ({
          value: app.appcode || app.code,
          label: app.applicationname || app.applicationName || app.appname || app.name || app.appcode || app.code,
        }));
        setAppsOptions(options);
      } else {
        console.error('[KnowledgeBase] get-apps returned no app list:', data);
        setAppsOptions([]);
      }
    } catch (error) {
      console.error('[KnowledgeBase] Failed to fetch apps:', error);
      setAppsOptions([]);
    } finally {
      appsFetchInFlight.current = false;
      setAppsLoading(false);
    }
  }, [selectedCustomerCode, selectedOrganization]);

  useEffect(() => {
    setSelectedOrganization(null);
    setOrganizationOptions([]);
    setSelectedApp(null);
    setAppsOptions([]);
    if (selectedCustomerCode && selectedCustomerCode !== '_ALL') {
      fetchOrganizationData();
    }
  }, [selectedCustomerCode, fetchOrganizationData]);

  useEffect(() => {
    setSelectedApp(null);
    setAppsOptions([]);
    if (selectedCustomerCode && selectedCustomerCode !== '_ALL' && selectedOrganization) {
      fetchAppsData();
    }
  }, [selectedOrganization, selectedCustomerCode, fetchAppsData]);

  // Fetch apps data when returning from other pages to main dashboard
  useEffect(() => {
    // Only fetch when not in any creation/editing modes and on main dashboard
    if (selectedCustomerCode && selectedOrganization) {
      fetchAppsData();
    }
  }, [selectedCustomerCode, selectedOrganization, fetchAppsData]);

  // Auto-select Organization from session (userInfo.orgCode) once options are loaded
  useEffect(() => {
    // Only attempt when a specific customer is selected (not _ALL) and org not yet selected
    if (!selectedCustomerCode || selectedCustomerCode === '_ALL') return;
    if (selectedOrganization) return;
    if (!Array.isArray(organizationOptions) || organizationOptions.length === 0) return;

    let orgFromSession = '';
    try {
      const uiRaw = sessionStorage.getItem('userInfo');
      if (uiRaw) {
        const ui = JSON.parse(uiRaw || '{}');
        orgFromSession = ui?.orgCode || ui?.organizationcode || '';
      }
    } catch { }

    if (!orgFromSession) return;
    const match = organizationOptions.find((o: any) => String(o.value || '').toLowerCase() === String(orgFromSession).toLowerCase());
    if (match) {
      setSelectedOrganization(match.value);
      if (!isSuperAdmin) {
        setOrganizationLocked(true);
      }
      // Keep the typed search input in sync for the top filter
      setOrgSearchQuery(match.label || match.value);
    }
  }, [organizationOptions, selectedCustomerCode, selectedOrganization]);

  // ----------- STUDY LO: Books details & LO details helpers FROM abc.tsx ----------
  const fetchBooksDetails = useCallback(async () => {
    if (booksLoading) return;
    if (!selectedCustomerCode) return;
    setBooksLoading(true);
    setBooksError(null);
    try {
      const response = await fetch(API_ENDPOINTS.GET_BOOKS_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          par_customercode: selectedCustomerCode || '',
          par_organizationcode: selectedOrganization || '',
          par_appcode: selectedApp || '',
        }),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();
      const books = Array.isArray(data) ? data : (data.data || []);
      const options = books.map((book: any) => ({
        value: book.bookname || book.name || '',
        label: book.bookname || book.name || '',
        bookId: book.bookid || book.id,
      })).filter((option: any) => option.value);
      setBooksOptions(options);
    } catch (error) {
      setBooksError(error?.message || 'Failed to fetch books');
      setBooksOptions([]);
    } finally {
      setBooksLoading(false);
    }
  }, [booksLoading, selectedCustomerCode, selectedOrganization, selectedApp]);

  // Fetch chapter LO details when book is selected
  const fetchChapterLODetails = useCallback(async (bookId: number) => {
    if (!bookId || chapterLOLoading) return;
    setChapterLOLoading(true);
    setChapterLOError(null);
    try {
      const response = await fetch(API_ENDPOINTS.GET_CHAPTER_LO_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ par_bookid: bookId }),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setChapterLODetails(data.data);
      } else {
        setChapterLODetails([]);
        setChapterLOError(data.message || 'No data found');
      }
    } catch (error) {
      setChapterLOError(error?.message || 'Failed to fetch chapter LO details');
      setChapterLODetails([]);
    } finally {
      setChapterLOLoading(false);
    }
  }, [chapterLOLoading]);
  // Delete Chapter & LO details
  const handleDeleteChapterLO = useCallback(async () => {
    if (!pendingChapterLODelete || !selectedBookId) return;
    setChapterLODeleteLoading(true);
    try {
      const payload = {
        par_bookid: selectedBookId,
        par_chaptername: "",
        par_chapterid: Number(
          pendingChapterLODelete.chapterid ||
          pendingChapterLODelete.chapternameid ||
          pendingChapterLODelete.chapter_id ||
          0
        ),
        par_loname: "",
        par_loid: Number(
          pendingChapterLODelete.learningoutcomeid ||
          pendingChapterLODelete.loid ||
          pendingChapterLODelete.lo_id ||
          0
        ),
        par_pagenumber: "",
        par_status: ""
      };

      const response = await fetch(API_ENDPOINTS.UPDATE_CHAPTER_LO_DETAILS, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Close delete dialog and show success dialog
        setShowChapterLODeleteDialog(false);
        setChapterLODeleteType('row');
        setShowChapterLOSuccessDialog(true);
        setPendingChapterLODelete(null);
        setTimeout(() => {
          if (selectedBookId) {
            fetchChapterLODetails(selectedBookId);
          }
        }, 500);
      } else {
        throw new Error('Failed to delete Chapter & LO');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete Chapter & LO. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setChapterLODeleteLoading(false);
    }
  }, [pendingChapterLODelete, selectedBookId, fetchChapterLODetails]);

  // Delete all Chapter & LO details for a book
  const handleDeleteAllChapterLO = useCallback(async () => {
    if (!selectedBookId) return;
    setChapterLODeleteLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.DELETE_ALL_CHAPTER_LO_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ par_bookid: selectedBookId }),
      });

      const data = await response.json();
      if (response.ok) {
        setChapterLODetails([]);
        setShowChapterLODeleteDialog(false);
        setChapterLODeleteType('all');
        setShowChapterLOSuccessDialog(true);
        setPendingChapterLODelete(null);
        setTimeout(() => {
          if (selectedBookId) {
            fetchChapterLODetails(selectedBookId);
          }
        }, 500);
      } else {
        throw new Error(data?.detail || data?.message || 'Failed to delete all Chapter & LO details');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete all Chapter & LO details. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setChapterLODeleteLoading(false);
    }
  }, [selectedBookId, fetchChapterLODetails]);
  // Update Chapter & LO details
  const updateChapterLO = useCallback(async (item: any) => {
    if (!selectedBookId) return;
    setChapterLOLoading(true);
    setChapterLOError(null);
    try {
      const payload = {
        par_bookid: selectedBookId,
        par_chaptername: String(item.chaptername || item.chapter_name || ''),
        par_chapterid: Number(item.chapternameid || item.chapterid || item.chapter_id || 0) || 0,
        par_loname: String(item.learningoutcomename || item.loname || item.lo_name || ''),
        par_loid: Number(item.learningoutcomenameid || item.loid || item.lo_id || 0) || 0,
        par_pagenumber: String(item.pagenumber || item.page_number || ''),
      };
      const response = await fetch(API_ENDPOINTS.UPDATE_CHAPTER_LO_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) {
        await fetchChapterLODetails(selectedBookId);
        setEditingChapterLOIndex(null);
        setEditingChapterLOBackup(null);
        toast({
          title: 'Success',
          description: 'Chapter & LO details updated successfully!',
        });
      } else {
        throw new Error(data.message || data.detail || 'Failed to update Chapter & LO');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update Chapter & LO. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setChapterLOLoading(false);
    }
  }, [selectedBookId, fetchChapterLODetails]);

  // Add new Chapter & LO details
  const addNewChapterLO = useCallback(() => {
    if (!selectedBookId) return;

    // If there's an existing row being edited, restore it first
    if (editingChapterLOIndex !== null && editingChapterLOBackup) {
      setChapterLODetails(prev =>
        prev.map((r, i) => i === editingChapterLOIndex ? { ...editingChapterLOBackup } : r)
      );
    }

    // Remove any existing new rows
    setChapterLODetails(prev => prev.filter(item => !item.isNew));

    const newRow = {
      chaptername: '',
      chapternameid: 0,
      learningoutcomename: '',
      learningoutcomenameid: 0,
      pagenumber: '',
      isNew: true // Flag to identify new row
    };

    setChapterLODetails(prev => [...prev, newRow]);
    setIsAddingNewChapterLO(true);
    setEditingChapterLOIndex(chapterLODetails.filter(item => !item.isNew).length); // Set editing mode to new row
    setEditingChapterLOBackup(null);
  }, [selectedBookId, chapterLODetails.length, editingChapterLOIndex, editingChapterLOBackup]);

  // Save new Chapter & LO details
  const saveNewChapterLO = useCallback(async (item: any) => {
    if (!selectedBookId) return;
    setChapterLOLoading(true);
    setChapterLOError(null);
    try {
      const payload = {
        par_bookid: selectedBookId,
        par_chaptername: String(item.chaptername || ''),
        par_chapterid: 0, // New row, so ID is 0
        par_loname: String(item.learningoutcomename || ''),
        par_loid: 0, // New row, so ID is 0
        par_pagenumber: String(item.pagenumber || ''),
      };

      const response = await fetch(API_ENDPOINTS.UPDATE_CHAPTER_LO_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) {
        await fetchChapterLODetails(selectedBookId);
        setIsAddingNewChapterLO(false);
        setEditingChapterLOIndex(null);
        toast({
          title: 'Success',
          description: 'Chapter & LO details added successfully!',
        });
      } else {
        throw new Error(data.message || data.detail || 'Failed to add Chapter & LO');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add Chapter & LO. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setChapterLOLoading(false);
    }
  }, [selectedBookId, fetchChapterLODetails]);

  // Fetch org/apps when Study LO mode activated
  useEffect(() => {
    if ((isCreatingStudyLO || isTaggingAgents) && selectedCustomerCode) {
      fetchOrganizationData();
    }
  }, [isCreatingStudyLO, isTaggingAgents, selectedCustomerCode]);
  useEffect(() => {
    if ((isCreatingStudyLO || isTaggingAgents) && selectedOrganization && selectedCustomerCode) {
      fetchAppsData();
    }
  }, [isCreatingStudyLO, isTaggingAgents, selectedOrganization, selectedCustomerCode]);

  // Reset all Study LO creation-related state when leaving Study LO mode
  useEffect(() => {
    if (!isCreatingStudyLO) {
      setSelectedBook("");
      setSelectedBookId(null);
      // DO NOT clear booksOptions, organizationOptions, appsOptions, so dropdowns will re-populate after return
      setBooksLoading(false);
      setBooksError(null);
      setAgentConfig([]);
      setAgentConfigLoading(false);
      setAgentConfigError(null);
      setSelectedAgents({
        Retrieval: false,
        Compliance: false,
        Assessment: false,
        "Math Generation": false
      });
      setAgentPriorities({
        Retrieval: 1,
        Compliance: 2,
        Assessment: 3,
        "Math Generation": 4
      });
      setStudyLODocuments([]);
      setStudyLOPreview([]);
      setChapterLODetails([]);
      setChapterLOLoading(false);
      setChapterLOError(null);
      setShowChapterLODeleteDialog(false);
      setPendingChapterLODelete(null);
      setChapterLODeleteLoading(false);
      setShowChapterLOSuccessDialog(false);
      setEditingChapterLOIndex(null);
      setEditingChapterLOBackup(null);
      setIsAddingNewChapterLO(false);
      setSelectedOrganization(null);
      setOrganizationLoading(false);
      // Do not clear organizationOptions (fixes missing dropdown)
      setSelectedApp(null);
      setAppsLoading(false);
      // Do not clear appsOptions (fixes missing dropdown)
    } else {
      // When StudyLO Create is activated: always fetch books/orgs (guarantees dropdowns not empty)
      fetchOrganizationData();
      // If there's a default org, fetch apps as well
      if (selectedCustomerCode && selectedOrganization) {
        fetchAppsData();
      }
    }
  }, [isCreatingStudyLO]);

  useEffect(() => {
    if (isCreatingStudyLO && selectedCustomerCode) {
      fetchBooksDetails();
    }
  }, [isCreatingStudyLO, selectedCustomerCode]);
  // STUDY LO: AGENT CFG helpers
  // -- MODIFIED fetchAgentConfig using correct API and result mapping --
  const fetchAgentConfig = useCallback(async () => {
    if (!selectedCustomerCode || !selectedOrganization || !selectedApp || !selectedBook) return;
    setAgentConfigLoading(true);
    setAgentConfigError(null);
    try {
      // Use the actual endpoint path for get-agent-config
      const url = API_ENDPOINTS.GET_AGENT_CONFIG;
      const payload = {
        orgcode: selectedOrganization,
        custcode: selectedCustomerCode,
        appcode: selectedApp,
        sourcename: selectedBook,
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to fetch agent configuration');

      // "results" contains array of agents -- if empty, restore default
      const results = Array.isArray(data?.results) ? data.results : [];
      setAgentConfig(results);

      // Default: Retrieval and Assessment enabled, priorities 1,2 (per 1st screenshot)
      let newSelections: Record<string, boolean> = {
        Retrieval: true,
        Compliance: false,
        Assessment: true,
        "Math Generation": false,
      };
      let newPriorities: Record<string, number> = {
        Retrieval: 1,
        Compliance: 4,
        Assessment: 2,
        "Math Generation": 3,
      };

      if (results.length > 0) {
        // Map results to selections/priorities regardless of availableAgents load order
        const normalized = results
          .map((r: any) => ({
            name: String(r?.agentname || '').trim(),
            pr: r?.agentstatus != null && !Number.isNaN(Number(r.agentstatus)) ? Number(r.agentstatus) : null,
          }))
          .filter(x => x.name.length > 0);

        // Sort by provided priority if present; otherwise preserve API order
        const ordered = [...normalized].sort((a, b) => {
          const ap = a.pr ?? Infinity;
          const bp = b.pr ?? Infinity;
          return ap - bp;
        });

        // Seed keys with availableAgents if present, otherwise start empty and fill from results
        const seededSelections: Record<string, boolean> = {};
        const seededPriorities: Record<string, number> = {};
        if (Array.isArray(availableAgents) && availableAgents.length > 0) {
          availableAgents.forEach((agent: any) => {
            const key = String(agent?.agentname || '').trim();
            if (key) {
              seededSelections[key] = false;
            }
          });
        }

        let p = 1;
        ordered.forEach(({ name }) => {
          // Always set from results; UI will only render those keys that exist in availableAgents
          seededSelections[name] = true;
          seededPriorities[name] = p++;
        });

        // If nothing mapped, keep defaults; else adopt seeded
        if (Object.keys(seededSelections).length > 0) {
          newSelections = seededSelections;
          newPriorities = seededPriorities;
        }
      } else {
        // Keep default states if API result is empty - use dynamic agents
        const fallbackSelections: Record<string, boolean> = {};
        const fallbackPriorities: Record<string, number> = {};

        availableAgents.forEach((agent: any) => {
          if (agent.agentname === 'Retrieval') {
            fallbackSelections[agent.agentname] = true;
            fallbackPriorities[agent.agentname] = 1;
          } else if (agent.agentname === 'Assessment') {
            fallbackSelections[agent.agentname] = true;
            fallbackPriorities[agent.agentname] = 2;
          } else {
            fallbackSelections[agent.agentname] = false;
          }
        });

        newSelections = fallbackSelections;
        newPriorities = fallbackPriorities;
      }

      setSelectedAgents(newSelections);
      setAgentPriorities(newPriorities);
    } catch (error) {
      setAgentConfigError(error?.message || 'Failed to fetch agent configuration');
      setAgentConfig([]);
      // Fallback to dynamic agent states
      const fallbackSelectedAgents: Record<string, boolean> = {};
      const fallbackAgentPriorities: Record<string, number> = {};
      availableAgents.forEach((agent: any, index: number) => {
        fallbackSelectedAgents[agent.agentname] = index === 0 || index === 2; // Enable first and third agents by default
        fallbackAgentPriorities[agent.agentname] = index === 2 ? 2 : index + 1; // Assessment gets priority 2
      });
      setSelectedAgents(fallbackSelectedAgents);
      setAgentPriorities(fallbackAgentPriorities);
    } finally {
      setAgentConfigLoading(false);
    }
  }, [selectedCustomerCode, selectedOrganization, selectedApp, selectedBook, availableAgents]);

  // Re-fetch agent configuration once agent list loads to bind checkboxes correctly
  useEffect(() => {
    if ((isCreatingStudyLO || isTaggingAgents) && selectedCustomerCode && selectedOrganization && selectedApp && selectedBook && Array.isArray(availableAgents) && availableAgents.length > 0) {
      fetchAgentConfig();
    }
  }, [availableAgents, isCreatingStudyLO, isTaggingAgents, selectedCustomerCode, selectedOrganization, selectedApp, selectedBook]);
  useEffect(() => {
    if (selectedApp && selectedCustomerCode && selectedOrganization && (isCreatingStudyLO || isTaggingAgents)) {
      setAgentConfig([]);
      // Reset to dynamic agent states
      const resetSelectedAgents: Record<string, boolean> = {};
      const resetAgentPriorities: Record<string, number> = {};
      availableAgents.forEach((agent: any) => {
        // Defaults: Retrieval and Assessment selected with priorities 1 and 2
        if (agent.agentname === 'Retrieval') {
          resetSelectedAgents[agent.agentname] = true;
          resetAgentPriorities[agent.agentname] = 1;
        } else if (agent.agentname === 'Assessment') {
          resetSelectedAgents[agent.agentname] = true;
          resetAgentPriorities[agent.agentname] = 2;
        } else {
          resetSelectedAgents[agent.agentname] = false;
        }
      });
      setSelectedAgents(resetSelectedAgents);
      setAgentPriorities(resetAgentPriorities);
      setAgentConfigError(null);
      fetchAgentConfig();
    }
  }, [selectedApp, isCreatingStudyLO, isTaggingAgents, selectedCustomerCode, selectedOrganization]);
  // STUDY LO: Agent multi-handlers
  // const handleAgentSelectionChange = (agentName: string, selected: boolean) => {
  //   const newSelectedAgents = { ...selectedAgents, [agentName]: selected };
  //   setSelectedAgents(newSelectedAgents);

  //   // Re-calculate priorities sequentially based on the order in availableAgents
  //   const newPriorities: Record<string, number> = {};
  //   let currentPriority = 1;
  //   availableAgents.forEach(agent => {
  //     if (newSelectedAgents[agent.agentname]) {
  //       newPriorities[agent.agentname] = currentPriority++;
  //     }
  //   });
  //   setAgentPriorities(newPriorities);
  // };


  // -- MODIFIED handleAddAgents with required payload and follow-up logic --
  const handleAddAgents = async () => {
    if (!selectedCustomerCode || !selectedOrganization || !selectedApp) {
      toast({
        title: 'Validation Error',
        description: 'Please select customer, organization, app, and book first',
        variant: 'destructive'
      });
      return;
    }
    try {
      let finalSelectedAgents = { ...selectedAgents };
      let finalPriorities = { ...agentPriorities };

      // Check if any agent is selected. If not, default to Retrieval and Assessment.
      const isAnyAgentSelected = Object.values(finalSelectedAgents).some(isSelected => isSelected);

      if (!isAnyAgentSelected) {
        finalSelectedAgents = {
          ...finalSelectedAgents,
          Retrieval: true,
          Assessment: true,
        };
        // Ensure default priorities are set if they don't exist
        finalPriorities = {
          ...finalPriorities,
          Retrieval: 1,
          Assessment: 2,
        };
      }

      // Build final list with default priorities: Retrieval(1), Assessment(2), then other selected agents (3..N)
      const displayOrder = availableAgents.map(a => a.agentname);
      const anySelected = Object.values(finalSelectedAgents).some(Boolean);
      const effectiveSelected: Record<string, boolean> = { ...finalSelectedAgents };

      if (!anySelected) {
        effectiveSelected['Retrieval'] = true;
        effectiveSelected['Assessment'] = true;
      }

      const otherSelected = displayOrder.filter(
        (name) => name !== 'Retrieval' && name !== 'Assessment' && effectiveSelected[name]
      );
      const middleSorted = [...otherSelected].sort((a, b) => {
        const ap = agentPriorities[a] ?? 99;
        const bp = agentPriorities[b] ?? 99;
        return ap - bp;
      });
      const orderedNames: string[] = ['Retrieval', ...middleSorted, 'Assessment'];
      const availableNameSet = new Set(displayOrder.concat(['Retrieval', 'Assessment']));
      const finalNames = orderedNames.filter((n, i) => availableNameSet.has(n) && orderedNames.indexOf(n) === i);

      if (finalNames.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please select at least one agent',
          variant: 'destructive'
        });
        return;
      }

      // Priorities strictly 1..N matching the composed order; Retrieval=1, Assessment=2
      const agentname = finalNames.join(',');
      const agentstatus = finalNames.map((_, idx) => String(idx + 1)).join(',');

      // Prepare payload per requirement
      const payload = {
        orgcode: selectedOrganization,
        custcode: selectedCustomerCode,
        appcode: selectedApp,
        agentname,
        agentstatus,
        sourcename: selectedBook
      };

      // Use correct endpoint (direct path)
      let didUnlock = false;
      try {
        const url = API_ENDPOINTS.INSERT_AGENT_CONFIG;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (response.ok && (data.status === "success" || String(data.status).toLowerCase().startsWith("s"))) {
          toast({ title: 'Success', description: 'Agent configuration saved successfully' });

          // On success, fetch the agent config with new values
          await fetchAgentConfig();
        } else {
          throw new Error(data?.message || 'Failed to save agent configuration');
        }
      } finally {
        // Cleanup handled by main useEffect hook
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save agent configuration',
        variant: 'destructive'
      });
    }
  };
  // STUDY LO: File upload, preview, submit EVENTS
  const parseStudyLOCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length > 1) {
        const headers = rows[0].map(h => h.trim());
        const data = [];
        for (let i = 1; i < rows.length; i++) {
          const values = rows[i].map(v => v.trim());
          if (values.length >= 2 && values[0] && values[1]) {
            data.push({
              studyName: values[0] || '',
              learningOutcomeName: values[1] || '',
              pageNumber: values[2] || ''
            });
          }
        }
        setStudyLOPreview(data);
      }
    };
    reader.readAsText(file);
  };

  // Helper function to parse CSV text properly handling quoted fields, multi-line content, and escaped quotes
  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote within quotes
          currentField += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        currentRow.push(currentField);
        currentField = '';
        i++;
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        // Row separator
        currentRow.push(currentField);
        if (currentRow.some(field => field.trim())) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        // Skip \r\n sequences
        if (char === '\r' && nextChar === '\n') {
          i += 2;
        } else {
          i++;
        }
      } else {
        // Regular character (including newlines within quotes)
        currentField += char;
        i++;
      }
    }

    // Add the last field and row if there's remaining content
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some(field => field.trim())) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  const formatFileSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes < 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingStudyLO(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingStudyLO(false);
  };
  const isStudyLOCsvFile = (file: File) => {
    const name = (file?.name || '').toLowerCase().trim();
    const type = (file?.type || '').toLowerCase().trim();
    return type === 'text/csv' || name.endsWith('.csv');
  };
  const STUDY_LO_MAX_BYTES = 30 * 1024 * 1024;
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingStudyLO(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!isStudyLOCsvFile(file)) {
        toast({
          title: 'Invalid File Type',
          description: 'Please upload a CSV file only.',
          variant: 'destructive'
        });
        return;
      }
      if (file.size > STUDY_LO_MAX_BYTES) {
        toast({
          title: 'File Too Large',
          description: 'File should not exceed 30MB.',
          variant: 'destructive'
        });
        return;
      }
        setStudyLODocuments([file]);
        parseStudyLOCSV(file);
    }
  };
  const handleStudyLOSubmit = async () => {
    if (!selectedBook || studyLODocuments.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select a book and upload a document',
        variant: 'destructive'
      });
      return;
    }
    try {
      setCreateSubmitting(true);

      // --- SUBMIT AGENT CONFIG before Study LO file upload ---
      if (selectedCustomerCode && selectedOrganization && selectedApp && selectedBook) {
        // Compose ordered names mirroring handleAddAgents: Retrieval(1), Assessment(2), then other selected
        const displayOrder = availableAgents.map(a => a.agentname);
        const otherSelected = displayOrder.filter(
          (name) => name !== 'Retrieval' && name !== 'Assessment' && (selectedAgents[name] || false)
        );
        const middleSorted = [...otherSelected].sort((a, b) => {
          const ap = agentPriorities[a] ?? 99;
          const bp = agentPriorities[b] ?? 99;
          return ap - bp;
        });
        const orderedNames: string[] = ['Retrieval', ...middleSorted, 'Assessment'];
        const nameSet = new Set(displayOrder.concat(['Retrieval', 'Assessment']));
        const finalNames = orderedNames.filter((n, i) => nameSet.has(n) && orderedNames.indexOf(n) === i);

        const agentname = finalNames.join(',');
        const agentstatus = finalNames.map((_, idx) => String(idx + 1)).join(',');

        const agentConfigPayload = {
          orgcode: selectedOrganization,
          custcode: selectedCustomerCode,
          appcode: selectedApp,
          agentname,
          agentstatus,
          sourcename: selectedBook
        };

        try {
          // POST /AIG/QuizGenApi/insert_agent_config
          const insertAgentUrl = API_ENDPOINTS.INSERT_AGENT_CONFIG;
          const insertResp = await fetch(insertAgentUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agentConfigPayload),
          });
          const insertData = await insertResp.json();

          if (insertResp.ok && (insertData.status === "success" || String(insertData.status).toLowerCase().startsWith("s"))) {
            // On success, GET agent config and update UI state (checkboxes, priorities)
            const getAgentUrl = API_ENDPOINTS.GET_AGENT_CONFIG;
            const getPayload = {
              orgcode: selectedOrganization,
              custcode: selectedCustomerCode,
              appcode: selectedApp,
              sourcename: selectedBook,
            };
            const getResp = await fetch(getAgentUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(getPayload),
            });
            const getData = await getResp.json();

            // Adopted logic from fetchAgentConfig:
            const results = Array.isArray(getData?.results) ? getData.results : [];
            let newSelections: Record<string, boolean> = {
              Retrieval: true,
              Compliance: false,
              Assessment: true,
              "Math Generation": false,
            };
            let newPriorities: Record<string, number> = {
              Retrieval: 1,
              Compliance: 4,
              Assessment: 2,
              "Math Generation": 3,
            };
            if (results.length > 0) {
              newSelections = {
                Retrieval: false,
                Compliance: false,
                Assessment: false,
                "Math Generation": false,
              };
              newPriorities = {
                Retrieval: 1,
                Compliance: 4,
                Assessment: 2,
                "Math Generation": 3,
              };
              let p = 1;
              results.forEach((r) => {
                if (r.agentname in newSelections) {
                  newSelections[r.agentname] = true;
                  newPriorities[r.agentname] = p;
                  p += 1;
                }
              });
            }
            setSelectedAgents(newSelections);
            setAgentPriorities(newPriorities);
          } else {
            // If API fails, fallback to dynamic states
            const fallbackSelectedAgents: Record<string, boolean> = {};
            const fallbackAgentPriorities: Record<string, number> = {};
            availableAgents.forEach((agent: any, index: number) => {
              fallbackSelectedAgents[agent.agentname] = index === 0 || index === 2;
              fallbackAgentPriorities[agent.agentname] = index === 2 ? 2 : index + 1; // Assessment gets priority 2
            });
            setSelectedAgents(fallbackSelectedAgents);
            setAgentPriorities(fallbackAgentPriorities);
          }
        } catch (err) {
          // If any agent config API fails, fallback to dynamic defaults
          const fallbackSelectedAgents: Record<string, boolean> = {};
          const fallbackAgentPriorities: Record<string, number> = {};
          availableAgents.forEach((agent: any, index: number) => {
            fallbackSelectedAgents[agent.agentname] = index === 0 || index === 2; // Enable first and third agents by default
            fallbackAgentPriorities[agent.agentname] = index === 2 ? 2 : index + 1; // Assessment gets priority 2
          });
          setSelectedAgents(fallbackSelectedAgents);
          setAgentPriorities(fallbackAgentPriorities);
        }
      }
      // --- CONTINUE EXISTING FILE UPLOAD FUNCTIONALITY ---
      const formData = new FormData();
      formData.append('book_id', String(selectedBookId ?? ""));
      formData.append('file', studyLODocuments[0]);
      const response = await fetch(API_ENDPOINTS.UPLOAD_STUDY_LO, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        const msg = 'Study LO uploaded successfully.';
        setSuccessDialogMessage(msg);
        setSuccessDialogOpen(true);
        setStudyLODocuments([]);
        setStudyLOPreview([]);
        if (selectedBookId) {
          fetchChapterLODetails(selectedBookId);
        }
      } else {
        throw new Error(data.detail || 'Failed to upload file and process.');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to upload file',
        variant: 'destructive'
      });
    } finally {
      setCreateSubmitting(false);
    }
  };

  useEffect(() => {
    if (isCreating) {
      // when entering create form, fetch orgs for selected customer
      setSelectedOrganization(null);
      setSelectedApp(null);
      fetchOrganizationData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreating, selectedCustomerCode]);

  useEffect(() => {
    if (selectedOrganization && isCreating) {
      setSelectedApp(null);
      fetchAppsData();
    }
    // Intentionally not depending on fetchAppsData to avoid callback identity loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganization, isCreating]);

  useEffect(() => {
    if (levelType === 'study' && !bookLovFetched && !bookLovLoading) {
      fetchBookLov();
    }
  }, [levelType, bookLovFetched, bookLovLoading, selectedCustomerCode, fetchBookLov]);

  // Reset dependent fields when switching level type
  useEffect(() => {
    if (!isCreating) return;

    if (levelType === 'study') {
      // Clear Book Level specific fields when switching to Study Level
      setBookName('');
      setCoverImage(null);
      setKbNameInput('');
      setKbNameCheckStatus("unknown");
      setKbNameCheckMsg("");
      setKbNameFormatError(null);
    } else if (levelType === 'book') {
      // Clear Study Level specific fields when switching to Book Level
      setStudyLevel('');
      setSelectedBookId(null);
      setStudyLovOptions([]);
    }

    // Clear Organization and Apps Details when switching between level types
    setSelectedOrganization(null);
    setSelectedApp(null);
    setAppsOptions([]);

    // Common fields to clear for both level types
    setDocumentFiles([]);
    setSearchType('hybrid');
    setRerankK(5);
    setRerankKInput('5');
    setChunkSize('1000');
    setOverlap('20');
    setChunkingStrategy('recursive');
    setEmbeddingModel('text-embedding-ada-002');
    setVectorDb('faiss');
  }, [levelType, isCreating]);

  // Function to clear all create form fields
  const clearCreateForm = useCallback((preserveOrgApp: boolean = false) => {
    setLevelType("book");
    setBookName('');
    setBookNameFormatError(null);
    setKbNameInput('');
    setKbNameFormatError(null);
    setStudyLevel('');
    setSelectedBookId(null);
    setStudyLovOptions([]);
    setDocumentFiles([]);
    setCoverImage(null);
    if (!preserveOrgApp) {
      setSelectedOrganization(null);
      setSelectedApp(null);
    }
    setSearchType('hybrid');
    setRerankK(5);
    setRerankKInput('5');
    setChunkSize('1000');
    setOverlap('20');
    setChunkingStrategy('recursive');
    setEmbeddingModel('text-embedding-ada-002');
    setVectorDb('faiss');
    setKbNameCheckStatus("unknown");
    setKbNameCheckMsg("");
    setCreateSubmitting(false);
    // Clear customer selection and reset to default
    // setSelectedCustomerCode('_ALL');
    // setCustomerSearchQuery('All');
    // Clear dropdown options
    if (!preserveOrgApp) {
      setOrganizationOptions([]);
      setAppsOptions([]);
    }
    setBookLovOptions([]);
    setBookLovFetched(false);
    // Clear selected book (different from bookName)
    setSelectedBook('');
  }, []);

  const handleCreateKnowledgeBase = useCallback(async () => {
    // validations
    const kbNameToSend = levelType === 'study'
      ? studyLevel.trim()
      : kbNameInput.trim(); // use controlled input
    const bookNameToSend = levelType === 'study'
      ? bookName.trim()
      : ("" + (document.getElementById('book-name-input') as HTMLInputElement | null)?.value || '').trim() || bookName.trim();

    // Format validation for Book Level text inputs (Book Name & Knowledge Base Name)
    if (levelType === 'book') {
      const allowed = /^[A-Za-z0-9][A-Za-z0-9._-]{1,510}[A-Za-z0-9]$/;

      let localBookError: string | null = null;
      let localKbError: string | null = null;

      const bookLen = bookNameToSend.length;
      if (bookLen > 0) {
        if (bookLen < 3 || bookLen > 512) {
          localBookError = 'Name must be 3-512 characters. Allowed: letters, numbers, ., _, - and must start/end with a letter or number.';
        } else if (!allowed.test(bookNameToSend)) {
          localBookError = 'Only [a-zA-Z0-9._-] allowed; must start and end with [a-Za-z0-9]. No spaces.';
        }
      }

      const kbLen = kbNameToSend.length;
      if (kbLen > 0) {
        if (kbLen < 3 || kbLen > 512) {
          localKbError = 'Name must be 3-512 characters. Allowed: letters, numbers, ., _, - and must start/end with a letter or number.';
        } else if (!allowed.test(kbNameToSend)) {
          localKbError = 'Only [a-zA-Z0-9._-] allowed; must start and end with [a-Za-z0-9]. No spaces.';
        }
      }

      setBookNameFormatError(localBookError);
      setKbNameFormatError(localKbError);

      if (localBookError || localKbError) {
        const msg = 'Please fix the highlighted name fields before proceeding.';
        toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
        return;
      }
    }

    // KB name availability check on submit (same logic as debounced effect)
    if (levelType === 'book') {
      if (!selectedCustomerCode || !selectedOrganization || !kbNameToSend) {
        toast({
          title: 'Validation Error',
          description: 'Customer, organization, and knowledge base name are required to validate availability.',
          variant: 'destructive'
        });
        return;
      }

      try {
        const url = `${API_ENDPOINTS.CHECK_KB}?custcode=${encodeURIComponent(selectedCustomerCode)}&orgcode=${encodeURIComponent(selectedOrganization)}&kbname=${encodeURIComponent(kbNameToSend)}`;
        const resp = await fetch(url);
        const json = await resp.json().catch(() => ({}));
        const status: string = String(json?.status || '').toUpperCase();

        if (status.startsWith('E001')) {
          setKbNameCheckStatus('exists');
          const msg = 'A knowledge base with this name already exists.';
          toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
          return;
        } else if (status.startsWith('NE001')) {
          setKbNameCheckStatus('not_exists');
        } else if (!status.startsWith('E001') && !status.startsWith('NE001')) {
          const msg = 'Customer not found';
          setKbNameCheckStatus('unknown');
          toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
          return;
        }
      } catch (e: any) {
        const msg = 'Failed to check KB availability.';
        setKbNameCheckStatus('error');
        toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
        return;
      }
    }

    const hasDocuments = (documentFiles && documentFiles.length > 0);
    const missing: string[] = [];
    if (!bookNameToSend) missing.push('Book Name');
    if (!kbNameToSend) missing.push('Knowledge Base Name');
    if (!hasDocuments) missing.push('Document Upload');
    if (!selectedOrganization) missing.push('Organization');
    if (!selectedApp) missing.push('App');

    if (missing.length > 0) {
      const message =
        missing.length === 1
          ? `${missing[0]} is required.`
          : `${missing.length} fields are required: ${missing.join(', ')}.`;
      toast({ title: 'Validation Error', description: message, variant: 'destructive' });
      return;
    }
    try {
      setCreateSubmitting(true);
      const formData = new FormData();
      // customer data
      const cust = customers.find((c: any) => c.customercode === selectedCustomerCode);
      formData.append('customer', String(cust?.customername || ''));
      formData.append('customercode', String(selectedCustomerCode));
      formData.append('appcode', String(selectedApp));
      formData.append('knowledge_base_name', kbNameToSend);
      formData.append('chunk_size', chunkSize);
      formData.append('overlap_percentage', overlap);
      formData.append('chunking_strategy', chunkingStrategy);
      formData.append('embedding_model', embeddingModel);
      formData.append('vector_db', getDbTypeCanonical(vectorDb));
      formData.append('search_type', searchType);
      formData.append('rerank_k', String(rerankK));
      formData.append('orgcode', String(selectedOrganization));
      formData.append('book_name', bookNameToSend);
      formData.append('LevelType', levelType === 'study' ? 'Study Level' : 'Book Level');
      documentFiles.forEach((file) => formData.append('files', file));
      if (levelType === 'book' && coverImage) {
        formData.append('image_files', coverImage);
      }
      const resp = await fetch(API_ENDPOINTS.PROCESS_DOCUMENTS, { method: 'POST', body: formData });
      let json = {};
      try {
        json = await resp.json();
      } catch (e) {
        // JSON parsing failed, likely due to 413 error or other server issues
        console.error('Failed to parse response JSON:', e);
      }

      if (!resp.ok) {
        // Handle specific HTTP status codes
        if (resp.status === 413) {
          toast({
            title: 'Content Too Large',
            description: 'The total size of uploaded files exceeds the server limit. Please try uploading smaller files or fewer files at a time.',
            variant: 'destructive'
          });
        } else if (resp.status === 429) {
          toast({
            title: 'Too Many Requests',
            description: 'Server is busy. Please wait a moment and try again.',
            variant: 'destructive'
          });
        } else if (resp.status >= 500) {
          toast({
            title: 'Server Error',
            description: 'Server is temporarily unavailable. Please try again later.',
            variant: 'destructive'
          });
        } else {
          toast({ title: 'Failed', description: (json as any)?.message || 'Failed to process documents', variant: 'destructive' });
        }
        return;
      }

      // Check if the KB was actually saved to the database
      const kbSaveStatus = (json as any)?.kb_save_status;
      if (kbSaveStatus !== 'S001') {
        toast({
          title: 'Warning',
          description: 'Knowledge Base was processed but there was an issue saving to the database. Please try again.',
          variant: 'destructive'
        });
        return;
      }

      // Show success dialog only if KB was saved to database
      setSuccessDialogMessage('Knowledge Base created successfully.');
      setSuccessDialogOpen(true);
      
      // refresh list
      try {
        const res = await fetch(buildExistingKbUrl(selectedCustomerCode, selectedOrganization, selectedApp));
        const data = await res.json();
        setKnowledgeBases(Array.isArray(data.data) ? data.data : []);
      } catch { }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Unexpected error', variant: 'destructive' });
    }
    finally {
      setCreateSubmitting(false);
    }
  }, [appsOptions, chunkSize, chunkingStrategy, customers, documentFiles, coverImage, embeddingModel, levelType, overlap, rerankK, searchType, selectedApp, selectedCustomerCode, selectedOrganization, studyLevel, bookName, vectorDb, kbNameInput, bookNameFormatError, kbNameFormatError, kbNameCheckStatus]);

  const removeDocumentFile = (index: number) => {
    setDocumentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeCoverImage = () => {
    setCoverImage(null);
  };

  const filteredKnowledgeBases = knowledgeBases.filter((kb) => {
    const matchesSearch = (kb.knowladgebasename || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (kb.soursename || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === "All" || (kb.leveltype || "") === typeFilter;
    const selOrg = String(selectedOrganization || '').trim().toLowerCase();
    const selApp = String(selectedApp || '').trim().toLowerCase();
    const kbOrg = String(kb.organizationcode || '').trim().toLowerCase();
    const kbApp = String(kb.appcode || '').trim().toLowerCase();
    const matchesOrg = !selectedOrganization || selectedOrganization === '0' || kbOrg === selOrg;
    const matchesApp = !selectedApp || selectedApp === '0' || kbApp === selApp;

    return matchesSearch && matchesType && matchesOrg && matchesApp;
  });

  // === Guidelines: Effects to fetch KB details and guidelines on open ===
  useEffect(() => {
    if (isViewingGuidelines && selectedKBForGuidelines) {
      if (selectedKBForGuidelines.id === 0) {
        // This is a General Guideline
        setGuidelineScope('general');
        setKbDetails({
          id: 0,
          organizationcode: "",
          knowladgebasename: "General Guideline",
          customercode: "",
          appcode: "",
          dbtype: "",
        });
        return;
      }

      // Existing KB guideline view
      setGuidelinesLoading(true);
      setGuidelinesError(null);
      const kbRow = knowledgeBases.find(
        kb => String(kb.knowledgebase_id) === String(selectedKBForGuidelines.id) ||
          kb.knowladgebasename === selectedKBForGuidelines.name
      );
      const kbName = kbRow?.knowladgebasename || selectedKBForGuidelines.name;
      const orgCode = kbRow?.organizationcode || "";
      const customerCode = kbRow?.customercode || "";
      const appCode = kbRow?.appcode || "";

      async function fetchDetails() {
        try {
          const payload = {
            custcode: customerCode,
            orgcode: orgCode,
            kbname: kbName,
            appcode: appCode,
            sourcename: "",
            book_id: String(sessionStorage.getItem('programCode')||'')
          };
          const res = await fetch(API_ENDPOINTS.GET_KB_DETAILS, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !Array.isArray(json?.data) || !json.data.length) {
            throw new Error(json?.message || "Failed to load KB details");
          }
          const kbDetailsObj = json.data[0];
          setKbDetails({
            id: String(kbDetailsObj?.id || ""),
            organizationcode: String(kbDetailsObj?.organizationcode || ""),
            knowladgebasename: String(kbDetailsObj?.knowladgebasename || ""),
            customercode: String(kbDetailsObj?.customercode || ""),
            appcode: String(kbDetailsObj?.appcode || appCode || ""),
            dbtype: String(kbDetailsObj?.dbtype || "faiss"),
          });

          const guidelinePayload = {
            par_kid: String(kbDetailsObj?.id || ""),
            par_guidelinetype: "0",
            par_guidelinename: "0",
            par_orgcode: "0",
            par_appcode: "0",
            par_custcode: "0",
          };
          const guidelineRes = await fetch(API_ENDPOINTS.GET_GUIDELINE, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(guidelinePayload),
          });
          const guidelineJson = await guidelineRes.json().catch(() => ({}));
          if (!guidelineRes.ok) {
            throw new Error(guidelineJson?.message || "Failed to fetch guidelines list");
          }
          setAllGuidelines(Array.isArray(guidelineJson?.data) ? guidelineJson.data : []);
        } catch (e) {
          setGuidelinesError(e?.message || "Failed to load guidelines");
          setAllGuidelines([]);
        } finally {
          setGuidelinesLoading(false);
        }
      }
      fetchDetails();
    } else {
      setAllGuidelines([]);
      setKbDetails({
        id: null,
        organizationcode: null,
        knowladgebasename: null,
        customercode: null,
        appcode: null,
        dbtype: 'faiss',
      });
    }
  }, [isViewingGuidelines, selectedKBForGuidelines, selectedOrganization, selectedCustomerCode, knowledgeBases]);

  return (
    <>
      {/* Guideline Preview Dialog */}
      <AlertDialog open={!!previewGuideline} onOpenChange={(open) => { if (!open) setPreviewGuideline(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Guideline Preview</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3">
                <div>
                  <span className="font-medium text-gray-900">Guideline Name: </span>
                  <span className="text-gray-700">{previewGuideline?.guidelinename || ''}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-900">Guideline Text:</span>
                  <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded text-gray-800 whitespace-pre-wrap max-h-64 overflow-auto">
                    {previewGuideline?.guidelinetext || '—'}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-900">Guideline Path: </span>
                  {previewGuideline?.guidelinepathurl ? (
                    <a
                      href={`${import.meta.env.VITE_BLOB_STORAGE_URL}/${previewGuideline.guidelinepathurl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline"
                      download
                    >
                      Click here to download
                    </a>
                  ) : (
                    <span className="text-gray-700">—</span>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setPreviewGuideline(null)} className="bg-blue-600 hover:bg-blue-700 text-white">
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="min-h-screen bg-gray-50">
        {/* Desktop Sidebar */}
        <div className="fixed left-0 top-0 h-full w-52 z-40 hidden lg:block">
          {isSuperAdmin ? <SuperAdminSidebar /> : <AppSidebar />}
        </div>

        {/* Mobile Menu Sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-64 p-0">
            {isSuperAdmin ? <SuperAdminSidebar /> : <AppSidebar />}
          </SheetContent>
        </Sheet>

        <div className="ml-0 lg:ml-52 flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
            <div className="flex h-16 items-center justify-between px-3 sm:px-6 gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                {/* Mobile Menu Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden flex-shrink-0"
                  onClick={() => setMobileMenuOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ">
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
                    <span className="text-white text-xs">✦</span>
                  </div>
                  <span className="text-xs sm:text-sm text-blue-600 font-medium whitespace-nowrap">4,651</span>
                </div>

                <ProfileDropdown />
              </div>
            </div>
          </header>

          {/* Page Title Section */}
          <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3">
                {(isCreating || isCreatingStudyLO || isViewingGuidelines || isChatMode || isTaggingAgents) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="back to page"
                    onClick={handleBackNavigation}
                    className="flex-shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                )}
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                    {isCreating
                      ? "Create New Knowledge Base"
                      : isCreatingStudyLO
                        ? "Create Study LO"
                        : isTaggingAgents
                          ? "Tag Agents"
                          : isViewingGuidelines
                            ? "Guideline Data"
                            : isChatMode && chatKbDetails?.knowladgebasename
                              ? `Knowledge Base: ${chatKbDetails.knowladgebasename}`
                              : isChatMode && selectedKBForChat?.bookName
                                ? `Knowledge Base: ${selectedKBForChat.bookName}`
                                : "Knowledge Base System"}
                  </h2>
                  {isChatMode && selectedKBForChat && (
                    <p className="text-sm text-gray-600">
                      Customer: {
                        customers.find((c) => c.customercode === selectedCustomerCode)?.customername || selectedCustomerCode
                      }
                    </p>
                  )}
                </div>
              </div>
              {isCreatingStudyLO ? (
                <Button
                  className="bg-yellow-600 hover:bg-yellow-700 text-white flex-shrink-0"
                  onClick={() => window.open(API_ENDPOINTS.DOWNLOAD_STUDY_LO_TEMPLATE, "_blank")}
                >
                  Download Template
                </Button>
              ) : !isCreating && !isViewingGuidelines && !isTaggingAgents && !isChatMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-gray-600 hover:text-gray-900 flex-shrink-0"
                  onClick={() => window.open("/document.html", "_blank")}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Knowledge Base Manual
                </Button>
              )}
            </div>
          </div>

          {/* Main Content */}
          <main className="p-6">
            <BackToTop loading={kbLoading || isCreating || isCreatingStudyLO} />
            {/* Full Page Loader Overlay for Chat */}
            {chatLoading && (
              <div style={{
                position: "fixed",
                zIndex: 1000,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: "100vw",
                height: "100vh",
                background: "rgba(255,255,255,0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <div className="flex flex-col items-center space-y-4 p-8 bg-white rounded-lg shadow-xl border border-gray-200">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                  <p className="text-gray-700 font-medium">Processing your question...</p>
                </div>
              </div>
            )}
            <div className="max-w-7xl mx-auto space-y-6">
              {isChatMode ? (
                /* Chat Interface */
                <div className="flex flex-col h-[calc(100vh-200px)]">
                  {chatDetailsLoading && (
                    <div className="flex-1 flex items-center justify-center text-blue-700 font-medium">Loading chat configuration...</div>
                  )}
                  {chatDetailsError && (
                    <div className="flex-1 flex items-center justify-center text-red-600 font-medium">{chatDetailsError}</div>
                  )}
                  {!chatDetailsLoading && !chatDetailsError && (
                    <>
                      {/* Chat Messages Area */}
                      <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-y-auto p-6 space-y-6 mb-4 relative">
                        {chatMessages.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-gray-400">
                            <div className="text-center">
                              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                              <p className="text-lg font-medium">Start a conversation</p>
                              <p className="text-sm mt-1">Ask questions about your knowledge base documents</p>
                            </div>
                          </div>
                        ) : (
                          chatMessages.map((message, index) => (
                            <div key={index} className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              {message.role === 'assistant' && (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                                  <Bot className="h-5 w-5 text-white" />
                                </div>
                              )}
                              <div className={`max-w-[70%] px-5 py-3.5 rounded-2xl ${message.role === 'user'
                                  ? 'bg-blue-600 text-white rounded-tr-sm'
                                  : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                                }`}>
                                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
                              </div>
                              {message.role === 'user' && (
                                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                                  <User className="h-5 w-5 text-white" />
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      {/* Input Area - Fixed at bottom */}
                      <div className="bg-white rounded-2xl border border-gray-200 p-3">
                        <div className="flex flex-col gap-3">
                          <Textarea
                            placeholder="Ask a question about your documents..."
                            value={chatInput}
                            onChange={handleTextareaChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                              }
                            }}
                            className="bg-white border-none focus:ring-0 resize-none min-h-[40px] max-h-[200px] py-2 overflow-y-auto placeholder:text-gray-400"
                            rows={1}
                            style={{ height: 'auto' }}
                            disabled={chatDetailsLoading || !!chatDetailsError || chatLoading}
                          />

                          <div className="flex items-center justify-between gap-3">
                            <Select value={selectedModel} onValueChange={setSelectedModel}>
                              <SelectTrigger className="w-40 bg-white border border-gray-300 rounded-lg flex-shrink-0 h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white z-50">
                                <SelectItem value="GPT-4o">GPT-4o</SelectItem>
                                <SelectItem value="GPT-4">GPT-4</SelectItem>
                                <SelectItem value="GPT-3.5">GPT-3.5</SelectItem>
                              </SelectContent>
                            </Select>

                            <Button
                              size="icon"
                              onClick={handleSendMessage}
                              disabled={!chatInput.trim() || chatDetailsLoading || !!chatDetailsError || chatLoading}
                              className="h-9 w-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex-shrink-0"
                            >
                              <Send className="h-4 w-4 text-white" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : isViewingGuidelines ? (
                /* Guidelines View */
                <>
                  {/* Knowledge Base Info */}
                  {/* <Card className="border-2 border-blue-100 bg-blue-50">
                  <CardContent className="p-4">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Knowledgebase Name:</span> {selectedKBForGuidelines?.name}
                    </p>
                  </CardContent>
                </Card> */}

                  {/* Full Page Loader Overlay */}
                  {guidelinesLoading && (
                    <div style={{
                      position: "fixed",
                      zIndex: 1000,
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      width: "100vw",
                      height: "100vh",
                      background: "rgba(255,255,255,0.8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <div className="flex flex-col items-center space-y-4 p-8 bg-white rounded-lg shadow-xl border border-gray-200">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                        <p className="text-gray-700 font-medium">
                          {isGuidelineEditing ? 'Updating Guideline...' : 'Uploading Guideline...'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Creation of Guideline dropdown (only when opened via Guidelines icon, not from Create New Guideline) */}
                  {selectedKBForGuidelines?.id !== 0 && (
                    <Card className="border-2 border-indigo-100 bg-indigo-50">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-indigo-900">Creation of Guideline</h3>
                        <Select
                          value={guidelineCreationType}
                          onValueChange={(value) => {
                            setGuidelineCreationType(value as 'new' | 'existing' | 'org_specific');
                            setSelectedExistingGuidelines({});
                            setSelectedOrgSpecificGuidelines({});
                            setPreviewGuideline(null);
                            setIsGuidelineEditing(false);
                            setEditingGuidelineId(null);
                            setGuidelineType(null);
                            setGuidelineSubType(null);
                            setGuidelineName("");
                            setGuidelinesText("");
                            setGuidelineFile(null);
                            setPreviouslyUploadedFileName(null);
                            setWasPreviouslyUploadedFileRemoved(false);
                            // When switching from 'existing' to 'new', refresh guidelines to show newly tagged ones
                            if ((guidelineCreationType === 'existing' || guidelineCreationType === 'org_specific') && value === 'new' && selectedKBForGuidelines?.id) {
                              handleRefreshGuidelines();
                            }
                          }}
                        >
                          <SelectTrigger className="bg-white border-indigo-200 focus:border-indigo-400 focus:ring-indigo-400/20">
                            <SelectValue placeholder="Select creation type" />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            <SelectItem value="new">New Guideline</SelectItem>
                            <SelectItem value="existing">General Guideline</SelectItem>
                            <SelectItem value="org_specific">Organization specific guidelines</SelectItem>
                          </SelectContent>
                        </Select>
                      </CardContent>
                    </Card>
                  )}

                  {/* Guideline Scope dropdown (only for Create New Guideline flow / kbid=0) */}
                  {selectedKBForGuidelines?.id === 0 && (
                    <Card className="border-2 border-indigo-100 bg-indigo-50">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-indigo-900">Guideline Scope</h3>
                        <Select
                          value={guidelineScope}
                          onValueChange={(v) => {
                            setGuidelineScope(v as 'general' | 'org_specific');
                            setSelectedApp(null);
                            setAppsOptions([]);
                          }}
                        >
                          <SelectTrigger className="bg-white border-indigo-200 focus:border-indigo-400 focus:ring-indigo-400/20">
                            <SelectValue placeholder="Select scope" />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            <SelectItem value="general">Add General Guidelines</SelectItem>
                            <SelectItem value="org_specific">Organization specific guidelines</SelectItem>
                          </SelectContent>
                        </Select>
                      </CardContent>
                    </Card>
                  )}

                  {/* Org-specific binding cards (only for Create New Guideline flow) */}
                  {selectedKBForGuidelines?.id === 0 && guidelineScope === 'org_specific' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       {!isSSO && (
                      <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-purple-100">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-purple-600 text-white rounded-lg">
                              <Search className="h-5 w-5" />
                            </div>
                            <h2 className="text-xl font-semibold text-purple-800">Select Customer</h2>
                          </div>
                          <Input
                            type="text"
                            value={getSelectedCustomerName()}
                            disabled
                            className="w-full bg-white border-purple-200 opacity-80"
                          />
                        </CardContent>
                      </Card>
                       )}
   {!isSSO && (
                      <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-purple-100">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-purple-600 text-white rounded-lg">
                              <Search className="h-5 w-5" />
                            </div>
                            <h2 className="text-xl font-semibold text-purple-800">Select Organization</h2>
                          </div>
                          <Input
                            type="text"
                            value={orgSearchQuery || ""}
                            disabled
                            className="w-full bg-white border-purple-200 opacity-80"
                          />
                        </CardContent>
                      </Card>
 )}
                      <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-purple-100">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-purple-600 text-white rounded-lg">
                              <Search className="h-5 w-5" />
                            </div>
                            <h2 className="text-xl font-semibold text-purple-800">Apps Details</h2>
                          </div>
                          <Select
                            value={selectedApp ?? ''}
                            onValueChange={(v) => setSelectedApp(v)}
                            onOpenChange={(open) => {
                              if (open && !appsLoading) fetchAppsData();
                            }}
                          >
                            <SelectTrigger
                              className="bg-white border-purple-200 focus:border-purple-400 focus:ring-purple-400/20"
                              disabled={appsLoading || !selectedOrganization}
                            >
                              <SelectValue placeholder={appsLoading ? "Loading apps..." : (!selectedOrganization ? "Select an organization first" : "Select an app (optional)")} />
                            </SelectTrigger>
                            <SelectContent className="bg-white z-50">
                              {appsOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Existing Guidelines Selection Table */}
                  {selectedKBForGuidelines?.id !== 0 && guidelineCreationType === 'existing' && (
                    <Card className="border-2 border-amber-100 bg-amber-50">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="text-lg font-semibold text-gray-900">Select General Guideline</h3>
                          <Button
                            variant="default"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={handleTagGuidelines}
                            disabled={Object.values(selectedExistingGuidelines).filter(Boolean).length === 0}
                          >
                            Tag Selected Guidelines
                          </Button>
                        </div>
                        <div className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
                          {existingGuidelinesLoading ? (
                            <div className="p-6 text-center text-gray-700">Loading guidelines...</div>
                          ) : guidelinesError ? (
                            <div className="p-6 text-center text-red-600">{guidelinesError}</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-gray-50 border-b-2 border-gray-200 hover:bg-gray-50">
                                    <TableHead className="font-semibold text-gray-900 py-4">Guideline Name</TableHead>
                                    <TableHead className="font-semibold text-gray-900 py-4">Select Guideline</TableHead>
                                    <TableHead className="font-semibold text-gray-900 py-4">Preview</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {existingGuidelines.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={3} className="py-6 text-center text-gray-500 font-medium">
                                        No guidelines found.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    existingGuidelines.map((g: any, idx: number) => {
                                      const key = g.guidelinename || String(idx);
                                      return (
                                        <TableRow key={key} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                                          <TableCell className="font-medium text-gray-900 py-4">{g.guidelinename}</TableCell>
                                          <TableCell className="py-4">
                                            <input
                                              type="checkbox"
                                              checked={!!selectedExistingGuidelines[key]}
                                              onChange={(e) =>
                                                setSelectedExistingGuidelines((prev) => ({ ...prev, [key]: e.target.checked }))
                                              }
                                              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                              style={{ transform: 'scale(1)' }}
                                            />
                                          </TableCell>
                                          <TableCell className="py-4">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-9 w-9 hover:bg-blue-100"
                                              title="Preview"
                                              onClick={() => setPreviewGuideline(g)}
                                            >
                                              <Eye className="h-4 w-4 text-blue-600" />
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Organization Specific Guidelines Selection Table */}
                  {selectedKBForGuidelines?.id !== 0 && guidelineCreationType === 'org_specific' && (
                    <Card className="border-2 border-amber-100 bg-amber-50">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="text-lg font-semibold text-gray-900">Organization specific guidelines</h3>
                          <Button
                            variant="default"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={handleTagGuidelines}
                            disabled={Object.values(selectedOrgSpecificGuidelines).filter(Boolean).length === 0}
                          >
                            Tag  Organization Specific Guidelines
                          </Button>
                        </div>
                        <div className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
                          {orgSpecificGuidelinesLoading ? (
                            <div className="p-6 text-center text-gray-700">Loading guidelines...</div>
                          ) : guidelinesError ? (
                            <div className="p-6 text-center text-red-600">{guidelinesError}</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-gray-50 border-b-2 border-gray-200 hover:bg-gray-50">
                                    <TableHead className="font-semibold text-gray-900 py-4">Guideline Name</TableHead>
                                    <TableHead className="font-semibold text-gray-900 py-4">Select Guideline</TableHead>
                                    <TableHead className="font-semibold text-gray-900 py-4">Preview</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {orgSpecificGuidelines.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={3} className="py-6 text-center text-gray-500 font-medium">
                                        No guidelines found.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    orgSpecificGuidelines.map((g: any, idx: number) => {
                                      const key = g.guidelinename || String(idx);
                                      return (
                                        <TableRow key={key} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                                          <TableCell className="font-medium text-gray-900 py-4">{g.guidelinename}</TableCell>
                                          <TableCell className="py-4">
                                            <input
                                              type="checkbox"
                                              checked={!!selectedOrgSpecificGuidelines[key]}
                                              onChange={(e) =>
                                                setSelectedOrgSpecificGuidelines((prev) => ({ ...prev, [key]: e.target.checked }))
                                              }
                                              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                              style={{ transform: 'scale(1)' }}
                                            />
                                          </TableCell>
                                          <TableCell className="py-4">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-9 w-9 hover:bg-blue-100"
                                              title="Preview"
                                              onClick={() => setPreviewGuideline(g)}
                                            >
                                              <Eye className="h-4 w-4 text-blue-600" />
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {/* Add New Guideline Card */}
                  {!(selectedKBForGuidelines?.id !== 0 && (guidelineCreationType === 'existing' || guidelineCreationType === 'org_specific')) && (
                    <Card id="add-guideline-section" className="border-2 border-teal-100 bg-teal-50">

                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {isGuidelineEditing ? 'Edit Guideline' : 'Add New Guideline'}
                          </h3>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-5 w-5 text-gray-500 cursor-pointer hover:text-gray-700 transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md bg-white text-black border-gray-200 px-4 py-3 rounded-lg shadow-lg">
                                <div className="space-y-2 text-sm leading-relaxed">
                                  <p>Guideline Type can be selected from the Guideline Type dropdown.</p>
                                  <p>Guideline Subtype can be selected from the Guideline Subtype dropdown. If you select a Guideline Subtype, the same value will be used as the Guideline Name automatically. Guideline Subtype is optional.</p>
                                  <p>If you do not want to use a subtype, you can enter any custom name directly in the Guideline Name field.</p>
                                  <p>In the <span className="font-semibold">Guideline to follow</span> field you can type text content. You can also upload TXT or PDF (MAX 5MB) guideline files using the Guideline Document section.</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Guideline Type */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-900">
                              Guideline Type <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={guidelineType || ""}
                              onValueChange={(value) => {
                                setGuidelineType(value);
                                setGuidelineSubType('');
                                if (guidelineName === guidelineSubType) {
                                  setGuidelineName('');
                                }
                              }}
                              disabled={isGuidelineEditing}
                              required={!isGuidelineEditing}
                            >
                              <SelectTrigger className="bg-white border-gray-300">
                                <SelectValue placeholder="Select guideline type" />
                              </SelectTrigger>
                              <SelectContent className="bg-white">
                                <SelectItem value="Content">Content</SelectItem>
                                <SelectItem value="Validation">Validation</SelectItem>
                                <SelectItem value="Question Generation">Question Generation</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Guideline Subtype */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-900">Guideline Subtype</Label>
                            <Select
                              value={guidelineSubType || ""}
                              onValueChange={(val) => {
                                setGuidelineSubType(val);
                                if (val) setGuidelineName(val);
                                else if (guidelineName && guidelineName === guidelineSubType) setGuidelineName(""); // clear if unsetting
                              }}
                              disabled={isGuidelineEditing}
                              required={!isGuidelineEditing}
                            >
                              <SelectTrigger className="bg-white border-gray-300">
                                <SelectValue placeholder="Select subtype" />
                              </SelectTrigger>
                              <SelectContent className="bg-white max-h-60 overflow-y-auto">
                                {(() => {
                                  if (guidelineType === 'Content') {
                                    return <SelectItem value="GENERAL_RULES">GENERAL_RULES</SelectItem>;
                                  }
                                  if (guidelineType === 'Validation') {
                                    return (
                                      <>
                                        <SelectItem value="REMEMBER">REMEMBER</SelectItem>
                                        <SelectItem value="UNDERSTAND">UNDERSTAND</SelectItem>
                                        <SelectItem value="APPLY">APPLY</SelectItem>
                                        <SelectItem value="ANALYZE">ANALYZE</SelectItem>
                                        <SelectItem value="EVALUATE">EVALUATE</SelectItem>
                                        <SelectItem value="CREATE">CREATE</SelectItem>
                                        <SelectItem value="DIFFICULTY_LEVEL_EASY">DIFFICULTY_LEVEL_EASY</SelectItem>
                                        <SelectItem value="DIFFICULTY_LEVEL_MEDIUM">DIFFICULTY_LEVEL_MEDIUM</SelectItem>
                                        <SelectItem value="DIFFICULTY_LEVEL_HARD">DIFFICULTY_LEVEL_HARD</SelectItem>
                                      </>
                                    );
                                  }
                                  if (guidelineType === 'Question Generation') {
                                    return (
                                      <>
                                        <SelectItem value="MULTIPLE_CHOICE">MULTIPLE_CHOICE</SelectItem>
                                        <SelectItem value="FILL_IN_THE_BLANK">FILL_IN_THE_BLANK</SelectItem>
                                        <SelectItem value="MULTIPLE_RESPONSE">MULTIPLE_RESPONSE</SelectItem>
                                        <SelectItem value="TRUE_FALSE">TRUE_FALSE</SelectItem>
                                        <SelectItem value="WRITTEN_RESPONSE">WRITTEN_RESPONSE</SelectItem>
                                        <SelectItem value="MATRIX">MATRIX</SelectItem>
                                        <SelectItem value="SHORT_ANSWER">SHORT_ANSWER</SelectItem>
                                        <SelectItem value="MATCHING_QUESTION">MATCHING_QUESTION</SelectItem>
                                      </>
                                    );
                                  }
                                  // Default: show all options (for no selection or unexpected types)
                                  return (
                                    <>
                                      <SelectItem value="MULTIPLE_CHOICE">MULTIPLE_CHOICE</SelectItem>
                                      <SelectItem value="FILL_IN_THE_BLANK">FILL_IN_THE_BLANK</SelectItem>
                                      <SelectItem value="MULTIPLE_RESPONSE">MULTIPLE_RESPONSE</SelectItem>
                                      <SelectItem value="TRUE_FALSE">TRUE_FALSE</SelectItem>
                                      <SelectItem value="WRITTEN_RESPONSE">WRITTEN_RESPONSE</SelectItem>
                                      <SelectItem value="REMEMBER">REMEMBER</SelectItem>
                                      <SelectItem value="UNDERSTAND">UNDERSTAND</SelectItem>
                                      <SelectItem value="APPLY">APPLY</SelectItem>
                                      <SelectItem value="ANALYZE">ANALYZE</SelectItem>
                                      <SelectItem value="EVALUATE">EVALUATE</SelectItem>
                                      <SelectItem value="CREATE">CREATE</SelectItem>
                                      <SelectItem value="DIFFICULTY_LEVEL_EASY">DIFFICULTY_LEVEL_EASY</SelectItem>
                                      <SelectItem value="DIFFICULTY_LEVEL_MEDIUM">DIFFICULTY_LEVEL_MEDIUM</SelectItem>
                                      <SelectItem value="DIFFICULTY_LEVEL_HARD">DIFFICULTY_LEVEL_HARD</SelectItem>
                                      <SelectItem value="GENERAL_RULES">GENERAL_RULES</SelectItem>
                                      <SelectItem value="MATRIX">MATRIX</SelectItem>
                                      <SelectItem value="SHORT_ANSWER">SHORT_ANSWER</SelectItem>
                                      <SelectItem value="MATCHING_QUESTION">MATCHING_QUESTION</SelectItem>
                                    </>
                                  );
                                })()}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Guideline Name */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-gray-900">
                              Guideline Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              placeholder="Enter guideline name"
                              className="bg-white border-gray-300"
                              value={guidelineName}
                              onChange={(e) => {
                                setGuidelineName(e.target.value);
                                validateGuidelineName(e.target.value);
                              }}
                              required={!guidelineSubType && !isGuidelineEditing}
                              disabled={isGuidelineEditing || Boolean(guidelineSubType)}
                            />
                            {guidelineNameError && <p className="text-red-500 text-xs mt-1">{guidelineNameError}</p>}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-900">Guideline to follow</Label>
                          <Textarea
                            placeholder="Enter guidelines here..."
                            value={guidelinesText}
                            onChange={(e) => setGuidelinesText(e.target.value)}
                            className="bg-white border-gray-300 min-h-[120px]"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-900">
                            Guideline Document (TXT / PDF)
                          </Label>
                          <input
                            type="file"
                            accept=".txt,.pdf"
                            style={{ display: "none" }}
                            id="guideline-file-upload"
                            onChange={handleGuidelineFileChange}
                          />
                          <div
                            className={`bg-white border-2 border-dashed ${isDraggingOver ? 'border-blue-500' : 'border-gray-300'} rounded-lg p-8 text-center space-y-3 hover:border-gray-400 transition-colors cursor-pointer`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDraggingOver(true);
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              setIsDraggingOver(false);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIsDraggingOver(false);
                              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                handleGuidelineFileChange({ target: { files: e.dataTransfer.files } });
                                e.dataTransfer.clearData();
                              }
                            }}
                            onClick={() => (document.getElementById("guideline-file-upload") as HTMLInputElement | null)?.click()}
                          >
                            <div className="flex justify-center">
                              <div className="p-3 bg-yellow-100 rounded-lg">
                                <FileText className="h-8 w-8 text-yellow-600" />
                              </div>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {guidelineFile ? guidelineFile.name : "Drag guideline file here or click to select"}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">.txt or .pdf, max 5MB</p>
                            </div>
                            {guidelineFile && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  setGuidelineFile(null);
                                }}
                              >
                                Remove
                              </Button>
                            )}
                          </div>

                          {/* Previously Uploaded File Section - Separate from upload area */}
                          {previouslyUploadedFileName && !guidelineFile && (
                            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-blue-100 rounded-lg">
                                    <FileText className="h-5 w-5 text-blue-600" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">Previously uploaded file</p>
                                    <p className="text-sm text-gray-600">{previouslyUploadedFileName}</p>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowPrevFileDeleteDialog(true)}
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-start gap-3">
                          <Button
                            className="bg-yellow-600 hover:bg-yellow-700 text-white"
                            disabled={guidelinesLoading}
                            onClick={async () => {
                              // Validation
                              const missing = [];
                              if (!guidelineType) missing.push("Guideline Type");
                              if (!(guidelineSubType && guidelineSubType.trim()) && !guidelineName.trim()) missing.push("Guideline Name or Subtype");
                              if (guidelineNameError) {
                                toast({
                                  title: 'Validation Error',
                                  description: 'Please fix the highlighted name fields before proceeding.',
                                  variant: 'destructive'
                                });
                                return;
                              }
                              const hasTextOrFile = Boolean(guidelinesText.trim() || guidelineFile || (!wasPreviouslyUploadedFileRemoved && previouslyUploadedFileName));
                              if (!hasTextOrFile) missing.push("Please provide either Guideline to follow or Guideline Document.");
                              if (kbDetails.id === null) missing.push("Knowledge base selection");
                              if (missing.length > 0) {
                                if (typeof toast === "function") {
                                  toast({
                                    title: "Validation Error",
                                    description: "Missing fields: " + missing.join(", "),
                                    variant: "destructive"
                                  });
                                } else {
                                  alert("Missing fields:\n" + missing.join(", "));
                                }
                                return;
                              }

                              // Resolve effective guideline name (subtype has priority)
                              const useName = (guidelineSubType && guidelineSubType.trim()) ? guidelineSubType.trim() : guidelineName;

                              // Check availability only when creating a new guideline
                              if (!isGuidelineEditing) {
                                try {
                                  const statusCode = await checkGuidelineAvailability(useName || '', guidelineType || '');

                                  if (statusCode === 'S001') {
                                    // Name already exists – block upload
                                    toast && toast({
                                      title: 'Guideline Name Not Available',
                                      description: 'A guideline with this type and name already exists. Please choose a different name.',
                                      variant: 'destructive',
                                    });
                                    return;
                                  }

                                  if (statusCode === 'NE001') {
                                    // Name does not exist – optional positive feedback
                                    toast && toast({
                                      title: 'Name Available',
                                      description: 'This guideline name is available to use.',
                                    });
                                  }
                                } catch (err: any) {
                                  // If the availability check fails, do not proceed with upload
                                  toast && toast({
                                    title: 'Unable to verify guideline name',
                                    description: err?.message || 'Please try again.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }
                              }

                              // Prepare FormData
                              const formData = new FormData();
                              const effectiveKbId = kbDetails.id === 0 ? 0 : (kbDetails.id || '');
                              const isCreateNewGuidelineFlow = selectedKBForGuidelines?.id === 0;
                              const isOrgSpecific = isCreateNewGuidelineFlow && guidelineScope === 'org_specific';
                              const effectiveCustomerCode = isOrgSpecific ? (selectedCustomerCode || '') : String(kbDetails.customercode || '');
                              const effectiveOrgCode = isOrgSpecific ? (selectedOrganization || '') : String(kbDetails.organizationcode || '');
                              const effectiveAppCode = isOrgSpecific ? (selectedApp || '') : String(kbDetails.appcode ?? '');
                              const effectiveKbName = String(kbDetails.knowladgebasename || '');

                              if (isOrgSpecific && (!selectedCustomerCode || selectedCustomerCode === '_ALL' || !selectedOrganization)) {
                                toast && toast({
                                  title: 'Validation Error',
                                  description: 'Please select customer and organization before uploading guideline.',
                                  variant: 'destructive',
                                });
                                return;
                              }

                              formData.append('par_kbid', String(isCreateNewGuidelineFlow ? 0 : effectiveKbId));
                              formData.append('par_guidelinetype', guidelineType || '');
                              formData.append('par_guidelinesubtype', String(guidelineSubType || ''));
                              formData.append('par_guidelinename', useName || '');
                              formData.append('par_guidelinetext', String(guidelinesText || ''));
                              let guidelinePathUrl = "";
                              if (guidelineFile) {
                                guidelinePathUrl = `vectorstores/${effectiveCustomerCode}/${kbDetails.dbtype}/${effectiveKbName}/${guidelineFile.name}`;
                                formData.append('guideline_file', guidelineFile);
                              } else if (!wasPreviouslyUploadedFileRemoved && previouslyUploadedFileName) {
                                guidelinePathUrl = `vectorstores/${effectiveCustomerCode}/${kbDetails.dbtype}/${effectiveKbName}/${previouslyUploadedFileName}`;
                              }
                              // If wasPreviouslyUploadedFileRemoved is true, guidelinePathUrl will remain empty, indicating file deletion
                              formData.append('par_guidelinepathurl', guidelinePathUrl || '');
                              formData.append('par_nlpguidelinepathurl', '');
                              formData.append('par_nlpguidelinetext', '');
                              formData.append('customercode', String(effectiveCustomerCode || ''));
                              formData.append('dbtype', String(kbDetails.dbtype || ''));
                              formData.append('knowladgebasename', String(effectiveKbName || ''));
                              formData.append('par_orgcode', String(effectiveOrgCode || ''));
                              formData.append('par_appcode', String(effectiveAppCode || ''));
                              formData.append('par_customer', String(effectiveCustomerCode || ''));
                              formData.append('book_id', String(sessionStorage.getItem('programCode')||''));
                              if (isGuidelineEditing && editingGuidelineId) {
                                formData.append('par_guidelineid', String(editingGuidelineId));
                              }
                              try {
                                setGuidelinesLoading(true);
                                const resp = await fetch(API_ENDPOINTS.SAVE_GUIDELINE, {
                                  method: "POST",
                                  body: formData,
                                });
                                const respJson = await resp.json().catch(() => ({}));
                                if (!resp.ok || !respJson || !/^S\d{3}$/.test(respJson.status || "")) {
                                  alert(respJson.message || respJson.error || "Failed to save guideline");
                                  return;
                                }
                                setGuidelineType(null);
                                setGuidelineSubType(null);
                                setGuidelineName("");
                                setGuidelinesText("");
                                setGuidelineFile(null);
                                setPreviouslyUploadedFileName(null);
                                setIsGuidelineEditing(false);
                                setEditingGuidelineId(null);
                                await handleRefreshGuidelines();

                                // Show success toast
                                toast && toast({
                                  title: isGuidelineEditing ? "Guideline Updated" : "Guideline Uploaded",
                                  description: `Guideline ${isGuidelineEditing ? "updated" : "uploaded"} successfully.`
                                });
                              } catch (e) {
                                alert(e?.message || "Error uploading guideline");
                              } finally {
                                setGuidelinesLoading(false);
                              }
                            }}
                          >
                            {isGuidelineEditing ? 'Update Guideline' : 'Upload Guideline'}
                          </Button>
                          {isGuidelineEditing && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setIsGuidelineEditing(false);
                                setEditingGuidelineId(null);
                                setGuidelineType(null);
                                setGuidelineSubType(null);
                                setGuidelineName("");
                                setGuidelinesText("");
                                setGuidelineFile(null);
                                setPreviouslyUploadedFileName(null);
                              }}
                              className="border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* All Guidelines Card */}
                  {!(selectedKBForGuidelines?.id !== 0 && (guidelineCreationType === 'existing' || guidelineCreationType === 'org_specific')) && (
                    <Card className="border-2 border-purple-100 bg-purple-50">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900">All Guidelines</h3>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={handleRefreshGuidelines}
                            disabled={isRefreshing}
                          >
                            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            {isRefreshing ? 'Refreshing...' : 'Refresh'}
                          </Button>
                        </div>

                        <div className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-gray-50 border-b-2 border-gray-200 hover:bg-gray-50">
                                  <TableHead className="font-semibold text-gray-900 py-4">Guideline Name</TableHead>
                                  <TableHead className="font-semibold text-gray-900 py-4">Guideline Type</TableHead>
                                  <TableHead className="font-semibold text-gray-900 py-4">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {allGuidelines.length === 0 ? (
                                  <TableRow>
                                    <TableCell
                                      colSpan={3}
                                      className="py-6 text-center text-gray-500 font-medium"
                                    >
                                      No guidelines found.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  allGuidelines.map((guideline, idx) => (
                                    <TableRow key={guideline.guidelineid || `${guideline.guidelinename}-${idx}`} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                                      <TableCell className="font-medium text-gray-900 py-4">{guideline.guidelinename}</TableCell>
                                      <TableCell className="text-gray-700 py-4">{guideline.guidelinetype}</TableCell>
                                      <TableCell className="py-4">
                                        <div className="flex items-center gap-2">
                                          {/* EDIT */}
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 hover:bg-blue-100"
                                            title="Edit Guideline"
                                            onClick={() => {
                                              setIsGuidelineEditing(true);
                                              setEditingGuidelineId(guideline.kbid);
                                              setGuidelineType(guideline.guidelinetype);

                                              // Auto-set subtype based on name
                                              const validSubtypes = [
                                                'MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK', 'MULTIPLE_RESPONSE',
                                                'TRUE_FALSE', 'WRITTEN_RESPONSE', 'REMEMBER', 'UNDERSTAND',
                                                'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE', 'DIFFICULTY_LEVEL_EASY',
                                                'DIFFICULTY_LEVEL_MEDIUM', 'DIFFICULTY_LEVEL_HARD', 'GENERAL_RULES'
                                              ];

                                              const guidelineName = guideline.guidelinename || "";
                                              if (validSubtypes.includes(guidelineName)) {
                                                setGuidelineSubType(guidelineName);
                                              } else {
                                                setGuidelineSubType("");
                                              }

                                              setGuidelineName(guidelineName);
                                              setGuidelinesText(guideline.guidelinetext || "");
                                              setGuidelineFile(null);
                                              setPreviouslyUploadedFileName(
                                                guideline.guidelinepathurl
                                                  ? guideline.guidelinepathurl.split("/").pop()
                                                  : null
                                              );
                                              setWasPreviouslyUploadedFileRemoved(false);
                                              setTimeout(() => document.getElementById('add-guideline-section')?.scrollIntoView({ behavior: 'smooth' }), 50);
                                            }}
                                          >
                                            <Edit className="h-4 w-4 text-blue-600" />
                                          </Button>
                                          {/* DELETE */}
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 hover:bg-red-100"
                                            title="Delete Guideline"
                                            onClick={() => {
                                              setShowGuidelineDeleteDialog(true);
                                              setGuidelinePendingDelete(guideline);
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4 text-red-600" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : isTaggingAgents ? (
                <>
                  {/* Organization and Apps Details - Same Row (for Tag Agents) */}
                  <div className="flex flex-col lg:flex-row gap-4">
                    {/* Select Organization Card */}
                    <Card className="border-2 border-purple-100 bg-purple-50 flex-1">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-purple-900">Select Organization</h3>
                        <Select
                          value={selectedOrganization ?? ''}
                          onValueChange={(value) => {
                            setSelectedOrganization(value);
                            setSelectedApp(null);
                            setAppsOptions([]);
                            if (value && selectedCustomerCode) {
                              setTimeout(() => fetchAppsData(), 0);
                            }
                          }}
                          disabled
                        >
                          <SelectTrigger className="bg-white border-purple-200 focus:border-purple-400 focus:ring-purple-400/20">
                            <SelectValue placeholder={organizationLoading ? "Loading organizations..." : "Select an organization"} />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            {organizationOptions.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {organizationLoading && (
                          <p className="text-sm text-purple-600 mt-1">Loading organizations...</p>
                        )}
                      </CardContent>
                    </Card>
                    {/* Apps Details Card */}
                    <Card className="border-2 border-indigo-100 bg-indigo-50 flex-1">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-indigo-900">Apps Details</h3>
                        <Select
                          value={selectedApp ?? ''}
                          onValueChange={setSelectedApp}
                          disabled
                        >
                          <SelectTrigger className="bg-white border-indigo-200 focus:border-indigo-400 focus:ring-indigo-400/20">
                            <SelectValue placeholder={appsLoading ? "Loading apps..." : (!selectedOrganization ? "Select an organization first" : "Select an app")} />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            {appsOptions.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {appsLoading && (
                          <p className="text-sm text-indigo-600 mt-1">Loading apps...</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Agent Configuration Card */}
                  {selectedOrganization && selectedApp && (
                    <Card className="border-2 border-purple-100 bg-purple-50">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-purple-600 text-white rounded-lg">
                            <Bot className="h-5 w-5" />
                          </div>
                          <h3 className="text-lg font-semibold text-purple-800">Agent Configuration</h3>
                        </div>
                        {agentConfigLoading && (
                          <div className="flex items-center justify-center py-8">
                            <svg className="animate-spin h-8 w-8 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            <span className="ml-2 text-purple-700">Loading agent configuration...</span>
                          </div>
                        )}
                        {agentConfigError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-700">{agentConfigError}</p>
                          </div>
                        )}
                        {!agentConfigLoading && (
                          <div className="bg-white rounded-lg border-2 border-purple-200 overflow-hidden">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-purple-50 border-b-2 border-purple-200 hover:bg-purple-50">
                                    <TableHead className="font-semibold text-purple-900 py-4">Agent Name</TableHead>
                                    <TableHead className="font-semibold text-purple-900 py-4">Select</TableHead>
                                    <TableHead className="font-semibold text-purple-900 py-4">Priority</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(() => {
                                    const names = availableAgents.map(a => String(a.agentname));
                                    const middleSelected = names.filter(n => n !== 'Retrieval' && n !== 'Assessment' && (selectedAgents[n] || false));
                                    const middleSorted = [...middleSelected].sort((a, b) => {
                                      const ap = agentPriorities[a] ?? 99;
                                      const bp = agentPriorities[b] ?? 99;
                                      return ap - bp;
                                    });
                                    const finalOrder = ['Retrieval', ...middleSorted, 'Assessment'];
                                    const displayPriority: Record<string, number | null> = {};
                                    finalOrder.forEach((k, idx) => { displayPriority[k] = idx + 1; });
                                    const agentList = names.map(key => ({ key, editable: true }));
                                    return agentList.map(({ key, editable }) => {
                                      const isFixed = key === 'Retrieval' || key === 'Assessment';
                                      const isSelected = isFixed ? true : !!selectedAgents[key];
                                      const currentP = displayPriority[key] || null;
                                      return (
                                        <TableRow key={key} className="hover:bg-purple-50/50 transition-colors border-b border-purple-100">
                                          <TableCell className="font-medium text-gray-900 py-4">{key}</TableCell>
                                          <TableCell className="py-4">
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              disabled={isFixed || !editable}
                                              title={isFixed ? "Default agent - always enabled" : editable ? "" : "Always enabled"}
                                              className="h-4 w-4 text-purple-600 border-gray-300 rounded disabled:opacity-50"
                                              onChange={
                                                editable && !isFixed
                                                  ? (e) => {
                                                    const isChecked = e.target.checked;
                                                    setSelectedAgents((prev) => ({
                                                      ...prev,
                                                      [key]: isChecked
                                                    }));
                                                    if (isChecked) {
                                                      setAgentPriorities((prev) => {
                                                        const mid = names.filter(n => n !== 'Retrieval' && n !== 'Assessment' && (selectedAgents[n] || (n === key))).filter(Boolean);
                                                        const used = new Set<number>(mid.map(n => prev[n]).filter((v): v is number => typeof v === 'number'));
                                                        let p = 2;
                                                        while (used.has(p)) p++;
                                                        return { ...prev, [key]: p };
                                                      });
                                                    }
                                                  }
                                                  : undefined
                                              }
                                            />
                                          </TableCell>
                                          <TableCell className="py-4">
                                            {currentP && (
                                              <div className="flex items-center gap-2">
                                                <div className="min-w-10 text-center bg-gray-100 px-3 py-2 rounded border border-gray-300">
                                                  {currentP}
                                                </div>
                                              </div>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    });
                                  })()}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                        <div className="flex justify-end mt-4">
                          <Button
                            onClick={handleAddAgents}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            disabled={!selectedOrganization || !selectedApp || agentConfigLoading}
                          >
                            Tag Agents
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : isCreatingStudyLO ? (
                // ----- CREATE STUDY LO (full ported block from abc.tsx) -----
                <>
                  {/* Select Book Card - Full Width */}
                  <Card className="border-2 border-blue-100 bg-blue-50">
                    <CardContent className="p-6 space-y-3">
                      <h3 className="text-lg font-semibold text-blue-900">Select Book</h3>
                      <Popover
                        open={studyLoBookOpen}
                        onOpenChange={(open) => {
                          setStudyLoBookOpen(open);
                          setStudyLoBookSearch("");
                          if (open) {
                            setSelectedBook("");
                            setSelectedBookId(null);
                            setTimeout(() => studyLoBookInputRef.current?.focus(), 0);
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <div className="relative w-full">
                            <Input
                              ref={studyLoBookInputRef}
                              value={studyLoBookOpen
                                ? studyLoBookSearch
                                : (selectedBook
                                  ? (booksOptions.find((b) => b.value === selectedBook)?.label || selectedBook)
                                  : "")}
                              placeholder={booksLoading ? "Loading books..." : "Choose a book"}
                              readOnly={!studyLoBookOpen}
                              disabled={booksLoading}
                              onClick={() => {
                                if (!booksLoading) {
                                  setSelectedBook("");
                                  setSelectedBookId(null);
                                  setStudyLoBookOpen(true);
                                }
                              }}
                              onChange={(e) => {
                                if (!studyLoBookOpen) setStudyLoBookOpen(true);
                                setStudyLoBookSearch(e.target.value);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setStudyLoBookOpen(false);
                                  setStudyLoBookSearch("");
                                }
                              }}
                              className="w-full pr-10 bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                              onClick={(e) => {
                                e.preventDefault();
                                if (booksLoading) return;
                                setStudyLoBookOpen((prev) => {
                                  const next = !prev;
                                  if (!next) setStudyLoBookSearch("");
                                  return next;
                                });
                              }}
                              tabIndex={-1}
                            >
                              <ChevronDown className="h-4 w-4 opacity-50" />
                            </button>
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 mt-1" align="start" sideOffset={6}>
                          <Command>
                            <CommandList className="max-h-40 overflow-y-auto">
                              <CommandEmpty>No books found.</CommandEmpty>
                              <CommandGroup>
                                {(() => {
                                  const q = studyLoBookSearch.trim().toLowerCase();
                                  const list = q
                                    ? booksOptions.filter((b) => String(b.label || '').toLowerCase().includes(q))
                                    : booksOptions;
                                  return list.map((book) => (
                                    <CommandItem
                                      key={book.value}
                                      value={book.label}
                                      onSelect={() => {
                                        setSelectedBook(book.value);
                                        setSelectedBookId(book.bookId ?? null);
                                        setIsAddingNewChapterLO(false);
                                        setEditingChapterLOIndex(null);
                                        setEditingChapterLOBackup(null);
                                        if (book.bookId) fetchChapterLODetails(book.bookId);
                                        setStudyLoBookOpen(false);
                                        setStudyLoBookSearch("");
                                      }}
                                    >
                                      {book.label}
                                    </CommandItem>
                                  ));
                                })()}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {booksError && (
                        <p className="text-sm text-red-600 mt-1">{booksError}</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Organization and Apps Details - Same Row */}
                  <div className="flex flex-col lg:flex-row gap-4">
                    {/* Select Organization Card */}
                    <Card className="border-2 border-purple-100 bg-purple-50 flex-1">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-purple-900">Select Organization</h3>
                        <Select
                          value={selectedOrganization ?? ''}
                          onValueChange={(value) => {
                            setSelectedOrganization(value);
                            setSelectedApp(null);
                            setAppsOptions([]);
                            // Fetch apps when organization changes
                            if (value && selectedCustomerCode) {
                              setTimeout(() => fetchAppsData(), 0);
                            }
                          }}
                          disabled={organizationLocked || organizationLoading || !selectedCustomerCode || !selectedBook}
                        >
                          <SelectTrigger className="bg-white border-purple-200 focus:border-purple-400 focus:ring-purple-400/20">
                            <SelectValue placeholder={organizationLoading ? "Loading organizations..." : selectedBook ? "Select an organization" : "Please select a book first"} />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            {organizationOptions.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {organizationLoading && (
                          <p className="text-sm text-purple-600 mt-1">Loading organizations...</p>
                        )}
                      </CardContent>
                    </Card>
                    {/* Apps Details Card */}
                    <Card className="border-2 border-indigo-100 bg-indigo-50 flex-1">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-indigo-900">Apps Details</h3>
                        <Select
                          value={selectedApp ?? ''}
                          onValueChange={setSelectedApp}
                          onOpenChange={(open) => {
                            if (open && !appsLoading) fetchAppsData();
                          }}
                          disabled={appsLoading || !selectedOrganization}
                        >
                          <SelectTrigger className="bg-white border-indigo-200 focus:border-indigo-400 focus:ring-indigo-400/20">
                            <SelectValue placeholder={appsLoading ? "Loading apps..." : (!selectedOrganization ? "Select an organization first" : "Select an app")} />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            {appsOptions.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {appsLoading && (
                          <p className="text-sm text-indigo-600 mt-1">Loading apps...</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Agent Configuration Card */}
                  {selectedOrganization && selectedApp && (
                    <Card className="border-2 border-purple-100 bg-purple-50">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-purple-600 text-white rounded-lg">
                            <Bot className="h-5 w-5" />
                          </div>
                          <h3 className="text-lg font-semibold text-purple-800">Agent Configuration</h3>
                        </div>
                        {agentConfigLoading && (
                          <div className="flex items-center justify-center py-8">
                            <svg className="animate-spin h-8 w-8 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            <span className="ml-2 text-purple-700">Loading agent configuration...</span>
                          </div>
                        )}
                        {agentConfigError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-700">{agentConfigError}</p>
                          </div>
                        )}
                        {!agentConfigLoading && (
                          <div className="bg-white rounded-lg border-2 border-purple-200 overflow-hidden">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-purple-50 border-b-2 border-purple-200 hover:bg-purple-50">
                                    <TableHead className="font-semibold text-purple-900 py-4">Agent Name</TableHead>
                                    <TableHead className="font-semibold text-purple-900 py-4">Select</TableHead>
                                    <TableHead className="font-semibold text-purple-900 py-4">Priority</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(() => {
                                    // Names from API
                                    const names = availableAgents.map(a => String(a.agentname));
                                    // Determine selected middle agents and sort by configured priorities
                                    const middleSelected = names.filter(n => n !== 'Retrieval' && n !== 'Assessment' && (selectedAgents[n] || false));
                                    const middleSorted = [...middleSelected].sort((a, b) => {
                                      const ap = agentPriorities[a] ?? 99;
                                      const bp = agentPriorities[b] ?? 99;
                                      return ap - bp;
                                    });
                                    const finalOrder = ['Retrieval', ...middleSorted, 'Assessment'];
                                    const displayPriority: Record<string, number | null> = {};
                                    finalOrder.forEach((k, idx) => { displayPriority[k] = idx + 1; });

                                    const agentList = names.map(key => ({ key, editable: true }));
                                    return agentList.map(({ key, editable }) => {
                                      const isFixed = key === 'Retrieval' || key === 'Assessment';
                                      const isSelected = isFixed ? true : !!selectedAgents[key];
                                      const currentP = displayPriority[key] || null;
                                      const maxMiddle = middleSorted.length + 1; // last middle priority
                                      const canEditPriority = !isFixed && isSelected && currentP !== null;
                                      return (
                                        <TableRow key={key} className="hover:bg-purple-50/50 transition-colors border-b border-purple-100">
                                          <TableCell className="font-medium text-gray-900 py-4">{key}</TableCell>
                                          <TableCell className="py-4">
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              disabled={isFixed || !editable}
                                              title={isFixed ? "Default agent - always enabled" : editable ? "" : "Always enabled"}
                                              className="h-4 w-4 text-purple-600 border-gray-300 rounded disabled:opacity-50"
                                              onChange={
                                                editable && !isFixed
                                                  ? (e) => {
                                                    const isChecked = e.target.checked;
                                                    setSelectedAgents((prev) => ({
                                                      ...prev,
                                                      [key]: isChecked
                                                    }));
                                                    if (isChecked) {
                                                      // Assign next available middle priority if missing
                                                      setAgentPriorities((prev) => {
                                                        const mid = names.filter(n => n !== 'Retrieval' && n !== 'Assessment' && (selectedAgents[n] || (n === key))).filter(Boolean);
                                                        const used = new Set<number>(mid.map(n => prev[n]).filter((v): v is number => typeof v === 'number'));
                                                        let p = 2;
                                                        while (used.has(p)) p++;
                                                        return { ...prev, [key]: p };
                                                      });
                                                    }
                                                  }
                                                  : undefined
                                              }
                                            />
                                          </TableCell>
                                          <TableCell className="py-4">
                                            {currentP && (
                                              <div className="flex items-center gap-2">
                                                <div className="min-w-10 text-center bg-gray-100 px-3 py-2 rounded border border-gray-300">
                                                  {currentP}
                                                </div>
                                              </div>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    });
                                  })()}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                        <div className="flex justify-end mt-4">
                          <Button
                            onClick={handleAddAgents}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            disabled={agentConfigLoading}
                          >
                            Tag Agents
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {/* Chapter & LO Details Card */}
                  <Card className="border-2 border-green-100 bg-green-50">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-600 text-white rounded-lg">
                            <BookOpen className="h-5 w-5" />
                          </div>
                          <h3 className="text-lg font-semibold text-green-800">Chapter & LO Details</h3>
                        </div>
                        {chapterLODetails.length > 0 && (
                          <button
                            onClick={() => {
                              setPendingChapterLODelete({ deleteAll: true });
                              setShowChapterLODeleteDialog(true);
                            }}
                            disabled={chapterLODeleteLoading}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete All"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      {chapterLOLoading && (
                        <div className="flex items-center justify-center py-8">
                          <svg className="animate-spin h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                          </svg>
                          <span className="ml-2 text-green-700">Loading chapter details...</span>
                        </div>
                      )}
                      {chapterLOError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <p className="text-red-700">{chapterLOError}</p>
                        </div>
                      )}
                      {!chapterLOLoading && !chapterLOError && chapterLODetails.length > 0 && (
                        <div className="bg-white rounded-lg border-2 border-blue-200 overflow-hidden">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-blue-50 border-b-2 border-blue-200 hover:bg-blue-50">
                                  <TableHead className="font-semibold text-blue-900 py-4">Chapter Name</TableHead>
                                  <TableHead className="font-semibold text-blue-900 py-4">LO Name</TableHead>
                                  <TableHead className="font-semibold text-blue-900 py-4">Page Number</TableHead>
                                  <TableHead className="font-semibold text-blue-900 py-4">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {chapterLODetails.map((item, index) => (
                                  <TableRow key={index} className="hover:bg-blue-50/50 transition-colors border-b border-blue-100 last:border-b-0">
                                    <TableCell className="font-medium text-gray-900 py-4">
                                      {editingChapterLOIndex === index ? (
                                        <Input
                                          value={String(item.chaptername || item.chapter_name || '')}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            setChapterLODetails(prev =>
                                              prev.map((r, i) => i === index ? { ...r, chaptername: value } : r)
                                            );
                                          }}
                                          className="w-full bg-white"
                                        />
                                      ) : (
                                        item.chaptername || ''
                                      )}
                                    </TableCell>
                                    <TableCell className="text-gray-700 py-4">
                                      {editingChapterLOIndex === index ? (
                                        <Input
                                          value={String(item.learningoutcomename || item.loname || item.lo_name || '')}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            setChapterLODetails(prev =>
                                              prev.map((r, i) => i === index ? { ...r, learningoutcomename: value } : r)
                                            );
                                          }}
                                          className="w-full bg-white"
                                        />
                                      ) : (
                                        item.learningoutcomename || ''
                                      )}
                                    </TableCell>
                                    <TableCell className="text-gray-700 py-4">
                                      {editingChapterLOIndex === index ? (
                                        <Input
                                          value={String(item.pagenumber || item.page_number || '')}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            setChapterLODetails(prev =>
                                              prev.map((r, i) => i === index ? { ...r, pagenumber: value } : r)
                                            );
                                          }}
                                          className="w-full bg-white"
                                        />
                                      ) : (
                                        item.pagenumber || ''
                                      )}
                                    </TableCell>
                                    <TableCell className="py-4">
                                      <div className="flex items-center gap-2">
                                        {editingChapterLOIndex === index ? (
                                          <>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              title="Save"
                                              className="h-9 w-9 hover:bg-green-100"
                                              onClick={() => {
                                                const currentItem = chapterLODetails[index];
                                                if (currentItem.isNew) {
                                                  saveNewChapterLO(currentItem);
                                                } else {
                                                  updateChapterLO(currentItem);
                                                }
                                              }}
                                              disabled={chapterLOLoading}
                                            >
                                              <Save className="h-4 w-4 text-green-600" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              title="Cancel"
                                              className="h-9 w-9 hover:bg-gray-100"
                                              onClick={() => {
                                                const currentItem = chapterLODetails[index];
                                                if (currentItem.isNew) {
                                                  // Remove the new row from state
                                                  setChapterLODetails(prev => prev.filter((_, i) => i !== index));
                                                  setIsAddingNewChapterLO(false);
                                                } else if (editingChapterLOBackup) {
                                                  // Restore the original row for existing rows
                                                  setChapterLODetails(prev =>
                                                    prev.map((r, i) => i === index ? { ...editingChapterLOBackup } : r)
                                                  );
                                                }
                                                setEditingChapterLOIndex(null);
                                                setEditingChapterLOBackup(null);
                                              }}
                                            >
                                              <X className="h-4 w-4 text-gray-600" />
                                            </Button>
                                          </>
                                        ) : (
                                          <>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              title="Edit"
                                              className="h-9 w-9 hover:bg-blue-100"
                                              onClick={() => {
                                                if (chapterLOLoading) return;
                                                // If there's a new row being added, remove it first
                                                if (isAddingNewChapterLO) {
                                                  setChapterLODetails(prev => prev.filter(item => !item.isNew));
                                                  setIsAddingNewChapterLO(false);
                                                }
                                                setEditingChapterLOBackup(JSON.parse(JSON.stringify(item)));
                                                setEditingChapterLOIndex(index);
                                              }}
                                            >
                                              <Edit className="h-4 w-4 text-blue-600" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              title="Delete"
                                              className="h-9 w-9 hover:bg-red-100"
                                              onClick={() => {
                                                if (item.isNew) {
                                                  // Remove new row directly without confirmation dialog
                                                  setChapterLODetails(prev => prev.filter((_, i) => i !== index));
                                                  setIsAddingNewChapterLO(false);
                                                  setEditingChapterLOIndex(null);
                                                } else {
                                                  // Show confirmation dialog for existing rows
                                                  setPendingChapterLODelete(item);
                                                  setShowChapterLODeleteDialog(true);
                                                }
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4 text-red-600" />
                                            </Button>
                                          </>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                      {/* Add new row button */}
                      {!chapterLOLoading && !chapterLOError && chapterLODetails.length > 0 && selectedBook && (
                        <div className="flex justify-center mt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addNewChapterLO}
                            disabled={isAddingNewChapterLO || chapterLOLoading}
                            className="flex items-center gap-2 border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400"
                          >
                            <Plus className="h-4 w-4" />
                            Add New Row
                          </Button>
                        </div>
                      )}
                      {!chapterLOLoading && !chapterLOError && chapterLODetails.length === 0 && selectedBook && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                          <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600">No chapter & LO details found for the selected book.</p>
                        </div>
                      )}
                      {!selectedBook && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                          <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600">Please select a book to view chapter & LO details.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  {/* Upload Study LO Documents Card */}
                  <Card className="border-2 border-teal-100 bg-teal-50">
                    <CardContent className="p-6 space-y-3">
                      <h3 className="text-lg font-semibold text-teal-900">Upload Study LO Documents</h3>
                      <div className={`bg-white border-2 border-dashed rounded-lg p-12 text-center space-y-4 transition-colors cursor-pointer ${isDraggingStudyLO
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-teal-200 hover:border-teal-300'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.csv';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                              if (!isStudyLOCsvFile(file)) {
                                toast({
                                  title: 'Invalid File Type',
                                  description: 'Please upload a CSV file only.',
                                  variant: 'destructive'
                                });
                                return;
                              }
                              if (file.size > STUDY_LO_MAX_BYTES) {
                                toast({
                                  title: 'File Too Large',
                                  description: 'File should not exceed 30MB.',
                                  variant: 'destructive'
                                });
                                return;
                              }
                              setStudyLODocuments([file]);
                              parseStudyLOCSV(file);
                            }
                          };
                          input.click();
                        }}>
                        <div className="flex justify-center">
                          <div className={`p-4 rounded-lg transition-colors ${isDraggingStudyLO ? 'bg-blue-200' : 'bg-yellow-100'
                            }`}>
                            <FileText className={`h-10 w-10 transition-colors ${isDraggingStudyLO ? 'text-blue-600' : 'text-yellow-600'
                              }`} />
                          </div>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-lg">
                            {isDraggingStudyLO ? 'Drop file here' : 'Drag file here or click to select file'}
                          </p>
                          <p className="text-sm text-gray-600 mt-2">
                            Attach study LO document (CSV), file should not exceed 30mb
                          </p>
                        </div>
                      </div>
                      {studyLODocuments.length > 0 && (
                        <div className="bg-white border border-teal-200 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileText className="h-8 w-8 text-teal-600" />
                              <div>
                                <p className="font-medium text-gray-900">{studyLODocuments[0].name}</p>
                                <p className="text-sm text-gray-500">{formatFileSize(studyLODocuments[0].size)}</p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setStudyLODocuments([]);
                                setStudyLOPreview([]);
                              }}
                              className="text-red-600 hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  {/* Preview Section */}
                  {studyLOPreview.length > 0 && (
                    <Card className="border-2 border-orange-100 bg-orange-50">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-orange-600 text-white rounded-lg">
                            <Eye className="h-5 w-5" />
                          </div>
                          <h3 className="text-lg font-semibold text-orange-800">Preview</h3>
                          <span className="bg-orange-100 text-orange-800 text-sm font-medium px-3 py-1 rounded-full">
                            {studyLOPreview.length} items
                          </span>
                        </div>
                        <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-orange-50 border-b-2 border-orange-200 hover:bg-orange-50">
                                  <TableHead className="font-semibold text-orange-900 py-4">Study Name</TableHead>
                                  <TableHead className="font-semibold text-orange-900 py-4">Learning Outcome Name</TableHead>
                                  <TableHead className="font-semibold text-orange-900 py-4">Page Number</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {studyLOPreview.map((item, index) => (
                                  <TableRow key={index} className="hover:bg-orange-50/50 transition-colors border-b border-orange-100 last:border-b-0">
                                    <TableCell className="font-medium text-gray-900 py-4">
                                      {item.studyName}
                                    </TableCell>
                                    <TableCell className="text-gray-700 py-4">
                                      {item.learningOutcomeName}
                                    </TableCell>
                                    <TableCell className="text-gray-700 py-4">
                                      {item.pageNumber}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {/* Action Buttons Card */}
                  <Card className="border-2 border-gray-200 bg-white">
                    <CardContent className="p-6">
                      <div className="flex justify-end">
                        <Button
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          disabled={!selectedBook || studyLODocuments.length === 0}
                          onClick={handleStudyLOSubmit}
                        >
                          Submit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : isCreating ? (
                /* Create Form */
                <>
                  {/* Level Type Selection Card */}
                  <Card className="border-2 border-purple-100 bg-purple-50">
                    <CardContent className="p-6">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-purple-800">Select Knowledge Base Type</h3>
                        <p className="text-sm text-purple-600 mt-1">Choose how you want to organize your knowledge base</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Book Level Option */}
                        <button
                          onClick={() => setLevelType("book")}
                          className={`relative p-3 rounded-lg border-2 text-left transition-all ${levelType === "book"
                              ? "border-purple-600 bg-white shadow-md"
                              : "border-purple-200 bg-white hover:border-purple-300"
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${levelType === "book"
                                ? "bg-purple-600 text-white"
                                : "bg-purple-100 text-purple-600"
                              }`}>
                              <Library className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <h4 className={`font-semibold transition-colors ${levelType === "book" ? "text-purple-900" : "text-gray-900"
                                }`}>
                                Book Level
                              </h4>
                            </div>
                            {levelType === "book" && (
                              <div className="absolute top-3 right-3">
                                <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </div>
                        </button>

                        {/* Study Level Option */}
                        <button
                          onClick={() => setLevelType("study")}
                          className={`relative p-3 rounded-lg border-2 text-left transition-all ${levelType === "study"
                              ? "border-purple-600 bg-white shadow-md"
                              : "border-purple-200 bg-white hover:border-purple-300"
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${levelType === "study"
                                ? "bg-purple-600 text-white"
                                : "bg-purple-100 text-purple-600"
                              }`}>
                              <GraduationCap className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <h4 className={`font-semibold transition-colors ${levelType === "study" ? "text-purple-900" : "text-gray-900"
                                }`}>
                                Study Level
                              </h4>
                            </div>
                            {levelType === "study" && (
                              <div className="absolute top-3 right-3">
                                <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </div>
                        </button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Organization and Apps Selection */}
                  <Card className="border-2 border-blue-100 bg-blue-50">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-600 text-white rounded-lg">
                          <Library className="h-5 w-5" />
                        </div>
                        <h3 className="text-lg font-semibold text-blue-800">Organization and Apps</h3>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Organization Select */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-blue-900">Select Organization <span className="text-red-500">*</span></label>
                          <Select value={selectedOrganization ?? ''} onValueChange={(v) => setSelectedOrganization(v)} disabled={organizationLocked || organizationLoading || !selectedCustomerCode}>
                            <SelectTrigger className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20 disabled:opacity-50 disabled:cursor-not-allowed" disabled={organizationLocked || organizationLoading || !selectedCustomerCode}>
                              <SelectValue placeholder={organizationLoading ? "Loading organizations..." : "Select an organization"} />
                            </SelectTrigger>
                            <SelectContent className="bg-white z-50">
                              {organizationOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Apps Select */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-blue-900">Apps Details <span className="text-red-500">*</span></label>
                          <Select
                            value={selectedApp ?? ''}
                            onValueChange={(v) => setSelectedApp(v)}
                            onOpenChange={(open) => {
                              if (open && !appsLoading) fetchAppsData();
                            }}
                          >
                            <SelectTrigger
                              className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20 disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={appsLoading || !selectedOrganization}
                            >
                              <SelectValue placeholder={appsLoading ? "Loading apps..." : (!selectedOrganization ? "Select an organization first" : "Select an app")} />
                            </SelectTrigger>
                            <SelectContent className="bg-white z-50">
                              {appsOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Basic Information Card */}
                  <Card className="border-2 border-blue-100 bg-blue-50">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-600 text-white rounded-lg">
                          <FileText className="h-5 w-5" />
                        </div>
                        <h3 className="text-lg font-semibold text-blue-800">Basic Information</h3>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-blue-900">
                            {levelType === "book" ? "Book Name" : "Book"} <span className="text-red-500">*</span>
                          </label>
                          {levelType === "book" ? (
                            <>
                              <Input
                                id="book-name-input"
                                placeholder="Enter Book name"
                                className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                                value={bookName}
                                onChange={e => {
                                  setBookName(e.target.value);
                                  const val = e.target.value.trim();
                                  const len = val.length;
                                  const allowed = /^[A-Za-z0-9][A-Za-z0-9._-]{1,510}[A-Za-z0-9]$/;
                                  if (len === 0) setBookNameFormatError(null);
                                  else if (len < 3 || len > 512)
                                    setBookNameFormatError('Name must be 3-512 characters. Allowed: letters, numbers, ., _, - and must start/end with a letter or number.');
                                  else if (!allowed.test(val))
                                    setBookNameFormatError('Only [a-zA-Z0-9._-] allowed; must start and end with [a-Za-z0-9]. No spaces.');
                                  else setBookNameFormatError(null);
                                }}
                                disabled={!selectedOrganization || !selectedApp}
                              />
                              {bookNameFormatError && (
                                <div style={{ minHeight: 16 }}>
                                  <span className="text-xs text-red-600">{bookNameFormatError}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <Select value={bookName} onValueChange={(value) => {
                              const opt = bookLovOptions.find(o => o.value === value);
                              setBookName(value);
                              const id = opt?.bookid ?? null;
                              setSelectedBookId(id);
                              setStudyLevel("");
                              if (id) fetchStudyLov(id);
                            }}>
                              <SelectTrigger className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20 disabled:opacity-50 disabled:cursor-not-allowed" disabled={bookLovLoading || !selectedOrganization || !selectedApp}>
                                <SelectValue placeholder={bookLovLoading ? "Loading books..." : "Select a book"} />
                              </SelectTrigger>
                              <SelectContent className="bg-white z-30 max-h-60 overflow-y-auto">
                                {bookLovOptions.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-blue-900">
                            {levelType === "book" ? "Knowledge Base Name" : "Study"} <span className="text-red-500">*</span>
                          </label>
                          {levelType === "book" ? (
                            <>
                              <Input
                                id="kb-name-input"
                                placeholder="Enter knowledge base name"
                                className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                                value={kbNameInput}
                                onChange={e => {
                                  setKbNameInput(e.target.value);
                                  const val = e.target.value.trim();
                                  const len = val.length;
                                  const allowed = /^[A-Za-z0-9][A-Za-z0-9._-]{1,510}[A-Za-z0-9]$/;
                                  if (len === 0) setKbNameFormatError(null);
                                  else if (len < 3 || len > 512)
                                    setKbNameFormatError('Name must be 3-512 characters. Allowed: letters, numbers, ., _, - and must start/end with a letter or number.');
                                  else if (!allowed.test(val))
                                    setKbNameFormatError('Only [a-zA-Z0-9._-] allowed; must start and end with [a-Za-z0-9]. No spaces.');
                                  else setKbNameFormatError(null);

                                  setKbNameCheckStatus("unknown");
                                  setKbNameCheckMsg("");
                                  if (kbNameCheckTimer) clearTimeout(kbNameCheckTimer);
                                }}
                                disabled={!selectedOrganization || !selectedApp}
                              />
                              <div style={{ minHeight: 16 }}>
                                {kbNameFormatError ? (
                                  <span className="text-xs text-red-600">{kbNameFormatError}</span>
                                ) : kbNameCheckStatus === "checking" ? (
                                  <span className="text-xs text-blue-600">Checking...</span>
                                ) : kbNameCheckStatus === "exists" ? (
                                  <span className="text-xs text-red-600">{kbNameCheckMsg}</span>
                                ) : kbNameCheckStatus === "not_exists" ? (
                                  <span className="text-xs text-green-700">{kbNameCheckMsg}</span>
                                ) : kbNameCheckStatus === "error" ? (
                                  <span className="text-xs text-orange-600">{kbNameCheckMsg}</span>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <Select disabled={!bookName || studyLovOptions.length === 0} value={studyLevel} onValueChange={setStudyLevel}>
                              <SelectTrigger className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!selectedOrganization || !selectedApp || !bookName || studyLovLoading}>
                                <SelectValue placeholder={studyLovLoading ? "Loading chapters..." : (studyLovOptions.length === 0 ? "No study to select" : "Select a study")} />
                              </SelectTrigger>
                              <SelectContent className="bg-white z-30 max-h-60 overflow-y-auto">
                                {studyLovOptions.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Upload Section Card */}
                  <Card className="border-2 border-teal-100 bg-teal-50">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-teal-600 text-white rounded-lg">
                          <FileText className="h-5 w-5" />
                        </div>
                        <h3 className="text-lg font-semibold text-teal-800">File Uploads</h3>
                      </div>

                      <div className={`grid ${levelType === "book" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"} gap-6`}>
                        <div className="space-y-2 flex-1">
                          <label className="text-sm font-medium text-teal-900">
                            Document Upload <span className="text-red-500">*</span>
                          </label>
                          <label
                            className={`block bg-white border-2 border-dashed rounded-lg p-8 text-center space-y-3 transition-colors cursor-pointer h-[200px] flex flex-col items-center justify-center ${isDraggingDocument
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-teal-200 hover:border-teal-300'
                              }`}
                            onDragOver={handleDocumentDragOver}
                            onDragLeave={handleDocumentDragLeave}
                            onDrop={handleDocumentDrop}
                          >
                            <input
                              type="file"
                              multiple
                              accept=".pdf,.docx,.txt"
                              onChange={handleDocumentUpload}
                              className="hidden"
                            />
                            <div className="flex justify-center">
                              <div className={`p-3 rounded-lg transition-colors ${isDraggingDocument ? 'bg-blue-200' : 'bg-teal-100'
                                }`}>
                                <FileText className={`h-8 w-8 transition-colors ${isDraggingDocument ? 'text-blue-600' : 'text-teal-600'
                                  }`} />
                              </div>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {isDraggingDocument ? 'Drop files here' : 'Drag files here or click to select files'}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                Upload PDF, DOCX, TXT files up to 50 MB.
                              </p>
                            </div>
                          </label>

                          {documentFiles.length > 0 && (
                            <div className="bg-white border border-teal-200 rounded-lg p-4 space-y-2">
                              <p className="text-sm font-medium text-gray-900 mb-2">{documentFiles.length} file(s) uploaded:</p>
                              {documentFiles.map((file, index) => (
                                <div key={index} className="flex items-center justify-between bg-teal-50 px-3 py-2 rounded">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <FileText className="h-4 w-4 text-teal-600 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 truncate">{file.name}</span>
                                    <span className="text-xs text-gray-500 flex-shrink-0">
                                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeDocumentFile(index)}
                                    className="h-7 w-7 flex-shrink-0 hover:bg-red-100 ml-2"
                                  >
                                    <X className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {levelType === "book" && (
                          <div className="space-y-2 flex-1">
                            <label className="text-sm font-medium text-teal-900">Cover Image Upload</label>
                            <label
                              className={`block bg-white border-2 border-dashed rounded-lg p-8 text-center space-y-3 transition-colors cursor-pointer h-[200px] flex flex-col items-center justify-center ${isDraggingImage
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-teal-200 hover:border-teal-300'
                                }`}
                              onDragOver={handleImageDragOver}
                              onDragLeave={handleImageDragLeave}
                              onDrop={handleImageDrop}
                              htmlFor="cover-image-input"
                            >
                              <input
                                id="cover-image-input"
                                type="file"
                                accept="image/png,image/jpeg,image/jpg"
                                onChange={handleCoverImageUpload}
                                className="hidden"
                              />
                              <div className="flex justify-center">
                                <div className={`p-3 rounded-lg transition-colors ${isDraggingImage ? 'bg-blue-200' : 'bg-teal-100'
                                  }`}>
                                  <FileText className={`h-8 w-8 transition-colors ${isDraggingImage ? 'text-blue-600' : 'text-teal-600'
                                    }`} />
                                </div>
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">
                                  {isDraggingImage ? 'Drop image here' : 'Drag images here or click to select images'}
                                </p>
                                <p className="text-sm text-gray-600 mt-1">
                                  Recommended: 800x400px (2:1 ratio) • PNG, JPEG • Max 10 MB
                                </p>
                              </div>
                            </label>

                            {coverImage && (
                              <div className="bg-white border border-teal-200 rounded-lg p-4">
                                <p className="text-sm font-medium text-gray-900 mb-2">Uploaded image:</p>
                                <div className="flex items-center justify-between bg-teal-50 px-3 py-2 rounded">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <FileText className="h-4 w-4 text-teal-600 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 truncate">{coverImage.name}</span>
                                    <span className="text-xs text-gray-500 flex-shrink-0">
                                      ({(coverImage.size / 1024 / 1024).toFixed(2)} MB)
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={removeCoverImage}
                                    className="h-7 w-7 flex-shrink-0 hover:bg-red-100 ml-2"
                                  >
                                    <X className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Processing Settings Card */}
                  <Card className="border-2 border-orange-100 bg-orange-50">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-orange-600 text-white rounded-lg">
                          <Search className="h-5 w-5" />
                        </div>
                        <h3 className="text-lg font-semibold text-orange-800">Processing Settings</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-orange-900 flex items-center gap-1">
                            Retrieval Strategy
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Retrieval Strategy decides how search results are ranked and selected</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </label>
                          <Select value={searchType} onValueChange={(v) => setSearchType(v as 'mmr' | 'similarity' | 'hybrid' || 'hybrid')}>
                            <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {retrievalOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-orange-900 flex items-center gap-1">
                            Number of K values
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Defines how many of the initially retrieved results are considered during retrieval (allowed range: 1–8). Smaller values are faster; larger are more thorough but slower.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </label>
                          <Input
                            type="number"
                            className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20"
                            value={rerankKInput}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') { setRerankKInput(''); setRerankK(0); return; }
                              const num = Number(raw.replace(/[^0-9]/g, ''));
                              if (Number.isNaN(num)) return;
                              const clamped = Math.min(8, Math.max(1, num));
                              setRerankKInput(String(clamped));
                              setRerankK(clamped);
                            }}
                            onBlur={() => {
                              if (rerankKInput === '' || Number(rerankKInput) < 1) { setRerankKInput('1'); setRerankK(1); }
                              else if (Number(rerankKInput) > 10) { setRerankKInput('10'); setRerankK(10); }
                            }}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-orange-900 flex items-center gap-1">
                            Chunk Size
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Defines how large each text segment is when splitting documents for retrieval. Smaller chunks give more precise matches but less context, larger chunks preserve more context but may include irrelevant material.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </label>
                          <Select value={chunkSize} onValueChange={(v) => setChunkSize(v || '1000')}>
                            <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {chunkSizeOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-orange-900 flex items-center gap-1">
                            Overlap Percentage
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Defines how much consecutive text chunks overlap when splitting documents. Higher overlap preserves more context across chunks but increases redundancy and processing cost.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </label>
                          <Select value={overlap} onValueChange={v => setOverlap(v || '20')}>
                            <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {overlapOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-orange-900 flex items-center gap-1">
                            Chunking Strategy
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Controls how documents are split into smaller parts for retrieval. Affects accuracy, context, and speed.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </label>
                          <Select value={chunkingStrategy} onValueChange={v => setChunkingStrategy(v || 'recursive')}>
                            <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {chunkingOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-orange-900 flex items-center gap-1">
                            Database Type
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Defines how data is stored for retrieval, impacting speed, scalability, and accuracy.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </label>
                          <Select value={vectorDb} onValueChange={v => setVectorDb(v || 'faiss')}>
                            <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {dbTypeOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-orange-900 flex items-center gap-1">
                            Embedding Model
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Converts text into vectors for similarity search</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </label>
                          <Select value={embeddingModel} onValueChange={v => setEmbeddingModel(v || 'text-embedding-ada-002')}>
                            <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {getFilteredEmbeddingOptions().map(o => (
                                <SelectItem
                                  key={o.value}
                                  value={o.value}
                                  disabled={o.disabled}
                                  className={o.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                                >
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Action Buttons Card */}
                  <Card className="border-2 border-gray-200 bg-white">
                    <CardContent className="p-6">
                      <div className="flex justify-end gap-3">
                        <Button
                          variant="outline"
                          onClick={() => {
                            clearCreateForm();
                            setIsCreating(false);
                          }}
                          className="border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </Button>
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreateKnowledgeBase}>
                          Create Knowledge Base
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Full-page loader during create submission */}
                  {createSubmitting && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/70">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        <span className="text-blue-700 font-medium">Creating Knowledge Base…</span>
                      </div>
                    </div>
                  )}

                  {/* Success dialog after create */}
                  {/* Moved outside conditional blocks to ensure it appears regardless of isCreating state */}
                </>
              ) : (
                <>
                  {/* Existing List View */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-purple-100">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-purple-600 text-white rounded-lg">
                            <Search className="h-5 w-5" />
                          </div>
                          <h2 className="text-xl font-semibold text-purple-800">Select Customer</h2>
                        </div>

                        <div className="relative customer-dropdown-container">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400 z-10" />
                          <div className="relative">
                            <Input
                              type="text"
                              value={customerSearchQuery}
                              onChange={(e) => handleCustomerInputChange(e.target.value)}
                              onClick={handleCustomerInputFocus}
                              placeholder={customersLoading ? "Loading..." : getSelectedCustomerName()}
                              className="w-full pl-10 bg-white border-purple-200 focus:border-purple-400 focus:ring-purple-400/20 cursor-pointer"
                              disabled={customersLoading || customerLocked}
                            />
                            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400" />
                          </div>

                          {showCustomerDropdown && !customersLoading && !customerLocked && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-purple-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                              {isSuperAdmin && (
                                <div
                                  className="px-3 py-2 cursor-pointer hover:bg-purple-50 border-b border-purple-100"
                                  onClick={() => handleCustomerSelect("_ALL", "All")}
                                >
                                  All
                                </div>
                              )}
                              {filteredCustomers.length > 0 ? (
                                filteredCustomers.map((customer: any) => (
                                  <div
                                    key={customer.customercode}
                                    className="px-3 py-2 cursor-pointer hover:bg-purple-50 border-b border-purple-100 last:border-b-0"
                                    onClick={() => handleCustomerSelect(customer.customercode, customer.customername)}
                                  >
                                    <div className="cursor-pointer">{customer.customername}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-gray-500 text-center">
                                  No customers found
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-purple-100">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-purple-600 text-white rounded-lg">
                            <Search className="h-5 w-5" />
                          </div>
                          <h2 className="text-xl font-semibold text-purple-800">Select Organization</h2>
                        </div>

                        <div className="relative org-dropdown-container">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400 z-10" />
                          <div className="relative">
                            <Input
                              type="text"
                              value={orgSearchQuery}
                              onChange={(e) => handleOrgInputChange(e.target.value)}
                              onClick={handleOrgInputFocus}
                              placeholder={organizationLoading ? "Loading..." : (orgSearchQuery || "Select Organization")}
                              className="w-full pl-10 bg-white border-purple-200 focus:border-purple-400 focus:ring-purple-400/20 cursor-pointer"
                              disabled={organizationLocked || organizationLoading || !selectedCustomerCode || selectedCustomerCode === '_ALL'}
                            />
                            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400" />
                          </div>

                          {showOrgDropdown && !organizationLoading && selectedCustomerCode && selectedCustomerCode !== '_ALL' && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-purple-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                              <div
                                className="px-3 py-2 cursor-pointer hover:bg-purple-50 border-b border-purple-100"
                                onClick={() => handleOrgSelect('', 'All')}
                              >
                                All
                              </div>
                              {(organizationOptions || []).filter(o => !orgSearchQuery.trim() || o.label.toLowerCase().includes(orgSearchQuery.toLowerCase())).map((org: any) => (
                                <div
                                  key={org.value}
                                  className="px-3 py-2 cursor-pointer hover:bg-purple-50 border-b border-purple-100 last:border-b-0"
                                  onClick={() => handleOrgSelect(org.value, org.label)}
                                >
                                  <div className="cursor-pointer">{org.label}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-purple-100">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-purple-600 text-white rounded-lg">
                            <Search className="h-5 w-5" />
                          </div>
                          <h2 className="text-xl font-semibold text-purple-800">Apps Details</h2>
                        </div>

                        <div className="relative app-dropdown-container">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400 z-10" />
                          <div className="relative">
                            <Input
                              type="text"
                              value={appSearchQuery}
                              onChange={(e) => handleAppInputChange(e.target.value)}
                              onClick={handleAppInputFocus}
                              placeholder={appsLoading ? "Loading..." : (appSearchQuery || "Select App")}
                              className="w-full pl-10 bg-white border-purple-200 focus:border-purple-400 focus:ring-purple-400/20 cursor-pointer"
                              disabled={appsLoading || !selectedCustomerCode || selectedCustomerCode === '_ALL' || (!selectedOrganization && !organizationLocked && !appSearchQuery)}
                            />
                            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-purple-400" />
                          </div>

                          {showAppDropdown && !appsLoading && selectedCustomerCode && selectedCustomerCode !== '_ALL' && ((selectedOrganization || organizationLocked) || !!appSearchQuery) && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-purple-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                              {(appsOptions || []).filter(a => !appSearchQuery.trim() || a.label.toLowerCase().includes(appSearchQuery.toLowerCase())).map((app: any) => (
                                <div
                                  key={app.value}
                                  className="px-3 py-2 cursor-pointer hover:bg-purple-50 border-b border-purple-100 last:border-b-0"
                                  onClick={() => handleAppSelect(app.value, app.label)}
                                >
                                  <div className="cursor-pointer">{app.label}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>


                  <div className="mt-4">
                    {customersLoading && <div className="text-xs text-gray-600">Loading customer list...</div>}
                    {customersError && <div className="text-xs text-red-600">{customersError}</div>}
                  </div>

                  {/* Knowledge Bases Card */}
                  <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-blue-100">
                    <CardContent className="p-6 space-y-6">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-600 text-white rounded-lg">
                            <FileText className="h-5 w-5" />
                          </div>
                          <h2 className="text-xl font-semibold text-blue-800">Knowledge Bases</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          
                          <Button
                            onClick={() => { fetchAppsData(); setIsCreating(true); }}
                            className="px-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
                            disabled={selectedCustomerCode === '_ALL'}
                            title={selectedCustomerCode === '_ALL' ? 'Disabled when All customers is selected' : ''}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Create New Knowledge Base
                          </Button>
                          <Button
                            onClick={() => setIsCreatingStudyLO(true)}
                            className="px-6 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white"
                            disabled={selectedCustomerCode === '_ALL'}
                            title={selectedCustomerCode === '_ALL' ? 'Disabled when All customers is selected' : ''}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Study LO
                          </Button>
                          <Button
                            onClick={() => {
                              setSelectedKBForGuidelines({ id: 0, name: "General Guideline" });
                              setGuidelineCreationType('new');
                              setIsViewingGuidelines(true);
                              clearGuidelinesState();
                            }}
                            className="bg-green-600 text-white hover:bg-green-700 transition-colors duration-300 ease-in-out shadow-md dark:bg-green-500 dark:hover:bg-green-600 mr-2"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Create New Guideline
                          </Button>
                        </div>
                      </div>

                      {/* Always show search and filter */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-blue-400 z-10" />
                          <Input
                            placeholder="Search knowledge bases..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                          />
                        </div>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                          <SelectTrigger className="w-full sm:w-40 bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            <SelectItem value="All" className="cursor-pointer">All Types</SelectItem>
                            <SelectItem value="Book Level" className="cursor-pointer">Book Level</SelectItem>
                            <SelectItem value="Study Level" className="cursor-pointer">Study Level</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Table */}
                      <div className="bg-white rounded-lg border-2 border-blue-200 overflow-hidden min-h-[150px]">
                        {kbLoading ? (
                          <div className="p-6 text-center text-blue-700 text-sm">Loading knowledge bases...</div>
                        ) : kbError ? (
                          <div className="p-6 text-center text-red-700 text-sm">{kbError}</div>
                        ) : filteredKnowledgeBases.length === 0 ? (
                          <div className="p-6 text-center">
                            <div className="flex flex-col items-center justify-center py-4">
                              <Search className="h-10 w-10 text-gray-400 mb-3" />
                              <h3 className="text-md font-medium text-gray-900 mb-1">
                                {searchQuery
                                  ? `No Knowledge Bases match your search.`
                                  : "No knowledge bases available for the selected customer."}
                              </h3>
                              {searchQuery && (
                                <p className="text-gray-500 text-sm">
                                  Try a different search term
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-blue-50 border-b border-gray-200">
                                  <TableHead className="font-semibold text-blue-900 py-4 px-4 border-r border-gray-200 w-64 min-w-64 max-w-64">
                                    Knowledge Base Name
                                  </TableHead>
                                  <TableHead className="font-semibold text-blue-900 py-4 px-4 border-r border-gray-200 w-48 min-w-48 max-w-48 hidden">
                                    Book Name
                                  </TableHead>
                                  <TableHead className="font-semibold text-blue-900 py-4 px-4 border-r border-gray-200 w-32 min-w-32 max-w-32 hidden">
                                    Type
                                  </TableHead>
                                  <TableHead className="font-semibold text-blue-900 py-4 px-4 w-40 min-w-40 max-w-40">
                                    Actions
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredKnowledgeBases.map((kb, idx) => (
                                  <TableRow key={kb.knowledgebase_id || idx} className="hover:bg-blue-50/50 transition-colors border-b border-gray-200 last:border-b-0">
                                    <TableCell className="text-gray-700 py-4 px-4 border-r border-gray-200 align-top">
                                      <div className="break-words max-w-xs">
                                        {kb.knowladgebasename || ""}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-gray-700 py-4 px-4 border-r border-gray-200 align-top hidden">
                                      <div className="break-words max-w-xs">
                                        {kb.soursename || ""}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-4 px-4 border-r border-gray-200 hidden">
                                      {kb.leveltype ? (
                                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                          {kb.leveltype}
                                        </span>
                                      ) : null}
                                    </TableCell>
                                    <TableCell className="py-4 px-4">
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Edit"
                                          className="h-9 w-9 hover:bg-blue-100 transition-colors"
                                          onClick={() => {
                                            navigate(`/edit-kb/${encodeURIComponent(kb.customercode)}/${encodeURIComponent(kb.knowladgebasename)}?orgCode=${encodeURIComponent(kb.organizationcode || "")}&appCode=${encodeURIComponent(kb.appcode || "")}&sourcename=${encodeURIComponent(kb.soursename || "")}`);
                                          }}
                                        >
                                          <Edit className="h-4 w-4 text-blue-600" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Guidelines"
                                          disabled={String(kb.leveltype || '').toLowerCase().includes('study')}
                                          className={`h-9 w-9 hidden hover:bg-purple-100 transition-colors ${String(kb.leveltype || '').toLowerCase().includes('study') ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                                          onClick={() => {
                                            if (String(kb.leveltype || '').toLowerCase().includes('study')) return;
                                            setSelectedKBForGuidelines({ id: kb.knowledgebase_id || idx, name: kb.knowladgebasename || "" });
                                            setIsViewingGuidelines(true);
                                            clearGuidelinesState();
                                          }}
                                        >
                                          <ScrollText className="h-4 w-4 text-purple-600" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Chat"
                                          className="h-9 w-9 hover:bg-teal-100 transition-colors"
                                          onClick={async () => {
                                            setChatMessages([]);
                                            setChatDetailsError(null);
                                            setChatDetailsLoading(true);
                                            setSelectedKBForChat({ id: kb.knowledgebase_id || idx, name: kb.knowladgebasename || "", bookName: kb.soursename || "" });
                                            // Fetch customer details
                                            let fetchedCustomer = null;
                                            try {
                                              // GET_CUSTOMER_DATA_SLASH returns .data array
                                              const res = await fetch(API_ENDPOINTS.GET_CUSTOMER_DATA_SLASH);
                                              if (res.ok) {
                                                const data = await res.json();
                                                if (Array.isArray(data.data)) {
                                                  fetchedCustomer = data.data.find((c) => c.customercode === kb.customercode);
                                                  setChatCustomerDetails(fetchedCustomer);
                                                }
                                              }
                                            } catch (e) {
                                              setChatCustomerDetails(null);
                                            }
                                            // Fetch KB details
                                            try {
                                              const payload = {
                                                custcode: kb.customercode,
                                                orgcode: kb.organizationcode || "",
                                                kbname: kb.knowladgebasename,
                                                appcode: kb.appcode || "",
                                                sourcename: "",
                                                book_id: String(sessionStorage.getItem('programCode')||'')
                                              };
                                              const res = await fetch(API_ENDPOINTS.GET_KB_DETAILS, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify(payload),
                                              });
                                              if (res.ok) {
                                                const data = await res.json();
                                                if (Array.isArray(data.data) && data.data.length > 0) {
                                                  setChatKbDetails(data.data[0]);
                                                  setChatDetailsLoading(false);
                                                  setIsChatMode(true);
                                                  return;
                                                }
                                              }
                                              setChatKbDetails(null);
                                              setChatDetailsError("Failed to load KB details");
                                            } catch (e) {
                                              setChatKbDetails(null);
                                              setChatDetailsError("Failed to load KB details");
                                            }
                                            setChatDetailsLoading(false);
                                          }}
                                        >
                                          <MessageSquare className="h-4 w-4 text-teal-600" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Tag Agents"
                                          disabled={String(kb.leveltype || '').toLowerCase().includes('study')}
                                          className={`hidden h-9 w-9 hover:bg-purple-100 transition-colors ${String(kb.leveltype || '').toLowerCase().includes('study') ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                                          onClick={() => {
                                            if (String(kb.leveltype || '').toLowerCase().includes('study')) return;
                                            setIsTaggingAgents(true);
                                            setSelectedKBForAgents({
                                              id: kb.knowledgebase_id || idx,
                                              name: kb.knowladgebasename || "",
                                              bookName: kb.soursename || "",
                                              customercode: kb.customercode,
                                              organizationcode: kb.organizationcode,
                                              appcode: kb.appcode,
                                            });
                                            setSelectedBook(kb.soursename || "");

                                            const nextCustomer = kb.customercode || "";
                                            const nextOrg = kb.organizationcode || "";
                                            const nextApp = kb.appcode || "";

                                            const applySelections = () => {
                                              setSelectedOrganization(nextOrg || null);
                                              // Ensure app is applied after org-change effect runs
                                              setTimeout(() => {
                                                setSelectedApp(nextApp || null);
                                              }, 0);
                                            };

                                            if (nextCustomer && nextCustomer !== selectedCustomerCode) {
                                              // Changing customer triggers effects that reset org/app; apply after a tick
                                              setSelectedCustomerCode(nextCustomer);
                                              setTimeout(() => {
                                                applySelections();
                                              }, 0);
                                            } else {
                                              applySelections();
                                            }
                                          }}
                                        >
                                          <Bot className="h-4 w-4 text-purple-600" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Delete"
                                          className="h-9 w-9 hover:bg-red-100 transition-colors"
                                          onClick={() => {
                                            setKbToDelete({
                                              id: kb.knowledgebase_id || idx,
                                              name: kb.knowladgebasename || "",
                                              bookName: kb.soursename || "",
                                              customercode: kb.customercode,
                                              organizationcode: kb.organizationcode,
                                              sourcename: kb.soursename || "",
                                              bookdetails_id: kb.bookdetails_id || null
                                            });
                                            setDeleteDialogOpen(true);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4 text-red-600" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </main>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-semibold text-gray-900">Delete Knowledge Base</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600 space-y-3">
                <p>Are you sure you want to delete this knowledge base?</p>
                <div className="mt-4 font-semibold text-red-700">
                  Warning: This action will permanently delete the knowledge base and all related content in Advance Item Generation.<br />
                  This cannot be undone.
                </div>
                {kbToDelete && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-900">Knowledge Base:</span>
                      <span className="text-gray-700">{kbToDelete.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-900">Book Name:</span>
                      <span className="text-gray-700">{kbToDelete.bookName}</span>
                    </div>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-gray-300 text-gray-700 hover:bg-gray-50">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={deleteKbLoading}
                onClick={async () => {
                  if (!kbToDelete) return;
                  try {
                    setDeleteKbLoading(true);
                    const payload = {
                      custcode: kbToDelete.customercode || "",
                      orgcode: kbToDelete.organizationcode || "",
                      kbname: kbToDelete.name || "",
                      soursename: kbToDelete.sourcename || "",
                      bookdetails_id: kbToDelete.bookdetails_id || null
                    };
                    const resp = await fetch(API_ENDPOINTS.DELETE_KB_DATAS, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    const json = await resp.json().catch(() => ({}));
                    if (!resp.ok || json?.status === 'error') {
                      toast && toast({
                        title: 'Delete Failed',
                        description: json?.message || json?.detail || 'Failed to delete knowledge base',
                        variant: 'destructive',
                      });
                      return;
                    }
                    toast && toast({ title: 'Deleted', description: 'Knowledge Base deleted successfully.' });
                    setDeleteDialogOpen(false);
                    setKbToDelete(null);
                    // refresh list
                    try {
                      const res = await fetch(buildExistingKbUrl(selectedCustomerCode, selectedOrganization, selectedApp));
                      const data = await res.json();
                      setKnowledgeBases(Array.isArray(data.data) ? data.data : []);
                    } catch { }
                  } catch (e) {
                    toast && toast({
                      title: 'Delete Failed',
                      description: e?.message || 'Failed to delete knowledge base',
                      variant: 'destructive',
                    });
                  } finally {
                    setDeleteKbLoading(false);
                  }
                }}
              >
                {deleteKbLoading ? 'Deleting…' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Chapter & LO Row Delete Dialog */}
        <AlertDialog open={showChapterLODeleteDialog} onOpenChange={setShowChapterLODeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-semibold text-gray-900">
                Confirm Deletion
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-700">
                {pendingChapterLODelete?.deleteAll
                  ? "Are you sure you want to delete all Chapter & LO details for this book?"
                  : "Are you sure you want to delete this Chapter & LO row?"
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setShowChapterLODeleteDialog(false);
                  setPendingChapterLODelete(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={chapterLODeleteLoading}
                onClick={async () => {
                  if (!pendingChapterLODelete?.deleteAll) {
                    await handleDeleteChapterLO();
                  } else {
                    await handleDeleteAllChapterLO();
                  }
                }}
              >
                {chapterLODeleteLoading ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Chapter & LO Success Dialog */}
        <AlertDialog open={showChapterLOSuccessDialog} onOpenChange={setShowChapterLOSuccessDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deleted</AlertDialogTitle>
              <AlertDialogDescription>
                {chapterLODeleteType === 'all'
                  ? "All Chapter & LO details for this book have been deleted successfully."
                  : "Chapter & LO row deleted successfully."
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                className="bg-blue-600 hover:bg-blue-700 text-white"
                autoFocus
                onClick={() => {
                  setShowChapterLOSuccessDialog(false);
                  setChapterLODeleteType(null);
                }}
              >
                Ok
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Guideline Delete Dialog */}
        <AlertDialog open={showGuidelineDeleteDialog} onOpenChange={setShowGuidelineDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Guideline</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete guideline{" "}
                <span style={{ fontWeight: 500, color: "#b91c1c" }}>
                  {guidelinePendingDelete?.guidelinename}
                </span>
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setShowGuidelineDeleteDialog(false);
                  setGuidelinePendingDelete(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={guidelinesLoading}
                onClick={async () => {
                  if (!guidelinePendingDelete) return;
                  try {
                    setGuidelinesLoading(true);
                    const delFormData = new FormData();
                    delFormData.append('par_kid', String(kbDetails.id));
                    delFormData.append('par_guidelinetype', guidelinePendingDelete.guidelinetype);
                    delFormData.append('par_guidelinename', guidelinePendingDelete.guidelinename);
                    const resp = await fetch(API_ENDPOINTS.DELETE_GUIDELINE, {
                      method: "POST",
                      body: delFormData,
                    });
                    const respJson = await resp.json().catch(() => ({}));
                    if (!resp.ok || respJson.status === 'error') {
                      toast && toast({
                        title: "Delete Failed",
                        description: respJson.message || "Failed to delete guideline",
                        variant: "destructive"
                      });
                      return;
                    }
                    // Optionally delete file from blob store if path exists
                    if (guidelinePendingDelete.guidelinepathurl) {
                      const blobFormData = new FormData();
                      blobFormData.append('guideline_path_url', guidelinePendingDelete.guidelinepathurl);
                      await fetch(API_ENDPOINTS.DELETE_GUIDELINE_DOCUMENT, {
                        method: "POST",
                        body: blobFormData,
                      });
                    }
                    setGuidelinePendingDelete(null);
                    setShowGuidelineDeleteDialog(false);

                    // Optimistically remove from local state so UI updates instantly
                    setAllGuidelines(prev => Array.isArray(prev)
                      ? prev.filter((g: any) => !(g?.guidelinename === guidelinePendingDelete?.guidelinename && g?.guidelinetype === guidelinePendingDelete?.guidelinetype))
                      : prev
                    );
                    setExistingGuidelines(prev => Array.isArray(prev)
                      ? prev.filter((g: any) => !(g?.guidelinename === guidelinePendingDelete?.guidelinename && g?.guidelinetype === guidelinePendingDelete?.guidelinetype))
                      : prev
                    );

                    // Clear edit form if the deleted guideline was being edited
                    if (isGuidelineEditing && editingGuidelineId === guidelinePendingDelete?.kbid) {
                      setIsGuidelineEditing(false);
                      setEditingGuidelineId(null);
                      setGuidelineType(null);
                      setGuidelineSubType(null);
                      setGuidelineName('');
                      setGuidelinesText('');
                      setGuidelineFile(null);
                      setPreviouslyUploadedFileName(null);
                    }

                    await handleRefreshGuidelines();

                    // Show success toast
                    toast && toast({
                      title: "Guideline Deleted",
                      description: "Guideline deleted successfully."
                    });
                  } catch (e) {
                    toast && toast({
                      title: "Delete Failed",
                      description: e?.message || "Failed to delete guideline",
                      variant: "destructive"
                    });
                  } finally {
                    setGuidelinesLoading(false);
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Previously Uploaded File Remove Confirm */}
        <AlertDialog open={showPrevFileDeleteDialog} onOpenChange={setShowPrevFileDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Document</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove the previously uploaded document{" "}
                <span style={{ fontWeight: 500, color: "#b91c1c" }}>
                  {previouslyUploadedFileName}
                </span>
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => setShowPrevFileDeleteDialog(false)}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  setPreviouslyUploadedFileName(null);
                  setShowPrevFileDeleteDialog(false);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Success dialog - moved outside conditional blocks to ensure it appears anytime successDialogOpen is true */}
        {successDialogOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl w-[90%] max-w-md p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-600 text-white rounded-lg">
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Success</h3>
              </div>
              <p className="text-gray-700 mb-5">{successDialogMessage}</p>
              <div className="flex justify-end gap-3">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    setSuccessDialogOpen(false);
                    setIsCreating(false);
                    setIsCreatingStudyLO(false);
                    setIsViewingGuidelines(false);
                    setSelectedKBForGuidelines(null);
                    setIsChatMode(false);
                    setSelectedKBForChat(null);
                    clearCreateForm();
                    clearGuidelinesState();
                  }}
                >
                  Okay
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};


export default KnowledgeBase;
