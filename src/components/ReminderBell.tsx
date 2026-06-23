"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Check, X, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

export type ReminderRole = "accountant" | "aa1" | "aa2";

interface Reminder {
  id: string;
  message: string;
  target: string;
  dueDate: string;
  frequency: string;
}

interface ReminderBellProps {
  role: ReminderRole;
  name: string;
}

export default function ReminderBell({ role, name }: ReminderBellProps) {
  const router = useRouter();
  const [pending, setPending] = useState<Reminder[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch(`/api/reminders?role=${role}`);
      if (res.ok) {
        const data = await res.json();
        setPending(data.reminders ?? []);
      }
    } catch { /* ignore */ }
  }, [role]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // Auto-show popup on mount if there are pending reminders (for AA1/AA2)
  useEffect(() => {
    if (role !== "accountant" && pending.length > 0) {
      setShowPopup(true);
    }
  }, [pending.length, role]);

  const visible = pending.filter((r) => !dismissed.has(r.id));

  async function markDone(id: string) {
    setMarking(id);
    try {
      await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "done", reminderId: id, role }),
      });
      setDismissed((prev) => new Set([...prev, id]));
      setPending((prev) => prev.filter((r) => r.id !== id));
    } catch { /* ignore */ }
    setMarking(null);
  }

  const frequencyLabel = (f: string) =>
    f === "monthly" ? "Monthly" : f === "weekly" ? "Weekly" : "One-time";

  if (!showPopup) {
    return (
      <button
        onClick={() => {
          if (role === "accountant") router.push("/reminders");
          else setShowPopup(true);
        }}
        className="relative flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all text-muted border-border hover:text-amber-400 hover:border-amber-500/30"
      >
        <Bell className="w-3 h-3" />
        {visible.length > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[8px] font-bold flex items-center justify-center">
            {visible.length}
          </span>
        )}
      </button>
    );
  }

  // Popup — for AA1/AA2 (and accountant if they have pending reminders targeted at them)
  return (
    <>
      <button
        onClick={() => {
          if (role === "accountant") router.push("/reminders");
          else setShowPopup(true);
        }}
        className="relative flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all bg-amber-500/10 text-amber-400 border-amber-500/30"
      >
        <Bell className="w-3 h-3" />
        {visible.length > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[8px] font-bold flex items-center justify-center">
            {visible.length}
          </span>
        )}
      </button>

      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-surface rounded-2xl border border-border w-full max-w-md shadow-2xl">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Bell className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Reminders</h3>
              <p className="text-[10px] text-muted">
                {visible.length > 0 ? `${visible.length} pending for ${name}` : "All done!"}
              </p>
            </div>
            {role === "accountant" && (
              <button
                onClick={() => { setShowPopup(false); router.push("/reminders"); }}
                className="ml-auto flex items-center gap-1 text-[10px] text-muted hover:text-foreground cursor-pointer"
              >
                <Settings className="w-3 h-3" /> Manage
              </button>
            )}
            <button onClick={() => setShowPopup(false)} className={`${role === "accountant" ? "" : "ml-auto"} text-muted hover:text-foreground cursor-pointer`}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-3 max-h-[55vh] overflow-y-auto">
            {visible.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">All reminders marked done.</p>
            ) : visible.map((r) => (
              <div key={r.id} className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-relaxed">{r.message}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold">
                      {frequencyLabel(r.frequency)}
                    </span>
                    {r.dueDate && (
                      <span className="text-[9px] text-muted">Due: {r.dueDate}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => markDone(r.id)}
                  disabled={marking === r.id}
                  className="shrink-0 flex items-center gap-1 text-[10px] px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-600 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Check className="w-3 h-3" />
                  {marking === r.id ? "..." : "Done"}
                </button>
              </div>
            ))}
          </div>

          {visible.length > 0 && (
            <div className="px-5 py-3 border-t border-border">
              <p className="text-[10px] text-muted">
                {pending[0]?.frequency === "one-time"
                  ? "Mark done to dismiss permanently."
                  : pending[0]?.frequency === "daily"
                  ? "Daily reminder — reappears after 24 hours."
                  : pending[0]?.frequency === "weekly"
                  ? "Weekly reminder — reappears after 7 days."
                  : "Monthly reminder — reappears next calendar month."}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
