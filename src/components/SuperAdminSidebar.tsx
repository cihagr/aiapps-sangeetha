import { LayoutDashboard, FileText, KeyRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const items = [
  {
    title: "Dashboard",
    url: "/superadmin-dashboard",
    icon: LayoutDashboard,
  },
  // {
  //   title: "Knowledge Base",
  //   url: "/knowledge-base",
  //   icon: FileText,
  // },
  {
    title: "Reports",
    url: "/superadmin-reports",
    icon: FileText,
  },
  {
    title: "LLM Configuration",
    url: "/llm-configuration",
    icon: KeyRound,
  },
];

interface SuperAdminSidebarProps {
  onNavigate?: () => void;
}

export function SuperAdminSidebar({ onNavigate }: SuperAdminSidebarProps = {}) {
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    return currentPath === path;
  };

  return (
    // See AppSidebar: the nav scrolls so a short window cannot hide the lower items.
    <div className="h-full w-full bg-white/95 backdrop-blur-xl border-r border-border/20 shadow-xl flex flex-col">
      <div className="p-4 border-b border-border/20 flex-shrink-0">
        <div className="flex items-center">
          <img 
            src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png" 
            alt="AI-Levate" 
            className="h-8 w-auto"
          />
        </div>
      </div>
      
      <div className="px-4 py-6 flex-1 overflow-y-auto">
        <nav className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.title}
              to={item.url}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive(item.url) 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span className="font-medium">{item.title}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
