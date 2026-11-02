import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog"
import { useState, useEffect } from "react"
const API_QUIZ_URL = import.meta.env.VITE_API_QUIZ_URL;
import { Link, useNavigate, useLocation } from "react-router-dom"
import {
  ArrowLeft,
  Zap,
  CheckCircle2,
  Clock,
  BookOpen,
  FileText,
  FileSpreadsheet,
  Database,
  Edit3,
  Eye,
  Trash2,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Target,
  User,
  Hash,
  AlignLeft,
  X,
  XCircle,
  AlertCircle,
  Plus,
  Star,
  GraduationCap,
  FileQuestion,
  MessageSquare,
  List,
  Check,
  Info,
  Settings2,
  Volume2,
  VolumeX
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// ...existing code...
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

import { getFromDB, fetchUsageStats, VITE_ITEM_GEN_API_URL } from "@/api";
import axios from "axios";
import { saveAs } from "file-saver"
import { Document, Packer, Paragraph, TextRun } from "docx"

const formatQuestionTextForDisplay = (rawText: any): string => {
  const base = String(rawText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!base) return '';

  return base
    .replace(/\s+\(([a-eA-E])\)\s*/g, (_match, label) => `\n(${String(label).toLowerCase()}) `)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};



const QuestionResults = () => {
  // Read token balance stored by ItemGeneration in sessionStorage
  // Prefer the live remainingTokens state (kept updated from API) but fall back to sessionStorage
  const [remainingTokens, setRemainingTokens] = useState<number>(0);
  const getRemainingTokensDisplay = () => {
    // If we've fetched a value into state, use it
    if (typeof remainingTokens === "number" && remainingTokens > 0) {
      return remainingTokens.toLocaleString();
    }

    // Fallback: try to read from sessionStorage usageStats (existing behavior)
    try {
      const statsRaw = JSON.parse(sessionStorage.getItem("usageStats") || "null");
      if (Array.isArray(statsRaw)) {
        const raw = statsRaw[2];
        if (typeof raw === "number") return raw.toLocaleString();
        if (typeof raw === "string") {
          const num = Number(raw.replace(/[^\d.-]/g, ""));
          return isNaN(num) ? raw : num.toLocaleString();
        }
      }
    } catch { }
    return "0";
  };
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("generate")
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false)
  const [selectedQuestion, setSelectedQuestion] = useState(null)
  const [playingQuestionId, setPlayingQuestionId] = useState<string | null>(null);

  // Pre-load voices on mount so SpeechSynthesis doesn't lag looking up voices over network
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        if (window.speechSynthesis) {
          window.speechSynthesis.getVoices();
        }
      };
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
      return () => {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  const cleanTextForSpeech = (input: any): string => {
    if (!input) return '';
    let str = String(input);
    str = str.replace(/data:image\/[a-zA-Z]+;base64,[^"'\s>]+/g, '');
    try {
      const doc = new DOMParser().parseFromString(str, 'text/html');
      doc.querySelectorAll('img, style, script, svg').forEach(el => el.remove());
      str = doc.body.textContent || doc.body.innerText || str;
    } catch {
      str = str.replace(/<[^>]*>/g, '');
    }
    str = str
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/[\{\}\$\\\_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return str;
  };

  const handleSpeak = (question: any, questionKey: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (playingQuestionId === questionKey) {
      window.speechSynthesis.cancel();
      setPlayingQuestionId(null);
      return;
    }

    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const rawText = question?.question || question?.label || question?.QuestionStatement || question?.text || '';
    if (!rawText) return;

    const cleanText = cleanTextForSpeech(rawText);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);

    const rateVal = parseFloat(sessionStorage.getItem('speechRate') || localStorage.getItem('speechRate') || '1.0');
    const voicePref = sessionStorage.getItem('speechVoice') || localStorage.getItem('speechVoice') || 'default';

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const genderPref = (sessionStorage.getItem('speechGender') || localStorage.getItem('speechGender') || 'female').toLowerCase();
      const accentPref = (sessionStorage.getItem('speechAccent') || localStorage.getItem('speechAccent') || 'en-IN').toLowerCase();

      const isMale = genderPref === 'male';
      const maleKeywords = ['male', 'david', 'mark', 'george', 'james', 'richard', 'guy', 'stefan', 'ravi', 'prabhat'];
      const femaleKeywords = ['female', 'zira', 'hazel', 'catherine', 'susan', 'samantha', 'victoria', 'heera', 'neerja', 'veena', 'google us english'];
      const genderKeywords = isMale ? maleKeywords : femaleKeywords;

      // 1. Accent + Gender
      let selectedVoice = voices.find(v => {
        const langLower = v.lang.toLowerCase();
        const nameLower = v.name.toLowerCase();
        const matchesAccent = (accentPref.includes('in') && (langLower.includes('in') || nameLower.includes('india'))) ||
          (accentPref.includes('us') && langLower.includes('us')) ||
          (accentPref.includes('gb') && (langLower.includes('gb') || langLower.includes('uk')));
        const matchesGender = genderKeywords.some(k => nameLower.includes(k));
        return matchesAccent && matchesGender;
      });

      // 2. Accent alone
      if (!selectedVoice) {
        selectedVoice = voices.find(v => {
          const langLower = v.lang.toLowerCase();
          const nameLower = v.name.toLowerCase();
          return (accentPref.includes('in') && (langLower.includes('in') || nameLower.includes('india'))) ||
            (accentPref.includes('us') && langLower.includes('us')) ||
            (accentPref.includes('gb') && (langLower.includes('gb') || langLower.includes('uk')));
        });
      }

      // 3. Gender alone
      if (!selectedVoice) {
        selectedVoice = voices.find(v => genderKeywords.some(k => v.name.toLowerCase().includes(k)));
      }

      // 4. Fallback to English voice
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('en') && v.localService) || voices.find(v => v.lang.startsWith('en')) || voices[0];
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    utterance.rate = rateVal;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      setPlayingQuestionId(null);
    };
    utterance.onerror = () => {
      setPlayingQuestionId(null);
    };

    setPlayingQuestionId(questionKey);
    window.speechSynthesis.speak(utterance);

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  };
  const [questionType, setQuestionType] = useState("multiple-choice")
  const [validationErrors, setValidationErrors] = useState({
    options: ['', '', '', ''], // Error messages for each option
    correctAnswer: '', // Error message for correct answer
    questionStem: '', // Error message for question stem
    sampleAnswer: '', // Error message for sample answer
    keyPoints: ['', '', '', '', ''], // Error messages for key points
    feedbacks: ['', '', '', ''], // Error messages for each feedback
  })
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [editingKeyPoints, setEditingKeyPoints] = useState<string[]>([]) // Dynamic key points for editing
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(true) // Track if user has unsaved changes
  const [showNavigationDialog, setShowNavigationDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [pendingTabChange, setPendingTabChange] = useState<string | null>(null)


  const [showSaveAllDialog, setShowSaveAllDialog] = useState(false);
  const [saveAllDialogMessage, setSaveAllDialogMessage] = useState("");
  const [saveAllDialogType, setSaveAllDialogType] = useState("success"); // or "error"
  // Enhanced validation function for edit dialog

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState(null);

  const handleSaveChanges = () => {
    const questionStemTextarea = document.querySelector('[data-question-stem-textarea]') as HTMLTextAreaElement;
    const sampleAnswerTextarea = document.querySelector('[data-sample-answer-textarea]') as HTMLTextAreaElement;
    const keyPointTextareas = document.querySelectorAll('[data-key-point-textarea]') as NodeListOf<HTMLTextAreaElement>;
    const optionTextareas = document.querySelectorAll('[data-option-textarea]') as NodeListOf<HTMLTextAreaElement>;
    const correctAnswerTextarea = document.querySelector('[data-correct-answer-textarea]') as HTMLTextAreaElement;
    const correctAnswerSelect = document.querySelector('[data-correct-answer-select]') as HTMLSelectElement;
    // feedback suffix textareas (editable part only)
    const feedbackTextareas = document.querySelectorAll('[data-feedback-option-suffix]') as NodeListOf<HTMLTextAreaElement>;

    // Reset validation errors
    const newErrors = {
      options: ['', '', '', ''],
      correctAnswer: '',
      questionStem: '',
      sampleAnswer: '',
      keyPoints: ['', '', '', '', ''],
      feedbacks: ['', '', '', ''],
    };

    let hasErrors = false;
    const questionStemText = questionStemTextarea?.value.trim();

    // 1. Check if question stem is empty (required for both types)
    if (!questionStemText) {
      newErrors.questionStem = 'Question Stem cannot be empty.';
      hasErrors = true;
    }

    // Declare variables for written response
    let sampleAnswerText = '';
    let keyPointValues: string[] = [];

    if (questionType === "written-response") {
      // Written Response validation
      sampleAnswerText = sampleAnswerTextarea?.value.trim() || '';
      keyPointValues = editingKeyPoints.map(point => point.trim());

      // 2. Check if sample answer is empty
      if (!sampleAnswerText) {
        newErrors.sampleAnswer = 'Sample Answer cannot be empty.';
        hasErrors = true;
      }

      // 3. Check if any key point is empty
      keyPointValues.forEach((value, index) => {
        if (!value) {
          // Ensure newErrors.keyPoints array is large enough
          while (newErrors.keyPoints.length <= index) {
            newErrors.keyPoints.push('');
          }
          newErrors.keyPoints[index] = 'Key point cannot be empty.';
          hasErrors = true;
        }
      });

      // 4. Check for unique key points (only if no empty key points)
      if (!hasErrors) {
        const duplicateIndices: number[] = [];
        keyPointValues.forEach((value, index) => {
          const duplicateIndex = keyPointValues.findIndex((otherValue, otherIndex) =>
            otherIndex !== index && value.toLowerCase() === otherValue.toLowerCase()
          );
          if (duplicateIndex !== -1) {
            duplicateIndices.push(index);
          }
        });

        duplicateIndices.forEach(index => {
          // Ensure newErrors.keyPoints array is large enough
          while (newErrors.keyPoints.length <= index) {
            newErrors.keyPoints.push('');
          }
          newErrors.keyPoints[index] = 'Key points should be unique.';
          hasErrors = true;
        });
      }
    } else {
      // Multiple Choice validation (existing logic)
      if (correctAnswerSelect && optionTextareas.length === 4 && correctAnswerTextarea) {
        const selectedOption = correctAnswerSelect.value;
        const selectedIndex = ['A', 'B', 'C', 'D'].indexOf(selectedOption);
        const optionValues = Array.from(optionTextareas).map(textarea => textarea.value.trim());
        const correctAnswerText = correctAnswerTextarea.value.trim();

        // 2. Check for empty options and feedbacks
        optionValues.forEach((value, index) => {
          if (!value) {
            newErrors.options[index] = 'This option cannot be empty.';
            hasErrors = true;
          }
        });

        // Build full feedback values by concatenating prefix (fixed) + suffix (editable)
        const feedbackValues: string[] = [];
        Array.from(feedbackTextareas).forEach((textarea, idx) => {
          const opt = textarea.dataset.feedbackOptionSuffix;
          const prefixEl = document.querySelector(`[data-feedback-prefix="${opt}"]`);
          const prefixText = prefixEl?.textContent?.trim() || '';
          const suffix = textarea.value.trim();
          // Treat suffix-only empty (i.e., only prefix present) as empty
          if (!suffix) {
            // mark the corresponding validation slot
            newErrors.feedbacks[idx] = 'Feedback cannot be empty.';
            hasErrors = true;
          }
          feedbackValues[idx] = ((prefixText ? prefixText + ' ' : '') + suffix).trim();
        });

        // Check for duplicate feedbacks if no empty ones are found
        if (!newErrors.feedbacks.some(e => e)) {
          const feedbackCounts = new Map();
          feedbackValues.forEach(value => {
            const lowerValue = value.toLowerCase();
            feedbackCounts.set(lowerValue, (feedbackCounts.get(lowerValue) || 0) + 1);
          });

          // feedbackValues already contains full feedback strings
          feedbackValues.forEach((value, index) => {
            if (feedbackCounts.get(value.toLowerCase()) > 1) {
              if (!newErrors.feedbacks[index]) {
                newErrors.feedbacks[index] = 'Feedback is a duplicate.';
                hasErrors = true;
              }
            }
          });
        }

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
    }

    // Update validation errors state
    setValidationErrors(newErrors);

    // If validation passes, save changes and close dialog
    if (!hasErrors) {
      if (questionType === "written-response" && selectedQuestion) {
        // Save written response question changes
        const updatedQuestion = {
          ...selectedQuestion,
          label: questionStemText,
          Question: questionStemText,
          text: questionStemText,
          QuestionText: questionStemText,
          CorrectAnswer: sampleAnswerText,
          answer: sampleAnswerText,
          KeyPoints: keyPointValues,
          keyPoints: keyPointValues
        };

        // Update the genResults array
        if (genResults && Array.isArray(genResults)) {
          const updatedResults = genResults.map(q =>
            q === selectedQuestion ? updatedQuestion : q
          );
          setGenResults(updatedResults);

          // Update localStorage
          sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults));

          // Update the questions state for display
          setQuestions(prev => prev.map(q => {
            if (q.raw === selectedQuestion) {
              return {
                ...q,
                text: questionStemText,
                answer: sampleAnswerText,
                raw: updatedQuestion
              };
            }
            return q;
          }));
        }

        // Update selectedQuestion state
        setSelectedQuestion(updatedQuestion);
      }
      // Update the actual question data for multiple choice questions
      else if (questionType === "multiple-choice" && selectedQuestion && correctAnswerSelect && optionTextareas.length === 4 && correctAnswerTextarea && questionStemTextarea) {
        const updatedQuestionStem = questionStemTextarea.value.trim();
        const updatedOptions = Array.from(optionTextareas).map(textarea => textarea.value.trim());
        const selectedOption = correctAnswerSelect.value || 'A';
        const updatedCorrectAnswer = selectedOption + '. ' + correctAnswerTextarea.value.trim();

        const updatedFeedbacks: { [key: string]: string } = {};
        feedbackTextareas.forEach(textarea => {
          const option = textarea.dataset.feedbackOptionSuffix;
          if (option) {
            const prefixEl = document.querySelector(`[data-feedback-prefix="${option}"]`);
            const prefixText = prefixEl?.textContent?.trim() || '';
            updatedFeedbacks[`FeedbackOption${option}`] = ((prefixText ? prefixText + ' ' : '') + textarea.value.trim()).trim();
          }
        });

        // Update the selected question object
        const updatedQuestion = {
          ...selectedQuestion,
          label: updatedQuestionStem,
          Question: updatedQuestionStem,
          text: updatedQuestionStem,
          QuestionText: updatedQuestionStem,
          values: updatedOptions,
          CorrectAnswer: updatedCorrectAnswer,
          ...updatedFeedbacks
        };

        // Update the genResults array
        if (genResults && Array.isArray(genResults)) {
          const updatedResults = genResults.map(q =>
            q === selectedQuestion ? updatedQuestion : q
          );
          setGenResults(updatedResults);

          // Update localStorage
          sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults));

          // Update the questions state for display
          setQuestions(prev => prev.map(q => {
            if (q.raw === selectedQuestion) {
              return {
                ...q,
                text: updatedQuestionStem,
                options: updatedOptions.map((opt, i) => ({
                  id: String.fromCharCode(65 + i),
                  text: opt,
                  isCorrect: updatedCorrectAnswer.startsWith(String.fromCharCode(65 + i))
                })),
                answer: updatedCorrectAnswer,
                raw: updatedQuestion
              };
            }
            return q;
          }));
        }

        // Update selectedQuestion state
        setSelectedQuestion(updatedQuestion);
      }

      setIsEditDialogOpen(false);
      setValidationErrors({ options: ['', '', '', ''], correctAnswer: '', questionStem: '', sampleAnswer: '', keyPoints: ['', '', '', '', ''], feedbacks: ['', '', '', ''] }); // Reset errors
      setShowSuccessDialog(true);
    } else {
      // Auto-scroll to first error position
      setTimeout(() => {
        // Find the first error element and scroll to it
        let firstErrorElement = null;

        // Check question stem first (common to both types)
        if (newErrors.questionStem) {
          firstErrorElement = questionStemTextarea;
        }
        // For written response questions
        else if (questionType === "written-response") {
          // Check sample answer
          if (newErrors.sampleAnswer) {
            firstErrorElement = sampleAnswerTextarea;
          }
          // Check key points
          else {
            for (let i = 0; i < newErrors.keyPoints.length; i++) {
              if (newErrors.keyPoints[i]) {
                firstErrorElement = keyPointTextareas[i];
                break;
              }
            }
          }
        }
        // For multiple choice questions
        else {
          // Check options
          for (let i = 0; i < newErrors.options.length; i++) {
            if (newErrors.options[i]) {
              firstErrorElement = optionTextareas[i];
              break;
            }
          }
          // Check correct answer
          if (!firstErrorElement && newErrors.correctAnswer) {
            firstErrorElement = correctAnswerTextarea || correctAnswerSelect;
          }
        }

        if (firstErrorElement) {
          // Scroll the dialog content container to the error element
          const dialogContent = firstErrorElement.closest('.overflow-y-auto');
          if (dialogContent) {
            const elementRect = firstErrorElement.getBoundingClientRect();
            const containerRect = dialogContent.getBoundingClientRect();
            const scrollTop = dialogContent.scrollTop + elementRect.top - containerRect.top - 100;

            dialogContent.scrollTo({
              top: scrollTop,
              behavior: 'smooth'
            });
          } else {
            // Fallback to regular scroll
            firstErrorElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }

          // Focus the element after scrolling
          setTimeout(() => {
            firstErrorElement.focus();
          }, 300);
        }
      }, 150); // Increased delay to ensure DOM is updated with error messages
    }
  }

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
        questionStem: prev.questionStem || '',
        sampleAnswer: prev.sampleAnswer || '',
        keyPoints: prev.keyPoints || ['', '', '', '', '']
      }));
    }
  }
  const [selectedQuestionType, setSelectedQuestionType] = useState("Multiple Choice")
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  type Question = {
    id: number;
    questionid?: number;
    text: string;
    type: string;
    marks: number;
    options: { id: string; text: string; isCorrect: boolean }[];
    answer: string;
    createdat: string;
    [key: string]: any; // for any extra fields from API
  };


  // --- Load generated questions from localStorage if present ---
  const [questions, setQuestions] = useState<Question[]>([])
  const [genResults, setGenResults] = useState<any>(null);

  useEffect(() => {
    // Try to load questionGenResults from localStorage
    const stored = sessionStorage.getItem("questionGenResults");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Support both array and object with array inside
        let arr = Array.isArray(parsed) ? parsed : (parsed.data || parsed.questions || parsed.result || []);
        // If the array is in the root, or in .data/.questions/.result
        if (Array.isArray(arr) && arr.length > 0 && arr[0].label) {
          // Map to Question[] shape for display
          setQuestions(arr.map((q, idx) => ({
            id: idx + 1,
            text: q.label || q.Question || q.text || '',
            type: q.type || (q.values ? 'multiple-choice' : 'written-response'),
            marks: q.MaxMarks || q.marks || 1,
            options: Array.isArray(q.values) ? q.values.map((v, i) => ({
              id: String.fromCharCode(65 + i),
              text: v,
              isCorrect: (q.CorrectAnswer || '').startsWith(String.fromCharCode(65 + i))
            })) : [],
            answer: q.CorrectAnswer || q.answer || '',
            createdat: '',
            LearningObjective: q.LearningObjective,
            ReferenceInfo: q.ReferenceInfo,
            BookName: q.BookName,
            Feedback: Object.keys(q).filter(k => k.startsWith('FeedbackOption')).map(k => ({
              option: k.replace('FeedbackOption', ''),
              feedback: q[k]
            })),
            raw: q
          })));
          setGenResults(parsed);
          return;
        }
      } catch { }
    }
    // fallback: keep existing questions state
  }, []);

  useEffect(() => {
    const fetchQuestions = async () => {
      setLoading(true);
      setError(null);

      let userInfo: Record<string, any> = {};
      try {
        userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
      } catch (e) {
        userInfo = {};
      }

      const input = {
        custcode: sessionStorage.getItem('custcode') || userInfo["customerCode"],
        orgcode: sessionStorage.getItem('orgcode') || userInfo["orgCode"],
        usercode: sessionStorage.getItem('usercode') || userInfo["userCode"] || "",
        appcode: sessionStorage.getItem('appcode') || "IG",
        booknameid: Number(sessionStorage.getItem('booknameid')) || 2,
        chaptercode: sessionStorage.getItem('chaptercode') || "",
        locode: sessionStorage.getItem('locode') || "",
        questiontypeid: Number(sessionStorage.getItem('questiontypeid')) || 0,
        taxonomyid: Number(sessionStorage.getItem('taxonomyid')) || 0,
        difficultlevelid: Number(sessionStorage.getItem('difficultlevelid')) || 0,
        questionrequestid: Number(sessionStorage.getItem('questionrequestid')) || 0,
        questionid: Number(sessionStorage.getItem('questionid')) || 1,
        sourcetype: Number(sessionStorage.getItem('sourcetype')) || 0,
        pagesize: Number(sessionStorage.getItem('pagesize')) || 0,
        pageno: Number(sessionStorage.getItem('pageno')) || 0,
        usertypeid: Number(sessionStorage.getItem('usertypeid')) || 1,
        searchtext: ""
      };

      try {
        const data = await getFromDB(input);
        let questionsArr = [];
        // Defensive: handle both possible API shapes
        if (data && Array.isArray(data.question_xml)) {
          questionsArr = data.question_xml.map((item) => {
            if (Array.isArray(item) && item.length === 3 && typeof item[2] === 'object') {
              // Map to expected fields for table, fallback for missing fields
              return {
                id: item[0],
                questionid: item[1],
                text: item[2].Question || item[2].question || item[2].text || item[2].QuestionText || 'No question text',
                type: item[2].QuestionType || item[2].type || item[2].questiontype || item[2].questiontypeid || 'N/A',
                marks: item[2].Marks || item[2].marks || 1,
                options: Array.isArray(item[2].Options) ? item[2].Options : Array.isArray(item[2].options) ? item[2].options : [],
                answer: item[2].Answer || item[2].answer || '',
                createdat: item[2].CreatedAt || item[2].createdat || item[2].created || item[2].date || item[2].created_date || item[2].createdDate || '',
                Difficulty: item[2].Difficulty || item[2].difficulty || item[2].difficultylevel || 'N/A',
                Topic: item[2].Topic || item[2].topic || item[2].topicname || item[2].subject || 'N/A',
                QuestionID: item[2].QuestionID || item[2].questionid || item[2].id || '',
                QuestionType: item[2].QuestionType || item[2].type || item[2].questiontype || item[2].questiontypeid || 'N/A',
                ...item[2],
              };
            }
            return null;
          }).filter(Boolean);
        } else if (Array.isArray(data)) {
          questionsArr = data;
        }
        setQuestions(questionsArr);
      } catch (err) {
        setError("Failed to load questions");
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, []);

  // Helper: fetch usage stats, store them, and update remainingTokens
  const fetchAndStoreUsageStats = async () => {
    let userInfo: any = {};
    try {
      userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    } catch (e) {
      userInfo = {};
    }

    const payload = {
      custcode: sessionStorage.getItem('custcode') || userInfo?.custcode || userInfo?.customerCode,
      orgcode: sessionStorage.getItem('orgcode') || userInfo?.orgcode || userInfo?.orgCode,
      usercode: sessionStorage.getItem('usercode') || sessionStorage.getItem('userCode') || userInfo?.usercode || userInfo?.userCode || "",
      appcode: sessionStorage.getItem('appcode') || "IG",
      type: 1,
    };

    try {
      const stats = await fetchUsageStats(payload);
      try { sessionStorage.setItem("usageStats", JSON.stringify(stats)); } catch { }

      // Extract remaining-tokens candidate from common shapes
      let valueCandidate: any = undefined;
      if (Array.isArray(stats)) {
        if (Array.isArray(stats[0]) && typeof stats[0][2] !== 'undefined') valueCandidate = stats[0][2];
        else if (typeof stats[2] !== 'undefined') valueCandidate = stats[2];
        else if (typeof stats[0] !== 'undefined' && Array.isArray(stats[0]) && typeof stats[0][2] !== 'undefined') valueCandidate = stats[0][2];
      }

      if (typeof valueCandidate === 'number') {
        setRemainingTokens(valueCandidate);
      } else if (typeof valueCandidate === 'string') {
        const num = Number(String(valueCandidate).replace(/[^\d.-]/g, ""));
        setRemainingTokens(isNaN(num) ? 0 : num);
      } else {
        setRemainingTokens(0);
      }
    } catch (err) {
      setError((err as Error).message || "Failed to fetch usage");
    }
  };

  // Call once on mount
  useEffect(() => {
    fetchAndStoreUsageStats();
    // also refresh when the window/tab regains focus
    const onFocus = () => fetchAndStoreUsageStats();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Refresh when route changes (navigating to this page without remount)
  const location = useLocation();
  useEffect(() => {
    fetchAndStoreUsageStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);


  // Dynamic key points that will be loaded from selected question
  const getKeyPointsFromQuestion = (question: any) => {
    if (!question) return [];

    // Try to get key points from various possible fields
    if (question.KeyPoints && Array.isArray(question.KeyPoints)) {
      return question.KeyPoints;
    }
    if (question.keyPoints && Array.isArray(question.keyPoints)) {
      return question.keyPoints;
    }

    // Default key points if none exist
    return [
      "Speculative risks - Include the potential for financial gain, which is incompatible with insurance principles.",
      "Pure risks - Only involve loss or no loss, making them insurable and predictable.",
      "Risk predictability - Insurance relies on statistical data to assess and cover pure risks.",
      "Profit exclusion - Insurance excludes risks with potential profit to avoid gambling",
      "Actuarial basis - Insurers use pure risks for accurate premium calculations and risk management."
    ];
  };

  // Add new key point
  const addKeyPoint = () => {
    setEditingKeyPoints(prev => [...prev, ""]);
    // Expand validation errors array to accommodate new key point
    setValidationErrors(prev => ({
      ...prev,
      keyPoints: [...prev.keyPoints, ""]
    }));
  };

  // Delete key point at specific index
  const deleteKeyPoint = (index: number) => {
    setEditingKeyPoints(prev => prev.filter((_, i) => i !== index));
    // Remove corresponding validation error
    setValidationErrors(prev => ({
      ...prev,
      keyPoints: prev.keyPoints.filter((_, i) => i !== index)
    }));
  };

  // Update key point at specific index
  const updateKeyPoint = (index: number, value: string) => {
    setEditingKeyPoints(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  // Navigation guard function
  const handleNavigation = (path: string, tabName?: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(path);
      if (tabName) {
        setPendingTabChange(tabName);
      }
      setShowNavigationDialog(true);
    } else {
      if (tabName) {
        setActiveTab(tabName);
      }
      navigate(path);
    }
  };

  // Confirm navigation without saving
  const confirmNavigation = () => {
    if (pendingNavigation) {
      if (pendingTabChange) {
        setActiveTab(pendingTabChange);
      }
      navigate(pendingNavigation);
    }
    setShowNavigationDialog(false);
    setPendingNavigation(null);
    setPendingTabChange(null);
  };

  // Cancel navigation
  const cancelNavigation = () => {
    setShowNavigationDialog(false);
    setPendingNavigation(null);
    setPendingTabChange(null);
  };

  const stats = [
    {
      title: "Remaining Tokens",
      value: getRemainingTokensDisplay(),
      icon: <Zap className="w-5 h-5 text-blue-600" />,
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200"
    },
    {
      title: "Questions Generated",
      value: sessionStorage.getItem("selectedQuantity") || "1",
      icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
      bgColor: "bg-green-50",
      borderColor: "border-green-200"
    },
    {
      title: "Generation Time",
      value: "2.3 seconds",
      icon: <Clock className="w-5 h-5 text-purple-600" />,
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200"
    },
    {
      title: "Knowledge Base",
      value: sessionStorage.getItem('bookTitle') || "",
      icon: <BookOpen className="w-5 h-5 text-orange-600" />,
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200"
    }
  ]

  const generateNewQuestions = async () => {
    setIsRegenerating(true)

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Generate new questions based on the current question type
    const newQuestions = questionType === "multiple-choice" ? [
      {
        id: questions.length + 1,
        text: "How does the principle of utmost good faith apply differently to pure risks compared to speculative risks in insurance contracts?",
        type: "multiple-choice",
        marks: 5,
        options: [
          { id: "A", text: "Utmost good faith applies equally to both pure and speculative risks.", isCorrect: false },
          { id: "B", text: "Pure risks require full disclosure as they are based on factual circumstances that can be verified.", isCorrect: true },
          { id: "C", text: "Speculative risks require more disclosure than pure risks.", isCorrect: false },
          { id: "D", text: "Utmost good faith is not applicable to insurance contracts.", isCorrect: false }
        ],
        answer: "Pure risks require full disclosure under utmost good faith principles because insurers need accurate information about factual circumstances to assess risk properly. This differs from speculative risks where the element of potential gain makes disclosure requirements more complex."
      },
      {
        id: questions.length + 2,
        text: "What impact does the law of large numbers have on the insurability of pure risks versus speculative risks?",
        type: "multiple-choice",
        marks: 5,
        options: [
          { id: "A", text: "The law of large numbers makes speculative risks more predictable than pure risks.", isCorrect: false },
          { id: "B", text: "Pure risks benefit from the law of large numbers, enabling accurate premium calculations.", isCorrect: true },
          { id: "C", text: "The law of large numbers has no impact on insurance pricing.", isCorrect: false },
          { id: "D", text: "Both pure and speculative risks are equally affected by the law of large numbers.", isCorrect: false }
        ],
        answer: "The law of large numbers enables insurers to predict the frequency and severity of pure risk losses across a large pool of similar exposures, making premium calculations accurate and sustainable. Speculative risks don't follow predictable patterns, making this principle less applicable."
      }
    ] : [
      {
        id: questions.length + 1,
        text: "Analyze the fundamental differences between pure and speculative risks in terms of their characteristics and explain why insurance companies focus primarily on pure risks.",
        type: "written-response",
        marks: 5,
        options: [],
        answer: "Pure risks are characterized by uncertainty about whether a loss will occur, with only two possible outcomes: loss or no loss. They are typically involuntary, predictable through statistical analysis, and involve circumstances beyond the insured's control. Speculative risks, conversely, involve three possible outcomes: gain, loss, or no change, and are often voluntary decisions made for potential profit. Insurance companies focus on pure risks because they can be quantified, predicted, and managed through risk pooling and the law of large numbers, while speculative risks would create moral hazard and contradict insurance principles by potentially rewarding risky behavior undertaken for profit."
      },
      {
        id: questions.length + 2,
        text: "Discuss how the principle of indemnity applies to pure risks and explain why this principle would be problematic if applied to speculative risks in insurance coverage.",
        type: "written-response",
        marks: 5,
        options: [],
        answer: "The principle of indemnity ensures that insurance compensation restores the insured to their financial position before the loss, preventing profit from insurance claims. This works well with pure risks because the loss is measurable and the goal is restoration, not enrichment. With speculative risks, applying indemnity would be problematic because these risks involve potential gains that cannot be measured or predicted. If someone takes a speculative risk expecting profit but suffers a loss, compensating them would essentially guarantee the gain they hoped for while eliminating the risk they voluntarily assumed, creating moral hazard and transforming insurance into a gambling mechanism."
      }
    ]


    setIsRegenerating(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AL</span>
              </div>
              <img
                src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                alt="AI-Levate"
                className="h-5 w-auto"
              />

            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-600 rounded flex items-center justify-center">
                <span className="text-white text-xs">✦</span>
              </div>
              <span className="text-sm text-purple-600 font-medium">Knowledge Base: {sessionStorage.getItem('bookTitle') || ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white text-xs">⚡</span>
              </div>
              <span className="text-sm text-blue-600 font-medium">
                Remaining Tokens: {getRemainingTokensDisplay()}     </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-600"
              onClick={() => handleNavigation('/item-generation')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Knowledge Base
            </Button>
            {/* <Button
              variant="ghost"
              size="sm"
              className="text-gray-600"
              onClick={() => {
                sessionStorage.removeItem('authToken')
                sessionStorage.removeItem('userSession')
                sessionStorage.clear()
                window.location.href = "/"
              }}
            >
              Sign Out
            </Button> */}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto">
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 max-w-lg">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  handleNavigation("/question-generator/cyber-risk", "generate");
                }}
                className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${window.location.pathname === "/item-generation" || activeTab === "generate"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
              >
                <Sparkles className="h-4 w-4" />
                Generate Questions
              </button>
              <button
                onClick={() => {
                  handleNavigation("/question-repository", "repository");
                }}
                className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${window.location.pathname === "/question-repository" || activeTab === "repository"
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

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className={`p-6 ${stat.bgColor} border ${stat.borderColor} shadow-sm`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{stat.title}</span>
                {stat.icon}
              </div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
            </Card>
          ))}
        </div>


        {/* Generated Questions from localStorage (AI results) */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Generated Questions</h3>
              <p className="text-sm text-gray-500">These are the latest AI-generated questions based on your request.</p>
            </div>
            <div className="flex gap-2 mt-2 md:mt-0">
              <Button
                className="bg-green-100 hover:bg-green-200 text-green-800 border border-green-300"
                onClick={async () => {
                  const hasChanges = hasUnsavedChanges; // Or check your logic
                  if (!hasChanges) {
                    setSaveAllDialogType("info");
                    setSaveAllDialogMessage("Questions are already saved to repository");
                    setShowSaveAllDialog(true);
                    return;
                  }
                  try {
                    const raw = sessionStorage.getItem("questionGenResults");
                    let data = JSON.parse(raw || "null");
                    let results = [];
                    if (Array.isArray(data)) {
                      results = data;
                    } else if (data && Array.isArray(data.data)) {
                      results = data.data;
                    } else if (data && Array.isArray(data.questions)) {
                      results = data.questions;
                    } else if (data && Array.isArray(data.result)) {
                      results = data.result;
                    } else if (data && typeof data === 'object') {
                      const keys = Object.keys(data);
                      if (keys.length > 1 && keys.every(k => !isNaN(Number(k)))) {
                        const arrLike = keys.map(k => data[k]);
                        if (arrLike.every(q => typeof q === 'object' && (q.label || q.Question || q.text))) {
                          results = arrLike;
                        }
                      } else if (data.label || data.Question || data.text) {
                        results = [data];
                      }
                    }
                    if (!Array.isArray(results)) results = [];
                    results = results.filter(Boolean);
                    if (!results.length) {
                      window.alert('QuestioNns are already saved to repository.');
                      return;
                    }
                    // Prepare payload for API (get values from localStorage, fallback to defaults)
                    const usercode = sessionStorage.getItem('userCode') || '';
                    const orgcode = sessionStorage.getItem('orgcode');
                    const custcode = sessionStorage.getItem('custcode');
                    const appcode = sessionStorage.getItem('appcode') || 'IG';
                    const booknameid = Number(sessionStorage.getItem('bookid')) || 2;
                    const questiontypeid = Number(sessionStorage.getItem('questiontypeid')) || 1;
                    const taxonomy = sessionStorage.getItem('selectedTaxonomy');
                    const taxonomyid = taxonomy == "Remember" ? 1 : taxonomy == "Understand" ? 2 : taxonomy == "Apply" ? 3 : taxonomy == "Analyze" ? 4 : taxonomy == "Evaluate" ? 5 : taxonomy == "Create" ? 6 : 0;
                    const difficultlevelid = Number(sessionStorage.getItem('difficultlevelid')) || 1;
                    const chaptercode = sessionStorage.getItem('chaptercode') || 'S11';
                    const sourcetype = Number(sessionStorage.getItem('sourcetype')) || 1;
                    const source = sessionStorage.getItem('selectedGenerationMode') || 'Book Based';
                    const creativitylevelname = sessionStorage.getItem('selectedCreativityLevel') || 'Moderate';
                    const bookIdentifier = sessionStorage.getItem('bookIdentifier') || 'B2';
                    // Map results to API payload structure
                    const questionsPayload = results.map((q, idx) => {
                      // Convert creativity level name to ID
                      let creativitylevelid;
                      switch (creativitylevelname.toLowerCase()) {
                        case "high":
                          creativitylevelid = 2;
                          break;
                        case "very-high":
                          creativitylevelid = 3;
                          break;
                        case "moderate":
                        default:
                          creativitylevelid = 1;
                          break;
                      }
                      return {
                        usercode,
                        orgcode,
                        custcode,
                        appcode,
                        referenceinfo: q.ReferenceInfo || q.referenceinfo || '',
                        booknameid,
                        noofquestions: Number(sessionStorage.getItem('selectedQuantity')) || 1,
                        questiontypeid,
                        taxonomyid,
                        questiondata: {
                          BookName: [q.BookName || 'Book'],
                          CorrectAnswer: q.CorrectAnswer || q.correctAnswer || '',
                          KeyPoints: q.KeyPoints || q.keyPoints || [],
                          source: source,
                          LearningObjective: q.LearningObjective || q.learningObjective || '',
                          MaxMarks: q.MaxMarks || q.maxMarks || 1,
                          ReferenceInfo: q.ReferenceInfo || q.referenceinfo || '',
                          label: q.label || q.question || q.Question || '',
                          values: q.values || q.options || [],
                          slno: idx + 1,
                          instruction: q.instruction || '',
                          checkvalues: q.checkvalues || Array((q.values || q.options || []).length).fill(true),
                          Rating: q.Rating || 0,
                          Rating_Feedback: q.Rating_Feedback || '',
                          Isdeleted: q.Isdeleted || 0,
                          ISFeedbackProvided: q.ISFeedbackProvided || false,
                          version: q.version || 1,
                          CreatedAt: q.CreatedAt || new Date().toISOString(),
                          FeedbackOptionA: q.FeedbackOptionA || '',
                          FeedbackOptionB: q.FeedbackOptionB || '',
                          FeedbackOptionC: q.FeedbackOptionC || '',
                          FeedbackOptionD: q.FeedbackOptionD || '',
                          creativitylevel: creativitylevelid,
                          creativitylevelname: creativitylevelname || 'Moderate',
                          PreviousVersions: q.PreviousVersions || [],
                          RegenerateInstrcutions: q.RegenerateInstrcutions || [''],
                          Regeneratefeedback: q.Regeneratefeedback || ['']
                        },
                        AIquestiondata: {
                          ...q,
                          KeyPoints: q.KeyPoints || q.keyPoints || [],
                          creativitylevel: creativitylevelid,
                          instruction: "",
                          slno: idx + 1
                        },
                        difficultlevelid,
                        duplicateguid: "",
                        kbid: sessionStorage.getItem('selectedKnowledgeBase') || '',
                        gid: sessionStorage.getItem('selectedGuideline') || '',
                        chaptercode,
                        locode: sessionStorage.getItem('selectedLO') || 'LO48',
                        sourcetype: source === 'Book Based' ? 1 : 2,
                        questionguid: `${bookIdentifier}_${String(chaptercode || '0').padStart(2, '0')}_${sessionStorage.getItem('selectedLO') || 'LO0'}_${q.type === 'Written Response' ? 'WR' : 'MC'}_L0_EN_ID`,
                        previousQuestionData: q.PreviousVersions || [],
                        currentversion: String(q.version || '1'),
                        instructions: q.RegenerateInstrcutions || q.instruction ? [q.RegenerateInstrcutions || q.instruction] : [''],
                        maininstruction: "",
                        feedback: q.Regeneratefeedback ? [q.Regeneratefeedback] : [''],
                      }
                    });
                    const payload = { questionsPayload };
                    const res = await fetch(`${VITE_ITEM_GEN_API_URL}/insert_to_db`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify(payload)
                    });
                    // if (res.ok) {
                    //   const result = await res.json();
                    //   setHasUnsavedChanges(false); // Mark as saved
                    //   window.alert(result.message || 'Questions inserted successfully');
                    // } else {
                    //   let errText = await res.text();
                    //   // For error, we'll still use alert for now, or you could add an error dialog
                    //   window.alert('Failed to save questions: ' + errText);
                    // }

                    if (!results.length) {
                      setSaveAllDialogType("error");
                      setSaveAllDialogMessage("No questions to save.");
                      setShowSaveAllDialog(true);
                      return;
                    }
                    // ...
                    if (res.ok) {
                      const result = await res.json();
                      setHasUnsavedChanges(false); // Mark as saved
                      setSaveAllDialogType("success");
                      setSaveAllDialogMessage(result.message || 'Questions inserted successfully');
                      setShowSaveAllDialog(true);
                    } else {
                      let errText = await res.text();
                      setSaveAllDialogType("error");
                      setSaveAllDialogMessage('Failed to save questions: ' + errText);
                      setShowSaveAllDialog(true);
                    }
                  } catch (e) {
                    //window.alert('Failed to save all questions.');
                    setSaveAllDialogType("error");
                    setSaveAllDialogMessage('Failed to save all questions.');
                    setShowSaveAllDialog(true);
                  }
                }}
              >
                Save All
              </Button>
              <Button
                className="bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300"
                onClick={async () => {
                  // Export all questions to Word
                  try {
                    const raw = sessionStorage.getItem("questionGenResults");
                    let data = JSON.parse(raw || "null");
                    let results = [];
                    if (Array.isArray(data)) {
                      results = data;
                    } else if (data && Array.isArray(data.data)) {
                      results = data.data;
                    } else if (data && Array.isArray(data.questions)) {
                      results = data.questions;
                    } else if (data && Array.isArray(data.result)) {
                      results = data.result;
                    } else if (data && typeof data === 'object') {
                      const keys = Object.keys(data);
                      if (keys.length > 1 && keys.every(k => !isNaN(Number(k)))) {
                        const arrLike = keys.map(k => data[k]);
                        if (arrLike.every(q => typeof q === 'object' && (q.label || q.Question || q.text))) {
                          results = arrLike;
                        }
                      } else if (data.label || data.Question || data.text) {
                        results = [data];
                      }
                    }
                    if (!Array.isArray(results)) results = [];
                    results = results.filter(Boolean);
                    if (!results.length) {
                      window.alert('No questions to export.');
                      return;
                    }
                    // Get book title from localStorage, fallback to 'questions'
                    let bookTitle = sessionStorage.getItem('bookTitle') || 'questions';
                    // Clean filename: remove illegal characters
                    bookTitle = bookTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
                    // Dynamically import docx and build document in the requested format
                    const docx = await import('docx');
                    const { Document, Packer, Paragraph } = docx;

                    const docChildren = [] as any[];
                    results.forEach((q, idx) => {
                      // Resolve fields
                      const questionText = formatQuestionTextForDisplay(q.label || q.Question || q.text || q.QuestionText || '');
                      let options: string[] = [];
                      if (Array.isArray(q.values)) options = q.values.map((v: any) => (v || '').toString());
                      else if (Array.isArray(q.options)) options = q.options.map((v: any) => (typeof v === 'string' ? v : (v?.text || v?.value || '')).toString());
                      // Normalize options (strip leading "A. ", "B. " etc.)
                      options = options.map((o: string) => o.replace(/^[A-D]\.|^[a-d]\)/, '').trim());

                      // Determine type
                      const isMC = options && options.length > 0;
                      const typeLabel = isMC ? 'MC' : 'WR';
                      const taxonomyid = q.taxonomy == "Remember" ? 1 : q.taxonomy == "Understand" ? 2 : q.taxonomy == "Apply" ? 3 : q.taxonomy == "Analyze" ? 4 : q.taxonomy == "Evaluate" ? 5 : q.taxonomy == "Create" ? 6 : 0;
                      // Resolve title and creativity
                      //const title = (q.Title || q.title || q.QuestionID || q.questionguid || `Q${idx + 1}`).toString();
                      //const identifier = `C20_V2024_${(sessionStorage.getItem('chaptercode') || '0').padStart(2, '0')}_${sessionStorage.getItem('selectedLO') || '0'}_${q.type === 'written-response' ? 'WR' : 'MC'}_L${taxonomyid}_EN_ID${idx + 1}`;
                      const bookIdentifier = sessionStorage.getItem('bookIdentifier');
                      const identifier = `${bookIdentifier}_${(sessionStorage.getItem('chaptercode') || '0').padStart(2, '0')}_${sessionStorage.getItem('selectedLO')}_${q.type === 'Written Response' ? 'WR' : 'MC'}_L${taxonomyid}_EN_ID${idx + 1}`;
                      const creativity = (q.CreativityLevel || q.creativity || sessionStorage.getItem('creativityLevel') || 'Moderate').toString();

                      // Determine correct index from CorrectAnswer
                      let correctIndex = -1;
                      const caRaw = (q.CorrectAnswer || q.answer || '').toString();
                      const letterMatch = caRaw.trim().match(/^([A-Da-d])\b/);
                      if (letterMatch) {
                        const letter = letterMatch[1].toUpperCase();
                        correctIndex = 'ABCD'.indexOf(letter);
                      } else if (caRaw) {
                        const normalizedCA = caRaw.replace(/^[A-D]\.|^[a-d]\)/, '').trim().toLowerCase();
                        correctIndex = options.findIndex(o => o.trim().toLowerCase() === normalizedCA);
                      }

                      // Feedback mapping (A-D or 1-4)
                      const fbs: string[] = [
                        (q.FeedbackOption1 || q.feedback1 || q.FeedbackOptionA || '').toString(),
                        (q.FeedbackOption2 || q.feedback2 || q.FeedbackOptionB || '').toString(),
                        (q.FeedbackOption3 || q.feedback3 || q.FeedbackOptionC || '').toString(),
                        (q.FeedbackOption4 || q.feedback4 || q.FeedbackOptionD || '').toString()
                      ];

                      // Build paragraphs for this question
                      docChildren.push(new Paragraph(`Type: ${typeLabel}`));
                      docChildren.push(new Paragraph(`Title: ${identifier}`));
                      const questionLines = questionText.split('\n').filter((line: string) => line.trim().length > 0);
                      if (questionLines.length > 0) {
                        docChildren.push(new Paragraph(`${idx + 1}. ${questionLines[0]}`));
                        questionLines.slice(1).forEach((line: string) => docChildren.push(new Paragraph(line)));
                      } else {
                        docChildren.push(new Paragraph(`${idx + 1}.`));
                      }

                      if (isMC) {
                        options.forEach((opt, i) => {
                          const letter = String.fromCharCode(97 + i); // a, b, c, d
                          const isCorrect = i === correctIndex;
                          const optLine = `${isCorrect ? '*' : ''}${letter}) ${opt}`;
                          docChildren.push(new Paragraph(optLine));
                          const fbText = (fbs[i] || '').toString().trim();
                          const explain = isCorrect
                            ? `~Correct. ${fbText || ''}`
                            : `@Incorrect. ${fbText || ''}`;
                          docChildren.push(new Paragraph(explain));
                        });
                      } else {
                        // Written response: include answer as sample
                        const ans = caRaw || '';
                        docChildren.push(new Paragraph(`Answer: ${ans}`));
                      }

                      docChildren.push(new Paragraph(`Creativity Level: ${creativity}`));
                      docChildren.push(new Paragraph(''));
                    });

                    const doc = new Document({
                      sections: [
                        {
                          properties: {},
                          children: docChildren
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
                }}
              >
                Export All to Word
              </Button>
              <Button
                className="bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300"
                onClick={async () => {
                  // Export all questions to Excel
                  try {
                    const raw = sessionStorage.getItem("questionGenResults");
                    let data = JSON.parse(raw || "null");
                    let results = [];
                    if (Array.isArray(data)) {
                      results = data;
                    } else if (data && Array.isArray(data.data)) {
                      results = data.data;
                    } else if (data && Array.isArray(data.questions)) {
                      results = data.questions;
                    } else if (data && Array.isArray(data.result)) {
                      results = data.result;
                    } else if (data && typeof data === 'object') {
                      const keys = Object.keys(data);
                      if (keys.length > 1 && keys.every(k => !isNaN(Number(k)))) {
                        const arrLike = keys.map(k => data[k]);
                        if (arrLike.every(q => typeof q === 'object' && (q.label || q.Question || q.text))) {
                          results = arrLike;
                        }
                      } else if (data.label || data.Question || data.text) {
                        results = [data];
                      }
                    }
                    if (!Array.isArray(results)) results = [];
                    results = results.filter(Boolean);
                    if (!results.length) {
                      window.alert('No questions to export.');
                      return;
                    }

                    let bookTitle = sessionStorage.getItem('bookTitle') || 'questions';
                    bookTitle = bookTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');

                    const XLSX = await import('xlsx');
                    let fileName = "";
                    let wsData = [];

                    results.forEach((q, idx) => {
                      let options = [];
                      if (Array.isArray(q.values)) options = q.values;
                      else if (Array.isArray(q.options)) options = q.options;
                      //options = options.map(opt => typeof opt === 'string' ? opt : (opt?.text || opt?.value || ''));
                      options = options.map(opt => {
                        let str = typeof opt === 'string' ? opt : (opt?.text || opt?.value || '');
                        // Remove prefix pattern like "A. ", "B. ", "A, ", "B, " etc.
                        return str.replace(/^[A-Z][.,]\s*/, '');
                      });
                      const stem = formatQuestionTextForDisplay(q.label || q.Question || q.text || q.QuestionText || '');
                      const type = q.QuestionType || (options.length > 0 ? 'Multiple Choice' : 'Written Response');
                      const maxScore = q.MaxMarks || q.marks || q.Marks || 1;
                      //const correctAnswer = q.CorrectAnswer || q.answer || '';
                      const correctAnswer = q.CorrectAnswer || q.answer || '';
                      const letter = correctAnswer.trim().charAt(0).toUpperCase();
                      const numericValue = letter.charCodeAt(0) - 'A'.charCodeAt(0) + 1;

                      // numericValue will be 1 if letter is 'A', 2 if 'B', ... etc.


                      const keyPoints = q.KeyPoints || q.keypoints || '';

                      //formatting key points as lists
                      let formattedKeyPoints = '';
                      if (Array.isArray(keyPoints) && keyPoints.length > 0) {
                        formattedKeyPoints = keyPoints.map(point => '• ' + point).join('\n');
                      }
                      fileName = type;
                      let userDetails = '';
                      try {
                        const stats = JSON.parse(sessionStorage.getItem('usageStats') || 'null');
                        if (Array.isArray(stats) && stats.length > 7 && stats[7]) {
                          userDetails = String(stats[7]);
                        }
                      } catch { }
                      if (!userDetails) {
                        try {
                          const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
                          userDetails = userInfo.userName || userInfo.userCode || userInfo.email || '';
                        } catch { }
                      }

                      const study = sessionStorage.getItem('studyName') || sessionStorage.getItem('chaptercode') || '';
                      const learningObjective = sessionStorage.getItem('selectedLoName') || q.LearningObjective || sessionStorage.getItem('locode') || '';
                      const creativityLevel = sessionStorage.getItem("selectedCreativityLevel") || '';
                      const taxonomy = sessionStorage.getItem("selectedTaxonomy") || '';
                      const taxonomyid = taxonomy == "Remember" ? 1 : taxonomy == "Understand" ? 2 : taxonomy == "Apply" ? 3 : taxonomy == "Analyze" ? 4 : taxonomy == "Evaluate" ? 5 : taxonomy == "Create" ? 6 : 0;

                      const source = sessionStorage.getItem('selectedGenerationMode') || '';
                      const bookName = sessionStorage.getItem('bookTitle') || '';
                      const referenceInfo = q.ReferenceInfo || '';

                      const rawLO = learningObjective;
                      const normalizedLO = rawLO.startsWith('LO') ? rawLO : `LO${rawLO}`;
                      const loName = sessionStorage.getItem('selectedLoName')
                      const bookIdentifier = sessionStorage.getItem('bookIdentifier');
                      const identifier = `${bookIdentifier}_${(sessionStorage.getItem('chaptercode') || '0').padStart(2, '0')}_${sessionStorage.getItem('selectedLO')}_${type === 'Written Response' ? 'WR' : 'MC'}_L${taxonomyid}_EN_ID${idx + 1}`;

                      if (type === 'Written Response') {
                        if (wsData.length === 0) {
                          wsData.push([
                            'Question Identifier',
                            'Question Stem',
                            'Type',
                            'Max Score',
                            'Source',
                            'Correct Answer',
                            'Key Points',
                            'Book Name',
                            'Reference Info',
                            'User Details',
                            'Study',
                            'Learning Objectives',
                            'Taxonomy',
                            'Creativity Level'
                          ]);
                        }

                        wsData.push([
                          identifier,
                          stem,
                          type,
                          maxScore,
                          source,
                          correctAnswer,
                          formattedKeyPoints,
                          bookName,
                          referenceInfo,
                          userDetails,
                          study,
                          loName,
                          taxonomyid,
                          creativityLevel
                        ]);
                      } else {
                        if (wsData.length === 0) {
                          wsData.push([
                            'Question Indentifier',
                            'Question Stem',
                            'Type',
                            'Max Score',
                            'Option 1',
                            'Option 2',
                            'Option 3',
                            'Option 4',
                            'Correct Answer',
                            'Feedback Option1',
                            'Feedback Option2',
                            'Feedback Option3',
                            'Feedback Option4',
                            'Source',
                            'Book Name',
                            'Reference Info',
                            'User Details',
                            'Study',
                            'Learning Objective',
                            'Taxonomy',
                            'Creativity Level'
                          ]);
                        }

                        const fb1 = q.FeedbackOption1 || q.feedback1 || q.FeedbackOptionA || '';
                        const fb2 = q.FeedbackOption2 || q.feedback2 || q.FeedbackOptionB || '';
                        const fb3 = q.FeedbackOption3 || q.feedback3 || q.FeedbackOptionC || '';
                        const fb4 = q.FeedbackOption4 || q.feedback4 || q.FeedbackOptionD || '';

                        wsData.push([
                          identifier,
                          stem,
                          type,
                          maxScore,
                          options[0] || '',
                          options[1] || '',
                          options[2] || '',
                          options[3] || '',
                          numericValue,
                          fb1,
                          fb2,
                          fb3,
                          fb4,
                          source,
                          bookName,
                          referenceInfo,
                          userDetails,
                          study,
                          loName,
                          taxonomyid,
                          creativityLevel
                        ]);
                      }
                    });

                    const columnWidths = wsData[0].map((_, colIndex) => {
                      const maxLength = wsData.reduce((max, row) => {
                        const cell = row[colIndex];
                        const len = cell ? cell.toString().length : 0;
                        return Math.max(max, len);
                      }, 10);
                      return { wch: maxLength };
                    });

                    const ws = XLSX.utils.aoa_to_sheet(wsData);
                    ws['!cols'] = columnWidths;

                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, fileName);
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    const blob = new Blob([wbout], { type: 'application/octet-stream' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${bookTitle}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                    }, 100);
                  } catch (e) {
                    window.alert('Failed to export to Excel.');
                  }
                }}
              >
                Export All to Excel
              </Button>
            </div>
          </div>
          {/* Display questions from genResults state */}
          {(() => {
            // Use genResults state if available, otherwise fall back to localStorage
            let results = genResults;
            if (!results || !Array.isArray(results)) {
              try {
                const raw = sessionStorage.getItem("questionGenResults");
                const data = JSON.parse(raw || "null");
                // Try all common array locations
                if (Array.isArray(data)) {
                  results = data;
                } else if (data && Array.isArray(data.data)) {
                  results = data.data;
                } else if (data && Array.isArray(data.questions)) {
                  results = data.questions;
                } else if (data && Array.isArray(data.result)) {
                  results = data.result;
                } else if (data && typeof data === 'object') {
                  // If the object has multiple numbered keys (0,1,2,3...), treat as array-like
                  const keys = Object.keys(data);
                  if (keys.length > 1 && keys.every(k => !isNaN(Number(k)))) {
                    // Only treat as array if all values are objects with a question/label property
                    const arrLike = keys.map(k => data[k]);
                    if (arrLike.every(q => typeof q === 'object' && (q.label || q.Question || q.text))) {
                      results = arrLike;
                    }
                  } else if (data.label || data.Question || data.text) {
                    results = [data];
                  }
                }
              } catch { }
              // Flatten if any nested arrays (defensive)
              if (Array.isArray(results) && results.length === 1 && Array.isArray(results[0])) {
                results = results[0];
              }
              // Defensive: if results is not an array but is a non-null object, wrap it
              if (!Array.isArray(results) && results && typeof results === 'object') {
                results = [results];
              }
            }
            // Remove any null/undefined entries
            results = Array.isArray(results) ? results.filter(Boolean) : [];

            if (!results || results.length === 0) {
              return <div className="p-8 text-center text-gray-500">No generated questions found. Please generate questions first.</div>;
            }
            return results.map((q, idx) => (
              <Card key={q.id || idx} className="mb-6 border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="bg-black text-white px-3 py-1 rounded text-sm font-medium">Question {idx + 1}</span>
                      {q.MaxMarks && <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-sm">{q.MaxMarks} Marks</span>}
                      <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded text-sm">
                        {q.QuestionType === "Written Response" || (!q.values || !Array.isArray(q.values) || q.values.length === 0) ? "Written Response" : "Multiple Choice"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {(sessionStorage.getItem('isSpeechEnabled') !== 'false' && localStorage.getItem('isSpeechEnabled') !== 'false') && (() => {
                        const qKey = String(q.id || q.questionid || `q_${idx}`);
                        const isPlaying = playingQuestionId === qKey;
                        return (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={isPlaying ? "text-blue-600 font-medium" : "text-gray-600 hover:text-gray-900"}
                            title={isPlaying ? "Stop reading" : "Read question"}
                            aria-label={isPlaying ? "Stop reading question" : "Read question"}
                            onClick={() => handleSpeak(q, qKey)}
                          >
                            {isPlaying ? (
                              <>
                                <VolumeX className="w-4 h-4 mr-1" />
                                Stop
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-4 h-4 mr-1" />
                                Speak
                              </>
                            )}
                          </Button>
                        );
                      })()}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-600"
                        onClick={() => {
                          setSelectedQuestion(q)
                          setQuestionType(q.values && Array.isArray(q.values) && q.values.length > 0 ? "multiple-choice" : "written-response")
                          setValidationErrors({ options: ['', '', '', ''], correctAnswer: '', questionStem: '', sampleAnswer: '', keyPoints: ['', '', '', '', ''], feedbacks: ['', '', '', ''] }) // Reset validation errors
                          // Initialize editing key points from question data
                          const keyPoints = getKeyPointsFromQuestion(q)
                          setEditingKeyPoints(keyPoints)
                          setIsEditDialogOpen(true)
                        }}
                      >
                        <Edit3 className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-purple-600"
                        onClick={() => {
                          setSelectedQuestion(q)
                          setIsPreviewDialogOpen(true)
                          setQuestionType(q.values && Array.isArray(q.values) && q.values.length > 0 ? "multiple-choice" : "written-response")
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => {
                          setQuestionToDelete(q);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4 whitespace-pre-line">
                    {formatQuestionTextForDisplay(q.label || q.Question || q.text || q.QuestionText)}
                  </h4>
                  {q.values && Array.isArray(q.values) && q.values.length > 0 ? (
                    <>
                      <div className="space-y-3 mb-4">
                        {q.values.map((option, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-3 p-3 rounded-lg ${q.CorrectAnswer && q.CorrectAnswer.startsWith(String.fromCharCode(65 + i)) ? 'bg-green-50 border border-green-200' : 'border border-gray-200'}`}
                          >
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${q.CorrectAnswer && q.CorrectAnswer.startsWith(String.fromCharCode(65 + i)) ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{String.fromCharCode(65 + i)}</span>
                            <span className={q.CorrectAnswer && q.CorrectAnswer.startsWith(String.fromCharCode(65 + i)) ? 'text-gray-900' : 'text-gray-700'}>{option.replace(/^[A-D]\.\s*/, '')}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-2">
                        <p className="text-sm text-blue-900">
                          <strong>Correct Answer:</strong> {q.CorrectAnswer}
                        </p>
                      </div>
                      {/* Feedback for each option if present */}
                      {Object.keys(q).filter(k => k.startsWith('FeedbackOption')).length > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-2">
                          <div className="font-medium mb-1">Feedback:</div>
                          <ul className="list-disc ml-6">
                            {Object.keys(q).filter(k => k.startsWith('FeedbackOption')).map((k, i) => (
                              <li key={i}><strong>{k.replace('FeedbackOption', '')}:</strong> {q[k]}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-2">
                      <div className="flex items-start gap-3 mb-3">
                        <MessageSquare className="w-5 h-5 text-green-600 mt-0.5" />
                        <h5 className="font-medium text-green-900">Sample Answer:</h5>
                      </div>
                      <p className="text-green-800 leading-relaxed">{q.CorrectAnswer || q.answer}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {q.LearningObjective && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                        <span className="font-medium">Learning Objective:</span> {sessionStorage.getItem('selectedLoName')}
                      </div>
                    )}
                    {q.ReferenceInfo && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                        <span className="font-medium">Reference Info:</span> {q.ReferenceInfo}
                      </div>
                    )}
                    {q.BookName && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                        <span className="font-medium">Knowledge Base:</span>{sessionStorage.getItem("bookTitle")}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ));
          })()}
        </div>
        {/* Footer */}
        {activeTab === "generate" && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white text-xs">⚡</span>
              </div>
              <span>Powered by advanced AI technology</span>
            </div>
          </div>
        )}

        {/* Repository Tab Content */}
        {activeTab === "repository" && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-600">Total Questions</p>
                      <p className="text-2xl font-bold" style={{ color: "#1c398e", fontSize: '1.25rem' }}>
                        1,247
                      </p>
                      <p className="text-xs text-gray-500">+15% this month</p>
                    </div>
                    <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Database className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-600">AI Generated</p>
                      <p className="text-2xl font-bold" style={{ color: "#0d542b", fontSize: '1.25rem' }}>
                        892
                      </p>
                      <p className="text-xs text-gray-500">High quality</p>
                    </div>
                    <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-purple-600" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-600">This Week</p>
                      <p className="text-2xl font-bold" style={{ color: "#59168b", fontSize: '1.25rem' }}>
                        47
                      </p>
                      <p className="text-xs text-gray-500">New questions</p>
                    </div>
                    <div className="h-8 w-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <FileText className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border border-gray-200">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-600">Contributors</p>
                      <p className="text-2xl font-bold" style={{ color: "#7e2a0c", fontSize: '1.25rem' }}>
                        12
                      </p>
                      <p className="text-xs text-gray-500">Active authors</p>
                    </div>
                    <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
                      <User className="h-5 w-5 text-orange-600" />
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Filters & Search */}
            <Card className="border border-gray-200">
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Settings2 className="h-4 w-4" />
                    Filters & Search
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Source Type</label>
                      <Select defaultValue="all-sources">
                        <SelectTrigger className="bg-white border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="all-sources">All Sources</SelectItem>
                          <SelectItem value="book-based">Book Based</SelectItem>
                          <SelectItem value="ai-generated">AI Generated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Study Area</label>
                      <Select defaultValue="all-areas">
                        <SelectTrigger className="bg-white border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="all-areas">All Areas</SelectItem>
                          <SelectItem value="cyber-risk">Cyber Risk</SelectItem>
                          <SelectItem value="risk-management">Risk Management</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Question Type</label>
                      <Select defaultValue="all-types">
                        <SelectTrigger className="bg-white border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="all-types">All Types</SelectItem>
                          <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                          <SelectItem value="true-false">True/False</SelectItem>
                          <SelectItem value="short-answer">Short Answer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Difficulty</label>
                      <Select defaultValue="all-levels">
                        <SelectTrigger className="bg-white border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="all-levels">All Levels</SelectItem>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Search Questions</label>
                    <div className="relative">
                      <Sparkles className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <input
                        placeholder="Search questions, topics, or content..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Questions Table */}
            <Card className="border border-gray-200">
              <div className="p-0">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">3 Questions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 border-gray-200">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Selected
                    </Button>
                    <Button variant="outline" size="sm" className="border-gray-200">
                      <FileText className="h-4 w-4 mr-1" />
                      Export to Word
                    </Button>
                    <Button variant="outline" size="sm" className="border-gray-200">
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      Export to Excel
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left p-4 text-sm font-medium text-gray-700 w-12">
                          <input type="checkbox" className="rounded border-gray-300" />
                        </th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700 w-16">#</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700 w-48">Question ID</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Question</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Type</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Topic</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Difficulty</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Created</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Render API data here */}
                      {loading ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-gray-500">Loading...</td>
                        </tr>
                      ) : error ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-red-500">{error}</td>
                        </tr>
                      ) : questions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-gray-500">No questions found.</td>
                        </tr>
                      ) : (
                        questions.map((q, idx) => (
                          <tr key={q.id || q.questionid || idx} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="p-4">
                              <input type="checkbox" className="rounded border-gray-300" />
                            </td>
                            <td className="p-4 text-sm font-medium text-gray-900">{idx + 1}</td>
                            <td className="p-4 text-xs font-mono text-gray-600">{q.QuestionID || q.questionid || q.id}</td>
                            <td className="p-4 text-sm text-gray-900 max-w-md">
                              <p className="truncate">{q.Question || q.question || q.text || q.QuestionText}</p>
                            </td>
                            <td className="p-4 text-sm text-gray-700">{q.QuestionType || q.type || q.questiontype || q.questiontypeid || 'N/A'}</td>
                            <td className="p-4 text-sm" style={{ color: "#7e2a0c" }}>{q.Topic || q.topic || q.topicname || q.subject || 'N/A'}</td>
                            <td className="p-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${q.Difficulty === 'Easy' ? 'bg-green-100 text-green-800' : q.Difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800' : q.Difficulty === 'Hard' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>
                                {q.Difficulty || q.difficulty || q.difficultylevel || 'N/A'}
                              </span>
                            </td>
                            <td className="p-4 text-sm text-gray-500">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {(() => {
                                  // Try all possible date fields
                                  const dateVal = q.CreatedAt || q.createdat || q.created || q.date || q.created_date || q.createdDate;
                                  if (!dateVal || typeof dateVal !== 'string' || dateVal.trim() === '' || dateVal === 'null' || dateVal === 'undefined') return 'N/A';
                                  // Try parsing as date string
                                  const parsed = new Date(dateVal);
                                  if (!isNaN(parsed.getTime())) return parsed.toLocaleString();
                                  // Try parsing as timestamp
                                  if (!isNaN(Number(dateVal))) {
                                    const ts = Number(dateVal);
                                    const parsedTs = new Date(ts);
                                    if (!isNaN(parsedTs.getTime())) return parsedTs.toLocaleString();
                                  }
                                  // Try parsing as ISO string
                                  try {
                                    const iso = new Date(Date.parse(dateVal));
                                    if (!isNaN(iso.getTime())) return iso.toLocaleString();
                                  } catch { }
                                  // Fallback: show N/A, never blank
                                  return 'N/A';
                                })()}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-6 border-b relative">
            {/* <DialogClose asChild>
              <button className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 p-1">
                <span className="sr-only">Close</span>
                <X className="h-4 w-4" />
              </button>
            </DialogClose> */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Edit3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-gray-900">
                  {questionType === "written-response" ? "Edit Written Response" : "Edit Multiple Choice"}
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  {questionType === "written-response"
                    ? "Modify the question content, sample answer, key points, and metadata below."
                    : "Modify the question content, options, feedback and metadata below."
                  }
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
                defaultValue={selectedQuestion
                  ? formatQuestionTextForDisplay(selectedQuestion.label || selectedQuestion.Question || selectedQuestion.text || selectedQuestion.QuestionText || "")
                  : "Why are speculative risks generally excluded from insurance coverage, and how does this differ from the treatment of pure risks?"}
                className={`min-h-[100px] text-gray-900 bg-gray-50 resize-none ${validationErrors.questionStem ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                  }`}
                placeholder="Enter your question here..."
                data-question-stem-textarea
              />
              {validationErrors.questionStem && (
                <p className="text-red-500 text-sm mt-1">{validationErrors.questionStem}</p>
              )}
            </div>

            {questionType === "written-response" ? (
              <>
                {/* Sample Answer */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Sample Answer</h3>
                  </div>

                  <Textarea
                    defaultValue={selectedQuestion && selectedQuestion.CorrectAnswer ? selectedQuestion.CorrectAnswer : "Speculative risks involve the possibility of gain or loss, making them unsuitable for insurance coverage, which is designed for predictable and measurable risks like pure risks. Pure risks only involve the chance of loss or no loss, allowing insurers to calculate premiums and manage claims effectively."}
                    className={`min-h-[120px] text-gray-900 bg-gray-50 resize-none ${validationErrors.sampleAnswer ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                      }`}
                    placeholder="Enter the sample answer..."
                    data-sample-answer-textarea
                  />
                  {validationErrors.sampleAnswer && (
                    <p className="text-red-500 text-sm mt-1">{validationErrors.sampleAnswer}</p>
                  )}
                </div>

                {/* Key Points */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                        <List className="w-4 h-4 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Key Points</h3>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      onClick={addKeyPoint}
                    >
                      <Plus className="w-4 h-4" />
                      Add Point
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {editingKeyPoints.map((point, index) => (
                      <div key={index} className="relative flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 mt-1">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <Textarea
                            value={point}
                            onChange={(e) => updateKeyPoint(index, e.target.value)}
                            className={`w-full min-h-[60px] bg-white resize-none ${validationErrors.keyPoints[index] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                              }`}
                            placeholder={`Enter key point ${index + 1}...`}
                            data-key-point-textarea
                          />
                          {validationErrors.keyPoints[index] && (
                            <p className="text-red-500 text-sm mt-1">{validationErrors.keyPoints[index]}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 flex-shrink-0 mt-1"
                          onClick={() => deleteKeyPoint(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-blue-800">
                        <strong>Tip:</strong> Key points should highlight the main concepts, differences, or important aspects that students should understand from this question.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div>
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
                    {['A', 'B', 'C', 'D'].map((option, index) => (
                      <div key={option} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                        <div className="w-10 h-10 bg-white border-2 border-gray-300 rounded-lg flex items-center justify-center text-sm font-bold text-gray-700 mt-1 shadow-sm">
                          {option}
                        </div>
                        <div className="flex-1">
                          <Textarea
                            defaultValue={selectedQuestion && selectedQuestion.values && selectedQuestion.values[index] ?
                              (selectedQuestion.values[index].replace(/^[A-D]\.\s*/, '')) :
                              [
                                "Pure risk involves only the possibility of loss or no loss, making it insurable.",
                                "Speculative risk involves the possibility of gain, making it insurable.",
                                "Pure risk involves both gain and loss, making it uninsurable.",
                                "Speculative risk involves only loss, making it uninsurable."
                              ][index]
                            }
                            className={`w-full min-h-[80px] resize-none focus:border-purple-400 focus:ring-purple-100 ${validationErrors.options[index] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                              }`}
                            placeholder={`Enter option ${option}...`}
                            data-option-textarea
                            onChange={(e) => {
                              // If the currently selected correct option points to this index, update the correct answer textarea
                              const correctSelect = document.querySelector('[data-correct-answer-select]') as HTMLSelectElement;
                              const correctTextarea = document.querySelector('[data-correct-answer-textarea]') as HTMLTextAreaElement;
                              if (correctSelect && correctTextarea) {
                                const selected = correctSelect.value; // 'A'..'D'
                                const selIdx = ['A', 'B', 'C', 'D'].indexOf(selected);
                                if (selIdx === index) {
                                  // Replace the correct answer textarea value
                                  correctTextarea.value = e.target.value;
                                }
                              }
                            }}
                          />
                          {validationErrors.options[index] && (
                            <p className="text-red-500 text-sm mt-1">{validationErrors.options[index]}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Correct Answer */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mt-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Target className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <Label className="text-lg font-semibold text-gray-800">Correct Answer</Label>
                      <p className="text-sm text-gray-500">Select the correct option</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-4">
                      <Select
                        defaultValue={selectedQuestion && selectedQuestion.CorrectAnswer ? selectedQuestion.CorrectAnswer.charAt(0) : "A"}
                        onValueChange={handleCorrectAnswerChange}
                      >
                        <SelectTrigger className={`w-24 h-12 focus:border-purple-400 ${validationErrors.correctAnswer ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                          }`} data-correct-answer-select>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex-1">
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">Selected Answer Text (Editable)</Label>
                        <Textarea
                          defaultValue={selectedQuestion && selectedQuestion.CorrectAnswer ? selectedQuestion.CorrectAnswer.replace(/^[A-D]\.\s*/, '') : "Pure risk involves only the possibility of loss or no loss, making it insurable."}
                          className={`w-full min-h-[80px] resize-none focus:border-purple-400 focus:ring-purple-100 ${validationErrors.correctAnswer ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                            }`}
                          data-correct-answer-textarea
                        />
                      </div>
                    </div>
                    {validationErrors.correctAnswer && (
                      <p className="text-red-500 text-sm">{validationErrors.correctAnswer}</p>
                    )}
                  </div>
                </div>

                {/* Feedback */}
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
                    {['A', 'B', 'C', 'D'].map((option, index) => {
                      const feedbackKey = `FeedbackOption${option}`;
                      const defaultFeedbacks = [
                        'Correct. Pure risk is insurable because it does not include the possibility of gain.',
                        'Incorrect. Speculative risk includes the possibility of gain, which makes it uninsurable.',
                        'Incorrect. Pure risk does not involve gain, only the possibility of loss or no loss.',
                        'Incorrect. Speculative risk involves both loss and gain, making it uninsurable.'
                      ];
                      const fullFeedback = selectedQuestion && selectedQuestion[feedbackKey] ? selectedQuestion[feedbackKey] : defaultFeedbacks[index];
                      // Split into prefix (Correct./Incorrect.) and suffix
                      const match = fullFeedback.trim().match(/^(Correct\.|Incorrect\.)\s*(.*)$/i);
                      const prefix = match ? match[1] : '';
                      const suffix = match ? match[2] : fullFeedback;

                      return (
                        <div key={option} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <Label className="text-sm font-semibold text-gray-800 mb-3 block flex items-center gap-2">
                            <span className="w-6 h-6 bg-white border border-gray-300 rounded-full flex items-center justify-center text-xs font-bold">
                              {option}
                            </span>
                            Option {option} Feedback
                          </Label>
                          <div className="flex gap-3 items-start">
                            <div data-feedback-prefix={option} className={`min-w-[110px] text-sm font-medium p-2 rounded ${prefix.toLowerCase().startsWith('correct') ? 'text-green-700 bg-green-100 border border-green-200' : 'text-red-700 bg-red-100 border border-red-200'}`}>
                              {prefix || (option === (selectedQuestion?.CorrectAnswer || '').toString().charAt(0) ? 'Correct.' : 'Incorrect.')}
                            </div>
                            <Textarea
                              defaultValue={suffix}
                              className={`flex-1 min-h-[80px] resize-none focus:border-orange-400 focus:ring-orange-100 bg-white ${validationErrors.feedbacks[index] ? 'border-red-500 focus:border-red-500' : 'border-gray-200'
                                }`}
                              data-feedback-option-suffix={option}
                            />
                          </div>
                          {validationErrors.feedbacks[index] && (
                            <p className="text-red-500 text-sm mt-1">{validationErrors.feedbacks[index]}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                    <p><strong>Type:</strong> {(selectedQuestion?.QuestionType === "Written Response" || (!selectedQuestion?.values || !Array.isArray(selectedQuestion?.values) || selectedQuestion?.values.length === 0)) ? "Written Response" : "Multiple Choice"}</p>
                    <p><strong>Source:</strong> {sessionStorage.getItem("selectedGenerationMode") || selectedQuestion?.source || 'N/A'}</p>
                    <p><strong>Study:</strong> {sessionStorage.getItem("studyName") || selectedQuestion?.study || 'N/A'}</p>
                    <p><strong>Taxonomy:</strong> {sessionStorage.getItem("selectedTaxonomy") || selectedQuestion?.taxonomy || 'N/A'}</p>
                    <p><strong>Reference info:</strong> {selectedQuestion?.ReferenceInfo || 'N/A'}</p>
                    <p><strong>User Name:</strong> {JSON.parse(sessionStorage.getItem("userInfo") || '{}').username || selectedQuestion?.userName || 'N/A'}</p>
                  </div>
                  {/* Column 2 */}
                  <div className="space-y-4">
                    <p><strong>Marks:</strong> {selectedQuestion?.MaxMarks || 'N/A'}</p>
                    <p><strong>Knowledge Base:</strong> {sessionStorage.getItem("bookTitle") || 'N/A'}</p>
                    <p><strong>Learning Objective:</strong> {sessionStorage.getItem('selectedLoName') || 'N/A'}</p>
                    <p><strong>Creativity Level:</strong> {sessionStorage.getItem("selectedCreativityLevel") || selectedQuestion?.creativitylevelname || 'N/A'}</p>
                  </div>
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
                onClick={() => setIsEditDialogOpen(false)}
                className="flex items-center gap-2" title="Cancel"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button
                onClick={handleSaveChanges}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2" title="save"
              >
                <Check className="w-4 h-4" />
                Save Changes
              </Button>
            </div>
          </div>


        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-6 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <Eye className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-gray-900">
                  {questionType === "written-response" ? "Preview Written Response" : "Preview Multiple Choice"}
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  {questionType === "written-response"
                    ? "Review the complete written response question with sample answer, key points, and metadata details."
                    : "Review the complete question with all options, feedback and metadata details."

                  }
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
                <h3 className="text-lg font-semibold text-gray-900">Question Stem:</h3>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-900 leading-relaxed whitespace-pre-line">
                  {selectedQuestion
                    ? formatQuestionTextForDisplay(selectedQuestion.label || selectedQuestion.Question || selectedQuestion.text || selectedQuestion.QuestionText || "")
                    : "Why are speculative risks generally excluded from insurance coverage, and how does this differ from the treatment of pure risks?"}
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
                      {selectedQuestion && selectedQuestion.CorrectAnswer ?
                        selectedQuestion.CorrectAnswer.replace(/^[A-D]\.\s*/, '') :
                        "Speculative risks involve the possibility of gain or loss, making them unsuitable for insurance coverage, which is designed for predictable and measurable risks like pure risks. Pure risks only involve the chance of loss or no loss, allowing insurers to calculate premiums and manage claims effectively."
                      }
                    </p>
                  </div>
                </div>

                {/* Key Points */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                      <List className="w-4 h-4 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Key Points:</h3>
                  </div>

                  <div className="p-6 bg-green-50 border border-green-200 rounded-lg space-y-4">
                    {getKeyPointsFromQuestion(selectedQuestion).map((point, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                          •
                        </div>
                        <p className="text-green-800 leading-relaxed">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>
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
                    {selectedQuestion && selectedQuestion.values && Array.isArray(selectedQuestion.values) && selectedQuestion.values.length > 0 ? (
                      selectedQuestion.values.map((option, i) => {
                        const optionLetter = String.fromCharCode(65 + i);
                        const isCorrect = selectedQuestion.CorrectAnswer && selectedQuestion.CorrectAnswer.startsWith(optionLetter);

                        return (
                          <div key={i} className={`flex items-start gap-4 p-4 rounded-lg border ${isCorrect ? 'border-2 border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                            } transition-colors`}>
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 mt-1 ${isCorrect ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-white border border-gray-300 text-gray-700'
                              } shadow-sm`}>
                              {optionLetter}
                            </div>
                            <div className="flex-1">
                              <p className={`${isCorrect ? 'text-gray-900' : 'text-gray-700'}`}>
                                {typeof option === 'string' ? option.replace(/^[A-D]\.\s*/, '') : option.text || ''}
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
                      // Fallback UI when no options are available
                      <div className="text-center py-4 text-gray-500">
                        No options available
                      </div>
                    )}
                  </div>
                </div>

                {/* Correct Answer */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
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
                      {selectedQuestion?.CorrectAnswer || 'No correct answer specified'}
                    </p>
                  </div>
                </div>

                {/* Feedback */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
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
                    {selectedQuestion?.values?.map((option, i) => {
                      const optionLetter = String.fromCharCode(65 + i);
                      const isCorrect = selectedQuestion.CorrectAnswer &&
                        selectedQuestion.CorrectAnswer.startsWith(optionLetter);

                      // Default feedback if not provided
                      let feedback = '';
                      if (isCorrect) {
                        feedback = selectedQuestion[`FeedbackOption${optionLetter}`] ||
                          'Correct. This option is the right answer.';
                      } else {
                        feedback = selectedQuestion[`FeedbackOption${optionLetter}`] ||
                          `Incorrect. This option is not the correct answer.`;
                      }

                      return (
                        <div key={i} className={`p-4 rounded-lg border ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                          }`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
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
                    <p><strong>Type:</strong> {(selectedQuestion?.QuestionType === "Written Response" || (!selectedQuestion?.values || !Array.isArray(selectedQuestion?.values) || selectedQuestion?.values.length === 0)) ? "Written Response" : "Multiple Choice"}</p>
                    <p><strong>Source:</strong> {sessionStorage.getItem("selectedGenerationMode") || 'N/A'}</p>
                    <p><strong>Study:</strong> {sessionStorage.getItem("studyName") || 'N/A'}</p>
                    <p><strong>Taxonomy:</strong> {sessionStorage.getItem("selectedTaxonomy") || 'N/A'}</p>
                    <p><strong>Reference info:</strong> {selectedQuestion?.ReferenceInfo || 'N/A'}</p>
                    <p><strong>User Name:</strong> {JSON.parse(sessionStorage.getItem("userInfo") || '{}').username || 'N/A'}</p>
                  </div>
                  {/* Column 2 */}
                  <div className="space-y-4">
                    <p><strong>Marks:</strong> {selectedQuestion?.MaxMarks || 'N/A'}</p>
                    <p><strong>Knowledge Base:</strong> {sessionStorage.getItem("bookTitle") || 'N/A'}</p>
                    <p><strong>Learning Objective:</strong> {sessionStorage.getItem('selectedLoName') || 'N/A'}</p>
                    <p><strong>Creativity Level:</strong> {sessionStorage.getItem("selectedCreativityLevel") || 'N/A'}</p>
                  </div>
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
                onClick={() => setIsPreviewDialogOpen(false)}
                className="flex items-center gap-2"
                title="Close"
              >
                <X className="w-4 h-4" />
                Close Preview
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900">
                  Changes Updated Successfully!
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Your question has been updated.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex justify-end pt-4">
            <Button
              onClick={() => setShowSuccessDialog(false)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Navigation Confirmation Dialog */}
      <Dialog open={showNavigationDialog} onOpenChange={setShowNavigationDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900">
                  Unsaved Changes
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  You have unsaved changes. Do you want to leave without saving?
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={cancelNavigation}
              className="flex items-center gap-2"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmNavigation}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Leave Without Saving
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/*Save All to DB Dialog*/}
      <Dialog open={showSaveAllDialog} onOpenChange={setShowSaveAllDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${saveAllDialogType === "success" ? "bg-green-100" : saveAllDialogType === "info" ? "bg-blue-100" : "bg-red-100"
                }`}>
                {saveAllDialogType === "success" ? (
                  <Check className="w-6 h-6 text-green-600" />
                ) : saveAllDialogType === "info" ? (
                  <Info className="w-6 h-6 text-blue-600" />
                ) : (
                  <X className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900">
                  {saveAllDialogType === "success" ? "Save Successful!" : saveAllDialogType === "info" ? "Note" : "Save Failed"}
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  {saveAllDialogMessage}
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="flex justify-end pt-4">
            <Button
              onClick={() => setShowSaveAllDialog(false)}
              className={saveAllDialogType === "success"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : saveAllDialogType === "info"
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"}
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/*Delete confirm dialog*/}
      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) setQuestionToDelete(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900">
                  Delete Question
                </DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Are you sure you want to delete this question? This action cannot be undone.
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="flex items-center gap-2"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (questionToDelete && genResults && Array.isArray(genResults)) {
                  const updatedResults = genResults.filter(question => question !== questionToDelete);
                  setGenResults(updatedResults);
                  sessionStorage.setItem("questionGenResults", JSON.stringify(updatedResults));
                  setQuestions(prev => prev.filter(question => question.raw !== questionToDelete));
                }
                setShowDeleteDialog(false);
                setQuestionToDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default QuestionResults