"use client";

import { useState, useCallback } from "react";
import {
  ArrowLeft, Upload, Loader2, CreditCard,
  ChevronDown, ChevronUp, Download, AlertTriangle,
  Check, X, ShoppingBag, Clock, CheckCircle2, Eye,
  Sparkles, FileText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Link2 } from "lucide-react";

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

interface StatementMeta {
  cardholderName: string;
  cardLast4: string;
  statementMonth: string;
  paymentDueDate: string;
  previousBalance: number | null;
  purchases: number | null;
  feeAndCharges: number | null;
  payments: number | null;
  currentBalance: number | null;
  minimumAmountDue: number | null;
}

interface Results {
  transactionCount: number;
  groupCount: number;
  totalSpend: string;
  totalPayments: string;
  netAmount: string;
  groups: MerchantGroup[];
  meta?: StatementMeta;
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
  const [useAI, setUseAI] = useState(true);

  // Verification state: txnId -> status
  const [verifications, setVerifications] = useState<Record<string, VerifyStatus>>({});
  // Expanded groups
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Password support
  const [passwordPrompt, setPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  // Format preview
  const [showPreview, setShowPreview] = useState(false);

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
      fd.append("useAI", String(useAI));
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
      if (data.usage) {
        fetch("/api/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module: "Credit Card", model: data.usage.model, input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens }) }).catch(() => {});
      }
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
    ws["!cols"] = [
      { wch: 14 }, // Date
      { wch: 40 }, // Merchant
      { wch: 16 }, // Amount
      { wch: 16 }, // Type
      { wch: 20 }, // Status
    ];

    // SCB Format sheet
    const allTxns = results.groups.flatMap(g => g.transactions);
    const debits = allTxns.filter(t => t.type === "debit");
    const credits = allTxns.filter(t => t.type === "credit");

    const totalSpendRaw = debits.reduce((s, t) => s + t.amountRaw, 0);
    const totalPaymentsRaw = credits.reduce((s, t) => s + t.amountRaw, 0);

    const meta = results.meta;
    const cardholderName = meta?.cardholderName || "N/A";
    const cardLast4 = meta?.cardLast4 || "XXXX";

    let monthLabel = meta?.statementMonth || "";
    if (!monthLabel) {
      const months = [...new Set(debits.map(t => t.date).filter(Boolean))];
      const firstDate = months.length > 0 ? months[0] : "";
      if (firstDate) {
        const parts = firstDate.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (parts) {
          const monthNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
          monthLabel = `${monthNames[parseInt(parts[2]) - 1]}-${parts[3]}`;
        }
      }
    }

    const paymentDueDate = meta?.paymentDueDate || "";

    const scbRows: (string | number | null)[][] = [];
    scbRows.push([cardholderName]);
    scbRows.push([`SCB Credit Card # ${cardLast4}`]);
    scbRows.push([`Month Of ${monthLabel || "N/A"}`]);
    scbRows.push([paymentDueDate ? `Payment Due Date  : ${paymentDueDate}` : ""]);
    scbRows.push(["S.No", "Description", "Amount"]);

    const debitGroups = results.groups.filter(g => g.totalRaw > 0);
    debitGroups.forEach((group, i) => {
      scbRows.push([i + 1, group.header, Math.abs(group.totalRaw)]);
    });

    scbRows.push([]);
    if (meta?.previousBalance != null) scbRows.push([null, "Previous Balance", meta.previousBalance]);
    scbRows.push([null, "Purchases", meta?.purchases ?? totalSpendRaw]);
    if (meta?.feeAndCharges != null && meta.feeAndCharges > 0) scbRows.push([null, "Fee & Charges", meta.feeAndCharges]);
    scbRows.push([null, "Payments", meta?.payments ?? totalPaymentsRaw]);
    scbRows.push([null, "Current Balance", meta?.currentBalance ?? (totalSpendRaw - totalPaymentsRaw)]);
    if (meta?.minimumAmountDue != null) scbRows.push([null, "Minimum Amount Due", meta.minimumAmountDue]);

    const ws2 = XLSX.utils.aoa_to_sheet(scbRows);
    ws2["!cols"] = [
      { wch: 6 },  // S.No
      { wch: 40 }, // Description
      { wch: 18 }, // Amount
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Kafi Commodities Format");

    XLSX.writeFile(wb, "credit-card-verification.xlsx");
  }

  // ── CSV export ────────────────────────────────────────
  function downloadCSV() {
    if (!results) return;
    const rows: string[] = [["Date", "Merchant", "Amount", "Type", "Status"].join(",")];
    for (const group of results.groups) {
      for (const txn of group.transactions) {
        const status = verifications[txn.id];
        const statusLabel = status === "verified" ? "Verified" : status === "disputed" ? "Disputed" : "Pending";
        rows.push([
          `"${txn.date}"`,
          `"${txn.merchant.replace(/"/g, '""')}"`,
          txn.amountRaw,
          txn.type === "debit" ? "Purchase" : "Payment/Refund",
          statusLabel,
        ].join(","));
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "credit-card-verification.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── PDF export ────────────────────────────────────────
  async function downloadPDF() {
    if (!results) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFontSize(14);
    doc.text("Kafi Commodities — Credit Card Verification Report", 14, 16);
    const stats = getStats();
    doc.setFontSize(9);
    doc.text(`Total: ${stats.total}   Verified: ${stats.verified}   Disputed: ${stats.disputed}   Pending: ${stats.unverified}   Total Spend: ${results.totalSpend}`, 14, 23);

    const body: (string | number)[][] = [];
    for (const group of results.groups) {
      body.push([{ content: `▸ ${group.header}  (${group.count} txns — ${group.total})`, colSpan: 5, styles: { fontStyle: "bold", fillColor: [40, 40, 60] } } as unknown as string]);
      for (const txn of group.transactions) {
        const status = verifications[txn.id];
        body.push([
          txn.date, txn.merchant, txn.amount,
          txn.type === "debit" ? "Purchase" : "Payment/Refund",
          status === "verified" ? "✓ Verified" : status === "disputed" ? "✗ Disputed" : "— Pending",
        ]);
      }
    }

    autoTable(doc, {
      startY: 28,
      head: [["Date", "Merchant", "Amount", "Type", "Status"]],
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 1: { cellWidth: 80 } },
    });

    doc.save("credit-card-verification.pdf");
  }

  // ── Google Drive shareable link ───────────────────────
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveLink, setDriveLink] = useState<string | null>(null);

  async function uploadToDrive() {
    if (!results) return;
    setDriveLoading(true);
    setDriveLink(null);
    try {
      // Build XLS in memory as base64
      const wb = XLSX.utils.book_new();
      const rows: Record<string, string | number>[] = [];
      for (const group of results.groups) {
        rows.push({ "Date": "", "Merchant": `▸ ${group.header}`, "Amount": "", "Type": "", "Status": `${group.count} txns — Total: ${group.total}` });
        for (const txn of group.transactions) {
          const s = verifications[txn.id];
          rows.push({ "Date": txn.date, "Merchant": txn.merchant, "Amount": txn.amountRaw, "Type": txn.type === "debit" ? "Purchase" : "Payment/Refund", "Status": s === "verified" ? "✓ Verified" : s === "disputed" ? "✗ Disputed" : "— Pending" });
        }
        rows.push({ "Date": "", "Merchant": "", "Amount": "", "Type": "", "Status": "" });
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Credit Card Verification");
      const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

      const now = new Date();
      const filename = `CC-Report-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}.xlsx`;

      const res = await fetch("/api/credit-card/export-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64 }),
      });
      const data = await res.json();
      if (res.ok && data.link) { setDriveLink(data.link); }
      else { alert(data.error || "Drive upload failed"); }
    } catch { alert("Drive upload failed — network error"); }
    setDriveLoading(false);
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

            {/* AI Toggle */}
            <div className="flex items-center justify-between bg-background/50 rounded-xl border border-border px-4 py-3">
              <div className="flex items-center gap-2.5">
                {useAI ? <Sparkles className="w-4 h-4 text-violet-400" /> : <FileText className="w-4 h-4 text-muted" />}
                <div>
                  <p className="text-sm font-semibold text-foreground">{useAI ? "AI Extraction" : "Local Parser"}</p>
                  <p className="text-[11px] text-muted">{useAI ? "Uses Anthropic API for accurate PDF parsing" : "Regex-based extraction — no API needed"}</p>
                </div>
              </div>
              <button
                onClick={() => setUseAI(!useAI)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${useAI ? "bg-violet-500" : "bg-muted/30"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${useAI ? "translate-x-5" : "translate-x-0"}`} />
              </button>
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
                  {useAI ? "Parsing Statement…" : "Processing — OCR may take up to 2 minutes for scanned PDFs…"}
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
                onClick={() => setShowPreview(true)}
                className="px-4 py-2 rounded-lg text-sm bg-primary/20 text-primary hover:bg-primary/30 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Eye className="w-4 h-4" /> View Format
                </span>
              </button>
              {/* Export options */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={downloadCSV} className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition cursor-pointer flex items-center gap-1.5">
                  <Download className="w-3 h-3" /> CSV
                </button>
                <button onClick={downloadExcel} className="px-3 py-1.5 rounded-lg text-xs bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30 transition cursor-pointer flex items-center gap-1.5">
                  <Download className="w-3 h-3" /> XLS
                </button>
                <button onClick={downloadPDF} className="px-3 py-1.5 rounded-lg text-xs bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition cursor-pointer flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> PDF
                </button>
                <button onClick={uploadToDrive} disabled={driveLoading} className="px-3 py-1.5 rounded-lg text-xs bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                  <Link2 className="w-3 h-3" /> {driveLoading ? "Uploading..." : "Drive Link"}
                </button>
                {driveLink && (
                  <a href={driveLink} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg text-xs bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30 transition flex items-center gap-1.5 animate-pulse">
                    <Link2 className="w-3 h-3" /> Open Link
                  </a>
                )}
              </div>
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

      {/* Kafi Commodities Format Preview Modal */}
      {showPreview && results && (() => {
        const allTxns = results.groups.flatMap(g => g.transactions);
        const debits = allTxns.filter(t => t.type === "debit");
        const credits = allTxns.filter(t => t.type === "credit");
        const totalSpendRaw = debits.reduce((s, t) => s + t.amountRaw, 0);
        const totalPaymentsRaw = credits.reduce((s, t) => s + t.amountRaw, 0);
        const meta = results.meta;
        const cardholderName = meta?.cardholderName || "N/A";
        const cardLast4 = meta?.cardLast4 || "XXXX";
        let monthLabel = meta?.statementMonth || "";
        if (!monthLabel) {
          const dates = [...new Set(debits.map(t => t.date).filter(Boolean))];
          const fd = dates.length > 0 ? dates[0] : "";
          if (fd) {
            const parts = fd.match(/(\d{2})-(\d{2})-(\d{4})/);
            if (parts) {
              const mn = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
              monthLabel = `${mn[parseInt(parts[2]) - 1]}-${parts[3]}`;
            }
          }
        }
        const paymentDueDate = meta?.paymentDueDate || "";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Kafi Commodities Format</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowPreview(false); downloadExcel(); }}
                    className="px-3 py-1.5 rounded-lg text-sm bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="overflow-auto flex-1 p-6">
                <table className="w-full border-collapse text-sm text-gray-800">
                  {/* Meta rows */}
                  <tbody>
                    <tr>
                      <td colSpan={3} className="py-1.5 text-base font-bold text-gray-900">{cardholderName}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-1.5 font-semibold text-gray-700">SCB Credit Card # {cardLast4}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-1.5 text-gray-600">Month Of {monthLabel || "N/A"}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-1.5 pb-4 text-gray-600">
                        {paymentDueDate ? `Payment Due Date  : ${paymentDueDate}` : ""}
                      </td>
                    </tr>

                    {/* Table header */}
                    <tr className="bg-gray-100 border-y border-gray-300">
                      <th className="px-3 py-2 text-left font-semibold w-12">S.No</th>
                      <th className="px-3 py-2 text-left font-semibold">Description</th>
                      <th className="px-3 py-2 text-right font-semibold w-28">Amount</th>
                    </tr>

                    {/* Grouped merchant rows */}
                    {results.groups.filter(g => g.totalRaw > 0).map((group, i) => (
                      <tr key={group.header} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                        <td className="px-3 py-1.5">{group.header}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(Math.abs(group.totalRaw))}</td>
                      </tr>
                    ))}

                    {/* Spacer */}
                    <tr><td colSpan={3} className="py-2" /></tr>

                    {/* Summary */}
                    {meta?.previousBalance != null && (
                      <tr className="border-t-2 border-gray-400">
                        <td colSpan={2} className="px-3 py-2 font-semibold text-gray-700">Previous Balance</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(meta.previousBalance)}</td>
                      </tr>
                    )}
                    <tr className={meta?.previousBalance == null ? "border-t-2 border-gray-400" : ""}>
                      <td colSpan={2} className="px-3 py-2 font-semibold text-gray-700">Purchases</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(meta?.purchases ?? totalSpendRaw)}</td>
                    </tr>
                    {meta?.feeAndCharges != null && meta.feeAndCharges > 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-2 font-semibold text-gray-700">Fee &amp; Charges</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(meta.feeAndCharges)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={2} className="px-3 py-2 font-semibold text-gray-700">Payments</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(meta?.payments ?? totalPaymentsRaw)}</td>
                    </tr>
                    <tr className="border-t border-gray-300 font-bold">
                      <td colSpan={2} className="px-3 py-2 text-gray-900">Current Balance</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(meta?.currentBalance ?? (totalSpendRaw - totalPaymentsRaw))}</td>
                    </tr>
                    {meta?.minimumAmountDue != null && (
                      <tr>
                        <td colSpan={2} className="px-3 py-2 font-semibold text-gray-700">Minimum Amount Due</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(meta.minimumAmountDue)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
