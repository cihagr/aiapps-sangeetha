import { useState, useEffect } from "react";
import { ArrowLeft, Upload, Download, FileText, RefreshCw, Trash2, Sparkles, Clock, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface QuestionData {
  questionNo: string;
  passage: string;
  questions: string; // Changed to match API response
}

interface RewrittenQuestion {
  original: string;
  rewritten: string;
  passage: string;
  questionNo: string;
}

interface TokenData {
  utilizedtoken: number;
  totaltoken: number;
  remainingtoken: number;
}

interface AuthData {
  customerCode: string;
  orgCode: string;
  userCode: string;
  token: string | null;
  isAuthenticated: boolean;
}

const ItemRewriter = () => {
  const { toast } = useToast();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedData, setUploadedData] = useState<QuestionData[]>([]);
  const [rewrittenQuestions, setRewrittenQuestions] = useState<RewrittenQuestion[]>([]);
  const [selectedFormat, setSelectedFormat] = useState("Multiple Choice Question");
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [isRewriting, setIsRewriting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authData, setAuthData] = useState<AuthData>({
    customerCode: "",
    orgCode: "",
    userCode: "",
    token: null,
    isAuthenticated: false
  });

  const checkExistingSession = () => {
    const savedAuth = localStorage.getItem('authData');
    if (savedAuth) {
      try {
        const authState = JSON.parse(savedAuth);
        if (authState.token) {
          setAuthData({
            ...authState,
            isAuthenticated: true
          });
          loadTokenData(authState);
          return;
        }
      } catch (e) {
        console.error('Error parsing auth data:', e);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    checkExistingSession();
  }, []);

 // After successful login
 const handleLogin = async (username: string, password: string) => {
  try {
    const response = await fetch('/AICommonService/api/GetCustomerInfo', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      credentials: 'include'
    });

    //console.log('Login response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`Login failed with status: ${response.status}`);
    }

    const data = await response.json();
    //console.log('Login response data:', data);
    
    if (data.status === 'S001' && data.data && data.data.length > 0) {
      const userData = data.data[0];
      const authState = {
        customerCode: userData.customerCode || '',
        orgCode: userData.orgCode || '',
        userCode: userData.userCode || '',
        token: data.token || generateTempToken(),
        isAuthenticated: true
      };
      
      //console.log('Setting auth state:', authState);
      setAuthData(authState);
      localStorage.setItem('authData', JSON.stringify(authState));
      
      toast({
        title: "Login Successful",
        description: "You have been successfully logged in.",
        variant: "default",
      });
      return true;
    } else {
      throw new Error(data.message || 'Invalid credentials or missing user data');
    }
  } catch (error) {
    console.error('Login error:', error);
    toast({
      title: "Login Failed",
      description: error.message || "Failed to login. Please try again.",
      variant: "destructive",
    });
    return false;
  }
};

  const generateTempToken = () => {
    return 'temp_' + Math.random().toString(36).substr(2, 9);
  };

  const loadTokenData = async (auth: AuthData) => {
    if (!auth.token) return;
    
    try {
      setIsLoading(true);
      //console.log('Loading token data...');
      const endpoint = `/AICommonService/api/ValidateToken?token=${encodeURIComponent(auth.token)}&custcode=${auth.customerCode}&orgcode=${auth.orgCode}&usercode=${auth.userCode}&appcode=IR`;
      //console.log('Token API URL:', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Authorization': `Bearer ${auth.token}`
        },
        credentials: 'include'
      });
      
      //console.log('Token API response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      //console.log('Token API response data:', data);
      
      if (data && data.statusCode === 'F001') {
        //console.log('API returned status code F001, using default tokens');
        const defaultTokenData = {
          utilizedtoken: 0,
          totaltoken: 10,
          remainingtoken: 10
        };
        setTokenData(defaultTokenData);
        return defaultTokenData;
      } else if (data && Array.isArray(data) && data.length > 0) {
        const tokenInfo = data[0];
        const tokenData = {
          utilizedtoken: parseInt(tokenInfo.utilizedtoken) || 0,
          totaltoken: parseInt(tokenInfo.totaltoken) || 0,
          remainingtoken: parseInt(tokenInfo.remainingtoken) || 0
        };
        //console.log('Parsed token data:', tokenData);
        setTokenData(tokenData);
        return tokenData;
      } else {
        throw new Error('Unexpected response format from server');
      }
    } catch (error) {
      console.error('Error loading token data:', error);
      
      // Set default token data if API fails (for development)
      const defaultTokenData = {
        utilizedtoken: 0,
        totaltoken: 10,
        remainingtoken: 10
      };
      
      //console.log('Using default token data for development:', defaultTokenData);
      setTokenData(defaultTokenData);
      
      toast({
        title: "Development Mode",
        description: "Using development token data. In production, this would show an error.",
        variant: "default",
        duration: 3000
      });
      
      return defaultTokenData;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authData');
    setAuthData({
      customerCode: "",
      orgCode: "",
      userCode: "",
      token: null,
      isAuthenticated: false
    });
    setTokenData(null);
  };

  if (!authData.isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Login to Item Rewriter</h2>
          <form onSubmit={(e) => {
  e.preventDefault();
  const formData = new FormData(e.target as HTMLFormElement);
  handleLogin(
    formData.get('username') as string,
    formData.get('password') as string
  );
}}>
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  defaultValue="adminshiva"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  defaultValue="School"
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {isLoading ? 'Logging in...' : 'Sign in'}
                </button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  const API_BASE_URL = import.meta.env.VITE_API_URL;

  const stats = [
    {
      icon: <Sparkles className="w-5 h-5" />,
      title: "Token Usage",
      total: tokenData ? tokenData.remainingtoken.toString() : "Loading...",
      subtitle: "Available Tokens",
      bgColor: "bg-gradient-to-br from-blue-50 to-blue-100",
      iconBg: "bg-blue-600",
      textColor: "text-blue-600",
      borderColor: "border-blue-200"
    },
    {
      icon: <FileText className="w-5 h-5" />,
      title: "Questions Processed",
      total: rewrittenQuestions.length.toString(),
      subtitle: "Total Rewritten",
      bgColor: "bg-gradient-to-br from-green-50 to-green-100",
      iconBg: "bg-green-600",
      textColor: "text-green-600",
      borderColor: "border-green-200"
    },
    {
      icon: <BarChart3 className="w-5 h-5" />,
      title: "Success Rate",
      total: "98.5%",
      subtitle: "Quality Score",
      bgColor: "bg-gradient-to-br from-purple-50 to-purple-100",
      iconBg: "bg-purple-600",
      textColor: "text-purple-600",
      borderColor: "border-purple-200"
    }
  ];

  const validateFile = (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: "Invalid File Format",
        description: "Please upload only .xlsx files",
        variant: "destructive",
      });
      return false;
    }
    
    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB",
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setUploadedData([]);
    setRewrittenQuestions([]);
    // Reset the file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    toast({
      title: "File Removed",
      description: "File has been removed successfully",
    });
  };

  const processFile = async (file: File) => {
    if (!validateFile(file)) return;
    
    setIsUploading(true);
    setUploadedFile(file);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Get the token from the URL or your auth context
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token') || 'gAAAAABop_3CYCDpcMbyNWIlpKy83Dwo_o5k03hrMYhg3D5cJTet5S9MKObEeFPTihDjccxhKvEKmoaQuYqDVD39fSWBdJCynFMtykSMAp-U9ZSe6m5Iyw_JQACtESCQUnuKKO1NH6m2Hd4oIgY07w4oi2rD2bmqmtluUDePlTYi2DdWkGy9cJbrEPIuNeEmqE4kTwzYSCjbbjuC960E6ZFikERGRF27TQSPRbosnDStRSVMPo1ZPCvqblDAt35mhh9UjSV635qqVv2STvIp5rVw8OwpylvexWWsgu1TIXUzjcgwl8ciUcI%3D'; // Fallback token
      
      // Use relative URL to leverage the proxy
      const endpoint = `/aiapps/item-rewrite/GPT/Import?isSSO=1&token=${encodeURIComponent(token)}`;
      //console.log('Uploading to endpoint:', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include' // Important for cookies if using session-based auth
      });

      //console.log('Upload response status:', response.status);
      const responseText = await response.text();
      //console.log('Response text:', responseText);

      if (response.ok) {
        const html = responseText;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Look for table data in the response
        const tableRows = doc.querySelectorAll('table tbody tr');
        const extractedData: QuestionData[] = [];
        
        tableRows.forEach((row, index) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            extractedData.push({
              questionNo: `Q${index + 1}`,
              passage: cells[1]?.textContent?.trim() || '',
              questions: cells[2]?.textContent?.trim() || ''
            });
          }
        });

        if (extractedData.length === 0) {
          throw new Error('No valid data found in the response');
        }
        
        setUploadedData(extractedData);
        
        // Refresh token data after successful file upload
        await loadTokenData(authData);
        
        toast({
          title: "File Uploaded Successfully",
          description: `Loaded ${extractedData.length} questions`,
        });
      } else {
        throw new Error(`Upload failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error in processFile:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "There was an error uploading your file. Please try again.",
        variant: "destructive",
      });
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    //console.log('=== FILE UPLOAD DEBUGGING ===');
    //console.log('File info:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });

    // Check if file is an Excel file
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);
    
    try {
      const xlsx = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      //console.log('File size in bytes:', arrayBuffer.byteLength);
      
      // Parse the Excel file
      const workbook = xlsx.read(arrayBuffer, { type: 'array' });
      //console.log('Workbook SheetNames:', workbook.SheetNames);
      
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Get all data including empty cells
      const jsonData = xlsx.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: null });
      //console.log('Raw Excel data (first 5 rows):', JSON.stringify(jsonData.slice(0, 5), null, 2));
      
      // Log column headers
      if (jsonData.length > 0) {
        //console.log('Available columns:', Object.keys(jsonData[0]));
      }
      
      if (jsonData.length === 0) {
        console.error('Excel file is empty or has no data');
        toast({
          title: "Empty File",
          description: "The Excel file appears to be empty or doesn't contain any data.",
          variant: "destructive",
        });
        return;
      }
      
      // Map the Excel data to QuestionData format with case-insensitive column matching
      const questions: QuestionData[] = [];
      const columnMap: Record<string, string> = {};
      
      // Find column mappings (case-insensitive)
      const firstRow = jsonData[0];
      Object.keys(firstRow).forEach(key => {
        const lowerKey = key.toLowerCase().trim();
        if (lowerKey.includes('question') && !lowerKey.includes('no')) {
          columnMap['questions'] = key;
        } else if (lowerKey.includes('passage')) {
          columnMap['passage'] = key;
        } else if (lowerKey.includes('question no') || lowerKey.includes('question_no')) {
          columnMap['questionNo'] = key;
        }
      });
      
      //console.log('Detected column mappings:', columnMap);
      
      // Process each row
      jsonData.forEach((row, index) => {
        // Skip empty rows
        if (!row[columnMap['questions']] && !row[columnMap['passage']]) return;
        
        questions.push({
          questionNo: columnMap['questionNo'] ? String(row[columnMap['questionNo']] || (index + 1)) : String(index + 1),
          passage: String(row[columnMap['passage']] || '').trim(),
          questions: String(row[columnMap['questions']] || '').trim()
        });
      });
      
      //console.log('Processed questions:', questions);
      
      if (questions.length === 0) {
        console.error('No valid questions found in the file');
        toast({
          title: "No Valid Data",
          description: "The file doesn't contain any valid questions or passages. Please check the file format.",
          variant: "destructive",
        });
        return;
      }
      
      setUploadedData(questions);
      
      toast({
        title: "File Ready",
        description: `Successfully loaded ${questions.length} questions. Click 'Rewrite Questions' to process.`,
        variant: "default",
      });
      
    } catch (error) {
      console.error('Error processing file:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Cannot find module')) {
          console.warn('xlsx package not found. Proceeding without validation.');
          setUploadedData([]);
          toast({
            title: "File Uploaded",
            description: "File validation skipped. Click 'Rewrite Questions' to process.",
            variant: "default",
          });
          return;
        }
      }
      
      toast({
        title: "Error Processing File",
        description: "An error occurred while processing the file. Please check the console for details.",
        variant: "destructive",
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const xlsxFile = files.find(file => 
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    );
    
    if (xlsxFile) {
      processFile(xlsxFile);
    } else {
      toast({
        title: "Invalid File Type",
        description: "Please drop only .xlsx files",
        variant: "destructive",
      });
    }
  };

  const handleRewriteQuestions = async () => {
    if (!uploadedFile) {
      toast({ title: "No File", description: "Please upload a file first.", variant: "destructive" });
      return;
    }
  
    try {
      setIsRewriting(true);
      
      // Get the token from the URL first, then fallback to authData
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token') || authData.token;
      
      // Debug token
      //console.log('Using token:', token);
      if (!token || token.startsWith('temp_')) {
        throw new Error('Please log in again. Invalid or temporary token detected.');
      }
  
      const formData = new FormData();
      formData.append('file', uploadedFile, uploadedFile.name);
      
      // Use the token from URL or auth data
      const endpoint = `/aiapps/item-rewrite/GPT/GenerateMCQ?isSSO=1&token=${encodeURIComponent(token)}`;
      //console.log('Sending request to:', endpoint);
    
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
  
      //console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error:', errorText);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
  
      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rewritten_questions_${new Date().getTime()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
  
    } catch (error) {
      console.error('Error in handleRewriteQuestions:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate MCQs",
        variant: "destructive",
      });
    } finally {
      setIsRewriting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/GPT/DownloadTemplate`, {
        method: 'GET'
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'TestDataforensic_method_template.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "Template Downloaded",
          description: "Sample template has been downloaded successfully",
        });
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('Error downloading template:', error);
      toast({
        title: "Download Failed",
        description: "Could not download the template. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleClear = () => {
    setRewrittenQuestions([]);
    toast({
      title: "Cleared",
      description: "Rewritten questions have been cleared",
    });
  };

  const handleDownload = () => {
    if (rewrittenQuestions.length === 0) {
      toast({
        title: "No Data to Download",
        description: "Please generate some questions first",
        variant: "destructive",
      });
      return;
    }

    // Create CSV content
    const csvContent = [
      ['Question No', 'Original Question', 'Rewritten Question', 'Passage'].join(','),
      ...rewrittenQuestions.map(q => [
        `"${q.questionNo}"`,
        `"${q.original.replace(/"/g, '""')}"`,
        `"${q.rewritten.replace(/"/g, '""')}"`,
        `"${q.passage.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rewritten-questions-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast({
      title: "Download Started",
      description: "Your rewritten questions are being downloaded",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
      {/* Enhanced Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg hover-scale">
                <span className="text-white font-bold text-sm">AL</span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-gray-900">Item Rewriter</span>
                <span className="text-xs text-gray-500">AI-Powered Question Transformation</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
              <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                <Sparkles className="w-2 h-2 text-white" />
              </div>
              <span className="text-sm text-blue-700 font-medium">
                {tokenData ? `${tokenData.remainingtoken} Tokens` : 'Loading...'}
              </span>
            </div>
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-gray-600 hover-primary">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Enhanced Page Title */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            <RefreshCw className="w-4 h-4" />
            Transform Your Questions
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
            Intelligent Question Rewriter
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your questions and transform them into different formats with AI-powered precision
          </p>
        </div>

        {/* Enhanced Upload Section */}
        <Card className="border-2 border-gray-200">
          <div className="p-8">
            <div className="text-center space-y-6">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 border border-blue-200">
                <Clock className="w-3 h-3 mr-1" />
                Remaining Tokens: {tokenData ? tokenData.remainingtoken : 'Loading...'}
              </Badge>
              
              <div className="flex flex-col sm:flex-row items-center justify-between text-sm text-gray-500 gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Format: .xlsx only</Badge>
                  <Badge variant="outline" className="text-xs">Max Size: 10MB</Badge>
                </div>
                
                <Button 
                  variant="outline" 
                  className="border-2 border-blue-400 text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-500 hover:text-blue-800 transition-all duration-200"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
              </div>
              
              {!uploadedFile ? (
                <div 
                  className={`border-2 border-dashed rounded-xl p-16 transition-all duration-300 cursor-pointer ${
                    isDragOver 
                      ? 'border-blue-500 bg-blue-50/50' 
                      : 'border-gray-300 hover:border-blue-400 bg-gray-50/30'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !isUploading && document.getElementById('file-upload')?.click()}
                >
                  <div className="text-center space-y-6">
                    <div className={`w-16 h-16 rounded-lg flex items-center justify-center mx-auto transition-all duration-300 ${
                      isUploading
                        ? 'bg-blue-600'
                        : isDragOver 
                        ? 'bg-blue-600' 
                        : 'bg-gray-100 border-2 border-gray-300'
                    }`}>
                      {isUploading ? (
                        <RefreshCw className="w-8 h-8 text-white animate-spin" />
                      ) : (
                        <Upload className={`w-8 h-8 transition-all duration-300 ${
                          isDragOver ? 'text-white' : 'text-gray-500'
                        }`} />
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {isUploading ? 'Uploading file...' : 'Drop your Excel file here'}
                      </h3>
                      <p className="text-gray-500">
                        {isUploading ? 'Please wait while we process your file' : 'or click to browse for files'}
                      </p>
                      <p className="text-sm text-gray-400">
                        Supported formats: XLSX, XLS (Max 10MB)
                      </p>
                    </div>
                    
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                      disabled={isUploading}
                    />
                    
                    {!isUploading && (
                      <Button 
                        variant="outline" 
                        className="border-2 border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 hover:border-blue-500 hover:text-blue-800 transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          document.getElementById('file-upload')?.click();
                        }}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Browse Files
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-2 border-green-200 rounded-xl p-12 bg-green-50/30">
                  <div className="text-center space-y-6">
                    <div className="w-16 h-16 rounded-lg bg-green-100 border-2 border-green-300 flex items-center justify-center mx-auto">
                      <FileText className="w-8 h-8 text-green-600" />
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {uploadedFile.name}
                      </h3>
                      <p className="text-green-600 font-medium">
                        File uploaded successfully! ({uploadedData.length} questions loaded)
                      </p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button 
                        variant="outline" 
                        className="border-2 border-red-400 text-red-600 bg-white hover:bg-red-50 hover:border-red-500 transition-all duration-200"
                        onClick={handleRemoveFile}
                      >
                        Remove File
                      </Button>
                      
                      <Button 
                        onClick={handleRewriteQuestions}
                        disabled={isRewriting || uploadedData.length === 0}
                        className={`bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white transition-all duration-200 ${
                          isRewriting ? 'opacity-70 cursor-not-allowed' : ''
                        }`}
                      >
                        {isRewriting ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Rewriting...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Rewrite Questions
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Enhanced Uploaded Data Section */}
        {uploadedData.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 animate-fade-in">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Uploaded Data</h2>
                    <p className="text-gray-600 mt-1">Review your uploaded questions before processing</p>
                  </div>
                </div>
                <Badge className="bg-green-50 text-green-700 border border-green-200 px-4 py-2 text-sm font-medium">
                  {uploadedData.length} Questions Loaded
                </Badge>
              </div>
              
              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-gray-100 to-gray-50 border-b border-gray-200">
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide">Question No</th>
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide">Passage</th>
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide">Question(s)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {uploadedData.map((item, index) => (
                        <tr key={index} className="hover:bg-green-50/50 transition-colors duration-200">
                          <td className="px-8 py-6 font-semibold text-green-600 text-lg">{item.questionNo}</td>
                          <td className="px-8 py-6 text-gray-700 leading-relaxed max-w-md">{item.passage}</td>
                          <td className="px-8 py-6 text-gray-700 leading-relaxed max-w-md font-medium">{item.questions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mt-8 p-6 bg-gradient-to-r from-blue-50 via-purple-50 to-blue-50 rounded-xl border border-blue-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-1">
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Question Format</label>
                    <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                      <SelectTrigger className="w-64 h-12 border border-gray-300 hover:border-blue-400 focus:border-blue-500 transition-colors bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-gray-200 z-50">
                        <SelectItem value="Multiple Choice Question">Multiple Choice Question</SelectItem>
                        <SelectItem value="Multiple Response Question">Multiple Response Question</SelectItem>
                        <SelectItem value="True/False">True/False</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Language</label>
                    <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                      <SelectTrigger className="w-40 h-12 border border-gray-300 hover:border-blue-400 focus:border-blue-500 transition-colors bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-gray-200 z-50">
                        <SelectItem value="English">English</SelectItem>
                        <SelectItem value="Spanish">Spanish</SelectItem>
                        <SelectItem value="French">French</SelectItem>
                        <SelectItem value="German">German</SelectItem>
                        <SelectItem value="Hindi">Hindi</SelectItem>
                        <SelectItem value="Bangla">Bangla</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Button 
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-10 py-4 h-12 text-base font-semibold rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleRewriteQuestions}
                  disabled={isRewriting || !tokenData || tokenData.remainingtoken <= 0}
                >
                  {isRewriting ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
                      Rewriting Questions...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-3" />
                      Rewrite Questions
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Rewritten Questions Section */}
        {rewrittenQuestions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 animate-fade-in">
            <div className="p-8">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Rewritten Questions</h2>
                    <p className="text-gray-600 mt-1">AI-generated {selectedFormat.toLowerCase()}s ready for download</p>
                  </div>
                  <Badge className="bg-purple-50 text-purple-700 border border-purple-200 px-4 py-2 text-sm font-medium">
                    {rewrittenQuestions.length} Questions Completed
                  </Badge>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button 
                    variant="outline" 
                    onClick={handleClear} 
                    className="border border-red-300 text-red-600 bg-white hover:bg-red-50 hover:border-red-400 transition-all duration-200 px-6 py-2"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                  <Button 
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-2 transition-all duration-200 hover:scale-105" 
                    onClick={handleDownload}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Results
                  </Button>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-purple-100 via-blue-50 to-purple-100 border-b border-gray-200">
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide w-1/3">Original Question</th>
                        <th className="px-8 py-5 text-left font-semibold text-gray-900 text-sm uppercase tracking-wide w-2/3">Rewritten Question</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {rewrittenQuestions.map((item, index) => (
                        <tr key={index} className="hover:bg-purple-50/30 transition-colors duration-200">
                          <td className="px-8 py-6 text-gray-700 leading-relaxed align-top font-medium">{item.original}</td>
                          <td className="px-8 py-6 space-y-4 align-top">
                            <div className="font-semibold text-gray-900 text-lg leading-relaxed">{item.rewritten}</div>
                            <div className="text-sm text-gray-500">
                              <span className="font-medium">Question No:</span> {item.questionNo}
                            </div>
                            {item.passage && (
                              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Related Passage</div>
                                <div className="text-sm text-gray-700 leading-relaxed">{item.passage.substring(0, 200)}...</div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Footer */}
        <div className="text-center py-8">
          <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center border-2 border-blue-200">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="font-medium">Powered by Advanced AI Technology</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemRewriter;