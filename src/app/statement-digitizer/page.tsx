"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Upload, X, Loader2, CheckCircle2, XCircle, Lock, FileText, BookOpen, GitCompare, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

/* ── Types ── */

type BankTransaction = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type StepAResult = {
  bankName: string;
  bankNameNormalized: string;
  accountTitle: string;
  accountNumber: string;
  currency: string;
  statementPeriod: string;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: BankTransaction[];
};

type LedgerEntry = {
  date: string;
  particulars: string;
  voucherType: string;
  voucherNo: string;
  debit: number;
  credit: number;
};

type StepBResult = {
  ledgerName: string;
  period: string;
  software: string;
  openingBalance: number | null;
  closingBalance: number | null;
  entries: LedgerEntry[];
};

type MatchedRow = {
  id: number;
  bankDate: string;
  bankDesc: string;
  bankDebit: number;
  bankCredit: number;
  ledgerDate: string;
  ledgerDesc: string;
  ledgerDebit: number;
  ledgerCredit: number;
  status: "matched" | "bank_only" | "ledger_only";
  verified: "pending" | "correct" | "wrong";
  correction?: CorrectionData;
};

type CorrectionData = {
  issue: "amount_in_ledger" | "amount_in_bank" | "amount_wrong";
  correctAmount?: number;
  source?: "bank" | "ledger";
  date?: string;
};

/* ── Number formatting ── */

function fmt(n: number, currency = "PKR"): string {
  if (n === 0) return "-";
  return `${currency} ${n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── Simple date-amount matching ── */

function reconcile(bank: BankTransaction[], ledger: LedgerEntry[]): MatchedRow[] {
  const rows: MatchedRow[] = [];
  let id = 0;
  const usedLedger = new Set<number>();

  for (const b of bank) {
    const bankAmt = b.debit || b.credit;
    const bankIsDebit = b.debit > 0;
    let matched = false;

    for (let li = 0; li < ledger.length; li++) {
      if (usedLedger.has(li)) continue;
      const l = ledger[li];
      const ledgerAmt = l.debit || l.credit;
      if (Math.abs(bankAmt - ledgerAmt) < 0.01 && b.date === l.date) {
        rows.push({
          id: id++,
          bankDate: b.date,
          bankDesc: b.description,
          bankDebit: b.debit,
          bankCredit: b.credit,
          ledgerDate: l.date,
          ledgerDesc: l.particulars,
          ledgerDebit: l.debit,
          ledgerCredit: l.credit,
          status: "matched",
          verified: "pending",
        });
        usedLedger.add(li);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Try amount-only match
      for (let li = 0; li < ledger.length; li++) {
        if (usedLedger.has(li)) continue;
        const l = ledger[li];
        const ledgerAmt = l.debit || l.credit;
        if (Math.abs(bankAmt - ledgerAmt) < 0.01) {
          rows.push({
            id: id++,
            bankDate: b.date,
            bankDesc: b.description,
            bankDebit: b.debit,
            bankCredit: b.credit,
            ledgerDate: l.date,
            ledgerDesc: l.particulars,
            ledgerDebit: l.debit,
            ledgerCredit: l.credit,
            status: "matched",
            verified: "pending",
          });
          usedLedger.add(li);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      rows.push({
        id: id++,
        bankDate: b.date,
        bankDesc: b.description,
        bankDebit: b.debit,
        bankCredit: b.credit,
        ledgerDate: "",
        ledgerDesc: "",
        ledgerDebit: 0,
        ledgerCredit: 0,
        status: "bank_only",
        verified: "pending",
      });
    }
  }

  for (let li = 0; li < ledger.length; li++) {
    if (usedLedger.has(li)) continue;
    const l = ledger[li];
    rows.push({
      id: id++,
      bankDate: "",
      bankDesc: "",
      bankDebit: 0,
      bankCredit: 0,
      ledgerDate: l.date,
      ledgerDesc: l.particulars,
      ledgerDebit: l.debit,
      ledgerCredit: l.credit,
      status: "ledger_only",
      verified: "pending",
    });
  }

  return rows;
}

/* ── Main Component ── */

export default function StatementDigitizerPage() {
  const router = useRouter();
  const [step, setStep] = useState<"A" | "B" | "C">("A");

  // Step A state
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [bankPassword, setBankPassword] = useState("");
  const [bankPasswordPrompt, setBankPasswordPrompt] = useState(false);
  const [stepALoading, setStepALoading] = useState(false);
  const [stepAError, setStepAError] = useState("");
  const [stepAResult, setStepAResult] = useState<StepAResult | null>(null);

  // Step B state
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [ledgerPassword, setLedgerPassword] = useState("");
  const [ledgerPasswordPrompt, setLedgerPasswordPrompt] = useState(false);
  const [stepBLoading, setStepBLoading] = useState(false);
  const [stepBError, setStepBError] = useState("");
  const [stepBResult, setStepBResult] = useState<StepBResult | null>(null);

  // Step C state
  const [matchedRows, setMatchedRows] = useState<MatchedRow[]>([]);
  const [correctionTarget, setCorrectionTarget] = useState<MatchedRow | null>(null);
  const [correctionStep, setCorrectionStep] = useState<"issue" | "amount" | "source" | "date">("issue");
  const [correctionData, setCorrectionData] = useState<Partial<CorrectionData>>({});

  /* ── Step A: Process Bank Statement ── */

  async function processStepA(pw?: string) {
    if (!bankFile) return;
    setStepALoading(true);
    setStepAError("");
    setBankPasswordPrompt(false);

    try {
      const fd = new FormData();
      fd.append("step", "A");
      fd.append("file", bankFile);
      if (pw) fd.append("password", pw);

      const res = await fetch("/api/statement-digitizer", { method: "POST", body: fd });
      const data = await res.json();

      if (data.passwordRequired) {
        setBankPasswordPrompt(true);
        setStepALoading(false);
        return;
      }

      if (data.error) {
        setStepAError(data.error);
      } else if (!data.valid) {
        setStepAError(data.reason || "This file is not a valid bank statement.");
      } else {
        setStepAResult(data);
      }
    } catch {
      setStepAError("Connection error. Please try again.");
    } finally {
      setStepALoading(false);
    }
  }

  /* ── Step B: Process Ledger ── */

  async function processStepB(pw?: string) {
    if (!ledgerFile) return;
    setStepBLoading(true);
    setStepBError("");
    setLedgerPasswordPrompt(false);

    try {
      const fd = new FormData();
      fd.append("step", "B");
      fd.append("file", ledgerFile);
      if (pw) fd.append("password", pw);

      const res = await fetch("/api/statement-digitizer", { method: "POST", body: fd });
      const data = await res.json();

      if (data.passwordRequired) {
        setLedgerPasswordPrompt(true);
        setStepBLoading(false);
        return;
      }

      if (data.error) {
        setStepBError(data.error);
      } else if (!data.valid) {
        setStepBError(data.reason || "This file is not a valid ledger.");
      } else {
        setStepBResult(data);
      }
    } catch {
      setStepBError("Connection error. Please try again.");
    } finally {
      setStepBLoading(false);
    }
  }

  /* ── Step C: Run Reconciliation ── */

  function runReconciliation() {
    if (!stepAResult || !stepBResult) return;
    const rows = reconcile(stepAResult.transactions, stepBResult.entries);
    setMatchedRows(rows);
    setStep("C");
  }

  /* ── Correction Flow ── */

  function startCorrection(row: MatchedRow) {
    setCorrectionTarget(row);
    setCorrectionStep("issue");
    setCorrectionData({});
  }

  function selectIssue(issue: CorrectionData["issue"]) {
    setCorrectionData({ issue });
    if (issue === "amount_wrong") {
      setCorrectionStep("amount");
    } else {
      setCorrectionStep("date");
    }
  }

  function submitCorrectionAmount(amount: number) {
    setCorrectionData((prev) => ({ ...prev, correctAmount: amount }));
    setCorrectionStep("source");
  }

  function submitCorrectionSource(source: "bank" | "ledger") {
    setCorrectionData((prev) => ({ ...prev, source }));
    setCorrectionStep("date");
  }

  function submitCorrectionDate(date: string) {
    if (!correctionTarget) return;
    const full: CorrectionData = {
      issue: correctionData.issue!,
      correctAmount: correctionData.correctAmount,
      source: correctionData.source,
      date,
    };
    setMatchedRows((prev) =>
      prev.map((r) =>
        r.id === correctionTarget.id ? { ...r, verified: "wrong", correction: full } : r
      )
    );
    setCorrectionTarget(null);
  }

  function markCorrect(row: MatchedRow) {
    setMatchedRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, verified: "correct" } : r))
    );
  }

  /* ── Counts ── */
  const totalRows = matchedRows.length;
  const verifiedCount = matchedRows.filter((r) => r.verified !== "pending").length;
  const correctCount = matchedRows.filter((r) => r.verified === "correct").length;
  const wrongCount = matchedRows.filter((r) => r.verified === "wrong").length;
  const matchedCount = matchedRows.filter((r) => r.status === "matched").length;
  const bankOnlyCount = matchedRows.filter((r) => r.status === "bank_only").length;
  const ledgerOnlyCount = matchedRows.filter((r) => r.status === "ledger_only").length;

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-foreground">Universal Statement Digitizer</h1>
          <p className="text-xs text-muted">AI-powered bank statement & ledger reconciliation — any bank, any format</p>
        </div>
        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {(["A", "B", "C"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={`w-6 h-px ${step >= s ? "bg-teal-500" : "bg-border"}`} />}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? "bg-teal-500 text-white" :
                step > s ? "bg-teal-500/20 text-teal-400" :
                "bg-surface-light text-muted"
              }`}>
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
            </div>
          ))}
        </div>
      </header>

      <div className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full space-y-6 animate-fade-in">

        {/* ═══ STEP A: Bank Statement ═══ */}
        {step === "A" && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Step A — Upload Bank Statement</h2>
                <p className="text-sm text-muted">Upload a bank-issued statement (PDF, Excel, or CSV)</p>
              </div>
            </div>

            {!stepAResult ? (
              <div className="space-y-4">
                {/* Upload zone */}
                <label className="block border-2 border-dashed border-border hover:border-teal-500/50 rounded-2xl p-8 text-center cursor-pointer transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.xls,.xlsx,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { setBankFile(f); setStepAError(""); setBankPasswordPrompt(false); }
                    }}
                  />
                  <Upload className="w-8 h-8 text-muted mx-auto mb-3" />
                  <p className="text-sm text-muted">Click to select a bank statement file</p>
                  <p className="text-xs text-muted/50 mt-1">PDF, XLS, XLSX, CSV — max 30 MB</p>
                </label>

                {bankFile && (
                  <div className="flex items-center gap-3 bg-surface rounded-xl border border-border px-4 py-3">
                    <FileText className="w-4 h-4 text-teal-400" />
                    <span className="text-sm text-foreground flex-1 truncate">{bankFile.name}</span>
                    <button onClick={() => { setBankFile(null); setStepAError(""); }} className="text-muted hover:text-red-400 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Password prompt */}
                {bankPasswordPrompt && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                      <Lock className="w-4 h-4" />
                      This PDF is password-protected
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={bankPassword}
                        onChange={(e) => setBankPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && processStepA(bankPassword)}
                        placeholder="Enter PDF password"
                        autoFocus
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-amber-500/50"
                      />
                      <button
                        onClick={() => processStepA(bankPassword)}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-500/80 text-white text-sm font-medium rounded-lg cursor-pointer"
                      >
                        Unlock
                      </button>
                    </div>
                  </div>
                )}

                {stepAError && (
                  <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    {stepAError}
                  </div>
                )}

                <button
                  onClick={() => processStepA()}
                  disabled={!bankFile || stepALoading}
                  className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-500/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
                >
                  {stepALoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Bank Statement...</>
                  ) : (
                    <><FileText className="w-4 h-4" /> Validate & Extract</>
                  )}
                </button>
              </div>
            ) : (
              /* Step A Results */
              <div className="space-y-4">
                <div className="bg-teal-500/10 border border-teal-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-teal-400 text-sm font-medium mb-3">
                    <CheckCircle2 className="w-4 h-4" />
                    Bank statement validated successfully
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted">Bank:</span> <span className="text-foreground font-medium">{stepAResult.bankNameNormalized}</span></div>
                    <div><span className="text-muted">Account:</span> <span className="text-foreground font-medium">{stepAResult.accountNumber}</span></div>
                    <div><span className="text-muted">Title:</span> <span className="text-foreground font-medium">{stepAResult.accountTitle}</span></div>
                    <div><span className="text-muted">Period:</span> <span className="text-foreground font-medium">{stepAResult.statementPeriod}</span></div>
                    <div><span className="text-muted">Currency:</span> <span className="text-foreground font-medium">{stepAResult.currency}</span></div>
                    <div><span className="text-muted">Transactions:</span> <span className="text-foreground font-medium">{stepAResult.transactions.length}</span></div>
                    {stepAResult.openingBalance !== null && (
                      <div><span className="text-muted">Opening:</span> <span className="text-foreground font-medium">{fmt(stepAResult.openingBalance, stepAResult.currency)}</span></div>
                    )}
                    {stepAResult.closingBalance !== null && (
                      <div><span className="text-muted">Closing:</span> <span className="text-foreground font-medium">{fmt(stepAResult.closingBalance, stepAResult.currency)}</span></div>
                    )}
                  </div>
                </div>

                {/* Transaction preview */}
                <div className="bg-surface rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Extracted Transactions ({stepAResult.transactions.length})</h3>
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-light sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-muted font-medium">#</th>
                          <th className="text-left px-3 py-2 text-muted font-medium">Date</th>
                          <th className="text-left px-3 py-2 text-muted font-medium">Description</th>
                          <th className="text-right px-3 py-2 text-muted font-medium">Debit</th>
                          <th className="text-right px-3 py-2 text-muted font-medium">Credit</th>
                          <th className="text-right px-3 py-2 text-muted font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stepAResult.transactions.map((t, i) => (
                          <tr key={i} className="border-t border-border/50 hover:bg-surface-light/50">
                            <td className="px-3 py-1.5 text-muted">{i + 1}</td>
                            <td className="px-3 py-1.5 text-foreground whitespace-nowrap">{t.date}</td>
                            <td className="px-3 py-1.5 text-foreground max-w-xs truncate">{t.description}</td>
                            <td className="px-3 py-1.5 text-right text-red-400">{t.debit ? fmt(t.debit, stepAResult.currency) : "-"}</td>
                            <td className="px-3 py-1.5 text-right text-green-400">{t.credit ? fmt(t.credit, stepAResult.currency) : "-"}</td>
                            <td className="px-3 py-1.5 text-right text-foreground">{fmt(t.balance, stepAResult.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setStepAResult(null); setBankFile(null); setStepAError(""); }}
                    className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-border text-foreground font-medium py-3 rounded-xl cursor-pointer transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" /> Re-upload
                  </button>
                  <button
                    onClick={() => setStep("B")}
                    className="flex-1 flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-500/80 text-white font-semibold py-3 rounded-xl cursor-pointer transition-all"
                  >
                    Continue to Step B <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ STEP B: Ledger ═══ */}
        {step === "B" && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Step B — Upload Ledger</h2>
                <p className="text-sm text-muted">Upload the company ledger (any format — Tally, QuickBooks, manual, etc.)</p>
              </div>
            </div>

            {/* Bank statement summary badge */}
            {stepAResult && (
              <div className="flex items-center gap-2 bg-teal-500/10 border border-teal-500/30 rounded-lg px-3 py-2 text-xs text-teal-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Bank: {stepAResult.bankNameNormalized} — {stepAResult.transactions.length} transactions extracted
              </div>
            )}

            {!stepBResult ? (
              <div className="space-y-4">
                <label className="block border-2 border-dashed border-border hover:border-indigo-500/50 rounded-2xl p-8 text-center cursor-pointer transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.xls,.xlsx,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { setLedgerFile(f); setStepBError(""); setLedgerPasswordPrompt(false); }
                    }}
                  />
                  <Upload className="w-8 h-8 text-muted mx-auto mb-3" />
                  <p className="text-sm text-muted">Click to select a ledger file</p>
                  <p className="text-xs text-muted/50 mt-1">PDF, XLS, XLSX, CSV — any accounting software format</p>
                </label>

                {ledgerFile && (
                  <div className="flex items-center gap-3 bg-surface rounded-xl border border-border px-4 py-3">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm text-foreground flex-1 truncate">{ledgerFile.name}</span>
                    <button onClick={() => { setLedgerFile(null); setStepBError(""); }} className="text-muted hover:text-red-400 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {ledgerPasswordPrompt && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                      <Lock className="w-4 h-4" />
                      This PDF is password-protected
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={ledgerPassword}
                        onChange={(e) => setLedgerPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && processStepB(ledgerPassword)}
                        placeholder="Enter PDF password"
                        autoFocus
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-amber-500/50"
                      />
                      <button
                        onClick={() => processStepB(ledgerPassword)}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-500/80 text-white text-sm font-medium rounded-lg cursor-pointer"
                      >
                        Unlock
                      </button>
                    </div>
                  </div>
                )}

                {stepBError && (
                  <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    {stepBError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep("A")}
                    className="flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-border text-foreground font-medium py-3 px-6 rounded-xl cursor-pointer transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={() => processStepB()}
                    disabled={!ledgerFile || stepBLoading}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-500/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
                  >
                    {stepBLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Ledger...</>
                    ) : (
                      <><BookOpen className="w-4 h-4" /> Validate & Extract</>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium mb-3">
                    <CheckCircle2 className="w-4 h-4" />
                    Ledger validated successfully
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted">Ledger:</span> <span className="text-foreground font-medium">{stepBResult.ledgerName}</span></div>
                    <div><span className="text-muted">Period:</span> <span className="text-foreground font-medium">{stepBResult.period}</span></div>
                    <div><span className="text-muted">Software:</span> <span className="text-foreground font-medium">{stepBResult.software}</span></div>
                    <div><span className="text-muted">Entries:</span> <span className="text-foreground font-medium">{stepBResult.entries.length}</span></div>
                  </div>
                </div>

                <div className="bg-surface rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Extracted Entries ({stepBResult.entries.length})</h3>
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-light sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-muted font-medium">#</th>
                          <th className="text-left px-3 py-2 text-muted font-medium">Date</th>
                          <th className="text-left px-3 py-2 text-muted font-medium">Particulars</th>
                          <th className="text-left px-3 py-2 text-muted font-medium">Vch</th>
                          <th className="text-right px-3 py-2 text-muted font-medium">Debit</th>
                          <th className="text-right px-3 py-2 text-muted font-medium">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stepBResult.entries.map((e, i) => (
                          <tr key={i} className="border-t border-border/50 hover:bg-surface-light/50">
                            <td className="px-3 py-1.5 text-muted">{i + 1}</td>
                            <td className="px-3 py-1.5 text-foreground whitespace-nowrap">{e.date}</td>
                            <td className="px-3 py-1.5 text-foreground max-w-xs truncate">{e.particulars}</td>
                            <td className="px-3 py-1.5 text-muted">{e.voucherNo}</td>
                            <td className="px-3 py-1.5 text-right text-red-400">{e.debit ? fmt(e.debit) : "-"}</td>
                            <td className="px-3 py-1.5 text-right text-green-400">{e.credit ? fmt(e.credit) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setStepBResult(null); setLedgerFile(null); setStepBError(""); }}
                    className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-border text-foreground font-medium py-3 rounded-xl cursor-pointer transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" /> Re-upload
                  </button>
                  <button
                    onClick={runReconciliation}
                    className="flex-1 flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-500/80 text-white font-semibold py-3 rounded-xl cursor-pointer transition-all"
                  >
                    <GitCompare className="w-4 h-4" /> Run Reconciliation
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ STEP C: Reconciliation & Verification ═══ */}
        {step === "C" && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <GitCompare className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Step C — Reconciliation & Verification</h2>
                <p className="text-sm text-muted">Verify each transaction — mark correct or flag errors</p>
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-surface rounded-xl border border-border p-3 text-center">
                <p className="text-xs text-muted">Total</p>
                <p className="text-lg font-bold text-foreground">{totalRows}</p>
              </div>
              <div className="bg-surface rounded-xl border border-teal-500/30 p-3 text-center">
                <p className="text-xs text-muted">Matched</p>
                <p className="text-lg font-bold text-teal-400">{matchedCount}</p>
              </div>
              <div className="bg-surface rounded-xl border border-amber-500/30 p-3 text-center">
                <p className="text-xs text-muted">Bank Only</p>
                <p className="text-lg font-bold text-amber-400">{bankOnlyCount}</p>
              </div>
              <div className="bg-surface rounded-xl border border-rose-500/30 p-3 text-center">
                <p className="text-xs text-muted">Ledger Only</p>
                <p className="text-lg font-bold text-rose-400">{ledgerOnlyCount}</p>
              </div>
              <div className="bg-surface rounded-xl border border-violet-500/30 p-3 text-center">
                <p className="text-xs text-muted">Verified</p>
                <p className="text-lg font-bold text-violet-400">{verifiedCount}/{totalRows}</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-surface-light rounded-full h-2">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-violet-500 transition-all"
                style={{ width: `${totalRows > 0 ? (verifiedCount / totalRows) * 100 : 0}%` }}
              />
            </div>

            {/* Reconciliation table */}
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface-light">
                    <tr>
                      <th className="px-2 py-2 text-muted font-medium text-center w-8">#</th>
                      <th className="px-2 py-2 text-muted font-medium text-left">Status</th>
                      <th className="px-2 py-2 text-muted font-medium text-left">Bank Date</th>
                      <th className="px-2 py-2 text-muted font-medium text-left">Bank Description</th>
                      <th className="px-2 py-2 text-muted font-medium text-right">Bank Amt</th>
                      <th className="px-2 py-2 text-muted font-medium text-left">Ledger Date</th>
                      <th className="px-2 py-2 text-muted font-medium text-left">Ledger Particulars</th>
                      <th className="px-2 py-2 text-muted font-medium text-right">Ledger Amt</th>
                      <th className="px-2 py-2 text-muted font-medium text-center w-20">Verify</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchedRows.map((row, i) => (
                      <tr key={row.id} className={`border-t border-border/50 ${
                        row.verified === "correct" ? "bg-green-500/5" :
                        row.verified === "wrong" ? "bg-red-500/5" :
                        row.status === "bank_only" ? "bg-amber-500/5" :
                        row.status === "ledger_only" ? "bg-rose-500/5" : ""
                      }`}>
                        <td className="px-2 py-2 text-muted text-center">{i + 1}</td>
                        <td className="px-2 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            row.status === "matched" ? "bg-teal-500/20 text-teal-400" :
                            row.status === "bank_only" ? "bg-amber-500/20 text-amber-400" :
                            "bg-rose-500/20 text-rose-400"
                          }`}>
                            {row.status === "matched" ? "Match" : row.status === "bank_only" ? "Bank" : "Ledger"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-foreground whitespace-nowrap">{row.bankDate || "-"}</td>
                        <td className="px-2 py-2 text-foreground max-w-[150px] truncate">{row.bankDesc || "-"}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          {row.bankDebit ? <span className="text-red-400">{fmt(row.bankDebit)}</span> :
                           row.bankCredit ? <span className="text-green-400">{fmt(row.bankCredit)}</span> : "-"}
                        </td>
                        <td className="px-2 py-2 text-foreground whitespace-nowrap">{row.ledgerDate || "-"}</td>
                        <td className="px-2 py-2 text-foreground max-w-[150px] truncate">{row.ledgerDesc || "-"}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          {row.ledgerDebit ? <span className="text-red-400">{fmt(row.ledgerDebit)}</span> :
                           row.ledgerCredit ? <span className="text-green-400">{fmt(row.ledgerCredit)}</span> : "-"}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {row.verified === "correct" ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />
                          ) : row.verified === "wrong" ? (
                            <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => markCorrect(row)} className="p-1 hover:bg-green-500/20 rounded cursor-pointer" title="Correct">
                                <CheckCircle2 className="w-4 h-4 text-muted hover:text-green-400" />
                              </button>
                              <button onClick={() => startCorrection(row)} className="p-1 hover:bg-red-500/20 rounded cursor-pointer" title="Wrong">
                                <XCircle className="w-4 h-4 text-muted hover:text-red-400" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Verification summary when all done */}
            {verifiedCount === totalRows && totalRows > 0 && (
              <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-violet-400 font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  All transactions verified
                </div>
                <div className="text-sm text-muted">
                  {correctCount} correct, {wrongCount} flagged with corrections.
                  {wrongCount > 0 && " The system will learn from your corrections for future accuracy."}
                </div>
                {wrongCount > 0 && (
                  <button
                    onClick={() => {
                      // TODO: Send corrections to AI for Blueprint Learning
                      alert("Blueprint Learning will process corrections and re-run. (Coming soon)");
                    }}
                    className="flex items-center justify-center gap-2 bg-violet-500 hover:bg-violet-500/80 text-white font-semibold py-3 px-6 rounded-xl cursor-pointer transition-all"
                  >
                    <ArrowRight className="w-4 h-4" /> Apply Corrections & Re-run
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ Correction Modal ═══ */}
      {correctionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Report Issue</h3>
              <button onClick={() => setCorrectionTarget(null)} className="text-muted hover:text-foreground cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-muted bg-surface-light rounded-lg p-3">
              <div>Bank: {correctionTarget.bankDesc || "N/A"} — {correctionTarget.bankDebit ? fmt(correctionTarget.bankDebit) : correctionTarget.bankCredit ? fmt(correctionTarget.bankCredit) : "N/A"}</div>
              <div>Ledger: {correctionTarget.ledgerDesc || "N/A"} — {correctionTarget.ledgerDebit ? fmt(correctionTarget.ledgerDebit) : correctionTarget.ledgerCredit ? fmt(correctionTarget.ledgerCredit) : "N/A"}</div>
            </div>

            {/* Step: Issue Type */}
            {correctionStep === "issue" && (
              <div className="space-y-2">
                <p className="text-sm text-foreground font-medium">What went wrong?</p>
                <button onClick={() => selectIssue("amount_in_ledger")} className="w-full text-left px-4 py-3 bg-surface-light hover:bg-indigo-500/10 border border-border hover:border-indigo-500/50 rounded-xl text-sm text-foreground cursor-pointer transition-all">
                  Amount available in ledger
                </button>
                <button onClick={() => selectIssue("amount_in_bank")} className="w-full text-left px-4 py-3 bg-surface-light hover:bg-teal-500/10 border border-border hover:border-teal-500/50 rounded-xl text-sm text-foreground cursor-pointer transition-all">
                  Amount available in bank statement
                </button>
                <button onClick={() => selectIssue("amount_wrong")} className="w-full text-left px-4 py-3 bg-surface-light hover:bg-red-500/10 border border-border hover:border-red-500/50 rounded-xl text-sm text-foreground cursor-pointer transition-all">
                  Amount reported wrongfully
                </button>
              </div>
            )}

            {/* Step: Correct Amount */}
            {correctionStep === "amount" && (
              <div className="space-y-3">
                <p className="text-sm text-foreground font-medium">Enter the correct amount</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">{stepAResult?.currency || "PKR"}</span>
                  <input
                    type="text"
                    autoFocus
                    placeholder="0.00"
                    className="w-full bg-background border border-border rounded-xl pl-12 pr-4 py-3 text-foreground text-right text-lg font-mono focus:outline-none focus:border-violet-500/50"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = parseFloat((e.target as HTMLInputElement).value.replace(/,/g, ""));
                        if (!isNaN(val) && val > 0) submitCorrectionAmount(val);
                      }
                    }}
                    onBlur={(e) => {
                      const raw = e.target.value.replace(/,/g, "");
                      const val = parseFloat(raw);
                      if (!isNaN(val)) {
                        e.target.value = val.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      }
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    const input = document.querySelector<HTMLInputElement>("input[placeholder='0.00']");
                    const val = parseFloat((input?.value || "0").replace(/,/g, ""));
                    if (!isNaN(val) && val > 0) submitCorrectionAmount(val);
                  }}
                  className="w-full bg-violet-500 hover:bg-violet-500/80 text-white font-semibold py-3 rounded-xl cursor-pointer transition-all"
                >
                  Next
                </button>
              </div>
            )}

            {/* Step: Source */}
            {correctionStep === "source" && (
              <div className="space-y-2">
                <p className="text-sm text-foreground font-medium">Where is this correct amount mentioned?</p>
                <button onClick={() => submitCorrectionSource("bank")} className="w-full text-left px-4 py-3 bg-surface-light hover:bg-teal-500/10 border border-border hover:border-teal-500/50 rounded-xl text-sm text-foreground cursor-pointer transition-all">
                  Bank Statement
                </button>
                <button onClick={() => submitCorrectionSource("ledger")} className="w-full text-left px-4 py-3 bg-surface-light hover:bg-indigo-500/10 border border-border hover:border-indigo-500/50 rounded-xl text-sm text-foreground cursor-pointer transition-all">
                  Ledger
                </button>
              </div>
            )}

            {/* Step: Date */}
            {correctionStep === "date" && (
              <div className="space-y-3">
                <p className="text-sm text-foreground font-medium">Enter the transaction date</p>
                <input
                  type="date"
                  autoFocus
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-violet-500/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      submitCorrectionDate((e.target as HTMLInputElement).value);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.querySelector<HTMLInputElement>("input[type='date']");
                    if (input?.value) submitCorrectionDate(input.value);
                  }}
                  className="w-full bg-violet-500 hover:bg-violet-500/80 text-white font-semibold py-3 rounded-xl cursor-pointer transition-all"
                >
                  Submit Correction
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
