import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, Search, Sparkle, X, User, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppHeaderProps {
  onMenuClick?: () => void;
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
}

export function AppHeader({
  onMenuClick,
  showSearch = true,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search AI tools...",
}: AppHeaderProps) {
  const [internal, setInternal] = useState("");
  const value = searchValue ?? internal;
  const setValue = onSearchChange ?? setInternal;
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 z-[70] backdrop-blur-sm bg-card/95 border-b border-border">
      <div className="flex h-16 items-center px-3 sm:px-6 gap-3 sm:gap-4">
        {/* Left: Logo + mobile menu */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <Link to="/dashboard" className="flex-shrink-0">
            <img
              src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
              alt="AI-Levate"
              className="h-8 w-auto"
            />
          </Link>
          {onMenuClick && (
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden flex-shrink-0"
              onClick={onMenuClick}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Center: Search */}
        <div className="flex-1 flex justify-center">
          {showSearch && (
            <div className="relative hidden lg:block w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              <Input
                placeholder={searchPlaceholder}
                className="pl-10 pr-9 h-10 w-full bg-slate-100 border-slate-200 placeholder:text-slate-600 focus-visible:ring-primary/30"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              {value && (
                <button
                  onClick={() => setValue("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Tokens + separator + profile */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-full bg-primary/5 border border-primary/20 hover:bg-primary/10 hover:border-primary/30 transition-colors">
            <Sparkle className="h-2 w-2 text-primary fill-primary" />
            <span className="text-xs font-medium text-foreground whitespace-nowrap">932,679</span>
            <span className="text-xs text-muted-foreground">tokens</span>
          </div>
          <Separator orientation="vertical" className="hidden sm:block h-8" />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-11 h-11 p-0 rounded-full border-2 border-primary/30 hover:border-primary/50 hover:bg-transparent"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">A</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 mt-2 p-2">
              <div className="flex flex-col min-w-0 px-2 py-2">
                <span className="text-sm font-semibold text-foreground truncate">Anil Kumar</span>
                <span className="text-xs text-muted-foreground truncate">anil.kumar@ailevate.com</span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer rounded-md px-2 py-2 text-sm text-foreground/80 transition-colors focus:bg-primary/10 focus:text-primary [&>svg]:text-muted-foreground focus:[&>svg]:text-primary">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-md px-2 py-2 text-sm text-foreground/80 transition-colors focus:bg-primary/10 focus:text-primary [&>svg]:text-muted-foreground focus:[&>svg]:text-primary">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2 py-2 text-sm text-destructive transition-colors focus:bg-destructive/10 focus:text-destructive [&>svg]:text-destructive/70 focus:[&>svg]:text-destructive"
                onClick={() => navigate("/")}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
