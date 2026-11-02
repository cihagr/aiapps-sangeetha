import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"

import { DOCUMENT_CHAT_API_URL } from "@/config";

const API_BASE_URL = DOCUMENT_CHAT_API_URL;

const checkRemainingTokens = async (appcodeOverride?: string) => {
  try {
    // Debug: Log all session storage items
    // console.log('Session Storage:', {
    //   username: sessionStorage.getItem('username'),
    //   password: sessionStorage.getItem('password') ? '***' : 'not found',
    //   allItems: Object.keys(sessionStorage).reduce((obj, key) => {
    //     obj[key] = key.includes('password') ? '***' : sessionStorage.getItem(key);
    //     return obj;
    //   }, {} as Record<string, any>)
    // });

    // Get credentials from session storage with fallback to hardcoded values
    const username = sessionStorage.getItem('username') || 'adminshiva';
    const password = sessionStorage.getItem('password') || 'School';
    const appcode = appcodeOverride || 'Doc_Chat';

    //console.log('Using credentials:', { username, password: '***', appcode });

    const params = new URLSearchParams({
      username,
      password,
      appcode
    });

    //console.log('API URL:', `${API_BASE_URL}/remaining_tokens?${params.toString().replace(/password=[^&]*/, 'password=***')}`);

    const response = await fetch(`${API_BASE_URL}/remaining_tokens?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    //console.log('Token data received:', data); // Debug log
    return {
      remainingTokens: data.remaining_tokens,
      totalTokens: data.total_token
    };
  } catch (error) {
    console.error('Error checking remaining tokens:', error);
    throw error;
  }
};
import {
  ArrowLeft,
  MessageSquare,
  BookOpen,
  Send,
  Sparkles,
  Loader2,
  Bot,
  User,
  Copy,
  Download,
  Menu
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import ncertBookImage from "@/assets/images/ncert.jpg"
import mobyDickImg from '@/assets/images/mobydick.jpg';
import ncertImg from '@/assets/images/ncert.jpg';
import presalesImg from '@/assets/images/presales.jpg';
import { PageLoader } from "@/components/ui/loader";
interface Message {
  role: "user" | "assistant"
  content: string
  type?: "text" | "chapter-list" | "summary" | "questions" | "lesson-plan"
  data?: any
}

interface DocChatNCERTProps {
  isMobyDick?: boolean;
}

const DocChatNCERT: React.FC<DocChatNCERTProps> = ({ isMobyDick = false }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I'm your ClassVII_science_full textbook assistant. I can help you with:\n\n• Generate chapter list from the book\n• Summarize specific chapters\n• Create practice questions\n• Generate lesson plans\n• Answer any questions about the content\n\nJust ask me what you'd like to do!",
      type: "text"
    }
  ])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [tokenCount, setTokenCount] = useState<number | null>(null)
  const [remainingTokens, setRemainingTokens] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  // Book details state
  const [bookName, setBookName] = useState('ClassVII_science_full');
  const [author, setAuthor] = useState('NCERT');
  const [imgSrc, setImgSrc] = useState(ncertBookImage);
  const [publisher, setPublisher] = useState('NCERT, New Delhi');
  const textareaRef = useState<HTMLTextAreaElement | null>(null)[0]

  // Book details mapping based on path
  const bookMappings = {
    'testing_ncert': {
      bookName: 'ClassVII_science_full',
      author: 'NCERT',
      imgSrc: ncertImg,
      publisher: 'NCERT, New Delhi',
      class: 'VII (seventh)',
      subject: 'Science',
      Chapters: 13,
      pages: 167,
      Edition: '2023-24',
    },
    'faiss_index': {
      bookName: 'Moby Dick',
      author: 'Herman Melville',
      imgSrc: mobyDickImg,
      publisher: 'Harper & Brothers',
      class: 'VII (seventh)',
      subject: 'Science',
      Chapters: 13,
      pages: 368,
      Edition: '2023-24',
    },
    'faiss_index_presales': {
      bookName: 'Presales Documents',
      author: 'Excelsoft Technologies',
      imgSrc: presalesImg,
      publisher: 'Excelsoft Technologies',
      class: 'VII (seventh)',
      subject: 'Science',
      Chapters: 13,
      pages: 368,
      Edition: '2023-24',
    }
  };

  // Set book details based on isMobyDick prop and handle initial load
  useEffect(() => {
    // Simulate initial API load (remove this in production or replace with actual API call)
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
    }, 1500); // 1.5 second loading time for initial page load

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isMobyDick) {
      // Set Moby Dick book details
      const mobyDickBook = bookMappings['faiss_index'];
      setBookName(mobyDickBook.bookName);
      setAuthor(mobyDickBook.author);
      setImgSrc(mobyDickBook.imgSrc);
      setPublisher(mobyDickBook.publisher);
      return;
    }

    // For non-Moby Dick, load from config
    const fetchConfig = async () => {
      try {
        // Fetch from /env.json in the public directory
        const response = await fetch('/env.json');
        if (!response.ok) throw new Error('Failed to fetch config');

        const config = await response.json();
        //console.log('Loaded config:', config);

        // Set book details based on path from config
        if (config.path) {
          const path = config.path.trim();
          //console.log('Looking for book with path:', path);

          const book = bookMappings[path as keyof typeof bookMappings];
          if (book) {
            //console.log('Found book mapping:', book);
            setBookName(book.bookName);
            setAuthor(book.author);
            setImgSrc(book.imgSrc);
            setPublisher(book.publisher || 'Unknown');
          } else {
            console.warn(`No book mapping found for path: ${path}`);
          }
        }
      } catch (error) {
        console.error('Error loading config:', error);
        // Fallback to default values
        setBookName('NCERT Biology');
        setAuthor('NCERT');
        setImgSrc(ncertBookImage);
        setPublisher('NCERT, New Delhi');
      }
    };

    fetchConfig();
  }, [isMobyDick]);

  // State for token information
  const [totalTokens, setTotalTokens] = useState<number | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState<boolean>(true);

  // Fetch remaining tokens when component mounts and when messages change
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setIsTokenLoading(true);
        const appcode = isMobyDick ? 'Doc_Chat_D' : 'Doc_Chat';
        const data = await checkRemainingTokens(appcode);
        //console.log('Fetched token data:', data);

        // Ensure we have valid numbers and update both states
        const remaining = Number(data.remainingTokens) || 0;
        const total = Number(data.totalTokens) || 0;

        //console.log('Setting tokens - Remaining:', remaining, 'Total:', total);

        // Update both token count and remaining tokens
        setTokenCount(remaining);
        setRemainingTokens(remaining);
        setTotalTokens(total);
      } catch (error) {
        console.error('Failed to fetch token count:', error);
        setTokenCount(0);
        setRemainingTokens(0);
        setTotalTokens(0);
      } finally {
        setIsTokenLoading(false);
      }
    };

    fetchTokens();
    // Set up interval to refresh token count every 30 seconds
    const interval = setInterval(fetchTokens, 30000);

    // Clean up interval on component unmount
    return () => clearInterval(interval);
  }, []);

  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value)
    adjustTextareaHeight(e.target)
  }

  const detectIntentAndRespond = (userInput: string) => {
    const input = userInput.toLowerCase()

    // Chapter list generation
    if (input.includes("chapter") && (input.includes("list") || input.includes("generate") || input.includes("show"))) {
      return {
        type: "chapter-list",
        content: "Here's the complete chapter list from the NCERT Biology Class 11 textbook:",
        data: [
          { id: 1, title: "The Living World", pages: "1-15" },
          { id: 2, title: "Biological Classification", pages: "16-35" },
          { id: 3, title: "Plant Kingdom", pages: "36-58" },
          { id: 4, title: "Animal Kingdom", pages: "59-85" },
          { id: 5, title: "Morphology of Flowering Plants", pages: "86-112" },
          { id: 6, title: "Anatomy of Flowering Plants", pages: "113-138" },
          { id: 7, title: "Structural Organization in Animals", pages: "139-165" },
          { id: 8, title: "Cell: The Unit of Life", pages: "166-195" }
        ]
      }
    }

    // Chapter summary
    if (input.includes("summar")) {
      const chapterMatch = input.match(/chapter\s*(\d+)|(\d+)\s*chapter/i)
      const chapterNum = chapterMatch ? parseInt(chapterMatch[1] || chapterMatch[2]) : 1

      const chapters = [
        "The Living World",
        "Biological Classification",
        "Plant Kingdom",
        "Animal Kingdom",
        "Morphology of Flowering Plants",
        "Anatomy of Flowering Plants",
        "Structural Organization in Animals",
        "Cell: The Unit of Life"
      ]

      return {
        type: "summary",
        content: `Summary of Chapter ${chapterNum}: ${chapters[chapterNum - 1] || chapters[0]}`,
        data: `This chapter introduces fundamental concepts about ${(chapters[chapterNum - 1] || chapters[0]).toLowerCase()}. It begins with defining key terminology and explores the historical development of our understanding in this area.

**Key Points:**
• Definition and scope of the topic
• Historical perspectives and major contributors
• Classification systems and methodology
• Practical applications and examples
• Contemporary relevance and importance

The chapter concludes with exercises designed to reinforce understanding of these critical biological concepts.`
      }
    }

    // Question generation
    if (input.includes("question") || input.includes("practice") || input.includes("quiz")) {
      return {
        type: "questions",
        content: "Here are practice questions generated from the NCERT textbook:",
        data: [
          "1. What are the defining characteristics of living organisms?",
          "2. Explain the biological classification system with examples.",
          "3. Compare and contrast the plant and animal kingdoms.",
          "4. Describe the morphology of a typical flowering plant.",
          "5. What is the importance of anatomical studies in biology?",
          "6. How do cells function as the basic unit of life?",
          "7. Discuss the structural organization in different animal phyla.",
          "8. What role does taxonomy play in biological classification?"
        ]
      }
    }

    // Lesson plan
    if (input.includes("lesson") && input.includes("plan")) {
      return {
        type: "lesson-plan",
        content: "Here's a comprehensive lesson plan based on the NCERT textbook:",
        data: `**Lesson Plan: Introduction to Biology**
Duration: 60 minutes | Grade Level: Class 11 | Subject: Biology

**Learning Objectives:**
• Students will understand the basic concepts of living organisms
• Students will be able to identify different classification systems
• Students will apply their knowledge to real-world examples

**Materials Needed:**
• NCERT Biology Textbook
• Chart papers and markers
• Projector for presentations
• Sample specimens (if available)

**Lesson Structure:**

Introduction (10 minutes):
- Begin with a thought-provoking question about life
- Discuss students' prior knowledge
- Present learning objectives

Main Content (35 minutes):
- Direct instruction on key concepts (15 mins)
- Group activity: Classification exercise (10 mins)
- Discussion and Q&A (10 mins)

Assessment (10 minutes):
- Quick formative assessment through questions
- Exit ticket with key concept review

**Homework:**
- Read next chapter and prepare questions
- Complete exercise problems from textbook

**Extension Activities:**
- Research project on local biodiversity
- Create a classification chart for organisms`
      }
    }

    // Default response
    return {
      type: "text",
      content: `Based on the NCERT textbook, here's information about "${userInput}":\n\nThis topic is covered comprehensively in the textbook. The content explains key concepts and provides detailed examples to help students understand the fundamental principles. For specific chapters and detailed explanations, please refer to the relevant sections of the book.\n\nWould you like me to:\n• Show you the chapter list?\n• Summarize a specific chapter?\n• Generate practice questions?\n• Create a lesson plan?`
    }
  }

  const isGeneralKnowledgeQuestion = (question: string): boolean => {
    // Specific keywords and phrases to match
    const specificPatterns = [
      // Political terms
      /(prime minister of india|founder|pm of india|narendra modi|prime minister|chief minister|president|ceo|minister|leader|chancellor)/i,
      /(political party|ruling party|opposition party)/i,
      /(government|administration|parliament|congress|senate)/i,

      // Geography terms
      /(capital city|largest city|population|area|country|countries)/i,
      /(bordering|neighboring|neighbouring|continent|ocean|sea)/i,
      // Festival and holiday terms
      /(diwali|deepavali|eid|christmas|holi|easter|ramadan|thanksgiving)/i,
      /(festival|holiday|celebration|tradition|custom)/i,

      // Current events and time-related
      /(current affairs|news|headlines|today's news)/i,
      /(current year|current date|today's date|this year)/i,

      // Math problems and calculations
      /\d+\s*[+\-*/^]\s*\d+/i,  // Basic arithmetic: 2+2, 5*3, 10/2
      /(solve|calculate|what is|what's) \d+/i,
      /(addition|subtraction|multiplication|division)\b/i,
      /(algebra|geometry|calculus|trigonometry|equation|formula)\b/i,
      /\b(\d+\s*[+\-*/]\s*)+\d+\s*[=?]/i,  // Multiple operations: 2+3*4=?

      // Common general knowledge terms
      /(famous person|celebrity|actor|actress|singer|sports star)/i,
      /(invention|discovery|scientific breakthrough)/i,
      /(world record|guinness|olympics|world cup)/i
    ];

    // Check if any specific pattern is found in the question
    return specificPatterns.some(pattern => pattern.test(question));
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage.trim();

    // Add user message to chat
    setMessages(prev => [...prev, { role: "user", content: userMessage, type: "text" }]);
    setInputMessage("");

    // Check for general knowledge questions
    if (isGeneralKnowledgeQuestion(userMessage)) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "I am still learning. Currently I am trained on handling queries on this book.",
        type: "text"
      }]);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${DOCUMENT_CHAT_API_URL}/ask_question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: userMessage,
          chat_history: [],
          selected_values: [],
          username: sessionStorage.getItem('username') || 'adminshiva',
          password: sessionStorage.getItem('password') || 'School',
          appcode: isMobyDick ? "Doc_Chat_D" : "Doc_Chat",
          path: isMobyDick ? "faiss_index" : "testing_ncert"
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();

      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer || "I received an empty response from the server.",
        type: "text"
      }]);

    } catch (error) {
      console.error('Error calling API:', error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I encountered an error processing your request. Please try again later.",
        type: "text"
      }]);

      toast({
        title: "Error",
        description: "Failed to get response from the server.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleCopyContent = (content: string) => {
    navigator.clipboard.writeText(content)
    toast({
      title: "Copied to clipboard",
      description: "Content has been copied successfully."
    })
  }

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.URL.revokeObjectURL(url)

    toast({
      title: "Downloaded",
      description: "Content has been downloaded successfully."
    })
  }

  const renderMessageContent = (message: Message) => {
    if (message.type === "chapter-list" && message.data) {
      return (
        <div className="space-y-3">
          <p className="text-sm mb-3">{message.content}</p>
          <div className="space-y-2">
            {message.data.map((chapter: any) => (
              <Card key={chapter.id} className="bg-white border border-purple-200">
                <CardContent className="p-3 flex items-center gap-3">
                  <Badge className="bg-purple-600 text-white">{chapter.id}</Badge>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm">{chapter.title}</h3>
                    <p className="text-xs text-gray-600">Pages {chapter.pages}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )
    }

    if (message.type === "summary" && message.data) {
      return (
        <div className="space-y-3">
          <p className="text-sm font-semibold mb-2">{message.content}</p>
          <div className="bg-white border border-purple-200 rounded-lg p-4">
            <pre className="whitespace-pre-wrap text-xs font-sans text-gray-800">{message.data}</pre>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyContent(message.data)}
              className="text-xs"
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload(message.data, "chapter-summary.txt")}
              className="text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          </div>
        </div>
      )
    }

    if (message.type === "questions" && message.data) {
      return (
        <div className="space-y-3">
          <p className="text-sm mb-2">{message.content}</p>
          <div className="space-y-2">
            {message.data.map((question: string, index: number) => (
              <div
                key={index}
                className="p-3 bg-white border border-orange-200 rounded-lg"
              >
                <p className="text-xs text-gray-900">{question}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyContent(message.data.join('\n\n'))}
              className="text-xs"
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload(message.data.join('\n\n'), "practice-questions.txt")}
              className="text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          </div>
        </div>
      )
    }

    if (message.type === "lesson-plan" && message.data) {
      return (
        <div className="space-y-3">
          <p className="text-sm font-semibold mb-2">{message.content}</p>
          <div className="bg-white border border-pink-200 rounded-lg p-4">
            <pre className="whitespace-pre-wrap text-xs font-sans text-gray-800">{message.data}</pre>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyContent(message.data)}
              className="text-xs"
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload(message.data, "lesson-plan.txt")}
              className="text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          </div>
        </div>
      )
    }

    return <p className="text-sm whitespace-pre-wrap">{message.content}</p>
  }

  const BookDetailsContent = () => (
    <div className="p-4 space-y-4 bg-muted h-full">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-purple-600 text-white rounded-lg">
          <BookOpen className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Book Information</h2>
        </div>
      </div>

      {/* Book Cover */}
      <div className="relative">
        <img
          src={imgSrc}
          alt={bookName}
          className="w-full h-64 object-cover rounded-lg shadow-lg border border-border"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = ncertBookImage; // Fallback to default image
          }}
        />
      </div>

      {/* Book Details */}
      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-base font-bold text-gray-900 mb-0.5">{bookName}</h3>
          <p className="text-xs text-gray-600">{author}</p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-700 min-w-[70px]">Publisher:</span>
            <span className="text-xs text-gray-600">{publisher}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-700 min-w-[70px]">Subject:</span>
            <span className="text-xs text-gray-600">{bookMappings.testing_ncert.subject}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-700 min-w-[70px]">Class:</span>
            <span className="text-xs text-gray-600">{bookMappings.testing_ncert.class}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-700 min-w-[70px]">Edition:</span>
            <span className="text-xs text-gray-600">{bookMappings.testing_ncert.Edition}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-700 min-w-[70px]">Total Pages:</span>
            <span className="text-xs text-gray-600">{bookMappings.testing_ncert.pages} Pages</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-700 min-w-[70px]">Chapters:</span>
            <span className="text-xs text-gray-600">{bookMappings.testing_ncert.Chapters} Chapters</span>
          </div>
        </div>
      </div>
    </div>
  )

  // Show loading indicator during initial load
  if (isInitialLoad) {
    return (
      <PageLoader text="Loading tools..." />
      // <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      //   <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
      //     <div className="flex flex-col items-center justify-center space-y-4">
      //       <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      //       <div className="space-y-2">
      //         <h2 className="text-2xl font-semibold text-gray-800">Loading Stats...</h2>
      //       </div>
      //     </div>
      //   </div>
      // </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Hamburger Menu for Mobile */}
            <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Book Details</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-full">
                  <BookDetailsContent />

                </ScrollArea>
              </SheetContent>
            </Sheet>

            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900"> {!isMobyDick ? 'Doc Chat - NCERT' : 'Doc Chat - MOBYDICK'}</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Interactive AI-powered textbook assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg border border-purple-200">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-600">
                {!isTokenLoading && tokenCount !== null && totalTokens !== null
                  ? `Remaining Tokens: ${remainingTokens.toLocaleString()}`
                  : 'Loading tokens...'}
              </span>
            </div>
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="hover:bg-accent hover:text-accent-foreground">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back to Dashboard</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content - Split Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Book Info - Hidden on mobile */}
        <aside className="hidden md:flex w-80 bg-white border-r border-gray-200 flex-col overflow-y-auto">
          <BookDetailsContent />
        </aside>

        {/* Right Section - Chat Interface */}
        <main className="flex-1 flex flex-col bg-gradient-to-b from-gray-50 to-white">
          {/* Chat Header */}
          <div className="px-6 py-3 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-600 text-white rounded-lg">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{!isMobyDick ? 'Chat with NCERT Textbook' : 'Chat with MOBYDICK Textbook'}</h2>
                <p className="text-xs text-gray-600">Ask questions, generate summaries or create study materials</p>
              </div>
            </div>
          </div>

          {/* Chat Messages - Scrollable Area */}
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-4 py-4 max-w-4xl mx-auto">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-lg p-4 ${message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-gray-200 shadow-sm text-gray-900"
                      }`}
                  >
                    {renderMessageContent(message)}
                  </div>
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                //<PageLoader text="Loading tools..." />
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          {/* Chat Input - Fixed at Bottom */}
          <div className="px-6 py-4 border-t border-gray-200 bg-white">
            <div className="max-w-4xl mx-auto flex gap-2 items-end">
              <Textarea
                placeholder="Ask about chapters, summaries, questions or lesson plans..."
                value={inputMessage}
                onChange={handleTextareaChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                className="flex-1 min-h-[44px] max-h-[200px] resize-none"
                rows={1}
              />

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleSendMessage}
                      disabled={isLoading || !inputMessage.trim()}
                      className="bg-purple-600 text-white h-[44px] disabled:cursor-not-allowed disabled:pointer-events-auto"
                    >
                      <Send className="h-4 w-4" />

                    </Button >
                  </TooltipTrigger>
                  <TooltipContent>
                    <p >Send</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default DocChatNCERT
