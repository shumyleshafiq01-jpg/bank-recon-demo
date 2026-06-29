"use client";

import { useState, useEffect } from "react";
import { Zap, X } from "lucide-react";

const STORAGE_KEY = "kafi_api_code_verified";
const CORRECT_CODE = process.env.NEXT_PUBLIC_API_CREDIT_CODE || "";

interface Props {
  children: React.ReactNode;
  moduleName: string;
}

export default function ApiCodeGate({ children, moduleName }: Props) {
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved === "true") setVerified(true);
    } catch { /* ignore */ }
    setChecked(true);
  }, []);

  function submit() {
    if (code.trim() === CORRECT_CODE) {
      sessionStorage.setItem(STORAGE_KEY, "true");
      setVerified(true);
      setError("");
    } else {
      setError("Incorrect code. Contact admin.");
      setCode("");
    }
  }

  if (!checked) return null;

  if (verified) return <>{children}</>;

  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-background p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-sm p-7 space-y-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">API Access Required</h2>
            <p className="text-[11px] text-muted">{moduleName}</p>
          </div>
        </div>

        <p className="text-xs text-muted leading-relaxed">
          This module consumes AI credits. Enter your access code to continue.
        </p>

        <div className="space-y-3">
          <input
            type="password"
            value={code}
            onChange={e => { setCode(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="Enter access code"
            autoFocus
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-amber-500/50"
          />
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              <X className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
          <button
            onClick={submit}
            disabled={!code.trim()}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-500/80 text-white text-sm font-semibold rounded-xl cursor-pointer transition-colors disabled:opacity-40"
          >
            Unlock Module
          </button>
        </div>

        <p className="text-[10px] text-muted text-center">
          Code is valid for this browser session only.
        </p>
      </div>
    </div>
  );
}
