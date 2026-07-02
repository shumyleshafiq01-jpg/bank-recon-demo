"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Landmark, ArrowLeft, Upload, X, FileText,
  AlertTriangle, Loader2, ChevronDown, Download,
  Scale, Check, Sparkles,
} from "lucide-react";
import ApiCodeGate from "@/components/ApiCodeGate";

const CATEGORIES = [
  { value: "freight", label: "Freight & Logistics" },
  { value: "food", label: "Food & Catering" },
  { value: "packaging", label: "Packaging Materials" },
  { value: "production", label: "Production & Manufacturing" },
  { value: "vehicle-maintenance", label: "Vehicle Repair & Maintenance" },
  { value: "building-maintenance", label: "Building Repair & Maintenance" },
  { value: "it-equipment", label: "IT Equipment & Hardware" },
  { value: "office-supplies", label: "Office Supplies" },
  { value: "raw-materials", label: "Raw Materials" },
  { value: "electrical", label: "Electrical & Plumbing" },
  { value: "printing", label: "Printing & Stationery" },
  { value: "security", label: "Security Services" },
  { value: "cleaning", label: "Cleaning & Janitorial" },
  { value: "other", label: "Other" },
] as const;

type LineItem = {
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  totalPrice: number;
  isLabor: boolean;
};

type ParsedQuotation = {
  fileName: string;
  vendor: string;
  quoteNumber: string | null;
  quoteDate: string | null;
  currency: string;
  validUntil: string | null;
  lineItems: LineItem[];
  subtotal: number | null;
  tax: number;
  grandTotal: number | null;
  notes: string | null;
  error?: string;
};

type MatchGroup = { label: string; items: { vendor: number; item: number }[] };

type ApiResponse = {
  success?: boolean;
  category: string;
  quotations: ParsedQuotation[];
  matchGroups?: MatchGroup[] | null;
  errors: string[];
  error?: string;
  details?: string[];
};

const fmt = (n: number, currency?: string) => {
  const c = currency ?? "PKR";
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + c;
};

type RowData = {
  description: string;
  prices: (number | null)[];
  quantities: (number | null)[];
  units: (string | null)[];
  isLabor: boolean;
  matchedVendorCount: number;
};

function buildComparisonTable(quotations: ParsedQuotation[], includeLabor: boolean, matchGroups?: MatchGroup[] | null) {
  const vendors = quotations.filter((q) => q.lineItems.length > 0);
  if (vendors.length === 0) return { rows: [], vendors: [], currency: "PKR" };

  const currency = vendors[0].currency;

  // Prefer AI-grouped rows — matches the same real-world product across
  // vendors even when brand names are spelled differently (handwritten/OCR
  // quotations). Falls back to exact description matching if grouping
  // wasn't available or couldn't be trusted.
  if (matchGroups && matchGroups.length > 0) {
    const rows: RowData[] = matchGroups.map((group) => {
      const prices = new Array<number | null>(vendors.length).fill(null);
      const quantities = new Array<number | null>(vendors.length).fill(null);
      const units = new Array<string | null>(vendors.length).fill(null);
      let isLabor = false;
      let matchedVendorCount = 0;
      let firstDescription = group.label;
      for (const ref of group.items) {
        const vendor = vendors[ref.vendor];
        const item = vendor?.lineItems[ref.item];
        if (!vendor || !item) continue;
        if (prices[ref.vendor] === null) matchedVendorCount++;
        prices[ref.vendor] = item.totalPrice;
        quantities[ref.vendor] = item.quantity;
        units[ref.vendor] = item.unit;
        if (item.isLabor) isLabor = true;
        if (!firstDescription) firstDescription = item.description;
      }
      return { description: firstDescription || "Unnamed item", prices, quantities, units, isLabor, matchedVendorCount };
    });
    return { rows: rows.filter((row) => includeLabor || !row.isLabor), vendors, currency };
  }

  // Collect all unique descriptions (normalized for fuzzy match)
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

  const descMap = new Map<string, RowData>();
  const descOrder: string[] = [];

  for (let vi = 0; vi < vendors.length; vi++) {
    for (const item of vendors[vi].lineItems) {
      const norm = normalize(item.description);
      if (!descMap.has(norm)) {
        descMap.set(norm, {
          description: item.description,
          prices: new Array(vendors.length).fill(null),
          quantities: new Array(vendors.length).fill(null),
          units: new Array(vendors.length).fill(null),
          isLabor: item.isLabor,
          matchedVendorCount: 0,
        });
        descOrder.push(norm);
      }
      const row = descMap.get(norm)!;
      if (row.prices[vi] === null) row.matchedVendorCount++;
      row.prices[vi] = item.totalPrice;
      row.quantities[vi] = item.quantity;
      row.units[vi] = item.unit;
      if (item.isLabor) row.isLabor = true;
    }
  }

  const rows = descOrder
    .map((norm) => descMap.get(norm)!)
    .filter((row) => includeLabor || !row.isLabor);

  return { rows, vendors, currency };
}

export default function QuotationsPage() {
  const router = useRouter();
  const dropRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [includeLabor, setIncludeLabor] = useState(true);
  const [useAI, setUseAI] = useState(true);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) => {
      const ext = f.name.toLowerCase().split(".").pop() ?? "";
      return ["pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "doc", "docx", "txt", "csv"].includes(ext);
    });
    if (valid.length === 0) return;
    setFiles((prev) => [...prev, ...valid]);
    setResult(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  };

  const compare = async () => {
    if (files.length < 2 || !category) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    for (const file of files) formData.append("files", file);
    formData.append("category", category);
    formData.append("useAI", String(useAI));

    try {
      const res = await fetch("/api/quotations", { method: "POST", body: formData });
      const data: ApiResponse = await res.json();
      setResult(data);
    } catch {
      setResult({ category: "", quotations: [], errors: ["Network error — could not reach server."], error: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!result?.quotations) return;
    const { rows, vendors, currency } = buildComparisonTable(result.quotations, includeLabor, result.matchGroups);
    if (rows.length === 0 || vendors.length === 0) return;

    const headers = ["#", "Item Description", "Labor?", ...vendors.map((v) => v.vendor + ` (${currency})`)];
    const csvRows = [headers.join(",")];

    rows.forEach((row, ri) => {
      const cells = [
        String(ri + 1),
        `"${row.description.replace(/"/g, '""')}"`,
        row.isLabor ? "Yes" : "No",
        ...row.prices.map((p) => p !== null ? p.toFixed(2) : "—"),
      ];
      csvRows.push(cells.join(","));
    });

    // Totals row
    const totals = vendors.map((_, vi) =>
      rows.reduce((sum, row) => sum + (row.prices[vi] ?? 0), 0).toFixed(2)
    );
    csvRows.push(["", "TOTAL", "", ...totals].join(","));

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotation-comparison-${category}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFiles = files.length >= 2;
  const canCompare = hasFiles && category && !loading;

  // Build comparison data
  const comparison = result?.quotations ? buildComparisonTable(result.quotations, includeLabor, result.matchGroups) : null;

  return (
    <ApiCodeGate moduleName="Quotation Comparison">
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
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Scale className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Quotation Comparison</h1>
            <p className="text-xs text-muted">Upload vendor quotes &middot; AI extracts &middot; Compare side-by-side</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-muted" />
          <span className="text-xs text-muted hidden sm:block">AI Agent Finance</span>
        </div>
      </header>

      <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-6 animate-fade-in">

        {/* Category selector */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-300 mb-3">Step 1 — Select Business Category</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => { setCategory(cat.value); setResult(null); }}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                  category === cat.value
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                    : "bg-surface border-border text-muted hover:border-amber-500/30 hover:text-foreground"
                }`}
              >
                {category === cat.value && <Check className="w-3 h-3 inline mr-1" />}
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        {category && (
          <div>
            <p className="text-sm font-semibold text-amber-300 mb-3">Step 2 — Upload Quotations (minimum 2)</p>
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                dragging
                  ? "border-amber-400 bg-amber-500/10"
                  : "border-border hover:border-amber-500/50 hover:bg-amber-500/5"
              }`}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.multiple = true;
                input.accept = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.tif,.doc,.docx,.txt,.csv";
                input.onchange = (e) => addFiles(Array.from((e.target as HTMLInputElement).files ?? []));
                input.click();
              }}
            >
              <Upload className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Drop quotation files here</p>
              <p className="text-xs text-muted mt-1">PDF, Images, Word, Scanned docs &middot; Any currency &middot; Multiple vendors</p>
            </div>
          </div>
        )}

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
              Quotations ({files.length})
            </h3>
            {files.map((file, idx) => (
              <div key={idx} className="bg-surface rounded-xl border border-border p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(idx)}
                  className="p-1.5 rounded-lg hover:bg-surface-light text-muted hover:text-error transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* AI / Local toggle */}
        {files.length > 0 && (
          <div className="flex items-center justify-between bg-surface rounded-xl border border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              {useAI ? <Sparkles className="w-4 h-4 text-amber-400" /> : <FileText className="w-4 h-4 text-muted" />}
              <div>
                <p className="text-sm font-semibold text-foreground">{useAI ? "AI Extraction" : "Local Parser"}</p>
                <p className="text-[11px] text-muted">
                  {useAI
                    ? "Uses Anthropic API — handles scanned/handwritten quotes and matches items across vendors"
                    : "Regex-based extraction — no API cost, but only works on digital PDFs/CSV/XLS with real text (not scans)"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setUseAI(!useAI)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${useAI ? "bg-amber-500" : "bg-muted/30"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${useAI ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        )}

        {/* Compare button */}
        {files.length > 0 && (
          <button
            onClick={compare}
            disabled={!canCompare}
            className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {useAI ? `Extracting quotation data… (AI is reading ${files.length} files)` : "Parsing files locally…"}
              </>
            ) : (
              <>
                <Scale className="w-4 h-4" />
                Compare {files.length} Quotations
              </>
            )}
          </button>
        )}

        {/* Error display */}
        {result?.error && (
          <div className="bg-error/10 border border-error/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-error">Comparison failed</p>
              <p className="text-sm text-error/80 mt-1">{result.error}</p>
              {result.details?.map((d, i) => <p key={i} className="text-xs text-error/60 mt-0.5">{d}</p>)}
            </div>
          </div>
        )}

        {/* Comparison Table */}
        {comparison && comparison.rows.length > 0 && comparison.vendors.length > 0 && (
          <div className="space-y-4">
            {/* Controls bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Comparison Results</h3>
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400">
                  {comparison.vendors.length} vendors &middot; {comparison.rows.length} items
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIncludeLabor(!includeLabor)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    includeLabor
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "bg-surface border-border text-muted hover:border-amber-500/30"
                  }`}
                >
                  {includeLabor ? "Labor Included" : "Labor Excluded"}
                </button>
                <button
                  onClick={downloadCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted hover:text-foreground hover:border-amber-500/30 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-light border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase w-8">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase min-w-[200px]">Item Description</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold text-muted uppercase w-16">Type</th>
                    {comparison.vendors.map((v, vi) => (
                      <th key={vi} className="text-right px-4 py-3 text-xs font-semibold text-amber-400 uppercase min-w-[140px]">
                        <div>{v.vendor}</div>
                        <div className="text-[10px] text-muted font-normal normal-case mt-0.5">{v.currency}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row, ri) => {
                    const prices = row.prices.filter((p): p is number => p !== null);
                    const minPrice = prices.length > 0 ? Math.min(...prices) : null;

                    return (
                      <tr key={ri} className="border-b border-border/50 hover:bg-surface-light/50 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-muted">{ri + 1}</td>
                        <td className="px-4 py-2.5 text-foreground">
                          {row.description}
                          {row.matchedVendorCount <= 1 && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400" title="Only one vendor quoted this item — not compared against another price">
                              Not compared
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            row.isLabor
                              ? "bg-blue-500/10 text-blue-400"
                              : "bg-slate-500/10 text-slate-400"
                          }`}>
                            {row.isLabor ? "Labor" : "Material"}
                          </span>
                        </td>
                        {row.prices.map((price, vi) => {
                          const isCheapest = price !== null && minPrice !== null && price === minPrice && prices.length > 1;
                          return (
                            <td
                              key={vi}
                              className={`px-4 py-2.5 text-right font-mono text-sm ${
                                price === null
                                  ? "text-muted"
                                  : isCheapest
                                    ? "text-emerald-400 font-semibold bg-emerald-500/10"
                                    : "text-foreground"
                              }`}
                            >
                              {price !== null ? price.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-light border-t-2 border-amber-500/30">
                    <td className="px-4 py-3" colSpan={3}>
                      <span className="text-sm font-bold text-foreground uppercase">Total</span>
                    </td>
                    {comparison.vendors.map((_, vi) => {
                      const total = comparison.rows.reduce((sum, row) => sum + (row.prices[vi] ?? 0), 0);
                      const allTotals = comparison.vendors.map((__, vj) =>
                        comparison.rows.reduce((sum, row) => sum + (row.prices[vj] ?? 0), 0)
                      );
                      const minTotal = Math.min(...allTotals.filter((t) => t > 0));
                      const isCheapest = total === minTotal && total > 0;

                      return (
                        <td
                          key={vi}
                          className={`px-4 py-3 text-right font-mono text-sm font-bold ${
                            isCheapest
                              ? "text-emerald-400 bg-emerald-500/15"
                              : "text-foreground"
                          }`}
                        >
                          {fmt(total, comparison.currency)}
                          {isCheapest && (
                            <div className="text-[10px] text-emerald-400 mt-0.5 font-normal">Lowest</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Vendor details cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {comparison.vendors.map((v, vi) => (
                <div key={vi} className="bg-surface rounded-xl border border-border p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-amber-300">{v.vendor}</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {v.quoteNumber && (
                      <div><span className="text-muted">Quote #:</span> <span className="text-foreground">{v.quoteNumber}</span></div>
                    )}
                    {v.quoteDate && (
                      <div><span className="text-muted">Date:</span> <span className="text-foreground">{v.quoteDate}</span></div>
                    )}
                    {v.validUntil && (
                      <div><span className="text-muted">Valid Until:</span> <span className="text-foreground">{v.validUntil}</span></div>
                    )}
                    <div><span className="text-muted">Currency:</span> <span className="text-foreground">{v.currency}</span></div>
                    {v.tax > 0 && (
                      <div><span className="text-muted">Tax:</span> <span className="text-foreground">{fmt(v.tax, v.currency)}</span></div>
                    )}
                    {v.grandTotal !== null && (
                      <div><span className="text-muted">Grand Total:</span> <span className="text-foreground font-semibold">{fmt(v.grandTotal, v.currency)}</span></div>
                    )}
                  </div>
                  {v.notes && (
                    <p className="text-[11px] text-muted/80 border-t border-border/50 pt-2 mt-2">{v.notes}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Per-file warnings */}
            {result?.errors && result.errors.length > 0 && (
              <div className="space-y-2">
                {result.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning/90">{err}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
      </ApiCodeGate>
  );;
}
