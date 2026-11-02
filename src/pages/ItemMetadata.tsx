import { useState, useEffect } from "react";
import axios from "axios";
import { getSessionCustOrgCodes } from "@/utils/custOrgCodes";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  Download,
  Upload,
  Filter,
  CheckCircle,
  Sparkles,
  BarChart3,
  Trash2,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { METADATA_API_URL, METADATA_TEMPLATE_URL } from "@/config";

// App code
const appcode = "IM";

const getCredentials = () => {
  if (typeof window === 'undefined') return { username: '', password: '' };
  const username = sessionStorage.getItem('email') || localStorage.getItem('username') || localStorage.getItem('email') || '';
  const password = sessionStorage.getItem('password') || localStorage.getItem('password') || '';
  return { username, password };
};

// --- Token API Handler ---
const API_URL = `${METADATA_API_URL}/remaining_tokens`;
type TokenApiResponse = {
  remaining_tokens: {
    remainingtoken: number;
    [key: string]: any;
  };
};
async function fetchTokens() {
  try {
    const { username, password } = getCredentials();
    const response = await axios.get<TokenApiResponse>(API_URL, {
      params: { username, password, appcode }
    });
    return response.data.remaining_tokens.remainingtoken;
  } catch (error) {
    console.error("Error fetching tokens:", error);
    return null;
  }
}

// --- Upload Metadata File API Handler ---
async function uploadMetadataFile({
  file,
  custom_metadata1,
  custom_metadata2,
  custom_metadata3,
}: {
  file: File,
  custom_metadata1: string,
  custom_metadata2: string,
  custom_metadata3: string,
}) {
  const formData = new FormData();
  formData.append("file", file);
  if (custom_metadata1 && custom_metadata1 !== "Select metadata") formData.append("custom_metadata1", custom_metadata1);
  if (custom_metadata2 && custom_metadata2 !== "Select metadata") formData.append("custom_metadata2", custom_metadata2);
  if (custom_metadata3 && custom_metadata3 !== "Select metadata") formData.append("custom_metadata3", custom_metadata3);
  const { username: credEmail, password: credPassword } = getCredentials();
  formData.append("email", credEmail);
  formData.append("password", credPassword);
  formData.append("appcode", appcode);
  // Whose LLM Configuration row is used (own row, else the default row).
  const { custcode, orgcode } = getSessionCustOrgCodes();
  formData.append("custcode", custcode);
  formData.append("orgcode", orgcode);

  const response = await axios.post(
    `${METADATA_API_URL}/upload`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
}

const handleDownloadTemplate = () => {
  const url = METADATA_TEMPLATE_URL;
  const a = document.createElement('a');
  a.href = url;
  a.download = "SampleQuestions.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const metadataOptions = [
  "Select metadata",
  "Grade Level",
  "Topic",
  "Learning Objective",
  "Bloom's Taxonomy Level",
  "Competency",
  "Misconception",
  "Marks",
  "Difficulty Level",
  "Subject"
];

const validateSpreadsheetFile = async (file: File) => {
  try {
    const name = file.name.toLowerCase();
    if (!(name.endsWith('.xlsx') || name.endsWith('.xls'))) {
      toast({
        title: "Invalid File Format",
        description: "The uploaded file does not appear to be a valid Excel file.Please ensure you upload your data in the .xls or .xlsx format",
        variant: "destructive"
      });
      return false;
    }

    const data = await file.arrayBuffer();
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(data, { type: "array" });
    } catch {
      toast({
        title: "Junk or Corrupted File",
        description: "The uploaded file could not be read. Please upload a valid .xlsx, or .xls, file.",
        variant: "destructive"
      });
      return false;
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      toast({
        title: "No Sheets in File",
        description: "Please upload a valid spreadsheet with at least one sheet.",
        variant: "destructive"
      });
      return false;
    }

    // Read header row
    const headerRowRaw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" })[0] || [];
    const headerRow: any[] = Array.isArray(headerRowRaw) ? headerRowRaw : [];
    if (!headerRow.length) {
      toast({
        title: "Junk/Empty File",
        description: "The uploaded file does not contain any headers or data.",
        variant: "destructive"
      });
      return false;
    }

    // NEW: Reject if total column count exceeds 101
    const totalCols = headerRow.length;
    if (totalCols > 101) {
      toast({
        title: "Too Many Columns",
        description: `The uploaded file has ${totalCols} columns. Maximum allowed is 101.`,
        variant: "destructive"
      });
      return false;
    }

    // Require at least two headers with a letter or digit
    const numRealHeaders = headerRow.filter(
      h => typeof h === "string" && /[A-Za-z0-9]/.test(h)
    ).length;
    if (numRealHeaders < 2) {
      toast({
        title: "Junk/Unreadable File",
        description: "The uploaded file does not contain readable column headers. Please check your file.",
        variant: "destructive"
      });
      return false;
    }

    // Read A1 and B1 explicitly to ensure first and second Excel columns are used
    const cellA1 = worksheet['A1'] ? worksheet['A1'].v : "";
    const cellB1 = worksheet['B1'] ? worksheet['B1'].v : "";

    const isEmpty = (v: any) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
    if (isEmpty(cellA1)) {
      toast({
        title: "Error in file format",
        description: 'The file must include exactly two columns: sl.no and questions. Please check your file format.',
        variant: "destructive"
      });
      return false;
    }
    if (isEmpty(cellB1)) {
      toast({
        title: "Missing Second Column Header",
        description: 'The second column header (cell B1) is missing or empty. The second column must be "Question".',
        variant: "destructive"
      });
      return false;
    }

    // ENFORCE ORDER & VALUE: first column must be SLNo and second must be Question
    const normalize = (v: any) => {
      if (v === null || v === undefined) return "";
      let s = String(v);
      try {
        s = s.normalize("NFKC");
      } catch { }
      return s.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    };
    const firstHeader = normalize(cellA1);
    const secondHeader = normalize(cellB1);

    if (firstHeader !== "slno") {
      toast({
        title: "Incorrect First Column",
        description: 'The first column header (cell A1) must be "SL No" (case-insensitive). Please fix cell A1.',
        variant: "destructive"
      });
      return false;
    }

    if (secondHeader !== "question") {
      toast({
        title: "Incorrect Second Column",
        description: 'The second column header (cell B1) must be "Question" (case-insensitive). Please fix cell B1.',
        variant: "destructive"
      });
      return false;
    }

    const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
    const slnoCol = headerRow[0];
    const questionCol = headerRow[1];

    let hasValidRow = false;
    for (let rowIdx = 0; rowIdx < json.length; rowIdx++) {
      const row = json[rowIdx];
      const rowNum = rowIdx + 2;
      const sl = String(row[slnoCol] ?? "").trim();
      const q = String(row[questionCol] ?? "").trim();

      if (!sl || !q) {
        toast({
          title: "Blank Value Detected",
          description: `Row ${rowNum}: SLNo and Question must not be blank.`,
          variant: "destructive"
        });
        return false;
      }

      if (!/^[0-9]+$/.test(sl)) {
        toast({
          title: "Invalid SLNo",
          description: `Row ${rowNum}: SLNo "${sl}" must contain digits only.`,
          variant: "destructive"
        });
        return false;
      }

      if (!/[A-Za-z0-9]/.test(q)) {
        toast({
          title: "Unreadable/Junk Question",
          description: `Row ${rowNum}: Question contains only unreadable symbols. Please write a meaningful question.`,
          variant: "destructive"
        });
        return false;
      }

      hasValidRow = true;
    }

    if (!hasValidRow) {
      toast({
        title: "No Valid Data",
        description: "The file must have at least one row of data below the header. Please add your data and try again.",
        variant: "destructive"
      });
      return false;
    }
    return true;
  } catch (e) {
    toast({
      title: "Junk or Corrupted File",
      description: "The uploaded file could not be read. Please upload a valid .xlsx, or .xls file.",
      variant: "destructive"
    });
    return false;
  }
};

// --- NEW: Utility to extract only first 250 questions (plus header) ---
const extractFirst250Rows = async (file: File) => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Get all rows as [header, ...rows]
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  // Get first 250 data rows (so: header + 250)
  const limitedRows = rows.slice(0, 251); // 0: header, 1..250: rows

  // Build worksheet and workbook
  const newWorksheet = XLSX.utils.aoa_to_sheet(limitedRows as any);
  const newWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);

  // Write to buffer/file
  const outData = XLSX.write(newWorkbook, {
    bookType: file.name.endsWith('.xls') ? "xls" : "xlsx",
    type: "array"
  });
  return new File([outData], file.name, { type: file.type });
};

const ItemMetadata = () => {
  const [remainingToken, setRemainingToken] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [customMetadata1, setCustomMetadata1] = useState("");
  const [customMetadata2, setCustomMetadata2] = useState("");
  const [customMetadata3, setCustomMetadata3] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultsData, setResultsData] = useState<any[]>([]);
  const [fileRowCount, setFileRowCount] = useState<number>(0); // NEW: for showing warning

  useEffect(() => {
    fetchTokens().then(setRemainingToken);
  }, []);

  // For select options
  const getAvailableOptions = (excludeValues: string[]) => {
    return metadataOptions.filter(option =>
      option === "Select metadata" || !excludeValues.includes(option)
    );
  };
  const customMetadata1Options = getAvailableOptions([customMetadata2, customMetadata3]);
  const customMetadata2Options = getAvailableOptions([customMetadata1, customMetadata3]);
  const customMetadata3Options = getAvailableOptions([customMetadata1, customMetadata2]);

  const noMetadataSelected = (
    (!customMetadata1 || customMetadata1 === "Select metadata") &&
    (!customMetadata2 || customMetadata2 === "Select metadata") &&
    (!customMetadata3 || customMetadata3 === "Select metadata")
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const isValid = await validateSpreadsheetFile(file);
      if (isValid) {
        // Count actual questions for warning
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        setFileRowCount(rows.length - 1);
        if (rows.length - 1 > 250) {
          toast({
            title: "Only First 250 Questions Will Be Processed",
            description: `You uploaded ${rows.length - 1} questions. Only the first 250 will be analyzed.`,
            variant: "default"
          });
        } else {
          toast({
            title: "File uploaded successfully",
            description: `${file.name} has been uploaded and validated.`
          });
        }
        setUploadedFile(file);
        setShowResults(false);
        setResultsData([]);
      } else {
        setUploadedFile(null);
        setShowResults(false);
        setResultsData([]);
        setFileRowCount(0);
        const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
      }
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      const isValid = await validateSpreadsheetFile(file);
      if (isValid) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        setFileRowCount(rows.length - 1);
        if (rows.length - 1 > 250) {
          toast({
            title: "Only First 250 Questions Will Be Processed",
            description: `You uploaded ${rows.length - 1} questions. Only the first 250 will be analyzed.`,
            variant: "default"
          });
        } else {
          toast({
            title: "File uploaded successfully",
            description: `${file.name} has been uploaded and validated.`
          });
        }
        setUploadedFile(file);
        setShowResults(false);
        setResultsData([]);
      } else {
        setUploadedFile(null);
        setShowResults(false);
        setResultsData([]);
        setFileRowCount(0);
        const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
      }
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setShowResults(false);
    setResultsData([]);
    setFileRowCount(0);
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    toast({
      title: "File Removed",
      description: "File has been removed successfully"
    });
  };

  // ===== MAIN CHANGE: ONLY FIRST 250 ROWS WILL BE SENT =====
  const handleFilterAndGenerate = async () => {
    if (!uploadedFile) {
      toast({
        title: "No file uploaded",
        description: "Please upload a completed template file first.",
        variant: "destructive"
      });
      return;
    }
    if (
      (!customMetadata1 || customMetadata1 === "Select metadata") &&
      (!customMetadata2 || customMetadata2 === "Select metadata") &&
      (!customMetadata3 || customMetadata3 === "Select metadata")
    ) {
      toast({
        title: "Missing metadata selection",
        description: "Please select at least one metadata type.",
        variant: "destructive"
      });
      return;
    }
    setIsProcessing(true);
    setShowResults(false);

    try {
      const fileForApi = await extractFirst250Rows(uploadedFile);
      const data = await uploadMetadataFile({
        file: fileForApi,
        custom_metadata1: customMetadata1,
        custom_metadata2: customMetadata2,
        custom_metadata3: customMetadata3,
      }) as { updated_df?: string };

      let analysisResults: any[] = [];
      if (data.updated_df) {
        analysisResults = JSON.parse(data.updated_df);
      }
      setResultsData(analysisResults);

      setIsProcessing(false);
      setShowResults(true);
      setRemainingToken(prev => (typeof prev === "number" ? prev - 328 : prev));
      toast({
        title: "Analysis complete",
        description: "Metadata has been generated successfully."
      });
    } catch (error: any) {
      setIsProcessing(false);
      let msg = "Failed to analyze metadata. Please try again.";
      if (error?.response?.data?.message) msg = error.response.data.message;
      toast({
        title: "Error",
        description: msg,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-lg">IM</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Item Metadata</h1>
              <p className="text-sm text-gray-500">AI-Powered Metadata Extraction</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
              <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                <Sparkles className="w-2 h-2 text-white" />
              </div>
              <span className="text-sm text-blue-700 font-medium">
                {remainingToken !== null ? `Remaining Tokens: ${remainingToken.toLocaleString()} ` : "Loading…"}
              </span>
            </div>
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-gray-600">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Step 1: Download Template */}
          <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-blue-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-blue-800">
                <div className="p-2 bg-blue-600 text-white rounded-lg">
                  <Download className="h-5 w-5" />
                </div>
                Step 1: Download Standard Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-blue-700 mb-4">
                Download our standard template to ensure your data is formatted correctly for optimal metadata generation.
              </p>
              <Button
                onClick={handleDownloadTemplate}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template (.XLSX)
              </Button>
            </CardContent>
          </Card>

          {/* Step 2: Upload File */}
          <Card className="border-2 border-green-100 bg-gradient-to-br from-green-50 to-green-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-green-800">
                <div className="p-2 bg-green-600 text-white rounded-lg">
                  <Upload className="h-5 w-5" />
                </div>
                Step 2: Upload Your Completed File
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-700 mb-4">
                Upload your completed template with item details. Supports .XLSX or .XLS files. <br />

              </p>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 ${isDragOver
                  ? 'border-green-400 bg-green-50'
                  : uploadedFile
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-300 hover:border-green-400'
                  }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {uploadedFile ? (
                  <div className="space-y-4">
                    <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
                    <div>
                      <p className="text-lg font-semibold text-green-800">{uploadedFile.name}</p>
                      <p className="text-sm text-green-600">File uploaded successfully</p>
                      {fileRowCount > 250 && (
                        <div className="text-sm text-red-400 font-semibold">
                          Only the first 250 questions will be processed by the system.
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 justify-center">
                      <Button
                        onClick={() => {
                          setUploadedFile(null)
                          setCustomMetadata1("");
                          setCustomMetadata2("");
                          setCustomMetadata3("");
                          setShowResults(false);
                          setResultsData([]);
                          setFileRowCount(0);
                          const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
                          if (fileInput) fileInput.value = '';
                          toast({
                            title: "File Removed",
                            description: "File has been removed successfully"
                          });
                        }}
                        className="bg-red-600 text-white hover:bg-red-700 border border-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2 text-white" />
                        <span>Remove File</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                    <div>
                      <p className="text-lg font-medium text-gray-700">
                        Drag and drop your file here, or click to browse
                      </p>
                      <p className="text-sm text-gray-500">
                        Supports .XLSX or .XLS file.
                      </p>
                      <p className="text-xs text-red-500 font-medium">
                        Only the first 250 questions will be processed by the system.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="file-upload" className="sr-only">Upload file</Label>
                      <input
                        id="file-upload"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <div className="flex justify-center">
                        <label htmlFor="file-upload">
                          <Button asChild>
                            <span>Select file</span>
                          </Button>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Configure Metadata */}
          {uploadedFile && (
            <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-purple-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-purple-800">
                  <div className="p-2 bg-purple-600 text-white rounded-lg">
                    <Settings className="h-5 w-5" />
                  </div>
                  Step 3: Configure Metadata Generation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="custom-metadata-1" className="text-sm font-medium text-purple-800">
                      Custom Metadata 1
                    </Label>
                    <Select value={customMetadata1} onValueChange={setCustomMetadata1}>
                      <SelectTrigger className="bg-white border-purple-200">
                        <SelectValue placeholder="Select metadata" />
                      </SelectTrigger>
                      <SelectContent>
                        {customMetadata1Options.map((option) => (
                          <SelectItem key={option} value={option} >
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="custom-metadata-2" className="text-sm font-medium text-purple-800">
                      Custom Metadata 2
                    </Label>
                    <Select value={customMetadata2} onValueChange={setCustomMetadata2}>
                      <SelectTrigger className="bg-white border-purple-200">
                        <SelectValue placeholder="Select metadata" />
                      </SelectTrigger>
                      <SelectContent>
                        {customMetadata2Options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="custom-metadata-3" className="text-sm font-medium text-purple-800">
                      Custom Metadata 3
                    </Label>
                    <Select value={customMetadata3} onValueChange={setCustomMetadata3}>
                      <SelectTrigger className="bg-white border-purple-200">
                        <SelectValue placeholder="Select metadata" />
                      </SelectTrigger>
                      <SelectContent>
                        {customMetadata3Options.map((option) => (
                          <SelectItem key={option} value={option} >
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {isProcessing ? (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="animate-spin">
                          <Sparkles className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-blue-800">Processing your items...</p>
                          <p className="text-sm text-blue-600">AI is analyzing and generating metadata</p>
                          <Progress value={60} className="w-full mt-2" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      onClick={handleFilterAndGenerate}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2"
                      disabled={
                        (!customMetadata1 || customMetadata1 === "Select metadata") &&
                        (!customMetadata2 || customMetadata2 === "Select metadata") &&
                        (!customMetadata3 || customMetadata3 === "Select metadata")
                      }
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Generate Metadata Analysis
                    </Button>
                    <Button
                      onClick={() => {
                        setUploadedFile(null);
                        setCustomMetadata1("");
                        setCustomMetadata2("");
                        setCustomMetadata3("");
                        setShowResults(false);
                        setResultsData([]);
                        setFileRowCount(0);
                        const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
                        if (fileInput) fileInput.value = '';
                        toast({
                          title: "Cleared",
                          description: "All fields have been cleared. Please upload a new file and choose metadata if needed."
                        });
                      }}
                      size="sm"
                      variant="outline"
                      className="text-gray-700 border-gray-200 hover:bg-black px-4 py-2"
                    >
                      Clear
                    </Button>
                  </div>
                )}
                {noMetadataSelected ? (
                  <div className="text-sm text-red-600">
                    Please select at least one custom metadata option from the dropdown to proceed with metadata generation.
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {showResults && resultsData.length > 0 && (
            <Card className="border-2 border-orange-100 bg-gradient-to-br from-orange-50 to-orange-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-orange-800">
                  <div className="p-2 bg-orange-600 text-white rounded-lg">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  Generated Metadata Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-white rounded-lg border border-orange-200">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-orange-100">
                        {Object.keys(resultsData[0]).map(key => (
                          <TableHead key={key} className="font-semibold">{key}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resultsData.map((item: any, idx: number) => (
                        <TableRow key={item["SL.No"] ?? idx} className="hover:bg-orange-50">
                          {Object.keys(resultsData[0]).map(key => (
                            <TableCell key={key} className="max-w-md text-sm">
                              <Badge variant="secondary" className={
                                key === "Topic" ? "bg-blue-100 text-blue-800"
                                  : key === "Learning Objective" ? "bg-green-100 text-green-800"
                                    : key === "Bloom's Taxonomy Level" ? "bg-purple-100 text-purple-800"
                                      : ""
                              }>
                                {item[key] ?? ""}
                              </Badge>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default ItemMetadata;