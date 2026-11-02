import {
  ArrowLeft,
  Users,
  FileText,
  Bookmark,
  ChevronRight,
  Zap,
  CheckCircle,
  Clock,
  Shield,
  Check,
  Minus
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import itemGenerationImage from "@/assets/item-generation.png"
import { fetchUsageStats, getBookWiseUsage, BookUsage } from "@/utils/Aigapi";
import { getImageUrl } from "@/config";
import { PageLoader } from "@/components/ui/loader";

const AIGItemGeneration = () => {
  const navigate = useNavigate();
  const isSSO = sessionStorage.getItem('isSSO') === 'true';
  // Authentication check - redirect to login if not authenticated
  useEffect(() => {
    const checkAuthentication = () => {
      const username = sessionStorage.getItem('username');
      const userInfo = sessionStorage.getItem('userInfo');
      const custcode = sessionStorage.getItem('custcode');
      
      // Check if user is not authenticated (no username, userInfo, or custcode)
      if (!username && (!userInfo || userInfo === '{}') && !custcode) {
        navigate('/login', { replace: true });
        return;
      }
    };
    
    checkAuthentication();
  }, [navigate]);
  const [stats, setStats] = useState<any[]>([]);
  const [books, setBooks] = useState<BookUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
  const custcode = userInfo.customerCode || "";
  const orgcode = userInfo.orgCode || "";

  // Book code -> whether it has Study (chapters) and learning objectives. This used
  // to need its own chapter/LO lookups per book (and, before that, a lookup per
  // chapter) — get_usage's own response already carries this as each row's last
  // field (1/0, see BookUsage.hasStudyLO), so it's set directly from `books` below
  // with no extra requests at all.
  // The page loader stays up until the book list (with its Study/LO flags) has
  // arrived, so the cards never appear with chips still missing.
  const [studyLOChecking, setStudyLOChecking] = useState(true);
  const [studyLOStatus, setStudyLOStatus] = useState<Record<string, { study: boolean; lo: boolean }>>({});
  const usercode = userInfo.userCode || "";
  const appcode = "AIG";

  const toCount = (value: any): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  // get_usage does not return the Select the Blank counters in the slots that follow
  // the Matrix pair, so they always read 0 — while the type's questions ARE included
  // in the totals it reports. Derive the missing figure as "total minus every type
  // listed here"; a real backend value wins as soon as one starts arriving.
  const residualCount = (total: any, listed: any[]): number =>
    Math.max(0, toCount(total) - listed.reduce((sum: number, part: any) => sum + toCount(part), 0));

  const transformUsageData = (data: any[]) => {
    const selectBlankGenerated = toCount(data[20])
      || residualCount(data[10], [data[8], data[12], data[11], data[13], data[9], data[18]]);
    const selectBlankSaved = toCount(data[19])
      || residualCount(data[3], [data[4], data[15], data[14], data[16], data[5], data[17]]);

    return [
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
        { label: "Multiple Response", value: data[12]?.toString() || "0", color: "text-blue-600" },
        { label: "True False", value: data[11]?.toString() || "0", color: "text-blue-600" },
        { label: "Fill In the Blank", value: data[13]?.toString() || "0", color: "text-blue-600" },
        { label: "Written Response", value: data[9]?.toString() || "0", color: "text-blue-600" },
        { label: "Matrix", value: data[18]?.toString() || "0", color: "text-blue-600" },
        { label: "Select the Blank", value: selectBlankGenerated.toString(), color: "text-blue-600" }

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
        { label: "Multiple Response", value: data[15]?.toString() || "0", color: "text-green-600" },
        { label: "True False", value: data[14]?.toString() || "0", color: "text-green-600" },
        { label: "Fill In the Blank", value: data[16]?.toString() || "0", color: "text-green-600" },
        { label: "Written Response", value: data[5]?.toString() || "0", color: "text-green-600" },
        { label: "Matrix", value: data[17]?.toString() || "0", color: "text-green-600" },
        { label: "Select the Blank", value: selectBlankSaved.toString(), color: "text-green-600" }

      ]
    }
  ];
  };

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

        // Straight from get_usage's own response — no chapter/LO calls at all.
        const status: Record<string, { study: boolean; lo: boolean }> = {};
        usage.forEach((book) => {
          if (!book.bookCode) return;
          status[String(book.bookCode)] = { study: book.hasStudyLO, lo: book.hasStudyLO };
        });
        setStudyLOStatus(status);
      } catch (err) {
        console.error("Error loading book usage:", err);
      } finally {
        setStudyLOChecking(false);
      }
    };

    // Load stats first, then books sequentially
    loadStats().then(() => {
      loadBooks();
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">

              <img
                src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                alt="AI-Levate"
                className="h-10 w-auto"
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
                Back to Tools Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Advanced Item Generator</h1>
          <p className="text-gray-600">Subjective and Objective questions are generated for the book title by AI</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* One loader for the whole load: it stays up until the book cards' Study / LO
              chips are ready, so the cards never appear half-labelled. */}
          {(loading || studyLOChecking) && (
            <PageLoader text="Loading stats..." />
          )}
          {error && (
            <div className="col-span-3 flex justify-center items-center text-red-600 text-base font-medium py-8">{error}</div>
          )}
          {!loading && !error && stats.map((stat, index) => (
            <Card key={index} className={`pl-10 pr-6 py-6 ${stat.bgColor} border border-gray-200 shadow-sm`}>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full pl-[6px]">
                {stat.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col justify-center">
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
              image: book.imagePath ? `/${book.imagePath}` : "/assets/itemGenerationImage.png",

              level: book.bookType === 2 ? "Advanced" : "Standard", // Example mapping
              questions: book.totalQuestions ?? 0,
              category: book.bookType === 2 ? "Reference" : "Textbook", // Example mapping
              title: book.title || "Untitled Book",

              lastUpdated: "Recently", // No lastUpdated in BookUsage

            };
            return (
              <Card key={card.id} className="overflow-hidden bg-white border border-gray-200 hover:shadow-md transition-shadow">
                {/* Image Section */}
                <div className="relative h-48 bg-gray-100">
                  <img
                    src={getImageUrl(card.image)}
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

                    <h3 className="font-semibold text-gray-900 mb-2 break-words max-w-xs">{card.title}</h3>

                    {(() => {
                      const status = studyLOStatus[String(book.bookCode ?? '')];
                      if (!status) return null;
                      // One chip for both: ticked only when the book has study and
                      // learning objectives; the tooltip says which half is missing.
                      const added = status.study && status.lo;
                      const Icon = added ? Check : Minus;
                      const title = added
                        ? 'Study and learning objectives added'
                        : status.study
                          ? 'Study added, learning objectives not added yet'
                          : status.lo
                            ? 'Learning objectives added, study not added yet'
                            : 'Study and learning objectives not added yet';
                      return (
                        <div className="flex flex-wrap gap-2">
                          <span
                            title={title}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${added
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-gray-200 bg-white text-gray-600'
                              }`}
                          >
                            <Icon className="h-3 w-3" />
                            Study and Learning objectives
                          </span>
                        </div>
                      );
                    })()}
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
                    to={`/advanced-question-generator/${card.title.toLowerCase().replace(/\s+/g, '-')}`}
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
                    }}>
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
        {!isSSO && (
        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white text-xs">⚡</span>
            </div>
            <span>Powered by advanced AI technology</span>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default AIGItemGeneration;