import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SuperAdminSidebar } from "@/components/SuperAdminSidebar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import comingSoonImage from "@/assets/coming-soon-new.jpg";

const SuperAdminReports = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
                  Reports
                </h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Main Content - Coming Soon */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full text-center">
            <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-12">
              <img 
                src={comingSoonImage}
                alt="Coming Soon" 
                className="w-full h-64 object-cover rounded-lg mb-8"
              />
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Coming Soon
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Advanced reporting features are under development and will be available soon.
              </p>
              <div className="inline-block px-6 py-3 bg-primary/10 text-primary rounded-full text-sm font-medium">
                Stay tuned for updates!
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SuperAdminReports;
