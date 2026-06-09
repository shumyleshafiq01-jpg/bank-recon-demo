"use client";

import { useRouter } from "next/navigation";
import { Landmark, ArrowRight, Shield } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

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

        {/* Guest Sign In */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <div className="flex items-center gap-3 text-sm text-muted">
            <Shield className="w-4 h-4 text-accent" />
            <span>No account needed — sign in as guest</span>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-4 rounded-xl transition-all cursor-pointer"
          >
            Continue as Guest
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="text-center text-xs text-muted/50">
          This is a demo application showcasing AI agent capabilities
          for automated bank reconciliation workflows.
        </p>
      </div>
    </div>
  );
}
