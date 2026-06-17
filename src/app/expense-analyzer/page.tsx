"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft, Upload, FileText, Loader2, X, Download,
  Wallet, Filter, MessageSquare, Send, ChevronDown, ChevronUp,
  Plus, Globe, Tag, Calendar, DollarSign, RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type Transaction = {
  date: string; month: string; merchant: string; amount: number;
  currency: string; category: string; country: string;
  description: string; type: "expense" | "income" | "fee";
};

type Summary = {
  totalTransactions: number; totalExpenses: number;
  totalByCurrency: Record<string, number>;
  totalByCategory: Record<string, number>;
  totalByMonth: Record<string, Record<string, number>>;
  totalByCountry: Record<string, number>;
};

type FileSummary = { name: string; currency: string; count: number };

type Results = {
  transactions: Transaction[];
  fileSummaries: FileSummary[];
  months: string[]; categories: string[]; countries: string[]; currencies: string[];
  summary: Summary;
};

type ChatMsg = { role: "user" | "bot"; text: string };

type Rates = Record<string, number>;

const DEFAULT_RATES: Rates = {
  USD: 278.50,
  GBP: 352.00,
  EUR: 312.00,
  AED: 75.85,
  QAR: 76.50,
  PKR: 1,
};

const fmt = (n: number) =>
  n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPKR = (n: number) =>
  "Rs " + n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function toPKR(amount: number, currency: string, rates: Rates): number {
  return amount * (rates[currency] || 1);
}

const CATEGORY_COLORS: Record<string, string> = {
  Hotels: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Restaurants: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Shopping: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  Subscriptions: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  Transport: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "Service Fees": "bg-gray-500/15 text-gray-400 border-gray-500/30",
  Transfer: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Other: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function answerQuery(query: string, transactions: Transaction[], summary: Summary, rates: Rates): string {
  const q = query.toLowerCase().trim();
  const wantsPKR = q.includes("pkr") || q.includes("rupee") || q.includes("rupees") || q.includes("rs") || q.includes("cost us") || q.includes("cost in");

  // Month query
  for (const monthName of MONTH_NAMES) {
    const ml = monthName.toLowerCase();
    if (q.includes(ml)) {
      const yearMatch = q.match(/\b(202[0-9])\b/);
      const year = yearMatch ? yearMatch[1] : "";
      const monthKey = year ? `${monthName} ${year}` : null;

      let targetCurrency = "";
      if (q.includes("dollar") || q.includes("usd")) targetCurrency = "USD";
      else if (q.includes("pound") || q.includes("gbp") || q.includes("sterling")) targetCurrency = "GBP";
      else if (q.includes("euro") || q.includes("eur")) targetCurrency = "EUR";

      if (monthKey && summary.totalByMonth[monthKey]) {
        const monthData = summary.totalByMonth[monthKey];
        if (targetCurrency && monthData[targetCurrency]) {
          const amt = monthData[targetCurrency];
          const pkr = toPKR(amt, targetCurrency, rates);
          return `In ${monthKey}, you spent ${fmt(amt)} ${targetCurrency}${wantsPKR || true ? ` (${fmtPKR(pkr)})` : ""}.`;
        }
        const parts = Object.entries(monthData).map(([cur, amt]) => {
          const pkr = toPKR(amt, cur, rates);
          return `${fmt(amt)} ${cur} (${fmtPKR(pkr)})`;
        });
        const totalPKR = Object.entries(monthData).reduce((s, [cur, amt]) => s + toPKR(amt, cur, rates), 0);
        return `In ${monthKey}, you spent:\n${parts.join("\n")}\n\nTotal in PKR: ${fmtPKR(totalPKR)}`;
      }

      const matchingMonths = Object.entries(summary.totalByMonth)
        .filter(([k]) => k.toLowerCase().startsWith(ml));
      if (matchingMonths.length > 0) {
        const lines = matchingMonths.map(([k, v]) => {
          const parts = Object.entries(v).map(([cur, amt]) => `${fmt(amt)} ${cur} (${fmtPKR(toPKR(amt, cur, rates))})`);
          const totalPKR = Object.entries(v).reduce((s, [cur, amt]) => s + toPKR(amt, cur, rates), 0);
          return `${k}: ${parts.join(", ")}\nTotal PKR: ${fmtPKR(totalPKR)}`;
        });
        return lines.join("\n\n");
      }
      return `No spending found for ${monthName}${year ? " " + year : ""}.`;
    }
  }

  // Currency total
  const currencyKeywords: Record<string, string[]> = {
    USD: ["dollar", "usd", "dollars"],
    GBP: ["pound", "gbp", "sterling", "pounds"],
    EUR: ["euro", "eur", "euros"],
    AED: ["dirham", "aed", "dirhams"],
    QAR: ["riyal", "qar", "riyals", "qatar"],
    PKR: ["rupee", "pkr", "rupees"],
  };
  for (const [cur, keywords] of Object.entries(currencyKeywords)) {
    if (keywords.some(kw => q.includes(kw))) {
      const amt = summary.totalByCurrency[cur];
      return amt ? `Total ${cur} spending: ${fmt(amt)} ${cur} (${fmtPKR(toPKR(amt, cur, rates))})` : `No ${cur} transactions found.`;
    }
  }

  // Category query
  for (const [cat] of Object.entries(summary.totalByCategory)) {
    if (q.includes(cat.toLowerCase()) || (cat === "Hotels" && q.includes("hotel")) ||
        (cat === "Restaurants" && (q.includes("restaurant") || q.includes("food") || q.includes("dining"))) ||
        (cat === "Shopping" && q.includes("shop")) ||
        (cat === "Transport" && (q.includes("transport") || q.includes("uber") || q.includes("taxi") || q.includes("travel"))) ||
        (cat === "Telecom" && (q.includes("telecom") || q.includes("etisalat") || q.includes("phone") || q.includes("mobile"))) ||
        (cat === "Subscriptions" && (q.includes("subscription") || q.includes("twilio") || q.includes("cursor")))) {
      const catTxs = transactions.filter(t => t.category === cat && t.type !== "income");
      const byCur: Record<string, number> = {};
      let totalPKR = 0;
      catTxs.forEach(t => {
        byCur[t.currency] = (byCur[t.currency] || 0) + t.amount;
        totalPKR += toPKR(t.amount, t.currency, rates);
      });
      const parts = Object.entries(byCur).map(([c, a]) => `${fmt(a)} ${c} (${fmtPKR(toPKR(a, c, rates))})`);
      return `${cat}: ${parts.join(", ")}\n${catTxs.length} transactions | Total PKR: ${fmtPKR(totalPKR)}`;
    }
  }

  // Country query
  for (const [country] of Object.entries(summary.totalByCountry)) {
    const cl = country.toLowerCase();
    if (q.includes(cl) || (cl === "united kingdom" && (q.includes("uk") || q.includes("england") || q.includes("britain"))) ||
        (cl === "uae" && (q.includes("dubai") || q.includes("emirates")))) {
      const countryTxs = transactions.filter(t => t.country === country && t.type !== "income");
      let totalPKR = 0;
      const byCur: Record<string, number> = {};
      countryTxs.forEach(t => {
        byCur[t.currency] = (byCur[t.currency] || 0) + t.amount;
        totalPKR += toPKR(t.amount, t.currency, rates);
      });
      const parts = Object.entries(byCur).map(([c, a]) => `${fmt(a)} ${c}`);
      return `Spending in ${country}: ${parts.join(", ")}\n${countryTxs.length} transactions | Total PKR: ${fmtPKR(totalPKR)}`;
    }
  }

  // Total spending
  if (q.includes("total") || q.includes("how much") || q.includes("overall") || q.includes("all")) {
    let grandPKR = 0;
    const parts = Object.entries(summary.totalByCurrency).map(([c, a]) => {
      const pkr = toPKR(a, c, rates);
      grandPKR += pkr;
      return `${fmt(a)} ${c} (${fmtPKR(pkr)})`;
    });
    return `Total spending:\n${parts.join("\n")}\n\nGrand Total in PKR: ${fmtPKR(grandPKR)}\nAcross ${summary.totalExpenses} transactions.`;
  }

  // Merchant search
  const matchingTxs = transactions.filter(t =>
    t.merchant.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  );
  if (matchingTxs.length > 0) {
    let totalPKR = 0;
    const byCur: Record<string, number> = {};
    matchingTxs.forEach(t => {
      byCur[t.currency] = (byCur[t.currency] || 0) + t.amount;
      totalPKR += toPKR(t.amount, t.currency, rates);
    });
    const parts = Object.entries(byCur).map(([c, a]) => `${fmt(a)} ${c}`);
    return `Found ${matchingTxs.length} transactions matching "${query}":\n${parts.join(", ")}\nTotal PKR: ${fmtPKR(totalPKR)}`;
  }

  return `I can answer questions like:\n• "How much in July 2025?"\n• "Total in dollars"\n• "Hotel spending"\n• "How much in Germany?"\n• "Total spending"\n• Or search by merchant name\n\nAll answers include PKR conversion.`;
}

const MODULE_CODE = "khalid123";

export default function ExpenseAnalyzerPage() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [useAI, setUseAI] = useState(false);

  // Currency rates
  const [rates, setRates] = useState<Rates>({ ...DEFAULT_RATES });
  const [showRates, setShowRates] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("ea_unlocked") === "1") setUnlocked(true);
  }, []);

  function submitCode() {
    if (codeInput === MODULE_CODE) {
      localStorage.setItem("ea_unlocked", "1");
      setUnlocked(true);
      setCodeError(false);
    } else {
      setCodeError(true);
    }
  }

  function lockModule() {
    localStorage.removeItem("ea_unlocked");
    setUnlocked(false);
    setCodeInput("");
    setFiles([]);
    setResults(null);
    setError("");
    setFilterMonth("all");
    setFilterCategory("all");
    setFilterCountry("all");
    setFilterCurrency("all");
  }

  // Filters
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterCountry, setFilterCountry] = useState("all");
  const [filterCurrency, setFilterCurrency] = useState("all");
  const [showFilters, setShowFilters] = useState(true);
  const [showTable, setShowTable] = useState(true);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: "bot", text: "Ask me anything about the expenses. Try:\n• \"How much in July 2025?\"\n• \"Hotel spending\"\n• \"Total in rupees\"\n\nAll answers include PKR conversion." }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!results) return;
    setRates(prev => {
      const next = { ...prev };
      for (const cur of results.currencies) {
        if (!(cur in next)) next[cur] = 1;
      }
      return next;
    });
  }, [results]);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setFiles(prev => [...prev, ...Array.from(fileList)]);
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function analyze() {
    if (files.length === 0) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("files", f));
      fd.append("useAI", useAI ? "true" : "false");
      const res = await fetch("/api/expense-analyzer", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResults(data);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFiles([]); setResults(null); setError("");
    setFilterMonth("all"); setFilterCategory("all"); setFilterCountry("all"); setFilterCurrency("all");
    setChatMessages([{ role: "bot", text: "Ask me anything about the expenses." }]);
  }

  function sendChat() {
    if (!chatInput.trim() || !results) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const answer = answerQuery(userMsg, results.transactions, results.summary, rates);
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }, { role: "bot", text: answer }]);
  }

  function downloadXLS() {
    if (!results) return;
    const wb = XLSX.utils.book_new();
    const rows = [
      ["Date", "Merchant", "Amount", "Currency", "PKR Equivalent", "Category", "Country", "Type"],
      ...filtered.map(t => [t.date, t.merchant, t.amount, t.currency, Math.round(toPKR(t.amount, t.currency, rates)), t.category, t.country, t.type]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 35 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");

    // Summary by category with PKR
    const sumRows: (string | number)[][] = [["Category", "Transactions", "PKR Total"]];
    const catGroups: Record<string, { count: number; pkr: number }> = {};
    filtered.filter(t => t.type !== "income").forEach(t => {
      if (!catGroups[t.category]) catGroups[t.category] = { count: 0, pkr: 0 };
      catGroups[t.category].count++;
      catGroups[t.category].pkr += toPKR(t.amount, t.currency, rates);
    });
    Object.entries(catGroups).sort(([, a], [, b]) => b.pkr - a.pkr).forEach(([k, v]) => sumRows.push([k, v.count, Math.round(v.pkr)]));
    const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
    ws2["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, "By Category");

    // Monthly with PKR
    const monthRows: (string | number)[][] = [["Month", "Currency", "Amount", "PKR Equivalent"]];
    Object.entries(results.summary.totalByMonth).forEach(([month, curs]) => {
      Object.entries(curs).forEach(([cur, amt]) => monthRows.push([month, cur, amt, Math.round(toPKR(amt, cur, rates))]));
    });
    const ws3 = XLSX.utils.aoa_to_sheet(monthRows);
    ws3["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws3, "By Month");

    // Rates sheet
    const rateRows: (string | number)[][] = [["Currency", "1 Unit = PKR"]];
    Object.entries(rates).filter(([c]) => c !== "PKR").forEach(([c, r]) => rateRows.push([c, r]));
    const ws4 = XLSX.utils.aoa_to_sheet(rateRows);
    ws4["!cols"] = [{ wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws4, "Exchange Rates");

    XLSX.writeFile(wb, "Expense-Analysis-Report.xlsx");
  }

  // Apply filters
  const filtered = results ? results.transactions.filter(t => {
    if (filterMonth !== "all" && t.month !== filterMonth) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (filterCountry !== "all" && t.country !== filterCountry) return false;
    if (filterCurrency !== "all" && t.currency !== filterCurrency) return false;
    return true;
  }) : [];

  const filteredExpenses = filtered.filter(t => t.type !== "income");
  const filteredTotalPKR = filteredExpenses.reduce((s, t) => s + toPKR(t.amount, t.currency, rates), 0);
  const filteredTotal: Record<string, number> = {};
  filteredExpenses.forEach(t => { filteredTotal[t.currency] = (filteredTotal[t.currency] || 0) + t.amount; });

  // Grand total PKR
  const grandTotalPKR = results
    ? Object.entries(results.summary.totalByCurrency).reduce((s, [cur, amt]) => s + toPKR(amt, cur, rates), 0)
    : 0;

  const ready = files.length > 0 && !loading;

  if (!unlocked) {
    return (
      <div className="flex-1 flex flex-col h-screen items-center justify-center">
        <div className="bg-surface rounded-2xl border border-border p-8 w-full max-w-sm space-y-5 animate-fade-in">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Expense Analyzer</h2>
            <p className="text-xs text-muted text-center">Enter access code to continue</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value); setCodeError(false); }}
              onKeyDown={e => e.key === "Enter" && submitCode()}
              placeholder="Access code"
              className="w-full text-sm bg-background border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted focus:outline-none focus:border-emerald-500/50 text-center tracking-widest"
              autoFocus
            />
            {codeError && <p className="text-xs text-red-400 text-center">Incorrect code. Try again.</p>}
            <button
              onClick={submitCode}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Unlock
            </button>
          </div>
          <button onClick={() => router.push("/dashboard")} className="w-full text-xs text-muted hover:text-foreground transition-colors cursor-pointer text-center">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <Wallet className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <span className="text-sm font-bold text-foreground">Expense Analyzer</span>
        {results && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">
            {results.summary.totalTransactions} transactions loaded
          </span>
        )}
        <button onClick={lockModule} className="text-xs text-muted hover:text-red-400 transition-colors cursor-pointer ml-auto">
          Lock
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">

          {/* Upload */}
          {!results && (
            <>
              <div className="bg-surface rounded-2xl border border-border p-5">
                <p className="text-sm text-muted">
                  Upload <strong className="text-foreground">Wise card statement PDFs</strong> (one per currency account).
                  Transactions are extracted, categorized, and analyzed with filters for{" "}
                  <strong className="text-foreground">month, category, country, and currency</strong>.
                  All amounts are converted to <strong className="text-foreground">PKR</strong> for easy comparison.
                  Use the chat to ask questions. Nothing is saved — data stays in your browser only.
                </p>
              </div>

              <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-foreground">Wise Statements</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">PDF only</span>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((f, i) => {
                      const curMatch = f.name.match(/(GBP|EUR|USD|PKR)/i);
                      const cur = curMatch ? curMatch[1].toUpperCase() : "—";
                      return (
                        <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 text-foreground min-w-0">
                            <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="truncate">{f.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 shrink-0">{cur}</span>
                            <span className="text-xs text-muted shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                          </div>
                          <button onClick={() => removeFile(i)} className="text-muted hover:text-danger cursor-pointer shrink-0 ml-2"><X className="w-4 h-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="relative">
                  <input type="file" accept=".pdf" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="rounded-xl border-2 border-dashed border-border bg-background p-6 text-center hover:border-emerald-500/50 transition-colors">
                    <Plus className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
                    <p className="text-xs font-medium text-foreground">
                      {files.length === 0 ? "Drop Wise statement PDFs here" : "Add more statements"}
                    </p>
                    <p className="text-[10px] text-muted mt-1">Supports GBP, EUR, USD, PKR accounts</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-muted">
                    <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)}
                      className="rounded border-border bg-background" />
                    <span>Use AI extraction <span className="text-[10px]">(slower but more accurate)</span></span>
                  </label>
                </div>
              </div>

              <button onClick={analyze} disabled={!ready}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-500/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                {loading ? "Analyzing Statements..." : `Analyze ${files.length} Statement${files.length !== 1 ? "s" : ""}`}
              </button>
            </>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-sm text-danger">{error}</div>
          )}

          {/* Results */}
          {results && (
            <>
              {/* File summaries */}
              <div className="bg-surface rounded-2xl border border-border p-4">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Statements Processed</h3>
                <div className="flex flex-wrap gap-3">
                  {results.fileSummaries.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-background rounded-lg px-3 py-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-foreground font-medium">{f.currency}</span>
                      <span className="text-muted text-xs">{f.count} transactions</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Currency Converter */}
              <div className="bg-surface rounded-2xl border border-emerald-500/20 overflow-hidden">
                <button onClick={() => setShowRates(!showRates)}
                  className="w-full flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-surface-light/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-foreground">PKR Exchange Rates</h3>
                    <span className="text-[10px] text-muted">(editable — adjust to match actual rates)</span>
                  </div>
                  {showRates ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showRates && (
                  <div className="px-5 pb-4 grid grid-cols-3 gap-3">
                    {Object.entries(rates).filter(([c]) => c !== "PKR").map(([cur, rate]) => (
                      <div key={cur} className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground w-10">1 {cur}</span>
                        <span className="text-muted text-sm">=</span>
                        <input
                          type="number"
                          value={rate}
                          onChange={e => setRates(prev => ({ ...prev, [cur]: parseFloat(e.target.value) || 0 }))}
                          className="w-28 text-sm bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-emerald-500/50"
                          step="0.5"
                        />
                        <span className="text-sm text-muted">PKR</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary cards — original currency + PKR */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(results.summary.totalByCurrency).map(([cur, amt]) => (
                  <div key={cur} className="bg-surface rounded-xl border border-emerald-500/30 p-4 text-center">
                    <p className="text-[10px] text-muted uppercase tracking-wide">{cur} Spent</p>
                    <p className="text-lg font-bold text-emerald-400">{fmt(amt)}</p>
                    <p className="text-xs text-muted mt-0.5">{fmtPKR(toPKR(amt, cur, rates))}</p>
                  </div>
                ))}
                <div className="bg-surface rounded-xl border border-foreground/20 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Total in PKR</p>
                  <p className="text-lg font-bold text-foreground">{fmtPKR(grandTotalPKR)}</p>
                  <p className="text-xs text-muted mt-0.5">{results.summary.totalExpenses} expenses</p>
                </div>
              </div>

              {/* Category breakdown with PKR */}
              <div className="bg-surface rounded-2xl border border-border p-5">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Spending by Category</h3>
                <div className="space-y-2">
                  {(() => {
                    const catPKR: Record<string, { pkr: number; count: number }> = {};
                    results.transactions.filter(t => t.type !== "income").forEach(t => {
                      if (!catPKR[t.category]) catPKR[t.category] = { pkr: 0, count: 0 };
                      catPKR[t.category].pkr += toPKR(t.amount, t.currency, rates);
                      catPKR[t.category].count++;
                    });
                    const sorted = Object.entries(catPKR).sort(([, a], [, b]) => b.pkr - a.pkr);
                    const maxPKR = sorted.length > 0 ? sorted[0][1].pkr : 1;
                    return sorted.map(([cat, { pkr, count }]) => {
                      const pct = maxPKR > 0 ? (pkr / maxPKR) * 100 : 0;
                      return (
                        <div key={cat} className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other} w-28 text-center shrink-0`}>{cat}</span>
                          <div className="flex-1 h-5 bg-background rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500/30 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-foreground font-mono w-32 text-right shrink-0">{fmtPKR(pkr)}</span>
                          <span className="text-[10px] text-muted w-16 text-right shrink-0">{count} txns</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Filters */}
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button onClick={() => setShowFilters(!showFilters)}
                  className="w-full flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-surface-light/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-foreground">Filters</h3>
                    {(filterMonth !== "all" || filterCategory !== "all" || filterCountry !== "all" || filterCurrency !== "all") && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Active</span>
                    )}
                  </div>
                  {showFilters ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showFilters && (
                  <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] text-muted uppercase tracking-wide flex items-center gap-1 mb-1">
                        <Calendar className="w-3 h-3" /> Month
                      </label>
                      <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                        className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer">
                        <option value="all">All Months</option>
                        {results.months.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted uppercase tracking-wide flex items-center gap-1 mb-1">
                        <Tag className="w-3 h-3" /> Category
                      </label>
                      <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                        className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer">
                        <option value="all">All Categories</option>
                        {results.categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted uppercase tracking-wide flex items-center gap-1 mb-1">
                        <Globe className="w-3 h-3" /> Country
                      </label>
                      <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
                        className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer">
                        <option value="all">All Countries</option>
                        {results.countries.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted uppercase tracking-wide flex items-center gap-1 mb-1">
                        <DollarSign className="w-3 h-3" /> Currency
                      </label>
                      <select value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)}
                        className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer">
                        <option value="all">All Currencies</option>
                        {results.currencies.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Filtered summary */}
              {(filterMonth !== "all" || filterCategory !== "all" || filterCountry !== "all" || filterCurrency !== "all") && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                  <div className="text-sm text-foreground">
                    <strong>{filteredExpenses.length}</strong> transactions
                    {Object.entries(filteredTotal).map(([cur, amt]) => (
                      <span key={cur} className="ml-2 text-emerald-400 font-mono">{fmt(amt)} {cur}</span>
                    ))}
                    <span className="ml-3 text-foreground font-semibold">= {fmtPKR(filteredTotalPKR)}</span>
                  </div>
                  <button onClick={() => { setFilterMonth("all"); setFilterCategory("all"); setFilterCountry("all"); setFilterCurrency("all"); }}
                    className="text-xs text-muted hover:text-foreground cursor-pointer">Clear filters</button>
                </div>
              )}

              {/* Transaction table */}
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button onClick={() => setShowTable(!showTable)}
                  className="w-full flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-surface-light/30 transition-colors">
                  <h3 className="text-sm font-semibold text-foreground">
                    Transactions
                    <span className="ml-2 text-xs font-normal text-muted">({filtered.length} entries)</span>
                  </h3>
                  {showTable ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showTable && filtered.length > 0 && (
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-emerald-500/10 text-emerald-400">
                          <th className="px-3 py-2.5 text-left font-semibold">#</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Merchant</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                          <th className="px-3 py-2.5 text-center font-semibold">Cur</th>
                          <th className="px-3 py-2.5 text-right font-semibold">PKR</th>
                          <th className="px-3 py-2.5 text-center font-semibold">Category</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Country</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((t, i) => (
                          <tr key={i} className={`${i % 2 === 0 ? "" : "bg-surface-light/20"} ${t.type === "income" ? "opacity-50" : ""}`}>
                            <td className="px-3 py-2 text-muted">{i + 1}</td>
                            <td className="px-3 py-2 text-muted whitespace-nowrap">{t.date}</td>
                            <td className="px-3 py-2 text-foreground truncate max-w-[220px]">{t.merchant}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              <span className={t.type === "income" ? "text-emerald-400" : "text-red-400"}>
                                {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-muted">{t.currency}</td>
                            <td className="px-3 py-2 text-right font-mono text-foreground">
                              {fmtPKR(toPKR(t.amount, t.currency, rates))}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.Other}`}>
                                {t.category}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted text-xs">{t.country}</td>
                          </tr>
                        ))}
                        <tr className="bg-emerald-500/5 font-semibold border-t border-border">
                          <td className="px-3 py-2.5 text-foreground" colSpan={5}>
                            TOTAL ({filteredExpenses.length} expenses)
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground">{fmtPKR(filteredTotalPKR)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {showTable && filtered.length === 0 && (
                  <div className="px-5 pb-4 text-sm text-muted">No transactions match the current filters.</div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={downloadXLS}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-500/80 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer">
                  <Download className="w-4 h-4" />
                  Download XLS Report
                </button>
                <button onClick={() => setChatOpen(!chatOpen)}
                  className="flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-emerald-500/30 text-emerald-400 font-semibold py-3 px-6 rounded-xl transition-all cursor-pointer">
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </button>
                <button onClick={reset}
                  className="flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-border text-foreground font-semibold py-3 px-6 rounded-xl transition-all cursor-pointer">
                  Start Over
                </button>
              </div>

              {/* Chat */}
              {chatOpen && (
                <div className="bg-surface rounded-2xl border border-emerald-500/30 overflow-hidden">
                  <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-semibold text-foreground">Ask about expenses</h3>
                      <span className="text-[10px] text-muted">(answers include PKR conversion)</span>
                    </div>
                    <button onClick={() => setChatOpen(false)} className="text-muted hover:text-foreground cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-4 space-y-3">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-line ${
                          msg.role === "user"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-background text-foreground"
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="border-t border-border p-3 flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendChat()}
                      placeholder="How much did I spend in July 2025?"
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-emerald-500/50"
                    />
                    <button onClick={sendChat}
                      className="bg-emerald-500 hover:bg-emerald-500/80 text-white px-3 py-2 rounded-lg transition-all cursor-pointer">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
