"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Landmark, ArrowRight, BarChart3, Clock, User, Building2, CreditCard, Globe, FileText, LogOut, Scale, Timer } from "lucide-react";

const TESTING_DEADLINE = new Date("2026-06-18T12:00:00Z").getTime();

type Session = { type: "user" | "testing"; ts: number } | null;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session>(null);
  const [checked, setChecked] = useState(false);
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("session");
      if (!raw) { router.replace("/"); return; }
      const s = JSON.parse(raw) as Session;
      if (!s) { router.replace("/"); return; }
      if (s.type === "testing" && Date.now() > TESTING_DEADLINE) {
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

  useEffect(() => {
    if (!session || session.type !== "testing") return;
    const tick = () => {
      const left = TESTING_DEADLINE - Date.now();
      if (left <= 0) {
        localStorage.removeItem("session");
        router.replace("/?expired=1");
        return;
      }
      setRemaining(formatCountdown(left));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session, router]);

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
          {session?.type === "testing" && remaining && (
            <div className="flex items-center gap-1.5 text-xs font-mono bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2.5 py-1 rounded-lg">
              <Timer className="w-3.5 h-3.5" />
              {remaining}
            </div>
          )}
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
                <p className="text-lg font-bold text-foreground">5</p>
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

          {/* Statement Digitizer */}
          <button
            onClick={() => router.push("/statement-digitizer")}
            className="w-full text-left bg-surface hover:bg-surface-light rounded-2xl border border-border hover:border-teal-500/50 p-6 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-teal-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground group-hover:text-teal-400 transition-colors">
                    Universal Statement Digitizer
                  </h4>
                  <p className="text-sm text-muted mt-1">
                    Upload any bank statement and ledger from any bank worldwide — AI validates,
                    extracts, and reconciles transactions in 3 steps. Verify each match and
                    teach the system to learn your bank&apos;s format over time.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["Step A→B→C", "AI Validation", "Any Bank", "Blueprint Learning", "Verify & Correct"].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-400">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted group-hover:text-teal-400 transition-colors shrink-0 mt-1" />
            </div>
          </button>

          {/* Quotation Comparison */}
          <button
            onClick={() => router.push("/quotations")}
            className="w-full text-left bg-surface hover:bg-surface-light rounded-2xl border border-border hover:border-amber-500/50 p-6 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Scale className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground group-hover:text-amber-400 transition-colors">
                    Quotation Comparison
                  </h4>
                  <p className="text-sm text-muted mt-1">
                    Upload vendor quotations (PDF, images, Word, scanned docs). AI extracts
                    line items and builds a side-by-side comparison table with the cheapest
                    prices highlighted. Supports labor include/exclude toggle.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["Multi-Vendor", "Any Format", "AI Extraction", "Lowest Price", "Labor Toggle"].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted group-hover:text-amber-400 transition-colors shrink-0 mt-1" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
