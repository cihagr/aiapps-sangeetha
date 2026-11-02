import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, Link, useLocation } from "react-router-dom";
import { getChapters as getChaptersByBookCode, Chapter, getLearningObjectives, LearningObjective, fetchDropdownOptions } from "@/utils/Aigapi";
import { Card } from "../components/ui/card";
import { PageLoader } from "../components/ui/loader";
import { Button } from "../components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Switch } from "../components/ui/switch";
import { ArrowLeft, Sparkles, FileText, Zap, Settings2, X, Target, Globe, Hash, Brain, MessageSquare, Database, User, FileSpreadsheet, Trash2, Eye, Edit3, Clock, Save, List, Volume2, Info } from "lucide-react";
import { cp } from "fs";
import axios from "axios";
import { fetchUsageStats, AIG_QUIZ_GEN_URL } from "@/utils/Aigapi";
import { API_ENDPOINTS, getImageUrl } from "@/config";
import { getKbAuthToken } from "../lib/kb-auth";
const distractor = import.meta.env.distractor;

const showGenerateImages = 1;
const showTextToSpeech = 0;


function transformUsageData(statsRaw: any[]): any[] {
  // Dummy implementation to avoid runtime error
  return statsRaw;
}

const AIGQuestionGenerator = () => {
  const navigate = useNavigate();
  // Ref to prevent duplicate API calls in React Strict Mode
  const knowledgeBasesFetchedRef = useRef(false);
  const dropdownsFetchedRef = useRef(false);
  const statsFetchedRef = useRef(false);
  const chaptersFetchedRef = useRef(false);

  // Authentication check - redirect to login if not authenticated
  useEffect(() => {
    const checkAuthentication = () => {
      const username = sessionStorage.getItem('username');
      const userInfo = sessionStorage.getItem('userInfo');
      const custcode = sessionStorage.getItem('custcode');

      // Check if user is not authenticated (no username, userInfo, or custcode)
      if (!username && (!userInfo || userInfo === '{}') && !custcode) {
        navigate('/login', { replace: true });
        return;
      }
    };

    checkAuthentication();
  }, [navigate]);
  // Check if user is logged in via SSO token
  const isSSO = sessionStorage.getItem('isSSO') === 'true';

  // Label configuration for SSO and non-SSO modes
  const fieldLabels = {
    sso: {
      taxonomy: "Classification",
      questionType: "Item Type",
      creativityLevel: "Complexity",
      pointValue: "Score",
      questionQuantity: "Item Required"
    },
    nonSSO: {
      taxonomy: "Taxonomy",
      questionType: "Question Format",
      creativityLevel: "Creativity Level",
      pointValue: "Point Value",
      questionQuantity: "Question Quantity"
    }
  };

  // Get current labels based on SSO status
  const currentLabels = isSSO ? fieldLabels.sso : fieldLabels.nonSSO;

  // DropdownDashboard state for taxonomy, question type, and quantity
  // Add this new state at the top with your other states
  const [allGuidelinesForBadges, setAllGuidelinesForBadges] = useState<any[]>([]);
  const [taxonomyList, setTaxonomyList] = useState<string[]>([]);
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  const [questionQuantities, setQuestionQuantities] = useState<number[]>([]);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState(() => {
    return sessionStorage.getItem("selectedKnowledgeBase") || "0";
  });
  const [knowledgeBaseDropdownValue, setKnowledgeBaseDropdownValue] = useState<string>("0");
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = useState<string[]>([]);
  const [selectedGuideline, setSelectedGuideline] = useState(() => {
    return sessionStorage.getItem("selectedGuideline") || "0";
  });  // <-- add this back
  const [guidelineDropdownValue, setGuidelineDropdownValue] = useState<string>("0");
  const [selectedGuidelines, setSelectedGuidelines] = useState<string[]>(() => {
    try {
      const stored = sessionStorage.getItem("selectedGuidelines");
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  const [guidelines, setGuidelines] = useState<any[]>([]);
  const [guidelineError, setGuidelineError] = useState<string>("");
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [knowledgeBaseError, setKnowledgeBaseError] = useState<string>("");
  const [knowledgeBaseValidationError, setKnowledgeBaseValidationError] = useState<string>("");
  const [creativityLevels, setCreativityLevels] = useState<{ id: number, creativitylevel: string }[]>([]);
  const [guidlines, setGuidlines] = useState<any[]>([]);
  // Initialize state with empty values - we'll set them after fetching options
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<string>('');
  const [selectedQuestionType, setSelectedQuestionType] = useState<string>('');
  const [selectedQuantity, setSelectedQuantity] = useState<string | number>('');
  const [selectedCreativityLevel, setSelectedCreativityLevel] = useState<string>('moderate');
  const [selectedResponseOptions, setSelectedResponseOptions] = useState<number>(4);
  const [numberOfCorrectOptions, setNumberOfCorrectOptions] = useState<number>(2);

  const [studynumber, setstudynumber] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  // The page loader stays up until the knowledge base list and the first guideline
  // list have both come back (success or failure — a failed call must not leave the
  // page stuck behind the loader; its error message shows instead).
  const [knowledgeBasesLoading, setKnowledgeBasesLoading] = useState(true);
  const [initialGuidelinesLoaded, setInitialGuidelinesLoaded] = useState(false);
  const [dropdownError, setDropdownError] = useState<string>("");
  const [isChecked, setIsChecked] = useState(false);



  // Function to extract values from selected guideline and update the three dropdowns
  const updateDropdownsFromGuideline = (guidelineId: string) => {
    if (!guidelineId || guidelines.length === 0) return;

    const selectedGuidelineData = guidelines.find((g: any) => {
      const id = String(g.guideline_id || g.guidelineid || g.id || "");
      return id === guidelineId;
    });

    if (!selectedGuidelineData) return;

    // Extract values from guideline - adjust field names based on actual API response
    // Common field names that might contain the values
    const taxonomy = selectedGuidelineData.taxonomy ||
      selectedGuidelineData.taxonomy_name ||
      selectedGuidelineData.taxonomyName ||
      'Remember'; // fallback

    const questionFormat = selectedGuidelineData.question_format ||
      selectedGuidelineData.questionFormat ||
      selectedGuidelineData.question_type ||
      selectedGuidelineData.questionType ||
      'Multiple Choice'; // fallback

    const creativityLevel = selectedGuidelineData.creativity_level ||
      selectedGuidelineData.creativityLevel ||
      selectedGuidelineData.creativity ||
      'moderate'; // fallback



    // Update the dropdown values
    setSelectedTaxonomy(taxonomy);
    setSelectedQuestionType(questionFormat);
    setSelectedCreativityLevel(creativityLevel);

    // Persist to sessionStorage
    try {
      sessionStorage.setItem('selectedTaxonomy', taxonomy);
      const mappedId = taxonomy === 'Remember' ? '1'
        : taxonomy === 'Understand' ? '2'
          : taxonomy === 'Apply' ? '3'
            : taxonomy === 'Analyze' ? '4'
              : taxonomy === 'Evaluate' ? '5'
                : taxonomy === 'Create' ? '6'
                  : '1';
      sessionStorage.setItem('taxonomyid', mappedId);
      sessionStorage.setItem('selectedQuestionType', questionFormat);
      sessionStorage.setItem('selectedCreativityLevel', creativityLevel);
    } catch (error) {
      console.error('Error persisting guideline values:', error);
    }
  };
  // Function to find and update guideline based on dropdown values
  // Function to find and update guideline based on dropdown values
  const updateGuidelineFromDropdowns = (taxonomy: string, questionFormat: string, creativityLevel: string) => {
    if (!questionFormat || guidelines.length === 0) return;

    // Use fallback values if taxonomy or creativity level are empty
    const finalTaxonomy = taxonomy || 'Remember';
    const finalCreativityLevel = creativityLevel || 'moderate';

    console.log('🔍 Looking for guideline with:', {
      taxonomy: finalTaxonomy,
      questionFormat: questionFormat,
      creativityLevel: finalCreativityLevel
    });

    // Find guideline that matches the current dropdown values
    const matchingGuideline = guidelines.find((g: any) => {
      const guidelineTaxonomy = g.taxonomy || g.taxonomy_name || g.taxonomyName || '';
      const guidelineQuestionFormat = g.question_format || g.questionFormat || g.question_type || g.questionType || '';
      const guidelineCreativity = g.creativity_level || g.creativityLevel || g.creativity || '';

      console.log('📋 Checking guideline:', {
        id: g.guideline_id || g.guidelineid || g.id,
        name: g.guidelinename || g.guideline_name || g.name,
        taxonomy: guidelineTaxonomy,
        questionFormat: guidelineQuestionFormat,
        creativity: guidelineCreativity
      });

      return (
        guidelineTaxonomy.toLowerCase() === finalTaxonomy.toLowerCase() &&
        guidelineQuestionFormat.toLowerCase() === questionFormat.toLowerCase() &&
        guidelineCreativity.toLowerCase() === finalCreativityLevel.toLowerCase()
      );
    });

    if (matchingGuideline) {
      const guidelineId = String(matchingGuideline.guideline_id || matchingGuideline.guidelineid || matchingGuideline.id || '');
      setSelectedGuideline(guidelineId);
      setSelectedGuidelines(prev => prev.includes(guidelineId) ? prev : [...prev, guidelineId]);

      console.log('✅ Selected guideline:', guidelineId);

      // Persist to sessionStorage
      try {
        sessionStorage.setItem('selectedGuideline', guidelineId);
        const next = Array.from(new Set([guidelineId, ...selectedGuidelines]));
        sessionStorage.setItem('selectedGuidelines', JSON.stringify(next));
      } catch (error) {
        console.error('Error persisting guideline selection:', error);
      }
    } else {
      console.log('❌ No matching guideline found');
    }
  };

  const findGuidelineIdByNames = (names: string[]): string => {
    const pools = [guidelines, allGuidelinesForBadges].filter(Boolean);
    const normalize = (s: string) =>
      String(s || '').toLowerCase().replace(/[\s_\-]+/g, '');
    const targets = names.map(normalize);
    for (const pool of pools) {
      const match = (pool || []).find((g: any) => {
        const name = g.guidelinename || g.guideline_name || g.name || '';
        return targets.includes(normalize(name));
      });
      if (match) {
        const id = String(match.guideline_id || match.guidelineid || match.id || '');
        console.log('[GuidelineDebug] matched', names, '->', id);
        return id;
      }
    }
    console.warn('[GuidelineDebug] NO MATCH for', names,
      '- check exact guidelinename in Manage Guidelines admin screen, ' +
      'and confirm guidelinetype=Content, guidelinesubtype=general_rules');
    return '';
  };

  const getScenarioBasedGuidelineId = (): string =>
    findGuidelineIdByNames(['Scenario_based', 'Scenario Based', 'ScenarioBased']);

  const getMultiPassageGuidelineId = (): string =>
    findGuidelineIdByNames([
      'Multi_Passage_based', 'Multi Passage Based', 'MultiPassageBased',
      'Multi_Passage', 'MultiPassage', 'Multi_Tab_based', 'Multi Tab Based'
    ]);

  const getTableAnalysisGuidelineId = (): string =>
    findGuidelineIdByNames(['Table_Analysis', 'Table Analysis', 'TableAnalysis']);

  // The guideline is published as SELECT_THE_BLANK and is only present in the
  // unfiltered pool (allGuidelinesForBadges), not in the Content/general_rules
  // list. Looking for FILL_IN_THE_BLANK_DROPDOWN in `guidelines` alone always
  // came back empty, so the guideline was never attached and Select the Blank
  // generation silently produced Multiple Choice items instead.
  const getFillInBlankDropdownGuidelineId = (): string =>
    findGuidelineIdByNames([
      'Select_The_Blank', 'Select the Blank', 'SelectTheBlank',
      'Fill_In_The_Blank_Dropdown', 'Fill In the Blank Dropdown', 'FillInTheBlankDropdown',
    ]);

  const [selectedOption, setSelectedOption] = useState('Book Based')
  const [learningObjectivesName, setLearningObjectivesName] = useState('');
  const [error, setError] = useState<string>("");
  // True when the book has no Study, or the chosen Study has no learning objectives.
  // Shown as a line under the Study / Learning Objectives dropdowns (it used to be a
  // blocking popup that sent the user back to the dashboard).
  const [showEmptyLOMessage, setShowEmptyLOMessage] = useState(false);
  const studyLOHintRef = useRef<HTMLDivElement | null>(null);
  const [isStudyLOEnabled, setIsStudyLOEnabled] = useState(true);
  const [isTaxonomyEnabled, setIsTaxonomyEnabled] = useState(true);
  const [isQuestionFormatEnabled, setIsQuestionFormatEnabled] = useState(true);
  const [isCreativityLevelEnabled, setIsCreativityLevelEnabled] = useState(true);
  const [isPointValueEnabled, setIsPointValueEnabled] = useState(true);
  const [isQuestionQuantityEnabled, setIsQuestionQuantityEnabled] = useState(true);
  const [isResponseOptionsEnabled, setIsResponseOptionsEnabled] = useState(true);
  const [isScenarioBasedEnabled, setIsScenarioBasedEnabled] = useState(true);
  const [isMultiPassageEnabled, setIsMultiPassageEnabled] = useState(true);
  const [isSelectTheBlankEnabled, setIsSelectTheBlankEnabled] = useState(true);
  const [isItemMetaDataEnabled, setIsItemMetaDataEnabled] = useState(true);
  const [isImageRepositoryEnabled, setIsImageRepositoryEnabled] = useState(true);

  // multi/table stay 0 until get_preference answers, so the MODE block is never shown on
  // defaults (no flash, and it stays hidden if the call fails).
  const [preferences, setPreferences] = useState({
    normal: 1,
    multi: 0,
    table: 0,
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  // The MODE block is only worth showing when there is something to choose besides Normal.
  const showModeBlock = preferences.multi === 1 || preferences.table === 1;
  const [isGenerateImagesEnabled, setIsGenerateImagesEnabled] = useState<boolean>(true);

  // Fetch QuizGenApi preferences (imagegenerate, multipassage, tabular)
  useEffect(() => {
    const fetchQuizGenPreferences = async () => {
      try {
        const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};

        let custcode = sessionStorage.getItem("custcode") || "";
        let orgcode = sessionStorage.getItem("orgcode") || "";
        let appcode = sessionStorage.getItem("appcode") || "AIG";
        let usercode = sessionStorage.getItem("userCode") || sessionStorage.getItem("usercode") || sessionStorage.getItem("username") || "";

        if (!custcode) custcode = userInfo.customerCode || userInfo.custCode || userInfo.custcode || "";
        if (!orgcode) orgcode = userInfo.orgCode || userInfo.orgcode || "";
        if (!usercode) usercode = userInfo.userCode || userInfo.usercode || userInfo.username || userInfo.userName || "";

        const payload = {
          orgcode: orgcode,
          custcode: custcode,
          usercode: usercode,
          appcode: appcode
        };

        const response = await axios.post(`${AIG_QUIZ_GEN_URL}/get_preference`, payload);
        if (response.data) {
          const data = response.data;
          setPreferences(prev => ({
            ...prev,
            multi: data.multipassage !== undefined ? Number(data.multipassage) : prev.multi,
            table: data.tabular !== undefined ? Number(data.tabular) : prev.table,
          }));

          if (data.imagegenerate !== undefined) {
            setIsGenerateImagesEnabled(Number(data.imagegenerate) === 1);
          }
        }
      } catch (err) {
        console.error('Failed to fetch QuizGenApi preferences in generator:', err);
      } finally {
        setPreferencesLoaded(true);
      }
    };

    fetchQuizGenPreferences();
  }, []);
  const selectedGuidelineData = React.useMemo(() => {
    if (!selectedGuideline || !guidelines.length) return null;

    return (
      guidelines.find((g: any) => {
        const id = String(g.guideline_id || g.guidelineid || g.id || "");
        return id === selectedGuideline;
      }) || null
    );
  }, [selectedGuideline, guidelines]);

  const scenarioGuidelineId = getScenarioBasedGuidelineId();
  const multiPassageGuidelineId = getMultiPassageGuidelineId();
  const tableAnalysisGuidelineId = getTableAnalysisGuidelineId();
  const guidelineIdsCsv = React.useMemo(() => {
    if (!Array.isArray(guidlines)) return "";
    return guidlines
      .filter((g: any) => !!g)
      .map((g: any) =>
        String(g.guideline_id || g.guidelineid || g.id || "")
      )
      .filter((id) => id)
      .join(",");
  }, [guidlines]);
  const knowledgeBaseIdsCsv = React.useMemo(() => {
    if (!Array.isArray(selectedKnowledgeBases)) return "";

    return selectedKnowledgeBases
      .filter((id) => id && id !== "0") // remove empty and "0" values
      .join(",");
  }, [selectedKnowledgeBases]);
  useEffect(() => {
    try {
      if (guidelineIdsCsv) {
        sessionStorage.setItem("selectedGuidelineIdsFromGuidlines", guidelineIdsCsv);
      } else {
        sessionStorage.removeItem("selectedGuidelineIdsFromGuidlines");
      }
    } catch {
      // ignore storage errors
    }
  }, [guidelineIdsCsv]);
  useEffect(() => {
    try {
      if (knowledgeBaseIdsCsv) {
        sessionStorage.setItem("selectedKnowledgeBaseIdsCsv", knowledgeBaseIdsCsv);
      } else {
        sessionStorage.removeItem("selectedKnowledgeBaseIdsCsv");
      }
    } catch {
      // ignore storage errors
    }
  }, [knowledgeBaseIdsCsv]);

  useEffect(() => {
    if (!isTaxonomyEnabled) {
      const taxonomyName = String(sessionStorage.getItem("selectedTaxonomy") || selectedTaxonomy || "").trim();
      const taxonomyGuideline = taxonomyName
        ? allGuidelinesForBadges.find((g: any) => String(g?.guidelinename || "").toLowerCase() === taxonomyName.toLowerCase())
        : null;
      const taxonomyGuidelineId = taxonomyGuideline ? String(taxonomyGuideline?.guideline_id || taxonomyGuideline?.guidelineid || taxonomyGuideline?.id || "") : "";

      setSelectedTaxonomy("");
      try {
        sessionStorage.removeItem("selectedTaxonomy");
        sessionStorage.removeItem("taxonomyid");
      } catch { }

      if (taxonomyGuidelineId) {
        setSelectedGuidelines(prev => {
          const next = prev.filter(id => String(id) !== taxonomyGuidelineId);
          try { sessionStorage.setItem("selectedGuidelines", JSON.stringify(next)); } catch { }
          return next;
        });
      }
    }
  }, [isTaxonomyEnabled, allGuidelinesForBadges, selectedTaxonomy]);

  useEffect(() => {
    if (!isCreativityLevelEnabled) {
      const creativityName = String(sessionStorage.getItem("selectedCreativityLevel") || selectedCreativityLevel || "").trim();
      const creativityGuideline = creativityName
        ? allGuidelinesForBadges.find((g: any) => {
          return String(g?.guidelinename || "").toLowerCase() === creativityName.replace(/\s+/g, '_').toLowerCase();
        })
        : null;
      const creativityGuidelineId = creativityGuideline ? String(creativityGuideline?.guideline_id || creativityGuideline?.guidelineid || creativityGuideline?.id || "") : "";

      setSelectedCreativityLevel("");
      try {
        sessionStorage.removeItem("selectedCreativityLevel");
      } catch { }

      if (creativityGuidelineId) {
        setSelectedGuidelines(prev => {
          const next = prev.filter(id => String(id) !== creativityGuidelineId);
          try { sessionStorage.setItem("selectedGuidelines", JSON.stringify(next)); } catch { }
          return next;
        });
      }
    }
  }, [isCreativityLevelEnabled, allGuidelinesForBadges, selectedCreativityLevel]);
  useEffect(() => {
    if (allGuidelinesForBadges.length > 0 && selectedQuestionType) {
      const listarray: any[] = [];

      const objlist = allGuidelinesForBadges.find((g: any) => {
        return selectedQuestionType.replace(/\s+/g, '_').toLowerCase() === String(g.guidelinename || "").toLowerCase();
      });
      listarray.push(objlist);

      if (isTaxonomyEnabled && selectedTaxonomy) {
        const objlist1 = allGuidelinesForBadges.find((g: any) => {
          return selectedTaxonomy.toLowerCase() === String(g.guidelinename || "").toLowerCase();
        });
        listarray.push(objlist1);
      }

      if (isCreativityLevelEnabled && selectedCreativityLevel) {
        const objlist2 = allGuidelinesForBadges.find((g: any) => {
          return selectedCreativityLevel.replace(/\s+/g, '_').toLowerCase() === String(g.guidelinename || "").toLowerCase();
        });
        listarray.push(objlist2);
      }

      setGuidlines(listarray);
    }
  }, [selectedQuestionType, selectedTaxonomy, selectedCreativityLevel, allGuidelinesForBadges, isTaxonomyEnabled, isCreativityLevelEnabled]);

  const formatMap: Record<string, string> = {
    "Multiple Choice": "MULTIPLE_CHOICE",
    "Multiple Response": "MULTIPLE_RESPONSE",
    "True False": "TRUE_FALSE",
    "Fill In the Blank": "FILL_IN_THE_BLANK",
    "Select the Blank": "SELECT_THE_BLANK",
    "Written Response": "WRITTEN_RESPONSE",
    "Matrix": "MATRIX",
    // "Scenario Based": "SCENARIO_BASED",
    // "Multi Tab Passage": "MULTI_TAB_PASSAGE",
    "Fill In the Blank Dropdown": "FILL_IN_THE_BLANK_DROPDOWN",
  };
  const taxonomyMap: Record<string, string> = {
    "Remember": "REMEMBER",
    "Understand": "UNDERSTAND",
    "Apply": "APPLY",
    "Analyze": "ANALYZE",
    "Evaluate": "EVALUATE",
    "Create": "CREATE",
  };
  const creativityMap: Record<string, string> = {
    "moderate": "EASY",
    "high": "MEDIUM",
    "very high": "HARD",
  };
  const formatKey = formatMap[selectedQuestionType] || "";
  const taxonomyKey = taxonomyMap[selectedTaxonomy] || "";
  const creativityKey = selectedCreativityLevel
    ? `DIFFICULTY_LEVEL_${creativityMap[selectedCreativityLevel.toLowerCase()] || ""}`
    : "";
  const formatGuideline = guidelines.find(g =>
    (g.guidelinename || g.guideline_name || g.name || "").toUpperCase() === formatKey
  );
  const taxonomyGuideline = guidelines.find(g =>
    (g.guidelinename || g.guideline_name || g.name || "").toUpperCase() === taxonomyKey
  );
  const creativityGuideline = guidelines.find(g =>
    (g.guidelinename || g.guideline_name || g.name || "").toUpperCase() === creativityKey
  );
  // Clear dropdown values when component unmounts
  useEffect(() => {
    sessionStorage.setItem("selectedGenerationMode", 'Book Based');
    // Keep selections in sessionStorage on unmount so downstream pages can read them
    return () => { };
  }, []);
  useEffect(() => {
    // Prevent duplicate calls in React Strict Mode
    if (knowledgeBasesFetchedRef.current) return;
    knowledgeBasesFetchedRef.current = true;
    const fetchKnowledgeBases = async () => {
      try {
        const token = await getKbAuthToken();
        // 1) Resolve custcode, orgcode, appcode dynamically
        let custcode = sessionStorage.getItem("custcode") || "";
        let orgcode = sessionStorage.getItem("orgcode") || "";
        let appcode = sessionStorage.getItem("appcode") || "";

        if (!custcode || !orgcode || !appcode) {
          try {
            const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
            if (!custcode) custcode = userInfo.customerCode || userInfo.custcode || "";
            if (!orgcode) orgcode = userInfo.orgCode || userInfo.orgcode || "";
            if (!appcode) appcode = userInfo.appcode || "0";

            if (custcode) sessionStorage.setItem("custcode", custcode);
            if (orgcode) sessionStorage.setItem("orgcode", orgcode);
            if (appcode) sessionStorage.setItem("appcode", appcode);
          } catch { }
        }

        // 2) Call KB API with those values
        const response = await axios.get(
          API_ENDPOINTS.GET_EXISTING_KB,
          {
            params: {
              par_custcode: custcode,
              par_orgcode: orgcode,
              par_appcode: 0, // revert: always send 0 as before
              auth_token: token,
              book_id: ""
            },
          }
        );

        // 3) Parse response into list
        const root = response?.data ?? {};
        const list = Array.isArray(root)
          ? root
          : Array.isArray((root as any).data)
            ? (root as any).data
            : [];

        if (!Array.isArray(list) || !list.length) {
          setKnowledgeBases([]);
          setKnowledgeBaseError("");
          return;
        }

        setKnowledgeBases(list);
        setKnowledgeBaseError("");

        try {
          const storedBookRaw = sessionStorage.getItem("selectedBook") || "";
          if (storedBookRaw) {
            try {
              const storedBook = JSON.parse(storedBookRaw);
              const bookName = storedBook.bookname;

              // Match by name (knowladgebasename / soursename)
              let match: any = null;
              if (bookName) {
                match = list.find((kb: any) => {
                  const name =
                    kb.knowladgebasename ||
                    kb.knowledgebasename ||
                    kb.knowledgebaseName ||
                    kb.soursename ||
                    "";
                  return (
                    typeof name === "string" &&
                    name.toLowerCase() === String(bookName).toLowerCase()
                  );
                });
              }
              if (match) {
                const kbId = String(
                  match.knowledgebase_id ||
                  match.knowledgebaseid ||
                  match.knowledgebaseId ||
                  match.kbid ||
                  match.id ||
                  match.code ||
                  ""
                );
                if (kbId) {
                  // dropdown selection
                  setSelectedKnowledgeBase(kbId);

                  // chips selection – same as when user picks manually
                  setSelectedKnowledgeBases(prev =>
                    prev.includes(kbId) ? prev : [...prev, kbId]
                  );

                  try {
                    sessionStorage.setItem("selectedKnowledgeBase", kbId);
                    sessionStorage.setItem("selectedKnowledgeBases", kbId);
                  } catch { }
                }
              } else {
                // no match: clear selection
                setSelectedKnowledgeBase("0");
                sessionStorage.removeItem("selectedKnowledgeBase");
                sessionStorage.removeItem("selectedKnowledgeBases");
              }
            } catch {
              // ignore JSON errors
            }
          } else {
            // no selectedBook: clear selection
            setSelectedKnowledgeBase("0");
            sessionStorage.removeItem("selectedKnowledgeBase");
            sessionStorage.removeItem("selectedKnowledgeBases");
          }
        } catch { }
      } catch (e) {
        setKnowledgeBases([]);
        setKnowledgeBaseError("Failed to load knowledge bases.");
      } finally {
        setKnowledgeBasesLoading(false);
      }
    };

    fetchKnowledgeBases();
  }, []);
  useEffect(() => {
    // Wait for the knowledge base list: it settles which knowledge base is selected.
    // Fetching before it returned sent one request for the session/default value and
    // a second, identical one once the list set the real selection.
    if (knowledgeBasesLoading) return;

    // Only fetch when a KB is selected
    if (!selectedKnowledgeBase) {
      setAllGuidelinesForBadges([]);
      setGuidelineError("");
      setInitialGuidelinesLoaded(true);
      return;
    }




    const fetchGuidelines = async () => {
      try {
        // Resolve codes dynamically (same pattern as fetchKnowledgeBases)
        let custcode = sessionStorage.getItem("custcode") || "";
        let orgcode = sessionStorage.getItem("orgcode") || "";
        let appcode = sessionStorage.getItem("appcode") || "";

        if (!custcode || !orgcode || !appcode) {
          try {
            const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
            if (!custcode) custcode = userInfo.customerCode || userInfo.custcode || "";
            if (!orgcode) orgcode = userInfo.orgCode || userInfo.orgcode || "";
            if (!appcode) appcode = userInfo.appcode || "0";

            if (custcode) sessionStorage.setItem("custcode", custcode);
            if (orgcode) sessionStorage.setItem("orgcode", orgcode);
            if (appcode) sessionStorage.setItem("appcode", appcode);
          } catch { }
        }

        const payload = {
          par_kid: "0",
          par_guidelinetype: "0",
          par_guidelinename: "0",
          par_orgcode: sessionStorage.getItem("orgcode") || "0",
          par_custcode: sessionStorage.getItem("custcode") || "0",
          par_appcode: "0",
          book_id: ""
        };

        const response = await axios.post(
          API_ENDPOINTS.GET_GENERAL_GUIDELINES,
          payload
        );

        const root = response?.data ?? {};
        const list = Array.isArray(root)
          ? root
          : Array.isArray((root as any).data)
            ? (root as any).data
            : [];
        setAllGuidelinesForBadges(list);
        // The General Guidelines dropdown used to come from a second request with
        // par_guidelinetype=Content / par_guidelinesubtype=general_rules. The server
        // answers that with exactly the Content-type rows of this list (same rows, same
        // order), so it is derived here instead of fetched again.
        setGuidelines(
          list.filter((g: any) => {
            const type = String(g?.guidelinetype || "").trim().toLowerCase();
            const subtype = String(g?.guidelinesubtype || "").trim().toLowerCase();
            return type === "content" && (subtype === "general_rules" || subtype === "");
          })
        );
        console.log('[GuidelineDebug] allGuidelinesForBadges list:',
          list.map((g: any) => ({ id: g.guideline_id || g.guidelineid || g.id, name: g.guidelinename || g.guideline_name || g.name }))
        );
      } catch (e) {
        setAllGuidelinesForBadges([]);
        setGuidelines([]);
        setGuidelineError("Failed to load guidelines.");
      } finally {
        setInitialGuidelinesLoaded(true);
      }
    };

    fetchGuidelines();
    // Only the knowledge base decides WHAT is fetched — the payload does not mention
    // the question type. Keeping selectedQuestionType here refetched the whole
    // guideline list (~200 kB) again as soon as the type was restored on load, which
    // is why this endpoint was hit twice. The type-dependent work moved to the effect
    // below, which re-runs on the list already in state.
  }, [selectedKnowledgeBase, knowledgeBasesLoading]);

  // Guideline selection derived from the fetched list. This used to sit inside the
  // fetch above, so changing the Question Format refetched the entire list just to
  // redo this pure derivation. It now re-runs on the list already in state.
  useEffect(() => {
    if (!selectedKnowledgeBase) return;
    const list = allGuidelinesForBadges;
    if (!Array.isArray(list) || list.length === 0) return;

    if (selectedQuestionType !== '') {
      const listarray: any[] = [];

      const objlist = list.find((g: any) => {
        return selectedQuestionType.replace(/\s+/g, '_').toLowerCase() === String(g.guidelinename || "").toLowerCase();
      });
      listarray.push(objlist);

      if (isTaxonomyEnabled && selectedTaxonomy) {
        const objlist1 = list.find((g: any) => {
          return selectedTaxonomy.toLowerCase() === String(g.guidelinename || "").toLowerCase();
        });
        listarray.push(objlist1);
      }

      if (isCreativityLevelEnabled && selectedCreativityLevel) {
        const objlist2 = list.find((g: any) => {
          return selectedCreativityLevel
            .replace(/\s+/g, '_')
            .toLowerCase() === String(g.guidelinename || "").toLowerCase();
        });
        listarray.push(objlist2);
      }

      setGuidlines(listarray);
    }

    if (!Array.isArray(list) || !list.length) {
      setGuidelineError("");
      return;
    }


    setGuidelineError("");
    if (selectedGuideline === "0") {
      return;
    }
    // Auto-select guideline based on current Question Format (selectedQuestionType)
    try {
      const typeToGuidelineName: Record<string, string> = {
        "Multiple Choice": "MULTIPLE_CHOICE",
        "Multiple Response": "MULTIPLE_RESPONSE",
        "True False": "TRUE_FALSE",
        "Fill In the Blank": "FILL_IN_THE_BLANK",
        "Written Response": "WRITTEN_RESPONSE",
        "Matrix": "",
      };
      const targetName =
        typeToGuidelineName[selectedQuestionType] || "";
      let defaultId = "";
      // 1) Try to match by guidelinename from the list
      if (targetName) {
        const match = list.find((g: any) => {
          const name =
            g.guidelinename ||
            g.guideline_name ||
            g.name ||
            "";
          return (
            typeof name === "string" &&
            name.toUpperCase() === targetName
          );
        });
        if (match) {
          defaultId = String(
            match.guideline_id ||
            match.guidelineid ||
            match.id ||
            ""
          );
        }
      }
      // 2) Fallback to previously saved guideline (if any)
      if (!defaultId) {
        const saved = sessionStorage.getItem("selectedGuideline") || "";
        if (saved) {
          defaultId = saved;
        }
      }
      // 3) Fallback to first guideline in the list
      if (!defaultId && list.length > 0) {
        const first = list[0];
        defaultId = String(
          first.guideline_id ||
          first.guidelineid ||
          first.id ||
          ""
        );
      }
      // 4) Apply selection and store for later use
      if (defaultId) {
        // UI selection in this page
        setSelectedGuideline(defaultId);
        // keep existing behavior
        sessionStorage.setItem("selectedGuideline", defaultId);
        // this is what agentic_item_gen will use (comma-separated IDs; for now single)
        sessionStorage.setItem("selectedGuidelineIds", defaultId);
      }
    } catch (error) {
      console.error("Error auto-selecting guideline:", error);
    }
  }, [allGuidelinesForBadges, selectedQuestionType, selectedKnowledgeBase]);

  // The General Guidelines dropdown list (`guidelines`) is filled by the guideline
  // fetch above, from the same response — no second get-general-guidelines request.
  // When General Guidelines selection changes, update Taxonomy & Creativity Level
  // When General Guidelines selection changes, update Taxonomy & Creativity Level
  useEffect(() => {
    if (!selectedGuideline) return;
    // updateDropdownsFromGuideline(selectedGuideline); // Temporarily disabled to prevent Question Format reset
  }, [selectedGuideline, guidelines]);
  // Simple mapping from question format to guideline
  // Simple mapping from all dropdowns to guideline
  // Simple mapping from Question Format to guideline
  // Maps the current dropdown values to a guideline


  useEffect(() => {
    try {
      const shouldReset = sessionStorage.getItem('AIG_QGEN_RESET') === '1';
      if (!shouldReset) return;

      // Clear generator-related session keys
      const keysToClear = [
        'selectedTaxonomy', 'taxonomyid', 'selectedQuestionType', 'selectedQuantity',
        'selectedCreativityLevel', 'selectedResponseOptions', 'numberOfCorrectOptions',
        'additionalInstructions', 'ratingFeedback', 'chaptercode', 'selectedChapter', 'selectedChapterName',
        'selectedLO', 'learningObjectivesName', 'pointValue', 'selectedDistractor',
        'questionGenResults', 'includeQuestionImages'
      ];
      keysToClear.forEach(k => { try { sessionStorage.removeItem(k); } catch { } });

      // Reset in-component state to initial defaults
      setSelectedTaxonomy('');
      setSelectedQuestionType('');
      setSelectedQuantity('');
      setSelectedCreativityLevel('moderate');
      setSelectedResponseOptions(4);
      setNumberOfCorrectOptions(2);
      setAdditionalInstructions('');
      setIncludeQuestionImages(false);
      setSelectedChapter('');
      setLearningObjectives([]);
      setSelectedLO('');
      setLearningObjectivesName('');
      setGenerationMode(false);
      setIsInitialLoad(true);

      // Consume the flag so it only runs once
      sessionStorage.removeItem('AIG_QGEN_RESET');
    } catch { }
  }, []);

  // Always persist taxonomy label when it changes (covers initial default and user changes)
  useEffect(() => {
    sessionStorage.setItem("pointValue", pointValue);
    // Map question types to their correct questiontypeid
    let questionTypeId = "1"; // default for Multiple Choice
    switch (selectedQuestionType) {
      case "Multiple Response":
        questionTypeId = "2";
        break;
      case "True False":
        questionTypeId = "3";
        break;
      case "Fill In the Blank Dropdown":
      case "Select the Blank":
        questionTypeId = "9";
        break;
      case "Fill In the Blank":
        questionTypeId = "4";
        break;
      case "Written Response":
        questionTypeId = "7";
        break;
      case "Matrix":
        questionTypeId = "8";
        break;
      // Scenario Based has no questiontypeid of its own — it is a generation style
      // layered on a Multiple Choice item, so it falls through to the default.
      // (id 9 belongs to Select the Blank / Fill In the Blank Dropdown.)
      case "Multi Tab Passage":
        questionTypeId = "10";
        break;

      default:
        questionTypeId = "1"; // Multiple Choice
        break;
    }
    sessionStorage.setItem("questiontypeid", questionTypeId);
  }, [selectedQuestionType]);

  useEffect(() => {
    // Prevent duplicate calls in React Strict Mode
    if (dropdownsFetchedRef.current) return;
    dropdownsFetchedRef.current = true;
    const fetchDropdowns = async () => {
      // Clear previous values first

      setSelectedTaxonomy('');
      setSelectedQuestionType('');
      setSelectedQuantity('');

      // Try to get session info from localStorage, fallback to userInfo if needed
      let custcode = sessionStorage.getItem("custcode");
      let orgcode = sessionStorage.getItem("orgcode");
      let appcode = sessionStorage.getItem("appcode");

      // If any are missing, try to get from userInfo (like ItemGeneration). Checking on
      // !appcode too (not just custcode/orgcode) matters: an SSO login that never wrote
      // appcode would otherwise leave it unset here, and the block below used to only
      // run for a missing custcode/orgcode, so appcode stayed unset and the next check
      // took the early-return path below — leaving isInitialLoad stuck true forever.
      if (!custcode || !orgcode || !appcode) {
        const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}") || {};
        if (userInfo) {
          if (!custcode) custcode = userInfo.customerCode;
          if (!orgcode) orgcode = userInfo.orgCode;
          if (!appcode) appcode = "AIG";
          if (custcode) sessionStorage.setItem("custcode", custcode);
          if (orgcode) sessionStorage.setItem("orgcode", orgcode);
          if (appcode) sessionStorage.setItem("appcode", appcode);
        }
      }
      if (!custcode || !orgcode || !appcode) {
        setDropdownError("Please login again. Required session information is missing.");
        setTaxonomyList([]);
        setQuestionTypes([]);
        setQuestionQuantities([]);
        // Without this the "Loading stats..." overlay (gated on isInitialLoad) never
        // clears — the page ends up stuck on the spinner instead of showing the error.
        setIsInitialLoad(false);
        return;
      }
      try {
        sessionStorage.setItem("appcode", 'AIG');
        const data = await fetchDropdownOptions();
        let found = false;
        data.forEach((item: any) => {
          if (item.type != "bookname") {
            const parsed = JSON.parse(item.jsonDetails);
            if (item.type === "taxonomy") {
              const taxonomies = parsed.map((t: any) => t.taxonomy);
              setTaxonomyList(taxonomies);

              if (taxonomies.length > 0 && (!sessionStorage.getItem('selectedTaxonomy') || isInitialLoad)) {
                const defaultTaxonomy = taxonomies[0];
                setSelectedTaxonomy(defaultTaxonomy);
                try {
                  sessionStorage.setItem('selectedTaxonomy', defaultTaxonomy);
                  const mappedId = defaultTaxonomy === 'Remember' ? '1'
                    : defaultTaxonomy === 'Understand' ? '2'
                      : defaultTaxonomy === 'Apply' ? '3'
                        : defaultTaxonomy === 'Analyze' ? '4'
                          : defaultTaxonomy === 'Evaluate' ? '5'
                            : defaultTaxonomy === 'Create' ? '6'
                              : '1';
                  sessionStorage.setItem('taxonomyid', mappedId);
                } catch { }
              }

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
              const questionTypes = parsed
                .map((q: any) => q.questiontype)
                .filter((type: string) => type !== "Scenario Based" && type !== "Multi Tab Passage");

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

            if (item.type === "Creativity_level") {
              const creativityOptions = parsed.map((c: any) => ({ id: c.id, creativitylevel: c.creativitylevel }));
              setCreativityLevels(creativityOptions);

              // Set the first creativity level as default on initial load
              if (creativityOptions.length > 0) {
                const defaultCreativity = creativityOptions[0].creativitylevel;
                setSelectedCreativityLevel(defaultCreativity);
                if (isInitialLoad) {
                  sessionStorage.setItem('selectedCreativityLevel', defaultCreativity);
                }
              }
              found = true;
            }
            if (item.type === "ispreference" || item.type === "ispreferance") {
              const preference = parsed[0];
              if (preference) {
                const enabled = preference.istudyloenabled !== undefined
                  ? preference.istudyloenabled
                  : preference.isstudyloenabled;

                if (enabled !== undefined) {
                  const isEnabled = enabled === 1;
                  setIsStudyLOEnabled(isEnabled);
                  sessionStorage.setItem("isStudyLOEnabled", String(isEnabled));
                }

                // Taxonomy
                const taxonomyEnabled = preference.istaxonomy !== undefined ? preference.istaxonomy : preference.isTaxonomy;
                if (taxonomyEnabled !== undefined) {
                  const isEnabled = taxonomyEnabled === 1;
                  setIsTaxonomyEnabled(isEnabled);
                  sessionStorage.setItem("isTaxonomyEnabled", String(isEnabled));
                }

                // Question Format
                const formatEnabled = preference.isquestionformat !== undefined ? preference.isquestionformat : preference.isQuestionFormat;
                if (formatEnabled !== undefined) {
                  const isEnabled = formatEnabled === 1;
                  setIsQuestionFormatEnabled(isEnabled);
                  sessionStorage.setItem("isQuestionFormatEnabled", String(isEnabled));
                }

                // Creativity Level
                const creativityEnabled = preference.iscreativitylevel !== undefined ? preference.iscreativitylevel : preference.isCreativityLevel;
                if (creativityEnabled !== undefined) {
                  const isEnabled = creativityEnabled === 1;
                  setIsCreativityLevelEnabled(isEnabled);
                  sessionStorage.setItem("isCreativityLevelEnabled", String(isEnabled));
                }

                // Point Value
                const pointEnabled = preference.ispointvalue !== undefined ? preference.ispointvalue : preference.isPointValue;
                if (pointEnabled !== undefined) {
                  const isEnabled = pointEnabled === 1;
                  setIsPointValueEnabled(isEnabled);
                  sessionStorage.setItem("isPointValueEnabled", String(isEnabled));
                }

                // Question Quantity
                const quantityEnabled = preference.isquestionquantity !== undefined ? preference.isquestionquantity : preference.isQuestionQuantity;
                if (quantityEnabled !== undefined) {
                  const isEnabled = quantityEnabled === 1;
                  setIsQuestionQuantityEnabled(isEnabled);
                  sessionStorage.setItem("isQuestionQuantityEnabled", String(isEnabled));
                }

                // Response Options
                const responseEnabled = preference.isnumberofresponseoptions !== undefined ? preference.isnumberofresponseoptions : preference.isNumberOfResponseOptions;
                if (responseEnabled !== undefined) {
                  const isEnabled = responseEnabled === 1;
                  setIsResponseOptionsEnabled(isEnabled);
                  sessionStorage.setItem("isResponseOptionsEnabled", String(isEnabled));
                }

                // Scenario Based
                const scenarioEnabled = preference.isscenariobased !== undefined ? preference.isscenariobased : preference.isScenarioBased;
                if (scenarioEnabled !== undefined) {
                  const isEnabled = scenarioEnabled === 0;
                  setIsScenarioBasedEnabled(isEnabled);
                  sessionStorage.setItem("isScenarioBasedEnabled", String(isEnabled));
                }

                // Multi Passage
                const multiPassageEnabled = preference.ismultipassage !== undefined ? preference.ismultipassage : preference.isMultiPassage;
                if (multiPassageEnabled !== undefined) {
                  const isEnabled = multiPassageEnabled === 0;
                  setIsMultiPassageEnabled(isEnabled);
                  sessionStorage.setItem("isMultiPassageEnabled", String(isEnabled));
                }

                // Select the Blank
                const selectBlankEnabled = preference.isselecttheblank !== undefined ? preference.isselecttheblank : preference.isSelectTheBlank;
                if (selectBlankEnabled !== undefined) {
                  const isEnabled = selectBlankEnabled === 1;
                  setIsSelectTheBlankEnabled(isEnabled);
                  sessionStorage.setItem("isSelectTheBlankEnabled", String(isEnabled));
                }

                // Item Meta Data
                const itemMetaDataEnabled = preference.isitemmetadata !== undefined ? preference.isitemmetadata : preference.isItemMetaData;
                if (itemMetaDataEnabled !== undefined) {
                  const isEnabled = itemMetaDataEnabled === 0;
                  setIsItemMetaDataEnabled(isEnabled);
                  sessionStorage.setItem("isItemMetaDataEnabled", String(isEnabled));
                }

                // Image Repository
                const imageRepositoryEnabled = preference.isimagerepository !== undefined ? preference.isimagerepository : preference.isImageRepository;
                if (imageRepositoryEnabled !== undefined) {
                  const isEnabled = imageRepositoryEnabled === 0;
                  setIsImageRepositoryEnabled(isEnabled);
                  sessionStorage.setItem("isImageRepositoryEnabled", String(isEnabled));
                }
              }
              found = true;
            }
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
        // Same as the early-return above: without this the overlay stays up forever.
        setIsInitialLoad(false);
      }
    };
    fetchDropdowns();
  }, []);

  // Selected Book Image Path (from ItemGeneration)
  const [bookImagePath, setBookImagePath] = useState<string>(() => {
    const path = sessionStorage.getItem('bookImagePath');
    return path && path.trim().length > 0 ? path : '/src/assets/item-generation.png';
  });
  useEffect(() => {
    const refresh = () => {
      const path = sessionStorage.getItem('bookImagePath');
      setBookImagePath(path && path.trim().length > 0 ? path : '/src/assets/item-generation.png');
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
    try {
      const title = getBookTitle();           // current book title in header
      const code = sessionStorage.getItem("bookCode") || "";

      const selectedBook = {
        id: 0,                                // we’ll match by name, not id
        bookname: title || code || "Unknown",
      };

      sessionStorage.setItem("selectedBook", JSON.stringify(selectedBook));
    } catch { }
  }, [bookCode, location && location.state]);
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
  //const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("generate");
  const [generationMode, setGenerationMode] = useState(false); // true for LLM, false for Knowledge Base

  // Passage Mode: 'single' or 'multi' — applies across all textbooks at generation time
  const [passageMode, setPassageMode] = useState<string>(() => sessionStorage.getItem('passageMode') || 'single');
  // With the MODE block hidden there is no control to leave Multi/Table, so a mode saved in
  // sessionStorage must not keep applying. Wait for get_preference so a valid choice isn't wiped early.
  useEffect(() => {
    if (preferencesLoaded && !showModeBlock && passageMode !== 'single') setPassageMode('single');
  }, [preferencesLoaded, showModeBlock, passageMode]);
  // Multi-passage and Table modes only apply to subjective (free-text) questions.
  // They used to be offered for every question format.
  const isSubjectiveQuestionType = (type: string): boolean =>
    /written|essay|long\s*answer|short\s*answer|subjective/i.test(String(type || ''));
  const supportsPassageModes = isSubjectiveQuestionType(selectedQuestionType);
  const [numPassages, setNumPassages] = useState<number>(() => Number(sessionStorage.getItem('numPassages') || '2'));
  const [numTableColumns, setNumTableColumns] = useState<number>(() => Number(sessionStorage.getItem('numTableColumns') || '2'));
  const [numTableRows, setNumTableRows] = useState<number>(() => Number(sessionStorage.getItem('numTableRows') || '5'));

  // Use state and effect for reactive remaining tokens
  const [remainingTokens, setRemainingTokens] = useState(0);

  // Chapter dropdown state (Study Domain)
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersError, setChaptersError] = useState<string>("");

  // Learning Objectives (LO) dropdown state
  const [learningObjectives, setLearningObjectives] = useState<LearningObjective[]>([]);
  // Default selected LO should be the first LO of the selected chapter; start empty and set after fetch
  const [selectedLO, setSelectedLO] = useState<string>('');
  const [loLoading, setLoLoading] = useState(false);
  const [loError, setLoError] = useState<string>("");

  // Point Value
  const [pointValue, setPointValue] = useState('1');

  // Keep `pointValue` in sync with sessionStorage so edits from Results page
  // (which set sessionStorage.pointValue) are reflected when returning here.
  useEffect(() => {
    const syncPointValue = () => {
      try {
        const v = sessionStorage.getItem("pointValue");
        if (v != null) setPointValue(v);
      } catch { }
    };
    // Run once on mount to pick up any value written by other pages
    syncPointValue();
    // Sync when storage changes (other tabs) and when this tab regains focus
    window.addEventListener('storage', syncPointValue);
    window.addEventListener('focus', syncPointValue);
    const onVisibility = () => { if (!document.hidden) syncPointValue(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', syncPointValue);
      window.removeEventListener('focus', syncPointValue);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Additional Instructions
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [includeQuestionImages, setIncludeQuestionImages] = useState<boolean>(() => {
    try {
      return false;
    } catch {
      return false;
    }
  });

  // Clear additionalInstructions and sessionStorage on every mount
  useEffect(() => {
    setAdditionalInstructions('');
    try {
      sessionStorage.removeItem('additionalInstructions');
      sessionStorage.removeItem('ratingFeedback');
      sessionStorage.removeItem('includeQuestionImages');
    } catch { }
  }, []);

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
    // Skip if already triggered by dropdowns fetch
    if (statsFetchedRef.current) return;
    let userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");

    const payload = {
      custcode: sessionStorage.getItem('custcode') || userInfo["custcode"] || "",
      orgcode: sessionStorage.getItem('orgcode') || userInfo["orgcode"] || "",
      usercode: sessionStorage.getItem('userCode') || userInfo["usercode"] || "",
      appcode: "AIG", type: 1
      // add other fields as needed
    };

    const getStats = async () => {
      try {
        const data: string | any[] = await fetchUsageStats(payload);
        let parsed: any[] = [];
        if (typeof data === "string") {
          parsed = (data as string).split(",").map((v: string, i: number) => {
            if (i === 7) return v.trim();
            const num = Number(v.replace(/[^\d.-]/g, ""));
            return isNaN(num) ? v.trim() : num;
          });
        } else if (Array.isArray(data) && data.length === 1 && typeof data[0] === "string") {
          parsed = (String(data[0])).split(",").map((v: string, i: number) => {
            if (i === 7) return v.trim();
            const num = Number(v.replace(/[^\d.-]/g, ""));
            return isNaN(num) ? v.trim() : num;
          });
        } else if (Array.isArray(data) && data.length === 1 && Array.isArray(data[0])) {
          parsed = data[0];
        } else if (Array.isArray(data)) {
          parsed = data as any[];
        }

        // Persist for other components (e.g., today's usage card)
        try {
          sessionStorage.setItem("usageStats", JSON.stringify(parsed));
        } catch { }

        const remaining = (() => {
          const raw = parsed?.[2];
          if (typeof raw === "number") return raw;
          if (typeof raw === "string") {
            const n = Number(raw.replace(/[,\s]/g, ""));
            return isNaN(n) ? 0 : n;
          }
          return 0;
        })();
        setRemainingTokens(remaining);
      } catch (err) {
        setError((err as Error).message);
      }
    };

    getStats();
  }, []);

  // Fetch chapters and immediately fetch LOs for the first chapter
  useEffect(() => {
    // If LOs are loaded and no selection yet, default to first
    if (!loLoading && !loError && selectedLO === '' && learningObjectives.length > 0) {
      const first = learningObjectives[0];
      setSelectedLO(first.loCode);
      setLearningObjectivesName(first.loName || '');
      sessionStorage.setItem('selectedLO', first.loCode);
      sessionStorage.setItem('learningObjectivesName', first.loName || '');
    }
  }, [learningObjectives, loLoading, loError, selectedLO]);

  useEffect(() => {
    // Prevent duplicate calls in React Strict Mode
    if (chaptersFetchedRef.current) return;
    chaptersFetchedRef.current = true;
    const fetchLOsForChapter = (chapterCode) => {
      setLoLoading(true);
      setLoError("");
      getLearningObjectives(chapterCode)
        .then((result) => {
          setLearningObjectives(result);
          if (result.length > 0) {
            const first = result[0];
            const code = first.loCode;
            const name = first.loName || '';
            setSelectedLO(code);
            setLearningObjectivesName(name);
            sessionStorage.setItem('selectedLO', code);
            sessionStorage.setItem('learningObjectivesName', name);
          } else {
            // No LOs available for this chapter
            setSelectedLO('ALL');
            setLearningObjectivesName('');
            sessionStorage.setItem('selectedLO', 'ALL');
            sessionStorage.setItem('learningObjectivesName', '');
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
              sessionStorage.setItem("selectedChapterName", firstChapter.chapterName);
            } else {
              sessionStorage.setItem("selectedChapter", firstChapter.chapterCode);
              sessionStorage.setItem("selectedChapterName", firstChapter.chapterCode);
            }
            // Reset LO before fetching; will default to first once loaded
            setSelectedLO('');
            sessionStorage.removeItem('selectedLO');
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

  useEffect(() => {
    const hasSelectedBook =
      !!sessionStorage.getItem("bookCode") ||
      !!sessionStorage.getItem("bookid");
    if (!hasSelectedBook) return;

    // Don’t decide while things are still loading
    if (chaptersLoading || loLoading) return;
    if (isInitialLoad || taxonomyList.length === 0) return;


    // If chapters fetch is done and there are none, show message
    if (!chaptersLoading && Array.isArray(chapters) && chapters.length === 0) {
      setShowEmptyLOMessage(true);
      return;
    }

    // If a chapter is selected, LOs finished loading, and none were returned, show message
    // If a chapter is selected, LOs finished loading, there are none, and no LO is selected, show message
    if (
      selectedChapter &&
      !loLoading &&
      Array.isArray(learningObjectives) &&
      learningObjectives.length === 0 &&
      !selectedLO
    ) {
      setShowEmptyLOMessage(true);
      return;
    }

    // Otherwise hide it
    setShowEmptyLOMessage(false);
  }, [chapters, learningObjectives, selectedChapter, chaptersLoading, loLoading, isInitialLoad, taxonomyList]);
  // Handle chapter change (also fetch LOs for the selected chapter)
  const handleChapterChange = (value: string) => {
    setSelectedChapter(value);
    // Find the selected chapter to get its name
    const selectedChapterObj = chapters.find(ch => ch.chapterCode === value);
    if (selectedChapterObj) {
      // Store both chapter code and name in sessionStorage
      sessionStorage.setItem("chaptercode", value);
      const name = selectedChapterObj.chapterName || value;
      sessionStorage.setItem("selectedChapter", name);
      sessionStorage.setItem("selectedChapterName", name);
    }
    // Reset LO when chapter changes; will default to first after fetch
    setSelectedLO("");
    setLearningObjectives([]);
    setLearningObjectivesName("");
    // Clear any stale LO selection tied to previous chapter
    try {
      sessionStorage.removeItem('selectedLO');
      sessionStorage.removeItem('learningObjectivesName');
    } catch { }
    // Fetch LOs for this chapter
    setLoLoading(true);
    setLoError("");
    getLearningObjectives(value)
      .then((result) => {
        setLearningObjectives(result);
        if (result.length > 0) {
          // Always default to the first LO for the newly selected chapter
          const first = result[0];
          const loCodeValue = first.loCode;
          setSelectedLO(loCodeValue);
          setLearningObjectivesName(first.loName || "");
          try {
            sessionStorage.setItem("selectedLO", loCodeValue);
            sessionStorage.setItem("learningObjectivesName", first.loName || "");
          } catch { }
        } else {
          // No LOs for this chapter: fallback to ALL
          setSelectedLO('ALL');
          setLearningObjectivesName('');
          try {
            sessionStorage.setItem('selectedLO', 'ALL');
            sessionStorage.setItem('learningObjectivesName', '');
          } catch { }
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
  // Builds the comma-separated ID string for agentic_item_gen in the format:
  // KB_ID, TAXONOMY_GUIDELINE_ID, DIFFICULTY_GUIDELINE_ID, QUESTION_TYPE_GUIDELINE_ID
  const buildAgenticItemGenIds = () => {
    // 1. Get KB ID (already stored as ID in selectedKnowledgeBase)
    const kbId = selectedKnowledgeBase || "0";

    // 2. Get taxonomy guideline ID (e.g., 442 for REMEMBER)
    const taxonomyMap: Record<string, string> = {
      "Remember": "REMEMBER",
      "Understand": "UNDERSTAND",
      "Apply": "APPLY",
      "Analyze": "ANALYZE",
      "Evaluate": "EVALUATE",
      "Create": "CREATE"
    };

    const taxonomyGuidelineId = isTaxonomyEnabled
      ? (guidelines?.find(g =>
        (g.guidelinename || "").toUpperCase() === (taxonomyMap[selectedTaxonomy] || "")
      )?.guidelineid || "0")
      : "0";

    // 3. Get difficulty guideline ID based on selectedCreativityLevel
    const difficultyMap: Record<string, string> = {
      "moderate": "DIFFICULTY_LEVEL_EASY",
      "high": "DIFFICULTY_LEVEL_MEDIUM",
      "very high": "DIFFICULTY_LEVEL_HARD"
    };

    const difficultyGuidelineId = isCreativityLevelEnabled
      ? ((() => {
        const difficultyKey = difficultyMap[selectedCreativityLevel?.toLowerCase() || ''] || "";
        return guidelines?.find(g => (g.guidelinename || "").toUpperCase() === difficultyKey)?.guidelineid || "0";
      })())
      : "0";

    // 4. Get question type guideline ID (e.g., 467 for MULTIPLE_CHOICE)
    const formatMap: Record<string, string> = {
      "Multiple Choice": "MULTIPLE_CHOICE",
      "Multiple Response": "MULTIPLE_RESPONSE",
      "True False": "TRUE_FALSE",
      "Fill In the Blank": "FILL_IN_THE_BLANK",
      "Written Response": "WRITTEN_RESPONSE",
      "Select the Blank": "SELECT_THE_BLANK",
    };

    const questionTypeKey = formatMap[selectedQuestionType] || "";
    const questionTypeGuideline = guidelines?.find(g =>
      (g.guidelinename || "").toUpperCase() === questionTypeKey
    );
    const questionTypeGuidelineId = questionTypeGuideline?.guidelineid || "0";
    console.log("paylod for the 3 strings", questionTypeGuidelineId, difficultyGuidelineId)
    // Return as comma-separated string
    return `${kbId},${taxonomyGuidelineId},${difficultyGuidelineId},${questionTypeGuidelineId}`;
  };
  const handleGenerateQuestions = () => {
    if ((!selectedKnowledgeBase || selectedKnowledgeBase === "0") && !isChecked) {
      setKnowledgeBaseValidationError("Select Knowledge Base");
      return;
    }

    // Gather all required data for item generation
    if (isStudyLOEnabled) {
      if (!selectedChapter || !Array.isArray(learningObjectives) || learningObjectives.length === 0) {
        setShowEmptyLOMessage(true);
        setTimeout(() => studyLOHintRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        return;
      }
    }

    let Snumber = '';
    switch (studynumber) {
      case 0: Snumber = (studynumber + 1) + 'st'; break;
      case 1: Snumber = (studynumber + 1) + 'nd'; break;
      case 2: Snumber = (studynumber + 1) + 'rd'; break;
      default: Snumber = (studynumber + 1) + 'th'; break;
    }
    let LOs = ``;
    let Lo_Pnumber = ``;
    let selectedlonumber = 0;
    let selectedLoPnumber = ``;
    for (let j = 0; j < learningObjectives.length; j++) {
      LOs = LOs + `${j + 1}.${learningObjectives[j].loName}\n`;
      Lo_Pnumber = Lo_Pnumber + `Learning objective ${j + 1} : pages from ${(learningObjectives[j] as any).loPnumber || ''},`
      if (learningObjectivesName != '' && learningObjectivesName == learningObjectives[j].loName) {
        selectedlonumber = j + 1;
      }
      if (selectedLO == learningObjectives[j].loCode) {
        selectedLoPnumber = (learningObjectives[j] as any).loPnumber || '';
      }
    }
    //(selectedOption);

    const params = {
      question: additionalInstructions,
      //selectedOption: generationMode ? "Book Based" : "Global",
      selectedOption: selectedOption,
      selectedBook: { bookid: sessionStorage.getItem("bookCode") || "2" },
      questiontypeid: selectedQuestionType,
      taxonomyid: Number(sessionStorage.getItem('taxonomyid') || '1'),
      difficultylevelid: "1", // You may want to add a difficulty dropdown
      selectedChapterCode: selectedChapter,
      looutcomesId: selectedLO,
      selectedQuantity: selectedQuantity, // Pass as selectedQuantity for downstream
      noofquestions: selectedQuantity, // Always pass as noofquestions for downstream
      selectedDistractor: selectedResponseOptions,
      numberOfCorrectOptions: numberOfCorrectOptions,
      creativitylevelid: "1", // You may want to add a creativity dropdown
      agenttype: "1", // You may want to add an agent type selector
      pointValue: pointValue,
      chapter: chapters.find(ch => ch.chapterCode === selectedChapter)?.chapterName || "",// feching chapter name by its code
      studynumber: Snumber,
      loName: sessionStorage.getItem("learningObjectivesName"),
      Lo_Pnumber: selectedOption == "Book Based" ? selectedLoPnumber : Lo_Pnumber,
      passageMode: passageMode,
      numPassages: numPassages,
      numTableColumns: numTableColumns,
      numTableRows: numTableRows,
    };

    // Persist current taxonomy label just before navigating (final safeguard)
    if (selectedTaxonomy && selectedTaxonomy.trim().length > 0) {
      sessionStorage.setItem('selectedTaxonomy', selectedTaxonomy.trim());
    }
    // Persist question type and quantity just before navigating so loading page can read them
    try {
      if (selectedQuestionType && String(selectedQuestionType).trim().length > 0) {
        sessionStorage.setItem('selectedQuestionType', String(selectedQuestionType));
      }
      if (selectedQuantity !== undefined && selectedQuantity !== null && String(selectedQuantity).trim().length > 0) {
        sessionStorage.setItem('selectedQuantity', String(selectedQuantity));
      }
      sessionStorage.setItem('selectedDistractor', String(selectedResponseOptions));
      sessionStorage.setItem('numberOfCorrectOptions', String(numberOfCorrectOptions));
      sessionStorage.setItem('passageMode', passageMode);
      sessionStorage.setItem('numPassages', String(numPassages));
      sessionStorage.setItem('numTableColumns', String(numTableColumns));
      sessionStorage.setItem('numTableRows', String(numTableRows));
    } catch (err) {
      console.warn('Unable to persist selection to sessionStorage before navigate', err);
    }
    navigate("/advanced-question-generation-loading", { state: params });
  };

  // Persist Study Domain (Chapter)
  // Store both the chapter code (`chaptercode`) and the user-facing chapter name
  useEffect(() => {
    if (!selectedChapter) return;
    try {
      // persist code
      sessionStorage.setItem("chaptercode", selectedChapter);
      // persist readable name (fall back to code if name not available)
      const name = chapters.find(ch => ch.chapterCode === selectedChapter)?.chapterName || selectedChapter;
      sessionStorage.setItem("selectedChapter", name);
      sessionStorage.setItem("selectedChapterName", name);
    } catch { }
  }, [selectedChapter, chapters]);

  // Defensive sync: ensure selectedChapterName exists if only code is present
  useEffect(() => {
    try {
      const storedName = sessionStorage.getItem("selectedChapterName");
      const code = sessionStorage.getItem("chaptercode") || selectedChapter;
      if ((!storedName || storedName.trim().length === 0) && code) {
        const name = chapters.find(ch => ch.chapterCode === code)?.chapterName || code;
        sessionStorage.setItem("selectedChapter", name);
        sessionStorage.setItem("selectedChapterName", name);
      }
    } catch { }
  }, [chapters, selectedChapter]);

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

  // Persist Number of Correct Options (for Multiple Response)
  useEffect(() => {
    if (numberOfCorrectOptions) sessionStorage.setItem("numberOfCorrectOptions", numberOfCorrectOptions.toString());
  }, [numberOfCorrectOptions]);

  // Persist Passage Mode (Single/Multi) — read by the generation request below
  useEffect(() => {
    if (passageMode) sessionStorage.setItem('passageMode', passageMode);
  }, [passageMode]);

  // Bind Scenario_based / Multi_Passage_based General Guidelines to Passage Mode.
  // Auto-add Scenario_based when Multi passage count is 1; auto-add Multi_Passage_based
  // when Multi passage count is 2 or more. Normal mode removes passage-specific guidelines.
  useEffect(() => {
    const scenarioId = getScenarioBasedGuidelineId();
    const multiPassageId = getMultiPassageGuidelineId();
    const tableAnalysisId = getTableAnalysisGuidelineId();

    if (!scenarioId && !multiPassageId && !tableAnalysisId) {
      console.warn(
        "[GuidelineBinding] Neither Scenario_based nor Multi_Passage_based guideline " +
        "found yet. Check the guideline's guidelinetype/guidelinesubtype matches what " +
        "fetchFilteredGuidelinesForDropdown filters on (par_guidelinetype='Content', " +
        "par_guidelinesubtype='general_rules'), or wait for guidelines to finish loading."
      );
      return;
    }

    setSelectedGuidelines(prev => {
      let next = [...prev];

      if (passageMode === 'single') {
        // Normal mode: remove passage-specific guidelines and do not auto-add any.
        next = next.filter(id => id !== scenarioId && id !== multiPassageId && id !== tableAnalysisId);
      } else if (passageMode === 'multi') {
        if (numPassages === 1) {
          if (scenarioId && !next.includes(scenarioId)) next.push(scenarioId);
          if (multiPassageId) next = next.filter(id => id !== multiPassageId);
        } else {
          if (multiPassageId && !next.includes(multiPassageId)) next.push(multiPassageId);
          if (scenarioId) next = next.filter(id => id !== scenarioId);
        }
        next = next.filter(id => id !== tableAnalysisId);
      } else if (passageMode === 'table') {
        if (tableAnalysisId && !next.includes(tableAnalysisId)) next.push(tableAnalysisId);
        next = next.filter(id => id !== scenarioId && id !== multiPassageId);
      }

      const sameLength = next.length === prev.length;
      const sameContent = sameLength && next.every((value, index) => value === prev[index]);
      if (sameContent) return prev;

      try { sessionStorage.setItem('selectedGuidelines', JSON.stringify(next)); } catch { }
      return next;
    });
  }, [passageMode, numPassages, guidelines, allGuidelinesForBadges, selectedKnowledgeBase]);

  useEffect(() => {
    const dropdownGuidelineId = getFillInBlankDropdownGuidelineId();
    if (!dropdownGuidelineId) return;

    setSelectedGuidelines(prev => {
      let next = [...prev];
      const isDropdownType = selectedQuestionType === 'Select the Blank' ||
        selectedQuestionType === 'Fill In the Blank Dropdown';

      if (isDropdownType) {
        if (!next.includes(dropdownGuidelineId)) next.push(dropdownGuidelineId);
      } else {
        next = next.filter(id => id !== dropdownGuidelineId);
      }

      const sameLength = next.length === prev.length;
      const sameContent = sameLength && next.every((v, i) => v === prev[i]);
      if (sameContent) return prev;

      try { sessionStorage.setItem('selectedGuidelines', JSON.stringify(next)); } catch { }
      return next;
    });
    // allGuidelinesForBadges is the pool that actually carries SELECT_THE_BLANK,
    // so the effect must re-run once that list arrives.
  }, [selectedQuestionType, guidelines, allGuidelinesForBadges]);


  // Persist Number of Passages (used only when passageMode === 'multi')
  useEffect(() => {
    if (numPassages) sessionStorage.setItem('numPassages', String(numPassages));
  }, [numPassages]);

  useEffect(() => {
    if (numTableColumns) sessionStorage.setItem('numTableColumns', String(numTableColumns));
  }, [numTableColumns]);
  useEffect(() => {
    if (numTableRows) sessionStorage.setItem('numTableRows', String(numTableRows));
  }, [numTableRows]);

  // Persist Additional Instructions (also store as ratingFeedback)
  useEffect(() => {
    try {
      sessionStorage.setItem("additionalInstructions", additionalInstructions);
      // sessionStorage.setItem("ratingFeedback", additionalInstructions);
    } catch (err) {
      console.warn('Unable to persist additional instructions to sessionStorage', err);
    }
  }, [additionalInstructions]);

  useEffect(() => {
    try {
      sessionStorage.setItem("includeQuestionImages", String(includeQuestionImages));
    } catch (err) {
      console.warn('Unable to persist includeQuestionImages in sessionStorage', err);
    }
  }, [includeQuestionImages]);

  // Ensure numberOfCorrectOptions stays within [2, selectedResponseOptions - 1] for Multiple Response
  useEffect(() => {
    if (selectedQuestionType === "Multiple Response") {
      const maxCorrect = Math.max(2, selectedResponseOptions - 1);
      let next = numberOfCorrectOptions;
      if (next > maxCorrect) next = maxCorrect;
      if (next < 2) next = 2;
      if (next !== numberOfCorrectOptions) {
        setNumberOfCorrectOptions(next);
        sessionStorage.setItem('numberOfCorrectOptions', String(next));
      }
    }
  }, [selectedResponseOptions, selectedQuestionType]);
isSSO
  const handleChange = (cpCode) => {
    // Coerce to string and defensively persist chapter code + name
    const code = cpCode != null ? String(cpCode) : "";
    setSelectedChapter(code);
    const selectedChapterObj = chapters.find(ch => ch.chapterCode === code);
    const name = selectedChapterObj?.chapterName || code;
    try {
      sessionStorage.setItem("chaptercode", code);
      sessionStorage.setItem("selectedChapter", name);
      sessionStorage.setItem("selectedChapterName", name);
      // Touch a timestamp so any storage listeners detect a change
      sessionStorage.setItem("selectedChapter_lastUpdate", String(Date.now()));
    } catch (err) { }
  };

  const handleToggleChange = (isChecked) => {
    setIsChecked(isChecked);
    setGenerationMode(isChecked)
    setSelectedOption(isChecked ? 'LLM' : 'Book Based');
    sessionStorage.setItem("selectedGenerationMode", isChecked ? 'LLM' : 'Book Based');
    setKnowledgeBaseValidationError("");
  };

  const handlePointChange = (e) => {
    setPointValue(e.target.value);
    sessionStorage.setItem("pointValue", e.target.value);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      {!isSSO && (
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">

                <img
                  src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                  alt="AI-Levate"
                  className="h-10 w-auto"
                />

              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-purple-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs">✦</span>
                </div>
                <span className="text-base text-purple-600 font-medium">Book Name:  {bookTitle}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs">⚡</span>
                </div>
                <span className="text-base text-blue-600 font-medium">
                  Remaining Tokens: {remainingTokens.toLocaleString()}
                </span>
              </div>
              <Link to="/advanced-item-generation">
                <Button variant="ghost" size="sm" className="text-gray-600">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
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
      )}

      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto">
        {(chaptersLoading || loLoading || (isInitialLoad && taxonomyList.length === 0)
          || knowledgeBasesLoading || !initialGuidelinesLoaded) && (
          <PageLoader text="Loading stats..." />
        )}
        {/* Navigation Tabs - Hidden in SSO mode */}
        {!isSSO && (
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
                    navigate("/advanced-question-repository");
                  }}
                  className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${window.location.pathname === "/advanced-question-repository" || activeTab === "repository"
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
        )}

        {activeTab === "generate" && (
          <div className="space-y-6">
            {/* Top Row - Tokens and AI Mode */}
            <div className={`grid grid-cols-1 gap-6 ${!isSSO ? 'lg:grid-cols-2' : ''}`}>
              {/* Available Tokens */}
              {!isSSO && (
                <Card className="p-6 bg-white border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-700">Available Tokens</h3>
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <Zap className="w-4 h-4 text-green-600" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {remainingTokens}

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
              )}
              {/* AI Generation Mode */}
              <Card className="p-6 bg-white border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700">AI Generation Mode</h3>
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Settings2 className="w-4 h-4 text-blue-600" />
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full p-1 flex items-center">
                  <button
                    type="button"
                    onClick={() => handleToggleChange(false)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 ${!generationMode ? 'bg-emerald-500 text-white shadow' : 'text-gray-600'}`}
                  >
                    <Database className="w-4 h-4" />
                    Knowledge Base
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleChange(true)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 ${generationMode ? 'bg-blue-600 text-white shadow' : 'text-gray-600'}`}
                  >
                    <Brain className="w-4 h-4" />
                    LLM
                  </button>
                </div>
              </Card>
            </div>

            {/* Main Content Row */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Left Column - Source Material */}
              {!isSSO && (
                <div className="lg:col-span-1 space-y-6">
                  {/* Source Material */}
                  <Card className="p-6 bg-white border border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700 mb-4">Source Material</h3>
                    <p className="text-xs text-gray-500 mb-4">AI enhanced content</p>
                    <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                      <img

                        src={getImageUrl(bookImagePath)}
                        className="w-full h-32 object-cover rounded-lg mb-3"
                      />
                      <h4 className="font-medium text-gray-900 text-sm mb-1 break-words max-w-xs">
                        {bookTitle}
                      </h4>
                    </div>
                  </Card>
                </div>
              )}
              {/* Right Column - AI Question Generator */}
              <div className={`${!isSSO ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
                <Card className="p-6 bg-white border border-gray-200">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">AI Question Generator</h3>
                        <p className="text-sm text-gray-500">Configure your question generation settings</p>
                        {/* Sets expectations before the wait on the loading screen. */}
                        <p role="note" className="mt-1 flex items-center gap-1 text-xs text-blue-700">
                          <Info className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                          <span><strong className="font-semibold">Note:</strong> Initial question generation may take some time.</span>
                        </p>
                      </div>
                    </div>
                    {showModeBlock && (
                    <div className="w-full lg:w-auto rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                            Mode
                          </span>
                        </div>




                        <div className="w-full sm:w-auto rounded-full border border-gray-200 bg-white p-1 shadow-sm flex items-center">

                          {preferences.normal === 1 && (
                            <button
                              type="button"
                              onClick={() => setPassageMode("single")}
                              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-all duration-200 ${passageMode === "single"
                                ? "bg-emerald-500 text-white shadow"
                                : "text-gray-600"
                                }`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Normal
                            </button>
                          )}

                          {preferences.multi === 1 && (
                            <button
                              type="button"
                              onClick={() => setPassageMode("multi")}
                              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-all duration-200 ${passageMode === "multi"
                                ? "bg-blue-600 text-white shadow"
                                : "text-gray-600"
                                }`}
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              Multi
                            </button>
                          )}

                          {preferences.table === 1 && (
                            <button
                              type="button"
                              onClick={() => setPassageMode("table")}
                              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-all duration-200 ${passageMode === "table"
                                ? "bg-purple-600 text-white shadow"
                                : "text-gray-600"
                                }`}
                            >
                              <List className="w-3.5 h-3.5" />
                              Table
                            </button>
                          )}

                        </div>
                      </div>

                      {passageMode === 'multi' && (
                        <div className="mt-3 w-fit max-w-[220px]">
                          <label className="mb-1 block text-[11px] font-medium text-gray-600">Number of Passages</label>
                          <Select
                            value={String(numPassages)}
                            onValueChange={(value) => setNumPassages(Number(value))}
                          >
                            <SelectTrigger className="h-8 min-w-[140px] border-gray-200 bg-white text-sm">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <SelectItem key={n} value={String(n)}>{n} Passages</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {passageMode === 'table' && (
                        <div className="mt-3 flex gap-3">
                          <div className="w-fit max-w-[160px]">
                            <label className="mb-1 block text-[11px] font-medium text-gray-600">Data Columns</label>
                            <Select value={String(numTableColumns)} onValueChange={(v) => setNumTableColumns(Number(v))}>
                              <SelectTrigger className="h-8 min-w-[110px] border-gray-200 bg-white text-sm">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3].map((n) => (
                                  <SelectItem key={n} value={String(n)}>{n} Column{n > 1 ? 's' : ''}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-fit max-w-[160px]">
                            <label className="mb-1 block text-[11px] font-medium text-gray-600">Rows</label>
                            <Select value={String(numTableRows)} onValueChange={(v) => setNumTableRows(Number(v))}>
                              <SelectTrigger className="h-8 min-w-[110px] border-gray-200 bg-white text-sm">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <SelectItem key={n} value={String(n)}>{n} Row{n > 1 ? 's' : ''}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Study Domain */}
                    {isStudyLOEnabled && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Target className="w-4 h-4 text-blue-600" />
                          <label className="text-sm font-medium text-gray-700">Study</label>
                        </div>
                        <Select
                          value={selectedChapter}
                          onValueChange={handleChapterChange}
                          disabled={chaptersLoading || chapters.length === 0}>
                          <SelectTrigger className="w-full bg-white border-gray-200 h-11 flex items-center justify-between px-3 text-sm">
                            {/* <span className="text-left whitespace-normal break-words flex-1">
                              {chaptersLoading
                                ? "Loading..."
                                : (chaptersError
                                  ? chaptersError
                                  : (chapters.find(ch => ch.chapterCode === selectedChapter)?.chapterName || "Select chapter"))}
                            </span> */}
                            {/* Keep SelectValue for accessibility; hide visual text */}
                            <SelectValue className="sr-only" placeholder={chaptersLoading ? "Loading..." : chaptersError ? chaptersError : "Select chapter"} />
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
                    )}

                    {/* Learning Objectives*/}
                    {isStudyLOEnabled && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Brain className="w-4 h-4 text-blue-600" />
                          <label className="text-sm font-medium text-gray-700">Learning Objectives</label>
                        </div>
                        <Select
                          value={selectedLO}
                          onValueChange={(val) => {
                            const loCodeWithPrefix = val === 'ALL' ? 'ALL' : (val.startsWith('LO') ? val : `${val}`);
                            setSelectedLO(loCodeWithPrefix);
                            sessionStorage.setItem("selectedLO", loCodeWithPrefix);
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
                          disabled={loLoading}>
                          <SelectTrigger className="w-full bg-white border-gray-200 h-11 flex items-center justify-between px-3 text-sm">
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
                    )}

                    {isStudyLOEnabled && showEmptyLOMessage && (
                      <div
                        ref={studyLOHintRef}
                        role="status"
                        className="lg:col-span-2 -mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                      >
                        <span>
                          {chapters.length === 0
                            ? 'Study and learning objectives are not added for this book. Please upload Study and LO to generate questions.'
                            : 'No learning objectives are added for this Study. Please upload Study and LO to generate questions.'}
                        </span>
                        {/* SSO type 3 users have no access to Manage Book Details. */}
                        {!(isSSO && sessionStorage.getItem('loginType') === '3') && (
                          <button
                            type="button"
                            className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                            onClick={() => {
                              const bookTitle = sessionStorage.getItem('bookTitle') || bookCode || '';
                              navigate('/book-base', { state: { openStudyLOForBook: bookTitle } });
                            }}
                          >
                            Click here to upload
                          </button>
                        )}
                      </div>
                    )}

                    {/* Taxonomy Framework (Taxonomy) */}
                    {isTaxonomyEnabled && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Globe className="w-4 h-4 text-blue-600" />
                          <label className="text-sm font-medium text-gray-700">{currentLabels.taxonomy} <span className="text-red-500">*</span></label>
                        </div>
                        {dropdownError ? (
                          <div className="text-red-500 text-xs mb-2">{dropdownError}</div>
                        ) : null}
                        <select
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={selectedTaxonomy}
                          onChange={(e) => {
                            const value = e.target.value;
                            // prefer the visible option text as the taxonomy name
                            const label = e.target.options[e.target.selectedIndex]?.text || value;
                            setSelectedTaxonomy(value);
                            // store the taxonomy name in sessionStorage under 'selectedTaxonomy'
                            sessionStorage.setItem("selectedTaxonomy", label);
                            const mappedId = label === 'Remember' ? '1'
                              : label === 'Understand' ? '2'
                                : label === 'Apply' ? '3'
                                  : label === 'Analyze' ? '4'
                                    : label === 'Evaluate' ? '5'
                                      : label === 'Create' ? '6'
                                        : '1';
                            sessionStorage.setItem('taxonomyid', mappedId);
                          }}
                          disabled={!!dropdownError || taxonomyList.length === 0}
                        >

                          {taxonomyList.map((tax, idx) => (
                            <option key={idx} value={tax}>{tax}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Question Format (Question Type) */}
                    {isQuestionFormatEnabled && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <FileText className="w-4 h-4 text-green-600" />
                          <label className="text-sm font-medium text-gray-700">{currentLabels.questionType} <span className="text-red-500">*</span></label>
                        </div>
                        {dropdownError ? (
                          <div className="text-red-500 text-xs mb-2">{dropdownError}</div>
                        ) : null}
                        <select
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={selectedQuestionType}
                          onChange={e => {
                            setSelectedQuestionType(e.target.value);
                            sessionStorage.setItem("selectedQuestionType", e.target.value);
                            sessionStorage.setItem("pointValue", "5");
                          }}
                          disabled={!!dropdownError || questionTypes.length === 0}>
                          {questionTypes.map((type, idx) => (
                            <option key={idx} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Creativity Level */}
                    {isCreativityLevelEnabled && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Zap className="w-4 h-4 text-purple-600" />
                          <label className="text-sm font-medium text-gray-700">{currentLabels.creativityLevel} <span className="text-red-500">*</span></label>
                        </div>
                        <Select
                          value={selectedCreativityLevel}
                          onValueChange={(value) => {
                            setSelectedCreativityLevel(value);
                            sessionStorage.setItem("selectedCreativityLevel", value);
                          }}>
                          <SelectTrigger className="w-full bg-white border-gray-200 h-11 flex items-center justify-between px-3 text-sm">
                            <SelectValue placeholder="Select creativity level" />
                          </SelectTrigger>
                          <SelectContent>
                            {creativityLevels.map((level) => (
                              <SelectItem
                                key={level.id}
                                value={level.creativitylevel}
                              >
                                {level.creativitylevel}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Point Value */}
                    {isPointValueEnabled && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="inline-flex items-center justify-center w-4 h-4 text-pink-600 text-sm font-bold leading-none">★</span>
                          <label className="text-sm font-medium text-gray-700">{currentLabels.pointValue} <span className="text-red-500">*</span></label>
                        </div>
                        <select
                          className="w-full border rounded px-3 py-2"
                          value={pointValue}
                          onChange={handlePointChange}
                        >
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={String(n)}>{n}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Question Quantity */}
                    {isQuestionQuantityEnabled && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-4 h-4 text-pink-600 text-sm font-bold">
                            <Hash className="w-4 h-4 text-orange-600" />
                          </span>
                          <label className="text-sm font-medium text-gray-700">{currentLabels.questionQuantity} <span className="text-red-500">*</span></label>
                        </div>
                        {dropdownError ? (
                          <div className="text-red-500 text-xs mb-2">{dropdownError}</div>
                        ) : null}
                        <select
                          className="w-full border rounded px-3 py-2 text-sm"
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
                    )}

                    {/* Number of Response Options */}
                    {isResponseOptionsEnabled && (selectedQuestionType === "Multiple Choice" || selectedQuestionType === "Multiple Response") && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-4 h-4 text-indigo-600 text-sm font-bold">#</span>
                          <label className="text-sm font-medium text-gray-700">Number of Response Options <span className="text-red-500">*</span></label>
                        </div>
                        <Select
                          value={selectedResponseOptions.toString()}
                          onValueChange={(value) => {
                            setSelectedResponseOptions(parseInt(value));
                            sessionStorage.setItem("selectedResponseOptions", value);
                          }}
                        >
                          <SelectTrigger className="w-full bg-white border-gray-200 h-11 flex items-center justify-between px-3 text-sm">
                            <SelectValue placeholder="Select number of options" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="4">4</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="6">6</SelectItem>
                            <SelectItem value="7">7</SelectItem>
                            <SelectItem value="8">8</SelectItem>
                            <SelectItem value="9">9</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Number of Correct Options (Multiple Response only) */}
                    {selectedQuestionType === "Multiple Response" && (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-4 h-4 text-indigo-600 text-sm font-bold">#</span>
                          <label className="text-sm font-medium text-gray-700">Number of Correct Options <span className="text-red-500">*</span></label>
                        </div>

                        <Select
                          value={numberOfCorrectOptions.toString()}
                          onValueChange={(value) => {
                            const next = parseInt(value);
                            const maxCorrect = Math.max(2, selectedResponseOptions - 1);
                            const clamped = Math.min(Math.max(next, 2), maxCorrect);
                            setNumberOfCorrectOptions(clamped);
                            sessionStorage.setItem("numberOfCorrectOptions", String(clamped));
                          }}
                        >
                          <SelectTrigger className="w-full bg-white border-gray-200 h-11 flex items-center justify-between px-3 text-sm">
                            <SelectValue placeholder="Select number of correct options" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: Math.max(0, Math.max(2, selectedResponseOptions - 1) - 1) }, (_, i) => i + 2).map((n) => (
                              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  {/* Knowledge Base & General Guidelines */}
                  <div className="mt-6 space-y-4">
                    {/* Knowledge Base Name */}
                    {!generationMode && (<div className={generationMode ? 'opacity-50 pointer-events-none' : ''}>
                      <div className="flex items-center gap-2 mb-3">
                        <label className="text-sm font-medium text-gray-700">Knowledge Base Name {!isChecked && <span className="text-red-500">*</span>}</label>
                      </div>
                      <Select
                        disabled={generationMode}
                        value={knowledgeBaseDropdownValue}
                        onValueChange={(val) => {
                          setKnowledgeBaseValidationError("");
                          if (val === "0") {
                            // User selected default "none" - clear everything
                            const updatedArray = [];
                            setSelectedKnowledgeBase("0");
                            setKnowledgeBaseDropdownValue("0");
                            setSelectedKnowledgeBases(updatedArray);
                            try {
                              sessionStorage.setItem("selectedKnowledgeBases", JSON.stringify(updatedArray));
                              sessionStorage.setItem("selectedKnowledgeBaseIdsCsv", "");
                              sessionStorage.setItem("selectedKnowledgeBase", "0");
                            } catch { }
                            return;
                          } else {
                            if (selectedKnowledgeBases.includes(val)) {
                              setSelectedKnowledgeBase(val);
                              setKnowledgeBaseDropdownValue("0");
                              try {
                                sessionStorage.setItem("selectedKnowledgeBase", val);
                              } catch { }
                              return;
                            }

                            if (selectedKnowledgeBases.length >= 2) {
                              setKnowledgeBaseDropdownValue("0");
                              return;
                            }

                            const newArray = [...selectedKnowledgeBases, val];
                            setSelectedKnowledgeBase(val);
                            setKnowledgeBaseDropdownValue("0");
                            setSelectedKnowledgeBases(newArray);
                            try {
                              sessionStorage.setItem("selectedKnowledgeBases", JSON.stringify(newArray));
                              sessionStorage.setItem("selectedKnowledgeBaseIdsCsv", newArray.filter(id => id && id !== "0").join(","));
                              sessionStorage.setItem("selectedKnowledgeBase", val);
                            } catch { }
                          }
                        }}
                      >
                        <SelectTrigger className="w-full bg-white border-gray-200 h-11 flex items-center justify-between px-3 text-sm">
                          <SelectValue placeholder="Select knowledge base" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Select knowledge base</SelectItem>
                          {knowledgeBases.map((kb) => {
                            const id = String(
                              kb.knowledgebase_id ||
                              kb.knowledgebaseid ||
                              kb.knowledgebaseId ||
                              kb.kbid ||
                              kb.id ||
                              kb.code ||
                              ""
                            );
                            const name =
                              kb.knowladgebasename ||
                              kb.knowledgebasename ||
                              kb.knowledgebaseName ||
                              kb.kbname ||
                              kb.name ||
                              id;

                            if (!id) return null;
                            return (
                              <SelectItem key={id} value={id} disabled={selectedKnowledgeBases.includes(id)}>
                                {name}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {(knowledgeBaseValidationError || knowledgeBaseError) && (
                        <p className="mt-1 text-xs text-red-500">
                          {knowledgeBaseValidationError || knowledgeBaseError}
                        </p>
                      )}
                    </div>)}
                    {/* Selected Knowledge Bases as chips (removable) */}
                    {!isChecked && (selectedKnowledgeBases.length > 0 && (
                      // Outer green box same width as dropdown (w-full)
                      <div className="mt-2 inline-block max-w-full rounded-lg bg-green-50 border border-green-200 w-full h-58 px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {selectedKnowledgeBases.map((kbId) => {
                            const kb = knowledgeBases.find((item) => {
                              const id = String(
                                item.knowledgebase_id ||
                                item.knowledgebaseid ||
                                item.knowledgebaseId ||
                                item.kbid ||
                                item.id ||
                                item.code ||
                                ""
                              );
                              return id === kbId;
                            });

                            if (!kb) return null;

                            const name =
                              kb.knowladgebasename ||
                              kb.knowledgebasename ||
                              kb.knowledgebaseName ||
                              kb.kbname ||
                              kb.name ||
                              kbId;

                            return (
                              <div
                                key={kbId}
                                className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 border border-green-200 text-sm leading-none text-green-800"
                              >
                                <span className="mr-1 max-w-[120px] truncate">{name}</span>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center rounded-full hover:bg-green-200 text-green-700"
                                  onClick={() => {
                                    setSelectedKnowledgeBases((prev) => {
                                      const next = prev.filter((id) => id !== kbId);
                                      const nextSelected =
                                        String(selectedKnowledgeBase) === String(kbId)
                                          ? (next[0] || "0")
                                          : selectedKnowledgeBase;
                                      if (String(selectedKnowledgeBase) === String(kbId)) {
                                        setSelectedKnowledgeBase(nextSelected);
                                      }
                                      setKnowledgeBaseDropdownValue("0");
                                      try {
                                        sessionStorage.setItem("selectedKnowledgeBases", JSON.stringify(next));
                                        sessionStorage.setItem("selectedKnowledgeBaseIdsCsv", next.filter(id => id && id !== "0").join(","));
                                        sessionStorage.setItem("selectedKnowledgeBase", nextSelected);
                                      } catch { }
                                      return next;
                                    });
                                  }}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* General Guidelines */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <label className="text-sm font-medium text-gray-700">General Guidelines</label>
                      </div>
                      <Select
                        value={guidelineDropdownValue}
                        onValueChange={(val) => {
                          if (val === "0") {
                            setGuidelineDropdownValue("0");
                            return;
                          }
                          setGuidelineDropdownValue("0");

                          const isAlreadySelectedInBadges =
                            selectedGuidelines.includes(val) ||
                            (Array.isArray(guidlines) &&
                              guidlines.some((g: any) => {
                                const id = String(g?.guideline_id || g?.guidelineid || g?.id || "");
                                return id === val;
                              }));
                          if (isAlreadySelectedInBadges) {
                            return;
                          }

                          // Keep existing auto-selection logic if needed
                          setSelectedGuideline(val);

                          // Add to additional selections if it's not one of the three matched guidelines
                          const isMatchedFormat = formatGuideline && String(formatGuideline.guideline_id || formatGuideline.guidelineid || formatGuideline.id) === val;
                          const isMatchedTaxonomy = taxonomyGuideline && String(taxonomyGuideline.guideline_id || taxonomyGuideline.guidelineid || taxonomyGuideline.id) === val;
                          const isMatchedCreativity = creativityGuideline && String(creativityGuideline.guideline_id || creativityGuideline.guidelineid || creativityGuideline.id) === val;

                          if (!isMatchedFormat && !isMatchedTaxonomy && !isMatchedCreativity) {
                            setSelectedGuidelines(prev =>
                              prev.includes(val) ? prev : [...prev, val]
                            );
                          }

                          try {
                            const next = Array.from(new Set([val, ...selectedGuidelines]));
                            sessionStorage.setItem("selectedGuideline", val);
                            sessionStorage.setItem("selectedGuidelines", JSON.stringify(next));
                          } catch { }
                        }}
                      >
                        <SelectTrigger className="w-full bg-white border-gray-200 h-11 flex items-center justify-between px-3 text-sm">
                          <SelectValue placeholder="Select General Guidelines" />             </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Select General Guidelines</SelectItem>

                          {guidelines.map((g) => {
                            const id = String(g.guideline_id || g.guidelineid || g.id || "");
                            const name = g.guidelinename || g.guideline_name || g.name || id;

                            if (!id) return null;
                            const isDisabled =
                              selectedGuidelines.includes(id) ||
                              (Array.isArray(guidlines) &&
                                guidlines.some((mainG: any) => {
                                  const mainId = String(
                                    mainG?.guideline_id ||
                                    mainG?.guidelineid ||
                                    mainG?.id ||
                                    ""
                                  );
                                  return mainId === id;
                                }));
                            return (
                              <SelectItem key={id} value={id} disabled={isDisabled}>
                                {name}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {guidelineError && (
                        <p className="mt-1 text-xs text-red-500">{guidelineError}</p>
                      )}
                    </div>
                  </div>


                  {/* Current dropdown selections as badges */}
                  <div className="mt-2 inline-block max-w-full rounded-lg bg-green-50 border border-green-200 w-full h-58 px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {Array.isArray(guidlines) &&
                        guidlines
                          .filter((g) => !!g) // remove null/undefined if any of the finds failed
                          .map((g, index) => {
                            const name =
                              g.guidelinename || g.guideline_name || g.name || "";
                            if (!name) return null;
                            return (
                              <div
                                key={g.guideline_id || g.guidelineid || g.id || index}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                              >
                                {name}
                                <span className="ml-1 inline-flex items-center justify-center rounded-full text-green-400 cursor-default">
                                  <X className="w-3 h-3" />
                                </span>
                              </div>
                            );
                          })}
                      {/* Additional badges from selectedGuidelines */}
                      {(() => {
                        // IDs already shown in the main badges (from guidlines array)
                        const mainIds = new Set<string>();
                        if (Array.isArray(guidlines)) {
                          guidlines
                            .filter((g: any) => !!g)
                            .forEach((g: any) => {
                              const id = String(g.guideline_id || g.guidelineid || g.id || "");
                              if (id) mainIds.add(id);
                            });
                        }
                        return selectedGuidelines.map((guidelineId) => {
                          // Skip if this guideline is already in the main guidlines badges
                          if (mainIds.has(String(guidelineId))) {
                            return null;
                          }
                          const guideline = guidelines.find(g => {
                            const id = String(g.guideline_id || g.guidelineid || g.id || "");
                            return id === guidelineId;
                          });
                          if (!guideline) return null;
                          const name =
                            guideline.guidelinename ||
                            guideline.guideline_name ||
                            guideline.name ||
                            guidelineId;
                          const dropdownGuidelineId = getFillInBlankDropdownGuidelineId();
                          const isLocked =
                            String(guidelineId) === String(scenarioGuidelineId) ||
                            String(guidelineId) === String(multiPassageGuidelineId) ||
                            String(guidelineId) === String(tableAnalysisGuidelineId) ||
                            String(guidelineId) === String(dropdownGuidelineId);
                          return (
                            <div
                              key={guidelineId}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                            >
                              {name}
                              {!isLocked && (
                                <button
                                  type="button"
                                  className="ml-1 inline-flex items-center justify-center rounded-full hover:bg-green-200 text-green-700"
                                  onClick={() => {
                                    setSelectedGuidelines(prev => {
                                      const next = prev.filter(id => id !== guidelineId);
                                      try {
                                        sessionStorage.setItem("selectedGuidelines", JSON.stringify(next));
                                      } catch { }
                                      return next;
                                    });
                                    if (String(selectedGuideline) === String(guidelineId)) {
                                      setSelectedGuideline("0");
                                      setGuidelineDropdownValue("0");
                                      try {
                                        sessionStorage.setItem("selectedGuideline", "0");
                                        sessionStorage.removeItem("selectedGuidelineIds");
                                      } catch { }
                                    }
                                  }}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                              {isLocked && (
                                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-green-200 text-green-700 px-1.5 py-0.5 text-[10px]">Locked</span>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  {/* Additional Instructions - Full Width */}
                  <div className="mt-6">
                    {/* Generate Images for Questions (1 = show, 0 = hide via API imagegenerate) */}
                    {showGenerateImages === 1 && isGenerateImagesEnabled && (
                      <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-blue-900">Generate Images for Questions</p>
                            <p className="text-xs text-blue-700 mt-1">
                              Enable this to generate relevant diagrams or visual hints after question generation.
                            </p>
                          </div>
                          <Switch
                            checked={includeQuestionImages}
                            onCheckedChange={(checked) => setIncludeQuestionImages(Boolean(checked))}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                      <label className="text-sm font-medium text-gray-700">Additional Instructions</label>
                    </div>
                    <Textarea
                      placeholder="Provide specific instructions for AI question generation..."
                      className="min-h-[100px] bg-white border-gray-200"
                      value={additionalInstructions}
                      onChange={e => {
                        setAdditionalInstructions(e.target.value);
                        try {
                          sessionStorage.setItem('additionalInstructions', e.target.value);
                        } catch (err) {
                          console.warn('Unable to persist ratingFeedback in sessionStorage', err);
                        }
                      }}
                    />
                  </div>

                  {/* Generate Button */}
                  <div className="flex justify-center mt-8">
                    <Button
                      onClick={handleGenerateQuestions}
                      disabled={remainingTokens <= 0}
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
        {!isSSO && (
          <div className="mt-12 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white text-xs">⚡</span>
              </div>
              <span>Powered by advanced AI technology</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIGQuestionGenerator
