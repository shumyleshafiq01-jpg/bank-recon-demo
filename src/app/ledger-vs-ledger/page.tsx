"use client";

import { useState } from "react";
import {
  ArrowLeft, Upload, FileText, Loader2,
  ChevronUp, ChevronDown, Download, X,
  BookOpen, CircleCheck, AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type LedgerRow = { date: string; ref: string; doc: string; desc: string; debit: number; credit: number };
type MatchedRow = {
  companyDate: string; companyDesc: string; companyRef: string; companyDoc: string;
  companyDebit: number; companyCredit: number;
  vendorDate: string; vendorDesc: string; vendorRef: string; vendorDoc: string;
  vendorDebit: number; vendorCredit: number;
  matchType: "exact" | "date-proximity";
};
type Summary = {
  companyTotalDR: string; companyTotalCR: string;
  vendorTotalDR: string; vendorTotalCR: string;
  companyUnmatchedCount: number; companyUnmatchedDR: string; companyUnmatchedCR: string;
  vendorUnmatchedCount: number; vendorUnmatchedDR: string; vendorUnmatchedCR: string;
};
type Results = {
  companyTotal: number; vendorTotal: number;
  matchedCount: number; exactMatchCount: number; proximityMatchCount: number;
  matched: MatchedRow[];
  companyUnmatched: LedgerRow[];
  vendorUnmatched: LedgerRow[];
  summary: Summary;
};

const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LedgerVsLedgerPage() {
  const router = useRouter();
  const [companyFile, setCompanyFile] = useState<File | null>(null);
  const [vendorFile, setVendorFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [showMatched, setShowMatched] = useState(false);
  const [showCompanyUn, setShowCompanyUn] = useState(true);
  const [showVendorUn, setShowVendorUn] = useState(true);

  async function runAnalysis() {
    if (!companyFile || !vendorFile) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const fd = new FormData();
      fd.append("companyFile", companyFile);
      fd.append("vendorFile", vendorFile);
      const res = await fetch("/api/ledger-vs-ledger", { method: "POST", body: fd });
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
    setCompanyFile(null);
    setVendorFile(null);
    setResults(null);
    setError("");
  }

  function downloadXLS() {
    if (!results) return;
    const wb = XLSX.utils.book_new();

    // Matched sheet
    const matchedRows = [
      ["Company Date", "Company Description", "Company Ref", "Company Doc", "Company Debit", "Company Credit",
       "Vendor Date", "Vendor Description", "Vendor Ref", "Vendor Doc", "Vendor Debit", "Vendor Credit", "Match Type"],
      ...results.matched.map((m) => [
        m.companyDate, m.companyDesc, m.companyRef, m.companyDoc, m.companyDebit || "", m.companyCredit || "",
        m.vendorDate, m.vendorDesc, m.vendorRef, m.vendorDoc, m.vendorDebit || "", m.vendorCredit || "",
        m.matchType,
      ]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(matchedRows);
    ws1["!cols"] = [
      { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "Matched");

    // Company unmatched
    const compRows = [
      ["Date", "Ref", "Doc #", "Description", "Debit", "Credit"],
      ...results.companyUnmatched.map((r) => [r.date, r.ref, r.doc, r.desc, r.debit || "", r.credit || ""]),
      ["TOTAL", "", "", `${results.companyUnmatched.length} entries`,
        results.companyUnmatched.reduce((s, r) => s + r.debit, 0),
        results.companyUnmatched.reduce((s, r) => s + r.credit, 0)],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(compRows);
    ws2["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Company Unmatched");

    // Vendor unmatched
    const vendRows = [
      ["Date", "Ref", "Doc #", "Description", "Debit", "Credit"],
      ...results.vendorUnmatched.map((r) => [r.date, r.ref, r.doc, r.desc, r.debit || "", r.credit || ""]),
      ["TOTAL", "", "", `${results.vendorUnmatched.length} entries`,
        results.vendorUnmatched.reduce((s, r) => s + r.debit, 0),
        results.vendorUnmatched.reduce((s, r) => s + r.credit, 0)],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(vendRows);
    ws3["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Vendor Unmatched");

    XLSX.writeFile(wb, "Ledger-vs-Ledger-Report.xlsx");
  }

  const ready = companyFile && vendorFile && !loading;

  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center">
          <BookOpen className="w-3.5 h-3.5 text-orange-400" />
        </div>
        <span className="text-sm font-bold text-foreground">Ledger vs Ledger</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">

          {/* Upload */}
          {!results && (
            <>
              <div className="bg-surface rounded-2xl border border-border p-5">
                <p className="text-sm text-muted">
                  Compare your <strong className="text-foreground">company ledger</strong> against a{" "}
                  <strong className="text-foreground">vendor or customer ledger</strong> to find mismatches.
                  Upload both as <strong className="text-foreground">XLS or XLSX</strong> (Tally export format supported).
                  Entries are matched by amount and date — unmatched entries from both sides are highlighted.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Company Ledger */}
                <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-orange-400" />
                    <h3 className="text-sm font-semibold text-foreground">Company Ledger</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 ml-auto">XLS / XLSX</span>
                  </div>
                  {companyFile ? (
                    <div className="flex items-center justify-between bg-background rounded-lg px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-2 text-foreground min-w-0">
                        <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                        <span className="truncate">{companyFile.name}</span>
                        <span className="text-xs text-muted shrink-0">({(companyFile.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <button onClick={() => setCompanyFile(null)} className="text-muted hover:text-danger cursor-pointer shrink-0 ml-2"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="file" accept=".xls,.xlsx" onChange={(e) => { setCompanyFile(e.target.files?.[0] ?? null); e.target.value = ""; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="rounded-xl border-2 border-dashed border-border bg-background p-8 text-center hover:border-orange-500/50 transition-colors">
                        <FileText className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                        <p className="text-xs font-medium text-foreground">Drop your company ledger here</p>
                        <p className="text-[10px] text-muted mt-1">Your books — Tally/ERP export</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Vendor/Customer Ledger */}
                <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-sky-400" />
                    <h3 className="text-sm font-semibold text-foreground">Vendor / Customer Ledger</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 ml-auto">XLS / XLSX</span>
                  </div>
                  {vendorFile ? (
                    <div className="flex items-center justify-between bg-background rounded-lg px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-2 text-foreground min-w-0">
                        <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                        <span className="truncate">{vendorFile.name}</span>
                        <span className="text-xs text-muted shrink-0">({(vendorFile.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <button onClick={() => setVendorFile(null)} className="text-muted hover:text-danger cursor-pointer shrink-0 ml-2"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="file" accept=".xls,.xlsx" onChange={(e) => { setVendorFile(e.target.files?.[0] ?? null); e.target.value = ""; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="rounded-xl border-2 border-dashed border-border bg-background p-8 text-center hover:border-sky-500/50 transition-colors">
                        <FileText className="w-6 h-6 text-sky-400 mx-auto mb-2" />
                        <p className="text-xs font-medium text-foreground">Drop vendor/customer ledger here</p>
                        <p className="text-[10px] text-muted mt-1">The other party&apos;s books</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button onClick={runAnalysis} disabled={!ready}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-500/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                {loading ? "Comparing Ledgers..." : "Compare Ledgers"}
              </button>
            </>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-sm text-danger">{error}</div>
          )}

          {/* Results */}
          {results && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface rounded-xl border border-orange-500/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Company Entries</p>
                  <p className="text-lg font-bold text-orange-400">{results.companyTotal}</p>
                  <p className="text-[10px] text-muted">DR: {results.summary.companyTotalDR}</p>
                  <p className="text-[10px] text-muted">CR: {results.summary.companyTotalCR}</p>
                </div>
                <div className="bg-surface rounded-xl border border-sky-500/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Vendor Entries</p>
                  <p className="text-lg font-bold text-sky-400">{results.vendorTotal}</p>
                  <p className="text-[10px] text-muted">DR: {results.summary.vendorTotalDR}</p>
                  <p className="text-[10px] text-muted">CR: {results.summary.vendorTotalCR}</p>
                </div>
                <div className="bg-surface rounded-xl border border-emerald-500/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Matched</p>
                  <p className="text-lg font-bold text-emerald-400">{results.matchedCount}</p>
                  <p className="text-[10px] text-muted">{results.exactMatchCount} exact, {results.proximityMatchCount} by date</p>
                </div>
                <div className="bg-surface rounded-xl border border-red-500/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Unmatched</p>
                  <p className="text-lg font-bold text-red-400">
                    {results.summary.companyUnmatchedCount + results.summary.vendorUnmatchedCount}
                  </p>
                  <p className="text-[10px] text-muted">{results.summary.companyUnmatchedCount} company, {results.summary.vendorUnmatchedCount} vendor</p>
                </div>
              </div>

              {results.matchedCount > 0 && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 flex items-start gap-3">
                  <CircleCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground">
                    <strong>{results.matchedCount} entries</strong> matched between company and vendor ledgers
                    ({results.exactMatchCount} exact date match, {results.proximityMatchCount} within 7-day window).
                  </div>
                </div>
              )}

              {/* Matched entries (collapsed by default) */}
              {results.matched.length > 0 && (
                <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                  <button onClick={() => setShowMatched(!showMatched)}
                    className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <CircleCheck className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-semibold text-foreground">
                        Matched Entries
                        <span className="ml-2 text-xs font-normal text-muted">({results.matched.length} pairs)</span>
                      </h3>
                    </div>
                    {showMatched ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                  </button>
                  {showMatched && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-emerald-500/10 text-emerald-400">
                            <th className="px-3 py-2.5 text-left font-semibold">#</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Company Date</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Company Description</th>
                            <th className="px-3 py-2.5 text-right font-semibold">Co. DR</th>
                            <th className="px-3 py-2.5 text-right font-semibold">Co. CR</th>
                            <th className="px-3 py-2.5 text-center font-semibold">↔</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Vendor Date</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Vendor Description</th>
                            <th className="px-3 py-2.5 text-right font-semibold">V. DR</th>
                            <th className="px-3 py-2.5 text-right font-semibold">V. CR</th>
                            <th className="px-3 py-2.5 text-center font-semibold">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.matched.map((m, i) => (
                            <tr key={i} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                              <td className="px-3 py-2 text-muted">{i + 1}</td>
                              <td className="px-3 py-2 text-muted whitespace-nowrap">{m.companyDate}</td>
                              <td className="px-3 py-2 text-foreground truncate max-w-[150px]">{m.companyDesc}</td>
                              <td className="px-3 py-2 text-right text-red-400 font-mono">{fmt(m.companyDebit)}</td>
                              <td className="px-3 py-2 text-right text-emerald-400 font-mono">{fmt(m.companyCredit)}</td>
                              <td className="px-3 py-2 text-center text-muted">⇄</td>
                              <td className="px-3 py-2 text-muted whitespace-nowrap">{m.vendorDate}</td>
                              <td className="px-3 py-2 text-foreground truncate max-w-[150px]">{m.vendorDesc}</td>
                              <td className="px-3 py-2 text-right text-red-400 font-mono">{fmt(m.vendorDebit)}</td>
                              <td className="px-3 py-2 text-right text-emerald-400 font-mono">{fmt(m.vendorCredit)}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.matchType === "exact" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                                  {m.matchType === "exact" ? "Exact" : "~Date"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Company Unmatched */}
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button onClick={() => setShowCompanyUn(!showCompanyUn)}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Company Entries — Not in Vendor Ledger
                      <span className="ml-2 text-xs font-normal text-muted">({results.companyUnmatched.length} entries)</span>
                    </h3>
                  </div>
                  {showCompanyUn ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showCompanyUn && results.companyUnmatched.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-orange-500/10 text-orange-400">
                          <th className="px-3 py-2.5 text-left font-semibold">#</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Ref</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Doc #</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Debit</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.companyUnmatched.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-3 py-2 text-muted">{i + 1}</td>
                            <td className="px-3 py-2 text-muted whitespace-nowrap">{r.date}</td>
                            <td className="px-3 py-2 text-foreground whitespace-nowrap">{r.ref || "—"}</td>
                            <td className="px-3 py-2 text-foreground whitespace-nowrap">{r.doc || "—"}</td>
                            <td className="px-3 py-2 text-foreground truncate max-w-[200px]">{r.desc}</td>
                            <td className="px-3 py-2 text-right text-red-400 font-mono">{fmt(r.debit)}</td>
                            <td className="px-3 py-2 text-right text-emerald-400 font-mono">{fmt(r.credit)}</td>
                          </tr>
                        ))}
                        <tr className="bg-orange-500/5 font-semibold border-t border-border">
                          <td className="px-3 py-2.5 text-foreground" colSpan={5}>TOTAL ({results.companyUnmatched.length} entries)</td>
                          <td className="px-3 py-2.5 text-right text-red-400 font-mono">{results.summary.companyUnmatchedDR}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-400 font-mono">{results.summary.companyUnmatchedCR}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {showCompanyUn && results.companyUnmatched.length === 0 && (
                  <div className="px-5 pb-4 text-sm text-emerald-400">All company entries matched.</div>
                )}
              </div>

              {/* Vendor Unmatched */}
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button onClick={() => setShowVendorUn(!showVendorUn)}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-sky-400" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Vendor Entries — Not in Company Ledger
                      <span className="ml-2 text-xs font-normal text-muted">({results.vendorUnmatched.length} entries)</span>
                    </h3>
                  </div>
                  {showVendorUn ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showVendorUn && results.vendorUnmatched.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-sky-500/10 text-sky-400">
                          <th className="px-3 py-2.5 text-left font-semibold">#</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Ref</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Doc #</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Debit</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.vendorUnmatched.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-3 py-2 text-muted">{i + 1}</td>
                            <td className="px-3 py-2 text-muted whitespace-nowrap">{r.date}</td>
                            <td className="px-3 py-2 text-foreground whitespace-nowrap">{r.ref || "—"}</td>
                            <td className="px-3 py-2 text-foreground whitespace-nowrap">{r.doc || "—"}</td>
                            <td className="px-3 py-2 text-foreground truncate max-w-[200px]">{r.desc}</td>
                            <td className="px-3 py-2 text-right text-red-400 font-mono">{fmt(r.debit)}</td>
                            <td className="px-3 py-2 text-right text-emerald-400 font-mono">{fmt(r.credit)}</td>
                          </tr>
                        ))}
                        <tr className="bg-sky-500/5 font-semibold border-t border-border">
                          <td className="px-3 py-2.5 text-foreground" colSpan={5}>TOTAL ({results.vendorUnmatched.length} entries)</td>
                          <td className="px-3 py-2.5 text-right text-red-400 font-mono">{results.summary.vendorUnmatchedDR}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-400 font-mono">{results.summary.vendorUnmatchedCR}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {showVendorUn && results.vendorUnmatched.length === 0 && (
                  <div className="px-5 pb-4 text-sm text-emerald-400">All vendor entries matched.</div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={downloadXLS}
                  className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-500/80 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer">
                  <Download className="w-4 h-4" />
                  Download XLS Report
                </button>
                <button onClick={reset}
                  className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-border text-foreground font-semibold py-3 rounded-xl transition-all cursor-pointer">
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
