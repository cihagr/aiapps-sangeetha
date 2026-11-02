import { useState, useEffect } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Eye, GitCompare, FileQuestion, Hash, CheckCircle2, Sparkles, BookOpen, User, Target, ListChecks, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import axios from "axios"
import { AIG_GENERATE_API_URL } from "@/utils/Aigapi"

interface SimilarityItem {
  id: string;
  label: string;
  score: number;
  questionType: string;
  taxonomy: string;
  enablingObjective: string;
  bookName: string;
  userName: string;
  source: string;
  domain: string;
  fullItem: any;
}

const AIGCheckSimilarity = () => {
  const navigate = useNavigate()
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
  const location = useLocation()
  const selectedQuestion = location.state?.question.questiondata
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false)
  const [previewQuestion, setPreviewQuestion] = useState<any>(null)
  const [filterType, setFilterType] = useState("all")
  const [similarityFilterType, setSimilarityFilterType] = useState("Stem")
  const [similarityData, setSimilarityData] = useState<SimilarityItem[]>([])
  const [loading, setLoading] = useState(false)

  // Sample similar questions data - will be replaced by API data
  const [similarQuestions, setSimilarQuestions] = useState<SimilarityItem[]>([])

  const handlePreview = (question: SimilarityItem) => {
    setPreviewQuestion(question)
    setIsPreviewDialogOpen(true)
  }

  const fetchSimilarityData = async () => {
    if (!selectedQuestion) return;
    setLoading(true);
    try {
      let filterType = 1;

      if (similarityFilterType === 'Stem') {
        filterType = 1;
      } else {
        filterType = 2;
      }


      // The repository passes the database id; the identifier's trailing _ID number
      // does not always match it. Fall back to the old reading when it is absent.
      const passedId = location.state?.question?.questionNumericId
        ?? selectedQuestion.numericId ?? selectedQuestion.questionid;
      const questionId = (passedId !== undefined && passedId !== null && String(passedId).trim() !== '')
        ? String(passedId)
        : (selectedQuestion.id?.split('_ID')[1] || '3807');

      const response = await axios.post(`${AIG_GENERATE_API_URL}/get_similarity_data`, {
        question_id: questionId,
        filter_type: filterType,
      });

      console.log('Similarity API response:', response.data);
      let formattedData = [];
      if (response.data && Array.isArray(response.data.data)) {
        const similarItems = response.data.data;
        const uniqueItems = new Map();

        similarItems.forEach(item => {
          const id = item[8];
          const score = item[3];
          if (!uniqueItems.has(id) || score > uniqueItems.get(id).score) {
            uniqueItems.set(id, {
              id: id,
              label: item[2].label,
              values: item[2].values,
              score: score,
              questionType: item[7],
              taxonomy: item[9],
              enablingObjective: item[10],
              bookName: item[11],
              userName: item[12],
              source: item[13] === 2.0 ? 'LLM' : 'Book',
              domain: item[14],
              fullItem: item[2]
            });
          }
        });

        formattedData = Array.from(uniqueItems.values());
      }
      setSimilarityData(formattedData);
      setSimilarQuestions(formattedData);

    } catch (error) {
      console.error('Error fetching similarity data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedQuestion) {
      fetchSimilarityData();
    }
  }, [selectedQuestion]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {/* <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">AL</span>
              </div> */}
              <img
                src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                alt="AI-Levate"
                className="h-5 w-auto"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8 pb-4 border-b-2 border-primary/20">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
            <GitCompare className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Check Similarity</h1>
        </div>

        {/* Selected Question Details */}
        <Card className="overflow-hidden bg-card border shadow-sm mb-6 animate-fade-in">
          {/* Compact Header */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-5 py-3 border-b">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <FileQuestion className="w-4 h-4 text-primary-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Question Details</h2>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Question ID Badge */}
            <div className="animate-scale-in">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Question ID</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-md">
                <span className="font-mono text-sm font-medium text-primary">
                  {selectedQuestion?.id}
                </span>
              </div>
            </div>

            {/* Question Text */}
            <div className="animate-scale-in" style={{ animationDelay: '0.1s' }}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-muted-foreground">Question</span>
              </div>
              <div className="p-4 bg-gradient-to-br from-purple-50/50 to-blue-50/50 rounded-md border border-purple-100">
                <p className="text-sm text-foreground leading-relaxed font-semibold">
                  {selectedQuestion?.label}
                </p>
              </div>
            </div>

            {/* Options */}
            {(() => {
              const isMatrix = selectedQuestion?.type?.toLowerCase()?.includes('matrix') ||
                (Array.isArray(selectedQuestion?.rows) && Array.isArray(selectedQuestion?.columns));

              if (isMatrix) {
                return (
                  <div className="animate-scale-in" style={{ animationDelay: '0.2s' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-muted-foreground">Matrix</span>
                    </div>
                    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                      {(() => {
                        const parseArr = (v: any) => {
                          if (Array.isArray(v)) return v;
                          if (typeof v === 'string') {
                            try {
                              return JSON.parse(v);
                            } catch {
                              return [];
                            }
                          }
                          return [];
                        };

                        const rows = parseArr(selectedQuestion?.rows).map((r: any) => String(r?.text || r?.value || r || '').trim()).filter(Boolean);
                        const columns = parseArr(selectedQuestion?.columns).map((c: any) => String(c?.text || c?.value || c || '').trim()).filter(Boolean);
                        const answers = parseArr(selectedQuestion?.CorrectAnswer || selectedQuestion?.answers || selectedQuestion?.answer || []);

                        if (rows.length === 0 || columns.length === 0) {
                          return (
                            <div className="p-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded">
                              No matrix data available
                            </div>
                          );
                        }

                        return (
                          <div className="overflow-x-auto">
                            <table className="min-w-full border border-gray-300 rounded-md">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="border border-gray-300 p-2 text-left" style={{ width: '30%' }}>Activity</th>
                                  {columns.map((col: string, colIndex: number) => (
                                    <th key={colIndex} className="border border-gray-300 p-2 text-center">
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row: string, rowIndex: number) => (
                                  <tr key={rowIndex} className="border-t border-gray-200">
                                    <td className="border border-gray-200 p-3 align-top">
                                      <span className="text-sm font-medium text-gray-900">{row}</span>
                                    </td>
                                    {columns.map((_: string, colIndex: number) => {
                                      const selected = answers[rowIndex] === colIndex;
                                      return (
                                        <td key={colIndex} className={`px-3 py-2 text-center border-b border-r ${selected ? 'bg-green-50' : ''}`}>
                                          <input
                                            type="radio"
                                            name={`matrix-row-${rowIndex}`}
                                            className="accent-blue-600"
                                            readOnly
                                            onClick={(e) => e.preventDefault()}
                                            checked={selected}
                                            aria-label={`Row ${rowIndex + 1} option ${colIndex + 1}`}
                                          />
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              } else if (selectedQuestion?.values && selectedQuestion.values.length > 0) {
                // Check if it's a Fill In the Blank or Written Response question
                const questionType = selectedQuestion.type?.toLowerCase() || '';
                const isSpecialType = questionType.includes('fill') ||
                  questionType.includes('blank') ||
                  questionType.includes('written response') ||
                  questionType.includes('written');

                // Don't show answer options for these question types
                if (isSpecialType) {
                  return null;
                }

                return (
                  <div className="animate-scale-in" style={{ animationDelay: '0.2s' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-muted-foreground">Answer Options</span>
                    </div>
                    <div className="space-y-2.5">
                      {selectedQuestion.values.map((option: any, index: number) => (
                        <div
                          key={option.id || index}
                          className="flex gap-3 p-3 bg-card rounded-md border border-border"
                        >
                          <span className="text-sm text-foreground leading-relaxed flex-1">
                            {option.text || option}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </Card>

        {/* Filter Section */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Similar Questions</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-foreground">Filter by:</span>
            <Select value={similarityFilterType} onValueChange={(value) => {
              setSimilarityFilterType(value);
              fetchSimilarityData();
            }}
              disabled={similarQuestions.length === 0}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Stem">Stem</SelectItem>
                <SelectItem value="Full">Full</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Similar Questions Table */}
        <Card className="bg-card border shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading similar questions...</span>
            </div>
          ) : similarQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-16 w-16 text-gray-300 mb-4" />
              <p className="text-xl font-medium text-gray-500">No Similar Questions Found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted">
                  <TableHead className="font-semibold text-foreground">Sl No</TableHead>
                  <TableHead className="font-semibold text-foreground">Question Identifier</TableHead>
                  <TableHead className="font-semibold text-foreground w-[50%]">Question</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">Score</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">Preview</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {similarQuestions.map((question, index) => (
                  <TableRow key={question.id}>
                    <TableCell className="text-foreground">{index + 1}</TableCell>
                    <TableCell className="text-foreground font-mono text-sm">{question.id}</TableCell>
                    <TableCell className="text-foreground font-mono text-sm">{question.label}</TableCell>
                    {/* <TableCell className="text-foreground">
                      {typeof question.fullItem === 'object' && question.fullItem.stem 
                        ? question.fullItem.stem 
                        : question.fullItem 
                        ? question.fullItem.toString() 
                        : 'Question text not available'
                      }
                    </TableCell> */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <div className={`inline-flex items-center justify-center min-w-[3.5rem] px-3 py-1.5 rounded-full font-bold text-sm ${question.score >= 60 ? 'bg-green-600 text-white' :
                          question.score >= 40 ? 'bg-orange-600 text-white' :
                            'bg-red-600 text-white'
                          }`}>
                          {Math.round(question.score)}%
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(question)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] w-[calc(100vw-2rem)] p-0">
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-4 sm:px-6 py-4 border-b">
            <DialogTitle className="text-lg sm:text-xl font-semibold text-foreground flex items-center gap-2">
              <FileQuestion className="w-5 h-5 text-primary" />
              Question Preview
            </DialogTitle>
          </div>

          {previewQuestion && (
            <ScrollArea className="h-[calc(90vh-140px)]">
              <div className="px-4 sm:px-6 md:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                {/* Question Identifier & Score */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Hash className="w-5 h-5 text-primary" />
                      <span className="text-sm font-medium text-muted-foreground">Question Identifier</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-md">
                      <span className="font-mono text-sm font-medium text-primary">
                        {previewQuestion.id}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-medium text-muted-foreground block mb-2">Similarity Score</span>
                    <div className={`text-4xl font-bold ${previewQuestion.score >= 60 ? 'text-green-600' :
                      previewQuestion.score >= 40 ? 'text-orange-600' :
                        'text-red-600'
                      }`}>
                      {Math.round(previewQuestion.score)}%
                    </div>
                  </div>
                </div>

                {/* Question Stem */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    <span className="text-sm font-medium text-muted-foreground">Question Stem</span>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-purple-50/50 to-blue-50/50 rounded-md border border-purple-100">
                    <p className="text-base text-foreground leading-relaxed">
                      {typeof previewQuestion.fullItem === 'object' && previewQuestion.fullItem.label
                        ? previewQuestion.fullItem.label
                        : previewQuestion.fullItem
                          ? previewQuestion.fullItem.toString()
                          : 'Question text not available'
                      }
                    </p>
                  </div>
                </div>

                {/* Options */}
                {(() => {
                  // Check if it's a Fill In the Blank or Written Response question
                  const questionType = previewQuestion.questionType?.toLowerCase() || '';
                  const isSpecialType = questionType.includes('fill') ||
                    questionType.includes('blank') ||
                    questionType.includes('written response') ||
                    questionType.includes('Written');

                  // Don't show answer options section for these question types
                  if (isSpecialType) {
                    return null;
                  }

                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <ListChecks className="w-5 h-5 text-blue-600" />
                        <span className="text-sm font-medium text-muted-foreground">
                          {(() => {
                            const isMatrix = typeof previewQuestion.fullItem === 'object' &&
                              (previewQuestion.fullItem.type?.toLowerCase()?.includes('matrix') ||
                                (Array.isArray(previewQuestion.fullItem.rows) && Array.isArray(previewQuestion.fullItem.columns)));
                            return isMatrix ? 'Matrix' : 'Answer Options';
                          })()}
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {(() => {
                          if (typeof previewQuestion.fullItem !== 'object') {
                            return <p className="text-sm text-muted-foreground">Options not available</p>;
                          }

                          const isMatrix = previewQuestion.fullItem.type?.toLowerCase()?.includes('matrix') ||
                            (Array.isArray(previewQuestion.fullItem.rows) && Array.isArray(previewQuestion.fullItem.columns));

                          if (isMatrix) {
                            const parseArr = (v: any) => {
                              if (Array.isArray(v)) return v;
                              if (typeof v === 'string') {
                                try {
                                  return JSON.parse(v);
                                } catch {
                                  return [];
                                }
                              }
                              return [];
                            };

                            const rows = parseArr(previewQuestion.fullItem.rows).map((r: any) => String(r?.text || r?.value || r || '').trim()).filter(Boolean);
                            const columns = parseArr(previewQuestion.fullItem.columns).map((c: any) => String(c?.text || c?.value || c || '').trim()).filter(Boolean);
                            const answers = parseArr(previewQuestion.fullItem.CorrectAnswer || previewQuestion.fullItem.answers || previewQuestion.fullItem.answer || []);

                            if (rows.length === 0 || columns.length === 0) {
                              return (
                                <div className="p-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded">
                                  No matrix data available
                                </div>
                              );
                            }

                            return (
                              <div className="overflow-x-auto">
                                <table className="min-w-full border border-gray-300 rounded-md">
                                  <thead>
                                    <tr className="bg-gray-50">
                                      <th className="border border-gray-300 p-2 text-left" style={{ width: '30%' }}>Activity</th>
                                      {columns.map((col: string, colIndex: number) => (
                                        <th key={colIndex} className="border border-gray-300 p-2 text-center">
                                          {col}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row: string, rowIndex: number) => (
                                      <tr key={rowIndex} className="border-t border-gray-200">
                                        <td className="border border-gray-200 p-3 align-top">
                                          <span className="text-sm font-medium text-gray-900">{row}</span>
                                        </td>
                                        {columns.map((_: string, colIndex: number) => {
                                          const selected = answers[rowIndex] === colIndex;
                                          return (
                                            <td key={colIndex} className={`px-3 py-2 text-center border-b border-r ${selected ? 'bg-green-50' : ''}`}>
                                              <input
                                                type="radio"
                                                name={`preview-matrix-row-${rowIndex}`}
                                                className="accent-blue-600"
                                                readOnly
                                                onClick={(e) => e.preventDefault()}
                                                checked={selected}
                                                aria-label={`Row ${rowIndex + 1} option ${colIndex + 1}`}
                                              />
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          } else if (previewQuestion.fullItem.values) {
                            return previewQuestion.fullItem.values.map((option: any, index: number) => (
                              <div key={index} className="flex gap-3 p-3 bg-card rounded-md border border-border">
                                <span className="text-sm text-foreground leading-relaxed flex-1">
                                  {option.text || option}
                                </span>
                              </div>
                            ));
                          } else {
                            return <p className="text-sm text-muted-foreground">Options not available</p>;
                          }
                        })()}
                      </div>
                    </div>
                  );
                })()}

                {/* Correct Answer - Hidden for Matrix type */}
                {previewQuestion.fullItem?.type?.toLowerCase() !== 'matrix' && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-medium text-muted-foreground">Correct Answer</span>
                    </div>
                    {previewQuestion.questionType?.toLowerCase()?.includes('multiple response') ? (
                      <div className="space-y-2.5">
                        {(() => {
                          try {
                            const correctAnswers = JSON.parse(previewQuestion.fullItem?.CorrectAnswer || '[]');
                            if (Array.isArray(correctAnswers) && correctAnswers.length > 0) {
                              return (
                                <div className="space-y-2">
                                  {correctAnswers.map((answer: string, index: number) => (
                                    <div key={index} className="p-3 bg-green-50 border border-green-100 rounded-md">
                                      <p className="text-sm font-medium text-green-800">{answer}</p>
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return <p className="text-sm text-muted-foreground p-4 bg-green-50 rounded-md border">No correct answers specified</p>;
                          } catch (e) {
                            console.error('Error parsing correct answers:', e);
                            return <p className="text-sm text-amber-600 p-4 bg-amber-50 rounded-md border">Error loading correct answers</p>;
                          }
                        })()}
                      </div>
                    ) : (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-base text-foreground font-medium">
                          {previewQuestion.fullItem?.CorrectAnswer || 'Correct answer not available'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Feedback / Key Points */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-5 h-5 text-orange-600" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {previewQuestion.questionType?.toLowerCase()?.includes('written') ? 'Key Points' : 'Feedback'}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {!previewQuestion.fullItem ? (
                      <p className="text-sm text-muted-foreground">Loading details...</p>
                    ) : previewQuestion.questionType?.toLowerCase()?.includes('written') ? (
                      // Handle Key Points for Written Response
                      <div className="space-y-3">
                        {(() => {
                          try {
                            const keyPoints = previewQuestion.fullItem.KeyPoints
                              ? JSON.parse(previewQuestion.fullItem.KeyPoints)
                              : [];

                            return Array.isArray(keyPoints) && keyPoints.length > 0 ? (
                              <div className="p-3 bg-muted/30 rounded-md border border-border/50 space-y-2">
                                <ul className="list-style-none">
                                  {keyPoints.map((val: any, i: number) => {
                                    const s = String(val ?? '');
                                    return (
                                      <li key={i} className="mb-2 last:mb-0">
                                        {s.includes(' ~ ') ? (
                                          <p className="text-sm text-foreground">
                                            <strong><u>{s.split('~')[0]?.trim()}</u></strong> - <span style={{ whiteSpace: 'pre-wrap' }}>{s.split('~').slice(1).join('~').trim()}</span>
                                          </p>
                                        ) : (
                                          <p className="text-sm text-foreground" style={{ whiteSpace: 'pre-wrap' }}>{s}</p>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No key points available</p>
                            );
                          } catch (e) {
                            console.error('Error parsing KeyPoints:', e);
                            return <p className="text-sm text-muted-foreground">Error loading key points</p>;
                          }
                        })()}
                      </div>
                    ) : previewQuestion.fullItem.Feedbacks ? (
                      // Handle Feedbacks for Matrix and other question types
                      <div className="space-y-3">
                        {(() => {
                          try {
                            let feedbacks;
                            // Check if it's already an array
                            if (Array.isArray(previewQuestion.fullItem.Feedbacks)) {
                              feedbacks = previewQuestion.fullItem.Feedbacks;
                            }
                            // Check if it's a string that can be parsed as JSON
                            else if (typeof previewQuestion.fullItem.Feedbacks === 'string') {
                              try {
                                const parsed = JSON.parse(previewQuestion.fullItem.Feedbacks);
                                if (Array.isArray(parsed)) {
                                  feedbacks = parsed;
                                }
                              } catch (e) {
                                console.log('Feedbacks is not in JSON format, using as plain text');
                              }
                            }

                            // If we have a valid array of feedbacks, map them
                            if (Array.isArray(feedbacks)) {
                              return feedbacks.map((feedback: string, index: number) => (
                                <div key={index} className="p-3 bg-muted/30 rounded-md border border-border/50">
                                  <p className="text-sm text-foreground">{feedback}</p>
                                </div>
                              ));
                            }

                            // If we get here, either JSON parsing failed or it wasn't an array
                            return (
                              <div className="p-3 bg-muted/30 rounded-md border border-border/50">
                                <p className="text-sm text-foreground">{previewQuestion.fullItem.Feedbacks}</p>
                              </div>
                            );

                          } catch (e) {
                            console.error('Error processing Feedbacks:', e);
                            return (
                              <div className="p-3 bg-muted/30 rounded-md border border-border/50">
                                <p className="text-sm text-foreground">{previewQuestion.fullItem.Feedbacks}</p>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    ) : Array.from({ length: 10 }).some((_, i) =>
                      previewQuestion.fullItem?.[`FeedbackOption${String.fromCharCode(65 + i)}`]
                    ) ? (
                      // Handle individual feedback options (A-J)
                      <div className="space-y-3">
                        {Array.from({ length: 10 }).map((_, i) => {
                          const optionLetter = String.fromCharCode(65 + i);
                          const feedback = previewQuestion.fullItem?.[`FeedbackOption${optionLetter}`];
                          return feedback ? (
                            <div key={optionLetter} className="p-3 bg-muted/30 rounded-md border border-border/50">
                              <p className="text-sm font-medium text-foreground mb-1">Option {optionLetter}:</p>
                              <p className="text-sm text-foreground">{feedback}</p>
                            </div>
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {previewQuestion.questionType?.toLowerCase()?.includes('written')
                          ? 'Key points not available'
                          : 'Feedback not available'
                        }
                      </p>
                    )}
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-card rounded-md border border-border">
                    <span className="text-sm font-medium text-muted-foreground block mb-2">Type</span>
                    <Badge variant="secondary" className="text-sm">{previewQuestion.questionType}</Badge>
                  </div>

                  <div className="p-4 bg-card rounded-md border border-border">
                    <span className="text-sm font-medium text-muted-foreground block mb-2">Taxonomy</span>
                    <Badge variant="secondary" className="text-sm">{previewQuestion.taxonomy}</Badge>
                  </div>

                  <div className="col-span-2 p-4 bg-card rounded-md border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-muted-foreground">Book Name</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{previewQuestion.bookName}</p>
                  </div>

                  <div className="col-span-2 p-4 bg-card rounded-md border border-border">
                    <span className="text-sm font-medium text-muted-foreground block mb-2">Source</span>
                    <p className="text-sm text-foreground">{previewQuestion.source}</p>
                  </div>

                  <div className="col-span-2 p-4 bg-card rounded-md border border-border">
                    <span className="text-sm font-medium text-muted-foreground block mb-2">Study</span>
                    <p className="text-sm text-foreground leading-relaxed">
                      {previewQuestion.domain}
                    </p>
                  </div>

                  <div className="col-span-2 p-4 bg-card rounded-md border border-border">
                    <span className="text-sm font-medium text-muted-foreground block mb-2">Learning Objectives</span>
                    <p className="text-sm text-foreground leading-relaxed">
                      {previewQuestion.enablingObjective}
                    </p>
                  </div>

                  <div className="p-4 bg-card rounded-md border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-muted-foreground">User Name</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{previewQuestion.userName}</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          {/* Close Button */}
          <div className="border-t bg-card px-4 sm:px-6 py-4">
            <div className="flex justify-end">
              <Button onClick={() => setIsPreviewDialogOpen(false)} size="lg">
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AIGCheckSimilarity
