"use client";

import { useState, useRef, useEffect } from "react";
import {
  Landmark, ArrowLeft, Upload, FileText, Calendar,
  Loader2, CheckCircle, AlertTriangle, Send, Bot, User,
  Download, ChevronRight, X, MessageSquare,
} from "lucide-react";
import { useRouter } from "next/navigation";

type FileEntry = { file: File; preview: string };
type Step = "dates" | "upload-bank" | "upload-ledger" | "analyzing" | "results";
type ChatMsg = { role: "user" | "assistant"; content: string };

/* ── helpers ────────────────────────────────────────────────── */

function fmt(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-PK", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/* ── component ──────────────────────────────────────────────── */

export default function ReconPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("dates");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bankFiles, setBankFiles] = useState<FileEntry[]>([]);
  const [ledgerFiles, setLedgerFiles] = useState<FileEntry[]>([]);
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [chatOpen, setChatOpen] = useState(true);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your Bank Reconciliation Agent. Let's get started.\n\nPlease select the statement period — choose a start and end date for the reconciliation.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, chatLoading]);

  /* ── chat send ──────────────────────────────────────────── */
  async function sendChat(text?: string) {
    const msg = text ?? chatInput.trim();
    if (!msg) return;
    const newMsgs: ChatMsg[] = [...chatMsgs, { role: "user", content: msg }];
    setChatMsgs(newMsgs);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMsgs,
          context: {
            step,
            startDate,
            endDate,
            bankFilesCount: bankFiles.length,
            ledgerFilesCount: ledgerFiles.length,
            hasResults: !!analysisResult,
          },
        }),
      });
      const data = await res.json();
      setChatMsgs([...newMsgs, { role: "assistant", content: data.reply ?? "Sorry, something went wrong." }]);
    } catch {
      setChatMsgs([...newMsgs, { role: "assistant", content: "Connection error. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  /* ── file handler ──────────────────────────────────────── */
  function handleFiles(e: React.ChangeEvent<HTMLInputElement>, target: "bank" | "ledger") {
    const files = Array.from(e.target.files ?? []);
    const entries: FileEntry[] = files.map((f) => ({
      file: f,
      preview: f.name,
    }));
    if (target === "bank") setBankFiles((prev) => [...prev, ...entries]);
    else setLedgerFiles((prev) => [...prev, ...entries]);
  }

  function removeFile(target: "bank" | "ledger", idx: number) {
    if (target === "bank") setBankFiles((prev) => prev.filter((_, i) => i !== idx));
    else setLedgerFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  /* ── analyze ───────────────────────────────────────────── */
  async function runAnalysis() {
    setStep("analyzing");
    setAnalyzing(true);
    setChatMsgs((prev) => [
      ...prev,
      { role: "assistant", content: "Analyzing your documents... This may take a moment. I'm cross-checking all transactions between your bank statement and journal ledger." },
    ]);

    try {
      const formData = new FormData();
      formData.append("startDate", startDate);
      formData.append("endDate", endDate);
      bankFiles.forEach((f) => formData.append("bankFiles", f.file));
      ledgerFiles.forEach((f) => formData.append("ledgerFiles", f.file));

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.error) {
        setChatMsgs((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
        setStep("upload-ledger");
      } else {
        setAnalysisResult(data.analysis);
        setStep("results");
        setChatMsgs((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Analysis complete! I've found the discrepancies and prepared a reconciliation summary. Review the results on the left panel.\n\nWould you like me to explain any specific finding, or shall I generate an updated journal ledger with the corrections?",
          },
        ]);
      }
    } catch {
      setChatMsgs((prev) => [
        ...prev,
        { role: "assistant", content: "Analysis failed. Please check your files and try again." },
      ]);
      setStep("upload-ledger");
    } finally {
      setAnalyzing(false);
    }
  }

  /* ── step progression ──────────────────────────────────── */
  function nextFromDates() {
    if (!startDate || !endDate) return;
    setStep("upload-bank");
    setChatMsgs((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Great! Period set: ${fmt(startDate)} to ${fmt(endDate)}.\n\nNow please upload your bank statement. I accept PDF, scanned images (PNG/JPG), or Excel files.`,
      },
    ]);
  }

  function nextFromBank() {
    if (bankFiles.length === 0) return;
    setStep("upload-ledger");
    setChatMsgs((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Bank statement received (${bankFiles.length} file${bankFiles.length > 1 ? "s" : ""}).\n\nNow upload your journal ledger / general ledger. I accept PDF, Excel (.xlsx/.xls), scanned images, or CSV files.`,
      },
    ]);
  }

  function nextFromLedger() {
    if (ledgerFiles.length === 0) return;
    runAnalysis();
  }

  /* ── render helpers ────────────────────────────────────── */
  const stepIdx = { dates: 0, "upload-bank": 1, "upload-ledger": 2, analyzing: 3, results: 3 };
  const steps = ["Period", "Bank Statement", "Journal Ledger", "Results"];

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <Landmark className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-bold text-foreground">Bank Reconciliation</span>
        </div>
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="md:hidden flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/20 text-primary cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {chatOpen ? "Hide Chat" : "Show Chat"}
        </button>
      </header>

      {/* Progress Steps */}
      <div className="border-b border-border bg-surface/30 px-4 md:px-6 py-3 shrink-0">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-2 text-xs font-medium ${i <= stepIdx[step] ? "text-primary" : "text-muted/50"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  i < stepIdx[step] ? "bg-primary text-white" :
                  i === stepIdx[step] ? "bg-primary/20 text-primary border border-primary" :
                  "bg-surface-light text-muted/50"
                }`}>
                  {i < stepIdx[step] ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className="hidden sm:inline">{s}</span>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className={`w-3.5 h-3.5 ${i < stepIdx[step] ? "text-primary" : "text-muted/30"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel — Workflow */}
        <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${chatOpen ? "hidden md:block" : ""}`}>
          <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">

            {/* STEP: Dates */}
            {step === "dates" && (
              <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-foreground">Select Reconciliation Period</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <button
                  onClick={nextFromDates}
                  disabled={!startDate || !endDate}
                  className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP: Upload Bank Statement */}
            {step === "upload-bank" && (
              <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <Upload className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-foreground">Upload Bank Statement</h2>
                </div>
                <p className="text-sm text-muted">
                  Period: {fmt(startDate)} — {fmt(endDate)}
                </p>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
                    multiple
                    onChange={(e) => handleFiles(e, "bank")}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="rounded-xl border-2 border-dashed border-border bg-background p-10 text-center hover:border-primary/50 transition-colors">
                    <FileText className="w-8 h-8 text-primary mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">Drop bank statement here or click to browse</p>
                    <p className="text-xs text-muted mt-1">PDF, Excel, CSV, or scanned images (PNG/JPG)</p>
                  </div>
                </div>
                {bankFiles.length > 0 && (
                  <div className="space-y-2">
                    {bankFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 text-foreground">
                          <FileText className="w-4 h-4 text-primary" />
                          <span className="truncate max-w-[200px]">{f.preview}</span>
                          <span className="text-xs text-muted">({(f.file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button onClick={() => removeFile("bank", i)} className="text-muted hover:text-danger cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={nextFromBank}
                  disabled={bankFiles.length === 0}
                  className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP: Upload Ledger */}
            {step === "upload-ledger" && (
              <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <Upload className="w-5 h-5 text-accent" />
                  <h2 className="font-semibold text-foreground">Upload Journal Ledger</h2>
                </div>
                <p className="text-sm text-muted">
                  Bank statement received. Now upload the corresponding journal/general ledger.
                </p>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
                    multiple
                    onChange={(e) => handleFiles(e, "ledger")}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="rounded-xl border-2 border-dashed border-border bg-background p-10 text-center hover:border-primary/50 transition-colors">
                    <FileText className="w-8 h-8 text-accent mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">Drop journal ledger here or click to browse</p>
                    <p className="text-xs text-muted mt-1">PDF, Excel (.xlsx/.xls), CSV, or scanned images</p>
                  </div>
                </div>
                {ledgerFiles.length > 0 && (
                  <div className="space-y-2">
                    {ledgerFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 text-foreground">
                          <FileText className="w-4 h-4 text-accent" />
                          <span className="truncate max-w-[200px]">{f.preview}</span>
                          <span className="text-xs text-muted">({(f.file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button onClick={() => removeFile("ledger", i)} className="text-muted hover:text-danger cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={nextFromLedger}
                  disabled={ledgerFiles.length === 0}
                  className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
                >
                  <Loader2 className={`w-4 h-4 ${analyzing ? "animate-spin" : "hidden"}`} />
                  Run Reconciliation
                </button>
              </div>
            )}

            {/* STEP: Analyzing */}
            {step === "analyzing" && (
              <div className="bg-surface rounded-2xl border border-border p-10 text-center space-y-4">
                <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
                <h2 className="font-semibold text-foreground">Analyzing Documents</h2>
                <p className="text-sm text-muted">
                  Cross-checking bank statement against journal ledger...
                  <br />
                  Detecting missing entries, discrepancies, and calculating variances.
                </p>
              </div>
            )}

            {/* STEP: Results */}
            {step === "results" && analysisResult && (
              <div className="space-y-4">
                <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-accent" />
                      <h2 className="font-semibold text-foreground">Reconciliation Results</h2>
                    </div>
                    <span className="text-xs text-muted">{fmt(startDate)} — {fmt(endDate)}</span>
                  </div>
                  <div className="bg-background rounded-xl p-5 text-sm text-foreground whitespace-pre-wrap leading-relaxed font-mono max-h-[60vh] overflow-y-auto">
                    {analysisResult}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => sendChat("Please generate the updated journal ledger with the corrections you recommended.")}
                    className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent/80 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Approve & Generate Updated Ledger
                  </button>
                  <button
                    onClick={() => { setStep("dates"); setBankFiles([]); setLedgerFiles([]); setAnalysisResult(""); }}
                    className="flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-border text-foreground font-semibold py-3 px-5 rounded-xl transition-all cursor-pointer"
                  >
                    Start Over
                  </button>
                </div>

                <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">
                    All corrections require your approval before being applied.
                    Use the chat to ask questions about specific findings or request modifications.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel — Chat */}
        <div className={`${chatOpen ? "flex" : "hidden"} md:flex flex-col w-full md:w-[400px] lg:w-[440px] border-l border-border bg-surface/30 shrink-0`}>
          {/* Chat Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Recon Agent</span>
            <span className="text-xs text-muted ml-auto">AI Assistant</span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMsgs.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : ""} animate-fade-in`}>
                {m.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-white rounded-br-md"
                    : "bg-surface border border-border text-foreground rounded-bl-md"
                }`}>
                  {m.content}
                </div>
                {m.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-surface-light flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-muted" />
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2.5 animate-fade-in">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-surface border border-border rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-border shrink-0">
            <form
              onSubmit={(e) => { e.preventDefault(); sendChat(); }}
              className="flex gap-2"
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about the reconciliation..."
                disabled={chatLoading}
                className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="bg-primary hover:bg-primary-hover disabled:opacity-40 text-white rounded-xl px-3 py-2.5 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
