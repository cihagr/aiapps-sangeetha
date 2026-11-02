import { LogOut, Settings, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useNavigate } from "react-router-dom"

export function ProfileDropdown() {
  const navigate = useNavigate()
  // Prefer Dashboard-provided session values, fallback to localStorage
  let displayName = "User";
  try {
    const sessionName = sessionStorage.getItem("username") || sessionStorage.getItem("userName") || "";
    if (sessionName && sessionName.trim()) {
      displayName = sessionName.trim();
    } else {
      const ls = JSON.parse(localStorage.getItem("userInfo") || "{}");
      displayName = ls.userName || ls.username || ls.name || displayName;
    }
  } catch {}

  const handleLogout = () => {
    // Clear any stored authentication data
    localStorage.removeItem('authToken')
    localStorage.removeItem('userSession')
    localStorage.removeItem('userInfo')
    sessionStorage.clear()
    //console.log("User logged out successfully")
    navigate("/")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 w-10 rounded-full">
          <Avatar className="h-8 w-8 shadow-lg">
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-sm" title="User Profile">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 mr-4 mt-2 bg-card/95 backdrop-blur-xl border border-border/20" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer hidden">
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer hidden">
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="cursor-pointer text-destructive focus:text-destructive hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900" 
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}