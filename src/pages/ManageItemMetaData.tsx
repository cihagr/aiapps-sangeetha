import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Database, Menu, Search, RefreshCw, ListChecks, AlertCircle, Inbox, CheckCircle2, Plus, Pencil, Trash2, Link2, Loader2, X, Lock, ChevronDown, ShieldCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppSidebar } from "@/components/AppSidebar";
import { SuperAdminSidebar } from "@/components/SuperAdminSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import BackToTop from "@/components/BackToTop";
import { API_ENDPOINTS } from "../config";
import { getKbAuthToken } from "@/lib/kb-auth";
import { toast } from "@/components/ui/use-toast";

// A row from get-master-item-metadata (uspgetmasteritemmetadata)
type MasterItemMetaData = {
  metadataid: number;
  metadataname: string;
  metadatacode: string;
  metadatadescription: string;
  usercode: string;
  raw: any;
};

// A row from get-item-metadata-mapping (uspgetitemmetadatamapping):
// the master row plus its org-scoped tag state.
type ItemMetaDataMapping = MasterItemMetaData & {
  istag: number;
  metadatatype: number | null;
};

// par_metadatatype defaults to 1 in both uspgetitemmetadatamapping and usptagitemmetadata.
const ITEM_METADATA_TYPE = 1;
// Same mapping / tag APIs, metadatatype 2 = item validation.
const ITEM_VALIDATION_TYPE = 2;
// par_islisting = 0 returns every master row with its tag flag (1 = only tagged rows).
const MAPPING_IS_LISTING = 1;

const getSessionCustCode = () => {
  try {
    const ui = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    return sessionStorage.getItem("custcode") || sessionStorage.getItem("customerCode") || ui?.customerCode || ui?.customercode || "VTCT";
  } catch {
    return "VTCT";
  }
};

const getSessionOrgCode = () => {
  try {
    const ui = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    return sessionStorage.getItem("orgCode") || sessionStorage.getItem("organizationCode") || ui?.orgCode || ui?.organizationcode || "VTCT01";
  } catch {
    return "VTCT01";
  }
};

// metadataid used for the inline "new entry" draft row; the save SP treats 0 as an insert.
const NEW_DRAFT_ID = -1;

// The APIs answer with { status, message, count, data } — normalise the list out
// of the common shapes and surface the server-side message on failure.
const readList = (json: any): any[] => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.result)) return json.result;
  if (Array.isArray(json?.items)) return json.items;
  return [];
};

const assertOk = (response: Response, json: any) => {
  if (!response.ok || String(json?.status || "").toLowerCase() === "error") {
    throw new Error(json?.message || json?.error || `Request failed (status: ${response.status})`);
  }
};

const toMaster = (row: any): MasterItemMetaData => ({
  metadataid: Number(row?.metadataid ?? 0),
  metadataname: String(row?.metadataname ?? "").trim(),
  metadatacode: String(row?.metadatacode ?? "").trim(),
  metadatadescription: String(row?.metadatadescription ?? ""),
  usercode: String(row?.usercode ?? row?.createdby ?? row?.created_by ?? row?.createdbycode ?? "").toLowerCase(),
  raw: row,
});

const toMapping = (row: any): ItemMetaDataMapping => ({
  ...toMaster(row),
  istag: Number(row?.istag ?? 0),
   metadatatype: row?.metadatatype == null ? null : Number(row.metadatatype),
});

const getUserCode = (): string => {
  try {
    const ui = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
    return String(ui?.usercode || ui?.userCode || ui?.userId || "Adm488");
  } catch {
    return "Adm488";
  }
};

// The master list API does not return an owner yet, so remember the ids this
// user created locally. Everything else stays locked (read-only) for them.
// Once uspgetmasteritemmetadata returns a usercode column, `isOwnedBy` picks it
// up automatically and this store simply becomes a fallback.
const ownedKey = () => `aig.masterItemMetadata.ownedIds.${getUserCode().toLowerCase()}`;

const loadOwnedIds = (): Set<number> => {
  try {
    const raw = localStorage.getItem(ownedKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : []);
  } catch {
    return new Set();
  }
};

const persistOwnedIds = (ids: Set<number>) => {
  try {
    localStorage.setItem(ownedKey(), JSON.stringify([...ids]));
  } catch {
    /* storage unavailable — ownership just won't survive a reload */
  }
};

const ManageItemMetaData = () => {
  // Prevent duplicate API calls in React Strict Mode
  const fetchedRef = useRef(false);

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [items, setItems] = useState<MasterItemMetaData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const [customers, setCustomers] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedOrganization, setSelectedOrganization] = useState("");

  // Left panel checkboxes: metadataid -> tagged. Seeded from the mapping API.
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  // Right panel — item metadata mapping (read-only view of what is tagged)
  const [mappings, setMappings] = useState<ItemMetaDataMapping[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const [mappingSearch, setMappingSearch] = useState("");
  const [tagging, setTagging] = useState(false);
  // metadataid whose tag/untag request is in flight, or null
  const [rowTagging, setRowTagging] = useState<number | null>(null);

  // Item Validation card — the same mapping, metadatatype 2
  const [validationMappings, setValidationMappings] = useState<ItemMetaDataMapping[]>([]);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [validationSearch, setValidationSearch] = useState("");
  const [validationTagging, setValidationTagging] = useState(false);
  const [validationRowTagging, setValidationRowTagging] = useState<number | null>(null);

  // Inline add / edit row. NEW_DRAFT_ID = the "add" row, any other id = editing that row.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<MasterItemMetaData | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Ids this user created — the only rows they may edit or delete.
  const [ownedIds, setOwnedIds] = useState<Set<number>>(() => loadOwnedIds());

  const markOwned = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setOwnedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      persistOwnedIds(next);
      return next;
    });
  }, []);

  const unmarkOwned = useCallback((id: number) => {
    setOwnedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      persistOwnedIds(next);
      return next;
    });
  }, []);

  // A row is the user's own if the API says so, or if we created it from here.
  // The codes are compared trimmed and case-insensitively: a stray space or a
  // different casing from the API would otherwise lock the user out of a row they
  // created themselves.
  const isOwned = useCallback(
    (it: MasterItemMetaData) => {
      if (ownedIds.has(it.metadataid)) return true;
      const rowUser = String(it.usercode ?? "").trim().toLowerCase();
      const me = getUserCode().trim().toLowerCase();
      return !!rowUser && !!me && rowUser === me;
    },
    [ownedIds]
  );

  useEffect(() => {
    try {
      let role = sessionStorage.getItem("userRole") || "";
      if (!role) {
        const uiRaw = sessionStorage.getItem("userInfo");
        if (uiRaw) {
          const ui = JSON.parse(uiRaw || "{}");
          role = ui?.userRole || ui?.role || "";
        }
      }
      setIsSuperAdmin(String(role || "").trim().toLowerCase() === "superadmin");
    } catch {
      setIsSuperAdmin(false);
    }
  }, []);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = await getKbAuthToken();
        const res = await fetch(`${API_ENDPOINTS.GET_CUSTOMER_DATA}?auth_token=${encodeURIComponent(token)}`);
        const json = await res.json();
        const list = readList(json);
        setCustomers(list);

        // Default the customer the same way the Knowledge Base page does:
        // persisted session selection -> the logged-in user's customer -> first row.
        setSelectedCustomer((prev) => {
          if (prev) return prev;
          const persisted = (() => {
            try {
              return sessionStorage.getItem("selectedCustomerCode") || "";
            } catch {
              return "";
            }
          })();
          const fromUser = (() => {
            try {
              const ui = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
              return String(ui?.customerCode || ui?.customercode || "");
            } catch {
              return "";
            }
          })();

          const match = (code: string) =>
            code
              ? list.find((c: any) => String(c?.customercode || "").toLowerCase() === code.toLowerCase())
              : undefined;

          const picked = match(persisted) || match(fromUser) || list[0];
          return picked?.customercode ? String(picked.customercode) : prev;
        });
      } catch (err) {
        console.error("Failed to fetch customers", err);
      }
    };
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!selectedCustomer) {
      setOrganizations([]);
      setSelectedOrganization("");
      return;
    }
    // Drop the previous customer's organization so the new one can default in.
    setSelectedOrganization("");

    const fetchOrgs = async () => {
      try {
        const token = await getKbAuthToken();
        const payload = {
          par_custcode: selectedCustomer,
          par_usercode: getUserCode(),
          auth_token: token,
        };

        const res = await fetch(API_ENDPOINTS.GET_ORGANIZATION_DETAILS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        const list = readList(json);
        setOrganizations(list);

        // Default the organization from the logged-in user's org, else the first row.
        setSelectedOrganization((prev) => {
          if (prev) return prev;
          const fromUser = (() => {
            try {
              const ui = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
              return String(ui?.orgCode || ui?.organizationcode || "");
            } catch {
              return "";
            }
          })();

          const match = fromUser
            ? list.find((o: any) => String(o?.organizationcode || "").toLowerCase() === fromUser.toLowerCase())
            : undefined;

          const picked = match || list[0];
          return picked?.organizationcode ? String(picked.organizationcode) : prev;
        });
      } catch (err) {
        console.error("Failed to fetch organizations", err);
      }
    };
    fetchOrgs();
  }, [selectedCustomer]);

  // ---------------------------------------------------------------------------
  // Left panel — master item meta data list
  // uspgetmasteritemmetadata(par_metadataid = 0 -> every row)
  // ---------------------------------------------------------------------------
  const fetchMasterItemMetaData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ metadataid: "0" });
      const response = await fetch(`${API_ENDPOINTS.GET_MASTER_ITEM_METADATA}?${params.toString()}`, {
        method: "GET",
      });
      const json = await response.json().catch(() => ({}));
      assertOk(response, json);

      const mapped = readList(json).map(toMaster).filter((it) => it.metadataname);
      setItems(mapped);
      return mapped;
    } catch (e: any) {
      setError(e?.message || "Failed to load master item meta data.");
      setItems([]);
      return [] as MasterItemMetaData[];
    } finally {
      setLoading(false);
    }
  }, []);

  // Call the API when the page opens
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchMasterItemMetaData();
  }, [fetchMasterItemMetaData]);

  // ---------------------------------------------------------------------------
  // Right panel — item metadata mapping for the selected customer / organization
  // uspgetitemmetadatamapping(par_custcode, par_orgcode, par_metadatatype, par_islisting)
  // ---------------------------------------------------------------------------
  const custcode = selectedCustomer || getSessionCustCode();
  const orgcode = selectedOrganization || getSessionOrgCode();

  const fetchMappings = useCallback(async () => {
    setMappingLoading(true);
    setMappingError("");
    try {
      const params = new URLSearchParams({
        custcode,
        orgcode,
        metadatatype: String(ITEM_METADATA_TYPE),
        islisting: String(MAPPING_IS_LISTING),
      });
      const response = await fetch(`${API_ENDPOINTS.GET_ITEM_METADATA_MAPPING}?${params.toString()}`, {
        method: "GET",
      });
      const json = await response.json().catch(() => ({}));
      assertOk(response, json);
      setMappings(readList(json).map(toMapping));
    } catch (e: any) {
      setMappingError(e?.message || "Failed to load item metadata mapping.");
      setMappings([]);
    } finally {
      setMappingLoading(false);
    }
  }, [custcode, orgcode]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  const fetchValidationMappings = useCallback(async () => {
    setValidationLoading(true);
    setValidationError("");
    try {
      const params = new URLSearchParams({
        custcode,
        orgcode,
        metadatatype: String(ITEM_VALIDATION_TYPE),
        islisting: String(MAPPING_IS_LISTING),
      });
      const response = await fetch(`${API_ENDPOINTS.GET_ITEM_METADATA_MAPPING}?${params.toString()}`, {
        method: "GET",
      });
      const json = await response.json().catch(() => ({}));
      assertOk(response, json);
      setValidationMappings(readList(json).map(toMapping));
    } catch (e: any) {
      setValidationError(e?.message || "Failed to load item validation mapping.");
      setValidationMappings([]);
    } finally {
      setValidationLoading(false);
    }
  }, [custcode, orgcode]);

  useEffect(() => {
    fetchValidationMappings();
  }, [fetchValidationMappings]);

  // The left checkboxes are a pick-list for the next tag action.
  const resetChecked = useCallback(() => setChecked({}), []);

  // Clear the pick-list whenever the org (and therefore the mapping) changes.
  useEffect(() => {
    setChecked({});
  }, [custcode, orgcode]);

  // The two panels are a transfer list: anything tagged to this org lives on the
  // right and is removed from the left until it is untagged again.
  const taggedIds = useMemo(
    () => new Set(mappings.filter((m) => Number(m.istag) === 1).map((m) => m.metadataid)),
    [mappings]
  );

  const validationTaggedIds = useMemo(
    () => new Set(validationMappings.filter((m) => Number(m.istag) === 1).map((m) => m.metadataid)),
    [validationMappings]
  );

  const mappingById = useMemo(
    () => new Map(mappings.map((m) => [m.metadataid, m])),
    [mappings]
  );

  // Checked rows that are not tagged to this org yet.
  const pendingTagRows = useMemo(
    () =>
      items
        .filter((it) => checked[it.metadataid] && !taggedIds.has(it.metadataid))
        .map((it) => ({
          metadataid: it.metadataid,
            })),
    [items, checked, taggedIds, mappingById]
  );

  // Tag Item Validation picks checked rows not yet tagged as item validation.
  const pendingValidationRows = useMemo(
    () =>
      items
        .filter((it) => checked[it.metadataid] && !validationTaggedIds.has(it.metadataid))
        .map((it) => ({ metadataid: it.metadataid })),
    [items, checked, validationTaggedIds]
  );

  // usptagitemmetadata(par_custcode, par_orgcode, par_metadatatype, par_usercode, par_metadatajson)
  // istag = 1 tags the metadata to the org, 0 untags it.
  const postTag = useCallback(
    async (entries: { metadataid: number; istag: number }[], metadataType: number = ITEM_METADATA_TYPE) => {
      const payload = {
        custcode,
        orgcode,
        metadatatype: metadataType,
        usercode: getUserCode(),
        metadatajson: entries,
      };

      const response = await fetch(API_ENDPOINTS.TAG_ITEM_METADATA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      assertOk(response, json);
    },
    [custcode, orgcode]
  );

  // Bulk tag from the left panel's checkboxes.
  const saveTag = async () => {
    if (pendingTagRows.length === 0) return;
    const count = pendingTagRows.length;
    setTagging(true);
    try {
      await postTag(pendingTagRows.map((m) => ({ ...m, istag: 1 })));

      toast({
        title: "Item metadata tagged",
        description: `${count} metadata tagged to ${orgcode}.`,
      });
      setChecked({});
      await fetchMappings();
    } catch (e: any) {
      toast({
        title: "Could not save mapping",
        description: e?.message || "Failed to tag item metadata.",
        variant: "destructive",
      });
    } finally {
      setTagging(false);
    }
  };

  // Per-row tag / untag straight from the mapping panel.
  const toggleRowTag = async (m: ItemMetaDataMapping, next: boolean) => {
    setRowTagging(m.metadataid);
    try {
      await postTag([
        {
          metadataid: m.metadataid,
             istag: next ? 1 : 0,
        },
      ]);

      toast({
        title: next ? "Item metadata tagged" : "Item metadata untagged",
        description: `${m.metadataname} is ${next ? "now" : "no longer"} tagged to ${orgcode}.`,
      });
      await fetchMappings();
    } catch (e: any) {
      toast({
        title: next ? "Could not tag metadata" : "Could not untag metadata",
        description: e?.message || "Failed to update item metadata mapping.",
        variant: "destructive",
      });
    } finally {
      setRowTagging(null);
    }
  };

  // Bulk tag from the left panel's checkboxes as item validation (metadatatype 2).
  const saveValidationTag = async () => {
    if (pendingValidationRows.length === 0) return;
    const count = pendingValidationRows.length;
    setValidationTagging(true);
    try {
      await postTag(pendingValidationRows.map((m) => ({ ...m, istag: 1 })), ITEM_VALIDATION_TYPE);

      toast({
        title: "Item validation tagged",
        description: `${count} metadata tagged as item validation to ${orgcode}.`,
      });
      setChecked({});
      await fetchValidationMappings();
    } catch (e: any) {
      toast({
        title: "Could not save mapping",
        description: e?.message || "Failed to tag item validation.",
        variant: "destructive",
      });
    } finally {
      setValidationTagging(false);
    }
  };

  // Per-row untag straight from the Item Validation card.
  const toggleValidationRowTag = async (m: ItemMetaDataMapping, next: boolean) => {
    setValidationRowTagging(m.metadataid);
    try {
      await postTag([{ metadataid: m.metadataid, istag: next ? 1 : 0 }], ITEM_VALIDATION_TYPE);

      toast({
        title: next ? "Item validation tagged" : "Item validation untagged",
        description: `${m.metadataname} is ${next ? "now" : "no longer"} tagged as item validation to ${orgcode}.`,
      });
      await fetchValidationMappings();
    } catch (e: any) {
      toast({
        title: next ? "Could not tag item validation" : "Could not untag item validation",
        description: e?.message || "Failed to update item validation mapping.",
        variant: "destructive",
      });
    } finally {
      setValidationRowTagging(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Add / Edit / Delete master item meta data
  // ---------------------------------------------------------------------------
  const openAdd = () => {
    setEditingId(NEW_DRAFT_ID);
    setFormName("");
    setFormCode("");
    setFormDescription("");
  };

  const openEdit = (item: MasterItemMetaData) => {
    setEditingId(item.metadataid);
    setFormName(item.metadataname);
    setFormCode(item.metadatacode);
    setFormDescription(item.metadatadescription);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormName("");
    setFormCode("");
    setFormDescription("");
  };

  // uspsavemasteritemmetadata(par_metadataid, par_metadataname, par_metadatacode,
  //                           par_metadatadescription, par_usercode)
  const saveMasterItemMetaData = async () => {
    const name = formName.trim();
    const code = formCode.trim();

    if (!name) {
      toast({ title: "Name is required", description: "Enter a metadata name to continue.", variant: "destructive" });
      return;
    }

    const isAdd = editingId === NEW_DRAFT_ID;

    // Check for duplicate metadata by Name or Code (case-insensitive)
    const isDuplicateName = items.some(it => {
      if (!isAdd && it.metadataid === editingId) return false;
      return it.metadataname.trim().toLowerCase() === name.toLowerCase();
    });

    const isDuplicateCode = code ? items.some(it => {
      if (!isAdd && it.metadataid === editingId) return false;
      return !!it.metadatacode && it.metadatacode.trim().toLowerCase() === code.toLowerCase();
    }) : false;

    if (isDuplicateName || isDuplicateCode) {
      const duplicateField = isDuplicateName && isDuplicateCode
        ? `A metadata with name "${name}" and code "${code}"`
        : isDuplicateName
          ? `A metadata with name "${name}"`
          : `A metadata with code "${code}"`;

      toast({
        title: "Duplicate Metadata",
        description: `${duplicateField} already exists. Duplicate metadata entries are not allowed.`,
        variant: "destructive",
      });
      return;
    }
    const knownIds = new Set(items.map((it) => it.metadataid));
    setFormSaving(true);
    try {
      const payload = {
        metadataid: isAdd ? 0 : Number(editingId),
        metadataname: name,
        metadatacode: formCode.trim(),
        metadatadescription: formDescription,
        usercode: getUserCode(),
      };

      const response = await fetch(API_ENDPOINTS.SAVE_MASTER_ITEM_METADATA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      assertOk(response, json);

      // uspsavemasteritemmetadata returns the id via INOUT par_metadataid.
      const returned = Array.isArray(json)
        ? json[0]
        : Array.isArray(json?.data)
          ? json.data[0]
          : json?.data || json;
      const returnedId = Number(returned?.metadataid ?? 0);

      const fresh = await fetchMasterItemMetaData();

      if (isAdd) {
        // Identify the row that was just created so it is editable/deletable straight
        // away. The SP's echoed id was trusted blindly before, so a response carrying
        // anything else under `metadataid` (a status or affected-row count) marked the
        // wrong row as owned and left the new one locked. Three signals, most reliable
        // first, and the echoed id is only accepted when the refreshed list confirms
        // it is genuinely new.
        const freshIds = new Set(fresh.map((it) => it.metadataid));
        const addedIds = fresh
          .filter((it) => !knownIds.has(it.metadataid))
          .map((it) => it.metadataid);

        // Names are unique (duplicates are rejected above), so the row just saved can
        // always be found by name even if the list came back with no id difference.
        const byName = fresh
          .filter((it) => it.metadataname.trim().toLowerCase() === name.toLowerCase())
          .map((it) => it.metadataid);

        const echoed = Number.isFinite(returnedId) && returnedId > 0
          && freshIds.has(returnedId) && !knownIds.has(returnedId)
          ? [returnedId]
          : [];

        const newIds = Array.from(new Set([...addedIds, ...byName, ...echoed]));
        markOwned(newIds);
      }

      toast({
        title: isAdd ? "Metadata created" : "Metadata updated",
        description: `${name} was saved successfully.`,
      });
      cancelEdit();
      await Promise.all([fetchMappings(), fetchValidationMappings()]);
    } catch (e: any) {
      toast({
        title: "Could not save metadata",
        description: e?.message || "Failed to save master item meta data.",
        variant: "destructive",
      });
    } finally {
      setFormSaving(false);
    }
  };

  // uspdeletemasteritemmetadata(par_metadataid) — no usercode parameter
  const deleteMasterItemMetaData = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(API_ENDPOINTS.DELETE_MASTER_ITEM_METADATA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadataid: String(pendingDelete.metadataid) }),
      });
      const json = await response.json().catch(() => ({}));
      assertOk(response, json);

      toast({ title: "Metadata deleted", description: `${pendingDelete.metadataname} was removed.` });
      if (editingId === pendingDelete.metadataid) cancelEdit();

      unmarkOwned(pendingDelete.metadataid);
      setItems((prev) => prev.filter((it) => it.metadataid !== pendingDelete.metadataid));
      setPendingDelete(null);
      await Promise.all([fetchMappings(), fetchValidationMappings()]);
    } catch (e: any) {
      toast({
        title: "Could not delete metadata",
        description: e?.message || "Failed to delete master item meta data.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  // Left panel holds everything not yet tagged to the current org as both item
  // metadata and item validation; an item tagged as only one stays taggable as the other.
  const untaggedItems = useMemo(
    () => items.filter((it) => !(taggedIds.has(it.metadataid) && validationTaggedIds.has(it.metadataid))),
    [items, taggedIds, validationTaggedIds]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = !q
      ? untaggedItems
      : untaggedItems.filter(
          (it) => it.metadataname.toLowerCase().includes(q) || it.metadatacode.toLowerCase().includes(q)
        );
    // Locked master entries keep their API order; the user's own entries are
    // appended at the end, newest last.
    const locked = matched.filter((it) => !isOwned(it));
    const mine = matched.filter(isOwned).sort((a, b) => a.metadataid - b.metadataid);
    return [...locked, ...mine];
  }, [untaggedItems, searchQuery, isOwned]);

  const selectAllItems = useCallback(() => {
    setChecked((prev) => {
      const next = { ...prev };
      filteredItems.forEach((it) => {
        next[it.metadataid] = true;
      });
      return next;
    });
  }, [filteredItems]);

  // Right panel holds only what is tagged to the current org.
  const taggedMappings = useMemo(
    () => mappings.filter((m) => Number(m.istag) === 1),
    [mappings]
  );

  const filteredMappings = useMemo(() => {
    const q = mappingSearch.trim().toLowerCase();
    if (!q) return taggedMappings;
    return taggedMappings.filter(
      (m) => m.metadataname.toLowerCase().includes(q) || m.metadatacode.toLowerCase().includes(q)
    );
  }, [taggedMappings, mappingSearch]);

  const taggedValidationMappings = useMemo(
    () => validationMappings.filter((m) => Number(m.istag) === 1),
    [validationMappings]
  );

  const filteredValidationMappings = useMemo(() => {
    const q = validationSearch.trim().toLowerCase();
    if (!q) return taggedValidationMappings;
    return taggedValidationMappings.filter(
      (m) => m.metadataname.toLowerCase().includes(q) || m.metadatacode.toLowerCase().includes(q)
    );
  }, [taggedValidationMappings, validationSearch]);

  const checkedCount = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);
  const taggedCount = taggedMappings.length;

  // The inline editor, shared by the "add" draft row and any row being edited.
  const renderEditor = (mode: "add" | "edit") => (
    <div className="rounded-lg border border-blue-300 bg-blue-50/40 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-900">
          {mode === "add" ? "New master item meta data" : "Edit master item meta data"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-500"
          onClick={cancelEdit}
          disabled={formSaving}
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <Input
        value={formName}
        onChange={(e) => setFormName(e.target.value)}
        placeholder="Metadata name (required)"
        className="bg-white h-9"
        autoFocus
      />
      <Input
        value={formCode}
        onChange={(e) => setFormCode(e.target.value)}
        placeholder="Metadata code (e.g. IMD001)"
        className="bg-white h-9"
      />
      <Textarea
        value={formDescription}
        onChange={(e) => setFormDescription(e.target.value)}
        placeholder="Description — what this metadata evaluates…"
        rows={5}
        className="bg-white text-xs"
      />
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={formSaving}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={saveMasterItemMetaData}
          disabled={formSaving}
        >
          {formSaving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          {mode === "add" ? "Create" : "Save"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Desktop Sidebar */}
        <div className="fixed left-0 top-0 h-full w-52 z-40 hidden lg:block">
          {isSuperAdmin ? <SuperAdminSidebar /> : <AppSidebar />}
        </div>

        {/* Mobile Menu Sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-64 p-0">
            {isSuperAdmin ? <SuperAdminSidebar /> : <AppSidebar />}
          </SheetContent>
        </Sheet>

        <div className="ml-0 lg:ml-52 flex flex-col">
          {/* Page Title / Header */}
          <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden flex-shrink-0"
                  onClick={() => setMobileMenuOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Database className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                    Manage Item Meta Data
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-600">
                    Manage master item meta data and tag it to an organization.
                  </p>
                </div>
              </div>
              <ProfileDropdown />
            </div>
          </div>

          {/* Content */}
          <div className="px-3 sm:px-6 py-4 w-full max-w-[1700px] mx-auto">
            {/* Customer & Organization — resolved from the session, shown read-only */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="bg-[#F8F5FF] rounded-xl p-4 border border-purple-100 flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center flex-shrink-0">
                    <Search className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-base font-semibold text-purple-900">Select Customer</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                  <Input 
                    value={customers.find(c => c.customercode === selectedCustomer)?.customername || selectedCustomer || "Loading customer…"} 
                    readOnly 
                    className="h-10 w-full pl-9 pr-9 bg-white border-purple-100 text-sm text-gray-500 cursor-default focus-visible:ring-0 shadow-sm" 
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 pointer-events-none" />
                </div>
              </div>

              <div className="bg-[#F8F5FF] rounded-xl p-4 border border-purple-100 flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center flex-shrink-0">
                    <Search className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-base font-semibold text-purple-900">Select Organization</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                  <Input 
                    value={organizations.find(o => o.organizationcode === selectedOrganization)?.organizationname || selectedOrganization || "Loading organization…"} 
                    readOnly 
                    className="h-10 w-full pl-9 pr-9 bg-white border-purple-100 text-sm text-gray-500 cursor-default focus-visible:ring-0 shadow-sm" 
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
              {/* ------------------------------------------------------------- */}
              {/* LEFT PANEL — Master Item Meta Data                            */}
              {/* ------------------------------------------------------------- */}
              <Card className="border-gray-200 shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 bg-white px-4 sm:px-5 py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <ListChecks className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 leading-tight">Master Item Meta Data</h3>
                        
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={saveTag}
                        disabled={pendingTagRows.length === 0 || tagging || validationTagging}
                      >
                        {tagging ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        )}
                        Tag Metadata
                      </Button>
                      <Button
                        size="sm"
                        className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={saveValidationTag}
                        disabled={pendingValidationRows.length === 0 || tagging || validationTagging}
                      >
                        {validationTagging ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-4 h-4 mr-1.5" />
                        )}
                        Tag Item Validation
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 border-dashed border-blue-300 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={openAdd}
                        disabled={editingId === NEW_DRAFT_ID}
                      >
                        <Plus className="w-4 h-4 mr-1.5" /> Add Metadata
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search metadata…"
                        className="pl-8 h-9 bg-white"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={fetchMasterItemMetaData}
                      disabled={loading}
                      title="Refresh"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>

                <CardContent className="p-3 sm:p-4 relative flex flex-col">
                  {/* Keep the list on screen while refreshing — overlay instead of blanking */}
                  {loading && items.length > 0 && (
                    <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 bg-white/70 backdrop-blur-[1px] rounded-b-lg">
                      <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 shadow-sm rounded-full px-3 py-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> Refreshing…
                      </span>
                    </div>
                  )}
                  {loading && items.length === 0 ? (
                    <div className="space-y-2.5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-[56px] rounded-lg border border-gray-100 bg-gray-50 animate-pulse" />
                      ))}
                    </div>
                  ) : error ? (
                    <div className="py-12 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                      </div>
                      <p className="text-sm font-medium text-gray-900">Couldn't load master item meta data</p>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">{error}</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={fetchMasterItemMetaData}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Try again
                      </Button>
                    </div>
                  ) : (
                    <>
                      {filteredItems.length > 0 && editingId !== NEW_DRAFT_ID && (
                        <div className="flex items-center gap-3 px-3.5 pb-3">
                          <Checkbox
                            checked={filteredItems.length > 0 && filteredItems.every((it) => checked[it.metadataid])}
                            onCheckedChange={(v) => {
                              if (v) selectAllItems();
                              else resetChecked();
                            }}
                          />
                          <span className="text-sm font-medium text-gray-700">Select All</span>
                        </div>
                      )}
                      <div className="space-y-2.5 max-h-[calc(100vh-330px)] min-h-[240px] overflow-y-auto pr-1">
                      {filteredItems.length === 0 ? (
                        editingId === NEW_DRAFT_ID ? null : (
                          <div className="py-12 flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                              <Inbox className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-sm font-medium text-gray-900">
                              {items.length === 0
                                ? "No master item meta data found"
                                : untaggedItems.length === 0
                                  ? "Everything is tagged"
                                  : "No matches"}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {items.length === 0
                                ? "Use Add Metadata to create the first entry."
                                : untaggedItems.length === 0
                                  ? `All metadata is already tagged to ${orgcode}.`
                                  : "Try a different search term."}
                            </p>
                          </div>
                        )
                      ) : (
                        filteredItems.map((it, index) => {
                          if (editingId === it.metadataid) {
                            return <div key={it.metadataid}>{renderEditor("edit")}</div>;
                          }
                          const isChecked = !!checked[it.metadataid];
                          const owned = isOwned(it);

                          return (
                            <div
                              key={it.metadataid}
                              className={`group flex items-center gap-3 rounded-lg border px-3.5 py-3 transition-all ${
                                isChecked
                                  ? "border-blue-300 bg-blue-50/70 ring-1 ring-blue-200"
                                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(v) =>
                                  setChecked((prev) => ({ ...prev, [it.metadataid]: v === true }))
                                }
                              />
                              <span className="w-7 h-7 rounded-md bg-gray-100 text-gray-600 text-xs font-medium flex items-center justify-center flex-shrink-0">
                                {index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-sm truncate ${isChecked ? "text-blue-900 font-medium" : "text-gray-800"}`}
                                  title={it.metadataname}
                                >
                                  {it.metadataname}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  {it.metadatacode && (
                                    <span className="text-[11px] font-mono text-gray-500">{it.metadatacode}</span>
                                  )}
                                  {taggedIds.has(it.metadataid) && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                                      <CheckCircle2 className="w-3 h-3" /> Tagged to Metadata
                                    </span>
                                  )}
                                  {validationTaggedIds.has(it.metadataid) && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                                      <ShieldCheck className="w-3 h-3" /> Tagged to Validation
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {owned ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 text-gray-500 hover:text-blue-600"
                                      title="Edit"
                                      onClick={() => openEdit(it)}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 text-gray-500 hover:text-red-600"
                                      title="Delete"
                                      onClick={() => setPendingDelete(it)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <span
                                    className="h-8 w-8 flex items-center justify-center text-gray-300"
                                    title="Locked — master metadata cannot be edited or deleted"
                                  >
                                    <Lock className="w-4 h-4" />
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}

                      {/* New entries are added at the end of the list */}
                      {editingId === NEW_DRAFT_ID && renderEditor("add")}
                    </div>
                    </>
                  )}
                </CardContent>

              </Card>

              {/* ------------------------------------------------------------- */}
              {/* RIGHT PANEL — Item Metadata                            */}
              {/* ------------------------------------------------------------- */}
              <Card className="border-gray-200 shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 bg-white px-4 sm:px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                        <Link2 className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 leading-tight">Item Metadata </h3>
                       
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        value={mappingSearch}
                        onChange={(e) => setMappingSearch(e.target.value)}
                        placeholder="Search mapping…"
                        className="pl-8 h-9 bg-white"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={fetchMappings}
                      disabled={mappingLoading}
                      title="Refresh mapping"
                    >
                      <RefreshCw className={`w-4 h-4 ${mappingLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>

                <CardContent className="p-3 sm:p-4 relative">
                  {/* Keep the mapping on screen while refreshing — overlay instead of blanking */}
                  {mappingLoading && mappings.length > 0 && (
                    <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 bg-white/70 backdrop-blur-[1px] rounded-b-lg">
                      <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 shadow-sm rounded-full px-3 py-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" /> Refreshing…
                      </span>
                    </div>
                  )}
                  {mappingLoading && mappings.length === 0 ? (
                    <div className="space-y-2.5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-[56px] rounded-lg border border-gray-100 bg-gray-50 animate-pulse" />
                      ))}
                    </div>
                  ) : mappingError ? (
                    <div className="py-12 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                      </div>
                      <p className="text-sm font-medium text-gray-900">Couldn't load item metadata mapping</p>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">{mappingError}</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={fetchMappings}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Try again
                      </Button>
                    </div>
                  ) : filteredMappings.length === 0 ? (
                    <div className="py-12 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <Inbox className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        {taggedMappings.length === 0 ? "Nothing tagged yet" : "No matches"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {taggedMappings.length === 0
                          ? `Select metadata on the left and click Tag Metadata to map it to ${orgcode}.`
                          : "Try a different search term."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[calc(100vh-330px)] min-h-[240px] overflow-y-auto pr-1">
                      {filteredMappings.map((m, index) => {
                        return (
                          <div
                            key={m.metadataid}
                            className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50/50 px-3.5 py-3"
                          >
                            <span className="w-7 h-7 rounded-md bg-gray-100 text-gray-600 text-xs font-medium flex items-center justify-center flex-shrink-0">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-800 truncate" title={m.metadataname}>
                                {m.metadataname}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-[11px] text-gray-500">
                                {m.metadatacode && <span className="font-mono">{m.metadatacode}</span>}
                                
                                           </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                                <CheckCircle2 className="w-3 h-3" /> Tagged
                              </span>
                              {/* Untag — sends it back to the master list on the left */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                                onClick={() => toggleRowTag(m, false)}
                                disabled={rowTagging !== null || tagging}
                                title={`Untag from ${orgcode}`}
                              >
                                {rowTagging === m.metadataid ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <X className="w-3.5 h-3.5 mr-1" /> Untag
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ------------------------------------------------------------- */}
              {/* Item Validation — metadata tagged with metadatatype 2           */}
              {/* ------------------------------------------------------------- */}
              <Card className="border-gray-200 shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 bg-white px-4 sm:px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 leading-tight">Item Validation</h3>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        value={validationSearch}
                        onChange={(e) => setValidationSearch(e.target.value)}
                        placeholder="Search item validation…"
                        className="pl-8 h-9 bg-white"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={fetchValidationMappings}
                      disabled={validationLoading}
                      title="Refresh item validation"
                    >
                      <RefreshCw className={`w-4 h-4 ${validationLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>

                <CardContent className="p-3 sm:p-4 relative">
                  {validationLoading && validationMappings.length > 0 && (
                    <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 bg-white/70 backdrop-blur-[1px] rounded-b-lg">
                      <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 shadow-sm rounded-full px-3 py-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" /> Refreshing…
                      </span>
                    </div>
                  )}
                  {validationLoading && validationMappings.length === 0 ? (
                    <div className="space-y-2.5">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-[56px] rounded-lg border border-gray-100 bg-gray-50 animate-pulse" />
                      ))}
                    </div>
                  ) : validationError ? (
                    <div className="py-12 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                      </div>
                      <p className="text-sm font-medium text-gray-900">Couldn't load item validation mapping</p>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">{validationError}</p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={fetchValidationMappings}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Try again
                      </Button>
                    </div>
                  ) : filteredValidationMappings.length === 0 ? (
                    <div className="py-12 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <Inbox className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        {taggedValidationMappings.length === 0 ? "Nothing tagged yet" : "No matches"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {taggedValidationMappings.length === 0
                          ? `Select metadata on the left and click Tag Item Validation to map it to ${orgcode}.`
                          : "Try a different search term."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[calc(100vh-330px)] min-h-[240px] overflow-y-auto pr-1">
                      {filteredValidationMappings.map((m, index) => (
                        <div
                          key={m.metadataid}
                          className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50/50 px-3.5 py-3"
                        >
                          <span className="w-7 h-7 rounded-md bg-gray-100 text-gray-600 text-xs font-medium flex items-center justify-center flex-shrink-0">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800 truncate" title={m.metadataname}>
                              {m.metadataname}
                            </p>
                            {m.metadatacode && (
                              <span className="text-[11px] font-mono text-gray-500">{m.metadatacode}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                              <CheckCircle2 className="w-3 h-3" /> Tagged
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                              onClick={() => toggleValidationRowTag(m, false)}
                              disabled={validationRowTagging !== null || validationTagging}
                              title={`Untag from ${orgcode}`}
                            >
                              {validationRowTagging === m.metadataid ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <X className="w-3.5 h-3.5 mr-1" /> Untag
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open && !deleting) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete master item meta data?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.metadataname}" will be removed along with its organization mappings. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMasterItemMetaData();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BackToTop />
    </>
  );
};

export default ManageItemMetaData;
