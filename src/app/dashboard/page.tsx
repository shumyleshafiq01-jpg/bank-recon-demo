"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Landmark, ArrowRight, Clock, User, Building2, CreditCard,
  Globe, FileText, LogOut, Scale, Timer, BookOpen, Wallet,
} from "lucide-react";

const TESTING_DEADLINE = new Date("2026-06-20T12:00:00Z").getTime();

type Session = { type: "user" | "testing"; ts: number } | null;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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

const MODULES = [
  {
    key: "multi-bank",
    route: "/multi-bank",
    title: "Multi-Bank Adjustments",
    desc: "ABL, HMB, Faysal, Soneri — auto-detect format, match by date & amount",
    icon: Building2,
    color: "violet",
    gradient: "from-violet-600/20 to-violet-900/40",
    border: "hover:border-violet-400/60",
    iconBg: "bg-violet-500/20",
    iconColor: "text-violet-400",
    tagBg: "bg-violet-500/10 text-violet-300",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%238b5cf6' stop-opacity='0.3'/%3E%3Cstop offset='1' stop-color='%238b5cf6' stop-opacity='0.05'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23g)'/%3E%3Crect x='30' y='60' width='55' height='80' rx='6' fill='%238b5cf6' opacity='0.25'/%3E%3Crect x='115' y='60' width='55' height='80' rx='6' fill='%238b5cf6' opacity='0.15'/%3E%3Crect x='72' y='40' width='55' height='80' rx='6' fill='%238b5cf6' opacity='0.35'/%3E%3Cpath d='M60 150 L100 130 L140 150' stroke='%238b5cf6' stroke-width='2' fill='none' opacity='0.4'/%3E%3C/svg%3E",
    tags: ["Multi-Bank", "PDF / XLS / CSV"],
  },
  {
    key: "credit-card",
    route: "/credit-card",
    title: "Credit Card Verification",
    desc: "Auto-group by merchant, tick-verify against receipts, SCB format export",
    icon: CreditCard,
    color: "rose",
    gradient: "from-rose-600/20 to-rose-900/40",
    border: "hover:border-rose-400/60",
    iconBg: "bg-rose-500/20",
    iconColor: "text-rose-400",
    tagBg: "bg-rose-500/10 text-rose-300",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23f43f5e' stop-opacity='0.3'/%3E%3Cstop offset='1' stop-color='%23f43f5e' stop-opacity='0.05'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23g)'/%3E%3Crect x='25' y='55' width='150' height='95' rx='12' fill='%23f43f5e' opacity='0.2'/%3E%3Crect x='25' y='75' width='150' height='18' fill='%23f43f5e' opacity='0.25'/%3E%3Ccircle cx='145' cy='125' r='14' fill='%23f43f5e' opacity='0.3'/%3E%3Ccircle cx='125' cy='125' r='14' fill='%23f43f5e' opacity='0.2'/%3E%3C/svg%3E",
    tags: ["Credit Card", "Tick Verify"],
  },
  {
    key: "international",
    route: "/international",
    title: "International Recon",
    desc: "Any bank worldwide — AI auto-detects format, multi-currency matching",
    icon: Globe,
    color: "cyan",
    gradient: "from-cyan-600/20 to-cyan-900/40",
    border: "hover:border-cyan-400/60",
    iconBg: "bg-cyan-500/20",
    iconColor: "text-cyan-400",
    tagBg: "bg-cyan-500/10 text-cyan-300",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2306b6d4' stop-opacity='0.3'/%3E%3Cstop offset='1' stop-color='%2306b6d4' stop-opacity='0.05'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23g)'/%3E%3Ccircle cx='100' cy='100' r='55' fill='none' stroke='%2306b6d4' stroke-width='2' opacity='0.3'/%3E%3Cellipse cx='100' cy='100' rx='25' ry='55' fill='none' stroke='%2306b6d4' stroke-width='1.5' opacity='0.25'/%3E%3Cpath d='M45 100 H155' stroke='%2306b6d4' stroke-width='1' opacity='0.2'/%3E%3Cpath d='M55 75 H145' stroke='%2306b6d4' stroke-width='1' opacity='0.15'/%3E%3Cpath d='M55 125 H145' stroke='%2306b6d4' stroke-width='1' opacity='0.15'/%3E%3C/svg%3E",
    tags: ["AI Auto-Detect", "Multi-Currency"],
  },
  {
    key: "statement-digitizer",
    route: "/statement-digitizer",
    title: "Statement Digitizer",
    desc: "3-step AI pipeline — validate, extract, reconcile any bank statement",
    icon: FileText,
    color: "teal",
    gradient: "from-teal-600/20 to-teal-900/40",
    border: "hover:border-teal-400/60",
    iconBg: "bg-teal-500/20",
    iconColor: "text-teal-400",
    tagBg: "bg-teal-500/10 text-teal-300",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2314b8a6' stop-opacity='0.3'/%3E%3Cstop offset='1' stop-color='%2314b8a6' stop-opacity='0.05'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23g)'/%3E%3Crect x='45' y='30' width='110' height='140' rx='8' fill='%2314b8a6' opacity='0.15'/%3E%3Crect x='60' y='55' width='80' height='6' rx='3' fill='%2314b8a6' opacity='0.3'/%3E%3Crect x='60' y='70' width='60' height='6' rx='3' fill='%2314b8a6' opacity='0.25'/%3E%3Crect x='60' y='85' width='70' height='6' rx='3' fill='%2314b8a6' opacity='0.2'/%3E%3Crect x='60' y='100' width='50' height='6' rx='3' fill='%2314b8a6' opacity='0.15'/%3E%3Cpath d='M55 125 L80 115 L105 130 L130 110 L155 120' stroke='%2314b8a6' stroke-width='2' fill='none' opacity='0.35'/%3E%3C/svg%3E",
    tags: ["Step A-B-C", "Blueprint Learning"],
  },
  {
    key: "ledger-vs-ledger",
    route: "/ledger-vs-ledger",
    title: "Ledger vs Ledger",
    desc: "Company vs vendor ledger — match by amount & date, flag discrepancies",
    icon: BookOpen,
    color: "orange",
    gradient: "from-orange-600/20 to-orange-900/40",
    border: "hover:border-orange-400/60",
    iconBg: "bg-orange-500/20",
    iconColor: "text-orange-400",
    tagBg: "bg-orange-500/10 text-orange-300",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23f97316' stop-opacity='0.3'/%3E%3Cstop offset='1' stop-color='%23f97316' stop-opacity='0.05'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23g)'/%3E%3Crect x='20' y='50' width='70' height='100' rx='6' fill='%23f97316' opacity='0.2'/%3E%3Crect x='110' y='50' width='70' height='100' rx='6' fill='%23f97316' opacity='0.2'/%3E%3Cpath d='M90 80 L110 80 M90 100 L110 100 M90 120 L110 120' stroke='%23f97316' stroke-width='2' opacity='0.4'/%3E%3Crect x='30' y='65' width='50' height='4' rx='2' fill='%23f97316' opacity='0.3'/%3E%3Crect x='120' y='65' width='50' height='4' rx='2' fill='%23f97316' opacity='0.3'/%3E%3Crect x='30' y='80' width='40' height='4' rx='2' fill='%23f97316' opacity='0.2'/%3E%3Crect x='120' y='80' width='40' height='4' rx='2' fill='%23f97316' opacity='0.2'/%3E%3C/svg%3E",
    tags: ["Cross-Verify", "XLS Match"],
  },
  {
    key: "quotations",
    route: "/quotations",
    title: "Quotation Comparison",
    desc: "Multi-vendor AI extraction — side-by-side with cheapest price highlight",
    icon: Scale,
    color: "amber",
    gradient: "from-amber-600/20 to-amber-900/40",
    border: "hover:border-amber-400/60",
    iconBg: "bg-amber-500/20",
    iconColor: "text-amber-400",
    tagBg: "bg-amber-500/10 text-amber-300",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23f59e0b' stop-opacity='0.3'/%3E%3Cstop offset='1' stop-color='%23f59e0b' stop-opacity='0.05'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23g)'/%3E%3Cpath d='M100 45 L60 100 H140 Z' fill='none' stroke='%23f59e0b' stroke-width='2' opacity='0.3'/%3E%3Ccircle cx='100' cy='80' r='5' fill='%23f59e0b' opacity='0.4'/%3E%3Crect x='40' y='115' width='35' height='50' rx='4' fill='%23f59e0b' opacity='0.2'/%3E%3Crect x='82' y='105' width='35' height='60' rx='4' fill='%23f59e0b' opacity='0.25'/%3E%3Crect x='125' y='125' width='35' height='40' rx='4' fill='%23f59e0b' opacity='0.15'/%3E%3C/svg%3E",
    tags: ["Multi-Vendor", "AI Extraction"],
  },
  {
    key: "expense-analyzer",
    route: "/expense-analyzer",
    title: "Expense Analyzer",
    desc: "Wise multi-currency statements — filter, chat, PKR conversion",
    icon: Wallet,
    color: "emerald",
    gradient: "from-emerald-600/20 to-emerald-900/40",
    border: "hover:border-emerald-400/60",
    iconBg: "bg-emerald-500/20",
    iconColor: "text-emerald-400",
    tagBg: "bg-emerald-500/10 text-emerald-300",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2310b981' stop-opacity='0.3'/%3E%3Cstop offset='1' stop-color='%2310b981' stop-opacity='0.05'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23g)'/%3E%3Ccircle cx='100' cy='90' r='40' fill='none' stroke='%2310b981' stroke-width='2' opacity='0.25'/%3E%3Ctext x='100' y='98' text-anchor='middle' font-size='28' font-weight='bold' fill='%2310b981' opacity='0.4'%3E$%3C/text%3E%3Crect x='40' y='145' width='25' height='25' rx='4' fill='%2310b981' opacity='0.2'/%3E%3Crect x='72' y='135' width='25' height='35' rx='4' fill='%2310b981' opacity='0.25'/%3E%3Crect x='104' y='125' width='25' height='45' rx='4' fill='%2310b981' opacity='0.3'/%3E%3Crect x='136' y='140' width='25' height='30' rx='4' fill='%2310b981' opacity='0.15'/%3E%3C/svg%3E",
    tags: ["Wise Card", "Chat & Filter"],
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session>(null);
  const [checked, setChecked] = useState(false);
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("session");
      if (!raw) { router.replace("/login"); return; }
      const s = JSON.parse(raw) as Session;
      if (!s) { router.replace("/login"); return; }
      if (s.type === "testing" && Date.now() > TESTING_DEADLINE) {
        localStorage.removeItem("session");
        router.replace("/login?expired=1");
        return;
      }
      setSession(s);
    } catch {
      router.replace("/login");
      return;
    }
    setChecked(true);
  }, [router]);

  useEffect(() => {
    if (!session || session.type !== "testing") return;
    const tick = () => {
      const left = TESTING_DEADLINE - Date.now();
      if (left <= 0) {
        localStorage.removeItem("session");
        router.replace("/login?expired=1");
        return;
      }
      setRemaining(formatCountdown(left));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session, router]);

  function logout() {
    localStorage.removeItem("session");
    router.replace("/login");
  }

  if (!checked) return null;

  const sessionLabel = session?.type === "user" ? "User" : "Tester";

  return (
    <div className="flex-1 flex flex-col min-h-screen" style={{ background: "#e8ecf1" }}>
      <NeuronBackground />

      {/* Top Bar */}
      <header className="relative z-10 border-b border-gray-300/60 bg-white/70 backdrop-blur-xl px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-600/20">
            <Landmark className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">AI Agent Finance</h1>
            <p className="text-xs text-gray-500">by Sheikh Shumyle</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 rounded-lg px-3 py-1.5">
            <User className="w-3.5 h-3.5" />
            {sessionLabel}
          </div>
          {session?.type === "testing" && remaining && (
            <div className="flex items-center gap-1.5 text-xs font-mono bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg">
              <Timer className="w-3.5 h-3.5" />
              {remaining}
            </div>
          )}
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer bg-gray-50 hover:bg-red-50 rounded-lg px-3 py-1.5">
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8">
        <div className="animate-fade-in">
          <h2 className="text-2xl font-bold text-gray-900">Modules</h2>
          <p className="text-sm text-gray-500 mt-1">Select a module to get started</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 animate-fade-in">
          <div className="bg-white/70 backdrop-blur rounded-xl border border-gray-200/80 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Landmark className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Modules</p>
                <p className="text-xl font-bold text-gray-900">7</p>
              </div>
            </div>
          </div>
          <div className="bg-white/70 backdrop-blur rounded-xl border border-gray-200/80 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Reconciliations</p>
                <p className="text-xl font-bold text-gray-900">0</p>
              </div>
            </div>
          </div>
          <div className="bg-white/70 backdrop-blur rounded-xl border border-gray-200/80 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Landmark className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Status</p>
                <p className="text-xl font-bold text-emerald-600">Ready</p>
              </div>
            </div>
          </div>
        </div>

        {/* Module Grid — 2 per row, square cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 animate-fade-in">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.key}
                onClick={() => router.push(mod.route)}
                className={`group relative overflow-hidden bg-white/60 backdrop-blur-sm hover:bg-white/90 rounded-2xl border border-gray-200/80 ${mod.border} shadow-sm hover:shadow-lg transition-all cursor-pointer text-left aspect-square flex flex-col`}
              >
                {/* Background image */}
                <div
                  className="absolute inset-0 opacity-50 group-hover:opacity-70 transition-opacity"
                  style={{
                    backgroundImage: `url("${mod.image}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-between h-full p-5">
                  <div>
                    <div className={`w-11 h-11 rounded-xl ${mod.iconBg} flex items-center justify-center mb-3 backdrop-blur-sm`}>
                      <Icon className={`w-5 h-5 ${mod.iconColor}`} />
                    </div>
                    <h4 className={`font-bold text-gray-900 group-hover:${mod.iconColor} transition-colors text-[15px] leading-tight`}>
                      {mod.title}
                    </h4>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-3">
                      {mod.desc}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {mod.tags.map((tag) => (
                        <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full ${mod.tagBg} backdrop-blur-sm font-medium`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <ArrowRight className={`w-4 h-4 text-gray-300 group-hover:${mod.iconColor} transition-colors shrink-0`} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-6">
          AI Agent Finance &middot; Sheikh Shumyle &middot; 2026
        </p>
      </div>
    </div>
  );
}
