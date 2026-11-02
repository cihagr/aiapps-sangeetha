import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Volume2,
  VolumeX,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  Presentation,
  BookOpen,
  Zap,
  HelpCircle,
  Check,
  X,
  Eye,
  RefreshCw
} from 'lucide-react';
import LatexRenderer from '../pages/LatexRenderer';

interface FlashcardModalProps {
  open: boolean;
  onClose: () => void;
  questions: any[];
}

export const FlashcardModal: React.FC<FlashcardModalProps> = ({
  open,
  onClose,
  questions,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mode, setMode] = useState<'presentation' | 'study' | 'quiz'>('presentation');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  // Study mode tracking
  const [knownQuestions, setKnownQuestions] = useState<Set<string>>(new Set());
  const [reviewQuestions, setReviewQuestions] = useState<Set<string>>(new Set());
  const [isCompleted, setIsCompleted] = useState(false);

  // Quiz mode tracking
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const currentQuestion = questions[currentIndex] || null;

  // Reset state when opening modal or changing question set
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setIsFlipped(false);
      setIsCompleted(false);
      setKnownQuestions(new Set());
      setReviewQuestions(new Set());
      setSelectedAnswerIndex(null);
      setQuizScore(0);
      setTimeLeft(30);
      setIsTimerRunning(mode === 'quiz');
    } else {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudio(false);
    }
  }, [open, questions, mode]);

  // Quiz timer effect
  useEffect(() => {
    let interval: any = null;
    if (open && mode === 'quiz' && isTimerRunning && timeLeft > 0 && !isCompleted && selectedAnswerIndex === null) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && mode === 'quiz' && !isCompleted && selectedAnswerIndex === null) {
      setIsFlipped(true); // Automatically reveal answer when timer hits 0
    }
    return () => clearInterval(interval);
  }, [open, mode, isTimerRunning, timeLeft, isCompleted, selectedAnswerIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R') {
        handleSpeech();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, questions.length]);

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      setSelectedAnswerIndex(null);
      setTimeLeft(30);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
    } else {
      setIsCompleted(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
      setSelectedAnswerIndex(null);
      setTimeLeft(30);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
    }
  };

  const handleMarkKnowledge = (known: boolean) => {
    if (!currentQuestion) return;
    const qId = String(currentQuestion.id || currentIndex);

    if (known) {
      setKnownQuestions((prev) => new Set(prev).add(qId));
      setReviewQuestions((prev) => {
        const next = new Set(prev);
        next.delete(qId);
        return next;
      });
    } else {
      setReviewQuestions((prev) => new Set(prev).add(qId));
      setKnownQuestions((prev) => {
        const next = new Set(prev);
        next.delete(qId);
        return next;
      });
    }

    handleNext();
  };

  const handleQuizAnswerSelect = (optionIndex: number, optionLetter: string, optionRaw: any) => {
    if (selectedAnswerIndex !== null) return; // Already picked for this card
    setSelectedAnswerIndex(optionIndex);
    setIsFlipped(true);

    const isCorrect = checkIsOptionCorrect(currentQuestion, optionLetter, optionIndex, optionRaw);
    if (isCorrect) {
      setQuizScore((prev) => prev + 1);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const handleSpeech = () => {
    if (!window.speechSynthesis || !currentQuestion) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    const stem = currentQuestion.label || currentQuestion.QuestionStatement || currentQuestion.partPrompt || '';
    const cleanText = stem.replace(/<[^>]*>/g, '').replace(/\$/g, '');
    const optionsText = (currentQuestion.values || []).map((v: any, i: number) => {
      const letter = String.fromCharCode(65 + i);
      const text = typeof v === 'string' ? v : v?.text || '';
      return `Option ${letter}: ${text.replace(/^[A-J][\.\)]\s*/, '')}`;
    }).join('. ');

    const fullSpeechText = `${cleanText}. Choices are: ${optionsText}`;

    const utterance = new SpeechSynthesisUtterance(fullSpeechText);
    utterance.rate = 0.95;
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    setIsPlayingAudio(true);
    window.speechSynthesis.speak(utterance);
  };

  const getCleanStem = (q: any) => {
    if (!q) return '';
    return q.label || q.QuestionStatement || q.PartPrompt || q.partPrompt || '';
  };

  // Helper to determine if an option is correct
  const checkIsOptionCorrect = (q: any, optionLetter: string, optionIndex: number, optionRaw: any): boolean => {
    if (!q) return false;
    const optUpper = String(optionLetter || '').trim().toUpperCase();

    if (q.ItemScoring?.Marking) {
      const marking = String(q.ItemScoring.Marking).toUpperCase().split(',').map(s => s.trim().replace(/[\.\)]$/, ''));
      if (marking.includes(optUpper)) return true;
    }

    if (q.marks) {
      if (typeof q.marks === 'object' && !Array.isArray(q.marks)) {
        const markVal = q.marks[optUpper] ?? q.marks[optUpper.toLowerCase()];
        if (markVal !== undefined && Number(markVal) > 0) return true;
      }
    }

    const rawCA = q.CorrectAnswer ?? q.correctanswer ?? q.answer ?? q.correct;
    if (rawCA === undefined || rawCA === null || rawCA === '') return false;

    const normalizeText = (str: string) => {
      return String(str || '')
        .replace(/^[A-J][\.\)]\s*/i, '')
        .replace(/\$/g, '')
        .replace(/\\text\{([^}]*)\}/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };

    const cleanOptionText = normalizeText(typeof optionRaw === 'string' ? optionRaw : (optionRaw?.text || optionRaw?.value || ''));

    if (Array.isArray(rawCA)) {
      return rawCA.some((item: any) => {
        if (item === null || item === undefined) return false;
        if (typeof item === 'number') return item === optionIndex || item === optionIndex + 1;
        const strUpper = String(item).trim().toUpperCase();
        if (strUpper === optUpper || strUpper.startsWith(optUpper + '.') || strUpper.startsWith(optUpper + ')') || strUpper.startsWith(optUpper + ':')) return true;
        const cleanStr = normalizeText(String(item));
        return cleanOptionText && cleanStr && cleanStr === cleanOptionText;
      });
    }

    if (typeof rawCA === 'number') {
      return rawCA === optionIndex || rawCA === optionIndex + 1;
    }

    const strCA = String(rawCA).trim();
    if (!strCA) return false;

    const parts = strCA.split(/[\n,;]|\s*\|\|\|\s*/).map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      const partUpper = part.toUpperCase();
      if (partUpper === optUpper || partUpper.startsWith(optUpper + '.') || partUpper.startsWith(optUpper + ')') || partUpper.startsWith(optUpper + ':') || partUpper === `OPTION ${optUpper}` || partUpper.startsWith(`OPTION ${optUpper}.`) || partUpper.startsWith(`OPTION ${optUpper} `)) {
        return true;
      }
      const cleanPart = normalizeText(part);
      if (cleanOptionText && cleanPart && cleanPart === cleanOptionText) {
        return true;
      }
    }

    return false;
  };

  if (!open || questions.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-900 text-white border-slate-800 shadow-2xl rounded-2xl [&>button]:hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800 backdrop-blur-md z-20">
          {/* Mode Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => setMode('presentation')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'presentation'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Presentation className="w-3.5 h-3.5" />
              Classroom Projector
            </button>
            <button
              onClick={() => setMode('study')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'study'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Self-Study
            </button>
            <button
              onClick={() => setMode('quiz')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'quiz'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Rapid-Fire Quiz
            </button>
          </div>

          {/* Center Info / Timer */}
          <div className="flex items-center gap-4">
            <div className="text-sm font-semibold tracking-wide text-slate-300">
              Card <span className="text-blue-400 font-bold">{currentIndex + 1}</span> of {questions.length}
            </div>

            {mode === 'quiz' && !isCompleted && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                timeLeft <= 5 ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                <Clock className="w-3.5 h-3.5" />
                {timeLeft}s
              </div>
            )}
          </div>

          {/* Action Tools & Prominent Close Button */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSpeech}
              className={`h-9 w-9 p-0 rounded-xl transition-all ${
                isPlayingAudio ? 'bg-blue-600 text-white animate-pulse' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Read aloud (Hotkey: R)"
            >
              {isPlayingAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="h-9 w-9 p-0 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            {/* PROMINENT CLOSE WINDOW BUTTON (X) */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-9 w-9 p-0 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800/80 transition-colors ml-2"
              title="Close window (Esc)"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* MODE BANNER */}
        <div className={`px-6 py-2 text-xs font-bold text-center tracking-wide uppercase flex items-center justify-center gap-2 border-b ${
          mode === 'presentation'
            ? 'bg-blue-950/60 text-blue-300 border-blue-900/40'
            : mode === 'study'
            ? 'bg-purple-950/60 text-purple-300 border-purple-900/40'
            : 'bg-amber-950/60 text-amber-300 border-amber-900/40'
        }`}>
          {mode === 'presentation' && (
            <>
              <Presentation className="w-3.5 h-3.5 text-blue-400" />
              <span>Classroom Projector Mode — High Contrast Large Text for Smartboards</span>
            </>
          )}
          {mode === 'study' && (
            <>
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>Self-Study Flashcards — Test your memory before revealing the answer</span>
            </>
          )}
          {mode === 'quiz' && (
            <>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Rapid-Fire Quiz — Pick an option before the 30s timer runs out!</span>
            </>
          )}
        </div>

        {/* Deck Stage Body */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 bg-gradient-to-b from-slate-900 to-slate-950 relative overflow-y-auto">
          {isCompleted ? (
            /* Summary View */
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl animate-fade-in">
              <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto border border-blue-500/30">
                <Award className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-white">
                {mode === 'quiz' ? 'Quiz Complete!' : 'Deck Completed! 🎉'}
              </h2>
              
              {mode === 'quiz' ? (
                <div className="p-6 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                  <div className="text-4xl font-black text-amber-400">{quizScore} / {questions.length}</div>
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Final Quiz Score</div>
                  <div className="text-sm font-medium text-emerald-400 pt-2">
                    Accuracy: {Math.round((quizScore / questions.length) * 100)}%
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
                    <div className="text-2xl font-black text-emerald-400">{knownQuestions.size}</div>
                    <div className="text-xs text-slate-400 font-medium">Mastered</div>
                  </div>
                  <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
                    <div className="text-2xl font-black text-amber-400">{reviewQuestions.size}</div>
                    <div className="text-xs text-slate-400 font-medium">Review Needed</div>
                  </div>
                </div>
              )}

              <Button
                onClick={() => {
                  setCurrentIndex(0);
                  setIsFlipped(false);
                  setIsCompleted(false);
                  setKnownQuestions(new Set());
                  setReviewQuestions(new Set());
                  setQuizScore(0);
                  setSelectedAnswerIndex(null);
                  setTimeLeft(30);
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 font-semibold shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Restart Session
              </Button>
            </div>
          ) : mode === 'presentation' ? (
            /* 🖥️ MODE 1: CLASSROOM PROJECTOR VIEW (Large Text, Presentation Controls) */
            <div className="w-full max-w-4xl bg-slate-900 border-2 border-blue-600/40 rounded-3xl p-8 flex flex-col justify-between shadow-2xl min-h-[460px]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <span className="text-sm font-bold tracking-wider text-blue-400 uppercase flex items-center gap-2">
                  <Presentation className="w-4 h-4" /> Question #{currentIndex + 1}
                </span>
                <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full font-medium">
                  Type: {currentQuestion?.type || 'Multiple Choice'}
                </span>
              </div>

              {/* Large Font Stem for Classroom Projectors */}
              <div className="my-6 overflow-y-auto max-h-[340px] text-2xl font-semibold text-slate-100 leading-relaxed pr-2">
                <LatexRenderer content={getCleanStem(currentQuestion)} />

                {/* Option Choices */}
                {currentQuestion?.values && Array.isArray(currentQuestion.values) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 text-left">
                    {currentQuestion.values.map((opt: any, idx: number) => {
                      const letter = String.fromCharCode(65 + idx);
                      const isCorrect = checkIsOptionCorrect(currentQuestion, letter, idx, opt);
                      const text = typeof opt === 'string' ? opt.replace(/^[A-J][\.\)]\s*/, '') : opt?.text || '';

                      return (
                        <div
                          key={idx}
                          className={`p-4 rounded-2xl border flex items-start gap-4 transition-all ${
                            isFlipped && isCorrect
                              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-100 shadow-xl ring-2 ring-emerald-500/50'
                              : 'bg-slate-950/80 border-slate-800 text-slate-200'
                          }`}
                        >
                          <span className={`w-8 h-8 rounded-xl font-bold text-sm flex items-center justify-center flex-shrink-0 ${
                            isFlipped && isCorrect ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-slate-800 text-blue-400'
                          }`}>
                            {letter}
                          </span>
                          <div className="flex-1 text-lg font-medium"><LatexRenderer content={text} /></div>
                          {isFlipped && isCorrect && <Check className="w-6 h-6 text-emerald-400 flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Revealed Explanation */}
                {isFlipped && (currentQuestion?.sampleAnswer || currentQuestion?.feedback) && (
                  <div className="mt-6 p-5 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl text-base text-emerald-200 space-y-1 animate-fade-in">
                    <span className="font-bold text-emerald-400 uppercase tracking-wider block text-xs mb-1">Teacher Answer Key & Explanation:</span>
                    <LatexRenderer content={currentQuestion.sampleAnswer || currentQuestion.feedback} />
                  </div>
                )}
              </div>

              {/* Reveal Answer Action Button */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <Button
                  onClick={() => setIsFlipped((prev) => !prev)}
                  className={`px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${
                    isFlipped
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                  }`}
                >
                  <Eye className="w-4 h-4" /> {isFlipped ? 'Hide Answer Key' : 'Reveal Answer Key to Class'}
                </Button>

                <div className="text-xs text-slate-400 font-medium">
                  Press <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300 font-mono">Space</kbd> to toggle reveal
                </div>
              </div>
            </div>
          ) : mode === 'study' ? (
            /* 📚 MODE 2: SELF-STUDY 3D FLASHCARD VIEW */
            <div className="w-full max-w-3xl h-[460px] perspective-1000 relative">
              <div
                onClick={() => setIsFlipped((prev) => !prev)}
                className={`w-full h-full duration-500 transform-style-3d cursor-pointer relative transition-transform ${
                  isFlipped ? 'rotate-y-180' : ''
                }`}
                style={{
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* FRONT CARD */}
                <div
                  className="absolute inset-0 w-full h-full bg-slate-900 border-2 border-purple-500/40 rounded-3xl p-8 flex flex-col justify-between shadow-2xl"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-xs font-bold tracking-wider text-purple-400 uppercase flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4" /> Flashcard #{currentIndex + 1}
                    </span>
                    <span className="text-xs text-purple-300/80 bg-purple-950/60 border border-purple-800/40 px-3 py-1 rounded-full font-medium">
                      Click to Flip
                    </span>
                  </div>

                  <div className="my-auto overflow-y-auto max-h-[300px] text-xl text-slate-100 font-medium leading-relaxed pr-2">
                    <LatexRenderer content={getCleanStem(currentQuestion)} />

                    {currentQuestion?.values && Array.isArray(currentQuestion.values) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6 text-left">
                        {currentQuestion.values.map((opt: any, idx: number) => {
                          const letter = String.fromCharCode(65 + idx);
                          const text = typeof opt === 'string' ? opt.replace(/^[A-J][\.\)]\s*/, '') : opt?.text || '';
                          return (
                            <div key={idx} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-start gap-3 text-sm text-slate-300">
                              <span className="w-6 h-6 rounded-lg bg-purple-950 text-purple-400 font-bold text-xs flex items-center justify-center flex-shrink-0 border border-purple-800/40">
                                {letter}
                              </span>
                              <div className="flex-1"><LatexRenderer content={text} /></div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs text-slate-500">
                    <span>Active Recall Mode</span>
                    <span className="flex items-center gap-1 text-purple-400 font-semibold">
                      <RotateCw className="w-3.5 h-3.5" /> Flip to Answer ➔
                    </span>
                  </div>
                </div>

                {/* BACK CARD */}
                <div
                  className="absolute inset-0 w-full h-full bg-slate-950 border-2 border-emerald-500/40 rounded-3xl p-8 flex flex-col justify-between shadow-2xl"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <div className="flex items-center justify-between border-b border-emerald-900/40 pb-3">
                    <span className="text-xs font-bold tracking-wider text-emerald-400 uppercase flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Answer Key & Explanation
                    </span>
                    <span className="text-xs text-emerald-300/80 bg-emerald-950/60 px-3 py-1 rounded-full font-medium border border-emerald-800/40">
                      Answer Revealed
                    </span>
                  </div>

                  <div className="my-auto overflow-y-auto max-h-[300px] pr-2 space-y-4">
                    {currentQuestion?.values && Array.isArray(currentQuestion.values) ? (
                      <div className="grid grid-cols-1 gap-3">
                        {currentQuestion.values.map((opt: any, idx: number) => {
                          const letter = String.fromCharCode(65 + idx);
                          const isCorrect = checkIsOptionCorrect(currentQuestion, letter, idx, opt);
                          const text = typeof opt === 'string' ? opt.replace(/^[A-J][\.\)]\s*/, '') : opt?.text || '';

                          return (
                            <div
                              key={idx}
                              className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                                isCorrect
                                  ? 'bg-emerald-950/90 border-emerald-500 text-emerald-100 font-semibold shadow-lg shadow-emerald-950/50'
                                  : 'bg-slate-900/40 border-slate-800 text-slate-400 opacity-60'
                              }`}
                            >
                              <span className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center flex-shrink-0 ${
                                isCorrect ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {letter}
                              </span>
                              <div className="flex-1 text-sm"><LatexRenderer content={text} /></div>
                              {isCorrect && <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 bg-emerald-950/50 border border-emerald-800/40 rounded-xl text-emerald-300 font-semibold text-center">
                        Correct Answer: {currentQuestion?.CorrectAnswer || 'N/A'}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs text-slate-500">
                    <span>Card {currentIndex + 1} of {questions.length}</span>
                    <span className="text-slate-400">Click to flip back</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ⚡ MODE 3: RAPID-FIRE INTERACTIVE QUIZ MODE */
            <div className="w-full max-w-3xl bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-8 flex flex-col justify-between shadow-2xl min-h-[460px]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold tracking-wider text-amber-400 uppercase flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> Timed Quiz Question #{currentIndex + 1}
                </span>
                <span className="text-xs font-semibold text-amber-300 bg-amber-950/60 border border-amber-800/40 px-3 py-1 rounded-full">
                  Score: {quizScore}
                </span>
              </div>

              <div className="my-auto overflow-y-auto max-h-[320px] text-lg text-slate-100 font-medium leading-relaxed pr-2">
                <LatexRenderer content={getCleanStem(currentQuestion)} />

                {/* Interactive Choice Buttons */}
                {currentQuestion?.values && Array.isArray(currentQuestion.values) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6 text-left">
                    {currentQuestion.values.map((opt: any, idx: number) => {
                      const letter = String.fromCharCode(65 + idx);
                      const isCorrect = checkIsOptionCorrect(currentQuestion, letter, idx, opt);
                      const isSelected = selectedAnswerIndex === idx;
                      const text = typeof opt === 'string' ? opt.replace(/^[A-J][\.\)]\s*/, '') : opt?.text || '';

                      let style = "bg-slate-950/80 border-slate-800 hover:border-amber-500/60 text-slate-200";
                      if (selectedAnswerIndex !== null) {
                        if (isCorrect) {
                          style = "bg-emerald-950/90 border-emerald-500 text-emerald-100 font-bold shadow-lg shadow-emerald-950/50 ring-2 ring-emerald-500/50";
                        } else if (isSelected) {
                          style = "bg-red-950/90 border-red-500 text-red-100 shadow-lg shadow-red-950/50";
                        } else {
                          style = "bg-slate-950/40 border-slate-800 text-slate-500 opacity-50";
                        }
                      }

                      return (
                        <button
                          key={idx}
                          disabled={selectedAnswerIndex !== null}
                          onClick={() => handleQuizAnswerSelect(idx, letter, opt)}
                          className={`p-4 rounded-xl border flex items-start gap-3 transition-all text-left ${style}`}
                        >
                          <span className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center flex-shrink-0 ${
                            selectedAnswerIndex !== null && isCorrect
                              ? 'bg-emerald-500 text-slate-950 font-black'
                              : isSelected
                              ? 'bg-red-500 text-white font-black'
                              : 'bg-slate-800 text-amber-400'
                          }`}>
                            {letter}
                          </span>
                          <div className="flex-1 text-sm font-medium"><LatexRenderer content={text} /></div>
                          {selectedAnswerIndex !== null && isCorrect && <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
                          {selectedAnswerIndex !== null && isSelected && !isCorrect && <X className="w-5 h-5 text-red-400 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs text-slate-400">
                <span>{selectedAnswerIndex === null ? 'Click any choice to answer' : 'Answer recorded! Click Next to continue.'}</span>
                <Button
                  onClick={handleNext}
                  className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl gap-2 text-xs font-semibold px-4 py-1.5"
                >
                  Next Question <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between z-20">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentIndex === 0 || isCompleted}
            className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl gap-2 text-xs font-semibold"
          >
            <ChevronLeft className="w-4 h-4" /> Previous (←)
          </Button>

          {/* Self-Study Evaluation Buttons */}
          {mode === 'study' && !isCompleted && (
            <div className="flex items-center gap-3">
              <Button
                onClick={() => handleMarkKnowledge(false)}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl gap-1.5 text-xs font-semibold"
              >
                <X className="w-4 h-4 text-amber-400" /> Still Learning
              </Button>
              <Button
                onClick={() => handleMarkKnowledge(true)}
                className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl gap-1.5 text-xs font-semibold"
              >
                <Check className="w-4 h-4 text-emerald-400" /> Got It Right!
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {mode !== 'quiz' && (
              <Button
                onClick={() => setIsFlipped((prev) => !prev)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" /> Flip Card (Space)
              </Button>
            )}

            <Button
              onClick={handleNext}
              disabled={isCompleted}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl gap-2 text-xs font-semibold shadow-lg shadow-blue-600/30"
            >
              Next (→) <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
