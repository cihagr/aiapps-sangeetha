import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link, useLocation } from "react-router-dom";
import { getChapters as getChaptersByBookCode, Chapter, getLearningObjectives, LearningObjective, fetchDropdownOptions } from "../api";
import { Card } from "../components/ui/card";
import { PageLoader } from "../components/ui/loader";
import { Button } from "../components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Switch } from "../components/ui/switch";
import { ArrowLeft, Sparkles, FileText, Zap, Settings2, Target, Globe, Hash, Brain, MessageSquare, Database, User, FileSpreadsheet, Trash2, Eye, Edit3, Clock, Save } from "lucide-react";
import { cp } from "fs";
import axios from "axios";
import { fetchUsageStats } from "@/api";

function transformUsageData(statsRaw: any[]): any[] {
  // Dummy implementation to avoid runtime error
  return statsRaw;
}

const QuestionGenerator = () => {
  // DropdownDashboard state for taxonomy, question type, and quantity
  const [taxonomyList, setTaxonomyList] = useState<string[]>([]);
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  const [questionQuantities, setQuestionQuantities] = useState<number[]>([]);

  // Initialize state with empty values - we'll set them after fetching options
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<string>('');
  const [selectedQuestionType, setSelectedQuestionType] = useState<string>('');
  const [selectedQuantity, setSelectedQuantity] = useState<string | number>('');
  const [selectedCreativityLevel, setSelectedCreativityLevel] = useState<string>('moderate');
  const [selectedResponseOptions, setSelectedResponseOptions] = useState<number>(4);
  const [studynumber, setstudynumber] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [dropdownError, setDropdownError] = useState<string>("");
  const [isChecked, setIsChecked] = useState(false);
  const [selectedOption, setSelectedOption] = useState('Book Based')
  const [learningObjectivesName, setLearningObjectivesName] = useState('');
  const [error, setError] = useState<string>("");

  // Clear dropdown values when component unmounts
  useEffect(() => {
    sessionStorage.setItem("selectedGenerationMode",'Book Based');
    return () => {
      // Clear the dropdown values from localStorage when component unmounts
      sessionStorage.removeItem('selectedTaxonomy');
      sessionStorage.removeItem('selectedQuestionType');
      sessionStorage.removeItem('selectedQuantity');
    };
  }, []);

  // Always persist taxonomy label when it changes (covers initial default and user changes)
  useEffect(() => {
    sessionStorage.setItem("pointValue",selectedQuestionType == "Written Response" ? "5" : "1");
    sessionStorage.setItem("questiontypeid",selectedQuestionType == "Written Response" ? "7" : "1");
  }, [selectedQuestionType]);

  useEffect(() => {
    const fetchDropdowns = async () => {
      // Clear previous values first
      setSelectedTaxonomy('');
      setSelectedQuestionType('');
      setSelectedQuantity('');
      
      // Try to get session info from localStorage, fallback to userInfo if needed
      let custcode = sessionStorage.getItem("custcode");
      let orgcode = sessionStorage.getItem("orgcode");
      let appcode = sessionStorage.getItem("appcode");
      
      // If any are missing, try to get from userInfo (like ItemGeneration)
      if (!custcode || !orgcode) {
        const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
        if (!custcode) custcode = userInfo.customerCode;
        if (!orgcode) orgcode = userInfo.orgCode;
        if (!appcode) appcode = "IG";
        // Set them in localStorage for API compatibility
        if (custcode) sessionStorage.setItem("custcode", custcode);
        if (orgcode) sessionStorage.setItem("orgcode", orgcode);
        if (appcode) sessionStorage.setItem("appcode", appcode);
      }
      if (!custcode || !orgcode || !appcode) {
        setDropdownError("Please login again. Required session information is missing.");
        setTaxonomyList([]);
        setQuestionTypes([]);
        setQuestionQuantities([]);
        return;
      }
      try {
        const data = await fetchDropdownOptions();
        let found = false;
        data.forEach((item: any) => {
          const parsed = JSON.parse(item.jsonDetails);
          if (item.type === "taxonomy") {
            const taxonomies = parsed.map((t: any) => t.taxonomy);
            setTaxonomyList(taxonomies);
            
            // Always set and persist the first taxonomy as default if available
            // if (taxonomies.length > 0) {
            //   const defaultTaxonomy = taxonomies[0];
            //   setSelectedTaxonomy(defaultTaxonomy);
            //   if (isInitialLoad) {
            //   sessionStorage.setItem('selectedTaxonomy', defaultTaxonomy);
            //   }
            // }
            found = true;
          }
          if (item.type === "QuestionType") {
            const questionTypes = parsed.map((q: any) => q.questiontype);
            if (!questionTypes.includes("Scenario Based")) {
              questionTypes.push("Scenario Based");
            }
            setQuestionTypes(questionTypes);
            
            // Set the first question type as default on initial load
            if (questionTypes.length > 0) {
              const defaultType = questionTypes[0];
              setSelectedQuestionType(defaultType);
              if (isInitialLoad) {
                sessionStorage.setItem('selectedQuestionType', defaultType);
              }
            }
            found = true;
          }
          if (item.type === "numberof_questions") {
            const quantities = parsed.map((n: any) => n.numberof_questions);
            setQuestionQuantities(quantities);
            
            // Set the first quantity as default on initial load
            if (quantities.length > 0) {
              const defaultQuantity = quantities[0];
              setSelectedQuantity(defaultQuantity);
              if (isInitialLoad) {
                sessionStorage.setItem('selectedQuantity', defaultQuantity.toString());
              }
            }
            found = true;
          }
        });
        if (!found) {
          setDropdownError("No dropdown data found. Please contact support.");
        } else {
          setDropdownError("");
        }

        // Mark initial load as complete
        setIsInitialLoad(false);
        
        // Initialize creativity level from localStorage or set default
        const savedCreativityLevel = sessionStorage.getItem("selectedCreativityLevel");
        if (savedCreativityLevel) {
          setSelectedCreativityLevel(savedCreativityLevel);
        } else {
          setSelectedCreativityLevel('moderate');
          sessionStorage.setItem('selectedCreativityLevel', 'moderate');
        }
        
        // Initialize response options from localStorage or set default
        const savedResponseOptions = sessionStorage.getItem("selectedResponseOptions");
        if (savedResponseOptions) {
          setSelectedResponseOptions(parseInt(savedResponseOptions));
        } else {
          setSelectedResponseOptions(4);
          sessionStorage.setItem('selectedResponseOptions', '4');
        }
        
        //fetching lonumbers
        const book = JSON.parse(sessionStorage.getItem("selectedBook") || '{}')
      } catch (error) {
        setDropdownError("Failed to load dropdowns. Please check your connection or login again.");
        setTaxonomyList([]);
        setQuestionTypes([]);
        setQuestionQuantities([]);
      }
    };
    fetchDropdowns();
  }, []);

  // Selected Book Image Path (from ItemGeneration)
  const [bookImagePath, setBookImagePath] = useState<string>(() => {
    const path = sessionStorage.getItem('bookImagePath');
    return path && path.trim().length > 0 ? path : '/assets/itemGenerationImage.png';
  });
  useEffect(() => {
    const refresh = () => {
      const path = sessionStorage.getItem('bookImagePath');
      setBookImagePath(path && path.trim().length > 0 ? path : '/assets/itemGenerationImage.png');
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // --- Book Title State and Effect ---
  const { bookCode } = useParams();
  const location = useLocation();
  const [bookTitle, setBookTitle] = useState("");

  function getBookTitle() {
    // 1. Prefer navigation state (from ItemGeneration.tsx)
    if (location && location.state && (location.state.bookTitle || location.state.title || location.state.name)) {
      // Try all possible keys for book name
      return location.state.bookTitle || location.state.title || location.state.name;
    }
    // 2. Fallback to localStorage logic
    let code = "1";
    if (typeof bookCode === 'string' && bookCode) {
      code = bookCode;
    } else {
      const stored = sessionStorage.getItem('bookCode');
      if (stored) code = stored;
    }
    let bookTitle = "";
    try {
      const cardRaw = sessionStorage.getItem(`bookCard_${code}`);
      if (cardRaw) {
        const card = JSON.parse(cardRaw);
        // Try to get the book title from the card object, including nested book.title
        bookTitle = card.title || card.bookTitle || card.name || (card.book && card.book.title) || "";
      }
    } catch { }
    if (!bookTitle) {
      bookTitle = sessionStorage.getItem('bookTitle') || "Untitled Book";
    }
    return bookTitle;
  }

  useEffect(() => {
    // Always update book title on mount and when navigation state or bookCode changes
    setBookTitle(getBookTitle());
    // Listen for storage changes (e.g., if bookCard or bookTitle changes in another tab)
    const updateBookTitle = () => setBookTitle(getBookTitle());
    window.addEventListener('storage', updateBookTitle);
    return () => window.removeEventListener('storage', updateBookTitle);
  }, [bookCode, location && location.state]);

  let tokenStats = [];
  try {
    const statsRaw = JSON.parse(sessionStorage.getItem("usageStats") || "null");
    if (Array.isArray(statsRaw)) {
      tokenStats = transformUsageData(statsRaw);
    }
  } catch { }
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("generate");
  const [generationMode, setGenerationMode] = useState(false); // true for LLM, false for Knowledge Base

  // Use state and effect for reactive remaining tokens
  const [remainingTokens, setRemainingTokens] = useState(0);

  // Prefer token balance from ItemGeneration's stored stats; fallback to local state
  const getRemainingTokensDisplay = () => {
    try {
      const statsRaw = JSON.parse(sessionStorage.getItem("usageStats") || "null");
      if (Array.isArray(statsRaw)) {
        const raw = statsRaw[2]; // Balance usage as stored by ItemGeneration
        if (typeof raw === "number") return raw.toLocaleString();
        if (typeof raw === "string") {
          const num = Number(raw.replace(/[^\d.-]/g, ""));
          return isNaN(num) ? raw : num.toLocaleString();
        }
      }
    } catch { }
    return Number(remainingTokens || 0).toLocaleString();
  };

  // Chapter dropdown state (Study Domain)
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersError, setChaptersError] = useState<string>("");

  // Learning Objectives (LO) dropdown state
  const [learningObjectives, setLearningObjectives] = useState<LearningObjective[]>([]);
  // Default selected LO comes from sessionStorage or 'ALL'
  const [selectedLO, setSelectedLO] = useState<string>(() => sessionStorage.getItem('selectedLO') || 'ALL');
  const [loLoading, setLoLoading] = useState(false);
  const [loError, setLoError] = useState<string>("");

  // Point Value
  const [pointValue, setPointValue] = useState(() => sessionStorage.getItem("pointValue") || "1");

  // Additional Instructions
  const [additionalInstructions, setAdditionalInstructions] = useState(() => {
    // Only restore if coming from navigation, not on page refresh
    const navState = window.performance && window.performance.getEntriesByType && window.performance.getEntriesByType('navigation');
    // Defensive: check for type property on PerformanceNavigationTiming
    let isReload = false;
    if (navState && navState.length > 0) {
      const nav = navState[0] as any;
      if (nav && nav.type && nav.type === 'reload') {
        isReload = true;
      }
    }
    if (isReload) {
      // On reload, clear the value
      sessionStorage.removeItem('additionalInstructions');
      return '';
    }
    return sessionStorage.getItem("additionalInstructions") || "";
  });

  // useEffect(() => {
  //   function updateTokens() {
  //     try {
  //       const stats = JSON.parse(sessionStorage.getItem("usageStats") || "null");
  //       let value = 0;
  //       if (Array.isArray(stats)) {
  //         if (typeof stats[2] === "number") {
  //           value = stats[2];
  //         } else if (typeof stats[2] === "string") {
  //           value = Number(stats[2].replace(/,/g, ""));
  //         }
  //       }
  //       setRemainingTokens(isNaN(value) ? 0 : value);
  //     } catch {
  //       setRemainingTokens(0);
  //     }
  //   }
  //   updateTokens();
  //   window.addEventListener("storage", updateTokens);
  //   return () => window.removeEventListener("storage", updateTokens);
  // }, []);

  useEffect(() => {
    // Prefer normalized session values via helper, fall back to stored userInfo
    let userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
    let sessionUserCode = '';
    let sessionCustCode = '';
    let sessionOrgCode = '';
    let sessionAppCode = '';
    try {
      // Lazy-load the session helper to avoid import ordering issues
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sess = require('../lib/session');
      const codes = sess.getSessionCodes();
      sessionUserCode = codes.usercode || '';
      sessionCustCode = codes.custcode || '';
      sessionOrgCode = codes.orgcode || '';
      sessionAppCode = codes.appcode || '';
    } catch {
      // fallback to direct sessionStorage parsing
      sessionUserCode = sessionStorage.getItem('usercode') || sessionStorage.getItem('userCode') || '';
      sessionCustCode = sessionStorage.getItem('custcode') || sessionStorage.getItem('customerCode') || '';
      sessionOrgCode = sessionStorage.getItem('orgcode') || sessionStorage.getItem('orgCode') || '';
      sessionAppCode = sessionStorage.getItem('appcode') || '';
    }

    const payload = {
      custcode: sessionCustCode || (userInfo as any)["customerCode"] || (userInfo as any)["custcode"],
      orgcode: sessionOrgCode || (userInfo as any)["orgCode"] || (userInfo as any)["orgcode"],
      // Do NOT hardcode a usercode; prefer session values or userInfo and allow empty if missing
      usercode: sessionUserCode || (userInfo as any)["userCode"] || (userInfo as any)["usercode"] || "",
      appcode: sessionAppCode || "IG",
      type: 1,
    };

    const getStats = async () => {
      try {
        const stats = await fetchUsageStats(payload);
        if (Array.isArray(stats) && stats[0] && typeof stats[0][2] !== 'undefined') {
          setRemainingTokens(stats[0][2]);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    };

    getStats();
  }, []);

  // Fetch chapters and immediately fetch LOs for the first chapter
  useEffect(() => {
    const fetchLOsForChapter = (chapterCode) => {
      setLoLoading(true);
      setLoError("");
      getLearningObjectives(chapterCode)
        .then((result) => {
          setLearningObjectives(result);
          if (result.length > 0) {
              // If user already selected 'ALL' we should preserve it; otherwise default to first LO
              // Do not auto-select a specific LO on load — keep 'ALL' (displayed as "-- Select --")
              if (sessionStorage.getItem('selectedLO') && sessionStorage.getItem('selectedLO') !== 'ALL') {
                setSelectedLO(sessionStorage.getItem('selectedLO') || 'ALL');
                setLearningObjectivesName(sessionStorage.getItem('learningObjectivesName') || '');
              } else {
                // Default: keep 'ALL' selected and don't overwrite with first LO
                setSelectedLO('ALL');
                setLearningObjectivesName('');
              }
            } else {
              // No LOs available for this chapter
              setSelectedLO('ALL');
              setLearningObjectivesName('');
            }
        })
        .catch(() => {
          setLoError("Failed to load learning objectives");
          setLearningObjectives([]);
          setSelectedLO("");
          setLearningObjectivesName("");
        })
        .finally(() => setLoLoading(false));
    };

    const loadChapters = async () => {
      setChaptersLoading(true);
      setChaptersError("");
      try {
        const result = await getChaptersByBookCode(sessionStorage.getItem("bookType") || "");
        if (Array.isArray(result) && result.length > 0) {
          setChapters(result);

          // Always set the first chapter as selected and fetch LOs
          const firstChapter = result[0];
          if (firstChapter) {
            setSelectedChapter(firstChapter.chapterCode);
            sessionStorage.setItem("chaptercode", firstChapter.chapterCode);
            if (firstChapter.chapterName) {
              sessionStorage.setItem("selectedChapter", firstChapter.chapterName);
            }
            // Show LO as loading and default to ALL (display as -- Select --) while fetching
            setSelectedLO('ALL');
            sessionStorage.setItem('selectedLO', 'ALL');
            setLearningObjectivesName('');
            fetchLOsForChapter(firstChapter.chapterCode);
          }
        } else {
          setChapters([]);
          setSelectedChapter("");
          sessionStorage.removeItem("chaptercode");
          sessionStorage.removeItem("selectedChapter");
          setLearningObjectives([]);
          setSelectedLO("");
          setLearningObjectivesName("");
        }
      } catch (err) {
        setChaptersError("Failed to load chapters");
        setChapters([]);
        setSelectedChapter("");
        setLearningObjectives([]);
        setSelectedLO("");
        setLearningObjectivesName("");
      } finally {
        setChaptersLoading(false);
      }
    };
    loadChapters();
  }, [bookCode]);

  // Handle chapter change (also fetch LOs for the selected chapter)
  const handleChapterChange = (value: string) => {
    setSelectedChapter(value);
    // Find the selected chapter to get its name
    const selectedChapterObj = chapters.find(ch => ch.chapterCode === value);
    if (selectedChapterObj) {
      // Store both chapter code and name in localStorage
      sessionStorage.setItem("chaptercode", value);
      sessionStorage.setItem("selectedChapter", selectedChapterObj.chapterName || value);
    }
    // Reset LO when chapter changes
    setSelectedLO("");
    setLearningObjectives([]);
    setLearningObjectivesName("");
    // Fetch LOs for this chapter
    setLoLoading(true);
    setLoError("");
    getLearningObjectives(value)
      .then((result) => {
        setLearningObjectives(result);
            if (result.length > 0) {
              if (!sessionStorage.getItem('selectedLO') || sessionStorage.getItem('selectedLO') === 'ALL') {
                const loCodeValue = result[0].loCode;
                setSelectedLO(loCodeValue);
                sessionStorage.setItem("selectedLO", loCodeValue);
                setLearningObjectivesName(result[0].loName || "");
                sessionStorage.setItem("learningObjectivesName", result[0].loName || "");
              } else {
                setSelectedLO(sessionStorage.getItem('selectedLO') || 'ALL');
                setLearningObjectivesName(sessionStorage.getItem('learningObjectivesName') || '');
              }
            } else {
              setSelectedLO('ALL');
              setLearningObjectivesName('');
            }
      })
      .catch(() => {
        setLoError("Failed to load learning objectives");
        setLearningObjectives([]);
        setSelectedLO("");
        setLearningObjectivesName("");
      })
      .finally(() => setLoLoading(false));
  };

  const handleGenerateQuestions = () => {
    // Gather all required data for item generation
    let Snumber='';
    switch(studynumber){
        case 0: Snumber = (studynumber + 1) + 'st'; break;
        case 1: Snumber = (studynumber + 1) + 'nd'; break;
        case 2: Snumber = (studynumber + 1) + 'rd'; break;
        default: Snumber = (studynumber + 1) + 'th'; break;
    }
    let LOs = ``;
    let Lo_Pnumber=``;
    let selectedlonumber=0;
    let selectedLoPnumber=``;
    for(let j=0;j<learningObjectives.length;j++){
        LOs=LOs+`${j+1}.${learningObjectives[j].loName}\n`;
  Lo_Pnumber=Lo_Pnumber+`Learning objective ${j+1} : pages from ${(learningObjectives[j] as any).loPnumber || ''},`
    if (learningObjectivesName != '' && learningObjectivesName==learningObjectives[j].loName){
      selectedlonumber=j+1;
    }
    if(selectedLO==learningObjectives[j].loCode){
      selectedLoPnumber=(learningObjectives[j] as any).loPnumber || '';
    }
    }
    //(selectedOption);
    
    const params = {
      question: additionalInstructions,
      //selectedOption: generationMode ? "Book Based" : "Global",
      selectedOption: selectedOption,
      selectedBook: { bookid: sessionStorage.getItem("bookCode") || "2" },
      questiontypeid: selectedQuestionType,
      taxonomyid: selectedTaxonomy,
      difficultylevelid: "1", // You may want to add a difficulty dropdown
      selectedChapterCode: selectedChapter,
      looutcomesId: selectedLO,
      selectedQuantity: selectedQuantity, // Pass as selectedQuantity for downstream
      noofquestions: selectedQuantity, // Always pass as noofquestions for downstream
      creativitylevelid: "1", // You may want to add a creativity dropdown
      agenttype: "1", // You may want to add an agent type selector
      pointValue: pointValue,
      chapter: chapters.find(ch => ch.chapterCode === selectedChapter)?.chapterName || "",// feching chapter name by its code
      studynumber: Snumber,
      loName: sessionStorage.getItem("learningObjectivesName"),
      Lo_Pnumber:selectedOption == "Book Based" ? selectedLoPnumber : Lo_Pnumber,
    };
   
    // Persist current taxonomy label just before navigating (final safeguard)
    if (selectedTaxonomy && selectedTaxonomy.trim().length > 0) {
      sessionStorage.setItem('selectedTaxonomy', selectedTaxonomy.trim());
    }
    navigate("/question-generation-loading", { state: params });
  };

  // Persist Study Domain (Chapter)
  useEffect(() => {
    if (selectedChapter) sessionStorage.setItem("selectedChapter", selectedChapter);
  }, [selectedChapter]);

  // Persist Learning Objective
  useEffect(() => {
    if (selectedLO) sessionStorage.setItem("selectedLO", selectedLO);
  }, [selectedLO]);

  // Persist Point Value
  useEffect(() => {
    if (pointValue) sessionStorage.setItem("pointValue", pointValue);
  }, [pointValue]);

  // Persist Creativity Level
  useEffect(() => {
    if (selectedCreativityLevel) sessionStorage.setItem("selectedCreativityLevel", selectedCreativityLevel);
  }, [selectedCreativityLevel]);

  // Persist Response Options
  useEffect(() => {
    if (selectedResponseOptions) sessionStorage.setItem("selectedResponseOptions", selectedResponseOptions.toString());
  }, [selectedResponseOptions]);

  // Persist Additional Instructions
  useEffect(() => {
    sessionStorage.setItem("additionalInstructions", additionalInstructions);
  }, [additionalInstructions]);

  const handleChange = (cpCode) => {
    // Find the selected chapter to get its code
    const selectedChapterObj = chapters.find(ch => ch.chapterCode === cpCode);
    
    if (selectedChapterObj) {
      // Store the chapter code in localStorage
      sessionStorage.setItem("chaptercode", selectedChapterObj.chapterCode);
      sessionStorage.setItem("selectedChapterName", selectedChapterObj.chapterName || cpCode);
    }
    
    const selectedIndex = chapters.findIndex(ch => ch.chapterCode === cpCode);
    setstudynumber(selectedIndex);
    let chapterName =  chapters.find(ch => ch.chapterCode === cpCode)?.chapterName || "";
    setSelectedChapter(cpCode);
    
  // Clear any existing LO selection when chapter changes and show loading/default state
  setSelectedLO('ALL');
  sessionStorage.setItem('selectedLO', 'ALL');
    setLearningObjectives([]);
    setLearningObjectivesName("");
    // Fetch LOs for this chapter
    setLoLoading(true);
    setLoError("");
    getLearningObjectives(cpCode)
      .then((result) => {
        setLearningObjectives(result);
        if (result.length > 0) {
          // Preserve user choice if previously set to a specific LO; otherwise default to 'ALL'
          if (sessionStorage.getItem('selectedLO') && sessionStorage.getItem('selectedLO') !== 'ALL') {
            setSelectedLO(sessionStorage.getItem('selectedLO') || 'ALL');
            setLearningObjectivesName(sessionStorage.getItem('learningObjectivesName') || '');
          } else {
            setSelectedLO('ALL');
            setLearningObjectivesName('');
          }
        } else {
          setSelectedLO('ALL');
          setLearningObjectivesName('');
        }
      })
      .catch(() => {
        setLoError("Failed to load learning objectives");
        setLearningObjectives([]);
        setSelectedLO("");
        setLearningObjectivesName("");
      })
      .finally(() => setLoLoading(false));
  };

  const handleToggleChange = (isChecked) => {
        setIsChecked(isChecked);
        setGenerationMode(isChecked)
        setSelectedOption(isChecked ? 'LLM' : 'Book Based');
        sessionStorage.setItem("selectedGenerationMode", isChecked ? 'LLM' : 'Book Based');
    };

  const handlePointChange = (e) => {
    setPointValue(e.target.value);
    sessionStorage.setItem("pointValue", e.target.value);
  };

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
              <span className="text-sm text-purple-600 font-medium">Knowledge Base:  {bookTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white text-xs">⚡</span>
              </div>
              <span className="text-sm text-blue-600 font-medium">
                Remaining Tokens: {getRemainingTokensDisplay()}
              </span>
            </div>
            <Link to="/item-generation">
              <Button variant="ghost" size="sm" className="text-gray-600">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Knowledge Base
              </Button>
            </Link>
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
        {(chaptersLoading || loLoading || (isInitialLoad && taxonomyList.length === 0)) && (
          <PageLoader text="Loading stats..." />
        )}
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 max-w-lg">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveTab("generate")}
                className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === "generate"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
              >
                <Sparkles className="h-4 w-4" />
                Generate Questions
              </button>
              <button
                onClick={() => {
                  setActiveTab("repository");
                  navigate("/question-repository");
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

        {activeTab === "generate" && (
          <div className="space-y-6">
            {/* Top Row - Tokens and AI Mode */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Available Tokens */}
              <Card className="p-6 bg-white border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700">Available Tokens</h3>
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <Zap className="w-4 h-4 text-green-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {getRemainingTokensDisplay()}

                </div>
                <div className="text-sm text-green-600 flex items-center gap-1">
                  <span>
                    {/* Show today's token usage from localStorage usageStats[1] if available, else 0 */}
                    {(() => {
                      let today = 0;
                      try {
                        const statsRaw = JSON.parse(sessionStorage.getItem("usageStats") || "null");
                        if (Array.isArray(statsRaw) && statsRaw.length > 1 && statsRaw[1] != null) {
                          if (typeof statsRaw[1] === "number") {
                            today = statsRaw[1];
                          } else if (typeof statsRaw[1] === "string") {
                            const cleaned = statsRaw[1].replace(/[^\d.]/g, "");
                            today = Number(cleaned);
                          }
                        }
                      } catch { }
                      return `+${today.toLocaleString()} today`;
                    })()}
                  </span>
                </div>
              </Card>

              {/* AI Generation Mode */}
              <Card className="p-6 bg-white border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700">AI Generation Mode</h3>
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Settings2 className="w-4 h-4 text-blue-600" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${!generationMode ? 'text-green-600' : 'text-gray-600'}`}>Knowledge Base</span>
                  <Switch
                    checked={generationMode}
                    onCheckedChange={handleToggleChange}
                    className={`${generationMode ? 'data-[state=checked]:bg-blue-600' : 'data-[state=unchecked]:bg-green-600'} transition-colors duration-200`}
                  />
                  <span className={`text-sm font-medium ${generationMode ? 'text-blue-600' : 'text-gray-600'}`}>LLM</span>
                </div>
              </Card>
            </div>

            {/* Main Content Row */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Left Column - Source Material */}
              <div className="lg:col-span-1 space-y-6">
                {/* Source Material */}
                <Card className="p-6 bg-white border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Source Material</h3>
                  <p className="text-xs text-gray-500 mb-4">AI enhanced content</p>
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                    <img
                      src={bookImagePath}
                      alt="Cyber Risk Management"
                      className="w-full h-32 object-cover rounded-lg mb-3"
                    />
                    <h4 className="font-medium text-gray-900 text-sm mb-1">
                      {bookTitle}
                    </h4>
                    
                  </div>
                </Card>
              </div>

              {/* Right Column - AI Question Generator */}
              <div className="lg:col-span-3">
                <Card className="p-6 bg-white border border-gray-200">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">AI Question Generator</h3>
                      <p className="text-sm text-gray-500">Configure your question generation settings</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left side form */}
                    <div className="space-y-6">
                      {/* Study Domain */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Target className="w-4 h-4 text-blue-600" />
                          <label className="text-sm font-medium text-gray-700">Study Domain (Chapter)</label>
                        </div>
                        <Select
                          value={selectedChapter}
                          onValueChange={handleChange}
                          disabled={chaptersLoading || chapters.length === 0}
                        >
                          <SelectTrigger className="w-full bg-white border-gray-200">
                            <SelectValue placeholder={chaptersLoading ? "Loading..." : chaptersError ? chaptersError : "Select chapter"} />
                          </SelectTrigger>
                          <SelectContent>

                            {chaptersLoading && (
                              <div className="px-4 py-2 text-sm text-gray-500">Loading chapters...</div>
                            )}
                            {chaptersError && !chaptersLoading && (
                              <div className="px-4 py-2 text-sm text-red-500">{chaptersError}</div>
                            )}
                            {!chaptersLoading && !chaptersError && chapters.length > 0 && chapters.map((chapter) => (
                              <SelectItem key={chapter.chapterCode} value={chapter.chapterCode}>
                                {chapter.chapterName || chapter.chapterCode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Taxonomy Framework (Taxonomy) */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Globe className="w-4 h-4 text-blue-600" />
                          <label className="text-sm font-medium text-gray-700">Taxonomy Framework</label>
                        </div>
                        {dropdownError ? (
                          <div className="text-red-500 text-xs mb-2">{dropdownError}</div>
                        ) : null}
                        <select
                          className="w-full border rounded px-3 py-2"
                          value={selectedTaxonomy}
                          onChange={(e) => {
                            setSelectedTaxonomy(e.target.value);
                            sessionStorage.setItem("selectedTaxonomy", e.target.value);
                          }}
                          disabled={!!dropdownError || taxonomyList.length === 0}
                        >
                          <option value="">-- Select --</option>
                          {taxonomyList.map((tax, idx) => (
                            <option key={idx} value={tax}>{tax}</option>
                          ))}
                        </select>
                      </div>

                      {/* Creativity Level */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Zap className="w-4 h-4 text-purple-600" />
                          <label className="text-sm font-medium text-gray-700">Creativity Level</label>
                        </div>
                        <Select
                          value={selectedCreativityLevel}
                          onValueChange={(value) => {
                            setSelectedCreativityLevel(value);
                            sessionStorage.setItem("selectedCreativityLevel", value);
                          }}
                        >
                          <SelectTrigger className="w-full bg-white border-gray-200">
                            <SelectValue placeholder="Select creativity level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="very-high">Very High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Question Quantity */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-4 h-4 text-pink-600 text-sm font-bold">
                            <Hash className="w-4 h-4 text-orange-600" />
                          </span>
                          <label className="text-sm font-medium text-gray-700">Question Quantity</label>
                        </div>
                        {dropdownError ? (
                          <div className="text-red-500 text-xs mb-2">{dropdownError}</div>
                        ) : null}
                        <select
                          className="w-full border rounded px-3 py-2"
                          value={selectedQuantity}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSelectedQuantity(value);
                            sessionStorage.setItem("selectedQuantity", value);
                          }}
                          disabled={!!dropdownError || questionQuantities.length === 0}
                        >

                          {questionQuantities.map((qty, idx) => (
                            <option key={idx} value={qty}>{qty}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Right side form */}
                    <div className="space-y-6">
                      {/* Learning Objectives*/}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Brain className="w-4 h-4 text-blue-600" />
                          <label className="text-sm font-medium text-gray-700">Learning Objectives</label>
                        </div>
                        <Select
                          value={selectedLO}
                          onValueChange={(val) => {
                            // Allow 'ALL' to be selected; otherwise store LO code
                            const loCodeWithPrefix = val === 'ALL' ? 'ALL' : (val.startsWith('LO') ? val : `${val}`);
                            setSelectedLO(loCodeWithPrefix);
                            sessionStorage.setItem("selectedLO", loCodeWithPrefix);
                            // Update the learning objective name (empty for ALL)
                            if (loCodeWithPrefix === 'ALL') {
                              setLearningObjectivesName('');
                              sessionStorage.setItem('learningObjectivesName', '');
                            } else {
                              const selected = learningObjectives.find(lo => 
                                `LO${lo.loCode}` === loCodeWithPrefix || lo.loCode === loCodeWithPrefix
                              );
                              setLearningObjectivesName(selected?.loName || "");
                              sessionStorage.setItem('learningObjectivesName', selected?.loName || '');
                            }
                          }}
                          disabled={loLoading}
                        >
                          <SelectTrigger className="w-full bg-white border-gray-200">
                            <SelectValue placeholder={loLoading ? "Loading..." : loError ? loError : "-- Select --"} />
                          </SelectTrigger>
                          <SelectContent>
                            {loLoading && (
                              <div className="px-4 py-2 text-sm text-gray-500">Loading learning objectives...</div>
                            )}
                            {loError && !loLoading && (
                              <div className="px-4 py-2 text-sm text-red-500">{loError}</div>
                            )}
                            {!loLoading && !loError && (
                              <>
                                <SelectItem value="ALL">-- Select --</SelectItem>
                                {learningObjectives.length > 0 && learningObjectives.map((lo) => (
                                  <SelectItem key={lo.loCode} value={lo.loCode}>
                                    {lo.loName || lo.loCode}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>


                      {/* Question Format (Question Type) */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <FileText className="w-4 h-4 text-green-600" />
                          <label className="text-sm font-medium text-gray-700">Question Format</label>
                        </div>
                        {dropdownError ? (
                          <div className="text-red-500 text-xs mb-2">{dropdownError}</div>
                        ) : null}
                        <select
                          className="w-full border rounded px-3 py-2"
                          value={selectedQuestionType}
                          onChange={e => {
                            setSelectedQuestionType(e.target.value);
                            sessionStorage.setItem("selectedQuestionType", e.target.value);
                            sessionStorage.setItem("pointValue", "5");
                          }}
                          disabled={!!dropdownError || questionTypes.length === 0}
                        >
                          {questionTypes.map((type, idx) => (
                            <option key={idx} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>

                      {/* Point Value */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-4 h-4 text-pink-600 text-sm font-bold">★</span>
                          <label className="text-sm font-medium text-gray-700">Point Value</label>
                        </div>
                        <select
                          className="w-full border rounded px-3 py-2"
                          value={pointValue}
                          onChange={handlePointChange}
                        >

                          {selectedQuestionType === "Multiple Choice" && (
                            <>
                              <option value="5">1</option>

                            </>
                          )}
                          {selectedQuestionType === "Written Response" && (
                            <>
                              <option value="5">5</option>
                              <option value="10">10</option>
                            </>
                          )}
                        </select>
                      </div>

                      {/* Number of Response Options */}
                      {selectedQuestionType !== "Written Response" && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-4 h-4 text-indigo-600 text-sm font-bold">#</span>
                          <label className="text-sm font-medium text-gray-700">Number of Response Options</label>
                        </div>
                        <Select
                          value={selectedResponseOptions.toString()}
                          onValueChange={(value) => {
                            setSelectedResponseOptions(parseInt(value));
                            sessionStorage.setItem("selectedResponseOptions", value);
                          }}
                        >
                          <SelectTrigger className="w-full bg-white border-gray-200">
                            <SelectValue placeholder="Select number of options" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="4">4</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="6">6</SelectItem>                            
                            <SelectItem value="7">7</SelectItem>
                            <SelectItem value="8">8</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      )}
                    </div>
                  </div>

                  {/* Additional Instructions - Full Width */}
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                      <label className="text-sm font-medium text-gray-700">Additional Instructions</label>
                    </div>
                    <Textarea
                      placeholder="Provide specific instructions for AI question generation..."
                      className="min-h-[100px] bg-white border-gray-200"
                      value={additionalInstructions}
                      onChange={e => setAdditionalInstructions(e.target.value)}
                    />
                  </div>

                  {/* Generate Button */}
                  <div className="flex justify-center mt-8">
                    <Button
                      onClick={handleGenerateQuestions}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Questions
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}


        {/* Footer */}
        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white text-xs">⚡</span>
            </div>
            <span>Powered by advanced AI technology</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuestionGenerator