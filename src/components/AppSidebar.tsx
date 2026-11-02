import { LayoutDashboard, Sparkles, BookOpen, BarChart3, Users, LogOut, Menu, MessageSquare, Bot, ChevronLeft, ChevronRight } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { useLayoutEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { title } from "process"


const showItemMetaData = 1; // 1 = show, 0 = hide
const showImageRepository = 1; // 1  = show, 0 = hide
const showManageChatbot = 1; // 1  = show, 0 = hide

// Links are grouped under a section heading; Dashboard has no section and stays on
// top. Order within a section is the order below.
const SECTIONS = ["Content", "Standards", "Insights", "Workspace"] as const;

const items = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Manage Knowledge Base",
    url: "/knowledge-base",
    icon: BookOpen,
    section: "Content",
  },
  {
    title: "Manage Book Details",
    url: "/book-base",
    icon: Users,
    section: "Content",
  },
  {
    title: "Image Repository",
    url: "/image-repo",
    icon: Users,
    enabled: showImageRepository,
    section: "Content",
  },
  {
    title: "Manage Guidelines",
    url: "/guidelines",
    icon: Users,
    section: "Standards",
  },
  {
    title: "Item MetaData configuration",
    url: "/item-meta-data",
    icon: Users,
    enabled: showItemMetaData,
    section: "Standards",
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart3,
    section: "Insights",
  },
  {
    title: "Feedback approval",
    url: "/feedback-approval",
    icon: BarChart3,
    roles: ["admin"],
    section: "Insights",
  },
  {
    title: "Collaboration",
    url: "/collaboration",
    icon: Users,
    section: "Workspace",
  },
  // Hidden for now.
  // {
  //   title: "Manage Bot",
  //   url: "/manage-bot#managebots",
  //   icon: Bot,
  //   enabled: showManageChatbot,
  //   section: "Workspace",
  // },
].filter(item => item.enabled !== 0);

// Collapsed / expanded is remembered across pages and visits.
const COLLAPSE_KEY = "appSidebarCollapsed"
const COLLAPSE_EVENT = "app-sidebar-collapse"
// Pages offset their content with lg:ml-52 (the expanded width). While collapsed,
// this attribute on <html> lets index.css move that offset to the narrow width, so
// no page has to change.
const COLLAPSE_ATTR = "data-app-sidebar"
let mountedSidebars = 0

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1"
  } catch {
    return false
  }
}

const applyCollapsed = (collapsed: boolean) => {
  if (collapsed) document.documentElement.setAttribute(COLLAPSE_ATTR, "collapsed")
  else document.documentElement.removeAttribute(COLLAPSE_ATTR)
}

export function AppSidebar() {
  const location = useLocation()
  const currentPath = location.pathname
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)

  // Layout effects run before paint, so moving between pages never shows the content
  // at the wrong offset for a frame.
  useLayoutEffect(() => {
    mountedSidebars += 1
    const sync = () => setCollapsed(readCollapsed())
    window.addEventListener(COLLAPSE_EVENT, sync)
    return () => {
      window.removeEventListener(COLLAPSE_EVENT, sync)
      mountedSidebars -= 1
      // Pages without this sidebar (e.g. super admin) keep the normal offset.
      if (mountedSidebars === 0) applyCollapsed(false)
    }
  }, [])

  useLayoutEffect(() => {
    applyCollapsed(collapsed)
  }, [collapsed])

  const toggleCollapsed = () => {
    const next = !collapsed
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
    } catch { }
    setCollapsed(next)
    window.dispatchEvent(new Event(COLLAPSE_EVENT))
  }

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return currentPath === "/" || currentPath === "/dashboard"
    }
    if (path === "/knowledge-base") {
      return currentPath === "/knowledge-base" || currentPath.startsWith("/edit-kb") || currentPath.startsWith("/knowledge-base/edit")
    }
    if (path.includes("#managebots")) {
      return currentPath === "/manage-bot" && location.hash.includes("managebots")
    }
    const cleanPath = path.split("#")[0];
    return currentPath === cleanPath
  }

  const handleLogout = () => {
    // Add logout logic here
    //console.log("Logging out...")
  }

  return (
    // Column layout with a scrollable nav: the sidebar is fixed to the full viewport
    // height, so on a short window the lower items were simply cut off with no way to
    // reach them.
    <div className={`fixed left-0 top-0 h-full ${collapsed ? 'w-20' : 'w-52'} transition-[width] duration-300 motion-reduce:transition-none bg-white/95 backdrop-blur-xl border-r border-border/20 shadow-xl z-40 hidden lg:flex lg:flex-col`}>
      <div className={`${collapsed ? 'px-2 py-6' : 'p-6'} border-b border-border/20 flex-shrink-0`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`} style={{ marginTop: '-14px' }}>

          <img
            src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
            alt="AI-Levate"
            className={collapsed ? "h-auto w-full max-h-11 object-contain" : "h-11 w-auto "}
          />
        </div>
        {/* <p className="text-sm text-muted-foreground mt-1">Dashboard</p> */}
      </div>

      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand menu" : "Collapse menu"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand menu" : "Collapse menu"}
        className="absolute -right-3.5 top-[88px] z-50 flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 bg-white text-primary shadow-sm transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      <div className={`${collapsed ? 'px-2' : 'px-4'} py-6 flex-1 overflow-y-auto`}>
        <nav className="space-y-2">
          {(() => {
            // determine role from stored user info (session or local)
            let roleStr = '';
            try {
              const raw = sessionStorage.getItem('user') || localStorage.getItem('user') || sessionStorage.getItem('role') || localStorage.getItem('role');
              if (raw) {
                try {
                  const parsed = JSON.parse(raw);
                  roleStr = (parsed && (parsed.role || parsed.userRole || parsed.roleName)) || '';
                } catch (e) {
                  roleStr = raw || '';
                }
              }
            } catch (e) {
              roleStr = '';
            }
            roleStr = (roleStr || '').toString().toLowerCase();

            // If role is 'user', filter out Collaboration
            const visible = items.filter(i => {
              // Keep existing filter for Collaboration
              if (roleStr === 'user' && i.title === 'Collaboration') {
                return false;
              }
              // Only show Feedback approval for admin
              if (i.title === 'Feedback approval') {
                return roleStr === 'admin';
              }
              // Show all other items
              return true;
            });
            const renderLink = (item: (typeof items)[number]) => (
              <Link
                key={item.title}
                to={item.url}
                // Collapsed: icon only, so the name is given as a tooltip and to screen readers.
                title={collapsed ? item.title : undefined}
                aria-label={collapsed ? item.title : undefined}
                className={`flex items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-4'} py-3 rounded-xl transition-all duration-300 hover:bg-primary/10 hover:scale-105 ${isActive(item.url)
                  ? 'bg-primary/15 text-primary shadow-lg border border-primary/20'
                  : 'text-foreground hover:text-primary'
                  }`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span className="font-medium">{item.title}</span>}
              </Link>
            );

            return (
              <>
                {visible.filter(item => !item.section).map(renderLink)}
                {SECTIONS.map(section => {
                  const sectionItems = visible.filter(item => item.section === section);
                  // A section whose links are all hidden for this role shows no heading.
                  if (sectionItems.length === 0) return null;
                  return (
                    <div key={section} className="space-y-2 pt-3">
                      {collapsed
                        ? <div className="mx-3 border-t border-border/60" role="separator" aria-label={section} />
                        : <p className="px-4 text-xs font-medium text-muted-foreground">{section}</p>}
                      {sectionItems.map(renderLink)}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </nav>
      </div>
    </div>
  )
}