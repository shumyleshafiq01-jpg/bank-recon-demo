"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Landmark, ArrowRight, BarChart3, Clock, User, Building2, CreditCard, Globe, FileText, LogOut } from "lucide-react";

const TESTING_EXPIRY_MS = 72 * 60 * 60 * 1000;

type Session = { type: "user" | "testing"; ts: number } | null;

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("session");
      if (!raw) { router.replace("/"); return; }
      const s = JSON.parse(raw) as Session;
      if (!s) { router.replace("/"); return; }
      if (s.type === "testing" && Date.now() - s.ts > TESTING_EXPIRY_MS) {
        localStorage.removeItem("session");
        router.replace("/?expired=1");
        return;
      }
      setSession(s);
    } catch {
      router.replace("/");
      return;
    }
    setChecked(true);
  }, [router]);

  function logout() {
    localStorage.removeItem("session");
    router.replace("/");
  }

  if (!checked) return null;

  const sessionLabel = session?.type === "user" ? "User" : "Tester";

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Landmark className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Bank Reconciliation Demo</h1>
            <p className="text-xs text-muted">by Sheikh Shumyle &middot; 9 June 2026</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            <User className="w-4 h-4" />
            {sessionLabel}
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-muted hover:text-red-400 transition-colors cursor-pointer">
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted mt-1">Select a module to get started</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl border border-border p-5">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xs text-muted">Available Modules</p>
                <p className="text-lg font-bold text-foreground">4</p>
              </div>
            </div>
          </div>
          <div className="bg-surface rounded-xl border border-border p-5">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-warning" />
              <div>
                <p className="text-xs text-muted">Recent Reconciliations</p>
                <p className="text-lg font-bold text-foreground">0</p>
              </div>
            </div>
          </div>
          <div className="bg-surface rounded-xl border border-border p-5">
            <div className="flex items-center gap-3">
              <Landmark className="w-5 h-5 text-accent" />
              <div>
                <p className="text-xs text-muted">Status</p>
                <p className="text-lg font-bold text-accent">Ready</p>
              </div>
            </div>
          </div>
        </div>

        {/* Module Cards */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Modules</h3>

          {/* Multi-Bank Adjustments */}
          <button
            onClick={() => router.push("/multi-bank")}
            className="w-full text-left bg-surface hover:bg-surface-light rounded-2xl border border-border hover:border-violet-500/50 p-6 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-violet-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground group-hover:text-violet-400 transition-colors">
                    Multi-Bank Adjustments & Corrections
                  </h4>
                  <p className="text-sm text-muted mt-1">
                    Supports ABL, Habib Metropolitan, Faysal, and Soneri bank statements.
                    Upload bank statements as PDF, Excel, or CSV along with the Tally ledger.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["Multi-Bank", "PDF / XLS / CSV", "Tally Ledger", "Auto-Detect Format", "Date Match"].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted group-hover:text-violet-400 transition-colors shrink-0 mt-1" />
            </div>
          </button>

          {/* Credit Card Verification */}
          <button
            onClick={() => router.push("/credit-card")}
            className="w-full text-left bg-surface hover:bg-surface-light rounded-2xl border border-border hover:border-rose-500/50 p-6 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0">
                  <CreditCard className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground group-hover:text-rose-400 transition-colors">
                    Credit Card Statement Verification
                  </h4>
                  <p className="text-sm text-muted mt-1">
                    Upload a credit card statement (PDF, Excel, or CSV). Transactions are
                    auto-grouped by merchant with totals. Manually verify each transaction
                    against physical receipts and download the verification report.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["Credit Card", "Group by Merchant", "Tick Verification", "Excel Report"].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted group-hover:text-rose-400 transition-colors shrink-0 mt-1" />
            </div>
          </button>

          {/* International Bank Reconciliation */}
          <button
            onClick={() => router.push("/international")}
            className="w-full text-left bg-surface hover:bg-surface-light rounded-2xl border border-border hover:border-cyan-500/50 p-6 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <Globe className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    International Bank Reconciliation
                  </h4>
                  <p className="text-sm text-muted mt-1">
                    Upload bank statements from any international bank (UAE, USA, UK, etc.).
                    AI auto-detects the bank format and currency — no bank dropdown needed.
                    Multi-currency support with date-aware matching.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["International", "Multi-Currency", "AI Auto-Detect", "Any Bank", "Date Match"].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted group-hover:text-cyan-400 transition-colors shrink-0 mt-1" />
            </div>
          </button>

          {/* Statement Converter */}
          <button
            onClick={() => router.push("/statement-converter")}
            className="w-full text-left bg-surface hover:bg-surface-light rounded-2xl border border-border hover:border-emerald-500/50 p-6 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                    Bank Statement Converter
                  </h4>
                  <p className="text-sm text-muted mt-1">
                    Convert any bank statement PDF into a clean, standardized Excel file
                    with fixed columns (Date, Description, Debit, Credit, Balance).
                    AI reads the PDF and outputs a ready-to-use spreadsheet.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["PDF → Excel", "AI Extraction", "Any Bank", "Standardized Output"].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted group-hover:text-emerald-400 transition-colors shrink-0 mt-1" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
