import {
  ArrowLeft,
  Users,
  FileText,
  Bookmark,
  ChevronRight,
  Zap,
  CheckCircle,
  Clock,
  Shield
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import itemGenerationImage from "@/assets/item-generation.png"
import secondCardImage from "@/assets/images/image.png"

import { fetchUsageStats, getBookWiseUsage, BookUsage } from "@/api";

import { PageLoader } from "@/components/ui/loader";
const ItemGeneration = () => {
  const [stats, setStats] = useState<any[]>([]);
  const [books, setBooks] = useState<BookUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
  const custcode = userInfo.customerCode;
  const orgcode = userInfo.orgCode;
  const usercode = userInfo.userCode || "";
  const appcode = "IG";

  const transformUsageData = (data: any[]) => [
    {
      icon: <Zap className="w-5 h-5 text-orange-600" />,
      title: "Token Usage",
      total: data[0]?.toLocaleString() || "0",
      subtitle: "Total Tokens used",
      bgColor: "bg-orange-50",
      items: [
        { label: "Today's usage", value: data[1]?.toLocaleString() || "0", color: "text-orange-600" },
        { label: "Balance usage", value: data[2]?.toLocaleString() || "0", color: "text-orange-600" }
      ]
    },
    {
      icon: <FileText className="w-5 h-5 text-blue-600" />,
      title: "Questions Generated",
      total: data[10]?.toString() || "0",
      subtitle: "Total Questions Generated",
      bgColor: "bg-blue-50",
      items: [
        { label: "Multiple Choice", value: data[8]?.toString() || "0", color: "text-blue-600" },
        { label: "Written Response", value: data[9]?.toString() || "0", color: "text-blue-600" }
      ]
    },
    {
      icon: <Bookmark className="w-5 h-5 text-green-600" />,
      title: "Questions Saved",
      total: data[3]?.toString() || "0",
      subtitle: "Total Questions Saved",
      bgColor: "bg-green-50",
      items: [
        { label: "Multiple Choice", value: data[4]?.toString() || "0", color: "text-green-600" },
        { label: "Written Response", value: data[5]?.toString() || "0", color: "text-green-600" }
      ]
    }
  ];

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const data: string | any[] = await fetchUsageStats({
          custcode,
          orgcode,
          usercode,
          appcode,
          type: 1
        });

        let parsed: any[] = [];
        if (typeof data === "string") {
          parsed = (data as string).split(",").map((v: string, i: number) => {
            if (i === 7) return v.trim();
            const num = Number(v.replace(/[^\d.-]/g, ""));
            return isNaN(num) ? v.trim() : num;
          });
        } else if (Array.isArray(data) && data.length === 1 && typeof data[0] === "string") {
          parsed = (String(data[0])).split(",").map((v: string, i: number) => {
            if (i === 7) return v.trim();
            const num = Number(v.replace(/[^\d.-]/g, ""));
            return isNaN(num) ? v.trim() : num;
          });
        } else if (Array.isArray(data) && data.length === 1 && Array.isArray(data[0])) {
          parsed = data[0];
        }

        setStats(transformUsageData(parsed));
        // Store parsed usage stats in localStorage for session-like access in other pages
        try {
          sessionStorage.setItem("usageStats", JSON.stringify(parsed));
        } catch { }
      } catch (err: any) {
        setError(err.message || "Failed to load stats");
        setStats([]);
      } finally {
        setLoading(false);
      }
    };

    const loadBooks = async () => {
      try {
        const usage = await getBookWiseUsage(usercode, orgcode, custcode, appcode);
        setBooks(usage);
      } catch (err) {
        console.error("Error loading book usage:", err);
      }
    };

    loadStats();
    loadBooks();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AL</span>
              </div>
              <img
                src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                alt="AI-Levate"
                className="h-5 w-auto"
              />
              
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
  <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
    <span className="text-white text-xs">✦</span>
  </div>
  <span className="text-sm text-blue-700 font-medium">
  Remaining Tokens:  {stats[0]?.items[1]?.value ?? "0"} 
  </span>
</div>

            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-gray-600">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Select Knowledge Base</h1>
          <p className="text-gray-600">Choose a knowledge base to start generating intelligent questions</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {loading && (
            <PageLoader text="Loading stats..." />
          )}
          {error && (
            <div className="col-span-3 flex justify-center items-center text-red-600 text-base font-medium py-8">{error}</div>
          )}
          {!loading && !error && stats.map((stat, index) => (
            <Card key={index} className={`p-6 ${stat.bgColor} border border-gray-200 shadow-sm`}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  {stat.icon}
                </div>
                <span className="font-medium text-gray-700">{stat.title}</span>
              </div>
              <div className="mb-4">
                <div className="text-2xl font-bold text-gray-900 mb-2">{stat.total}</div>
                <div className="text-sm font-medium text-gray-600">{stat.subtitle}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {stat.items.map((item, idx) => (
                  <div key={idx} className="text-left">
                    <div className="text-sm text-gray-600 font-medium">{item.label}</div>
                    <div className={`text-lg font-semibold ${item.color}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Knowledge Base Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {books.map((book, idx) => {
            // Map BookUsage to card fields with defaults
            const card = {
              id: book.bookCode || idx,
              image: book.imagePath ? `./assets/${book.imagePath}` : "/assets/itemGenerationImage.png",

              level: book.bookType === 2 ? "Advanced" : "Standard", // Example mapping
              questions: book.totalQuestions ?? 0,
              category: book.bookType === 2 ? "Reference" : "Textbook", // Example mapping
              title: book.title || "Untitled Book",

              lastUpdated: "Recently", // No lastUpdated in BookUsage

            };
            // Override image for specific second card as requested
            const displayImage = (card.title && card.title.toLowerCase().includes("principles and practice of insurance")) ? secondCardImage : card.image;
            return (
              <Card key={card.id} className="overflow-hidden bg-white border border-gray-200 hover:shadow-md transition-shadow">
                {/* Image Section */}
                <div className="relative h-48 bg-gray-100">
                  <img
                    src={displayImage}
                    alt={card.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3">

                  </div>
                  <div className="absolute top-3 right-3">

                  </div>
                  <div className="absolute bottom-3 right-3">
                    <div className="bg-white rounded-lg px-2 py-1 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-blue-600" />
                      <span className="text-xs font-medium text-gray-900">Questions: {card.questions}</span>
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className="p-6">
                  <div className="mb-3">

                    <h3 className="font-semibold text-gray-900 mb-2">{card.title}</h3>

                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span>{card.lastUpdated}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    </div>
                  </div>

                  <Link
                    to={`/question-generator/${card.title.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => {
                      try {
                        sessionStorage.setItem('bookTitle', card.title);
                        sessionStorage.setItem('category', card.category);
                        sessionStorage.setItem('bookType', String(book.bookType));
                        // Persist exact image path for use in the next page
                        const normalizedImg = (card.image || '').replace('./assets', '/assets');
                        sessionStorage.setItem('bookImagePath', normalizedImg);
                        const bookId = book.bookCode.replace(/\D/g, ''); // removes all non-digit characters
                        sessionStorage.setItem('bookid', String(Number(bookId))); // converts "002" to "2"
                        sessionStorage.setItem('bookIdentifier', book.bookIdentifier || '');
                        //sessionStorage.setItem('bookid',book.bookCode)
                      } catch (e) { }
                    }}
                  >
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                      <Zap className="w-4 h-4 mr-2" />
                      Start Generating
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        
        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white text-xs">⚡</span>
            </div>
            <span>Powered by advanced AI technology</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemGeneration;