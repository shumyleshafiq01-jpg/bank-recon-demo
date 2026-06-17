"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { Landmark, Shield, User, FlaskConical, ArrowRight, Lock, X, AlertTriangle } from "lucide-react";

const USER_CODE = "07860";
const TESTING_DEADLINE = new Date("2026-06-20T12:00:00Z").getTime();

type Node = { x: number; y: number; vx: number; vy: number; radius: number };

function NeuronBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef<number>(0);

  const init = useCallback((w: number, h: number) => {
    const count = Math.floor((w * h) / 18000);
    const nodes: Node[] = [];
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 1.5,
      });
    }
    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (nodesRef.current.length === 0) init(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouse);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const nodes = nodesRef.current;
      const mouse = mouseRef.current;
      const CONNECTION_DIST = 140;

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        const dx = mouse.x - n.x;
        const dy = mouse.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) {
          n.vx += dx * 0.00008;
          n.vy += dy * 0.00008;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.18;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const dx = mouse.x - n.x;
        const dy = mouse.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const glow = dist < 200 ? 1 : 0;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = glow
          ? `rgba(59, 130, 246, ${0.5 + (1 - dist / 200) * 0.5})`
          : "rgba(59, 130, 246, 0.35)";
        ctx.fill();

        if (glow && dist < 150) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(59, 130, 246, ${(1 - dist / 150) * 0.15})`;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, [init]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get("expired") === "1";
  const testingAvailable = Date.now() < TESTING_DEADLINE;
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
    <div className="flex-1 flex items-center justify-center p-6 min-h-screen" style={{ background: "#e8ecf1" }}>
      <NeuronBackground />

      <div className="relative z-10 w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Landmark className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            AI Agent Finance
          </h1>
          <p className="text-gray-500 text-sm">
            AI-Powered Finance Agent
          </p>
          <p className="text-gray-400 text-xs">
            by Sheikh Shumyle &middot; Created: 9 June 2026
          </p>
        </div>

        {/* Expired Banner */}
        {expired && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Your testing session has expired. Please select an access type to continue.
          </div>
        )}

        {/* Account Selection */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-lg shadow-black/5">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Shield className="w-4 h-4 text-blue-500" />
            <span>Select your access type</span>
          </div>

          {/* User Account */}
          <button
            onClick={handleUser}
            className="w-full flex items-center gap-4 bg-gray-50/80 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-xl p-4 transition-all cursor-pointer group text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">User</h3>
              <p className="text-xs text-gray-400 mt-0.5">Team access with code</p>
            </div>
            <Lock className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
          </button>

          {/* Testing Account */}
          {testingAvailable && (
            <button
              onClick={handleTesting}
              className="w-full flex items-center gap-4 bg-gray-50/80 hover:bg-cyan-50 border border-gray-200 hover:border-cyan-300 rounded-xl p-4 transition-all cursor-pointer group text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0">
                <FlaskConical className="w-5 h-5 text-cyan-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 group-hover:text-cyan-600 transition-colors">Testing</h3>
                <p className="text-xs text-gray-400 mt-0.5">Beta access &middot; expires in {Math.max(0, Math.ceil((TESTING_DEADLINE - Date.now()) / 3600000))} hours</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-cyan-500 transition-colors" />
            </button>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          This is a demo application showcasing AI agent capabilities
          for automated finance workflows.
        </p>
      </div>

      {/* Code Prompt Modal */}
      {showCodePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm space-y-4 animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Enter Access Code</h3>
              </div>
              <button onClick={() => setShowCodePrompt(false)} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
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
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 text-center text-lg tracking-widest"
            />

            {codeError && (
              <p className="text-sm text-red-500 text-center">{codeError}</p>
            )}

            <button
              onClick={submitCode}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-600/20"
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
