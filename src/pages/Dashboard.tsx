
import { useState, useEffect } from "react"
import { Search, Sparkles, ArrowRight, BarChart, Clock, Star, Users, FileText, Brain, Database, BookOpen, RefreshCw, GitCompare, Image, MessageSquare, ScanLine, PenTool, BarChart3, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AppSidebar } from "@/components/AppSidebar"
import { ProfileDropdown } from "@/components/ProfileDropdown"
import { Link, useNavigate } from "react-router-dom"

// Import tool images
import itemGenerationImage from "@/assets/item-generation.png"
import itemWriterImage from "@/assets/item-writer.png"
import itemMetadataImage from "@/assets/item-metadata.png"
import courseGeneratorImage from "@/assets/course-generator.png"
import itemRewriterImage from "@/assets/item-rewriter.png"
import itemSimilarityImage from "@/assets/item-similarity.png"
import docChatImage from "@/assets/doc-chat-ncert.png"
import ocrImage from "@/assets/ocr.png"
import comingSoonImage from "@/assets/coming-soon.png"
import DCImage from "@/assets/DC.jpg"
import DCMobydickImage from "@/assets/Doc_Chat_D.jpg"
import TestForensicImage from "@/assets/TF.jpg"
import AIPersonaImage from "@/assets/AIP.jpg"
import AIAppImage from "@/assets/App.jpg"
import { AppDetail, getAppDetails, subscribeToApp } from "@/api";
import { HELP_URL, PRIVACY_URL } from "@/config";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageLoader } from "@/components/ui/loader";
import EssayEvaluationFineTuned from "@/assets/EssayEvaluationFineTuned.png";

// Extend the Window interface to include showToast (if it exists)
declare global {
  interface Window {
    showToast?: (message: string, type?: string) => void;
    toast?: (message: string, options?: { type?: string }) => void;
  }
}




const Dashboard = () => {
  // Filter: "All", "Active Subscription", "Yet to Approve"
  const [activeTab, setActiveTab] = useState("All")
  const [subscriptionFilter, setSubscriptionFilter] = useState("All");
  const [Searchtext, setSearchText] = useState("");
  const navigate = useNavigate();
  // Store user info in state so it updates if localStorage changes
  const [userInfo, setUserInfo] = useState(() => {
    return JSON.parse(sessionStorage.getItem("userInfo") || "{}")
  });
  const customerCode = userInfo.customerCode || "";
  const orgCode = userInfo.orgCode || "";
  const userCode = userInfo.userCode || "";
  const userRole = userInfo.userRole || "";
  const username = userInfo.username || "";

  const [apps, setApps] = useState<AppDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [prevScrollY, setPrevScrollY] = useState(0);
  // Hide overview rectangle (filters + stats cards) when user is logged in
  const showOverview = false;

  // Listen for localStorage changes 
  useEffect(() => {
    const handleStorage = () => {
      const latestUserInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}")
      setUserInfo(latestUserInfo);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Always re-fetch when userCode/orgCode change
  useEffect(() => {
    // Defensive: re-read userInfo from localStorage in case it changed
    const latestUserInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}")
    setUserInfo(latestUserInfo);
    const _userCode = latestUserInfo.userCode || "";
    const _orgCode = latestUserInfo.orgCode || "";
    if (!_userCode || !_orgCode) {
      setApps([]);
      setError("User not logged in or missing codes");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getAppDetails(_userCode, _orgCode, 1)
      .then((data) => {
        //console.log("API raw response:", data);
        setApps(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        setError((err && err.message) || "Failed to load apps");
        setApps([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userInfo.userCode, userInfo.orgCode]);

  const tabs = [
    "All", "AI Generation", "Content Creation", "Education",
    "Assessment", "Analytics", "AI Tools", "AI Interaction"
  ]

  const getIconForTool = (toolId: string) => {
    const iconMap = {
      "IG": Brain,
      "ACCA_IG": PenTool,
      "IM": Database,
      "ACCA_CG": BookOpen,
      "CG": BookOpen,
      "DC": FileText,
      "CD": FileText,
      "GG": BookOpen,
      "DS": ScanLine,
      "IR": RefreshCw,
      "IS": GitCompare,
      "course-generator-2": BookOpen,
      "scenario-and": FileText,
      "doc-chat-ncert": MessageSquare,
      "doc-chat-moby": MessageSquare,
      "OCR": ScanLine,
      "EEZS": BarChart3,
      "EEV": BarChart3,
      "TF": BarChart,
      "Stdif": Image,
      "AIP": Bot,
      "IV": Bot,
      "CH": Bot
    }
    return iconMap[toolId] || Sparkles
  }

  // Map appCode to image
  const getImageForTool = (appCode: string) => {
    const imageMap: Record<string, string> = {
      "AIG": itemGenerationImage,
      "IG": itemGenerationImage,
      "ACCA_IG": itemWriterImage,
      "IM": itemMetadataImage,
      "ACCA_CG": courseGeneratorImage,
      "CG": courseGeneratorImage,
      "IR": itemRewriterImage,
      "IS": itemSimilarityImage,
      "Doc_Chat": docChatImage,
      "OCR": ocrImage,
      "DC": DCImage,
      "Doc_Chat_D": DCMobydickImage,
      "GG": AIAppImage,
      "LC": AIAppImage,
      "DS": AIAppImage,
      "SE": AIAppImage,
      "AIP": AIPersonaImage,
      // "Stdif": ImageGenerator,
      "TF": TestForensicImage,
      "EEZS": EssayEvaluationFineTuned,
      "EEV": EssayEvaluationFineTuned,
      "AQA": EssayEvaluationFineTuned,
      "PRS": EssayEvaluationFineTuned,
      "AIBI": AIAppImage,
      "AIPP": AIAppImage,
      "IV": AIAppImage,
      "CH": AIAppImage
      // Add more mappings as needed
    };
    return imageMap[appCode] || comingSoonImage;
  };

  const getCategoryForTool = (appCode: string) => {
    const categoryMap: Record<string, string> = {
      "AIG": "AI Generation",
      "IG": "AI Generation",
      "ACCA_IG": "Content Creation",
      "IM": "Metadata",
      "ACCA_CG": "Course Generation",
      "CG": "Course Generation",
      "DC": "Content Creation",
      "IR": "Item Rewriter",
      "IS": "Item Similarity",
      "Doc_Chat": "Doc-Chat NCERT",
      "Doc_Chat_D": "Doc-Chat Moby-dick",
      "OCR": "OCR",
      "GG": "Glossary Generator",
      "CD": "Content Detector",
      "DS": "Document Scanner",
      "SE": "Speech evaluation",
      "AIP": "AI Persona",
      "Stdif": "Image Generator",
      "TF": "Test Forensics",
      "EEZS": "Essay Evaluation - Zero shot",
      "EEV": "Essay Evaluation - Fine tuned",
      "AQA": "Essay Evaluation - OCR",
      "PRS": "Essay Evaluation - Rubrics",
      "CM": "Moby Dick",
      "LC": "Language Conversion",
      "IV": "Item Validation",
      "CH": "Chatbot"
      // Add more mappings as needed
    };
    return categoryMap[appCode] || "Unknown Category";
  };

  // Map appCode to route path
  const getPathForTool = (appCode: string) => {
    const pathMap: Record<string, string> = {
      // Existing known routes
      "IG": "/item-generation",
      "AIG": "/advanced-item-generation",
      "IR": "/item-rewriter",
      "IM": "/item-metadata",
      "EEV": "/essay-evaluation",
      "EEZS": "/essay-evaluation-zero-shot",
      // New Item Similarity route
      "IS": "/item-similarity",
      // Speech Evaluation route
      "SE": "/speech-evaluation",
      "Doc_Chat": "/ncert",
      "Doc_Chat_D": "/moby-dick",
      // OCR route
      "OCR": "/ocr",
      // AI Persona route
      "AIP": "/ai-persona",
      // Course Generator route
      "CG": "/course-generator",
      // Scenario & Book Index Generator route
      "DC": "/scenario-book-index",
      // Glossary Generator route
      "GG": "/glossary-generator",
      // Test Forensics route
      "TF": "/test-forensics",
      // Content Detector route
      "CD": "/content-detector",
      // Document Scanner route
      "DS": "/document-scanner",
      "LC": "/Language-Conversion",
      "CH": "/manage-bot#botlist"
    };
    return pathMap[appCode] || "/item-generation"; // fallback
  };

  // Use apps from API if available, otherwise fallback to static list
  const aiTools = Array.isArray(apps) ? apps.map(app => {
    // Updated subscription logic:
    // isSubscribed === 0: Subscribed (green, disabled)
    // isSubscribed === 1: Waiting for Approval (yellow, disabled)
    // isSubscribed === 2: Launch App (blue, enabled)
    // else: Subscribe (gray, disabled)
    let badge = "";
    let badgeColor = "bg-gray-400";
    let buttonLabel = "Subscribe";
    let buttonColor = "bg-gray-400 hover:bg-gray-400 cursor-not-allowed";
    let buttonDisabled = false;
    if (app.isSubscribed === 0) {

      badgeColor = "bg-green-500";
      buttonLabel = "Subscribe";
      buttonColor = "bg-green-500 hover:bg-green-600";
      buttonDisabled = false;
    } else if (app.isSubscribed === 1) {

      badgeColor = "bg-yellow-500";
      buttonLabel = "Waiting for Approval";
      buttonColor = "bg-yellow-500 hover:bg-yellow-500 cursor-not-allowed";
      buttonDisabled = true;
    } else if (app.isSubscribed === 2) {

      badgeColor = "bg-blue-500";
      buttonLabel = "Launch App";
      buttonColor = "bg-blue-600 hover:bg-blue-700";
      buttonDisabled = false;
    }
    return {
      id: app.appCode || app.appID?.toString() || "default-id",
      title: app.applicationName || "Untitled App",
      description: app.appDescription || "No description available.",
      path: getPathForTool((app.appCode || "").toString()), // Route based on appCode
      image: getImageForTool((app.appCode || "").toString()),
      category: getCategoryForTool((app.appCode || "").toString()),
      badge,
      badgeColor,
      buttonLabel,
      buttonColor,
      buttonDisabled,
      icon: getIconForTool((app.appCode || app.appID?.toString() || "").toString()),
      isSubscribed: app.isSubscribed,
      // pass through redirect flag from API so we know to open in iframe
      isRedirect: (app as any).isRedirect === true
    };
  }) : [];

  // Subscription filter logic
  let filteredTools = aiTools;
  if (subscriptionFilter === "Active Subscription") {
    filteredTools = filteredTools.filter(tool => tool.isSubscribed === 2 && tool.title.toLocaleLowerCase().includes(Searchtext));
  } else if (subscriptionFilter === "Yet to Approve") {
    filteredTools = filteredTools.filter(tool => tool.isSubscribed === 1 && tool.title.toLocaleLowerCase().includes(Searchtext));
  } else {
    filteredTools = filteredTools.filter(tool => tool.title.toLocaleLowerCase().includes(Searchtext));
  }
  // Category filter logic
  filteredTools = activeTab === "All" ? filteredTools : filteredTools.filter(tool => tool.category === activeTab && tool.title.toLocaleLowerCase().includes(Searchtext));

  // Debug: Log ItemRewriter tool status
  useEffect(() => {

    const itemRewriterTool = aiTools.find(tool => tool.id === "IR");
    // //console.log('ItemRewriter Tool Status:', {
    //   exists: !!itemRewriterTool,
    //   status: itemRewriterTool?.isSubscribed,
    //   path: itemRewriterTool?.path,
    //   buttonLabel: itemRewriterTool?.buttonLabel
    // });
  }, [aiTools]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar />
      <div className="ml-0 lg:ml-52 min-h-screen flex flex-col">
        {loading && (
          <PageLoader text="Loading tools..." />
        )}
        {error && (
          <div className="flex justify-center items-center h-40 text-lg text-red-600">{error}</div>
        )}
        {/* Only render dashboard if not loading and no error */}
        {!loading && !error && (
          <>
            {/* Header */}
            <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
              <div className="flex h-16 items-center justify-between px-6">
                <div className="flex items-center gap-4">
                  <div>
                    <h1 className="text-lg font-bold text-gray-900">Welcome Back, {userInfo.username ? userInfo.username : "User"}!</h1>
                    {/* You can display more user info here if needed */}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">

                  </div>
                  <div className="relative hidden md:block">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search AI tools..."
                      className="pl-10 w-60 lg:w-80 border-gray-200"
                      value={Searchtext}
                      onChange={(e) => setSearchText(e.target.value)}
                    />
                  </div>
                  <ProfileDropdown />
                </div>
              </div>
            </header>
            {/* Page Title */}
            <div className="p-6 pb-4">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">AI Tools Dashboard</h1>
              <p className="text-gray-600">Explore our comprehensive suite of AI-powered educational tools</p>
            </div>
            {/* Subscription Filter Buttons (hidden as per request) */}
            {showOverview && (
              <div className="flex gap-4 mb-4 p-6 pb-4">
                <Button
                  variant={subscriptionFilter === "All" ? "default" : "outline"}
                  onClick={() => setSubscriptionFilter("All")}
                  className={`px-4 py-2 rounded-lg text-sm ${subscriptionFilter === "All" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border-gray-200"}`}
                >
                  All
                </Button>
                <Button
                  variant={subscriptionFilter === "Active Subscription" ? "default" : "outline"}
                  onClick={() => setSubscriptionFilter("Active Subscription")}
                  className={`px-4 py-2 rounded-lg text-sm ${subscriptionFilter === "Active Subscription" ? "bg-green-600 text-white" : "bg-white text-gray-700 border-gray-200"}`}
                >
                  Active Subscription
                </Button>
                <Button
                  variant={subscriptionFilter === "Yet to Approve" ? "default" : "outline"}
                  onClick={() => setSubscriptionFilter("Yet to Approve")}
                  className={`px-4 py-2 rounded-lg text-sm ${subscriptionFilter === "Yet to Approve" ? "bg-yellow-500 text-white" : "bg-white text-gray-700 border-gray-200"}`}
                >
                  Yet to Approve
                </Button>
              </div>
            )}
            {/* Stats Cards (hidden as per request) */}
            {showOverview && (
              <div className="px-6 pb-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card className="p-6 bg-blue-50 border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <Sparkles className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="font-medium text-gray-700">Available Tools</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">{aiTools.length}</div>
                    <div className="text-sm font-medium text-blue-600">AI-Powered Solutions</div>
                  </Card>
                  <Card className="p-6 bg-green-50 border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <Star className="h-4 w-4 text-green-600" />
                      </div>
                      <span className="font-medium text-gray-700">Active Access</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">{aiTools.filter(t => t.badge === "").length}</div>
                    <div className="text-sm font-medium text-green-600">Tools Subscribed</div>
                  </Card>
                  <Card className="p-6 bg-purple-50 border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <ArrowRight className="h-4 w-4 text-purple-600" />
                      </div>
                      <span className="font-medium text-gray-700">Explore More</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">{aiTools.length - aiTools.filter(t => t.badge === "Subscribe").length}</div>
                    <div className="text-sm font-medium text-purple-600">Advanced Features</div>
                  </Card>
                  <Card className="p-6 bg-orange-50 border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <Clock className="h-4 w-4 text-orange-600" />
                      </div>
                      <span className="font-medium text-gray-700">Today's Usage</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">847</div>
                    <div className="text-sm font-medium text-orange-600">Tokens Generated</div>
                  </Card>
                </div>
              </div>
            )}
            {/* Main Content */}
            <main className="flex-1 px-6 pb-6">
              {/* Filter Tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto">
                {tabs.map((tab) => (
                  <Button
                    key={tab}
                    variant={activeTab === tab ? "default" : "outline"}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm transition-all ${activeTab === tab
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-blue-300 hover:text-blue-700"
                      }`}
                  >
                    {tab}
                  </Button>
                ))}
              </div>
              {/* AI Tools Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredTools.map((tool) => {
                  const IconComponent = tool.icon;
                  return (
                    <Card key={tool.id} className="group bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-1">
                      <div className="relative">
                        <img
                          src={tool.image}
                          alt={tool.title}
                          className="w-full h-40 object-cover rounded-t-lg"
                        />
                        {/* Tool Icon Overlay */}
                        <div className="absolute top-3 left-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center shadow-sm">
                          <IconComponent className="h-4 w-4 text-gray-700" />
                        </div>
                        {tool.badge && (
                          <div className={`absolute top-3 right-3 px-2 py-1 rounded-md text-xs text-white font-medium ${tool.badgeColor} shadow-sm`}>
                            {tool.badge}
                          </div>
                        )}
                        <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md text-xs font-medium text-gray-700 bg-white/90 backdrop-blur-sm shadow-sm">
                          {tool.category}
                        </div>
                      </div>
                      <CardContent className="p-6">
                        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-1">{tool.title}</h3>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-sm text-gray-600 mb-4 line-clamp-2">{tool.description}</p>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="start" className="max-w-xs bg-white p-2 rounded-lg shadow-lg border border-gray-200 z-999">
                              <p className="text-sm text-gray-800">{tool.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {/* Tooltip for tool button based on appCode */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                className={`w-full text-white transition-all duration-200 hover:scale-[1.02] ${tool.buttonColor}`}
                                size="sm"
                                // disabled={tool.isSubscribed === 1}
                                disabled={tool.isSubscribed === 1 || tool.image.includes('coming-soon')}
                                onClick={async () => {
                                  if (tool.isSubscribed === 0) {
                                    // Get user info from localStorage
                                    const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
                                    const usercode = userInfo.userCode || "";
                                    const orgcode = userInfo.orgCode || "";
                                    const appcode = tool.id;
                                    try {
                                      const result = await subscribeToApp(usercode, orgcode, appcode);
                                      if (result && result.success) {
                                        try { setPrevScrollY(window.scrollY || 0); } catch { }
                                        setSubscribeDialogOpen(true);
                                      } else {
                                        const failMsg = result?.message || "Subscription failed.";
                                        if (window?.toast) {
                                          window.toast(failMsg, { type: "error" });
                                        } else if (window?.showToast) {
                                          window.showToast(failMsg, "error");
                                        } else {
                                          window.showToast(failMsg, "error");
                                        }
                                      }
                                    } catch (err) {
                                      if (window?.toast) {
                                        window.toast("Subscription failed.", { type: "error" });
                                      } else if (window?.showToast) {
                                        window.showToast("Subscription failed.", "error");
                                      } else {
                                        window.showToast("Subscription failed.", "error");
                                      }
                                    }
                                    return;
                                  } else if (tool.isSubscribed === 1) {
                                    if (window?.toast) {
                                      window.toast("Your subscription request is pending approval.", { type: "info" });
                                    } else if (window?.showToast) {
                                      window.showToast("Your subscription request is pending approval.", "info");
                                    } else {
                                      window.showToast("Your subscription request is pending approval.", "info");
                                    }
                                    return;
                                  } else if (tool.isSubscribed === 2) {
                                    sessionStorage.setItem('appcode', tool.id)
                                    if ((tool as any).isRedirect) {

                                      navigate(`/app/${tool.id}`);
                                    } else {
                                      if (tool.id === "CH") {
                                        window.location.hash = "#/botlist";
                                      }
                                      navigate(tool.path);
                                    }
                                    return;
                                  } else {
                                    if (window?.toast) {
                                      window.toast("Please contact your administrator to subscribe to this app.", { type: "info" });
                                    } else if (window?.showToast) {
                                      window.showToast("Please contact your administrator to subscribe to this app.", "info");
                                    } else {
                                      window.showToast("Please contact your administrator to subscribe to this app.", "info");
                                    }
                                    return;
                                  }
                                }}
                              >
                                <Sparkles className="h-4 w-4 mr-2" />
                                {tool.buttonLabel}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="center">
                              {/* Tooltip text based on appCode */}
                              {(() => {
                                switch (tool.id) {
                                  case "IG": return "Item Generation";
                                  case "ACCA_IG": return "Item Writer";
                                  case "IM": return "Item Metadata";
                                  case "ACCA_CG": return "Course Generator";
                                  case "CG": return "Course Generator";
                                  case "DC": return "Scenario & Book Index Generator";
                                  case "GG": return "Glossary Generator";
                                  case "DS": return "Document Scanner";
                                  case "CD": return "Content Detector";
                                  case "IR": return "Item Rewriter";
                                  case "IS": return "Item Similarity";
                                  case "Doc_Chat": return "NCERT Doc Chat";
                                  case "OCR": return "OCR Tool";
                                  case "EEZS": return "Essay Evaluation (Zero Shot)";
                                  case "EEV": return "Essay Evaluation (Fine Tuned)";
                                  case "SE": return "Speech Evaluation";
                                  case "AIP": return "AI Persona";
                                  case "TF": return "Test Forensics";
                                  default: return tool.title;
                                }
                              })()}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              {filteredTools.length == 0 && (
                <div className="flex justify-center items-center h-40 text-lg text-red-600">No information to show. Please select another category.</div>
              )}
              {/* Footer */}
              <footer className="mt-12 pt-8 border-t border-gray-200 text-center">
                <p className="text-sm text-gray-500">
                  Copyright © 2026 | Excelsoft Technologies Ltd. |
                  <span className="ml-2"><a href={HELP_URL}>Help Center</a></span> |
                  <span className="ml-2" > <a href={PRIVACY_URL}>Privacy Policy</a></span> |
                  <span className="ml-4">Version : 1.0.0</span>
                  <span className="ml-2 flex items-center gap-1 float-right">Powered by :
                    <img
                      src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                      alt="AI-Levate"
                      className="h-4 w-auto powerby_image"
                    />
                  </span>
                </p>
              </footer>
            </main>
            {/* Subscribe Success Dialog */}
            <AlertDialog open={subscribeDialogOpen} onOpenChange={(open) => { if (open) setSubscribeDialogOpen(true); }}>
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <div className="flex flex-col items-center text-center w-full">
                    <div className="w-14 h-14 mb-3 flex items-center justify-center">
                      <img src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png" alt="Subscribe" className="w-14 h-14 object-contain" />
                    </div>
                    <AlertDialogTitle className="text-2xl font-bold text-gray-900">Thank you for subscribing.</AlertDialogTitle>
                    <AlertDialogDescription className="mt-2 text-gray-700">
                      Your subscription will be active after super admin approval.
                    </AlertDialogDescription>
                  </div>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex justify-center">
                  <AlertDialogAction
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => {
                      setSubscribeDialogOpen(false);
                      // Refresh tools to reflect latest status
                      const latestUserInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
                      const _userCode = latestUserInfo.userCode || "";
                      const _orgCode = latestUserInfo.orgCode || "";
                      if (_userCode && _orgCode) {
                        setLoading(true);
                        getAppDetails(_userCode, _orgCode, 1)
                          .then((data) => setApps(Array.isArray(data) ? data : []))
                          .catch((err) => setError((err && err.message) || "Failed to load apps"))
                          .finally(() => {
                            setLoading(false);
                            // Restore previous scroll position after data refresh
                            try {
                              setTimeout(() => { window.scrollTo(0, prevScrollY || 0); }, 50);
                            } catch { }
                          });
                      }
                    }}
                  >
                    OK
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard

