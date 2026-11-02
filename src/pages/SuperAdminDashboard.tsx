import { useState, useEffect } from "react";
import { Menu, CheckCircle, XCircle, FileSearch, AlertCircle } from "lucide-react";
import { API_BASE_URL } from '@/api';
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
import { SuperAdminSidebar } from "../components/SuperAdminSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface Org {
    orgCode: string;
    orgID: number;
    orgName: string;
}

const SuperAdminDashboard = () => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const [fromDate, setFromDate] = useState(today);
    const [toDate, setToDate] = useState(today);
    const [organization, setOrganization] = useState("");
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [orgLoading, setOrgLoading] = useState(false);
    const [subsLoading, setSubsLoading] = useState(false);
    const [subscriptionData, setSubscriptionData] = useState<any[]>([]);
   
    // live input for status select (doesn't apply until Submit)
    const [statusInput, setStatus] = useState("");
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

    const handleSubmit = () => {
        if (!organization || organization === "none") {
            setShowError(true);
            setHasData(false);
        } else {
            setShowError(false);
            // commit live inputs and fetch with committed values
            setSearchQuery(searchInput);
            setStatus(statusInput);
            fetchSubscriptions(searchInput, statusInput);
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
            const statusParam = (!statusToUse || statusToUse === 'null' ) ? '' : String(statusToUse);
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
                const res = await fetch(`${API_BASE_URL}/aiapps/AIProductApi/organization_details`, { signal: ac.signal });
                if (!res.ok) throw new Error('Failed to fetch organizations');
                const data = await res.json();
                // API sometimes returns an object with `organization_details: [...]`
                if (Array.isArray(data)) {
                    setOrgs(data);
                } else if (data && Array.isArray((data as any).organization_details)) {
                    setOrgs((data as any).organization_details);
                } else {
                    setOrgs([]);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') console.error('Error fetching organizations:', err);
            } finally {
                setOrgLoading(false);
            }
        };
        fetchOrgs();
        return () => ac.abort();
    }, []);

    // NOTE: no auto-refresh on status change — user triggers fetch via Submit

    const mockData = [
        {
            date: "02/18/2025 9:19 AM",
            userName: "Madhuri R",
            contactDetails: "8660554859",
            emailId: "madhuri.r@excelindia.com",
            applicationName: "Item Generation",
            adminStatus: "Approved"
        },
        {
            date: "02/17/2025 3:45 PM",
            userName: "Rajesh K",
            contactDetails: "9876543210",
            emailId: "rajesh.k@excelindia.com",
            applicationName: "Essay Evaluation",
            adminStatus: "Rejected"
        },
        {
            date: "02/16/2025 11:30 AM",
            userName: "Priya S",
            contactDetails: "8765432109",
            emailId: "priya.s@excelindia.com",
            applicationName: "Doc Chat",
            adminStatus: "Approved"
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Desktop Sidebar */}
            <div className="fixed left-0 top-0 h-full w-52 z-40 hidden lg:block">
                <SuperAdminSidebar />
            </div>

            {/* Mobile Menu Sheet */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetContent side="left" className="w-64 p-0">
                    <SuperAdminSidebar onNavigate={() => setMobileMenuOpen(false)} />
                </SheetContent>
            </Sheet>

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
                                    Subscription Management
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
                                <Select value={organization} onValueChange={setOrganization}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Organization" />
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                                <Select value={statusInput} onValueChange={(val) => setStatus(String(val))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="null">All</SelectItem>
                                        <SelectItem value="1">Approved</SelectItem>
                                        <SelectItem value="2">Rejected</SelectItem>
                                        <SelectItem value="0">Pending</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                                <Input
                                        placeholder="Search..."
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                        className="w-full"
                                    />
                            </div>

                            <div className="flex items-end">
                                <Button
                                    onClick={handleSubmit}
                                    className="w-full bg-[#2563eb] hover:bg-[#2563eb]/90"
                                >
                                    Submit
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Error State */}
                    {showError && (
                        <div className="bg-white rounded-lg shadow-sm p-8 flex items-center justify-center animate-fade-in">
                            <div className="text-center max-w-lg">
                                <div className="relative mx-auto w-20 h-20 mb-4">
                                    {/* Animated background circles */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-100 to-red-100 rounded-full animate-pulse opacity-50"></div>
                                    <div className="absolute inset-2 bg-white rounded-full"></div>

                                    {/* Icon container */}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="relative">
                                            <FileSearch className="w-10 h-10 text-orange-500" strokeWidth={1.5} />
                                            <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5">
                                                <AlertCircle className="w-4 h-4 text-red-500" fill="currentColor" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    No Subscription Details Found
                                </h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    We couldn't find any subscription details for the selected criteria. Please try selecting a different organization or adjusting your date range.
                                </p>

                                <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-3">
                                    <div className="flex items-start gap-2 text-left">
                                        <div className="flex-shrink-0 mt-0.5">
                                            <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
                                                <span className="text-white text-[10px] font-bold">!</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-orange-900 mb-0.5">Quick Tip</p>
                                            <p className="text-xs text-orange-700">
                                                Select an organization from the dropdown and verify the date range.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Data Table */}
                    {hasData && (
                        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="font-semibold">Date</TableHead>
                                        <TableHead className="font-semibold">User Name</TableHead>
                                        <TableHead className="font-semibold">Contact Details</TableHead>
                                        <TableHead className="font-semibold">Email Id</TableHead>
                                        <TableHead className="font-semibold">Application Name</TableHead>
                                        <TableHead className="font-semibold">Admin Status</TableHead>
                                        <TableHead className="font-semibold">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(subscriptionData.length ? subscriptionData : mockData)
                                        .filter((row) => {
                                            // if status is unset/empty treat as all
                                            if (!status) return true;
                                            // prefer numeric requestStatus when available
                                            if (row.requestStatus !== undefined && row.requestStatus !== null) {
                                                return row.requestStatus.toString() === status.toString();
                                            }
                                            // fallback to legacy fields
                                            const adminStatus = (row.adminStatus || row.status || '').toString().toLowerCase();
                                            return adminStatus === status.toString().toLowerCase();
                                        })
                                        .filter((row) => {
                                            if (!searchQuery) return true;
                                            const searchLower = searchQuery.toLowerCase();
                                            const userName = (row.userName || row.username || row.UserNameDetails || '').toString().toLowerCase();
                                            const emailId = (row.emailID || row.emailId || row.email || '').toString().toLowerCase();
                                            const appName = (row.applicationName || row.appName || row.application || row.appCode || '').toString().toLowerCase();
                                            return (
                                                userName.includes(searchLower) ||
                                                emailId.includes(searchLower) ||
                                                appName.includes(searchLower)
                                            );
                                        })
                                        .map((row, index) => {
                                            const key = row.requestID || row.requestId || row.id || index;
                                            // Format date as dd/mm/yyyy hh:MM AM/PM
                                            const formatDDMMYYYY_HHMM_AMPM = (val: any): string => formatToIST_DDMMYYYY_HHMM_AMPM(val);

                                            let formattedDate = '-';
                                            if (row.requestDate) {
                                                formattedDate = formatDDMMYYYY_HHMM_AMPM(row.requestDate);
                                            } else if (row.date) {
                                                // Attempt to parse fallback `date` field
                                                formattedDate = formatDDMMYYYY_HHMM_AMPM(row.date);
                                            }
                                            const displayStatus = row.requestStatus !== undefined && row.requestStatus !== null
                                                ? (row.requestStatus === 1 ? 'Approved' : row.requestStatus === 2 ? 'Rejected' : 'Pending')
                                                : (row.adminStatus || row.status || '-');
                                            const isApproved = displayStatus.toString().toLowerCase() === 'approved';
                                            const isRejected = displayStatus.toString().toLowerCase() === 'rejected';
                                            const statusClass = isApproved
                                                ? 'bg-green-100 text-green-800'
                                                : isRejected
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-yellow-100 text-yellow-800';

                                            return (
                                                <TableRow key={key}>
                                                    <TableCell>{formattedDate}</TableCell>
                                                    <TableCell>{row.userName || row.username || row.UserNameDetails || '-'}</TableCell>
                                                    <TableCell>{row.contactNumber || row.contactDetails || row.contact || '-'}</TableCell>
                                                    <TableCell>{row.emailID || row.emailId || row.email || '-'}</TableCell>
                                                    <TableCell>{row.applicationName || row.appName || row.application || row.appCode || '-'}</TableCell>
                                                    <TableCell>
                                                        <span
                                                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusClass}`}
                                                        >
                                                            {displayStatus}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center space-x-2">
                                                            {isApproved ? (
                                                                <>
                                                                    {/* small green dot for approved */}
                                                                    <span className="w-3.5 h-3.5 rounded-full bg-green-600" />
                                                                    {/* show Reject action as outlined to allow reversing */}
                                                                    <button
                                                                        type="button"
                                                                        aria-label="Reject"
                                                                        title="Reject"
                                                                        className={'p-2 rounded-full bg-white border border-red-600 text-red-600 hover:bg-red-50 transition-colors'}
                                                                        onClick={() => {
                                                                            const rid = row.requestID || row.requestId || row.id;
                                                                            const appcode = (row.appCode || row.appcode || row.applicationCode || row.applicationName || row.appName || '').toString();
                                                                            const currentStatus = (row.requestStatus !== undefined && row.requestStatus !== null)
                                                                                ? Number(row.requestStatus)
                                                                                : (row.adminStatus ? (row.adminStatus.toString().toLowerCase() === 'approved' ? 1 : row.adminStatus.toString().toLowerCase() === 'rejected' ? 2 : null) : null);
                                                                            if (rid) {
                                                                                if (currentStatus === 2) return;
                                                                                updateSubscriptionStatus(rid, 2, appcode);
                                                                            }
                                                                        }}
                                                                        disabled={subsLoading}
                                                                    >
                                                                        <XCircle className={'w-5 h-5'} />
                                                                    </button>
                                                                </>
                                                            ) : isRejected ? (
                                                                <>
                                                                    {/* small red dot for rejected */}
                                                                    <span className="w-3.5 h-3.5 rounded-full bg-red-600" />
                                                                    {/* show Approve action as outlined to allow reversing */}
                                                                    <button
                                                                        type="button"
                                                                        aria-label="Approve"
                                                                        title="Approve"
                                                                        className={'p-2 rounded-full bg-white border border-green-600 text-green-600 hover:bg-green-50 transition-colors'}
                                                                        onClick={() => {
                                                                            const rid = row.requestID || row.requestId || row.id;
                                                                            const appcode = (row.appCode || row.appcode || row.applicationCode || row.applicationName || row.appName || '').toString();
                                                                            const currentStatus = (row.requestStatus !== undefined && row.requestStatus !== null)
                                                                                ? Number(row.requestStatus)
                                                                                : (row.adminStatus ? (row.adminStatus.toString().toLowerCase() === 'approved' ? 1 : row.adminStatus.toString().toLowerCase() === 'rejected' ? 2 : null) : null);
                                                                            if (rid) {
                                                                                if (currentStatus === 1) return;
                                                                                updateSubscriptionStatus(rid, 1, appcode);
                                                                            }
                                                                        }}
                                                                        disabled={subsLoading}
                                                                    >
                                                                        <CheckCircle className={'w-5 h-5'} />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {/* Pending: show both outlined actions */}
                                                                    <button
                                                                        type="button"
                                                                        aria-label="Approve"
                                                                        title="Approve"
                                                                        className={'p-2 rounded-full bg-white border border-green-600 text-green-600 hover:bg-green-50 transition-colors'}
                                                                        onClick={() => {
                                                                            const rid = row.requestID || row.requestId || row.id;
                                                                            const appcode = (row.appCode || row.appcode || row.applicationCode || row.applicationName || row.appName || '').toString();
                                                                            const currentStatus = (row.requestStatus !== undefined && row.requestStatus !== null)
                                                                                ? Number(row.requestStatus)
                                                                                : (row.adminStatus ? (row.adminStatus.toString().toLowerCase() === 'approved' ? 1 : row.adminStatus.toString().toLowerCase() === 'rejected' ? 2 : null) : null);
                                                                            if (rid) {
                                                                                if (currentStatus === 1) return;
                                                                                updateSubscriptionStatus(rid, 1, appcode);
                                                                            }
                                                                        }}
                                                                        disabled={subsLoading}
                                                                    >
                                                                        <CheckCircle className={'w-5 h-5'} />
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        aria-label="Reject"
                                                                        title="Reject"
                                                                        className={'p-2 rounded-full bg-white border border-red-600 text-red-600 hover:bg-red-50 transition-colors'}
                                                                        onClick={() => {
                                                                            const rid = row.requestID || row.requestId || row.id;
                                                                            const appcode = (row.appCode || row.appcode || row.applicationCode || row.applicationName || row.appName || '').toString();
                                                                            const currentStatus = (row.requestStatus !== undefined && row.requestStatus !== null)
                                                                                ? Number(row.requestStatus)
                                                                                : (row.adminStatus ? (row.adminStatus.toString().toLowerCase() === 'approved' ? 1 : row.adminStatus.toString().toLowerCase() === 'rejected' ? 2 : null) : null);
                                                                            if (rid) {
                                                                                if (currentStatus === 2) return;
                                                                                updateSubscriptionStatus(rid, 2, appcode);
                                                                            }
                                                                        }}
                                                                        disabled={subsLoading}
                                                                    >
                                                                        <XCircle className={'w-5 h-5'} />
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
                    )}

                    {/* Initial State */}
                    {!hasData && !showError && (
                        <div className="bg-white rounded-lg shadow-sm p-8 flex items-center justify-center animate-fade-in">
                            <div className="text-center max-w-lg">
                                <div className="relative mx-auto w-20 h-20 mb-4">
                                    {/* Animated background circles */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-100 to-red-100 rounded-full animate-pulse opacity-50"></div>
                                    <div className="absolute inset-2 bg-white rounded-full"></div>

                                    {/* Icon container */}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="relative">
                                            <FileSearch className="w-10 h-10 text-orange-500" strokeWidth={1.5} />
                                            <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5">
                                                <AlertCircle className="w-4 h-4 text-red-500" fill="currentColor" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    No Subscription Details Found
                                </h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    We couldn't find any subscription details for the selected criteria. Please try selecting a different organization or adjusting your date range.
                                </p>

                                <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-3">
                                    <div className="flex items-start gap-2 text-left">
                                        <div className="flex-shrink-0 mt-0.5">
                                            <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
                                                <span className="text-white text-[10px] font-bold">!</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-orange-900 mb-0.5">Quick Tip</p>
                                            <p className="text-xs text-orange-700">
                                                Select an organization from the dropdown and verify the date range.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
