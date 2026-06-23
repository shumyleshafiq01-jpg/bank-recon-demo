"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Bell, Plus, Trash2, RefreshCw, X } from "lucide-react";
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
  { value: "weekly",   label: "Weekly" },
  { value: "monthly",  label: "Monthly" },
];

const targetLabel = (t: string) => TARGET_OPTIONS.find((o) => o.value === t)?.label ?? t;
const freqLabel   = (f: string) => FREQ_OPTIONS.find((o) => o.value === f)?.label ?? f;

export default function RemindersPage() {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [doneSummary, setDoneSummary] = useState<DoneSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // New reminder form
  const [message, setMessage] = useState("");
  const [target, setTarget]   = useState("both");
  const [dueDate, setDueDate] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [saving, setSaving]   = useState(false);

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
        <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">

          {/* Create form */}
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide">New Reminder</h3>

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
                {frequency === "monthly" && "Repeats every month — reappears after user marks done."}
                {frequency === "weekly"  && "Repeats every 7 days — reappears after user marks done."}
                {frequency === "one-time" && "Shows once until user marks done — then disappears permanently."}
              </p>
              <button
                onClick={createReminder}
                disabled={!message.trim() || saving}
                className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-500/80 text-white text-sm font-semibold rounded-xl cursor-pointer transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Create Reminder"}
              </button>
            </div>
          </div>

          {/* Active reminders list */}
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Active Reminders ({reminders.length})</h3>

            {loading ? (
              <div className="bg-surface rounded-2xl border border-border p-8 text-center text-muted text-sm">Loading...</div>
            ) : reminders.length === 0 ? (
              <div className="bg-surface rounded-2xl border border-border p-8 text-center text-muted text-sm">No active reminders. Create one above.</div>
            ) : (
              <div className="space-y-3">
                {reminders.map((r) => {
                  const ds = getDone(r.id);
                  const allDone = ds ? ds.doneCount >= ds.totalCount : false;
                  return (
                    <div key={r.id} className="bg-surface rounded-2xl border border-border p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-relaxed">{r.message}</p>
                          <div className="flex items-center flex-wrap gap-2 mt-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold">
                              {targetLabel(r.target)}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${freqColor(r.frequency)}`}>
                              {freqLabel(r.frequency)}
                            </span>
                            {r.dueDate && (
                              <span className="text-[10px] text-muted">Due: {r.dueDate}</span>
                            )}
                            {ds && (
                              <span className={`text-[10px] font-semibold ${allDone ? "text-emerald-400" : "text-amber-400"}`}>
                                {ds.doneCount}/{ds.totalCount} done
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {ds && ds.doneCount > 0 && (
                            <button
                              onClick={() => resetReminder(r.id)}
                              title="Reset — make it appear again for everyone"
                              className="p-1.5 text-muted hover:text-amber-400 cursor-pointer transition-colors rounded-lg hover:bg-amber-500/10"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteReminder(r.id)}
                            title="Delete permanently"
                            className="p-1.5 text-muted hover:text-red-400 cursor-pointer transition-colors rounded-lg hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
