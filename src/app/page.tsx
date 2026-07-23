"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useCallback, useState } from "react";
import {
  Landmark, DollarSign, Package, Users, Bot,
  ArrowRight, Sparkles, UserCheck, ClipboardList, LogOut, Share2, Ship,
} from "lucide-react";

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

const AGENTS = [
  {
    name: "AI Agent Finance",
    status: "wip",
    statusLabel: "WIP",
    statusColor: "bg-blue-100 text-blue-600",
    desc: "Bank reconciliation, credit card verification, expense analysis, quotation comparison",
    icon: Landmark,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    route: "/dashboard",
  },
  {
    name: "AI Product List / Recipes / Price List",
    status: "wip",
    statusLabel: "WIP",
    statusColor: "bg-amber-100 text-amber-600",
    desc: "Product catalogue, recipe/BOM management, costing, and price list generation",
    icon: DollarSign,
    iconBg: "bg-green-100",
    iconColor: "text-green-500",
    route: "/product-list",
  },
  {
    name: "AI Agent Cost / Budgeting",
    status: "wip",
    statusLabel: "WIP",
    statusColor: "bg-orange-100 text-orange-600",
    desc: "Reverse costing (competitor price -> implied cost), forward costing (our cost -> suggested price)",
    icon: DollarSign,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-500",
    route: "/cost-budgeting",
  },
  {
    name: "AI Supply Chain Agent",
    status: "wip",
    statusLabel: "WIP",
    statusColor: "bg-emerald-100 text-emerald-600",
    desc: "CBM calculator, packing plans, BOM, PO, GRN, shipment tracking",
    icon: Package,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-500",
    route: "/supply-chain",
  },
  {
    name: "Export Department Agent",
    status: "wip",
    statusLabel: "WIP",
    statusColor: "bg-cyan-100 text-cyan-600",
    desc: "Shipment file tracker, document checklist, Drive-based document review",
    icon: Ship,
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-500",
    route: "/export",
  },
  {
    name: "AI Agent CRM",
    status: "tba",
    statusLabel: "TBA",
    statusColor: "bg-gray-100 text-gray-400",
    desc: "Customer relationship management, lead tracking, sales pipeline",
    icon: Users,
    iconBg: "bg-gray-100",
    iconColor: "text-gray-400",
    route: null,
  },
  {
    name: "Social Media Agent",
    status: "wip",
    statusLabel: "WIP",
    statusColor: "bg-pink-100 text-pink-600",
    desc: "AI content generation, designer approval queue, scheduling, and rival analytics",
    icon: Share2,
    iconBg: "bg-pink-100",
    iconColor: "text-pink-500",
    route: "https://kafi-social-media-agent.vercel.app/",
    external: true,
  },
  {
    name: "AI Human Resource Manager",
    status: "tba",
    statusLabel: "TBA",
    statusColor: "bg-gray-100 text-gray-400",
    desc: "Recruitment, employee onboarding, attendance, payroll analytics",
    icon: UserCheck,
    iconBg: "bg-gray-100",
    iconColor: "text-gray-400",
    route: null,
  },
  {
    name: "AI Project Manager",
    status: "tba",
    statusLabel: "TBA",
    statusColor: "bg-gray-100 text-gray-400",
    desc: "Task tracking, milestone planning, team coordination, progress reports",
    icon: ClipboardList,
    iconBg: "bg-gray-100",
    iconColor: "text-gray-400",
    route: null,
  },
  {
    name: "AI Personal Assistant",
    status: "tba",
    statusLabel: "TBA",
    statusColor: "bg-gray-100 text-gray-400",
    desc: "Email management, scheduling, task automation, smart reminders",
    icon: Bot,
    iconBg: "bg-gray-100",
    iconColor: "text-gray-400",
    route: null,
  },
];

export default function HubPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [displayName, setDisplayName] = useState("");

  // Require login before showing the agent hub
  useEffect(() => {
    fetch("/api/auth")
      .then(r => r.json())
      .then(d => {
        if (!d.user || d.user.mustChangePin) { router.replace("/login"); return; }
        setDisplayName(d.user.displayName || "");
        setChecked(true);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    router.replace("/login");
  }

  if (!checked) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen" style={{ background: "#e8ecf1" }}>
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-screen" style={{ background: "#e8ecf1" }}>
      <NeuronBackground />

      {/* Top bar: signed-in user + logout */}
      <div className="fixed top-0 right-0 z-20 flex items-center gap-3 px-5 py-4">
        {displayName && <span className="text-sm text-gray-500">Hi, <span className="font-medium text-gray-700">{displayName}</span></span>}
        <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>

      <div className="relative z-10 w-full max-w-lg space-y-8 animate-fade-in">
        {/* Title */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">AI Agent</h1>
          <p className="text-gray-500 text-sm">
            Enterprise AI Agents by Sheikh Shumyle
          </p>
        </div>

        {/* Agent List */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden shadow-lg shadow-black/5">
          {AGENTS.map((agent, i) => {
            const Icon = agent.icon;
            const active = agent.route !== null;

            return (
              <div key={agent.name}>
                {i > 0 && <div className="border-t border-gray-200/60" />}
                <button
                  onClick={() => {
                    if (!active) return;
                    if (agent.external) window.open(agent.route!, "_blank", "noopener,noreferrer");
                    else router.push(agent.route!);
                  }}
                  disabled={!active}
                  className={`w-full flex items-center gap-4 p-5 text-left transition-all ${
                    active
                      ? "hover:bg-blue-50/80 cursor-pointer group"
                      : "opacity-60 cursor-default"
                  }`}
                >
                  <div className={`w-11 h-11 rounded-xl ${agent.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${agent.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold ${active ? "text-gray-900 group-hover:text-blue-600" : "text-gray-500"} transition-colors`}>
                        {agent.name}
                      </h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${agent.statusColor}`}>
                        {agent.statusLabel}
                      </span>
                    </div>
                    <p className={`text-xs mt-0.5 ${active ? "text-gray-500" : "text-gray-400"}`}>
                      {agent.desc}
                    </p>
                  </div>
                  {active && (
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
                  )}
                </button>
              </div>
            );
          })}

          {/* More coming */}
          <div className="border-t border-gray-200/60" />
          <div className="px-5 py-3 text-center">
            <p className="text-xs text-gray-300 italic">More agents coming soon...</p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">
          Powered by NeuroGrid Labs &middot; 2026
        </p>
      </div>
    </div>
  );
}
