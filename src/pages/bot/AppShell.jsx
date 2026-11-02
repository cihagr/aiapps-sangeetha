import React, { useState, useEffect } from "react";
import config from "../../config";
import { css as S } from "./css";
import {
  IconSearch, IconSparkle, IconUser, IconSettings, IconLogout,
  IconDashboard, IconLibrary, IconBook, IconFile, IconMessageSquare,
  IconChart, IconUsers, IconBot,
} from "./icons";

const LOGO_SRC =
  (typeof window !== "undefined" && window.__LOGO__) || "/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png";

const NAV = {
  app: [
    { key: "dashboard", title: "Dashboard", href: "#/", Icon: IconDashboard },
    { key: "knowledge-base", title: "Manage Knowledge Base", href: "#", Icon: IconLibrary },
    { key: "book-details", title: "Manage Book Details", href: "#", Icon: IconBook },
    { key: "guidelines", title: "Manage Guidelines", href: "#", Icon: IconFile },
    { key: "feedback", title: "Feedback Approval", href: "#", Icon: IconMessageSquare },
    { key: "analytics", title: "Analytics", href: "#", Icon: IconChart },
    { key: "collaboration", title: "Collaboration", href: "#", Icon: IconUsers },
    { key: "managebots", title: "Manage Bot", href: "#/managebots", Icon: IconBot },
  ],
  superadmin: [
    { key: "sa-dashboard", title: "Dashboard", href: "#", Icon: IconDashboard },
    { key: "sa-managebots", title: "Manage Bots", href: "#", Icon: IconBot },
    { key: "sa-reports", title: "Reports", href: "#", Icon: IconFile },
  ],
};

export default function AppShell({
  children,
  bare = true,
  variant = "app",
  active = "",
  searchPlaceholder = "Search AI tools...",
  searchValue,
  onSearchChange,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tokens, setTokens] = useState(null);

  // Whoever is signed in — the same order the app's own profile menu uses.
  const sessionUser = (() => {
    const read = (key) => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
    let name = (read("username") || read("userName") || "").trim();
    if (!name) {
      try {
        const ls = JSON.parse(localStorage.getItem("userInfo") || "{}") || {};
        name = ls.userName || ls.username || ls.name || "";
      } catch { name = ""; }
    }
    if (!name) {
      try {
        const ss = JSON.parse(read("userInfo") || "{}") || {};
        name = ss.userName || ss.username || ss.name || "";
      } catch { name = ""; }
    }
    if (!name) name = read("userCode") || "User";
    let email = "";
    try {
      const ss = JSON.parse(read("userInfo") || "{}") || {};
      email = ss.email || ss.emailid || ss.emailId || "";
    } catch { email = ""; }
    return { name, email, initial: String(name).charAt(0).toUpperCase() || "U" };
  })();

  // The token balance the AI apps report. No value, no chip.
  useEffect(() => {
    const read = (key) => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
    const username = read("username") || read("userCode");
    const password = read("password");
    if (!username || !password) return;
    const params = new URLSearchParams({ username, password, appcode: read("appcode") || "AIG" });
    fetch(`${config.API_BASE_URL}/remaining_tokens?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.remaining_tokens != null) setTokens(Number(d.remaining_tokens)); })
      .catch(() => { });
  }, []);

  // The same sign-out the app's profile menu performs.
  const handleLogout = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      localStorage.removeItem("authToken");
      localStorage.removeItem("userSession");
      localStorage.removeItem("userInfo");
      sessionStorage.clear();
    } catch (err) { /* storage may be blocked */ }
    window.location.href = "/";
  };

  const searchVal = searchValue !== undefined ? searchValue : search;
  const handleSearch = (e) => { if (onSearchChange) onSearchChange(e.target.value); else setSearch(e.target.value); };
  const list = variant === "superadmin" ? NAV.superadmin : NAV.app;
  const navBase =
    "display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;font-size:.875rem;text-decoration:none;transition:all .15s;";

  return (
    <div style={S("min-height:100vh;background:#f9fafb;font-family:'Open Sans',sans-serif;color:#111827")}>
      <header style={S("position:relative;width:100%;z-index:30;background:rgba(255,255,255,0.95);border-bottom:1px solid #e4e7ec")}>
        <div style={S("display:flex;height:64px;align-items:center;padding:0 24px;gap:16px")}>
          {!bare && (
            <div style={S("display:flex;align-items:center;gap:16px;flex-shrink:0")}>
              <a href="#" style={S("flex-shrink:0;display:flex")}>
                <img src={LOGO_SRC} alt="AI-Levate" style={S("height:32px;width:auto")} />
              </a>
            </div>
          )}
          <div style={S("flex:1;display:flex;justify-content:center")}>
            <div className="as-search" style={S("position:relative;width:100%;max-width:28rem")}>
              <span style={S("position:absolute;left:12px;top:50%;transform:translateY(-50%);display:flex")}>
                <IconSearch size={16} stroke="#475569" />
              </span>
              <input
                className="searchInput"
                placeholder={searchPlaceholder}
                value={searchVal}
                onChange={handleSearch}
                style={S("width:100%;height:40px;padding:0 36px 0 40px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-size:.875rem;font-family:inherit;outline:none;color:#111827")}
              />
            </div>
          </div>
          <div style={S("display:flex;align-items:center;gap:12px;flex-shrink:0")}>
            {tokens != null && (
              <div style={S("display:flex;align-items:center;gap:6px;padding:0 12px;height:36px;border-radius:9999px;background:rgba(0,108,224,0.05);border:1px solid rgba(0,108,224,0.2)")}>
                <IconSparkle size={8} stroke="#006ce0" fill="#006ce0" sw={2} />
                <span style={S("font-size:.75rem;font-weight:500;color:#111827;white-space:nowrap")}>{tokens.toLocaleString()}</span>
                <span style={S("font-size:.75rem;color:#6b7280")}>tokens</span>
              </div>
            )}
            <div style={S("width:1px;height:32px;background:#e4e7ec")} />
            <div style={S("position:relative")}>
              <button type="button" onClick={() => setProfileOpen((v) => !v)}
                style={S("width:44px;height:44px;padding:0;border-radius:9999px;border:2px solid rgba(0,108,224,0.3);background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center")}>
                <span style={S("width:36px;height:36px;border-radius:9999px;background:linear-gradient(to bottom right,rgba(0,108,224,0.2),rgba(0,108,224,0.1));display:flex;align-items:center;justify-content:center;font-size:.875rem;font-weight:700;color:#006ce0")}>{sessionUser.initial}</span>
              </button>
              {profileOpen && (
                <div style={S("position:absolute;right:0;top:calc(100% + 8px);width:256px;background:#fff;border:1px solid #e4e7ec;border-radius:12px;box-shadow:0 12px 32px -8px rgba(0,0,0,0.15);padding:8px;z-index:80")}>
                  <div style={S("display:flex;flex-direction:column;padding:8px")}>
                    <span style={S("font-size:.875rem;font-weight:600;color:#111827")}>{sessionUser.name}</span>
                    <span style={S("font-size:.75rem;color:#6b7280")}>{sessionUser.email}</span>
                  </div>
                  <div style={S("height:1px;background:#e4e7ec;margin:4px 0")} />
                  <button type="button" className="profileItem"
                    style={S("width:100%;display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;border:0;background:transparent;cursor:pointer;font-size:.875rem;color:#374151;font-family:inherit")}>
                    <IconUser size={16} />Profile
                  </button>
                  <button type="button" className="profileItem"
                    style={S("width:100%;display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;border:0;background:transparent;cursor:pointer;font-size:.875rem;color:#374151;font-family:inherit")}>
                    <IconSettings size={16} />Settings
                  </button>
                  <div style={S("height:1px;background:#e4e7ec;margin:4px 0")} />
                  <button type="button" className="logoutItem" onClick={handleLogout}
                    style={S("width:100%;display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;border:0;background:transparent;cursor:pointer;text-align:left;font-family:inherit;font-size:.875rem;color:#dc2626")}>
                    <IconLogout size={16} />Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {!bare && (
        <div className="as-sidebar-wrap" style={S("position:fixed;left:0;top:64px;height:calc(100% - 64px);z-index:60;width:208px")}>
          <aside style={S("height:100%;background:#fff;border-right:1px solid hsl(215 15% 88%);display:flex;flex-direction:column")}>
            <div style={S("padding:16px 12px;flex:1;overflow-y:auto")}>
              <p style={S("padding:0 12px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:0")}>Menu</p>
              <nav style={S("display:flex;flex-direction:column;gap:4px")}>
                {list.map(({ key, title, href, Icon }) => (
                  <a key={key} href={href}
                    style={S(navBase + (key === active
                      ? "background:rgba(0,108,224,0.1);color:#006ce0;font-weight:500;"
                      : "color:#334155;"))}>
                    <span style={S("display:flex;flex-shrink:0")}><Icon size={18} /></span>
                    <span>{title}</span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      )}

      <div className={"as-content" + (bare ? " as-content-bare" : "")}
        style={S("padding-top:0;min-height:calc(100vh - 64px);display:flex;flex-direction:column;" + (bare ? "margin-left:0" : "margin-left:208px"))}>
        {children}
      </div>
    </div>
  );
}
