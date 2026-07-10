"use client";
import { Ship, ExternalLink } from "lucide-react";

// The CNF Quotation builder and the public Client Quotation List are a single,
// cross-division system (Food & Spices, Rice, and any future division all quote
// through the same builder, differentiated by a dropdown inside it). So these
// two cards belong on EVERY division's landing — render this component wherever
// a division shows its cards.
export default function CnfCards() {
  return (
    <>
      <button onClick={() => { window.location.href = "/cnf"; }}
        className="group text-left p-5 bg-white/65 backdrop-blur-sm rounded-2xl border border-gray-200/80 hover:border-sky-400/60 hover:bg-white/95 hover:shadow-md cursor-pointer transition-all shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100/60 flex items-center justify-center"><Ship className="w-5 h-5 text-sky-500" /></div>
        </div>
        <p className="text-sm font-bold text-foreground">CNF Quotations</p>
        <p className="text-[11px] text-muted mt-1 leading-relaxed">Generate immutable CNF export quotes — master freight card, shareable client price list. Shared across all divisions.</p>
      </button>
      <button onClick={() => window.open("/cnf/all-quotes", "_blank")}
        className="group text-left p-5 bg-white/65 backdrop-blur-sm rounded-2xl border border-gray-200/80 hover:border-teal-400/60 hover:bg-white/95 hover:shadow-md cursor-pointer transition-all shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100/60 flex items-center justify-center"><ExternalLink className="w-5 h-5 text-teal-500" /></div>
        </div>
        <p className="text-sm font-bold text-foreground">Client Quotation List</p>
        <p className="text-[11px] text-muted mt-1 leading-relaxed">Public link — clients &amp; CNF editors browse all active quotes and open their price list. No login required.</p>
      </button>
    </>
  );
}
