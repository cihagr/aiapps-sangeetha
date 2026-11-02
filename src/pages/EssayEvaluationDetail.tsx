import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useParams, Link } from "react-router-dom"
import { Save, FileSpreadsheet, Trash, ChevronDown, ChevronUp, ArrowLeft, PenTool, Loader2, Download, Eye, ArrowUp, Sparkles, Brain, Search } from "lucide-react"
import * as XLSX from 'xlsx'
import essayEvaluationImage from "@/assets/essay-evaluation-hero.jpg"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // or wherever your tooltip is
import Bodily from "@/assets/Bodily.png"
import Essentials from "@/assets/Essentials.png"
import { PageLoader } from "@/components/ui/loader"
import { ESSAY_EVAL_API_URL } from "@/config"

const appcode = "EEV"

// Read codes from sessionStorage — prefer the login API response stored under `user`.
// Fall back to other keys (`userInfo`, individual keys) if `user` is not present.

const _essayIdStr = sessionStorage.getItem('essayId');
const _storedUserStr = sessionStorage.getItem('user') || sessionStorage.getItem('userInfo') || sessionStorage.getItem('userDetails') || sessionStorage.getItem('userData');
let _storedUser: any = null;
if (_storedUserStr) {
  try {
    _storedUser = JSON.parse(_storedUserStr);
  } catch (e) {
    _storedUser = _storedUserStr;
  }
}

// Normalize values coming from sessionStorage or parsed user object.
// sessionStorage may contain the literal strings "null" or "undefined" (if set incorrectly),
// so treat those as missing values and fall back accordingly.
const normalizeCode = (val: any): string | null => {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return String(val ?? '') || null;
  const s = val.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return null;
  return s;
};

const custcodeRaw = normalizeCode(sessionStorage.getItem('customerCode')) || normalizeCode(_storedUser?.customerCode) || normalizeCode(_storedUser?.customer_code) || normalizeCode(_storedUser?.custcode) || null;
const orgcodeRaw = normalizeCode(sessionStorage.getItem('orgCode')) || normalizeCode(_storedUser?.orgCode) || normalizeCode(_storedUser?.orgcode) || normalizeCode(_storedUser?.org_code) || null;
const usercodeRaw = normalizeCode(sessionStorage.getItem('userCode')) || normalizeCode(_storedUser?.userCode) || normalizeCode(_storedUser?.usercode) || normalizeCode(_storedUser?.user_code) || normalizeCode(_storedUser?.user) || null;

// Ensure we pass strings (empty string fallback) to the API payload to avoid sending null
const custcode = String(custcodeRaw ?? '');
const orgcode = String(orgcodeRaw ?? '');
const usercode = String(usercodeRaw ?? '');

// Function to get booknameid from session storage
const getBookNameId = (): number => {
  const storedBookNameId = sessionStorage.getItem('booknameid');
  return storedBookNameId ? parseInt(storedBookNameId) : 1; // Default to 1 if not found
}


// API Response Interface for Question Details
interface QuestionDetailsResponse {
  classification: string;
  keyPoints: string;
  questionId: number;
  questionStem: string;
  referencePage: string;
  score: number;
}

// API Response Interface for Token Usage
interface ApiResponse {
  TotalResponseEvaluatedToday: string | null;
  balanceToken: string | null;
  bookCode: string | null;
  bookName: string | null;
  noOfQuestionEvaluated: number;
  noOfQuestions: number;
  todaysToken: string | null;
  todaysUsgae: string | null;
  totalQuestionCount: number | null;
  totalTokenCount: string | null;
  totaluserEvaluated: number;
}

// Question Interface
interface Question {
  id: number;
  stem: string;
  keyAnswer: string;
  markerNotes: string;
  maxScore: number;
  reference: string;
  answer: string;
  feedback: string;
  aiScore: number;
}

const EssayEvaluationDetail = () => {
  // Initialize component state
  const [isInitializing, setIsInitializing] = useState(true);

  // Handle initial data loading
  useEffect(() => {
    const initializeComponent = async () => {
      try {
        setIsInitializing(true);
        // Load any necessary initial data
        if (activeTab === "review") {
          await handleGetData();
        }
      } catch (error) {
        console.error("Error initializing component:", error);
        setValidationMessage("Failed to load data. Please refresh the page.");
        setShowValidationDialog(true);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeComponent();
  }, []);
  const { essayId } = useParams()
  const [candidateId, setCandidateId] = useState("")
  const [courseDetails, setCourseDetails] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [questionsLoading, setQuestionsLoading] = useState(true)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [isEvaluated, setIsEvaluated] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [selectedEvaluation, setSelectedEvaluation] = useState<any>(null)
  const [viewEvaluationLoading, setViewEvaluationLoading] = useState<string | null>(null)
  const [viewDialogExpanded, setViewDialogExpanded] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [openItems, setOpenItems] = useState<string[]>([])
  const [viewOpenItems, setViewOpenItems] = useState<string[]>([])
  const [remainingToken, setRemainingToken] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [validationMessage, setValidationMessage] = useState("")
  const [showClearConfirmDialog, setShowClearConfirmDialog] = useState(false)
  const [savedEvaluations, setSavedEvaluations] = useState<any[]>([])
  const [savedEvaluationsLoading, setSavedEvaluationsLoading] = useState(false)
  const [selectedUserType, setSelectedUserType] = useState("me")
  const [searchText, setSearchText] = useState("")
  const [selectedEvaluations, setSelectedEvaluations] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [showLoadingDialog, setShowLoadingDialog] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("evaluate")
  const isFirstReviewLoad = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isCancelledRef = useRef<boolean>(false)
  const [exportAborted, setExportAborted] = useState(false)

  const generateTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(6, '0');
    const timezoneOffset = now.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
    const offsetMinutes = Math.abs(timezoneOffset) % 60;
    const offsetSign = timezoneOffset <= 0 ? '+' : '-';

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
  };


  const updateQuestionAnswer = (questionId: number, answer: string) => {
    setQuestions(questions.map(q =>
      q.id === questionId ? { ...q, answer } : q
    ))
  }

  const handleClearAllClick = () => {
    // Check if there's any AI feedback present
    const hasAiFeedback = questions.some(q => q.feedback && q.feedback.trim() !== "")

    if (hasAiFeedback) {
      setShowClearConfirmDialog(true)
    } else {
      clearAllAnswers()
    }
  }

  const clearAllAnswers = () => {
    setQuestions(questions.map(q => ({ ...q, answer: "", feedback: "", aiScore: 0 })))
    setIsEvaluated(false)
    setShowClearConfirmDialog(false)
  }

  const handleClearConfirmClose = () => {
    setShowClearConfirmDialog(false)
  }

  const handleEvaluateEssay = async () => {
    // Validation: Check if Candidate ID is entered
    if (!candidateId.trim()) {
      setValidationMessage("Please enter Candidate ID")
      setShowValidationDialog(true)
      return
    }

    // Validation: Check if at least one answer response is filled
    const hasAnswers = questions.some(q => q.answer.trim() !== "")
    if (!hasAnswers) {
      setValidationMessage("Please enter response for atleast one question")
      setShowValidationDialog(true)
      return
    }

    // Reset cancellation flag and create a fresh abort controller for this run
    isCancelledRef.current = false
    abortControllerRef.current = new AbortController()
    setIsLoading(true)
    setShowLoadingDialog(true)

    try {
      // Filter questions that have answers
      const questionsWithAnswers = questions.filter(q => q.answer.trim() !== "")

      // Call API for each question with an answer
      const evaluationPromises = questionsWithAnswers.map(async (question) => {
        const evaluationPayload = {
          "url": "documentation/BODILY_INJURY_CLAIMS",
          "question": `\n    Evaluate the user response for the ${question.maxScore} marks based on the key points for the provided essay question. The response must address all key points comprehensively to earn the full ${question.maxScore} marks.\n    \n    *Essay Question:* ${question.stem}\n    \n    *User Response:* ${question.answer}\n    \n    *Key Points:*\n    ${question.keyAnswer}\n    \n    *Scoring Criteria:*\n    -Full Marks : The response comprehensively addresses all key points with clear, relevant explanations, demonstrating a deep understanding of the topic.\n    -Partial Marks : The response addresses most key points but lacks some depth or clarity. It shows a satisfactory understanding but could benefit from more detail or better organization.\n    -Limited Marks : The response covers a few key points with minimal explanation, demonstrating a weak understanding of the topic.\n    -No Marks : The response is off-topic, incomplete, or does not address the key points.\n\n    *Feedback:*\n    -Provide specific feedback on how the key points were addressed in the response.\n    -Provide detailed feedback on how well the user addressed each key point. Focus on the strengths of the response and areas that need improvement.\n    -If the response does not meet the criteria (incomplete, off-topic, or lacks detail), assign 0 marks and explain why.\n    \n    *Scoring:*\n    {\n        \"ReferenceInfo\": \"<Chapter Name from which it is referenced, page reference number>\",\n        \"Score\": <Score out of ${question.maxScore}>,\n        \"Feedback\": \"<Provide overall detailed feedback on the response, focusing on the strengths and areas for improvement, specifically in relation to how well it addresses the key points. Do not include any references to word count. Indicate which key points within the response have been awarded marks, so that the evaluation can be compared to a human marker's assessment. Ensure that the feedback is written in Canadian English, adhering to Canadian spelling conventions, grammar, and vocabulary.>\"\n    }\n    `,
          "source": "Book",
          "app_code": appcode,
          "question_type": "Written Response",
          "usercode": usercode,
          "custcode": custcode,
          "orgcode": orgcode,
          "booknameid": getBookNameId(),
          "studentid": candidateId,
          "coursedetails": courseDetails,
          "questionid": question.id
        }

        const response = await fetch(`${ESSAY_EVAL_API_URL}/evaluate_essay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(evaluationPayload),
          signal: abortControllerRef.current?.signal // Add abort signal
        })

        if (!response.ok) {
          throw new Error(`Failed to evaluate question ${question.id}`)
        }

        const data = await response.json()

        // Parse the JSON response from the answer.text field
        let evaluationResult
        try {
          // Extract the JSON from the text field inside answer object
          const textContent = data.answer?.text || data.text || ""

          // Remove markdown code blocks if present
          const cleanedText = textContent.replace(/```json\s*|\s*```/g, '').trim()

          evaluationResult = JSON.parse(cleanedText)
        } catch (parseError) {
          console.error('Error parsing evaluation result:', parseError)
          //console.log('Raw response:', data)
          // Fallback if parsing fails
          evaluationResult = {
            Score: 0,
            Feedback: "Error processing evaluation result"
          }
        }

        return {
          questionId: question.id,
          aiScore: evaluationResult.Score || 0,
          feedback: evaluationResult.Feedback || "No feedback available",
          tokensUsed: data.answer?.total_tokens_used || data.total_tokens_used || 0
        }
      })
      // Wait for all evaluations to complete (handle cancellations and partial failures)
      const settled = await Promise.allSettled(evaluationPromises)

      // If the run was cancelled, throw an AbortError to jump to the catch block
      if (isCancelledRef.current) {
        const err: any = new Error('Evaluation aborted')
        err.name = 'AbortError'
        throw err
      }

      // Collect successful results only
      const evaluationResults = settled
        .filter(s => s.status === 'fulfilled')
        .map((s: any) => s.value)

      // Update questions with API results
      const updatedQuestions = questions.map(q => {
        const result = evaluationResults.find((r: any) => r.questionId === q.id)
        if (result) {
          return {
            ...q,
            feedback: result.feedback,
            aiScore: result.aiScore
          }
        }
        return q
      })

      setQuestions(updatedQuestions)
      setIsLoading(false)
      setShowLoadingDialog(false)
      setShowResultDialog(true)

      // Refresh token usage after evaluation
      fetchTokenUsage()

    } catch (error: any) {
      // Check if the error is due to abortion
      if (error.name === 'AbortError') {
        //console.log('Evaluation was cancelled by user')
        setValidationMessage("Evaluation was cancelled.")
      } else {
        console.error('Error evaluating essay:', error)
        setValidationMessage("Error occurred during evaluation. Please try again.")
      }
      setShowValidationDialog(true)
    } finally {
      setIsLoading(false)
      setShowLoadingDialog(false)
      abortControllerRef.current = null
    }
  }
  const handleCancelEvaluation = () => {
    // Mark as cancelled so later logic can react accordingly
    isCancelledRef.current = true
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort() } catch (e) { }
    }
    setIsLoading(false)
    setShowLoadingDialog(false)
    setValidationMessage('Evaluation cancelled by user')
    setShowValidationDialog(true)
  }
  const handleDialogClose = () => {
    setShowResultDialog(false)
    setIsEvaluated(true)
  }
  const [isExporting, setIsExporting] = useState(false)

  const handleSaveResponse = async () => {
    // Check if there's any AI feedback present and candidate ID is filled
    const hasAiFeedback = questions.some(q => q.feedback && q.feedback.trim() !== "")
    if (!hasAiFeedback || !candidateId || isSaving) {
      return
    }

    try {
      setIsLoading(true)
      setIsSaving(true)

      // Create payload using current state directly
      const savePayload = {
        "custcode": custcode,
        "orgcode": orgcode,
        "usercode": usercode,
        "appcode": appcode,
        "studentname": `${candidateId}_${generateTimestamp()}`,
        "course": courseDetails || "",
        "booknameid": getBookNameId(),
        "evaluateddata": questions
          .filter(q => q.feedback && q.feedback.trim() !== "")
          .map(question => ({
            "questionid": question.id,
            "userresponse": question.answer,
            "evaluateduserresponse": question.feedback,
            "evaluatedscore": question.aiScore,
            "referenceinfo": question.reference
          }))
      }

      const response = await fetch(`${ESSAY_EVAL_API_URL}/save-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(savePayload)
      })

      if (!response.ok) {
        throw new Error('Failed to save evaluation')
      }

      const result = await response.json()
      //console.log('Save response:', result)

      // Add to local saved evaluations for UI display
      const newEvaluation = {
        id: savedEvaluations.length + 1,
        candidateId: candidateId,
        evaluatedDate: generateTimestamp(),
        evaluatedBy: "Current User",
        courseDetails: courseDetails || "N/A",
        questions: questions
      }

      // Update saved evaluations list
      setSavedEvaluations(prevEvaluations => [...prevEvaluations, newEvaluation])

      // Reset form to initial state
      try {
        // Fetch fresh questions from the API
        const questionDetailsResponse = await fetch(`${ESSAY_EVAL_API_URL}/question-details`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            "custcode": custcode,
            "orgcode": orgcode,
            "usercode": usercode,
            "appcode": appcode,
            "bookcode": getBookNameId()
          })
        });

        if (!questionDetailsResponse.ok) {
          throw new Error('Failed to reload question details');
        }

        const questionDetailsData = await questionDetailsResponse.json();

        // Reset questions to initial state with empty answers and feedback
        const freshQuestions = questionDetailsData.map((item: any) => ({
          id: item.questionId,
          stem: item.questionStem,
          keyAnswer: item.keyPoints,
          maxScore: item.score,
          reference: item.referencePage,
          answer: "",
          feedback: "",
          aiScore: 0
        }));

        // Reset all states to initial values
        setQuestions(freshQuestions);
        setCandidateId("");
        setCourseDetails("");
        setIsEvaluated(false);

      } catch (error) {
        console.error('Error reloading question details:', error);
      }

      setShowSaveDialog(true)

    } catch (error) {
      console.error('Error saving evaluation:', error)
      setValidationMessage("Error occurred while saving. Please try again.")
      setShowValidationDialog(true)
    } finally {
      setIsLoading(false)
      setIsSaving(false)
    }
  }

  const handleSaveDialogClose = () => {
    setShowSaveDialog(false)
    // Keep form data intact - do not reset any state
  }

  const handleValidationDialogClose = () => {
    setShowValidationDialog(false)
    setValidationMessage("")
  }

  const handleDownloadEvaluation = async (evaluation: any) => {
    try {
      // Call the API to get detailed evaluation data
      const payload = {
        "custcode": custcode,
        "orgcode": orgcode,
        "usercode": usercode,
        "appcode": appcode,
        "bookcode": getBookNameId(),
        "studentid": evaluation.studentId
      }

      const response = await fetch(`${ESSAY_EVAL_API_URL}/get_evaluated_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error('Failed to fetch evaluation data')
      }

      const data = await response.json()

      // Helper function to strip HTML tags
      const stripHtml = (html: string) => {
        if (!html) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
      }

      // Helper function to extract page numbers from reference
      const extractPageNumber = (reference: string) => {
        if (!reference) return 'N/A';
        // Extract pp.XX-XX pattern from the reference string
        const match = reference.match(/pp\.\s*[\d\-]+/i);
        return match ? match[0] : reference;
      }

      // Helper function to remove page numbers from reference for Study Material
      const removePageNumber = (reference: string) => {
        if (!reference) return 'N/A';
        // Remove pp.XX-XX and any comma or extra spaces before it
        return reference.replace(/,\s*pp\.\s*[\d\-]+/i, '').trim();
      }

      // Map the API response to questions array
      const questions = Array.isArray(data) ? data.map((item: any) => ({
        stem: item.questionStem || '',
        keyAnswer: item.keyPoints || '',
        answer: item.studentresponse || '',
        feedback: item.evaluatedResponse || '',
        maxScore: item.score || 0,
        aiScore: parseInt(item.evaluatedScore) || 0,
        reference: item.pageReference || ''
      })) : []

      // Create Excel workbook
      const workbook = XLSX.utils.book_new()

      // Get candidate ID and course details
      const candidateId = evaluation.evaluatedby || 'N/A'
      const studentName = evaluation.studentName || data[0]?.studentName || 'N/A'
      const courseDetails = data[0]?.course || evaluation.course || 'N/A'

      // Create worksheet data matching the specified format
      const worksheetData = [
        // Header row
        [
          'Candidate ID',
          'Question ID',
          'Question Text',
          'Answer points',
          'Candidate Response',
          'FeedBack [Ai Generated]',
          'Max Mark',
          'Candidate Mark',
          'Book',
          'Course Details',
          'Study',
          'Page Number'
        ],
        // Data rows from API response
        ...questions.map((question, index) => [
          candidateId || 'N/A',                     // Candidate ID
          ` ${index + 1}`,                          // Question ID
          stripHtml(question.stem),                 // Question Text
          stripHtml(question.keyAnswer),            // Answer points
          stripHtml(question.answer) || 'N/A',      // Candidate Response
          stripHtml(question.feedback) || 'N/A',    // FeedBack [Ai Generated]
          question.maxScore,                        // Max Mark
          question.aiScore || 'N/A',                // Candidate Mark
          getBookNameId() === 1
            ? 'Bodily Injury Claims'
            : 'Essentials of Loss Adjusting',                  // Book
          courseDetails || 'N/A',                   // Course Details
          removePageNumber(stripHtml(question.reference)),  // Study Material (without page numbers)
          extractPageNumber(question.reference)     // Page Number
        ])
      ]

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

      // Set column widths to match the format
      worksheet['!cols'] = [
        { width: 12 },  // Candidate ID
        { width: 12 },  // Question ID
        { width: 50 },  // Question Text
        { width: 50 },  // Answer points
        { width: 50 },  // Candidate Response
        { width: 60 },  // FeedBack [Ai Generated]
        { width: 10 },  // Max Mark
        { width: 15 },  // Candidate Mark
        { width: 25 },  // Book
        { width: 20 },  // Course Details
        { width: 30 },  // Study Material
        { width: 15 }   // Page Number
      ]

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Evaluation Results')

      // Download the Excel file with EvaluationData prefix and Candidate ID
      const filename = studentName ? `EvaluationData_${studentName}.xlsx` : `EvaluationData.xlsx`
      XLSX.writeFile(workbook, filename)

    } catch (error) {
      console.error('Error downloading evaluation:', error)
      alert('Error occurred while downloading. Please try again.')
    }
  }

  const handleViewEvaluation = async (evaluation: any) => {
    try {
      //console.log('Clicked evaluation:', evaluation) // Debug log
      setViewEvaluationLoading(evaluation.studentId)

      // Call the API to get detailed evaluation data
      const payload = {
        "custcode": custcode,
        "orgcode": orgcode,
        "usercode": usercode,
        "appcode": appcode,
        "bookcode": getBookNameId(),
        "studentid": evaluation.studentId
      }

      const response = await fetch(`${ESSAY_EVAL_API_URL}/get_evaluated_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error('Failed to fetch evaluation data')
      }

      const data = await response.json()
      //console.log('API Response:', data) // Debug log

      // Map the API response to the expected format
      const mappedQuestions = Array.isArray(data) ? data.map((item: any) => {
        //console.log('Mapping question:', item) // Debug log
        return {
          id: item.questionId,
          stem: item.questionStem,
          keyAnswer: item.keyPoints,
          maxScore: item.score,
          reference: item.pageReference,
          answer: item.studentresponse,
          feedback: item.evaluatedResponse,
          aiScore: parseInt(item.evaluatedScore) || 0
        }
      }) : []

      // Reset dialog states
      setViewOpenItems([])
      setViewDialogExpanded(false)

      // Set the detailed evaluation data with questions
      setSelectedEvaluation({
        ...evaluation,
        questions: mappedQuestions,
        candidateId: evaluation.studentId, // This should be the clicked student ID
        courseDetails: data[0]?.course || evaluation.course || '',
        studentName: data[0]?.studentName || evaluation.studentName || evaluation.studentId
      })
      setShowViewDialog(true)

    } catch (error) {
      console.error('Error fetching evaluation details:', error)
      // Fallback: show dialog with basic info if API fails
      setSelectedEvaluation({
        ...evaluation,
        questions: [],
        candidateId: evaluation.studentId,
        courseDetails: evaluation.course || ''
      })
      setShowViewDialog(true)
    } finally {
      setViewEvaluationLoading(null)
    }
  }

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // Handle scroll for back to top button
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleCloseViewDialog = () => {
    setShowViewDialog(false)
    setSelectedEvaluation(null)
    setViewDialogExpanded(false)
    setViewOpenItems([])
  }

  useEffect(() => {
    const tokenApiUrl = `${ESSAY_EVAL_API_URL}/get_usage`;
    const tokenApiPayload = {
      custcode: sessionStorage.getItem("customerCode") || "",
      orgcode: sessionStorage.getItem("orgCode") || "",
      usercode: sessionStorage.getItem("userCode") || "",
      appcode: appcode,
      type: 2
    };
  }, []);
  const handleDownloadAsExcel = () => {
    if (!selectedEvaluation) return

    try {
      // Helper function to strip HTML tags and convert to plain text
      const stripHtml = (html: string) => {
        if (!html) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
      }

      // Helper function to extract page numbers from reference
      const extractPageNumber = (reference: string) => {
        if (!reference) return 'N/A';
        const match = reference.match(/pp\.\s*[\d\-]+/i);
        return match ? match[0] : reference;
      }

      // Helper function to remove page numbers from reference for Study Material
      const removePageNumber = (reference: string) => {
        if (!reference) return 'N/A';
        return reference.replace(/,\s*pp\.\s*[\d\-]+/i, '').trim();
      }

      // Create Excel workbook
      const workbook = XLSX.utils.book_new()

      // Get current date
      const currentDate = new Date().toLocaleDateString()

      // Create worksheet data matching the same format
      const worksheetData = [
        // Header row
        [
          'Candidate ID',
          'Question ID',
          'Question Text',
          'Answer points',
          'Candidate Response',
          'FeedBack [Ai Generated]',
          'Max Mark',
          'Candidate Mark',
          'Book',
          'Course Details',
          'Study',
          'Page Number'
        ],
        // Data rows for all questions from selectedEvaluation
        ...selectedEvaluation.questions.map((question: any, index: number) => [
          selectedEvaluation.candidateId || 'N/A',           // Candidate ID
          ` ${index + 1}`,                                   // Question ID
          stripHtml(question.stem),                          // Question Text
          stripHtml(question.keyAnswer),                     // Answer points
          stripHtml(question.answer) || 'N/A',               // Candidate Response
          stripHtml(question.feedback) || 'N/A',             // FeedBack [Ai Generated]
          question.maxScore,                                 // Max Mark
          question.aiScore || 'N/A',                         // Candidate Mark
          getBookNameId() === 1
            ? 'Bodily Injury Claims'
            : 'Essentials of Loss Adjusting',                            // Book
          selectedEvaluation.courseDetails || 'N/A',         // Course Details
          removePageNumber(stripHtml(question.reference)),   // Study Material (without page numbers)
          extractPageNumber(question.reference)              // Page Number
        ])
      ]

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

      // Set column widths
      worksheet['!cols'] = [
        { width: 12 },  // Candidate ID
        { width: 12 },  // Question ID
        { width: 15 },  // Overall Skill
        { width: 50 },  // Answer points
        { width: 50 },  // Candidate Response
        { width: 60 },  // FeedBack [Ai Generated]
        { width: 10 },  // Max Mark
        { width: 15 },  // Candidate Mark
        { width: 25 },  // Book
        { width: 20 },  // Course Details
        { width: 30 },  // Study Material
        { width: 15 }   // Page Number
      ]

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Evaluation Results')

      // Download the Excel file with EvaluationData prefix and Candidate ID
      const filename = `EvaluationData_${selectedEvaluation.studentName}.xlsx`
      XLSX.writeFile(workbook, filename)

    } catch (error) {
      console.error('Error exporting to Excel:', error)
    }
  }

  const handleExportToExcel = () => {
    // Check if there's any evaluated data
    const hasEvaluatedData = questions.some(q => q.feedback && q.feedback.trim() !== "")
    if (!hasEvaluatedData) return

    try {
      // Helper function to strip HTML tags and convert to plain text
      const stripHtml = (html: string) => {
        if (!html) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
      }

      // Helper function to extract page numbers from reference
      const extractPageNumber = (reference: string) => {
        if (!reference) return 'N/A';
        // Extract pp.XX-XX pattern from the reference string
        const match = reference.match(/pp\.\s*[\d\-]+/i);
        return match ? match[0] : reference;
      }

      // Helper function to remove page numbers from reference for Study Material
      const removePageNumber = (reference: string) => {
        if (!reference) return 'N/A';
        // Remove pp.XX-XX and any comma or extra spaces before it
        return reference.replace(/,\s*pp\.\s*[\d\-]+/i, '').trim();
      }

      // Create Excel workbook
      const workbook = XLSX.utils.book_new()

      // Get current date for Start Date field
      const currentDate = new Date().toLocaleDateString()

      // Calculate total AI score and max score from all questions
      const totalAiScore = questions.reduce((sum, q) => sum + q.aiScore, 0)
      const totalMaxScore = questions.reduce((sum, q) => sum + q.maxScore, 0)
      const aiScorePercentage = totalMaxScore > 0 ? ((totalAiScore / totalMaxScore) * 100).toFixed(2) : "0.00"

      // Create worksheet data matching the image format
      const worksheetData = [
        // Header row
        [
          'Candidate ID',
          'Question ID',
          'Question Text',
          'Answer points',
          'Candidate Response',
          'FeedBack [Ai Generated]',
          'Max Mark',
          'Candidate Mark',
          'Book',
          'Course Details',
          'Study',
          'Page Number'
        ],
        // Data rows for ALL questions (show N/A for unevaluated ones)
        ...questions.map((question, index) => [
          candidateId || 'N/A',                     // Candidate ID
          ` ${index + 1}`,                  // Question ID
          stripHtml(question.stem),                 // Question Text
          stripHtml(question.keyAnswer),            // Answer points
          stripHtml(question.answer) || 'N/A',      // Candidate Response
          stripHtml(question.feedback) || 'N/A',    // FeedBack [Ai Generated]
          question.maxScore,                        // Max Mark
          question.aiScore || 'N/A',                // Candidate Mark
          getBookNameId() === 1
            ? 'Bodily Injury Claims'
            : 'Essentials of Loss Adjusting',                   // Book
          courseDetails || 'N/A',                   // Course Details
          removePageNumber(stripHtml(question.reference)),  // Study Material (without page numbers)
          extractPageNumber(question.reference)     // Page Number
        ])
      ]

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

      // Set column widths to match the image
      worksheet['!cols'] = [
        { width: 12 },  // Candidate ID
        { width: 12 },  // Question ID
        { width: 15 },  // Overall Skill
        { width: 50 },  // Answer points
        { width: 50 },  // Candidate Response
        { width: 60 },  // FeedBack [Ai Generated]
        { width: 10 },  // Max Mark
        { width: 15 },  // Candidate Mark
        { width: 25 },  // Book
        { width: 20 },  // Course Details
        { width: 30 },  // Study Material
        { width: 15 }   // Page Number
      ]

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Evaluation Results')

      // Only proceed with file download if not aborted
      if (!exportAborted) {
        // Download the Excel file with EvaluationData prefix and Candidate ID
        const filename = candidateId ? `EvaluationData_${candidateId}.xlsx` : `EvaluationData_${currentDate.replace(/\//g, '-')}.xlsx`
        XLSX.writeFile(workbook, filename)
      }

    } catch (error) {
      console.error('Error exporting to Excel:', error);
      if (error.name === 'AbortError' || error.message === 'Export cancelled by user') {
        setValidationMessage('Export cancelled by user');
      } else {
        setValidationMessage("Error occurred while exporting. Please try again.");
      }
      setShowValidationDialog(true);
    } finally {
      setIsExporting(false);
      // Also clear selections in finally in case of fallback/cancel
      setSelectedEvaluations([])
      setSelectAll(false)
    }
  }

  const [questions, setQuestions] = useState<Question[]>([])

  // Function to generate timestamp in required format


  // API configuration
  const apiUrl = `${ESSAY_EVAL_API_URL}/question-details`;
  const getApiPayload = (bookcode: number) => ({
    "custcode": custcode,
    "orgcode": orgcode,
    "usercode": usercode,
    "appcode": appcode,
    "bookcode": getBookNameId()
  });

  // Token API configuration
  const tokenApiUrl = `${ESSAY_EVAL_API_URL}/get_usage`;
  const tokenApiPayload = {
    "custcode": custcode,
    "orgcode": orgcode,
    "usercode": usercode,
    "appcode": appcode,
    "type": 2
  };

  // Function to fetch questions from API
  const fetchQuestions = async () => {
    try {
      setQuestionsLoading(true);
      const userinfo = JSON.parse(sessionStorage.getItem('userInfo'))
      const bookcode = sessionStorage.getItem("booknameid") ? parseInt(sessionStorage.getItem("booknameid") || "1") : 1;
      const Payload = {
        "custcode": userinfo.customerCode,
        "orgcode": userinfo.orgCode,
        "usercode": userinfo.userCode,
        "appcode": appcode,
        "bookcode": bookcode
      };
      // Get bookcode from essayId (assuming essayId corresponds to bookcode)


      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(Payload)
      });

      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }

      const data: QuestionDetailsResponse[] = await response.json();

      // Map API response to Question interface
      const mappedQuestions: Question[] = data.map((item) => ({
        id: item.questionId,
        stem: item.questionStem,
        keyAnswer: item.keyPoints,
        markerNotes: "Key points are underlined. Marks to be awarded if the student adequately addresses the key points.",
        maxScore: item.score,
        reference: item.referencePage,
        answer: "",
        feedback: "",
        aiScore: 0
      }));

      setQuestions(mappedQuestions);

      // Auto-expand all questions to show Answer Response sections
      const allQuestionIds = mappedQuestions.map(q => `question-${q.id}`);
      setOpenItems(allQuestionIds);
      setIsExpanded(true);

    } catch (error) {
      console.error('Error fetching questions:', error);
      // Fallback to default questions on error
      const fallbackQuestions = [
        {
          id: 1,
          stem: "Briefly describe the purpose and construction of the rib cage.",
          keyAnswer: "Study 1, pp.11-12 – Verifying Facts—Importance of Visual Evidence – Any TEN (10) points required.",
          markerNotes: "Key points are underlined. Marks to be awarded if the student adequately addresses the key points.",
          maxScore: 10,
          reference: "Study 1 - Investigating Bodily Injury Claims, pp.11-12",
          answer: "",
          feedback: "",
          aiScore: 0
        },
        {
          id: 2,
          stem: "Explain the role of medical experts in personal injury claims and discuss the importance of medical documentation.",
          keyAnswer: "Study 2, pp.15-18 – Medical Evidence in Personal Injury Claims – Any EIGHT (8) points required.",
          markerNotes: "Focus on the significance of medical experts and proper documentation.",
          maxScore: 8,
          reference: "Study 2 - Medical Evidence and Expert Testimony, pp.15-18",
          answer: "",
          feedback: "",
          aiScore: 0
        }
      ];
      setQuestions(fallbackQuestions);

      // Auto-expand fallback questions too
      const fallbackIds = fallbackQuestions.map(q => `question-${q.id}`);
      setOpenItems(fallbackIds);
      setIsExpanded(true);
    } finally {
      setQuestionsLoading(false);
    }
  };

  // Function to fetch token usage
  const fetchTokenUsage = async () => {
    const userinfo = JSON.parse(sessionStorage.getItem('userInfo'))
    const Payload = {
      custcode: userinfo.customerCode || "",
      orgcode: userinfo.orgCode || "",
      usercode: userinfo.userCode || "",
      appcode: appcode,
      type: 2
    };
    try {
      const response = await fetch(tokenApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(Payload)
      });

      if (!response.ok) {
        throw new Error('Failed to fetch token usage');
      }

      const data: ApiResponse[] = await response.json();

      // Extract summary data (where bookCode is null) for balance token
      const summaryData = data.find(item => item.bookCode === null);
      if (summaryData && summaryData.balanceToken) {
        setRemainingToken(parseInt(summaryData.balanceToken));
      }

    } catch (error) {
      console.error('Error fetching token usage:', error);
      // Fallback value on error
      setRemainingToken(16424);
    }
  };

  // Function to fetch saved evaluations
  const fetchSavedEvaluations = async (userType: string = "me", search: string = "") => {
    try {
      setSavedEvaluationsLoading(true)
      const userinfo = JSON.parse(sessionStorage.getItem('userInfo'))
      const bookcode = sessionStorage.getItem("booknameid") ? parseInt(sessionStorage.getItem("booknameid") || "1") : 1;

      const userTypeValue = userType === "me" ? 1 : userType === "others" ? 2 : userType === "all" ? 3 : 1

      const payload = {
        "userType": userTypeValue,
        "searchtext": search,
        "custcode": userinfo.customerCode || "",
        "orgcode": userinfo.orgCode || "",
        "usercode": userinfo.userCode || "",
        "appcode": appcode,
        "bookcode": bookcode
      }

      const response = await fetch(`${ESSAY_EVAL_API_URL}/get_student_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error('Failed to fetch saved evaluations')
      }

      const data = await response.json()
      setSavedEvaluations(data || [])

    } catch (error) {
      console.error('Error fetching saved evaluations:', error)
      // Fallback to empty array on error
      setSavedEvaluations([])
    } finally {
      setSavedEvaluationsLoading(false)
    }
  }

  const [refreshData, setRefreshData] = useState(0)

  // useEffect to fetch saved evaluations when Get Data button is clicked
  useEffect(() => {
    if (refreshData > 0) {
      fetchSavedEvaluations(selectedUserType, searchText)
      // Clear selections when fetching new data
      setSelectedEvaluations([])
      setSelectAll(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshData])

  // Function to handle Get Data button click
  const handleGetData = () => {
    setRefreshData(prev => prev + 1)
  }
  const handleGetDataAlternative = () => {
    fetchSavedEvaluations(selectedUserType, searchText)
    setSelectedEvaluations([])
    setSelectAll(false)
  }
  // Function to handle individual checkbox selection
  const handleEvaluationSelect = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedEvaluations(prev => [...prev, studentId])
    } else {
      setSelectedEvaluations(prev => prev.filter(id => id !== studentId))
      setSelectAll(false)
    }
  }

  // Function to handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)
    if (checked) {
      setSelectedEvaluations(savedEvaluations.map(evaluation => evaluation.studentId))
    } else {
      setSelectedEvaluations([])
    }
  }

  // Function to handle bulk export
  const handleBulkExport = async () => {
    if (selectedEvaluations.length === 0) return;

    // Reset export states
    setExportAborted(false);
    setIsExporting(true);

    // Create new AbortController for this export
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const selectedData = savedEvaluations.filter(evaluation =>
        selectedEvaluations.includes(evaluation.studentId)
      );
      const workbook = XLSX.utils.book_new();
      const allEvaluationData = [];

      // Early exit if already aborted
      if (exportAborted) {
        setIsExporting(false);
        return;
      }

      for (const evaluation of selectedData) {
        // Check for abort at the start of each iteration
        if (exportAborted) {
          setIsExporting(false);
          setValidationMessage('Export cancelled by user');
          setShowValidationDialog(true);
          return; // Exit completely instead of just breaking
        }
        try {
          const payload = {
            "custcode": custcode,
            "orgcode": orgcode,
            "usercode": usercode,
            "appcode": appcode,
            "bookcode": getBookNameId(),
            "studentid": evaluation.studentId
          };
          // Check if already aborted before making the API call
          if (exportAborted) {
            throw new Error('Export cancelled by user');
          }

          const response = await fetch(`${ESSAY_EVAL_API_URL}/get_evaluated_data`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: abortController.signal // Add abort signal to the fetch call
          });
          if (response.ok) {
            const data = await response.json();
            allEvaluationData.push({
              studentInfo: evaluation,
              evaluationData: data
            });
          }
        } catch (error) {
          console.error(`Error fetching data for student ${evaluation.studentId}:`, error);
        }
      }
      // Create worksheet data for bulk export in the same format as individual download
      const worksheetData = [
        // Header row
        [
          'Candidate ID',
          'Question ID',
          'Question Text',
          'Answer points',
          'Candidate Response',
          'FeedBack [Ai Generated]',
          'Max Mark',
          'Candidate Mark',
          'Book',
          'Course Details',
          'Study',
          'Page Number'
        ],
      ]

      // Helper function to strip HTML tags
      const stripHtml = (html: string) => {
        if (!html) return '';
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
      }

      // Helper function to extract page numbers from reference
      const extractPageNumber = (reference: string) => {
        if (!reference) return 'N/A';
        const match = reference.match(/pp\.\s*[\d\-]+/i);
        return match ? match[0] : reference;
      }

      // Helper function to remove page numbers from reference for Study Material
      const removePageNumber = (reference: string) => {
        if (!reference) return 'N/A';
        return reference.replace(/,\s*pp\.\s*[\d\-]+/i, '').trim();
      }

      // Add data for each student
      allEvaluationData.forEach(({ studentInfo, evaluationData }) => {
        // Map the API response to questions array
        const questions = Array.isArray(evaluationData) ? evaluationData.map((item: any) => ({
          stem: item.questionStem || '',
          keyAnswer: item.keyPoints || '',
          answer: item.studentresponse || '',
          feedback: item.evaluatedResponse || '',
          maxScore: item.score || 0,
          aiScore: parseInt(item.evaluatedScore) || 0,
          reference: item.pageReference || ''
        })) : []

        questions.forEach((question, index) => {
          worksheetData.push([
            studentInfo.evaluatedby || 'N/A',           // Candidate ID (evaluatedby)
            ` ${index + 1}`,                          // Question ID
            stripHtml(question.stem),                 // Question Text
            stripHtml(question.keyAnswer),            // Answer points
            stripHtml(question.answer) || 'N/A',      // Candidate Response
            stripHtml(question.feedback) || 'N/A',    // FeedBack [Ai Generated]
            question.maxScore,                        // Max Mark
            question.aiScore || 'N/A',                // Candidate Mark
            getBookNameId() === 1
              ? 'Bodily Injury Claims'
              : 'Essentials of Loss Adjusting',                  // Book
            evaluationData[0]?.course || studentInfo.course || 'N/A',  // Course Details
            removePageNumber(stripHtml(question.reference)),  // Study Material (without page numbers)
            extractPageNumber(question.reference)     // Page Number
          ])
        })
      })

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

      // Set column widths to match the format
      worksheet['!cols'] = [
        { width: 12 },  // Candidate ID
        { width: 12 },  // Question ID
        { width: 50 },  // Question Text
        { width: 50 },  // Answer points
        { width: 50 },  // Candidate Response
        { width: 60 },  // FeedBack [Ai Generated]
        { width: 10 },  // Max Mark
        { width: 15 },  // Candidate Mark
        { width: 25 },  // Book
        { width: 20 },  // Course Details
        { width: 30 },  // Study Material
        { width: 15 }   // Page Number
      ]

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Bulk Evaluations')

      // Download the Excel file as bulk_export.xlsx
      XLSX.writeFile(workbook, 'bulk_export.xlsx')
      // Clear selections after successful export
      setSelectedEvaluations([])
      setSelectAll(false)
    } catch (error) {
      console.error('Error in bulk export:', error)
      // Fallback to simple CSV if API fails
      const selectedData = savedEvaluations.filter(evaluation =>
        selectedEvaluations.includes(evaluation.studentName)
      )

      const csvContent = `Student ID,Student Name,Evaluated Date,Evaluated By\n` +
        selectedData.map(evaluation =>
          `"${evaluation.studentId}","${evaluation.studentName}","${evaluation.evaluateddate}","${evaluation.evaluatedby}"`
        ).join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const candidateIds = selectedData.map(evaluation => evaluation.studentId).join('_')
      a.download = `${candidateIds}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    }
    finally {
      setIsExporting(false)
      // Also clear selections in finally in case of fallback/cancel
      setSelectedEvaluations([])
      setSelectAll(false)
    }
  }

  // Fetch questions, token usage, and saved evaluations on component mount
  useEffect(() => {
    const initialize = async () => {
      setPageLoading(true)
      try {
        await Promise.all([
          fetchQuestions(),
          fetchTokenUsage(),
          fetchSavedEvaluations(), // Load initial data with default parameters
        ])
      } finally {
        setPageLoading(false)
      }
    }
    initialize()
  }, [essayId])

  const totalQuestions = questions.length

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg animate-pulse">
              <PenTool className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Loading Essay Evaluation</h2>
            <p className="text-gray-600">Preparing your evaluation dashboard...</p>
          </div>
          <div className="flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        </div>
      </div>
    )
  }

  // Removed duplicate declaration of exportAborted and setExportAborted

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <PenTool className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Essay Evaluation - Fine tuned</h1>
              <p className="text-sm text-gray-500">Evaluate candidate responses and review evaluations</p>
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
            <Link to="/essay-evaluation">
              <Button variant="ghost" size="sm" className="hover:bg-accent hover:text-accent-foreground">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Essays
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value)
              if (value === "review") {
                setCandidateId("") // Clear only input field data
                setCourseDetails("")
                // Clear all answers for all questions (if needed, use clearAllAnswers instead)
                // updateQuestionAnswer expects (questionId: number, answer: string)
                // If you want to clear all answers, use clearAllAnswers()
                clearAllAnswers()

                // Reset filters and fetch fresh data when switching to review tab
                setSelectedUserType("me")
                setSearchText("")
                handleGetData() // This calls the API https://ailevate-poc.excelsoftcorp.com/aiapps/EssayEvaluation/EssayEvaluationApi/get_evaluated_data
                //console.log('Fetching fresh evaluation data for Review tab')
              }
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-gray-100 p-2 rounded-xl shadow-sm border gap-2 h-16">
              <TabsTrigger
                value="evaluate"
                className="rounded-lg h-full font-medium transition-all data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-600 hover:text-gray-800 hover:bg-gray-200"
              >
                Evaluate Candidate
              </TabsTrigger>
              <TabsTrigger
                value="review"
                className="rounded-lg h-full font-medium transition-all data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-600 hover:text-gray-800 hover:bg-gray-200"
              >
                Review Evaluation
              </TabsTrigger>
            </TabsList>

            <TabsContent value="evaluate" className="space-y-8">
              {/* Step 1: Candidate Information */}
              <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-blue-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-blue-800">
                    <div className="p-2 bg-blue-600 text-white rounded-lg">
                      <PenTool className="h-5 w-5" />
                    </div>
                    Step 1: Enter Candidate Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="md:w-1/3">
                      <img
                        src={getBookNameId() === 1 ? Bodily : getBookNameId() === 2 ? Essentials : essayEvaluationImage}
                        alt="Essay Evaluation"
                        className="w-40 h-40 ml-10 md:mr-0 rounded-lg shadow-lg"
                      />
                    </div>
                    <div className="md:w-2/3 space-y-4">
                      <p className="text-blue-700 mb-4">
                        Enter the candidate ID and course details to begin the evaluation process.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="candidateId" className="text-blue-800">Candidate ID <span className="text-red-600">*</span></Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Input
                                  id="candidateId"
                                  value={candidateId}
                                  onChange={(e) => setCandidateId(e.target.value)}
                                  placeholder="Enter candidate ID"
                                  className="bg-white border-blue-200"
                                  required
                                />
                              </TooltipTrigger>

                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="courseDetails" className="text-blue-800">Course Details</Label>
                          <Input
                            id="courseDetails"
                            value={courseDetails}
                            onChange={(e) => setCourseDetails(e.target.value)}
                            placeholder="Enter course details"
                            className="bg-white border-blue-200"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Step 2: Evaluation Actions */}
              <Card className="border-2 border-green-100 bg-gradient-to-br from-green-50 to-green-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-green-800">
                    <div className="p-2 bg-green-600 text-white rounded-lg">
                      <Save className="h-5 w-5" />
                    </div>
                    Evaluation Actions
                  </CardTitle>
                  <p className="text-sm text-green-600">
                    Use the actions to manage your evaluation process.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>

                    </div>
                    <div className="flex gap-2 items-center overflow-x-auto">
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white w-[130px] flex-shrink-0"
                        onClick={handleEvaluateEssay}
                        disabled={isLoading}
                      >
                        Evaluate Essay
                      </Button>
                      <Button
                        variant="outline"
                        className="ai-button-secondary flex-shrink-0"
                        onClick={handleSaveResponse}
                        disabled={!questions.some(q => q.feedback && q.feedback.trim() !== "") || !candidateId || isSaving}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="ai-button-secondary flex-shrink-0"
                        onClick={handleExportToExcel}
                        disabled={!questions.some(q => q.feedback && q.feedback.trim() !== "")}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                      <Button
                        variant="outline"
                        className="ai-button-secondary flex-shrink-0"
                        onClick={handleClearAllClick}
                      >
                        <Trash className="h-4 w-4 mr-2" />
                        Clear
                      </Button>
                      <Button
                        variant="outline"
                        className="ai-button-secondary w-[100px] flex-shrink-0"
                        onClick={() => {
                          if (openItems.length === questions.length) {
                            setOpenItems([])
                            setIsExpanded(false)
                          } else {
                            const all = questions.map(q => `question-${q.id}`)
                            setOpenItems(all)
                            setIsExpanded(true)
                          }
                        }}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-2" />
                            Collapse
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-2" />
                            Expand
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Step 3: Questions */}
              <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-purple-100">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3 text-purple-800 w-full">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-600 text-white rounded-lg">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      Step 2: Evaluate Questions
                    </div>
                    <div className="flex justify-end w-auto ml-4">
                      <p className="text-purple-700 mb-2">
                        Total Questions: <span className="font-semibold text-purple-800">{totalQuestions}</span>
                      </p>
                    </div>
                  </CardTitle>
                  <p className="text-purple-700 mb-6">
                    Review each question and provide candidate responses for evaluation.
                  </p>
                </CardHeader>
                <CardContent>


                  {questionsLoading ? (
                    <div className="flex justify-center items-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                      <span className="ml-4 text-purple-700">Loading questions...</span>
                    </div>
                  ) : (
                    <Accordion
                      type="multiple"
                      className="w-full space-y-4"
                      value={openItems}
                      onValueChange={(v) => {
                        const vals = v as string[]
                        setOpenItems(vals)
                        setIsExpanded(vals.length === questions.length)
                      }}
                    >
                      {questions.map((question) => (
                        <div key={question.id} className="border border-purple-200 rounded-lg bg-white">
                          {/* Always visible section - Question Stem, Answer Response, AI Feedback */}
                          <div className="p-4 space-y-4">
                            <div className="flex flex-col items-start w-full gap-3">
                              <div className="font-medium text-Black-800">Question ID : {question.id}</div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-md">
                                  Question Stem
                                </span>
                              </div>
                              <div className="w-full">
                                <div
                                  className="text-base font-medium text-gray-900 leading-relaxed pl-2 border-l-4 border-purple-400 prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{ __html: question.stem }}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`answer-${question.id}`} className="text-purple-800 font-medium">
                                Answer Response:
                              </Label>
                              <Textarea
                                id={`answer-${question.id}`}
                                placeholder="Enter candidate's answer response..."
                                className="min-h-[100px] bg-white border-purple-200"
                                value={question.answer}
                                onChange={(e) => updateQuestionAnswer(question.id, e.target.value)}
                              />
                            </div>

                            {isEvaluated && question.feedback && (
                              <div className="space-y-3">
                                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                  <h4 className="text-sm font-semibold text-blue-900 mb-2">AI Evaluation Feedback</h4>
                                  <p className="text-sm text-gray-700 leading-relaxed">{question.feedback}</p>
                                </div>
                                <div className="flex items-center gap-4 py-2 px-4 bg-gray-50 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-600">Max Score:</span>
                                    <span className="text-lg font-bold text-purple-700">{question.maxScore}</span>
                                  </div>
                                  <div className="h-4 w-px bg-gray-300"></div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-600">AI Score:</span>
                                    <span className="text-lg font-bold text-green-700">{question.aiScore}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Expandable section - Key Answer and Reference */}
                          <AccordionItem value={`question-${question.id}`} className="border-0">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AccordionTrigger className="px-4 py-2 hover:no-underline border-t border-purple-100">
                                    <span className="text-sm font-medium text-purple-700">
                                      Show Key Answer & Reference
                                    </span>
                                  </AccordionTrigger>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="end">
                                  Expand/collapse to show or hide the Key Answer & Reference
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <AccordionContent className="px-4 pb-4">
                              <div className="space-y-4">
                                <div className="bg-purple-50 rounded-lg p-4">
                                  <h4 className="text-sm font-semibold text-purple-900 mb-2">Key Answer</h4>
                                  <div
                                    className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: question.keyAnswer }}
                                  />
                                </div>

                                <div className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-lg">
                                  <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-gray-600">Max Marks:</span>
                                      <span className="text-lg font-bold text-purple-700">{question.maxScore}</span>
                                    </div>
                                    <div className="h-4 w-px bg-gray-300"></div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-gray-600">Reference:</span>
                                      <span className="text-sm text-gray-700">{question.reference}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </div>
                      ))}
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="review" className="space-y-8">
              <Card className="border-2 border-orange-100 bg-gradient-to-br from-orange-50 to-orange-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-orange-800">
                    <div className="p-2 bg-orange-600 text-white rounded-lg">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    Review Evaluation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="md:w-1/3">
                      <img
                        src={getBookNameId() === 1 ? Bodily : getBookNameId() === 2 ? Essentials : essayEvaluationImage}
                        alt="Essay Evaluation"
                        className="w-40 h-40 ml-10 md:mr-0 rounded-lg shadow-lg"
                      />
                    </div>
                    <div className="md:w-2/3">
                      <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1">
                          <Label htmlFor="userType" className="text-orange-800">User Type</Label>
                          <Select
                            value={selectedUserType}
                            onValueChange={(value) => {
                              //console.log('Dropdown changed to:', value) // Debug log
                              setSelectedUserType(value)
                            }}
                          >
                            <SelectTrigger className="bg-white border-orange-200">
                              <SelectValue placeholder="Select user type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="me">Me</SelectItem>
                              <SelectItem value="others">Others</SelectItem>
                              <SelectItem value="all">All Users</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1">
                          <Label htmlFor="search" className="text-orange-800">Search</Label>
                          <Input
                            id="search"
                            placeholder="Search..."
                            className="bg-white border-orange-200"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                          />
                        </div>
                        <Button
                          className="bg-yellow-500 hover:bg-yellow-600 text-white min-w-[120px]"
                          onClick={handleGetData}
                          disabled={savedEvaluationsLoading}
                        >
                          {savedEvaluationsLoading ? (
                            <PageLoader />
                          ) : (
                            <div className="flex items-center gap-2">
                              <Search className="h-4 w-4" />
                              <span>Get Data</span>
                            </div>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b border-orange-200">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          onClick={handleBulkExport}
                          disabled={selectedEvaluations.length === 0 || isExporting}
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          Bulk Export ({selectedEvaluations.length})
                        </Button>
                      </div>
                      <span className="text-sm text-gray-600">
                        Total Candidates: <span className="font-bold text-blue-600">{savedEvaluations.length}</span>
                      </span>
                    </div>

                    {savedEvaluationsLoading ? (
                      <div className="py-8 text-center">
                        <div className="flex justify-center items-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2"></div>
                          Loading evaluations...
                        </div>
                      </div>
                    ) : savedEvaluations.length === 0 ? (
                      <div className="py-8 text-center text-gray-500">
                        No evaluations found
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="w-12">
                              <Checkbox
                                checked={selectAll}
                                onCheckedChange={handleSelectAll}
                              />
                            </TableHead>
                            <TableHead>Candidate ID</TableHead>
                            <TableHead>Evaluated date and time</TableHead>
                            <TableHead>Evaluated By</TableHead>
                            <TableHead className="w-24">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...savedEvaluations]
                            .sort((a, b) => {
                              // Try to parse as date, fallback to string compare
                              const dateA = new Date(a.evaluateddate).getTime();
                              const dateB = new Date(b.evaluateddate).getTime();
                              return dateB - dateA;
                            })
                            .map((evaluation) => (
                              <TableRow key={evaluation.studentId}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedEvaluations.includes(evaluation.studentId)}
                                    onCheckedChange={(checked) => handleEvaluationSelect(evaluation.studentId, checked as boolean)}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  {evaluation.studentName}
                                </TableCell>
                                <TableCell>{evaluation.evaluateddate}</TableCell>
                                <TableCell>{evaluation.evaluatedby}</TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        const button = document.activeElement as HTMLButtonElement;
                                        if (button) button.disabled = true;
                                        try {
                                          await handleDownloadEvaluation(evaluation);
                                        } finally {
                                          if (button) button.disabled = false;
                                        }
                                      }}
                                      title="Download evaluation"
                                    >
                                      {document.activeElement?.getAttribute('disabled') ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Download className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleViewEvaluation(evaluation)}
                                      title="View evaluation"
                                      disabled={viewEvaluationLoading === evaluation.studentId}
                                    >
                                      {viewEvaluationLoading === evaluation.studentId ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* View Evaluation Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>

        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto border-0 pt-0 mt-0">
          <div style={{ position: 'sticky', top: 0, zIndex: 100 }} className="h-10 flex justify-end bg-white pt-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleCloseViewDialog}
                    className="w-4 h-4 flex items-center justify-center rounded-full background-blue shadow hover:bg-blue mr-2 mt-2"
                    aria-label="Close"
                  >
                    X
                  </Button>
                </TooltipTrigger>

              </Tooltip>
            </TooltipProvider>
          </div>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Evaluation Details</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAsExcel}
                  className="border-green-500 text-green-700 hover:bg-green-100 hover:border-green-600 bg-white hover:text-black "
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Download as Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const total = selectedEvaluation?.questions?.length ?? 0
                    //console.log('Expand/Collapse clicked. Total questions:', total, 'Current open items:', viewOpenItems.length)
                    if (total === 0) return // Don't do anything if no questions

                    if (viewOpenItems.length === total) {
                      //console.log('Collapsing all items')
                      setViewOpenItems([])
                      setViewDialogExpanded(false)
                    } else {
                      const all = (selectedEvaluation?.questions ?? []).map((q: any) => `question-${q.id}`)
                      //console.log('Expanding all items:', all)
                      setViewOpenItems(all)
                      setViewDialogExpanded(true)
                    }
                  }}
                  className="border-blue-500 text-blue-700 hover:bg-blue-100 hover:border-blue-600 bg-white hover:text-black "
                >
                  {viewDialogExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Expand
                    </>
                  )}
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {viewEvaluationLoading !== null ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
              <span className="ml-4 text-purple-700">Loading evaluation details...</span>
            </div>
          ) : selectedEvaluation && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium text-gray-600">Candidate ID:</Label>
                  <p className="text-sm font-semibold text-gray-900">{selectedEvaluation.studentName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">Course Details:</Label>
                  <p className="text-sm font-semibold text-gray-900">{selectedEvaluation.courseDetails || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">Total Questions:</Label>
                  <p className="text-sm font-semibold text-gray-900">{selectedEvaluation.questions.length}</p>
                </div>
              </div>

              {/* Questions Details */}
              <div className="space-y-4">
                <p className="text-purple-700 mb-6">
                  Review each question and candidate responses with AI evaluation results.
                </p>
                <Accordion
                  type="multiple"
                  className="w-full space-y-4"
                  value={viewOpenItems}
                  onValueChange={(v) => {
                    const vals = v as string[]
                    //console.log('Accordion value changed:', vals)
                    setViewOpenItems(vals)
                    const total = selectedEvaluation?.questions?.length ?? 0
                    setViewDialogExpanded(total > 0 && vals.length === total)
                  }}
                >
                  {selectedEvaluation.questions.map((question: any, index: number) => (
                    <div key={question.id} className="border border-purple-200 rounded-lg bg-white">
                      {/* Always visible section - Question Stem, Answer Response, AI Feedback */}
                      <div className="p-4 space-y-4">
                        <div className="flex flex-col items-start w-full gap-3">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-md">
                              Question Stem
                            </span>
                          </div>
                          <div className="w-full">
                            <div
                              className="text-base font-medium text-gray-900 leading-relaxed pl-2 border-l-4 border-purple-400 prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: question.stem }}
                            />
                          </div>
                        </div>

                        <AccordionItem value={`question-${question.id}`} className="border-0">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AccordionTrigger className="px-4 py-2 hover:no-underline border-t border-purple-100">
                                  <span className="text-sm font-medium text-purple-700">
                                    Show Key Answer & Reference
                                  </span>
                                </AccordionTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" align="end">
                                Expand/collapse to show or hide the Key Answer & Reference
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <AccordionContent className="px-4 pb-4">
                            <div className="space-y-4">
                              <div className="bg-purple-50 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-purple-900 mb-2">Key Answer</h4>
                                {question.keyAnswer ? (
                                  <div
                                    className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: question.keyAnswer }}
                                  />
                                ) : (
                                  <div className="text-sm text-gray-500 italic">
                                    No key points available
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between py-2 px-4 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-6">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-600">Max Marks:</span>
                                    <span className="text-lg font-bold text-purple-700">{question.maxScore}</span>
                                  </div>
                                  <div className="h-4 w-px bg-gray-300"></div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-600">Reference:</span>
                                    <span className="text-sm text-gray-700">{question.reference}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>

                        <div className="space-y-2">
                          <Label className="text-purple-800 font-medium">
                            Answer Response:
                          </Label>
                          <div className="min-h-[100px] bg-white border-purple-200 border rounded-lg p-3">
                            <div className="text-gray-700 whitespace-pre-wrap">
                              {question.answer || 'No response provided'}
                            </div>
                          </div>
                        </div>

                        {question.feedback && (
                          <div className="space-y-3">
                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                              <h4 className="text-sm font-semibold text-blue-900 mb-2">AI Evaluation Feedback</h4>
                              <p className="text-sm text-gray-700 leading-relaxed">{question.feedback}</p>
                            </div>
                            <div className="flex items-center gap-4 py-2 px-4 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-600">Max Score:</span>
                                <span className="text-lg font-bold text-purple-700">{question.maxScore}</span>
                              </div>
                              <div className="h-4 w-px bg-gray-300"></div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-600">AI Score:</span>
                                <span className="text-lg font-bold text-green-700">{question.aiScore}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </Accordion>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={handleCloseViewDialog} className="w-200">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Response Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Response Saved</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-700">Essay responses for the candidate have been saved successfully.</p>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveDialogClose} className="w">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evaluation Result Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Evaluation Complete</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-700">Evaluation completed and scores are generated with feedbacks</p>
          </div>
          <DialogFooter>
            <Button onClick={handleDialogClose} className="w-100">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear All Confirmation Dialog */}
      <Dialog open={showClearConfirmDialog} onOpenChange={setShowClearConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Confirm Clear All</DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <p className="text-gray-700 text-base">
              You have unsaved changes on this page. Closing it now will result in data loss. Do you want to proceed?
            </p>
          </div>
          <DialogFooter className="flex gap-2 justify-center sm:justify-center">
            <Button
              onClick={clearAllAnswers}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            >
              Confirm
            </Button>
            <Button
              onClick={handleClearConfirmClose}
              variant="outline"
              className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 px-6"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Validation Error</DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <p className="text-gray-700 text-base">{validationMessage}</p>
          </div>
          <DialogFooter>
            <Button onClick={handleValidationDialogClose} className="w-full bg-blue-600 hover:bg-blue-700">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading Dialog */}
      <Dialog
        open={showLoadingDialog || isExporting}
        onOpenChange={(open) => {
          if (!open) {
            if (isExporting) {
              // Handle bulk export cancellation
              setExportAborted(true);
              if (abortControllerRef.current) {
                abortControllerRef.current.abort();
              }
              setIsExporting(false);
              setValidationMessage('Export cancelled by user');
              setShowValidationDialog(true);
            }

          }
        }}
      >
        <DialogContent className="p-8 bg-white rounded-lg shadow-xl max-w-md">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-black font-medium">
              {isExporting ? 'Exporting selected evaluations...' : 'Evaluating your essay responses...'}
            </p>
          </div>
        </DialogContent>
      </Dialog>
      {/* Back to Top Button */}
      {showBackToTop && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center space-y-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={scrollToTop}
                  className="h-12 w-12 rounded-full bg-blue-500 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 flex items-center justify-center"
                  aria-label="Go to top"
                >
                  <ArrowUp className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" align="center">
                Back to Top
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Label below the button */}
          <span className="text-sm font-medium text-black">Back to Top</span>
        </div>

      )}
      {/* Freeze UI overlay when loading or exporting */}
      {(showLoadingDialog || isExporting) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(255,255,255,0.6)',
            zIndex: 9999,
            cursor: 'not-allowed',
          }}
          aria-label="UI is frozen during evaluation/export"
        />
      )}
    </div>
  )
}

export default EssayEvaluationDetail
