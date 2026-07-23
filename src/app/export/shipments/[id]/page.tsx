"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, Ship, ExternalLink, Loader2, ScanSearch, Check, Trash2, Plus,
  AlertTriangle, HelpCircle, FileCheck2, FileText,
} from "lucide-react";

type Shipment = {
  id: string; sales_order_ref: string | null; buyer_name: string; country: string | null;
  pi_number: string | null; advance_payment_pct: number | null; sop_method: string;
  stage: string; accountant_email: string | null; drive_folder_link: string | null; notes: string | null;
};

type ChecklistItem = {
  id: string; document_type: string; status: "pending" | "in_review" | "done";
  matched_file_name: string | null; matched_file_link: string | null;
  ai_confidence: number | null; ai_notes: string | null; notes: string | null;
};

const STAGES = [
  { key: "pi", label: "PI" }, { key: "freight", label: "Freight" }, { key: "fi_cpd", label: "FI/CPD" },
  { key: "aflatoxin", label: "Aflatoxin" }, { key: "cro_docs", label: "CRO/Docs" },
  { key: "checklist", label: "Checklist" }, { key: "courier", label: "Courier" }, { key: "done", label: "Done" },
];

function StatusBadge({ status }: { status: ChecklistItem["status"] }) {
  if (status === "done") return <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><Check className="w-3 h-3" /> Done</span>;
  if (status === "in_review") return <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><HelpCircle className="w-3 h-3" /> Needs Confirmation</span>;
  return <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Pending</span>;
}

export default function ShipmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<{ scanned: number; results: { fileName: string; verdict: string; matchedType?: string; notes: string }[] } | null>(null);
  const [newDocType, setNewDocType] = useState("");

  async function load() {
    const r = await fetch(`/api/export/shipments?id=${id}`);
    const d = await r.json();
    setShipment(d.shipment);
    setItems(d.items ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  async function updateStage(stage: string) {
    if (!shipment) return;
    setShipment(s => s && ({ ...s, stage }));
    await fetch("/api/export/shipments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-shipment", id, stage }),
    });
  }

  async function setItemStatus(itemId: string, status: ChecklistItem["status"]) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status } : i));
    await fetch("/api/export/shipments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-checklist-item", id: itemId, status }),
    });
    if (status === "done") load();
  }

  async function deleteItem(itemId: string) {
    await fetch("/api/export/shipments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-checklist-item", id: itemId }),
    });
    setItems(prev => prev.filter(i => i.id !== itemId));
  }

  async function addItem() {
    if (!newDocType.trim()) return;
    const r = await fetch("/api/export/shipments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-checklist-item", shipmentId: id, documentType: newDocType.trim() }),
    });
    const d = await r.json();
    if (d.id) { setNewDocType(""); load(); }
  }

  async function scan() {
    setScanning(true);
    setScanSummary(null);
    try {
      const r = await fetch("/api/export/shipments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan-shipment", id }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      setScanSummary(d);
      await load();
    } finally {
      setScanning(false);
    }
  }

  if (loading || !shipment) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;

  const doneCount = items.filter(i => i.status === "done").length;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push("/export")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
            <ChevronLeft className="w-4 h-4" /> Export Department
          </button>
          <div className="w-px h-5 bg-gray-300" />
          <div className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-cyan-600" />
            <h1 className="text-lg font-bold text-gray-900">{shipment.buyer_name}</h1>
          </div>
          <div className="flex-1" />
          <button onClick={() => router.push(`/export/shipments/${id}/documents`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 transition-colors cursor-pointer">
            <FileText className="w-4 h-4" /> Documents
          </button>
        </div>

        {/* Shipment info card */}
        <div className="rounded-xl bg-white/70 border border-gray-200/80 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-500 mb-4">
            {shipment.sales_order_ref && <span>SO: <span className="text-gray-800 font-medium">{shipment.sales_order_ref}</span></span>}
            {shipment.country && <span>Country: <span className="text-gray-800 font-medium">{shipment.country}</span></span>}
            {shipment.pi_number && <span>PI: <span className="text-gray-800 font-medium">{shipment.pi_number}</span></span>}
            {shipment.advance_payment_pct !== null && (
              <span>Advance: <span className="text-gray-800 font-medium">{shipment.advance_payment_pct}%</span>
                {shipment.advance_payment_pct >= 100 && <span className="text-emerald-600 ml-1">(no bank-to-bank collection needed)</span>}
              </span>
            )}
            {shipment.drive_folder_link && (
              <a href={shipment.drive_folder_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-cyan-600 hover:underline">
                <ExternalLink className="w-3 h-3" /> Drive Folder
              </a>
            )}
          </div>

          {/* Stage stepper */}
          <div className="flex items-center gap-1 flex-wrap">
            {STAGES.map(st => (
              <button key={st.key} onClick={() => updateStage(st.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${shipment.stage === st.key ? "bg-cyan-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Checklist board */}
        <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/70">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Document Checklist</h3>
              <p className="text-xs text-gray-500">{doneCount} / {items.length} confirmed</p>
            </div>
            <button onClick={scan} disabled={scanning || !shipment.drive_folder_link}
              title={!shipment.drive_folder_link ? "No Drive folder on this shipment" : ""}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium disabled:opacity-40 cursor-pointer">
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
              {scanning ? "Scanning..." : "Scan Drive for New Documents"}
            </button>
          </div>

          {scanSummary && (
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 text-xs space-y-1">
              {scanSummary.scanned === 0 && <p className="text-gray-500">No new files found in the Drive folder.</p>}
              {scanSummary.results.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  {r.verdict === "matched" && <FileCheck2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  {(r.verdict === "suspicious" || r.verdict === "unclear") && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                  {r.verdict === "irrelevant" && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  <span className="text-gray-700 truncate">{r.fileName}</span>
                  <span className="text-gray-400">— {r.matchedType || r.verdict}</span>
                </div>
              ))}
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {items.map(item => (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 font-medium">{item.document_type}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.matched_file_name && (
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                        Matched: {item.matched_file_link ? (
                          <a href={item.matched_file_link} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline flex items-center gap-1">
                            {item.matched_file_name} <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : item.matched_file_name}
                        {item.ai_confidence !== null && <span className="text-gray-400">({(item.ai_confidence * 100).toFixed(0)}% confidence)</span>}
                      </div>
                    )}
                    {item.ai_notes && <div className="text-[11px] text-gray-400 mt-0.5">{item.ai_notes}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status !== "done" && (
                      <button onClick={() => setItemStatus(item.id, "done")} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 cursor-pointer">
                        <Check className="w-3 h-3" /> Confirm
                      </button>
                    )}
                    {item.status === "done" && (
                      <button onClick={() => setItemStatus(item.id, "pending")} className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-gray-400 hover:bg-gray-100 cursor-pointer">
                        Reopen
                      </button>
                    )}
                    <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-300 hover:text-red-600 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            ))}
            {items.length === 0 && <div className="px-4 py-8 text-center text-gray-400 text-xs">No documents on the checklist yet.</div>}
          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200/70">
            <input value={newDocType} onChange={e => setNewDocType(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} placeholder="Add a document type..."
              className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-cyan-500/50" />
            <button onClick={addItem} className="p-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
