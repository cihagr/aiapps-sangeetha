import React from "react";
import AppShell from "./AppShell";
import { IconArrowLeft } from "./icons";
import { css as S } from "./css";
import { API_ENDPOINTS } from "../../config";

const GET_BOT_DATA_URL = API_ENDPOINTS.GET_BOT_DATA;

// My Chat Bots — the bots created in ManageBots, read back from get-bot-data.
// Each card opens the live Bot App for that bot.
class BotList extends React.Component {
  state = { bots: null, query: "" };

  componentDidMount() {
    this.loadBots();
  }

  async loadBots() {
    const session = (key) => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
    let userInfo = {};
    try { userInfo = JSON.parse(session("userInfo") || "{}") || {}; } catch { userInfo = {}; }
    const custcode = session("custcode") || userInfo.customerCode || userInfo.custCode || "";
    const orgcode = session("orgcode") || userInfo.orgCode || userInfo.organizationcode || "";
    const pick = (row, ...keys) => {
      for (const key of keys) if (row && row[key] !== undefined && row[key] !== null) return row[key];
      return undefined;
    };
    try {
      const res = await fetch(GET_BOT_DATA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custcode, orgcode, botid: 0, pageno: 1, pagesize: 200 }),
      });
      const json = await res.json().catch(() => null);
      const rows = res.ok && json && Array.isArray(json.results) ? json.results : [];
      this.setState({
        bots: rows.map((b) => ({
          id: pick(b, "bot_id", "botid", "id"),
          title: pick(b, "bot_name", "botname", "name") || "",
          description: pick(b, "description") || "",
          knowledgeBase: pick(b, "knowledge_base_name", "knowledgebasename", "kbname") || "",
          status: String(pick(b, "bot_status", "botstatus", "status") || "DRAFT"),
        })),
      });
    } catch (e) {
      console.warn("Could not load chat bots", e);
      this.setState({ bots: [] });
    }
  }

  renderVals() {
    const bots = this.state.bots || [];
    const n = bots.length;
    const q = this.state.query.trim().toLowerCase();
    const filtered = bots.filter((b) => !q || (b.title || "").toLowerCase().includes(q) || (b.description || "").toLowerCase().includes(q) || (b.knowledgeBase || "").toLowerCase().includes(q));
    const fn = filtered.length;
    return {
      hasBots: fn > 0, noBots: this.state.bots !== null && n === 0, noResults: n > 0 && fn === 0,
      query: this.state.query, onSearch: (e) => this.setState({ query: e.target.value }),
      countLabel: q ? (fn + " of " + n + (n === 1 ? " bot" : " bots")) : (n === 1 ? "1 bot" : n + " bots"),
      bots: filtered.slice().reverse().map((b) => {
        const isActive = /active|publish/i.test(b.status || "");
        return {
          id: b.id, title: b.title, href: "#/botapp?bot=" + b.id,
          description: b.description || "An AI assistant that answers questions using your configured knowledge base.",
          knowledgeBase: b.knowledgeBase || "General",
          statusLabel: isActive ? "Published" : "Draft",
          statusChip: `display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:${isActive ? "#dcfce7" : "#f1f5f9"};color:${isActive ? "#166534" : "#475569"}`,
          statusDot: `width:6px;height:6px;border-radius:50%;background:${isActive ? "#22c55e" : "#94a3b8"}`,
        };
      }),
    };
  }

  render() {
    const v = this.renderVals();
    return (
      <AppShell bare active="managebots">
        <main style={S("flex:1;padding:24px;width:100%;box-sizing:border-box;font-family:'Open Sans',sans-serif;color:#0f172a;animation:bl-fade .3s ease-out")}>
          <div style={S("padding-top:8px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap")}>
            <div style={S("display:flex;align-items:center;gap:14px;min-width:0")}>
              <a href="/dashboard" style={S("height:38px;width:38px;flex:none;border:1px solid #e2e8f0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:#475569;text-decoration:none")}>
                <IconArrowLeft size={18} />
              </a>
              <div style={S("min-width:0")}>
                <h1 style={S("font-size:1.5rem;font-weight:500;margin:0")}>My Chat Bots</h1>
                <p style={S("font-size:.8125rem;color:#64748b;margin:2px 0 0")}>{v.countLabel}</p>
              </div>
            </div>
            <div style={S("position:relative;min-width:260px;flex:0 1 340px")}>
              <span style={S("position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#94a3b8;display:inline-flex")}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </span>
              <input value={v.query} onInput={v.onSearch} onChange={v.onSearch} placeholder="Search bots by name, description or knowledge base" style={S("width:100%;box-sizing:border-box;height:42px;border:1px solid #e2e8f0;border-radius:10px;padding:0 12px 0 38px;font-family:inherit;font-size:.875rem;outline:none;background:#fff")} />
            </div>
          </div>

          {v.hasBots && (
            <div className="bl-grid">
              {v.bots.map((bot, i) => (
                <a key={i} href={bot.href} style={S("display:flex;flex-direction:column;text-decoration:none;color:inherit;background:#fff;border:1px solid #e6e9ef;border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.03);overflow:hidden;transition:border-color .18s,box-shadow .18s,transform .18s")}>
                  <div style={S("height:96px;background:#eff6ff;display:flex;align-items:center;justify-content:center;position:relative")}>
                    <span style={S("height:52px;width:52px;border-radius:14px;background:#fff;color:#006ce0;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(16,24,40,.1)")}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>
                    </span>
                    <span style={S("position:absolute;top:12px;right:12px;" + bot.statusChip)}><span style={S(bot.statusDot)} />{bot.statusLabel}</span>
                  </div>
                  <div style={S("padding:18px;display:flex;flex-direction:column;gap:8px;flex:1")}>
                    <h3 style={S("font-size:1.05rem;font-weight:600;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{bot.title}</h3>
                    <p style={S("font-size:.8125rem;color:#64748b;line-height:1.5;margin:0;flex:1")}>{bot.description}</p>
                    <div style={S("display:flex;align-items:center;gap:6px;font-size:.75rem;color:#475569;margin-top:2px")}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                      {bot.knowledgeBase}
                    </div>
                    <div style={S("display:flex;align-items:center;justify-content:flex-end;gap:6px;font-size:.8125rem;font-weight:600;color:#006ce0;margin-top:6px;padding-top:12px;border-top:1px solid #f1f5f9")}>Open Bot
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {v.noBots && (
            <div style={S("border:1px dashed #cbd5e1;border-radius:16px;padding:56px 24px;text-align:center;background:#fff")}>
              <span style={S("height:56px;width:56px;border-radius:14px;background:#eff6ff;color:#006ce0;display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px")}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>
              </span>
              <h3 style={S("font-size:1.05rem;font-weight:600;margin:0 0 6px")}>No chat bots yet</h3>
              <p style={S("font-size:.875rem;color:#64748b;margin:0 0 18px")}>Create a chat bot in Manage Bots and it will appear here.</p>
              <a href="#/managebots" style={S("display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 18px;border-radius:9px;background:#006ce0;color:#fff;text-decoration:none;font-size:.875rem;font-weight:600")}>Go to Manage Bots</a>
            </div>
          )}

          {v.noResults && (
            <div style={S("border:1px dashed #cbd5e1;border-radius:16px;padding:48px 24px;text-align:center;background:#fff")}>
              <h3 style={S("font-size:1rem;font-weight:600;margin:0 0 6px")}>No bots match "{v.query}"</h3>
              <p style={S("font-size:.875rem;color:#64748b;margin:0")}>Try a different name, description, or knowledge base.</p>
            </div>
          )}
        </main>
      </AppShell>
    );
  }
}

export default BotList;
