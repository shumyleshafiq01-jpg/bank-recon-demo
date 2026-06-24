"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Bell, Plus, Trash2, RefreshCw, X, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

interface Reminder {
  id: string;
  message: string;
  target: string;
  dueDate: string;
  frequency: string;
  createdAt: string;
  active: boolean;
}

interface DoneSummary {
  reminderId: string;
  doneCount: number;
  totalCount: number;
}

const TARGET_OPTIONS = [
  { value: "both",       label: "AA1 + AA2 (Moiz & Hamza)" },
  { value: "aa1",        label: "AA1 — Moiz only" },
  { value: "aa2",        label: "AA2 — Hamza only" },
  { value: "accountant", label: "Accountant — A.Hafeez only" },
  { value: "all",        label: "Everyone (All 3)" },
];

const FREQ_OPTIONS = [
  { value: "one-time", label: "One-time" },
  { value: "daily",    label: "Daily" },
  { value: "weekly",   label: "Weekly" },
  { value: "monthly",  label: "Monthly" },
  { value: "annual",   label: "Annual" },
];

const targetLabel = (t: string) => TARGET_OPTIONS.find((o) => o.value === t)?.label ?? t;
const freqLabel   = (f: string) => FREQ_OPTIONS.find((o) => o.value === f)?.label ?? f;

export default function RemindersPage() {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [doneSummary, setDoneSummary] = useState<DoneSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // New / edit reminder form
  const [message, setMessage] = useState("");
  const [target, setTarget]   = useState("both");
  const [dueDate, setDueDate] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [saving, setSaving]   = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  function startEdit(r: Reminder) {
    setEditingReminder(r);
    setMessage(r.message);
    setTarget(r.target);
    setDueDate(r.dueDate);
    setFrequency(r.frequency);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingReminder(null);
    setMessage(""); setTarget("both"); setDueDate(""); setFrequency("monthly");
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/reminders?role=accountant-manage");
      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders ?? []);
        setDoneSummary(data.doneSummary ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveReminder() {
    if (!message.trim()) return;
    setSaving(true);
    try {
      if (editingReminder) {
        await fetch("/api/reminders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", reminderId: editingReminder.id, message: message.trim(), target, dueDate, frequency }),
        });
        cancelEdit();
      } else {
        await fetch("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: message.trim(), target, dueDate, frequency }),
        });
        setMessage(""); setDueDate("");
      }
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function createReminder() {
    if (!message.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), target, dueDate, frequency }),
      });
      setMessage(""); setDueDate("");
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function resetReminder(id: string) {
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", reminderId: id }),
    });
    await load();
  }

  async function deleteReminder(id: string) {
    if (!confirm("Delete this reminder permanently?")) return;
    await fetch("/api/reminders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderId: id }),
    });
    await load();
  }

  const getDone = (id: string) => doneSummary.find((d) => d.reminderId === id);

  const freqColor = (f: string) =>
    f === "monthly" ? "bg-indigo-500/10 text-indigo-400"
    : f === "weekly" ? "bg-purple-500/10 text-purple-400"
    : "bg-slate-500/10 text-slate-400";

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <Bell className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <span className="text-sm font-bold text-foreground">Reminders</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold">Global</span>
        <span className="text-[10px] text-muted ml-1">— seen on every module login</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">

          {/* Create form */}
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                {editingReminder ? "Edit Reminder" : "New Reminder"}
              </h3>
              {editingReminder && (
                <button onClick={cancelEdit} className="text-[10px] text-muted hover:text-foreground cursor-pointer flex items-center gap-1">
                  <X className="w-3 h-3" /> Cancel Edit
                </button>
              )}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Enter EOBI contribution for the month"
              rows={3}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-amber-500/50 resize-none"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1.5">Reminder For</label>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-amber-500/50 cursor-pointer"
                >
                  {TARGET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1.5">Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-amber-500/50 cursor-pointer"
                >
                  {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1.5">Due Date (optional)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-muted">
                {frequency === "monthly"  && "Repeats every month — reappears 1st of next month after marked done."}
                {frequency === "weekly"   && "Repeats every 7 days — reappears after user marks done."}
                {frequency === "daily"    && "Repeats every day — reappears 24 hours after marked done."}
                {frequency === "annual"   && "Repeats every year — reappears next calendar year after marked done."}
                {frequency === "one-time" && "Shows once until user marks done — then disappears permanently."}
              </p>
              <button
                onClick={saveReminder}
                disabled={!message.trim() || saving}
                className={`flex items-center gap-1.5 px-5 py-2 text-white text-sm font-semibold rounded-xl cursor-pointer transition-colors disabled:opacity-50 ${editingReminder ? "bg-indigo-500 hover:bg-indigo-500/80" : "bg-amber-500 hover:bg-amber-500/80"}`}
              >
                {editingReminder ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {saving ? "Saving..." : editingReminder ? "Update Reminder" : "Create Reminder"}
              </button>
            </div>
          </div>

          {/* Active reminders table */}
          <div className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
                Active Reminders <span className="text-amber-400 ml-1 font-bold">{reminders.length}</span>
              </h3>
            </div>
            {loading ? (
              <p className="text-sm text-muted text-center py-10">Loading...</p>
            ) : reminders.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">No active reminders. Create one above.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-amber-500/10 text-amber-400">
                      <th className="px-4 py-3 text-left font-semibold w-[40px]">#</th>
                      <th className="px-4 py-3 text-left font-semibold">Reminder</th>
                      <th className="px-4 py-3 text-left font-semibold w-[120px]">For</th>
                      <th className="px-4 py-3 text-left font-semibold w-[90px]">Frequency</th>
                      <th className="px-4 py-3 text-left font-semibold w-[140px]">Due</th>
                      <th className="px-4 py-3 text-center font-semibold w-[70px]">Done</th>
                      <th className="px-4 py-3 text-center font-semibold w-[80px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reminders.map((r, i) => {
                      const ds = getDone(r.id);
                      const allDone = ds ? ds.doneCount >= ds.totalCount : false;
                      return (
                        <tr key={r.id} className={`border-t border-border/50 ${i % 2 === 0 ? "" : "bg-amber-500/[0.03]"} hover:bg-amber-500/10 transition-colors`}>
                          <td className="px-4 py-3 text-muted font-semibold">{i + 1}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-foreground leading-snug">{r.message}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 font-semibold whitespace-nowrap">
                              {targetLabel(r.target)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold whitespace-nowrap ${freqColor(r.frequency)}`}>
                              {freqLabel(r.frequency)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted font-medium">{r.dueDate || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-bold ${allDone ? "text-emerald-400" : "text-amber-400"}`}>
                              {ds ? `${ds.doneCount}/${ds.totalCount}` : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => startEdit(r)} title="Edit reminder"
                                className="p-1.5 text-muted hover:text-indigo-400 cursor-pointer transition-colors rounded hover:bg-indigo-500/10">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {ds && ds.doneCount > 0 && (
                                <button onClick={() => resetReminder(r.id)} title="Reset for everyone"
                                  className="p-1.5 text-muted hover:text-amber-400 cursor-pointer transition-colors rounded hover:bg-amber-500/10">
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={() => deleteReminder(r.id)} title="Delete permanently"
                                className="p-1.5 text-muted hover:text-red-400 cursor-pointer transition-colors rounded hover:bg-red-500/10">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
