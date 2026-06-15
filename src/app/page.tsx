"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Landmark, Shield, User, FlaskConical, ArrowRight, Lock, X, AlertTriangle } from "lucide-react";

const USER_CODE = "07860";
const TESTING_EXPIRY_MS = 72 * 60 * 60 * 1000;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get("expired") === "1";
  const [showCodePrompt, setShowCodePrompt] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

  function handleUser() {
    setShowCodePrompt(true);
    setCode("");
    setCodeError("");
  }

  function submitCode() {
    if (code === USER_CODE) {
      localStorage.setItem("session", JSON.stringify({ type: "user", ts: Date.now() }));
      router.push("/dashboard");
    } else {
      setCodeError("Invalid code. Please try again.");
    }
  }

  function handleTesting() {
    localStorage.setItem("session", JSON.stringify({ type: "testing", ts: Date.now() }));
    router.push("/dashboard");
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Landmark className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Bank Reconciliation
          </h1>
          <p className="text-muted text-sm">
            AI-Powered Reconciliation Agent Demo
          </p>
          <p className="text-muted/60 text-xs">
            by Sheikh Shumyle &middot; Created: 9 June 2026
          </p>
        </div>

        {/* Expired Banner */}
        {expired && (
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Your testing session has expired. Please select an access type to continue.
          </div>
        )}

        {/* Account Selection */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center gap-3 text-sm text-muted">
            <Shield className="w-4 h-4 text-accent" />
            <span>Select your access type</span>
          </div>

          {/* User Account */}
          <button
            onClick={handleUser}
            className="w-full flex items-center gap-4 bg-surface-light hover:bg-primary/10 border border-border hover:border-primary/50 rounded-xl p-4 transition-all cursor-pointer group text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">User</h3>
              <p className="text-xs text-muted mt-0.5">Team access with code</p>
            </div>
            <Lock className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
          </button>

          {/* Testing Account */}
          <button
            onClick={handleTesting}
            className="w-full flex items-center gap-4 bg-surface-light hover:bg-cyan-500/10 border border-border hover:border-cyan-500/50 rounded-xl p-4 transition-all cursor-pointer group text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0">
              <FlaskConical className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground group-hover:text-cyan-400 transition-colors">Testing</h3>
              <p className="text-xs text-muted mt-0.5">Beta access &middot; expires in 72 hours</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted group-hover:text-cyan-400 transition-colors" />
          </button>
        </div>

        <p className="text-center text-xs text-muted/50">
          This is a demo application showcasing AI agent capabilities
          for automated bank reconciliation workflows.
        </p>
      </div>

      {/* Code Prompt Modal */}
      {showCodePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">Enter Access Code</h3>
              </div>
              <button onClick={() => setShowCodePrompt(false)} className="text-muted hover:text-foreground transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              type="password"
              value={code}
              onChange={(e) => { setCode(e.target.value); setCodeError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submitCode()}
              placeholder="Enter code"
              autoFocus
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/50 text-center text-lg tracking-widest"
            />

            {codeError && (
              <p className="text-sm text-red-400 text-center">{codeError}</p>
            )}

            <button
              onClick={submitCode}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
            >
              Unlock
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
