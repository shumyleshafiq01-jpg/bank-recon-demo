"use client";
export default function PrintButton() {
  return (
    <div className="no-print" style={{ textAlign: "center", marginTop: 20 }}>
      <button
        onClick={() => window.print()}
        style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
