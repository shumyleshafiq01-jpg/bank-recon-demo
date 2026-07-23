"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, Send, Loader2 } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "How do I use this page?",
  "How does reverse costing work?",
  "How do I set up an export shipment?",
  "Which items need an aflatoxin certificate?",
];

export default function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Don't show the assistant on the login screen.
  if (pathname === "/login") return null;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, currentPath: pathname }),
      });
      const d = await r.json();
      const reply = d.reply
        || (r.status === 401 ? "Your session has expired — please sign in again." : null)
        || d.error
        || "Sorry, no response.";
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry, I couldn't reach the assistant. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Kafi Assistant"
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 pl-3 pr-4 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-medium">Assistant</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-[60] w-[min(400px,calc(100vw-2.5rem))] h-[min(600px,calc(100vh-2.5rem))] flex flex-col bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-black/20 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <div>
                <div className="text-sm font-semibold leading-tight">Kafi Assistant</div>
                <div className="text-[11px] text-blue-100 leading-tight">Here to help you use the platform</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded hover:bg-white/20 cursor-pointer"><X className="w-4 h-4" /></button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Hi! Ask me how to use any part of the platform, or about Kafi&apos;s export and costing processes.</p>
                <div className="space-y-1.5">
                  {STARTERS.map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 hover:border-blue-300 hover:bg-blue-50/50 transition-colors cursor-pointer">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-blue-600 text-white rounded-br-sm" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl bg-white border border-gray-200 text-gray-400 rounded-bl-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200 bg-white shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Ask a question..."
                rows={1}
                className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 max-h-28"
              />
              <button onClick={() => send(input)} disabled={!input.trim() || loading}
                className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 cursor-pointer shrink-0">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
