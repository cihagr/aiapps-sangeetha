import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
import { getKbAuthToken } from "../lib/kb-auth";
import { PageLoader } from "@/components/ui/loader";
import axios from "axios";
import { jwtVerify } from "jose";

const ManageKnowledgeBase = () => {
  const navigate = useNavigate();
  
  // Ref to prevent duplicate API calls in React Strict Mode
  const customersFetchedRef = useRef(false);
  
  // Authentication check - redirect to login if not authenticated
  // useEffect(() => {
  //   const userInfo = sessionStorage.getItem('userInfo');
  //   const user = sessionStorage.getItem('user');
  //   const isSSO =  sessionStorage.getItem('isSSO')
  //   if(!isSSO){
  //     if (!userInfo && !user) {
  //       navigate('/login');
  //       return;
  //     }
  //   }else{
  //     navigate('/knowledge-base');
  //   }
  // }, [navigate]);
  
  // Check if user is logged in via SSO token (state so UI reactively updates when token is processed)
  const [isSSO, setIsSSO] = useState(sessionStorage.getItem('isSSO') === 'true');
  useEffect(() => {
    const currentUrl = window.location.href;
    let encryptedData = '';
    if (currentUrl.includes('?enc=')) {
      const urlParams = new URLSearchParams(window.location.search);
      encryptedData = urlParams.get('enc') || '';
    } else if (currentUrl.includes('#') && currentUrl.split('?enc=').length > 1) {
      const parts = currentUrl.split('?enc=');
      if (parts.length > 1) {
        encryptedData = parts[1].split('&')[0];
      }
    }
    if (!encryptedData) return;
    (async () => {
      try {
        const maybeJwt = decodeURIComponent(encryptedData);
        let jwtToken = '';
        if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(maybeJwt)) {
          jwtToken = maybeJwt;
        } else {
          const apiUrl = `${API_ENDPOINTS.AZURE_DECRYPT_FUNCTION}?action=decrypt&text=${encodeURIComponent(encryptedData)}`;
          const response = await axios.get(apiUrl, { headers: { 'x-functions-key': (import.meta as any).env.VITE_AZURE_FUNCTION_KEY || "" } });
          jwtToken = response.data;
        }
        const secret = new TextEncoder().encode(((import.meta as any).env.VITE_SECRET_KEY || "") as string);
        const { payload } = await jwtVerify(jwtToken, secret);
        const decoded: Record<string, any> = payload as any;
        sessionStorage.setItem('isLogin', 'true');
        sessionStorage.setItem('isSSO', 'true');
        setIsSSO(true);
        sessionStorage.setItem('username', String(decoded.username || decoded.user_id || decoded.userCode || ""));
        sessionStorage.setItem('userCode', String(decoded.user_id || decoded.userCode || ""));
        sessionStorage.setItem('orgCode', String(decoded.org_code || decoded.orgCode || ""));
        sessionStorage.setItem('customerCode', String(decoded.cust_code || decoded.customerCode || ""));
        sessionStorage.setItem('loginType', String(decoded.type || 'knowledgebase'));
        sessionStorage.setItem('jwtToken', jwtToken);
        sessionStorage.setItem('userRole', String(decoded.userRole || 'User'));
        if (decoded.program_id) sessionStorage.setItem('programId', String(decoded.program_id));
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('enc');
          window.history.replaceState({}, document.title, url.pathname + url.hash);
        } catch {}
      } catch (e) {}
    })();
  }, []);
  // --- KB Name Availability state ---
  const [kbNameInput, setKbNameInput] = useState("");
  const [kbNameCheckStatus, setKbNameCheckStatus] = useState("unknown"); // "unknown", "checking", "exists", "not_exists", "error"
  const [kbNameCheckMsg, setKbNameCheckMsg] = useState("");
  const [kbNameCheckTimer, setKbNameCheckTimer] = useState<NodeJS.Timeout | null>(null);

  const handleBackNavigation = async () => {
    let customerCode = selectedCustomerCode;
    let orgCode = selectedOrganization;
    if (!customerCode && (kbDetails as any)?.customercode) customerCode = String((kbDetails as any).customercode || '');
    if (!orgCode && (kbDetails as any)?.organizationcode) orgCode = String((kbDetails as any).organizationcode || '');
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
    setShowAppDropdown(false);
    setIsCreating(false);
    //setIsCreatingStudyLO(false);
    setIsViewingGuidelines(false);
    //setSelectedKBForGuidelines(null);
    setIsChatMode(false);
    setSelectedKBForChat(null);

    // if (customerCode) {
    //   try {
    //     fetch(buildExistingKbUrl(String(customerCode), String(orgCode || ''), String('')))
    //       .then((r) => r.json())
    //       .then((d) => setKnowledgeBases(Array.isArray(d?.data) ? d.data : []))
    //       .catch(() => {});
    //   } catch { }
    // }
    if (customerCode) {
      try {
        fetch(await buildExistingKbUrl(String(customerCode), String(orgCode || ''), String('')))
          .then((r) => {
            if (!r.ok) {
              throw new Error(`Request failed with status ${r.status}`);
            }
            return r.json();
          })
          .then((d) => {
            setKnowledgeBases(Array.isArray(d?.data) ? d.data : []);
          })
          .catch((err) => {
            console.error("Failed to fetch knowledge bases:", err);
            setKnowledgeBases([]); // fallback to empty array
          });
      } catch (err) {
        console.error("Unexpected error:", err);
      }
    }

  };

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
      sessionStorage.setItem('selectedCustomerCode', customerCode);
      sessionStorage.setItem('selectedCustomerName', customerName);
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
    setAppSearchQuery("");
    setShowAppDropdown(false);
  };
  const buildExistingKbUrl = async (custCode: string, orgCode?: string | null, appCode?: string | null) => {
    const parCust = custCode === '_ALL' ? '0' : String(custCode || '0');
    const parOrg = orgCode ? String(orgCode) : '0';
    const parApp = appCode ? String(appCode) : '0';
  const token = await getKbAuthToken();
    // In SSO, always prefer session-stored codes for binding APIs
    const sso = sessionStorage.getItem('isSSO') === 'true';
    const effectiveCust = sso ? (sessionStorage.getItem('customerCode') || parCust) : parCust;
    const effectiveOrg = sso ? (sessionStorage.getItem('orgCode') || parOrg) : parOrg;
    const params = new URLSearchParams({
      par_custcode: effectiveCust,
      par_orgcode: effectiveOrg,
      par_appcode: parApp,
      auth_token: token,
      book_id: String(sessionStorage.getItem('programCode')||'')
    });
    return `${API_ENDPOINTS.GET_EXISTING_KB}?${params.toString()}`;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return; // ✅ null/invalid check

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

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

  // Org/app selects used in Study LO form (reuses some states from existing create form)
  // -- organizationOptions, selectedOrganization, organizationLoading, appsOptions, selectedApp, appsLoading already exist above --

  const [showChapterLOSuccessDialog, setShowChapterLOSuccessDialog] = useState(false);
  const [chapterLODeleteType, setChapterLODeleteType] = useState<'row' | 'all' | null>(null);




  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbError, setKbError] = useState(null);

  const [levelType, setLevelType] = useState<"book" | "study">("book");
  const [isViewingGuidelines, setIsViewingGuidelines] = useState(false);
  //const [selectedKBForGuidelines, setSelectedKBForGuidelines] = useState<{ id: number; name: string } | null>(null);

  const [isChatMode, setIsChatMode] = useState(false);
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

  // Drag and drop states
  const [isDraggingDocument, setIsDraggingDocument] = useState(false);

  // State for Create form (wired to API flow from abc.tsx)
  const [bookName, setBookName] = useState<string>("");
  const [kbNameFormatError, setKbNameFormatError] = useState<string | null>(null);
  const [studyLevel, setStudyLevel] = useState<string>("");
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
  const [appsLoading, setAppsLoading] = useState(false);

  type Option = { value: string; label: string; disabled?: boolean };
  const [retrievalOptions, setRetrievalOptions] = useState<Option[]>([]);
  const [chunkSizeOptions, setChunkSizeOptions] = useState<Option[]>([]);
  const [overlapOptions, setOverlapOptions] = useState<Option[]>([]);
  const [chunkingOptions, setChunkingOptions] = useState<Option[]>([]);
  const [dbTypeOptions, setDbTypeOptions] = useState<Option[]>([]);
  const [embeddingOptions, setEmbeddingOptions] = useState<Option[]>([]);
  const [metaLoading, setMetaLoading] = useState<Record<number, boolean>>({});
  const [metaError, setMetaError] = useState<Record<number, string | null>>({});
  const [searchType, setSearchType] = useState<'mmr' | 'similarity' | 'hybrid'>("similarity");
  const [rerankK, setRerankK] = useState<number>(3);
  const [rerankKInput, setRerankKInput] = useState<string>('3');
  const [chunkSize, setChunkSize] = useState<string>('1000');
  const [overlap, setOverlap] = useState<string>('20');
  const [chunkingStrategy, setChunkingStrategy] = useState<string>('recursive');
  const [embeddingModel, setEmbeddingModel] = useState<string>('text-embedding-ada-002');
  const [vectorDb, setVectorDb] = useState<string>('faiss');
  // Computed state for filtered embedding options based on retrieval strategy
  const getFilteredEmbeddingOptions = () => {
    if (searchType === 'mmr') {
      // When MMR is selected, disable all-MiniLM-L6-v2
      return embeddingOptions.map(option => ({
        ...option,
        disabled: option.value === 'all-MiniLM-L6-v2'
      }));
    } else if (searchType === 'similarity') {
      // When Similarity is selected, disable all-MiniLM-L6-v2 and enable others
      return embeddingOptions.map(option => ({
        ...option,
        disabled: option.value === 'all-MiniLM-L6-v2'
      }));
    } else if (searchType === 'hybrid') {
      // When Hybrid is selected, enable only all-MiniLM-L6-v2 and disable others
      return embeddingOptions.map(option => ({
        ...option,
        disabled: option.value !== 'all-MiniLM-L6-v2'
      }));
    }
    return embeddingOptions;
  };

  // Immediate pre-binding from session (runs once) to ensure dropdowns and API payloads use session codes
  useEffect(() => {
    if (sessionStorage.getItem('isSSO') !== 'true') return;
    const sCust = sessionStorage.getItem('customerCode') || '';
    const sOrg = sessionStorage.getItem('orgCode') || '';
    const sCustName = sessionStorage.getItem('selectedCustomerName') || '';
    if (sCust) {
      setSelectedCustomerCode(sCust);
      setCustomerSearchQuery(sCustName || sCust);
      try {
        sessionStorage.setItem('selectedCustomerCode', sCust);
        if (sCustName) sessionStorage.setItem('selectedCustomerName', sCustName);
      } catch {}
    }
    if (sOrg) {
      setSelectedOrganization(sOrg);
      setOrgSearchQuery(sOrg);
    }
  }, []);

  // If SSO, bind customer/org from session in dropdowns (after state declarations)
  useEffect(() => {
    if (!isSSO) return;
    const sCust = sessionStorage.getItem('customerCode') || '';
    if (sCust) {
      if (selectedCustomerCode !== sCust) {
        setSelectedCustomerCode(sCust);
      }
      try {
        const match: any = Array.isArray(customers) ? (customers as any[]).find((c: any) => String(c?.customercode || '') === sCust) : null;
        if (match) {
          setCustomerSearchQuery(match.customername || sCust);
        } else {
          setCustomerSearchQuery(sCust);
        }
      } catch {
        setCustomerSearchQuery(sCust);
      }
    }
  }, [isSSO, customers, selectedCustomerCode]);

  useEffect(() => {
    if (!isSSO) return;
    const sOrg = sessionStorage.getItem('orgCode') || '';
    if (!sOrg) return;
    if (!selectedOrganization && Array.isArray(organizationOptions) && organizationOptions.length > 0) {
      const match = organizationOptions.find(o => String(o.value) === sOrg);
      if (match) {
        setSelectedOrganization(match.value);
        setOrgSearchQuery(match.label || match.value);
      }
    }
  }, [isSSO, organizationOptions, selectedOrganization]);

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
  // Guidelines-related KB details for API payloads
  const [kbDetails, setKbDetails] = useState({
    id: null,
    organizationcode: null,
    knowladgebasename: null,
    customercode: null,
    appcode: null,
    dbtype: 'faiss',
  });


  // --- Debounced KB QA Check (abc pattern) ---
  useEffect(() => {
    if (!isCreating || isViewingGuidelines || isChatMode) return;
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
        const token = await getKbAuthToken();
        const url = `${API_ENDPOINTS.CHECK_KB}?custcode=${encodeURIComponent(selectedCustomerCode)}&orgcode=${encodeURIComponent(selectedOrganization)}&kbname=${encodeURIComponent(kbNameInput.trim())}&auth_token=${encodeURIComponent(token)}`;
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
    }, 2000); // 2 second delay as requested
    setKbNameCheckTimer(handle as any);
    return () => clearTimeout(handle);
    // eslint-disable-next-line
  }, [kbNameInput, kbNameFormatError, selectedCustomerCode, selectedOrganization, isCreating, isViewingGuidelines, isChatMode]);

  // Fetch customers on mount
  useEffect(() => {
    // Prevent duplicate calls in React Strict Mode
    if (customersFetchedRef.current) return;
    customersFetchedRef.current = true;
    
    async function fetchCustomers() {
      setCustomersLoading(true);
      setCustomersError(null);
      try {
        const token = await getKbAuthToken();
        const url = `${API_ENDPOINTS.GET_CUSTOMER_DATA}?auth_token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        const arr: any[] = Array.isArray(data.data) ? data.data : [];
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

        let finalCustomerCode = '';
        if ((sessionStorage.getItem('isSSO') === 'true') && userCustomerCode) {
          // SSO: select the exact customer from session and lock the dropdown, show its name
          const match = Array.isArray(arr) ? arr.find((c: any) => String(c?.customercode || '') === userCustomerCode) : null;
          finalCustomerCode = userCustomerCode;
          setSelectedCustomerCode(userCustomerCode);
          // Prefer API customername; fallback to session code
          if (match && match.customername) {
            setCustomerSearchQuery(String(match.customername));
          } else if (Array.isArray(arr) && arr.length === 1 && arr[0]?.customername) {
            setCustomerSearchQuery(String(arr[0].customername));
          } else {
            setCustomerSearchQuery(userCustomerCode);
          }
          setCustomerLocked(true);
          try {
            sessionStorage.setItem('selectedCustomerCode', userCustomerCode || '');
            sessionStorage.setItem('selectedCustomerName',
              (match?.customername || (Array.isArray(arr) && arr[0]?.customername) || userCustomerCode || '') as string
            );
          } catch {}
        } else if (superAdmin) {
          // Prefer persisted selection if valid; else default to All
          let applied = false;
          if (persistedCode) {
            const pmatch = arr.find((c: any) => String(c?.customercode || '') === persistedCode);
            if (pmatch) {
              finalCustomerCode = pmatch.customercode;
              setSelectedCustomerCode(pmatch.customercode);
              setCustomerSearchQuery(pmatch.customername || pmatch.customercode);
              applied = true;
            }
          }
          if (!applied) {
            finalCustomerCode = '_ALL';
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
            finalCustomerCode = match.customercode;
            setSelectedCustomerCode(match.customercode);
            setCustomerSearchQuery(match.customername || match.customercode);
            setCustomerLocked(true);
            try {
              sessionStorage.setItem('selectedCustomerCode', match.customercode || '');
              sessionStorage.setItem('selectedCustomerName', match.customername || match.customercode || '');
            } catch { }
          } else if (arr.length > 0) {
            finalCustomerCode = arr[0].customercode;
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
            finalCustomerCode = arr[0].customercode;
            setSelectedCustomerCode(arr[0].customercode);
            setCustomerSearchQuery(arr[0].customername || arr[0].customercode);
            setCustomerLocked(false);
          } else {
            setSelectedCustomerCode('');
            setCustomerSearchQuery('');
            setCustomerLocked(false);
          }
        }

        // After customer is set, trigger organization fetch if needed
        if (finalCustomerCode && finalCustomerCode !== '_ALL') {
          setTimeout(() => fetchOrganizationData(), 100);
        }
      } catch (err) {
        console.error('Failed to fetch customers:', err);
        const errorMessage = err instanceof Error ? err.message : "Error fetching customers";
        setCustomersError(errorMessage);
        setCustomers([]);
        // Reset customer selection states on error
        setSelectedCustomerCode('');
        setCustomerSearchQuery('');
        setCustomerLocked(false);
      } finally {
        setCustomersLoading(false);
      }
    }
    fetchCustomers();
  }, []);

  // Separate function to fetch knowledge bases
  const fetchKnowledgeBases = useCallback(async (customerCode: string, orgCode: string | null = null) => {
    if (!customerCode) {
      setKnowledgeBases([]);
      return;
    }
    // For specific customers, wait until organization is selected/resolved.
    if (customerCode !== '_ALL' && !orgCode) {
      return;
    }
    
    setKbLoading(true);
    setKbError(null);
    try {
      const url = await buildExistingKbUrl(customerCode, orgCode);
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
  }, []);

  // Fetch KBs when customer/org/app filter changes (but not when called from fetchOrganizationData)
  useEffect(() => {
    // Skip if this was triggered by fetchOrganizationData to avoid duplicate calls
    if (organizationLoading) return;
    
    fetchKnowledgeBases(selectedCustomerCode, selectedOrganization);
  }, [selectedCustomerCode, selectedOrganization, fetchKnowledgeBases, organizationLoading]);

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
    const token = encodeURIComponent(await getKbAuthToken());
    const payload = {
      customer: chatCustomerDetails.customercode,
      question: chatInput.trim(),
      k: 5, // Later can expose as config/select
      vector_db: chatKbDetails.dbtype || "faiss",
      embedding_model: chatKbDetails.embeddingmodel || embeddingModel || "text-embedding-ada-002",
      search_type: safeSearchType,
      rerank_k: chatKbDetails.numberofrerankingcandidates || rerankK || 10,
      knowledge_base_name: chatKbDetails.knowladgebasename || chatKbDetails.knowledge_base_name || selectedKBForChat.bookName || selectedKBForChat.name || "",
      auth_token:token,
      llm_model: selectedModel === "GPT-4o" ? "gpt-4o"
        : selectedModel === "GPT-4" ? "gpt-4"
          : selectedModel === "GPT-3.5" ? "gpt-3.5"
            : selectedModel || "gpt-4o"
    };

    try {
      const url = `${API_ENDPOINTS.ASK_QUESTION}`;
      const resp = await fetch(url, {
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
        toast({
          title: 'Document Uploaded',
          description: `${validFiles.length} file(s) uploaded successfully.`,
        });
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
  // ===== Helpers ported from abc.tsx (adapted) =====

  // Helper function to format file size with appropriate units
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }
  };
  // Use correct mappings as in abc.tsx to ensure UI states match API codes
  const mapValueById = (id: number, row: any): string => {
    const code: string = String(row?.code || '').toUpperCase();
    const name: string = String(row?.name || '').trim();
    switch (id) {
      case 1: // Retrieval Strategy
        if (name.toLowerCase() === 'mmr') return 'mmr';
        if (name.toLowerCase() === 'similarity') return 'similarity';
        if (name.toLowerCase() === 'hybrid') return 'hybrid';

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
        if (code === 'EM_004' || name.includes('gemini')) return 'gemini-embedding-001';
        return String(row?.value ?? row?.name ?? row?.code ?? '').trim() || name;
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

  const fetchAllMetadata = useCallback(async () => {
    const metaIds = [1, 2, 3, 4, 5, 6];
    setMetaError(prev => {
      const next = { ...prev };
      metaIds.forEach(id => {
        next[id] = null;
      });
      return next;
    });
    setMetaLoading(prev => {
      const next = { ...prev };
      metaIds.forEach(id => {
        next[id] = true;
      });
      return next;
    });
    try {
      const token = await getKbAuthToken();
      const res = await fetch(`${API_ENDPOINTS.GET_METADATA}/0?auth_token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const json = await res.json();
      const rows = Array.isArray(json?.options) ? json.options : [];

      const retrievalRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'retrievalstrategy');
      const chunkSizeRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'chunksize');
      const overlapRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'overlappercentage');
      const chunkingRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'chunkingstrategy');
      const dbTypeRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'databasetype');
      const embeddingRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'embeddingmodel');

      const retrievalOpts = rowsToOptions(1, retrievalRows);
      const chunkSizeOpts = rowsToOptions(2, chunkSizeRows);
      const overlapOpts = rowsToOptions(3, overlapRows);
      const chunkingOpts = rowsToOptions(4, chunkingRows);
      const dbTypeOpts = rowsToOptions(5, dbTypeRows);
      const embeddingOpts = rowsToOptions(6, embeddingRows);

      setRetrievalOptions(retrievalOpts);
      setChunkSizeOptions(chunkSizeOpts);
      setOverlapOptions(overlapOpts);
      setChunkingOptions(chunkingOpts);
      setDbTypeOptions(dbTypeOpts);
      setEmbeddingOptions(embeddingOpts);

      setMetaError(prev => ({
        ...prev,
        1: retrievalOpts.length ? null : 'No options found',
        2: chunkSizeOpts.length ? null : 'No options found',
        3: overlapOpts.length ? null : 'No options found',
        4: chunkingOpts.length ? null : 'No options found',
        5: dbTypeOpts.length ? null : 'No options found',
        6: embeddingOpts.length ? null : 'No options found',
      }));
    } catch (e) {
      console.error('Failed to fetch metadata:', e);
      setMetaError(prev => ({
        ...prev,
        1: 'Failed to load options',
        2: 'Failed to load options',
        3: 'Failed to load options',
        4: 'Failed to load options',
        5: 'Failed to load options',
        6: 'Failed to load options',
      }));
      setRetrievalOptions([]);
      setChunkSizeOptions([]);
      setOverlapOptions([]);
      setChunkingOptions([]);
      setDbTypeOptions([]);
      setEmbeddingOptions([]);
    } finally {
      setMetaLoading(prev => ({
        ...prev,
        1: false,
        2: false,
        3: false,
        4: false,
        5: false,
        6: false,
      }));
    }
  }, []);

  useEffect(() => {
    // Metadata options will be loaded only when Create New Knowledge Base button is clicked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also ensure metadata is loaded/refreshed when opening Create form
  useEffect(() => {
    if (!isCreating) return;
    fetchAllMetadata();
  }, [isCreating, fetchAllMetadata]);

  // Normalize selected processing settings to available metadata options
  useEffect(() => {
    if (retrievalOptions.length && !retrievalOptions.some(o => o.value === searchType)) {
      setSearchType((retrievalOptions[0]?.value as 'mmr' | 'similarity' | 'hybrid') || 'similarity');
    }
  }, [retrievalOptions, searchType]);

  // Auto-switch embedding model when retrieval strategy changes
  useEffect(() => {
    if (searchType === 'hybrid') {
      // When switching to Hybrid, auto-select all-MiniLM-L6-v2 if available
      const miniLMOption = embeddingOptions.find(o => o.value === 'all-MiniLM-L6-v2');
      if (miniLMOption) {
        setEmbeddingModel('all-MiniLM-L6-v2');
      }
    } else if (searchType === 'mmr' || searchType === 'similarity') {
      // When switching to MMR or Similarity, if current model is all-MiniLM-L6-v2,
      // switch to first available non-disabled option
      if (embeddingModel === 'all-MiniLM-L6-v2') {
        const firstAvailableOption = embeddingOptions.find(o => o.value !== 'all-MiniLM-L6-v2');
        if (firstAvailableOption) {
          setEmbeddingModel(firstAvailableOption.value);
        }
      }
    }
  }, [searchType, embeddingOptions, embeddingModel]);
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
  
  // Organization and apps
  const fetchOrganizationData = useCallback(async () => {
    if (!selectedCustomerCode || organizationLoading) return;
    setOrganizationLoading(true);
    try {
      // Extract usercode from sessionStorage
      let usercode = '';
      try {
        const uiRaw = sessionStorage.getItem('userInfo');
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || '{}');
          usercode = ui?.userCode || '';
        }
      } catch { }

      const token = encodeURIComponent(await getKbAuthToken());
      // Build payload with SSO-aware fields
      let par_custcode = selectedCustomerCode;
      let par_orgcode = '';
      if (isSSO) {
        par_custcode = sessionStorage.getItem('customerCode') || par_custcode;
        par_orgcode = sessionStorage.getItem('orgCode') || '';
      }
      const payload: any = { 
        par_custcode, 
        auth_token: token 
      };
      if (usercode) payload.par_usercode = usercode;
      if (par_orgcode) payload.par_orgcode = par_orgcode;

      const orgResponse = await fetch(`${API_ENDPOINTS.GET_ORGANIZATION_DETAILS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!orgResponse.ok) {
        throw new Error(`HTTP error! status: ${orgResponse.status}`);
      }
      const orgData = await orgResponse.json();
      if (Array.isArray(orgData.data)) {
        const options = orgData.data.map((org: any) => ({
          value: org.organizationcode,
          label: `${org.organizationname} `,
        }));
        setOrganizationOptions(options);
        // If SSO and orgCode present, auto-select the exact org and lock editing
        if (isSSO && par_orgcode) {
          const match = options.find(o => String(o.value) === String(par_orgcode));
          if (match) {
            setSelectedOrganization(match.value);
            setOrgSearchQuery(match.label || match.value);
            setOrganizationLocked(true);
          }
        }
        // Fallback: if only one option, auto-select it and (for non-superadmin) lock
        if (!isSSO && options.length === 1) {
          const only = options[0];
          setSelectedOrganization(only.value);
          setOrgSearchQuery(only.label || only.value);
          if (!isSuperAdmin) {
            setOrganizationLocked(true);
          }
        } else {
          // If SSO without a matching org, keep unlocked to allow selection
          if (!isSSO) {
            setOrganizationLocked(false);
          }
        }
        
        // After organization is set, trigger knowledge base fetch
        if (selectedCustomerCode && (selectedCustomerCode === '_ALL' || selectedOrganization)) {
          setTimeout(() => {
            if (selectedCustomerCode === '_ALL' || selectedOrganization) {
              fetchKnowledgeBases(selectedCustomerCode, selectedOrganization);
            }
          }, 100);
        }
      } else {
        setOrganizationOptions([]);
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
      setOrganizationOptions([]);
    } finally {
      setOrganizationLoading(false);
    }
  }, [selectedCustomerCode]);


  // ... (rest of the code remains the same)
  useEffect(() => {
    setSelectedOrganization(null);
    setOrganizationOptions([]);
    setAppsOptions([]);
    if (selectedCustomerCode && selectedCustomerCode !== '_ALL') {
      fetchOrganizationData();
    }
  }, [selectedCustomerCode, fetchOrganizationData]);


  // Auto-select Organization from session (userInfo.orgCode) once options are loaded
  useEffect(() => {
    // Only attempt when a specific customer is selected (not _ALL) and org not yet selected
        // For multiple organizations, do NOT auto-bind; require user selection
    if (!selectedCustomerCode || selectedCustomerCode === '_ALL') return;
    if (selectedOrganization) return;
    if (!Array.isArray(organizationOptions) || organizationOptions.length === 0) return;
        if (organizationOptions.length !== 1) return;

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

  const isStudyLOCsvFile = (file: File) => {
    const name = (file?.name || '').toLowerCase().trim();
    const type = (file?.type || '').toLowerCase().trim();
    return type === 'text/csv' || name.endsWith('.csv');
  };
  useEffect(() => {
    if (isCreating) {
      // when entering create form, fetch orgs for selected customer
      setSelectedOrganization(null);
      fetchOrganizationData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreating, selectedCustomerCode]);
  // Reset dependent fields when switching level type
  useEffect(() => {
    if (!isCreating) return;

    if (levelType === 'study') {
      // Clear Book Level specific fields when switching to Study Level
      setBookName('');
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
    setAppsOptions([]);

    // Common fields to clear for both level types
    setDocumentFiles([]);
    setSearchType('similarity');
    setRerankK(3);
    setRerankKInput('3');
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
    setKbNameInput('');
    setKbNameFormatError(null);
    setStudyLevel('');
    setSelectedBookId(null);
    setStudyLovOptions([]);
    setDocumentFiles([]);
    if (!preserveOrgApp) {
      setSelectedOrganization(null);
    }
    setSearchType('similarity');
    setRerankK(3);
    setRerankKInput('3');
    setChunkSize('1000');
    setOverlap('20');
    setChunkingStrategy('recursive');
    setEmbeddingModel('text-embedding-ada-002');
    setVectorDb('faiss');
    setKbNameCheckStatus("unknown");
    setKbNameCheckMsg("");
    setCreateSubmitting(false);
    setBookLovFetched(false);
  }, []);

  const handleCreateKnowledgeBase = useCallback(async () => {
    // validations
    const kbNameToSend = levelType === 'study'
      ? studyLevel.trim()
      : kbNameInput.trim(); // use controlled input

    // Format validation for Book Level text inputs (Knowledge Base Name)
    if (levelType === 'book') {
      const allowed = /^[A-Za-z0-9][A-Za-z0-9._-]{1,510}[A-Za-z0-9]$/;

      let localKbError: string | null = null;

      const kbLen = kbNameToSend.length;
      if (kbLen > 0) {
        if (kbLen < 3 || kbLen > 512) {
          localKbError = 'Name must be 3-512 characters. Allowed: letters, numbers, ., _, - and must start/end with a letter or number.';
        } else if (!allowed.test(kbNameToSend)) {
          localKbError = 'Only [a-zA-Z0-9._-] allowed; must start and end with [a-Za-z0-9]. No spaces.';
        }
      }

      setKbNameFormatError(localKbError);

      if (localKbError) {
        const msg = 'Please fix the highlighted name fields before proceeding.';
        toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
        return;
      }
    }

    // KB name availability check on submit (same logic as debounced effect)
    if (levelType === 'book') {
      const hasDocuments = (documentFiles && documentFiles.length > 0);
      
      if (!selectedCustomerCode || !selectedOrganization) {
        toast({
          title: 'Validation Error',
          description: 'Customer and organization are required to validate availability.',
          variant: 'destructive'
        });
        return;
      }
      
      if (!kbNameToSend && !hasDocuments) {
        toast({
          title: 'Validation Error',
          description: 'Knowledge base name and document upload is required to validate availability.',
          variant: 'destructive'
        });
        return;
      }
      
      if (!kbNameToSend) {
        toast({
          title: 'Validation Error',
          description: 'Knowledge base name is required to validate availability.',
          variant: 'destructive'
        });
        return;
      }

      // try {
      //   const token = await getKbAuthToken();
      //   const url = `${API_ENDPOINTS.CHECK_KB}?custcode=${encodeURIComponent(selectedCustomerCode)}&orgcode=${encodeURIComponent(selectedOrganization)}&kbname=${encodeURIComponent(kbNameToSend)}&auth_token=${encodeURIComponent(token)}`;
      //   const resp = await fetch(url);
      //   const json = await resp.json().catch(() => ({}));
      //   const status: string = String(json?.status || '').toUpperCase();

      //   if (status.startsWith('E001')) {
      //     setKbNameCheckStatus('exists');
      //     const msg = 'A knowledge base with this name already exists.';
      //     toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
      //     return;
      //   } else if (status.startsWith('NE001')) {
      //     setKbNameCheckStatus('not_exists');
      //   } else if (!status.startsWith('E001') && !status.startsWith('NE001')) {
      //     const msg = 'Customer not found';
      //     setKbNameCheckStatus('unknown');
      //     toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
      //     return;
      //   }
      // } catch (e: any) {
      //   const msg = 'Failed to check KB availability.';
      //   setKbNameCheckStatus('error');
      //   toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
      //   return;
      // }
    }

    const hasDocuments = (documentFiles && documentFiles.length > 0);
    const missing: string[] = [];
    if (!kbNameToSend) missing.push('Knowledge Base Name');
    if (!hasDocuments) missing.push('Document Upload');
    if (!selectedOrganization) missing.push('Organization');

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

      const accessToken = await getKbAuthToken();
      let program_id=sessionStorage.getItem('programCode')
      if(!program_id){
        program_id=''
      }
      const formData = new FormData();
      // customer data
      const cust = customers.find((c: any) => c.customercode === selectedCustomerCode);
      // formData.append('customer', String(cust?.customername || ''));
      formData.append('customercode', String(selectedCustomerCode));
      formData.append('knowledge_base_name', kbNameToSend);
      formData.append('chunk_size', chunkSize);
      formData.append('overlap_percentage', overlap);
      formData.append('chunking_strategy', chunkingStrategy);
      formData.append('embedding_model', embeddingModel);
      formData.append('vector_db', getDbTypeCanonical(vectorDb));
      formData.append('search_type', searchType);
      formData.append('rerank_k', String(rerankK));
      formData.append('orgcode', String(selectedOrganization));
      formData.append('auth_token', accessToken);
      formData.append('book_id', program_id);
      // formData.append('LevelType', levelType === 'study' ? 'Study Level' : 'Book Level');
      documentFiles.forEach((file) => formData.append('files', file));
      const resp = await fetch(API_ENDPOINTS.CREATE_KNOWLEDGEBASE, { method: 'POST', body: formData });
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

      // Check kb_save_status in response
      const kbSaveStatus = (json as any)?.kb_save_status;
      if (kbSaveStatus === 'S001') {
        // Success case
        setSuccessDialogMessage('Knowledge Base created successfully.');
        setSuccessDialogOpen(true);
        // refresh list
        try {
          const res = await fetch(await buildExistingKbUrl(selectedCustomerCode, selectedOrganization, '0'));
          const data = await res.json();
          setKnowledgeBases(Array.isArray(data.data) ? data.data : []);
        } catch { }
      } else if (kbSaveStatus === 'E001') {
        // Failure case
        toast({
          title: 'Creation Failed',
          description: (json as any)?.message || 'Failed to create knowledge base',
          variant: 'destructive'
        });
        return;
      } else {
        // Fallback for unexpected response
        setSuccessDialogMessage('Knowledge Base created successfully.');
        setSuccessDialogOpen(true);
        // refresh list
        try {
          const res = await fetch(await buildExistingKbUrl(selectedCustomerCode, selectedOrganization, '0'));
          const data = await res.json();
          setKnowledgeBases(Array.isArray(data.data) ? data.data : []);
        } catch { }
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Unexpected error', variant: 'destructive' });
    }
    finally {
      setCreateSubmitting(false);
    }
  }, [chunkSize, chunkingStrategy, customers, documentFiles, embeddingModel, levelType, overlap, rerankK, searchType, selectedCustomerCode, selectedOrganization, studyLevel, vectorDb, kbNameInput, kbNameFormatError, kbNameCheckStatus]);

  const removeDocumentFile = (index: number) => {
    setDocumentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const filteredKnowledgeBases = knowledgeBases.filter((kb) => {
    const matchesSearch = (kb.knowladgebasename || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (kb.soursename || "").toLowerCase().includes(searchQuery.toLowerCase());

    const selOrg = String(selectedOrganization || '').trim().toLowerCase();
    const kbOrg = String(kb.organizationcode || '').trim().toLowerCase();
    const kbApp = String(kb.appcode || '').trim().toLowerCase();
    const matchesOrg = !selectedOrganization || selectedOrganization === '0' || kbOrg === selOrg;

    return matchesSearch && matchesOrg;
  });
  // Show PageLoader when customers, organization, or knowledge bases are loading
  if (customersLoading && organizationLoading || kbLoading) {
    return <PageLoader text="Loading data..." />;
  }

  return (
    <>
      {/* Full-page loader during create submission - moved to root level */}
      {createSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full mx-4">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <svg className="animate-spin h-12 w-12 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-70" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Creating Knowledge Base</h3>
                <p className="text-sm text-gray-600">Please wait while we process your documents...</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-50">
        {/* Sidebar */}
        <div className="fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 transition-transform duration-300 transform lg:transform-none lg:static">
          {!isSSO && (
            isSuperAdmin ? <SuperAdminSidebar /> : <AppSidebar />
          )}
        </div>

        {/* Mobile Menu Sheet */}
        {!isSSO && (
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetContent side="left" className="w-64 p-0">
              {isSuperAdmin ? <SuperAdminSidebar /> : <AppSidebar />}
            </SheetContent>
          </Sheet>
        )}

        <div className={isSSO ? "min-h-screen flex flex-col" : "ml-0 lg:ml-52 flex flex-col"}>
          {/* Page Title Section */}
          {!isSSO && (
            <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 sm:gap-3">
                  {(isCreating || isViewingGuidelines || isChatMode) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="back to page"
                      onClick={handleBackNavigation}
                      className="flex-shrink-0">
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
                  )}
                  <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 p-1">
                      <div className="h-full w-full rounded-xl bg-blue-600 flex items-center justify-center">
                        <BookOpen className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  <div className="flex flex-col">
                    <h2 className="text-base sm:text-xl font-semibold text-gray-900">
                      {isCreating
                        ? "Create New Knowledge Base"
                        : isViewingGuidelines
                          ? "Guideline Data"
                          : isChatMode && chatKbDetails?.knowladgebasename
                            ? `Chat With Knowledge Base`
                            : isChatMode && selectedKBForChat?.bookName
                              ? `Knowledge Base: ${selectedKBForChat.bookName}`
                              : "Manage Knowledge Base"}
                    </h2>
                    <p className="text-xs text-slate-500 truncate">
                        {isCreating
                          ? "Set up a new knowledge base"
                          : isViewingGuidelines
                            ? "Manage guideline documents for this knowledge base"
                            : isChatMode
                              ? "Chat with your knowledge base"
                              : "Add, edit, and organize your knowledge bases"}
                      </p>
                    {isChatMode && selectedKBForChat && ( 
                      <p className="text-sm text-gray-600">
                        Knowledge Base: {chatKbDetails.knowladgebasename}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex h-16 items-center justify-between px-3 sm:px-6 gap-2 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                  {/* Mobile Menu Button - Hide if isSSO */}
                  {!isSSO && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden flex-shrink-0"
                      onClick={() => setMobileMenuOpen(true)}
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  )}
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
              </div>
            </div>
          )}

          {/* Main Content */}
          <main className="p-6">
            <BackToTop loading={kbLoading || isCreating} />
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
              ) : isCreating ? (
                /* Create Form */
                <>
                  {/* Level Type Selection Card */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Organization and Apps Selection */}
                    {!isSSO && (
                      <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                        <CardContent className="p-6 space-y-4">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                              <span className="inline-block w-1 h-6 bg-blue-600 rounded-full" aria-hidden="true" />Organization</h3>
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            {/* Organization Select */}
                           
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">Select Organization <span className="text-red-500">*</span></label>
                              <Select value={selectedOrganization ?? ''} onValueChange={(v) => setSelectedOrganization(v)} disabled={organizationLocked || organizationLoading || !selectedCustomerCode}>
                                <SelectTrigger className="bg-white border-gray-200 rounded-full focus:border-blue-400 focus:ring-blue-400/20 disabled:opacity-50 disabled:cursor-not-allowed" disabled={organizationLocked || organizationLoading || !selectedCustomerCode}>
                                  <SelectValue placeholder={organizationLoading ? "Loading organizations..." : "Select an organization"} />
                                </SelectTrigger>
                                <SelectContent className="bg-white z-50">
                                  {organizationOptions.map(o => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {/* Basic Information Card */}
                    <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                            <span className="inline-block w-1 h-6 bg-blue-600 rounded-full" aria-hidden="true" />
                            Basic Information
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">
                              {levelType === "book" ? "Knowledge Base Name" : "Study"} <span className="text-red-500">*</span>
                            </label>
                            {levelType === "book" ? (
                              <>
                                <Input
                                  id="kb-name-input"
                                  placeholder="Enter knowledge base name"
                                  className="bg-white border-gray-200 rounded-full focus:border-blue-400 focus:ring-blue-400/20"
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
                                  disabled={!selectedOrganization}
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
                                    <span className="text-xs text-gray-400">{kbNameCheckMsg}</span>
                                  ) : null}
                                </div>
                              </>
                            ) : (
                              <Select disabled={!bookName || studyLovOptions.length === 0} value={studyLevel} onValueChange={setStudyLevel}>
                                <SelectTrigger className="bg-white border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!selectedOrganization || !bookName || studyLovLoading}>
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
                  </div>

                  {/* Upload Section Card */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                          <span className="inline-block w-1 h-6 bg-blue-600 rounded-full" aria-hidden="true" />
                          File Uploads
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        <div className="space-y-2 flex-1">
                          <label className="text-sm font-medium text-gray-700">
                            Document Upload <span className="text-red-500">*</span>
                          </label>
                          <label
                            className={`block bg-white border-2 border-dashed rounded-lg p-8 text-center space-y-3 transition-colors cursor-pointer h-[200px] flex flex-col items-center justify-center ${isDraggingDocument
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
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
                              <div className={`p-3 rounded-lg transition-colors ${isDraggingDocument ? 'bg-blue-200' : 'bg-blue-50'
                                }`}>
                                <FileText className={`h-8 w-8 transition-colors ${isDraggingDocument ? 'text-blue-600' : 'text-blue-600'
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
                            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
                              <p className="text-sm font-medium text-gray-900 mb-2">{documentFiles.length} file(s) uploaded:</p>
                              {documentFiles.map((file, index) => (
                                <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 truncate">{file.name}</span>
                                    <span className="text-xs text-gray-500 flex-shrink-0">
                                      ({formatFileSize(file.size)})
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
                      </div>
                    </CardContent>
                  </Card>

                  {/* Processing Settings Card */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-1 space-y-4">
                        <Accordion type="single" collapsible>
                          <AccordionItem value="processing-settings" className="border-b-0">
                            <AccordionTrigger className="px-6 hover:no-underline">
                              <div className="flex items-center gap-3 mb-4">
                                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                                  <span className="inline-block w-1 h-6 bg-blue-600 rounded-full" aria-hidden="true" />
                                  Processing Settings
                                </h3>
                              </div>
                            </AccordionTrigger>
                          <AccordionContent className="px-6 pb-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                            Retrieval Strategy
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-gray-400 cursor-pointer hover:text-blue-600 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Retrieval Strategy decides how search results are ranked and selected</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </Label>
                          <Select value={searchType} onValueChange={(v) => setSearchType(v as 'mmr' | 'similarity' | 'hybrid')}>
                            <SelectTrigger className="bg-white border-gray-200 rounded-full focus:border-blue-400 focus:ring-blue-400/20">
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
                          <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                            Number Of K values
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-gray-400 cursor-pointer hover:text-blue-600 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Defines how many of the initially retrieved results are considered during retrieval (allowed range: 1–8). Smaller values are faster; larger are more thorough but slower.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </Label>
                          <Input
                            type="number"
                            value={rerankKInput}
                            placeholder="Enter value between 1-8"
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
                            className="bg-white border-gray-200 rounded-full focus:border-blue-400 focus:ring-blue-400/20"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                            Chunk Size
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-gray-400 cursor-pointer hover:text-blue-600 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Defines how large each text segment is when splitting documents for retrieval. Smaller chunks give more precise matches but less context, larger chunks preserve more context but may include irrelevant material.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </Label>
                          <Select value={chunkSize} onValueChange={(v) => setChunkSize(v || '1000')}>
                            <SelectTrigger className="bg-white border-gray-200 rounded-full focus:border-blue-400 focus:ring-blue-400/20">
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
                          <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                            Overlap Percentage
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-gray-400 cursor-pointer hover:text-blue-600 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Defines how much consecutive text chunks overlap when splitting documents. Higher overlap preserves more context across chunks but increases redundancy and processing cost.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </Label>
                          <Select value={overlap} onValueChange={v => setOverlap(v || '20')}>
                            <SelectTrigger className="bg-white border-gray-200 rounded-full focus:border-blue-400 focus:ring-blue-400/20">
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
                          <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                            Chunking Strategy
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-gray-400 cursor-pointer hover:text-blue-600 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Controls how documents are split into smaller parts for retrieval. Affects accuracy, context, and speed.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </Label>
                          <Select value={chunkingStrategy} onValueChange={v => setChunkingStrategy(v || 'recursive')}>
                            <SelectTrigger className="bg-white border-gray-200 rounded-full focus:border-blue-400 focus:ring-blue-400/20">
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
                          <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                            Database Type
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-gray-400 cursor-pointer hover:text-blue-600 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">The vector database used to store and search document embeddings. Faiss is faster for pure vector search, Chroma offers more features.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </Label>
                          <Select value={vectorDb} onValueChange={v => setVectorDb(v || 'faiss')}>
                            <SelectTrigger className="bg-white border-gray-200 rounded-full focus:border-blue-400 focus:ring-blue-400/20">
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
                          <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                            Embedding Model
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-gray-400 cursor-pointer hover:text-blue-600 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                                  <p className="text-sm leading-relaxed">Converts text into vectors for similarity search</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </Label>
                          <Select value={embeddingModel} onValueChange={v => setEmbeddingModel(v || 'text-embedding-ada-002')}>
                            <SelectTrigger className="bg-white border-gray-200 rounded-full focus:border-blue-400 focus:ring-blue-400/20">
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
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </CardContent>
                  </Card>

                  {/* Action Buttons Card */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex justify-end gap-3">
                        <Button
                          variant="outline"
                          onClick={() => {
                            clearCreateForm();
                            setIsCreating(false);
                          }}
                          className="border-gray-300 rounded-full text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </Button>
                        <Button 
                          className="bg-blue-600 rounded-full hover:bg-blue-700 text-white" 
                          onClick={handleCreateKnowledgeBase}
                          disabled={kbNameCheckStatus !== "not_exists" || createSubmitting}
                        >
                          Create Knowledge Base
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  
                  {/* Success dialog after create */}
                  {/* Moved outside conditional blocks to ensure it appears regardless of isCreating state */}
                </>
              ) : (
                <>
                  {/* Existing List View */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                    {!isSSO && (
                      <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                        <CardContent className="p-6 space-y-4">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-medium text-gray-900 flex items-center gap-2">
                              <span className="inline-block w-1 h-6 bg-blue-600 rounded-full" aria-hidden="true" />
                              Select Customer
                            </h3>
                          </div>
                          

                          <div className="grid grid-cols-1 gap-4">
                            <div className="relative space-y-1">
                              <Input
                                type="text"
                                value={customerSearchQuery}
                                onChange={(e) => handleCustomerInputChange(e.target.value)}
                                onClick={handleCustomerInputFocus}
                                placeholder={customersLoading ? "Loading..." : getSelectedCustomerName()}
                                className="w-full rounded-full pl-10 bg-white border-grey-200 focus:border-grey-400 focus:ring-grey-400/20 cursor-pointer"
                                disabled={customersLoading || customerLocked}
                              />
                              <ChevronDown className="lucide lucide-chevron-down absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-grey-400" />
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
                    )}
                    {!isSSO && (
                      <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                        <CardContent className="p-6 space-y-4">
                          <div className="flex items-center gap-3 mb-4">
                            <h3 className="text-xl font-medium text-gray-900 flex items-center gap-2">
                              <span className="inline-block w-1 h-6 bg-blue-600 rounded-full" aria-hidden="true" />
                              Select Organization
                            </h3>
                          </div>
                          

                          <div className="grid grid-cols-1 gap-4">
                            <div className="relative space-y-1">
                              <Input
                                type="text"
                                value={orgSearchQuery}
                                onChange={(e) => handleOrgInputChange(e.target.value)}
                                onClick={handleOrgInputFocus}
                                placeholder={organizationLoading ? "Loading..." : (orgSearchQuery || "Select Organization")}
                                className="w-full pl-10 bg-white rounded-full border-grey-200 focus:border-grey-400 focus:ring-grey-400/20 cursor-pointer"
                                disabled={organizationLocked || organizationLoading || !selectedCustomerCode || selectedCustomerCode === '_ALL'}
                              />
                              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-grey-400" />
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
                    )}
                  </div>


                  <div className="mt-4">
                    {customersLoading && <div className="text-xs text-gray-600">Loading customer list...</div>}
                    {customersError && <div className="text-xs text-red-600">{customersError}</div>}
                  </div>

                  {/* Knowledge Bases Card */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6 space-y-6">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <h2 className="text-xl font-medium text-gray-900 flex items-center gap-2">
                          <span className="inline-block w-1 h-6 bg-blue-600 rounded-full" aria-hidden="true" />
                          Knowledge Bases
                        </h2>
                        <div className="flex flex-col sm:flex-row gap-2">

                          <Button
                            className="px-5 rounded-full bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={selectedCustomerCode === '_ALL'}
                            title={selectedCustomerCode === '_ALL' ? 'Disabled when All customers is selected' : ''}
                            onClick={() => setIsCreating(true)}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Create New Knowledge Base
                          </Button>
                        </div>
                      </div>

                      {/* Always show search */}
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                        <Input
                          placeholder="Search knowledge bases..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 bg-white rounded-full border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
                        />
                      </div>

                      {/* Table */}
                      <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden min-h-[150px]">
                        {kbError ? (
                          <div className="p-6 text-center text-red-700 text-sm">{kbError}</div>
                        ) : filteredKnowledgeBases.length === 0 ? (
                          <div className="p-8 text-center">
                            <div className="flex flex-col items-center justify-center py-8">
                              {/* Animated Empty State SVG */}
                              <div className="relative w-40 h-40 mb-5">
                                <svg viewBox="0 0 160 160" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                                  {/* Background circle */}
                                  <circle cx="80" cy="80" r="70" fill="#EFF6FF" className="animate-[scale-in_0.6s_ease-out]" />
                                  
                                  {/* Shelf */}
                                  <rect x="30" y="110" width="100" height="6" rx="3" fill="#BFDBFE" className="animate-[fade-in_0.5s_ease-out_0.2s_both]" />
                                  
                                  {/* Book 1 - left */}
                                  <g className="animate-[fade-in_0.5s_ease-out_0.3s_both] origin-bottom">
                                    <rect x="38" y="72" width="14" height="38" rx="2" fill="#3B82F6" opacity="0.9">
                                      <animateTransform attributeName="transform" type="translate" values="0,2;0,-2;0,2" dur="3s" repeatCount="indefinite" />
                                    </rect>
                                    <rect x="41" y="76" width="8" height="4" rx="1" fill="#FFFFFF" opacity="0.5">
                                      <animateTransform attributeName="transform" type="translate" values="0,2;0,-2;0,2" dur="3s" repeatCount="indefinite" />
                                    </rect>
                                  </g>
                                  
                                  {/* Book 2 - middle, taller */}
                                  <g className="animate-[fade-in_0.5s_ease-out_0.4s_both] origin-bottom">
                                    <rect x="56" y="62" width="16" height="48" rx="2" fill="#60A5FA" opacity="0.9">
                                      <animateTransform attributeName="transform" type="translate" values="0,-2;0,2;0,-2" dur="2.5s" repeatCount="indefinite" />
                                    </rect>
                                    <rect x="60" y="68" width="8" height="4" rx="1" fill="#FFFFFF" opacity="0.5">
                                      <animateTransform attributeName="transform" type="translate" values="0,-2;0,2;0,-2" dur="2.5s" repeatCount="indefinite" />
                                    </rect>
                                  </g>
                                  
                                  {/* Book 3 - right, angled */}
                                  <g className="animate-[fade-in_0.5s_ease-out_0.5s_both] origin-bottom">
                                    <rect x="76" y="68" width="14" height="42" rx="2" fill="#93C5FD" opacity="0.9" transform="rotate(5 83 89)">
                                      <animateTransform attributeName="transform" type="translate" values="0,1;0,-1;0,1" dur="3.5s" repeatCount="indefinite" additive="sum" />
                                    </rect>
                                  </g>
                                  
                                  {/* Small floating document */}
                                  <g className="animate-[fade-in_0.5s_ease-out_0.6s_both]">
                                    <rect x="98" y="55" width="22" height="28" rx="3" fill="#FFFFFF" stroke="#3B82F6" strokeWidth="1.5">
                                      <animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="4s" repeatCount="indefinite" />
                                    </rect>
                                    <line x1="104" y1="64" x2="114" y2="64" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round">
                                      <animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="4s" repeatCount="indefinite" />
                                    </line>
                                    <line x1="104" y1="70" x2="110" y2="70" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round">
                                      <animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="4s" repeatCount="indefinite" />
                                    </line>
                                  </g>
                                  
                                  {/* Search magnifying glass */}
                                  <g className="animate-[fade-in_0.5s_ease-out_0.7s_both]">
                                    <circle cx="52" cy="48" r="14" fill="none" stroke="#3B82F6" strokeWidth="2.5">
                                      <animateTransform attributeName="transform" type="translate" values="0,0;2,2;0,0" dur="2s" repeatCount="indefinite" />
                                    </circle>
                                    <line x1="62" y1="58" x2="70" y2="66" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round">
                                      <animateTransform attributeName="transform" type="translate" values="0,0;2,2;0,0" dur="2s" repeatCount="indefinite" />
                                    </line>
                                  </g>
                                  
                                  {/* Sparkle dots */}
                                  <circle cx="115" cy="42" r="2" fill="#BFDBFE">
                                    <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
                                  </circle>
                                  <circle cx="35" cy="55" r="1.5" fill="#93C5FD">
                                    <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
                                  </circle>
                                  <circle cx="125" cy="92" r="2" fill="#BFDBFE">
                                    <animate attributeName="opacity" values="0.4;1;0.4" dur="2.5s" repeatCount="indefinite" />
                                  </circle>
                                </svg>
                              </div>
                              
                              <h3 className="text-base font-medium text-gray-900 mb-1">
                                {searchQuery
                                  ? "No Knowledge Bases match your search."
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
                          <div className="overflow-x-auto">
                            <Table className="w-full table-fixed">
                              <TableHeader>
                                <TableRow className="bg-muted border-b border-gray-300 hover:bg-muted">
                                  <TableHead className="w-[70%]">Knowledge Base Name</TableHead>
                                  <TableHead className="w-[30%] text-left pl-11 pr-4">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredKnowledgeBases.map((kb, idx) => (
                                  <TableRow key={kb.knowledgebase_id || idx} className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
                                    <TableCell className="font-medium text-gray-900 py-4 truncate">
                                      <div className="break-words max-w-xs">
                                        {kb.knowladgebasename || ""}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-4 px-4 text-center">
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
                                         {!isSSO && (
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
                                              const token = await getKbAuthToken();
                                              const res = await fetch(`${API_ENDPOINTS.GET_CUSTOMER_DATA}?auth_token=${encodeURIComponent(token)}`);
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
                                              const token = encodeURIComponent(await getKbAuthToken());
                                              
                                              let kbcode = "";
                                              try {
                                                const existingParams = new URLSearchParams({
                                                  par_custcode: String(kb.customercode || "0"),
                                                  par_orgcode: String(kb.organizationcode || "0"),
                                                  par_appcode: String(kb.appcode || "0"),
                                                  auth_token: token,
                                                  book_id: String(sessionStorage.getItem('programCode')||'')
                                                });

                                                const existingUrl = `${API_ENDPOINTS.GET_EXISTING_KB}?${existingParams.toString()}`;
                                                const existingRes = await fetch(existingUrl);
                                                const existingJson = await existingRes.json().catch(() => ({}));
                                                const list = Array.isArray(existingJson?.data) ? existingJson.data : [];
                                                const match = list.find((kbItem: any) => String(kbItem?.knowladgebasename || "") === kb.knowladgebasename);
                                                const id = match?.knowledgebase_id;
                                                if (id != null && id !== "") kbcode = `${String(id)}`;
                                              } catch {
                                                // ignore and let backend handle missing kbcode
                                              }
                                              
                                              const payload = {
                                                custcode: kb.customercode,
                                                orgcode: kb.organizationcode || "",
                                                kbname: kb.knowladgebasename,
                                                appcode: kb.appcode || "",
                                                sourcename: "",
                                                kbcode,
                                                book_id: String(sessionStorage.getItem('programCode')||''),
                                                auth_token: encodeURIComponent(token)
                                              };
                                              const url = `${API_ENDPOINTS.GET_KB_DETAILS}`;
                                              const res = await fetch(url, {
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
                                         )}
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
                    const token = await getKbAuthToken();

                      const request = {
                      custcode: kbToDelete.customercode || "",
                      orgcode: kbToDelete.organizationcode || "",
                      kbname: kbToDelete.name || "",
                        kbcode: `KB${kbToDelete.id ?? ""}`,
                      soursename: kbToDelete.sourcename || "",
                        bookdetails_id: kbToDelete.bookdetails_id || null,
                        auth_token: encodeURIComponent(token)
                    };

                      const url = `${API_ENDPOINTS.DELETE_KB_DATAS}`;

                      const resp = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(request),
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
                    toast && toast({ title: 'Deleted', description: 'Knowledge Base deleted successfully.',style: { marginTop: "100px" } });
                    setDeleteDialogOpen(false);
                    setKbToDelete(null);
                    // refresh list
                    try {
                      const res = await fetch(await buildExistingKbUrl(selectedCustomerCode, selectedOrganization));

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
                    setIsViewingGuidelines(false);
                    //setSelectedKBForGuidelines(null);
                    setIsChatMode(false);
                    setSelectedKBForChat(null);
                    clearCreateForm();
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


export default ManageKnowledgeBase;
