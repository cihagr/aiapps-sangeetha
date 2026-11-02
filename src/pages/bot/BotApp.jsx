import React, { useState, useEffect, useRef } from "react";
import AppShell from "./AppShell";
import { css as S } from "./css";
import { API_ENDPOINTS } from "../../config";
import {
  IconArrowLeft, IconBot, IconPlus, IconChat, IconChatBubble, IconSend,
  IconClose, IconChevronDown, IconChevronRight, IconBookOpen, IconGlobe,
  IconCheckCircle, IconMessageSquare, IconStar, IconActivity, IconUser,
} from "./icons";

const LANGUAGES = [
  { code: "en", name: "English", flag: "\uD83C\uDDFA\uD83C\uDDF8" },
  { code: "es", name: "Espa\u00f1ol", flag: "\uD83C\uDDEA\uD83C\uDDF8" },
  { code: "fr", name: "Fran\u00e7ais", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
  { code: "de", name: "Deutsch", flag: "\uD83C\uDDE9\uD83C\uDDEA" },
  { code: "zh", name: "\u4E2D\u6587", flag: "\uD83C\uDDE8\uD83C\uDDF3" },
  { code: "ja", name: "\u65E5\u672C\u8A9E", flag: "\uD83C\uDDEF\uD83C\uDDF5" },
];

const MOCK_COURSES = [
  { id: "1", title: "Advanced React Development", description: "Master advanced React patterns, hooks, and performance optimization techniques.", price: 149, duration: "8 weeks", level: "Advanced", rating: 4.9, students: 2847, instructor: "Sarah Chen", skills: ["React Hooks", "Context API", "Performance", "Testing"], nextStart: "2024-02-15" },
  { id: "2", title: "Full-Stack Development Bootcamp", description: "Complete web development course covering frontend, backend, and deployment.", price: 199, duration: "12 weeks", level: "Intermediate", rating: 4.8, students: 1923, instructor: "Michael Rodriguez", skills: ["React", "Node.js", "MongoDB", "AWS"], nextStart: "2024-02-20" },
  { id: "3", title: "AI & Machine Learning Fundamentals", description: "Learn the foundations of AI and ML with hands-on Python projects.", price: 179, duration: "10 weeks", level: "Beginner", rating: 4.7, students: 3156, instructor: "Dr. Emma Watson", skills: ["Python", "TensorFlow", "Data Science", "Neural Networks"], nextStart: "2024-02-10" },
  { id: "4", title: "JavaScript Mastery", description: "Deep dive into modern JavaScript, ES6+, async programming, and advanced concepts.", price: 99, duration: "6 weeks", level: "Intermediate", rating: 4.6, students: 4521, instructor: "Alex Thompson", skills: ["ES6+", "Async/Await", "Modules", "Debugging"], nextStart: "2024-02-12" },
  { id: "5", title: "UI/UX Design Principles", description: "Learn design thinking, user research, prototyping, and modern design tools.", price: 129, duration: "7 weeks", level: "Beginner", rating: 4.8, students: 2134, instructor: "Lisa Park", skills: ["Figma", "User Research", "Prototyping", "Design Systems"], nextStart: "2024-02-18" },
];

const greeting = () => ([{
  id: "1", type: "bot",
  content: "Hello! I'm EduBot, your AI learning assistant. I can help you with course enrollment, provide personalized tutoring, answer questions in multiple languages, and connect you with live support when needed. How can I assist you today?",
  sentiment: "positive", category: "general",
  actions: [
    { label: "Browse Courses", action: "browse_courses", type: "primary" },
    { label: "Get Tutoring Help", action: "tutoring", type: "secondary" },
    { label: "FAQ", action: "faq", type: "secondary" },
  ],
}]);

const initialConversations = () => ([
  { id: "c1", title: "Course enrollment help", preview: "Which React course should I take?", time: "2h ago", status: "resolved",
    messages: [
      ...greeting(),
      { id: "c1a", type: "user", content: "Which React course should I take?", sentiment: "neutral" },
      { id: "c1b", type: "bot", category: "course_inquiry", sentiment: "positive", content: "Based on your JavaScript background, I'd recommend Advanced React Development ($149). Want to see the full catalog?", actions: [{ label: "Browse Courses", action: "browse_courses", type: "primary" }] },
    ] },
  { id: "c2", title: "Password reset", preview: "I can't log into my account", time: "1d ago", status: "resolved",
    messages: [
      ...greeting(),
      { id: "c2a", type: "user", content: "I can't log into my account", sentiment: "negative" },
      { id: "c2b", type: "bot", category: "faq", sentiment: "positive", content: "I can help you reset your password! Go to the login page, click 'Forgot Password', and check your email for the reset link.", actions: [{ label: "Contact Support", action: "connect_live", type: "secondary" }] },
    ] },
  { id: "c3", title: "Pricing question", preview: "How much are the bootcamps?", time: "3d ago", status: "open",
    messages: [
      ...greeting(),
      { id: "c3a", type: "user", content: "How much are the bootcamps?", sentiment: "neutral" },
      { id: "c3b", type: "bot", category: "general", sentiment: "positive", content: "Our courses range from $49\u2013$199 with a 30-day money-back guarantee and lifetime access. Want pricing for a specific course?" },
    ] },
]);

function detectSentiment(text) {
  const t = text.toLowerCase();
  const pos = ["great", "awesome", "excellent", "perfect", "love", "amazing", "helpful"];
  const neg = ["frustrated", "annoyed", "terrible", "awful", "hate", "confused", "stuck"];
  if (neg.some((w) => t.includes(w))) return "negative";
  if (pos.some((w) => t.includes(w))) return "positive";
  return "neutral";
}

function getBotResponse(input, lang, frustrationLevel) {
  const t = input.toLowerCase();
  const pick = (o) => o[lang] || o.en;
  const now = Date.now() + "";
  if (t.includes("course") || t.includes("enroll") || t.includes("learn")) {
    return { id: now, type: "bot", category: "course_inquiry", sentiment: "positive", language: lang,
      content: pick({
        en: "I'd love to help you find the perfect course! Based on your learning history with React and JavaScript, I recommend:\n\n\uD83D\uDE80 Advanced React Development ($149)\n\uD83D\uDCCA Full-Stack Development ($199)\n\uD83E\uDD16 AI & Machine Learning ($179)\n\nWould you like me to pre-fill your enrollment form with your basic information?",
        es: "\u00A1Me encantar\u00eda ayudarte a encontrar el curso perfecto! Bas\u00e1ndome en tu historial de React y JavaScript, recomiendo:\n\n\uD83D\uDE80 Desarrollo Avanzado de React ($149)\n\uD83D\uDCCA Desarrollo Full-Stack ($199)\n\uD83E\uDD16 IA y Aprendizaje Autom\u00e1tico ($179)\n\n\u00bfTe gustar\u00eda que complete previamente tu formulario de inscripci\u00f3n?",
        fr: "J'aimerais vous aider \u00e0 trouver le cours parfait ! Bas\u00e9 sur votre historique avec React et JavaScript, je recommande :\n\n\uD83D\uDE80 D\u00e9veloppement React Avanc\u00e9 (149$)\n\uD83D\uDCCA D\u00e9veloppement Full-Stack (199$)\n\uD83E\uDD16 IA et Machine Learning (179$)\n\nVoulez-vous que je pr\u00e9-remplisse votre formulaire d'inscription ?",
      }),
      actions: [
        { label: lang === "es" ? "Ver Cursos" : lang === "fr" ? "Voir les Cours" : "View Courses", action: "browse_courses", type: "primary" },
        { label: lang === "es" ? "Inscribirse Ahora" : lang === "fr" ? "S'inscrire" : "Enroll Now", action: "browse_courses", type: "primary" },
      ] };
  }
  if (t.includes("tutor") || t.includes("help with") || t.includes("exercise") || t.includes("lesson")) {
    return { id: now, type: "bot", category: "tutor_support", sentiment: "positive", language: lang,
      content: pick({
        en: "I see you're working on React! Based on your progress, here are some personalized suggestions:\n\n\uD83D\uDCDA Next up: React Hooks Deep Dive\n\uD83D\uDD27 Practice: Build a Todo App with useReducer\n\uD83D\uDCA1 Related: State Management with Context API\n\nI remember you completed JavaScript Fundamentals - great foundation! Would you like a custom practice exercise?",
        es: "\u00A1Veo que est\u00e1s trabajando en React! Aqu\u00ed tienes algunas sugerencias personalizadas:\n\n\uD83D\uDCDA Siguiente: Profundizaci\u00f3n en React Hooks\n\uD83D\uDD27 Pr\u00e1ctica: App de Tareas con useReducer\n\uD83D\uDCA1 Relacionado: Gesti\u00f3n de Estado con Context API",
        fr: "Je vois que vous travaillez sur React ! Voici quelques suggestions personnalis\u00e9es :\n\n\uD83D\uDCDA Suivant : React Hooks\n\uD83D\uDD27 Pratique : App Todo avec useReducer\n\uD83D\uDCA1 Connexe : Context API",
      }),
      actions: [
        { label: lang === "es" ? "Ejercicio Personalizado" : lang === "fr" ? "Exercice" : "Custom Exercise", action: "custom_exercise", type: "primary" },
        { label: lang === "es" ? "Ver Recursos" : lang === "fr" ? "Ressources" : "View Resources", action: "view_resources", type: "secondary" },
      ] };
  }
  if (t.includes("password") || t.includes("reset") || t.includes("login") || t.includes("account")) {
    return { id: now, type: "bot", category: "faq", sentiment: "positive", language: lang,
      content: pick({
        en: "I can help you reset your password! Here's how:\n\n1. Go to the login page\n2. Click 'Forgot Password'\n3. Enter your email address\n4. Check your email for the reset link\n\nIf you don't receive the email within 5 minutes, check your spam folder. Still having trouble?",
        es: "\u00A1Puedo ayudarte a restablecer tu contrase\u00f1a!\n\n1. Ve a la p\u00e1gina de inicio de sesi\u00f3n\n2. Haz clic en 'Olvid\u00e9 mi contrase\u00f1a'\n3. Ingresa tu email\n4. Revisa tu email para el enlace",
        fr: "Je peux vous aider \u00e0 r\u00e9initialiser votre mot de passe !\n\n1. Allez \u00e0 la page de connexion\n2. Cliquez sur 'Mot de passe oubli\u00e9'\n3. Entrez votre email\n4. V\u00e9rifiez votre email",
      }),
      actions: [{ label: lang === "es" ? "Contactar Soporte" : lang === "fr" ? "Contacter le Support" : "Contact Support", action: "connect_live", type: "secondary" }] };
  }
  if (frustrationLevel >= 2 || t.includes("frustrated") || t.includes("not working") || t.includes("terrible")) {
    return { id: now, type: "bot", category: "escalation", sentiment: "positive", language: lang,
      content: pick({
        en: "I understand your frustration, and I want to make sure you get the help you need. Let me connect you with one of our live support specialists.\n\n\uD83D\uDCDE Live Chat: Available now\n\uD83C\uDFAF Average response time: 2 minutes\n\nWould you like me to connect you now?",
        es: "Entiendo tu frustraci\u00f3n. Perm\u00edteme conectarte con uno de nuestros especialistas de soporte en vivo.\n\n\uD83D\uDCDE Chat en Vivo: Disponible ahora\n\uD83C\uDFAF Tiempo promedio: 2 minutos",
        fr: "Je comprends votre frustration. Permettez-moi de vous connecter avec un sp\u00e9cialiste du support en direct.\n\n\uD83D\uDCDE Chat en Direct : Disponible\n\uD83C\uDFAF Temps de r\u00e9ponse moyen : 2 minutes",
      }),
      actions: [
        { label: lang === "es" ? "Conectar Ahora" : lang === "fr" ? "Connecter" : "Connect Now", action: "connect_live", type: "primary" },
        { label: lang === "es" ? "Continuar Chat" : lang === "fr" ? "Continuer" : "Continue Chat", action: "continue_chat", type: "secondary" },
      ] };
  }
  return { id: now, type: "bot", category: "general", sentiment: "positive", language: lang,
    content: pick({
      en: "Thank you for your question! I'm here to provide personalized assistance. Given your background with React and JavaScript, I can offer tailored recommendations. Could you tell me more specifically what you'd like help with?",
      es: "\u00A1Gracias por tu pregunta! Estoy aqu\u00ed para brindarte asistencia personalizada. \u00bfPodr\u00edas decirme m\u00e1s espec\u00edficamente en qu\u00e9 te gustar\u00eda que te ayude?",
      fr: "Merci pour votre question ! Je suis l\u00e0 pour vous fournir une assistance personnalis\u00e9e. Pourriez-vous me dire plus sp\u00e9cifiquement avec quoi vous aimeriez de l'aide ?",
    }) };
}

const SENT_TONE = {
  positive: ["#dcfce7", "#166534"],
  negative: ["#fee2e2", "#991b1b"],
  neutral: ["#f1f5f9", "#475569"],
};
const levelChip = (lvl) => {
  const c = lvl === "Beginner" ? ["#f1f5f9", "#475569"] : lvl === "Intermediate" ? ["#dbeafe", "#1d4ed8"] : ["#fee2e2", "#991b1b"];
  return `display:inline-flex;flex:none;padding:2px 9px;border-radius:9999px;font-size:.625rem;font-weight:600;background:${c[0]};color:${c[1]}`;
};
const nowTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function BotApp() {
  const [bot, setBot] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState("en");
  const [showLang, setShowLang] = useState(false);
  const [convTitle, setConvTitle] = useState("New Conversation");
  const [context, setContext] = useState({ learningHistory: ["React Basics", "JavaScript Fundamentals"], frustrationLevel: 0 });
  const [conversations] = useState(initialConversations);
  const [messages, setMessages] = useState(greeting);
  const scrollRef = useRef(null);

  const scrollSoon = () => setTimeout(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, 60);

  // The bot this page is showing comes from get-bot-data, not from the browser.
  useEffect(() => {
    const load = async () => {
      try {
        const hashQ = (location.hash.split("?")[1]) || "";
        const id = new URLSearchParams(location.search).get("bot") || new URLSearchParams(hashQ).get("bot");
        const session = (key) => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
        let userInfo = {};
        try { userInfo = JSON.parse(session("userInfo") || "{}") || {}; } catch { userInfo = {}; }
        const res = await fetch(API_ENDPOINTS.GET_BOT_DATA, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            custcode: session("custcode") || userInfo.customerCode || userInfo.custCode || "",
            orgcode: session("orgcode") || userInfo.orgCode || userInfo.organizationcode || "",
            botid: Number(id) || 0,
            pageno: 1,
            pagesize: 200,
          }),
        });
        const json = await res.json().catch(() => null);
        const rows = res.ok && json && Array.isArray(json.results) ? json.results : [];
        const pick = (row, ...keys) => {
          for (const key of keys) if (row && row[key] !== undefined && row[key] !== null) return row[key];
          return undefined;
        };
        const row = rows.find((b) => String(pick(b, "bot_id", "botid", "id")) === String(id)) || rows[0];
        if (!row) return;
        setBot({
          id: pick(row, "bot_id", "botid", "id"),
          code: pick(row, "bot_code", "botcode") || "",
          title: pick(row, "bot_name", "botname", "name") || "",
          description: pick(row, "description") || "",
          knowledgeBase: pick(row, "knowledge_base_name", "knowledgebasename", "kbname") || "",
          status: String(pick(row, "bot_status", "botstatus", "status") || "DRAFT"),
        });
      } catch (e) {
        console.warn("Could not load the chat bot", e);
      }
    };
    load();
  }, []);

  useEffect(() => { scrollSoon(); }, [messages, isTyping, chatOpen]);

  const push = (msg) => setMessages((m) => [...m, msg]);

  const openConv = (id) => {
    const c = conversations.find((x) => x.id === id);
    if (!c) return;
    setConvTitle(c.title);
    setMessages(c.messages.map((m) => ({ ...m })));
    setChatOpen(true);
    setShowLang(false);
  };

  const newConv = () => {
    setConvTitle("New Conversation");
    setMessages(greeting());
    setChatOpen(true);
    setShowLang(false);
  };

  const send = () => {
    const v = inputValue.trim();
    if (!v) return;
    const sentiment = detectSentiment(v);
    const um = { id: Date.now() + "", type: "user", content: v, language: currentLanguage, sentiment };
    const nextFrustration = sentiment === "negative" ? context.frustrationLevel + 1 : context.frustrationLevel;
    if (sentiment === "negative") setContext((c) => ({ ...c, frustrationLevel: c.frustrationLevel + 1 }));
    setMessages((m) => [...m, um]);
    setInputValue("");
    setIsTyping(true);
    setTimeout(() => {
      const bm = getBotResponse(v, currentLanguage, nextFrustration);
      setMessages((m) => [...m, bm]);
      setIsTyping(false);
    }, 1500);
  };

  const handleAction = (action, courseId) => {
    if (action === "browse_courses" || action === "view_all_courses") {
      push({ id: Date.now() + "", type: "course_catalog", category: "course_inquiry",
        content: "Here are our most popular courses based on your learning history with React and JavaScript. Click on any course to view details and enrollment options:",
        courses: MOCK_COURSES });
      return;
    }
    if (action === "view_course_details" && courseId) {
      const c = MOCK_COURSES.find((x) => x.id === courseId);
      if (c) push({ id: Date.now() + "", type: "bot", category: "course_inquiry", sentiment: "positive",
        content: `\uD83D\uDCDA ${c.title} \u2014 Detailed Information\n\nWhat you'll learn:\n${c.description}\n\nCourse Highlights:\n\u2022 Duration: ${c.duration}\n\u2022 Level: ${c.level}\n\u2022 Rating: ${c.rating}/5 (${c.students.toLocaleString()} students)\n\u2022 Instructor: ${c.instructor}\n\u2022 Next cohort starts: ${c.nextStart}\n\nSkills you'll gain: ${c.skills.join(", ")}`,
        actions: [
          { label: `Enroll Now ($${c.price})`, action: "start_enrollment", type: "primary", courseId: c.id },
          { label: "Back to Catalog", action: "browse_courses", type: "secondary" },
        ] });
      return;
    }
    if (action === "start_enrollment" && courseId) {
      const c = MOCK_COURSES.find((x) => x.id === courseId);
      if (c) push({ id: Date.now() + "", type: "bot", category: "course_inquiry", sentiment: "positive",
        content: `\uD83C\uDFAF Starting Enrollment for ${c.title}\n\nStep 1: Pre-enrollment Information\n\u2022 Name: [From your account]\n\u2022 Email: [From your account]\n\u2022 Experience Level: Intermediate\n\nStep 2: Choose Payment Plan\n\u2022 Full Payment: $${c.price} (Save 10%)\n\u2022 3-Month Plan: $${Math.ceil(c.price / 3)}/month\n\u2022 6-Month Plan: $${Math.ceil(c.price / 6)}/month\n\nStep 3: Course starts ${c.nextStart}`,
        actions: [
          { label: "Complete Enrollment", action: "complete_enrollment", type: "primary", courseId: c.id },
          { label: "Pre-fill My Information", action: "prefill_form", type: "primary", courseId: c.id },
        ] });
      return;
    }
    if (action === "complete_enrollment") {
      const c = MOCK_COURSES.find((x) => x.id === courseId);
      push({ id: Date.now() + "", type: "system", category: "course_inquiry", content: `\uD83C\uDF89 Enrollment initiated for ${c ? c.title : "your course"}! Redirecting to secure enrollment form...` });
      return;
    }
    if (action === "prefill_form") {
      push({ id: Date.now() + "", type: "bot", category: "course_inquiry", sentiment: "positive",
        content: "\u2705 Information Pre-filled Successfully!\n\nI've automatically filled in your enrollment form with your account details, learning goals from our conversation, and experience level. You can review and modify anything before submitting.",
        actions: [{ label: "Review & Submit Form", action: "review_form", type: "primary" }] });
      return;
    }
    if (action === "connect_live") {
      push({ id: Date.now() + "", type: "system", category: "escalation", content: "\uD83D\uDCDE Connecting you to live support... Agent will be with you in ~30 seconds." });
      return;
    }
    push({ id: Date.now() + "", type: "system", category: "general", content: `Processing "${action}"... Feature coming soon!` });
  };

  const switchLanguage = (code) => {
    const name = (LANGUAGES.find((l) => l.code === code) || {}).name || "English";
    setCurrentLanguage(code);
    setShowLang(false);
    push({ id: Date.now() + "", type: "system", category: "general", content: `Language switched to ${name}. I'll continue in your preferred language while keeping all context.` });
  };

  const botName = (bot && bot.title) || "Chat Bot";
  const statusRaw = (bot && bot.status) || "Draft";
  const isActive = /active|publish/i.test(statusRaw);
  const statusLabel = isActive ? "Published" : "Draft";
  const knowledgeBase = (bot && bot.knowledgeBase) || "General";
  const description = (bot && bot.description) || "An AI assistant that answers questions using your configured knowledge base.";
  const curLang = LANGUAGES.find((l) => l.code === currentLanguage) || LANGUAGES[0];

  const statusChip = `display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:9999px;font-size:.75rem;font-weight:600;background:${isActive ? "#dcfce7" : "#f1f5f9"};color:${isActive ? "#166534" : "#475569"}`;
  const statusDot = `width:7px;height:7px;border-radius:50%;background:${isActive ? "#22c55e" : "#94a3b8"}`;

  const stats = [
    { label: "Conversations", value: "0", bg: "#eff6ff", fg: "#006ce0", Icon: IconMessageSquare },
    { label: "Avg. Rating", value: "\u2014", bg: "#fffbeb", fg: "#d97706", Icon: IconStar },
    { label: "Response Rate", value: "100%", bg: "#ecfdf5", fg: "#059669", Icon: IconActivity },
  ];

  const StatusPill = () => (
    <span style={S(statusChip)}><span style={S(statusDot)} />{statusLabel}</span>
  );

  const renderMessage = (m) => {
    if (m.type === "system") {
      return (
        <div key={m.id} style={S("display:flex;justify-content:center")}>
          <span style={S("max-width:88%;background:#eef2f7;color:#475569;font-size:.75rem;line-height:1.4;padding:7px 14px;border-radius:9999px;text-align:center;white-space:pre-line")}>{m.content}</span>
        </div>
      );
    }
    if (m.type === "course_catalog") {
      return (
        <div key={m.id} style={S("background:#fff;border:1px solid #e6e9ef;border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(16,24,40,.04)")}>
          <div style={S("display:flex;align-items:center;gap:8px;margin-bottom:8px")}>
            <IconBookOpen size={18} stroke="#006ce0" />
            <h4 style={S("font-size:.95rem;font-weight:600;margin:0")}>Course Catalog</h4>
          </div>
          <p style={S("font-size:.8125rem;color:#64748b;margin:0 0 12px;line-height:1.5;white-space:pre-line")}>{m.content}</p>
          <div style={S("display:flex;flex-direction:column;gap:10px")}>
            {(m.courses || []).map((c) => (
              <div key={c.id} style={S("border:1px solid #eef2f7;border-left:3px solid #bfdbfe;border-radius:12px;padding:14px")}>
                <div style={S("display:flex;justify-content:space-between;gap:10px")}>
                  <div style={S("min-width:0")}>
                    <h5 style={S("font-size:.875rem;font-weight:600;color:#006ce0;margin:0")}>{c.title}</h5>
                    <p style={S("font-size:.75rem;color:#64748b;margin:4px 0 0;line-height:1.45")}>{c.description}</p>
                  </div>
                  <span style={S(levelChip(c.level))}>{c.level}</span>
                </div>
                <div style={S("display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.6875rem;color:#64748b;margin:10px 0")}>
                  <span>${c.price}</span><span>{c.duration}</span>
                  <span>{c.students.toLocaleString()} students</span><span>{c.rating}/5 rating</span>
                </div>
                <div style={S("display:flex;gap:8px")}>
                  <button type="button" onClick={() => handleAction("view_course_details", c.id)} style={S("flex:1;height:32px;border:0;border-radius:8px;background:#006ce0;color:#fff;font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit")}>View Details</button>
                  <button type="button" onClick={() => handleAction("start_enrollment", c.id)} style={S("flex:1;height:32px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#334155;font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit")}>Enroll Now</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    const user = m.type === "user";
    const badges = [];
    if (m.language && m.language !== "en") {
      const lf = (LANGUAGES.find((l) => l.code === m.language) || {}).flag;
      if (lf) badges.push({ key: "lang", label: lf, style: "font-size:.7rem" });
    }
    if (m.sentiment) {
      const st = SENT_TONE[m.sentiment] || SENT_TONE.neutral;
      badges.push({ key: "sent", label: m.sentiment, style: `padding:1px 7px;border-radius:9999px;font-size:.625rem;font-weight:600;text-transform:capitalize;background:${st[0]};color:${st[1]}` });
    }
    if (m.category && m.category !== "general") {
      badges.push({ key: "cat", label: m.category.replace("_", " "), style: "padding:1px 7px;border-radius:9999px;font-size:.625rem;font-weight:500;background:#eef2f7;color:#64748b" });
    }
    return (
      <div key={m.id} style={S(`display:flex;gap:10px;align-items:flex-start;${user ? "flex-direction:row-reverse" : ""}`)}>
        <span style={S(`height:34px;width:34px;flex:none;border-radius:9999px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:${user ? "#7c3aed" : "#006ce0"}`)}>
          {user ? <IconUser size={17} stroke="#fff" /> : <IconBot size={17} stroke="#fff" />}
        </span>
        <div style={S(`max-width:82%;display:flex;flex-direction:column;${user ? "align-items:flex-end" : "align-items:flex-start"}`)}>
          <div style={S(`padding:11px 14px;border-radius:14px;${user ? "background:#7c3aed;color:#fff;border-top-right-radius:4px" : "background:#fff;border:1px solid #e6e9ef;color:#0f172a;border-top-left-radius:4px"}`)}>
            <p style={S("margin:0;font-size:.875rem;line-height:1.55;white-space:pre-line")}>{m.content}</p>
            {m.actions && m.actions.length > 0 && (
              <div style={S("display:flex;flex-wrap:wrap;gap:8px;margin-top:10px")}>
                {m.actions.map((a, i) => (
                  <button key={i} type="button" onClick={() => handleAction(a.action, a.courseId)}
                    className={a.type === "primary" ? "btnPrimary" : "btnSecondary"}
                    style={S(a.type === "primary"
                      ? "height:30px;padding:0 12px;border:0;border-radius:8px;background:#006ce0;color:#fff;font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit"
                      : "height:30px;padding:0 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#334155;font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit")}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={S(`display:flex;align-items:center;gap:6px;margin-top:5px;flex-wrap:wrap;${user ? "justify-content:flex-end" : ""}`)}>
            <span style={S("font-size:.6875rem;color:#94a3b8")}>{nowTime()}</span>
            {badges.map((b) => (<span key={b.key} style={S(b.style)}>{b.label}</span>))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <AppShell bare active="managebots">
      <main style={S("flex:1;padding:24px;width:100%;box-sizing:border-box;font-family:'Open Sans',sans-serif;color:#0f172a;animation:ba-fade .3s ease-out")}>
        <div style={S("padding-top:8px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap")}>
          <div style={S("display:flex;align-items:center;gap:14px;min-width:0")}>
            <a href="#/botlist" className="hovBack" style={S("height:38px;width:38px;flex:none;border:1px solid #e2e8f0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:#475569;text-decoration:none")}>
              <IconArrowLeft size={18} />
            </a>
            <span style={S("height:44px;width:44px;flex:none;border-radius:12px;background:#eff6ff;color:#006ce0;display:inline-flex;align-items:center;justify-content:center")}>
              <IconBot size={22} />
            </span>
            <div style={S("min-width:0")}>
              <h1 style={S("font-size:1.5rem;font-weight:500;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{botName}</h1>
              <p style={S("font-size:.8125rem;color:#64748b;margin:2px 0 0")}>AI Assistant · Live App</p>
            </div>
          </div>
          <StatusPill />
        </div>

        <div style={S("padding-bottom:40px")}>
          <div style={S("display:flex;align-items:center;gap:10px;margin-bottom:14px")}>
            <span style={S("width:4px;height:18px;border-radius:9999px;background:#2563eb")} />
            <h2 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Overview</h2>
          </div>
          <div style={S("display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px")} className="ba-grid">
            {stats.map((st) => (
              <div key={st.label} style={S("background:#fff;border:1px solid #e6e9ef;border-radius:14px;box-shadow:0 1px 2px rgba(16,24,40,.03);padding:18px 20px")}>
                <div style={S("display:flex;align-items:center;gap:8px;margin-bottom:10px")}>
                  <span style={S(`height:30px;width:30px;border-radius:8px;background:${st.bg};color:${st.fg};display:inline-flex;align-items:center;justify-content:center;flex:none`)}>
                    <st.Icon size={15} />
                  </span>
                  <p style={S("font-size:.75rem;font-weight:600;color:#64748b;margin:0")}>{st.label}</p>
                </div>
                <p style={S("font-size:1.6rem;font-weight:600;margin:0;line-height:1")}>{st.value}</p>
              </div>
            ))}
          </div>

          <div style={S("display:grid;grid-template-columns:1.4fr 1fr;gap:20px")} className="ba-grid-2">
            <div style={S("background:#fff;border:1px solid #e6e9ef;border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.03);padding:24px")}>
              <div style={S("display:flex;align-items:center;gap:10px;margin-bottom:16px")}>
                <span style={S("width:4px;height:18px;border-radius:9999px;background:#8b5cf6")} />
                <h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Configuration</h3>
              </div>
              <div style={S("border:1px solid #eef2f7;border-radius:12px;overflow:hidden")}>
                <div style={S("display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid #f1f5f9")}>
                  <span style={S("height:32px;width:32px;flex:none;border-radius:8px;background:#eff6ff;color:#006ce0;display:inline-flex;align-items:center;justify-content:center")}><IconBookOpen size={16} /></span>
                  <span style={S("font-size:.8125rem;color:#64748b;flex:1")}>Knowledge Base</span>
                  <span style={S("font-size:.875rem;font-weight:600;text-align:right")}>{knowledgeBase}</span>
                </div>
                <div style={S("display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid #f1f5f9")}>
                  <span style={S("height:32px;width:32px;flex:none;border-radius:8px;background:#f5f3ff;color:#7c3aed;display:inline-flex;align-items:center;justify-content:center")}><IconGlobe size={16} /></span>
                  <span style={S("font-size:.8125rem;color:#64748b;flex:1")}>Response Language</span>
                  <span style={S("font-size:.875rem;font-weight:600")}>Multilingual</span>
                </div>
                <div style={S("display:flex;align-items:center;gap:12px;padding:13px 16px")}>
                  <span style={S("height:32px;width:32px;flex:none;border-radius:8px;background:#ecfdf5;color:#059669;display:inline-flex;align-items:center;justify-content:center")}><IconCheckCircle size={16} /></span>
                  <span style={S("font-size:.8125rem;color:#64748b;flex:1")}>Status</span>
                  <StatusPill />
                </div>
              </div>
              <div style={S("margin-top:16px")}>
                <p style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;margin:0 0 6px")}>About</p>
                <p style={S("font-size:.875rem;color:#475569;line-height:1.6;margin:0")}>{description}</p>
              </div>
            </div>
            <div style={S("background:linear-gradient(160deg,#eff6ff,#fff);border:1px solid #dbeafe;border-radius:16px;padding:24px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:12px")}>
              <span style={S("height:46px;width:46px;border-radius:12px;background:#006ce0;color:#fff;display:inline-flex;align-items:center;justify-content:center")}><IconChat size={24} /></span>
              <h3 style={S("font-size:1.05rem;font-weight:600;margin:0")}>Try the assistant</h3>
              <p style={S("font-size:.875rem;color:#475569;line-height:1.55;margin:0")}>Start a new conversation or resume one below — browse courses, get tutoring help, ask FAQs, or reach live support in six languages.</p>
              <button type="button" onClick={newConv} className="btnPrimary" style={S("margin-top:4px;height:40px;padding:0 18px;border:0;border-radius:9px;background:#006ce0;color:#fff;font-family:inherit;font-size:.875rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px")}>
                <IconPlus size={16} />New Conversation
              </button>
            </div>
          </div>

          <div style={S("margin-top:24px;background:#fff;border:1px solid #e6e9ef;border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.03);padding:24px")}>
            <div style={S("display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap")}>
              <div style={S("display:flex;align-items:center;gap:10px")}>
                <span style={S("width:4px;height:18px;border-radius:9999px;background:#059669")} />
                <h3 style={S("font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0")}>Conversations</h3>
                <span style={S("font-size:.75rem;color:#94a3b8")}>{conversations.length} total</span>
              </div>
              <button type="button" onClick={newConv} className="btnSecondary" style={S("height:34px;padding:0 14px;border:1px solid #cfe0fb;background:#eff4ff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.8125rem;font-weight:600;color:#006ce0;display:inline-flex;align-items:center;gap:6px")}>
                <IconPlus size={15} />New Conversation
              </button>
            </div>
            <div style={S("display:flex;flex-direction:column;gap:10px")}>
              {conversations.map((c) => {
                const st = c.status === "resolved" ? ["#dcfce7", "#166534", "Resolved"] : ["#fef9c3", "#854d0e", "Open"];
                return (
                  <button key={c.id} type="button" onClick={() => openConv(c.id)} className="convRow"
                    style={S("display:flex;align-items:center;gap:14px;width:100%;text-align:left;border:1px solid #eef2f7;border-radius:12px;padding:14px 16px;background:#fff;cursor:pointer;font-family:inherit")}>
                    <span style={S("height:38px;width:38px;flex:none;border-radius:10px;background:#eff6ff;color:#006ce0;display:inline-flex;align-items:center;justify-content:center")}><IconChat size={18} /></span>
                    <div style={S("min-width:0;flex:1")}>
                      <div style={S("display:flex;align-items:center;gap:8px")}>
                        <span style={S("font-size:.875rem;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{c.title}</span>
                      </div>
                      <p style={S("font-size:.75rem;color:#64748b;margin:3px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{c.preview}</p>
                    </div>
                    <div style={S("display:flex;align-items:center;gap:12px;flex:none")}>
                      <span style={S(`display:inline-flex;flex:none;align-items:center;padding:2px 10px;border-radius:9999px;font-size:.6875rem;font-weight:600;background:${st[0]};color:${st[1]}`)}>{st[2]}</span>
                      <span style={S("font-size:.75rem;color:#94a3b8;white-space:nowrap")}>{c.time}</span>
                      <span style={S("display:inline-flex;align-items:center;gap:5px;font-size:.8125rem;font-weight:600;color:#006ce0;white-space:nowrap")}>Open Chat<IconChevronRight size={15} /></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {!chatOpen && (
        <button type="button" onClick={() => setChatOpen(true)} aria-label="Open chat" className="fab"
          style={S("position:fixed;bottom:24px;right:24px;z-index:140;height:56px;width:56px;border:0;border-radius:9999px;background:#006ce0;color:#fff;cursor:pointer;box-shadow:0 10px 15px -3px rgba(0,0,0,0.2);display:inline-flex;align-items:center;justify-content:center")}>
          <IconChatBubble size={26} />
        </button>
      )}

      {chatOpen && (
        <>
          <div onClick={() => setChatOpen(false)} style={S("position:fixed;inset:0;z-index:120;background:rgba(0,0,0,0.5)")} />
          <div style={S("position:fixed;top:0;right:0;bottom:0;z-index:130;height:100%;width:480px;max-width:90vw;background:#fff;border-left:1px solid #e2e8f0;border-radius:16px 0 0 16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:-12px 0 40px -12px rgba(15,23,42,0.3);animation:ba-slide .3s cubic-bezier(.32,.72,0,1)")}>
            <div style={S("display:flex;justify-content:center;padding:12px 0 0;flex:none")}>
              <span style={S("width:100px;height:6px;border-radius:9999px;background:#e2e8f0")} />
            </div>
            <div style={S("background:#fff;border-bottom:1px solid #e2e8f0;padding:12px 16px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px")}>
              <div style={S("display:flex;align-items:center;gap:12px;min-width:0")}>
                <span style={S("height:40px;width:40px;flex:none;border-radius:11px;background:#eff6ff;color:#006ce0;display:inline-flex;align-items:center;justify-content:center")}><IconBot size={20} /></span>
                <div style={S("min-width:0")}>
                  <h3 style={S("font-size:.95rem;font-weight:600;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{convTitle}</h3>
                  <div style={S("display:flex;align-items:center;gap:6px;font-size:.7rem;color:#64748b;margin-top:2px")}>
                    <span style={S("width:7px;height:7px;border-radius:50%;background:#22c55e")} />EduBot · Online · Multi-Lingual
                  </div>
                </div>
              </div>
              <div style={S("display:flex;align-items:center;gap:6px")}>
                <div style={S("position:relative")}>
                  <button type="button" onClick={() => setShowLang((v) => !v)} className="langToggle"
                    style={S("height:32px;padding:0 8px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.75rem;color:#475569;display:inline-flex;align-items:center;gap:4px")}>
                    <span style={S("font-size:.95rem")}>{curLang.flag}</span><IconChevronDown size={13} />
                  </button>
                  {showLang && (
                    <div style={S("position:absolute;top:calc(100% + 6px);right:0;z-index:6;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:6px;min-width:170px;box-shadow:0 12px 28px -8px rgba(15,23,42,0.22)")}>
                      {LANGUAGES.map((l) => (
                        <button key={l.code} type="button" onClick={() => switchLanguage(l.code)}
                          style={S(`display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:7px 10px;border:0;border-radius:7px;background:${l.code === currentLanguage ? "#eff6ff" : "transparent"};color:${l.code === currentLanguage ? "#006ce0" : "#334155"};font-size:.8125rem;font-weight:${l.code === currentLanguage ? 600 : 400};cursor:pointer;text-align:left;font-family:inherit`)}>
                          <span style={S("font-size:1rem")}>{l.flag}</span>{l.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => { setChatOpen(false); setShowLang(false); }} aria-label="Close" className="closeBtn"
                  style={S("height:32px;width:32px;flex:none;border:0;background:#f1f5f9;border-radius:8px;color:#475569;cursor:pointer;display:inline-flex;align-items:center;justify-content:center")}>
                  <IconClose size={18} />
                </button>
              </div>
            </div>

            <div ref={scrollRef} style={S("flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:14px;background:#f8fafc")}>
              {messages.map(renderMessage)}
              {isTyping && (
                <div style={S("display:flex;align-items:center;gap:10px")}>
                  <span style={S("height:34px;width:34px;flex:none;border-radius:9999px;background:#006ce0;color:#fff;display:inline-flex;align-items:center;justify-content:center")}><IconBot size={17} stroke="#fff" /></span>
                  <div style={S("background:#fff;border:1px solid #e6e9ef;border-radius:14px;padding:12px 14px;display:flex;gap:5px")}>
                    <span style={S("width:7px;height:7px;border-radius:50%;background:#94a3b8;animation:ba-bounce 1.2s infinite")} />
                    <span style={S("width:7px;height:7px;border-radius:50%;background:#94a3b8;animation:ba-bounce 1.2s infinite .15s")} />
                    <span style={S("width:7px;height:7px;border-radius:50%;background:#94a3b8;animation:ba-bounce 1.2s infinite .3s")} />
                  </div>
                </div>
              )}
            </div>

            <div style={S("padding:14px 16px;border-top:1px solid #e2e8f0;background:#fff")}>
              <div style={S("display:flex;align-items:center;gap:10px")}>
                <input value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={`Ask me anything in ${curLang.name}...`} className="chatInput"
                  style={S("flex:1;height:44px;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:10px;padding:0 14px;font-family:inherit;font-size:.875rem;outline:none")} />
                <button type="button" onClick={send} aria-label="Send" className="sendBtn"
                  style={S("height:44px;width:44px;flex:none;border:0;border-radius:10px;background:#006ce0;color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center")}>
                  <IconSend size={18} />
                </button>
              </div>
              <div style={S("display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:8px")}>
                <div style={S("display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
                  <span style={S("display:inline-flex;align-items:center;gap:5px;font-size:.6875rem;color:#64748b")}>
                    <span style={S("width:7px;height:7px;border-radius:50%;background:#22c55e")} />Context: {context.learningHistory.length} courses tracked
                  </span>
                  {context.frustrationLevel > 0 && (
                    <span style={S("display:inline-flex;align-items:center;gap:4px;font-size:.6875rem;color:#d97706")}>Frustration: Level {context.frustrationLevel}</span>
                  )}
                </div>
                <span style={S("font-size:.6875rem;color:#94a3b8")}>Press Enter to send</span>
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
