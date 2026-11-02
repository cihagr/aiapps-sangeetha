import React, { useState, useEffect } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { Link, useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import{PageLoader} from "@/components/ui/loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Filter,
  Database,
  Brain,
  TrendingUp,
  Users,
  Eye,
  Edit,
  Trash2,
  Download,
  FileText,
  Edit3,
  Check,
  X,
  Hash,
  FileQuestion,
  MessageSquare,
  List,
  CheckCircle2,
  Target,
  AlertCircle,
  Sparkles,
  XCircle,
  Info,
  Plus,
  Trash,
  ListChecks,
} from "lucide-react";
import { getFromDB } from "@/api";
import { deleteQuestion, fetchDropdownOptions, getLearningObjectives, getChapters } from "@/api";
import { updateQuestion } from "@/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createAccordionScope } from "@radix-ui/react-accordion";

const QuestionRepository = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("repository");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editQuestion, setEditQuestion] = useState<any>(null);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState({
    options: ['', '', '', ''], // Error messages for each option
    correctAnswer: '', // Error message for correct answer
    questionStem: '', // Error message for question stem
    sampleAnswer: '', // Error message for sample answer
    keyPoints: [], // Error messages for key points (written response)
  });
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [questionType, setQuestionType] = useState("multiple-choice");
  const [selectedSourceType, setSelectedSourceType] = useState("0");
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  // Always default to "0" (All) for Question Type on navigation
  const [selectedQuestionType, setSelectedQuestionType] = useState(() => "0");
  const [taxonomyList, setTaxonomyList] = useState<string[]>([]);
  const [selectedTaxonomy, setSelectedTaxonomy] = useState("0");
  const [selectedRating, setSelectedRating] = useState(() =>
    sessionStorage.getItem("selectedRating") || "all"
  );
  // --- Creativity Level ---
  const [selectedCreativityLevel, setSelectedCreativityLevel] = useState("0");
  const [dropdownError, setDropdownError] = useState<string>("");
  // --- Study Domain (Chapter) ---
  const [chapters, setChapters] = useState<any[]>([]);
  const [currentBookName, setCurrentBookName] = useState('Book Based');
  const [bookName, setBookName] = useState('');
  // Always default to "0" (All) for Study Domain (Chapter) on navigation
  const [selectedChapter, setSelectedChapter] = useState(() => "0");
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersError, setChaptersError] = useState<string>("");

  // --- Learning Objective (LO) ---
  const [learningObjectives, setLearningObjectives] = useState<any[]>([]);
  // Always default to "0" (All) for Learning Objective on navigation
  const [selectedLO, setSelectedLO] = useState(() => "0");
  const [loLoading, setLoLoading] = useState(false);
  const [loError, setLoError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  
  const statsData = [
    {
      title: "Total Questions",
      value: "1,247",
      change: "+15% this month",
      icon: Database,
      valueColor: "#1c398e",
    },
    {
      title: "AI Generated",
      value: "892",
      change: "High quality",
      icon: Brain,
      valueColor: "#0d542b",
    },
    {
      title: "This Week",
      value: "47",
      change: "New questions",
      icon: TrendingUp,
      valueColor: "#59168b",
    },
    {
      title: "Contributors",
      value: "12",
      change: "Active authors",
      icon: Users,
      valueColor: "#7e2a0c",
    },
  ];

  const clearFilters = () => {
    setSelectedQuestionType("");
    setSelectedTaxonomy("");
    setSelectedLO("");
    setSelectedRating("all");
    setSelectedCreativityLevel("0"); // Clear creativity level filter
    sessionStorage.removeItem("selectedQuestionType");
    sessionStorage.removeItem("selectedTaxonomy");
    sessionStorage.removeItem("selectedLO");
    sessionStorage.removeItem("selectedRating");
  };

  type Question = {
    id: string;
    question?: string;
    type?: string;
    topic?: string;
    creativityLevel?: string;
    created?: string;
    questionrequestid?: string;
    [key: string]: any;
  };

  const [questions, setQuestions] = useState<Question[]>([]);
  const [searchText, setSearchText] = useState("");
  // Expose fetchData so it can be called after delete
  const fetchData = async (filters?: {
    searchText?: string;
    chapterCode?: string;
    questionType?: string;
    taxonomy?: string;
    learningObjective?: string;
    creativityLevel?: string; // Add creativityLevel to filters
    sourceType?: string;
  }) => {
    setLoading(true);
    // Resolve session codes: prefer `sessionStorage.user` (login response), then `userInfo` and individual keys
    let usercode = "";
    let custcode = "";
    let orgcode = "";
    try {
      const storedStr = sessionStorage.getItem('user') || sessionStorage.getItem('userInfo') || sessionStorage.getItem('userDetails') || sessionStorage.getItem('userData') || '{}';
      let stored: any = {};
      try { stored = JSON.parse(storedStr); } catch (e) { stored = { raw: storedStr }; }

      usercode = sessionStorage.getItem("usercode") || stored?.userCode || stored?.usercode || stored?.user || "";
      custcode = sessionStorage.getItem("custcode") || stored?.customerCode || stored?.custcode || stored?.cust_code || "";
      orgcode = sessionStorage.getItem("orgcode") || stored?.orgCode || stored?.orgcode || stored?.org_code || stored?.organizationCode || "";
    } catch (e) {
      usercode = "";
      custcode = "";
      orgcode = "";
    }
    // Only include filters if not "All" (value "0" or empty string)
    const chaptercode = filters?.chapterCode && filters.chapterCode !== "0" ? filters.chapterCode : "";
    // Convert dropdown labels (e.g., "Multiple Choice", "Remember") to 0 if not numeric
    const toNum = (val: any) => {
      const n = Number(val);
      return isNaN(n) ? 0 : n;
    };
    const questiontypeid = toNum(filters?.questionType && filters.questionType !== "0" ? filters.questionType : 0);
    const taxonomyid = toNum(filters?.taxonomy && filters.taxonomy !== "0" ? filters.taxonomy : 0);
    const locode = filters?.learningObjective && filters.learningObjective !== "0" ? filters.learningObjective : "";
    // booknameid should be a number, fallback to 2 (Cyber Risk default) or 0
    let booknameidRaw = sessionStorage.getItem("bookType") || sessionStorage.getItem("booknameid") || "2";
    let booknameid: number = toNum(booknameidRaw);
    
    // Convert selectedCreativityLevel to a number, default to 0 if "All Levels" or invalid
    const creativitylevel = toNum(filters?.creativityLevel && filters.creativityLevel !== "0" ? filters.creativityLevel : 0);
    const sourcetype = toNum(filters?.sourceType && filters.sourceType !== "0" ? filters.sourceType : 0);

    const input = {
      custcode: custcode,
      orgcode: orgcode,
      usercode: usercode,
      appcode: sessionStorage.getItem("appcode") || "IG",
      booknameid: booknameid,
      chaptercode: chaptercode,
      locode: locode,
      questiontypeid: questiontypeid,
      taxonomyid: taxonomyid,
      difficultlevelid: 0,
      questionrequestid: 0,
      questionid: 0,
      sourcetype: sourcetype,
      pagesize: 100,
      pageno: 1,
      usertypeid: 1,
      searchtext: filters?.searchText !== undefined ? filters.searchText : searchText,
      creativitylevel: creativitylevel, // Use the dynamic creativity level
      rating: 0,
    };

    // Helpful debug: log the resolved input sent to get_from_db
    // eslint-disable-next-line no-console
    console.debug('[QuestionRepository] get_from_db input ->', input);

    try {
      const data = await getFromDB(input);
      // eslint-disable-next-line no-console
      console.debug('[QuestionRepository] getFromDB response ->', data);
      if (!data) {
        // Backend returned null/empty — show clearer message
        setQuestions([]);
        setError('No questions found (API returned null).');
        setLoading(false);
        return;
      }
      if (data && data.question_xml) {
        // eslint-disable-next-line no-console
        console.debug('[QuestionRepository] question_xml ->', data.question_xml);
      }

      const fixLatex = (s: any) => typeof s === 'string'
        ? s.replace(/\\{2,}([()\[\]a-zA-Z])/g, '\\$1')
           .replace(/\\{2,}/g, '\\\\')
        : s;

      const fixQuestionObject = (obj: any) => {
        if (!obj || typeof obj !== 'object') return obj;
        const newObj = { ...obj };
        ['label', 'QuestionStatement', 'PartPrompt', 'CorrectAnswer', 'question', 'stem'].forEach(key => {
          if (newObj[key]) newObj[key] = fixLatex(newObj[key]);
        });
        Object.keys(newObj).forEach(key => {
           if (key.startsWith('FeedbackOption')) {
              newObj[key] = fixLatex(newObj[key]);
           }
        });
        return newObj;
      };

      let questionsArr: Question[] = [];
      // Try to handle both array-of-arrays and array-of-objects
      if (data && Array.isArray(data.question_xml)) {
        if (data.question_xml.length > 0 && Array.isArray(data.question_xml[0])) {
          // Array of arrays (old logic)
          questionsArr = data.question_xml
            .map((item: any) => {
              if (
                Array.isArray(item) &&
                item.length >= 11 &&
                typeof item[2] === "object"
              ) {
                return {
                  id: item[7] || item[0], // string ID for UI
                  numericId: item[0], // numeric ID for API
                  questionrequestid: item[1],
                  question: fixLatex(item[2]?.label ?? "No question text"),
                  type: item[6] ?? "Multiple Choice",
                  topic: item[12] ?? item[11] ?? "Unknown",
                  creativityLevel: item[15] ?? "Moderate",
                  created: "N/A",
                  userCode: item[3] || item[4] || item[5] || "Unknown", // User information from array
                  userName: item[11] || item[4] || item[5] || "Unknown", // User information from array
                  ...fixQuestionObject(item[2]),
                  MaxMarks: item[3]?? "N/A",
                  source: item[12]=="1"?"Book Based":"LLM",
                  study:item[13],
                  learningObjective:item[9],
                  taxonomyid:item[14],
                  creativitylevelname:item[18]==1?'Moderate':item[18]==2?'High':'Very High',
                  bookname:item[10],
                  taxonomy:item[8],
                };
              }
              return null;
            })
            .filter(Boolean);
        } else if (typeof data.question_xml[0] === "object") {
          // Array of objects (new logic)
          questionsArr = data.question_xml.map((item: any) => {
            const fixedItem = fixQuestionObject(item);
            return {
            id: fixedItem.id || fixedItem.questionid || fixedItem.questionId || Math.random().toString(36).slice(2),
            numericId: fixedItem.questionid || fixedItem.questionId || fixedItem.id || null,
            questionrequestid: fixedItem.questionrequestid || fixedItem.questionRequestId || "",
            question: fixedItem.label || fixedItem.question || fixedItem.stem || "No question text",
            type: fixedItem.type || fixedItem.questiontype || "Multiple Choice",
            topic: fixedItem.topic || fixedItem.topicname || "Unknown",
            creativityLevel: fixedItem.creativityLevel || fixedItem.difficulty || fixedItem.difficultylevel || "Moderate",
            created: fixedItem.created || fixedItem.createdAt || "N/A",
            userCode: fixedItem.usercode || fixedItem.userCode || fixedItem.createdBy || fixedItem.author || "Unknown",
            userName: fixedItem.username || fixedItem.userName || fixedItem.createdBy || fixedItem.author || "Unknown",
            creativitylevelname: fixedItem.creativityLevel == 1 ? 'Moderate' : fixedItem.creativityLevel == 2 ? 'High' : fixedItem.creativityLevel == 3 ? 'Very High' : 'Moderate', // Derive display name
            ...fixedItem
          };
          });
        }
      }
      //console.log('[QuestionRepository] questionsArr after API parsing:', questionsArr);
      //console.log('[QuestionRepository] Number of questions parsed:', questionsArr.length);
      
      setQuestions(questionsArr);
      if (!questionsArr.length) {
        setError("No questions found.");
      } else {
        setError(null);
      }
    } catch (err) {
      setError("Failed to load questions");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
  }, []);

  // Debug: Monitor questions state changes
  useEffect(() => {
    //console.log('[QuestionRepository] Questions state updated:', {
    //   count: questions.length,
    //   firstQuestion: questions[0]?.question || 'No questions',
    //   loading: loading,
    //   error: error
    // });
  }, [questions, loading, error]);

  // Optional: Manual refresh button for user
  // Place this in the UI where appropriate if desired

  useEffect(() => {
    // Ensure localStorage has custcode, orgcode, appcode for dropdown API
    try {
      const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
      if (userInfo.custCode) sessionStorage.setItem("custcode", userInfo.custCode);
      if (userInfo.orgCode) sessionStorage.setItem("orgcode", userInfo.orgCode);
      sessionStorage.setItem("appcode", "IG");
    } catch { }

    // Fetch dropdowns for taxonomy and question type
    const fetchDropdowns = async () => {
      try {
        const data = await fetchDropdownOptions();
        let taxonomy: string[] = [];
        let qtypes: string[] = [];
        data.forEach((item: any) => {
          let parsed = [];
          try {
            parsed = JSON.parse(item.jsonDetails);
          } catch (e) {
            parsed = [];
          }
          if (item.type === "taxonomy") {
            taxonomy = parsed.map((t: any) => t.taxonomy);
          }
          if (item.type === "QuestionType") {
            qtypes = parsed.map((q: any) => q.questiontype);
            if (!qtypes.includes("Scenario Based")) {
              qtypes.push("Scenario Based");
            }
          }
        });
        setTaxonomyList(taxonomy);
        setQuestionTypes(qtypes);
        
        
        if (!taxonomy.length || !qtypes.length) {
          setDropdownError("Dropdown data missing. Please check API response.");
        } else {
          setDropdownError("");
        }
      } catch (error) {
        setTaxonomyList([]);
        setQuestionTypes([]);
        setDropdownError("Failed to load dropdowns.");
      }
    };
    fetchDropdowns();
  }, []);
  // Get book code and name from URL or localStorage
  const getBookInfo = () => {
    // First try to get from URL parameters
    const params = new URLSearchParams(window.location.search);
    const bookCodeFromUrl = params.get('bookCode');
    
    // Then try localStorage
    const bookCodeFromStorage = sessionStorage.getItem('booknameid') || sessionStorage.getItem('bookType');
    const bookNameFromStorage = sessionStorage.getItem('bookTitle');
    
    // Default values if nothing found
    const bookCode = bookCodeFromUrl || bookCodeFromStorage || '2';
    const bookName = bookNameFromStorage || 'Book Based';
    
    return { bookCode, bookName };
  };

  // Fetch chapters for Study Domain dropdown
  useEffect(() => {
    const loadChapters = async () => {
      setChaptersLoading(true);
      setChaptersError("");
      try {
        const { bookCode, bookName } = getBookInfo();
        setCurrentBookName(bookName);
        //console.log('Fetching chapters for book code:', bookCode, 'Book name:', bookName);
        const result = await getChapters(bookCode);
        if (Array.isArray(result) && result.length > 0) {
          setChapters(result);
          setSelectedChapter(() => {
            const stored = sessionStorage.getItem("selectedChapter");
            if (stored && result.some(ch => ch.chapterCode === stored)) return stored;
            // Always default to "0" (All) if no valid stored value
            return "0";
          });
        } else {
          setChapters([]);
          setSelectedChapter("0");
        }
      } catch (err) {
        setChaptersError("Failed to load chapters");
        setChapters([]);
        setSelectedChapter("0");
      } finally {
        setChaptersLoading(false);
      }
    };
    loadChapters();
  }, []);

  // Fetch LOs when selectedChapter changes
  useEffect(() => {
    if (!selectedChapter) {
      setLearningObjectives([]);
      setSelectedLO("");
      return;
    }
    setLoLoading(true);
    setLoError("");
    setLearningObjectives([]);
    setSelectedLO("");
    const chapterCode = selectedChapter.trim();
    getLearningObjectives(chapterCode)
      .then((result) => {
        setLearningObjectives(result);
        const stored = sessionStorage.getItem("selectedLO");
        if (stored && result.some(lo => lo.loCode === stored)) {
          setSelectedLO(stored);
        } else if (result.length > 0) {
          setSelectedLO(result[0].loCode || "");
        }
      })
      .catch(() => {
        setLoError("Failed to load learning objectives");
        setLearningObjectives([]);
        setSelectedLO("");
      })
      .finally(() => setLoLoading(false));
  }, [selectedChapter]);

  // Persist Study Domain (Chapter)
  useEffect(() => {
    if (selectedChapter) sessionStorage.setItem("selectedChapter", selectedChapter);
  }, [selectedChapter]);

  // Persist Learning Objective
  useEffect(() => {
    if (selectedLO) sessionStorage.setItem("selectedLO", selectedLO);
  }, [selectedLO]);

  // Persist Taxonomy
  useEffect(() => {
    if (selectedTaxonomy) sessionStorage.setItem("selectedTaxonomy", selectedTaxonomy);
  }, [selectedTaxonomy]);

  // Enhanced validation function for edit dialog with comprehensive validation
  const handleSaveChanges = () => {
    const questionStemTextarea = document.querySelector('[data-question-stem-textarea]') as HTMLTextAreaElement;
    const optionTextareas = document.querySelectorAll('[data-option-textarea]') as NodeListOf<HTMLTextAreaElement>;
    const correctAnswerTextarea = document.querySelector('[data-correct-answer-textarea]') as HTMLTextAreaElement;
    const correctAnswerSelect = document.querySelector('[data-correct-answer-select]') as HTMLSelectElement;
    
    // Reset validation errors
    const newErrors = {
      options: ['', '', '', ''],
      correctAnswer: '',
      questionStem: '',
      sampleAnswer: '',
      keyPoints: [],
    };
    
    let hasErrors = false;
    
    if (correctAnswerSelect && optionTextareas.length === 4 && correctAnswerTextarea) {
      const selectedOption = correctAnswerSelect.value;
      const selectedIndex = ['A', 'B', 'C', 'D'].indexOf(selectedOption);
      const optionValues = Array.from(optionTextareas).map(textarea => textarea.value.trim());
      const correctAnswerText = correctAnswerTextarea.value.trim();
      const questionStemText = questionStemTextarea?.value.trim();
      
      // 1. Check if question stem is empty
      if (!questionStemText) {
        newErrors.questionStem = 'Question Stem cannot be empty.';
        hasErrors = true;
      }
      
      // 2. Check for empty options
      optionValues.forEach((value, index) => {
        if (!value) {
          newErrors.options[index] = 'This option cannot be empty.';
          hasErrors = true;
        }
      });
      
      // 3. Check if correct answer text is empty
      if (!correctAnswerText) {
        newErrors.correctAnswer = 'Correct Answer cannot be empty.';
        hasErrors = true;
      }
      
      // 4. Check for unique options (only if no empty options)
      if (!hasErrors) {
        const duplicateIndices = [];
        optionValues.forEach((value, index) => {
          const duplicateIndex = optionValues.findIndex((otherValue, otherIndex) => 
            otherIndex !== index && value.toLowerCase() === otherValue.toLowerCase()
          );
          if (duplicateIndex !== -1) {
            duplicateIndices.push(index);
          }
        });
        
        duplicateIndices.forEach(index => {
          newErrors.options[index] = 'Options should be different.';
          hasErrors = true;
        });
      }
      
      // 5. Check if correct answer matches any option
      if (correctAnswerText && !hasErrors) {
        const isCorrectAnswerPresentInValues = optionValues
          .map(value => value.toLowerCase())
          .includes(correctAnswerText.toLowerCase());
        
        if (!isCorrectAnswerPresentInValues) {
          newErrors.correctAnswer = 'Correct answer not present in options';
          hasErrors = true;
        }
      }
      
      // 6. Check if selected dropdown matches the correct answer text
      if (selectedOption && correctAnswerText && !hasErrors) {
        const selectedOptionText = optionValues[selectedIndex];
        if (selectedOptionText && selectedOptionText.toLowerCase() !== correctAnswerText.toLowerCase()) {
          newErrors.correctAnswer = 'Selected dropdown option does not match the correct answer text.';
          hasErrors = true;
        }
      }
    }
    
    // Validate sample answer
    const sampleAnswerTextarea = document.querySelector('[data-sample-answer-textarea]') as HTMLTextAreaElement;
    const updatedSampleAnswer = sampleAnswerTextarea?.value || '';
    if (!updatedSampleAnswer) {
      newErrors.sampleAnswer = 'Sample answer cannot be empty.';
      hasErrors = true;
    }
    
    // Validate key points
    const nonEmptyKeyPoints = keyPoints.filter(point => point.trim() !== '');
    if (nonEmptyKeyPoints.length === 0) {
      newErrors.keyPoints = ['At least one key point is required.'];
      hasErrors = true;
    }
    
    // Update validation errors state
    setValidationErrors(newErrors);
    
    // If validation passes, save changes and close dialog
    if (!hasErrors) {
      // Update the actual question data
      if (editQuestion && correctAnswerSelect && optionTextareas.length === 4 && correctAnswerTextarea && questionStemTextarea) {
        const updatedQuestionStem = questionStemTextarea.value.trim();
        const updatedOptions = Array.from(optionTextareas).map(textarea => textarea.value.trim());
        const selectedOption = correctAnswerSelect.value || 'A';
        const updatedCorrectAnswer = selectedOption + '. ' + correctAnswerTextarea.value.trim();
        
        // Update the selected question object
        const updatedQuestion = {
          ...editQuestion,
          question: updatedQuestionStem,
          QuestionStatement: updatedQuestionStem,
          values: updatedOptions,
          options: updatedOptions,
          CorrectAnswer: updatedCorrectAnswer,
          answer: updatedCorrectAnswer,
          KeyPoints: nonEmptyKeyPoints.length > 0 ? nonEmptyKeyPoints : []
        };
        
        // Save to backend
        const saveToBackend = async () => {
          try {
            const payload = {
              ...updatedQuestion,
              id: updatedQuestion.id,
              questionrequestid: updatedQuestion.questionrequestid,
              question: updatedQuestionStem,
              type: updatedQuestion.type,
              options: updatedOptions,
              correct: updatedCorrectAnswer,
            };
            await updateQuestion(payload);
            
            // Update local state
            setQuestions(prev => {
              const idx = prev.findIndex(q => q.id === updatedQuestion.id);
              if (idx === -1) return prev;
              const newArr = [...prev];
              newArr[idx] = { ...prev[idx], ...updatedQuestion };
              return newArr;
            });
            
            setEditOpen(false);
            setValidationErrors({ options: ['', '', '', ''], correctAnswer: '', questionStem: '', sampleAnswer: '', keyPoints: [] });
            setShowSuccessDialog(true);
          } catch (e) {
            setShowErrorDialog(true);
          }
        };
        
        saveToBackend();
      }
    } else {
      // Auto-scroll to first error position
      setTimeout(() => {
        // Find the first error element and scroll to it
        let firstErrorElement = null;
        
        // Check question stem first
        if (!questionStemTextarea?.value.trim()) {
          firstErrorElement = questionStemTextarea;
        }
        // Then check options
        else {
          for (let i = 0; i < newErrors.options.length; i++) {
            if (newErrors.options[i]) {
              firstErrorElement = optionTextareas[i];
              break;
            }
          }
        }
        // Finally check correct answer
        if (!firstErrorElement && newErrors.correctAnswer) {
          firstErrorElement = correctAnswerTextarea || correctAnswerSelect;
        }
        // Check sample answer
        if (!firstErrorElement && newErrors.sampleAnswer) {
          firstErrorElement = sampleAnswerTextarea;
        }
        // Check key points
        if (!firstErrorElement && newErrors.keyPoints.length > 0) {
          firstErrorElement = document.querySelector('[data-key-points-container]');
        }
        
        if (firstErrorElement) {
          firstErrorElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
          firstErrorElement.focus();
        }
      }, 100); // Small delay to ensure DOM is updated with error messages
    }
  };

  // Real-time validation when correct answer dropdown changes
  const handleCorrectAnswerChange = (value: string) => {
    const correctAnswerTextarea = document.querySelector('[data-correct-answer-textarea]') as HTMLTextAreaElement;
    const optionTextareas = document.querySelectorAll('[data-option-textarea]') as NodeListOf<HTMLTextAreaElement>;
    
    if (correctAnswerTextarea && optionTextareas.length === 4) {
      const selectedIndex = ['A', 'B', 'C', 'D'].indexOf(value);
      const optionValues = Array.from(optionTextareas).map(textarea => textarea.value.trim());
      const selectedOptionText = optionValues[selectedIndex];
      
      // Update the correct answer textarea with the selected option text
      if (selectedOptionText) {
        correctAnswerTextarea.value = selectedOptionText;
      }
      
      // Clear any existing validation errors for correct answer
      setValidationErrors(prev => ({
        ...prev,
        correctAnswer: '',
        questionStem: prev.questionStem || ''
      }));
    }
  };

  const [showErrorDialog, setShowErrorDialog] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteQuestionData, setDeleteQuestionData] = useState<{id: string, questionrequestid: string} | null>(null);

  const handleDelete = async (id: string, questionrequestid: string) => {
    setDeleteQuestionData({id, questionrequestid});
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!deleteQuestionData) return;
    
    const { id, questionrequestid } = deleteQuestionData;
    let usercode = "";
    try {
      const raw = sessionStorage.getItem('user') || sessionStorage.getItem('userInfo') || sessionStorage.getItem('usercode') || '';
      let parsed: any = {};
      try { parsed = JSON.parse(raw as string) || {}; } catch { parsed = {}; }
      usercode = sessionStorage.getItem('usercode') || parsed?.userCode || parsed?.usercode || parsed?.user || '';
    } catch { usercode = sessionStorage.getItem('usercode') || ''; }
    // Find the question object to get the numericId
    const q = questions.find(q => q.id === id);
    const questionid = q && q.numericId ? Number(q.numericId) : Number(id);
    const input = {
      questionid: questionid,
      questionrequestid: Number(questionrequestid),
      usercode: usercode,
    };
    
    try {
      const result = await deleteQuestion(input);
      if (result === true) {
        await fetchData(); // Refresh data from backend after delete
        setShowDeleteDialog(false);
        setDeleteQuestionData(null);
        setShowSuccessDialog(true);
      } else {
        setShowDeleteDialog(false);
        setDeleteQuestionData(null);
        setShowErrorDialog(true);
      }
    } catch (error) {
      setShowDeleteDialog(false);
      setDeleteQuestionData(null);
      setShowErrorDialog(true);
    }
  };

  const getCreativityLevelColor = (creativityLevel: string) => {
    switch (creativityLevel) {
      case "Moderate":
        return "bg-blue-100 text-blue-800";
      case "High":
        return "bg-purple-100 text-purple-800";
      case "Very High":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRatingColor = (rating: string) => {
    switch (rating.toLowerCase()) {
      case "good":
        return "bg-green-100 text-green-800";
      case "poor":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };


  const handleSelectQuestion = (questionId: string) => {
    //console.log('[QuestionRepository] handleSelectQuestion called with:', questionId);
    //console.log('[QuestionRepository] Current selectedQuestions:', selectedQuestions);
    setSelectedQuestions((prev) => {
      const newSelection = prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId];
      //console.log('[QuestionRepository] New selectedQuestions:', newSelection);
      return newSelection;
    });
  };

  // Export to Word handler (updated: if any checkboxes selected, export only those from table; else, export all from sessionStorage.questionGenResults)
  const handleExportToWord = async () => {
    try {
      let results = [];
      if (selectedQuestions.length > 0) {
        // Export only selected questions from the table
        results = questions.filter(q => selectedQuestions.includes(q.id));
      } else {
        // Export all visible questions in the table (not localStorage)
        results = questions;
      }
      results = results.filter(Boolean);
      if (!results.length) {
        window.alert('No questions to export.');
        return;
      }
      // Get book title from localStorage, fallback to 'questions'
      let bookTitle = sessionStorage.getItem('bookTitle') || 'questions';
      // Clean filename: remove illegal characters and replace spaces with underscores
      bookTitle = bookTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
      // Dynamically import docx
      const docx = await import('docx');
      const { Document, Packer, Paragraph, HeadingLevel } = docx;
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: 'Generated Questions',
                heading: HeadingLevel.HEADING_1
              }),
              ...results.map((q, idx) => {
                const options = Array.isArray(q.values) ? q.values : (Array.isArray(q.options) ? q.options : []);
                const feedbacks = [q.FeedbackOptionA, q.FeedbackOptionB, q.FeedbackOptionC, q.FeedbackOptionD];
                const correctAnswer = q.CorrectAnswer || q.answer || (typeof q.correct === 'number' && options[q.correct]) || '';
                const type = options.length > 0 ? "MC" : "WR";
                return [
                  new Paragraph({
                    text: `Type : ${type}`,
                    heading: HeadingLevel.HEADING_2
                  }),
                  new Paragraph(`${idx + 1}. ${q.label || q.Question || q.text || q.QuestionText || ''}`),
                  ...(options.length > 0
                    ? [
                      new Paragraph('Options:'),
                      ...options.map((opt, i) => {
                        const feedback = feedbacks[i]?.trim() || '';
                        const isCorrect = opt === correctAnswer;
                        const optionLabel = String.fromCharCode(65 + i); // A, B, C, D...
                        const optionText = `${isCorrect ? '*' : ''}${optionLabel}) ${opt}`;
                        const feedbackPrefix = feedback.toLowerCase().startsWith('correct') ? '~' : '@';
                        const feedbackText = feedback ? `${feedbackPrefix}${feedback}` : '';
                        return [
                          new Paragraph(optionText),
                          ...(feedbackText ? [new Paragraph(feedbackText)] : [])
                        ];
                      }).flat(),
                      new Paragraph(`Correct Answer: ${correctAnswer}`)
                    ]
                    : [
                      new Paragraph(`Sample Answer: ${correctAnswer}`),
                      new Paragraph(`Creativity Level: ${q.creativitylevelname}`)
                    ]),
                  //...(q.LearningObjective ? [new Paragraph(`Learning Objective: ${q.LearningObjective}`)] : []),
                  //...(q.ReferenceInfo ? [new Paragraph(`Reference Info: ${q.ReferenceInfo}`)] : []),
                  ...(q.creativitylevelname ? [new Paragraph(`Creativity Level: ${q.creativitylevelname}`)] : []),
                  new Paragraph('')
                ];
              }).flat()
            ]
          }
        ]
      });
      const blob = await Packer.toBlob(doc);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bookTitle}.docx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      window.alert('Failed to export to Word.');
    }
  };

  function handleGo() {
    //console.log('[QuestionRepository] handleGo called with:', {
    //   searchText,
    //   selectedChapter,
    //   selectedQuestionType,
    //   selectedTaxonomy,
    //   selectedLO,
    //   selectedCreativityLevel, // Include selectedCreativityLevel
    //   selectedSourceType
    // });
    
    // Log localStorage values for debugging
    //console.log('[QuestionRepository] localStorage values:', {
    //   selectedTaxonomy: sessionStorage.getItem('selectedTaxonomy'),
    //   taxonomyid: sessionStorage.getItem('taxonomyid'),
    //   bookType: sessionStorage.getItem('bookType'),
    //   booknameid: sessionStorage.getItem('booknameid'),
    //   usercode: sessionStorage.getItem('usercode'),
    //   custcode: sessionStorage.getItem('custcode'),
    //   orgcode: sessionStorage.getItem('orgcode'),
    //   appcode: sessionStorage.getItem('appcode'),
    //   selectedCreativityLevel: sessionStorage.getItem('selectedCreativityLevel') // Log creativity level
    // });
    
    fetchData({
      searchText,
      chapterCode: selectedChapter,
      questionType: selectedQuestionType=="Multiple Choice"?"1":selectedQuestionType=="Written Response"?"7":"0",
      taxonomy: selectedTaxonomy=="Remember"?"1":selectedTaxonomy=="Understand"?"2":selectedTaxonomy=="Apply"?"3":selectedTaxonomy=="Analyze"?"4":selectedTaxonomy=="Evaluate"?"5":selectedTaxonomy=="Create"?"6":"0",
      learningObjective: selectedLO,
      creativityLevel: selectedCreativityLevel, // Pass creativity level to fetchData
      sourceType: selectedSourceType,
    });
  }
  function handleSelectAll(questions: { [key: string]: any; id: string; question?: string; type?: string; topic?: string; creativityLevel?: string; created?: string; questionrequestid?: string; }[]): void {
    //console.log('[QuestionRepository] handleSelectAll called');
    //console.log('[QuestionRepository] Current selectedQuestions count:', selectedQuestions.length);
    //console.log('[QuestionRepository] Total questions count:', questions.length);
    
    if (selectedQuestions.length === questions.length) {
      //console.log('[QuestionRepository] Deselecting all questions');
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(questions.map(q => q.id));
    }
  }
  const handleEditClick = (question: any) => {
    setEditQuestion(question);
    
    // Initialize key points from the question
    if (question?.KeyPoints) {
      if (Array.isArray(question.KeyPoints)) {
        setKeyPoints(question.KeyPoints.length > 0 ? [...question.KeyPoints] : ['']);
      } else if (typeof question.KeyPoints === 'string') {
        try {
          const parsed = JSON.parse(question.KeyPoints);
          setKeyPoints(Array.isArray(parsed) && parsed.length > 0 ? parsed : ['']);
        } catch (e) {
          setKeyPoints(['']);
        }
      } else {
        setKeyPoints(['']);
      }
    } else {
      setKeyPoints(['']);
    }
    
    setEditOpen(true);
  };
  
  // Handle adding a new key point
  const handleAddKeyPoint = () => {
    setKeyPoints([...keyPoints, '']);
  };
  
  // Handle updating a key point
  const handleUpdateKeyPoint = (index: number, value: string) => {
    const newKeyPoints = [...keyPoints];
    newKeyPoints[index] = value;
    setKeyPoints(newKeyPoints);
    
    // Clear any existing validation error for this key point when user types
    if (validationErrors.keyPoints && validationErrors.keyPoints[index]) {
      const newKeyPointErrors = [...validationErrors.keyPoints];
      newKeyPointErrors[index] = '';
      setValidationErrors({
        ...validationErrors,
        keyPoints: newKeyPointErrors
      });
    }
  };
  
  // Handle removing a key point
  const handleRemoveKeyPoint = (index: number) => {
    if (keyPoints.length > 1) {
      const newKeyPoints = keyPoints.filter((_, i) => i !== index);
      setKeyPoints(newKeyPoints);
    }
  }

  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
const [bulkDeleteCount, setBulkDeleteCount] = useState(0);
const [showBulkDeleteResult, setShowBulkDeleteResult] = useState(false);

const handleBulkDeleteClick = () => {
  if (selectedQuestions.length === 0) {
    setBulkDeleteCount(0);
    setShowBulkDeleteResult(true);
    return;
  }
  setShowBulkDeleteDialog(true);
};

const handleBulkDeleteConfirm = async () => {
  setShowBulkDeleteDialog(false);
  let successCount = 0;
  let usercode = "";
  try {
    const raw = sessionStorage.getItem('user') || sessionStorage.getItem('userInfo') || sessionStorage.getItem('usercode') || '';
    let parsed: any = {};
    try { parsed = JSON.parse(raw as string) || {}; } catch { parsed = {}; }
    usercode = sessionStorage.getItem('usercode') || parsed?.userCode || parsed?.usercode || parsed?.user || '';
  } catch { usercode = sessionStorage.getItem('usercode') || ''; }
  for (const qid of selectedQuestions) {
    const q = questions.find(q => q.id === qid);
    if (!q) continue;
    const questionid = q.numericId ? Number(q.numericId) : Number(q.id);
    const input = {
      questionid: questionid,
      questionrequestid: Number(q.questionrequestid),
      usercode: usercode || sessionStorage.getItem('usercode') || '',
    };
    try {
      const result = await deleteQuestion(input);
      if (
        result === true ||
        (
          result &&
          typeof result === "object" &&
          result !== null &&
          "status" in result &&
          Array.isArray((result as any).status) &&
          (result as any).status?.[0]?.[0] === "S001"
        )
      ) {
        successCount++;
      }
    } catch (error) {}
  }
  setBulkDeleteCount(successCount);
  setSelectedQuestions([]);
  await fetchData();
  setShowBulkDeleteResult(true);
};

  return (
    <div className="min-h-screen bg-background">
      {/* <AppSidebar /> */}

      <div className="pl-63">
        {loading && (
          <PageLoader text="Loading questions..." />
        )}
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold">Question Repository</h1>

            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-purple-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs">✦</span>
                </div>
                <span className="text-sm text-purple-600 font-medium">Knowledge Base: {sessionStorage.getItem("bookTitle")}</span>
              </div>
              <Link to="/item-generation">
                <Button variant="ghost" size="sm" className="text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  Back to Knowledge Base
                </Button>
              </Link>
              {/* <ProfileDropdown /> */}
            </div>
          </div>
        </header>

        <main className="p-6 space-y-6">
          {/* Navigation Tabs */}
          <div className="flex justify-center mb-8">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 max-w-lg">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setActiveTab("generate");
                    navigate("/question-generator/cyber-risk");
                  }}
                  className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                    window.location.pathname === "/item-generation" || activeTab === "generate"
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  Generate Questions
                </button>
                <button
                  onClick={() => setActiveTab("repository")}
                  className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                    activeTab === "repository"
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Question Repository
                </button>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statsData.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <Card key={index} className="border border-border/40">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                        <p className="text-2xl font-bold" style={{ color: stat.valueColor, fontSize: '1.25rem' }}>
                          {stat.value}
                        </p>
                        <p className="text-xs text-muted-foreground">{stat.change}</p>
                      </div>
                      <Icon className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Filters & Search */}
          <Card className="border border-border/40">
            <CardContent className="p-6">
              <div className="space-y-4">
                {dropdownError && <div className="text-xs text-red-500">{dropdownError}</div>}
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Filter className="h-4 w-4" />
                  Filters & Search
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Source Type */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Source Type</label>
                    <Select
                      value={selectedSourceType}
                      onValueChange={setSelectedSourceType}
                      defaultValue="0"
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        <SelectItem value="1">{currentBookName}</SelectItem>
                        <SelectItem value="2">LLM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>


                  {/* Study Domain (Chapter) - Dynamic */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Study Domain</label>
                    <Select
                      value={selectedChapter}
                      onValueChange={val => setSelectedChapter(val)}
                      disabled={chaptersLoading || chapters.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={chaptersLoading ? "Loading..." : "Select study domain"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        {chapters.map((ch) => (
                          <SelectItem key={ch.chapterCode} value={ch.chapterCode}>
                            {ch.chapterName || ch.chapterCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {chaptersError && <div className="text-xs text-red-500">{chaptersError}</div>}
                  </div>

                  {/* Learning Objective - Dynamic */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Learning Objective</label>
                    <Select
                      value={selectedLO}
                      onValueChange={val => setSelectedLO(val)}
                      disabled={loLoading || learningObjectives.length === 0 || !selectedChapter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loLoading ? "Loading..." : (!selectedChapter ? "Select study domain first" : "All")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        {learningObjectives.map((lo) => (
                          <SelectItem key={lo.loCode} value={lo.loCode}>
                            {lo.loName || lo.loCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {loError && <div className="text-xs text-red-500">{loError}</div>}
                  </div>

                  {/* Taxonomy */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Taxonomy</label>
                    <Select
                      value={selectedTaxonomy}
                      onValueChange={setSelectedTaxonomy}
                      disabled={taxonomyList.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={taxonomyList.length === 0 ? "No data" : "Select taxonomy"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        {taxonomyList.map((taxonomy) => (
                          <SelectItem key={taxonomy} value={taxonomy}>
                            {taxonomy}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {dropdownError && <div className="text-xs text-red-500">{dropdownError}</div>}
                  </div>

                  {/* Question Type */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Question Type</label>
                    <Select
                      value={selectedQuestionType}
                      onValueChange={(val) => {
                        setSelectedQuestionType(val);
                        sessionStorage.setItem("selectedQuestionType", val);
                      }}
                      disabled={questionTypes.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={questionTypes.length === 0 ? "No data" : "Select question type"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        {questionTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Creativity Level */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Creativity Level</label>
                    <Select
                      value={selectedCreativityLevel}
                      onValueChange={(val) => {
                        setSelectedCreativityLevel(val);
                        sessionStorage.setItem("selectedCreativityLevel", val);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All Levels" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All Levels</SelectItem>
                        <SelectItem value="1">Moderate</SelectItem>
                        <SelectItem value="2">High</SelectItem>
                        <SelectItem value="3">Very High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Rating */}
                  {/*
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Rating</label>
                    <Select
                      value={selectedRating}
                      onValueChange={(val) => {
                        setSelectedRating(val);
                        sessionStorage.setItem("selectedRating", val);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select rating" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  */}
                </div>


                {/* Search Bar */}
                <div className="grid grid-cols-0 md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Search</label>
                    <input
                      type="text"
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter search text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleGo(); }}
                    />
                  </div>
                  <div >
                    <Button onClick={handleGo}
                    >
                      Go
                    </Button>
                  </div>
                </div>


              </div>
            </CardContent>
          </Card>


          {/* Questions Table */}
          <Card className="border border-border/40">
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-6 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{questions.length} Questions</span>
                  {error && <span className="text-xs text-red-500 ml-2">{error}</span>}
                </div>
                <div className="flex items-center gap-2">

                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={handleBulkDeleteClick}
                  disabled={selectedQuestions.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Selected
                </Button>
                  <Button variant="outline" size="sm" onClick={handleExportToWord}>
                    <FileText className="h-4 w-4 mr-1" />
                    Export to Word
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const [{ utils }, { saveAs }] = await Promise.all([
                        import('xlsx'),
                        import('file-saver')
                      ]);
                    
                      let results = selectedQuestions.length > 0
                        ? questions.filter(q => selectedQuestions.includes(q.id))
                        : questions;
                    
                      results = results.filter(Boolean);
                      if (!results.length) {
                        alert('No questions available to export.');
                        return;
                      }
                    
                      let bookTitle = sessionStorage.getItem('bookTitle') || 'questions';
                      bookTitle = bookTitle.replace(/[^a-zA-Z0-9\-_]/g, '_');
                    
                      const multipleChoiceRows = [];
                      const writtenResponseRows = [];
                    
                      const mapTaxonomy = (taxonomy) => {
                          switch (taxonomy) {
                              case 'Remember':
                                  return 1;
                              case 'Understand':
                                  return 2;
                              case 'Apply':
                                  return 3;
                              case 'Analyze':
                                  return 4;
                              case 'Evaluate':
                                  return 5;
                              case 'Create':
                                  return 6;
                              default:
                                  return 'N/A';
                          }
                      };

                      results.forEach(q => {
                        const correctAnswer = q.CorrectAnswer || q.answer || (typeof q.correct === 'number' && q.options?.[q.correct]) || '';
                        const type = q.type?.toLowerCase();
                    
                        if (type === 'multiple choice') {
                            const cleanOption = (opt: string) => {
                            return opt.replace(/^[A-D][\.\)]\s*/, '').trim();
                          };

                          const correctAnswerIndex = (() => {
                            if (typeof correctAnswer === 'string') {
                              const match = correctAnswer.trim().match(/^([A-D])/);
                              if (match) {
                                return ['A', 'B', 'C', 'D','E','F'].indexOf(match[1]) + 1;
                              }
                            }
                            return '';
                          })();

                          multipleChoiceRows.push({
                            'Question Identifier': q.id,
                            'Question Stem': q.label || '',
                            'Type': q.type || '',
                            'Max Score': q.MaxMarks || '',
                            'Option1': cleanOption(q.values?.[0] || ''),
                            'Option2': cleanOption(q.values?.[1] || ''),
                            'Option3': cleanOption(q.values?.[2] || ''),
                            'Option4': cleanOption(q.values?.[3] || ''),
                            'Correct Answer': correctAnswerIndex,
                            'Feedback Option1': q.FeedbackOptionA || '',
                            'Feedback Option2': q.FeedbackOptionB || '',
                            'Feedback Option3': q.FeedbackOptionC || '',
                            'Feedback Option4': q.FeedbackOptionD || '',
                            'Reference Info': q.ReferenceInfo || '',
                            'Source': q.source || '',
                            'Knowledge Base': q.bookname || '',
                            'User Details': q.userName || '',
                            'Study': q.study || '',
                            'Learning Objectives': q.learningObjective || '',
                            'Taxonomy': mapTaxonomy(q.taxonomy) || '',
                            'Creativity Level': q.creativitylevelname || '',
                          });
                        } else if (type === 'written response') {
                          writtenResponseRows.push({
                            'Question Identifier': q.id,
                            'Question Stem': q.label || '',
                            'Type': q.type || '',
                            'Max Score': q.MaxMarks || '',
                            'Correct Answer': correctAnswer||correctAnswer,
                            'Key Points': (q.KeyPoints || '').replace(/•\s*/g, '• ').replace(/~\s*/g, '~ ').replace(/\s*•/g, '\n•'),
                            'Reference Info': q.ReferenceInfo || '',
                            'Source': q.source || '',
                            'Knowledge Base': q.bookname || '',
                            'User Details': q.userName || '',
                            'Study': q.study || '',
                            'Learning Objectives': q.learningObjective || '',
                            'Taxonomy': mapTaxonomy(q.taxonomy) || '',
                            'Creativity Level': q.creativitylevelname || '',
                          });
                        }
                      });
                    
                      const wb = utils.book_new();
                    
                      const createSheetWithWidths = (data, sheetName) => {
                        const ws = utils.json_to_sheet(data);
                        const colWidths = Object.keys(data[0] || {}).map(key => ({
                          wch: Math.max(key.length, ...data.map(row => (row[key]?.toString().length || 0))) + 2
                        }));
                        ws['!cols'] = colWidths;
                        utils.book_append_sheet(wb, ws, sheetName);
                      };
                    
                      if (multipleChoiceRows.length) {
                        createSheetWithWidths(multipleChoiceRows, 'Multiple choice');
                      }
                    
                      if (writtenResponseRows.length) {
                        createSheetWithWidths(writtenResponseRows, 'Written Response');
                      }
                    
                      const { write } = await import('xlsx');
                      const arrayBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
                      saveAs(new Blob([arrayBuffer], { type: 'application/octet-stream' }), `${bookTitle}.xlsx`);
                    }}                    
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export to Excel
                  </Button>

                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      {/* Master checkbox for select all */}
                      {(() => {
                        const selectAllRef = React.useRef<HTMLInputElement>(null);
                        React.useEffect(() => {
                          if (selectAllRef.current) {
                            selectAllRef.current.indeterminate = selectedQuestions.length > 0 && selectedQuestions.length < questions.length;
                          }
                        }, [selectedQuestions, questions]);
                        return (
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={questions.length > 0 && selectedQuestions.length === questions.length}
                            onChange={(e) => {
                              //console.log('[QuestionRepository] Master checkbox changed:', e.target.checked);
                              // Only select all or clear all
                              if (e.target.checked) {
                                //console.log('[QuestionRepository] Selecting all via master checkbox');
                                setSelectedQuestions(questions.map(q => q.id));
                              } else {
                                //console.log('[QuestionRepository] Deselecting all via master checkbox');
                                setSelectedQuestions([]);
                              }
                            }}
                            aria-label="Select all questions"
                          />
                        );
                      })()}
                    </TableHead>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead className="w-48">Question ID</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>User Name</TableHead>
                    <TableHead className="w-20">Preview</TableHead>
                    <TableHead className="w-20">Edit</TableHead>
                    <TableHead className="w-20">Delete</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questions.map((question, index) => (
                    <TableRow key={question.id}>
                      <TableCell>
                        {/* Individual row checkbox */}
                        <input
                          type="checkbox"
                          checked={selectedQuestions.includes(question.id)}
                          onChange={() => handleSelectQuestion(question.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{question.id}</TableCell>
                      <TableCell className="max-w-md">
                        <p className="truncate">{question.question}</p>
                      </TableCell>
                      <TableCell>{question.type}</TableCell>
                      <TableCell>
                        <span style={{ color: "#7e2a0c", fontSize: '0.875rem' }}>
                          {question.userName || question.userCode || question.createdBy || 'Unknown'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                          title="Preview question"
                          aria-label={`Preview question ${question.id || ''}`}
                          onClick={() => { setPreviewQuestion(question); setPreviewOpen(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                          title="Edit question"
                          aria-label={`Edit question ${question.id || ''}`}
                          onClick={() => { setEditQuestion(question); setEditOpen(true); }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          title="Delete question"
                          aria-label={`Delete question ${question.id || ''}`}
                          onClick={() => handleDelete(question.id, question.questionrequestid)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>
      <QuestionPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} question={previewQuestion} />
      
      {/* Edit Question Modal */}
      <EditQuestionModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        question={editQuestion}
        onSave={async (updatedQuestion) => {
          // Construct payload expected by backend
          try {
            // Prefer the parent editQuestion (source used to open modal) for stable ids
            const source = editQuestion || updatedQuestion;
            const qObj = (updatedQuestion && updatedQuestion[2]) || (source && source[2]) || updatedQuestion || source || {};

            // Derive questionid and questionrequestid robustly
            const questionidRaw = source && (source[0] ?? source.id ?? source.questionid ?? source.numericId ?? null);
            const questionrequestidRaw = source && (source[1] ?? source.questionrequestid ?? null);

            let questionid = questionidRaw === null || questionidRaw === undefined ? null : Number(questionidRaw);
            const questionrequestid = questionrequestidRaw === null || questionrequestidRaw === undefined ? null : Number(questionrequestidRaw);

            // If questionid is still null, try to use numericId from the inner object (questionxml)
            if (questionid === null || isNaN(questionid)) {
              const numericFromQ = qObj && (qObj.numericId ?? qObj.numericID ?? qObj.numericid ?? qObj.numeric ?? qObj.id);
              if (numericFromQ !== null && numericFromQ !== undefined && !isNaN(Number(numericFromQ))) {
                questionid = Number(numericFromQ);
              } else {
                // Fallback: hardcode to 1 as requested if no numeric id can be derived
                questionid = 1;
              }
            }

            const questionxml = {
              ...qObj,
              QuestionStatement: updatedQuestion.QuestionStatement || qObj.QuestionStatement || qObj.label || qObj.question || '',
              CorrectAnswer: updatedQuestion.CorrectAnswer || qObj.CorrectAnswer || '',
              values: updatedQuestion.values || qObj.values || [],
              FeedbackOptionA: updatedQuestion.FeedbackOptionA || qObj.FeedbackOptionA || '',
              FeedbackOptionB: updatedQuestion.FeedbackOptionB || qObj.FeedbackOptionB || '',
              FeedbackOptionC: updatedQuestion.FeedbackOptionC || qObj.FeedbackOptionC || '',
              FeedbackOptionD: updatedQuestion.FeedbackOptionD || qObj.FeedbackOptionD || ''
            };

            // keypoints: for Multiple Choice backend expects null when none
            const rawKeyPoints = (updatedQuestion.KeyPoints || updatedQuestion.keyPoints || qObj.KeyPoints || qObj.keyPoints) || null;
            const keypoints = Array.isArray(rawKeyPoints) ? (rawKeyPoints.length > 0 ? rawKeyPoints : null) : (rawKeyPoints ? rawKeyPoints : null);

            const payload: any = {
              questionid: questionid,
              questionrequestid: questionrequestid,
              questionxml: questionxml,
              questiontype: updatedQuestion.type || qObj.type || updatedQuestion[5] || 'Multiple Choice',
              usercode: sessionStorage.getItem('userCode') || sessionStorage.getItem('usercode') || ((): string => {
                try {
                  const raw = sessionStorage.getItem('user') || sessionStorage.getItem('userInfo') || '{}';
                  const parsed = JSON.parse(raw as string) || {};
                  return parsed?.userCode || parsed?.usercode || parsed?.user || '';
                } catch { return '' }
              })(),
              keypoints: keypoints,
              marks: Number(updatedQuestion.MaxMarks || updatedQuestion[4] || qObj.marks || 1)
            };

            // Call API
            const res = await updateQuestion(payload);
            // Backend may respond with success object; refresh list
            await fetchData();
            setEditOpen(false);
            setShowSuccessDialog(true);
          } catch (err) {
            console.error('Failed to update question:', err);
            setShowErrorDialog(true);
          }
        }}
        validationErrors={{
          options: ['', '', '', ''],
          correctAnswer: '',
          questionStem: ''
        }}
        onCorrectAnswerChange={() => {}}
      />
      
      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Success
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Changes have been saved successfully.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSuccessDialog(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <X className="h-5 w-5" />
              Error
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Failed to save changes. Please try again.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowErrorDialog(false)} className="w-full">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Confirm Delete
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this question? This action cannot be undone.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteQuestionData(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirm Dialog */}
<Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-red-600">
        <Trash2 className="h-5 w-5" />
        Confirm Bulk Delete
      </DialogTitle>
    </DialogHeader>
    <div className="py-4">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to delete the selected questions? This action cannot be undone.
      </p>
    </div>
    <DialogFooter className="gap-2">
      <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)}>
        Cancel
      </Button>
      <Button
        variant="destructive"
        onClick={handleBulkDeleteConfirm}
        className="bg-red-600 hover:bg-red-700"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* Bulk Delete Result Dialog */}
<Dialog open={showBulkDeleteResult} onOpenChange={setShowBulkDeleteResult}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle className={`flex items-center gap-2 ${bulkDeleteCount > 0 ? "text-green-600" : "text-yellow-600"}`}>
        <CheckCircle2 className="h-5 w-5" />
        {bulkDeleteCount > 0
          ? "Bulk Delete Success"
          : "No Questions Selected"}
      </DialogTitle>
    </DialogHeader>
    <div className="py-4">
      <p className="text-sm text-muted-foreground">
        {bulkDeleteCount > 0
          ? `✅ Deleted ${bulkDeleteCount} question(s)`
          : "No questions selected for deletion."}
      </p>
    </div>
    <DialogFooter>
      <Button onClick={() => setShowBulkDeleteResult(false)} className="w-full">
        OK
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
    </div>
  );
};

export default QuestionRepository;

// QuestionPreviewModal component - matches QuestionResults.tsx exactly
function QuestionPreviewModal({ open, onClose, question }: { open: boolean; onClose: () => void; question: any }) {
  const [activeTab, setActiveTab] = useState("question");
  // Determine question type based on the question object
  const questionType = question?.type?.toLowerCase().includes('written') ? 'written-response' : 'multiple-choice';
  
  // Extract question data from the nested structure if it exists
  const questionData = question?.[2] || question || {};
  //console.log('Question Data:', questionData); // Debug log
  
  // Get question text with fallbacks
  const questionStem = questionData.label || questionData.QuestionStatement || questionData.question || questionData.text || question?.[2]?.label || '';
  
  // Get options - handle both array and object formats
  let options = [];
  if (Array.isArray(questionData.values)) {
    options = questionData.values.map(opt => (typeof opt === 'string' ? opt : JSON.stringify(opt)));
  } else if (Array.isArray(question?.[2]?.values)) {
    // Handle the case where values are in question[2].values
    options = question[2].values.map(opt => (typeof opt === 'string' ? opt : JSON.stringify(opt)));
  } else if (Array.isArray(questionData.options)) {
    options = questionData.options.map(opt => (typeof opt === 'string' ? opt : opt.text || JSON.stringify(opt)));
  } else {
    // If no options array is found, try to get options from the question object
    options = [
      questionData.OptionA || question?.[2]?.OptionA || '',
      questionData.OptionB || question?.[2]?.OptionB || '',
      questionData.OptionC || question?.[2]?.OptionC || '',
      questionData.OptionD || question?.[2]?.OptionD || ''
    ].filter(opt => opt !== '');
  }
  
  // Get correct answer with fallbacks
  const correctAnswer = questionData.CorrectAnswer || question?.[2]?.CorrectAnswer || questionData.answer || '';
  const correctAnswerPrefix = correctAnswer ? (correctAnswer.match(/^[A-D]\.?/)?.[0] || '') : '';
  const correctAnswerText = correctAnswer.replace(/^[A-D]\.?\s*/, '');
  
  // Get feedbacks with fallbacks
  const feedbacks = [
    questionData.FeedbackOptionA || question?.[2]?.FeedbackOptionA || '',
    questionData.FeedbackOptionB || question?.[2]?.FeedbackOptionB || '',
    questionData.FeedbackOptionC || question?.[2]?.FeedbackOptionC || '',
    questionData.FeedbackOptionD || question?.[2]?.FeedbackOptionD || ''
  ];

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
  };
  
  //console.log('Options:', options); // Debug log
  //console.log('Correct Answer:', correctAnswer); // Debug log
  
  // Dynamic key points that will be loaded from selected question
  const getKeyPointsFromQuestion = (question: any) => {
    if (!question) return [];
    
    // Try to get key points from various possible fields and formats
    if (question.KeyPoints) {
      if (Array.isArray(question.KeyPoints)) {
      return question.KeyPoints;
    }
      // Handle case where KeyPoints is a JSON string
      if (typeof question.KeyPoints === 'string') {
        try {
          const parsed = JSON.parse(question.KeyPoints);
          if (Array.isArray(parsed)) {
            // Handle both formats: array of strings or array of objects with 'point' property
            return parsed.map((item: any) => {
              if (typeof item === 'string') return item;
              if (item.point) return item.point;
              return JSON.stringify(item);
            });
          }
        } catch (e) {
          console.error('Error parsing KeyPoints:', e);
        }
      }
    }
    
    if (question.keyPoints) {
      if (Array.isArray(question.keyPoints)) {
      return question.keyPoints;
      }
      // Handle case where keyPoints is a JSON string
      if (typeof question.keyPoints === 'string') {
        try {
          const parsed = JSON.parse(question.keyPoints);
          if (Array.isArray(parsed)) {
            return parsed.map((item: any) => {
              if (typeof item === 'string') return item;
              if (item.point) return item.point;
              return JSON.stringify(item);
            });
          }
        } catch (e) {
          console.error('Error parsing keyPoints:', e);
        }
      }
    }
    
    // Default key points if none exist
    return [
      "Speculative risks - Include the potential for financial gain, which is incompatible with insurance principles.",
      "Pure risks - Only involve loss or no loss, making them insurable and predictable.",
      "Risk predictability - Insurance relies on statistical data to assess and cover pure risks.",
      "Financial gain exclusion - Insurance is designed to restore, not profit from losses.",
      "Statistical analysis - Pure risks can be analyzed and priced using historical data."
    ];
  };
  
  if (!question) return null;
  
  // Safe: use "Book Based" if value is "1", "LLM" if value is "2", fallback to label
const getSourceLabel = (question) => {
  // Try .source, .sourceType, or the raw value (item[12]) as your code provides
  if (question?.source) {
    if (typeof question.source === "string") {
      // If already a label, just return it
      if (question.source.toLowerCase().includes("llm")) return "LLM";
      if (question.source.toLowerCase().includes("book")) return "Book Based";
      // If raw value, convert
      if (question.source === "2") return "LLM";
      if (question.source === "1") return "Book Based";
    }
    // If number (unlikely, but just in case)
    if (question.source === 2) return "LLM";
    if (question.source === 1) return "Book Based";
  }
  // Fallback to other fields if available
  if (question?.sourceType === "2" || question?.sourceType === 2) return "LLM";
  if (question?.sourceType === "1" || question?.sourceType === 1) return "Book Based";
  // If you store the raw field (e.g. item[12]) somewhere else, check that too
  if (question?.rawSource === "2" || question?.rawSource === 2) return "LLM";
  if (question?.rawSource === "1" || question?.rawSource === 1) return "Book Based";
  // Fallback: if nothing matches, show "Book Based"
  return "Book Based";
};
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-6 border-b relative">
          <DialogClose asChild>
            {/* <button className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 p-1">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button> */}
          </DialogClose>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold text-gray-900">
                {questionType === 'written-response' ? 'Preview Written Response' : 'Preview Question'}
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                {questionType === "written-response"
                  ? "Review the complete written response question with sample answer, key points, and metadata details."
                  : "Review the complete question with all options, feedback and metadata details."
                }
              </p>
            </div>
          </div>
          <div className="flex border-b">
            <button
              className={`px-4 py-2 text-sm font-medium ${activeTab === "question" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
              onClick={() => handleTabClick("question")}
            >
              Question
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium ${activeTab === "feedback" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
              onClick={() => handleTabClick("feedback")}
            >
              Feedback
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-8 py-6">
          {activeTab === "question" && (
            <>
          {/* Question Stem */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Question Stem:</h3>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-gray-900 leading-relaxed">
                {questionStem|| "Why are speculative risks generally excluded from insurance coverage, and how does this differ from the treatment of pure risks?"}
              </p>
            </div>
          </div>

          {questionType === "written-response" ? (
            <>
              {/* Answer */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Answer:</h3>
                </div>

                <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-gray-900 leading-relaxed">
                    {question && question.CorrectAnswer ? 
                      question.CorrectAnswer.replace(/^[A-D]\.\s*/, '') : 
                      "Speculative risks involve the possibility of gain or loss, making them unsuitable for insurance coverage, which is designed for predictable and measurable risks like pure risks. Pure risks only involve the chance of loss or no loss, allowing insurers to calculate premiums and manage claims effectively."
                    }
                  </p>
                </div>
              </div>

              {/* Key Points */}
              {questionType === 'written-response' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                      <List className="w-4 h-4 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Key Points:</h3>
                  </div>

                  <div className="p-6 bg-green-50 border border-green-200 rounded-lg space-y-4">
                    {getKeyPointsFromQuestion(question).length > 0 ? (
                      getKeyPointsFromQuestion(question).map((point, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                            •
                          </div>
                          <p className="text-green-800 leading-relaxed">{point}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 italic">No key points available for this question.</p>
                    )}
                  </div>
                </div>
              )}
            </>
            ) : (
            <div className="space-y-8">
              {/* Options */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Options</h3>
                    <p className="text-sm text-gray-500">Configured answer choices</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {options && options.length > 0 ? (
                    options.map((option, i) => {
                      // Extract option text, handling different formats
                      let optionText = '';
                      if (typeof option === 'string') {
                        // Remove the leading letter and dot if present (e.g., "A. ")
                        //optionText = option.replace(/^[A-Z]\.?\s*/, '').trim();
                        optionText = option.replace(/^[A-D][\.\)]\s+/, '').trim();
                      } else if (option && typeof option === 'object') {
                        optionText = option.text || option.label || JSON.stringify(option);
                      } else {
                        optionText = String(option);
                      }
                      
                      const optionLetter = String.fromCharCode(65 + i);
                      
                      // Check if this option is the correct answer
                      const isCorrect = correctAnswer && (
                        correctAnswer.trim() === option.trim() || // Exact match
                        correctAnswer.startsWith(optionLetter + '.') || // Matches "A. "
                        correctAnswer.startsWith(optionLetter + ' ') || // Matches "A "
                        correctAnswer.includes(optionText) || // Contains the option text
                        optionText.includes(correctAnswer) // Option contains the correct answer
                      );
                      
                      return (
                        <div 
                          key={i}
                          className={`flex items-start gap-4 p-4 rounded-lg border ${
                            isCorrect ? 'border-2 border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                          } transition-colors`}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 mt-1 ${
                            isCorrect ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-white border border-gray-300 text-gray-700'
                          } shadow-sm`}>
                            {optionLetter}
                          </div>
                          <div className="flex-1">
                            <p className={`${isCorrect ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                              {optionText || `Option ${optionLetter}`}
                            </p>
                          </div>
                          {isCorrect && (
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 flex-shrink-0 mt-1">
                              <Check className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      No options available for this question.
                    </div>
                  )}
                </div>
              </div>

              {/* Correct Answer */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Target className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                    <h3 className="text-lg font-semibold text-gray-800">Correct Answer</h3>
                    <p className="text-sm text-gray-500">The correct option with explanation</p>
                </div>
              </div>

                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-purple-900 font-medium">
                    {correctAnswer || 'No correct answer specified'}
                </p>
                </div>
              </div>

              {/* Feedback */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                    <h3 className="text-lg font-semibold text-gray-800">Feedback</h3>
                    <p className="text-sm text-gray-500">Explanations for each option</p>
                    </div>
                  </div>

                <div className="space-y-4">
                  {options.map((option, i) => {
                    const optionLetter = String.fromCharCode(65 + i);
                    const isCorrect = correctAnswer && correctAnswer.startsWith(optionLetter);
                    const feedback = feedbacks[i] || (isCorrect 
                      ? 'Correct. This option is the right answer.' 
                      : `Incorrect. This option is not the correct answer.`);
                    
                    return (
                      <div 
                        key={i} 
                        className={`p-4 rounded-lg border ${
                          isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {isCorrect ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                    </div>
                    <div>
                            <span className="text-sm font-medium text-gray-600">Option {optionLetter}:</span>
                            <p className={`mt-1 ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                              {feedback}
                            </p>
                    </div>
                  </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          </>
          )}

          {activeTab === "feedback" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-orange-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Feedback:</h3>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                {feedbacks.map((feedback, index) => (
                  <p key={index} className="text-gray-900 leading-relaxed">
                    <strong>{String.fromCharCode(65 + index)}:</strong> {feedback}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Question Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                <FileQuestion className="w-4 h-4 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Question Details</h3>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    <p><strong>Type:</strong> {question?.type || 'N/A'}</p>
                    <p><strong>Marks:</strong> {question?.MaxMarks || 'N/A'}</p>
                    <p><strong>Source:</strong> {question?.source || 'N/A'}</p>
                    <p><strong>Knowledge Base:</strong> {question?.bookname || 'N/A'}</p>
                    <p><strong>Study:</strong> {question?.study || 'N/A'}</p>
                    <p><strong>Learning Objective:</strong> {question?.learningObjective || 'N/A'}</p>
                    <p><strong>Taxonomy:</strong> {question?.taxonomy || 'N/A'}</p>
                    <p><strong>Creativity Level:</strong> {question?.creativitylevelname || 'N/A'}</p>
                    <p className="md:col-span-2"><strong>Reference info:</strong> {question?.ReferenceInfo || 'N/A'}</p>
                    <p><strong>User Name:</strong> {question?.userName || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-10">
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: -25,
              background: "#fff",
              borderTop: "1px solid #eee",
              padding: "16px 24px",
              zIndex: 20,
              boxShadow: "0 -2px 8px rgba(0,0,0,0.02)"
            }}
            className="flex justify-end gap-3"
          >
          <Button
            variant="outline"
            onClick={onClose}
            className="flex items-center gap-2" title="Close"
          >
            <X className="w-4 h-4" />
            Close Preview
          </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Enhanced EditQuestionModal component matching QuestionResults.tsx design
// Helper function to get key points from question object
const getKeyPointsFromQuestion = (question: any) => {
  if (!question) return [];
  
  // Try to get key points from various possible fields and formats
  if (question.KeyPoints) {
    if (Array.isArray(question.KeyPoints)) {
      return question.KeyPoints;
    }
    // Handle case where KeyPoints is a JSON string
    if (typeof question.KeyPoints === 'string') {
      try {
        const parsed = JSON.parse(question.KeyPoints);
        if (Array.isArray(parsed)) {
          // Handle both formats: array of strings or array of objects with 'point' property
          return parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            if (item.point) return item.point;
            return JSON.stringify(item);
          });
        }
      } catch (e) {
        console.error('Error parsing KeyPoints:', e);
      }
    }
  }
  
  if (question.keyPoints) {
    if (Array.isArray(question.keyPoints)) {
      return question.keyPoints;
    }
    // Handle case where keyPoints is a JSON string
    if (typeof question.keyPoints === 'string') {
      try {
        const parsed = JSON.parse(question.keyPoints);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            if (item.point) return item.point;
            return JSON.stringify(item);
          });
        }
      } catch (e) {
        console.error('Error parsing keyPoints:', e);
      }
    }
  }
  
  return [];
};

interface FormData {
  questionStem: string;
  options: string[];
  correctAnswer: string;
  [key: string]: any; // Allow any additional string keys
}

interface FormErrors {
  questionStem?: string;
  options?: string[];
  correctAnswer?: string;
  keyPoints?: string[];
  [key: string]: any; // Allow any additional string keys for error messages
}

const EditQuestionModal: React.FC<{
  open: boolean;
  onClose: () => void;
  question: any;
  onSave: (updatedQuestion: any) => void;
  validationErrors: {
    options: string[];
    correctAnswer: string;
    questionStem: string;
  };
  onCorrectAnswerChange: (value: string) => void;
}> = ({ open, onClose, question, onSave, validationErrors, onCorrectAnswerChange }) => {
  const questionData = question?.[2] || question || {};
  // Store the original question data
  const [originalQuestion, setOriginalQuestion] = useState<any>(null);
  const [questionType, setQuestionType] = useState(question?.type || 'multiple-choice');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [formData, setFormData] = useState<FormData>({
    questionStem: '',
    options: ['', '', '', ''],
    correctAnswer: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  
  // Initialize form data when the modal opens or when the question changes
  useEffect(() => {
    if (open && question) {
      // Store the original question data
      setOriginalQuestion(question);
      
      const type = questionData.type || question.type || 'Multiple Choice';
      setQuestionType(type);
      
      const points = getKeyPointsFromQuestion(question);
      setKeyPoints(points.length > 0 ? points : type === 'Written Response' ? [''] : []);
      
      let rawOptions = [];
      if (Array.isArray(questionData.values)) {
        rawOptions = [...questionData.values];
      } else if (Array.isArray(question?.[2]?.values)) {
        rawOptions = [...question[2].values];
      } else if (Array.isArray(questionData.options)) {
        rawOptions = [...questionData.options];
      } else {
        rawOptions = [
          questionData.OptionA || '',
          questionData.OptionB || '',
          questionData.OptionC || '',
          questionData.OptionD || ''
        ];
      }
      // Ensure we have at least 4 empty strings for the form if needed
      while (rawOptions.length < 4) {
        rawOptions.push('');
      }

      const cleanedOptions = rawOptions.map(opt => cleanOptionText(opt));
      
      const initialFormData: any = {
        questionStem: questionData.label || questionData.QuestionStatement || questionData.question || '',
        options: cleanedOptions,
        correctAnswer: cleanOptionText(questionData.CorrectAnswer || questionData.answer || ''),
      };

      // Add feedback fields if they exist
      if (type === 'Multiple Choice') {
        ['A', 'B', 'C', 'D'].forEach(letter => {
          const feedbackKey = `FeedbackOption${letter}`;
          initialFormData[feedbackKey] = questionData[feedbackKey] || question[feedbackKey] || '';
        });
      } else if (type === 'Written Response' && (questionData.correctAnswer || questionData.ModelAnswer)) {
        initialFormData.correctAnswer = questionData.correctAnswer || questionData.ModelAnswer;
      }
      
      setFormData(initialFormData);
      setErrors({});
    }
  }, [open, question]);
  
  // Function to clean option text by removing any letter prefixes (A., B., etc.)
  const cleanOptionText = (text: string): string => {
    if (!text) return '';
    // Remove any leading letter followed by a dot and space (e.g., "A. ")
    return text.replace(/^[A-Za-z]\.\s*/, '');
  };

  // Scroll to errors when they occur
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      // Small delay to ensure the DOM is updated with error states
      const timer = setTimeout(() => {
        let firstErrorElement = null;
        
        // Check for question stem error
        if (errors.questionStem) {
          firstErrorElement = document.querySelector('#question-stem');
        } 
        // Check for option errors (for multiple choice)
        else if (errors.options && errors.options.some(err => err)) {
          const firstErrorIndex = errors.options.findIndex(err => err);
          if (firstErrorIndex !== -1) {
            firstErrorElement = document.querySelector(`#option-${firstErrorIndex}`);
          }
        }
        // Check for correct answer error (for both MC and written response)
        else if (errors.correctAnswer) {
          // Check for written response textarea first
          firstErrorElement = document.querySelector('#correct-answer-textarea') || 
                            document.querySelector('#correct-answer-select');
        }
        // Check for key points errors
        else if (errors.keyPoints && errors.keyPoints.some(kp => kp)) {
          const firstErrorIndex = errors.keyPoints.findIndex(kp => kp);
          if (firstErrorIndex !== -1) {
            firstErrorElement = document.querySelector(`#key-point-${firstErrorIndex}`);
          }
        }
        
        // Fallback to more generic selectors if specific element not found
        if (!firstErrorElement) {
          firstErrorElement = document.querySelector('.border-red-500, [class*="border-red-500"], .text-red-500');
        }
        
        // Scroll to the error element if found
        if (firstErrorElement) {
          firstErrorElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
          // Focus the element for better accessibility
          (firstErrorElement as HTMLElement)?.focus();
        }
      }, 100); // Small delay to ensure DOM is updated
      
      return () => clearTimeout(timer);
    }
  }, [errors]);

  // Handle dialog close
  const handleClose = () => {
    // Reset to original data when closing without saving
    if (originalQuestion) {
      const type = originalQuestion.type || 'Multiple Choice';
      setQuestionType(type);
      
      const points = getKeyPointsFromQuestion(originalQuestion);
      setKeyPoints(points.length > 0 ? points : type === 'Written Response' ? [''] : []);
      
      const rawOptions = Array.isArray(originalQuestion.values) ? [...originalQuestion.values] : 
                       (Array.isArray(originalQuestion.options) ? [...originalQuestion.options] : ['', '', '', '']);
      const cleanedOptions = rawOptions.map(opt => cleanOptionText(opt));
      
      const initialFormData: any = {
        questionStem: originalQuestion.label || originalQuestion.QuestionStatement || originalQuestion.question || '',
        options: cleanedOptions,
        correctAnswer: cleanOptionText(originalQuestion.CorrectAnswer || originalQuestion.answer || ''),
      };

      if (type === 'Multiple Choice') {
        ['A', 'B', 'C', 'D'].forEach(letter => {
          const feedbackKey = `FeedbackOption${letter}`;
          initialFormData[feedbackKey] = originalQuestion[feedbackKey] || '';
        });
      } else if (type === 'Written Response' && (originalQuestion.correctAnswer || originalQuestion.ModelAnswer)) {
        initialFormData.correctAnswer = originalQuestion.correctAnswer || originalQuestion.ModelAnswer;
      }
      
      setFormData(initialFormData);
    }
    
    // Close the dialog
    onClose();
  };
  
  if (!question) return null;
  
  // Handle adding a new key point
  const addKeyPoint = () => {
    // Only add a new key point if the last one isn't empty
    if (keyPoints.length === 0 || keyPoints[keyPoints.length - 1].trim() !== '') {
      setKeyPoints([...keyPoints, '']);
    }
  };
  
  // Handle updating a key point
  const updateKeyPoint = (index: number, value: string) => {
    const newKeyPoints = [...keyPoints];
    newKeyPoints[index] = value;
    
    // If the key point is being cleared and it's the last one, remove it
    if (value.trim() === '' && index === newKeyPoints.length - 1 && newKeyPoints.length > 1) {
      newKeyPoints.pop();
    }
    
    setKeyPoints(newKeyPoints);
    
    // Clear any key points errors when user types
    if (errors.keyPoints) {
      setErrors(prev => ({
        ...prev,
        keyPoints: undefined
      }));
    }
  };

  // Handle input changes
  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (field.startsWith('FeedbackOption') && errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    } else if (field === 'options' && errors.options) {
      // For options, we need to clear the entire options error array
      const newErrors = { ...errors };
      delete newErrors.options;
      setErrors(newErrors);
    } else if (errors[field as keyof typeof errors]) {
      // For other fields
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  // Handle option changes
  const handleOptionChange = (index: number, value: string) => {
    // Clean the input value by removing any letter prefixes
    const cleanedValue = value.replace(/^[A-Za-z]\.\s*/, '');
    
    const newOptions = [...formData.options];
    newOptions[index] = cleanedValue;
    
    // Update form data
    setFormData(prev => ({
      ...prev,
  options: newOptions
    }));
    
    // Clear the specific option error if it exists
    if (errors.options?.[index]) {
      const newOptionErrors = [...(errors.options || [])];
      newOptionErrors[index] = '';
      
      // If all option errors are cleared, remove the options from errors
      if (newOptionErrors.every(err => !err)) {
        const newErrors = { ...errors };
        delete newErrors.options;
        setErrors(newErrors);
      } else {
        setErrors(prev => ({
          ...prev,
          options: newOptionErrors
        }));
      }
    }

    // Sync correct answer text if this option was the selected correct answer
    setFormData(prev => {
      const currentCorrect = prev.correctAnswer || '';
      // If currentCorrect matches this option (case-insensitive), update it
      if (currentCorrect && currentCorrect.trim().toLowerCase() === cleanedValue.trim().toLowerCase()) {
        // no change needed
        return prev;
      }

      // If the previous correct answer matched the old option value, replace it with the new one
      const oldOption = prev.options[index] || '';
      if (oldOption && currentCorrect && oldOption.trim().toLowerCase() === currentCorrect.trim().toLowerCase()) {
        const updatedCorrect = cleanedValue;
        return { ...prev, correctAnswer: updatedCorrect };
      }

      return prev;
    });
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    // Validate question stem
    if (!formData.questionStem.trim()) {
      newErrors.questionStem = 'Question stem is required';
    }
    
    // Validate key points for written response
    if (questionType === 'Written Response' && keyPoints.length > 0) {
      const keyPointErrors: string[] = [];
      const seen = new Set<string>();
      let hasEmpty = false;
      
      keyPoints.forEach((point, index) => {
        const trimmed = point.trim();
        if (trimmed === '') {
          keyPointErrors[index] = 'Key point cannot be empty';
          hasEmpty = true;
        } else if (seen.has(trimmed.toLowerCase())) {
          keyPointErrors[index] = 'Duplicate key point';
        } else {
          seen.add(trimmed.toLowerCase());
        }
      });
      
      if (hasEmpty || keyPointErrors.length > 0) {
        newErrors.keyPoints = keyPointErrors;
      }
    }

    // For multiple choice questions
    if (questionType === 'Multiple Choice') {
      const optionErrors: string[] = [];
      const uniqueOptions = new Map<string, number>(); // Track first occurrence of each option
      let hasEmptyOption = false;
      
      // Filter out empty options for validation
      const nonEmptyOptions = formData.options.filter(opt => opt.trim() !== '');
      
      // Check if we have at least 2 options
      if (nonEmptyOptions.length < 2) {
        formData.options.forEach((_, index) => {
          optionErrors[index] = 'At least 2 options are required';
        });
        hasEmptyOption = true;
      } else {
        // First pass: Check for empty options
        formData.options.forEach((opt, index) => {
          const trimmedOpt = opt.trim();
          if (!trimmedOpt) {
            optionErrors[index] = 'Option cannot be empty';
            hasEmptyOption = true;
          } else {
            // Store the first occurrence of this option (case-insensitive)
            const lowerOpt = trimmedOpt.toLowerCase();
            if (!uniqueOptions.has(lowerOpt)) {
              uniqueOptions.set(lowerOpt, index);
            }
          }
        });
        
        // Second pass: Check for duplicates (only if no empty options)
        if (!hasEmptyOption) {
          formData.options.forEach((opt, index) => {
            const trimmedOpt = opt.trim();
            if (trimmedOpt) {
              const lowerOpt = trimmedOpt.toLowerCase();
              const firstOccurrence = uniqueOptions.get(lowerOpt);
              if (firstOccurrence !== undefined && firstOccurrence !== index) {
                optionErrors[index] = 'Duplicate option';
              }
            }
          });
        }
      }
      
      // Only set options errors if there are any
      if (optionErrors.some(err => err)) {
        newErrors.options = optionErrors;
      }

      // Validate correct answer for multiple choice
      if (!formData.correctAnswer) {
        newErrors.correctAnswer = 'Please select a correct answer';
      } else if (nonEmptyOptions.length > 0) {
        const isAnswerValid = nonEmptyOptions.some(opt => 
          opt.trim().toLowerCase() === formData.correctAnswer.trim().toLowerCase()
        );
        
        if (!isAnswerValid) {
          newErrors.correctAnswer = 'Correct answer must match one of the options';
        }
      }

      // Validate feedback for each option
      const feedbackValues: string[] = [];
      for (let i = 0; i < formData.options.length; i++) {
        const optionLetter = String.fromCharCode(65 + i);
        const feedbackKey = `FeedbackOption${optionLetter}`;
        const feedback = formData[feedbackKey] || '';
        // Treat 'Correct.' or 'Incorrect.' (with no explanatory text) as empty
        const suffix = feedback.replace(/^(Correct\.|Incorrect\.)\s*/i, '').trim();
        if (!suffix) {
          newErrors[feedbackKey] = 'Feedback cannot be empty';
        }
        feedbackValues.push(feedback.trim().toLowerCase());
      }

      // Check for duplicate feedbacks
      const feedbackCounts = feedbackValues.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      }, {});

      for (let i = 0; i < formData.options.length; i++) {
        const optionLetter = String.fromCharCode(65 + i);
        const feedbackKey = `FeedbackOption${optionLetter}`;
        const feedback = (formData[feedbackKey] || '').trim().toLowerCase();
        if (feedbackCounts[feedback] > 1) {
          newErrors[feedbackKey] = 'Feedback cannot be duplicated';
        }
      }
    } else if (questionType === 'Written Response') {
      // Validate answer for written response
      if (!formData.correctAnswer || !formData.correctAnswer.trim()) {
        newErrors.correctAnswer = 'Answer is required for written response';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // Handle removing a key point
  const removeKeyPoint = (index: number) => {
    const newKeyPoints = keyPoints.filter((_, i) => i !== index);
    setKeyPoints(newKeyPoints);
    
    // Clear key points errors if all key points are now valid
    if (errors.keyPoints) {
      const hasEmptyOrDuplicate = validateKeyPoints(newKeyPoints);
      if (!hasEmptyOrDuplicate) {
        setErrors(prev => ({
          ...prev,
          keyPoints: undefined
        }));
      }
    }
  };
  
  // Validate key points (returns true if there are validation errors)
  const validateKeyPoints = (points: string[]): boolean => {
    if (points.length === 0) return false; // No key points is valid
    
    const seen = new Set<string>();
    let hasEmpty = false;
    
    for (const point of points) {
      const trimmed = point.trim();
      if (trimmed === '') {
        hasEmpty = true;
        break;
      }
      if (seen.has(trimmed.toLowerCase())) {
        return true; // Duplicate found
      }
      seen.add(trimmed.toLowerCase());
    }
    
    return hasEmpty;
  };
  
  // Update the question object with key points and feedback when saving
  const handleSave = () => {
    // For multiple choice, filter out any empty options before validation
    // const nonEmptyOptions = questionType === 'Multiple Choice' 
    //   ? formData.options.filter(opt => opt.trim() !== '')
    //   : formData.options;
    
    // Update form data with non-empty options for multiple choice
    // if (questionType === 'Multiple Choice') {
    //   setFormData(prev => ({
    //     ...prev,
    //     options: nonEmptyOptions.length > 0 ? nonEmptyOptions : prev.options
    //   }));
    // }

    if (!validateForm()) {
      return; // Don't proceed if validation fails
    }
    
    // Filter out any empty key points
    const filteredKeyPoints = keyPoints.filter(point => point.trim() !== '');
    
    // Create base updated question object
    const updatedQuestion: any = {
      ...question,
      QuestionStatement: formData.questionStem.trim(),
      type: questionType,
      // Always include key points, even if empty
      KeyPoints: filteredKeyPoints,
      keyPoints: filteredKeyPoints, // Include both variations for compatibility
    };

    // Handle question type specific fields
    if (questionType === 'Multiple Choice') {
      // For multiple choice, include options and feedback
      updatedQuestion.values = [...formData.options];
      updatedQuestion.CorrectAnswer = formData.correctAnswer.trim();
      
      // Include feedback fields if they exist
      ['A', 'B', 'C', 'D'].forEach(letter => {
        const feedbackKey = `FeedbackOption${letter}`;
        if (formData[feedbackKey] !== undefined) {
          updatedQuestion[feedbackKey] = formData[feedbackKey];
        }
      });
    } else if (questionType === 'Written Response') {
      // For written response, include the model answer and key points
      updatedQuestion.CorrectAnswer = formData.correctAnswer.trim();
      updatedQuestion.ModelAnswer = formData.correctAnswer.trim();
      updatedQuestion.values = []; // Clear any multiple choice options
      
      // Filter out any empty key points before saving
      const nonEmptyKeyPoints = keyPoints.filter(point => point.trim() !== '');
      updatedQuestion.KeyPoints = nonEmptyKeyPoints;
      updatedQuestion.keyPoints = nonEmptyKeyPoints;
    }
    
    onSave(updatedQuestion);
  };

  // Use formData for all form fields
  const { questionStem, options, correctAnswer } = formData;
  
  // Extract correct answer prefix (A., B., C., D.)
  const correctAnswerPrefix = correctAnswer.match(/^[A-D]\./)?.[0] || 'A.';
  const correctAnswerText = correctAnswer.replace(/^[A-D]\.\s*/, '');

  // Safe: use "Book Based" if value is "1", "LLM" if value is "2", fallback to label
  const getSourceLabel = (question: any) => {
    // Try .source, .sourceType, or the raw value (item[12]) as your code provides
    if (question?.source) {
      if (typeof question.source === "string") {
        // If already a label, just return it
        if (question.source.toLowerCase().includes("llm")) return "LLM";
        if (question.source.toLowerCase().includes("book")) return "Book Based";
        // If raw value, convert
        if (question.source === "2") return "LLM";
        if (question.source === "1") return "Book Based";
      }
      // If number (unlikely, but just in case)
      if (question.source === 2) return "LLM";
      if (question.source === 1) return "Book Based";
    }
    // Fallback to other fields if available
    if (question?.sourceType === "2" || question?.sourceType === 2) return "LLM";
    if (question?.sourceType === "1" || question?.sourceType === 1) return "Book Based";
    // If you store the raw field (e.g. item[12]) somewhere else, check that too
    if (question?.rawSource === "2" || question?.rawSource === 2) return "LLM";
    if (question?.rawSource === "1" || question?.rawSource === 1) return "Book Based";
    // Fallback: if nothing matches, show "Book Based"
    return "Book Based";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold text-gray-900">
                {questionType?.toLowerCase().includes("written")
                  ? "Edit Written Response"
                  : "Edit Multiple Choice"}
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                Modify the question content, options, feedback, and metadata below.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-8 py-6">
          {/* Question Stem */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Question Stem</h3>
            </div>

            <Textarea
              value={questionStem}
              onChange={(e) => handleInputChange('questionStem', e.target.value)}
              className={`min-h-[100px] text-gray-900 bg-gray-50 resize-none ${
                errors.questionStem ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
              }`}
              placeholder="Enter your question here..."
              data-question-stem-textarea
            />
            {errors.questionStem && (
              <p className="text-red-500 text-sm mt-1">{errors.questionStem}</p>
            )}
          </div>

          {/* Options - Only show for multiple-choice questions */}
          {questionType !== 'Written Response' && (
            <>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <Label className="text-lg font-semibold text-gray-800">Options</Label>
                    <p className="text-sm text-gray-500">Configure answer choices</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {options.map((opt, index) => {
                    const optionLetter = String.fromCharCode(65 + index); // A, B, C, D
                    return (
                      <div key={index} className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-sm font-medium text-blue-700 flex-shrink-0">
                          {optionLetter}.
                        </div>
                        <div className="flex-1">
                          <Input
                            value={opt}
                            onChange={(e) => handleOptionChange(index, e.target.value)}
                            className={`w-full ${errors.options?.[index] ? 'border-red-500' : ''}`}
                            placeholder={`Enter option`}
                          />
                          {errors.options?.[index] && (
                            <p className="text-red-500 text-sm mt-1">{errors.options[index]}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Correct Answer Section */}
                <div className="mt-8 space-y-4" id="correct-answer-section">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Correct Answer</h3>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center text-sm font-medium text-green-700 flex-shrink-0">
                      ✓
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border rounded-md overflow-hidden w-full">
                          <div className="px-3 py-2 bg-gray-100 text-sm font-medium text-gray-700 border-r whitespace-nowrap">
                            {formData.options.findIndex(opt => opt === formData.correctAnswer) !== -1 
                              ? String.fromCharCode(65 + formData.options.findIndex(opt => opt === formData.correctAnswer))
                              : 'A'}
                          </div>
                          <input
                            type="text"
                            value={formData.correctAnswer || ''}
                            onChange={(e) => {
                              handleInputChange('correctAnswer', e.target.value);
                              if (onCorrectAnswerChange) {
                                onCorrectAnswerChange(e.target.value);
                              }
                            }}
                            className={`flex-1 px-3 py-2 outline-none ${errors.correctAnswer ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="Enter correct answer"
                          />
                        </div>
                      </div>
                      
                      {errors.correctAnswer && (
                        <p className="text-red-500 text-sm mt-1">{errors.correctAnswer}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Answer Section - Only for Written Response */}
          {questionType === 'Written Response' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Answer</h3>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <Textarea
                  id="correct-answer-textarea"
                  value={formData.correctAnswer || ''}
                  onChange={(e) => {
                    handleInputChange('correctAnswer', e.target.value);
                    if (onCorrectAnswerChange) {
                      onCorrectAnswerChange(e.target.value);
                    }
                    // Clear error when user starts typing
                    if (errors.correctAnswer) {
                      setErrors(prev => ({
                        ...prev,
                        correctAnswer: ''
                      }));
                    }
                  }}
                  className={`min-h-[150px] text-gray-900 bg-white resize-none border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 ${errors.correctAnswer ? 'border-red-500' : ''}`}
                  placeholder="Enter the model answer for this question..."
                />
                {errors.correctAnswer && (
                  <p className="text-red-500 text-sm mt-2">{errors.correctAnswer}</p>
                )}
              </div>

              {/* Key Points Section */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                    <ListChecks className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <Label className="text-lg font-semibold text-gray-800">Key Points</Label>
                    <p className="text-sm text-gray-500">Add key points that should be included in the answer</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {keyPoints.length > 0 ? (
                    keyPoints.map((point, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="flex-1">
                          <Input
                            value={point}
                            onChange={(e) => updateKeyPoint(index, e.target.value)}
                            placeholder={`Key point ${index + 1}`}
                            className={`w-full ${errors.keyPoints?.[index] ? 'border-red-500' : ''}`}
                          />
                          {errors.keyPoints?.[index] && (
                            <p className="mt-1 text-sm text-red-500">
                              {errors.keyPoints[index]}
                            </p>
                          )}
                        </div>
                        {keyPoints.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeKeyPoint(index)}
                            className="text-gray-400 hover:text-red-500 mt-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 italic">No key points added yet</div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    onClick={addKeyPoint}
                    disabled={keyPoints.length > 0 && keyPoints[keyPoints.length - 1]?.trim() === ''}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Key Point
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Feedback Section - Only for Multiple Choice */}
          {questionType !== 'Written Response' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <Label className="text-lg font-semibold text-gray-800">Feedback</Label>
                  <p className="text-sm text-gray-500">Provide explanations for each option</p>
                </div>
              </div>

                  <div className="space-y-6">
                {options.map((option, index) => {
                  const optionLetter = String.fromCharCode(65 + index);
                  const feedbackKey = `FeedbackOption${optionLetter}`;
                  const isCorrect = formData.correctAnswer === option;
                  const full = formData[feedbackKey] || '';
                  const match = full.trim().match(/^(Correct\.|Incorrect\.)\s*(.*)$/i);
                  const prefix = match ? match[1] : '';
                  const suffix = match ? match[2] : full;
                  
                  return (
                    <div key={optionLetter} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            isCorrect ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {optionLetter}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">
                            {isCorrect ? 'Correct Answer' : 'Option ' + optionLetter}
                          </span>
                        </div>
                        {isCorrect && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Check className="w-3 h-3 mr-1" /> Correct
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 items-start">
                        <div data-feedback-prefix={optionLetter} className={`min-w-[110px] text-sm font-medium p-2 rounded ${prefix.toLowerCase().startsWith('correct') ? 'text-green-700 bg-green-100 border border-green-200' : 'text-red-700 bg-red-100 border border-red-200'}`}>
                          {prefix || (isCorrect ? 'Correct.' : 'Incorrect.')}
                        </div>
                        <Textarea
                          defaultValue={suffix}
                          onChange={(e) => {
                            const newSuffix = e.target.value.trim();
                            const newFull = ((prefix || (isCorrect ? 'Correct.' : 'Incorrect.')) + ' ' + newSuffix).trim();
                            handleInputChange(feedbackKey, newFull);
                          }}
                          className={`flex-1 min-h-[80px] resize-none border-gray-200 focus:border-orange-400 focus:ring-orange-100 bg-white ${errors[`FeedbackOption${optionLetter}`] ? 'border-red-500' : ''}`}
                          placeholder={`Enter feedback for option ${optionLetter}...`}
                        />
                      </div>
                      {errors[`FeedbackOption${optionLetter}`] && <p className="text-red-500 text-sm mt-1">{errors[`FeedbackOption${optionLetter}`]}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Question Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                <FileQuestion className="w-4 h-4 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Question Details</h3>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 text-sm">
                {/* Column 1 */}
                <div className="space-y-4">
                  <p><strong>Type:</strong> {question?.type || 'N/A'}</p>
                  <p><strong>Source:</strong> {getSourceLabel(question) || 'N/A'}</p>
                  <p><strong>Study:</strong> {question?.study || 'N/A'}</p>
                  <p><strong>Taxonomy:</strong> {question?.taxonomy || 'N/A'}</p>
                  <p><strong>Reference info:</strong> {question?.ReferenceInfo || 'N/A'}</p>
                  <p><strong>User Name:</strong> {question?.userName || 'N/A'}</p>
              </div>
                {/* Column 2 */}
                <div className="space-y-4">
                  <p><strong>Marks:</strong> {question?.MaxMarks || 'N/A'}</p>
                  <p><strong>Knowledge Base:</strong> {question?.bookname || 'N/A'}</p>
                  <p><strong>Learning Objective:</strong> {question?.learningObjective || 'N/A'}</p>
                  <p><strong>Creativity Level:</strong> {question?.creativitylevelname || 'N/A'}</p>
              </div>
              </div>
            </div>
          </div>
          
          {/* Key Points - Only show for written response questions */}
          {questionType === 'written-response' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Key Points</h3>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addKeyPoint}
                  className="flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Key Point
                </Button>
              </div>
              
              <div className="space-y-2">
                {keyPoints.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                    No key points added yet. Click the button above to add one.
                  </div>
                ) : (
                <div className="space-y-2">
                  {keyPoints.map((point, index) => (
                    <div key={index} className="flex items-start gap-2 group">
                      <div className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium mt-1 flex-shrink-0">
                        {index + 1}
                      </div>
                      <Textarea
                        id="correct-answer-textarea"
                        value={point}
                        onChange={(e) => updateKeyPoint(index, e.target.value)}
                        className={`min-h-[40px] ${errors.keyPoints?.[index] ? 'border-red-500' : ''}`}
                        placeholder={`Key point ${index + 1}...`}
                      />
                      {errors.keyPoints?.[index] && (
                        <p className="text-sm text-red-500 mt-1">{errors.keyPoints[index]}</p>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeKeyPoint(index)}
                        title="Remove key point"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-10">
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: -25,
              background: "#fff",
              borderTop: "1px solid #eee",
              padding: "16px 24px",
              zIndex: 20,
              boxShadow: "0 -2px 8px rgba(0,0,0,0.02)"
            }}
            className="flex justify-end gap-3"
          >
            <Button
              variant="outline"
              onClick={onClose}
              className="flex items-center gap-2" title="Cancel"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white flex items-center gap-2" title="Save"
            >
              <Check className="w-4 h-4" />
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
