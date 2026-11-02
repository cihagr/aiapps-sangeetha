import { useLocation, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, ArrowLeft, RefreshCw, Users, Shield, Settings, Sparkles } from "lucide-react";

const ManageUsers = () => {
  const location = useLocation();
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  const features = [
    {
      icon: <Users className="w-6 h-6" />,
      title: "User Management",
      description: "Manage user accounts and profiles"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Permissions",
      description: "Control access and roles"
    },
    {
      icon: <Settings className="w-6 h-6" />,
      title: "Organization",
      description: "Configure organizational settings"
    }
  ];

  useEffect(() => {
    //console.log("User navigated to Manage Users page:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 p-4 relative overflow-hidden">
      {/* Floating Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-40 h-40 bg-blue-500/10 rounded-full animate-pulse" />
        <div className="absolute bottom-10 right-10 w-56 h-56 bg-purple-500/10 rounded-full animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/3 right-1/4 w-32 h-32 bg-indigo-500/10 rounded-full animate-pulse" style={{ animationDelay: '3s' }} />
      </div>

      <div className="max-w-5xl w-full space-y-8 z-10">
        {/* Main Card */}
        <Card className="glass-effect border-0 shadow-2xl overflow-hidden transform hover:scale-[1.02] transition-all duration-500">
          <CardContent className="p-12 text-center">
            {/* Enhanced Header with Animation */}
            <div className="mb-8 relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl blur-lg group-hover:blur-md transition-all duration-500" />
              <div className="relative z-10 p-8 rounded-xl bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200/50">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <Users className="w-10 h-10" />
                </div>
                <Sparkles className="absolute top-4 right-4 w-6 h-6 text-yellow-400 animate-pulse" />
              </div>
            </div>
            
            {/* Enhanced Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4 animate-fade-in">
                  User Management Coming Soon!
                </h1>
                <p className="text-xl text-muted-foreground leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
                  Comprehensive user management and admin features are in development.
                </p>
                <p className="text-sm text-muted-foreground animate-fade-in" style={{ animationDelay: '0.4s' }}>
                  Soon you'll be able to manage user accounts, permissions, roles, and organizational settings with ease.
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
                <Link to="/dashboard">
                  <Button className="w-full sm:w-auto bg-[#2563eb] hover:bg-[#2563eb]/90 text-white font-semibold transform transition-all duration-300 hover:scale-105 hover:shadow-xl group">
                    <Home className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                    Back to Dashboard
                  </Button>
                </Link>
                
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
                hoveredFeature === index ? 'bg-blue-50/50' : ''
              }`}
              onMouseEnter={() => setHoveredFeature(index)}
              onMouseLeave={() => setHoveredFeature(null)}
            >
              <CardContent className="p-6 text-center">
                <div className={`w-12 h-12 mx-auto mb-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white transform transition-all duration-300 ${
                  hoveredFeature === index ? 'scale-110 rotate-3' : ''
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

export default ManageUsers;