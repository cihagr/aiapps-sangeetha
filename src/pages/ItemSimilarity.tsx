import { useState, useEffect } from "react";
import { ArrowLeft, Upload, Download, FileText, Scan, Trash2, Clock, BarChart3, Target, AlertTriangle, Eye, Search, Filter, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// removed Select imports (no longer used)
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { ITEM_SIMILARITY_API_URL, ITEM_SIMILARITY_TEMPLATE_URL } from "@/config";

interface SimilarItem {
  id: string;
  question: string;
  similarity: number;
  type: string;
  status: 'similar' | 'enemy';
  selection?: string;
}

interface QuestionItem {
  id: string;
  sequenceNumber: number;
  question: string;
  type: string;
  options?: string[];
  correctAnswer?: string;
}

interface QuestionSet {
  id: string;
  name: string;
  itemCount?: number;
}

const ItemSimilarity = () => {
  const { toast } = useToast();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [similarItems, setSimilarItems] = useState<SimilarItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedQuestionSet, setSelectedQuestionSet] = useState<string>("");
  const [scoreThreshold, setScoreThreshold] = useState<number>(1);
  const [hoveredThreshold, setHoveredThreshold] = useState<number | null>(null);
  const [questionItems, setQuestionItems] = useState<QuestionItem[]>([]);
  const [enemyItems, setEnemyItems] = useState<SimilarItem[]>([]);
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([]);
  const [isLoadingSets, setIsLoadingSets] = useState<boolean>(false);
  const [setsError, setSetsError] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState<boolean>(false);
  const [similarDetails, setSimilarDetails] = useState<Record<string, { original: string; items: { datasetid: number; ischecked?: number; question: string; score: number; sl_no: number; }[] }>>({});
  const [insertingForId, setInsertingForId] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState<boolean>(false);
  const [isLoadingEnemy, setIsLoadingEnemy] = useState<boolean>(false);
  const [enemyDetails, setEnemyDetails] = useState<Record<string, (SimilarItem & { selection?: string })[]>>({});
  const [loadingEnemyFor, setLoadingEnemyFor] = useState<string | null>(null);
  const [isExportingEnemy, setIsExportingEnemy] = useState<boolean>(false);
  const [isLoadingAllEnemy, setIsLoadingAllEnemy] = useState<boolean>(false);
  const [enemyFetchDone, setEnemyFetchDone] = useState<number>(0);
  const [enemyFetchTotal, setEnemyFetchTotal] = useState<number>(0);
  const [insertingSingle, setInsertingSingle] = useState<string | null>(null);
  const [showProcessed, setShowProcessed] = useState<boolean>(false);
  // Control active tab to prevent switching during loads
  const [activeTab, setActiveTab] = useState<'item-bank' | 'similar-items' | 'enemy-items'>(
    'item-bank'
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  // Removed mock questions provider; UI now relies only on real questionItems fetched from API

  // Small utility to enforce a timeout on fetch calls (helps avoid hanging requests)
  const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit, timeoutMs: number = 20000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...(init || {}), signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  };

  // Export Enemy Items (per-question) to Excel using cached enemyDetails
  const exportEnemyExcel = async () => {
    try {
      // Build list of questions to include
      if (!selectedQuestionSet) {
        toast({ title: 'Select a question set', description: 'Choose a dataset before exporting.', variant: 'destructive' });
        return;
      }

      const questions = questionItems;
      // Only include questions that have cached enemy results
      const questionsWithEnemies = questions.filter(q => Array.isArray(enemyDetails[String(Number(q.id))]) && (enemyDetails[String(Number(q.id))]!.length > 0));
      if (!questionsWithEnemies.length) {
        toast({ title: 'No enemy data to export', description: 'Open a question and load its enemy items first.', variant: 'destructive' });
        return;
      }

      setIsExportingEnemy(true);

      const XLSX: any = await import('xlsx');

      const headers = [
        'Question sequence number',
        'Item Stem',
        'Enemy Id',
        'Enemy Stem',
        'Type',
        'Selection',
      ];

      const combinedData: { [key: string]: any }[] = [];
      questionsWithEnemies.forEach((q) => {
        const qid = String(Number(q.id));
        const enemies = enemyDetails[qid] || [];
        // Parent row (question)
        combinedData.push({
          'Question sequence number': q.sequenceNumber,
          'Item Stem': q.question,
          'Enemy Id': '',
          'Enemy Stem': '',
          'Type': '',
          'Selection': '',
        });
        // Children rows (enemies)
        enemies.forEach((e) => {
          //console.log("FOR EACH", e)
          combinedData.push({
            'Question sequence number': '',
            'Item Stem': '',
            'Enemy Id': e.id,
            'Enemy Stem': e.question,
            'Type': e.type,
            'Selection': e.selection || '',
          });
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(combinedData, { header: headers });
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

      // Style and borders
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!worksheet[cellAddress]) worksheet[cellAddress] = { v: '' };
          if (!worksheet[cellAddress].s) worksheet[cellAddress].s = {};
          worksheet[cellAddress].s.alignment = { horizontal: 'left', vertical: 'top', wrapText: false };
          worksheet[cellAddress].s.border = {
            top: { style: 'thin', color: { rgb: 'CCCCCC' } },
            bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
            left: { style: 'thin', color: { rgb: 'CCCCCC' } },
            right: { style: 'thin', color: { rgb: 'CCCCCC' } },
          } as any;
        }
      }

      // Auto column widths based on pixel width
      const maxWidths = headers.map(header => {
        let maxPixelWidth = getPixelWidth(header);
        combinedData.forEach(row => {
          const text = (row[header] ?? '').toString();
          const pixelWidth = getPixelWidth(text);
          if (pixelWidth > maxPixelWidth) maxPixelWidth = pixelWidth;
        });
        return { wch: pxToExcelWidth(maxPixelWidth) } as any;
      });
      (worksheet as any)['!cols'] = maxWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Enemy Items');

      const now = new Date();
      const dateTimeForFile = now.toISOString().replace(/:/g, '-');
      const email = sessionStorage.getItem('email') || 'adminshiva';
      const dataset = selectedQuestionSet || sessionStorage.getItem('datasetid') || 'dataset';
      const fileName = `EnemyItems_${email}_Question Set_${dataset}_${dateTimeForFile}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast({ title: 'Exported', description: 'Enemy items Excel downloading.' });
    } catch (e: any) {
      toast({ title: 'Export failed', description: 'Please ensure the xlsx package is installed: npm i xlsx', variant: 'destructive' });
    } finally {
      setIsExportingEnemy(false);
    }
  };

  // Insert a single similar item as enemy for a given question
  const handleInsertSingle = async (questionId: string, sim: { datasetid: number; sl_no: number; question: string; score: number }) => {
    let insertToken = sessionStorage.getItem('insertToken') || sessionStorage.getItem('token') || '';
    if (!insertToken) {
      const generated = await generateInsertToken();
      if (!generated) {
        toast({ title: 'Authorization missing', description: 'Insert token not available.', variant: 'destructive' });
        return;
      }
      insertToken = generated;
    }

    const email = sessionStorage.getItem('email') || 'adminshiva';
    const details = similarDetails[questionId];
    const originalStem = (details?.original || '').replace(/\(Type:.*\)/, '').trim();
    const key = `${questionId}:${sim.sl_no}`;
    setInsertingSingle(key);
    try {
      const payload = {
        emailid: email,
        datasetid: sim.datasetid,
        question_id: Number(questionId),
        question_stem: originalStem,
        enemyquestion_id: Number(sim.sl_no),
        enemyquestion_stem: sim.question,
        score: Number(sim.score),
        ischecked: 1,
        status: "",
      };

      const res = await fetch(`${ITEM_SIMILARITY_API_URL}/insertEnemyData`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${insertToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Insert failed');
      }

      // Optional: mark the source question row as enemy in Similar table
      setSimilarItems(prev => prev.map(si => si.id === questionId ? { ...si, status: 'enemy' } : si));
      // Mark this specific similar item as checked so its button becomes disabled/Similar
      setSimilarDetails(prev => {
        const curr = prev[questionId];
        if (!curr) return prev;
        return {
          ...prev,
          [questionId]: {
            ...curr,
            items: curr.items.map(it => it.sl_no === sim.sl_no ? { ...it, ischecked: 1 } : it)
          }
        };
      });
      toast({ title: 'Marked as Enemy', description: `Item ${sim.sl_no} was inserted as enemy.` });
    } catch (e: any) {
      toast({ title: 'Failed to mark enemy', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setInsertingSingle(null);
    }
  };

  // Load questions for the selected dataset (used in Enemy tab)
  const loadQuestionsForSelectedSet = async () => {
    try {
      if (!selectedQuestionSet) throw new Error('Please select a question set first.');
      const cacheBuster = Date.now();
      const userId = sessionStorage.getItem('userId') || '278398ba-fc29-41fb-a13b-84623820b388';
      const pageNo = 1;
      const pageSize = 20; // keep payloads small to avoid timeouts
      const email = sessionStorage.getItem('email') || 'adminshiva';
      const datasetid = Number(selectedQuestionSet);
      const url = `${ITEM_SIMILARITY_API_URL}/GetQuestionData?UserId=${encodeURIComponent(userId)}&PageNo=${pageNo}&PageSize=${pageSize}&Email=${encodeURIComponent(email)}&datasetid=${datasetid}&cacheBuster=${cacheBuster}`;
      const res = await fetchWithTimeout(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } }, 20000);
      if (!res.ok) throw new Error(`GetQuestionData failed (${res.status})`);
      const data = await res.json();
      const rows: any[] = Array.isArray(data?.excel_data) ? data.excel_data : [];

      const mapped: QuestionItem[] = rows.map((row, idx) => {
        const qText = row?.question ?? row?.Question ?? row?.['Question'] ?? row?.['question text'] ?? row?.['Question Text'] ?? row?.['Question Statement'] ?? row?.question_statement ?? '';
        const qType = row?.type ?? row?.Type ?? 'MCQ';
        const idVal = row?.sl_no ?? row?.SL_No ?? row?.['SL.No'] ?? row?.SlNo ?? (idx + 1);
        return {
          id: String(idVal),
          sequenceNumber: Number(idVal) || idx + 1,
          question: qText || '(No question text)',
          type: String(qType),
        } as QuestionItem;
      });
      setQuestionItems(mapped);
      // Automatically fetch enemy items for all questions in this dataset
      fetchAllEnemyForQuestions(mapped);
    } catch (e: any) {
      toast({ title: 'Failed to load questions', description: e?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  // Bulk: fetch enemy items for all given questions with limited concurrency
  const fetchAllEnemyForQuestions = async (questions: QuestionItem[]) => {
    try {
      if (!selectedQuestionSet) return;
      const token = await getAuthToken();
      if (!token) throw new Error('Authorization token not available');
      const emailid = sessionStorage.getItem('email') || 'adminshiva';
      const datasetid = Number(selectedQuestionSet);

      // Normalize ids (server uses numeric sl_no)
      const ids = questions
        .map(q => Number(q.id))
        .filter(n => Number.isFinite(n));

      setIsLoadingAllEnemy(true);
      setEnemyFetchDone(0);
      setEnemyFetchTotal(ids.length);

      const concurrency = 5;
      let index = 0;

      const worker = async () => {
        while (index < ids.length) {
          const qid = ids[index++];
          try {
            const url = `${ITEM_SIMILARITY_API_URL}/get_enemy_questions?emailid=${encodeURIComponent(emailid)}&datasetid=${encodeURIComponent(String(datasetid))}&questionid=${encodeURIComponent(String(qid))}`;
            let res = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Authorization': `Bearer ${token}` } });
            if (res.status === 401) {
              // Try to refresh token once and retry
              const newTok = await generateInsertToken();
              if (!newTok) throw new Error('Unauthorized (token generation failed)');
              res = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Authorization': `Bearer ${newTok}` } });
            }
            if (!res.ok) {
              const txt = await res.text().catch(() => '');
              // Some servers return 400 with JWT parse error text (e.g., 'Not enough segments')
              if (txt && /not enough segments/i.test(txt)) {
                const newTok2 = await generateInsertToken();
                if (!newTok2) throw new Error(`get_enemy_questions failed (${res.status}) - ${txt}`);
                res = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Authorization': `Bearer ${newTok2}` } });
              }
              if (!res.ok) {
                const txt2 = await res.text().catch(() => '');
                throw new Error(`get_enemy_questions failed (${res.status}) ${txt2 ? '- ' + txt2 : ''}`);
              }
            }
            const data = await res.json();
            const list: any[] = Array.isArray(data?.question_data) ? data.question_data : [];
            const mapped: SimilarItem[] = list.map((row: any, idx: number) => ({
              id: String(row?.sl_no ?? idx + 1),
              question: String(row?.question ?? ''),
              similarity: 0,
              type: String(row?.type ?? 'MCQ'),
              status: 'enemy',
              selection: String(row?.selection ?? 'System Generated'),
            }));
            setEnemyDetails(prev => ({ ...prev, [String(qid)]: mapped }));
          } catch (err) {
            // Cache empty list to denote no enemies/failure for this id
            setEnemyDetails(prev => ({ ...prev, [String(qid)]: [] }));
          } finally {
            setEnemyFetchDone(prev => prev + 1);
          }
        }
      };

      // Launch workers
      const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker());
      await Promise.all(workers);
    } catch (e: any) {
      toast({ title: 'Failed to fetch all enemy items', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoadingAllEnemy(false);
    }
  };


  // Reuse auth token for authorized API calls (fallback to generate if missing)
  const getAuthToken = async (): Promise<string | null> => {
    let token = sessionStorage.getItem('insertToken') || sessionStorage.getItem('token') || null;
    if (!token) {
      token = await generateInsertToken();
    }
    return token;
  };

  // Trigger backend to calculate/find enemy items for the selected dataset
  const handleFindEnemyItems = async () => {
    try {
      if (!selectedQuestionSet) {
        throw new Error('Please select a question set first.');
      }
      setIsLoadingEnemy(true);
      const token = await getAuthToken();
      if (!token) throw new Error('Authorization token not available');
      const email = sessionStorage.getItem('email') || 'adminshiva';
      const datasetid = String(selectedQuestionSet);
      const payload = { email, datasetid } as const;
      const res = await fetch(`${ITEM_SIMILARITY_API_URL}/find_enemy_items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`find_enemy_items failed (${res.status})`);
      // Parse body; may contain revealing_pairs we can use immediately
      const processBody = await res.json().catch(() => null as any);
      if (processBody && Array.isArray(processBody.revealing_pairs)) {
        const pairs: Array<{ question_id: number; revealing_question_id: number; question?: string; revealing_question?: string; }> = processBody.revealing_pairs;
        // Group by question_id
        const grouped: Record<string, SimilarItem[]> = {};
        for (const p of pairs) {
          const qkey = String(p.question_id);
          const item: SimilarItem = {
            id: String(p.revealing_question_id),
            question: String(p.revealing_question || ''),
            similarity: 0,
            type: 'MCQ',
            status: 'enemy',
            selection: 'System Generated',
          };
          if (!grouped[qkey]) grouped[qkey] = [];
          grouped[qkey].push(item);
        }
        // Prime cache/UI; later per-question fetches can overwrite with richer data
        Object.entries(grouped).forEach(([qid, items]) => {
          setEnemyDetails(prev => ({ ...prev, [qid]: items }));
        });
        // Also flatten to enemyItems for list-style UIs if used elsewhere
        const flat = Object.values(grouped).flat();
        if (flat.length) setEnemyItems(flat);
      }
      // After backend processes, fetch enemy items for all questions in the dataset
      // 1) Load questions to determine a set of ids
      const userId = sessionStorage.getItem('userId') || '278398ba-fc29-41fb-a13b-84623820b388';
      const pageNo = 1;
      const pageSize = 1000; // try to load many to get all ids
      const cacheBuster = Date.now();
      const getQUrl = `${ITEM_SIMILARITY_API_URL}/GetQuestionData?UserId=${encodeURIComponent(userId)}&PageNo=${pageNo}&PageSize=${pageSize}&Email=${encodeURIComponent(email)}&datasetid=${encodeURIComponent(datasetid)}&cacheBuster=${cacheBuster}`;
      const qRes = await fetch(getQUrl, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
      if (!qRes.ok) throw new Error(`GetQuestionData failed (${qRes.status})`);
      const qData = await qRes.json();
      const rows: any[] = Array.isArray(qData?.excel_data) ? qData.excel_data : [];
      // Prefer 'sl_no' if present; else fallback to 1..N
      const ids: number[] = rows.map((r, idx) => Number(r?.sl_no ?? (idx + 1))).filter(n => Number.isFinite(n));
      const uniqueIds = Array.from(new Set(ids));

      const aggregated: SimilarItem[] = [];
      for (const qid of uniqueIds) {
        const url = `${ITEM_SIMILARITY_API_URL}/get_enemy_questions?emailid=${encodeURIComponent(email)}&datasetid=${encodeURIComponent(datasetid)}&questionid=${encodeURIComponent(String(qid))}`;
        let er = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' } });
        if (er.status === 401) {
          const newTok = await generateInsertToken();
          if (!newTok) {
            console.warn('Token refresh failed while aggregating enemy items');
            continue;
          }
          er = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${newTok}`, 'Cache-Control': 'no-cache' } });
        }
        if (!er.ok) {
          const txt = await er.text().catch(() => '');
          if (txt && /not enough segments/i.test(txt)) {
            const newTok2 = await generateInsertToken();
            if (newTok2) {
              er = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${newTok2}`, 'Cache-Control': 'no-cache' } });
            }
          }
          if (!er.ok) {
            const txt2 = await er.text().catch(() => '');
            console.warn(`get_enemy_questions failed for ${qid}: ${er.status} ${txt2 || txt}`);
            continue; // skip failures but continue others
          }
        }
        const ed = await er.json();
        const list: any[] = Array.isArray(ed?.question_data) ? ed.question_data : [];
        const mapped: SimilarItem[] = list.map((row: any, idx: number) => ({
          id: String(row?.sl_no ?? `${qid}-${idx + 1}`),
          question: String(row?.question ?? ''),
          similarity: 0,
          type: String(row?.type ?? 'MCQ'),
          status: 'enemy',
          selection: String(row?.selection ?? 'System Generated'),
        }));
        aggregated.push(...mapped);
        // Also store per-question details for export and preview
        setEnemyDetails(prev => ({ ...prev, [String(qid)]: mapped }));
      }

      setEnemyItems(aggregated);
      toast({ title: 'Enemy items fetched', description: `Loaded enemy items for ${uniqueIds.length} questions.` });
    } catch (err: any) {
      toast({ title: 'Failed to find enemy items', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoadingEnemy(false);
    }
  };

  // Fetch Enemy Items for a given question in the selected dataset
  const fetchEnemyQuestions = async (questionId?: number) => {
    try {
      if (!selectedQuestionSet) {
        throw new Error('Please select a question set first.');
      }
      if (questionId == null) {
        throw new Error('Question id is required.');
      }
      setLoadingEnemyFor(String(questionId));
      const token = await getAuthToken();
      if (!token) throw new Error('Authorization token not available');
      const emailid = sessionStorage.getItem('email') || 'adminshiva';
      const datasetid = Number(selectedQuestionSet);
      const qid = Number(questionId);
      const url = `${ITEM_SIMILARITY_API_URL}/get_enemy_questions?emailid=${encodeURIComponent(emailid)}&datasetid=${encodeURIComponent(String(datasetid))}&questionid=${encodeURIComponent(String(qid))}`;

      let res = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Authorization': `Bearer ${token}` } });
      if (res.status === 401) {
        const newTok = await generateInsertToken();
        if (!newTok) throw new Error('Unauthorized (token generation failed)');
        res = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Authorization': `Bearer ${newTok}` } });
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        if (txt && /not enough segments/i.test(txt)) {
          const newTok2 = await generateInsertToken();
          if (!newTok2) throw new Error(`get_enemy_questions failed (${res.status}) - ${txt}`);
          res = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Authorization': `Bearer ${newTok2}` } });
        }
        if (!res.ok) {
          const txt2 = await res.text().catch(() => '');
          throw new Error(`get_enemy_questions failed (${res.status}) ${txt2 ? '- ' + txt2 : ''}`);
        }
      }
      const data = await res.json();
      const list: any[] = Array.isArray(data?.question_data) ? data.question_data : [];

      const mapped: SimilarItem[] = list.map((row: any, idx: number) => ({
        id: String(row?.sl_no ?? idx + 1),
        question: String(row?.question ?? ''),
        similarity: 0, // API does not provide score in sample
        type: String(row?.type ?? 'MCQ'),
        status: 'enemy',
        selection: String(row?.selection ?? 'System Generated'),
      }));
      // Cache per-question results for dialog display
      setEnemyDetails((prev) => ({ ...prev, [String(qid)]: mapped }));
    } catch (err: any) {
      // Cache empty list on failure so UI can show 'No enemy questions'
      if (questionId != null) {
        setEnemyDetails((prev) => ({ ...prev, [String(questionId)]: [] }));
      }
      toast({ title: 'Failed to fetch enemy questions', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoadingEnemyFor(null);
    }
  };

  // Generate token using provided credentials (from sessionStorage or defaults)
  const generateInsertToken = async (): Promise<string | null> => {
    try {
      setIsGeneratingToken(true);
      const emailid = sessionStorage.getItem('email') || 'adminshiva';
      const password = sessionStorage.getItem('password') || 'School';
      const res = await fetch(`${ITEM_SIMILARITY_API_URL}/token_generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailid, password }),
      });
      if (!res.ok) throw new Error(`token_generate failed (${res.status})`);
      const data = await res.json();
      const token = data?.token as string | undefined;
      if (!token) throw new Error('Token not found in response');
      sessionStorage.setItem('insertToken', token);
      return token;
    } catch (e: any) {
      toast({ title: 'Failed to generate token', description: e?.message || 'Please verify credentials.', variant: 'destructive' });
      return null;
    } finally {
      setIsGeneratingToken(false);
    }
  };

  // Insert selected similar items as enemy items for a given question
  const handleInsertData = async (questionId: string) => {
    let insertToken = sessionStorage.getItem('insertToken') || sessionStorage.getItem('token') || '';
    if (!insertToken) {
      // Try to generate a token automatically
      const generated = await generateInsertToken();
      if (!generated) {
        toast({ title: 'Authorization missing', description: 'Insert token not available.', variant: 'destructive' });
        return;
      }
      insertToken = generated;
    }

    const email = sessionStorage.getItem('email') || 'adminshiva';
    const details = similarDetails[questionId];
    if (!details) {
      toast({ title: 'No similar data', description: 'Please load similar items first.', variant: 'destructive' });
      return;
    }

    // If you plan to support checkbox selection, replace this with the checked subset
    const items = details.items || [];
    if (!items.length) {
      toast({ title: 'Nothing to insert', description: 'No similar items found to insert.', variant: 'destructive' });
      return;
    }

    setInsertingForId(questionId);
    try {
      for (const item of items) {
        const payload = {
          emailid: email,
          datasetid: item.datasetid,
          question_id: Number(questionId),
          question_stem: (details.original || '').replace(/\(Type:.*\)/, '').trim(),
          enemyquestion_id: Number(item.sl_no),
          enemyquestion_stem: item.question,
          score: Number(item.score),
          ischecked: 1,
          status: "",
        };

        const res = await fetch(`${ITEM_SIMILARITY_API_URL}/insertEnemyData`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${insertToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          // Continue trying other items but notify failure
          console.error('Insert failed', await res.text());
        }
      }

      // Update local UI: mark the source question as enemy to reflect successful insert
      setSimilarItems(prev => prev.map(si => si.id === questionId ? { ...si, status: 'enemy' } : si));
      toast({ title: 'Enemy items added', description: 'Selected similar items were inserted as enemy items.' });

      // Dispatch event similar to the provided snippet
      const requestObj = {
        userId: '278398ba-fc29-41fb-a13b-84623820b388',
        value: Number(sessionStorage.getItem('scoreValue')) || 1,
        filterOption: 'stem',
        pageNumber: 1,
        pageSize: 20,
      };
      window.dispatchEvent(new CustomEvent('triggerSimilarQuestion', { detail: requestObj }));
    } catch (e: any) {
      toast({ title: 'Failed to add enemy items', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setInsertingForId(null);
    }
  };

  // Note: No local status toggling; only server-side insert on Mark Enemy

  // Fetch Similar Items for current dataset and threshold
  const fetchSimilarItems = async () => {
    try {
      if (!selectedQuestionSet) {
        throw new Error('Please select a question set first.');
      }
      setIsLoadingSimilar(true);
      const userId = sessionStorage.getItem('userId') || '278398ba-fc29-41fb-a13b-84623820b388';
      const email = sessionStorage.getItem('email') || 'adminshiva';
      const datasetid = Number(selectedQuestionSet);
      const pageNo = 1;
      const pageSize = 20;
      const filterBy = 'stem';
      // UI threshold is 1..10 and maps directly to API Score (1..10)
      const score = Math.max(1, Math.min(10, Math.round(scoreThreshold)));
      const nocache = Date.now();
      const url = `${ITEM_SIMILARITY_API_URL}/CheckSimilarQuestion?UserId=${encodeURIComponent(userId)}&Score=${encodeURIComponent(String(score))}&FilterBy=${encodeURIComponent(filterBy)}&PageNo=${pageNo}&PageSize=${pageSize}&email=${encodeURIComponent(email)}&datasetid=${datasetid}&nocache=${nocache}`;

      const res = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
      if (!res.ok) throw new Error(`CheckSimilarQuestion failed (${res.status})`);
      const data = await res.json();
      const list: any[] = Array.isArray(data?.similar_question) ? data.similar_question : [];
      // Filter out rows with no similar_data
      const filtered: any[] = list.filter((q: any) => Array.isArray(q?.similar_data) && q.similar_data.length > 0);

      // Map into flat table plus detail map (only for filtered rows)
      const mapped: SimilarItem[] = filtered.map((q: any, idx: number) => {
        const originalQ: string = String(q?.question ?? '');
        const items: any[] = Array.isArray(q?.similar_data) ? q.similar_data : [];
        const topScore = items.length ? Math.max(...items.map(it => parseFloat(it?.score ?? '0') || 0)) : 0;
        const id = String(q?.sl_no ?? idx + 1);
        // Try to extract type from original string: "(Type: XYZ)"
        const typeMatch = originalQ.match(/\(Type:\s*([^\)]+)\)/i);
        const type = typeMatch ? typeMatch[1] : 'MCQ';
        return {
          id,
          question: originalQ.replace(/\s*\(Type:[^\)]*\)\s*$/i, '').trim() || originalQ,
          similarity: Number(topScore),
          type,
          status: 'similar',
        } as SimilarItem;
      });

      const detailsMap: Record<string, { original: string; items: { datasetid: number; ischecked?: number; question: string; score: number; sl_no: number; }[] }> = {};
      filtered.forEach((q: any, idx: number) => {
        const id = String(q?.sl_no ?? idx + 1);
        const items = (Array.isArray(q?.similar_data) ? q.similar_data : []).map((it: any) => ({
          datasetid: Number(it?.datasetid ?? datasetid),
          ischecked: it?.ischecked,
          question: String(it?.question ?? ''),
          score: parseFloat(it?.score ?? '0') || 0,
          sl_no: Number(it?.sl_no ?? 0),
        }));
        detailsMap[id] = { original: String(q?.question ?? ''), items };
      });

      setSimilarItems(mapped);
      setSimilarDetails(detailsMap);
      try { sessionStorage.setItem('scoreValue', String(score)); } catch { }
      toast({ title: 'Similar items loaded', description: `Found ${mapped.length} questions with similar items.` });
    } catch (err: any) {
      toast({ title: 'Failed to fetch similar items', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoadingSimilar(false);
    }
  };

  // Reusable: Fetch question sets from API
  const refreshDatasets = async (preselectLast: boolean = false): Promise<string | null> => {
    try {
      setIsLoadingSets(true);
      setSetsError("");
      const email = sessionStorage.getItem('email') || 'adminshiva';
      const res = await fetch(`${ITEM_SIMILARITY_API_URL}/return_datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        throw new Error(`Failed to load datasets (${res.status})`);
      }

      const data: { dataset: number[]; } = await res.json();

      if (!Array.isArray(data.dataset)) {
        throw new Error("Unexpected response format");
      }

      const mapped: QuestionSet[] = data.dataset.map((id, idx) => {
        const rawName = "Dataset " + data.dataset[idx];
        // Convert 'Dataset - N' (any spacing/case) to 'Question Set N'
        const normalized = typeof rawName === "string"
          ? rawName.replace(/^dataset\s*-\s*/i, "Question Set ")
          : undefined;
        return {
          id: String(id),
          name: normalized ?? `Question Set ${idx + 1}`,
        };
      });

      setQuestionSets(mapped);
      let chosenId: string | null = null;
      if (mapped.length > 0) {
        if (preselectLast) {
          chosenId = mapped[mapped.length - 1].id;
          setSelectedQuestionSet(chosenId);
        } else if (!selectedQuestionSet) {
          chosenId = mapped[mapped.length - 1].id;
          setSelectedQuestionSet(chosenId);
        } else {
          chosenId = selectedQuestionSet;
        }
      }
      return chosenId;
    } catch (err: any) {
      const message = err?.message ?? "Failed to load datasets";
      setSetsError(message);
      toast({
        title: "Failed to load question sets",
        description: message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoadingSets(false);
    }
  };

  useEffect(() => {
    refreshDatasets(false);
  }, [toast]);

  // Derived: limit Questions list (Enemy tab) to only those with enemy items
  const questionsWithEnemies = questionItems.filter(q => Array.isArray(enemyDetails[String(Number(q.id))]) && (enemyDetails[String(Number(q.id))]!.length > 0));

  // Derived helper to get enemy count for a question id
  const getEnemyCount = (qid: string | number) => {
    const list = enemyDetails[String(Number(qid))]
    return Array.isArray(list) ? list.length : 0
  }

  const stats = [
    {
      icon: <Target className="w-5 h-5" />,
      title: "Similar Items Found",
      total: "23",
      subtitle: "Total Matches",
      bgColor: "bg-gradient-to-br from-blue-50 to-blue-100",
      iconBg: "bg-blue-600",
      textColor: "text-blue-600",
      borderColor: "border-blue-200"
    },
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      title: "Enemy Items",
      total: "5",
      subtitle: "Marked as Enemy",
      bgColor: "bg-gradient-to-br from-red-50 to-red-100",
      iconBg: "bg-red-600",
      textColor: "text-red-600",
      borderColor: "border-red-200"
    },
    {
      icon: <BarChart3 className="w-5 h-5" />,
      title: "Avg Similarity",
      total: "84.2%",
      subtitle: "Match Quality",
      bgColor: "bg-gradient-to-br from-green-50 to-green-100",
      iconBg: "bg-green-600",
      textColor: "text-green-600",
      borderColor: "border-green-200"
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
    return true;
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setSimilarItems([]);
    // Clear displayed questions so UI hides them when file is removed
    setQuestionItems([]);
    setShowProcessed(false);
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    toast({
      title: "File Removed",
      description: "File has been removed successfully",
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as base64'));
        }
      };
      reader.onerror = (e) => reject(e);
    });
  };

  // Robust check: scan all sheets for any meaningful data or a column that looks like a question
  const workbookHasQuestions = async (file: File): Promise<boolean> => {
    try {
      const XLSX: any = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetNames: string[] = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
      for (const name of sheetNames) {
        const ws = workbook.Sheets[name];
        if (!ws) continue;
        // Quick range-based check
        const ref: string | undefined = (ws as any)['!ref'];
        if (ref) {
          try {
            const range = XLSX.utils.decode_range(ref);
            const cellCount = Math.max(0, (range.e.r - range.s.r + 1)) * Math.max(0, (range.e.c - range.s.c + 1));
            if (cellCount > 1) {
              // Also check actual populated cells
              const keys = Object.keys(ws).filter(k => !k.startsWith('!'));
              const hasFilledCell = keys.some(k => {
                const cell = (ws as any)[k];
                const v = cell?.v;
                return v != null && String(v).trim().length > 0;
              });
              if (hasFilledCell) return true;
            }
          } catch { }
        }
        // Fast path: array-of-arrays to avoid header assumptions
        const rowsAoA: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
        // Any non-empty cell?
        const hasAnyCell = rowsAoA.some((row: any[]) =>
          Array.isArray(row) && row.some((v) => {
            if (v == null) return false;
            const s = String(v).trim();
            return s.length > 0;
          })
        );
        if (!hasAnyCell) continue;

        // Try to infer if there is a column header that looks like 'question'
        const headerRow: any[] = (rowsAoA.find((row: any[]) => Array.isArray(row) && row.some((v) => String(v || '').trim().length > 0)) || []) as any[];
        const hasQuestionHeader = headerRow.some((h) => /question|question\s*text|item\s*stem|stem/i.test(String(h || '')));
        if (hasQuestionHeader) return true;

        // Fallback: object mapping (in case header row exists later) and check values
        const rowsObj: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
        const hasMeaningfulRow = rowsObj.some((row) =>
          Object.values(row || {}).some((v) => {
            if (v == null) return false;
            const s = String(v).trim();
            return s.length > 0;
          })
        );
        if (hasMeaningfulRow) return true;
      }
      return false;
    } catch {
      // Be tolerant: if we cannot parse, assume valid so upload can proceed
      return true;
    }
  };

  // Heuristic: determine if a question text is meaningful (not junk)
  const isMeaningfulQuestion = (text: any) => {
    if (text == null) return false;
    const s = String(text).trim();
    if (s.length < 8) return false; // too short to be a valid question
    // Must contain at least one letter
    if (!/[A-Za-z]/.test(s)) return false;
    // Strip punctuation and whitespace, ensure remaining has enough chars
    const cleaned = s.replace(/[^A-Za-z0-9 ]+/g, '').trim();
    if (cleaned.length < 8) return false;
    return true;
  };

  // Try to extract a question string from a row object using common keys
  const extractQuestionFromRow = (row: Record<string, any>) => {
    if (!row || typeof row !== 'object') return '';
    const keys = Object.keys(row || {});
    // Prefer explicit keys
    const prefer = keys.find(k => /question|question\s*text|item\s*stem|stem/i.test(k));
    if (prefer && row[prefer]) return String(row[prefer]).trim();
    // Fallback: pick the longest string value in the row
    let longest = '';
    for (const k of keys) {
      const v = row[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s.length > longest.length) longest = s;
    }
    return longest;
  };

  // Create a filtered workbook/file that contains only rows with meaningful questions.
  // Returns a new File if filtering removed junk rows, or the original File if unchanged.
  const filterWorkbookKeepMeaningful = async (file: File): Promise<File | null> => {
    try {
      const XLSX: any = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetNames: string[] = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
      const outWorkbook = XLSX.utils.book_new();
      let totalKept = 0;
      for (const name of sheetNames) {
        const ws = workbook.Sheets[name];
        if (!ws) continue;
        const rowsObj: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
        if (!Array.isArray(rowsObj) || rowsObj.length === 0) continue;
        const filtered = rowsObj.filter((row) => {
          const q = extractQuestionFromRow(row);
          return isMeaningfulQuestion(q);
        });
        if (filtered.length === 0) continue;
        totalKept += filtered.length;
        const newWs = XLSX.utils.json_to_sheet(filtered);
        XLSX.utils.book_append_sheet(outWorkbook, newWs, name);
      }
      if (totalKept === 0) {
        return null; // no usable questions
      }
      // Write workbook to array and create a File
      const outArray = XLSX.write(outWorkbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([outArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const newFile = new File([blob], file.name.replace(/\.xlsx?$|$/, '.filtered.xlsx'), { type: blob.type });
      return newFile;
    } catch (e) {
      // If anything fails, fall back to original file
      console.warn('Filtering workbook failed, proceeding with original file', e);
      return file;
    }
  };

  const processFile = async (file: File) => {
    if (!validateFile(file)) return;
    // Guard: prevent empty uploads
    if (!file.size || file.size === 0) {
      toast({ title: 'Empty file', description: 'The selected file is empty. Please upload a file with questions.', variant: 'destructive' });
      return;
    }
    try {
      setIsUploading(true);
      // Pre-validate Excel contents client-side to avoid creating an empty dataset
      const looksValid = await workbookHasQuestions(file);
      if (!looksValid) {
        toast({ title: 'No rows found', description: 'The selected file is empty. Please upload a file with questions.', variant: 'destructive' });
        setIsUploading(false);
        return;
      }

      // Validate that every row has question stem and all options filled
      const XLSX: any = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetNames: string[] = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
      for (const name of sheetNames) {
        const ws = workbook.Sheets[name];
        if (!ws) continue;
        const rowsObj: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
        for (const row of rowsObj) {
          // Check for question stem
          const qStem = row?.question ?? row?.Question ?? row?.['Question'] ?? row?.['question text'] ?? row?.['Question Text'] ?? row?.['Question Statement'] ?? row?.question_statement ?? '';
          if (!qStem || String(qStem).trim().length === 0) {
            toast({ title: 'No rows found', description: 'All cells in each question row are required. Please complete any blank fields before uploading.', variant: 'destructive' });
            setIsUploading(false);
            return;
          }
          // Check for options (Option 1..4)
          let missingOption = false;
          for (let i = 1; i <= 4; i++) {
            // Accept keys like 'Option 1', 'option1', 'Option_1', etc.
            const optKey = Object.keys(row).find(k => new RegExp(`^option[ _-]?${i}$`, 'i').test(k));
            if (!optKey || row[optKey] == null || String(row[optKey]).trim().length === 0) {
              missingOption = true;
              break;
            }
          }
          if (missingOption) {
            toast({ title: 'No rows found', description: 'All cells in each question row are required. Please complete any blank fields before uploading.', variant: 'destructive' });
            setIsUploading(false);
            return;
          }
        }
      }

      // Try to filter out junk rows (rows without meaningful question text)
      const filteredFile = await filterWorkbookKeepMeaningful(file);
      if (filteredFile === null) {
        toast({ title: 'No valid questions', description: 'Your file must include at least one question row below the header.', variant: 'destructive' });
        setIsUploading(false);
        return;
      }

      const fileToSend = filteredFile;
      // Convert file to base64 (strip metadata prefix)
      const base64DataUrl = await fileToBase64(fileToSend);
      const base64 = base64DataUrl.split(',')[1] ?? base64DataUrl;

      const formData = new FormData();
      formData.append('BinaryFileData', base64);
      // Fallback to known UUID from reference if session storage is empty
      const userId = sessionStorage.getItem('userId') || '278398ba-fc29-41fb-a13b-84623820b388';
      const email = sessionStorage.getItem('email') || 'adminshiva';
      if (!userId) {
        throw new Error('UserId is missing. Please login or set sessionStorage.userId.');
      }
      formData.append('UserId', userId);
      formData.append('Email', email);

      const res = await fetch(`${ITEM_SIMILARITY_API_URL}/SaveBinaryData`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`);
      }

      toast({
        title: 'Upload successful',
        description: 'Your questions have been uploaded and saved.',
      });

      // Only mark as uploaded after a successful upload
      setUploadedFile(file);

      // Refresh datasets and select the newly added (last) one, then fetch its questions
      const newSelectedId = await refreshDatasets(true);
      if (newSelectedId) {
        await handleAnalyzeSimilarity(newSelectedId);
      }
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error?.message || 'We could not upload your file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
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

  const handleAnalyzeSimilarity = async (datasetIdParam?: string) => {
    setIsAnalyzing(true);
    try {
      const cacheBuster = Date.now();
      // Params (datasetid derived from current selection)
      const userId = '278398ba-fc29-41fb-a13b-84623820b388';
      const pageNo = 1;
      const pageSize = 20;
      const email = sessionStorage.getItem('email') || 'adminshiva';
      const selectedId = datasetIdParam || selectedQuestionSet || questionSets[questionSets.length - 1]?.id || '';
      const datasetid = Number(selectedId);
      if (!datasetid) {
        throw new Error('No dataset selected or available. Please select a question set.');
      }
      const url = `${ITEM_SIMILARITY_API_URL}/GetQuestionData?UserId=${encodeURIComponent(userId)}&PageNo=${pageNo}&PageSize=${pageSize}&Email=${encodeURIComponent(email)}&datasetid=${datasetid}&cacheBuster=${cacheBuster}`;

      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      }, 20000);
      if (!res.ok) {
        throw new Error(`GetQuestionData failed (${res.status})`);
      }
      const data = await res.json();
      const rows: any[] = Array.isArray(data?.excel_data) ? data.excel_data : [];

      // Map API rows to QuestionItem[]
      const mapped: QuestionItem[] = rows.map((row, idx) => {
        // Try to find question text across common key variants
        const qText = row?.question ?? row?.Question ?? row?.['Question'] ?? row?.['question text'] ?? row?.['Question Text'] ?? row?.['Question Statement'] ?? row?.question_statement ?? '';
        const qType = row?.type ?? row?.Type ?? 'MCQ';
        // Collect options from keys like 'Option 1'..'Option 4' (case/space insensitive)
        const optionKeys = Object.keys(row || {}).filter(k => /^option\s*\d+/i.test(k));
        const sortedOptionKeys = optionKeys.sort((a, b) => {
          const ai = parseInt(a.replace(/\D+/g, ''), 10) || 0;
          const bi = parseInt(b.replace(/\D+/g, ''), 10) || 0;
          return ai - bi;
        });
        const options = sortedOptionKeys.map(k => String(row[k])).filter(Boolean);
        const correct = row?.correctAnswer ?? row?.CorrectAnswer ?? row?.['Correct Answer'] ?? undefined;
        return {
          id: String(idx + 1),
          sequenceNumber: idx + 1,
          question: qText || '(No question text)',
          type: String(qType),
          options: options.length ? options : undefined,
          correctAnswer: correct ? String(correct) : undefined,
        } as QuestionItem;
      });

      setQuestionItems(mapped);
      setSimilarItems([]); // clear or populate later when similarity endpoint is available
      setEnemyItems([]);
      setShowProcessed(true);

      toast({
        title: "Analysis Complete",
        description: `Fetched ${mapped.length} items from dataset ${datasetid}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Processing failed',
        description: error?.message || 'Unable to fetch questions. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadTemplate = () => {
    const url = ITEM_SIMILARITY_TEMPLATE_URL;
    try {
      // Trigger a download via an anchor to avoid CORS issues with fetch
      const link = document.createElement('a');
      link.href = url;
      link.download = "AI-Item Similarity_Template.xlsx"; // may be ignored cross-origin, but harmless
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download started",
        description: "Your template is downloading.",
      });
    } catch (e) {
      // Fallback: open in new tab
      window.open(url, '_blank');
      toast({
        title: "Download",
        description: "Opened template in a new tab.",
      });
    }
  };

  const toggleEnemyStatus = (id: string) => {
    setSimilarItems(prev => prev.map(item =>
      item.id === id
        ? { ...item, status: item.status === 'enemy' ? 'similar' : 'enemy' }
        : item
    ));
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 90) return "text-green-600";
    if (similarity >= 80) return "text-yellow-600";
    return "text-red-600";
  };

  const getSimilarityBg = (similarity: number) => {
    if (similarity >= 90) return "bg-green-100";
    if (similarity >= 80) return "bg-yellow-100";
    return "bg-red-100";
  };

  // Helpers for Excel export
  const pxToExcelWidth = (px: number): number => {
    return (px - 5) / 7;
  };

  const getPixelWidth = (text: string): number => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = '14px Arial, sans-serif';
        return ctx.measureText(text).width + 16; // padding
      }
    } catch { }
    const len = (text || '').length;
    return Math.min(1000, len * 7 + 16);
  };

  const downloadExcel = async () => {
    if (!similarItems.length) {
      toast({ title: 'No data to export', description: 'Run similarity first to export results.', variant: 'destructive' });
      return;
    }
    try {
      const XLSX: any = await import('xlsx');
      const combinedData: { [key: string]: any }[] = [];
      const headers = ["Item Id", "Question sequence number", "Item Stem", "Count", "Score"];

      const now = new Date();
      const dateTimeForFile = now.toISOString().replace(/:/g, '-');

      similarItems.forEach((mainRow) => {
        const details = similarDetails[mainRow.id];
        const items = details?.items || [];
        combinedData.push({
          "Item Id": mainRow.id,
          "Question sequence number": "",
          "Item Stem": mainRow.question,
          "Count": items.length,
          "Score": "",
        });
        items.forEach((similarItem, index) => {
          combinedData.push({
            "Item Id": "",
            "Question sequence number": similarItem.sl_no,
            "Item Stem": `Similar Question ${index + 1}: ${similarItem.question}`,
            "Count": "",
            "Score": similarItem.score,
          });
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(combinedData, { header: headers });
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!worksheet[cellAddress]) worksheet[cellAddress] = { v: "" };
          if (!worksheet[cellAddress].s) worksheet[cellAddress].s = {};
          worksheet[cellAddress].s.alignment = {
            horizontal: "left",
            vertical: "top",
            wrapText: false,
          };
          worksheet[cellAddress].s.border = {
            top: { style: "thin", color: { rgb: "CCCCCC" } },
            bottom: { style: "thin", color: { rgb: "CCCCCC" } },
            left: { style: "thin", color: { rgb: "CCCCCC" } },
            right: { style: "thin", color: { rgb: "CCCCCC" } },
          };
        }
      }

      const maxWidths = headers.map(header => {
        let maxPixelWidth = getPixelWidth(header);
        combinedData.forEach(row => {
          const cellValue = row[header];
          const text = (cellValue ?? '').toString();
          const pixelWidth = getPixelWidth(text);
          if (pixelWidth > maxPixelWidth) maxPixelWidth = pixelWidth;
        });
        const excelWidth = pxToExcelWidth(maxPixelWidth);
        return { wch: excelWidth } as any;
      });
      (worksheet as any)["!cols"] = maxWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Similar Questions");

      const email = sessionStorage.getItem('email') || 'adminshiva';
      const dataset = selectedQuestionSet || sessionStorage.getItem('datasetid') || 'dataset';
      const fileName = `SimilarQuestions_${email}_Question Set_${dataset}_${dateTimeForFile}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast({ title: 'Exported', description: 'Excel file downloading.' });
    } catch (e: any) {
      toast({ title: 'Export failed', description: 'Please ensure the xlsx package is installed: npm i xlsx', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-sm">IS</span>
              </div>

              {isLoadingAllEnemy && (
                <div className="w-full rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-pulse" />
                    <span>Fetching enemy items for all questions...</span>
                    <span className="ml-auto">{enemyFetchDone}/{enemyFetchTotal}</span>
                  </div>
                  <div className="w-full h-2 bg-amber-100 rounded mt-2">
                    <div
                      className="h-2 bg-amber-400 rounded"
                      style={{ width: `${enemyFetchTotal ? Math.round((enemyFetchDone / enemyFetchTotal) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-col">
                <span className="font-semibold text-gray-900">Item Similarity</span>
                <span className="text-xs text-gray-500">AI-Powered Similarity Analysis</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">

            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-gray-600">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Page Title */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
            <Scan className="w-4 h-4" />
            Analyze Item Similarity
          </div>
          <h1 className="text-4xl leading-[3.5rem] font-bold bg-gradient-to-r from-gray-900 via-purple-800 to-blue-800 bg-clip-text text-transparent">
            Item Similarity Analyzer
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Manage question sets, find similar items and identify enemy questions
          </p>
        </div>

        {/* Enhanced Tabs */}
        <Card className="border-gray-200 shadow-xl bg-white/90 backdrop-blur-sm">
          <Tabs value={activeTab} className="w-full" onValueChange={(v) => {
            // Block switching between Similar and Enemy while loading
            if (isLoadingSimilar || isLoadingEnemy || isLoadingAllEnemy) {
              return; // ignore tab change while loading processes are active
            }
            setActiveTab(v as any);
            // Reset threshold when navigating away from Similar Items tab
            if (v !== 'similar-items') {
              setScoreThreshold(1);
            }
            if (v === 'similar-items') {
              fetchSimilarItems();
            }
            if (v === 'enemy-items') {
              loadQuestionsForSelectedSet();
            }
          }}>
            <div className="bg-gradient-to-r from-purple-100 via-blue-100 to-purple-100 border-b border-purple-300/70 px-8 pt-8 pb-4">
              <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm border-2 border-purple-300 shadow-2xl h-20 rounded-xl p-2">
                <TabsTrigger
                  value="item-bank"
                  className="relative flex items-center justify-center gap-3 text-gray-800 font-bold text-base transition-all duration-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-purple-800 data-[state=active]:text-white data-[state=active]:shadow-2xl data-[state=active]:scale-105 data-[state=active]:z-10 hover:bg-purple-100 hover:scale-102 rounded-lg mx-1 h-full px-4 py-2"
                >
                  <FileText className="w-5 h-5" />
                  <span className="font-bold">Item Bank</span>
                </TabsTrigger>
                <TabsTrigger
                  value="similar-items"
                  disabled={isLoadingSimilar || isLoadingEnemy || isLoadingAllEnemy}
                  className={`relative flex items-center justify-center gap-3 text-gray-800 font-bold text-base transition-all duration-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-800 data-[state=active]:text-white data-[state=active]:shadow-2xl data-[state=active]:scale-105 data-[state=active]:z-10 hover:bg-blue-100 hover:scale-102 rounded-lg mx-1 h-full px-4 py-2 ${(isLoadingSimilar || isLoadingEnemy || isLoadingAllEnemy) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  title={(isLoadingSimilar || isLoadingEnemy || isLoadingAllEnemy) ? 'Please wait for the current process to finish' : undefined}
                >
                  <Target className="w-5 h-5" />
                  <span className="font-bold">Similar Items</span>
                </TabsTrigger>
                <TabsTrigger
                  value="enemy-items"
                  disabled={isLoadingSimilar || isLoadingEnemy || isLoadingAllEnemy}
                  className={`relative flex items-center justify-center gap-3 text-gray-800 font-bold text-base transition-all duration-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-600 data-[state=active]:to-red-800 data-[state=active]:text-white data-[state=active]:shadow-2xl data-[state=active]:scale-105 data-[state=active]:z-10 hover:bg-red-100 hover:scale-102 rounded-lg mx-1 h-full px-4 py-2 ${(isLoadingSimilar || isLoadingEnemy || isLoadingAllEnemy) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  title={(isLoadingSimilar || isLoadingEnemy || isLoadingAllEnemy) ? 'Please wait for the current process to finish' : undefined}
                >
                  <Filter className="w-5 h-5" />
                  <span className="font-bold">Enemy Items</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Item Bank Tab */}
            <TabsContent value="item-bank" className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Item Bank</h2>
                  <p className="text-gray-600 mt-1">Manage your question sets and upload templates</p>
                </div>

              </div>

              {/* Question Set Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="text-sm font-medium text-gray-700">Select Question Set</label>
                  <select
                    className="w-full border rounded-md h-10 px-3 bg-white text-gray-800 border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={selectedQuestionSet}
                    onChange={(e) => { const val = e.target.value; setSelectedQuestionSet(val); handleAnalyzeSimilarity(val); }}
                  >
                    <option value="" disabled>
                      {isLoadingSets ? 'Loading...' : (setsError ? 'Failed to load' : 'Choose a question set')}
                    </option>
                    {questionSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name}{typeof set.itemCount === 'number' ? ` (${set.itemCount} items)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-sm font-medium text-gray-700">Actions</label>
                  <Button
                    variant="outline"
                    className="w-full border-2 border-purple-400 text-purple-700 hover:bg-purple-50 hover:text-purple-700"
                    onClick={handleDownloadTemplate}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Template
                  </Button>
                </div>
              </div>

              {/* File Upload */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Upload Question Template</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                  <Badge variant="outline" className="text-xs">Format: .xlsx only</Badge>
                  <Badge variant="outline" className="text-xs">Limit: 200MB</Badge>
                </div>

                {!uploadedFile ? (
                  <div
                    className={`border-2 border-dashed rounded-xl p-12 transition-all duration-300 cursor-pointer ${isDragOver
                      ? 'border-purple-500 bg-purple-50/50'
                      : 'border-gray-300 hover:border-purple-400 bg-gray-50/30'
                      }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('file-upload')?.click()}
                  >
                    <div className="text-center space-y-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center mx-auto transition-all duration-300 ${isDragOver
                        ? 'bg-purple-600'
                        : 'bg-gray-100 border-2 border-gray-300'
                        }`}>
                        <Upload className={`w-6 h-6 transition-all duration-300 ${isDragOver ? 'text-white' : 'text-gray-500'
                          }`} />
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-md font-semibold text-gray-900">
                          Drop your Excel file here
                        </h4>
                        <p className="text-gray-500 text-sm">
                          or click to browse for files
                        </p>
                      </div>

                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="file-upload"
                      />
                      <Button
                        variant="outline"
                        className="border-2 border-purple-400 text-purple-700 bg-purple-50 hover:bg-purple-100 hover:text-purple-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          document.getElementById('file-upload')?.click();
                        }}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Browse Files
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-green-200 rounded-xl p-8 bg-green-50/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-100 border-2 border-green-300 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <h4 className="text-md font-semibold text-gray-900">{uploadedFile.name}</h4>
                          <p className="text-green-600 font-medium text-sm">File uploaded successfully!</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {/* <Button 
                          className="bg-purple-600 text-white opacity-60 cursor-not-allowed"
                          disabled
                          title="Processed Items"
                        >
                          <Scan className="w-4 h-4 mr-2" />
                          Processed Items
                        </Button> */}
                        <Button
                          variant="outline"
                          className="border-2 border-red-400 text-red-600 hover:bg-red-50"
                          onClick={handleRemoveFile}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Processing Progress */}
              {isAnalyzing && (
                <Card className="border-purple-200 animate-fade-in">
                  <div className="p-6 text-center space-y-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto">
                      <Scan className="w-6 h-6 text-purple-600 animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-lg font-semibold text-gray-900">Processing Items...</h4>
                      <p className="text-gray-600">AI is analyzing your questions</p>
                      <Progress value={75} className="w-full max-w-md mx-auto" />
                    </div>
                  </div>
                </Card>
              )}


              {selectedQuestionSet && questionItems.length > 0 && !showProcessed && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Questions ({questionItems.length} items)
                    </h3>
                    {/* <Button variant="outline" className="border-2 border-blue-400 text-blue-700 hover:bg-blue-50">
                      <Download className="w-4 h-4 mr-2" />
                      Export Questions
                    </Button> */}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Question</TableHead>
                        <TableHead className="w-24">Type</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questionItems.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.sequenceNumber}</TableCell>
                          <TableCell className="max-w-md">
                            <p className="truncate">{item.question}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4 mr-2" />
                                  Preview
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl p-0">
                                <DialogHeader className="sticky top-0 bg-white z-10 border-b shadow-sm h-12 flex items-center justify-center px-12 relative">
                                  <DialogTitle className="flex items-center gap-2 text-lg">
                                    <Eye className="w-5 h-5 text-purple-600" />
                                    Question Preview
                                  </DialogTitle>
                                  <DialogClose asChild>
                                    <Button variant="ghost" size="icon" title="Close" aria-label="Close preview" className="absolute right-1 top-0">
                                      <X className="w-5 h-5" />
                                    </Button>
                                  </DialogClose>
                                </DialogHeader>
                                <div className="space-y-6 p-6 pt-12 max-h-[80vh] overflow-y-auto">
                                  {/* Question Header */}
                                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-xl border border-purple-200">
                                    <div className="flex items-center gap-3 mb-3">
                                      <Badge className="bg-purple-100 text-purple-800">
                                        Question #{item.sequenceNumber}
                                      </Badge>
                                      <Badge variant="outline" className="border-purple-300 text-purple-700">
                                        {item.type}
                                      </Badge>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg shadow-sm">
                                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Question Statement</h3>
                                      <p className="text-gray-800 leading-relaxed">{item.question}</p>
                                    </div>
                                  </div>

                                  {/* Options Section */}
                                  {item.options && (
                                    <div className="space-y-4">
                                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">

                                        Answer Options
                                      </h3>
                                      <div className="grid gap-3">
                                        {item.options.map((option, idx) => (
                                          <div
                                            key={idx}
                                            className={`flex items-center gap-4 p-4 rounded-lg transition-all duration-200 ${item.correctAnswer === option
                                              ? 'bg-green-50 border-2 border-green-300 shadow-md'
                                              : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                                              }`}
                                          >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${item.correctAnswer === option
                                              ? 'bg-green-500 text-white'
                                              : 'bg-gray-300 text-gray-700'
                                              }`}>
                                              {String.fromCharCode(65 + idx)}
                                            </div>
                                            <span className="flex-1 text-gray-800">{option}</span>
                                            {item.correctAnswer === option && (
                                              <Badge className="bg-green-500 text-white">
                                                Correct Answer
                                              </Badge>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Processed Items Table */}
              {showProcessed && questionItems.length > 0 && !isAnalyzing && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Processed Items</h3>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Sl No</TableHead>
                        <TableHead>Question</TableHead>
                        <TableHead className="w-24">Type</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questionItems.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.sequenceNumber}</TableCell>
                          <TableCell className="max-w-md">
                            <p className="truncate">{item.question}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4 mr-2" />
                                  Preview
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl p-0">
                                <DialogHeader className="sticky top-0 bg-white z-10 border-b shadow-sm h-12 flex items-center justify-center px-12 relative">
                                  <DialogTitle className="flex items-center gap-2 text-lg">
                                    <Eye className="w-5 h-5 text-purple-600" />
                                    Question Preview
                                  </DialogTitle>
                                  <DialogClose asChild>
                                    <Button variant="ghost" size="icon" title="Close" aria-label="Close preview" className="absolute right-1 top-0">
                                      <X className="w-5 h-5" />
                                    </Button>
                                  </DialogClose>
                                </DialogHeader>
                                <div className="space-y-6 p-6 pt-12 max-h-[80vh] overflow-y-auto">
                                  {/* Question Header */}
                                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-xl border border-purple-200">
                                    <div className="flex items-center gap-3 mb-3">
                                      <Badge className="bg-purple-100 text-purple-800">
                                        Question #{item.sequenceNumber}
                                      </Badge>
                                      <Badge variant="outline" className="border-purple-300 text-purple-700">
                                        {item.type}
                                      </Badge>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg shadow-sm">
                                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Question Statement</h3>
                                      <p className="text-gray-800 leading-relaxed">{item.question}</p>
                                    </div>
                                  </div>

                                  {/* Options Section */}
                                  {item.options && (
                                    <div className="space-y-4">
                                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">

                                        Answer Options
                                      </h3>
                                      <div className="grid gap-3">
                                        {item.options.map((option, idx) => (
                                          <div
                                            key={idx}
                                            className={`flex items-center gap-4 p-4 rounded-lg transition-all duration-200 ${item.correctAnswer === option
                                              ? 'bg-green-50 border-2 border-green-300 shadow-md'
                                              : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                                              }`}
                                          >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${item.correctAnswer === option
                                              ? 'bg-green-500 text-white'
                                              : 'bg-gray-300 text-gray-700'
                                              }`}>
                                              {String.fromCharCode(65 + idx)}
                                            </div>
                                            <span className="flex-1 text-gray-800">{option}</span>
                                            {item.correctAnswer === option && (
                                              <Badge className="bg-green-500 text-white">
                                                Correct Answer
                                              </Badge>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Similar Items Tab */}
            <TabsContent value="similar-items" className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Similar Items</h2>
                  <p className="text-gray-600 mt-1">Find and analyze similar questions based on score threshold</p>
                </div>
              </div>

              {/* Question Set Selection */}
              <div className="space-y-4">
                <label className="text-sm font-medium text-gray-700">Select Question Set</label>
                <select
                  className="w-full border rounded-md h-10 px-3 bg-white text-gray-800 border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={selectedQuestionSet}
                  onChange={(e) => setSelectedQuestionSet(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a question set
                  </option>
                  {questionSets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name}{typeof set.itemCount === 'number' ? ` (${set.itemCount} items)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Questions List for Similar Items */}
              {/* {selectedQuestionSet && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Questions in {questionSets.find(s => s.id === selectedQuestionSet)?.name}</h3>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-16">#</TableHead>
                          <TableHead>Question</TableHead>
                          <TableHead className="w-24">Type</TableHead>
                          <TableHead className="w-32">Score</TableHead>
                          <TableHead className="w-32">Status</TableHead>
                          <TableHead className="w-32">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {questionItems.map((question) => (
                          <TableRow key={question.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium">{question.sequenceNumber}</TableCell>
                            <TableCell className="max-w-md">
                              <div className="truncate" title={question.question}>
                                {question.question}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {question.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-blue-100 text-blue-700 border-0">
                                {(85 + Math.random() * 10).toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-green-100 text-green-700 border-0">
                                Similar
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl p-0">
                                  <DialogHeader className="sticky top-0 bg-white z-10 border-b shadow-sm h-12 flex items-center justify-center px-12 relative">
                                    <DialogTitle className="text-lg">Question Details</DialogTitle>
                                    <DialogClose asChild>
                                      <Button variant="ghost" size="icon" aria-label="Close details" className="absolute right-2 top-2">
                                        <X className="w-5 h-5" />
                                      </Button>
                                    </DialogClose>
                                  </DialogHeader>
                                  <div className="space-y-4 p-6 pt-12 max-h-[80vh] overflow-y-auto">
                                    <div>
                                      <h4 className="font-medium text-gray-900 mb-2">Question:</h4>
                                      <p className="text-gray-700">{question.question}</p>
                                    </div>
                                    <div className="flex gap-4">
                                      <div>
                                        <span className="text-sm font-medium text-gray-500">Type:</span>
                                        <Badge variant="outline" className="ml-2">{question.type}</Badge>
                                      </div>
                                      <div>
                                        <span className="text-sm font-medium text-gray-500">ID:</span>
                                        <span className="ml-2 text-sm text-gray-700">{question.id}</span>
                                      </div>
                                    </div>
                                    {question.options && (
                                      <div>
                                        <h4 className="font-medium text-gray-900 mb-2">Options:</h4>
                                        <ul className="space-y-1">
                                          {question.options.map((option, index) => (
                                            <li key={index} className={`p-2 rounded text-sm ${
                                              option === question.correctAnswer 
                                                ? 'bg-green-100 text-green-800 font-medium' 
                                                : 'bg-gray-50 text-gray-700'
                                            }`}>
                                              {String.fromCharCode(65 + index)}. {option}
                                              {option === question.correctAnswer && (
                                                <span className="ml-2 text-green-600">✓ Correct</span>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )} */}

              {/* Score Threshold in separate row */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-200">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-lg font-semibold text-gray-800">Score Threshold</label>
                    <span
                      className={`text-lg font-bold px-4 py-2 rounded-lg shadow-sm ${(hoveredThreshold ?? scoreThreshold) >= 9 ? 'bg-green-500 text-white' :
                        (hoveredThreshold ?? scoreThreshold) >= 8 ? 'bg-yellow-500 text-white' :
                          'bg-red-500 text-white'
                        }`}
                      title={`Threshold: ${hoveredThreshold ?? scoreThreshold}`}
                    >
                      {hoveredThreshold ?? scoreThreshold}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={scoreThreshold}
                      onChange={(e) => setScoreThreshold(Number(e.target.value))}
                      className={`w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer slider ${scoreThreshold >= 9 ? 'slider-green' :
                        scoreThreshold >= 8 ? 'slider-yellow' :
                          'slider-red'
                        }`}
                      style={{
                        background: `linear-gradient(to right, ${scoreThreshold >= 9 ? '#10b981' :
                          scoreThreshold >= 8 ? '#f59e0b' :
                            '#ef4444'
                          } 0%, ${scoreThreshold >= 9 ? '#10b981' :
                            scoreThreshold >= 8 ? '#f59e0b' :
                              '#ef4444'
                          } ${((scoreThreshold - 1) / 9) * 100}%, #e5e7eb ${((scoreThreshold - 1) / 9) * 100}%, #e5e7eb 100%)`
                      }}
                      onMouseMove={(e) => {
                        const rect = (e.target as HTMLInputElement).getBoundingClientRect();
                        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                        const value = 1 + Math.round(ratio * 9);
                        setHoveredThreshold(value);
                      }}
                      onMouseLeave={() => setHoveredThreshold(null)}
                      onClick={(e) => {
                        const rect = (e.target as HTMLInputElement).getBoundingClientRect();
                        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                        const value = 1 + Math.round(ratio * 9);
                        setScoreThreshold(value);
                        // Trigger similarity fetch immediately on click
                        setTimeout(() => { fetchSimilarItems(); }, 0);
                      }}
                      title={`${hoveredThreshold ?? scoreThreshold}`}
                    />
                    <div className="flex justify-between text-sm font-medium text-gray-600">
                      <span>1</span>
                      <span>5</span>
                      <span>10</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Loading state for Similar Items */}
              {isLoadingSimilar && (
                <div className="w-full mt-6">
                  <div className="flex items-center justify-center py-6">
                    <div className="flex items-center gap-3 text-blue-700">
                      <Clock className="w-5 h-5 animate-spin" />
                      <span className="font-medium">Loading similar items…</span>
                    </div>
                  </div>
                  {/* Skeleton placeholder */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="divide-y divide-gray-100">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="p-4 grid grid-cols-12 gap-4 animate-pulse">
                          <div className="col-span-1 h-4 bg-gray-200 rounded" />
                          <div className="col-span-8 h-4 bg-gray-200 rounded" />
                          <div className="col-span-1 h-4 bg-gray-200 rounded" />
                          <div className="col-span-2 h-8 bg-gray-200 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Similar Items Results */}
              {similarItems.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Similar Items Found</h3>
                    <Button
                      variant="outline"
                      className="border-2 border-blue-400 text-blue-700 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60"
                      onClick={downloadExcel}
                      disabled={!similarItems.length}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export Results
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Question</TableHead>
                        <TableHead className="w-24">Type</TableHead>
                        <TableHead className="w-32">Max Score</TableHead>
                        {/* <TableHead className="w-32">Status</TableHead> */}
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {similarItems.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell className="max-w-md">
                            <p className="truncate">{item.question}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`px-2 py-1 rounded-full text-xs font-medium ${getSimilarityBg(item.similarity)}`}>
                                <span className={getSimilarityColor(item.similarity)}>
                                  {item.similarity.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          {/* <TableCell>
                            <Badge 
                              className={
                                item.status === 'enemy' 
                                  ? 'bg-red-100 text-red-800 hover:bg-red-100' 
                                  : 'bg-green-100 text-green-800 hover:bg-green-100'
                              }
                            >
                              {item.status === 'enemy' ? 'Enemy' : 'Similar'}
                            </Badge>
                          </TableCell> */}
                          <TableCell>
                            <div className="flex gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl p-0">
                                  <DialogHeader className="sticky top-0 bg-white z-10 border-b shadow-sm h-12 flex items-center justify-center px-12 relative">
                                    <DialogTitle className="flex items-center gap-2 text-xl">
                                      <Target className="w-5 h-5 text-blue-600" />
                                      Similar Items Analysis
                                    </DialogTitle>
                                    <DialogClose asChild>
                                      <Button variant="ghost" size="icon" title="Close" aria-label="Close preview" className="absolute right-1 top-0">
                                        <X className="w-5 h-5" />
                                      </Button>
                                    </DialogClose>
                                  </DialogHeader>
                                  <div className="space-y-6 p-6 pt-12 max-h-[90vh] overflow-y-auto">
                                    {/* Original Question */}
                                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-blue-200 ">
                                      <div className="flex items-center gap-2 mb-3">
                                        <Badge className="bg-blue-600 text-white">Original Question</Badge>
                                        <Badge variant="outline" className="border-blue-300">{item.type}</Badge>
                                      </div>
                                      <div className="bg-white p-4 rounded-lg shadow-sm">
                                        <p className="text-gray-900 font-medium">{item.question}</p>
                                      </div>
                                    </div>

                                    {/* Similarity Stats */}
                                    {/* <div className="grid grid-cols-3 gap-4">
                                      <div className="bg-green-50 p-4 rounded-lg border border-green-200 text-center">
                                        <div className="text-2xl font-bold text-green-600">5</div>
                                        <div className="text-sm text-green-700">Similar Items</div>
                                      </div>
                                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 text-center">
                                        <div className="text-2xl font-bold text-blue-600">{item.similarity.toFixed(1)}%</div>
                                        <div className="text-sm text-blue-700">Avg Similarity</div>
                                      </div>
                                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 text-center">
                                        <div className="text-2xl font-bold text-purple-600">98.2%</div>
                                        <div className="text-sm text-purple-700">Highest Match</div>
                                      </div>
                                    </div> */}

                                    {/* Similar Items List */}
                                    <div>
                                      <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                                        Similar Items Found
                                      </h4>
                                      <div className="space-y-4">
                                        {(similarDetails[item.id]?.items || []).map((s, idx) => (
                                          <div key={`${item.id}-${s.sl_no || idx}`} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-all duration-200 hover:shadow-md">
                                            <div className="flex items-start justify-between mb-3 gap-3">
                                              <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                                  <span className="text-blue-600 font-bold text-sm">{s.sl_no || idx + 1}</span>
                                                </div>
                                                <Badge variant="outline" className="border-gray-300">
                                                  {item.type}
                                                </Badge>
                                              </div>
                                              <div className="flex items-center gap-3">
                                                <div className={`px-3 py-1 rounded-full text-sm font-bold ${s.score >= 95 ? 'bg-green-100 text-green-700' :
                                                  s.score >= 90 ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-orange-100 text-orange-700'
                                                  }`}>
                                                  {s.score}% Match
                                                </div>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => handleInsertSingle(item.id, { datasetid: Number(s.datasetid), sl_no: Number(s.sl_no), question: String(s.question), score: Number(s.score) })}
                                                  disabled={s.ischecked === 1 || insertingSingle === `${item.id}:${s.sl_no}`}
                                                  className={s.ischecked === 1 ? 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed' : 'border-red-400 text-red-600 hover:bg-red-50'}
                                                >
                                                  {insertingSingle === `${item.id}:${s.sl_no}` ? (
                                                    <>
                                                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                                                      Marking...
                                                    </>
                                                  ) : s.ischecked === 1 ? (
                                                    'Similar'
                                                  ) : (
                                                    'Mark Enemy'
                                                  )}
                                                </Button>
                                              </div>
                                            </div>
                                            <div className="bg-gray-50 p-3 rounded-lg">
                                              <p className="text-gray-800">{s.question}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Enemy Items Tab */}
            <TabsContent value="enemy-items" className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Enemy Items</h2>
                  <p className="text-gray-600 mt-1">Manage and export enemy questions</p>
                </div>
                <Button
                  variant="outline"
                  className="border-2 border-red-400 text-red-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                  onClick={exportEnemyExcel}
                  disabled={isExportingEnemy}
                >
                  {isExportingEnemy ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export Enemy Items
                    </>
                  )}
                </Button>
              </div>

              {/* Question Set Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Question Set</label>
                  <select
                    className="w-full border rounded-md h-10 px-3 bg-white text-gray-800 border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={selectedQuestionSet}
                    onChange={(e) => setSelectedQuestionSet(e.target.value)}
                  >
                    <option value="" disabled>
                      Choose a question set
                    </option>
                    {questionSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name}{typeof set.itemCount === 'number' ? ` (${set.itemCount} items)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Actions</label>
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
                    disabled={!selectedQuestionSet || isLoadingEnemy}
                    onClick={handleFindEnemyItems}
                  >
                    {isLoadingEnemy ? (
                      <>
                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                        Finding...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Find Enemy Items
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Questions List for Enemy Items (uses real dataset questions) */}
              {selectedQuestionSet && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Questions in {questionSets.find(s => s.id === selectedQuestionSet)?.name}</h3>
                  {/* Empty-state guidance */}
                  {!isLoadingAllEnemy && questionsWithEnemies.length === 0 && (
                    <div className="p-4 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg text-sm">
                      No enemy items found for any question. Click the <span className="font-semibold">Find Enemy Items</span> button to get the enemy items.
                    </div>
                  )}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-16">Sl No</TableHead>
                          <TableHead>Question</TableHead>
                          <TableHead className="w-24">Type</TableHead>
                          <TableHead className="w-32">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {questionsWithEnemies.map((question) => (
                          <TableRow key={question.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium">{question.sequenceNumber}</TableCell>
                            <TableCell className="max-w-md">
                              <div className="truncate" title={question.question}>
                                {question.question}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {question.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setLoadingEnemyFor(String(question.id));
                                    // Fire and forget; dialog content shows loader
                                    fetchEnemyQuestions(Number(question.id))
                                      .then(() => setLoadingEnemyFor(null))
                                      .catch(() => setLoadingEnemyFor(null));
                                  }}>
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto p-0">
                                  <DialogHeader className="sticky top-0 bg-white z-10 border-b shadow-sm h-12 flex items-center justify-center px-12 relative">
                                    <DialogTitle>Question Details</DialogTitle>
                                    <DialogClose asChild>
                                      <Button variant="ghost" size="icon" title="Close" aria-label="Close preview" className="absolute right-1 top-0">
                                        <X className="w-5 h-5" />
                                      </Button>
                                    </DialogClose>
                                  </DialogHeader>
                                  <div className="space-y-4 p-6 pt-12">
                                    <div>
                                      <h4 className="font-medium text-gray-900 mb-2">Question:</h4>
                                      <p className="text-gray-700">{question.question}</p>
                                    </div>
                                    <div className="flex gap-4">
                                      <div>
                                        <span className="text-sm font-medium text-gray-500">Type:</span>
                                        <Badge variant="outline" className="ml-2">{question.type}</Badge>
                                      </div>
                                      <div>
                                        <span className="text-sm font-medium text-gray-500">ID:</span>
                                        <span className="ml-2 text-sm text-gray-700">{question.id}</span>
                                      </div>
                                    </div>
                                    {/* Enemy items for this question */}
                                    {loadingEnemyFor === String(question.id) && (
                                      <div className="text-center py-4">
                                        <Clock className="w-5 h-5 inline-block mr-2 animate-spin text-red-600" />
                                        <span className="text-sm text-gray-700">Loading enemy questions...</span>
                                      </div>
                                    )}
                                    {Array.isArray(enemyDetails[String(question.id)]) && enemyDetails[String(question.id)]?.length > 0 && (
                                      <div className="space-y-2">
                                        <h4 className="font-medium text-gray-900">Enemy Questions</h4>
                                        <ul className="space-y-2 max-h-80 overflow-y-auto">
                                          {enemyDetails[String(question.id)].map((eitem, idx) => (
                                            <li key={`${question.id}-${eitem.id}-${idx}`} className="p-3 bg-red-50 border border-red-200 rounded">
                                              <div className="flex items-center justify-between">
                                                <Badge className="bg-red-600 text-white">{eitem.type}</Badge>
                                                <div className="flex items-center gap-2">
                                                  <Badge variant="outline" className={`${(eitem.selection || '').toLowerCase().includes('system') ? 'border-blue-300 text-blue-700' : 'border-gray-300 text-gray-700'}`}>
                                                    {eitem.selection || '—'}
                                                  </Badge>
                                                  <span className="text-xs text-gray-600">ID: {eitem.id}</span>
                                                </div>
                                              </div>
                                              <p className="mt-2 text-gray-800">{eitem.question}</p>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {Array.isArray(enemyDetails[String(question.id)]) && enemyDetails[String(question.id)]?.length === 0 && loadingEnemyFor !== String(question.id) && (
                                      <div className="text-sm text-gray-600">No enemy questions found for this item.</div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Enemy Items Table */}
              {isLoadingEnemy && (
                <div className="text-center py-6 bg-red-50 border border-red-200 rounded-lg">
                  <Clock className="w-5 h-5 text-red-600 inline-block mr-2 animate-spin" />
                  <span className="text-red-700 font-medium">Loading enemy items...</span>
                </div>
              )}
              {/* {enemyItems.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Enemy Questions ({enemyItems.length})</h3>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Question</TableHead>
                        <TableHead className="w-24">Type</TableHead>
                        <TableHead className="w-32">Score</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enemyItems.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell className="max-w-md">
                            <p className="truncate">{item.question}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${getSimilarityBg(item.similarity)} inline-block`}>
                              <span className={getSimilarityColor(item.similarity)}>
                                {item.similarity.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4 mr-2" />
                                  View
                                </Button>
                              </DialogTrigger>
                               <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                                 <DialogHeader className="border-b border-red-200 pb-4">
                                   <DialogTitle className="text-xl font-bold text-red-700 flex items-center gap-2">
                                     <AlertTriangle className="w-5 h-5" />
                                     Enemy Question Preview
                                   </DialogTitle>
                                 </DialogHeader>
                                 <div className="space-y-6 p-2">
                                   <div className="bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 p-6 rounded-lg">
                                     <div className="flex items-start justify-between mb-4">
                                       <div className="flex items-center gap-3">
                                         <Badge className="bg-red-600 text-white text-sm px-3 py-1">
                                           {item.type}
                                         </Badge>
                                         <Badge variant="outline" className="text-red-700 border-red-300 bg-white">
                                           Similarity: {item.similarity}%
                                         </Badge>
                                       </div>
                                       <div className="text-right">
                                         <span className="text-xs text-red-600 font-medium">Enemy Status</span>
                                         <div className="w-3 h-3 bg-red-500 rounded-full mt-1"></div>
                                       </div>
                                     </div>
                                     
                                     <div className="space-y-3">
                                       <label className="text-sm font-semibold text-red-800 uppercase tracking-wide">Question</label>
                                       <p className="text-gray-900 text-lg leading-relaxed bg-white p-4 rounded-lg border border-red-200 shadow-sm">
                                         {item.question}
                                       </p>
                                     </div>

                                     {item.type === "MCQ" && (
                                       <div className="mt-6 space-y-3">
                                         <label className="text-sm font-semibold text-red-800 uppercase tracking-wide">Options</label>
                                         <div className="grid gap-2">
                                           {["Option A", "Option B", "Option C", "Option D"].map((option, idx) => (
                                             <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-red-200 rounded-lg">
                                               <span className="w-6 h-6 bg-red-100 text-red-700 rounded-full flex items-center justify-center text-sm font-medium">
                                                 {String.fromCharCode(65 + idx)}
                                               </span>
                                               <span className="text-gray-700">{option} content here</span>
                                             </div>
                                           ))}
                                         </div>
                                       </div>
                                     )}

                                     <div className="mt-6 pt-4 border-t border-red-200">
                                       <div className="flex items-center justify-between text-sm">
                                         <span className="text-red-700 font-medium">Classification: Enemy Item</span>
                                         <span className="text-gray-600">ID: {item.id}</span>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Enemy Items Found</h3>
                  <p className="text-gray-600">Select a question set and click "Find Enemy Items" to start analysis</p>
                </div>
              )} */}
            </TabsContent>
          </Tabs>
        </Card>

        {/* Footer */}
        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 bg-purple-600 rounded flex items-center justify-center">
              <span className="text-white text-xs">⚡</span>
            </div>
            <span>Powered by advanced AI similarity detection</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemSimilarity;