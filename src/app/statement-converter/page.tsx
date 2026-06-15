"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Landmark, ArrowLeft, Upload, X, FileText,
  Download, AlertTriangle, CheckCircle, Loader2, ChevronDown,
} from "lucide-react";

const BANK_OPTIONS = [
  { value: "", label: "Auto-detect" },
  { value: "Allied Bank (ABL)", label: "Allied Bank (ABL)" },
  { value: "Habib Metropolitan Bank (HMB)", label: "Habib Metropolitan (HMB)" },
  { value: "Soneri Bank", label: "Soneri Bank" },
  { value: "Faysal Bank", label: "Faysal Bank" },
  { value: "Bank AL Habib (BAHL)", label: "Bank AL Habib (BAH)" },
  { value: "Habib Bank Limited (HBL)", label: "Habib Bank (HBL)" },
  { value: "JS Bank", label: "JS Bank" },
  { value: "Standard Chartered Bank (SCB)", label: "Standard Chartered (SCB)" },
  { value: "Meezan Bank", label: "Meezan Bank" },
  { value: "MCB Bank", label: "MCB Bank" },
  { value: "UBL Bank", label: "United Bank (UBL)" },
  { value: "Bank Alfalah", label: "Bank Alfalah" },
] as const;

type FileEntry = {
  file: File;
  bank: string;
};

type FileResult = {
  fileName: string;
  bank: string;
  count: number;
  openingBalance: number | null;
  closingBalance: number | null;
  error?: string;
  warning?: string;
};

type ConvertResponse = {
  success: boolean;
  fileName: string;
  xlsxBase64: string;
  files: FileResult[];
  totalEntries: number;
  errors: string[];
  warnings: string[];
  error?: string;
  details?: string[];
};

const fmt = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function StatementConverterPage() {
  const router = useRouter();
  const dropRef = useRef<HTMLDivElement>(null);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConvertResponse | null>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const pdfs = newFiles.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) return;
    setFileEntries((prev) => [
      ...prev,
      ...pdfs.map((f) => ({ file: f, bank: "" })),
    ]);
    setResult(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const removeFile = (idx: number) => {
    setFileEntries((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  };

  const setBank = (idx: number, bank: string) => {
    setFileEntries((prev) => prev.map((e, i) => i === idx ? { ...e, bank } : e));
  };

  const convert = async () => {
    if (fileEntries.length === 0) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    for (const entry of fileEntries) {
      formData.append("files", entry.file);
      formData.append("banks", entry.bank);
    }

    try {
      const res = await fetch("/api/statement-converter", { method: "POST", body: formData });
      const data: ConvertResponse = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, fileName: "", xlsxBase64: "", files: [], totalEntries: 0, errors: ["Network error — could not reach server."], warnings: [] });
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!result?.xlsxBase64) return;
    const bytes = Uint8Array.from(atob(result.xlsxBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName || "bank-statement.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFiles = fileEntries.length > 0;
  const canConvert = hasFiles && !loading;

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 rounded-lg hover:bg-surface-light transition-colors text-muted hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Bank Statement Converter</h1>
            <p className="text-xs text-muted">Module 5 — PDF → Standardized XLS</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-muted" />
          <span className="text-xs text-muted hidden sm:block">Bank Reconciliation Demo</span>
        </div>
      </header>

      <div className="flex-1 p-6 md:p-10 max-w-4xl mx-auto w-full space-y-6 animate-fade-in">

        {/* Info banner */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-300">
          <p className="font-semibold mb-1">How this works</p>
          <p className="text-emerald-300/80">
            Upload any bank statement PDF → select the bank → the AI reads it and converts it into a clean standardized Excel file
            with fixed columns (Date, Description, Debit, Credit, Balance). The output is ready to upload directly into Module 4.
          </p>
        </div>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
            dragging
              ? "border-emerald-400 bg-emerald-500/10"
              : "border-border hover:border-emerald-500/50 hover:bg-emerald-500/5"
          }`}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.accept = ".pdf";
            input.onchange = (e) => addFiles(Array.from((e.target as HTMLInputElement).files ?? []));
            input.click();
          }}
        >
          <Upload className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Drop bank statement PDFs here</p>
          <p className="text-xs text-muted mt-1">or click to browse · PDF only · multiple files supported</p>
        </div>

        {/* File list */}
        {hasFiles && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
              Files ({fileEntries.length})
            </h3>
            {fileEntries.map((entry, idx) => (
              <div key={idx} className="bg-surface rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{entry.file.name}</p>
                    <p className="text-xs text-muted">{(entry.file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={entry.bank}
                      onChange={(e) => setBank(idx, e.target.value)}
                      className="appearance-none bg-surface-light border border-border rounded-lg px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                    >
                      {BANK_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    className="p-1.5 rounded-lg hover:bg-surface-light text-muted hover:text-error transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Convert button */}
        {hasFiles && (
          <button
            onClick={convert}
            disabled={!canConvert}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Converting… (AI is reading the statements)
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Convert to Standardized XLS
              </>
            )}
          </button>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Fatal error */}
            {result.error && (
              <div className="bg-error/10 border border-error/30 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-error">Conversion failed</p>
                  <p className="text-sm text-error/80 mt-1">{result.error}</p>
                  {result.details?.map((d, i) => <p key={i} className="text-xs text-error/60 mt-0.5">{d}</p>)}
                </div>
              </div>
            )}

            {/* Per-file results */}
            {result.files?.length > 0 && (
              <div className="space-y-3">
                {result.files.map((f, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border p-4 space-y-2 ${
                      f.error
                        ? "bg-error/10 border-error/30"
                        : "bg-surface border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {f.error
                          ? <AlertTriangle className="w-4 h-4 text-error" />
                          : <CheckCircle className="w-4 h-4 text-emerald-400" />
                        }
                        <span className="text-sm font-medium text-foreground truncate max-w-xs">{f.fileName}</span>
                      </div>
                      {!f.error && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
                          {f.count} transactions
                        </span>
                      )}
                    </div>

                    {f.error && <p className="text-xs text-error/80 ml-6">{f.error}</p>}

                    {!f.error && (
                      <div className="ml-6 flex flex-wrap gap-4 text-xs text-muted">
                        <span>Bank: <span className="text-foreground">{f.bank}</span></span>
                        <span>Opening: <span className="text-foreground">{fmt(f.openingBalance)}</span></span>
                        <span>Closing: <span className="text-foreground">{fmt(f.closingBalance)}</span></span>
                      </div>
                    )}

                    {f.warning && (
                      <div className="ml-6 flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-lg p-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                        <p className="text-xs text-warning/90">{f.warning}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Download button */}
            {result.success && result.totalEntries > 0 && (
              <button
                onClick={download}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl transition-all"
              >
                <Download className="w-4 h-4" />
                Download {result.fileName} ({result.totalEntries} transactions)
              </button>
            )}

            {/* Warnings */}
            {result.warnings?.length > 0 && (
              <div className="space-y-2">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning/90">{w}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
