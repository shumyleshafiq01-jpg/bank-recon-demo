"use client";

import { useRouter } from "next/navigation";
import { Landmark, ArrowRight, BarChart3, Clock, User, ArrowDownUp, SlidersHorizontal } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();

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
        <div className="flex items-center gap-2 text-sm text-muted">
          <User className="w-4 h-4" />
          Guest User
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
                <p className="text-lg font-bold text-foreground">3</p>
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

          {/* Debit/Credit Comparison */}
          <button
            onClick={() => router.push("/compare")}
            className="w-full text-left bg-surface hover:bg-surface-light rounded-2xl border border-border hover:border-accent/50 p-6 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                  <ArrowDownUp className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground group-hover:text-accent transition-colors">
                    Debit / Credit Comparison
                  </h4>
                  <p className="text-sm text-muted mt-1">
                    Upload a bank statement (PDF) and journal ledger (Excel/CSV).
                    Instantly find amounts present in one file but missing from the
                    other — pure number matching, no AI interpretation.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["Bank PDF", "Ledger XLS/CSV", "Frequency Match", "Both Sides"].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted group-hover:text-accent transition-colors shrink-0 mt-1" />
            </div>
          </button>

          {/* Adjustments & Corrections */}
          <button
            onClick={() => router.push("/adjustments")}
            className="w-full text-left bg-surface hover:bg-surface-light rounded-2xl border border-border hover:border-warning/50 p-6 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground group-hover:text-warning transition-colors">
                    Adjustments & Corrections
                  </h4>
                  <p className="text-sm text-muted mt-1">
                    Takes missing entries from the comparison module and resolves them
                    further by matching dates, reference numbers, and document numbers.
                    Identifies outstanding cheques, bank charges, and timing differences.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["Date Match", "Ref / Doc #", "Cheque Tracing", "Corrections"].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-warning/10 text-warning">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted group-hover:text-warning transition-colors shrink-0 mt-1" />
            </div>
          </button>

          {/* Bank Reconciliation */}
          <button
            onClick={() => router.push("/recon")}
            className="w-full text-left bg-surface hover:bg-surface-light rounded-2xl border border-border hover:border-primary/50 p-6 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <Landmark className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    Bank Reconciliation
                  </h4>
                  <p className="text-sm text-muted mt-1">
                    Upload bank statements and journal ledgers. The AI agent will
                    cross-check transactions, detect missing entries, highlight
                    discrepancies, and generate a reconciliation summary with an
                    updated journal ledger — all pending your approval.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["PDF", "Excel", "Images", "Scanned Docs", "AI Cross-Check"].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted group-hover:text-primary transition-colors shrink-0 mt-1" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
