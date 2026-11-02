import { useLocation, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, ArrowLeft, RefreshCw, BarChart3, TrendingUp, PieChart, Sparkles } from "lucide-react";

const Reports = () => {
  const location = useLocation();
  const [hoveredChart, setHoveredChart] = useState<number | null>(null);

  const analytics = [
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Usage Analytics",
      description: "Track tool usage and performance"
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: "Growth Metrics",
      description: "Monitor growth trends"
    },
    {
      icon: <PieChart className="w-6 h-6" />,
      title: "Detailed Reports",
      description: "Comprehensive data insights"
    }
  ];

  useEffect(() => {
    //console.log("User navigated to Reports page:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 p-4 relative overflow-hidden">
      {/* Floating Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-36 h-36 bg-green-500/10 rounded-full animate-pulse" />
        <div className="absolute bottom-20 right-20 w-52 h-52 bg-blue-500/10 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 right-10 w-28 h-28 bg-purple-500/10 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="max-w-5xl w-full space-y-8 z-10">
        {/* Main Card */}
        <Card className="glass-effect border-0 shadow-2xl overflow-hidden transform hover:scale-[1.02] transition-all duration-500">
          <CardContent className="p-12 text-center">
            {/* Enhanced Header with Animation */}
            <div className="mb-8 relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-green-600/20 to-blue-600/20 rounded-xl blur-lg group-hover:blur-md transition-all duration-500" />
              <div className="relative z-10 p-8 rounded-xl bg-gradient-to-br from-green-50 to-blue-50 border border-green-200/50">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <BarChart3 className="w-10 h-10" />
                </div>
                <Sparkles className="absolute top-4 right-4 w-6 h-6 text-yellow-400 animate-pulse" />
              </div>
            </div>
            
            {/* Enhanced Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent mb-4 animate-fade-in">
                  Reports Coming Soon!
                </h1>
                <p className="text-xl text-muted-foreground leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
                  Advanced analytics and reporting features are currently under development.
                </p>
                <p className="text-sm text-muted-foreground animate-fade-in" style={{ animationDelay: '0.4s' }}>
                  Get ready for comprehensive insights into your AI tool usage, performance metrics, and detailed analytics.
                </p>
              </div>
              
              {/* Animated Progress Indicator */}
              <div className="flex items-center justify-center gap-3 my-8">
                <div className="w-4 h-4 rounded-full bg-green-500 animate-bounce" />
                <div className="w-4 h-4 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-4 h-4 rounded-full bg-green-300 animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-4 h-4 rounded-full bg-green-200 animate-bounce" style={{ animationDelay: '0.3s' }} />
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

        {/* Analytics Preview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {analytics.map((analytic, index) => (
            <Card
              key={index}
              className={`glass-effect border-0 shadow-lg cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-xl ${
                hoveredChart === index ? 'bg-green-50/50' : ''
              }`}
              onMouseEnter={() => setHoveredChart(index)}
              onMouseLeave={() => setHoveredChart(null)}
            >
              <CardContent className="p-6 text-center">
                <div className={`w-12 h-12 mx-auto mb-4 rounded-lg bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white transform transition-all duration-300 ${
                  hoveredChart === index ? 'scale-110 rotate-3' : ''
                }`}>
                  {analytic.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{analytic.title}</h3>
                <p className="text-sm text-gray-600">{analytic.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;