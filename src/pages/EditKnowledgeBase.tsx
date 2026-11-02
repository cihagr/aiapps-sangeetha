import { useState, useEffect, useRef } from "react";
import { withCustOrgCodes } from '@/utils/custOrgCodes';
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
import { useToast } from "@/hooks/use-toast";

const EditKnowledgeBase = () => {
  const { toast } = useToast();

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
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [levelType, setLevelType] = useState<"book" | "study">("book");
  const [selectedBook, setSelectedBook] = useState("");
  const [selectedStudy, setSelectedStudy] = useState("");
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

  // Computed state for filtered embedding options based on retrieval strategy
  const getFilteredEmbeddingOptions = () => {
    if (!knowledgeBase) return [];
    const searchType = knowledgeBase.retrievalStrategy;
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

  // Book/Study LOVs for Study Level (abc.tsx parity)
  const [bookLovOptions, setBookLovOptions] = useState<{ value: string; label: string; bookid?: number }[]>([]);
  const [bookLovLoading, setBookLovLoading] = useState(false);
  const [studyLovOptions, setStudyLovOptions] = useState<{ value: string; label: string }[]>([]);
  const [studyLovLoading, setStudyLovLoading] = useState(false);
  const studyCacheRef = useRef<Record<number, { value: string; label: string }[]>>({});
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

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
      case 1: // Retrieval Strategy
        return getRetrievalStrategyCanonical(name || code);
      case 2: // Chunk Size (tokens)
        const chunkSizeMatch = (row?.value ?? row?.code ?? row?.name ?? '').toString().match(/\d+/);
        return chunkSizeMatch ? chunkSizeMatch[0] : '1000';
      case 3: // Overlap Percentage
        const overlapMatch = (row?.value ?? row?.code ?? row?.name ?? '').toString().match(/\d+/);
        return overlapMatch ? overlapMatch[0] : '20';
      case 4: // Chunking Strategy
        if (code === 'CS_001' || name.includes('recursive')) return 'recursive';
        return 'paragraph';
      case 5: // Database Type
        if (code === 'DB_001' || name.includes('faiss')) return 'faiss';
        // Normalize any variant like 'chromadb' to 'chroma'
        if (name.includes('chromadb') || name.includes('chroma')) return 'chroma';
        return 'chroma';
      case 6: // Embedding Model
        if (code === 'EM_001' || name.includes('ada-002')) return 'text-embedding-ada-002';
        if (code === 'EM_002' || name.includes('3-large')) return 'text-embedding-3-large';
        if (code === 'EM_003' || name.includes('mini')) return 'all-MiniLM-L6-v2';
        return 'text-embedding-ada-002';
      default:
        return String(row?.value ?? row?.code ?? row?.name ?? '').trim();
    }
  };

  // Fetch metadata for dropdowns
  useEffect(() => {
    const fetchMetadata = async (id: number, setter: (opts: Option[]) => void) => {
      try {
        const res = await fetch(`${API_ENDPOINTS.GET_METADATA}/${id}`);
        const json = await res.json();
        const rows = Array.isArray(json?.options) ? json.options : [];
        // Make sure .value is always a stable API keyword, .label for display
        const options = rows.map((r: any) => {
          let val = mapValueById(id, r);
          let label = "";
          if (id === 1) { // Retrieval Strategy
            if (val === "mmr") {
              label = "Maximal Marginal Relevance (MMR)";
            } else if (val.toLowerCase() === "similarity") {
              label = "Similarity";
            } else {
              label = "Hybrid Cross Encode ( MRR + Similarity)";
              val = "hybrid";
            }
          } else {
            label = String(r.name || r.label || r.code || val);
          }
          return { value: val, label };
        });
        setter(options);
      } catch (e) {
        console.error(`Failed to load metadata for id ${id}`, e);
        setter([]);
      }
    };

    fetchMetadata(1, setRetrievalOptions);
    fetchMetadata(2, setChunkSizeOptions);
    fetchMetadata(3, setOverlapOptions);
    fetchMetadata(4, setChunkingOptions);
    fetchMetadata(5, setDbTypeOptions);
    fetchMetadata(6, setEmbeddingOptions);
  }, []);

  // Fetch organization data for getting organization name
  useEffect(() => {
    const fetchOrganizationData = async () => {
      if (!knowledgeBase?.customercode || organizationLoading) return;
      setOrganizationLoading(true);
      try {
        const response = await fetch(API_ENDPOINTS.GET_ORGANIZATION_DETAILS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ par_custcode: knowledgeBase.customercode }),
        });
        const data = await response.json();
        if (Array.isArray(data.data)) {
          const options = data.data.map((org: any) => ({
            value: org.organizationcode,
            label: `${org.organizationname} `,
          }));
          setOrganizationOptions(options);
        }
      } catch (error) {
        console.error('Failed to fetch organization data:', error);
      } finally {
        setOrganizationLoading(false);
      }
    };

    if (knowledgeBase?.customercode) {
      fetchOrganizationData();
    }
  }, [knowledgeBase?.customercode]);

  // Fetch customer data for getting customer name
  useEffect(() => {
    const fetchCustomerData = async () => {
      if (!knowledgeBase?.customercode || customerLoading) return;
      setCustomerLoading(true);
      try {
        console.log('Fetching customer data for:', knowledgeBase.customercode);
        const response = await fetch(API_ENDPOINTS.GET_CUSTOMER_DATA_SLASH);
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
      }
    };

    if (knowledgeBase?.customercode) {
      fetchCustomerData();
    }
  }, [knowledgeBase?.customercode]);

  // Fetch Books list (for Study Level)
  useEffect(() => {
    let cancelled = false;
    async function fetchBooks() {
      setBookLovLoading(true);
      try {
        const res = await fetch(API_ENDPOINTS.GET_BOOKS_DETAILS, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            par_customercode: knowledgeBase?.customercode || '',
            par_organizationcode: (knowledgeBase as any)?.orgCode || (knowledgeBase as any)?.organizationcode || '',
            par_appcode: (knowledgeBase as any)?.appCode || (knowledgeBase as any)?.appcode || '',
          }),
        });
        const data = await res.json();
        const books = Array.isArray(data) ? data : (data.data || []);
        if (!cancelled && Array.isArray(books)) {
          const options = books
            .map((book: any) => {
              const rawName = typeof book?.bookname === 'string' ? book.bookname.trim() : '';
              if (!rawName) return null;
              const mappedId = book?.bookid ?? book?.id;
              const numericId = mappedId != null ? Number(mappedId) : undefined;
              return { value: rawName, label: rawName, bookid: numericId };
            })
            .filter(Boolean) as { value: string; label: string; bookid?: number }[];
          // de-duplicate by value
          const seen = new Set<string>();
          const unique = options.filter(o => {
            if (seen.has(o.value)) return false; seen.add(o.value); return true;
          });
          setBookLovOptions(unique);
          // If KB is study type, align selected book id by name
          if (knowledgeBase && knowledgeBase.type === 'study') {
            const match = unique.find(o => o.label === (knowledgeBase.bookName || ''));
            setSelectedBook(match ? match.value : '');
            setSelectedBookId(match?.bookid ?? null);
          }
        }
      } catch (e) {
        if (!cancelled) setBookLovOptions([]);
      } finally {
        if (!cancelled) setBookLovLoading(false);
      }
    }
    // Only relevant for Study Level view
    if (levelType === 'study') fetchBooks();
    return () => { cancelled = true; };
  }, [levelType, knowledgeBase?.bookName, knowledgeBase?.type]);

  // Fetch Study list based on selectedBookId (with cache)
  useEffect(() => {
    let cancelled = false;
    async function fetchStudies(bookId: number) {
      if (studyCacheRef.current[bookId]) {
        setStudyLovOptions(studyCacheRef.current[bookId]);
        return;
      }
      setStudyLovLoading(true);
      try {
        const response = await fetch(withCustOrgCodes(`${API_ENDPOINTS.AIG_CHAPTERS}?bookcode=${bookId}`, {
          custcode: customercode || knowledgeBase?.customercode,
          orgcode: orgCode || (knowledgeBase as any)?.orgCode || (knowledgeBase as any)?.organizationcode,
        }));
        const responseData = await response.json();
        if (!cancelled) {
          if (responseData && Array.isArray(responseData.data)) {
            const options = responseData.data
              .map((chapter: { chapterCode: string; chapterName: string }) => ({
                value: chapter.chapterName,
                label: chapter.chapterName,
              }))
              .filter((opt: any) => typeof opt.value === 'string' && opt.value.trim().length > 0);
            // de-duplicate
            const seen = new Set<string>();
            const unique = options.filter((o: any) => {
              if (seen.has(o.value)) return false; seen.add(o.value); return true;
            });
            studyCacheRef.current[bookId] = unique;
            setStudyLovOptions(unique);
          } else {
            setStudyLovOptions([]);
          }
        }
      } catch (e) {
        if (!cancelled) setStudyLovOptions([]);
      } finally {
        if (!cancelled) setStudyLovLoading(false);
      }
    }
    if (levelType === 'study' && selectedBookId) fetchStudies(selectedBookId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelType, selectedBookId]);

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
        setSelectedBook("");
        setSelectedStudy("");
        setSelectedBookId(null);
        setLevelType("book");
        setBookLovOptions([]);
        setStudyLovOptions([]);
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
        const reqPayload = {
          custcode: customercode,
          orgcode: orgCode,
          kbname: knowladgebasename || "", // updated to match route param
          appcode: appCode,
          sourcename: "",
          book_id: String(sessionStorage.getItem('programCode') || '')
        };
        const res = await fetch(API_ENDPOINTS.GET_KB_DETAILS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqPayload)
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
          type: row.leveltype?.toLowerCase().includes("study") ? "study" : "book",
          retrievalStrategy: String(row.retrivalstrategy ?? ""),
          rerankingCandidates: Math.min(10, Math.max(1, Number(row.numberofkvalue ?? "") || 1)),
          chunkSize: String(row.chunkingsize ?? ""),
          overlapPercentage: String(row.overlappercentage ?? ""),
          chunkingStrategy: String(row.chunkingstrategy ?? ""),
          dbType: String(row.dbtype ?? ""),
          embeddingModel: String(row.embeddingmodel ?? ""),
        });
        setLevelType(row.leveltype && String(row.leveltype).toLowerCase().includes("study") ? "study" : "book");
        setSelectedBook(row.soursename || row.bookname || "");
        setSelectedStudy(row.knowladgebasename || knowladgebasename || "");
      } catch (e: any) {
        setError(e.message || "Failed to fetch KB details");
      } finally {
        setLoading(false);
      }
    }
    fetchKB();
  }, [customercode, knowladgebasename, orgCode, appCode, sourcename]);

  // Fetch book image only once for a given bookName, and ONLY show if GET 200 works (robust, abc.tsx style)
  useEffect(() => {
    let cancelled = false;
    if (!knowledgeBase || !knowledgeBase.bookName) return;
    async function fetchBookImage() {
      try {
        const bookImageRes = await fetch(`${API_ENDPOINTS.LIST_BOOK_IMAGES}?bookname=${encodeURIComponent(knowledgeBase.bookName)}`);
        if (!bookImageRes.ok) { if (!cancelled) { setBookImage(null); setBookImagePath(null); } return; }
        const imageData = await bookImageRes.json();
        let imgUrl = null;
        let relPath = null;
        if (Array.isArray(imageData.images) && imageData.images.length > 0) {
          const img = imageData.images[0];
          imgUrl = img.backend_download_url || img.full_url || null;
          relPath = img.path || null;
          if (!relPath && imgUrl) {
            const match = imgUrl.match(/[\/\\](images\/[^?#"']+)/);
            if (match) relPath = match[1];
          }
        } else if (imageData.data && imageData.data.url) {
          imgUrl = imageData.data.url;
          const match = imgUrl.match(/[\/\\](images\/[^?#"']+)/);
          if (match) relPath = match[1];
        }
        // Only check and set if the image exists for GET
        if (imgUrl) {
          try {
            const imgCheck = await fetch(imgUrl, { method: 'GET' });
            if (imgCheck.ok && !cancelled) {
              setBookImage(imgUrl);
              setBookImagePath(relPath || null);
              return;
            }
          } catch (e) { }
        }
        if (!cancelled) {
          setBookImage(null);
          setBookImagePath(null);
        }
      } catch (e) {
        console.error("Failed to fetch book image", e);
        if (!cancelled) {
          setBookImage(null);
          setBookImagePath(null);
        }
      }
    }
    fetchBookImage();
    return () => { cancelled = true; }
  }, [knowledgeBase?.bookName]);

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
      try {
        const params = new URLSearchParams({
          customercode: knowledgeBase.customercode,
          vector_db: knowledgeBase.dbType,
          knowledge_base_name: knowledgeBase.knowladgebasename,
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

  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      const allowedExtensions = ['jpg', 'jpeg', 'png'];
      const fileExtension = file.name.toLowerCase().split('.').pop() || '';
      const maxSize = 10 * 1024 * 1024; // 10MB limit

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

      // Check file size
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
    const maxSize = 10 * 1024 * 1024; // 10MB limit

    // Check file type and extension
    if (!allowedTypes.includes(file.type) || !allowedExtensions.includes(fileExtension)) {
      toast({
        title: 'Invalid File Type',
        description: `File "${file.name}" is not supported. Please upload only JPEG or PNG image files.`,
        variant: 'destructive'
      });
      return;
    }

    // Check file size
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

  const removeDocumentFile = (index: number) => {
    setDocumentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeCoverImage = () => {
    setCoverImage(null);
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
          const resp = await fetch(`${API_ENDPOINTS.REMOVE_KB_FILES}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer: customercode,
              vector_db: knowledgeBase?.dbType,
              knowledge_base_name: knowledgeBase?.knowladgebasename,
              path: path
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
    formData.append("customer", customerName);
    formData.append("customercode", knowledgeBase?.customercode || "");
    formData.append("appcode", knowledgeBase?.appCode || "");
    formData.append("orgcode", knowledgeBase?.orgCode || "");
    formData.append("knowledge_base_name", knowledgeBase?.knowladgebasename || "");
    formData.append("chunk_size", knowledgeBase?.chunkSize || "");
    formData.append("overlap_percentage", knowledgeBase?.overlapPercentage || "");
    formData.append("chunking_strategy", knowledgeBase?.chunkingStrategy || "");
    formData.append("embedding_model", knowledgeBase?.embeddingModel || "");
    formData.append("vector_db", getDbTypeCanonical(knowledgeBase?.dbType || ""));
    formData.append("search_type", getSearchTypeLabel());
    formData.append("rerank_k", String(knowledgeBase?.rerankingCandidates ?? ""));
    formData.append("book_name", knowledgeBase?.bookName || "");
    // Normalize LevelType to API-expected values
    const levelTypeForApi = (knowledgeBase?.type || "").toLowerCase().includes("study") ? "Study Level" : "Book Level";
    formData.append("LevelType", levelTypeForApi);

    // Append newly selected documents (field name must be 'files')
    if (Array.isArray(documentFiles) && documentFiles.length > 0) {
      documentFiles.forEach((f) => {
        formData.append("files", f);
      });
    }
    // Append cover image as 'image_files' (server expects this key)
    if (coverImage) {
      formData.append("image_files", coverImage);
    } else if (!imageToDelete && bookImage) {
      // Preserve existing image by re-attaching it when user hasn't changed/deleted it
      try {
        const resp = await fetch(bookImage);
        if (resp.ok) {
          const blob = await resp.blob();
          // Derive a filename from stored path or URL
          const nameFromPath = (bookImagePath || bookImage).split('/').pop() || 'cover.jpg';
          const file = new File([blob], nameFromPath, { type: blob.type || 'image/jpeg' });
          formData.append('image_files', file);
        }
      } catch { }
    }

    try {
      const response = await fetch(`${API_ENDPOINTS.PROCESS_DOCUMENTS}`, {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <svg className="animate-spin h-8 w-8 text-blue-600 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-70" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-blue-700 text-base">Loading Knowledge Base...</span>
        </div>
      </div>
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
      <div className="fixed left-0 top-0 h-full w-52 z-40 hidden lg:block">
        <AppSidebar />
      </div>

      {/* Mobile Menu Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <AppSidebar />
        </SheetContent>
      </Sheet>

      <div className="ml-0 lg:ml-52 min-h-screen flex flex-col">
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
        </header>

        {/* Page Title Section */}
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
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  Edit Knowledge Base
                </h2>
                <p className="text-sm text-gray-600">
                  KB: {knowledgeBase.knowladgebasename} | Customer: {customerLoading ? 'Loading...' : (getCustomerName() || knowledgeBase.customercode)} | Org: {organizationLoading ? 'Loading...' : (getOrganizationName() || orgCode)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Level Type Selection Card */}
            <Card className="border-2 border-purple-100 bg-purple-50">
              <CardContent className="p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-purple-800">Select Knowledge Base Type</h3>
                  <p className="text-sm text-purple-600 mt-1">Choose how you want to organize your knowledge base</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Book Level Option */}
                  <div
                    className={`group/disabled relative p-3 rounded-lg border-2 text-left transition-all ${levelType === "book"
                      ? "border-purple-600 bg-white shadow-md"
                      : "border-purple-200 bg-white"
                      } cursor-not-allowed select-none`}
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
                      {/* Show 'selected' tick if active */}
                      {levelType === "book" && (
                        <div className="absolute top-3 right-3">
                          <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                      {/* No red icon in disabled card */}
                    </div>
                  </div>

                  {/* Study Level Option */}
                  <div
                    className={`group/disabled relative p-3 rounded-lg border-2 text-left transition-all ${levelType === "study"
                      ? "border-purple-600 bg-white shadow-md"
                      : "border-purple-200 bg-white"
                      } cursor-not-allowed select-none`}
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
                      {/* Show tick if active */}
                      {levelType === "study" && (
                        <div className="absolute top-3 right-3">
                          <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                      {/* No red icon in disabled card */}
                    </div>
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
                    <Label className="text-sm font-medium text-blue-900">
                      {levelType === "book" ? "Book Name" : "Book"} <span className="text-red-500">*</span>
                    </Label>
                    {levelType === "book" ? (
                      <Input
                        placeholder="Enter Book name"
                        defaultValue={knowledgeBase.bookName}
                        disabled={true}
                        className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                      />
                    ) : (
                      <Input
                        placeholder="Book"
                        value={selectedBook || knowledgeBase.bookName || ""}
                        disabled={true}
                        className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-blue-900">
                      {levelType === "book" ? "Knowledge Base Name" : "Study"} <span className="text-red-500">*</span>
                    </Label>
                    {levelType === "book" ? (
                      <Input
                        placeholder="Enter knowledge base name"
                        defaultValue={knowledgeBase.name}
                        disabled={true}
                        className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                      />
                    ) : (
                      <Input
                        placeholder="Study"
                        value={selectedStudy || knowledgeBase.name || ""}
                        disabled={true}
                        className="bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                      />
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
                    <Label className="text-sm font-medium text-teal-900">
                      Document Upload <span className="text-red-500">*</span>
                    </Label>
                    {/* (Existing documents display moved to a dedicated card after this section) */}
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
                      <Label className="text-sm font-medium text-teal-900">Cover Image Upload</Label>
                      {/* (Existing image display moved to a dedicated card after this section) */}
                      <label
                        className={`block bg-white border-2 border-dashed rounded-lg p-8 text-center space-y-3 transition-colors cursor-pointer h-[200px] flex flex-col items-center justify-center ${isDraggingImage
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-teal-200 hover:border-teal-300'
                          }`}
                        onDragOver={handleImageDragOver}
                        onDragLeave={handleImageDragLeave}
                        onDrop={handleImageDrop}
                      >
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
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
                                <svg width="0" height="0" style={{ display: "none" }}></svg>
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
                    <Label className="text-sm font-medium text-orange-900 flex items-center gap-1">
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
                    </Label>
                    <Select value={knowledgeBase.retrievalStrategy} onValueChange={(value) => {
                      const newKnowledgeBase = { ...knowledgeBase, retrievalStrategy: value };
                      // Auto-adjust embedding model for compatibility
                      if (value === 'mmr' && newKnowledgeBase.embeddingModel === 'all-MiniLM-L6-v2') {
                        // Switch to first available non-MiniLM option
                        const availableOption = embeddingOptions.find(opt => opt.value !== 'all-MiniLM-L6-v2');
                        if (availableOption) {
                          newKnowledgeBase.embeddingModel = availableOption.value;
                        }
                      } else if (value === 'similarity' && newKnowledgeBase.embeddingModel !== 'all-MiniLM-L6-v2') {
                        // Switch to all-MiniLM-L6-v2 for similarity
                        newKnowledgeBase.embeddingModel = 'all-MiniLM-L6-v2';
                      }
                      setKnowledgeBase(newKnowledgeBase);
                    }}>
                      <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
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
                    <Label className="text-sm font-medium text-orange-900 flex items-center gap-1">
                      Number Of K values
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
                          setKnowledgeBase({ ...knowledgeBase, rerankingCandidates: 1 });
                        }
                      }}
                      className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-orange-900 flex items-center gap-1">
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
                    </Label>
                    <Select value={knowledgeBase.chunkSize} onValueChange={(value) => setKnowledgeBase({ ...knowledgeBase, chunkSize: value })}>
                      <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
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
                    <Label className="text-sm font-medium text-orange-900 flex items-center gap-1">
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
                    </Label>
                    <Select value={knowledgeBase.overlapPercentage} onValueChange={(value) => setKnowledgeBase({ ...knowledgeBase, overlapPercentage: value })}>
                      <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
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
                    <Label className="text-sm font-medium text-orange-900 flex items-center gap-1">
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
                    </Label>
                    <Select value={knowledgeBase.chunkingStrategy} onValueChange={(value) => setKnowledgeBase({ ...knowledgeBase, chunkingStrategy: value })}>
                      <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
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
                    <Label className="text-sm font-medium text-orange-900 flex items-center gap-1">
                      Database Type
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs bg-gray-800 text-white border-gray-700 px-4 py-3 rounded-lg shadow-lg">
                            <p className="text-sm leading-relaxed">The vector database used to store and search document embeddings. Faiss is faster for pure vector search, Chroma offers more features.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Select value={knowledgeBase.dbType} onValue-Change={(value) => setKnowledgeBase({ ...knowledgeBase, dbType: value })} disabled>
                      <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
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
                    <Label className="text-sm font-medium text-orange-900 flex items-center gap-1">
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
                    </Label>
                    <Select value={knowledgeBase.embeddingModel} onValueChange={(value) => setKnowledgeBase({ ...knowledgeBase, embeddingModel: value })}>
                      <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-400/20">
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
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
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

export default EditKnowledgeBase;