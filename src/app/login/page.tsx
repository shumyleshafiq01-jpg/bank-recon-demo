"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { Sparkles, LogIn, KeyRound, Loader2, ChevronLeft } from "lucide-react";

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
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
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
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; if (nodesRef.current.length === 0) init(canvas.width, canvas.height); };
    resize();
    window.addEventListener("resize", resize);
    const onMouse = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMouse);
    const draw = () => {
      const w = canvas.width; const h = canvas.height; ctx.clearRect(0, 0, w, h);
      const nodes = nodesRef.current; const mouse = mouseRef.current;
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1;
        const dx = mouse.x - n.x; const dy = mouse.y - n.y; const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) { n.vx += dx * 0.00008; n.vy += dy * 0.00008; }
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x; const dy = nodes[i].y - nodes[j].y; const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) { ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.strokeStyle = `rgba(59,130,246,${(1 - dist / 140) * 0.18})`; ctx.lineWidth = 0.8; ctx.stroke(); }
        }
      }
      for (const n of nodes) {
        const dx = mouse.x - n.x; const dy = mouse.y - n.y; const dist = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = dist < 200 ? `rgba(59,130,246,${0.5 + (1 - dist / 200) * 0.5})` : "rgba(59,130,246,0.35)"; ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); window.removeEventListener("mousemove", onMouse); };
  }, [init]);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
}

function LoginContent() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // PIN change flow
  const [mustChange, setMustChange] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [changingPin, setChangingPin] = useState(false);

  // Check if already logged in
  useEffect(() => {
    fetch("/api/auth").then(r => r.json()).then(d => {
      if (d.user && !d.user.mustChangePin) router.replace("/dashboard");
    }).catch(() => {});
  }, [router]);

  async function handleLogin() {
    setError("");
    if (!username.trim() || !pin.trim()) { setError("Enter username and PIN"); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username: username.trim(), pin: pin.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Login failed"); return; }
      if (d.user?.mustChangePin) {
        setMustChange(true);
      } else {
        router.push("/dashboard");
      }
    } catch { setError("Network error"); } finally { setLoading(false); }
  }

  async function handleChangePin() {
    setError("");
    if (!newPin.trim() || newPin.length < 4) { setError("PIN must be at least 4 characters"); return; }
    if (newPin !== confirmPin) { setError("PINs do not match"); return; }
    if (newPin === "1111") { setError("Choose a different PIN"); return; }
    setChangingPin(true);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-pin", newPin }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Failed"); return; }
      router.push("/dashboard");
    } catch { setError("Network error"); } finally { setChangingPin(false); }
  }

  if (mustChange) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 min-h-screen" style={{ background: "#e8ecf1" }}>
        <NeuronBackground />
        <div className="relative z-10 w-full max-w-sm space-y-6 animate-fade-in">
          <div className="text-center space-y-3">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <KeyRound className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Set Your New PIN</h1>
            <p className="text-gray-500 text-sm">You must change your default PIN before continuing</p>
          </div>
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-lg shadow-black/5">
            <input
              type="password" value={newPin} onChange={e => { setNewPin(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleChangePin()} placeholder="New PIN (min 4 chars)" autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-400"
            />
            <input
              type="password" value={confirmPin} onChange={e => { setConfirmPin(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleChangePin()} placeholder="Confirm PIN"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-400"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button onClick={handleChangePin} disabled={changingPin}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
              {changingPin ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Set PIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-screen" style={{ background: "#e8ecf1" }}>
      <NeuronBackground />
      <div className="relative z-10 w-full max-w-sm space-y-6 animate-fade-in">
        <button onClick={() => router.push("/")} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
          <ChevronLeft className="w-4 h-4" /> Back to AI Agent
        </button>
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Kafi AI Platform</h1>
          <p className="text-gray-500 text-sm">Sign in with your staff credentials</p>
        </div>
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 space-y-4 shadow-lg shadow-black/5">
          <input
            type="text" value={username} onChange={e => { setUsername(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Username" autoFocus autoComplete="username"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-400"
          />
          <input
            type="password" value={pin} onChange={e => { setPin(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="PIN" autoComplete="current-password"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-400"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={handleLogin} disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Sign In
          </button>
        </div>
        <p className="text-center text-xs text-gray-400">Kafi Commodities (Pvt) Ltd</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>;
}
