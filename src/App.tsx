import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Index from "./pages/Index";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ItemGenerator from "./pages/ItemGenerator";
import Feedback_approval from "./pages/feedback_approval";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import ItemGeneration from "./pages/ItemGeneration";
import QuestionGenerator from "./pages/QuestionGenerator";
import QuestionGenerationLoading from "./pages/QuestionGenerationLoading";
import QuestionResults from "./pages/QuestionResults";
import QuestionRepository from "./pages/QuestionRepository";
import Reports from "./pages/Reports";
import ManageUsers from "./pages/ManageUsers";
//import KnowledgeBase from "./pages/KnowledgeBase";
import KnowledgeBase from "./pages/ManageKnowledgeBase";
import ManageBookDetails from "./pages/ManageBookDetails";
import ManageGuidelines from "./pages/ManageGuidelines";
import ManageItemMetaData from "./pages/ManageItemMetaData";
//import EditKnowledgeBase from "./pages/EditKnowledgeBase";
import ManageEditKnowledgeBase from "./pages/ManageEditKnowledgeBase";
import AuthGuard from "./components/AuthGuard";

import NotFound from "./pages/NotFound";
import ItemSimilarity from "./pages/ItemSimilarity";
import ItemRewriter from "./pages/ItemRewriter";
import SpeechEvaluation from "./pages/SpeechEvaluation";
import ItemMetadata from "./pages/ItemMetadata";
import SessionTimeout from "./components/SessionTimeout";
import EssayEvaluation from "./pages/EssayEvaluation";
import DocChatNCERT from "./pages/DocChatNCERT";
import Collaboration from "./pages/Collaboration";
import EssayEvaluationDetail from "./pages/EssayEvaluationDetail";
import EssayEvaluationZeroShot from "./pages/EssayEvaluationZeroShot";
import AppIframe from "./pages/AppIframe";
import AIGItemGeneration from "./pages/AIGItemGeneration";
import AIGQuestionGenerator from "./pages/AIGQuestionGenerator";
import AIGQuestionResults from "./pages/AIGQuestionResults";
import AIGQuestionGenerationLoading from "./pages/AIGQuestionGenerationLoading";
import AIGQuestionRepository from "./pages/AIGQuestionRepository";
import AIGCheckSimilarity from "./pages/AIGCheckSimililarity"
import ImageRepository from "./pages/ImageRepository";
import ManageBot from "./pages/ManageBot";
import LLMConfiguration from "./pages/LLMConfiguration";

const queryClient = new QueryClient();

const App = () => {
  // Check if SSO mode type 3 to disable tooltips
  const isSSO = typeof window !== 'undefined' && sessionStorage.getItem('isSSO') === 'true';
  const loginType = typeof window !== 'undefined' && sessionStorage.getItem('loginType');
  const shouldDisableTooltips = isSSO && String(loginType).toLowerCase() === '3';

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={shouldDisableTooltips ? 999999 : 400} skipDelayDuration={shouldDisableTooltips ? 999999 : 300}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* Global session timeout: 30 minutes of inactivity */}
        <SessionTimeout timeoutMs={1_800_000} />
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/superadmin-dashboard" element={<SuperAdminDashboard />} />
          <Route path="/llm-configuration" element={<LLMConfiguration />} />
          <Route path="/feedback-approval" element={<Feedback_approval/> }/> 
          <Route path="/dashboard" element={
            <AuthGuard>
              <Dashboard />
            </AuthGuard>
          } />
          <Route path="/item-generation" element={<ItemGeneration />} />
          <Route path="/question-generator/:bookCode" element={<QuestionGenerator />} />
          <Route path="/question-generation-loading" element={<QuestionGenerationLoading />} />
          <Route path="/question-results" element={<QuestionResults />} />
          <Route path="/question-repository" element={<QuestionRepository />} />
          
          <Route path="/advanced-item-generation" element={<AIGItemGeneration />} />
          <Route path="/advanced-question-generator/:bookCode" element={<AIGQuestionGenerator />} />
          <Route path="/advanced-question-generation-loading" element={<AIGQuestionGenerationLoading />} />
          <Route path="/advanced-question-results" element={<AIGQuestionResults />} />
          <Route path="/advanced-question-repository" element={<AIGQuestionRepository />} />
          <Route path="/check-similarity" element={<AIGCheckSimilarity />} />
          
          <Route path="/reports" element={<Reports />} />
          <Route path="/manage-users" element={<ManageUsers />} />
          <Route path="/manage-bot" element={
            <AuthGuard>
              <ManageBot />
            </AuthGuard>
          } />
          <Route path="/knowledge-base" element={
            <AuthGuard>
              <KnowledgeBase />
            </AuthGuard>
          } />
          <Route path="/book-base" element={
            <AuthGuard>
              <ManageBookDetails/>
            </AuthGuard>
          } />
          <Route path="/guidelines" element={
            <AuthGuard>
              <ManageGuidelines/>
            </AuthGuard>
          }/>
          <Route path="/item-meta-data" element={
            <AuthGuard>
              <ManageItemMetaData/>
            </AuthGuard>
          }/>
          {/* <Route path="/knowledge-base/edit/:id" element={<EditKnowledgeBase />} />
          <Route path="/edit-kb/:customercode/:knowladgebasename" element={<EditKnowledgeBase />} /> */}
          <Route path="/knowledge-base/edit/:id" element={
            <AuthGuard>
              <ManageEditKnowledgeBase />
            </AuthGuard>
          } />
          <Route path="/edit-kb/:customercode/:knowladgebasename" element={
            <AuthGuard>
              <ManageEditKnowledgeBase />
            </AuthGuard>
          } />
           
          <Route path="/item-similarity" element={<ItemSimilarity />} />
          <Route path="/item-rewriter" element={<ItemRewriter />} />
          <Route path="/item-metadata" element={<ItemMetadata />} />
          <Route path="/speech-evaluation" element={<SpeechEvaluation />} />
          <Route path="/essay-evaluation" element={<EssayEvaluation />} />
          <Route path="/essay-evaluation-zero-shot" element={<EssayEvaluationZeroShot />} />
          {/* Dynamic route: opens detail view for a specific essay by id */}
          <Route path="/essay-evaluation/:essayId" element={<EssayEvaluationDetail />} />
          <Route path="/ncert" element={<DocChatNCERT />} />
          <Route path="/moby-dick" element={<DocChatNCERT isMobyDick={true} />} />
          <Route path="/collaboration" element={<Collaboration />} />
          
          {/* Generic dynamic iframe route for redirect apps */}
          <Route path="/app/:appCode" element={<AppIframe />} />
          <Route path="/essay-evaluation-detail" element={<EssayEvaluationDetail />} />

          <Route path="/image-repo" element={
            <AuthGuard>
              <ImageRepository />
            </AuthGuard>
          } />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;