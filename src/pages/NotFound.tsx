import { useLocation, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, ArrowLeft, RefreshCw, Sparkles, Brain, Code, Zap } from "lucide-react";
import comingSoonHero from "@/assets/coming-soon-new.jpg";

const NotFound = () => {
  const location = useLocation();
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const navigate = useNavigate();

  const features = [
    {
      icon: <Brain className="w-6 h-6" />,
      title: "AI-Powered Tools",
      description: "Advanced AI capabilities"
    },
    {
      icon: <Code className="w-6 h-6" />,
      title: "Smart Generation",
      description: "Intelligent content creation"
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Lightning Fast",
      description: "Optimized performance"
    }
  ];

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  useEffect(() => {
    try {
      let userRole: string | null = null;

      // Try common storage keys
      const directRole = localStorage.getItem("userRole") || sessionStorage.getItem("userRole");
      if (directRole) userRole = directRole;

      // Fallback: parse a stored user object
      if (!userRole) {
        const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
        if (raw) {
          try {
            const obj = JSON.parse(raw);
            userRole = obj?.userRole || obj?.role || null;
          } catch (_) {}
        }
      }

      // Normalize for safety
      const role = (userRole || "").toLowerCase();

      // Only reroute when the user intended /dashboard
      if (location.pathname === "/dashboard" && role === "superadmin") {
        navigate("/superadmin-dashboard", { replace: true });
      }
    } catch (_) {}
  }, [navigate, location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-blue-50/30 to-indigo-50/20 p-4 relative overflow-hidden">
      {/* Floating Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-blue-500/10 rounded-full animate-pulse" />
        <div className="absolute bottom-20 right-20 w-48 h-48 bg-purple-500/10 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-10 w-24 h-24 bg-indigo-500/10 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="max-w-4xl w-full space-y-8 z-10">
        {/* Main Card */}
        <Card className="glass-effect border-0 shadow-2xl overflow-hidden transform hover:scale-[1.02] transition-all duration-500">
          <CardContent className="p-12 text-center">
            {/* Hero Image with enhanced animations */}
            <div className="mb-8 relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl blur-lg group-hover:blur-md transition-all duration-500" />
              <img 
                src={comingSoonHero} 
                alt="Coming Soon" 
                className="w-full max-w-md mx-auto rounded-xl shadow-lg animate-float relative z-10 transform group-hover:scale-105 transition-all duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent to-primary/5 rounded-xl z-20" />
              <Sparkles className="absolute top-4 right-4 w-6 h-6 text-yellow-400 animate-pulse z-30" />
            </div>
            
            {/* Enhanced Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="inline-block text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4 animate-fade-in leading-tight pb-1">
			  Coming Soon!
			</h1>
                <p className="text-xl text-muted-foreground leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
                  This amazing feature is currently under development and will be available soon.
                </p>
                <p className="text-sm text-muted-foreground animate-fade-in" style={{ animationDelay: '0.4s' }}>
                  We're working hard to bring you the best AI-powered tools for your educational needs.
                </p>
              </div>
              
              {/* Animated Progress Indicator */}
              <div className="flex items-center justify-center gap-3 my-8">
                <div className="w-4 h-4 rounded-full bg-blue-500 animate-bounce" />
                <div className="w-4 h-4 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-4 h-4 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-4 h-4 rounded-full bg-blue-200 animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
              
              {/* Enhanced Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                {(() => {
                  let role: string = "";
                  try {
                    const directRole = localStorage.getItem("userRole") || sessionStorage.getItem("userRole");
                    let userRole = directRole || null;
                    if (!userRole) {
                      const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
                      if (raw) {
                        try {
                          const obj = JSON.parse(raw);
                          userRole = obj?.userRole || obj?.role || null;
                        } catch (_) {}
                      }
                    }
                    role = (userRole || "").toLowerCase();
                  } catch (_) {}
                  const target = role === "superadmin" ? "/superadmin-dashboard" : "/dashboard";
                  return (
                    <Link to={target}>
                      <Button className="w-full sm:w-auto bg-[#2563eb] hover:bg-[#2563eb]/90 text-white font-semibold transform transition-all duration-300 hover:scale-105 hover:shadow-xl group">
                        <Home className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                        Back to Dashboard
                      </Button>
                    </Link>
                  );
                })()}
                
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Preview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card
              key={index}
              className={`glass-effect border-0 shadow-lg cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-xl ${
                hoveredCard === index ? 'bg-blue-50/50' : ''
              }`}
              onMouseEnter={() => setHoveredCard(index)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <CardContent className="p-6 text-center">
                <div className={`w-12 h-12 mx-auto mb-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white transform transition-all duration-300 ${
                  hoveredCard === index ? 'scale-110 rotate-3' : ''
                }`}>
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
