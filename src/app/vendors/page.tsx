"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, X, Save, Building2, Lock, Search, Users, Landmark, Upload, Download, AlertTriangle, CheckCircle2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════ TYPES */
interface Supplier {
  id: string; category: string; companyName: string; contactPerson: string;
  jobTitle: string; phone: string; service: string; address: string; city: string;
  product: string; visitStatus: string; grading: string; notes: string;
}

interface VendorBank {
  id: string; vendorName: string; contactPerson: string; commodity: string;
  phone: string; bank: string; acTitle: string; acNo: string; branchCode: string; notes: string;
}

interface Employee {
  id: string; name: string; designation: string; phone: string;
  bank: string; acTitle: string; acNo: string; branchCode: string; notes: string;
}

const emptyEmployee = (): Employee => ({
  id: genId(), name: "", designation: "", phone: "",
  bank: "", acTitle: "", acNo: "", branchCode: "", notes: "",
});

const genId = () => Math.random().toString(36).slice(2, 10);

const emptySupplier = (): Supplier => ({
  id: genId(), category: "", companyName: "", contactPerson: "", jobTitle: "",
  phone: "", service: "", address: "", city: "", product: "", visitStatus: "", grading: "", notes: "",
});

const emptyBank = (): VendorBank => ({
  id: genId(), vendorName: "", contactPerson: "", commodity: "",
  phone: "", bank: "", acTitle: "", acNo: "", branchCode: "", notes: "",
});

/* ═══════════════════════════════════════════ PIN */
type VRole = "accountant" | "aa1" | "aa2";
interface VSession { role: VRole; name: string; }

const V_PINS: Record<string, VSession> = {
  [process.env.NEXT_PUBLIC_FE_PIN_ACCOUNTANT || ""]: { role: "accountant", name: "A.Hafeez" },
  [process.env.NEXT_PUBLIC_FE_PIN_AA1 || ""]:        { role: "aa1",        name: "Moiz" },
  [process.env.NEXT_PUBLIC_FE_PIN_AA2 || ""]:        { role: "aa2",        name: "Hamza" },
};
const V_SESSION_KEY = "v_session";

function VPinModal({ onSuccess, onClose }: { onSuccess: (s: VSession) => void; onClose: () => void }) {
  const [pin, setPin] = useState(""); const [err, setErr] = useState("");
  function submit() { const s = V_PINS[pin.trim()]; if (!s) { setErr("Incorrect PIN."); return; } onSuccess(s); }
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">Enter PIN</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 ml-auto">Vendors</span>
        </div>
        <input type="password" value={pin} onChange={e => { setPin(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && submit()} placeholder="Enter your PIN" autoFocus
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500/50 mb-3" />
        {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer">Cancel</button>
          <button onClick={submit} className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer">Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ SUPPLIER FORM */
function SupplierForm({ item, existingSuppliers, onSave, onClose }: {
  item: Supplier; existingSuppliers: Supplier[];
  onSave: (s: Supplier) => void; onClose: () => void;
}) {
  const [f, setF] = useState<Supplier>(item);
  const [submitted, setSubmitted] = useState(false);
  const s = <K extends keyof Supplier>(k: K, v: Supplier[K]) => setF(p => ({ ...p, [k]: v }));

  const CATEGORIES = ["Fried Onion","Spices","Paste / Pickle / Chutney","Sauces & Mayo","Vermicelli","Pheni / Bakery","Custard & Jelly","Fresh Vegetables","Food Technologist","Packaging","Logistics / Transport","Other"];
  const VISIT = ["Visited","Not visited yet","Already met","Closed / Inactive"];
  const GRADES = ["★ Under evaluation","★★ Approved","★★★ Good","★★★★ Preferred","★★★★★ Top Supplier"];

  // Live duplicate phone check (exclude self when editing)
  const phoneMatch = f.phone.trim()
    ? existingSuppliers.filter(x => x.id !== item.id && x.phone.trim() === f.phone.trim())
    : [];
  const isStrongDup = phoneMatch.some(x => x.companyName.trim().toLowerCase() === f.companyName.trim().toLowerCase());

  const errors: string[] = [];
  if (!f.companyName.trim() && !f.contactPerson.trim()) errors.push("Company Name or Contact Person is required.");
  if (!f.phone.trim()) errors.push("Phone number is required.");
  if (!f.address.trim()) errors.push("Address is required.");
  if (!f.city.trim()) errors.push("City is required.");
  if (!f.category) errors.push("Category is required.");

  function handleSave() {
    setSubmitted(true);
    if (errors.length > 0) return;
    onSave(f);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border max-w-xl w-full max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{item.companyName || item.contactPerson ? "Edit" : "Add"} Supplier Contact</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto p-5 space-y-3 flex-1">
          {/* Error summary — only shown after first save attempt */}
          {submitted && errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-0.5">
              {errors.map(e => <span key={e} className="text-[10px] text-red-400">⚠ {e}</span>)}
            </div>
          )}
          {/* Phone duplicate warning */}
          {phoneMatch.length > 0 && (
            <div className={`border rounded-lg px-3 py-2 ${isStrongDup ? "bg-orange-500/10 border-orange-500/30" : "bg-amber-500/10 border-amber-500/30"}`}>
              <p className={`text-xs font-semibold ${isStrongDup ? "text-orange-400" : "text-amber-400"}`}>
                {isStrongDup ? "⚠ Likely duplicate" : "⚠ Phone number already exists"}
              </p>
              {phoneMatch.map(x => (
                <p key={x.id} className="text-[10px] text-muted mt-0.5">
                  → {x.companyName || x.contactPerson} {x.companyName && x.contactPerson ? `(${x.contactPerson})` : ""}
                </p>
              ))}
              <p className="text-[10px] text-muted mt-1">You can still save — confirm this is a different contact.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {([
              ["companyName","Company Name *"],
              ["contactPerson","Contact Person"],
              ["jobTitle","Job Title"],
              ["phone","Phone *"],
            ] as [keyof Supplier, string][]).map(([k, l]) => (
              <div key={k}>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
                <input type="text" value={String(f[k])} onChange={e => s(k, e.target.value as never)}
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 ${
                    (k === "phone" && !f.phone.trim()) || (k === "companyName" && !f.companyName.trim() && !f.contactPerson.trim())
                    ? "border-red-500/50" : "border-border"
                  }`} />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Address</label>
              <input type="text" value={f.address} onChange={e => s("address", e.target.value)}
                placeholder="Street / Area / Locality"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">City</label>
              <input type="text" value={f.city} onChange={e => s("city", e.target.value)}
                placeholder="e.g. Karachi"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Product / Services</label>
              <input type="text" value={f.product} onChange={e => s("product", e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Category</label>
              <select value={f.category} onChange={e => s("category", e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 cursor-pointer">
                <option value="">— Select —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Service / Business Level</label>
              <input type="text" value={f.service} onChange={e => s("service", e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Visit Status</label>
              <select value={f.visitStatus} onChange={e => s("visitStatus", e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 cursor-pointer">
                <option value="">— Select —</option>
                {VISIT.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Grading</label>
              <select value={f.grading} onChange={e => s("grading", e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 cursor-pointer">
                <option value="">— Select —</option>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Notes</label>
              <textarea value={f.notes} onChange={e => s("notes", e.target.value)} rows={2}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 resize-none" />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer">Cancel</button>
          <button onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-500 hover:bg-blue-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer">
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ BANK FORM */
function BankForm({ item, existingVendors, onSave, onClose }: {
  item: VendorBank; existingVendors: VendorBank[];
  onSave: (v: VendorBank) => void; onClose: () => void;
}) {
  const [f, setF] = useState<VendorBank>(item);
  const s = <K extends keyof VendorBank>(k: K, v: VendorBank[K]) => setF(p => ({ ...p, [k]: v }));

  const BANKS = ["MEEZAN","HMB","ABL","HBL","UBL","MCB","SCB","FAYSAL","BAH (BAHL)","ASKARI","SILK BANK","BANK ISLAMI","ALLIED","DIB","JS BANK","Other"];

  const acNoMatch = f.acNo.trim() ? existingVendors.filter(x => x.id !== item.id && x.acNo.trim() === f.acNo.trim()) : [];
  const phoneMatch = f.phone.trim() ? existingVendors.filter(x => x.id !== item.id && x.phone.trim() === f.phone.trim()) : [];

  const errors: string[] = [];
  if (!f.vendorName.trim()) errors.push("Vendor Name is required.");
  if (!f.bank) errors.push("Bank is required.");
  if (!f.acNo.trim()) errors.push("Account Number is required.");
  if (acNoMatch.length > 0) errors.push(`Account number already exists: ${acNoMatch[0].vendorName}`);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border max-w-xl w-full max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{item.vendorName ? "Edit" : "Add"} Vendor Bank Detail</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto p-5 space-y-3 flex-1">
          {errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 space-y-0.5">
              {errors.map(e => <p key={e} className="text-xs text-red-400">⚠ {e}</p>)}
            </div>
          )}
          {phoneMatch.length > 0 && acNoMatch.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-400 font-semibold">⚠ Phone number already exists</p>
              {phoneMatch.map(x => <p key={x.id} className="text-[10px] text-muted mt-0.5">→ {x.vendorName}</p>)}
              <p className="text-[10px] text-muted mt-1">You can still save — confirm this is a different account.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {([["vendorName","Vendor Name *"],["contactPerson","Contact Person"],["commodity","Commodity / Nature"],["phone","Phone"]] as [keyof VendorBank, string][]).map(([k, l]) => (
              <div key={k}>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
                <input type="text" value={String(f[k])} onChange={e => s(k, e.target.value as never)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
              </div>
            ))}
            <div>
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Bank</label>
              <select value={f.bank} onChange={e => s("bank", e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 cursor-pointer">
                <option value="">— Select Bank —</option>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {([["acTitle","A/C Title"],["acNo","Account Number"],["branchCode","Branch Code / Name"]] as [keyof VendorBank, string][]).map(([k, l]) => (
              <div key={k}>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
                <input type="text" value={String(f[k])} onChange={e => s(k, e.target.value as never)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Notes</label>
              <textarea value={f.notes} onChange={e => s("notes", e.target.value)} rows={2}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 resize-none" />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer">Cancel</button>
          <button onClick={() => { if (errors.length > 0) return; onSave(f); }} disabled={errors.length > 0}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-500 hover:bg-blue-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ STAR RATING */
const GRADE_OPTIONS = [
  "★ Under evaluation",
  "★★ Approved",
  "★★★ Good",
  "★★★★ Preferred",
  "★★★★★ Top Supplier",
];

function starCount(value: string) {
  const m = value.match(/^★+/);
  return m ? m[0].length : 0;
}

function StarRating({ value, onChange }: { value: string; onChange: (g: string) => void }) {
  const count = starCount(value);
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(count === n ? "" : GRADE_OPTIONS[n - 1])}
          onMouseEnter={() => setHovered(n)}
          className={`text-sm leading-none cursor-pointer transition-colors ${
            n <= (hovered || count) ? "text-amber-400" : "text-muted/25 hover:text-amber-300"
          }`}
        >★</button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════ EMPLOYEE FORM */
function EmpForm({ item, onSave, onClose }: { item: Employee; onSave: (e: Employee) => void; onClose: () => void }) {
  const [f, setF] = useState<Employee>(item);
  const s = <K extends keyof Employee>(k: K, v: Employee[K]) => setF(p => ({ ...p, [k]: v }));
  const BANKS = ["MEEZAN","HMB","ABL","HBL","UBL","MCB","SCB","FAYSAL","BAH (BAHL)","ASKARI","SILK BANK","BANK ISLAMI","ALLIED","DIB","JS BANK","Other"];

  return (
    <div className="overflow-auto p-5 space-y-3 flex-1">
      <div className="grid grid-cols-2 gap-3">
        {([["name","Full Name *"],["designation","Designation"],["phone","Phone"]] as [keyof Employee, string][]).map(([k, l]) => (
          <div key={k} className={k === "name" ? "col-span-2" : ""}>
            <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
            <input type="text" value={String(f[k])} onChange={e => s(k, e.target.value as never)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
          </div>
        ))}
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Bank</label>
          <select value={f.bank} onChange={e => s("bank", e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 cursor-pointer">
            <option value="">— Select Bank —</option>
            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        {([["acTitle","A/C Title"],["acNo","Account Number"],["branchCode","Branch Code / Name"]] as [keyof Employee, string][]).map(([k, l]) => (
          <div key={k}>
            <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{l}</label>
            <input type="text" value={String(f[k])} onChange={e => s(k, e.target.value as never)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
          </div>
        ))}
        <div className="col-span-2">
          <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Notes</label>
          <textarea value={f.notes} onChange={e => s("notes", e.target.value)} rows={2}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 resize-none" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer">Cancel</button>
        <button onClick={() => { if (!f.name.trim()) return; onSave(f); }}
          className="flex items-center gap-1.5 px-5 py-2 bg-blue-500 hover:bg-blue-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer">
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ MAIN PAGE */
export default function VendorsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"contacts" | "banks" | "employees">("banks");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [vendors, setVendors]     = useState<VendorBank[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoaded, setEmpLoaded] = useState(false);
  const empTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);

  const [suppLoaded, setSuppLoaded] = useState(false);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [syncError, setSyncError] = useState("");
  const suppTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [visitFilter, setVisitFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");

  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [editBank, setEditBank]         = useState<VendorBank | null>(null);
  const [showSuppForm, setShowSuppForm] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);

  const [session, setSession] = useState<VSession | null>(null);
  const [pinModal, setPinModal] = useState<{ action: (s: VSession) => void } | null>(null);

  useEffect(() => {
    try { const s = localStorage.getItem(V_SESSION_KEY); if (s) setSession(JSON.parse(s)); } catch { /* */ }
  }, []);

  function login(s: VSession) { localStorage.setItem(V_SESSION_KEY, JSON.stringify(s)); setSession(s); setPinModal(null); }
  function logout() { localStorage.removeItem(V_SESSION_KEY); setSession(null); }
  function requireAuth(action: (s: VSession) => void) { if (session) { action(session); return; } setPinModal({ action }); }

  // Load both datasets
  useEffect(() => {
    fetch("/api/suppliers").then(r => r.json()).then(d => { setSuppliers(d.suppliers ?? []); setSuppLoaded(true); }).catch(() => setSuppLoaded(true));
    fetch("/api/vendors").then(r => r.json()).then(d => { setVendors(d.vendors ?? []); setBankLoaded(true); }).catch(() => setBankLoaded(true));
    fetch("/api/employees").then(r => r.json()).then(d => { setEmployees(d.employees ?? []); setEmpLoaded(true); }).catch(() => setEmpLoaded(true));
  }, []);

  // Debounced syncs
  const syncSuppliers = useCallback(() => {
    if (suppTimer.current) clearTimeout(suppTimer.current);
    suppTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const r = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suppliers }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.saved) { setLastSync(new Date().toLocaleTimeString()); try { localStorage.setItem("vb_sync", new Date().toLocaleTimeString()); } catch {}; setSyncError(""); }
        else setSyncError(d.error || "Sync failed");
      } catch { setSyncError("Network error"); }
      setSyncing(false);
    }, 1500);
  }, [suppliers]);

  const syncVendors = useCallback(() => {
    if (bankTimer.current) clearTimeout(bankTimer.current);
    bankTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const r = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendors }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.saved) { setLastSync(new Date().toLocaleTimeString()); try { localStorage.setItem("vb_sync", new Date().toLocaleTimeString()); } catch {}; setSyncError(""); }
        else setSyncError(d.error || "Sync failed");
      } catch { setSyncError("Network error"); }
      setSyncing(false);
    }, 1500);
  }, [vendors]);

  useEffect(() => { if (suppLoaded) syncSuppliers(); }, [suppliers, suppLoaded, syncSuppliers]);
  useEffect(() => { if (bankLoaded) syncVendors();   }, [vendors,   bankLoaded, syncVendors]);

  const syncEmployees = useCallback(() => {
    if (empTimer.current) clearTimeout(empTimer.current);
    empTimer.current = setTimeout(async () => {
      try {
        await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employees }) });
      } catch { /* ignore */ }
    }, 1500);
  }, [employees]);

  useEffect(() => { if (empLoaded) syncEmployees(); }, [employees, empLoaded, syncEmployees]);

  function saveEmployee(e: Employee) {
    if (editEmployee) setEmployees(prev => prev.map(x => x.id === e.id ? e : x));
    else setEmployees(prev => [...prev, e]);
    setShowEmpForm(false); setEditEmployee(null);
  }

  function deleteEmployee(id: string) {
    if (!confirm("Delete this record?")) return;
    setEmployees(prev => prev.filter(e => e.id !== id));
  }

  // Suppliers tab
  const uniqueCategories = [...new Set(suppliers.map(s => s.category).filter(Boolean))].sort();
  const filteredSuppliers = suppliers.filter(s => {
    const q = search.toLowerCase();
    const matchQ = !q || s.companyName.toLowerCase().includes(q) || s.contactPerson.toLowerCase().includes(q) || s.phone.includes(q) || s.product.toLowerCase().includes(q);
    const matchC = !catFilter || s.category === catFilter;
    const matchV = !visitFilter || s.visitStatus === visitFilter;
    const matchG = !gradeFilter
      ? true
      : gradeFilter === "Unrated"
      ? !s.grading
      : s.grading.startsWith(gradeFilter);
    return matchQ && matchC && matchV && matchG;
  });

  function updateSupplierGrade(id: string, grading: string) {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, grading } : s));
  }

  // Banks tab
  const filteredVendors = vendors.filter(v => {
    const q = search.toLowerCase();
    return !q || v.vendorName.toLowerCase().includes(q) || v.commodity.toLowerCase().includes(q) || v.bank.toLowerCase().includes(q) || v.acNo.includes(q);
  });

  function saveSupplier(s: Supplier) {
    if (editSupplier) setSuppliers(prev => prev.map(x => x.id === s.id ? s : x));
    else setSuppliers(prev => [...prev, s]);
    setShowSuppForm(false); setEditSupplier(null);
  }

  function saveVendor(v: VendorBank) {
    if (editBank) setVendors(prev => prev.map(x => x.id === v.id ? v : x));
    else setVendors(prev => [...prev, v]);
    setShowBankForm(false); setEditBank(null);
  }

  function deleteSupplier(id: string) { if (!confirm("Delete this supplier?")) return; setSuppliers(prev => prev.filter(s => s.id !== id)); }
  function deleteVendor(id: string)   { if (!confirm("Delete this vendor?")) return;   setVendors(prev => prev.filter(v => v.id !== id)); }

  // ── Export templates ──────────────────────────────────────────────────────
  function exportSupplierTemplate() {
    const headers = ["category","companyName","contactPerson","jobTitle","phone","service","address","city","product","visitStatus","grading","notes"];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier Contacts");
    XLSX.writeFile(wb, "supplier-contacts-template.xlsx");
  }

  function exportVendorTemplate() {
    const headers = ["vendorName","contactPerson","commodity","phone","bank","acTitle","acNo","branchCode","notes"];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendor Bank Details");
    XLSX.writeFile(wb, "vendor-bank-template.xlsx");
  }

  // ── Bulk upload state ─────────────────────────────────────────────────────
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadRows, setUploadRows] = useState<{ data: Record<string, string>; status: "clean" | "phone-match" | "strong-dup" | "acno-dup" | "skip"; confirmed: boolean }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parseUploadFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Try reading with headers from first non-empty row
      const allRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", header: 1 }) as string[][];

      // Find first row that has actual column headers (not blank, not purely numeric)
      const headerRowIdx = allRows.findIndex(r => r.some(c => c && isNaN(Number(c)) && String(c).length > 1));
      if (headerRowIdx === -1) return;

      const headers = allRows[headerRowIdx].map(h => String(h ?? "").trim());

      // Flexible column name mapping
      function findCol(candidates: string[]): number {
        for (const c of candidates) {
          const idx = headers.findIndex(h => h.toLowerCase().replace(/[\s/._-]/g, "").includes(c.toLowerCase().replace(/[\s/._-]/g, "")));
          if (idx >= 0) return idx;
        }
        return -1;
      }

      const colMap = {
        companyName:   findCol(["companyname", "company", "companyName"]),
        contactPerson: findCol(["contactperson", "contact person", "contactPerson", "name"]),
        jobTitle:      findCol(["jobtitle", "job title", "designation", "title"]),
        phone:         findCol(["phone", "mobile", "cell", "contact", "mobilephone", "businessphone"]),
        service:       findCol(["service", "business", "manufacturing"]),
        address:       findCol(["address"]),
        product:       findCol(["product", "services"]),
        visitStatus:   findCol(["visit", "visitdone", "visitStatus"]),
        vendorName:    findCol(["vendorname", "vendor"]),
        acNo:          findCol(["acno", "accountno", "accountnumber", "account"]),
        bank:          findCol(["bank"]),
        acTitle:       findCol(["actitle", "accounttitle", "title"]),
        branchCode:    findCol(["branch", "branchcode"]),
      };

      function getCell(row: string[], key: keyof typeof colMap): string {
        const idx = colMap[key];
        return idx >= 0 ? String(row[idx] ?? "").trim() : "";
      }

      // Filter data rows — skip blank rows and category header rows
      const dataRows = allRows.slice(headerRowIdx + 1).filter(row => {
        const hasData = row.some(c => c && String(c).trim());
        const firstCell = String(row[0] ?? "").trim();
        const isSubHeader = firstCell.toUpperCase() === firstCell && firstCell.length > 10 && !firstCell.match(/^\d/);
        return hasData && !isSubHeader;
      });

      if (!dataRows.length) { alert("No data rows found in this file. Make sure the file has content below the header row."); return; }

      const raw = dataRows.map(row => {
        const mapped: Record<string, string> = {};
        for (const [key, idx] of Object.entries(colMap)) {
          if (idx >= 0) mapped[key] = String(row[idx] ?? "").trim();
        }
        return mapped;
      });

      const existingPhones    = new Set(tab === "contacts" ? suppliers.map(s => s.phone.trim()).filter(Boolean) : vendors.map(v => v.phone.trim()).filter(Boolean));
      const existingAccNos    = new Set(vendors.map(v => v.acNo.trim()).filter(Boolean));
      const existingCompanies = new Set(suppliers.map(s => s.companyName.trim().toLowerCase()));

      const rows = raw.map(row => {
        const phone     = String(row.phone || "").trim();
        const companyName = String(row.companyName || row.vendorName || "").trim();
        const acNo      = String(row.acNo || "").trim();

        let status: "clean" | "phone-match" | "strong-dup" | "acno-dup" | "skip" = "clean";

        if (tab === "banks") {
          if (acNo && existingAccNos.has(acNo)) status = "acno-dup";
          else if (phone && existingPhones.has(phone)) status = "phone-match";
        } else {
          if (phone && existingPhones.has(phone)) {
            const nameMatch = companyName && existingCompanies.has(companyName.toLowerCase());
            status = nameMatch ? "strong-dup" : "phone-match";
          }
        }
        return { data: { ...row }, status, confirmed: status === "clean" };
      });
      setUploadRows(rows);
      setShowUploadModal(true);
    };
    reader.readAsBinaryString(file);
  }

  function confirmImport() {
    setUploading(true);
    const toImport = uploadRows.filter(r => r.status !== "acno-dup" && (r.status === "clean" || r.confirmed));
    if (tab === "contacts") {
      const newSuppliers: Supplier[] = toImport.map(r => ({
        id: genId(), category: r.data.category || "", companyName: r.data.companyName || "",
        contactPerson: r.data.contactPerson || "", jobTitle: r.data.jobTitle || "",
        phone: r.data.phone || "", service: r.data.service || "", address: r.data.address || "",
        city: r.data.city || "", product: r.data.product || "", visitStatus: r.data.visitStatus || "",
        grading: r.data.grading || "", notes: r.data.notes || "",
      }));
      setSuppliers(prev => [...prev, ...newSuppliers]);
    } else {
      const newVendors: VendorBank[] = toImport.map(r => ({
        id: genId(), vendorName: r.data.vendorName || "", contactPerson: r.data.contactPerson || "",
        commodity: r.data.commodity || "", phone: r.data.phone || "", bank: r.data.bank || "",
        acTitle: r.data.acTitle || "", acNo: r.data.acNo || "",
        branchCode: r.data.branchCode || "", notes: r.data.notes || "",
      }));
      setVendors(prev => [...prev, ...newVendors]);
    }
    setShowUploadModal(false); setUploadRows([]); setUploading(false);
  }

  const gradeColor = (g: string) => g.startsWith("★★★") ? "text-emerald-400" : g.startsWith("★★") ? "text-blue-400" : g.startsWith("★") ? "text-amber-400" : "text-muted";
  const visitColor = (v: string) => v === "Visited" || v === "Already met" ? "text-emerald-400" : v === "Not visited yet" ? "text-amber-400" : "text-muted";

  if (!suppLoaded || !bankLoaded) return null;

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
        <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center"><Building2 className="w-3.5 h-3.5 text-blue-400" /></div>
        <span className="text-sm font-bold text-foreground">Vendor Directory</span>
        <div className="ml-auto flex items-center gap-2">
          {session && (
            <>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">
                {session.role === "accountant" ? "Accountant" : session.role === "aa1" ? "AA1" : "AA2"}: {session.name}
              </span>
              <button onClick={logout} className="text-[10px] text-muted hover:text-red-400 cursor-pointer">Logout</button>
            </>
          )}
          <button
            onClick={() => requireAuth(() => { tab === "contacts" ? exportSupplierTemplate() : exportVendorTemplate(); })}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-muted hover:text-foreground hover:border-blue-500/40 rounded-lg cursor-pointer transition-colors"
          >
            <Download className="w-3 h-3" /> Template
          </button>
          <label className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 rounded-lg cursor-pointer transition-colors">
            <Upload className="w-3 h-3" /> Bulk Upload
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { requireAuth(() => parseUploadFile(f)); } e.target.value = ""; }} />
          </label>
          {tab !== "employees" && (
            <button
              onClick={() => requireAuth(() => tab === "contacts" ? (setEditSupplier(null), setShowSuppForm(true)) : (setEditBank(null), setShowBankForm(true)))}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-500 hover:bg-blue-500/80 text-white rounded-lg cursor-pointer transition-colors"
            >
              <Plus className="w-3 h-3" /> Add {tab === "contacts" ? "Supplier" : "Vendor"}
            </button>
          )}
          {tab === "employees" && (
            <button
              onClick={() => requireAuth(() => { setEditEmployee(null); setShowEmpForm(true); })}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-500 hover:bg-blue-500/80 text-white rounded-lg cursor-pointer transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Employee
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4 animate-fade-in">

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-surface rounded-xl border border-border p-1 w-fit">
            <button onClick={() => { setTab("banks"); setSearch(""); setCatFilter(""); setVisitFilter(""); setGradeFilter(""); setShowEmpForm(false); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${tab === "banks" ? "bg-blue-500 text-white" : "text-muted hover:text-foreground"}`}>
              <Landmark className="w-3.5 h-3.5" /> Vendor Bank Details
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === "banks" ? "bg-white/20 text-white" : "bg-surface-light/60 text-muted"}`}>{vendors.length}</span>
            </button>
            <button onClick={() => { setTab("contacts"); setSearch(""); setCatFilter(""); setVisitFilter(""); setGradeFilter(""); setShowEmpForm(false); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${tab === "contacts" ? "bg-blue-500 text-white" : "text-muted hover:text-foreground"}`}>
              <Users className="w-3.5 h-3.5" /> Supplier Contacts
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === "contacts" ? "bg-white/20 text-white" : "bg-surface-light/60 text-muted"}`}>{suppliers.length}</span>
            </button>
            <button
              onClick={() => requireAuth(() => { setTab("employees"); setSearch(""); setShowEmpForm(false); })}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${tab === "employees" ? "bg-blue-500 text-white" : "text-muted hover:text-foreground"}`}>
              <UserCheck className="w-3.5 h-3.5" /> Employees & Directors
              <Lock className={`w-2.5 h-2.5 ${tab === "employees" ? "text-white/60" : "text-muted/50"}`} />
            </button>
          </div>

          {/* Search + filter row */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={tab === "contacts" ? "Search company, person, product..." : "Search vendor, commodity, bank, account..."}
                className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
            </div>
            {tab === "contacts" && (
              <>
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                  className="bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500/50 cursor-pointer">
                  <option value="">All Categories</option>
                  {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={visitFilter} onChange={e => setVisitFilter(e.target.value)}
                  className="bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500/50 cursor-pointer">
                  <option value="">All Visit Status</option>
                  <option value="Visited">Visited</option>
                  <option value="Already met">Already Met</option>
                  <option value="Not visited yet">Not Visited Yet</option>
                </select>
                <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
                  className="bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500/50 cursor-pointer">
                  <option value="">All Grades</option>
                  <option value="★★★★★">★★★★★ Top Supplier</option>
                  <option value="★★★★">★★★★ Preferred</option>
                  <option value="★★★">★★★ Good</option>
                  <option value="★★">★★ Approved</option>
                  <option value="★">★ Under Evaluation</option>
                  <option value="Unrated">Unrated</option>
                </select>
              </>
            )}
            <span className="text-xs text-muted shrink-0">
              {tab === "contacts" ? filteredSuppliers.length : filteredVendors.length} records
            </span>
          </div>

          {/* ── VENDOR BANK DETAILS TABLE ── */}
          {tab === "banks" && (
            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-blue-500/10 text-blue-400">
                      <th className="px-3 py-3 text-left font-semibold w-[36px]">#</th>
                      <th className="px-3 py-3 text-left font-semibold">Vendor Name</th>
                      <th className="px-3 py-3 text-left font-semibold">Commodity / Nature</th>
                      <th className="px-3 py-3 text-left font-semibold">Contact</th>
                      <th className="px-3 py-3 text-left font-semibold w-[90px]">Bank</th>
                      <th className="px-3 py-3 text-left font-semibold">A/C Title</th>
                      <th className="px-3 py-3 text-left font-semibold">Account No.</th>
                      <th className="px-3 py-3 text-left font-semibold">Branch</th>
                      <th className="px-3 py-3 text-center w-[70px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVendors.length === 0 && (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-muted">{vendors.length === 0 ? "No vendors yet." : "No results."}</td></tr>
                    )}
                    {filteredVendors.map((v, i) => (
                      <tr key={v.id} className={`${i % 2 === 0 ? "" : "bg-surface-light/20"} hover:bg-blue-500/5 transition-colors`}>
                        <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                        <td className="px-3 py-2.5 font-semibold text-foreground">{v.vendorName}</td>
                        <td className="px-3 py-2.5 text-muted">{v.commodity || "—"}</td>
                        <td className="px-3 py-2.5 text-muted">{v.contactPerson ? `${v.contactPerson}${v.phone ? ` · ${v.phone}` : ""}` : v.phone || "—"}</td>
                        <td className="px-3 py-2.5"><span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">{v.bank || "—"}</span></td>
                        <td className="px-3 py-2.5 text-muted">{v.acTitle || "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-foreground text-[11px]">{v.acNo || "—"}</td>
                        <td className="px-3 py-2.5 text-muted">{v.branchCode || "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => requireAuth(() => { setEditBank(v); setShowBankForm(true); })} className="p-1 text-muted hover:text-blue-400 cursor-pointer"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => requireAuth(() => deleteVendor(v.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SUPPLIER CONTACTS TABLE ── */}
          {tab === "contacts" && (
            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-blue-500/10 text-blue-400">
                      <th className="px-3 py-3 text-left font-semibold w-[36px]">#</th>
                      <th className="px-3 py-3 text-left font-semibold">Company</th>
                      <th className="px-3 py-3 text-left font-semibold">Contact Person</th>
                      <th className="px-3 py-3 text-left font-semibold">Phone</th>
                      <th className="px-3 py-3 text-left font-semibold">Category</th>
                      <th className="px-3 py-3 text-left font-semibold">Product / Service</th>
                      <th className="px-3 py-3 text-left font-semibold w-[90px]">City</th>
                      <th className="px-3 py-3 text-left font-semibold w-[100px]">Visit</th>
                      <th className="px-3 py-3 text-left font-semibold w-[80px]">Grade</th>
                      <th className="px-3 py-3 text-center w-[70px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.length === 0 && (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-muted">{suppliers.length === 0 ? "No suppliers yet." : "No results."}</td></tr>
                    )}
                    {filteredSuppliers.map((s, i) => (
                      <tr key={s.id} className={`${i % 2 === 0 ? "" : "bg-surface-light/20"} hover:bg-blue-500/5 transition-colors`}>
                        <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                        <td className="px-3 py-2.5 font-semibold text-foreground">{s.companyName || "—"}</td>
                        <td className="px-3 py-2.5 text-muted">{s.contactPerson || "—"}{s.jobTitle ? <span className="text-[10px] ml-1 text-muted/60">({s.jobTitle})</span> : null}</td>
                        <td className="px-3 py-2.5 text-muted">{s.phone || "—"}</td>
                        <td className="px-3 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-light/40 text-muted font-semibold">{s.category || "—"}</span></td>
                        <td className="px-3 py-2.5 text-muted max-w-[200px] truncate">{s.product || s.service || "—"}</td>
                        <td className="px-3 py-2.5 text-muted">{s.city || "—"}</td>
                        <td className={`px-3 py-2.5 font-semibold ${visitColor(s.visitStatus)}`}>{s.visitStatus || "—"}</td>
                        <td className="px-3 py-2.5">
                          <StarRating
                            value={s.grading}
                            onChange={g => requireAuth(() => updateSupplierGrade(s.id, g))}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => requireAuth(() => { setEditSupplier(s); setShowSuppForm(true); })} className="p-1 text-muted hover:text-blue-400 cursor-pointer"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => requireAuth(() => deleteSupplier(s.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── EMPLOYEES & DIRECTORS TABLE ── */}
          {tab === "employees" && (
            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-blue-500/10 text-blue-400">
                      <th className="px-3 py-3 text-left font-semibold w-[36px]">#</th>
                      <th className="px-3 py-3 text-left font-semibold">Name</th>
                      <th className="px-3 py-3 text-left font-semibold w-[140px]">Designation</th>
                      <th className="px-3 py-3 text-left font-semibold w-[120px]">Phone</th>
                      <th className="px-3 py-3 text-left font-semibold w-[90px]">Bank</th>
                      <th className="px-3 py-3 text-left font-semibold">A/C Title</th>
                      <th className="px-3 py-3 text-left font-semibold">Account No.</th>
                      <th className="px-3 py-3 text-left font-semibold">Branch</th>
                      <th className="px-3 py-3 text-center w-[70px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.length === 0 && (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-muted">No records yet.</td></tr>
                    )}
                    {employees.map((e, i) => (
                      <tr key={e.id} className={`${i % 2 === 0 ? "" : "bg-surface-light/20"} hover:bg-blue-500/5 transition-colors`}>
                        <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                        <td className="px-3 py-2.5 font-semibold text-foreground">{e.name}</td>
                        <td className="px-3 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold">{e.designation || "—"}</span></td>
                        <td className="px-3 py-2.5 text-muted">{e.phone || "—"}</td>
                        <td className="px-3 py-2.5"><span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">{e.bank || "—"}</span></td>
                        <td className="px-3 py-2.5 text-muted">{e.acTitle || "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-foreground text-[11px]">{e.acNo || "—"}</td>
                        <td className="px-3 py-2.5 text-muted">{e.branchCode || "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => requireAuth(() => { setEditEmployee(e); setShowEmpForm(true); })} className="p-1 text-muted hover:text-blue-400 cursor-pointer"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => requireAuth(() => deleteEmployee(e.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Employee Form Modal */}
      {showEmpForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowEmpForm(false); setEditEmployee(null); }}>
          <div className="bg-surface rounded-2xl border border-border max-w-xl w-full max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{editEmployee ? "Edit" : "Add"} Employee / Director</h3>
              <button onClick={() => { setShowEmpForm(false); setEditEmployee(null); }} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <EmpForm item={editEmployee ?? emptyEmployee()} onSave={saveEmployee} onClose={() => { setShowEmpForm(false); setEditEmployee(null); }} />
          </div>
        </div>
      )}

      {showBankForm   && <BankForm     item={editBank     ?? emptyBank()}     existingVendors={vendors}     onSave={saveVendor}   onClose={() => { setShowBankForm(false);   setEditBank(null);     }} />}
      {showSuppForm   && <SupplierForm item={editSupplier ?? emptySupplier()} existingSuppliers={suppliers} onSave={saveSupplier} onClose={() => { setShowSuppForm(false);   setEditSupplier(null); }} />}
      {pinModal       && <VPinModal onSuccess={s => { login(s); pinModal.action(s); }} onClose={() => setPinModal(null)} />}

      {/* Bulk Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-border max-w-4xl w-full max-h-[88vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Bulk Import Preview</h3>
                <p className="text-[10px] text-muted mt-0.5">
                  {uploadRows.filter(r => r.status === "clean").length} clean ·{" "}
                  <span className="text-amber-400">{uploadRows.filter(r => r.status === "phone-match").length} need confirmation</span> ·{" "}
                  <span className="text-orange-400">{uploadRows.filter(r => r.status === "strong-dup").length} likely duplicate</span> ·{" "}
                  <span className="text-red-400">{uploadRows.filter(r => r.status === "acno-dup").length} blocked (duplicate account no.)</span>
                </p>
              </div>
              <button onClick={() => { setShowUploadModal(false); setUploadRows([]); }} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="overflow-auto flex-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-blue-500/10 text-blue-400 sticky top-0">
                    <th className="px-3 py-2.5 text-left w-[36px]">#</th>
                    <th className="px-3 py-2.5 text-left">Name</th>
                    <th className="px-3 py-2.5 text-left">Phone</th>
                    {tab === "contacts" ? (
                      <><th className="px-3 py-2.5 text-left">Category</th><th className="px-3 py-2.5 text-left">Product/Service</th></>
                    ) : (
                      <><th className="px-3 py-2.5 text-left">Bank</th><th className="px-3 py-2.5 text-left">Account No.</th></>
                    )}
                    <th className="px-3 py-2.5 text-center w-[120px]">Status</th>
                    <th className="px-3 py-2.5 text-center w-[100px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadRows.map((row, i) => {
                    const name = row.data.companyName || row.data.vendorName || row.data.contactPerson || "—";
                    const isBlocked = row.data.status === "acno-dup" || row.status === "acno-dup";
                    return (
                      <tr key={i} className={`border-t border-border/40 ${isBlocked ? "opacity-50" : ""} ${i % 2 === 0 ? "" : "bg-surface-light/20"}`}>
                        <td className="px-3 py-2 text-muted">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-foreground">{name}</td>
                        <td className="px-3 py-2 text-muted">{row.data.phone || "—"}</td>
                        {tab === "contacts" ? (
                          <><td className="px-3 py-2 text-muted">{row.data.category || "—"}</td><td className="px-3 py-2 text-muted truncate max-w-[150px]">{row.data.product || row.data.service || "—"}</td></>
                        ) : (
                          <><td className="px-3 py-2 text-muted">{row.data.bank || "—"}</td><td className="px-3 py-2 font-mono text-muted">{row.data.acNo || "—"}</td></>
                        )}
                        <td className="px-3 py-2 text-center">
                          {row.status === "clean"      && <span className="flex items-center justify-center gap-1 text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Clean</span>}
                          {row.status === "phone-match" && <span className="flex items-center justify-center gap-1 text-amber-400"><AlertTriangle className="w-3 h-3" /> Same phone</span>}
                          {row.status === "strong-dup"  && <span className="flex items-center justify-center gap-1 text-orange-400"><AlertTriangle className="w-3 h-3" /> Likely dup</span>}
                          {row.status === "acno-dup"    && <span className="flex items-center justify-center gap-1 text-red-400"><X className="w-3 h-3" /> Dup acct no.</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.status === "clean" && <span className="text-emerald-400 text-[10px] font-semibold">Will import</span>}
                          {row.status === "acno-dup" && <span className="text-red-400 text-[10px] font-semibold">Blocked</span>}
                          {(row.status === "phone-match" || row.status === "strong-dup") && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setUploadRows(prev => prev.map((r, j) => j === i ? { ...r, confirmed: true } : r))}
                                className={`text-[10px] px-2 py-1 rounded cursor-pointer transition-colors ${row.confirmed ? "bg-emerald-500 text-white" : "border border-border text-muted hover:border-emerald-500/50 hover:text-emerald-400"}`}
                              >✓ Yes</button>
                              <button
                                onClick={() => setUploadRows(prev => prev.map((r, j) => j === i ? { ...r, confirmed: false } : r))}
                                className={`text-[10px] px-2 py-1 rounded cursor-pointer transition-colors ${!row.confirmed ? "bg-red-500 text-white" : "border border-border text-muted hover:border-red-500/50 hover:text-red-400"}`}
                              >✗ Skip</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-4 border-t border-border flex items-center justify-between">
              <p className="text-[10px] text-muted">
                {uploadRows.filter(r => r.status === "clean" || r.confirmed).length} records will be imported ·{" "}
                {uploadRows.filter(r => (r.status === "phone-match" || r.status === "strong-dup") && !r.confirmed).length + uploadRows.filter(r => r.status === "acno-dup").length} will be skipped
              </p>
              <div className="flex gap-2">
                <button onClick={() => { setShowUploadModal(false); setUploadRows([]); }} className="px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer">Cancel</button>
                <button onClick={confirmImport} disabled={uploading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-500 hover:bg-blue-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-50">
                  <Upload className="w-3.5 h-3.5" /> {uploading ? "Importing..." : "Confirm Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
