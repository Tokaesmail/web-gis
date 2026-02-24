"use client";

import { useState, useRef, useEffect } from "react";
import { useLang } from "../translations";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}

const SUGGESTIONS = [
  "Analyze vegetation health in the selected area",
  "What does the red zone in NDVI mean?",
  "Compare this month vs last month",
  "Recommend irrigation schedule",
];

const SUGGESTIONS_AR = [
  "حلل صحة النباتات في المنطقة المحددة",
  "ماذا يعني اللون الأحمر في NDVI؟",
  "قارن هذا الشهر بالشهر الماضي",
  "اقترح جدول ري",
];

// Mock AI response
const MOCK_RESPONSES: Record<string, string> = {
  default: "Based on the current NDVI data (0.72), your field shows **healthy vegetation** in 87% of the area. The red zones indicate water stress — I recommend checking irrigation in the southeastern sector. Would you like a detailed report?",
  ar: "استناداً إلى بيانات NDVI الحالية (0.72)، يُظهر حقلك **نباتات صحية** في 87% من المساحة. تشير المناطق الحمراء إلى إجهاد مائي — أنصح بفحص الري في الجزء الجنوبي الشرقي. هل تريد تقريراً مفصلاً؟",
};

interface AIAssistantProps {
  open: boolean;
  onClose: () => void;
}

export default function AIAssistant({ open, onClose }: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      role: "assistant",
      content: "Hello! I'm your GeoSense AI assistant. I can analyze satellite imagery, explain vegetation indices, and provide insights about your selected area. How can I help?",
      time: "now",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { isRTL, lang } = useLang();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setMessages((m) => [...m, { id: Date.now().toString(), role: "user", content: text, time: now }]);
    setInput("");
    setLoading(true);

    // Simulate AI response delay
    await new Promise((r) => setTimeout(r, 1200));
    const response = isRTL ? MOCK_RESPONSES.ar : MOCK_RESPONSES.default;

    setMessages((m) => [
      ...m,
      { id: (Date.now() + 1).toString(), role: "assistant", content: response, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    ]);
    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const suggestions = isRTL ? SUGGESTIONS_AR : SUGGESTIONS;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-30" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`
          fixed bottom-4 right-[60px] z-1000 w-[340px] sm:w-[380px]
          bg-[#070f1e]/98 backdrop-blur-xl
          border border-white/10 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)]
          flex flex-col overflow-hidden
          transition-all duration-300 ease-out
          ${open ? "opacity-100 translate-y-0 pointer-events-all" : "opacity-0 translate-y-4 pointer-events-none"}
        `}
        style={{ maxHeight: "calc(100vh - 120px)", height: 520 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] shrink-0">
          <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a10 10 0 1 0 10 10" />
              <path d="M12 8v4l3 3" />
              <path d="M18 2v4h4" />
              <path d="M22 2 18 6" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">AI Assistant</p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[0.62rem] text-slate-500">GeoSense AI · Online</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scroll" dir={isRTL ? "rtl" : "ltr"}>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                  </svg>
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                <div
                  className={`px-3 py-2 rounded-xl text-[0.78rem] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-cyan-400/15 text-slate-100 border border-cyan-400/20 rounded-tr-sm"
                      : "bg-white/[0.05] text-slate-300 border border-white/[0.07] rounded-tl-sm"
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100">$1</strong>'),
                  }}
                />
                <span className="text-[0.58rem] text-slate-600 px-1">{msg.time}</span>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-2.5">
              <div className="w-6 h-6 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[8px] text-cyan-400">AI</span>
              </div>
              <div className="bg-white/[0.05] border border-white/[0.07] rounded-xl rounded-tl-sm px-3 py-2.5 flex gap-1 items-center">
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-500"
                    style={{ animation: `typingDot 1.2s ${d}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggestions (only when no user messages yet) */}
        {messages.filter((m) => m.role === "user").length === 0 && (
          <div className="px-4 pb-2 shrink-0">
            <p className="text-[0.62rem] text-slate-600 mb-2 uppercase tracking-wider">Suggestions</p>
            <div className="flex flex-col gap-1.5">
              {suggestions.slice(0, 2).map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="text-left text-[0.72rem] text-slate-400 hover:text-cyan-400 border border-white/[0.07] hover:border-cyan-400/30 rounded-lg px-3 py-2 transition-all cursor-pointer bg-white/[0.02] hover:bg-cyan-400/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] shrink-0">
          <div className="flex gap-2 items-end bg-white/[0.05] border border-white/[0.09] rounded-xl px-3 py-2 focus-within:border-cyan-400/40 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={isRTL ? "اكتب سؤالك هنا..." : "Ask about your field..."}
              rows={1}
              dir={isRTL ? "rtl" : "ltr"}
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none resize-none leading-relaxed"
              style={{ maxHeight: 80 }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="w-7 h-7 rounded-lg bg-cyan-400 disabled:bg-cyan-400/30 text-[#040d1a] disabled:text-slate-600 flex items-center justify-center shrink-0 transition-all cursor-pointer hover:bg-cyan-300 disabled:cursor-not-allowed"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="text-[0.58rem] text-slate-700 mt-1.5 text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      <style>{`
        @keyframes typingDot {
          0%,100%{transform:translateY(0);opacity:.4}
          50%{transform:translateY(-4px);opacity:1}
        }
        .custom-scroll::-webkit-scrollbar{width:3px}
        .custom-scroll::-webkit-scrollbar-track{background:transparent}
        .custom-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:99px}
      `}</style>
    </>
  );
}