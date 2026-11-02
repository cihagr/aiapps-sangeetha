import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ArrowLeft, BookOpen, FileText, Search, Menu, HelpCircle, Library, GraduationCap, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/AppSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { API_ENDPOINTS } from "../config";
import { getKbAuthToken } from "../lib/kb-auth";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/loader";

const ManageEditKnowledgeBase = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Ref to prevent duplicate API calls in React Strict Mode
  const customerDataFetchedRef = useRef(false);
  const organizationDataFetchedRef = useRef(false);
  
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
  
  // Check if user is logged in via SSO token
  const isSSO = sessionStorage.getItem('isSSO') === 'true';

  // --- Confirmation Dialog State ---
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null as null | (() => void),
    onCancel: null as null | (() => void)
  });

  // Canonicalize DB type for submit parity with abc.tsx
  const getDbTypeCanonical = (input: string): 'faiss' | 'chroma' => {
    const val = String(input || '').toLowerCase().trim();
    if (val.includes('faiss')) return 'faiss';
    if (val.includes('chroma')) return 'chroma';
    if (val.includes('chromadb')) return 'chroma';
    return 'faiss';
  };
  const { customercode, knowladgebasename } = useParams();

  // DEBUG: Display knowladgebasename param
  //console.log('DEBUG: knowladgebasename param:', knowladgebasename);
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  
  // Drag and drop states
  const [isDraggingDocument, setIsDraggingDocument] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
const [bookImage, setBookImage] = useState<string | null>(null);
// Store relative backend image path for correct API delete
const [bookImagePath, setBookImagePath] = useState<string | null>(null);
// Image preview dialog state
const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);

  // State to track items marked for deletion (to be deleted on update)
  const [imageToDelete, setImageToDelete] = useState<boolean>(false);
  const [documentsToDelete, setDocumentsToDelete] = useState<Set<string>>(new Set());

  // Parse query params
  function getQueryParam(field: string) {
    const params = new URLSearchParams(location.search);
    return params.get(field) || "";
  }
  const orgCode = getQueryParam("orgCode");
  const appCode = getQueryParam("appCode");
  const sourcename = getQueryParam("sourcename");
  // You might want to fetch full KB data based on these values

  // Controlled KB state (will be loaded from API in useEffect)
  const [knowledgeBase, setKnowledgeBase] = useState<null | any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for processing settings dropdowns
  type Option = { value: string; label: string; disabled?: boolean };
  const [retrievalOptions, setRetrievalOptions] = useState<Option[]>([]);
  const [chunkSizeOptions, setChunkSizeOptions] = useState<Option[]>([]);
  const [overlapOptions, setOverlapOptions] = useState<Option[]>([]);
  const [chunkingOptions, setChunkingOptions] = useState<Option[]>([]);
  const [dbTypeOptions, setDbTypeOptions] = useState<Option[]>([]);
  const [embeddingOptions, setEmbeddingOptions] = useState<Option[]>([]);

  // Organization options for getting organization name
  const [organizationOptions, setOrganizationOptions] = useState<Option[]>([]);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  
  // Customer options for getting customer name
  const [customerOptions, setCustomerOptions] = useState<Option[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);

  const getFilteredEmbeddingOptions = () => {
        const searchType = knowledgeBase.retrievalStrategy;
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

  // Computed state for filtered embedding options based on retrieval strategy
  // const getFilteredEmbeddingOptions = () => {
  //   if (!knowledgeBase) return [];
  //   const searchType = knowledgeBase.retrievalStrategy;
  //   if (searchType === 'mmr') {
  //     // When MMR is selected, disable all-MiniLM-L6-v2
  //     return embeddingOptions.map(option => ({
  //       ...option,
  //       disabled: option.value === 'all-MiniLM-L6-v2'
  //     }));
  //   } else if (searchType === 'similarity') {
  //     // When Similarity is selected, enable only all-MiniLM-L6-v2
  //     return embeddingOptions.map(option => ({
  //       ...option,
  //       disabled: option.value !== 'all-MiniLM-L6-v2'
  //     }));
  //   }
  //   return embeddingOptions;
  // };

  // Map API/DB value to canonical retrieval strategy value
  const getRetrievalStrategyCanonical = (input: string): "mmr" | "similarity" | "hybrid" => {
    const val = String(input || "").toLowerCase().trim();
    if (val === "mmr" || val.includes("maximal marginal relevance")) return "mmr";
    if (val === "similarity") return "similarity";
    if (val === "hybrid" || val.includes("hybrid")) return "hybrid";
    // fallback
    return "mmr";
  };

  const mapValueById = (id: number, row: any): string => {
    const code: string = String(row?.code || '').toUpperCase();
    const name: string = String(row?.name || '').toLowerCase();
    switch (id) {
      case 1:
        return getRetrievalStrategyCanonical(name || code);
      case 2:
        {
          const chunkSizeMatch = (row?.value ?? row?.code ?? row?.name ?? '').toString().match(/\d+/);
          return chunkSizeMatch ? chunkSizeMatch[0] : '1000';
        }
      case 3:
        {
          const overlapMatch = (row?.value ?? row?.code ?? row?.name ?? '').toString().match(/\d+/);
          return overlapMatch ? overlapMatch[0] : '20';
        }
      case 4:
        if (code === 'CS_001' || name.includes('recursive')) return 'recursive';
        return 'paragraph';
      case 5:
        if (code === 'DB_001' || name.includes('faiss')) return 'faiss';
        if (name.includes('chromadb') || name.includes('chroma')) return 'chroma';
        return 'chroma';
      case 6:
        if (code === 'EM_001' || name.includes('ada-002')) return 'text-embedding-ada-002';
        if (code === 'EM_002' || name.includes('3-large')) return 'text-embedding-3-large';
        if (code === 'EM_003' || name.includes('all-mini')) return 'all-MiniLM-L6-v2';
        if (code === 'EM_004' || name.includes('gemini-embedding-001')) return 'gemini-embedding-001';

        return 'text-embedding-ada-002';
      default:
        return String(row?.value ?? row?.code ?? row?.name ?? '').trim();
    }
  };

  const rowsToOptions = (id: number, rows: any[]): Option[] => {
    const options = rows.map((r: any) => {
      let val = mapValueById(id, r);
      let label = "";
      if (id === 1) {
        if (val === "mmr") {
          label = "Maximal Marginal Relevance (MMR)";
        } else if (val.toLowerCase() === "similarity") {
          label = "Similarity";
        } else {
          label = String(r.name || r.label || r.code || val);
        }
      } else {
        label = String(r.name || r.label || r.code || val);
      }
      return { value: val, label };
    });
    const seen = new Set<string>();
    const unique: Option[] = [];
    for (const o of options) {
      if (!seen.has(o.value)) {
        seen.add(o.value);
        unique.push(o);
      }
    }
    return unique;
  };

  useEffect(() => {
    const fetchAllMetadata = async () => {
      try {
        const token = await getKbAuthToken();
        const res = await fetch(`${API_ENDPOINTS.GET_METADATA}/0?auth_token=${encodeURIComponent(token)}`);
        const json = await res.json();
        const rows = Array.isArray(json?.options) ? json.options : [];

        const retrievalRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'retrievalstrategy');
        const chunkSizeRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'chunksize');
        const overlapRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'overlappercentage');
        const chunkingRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'chunkingstrategy');
        const dbTypeRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'databasetype');
        const embeddingRows = rows.filter((r: any) => String(r?.source || '').toLowerCase() === 'embeddingmodel');

        setRetrievalOptions(rowsToOptions(1, retrievalRows));
        setChunkSizeOptions(rowsToOptions(2, chunkSizeRows));
        setOverlapOptions(rowsToOptions(3, overlapRows));
        setChunkingOptions(rowsToOptions(4, chunkingRows));
        setDbTypeOptions(rowsToOptions(5, dbTypeRows));
        setEmbeddingOptions(rowsToOptions(6, embeddingRows));
      } catch (e) {
        console.error('Failed to load metadata', e);
        setRetrievalOptions([]);
        setChunkSizeOptions([]);
        setOverlapOptions([]);
        setChunkingOptions([]);
        setDbTypeOptions([]);
        setEmbeddingOptions([]);
      }
    };

    fetchAllMetadata();
  }, []);

  // Fetch organization data for getting organization name
  const fetchOrganizationData = async () => {
    if (!knowledgeBase?.customercode || organizationLoading) return;
    setOrganizationLoading(true);
    try {
      const token = encodeURIComponent(await getKbAuthToken());
      const response = await fetch(API_ENDPOINTS.GET_ORGANIZATION_DETAILS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ par_custcode: knowledgeBase.customercode,
        auth_token:token}),
      });
      const data = await response.json();
      if (Array.isArray(data.data)) {
        const options = data.data.map((org: any) => ({
          value: org.organizationcode,
          label: `${org.organizationname} `,
        }));
        setOrganizationOptions(options);
      } else {
        setOrganizationOptions([]);
      }
    } catch (error) {
      console.error('Failed to fetch organization data:', error);
      setOrganizationOptions([]);
    } finally {
      setOrganizationLoading(false);
    }
  };

  useEffect(() => {
    // Skip if this was triggered by fetchCustomerData to avoid duplicate calls
    if (customerLoading || organizationDataFetchedRef.current) return;

    if (knowledgeBase?.customercode) {
      fetchOrganizationData();
    }
  }, [knowledgeBase?.customercode, customerLoading]);

  // Fetch customer data for getting customer name
  useEffect(() => {
    // Prevent duplicate calls in React Strict Mode
    if (customerDataFetchedRef.current) return;
    customerDataFetchedRef.current = true;
    
    const fetchCustomerData = async () => {
      if (!knowledgeBase?.customercode || customerLoading) return;
      setCustomerLoading(true);
      try {
        console.log('Fetching customer data for:', knowledgeBase.customercode);
        const token = await getKbAuthToken();
        const response = await fetch(`${API_ENDPOINTS.GET_CUSTOMER_DATA}?auth_token=${encodeURIComponent(token)}`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        console.log('Customer API Response:', data);
        const arr = Array.isArray(data.data) ? data.data : [];
        if (arr.length > 0) {
          const options = arr.map((customer: any) => {
            console.log('Customer record:', customer);
            return {
              value: customer.customercode,
              label: customer.customername,
            };
          });
          console.log('Mapped customer options:', options);
          setCustomerOptions(options);
        } else {
          console.log('Customer data is not an array or no data found');
        }
      } catch (error) {
        console.error('Failed to fetch customer data:', error);
      } finally {
        setCustomerLoading(false);
        
        // After customer data is loaded, trigger organization fetch
        if (knowledgeBase?.customercode && !organizationDataFetchedRef.current) {
          setTimeout(() => {
            fetchOrganizationData();
            organizationDataFetchedRef.current = true;
          }, 100);
        }
      }
    };

    if (knowledgeBase?.customercode) {
      fetchCustomerData();
    }
  }, [knowledgeBase?.customercode]);
  // Track current KB being edited to detect changes
  const currentKbRef = useRef<string>("");
  
  useEffect(() => {
    // Create unique identifier for current KB
    const currentKbId = `${customercode}-${knowladgebasename}-${orgCode}-${appCode}-${sourcename}`;
    
    // Only reset form state if we're editing a different KB
    if (currentKbRef.current !== currentKbId) {
      const resetFormState = () => {
        setDocumentFiles([]);
        setCoverImage(null);
        setBookImage(null);
        setBookImagePath(null);
        setImagePreviewOpen(false);
        setFileList([]);
        setImageToDelete(false);
        setDocumentsToDelete(new Set());
        setKnowledgeBase(null);
        setLoading(true);
        setError(null);
        setShowApiDialog(false);
        setApiDialogData(null);
        setIsUpdating(false);
        // Reset retrieval sync ref
        retrievalSynced.current = false;
      };

      resetFormState();
      currentKbRef.current = currentKbId;
    }

    // Actually fetch/get_kb_details and bind result
    async function fetchKB() {
      setLoading(true);
      setError(null);
      try {
        const token = encodeURIComponent(await getKbAuthToken());

        const kbName = knowladgebasename || "";
        const params = new URLSearchParams(location.search);
        const kbcodeFromUrl = params.get("kbcode") || "";

        let kbcode = kbcodeFromUrl;
        if (!kbcode) {
          try {
            const existingParams = new URLSearchParams({
              par_custcode: String(customercode || "0"),
              par_orgcode: String(orgCode || "0"),
              par_appcode: String(appCode || "0"),
              auth_token: token,
              book_id: String(sessionStorage.getItem('programCode')||'')
            });

            const existingUrl = `${API_ENDPOINTS.GET_EXISTING_KB}?${existingParams.toString()}`;
            const existingRes = await fetch(existingUrl);
            const existingJson = await existingRes.json().catch(() => ({}));
            const list = Array.isArray(existingJson?.data) ? existingJson.data : [];
            const match = list.find((kb: any) => String(kb?.knowladgebasename || "") === kbName);
            const id = match?.knowledgebase_id;
            if (id != null && id !== "") kbcode = `${String(id)}`;
          } catch {
            // ignore and let backend handle missing kbcode
          }
        }

        const reqPayload = {
          custcode: customercode,
          orgcode: orgCode,
          kbname: kbName,
          appcode: appCode,
          sourcename: sourcename || "",
          kbcode,
          auth_token: token,
          book_id: String(sessionStorage.getItem('programCode')||'')
        };

        const url = `${API_ENDPOINTS.GET_KB_DETAILS}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqPayload),
        });
        const json = await res.json();
        const row = Array.isArray(json.data) && json.data.length > 0 ? json.data[0] : null;
        if (!row) throw new Error("No knowledge base found for given details.");
        // Map values to modal fields/controls
        setKnowledgeBase({
          id: `${customercode}-${row.knowladgebasename}`,
          customercode,
          knowladgebasename: row.knowladgebasename || knowladgebasename,

          orgCode,
          appCode,
          organizationcode: orgCode,
          appcode: appCode,
          sourcename: row.soursename || sourcename,
          name: row.knowladgebasename || knowladgebasename,
          bookName: row.soursename || row.bookname || "",
          type: "book",
          retrievalStrategy: String(row.retrivalstrategy ?? ""),
          rerankingCandidates: Math.min(10, Math.max(1, Number(row.numberofkvalue ?? "") || 3)),
          chunkSize: String(row.chunkingsize ?? ""),
          overlapPercentage: String(row.overlappercentage ?? ""),
          chunkingStrategy: String(row.chunkingstrategy ?? ""),
          dbType: String(row.dbtype ?? ""),
          embeddingModel: String(row.embeddingmodel ?? ""),
        });
      } catch (e: any) {
        setError(e.message || "Failed to fetch KB details");
      } finally {
        setLoading(false);
      }
    }
    fetchKB();
  }, [customercode, knowladgebasename, orgCode, appCode, sourcename]);


  // Fetch file list only when these core identifiers change (not on any settings change)
  useEffect(() => {
    if (
      !knowledgeBase ||
      !knowledgeBase.customercode ||
      !knowledgeBase.dbType ||
      !knowledgeBase.knowladgebasename
    )
      return;
    async function fetchFileList() {
      const token = encodeURIComponent(await getKbAuthToken());
      try {
        const params = new URLSearchParams({
          customercode: knowledgeBase.customercode,
          vector_db: knowledgeBase.dbType,
          knowledge_base_name: knowledgeBase.knowladgebasename,
          auth_token: token
        });
        const fileListRes = await fetch(`${API_ENDPOINTS.LIST_KB_FILES}?${params.toString()}`);
        if (fileListRes.ok) {
          const fileData = await fileListRes.json();
          setFileList(Array.isArray(fileData.Document_Upload) ? fileData.Document_Upload : []);
        }
      } catch (e) {
        console.error("Failed to fetch file list", e);
      }
    }
    fetchFileList();
  }, [
    knowledgeBase?.customercode,
    knowledgeBase?.dbType,
    knowledgeBase?.knowladgebasename
  ]);

  // Canonicalize/normalize retrievalStrategy only once after both KB and options load, never racing user selection
  const retrievalSynced = useRef(false);
  useEffect(() => {
    if (!knowledgeBase || !retrievalOptions.length) return;
    if (retrievalSynced.current) return;
    // Only set if not already a valid value
    const apiValue = knowledgeBase.retrievalStrategy;
    const canonicalValue = getRetrievalStrategyCanonical(apiValue);
    const valid = retrievalOptions.some(opt => opt.value === canonicalValue);
    if (!valid) {
      // fallback to first
      setKnowledgeBase(kb => kb ? { ...kb, retrievalStrategy: retrievalOptions[0].value } : kb);
    } else if (knowledgeBase.retrievalStrategy !== canonicalValue) {
      setKnowledgeBase(kb => kb ? { ...kb, retrievalStrategy: canonicalValue } : kb);
    }
    retrievalSynced.current = true;
  }, [knowledgeBase, retrievalOptions]);
  // Reset the sync ref if KB details change (should only reset on a full KB fetch)
  useEffect(() => {
    retrievalSynced.current = false;
  }, [knowledgeBase]);

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const allowed = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];
      const maxSize = 50 * 1024 * 1024; // 30MB limit
      
      const validFiles = filesArray.filter(f => {
        const ext = f.name.toLowerCase().split('.').pop() || '';
        const isValidType = allowed.includes(f.type) || ['pdf','docx','txt'].includes(ext);
        
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
          title: 'Files Uploaded',
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
    console.log("handleDocumentDrop called");
    e.preventDefault();
    setIsDraggingDocument(false);
    
    const files = Array.from(e.dataTransfer.files);
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    const allowedExtensions = ['pdf', 'docx', 'txt'];
    const maxSize = 50 * 1024 * 1024; // 50MB limit
    
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
      
      // Check file size
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
    
    // Also clear the file input to allow re-selecting the same files
    const fileInput = document.getElementById('document-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  // Modal state for API response
  const [showApiDialog, setShowApiDialog] = useState(false);
  const [apiDialogData, setApiDialogData] = useState<any | null>(null);
  
  // Loading state for update process
  const [isUpdating, setIsUpdating] = useState(false);


  const removeDocumentFile = (index: number) => {
    setDocumentFiles(prev => prev.filter((_, i) => i !== index));
  };
  // Get the current label for search_type from the retrievalOptions
  const getSearchTypeLabel = () => {
    return (
      retrievalOptions.find(opt => opt.value === knowledgeBase?.retrievalStrategy)
        ?.label || knowledgeBase?.retrievalStrategy || ""
    );
  };

  // Get organization name from organization code
  const getOrganizationName = () => {
    if (!orgCode) return "";
    const org = organizationOptions.find(option => option.value === orgCode);
    return org ? org.label.trim() : orgCode;
  };

  // Get customer name from customer code
  const getCustomerName = () => {
    if (!knowledgeBase?.customercode) return "";
    console.log('Debug - customercode:', knowledgeBase.customercode);
    console.log('Debug - customerOptions:', customerOptions);
    const customer = customerOptions.find(option => option.value === knowledgeBase.customercode);
    console.log('Debug - found customer:', customer);
    const result = customer ? customer.label.trim() : knowledgeBase.customercode;
    console.log('Debug - customer name result:', result);
    return result;
  };

  // Submit (Update KB)
  const handleUpdate = async () => {
    // Check if there are no documents in both "Uploaded Documents (stored in KB)" section and "Document Upload" section
    if (fileList.length === 0 && documentFiles.length === 0) {
      toast({
        title: "Cannot update knowledge base",
        description: "No documents found. Please add at least one document in 'Document Upload' section.",
        variant: "destructive"
      });
      return;
    }

    setIsUpdating(true); // Start loading

    // Delete marked documents first
    if (documentsToDelete.size > 0) {
      const deletePromises = Array.from(documentsToDelete).map(async (path) => {
        try {
          const token = encodeURIComponent(await getKbAuthToken());
          const resp = await fetch(`${API_ENDPOINTS.REMOVE_KB_FILES}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer: customercode,
              vector_db: knowledgeBase?.dbType,
              knowledge_base_name: knowledgeBase?.knowladgebasename,
              path: path,
              auth_token: token
            }),
          });
          return resp.ok;
        } catch {
          return false;
        }
      });

      const deleteResults = await Promise.all(deletePromises);
      const failedDeletes = deleteResults.filter(result => !result).length;
      
      if (failedDeletes > 0) {
        setIsUpdating(false);
        toast({
          title: "Delete operation failed",
          description: `${failedDeletes} document(s) could not be deleted. Please try again.`,
          variant: "destructive"
        });
        return;
      }
    }
    
    // Always use literal "null" string for customer to match backend expectation
    const customerName = "null";
    const formData = new FormData();
    // formData.append("customer", customerName);
    formData.append("customercode", knowledgeBase?.customercode || "");
    // formData.append("appcode", knowledgeBase?.appCode || "");
    formData.append("orgcode", knowledgeBase?.orgCode || "");
    formData.append("knowledge_base_name", knowledgeBase?.knowladgebasename || "");
    formData.append("chunk_size", knowledgeBase?.chunkSize || "");
    formData.append("overlap_percentage", knowledgeBase?.overlapPercentage || "");
    formData.append("chunking_strategy", knowledgeBase?.chunkingStrategy || "");
    formData.append("embedding_model", knowledgeBase?.embeddingModel || "");
    formData.append("vector_db", getDbTypeCanonical(knowledgeBase?.dbType || ""));
    formData.append("search_type", getSearchTypeLabel());
    formData.append("rerank_k", String(knowledgeBase?.rerankingCandidates ?? ""));
    formData.append('book_id', String(sessionStorage.getItem('programCode')||''));
    // formData.append("book_name", knowledgeBase?.bookName || "");
    // formData.append("LevelType", "Book Level");

    // Append newly selected documents (field name must be 'files')
    if (Array.isArray(documentFiles) && documentFiles.length > 0) {
      documentFiles.forEach((f) => {
        formData.append("files", f);
      });
    }

    try {
      const token = await getKbAuthToken();
      formData.append('auth_token', token);
      const response = await fetch(`${API_ENDPOINTS.UPDATE_KNOWLEDGEBASE}`, {
        method: "POST",
        body: formData,
      });
      let data: any = {};
      try {
        data = await response.json();
      } catch (e) {
        // JSON parsing failed, likely due to 413 error or other server issues
        console.error('Failed to parse response JSON:', e);
      }
      
      if (!response.ok) {
        // Handle specific HTTP status codes
        let errorMessage = 'Failed to update knowledge base';
        if (response.status === 413) {
          errorMessage = 'The total size of uploaded files exceeds the server limit. Please try uploading smaller files or fewer files at a time.';
          toast({ 
            title: 'Content Too Large', 
            description: errorMessage, 
            variant: 'destructive' 
          });
        } else if (response.status === 429) {
          errorMessage = 'Server is busy. Please wait a moment and try again.';
          toast({ 
            title: 'Too Many Requests', 
            description: errorMessage, 
            variant: 'destructive' 
          });
        } else if (response.status >= 500) {
          errorMessage = 'Server is temporarily unavailable. Please try again later.';
          toast({ 
            title: 'Server Error', 
            description: errorMessage, 
            variant: 'destructive' 
          });
        } else {
          errorMessage = data?.message || 'Failed to update knowledge base';
          toast({ 
            title: 'Update Failed', 
            description: errorMessage, 
            variant: 'destructive' 
          });
        }
        
        setApiDialogData({
          status: "error",
          message: errorMessage,
        });
        setShowApiDialog(true);
        return;
      }
      
      setApiDialogData(data);
      setShowApiDialog(true);
    } catch (err: any) {
      setApiDialogData({
        status: "error",
        message: err?.message || "Unknown error",
      });
      setShowApiDialog(true);
    } finally {
      setIsUpdating(false); // Stop loading
    }
  };

  if (loading) {
    return (
      <PageLoader text="Loading Knowledge Base..." />
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-red-600">
        {error}
      </div>
    );
  }
  if (!knowledgeBase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-700">
        Knowledge Base not found
      </div>
    );
  }

  // Compute filtered document list (excluding vectorstore artifacts)
  const userFiles = Array.isArray(fileList)
    ? fileList.filter(f => {
        const fname = typeof f === "string" ? f.split('/').pop()?.toLowerCase() : "";
        return fname !== "index.faiss" && fname !== "index.pkl";
      })
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      {!isSSO && (
        <div className="fixed left-0 top-0 h-full w-52 z-40 hidden lg:block">
          <AppSidebar />
        </div>
      )}

      {/* Mobile Menu Sheet */}
      {!isSSO && (
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <AppSidebar />
          </SheetContent>
        </Sheet>
      )}

      <div className={isSSO ? "min-h-screen flex flex-col" : "ml-0 lg:ml-52 min-h-screen flex flex-col"}>
        {/* Page Title Section */}
        {!isSSO && (
          <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/knowledge-base")}
                  className="flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 p-1">
                  <div className="h-full w-full rounded-xl bg-blue-600 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h2 className="text-base sm:text-xl font-semibold text-gray-900">
                    Edit Knowledge Base
                  </h2>
                  <p className="text-sm text-gray-600">
                    KB: {knowledgeBase.knowladgebasename} | Customer: {customerLoading ? 'Loading...' : (getCustomerName() || knowledgeBase.customercode)} | Org: {organizationLoading ? 'Loading...' : (getOrganizationName() || orgCode)}
                  </p>
                </div>
              </div>
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
              
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
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
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Basic Information Card */}
            <Card className="border-2 border-grey-100 bg-grey-50">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-grey-900">
                      Knowledge Base Name <span className="text-red-500">*</span>
                    </Label>
                    <Input 
                      placeholder="Enter knowledge base name" 
                      defaultValue={knowledgeBase.name}
                      disabled={true}
                      className="bg-white rounded-full border-grey-200 focus:border-grey-400 focus:ring-grey-400/20"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upload Section Card */}
            <Card className="border-2 border-grey-100 bg-grey-50">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-5 bg-blue-600 rounded-full" /><h3 className="text-lg font-semibold text-gray-900">File Uploads</h3>
                </div>

                
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2 flex-1">
                    <Label className="text-sm font-medium text-grey-900">
                      Document Upload <span className="text-red-500">*</span>
                    </Label>
                    {/* (Existing documents display moved to a dedicated card after this section) */}
                    <label 
                      className={`block bg-white border-2 border-dashed rounded-lg p-8 text-center space-y-3 transition-colors cursor-pointer h-[200px] flex flex-col items-center justify-center ${
                        isDraggingDocument 
                          ? 'border-grey-500 bg-grey-50' 
                          : 'border-grey-200 hover:border-grey-300'
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
                        <div className={`p-3 rounded-lg transition-colors ${
                          isDraggingDocument ? 'bg-grey-200' : 'bg-blue-100'
                        }`}>
                          <FileText className={`h-8 w-8 transition-colors ${
                            isDraggingDocument ? 'text-grey-600' : 'text-blue-600'
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
                      <div className="bg-white border border-blue-200 rounded-lg p-4 space-y-2">
                        <p className="text-sm font-medium text-gray-900 mb-2">{documentFiles.length} file(s) uploaded:</p>
                        {documentFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
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
                </div>
              </CardContent>
            </Card>

            {/* Existing Cover Image Card (visible for both Book and Study levels) */}
            {bookImage && (
              <Card className="border-2 border-gray-100 bg-white">
                <CardContent className="p-6">
                  <div className="mb-2 font-semibold text-gray-800">Existing Cover Image (stored)</div>
                  <div className="flex flex-col items-start gap-2">
                    <img
                      src={bookImage}
                      alt="Current Book Cover"
                      className="rounded-lg max-h-48 w-auto border border-gray-200 mb-2 cursor-pointer"
                      style={{ maxWidth: 256, objectFit: "contain", background: "#f3f3f3" }}
                      onClick={() => setImagePreviewOpen(true)}
                      onError={(e) => {
                        setBookImage(null);
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
                          message: "Are you sure you want to delete the cover image? This will be removed when you update the knowledge base.",
                          onConfirm: () => {
                            setBookImage(null);
                            setBookImagePath(null);
                            setImageToDelete(true);
                            setConfirmDialog(dlg => ({ ...dlg, open: false }));
                          },
                          onCancel: () => setConfirmDialog(dlg => ({ ...dlg, open: false }))
                        });
                      }}
                      className="border border-red-200 text-red-600 px-3 hover:bg-red-50"
                    >
                      Delete Image
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Uploaded Documents Card */}
            {fileList.length > 0 && (
              <Card className="border-2 border-gray-100 bg-white">
                <CardContent className="p-6">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-gray-800">Uploaded Documents (stored in KB)</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                      {fileList.length} file{fileList.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {fileList.map((path: string, index: number) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg border border-gray-100"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                          <span
                            className="text-sm text-gray-700 truncate"
                            title={path}
                          >
                            {(typeof path === "string" && path)
                              ? path.replace(/^Document_Upload\//, "")
                              : ""}
                          </span>
                        </div>
                        {path && (
                          <div className="flex items-center gap-1">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="hover:bg-blue-100"
                          >
                            <a
                              href={
                                `${API_ENDPOINTS.DOWNLOAD_KB_FILE}` +
                                `?customer=${encodeURIComponent(customercode || "")}` +
                                `&vector_db=${encodeURIComponent(knowledgeBase?.dbType || "")}` +
                                `&knowledge_base_name=${encodeURIComponent(knowledgeBase?.knowladgebasename || "")}` +
                                `&path=${encodeURIComponent(path)}`
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              <svg width="0" height="0" style={{display: "none"}}></svg>
                              {/* Download Icon */}
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                className="h-4 w-4 text-blue-600"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </a>
                          </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="hover:bg-red-100"
                              onClick={() => {
                                setConfirmDialog({
                                  open: true,
                                  title: "Delete Document",
                                  message: `Are you sure you want to delete "${(typeof path === "string" && path) ? path.replace(/^Document_Upload\//, "") : ""}"? This will be removed when you update the knowledge base.`,
                                  onConfirm: () => {
                                    setDocumentsToDelete(prev => new Set(prev).add(path));
                                    setFileList(prev => prev.filter(p => p !== path));
                                    setConfirmDialog(dlg => ({ ...dlg, open: false }));
                                  },
                                  onCancel: () => setConfirmDialog(dlg => ({ ...dlg, open: false }))
                                });
                              }}
                              aria-label="Delete"
                            >
                              {/* Bin/Trash Icon */}
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                className="h-4 w-4 text-red-600"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h16" />
                              </svg>
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Processing Settings Card */}
            <Card className="border border-gray-200/70 bg-white rounded-2xl shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                          <span className="inline-block w-1 h-6 bg-blue-600 rounded-full" aria-hidden="true" />
                          Processing Settings
                        </h3>
                </div>
                
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
                    <Select
                      value={knowledgeBase.retrievalStrategy}
                      onValueChange={(value) => {
                        const newKnowledgeBase = { ...knowledgeBase, retrievalStrategy: value };
                        // Auto-adjust embedding model for compatibility
                        if (value === 'hybrid') {
                          // When switching to Hybrid, auto-select all-MiniLM-L6-v2 if available
                          const miniLMOption = embeddingOptions.find(o => o.value === 'all-MiniLM-L6-v2');
                          if (miniLMOption) {
                            newKnowledgeBase.embeddingModel = 'all-MiniLM-L6-v2';
                          }
                        } else if (value === 'mmr' || value === 'similarity') {
                          // When switching to MMR or Similarity, if current model is all-MiniLM-L6-v2,
                          // switch to first available non-disabled option
                          if (newKnowledgeBase.embeddingModel === 'all-MiniLM-L6-v2') {
                            const firstAvailableOption = embeddingOptions.find(o => o.value !== 'all-MiniLM-L6-v2');
                            if (firstAvailableOption) {
                              newKnowledgeBase.embeddingModel = firstAvailableOption.value;
                            }
                          }
                        }
                        setKnowledgeBase(newKnowledgeBase);
                      }}
                    >
                      <SelectTrigger className="bg-white rounded-full border-gray-200 focus:border-blue-400 focus:ring-blue-400/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {retrievalOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                      min={1}
                      max={8}
                      step={1}
                      placeholder="Enter value between 1-8"
                      value={knowledgeBase.rerankingCandidates}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          // Allow empty input (user cleared the field)
                          setKnowledgeBase({ ...knowledgeBase, rerankingCandidates: '' });
                        } else {
                          const num = Number(value);
                          // Only update if it's a valid number within range
                          if (!isNaN(num) && num >= 1 && num <= 8) {
                            setKnowledgeBase({ ...knowledgeBase, rerankingCandidates: num });
                          }
                        }
                      }}
                      onBlur={() => {
                        // On blur, ensure we have a valid value (default to 1 if empty)
                        if (knowledgeBase.rerankingCandidates === '' || isNaN(Number(knowledgeBase.rerankingCandidates))) {
                          setKnowledgeBase({ ...knowledgeBase, rerankingCandidates: 3 });
                        }
                      }}
                            className="bg-white rounded-full border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
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
                    <Select value={knowledgeBase.chunkSize} onValueChange={(value) => setKnowledgeBase({ ...knowledgeBase, chunkSize: value })}>
                      <SelectTrigger className="bg-white rounded-full border-gray-200 focus:border-blue-400 focus:ring-blue-400/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {chunkSizeOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                    <Select value={knowledgeBase.overlapPercentage} onValueChange={(value) => setKnowledgeBase({ ...knowledgeBase, overlapPercentage: value })}>
                      <SelectTrigger className="bg-white rounded-full border-gray-200 focus:border-blue-400 focus:ring-blue-400/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {overlapOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                    <Select value={knowledgeBase.chunkingStrategy} onValueChange={(value) => setKnowledgeBase({ ...knowledgeBase, chunkingStrategy: value })}>
                      <SelectTrigger className="bg-white rounded-full border-gray-200 focus:border-blue-400 focus:ring-blue-400/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {chunkingOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                    <Select value={knowledgeBase.dbType} onValue-Change={(value) => setKnowledgeBase({ ...knowledgeBase, dbType: value })} disabled>
                      <SelectTrigger className="bg-white rounded-full border-gray-200 focus:border-blue-400 focus:ring-blue-400/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {dbTypeOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                    <Select value={knowledgeBase.embeddingModel} onValueChange={(value) => setKnowledgeBase({ ...knowledgeBase, embeddingModel: value })}>
                      <SelectTrigger className="bg-white rounded-full border-gray-200 focus:border-blue-400 focus:ring-blue-400/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {getFilteredEmbeddingOptions().map(option => (
                          <SelectItem 
                            key={option.value} 
                            value={option.value}
                            disabled={option.disabled}
                            className={option.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                          >
                            {option.label}
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
                    onClick={() => navigate("/knowledge-base")}
                    className="border-gray-300 rounded-full text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-blue-600 rounded-full hover:bg-blue-700 text-white"
                    onClick={handleUpdate}
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Updating..." : "Update Knowledge Base"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Image Preview Modal */}
      {imagePreviewOpen && bookImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40" style={{ animation: "fadeIn 0.2s" }}>
          <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 max-w-4xl w-[92%] relative">
            <div className="mb-3 font-semibold text-gray-800">Image Preview</div>
            <div className="flex items-center justify-center">
              <img
                src={bookImage}
                alt="Book cover preview"
                className="rounded-md border border-gray-200"
                style={{ maxHeight: "70vh", width: "auto", objectFit: "contain", background: "#f9fafb" }}
              />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button
                variant="outline"
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setImagePreviewOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Update Loader Overlay */}
      {isUpdating && (
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
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Updating Knowledge Base</h3>
                <p className="text-sm text-gray-600">Please wait while we process your documents...</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* API Response Dialog */}
      {showApiDialog && apiDialogData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
          style={{ animation: "fadeIn 0.2s" }}
        >
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full relative">
            <div className="mb-4 flex items-center justify-start">
              <span className="text-lg font-semibold text-green-700">
                Updated
              </span>
            </div>

            <div className="mb-2 text-left">
              Knowledge Base updated successfully.
            </div>

            <div className="flex justify-end mt-5">
              <Button
                onClick={() => {
                  setShowApiDialog(false);
                  navigate("/knowledge-base");
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                OK
              </Button>
            </div>
          </div>

        </div>
      )}
    {/* Confirmation Dialog */}
    {confirmDialog.open && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40" style={{ animation: "fadeIn 0.2s" }}>
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
  );
};

export default ManageEditKnowledgeBase;
