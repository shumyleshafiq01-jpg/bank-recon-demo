/**
 * POST /api/multi-bank — Module 4: Multi-Bank Adjustments & Corrections.
 *
 * Copy of Module 3's matching logic but accepts multiple bank statement files
 * in different formats (PDF from various banks, XLS, CSV).
 *
 * FormData:
 *   - bankFiles: one or more bank statement files (PDF/XLS/XLSX/CSV)
 *   - ledgerFile: single journal ledger (XLS/XLSX/CSV)
 */

export const maxDuration = 300;
export const runtime = "nodejs";

import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/usage-tracker";

type BankEntry = {
  date: string;       // DD-MM-YYYY
  particulars: string;
  debit: number;
  credit: number;
  source: string;     // filename / detected bank
};

type LedgerEntry = {
  date: string;
  ref: string;
  doc: string;
  desc: string;
  debit: number;
  credit: number;
};

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

function parseDate(ddmmyyyy: string): number | null {
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime();
}

/* ═══════════════════════════════════════════
   BANK FORMAT DETECTION & PARSING
   ═══════════════════════════════════════════ */

type BankFormat = "ABL" | "HBL" | "SONERI" | "FAYSAL" | "HMB" | "BAH" | "JS" | "SCB" | "GENERIC";

function detectBank(text: string): BankFormat {
  const up = text.toUpperCase();
  if (up.includes("ALLIED BANK") || up.includes("ABL ")) return "ABL";
  if (up.includes("HABIB BANK LIMITED") || /\bHBL\b/.test(up)) return "HBL";
  if (up.includes("SONERI BANK")) return "SONERI";
  if (up.includes("FAYSAL BANK")) return "FAYSAL";
  if (up.includes("HABIB METROPOLITAN") || up.includes("HMB ")) return "HMB";
  if (up.includes("BANK AL HABIB") || up.includes("BAHL ")) return "BAH";
  if (up.includes("JS BANK")) return "JS";
  if (up.includes("STANDARD CHARTERED") || up.includes("SCB ")) return "SCB";
  return "GENERIC";
}

/* ── Normalize various date formats to DD-MM-YYYY ── */
function normDate(raw: string): string {
  // DD MMM YY  (e.g. "01 OCT 25")
  let m = raw.match(/^(\d{1,2})\s+(\w{3})\s+(\d{2})$/);
  if (m) {
    const mon = MONTHS[m[2].toUpperCase()];
    if (mon) return `${pad(parseInt(m[1]))}-${pad(mon)}-${2000 + parseInt(m[3])}`;
  }
  // DD-MMM-YYYY (e.g. "01-Oct-2025")
  m = raw.match(/^(\d{1,2})-(\w{3})-(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toUpperCase()];
    if (mon) return `${pad(parseInt(m[1]))}-${pad(mon)}-${parseInt(m[3])}`;
  }
  // DD-MMM-YY (e.g. "01-Oct-25")
  m = raw.match(/^(\d{1,2})-(\w{3})-(\d{2})$/);
  if (m) {
    const mon = MONTHS[m[2].toUpperCase()];
    if (mon) return `${pad(parseInt(m[1]))}-${pad(mon)}-${2000 + parseInt(m[3])}`;
  }
  // DD/MM/YYYY
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${pad(parseInt(m[1]))}-${pad(parseInt(m[2]))}-${parseInt(m[3])}`;
  // DD-MM-YYYY (already correct)
  m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return raw;
  // DD/MM/YY
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) return `${pad(parseInt(m[1]))}-${pad(parseInt(m[2]))}-${2000 + parseInt(m[3])}`;
  // YYYY-MM-DD (ISO)
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // DD MMM YYYY (e.g. "01 Oct 2025")
  m = raw.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toUpperCase()];
    if (mon) return `${pad(parseInt(m[1]))}-${pad(mon)}-${parseInt(m[3])}`;
  }
  return raw;
}

/* ── ABL parser (proven, exact copy from Module 3) ── */
function parseABL(text: string, source: string): BankEntry[] {
  const rows: BankEntry[] = [];
  const skip = [
    /^-{4,}/, /^KAFI/, /^DATE\s/, /^Page \d/, /^\*REVE/,
    /^This is a computer/, /^KARACHI/, /^SINDH/, /^032/,
    /BALANCE AT PERIOD/, /Account Number/, /Account Status/,
    /Pakistan Rupees/, /Statement Period/, /Branch Name/,
    /KAFI HOUSE/, /TOTAL DEBIT/, /CLOSING BAL/, /TOTAL WITH/,
    /^\s*$/,
  ];
  for (const line of text.split("\n")) {
    if (skip.some((p) => p.test(line.trim()))) continue;
    const m = line.match(
      /^(\d{2}\s+\w{3}\s+\d{2})\s+(.+?)\s{2,}(\d{2}\s+\w{3}\s+\d{2})(.*)/
    );
    if (!m) continue;
    const date = normDate(m[1].trim());
    const particulars = m[2].trim();
    const raw = m[4];
    const nums: { val: number; pos: number }[] = [];
    const rx = /([\d,]+\.\d{2})/g;
    let nm;
    while ((nm = rx.exec(raw)) !== null)
      nums.push({ val: parseFloat(nm[1].replace(/,/g, "")), pos: nm.index });
    let debit = 0, credit = 0;
    if (nums.length === 3) { debit = nums[0].val; credit = nums[1].val; }
    else if (nums.length === 2) { nums[0].pos > 18 ? (credit = nums[0].val) : (debit = nums[0].val); }
    if (debit === 0 && credit === 0) continue;
    rows.push({ date, particulars, debit, credit, source });
  }
  return rows;
}

/* ── HMB (Habib Metropolitan Bank) text parser ──
   Format: text PDF where each transaction line has the date fused to the description
   and the amount(s) at the end. Two amounts at end = txAmount + runningBalance (fused).
   Uses properly-formatted comma notation to avoid matching reference numbers fused into amounts. */
function isHMBCredit(desc: string): boolean {
  const u = desc.toUpperCase();
  return /\bINFLOW\b|\bCREDIT\b|PROFIT FROM|CASH DEPOSIT|CASH DEPOSITED|STANDING INSTRUCTION.*FROM|\bEFT REC\b|PO REALIZED|INWARD.*REVERS/.test(u);
}

function parseHMB(text: string, source: string): { entries: BankEntry[]; warning?: string } {
  // Properly-formatted: 1–3 leading digits, optional (,3-digit) groups, then .2-digit cents
  const TWO_AMT = /(\d{1,3}(?:,\d{3})*\.\d{2})(\d{1,3}(?:,\d{3})*\.\d{2})$/;
  const ONE_AMT = /(\d{1,3}(?:,\d{3})*\.\d{2})$/;
  const DATE_RX = /^(\d{2}-\w{3}-\d{4})/;

  const SKIP_SET = new Set([
    "DateParticularsDebitCreditBalance", "CURRENCYFROMTOPRINTED ON",
    "BRANCH NAME", "A/C TYPEA/C NUMBER", "IBAN",
  ]);
  const SKIP_RX = [
    /^\d{2}-\w{3}-\d{4}\d{2}-\w{3}-\d{4}PKR/,
    /^PK[A-Z0-9]{28,}/,
    /^Page \d+ of/,
    /^Please report/,
    /^KAFI COMMODITIES|^F-50,|^TEEN TALWAR|^City Court|^HMB Multiplier/,
  ];

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Opening balance — HMB prints value BEFORE the label: "694,568.77Opening Balance :"
  let runningBal = 0;
  for (const l of lines) {
    let m = l.match(/(\d{1,3}(?:,\d{3})*\.\d{2})\s*Opening Balance/i);
    if (!m) m = l.match(/Opening Balance\s*:\s*(\d{1,3}(?:,\d{3})*\.\d{2})/i);
    if (m) { runningBal = parseFloat(m[1].replace(/,/g, "")); break; }
  }

  // Closing balance for post-parse verification
  let statedClosing: number | undefined;
  for (const l of lines) {
    let m = l.match(/(\d{1,3}(?:,\d{3})*\.\d{2})\s*Closing Balance/i);
    if (!m) m = l.match(/Closing Balance\s*:\s*(\d{1,3}(?:,\d{3})*\.\d{2})/i);
    if (m) { statedClosing = parseFloat(m[1].replace(/,/g, "")); }
  }

  // Assemble transaction blocks — each block starts with a date line
  const blocks: { date: string; rest: string }[] = [];
  let curDate = "";
  let curParts: string[] = [];

  for (const line of lines) {
    if (SKIP_SET.has(line) || SKIP_RX.some((r) => r.test(line))) continue;
    if (/Opening Balance|Closing Balance/i.test(line) && !DATE_RX.test(line)) continue;
    const dm = line.match(DATE_RX);
    if (dm) {
      if (curDate) blocks.push({ date: curDate, rest: curParts.join(" ").trim() });
      curDate = dm[1];
      curParts = [line.substring(dm[0].length)];
    } else if (curDate) {
      curParts.push(line);
    }
  }
  if (curDate) blocks.push({ date: curDate, rest: curParts.join(" ").trim() });

  const entries: BankEntry[] = [];

  for (const { date, rest: rawRest } of blocks) {
    const normD = normDate(date);
    if (!parseDate(normD)) continue;
    // Strip page-footer noise fused onto end-of-page entries (e.g. "54,900.00 8Page 2 of")
    const rest = rawRest.replace(/\s*\d*Page \d+ of.*$/i, "").trim();
    if (/Opening Balance|Closing Balance/i.test(rest)) continue;

    const two = rest.match(TWO_AMT);
    const one = rest.match(ONE_AMT);

    let txAmt: number;
    let newBal: number | undefined;
    let descEnd: number;

    // Decontaminate: pdf-parse fuses the last digit(s) of years/reference numbers
    // into the amount (e.g. "30 Jun 202211,219.66" → regex sees "211,219.66").
    // For TWO_AMT: try stripping up to all preceding digits, pick candidate that fits balance.
    // For ONE_AMT: strip at most 1 leading digit; reject if result starts with 0 (e.g. 09.77).
    const AMT_FMT = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;
    // Builds candidates by stripping leading digits that were fused from preceding text.
    // Only considers digits that existed in `rest` BEFORE `startIdx` (not within the match).
    function decontaminateCandidates(str: string, startIdx: number): Array<{ str: string; idx: number }> {
      const results: Array<{ str: string; idx: number }> = [{ str, idx: startIdx }];
      let s = str, i = startIdx;
      // Walk backwards to count how many preceding chars are digits (fused region)
      let prefixLen = 0;
      while (startIdx - 1 - prefixLen >= 0 && /\d/.test(rest[startIdx - 1 - prefixLen])) prefixLen++;
      // Try stripping 1..prefixLen digits from the front of str
      for (let n = 0; n < prefixLen; n++) {
        const t = s.replace(/^\d/, "");
        if (!AMT_FMT.test(t) || /^0[^.]/.test(t)) break;
        s = t; i++;
        results.push({ str: t, idx: i });
      }
      return results;
    }
    // ONE_AMT version: strip at most 1 digit, with leading-zero guard.
    function decontaminateSingle(str: string, idx: number): { str: string; idx: number } {
      if (idx > 0 && /\d/.test(rest[idx - 1])) {
        const t = str.replace(/^\d/, "");
        if (AMT_FMT.test(t) && !/^0[^.]/.test(t)) return { str: t, idx: idx + 1 };
      }
      return { str, idx };
    }

    if (two && two.index !== undefined) {
      newBal = parseFloat(two[2].replace(/,/g, ""));
      const diff = newBal - runningBal;
      const candidates = decontaminateCandidates(two[1], two.index);
      // Pick the most-stripped candidate that reconciles with the running balance
      let chosen = candidates[0];
      for (let ci = candidates.length - 1; ci >= 0; ci--) {
        const amt = parseFloat(candidates[ci].str.replace(/,/g, ""));
        if (Math.abs(diff - amt) < 1 || Math.abs(diff + amt) < 1) {
          chosen = candidates[ci];
          break;
        }
      }
      txAmt = parseFloat(chosen.str.replace(/,/g, ""));
      descEnd = chosen.idx;
    } else if (one && one.index !== undefined) {
      const g1 = decontaminateSingle(one[1], one.index);
      txAmt = parseFloat(g1.str.replace(/,/g, ""));
      newBal = undefined;
      descEnd = g1.idx;
    } else {
      continue;
    }

    if (txAmt === 0) continue;

    const desc = rest.substring(0, descEnd).trim().replace(/\s+/g, " ").substring(0, 60);
    let debit = 0, credit = 0;

    if (newBal !== undefined) {
      const diff = newBal - runningBal;
      if (Math.abs(diff - txAmt) < 1) credit = txAmt;
      else if (Math.abs(diff + txAmt) < 1) debit = txAmt;
      else if (isHMBCredit(desc)) credit = txAmt;
      else debit = txAmt;
      runningBal = newBal; // always anchor to stated balance
    } else {
      if (isHMBCredit(desc)) { credit = txAmt; runningBal += txAmt; }
      else { debit = txAmt; runningBal -= txAmt; }
    }

    entries.push({ date: normD, particulars: desc, debit, credit, source });
  }

  let warning: string | undefined;
  if (statedClosing !== undefined && Math.abs(runningBal - statedClosing) > 1) {
    warning = `${source}: balance check — computed closing ${fmt(runningBal)} vs stated ${fmt(statedClosing)} (off by ${fmt(Math.abs(runningBal - statedClosing))}). Some amounts near reference numbers may have been misread. Spot-check entries.`;
  }

  return { entries, warning };
}

/* ── Soneri Bank text parser ──
   Format: highly fragmented — date on own line, value date + ref fused, description
   split across lines, amounts fused with cheque numbers or balance.
   Key insight: amounts always have .XX (2 decimals); cheque numbers/refs/IBANs don't.
   Uses balance tracking to determine debit vs credit. */
function parseSoneri(text: string, source: string): { entries: BankEntry[]; warning?: string } {
  const DATE_RX = /^(\d{2}\s+\w{3}\s+\d{4})$/;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Opening balance
  let runningBal = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/Balance at Per/i.test(lines[i]) && /iod Start/i.test(lines[i + 1] ?? "")) {
      for (let j = i + 2; j < Math.min(i + 5, lines.length); j++) {
        const m = lines[j].match(/^(\d{1,3}(?:,\d{3})*\.\d{2})$/);
        if (m) { runningBal = parseFloat(m[1].replace(/,/g, "")); break; }
      }
      break;
    }
  }

  // Closing balance (for verification)
  let statedClosing: number | undefined;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/Balance at Per/i.test(lines[i]) && /iod End/i.test(lines[i + 1] ?? "")) {
      // Last amount in the end block is closing balance
      for (let j = i + 2; j < Math.min(i + 10, lines.length); j++) {
        const m = lines[j].match(/^(\d{1,3}(?:,\d{3})*\.\d{2})$/);
        if (m) statedClosing = parseFloat(m[1].replace(/,/g, ""));
      }
      break;
    }
  }

  // Skip patterns
  const SKIP_RX = [
    /^Page \d+ of/, /^\d{1,2} \w{4,} \d{4}$/, /^\d{2}:\d{2}:\d{2}$/,
    /^Account :/, /^Currency:/, /^Account Type/, /^Customer Address/,
    /^From Date/, /^To Date/, /^Statement Date/, /^Bank Name/,
    /^Branch Name/, /^Booking Date/, /^Balance at Per/, /^iod/,
  ];

  // Split into transaction blocks starting at each booking date
  const blocks: { date: string; lines: string[] }[] = [];
  let curDate = "";
  let curLines: string[] = [];
  let inEndSummary = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // Only skip the "Balance at Period End" block (last summary), not "Period Start"
    if (/Balance at Per/i.test(line) && /iod End/i.test(lines[li + 1] ?? "")) { inEndSummary = true; continue; }
    if (inEndSummary) continue;
    if (SKIP_RX.some((r) => r.test(line))) continue;

    const dm = line.match(DATE_RX);
    if (dm) {
      if (curDate && curLines.length > 0) blocks.push({ date: curDate, lines: curLines });
      curDate = dm[1];
      curLines = [];
    } else if (curDate) {
      curLines.push(line);
    }
  }
  if (curDate && curLines.length > 0) blocks.push({ date: curDate, lines: curLines });

  const entries: BankEntry[] = [];

  for (const block of blocks) {
    const normD = normDate(block.date);
    if (!parseDate(normD)) continue;

    // Extract all properly-formatted amounts from the block
    const amounts: number[] = [];
    const descParts: string[] = [];

    for (const line of block.lines) {
      // Skip value-date + ref lines (start with a date pattern fused with text)
      if (/^\d{2}\s+\w{3}\s+\d{4}\w/.test(line)) continue;
      // Skip page/header artifacts
      if (/^Page \d|^\d{2}:\d{2}:\d{2}$/.test(line)) continue;

      // Extract amounts by scanning from the right end of the line.
      // Amounts are properly-formatted: 1-3 digits, comma-separated thousands, .XX cents.
      // Cheque numbers are plain digit sequences without commas/decimals.
      // Strategy: find all `\d{1,3}(,\d{3})*\.\d{2}` matches, then validate each
      // by checking that it isn't a false extension of a longer digit sequence.
      const lineAmounts: number[] = [];
      let stripped = line;
      const allMatches: { val: number; start: number; end: number }[] = [];
      const rawRx = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;
      let m;
      while ((m = rawRx.exec(line)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        const val = parseFloat(m[0].replace(/,/g, ""));
        // Reject if preceded by a digit (cheque fused with amount).
        // Instead, re-parse: find the shortest valid amount at the END of the match.
        if (start > 0 && /\d/.test(line[start - 1])) {
          // The true amount is embedded. Find it by trying shorter prefixes.
          // e.g. "704897791,000,000.00" → reject "791,000,000.00", try "1,000,000.00"
          const sub = m[0];
          const innerRx = /,(\d{1,3}(?:,\d{3})*\.\d{2})$/;
          const inner = sub.match(innerRx);
          if (inner) {
            allMatches.push({ val: parseFloat(inner[1].replace(/,/g, "")), start: start + sub.indexOf(inner[1]), end });
          }
        } else {
          allMatches.push({ val, start, end });
        }
      }

      for (const am of allMatches) lineAmounts.push(am.val);

      if (lineAmounts.length > 0) {
        amounts.push(...lineAmounts);
        // Strip matched amounts from line for description
        let s = line;
        for (const am of [...allMatches].reverse()) {
          s = s.substring(0, am.start) + s.substring(am.end);
        }
        stripped = s.replace(/[,.\d]+$/, "").trim();
      }

      if (stripped && stripped.length > 2 && !/^\d+$/.test(stripped) && !/^PK[A-Z0-9]{20,}/.test(stripped) && !/^[A-Z]{4,}\d{6,}/.test(stripped) && !/^SONE\d/.test(stripped) && !/^By cheque/i.test(stripped)) {
        descParts.push(stripped);
      }
    }

    if (amounts.length < 1) continue;

    // Last amount = closing balance, second-to-last = transaction amount
    let txAmt: number;
    let newBal: number;

    if (amounts.length >= 2) {
      newBal = amounts[amounts.length - 1];
      txAmt = amounts[amounts.length - 2];
    } else {
      // Single amount — likely the balance itself without a separate tx amount, skip
      continue;
    }

    if (txAmt === 0) continue;

    const desc = descParts.slice(0, 3).join(" ").replace(/\s+/g, " ").substring(0, 60);
    let debit = 0, credit = 0;

    const diff = newBal - runningBal;
    if (Math.abs(diff - txAmt) < 1) credit = txAmt;
    else if (Math.abs(diff + txAmt) < 1) debit = txAmt;
    else {
      // Balance doesn't match either way — use sign of difference
      if (diff > 0) credit = txAmt;
      else debit = txAmt;
    }

    runningBal = newBal;
    entries.push({ date: normD, particulars: desc, debit, credit, source });
  }

  let warning: string | undefined;
  if (statedClosing !== undefined && Math.abs(runningBal - statedClosing) > 1) {
    warning = `${source}: balance check — computed closing ${fmt(runningBal)} vs stated ${fmt(statedClosing)} (off by ${fmt(Math.abs(runningBal - statedClosing))}). Spot-check entries.`;
  }

  return { entries, warning };
}

/* ── Faysal Bank text parser ──
   Format: column-major PDF — all N posting dates, then N effective dates,
   then N withdrawals, then N deposits, then N running balances, then N narrations.
   Transaction count is stated explicitly as "No. of Transactions (N)". */
function parseFaysal(text: string, source: string): { entries: BankEntry[]; warning?: string } {
  const DATE_RX = /^\d{2}-\d{2}-\d{4}$/;
  const AMT_RX  = /^[\d,]+\.\d{2}$/;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Extract stated transaction count
  const countM = text.match(/No\.\s*of\s*Transactions\s*\((\d+)\)/i);
  if (!countM) return { entries: [], warning: `${source}: Faysal parser — transaction count not found.` };
  const N = parseInt(countM[1]);

  // Opening balance appears BEFORE the label: "1,497.29 Opening Balance as of..."
  let openingBal = 0;
  const obM = text.match(/([\d,]+\.\d{2})\s*Opening Balance/i);
  if (obM) openingBal = parseFloat(obM[1].replace(/,/g, ""));

  // Closing balance — last number on the "Ending Balance" line
  let statedClosing: number | undefined;
  const cbLineM = text.match(/Ending Balance[^\n]*/i);
  if (cbLineM) {
    const nums = cbLineM[0].match(/[\d,]+\.\d{2}/g);
    if (nums) statedClosing = parseFloat(nums[nums.length - 1].replace(/,/g, ""));
  }

  // Posting dates — first N date lines
  const postingDates: string[] = [];
  for (const line of lines) {
    if (postingDates.length >= N) break;
    if (DATE_RX.test(line)) postingDates.push(line);
  }

  // Amounts — first 3N standalone amount lines (N withdrawals, N deposits, N balances)
  const allAmounts: number[] = [];
  let lastAmtIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (AMT_RX.test(lines[i])) {
      allAmounts.push(parseFloat(lines[i].replace(/,/g, "")));
      lastAmtIdx = i;
      if (allAmounts.length >= N * 3) break;
    }
  }

  if (postingDates.length < N || allAmounts.length < N * 3) {
    return {
      entries: [],
      warning: `${source}: Faysal parser — incomplete records (got ${postingDates.length}/${N} dates, ${allAmounts.length}/${N * 3} amounts). Falling back to AI.`,
    };
  }

  const withdrawals = allAmounts.slice(0, N);
  const deposits    = allAmounts.slice(N, N * 2);
  // balances at slice(N*2) used only for verification below

  // Narrations — appear after all amount lines in the text
  // Skip column headers, account info, address fragments, footer text
  const NARR_SKIP = new Set([
    "EFFECTIVE", "DATE", "POSTING", "DATEWITHDRAWAL", "DEPOSITBALANCE",
    "WITHDRAWAL", "BALANCE", "NARRATION", "REFERENCE NO",
    "SAVING", "PKR", "CURRENCY",
  ]);
  const NARR_SKIP_RX = [
    /^Page \d/i,
    /^No\.\s*of/i,
    /^Ending Balance/i,
    /^Opening Balance/i,
    /^Available Balance/i,
    /^Account\s*(No|Number|Statement|Status|Type)\b/i,
    /^Title\s+of/i,
    /^Statement\s*(Period|Date)\b/i,
    /^Address\s*:/i,
    /^Deposit Type\s*:/i,
    /^PKR/i,
    /^F \d/i,
    /^\*/,
    /^"/,
    /^www\./i,
    /^\d/,
    DATE_RX,
    AMT_RX,
    /KAFI COMMODITIES/i,
    /HUB RIVER/i,
    /INDUSTRIAL AREA/i,
    /MANDATE/i,
    /MOHTASIB/i,
    /FAYSALBANK/i,
    /BANKINGMOHTASIB/i,
    /CNIC/i,
  ];

  const narrations: string[] = [];
  for (let i = lastAmtIdx + 1; i < lines.length && narrations.length < N; i++) {
    const line = lines[i];
    const up = line.toUpperCase();
    if (NARR_SKIP.has(up)) continue;
    if (NARR_SKIP_RX.some((r) => r.test(line))) continue;
    if (/[A-Z]/i.test(line) && line.length >= 3) narrations.push(up);
  }

  const entries: BankEntry[] = [];
  for (let i = 0; i < N; i++) {
    const debit  = withdrawals[i] || 0;
    const credit = deposits[i]    || 0;
    if (debit === 0 && credit === 0) continue;
    entries.push({
      date: postingDates[i] || "",
      particulars: narrations[i] || "",
      debit,
      credit,
      source,
    });
  }

  let warning: string | undefined;
  if (statedClosing !== undefined) {
    const totalDR = entries.reduce((s, e) => s + e.debit, 0);
    const totalCR = entries.reduce((s, e) => s + e.credit, 0);
    const computed = openingBal + totalCR - totalDR;
    const diff = Math.abs(computed - statedClosing);
    if (diff > 1) {
      warning = `${source}: balance check — opening ${fmt(openingBal)} + credits ${fmt(totalCR)} − debits ${fmt(totalDR)} = ${fmt(computed)}, stated closing ${fmt(statedClosing)} (off by ${fmt(diff)}). Spot-check entries.`;
    }
  }

  return { entries, warning };
}

/* ── Soneri Bank Excel parser ──
   Handles the 3-sheet Excel export from Soneri Bank's PDF statement.
   Table 1 (first sheet) has a header row; Tables 2 & 3 have no header.
   Column layouts differ: T1 = cols 0,4,7,8,9 | T2/T3 = cols 0,3,5,6,7 */
function parseSoneriExcel(buffer: Buffer, source: string): { entries: BankEntry[]; warning?: string } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const entries: BankEntry[] = [];

  function xlSerialToDate(serial: number): string {
    const d = XLSX.SSF.parse_date_code(serial);
    return `${pad(d.d)}-${pad(d.m)}-${d.y}`;
  }

  function toNum(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseFloat(v.replace(/,/g, "")) || 0;
    return 0;
  }

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (data.length < 2) continue;

    // Detect if this sheet has a header row (look for "Booking Date" in first 12 rows)
    let headerRow = -1;
    for (let h = 0; h < Math.min(12, data.length); h++) {
      const row = data[h];
      if (!row) continue;
      const found = row.some((c: unknown) => typeof c === "string" && /booking.?date/i.test(c));
      if (found) { headerRow = h; break; }
    }

    const dataStart = headerRow >= 0 ? headerRow + 1 : 0;
    const hasHeader = headerRow >= 0;
    const dateCol = 0;
    // Detect layout by scanning for the first real transaction row (numeric XLSX date serial in col 0).
    // Both Table 2 and Table 3 start with junk metadata rows (len 4-5) before actual data,
    // so data[dataStart] is unreliable — scan up to 20 rows to find the true column count.
    // T1 (has header):  desc=4, debit=7, credit=8
    // T2 (8 cols):      desc=3, debit=5, credit=6
    // T3 (9 cols, extra null at col 1 shifts everything): desc=4, debit=6, credit=7
    let ncols = 8;
    for (let r = dataStart; r < Math.min(dataStart + 20, data.length); r++) {
      const row = data[r];
      if (row && row.length >= 8 && typeof row[0] === "number" && row[0] > 40000 && row[0] < 60000) {
        ncols = row.length;
        break;
      }
    }
    const descCol = hasHeader ? 4 : (ncols >= 9 ? 4 : 3);
    const debitCol = hasHeader ? 7 : (ncols >= 9 ? 6 : 5);
    const creditCol = hasHeader ? 8 : (ncols >= 9 ? 7 : 6);

    for (let i = dataStart; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const rawDate = row[dateCol];
      if (!rawDate) continue;

      let dateStr = "";
      if (typeof rawDate === "number") {
        try { dateStr = xlSerialToDate(rawDate); } catch { continue; }
      } else {
        dateStr = normDate(String(rawDate).trim());
      }
      if (!parseDate(dateStr)) continue;

      const debit = toNum(row[debitCol]);
      const credit = toNum(row[creditCol]);
      if (debit === 0 && credit === 0) continue;

      const particulars = String(row[descCol] ?? "").replace(/\s+/g, " ").trim().substring(0, 60);
      entries.push({ date: dateStr, particulars, debit, credit, source });
    }
  }

  return { entries };
}

/* ── Generic PDF parser — works with most Pakistani bank formats ──
   Strategy:
   1. Find lines with a date and at least one amount
   2. If header row is found, use column positions to map debit/credit
   3. Otherwise, use position heuristics (earlier = debit, later = credit, last = balance) */
function parseGenericPDF(text: string, source: string): BankEntry[] {
  const rows: BankEntry[] = [];

  // Date pattern: matches common date formats at start of line
  const dateRx = /^(\d{1,2}[\s\/-]\w{3}[\s\/-]\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/;

  // Detect if there's a header with DEBIT/CREDIT/WITHDRAWAL/DEPOSIT markers
  const lines = text.split("\n");
  let debitPos = -1, creditPos = -1;

  for (const line of lines.slice(0, 30)) {
    const up = line.toUpperCase();
    if (up.includes("DEBIT") || up.includes("WITHDRAWAL") || up.includes("DR")) {
      const idx = Math.max(up.indexOf("DEBIT"), up.indexOf("WITHDRAWAL"), up.indexOf("DR"));
      if (idx > 10) debitPos = idx;
    }
    if (up.includes("CREDIT") || up.includes("DEPOSIT") || up.includes("CR")) {
      const idx = Math.max(up.indexOf("CREDIT"), up.indexOf("DEPOSIT"), up.indexOf("CR"));
      if (idx > 10) creditPos = idx;
    }
    if (debitPos > 0 && creditPos > 0) break;
  }

  for (const line of lines) {
    const dm = line.match(dateRx);
    if (!dm) continue;
    const date = normDate(dm[1].trim());
    if (!parseDate(date)) continue; // invalid date

    // Skip headers/totals
    const up = line.toUpperCase();
    if (up.includes("TOTAL") || up.includes("OPENING") || up.includes("CLOSING") || up.includes("BALANCE B/F")) continue;

    // Extract description (text between date and first amount)
    const afterDate = line.substring(dm[0].length);
    const amounts: { val: number; pos: number; absPos: number }[] = [];
    const amtRx = /([\d,]+\.\d{2})/g;
    let am;
    while ((am = amtRx.exec(afterDate)) !== null) {
      const val = parseFloat(am[1].replace(/,/g, ""));
      if (val > 0) {
        amounts.push({ val, pos: am.index, absPos: dm[0].length + am.index });
      }
    }

    if (amounts.length === 0) continue;

    // Extract particulars (text before first amount)
    const particulars = afterDate.substring(0, amounts[0].pos).trim().replace(/\s{2,}/g, " ");

    let debit = 0, credit = 0;

    if (amounts.length >= 3) {
      // 3+ amounts: debit, credit, balance (standard layout)
      debit = amounts[0].val;
      credit = amounts[1].val;
    } else if (amounts.length === 2) {
      // 2 amounts: amount + balance — need to figure out which is debit vs credit
      if (debitPos > 0 && creditPos > 0) {
        // Use header positions
        const dDist = Math.abs(amounts[0].absPos - debitPos);
        const cDist = Math.abs(amounts[0].absPos - creditPos);
        if (dDist < cDist) debit = amounts[0].val;
        else credit = amounts[0].val;
      } else {
        // Heuristic: if the amount position is in the first half of the remaining text, it's debit
        const midpoint = afterDate.length / 2;
        if (amounts[0].pos < midpoint) debit = amounts[0].val;
        else credit = amounts[0].val;
      }
    } else if (amounts.length === 1) {
      // Single amount — need DR/CR indicator
      if (/\bDR\b|\bDEBIT\b/i.test(line)) debit = amounts[0].val;
      else if (/\bCR\b|\bCREDIT\b/i.test(line)) credit = amounts[0].val;
      else debit = amounts[0].val; // default to debit
    }

    if (debit === 0 && credit === 0) continue;
    rows.push({ date, particulars, debit, credit, source });
  }

  return rows;
}

/* ── Bank statement from Excel/CSV ── */
function parseBankExcel(buffer: Buffer, source: string): BankEntry[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows: BankEntry[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (data.length < 2) continue;

    // Auto-detect columns from header
    let dateCol = -1, debitCol = -1, creditCol = -1, descCol = -1, amtCol = -1, drcrCol = -1;
    for (let h = 0; h < Math.min(5, data.length); h++) {
      const header = data[h];
      if (!header) continue;
      const lower = header.map((c: unknown) => String(c ?? "").toLowerCase());
      dateCol = lower.findIndex((c: string) => c.includes("date") || c.includes("value date"));
      debitCol = lower.findIndex((c: string) => c === "debit" || c.includes("debit") || c.includes("withdrawal"));
      creditCol = lower.findIndex((c: string) => c === "credit" || c.includes("credit") || c.includes("deposit"));
      descCol = lower.findIndex((c: string) => c.includes("desc") || c.includes("particular") || c.includes("narration") || c.includes("detail"));
      amtCol = lower.findIndex((c: string) => c === "amount" || c.includes("amount"));
      drcrCol = lower.findIndex((c: string) => c === "dr/cr" || c.includes("dr/cr") || c.includes("type"));

      if (dateCol >= 0 && (debitCol >= 0 || creditCol >= 0 || amtCol >= 0)) {
        // Parse from row after header
        for (let i = h + 1; i < data.length; i++) {
          const row = data[i];
          if (!row) continue;
          const rawDate = row[dateCol];
          if (!rawDate) continue;

          let dateStr = "";
          if (typeof rawDate === "number") {
            const d = XLSX.SSF.parse_date_code(rawDate);
            dateStr = `${pad(d.d)}-${pad(d.m)}-${d.y}`;
          } else {
            dateStr = normDate(String(rawDate).trim());
          }
          if (!parseDate(dateStr)) continue;

          let debit = 0, credit = 0;
          if (debitCol >= 0 && creditCol >= 0) {
            debit = typeof row[debitCol] === "number" ? row[debitCol] : parseFloat(String(row[debitCol] ?? "").replace(/,/g, "")) || 0;
            credit = typeof row[creditCol] === "number" ? row[creditCol] : parseFloat(String(row[creditCol] ?? "").replace(/,/g, "")) || 0;
          } else if (amtCol >= 0) {
            const amt = typeof row[amtCol] === "number" ? row[amtCol] : parseFloat(String(row[amtCol] ?? "").replace(/,/g, "")) || 0;
            if (amt === 0) continue;
            if (drcrCol >= 0) {
              const typ = String(row[drcrCol] ?? "").toUpperCase();
              if (typ.includes("D")) debit = Math.abs(amt);
              else credit = Math.abs(amt);
            } else {
              // Negative = debit, positive = credit
              if (amt < 0) debit = Math.abs(amt);
              else credit = amt;
            }
          }

          if (debit === 0 && credit === 0) continue;
          const particulars = descCol >= 0 ? String(row[descCol] ?? "").trim() : "";
          rows.push({ date: dateStr, particulars, debit, credit, source });
        }
        break; // found header, done with this sheet
      }
    }
  }
  return rows;
}

function parseBankCSV(text: string, source: string): BankEntry[] {
  const rows: BankEntry[] = [];
  const lines = text.split("\n");
  let headerIdx = -1;
  let dateCol = -1, debitCol = -1, creditCol = -1, descCol = -1, amtCol = -1, drcrCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (headerIdx === -1) {
      const lower = cells.map((c) => c.toLowerCase());
      dateCol = lower.findIndex((c) => c.includes("date"));
      debitCol = lower.findIndex((c) => c === "debit" || c.includes("debit") || c.includes("withdrawal"));
      creditCol = lower.findIndex((c) => c === "credit" || c.includes("credit") || c.includes("deposit"));
      descCol = lower.findIndex((c) => c.includes("desc") || c.includes("particular") || c.includes("narration"));
      amtCol = lower.findIndex((c) => c === "amount");
      drcrCol = lower.findIndex((c) => c.includes("dr/cr") || c.includes("type"));
      if (dateCol >= 0 && (debitCol >= 0 || creditCol >= 0 || amtCol >= 0)) {
        headerIdx = i;
        continue;
      }
      continue;
    }

    const cells2 = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const dateStr = dateCol >= 0 ? normDate(cells2[dateCol] || "") : "";
    if (!parseDate(dateStr)) continue;

    let debit = 0, credit = 0;
    if (debitCol >= 0 && creditCol >= 0) {
      debit = parseFloat(String(cells2[debitCol]).replace(/,/g, "")) || 0;
      credit = parseFloat(String(cells2[creditCol]).replace(/,/g, "")) || 0;
    } else if (amtCol >= 0) {
      const amt = parseFloat(String(cells2[amtCol]).replace(/,/g, "")) || 0;
      if (drcrCol >= 0) {
        String(cells2[drcrCol]).toUpperCase().includes("D") ? (debit = Math.abs(amt)) : (credit = Math.abs(amt));
      } else {
        amt < 0 ? (debit = Math.abs(amt)) : (credit = amt);
      }
    }

    if (debit === 0 && credit === 0) continue;
    const particulars = descCol >= 0 ? cells2[descCol] || "" : "";
    rows.push({ date: dateStr, particulars, debit, credit, source });
  }
  return rows;
}

/* ── AI extraction via Claude vision — handles scanned PDFs and layouts
      that position-based text parsing misreads ── */

const EXTRACT_PROMPT = `This is a bank statement from a Pakistani bank (may be scanned or digital). Extract EVERY transaction row from ALL pages.

Respond with ONLY a JSON object, no other text:
{
  "bank": "<bank name as printed on the statement>",
  "opening_balance": <opening/period-start balance as number, or null if not shown>,
  "closing_balance": <closing/period-end balance as number, or null if not shown>,
  "transactions": [
    { "date": "DD-MM-YYYY", "particulars": "<description, max 50 chars>", "debit": 0, "credit": 0 }
  ]
}

Rules:
- date must be DD-MM-YYYY format regardless of how it appears on the statement. Use the booking/transaction date (the first date column).
- debit = withdrawal/money out, credit = deposit/money in. Exactly one of them is non-zero per row. Check the column headers carefully to know which column is which.
- amounts as plain numbers with no commas (e.g. 30000.00). Never confuse the running balance column with the debit/credit amount.
- Percentages or rates inside descriptions (e.g. "15.00 %") are NOT amounts.
- One transaction = one JSON row, even if its description wraps across multiple lines on the statement.
- Skip opening/closing balance rows, totals, and headers — only actual transactions.
- Do not skip any transaction and do not invent any. Accuracy is critical — this is for bank reconciliation, and the result will be checked: opening_balance + total credits - total debits must equal closing_balance.`;

type AIResult = { entries: BankEntry[]; bank: string; error?: string; warning?: string };

async function aiExtractCall(
  client: Anthropic,
  firstBlock: Anthropic.ContentBlockParam,
  fileName: string,
): Promise<AIResult> {
  const response = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 32000,
    messages: [{ role: "user", content: [firstBlock, { type: "text", text: EXTRACT_PROMPT }] }],
  }).finalMessage();

  if (response.usage) {
    logUsage("Multi-Bank", "claude-sonnet-4-6", response.usage.input_tokens, response.usage.output_tokens);
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { entries: [], bank: fileName, error: `AI extraction could not read transactions from ${fileName}.` };
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    bank?: string;
    opening_balance?: number | null;
    closing_balance?: number | null;
    transactions?: { date: string; particulars: string; debit: number; credit: number }[];
  };
  const bankName = parsed.bank || "Scanned";
  const bankLabel = `AI ${bankName}: ${fileName}`;
  const entries: BankEntry[] = [];

  for (const t of parsed.transactions ?? []) {
    const date = normDate(String(t.date ?? "").trim());
    if (!parseDate(date)) continue;
    const debit = Number(t.debit) || 0;
    const credit = Number(t.credit) || 0;
    if (debit === 0 && credit === 0) continue;
    entries.push({ date, particulars: String(t.particulars ?? "").substring(0, 60), debit, credit, source: bankLabel });
  }

  const hasBalances = typeof parsed.opening_balance === "number" && typeof parsed.closing_balance === "number";

  if (entries.length === 0) {
    // A statement with no activity is valid when opening equals closing.
    if (hasBalances && Math.abs((parsed.opening_balance as number) - (parsed.closing_balance as number)) <= 1) {
      return { entries, bank: bankLabel, warning: `${fileName} (${bankName}): no transactions in this statement period (opening balance equals closing balance).` };
    }
    return { entries, bank: bankLabel, error: `AI extraction ran on ${fileName} but found no transaction rows.` };
  }

  // Self-check: opening + credits - debits should equal closing balance.
  let warning: string | undefined;
  if (hasBalances) {
    const totalDR = entries.reduce((s, e) => s + e.debit, 0);
    const totalCR = entries.reduce((s, e) => s + e.credit, 0);
    const computed = (parsed.opening_balance as number) + totalCR - totalDR;
    const diff = Math.abs(computed - (parsed.closing_balance as number));
    if (diff > 1) {
      warning = `${fileName} (${bankName}): extracted figures don't tie to the statement balances — opening ${fmt(parsed.opening_balance as number)} + credits ${fmt(totalCR)} − debits ${fmt(totalDR)} = ${fmt(computed)}, but statement closing is ${fmt(parsed.closing_balance as number)} (off by ${fmt(diff)}). Spot-check this file's entries.`;
    }
  } else {
    warning = `${fileName} (${bankName}): statement balances not found, so extraction could not be arithmetically verified. Spot-check this file's entries.`;
  }

  return { entries, bank: bankLabel, warning };
}

async function ocrBankPDF(buffer: Buffer, fileName: string, fallbackText?: string): Promise<AIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { entries: [], bank: fileName, error: `${fileName} needs AI extraction but no API key is configured. Upload the Excel/CSV export instead.` };
  }
  if (buffer.length > 30 * 1024 * 1024) {
    return { entries: [], bank: fileName, error: `${fileName} is too large for AI extraction (max 30 MB). Split the statement or upload Excel/CSV.` };
  }

  const client = new Anthropic({ apiKey });

  try {
    return await aiExtractCall(client, {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
    }, fileName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Some banks emit non-standard PDFs the API rejects. If we have a text
    // layer, retry by sending the extracted text instead of the document.
    if (fallbackText && fallbackText.replace(/\s/g, "").length >= 100) {
      try {
        return await aiExtractCall(client, {
          type: "text",
          text: `Raw text extracted from the bank statement PDF (columns may be fused together and rows may wrap across lines):\n\n${fallbackText}`,
        }, fileName);
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        return { entries: [], bank: fileName, error: `AI extraction failed for ${fileName}: ${msg2}` };
      }
    }
    return { entries: [], bank: fileName, error: `AI extraction failed for ${fileName}: ${msg}` };
  }
}

/* ═══════════════════════════════════════════
   PARSE A SINGLE BANK FILE (any format)
   ═══════════════════════════════════════════ */
async function extractPdfText(buffer: Buffer, password?: string): Promise<{ text: string; needsPassword: boolean }> {
  try {
    const PDFJS = require("pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
    PDFJS.disableWorker = true;
    const source = password ? { data: new Uint8Array(buffer), password } : new Uint8Array(buffer);
    const doc = await PDFJS.getDocument(source);
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let lastY: number | undefined;
      for (const item of content.items) {
        const y = (item as { transform: number[] }).transform[5];
        if (lastY !== undefined && lastY !== y) text += "\n";
        text += (item as { str: string }).str;
        lastY = y;
      }
      text += "\n\n";
    }
    doc.destroy();
    return { text, needsPassword: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password/i.test(msg) || /PasswordException/i.test(msg) || /encrypted/i.test(msg)) {
      return { text: "", needsPassword: true };
    }
    return { text: "", needsPassword: false };
  }
}

async function parseBankFile(
  file: File,
  bankOverride?: string,
  password?: string,
): Promise<{ entries: BankEntry[]; bank: string; error?: string; warning?: string; passwordRequired?: boolean }> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "csv") {
    const entries = parseBankCSV(buffer.toString("utf-8"), file.name);
    return { entries, bank: `CSV: ${file.name}` };
  }

  if (ext === "xls" || ext === "xlsx") {
    if (bankOverride === "SONERI") {
      const bankLabel = `Soneri: ${file.name}`;
      const { entries, warning } = parseSoneriExcel(buffer, bankLabel);
      return { entries, bank: bankLabel, warning };
    }
    const entries = parseBankExcel(buffer, file.name);
    return { entries, bank: `Excel: ${file.name}` };
  }

  if (ext === "pdf") {
    const { text, needsPassword } = await extractPdfText(buffer, password);
    if (needsPassword) {
      return { entries: [], bank: file.name, error: `${file.name} is password-protected. Please enter the password.`, passwordRequired: true };
    }
    if (!text) {
      return ocrBankPDF(buffer, file.name);
    }

    const textLen = text.replace(/\s/g, "").length;

    if (textLen < 100) {
      // No text layer — scanned PDF. OCR via AI.
      return ocrBankPDF(buffer, file.name);
    }

    // User selection overrides auto-detection. Empty string = auto-detect.
    const bankType: BankFormat =
      (bankOverride as BankFormat | undefined) ||
      detectBank(text);

    if (bankType === "ABL") {
      const bankLabel = `ABL: ${file.name}`;
      const entries = parseABL(text, bankLabel);
      if (entries.length > 0) return { entries, bank: bankLabel };
      // ABL parse found nothing — fall through to AI
    }

    if (bankType === "HMB") {
      const bankLabel = `HMB: ${file.name}`;
      const { entries, warning } = parseHMB(text, bankLabel);
      if (entries.length > 0) return { entries, bank: bankLabel, warning };
      const aiResult = await ocrBankPDF(buffer, file.name, text);
      return {
        ...aiResult,
        warning: [aiResult.warning, "HMB text parser found no entries; used AI extraction instead."]
          .filter(Boolean).join(" "),
      };
    }

    if (bankType === "SONERI") {
      const bankLabel = `Soneri: ${file.name}`;
      const { entries, warning } = parseSoneri(text, bankLabel);
      if (entries.length > 0) return { entries, bank: bankLabel, warning };
      const aiResult = await ocrBankPDF(buffer, file.name, text);
      return {
        ...aiResult,
        warning: [aiResult.warning, "Soneri text parser found no entries; used AI extraction instead."]
          .filter(Boolean).join(" "),
      };
    }

    if (bankType === "FAYSAL") {
      const bankLabel = `Faysal: ${file.name}`;
      const { entries, warning } = parseFaysal(text, bankLabel);
      if (entries.length > 0) return { entries, bank: bankLabel, warning };
      const aiResult = await ocrBankPDF(buffer, file.name, text);
      return {
        ...aiResult,
        warning: [aiResult.warning, "Faysal text parser found no entries; used AI extraction instead."]
          .filter(Boolean).join(" "),
      };
    }

    // All other banks: AI extraction.
    const aiResult = await ocrBankPDF(buffer, file.name, text);
    if (aiResult.entries.length > 0 || process.env.ANTHROPIC_API_KEY) return aiResult;

    // No API key — best-effort text fallback.
    const bankLabel = bankType === "GENERIC" ? `PDF: ${file.name}` : `${bankType}: ${file.name}`;
    const entries = parseGenericPDF(text, bankLabel);
    if (entries.length === 0) {
      return { entries, bank: bankLabel, error: `Could not extract transactions from ${file.name} (bank: ${bankType}).` };
    }
    return { entries, bank: bankLabel, warning: `${file.name}: parsed with best-effort text parsing (no API key) — verify entries.` };
  }

  return { entries: [], bank: file.name, error: `Unsupported file format: .${ext}. Use PDF, XLS, XLSX, or CSV.` };
}

/* ═══════════════════════════════════════════
   LEDGER PARSING (same as Module 3)
   ═══════════════════════════════════════════ */
function parseLedgerExcel(buffer: Buffer): LedgerEntry[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows: LedgerEntry[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Detect column layout from header row
    let colDate = 0, colRef = 1, colDesc = 2, colDoc = 3, colDebit = 5, colCredit = 6;
    for (const row of data) {
      if (!row) continue;
      const cells: string[] = Array.from({ length: row.length }, (_, i) => {
        const c = row[i];
        return c == null ? "" : String(c).trim().toUpperCase();
      });
      const dateIdx = cells.findIndex(c => c === "DATE");
      const debitIdx = cells.findIndex(c => c === "DEBIT");
      const creditIdx = cells.findIndex(c => c === "CREDIT");
      if (dateIdx >= 0 && debitIdx >= 0 && creditIdx >= 0) {
        colDate = dateIdx;
        colDebit = debitIdx;
        colCredit = creditIdx;
        const partIdx = cells.findIndex(c => c === "PARTICULARS" || c === "DESCRIPTION" || c === "NARRATION");
        if (partIdx >= 0) colDesc = partIdx;
        const vchIdx = cells.findIndex(c => c.includes("VCH") && c.includes("NO"));
        if (vchIdx >= 0) colDoc = vchIdx;
        const refIdx = cells.findIndex(c => c === "REF" || c === "REFERENCE" || c === "VCH TYPE" || (c.includes("VCH") && c.includes("TYPE")));
        if (refIdx >= 0) colRef = refIdx;
        break;
      }
    }

    for (const row of data) {
      if (!row || row.length < Math.max(colDebit, colCredit) + 1) continue;
      const cell0 = String(row[colDate] ?? "").trim().toUpperCase();
      if (cell0 === "DATE" || cell0 === "") continue;
      const rawDate = row[colDate];
      const ref = String(row[colRef] ?? "");
      let desc = String(row[colDesc] ?? "");
      // Tally-style: "To"/"By" in Particulars col, actual name in next col
      if ((desc === "To" || desc === "By") && row[colDesc + 1]) {
        desc = desc + " " + String(row[colDesc + 1]);
      }
      const doc = String(row[colDoc] ?? "");
      const debit = typeof row[colDebit] === "number" ? row[colDebit] : 0;
      const credit = typeof row[colCredit] === "number" ? row[colCredit] : 0;
      if (debit === 0 && credit === 0) continue;
      let dateStr = "";
      if (typeof rawDate === "number") {
        const d = XLSX.SSF.parse_date_code(rawDate);
        dateStr = `${pad(d.d)}-${pad(d.m)}-${d.y}`;
      } else if (typeof rawDate === "string") {
        dateStr = rawDate;
      }
      rows.push({ date: dateStr, ref, doc, desc, debit, credit });
    }
  }
  return rows;
}

function parseLedgerCSV(text: string): LedgerEntry[] {
  const rows: LedgerEntry[] = [];
  const lines = text.split("\n");
  let headerIdx = -1;
  let debitCol = -1, creditCol = -1, dateCol = -1, refCol = -1, descCol = -1, docCol = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (headerIdx === -1) {
      const lower = cells.map((c) => c.toLowerCase());
      dateCol = lower.findIndex((c) => c.includes("date"));
      refCol = lower.findIndex((c) => c.includes("ref"));
      descCol = lower.findIndex((c) => c.includes("desc") || c.includes("account"));
      docCol = lower.findIndex((c) => c.includes("doc") || c.includes("document"));
      debitCol = lower.findIndex((c) => c === "debit" || c.includes("debit"));
      creditCol = lower.findIndex((c) => c === "credit" || c.includes("credit"));
      if (debitCol >= 0 || creditCol >= 0) { headerIdx = i; continue; }
      continue;
    }
    const debit = debitCol >= 0 ? parseFloat(String(cells[debitCol]).replace(/,/g, "")) || 0 : 0;
    const credit = creditCol >= 0 ? parseFloat(String(cells[creditCol]).replace(/,/g, "")) || 0 : 0;
    if (debit === 0 && credit === 0) continue;
    rows.push({
      date: dateCol >= 0 ? cells[dateCol] || "" : "",
      ref: refCol >= 0 ? cells[refCol] || "" : "",
      doc: docCol >= 0 ? cells[docCol] || "" : "",
      desc: descCol >= 0 ? cells[descCol] || "" : "",
      debit, credit,
    });
  }
  return rows;
}

/* ── Tally PDF Ledger Parser ── */
function parseTallyLedger(text: string): LedgerEntry[] {
  const DATE_PREFIX_RX = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})(.*)/;
  const AMT_RX = /^[\d,]+\.\d{2}$/;
  // Two amounts smashed together on totals/carry-forward rows
  const DOUBLE_AMT_RX = /([\d,]+\.\d{2})([\d,]+\.\d{2})/;
  // Sub-detail lines: description + embedded amount ending in Dr/Cr
  const SUB_DETAIL_RX = /[\d,]+\.\d{2}\s*(Dr|Cr)\s*$/;
  const VCH_NO_RX = /^\d+\/[\w-]+$/;
  const VCH_TYPES = new Set([
    "Bank Payment", "Bank Receipt Voucher", "Bank Receipt",
    "Journal", "Receipt", "Contra",
  ]);
  const SKIP_STARTS = [
    "Carried Over", "Brought Forward", "Closing Balance", "Opening Balance", "Page ",
  ];
  const HEADER_RX = /^(\d{1,2}-[A-Za-z]{3}-\d+\s+to\s+\d{1,2}-[A-Za-z]{3}-\d+|Date\s*Particulars|Credit\s*Debit|Vch No|Vch Type)/i;

  const entries: LedgerEntry[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentDate = "";
  let entryDir: "By" | "To" | null = null;
  let descParts: string[] = [];
  let amount = 0;
  let vchno = "";
  let entryDate = "";

  function commitEntry() {
    if (entryDir && amount > 0 && descParts.length > 0) {
      entries.push({
        date: entryDate,
        ref: vchno,
        doc: vchno,
        desc: descParts.join(" ").trim().substring(0, 80),
        // By = Credit side of bank account = money OUT (accounting debit of expense/asset)
        // To = Debit side of bank account = money IN (accounting credit of income/liability)
        debit: entryDir === "To" ? amount : 0,
        credit: entryDir === "By" ? amount : 0,
      });
    }
    entryDir = null;
    descParts = [];
    amount = 0;
    vchno = "";
  }

  for (const line of lines) {
    // Sub-detail breakdown lines (e.g. "WHT Services (Payable)1,826.00 Dr") — skip
    if (SUB_DETAIL_RX.test(line)) continue;
    // Totals / carry-forward rows with two concatenated amounts — skip
    if (DOUBLE_AMT_RX.test(line.replace(/\s/g, ""))) continue;
    // Known skip prefixes — cancel any pending partial entry (e.g. "By\nClosing Balance\nAmt")
    if (SKIP_STARTS.some((s) => line.startsWith(s))) {
      entryDir = null; descParts = []; amount = 0; vchno = "";
      continue;
    }
    if (HEADER_RX.test(line)) continue;

    // Date line (possibly with direction suffix: "1-Jul-21To")
    const dpM = line.match(DATE_PREFIX_RX);
    if (dpM) {
      const d = parseInt(dpM[1]);
      const mon = MONTHS[dpM[2].toUpperCase()];
      const y = dpM[3].length === 2 ? 2000 + parseInt(dpM[3]) : parseInt(dpM[3]);
      if (mon) {
        currentDate = `${pad(d)}-${pad(mon)}-${y}`;
        const rest = dpM[4].trim();
        if (rest === "By" || rest === "To") {
          commitEntry();
          entryDir = rest as "By" | "To";
          entryDate = currentDate;
        }
      }
      continue;
    }

    // Direction markers
    if (line === "By" || line === "To") {
      commitEntry();
      entryDir = line as "By" | "To";
      entryDate = currentDate;
      continue;
    }

    // Voucher type — closes the current entry
    if (VCH_TYPES.has(line)) {
      commitEntry();
      continue;
    }

    // Voucher number (e.g. "8/BP-2106", "41/AB-2106")
    if (VCH_NO_RX.test(line)) {
      if (entryDir && !vchno) vchno = line;
      continue;
    }

    // Amount on its own line
    if (AMT_RX.test(line)) {
      if (entryDir && amount === 0) amount = parseFloat(line.replace(/,/g, ""));
      continue;
    }

    // Everything else is description text
    if (entryDir && line !== "0.00") descParts.push(line);
  }

  commitEntry(); // commit any trailing entry
  return entries;
}

/* ═══════════════════════════════════════════
   MATCHING LOGIC (same as Module 3)
   ═══════════════════════════════════════════ */
function amountOnlyCount(bankEntries: BankEntry[], ledgerEntries: LedgerEntry[]) {
  const key = (n: number) => n.toFixed(2);
  function buildFreq(amounts: number[]) {
    const map = new Map<string, number>();
    for (const a of amounts) { const k = key(a); map.set(k, (map.get(k) || 0) + 1); }
    return map;
  }
  const bankFreq = buildFreq(bankEntries.map((r) => r.debit || r.credit));
  const ledgerFreq = buildFreq(ledgerEntries.map((r) => r.debit || r.credit));
  let bankMissing = 0;
  const lfc = new Map(ledgerFreq);
  for (const r of bankEntries) { const k = key(r.debit || r.credit); const c = lfc.get(k) || 0; if (c > 0) lfc.set(k, c - 1); else bankMissing++; }
  let ledgerMissing = 0;
  const bfc = new Map(bankFreq);
  for (const r of ledgerEntries) { const k = key(r.debit || r.credit); const c = bfc.get(k) || 0; if (c > 0) bfc.set(k, c - 1); else ledgerMissing++; }
  return { bankMissing, ledgerMissing };
}

function pairByDate(
  bankItems: { idx: number; date: string }[],
  ledgerItems: { idx: number; date: string }[],
): { bankIdx: number; ledgerIdx: number }[] {
  const pairs: { bankIdx: number; ledgerIdx: number }[] = [];
  const limit = Math.min(bankItems.length, ledgerItems.length);
  const usedBank = new Set<number>();
  const usedLedger = new Set<number>();

  function pass(maxDays: number | null) {
    for (const bk of bankItems) {
      if (usedBank.has(bk.idx) || pairs.length >= limit) continue;
      const bkMs = parseDate(bk.date);
      let bestIdx = -1, bestDelta = Infinity;
      for (const lg of ledgerItems) {
        if (usedLedger.has(lg.idx)) continue;
        if (maxDays === null) {
          const lgMs = parseDate(lg.date);
          if (bkMs && lgMs) { const d = Math.abs(bkMs - lgMs); if (d < bestDelta) { bestDelta = d; bestIdx = lg.idx; } }
          else { bestIdx = lg.idx; break; }
        } else if (maxDays === 0) {
          if (bk.date === lg.date) { bestIdx = lg.idx; break; }
        } else {
          const lgMs = parseDate(lg.date);
          if (bkMs && lgMs) { const d = Math.abs(bkMs - lgMs); if (d <= maxDays * 86400000 && d < bestDelta) { bestDelta = d; bestIdx = lg.idx; } }
        }
      }
      if (bestIdx >= 0) { pairs.push({ bankIdx: bk.idx, ledgerIdx: bestIdx }); usedBank.add(bk.idx); usedLedger.add(bestIdx); }
    }
  }
  pass(0); pass(3); pass(7); pass(null);
  return pairs;
}

function dateAwareMatch(bankEntries: BankEntry[], ledgerEntries: LedgerEntry[]) {
  const amtKey = (n: number) => n.toFixed(2);
  type BankItem = { idx: number; entry: BankEntry };
  type LedgerItem = { idx: number; entry: LedgerEntry };

  const bankGroups = new Map<string, BankItem[]>();
  bankEntries.forEach((e, idx) => {
    const k = amtKey(e.debit || e.credit);
    (bankGroups.get(k) ?? bankGroups.set(k, []).get(k)!).push({ idx, entry: e });
  });
  const ledgerGroups = new Map<string, LedgerItem[]>();
  ledgerEntries.forEach((e, idx) => {
    const k = amtKey(e.debit || e.credit);
    (ledgerGroups.get(k) ?? ledgerGroups.set(k, []).get(k)!).push({ idx, entry: e });
  });

  const bankMissing: BankEntry[] = [];
  const ledgerMissing: LedgerEntry[] = [];
  const allKeys = new Set([...bankGroups.keys(), ...ledgerGroups.keys()]);

  for (const k of allKeys) {
    const bList = bankGroups.get(k) ?? [];
    const lList = ledgerGroups.get(k) ?? [];
    if (bList.length === lList.length) continue;

    if (bList.length > lList.length) {
      if (lList.length === 0) { for (const b of bList) bankMissing.push(b.entry); continue; }
      const paired = pairByDate(
        bList.map((b) => ({ idx: b.idx, date: b.entry.date })),
        lList.map((l) => ({ idx: l.idx, date: l.entry.date })),
      );
      const pairedBankIdxs = new Set(paired.map((p) => p.bankIdx));
      for (const b of bList) if (!pairedBankIdxs.has(b.idx)) bankMissing.push(b.entry);
    } else {
      if (bList.length === 0) { for (const l of lList) ledgerMissing.push(l.entry); continue; }
      const paired = pairByDate(
        bList.map((b) => ({ idx: b.idx, date: b.entry.date })),
        lList.map((l) => ({ idx: l.idx, date: l.entry.date })),
      );
      const pairedLedgerIdxs = new Set(paired.map((p) => p.ledgerIdx));
      for (const l of lList) if (!pairedLedgerIdxs.has(l.idx)) ledgerMissing.push(l.entry);
    }
  }
  return { bankUnresolved: bankMissing, ledgerUnresolved: ledgerMissing };
}

const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ═══════════════════════════════════════════
   ENDPOINT
   ═══════════════════════════════════════════ */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const bankFiles = formData.getAll("bankFiles") as File[];
    const bankTypes = formData.getAll("bankTypes") as string[];
    const ledgerFile = formData.get("ledgerFile") as File | null;
    const passwordsRaw = formData.get("passwords") as string | null;
    const passwords: Record<string, string> = passwordsRaw ? JSON.parse(passwordsRaw) : {};

    if (bankFiles.length === 0 || !ledgerFile) {
      return Response.json({ error: "At least one bank statement and a ledger file are required." }, { status: 400 });
    }

    // Parse all bank files in parallel
    const allBankEntries: BankEntry[] = [];
    const bankSources: { name: string; bank: string; count: number; error?: string }[] = [];
    const warnings: string[] = [];

    const results = await Promise.all(
      bankFiles.map((file, i) => parseBankFile(file, bankTypes[i] || undefined, passwords[file.name]))
    );

    // Check if any file needs a password
    const needsPassword = results.filter((r) => r.passwordRequired).map((_, i) => bankFiles[i].name);
    if (needsPassword.length > 0) {
      return Response.json({ passwordRequired: true, files: needsPassword }, { status: 200 });
    }
    for (let i = 0; i < bankFiles.length; i++) {
      const result = results[i];
      bankSources.push({ name: bankFiles[i].name, bank: result.bank, count: result.entries.length, error: result.error });
      if (result.error) warnings.push(result.error);
      if (result.warning) warnings.push(result.warning);
      allBankEntries.push(...result.entries);
    }

    if (allBankEntries.length === 0) {
      return Response.json({
        error: "No transactions could be extracted from any bank statement file.",
        warnings,
      }, { status: 400 });
    }

    // Parse ledger
    const ledgerBuffer = Buffer.from(await ledgerFile.arrayBuffer());
    const ext = ledgerFile.name.toLowerCase().split(".").pop() ?? "";
    let ledgerEntries: LedgerEntry[];
    if (ext === "csv") {
      ledgerEntries = parseLedgerCSV(ledgerBuffer.toString("utf-8"));
    } else if (ext === "xls" || ext === "xlsx") {
      ledgerEntries = parseLedgerExcel(ledgerBuffer);
    } else if (ext === "pdf") {
      const ledgerPw = passwords[ledgerFile.name];
      const { text: ledgerText, needsPassword: ledgerNeedsPw } = await extractPdfText(ledgerBuffer, ledgerPw);
      if (ledgerNeedsPw) {
        return Response.json({ passwordRequired: true, files: [ledgerFile.name] }, { status: 200 });
      }
      if (!ledgerText) {
        return Response.json({ error: "Could not extract text from ledger PDF." }, { status: 400 });
      }
      ledgerEntries = parseTallyLedger(ledgerText);
      if (ledgerEntries.length === 0) {
        return Response.json({ error: "No entries found in ledger PDF. Ensure it is a Tally-format PDF." }, { status: 400 });
      }
    } else {
      return Response.json({ error: "Ledger must be .xls, .xlsx, .csv, or .pdf (Tally format)" }, { status: 400 });
    }

    if (ledgerEntries.length === 0) {
      return Response.json({ error: "No entries found in ledger." }, { status: 400 });
    }

    // Module 2 reference counts
    const m2 = amountOnlyCount(allBankEntries, ledgerEntries);

    // Date-aware matching
    const { bankUnresolved, ledgerUnresolved } = dateAwareMatch(allBankEntries, ledgerEntries);

    const resolvedFromBank = m2.bankMissing - bankUnresolved.length;
    const resolvedFromLedger = m2.ledgerMissing - ledgerUnresolved.length;

    return Response.json({
      bankTotal: allBankEntries.length,
      ledgerTotal: ledgerEntries.length,
      bankSources,
      warnings,
      module2BankMissing: m2.bankMissing,
      module2LedgerMissing: m2.ledgerMissing,
      resolvedCount: resolvedFromBank + resolvedFromLedger,
      bankUnresolved: bankUnresolved.map((r) => ({
        date: r.date,
        particulars: r.particulars,
        debit: r.debit,
        credit: r.credit,
        source: r.source,
      })),
      ledgerUnresolved: ledgerUnresolved.map((r) => ({
        date: r.date,
        ref: r.ref,
        doc: r.doc,
        desc: r.desc.substring(0, 60),
        debit: r.debit,
        credit: r.credit,
      })),
      summary: {
        resolvedFromBank,
        resolvedFromLedger,
        bankUnresolvedCount: bankUnresolved.length,
        bankUnresolvedDR: fmt(bankUnresolved.reduce((s, r) => s + r.debit, 0)),
        bankUnresolvedCR: fmt(bankUnresolved.reduce((s, r) => s + r.credit, 0)),
        ledgerUnresolvedCount: ledgerUnresolved.length,
        ledgerUnresolvedDR: fmt(ledgerUnresolved.reduce((s, r) => s + r.debit, 0)),
        ledgerUnresolvedCR: fmt(ledgerUnresolved.reduce((s, r) => s + r.credit, 0)),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
