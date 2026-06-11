"use client";

import { useState } from "react";
import {
  ArrowLeft, Upload, FileText, Loader2, CheckCircle,
  ChevronRight, X, ArrowDownUp, ChevronDown, ChevronUp, Download,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type BankRow = { date: string; particulars: string; debit: number; credit: number };
type LedgerRow = { date: string; ref: string; desc: string; debit: number; credit: number };
type Summary = {
  bankMissingCount: number; bankMissingDR: string; bankMissingCR: string;
  ledgerMissingCount: number; ledgerMissingDR: string; ledgerMissingCR: string;
};
type Results = {
  bankTotal: number; ledgerTotal: number;
  bankMissing: BankRow[]; ledgerMissing: LedgerRow[];
  summary: Summary;
};

const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ComparePage() {
  const router = useRouter();
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [showA, setShowA] = useState(true);
  const [showB, setShowB] = useState(true);

  async function runCompare() {
    if (!bankFile || !ledgerFile) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const fd = new FormData();
      fd.append("bankFile", bankFile);
      fd.append("ledgerFile", ledgerFile);
      const res = await fetch("/api/compare", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResults(data);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setBankFile(null);
    setLedgerFile(null);
    setResults(null);
    setError("");
  }

  function downloadXLS() {
    if (!results) return;
    const wb = XLSX.utils.book_new();

    const bankRows = [
      ["Date", "Debit", "Credit"],
      ...results.bankMissing.map((r) => [r.date, r.debit || "", r.credit || ""]),
      ["TOTAL", results.bankMissing.reduce((s, r) => s + r.debit, 0), results.bankMissing.reduce((s, r) => s + r.credit, 0)],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(bankRows);
    ws1["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Bank Not In Ledger");

    const ledgerRows = [
      ["Date", "Debit", "Credit"],
      ...results.ledgerMissing.map((r) => [r.date, r.debit || "", r.credit || ""]),
      ["TOTAL", results.ledgerMissing.reduce((s, r) => s + r.debit, 0), results.ledgerMissing.reduce((s, r) => s + r.credit, 0)],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ledgerRows);
    ws2["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Ledger Not In Bank");

    XLSX.writeFile(wb, "Missing-Entries-Comparison.xlsx");
  }

  const ready = bankFile && ledgerFile && !loading;

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
          <ArrowDownUp className="w-3.5 h-3.5 text-accent" />
        </div>
        <span className="text-sm font-bold text-foreground">Debit / Credit Comparison</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">

          {/* Upload section */}
          {!results && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Bank Statement */}
              <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Bank Statement</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary ml-auto">PDF</span>
                </div>
                {bankFile ? (
                  <div className="flex items-center justify-between bg-background rounded-lg px-3 py-2.5 text-sm">
                    <div className="flex items-center gap-2 text-foreground min-w-0">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="truncate">{bankFile.name}</span>
                      <span className="text-xs text-muted shrink-0">({(bankFile.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button onClick={() => setBankFile(null)} className="text-muted hover:text-danger cursor-pointer shrink-0 ml-2">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => { setBankFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="rounded-xl border-2 border-dashed border-border bg-background p-8 text-center hover:border-primary/50 transition-colors">
                      <FileText className="w-6 h-6 text-primary mx-auto mb-2" />
                      <p className="text-xs font-medium text-foreground">Drop PDF here or click to browse</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Ledger */}
              <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-accent" />
                  <h3 className="text-sm font-semibold text-foreground">Journal Ledger</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent ml-auto">XLS / CSV</span>
                </div>
                {ledgerFile ? (
                  <div className="flex items-center justify-between bg-background rounded-lg px-3 py-2.5 text-sm">
                    <div className="flex items-center gap-2 text-foreground min-w-0">
                      <FileText className="w-4 h-4 text-accent shrink-0" />
                      <span className="truncate">{ledgerFile.name}</span>
                      <span className="text-xs text-muted shrink-0">({(ledgerFile.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button onClick={() => setLedgerFile(null)} className="text-muted hover:text-danger cursor-pointer shrink-0 ml-2">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="file"
                      accept=".xls,.xlsx,.csv"
                      onChange={(e) => { setLedgerFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="rounded-xl border-2 border-dashed border-border bg-background p-8 text-center hover:border-accent/50 transition-colors">
                      <FileText className="w-6 h-6 text-accent mx-auto mb-2" />
                      <p className="text-xs font-medium text-foreground">Drop XLS/CSV here or click to browse</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Run button */}
          {!results && (
            <button
              onClick={runCompare}
              disabled={!ready}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownUp className="w-4 h-4" />}
              {loading ? "Comparing..." : "Compare Debit / Credit"}
            </button>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-sm text-danger">{error}</div>
          )}

          {/* Results */}
          {results && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface rounded-xl border border-border p-4 text-center">
                  <p className="text-xs text-muted">Bank Entries</p>
                  <p className="text-lg font-bold text-foreground">{results.bankTotal}</p>
                </div>
                <div className="bg-surface rounded-xl border border-border p-4 text-center">
                  <p className="text-xs text-muted">Ledger Entries</p>
                  <p className="text-lg font-bold text-foreground">{results.ledgerTotal}</p>
                </div>
                <div className="bg-surface rounded-xl border border-primary/30 p-4 text-center">
                  <p className="text-xs text-muted">Bank Not in Ledger</p>
                  <p className="text-lg font-bold text-primary">{results.summary.bankMissingCount}</p>
                </div>
                <div className="bg-surface rounded-xl border border-accent/30 p-4 text-center">
                  <p className="text-xs text-muted">Ledger Not in Bank</p>
                  <p className="text-lg font-bold text-accent">{results.summary.ledgerMissingCount}</p>
                </div>
              </div>

              {/* Section A */}
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button
                  onClick={() => setShowA(!showA)}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                      A. Bank amounts NOT in ledger
                      <span className="ml-2 text-xs font-normal text-muted">({results.bankMissing.length} entries)</span>
                    </h3>
                  </div>
                  {showA ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showA && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-primary/10 text-primary">
                          <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                          <th className="px-4 py-2.5 text-left font-semibold">Particulars</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Debit</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.bankMissing.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-4 py-2 text-muted whitespace-nowrap">{r.date}</td>
                            <td className="px-4 py-2 text-foreground">{r.particulars}</td>
                            <td className="px-4 py-2 text-right text-red-400 font-mono">{fmt(r.debit)}</td>
                            <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmt(r.credit)}</td>
                          </tr>
                        ))}
                        <tr className="bg-primary/5 font-semibold border-t border-border">
                          <td className="px-4 py-2.5 text-foreground" colSpan={2}>TOTAL ({results.bankMissing.length} entries)</td>
                          <td className="px-4 py-2.5 text-right text-red-400 font-mono">{results.summary.bankMissingDR}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-400 font-mono">{results.summary.bankMissingCR}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section B */}
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button
                  onClick={() => setShowB(!showB)}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-semibold text-foreground">
                      B. Ledger amounts NOT in bank
                      <span className="ml-2 text-xs font-normal text-muted">({results.ledgerMissing.length} entries)</span>
                    </h3>
                  </div>
                  {showB ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showB && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-accent/10 text-accent">
                          <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                          <th className="px-4 py-2.5 text-left font-semibold">Ref</th>
                          <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Debit</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.ledgerMissing.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-4 py-2 text-muted whitespace-nowrap">{r.date}</td>
                            <td className="px-4 py-2 text-foreground whitespace-nowrap">{r.ref || "—"}</td>
                            <td className="px-4 py-2 text-foreground truncate max-w-[250px]">{r.desc}</td>
                            <td className="px-4 py-2 text-right text-red-400 font-mono">{fmt(r.debit)}</td>
                            <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmt(r.credit)}</td>
                          </tr>
                        ))}
                        <tr className="bg-accent/5 font-semibold border-t border-border">
                          <td className="px-4 py-2.5 text-foreground" colSpan={3}>TOTAL ({results.ledgerMissing.length} entries)</td>
                          <td className="px-4 py-2.5 text-right text-red-400 font-mono">{results.summary.ledgerMissingDR}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-400 font-mono">{results.summary.ledgerMissingCR}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={downloadXLS}
                  className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent/80 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download XLS
                </button>
                <button
                  onClick={reset}
                  className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-border text-foreground font-semibold py-3 rounded-xl transition-all cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Start Over
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
