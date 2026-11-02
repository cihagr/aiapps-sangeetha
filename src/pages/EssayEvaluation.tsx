import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { BookOpen, Users, FileText, ArrowRight, ArrowLeft, PenTool, Sparkles, Loader2 } from "lucide-react"
import essayEvaluationImage from "@/assets/EssayEvaluationFineTuned.png"
import Bodily from "@/assets/Bodily.png"
import Essentials from "@/assets/Essentials.png"
import { ESSAY_EVAL_API_URL } from "@/config"

// API Response Interface
interface ApiResponse {
  TotalResponseEvaluatedToday: string | null;
  balanceToken: string | null;
  bookCode: string | null;
  bookName: string | null;
  noOfQuestionEvaluated: number;
  noOfQuestions: number;
  todaysToken: string | null;
  todaysUsgae: string | null;
  totalQuestionCount: number | null;
  totalTokenCount: string | null;
  totaluserEvaluated: number;
}

// Essay Card Interface
interface EssayCard {
  id: string;
  title: string;
  image: string;
  questionsTotal: number;
  questionsEvaluated: number;
  usersEvaluated: number;
  bookCode?: string;
}

const EssayEvaluation = () => {
  const [essayCards, setEssayCards] = useState<EssayCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalQuestionsEvaluated, setTotalQuestionsEvaluated] = useState(0);
  const [totalUsersEvaluated, setTotalUsersEvaluated] = useState(0);
  const [remainingToken, setRemainingToken] = useState<number | null>(null);
  const [todaysToken, setTodaysToken] = useState<string | null>(null);
  const [totalTokenCount, setTotalTokenCount] = useState<string | null>(null);

  // Function to get configuration values from localStorage with fallbacks
  const getConfigValue = (key: string, fallback: string): string => {
    return localStorage.getItem(key) || fallback;
  };

  const appcode = "EEV"
  // Read codes from sessionStorage — prefer the login API response stored under `user`.
  // Fall back to other keys (`userInfo`, individual keys) if `user` is not present.
  const _storedUserStr = sessionStorage.getItem('user') || sessionStorage.getItem('userInfo') || sessionStorage.getItem('userDetails') || sessionStorage.getItem('userData');
  let _storedUser: any = null;
  if (_storedUserStr) {
    try {
      _storedUser = JSON.parse(_storedUserStr);
    } catch (e) {
      _storedUser = _storedUserStr;
    }
  }

  // Normalize possible property names from different login responses
  const custcodeRaw = sessionStorage.getItem('customerCode') || _storedUser?.customerCode || _storedUser?.customer_code || _storedUser?.custcode || null;
  const orgcodeRaw = sessionStorage.getItem('orgCode') || _storedUser?.orgCode || _storedUser?.orgcode || _storedUser?.org_code || null;
  const usercodeRaw = sessionStorage.getItem('userCode') || _storedUser?.userCode || _storedUser?.usercode || _storedUser?.user_code || _storedUser?.user || null;

  // Ensure we pass strings (empty string fallback) to the API payload to avoid sending null
  const custcode = String(custcodeRaw ?? '');
  const orgcode = String(orgcodeRaw ?? '');
  const usercode = String(usercodeRaw ?? '');


  // Function to handle book click and store booknameid in session storage
  const handleBookClick = (essayId: string, index: number) => {
    const booknameid = index + 1; // First book = 1, second book = 2, etc.
    sessionStorage.setItem('booknameid', booknameid.toString());
    sessionStorage.setItem('selectedEssayId', essayId);
    //console.log(`Stored booknameid: ${booknameid} for essay: ${essayId}`);
  };

  // API configuration
  const apiUrl = `${ESSAY_EVAL_API_URL}/get_usage`;

  useEffect(() => {
    const fetchEssayData = async () => {
      try {
        setLoading(true);
        // include booknameid from selected book (stored in sessionStorage by handleBookClick)
        const booknameid = Number(sessionStorage.getItem('booknameid') || 0);
        const payload: any = {
          custcode,
          orgcode,
          usercode,
          appcode,
          type: 2,
        };
        if (booknameid > 0) payload.booknameid = booknameid;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const data: ApiResponse[] = await response.json();

        // Filter only book data (exclude summary data where bookCode is null)
        const bookData = data.filter(item => item.bookCode !== null && item.bookName !== null);

        // Extract summary data (where bookCode is null) for balance token, todaysToken, totalTokenCount
        const summaryData = data.find(item => item.bookCode === null);
        if (summaryData) {
          if (summaryData.balanceToken) {
            setRemainingToken(parseInt(summaryData.balanceToken));
          }
          if (summaryData.todaysToken) {
            setTodaysToken(summaryData.todaysToken);
          }
          if (summaryData.totalTokenCount) {
            setTotalTokenCount(summaryData.totalTokenCount);
          }
        }

        // Map API response to essay cards format
        const mappedCards: EssayCard[] = bookData.map((item, index) => ({
          id: item.bookCode || `essay-${index + 1}`,
          title: item.bookName || `Assessment ${index + 1}`,
          image: essayEvaluationImage,
          questionsTotal: item.noOfQuestions,
          questionsEvaluated: item.noOfQuestionEvaluated,
          usersEvaluated: item.totaluserEvaluated,
          bookCode: item.bookCode || undefined
        }));

        setEssayCards(mappedCards);

        // Calculate totals for stats widgets
        const totalQuestionsEval = bookData.reduce((sum, item) => sum + item.noOfQuestionEvaluated, 0);
        const totalUsersEval = bookData.reduce((sum, item) => sum + item.totaluserEvaluated, 0);

        setTotalQuestionsEvaluated(totalQuestionsEval);
        setTotalUsersEvaluated(totalUsersEval);

      } catch (error) {
        console.error('Error fetching essay data:', error);
        // Fallback to default data on error
        setEssayCards([
          {
            id: "essay-1",
            title: "Biology Assessment",
            image: essayEvaluationImage,
            questionsTotal: 8,
            questionsEvaluated: 1,
            usersEvaluated: 1
          },
          {
            id: "essay-2",
            title: "Physics Evaluation",
            image: essayEvaluationImage,
            questionsTotal: 10,
            questionsEvaluated: 3,
            usersEvaluated: 2
          }
        ]);
        setTotalQuestionsEvaluated(4);
        setTotalUsersEvaluated(3);
        setRemainingToken(16424); // Fallback value
      } finally {
        setLoading(false);
      }
    };

    fetchEssayData();
  }, []);

  return (
    <>
      {loading ? (
        /* Full Page Loader */
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 flex items-center justify-center">
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg animate-pulse">
                <PenTool className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">Loading Essay Evaluation</h2>
              <p className="text-gray-600">Preparing your assessment dashboard...</p>
            </div>
            <div className="flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          </div>
        </div>
      ) : (
        /* Main Content */
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
          {/* Header */}
          <div className="bg-white backdrop-blur-sm border-b border-gray-200/60 px-6 py-4 sticky top-0 z-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
                    <PenTool className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-gray-900">Essay Evaluation - Fine tuned</span>
                    <span className="text-xs text-gray-500">AI-powered evaluation for subjective responses</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                    <Sparkles className="w-2 h-2 text-white" />
                  </div>
                  <span className="text-sm text-blue-700 font-medium">
                    {remainingToken !== null ? `Remaining Tokens: ${remainingToken.toLocaleString()} ` : "Loading…"}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <Link to="/dashboard">
                    <Button variant="ghost" size="sm" className="text-gray-600">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Dashboard
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-6 max-w-7xl mx-auto space-y-8">
            {/* Page Title */}
            <div className="text-center space-y-4 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                <PenTool className="w-4 h-4" />
                Essay Assessment Platform
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
                Essay Evaluation System
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Subjective questions are evaluated for predefined books, using AI to get score and feedbacks for answer responses
              </p>
            </div>
            {/* Stats Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card className="p-6 bg-blue-50 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Total Questions Evaluated</span>
                </div>
                <div className="text-3xl font-bold text-gray-900">{loading ? '...' : totalQuestionsEvaluated}</div>
              </Card>
              <Card className="p-6 bg-green-50 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <Users className="h-4 w-4 text-green-600" />
                  </div>
                  <span className="font-medium text-gray-700">Total Users Evaluated</span>
                </div>
                <div className="text-3xl font-bold text-gray-900">{loading ? '...' : totalUsersEvaluated}</div>
              </Card>
              <Card className="p-6 bg-blue-50 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Todays Token Usage</span>
                </div>
                <div className="text-3xl font-bold text-gray-900">{loading ? '...' : todaysToken ?? '0'}</div>
              </Card>

              <Card className="p-6 bg-green-50 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Total Token Count</span>
                </div>
                <div className="text-3xl font-bold text-gray-900">{loading ? '...' : totalTokenCount ?? '0'}</div>
              </Card>
            </div>

            {/* Essay Cards */}
            <div>

              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {essayCards.map((essay, index) => (
                    <Card key={essay.id} className="group bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-1">
                      <div className="relative">
                        <img
                          src={essay.bookCode === "BO001" ? Bodily : essay.bookCode === "BO002" ? Essentials : essay.image}
                          alt={essay.title}
                          className="w-60 h-60 items-center mx-auto mt-6 mb-4 object-contain"
                        />
                        <div className="absolute top-3 left-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center shadow-sm">
                          <BookOpen className="h-4 w-4 text-gray-700" />
                        </div>
                      </div>

                      <CardContent className="p-6">
                        <h3 className="font-semibold text-gray-900 mb-4">{essay.title}</h3>

                        <div className="space-y-2 mb-4 text-sm text-gray-600">
                          <div className="flex justify-between">
                            <span>Number of Questions:</span>
                            <span className="font-medium text-gray-900">{essay.questionsTotal}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Questions Evaluated:</span>
                            <span className="font-medium text-gray-900">{essay.questionsEvaluated}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Users Evaluated:</span>
                            <span className="font-medium text-gray-900">{essay.usersEvaluated}</span>
                          </div>
                        </div>

                        <Link to={`/essay-evaluation/${essay.id}`}>
                          <Button
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 hover:scale-[1.02]"
                            size="sm"
                            onClick={() => handleBookClick(essay.id, index)}
                          >
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Open Essay
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default EssayEvaluation