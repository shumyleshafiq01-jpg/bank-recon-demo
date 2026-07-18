import { supabase } from "./supabase";

// Supply Chain notification layer — WhatsApp + Email with an outbox log.
// Every message is recorded in sc_notifications; if the provider keys are
// not configured yet the row stays "pending" so nothing is silently lost.
//
// WhatsApp providers supported (same Cloud API payload):
//   meta      → graph.facebook.com with Bearer token  (whatsapp_token + whatsapp_phone_id)
//   360dialog → waba-v2.360dialog.io with D360-API-KEY (whatsapp_api_key)
// Email provider: Resend (resend_api_key + notify_email_from)
//
// NOTE: WhatsApp business-initiated messages outside a 24h customer window
// require an approved template. Plain text works in sandbox/testing and
// inside open sessions; swap to a template send once Kafi's template is approved.

import type { ScEventKey } from "./sc-events";

export type NotifyEvent = ScEventKey;

type SettingsMap = Record<string, string>;

async function getSettings(): Promise<SettingsMap> {
  const { data } = await supabase.from("sc_settings").select("key, value");
  const map: SettingsMap = {};
  for (const row of data ?? []) map[row.key as string] = row.value as string;
  return map;
}

/** Digits only; Pakistani local format 03xx… becomes 923xx… */
export function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "92" + d.slice(1);
  return d;
}

async function logRow(event: NotifyEvent, channel: "whatsapp" | "email", recipient: string, subject: string | null, body: string, refId: string | null) {
  const { data } = await supabase
    .from("sc_notifications")
    .insert({ event, channel, recipient, subject, body, ref_id: refId, status: "pending" })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

async function markRow(id: string | undefined, status: "sent" | "failed" | "pending", error?: string) {
  if (!id) return;
  await supabase
    .from("sc_notifications")
    .update({ status, error: error ?? null, sent_at: status === "sent" ? new Date().toISOString() : null })
    .eq("id", id);
}

async function sendWhatsApp(s: SettingsMap, to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const provider = s.whatsapp_provider || "meta";
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: true, body },
  };

  let url = "";
  let headers: Record<string, string> = { "Content-Type": "application/json" };

  if (provider === "360dialog") {
    if (!s.whatsapp_api_key) return { ok: false, error: "not configured (360dialog API key missing)" };
    url = "https://waba-v2.360dialog.io/messages";
    headers["D360-API-KEY"] = s.whatsapp_api_key;
  } else {
    if (!s.whatsapp_token || !s.whatsapp_phone_id) return { ok: false, error: "not configured (Meta token / phone ID missing)" };
    url = `https://graph.facebook.com/v21.0/${s.whatsapp_phone_id}/messages`;
    headers["Authorization"] = `Bearer ${s.whatsapp_token}`;
  }

  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendEmail(s: SettingsMap, to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!s.resend_api_key || !s.notify_email_from) {
    return { ok: false, error: "not configured (Resend key / from address missing)" };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.resend_api_key}` },
      body: JSON.stringify({ from: s.notify_email_from, to: [to], subject, html }),
    });
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface NotifyResult {
  channel: "whatsapp" | "email";
  recipient: string;
  status: "sent" | "pending" | "failed";
  error?: string;
}

/**
 * Dispatch a notification over the requested channels. Never throws.
 * Unconfigured providers leave the outbox row "pending" (visible in sc_notifications).
 */
export async function notify(args: {
  event: NotifyEvent;
  refId?: string | null;
  whatsapp?: { to: string; body: string };
  email?: { to: string; subject: string; html: string };
}): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  let settings: SettingsMap = {};
  try { settings = await getSettings(); } catch { /* fall through — rows stay pending */ }

  if (args.whatsapp?.to) {
    const to = normalizePhone(args.whatsapp.to);
    const rowId = await logRow(args.event, "whatsapp", to, null, args.whatsapp.body, args.refId ?? null);
    if (!to || to.length < 10) {
      await markRow(rowId, "failed", "invalid phone number");
      results.push({ channel: "whatsapp", recipient: to, status: "failed", error: "invalid phone number" });
    } else {
      const res = await sendWhatsApp(settings, to, args.whatsapp.body);
      const status = res.ok ? "sent" : res.error?.startsWith("not configured") ? "pending" : "failed";
      await markRow(rowId, status, res.error);
      results.push({ channel: "whatsapp", recipient: to, status, error: res.error });
    }
  }

  if (args.email?.to) {
    const rowId = await logRow(args.event, "email", args.email.to, args.email.subject, args.email.html, args.refId ?? null);
    const res = await sendEmail(settings, args.email.to, args.email.subject, args.email.html);
    const status = res.ok ? "sent" : res.error?.startsWith("not configured") ? "pending" : "failed";
    await markRow(rowId, status, res.error);
    results.push({ channel: "email", recipient: args.email.to, status, error: res.error });
  }

  return results;
}

/* ── Team fan-out: send one event to every subscribed recipient ── */

interface RecipientRow {
  id: string;
  name: string;
  designation: string | null;
  whatsapp: string | null;
  email: string | null;
  staff_id: string | null;
  notify_events: string[] | null;
  approver_events: string[] | null;
  active: boolean;
}

async function getRecipients(): Promise<RecipientRow[]> {
  const { data } = await supabase.from("sc_recipients").select("*").eq("active", true);
  return (data ?? []) as RecipientRow[];
}

/** True if this event was already dispatched for this ref (prevents re-notify spam on re-saves). */
async function alreadyNotified(event: NotifyEvent | string, refId: string): Promise<boolean> {
  const { data } = await supabase
    .from("sc_notifications").select("id").eq("event", event).eq("ref_id", refId).limit(1);
  return (data ?? []).length > 0;
}

export interface FanoutResult extends NotifyResult {
  name: string;
}

/**
 * Notify every active recipient subscribed to this workflow event,
 * over whichever channels (WhatsApp/email) they have contact info for.
 * One WhatsApp Business number is the single sender — recipients just
 * receive normal WhatsApp messages, wherever they are.
 */
export async function notifyEvent(args: {
  event: string;
  refId?: string | null;
  text: string;
  subject: string;
  dedupe?: boolean;
}): Promise<FanoutResult[]> {
  try {
    if (args.dedupe && args.refId && (await alreadyNotified(args.event, args.refId))) return [];

    const recipients = await getRecipients();
    const targets = recipients.filter(r => (r.notify_events ?? []).includes(args.event));
    const results: FanoutResult[] = [];

    for (const r of targets) {
      const res = await notify({
        event: args.event as NotifyEvent,
        refId: args.refId ?? null,
        whatsapp: r.whatsapp ? { to: r.whatsapp, body: args.text } : undefined,
        email: r.email ? { to: r.email, subject: args.subject, html: htmlWrap(args.subject, args.text) } : undefined,
      });
      for (const x of res) results.push({ ...x, name: r.name });
    }
    return results;
  } catch {
    return [];
  }
}

/** Staff ids allowed to approve the given gated event. Empty = no gate configured (anyone may approve). */
export async function getApprovers(event: string): Promise<string[]> {
  try {
    const recipients = await getRecipients();
    return recipients
      .filter(r => r.staff_id && (r.approver_events ?? []).includes(event))
      .map(r => r.staff_id as string);
  } catch {
    return [];
  }
}

/* ── Message builders ── */

export function buildPoText(po: { po_number: string; vendor_name: string; total_cartons: number }, items: { product_name: string; packing_desc?: string | null; cartons_ordered: number }[]): string {
  const lines = items.map((it, i) => `${i + 1}. ${it.product_name} — ${it.cartons_ordered} ctn${it.packing_desc ? ` (${it.packing_desc})` : ""}`);
  return [
    `*KAFI COMMODITIES — PURCHASE ORDER*`,
    `PO No: ${po.po_number}`,
    `Vendor: ${po.vendor_name}`,
    ``,
    ...lines,
    ``,
    `Total: ${po.total_cartons} cartons`,
    `Please confirm receipt of this order.`,
  ].join("\n");
}

export function buildGrnText(grn: { grn_number: string; po_number?: string | null; vendor_name?: string | null }, link: string): string {
  return [
    `*KAFI — GOODS ARRIVED*`,
    `GRN: ${grn.grn_number}`,
    grn.po_number ? `Against PO: ${grn.po_number}` : "",
    grn.vendor_name ? `Vendor: ${grn.vendor_name}` : "",
    ``,
    `Please verify the received quantities and approve:`,
    link,
  ].filter(Boolean).join("\n");
}

export function buildGrnApprovedText(grn: { grn_number: string; po_number?: string | null }): string {
  return `*KAFI — GRN APPROVED*\n${grn.grn_number}${grn.po_number ? ` (PO ${grn.po_number})` : ""} has been verified and approved. Stock updated.`;
}

export function htmlWrap(title: string, bodyText: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:16px;border:1px solid #e5e7eb;border-radius:8px">
  <h2 style="color:#065f46;margin:0 0 12px">${title}</h2>
  <pre style="font-family:inherit;white-space:pre-wrap;font-size:14px;color:#111827">${bodyText.replace(/\*/g, "")}</pre>
  <p style="color:#6b7280;font-size:12px;margin-top:16px">Kafi Commodities (Pvt) Ltd — Supply Chain</p>
</div>`;
}
