import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, } from "@/components/ui/sheet";
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
import { getKbAuthToken } from "../lib/kb-auth";
import config from "../config";

import { PageLoader } from "@/components/ui/loader";

const ManageGuidelines = () => {
  const navigate = useNavigate();
  
  // Ref to prevent duplicate API calls in React Strict Mode
  const customersFetchedRef = useRef(false);
  const fetchedCombinations = useRef(new Set<string>());
  const guidelinesFetchedRef = useRef(false);
  
  // Check if user is logged in via SSO token
  const isSSO = sessionStorage.getItem('isSSO') === 'true';
  // Guideline delete dialog and pending guideline state
  const [guidelinePendingDelete, setGuidelinePendingDelete] = useState(null);
  const [showGuidelineDeleteDialog, setShowGuidelineDeleteDialog] = useState(false);
  // Confirmation dialog state for removing previously uploaded file
  const [showPrevFileDeleteDialog, setShowPrevFileDeleteDialog] = useState(false);

  const handleBackNavigation = async () => {
    let customerCode = selectedCustomerCode;
    let orgCode = selectedOrganization;
    let appCode = selectedApp;
    if (!customerCode && (kbDetails as any)?.customercode) customerCode = String((kbDetails as any).customercode || '');
    if (!orgCode && (kbDetails as any)?.organizationcode) orgCode = String((kbDetails as any).organizationcode || '');
    if (!appCode && (kbDetails as any)?.appcode) appCode = String((kbDetails as any).appcode || '');
    if (!orgCode) {
      const uiRaw = sessionStorage.getItem('userInfo');
      if (uiRaw) {
        try {
          const ui = JSON.parse(uiRaw);
          orgCode = ui?.orgCode || ui?.organizationcode || orgCode;
        } catch (error) {
          console.warn("Invalid JSON in sessionStorage 'userInfo':", error);
        }
      }
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
    setIsViewingGuidelines(false);
    setSelectedKBForGuidelines(null);
    setIsChatMode(false);
    setSelectedKBForChat(null);
    clearGuidelinesState();

    setTypeFilter("All");
    await fetchExistingGuidelines();

//     if (customerCode) {
//       try {
//         const response = await fetch(buildExistingKbUrl(String(customerCode),String(orgCode || ''),String(appCode || '')));
//         const data = await response.json();
//         setKnowledgeBases(Array.isArray(data?.data) ? data.data : []);
//       } catch (error) {
//       // Handle error gracefully
//       console.error("Failed to fetch knowledge bases:", error);
//   }
// }
    if (customerCode && orgCode) {
      fetchData(String(customerCode), String(orgCode));
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
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [typeFilter, setTypeFilter] = useState("All");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guidelineCreationType, setGuidelineCreationType] = useState<'new' | 'existing'>('new');
  const [existingGuidelines, setExistingGuidelines] = useState<any[]>([]);
  const [existingGuidelinesLoading, setExistingGuidelinesLoading] = useState(false);
  const [selectedExistingGuidelines, setSelectedExistingGuidelines] = useState<Record<string, boolean>>({});
  const [guidelinesError, setGuidelinesError] = useState<string | null>(null);
  const [previewGuideline, setPreviewGuideline] = useState<any | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [kbLoading, setKbLoading] = useState(false);

  const [isViewingGuidelines, setIsViewingGuidelines] = useState(false);
  const [selectedKBForGuidelines, setSelectedKBForGuidelines] = useState<{ id: number; name: string } | null>(null);

  const [isChatMode, setIsChatMode] = useState(false);
  const [selectedKBForChat, setSelectedKBForChat] = useState<{ id: number; name: string; bookName: string } | null>(null);

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

  const [organizationOptions, setOrganizationOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [appsOptions, setAppsOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);

  // Immediate SSO pre-binding for dropdowns
  useEffect(() => {
    if (sessionStorage.getItem('isSSO') !== 'true') return;
    const sCust = sessionStorage.getItem('customerCode') || '';
    const sOrg = sessionStorage.getItem('orgCode') || '';
    const sCustName = sessionStorage.getItem('selectedCustomerName') || '';
    if (sCust) {
      setSelectedCustomerCode(sCust);
      setCustomerSearchQuery(sCustName || sCust);
      setCustomerLocked(true);
      try {
        sessionStorage.setItem('selectedCustomerCode', sCust);
        if (sCustName) sessionStorage.setItem('selectedCustomerName', sCustName);
      } catch {}
    }
    if (sOrg) {
      setSelectedOrganization(sOrg);
      setOrgSearchQuery(sOrg);
      setOrganizationLocked(true);
    }
  }, []);

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
        body: JSON.stringify({ par_custcode: customerCode, par_orgcode: orgCode, auth_token:token }),
      });
      const data = await response.json();
      if (Array.isArray(data.data)) {
        const options = data.data.map((app: any) => ({
          value: app.appcode,
          label: `${app.appname}`,
        }));
        setAppsOptions(options);
      } else {
        setAppsOptions([]);
      }
    } catch (error) {
      // silent
    } finally {
      setAppsLoading(false);
    }
  };
  type Option = { value: string; label: string; disabled?: boolean };
  
  // Dynamic guideline type/subtype options
  const [guidelineTypeOptions, setGuidelineTypeOptions] = useState<Option[]>([]);
  const [guidelineSubTypeOptions, setGuidelineSubTypeOptions] = useState<Option[]>([]);
  const [guidelineTypesLoading, setGuidelineTypesLoading] = useState(false);
  const [guidelineSubtypesLoading, setGuidelineSubtypesLoading] = useState(false);
  const [guidelineDropdownError, setGuidelineDropdownError] = useState<string | null>(null);

  const extractOptionLabel = (row: any) => {
    return (
      row?.guidelinename ??
      row?.guideline_name ??
      row?.guidelinesubname ??
      row?.guidelinetype ??
      row?.guideline_type ??
      row?.name ??
      row?.type ??
      ""
    );
  };

  const fetchGuidelineTypes = async () => {
    setGuidelineTypesLoading(true);
    setGuidelineDropdownError(null);
    try {
      const token = encodeURIComponent(await getKbAuthToken()); 
      const res = await fetch(`${API_ENDPOINTS.GUIDELINE_TYPES}?auth_token=${token}`, { method: "GET" });
      const json = await res.json().catch(() => ({}));
      const rows = Array.isArray(json?.guideline_types) ? json.guideline_types : Array.isArray(json?.data) ? json.data : [];
      // Only the Content type is offered in the Guideline Type dropdown.
      const opts: Option[] = rows
        .map((r: any) => String(extractOptionLabel(r)).trim())
        .filter((v: string) => v.toLowerCase() === "content")
        .slice(0, 1)
        .map((v: string) => ({ value: v, label: v }));

      if (opts.length === 0) {
        opts.push({ value: "Content", label: "Content" });
      }

      setGuidelineTypeOptions(opts);
    } catch (e: any) {
      setGuidelineDropdownError(e?.message || "Failed to load guideline types");
      setGuidelineTypeOptions([]);
    } finally {
      setGuidelineTypesLoading(false);
    }
  };

  const fetchGuidelineSubtypes = async (typeName: string) => {
    if (!typeName) { setGuidelineSubTypeOptions([]); return; }
    setGuidelineSubtypesLoading(true);
    setGuidelineDropdownError(null);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const res = await fetch(`${API_ENDPOINTS.GUIDELINE_SUBTYPES}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guidelinename: typeName, auth_token: token }),
      });
      const json = await res.json().catch(() => ({}));
      const rows = Array.isArray(json?.guideline_subtypes) ? json.guideline_subtypes : Array.isArray(json?.data) ? json.data : [];
      const opts: Option[] = rows
        .map((r: any) => String(extractOptionLabel(r)).trim())
        .filter((v: string) => !!v)
        .map((v: string) => ({ value: v, label: v }));
      setGuidelineSubTypeOptions(opts);
    } catch (e: any) {
      setGuidelineDropdownError(e?.message || "Failed to load guideline subtypes");
      setGuidelineSubTypeOptions([]);
    } finally {
      setGuidelineSubtypesLoading(false);
    }
  };

  useEffect(() => {
    fetchGuidelineTypes();
  }, []);


  // Create flow UI state
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogMessage, setSuccessDialogMessage] = useState(false)

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


  // === Guidelines state/hooks START ===
  const [guidelineType, setGuidelineType] = useState(null); // string | null
  const [guidelineSubType, setGuidelineSubType] = useState(null); // string | null
  const [guidelineName, setGuidelineName] = useState(''); // string
  const [guidelineNameError, setGuidelineNameError] = useState(''); // string
  const [guidelinesText, setGuidelinesText] = useState(''); // string
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    const token = encodeURIComponent(await getKbAuthToken());

    const payload = isGeneralGuideline
      ? {
        par_custcode: "",
        par_orgcode: "",
        par_appcode: "",
        par_guidelinename: name.trim(),
        par_guidelinetype: type || "",
        par_type: 0,
        par_kbid: "0",
        auth_token: token
      }
      : {
        par_custcode: String(kbDetails.customercode || ''),
        par_orgcode: String(kbDetails.organizationcode || ''),
        par_appcode: String(kbDetails.appcode || ''),
        par_guidelinename: name.trim(),
        par_guidelinetype: type || "",
        par_type: 1,
        par_kbid: String(kbDetails.id || ''),
        auth_token: token
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
    toast({
      title: "File Uploaded",
      description: `File '${file.name}' has been successfully uploaded.`,
    });
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

  // Fetch customers on mount
  useEffect(() => {
    // Prevent duplicate calls in React Strict Mode
    if (customersFetchedRef.current) return;
    customersFetchedRef.current = true;
    
    async function fetchCustomers() {
      console.log('🚀 [API START] fetchCustomers called at:', new Date().toISOString());
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
        if ((sessionStorage.getItem('isSSO') === 'true') && userCustomerCode) {
          // SSO: force-bind to session customer and lock, display customer name if available
          const match = arr.find((c: any) => String(c?.customercode || '') === userCustomerCode);
          finalCustomerCode = userCustomerCode;
          setSelectedCustomerCode(userCustomerCode);
          setCustomerSearchQuery(match?.customername || userCustomerCode);
          setCustomerLocked(true);
          try {
            sessionStorage.setItem('selectedCustomerCode', userCustomerCode || '');
            sessionStorage.setItem('selectedCustomerName', match?.customername || userCustomerCode || '');
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
          console.log('✅ [API COMPLETE] fetchCustomers finished at:', new Date().toISOString());
          setTimeout(() => {
            console.log('🚀 [API START] fetchOrganizationData called at:', new Date().toISOString());
            fetchOrganizationData();
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

  // Fetch general guidelines on page load (only if not triggered by sequential flow)
  useEffect(() => {
    // Skip if this was triggered by fetchOrganizationData to avoid duplicate calls
    if (organizationLoading || guidelinesFetchedRef.current) return;
    
    fetchExistingGuidelines();
    guidelinesFetchedRef.current = true;
  }, [organizationLoading]);

  // Fetch KBs when customer/org/app filter changes
  useEffect(() => {
    if (!selectedCustomerCode) {
      setKnowledgeBases([]);
      return;
    }
    // For specific customers, wait until organization is selected/resolved.
    // This prevents initial fetches with par_orgcode=0 before the org is auto-selected.
    if (selectedCustomerCode !== '_ALL' && !selectedOrganization) {

      return;
    }
  }, [selectedCustomerCode, selectedOrganization, selectedApp]);

  // Refreshes guidelines from API
  const handleRefreshGuidelines = async () => {
    setGuidelinesError(null);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const isGeneralGuideline = kbDetails.id === 0 || kbDetails.id == null;
      const generalGuidelineTypes = "0";

      let sessionCustCode = '';
      let sessionOrgCode = '';
      try {
        const uiRaw = sessionStorage.getItem('userInfo');
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || '{}');
          sessionCustCode = ui?.customerCode || ui?.customercode || '';
          sessionOrgCode = ui?.orgCode || ui?.organizationcode || '';
        }
      } catch { }

      const payload = {
        par_kid: isGeneralGuideline ? "0" : String(kbDetails.id),
        par_guidelinetype: isGeneralGuideline ? generalGuidelineTypes : "0",
        par_guidelinename: "0",
        par_orgcode: String(sessionOrgCode || kbDetails.organizationcode || selectedOrganization || '0'),
        par_appcode: "0",
        par_custcode: String(sessionCustCode || kbDetails.customercode || selectedCustomerCode || '0'),
        auth_token: token,
        book_id:''
      };

      const endpoint = isGeneralGuideline ? API_ENDPOINTS.GET_GENERAL_GUIDELINES : API_ENDPOINTS.GET_GUIDELINE;

      const guidelineRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let guidelineJson;
      try {
        guidelineJson = await guidelineRes.json();
      } catch (parseError) {
        console.error("Failed to parse guidelines response:", parseError);
        throw new Error("Invalid response format from server");
      }

      if (!guidelineRes.ok) {
        throw new Error(guidelineJson?.message || "Failed to fetch guidelines list");
      }
      setAllGuidelines(Array.isArray(guidelineJson?.data) ? guidelineJson.data : []);
    } catch (error) {
      setGuidelinesError(error?.message || "Failed to load guidelines");
      setAllGuidelines([]);
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

      const selectedGuides = Object.entries(selectedExistingGuidelines)
        .filter(([_, isSelected]) => isSelected)
        .map(([key]) => {
          const guideline = existingGuidelines.find(g => g.guidelinename === key);
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
      // Add auth_token to payload
      const token = encodeURIComponent(await getKbAuthToken());
      const payload = {
        par_kbid: selectedKBForGuidelines.id,
        par_guidelineids: selectedGuides.join(','),
        auth_token: token
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
        setSelectedExistingGuidelines({});

        // Refresh the guidelines list
        await fetchExistingGuidelines();
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
      const token = encodeURIComponent(await getKbAuthToken());
      setExistingGuidelinesLoading(true);
      setGuidelinesError(null);

      const generalGuidelineTypes = "0";

      let sessionCustCode = '';
      let sessionOrgCode = '';
      try {
        const uiRaw = sessionStorage.getItem('userInfo');
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || '{}');
          sessionCustCode = ui?.customerCode || ui?.customercode || '';
          sessionOrgCode = ui?.orgCode || ui?.organizationcode || '';
        }
      } catch { }

      const payload = {
        par_kid: "0",
        par_guidelinetype: generalGuidelineTypes,
        par_guidelinename: "0",
        par_orgcode: String(sessionOrgCode || selectedOrganization || '0'),
        par_custcode: String(sessionCustCode || selectedCustomerCode || '0'),
        par_appcode: "0",
        auth_token: token,
        book_id: String(sessionStorage.getItem('programCode')||'')
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

  // Organization and apps
  const fetchOrganizationData = useCallback(async () => {
    const token = encodeURIComponent(await getKbAuthToken());
    if (!selectedCustomerCode || organizationLoading) return;
    setOrganizationLoading(true);
    try {
      const sso = sessionStorage.getItem('isSSO') === 'true';
      const sCust = sessionStorage.getItem('customerCode') || '';
      const sOrg = sessionStorage.getItem('orgCode') || '';
      const payload: any = { par_custcode: sso && sCust ? sCust : selectedCustomerCode, auth_token: token };
      if (sso && sOrg) payload.par_orgcode = sOrg;
      const orgResponse = await fetch(API_ENDPOINTS.GET_ORGANIZATION_DETAILS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const orgData = await orgResponse.json();
      if (Array.isArray(orgData.data)) {
        const options = orgData.data.map((org: any) => ({
          value: org.organizationcode,
          label: `${org.organizationname} `,
        }));
        setOrganizationOptions(options);
        if (sso && sOrg) {
          const match = options.find(o => String(o.value) === String(sOrg));
          if (match) {
            setSelectedOrganization(match.value);
            setOrgSearchQuery(match.label || match.value);
            setOrganizationLocked(true);
          }
        }
        
        // After organization is set, trigger apps fetch and guidelines fetch
        if (selectedCustomerCode && (sso && sOrg ? sOrg : selectedOrganization)) {
          setTimeout(() => {
            fetchAppsData();
            // Trigger guidelines fetch after apps
            setTimeout(() => {
              if (!guidelinesFetchedRef.current) {
                fetchExistingGuidelines();
                guidelinesFetchedRef.current = true;
              }
            }, 100);
          }, 100);
        }
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
    if (!selectedCustomerCode || !selectedOrganization || appsLoading) return;
    setAppsLoading(true);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const response = await fetch(API_ENDPOINTS.GET_APPS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ par_custcode: selectedCustomerCode, par_orgcode: selectedOrganization, auth_token: token }),
      });
      const data = await response.json();
      if (Array.isArray(data.data)) {
        const options = data.data.map((app: any) => ({
          value: app.appcode || app.code,
          label: app.appname || app.name || app.code,
        }));
        setAppsOptions(options);
      }
    } catch (error) {
      // silent
    } finally {
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
  }, [selectedCustomerCode, fetchOrganizationData, customersLoading]);

  useEffect(() => {
    // Skip if this was triggered by fetchOrganizationData to avoid duplicate calls
    if (organizationLoading) return;
    
    setSelectedApp(null);
    setAppsOptions([]);
    if (selectedCustomerCode && selectedCustomerCode !== '_ALL' && selectedOrganization) {
      fetchAppsData();
    }
  }, [selectedOrganization, selectedCustomerCode, fetchAppsData, organizationLoading]);

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

  // Function to clear all create form fields
  const clearCreateForm = useCallback((preserveOrgApp: boolean = false) => {
    if (!preserveOrgApp) {
      setSelectedOrganization(null);
      setSelectedApp(null);
    }
    setCreateSubmitting(false);
    // Clear customer selection and reset to default
    // setSelectedCustomerCode('_ALL');
    // setCustomerSearchQuery('All');
    // Clear dropdown options
    if (!preserveOrgApp) {
      setOrganizationOptions([]);
      setAppsOptions([]);
    }
    // Clear selected book (different from bookName)
  }, []);

  const filteredGuidelines = existingGuidelines.filter((guideline) => {
    const matchesSearch = (guideline.guidelinename || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (guideline.guidelinetype || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === "All" || (guideline.guidelinetype || "") === typeFilter;

    return matchesSearch && matchesType;
  });

  // === Guidelines: Effects to fetch KB details and guidelines on open ===
  useEffect(() => {
    if (isViewingGuidelines && selectedKBForGuidelines) {
      if (selectedKBForGuidelines.id === 0) {
        // This is a General Guideline
        setKbDetails({
          id: 0,
          organizationcode: "",
          knowladgebasename: "General Guideline",
          customercode: "",
          appcode: "0",
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
          const token = encodeURIComponent(await getKbAuthToken());
          const payload = {
            custcode: customerCode,
            orgcode: orgCode,
            kbname: kbName,
            appcode: appCode,
            sourcename: "",
            auth_token: token,
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
            auth_token: token
          };
          const guidelineRes = await fetch(API_ENDPOINTS.GET_GUIDELINE, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(guidelinePayload),
          });
          //const guidelineJson = await guidelineRes.json().catch(() => ({}));
          let guidelineJson: any = {};

          try {
            guidelineJson = await guidelineRes.json();
          } catch (error) {
            console.warn("Failed to parse guideline response as JSON:", error);
            guidelineJson = {}; // fallback to empty object
          }

          if (!guidelineRes.ok || guidelineJson.status !== 'success') {
            throw new Error(
              guidelineJson.message ||
              guidelineJson.error ||
              'Failed to check guideline name'
            );
          }

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
  
  if (customersLoading && organizationLoading) {
      return <PageLoader text="Loading data..." />;
    }
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
        {/* Sidebar */}
        {!isSSO && (
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 transition-transform duration-300 transform lg:transform-none lg:static">
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

        <div 
        className={
          isSSO 
          ? "min-h-screen flex flex-col"
           : "ml-0 lg:ml-52 flex flex-col"}>
          {/* Page Title Section */}
          {!isSSO && (
            <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 sm:gap-3">
                  {(isViewingGuidelines || isChatMode) && (
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
                        <ScrollText className="h-4 w-4 text-white" />
                      </div>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h1 className="text-base sm:text-lg font-medium text-slate-900 leading-tight tracking-tight truncate">
                      {isViewingGuidelines
                        ? "Guideline Data"
                        : isChatMode && selectedKBForChat?.bookName
                          ? `Knowledge Base: ${selectedKBForChat.bookName}`
                          : "Manage Guidelines"}
                    </h1>
                    <p className="text-xs text-slate-500 truncate">
                        {isViewingGuidelines
                          ? "Manage guideline documents for this knowledge base"
                          : isChatMode
                            ? "Chat with your knowledge base"
                            : "Add, edit, and organize your guideline library"}
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
            <BackToTop loading={kbLoading} />
            {/* Full Page Loader Overlay for Chat */}
            <div className="max-w-7xl mx-auto space-y-6">
              {isViewingGuidelines ? (
                /* Guidelines View */
                <>
                  {/* Knowledge Base Info */}
                  {/* <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
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
                    <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-blue-700">Creation of Guideline</h3>
                        <Select
                          value={guidelineCreationType}
                          onValueChange={(value) => {
                            setGuidelineCreationType(value as 'new' | 'existing');
                            setSelectedExistingGuidelines({});
                            setPreviewGuideline(null);
                            // When switching from 'existing' to 'new', refresh guidelines to show newly tagged ones
                            if (guidelineCreationType === 'existing' && value === 'new' && selectedKBForGuidelines?.id) {
                              handleRefreshGuidelines();
                            }
                          }}
                        >
                          <SelectTrigger className="bg-white border-blue-100 focus:border-indigo-400 focus:ring-indigo-400/20">
                            <SelectValue placeholder="Select creation type" />
                          </SelectTrigger>
                          <SelectContent className="bg-white z-50">
                            <SelectItem value="new">New Guideline</SelectItem>
                            <SelectItem value="existing">General Guideline</SelectItem>
                          </SelectContent>
                        </Select>
                      </CardContent>
                    </Card>
                  )}

                  {/* Existing Guidelines Selection Table */}
                  {selectedKBForGuidelines?.id !== 0 && guidelineCreationType === 'existing' && (
                    <Card className="border-2 border-amber-100 bg-amber-50 rounded-2xl shadow-sm">
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



                  {/* Add New Guideline Card */}
                  {!(selectedKBForGuidelines?.id !== 0 && guidelineCreationType === 'existing') && (
                    <Card id="add-guideline-section" className="border-2 border-slate-200 bg-slate-50">

                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {isGuidelineEditing ? 'View Guideline' : 'Add New Guideline'}
                          </h3>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-5 w-5 text-gray-500 cursor-pointer hover:text-gray-700 transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md bg-white text-black border-gray-200 px-4 py-3 rounded-lg shadow-lg">
                                <div className="space-y-2 text-sm leading-relaxed">
                                  <p>Guideline Type can be selected from the Guideline Type dropdown.</p>
                                  <p>Guideline Subtype can be selected from the Guideline Subtype dropdown. Guideline Subtype is optional.</p>
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
                                fetchGuidelineSubtypes(value);
                              }}
                              disabled={isGuidelineEditing}
                              required={!isGuidelineEditing}
                            >
                              <SelectTrigger className="bg-white border-gray-300 rounded-full">
                                {isGuidelineEditing?(
                                <SelectValue placeholder="Select guideline type">
                                  {isGuidelineEditing && guidelineType ? guidelineType : ""}
                                </SelectValue>):(
                                  <SelectValue placeholder="Select guideline type"/>
                                )}
                              </SelectTrigger>
                              <SelectContent className="bg-white">
                                {guidelineTypesLoading && <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>}
                                {!!guidelineDropdownError && <div className="px-3 py-2 text-sm text-red-600">{guidelineDropdownError}</div>}
                                {guidelineTypeOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
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
                                const isContentGeneralRules = (String(guidelineType) === 'Content' && String(val) === 'GENERAL_RULES');
                                if (val && !isContentGeneralRules) setGuidelineName(val);
                                else if (!val && guidelineName && guidelineName === guidelineSubType) setGuidelineName(""); // clear if unsetting
                              }}
                              disabled={isGuidelineEditing}
                              required={!isGuidelineEditing}
                            >
                              <SelectTrigger className="bg-white border-gray-300 rounded-full">
                                {isGuidelineEditing?(
                                <SelectValue placeholder="Select subtype">
                                  {isGuidelineEditing && guidelineSubType ? guidelineSubType : ""}
                                </SelectValue>):
                                (<SelectValue placeholder="Select subtype"/>)}
                              </SelectTrigger>
                              <SelectContent className="bg-white max-h-60 overflow-y-auto">
                                {/* {guidelineSubtypesLoading && <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>} */}
                                {!!guidelineDropdownError && <div className="px-3 py-2 text-sm text-red-600">{guidelineDropdownError}</div>}
                                {guidelineSubTypeOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
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
                              className="bg-white border-gray-300 rounded-full"
                              value={guidelineName}
                              onChange={(e) => {
                                setGuidelineName(e.target.value);
                                validateGuidelineName(e.target.value);
                              }}
                              required={!guidelineSubType && !isGuidelineEditing}
                              disabled={
                                isGuidelineEditing ||
                                (Boolean(guidelineSubType) &&
                                  !(String(guidelineType) === 'Content' && String(guidelineSubType) === 'GENERAL_RULES'))
                              }
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
                            ref={fileInputRef as any}
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
                                handleGuidelineFileChange({ target: { files: e.dataTransfer.files } } as any);
                                e.dataTransfer.clearData();
                              }
                            }}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <div className="flex justify-center">
                              <div className="p-3 bg-blue-50 rounded-lg">
                                <FileText className="h-8 w-8 text-blue-700" />
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

                        <div className="flex justify-end gap-3">
                          {(guidelineType === "Content" || guidelineType === "Validation" || guidelineType === "Question Generation") &&(
                            <Button
                              className="bg-blue-600 hover:bg-blue-600 text-white rounded-full"
                              disabled={guidelinesLoading}
                              onClick={async () => {
                              // Validation
                              const missing = [];
                              if (!guidelineType) missing.push("Guideline Type");
                              const isContentGeneralRules = (String(guidelineType) === 'Content' && String(guidelineSubType) === 'GENERAL_RULES');
                              if (isContentGeneralRules) {
                                if (!guidelineName.trim()) missing.push("Guideline Name");
                              } else {
                              if (!(guidelineSubType && guidelineSubType.trim()) && !guidelineName.trim()) missing.push("Guideline Name or Subtype");
                              }
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
                              const useName = (() => {
                                const isContentGeneralRules = (String(guidelineType) === 'Content' && String(guidelineSubType) === 'GENERAL_RULES');
                                if (isContentGeneralRules) return guidelineName.trim();
                                return (guidelineSubType && guidelineSubType.trim()) ? guidelineSubType.trim() : guidelineName;
                              })();

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
                              let guidelinePathUrl = "";
                              if (guidelineFile) {
                                guidelinePathUrl = `vectorstores/${kbDetails.customercode}/${kbDetails.dbtype}/${kbDetails.knowladgebasename}/${guidelineFile.name}`;
                                formData.append('guideline_file', guidelineFile);
                              } else if (!wasPreviouslyUploadedFileRemoved && previouslyUploadedFileName) {
                                guidelinePathUrl = `vectorstores/${kbDetails.customercode}/${kbDetails.dbtype}/${kbDetails.knowladgebasename}/${previouslyUploadedFileName}`;
                              }
                              formData.append('par_kbid', String(kbDetails.id === 0 ? 0 : kbDetails.id || ''));
                              formData.append('par_guidelinetype', guidelineType || '');
                              formData.append('par_guidelinesubtype', String(guidelineSubType || ''));
                              formData.append('par_guidelinename', useName || '');
                              formData.append('par_guidelinetext', guidelinesText ? String(guidelinesText) : '');
                              let sessionCustCode = '';
                              let sessionOrgCode = '';
                              try {
                                const uiRaw = sessionStorage.getItem('userInfo');
                                if (uiRaw) {
                                  const ui = JSON.parse(uiRaw || '{}');
                                  sessionCustCode = ui?.customerCode || ui?.customercode || '';
                                  sessionOrgCode = ui?.orgCode || ui?.organizationcode || '';
                                }
                              } catch { }

                              formData.append('customercode', String(sessionCustCode || kbDetails.customercode || '0'));
                              formData.append('par_orgcode', String(sessionOrgCode || kbDetails.organizationcode || '0'));
                              formData.append('par_appcode', String(kbDetails.appcode ?? ''));
                              formData.append('book_id', String(sessionStorage.getItem('programCode')||''));
                              //book_id: String(sessionStorage.getItem('programCode')||'')
                              if (isGuidelineEditing && editingGuidelineId) {
                                formData.append('par_guidelineid', String(editingGuidelineId));
                              }
                              // Add auth_token to FormData
                              const token = encodeURIComponent(await getKbAuthToken());
                              formData.append('auth_token', token);
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
                                await fetchExistingGuidelines();

                                // Show success toast
                                toast && toast({
                                  title: isGuidelineEditing ? "Guideline Updated" : "Guideline Uploaded",
                                  description: `Guideline ${isGuidelineEditing ? "updated" : "uploaded"} successfully.`
                                });

                                // Navigate back to Manage Guidelines page after successful operation
                                setIsViewingGuidelines(false);
                                setSelectedKBForGuidelines(null);
                              } catch (e) {
                                alert(e?.message || "Error uploading guideline");
                              } finally {
                                setGuidelinesLoading(false);
                              }
                            }}
                          >
                            {isGuidelineEditing ? 'Update Guideline' : 'Upload Guideline'}
                          </Button>
                          )}
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
                              setIsViewingGuidelines(false);
                              setSelectedKBForGuidelines(null);
                            }}
                            className="border-gray-300 rounded-full text-gray-700 hover:bg-gray-50"
                          >
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <>
                  {/* Existing List View */}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                    {!isSSO && (
                    <Card className="border-2 border-grey-100 bg-gradient-to-br from-grey-50 to-grey-100">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-xl font-semibold text-grey-800">Select Customer</h3>
                          </div>

                        <div className="relative customer-dropdown-container">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-grey-200 z-10" />
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
                    )}
                    
                    {!isSSO && (
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
                    )}
                  </div>


                  <div className="mt-4">
                    {customersLoading && <div className="text-xs text-gray-600">Loading customer list...</div>}
                    {customersError && <div className="text-xs text-red-600">{customersError}</div>}
                  </div>

                  {/* Knowledge Bases Card */}
                  <Card className="border-2 border-white-100 bg-gradient-to-br from-white-50 to-white-100">
                    <CardContent className="p-6 space-y-6">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <h2 className="text-xl font-medium text-gray-900 flex items-center gap-2">
                          <span className="inline-block w-1 h-5 bg-blue-600 rounded-full" aria-hidden="true" />
                          All Guidelines
                        </h2>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            onClick={() => {
                              setSelectedKBForGuidelines({ id: 0, name: "General Guideline" });
                              setGuidelineCreationType('new');
                              setIsViewingGuidelines(true);
                              clearGuidelinesState();
                            }}
                            className="px-5 bg-blue-600 rounded-full hover:bg-blue-700 text-white"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Create New Guideline
                          </Button>
                        </div>
                      </div>

                      {/* Search and Filter */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                          <Input
                            placeholder="Search guidelines..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-white rounded-full border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
                          />
                        </div>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                          <SelectTrigger className="w-full sm:w-48 bg-white rounded-full border-gray-200 focus:border-gray-400 focus:ring-gray-400/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent  className="bg-white z-50 min-w-48 ">
                            <SelectItem value="All" className="cursor-pointer">All Types</SelectItem>
                            <SelectItem value="Content" className="cursor-pointer">Content</SelectItem>
                            <SelectItem value="Validation" className="cursor-pointer">Validation</SelectItem>
                            <SelectItem value="Question Generation" className="cursor-pointer">Question Generation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Table */}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-h-[150px]">
                        {existingGuidelinesLoading ? (
                          <div className="p-6 text-center text-blue-700 text-sm">Loading guidelines...</div>
                        ) : guidelinesError ? (
                          <div className="p-6 text-center text-red-700 text-sm">{guidelinesError}</div>
                        ) : filteredGuidelines.length === 0 ? (
                          <div className="p-6 text-center">
                            <div className="flex flex-col items-center justify-center py-4">
                              <Search className="h-10 w-10 text-gray-400 mb-3" />
                              <h3 className="text-md font-medium text-gray-900 mb-1">
                                {searchQuery
                                  ? `No Guidelines match your search.`
                                  : "No guidelines available."}
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
                                  <TableHead className="w-[45%]">Guideline Name</TableHead>
                                  <TableHead className="w-[30%]">Guideline Type</TableHead>
                                  <TableHead className="w-[25%] text-left pr-4">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredGuidelines.map((guideline, idx) => (
                                  <TableRow key={guideline.guidelineid || idx} className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
                                    <TableCell className="font-medium text-gray-900 py-4 truncate">{guideline.guidelinename || ""}</TableCell>
                                    <TableCell className="text-gray-700 py-4 truncate">
                                        {guideline.guidelinetype ? (
                                        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium whitespace-nowrap">
                                            {guideline.guidelinetype}
                                          </span>
                                        ) : (
                                          <span className="text-gray-500">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-4 px-4">
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title={guideline.guidelinetype === "Question Generation" ? "View" : "Edit"}
                                          className="h-9 w-9 hover:bg-blue-100 transition-colors"
                                          onClick={() => {
                                            setIsViewingGuidelines(true);
                                            setSelectedKBForGuidelines({ id: 0, name: 'General Guideline' });
                                            setGuidelineCreationType('new');
                                            setIsGuidelineEditing(true);
                                            setEditingGuidelineId(guideline.guidelineid || null);
                                            setGuidelineType(guideline.guidelinetype || null);
                                            const subtype = guideline.guidelinesubtype || "";
                                            setGuidelineSubType(subtype);
                                            const isContentGeneralRules = (String(guideline.guidelinetype) === 'Content' && String(subtype) === 'GENERAL_RULES');
                                            if (subtype && !isContentGeneralRules) {
                                              setGuidelineName(subtype);
                                            } else {
                                              setGuidelineName(guideline.guidelinename || "");
                                            }
                                            fetchGuidelineSubtypes(guideline.guidelinetype || "");
                                            setGuidelinesText(guideline.guidelinetext || "");
                                            setGuidelineFile(null);
                                            setPreviouslyUploadedFileName(
                                              guideline.guidelinepathurl
                                                ? guideline.guidelinepathurl.split("/").pop()
                                                : null
                                            );
                                            setWasPreviouslyUploadedFileRemoved(false);
                                            setTimeout(() => {
                                              const el = document.getElementById('add-guideline-section');
                                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            }, 100);
                                          }}
                                        >
                                          {guideline.guidelinetype === "Question Generation" ? (
                                            <Eye className="h-4 w-4 text-blue-600" />
                                          ) : (
                                          <Edit className="h-4 w-4 text-blue-600" />
                                          )}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Delete"
                                          className="h-9 w-9 hover:bg-red-100 transition-colors"
                                          disabled={guideline.guidelinetype === "Question Generation" || guideline.guidelinetype === "Validation"}
                                          style={{ 
                                            opacity: (guideline.guidelinetype === "Question Generation" || guideline.guidelinetype === "Validation") ? 0.5 : 1,
                                            cursor: (guideline.guidelinetype === "Question Generation" || guideline.guidelinetype === "Validation") ? "not-allowed" : "pointer"
                                          }}
                                          onClick={() => {
                                            setGuidelinePendingDelete({
                                              guidelinename: guideline.guidelinename,
                                              guidelinetype: guideline.guidelinetype,
                                              guidelinepathurl: guideline.guidelinepathurl,
                                              kbid: kbDetails.id,
                                            });
                                            setShowGuidelineDeleteDialog(true);
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
                    toast && toast({ title: 'Deleted', description: 'Knowledge Base deleted successfully.',style: { marginTop: "100px" } });
                    setDeleteDialogOpen(false);
                    setKbToDelete(null);
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
                    delFormData.append('par_kid', "0");
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
                      // Add auth_token to FormData
                      const token = encodeURIComponent(await getKbAuthToken());
                      blobFormData.append('auth_token', token);
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
                    await fetchExistingGuidelines();

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

export default ManageGuidelines;
