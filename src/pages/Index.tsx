import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Brain, Sparkles, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      {/* Clean, minimal background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-white to-purple-50/30"></div>

      <div className="relative z-10 w-full max-w-md mx-auto">
        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <img
            src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
            alt="AI-Levate"
            className="h-10 w-auto"
          />
        </div>

        <Card className="bg-white border border-gray-200 shadow-lg">
          <CardContent className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to AI-Levate</h1>
              <p className="text-gray-600">Access your AI-powered workspace</p>
            </div>

            {/* Form */}
            <form className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-gray-700">
                  User Name
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter Your User Name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-12 border-gray-200 focus:border-blue-600 focus:ring-blue-600/20 transition-all duration-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter Your Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 border-gray-200 focus:border-blue-600 focus:ring-blue-600/20 transition-all duration-200 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/dashboard');
                }}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all duration-200 hover:scale-[1.02]"
              >
                Login
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>

            {/* Divider */}
            <div className="my-6">
              <Separator className="bg-gray-200" />
            </div>

            {/* Sign Up */}
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                New User? Register here...
              </p>
              <Button
                variant="outline"
                onClick={() => navigate('/register')}
                className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white font-medium px-8 py-2 transition-all duration-200"
              >
                Sign Up
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center space-y-2">
          <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
            <Sparkles className="w-3 h-3" />
            <span className="flex items-center gap-1">Powered By:
              <img
                src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                alt="AI-Levate"
                className="h-3 w-auto"
              />
            </span>
          </div>
          <div className="text-xs text-gray-400">
            <p>Copyright © 2026 | Excelsoft Technologies Ltd.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
