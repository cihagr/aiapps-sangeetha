import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, CheckCircle, XCircle, FileSearch, AlertCircle, Pencil, ThumbsUp, ThumbsDown } from "lucide-react";
import { API_BASE_URL } from '@/api';
import { getSessionCodes } from '@/lib/session';
import { AGENT_GENERATIVE_API_URL, AIG_QUIZ_GEN_URL } from '@/utils/Aigapi';
import { API_ENDPOINTS } from '@/config';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { AppSidebar } from "../components/AppSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Loader } from "@/components/ui/loader";

interface Org {
    orgCode: string;
    orgID: number;
    orgName: string;
}

interface AppDetail {
    appCode: string;
    appName: string;
}

const Feedback_approval = () => {
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const [fromDate, setFromDate] = useState(today);
    const [toDate, setToDate] = useState(today);
    const [organization, setOrganization] = useState("");
    const [appDetails, setAppDetails] = useState("");
    const [appDetailsOptions, setAppDetailsOptions] = useState<AppDetail[]>([]);
    const [appDetailsLoading, setAppDetailsLoading] = useState(false);
    const [appDetailsLoaded, setAppDetailsLoaded] = useState(false);
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [book, setBook] = useState("");
    const [books, setBooks] = useState<string[]>([]);
    const [learningType, setLearningType] = useState<string>("question");
    const [bookIdMap, setBookIdMap] = useState<Record<string, number>>({});
    const [orgLoading, setOrgLoading] = useState(false);
    const [subsLoading, setSubsLoading] = useState(false);
    const [subscriptionData, setSubscriptionData] = useState<any[]>([]);
    const [feedbackData, setFeedbackData] = useState<any[]>([]);
    const [orgsLoaded, setOrgsLoaded] = useState(false);

    const [bookLoading, setBookLoading] = useState(false);
    const [booksLoaded, setBooksLoaded] = useState(false);

    const [taxonomy, setTaxonomy] = useState('');
    const [taxonomyOptions, setTaxonomyOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [taxonomyLoading, setTaxonomyLoading] = useState(false);
    const [taxonomyLoaded, setTaxonomyLoaded] = useState(false);

    const [questionType, setQuestionType] = useState('');
    const [questionTypeOptions, setQuestionTypeOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [questionTypeLoading, setQuestionTypeLoading] = useState(false);
    const [questionTypeLoaded, setQuestionTypeLoaded] = useState(false);

    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<any | null>(null);
    const [editingFeedback, setEditingFeedback] = useState("");

    const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
    const [approveRow, setApproveRow] = useState<any | null>(null);
    const [approveConfirmTaxonomy, setApproveConfirmTaxonomy] = useState(false);
    const [approveConfirmQuestionType, setApproveConfirmQuestionType] = useState(false);
    const [approveError, setApproveError] = useState<string>("");
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [approveConfirmLoading, setApproveConfirmLoading] = useState(false);

    const getQuestionTypeLabel = (id: any): string => {
        if (id === undefined || id === null || id === '') return '';
        const idStr = String(id);

        // Try match by value
        const byValue = questionTypeOptions.find((opt) => opt.value === idStr);
        if (byValue?.label) return byValue.label;

        // Try match by label directly
        const byLabel = questionTypeOptions.find((opt) => opt.label === idStr);
        if (byLabel?.label) return byLabel.label;
        // Last resort: return the raw string so we at least send something
        return idStr;
    };

    const fetchQuestionTypes = async () => {
        if (questionTypeLoaded || questionTypeLoading) return;
        try {
            setQuestionTypeLoading(true);
            const custcode = getCustCodeFromSession();
            const orgcode = organization && organization !== 'none' ? organization : '';
            const appcode = getAppCodeFromSession();

            if (!custcode || !orgcode || !appcode) {
                setQuestionTypeOptions([]);
                return;
            }

            const res = await fetch(
                `${AIG_QUIZ_GEN_URL}/dropdownloader`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        custcode,
                        orgcode,
                        appcode,
                    }),
                }
            );

            if (!res.ok) throw new Error('Failed to fetch question types');
            const data = await res.json();

            const safeJsonParseArray = (raw: any): any[] => {
                if (!raw || typeof raw !== 'string') return [];
                try {
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            };

            const getQuestionTypeRows = (payload: any): any[] => {
                const rootArr: any[] = Array.isArray(payload)
                    ? payload
                    : (Array.isArray(payload?.data) ? payload.data : []);

                if (rootArr.length > 0 && rootArr.some((x: any) => x && typeof x === 'object' && 'type' in x && 'jsonDetails' in x)) {
                    const block = rootArr.find((x: any) => String(x?.type || '').toLowerCase() === 'questiontype');
                    if (block?.jsonDetails) {
                        return safeJsonParseArray(block.jsonDetails);
                    }
                }

                if (Array.isArray(payload?.QuestionType)) return payload.QuestionType;
                return [];
            };

            const rows: any[] = getQuestionTypeRows(data);

            const options = (rows || []).map((row: any) => {
                const id = row?.id ?? row?.questiontypeid ?? row?.questionTypeId;
                const name = row?.questiontype ?? row?.questionType ?? row?.name ?? row?.title;
                const valueStr = String(id ?? '').trim();
                const labelStr = String(name ?? '').trim();
                return { value: valueStr || labelStr, label: labelStr || valueStr };
            }).filter((o: any) => o.value && o.label);

            setQuestionTypeOptions(options);
            setQuestionTypeLoaded(true);
        } catch (err: any) {
            console.error('Error fetching question types:', err);
            setQuestionTypeOptions([]);
        } finally {
            setQuestionTypeLoading(false);
        }
    };

    // live input for status select (doesn't apply until Submit)
    const [statusInput, setStatusInput] = useState("");
    // committed status value used for filtering
    const [status, setStatus] = useState("");
    // live input for search box (typing) and committed searchQuery (used for filtering/fetch)
    const [searchInput, setSearchInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [hasData, setHasData] = useState(false);
    const [showError, setShowError] = useState(false);

    // Convert API `requestDate` (e.g., 2025-12-15T08:04:39.298) to IST (UTC+5:30)
    // We treat input without timezone as UTC per requirement, then add +5:30
    const formatToIST_DDMMYYYY_HHMM_AMPM = (value: any): string => {
        if (!value) return '-';
        const str = String(value);

        // Parse as UTC components when no timezone present
        let utcMs: number | null = null;
        try {
            if (/Z|[+-]\d{2}:\d{2}$/.test(str)) {
                // Has timezone, use Date to get UTC ms
                const d = new Date(str);
                if (isNaN(d.getTime())) return '-';
                utcMs = d.getTime();
            } else {
                // No timezone → interpret as UTC components
                const [datePart, timePart = ''] = str.split('T');
                const [y, m, d] = (datePart || '').split('-').map((n) => parseInt(n || '0', 10));
                const [hh = '0', mm = '0', ssMs = '0'] = timePart.split(':');
                const [ss = '0', ms = '0'] = ssMs.split('.');
                utcMs = Date.UTC(
                    Number.isFinite(y) ? y : 0,
                    Number.isFinite(m) ? (m - 1) : 0,
                    Number.isFinite(d) ? d : 1,
                    parseInt(hh || '0', 10) || 0,
                    parseInt(mm || '0', 10) || 0,
                    parseInt(ss || '0', 10) || 0,
                    parseInt(ms || '0', 10) || 0
                );
            }
        } catch {
            return '-';
        }

        // Add IST offset (+330 minutes)
        const istMs = (utcMs || 0) + (330 * 60 * 1000);
        const dIst = new Date(istMs);

        // Use UTC getters on shifted time so output is fixed as IST
        const dd = String(dIst.getUTCDate()).padStart(2, '0');
        const mm = String(dIst.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = dIst.getUTCFullYear();
        let hours = dIst.getUTCHours();
        const minutes = String(dIst.getUTCMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours === 0) hours = 12;
        const hh12 = String(hours).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh12}:${minutes} ${ampm}`;
    };

    const handleOpenApproveConfirm = (row: any) => {
        const adminStatusNum = row.admin_status;
        const isPending = adminStatusNum === 0 || adminStatusNum === null || adminStatusNum === undefined;

        if (isPending) {
            // For pending rows, enforce that feedback is not empty before allowing approve
            if (!row.feedback || !String(row.feedback).trim()) {
                setApproveError("Feedback cannot be empty");
                return;
            }
        }

        // Clear any previous approve error when we can show the popup
        setApproveError("");
        setApproveRow(row);
        setApproveConfirmTaxonomy(false);
        setApproveConfirmQuestionType(false);
        setApproveConfirmOpen(true);
    };

    const handleApproveFeedback = async (row: any) => {
        try {
            setSubsLoading(true);

            // Ensure question types are loaded so we can decode the label correctly
            await fetchQuestionTypes();

            const { custcode, orgcode: sessionOrgCode, appcode: sessionAppCode, usercode } = getSessionCodes();
            // Prefer the currently selected organization and app from the dropdowns; fallback to session values
            const effectiveOrgCode = organization && organization !== 'none' ? organization : sessionOrgCode;
            const effectiveAppCode = appDetails && appDetails !== 'none' ? appDetails : sessionAppCode;

            const taxonomyPart = approveConfirmTaxonomy && row.taxonomyname
                ? String(row.taxonomyname)
                : '';

            // Always include question type when available (decoded from dropdown options or row.questiontypeid)
            const effectiveQuestionType = questionType || row.questiontypeid;
            const questionTypePart = getQuestionTypeLabel(effectiveQuestionType);
            const feedback_type = [taxonomyPart, questionTypePart].filter(Boolean).join(', ');

            const payload = {
                custcode,
                appcode: effectiveAppCode,
                orgcode: effectiveOrgCode,
                questionrequestid: row.questionrequestid,
                questionid: row.questionid,
                feedback_updated: row.feedback || '',
                adminstatus: 1,
                approverby: usercode,
                feedback_type,
            };

            const res = await fetch(
                `${AIG_QUIZ_GEN_URL}/update-feedback-status`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Failed to update feedback status: ${res.status} ${text}`);
            }

            // Call the new feedback-approve API after successful update
            const feedbackApprovePayload = {
                par_kid: String(row.kbid || ""),
                par_guidelinetype: "Question Generation",
                par_guidelinename: "0",
                par_orgcode: effectiveOrgCode || "0",
                par_appcode: effectiveAppCode || "0",
                par_custcode: custcode || "0",
                new_feedback: row.feedback || '',
                guideline_id: 0
            };

            const feedbackApproveRes = await fetch(
                `${AGENT_GENERATIVE_API_URL}/feedback-approve`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(feedbackApprovePayload),
                }
            );

            if (!feedbackApproveRes.ok) {
                const text = await feedbackApproveRes.text().catch(() => '');
                throw new Error(`Failed to approve feedback: ${feedbackApproveRes.status} ${text}`);
            }

            // Optimistically update admin_status in local state so UI reflects Approved
            const keyId = row.questionrequestid ?? row.questionid ?? row.feedback_approval_id;
            setFeedbackData((prev) =>
                prev.map((item) => {
                    const itemKey = item.questionrequestid ?? item.questionid ?? item.feedback_approval_id;
                    if (itemKey === keyId) {
                        return { ...item, admin_status: 1 };
                    }
                    return item;
                })
            );
        } catch (err) {
            console.error('Error updating feedback status:', err);
        } finally {
            setSubsLoading(false);
        }
    };

    const handleRejectFeedback = async (row: any) => {
        try {
            setSubsLoading(true);

            const { custcode, orgcode: sessionOrgCode, appcode: sessionAppCode, usercode } = getSessionCodes();
            const effectiveOrgCode = organization && organization !== 'none' ? organization : sessionOrgCode;
            const effectiveAppCode = appDetails && appDetails !== 'none' ? appDetails : sessionAppCode;

            const taxonomyPart = row.taxonomyname ? String(row.taxonomyname) : '';
            const questionTypePart = getQuestionTypeLabel(row.questiontypeid);
            const feedback_type = [taxonomyPart, questionTypePart].filter(Boolean).join(', ');

            const payload = {
                custcode,
                appcode: effectiveAppCode,
                orgcode: effectiveOrgCode,
                questionrequestid: row.questionrequestid,
                questionid: row.questionid,
                feedback_updated: row.feedback || '',
                adminstatus: 2,
                approverby: usercode,
                feedback_type,
            };

            const res = await fetch(
                `${AIG_QUIZ_GEN_URL}/update-feedback-status`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Failed to update feedback status: ${res.status} ${text}`);
            }

            const keyId = row.questionrequestid ?? row.questionid ?? row.feedback_approval_id;
            setFeedbackData((prev) =>
                prev.map((item) => {
                    const itemKey = item.questionrequestid ?? item.questionid ?? item.feedback_approval_id;
                    if (itemKey === keyId) {
                        return { ...item, admin_status: 2 };
                    }
                    return item;
                })
            );
        } catch (err) {
            console.error('Error updating feedback status (reject):', err);
        } finally {
            setSubsLoading(false);
        }
    };

    const fetchFeedbackSummary = async () => {
        try {
            setFeedbackLoading(true);
            const orgcode = organization && organization !== "none" ? organization : "";
            const appcode = appDetails && appDetails !== "none" ? appDetails : getAppCodeFromSession();
            const taxonomyid = taxonomy && taxonomy !== "__none__" ? Number(taxonomy) || 0 : 0;
            const statusValue = statusInput ? Number(statusInput) || 0 : 0;
            const questiontype = questionType && questionType !== "__none__" ? Number(questionType) || 0 : 0;
            const selectedBook = book && book !== "none" ? book : "";
            const mappedId = selectedBook && Object.prototype.hasOwnProperty.call(bookIdMap, selectedBook)
                ? bookIdMap[selectedBook]
                : 0;
            const booknameid = mappedId;

            const payload = {
                orgcode,
                appcode,
                taxonomyid,
                status: statusValue,
                booknameid,
                fromdate: fromDate,
                todate: toDate,
                questiontype,
            };

            const res = await fetch(`${AIG_QUIZ_GEN_URL}/get-question-feedback-summary`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error("Failed to fetch feedback summary");
            const data = await res.json();

            const rows: any[] = Array.isArray(data)
                ? data
                : (Array.isArray((data as any)?.data)
                    ? (data as any).data
                    : []);

            // Normalize so UI `feedback` always reflects `feedback_updated` from API when present
            const normalizedRows = rows.map((row: any) => ({
                ...row,
                // If backend sends feedback_updated, prefer it; otherwise fall back to feedback
                feedback: row.feedback_updated ?? row.feedback ?? '',
            }));

            setFeedbackData(normalizedRows);
            if (rows.length > 0) {
                setHasData(true);
            } else {
                setHasData(false);
            }
        } catch (error) {
            console.error("Error fetching feedback summary:", error);
            setFeedbackData([]);
            setHasData(false);
        } finally {
            setFeedbackLoading(false);
        }
    };

    const handleSubmit = () => {
        if (!hasValidOrg || !hasValidApp) {
            setShowError(true);
            setHasData(false);
            setFeedbackData([]);
            return;
        }

        setShowError(false);
        // commit live inputs for future use
        setSearchQuery(searchInput);
        setStatus(statusInput);
        // Only call feedback summary API; no subscription details API
        fetchFeedbackSummary();
    };

    const getUserInfoFromSession = () => {
        try {
            return JSON.parse(sessionStorage.getItem('userInfo') || '{}');
        } catch {
            return {} as any;
        }
    };

    const getCustCodeFromSession = () => {
        const userInfo = getUserInfoFromSession();
        return (
            sessionStorage.getItem('custcode') ||
            userInfo?.custcode ||
            userInfo?.customercode ||
            userInfo?.customerCode ||
            ''
        );
    };

    const getAppCodeFromSession = () => {
        const userInfo = getUserInfoFromSession();
        return (
            sessionStorage.getItem('appcode') ||
            userInfo?.appcode ||
            userInfo?.appCode ||
            ''
        );
    };

    const hasValidOrg = Boolean(organization && organization !== 'none');
    const hasValidApp = Boolean(appDetails && appDetails !== 'none');

    const getBookNameFromId = (id: any): string => {
        const num = Number(id);
        if (!num || !Number.isFinite(num)) return '-';
        for (const [name, mappedId] of Object.entries(bookIdMap)) {
            if (mappedId === num) return name;
        }
        return '-';
    };

    const fetchAppDetailsForOrg = async (orgcode: string) => {
        try {
            setAppDetailsLoading(true);
            const custcode = getCustCodeFromSession();
            if (!custcode || !orgcode) {
                setAppDetailsOptions([]);
                setAppDetailsLoaded(true);
                return;
            }

            const res = await fetch(
                API_ENDPOINTS.GET_APPS,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        par_custcode: custcode,
                        par_orgcode: orgcode,
                    }),
                }
            );

            if (!res.ok) throw new Error("Failed to fetch app details");
            const data = await res.json();

            const rows: any[] = Array.isArray(data)
                ? data
                : (Array.isArray((data as any)?.data)
                    ? (data as any).data
                    : (Array.isArray((data as any)?.apps)
                        ? (data as any).apps
                        : []));

            const mapped: AppDetail[] = (rows || []).map((row: any) => {
                if (!row) return null;
                const appCode = String(row?.appcode ?? row?.appCode ?? row?.code ?? row?.id ?? '').trim();
                const appName = String(row?.appname ?? row?.appName ?? row?.name ?? row?.title ?? '').trim();
                if (!appCode && !appName) return null;
                return {
                    appCode: appCode || appName,
                    appName: appName || appCode,
                };
            }).filter((x: any): x is AppDetail => Boolean(x?.appCode) && Boolean(x?.appName));

            setAppDetailsOptions(mapped);
            setAppDetailsLoaded(true);
        } catch (err: any) {
            console.error("Error fetching app details:", err);
            setAppDetailsOptions([]);
        } finally {
            setAppDetailsLoading(false);
        }
    };

    const fetchBooksForApp = async (orgcode: string, appcode: string) => {
        try {
            setBookLoading(true);
            const custcode = getCustCodeFromSession();
            const usercode = getUserCodeFromSession();

            if (!custcode || !orgcode || !usercode || !appcode) {
                setBooks([]);
                setBookIdMap({});
                setBooksLoaded(true);
                return;
            }

            const res = await fetch(
                `${AIG_QUIZ_GEN_URL}/get_usage`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        custcode,
                        orgcode,
                        usercode,
                        appcode,
                        type: 2,
                    }),
                }
            );

            if (!res.ok) throw new Error("Failed to fetch books");
            const data = await res.json();

            const rows: any[] = Array.isArray(data)
                ? data
                : (Array.isArray((data as any)?.data)
                    ? (data as any).data
                    : (Array.isArray((data as any)?.books)
                        ? (data as any).books
                        : []));

            if (Array.isArray(rows) && rows.length > 0) {
                const names: string[] = [];
                const idMap: Record<string, number> = {};

                rows.forEach((row: any) => {
                    let title: string | null = null;
                    let id: number | null = null;

                    if (typeof row === 'string') {
                        title = row;
                    } else if (Array.isArray(row)) {
                        // Sample: [title, bookCode, "0", "0", "0", "0", 165, imagePath, bookPath, null]
                        title = row[0] ?? null;
                        const rawId = row[6];
                        if (rawId !== undefined && rawId !== null && !isNaN(Number(rawId))) {
                            id = Number(rawId);
                        }
                    } else if (row && typeof row === 'object') {
                        title = row.bookname || row.bookName || row.name || row.title || null;
                        const rawId = row.booknameid ?? row.bookNameId ?? row.bookid ?? row.bookId;
                        if (rawId !== undefined && rawId !== null && !isNaN(Number(rawId))) {
                            id = Number(rawId);
                        }
                    }

                    if (title && typeof title === 'string' && title.trim().length > 0) {
                        const trimmed = title.trim();
                        names.push(trimmed);
                        if (id !== null) {
                            idMap[trimmed] = id;
                        }
                    }
                });

                setBooks(names);
                setBookIdMap(idMap);
            } else {
                setBooks([]);
                setBookIdMap({});
            }

            setBooksLoaded(true);
        } catch (err: any) {
            console.error("Error fetching books:", err);
            setBooks([]);
            setBookIdMap({});
        } finally {
            setBookLoading(false);
        }
    };

    // Helper to extract usercode from sessionStorage
    const getUserCodeFromSession = () => {
        const direct = sessionStorage.getItem('userCode') || sessionStorage.getItem('usercode') || sessionStorage.getItem('user_code');
        if (direct) return direct;
        const jsonKeys = ['user', 'userInfo', 'userDetails', 'userData'];
        for (const key of jsonKeys) {
            const raw = sessionStorage.getItem(key);
            if (!raw) continue;
            try {
                const obj = JSON.parse(raw);
                if (!obj || typeof obj === 'string') continue;
                const code = obj.userCode || obj.usercode || obj.user || obj.UserCode;
                if (code) return code;
            } catch (e) {
                continue;
            }
        }
        return sessionStorage.getItem('username') || sessionStorage.getItem('email') || '';
    };

    // Fetch subscriptions (extracted so we can call after updates)
    const fetchSubscriptions = async (searchTextParam?: string, statusParamOverride?: string) => {
        try {
            setSubsLoading(true);
            const usercode = getUserCodeFromSession();
            const orgcode = organization || '';
            const statusToUse = (typeof statusParamOverride === 'string') ? statusParamOverride : status;
            const statusParam = (!statusToUse || statusToUse === 'null') ? '' : String(statusToUse);
            const params = new URLSearchParams();
            params.append('fromdate', fromDate);
            params.append('todate', toDate);
            const effectiveSearch = typeof searchTextParam === 'string' ? searchTextParam : searchQuery;
            params.append('searchtext', effectiveSearch || '');
            if (statusParam) params.append('requestStatus', statusParam);
            if (usercode) params.append('usercode', usercode);
            if (orgcode) params.append('orgcode', orgcode);

            const url = `${API_BASE_URL}/aiapps/AIProductApi/get_subscription_details?${params.toString()}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch subscription details');
            const data = await res.json();
            let items: any[] = [];
            if (Array.isArray(data)) items = data;
            else if (Array.isArray((data as any).subscription_details)) items = (data as any).subscription_details;
            else if (Array.isArray((data as any).data)) items = (data as any).data;
            else if (Array.isArray((data as any).result)) items = (data as any).result;

            setSubscriptionData(items);
            if (items.length > 0) {
                setHasData(true);
                setShowError(false);
            } else {
                setHasData(false);
                setShowError(true);
            }
        } catch (err) {
            console.error('Error fetching subscription details:', err);
            setSubscriptionData([]);
            setHasData(false);
            setShowError(true);
        } finally {
            setSubsLoading(false);
        }
    };

    // Update a subscription's status (approve/reject)
    const updateSubscriptionStatus = async (requestId: number | string, newStatus: number, appCodeFromRow?: string) => {
        setSubsLoading(true);
        try {
            const payload = {
                requestid: Number(requestId),
                orgcode: organization || '',
                appcode: appCodeFromRow || '',
                requeststatus: newStatus,
                approvedby: getUserCodeFromSession(),
            };

            const updateUrl = `${API_BASE_URL}/aiapps/AIProductApi/update_subscription_request`;
            const res = await fetch(updateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                sessionStorage.setItem('statusToUse', newStatus.toString());
                // re-trigger the Submit button flow so the committed inputs are applied
                try {
                    // handleSubmit will commit live inputs and call fetchSubscriptions
                    handleSubmit();
                } catch (e) {
                    // fallback to directly fetching subscriptions if handleSubmit fails
                    await fetchSubscriptions();
                }
            } else {
                const text = await res.text().catch(() => '');
                throw new Error(`Update failed: ${res.status} ${text}`);
            }
        } catch (err) {
            console.error('Error updating subscription status, applying optimistic update:', err);
            setSubscriptionData((prev) => prev.map((item) => {
                if ((item.requestID || item.requestId || item.id) === requestId) {
                    return { ...item, requestStatus: newStatus };
                }
                return item;
            }));
        } finally {
            setSubsLoading(false);
        }
    };

    useEffect(() => {
        const ac = new AbortController();
        const fetchOrgs = async () => {
            try {
                setOrgLoading(true);
                const custcode = getCustCodeFromSession();
                const userCode = getUserCodeFromSession();

                if (!custcode) {
                    console.error("custcode missing; cannot load organizations");
                    setOrgs([]);
                    setOrgsLoaded(true);
                    return;
                }

                const res = await fetch(API_ENDPOINTS.GET_ORGANIZATION_DETAILS, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ par_custcode: custcode, par_usercode: userCode }),
                    signal: ac.signal,
                });

                if (!res.ok) throw new Error("Failed to fetch organizations");

                const orgData = await res.json();

                // KnowledgeBase expects orgData.data to be an array
                if (Array.isArray(orgData.data)) {
                    setOrgs(
                        orgData.data.map((org: any) => ({
                            orgCode: org.organizationcode,
                            orgName: org.organizationname,
                        }))
                    );
                } else {
                    setOrgs([]);
                }
                setOrgsLoaded(true);
            } catch (err: any) {
                if (err.name !== 'AbortError') console.error('Error fetching organizations:', err);
            } finally {
                setOrgLoading(false);
            }
        };
        // Fetch organizations on page load
        fetchOrgs();
        return () => ac.abort();
    }, []);

    useEffect(() => {
        setBooks([]);
        setBook('');
        setBookIdMap({});
        setBooksLoaded(false);
        setTaxonomy('');
        setTaxonomyOptions([]);
        setTaxonomyLoaded(false);
        setQuestionType('');
        setQuestionTypeOptions([]);
        setQuestionTypeLoaded(false);
        setAppDetails('');
        setAppDetailsOptions([]);
        setAppDetailsLoaded(false);
    }, [organization]);

    useEffect(() => {
        if (!hasValidOrg) return;
        fetchAppDetailsForOrg(organization);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organization]);

    useEffect(() => {
        setBooks([]);
        setBook('');
        setBooksLoaded(false);
    }, [appDetails]);

    useEffect(() => {
        if (!hasValidOrg || !hasValidApp) return;
        fetchBooksForApp(organization, appDetails);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appDetails]);

    useEffect(() => {
        setTaxonomy('');
        setTaxonomyOptions([]);
        setTaxonomyLoaded(false);
        setQuestionType('');
        setQuestionTypeOptions([]);
        setQuestionTypeLoaded(false);
    }, [sessionStorage.getItem('custcode')]);

    // Books are fetched on dropdown open (Select onOpenChange)

    // NOTE: no auto-refresh on status change — user triggers fetch via Submit



    const handleEditSave = async () => {
        if (!editingRow) {
            setEditDialogOpen(false);
            return;
        }

        try {
            setSubsLoading(true);

            // Persist edited feedback without changing current admin status
            const { custcode, orgcode: sessionOrgCode, appcode: sessionAppCode, usercode } = getSessionCodes();
            const effectiveOrgCode = organization && organization !== 'none' ? organization : sessionOrgCode;
            const effectiveAppCode = appDetails && appDetails !== 'none' ? appDetails : sessionAppCode;

            const payload = {
                custcode,
                appcode: effectiveAppCode,
                orgcode: effectiveOrgCode,
                questionrequestid: editingRow.questionrequestid,
                questionid: editingRow.questionid,
                feedback_updated: editingFeedback || '',
                adminstatus: editingRow.admin_status ?? 0,
                approverby: usercode,
                feedback_type: editingRow.feedback_type || '',
            };

            const res = await fetch(
                `${AIG_QUIZ_GEN_URL}/update-feedback-status`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Failed to save feedback: ${res.status} ${text}`);
            }

            // Update local state so UI reflects the saved feedback
            const keyId =
                editingRow.questionrequestid ??
                editingRow.questionid ??
                editingRow.feedback_approval_id;

            setFeedbackData((prev) => {
                return prev.map((row) => {
                    const rowKey =
                        row.questionrequestid ??
                        row.questionid ??
                        row.feedback_approval_id;

                    if (rowKey === keyId) {
                        return { ...row, feedback: editingFeedback };
                    }
                    return row;
                });
            });

            setEditDialogOpen(false);
            // Clear any approve error once feedback has been edited
            setApproveError("");
        } catch (err) {
            console.error('Error saving edited feedback:', err);
        } finally {
            setSubsLoading(false);
        }
    };

    const handleApproveConfirmOk = async () => {
        if (!approveRow) {
            setApproveConfirmOpen(false);
            return;
        }

        try {
            setApproveConfirmLoading(true);
            await handleApproveFeedback(approveRow);
            // Close popup only after successful completion
            setApproveConfirmOpen(false);
            setApproveRow(null);
            setApproveConfirmTaxonomy(false);
            setApproveConfirmQuestionType(false);
        } catch (error) {
            console.error('Error during approval:', error);
            // Keep popup open on error so user can try again
            // The loader will be stopped by handleApproveFeedback's finally block
        } finally {
            setApproveConfirmLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <AppSidebar />
            <div className="ml-0 lg:ml-52 min-h-screen flex flex-col">
                {/* Header */}
                <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
                    <div className="flex h-16 items-center justify-between px-3 sm:px-6 gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="lg:hidden flex-shrink-0"
                                onClick={() => setMobileMenuOpen(true)}
                            >
                                <Menu className="h-5 w-5" />
                            </Button>
                            <div className="min-w-0 flex items-center gap-3 flex-1">
                                <h1 className="text-base sm:text-xl font-semibold text-gray-900 truncate">
                                    Feedback Management
                                </h1>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            <ProfileDropdown />
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 p-3 sm:p-6">
                    {/* Filters */}
                    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
                                <Input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
                                <Input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Organization</label>
                                <Select
                                    value={organization}
                                    onValueChange={setOrganization}
                                    onOpenChange={async (open) => {
                                        if (!open || orgsLoaded || orgLoading) return;
                                        try {
                                            setOrgLoading(true);
                                            const custcode = getCustCodeFromSession();
                                            if (!custcode) {
                                                setOrgs([]);
                                                setOrgsLoaded(true);
                                                return;
                                            }

                                            const res = await fetch(API_ENDPOINTS.GET_ORGANIZATION_DETAILS, {
                                                method: "POST",
                                                headers: {
                                                    "Content-Type": "application/json",
                                                },
                                                body: JSON.stringify({
                                                    par_custcode: custcode,
                                                }),
                                            });

                                            if (!res.ok) throw new Error("Failed to fetch organizations");
                                            const orgData = await res.json();

                                            if (Array.isArray(orgData?.data)) {
                                                setOrgs(
                                                    orgData.data.map((org: any) => ({
                                                        orgCode: org.organizationcode,
                                                        orgName: org.organizationname,
                                                        orgID: org.organizationid ?? org.orgID ?? 0,
                                                    }))
                                                );
                                            } else {
                                                setOrgs([]);
                                            }
                                            setOrgsLoaded(true);
                                        } catch (err: any) {
                                            console.error("Error fetching organizations:", err);
                                            setOrgs([]);
                                        } finally {
                                            setOrgLoading(false);
                                        }
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={orgLoading ? "Loading..." : "Select Organization"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Select Organization</SelectItem>
                                        {orgs.map((o) => (
                                            <SelectItem key={o.orgCode} value={o.orgCode}>
                                                {o.orgName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">App Details</label>
                                <Select
                                    value={appDetails}
                                    onValueChange={setAppDetails}
                                    disabled={!hasValidOrg}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={appDetailsLoading ? "Loading..." : "Select App Details"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Select App Details</SelectItem>
                                        {appDetailsOptions.map((a) => (
                                            <SelectItem key={a.appCode} value={a.appCode}>
                                                {a.appName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Book</label>
                                <Select
                                    value={book}
                                    onValueChange={setBook}
                                    disabled={!hasValidApp}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={bookLoading ? "Loading..." : "Select Book"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Select Book</SelectItem>
                                        {books.map((b) => (
                                            <SelectItem key={b} value={b}>
                                                {b}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Taxonomy</label>
                                <Select
                                    value={taxonomy}
                                    onValueChange={setTaxonomy}
                                    disabled={!hasValidApp}
                                    onOpenChange={async (open) => {
                                        if (!open || !hasValidApp || taxonomyLoaded || taxonomyLoading) return;
                                        try {
                                            setTaxonomyLoading(true);
                                            const custcode = getCustCodeFromSession();
                                            const orgcode = organization && organization !== 'none' ? organization : '';
                                            const appcode = getAppCodeFromSession();

                                            if (!custcode || !orgcode || !appcode) {
                                                setTaxonomyOptions([]);
                                                return;
                                            }

                                            console.log('Fetching taxonomy (dropdownloader) payload:', { custcode, orgcode, appcode });

                                            const res = await fetch(
                                                `${AIG_QUIZ_GEN_URL}/dropdownloader`,
                                                {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type": "application/json",
                                                    },
                                                    body: JSON.stringify({
                                                        custcode,
                                                        orgcode,
                                                        appcode,
                                                    }),
                                                }
                                            );

                                            if (!res.ok) throw new Error('Failed to fetch taxonomy');
                                            const data = await res.json();

                                            console.log('Taxonomy (dropdownloader) response:', data);

                                            const safeJsonParseArray = (raw: any): any[] => {
                                                if (!raw || typeof raw !== 'string') return [];
                                                try {
                                                    const parsed = JSON.parse(raw);
                                                    return Array.isArray(parsed) ? parsed : [];
                                                } catch {
                                                    return [];
                                                }
                                            };

                                            const getTaxonomyRows = (payload: any): any[] => {
                                                const rootArr: any[] = Array.isArray(payload)
                                                    ? payload
                                                    : (Array.isArray(payload?.data) ? payload.data : []);

                                                // dropdownloader can return an array of { type, jsonDetails }
                                                if (rootArr.length > 0 && rootArr.some((x: any) => x && typeof x === 'object' && 'type' in x && 'jsonDetails' in x)) {
                                                    const taxonomyBlock = rootArr.find((x: any) => String(x?.type || '').toLowerCase() === 'taxonomy');
                                                    if (taxonomyBlock?.jsonDetails) {
                                                        return safeJsonParseArray(taxonomyBlock.jsonDetails);
                                                    }
                                                }

                                                // fallback: if API directly returned taxonomy rows
                                                if (Array.isArray(payload?.taxonomy)) return payload.taxonomy;
                                                return [];
                                            };

                                            const rows: any[] = getTaxonomyRows(data);

                                            const options = (rows || []).map((row: any) => {
                                                const id = row?.id ?? row?.taxonomyid ?? row?.taxonomyId;
                                                const name = row?.taxonomy ?? row?.taxonomyname ?? row?.taxonomyName ?? row?.name;
                                                const valueStr = String(id ?? '').trim();
                                                const labelStr = String(name ?? '').trim();
                                                return { value: valueStr || labelStr, label: labelStr || valueStr };
                                            }).filter((o: any) => o.value && o.label);

                                            console.log('Taxonomy options mapped:', options);

                                            setTaxonomyOptions(options);
                                            setTaxonomyLoaded(true);
                                        } catch (err: any) {
                                            console.error('Error fetching taxonomy:', err);
                                            setTaxonomyOptions([]);
                                        } finally {
                                            setTaxonomyLoading(false);
                                        }
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue
                                            placeholder={
                                                !hasValidApp
                                                    ? 'Select App Details first'
                                                    : (taxonomyLoading ? 'Loading...' : 'Select Taxonomy')
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">Select Taxonomy</SelectItem>
                                        {taxonomyOptions.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>
                                                {t.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Learning Type</label>
                                <Select
                                    value={learningType}
                                    onValueChange={setLearningType}
                                    disabled={!hasValidApp}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Learning Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="question">Question</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Question Type</label>
                                <Select
                                    value={questionType}
                                    onValueChange={setQuestionType}
                                    disabled={!hasValidApp}
                                    onOpenChange={async (open) => {
                                        if (!open || !hasValidApp) return;
                                        await fetchQuestionTypes();
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue
                                            placeholder={
                                                !hasValidApp
                                                    ? 'Select App Details first'
                                                    : (questionTypeLoading ? 'Loading...' : 'Select Question Type')
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">Select Question Type</SelectItem>
                                        {questionTypeOptions.map((qt) => (
                                            <SelectItem key={qt.value} value={qt.value}>
                                                {qt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                                <Select
                                    value={statusInput}
                                    onValueChange={(val) => setStatusInput(String(val))}
                                    disabled={!hasValidApp}
                                >
                                    <SelectTrigger>
                                        <SelectValue
                                            placeholder={
                                                !hasValidApp
                                                    ? 'Select App Details first'
                                                    : 'All'
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="null">All</SelectItem>
                                        <SelectItem value="1">Approved</SelectItem>
                                        <SelectItem value="2">Rejected</SelectItem>
                                        <SelectItem value="0">Pending</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>


                            <div className="flex items-end">
                                <Button
                                    onClick={handleSubmit}
                                    disabled={feedbackLoading}
                                    className="w-full bg-[#2563eb] hover:bg-[#2563eb]/90"
                                >
                                    {feedbackLoading ? (
                                        <div className="flex items-center gap-2">
                                            <Loader size="sm" />
                                            <span>Loading...</span>
                                        </div>
                                    ) : (
                                        'Submit'
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>



                    {/* Global approve error */}
                    {approveError && (
                        <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
                            {approveError}
                        </div>
                    )}

                    {/* Data Table */}
                    {feedbackLoading ? (
                        <div className="bg-white rounded-lg shadow-sm p-8">
                            <div className="flex flex-col items-center justify-center py-12">
                                <Loader size="lg" text="Loading feedback data..." />
                            </div>
                        </div>
                    ) : hasData ? (
                        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="font-semibold">Date</TableHead>
                                        <TableHead className="font-semibold">User Name</TableHead>
                                        <TableHead className="font-semibold">Feedback</TableHead>
                                        <TableHead className="font-semibold">Rating</TableHead>
                                        <TableHead className="font-semibold">Book Name</TableHead>
                                        <TableHead className="font-semibold">Admin Status</TableHead>
                                        <TableHead className="font-semibold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {feedbackData
                                        .filter((row) => {
                                            // Use the committed status for filtering, not the live input
                                            const activeStatus = status;

                                            // If no status selected or "all" (null), show all rows
                                            if (!activeStatus || activeStatus === "null") return true;

                                            const adminStatusNum = row.admin_status;
                                            const desired = Number(activeStatus);

                                            // Pending (0): include rows where admin_status is 0 or not yet set
                                            if (desired === 0) {
                                                return adminStatusNum === 0 || adminStatusNum === null || adminStatusNum === undefined;
                                            }

                                            // Approved (1), Rejected (2), etc.: strict match on numeric value
                                            return Number(adminStatusNum) === desired;
                                        })
                                        .map((row, index) => {
                                            const key = row.feedback_approval_id || row.questionid || index;

                                            const formattedDate = (() => {
                                                if (!row.date) return '-';
                                                try {
                                                    const d = new Date(row.date);
                                                    if (isNaN(d.getTime())) return String(row.date);
                                                    const dd = String(d.getDate()).padStart(2, '0');
                                                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                                                    const yyyy = d.getFullYear();
                                                    return `${dd}/${mm}/${yyyy}`;
                                                } catch {
                                                    return String(row.date);
                                                }
                                            })();

                                            const adminStatusNum = row.admin_status;
                                            const displayStatus = adminStatusNum === 1
                                                ? 'Approved'
                                                : adminStatusNum === 2
                                                    ? 'Rejected'
                                                    : 'Pending';

                                            const isApproved = displayStatus.toLowerCase() === 'approved';
                                            const isRejected = displayStatus.toLowerCase() === 'rejected';
                                            const statusClass = isApproved
                                                ? 'bg-green-100 text-green-800'
                                                : isRejected
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-yellow-100 text-yellow-800';

                                            const userName = row.username || row.usercode || '-';
                                            const feedback = row.feedback || '-';
                                            const rating = Number(row.ratingid) || 0;
                                            const bookName = getBookNameFromId(row.booknameid);

                                            return (
                                                <TableRow key={key}>
                                                    <TableCell>{formattedDate}</TableCell>
                                                    <TableCell>{userName}</TableCell>
                                                    <TableCell>{feedback}</TableCell>
                                                    <TableCell>
                                                        {rating === 1 && (
                                                            <ThumbsUp
                                                                className="w-4 h-4 text-green-600 fill-current"
                                                                strokeWidth={0}
                                                            />
                                                        )}
                                                        {rating === 2 && (
                                                            <ThumbsDown
                                                                className="w-4 h-4 text-red-600 fill-current"
                                                                strokeWidth={0}
                                                            />
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{bookName}</TableCell>
                                                    <TableCell>
                                                        <span
                                                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusClass}`}
                                                        >
                                                            {displayStatus}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center space-x-2">
                                                            {/* Edit (always available) */}
                                                            <button
                                                                type="button"
                                                                className="p-2 rounded-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                                                                onClick={() => {
                                                                    setEditingRow(row);
                                                                    setEditingFeedback(row.feedback || "");
                                                                    setEditDialogOpen(true);
                                                                }}
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </button>

                                                            {isApproved ? (
                                                                <>
                                                                    {/* green dot for approved */}
                                                                    <span className="w-3.5 h-3.5 rounded-full bg-green-600" />
                                                                    {/* outlined red reject button */}
                                                                    <button
                                                                        type="button"
                                                                        className="p-2 rounded-full bg-white border border-red-600 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                                        onClick={() => handleRejectFeedback(row)}
                                                                        disabled={subsLoading}
                                                                    >
                                                                        <XCircle className={'w-5 h-5'} />
                                                                    </button>
                                                                </>
                                                            ) : isRejected ? (
                                                                <>
                                                                    {/* red dot for rejected */}
                                                                    <span className="w-3.5 h-3.5 rounded-full bg-red-600" />
                                                                    {/* outlined green approve button */}
                                                                    <button
                                                                        type="button"
                                                                        className="p-2 rounded-full bg-white border border-green-600 text-green-600 hover:bg-green-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                                        onClick={() => handleOpenApproveConfirm(row)}
                                                                        disabled={subsLoading}
                                                                    >
                                                                        {subsLoading ? <Loader size="sm" /> : <CheckCircle className={'w-5 h-5'} />}
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {/* Pending: show both outlined actions, no dot */}
                                                                    <button
                                                                        type="button"
                                                                        className="p-2 rounded-full bg-white border border-green-600 text-green-600 hover:bg-green-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                                        onClick={() => handleOpenApproveConfirm(row)}
                                                                        disabled={subsLoading}
                                                                    >
                                                                        {subsLoading ? <Loader size="sm" /> : <CheckCircle className={'w-5 h-5'} />}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="p-2 rounded-full bg-white border border-red-600 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                                        onClick={() => handleRejectFeedback(row)}
                                                                        disabled={subsLoading}
                                                                    >
                                                                        {subsLoading ? <Loader size="sm" /> : <XCircle className={'w-5 h-5'} />}
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg shadow-sm p-8">
                            <div className="text-center text-gray-500 py-8">
                                No feedback data found
                            </div>
                        </div>
                    )}

                    {editDialogOpen && editingRow && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-lg font-semibold text-gray-900">Edit Feedback</h2>
                                    <button
                                        type="button"
                                        className="p-1 rounded-full hover:bg-gray-100"
                                        onClick={() => setEditDialogOpen(false)}
                                    >
                                        <XCircle className="w-5 h-5 text-gray-500" />
                                    </button>
                                </div>

                                <div className="space-y-3 text-sm">
                                    <div>
                                        <span className="font-medium text-gray-700">UserName:</span>{' '}
                                        <span className="text-gray-900">{editingRow.username || editingRow.userName || editingRow.usercode || '-'}</span>
                                    </div>
                                    <div>
                                        <span className="font-medium text-gray-700">Question:</span>
                                        <p className="mt-1 text-gray-900 text-xs border rounded-md p-2 bg-gray-50 max-h-32 overflow-auto">
                                            {editingRow.questionname || '-'}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700">Feedback</label>
                                    <textarea
                                        className="w-full min-h-[80px] text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        value={editingFeedback}
                                        onChange={(e) => setEditingFeedback(e.target.value)}
                                    />
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button
                                        variant="outline"
                                        type="button"
                                        onClick={() => setEditDialogOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        className="bg-blue-600 hover:bg-blue-700"
                                        onClick={handleEditSave}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {approveConfirmOpen && approveRow && (
                        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
                            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
                                <h2 className="text-base font-semibold text-gray-900 mb-1">Confirm Approval</h2>
                                <p className="text-xs text-gray-600 mb-2">
                                    Please confirm the following before approving this feedback.
                                </p>

                                <div className="space-y-2 text-sm">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={approveConfirmTaxonomy}
                                            onChange={(e) => setApproveConfirmTaxonomy(e.target.checked)}
                                        />
                                        <span className="text-gray-800">Taxonomy</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={approveConfirmQuestionType}
                                            onChange={(e) => setApproveConfirmQuestionType(e.target.checked)}
                                        />
                                        <span className="text-gray-800">Question Type</span>
                                    </label>
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button
                                        variant="outline"
                                        type="button"
                                        onClick={() => {
                                            setApproveConfirmOpen(false);
                                            setApproveRow(null);
                                            setApproveConfirmTaxonomy(false);
                                            setApproveConfirmQuestionType(false);
                                            setApproveError("");
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                        disabled={subsLoading || approveConfirmLoading || (!approveConfirmTaxonomy && !approveConfirmQuestionType)}
                                        onClick={handleApproveConfirmOk}
                                    >
                                        {approveConfirmLoading ? (
                                            <div className="flex items-center gap-2">
                                                <Loader size="sm" />
                                                <span>Processing...</span>
                                            </div>
                                        ) : (
                                            'OK'
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                </main>
            </div>

            {/* Screen blur overlay for approve confirmation loading */}
            {approveConfirmLoading && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-white rounded-lg shadow-xl p-6 flex flex-col items-center space-y-4">
                        <Loader size="lg" text="Processing approval..." />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Feedback_approval;
