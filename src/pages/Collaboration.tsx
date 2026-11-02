import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Search, Edit, Trash2, Package, Menu, Plus, Users as UsersIcon, X, CheckCircle, Lock } from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { subscribeToApp, API_APPS_URL } from '@/api';
import { AppSidebar } from "@/components/AppSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { LevelFormat } from "docx";

interface User {
    id: number | string;
    firstName: string;
    lastName: string;
    loginName: string;
    emailId: string;
    userCode?: string;
    contactNumber?: string;
}

const mockUsers: User[] = [

];

const Collaboration = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<number | string | null>(null);
    const [selectedUserCode, setSelectedUserCode] = useState<string | null>(null);
    const [editingUserId, setEditingUserId] = useState<number | string | null>(null);
    const [deletingUser, setDeletingUser] = useState<User | null>(null);
    const [deletingLoading, setDeletingLoading] = useState(false);
    const [users, setUsers] = useState<User[]>(mockUsers);
    const [appDetails, setAppDetails] = useState<any[]>([]);
    const [taggedMap, setTaggedMap] = useState<Record<string, boolean>>({});
    const selectedMapRef = useRef<Record<string, string>>({});
    const [selectedAppCodes, setSelectedAppCodes] = useState<string[]>([]);
    const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
    // helper to produce a stable id for apps
    const getAppId = (app: any, idx?: number) => String(app?.appCode ?? app?.appID ?? app?.applicationName ?? app?.appName ?? app?.name ?? idx ?? '');
    const [appLoading, setAppLoading] = useState(false);
    const [appError, setAppError] = useState<string | null>(null);
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        email: "",
        userName: "",
        password: "",
        confirmPassword: "",
        contactNumber: "",
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [showErrors, setShowErrors] = useState(false);

    // Removed sessionStorage draft behavior to avoid retaining previous values
    const [saving, setSaving] = useState(false);
    const [apiDialogOpen, setApiDialogOpen] = useState(false);
    const [apiDialogMessage, setApiDialogMessage] = useState('');
    const [apiDialogTitle, setApiDialogTitle] = useState('');
    const [apiDialogSuccess, setApiDialogSuccess] = useState(false);

    // Tag/Untag confirmation dialog
    const [actionDialogOpen, setActionDialogOpen] = useState(false);
    const [actionDialogTitle, setActionDialogTitle] = useState('');
    const [actionDialogMessage, setActionDialogMessage] = useState('');

    const validateForm = (): Record<string, string> => {
        const e: Record<string, string> = {};
        const f = (formData.firstName || '').trim();
        const l = (formData.lastName || '').trim();
        const u = (formData.userName || '').trim();
        const em = (formData.email || '').trim();
        const p = formData.password || '';
        const cp = formData.confirmPassword || '';
        const hasAlphaNum = (s: string) => /[A-Za-z0-9]/.test(s);
        const onlyLettersSpaces = (s: string) => /^[A-Za-z ]+$/.test(s);
        const hasVowel = (s: string) => /[AEIOUaeiou]/.test(s);
        const hasLongRepeat = (s: string) => /(.)\1{3,}/.test(s); // 4+ same chars in a row is junky

        if (!f) e.firstName = 'First name is required';
        else if (f.length > 60) e.firstName = 'First name must be at most 60 characters';
        else if (!onlyLettersSpaces(f)) e.firstName = 'Only letters and spaces are allowed';
        else if (!hasVowel(f)) e.firstName = 'Enter a real-looking first name';
        else if (hasLongRepeat(f)) e.firstName = 'Avoid repeated characters';

        if (l && l.length > 60) e.lastName = 'Last name must be at most 60 characters';
        else if (l && !onlyLettersSpaces(l)) e.lastName = 'Only letters and spaces are allowed';
        else if (l && !hasVowel(l)) e.lastName = 'Enter a real-looking last name';
        else if (l && hasLongRepeat(l)) e.lastName = 'Avoid repeated characters';

        if (!u) e.userName = 'User name is required';
        else if (u.length > 20) e.userName = 'User name must be at most 20 characters';
        else if (!/^[A-Za-z0-9._-]+$/.test(u)) e.userName = 'Only letters, numbers, . _ - allowed';
        else if (!/[A-Za-z]/.test(u)) e.userName = 'Username must include letters';
        else if (hasLongRepeat(u)) e.userName = 'Avoid repeated characters';

        // Email rules:
        // - local part (before @) up to 60 characters
        // - domain must contain a dot
        // - top-level part (after final dot) 1-5 alphabetic chars
        const emailRegex = /^([^\s@]{1,60})@([A-Za-z0-9.-]+\.[A-Za-z]{1,5})$/;
        if (!em) e.email = 'Email is required';
        else if (!emailRegex.test(em)) e.email = 'Enter a valid email address (local ≤60 chars, TLD ≤5 chars)';

        // Password rules: when creating (no editing id) password required; when editing, password optional
        if (!editingUserId) {
            if (!p) e.password = 'Password is required';
            else if (p.length > 20) e.password = 'Password must be at most 20 characters';
            if (p !== cp) e.confirmPassword = 'Passwords do not match';
        } else {
            if (p) {
                if (p.length > 20) e.password = 'Password must be at most 20 characters';
                if (p !== cp) e.confirmPassword = 'Passwords do not match';
            }
        }

        // Contact number: optional, but if provided must be 10-13 digits (optional leading '+')
        const phoneRegex = /^\+?\d{10,12}$/;
        const cn = (formData.contactNumber || '').trim();
        if (cn && !phoneRegex.test(cn)) {
            e.contactNumber = 'Contact number must be 10–12 digits (optional leading +)';
        }

        return e;
    };

    // keep errors in sync but control display with `touched` or `showErrors`
    useEffect(() => {
        try { setErrors(validateForm()); } catch (_) { }
    }, [formData, editingUserId]);

    const sanitizeName = (v: string) => v.replace(/[^A-Za-z\s]/g, '');
    const sanitizeUsername = (v: string) => v.replace(/[^A-Za-z0-9._-]/g, '');
    const sanitizeContact = (v: string) => {
        // Allow optional single leading '+' and strip non-digits; limit to 13 digits
        if (!v) return v;
        if (v.startsWith('+')) {
            let rest = v.slice(1).replace(/\D+/g, '');
            rest = rest.slice(0, 13);
            return '+' + rest;
        }
        return v.replace(/\D+/g, '').slice(0, 13);
    };
    const handleInputChange = (field: string, value: string) => {
        // Prevent edits to username/password fields in edit mode
        if (editingUserId && (field === 'userName' || field === 'password' || field === 'confirmPassword')) {
            return;
        }
        let next = value;
        if (field === 'firstName' || field === 'lastName') {
            next = sanitizeName(value);
        } else if (field === 'userName') {
            next = sanitizeUsername(value);
        } else if (field === 'contactNumber') {
            next = sanitizeContact(value);
        }
        setFormData(prev => ({ ...prev, [field]: next }));
        setTouched(prev => ({ ...prev, [field]: true }));
    };

    const handleEditUser = (user: typeof users[0]) => {
        setEditingUserId(user.id);
        setFormData({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.emailId,
            userName: user.loginName,
            // Show masked password placeholders in edit mode (non-editable)
            password: "********",
            confirmPassword: "********",
            contactNumber: (user as any).contactNumber || (user as any).contactnumber || (user as any).contact || "",
        });
        setTouched({});
        setShowErrors(false);
        setIsAddingUser(true);
    };

    const handleSaveUser = () => {
        // mark that we should show validation errors now
        setShowErrors(true);
        // keep latest validation resultF
        const e = validateForm();
        setErrors(e);
        if (Object.keys(e).length > 0) return;

        // POST signup payload to backend and refresh users
        const doSave = async () => {
            const { adminUserID, orgCode } = getSessionAdminInfo();
            const payload = {
                firstname: formData.firstName,
                lastname: formData.lastName,
                email: formData.email,
                contactnumber: formData.contactNumber,
                orgname: orgCode || '',
                username: formData.userName,
                password: formData.password,
                createdBy: adminUserID || '',
                userID: editingUserId ? Number(editingUserId) : 0,
            } as any;

            setSaving(true);
            try {
                const url = `${API_APPS_URL}/signup`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                let result: any = null;
                try { result = await res.json(); } catch (e) { }

                if (!res.ok) {
                    const txt = result?.message || (await res.text().catch(() => '')) || `Signup failed: ${res.status}`;
                    setApiDialogTitle('Error');
                    setApiDialogMessage(txt);
                    setApiDialogSuccess(false);
                    setApiDialogOpen(true);
                    return;
                }

                const isUpdate = !!editingUserId;
                const status = result?.status;
                if (status === 'S001' && !isUpdate) {
                    await fetchUsers();
                    setApiDialogTitle('Success');
                    setApiDialogMessage(result?.message || 'The user created successfully.');
                    setApiDialogSuccess(true);
                    setApiDialogOpen(true);
                } else if (status === 'S002' && isUpdate) {
                    // Optimistically update the edited user locally so the table reflects immediately
                    setUsers(prev => prev.map(u =>
                        String(u.id) === String(editingUserId)
                            ? { ...u, firstName: formData.firstName, lastName: formData.lastName, emailId: formData.email }
                            : u
                    ));
                    // Also refresh from server to stay in sync
                    await fetchUsers();
                    setApiDialogTitle('Success');
                    setApiDialogMessage(result?.message || 'User updated successfully.');
                    setApiDialogSuccess(true);
                    setApiDialogOpen(true);
                } else if (status === 'FC001' && isUpdate) {
                    // Optimistically update the edited user locally so the table reflects immediately
                    setUsers(prev => prev.map(u =>
                        String(u.id) === String(editingUserId)
                            ? { ...u, firstName: formData.firstName, lastName: formData.lastName, emailId: formData.email }
                            : u
                    ));
                    await fetchUsers();
                    setApiDialogTitle('Success');
                    setApiDialogMessage('User updated successfully.');
                    setApiDialogSuccess(true);
                    setApiDialogOpen(true);
                } else if (status === 'S002' && !isUpdate) {
                    setApiDialogTitle('Error');
                    setApiDialogMessage('Missing Credentials in the fields');
                    setApiDialogSuccess(false);
                    setApiDialogOpen(true);
                } else {
                    const code = result?.status;
                    let msg = result?.message || 'User already exists.';
                    if (code === 'FL001') msg = result?.message || 'User already exists.';
                    else if (code === 'LO001') msg = result?.message || 'Login name already exists.';
                    else if (code === 'EM001') msg = result?.message || 'Email already exists.';
                    else if (code === 'O001') msg = result?.message || 'Organization already exists.';
                    else if (!result) msg = 'Unexpected response from server.';

                    setApiDialogTitle('Error');
                    setApiDialogMessage(msg);
                    setApiDialogSuccess(false);
                    setApiDialogOpen(true);
                }
            } catch (err: any) {
                console.error('Error in signup:', err);
                setApiDialogTitle('Error');
                setApiDialogMessage(err?.message || 'Failed to save user.');
                setApiDialogSuccess(false);
                setApiDialogOpen(true);
            } finally {
                setSaving(false);
            }
        };

        doSave();
    };

    // Helper to extract adminUserID and orgCode from sessionStorage
    const getSessionAdminInfo = () => {
        let adminUserID = sessionStorage.getItem('adminUserID') || sessionStorage.getItem('adminUserId') || '';
        let orgCode = sessionStorage.getItem('orgCode') || sessionStorage.getItem('orgcode') || '';

        const jsonKeys = ['user', 'userInfo', 'userDetails', 'userData'];
        for (const key of jsonKeys) {
            const raw = sessionStorage.getItem(key);
            if (!raw) continue;
            try {
                const obj = JSON.parse(raw);
                if (!obj || typeof obj === 'string') continue;
                if (!adminUserID) adminUserID = obj.adminUserID || obj.adminUserId || obj.userCode || obj.usercode || '';
                if (!orgCode) orgCode = obj.orgCode || obj.orgcode || '';
            } catch (e) {
                continue;
            }
        }

        return { adminUserID: adminUserID || '', orgCode: orgCode || '' };
    };

    // Fetch user details from backend and populate `users`
    // centralized fetch function so other handlers can refresh the user list
    const fetchUsers = async (signal?: AbortSignal) => {
        try {
            const { adminUserID, orgCode } = getSessionAdminInfo();
            if (!adminUserID || !orgCode) return; // nothing to fetch

            const url = `${API_APPS_URL}/GetUserDetails`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminUserID, orgCode }),
                signal,
            });

            if (!res.ok) throw new Error(`Failed to fetch user details: ${res.status}`);
            const data = await res.json();

            let items: any[] = [];
            if (Array.isArray(data)) items = data;
            else if (Array.isArray((data as any).users)) items = (data as any).users;
            else if (Array.isArray((data as any).data)) items = (data as any).data;
            else if (Array.isArray((data as any).result)) items = (data as any).result;

            const mapped: User[] = items.map((it: any, idx: number) => ({
                id: it.id || it.userID || it.userId || idx + 1,
                firstName: it.firstName || it.first_name || it.name || it.userName || it.loginName || '',
                // include `lstName` (API uses this field) as a fallback
                lastName: it.lastName || it.last_name || it.lstName || it.lastname || it.surname || '',
                loginName: it.loginName || it.login_name || it.userName || it.login || '',
                emailId: it.emailId || it.emailID || it.email || it.emailAddress || '',
                userCode: it.userCode || it.usercode || '',
                contactNumber: it.contactNumber || it.contactnumber || it.contact || it.contactDetails || it.contactdetails || ''
            }));

            if (mapped.length) {
                setUsers(mapped);
                // store a sensible userCode and userID(s) in sessionStorage for later use
                // prefer loginName, then email, then id for userCode
                try {
                    const first = mapped[0];
                    const uc = first.loginName || first.emailId || String(first.id || '');
                    if (uc) sessionStorage.setItem('userCode', uc);

                    // store primary userID (first user's id) and all user ids array
                    if (first.id !== undefined && first.id !== null) {
                        sessionStorage.setItem('userID', String(first.id));
                    }
                    const allIds = mapped.map(u => String(u.id || ''));
                    sessionStorage.setItem('userIDs', JSON.stringify(allIds));
                } catch (e) {
                    // ignore storage errors
                }
            }
        } catch (err) {
            console.error('Error fetching GetUserDetails:', err);
            // keep mockUsers as fallback
        }
    };

    useEffect(() => {
        const ac = new AbortController();
        fetchUsers(ac.signal);
        return () => ac.abort();
    }, []);

    // Keep header checkbox indeterminate state in sync
    useEffect(() => {
        const ref = headerCheckboxRef.current;
        if (!ref) return;
        if (selectedAppCodes.length > 0 && selectedAppCodes.length < appDetails.length) {
            ref.indeterminate = true;
        } else {
            ref.indeterminate = false;
        }
    }, [selectedAppCodes, appDetails.length]);

    // Fetch app details for a selected user when subscription dialog opens
    // reusable function to fetch app details for the currently selected user
    const fetchAppDetailsForUser = async (signal?: AbortSignal) => {
        setAppLoading(true);
        setAppError(null);
        try {
            const { adminUserID, orgCode } = getSessionAdminInfo();
            if (!adminUserID || !orgCode) {
                setAppError('Missing adminUserID or orgCode in session');
                setAppLoading(false);
                return;
            }

            // find the selected user to derive usercode
            const selected = users.find(u => String(u.id) === String(selectedUserId));
            // prefer explicit session-stored userCode (e.g., 'sac645'), then selected user's login/email/id
            const sessionUserCode = sessionStorage.getItem('userCode') || '';
            // Try to get userCode from a richer user object, if available via session
            let selectedUserCodeFromSessionJson = '';
            try {
                const rawUser = sessionStorage.getItem('user') || sessionStorage.getItem('userInfo') || sessionStorage.getItem('userDetails') || sessionStorage.getItem('userData');
                if (rawUser) {
                    const obj = JSON.parse(rawUser);
                    selectedUserCodeFromSessionJson = obj?.userCode || obj?.usercode || '';
                }
            } catch { }
            // Build the final selected usercode value with fallbacks
            const selectedusercode = (
                selectedUserCode /* react state set when clicking subscriptions */
                || selectedUserCodeFromSessionJson
                || sessionUserCode
                || (selected ? (selected as any).userCode : '')
                || (selected ? selected.loginName : '')
                || (selected ? selected.emailId : '')
                || (selected ? String(selected.id || '') : '')
                || 'sac645'
            );

            const params = new URLSearchParams();
            // Resolve usercode with priority: selectedUserCode -> session.userCode -> selected user's login/email/id -> fallback 'sac645'

            params.append('usercode', selectedusercode);
            params.append('orgcode', orgCode || '');
            params.append('subscription', '2');
            params.append('adminusercode', adminUserID || '');

            const url = `${API_APPS_URL}/get_app_details?${params.toString()}`;
            // debug: log the outgoing URL and resolved usercode
            try { console.debug('Fetching app details:', url, 'resolved usercode:', selectedusercode); } catch (e) { }
            const res = await fetch(url, { signal });
            try { console.debug('get_app_details response status:', res.status); } catch (e) { }
            if (!res.ok) throw new Error(`Failed to fetch app details: ${res.status}`);
            const data = await res.json();

            let items: any[] = [];
            const maybeArray = (v: any) => Array.isArray(v) && v.length >= 0;

            if (maybeArray(data)) items = data;
            else if (maybeArray((data as any).data)) items = (data as any).data;
            else if (maybeArray((data as any).result)) items = (data as any).result;
            else if (maybeArray((data as any).appDetails)) items = (data as any).appDetails;
            else if (maybeArray((data as any).app_details)) items = (data as any).app_details;
            else if (maybeArray((data as any).application_details)) items = (data as any).application_details;
            else if ((data as any).appDetails && typeof (data as any).appDetails === 'object' && maybeArray((data as any).appDetails.items)) items = (data as any).appDetails.items;

            if (!items.length && data && typeof data === 'object') {
                const candidateKeys = ['applicationName', 'appName', 'name', 'appCode', 'appID'];
                const looksLikeApp = (obj: any) => obj && typeof obj === 'object' && candidateKeys.some(k => k in obj);
                if (looksLikeApp(data)) items = [data as any];
                else if (looksLikeApp((data as any).data)) items = Array.isArray((data as any).data) ? (data as any).data : [(data as any).data];
            }

            const withIds = (items || []).map((it: any, i: number) => ({ ...it, __id: getAppId(it, i) }));

            setAppDetails(withIds);
            setSelectedAppCodes((prev) => {
                const keep: string[] = [];
                const missing: string[] = [];
                prev.forEach(id => {
                    if (withIds.some((it: any) => it.__id === id)) keep.push(id);
                    else missing.push(id);
                });
                missing.forEach(m => {
                    const mappedCode = selectedMapRef.current[m];
                    if (!mappedCode) return;
                    const found = withIds.find((it: any) => (it.appCode === mappedCode) || (String(it.appID) === String(mappedCode)) || (it.applicationName === mappedCode));
                    if (found && found.__id) keep.push(found.__id);
                });
                const unique = Array.from(new Set(keep));
                const newRef: Record<string, string> = {};
                unique.forEach(id => {
                    const app = withIds.find((it: any) => it.__id === id);
                    if (app) newRef[id] = app.appCode || app.appID || app.applicationName || '';
                });
                selectedMapRef.current = newRef;
                return unique;
            });

            setTaggedMap((prevMap) => {
                const map: Record<string, boolean> = {};
                withIds.forEach((it: any) => {
                    if (!it || !it.__id) return;
                    map[it.__id] = prevMap && (it.__id in prevMap) ? prevMap[it.__id] : !!it.isTagged;
                });
                return map;
            });
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error('Error fetching app details:', err);
                setAppError(err.message || 'Failed to fetch app details');
            }
        } finally {
            setAppLoading(false);
        }
    };

    // call UserMapping API to map user <-> app before subscribe actions
    // sends payload: { userID, orgCode, appIDs, approvedBy, istagged }
    const callUserMapping = async (
        userID: string | number,
        orgCode: string,
        appIDs: string | number,
        approvedBy: string,
        istagged: number
    ) => {
        try {
            const url = `${API_APPS_URL}/UserMapping`;
            const payload = {
                userID: Number(userID),
                orgCode: String(orgCode),
                appIDs: String(appIDs),
                approvedBy: String(approvedBy),
                istagged: Number(istagged),
            };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`UserMapping failed: ${res.status}`);
            const data = await res.json().catch(() => null);
            return data;
        } catch (err) {
            console.error('UserMapping error:', err);
            throw err;
        }
    };

    useEffect(() => {
        if (!subscriptionDialogOpen || !selectedUserId) {
            setAppDetails([]);
            setAppError(null);
            setAppLoading(false);
            return;
        }
        const ac = new AbortController();
        fetchAppDetailsForUser(ac.signal);
        return () => ac.abort();
    }, [subscriptionDialogOpen, selectedUserId, users]);

    const handleDeleteUser = async () => {
        if (!deletingUser) return;
        setDeletingLoading(true);
        try {
            const { adminUserID } = getSessionAdminInfo();
            if (!adminUserID) throw new Error('Missing adminUserID in session');

            const payload = {
                adminUserID,
                userID: Number(deletingUser.id),
            };

            const url = `${API_APPS_URL}/DeleteUser`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Delete failed: ${res.status} ${text}`);
            }

            // on success, remove from local state
            setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
            setDeletingUser(null);
        } catch (err) {
            console.error('Error deleting user:', err);
            // Optionally show a user-facing error (toast/modal) — left as a future enhancement
        } finally {
            setDeletingLoading(false);
        }
    };

    const filteredUsers = users.filter((user) =>
        user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.loginName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.emailId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Desktop Sidebar */}
            <div className="fixed left-0 top-0 h-full w-52 z-40 hidden lg:block">
                <AppSidebar />
            </div>

            {/* Mobile Menu Sheet */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetContent side="left" className="w-64 p-0">
                    <AppSidebar />
                </SheetContent>
            </Sheet>

            <div className="ml-0 lg:ml-52 min-h-screen flex flex-col">
                {/* Header */}
                <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
                    <div className="flex h-16 items-center justify-between px-3 sm:px-6 gap-2 sm:gap-4">
                        <div className="flex items-center gap-4">
                            <div>
                                <h1 className="text-lg font-bold text-gray-900">Welcome Back, {(sessionStorage.getItem('username') || sessionStorage.getItem('userName') || "User")}!</h1>
                                {/* You can display more user info here if needed */}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                            {/* Mobile Menu Button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="lg:hidden flex-shrink-0"
                                onClick={() => setMobileMenuOpen(true)}
                            >
                                <Menu className="h-5 w-5" />
                            </Button>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">


                            <ProfileDropdown />
                        </div>
                    </div>
                </header>

                {/* Page Title Section */}
                <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                                <UsersIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                            </div>
                            <div className="flex flex-col">
                                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                                    Collaboration
                                </h2>
                            </div>
                        </div>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                            onClick={() => {
                                // Open Add User with a fresh form and reset state
                                setEditingUserId(null);
                                setFormData({
                                    firstName: '',
                                    lastName: '',
                                    email: '',
                                    userName: '',
                                    password: '',
                                    confirmPassword: '',
                                    contactNumber: '',
                                });
                                setTouched({});
                                setShowErrors(false);
                                setErrors({});
                                setIsAddingUser(true);
                            }}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add User
                        </Button>
                    </div>
                </div>

                {/* Add/Edit User Dialog */}
                <Dialog open={isAddingUser} onOpenChange={(open) => {
                    if (open) {
                        setIsAddingUser(true);
                        // If creating a new user, ensure fresh form
                        if (!editingUserId) {
                            setFormData({
                                firstName: '',
                                lastName: '',
                                email: '',
                                userName: '',
                                password: '',
                                confirmPassword: '',
                                contactNumber: '',
                            });
                            try { sessionStorage.removeItem('collaboration_form_draft'); } catch { }
                            setTouched({});
                            setShowErrors(false);
                            setErrors({});
                        }
                    } else {
                        setIsAddingUser(false);
                        // Always clear edit state and form when dialog closes (Cancel/X/overlay)
                        setEditingUserId(null);
                        setFormData({
                            firstName: '',
                            lastName: '',
                            email: '',
                            userName: '',
                            password: '',
                            confirmPassword: '',
                            contactNumber: '',
                        });
                        setTouched({});
                        setShowErrors(false);
                        setErrors({});
                    }
                }}>
                    <DialogContent
                        className="max-w-3xl max-h-[90vh] overflow-y-auto"
                        onInteractOutside={(e: any) => { e.preventDefault(); }}
                        onEscapeKeyDown={(e: any) => { e.preventDefault(); }}
                    >
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold text-gray-900">
                                {editingUserId ? "Edit User" : "Create User"}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-6 py-4">
                            {/* Personal Information Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                                    <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
                                    <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-900">
                                            First Name <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            placeholder="Enter first name"
                                            value={formData.firstName}
                                            onChange={(e) => handleInputChange("firstName", e.target.value)}
                                            className="bg-white border-gray-300"
                                            maxLength={60}
                                        />
                                        {(touched.firstName || showErrors) && errors.firstName && (
                                            <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-900">Last Name</Label>
                                        <Input
                                            placeholder="Enter last name"
                                            value={formData.lastName}
                                            onChange={(e) => handleInputChange("lastName", e.target.value)}
                                            className="bg-white border-gray-300"
                                            maxLength={60}
                                        />
                                        {(touched.lastName || showErrors) && errors.lastName && (
                                            <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-gray-900">Contact Number</Label>
                                    <Input
                                        placeholder="+91-00000-00000"
                                        value={formData.contactNumber}
                                        onChange={(e) => handleInputChange("contactNumber", e.target.value)}
                                        className="bg-white border-gray-300"
                                        maxLength={13}
                                    />
                                    {(touched.contactNumber || showErrors) && errors.contactNumber && (
                                        <p className="text-sm text-red-600 mt-1">{errors.contactNumber}</p>
                                    )}
                                </div>
                            </div>

                            {/* Account Information Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                                    <div className="w-1 h-5 bg-green-600 rounded-full"></div>
                                    <h3 className="text-lg font-semibold text-gray-900">Account Information</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-900">
                                            Email <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            type="email"
                                            placeholder="Enter email address"
                                            value={formData.email}
                                            onChange={(e) => handleInputChange("email", e.target.value)}
                                            className="bg-white border-gray-300"
                                            maxLength={254}
                                        />
                                        {(touched.email || showErrors) && errors.email && (
                                            <p className="text-sm text-red-600 mt-1">{errors.email}</p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-900">
                                            User Name <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            placeholder="Enter username"
                                            value={formData.userName}
                                            onChange={(e) => handleInputChange("userName", e.target.value)}
                                            className="bg-white border-gray-300"
                                            maxLength={20}
                                            disabled={!!editingUserId}
                                            title={editingUserId ? 'Username cannot be changed when updating a user' : undefined}
                                        />
                                        {(touched.userName || showErrors) && errors.userName && (
                                            <p className="text-sm text-red-600 mt-1">{errors.userName}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Security Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                                    <div className="w-1 h-5 bg-purple-600 rounded-full"></div>
                                    <h3 className="text-lg font-semibold text-gray-900">Security</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-900">
                                            Password {(!editingUserId) && <span className="text-red-500">*</span>}
                                        </Label>
                                        <Input
                                            type="password"
                                            placeholder="Enter password"
                                            value={formData.password}
                                            onChange={(e) => handleInputChange("password", e.target.value)}
                                            className="bg-white border-gray-300"
                                            maxLength={20}
                                            disabled={!!editingUserId}
                                            title={editingUserId ? 'Password cannot be changed when updating a user' : undefined}
                                        />
                                        {(touched.password || showErrors) && errors.password && (
                                            <p className="text-sm text-red-600 mt-1">{errors.password}</p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-900">
                                            Confirm Password {(!editingUserId) && <span className="text-red-500">*</span>}
                                        </Label>
                                        <Input
                                            type="password"
                                            placeholder="Confirm password"
                                            value={formData.confirmPassword}
                                            onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                                            className="bg-white border-gray-300"
                                            maxLength={20}
                                            disabled={!!editingUserId}
                                            title={editingUserId ? 'Password cannot be changed when updating a user' : undefined}
                                        />
                                        {(touched.confirmPassword || showErrors) && errors.confirmPassword && (
                                            <p className="text-sm text-red-600 mt-1">{errors.confirmPassword}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setIsAddingUser(false);
                                        setEditingUserId(null);
                                        setFormData({
                                            firstName: '',
                                            lastName: '',
                                            email: '',
                                            userName: '',
                                            password: '',
                                            confirmPassword: '',
                                            contactNumber: '',
                                        });
                                        setTouched({});
                                        setShowErrors(false);
                                        setErrors({});
                                    }}
                                    className="flex-1 h-11 text-base font-medium"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => { handleSaveUser(); }}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-11 text-base font-semibold"
                                    disabled={saving}
                                >
                                    {saving ? 'Saving...' : (editingUserId ? "Update User" : "Save User")}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* API Response Dialog (success/error) */}
                <AlertDialog open={apiDialogOpen} onOpenChange={(open) => { if (open) setApiDialogOpen(true); }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{apiDialogTitle || (apiDialogSuccess ? 'Success' : 'Error')}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {apiDialogMessage}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogAction
                                onClick={() => {
                                    setApiDialogOpen(false);
                                    // on success, close the add/edit dialog and reset form
                                    if (apiDialogSuccess) {
                                        // Refresh users list so UI reflects latest data
                                        try { void fetchUsers(); } catch { }
                                        setIsAddingUser(false);
                                        setEditingUserId(null);
                                        setFormData({
                                            firstName: "",
                                            lastName: "",
                                            email: "",
                                            userName: "",
                                            password: "",
                                            confirmPassword: "",
                                            contactNumber: "",
                                        });
                                        try { sessionStorage.removeItem('collaboration_form_draft'); } catch (e) { }
                                        setTouched({});
                                        setShowErrors(false);
                                        setErrors({});
                                    }
                                }}
                                className={apiDialogSuccess ? 'bg-blue-600 hover:bg-blue-700' : undefined}
                            >
                                OK
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Tag/Untag Confirmation Dialog */}
                <AlertDialog open={actionDialogOpen} onOpenChange={(open) => { if (open) setActionDialogOpen(true); }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{actionDialogTitle || 'Info'}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {actionDialogMessage}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogAction
                                onClick={() => {
                                    // Close only; keep Subscription dialog open and same row visible
                                    setActionDialogOpen(false);
                                }}
                                className={'bg-blue-600 hover:bg-blue-700'}
                            >
                                OK
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Subscription Details Dialog */}
                <Dialog open={subscriptionDialogOpen} onOpenChange={(open) => { if (open) setSubscriptionDialogOpen(true); }}>
                    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <div className="flex items-center justify-between w-full">

                                {/* Left side: Title */}
                                <DialogTitle className="text-2xl font-bold text-gray-900">
                                    Subscription Details
                                </DialogTitle>

                                {/* Right side: Close Button */}
                                <button
                                    type="button"
                                    title="Close"
                                    aria-label="Close subscription details"
                                    className="rounded p-2 text-red-600 hover:bg-red-100 flex-shrink-0"
                                    onClick={() => {
                                        setSubscriptionDialogOpen(false);
                                        setSelectedAppCodes([]);
                                    }}
                                >
                                    <X className="w-4 h-4" />
                                </button>

                            </div>
                        </DialogHeader>



                        <div className="space-y-6 py-4">
                            {/* Subscription Table */}
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-50">
                                            <TableHead className="w-12">
                                                <input
                                                    ref={headerCheckboxRef}
                                                    type="checkbox"
                                                    className="rounded border-gray-300"
                                                    checked={appDetails.length > 0 && selectedAppCodes.length === appDetails.length}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            const all = appDetails.map(a => a.__id).filter(Boolean);
                                                            setSelectedAppCodes(all);
                                                            // record mapping for all selected
                                                            const map: Record<string, string> = { ...selectedMapRef.current };
                                                            appDetails.forEach(a => {
                                                                if (!a || !a.__id) return;
                                                                map[a.__id] = a.appCode || a.appID || a.applicationName || '';
                                                            });
                                                            selectedMapRef.current = map;
                                                        } else {
                                                            setSelectedAppCodes([]);
                                                            selectedMapRef.current = {};
                                                        }
                                                    }}
                                                />
                                            </TableHead>
                                            <TableHead className="font-semibold text-gray-900">App Name</TableHead>
                                            <TableHead className="font-semibold text-gray-900">App Status</TableHead>
                                            <TableHead className="font-semibold text-gray-900 text-right w-40 pr-6">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {appLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                                                    Loading subscription details...
                                                </TableCell>
                                            </TableRow>
                                        ) : appError ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-red-500 py-8">
                                                    {appError}
                                                </TableCell>
                                            </TableRow>
                                        ) : appDetails && appDetails.length > 0 ? (
                                            appDetails.map((app: any, idx: number) => {
                                                // Derive tag status: prefer local state, else strict API boolean
                                                const isTagged = (taggedMap[app.__id] ?? (app.isTagged === true)) === true;
                                                const statusClass = isTagged ? 'bg-green-600 text-white' : 'bg-red-600 text-white';
                                                const statusText = isTagged ? 'Tagged' : 'Not tagged';
                                                return (
                                                    <TableRow key={app.__id || getAppId(app, idx)}>
                                                        <TableCell className="w-12">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-gray-300"
                                                                checked={selectedAppCodes.includes(app.__id)}
                                                                onChange={(e) => {
                                                                    const id = app.__id;
                                                                    if (e.target.checked) {
                                                                        // add selection and store mapping to appCode for remapping later
                                                                        setSelectedAppCodes(prev => Array.from(new Set([...prev, id])));
                                                                        selectedMapRef.current[id] = app.appCode || app.appID || app.applicationName || '';
                                                                    } else {
                                                                        setSelectedAppCodes(prev => prev.filter(x => x !== id));
                                                                        // remove mapping
                                                                        try { delete selectedMapRef.current[id]; } catch (err) { }
                                                                    }
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-gray-900">{app.applicationName || app.appName || app.name || app.app || '-'}</TableCell>
                                                        <TableCell>
                                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusClass}`}>
                                                                {statusText}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right w-40 pr-6">
                                                            <div className="flex items-center justify-end gap-3">
                                                                {isTagged ? (
                                                                    // Tagged: show small green dot on left and filled red Untag button on right
                                                                    <>
                                                                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-1" aria-hidden />
                                                                        <button
                                                                            type="button"
                                                                            title="Untag"
                                                                            aria-label={`Untag ${app.applicationName}`}
                                                                            className="w-10 h-10 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                                                                            onClick={async (e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                const wasSelected = selectedAppCodes.includes(app.__id);
                                                                                const prevMap = { ...taggedMap };
                                                                                setTaggedMap((m) => ({ ...m, [app.__id]: false }));
                                                                                try {
                                                                                    const userID = selectedUserId || sessionStorage.getItem('userID') || sessionStorage.getItem('userCode') || '';
                                                                                    const { orgCode, adminUserID } = getSessionAdminInfo();
                                                                                    if (!userID || !orgCode || !adminUserID) throw new Error('Missing session info');
                                                                                    // first call UserMapping (istagged = 0 for untag)
                                                                                    await callUserMapping(userID, orgCode, app.appID || app.appCode || app.applicationName || app.appName || '', adminUserID, 0);
                                                                                    // then perform subscribe/untag action
                                                                                    await subscribeToApp(String(userID), orgCode, app.appCode || app.appID || app.applicationName);
                                                                                    // on success, clear selection for this row
                                                                                    setSelectedAppCodes(prev => prev.filter(x => x !== app.__id));
                                                                                    try { delete selectedMapRef.current[app.__id]; } catch (e) { }
                                                                                    // update local appDetails so row reflects state immediately
                                                                                    setAppDetails(prev => prev.map(a => a.__id === app.__id ? { ...a, isTagged: false } : a));
                                                                                    // show confirmation dialog; refresh happens after OK
                                                                                    setActionDialogTitle('Untag');
                                                                                    setActionDialogMessage(`App "${app.applicationName || app.appName || app.name || ''}" untagged successfully.`);
                                                                                    setActionDialogOpen(true);
                                                                                } catch (err) {
                                                                                    console.error('Untag failed:', err);
                                                                                    setTaggedMap(prevMap);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <X className="w-4 h-4 text-white" />
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    // Not tagged: show filled green Tag button then small red dot on right
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            title="Tag"
                                                                            aria-label={`Tag ${app.applicationName}`}
                                                                            className="w-10 h-10 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700"
                                                                            onClick={async (e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                const wasSelected = selectedAppCodes.includes(app.__id);
                                                                                const prevMap = { ...taggedMap };
                                                                                setTaggedMap((m) => ({ ...m, [app.__id]: true }));
                                                                                try {
                                                                                    const userID = selectedUserId || sessionStorage.getItem('userID') || sessionStorage.getItem('userCode') || '';
                                                                                    const { orgCode, adminUserID } = getSessionAdminInfo();
                                                                                    if (!userID || !orgCode || !adminUserID) throw new Error('Missing session info');
                                                                                    // first call UserMapping (istagged = 1 for tag)
                                                                                    await callUserMapping(userID, orgCode, app.appID || app.appCode || app.applicationName || app.appName || '', adminUserID, 1);
                                                                                    // then perform subscribe/tag action
                                                                                    await subscribeToApp(String(userID), orgCode, app.appCode || app.appID || app.applicationName);
                                                                                    // on success, clear selection for this row
                                                                                    setSelectedAppCodes(prev => prev.filter(x => x !== app.__id));
                                                                                    try { delete selectedMapRef.current[app.__id]; } catch (e) { }
                                                                                    // update local appDetails so row reflects state immediately
                                                                                    setAppDetails(prev => prev.map(a => a.__id === app.__id ? { ...a, isTagged: true } : a));
                                                                                    // show confirmation dialog; refresh happens after OK
                                                                                    setActionDialogTitle('Tag');
                                                                                    setActionDialogMessage(`App "${app.applicationName || app.appName || app.name || ''}" tagged successfully.`);
                                                                                    setActionDialogOpen(true);
                                                                                } catch (err) {
                                                                                    console.error('Tag failed:', err);
                                                                                    setTaggedMap(prevMap);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <CheckCircle className="w-4 h-4 text-white" />
                                                                        </button>
                                                                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 ml-1" aria-hidden />
                                                                    </>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                                                    No subscription details available.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-3">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                className="bg-blue-600 hover:bg-blue-700 text-white h-11 px-8 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-70 disabled:pointer-events-auto"
                                                onClick={async () => {
                                                    if (!selectedAppCodes.length) return;
                                                    setBulkProcessing(true);
                                                    const prevMap = { ...taggedMap };
                                                    // optimistic: mark selected as tagged in map
                                                    setTaggedMap((m) => {
                                                        const copy = { ...m };
                                                        selectedAppCodes.forEach(id => copy[id] = true);
                                                        return copy;
                                                    });
                                                    try {
                                                        const usercode = sessionStorage.getItem('userID') || sessionStorage.getItem('userCode') || '';
                                                        const { orgCode } = getSessionAdminInfo();
                                                        if (!usercode || !orgCode) throw new Error('Missing session info');
                                                        // Build a comma-separated list of selected app IDs for bulk UserMapping
                                                        const selectedApps = appDetails.filter(a => selectedAppCodes.includes(a.__id));
                                                        const appIDsCsv = selectedApps
                                                            .map(a => a.appID || a.appCode || a.appName || a.applicationName || '')
                                                            .filter(Boolean)
                                                            .join(',');
                                                        // Call UserMapping once with combined appIDs for Tag flow
                                                        {
                                                            const userID = selectedUserId || usercode;
                                                            const { adminUserID } = getSessionAdminInfo();
                                                            await callUserMapping(userID, orgCode, appIDsCsv, adminUserID || '', 1);
                                                        }
                                                        const promises = appDetails.map((a) => {
                                                            if (!selectedAppCodes.includes(a.__id)) return Promise.resolve({ status: 'skipped' });
                                                            return (async () => {
                                                                // perform subscribe/tag action per app
                                                                const userID = selectedUserId || usercode;
                                                                return subscribeToApp(String(userID), orgCode, a.appCode || a.appID || a.appName || a.applicationName);
                                                            })();
                                                        });
                                                        const results = await Promise.allSettled(promises);
                                                        // revert any that failed
                                                        const failedIds = results
                                                            .map((r, i) => ({ r, i }))
                                                            .filter(x => x.r.status === 'rejected')
                                                            .map(x => appDetails[x.i] && appDetails[x.i].__id)
                                                            .filter(Boolean as any);
                                                        if (failedIds.length) {
                                                            setTaggedMap((m) => {
                                                                const copy = { ...m };
                                                                failedIds.forEach((id: string) => { copy[id] = false; });
                                                                return copy;
                                                            });
                                                            // keep only failed ids selected, clear others
                                                            setSelectedAppCodes(prev => prev.filter(id => failedIds.includes(id)));
                                                            // remove mappings for succeeded ids
                                                            const succeeded = selectedAppCodes.filter(id => !failedIds.includes(id));
                                                            succeeded.forEach(id => { try { delete selectedMapRef.current[id]; } catch (e) { } });
                                                            // update local appDetails for succeeded ids
                                                            setAppDetails(prev => prev.map(a => succeeded.includes(a.__id) ? { ...a, isTagged: true } : a));
                                                        } else {
                                                            // all succeeded: clear all selections
                                                            setSelectedAppCodes([]);
                                                            selectedMapRef.current = {};
                                                            // update local appDetails for all selected ids
                                                            setAppDetails(prev => prev.map(a => selectedAppCodes.includes(a.__id) ? { ...a, isTagged: true } : a));
                                                        }
                                                        // show confirmation dialog; refresh happens after OK
                                                        setActionDialogTitle('Tag');
                                                        setActionDialogMessage('Selected apps tagged successfully.');
                                                        setActionDialogOpen(true);
                                                    } catch (err) {
                                                        console.error('Bulk tag failed:', err);
                                                        // revert map on error
                                                        setTaggedMap(prevMap);
                                                    } finally {
                                                        setBulkProcessing(false);
                                                    }
                                                }}
                                                disabled={bulkProcessing || selectedAppCodes.length === 0}
                                            >
                                                {bulkProcessing ? 'Processing...' : 'Tag Apps'}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" align="center" className="bg-white p-2 rounded-lg shadow-lg border border-gray-200">

                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                className="bg-blue-600 hover:bg-blue-700 text-white h-11 px-8 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-70 disabled:pointer-events-auto"
                                                onClick={async () => {
                                                    if (!selectedAppCodes.length) return;
                                                    setBulkProcessing(true);
                                                    const prevMap = { ...taggedMap };
                                                    // optimistic: mark selected as untagged in map
                                                    setTaggedMap((m) => {
                                                        const copy = { ...m };
                                                        selectedAppCodes.forEach(id => copy[id] = false);
                                                        return copy;
                                                    });
                                                    try {
                                                        const usercode = sessionStorage.getItem('userID') || sessionStorage.getItem('userCode') || '';
                                                        const { orgCode } = getSessionAdminInfo();
                                                        if (!usercode || !orgCode) throw new Error('Missing session info');
                                                        // Build a comma-separated list of selected app IDs for bulk UserMapping
                                                        const selectedApps = appDetails.filter(a => selectedAppCodes.includes(a.__id));
                                                        const appIDsCsv = selectedApps
                                                            .map(a => a.appID || a.appCode || a.appName || a.applicationName || '')
                                                            .filter(Boolean)
                                                            .join(',');
                                                        // Call UserMapping once with combined appIDs for Untag flow
                                                        {
                                                            const userID = selectedUserId || usercode;
                                                            const { adminUserID } = getSessionAdminInfo();
                                                            await callUserMapping(userID, orgCode, appIDsCsv, adminUserID || '', 0);
                                                        }
                                                        const promises = appDetails.map((a) => {
                                                            if (!selectedAppCodes.includes(a.__id)) return Promise.resolve({ status: 'skipped' });
                                                            return (async () => {
                                                                // perform subscribe/untag action per app
                                                                const userID = selectedUserId || usercode;
                                                                return subscribeToApp(String(userID), orgCode, a.appCode || a.appID || a.appName || a.applicationName);
                                                            })();
                                                        });
                                                        const results = await Promise.allSettled(promises);
                                                        const failedIds = results
                                                            .map((r, i) => ({ r, i }))
                                                            .filter(x => x.r.status === 'rejected')
                                                            .map(x => appDetails[x.i] && appDetails[x.i].__id)
                                                            .filter(Boolean as any);
                                                        if (failedIds.length) {
                                                            setTaggedMap((m) => {
                                                                const copy = { ...m };
                                                                failedIds.forEach((id: string) => { copy[id] = true; });
                                                                return copy;
                                                            });
                                                            // keep only failed ids selected, clear others
                                                            setSelectedAppCodes(prev => prev.filter(id => failedIds.includes(id)));
                                                            const succeeded = selectedAppCodes.filter(id => !failedIds.includes(id));
                                                            succeeded.forEach(id => { try { delete selectedMapRef.current[id]; } catch (e) { } });
                                                            // update local appDetails for succeeded ids
                                                            setAppDetails(prev => prev.map(a => succeeded.includes(a.__id) ? { ...a, isTagged: false } : a));
                                                        } else {
                                                            // all succeeded: clear all selections
                                                            setSelectedAppCodes([]);
                                                            selectedMapRef.current = {};
                                                            // update local appDetails for all selected ids
                                                            setAppDetails(prev => prev.map(a => selectedAppCodes.includes(a.__id) ? { ...a, isTagged: false } : a));
                                                        }
                                                        // show confirmation dialog; refresh happens after OK
                                                        setActionDialogTitle('Untag');
                                                        setActionDialogMessage('Selected apps untagged successfully.');
                                                        setActionDialogOpen(true);
                                                    } catch (err) {
                                                        console.error('Bulk untag failed:', err);
                                                        setTaggedMap(prevMap);
                                                    } finally {
                                                        setBulkProcessing(false);
                                                    }
                                                }}
                                                disabled={bulkProcessing || selectedAppCodes.length === 0}
                                            >
                                                {bulkProcessing ? 'Processing...' : 'Untag Apps'}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" align="center" className="bg-white p-2 rounded-lg shadow-lg border border-gray-200">

                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={!!deletingUser} onOpenChange={(open) => { if (open) { /* open only; prevent outside/escape from closing */ } }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription className="space-y-2">
                                <p>Are you sure you want to delete this user? This action cannot be undone.</p>
                                {deletingUser && (
                                    <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-2 text-gray-900">
                                        <p><span className="font-semibold">Name:</span> {deletingUser.firstName} {deletingUser.lastName}</p>
                                        <p><span className="font-semibold">Login Name:</span> {deletingUser.loginName}</p>
                                        <p><span className="font-semibold">Email:</span> {deletingUser.emailId}</p>
                                    </div>
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setDeletingUser(null)} disabled={deletingLoading}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDeleteUser}
                                className="bg-red-600 hover:bg-red-700"
                                disabled={deletingLoading}
                            >
                                {deletingLoading ? 'Deleting...' : 'Delete'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Main Content */}
                <main className="p-6">
                    <div className="max-w-7xl mx-auto space-y-6">
                        {/* Search Bar (hidden when there are no users) */}
                        {users.length > 0 && (
                            <div className="flex gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <Input
                                        type="text"
                                        placeholder="Search users..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-10 bg-white border-gray-300"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Users Table or Empty State */}
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            {filteredUsers.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-50">
                                            <TableHead className="font-semibold text-gray-900 text-center">First Name</TableHead>
                                            <TableHead className="font-semibold text-gray-900 text-center">Last Name</TableHead>
                                            <TableHead className="font-semibold text-gray-900 text-center">Login Name</TableHead>
                                            <TableHead className="font-semibold text-gray-900 text-center">Email Id</TableHead>
                                            <TableHead className="font-semibold text-gray-900 text-center">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredUsers.map((user) => (
                                            <TableRow key={user.id}>
                                                <TableCell className="text-gray-900 text-center">{user.firstName}</TableCell>
                                                <TableCell className="text-gray-900 text-center">{user.lastName ? user.lastName : '-'}</TableCell>
                                                <TableCell className="text-gray-900 text-center">{user.loginName}</TableCell>
                                                <TableCell className="text-gray-900 text-center">{user.emailId}</TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                            onClick={() => handleEditUser(user)}
                                                            title="Edit user"
                                                            aria-label={`Edit user ${user.firstName}`}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                            onClick={() => setDeletingUser(user)}
                                                            title="Delete user"
                                                            aria-label={`Delete user ${user.firstName}`}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                            onClick={() => {
                                                                const code = user.userCode || sessionStorage.getItem('userCode') || user.loginName || user.emailId || String(user.id || '');
                                                                setSelectedUserCode(code || null);
                                                                setSelectedUserId(user.id);
                                                                setSubscriptionDialogOpen(true);
                                                            }}
                                                            title="View subscriptions"
                                                            aria-label={`View subscriptions for ${user.firstName}`}
                                                        >
                                                            <Package className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="p-12 text-center text-gray-500">
                                    No users found
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Collaboration;
