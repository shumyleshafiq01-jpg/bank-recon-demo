"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, DollarSign, TrendingDown, TrendingUp, ArrowRight } from "lucide-react";

export default function CostBudgetingPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth").then(r => r.json()).then(d => {
      if (!d.user || d.user.mustChangePin) { router.replace("/login"); return; }
      setChecked(true);
    }).catch(() => router.replace("/login"));
  }, [router]);

  if (!checked) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>;

  const MODULES = [
    {
      key: "reverse", route: "/cost-budgeting/reverse-costing", title: "Reverse Costing",
      desc: "Competitor's retail price -> implied cost at assumed retail margins, optionally all the way back to estimated FOB",
      icon: TrendingDown, tags: ["Competitor Price", "Implied Cost"],
    },
    {
      key: "forward", route: "/cost-budgeting/forward-costing", title: "Forward Costing",
      desc: "Kafi's own known cost -> suggested selling price at a target markup",
      icon: TrendingUp, tags: ["Our Cost", "Suggested Price"],
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push("/")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
            <ChevronLeft className="w-4 h-4" /> Hub
          </button>
          <div className="w-px h-6 bg-gray-300" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Cost / Budgeting</h1>
              <p className="text-xs text-gray-500">Reverse Costing &middot; Forward Costing</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MODULES.map(mod => {
            const Icon = mod.icon;
            return (
              <button key={mod.key} onClick={() => router.push(mod.route)}
                className="text-left p-5 rounded-2xl border bg-white/70 border-gray-200/80 hover:border-orange-400/60 hover:bg-white/95 transition-all cursor-pointer group">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 group-hover:text-orange-700 transition-colors mb-1">{mod.title}</h3>
                    <p className="text-xs text-gray-500 mb-2">{mod.desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mod.tags.map(t => <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-700">{t}</span>)}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-orange-600 transition-colors shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">Kafi Commodities (Pvt) Ltd &middot; Cost / Budgeting</p>
      </div>
    </div>
  );
}
