import React from "react";
import AppShell from "./AppShell";
import Hoverable from "./Hoverable";
import NiceSelect from "./NiceSelect";
import { css as S } from "./css";
import { API_ENDPOINTS, BOT_WIDGET_SCRIPT_URL } from "../../config";
import { getKbAuthToken } from "@/lib/kb-auth";

// Guideline names shown in the Create Chat Bot / Create Agent modals.
const GET_GENERAL_GUIDELINES_URL = API_ENDPOINTS.GET_GENERAL_GUIDELINES;

// Agent Management and the Manage Chat Bots list (agent_api.py).
const GET_AGENT_DATA_URL = API_ENDPOINTS.GET_AGENT_DATA;
const SAVE_AGENT_URL = API_ENDPOINTS.SAVE_AGENT;
const DELETE_AGENT_URL = API_ENDPOINTS.DELETE_AGENT;
const SAVE_BOT_URL = API_ENDPOINTS.SAVE_BOT;
const GET_LANGUAGE_DATA_URL = API_ENDPOINTS.GET_LANGUAGE_DATA;
const GET_EXISTING_KB_URL = API_ENDPOINTS.GET_EXISTING_KB;
const GET_BOT_USER_DATA_URL = API_ENDPOINTS.GET_BOT_USER_DATA;
const GET_USER_DETAILS_URL = API_ENDPOINTS.GET_USER_DETAILS;
const SAVE_BOT_USER_URL = API_ENDPOINTS.SAVE_BOT_USER;
const GET_BOT_CONVERSATION_DATA_URL = API_ENDPOINTS.GET_BOT_CONVERSATION_DATA;
const GET_BOT_CONVERSATION_MESSAGE_DATA_URL = API_ENDPOINTS.GET_BOT_CONVERSATION_MESSAGE_DATA;
const GET_BOT_ANALYTICS_SUMMARY_URL = API_ENDPOINTS.GET_BOT_ANALYTICS_SUMMARY;
const DELETE_BOT_URL = API_ENDPOINTS.DELETE_BOT;
const DELETE_BOT_CONVERSATION_URL = API_ENDPOINTS.DELETE_BOT_CONVERSATION;
const GET_BOT_FALLBACK_QUERY_DATA_URL = API_ENDPOINTS.GET_BOT_FALLBACK_QUERY_DATA;
const GET_BOT_DATA_URL = API_ENDPOINTS.GET_BOT_DATA;
const UPDATE_BOT_STATUS_URL = API_ENDPOINTS.UPDATE_BOT_STATUS;

// usp_save_agent needs these three and the Create Agent popup does not ask for
// them, so every agent is saved with the same framework and model.
// Rows per page on the list tabs.
const PAGE_SIZE = 10;

const AGENT_DEFAULTS = { frameworkcode: "CREWAI", llmprovider: "OPENAI", llmmodelname: "gpt-4o" };

// Ported from the ManageBots design screen: a multi-tab bot admin dashboard
// (Overview, Manage Chat Bots, Conversations, Analytics, User Management) with
// SVG charts, filters, and modals. Presentation values are computed in
// renderVals(); render() consumes them via `v`.
class ManageBots extends React.Component {

  state = { view: "overview", selectedConvId: null, selectedBotId: null, statusFilter: "All",
    showEmbed: false, embedCode: "", showCreate: false, editBotId: null, newName: "", newKb: "", newGuideline: "", newDesc: "", newAgents: "", newStatus: "Draft", newLang: "EN",
    showCreateAgent: false, editAgentId: null, editAgentCode: "", agentName: "", agentDesc: "", agentRole: "", agentGoal: "", agentBackstory: "", agentInstructions: "", agentExpectedOutput: "", agentIsActive: true, createAgentTouched: false, agentsData: [],
    guidelineOptionsData: null, kbOptionsData: null, languageOptionsData: null,
    conversationsList: null, convMessages: {}, analyticsData: null, tagUsersData: null,
    botSearch: "", botPage: 1, botTotal: 0,
    agentSearch: "", agentStatusFilter: "All", agentPage: 1, agentTotal: 0,
    convSearch: "", convPage: 1, convTotal: 0,
    bots: null, toast: null, selectedFunnel: null,
    convStatusFilter: "All", convSentimentFilter: "All", convNotes: "", convStart: "", convEnd: "", userConvId: null, convFrom: null,
    analyticsBot: "all", analyticsRange: "30d", chartView: "bar",
    userFilter: "all", engThreshold: 30, convThreshold: 5, selectedUserId: null, showUserModal: false, showRole: false, roleValue: "user", rolePerms: null,
    kbView: "main", kbTitle: "", kbCategory: "", kbPriority: "medium", kbContent: "", kbTags: "", kbDocs: [], kbSearch: "", kbCat: "all", kbPrio: "all",
    createTouched: false, kbTouched: false,
    usersData: null, showAddAdmin: false, aName: "", aEmail: "", aRole: "admin", aDept: "", aTouched: false,
    tagBotId: null, tagSelected: null, tagSearch: "", tagMap: {} };

  componentDidMount() {
    this.loadGuidelines();
    this.loadAgents();
    this.loadBots();
    this.loadKnowledgeBases();
    this.loadLanguages();
    this.loadConversations();
  }

  // A search box reloads from the API a moment after the typing stops.
  onListSearch(searchKey, pageKey, value, loader) {
    this.setState({ [searchKey]: value, [pageKey]: 1 });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => loader(), 400);
  }

  // A filter or a page change reloads straight away.
  setAndReload(patch, loader) {
    this.setState(patch, loader);
  }

  // custcode / orgcode / usercode go on every chat bot API call.
  sessionCodes() {
    const session = (key) => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
    let userInfo = {};
    try { userInfo = JSON.parse(session("userInfo") || "{}") || {}; } catch { userInfo = {}; }
    return {
      custcode: session("custcode") || userInfo.customerCode || userInfo.custCode || "",
      orgcode: session("orgcode") || userInfo.orgCode || userInfo.organizationcode || "",
      usercode: session("userCode") || userInfo.usercode || userInfo.username || userInfo.userName || "",
    };
  }

  async apiPost(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  }

  // The procedures return snake_case; older builds returned it without the
  // underscores, so both spellings are accepted.
  pick(row, ...keys) {
    for (const key of keys) {
      if (row && row[key] !== undefined && row[key] !== null) return row[key];
    }
    return undefined;
  }

  mapAgentRow = (a) => ({
    id: this.pick(a, "agent_id", "agentid", "id"),
    code: this.pick(a, "agent_code", "agentcode") || "",
    name: this.pick(a, "agent_name", "agentname", "name") || "",
    description: this.pick(a, "description") || "",
    roleName: this.pick(a, "role_name", "rolename") || "-",
    goal: this.pick(a, "goal") || "-",
    backstory: this.pick(a, "backstory") || "",
    instructions: this.pick(a, "instructions") || "",
    expectedOutput: this.pick(a, "expected_output", "expectedoutput") || "-",
    isActive: (this.pick(a, "is_active", "isactive") ?? true) ? 1 : 0,
    createdAt: String(this.pick(a, "created_date", "createddate", "created_at") || "").slice(0, 10),
  });

  mapBotRow = (b) => {
    const agents = this.pick(b, "agent_names", "agentnames", "agents") || "";
    const status = String(this.pick(b, "bot_status", "botstatus", "status") || "DRAFT").toUpperCase();
    return {
      id: this.pick(b, "bot_id", "botid", "id"),
      code: this.pick(b, "bot_code", "botcode") || "",
      name: this.pick(b, "bot_name", "botname", "name") || "",
      knowledgeBase: this.pick(b, "knowledge_base_name", "knowledgebasename", "kbname") || "-",
      knowledgeBaseId: this.pick(b, "knowledge_base_id", "knowledgebaseid"),
      description: this.pick(b, "description") || "",
      guidelineId: this.pick(b, "guideline_id", "guidelineid"),
      languageCode: this.pick(b, "default_language_code", "defaultlanguagecode") || "",
      agentIds: String(this.pick(b, "agent_ids", "agentids") || ""),
      agents: Array.isArray(agents) ? agents : String(agents).split(",").map((x) => x.trim()).filter(Boolean),
      conversations: Number(this.pick(b, "conversation_count", "conversationcount") || 0) || 0,
      satisfaction: Number(this.pick(b, "avg_rating", "avgrating", "satisfaction") || 0) || 0,
      // ACTIVE / INACTIVE / DRAFT -> the labels the cards already use.
      status: status.charAt(0) + status.slice(1).toLowerCase(),
      taggedUsers: Number(this.pick(b, "tagged_user_count", "taggedusercount", "user_count") || 0),
      createdAt: String(this.pick(b, "created_date", "createddate", "created_at") || "").slice(0, 10),
    };
  };

  // Knowledge bases for the Create Chat Bot dropdown. save-bot needs the id,
  // so the option value is the id and the label is the name.
  async loadKnowledgeBases() {
    const { custcode, orgcode } = this.sessionCodes();
    try {
      const token = await getKbAuthToken();
      const params = new URLSearchParams({
        par_custcode: custcode || "0",
        par_orgcode: orgcode || "0",
        par_appcode: "0",
        auth_token: token,
        book_id: String(sessionStorage.getItem("programCode") || ""),
      });
      const res = await fetch(`${GET_EXISTING_KB_URL}?${params.toString()}`);
      const json = await res.json().catch(() => null);
      const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
      const options = [];
      list.forEach((kb) => {
        const name = String(kb?.knowladgebasename || kb?.knowledgebasename || kb?.kbname || "").trim();
        const id = String(kb?.knowledgebase_id ?? kb?.knowledgebaseid ?? kb?.kid ?? "").trim();
        if (!name || !id || options.some((o) => o.value === id)) return;
        options.push({ value: id, label: name });
      });
      this.setState({ kbOptionsData: options });
    } catch (e) {
      console.warn("Could not load knowledge bases", e);
      this.setState({ kbOptionsData: [] });
    }
  }

  // Languages for the Create Chat Bot dropdown (defaultlanguagecode).
  async loadLanguages() {
    const { custcode, orgcode } = this.sessionCodes();
    try {
      const { ok, json } = await this.apiPost(GET_LANGUAGE_DATA_URL, {
        custcode, orgcode, isactive: true,
      });
      if (!ok || !json) return;
      const rows = Array.isArray(json.results) ? json.results : [];
      const options = rows
        .map((l) => ({
          value: String(this.pick(l, "language_code", "languagecode") || ""),
          label: String(this.pick(l, "language_name", "languagename") || ""),
        }))
        .filter((o) => o.value && o.label);
      if (!options.length) return;
      this.setState((prev) => ({
        languageOptionsData: options,
        newLang: options.some((o) => o.value === prev.newLang) ? prev.newLang : options[0].value,
      }));
    } catch (e) {
      console.warn("Could not load languages", e);
    }
  }

  // Create Chat Bot popup -> save-bot. botid 0 creates; the list is then read
  // back so the ids come from the database.
  async saveBot(form) {
    const { custcode, orgcode, usercode } = this.sessionCodes();
    const editingId = this.state.editBotId;
    try {
      const { ok, json, status } = await this.apiPost(SAVE_BOT_URL, {
        custcode, orgcode, usercode,
        botid: editingId || 0,
        botname: form.name,
        description: form.description,
        knowledgebaseid: Number(form.knowledgeBaseId),
        guidelineid: Number(form.guidelineId) || undefined,
        defaultlanguagecode: form.languageCode,
        status: String(form.status).toUpperCase(),
        agentids: form.agentIds,
      });
      if (!ok || !json || json.success !== true) {
        return this.toastMsg(editingId ? "Could not update chat bot" : "Could not create chat bot",
          (json && (json.message || json.error)) || `Request failed (${status}).`);
      }
    } catch (e) {
      return this.toastMsg(editingId ? "Could not update chat bot" : "Could not create chat bot",
        "The chat bot API is not reachable.");
    }
    this.setState({
      showCreate: false, createTouched: false, editBotId: null,
      newName: "", newKb: "", newGuideline: "", newDesc: "", newAgents: "", newStatus: "Draft",
    });
    this.toastMsg(editingId ? "Chat Bot Updated" : "Chat Bot Created",
      editingId ? `${form.name} has been updated.`
        : `${form.name} has been successfully created and added to your chat bot list.`);
    this.loadBots();
  }

  // Agent Management list. The list is left as it is when the API cannot be
  // reached, so the page still renders.
  async loadAgents() {
    const { custcode, orgcode } = this.sessionCodes();
    try {
      const st = this.state;
      const { ok, json } = await this.apiPost(GET_AGENT_DATA_URL, {
        custcode, orgcode, agentid: 0,
        searchtext: st.agentSearch || undefined,
        isactive: st.agentStatusFilter === "All" ? undefined : st.agentStatusFilter === "Active",
        pageno: st.agentPage || 1, pagesize: PAGE_SIZE,
      });
      if (!ok || !json) return;
      const rows = Array.isArray(json.results) ? json.results : [];
      this.setState({
        agentsData: rows.map(this.mapAgentRow),
        agentTotal: Number(json.totalcount || rows.length) || 0,
      });
    } catch (e) {
      console.warn("Could not load agents", e);
    }
  }

  // Manage Chat Bots list.
  async loadBots() {
    const { custcode, orgcode } = this.sessionCodes();
    try {
      const st = this.state;
      const { ok, json } = await this.apiPost(GET_BOT_DATA_URL, {
        custcode, orgcode, botid: 0,
        status: st.statusFilter && st.statusFilter !== "All" ? String(st.statusFilter).toUpperCase() : undefined,
        searchtext: st.botSearch || undefined,
        pageno: st.botPage || 1, pagesize: PAGE_SIZE,
      });
      if (!ok || !json) return;
      const rows = Array.isArray(json.results) ? json.results : [];
      this.setState({
        bots: rows.map(this.mapBotRow),
        botTotal: Number(json.totalcount || rows.length) || 0,
      });
    } catch (e) {
      console.warn("Could not load chat bots", e);
    }
  }

  // The pencil on a bot card: the same popup, filled in, saving with the
  // bot's own id so usp_save_bot updates that row.
  openEditBot(bot) {
    this.setState({
      showCreate: true, createTouched: false, editBotId: bot.id,
      newName: bot.name || "",
      newDesc: bot.description || "",
      newKb: bot.knowledgeBaseId != null ? String(bot.knowledgeBaseId) : "",
      newGuideline: bot.guidelineId != null ? String(bot.guidelineId) : "",
      newAgents: (bot.agentIds || "").split(",")[0] || "",
      newStatus: bot.status || "Draft",
      newLang: bot.languageCode || this.state.newLang,
    });
  }

  // The bin on a bot card -> delete-bot. The procedure refuses (IA001) once
  // the bot has conversations.
  async deleteBot(id, name) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    const { custcode, orgcode, usercode } = this.sessionCodes();
    try {
      const { ok, json, status } = await this.apiPost(DELETE_BOT_URL, {
        custcode, orgcode, usercode, botid: String(id),
      });
      if (!ok || !json || json.success !== true) {
        return this.toastMsg("Could not delete chat bot",
          (json && (json.message || json.error)) || `Request failed (${status}).`);
      }
    } catch (e) {
      return this.toastMsg("Could not delete chat bot", "The chat bot API is not reachable.");
    }
    this.toastMsg("Chat Bot Deleted", `${name} has been removed.`);
    this.loadBots();
  }

  // The bin on a conversation row -> delete-bot-conversation.
  async deleteConversation(id, who) {
    if (!window.confirm(`Delete the conversation with ${who}? This cannot be undone.`)) return;
    const { custcode, orgcode, usercode } = this.sessionCodes();
    try {
      const { ok, json, status } = await this.apiPost(DELETE_BOT_CONVERSATION_URL, {
        custcode, orgcode, usercode, botconversationid: String(id),
      });
      if (!ok || !json || json.success !== true) {
        return this.toastMsg("Could not delete conversation",
          (json && (json.message || json.error)) || `Request failed (${status}).`);
      }
    } catch (e) {
      return this.toastMsg("Could not delete conversation", "The chat bot API is not reachable.");
    }
    this.setState({ selectedConvId: null });
    this.toastMsg("Conversation Deleted", "The conversation has been removed.");
    this.loadConversations();
  }

  // The pencil on an agent card: the same popup, filled in, saving with the
  // agent's own id so usp_save_agent updates that row.
  openEditAgent(agent) {
    this.setState({
      showCreateAgent: true, createAgentTouched: false,
      editAgentId: agent.id, editAgentCode: agent.code || "",
      agentName: agent.name || "", agentDesc: agent.description || "",
      agentRole: agent.roleName === "-" ? "" : (agent.roleName || ""),
      agentGoal: agent.goal === "-" ? "" : (agent.goal || ""),
      agentBackstory: agent.backstory || "",
      agentInstructions: agent.instructions || "",
      agentExpectedOutput: agent.expectedOutput === "-" ? "" : (agent.expectedOutput || ""),
      agentIsActive: !!agent.isActive,
    });
  }

  // The bin on an agent card -> delete-agent. The procedure refuses (IA001)
  // while a bot still uses the agent.
  async deleteAgent(id, name) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    const { custcode, orgcode, usercode } = this.sessionCodes();
    try {
      const { ok, json, status } = await this.apiPost(DELETE_AGENT_URL, {
        custcode, orgcode, usercode, agentid: String(id),
      });
      if (!ok || !json || json.success !== true) {
        return this.toastMsg("Could not delete agent",
          (json && (json.message || json.error)) || `Request failed (${status}).`);
      }
    } catch (e) {
      return this.toastMsg("Could not delete agent", "The agent API is not reachable.");
    }
    this.toastMsg("Agent Deleted", `${name} has been removed from your agent list.`);
    this.loadAgents();
  }

  // Create Agent popup -> save-agent. agentid 0 creates; the list is then read
  // back so the ids come from the database.
  async saveAgent(form) {
    const { custcode, orgcode, usercode } = this.sessionCodes();
    const editingId = this.state.editAgentId;
    // An update keeps the code it was created with.
    const agentcode = editingId
      ? this.state.editAgentCode
      : String(form.name).trim().toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
    try {
      const { ok, json, status } = await this.apiPost(SAVE_AGENT_URL, {
        custcode, orgcode, usercode,
        agentid: editingId || 0,
        agentcode,
        agentname: form.name,
        description: form.description,
        rolename: form.roleName,
        goal: form.goal,
        backstory: form.backstory,
        instructions: form.instructions,
        expectedoutput: form.expectedOutput,
        isactive: !!form.isActive,
        ...AGENT_DEFAULTS,
      });
      if (!ok || !json || json.success !== true) {
        return this.toastMsg(editingId ? "Could not update agent" : "Could not create agent",
          (json && (json.message || json.error)) || `Request failed (${status}).`);
      }
    } catch (e) {
      return this.toastMsg(editingId ? "Could not update agent" : "Could not create agent",
        "The agent API is not reachable.");
    }
    this.setState({
      showCreateAgent: false, createAgentTouched: false, editAgentId: null, editAgentCode: "",
      agentName: "", agentDesc: "", agentRole: "", agentGoal: "",
      agentBackstory: "", agentInstructions: "", agentExpectedOutput: "", agentIsActive: true,
    });
    this.toastMsg(editingId ? "Agent Updated" : "Agent Created",
      editingId ? `${form.name} has been updated.`
        : `${form.name} has been successfully created and added to your agent list.`);
    this.loadAgents();
  }

  async loadGuidelines() {
    try {
      const session = (key) => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
      let userInfo = {};
      try { userInfo = JSON.parse(session("userInfo") || "{}") || {}; } catch { userInfo = {}; }
      const payload = {
        par_kid: "0",
        par_guidelinetype: "0",
        par_guidelinename: "0",
        par_orgcode: session("orgcode") || userInfo.orgCode || userInfo.organizationcode || "0",
        par_custcode: session("custcode") || userInfo.customerCode || userInfo.custCode || "0",
        par_appcode: "0",
        book_id: "",
      };
      const res = await fetch(GET_GENERAL_GUIDELINES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
      const options = [];
      list.forEach((g) => {
        // Content guidelines only; the other types do not apply to a chat bot.
        const type = String(g?.guidelinetype || g?.guideline_type || "").trim().toLowerCase();
        if (type !== "content") return;
        const name = String(g?.guidelinename || g?.guideline_name || g?.name || "").trim();
        if (!name || options.some((o) => o.label === name)) return;
        const id = String(g?.guideline_id ?? g?.guidelineid ?? g?.kid ?? g?.id ?? "").trim();
        options.push({ value: id || name, label: name });
      });
      this.setState({ guidelineOptionsData: options });
    } catch (e) {
      console.warn("Could not load guideline names", e);
      this.setState({ guidelineOptionsData: [] });
    }
  }

  get embedSnippet() {
    const tag = "scr" + "ipt";
    return '<html dir="ltr" lang="en">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Chat bot demo</title>\n  <' + tag + ' src="' + BOT_WIDGET_SCRIPT_URL + '"></' + tag + '>\n</head>\n<body>\n</body>\n</html>';
  }

  el(t, p, ...c) { return React.createElement(t, p, ...c); }

  icon(name, color, size) {
    const p = { width: size || 18, height: size || 18, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
    const m = {
      dashboard: [["rect",{x:3,y:3,width:7,height:9,rx:1}],["rect",{x:14,y:3,width:7,height:5,rx:1}],["rect",{x:14,y:12,width:7,height:9,rx:1}],["rect",{x:3,y:16,width:7,height:5,rx:1}]],
      bot: [["path",{d:"M12 8V4H8"}],["rect",{x:4,y:8,width:16,height:12,rx:2}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]],
      msg: [["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}]],
      chart: [["path",{d:"M3 3v18h18"}],["rect",{x:7,y:10,width:3,height:8}],["rect",{x:12,y:6,width:3,height:12}],["rect",{x:17,y:13,width:3,height:5}]],
      book: [["path",{d:"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"}]],
      users: [["path",{d:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"}],["circle",{cx:9,cy:7,r:4}],["path",{d:"M23 21v-2a4 4 0 0 0-3-3.87"}],["path",{d:"M16 3.13a4 4 0 0 1 0 7.75"}]],
      trend: [["path",{d:"M22 12h-4l-3 9L9 3l-3 9H2"}]],
      plus: [["line",{x1:12,y1:5,x2:12,y2:19}],["line",{x1:5,y1:12,x2:19,y2:12}]],
      copy: [["rect",{x:9,y:9,width:13,height:13,rx:2}],["path",{d:"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"}]],
      eye: [["path",{d:"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"}],["circle",{cx:12,cy:12,r:3}]],
      pause: [["rect",{x:6,y:4,width:4,height:16,rx:1}],["rect",{x:14,y:4,width:4,height:16,rx:1}]],
      play: [["polygon",{points:"5 3 19 12 5 21 5 3"}]],
      check: [["path",{d:"M22 11.08V12a10 10 0 1 1-5.93-9.14"}],["polyline",{points:"22 4 12 14.01 9 11.01"}]],
      tick: [["polyline",{points:"20 6 9 17 4 12"}]],
      clock: [["circle",{cx:12,cy:12,r:10}],["polyline",{points:"12 6 12 12 16 14"}]],
      star: [["polygon",{points:"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"}]],
      userplus: [["path",{d:"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"}],["circle",{cx:8.5,cy:7,r:4}],["line",{x1:20,y1:8,x2:20,y2:14}],["line",{x1:23,y1:11,x2:17,y2:11}]],
      shield: [["path",{d:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"}]],
      download: [["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["polyline",{points:"7 10 12 15 17 10"}],["line",{x1:12,y1:15,x2:12,y2:3}]],
      code: [["polyline",{points:"16 18 22 12 16 6"}],["polyline",{points:"8 6 2 12 8 18"}]],
      send: [["line",{x1:22,y1:2,x2:11,y2:13}],["polygon",{points:"22 2 15 22 11 13 2 9 22 2"}]],
      eyeoff: [["path",{d:"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94"}],["path",{d:"M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"}],["line",{x1:1,y1:1,x2:23,y2:23}]],
      globe: [["circle",{cx:12,cy:12,r:10}],["line",{x1:2,y1:12,x2:22,y2:12}],["path",{d:"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"}]],
      pencil: [["path",{d:"M12 20h9"}],["path",{d:"M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"}]],
      trash: [["polyline",{points:"3 6 5 6 21 6"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}],["line",{x1:10,y1:11,x2:10,y2:17}],["line",{x1:14,y1:11,x2:14,y2:17}]],
    };
    return this.el("svg", p, ...(m[name] || []).map((c, i) => this.el(c[0], { key: i, ...c[1] })));
  }

  // Shown wherever a chart has nothing to draw.
  emptyChart(label) {
    return this.el("div", {
      style: { height: "180px", display: "flex", alignItems: "center", justifyContent: "center",
        color: "#94a3b8", fontSize: ".8125rem" },
    }, label || "No data yet");
  }

  fmtNum(v) { return typeof v === "number" ? v.toLocaleString() : v; }
  setTip(t) { const c = this.state.tip; if (t && c && c.id === t.id && c.i === t.i) return; if (!t && !c) return; this.setState({ tip: t }); }

  svgTip(id, i, cx, cy, padL, padT, plotW, plotH, title, items) {
    const lineH = 30, w = 226, boxH = 40 + items.length * lineH, ch = [];
    let bx = cx + 16; if (bx + w > padL + plotW) bx = cx - 16 - w; if (bx < padL) bx = padL + 4;
    let by = cy - boxH / 2; if (by < padT) by = padT; if (by + boxH > padT + plotH) by = padT + plotH - boxH;
    ch.push(this.el("rect", { key: "bg", x: bx, y: by, width: w, height: boxH, rx: 12, fill: "#fff", stroke: "#e2e8f0", strokeWidth: 1.5, style: { filter: "drop-shadow(0 6px 16px rgba(15,23,42,.14))" } }));
    ch.push(this.el("text", { key: "t", x: bx + 16, y: by + 27, fontSize: 16, fontWeight: 600, fill: "#0f172a" }, title));
    items.forEach((it, k) => {
      const y = by + 40 + k * lineH + 20;
      ch.push(this.el("circle", { key: "d" + k, cx: bx + 20, cy: y - 5, r: 5, fill: it.color }));
      ch.push(this.el("text", { key: "l" + k, x: bx + 32, y, fontSize: 14, fill: "#475569" }, it.label));
      ch.push(this.el("text", { key: "v" + k, x: bx + w - 16, y, fontSize: 14, fontWeight: 600, fill: "#0f172a", textAnchor: "end" }, this.fmtNum(it.value)));
    });
    return this.el("g", { key: "tip", style: { pointerEvents: "none" } }, ...ch);
  }

  areaChart(data, keys, height, id, wide) {
    if (!data || !data.length) return this.emptyChart();
    const H = height || 260, W = wide ? 1040 : 680, padL = 62, padR = 16, padT = 14, plotH = H - padT - 42, plotW = W - padL - padR;
    const max = Math.max(1, ...data.flatMap(d => keys.map(s => d[s.k]))), n = data.length, ch = [];
    for (let i = 0; i <= 4; i++) { const y = padT + plotH * (i / 4); const val = Math.round(max * (1 - i / 4)); ch.push(this.el("line", { key: "g" + i, x1: padL, y1: y, x2: W - padR, y2: y, stroke: "#eef1f5", strokeWidth: 1 })); ch.push(this.el("text", { key: "yl" + i, x: padL - 12, y: y + 7, textAnchor: "end", fontSize: 15, fill: "#94a3b8" }, this.fmtNum(val))); }
    const X = di => padL + plotW * (di / (n - 1));
    keys.forEach((s, si) => {
      const pts = data.map((d, di) => [X(di), padT + plotH - plotH * (d[s.k] / max)]);
      ch.push(this.el("polygon", { key: "a" + si, points: `${padL},${padT + plotH} ${pts.map(p => p.join(",")).join(" ")} ${padL + plotW},${padT + plotH}`, fill: s.c, opacity: 0.12 }));
      ch.push(this.el("polyline", { key: "l" + si, points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: s.c, strokeWidth: 2.75 }));
    });
    data.forEach((d, di) => ch.push(this.el("text", { key: "x" + di, x: X(di), y: H - 8, textAnchor: "middle", fontSize: 15, fill: "#64748b" }, d.label)));
    const tip = id && this.state.tip && this.state.tip.id === id ? this.state.tip : null;
    if (tip) {
      const di = tip.i, x = X(di);
      ch.push(this.el("line", { key: "hv", x1: x, y1: padT, x2: x, y2: padT + plotH, stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "4 4" }));
      keys.forEach((s, si) => { const cy = padT + plotH - plotH * (data[di][s.k] / max); ch.push(this.el("circle", { key: "hp" + si, cx: x, cy, r: 5.5, fill: "#fff", stroke: s.c, strokeWidth: 3 })); });
      ch.push(this.svgTip(id, di, x, padT + plotH / 3, padL, padT, plotW, plotH, data[di].label, keys.map(s => ({ label: s.label || s.k, color: s.c, value: data[di][s.k] }))));
    }
    if (id) data.forEach((d, di) => { const w = plotW / n; ch.push(this.el("rect", { key: "hz" + di, x: X(di) - w / 2, y: padT, width: w, height: plotH, fill: "transparent", onMouseEnter: () => this.setTip({ id, i: di }), onMouseLeave: () => this.setTip(null) })); });
    return this.el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", style: { height: "auto", display: "block" }, preserveAspectRatio: "xMidYMid meet" }, ...ch);
  }

  lineChart(data, keys, height) {
    if (!data || !data.length) return this.emptyChart();
    const H = height || 200, W = 900, padL = 34, padR = 12, padT = 10, plotH = H - padT - 24, plotW = W - padL - padR;
    const max = Math.max(1, ...data.flatMap(d => keys.map(s => d[s.k]))), n = data.length, ch = [];
    for (let i = 0; i <= 4; i++) { const y = padT + plotH * (i / 4); ch.push(this.el("line", { key: "g" + i, x1: padL, y1: y, x2: W - padR, y2: y, stroke: "#eef1f5", strokeWidth: 1 })); }
    keys.forEach((s, si) => {
      const pts = data.map((d, di) => [padL + plotW * (di / (n - 1)), padT + plotH - plotH * (d[s.k] / max)]);
      ch.push(this.el("polyline", { key: "l" + si, points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: s.c, strokeWidth: 2.5 }));
      pts.forEach((p, pi) => ch.push(this.el("circle", { key: `d${si}-${pi}`, cx: p[0], cy: p[1], r: 3, fill: s.c })));
    });
    data.forEach((d, di) => ch.push(this.el("text", { key: "x" + di, x: padL + plotW * (di / (n - 1)), y: H - 6, textAnchor: "middle", fontSize: 13, fill: "#64748b" }, d.label)));
    return this.el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, preserveAspectRatio: "xMidYMid meet" }, ...ch);
  }

  barChart(data, keys, height, rotate, id) {
    if (!data || !data.length) return this.emptyChart();
    const H = height || 260, W = rotate ? 1040 : 680, padL = 62, padR = 16, padT = 14, padB = rotate ? 78 : 42, plotH = H - padT - padB, plotW = W - padL - padR;
    const max = Math.max(1, ...data.flatMap(d => keys.map(s => d[s.k]))), n = data.length, ch = [];
    for (let i = 0; i <= 4; i++) { const y = padT + plotH * (i / 4); const val = Math.round(max * (1 - i / 4)); ch.push(this.el("line", { key: "g" + i, x1: padL, y1: y, x2: W - padR, y2: y, stroke: "#eef1f5", strokeWidth: 1 })); ch.push(this.el("text", { key: "yl" + i, x: padL - 12, y: y + 7, textAnchor: "end", fontSize: 15, fill: "#94a3b8" }, this.fmtNum(val))); }
    const groupW = plotW / n, barW = (groupW * (rotate ? 0.62 : 0.6)) / keys.length;
    const tip = id && this.state.tip && this.state.tip.id === id ? this.state.tip : null;
    data.forEach((d, di) => {
      const gx = padL + groupW * di + groupW * 0.2, active = tip && tip.i === di;
      keys.forEach((s, si) => { const h = plotH * (d[s.k] / max); ch.push(this.el("rect", { key: `b${di}-${si}`, x: gx + barW * si, y: padT + plotH - h, width: barW - 2, height: h, rx: 3, fill: s.c, opacity: tip && !active ? 0.4 : 1 })); });
      const lx = padL + groupW * di + groupW / 2;
      if (rotate) ch.push(this.el("text", { key: "x" + di, x: lx, y: H - padB + 18, fontSize: 13, fill: "#64748b", transform: `rotate(-35 ${lx} ${H - padB + 18})`, textAnchor: "end" }, d.label));
      else ch.push(this.el("text", { key: "x" + di, x: lx, y: H - padB + 24, textAnchor: "middle", fontSize: 15, fill: "#64748b" }, d.label));
    });
    if (tip) { const di = tip.i, cx = padL + groupW * di + groupW / 2; ch.push(this.svgTip(id, di, cx, padT + plotH / 3, padL, padT, plotW, plotH, data[di].label, keys.map(s => ({ label: s.label || s.k, color: s.c, value: data[di][s.k] })))); }
    if (id) data.forEach((d, di) => ch.push(this.el("rect", { key: "hz" + di, x: padL + groupW * di, y: padT, width: groupW, height: plotH, fill: "transparent", onMouseEnter: () => this.setTip({ id, i: di }), onMouseLeave: () => this.setTip(null) })));
    return this.el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", style: { height: "auto", display: "block" }, preserveAspectRatio: "xMidYMid meet" }, ...ch);
  }

  funnelChart(defs, fi) {
    if (!defs || !defs.length) return this.emptyChart("No funnel data");
    const W = 520, L = 150, R = 120, padT = 8, bandH = 58, gap = 24, n = defs.length;
    const centerW = W - L - R, cx = L + centerW / 2, maxV = defs[0].count;
    const wOf = v => Math.max(24, (v / maxV) * centerW);
    const H = padT * 2 + n * bandH + (n - 1) * gap, ch = [];
    defs.forEach((d, i) => {
      const y = padT + i * (bandH + gap), wTop = wOf(d.count), wBot = wOf(i < n - 1 ? defs[i + 1].count : d.count * 0.8);
      const active = fi === i, dim = fi != null && !active;
      ch.push(this.el("polygon", { key: "p" + i, points: `${cx - wTop / 2},${y} ${cx + wTop / 2},${y} ${cx + wBot / 2},${y + bandH} ${cx - wBot / 2},${y + bandH}`, fill: d.color, opacity: dim ? 0.42 : 1, style: { transition: "opacity .15s", filter: active ? "drop-shadow(0 5px 12px " + d.color + "66)" : "none" } }));
      ch.push(this.el("text", { key: "n" + i, x: L - 12, y: y + bandH / 2 + 1, textAnchor: "end", fontSize: 13, fontWeight: 600, fill: "#334155" }, d.stage));
      ch.push(this.el("text", { key: "v" + i, x: W - R + 12, y: y + bandH / 2 - 4, textAnchor: "start", fontSize: 15, fontWeight: 600, fill: "#0f172a" }, d.pct + "%"));
      ch.push(this.el("text", { key: "c" + i, x: W - R + 12, y: y + bandH / 2 + 12, textAnchor: "start", fontSize: 12, fill: "#94a3b8" }, d.count.toLocaleString()));
      if (i < n - 1) { const conv = ((defs[i + 1].count / d.count) * 100).toFixed(0); ch.push(this.el("text", { key: "cv" + i, x: cx, y: y + bandH + gap / 2 + 4, textAnchor: "middle", fontSize: 12, fontWeight: 600, fill: "#64748b" }, "\u2193 " + conv + "% continue")); }
    });
    defs.forEach((d, i) => { const y = padT + i * (bandH + gap); ch.push(this.el("rect", { key: "h" + i, x: 0, y: y - gap / 2, width: W, height: bandH + gap, fill: "transparent", style: { cursor: "pointer" }, onMouseEnter: () => this.setState({ selectedFunnel: i }), onClick: () => this.setState({ selectedFunnel: i }) })); });
    return this.el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", style: { height: "auto", display: "block" }, preserveAspectRatio: "xMidYMid meet" }, ...ch);
  }

  gauge(pct, label, color) {
    const r = 34, C = 2 * Math.PI * r, prog = Math.min(pct, 100) / 100 * C;
    return this.el("svg", { viewBox: "0 0 88 88", width: "88", height: "88", style: { display: "block" } },
      this.el("circle", { key: "t", cx: 44, cy: 44, r, fill: "none", stroke: "#eef2f7", strokeWidth: 8 }),
      this.el("circle", { key: "p", cx: 44, cy: 44, r, fill: "none", stroke: color, strokeWidth: 8, strokeLinecap: "round", strokeDasharray: `${prog} ${C - prog}`, transform: "rotate(-90 44 44)", style: { transition: "stroke-dasharray .5s ease" } }),
      this.el("text", { key: "v", x: 44, y: 42, textAnchor: "middle", fontSize: 16, fontWeight: 600, fill: "#0f172a" }, label),
      this.el("text", { key: "n", x: 44, y: 58, textAnchor: "middle", fontSize: 10, fontWeight: 600, fill: color }, pct + "%"));
  }

  arcPath(cx, cy, r, ir, a0, a1) {
    const pt = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x1, y1] = pt(a0, r), [x2, y2] = pt(a1, r), [x3, y3] = pt(a1, ir), [x4, y4] = pt(a0, ir);
    return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${ir},${ir} 0 ${large} 0 ${x4},${y4} Z`;
  }
  pieChart(data, key, colors, height) {
    if (!data || !data.length) return this.emptyChart();
    const H = height || 300, cx = 150, cy = 150, r = 120, ir = 62, total = data.reduce((a, b) => a + b[key], 0) || 1, ch = [];
    let a0 = -Math.PI / 2;
    data.forEach((d, i) => { const a1 = a0 + (d[key] / total) * Math.PI * 2; ch.push(this.el("path", { key: i, d: this.arcPath(cx, cy, r, ir, a0, a1 - 0.01), fill: colors[i % colors.length] })); a0 = a1; });
    return this.el("svg", { viewBox: `0 0 300 ${H}`, width: "100%", height: H, preserveAspectRatio: "xMidYMid meet" }, ...ch);
  }

  heatmap(rows) {
    if (!rows || !rows.length) return this.emptyChart("No usage data");
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const full = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const header = this.el("div", { key: "h", style: { display: "grid", gridTemplateColumns: "44px repeat(7,1fr)", gap: "3px", marginBottom: "3px" } },
      this.el("div", { key: "c" }), ...days.map((d, i) => this.el("div", { key: i, style: { textAlign: "center", fontSize: "13px", fontWeight: 600, color: "#64748b" } }, d)));
    const grid = rows.map((row, ri) => this.el("div", { key: ri, style: { display: "grid", gridTemplateColumns: "44px repeat(7,1fr)", gap: "3px", marginBottom: "3px" } },
      this.el("div", { key: "l", style: { fontSize: "12px", color: "#64748b", textAlign: "right", paddingRight: "6px", lineHeight: "16px" } }, row.hour + ":00"),
      ...full.map((f, ci) => { const v = row[f], op = Math.max(0.08, v / 100); return this.el("div", { key: ci, title: `${days[ci]} ${row.hour}:00 — ${v}% usage`, style: { height: "16px", borderRadius: "3px", background: `rgba(0,108,224,${op})` } }); })));
    const legend = this.el("div", { key: "lg", style: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", marginTop: "6px", borderTop: "1px solid #f1f5f9", fontSize: "13px", color: "#64748b" } },
      this.el("span", { key: "a" }, "Low usage"),
      this.el("div", { key: "b", style: { display: "flex", alignItems: "center", gap: "6px" } },
        this.el("div", { style: { display: "flex", gap: "3px" } }, ...[0.15, 0.35, 0.55, 0.75, 1].map((o, i) => this.el("div", { key: i, style: { width: "14px", height: "14px", borderRadius: "3px", background: `rgba(0,108,224,${o})` } }))),
        this.el("span", {}, "High usage")));
    return this.el("div", {}, header, ...grid, legend);
  }

  go(v) { this.setState({ view: v, selectedConvId: null }); }
  toastMsg(title, desc) { this.setState({ toast: { title, desc } }); clearTimeout(this._t); this._t = setTimeout(() => this.setState({ toast: null }), 2600); }

  get botData() {
    return this.state.bots || [
      { id: 1, name: "Course Support Bot", knowledgeBase: "General Course KB", agents: ["Support Agent"], conversations: 1234, satisfaction: 4.8, status: "Active", createdAt: "2024-01-15" },
      { id: 2, name: "Technical Help Bot", knowledgeBase: "Technical KB", agents: ["Tech Agent", "Escalation"], conversations: 856, satisfaction: 4.6, status: "Active", createdAt: "2024-02-01" },
      { id: 3, name: "Enrollment Bot", knowledgeBase: "Enrollment KB", agents: ["Enrollment Agent"], conversations: 0, satisfaction: 0, status: "Draft", createdAt: "2024-07-20" },
    ];
  }
  // The Published switch on a bot card -> update-bot-status. The card flips
  // straight away and flips back if the call does not succeed.
  async togglePublish(id) {
    const before = this.botData;
    const bot = before.find(b => b.id === id);
    if (!bot) return;
    const newStatus = bot.status === "Active" ? "Inactive" : "Active";
    this.setState({ bots: before.map(b => b.id === id ? { ...b, status: newStatus } : b) });

    const { custcode, orgcode, usercode } = this.sessionCodes();
    try {
      const { ok, json, status } = await this.apiPost(UPDATE_BOT_STATUS_URL, {
        custcode, orgcode, usercode, botid: bot.id, status: newStatus.toUpperCase(),
      });
      if (!ok || !json || json.success !== true) {
        this.setState({ bots: before });
        return this.toastMsg("Could not change status",
          (json && (json.message || json.error)) || `Request failed (${status}).`);
      }
    } catch (e) {
      this.setState({ bots: before });
      return this.toastMsg("Could not change status", "The chat bot API is not reachable.");
    }
    this.toastMsg(`Chat Bot ${newStatus}`, `${bot.name} has been ${newStatus.toLowerCase()}.`);
  }
  openEmbed() { this.setState({ showEmbed: true, embedCode: this.embedSnippet }); }
  copyEmbedCode() { try { navigator.clipboard.writeText(this.state.embedCode); } catch (e) {} this.setState({ showEmbed: false }); this.toastMsg("Embed Code Copied", "The embed code has been copied to your clipboard."); }

  // A visitor funnel needs a procedure that none of the 21 provides.
  funnelDefs = [];

  botAnalytics(bot) {
    const a = this.state.analyticsData;
    if (!bot || !a || a.botId !== bot.id) return null;
    return {
      daily: a.daily,
      topIntents: a.topIntents,
      // No procedure returns per-user activity, escalation reasons or fallback
      // categories, so those panels stay empty.
      users: [],
      escalation: { rate: a.escalationRate, escalated: a.escalated, total: a.total, trends: [], reasons: [] },
      fallback: { rate: a.fallbackRate, total: a.fallbackTotal, categories: [], recent: a.fallbackRecent },
    };
  }

  get conversationsData() { return this.state.conversationsList || []; }

  durationLabel(start, end) {
    const a = start ? new Date(start).getTime() : NaN;
    const b = end ? new Date(end).getTime() : NaN;
    if (!isFinite(a) || !isFinite(b) || b < a) return "\u2014";
    return Math.max(1, Math.round((b - a) / 60000)) + " min";
  }

  mapConversationRow = (c) => {
    const status = String(this.pick(c, "conversation_status", "conversationstatus", "status") || "").toUpperCase();
    const sentiment = String(this.pick(c, "sentiment_code", "sentimentcode", "sentiment") || "").toLowerCase();
    const startedAt = this.pick(c, "start_datetime", "startdatetime", "created_date", "createddate");
    const endedAt = this.pick(c, "end_datetime", "enddatetime");
    return {
      id: this.pick(c, "bot_conversation_id", "botconversationid", "id"),
      threadCode: this.pick(c, "thread_code", "threadcode") || "",
      customerName: this.pick(c, "user_name", "username", "user_code", "usercode") || "\u2014",
      customerEmail: this.pick(c, "user_email", "email") || "",
      chatBotName: this.pick(c, "bot_name", "botname") || "\u2014",
      category: this.pick(c, "intent_code", "intentcode", "title") || "\u2014",
      duration: this.durationLabel(startedAt, endedAt),
      date: String(startedAt || "").slice(0, 10),
      status: status === "COMPLETED" ? "completed" : status === "OPEN" ? "open" : (status.toLowerCase() || "open"),
      sentiment: ["positive", "negative", "neutral"].includes(sentiment) ? sentiment : "neutral",
      resolvedByBot: status === "COMPLETED",
      handoff: false,
      rating: this.pick(c, "user_rating", "userrating") || null,
    };
  };

  mapMessageRow = (m) => {
    const sender = String(this.pick(m, "message_type", "messagetype", "sender_type", "sendertype", "sender") || "").toUpperCase();
    const at = String(this.pick(m, "created_date", "createddate", "message_datetime", "messagedatetime") || "");
    return {
      speaker: sender === "USER" ? "customer" : sender === "SYSTEM" ? "system" : "bot",
      timestamp: at.length >= 16 ? at.slice(11, 16) : at,
      message: String(this.pick(m, "message_text", "messagetext", "message", "content") || ""),
      handoff: null,
    };
  };

  // The Conversations tab.
  async loadConversations() {
    const { custcode, orgcode } = this.sessionCodes();
    try {
      const st = this.state;
      const { ok, json } = await this.apiPost(GET_BOT_CONVERSATION_DATA_URL, {
        custcode, orgcode,
        conversationstatus: st.convStatusFilter && st.convStatusFilter !== "All" ? st.convStatusFilter : undefined,
        sentimentcode: st.convSentimentFilter && st.convSentimentFilter !== "All" ? st.convSentimentFilter : undefined,
        fromdate: st.convStart || undefined,
        todate: st.convEnd || undefined,
        searchtext: st.convSearch || undefined,
        pageno: st.convPage || 1, pagesize: PAGE_SIZE,
      });
      if (!ok || !json) return;
      const rows = Array.isArray(json.results) ? json.results : [];
      this.setState({
        conversationsList: rows.map(this.mapConversationRow),
        convTotal: Number(json.totalcount || rows.length) || 0,
      });
    } catch (e) {
      console.warn("Could not load conversations", e);
    }
  }

  // Opening a transcript pulls that session's messages.
  async openConversation(id) {
    this.setState({ selectedConvId: id });
    if (this.state.convMessages[String(id)]) return;
    const { custcode, orgcode } = this.sessionCodes();
    try {
      const { ok, json } = await this.apiPost(GET_BOT_CONVERSATION_MESSAGE_DATA_URL, {
        custcode, orgcode, botconversationid: id, pageno: 1, pagesize: 200,
      });
      if (!ok || !json) return;
      const rows = Array.isArray(json.results) ? json.results : [];
      this.setState((prev) => ({
        convMessages: { ...prev.convMessages, [String(id)]: rows.map(this.mapMessageRow) },
      }));
    } catch (e) {
      console.warn("Could not load the transcript", e);
    }
  }

  // The admin the product API wants alongside orgCode, from wherever the app
  // stored it — the same order the Collaboration page looks in.
  adminUserId() {
    const read = (key) => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
    let id = read("adminUserID") || read("adminUserId") || read("userID") || "";
    if (!id) {
      for (const key of ["user", "userInfo", "userDetails", "userData"]) {
        try {
          const obj = JSON.parse(read(key) || "null");
          if (obj && typeof obj === "object") {
            id = obj.adminUserID || obj.adminUserId || obj.userID || obj.userCode || obj.usercode || "";
            if (id) break;
          }
        } catch (e) { /* next key */ }
      }
    }
    return String(id || read("userCode") || "");
  }

  // The Tag Users popup. The list is the organisation's users from the product
  // API; the ticks are whoever is already tagged to this bot.
  async openTagUsers(botId) {
    this.setState({ tagBotId: botId, tagSearch: "", tagSelected: [], tagUsersData: null });
    const { custcode, orgcode } = this.sessionCodes();

    let users = [];
    try {
      const res = await fetch(GET_USER_DETAILS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The endpoint needs both fields; orgCode alone comes back 400.
        body: JSON.stringify({ adminUserID: this.adminUserId(), orgCode: orgcode }),
      });
      const json = await res.json().catch(() => null);
      const items = Array.isArray(json) ? json
        : (Array.isArray(json && json.users) ? json.users
          : (Array.isArray(json && json.data) ? json.data
            : (Array.isArray(json && json.result) ? json.result : [])));
      users = items.map((u, i) => {
        const first = u.firstName || u.first_name || u.name || u.userName || u.loginName || "";
        const last = u.lastName || u.last_name || u.lstName || u.lastname || u.surname || "";
        return {
          id: Number(u.id ?? u.userID ?? u.userId ?? i + 1),
          name: `${first} ${last}`.trim() || u.loginName || u.userCode || "User",
          email: u.emailId || u.emailID || u.email || u.emailAddress || "",
          role: String(u.role || u.roleName || u.rolename || "user").toLowerCase(),
          department: u.department || u.departmentName || u.deptName || "",
          status: "active",
        };
      });
    } catch (e) {
      console.warn("Could not load the organisation's users", e);
    }

    let taggedIds = [];
    try {
      const { ok, json } = await this.apiPost(GET_BOT_USER_DATA_URL, {
        custcode, orgcode, botid: botId, pageno: 1, pagesize: 500,
      });
      if (ok && json && Array.isArray(json.results)) {
        taggedIds = json.results
          .filter((u) => this.pick(u, "is_tagged", "istagged"))
          .map((u) => Number(this.pick(u, "user_id", "userid", "id")))
          .filter((id) => Number.isFinite(id));
      }
    } catch (e) {
      console.warn("Could not read the tagged users", e);
    }

    this.setState({ tagUsersData: users, tagSelected: taggedIds });
  }

  // Saves the whole ticked list in one call.
  async saveBotUsers(botId, userIds, botName) {
    const { custcode, orgcode, usercode } = this.sessionCodes();
    try {
      const { ok, json, status } = await this.apiPost(SAVE_BOT_USER_URL, {
        custcode, orgcode, usercode, botid: botId, userids: userIds,
      });
      if (!ok || !json || json.success !== true) {
        return this.toastMsg("Could not tag users",
          (json && (json.message || json.error)) || `Request failed (${status}).`);
      }
    } catch (e) {
      return this.toastMsg("Could not tag users", "The chat bot API is not reachable.");
    }
    this.setState({ tagBotId: null });
    this.toastMsg("Users Tagged", `${userIds.length} user${userIds.length === 1 ? "" : "s"} tagged to ${botName}.`);
    this.loadBots();
  }

  // One bot's analytics: the summary call brings the daily trend and the top
  // intents, the fallback call brings the recent unanswered queries.
  async openBotAnalytics(botId) {
    this.setState({ selectedBotId: botId, analyticsData: null });
    const { custcode, orgcode } = this.sessionCodes();
    try {
      const [summaryRes, fallbackRes] = await Promise.all([
        this.apiPost(GET_BOT_ANALYTICS_SUMMARY_URL, { custcode, orgcode, botid: botId, topn: 5 }),
        this.apiPost(GET_BOT_FALLBACK_QUERY_DATA_URL, { custcode, orgcode, botid: botId, pageno: 1, pagesize: 5 }),
      ]);
      const sj = summaryRes.ok && summaryRes.json ? summaryRes.json : {};
      const summary = sj.summary || {};
      const daily = (Array.isArray(sj.daily) ? sj.daily : []).map((d) => ({
        label: String(this.pick(d, "analytics_date", "analyticsdate", "label") || "").slice(5),
        conversations: Number(this.pick(d, "total_conversations", "totalconversations", "conversations") || 0),
      }));
      const intents = Array.isArray(sj.topintents) ? sj.topintents : [];
      const intentTotal = intents.reduce((a, i) => a + Number(this.pick(i, "query_count", "querycount", "count") || 0), 0) || 1;
      const topIntents = intents.map((i) => {
        const count = Number(this.pick(i, "query_count", "querycount", "count") || 0);
        return {
          intent: String(this.pick(i, "intent_code", "intentcode", "intent") || "\u2014"),
          count,
          percentage: Math.round((count / intentTotal) * 100),
        };
      });
      const fj = fallbackRes.ok && fallbackRes.json ? fallbackRes.json : {};
      const fallbackRecent = (Array.isArray(fj.results) ? fj.results : []).map((q) => ({
        query: String(this.pick(q, "query_text", "querytext", "query") || ""),
        date: String(this.pick(q, "created_date", "createddate") || "").slice(0, 16).replace("T", " "),
        category: String(this.pick(q, "fallback_reason", "fallbackreason", "category") || "\u2014"),
        reason: String(this.pick(q, "fallback_reason", "fallbackreason") || ""),
        followUp: String(this.pick(q, "follow_up", "followup") || ""),
        confidence: Number(this.pick(q, "confidence_score", "confidencescore", "confidence") || 0),
      }));
      const total = Number(this.pick(summary, "total_conversations", "totalconversations") || 0);
      const escalated = Number(this.pick(summary, "escalated_count", "escalatedcount") || 0);
      const fallbackTotal = Number(this.pick(summary, "fallback_count", "fallbackcount") || fj.totalcount || 0);
      this.setState({
        analyticsData: {
          botId, daily, topIntents, fallbackRecent,
          escalationRate: total ? Number(((escalated / total) * 100).toFixed(1)) : 0,
          escalated, total,
          fallbackRate: total ? Number(((fallbackTotal / total) * 100).toFixed(1)) : 0,
          fallbackTotal,
        },
      });
    } catch (e) {
      console.warn("Could not load the bot analytics", e);
    }
  }


  // No procedure returns keyword analytics.
  keywordDefs = [];

  // No procedure returns per-hour usage.
  heatmapRows = [];
  // No procedure returns daily usage patterns.
  dailyUsageDefs = [];

  get userDefs() { return this.state.usersData || this.userDefsBase; }
  // Users come from get-bot-user-data, per bot.
  userDefsBase = [];
  getFilteredUsers() {
    const s = this.state;
    switch (s.userFilter) {
      case "high-engagement": return this.userDefs.filter(u => u.eng > s.engThreshold);
      case "frequent-users": return this.userDefs.filter(u => u.conv > s.convThreshold);
      case "admins": return this.userDefs.filter(u => u.role === "admin" || u.role === "moderator");
      case "inactive": return this.userDefs.filter(u => u.status === "inactive");
      default: return this.userDefs;
    }
  }

  formatFileSize(bytes) {
    if (!bytes) return "0 Bytes";
    const k = 1024, sizes = ["Bytes", "KB", "MB", "GB"], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  kbEntriesData = [
    { id: 1, title: "How to Enroll in a Course", category: "Enrollment Process", content: "Step-by-step guide for course enrollment including payment and confirmation of your seat in the next cohort.", tags: ["enrollment", "payment", "getting-started"], priority: "high", views: 1247, lastUpdated: "Jan 25, 2024", author: "Admin User", status: "published" },
    { id: 2, title: "Password Reset Instructions", category: "Account Management", content: "Complete guide for resetting your password and recovering account access when you are locked out.", tags: ["password", "security", "account"], priority: "high", views: 892, lastUpdated: "Jan 20, 2024", author: "Support Team", status: "published" },
    { id: 3, title: "Technical Requirements for Courses", category: "Technical Support", content: "System requirements and technical specifications needed for course participation across devices.", tags: ["technical", "requirements", "system"], priority: "medium", views: 654, lastUpdated: "Jan 18, 2024", author: "Tech Team", status: "published" },
    { id: 4, title: "Refund Policy and Process", category: "Payment & Billing", content: "Information about refund eligibility, the request process, and expected timelines for reimbursement.", tags: ["refund", "payment", "policy"], priority: "medium", views: 432, lastUpdated: "Jan 15, 2024", author: "Finance Team", status: "published" },
    { id: 5, title: "Course Completion Certificates", category: "Course Information", content: "How to obtain and download your course completion certificate once all modules are finished.", tags: ["certificate", "completion", "download"], priority: "low", views: 321, lastUpdated: "Jan 12, 2024", author: "Academic Team", status: "draft" },
  ];

  renderVals() {
    const s = this.state;
    const tabDefs = [
      { key: "overview", title: "Overview", icon: "dashboard" }, { key: "chatbots", title: "Manage Chat Bots", icon: "bot" },
      { key: "conversations", title: "Conversations", icon: "msg" }, { key: "analytics", title: "Analytics", icon: "chart" },
      { key: "agents", title: "Agent Management", icon: "userplus" },
    ];
    const tabBase = "display:flex;align-items:center;gap:8px;padding:9px 16px;border:0;background:transparent;cursor:pointer;font-family:inherit;font-size:.875rem;white-space:nowrap;border-radius:9999px;outline:none;transition:background .2s,color .2s,box-shadow .2s;";
    const tabs = tabDefs.map(d => { const selected = s.view === d.key; return {
      title: d.title, selected, tabId: "tab-" + d.key, panelId: "panel-" + d.key,
      onClick: () => this.go(d.key), icon: this.icon(d.icon, selected ? "#fff" : "#475569", 16),
      style: tabBase + (selected ? "background:linear-gradient(135deg,#006ce0,#3b9dff);color:#fff;font-weight:600;box-shadow:0 2px 8px rgba(0,108,224,0.35);" : "background:#fff;color:#475569;border:1px solid #e2e8f0;"),
      hover: selected ? "opacity:0.92" : "background:#eff6ff;color:#006ce0" }; });

    // The only totals we can stand behind are the ones the list calls report.
    const metricDefs = [
      { label: "Chat Bots", value: String(s.botTotal || 0), change: "", icon: "bot", chipBg: "hsl(256 60% 96.5%)", ink: "hsl(256 45% 45%)" },
      { label: "Agents", value: String(s.agentTotal || 0), change: "", icon: "userplus", chipBg: "hsl(205 70% 95%)", ink: "hsl(205 75% 28%)" },
      { label: "Conversations", value: String(s.convTotal || 0), change: "", icon: "msg", chipBg: "hsl(158 45% 94%)", ink: "hsl(158 55% 24%)" },
    ];
    const metrics = metricDefs.map(m => ({ label: m.label, value: m.value, change: m.change, chipBg: m.chipBg, icon: this.icon(m.icon, m.ink, 18) }));

    const growth = [];                 // no user growth procedure
    const msgs = [];                   // no message volume procedure

    // The donut shows the top intents of whichever bot's analytics are open.
    const intentPalette = ["#2563eb", "#1fae5a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];
    const intentDefs = ((s.analyticsData && s.analyticsData.topIntents) || [])
      .map((i, k) => ({ name: i.intent, value: i.count, color: intentPalette[k % intentPalette.length] }));
    const intentTotal = intentDefs.reduce((a, b) => a + b.value, 0) || 1;
    const hi = this.state.intentHover;
    let acc = 0; const segs = intentDefs.map((i, k) => { const start = (acc / intentTotal) * 100; acc += i.value; const end = (acc / intentTotal) * 100; const col = hi != null && hi !== k ? i.color + "33" : i.color; return `${col} ${start}% ${end}%`; });
    const intentDonut = segs.length
      ? `position:absolute;inset:0;border-radius:9999px;background:conic-gradient(${segs.join(",")});transition:background .2s`
      : "position:absolute;inset:0;border-radius:9999px;background:#f1f5f9";
    const hd = hi != null ? intentDefs[hi] : null;
    const centerTop = hd ? hd.name : "Total";
    const centerMid = hd ? hd.value : (intentDefs.length ? intentTotal : 0);
    const centerBot = hd ? ((hd.value / intentTotal) * 100).toFixed(1) + "% of total" : "queries";
    const intents = intentDefs.map((i, k) => ({ name: i.name, value: i.value, color: i.color, pct: ((i.value / intentTotal) * 100).toFixed(1), enter: () => this.setState({ intentHover: k }), leave: () => this.setState({ intentHover: null }) }));

    const fi = s.selectedFunnel != null ? s.selectedFunnel : 0;
    const funnel = this.funnelDefs.map((f, i) => { const prev = i > 0 ? this.funnelDefs[i - 1].count : null; const active = fi === i; return { stage: f.stage, count: f.count.toLocaleString(), pct: f.pct, showDrop: i > 0, drop: prev ? `${(((prev - f.count) / prev) * 100).toFixed(0)}% drop-off vs previous` : "",
      onClick: () => this.setState({ selectedFunnel: i }),
      enter: () => this.setState({ selectedFunnel: i }),
      row: `padding:12px 14px;border-radius:12px;cursor:pointer;transition:background .15s;background:${active ? "#f1f5f9" : "transparent"};box-shadow:${active ? "inset 0 0 0 1.5px " + f.color : "none"}`,
      fill: `height:100%;border-radius:9999px;width:${f.pct}%;background:${f.color};transition:width .3s`,
      dotColor: f.color }; });
    const fd = this.funnelDefs[fi] || null;
    const funnelDetail = fd
      ? { stage: fd.stage, color: fd.color, count: fd.count.toLocaleString(), pct: fd.pct, avgTimeSpent: fd.avgTimeSpent, bounceRate: fd.bounceRate, topPages: fd.topPages, mobile: fd.mobile, desktop: fd.desktop }
      : { stage: "\u2014", color: "#e2e8f0", count: "0", pct: 0, avgTimeSpent: "\u2014", bounceRate: "\u2014", topPages: "\u2014", mobile: 0, desktop: 0 };

    const perfDefs = [];               // no performance procedure
    const perfTone = (p) => p >= 100 ? ["#dcfce7", "#166534", "#1fae5a"] : p >= 80 ? ["#fef9c3", "#854d0e", "#f59e0b"] : ["#fee2e2", "#991b1b", "#dc2626"];
    const performance = perfDefs.map(p => { const t = perfTone(p.pct); return { metric: p.metric, currentLabel: p.currentLabel, pct: p.pct,
      status: p.pct >= 100 ? "On target" : p.pct >= 80 ? "Near target" : "Below target",
      badge: `font-size:12px;font-weight:600;padding:3px 12px;border-radius:9999px;background:${t[0]};color:${t[1]}`,
      gauge: this.gauge(p.pct, p.currentLabel, t[2]) }; });

    const ssDefs = [];                 // no service health procedure
    const ssTone = { green: ["#dcfce7", "#166534", "#1fae5a"], amber: ["#fef9c3", "#854d0e", "#f59e0b"] };
    const systemStatus = ssDefs.map(x => { const t = ssTone[x.tone]; return { label: x.label, value: x.value, chip: `display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;font-size:.75rem;font-weight:600;background:${t[0]};color:${t[1]}`, dot: `width:6px;height:6px;border-radius:9999px;background:${t[2]}` }; });

    const statusTone = (st) => st === "Active" ? ["#dcfce7", "#166534", "#1fae5a"] : st === "Draft" ? ["#fef9c3", "#854d0e", "#f59e0b"] : ["#f1f5f9", "#475569", "#94a3b8"];
    const iconTone = (st) => st === "Active" ? ["#dcfce7", "#166534"] : st === "Draft" ? ["#fef9c3", "#854d0e"] : ["#f1f5f9", "#64748b"];
    const embedIcon = this.icon("code", "#006ce0", 16), analyticsIcon = this.icon("chart", "#fff", 16), analyticsIconBlue = this.icon("chart", "#006ce0", 16);
    const allBots = this.botData;
    const shown = allBots.filter(b => s.statusFilter === "All" || b.status === s.statusFilter);
    const chatBotList = shown.map(b => { const t = statusTone(b.status), it = iconTone(b.status); return {
      id: b.id, name: b.name, knowledgeBase: b.knowledgeBase, status: b.status,
      agentsLabel: b.agents.join(", "), conversations: b.conversations.toLocaleString(), ratingLabel: b.satisfaction > 0 ? b.satisfaction + "/5" : "N/A",
      createdLabel: new Date(b.createdAt).toLocaleDateString(),
      icon: this.icon("bot", it[1], 22), iconWrap: `height:48px;width:48px;flex-shrink:0;border-radius:12px;background:${it[0]};color:${it[1]};display:flex;align-items:center;justify-content:center`,
      mKb: this.icon("book", "#2563eb", 16), mAgents: this.icon("users", "#7c3aed", 16), mConv: this.icon("msg", "#059669", 16), mRating: this.icon("star", "#d97706", 16),
      statusChip: `display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;font-size:.75rem;font-weight:600;background:${t[0]};color:${t[1]}`, statusDot: `width:6px;height:6px;border-radius:9999px;background:${t[2]}`,
      publishState: b.status === "Active" ? "Published" : "Draft",
      publishTitle: b.status === "Active" ? "Published — click to unpublish" : "Draft — click to publish",
      toggleTrack: `position:relative;width:36px;height:20px;border-radius:9999px;background:${b.status === "Active" ? "#059669" : "#cbd5e1"};transition:background .2s;flex:none`,
      toggleKnob: `position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:9999px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.2);transition:transform .2s;transform:translateX(${b.status === "Active" ? "16px" : "0"})`,
      toggleTextColor: b.status === "Active" ? "#047857" : "#64748b",
      onToggle: () => this.togglePublish(b.id), onEmbed: () => this.openEmbed(), onAnalytics: () => this.openBotAnalytics(b.id),
      tagCount: b.taggedUsers || "", onTag: () => this.openTagUsers(b.id),
      trashIcon: this.icon("trash", "#dc2626", 15), onDelete: () => this.deleteBot(b.id, b.name),
      pencilIcon: this.icon("pencil", "#006ce0", 15), onEdit: () => this.openEditBot(b) }; });
    const botStats = [
      { label: "Total ChatBots", value: s.botTotal || allBots.length, icon: this.icon("bot", "hsl(256 45% 45%)", 18), chipBg: "hsl(256 60% 96.5%)" },
      { label: "Active ChatBots", value: allBots.filter(b => b.status === "Active").length, icon: this.icon("play", "hsl(158 55% 24%)", 18), chipBg: "hsl(158 45% 94%)" },
      { label: "Avg. Satisfaction", value: (() => { const rated = allBots.filter(b => b.satisfaction > 0); return rated.length ? (rated.reduce((a, b) => a + b.satisfaction, 0) / rated.length).toFixed(1) : "\u2014"; })(), icon: this.icon("trend", "hsl(22 80% 30%)", 18), chipBg: "hsl(22 80% 95.5%)" },
    ];
    const chartBotPerf = this.barChart(allBots.map(b => ({ label: b.name.replace(" Bot", ""), conversations: b.conversations })), [{ k: "conversations", c: "#006ce0" }], 210);

    const sb = allBots.find(b => b.id === s.selectedBotId);
    let selectedBot = null;
    if (sb) {
      const an = this.botAnalytics(sb);
      const rBadge = (p) => p > 40 ? "font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;background:#fee2e2;color:#991b1b" : p > 20 ? "font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;background:#fef9c3;color:#854d0e" : "font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;background:#dcfce7;color:#166534";
      const rBar = (p) => `height:100%;border-radius:9999px;width:${p}%;background:${p > 40 ? "#dc2626" : p > 20 ? "#f59e0b" : "#1fae5a"}`;
      const catBadge = (c) => { const map = { "Technical Jargon": ["#fee2e2","#991b1b"], "Complex Requests": ["#fef9c3","#854d0e"], "Domain-Specific": ["#e0f2fe","#0369a1"], "Ambiguous Queries": ["#f3e8ff","#7c3aed"], "Out of Scope": ["#f1f5f9","#475569"] }; const t = map[c] || ["#f1f5f9","#475569"]; return `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:${t[0]};color:${t[1]}`; };
      selectedBot = {
        name: sb.name, hasAnalytics: !!an, noAnalytics: !an,
        metrics: [
          { label: "Total Conversations", value: sb.conversations.toLocaleString() },
          { label: "Satisfaction Score", value: sb.satisfaction > 0 ? sb.satisfaction + "/5" : "N/A" },
          { label: "Knowledge Base", value: sb.knowledgeBase },
          { label: "Assigned Agents", value: sb.agents.join(", ") },
        ],
      };
      if (an) {
        selectedBot.chart = this.barChart(an.daily, [{ k: "conversations", c: "#006ce0" }]);
        selectedBot.topIntents = an.topIntents.map(ti => ({ intent: ti.intent, count: ti.count, bar: `height:100%;border-radius:9999px;width:${ti.percentage}%;background:linear-gradient(to right,#006ce0,#60a5fa)` }));
        selectedBot.users = an.users.map(u => ({ name: u.name, meta: `${u.conversations} conversations \u2022 Last seen ${u.lastSeen}`, satisfaction: u.satisfaction }));
        selectedBot.escalation = { rate: an.escalation.rate, escalated: an.escalation.escalated, total: an.escalation.total,
          reasons: an.escalation.reasons.map(r => ({ reason: r.reason, description: r.description, pct: r.pct.toFixed(1), count: r.count, badge: rBadge(r.pct), bar: rBar(r.pct) })) };
        selectedBot.escalationChart = this.lineChart(an.escalation.trends, [{ k: "rate", c: "#f59e0b" }], 180);
        selectedBot.fallback = { rate: an.fallback.rate, total: an.fallback.total,
          categories: an.fallback.categories.map(c => ({ category: c.category, pct: c.pct.toFixed(1), count: c.count, bar: `height:100%;border-radius:9999px;width:${c.pct}%;background:#006ce0` })),
          recent: an.fallback.recent.map(q => ({ query: q.query, date: q.date, category: q.category, reason: q.reason, followUp: q.followUp, confidence: q.confidence,
            catBadge: catBadge(q.category), confBadge: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;${q.confidence > 30 ? "background:#fef9c3;color:#854d0e" : "background:#fee2e2;color:#991b1b"}` })) };
      }
    }

    const convTone = (st) => st === "completed" ? ["#dcfce7", "#166534", "Resolved"] : st === "open" ? ["#fef9c3", "#854d0e", "Open"] : ["#fee2e2", "#991b1b", "Escalated"];
    const sentTone = (x) => x === "positive" ? ["#dcfce7", "#166534"] : x === "negative" ? ["#fee2e2", "#991b1b"] : ["#f1f5f9", "#475569"];
    const convFiltered = this.conversationsData.filter(c => (s.convStatusFilter === "All" || c.status === s.convStatusFilter) && (s.convSentimentFilter === "All" || c.sentiment === s.convSentimentFilter) && (!s.convStart || c.date >= s.convStart) && (!s.convEnd || c.date <= s.convEnd));
    const conversations = convFiltered.map(c => { const t = convTone(c.status), se = sentTone(c.sentiment); return { customerName: c.customerName, customerEmail: c.customerEmail, chatBotName: c.chatBotName, category: c.category, duration: c.duration, statusLabel: t[2], sentiment: c.sentiment,
      sentChip: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;text-transform:capitalize;background:${se[0]};color:${se[1]}`,
      handoffLabel: c.handoff ? "Handoff" : "", handoffChip: c.handoff ? "display:inline-flex;margin-left:6px;padding:2px 8px;border-radius:9999px;font-size:.625rem;font-weight:600;background:#ffedd5;color:#9a3412" : "display:none",
      statusChip: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:${t[0]};color:${t[1]}`,
      trashIcon: this.icon("trash", "#dc2626", 15), onDelete: () => this.deleteConversation(c.id, c.customerName),
      onView: () => this.openConversation(c.id) }; });
    const scv = this.conversationsData.find(c => c.id === s.selectedConvId);
    const scvTranscript = scv ? (s.convMessages[String(scv.id)] || []) : [];
    const scvSent = scv ? sentTone(scv.sentiment) : null;
    const selectedConv = scv ? { customerName: scv.customerName, customerEmail: scv.customerEmail, chatBotName: scv.chatBotName, category: scv.category, duration: scv.duration, sentiment: scv.sentiment,
      sentChip: `display:inline-flex;padding:4px 12px;border-radius:9999px;font-size:.75rem;font-weight:600;text-transform:capitalize;background:${scvSent[0]};color:${scvSent[1]}`,
      resLabel: scv.resolvedByBot ? "Bot Resolved" : "Human Required", resChip: `display:inline-block;margin-top:4px;padding:2px 10px;border-radius:9999px;font-size:.75rem;font-weight:600;${scv.resolvedByBot ? "background:#dcfce7;color:#166534" : "background:#ffedd5;color:#9a3412"}`,
      transcript: scvTranscript.map(m => { const isCust = m.speaker === "customer", isSys = m.speaker === "system"; return { speaker: isSys ? "System" : isCust ? "Customer" : "Bot", timestamp: m.timestamp, message: m.message, handoff: m.handoff || null,
        row: `display:flex;${isCust ? "justify-content:flex-end" : "justify-content:flex-start"}`,
        bubble: `max-width:82%;padding:12px 14px;border-radius:12px;${isSys ? "background:#ffedd5;color:#9a3412;margin:0 auto" : isCust ? "background:#006ce0;color:#fff" : "background:#f1f5f9;color:#0f172a"}` }; }),
      stats: [
        { label: "Messages", value: scvTranscript.filter(m => m.speaker !== "system").length },
        { label: "Bot Replies", value: scvTranscript.filter(m => m.speaker === "bot").length },
        { label: "Duration", value: scv.duration },
        { label: "Resolution", value: scv.resolvedByBot ? "Bot" : "Human" },
      ] } : null;

    const trendStyleFn = (t) => `font-size:11px;font-weight:600;color:${t === "up" ? "#16a34a" : t === "down" ? "#dc2626" : "#64748b"}`;
    const trendLabelFn = (t, ch) => (ch > 0 ? "+" : "") + ch + "%";
    const kwBar = this.keywordDefs.map(k => ({ label: k.keyword.length > 14 ? k.keyword.slice(0, 13) + "\u2026" : k.keyword, count: k.count }));
    const pieColors = ["#2563eb", "#1fae5a", "#f59e0b", "#a855f7", "#94a3b8", "#e11d48", "#0ea5e9", "#7c3aed"];
    const keywordLegend = this.keywordDefs.slice(0, 8).map((k, i) => ({ label: k.keyword, count: k.count, color: pieColors[i % pieColors.length] }));
    const keywordTable = this.keywordDefs.map(k => ({ keyword: k.keyword, category: k.category, count: k.count, satisfaction: k.satisfaction, trendStyle: trendStyleFn(k.trend), trendLabel: trendLabelFn(k.trend, k.change) }));
    const catDefs = [{ name: "Enrollment", count: 542, pct: 28.5, trend: "up", change: 12 }, { name: "Pricing", count: 376, pct: 19.8, trend: "up", change: 8 }, { name: "Course Info", count: 333, pct: 17.5, trend: "up", change: 11 }, { name: "Support", count: 298, pct: 15.7, trend: "down", change: -4 }, { name: "Platform", count: 162, pct: 8.5, trend: "up", change: 15 }, { name: "Certification", count: 167, pct: 8.8, trend: "flat", change: 2 }];
    const categories = catDefs.map(c => ({ name: c.name, count: c.count, pct: c.pct, bar: `height:100%;border-radius:9999px;width:${c.pct}%;background:linear-gradient(to right,#006ce0,#60a5fa)`,
      trendLabel: trendLabelFn(c.trend, c.change), trendStyle: trendStyleFn(c.trend), onClick: () => this.toastMsg("Category Analysis", `Analyzing ${c.name} related queries and trends...`) }));
    const trendsD = [{ label: "W1", courses: 45, enrollment: 32, pricing: 28 }, { label: "W2", courses: 52, enrollment: 38, pricing: 31 }, { label: "W3", courses: 48, enrollment: 42, pricing: 35 }, { label: "W4", courses: 61, enrollment: 45, pricing: 32 }, { label: "W5", courses: 58, enrollment: 48, pricing: 38 }, { label: "W6", courses: 65, enrollment: 52, pricing: 41 }];
    const analyticsBotOptions = [{ value: "all", label: "All ChatBots" }, ...allBots.map(b => ({ value: String(b.id), label: b.name }))];
    const btnOn = "height:30px;padding:0 14px;border:0;border-radius:8px;background:#006ce0;color:#fff;font-family:inherit;font-size:.75rem;font-weight:600;cursor:pointer";
    const btnOff = "height:30px;padding:0 14px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#475569;font-family:inherit;font-size:.75rem;font-weight:500;cursor:pointer";
    const peakInsights = [];           // no peak usage procedure
    const maxDaily = Math.max(1, ...this.dailyUsageDefs.map(d => d.interactions));
    const dailyUsage = this.dailyUsageDefs.map(d => ({ day: d.day, interactions: d.interactions.toLocaleString(), peak: d.peak, bar: `height:100%;border-radius:9999px;width:${(d.interactions / maxDaily) * 100}%;background:linear-gradient(to right,#006ce0,#60a5fa)` }));
    const staffing = [];               // no staffing procedure
    const kbOverview = [];             // knowledge base content is managed elsewhere

    // knowledge base sub-views: add content + view entries
    const doneBadge = "display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:#dcfce7;color:#166534";
    const reqBadge = "display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:#f1f5f9;color:#475569";
    const optBadge = "display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;border:1px solid #e2e8f0;color:#64748b";
    const kbStatus = [
      { label: "Title", text: s.kbTitle ? "Complete" : "Required", badge: s.kbTitle ? doneBadge : reqBadge },
      { label: "Category", text: s.kbCategory ? "Selected" : "Optional", badge: s.kbCategory ? doneBadge : optBadge },
      { label: "Content", text: s.kbContent ? "Complete" : "Required", badge: s.kbContent ? doneBadge : reqBadge },
      { label: "Tags", text: s.kbTags ? "Added" : "Optional", badge: s.kbTags ? doneBadge : optBadge },
      { label: "Documents", text: s.kbDocs.length ? `${s.kbDocs.length} uploaded` : "Optional", badge: s.kbDocs.length ? doneBadge : optBadge },
    ];
    const kbDocsView = s.kbDocs.map((d, i) => ({ name: d.name, size: d.size, onRemove: () => { this.setState({ kbDocs: s.kbDocs.filter((_, j) => j !== i) }); this.toastMsg("Document Removed", "Document has been removed from the upload list."); } }));
    const kbCanSave = !!(s.kbTitle.trim() && s.kbContent.trim());
    const prioTone = (p) => p === "high" ? ["#fee2e2", "#991b1b"] : p === "medium" ? ["#fef9c3", "#854d0e"] : ["#dcfce7", "#166534"];
    const kbStatusTone = (st) => st === "published" ? ["#dcfce7", "#166534"] : st === "draft" ? ["#fef9c3", "#854d0e"] : ["#f1f5f9", "#475569"];
    const kbq = s.kbSearch.toLowerCase();
    const kbFiltered = this.kbEntriesData.filter(e => {
      const ms = !kbq || e.title.toLowerCase().includes(kbq) || e.content.toLowerCase().includes(kbq) || e.tags.some(t => t.toLowerCase().includes(kbq));
      const mc = s.kbCat === "all" || e.category === s.kbCat;
      const mp = s.kbPrio === "all" || e.priority === s.kbPrio;
      return ms && mc && mp;
    });
    const kbEntriesView = kbFiltered.map(e => { const pt = prioTone(e.priority), st = kbStatusTone(e.status); return { id: e.id, title: e.title, content: e.content, category: e.category, views: e.views.toLocaleString(), lastUpdated: e.lastUpdated, author: e.author, tags: e.tags,
      prioLabel: e.priority + " priority", prioChip: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;text-transform:capitalize;background:${pt[0]};color:${pt[1]}`,
      statusLabel: e.status, statusChip: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;text-transform:capitalize;background:${st[0]};color:${st[1]}`,
      onView: () => this.toastMsg("View Entry", `Opening detailed view for "${e.title}".`), onEdit: () => this.toastMsg("Edit Entry", `Opening editor for "${e.title}".`), onDelete: () => this.toastMsg("Delete Entry", `"${e.title}" has been moved to trash.`) }; });
    const kbEntryStats = [
      { label: "Total Entries", value: this.kbEntriesData.length }, { label: "Published", value: this.kbEntriesData.filter(e => e.status === "published").length },
      { label: "Total Views", value: this.kbEntriesData.reduce((a, b) => a + b.views, 0).toLocaleString() }, { label: "High Priority", value: this.kbEntriesData.filter(e => e.priority === "high").length },
    ];

    const roleTone = { admin: ["#fee2e2", "#991b1b"], moderator: ["#fef9c3", "#854d0e"], user: ["#eff6ff", "#1d4ed8"] };
    const engLevel = (m) => m > 120 ? ["#dcfce7", "#166534", "High"] : m > 60 ? ["#fef9c3", "#854d0e", "Medium"] : ["#f1f5f9", "#475569", "Low"];
    const filteredUsers = this.getFilteredUsers();
    const users = filteredUsers.map(u => { const rt = roleTone[u.role], et = engLevel(u.eng), st = u.status === "active" ? ["#dcfce7", "#166534", "#1fae5a"] : ["#f1f5f9", "#475569", "#94a3b8"]; return { name: u.name, email: u.email, role: u.role, conv: u.conv, eng: u.eng, session: u.session, sat: u.sat, department: u.department, lastActive: u.lastActive, topics: u.topics, status: u.status, engLabel: et[2],
      roleChip: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;text-transform:capitalize;background:${rt[0]};color:${rt[1]}`,
      engChip: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:${et[0]};color:${et[1]}`,
      statusChip: `display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;text-transform:capitalize;flex-shrink:0;background:${st[0]};color:${st[1]}`, statusDot: `width:6px;height:6px;border-radius:9999px;background:${st[2]}`,
      onView: () => this.setState({ userConvId: u.id }) }; });
    const ucUser = s.userConvId ? this.userDefs.find(u => u.id === s.userConvId) : null;
    const convToneU = (st) => st === "completed" ? ["#dcfce7", "#166534", "Resolved"] : ["#fee2e2", "#991b1b", "Escalated"];
    const sentToneU = (x) => x === "positive" ? ["#dcfce7", "#166534"] : x === "negative" ? ["#fee2e2", "#991b1b"] : ["#f1f5f9", "#475569"];
    const userConvView = ucUser ? {
      name: ucUser.name, email: ucUser.email,
      count: this.conversationsData.length,
      conversations: this.conversationsData.map(c => { const t = convToneU(c.status), se = sentToneU(c.sentiment); return {
        customerName: c.customerName, customerEmail: c.customerEmail, chatBotName: c.chatBotName, category: c.category, duration: c.duration, sentiment: c.sentiment, statusLabel: t[2],
        sentChip: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;text-transform:capitalize;background:${se[0]};color:${se[1]}`,
        handoffLabel: c.handoff ? "Handoff" : "", handoffChip: c.handoff ? "display:inline-flex;margin-left:6px;padding:2px 8px;border-radius:9999px;font-size:.625rem;font-weight:600;background:#ffedd5;color:#9a3412" : "display:none",
        statusChip: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:${t[0]};color:${t[1]}`,
        onView: () => this.setState({ view: "conversations", selectedConvId: c.id, userConvId: null, convFrom: s.userConvId }) }; }),
    } : null;
    const activeCount = this.userDefs.filter(u => u.status === "active").length;
    const avgEng = this.userDefs.length ? (this.userDefs.reduce((a, b) => a + b.eng, 0) / this.userDefs.length).toFixed(1) : "0";
    const avgSat = this.userDefs.length ? (this.userDefs.reduce((a, b) => a + b.sat, 0) / this.userDefs.length).toFixed(1) : "0";
    const userStats = [
      { label: "Total Users", value: this.userDefs.length, icon: this.icon("users", "#1d4ed8", 18), chipBg: "#eff6ff" },
      { label: "Active Users", value: activeCount, icon: this.icon("check", "#166534", 18), chipBg: "#dcfce7" },
      { label: "High Engagement", value: this.userDefs.filter(u => u.eng > s.engThreshold).length, icon: this.icon("trend", "#854d0e", 18), chipBg: "#fef9c3" },
      { label: "Avg. Engagement", value: avgEng + "m", icon: this.icon("clock", "#0369a1", 18), chipBg: "#e0f2fe" },
      { label: "Avg. Satisfaction", value: avgSat, icon: this.icon("star", "#b45309", 18), chipBg: "hsl(22 80% 95.5%)" },
    ];
    const um = s.showUserModal ? this.userDefs.find(u => u.id === s.selectedUserId) : null;
    const umRole = um ? roleTone[um.role] : null;
    const umStatus = um ? (um.status === "active" ? ["#dcfce7", "#166534", "#1fae5a"] : ["#f1f5f9", "#475569", "#94a3b8"]) : null;
    const userModal = um ? { name: um.name, email: um.email, role: um.role, department: um.department, status: um.status, eng: um.eng, conv: um.conv, session: um.session, sat: um.sat, joined: um.joined, lastActive: um.lastActive, topics: um.topics, permissions: um.permissions,
      roleChip: `display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;text-transform:capitalize;background:${umRole[0]};color:${umRole[1]}`,
      statusChip: `display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;text-transform:capitalize;background:${umStatus[0]};color:${umStatus[1]}`, statusDot: `width:6px;height:6px;border-radius:9999px;background:${umStatus[2]}` } : null;
    const roleUser = this.userDefs.find(u => u.id === s.selectedUserId);
    const activePerms = s.rolePerms || (roleUser ? roleUser.permissions : ["read"]);
    const rolePermissions = ["read", "write", "admin", "delete", "export"].map(p => { const has = activePerms.includes(p); return { name: p, action: has ? "Revoke" : "Grant",
      btn: has ? "height:28px;padding:0 12px;border:0;border-radius:6px;background:#006ce0;color:#fff;font-family:inherit;font-size:.6875rem;font-weight:600;cursor:pointer" : "height:28px;padding:0 12px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;color:#334155;font-family:inherit;font-size:.6875rem;font-weight:500;cursor:pointer",
      onToggle: () => { const cur = s.rolePerms || (roleUser ? roleUser.permissions : []); const next = has ? cur.filter(x => x !== p) : [...cur, p]; this.setState({ rolePerms: next }); } }; });

    const headerAction = s.view === "analytics" ? { label: "Export", icon: this.icon("trend", "#fff", 16), onClick: () => this.toastMsg("Export Started", "Analytics report is being generated.") } : null;

    const notesEmpty = !s.convNotes.trim();

    // dropdown option sets
    const pagerFor = (page, total, onPage) => {
      const pages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
      const current = Math.min(Math.max(1, page || 1), pages);
      const from = total ? (current - 1) * PAGE_SIZE + 1 : 0;
      const to = Math.min(current * PAGE_SIZE, total || 0);
      const btn = (enabled) => `height:32px;padding:0 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;font-family:inherit;font-size:.8125rem;color:${enabled ? "#334155" : "#cbd5e1"};cursor:${enabled ? "pointer" : "not-allowed"}`;
      return {
        label: total ? `Showing ${from}\u2013${to} of ${total}` : "Nothing to show",
        page: current, pages, canPrev: current > 1, canNext: current < pages,
        prevStyle: btn(current > 1), nextStyle: btn(current < pages),
        prev: () => current > 1 && onPage(current - 1),
        next: () => current < pages && onPage(current + 1),
      };
    };
    const agentStatusOptions = [{ value: "All", label: "All Agents" }, { value: "Active", label: "Active" }, { value: "Retired", label: "Retired" }];
    const statusFilterOptions = [{ value: "All", label: "All Status" }, { value: "Active", label: "Active" }, { value: "Draft", label: "Draft" }, { value: "Inactive", label: "Inactive" }];
    const convStatusOptions = [{ value: "All", label: "All Statuses" }, { value: "completed", label: "Completed" }, { value: "open", label: "Open" }];
    const convSentimentOptions = [{ value: "All", label: "All Sentiments" }, { value: "positive", label: "Positive" }, { value: "negative", label: "Negative" }, { value: "neutral", label: "Neutral" }];
    const analyticsRangeOptions = [{ value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }, { value: "90d", label: "Last 90 days" }];
    const kbSelectOptions = s.kbOptionsData || [];
    // save-bot takes agent ids, so the value is the id and the label is the name.
    const agentOptions = (s.agentsData || []).map((a) => ({ value: String(a.id), label: a.name }));
    const statusInitOptions = [{ value: "Draft", label: "Draft" }, { value: "Active", label: "Active" }];
    const langOptions = s.languageOptionsData || [{ value: "EN", label: "English" }];
    const contentCatOptions = [{ value: "Course Information", label: "Course Information" }, { value: "Technical Support", label: "Technical Support" }, { value: "Account Management", label: "Account Management" }, { value: "General FAQ", label: "General FAQ" }, { value: "Enrollment Process", label: "Enrollment Process" }, { value: "Payment & Billing", label: "Payment & Billing" }];
    const priorityOptions = [{ value: "high", label: "High Priority" }, { value: "medium", label: "Medium Priority" }, { value: "low", label: "Low Priority" }];
    const catFilterOptions = [{ value: "all", label: "All Categories" }, { value: "Course Information", label: "Course Information" }, { value: "Technical Support", label: "Technical Support" }, { value: "Account Management", label: "Account Management" }, { value: "Enrollment Process", label: "Enrollment Process" }, { value: "Payment & Billing", label: "Payment & Billing" }];
    const prioFilterOptions = [{ value: "all", label: "All Priorities" }, { value: "high", label: "High Priority" }, { value: "medium", label: "Medium Priority" }, { value: "low", label: "Low Priority" }];
    const userFilterOptions = [{ value: "all", label: "All Users" }, { value: "high-engagement", label: "High Engagement" }, { value: "frequent-users", label: "Frequent Users" }, { value: "admins", label: "Admins & Moderators" }, { value: "inactive", label: "Inactive Users" }];
    const roleOptions = [{ value: "user", label: "User" }, { value: "moderator", label: "Moderator" }, { value: "admin", label: "Admin" }];

    // create-bot validation
    const cName = s.createTouched && !s.newName.trim();
    const cDesc = s.createTouched && !s.newDesc.trim();
    const cKb = s.createTouched && !s.newKb;
    const cAgents = s.createTouched && !s.newAgents;
    const invStyle = (bad) => `width:100%;box-sizing:border-box;height:40px;border:1px solid ${bad ? "#f87171" : "#e2e8f0"};border-radius:8px;padding:0 12px;font-family:inherit;outline:none`;
    const invAreaStyle = (bad) => `width:100%;box-sizing:border-box;border:1px solid ${bad ? "#f87171" : "#e2e8f0"};border-radius:8px;padding:10px 12px;font-family:inherit;outline:none;resize:none`;
    // create-agent validation
    const acName = s.createAgentTouched && !s.agentName.trim();
    const acDesc = s.createAgentTouched && !s.agentDesc.trim();
    const acRole = s.createAgentTouched && !s.agentRole.trim();
    const acGoal = s.createAgentTouched && !s.agentGoal.trim();
    // add-content validation
    const kTitle = s.kbTouched && !s.kbTitle.trim();
    const kContent = s.kbTouched && !s.kbContent.trim();
    // add-admin validation
    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const aNameBad = s.aTouched && !s.aName.trim();
    const aEmailBad = s.aTouched && !emailRe.test(s.aEmail.trim());

    // tag-users modal
    const roleToneT = { admin: ["#ede9fe", "#6d28d9"], editor: ["#dbeafe", "#1d4ed8"], user: ["#f1f5f9", "#475569"] };
    const tagBot = s.tagBotId ? this.botData.find(b => b.id === s.tagBotId) : null;
    const tagSel = s.tagSelected || [];
    const tagQ = s.tagSearch.trim().toLowerCase();
    const tagAll = s.tagUsersData || [];
    const tagFiltered = tagAll.filter(u => !tagQ || u.name.toLowerCase().includes(tagQ) || u.email.toLowerCase().includes(tagQ) || (u.department || "").toLowerCase().includes(tagQ));
    const tagToggle = (id) => { const has = tagSel.includes(id); this.setState({ tagSelected: has ? tagSel.filter(x => x !== id) : [...tagSel, id] }); };
    const allVisibleChecked = tagFiltered.length > 0 && tagFiltered.every(u => tagSel.includes(u.id));
    const tagModal = tagBot ? {
      botName: tagBot.name,
      selectedCount: tagSel.length,
      totalCount: tagAll.length,
      shownCount: tagFiltered.length,
      search: s.tagSearch,
      onSearch: (e) => this.setState({ tagSearch: e.target.value }),
      selectAllChecked: allVisibleChecked,
      selectAllLabel: allVisibleChecked ? "Deselect all" : "Select all",
      onSelectAll: () => { const ids = tagFiltered.map(u => u.id); if (allVisibleChecked) { this.setState({ tagSelected: tagSel.filter(x => !ids.includes(x)) }); } else { this.setState({ tagSelected: [...new Set([...tagSel, ...ids])] }); } },
      users: tagFiltered.map(u => { const rt = roleToneT[u.role] || roleToneT.user; const checked = tagSel.includes(u.id); return {
        id: u.id, name: u.name, email: u.email, role: u.role, dept: u.department || "\u2014",
        initials: u.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase(),
        checked,
        rowStyle: `display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid ${checked ? "#bfdbfe" : "#eef2f7"};border-radius:10px;background:${checked ? "#f5f9ff" : "#fff"};cursor:pointer;transition:background .12s,border-color .12s`,
        box: `width:20px;height:20px;flex:none;border-radius:6px;border:1.5px solid ${checked ? "#006ce0" : "#cbd5e1"};background:${checked ? "#006ce0" : "#fff"};display:flex;align-items:center;justify-content:center`,
        roleChip: `display:inline-flex;padding:2px 9px;border-radius:9999px;font-size:.6875rem;font-weight:600;text-transform:capitalize;background:${rt[0]};color:${rt[1]}`,
        check: checked ? this.icon("tick", "#fff", 14) : null,
        onToggle: () => tagToggle(u.id) }; }),
      close: () => this.setState({ tagBotId: null }),
      clear: () => this.setState({ tagSelected: [] }),
      save: () => this.saveBotUsers(s.tagBotId, tagSel, tagBot.name),
    } : null;

    return {
      tagModal, tagIcon: this.icon("userplus", "#006ce0", 15),
      tabs, headerAction, createBotIcon: this.icon("plus", "#fff", 16), openCreate: () => this.setState({ showCreate: true, createTouched: false, editBotId: null, newName: "", newKb: "", newGuideline: "", newDesc: "", newAgents: "", newStatus: "Draft" }),
      isOverview: s.view === "overview", isChatbots: s.view === "chatbots", isConversations: s.view === "conversations", isAnalytics: s.view === "analytics", isKnowledge: s.view === "knowledge", isUsers: s.view === "users",
      metrics, goChatbots: () => this.go("chatbots"), goConversations: () => this.go("conversations"), toastExport: () => this.toastMsg("Export Started", "Analytics report is being generated."),
      chartGrowth: this.areaChart(growth, [{ k: "users", c: "#2563eb", label: "Total Users" }, { k: "newUsers", c: "#a855f7", label: "New Users" }], 300, "growth"),
      funnelChart: this.funnelChart(this.funnelDefs, fi),
      chartMessages: this.barChart(msgs, [{ k: "messages", c: "#2563eb", label: "Messages" }, { k: "responses", c: "#60a5fa", label: "Responses" }], 300, false, "messages"),
      intentDonut, intentTotal, intents, centerTop, centerMid, centerBot, funnel, funnelDetail, performance, systemStatus,
      chatBotList, botStats, chartBotPerf, noSelectedBot: !selectedBot, selectedBot,
      statusFilter: s.statusFilter, onFilter: (e) => this.setState({ statusFilter: e.target.value }),
      shownCount: shown.length, totalCount: allBots.length, embedIcon, analyticsIcon, analyticsIconBlue, tagIconWhite: this.icon("userplus", "#fff", 15),
      backFromBot: () => this.setState({ selectedBotId: null }),
      showEmbed: s.showEmbed, embedCode: s.embedCode, closeEmbed: () => this.setState({ showEmbed: false }), copyEmbed: () => this.copyEmbedCode(),
      conversations, convCount: convFiltered.length, noSelectedConv: !selectedConv, selectedConv, backToConv: () => { if (s.convFrom) { this.setState({ view: "users", userConvId: s.convFrom, convFrom: null, selectedConvId: null, convNotes: "" }); } else { this.setState({ selectedConvId: null, convNotes: "" }); } }, convBackLabel: s.convFrom ? "Back to User Conversations" : "Back to Conversations",
      convStatusFilter: s.convStatusFilter, convSentimentFilter: s.convSentimentFilter, convStart: s.convStart, convEnd: s.convEnd, onConvStart: (e) => this.setAndReload({ convStart: e.target.value, convPage: 1 }, () => this.loadConversations()),
      onConvEnd: (e) => this.setAndReload({ convEnd: e.target.value, convPage: 1 }, () => this.loadConversations()), onConvStatus: (e) => this.setState({ convStatusFilter: e.target.value }), onConvSentiment: (e) => this.setState({ convSentimentFilter: e.target.value }),
      convNotes: s.convNotes, onConvNotes: (e) => this.setState({ convNotes: e.target.value }), notesEmpty,
      updateKbStyle: `margin-top:12px;width:100%;height:40px;border:0;border-radius:8px;font-family:inherit;font-weight:500;color:#fff;background:${notesEmpty ? "#93c5fd" : "#006ce0"};cursor:${notesEmpty ? "not-allowed" : "pointer"}`,
      updateKb: () => { if (notesEmpty) return; this.setState({ convNotes: "" }); this.toastMsg("Knowledge Base Updated", "Your notes have been processed and the knowledge base updated with new insights."); },
      analyticsBot: s.analyticsBot, analyticsRange: s.analyticsRange, analyticsBotOptions, onAnalyticsBot: (e) => this.setState({ analyticsBot: e.target.value }), onAnalyticsRange: (e) => this.setState({ analyticsRange: e.target.value }),
      isBarView: s.chartView === "bar", isPieView: s.chartView === "pie", setBar: () => this.setState({ chartView: "bar" }), setPie: () => this.setState({ chartView: "pie" }),
      barBtn: s.chartView === "bar" ? btnOn : btnOff, pieBtn: s.chartView === "pie" ? btnOn : btnOff,
      chartKeywords: this.barChart(kwBar, [{ k: "count", c: "#2563eb", label: "Frequency" }], 300, true, "keywords"),
      chartKeywordsPie: this.pieChart(this.keywordDefs.slice(0, 8), "count", pieColors, 300), keywordLegend,
      keywordTable, categories, chartTrends: this.areaChart(trendsD, [{ k: "courses", c: "#2563eb", label: "Courses" }, { k: "enrollment", c: "#1fae5a", label: "Enrollment" }, { k: "pricing", c: "#f59e0b", label: "Pricing" }], 300, "trends", true),
      heatmapEl: this.heatmap(this.heatmapRows), peakInsights, dailyUsage, staffing, kbOverview,
      kbMain: s.kbView === "main", kbAdd: s.kbView === "add", kbEntries: s.kbView === "entries",
      openAddContent: () => this.setState({ kbView: "add" }), openViewEntries: () => this.setState({ kbView: "entries" }), kbBack: () => this.setState({ kbView: "main", kbTouched: false }),
      kbTitle: s.kbTitle, kbCategory: s.kbCategory, kbPriority: s.kbPriority, kbContent: s.kbContent, kbTags: s.kbTags,
      onKbTitle: (e) => this.setState({ kbTitle: e.target.value }), onKbCategory: (e) => this.setState({ kbCategory: e.target.value }), onKbPriority: (e) => this.setState({ kbPriority: e.target.value }), onKbContent: (e) => this.setState({ kbContent: e.target.value }), onKbTags: (e) => this.setState({ kbTags: e.target.value }),
      kbStatus, kbDocsView, kbCanSave,
      kbSaveStyle: `height:40px;padding:0 18px;border:0;border-radius:8px;font-family:inherit;font-weight:500;color:#fff;background:${kbCanSave ? "#006ce0" : "#93c5fd"};cursor:${kbCanSave ? "pointer" : "not-allowed"};display:inline-flex;align-items:center;gap:8px`,
      kbPublishStyle: `width:100%;height:40px;border:0;border-radius:8px;font-family:inherit;font-weight:500;color:#fff;background:${kbCanSave ? "#006ce0" : "#93c5fd"};cursor:${kbCanSave ? "pointer" : "not-allowed"}`,
      setKbFile: (el) => { this._kbFile = el; }, triggerKbUpload: () => { if (this._kbFile) this._kbFile.click(); },
      onKbDocs: (e) => { const files = Array.from(e.target.files || []); if (files.length) { const add = files.map(f => ({ name: f.name, size: this.formatFileSize(f.size) })); this.setState({ kbDocs: [...s.kbDocs, ...add] }); this.toastMsg("Documents Uploaded", `${files.length} document(s) uploaded successfully.`); } e.target.value = ""; },
      kbPreview: () => this.toastMsg("Preview Mode", "Opening content preview in a new window..."),
      kbSave: () => { if (!kbCanSave) { this.setState({ kbTouched: true }); return this.toastMsg("Validation Error", "Title and content are required fields."); } const n = s.kbDocs.length; this.setState({ kbTitle: "", kbCategory: "", kbPriority: "medium", kbContent: "", kbTags: "", kbDocs: [], kbView: "entries", kbTouched: false }); this.toastMsg("Content Added Successfully", `"${s.kbTitle}" has been added to the knowledge base with ${n} document(s).`); },
      kbSearch: s.kbSearch, kbCat: s.kbCat, kbPrio: s.kbPrio, onKbSearch: (e) => this.setState({ kbSearch: e.target.value }), onKbCat: (e) => this.setState({ kbCat: e.target.value }), onKbPrio: (e) => this.setState({ kbPrio: e.target.value }),
      kbEntriesView, kbEntryStats, kbHasEntries: kbEntriesView.length > 0, kbNoEntries: kbEntriesView.length === 0, kbShown: kbEntriesView.length, kbTotal: this.kbEntriesData.length,
      toastExportKw: () => this.toastMsg("Export Started", "Keyword analytics data is being prepared for download."), downloadIcon: this.icon("download", "#334155", 14),
      toastKb: () => this.toastMsg("Knowledge Base", "Opening content management..."), plusIcon: this.icon("plus", "#fff", 16),
      users, userStats, userCount: this.userDefs.length, shownUserCount: filteredUsers.length, userConvView, noUserConv: !s.userConvId, backFromUserConv: () => this.setState({ userConvId: null }),
      userFilter: s.userFilter, engThreshold: s.engThreshold, convThreshold: s.convThreshold,
      onUserFilter: (e) => this.setState({ userFilter: e.target.value }), onEngThreshold: (e) => this.setState({ engThreshold: Number(e.target.value) || 0 }), onConvThreshold: (e) => this.setState({ convThreshold: Number(e.target.value) || 0 }),
      applyFilters: () => this.toastMsg("Filters Applied", `Showing ${filteredUsers.length} of ${this.userDefs.length} users.`),
      addAdmin: () => this.setState({ showAddAdmin: true }), userPlusIcon: this.icon("userplus", "#fff", 16), shieldIcon: this.icon("shield", "#334155", 16),
      showAddAdmin: s.showAddAdmin, closeAddAdmin: () => this.setState({ showAddAdmin: false, aTouched: false }),
      aName: s.aName, aEmail: s.aEmail, aRole: s.aRole, aDept: s.aDept, adminRoleOptions: roleOptions,
      onAName: (e) => this.setState({ aName: e.target.value }), onAEmail: (e) => this.setState({ aEmail: e.target.value }), onADept: (e) => this.setState({ aDept: e.target.value }), onARoleVal: (v) => this.setState({ aRole: v }),
      aNameBad, aEmailBad, aNameStyle: invStyle(aNameBad), aEmailStyle: invStyle(aEmailBad),
      submitAddAdmin: () => {
        if (!s.aName.trim() || !emailRe.test(s.aEmail.trim())) { this.setState({ aTouched: true }); return this.toastMsg("Validation Error", "A valid name and email are required."); }
        const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const perms = { admin: ["read", "write", "admin"], moderator: ["read", "write"], user: ["read"] };
        const nu = { id: "u" + Date.now(), name: s.aName.trim(), email: s.aEmail.trim(), role: s.aRole, eng: 0, conv: 0, session: 0, sat: 0, status: "active", department: s.aDept.trim() || "\u2014", topics: [], permissions: perms[s.aRole] || ["read"], joined: today, lastActive: today };
        this.setState({ usersData: [...this.userDefs, nu], showAddAdmin: false, aTouched: false, aName: "", aEmail: "", aRole: "admin", aDept: "" });
        this.toastMsg("Admin Added", `${nu.name} has been added as ${nu.role}.`);
      },
      openRoleModal: () => this.setState({ showRole: true, selectedUserId: null, rolePerms: null, roleValue: "user" }),
      userModal, closeUserModal: () => this.setState({ showUserModal: false }), openRoleFromUser: () => this.setState({ showUserModal: false, showRole: true, rolePerms: null, roleValue: um ? um.role : "user" }),
      toastUser: () => this.toastMsg("Permission Updated", "The permission has been revoked."),
      showRole: s.showRole, closeRole: () => this.setState({ showRole: false }), roleName: roleUser ? "\u2014 " + roleUser.name : "", roleValue: s.roleValue, onRoleValue: (e) => this.setState({ roleValue: e.target.value }),
      rolePermissions, saveRole: () => { this.setState({ showRole: false }); this.toastMsg("Changes Saved", "User roles and permissions have been updated."); },
      showCreate: s.showCreate, closeCreate: () => this.setState({ showCreate: false, createTouched: false, editBotId: null }), stop: (e) => e.stopPropagation(),
      newName: s.newName, newKb: s.newKb, newDesc: s.newDesc, newAgents: s.newAgents, newStatus: s.newStatus, newLang: s.newLang,
      onNewName: (e) => this.setState({ newName: e.target.value }), onNewKb: (e) => this.setState({ newKb: e.target.value }), onNewDesc: (e) => this.setState({ newDesc: e.target.value }),
      onNewAgents: (e) => this.setState({ newAgents: e.target.value }), onNewStatus: (e) => this.setState({ newStatus: e.target.value }), onNewLang: (e) => this.setState({ newLang: e.target.value }),
      statusFilterOptions, convStatusOptions, convSentimentOptions, analyticsRangeOptions, kbSelectOptions, agentOptions, statusInitOptions, langOptions, contentCatOptions, priorityOptions, catFilterOptions, prioFilterOptions, userFilterOptions, roleOptions,
      onFilterVal: (v) => this.setAndReload({ statusFilter: v, botPage: 1 }, () => this.loadBots()), onConvStatusVal: (v) => this.setAndReload({ convStatusFilter: v, convPage: 1 }, () => this.loadConversations()),
      onConvSentimentVal: (v) => this.setAndReload({ convSentimentFilter: v, convPage: 1 }, () => this.loadConversations()),
      onAnalyticsBotVal: (v) => this.setState({ analyticsBot: v }), onAnalyticsRangeVal: (v) => this.setState({ analyticsRange: v }),
      onNewKbVal: (v) => this.setState({ newKb: v }), onNewAgentsVal: (v) => this.setState({ newAgents: v }), onNewStatusVal: (v) => this.setState({ newStatus: v }), onNewLangVal: (v) => this.setState({ newLang: v }),
      onKbCategoryVal: (v) => this.setState({ kbCategory: v }), onKbPriorityVal: (v) => this.setState({ kbPriority: v }), onKbCatVal: (v) => this.setState({ kbCat: v }), onKbPrioVal: (v) => this.setState({ kbPrio: v }),
      onUserFilterVal: (v) => this.setState({ userFilter: v }), onRoleValueVal: (v) => this.setState({ roleValue: v }),
      cName, cDesc, cKb, cAgents, kTitle, kContent,
      nameStyle: invStyle(cName), descStyle: invAreaStyle(cDesc), kbTitleStyle: invStyle(kTitle), kbContentStyle: `width:100%;box-sizing:border-box;border:1px solid ${kContent ? "#f87171" : "#e2e8f0"};border-radius:8px;padding:10px 12px;font-family:inherit;outline:none;resize:vertical`,
      submitCreate: () => {
        if (!s.newName.trim() || !s.newDesc.trim() || !s.newKb || !s.newAgents) { this.setState({ createTouched: true }); return this.toastMsg("Validation Error", "Please complete all required fields marked with *."); }
        const kb = kbSelectOptions.find((o) => o.value === s.newKb);
        this.saveBot({
          name: s.newName.trim(), description: s.newDesc.trim(),
          knowledgeBaseId: s.newKb, knowledgeBaseName: kb ? kb.label : s.newKb,
          guidelineId: s.newGuideline, languageCode: s.newLang,
          status: s.newStatus, agentIds: String(s.newAgents),
        });
      },
      // Guideline names for both modals; empty until the list has loaded.
      guidelineOptions: s.guidelineOptionsData || [],
      newGuideline: s.newGuideline, onNewGuidelineVal: (val) => this.setState({ newGuideline: val }),

      // Agent Management
      isAgents: s.view === "agents",
      agentList: (s.agentsData || []).map((a) => ({
        id: a.id, name: a.name, description: a.description,
        roleName: a.roleName, goal: a.goal, expectedOutput: a.expectedOutput || "-",
        statusLabel: a.isActive ? "Active" : "Retired", createdAt: a.createdAt,
        statusChip: `display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;${a.isActive ? "background:#dcfce7;color:#166534" : "background:#f1f5f9;color:#475569"}`,
        trashIcon: this.icon("trash", "#dc2626", 15),
        pencilIcon: this.icon("pencil", "#006ce0", 15),
        onEdit: () => this.openEditAgent(a),
        onDelete: () => this.deleteAgent(a.id, a.name),
      })),
      noAgents: (s.agentsData || []).length === 0,
      isEditBot: !!s.editBotId,
      botModalTitle: s.editBotId ? "Edit Chat Bot" : "Create New Chat Bot",
      botModalSubtitle: s.editBotId ? "Update this chat bot's knowledge base, agents and status" : "Configure a new chat bot for your knowledge base",
      botSubmitLabel: s.editBotId ? "Save Changes" : "Create Chat Bot",
      openCreateAgent: () => this.setState({
        showCreateAgent: true, createAgentTouched: false, editAgentId: null, editAgentCode: "",
        agentName: "", agentDesc: "", agentRole: "", agentGoal: "",
        agentBackstory: "", agentInstructions: "", agentExpectedOutput: "", agentIsActive: true,
      }),
      showCreateAgent: s.showCreateAgent,
      closeCreateAgent: () => this.setState({ showCreateAgent: false, createAgentTouched: false, editAgentId: null, editAgentCode: "" }),
      // The popup is shared by create and edit.
      isEditAgent: !!s.editAgentId,
      agentModalTitle: s.editAgentId ? "Edit Agent" : "Create New Agent",
      agentModalSubtitle: s.editAgentId ? "Update this agent's role, goal and instructions" : "Configure a new agent for your knowledge base",
      agentSubmitLabel: s.editAgentId ? "Save Changes" : "Create Agent",
      agentName: s.agentName, agentDesc: s.agentDesc,
      agentRole: s.agentRole, agentGoal: s.agentGoal, agentBackstory: s.agentBackstory,
      agentInstructions: s.agentInstructions, agentExpectedOutput: s.agentExpectedOutput, agentIsActive: s.agentIsActive,
      onAgentName: (e) => this.setState({ agentName: e.target.value }),
      onAgentDesc: (e) => this.setState({ agentDesc: e.target.value }),
      onAgentRole: (e) => this.setState({ agentRole: e.target.value }),
      onAgentGoal: (e) => this.setState({ agentGoal: e.target.value }),
      onAgentBackstory: (e) => this.setState({ agentBackstory: e.target.value }),
      onAgentInstructions: (e) => this.setState({ agentInstructions: e.target.value }),
      onAgentExpectedOutput: (e) => this.setState({ agentExpectedOutput: e.target.value }),
      toggleAgentActive: () => this.setState({ agentIsActive: !s.agentIsActive }),
      acName, acDesc, acRole, acGoal,
      agentNameStyle: invStyle(acName), agentDescStyle: invAreaStyle(acDesc),
      agentRoleStyle: invStyle(acRole), agentGoalStyle: invAreaStyle(acGoal),
      agentTextStyle: invAreaStyle(false),
      activeTrackStyle: `position:relative;flex-shrink:0;width:44px;height:24px;border:0;border-radius:9999px;cursor:pointer;padding:0;transition:background .2s;background:${s.agentIsActive ? "#006ce0" : "#cbd5e1"}`,
      activeKnobStyle: `position:absolute;top:3px;left:${s.agentIsActive ? "23px" : "3px"};width:18px;height:18px;border-radius:9999px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .2s`,
      activeLabel: s.agentIsActive ? "Active" : "Retired",
      activeHint: s.agentIsActive
        ? "The agent can be tagged to a bot."
        : "Retired: it stays on the bots it is already tagged to, but cannot be added to a new one.",
      submitCreateAgent: () => {
        if (!s.agentName.trim() || !s.agentDesc.trim() || !s.agentRole.trim() || !s.agentGoal.trim()) { this.setState({ createAgentTouched: true }); return this.toastMsg("Validation Error", "Please complete all required fields marked with *."); }
        // RoleName NVARCHAR(200), Goal NVARCHAR(1000), Backstory NVARCHAR(MAX),
        // Instructions NVARCHAR(MAX, one per line), ExpectedOutput NVARCHAR(1000), IsActive BIT
        this.saveAgent({
          name: s.agentName.trim(), description: s.agentDesc.trim(),
          roleName: s.agentRole.trim(), goal: s.agentGoal.trim(), backstory: s.agentBackstory.trim(),
          instructions: s.agentInstructions.split("\n").map((line) => line.trim()).filter(Boolean).join("\n"),
          expectedOutput: s.agentExpectedOutput.trim(), isActive: s.agentIsActive ? 1 : 0,
        });
      },
      // Search boxes, filters and pagers for the list tabs.
      botSearch: s.botSearch,
      onBotSearch: (e) => this.onListSearch("botSearch", "botPage", e.target.value, () => this.loadBots()),
      botPager: pagerFor(s.botPage, s.botTotal, (n) => this.setAndReload({ botPage: n }, () => this.loadBots())),
      convSearch: s.convSearch,
      onConvSearch: (e) => this.onListSearch("convSearch", "convPage", e.target.value, () => this.loadConversations()),
      convPager: pagerFor(s.convPage, s.convTotal, (n) => this.setAndReload({ convPage: n }, () => this.loadConversations())),
      agentSearch: s.agentSearch,
      onAgentSearch: (e) => this.onListSearch("agentSearch", "agentPage", e.target.value, () => this.loadAgents()),
      agentStatusFilter: s.agentStatusFilter, agentStatusOptions,
      onAgentStatusVal: (val) => this.setAndReload({ agentStatusFilter: val, agentPage: 1 }, () => this.loadAgents()),
      agentPager: pagerFor(s.agentPage, s.agentTotal, (n) => this.setAndReload({ agentPage: n }, () => this.loadAgents())),
      searchBoxStyle: "width:100%;box-sizing:border-box;height:38px;border:1px solid #e2e8f0;border-radius:8px;padding:0 12px 0 34px;font-family:inherit;font-size:.8125rem;color:#334155;outline:none;background:#fff",
      toast: s.toast,
    };
  }

  render() {
    const v = this.renderVals();
    return (
      <AppShell active="managebots" searchPlaceholder="Search bots...">
        <div style={S("min-height:100%;background:#f9fafb;color:#0f172a;font-family:'Open Sans',sans-serif")}><div style={S("padding:24px 24px 0;width:100%;box-sizing:border-box")}><div style={S("display:flex;align-items:center;gap:12px")}><h1 style={S("font-size:1.5rem;font-weight:500;margin:0")}>Manage Bots</h1><span style={S("width:28px;height:28px;border-radius:9999px;background:#eff6ff;color:#60a5fa;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.05)")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg></span>{(v.headerAction) ? (<><button style={S("margin-left:auto;height:36px;padding:0 16px;background:#006ce0;color:#fff;border:0;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px")} type="button" onClick={v.headerAction.onClick}>{v.headerAction.icon}{v.headerAction.label}</button></>) : null}</div><div style={S("display:inline-flex;align-items:center;gap:6px;margin-top:16px;max-width:100%;overflow-x:auto;padding:5px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:9999px")} role="tablist" aria-label="Manage Bots sections">{(v.tabs || []).map((tab, $index) => (<React.Fragment key={$index}><Hoverable as="button" base={S(tab.style)} hover={S(tab.hover)} type="button" role="tab" id={tab.tabId} aria-controls={tab.panelId} aria-selected={tab.selected} onClick={tab.onClick}><span style={S("display:flex;flex-shrink:0")}>{tab.icon}</span><span>{tab.title}</span></Hoverable></React.Fragment>))}</div></div><div style={S("padding:20px 0 24px")}>{(v.isOverview) ? (<><div style={S("width:100%;box-sizing:border-box;padding:0 24px;animation:lv-fade-in .3s ease-out")} id="panel-overview" role="tabpanel" aria-labelledby="tab-overview"><div style={S("margin-bottom:8px")}><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>Overview</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>ChatBot performance and engagement at a glance</p></div><div style={S("display:flex;align-items:center;gap:8px;margin:20px 0 12px 4px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Key Metrics</h3></div><div className="mb-kpi">{(v.metrics || []).map((m, $index) => (<React.Fragment key={$index}><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><div style={S("display:flex;align-items:flex-start;justify-content:space-between")}><div><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>{m.label}</p><p style={S("font-size:1.875rem;font-weight:600;margin:6px 0 0;line-height:1")}>{m.value}</p><p style={S("font-size:.8125rem;color:#16a34a;margin:6px 0 0;font-weight:500")}>{m.change}</p></div><span style={S(`height:40px;width:40px;border-radius:12px;background:${m.chipBg};display:flex;align-items:center;justify-content:center`)}>{m.icon}</span></div></div></React.Fragment>))}</div><div style={S("margin-top:24px;border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Quick Actions</h3></div><div className="mb-3col"><Hoverable as="button" base={S("display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #cfe0fb;border-radius:12px;background:#eff4ff;font-family:inherit;cursor:pointer;text-align:left;transition:box-shadow .15s,transform .15s")} hover={S("display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #cfe0fb;border-radius:12px;background:#e2edfd;font-family:inherit;cursor:pointer;text-align:left;box-shadow:0 8px 18px rgba(0,108,224,.16);transform:translateY(-2px)")} type="button" onClick={v.goChatbots}><span style={S("width:42px;height:42px;border-radius:10px;background:#006ce0;display:flex;align-items:center;justify-content:center;flex:none")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg></span><span style={S("display:flex;flex-direction:column;gap:2px;flex:1")}><span style={S("font-size:.9rem;font-weight:600;color:#0f172a")}>Manage Chat Bots</span><span style={S("font-size:12px;color:#475569")}>Create &amp; configure your bots</span></span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#006ce0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></Hoverable><Hoverable as="button" base={S("display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #bbf0da;border-radius:12px;background:#ecfdf5;font-family:inherit;cursor:pointer;text-align:left;transition:box-shadow .15s,transform .15s")} hover={S("display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #bbf0da;border-radius:12px;background:#d7f7e9;font-family:inherit;cursor:pointer;text-align:left;box-shadow:0 8px 18px rgba(5,150,105,.16);transform:translateY(-2px)")} type="button" onClick={v.goConversations}><span style={S("width:42px;height:42px;border-radius:10px;background:#059669;display:flex;align-items:center;justify-content:center;flex:none")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></span><span style={S("display:flex;flex-direction:column;gap:2px;flex:1")}><span style={S("font-size:.9rem;font-weight:600;color:#0f172a")}>Review Conversations</span><span style={S("font-size:12px;color:#475569")}>Browse recent chat transcripts</span></span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></Hoverable><Hoverable as="button" base={S("display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #e2d5fb;border-radius:12px;background:#f5f0ff;font-family:inherit;cursor:pointer;text-align:left;transition:box-shadow .15s,transform .15s")} hover={S("display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #e2d5fb;border-radius:12px;background:#ece0fd;font-family:inherit;cursor:pointer;text-align:left;box-shadow:0 8px 18px rgba(124,58,237,.16);transform:translateY(-2px)")} type="button" onClick={v.toastExport}><span style={S("width:42px;height:42px;border-radius:10px;background:#7c3aed;display:flex;align-items:center;justify-content:center;flex:none")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></span><span style={S("display:flex;flex-direction:column;gap:2px;flex:1")}><span style={S("font-size:.9rem;font-weight:600;color:#0f172a")}>Export Analytics</span><span style={S("font-size:12px;color:#475569")}>Download a performance report</span></span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></Hoverable></div></div><div style={S("margin-top:24px")} className="mb-2col"><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><div><h3 style={S("font-size:1.05rem;font-weight:600;margin:0")}>User Growth Trend</h3><p style={S("font-size:13px;color:#64748b;margin:0")}>Total vs new users</p></div></div>
            {v.chartGrowth}
          </div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><div><h3 style={S("font-size:1.05rem;font-weight:600;margin:0")}>Weekly Message Activity</h3><p style={S("font-size:13px;color:#64748b;margin:0")}>Messages vs responses</p></div></div>
            {v.chartMessages}
          </div></div><div style={S("margin-top:24px")} className="mb-intperf"><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px;display:flex;flex-direction:column")}><div style={S("display:flex;align-items:center;gap:10px;margin-bottom:16px")}><span style={S("width:4px;height:28px;border-radius:9999px;background:#059669;flex:none")} /><div><h3 style={S("font-size:1rem;font-weight:600;margin:0")}>Query Intent Distribution</h3><p style={S("font-size:12px;color:#64748b;margin:0")}>Share of queries by intent</p></div></div><div style={S("flex:1;display:flex;flex-direction:column;gap:18px")}><div style={S("position:relative;width:172px;height:172px;margin:2px auto 0")}><div style={S(v.intentDonut)} /><div style={S("position:absolute;inset:28px;background:#fff;border-radius:9999px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 10px")}><span style={S("font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#334155;font-weight:600")}>{v.centerTop}</span><span style={S("font-size:1.5rem;font-weight:600;line-height:1;margin-top:3px")}>{v.centerMid}</span><span style={S("font-size:11px;color:#64748b;margin-top:2px;font-weight:500")}>{v.centerBot}</span></div></div><div style={S("display:flex;flex-direction:column;flex:1;justify-content:space-evenly")}>{(v.intents || []).map((it, $index) => (<React.Fragment key={$index}><Hoverable as="div" base={S("display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:8px;cursor:default")} hover={S("display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:8px;cursor:default;background:#f1f5f9")} onMouseEnter={it.enter} onMouseLeave={it.leave}><div style={S("display:flex;align-items:center;gap:10px")}><span style={S(`width:12px;height:12px;border-radius:3px;background:${it.color}`)} /><span style={S("font-size:.9rem;font-weight:500")}>{it.name}</span></div><div style={S("text-align:right")}><span style={S("font-size:.95rem;font-weight:600")}>{it.value}</span><span style={S("font-size:12px;color:#64748b;margin-left:6px")}>({it.pct}%)</span></div></Hoverable></React.Fragment>))}</div></div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><div style={S("display:flex;align-items:center;gap:10px;margin-bottom:16px")}><span style={S("width:4px;height:28px;border-radius:9999px;background:#2563eb;flex:none")} /><div><h3 style={S("font-size:1rem;font-weight:600;margin:0")}>Performance vs Targets</h3><p style={S("font-size:12px;color:#64748b;margin:0")}>Current value against goal</p></div></div><div style={S("display:grid;grid-template-columns:1fr 1fr;gap:12px")}>{(v.performance || []).map((p, $index) => (<React.Fragment key={$index}><div style={S("display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px")}>
                  {p.gauge}
                  <div style={S("display:flex;flex-direction:column;align-items:center;gap:5px")}><p style={S("font-size:.8rem;font-weight:600;margin:0;text-align:center")}>{p.metric}</p><span style={S(p.badge)}>{p.status}</span></div></div></React.Fragment>))}</div></div></div><div style={S("margin-top:24px;border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><div style={S("display:flex;align-items:center;gap:10px;margin-bottom:16px")}><span style={S("width:4px;height:28px;border-radius:9999px;background:#7c3aed;flex:none")} /><div><h3 style={S("font-size:1rem;font-weight:600;margin:0")}>User Conversion Funnel</h3><p style={S("font-size:12px;color:#64748b;margin:0")}>Hover a stage to see its details</p></div></div><div style={S("display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;align-items:center")} className="mb-funnel"><div style={S("display:flex;align-items:center;justify-content:center;padding:4px 0")}><div style={S("width:100%;max-width:520px")}>{v.funnelChart}</div></div><div style={S(`align-self:stretch;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-top:4px solid ${v.funnelDetail.color};border-radius:12px;display:flex;flex-direction:column`)}><h4 style={S("font-size:.95rem;font-weight:600;margin:0")}>{v.funnelDetail.stage}</h4><div style={S("display:flex;align-items:baseline;gap:8px;margin:4px 0 12px")}><span style={S(`font-size:1.3rem;font-weight:600;line-height:1;color:${v.funnelDetail.color}`)}>{v.funnelDetail.count}</span><span style={S("font-size:12px;color:#64748b")}>users · {v.funnelDetail.pct}%</span></div><div style={S("display:grid;grid-template-columns:1fr 1fr;gap:12px 16px")}><div><p style={S("font-size:12px;color:#64748b;margin:0")}>Avg. Time Spent</p><p style={S("font-size:.9rem;font-weight:600;margin:1px 0 0")}>{v.funnelDetail.avgTimeSpent}</p></div><div><p style={S("font-size:12px;color:#64748b;margin:0")}>Bounce Rate</p><p style={S("font-size:.9rem;font-weight:600;margin:1px 0 0")}>{v.funnelDetail.bounceRate}</p></div><div style={S("grid-column:1/-1")}><p style={S("font-size:12px;color:#64748b;margin:0")}>Top Pages</p><p style={S("font-size:.9rem;font-weight:600;margin:1px 0 0")}>{v.funnelDetail.topPages}</p></div><div style={S("grid-column:1/-1")}><p style={S("font-size:12px;color:#64748b;margin:0 0 5px")}>Device Split</p><div style={S("display:flex;gap:8px")}><span style={S("padding:3px 11px;border-radius:9999px;font-size:12px;font-weight:600;background:#eff6ff;color:#1d4ed8")}>Mobile {v.funnelDetail.mobile}%</span><span style={S("padding:3px 11px;border-radius:9999px;font-size:12px;font-weight:600;background:#f1f5f9;color:#475569")}>Desktop {v.funnelDetail.desktop}%</span></div></div></div></div></div></div><div style={S("margin-top:24px;border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#059669;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>System Status</h3></div><div style={S("display:flex;flex-direction:column;gap:12px")}>{(v.systemStatus || []).map((st, $index) => (<React.Fragment key={$index}><div style={S("display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid #f1f5f9")}><span style={S("font-size:.875rem")}>{st.label}</span><span style={S(st.chip)}><span style={S(st.dot)} />{st.value}</span></div></React.Fragment>))}</div></div></div></>) : null}{(v.isChatbots) ? (<><div style={S("width:100%;box-sizing:border-box;padding:0 24px;animation:lv-fade-in .3s ease-out")} id="panel-chatbots" role="tabpanel" aria-labelledby="tab-chatbots">{(v.noSelectedBot) ? (<><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px")}><div><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>Manage Chat Bots</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>Create, publish and monitor your chat bots</p></div><Hoverable as="button" base={S("flex:none;height:40px;padding:0 18px;background:#006ce0;color:#fff;border:0;border-radius:8px;font-family:inherit;font-size:.875rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 1px 2px rgba(0,87,184,.35)")} hover={S("flex:none;height:40px;padding:0 18px;background:#0057b8;color:#fff;border:0;border-radius:8px;font-family:inherit;font-size:.875rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 3px 8px rgba(0,87,184,.35)")} type="button" onClick={v.openCreate}>{v.createBotIcon}Create Chat Bot</Hoverable></div><div style={S("margin-bottom:24px")} className="mb-3col">{(v.botStats || []).map((b, $index) => (<React.Fragment key={$index}><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><div style={S("display:flex;align-items:center;justify-content:space-between")}><div><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>{b.label}</p><p style={S("font-size:1.875rem;font-weight:600;margin:6px 0 0;line-height:1")}>{b.value}</p></div><span style={S(`height:40px;width:40px;border-radius:12px;background:${b.chipBg};display:flex;align-items:center;justify-content:center`)}>{b.icon}</span></div></div></React.Fragment>))}</div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px;margin-bottom:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>ChatBot Performance Overview</h3></div><div style={S("max-width:640px;margin:0 auto")}>{v.chartBotPerf}</div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);overflow:hidden")}><div style={S("display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid #e2e8f0")}><span style={S("font-size:1rem;font-weight:600")}>All Chat Bots</span><div style={S("display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end")}><div style={S("position:relative;width:240px")}><span style={S("position:absolute;left:11px;top:50%;transform:translateY(-50%);display:inline-flex;pointer-events:none;color:#94a3b8")}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span><input value={v.botSearch} onInput={v.onBotSearch} onChange={v.onBotSearch} placeholder="Search chat bots" style={S(v.searchBoxStyle)} /></div><div style={S("width:170px")}><NiceSelect value={v.statusFilter} options={v.statusFilterOptions} onSelect={v.onFilterVal} placeholder="All Status" height={38} /></div></div></div><div style={S("padding:16px 20px")}><p style={S("font-size:.8125rem;color:#64748b;margin:0 0 12px")}>{v.botPager.label}</p><div style={S("display:flex;flex-direction:column;gap:12px")}>{(v.chatBotList || []).map((bot, $index) => (<React.Fragment key={$index}><Hoverable as="div" base={S("border:1px solid #e6e9ef;border-radius:16px;padding:20px;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);transition:border-color .15s,box-shadow .15s")} hover={S("border:1px solid #cbd5e1;border-radius:16px;padding:20px;box-shadow:0 6px 16px rgba(16,24,40,.08);transition:border-color .15s,box-shadow .15s")}><div className="mb-botcard-head"><div style={S("display:flex;align-items:center;gap:14px;min-width:0")}><span style={S(bot.iconWrap)}>{bot.icon}</span><div style={S("min-width:0")}><div style={S("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}><h4 style={S("font-size:1.0625rem;font-weight:600;margin:0;overflow-wrap:anywhere;min-width:0")}>{bot.name}</h4><span style={S(bot.statusChip)}><span style={S(bot.statusDot)} />{bot.status}</span></div><p style={S("font-size:.8125rem;color:#64748b;margin:3px 0 0")}>Created on {bot.createdLabel}</p></div></div><div style={S("display:flex;align-items:center;gap:8px;flex-shrink:0")}><Hoverable as="button" base={S("height:36px;padding:0 14px 0 8px;border:1px solid #e2e8f0;background:#fff;border-radius:9999px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:9px;white-space:nowrap")} hover={S("height:36px;padding:0 14px 0 8px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:9999px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:9px;white-space:nowrap")} type="button" onClick={bot.onToggle} title={bot.publishTitle}><span style={S(bot.toggleTrack)}><span style={S(bot.toggleKnob)} /></span><span style={S(`font-size:.8125rem;font-weight:600;color:${bot.toggleTextColor}`)}>{bot.publishState}</span></Hoverable><Hoverable as="button" base={S("height:36px;padding:0 14px;border:1px solid rgba(0,108,224,0.18);background:rgba(0,108,224,0.1);border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:500;color:#006ce0;display:inline-flex;align-items:center;gap:6px;white-space:nowrap")} hover={S("height:36px;padding:0 14px;border:1px solid rgba(0,108,224,0.3);background:rgba(0,108,224,0.16);border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:500;color:#0057b8;display:inline-flex;align-items:center;gap:6px;white-space:nowrap")} type="button" onClick={bot.onAnalytics}>{v.analyticsIconBlue}Analytics</Hoverable><Hoverable as="button" base={S("height:36px;padding:0 14px;border:1px solid rgba(0,108,224,0.18);background:rgba(0,108,224,0.1);border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:500;color:#006ce0;display:inline-flex;align-items:center;gap:6px;white-space:nowrap")} hover={S("height:36px;padding:0 14px;border:1px solid rgba(0,108,224,0.3);background:rgba(0,108,224,0.16);border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:500;color:#0057b8;display:inline-flex;align-items:center;gap:6px;white-space:nowrap")} type="button" onClick={bot.onEmbed}>{v.embedIcon}Embed</Hoverable><Hoverable as="button" type="button" title="Edit chat bot" aria-label="Edit chat bot" onClick={bot.onEdit} base={S("height:36px;width:36px;padding:0;border:1px solid #e6e9ef;border-radius:8px;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#eff6ff;border-color:#bfdbfe")}>{bot.pencilIcon}</Hoverable><Hoverable as="button" type="button" title="Delete chat bot" aria-label="Delete chat bot" onClick={bot.onDelete} base={S("height:36px;width:36px;padding:0;border:1px solid #e6e9ef;border-radius:8px;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#fef2f2;border-color:#fecaca")}>{bot.trashIcon}</Hoverable><Hoverable as="button" base={S("height:36px;padding:0 16px;border:0;background:#006ce0;color:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:600;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,87,184,.35)")} hover={S("height:36px;padding:0 16px;border:0;background:#0057b8;color:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:600;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;box-shadow:0 3px 8px rgba(0,87,184,.35)")} type="button" onClick={bot.onTag} title="Tag users to this bot">{v.tagIconWhite}Tag Users{(bot.tagCount) ? (<><span style={S("display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:9999px;background:rgba(255,255,255,0.25);color:#fff;font-size:.6875rem;font-weight:600")}>{bot.tagCount}</span></>) : null}</Hoverable></div></div><div style={S("margin-top:16px;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:16px 4px;gap:0")} className="mb-4col"><div style={S("padding:0 18px;min-width:0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Knowledge Base</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0;overflow-wrap:anywhere")}>{bot.knowledgeBase}</p></div><div style={S("padding:0 18px;min-width:0;border-left:1px solid #e2e8f0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Agents</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0;overflow-wrap:anywhere")}>{bot.agentsLabel}</p></div><div style={S("padding:0 18px;min-width:0;border-left:1px solid #e2e8f0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Conversations</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0;overflow-wrap:anywhere")}>{bot.conversations}</p></div><div style={S("padding:0 18px;min-width:0;border-left:1px solid #e2e8f0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Rating</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0;overflow-wrap:anywhere")}>{bot.ratingLabel}</p></div></div></Hoverable></React.Fragment>))}</div><div style={S("display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px")}><span style={S("font-size:.8125rem;color:#64748b")}>{v.botPager.label}</span><div style={S("display:flex;align-items:center;gap:8px")}><button type="button" style={S(v.botPager.prevStyle)} disabled={!v.botPager.canPrev} onClick={v.botPager.prev}>Previous</button><span style={S("font-size:.8125rem;color:#334155")}>Page {v.botPager.page} of {v.botPager.pages}</span><button type="button" style={S(v.botPager.nextStyle)} disabled={!v.botPager.canNext} onClick={v.botPager.next}>Next</button></div></div></div></div></>) : null}{(v.selectedBot) ? (<><Hoverable as="button" base={S("margin-bottom:16px;height:34px;padding:0 14px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;color:#334155;display:inline-flex;align-items:center;gap:6px")} hover={S("background:#f8fafc")} type="button" onClick={v.backFromBot}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>Back to Chat Bots</Hoverable><div style={S("margin-bottom:16px")}><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>{v.selectedBot.name} — Analytics</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>Performance for this chat bot</p></div><div style={S("margin-bottom:24px")} className="mb-kpi">{(v.selectedBot.metrics || []).map((m, $index) => (<React.Fragment key={$index}><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px;text-align:center")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>{m.label}</p><p style={S("font-size:1.375rem;font-weight:600;margin:6px 0 0;line-height:1.2")}>{m.value}</p></div></React.Fragment>))}</div>{(v.selectedBot.hasAnalytics) ? (<><div className="mb-2col"><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Daily Conversations</h3></div>
                {v.selectedBot.chart}
              </div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#7c3aed;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Top Conversation Intents</h3></div><div style={S("display:flex;flex-direction:column;gap:14px")}>{(v.selectedBot.topIntents || []).map((ti, $index) => (<React.Fragment key={$index}><div><div style={S("display:flex;justify-content:space-between;margin-bottom:6px")}><span style={S("font-size:.875rem;font-weight:500")}>{ti.intent}</span><span style={S("font-size:.8125rem;color:#64748b")}>{ti.count}</span></div><div style={S("width:100%;height:8px;background:#eef2f7;border-radius:9999px;overflow:hidden")}><div style={S(ti.bar)} /></div></div></React.Fragment>))}</div></div></div><div style={S("margin-top:24px;border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#059669;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Recent User Engagement</h3></div><div style={S("display:flex;flex-direction:column;gap:10px")}>{(v.selectedBot.users || []).map((u, $index) => (<React.Fragment key={$index}><div style={S("display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f8fafc;border-radius:10px")}><div><p style={S("font-weight:600;font-size:.875rem;margin:0")}>{u.name}</p><p style={S("font-size:11px;color:#64748b;margin:2px 0 0")}>{u.meta}</p></div><span style={S("display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:#dcfce7;color:#166534")}>{u.satisfaction}/5</span></div></React.Fragment>))}</div></div><div style={S("margin-top:24px")} className="mb-2col"><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#d97706;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Escalation Rate &amp; Overview</h3></div><div style={S("gap:16px;margin-bottom:16px")} className="mb-2col"><div style={S("text-align:center;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px")}><p style={S("font-size:11px;font-weight:600;color:#92400e;margin:0")}>Escalation Rate</p><p style={S("font-size:1.5rem;font-weight:600;color:#b45309;margin:6px 0 0")}>{v.selectedBot.escalation.rate}%</p></div><div style={S("text-align:center;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px")}><p style={S("font-size:11px;font-weight:600;color:#64748b;margin:0")}>Escalated</p><p style={S("font-size:1.5rem;font-weight:600;margin:6px 0 0")}>{v.selectedBot.escalation.escalated}</p><p style={S("font-size:11px;color:#94a3b8;margin:2px 0 0")}>of {v.selectedBot.escalation.total} total</p></div></div><p style={S("font-size:11px;font-weight:600;color:#64748b;margin:0 0 8px")}>Escalation Trend (6 weeks)</p>
                {v.selectedBot.escalationChart}
              </div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Escalation Reasons</h3></div><div style={S("display:flex;flex-direction:column;gap:12px")}>{(v.selectedBot.escalation.reasons || []).map((r, $index) => (<React.Fragment key={$index}><div style={S("padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px")}><div style={S("display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px")}><div style={S("min-width:0")}><p style={S("font-size:.875rem;font-weight:600;margin:0")}>{r.reason}</p><p style={S("font-size:11px;color:#64748b;margin:2px 0 0")}>{r.description}</p></div><div style={S("display:flex;align-items:center;gap:8px;flex-shrink:0")}><span style={S(r.badge)}>{r.pct}%</span><span style={S("font-size:.8125rem;font-weight:600")}>{r.count}</span></div></div><div style={S("width:100%;height:6px;background:#eef2f7;border-radius:9999px;overflow:hidden")}><div style={S(r.bar)} /></div></div></React.Fragment>))}</div></div></div><div style={S("margin-top:24px")} className="mb-3col"><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 12px")}>Fallback Overview</p><div style={S("text-align:center;padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:10px")}><p style={S("font-size:11px;font-weight:600;color:#b91c1c;margin:0")}>Fallback Rate</p><p style={S("font-size:1.375rem;font-weight:600;color:#dc2626;margin:4px 0 0")}>{v.selectedBot.fallback.rate}%</p></div><div style={S("text-align:center;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px")}><p style={S("font-size:11px;font-weight:600;color:#64748b;margin:0")}>Total Fallbacks</p><p style={S("font-size:1.375rem;font-weight:600;margin:4px 0 0")}>{v.selectedBot.fallback.total}</p></div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px;grid-column:span 2")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 12px")}>Fallback Categories</p><div style={S("display:flex;flex-direction:column;gap:10px")}>{(v.selectedBot.fallback.categories || []).map((fc, $index) => (<React.Fragment key={$index}><div style={S("display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;background:#f8fafc;border-radius:8px")}><span style={S("font-size:.8125rem;font-weight:500")}>{fc.category}</span><div style={S("display:flex;align-items:center;gap:10px")}><div style={S("width:96px;height:6px;background:#eef2f7;border-radius:9999px;overflow:hidden")}><div style={S(fc.bar)} /></div><span style={S("font-size:.6875rem;font-weight:600;color:#1d4ed8")}>{fc.pct}%</span><span style={S("font-size:.8125rem;font-weight:600;width:28px;text-align:right")}>{fc.count}</span></div></div></React.Fragment>))}</div></div></div><div style={S("margin-top:24px;border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#0ea5e9;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Recent Unanswered Queries</h3></div><div style={S("display:flex;flex-direction:column;gap:12px;max-height:520px;overflow-y:auto")}>{(v.selectedBot.fallback.recent || []).map((q, $index) => (<React.Fragment key={$index}><div style={S("padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px")}><div style={S("display:flex;justify-content:space-between;align-items:flex-start;gap:12px")}><p style={S("font-size:.875rem;font-weight:600;margin:0")}>"{q.query}"</p><span style={S(q.confBadge)}>Conf {q.confidence}%</span></div><div style={S("display:flex;align-items:center;gap:8px;margin:8px 0 10px")}><span style={S("font-size:11px;color:#94a3b8")}>{q.date}</span><span style={S(q.catBadge)}>{q.category}</span></div><div style={S("gap:8px 20px")} className="mb-2col"><div><p style={S("font-size:11px;color:#64748b;margin:0")}>Fallback Reason</p><p style={S("font-size:.8125rem;margin:2px 0 0")}>{q.reason}</p></div><div><p style={S("font-size:11px;color:#64748b;margin:0")}>User Follow-up</p><p style={S("font-size:.8125rem;margin:2px 0 0")}>{q.followUp}</p></div></div><div style={S("display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0")}><Hoverable as="button" base={S("height:28px;padding:0 10px;border:1px solid #e2e8f0;background:#fff;border-radius:6px;cursor:pointer;font-family:inherit;font-size:.6875rem;color:#334155")} hover={S("border-color:#006ce0;color:#006ce0")} type="button" onClick={v.toastKb}>+ Add to KB</Hoverable><Hoverable as="button" base={S("height:28px;padding:0 10px;border:1px solid #e2e8f0;background:#fff;border-radius:6px;cursor:pointer;font-family:inherit;font-size:.6875rem;color:#334155")} hover={S("background:#f8fafc")} type="button" onClick={v.toastKb}>Train Intent</Hoverable></div></div></React.Fragment>))}</div></div></>) : null}{(v.selectedBot.noAnalytics) ? (<><div style={S("border-radius:16px;border:1px dashed #cbd5e1;background:#fff;padding:48px;text-align:center")}><p style={S("font-weight:600;margin:0")}>No analytics yet</p><p style={S("font-size:.875rem;color:#64748b;margin:6px 0 0")}>This chat bot has no conversations. Analytics will appear once it starts handling traffic.</p></div></>) : null}</>) : null}</div></>) : null}{(v.isConversations) ? (<><div style={S("width:100%;box-sizing:border-box;padding:0 24px;animation:lv-fade-in .3s ease-out")} id="panel-conversations" role="tabpanel" aria-labelledby="tab-conversations">{(v.noSelectedConv) ? (<><div style={S("display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px")}><div><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>Conversations</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>Recent chat bot conversations and outcomes</p></div><div style={S("display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap")}><div><label style={S("display:block;font-size:11px;font-weight:600;color:#64748b;margin:0 0 5px")}>From</label><Hoverable as="input" base={S("height:40px;border:1px solid #e2e8f0;border-radius:8px;padding:0 12px;font-family:inherit;font-size:.8125rem;color:#334155;outline:none")} focus={S("height:40px;border:1px solid #006ce0;border-radius:8px;padding:0 12px;font-family:inherit;font-size:.8125rem;color:#334155;outline:none;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} type="date" value={v.convStart} onChange={v.onConvStart} /></div><div><label style={S("display:block;font-size:11px;font-weight:600;color:#64748b;margin:0 0 5px")}>To</label><Hoverable as="input" base={S("height:40px;border:1px solid #e2e8f0;border-radius:8px;padding:0 12px;font-family:inherit;font-size:.8125rem;color:#334155;outline:none")} focus={S("height:40px;border:1px solid #006ce0;border-radius:8px;padding:0 12px;font-family:inherit;font-size:.8125rem;color:#334155;outline:none;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} type="date" value={v.convEnd} onChange={v.onConvEnd} /></div><div style={S("width:170px")}><NiceSelect value={v.convStatusFilter} options={v.convStatusOptions} onSelect={v.onConvStatusVal} placeholder="All Statuses" height={38} /></div><div style={S("width:180px")}><NiceSelect value={v.convSentimentFilter} options={v.convSentimentOptions} onSelect={v.onConvSentimentVal} placeholder="All Sentiments" height={38} /></div></div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);overflow:hidden")}><div style={S("display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e2e8f0")}><span style={S("font-size:.875rem;font-weight:500")}>{v.convCount} conversations</span><div style={S("display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end")}><div style={S("position:relative;width:260px")}><span style={S("position:absolute;left:11px;top:50%;transform:translateY(-50%);display:inline-flex;pointer-events:none;color:#94a3b8")}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span><input value={v.convSearch} onInput={v.onConvSearch} onChange={v.onConvSearch} placeholder="Search conversations" style={S(v.searchBoxStyle)} /></div></div></div><div style={S("overflow-x:auto")}><table style={S("width:100%;border-collapse:collapse;font-size:.875rem")}><thead><tr style={S("background:#f8fafc")}><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Customer</th><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Chat Bot</th><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Category</th><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Sentiment</th><th style={S("text-align:right;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Duration</th><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Status</th><th style={S("text-align:right;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Actions</th></tr></thead><tbody>{(v.conversations || []).map((c, $index) => (<React.Fragment key={$index}><tr style={S("border-top:1px solid #f1f5f9")}><td style={S("padding:12px 20px")}><div style={S("font-weight:500")}>{c.customerName}</div><div style={S("font-size:11px;color:#64748b")}>{c.customerEmail}</div></td><td style={S("padding:12px 20px;color:#475569")}>{c.chatBotName}</td><td style={S("padding:12px 20px;color:#475569")}>{c.category}</td><td style={S("padding:12px 20px")}><span style={S(c.sentChip)}>{c.sentiment}</span><span style={S(c.handoffChip)}>{c.handoffLabel}</span></td><td style={S("padding:12px 20px;text-align:right;color:#334155")}>{c.duration}</td><td style={S("padding:12px 20px")}><span style={S(c.statusChip)}>{c.statusLabel}</span></td><td style={S("padding:12px 20px;text-align:right")}><Hoverable as="button" base={S("height:32px;padding:0 14px;border:1px solid #cfe0fb;background:#eff4ff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:600;color:#006ce0;display:inline-flex;align-items:center;gap:6px;white-space:nowrap")} hover={S("height:32px;padding:0 14px;border:1px solid #006ce0;background:#dbeafe;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:600;color:#006ce0;display:inline-flex;align-items:center;gap:6px;white-space:nowrap")} type="button" onClick={c.onView}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#006ce0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>View</Hoverable><Hoverable as="button" type="button" title="Delete conversation" aria-label="Delete conversation" onClick={c.onDelete} base={S("height:32px;width:32px;margin-left:8px;padding:0;border:1px solid #e6e9ef;border-radius:8px;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle")} hover={S("background:#fef2f2;border-color:#fecaca")}>{c.trashIcon}</Hoverable></td></tr></React.Fragment>))}</tbody></table></div><div style={S("display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px")}><span style={S("font-size:.8125rem;color:#64748b")}>{v.convPager.label}</span><div style={S("display:flex;align-items:center;gap:8px")}><button type="button" style={S(v.convPager.prevStyle)} disabled={!v.convPager.canPrev} onClick={v.convPager.prev}>Previous</button><span style={S("font-size:.8125rem;color:#334155")}>Page {v.convPager.page} of {v.convPager.pages}</span><button type="button" style={S(v.convPager.nextStyle)} disabled={!v.convPager.canNext} onClick={v.convPager.next}>Next</button></div></div></div></>) : null}{(v.selectedConv) ? (<><div style={S("display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px")}><Hoverable as="button" base={S("height:34px;padding:0 14px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;color:#334155;display:inline-flex;align-items:center;gap:6px")} hover={S("background:#f8fafc")} type="button" onClick={v.backToConv}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>{v.convBackLabel}</Hoverable><span style={S(v.selectedConv.sentChip)}>{v.selectedConv.sentiment} overall</span></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px 24px;margin-bottom:24px")}><div style={S("display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px")}><div style={S("display:flex;align-items:center;gap:8px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Conversation Metrics</h3></div><div style={S("display:flex;gap:8px;align-items:center;flex-wrap:wrap")}><span style={S("font-size:11px;font-weight:600;color:#64748b")}>Date range</span><Hoverable as="input" base={S("height:34px;border:1px solid #e2e8f0;border-radius:8px;padding:0 10px;font-family:inherit;font-size:.8125rem;color:#334155;outline:none")} focus={S("height:34px;border:1px solid #006ce0;border-radius:8px;padding:0 10px;font-family:inherit;font-size:.8125rem;color:#334155;outline:none;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} type="date" value={v.convStart} onChange={v.onConvStart} /><span style={S("color:#94a3b8;font-size:.8125rem")}>–</span><Hoverable as="input" base={S("height:34px;border:1px solid #e2e8f0;border-radius:8px;padding:0 10px;font-family:inherit;font-size:.8125rem;color:#334155;outline:none")} focus={S("height:34px;border:1px solid #006ce0;border-radius:8px;padding:0 10px;font-family:inherit;font-size:.8125rem;color:#334155;outline:none;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} type="date" value={v.convEnd} onChange={v.onConvEnd} /></div></div><div className="mb-4col">{(v.selectedConv.stats || []).map((st, $index) => (<React.Fragment key={$index}><div style={S("border:1px solid #eef2f7;background:#f8fafc;border-radius:12px;padding:16px 18px")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>{st.label}</p><p style={S("font-size:1.5rem;font-weight:600;color:#0f172a;margin:6px 0 0;line-height:1")}>{st.value}</p></div></React.Fragment>))}</div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px;margin-bottom:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin:0 0 18px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#7c3aed;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Conversation Info</h3></div><div style={S("display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px")}><div style={S("background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:14px 16px")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0 0 8px")}>Customer</p><p style={S("font-weight:600;margin:0")}>{v.selectedConv.customerName}</p><p style={S("font-size:.8125rem;color:#64748b;margin:2px 0 0;overflow-wrap:anywhere")}>{v.selectedConv.customerEmail}</p></div><div style={S("background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:14px 16px")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0 0 8px")}>Chat Bot</p><p style={S("font-weight:600;margin:0")}>{v.selectedConv.chatBotName}</p></div><div style={S("background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:14px 16px")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0 0 8px")}>Category</p><span style={S("display:inline-block;padding:3px 12px;border-radius:9999px;font-size:.75rem;font-weight:500;background:#eff6ff;color:#1d4ed8")}>{v.selectedConv.category}</span></div><div style={S("background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:14px 16px")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0 0 8px")}>Resolution</p><span style={S(v.selectedConv.resChip)}>{v.selectedConv.resLabel}</span></div></div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin:0 0 16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#059669;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Transcript</h3></div><div style={S("display:flex;flex-direction:column;gap:12px;max-height:520px;overflow-y:auto")}>{(v.selectedConv.transcript || []).map((msg, $index) => (<React.Fragment key={$index}><div style={S(msg.row)}><div style={S(msg.bubble)}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:4px")}><span style={S("font-size:11px;font-weight:600")}>{msg.speaker}</span><span style={S("font-size:10px;opacity:.7")}>{msg.timestamp}</span></div><p style={S("font-size:.8125rem;margin:0;line-height:1.5")}>{msg.message}</p>{(msg.handoff) ? (<><div style={S("margin-top:10px;padding:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px")}><p style={S("font-size:11px;font-weight:600;color:#c2410c;margin:0")}>Human Handoff Triggered</p><p style={S("font-size:11px;color:#9a3412;margin:4px 0 0")}>{msg.handoff}</p></div></>) : null}</div></div></React.Fragment>))}</div></div></>) : null}</div></>) : null}{(v.isAnalytics) ? (<><div style={S("width:100%;box-sizing:border-box;padding:0 24px;animation:lv-fade-in .3s ease-out")} id="panel-analytics" role="tabpanel" aria-labelledby="tab-analytics"><div style={S("display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px")}><div><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>Analytics</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>Top queries, categories and usage patterns</p></div><div style={S("display:flex;gap:10px")}><div style={S("width:200px")}><NiceSelect value={v.analyticsBot} options={v.analyticsBotOptions} onSelect={v.onAnalyticsBotVal} placeholder="All ChatBots" height={34} /></div><div style={S("width:150px")}><NiceSelect value={v.analyticsRange} options={v.analyticsRangeOptions} onSelect={v.onAnalyticsRangeVal} placeholder="Last 30 days" height={34} /></div></div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px")}><div style={S("display:flex;align-items:center;gap:8px")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="12" y="6" width="3" height="12" /><rect x="17" y="13" width="3" height="5" /></svg><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Keyword Frequency Distribution</h3></div><div style={S("display:flex;gap:6px")}><button style={S(v.barBtn)} type="button" onClick={v.setBar}>Bar</button><button style={S(v.pieBtn)} type="button" onClick={v.setPie}>Pie</button></div></div>{(v.isBarView) ? (<>{v.chartKeywords}</>) : null}{(v.isPieView) ? (<><div style={S("grid-template-columns:320px 1fr")} className="mb-qual">
              {v.chartKeywordsPie}
              <div style={S("display:flex;flex-direction:column;gap:8px")}>{(v.keywordLegend || []).map((k, $index) => (<React.Fragment key={$index}><div style={S("display:flex;align-items:center;justify-content:space-between")}><div style={S("display:flex;align-items:center;gap:10px")}><span style={S(`width:12px;height:12px;border-radius:4px;background:${k.color}`)} /><span style={S("font-size:.8125rem;font-weight:500")}>{k.label}</span></div><span style={S("font-size:.8125rem;font-weight:600")}>{k.count}</span></div></React.Fragment>))}</div></div></>) : null}</div><div style={S("margin-top:24px;border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#7c3aed;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Query Categories</h3></div><div className="mb-3col">{(v.categories || []).map((cat, $index) => (<React.Fragment key={$index}><Hoverable as="div" base={S("border:1px solid #e2e8f0;border-radius:12px;padding:16px;cursor:pointer")} hover={S("background:#f8fafc")} onClick={cat.onClick}><div style={S("display:flex;align-items:center;justify-content:space-between;margin-bottom:10px")}><span style={S("font-size:.875rem;font-weight:500")}>{cat.name}</span><span style={S("font-size:.875rem;font-weight:600")}>{cat.count}</span></div><div style={S("width:100%;height:8px;background:#eef2f7;border-radius:9999px;overflow:hidden")}><div style={S(cat.bar)} /></div><div style={S("display:flex;justify-content:space-between;margin-top:6px")}><span style={S("font-size:11px;color:#64748b")}>{cat.pct}%</span><span style={S(cat.trendStyle)}>{cat.trendLabel}</span></div></Hoverable></React.Fragment>))}</div></div><div style={S("margin-top:24px;border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);overflow:hidden")}><div style={S("display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid #e2e8f0")}><span style={S("font-size:1rem;font-weight:600")}>Detailed Keyword Analysis</span><Hoverable as="button" base={S("height:32px;padding:0 12px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.75rem;color:#334155;display:inline-flex;align-items:center;gap:6px")} hover={S("background:#f8fafc")} type="button" onClick={v.toastExportKw}>{v.downloadIcon}Export Data</Hoverable></div><div style={S("overflow-x:auto")}><table style={S("width:100%;border-collapse:collapse;font-size:.875rem")}><thead><tr style={S("background:#f8fafc")}><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Keyword</th><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Category</th><th style={S("text-align:right;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Frequency</th><th style={S("text-align:right;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Trend</th><th style={S("text-align:right;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Satisfaction</th></tr></thead><tbody>{(v.keywordTable || []).map((k, $index) => (<React.Fragment key={$index}><tr style={S("border-top:1px solid #f1f5f9")}><td style={S("padding:10px 20px;font-weight:500")}>{k.keyword}</td><td style={S("padding:10px 20px")}><span style={S("display:inline-flex;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:#f1f5f9;color:#475569")}>{k.category}</span></td><td style={S("padding:10px 20px;text-align:right;color:#334155")}>{k.count}</td><td style={S("padding:10px 20px;text-align:right")}><span style={S(k.trendStyle)}>{k.trendLabel}</span></td><td style={S("padding:10px 20px;text-align:right")}>{k.satisfaction} ★</td></tr></React.Fragment>))}</tbody></table></div></div><div style={S("margin-top:24px;border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Trending Keywords Over Time</h3></div><div style={S("display:flex;flex-wrap:wrap;gap:18px;margin:2px 0 14px")}><span style={S("display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#475569")}><span style={S("width:14px;height:3px;border-radius:2px;background:#2563eb")} />Courses</span><span style={S("display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#475569")}><span style={S("width:14px;height:3px;border-radius:2px;background:#1fae5a")} />Enrollment</span><span style={S("display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#475569")}><span style={S("width:14px;height:3px;border-radius:2px;background:#f59e0b")} />Pricing</span></div><div>{v.chartTrends}</div></div><div style={S("margin-top:24px;border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#059669;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Weekly Usage Heatmap</h3></div>
          {v.heatmapEl}
        </div><div style={S("margin-top:24px")} className="mb-3col"><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 16px")}>Peak Usage Times</h3><div style={S("display:flex;flex-direction:column;gap:10px")}>{(v.peakInsights || []).map((p, $index) => (<React.Fragment key={$index}><div style={S("display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border-radius:10px")}><span style={S("font-size:.8125rem;color:#64748b")}>{p.label}</span><span style={S("font-size:.8125rem;font-weight:600")}>{p.value}</span></div></React.Fragment>))}</div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 16px")}>Daily Patterns</h3><div style={S("display:flex;flex-direction:column;gap:8px")}>{(v.dailyUsage || []).map((d, $index) => (<React.Fragment key={$index}><Hoverable as="div" base={S("display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:8px")} hover={S("background:#f8fafc")}><span style={S("font-size:.8125rem;font-weight:500")}>{d.day}</span><div style={S("text-align:right")}><p style={S("font-size:.875rem;font-weight:600;color:#006ce0;margin:0")}>{d.interactions}</p><p style={S("font-size:10px;color:#94a3b8;margin:0")}>Peak {d.peak}</p></div></Hoverable></React.Fragment>))}</div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 16px")}>Staffing Recommendations</h3><div style={S("display:flex;flex-direction:column;gap:12px")}>{(v.staffing || []).map((sf, $index) => (<React.Fragment key={$index}><div style={S(sf.wrap)}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:4px")}><span style={S(`width:10px;height:10px;border-radius:9999px;background:${sf.dot}`)} /><span style={S("font-size:.8125rem;font-weight:600")}>{sf.label}</span></div><p style={S("font-size:.8125rem;color:#475569;margin:0 0 0 18px")}>{sf.value}</p></div></React.Fragment>))}</div></div></div></div></>) : null}{(v.isKnowledge) ? (<><div style={S("width:100%;box-sizing:border-box;padding:0 24px;animation:lv-fade-in .3s ease-out")} id="panel-knowledge" role="tabpanel" aria-labelledby="tab-knowledge">{(v.kbMain) ? (<><div style={S("margin-bottom:16px")}><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>Knowledge Base</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>Usage patterns and content maintenance</p></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:40px;text-align:center;margin-bottom:24px")}><span style={S("display:inline-flex;height:56px;width:56px;border-radius:16px;background:#eff6ff;color:#006ce0;align-items:center;justify-content:center;margin-bottom:12px")}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg></span><h3 style={S("font-size:1rem;font-weight:600;margin:0")}>Manage Knowledge Base</h3><p style={S("font-size:.875rem;color:#64748b;margin:6px auto 20px;max-width:32rem")}>Update ChatBot responses, add new FAQs, and manage course content.</p><div style={S("display:flex;gap:12px;justify-content:center;flex-wrap:wrap")}><button style={S("height:40px;padding:0 18px;border-radius:10px;border:0;background:#006ce0;color:#fff;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:8px")} type="button" onClick={v.openAddContent}>{v.plusIcon}Add New Content</button><button style={S("height:40px;padding:0 18px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#334155;font-family:inherit;font-weight:500;cursor:pointer")} type="button" onClick={v.openViewEntries}>View All Entries</button></div></div><div style={S("margin-bottom:24px")} className="mb-4col">{(v.kbOverview || []).map((k, $index) => (<React.Fragment key={$index}><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px;text-align:center")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:0")}>{k.label}</p><p style={S("font-size:1.25rem;font-weight:600;margin:8px 0 0")}>{k.value}</p><p style={S("font-size:11px;color:#94a3b8;margin:2px 0 0")}>{k.note}</p></div></React.Fragment>))}</div><div className="mb-2col"><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#d97706;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Daily Usage Distribution</h3></div><div style={S("display:flex;flex-direction:column;gap:12px")}>{(v.dailyUsage || []).map((d, $index) => (<React.Fragment key={$index}><div><div style={S("display:flex;justify-content:space-between;margin-bottom:6px")}><span style={S("font-size:.8125rem;font-weight:500")}>{d.day}</span><span style={S("font-size:.8125rem;font-weight:600")}>{d.interactions}</span></div><div style={S("width:100%;height:8px;background:#eef2f7;border-radius:9999px;overflow:hidden")}><div style={S(d.bar)} /></div></div></React.Fragment>))}</div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:16px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Recommended Staffing</h3></div><div style={S("display:flex;flex-direction:column;gap:12px")}>{(v.staffing || []).map((sf, $index) => (<React.Fragment key={$index}><div style={S(sf.wrap)}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:4px")}><span style={S(`width:10px;height:10px;border-radius:9999px;background:${sf.dot}`)} /><span style={S("font-size:.8125rem;font-weight:600")}>{sf.label}</span></div><p style={S("font-size:.8125rem;color:#475569;margin:0 0 0 18px")}>{sf.value}</p></div></React.Fragment>))}</div></div></div></>) : null}{(v.kbAdd) ? (<><Hoverable as="button" base={S("margin-bottom:16px;height:34px;padding:0 14px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;color:#334155;display:inline-flex;align-items:center;gap:6px")} hover={S("background:#f8fafc")} type="button" onClick={v.kbBack}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>Back</Hoverable><div style={S("display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px")}><div><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>Add New Content</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>Create new knowledge base entries</p></div><div style={S("display:flex;gap:10px")}><button style={S("height:40px;padding:0 16px;border:1px solid #e2e8f0;background:#fff;color:#334155;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:8px")} type="button" onClick={v.kbPreview}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>Preview</button><button style={S(v.kbSaveStyle)} type="button" onClick={v.kbSave}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>Save Content</button></div></div><div className="mb-kbadd"><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px")}><div style={S("display:flex;align-items:center;gap:8px;margin-bottom:20px")}><span style={S("width:4px;height:18px;border-radius:9999px;background:#006ce0;flex:none")} /><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Content Details</h3></div><div style={S("display:flex;flex-direction:column;gap:18px")}><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Content Title <span style={S("color:#dc2626")}>*</span></label><Hoverable as="input" base={S(v.kbTitleStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.kbTitle} onChange={v.onKbTitle} placeholder="Enter a clear, descriptive title" />{(v.kTitle) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Title is required.</p></>) : null}</div><div style={S("gap:16px")} className="mb-2col"><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Category</label><NiceSelect value={v.kbCategory} options={v.contentCatOptions} onSelect={v.onKbCategoryVal} placeholder="Select a category" /></div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Priority Level</label><NiceSelect value={v.kbPriority} options={v.priorityOptions} onSelect={v.onKbPriorityVal} placeholder="Select priority" /></div></div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Content <span style={S("color:#dc2626")}>*</span></label><Hoverable as="textarea" base={S(v.kbContentStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.kbContent} onChange={v.onKbContent} rows="7" placeholder="Enter the detailed content that will help users..." />{(v.kContent) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Content is required.</p></>) : null}</div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Tags</label><Hoverable as="input" base={S("width:100%;box-sizing:border-box;height:40px;border:1px solid #e2e8f0;border-radius:8px;padding:0 12px;font-family:inherit;outline:none")} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.kbTags} onChange={v.onKbTags} placeholder="Enter tags separated by commas (e.g. enrollment, payment, course)" /><p style={S("font-size:11px;color:#94a3b8;margin:6px 0 0")}>Tags help users find this content more easily</p></div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Supporting Documents</label><div style={S("border:2px dashed #e2e8f0;border-radius:12px;padding:24px;text-align:center")}><span style={S("display:inline-flex;color:#94a3b8;margin-bottom:8px")}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg></span><p style={S("font-size:.875rem;font-weight:600;margin:0")}>Upload Documents</p><p style={S("font-size:11px;color:#94a3b8;margin:2px 0 12px")}>Choose files to attach to this entry</p><input style={S("display:none")} type="file" multiple={true} accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx" ref={v.setKbFile} onChange={v.onKbDocs} /><Hoverable as="button" base={S("height:34px;padding:0 14px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;color:#334155;display:inline-flex;align-items:center;gap:6px")} hover={S("border-color:#006ce0;color:#006ce0")} type="button" onClick={v.triggerKbUpload}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Choose Files</Hoverable></div><p style={S("font-size:11px;color:#94a3b8;margin:8px 0 0")}>Supported: PDF, DOC, DOCX, TXT, CSV, XLS, XLSX (max 10MB each)</p>{(v.kbDocsView) ? (<><div style={S("display:flex;flex-direction:column;gap:8px;margin-top:12px")}>{(v.kbDocsView || []).map((d, $index) => (<React.Fragment key={$index}><div style={S("display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px")}><div style={S("display:flex;align-items:center;gap:10px;min-width:0")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#006ce0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg><div style={S("min-width:0")}><p style={S("font-size:.8125rem;font-weight:500;margin:0")}>{d.name}</p><p style={S("font-size:11px;color:#94a3b8;margin:0")}>{d.size}</p></div></div><Hoverable as="button" base={S("height:26px;width:26px;border:0;background:transparent;color:#94a3b8;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#fee2e2;color:#dc2626")} type="button" onClick={d.onRemove}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></Hoverable></div></React.Fragment>))}</div></>) : null}</div></div></div><div style={S("display:flex;flex-direction:column;gap:24px")}><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 12px")}>Quick Tips</h3><p style={S("font-size:.8125rem;font-weight:600;margin:0 0 6px")}>Writing Guidelines</p><ul style={S("font-size:.8125rem;color:#64748b;margin:0 0 14px;padding-left:18px;line-height:1.7")}><li>Be clear and concise</li><li>Use simple language</li><li>Include step-by-step instructions</li><li>Add relevant examples</li></ul><p style={S("font-size:.8125rem;font-weight:600;margin:0 0 6px")}>Best Practices</p><ul style={S("font-size:.8125rem;color:#64748b;margin:0;padding-left:18px;line-height:1.7")}><li>Choose appropriate categories</li><li>Use descriptive titles</li><li>Add relevant tags</li><li>Set correct priority levels</li></ul></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 12px")}>Content Status</h3><div style={S("display:flex;flex-direction:column;gap:10px")}>{(v.kbStatus || []).map((st, $index) => (<React.Fragment key={$index}><div style={S("display:flex;align-items:center;justify-content:space-between")}><span style={S("font-size:.8125rem")}>{st.label}</span><span style={S(st.badge)}>{st.text}</span></div></React.Fragment>))}</div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px;text-align:center")}><span style={S("display:inline-flex;height:44px;width:44px;border-radius:12px;background:#eff6ff;color:#006ce0;align-items:center;justify-content:center;margin-bottom:8px")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></span><h4 style={S("font-size:.875rem;font-weight:600;margin:0")}>Ready to Publish?</h4><p style={S("font-size:.8125rem;color:#64748b;margin:6px 0 14px")}>Your content will be immediately available to users</p><button style={S(v.kbPublishStyle)} type="button" onClick={v.kbSave}>Publish Content</button></div></div></div></>) : null}{(v.kbEntries) ? (<><Hoverable as="button" base={S("margin-bottom:16px;height:34px;padding:0 14px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;color:#334155;display:inline-flex;align-items:center;gap:6px")} hover={S("background:#f8fafc")} type="button" onClick={v.kbBack}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>Back</Hoverable><div style={S("display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px")}><div><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>Knowledge Base Entries</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>Manage and view all knowledge base content</p></div><button style={S("height:36px;padding:0 16px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px")} type="button" onClick={v.openAddContent}>{v.plusIcon}Add New Entry</button></div><div style={S("margin-bottom:24px")} className="mb-4col">{(v.kbEntryStats || []).map((k, $index) => (<React.Fragment key={$index}><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:0")}>{k.label}</p><p style={S("font-size:1.5rem;font-weight:600;margin:6px 0 0;line-height:1")}>{k.value}</p></div></React.Fragment>))}</div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:16px 20px;margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center")}><div style={S("position:relative;flex:1;min-width:220px")}><span style={S("position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span><Hoverable as="input" base={S("width:100%;box-sizing:border-box;height:38px;border:1px solid #e2e8f0;border-radius:8px;padding:0 12px 0 36px;font-family:inherit;font-size:.8125rem;outline:none")} focus={S("border-color:#006ce0")} value={v.kbSearch} onChange={v.onKbSearch} placeholder="Search entries by title, content, or tags..." /></div><div style={S("width:190px")}><NiceSelect value={v.kbCat} options={v.catFilterOptions} onSelect={v.onKbCatVal} placeholder="All Categories" height={38} /></div><div style={S("width:168px")}><NiceSelect value={v.kbPrio} options={v.prioFilterOptions} onSelect={v.onKbPrioVal} placeholder="All Priorities" height={38} /></div></div>{(v.kbHasEntries) ? (<><div style={S("display:flex;flex-direction:column;gap:12px")}>{(v.kbEntriesView || []).map((e, $index) => (<React.Fragment key={$index}><Hoverable as="div" base={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px;transition:border-color .15s,box-shadow .15s")} hover={S("border-color:#cbd5e1;box-shadow:0 1px 3px rgba(15,23,42,.06)")}><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap")}><div style={S("min-width:0;flex:1")}><div style={S("display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px")}><h4 style={S("font-size:1rem;font-weight:600;margin:0")}>{e.title}</h4><span style={S(e.prioChip)}>{e.prioLabel}</span><span style={S(e.statusChip)}>{e.statusLabel}</span></div><p style={S("font-size:.875rem;color:#475569;margin:0 0 12px;line-height:1.5")}>{e.content}</p><div style={S("display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:11px;color:#64748b;margin-bottom:10px")}><span style={S("background:#f1f5f9;padding:2px 10px;border-radius:6px")}>{e.category}</span><span>{e.views} views</span><span>Updated {e.lastUpdated}</span><span>by {e.author}</span></div><div style={S("display:flex;flex-wrap:wrap;gap:6px")}>{(e.tags || []).map((t, $index) => (<React.Fragment key={$index}><span style={S("padding:2px 10px;border:1px solid #e2e8f0;border-radius:9999px;font-size:.6875rem;color:#475569")}>#{t}</span></React.Fragment>))}</div></div><div style={S("display:flex;align-items:center;gap:6px;flex-shrink:0")}><Hoverable as="button" base={S("height:32px;width:32px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;color:#475569;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#f8fafc")} type="button" onClick={e.onView} title="View"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg></Hoverable><Hoverable as="button" base={S("height:32px;width:32px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;color:#475569;display:inline-flex;align-items:center;justify-content:center")} hover={S("border-color:#006ce0;color:#006ce0")} type="button" onClick={e.onEdit} title="Edit"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></Hoverable><Hoverable as="button" base={S("height:32px;width:32px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;color:#475569;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#fee2e2;border-color:#fecaca;color:#dc2626")} type="button" onClick={e.onDelete} title="Delete"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></Hoverable></div></div></Hoverable></React.Fragment>))}</div><p style={S("text-align:center;font-size:.8125rem;color:#64748b;margin:16px 0 0")}>Showing {v.kbShown} of {v.kbTotal} entries</p></>) : null}{(v.kbNoEntries) ? (<><div style={S("border-radius:16px;border:1px dashed #cbd5e1;background:#fff;padding:48px;text-align:center")}><span style={S("display:inline-flex;color:#94a3b8;margin-bottom:8px")}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg></span><h3 style={S("font-size:1rem;font-weight:600;margin:0")}>No entries found</h3><p style={S("font-size:.875rem;color:#64748b;margin:6px 0 16px")}>Try adjusting your search criteria or filters.</p><button style={S("height:38px;padding:0 18px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px")} type="button" onClick={v.openAddContent}>{v.plusIcon}Add New Entry</button></div></>) : null}</>) : null}</div></>) : null}{(v.isUsers) ? (<><div style={S("width:100%;box-sizing:border-box;padding:0 24px;animation:lv-fade-in .3s ease-out")} id="panel-users" role="tabpanel" aria-labelledby="tab-users">{(v.noUserConv) ? (<><div style={S("display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px")}><div><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>User Management</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>Engagement and access across users</p></div><div style={S("display:flex;gap:10px")}><button style={S("height:36px;padding:0 16px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px")} type="button" onClick={v.addAdmin}>{v.userPlusIcon}Add New Admin</button><button style={S("height:36px;padding:0 16px;border:1px solid #e2e8f0;background:#fff;color:#334155;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px")} type="button" onClick={v.openRoleModal}>{v.shieldIcon}Manage Roles</button></div></div><div style={S("margin-bottom:24px")} className="mb-kpi5">{(v.userStats || []).map((u, $index) => (<React.Fragment key={$index}><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><div style={S("display:flex;align-items:center;justify-content:space-between")}><div><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>{u.label}</p><p style={S("font-size:1.5rem;font-weight:600;margin:6px 0 0;line-height:1")}>{u.value}</p></div><span style={S(`height:36px;width:36px;border-radius:10px;background:${u.chipBg};display:flex;align-items:center;justify-content:center`)}>{u.icon}</span></div></div></React.Fragment>))}</div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:24px;margin-bottom:24px")}><h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 16px")}>Filter &amp; Thresholds</h3><div className="mb-4col"><div><label style={S("font-size:.75rem;font-weight:600;color:#475569;display:block;margin-bottom:6px")}>User Filter</label><NiceSelect value={v.userFilter} options={v.userFilterOptions} onSelect={v.onUserFilterVal} placeholder="All Users" height={38} /></div><div><label style={S("font-size:.75rem;font-weight:600;color:#475569;display:block;margin-bottom:6px")}>Engagement Threshold (min)</label><Hoverable as="input" base={S("width:100%;box-sizing:border-box;height:38px;border:1px solid #e2e8f0;border-radius:8px;padding:0 12px;font-family:inherit;font-size:.8125rem;outline:none")} focus={S("border-color:#006ce0")} type="number" value={v.engThreshold} onChange={v.onEngThreshold} /></div><div><label style={S("font-size:.75rem;font-weight:600;color:#475569;display:block;margin-bottom:6px")}>Conversation Threshold</label><Hoverable as="input" base={S("width:100%;box-sizing:border-box;height:38px;border:1px solid #e2e8f0;border-radius:8px;padding:0 12px;font-family:inherit;font-size:.8125rem;outline:none")} focus={S("border-color:#006ce0")} type="number" value={v.convThreshold} onChange={v.onConvThreshold} /></div><div style={S("display:flex;align-items:flex-end")}><Hoverable as="button" base={S("width:100%;height:38px;border:1px solid #e2e8f0;background:#fff;color:#334155;border-radius:8px;font-family:inherit;font-size:.8125rem;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px")} hover={S("background:#f8fafc")} type="button" onClick={v.applyFilters}>Apply Filters</Hoverable></div></div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);overflow:hidden")}><div style={S("display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e2e8f0")}><span style={S("font-size:1rem;font-weight:600")}>User Details &amp; Engagement</span><span style={S("font-size:.8125rem;color:#64748b")}>Showing {v.shownUserCount} of {v.userCount} users</span></div><div style={S("padding:16px 20px;display:flex;flex-direction:column;gap:12px")}>{(v.users || []).map((user, $index) => (<React.Fragment key={$index}><Hoverable as="div" base={S("border:1px solid #e2e8f0;border-radius:14px;padding:18px;cursor:pointer;transition:border-color .18s,box-shadow .18s,transform .18s")} hover={S("border-color:#93c5fd;box-shadow:0 8px 20px -6px rgba(15,23,42,.12);transform:translateY(-2px)")} onClick={user.onView}><div style={S("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}><span style={S("height:44px;width:44px;border-radius:11px;background:#eff6ff;color:#006ce0;display:flex;align-items:center;justify-content:center;flex-shrink:0")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg></span><div style={S("min-width:0;flex:1")}><div style={S("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}><h4 style={S("font-size:1rem;font-weight:600;margin:0")}>{user.name}</h4><span style={S(user.roleChip)}>{user.role}</span></div><p style={S("font-size:.8125rem;color:#64748b;margin:2px 0 0;overflow-wrap:anywhere")}>{user.email}</p></div><div style={S("display:flex;align-items:center;gap:8px;flex-shrink:0")}><span style={S(user.engChip)}>{user.engLabel} Engagement</span><span style={S(user.statusChip)}><span style={S(user.statusDot)} />{user.status}</span></div></div><div style={S("margin-top:16px;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:16px 4px;gap:0")} className="mb-6col"><div style={S("padding:0 18px;min-width:0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Total Time</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0")}>{user.eng} min</p></div><div style={S("padding:0 18px;min-width:0;border-left:1px solid #e2e8f0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Conversations</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0")}>{user.conv}</p></div><div style={S("padding:0 18px;min-width:0;border-left:1px solid #e2e8f0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Avg. Session</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0")}>{user.session} min</p></div><div style={S("padding:0 18px;min-width:0;border-left:1px solid #e2e8f0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Satisfaction</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0")}>{user.sat} ★</p></div><div style={S("padding:0 18px;min-width:0;border-left:1px solid #e2e8f0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Department</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0;overflow-wrap:anywhere")}>{user.department}</p></div><div style={S("padding:0 18px;min-width:0;border-left:1px solid #e2e8f0")}><p style={S("font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0")}>Last Active</p><p style={S("font-size:.9rem;font-weight:600;color:#0f172a;margin:5px 0 0")}>{user.lastActive}</p></div></div><div style={S("display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:14px")}><div style={S("min-width:0")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0 0 6px")}>Favorite Topics</p><div style={S("display:flex;flex-wrap:wrap;gap:6px")}>{(user.topics || []).map((t, $index) => (<React.Fragment key={$index}><span style={S("padding:3px 10px;border:1px solid #e2e8f0;border-radius:9999px;font-size:.6875rem;color:#475569")}>{t}</span></React.Fragment>))}</div></div><span style={S("display:inline-flex;align-items:center;gap:6px;font-size:.8125rem;font-weight:600;color:#006ce0;white-space:nowrap")}>View conversations<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></span></div></Hoverable></React.Fragment>))}</div></div></>) : null}{(v.userConvView) ? (<><div style={S("display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px")}><Hoverable as="button" base={S("height:34px;padding:0 14px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;color:#334155;display:inline-flex;align-items:center;gap:6px")} hover={S("background:#f8fafc")} type="button" onClick={v.backFromUserConv}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>Back to Users</Hoverable><div><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>Conversations — {v.userConvView.name}</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>{v.userConvView.email}</p></div></div><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);overflow:hidden")}><div style={S("display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e2e8f0")}><span style={S("font-size:.875rem;font-weight:500")}>{v.userConvView.count} conversations</span></div><div style={S("overflow-x:auto")}><table style={S("width:100%;border-collapse:collapse;font-size:.875rem")}><thead><tr style={S("background:#f8fafc")}><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Chat Bot</th><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Category</th><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Sentiment</th><th style={S("text-align:right;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Duration</th><th style={S("text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Status</th><th style={S("text-align:right;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:12px 20px")}>Actions</th></tr></thead><tbody>{(v.userConvView.conversations || []).map((c, $index) => (<React.Fragment key={$index}><tr style={S("border-top:1px solid #f1f5f9")}><td style={S("padding:12px 20px;color:#475569")}>{c.chatBotName}</td><td style={S("padding:12px 20px;color:#475569")}>{c.category}</td><td style={S("padding:12px 20px")}><span style={S(c.sentChip)}>{c.sentiment}</span><span style={S(c.handoffChip)}>{c.handoffLabel}</span></td><td style={S("padding:12px 20px;text-align:right;color:#334155")}>{c.duration}</td><td style={S("padding:12px 20px")}><span style={S(c.statusChip)}>{c.statusLabel}</span></td><td style={S("padding:12px 20px;text-align:right")}><Hoverable as="button" base={S("height:32px;padding:0 14px;border:1px solid #cfe0fb;background:#eff4ff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:600;color:#006ce0;display:inline-flex;align-items:center;gap:6px;white-space:nowrap")} hover={S("height:32px;padding:0 14px;border:1px solid #006ce0;background:#dbeafe;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:600;color:#006ce0;display:inline-flex;align-items:center;gap:6px;white-space:nowrap")} type="button" onClick={c.onView}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#006ce0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>Open</Hoverable></td></tr></React.Fragment>))}</tbody></table></div></div></>) : null}</div></>) : null}</div>{(v.isAgents) ? (<><div style={S("width:100%;box-sizing:border-box;padding:0 24px;animation:lv-fade-in .3s ease-out")} id="panel-agents" role="tabpanel" aria-labelledby="tab-agents"><div style={S("display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px")}><div><h2 style={S("font-size:1.25rem;font-weight:600;margin:0")}>Agent Management</h2><p style={S("font-size:.875rem;color:#64748b;margin:2px 0 0")}>Create and manage the agents behind your chat bots</p></div><div style={S("display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end")}><div style={S("position:relative;width:240px")}><span style={S("position:absolute;left:11px;top:50%;transform:translateY(-50%);display:inline-flex;pointer-events:none;color:#94a3b8")}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span><input value={v.agentSearch} onInput={v.onAgentSearch} onChange={v.onAgentSearch} placeholder="Search agents" style={S(v.searchBoxStyle)} /></div><div style={S("width:160px")}><NiceSelect value={v.agentStatusFilter} options={v.agentStatusOptions} onSelect={v.onAgentStatusVal} placeholder="All Agents" height={38} /></div><Hoverable as="button" base={S("height:38px;padding:0 18px;border:0;background:linear-gradient(135deg,#0057b8,#006ce0);color:#fff;border-radius:8px;font-family:inherit;font-size:.875rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;box-shadow:0 3px 8px rgba(0,87,184,.35)")} hover={S("opacity:0.92")} type="button" onClick={v.openCreateAgent}>{v.createBotIcon}Create Agent</Hoverable></div></div>{(v.noAgents) ? (<><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:48px 24px;text-align:center")}><p style={S("font-size:.9375rem;font-weight:600;margin:0")}>No agents yet</p><p style={S("font-size:.8125rem;color:#64748b;margin:6px 0 0")}>Use Create Agent to add your first one.</p></div></>) : (<><div style={S("display:flex;flex-direction:column;gap:12px")}>{(v.agentList || []).map((a, $index) => (<React.Fragment key={$index}><div style={S("border-radius:16px;border:1px solid #e6e9ef;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.03),0 2px 6px rgba(16,24,40,.03);padding:20px")}><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap")}><div><p style={S("font-size:1rem;font-weight:600;margin:0")}>{a.name}</p><p style={S("font-size:.8125rem;color:#64748b;margin:4px 0 0")}>{a.description}</p></div><div style={S("display:flex;align-items:center;gap:10px")}><span style={S(a.statusChip)}>{a.statusLabel}</span><Hoverable as="button" type="button" title="Edit agent" aria-label="Edit agent" onClick={a.onEdit} base={S("display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid #e6e9ef;border-radius:8px;background:#fff;cursor:pointer")} hover={S("background:#eff6ff;border-color:#bfdbfe")}>{a.pencilIcon}</Hoverable><Hoverable as="button" type="button" title="Delete agent" aria-label="Delete agent" onClick={a.onDelete} base={S("display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid #e6e9ef;border-radius:8px;background:#fff;cursor:pointer")} hover={S("background:#fef2f2;border-color:#fecaca")}>{a.trashIcon}</Hoverable></div></div><div style={S("display:flex;gap:24px;flex-wrap:wrap;margin-top:14px")}><div><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Role</p><p style={S("font-size:.8125rem;margin:4px 0 0")}>{a.roleName}</p></div><div style={S("flex:1;min-width:220px")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Goal</p><p style={S("font-size:.8125rem;margin:4px 0 0")}>{a.goal}</p></div><div style={S("flex:1;min-width:220px")}><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Expected Output</p><p style={S("font-size:.8125rem;margin:4px 0 0")}>{a.expectedOutput}</p></div><div><p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Created</p><p style={S("font-size:.8125rem;margin:4px 0 0")}>{a.createdAt}</p></div></div></div></React.Fragment>))}</div><div style={S("display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px")}><span style={S("font-size:.8125rem;color:#64748b")}>{v.agentPager.label}</span><div style={S("display:flex;align-items:center;gap:8px")}><button type="button" style={S(v.agentPager.prevStyle)} disabled={!v.agentPager.canPrev} onClick={v.agentPager.prev}>Previous</button><span style={S("font-size:.8125rem;color:#334155")}>Page {v.agentPager.page} of {v.agentPager.pages}</span><button type="button" style={S(v.agentPager.nextStyle)} disabled={!v.agentPager.canNext} onClick={v.agentPager.next}>Next</button></div></div></>)}</div></>) : null}{(v.showCreateAgent) ? (<><div style={S("position:fixed;inset:0;z-index:150;background:rgba(15,23,42,0.4);display:flex;align-items:center;justify-content:center;padding:24px")} onClick={v.closeCreateAgent}><div style={S("background:#fff;border-radius:16px;max-width:52rem;width:100%;max-height:90vh;overflow-y:auto;padding:24px")} onClick={v.stop}><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;margin-bottom:20px;border-bottom:1px solid #f1f5f9")}><div><h3 style={S("font-size:1.125rem;font-weight:600;margin:0")}>{v.agentModalTitle}</h3><p style={S("font-size:.8125rem;color:#64748b;margin:4px 0 0")}>{v.agentModalSubtitle}</p></div><Hoverable as="button" base={S("height:32px;width:32px;flex-shrink:0;border:0;background:transparent;border-radius:8px;cursor:pointer;color:#64748b;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#f1f5f9;color:#0f172a")} type="button" onClick={v.closeCreateAgent} aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></Hoverable></div><div style={S("display:flex;flex-direction:column;gap:16px")}><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Agent Name <span style={S("color:#dc2626")}>*</span></label><Hoverable as="input" base={S(v.agentNameStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.agentName} onChange={v.onAgentName} placeholder="Enter agent name" />{(v.acName) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Agent name is required.</p></>) : null}</div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Description <span style={S("color:#dc2626")}>*</span></label><Hoverable as="textarea" base={S(v.agentDescStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.agentDesc} onChange={v.onAgentDesc} rows="3" placeholder="Describe the agent's purpose" />{(v.acDesc) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Description is required.</p></>) : null}</div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Role Name <span style={S("color:#dc2626")}>*</span></label><Hoverable as="input" base={S(v.agentRoleStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.agentRole} onChange={v.onAgentRole} maxLength={200} placeholder="e.g. Senior Support Analyst" />{(v.acRole) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Role name is required.</p></>) : (<><p style={S("font-size:11px;color:#64748b;margin:6px 0 0")}>The role the agent plays.</p></>)}</div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Goal <span style={S("color:#dc2626")}>*</span></label><Hoverable as="textarea" base={S(v.agentGoalStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.agentGoal} onChange={v.onAgentGoal} rows="2" maxLength={1000} placeholder="What the agent is trying to achieve" />{(v.acGoal) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Goal is required.</p></>) : null}</div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Backstory</label><Hoverable as="textarea" base={S(v.agentTextStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.agentBackstory} onChange={v.onAgentBackstory} rows="3" placeholder="The persona and background given to the agent" /></div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Instructions</label><Hoverable as="textarea" base={S(v.agentTextStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.agentInstructions} onChange={v.onAgentInstructions} rows="4" placeholder="Step by step instructions, one per line" /><p style={S("font-size:11px;color:#64748b;margin:6px 0 0")}>One instruction per line.</p></div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Expected Output</label><Hoverable as="textarea" base={S(v.agentTextStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.agentExpectedOutput} onChange={v.onAgentExpectedOutput} rows="2" maxLength={1000} placeholder="What a good answer from this agent looks like" /></div><div style={S("display:flex;align-items:flex-start;gap:12px")}><button style={S(v.activeTrackStyle)} type="button" role="switch" aria-checked={v.agentIsActive} aria-label="Is Active" onClick={v.toggleAgentActive}><span style={S(v.activeKnobStyle)} /></button><div><p style={S("font-size:.8125rem;font-weight:500;margin:1px 0 0")}>Is Active: {v.activeLabel}</p><p style={S("font-size:11px;color:#64748b;margin:6px 0 0")}>{v.activeHint}</p></div></div></div><div style={S("display:flex;justify-content:flex-end;gap:10px;margin-top:24px")}><button style={S("height:40px;padding:0 16px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;font-family:inherit;cursor:pointer")} type="button" onClick={v.closeCreateAgent}>Cancel</button><button style={S("height:40px;padding:0 20px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px")} type="button" onClick={v.submitCreateAgent}>{v.isEditAgent ? null : v.plusIcon}{v.agentSubmitLabel}</button></div></div></div></>) : null}{(v.showCreate) ? (<><div style={S("position:fixed;inset:0;z-index:150;background:rgba(15,23,42,0.4);display:flex;align-items:center;justify-content:center;padding:24px")} onClick={v.closeCreate}><div style={S("background:#fff;border-radius:16px;max-width:52rem;width:100%;max-height:90vh;overflow-y:auto;padding:24px")} onClick={v.stop}><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;margin-bottom:20px;border-bottom:1px solid #f1f5f9")}><div><h3 style={S("font-size:1.125rem;font-weight:600;margin:0")}>{v.botModalTitle}</h3><p style={S("font-size:.8125rem;color:#64748b;margin:4px 0 0")}>{v.botModalSubtitle}</p></div><Hoverable as="button" base={S("height:32px;width:32px;flex-shrink:0;border:0;background:transparent;border-radius:8px;cursor:pointer;color:#64748b;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#f1f5f9;color:#0f172a")} type="button" onClick={v.closeCreate} aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></Hoverable></div><div style={S("display:flex;flex-direction:column;gap:16px")}><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Chat Bot Name <span style={S("color:#dc2626")}>*</span></label><Hoverable as="input" base={S(v.nameStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.newName} onChange={v.onNewName} placeholder="Enter chat bot name" />{(v.cName) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Chat bot name is required.</p></>) : null}</div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Description <span style={S("color:#dc2626")}>*</span></label><Hoverable as="textarea" base={S(v.descStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.newDesc} onChange={v.onNewDesc} rows="3" placeholder="Describe the chat bot's purpose" />{(v.cDesc) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Description is required.</p></>) : null}</div><div style={S("gap:16px")} className="mb-2col"><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Knowledge Base <span style={S("color:#dc2626")}>*</span></label><NiceSelect value={v.newKb} options={v.kbSelectOptions} onSelect={v.onNewKbVal} placeholder="Select Knowledge Base" invalid={v.cKb} />{(v.cKb) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Please select a knowledge base.</p></>) : null}</div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Guidelines</label><NiceSelect value={v.newGuideline} options={v.guidelineOptions} onSelect={v.onNewGuidelineVal} placeholder="Select Guideline" /></div></div><div style={S("gap:16px")} className="mb-2col"><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Assign Agents/Teams <span style={S("color:#dc2626")}>*</span></label><NiceSelect value={v.newAgents} options={v.agentOptions} onSelect={v.onNewAgentsVal} placeholder="Select Agent Team" invalid={v.cAgents} />{(v.cAgents) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Please assign an agent team.</p></>) : null}</div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Initial Status</label><NiceSelect value={v.newStatus} options={v.statusInitOptions} onSelect={v.onNewStatusVal} placeholder="Select status" /></div></div><div style={S("gap:16px")} className="mb-2col"><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Response Language</label><NiceSelect value={v.newLang} options={v.langOptions} onSelect={v.onNewLangVal} placeholder="Select language" /></div></div></div><div style={S("display:flex;justify-content:flex-end;gap:10px;margin-top:24px")}><button style={S("height:40px;padding:0 16px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;font-family:inherit;cursor:pointer")} type="button" onClick={v.closeCreate}>Cancel</button><button style={S("height:40px;padding:0 20px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px")} type="button" onClick={v.submitCreate}>{v.isEditBot ? null : v.plusIcon}{v.botSubmitLabel}</button></div></div></div></>) : null}{(v.showEmbed) ? (<><div style={S("position:fixed;inset:0;z-index:150;background:rgba(15,23,42,0.4);display:flex;align-items:center;justify-content:center;padding:24px")} onClick={v.closeEmbed}><div style={S("background:#fff;border-radius:16px;max-width:40rem;width:100%;padding:24px")} onClick={v.stop}><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid #f1f5f9")}><div><h3 style={S("font-size:1.125rem;font-weight:600;margin:0;display:flex;align-items:center;gap:8px")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#006ce0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Embed Code</h3><p style={S("font-size:.8125rem;color:#64748b;margin:4px 0 0")}>Copy this snippet and paste it into your site to embed the chat bot.</p></div><Hoverable as="button" base={S("height:32px;width:32px;flex-shrink:0;border:0;background:transparent;border-radius:8px;cursor:pointer;color:#64748b;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#f1f5f9;color:#0f172a")} type="button" onClick={v.closeEmbed} aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></Hoverable></div><textarea style={S("width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;line-height:1.5;color:#334155;background:#f8fafc;resize:none;outline:none")} readOnly={true} value={v.embedCode} rows="9" /><div style={S("display:flex;justify-content:flex-end;gap:10px;margin-top:20px")}><button style={S("height:40px;padding:0 16px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;font-family:inherit;cursor:pointer")} type="button" onClick={v.closeEmbed}>Cancel</button><button style={S("height:40px;padding:0 20px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:8px")} type="button" onClick={v.copyEmbed}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Copy Code</button></div></div></div></>) : null}{(v.userModal) ? (<><div style={S("position:fixed;inset:0;z-index:150;background:rgba(15,23,42,0.4);display:flex;align-items:center;justify-content:center;padding:24px")} onClick={v.closeUserModal}><div style={S("background:#fff;border-radius:16px;max-width:52rem;width:100%;max-height:90vh;overflow-y:auto;padding:24px")} onClick={v.stop}><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid #f1f5f9")}><div><h3 style={S("font-size:1.125rem;font-weight:600;margin:0")}>User Details</h3><p style={S("font-size:.8125rem;color:#64748b;margin:4px 0 0")}>{v.userModal.name}</p></div><Hoverable as="button" base={S("height:32px;width:32px;flex-shrink:0;border:0;background:transparent;border-radius:8px;cursor:pointer;color:#64748b;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#f1f5f9;color:#0f172a")} type="button" onClick={v.closeUserModal} aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></Hoverable></div><div style={S("display:flex;align-items:flex-start;gap:16px;padding:16px;background:#f8fafc;border-radius:12px;margin-bottom:20px")}><span style={S("height:48px;width:48px;border-radius:12px;background:#eff6ff;color:#006ce0;display:flex;align-items:center;justify-content:center;flex-shrink:0")}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg></span><div style={S("flex:1")}><h4 style={S("font-size:1.125rem;font-weight:600;margin:0")}>{v.userModal.name}</h4><p style={S("font-size:.875rem;color:#64748b;margin:0")}>{v.userModal.email}</p><div style={S("display:flex;gap:8px;margin-top:8px;flex-wrap:wrap")}><span style={S(v.userModal.roleChip)}>{v.userModal.role}</span><span style={S("padding:2px 10px;border:1px solid #e2e8f0;border-radius:9999px;font-size:.6875rem;color:#475569")}>{v.userModal.department}</span><span style={S(v.userModal.statusChip)}><span style={S(v.userModal.statusDot)} />{v.userModal.status}</span></div></div></div><div style={S("margin-bottom:20px")} className="mb-4col"><div style={S("border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center")}><p style={S("font-size:1.375rem;font-weight:600;margin:0")}>{v.userModal.eng}</p><p style={S("font-size:11px;color:#64748b;margin:4px 0 0")}>Total Minutes</p></div><div style={S("border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center")}><p style={S("font-size:1.375rem;font-weight:600;margin:0")}>{v.userModal.conv}</p><p style={S("font-size:11px;color:#64748b;margin:4px 0 0")}>Conversations</p></div><div style={S("border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center")}><p style={S("font-size:1.375rem;font-weight:600;margin:0")}>{v.userModal.session}</p><p style={S("font-size:11px;color:#64748b;margin:4px 0 0")}>Avg Session (min)</p></div><div style={S("border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center")}><p style={S("font-size:1.375rem;font-weight:600;margin:0")}>{v.userModal.sat}</p><p style={S("font-size:11px;color:#64748b;margin:4px 0 0")}>Satisfaction</p></div></div><div className="mb-2col"><div style={S("border:1px solid #e2e8f0;border-radius:12px;padding:16px")}><h4 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 12px")}>Permissions</h4><div style={S("display:flex;flex-direction:column;gap:8px")}>{(v.userModal.permissions || []).map((p, $index) => (<React.Fragment key={$index}><div style={S("display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8fafc;border-radius:8px")}><span style={S("font-size:.8125rem;text-transform:capitalize")}>{p}</span><Hoverable as="button" base={S("height:26px;padding:0 10px;border:1px solid #e2e8f0;background:#fff;border-radius:6px;cursor:pointer;font-family:inherit;font-size:.6875rem;color:#334155")} hover={S("border-color:#dc2626;color:#dc2626")} type="button" onClick={v.toastUser}>Remove</Hoverable></div></React.Fragment>))}</div></div><div style={S("border:1px solid #e2e8f0;border-radius:12px;padding:16px")}><h4 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 12px")}>Account Information</h4><div style={S("display:flex;flex-direction:column;gap:12px")}><div><p style={S("font-size:11px;color:#64748b;margin:0")}>Joined Date</p><p style={S("font-size:.8125rem;font-weight:600;margin:2px 0 0")}>{v.userModal.joined}</p></div><div><p style={S("font-size:11px;color:#64748b;margin:0")}>Last Active</p><p style={S("font-size:.8125rem;font-weight:600;margin:2px 0 0")}>{v.userModal.lastActive}</p></div><div><p style={S("font-size:11px;color:#64748b;margin:0 0 6px")}>Favorite Topics</p><div style={S("display:flex;flex-wrap:wrap;gap:6px")}>{(v.userModal.topics || []).map((t, $index) => (<React.Fragment key={$index}><span style={S("padding:2px 10px;border:1px solid #e2e8f0;border-radius:9999px;font-size:.6875rem;color:#475569")}>{t}</span></React.Fragment>))}</div></div></div></div></div><div style={S("display:flex;justify-content:flex-end;gap:10px;margin-top:24px")}><button style={S("height:40px;padding:0 16px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;font-family:inherit;cursor:pointer")} type="button" onClick={v.closeUserModal}>Close</button><button style={S("height:40px;padding:0 20px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px")} type="button" onClick={v.openRoleFromUser}>{v.shieldIcon}Manage Roles</button></div></div></div></>) : null}{(v.showRole) ? (<><div style={S("position:fixed;inset:0;z-index:160;background:rgba(15,23,42,0.4);display:flex;align-items:center;justify-content:center;padding:24px")} onClick={v.closeRole}><div style={S("background:#fff;border-radius:16px;max-width:34rem;width:100%;padding:24px")} onClick={v.stop}><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid #f1f5f9")}><div><h3 style={S("font-size:1.125rem;font-weight:600;margin:0")}>Manage User Roles</h3><p style={S("font-size:.8125rem;color:#64748b;margin:4px 0 0")}>Set the role and permissions {v.roleName}</p></div><Hoverable as="button" base={S("height:32px;width:32px;flex-shrink:0;border:0;background:transparent;border-radius:8px;cursor:pointer;color:#64748b;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#f1f5f9;color:#0f172a")} type="button" onClick={v.closeRole} aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></Hoverable></div><div style={S("margin-bottom:16px")}><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Current Role</label><NiceSelect value={v.roleValue} options={v.roleOptions} onSelect={v.onRoleValueVal} placeholder="Select role" /></div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:8px")}>Available Permissions</label><div style={S("display:flex;flex-direction:column;gap:8px")}>{(v.rolePermissions || []).map((p, $index) => (<React.Fragment key={$index}><div style={S("display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px")}><span style={S("font-size:.8125rem;text-transform:capitalize")}>{p.name}</span><button style={S(p.btn)} type="button" onClick={p.onToggle}>{p.action}</button></div></React.Fragment>))}</div><div style={S("display:flex;justify-content:flex-end;gap:10px;margin-top:24px")}><button style={S("height:40px;padding:0 16px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;font-family:inherit;cursor:pointer")} type="button" onClick={v.closeRole}>Cancel</button><button style={S("height:40px;padding:0 20px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer")} type="button" onClick={v.saveRole}>Save Changes</button></div></div></div></>) : null}{(v.showAddAdmin) ? (<><div style={S("position:fixed;inset:0;z-index:160;background:rgba(15,23,42,0.4);display:flex;align-items:center;justify-content:center;padding:24px")} onClick={v.closeAddAdmin}><div style={S("background:#fff;border-radius:16px;max-width:34rem;width:100%;padding:24px")} onClick={v.stop}><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;margin-bottom:20px;border-bottom:1px solid #f1f5f9")}><div><h3 style={S("font-size:1.125rem;font-weight:600;margin:0")}>Add New Admin</h3><p style={S("font-size:.8125rem;color:#64748b;margin:4px 0 0")}>Grant a team member access to the admin panel</p></div><Hoverable as="button" base={S("height:32px;width:32px;flex-shrink:0;border:0;background:transparent;border-radius:8px;cursor:pointer;color:#64748b;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#f1f5f9;color:#0f172a")} type="button" onClick={v.closeAddAdmin} aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></Hoverable></div><div style={S("display:flex;flex-direction:column;gap:16px")}><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Full Name <span style={S("color:#dc2626")}>*</span></label><Hoverable as="input" base={S(v.aNameStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.aName} onChange={v.onAName} placeholder="e.g. Jordan Rivera" />{(v.aNameBad) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>Name is required.</p></>) : null}</div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Email Address <span style={S("color:#dc2626")}>*</span></label><Hoverable as="input" base={S(v.aEmailStyle)} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.aEmail} onChange={v.onAEmail} placeholder="name@company.com" />{(v.aEmailBad) ? (<><p style={S("font-size:11px;color:#dc2626;margin:6px 0 0")}>A valid email address is required.</p></>) : null}</div><div style={S("gap:16px")} className="mb-2col"><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Role</label><NiceSelect value={v.aRole} options={v.adminRoleOptions} onSelect={v.onARoleVal} placeholder="Select role" /></div><div><label style={S("font-size:.8125rem;font-weight:500;display:block;margin-bottom:6px")}>Department</label><Hoverable as="input" base={S("width:100%;box-sizing:border-box;height:40px;border:1px solid #e2e8f0;border-radius:8px;padding:0 12px;font-family:inherit;outline:none")} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.aDept} onChange={v.onADept} placeholder="e.g. Customer Success" /></div></div></div><div style={S("display:flex;justify-content:flex-end;gap:10px;margin-top:24px")}><button style={S("height:40px;padding:0 16px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;font-family:inherit;cursor:pointer")} type="button" onClick={v.closeAddAdmin}>Cancel</button><button style={S("height:40px;padding:0 20px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px")} type="button" onClick={v.submitAddAdmin}>{v.userPlusIcon}Add Admin</button></div></div></div></>) : null}{(v.tagModal) ? (<><div style={S("position:fixed;inset:0;z-index:170;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:24px")} onClick={v.tagModal.close}><div style={S("background:#fff;border-radius:16px;max-width:46rem;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px -12px rgba(15,23,42,0.35)")} onClick={v.stop}><div style={S("display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px;border-bottom:1px solid #f1f5f9")}><div><h3 style={S("font-size:1.125rem;font-weight:600;margin:0")}>Tag Users</h3><p style={S("font-size:.8125rem;color:#64748b;margin:4px 0 0")}>Assign users to <strong style={S("color:#334155;font-weight:600")}>{v.tagModal.botName}</strong></p></div><Hoverable as="button" base={S("height:32px;width:32px;flex-shrink:0;border:0;background:transparent;border-radius:8px;cursor:pointer;color:#64748b;display:inline-flex;align-items:center;justify-content:center")} hover={S("background:#f1f5f9;color:#0f172a")} type="button" onClick={v.tagModal.close} aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></Hoverable></div><div style={S("padding:18px 24px 12px;display:flex;flex-direction:column;gap:14px")}><div style={S("position:relative")}><span style={S("position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#94a3b8;display:inline-flex")}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span><Hoverable as="input" base={S("width:100%;box-sizing:border-box;height:42px;border:1px solid #e2e8f0;border-radius:10px;padding:0 12px 0 38px;font-family:inherit;font-size:.875rem;outline:none")} focus={S("border-color:#006ce0;box-shadow:0 0 0 3px rgba(0,108,224,0.15)")} value={v.tagModal.search} onChange={v.tagModal.onSearch} placeholder="Search by name, email or department" /></div><div style={S("display:flex;align-items:center;justify-content:space-between")}><Hoverable as="button" base={S("display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:600;color:#334155")} hover={S("border-color:#cbd5e1;background:#f8fafc")} type="button" onClick={v.tagModal.onSelectAll}>{v.tagModal.selectAllLabel}</Hoverable><p style={S("font-size:.8125rem;color:#64748b;margin:0")}><strong style={S("color:#006ce0;font-weight:600")}>{v.tagModal.selectedCount}</strong> selected · {v.tagModal.shownCount} shown</p></div></div><div style={S("flex:1;overflow-y:auto;padding:0 24px 8px;display:flex;flex-direction:column;gap:8px;min-height:180px")}>{(v.tagModal.users || []).map((u, $index) => (<React.Fragment key={$index}><div style={S(u.rowStyle)} onClick={u.onToggle}><span style={S(u.box)}>{u.check}</span><span style={S("width:38px;height:38px;flex:none;border-radius:9999px;background:#eff6ff;color:#006ce0;display:flex;align-items:center;justify-content:center;font-size:.8125rem;font-weight:600")}>{u.initials}</span><div style={S("min-width:0;flex:1")}><div style={S("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}><span style={S("font-size:.875rem;font-weight:600;color:#0f172a")}>{u.name}</span><span style={S(u.roleChip)}>{u.role}</span></div><p style={S("font-size:.75rem;color:#64748b;margin:2px 0 0;overflow-wrap:anywhere")}>{u.email} · {u.dept}</p></div></div></React.Fragment>))}</div><div style={S("display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 24px;border-top:1px solid #f1f5f9")}><Hoverable as="button" base={S("height:40px;padding:0 14px;border:0;background:transparent;border-radius:8px;font-family:inherit;font-size:.8125rem;color:#64748b;cursor:pointer")} hover={S("color:#0f172a")} type="button" onClick={v.tagModal.clear}>Clear selection</Hoverable><div style={S("display:flex;gap:10px")}><button style={S("height:40px;padding:0 16px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;font-family:inherit;cursor:pointer")} type="button" onClick={v.tagModal.close}>Cancel</button><button style={S("height:40px;padding:0 20px;border:0;background:#006ce0;color:#fff;border-radius:8px;font-family:inherit;font-weight:600;cursor:pointer")} type="button" onClick={v.tagModal.save}>Save Tags</button></div></div></div></div></>) : null}{(v.toast) ? (<><div style={S("position:fixed;bottom:24px;right:24px;z-index:200;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 32px -8px rgba(0,0,0,0.2);padding:14px 16px;max-width:320px")}><p style={S("font-weight:600;font-size:.875rem;margin:0")}>{v.toast.title}</p><p style={S("font-size:.8125rem;color:#64748b;margin:4px 0 0")}>{v.toast.desc}</p></div></>) : null}</div>
      </AppShell>
    );
  }
}

export default ManageBots;
