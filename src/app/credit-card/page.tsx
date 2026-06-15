"use client";

import { useState, useCallback } from "react";
import {
  ArrowLeft, Upload, Loader2, CreditCard,
  ChevronDown, ChevronUp, Download, AlertTriangle,
  Check, X, ShoppingBag, Clock, CheckCircle2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface TxnRow {
  id: string;
  date: string;
  merchant: string;
  amount: string;
  amountRaw: number;
  type: "debit" | "credit";
}

interface MerchantGroup {
  header: string;
  total: string;
  totalRaw: number;
  count: number;
  transactions: TxnRow[];
}

interface Results {
  transactionCount: number;
  groupCount: number;
  totalSpend: string;
  totalPayments: string;
  netAmount: string;
  groups: MerchantGroup[];
  warning?: string;
}

type VerifyStatus = "verified" | "unverified" | "disputed";

const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */
export default function CreditCardPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);

  // Verification state: txnId -> status
  const [verifications, setVerifications] = useState<Record<string, VerifyStatus>>({});
  // Expanded groups
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Password support
  const [passwordPrompt, setPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const toggleGroup = useCallback((header: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(header)) next.delete(header);
      else next.add(header);
      return next;
    });
  }, []);

  const setVerify = useCallback((id: string, status: VerifyStatus) => {
    setVerifications((prev) => ({ ...prev, [id]: status }));
  }, []);

  const verifyAllInGroup = useCallback((group: MerchantGroup, status: VerifyStatus) => {
    setVerifications((prev) => {
      const next = { ...prev };
      for (const txn of group.transactions) next[txn.id] = status;
      return next;
    });
  }, []);

  async function runAnalysis(password?: string) {
    if (!file) return;
    setLoading(true);
    setError("");
    setResults(null);
    setVerifications({});
    setExpanded(new Set());
    setPasswordPrompt(false);

    try {
      const fd = new FormData();
      fd.append("statementFile", file);
      if (password) fd.append("password", password);
      const res = await fetch("/api/credit-card", { method: "POST", body: fd });
      const data = await res.json();
      if (data.passwordRequired) {
        setPasswordPrompt(true);
        setPasswordInput("");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResults(data);
      setExpanded(new Set(data.groups.map((g: MerchantGroup) => g.header)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function submitPassword() {
    setPasswordPrompt(false);
    runAnalysis(passwordInput);
  }

  /* ── Stats ── */
  function getStats() {
    if (!results) return { verified: 0, disputed: 0, unverified: 0, total: 0 };
    const total = results.transactionCount;
    let verified = 0, disputed = 0;
    for (const v of Object.values(verifications)) {
      if (v === "verified") verified++;
      else if (v === "disputed") disputed++;
    }
    return { verified, disputed, unverified: total - verified - disputed, total };
  }

  function getGroupStatus(group: MerchantGroup): "complete" | "partial" | "none" {
    let verified = 0;
    for (const txn of group.transactions) {
      if (verifications[txn.id] === "verified") verified++;
    }
    if (verified === group.transactions.length) return "complete";
    if (verified > 0) return "partial";
    return "none";
  }

  /* ── Excel Export ── */
  function downloadExcel() {
    if (!results) return;
    const rows: Record<string, string | number>[] = [];

    for (const group of results.groups) {
      // Merchant header row
      rows.push({
        "Date": "",
        "Merchant": `▸ ${group.header}`,
        "Amount": "",
        "Type": "",
        "Status": `${group.count} transactions — Total: ${group.total}`,
      });
      for (const txn of group.transactions) {
        const status = verifications[txn.id];
        rows.push({
          "Date": txn.date,
          "Merchant": txn.merchant,
          "Amount": txn.amountRaw,
          "Type": txn.type === "debit" ? "Purchase" : "Payment/Refund",
          "Status": status === "verified" ? "✓ Verified" : status === "disputed" ? "✗ Disputed" : "— Pending",
        });
      }
      // Empty row between groups
      rows.push({ "Date": "", "Merchant": "", "Amount": "", "Type": "", "Status": "" });
    }

    // Summary
    const stats = getStats();
    rows.push({ "Date": "", "Merchant": "", "Amount": "", "Type": "", "Status": "" });
    rows.push({ "Date": "", "Merchant": "SUMMARY", "Amount": "", "Type": "", "Status": "" });
    rows.push({ "Date": "", "Merchant": "Total Transactions", "Amount": stats.total, "Type": "", "Status": "" });
    rows.push({ "Date": "", "Merchant": "Verified", "Amount": stats.verified, "Type": "", "Status": "" });
    rows.push({ "Date": "", "Merchant": "Disputed", "Amount": stats.disputed, "Type": "", "Status": "" });
    rows.push({ "Date": "", "Merchant": "Pending", "Amount": stats.unverified, "Type": "", "Status": "" });
    rows.push({ "Date": "", "Merchant": "Total Spend", "Amount": results.totalSpend, "Type": "", "Status": "" });
    rows.push({ "Date": "", "Merchant": "Total Payments", "Amount": results.totalPayments, "Type": "", "Status": "" });
    rows.push({ "Date": "", "Merchant": "Net Amount", "Amount": results.netAmount, "Type": "", "Status": "" });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Credit Card Verification");
    // Set column widths
    ws["!cols"] = [
      { wch: 14 }, // Date
      { wch: 40 }, // Merchant
      { wch: 16 }, // Amount
      { wch: 16 }, // Type
      { wch: 20 }, // Status
    ];
    XLSX.writeFile(wb, "credit-card-verification.xlsx");
  }

  const stats = getStats();

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-rose-400" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-foreground">Credit Card Statement Verification</h1>
          <p className="text-xs text-muted">Parse, group by merchant, and verify transactions</p>
        </div>
      </header>

      <div className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full space-y-6 animate-fade-in">
        {/* Upload Section */}
        {!results && (
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Upload Credit Card Statement</h2>
              <p className="text-sm text-muted mt-1">
                Supports PDF, Excel (.xls/.xlsx), and CSV files. Transactions will be auto-grouped by merchant.
              </p>
            </div>

            {/* File Input */}
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-foreground">Statement File</span>
                <div className="mt-2 relative">
                  <input
                    type="file"
                    accept=".pdf,.xls,.xlsx,.csv"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/20 file:text-primary hover:file:bg-primary/30 file:cursor-pointer cursor-pointer"
                  />
                </div>
              </label>
              {file && (
                <div className="flex items-center gap-2 text-sm text-accent">
                  <CreditCard className="w-4 h-4" />
                  <span>{file.name}</span>
                  <button onClick={() => setFile(null)} className="ml-auto text-muted hover:text-danger cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Analyze Button */}
            <button
              onClick={() => runAnalysis()}
              disabled={!file || loading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-rose-500 hover:bg-rose-600 text-white cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Parsing Statement…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" />
                  Parse & Group Transactions
                </span>
              )}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Password Prompt */}
        {passwordPrompt && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <p className="text-sm font-semibold text-amber-300">Password Required</p>
            </div>
            <p className="text-sm text-muted">This PDF is password-protected. Enter the password to unlock it:</p>
            <input
              type="password"
              placeholder="Enter PDF password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-amber-500/50"
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
              autoFocus
            />
            <button
              onClick={submitPassword}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 px-6 rounded-xl transition-all"
            >
              Unlock & Process
            </button>
          </div>
        )}

        {/* Warning */}
        {results?.warning && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <p className="text-sm text-warning">{results.warning}</p>
          </div>
        )}

        {/* Results */}
        {results && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-surface rounded-xl border border-border p-4">
                <p className="text-xs text-muted">Transactions</p>
                <p className="text-lg font-bold text-foreground">{results.transactionCount}</p>
              </div>
              <div className="bg-surface rounded-xl border border-border p-4">
                <p className="text-xs text-muted">Merchants</p>
                <p className="text-lg font-bold text-foreground">{results.groupCount}</p>
              </div>
              <div className="bg-surface rounded-xl border border-border p-4">
                <p className="text-xs text-muted">Total Spend</p>
                <p className="text-lg font-bold text-rose-400">{results.totalSpend}</p>
              </div>
              <div className="bg-surface rounded-xl border border-border p-4">
                <p className="text-xs text-muted">Payments</p>
                <p className="text-lg font-bold text-accent">{results.totalPayments}</p>
              </div>
              <div className="bg-surface rounded-xl border border-border p-4">
                <p className="text-xs text-muted">Net</p>
                <p className="text-lg font-bold text-foreground">{results.netAmount}</p>
              </div>
            </div>

            {/* Verification Progress */}
            <div className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Verification Progress</h3>
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent" /> {stats.verified} verified
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-danger" /> {stats.disputed} disputed
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-muted/30" /> {stats.unverified} pending
                  </span>
                </div>
              </div>
              <div className="w-full h-3 bg-background rounded-full overflow-hidden flex">
                {stats.verified > 0 && (
                  <div className="h-full bg-accent transition-all" style={{ width: `${(stats.verified / stats.total) * 100}%` }} />
                )}
                {stats.disputed > 0 && (
                  <div className="h-full bg-danger transition-all" style={{ width: `${(stats.disputed / stats.total) * 100}%` }} />
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setResults(null); setFile(null); setVerifications({}); setExpanded(new Set()); }}
                className="px-4 py-2 rounded-lg text-sm border border-border text-muted hover:text-foreground hover:border-foreground/30 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> New Statement
                </span>
              </button>
              <button
                onClick={downloadExcel}
                className="px-4 py-2 rounded-lg text-sm bg-accent/20 text-accent hover:bg-accent/30 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-4 h-4" /> Download Report
                </span>
              </button>
            </div>

            {/* Merchant Groups */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Transactions by Merchant
              </h3>

              {results.groups.map((group) => {
                const isOpen = expanded.has(group.header);
                const gStatus = getGroupStatus(group);

                return (
                  <div key={group.header} className="bg-surface rounded-2xl border border-border overflow-hidden">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(group.header)}
                      className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-light transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          gStatus === "complete" ? "bg-accent/20" : gStatus === "partial" ? "bg-warning/20" : "bg-rose-500/20"
                        }`}>
                          {gStatus === "complete" ? (
                            <CheckCircle2 className="w-5 h-5 text-accent" />
                          ) : (
                            <ShoppingBag className={`w-5 h-5 ${gStatus === "partial" ? "text-warning" : "text-rose-400"}`} />
                          )}
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground text-sm">{group.header}</h4>
                          <p className="text-xs text-muted mt-0.5">
                            {group.count} transaction{group.count !== 1 ? "s" : ""} — Total: {group.total}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {gStatus === "complete" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">All Verified</span>
                        )}
                        {isOpen ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                      </div>
                    </button>

                    {/* Transactions */}
                    {isOpen && (
                      <div className="border-t border-border">
                        {/* Quick actions */}
                        <div className="px-5 py-2 bg-background/50 flex items-center gap-2 text-xs">
                          <span className="text-muted">Quick:</span>
                          <button
                            onClick={() => verifyAllInGroup(group, "verified")}
                            className="px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition cursor-pointer"
                          >
                            Verify All
                          </button>
                          <button
                            onClick={() => verifyAllInGroup(group, "unverified")}
                            className="px-2 py-1 rounded bg-muted/10 text-muted hover:bg-muted/20 transition cursor-pointer"
                          >
                            Reset All
                          </button>
                        </div>

                        {/* Transaction Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-muted uppercase tracking-wider border-b border-border">
                                <th className="px-5 py-2 text-left w-10">#</th>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Description</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                                <th className="px-3 py-2 text-center">Type</th>
                                <th className="px-5 py-2 text-center">Verify</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.transactions.map((txn, i) => {
                                const status = verifications[txn.id] ?? "unverified";
                                return (
                                  <tr
                                    key={txn.id}
                                    className={`border-b border-border/50 transition ${
                                      status === "verified" ? "bg-accent/5" : status === "disputed" ? "bg-danger/5" : ""
                                    }`}
                                  >
                                    <td className="px-5 py-2.5 text-muted text-xs">{i + 1}</td>
                                    <td className="px-3 py-2.5 text-foreground whitespace-nowrap">
                                      <span className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-muted" />
                                        {txn.date}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-foreground">{txn.merchant}</td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                      <span className={txn.type === "credit" ? "text-accent" : "text-foreground"}>
                                        {txn.type === "credit" ? "-" : ""}{txn.amount}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        txn.type === "credit" ? "bg-accent/10 text-accent" : "bg-rose-500/10 text-rose-400"
                                      }`}>
                                        {txn.type === "debit" ? "Purchase" : "Refund"}
                                      </span>
                                    </td>
                                    <td className="px-5 py-2.5">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          onClick={() => setVerify(txn.id, status === "verified" ? "unverified" : "verified")}
                                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                                            status === "verified"
                                              ? "bg-accent text-white"
                                              : "bg-accent/10 text-accent hover:bg-accent/20"
                                          }`}
                                          title="Verify"
                                        >
                                          <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => setVerify(txn.id, status === "disputed" ? "unverified" : "disputed")}
                                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                                            status === "disputed"
                                              ? "bg-danger text-white"
                                              : "bg-danger/10 text-danger hover:bg-danger/20"
                                          }`}
                                          title="Dispute"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
