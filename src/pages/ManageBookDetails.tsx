import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Search, FileText, Edit, Eye, Trash2, ArrowLeft, BookOpen, Plus, Menu, Library, Bot, X, Save, ChevronDown, Pencil, File, Download } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AppSidebar } from "@/components/AppSidebar";
import { SuperAdminSidebar } from "@/components/SuperAdminSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { AppHeader } from "@/components/AppHeader";

import BackToTop from "@/components/BackToTop";
import { API_ENDPOINTS } from "../config";
import { PageLoader } from "@/components/ui/loader";
import { getKbAuthToken } from "@/lib/kb-auth";

const KnowledgeBase = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Book name passed by "Click here to upload" on the question generator.
  const pendingStudyLOBook = useRef<string>(
    String((location.state as any)?.openStudyLOForBook || "").trim()
  );
  
  // Ref to prevent duplicate API calls in React Strict Mode
  const customersFetchedRef = useRef(false);
  const fetchedCombinations = useRef(new Set<string>());
  // Tracks an in-flight get-apps call. A ref, not the appsLoading state, so the
  // guard reads the current value instead of the one captured when the callback
  // was last created.
  const appsFetchInFlight = useRef(false);
  
  const [showPrevFileDeleteDialog, setShowPrevFileDeleteDialog] = useState(false);
  const [studyLoBookOpen, setStudyLoBookOpen] = useState(false);
  const [studyLoBookSearch, setStudyLoBookSearch] = useState("");
  const studyLoBookInputRef = useRef<HTMLInputElement | null>(null);
  const studyLoFileInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);
  const editCoverImageInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);  
  const [selectedCustomerCode, setSelectedCustomerCode] = useState("");  
  const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null);
  const handleBackNavigation = () => {
    if (isSSO) {
      return;
    }
    let customerCode = selectedCustomerCode;
    let orgCode = selectedOrganization;
    let appCode = selectedApp;
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
    clearEditForm(); // Clear edit form state
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
    setIsEditingBook(false); // Ensure edit book state is reset
    setEditingBookDetails(null);
    setIsTaggingAgents(false);
    setIsViewingGuidelines(false);
    setIsChatMode(false);
    setSelectedKBForChat(null);
    setSelectedKBForAgents(null);

    if (customerCode && orgCode) {
      fetchData(String(customerCode), String(orgCode));
    }
  };
  const [searchQuery, setSearchQuery] = useState("");
  // Customers dropdown and knowledge base data
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerLocked, setCustomerLocked] = useState(false);
  const [organizationLocked, setOrganizationLocked] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const isSSO = sessionStorage.getItem('isSSO') === 'true';
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

  const handleAppInputFocus = () => {
    const willOpen = !showAppDropdown;
    setShowAppDropdown(willOpen);
    // Removed fetchAppsData() call - apps data is already loaded via useEffect when organization changes
  };

  const handleAppSelect = (appCode: string, appName: string) => {
    setSelectedApp(appCode);
    setAppSearchQuery(appName);
    setShowAppDropdown(false);
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  // ---- Create Study LO State additions from abc.tsx ----
  const [isCreatingStudyLO, setIsCreatingStudyLO] = useState(false);
  const [booksOptions, setBooksOptions] = useState<{ value: string; label: string; bookId?: number; organizationcode?: string; appcode?: string;isstudylocreated?: number }[]>([]);
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
  const [editingBookDetails, setEditingBookDetails] = useState<any | null>(null);
  // ---- End Create Study LO State additions ----

  
  const [kbLoading, setKbLoading] = useState(false);
  
  const [isViewingGuidelines, setIsViewingGuidelines] = useState(false);
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
  const [chatInput, setChatInput] = useState("");

  // Chat-specific KB and Customer details (payload safety)
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (coverImage) {
      const url = URL.createObjectURL(coverImage);
      setCoverImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCoverImagePreviewUrl(null);
    }
  }, [coverImage]);

  // Drag and drop states
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  // State for Create form (wired to API flow from abc.tsx)
  const [bookName, setBookName] = useState<string>("");
  const [bookNameFormatError, setBookNameFormatError] = useState<string | null>(null);
  // --- Book Name Availability state ---
  const [bookNameCheckStatus, setBookNameCheckStatus] = useState("unknown"); // "unknown", "checking", "exists", "not_exists", "error"
  const [bookNameCheckMsg, setBookNameCheckMsg] = useState("");
  const [bookNameCheckTimer, setBookNameCheckTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [organizationOptions, setOrganizationOptions] = useState<{ value: string; label: string }[]>([]);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [appsOptions, setAppsOptions] = useState<{ value: string; label: string }[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);

  // State for Edit Book functionality
  const [isEditingBook, setIsEditingBook] = useState(false);
  const [editBookName, setEditBookName] = useState<string>("");
  const [editBookNameFormatError, setEditBookNameFormatError] = useState<string | null>(null);
  const [editCoverImage, setEditCoverImage] = useState<File | null>(null);
  const [editCoverImagePreviewUrl, setEditCoverImagePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (editCoverImage) {
      const url = URL.createObjectURL(editCoverImage);
      setEditCoverImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setEditCoverImagePreviewUrl(null);
    }
  }, [editCoverImage]);
  const [existingBookImage, setExistingBookImage] = useState<string | null>(null);
  const [existingImageDeleted, setExistingImageDeleted] = useState(false);
  const [editBookSubmitting, setEditBookSubmitting] = useState(false);
  const [editBookId, setEditBookId] = useState<number | null>(null);
  const [editSelectedOrganization, setEditSelectedOrganization] = useState<string>("");

  const [bookToDelete, setBookToDelete] = useState<any | null>(null);
  const [showBookDeleteDialog, setShowBookDeleteDialog] = useState(false);
  const [bookDeleteLoading, setBookDeleteLoading] = useState(false);

  const [editSelectedApp, setEditSelectedApp] = useState<string>("");

  const [fetchingBookImages, setFetchingBookImages] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null as (() => void) | null,
    onCancel: null as (() => void) | null,
  });

    const fetchData = async (customerCode: string, orgCode: string) => {
        if (!customerCode || !orgCode) return;
        
        // Prevent duplicate calls
        const fetchKey = `${customerCode}-${orgCode}`;
        if (fetchedCombinations.current.has(fetchKey)) return;
        fetchedCombinations.current.add(fetchKey);
        
        setAppsLoading(true);
        try {
            const token = encodeURIComponent(await getKbAuthToken());
            const response = await fetch(API_ENDPOINTS.GET_APPS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ par_custcode: customerCode, par_orgcode: orgCode, auth_token: token }),
            });
            const data = await response.json();
            if (Array.isArray(data.data)) {
                const options = data.data.map((app: any) => ({
                    value: app.appcode,
                    label: app.applicationname || app.applicationName || app.appname || app.name || app.appcode,
                }));
                setAppsOptions(options);
            } else {
                console.error('[ManageBookDetails] get-apps returned no app list:', data);
                setAppsOptions([]);
            }
        } catch (error) {
            console.error('[ManageBookDetails] Failed to fetch apps:', error);
            setAppsOptions([]);
            // Let a later render retry this pair instead of caching the failure.
            fetchedCombinations.current.delete(fetchKey);
        } finally {
            setAppsLoading(false);
        }
    };
  type Option = { value: string; label: string; disabled?: boolean };
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

  const [previouslyUploadedFileName, setPreviouslyUploadedFileName] = useState(null); // string | null
  // (Removed duplicate declaration of showGuidelineDeleteDialog and guidelinePendingDelete)
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
        const res = await fetch(`${API_ENDPOINTS.GET_CUSTOMER_DATA}?auth_token=${encodeURIComponent(token)}`);
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

        let finalCustomerCode = '';
        if (superAdmin) {
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
        
        // Check if we should auto-open Create Study LO form (for SSO type 4)
        const shouldCreateStudyLO = sessionStorage.getItem('isCreatingStudyLO') === 'true';
        const shouldEditStudyLO = sessionStorage.getItem('isEditingStudyLO') === 'true';
        console.log('[ManageBookDetails] Checking flags - isCreatingStudyLO:', shouldCreateStudyLO, 'isEditingStudyLO:', shouldEditStudyLO, 'isSSO:', isSSO);
        
        if (shouldEditStudyLO && isSSO) {
          console.log('[ManageBookDetails] Auto-opening Edit Study LO form for SSO type 4');
          sessionStorage.removeItem('isEditingStudyLO');
          
          // DYNAMIC from userInfo for custcode and orgcode
          let dynamicCustCode = '';
          let dynamicOrgCode = '';
          try {
            const uiRaw = sessionStorage.getItem('userInfo');
            if (uiRaw) {
              const ui = JSON.parse(uiRaw);
              dynamicCustCode = ui?.customerCode || ui?.customercode || '';
              dynamicOrgCode = ui?.orgCode || ui?.orgcode || '';
            }
          } catch (e) {
            console.warn('[ManageBookDetails] Error parsing userInfo:', e);
          }
          const appCode = 'AIG';

          // DYNAMIC from sessionStorage for book details (set by AuthGuard or Login)
          const dynamicBookName = sessionStorage.getItem('bookname') || sessionStorage.getItem('ssoBookName') || '';
          const dynamicBookId = Number(sessionStorage.getItem('book_id') || sessionStorage.getItem('ssoBookId') || '0');

          console.log('[ManageBookDetails] Using DYNAMIC values:', {
            custcode: dynamicCustCode,
            orgcode: dynamicOrgCode,
            appcode: appCode,
            sourcename: dynamicBookName,
            bookid: dynamicBookId
          });

          setTimeout(() => {
            console.log('[ManageBookDetails] Setting isCreatingStudyLO to true for Edit mode');
            setIsCreatingStudyLO(true);
            // Set editing mode flag with dynamic values
            setEditingBookDetails({
              appcode: appCode,
              organizationcode: dynamicOrgCode,
              label: dynamicBookName,
              bookId: dynamicBookId
            });

            // Set selected values for UI
            setSelectedApp(appCode);
            setSelectedOrganization(dynamicOrgCode);
            setSelectedBook(dynamicBookName);
            setSelectedBookId(dynamicBookId);

            // Trigger ALL API calls for Edit LO
            console.log('[ManageBookDetails] Triggering ALL API calls for Edit LO (SSO Type 4)');

            // Call all required APIs for SSO Edit LO flow
            fetchOrganizationData();

            // Fetch books - API uses dynamic values from session
            fetchBooksDetailsForSSO(dynamicCustCode, dynamicOrgCode, appCode);

            // Call get-agent-config API with dynamic bookname as sourcename
            fetchAgentConfigForSSO(dynamicOrgCode, dynamicCustCode, appCode, dynamicBookName);

            // Call get-chapter-lo-details with dynamic bookid
            fetchChapterLODetailsForSSO(dynamicBookId);

            // Call list_book_images with dynamic bookname
            fetchListBookImagesForSSO();
            
          }, 100);
        } else if (shouldCreateStudyLO && isSSO) {
          console.log('[ManageBookDetails] Auto-opening Create Study LO form');
          sessionStorage.removeItem('isCreatingStudyLO');
          setTimeout(() => {
            console.log('[ManageBookDetails] Setting isCreatingStudyLO to true');
            setIsCreatingStudyLO(true);
          }, 100);
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
    useEffect(() => {
        if (organizationLocked) {
            setShowOrgDropdown(false);
        }
    }, [organizationLocked]);

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
      toast({
        title: "Image Uploaded",
        description: `Image has been successfully uploaded.`,
      });

      // Clear the input to allow re-selecting the same file if needed
      e.target.value = '';
    }
  };

  // Optimized click handler for cover image upload
  const handleCoverImageClick = () => {
    if (coverImageInputRef.current) {
      coverImageInputRef.current.click();
    }
  };

  // Optimized click handler for edit cover image upload
  const handleEditCoverImageClick = () => {
    if (editCoverImageInputRef.current) {
      editCoverImageInputRef.current.click();
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
      description: 'Image has been successfully uploaded.',
    });

    // Also clear the file input to allow re-selecting the same file
    const fileInput = document.getElementById('cover-image-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleEditImageDrop = (e: React.DragEvent) => {
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

    setEditCoverImage(file);
    toast({
      title: 'Image Uploaded',
      description: `Image has been successfully uploaded.`,
    });
  };

  // Organization and apps
  const fetchOrganizationData = useCallback(async () => {
    const token = encodeURIComponent(await getKbAuthToken());
    if (!selectedCustomerCode || organizationLoading) return;
    setOrganizationLoading(true);
    try {
      const sso = sessionStorage.getItem('isSSO') === 'true';
      
      // Extract customerCode and usercode from userInfo
      let custcode = '';
      let usercode = '';
      try {
        const uiRaw = sessionStorage.getItem('userInfo');
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || '{}');
          custcode = ui?.customerCode || ui?.customercode || '';
          usercode = ui?.userCode || ui?.usercode || '';
        }
      } catch { }
      
      // Fallback to direct sessionStorage or selectedCustomerCode if not in userInfo
      if (!custcode) {
        custcode = sessionStorage.getItem('customerCode') || selectedCustomerCode;
      }

      const payload: any = { 
        par_custcode: sso && custcode ? custcode : selectedCustomerCode, 
        par_usercode: usercode,
        auth_token: token 
      };
      
      console.log('[ManageBookDetails] get-organization-details payload:', payload);

      const orgResponse = await fetch(API_ENDPOINTS.GET_ORGANIZATION_DETAILS, {
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
        let autoSelectedOrg = null;
        
        // In SSO mode, auto-select the organization from response if only one is returned
        if (sso && options.length === 1) {
          const only = options[0];
          setSelectedOrganization(only.value);
          setOrgSearchQuery(only.label || only.value);
          setOrganizationLocked(true);
          autoSelectedOrg = only.value;
        }
        // Fallback: if only one option, auto-select it and (for non-superadmin) lock
        else if (!isSSO && options.length === 1) {
          const only = options[0];
          setSelectedOrganization(only.value);
          setOrgSearchQuery(only.label || only.value);
          if (!isSuperAdmin) {
            setOrganizationLocked(true);
          }
          autoSelectedOrg = only.value;
        } else {
          // If SSO without a matching org, keep unlocked to allow selection
          if (!isSSO) {
            setOrganizationLocked(false);
          }
        }
        
        // After organization is set, trigger apps fetch using the auto-selected value
        if (autoSelectedOrg && selectedCustomerCode) {
          setTimeout(() => fetchAppsData(autoSelectedOrg), 100);
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
  }, [selectedCustomerCode, isSSO, isSuperAdmin]);

  const fetchAppsData = useCallback(async (orgCode?: string) => {
    const callId = Date.now() + Math.random();
    const orgToUse = orgCode || selectedOrganization;
    if (!selectedCustomerCode || !orgToUse || appsFetchInFlight.current) {
      return;
    }
    appsFetchInFlight.current = true;
    setAppsLoading(true);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      
      // Get customerCode from userInfo for SSO, fallback to selectedCustomerCode
      let custcode = selectedCustomerCode;
      const sso = sessionStorage.getItem('isSSO') === 'true';
      if (sso) {
        try {
          const uiRaw = sessionStorage.getItem('userInfo');
          if (uiRaw) {
            const ui = JSON.parse(uiRaw);
            custcode = ui?.customerCode || ui?.customercode || selectedCustomerCode;
          }
        } catch { }
      }
      
      const response = await fetch(API_ENDPOINTS.GET_APPS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ par_custcode: custcode, par_orgcode: orgToUse, auth_token: token }),
      });
      
      console.log('[ManageBookDetails] get-apps payload:', { par_custcode: custcode, par_orgcode: orgToUse });
      const data = await response.json();
      if (Array.isArray(data.data)) {
        const options = data.data.map((app: any) => ({
          value: app.appcode || app.code,
          label: app.applicationname || app.applicationName || app.appname || app.name || app.appcode || app.code,
        }));
        setAppsOptions(options);
      } else {
        console.error('[ManageBookDetails] get-apps returned no app list:', data);
        setAppsOptions([]);
      }
    } catch (error) {
      console.error('[ManageBookDetails] Failed to fetch apps:', error);
      setAppsOptions([]);
    } finally {
      appsFetchInFlight.current = false;
      setAppsLoading(false);
    }
  }, [selectedCustomerCode, selectedOrganization]);

  useEffect(() => {
    // Skip if this was triggered by fetchCustomers to avoid duplicate calls
    if (customersLoading) return;
    
    setSelectedOrganization(null);
    setOrganizationOptions([]);
    setSelectedApp(null);
    setAppsOptions([]);
    if (selectedCustomerCode && selectedCustomerCode !== '_ALL') {
      fetchOrganizationData();
    }
  }, [selectedCustomerCode, customersLoading]);

  useEffect(() => {
    // Skip if this was triggered by fetchOrganizationData to avoid duplicate calls
    if (organizationLoading || isCreatingStudyLO || isTaggingAgents) return;
    
    setSelectedApp(null);
    //setAppsOptions([]);
    if (selectedCustomerCode && selectedCustomerCode !== '_ALL' && selectedOrganization) {
      fetchAppsData();
    }
  }, [selectedOrganization, selectedCustomerCode, isCreatingStudyLO, isTaggingAgents, organizationLoading]);

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
    
    // Get customerCode and orgCode from userInfo for SSO
    let custCode = selectedCustomerCode;
    let orgCode = selectedOrganization;
    const sso = sessionStorage.getItem('isSSO') === 'true';
    
    try {
      const uiRaw = sessionStorage.getItem('userInfo');
      if (uiRaw) {
        const ui = JSON.parse(uiRaw || '{}');
        if (sso) {
          custCode = ui?.customerCode || ui?.customercode || selectedCustomerCode;
        }
        orgCode = ui?.orgCode || ui?.organizationcode || orgCode;
      }
    } catch { }
    
    //if (!orgCode) return;
    setBooksLoading(true);
    setBooksError(null);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      
      const payload = {
        par_customercode: custCode || '',
        par_organizationcode: orgCode || '',
        par_appcode: "AIG",  // Hardcoded for testing
        auth_token : token
      };
      console.log('[ManageBookDetails] get-books-details payload:', payload);
      
      const response = await fetch(API_ENDPOINTS.GET_BOOKS_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
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
        organizationcode: book.organizationcode || book.orgcode,
        appcode: book.appcode,
        isstudylocreated: book.isstudylocreated,
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
      const token = encodeURIComponent(await getKbAuthToken());
      const response = await fetch(API_ENDPOINTS.GET_CHAPTER_LO_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ par_bookid: bookId, auth_token: token }),
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

  // ========== SSO TYPE 4: Dynamic API Functions ==========
  // Fetch books details with dynamic SSO params
  const fetchBooksDetailsForSSO = useCallback(async (custcode: string, orgcode: string, appcode: string) => {
    console.log('[ManageBookDetails][SSO] fetchBooksDetailsForSSO called with params:', { custcode, orgcode, appcode });
    setBooksLoading(true);
    setBooksError(null);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      
      // Use passed parameters - only appcode hardcoded for testing
      const payload = {
        par_customercode: custcode || '',
        par_organizationcode: orgcode || '',
        par_appcode: "AIG",  // Hardcoded for testing
        auth_token: token
      };
      
      console.log('[ManageBookDetails][SSO] get-books-details FINAL payload:', JSON.stringify(payload, null, 2));
      
      const response = await fetch(API_ENDPOINTS.GET_BOOKS_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();
      const books = Array.isArray(data) ? data : (data.data || []);
      console.log('[ManageBookDetails][SSO] Books fetched:', books.length);
      
      // Find the book with hardcoded name and select it
      const ssoBookName = sessionStorage.getItem('bookname') || sessionStorage.getItem('ssoBookName') || '';
      const ssoBookId = Number(sessionStorage.getItem('book_id') || sessionStorage.getItem('ssoBookId') || '0');
      
      const targetBook = books.find((b: any) => 
        (!!ssoBookName && (b.bookname || b.name) === ssoBookName) || 
        (!!ssoBookId && (b.bookid || b.id) === ssoBookId)
      );
      
      const options = books.map((book: any) => ({
        value: book.bookname || book.name || '',
        label: book.bookname || book.name || '',
        bookId: book.bookid || book.id,
        organizationcode: book.organizationcode || book.orgcode,
        appcode: book.appcode,
        isstudylocreated: book.isstudylocreated,
      })).filter((option: any) => option.value);
      
      setBooksOptions(options);
      
      // Auto-select the SSO book if found
      if (targetBook) {
        console.log('[ManageBookDetails][SSO] Auto-selecting book:', targetBook.bookname || targetBook.name);
        setSelectedBook(targetBook.bookname || targetBook.name);
        setSelectedBookId(targetBook.bookid || targetBook.id);
      }
    } catch (error) {
      console.error('[ManageBookDetails][SSO] Error fetching books:', error);
      setBooksError(error?.message || 'Failed to fetch books');
      setBooksOptions([]);
    } finally {
      setBooksLoading(false);
    }
  }, []);

  // Fetch agent config with dynamic SSO params
  const fetchAgentConfigForSSO = useCallback(async (orgcode: string, custcode: string, appcode: string, sourcename: string) => {
    const effectiveSourceName = sourcename || sessionStorage.getItem('bookname') || sessionStorage.getItem('ssoBookName') || '';
    console.log('[ManageBookDetails][SSO] fetchAgentConfigForSSO called with:', { orgcode, custcode, appcode, sourcename: effectiveSourceName });
    setAgentConfigLoading(true);
    setAgentConfigError(null);
    try {
      const url = API_ENDPOINTS.GET_AGENT_CONFIG;
      const payload = {
        orgcode: orgcode,
        custcode: custcode,
        appcode: appcode,
        sourcename: effectiveSourceName,
      };
      console.log('[ManageBookDetails][SSO] Calling get-agent-config:', url, payload);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      console.log('[ManageBookDetails][SSO] Agent config response:', data);
      if (!response.ok) throw new Error(data?.message || 'Failed to fetch agent configuration');

      const results = Array.isArray(data?.results) ? data.results : [];
      setAgentConfig(results);
      console.log('[ManageBookDetails][SSO] Agent config loaded:', results.length, 'agents');

      // Default selections for agents
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
      setSelectedAgents(newSelections);
      setAgentPriorities(newPriorities);
    } catch (error: any) {
      console.error('[ManageBookDetails][SSO] Error fetching agent config:', error);
      setAgentConfigError(error?.message || 'Failed to load agent configuration');
    } finally {
      setAgentConfigLoading(false);
    }
  }, []);

  // Fetch chapter LO details with dynamic SSO params
  const fetchChapterLODetailsForSSO = useCallback(async (bookId: number) => {
    const effectiveBookId = Number(bookId || sessionStorage.getItem('book_id') || sessionStorage.getItem('ssoBookId') || '0');
    console.log('[ManageBookDetails][SSO] fetchChapterLODetailsForSSO called with bookId:', effectiveBookId);
    if (!effectiveBookId) return;
    setChapterLOLoading(true);
    setChapterLOError(null);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const response = await fetch(API_ENDPOINTS.GET_CHAPTER_LO_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ par_bookid: effectiveBookId, auth_token: token }),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();
      console.log('[ManageBookDetails][SSO] Chapter LO details response:', data);
      if (data.status === 'success' && Array.isArray(data.data)) {
        setChapterLODetails(data.data);
        console.log('[ManageBookDetails][SSO] Chapter LO details loaded:', data.data.length, 'records');
      } else {
        setChapterLODetails([]);
        setChapterLOError(data.message || 'No data found');
      }
    } catch (error) {
      console.error('[ManageBookDetails][SSO] Error fetching chapter LO details:', error);
      setChapterLOError(error?.message || 'Failed to fetch chapter LO details');
      setChapterLODetails([]);
    } finally {
      setChapterLOLoading(false);
    }
  }, []);

  // Fetch list book images with dynamic SSO params
  const fetchListBookImagesForSSO = useCallback(async () => {
    const dynamicBookName = sessionStorage.getItem('bookname') || sessionStorage.getItem('ssoBookName') || '';
    console.log('[ManageBookDetails][SSO] fetchListBookImagesForSSO called with bookname:', dynamicBookName);
    if (!dynamicBookName) {
      console.warn('[ManageBookDetails][SSO] No bookname found in sessionStorage');
      setExistingBookImage(null);
      return null;
    }
    setFetchingBookImages(true);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const url = `${API_ENDPOINTS.LIST_BOOK_IMAGES}?bookname=${encodeURIComponent(dynamicBookName)}&auth_token=${token}`;
      console.log('[ManageBookDetails][SSO] Calling list_book_images:', url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();
      console.log('[ManageBookDetails][SSO] list_book_images response:', data);
      
      // Set the cover image if present in response
      if (data?.status === 'success' && Array.isArray(data.images) && data.images.length > 0) {
        const firstImage = data.images[0];
        const imageUrl = firstImage.backend_download_url || null;
        console.log('[ManageBookDetails][SSO] Setting cover image:', imageUrl);
        setExistingBookImage(imageUrl);
        setExistingImageDeleted(false);
      } else {
        console.log('[ManageBookDetails][SSO] No images found in response');
        setExistingBookImage(null);
      }
      
      return data;
    } catch (error) {
      console.error('[ManageBookDetails][SSO] Error fetching list book images:', error);
      setExistingBookImage(null);
      return null;
    } finally {
      setFetchingBookImages(false);
    }
  }, []);

  // ========== END SSO TYPE 4 Functions ==========

  // Delete Chapter & LO details
  const handleDeleteChapterLO = useCallback(async () => {
    if (!pendingChapterLODelete || !selectedBookId) return;
    setChapterLODeleteLoading(true);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
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
          pendingChapterLODelete.learningoutcomenameid ||
          pendingChapterLODelete.learningoutcomeid ||
          pendingChapterLODelete.loid ||
          pendingChapterLODelete.lo_id ||
          0
        ),
        par_pagenumber: "",
        par_status: "",
        auth_token: token
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
      const token = encodeURIComponent(await getKbAuthToken());
      const response = await fetch(API_ENDPOINTS.DELETE_ALL_CHAPTER_LO_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ par_bookid: selectedBookId, auth_token: token }),
      });

      const data = await response.json();
      if (response.ok) {
        setChapterLODetails([]);
        setShowChapterLODeleteDialog(false);
        setChapterLODeleteType('all');
        setShowChapterLOSuccessDialog(true);
        setPendingChapterLODelete(null);
        setIsAddingNewChapterLO(false);
        setEditingChapterLOIndex(null);
        setEditingChapterLOBackup(null);
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

  // Delete Book Details
  const handleDeleteBookDetails = useCallback(async () => {
    if (!bookToDelete) return;
    setBookDeleteLoading(true);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const payload = {
        bookdetails_id: bookToDelete.bookId,
        soursename: bookToDelete.label || '',
        auth_token: token
      };

      const response = await fetch(API_ENDPOINTS.DELETE_BOOK_DETAILS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Close delete dialog and show success message
        setShowBookDeleteDialog(false);
        setBookToDelete(null);
        toast({
          title: 'Success',
          description: 'Book details deleted successfully!',
        });
        
        // Refresh the books list
        if (selectedCustomerCode && selectedCustomerCode !== '_ALL') {
          fetchBooksDetails();
        }
      } else {
        throw new Error('Failed to delete book details');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete book details. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBookDeleteLoading(false);
    }
  }, [bookToDelete, selectedCustomerCode, fetchBooksDetails]);

  // Update Chapter & LO details
  const updateChapterLO = useCallback(async (item: any) => {
    if (!selectedBookId) return;
    setChapterLOLoading(true);
    setChapterLOError(null);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const payload = {
        par_bookid: selectedBookId,
        par_chaptername: String(item.chaptername || item.chapter_name || ''),
        par_chapterid: Number(item.chapternameid || item.chapterid || item.chapter_id || 0) || 0,
        par_loname: String(item.learningoutcomename || item.loname || item.lo_name || ''),
        par_loid: Number(item.learningoutcomenameid || item.loid || item.lo_id || 0) || 0,
        par_pagenumber: String(item.pagenumber || item.page_number || ''),
        auth_token: token
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
      const token = encodeURIComponent(await getKbAuthToken());
      const payload = {
        par_bookid: selectedBookId,
        par_chaptername: String(item.chaptername || ''),
        par_chapterid: 0, // New row, so ID is 0
        par_loname: String(item.learningoutcomename || ''),
        par_loid: 0, // New row, so ID is 0
        par_pagenumber: String(item.pagenumber || ''),
        auth_token: token
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
      
      // In SSO mode, auto-set selectedApp to "AIG"
      if (isSSO && isCreatingStudyLO) {
        setSelectedApp('AIG');
        setAppSearchQuery('AIG');
      }
    }
  }, [isCreatingStudyLO, isTaggingAgents, selectedCustomerCode, isSSO]);

  useEffect(() => {
    if ((isCreatingStudyLO || isTaggingAgents) && selectedOrganization && selectedCustomerCode) {
      // In SSO mode, set app to AIG instead of fetching
      if (isSSO) {
        setSelectedApp('AIG');
        setAppSearchQuery('AIG');
      } else {
        fetchAppsData();
      }
    }
  }, [isCreatingStudyLO, isTaggingAgents, selectedOrganization, selectedCustomerCode, isSSO]);

  // Fetch chapter LO details when book is selected in Study LO mode
  useEffect(() => {
    if (isCreatingStudyLO && selectedBookId) {
      fetchChapterLODetails(selectedBookId);
    }
  }, [isCreatingStudyLO, selectedBookId]);

  // Fetch existing cover image when entering Edit Study LO
  useEffect(() => {
    if (isCreatingStudyLO && selectedBookId) {
      fetchBookImages(selectedBookId);
    }
  }, [isCreatingStudyLO, selectedBookId]);

  // Populate edit form state when entering Edit Study LO
  useEffect(() => {
    if (isCreatingStudyLO && editingBookDetails) {
      setEditBookId(editingBookDetails.bookId || null);
      setEditBookName(editingBookDetails.label || editingBookDetails.bookName || "");
      setEditSelectedOrganization(editingBookDetails.organizationcode || editingBookDetails.orgcode || "");
      setEditSelectedApp(editingBookDetails.appcode || "");
    }
  }, [isCreatingStudyLO, editingBookDetails]);

  useEffect(() => {
    if (editingBookDetails && appsOptions.length > 0) {
      setSelectedApp(editingBookDetails.appcode);
    }
  }, [editingBookDetails, appsOptions]);

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
    if (selectedCustomerCode && selectedOrganization) {
      fetchBooksDetails();
    }
  }, [selectedCustomerCode, selectedOrganization, selectedApp]);

  useEffect(() => {
    if (selectedCustomerCode && selectedCustomerCode !== '_ALL') {
      fetchBooksDetails();
    }
  }, [selectedCustomerCode]);

  useEffect(() => {
    if (isCreatingStudyLO && selectedCustomerCode) {
      fetchBooksDetails();
    }
  }, [isCreatingStudyLO, selectedCustomerCode]);

  // Arriving from the question generator for a book without Study / LO: open the same
  // page the book's Create Study LO (or Edit Study LO) button opens, once the book list
  // has loaded. If the book is not in the list, it is left in the search box instead.
  useEffect(() => {
    const wanted = pendingStudyLOBook.current;
    if (!wanted || booksLoading || booksOptions.length === 0) return;
    pendingStudyLOBook.current = '';
    // Drop the state so a refresh does not reopen the page.
    navigate(location.pathname, { replace: true, state: null });

    const book = booksOptions.find(
      (b) => (b.label || '').trim().toLowerCase() === wanted.toLowerCase()
    );
    if (!book) {
      setSearchQuery(wanted);
      return;
    }
    if (book.isstudylocreated == 1) {
      setEditingBookDetails(book);
    }
    setIsCreatingStudyLO(true);
    setSelectedBook(book.label);
    setSelectedBookId(book.bookId);
    setSelectedOrganization(book.organizationcode);
    setSelectedApp(book.appcode);
    fetchAppsData();
  }, [booksOptions, booksLoading]);
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

      // For SSO Type 4, use hardcoded book name; otherwise use selectedBook
      const isSSOType4 = isSSO && sessionStorage.getItem('loginType') === '4';
      const ssoBookName = sessionStorage.getItem('bookname') || sessionStorage.getItem('ssoBookName') || '';
      const sourcename = isSSOType4 ? ssoBookName : selectedBook;

      // Prepare payload per requirement
      const payload = {
        orgcode: selectedOrganization,
        custcode: selectedCustomerCode,
        appcode: selectedApp,
        agentname,
        agentstatus,
        sourcename
      };
      
      console.log('[ManageBookDetails] handleAddAgents insert_agent_config payload:', { isSSOType4, sourcename, payload });

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
          toast({ title: 'Success', description: 'configuration saved successfully' });

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
        toast({
          title: 'Study LO Document Uploaded',
          description: `File '${file.name}' has been successfully uploaded.`,
        });
    }
  };

  // Optimized file input handler for Study LO upload
  const handleStudyLOFileInput = () => {
    if (studyLoFileInputRef.current) {
      studyLoFileInputRef.current.click();
    }
  };

  // Pre-create file input to avoid delays
  useEffect(() => {
    if (!studyLoFileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.style.display = 'none';
      
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
          toast({
            title: 'Study LO Document Uploaded',
            description: `File '${file.name}' has been successfully uploaded.`,
          });
        }
        // Clear the input value to allow re-selecting the same file
        input.value = '';
      };
      
      studyLoFileInputRef.current = input;
      document.body.appendChild(input);
    }

    return () => {
      if (studyLoFileInputRef.current && studyLoFileInputRef.current.parentNode) {
        studyLoFileInputRef.current.parentNode.removeChild(studyLoFileInputRef.current);
      }
    };
  }, []);

  // Pre-create cover image input to avoid delays
  useEffect(() => {
    if (!coverImageInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/jpg';
      input.style.display = 'none';
      
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
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
            return;
          }

          setCoverImage(file);
          toast({
            title: "Image Uploaded",
            description: `Image has been successfully uploaded.`,
          });
        }
        // Clear the input value to allow re-selecting the same file
        input.value = '';
      };
      
      coverImageInputRef.current = input;
      document.body.appendChild(input);
    }

    return () => {
      if (coverImageInputRef.current && coverImageInputRef.current.parentNode) {
        coverImageInputRef.current.parentNode.removeChild(coverImageInputRef.current);
      }
    };
  }, []);

  // Pre-create edit cover image input to avoid delays
  useEffect(() => {
    if (!editCoverImageInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/jpg';
      input.style.display = 'none';
      
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
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
            return;
          }

          setEditCoverImage(file);
          toast({
            title: "Image Uploaded",
            description: `Image has been successfully uploaded.`,
          });
          setExistingImageDeleted(true);
        }
        // Clear the input value to allow re-selecting the same file
        input.value = '';
      };
      
      editCoverImageInputRef.current = input;
      document.body.appendChild(input);
    }

    return () => {
      if (editCoverImageInputRef.current && editCoverImageInputRef.current.parentNode) {
        editCoverImageInputRef.current.parentNode.removeChild(editCoverImageInputRef.current);
      }
    };
  }, []);
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
      // Skip if editingBookDetails, as it was already called by handleAddAgents in handleStudyLOSubmitEnhanced
      if (!editingBookDetails && selectedCustomerCode && selectedOrganization && selectedApp && selectedBook) {
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

        // For SSO Type 4, bind sourcename from session (get-book-id-name); otherwise use selectedBook
        const isSSOType4 = isSSO && sessionStorage.getItem('loginType') === '4';
        const ssoBookName = sessionStorage.getItem('bookname') || sessionStorage.getItem('ssoBookName') || '';
        const sourcename = isSSOType4 ? ssoBookName : selectedBook;
        
        const agentConfigPayload = {
          orgcode: selectedOrganization,
          custcode: selectedCustomerCode,
          appcode: selectedApp,
          agentname,
          agentstatus,
          sourcename
        };
        
        console.log('[ManageBookDetails] insert_agent_config payload:', { isSSOType4, sourcename, payload: agentConfigPayload });

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
              sourcename,
            };
            console.log('[ManageBookDetails] get-agent-config payload after insert:', getPayload);
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
      const token = encodeURIComponent(await getKbAuthToken());
      const formData = new FormData();
      formData.append('book_id', String(selectedBookId ?? ""));
      formData.append('file', studyLODocuments[0]);
      formData.append('auth_token', token);
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

  // Enhanced Submit to also update book image when replaced
  const handleStudyLOSubmitEnhanced = async () => {
    try {
      setCreateSubmitting(true);

      // --- SUBMIT AGENT CONFIG using existing handleAddAgents function in Edit Study LO mode ---
      if (editingBookDetails) {
        await handleAddAgents();
      }

      // Handle book image update if either existing image is deleted or new image is uploaded
      const needUpdateBook = existingImageDeleted || !!editCoverImage;
      if (needUpdateBook) {
        await handleEditBookSubmit();
      }
      if (studyLODocuments.length > 0) {
        await handleStudyLOSubmit();
      }

      // Navigate back on successful submission
      if (!isSSO) {
        handleBackNavigation();
      }
    } catch (error) {
      console.error('Error in handleStudyLOSubmitEnhanced:', error);
      toast({
        title: "Error",
        description: "Failed to update Study LO configuration",
        variant: "destructive"
      });
    } finally {
      setCreateSubmitting(false);
    }
  };

  useEffect(() => {
    if (isCreating) {
      // when entering create form, fetch orgs for selected customer
      if (!isSSO) {
        setSelectedOrganization(null);
      }
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
  // Only check book availability if we're in create mode and have valid selections
  if (!isCreating || !bookName.trim() || bookNameFormatError || !selectedCustomerCode || !selectedOrganization || !selectedApp) {
    setBookNameCheckStatus("unknown");
    setBookNameCheckMsg("");
    if (bookNameCheckTimer) clearTimeout(bookNameCheckTimer);
    return;
  }

  setBookNameCheckStatus("checking");
  setBookNameCheckMsg("");
  if (bookNameCheckTimer) clearTimeout(bookNameCheckTimer);

  const handle = setTimeout(async () => {
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const resp = await fetch(API_ENDPOINTS.CHECK_BOOK, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          custcode: selectedCustomerCode,
          orgcode: selectedOrganization,
          appcode: selectedApp,
          bookname: bookName.trim(),
          auth_token: token
        }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP error ${resp.status}`);
      }

      const json = await resp.json().catch(() => ({}));
      const status = String(json?.status || "").toUpperCase();

      if (status.startsWith("E001")) {
        setBookNameCheckStatus("exists");
        setBookNameCheckMsg("A book with this name already exists.");
      } else if (status.startsWith("NE001")) {
        setBookNameCheckStatus("not_exists");
        setBookNameCheckMsg("Name is available.");
      } else {
        setBookNameCheckStatus("unknown");
        setBookNameCheckMsg("");
      }
    } catch (e) {
      setBookNameCheckStatus("error");
      setBookNameCheckMsg("Failed to check book availability.");
    }
  }, 2000); // debounce delay

  setBookNameCheckTimer(handle as any);
  return () => clearTimeout(handle);
  // eslint-disable-next-line
}, [bookName,bookNameFormatError,selectedCustomerCode,selectedOrganization,selectedApp,isCreating,]);

  // Function to handle Create Book API call
  const handleCreateBook = async () => {
    // Validation
    if (!bookName.trim() && !selectedApp) {
      toast({
        title: "Validation Error",
        description: " App details and Book name are required.",
        variant: "destructive"
      });
      return;
    }

    if (!bookName.trim()) {
      toast({
        title: "Validation Error",
        description: "Book name is required.",
        variant: "destructive"
      });
      return;
    }

    if (bookNameFormatError) {
      toast({
        title: "Validation Error", 
        description: bookNameFormatError,
        variant: "destructive"
      });
      return;
    }

    if (bookNameCheckStatus === "exists") {
      toast({
        title: "Validation Error",
        description: "A book with this name already exists. Please choose a different name.",
        variant: "destructive"
      });
      return;
    }

    if (!selectedCustomerCode) {
      toast({
        title: "Validation Error",
        description: "Customer is required.",
        variant: "destructive"
      });
      return;
    }

    // Get organization code from state or session
    let orgCode = selectedOrganization;
    if (!orgCode) {
      try {
        const uiRaw = sessionStorage.getItem('userInfo');
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || '{}');
          orgCode = ui?.orgCode || ui?.organizationcode || '';
        }
      } catch { }
    }
    if (!orgCode) {
      orgCode = sessionStorage.getItem('orgCode') || '';
    }

    if (!orgCode) {
      toast({
        title: "Validation Error",
        description: "Organization is required.",
        variant: "destructive"
      });
      return;
    }

    if (!isSSO && !selectedApp) {
      toast({
        title: "Validation Error",
        description: "Application is required.",
        variant: "destructive"
      });
      return;
    }

    setCreateSubmitting(true);

    try {
      // Create FormData to send form fields and image file
      const token = encodeURIComponent(await getKbAuthToken());
      const formData = new FormData();
      
      // Add individual form fields
      formData.append('par_bookname', bookName.trim());
      formData.append('par_custcode', selectedCustomerCode);
      // In SSO mode, hardcode par_appcode to "AIG"
      formData.append('par_appcode', isSSO ? 'AIG' : selectedApp);
      formData.append('par_orgcode', orgCode);
      formData.append('par_bookidentifier', ''); // Optional field
      formData.append('par_bookid', '0');
      formData.append('auth_token', token);
      
      // Add image file if present
      if (coverImage) {
        formData.append('image_files', coverImage);
      }

      const response = await fetch(API_ENDPOINTS.SAVE_BOOK, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to create book');
      }

      // Success
      toast({
        title: "Success",
        description: "Book created successfully!",
      });

      // Reset form and close create mode
      clearCreateForm();
      if (!isSSO) {
        setIsCreating(false);
      }
      
      // Refresh the books list (works for both SSO and non-SSO modes)
      if (isSSO) {
        // In SSO mode, just refresh the books list
        await fetchBooksDetails();
        await fetchListBookImagesForSSO();
      } else {
        // In non-SSO mode, refresh both apps and books
        if (selectedCustomerCode && orgCode) {
          await fetchData(selectedCustomerCode, orgCode);
          await fetchBooksDetails();
        }
      }
      
      // Force a small delay to ensure data is refreshed before navigating
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.error('Error creating book:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create book. Please try again.",
        variant: "destructive"
      });
  } finally {
      setCreateSubmitting(false);
    }
  };

  // Function to clear all create form fields
  const clearCreateForm = useCallback((preserveOrgApp: boolean = false) => {
    setBookName('');
    setBookNameFormatError(null);
    setBookNameCheckStatus("unknown");
    setBookNameCheckMsg("");
    if (bookNameCheckTimer) clearTimeout(bookNameCheckTimer);
    setSelectedBookId(null);
    setCoverImage(null);
    if (!preserveOrgApp) {
    setSelectedOrganization(null);
    setSelectedApp(null);
    }
    setCreateSubmitting(false);
    if (!preserveOrgApp) {
    setOrganizationOptions([]);
    setAppsOptions([]);
    }
    setSelectedBook('');
  }, []);


  // Function to clear edit form
  const clearEditForm = () => {
    setIsEditingBook(false);
    setEditBookName('');
    setEditBookNameFormatError(null);
    setEditCoverImage(null);
    setExistingBookImage(null);
    setExistingImageDeleted(false);
    setEditBookId(null);
    setEditSelectedOrganization('');
    setEditSelectedApp('');
  };

  // Function to fetch existing book images
  const fetchBookImages = async (bookId: number) => {
    setFetchingBookImages(true);
    try {
      // First get the book details to get the book name
      const book = booksOptions.find(b => b.bookId === bookId);
      if (!book) {
        console.error('Book not found for bookId:', bookId);
        setExistingBookImage(null);
        return;
      }

      const token = encodeURIComponent(await getKbAuthToken());
      const response = await fetch(`${API_ENDPOINTS.LIST_BOOK_IMAGES}?bookname=${encodeURIComponent(book.label || '')}&auth_token=${token}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    const data = await response.json();
    if (data.status === 'success' && Array.isArray(data.images) && data.images.length > 0) {
      // Get the first image as the existing cover image
      const firstImage = data.images[0];
      const imageUrl = firstImage.backend_download_url || null;
      setExistingBookImage(imageUrl);
    } else {
        setExistingBookImage(null);
      }
    } catch (error) {
      console.error('Failed to fetch book images:', error);
      setExistingBookImage(null);
    } finally {
      setFetchingBookImages(false);
    }
  };

  // Function to handle edit book submit
  const handleEditBookSubmit = async () => {
    // Validation
    if (!editBookName.trim()) {
      toast({
        title: "Validation Error",
        description: "Book name is required.",
        variant: "destructive"
      });
      return;
    }

    if (editBookNameFormatError) {
      toast({
        title: "Validation Error",
        description: editBookNameFormatError,
        variant: "destructive"
      });
      return;
    }

    // For Edit Study LO mode, check selectedOrganization instead of editSelectedOrganization
    const orgValue = isCreatingStudyLO && editingBookDetails ? selectedOrganization : editSelectedOrganization;
    if (!orgValue) {
      toast({
        title: "Validation Error",
        description: "Organization is required.",
        variant: "destructive"
      });
      return;
    }

    // For Edit Study LO mode, check selectedApp instead of editSelectedApp
    const appValue = isCreatingStudyLO && editingBookDetails ? selectedApp : editSelectedApp;
    if (!appValue) {
      toast({
        title: "Validation Error",
        description: "App is required.",
        variant: "destructive"
      });
      return;
    }

    // Cover image validation removed - allow proceeding without image

    setEditBookSubmitting(true);

    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const formData = new FormData();
      formData.append('par_bookname', editBookName);
      formData.append('par_custcode', selectedCustomerCode);
      formData.append('par_appcode', appValue);
      formData.append('par_orgcode', orgValue);
      formData.append('par_bookidentifier', ''); // Optional field
      formData.append('par_bookid', String(editBookId));
      formData.append('auth_token', token);
      
      // Add image file if present
      if (editCoverImage) {
        formData.append('image_files', editCoverImage);
      }
      
      // Flag to delete existing image
      if (existingImageDeleted) {
        formData.append('delete_existing_image', 'true');
      }

      const response = await fetch(API_ENDPOINTS.SAVE_BOOK, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to update book');
      }

      toast({
        title: "Success",
        description: "Book updated successfully!",
      });

      // Reset form and close edit mode
      clearEditForm();

      // In SSO mode, keep the user on the current in-page flow (Edit LO / Create flows)
      // and do not switch back to the main Manage Book Details view.
      if (!(isSSO && isCreatingStudyLO)) {
        // Close Study LO modal and return to main view
        setIsCreatingStudyLO(false);
        setEditingBookDetails(null);
        setIsViewingGuidelines(false);
        setIsChatMode(false);
        setIsTaggingAgents(false);
        setSelectedKBForChat(null);
        clearCreateForm();
      }
      
      // Refresh the apps and books list
      if (selectedCustomerCode && selectedOrganization) {
        await fetchData(selectedCustomerCode, selectedOrganization);
        await fetchBooksDetails();
      }
      
      if (isSSO) {
        await fetchListBookImagesForSSO();
      } else if (editBookId) {
        await fetchBookImages(editBookId);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update book. Please try again.",
        variant: "destructive"
      });
    } finally {
      setEditBookSubmitting(false);
    }
  };

  const removeCoverImage = () => {
    setCoverImage(null);
  };

  const filteredBooks = booksOptions.filter((book) => {
    const matchesSearch = (book.label || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Show PageLoader during initial data loading scenarios
  if (customersLoading || (organizationLoading && selectedCustomerCode) || (appsLoading && selectedOrganization)) {
    return <PageLoader text="Loading data..." />;
  } 

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Desktop Sidebar */}
        {!isSSO && (
          <div className="fixed left-0 top-0 h-full w-52 z-40 hidden lg:block">
            {isSuperAdmin ? <SuperAdminSidebar /> : <AppSidebar />}
          </div>
        )}

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
            <div className="relative bg-white border-b border-slate-200">
              <div className="relative px-4 sm:px-6 py-3">
              <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {(isCreating || isCreatingStudyLO || isViewingGuidelines || isChatMode || isTaggingAgents || isEditingBook) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="back to page"
                    onClick={handleBackNavigation}
                        className="h-8 w-8 flex-shrink-0 -ml-2 text-slate-600 hover:text-slate-900"
                        aria-label="Back"
                      >
                        <ArrowLeft className="w-4 h-4" />
                  </Button>
                )}
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 p-1">
                  <div className="h-full w-full rounded-xl bg-blue-600 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-white" />
                  </div>
                </div>
                    <div className="flex flex-col min-w-0">
                      <h1 className="text-base sm:text-xl font-medium text-slate-900 leading-tight tracking-tight truncate">
                    {isCreating
                      ? "Create Book Details"
                      : isCreatingStudyLO
                          ? editingBookDetails ? "Edit Study LO" : "Create Study LO"
                          : isTaggingAgents
                            ? "Tag Agents"
                                : isChatMode && selectedKBForChat?.bookName
                                  ? `Knowledge Base: ${selectedKBForChat.bookName}`
                                  : "Manage Book Details"}
                  </h1>
                  <p className="text-xs text-slate-500 truncate">
                        {isCreating
                          ? "Configure a new book entry"
                          : isCreatingStudyLO
                            ? "Upload a CSV to create study learning outcomes"
                            : isTaggingAgents
                              ? "Assign and configure agents for this book"
                              : isChatMode
                                ? "Chat with your knowledge base"
                                : isEditingBook
                                  ? "Update existing book details"
                                  : "Manage and organize your book catalog"}
                      </p>
                  {isChatMode && selectedKBForChat && (
                    <p className="text-sm text-gray-600">
                      Customer: {
                        customers.find((c) => c.customercode === selectedCustomerCode)?.customername || selectedCustomerCode
                      }
                    </p>
                  )}
                </div>
              </div>
              {!isCreatingStudyLO && (
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
                )}
            </div>
            </div>
          </div>
          )}

          {/* Main Content */}
          <main className="p-6">
                        <BackToTop loading={kbLoading || isCreating || isCreatingStudyLO || isEditingBook} />
            <div className="max-w-7xl mx-auto space-y-6">
              {isTaggingAgents ? (
                <>
                  {/* Organization and Apps Details - Same Row (for Tag Agents) */}
                  <div className="flex flex-col lg:flex-row gap-4">
                    {/* Select Organization Card */}
                    <Card className="border border-gray-200/70 bg-white rounded-2xl flex-1">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-blue-900">Select Organization</h3>
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
                          <SelectTrigger className="bg-white border-blue-200 focus:border-purple-400 focus:ring-purple-400/20">
                            <SelectValue placeholder={organizationLoading ? "Loading organizations..." : "Select an organization"} />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            {organizationOptions.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {organizationLoading && (
                          <p className="text-sm text-blue-600 mt-1">Loading organizations...</p>
                        )}
                      </CardContent>
                    </Card>
                    {/* Apps Details Card */}
                    <Card className="border border-gray-200/70 bg-white rounded-2xl flex-1">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-blue-700">Apps Details</h3>
                        <Select
                          value={selectedApp ?? ''}
                          onValueChange={setSelectedApp}
                          disabled
                        >
                          <SelectTrigger className="bg-white border-blue-100 focus:border-indigo-400 focus:ring-indigo-400/20">
                            <SelectValue placeholder={appsLoading ? "Loading apps..." : (!selectedOrganization ? "Select an organization first" : "Select an app")} />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            {appsOptions.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {appsLoading && (
                          <p className="text-sm text-blue-700 mt-1">Loading apps...</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Agent Configuration Card */}
                  {selectedOrganization && selectedApp && (
                    <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-gray-900">Agent Configuration</h3>
                        </div>
                        {agentConfigLoading && (
                          <div className="flex items-center justify-center py-8">
                            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            <span className="ml-2 text-blue-700">Loading agent configuration...</span>
                          </div>
                        )}
                        {agentConfigError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-700">{agentConfigError}</p>
                          </div>
                        )}
                        {!agentConfigLoading && (
                          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-blue-50 border-b-2 border-blue-200 hover:bg-blue-50">
                                    <TableHead className="font-semibold text-blue-900 py-4">Agent Name</TableHead>
                                    <TableHead className="font-semibold text-blue-900 py-4">Select</TableHead>
                                    <TableHead className="font-semibold text-blue-900 py-4">Priority</TableHead>
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
                                        <TableRow key={key} className="hover:bg-blue-50/50 transition-colors border-b border-blue-100">
                                          <TableCell className="font-medium text-gray-900 py-4">{key}</TableCell>
                                          <TableCell className="py-4">
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              disabled={isFixed || !editable}
                                              title={isFixed ? "Default agent - always enabled" : editable ? "" : "Always enabled"}
                                              className="h-4 w-4 text-blue-600 border-gray-300 rounded disabled:opacity-50"
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
                            className="bg-blue-600 hover:bg-blue-700 text-white"
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
                  {/* Check if SSO Type 4 - hide dropdowns in this mode */}
                  {(() => {
                    const isSSOType4 = isSSO && sessionStorage.getItem('loginType') === '4';
                    if (isSSOType4) {
                      const ssoBookName = sessionStorage.getItem('bookname') || sessionStorage.getItem('ssoBookName') || selectedBook || '';
                      return (
                        <>
                          {/* Select Book Card - Full Width */}
                          <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                            <CardContent className="p-6 space-y-3">
                              <h3 className="text-lg font-semibold text-blue-900">Selected Book</h3>
                              <Input value={ssoBookName} readOnly disabled={true} />
                            </CardContent>
                          </Card>
                        </>
                      );
                    }
                    return (
                      <>
                  {/* Select Book Card - Full Width */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6 space-y-3">
                      <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-grey-800">Selected Book</h3>
                          </div>
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
                              disabled={true}
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
                              className="w-full pr-10 rounded-full bg-white border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
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
                    <Card className="border border-gray-200/70 bg-white rounded-2xl flex-1">
                      <CardContent className="p-6 space-y-3">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-grey-800">Selected Organization</h3>
                          </div>
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
                          <SelectTrigger className="bg-white border-blue-200 rounded-full focus:border-purple-400 focus:ring-purple-400/20">
                              <SelectValue placeholder={organizationLoading ? "Loading organizations..." : selectedBook ? "Select an organization" : "Please select a book first"} />
                            </SelectTrigger>
                            <SelectContent className="bg-white z-50">
                              {organizationOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        {organizationLoading && (
                          <p className="text-sm text-blue-600 mt-1">Loading organizations...</p>
                        )}
                      </CardContent>
                    </Card>
                    {/* Apps Details Card */}
                    <Card className="border border-gray-200/70 bg-white rounded-2xl flex-1">
                      <CardContent className="p-6 space-y-3">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-grey-800">Selected App</h3>
                          </div>
                          {isSSO ? (
                            <Input
                              value="Advanced Item Generator"
                              disabled
                              className="bg-white border-grey-100 focus:border-indigo-400 focus:ring-indigo-400/20"
                            />
                          ) : (
                            <Select
                              value={selectedApp ?? ''}
                              onValueChange={setSelectedApp}
                              onOpenChange={() => {}}
                              disabled
                            >
                              <SelectTrigger className="bg-white border-blue-100 rounded-full focus:border-indigo-400 focus:ring-indigo-400/20">
                                <SelectValue placeholder={appsLoading ? "Loading apps..." : (!selectedOrganization ? "Select an organization first" : "Select an app")}>
                                  {selectedApp && appsOptions.find(app => app.value === selectedApp)?.label}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="bg-white z-50">
                                {appsOptions.map(o => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        {appsLoading && (
                          <p className="text-sm text-blue-700 mt-1">Loading apps...</p>
                        )}
                    </CardContent>
                  </Card>
                      </div>
                      </>
                    );
                  })()}

                  {/* Upload Section Card (Cover Image Upload like Edit Book Details) - Only show for Edit Study LO */}
                  {editingBookDetails && (
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-gray-900">File Uploads</h3>
                      </div>

                      <div className={`grid grid-cols-1 gap-6`}>
                        <div className="space-y-2 flex-1">
                            <label className="text-sm font-medium text-slate-700">Cover Image Upload</label>
                            <div
                              className={`block bg-white border-2 border-dashed rounded-lg p-8 text-center space-y-3 transition-colors cursor-pointer h-[200px] flex flex-col items-center justify-center ${isDraggingImage
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-slate-200 hover:border-slate-200'
                                }`}
                              onDragOver={handleImageDragOver}
                              onDragLeave={handleImageDragLeave}
                              onDrop={handleEditImageDrop}
                              onClick={handleEditCoverImageClick}
                            >
                              <div className="flex justify-center">
                                <div className={`p-3 rounded-lg transition-colors ${isDraggingImage ? 'bg-blue-200' : 'bg-blue-50'
                                  }`}>
                                  <FileText className={`h-8 w-8 transition-colors ${isDraggingImage ? 'text-blue-600' : 'text-blue-700'
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
                            </div>

                            {editCoverImage && (
                              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                                <p className="text-sm font-medium text-gray-900 mb-2">New uploaded image:</p>
                                {/* {editCoverImagePreviewUrl && (
                                  <img
                                    src={editCoverImagePreviewUrl}
                                    alt={editCoverImage?.name || "Cover Image Preview"}
                                    className="mb-4 rounded-lg max-h-48 w-auto border border-gray-200"
                                    style={{ maxWidth: 256, objectFit: "contain", background: "#f3f3f3" }}
                                  />
                                )} */}
                                <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <FileText className="h-4 w-4 text-slate-700 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 truncate">{editCoverImage.name}</span>
                                    <span className="text-xs text-gray-500 flex-shrink-0">
                                      ({(editCoverImage.size / 1024 / 1024).toFixed(2)} MB)
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditCoverImage(null)}
                                    className="h-7 w-7 flex-shrink-0 hover:bg-red-100 ml-2"
                                  >
                                    <X className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                      </div>
                    </CardContent>
                  </Card>
                  )}
                  {/* Existing Cover Image Card - Only show for Edit Study LO */}
                  {editingBookDetails && existingBookImage && !existingImageDeleted && (
                    <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                      <CardContent className="p-6">
                        <div className="mb-2 font-semibold text-gray-800">Existing Cover Image (stored)</div>
                        <div className="flex flex-col items-start gap-2">
                          <img
                            src={existingBookImage}
                            alt="Current Book Cover"
                            className="rounded-lg max-h-48 w-auto border border-gray-200 mb-2 cursor-pointer"
                            style={{ maxWidth: 256, objectFit: "contain", background: "#f3f3f3" }}
                            onClick={() => setImagePreviewOpen(true)}
                            onError={() => {
                              setExistingBookImage(null);
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setConfirmDialog({
                                open: true,
                                title: "Delete Cover Image",
                                message:
                                  "Are you sure you want to delete the cover image? This will be removed when you update the book.",
                                onConfirm: () => {
                                  setExistingImageDeleted(true);
                                  setExistingBookImage(null);
                                  setConfirmDialog((dlg) => ({ ...dlg, open: false }));
                                },
                                onCancel: () => setConfirmDialog((dlg) => ({ ...dlg, open: false })),
                              });
                            }}
                            className="border rounded-full border-red-200 text-red-600 px-3 hover:bg-red-50"
                          >
                            Delete Image
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {/* Agent Configuration Card */}
                  {selectedOrganization && selectedApp && (
                    <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-gray-900">Agent Configuration</h3>
                        </div>
                        {agentConfigLoading && (
                          <div className="flex items-center justify-center py-8">
                            <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            <span className="ml-2 text-blue-700">Loading agent configuration...</span>
                          </div>
                        )}
                        {agentConfigError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-700">{agentConfigError}</p>
                          </div>
                        )}
                        {!agentConfigLoading && (
                          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-gray-100 border-b-2 border-gray-200 hover:bg-gray-100">
                                    <TableHead className="font-semibold text-gray-900 py-4">Agent Name</TableHead>
                                    <TableHead className="font-semibold text-gray-900 py-4">Select</TableHead>
                                    <TableHead className="font-semibold text-gray-900 py-4">Priority</TableHead>
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
                                        <TableRow key={key} className="hover:bg-gray-50/50 transition-colors border-b border-gray-100">
                                          <TableCell className="font-medium text-gray-900 py-4">{key}</TableCell>
                                          <TableCell className="py-4">
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              disabled={isFixed || !editable}
                                              title={isFixed ? "Default agent - always enabled" : editable ? "" : "Always enabled"}
                                              className="h-4 w-4 text-gray-600 border-gray-300 rounded disabled:opacity-50"
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
                            className="bg-blue-600 rounded-full hover:bg-blue-700 text-white"
                            disabled={agentConfigLoading}
                          >
                            Tag Agents
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {/* Chapter & LO Details Card */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-grey-800">Chapter & LO Details</h3>
                          </div>
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
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-gray-100 border-b-2 border-gray-200 hover:bg-gray-100">
                                  <TableHead className="font-semibold text-gray-900 py-4">Chapter Name</TableHead>
                                  <TableHead className="font-semibold text-gray-900 py-4">LO Name</TableHead>
                                  <TableHead className="font-semibold text-gray-900 py-4">Page Number</TableHead>
                                  <TableHead className="font-semibold text-gray-900 py-4">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {chapterLODetails.map((item, index) => (
                                  <TableRow key={index} className="hover:bg-gray-50/50 transition-colors border-b border-gray-100 last:border-b-0">
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
                            className="flex items-center gap-2 rounded-full border-blue-300 text-grey-700 hover:bg-blue-50 hover:border-blue-400"
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
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-gray-900">Upload Study LO Documents</h3>
                        </div>
                        {/* Sits with the upload it belongs to: the template is the CSV layout
                            this card expects. */}
                        <Button
                          type="button"
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full h-9 px-4 gap-2"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = API_ENDPOINTS.DOWNLOAD_STUDY_LO_TEMPLATE;
                            link.download = '';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                        >
                          <Download className="h-4 w-4" />
                          Download Template
                        </Button>
                      </div>
                      <div className={`bg-white border-2 border-dashed rounded-lg p-12 text-center space-y-4 transition-colors cursor-pointer ${isDraggingStudyLO
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-200'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={handleStudyLOFileInput}>
                        <div className="flex justify-center">
                          <div className={`p-4 rounded-lg transition-colors ${isDraggingStudyLO ? 'bg-blue-200' : 'bg-blue-50'
                            }`}>
                            <FileText className={`h-10 w-10 transition-colors ${isDraggingStudyLO ? 'text-blue-600' : 'text-blue-700'
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
                        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileText className="h-8 w-8 text-slate-700" />
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
                    <Card className="border-2 border-orange-100 bg-orange-50 rounded-2xl shadow-sm">
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
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex justify-end gap-2">
                        {!(isSSO && sessionStorage.getItem('loginType') === '4') && (
                          <Button
                            variant="outline"
                            onClick={handleBackNavigation}
                            className="border-gray-300 rounded-full text-gray-700 hover:bg-gray-50"
                            disabled={createSubmitting}
                          >
                            Cancel
                          </Button>
                        )}
                        <Button
                          className="bg-blue-600 rounded-full hover:bg-blue-700 text-white"
                          disabled={
                            createSubmitting ||
                            // For SSO Type 4, skip selectedBook check (hardcoded in API)
                            (!(isSSO && sessionStorage.getItem('loginType') === '4') && !selectedBook) ||
                            (editingBookDetails 
                              ? false  // Always enable Submit in Edit Study LO mode
                              : studyLODocuments.length === 0
                            )
                          }
                          onClick={handleStudyLOSubmitEnhanced}
                        >
                          {createSubmitting ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Submitting...
                            </>
                          ) : (
                            'Submit'
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : isCreating ? (
                /* Create Form */
                <>
                  {/* Level Type Selection Card */}
                 
                  {/* Organization and Apps Selection - Hidden for SSO */}
                  {!isSSO && (
                    <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-gray-900">Organization and Apps</h3>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Organization Select */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Select Organization <span className="text-red-500">*</span></label>
                            <Select value={selectedOrganization ?? ''} onValueChange={(v) => setSelectedOrganization(v)} disabled={organizationLocked || organizationLoading || !selectedCustomerCode}>
                              <SelectTrigger className="bg-white border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 disabled:opacity-50 disabled:cursor-not-allowed" disabled={organizationLocked || organizationLoading || !selectedCustomerCode}>
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
                            <label className="text-sm font-medium text-gray-700">Apps Details <span className="text-red-500">*</span></label>
                            <Select
                              value={selectedApp ?? ''}
                              onValueChange={(v) => setSelectedApp(v)}
                              onOpenChange={() => {}}
                            >
                              <SelectTrigger
                                className="bg-white border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  )}

                  {/* Basic Information Card */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">
                            Book Name <span className="text-red-500">*</span>
                          </label>
                              <Input
                                id="book-name-input"
                                placeholder="Enter Book name"
                                className="bg-white border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                value={bookName}
                                disabled={!isSSO && !selectedApp}
                                onChange={e => {
                                  setBookName(e.target.value);
                                  const val = e.target.value.trim();
                                  const len = val.length;
                                  const allowed = /^[A-Za-z0-9][A-Za-z0-9._-]{1,510}[A-Za-z0-9]$/;
                                  if (len === 0) setBookNameFormatError(null);
                                  else if (len < 3 || len > 512)
                                    setBookNameFormatError('Name must be 3-512 characters. Allowed: letters, numbers, ., _, - and must start/end with a letter or number.');
                                  else if (!allowed.test(val))
                                    setBookNameFormatError('Only [a-zA-Z0-9._-] allowed; must start and end with [a-zA-Z0-9]. No spaces.');
                                  else setBookNameFormatError(null);
                                }}
                              />
                              <div style={{ minHeight: 16 }}>
                                {bookNameFormatError ? (
                                  <span className="text-xs text-red-600">{bookNameFormatError}</span>
                                ) : bookNameCheckStatus === "checking" ? (
                                  <span className="text-xs text-blue-600">Checking...</span>
                                ) : bookNameCheckStatus === "exists" ? (
                                  <span className="text-xs text-red-600">{bookNameCheckMsg}</span>
                                ) : bookNameCheckStatus === "not_exists" ? (
                                  <span className="text-xs text-green-700">{bookNameCheckMsg}</span>
                                ) : bookNameCheckStatus === "error" ? (
                                  <span className="text-xs text-orange-600">{bookNameCheckMsg}</span>
                                ) : null}
                              </div>
                        </div>                        
                      </div>
                    </CardContent>
                  </Card>

                  {/* Upload Section Card */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-gray-900">File Uploads</h3>
                      </div>

                      <div className={`grid grid-cols-1 gap-6`}>
                        <div className="space-y-2 flex-1">
                            <label className="text-sm font-medium text-slate-700">Cover Image Upload</label>
                            <div
                              className={`block bg-white border-2 border-dashed rounded-lg p-8 text-center space-y-3 transition-colors cursor-pointer h-[200px] flex flex-col items-center justify-center ${isDraggingImage
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-slate-200 hover:border-slate-200'
                                }`}
                              onDragOver={handleImageDragOver}
                              onDragLeave={handleImageDragLeave}
                              onDrop={handleImageDrop}
                              onClick={handleCoverImageClick}
                            >
                              <div className="flex justify-center">
                                <div className={`p-3 rounded-lg transition-colors ${isDraggingImage ? 'bg-blue-200' : 'bg-blue-50'
                                  }`}>
                                  <FileText className={`h-8 w-8 transition-colors ${isDraggingImage ? 'text-blue-600' : 'text-blue-700'
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
                            </div>

                            {coverImage && (
                              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                                <p className="text-sm font-medium text-gray-900 mb-2">Uploaded image:</p>
                                {/* {coverImagePreviewUrl && (
                                  <img
                                    src={coverImagePreviewUrl}
                                    alt={coverImage?.name || "Cover Image Preview"}
                                    className="mb-4 rounded-lg max-h-48 w-auto border border-gray-200"
                                    style={{ maxWidth: 256, objectFit: "contain", background: "#f3f3f3" }}
                                  />
                                )} */}
                                <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <FileText className="h-4 w-4 text-slate-700 flex-shrink-0" />
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
                      </div>
                    </CardContent>
                  </Card>


                  {/* Action Buttons Card */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex justify-end gap-3">
                        {!(isSSO && sessionStorage.getItem('loginType') === '4') && (
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
                        )}
                        <Button 
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={handleCreateBook}
                          disabled={createSubmitting}
                        >
                          Create Book
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
                  {!isSSO && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card className="border-2 border-grey-100 bg-gradient-to-br from-grey-50 to-grey-100">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-xl font-semibold text-grey-800">Select Customer</h3>
                          </div>
                      <div className="relative customer-dropdown-container">
                          
                        <div className="relative">
                          <Input
                            type="text"
                            value={customerSearchQuery}
                            onChange={(e) => handleCustomerInputChange(e.target.value)}
                                                            onClick={handleCustomerInputFocus}
                            placeholder={customersLoading ? "Loading..." : getSelectedCustomerName()}
                            className="w-full pl-10 bg-white rounded-full border-grey-200 focus:border-grey-400 focus:ring-grey-400/20 cursor-pointer"
                            disabled={customersLoading || customerLocked}
                          />
                                                        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-grey-400" />
                                                    </div>

                          {showCustomerDropdown && !customersLoading && !customerLocked && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-grey-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                              {isSuperAdmin && (
                                <div
                                  className="px-3 py-2 cursor-pointer hover:bg-grey-50 border-b border-grey-100"
                                  onClick={() => handleCustomerSelect("_ALL", "All")}
                                >
                                  All
                                </div>
                              )}
                              {filteredCustomers.length > 0 ? (
                                filteredCustomers.map((customer: any) => (
                                  <div
                                    key={customer.customercode}
                                    className="px-3 py-2 cursor-pointer hover:bg-grey-50 border-b border-grey-100 last:border-b-0"
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

                            <Card className="border-2 border-grey-100 bg-gradient-to-br from-grey-50 to-grey-100">
                              <CardContent className="p-6">
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-xl font-semibold text-grey-800">Select Organization</h3>
                                </div>
                                

                                <div className="relative org-dropdown-container">
                                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-grey-400 z-10" />
                                  <div className="relative">
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
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-grey-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                                      <div
                                        className="px-3 py-2 cursor-pointer hover:bg-grey-50 border-b border-grey-100"
                                        onClick={() => handleOrgSelect('', 'All')}
                                      >
                                        All
                                      </div>
                                      {(organizationOptions || []).filter(o => !orgSearchQuery.trim() || o.label.toLowerCase().includes(orgSearchQuery.toLowerCase())).map((org: any) => (
                                        <div
                                          key={org.value}
                                          className="px-3 py-2 cursor-pointer hover:bg-grey-50 border-b border-grey-100 last:border-b-0"
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

                    <Card className="border-2 border-grey-100 bg-gradient-to-br from-grey-50 to-grey-100">
                      <CardContent className="p-6">
                          
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-xl font-semibold text-grey-800">Apps Details</h3>
                          </div>
                        
                        <div className="relative app-dropdown-container">
                          <div className="relative">
                          <Input
                            type="text"
                            value={appSearchQuery}
                            onClick={handleAppInputFocus}
                            placeholder={appsLoading ? "Loading..." : (appSearchQuery || "Select App")}
                            className="w-full pl-2 bg-white rounded-full border-gray-200 focus:border-blue-400 focus:ring-blue-400/20 cursor-pointer"
                            disabled={appsLoading || !selectedCustomerCode || selectedCustomerCode === '_ALL' || (!selectedOrganization && !organizationLocked && !appSearchQuery)}
                            readOnly
                          />
                                                        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                                                    </div>

                                                    {showAppDropdown && !appsLoading && selectedCustomerCode && selectedCustomerCode !== '_ALL' && selectedOrganization && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                              {(appsOptions || []).map((app: any) => (
                                <div
                                  key={app.value}
                                  className="px-3 py-2 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
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
                  )}


                  <div className="mt-4">
                    {customersLoading && <div className="text-xs text-gray-600">Loading customer list...</div>}
                    {customersError && <div className="text-xs text-red-600">{customersError}</div>}
                  </div>

                  {/* Knowledge Bases Card */}
                  <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                    <CardContent className="p-6 space-y-6">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <h2 className="text-xl font-medium text-gray-900 flex items-center gap-2">
                          <span className="inline-block w-1 h-5 bg-blue-600 rounded-full" aria-hidden="true" />
                          Book Details
                        </h2>
                        <div className="flex flex-col sm:flex-row gap-2">            
                          <Button
                            onClick={() => setIsCreating(true)}
                            className="px-5 rounded-full bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Book Details
                          </Button>
                        </div>
                      </div>

                      {/* Search */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                          <Input
                            placeholder="Search books..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 rounded-full bg-white border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
                          />
                        </div>
                      </div>

                      {/* Table */}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-h-[150px]">
                        {booksLoading ? (
                          <div className="p-6 text-center text-blue-700 text-sm">Loading books...</div>
                        ) : booksError ? (
                          <div className="p-6 text-center text-red-700 text-sm">{booksError}</div>
                        ) : filteredBooks.length === 0 && !booksLoading && !customersLoading && !organizationLoading && !appsLoading ? (
                          <div className="p-6 text-center">
                            <div className="flex flex-col items-center justify-center py-4">
                              <Search className="h-10 w-10 text-gray-400 mb-3" />
                              <h3 className="text-md font-medium text-gray-900 mb-1">
                                {searchQuery
                                  ? `No Books match your search.`
                                  : (selectedCustomerCode && selectedCustomerCode !== '_ALL' ? "No books available for the selected customer and filters." : "Please select a customer to view books.")}
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
                                  <TableHead className="w-[70%]">Book Name</TableHead>
                                  <TableHead className="w-[30%] text-left pl-11 pr-4">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredBooks.map((book, idx) => (
                                  <TableRow key={book.bookId || idx} className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
                                    <TableCell className="font-medium text-gray-900 py-4 truncate">
                                      <div className="break-words max-w-xs">
                                        {book.label || ""}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-4 px-4 text-center">
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Create Study LO"
                                          className="h-9 w-9 hover:bg-green-100 transition-colors"
                                          disabled={book.isstudylocreated == 1}
                                          onClick={() => {
                                            setIsCreatingStudyLO(true);
                                            setSelectedBook(book.label);
                                            setSelectedBookId(book.bookId);
                                            setSelectedOrganization(book.organizationcode);
                                            setSelectedApp(book.appcode);
                                            fetchAppsData();
                                          }}
                                        >
                                          <File className="h-4 w-4 text-green-600" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Edit Study LO"
                                          className="h-9 w-9 hover:bg-blue-100 transition-colors"
                                          disabled={book.isstudylocreated == 0}
                                          onClick={() => {
                                            setEditingBookDetails(book);
                                            setIsCreatingStudyLO(true);
                                            setSelectedBook(book.label);
                                            setSelectedBookId(book.bookId);
                                            setSelectedOrganization(book.organizationcode);
                                            setSelectedApp(book.appcode);
                                            fetchAppsData();
                                          }}
                                        >
                                          <Edit className="h-4 w-4 text-blue-600" />
                                        </Button>
                                        
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Delete"
                                          className="h-9 w-9 hover:bg-red-100 transition-colors"
                                          onClick={() => {
                                            setBookToDelete(book);
                                            setShowBookDeleteDialog(true);
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

        {/* Book Details Delete Dialog */}
        <AlertDialog open={showBookDeleteDialog} onOpenChange={setShowBookDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-semibold text-gray-900">
                Confirm Book Deletion
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-700">
                Are you sure you want to delete the book "{bookToDelete?.label || 'this book'}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setShowBookDeleteDialog(false);
                  setBookToDelete(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={bookDeleteLoading}
                onClick={async () => {
                  await handleDeleteBookDetails();
                }}
              >
                {bookDeleteLoading ? "Deleting…" : "Delete"}
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

        {/* Full-page loader during create/edit submission - works for Create Book, Create Study LO, and Edit Study LO */}
        {(createSubmitting || editBookSubmitting) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full mx-4">
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <svg className="animate-spin h-12 w-12 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-70" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {editBookSubmitting ? 'Updating Book Details' : 
                     isCreatingStudyLO ? 'Creating Study LO' : 'Creating Book'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {editBookSubmitting ? 'Please wait while we update the book details...' :
                     isCreatingStudyLO ? 'Please wait while we process your Study LO...' : 'Please wait while we process your documents...'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

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
                    if (isSSO) {
                      return;
                    }
                    setIsCreating(false);
                    setIsCreatingStudyLO(false);
                    setEditingBookDetails(null);
                    setIsViewingGuidelines(false);
                    setIsChatMode(false);
                    setIsTaggingAgents(false);
                    setSelectedKBForChat(null);
                    clearCreateForm();
                    // Ensure we're back to main view
                    handleBackNavigation();
                  }}
                >
                  Okay
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Image Preview Dialog */}
        {imagePreviewOpen && existingBookImage && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black bg-opacity-75" style={{ animation: "fadeIn 0.2s" }}>
            <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg shadow-xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Cover Image Preview</h3>
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={() => setImagePreviewOpen(false)}
                >
                  Close
                </Button>
              </div>
              <div className="flex justify-center">
                <img 
                  src={existingBookImage} 
                  alt="Cover Image Preview" 
                  className="max-w-full max-h-[70vh] rounded-lg border border-gray-200"
                  style={{ objectFit: "contain" }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        {confirmDialog.open && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black bg-opacity-40" style={{ animation: "fadeIn 0.2s" }}>
            <div className="bg-white rounded-lg shadow-xl p-6 w-[400px] relative">
              <div className="font-semibold text-gray-800 mb-2">{confirmDialog.title}</div>
              <div className="mb-4 text-gray-700">{confirmDialog.message}</div>
              <div className="flex justify-end gap-3 mt-2">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={() => { confirmDialog.onCancel?.(); }}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => { confirmDialog.onConfirm?.(); }}
                >
                  Delete
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
