"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  ChevronLeft, Truck, Plus, Trash2, X, Loader2, Check,
  FileText, Camera, Upload, ShieldCheck, ChevronDown, ImageIcon,
} from "lucide-react";
import { compressImage } from "@/lib/image-compress";

type Bom = { id: string; bom_name: string; buyer_name: string; container_type: string };
type SessionItem = {
  id: string; product_name: string; packing_desc: string;
  cartons_expected: number; cartons_packed: number; remarks: string;
};
type Photo = { id: string; url: string; caption: string; created_at: string };
type PackSession = {
  id: string; session_number: string; buyer_name: string; container_type: string;
  status: "in_progress" | "completed"; notes: string; bom_id: string | null;
  completed_at: string | null; items: SessionItem[];
};

export default function PackingPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PackSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<PackSession | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [bomsLoading, setBomsLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  async function loadSessions() {
    const r = await fetch("/api/supply-chain/packing");
    const d = await r.json();
    setSessions(d.sessions ?? []);
    setLoading(false);
  }

  useEffect(() => { loadSessions(); }, []);

  async function openCreate() {
    setShowCreate(true);
    setBomsLoading(true);
    const r = await fetch("/api/supply-chain/boms");
    const d = await r.json();
    setBoms(d.boms ?? []);
    setBomsLoading(false);
  }

  async function createFromBom(bom: Bom) {
    setCreatingId(bom.id);
    const r = await fetch("/api/supply-chain/packing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-from-bom", bomId: bom.id }),
    });
    const d = await r.json();
    setCreatingId(null);
    setShowCreate(false);
    if (d.id) {
      await loadSessions();
      openSession(d.id);
    }
  }

  async function openSession(id: string) {
    const r = await fetch(`/api/supply-chain/packing?id=${id}`);
    const d = await r.json();
    setActive(d.session);
    setItems(d.items ?? []);
    setPhotos(d.photos ?? []);
    setNotes(d.session?.notes || "");
    setSaved(true);
  }

  function updateItem(id: string, field: "cartons_packed" | "remarks", val: string | number) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: field === "cartons_packed" ? (Number(val) || 0) : String(val) } : it));
    setSaved(false);
  }

  async function saveItems() {
    setSaving(true);
    await fetch("/api/supply-chain/packing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-items", items: items.map(it => ({ id: it.id, cartonsPacked: it.cartons_packed, remarks: it.remarks })) }),
    });
    if (active) {
      await fetch("/api/supply-chain/packing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-notes", id: active.id, notes }),
      });
    }
    setSaving(false);
    setSaved(true);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || !active) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const compressed = await compressImage(file);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });
      const up = await fetch("/api/product-list/upload-image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: compressed.name, mimeType: compressed.type, base64 }),
      });
      const upData = await up.json();
      if (upData.thumbnailUrl) {
        await fetch("/api/supply-chain/packing", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add-photo", sessionId: active.id, url: upData.thumbnailUrl }),
        });
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (active) openSession(active.id);
  }

  async function deletePhoto(id: string) {
    await fetch("/api/supply-chain/packing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-photo", id }),
    });
    setPhotos(prev => prev.filter(p => p.id !== id));
  }

  async function completeSession() {
    if (!active) return;
    setCompleting(true);
    await saveItems();
    await fetch("/api/supply-chain/packing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", id: active.id }),
    });
    setCompleting(false);
    await loadSessions();
    openSession(active.id);
  }

  async function deleteSession(id: string) {
    await fetch("/api/supply-chain/packing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setSessions(prev => prev.filter(s => s.id !== id));
    if (active?.id === id) { setActive(null); setItems([]); setPhotos([]); }
  }

  const totals = useMemo(() => ({
    expected: items.reduce((s, it) => s + it.cartons_expected, 0),
    packed: items.reduce((s, it) => s + it.cartons_packed, 0),
  }), [items]);
  const fullyPacked = totals.expected > 0 && totals.packed >= totals.expected;

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Supply Chain
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-rose-600" />
              <h1 className="text-lg font-bold text-gray-900">Packing &amp; Loading</h1>
              <span className="text-xs text-gray-400">{sessions.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sessions.length > 0 && (
              <button onClick={() => setActive(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer">
                <FileText className="w-4 h-4" /> All Sessions
              </button>
            )}
            <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> New Session from BOM
            </button>
          </div>
        </div>

        {!active ? (
          sessions.length === 0 ? (
            <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
              <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-1">No packing sessions yet</p>
              <p className="text-gray-400 text-xs mb-4">Start one from a BOM once its finished goods are ready to load.</p>
              <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors cursor-pointer">
                <Plus className="w-4 h-4" /> New Session from BOM
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(s => (
                <div key={s.id} className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <button onClick={() => openSession(s.id)} className="flex-1 text-left cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 font-semibold text-sm">{s.session_number}</span>
                        {s.buyer_name && <span className="text-gray-500 text-sm">— {s.buyer_name}</span>}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${s.status === "completed" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                          {s.status === "completed" ? "Completed" : "In Progress"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {s.container_type.toUpperCase()} · {s.items.reduce((sum, it) => sum + it.cartons_packed, 0)} / {s.items.reduce((sum, it) => sum + it.cartons_expected, 0)} cartons packed
                      </div>
                    </button>
                    <button onClick={() => deleteSession(s.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-4 rounded-xl bg-white/70 border border-gray-200/80">
              <div>
                <h2 className="text-gray-900 font-semibold">{active.session_number}</h2>
                <p className="text-xs text-gray-500">
                  {active.buyer_name && `${active.buyer_name} · `}{active.container_type.toUpperCase()}
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${active.status === "completed" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                    {active.status === "completed" ? "Completed" : "In Progress"}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">Packed: <span className={`font-medium ${fullyPacked ? "text-emerald-600" : "text-amber-600"}`}>{totals.packed} / {totals.expected}</span></span>
              </div>
            </div>

            <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden mb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/70">
                      <th className="text-left px-4 py-3 text-gray-500 font-medium w-8">#</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Product</th>
                      <th className="text-center px-4 py-3 text-gray-500 font-medium w-28">Expected</th>
                      <th className="text-center px-4 py-3 text-gray-500 font-medium w-28">Packed</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium w-40">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const done = it.cartons_packed >= it.cartons_expected && it.cartons_expected > 0;
                      return (
                        <tr key={it.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                          <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5 text-gray-900 text-xs font-medium">
                              {done && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                              {it.product_name}
                            </div>
                            <div className="text-gray-400 text-[11px]">{it.packing_desc}</div>
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-700 text-xs font-medium">{it.cartons_expected}</td>
                          <td className="px-4 py-2.5">
                            <input type="number" min="0" value={it.cartons_packed || ""} disabled={active.status === "completed"}
                              onChange={e => updateItem(it.id, "cartons_packed", e.target.value)}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-gray-900 text-sm focus:outline-none focus:border-rose-500/50 disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          </td>
                          <td className="px-4 py-2.5">
                            <input type="text" value={it.remarks} disabled={active.status === "completed"} placeholder="..."
                              onChange={e => updateItem(it.id, "remarks", e.target.value)}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-gray-700 text-xs focus:outline-none focus:border-rose-500/50 disabled:opacity-60" />
                          </td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">No items in this session.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Photo verification */}
            <div className="rounded-xl bg-white/70 border border-gray-200/80 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-rose-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Photo Verification</h3>
                  <span className="text-xs text-gray-400">{photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
                </div>
                {active.status !== "completed" && (
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-40">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Upload Photos
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              </div>
              {photos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">
                  <ImageIcon className="w-8 h-8 mb-2 text-gray-300" />
                  No photos uploaded yet
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {photos.map(p => (
                    <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="Packing photo" className="w-full h-full object-cover" />
                      {active.status !== "completed" && (
                        <button onClick={() => deletePhoto(p.id)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes + actions */}
            <div className="rounded-xl bg-white/70 border border-gray-200/80 p-4">
              <label className="text-xs text-gray-500 mb-1.5 block">Loading Sequence / Notes</label>
              <textarea value={notes} onChange={e => { setNotes(e.target.value); setSaved(false); }} disabled={active.status === "completed"}
                placeholder="e.g. load rice first at the back, cartons front-to-back by SKU..." rows={3}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-4 focus:outline-none focus:border-rose-500/50 disabled:opacity-60" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3.5 h-3.5" /> Saved</span>}
                  {active.status !== "completed" && (
                    <button onClick={saveItems} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors disabled:opacity-40 cursor-pointer">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Save Progress
                    </button>
                  )}
                </div>
                {active.status === "completed" ? (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium"><ShieldCheck className="w-4 h-4" /> Packing Complete</span>
                ) : (
                  <button onClick={completeSession} disabled={completing} className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                    {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Mark Packing Complete
                  </button>
                )}
              </div>
              {!fullyPacked && active.status !== "completed" && totals.expected > 0 && (
                <p className="text-[11px] text-amber-600 mt-2">Not all cartons are marked packed yet — you can still complete early if this is intentional (partial shipment).</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold">New Packing Session</h3>
                <p className="text-xs text-gray-500 mt-0.5">Pick the BOM whose finished goods are ready to load</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {bomsLoading && <div className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-rose-600 mx-auto" /></div>}
              {!bomsLoading && boms.length === 0 && <div className="px-5 py-10 text-center text-gray-400 text-sm">No BOMs yet. Create one in the BOM module first.</div>}
              {boms.map(b => (
                <button key={b.id} onClick={() => createFromBom(b)} disabled={creatingId === b.id}
                  className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-violet-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-900 text-sm font-medium truncate">{b.bom_name}</div>
                    <div className="text-xs text-gray-500 truncate">{b.buyer_name && `${b.buyer_name} · `}{b.container_type.toUpperCase()}</div>
                  </div>
                  {creatingId === b.id && <Loader2 className="w-4 h-4 animate-spin text-rose-600 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
