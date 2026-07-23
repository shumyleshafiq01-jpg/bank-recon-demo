import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { createShipmentFolder, shareFolderWithEmail, listFolderFiles, downloadFileAsBase64 } from "@/lib/google-drive";
import { notifyEvent } from "@/lib/sc-notify";
import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/usage-tracker";

const anthropic = new Anthropic();
const REVIEW_MODEL = "claude-sonnet-4-6";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: shipment, error: sErr } = await supabase.from("export_shipments").select("*").eq("id", id).single();
      if (sErr) throw sErr;
      const { data: items, error: iErr } = await supabase
        .from("export_shipment_checklist_items").select("*").eq("shipment_id", id).order("sort_order");
      if (iErr) throw iErr;
      return Response.json({ shipment, items: items ?? [] });
    }

    const { data, error } = await supabase.from("export_shipments").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ shipments: data ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (body.action === "create-shipment") {
      let template: { sop_method: string; document_types: string[] } | null = null;
      if (body.templateId) {
        const { data } = await supabase.from("export_doc_templates").select("sop_method, document_types").eq("id", body.templateId).single();
        template = data;
      }

      let driveFolderId: string | null = null;
      let driveFolderLink: string | null = null;
      try {
        const folder = await createShipmentFolder(`${body.buyerName || "Buyer"} — ${body.salesOrderRef || "SO"} — ${body.country || ""}`.trim());
        driveFolderId = folder.folderId;
        driveFolderLink = folder.link;
        if (body.accountantEmail) await shareFolderWithEmail(folder.folderId, body.accountantEmail);
      } catch (driveErr) {
        // Shipment can still be created without a Drive folder — surfaced to the client, not fatal.
        console.error("Drive folder creation failed:", driveErr);
      }

      const { data: shipment, error: shErr } = await supabase
        .from("export_shipments")
        .insert({
          sales_order_ref: body.salesOrderRef || null,
          buyer_name: body.buyerName || "Unnamed Buyer",
          country: body.country || null,
          pi_number: body.piNumber || null,
          advance_payment_pct: body.advancePaymentPct ?? null,
          sop_method: template?.sop_method || body.sopMethod || "courier",
          template_id: body.templateId || null,
          accountant_email: body.accountantEmail || null,
          drive_folder_id: driveFolderId,
          drive_folder_link: driveFolderLink,
          created_by: session.id,
        })
        .select("id")
        .single();
      if (shErr) throw shErr;

      const docTypes: string[] = template?.document_types || body.documentTypes || [];
      if (docTypes.length > 0) {
        const rows = docTypes.map((dt, i) => ({ shipment_id: shipment.id, document_type: dt, sort_order: i }));
        const { error: ciErr } = await supabase.from("export_shipment_checklist_items").insert(rows);
        if (ciErr) throw ciErr;
      }

      return Response.json({ ok: true, id: shipment.id, driveFolderLink });
    }

    if (body.action === "update-shipment" && body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const fields = ["salesOrderRef", "buyerName", "country", "piNumber", "advancePaymentPct", "sopMethod", "stage", "accountantEmail", "notes"];
      const map: Record<string, string> = {
        salesOrderRef: "sales_order_ref", buyerName: "buyer_name", country: "country", piNumber: "pi_number",
        advancePaymentPct: "advance_payment_pct", sopMethod: "sop_method", stage: "stage",
        accountantEmail: "accountant_email", notes: "notes",
      };
      for (const f of fields) if (body[f] !== undefined) updates[map[f]] = body[f];
      const { error } = await supabase.from("export_shipments").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete-shipment" && body.id) {
      const { error } = await supabase.from("export_shipments").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "update-checklist-item" && body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const fields = ["status", "notes", "documentType"];
      if (body.status !== undefined) updates.status = body.status;
      if (body.notes !== undefined) updates.notes = body.notes;
      if (body.documentType !== undefined) updates.document_type = body.documentType;
      const { data: item, error } = await supabase.from("export_shipment_checklist_items").update(updates).eq("id", body.id).select("shipment_id").single();
      if (error) throw error;

      if (body.status === "done" && item?.shipment_id) {
        const { data: remaining } = await supabase
          .from("export_shipment_checklist_items").select("id").eq("shipment_id", item.shipment_id).neq("status", "done");
        if ((remaining ?? []).length === 0) {
          const { data: shipment } = await supabase.from("export_shipments").select("buyer_name, sales_order_ref").eq("id", item.shipment_id).single();
          await notifyEvent({
            event: "export_checklist_complete",
            refId: item.shipment_id,
            dedupe: true,
            subject: `Export checklist complete — ${shipment?.buyer_name ?? ""}`,
            text: `All documents are ready for ${shipment?.buyer_name ?? "this shipment"}${shipment?.sales_order_ref ? ` (SO ${shipment.sales_order_ref})` : ""}. Ready for courier/SWIFT dispatch.`,
          });
        }
      }
      return Response.json({ ok: true });
    }

    if (body.action === "add-checklist-item" && body.shipmentId) {
      const { count } = await supabase.from("export_shipment_checklist_items").select("id", { count: "exact", head: true }).eq("shipment_id", body.shipmentId);
      const { data, error } = await supabase
        .from("export_shipment_checklist_items")
        .insert({ shipment_id: body.shipmentId, document_type: body.documentType || "New Document", sort_order: count ?? 0 })
        .select("id").single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.action === "delete-checklist-item" && body.id) {
      const { error } = await supabase.from("export_shipment_checklist_items").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    // Scans the shipment's Drive folder for files not yet processed, has AI
    // identify what each one is and whether it looks credible/relevant, and
    // — only when it matches a still-pending checklist item — sets that item
    // to 'in_review' with the file attached. Never auto-marks 'done': a
    // human confirms before it counts, given the stakes on customs/bank docs.
    if (body.action === "scan-shipment" && body.id) {
      const { data: shipment, error: shErr } = await supabase.from("export_shipments").select("*").eq("id", body.id).single();
      if (shErr) throw shErr;
      if (!shipment.drive_folder_id) return Response.json({ error: "This shipment has no Drive folder configured" }, { status: 400 });

      const { data: items } = await supabase
        .from("export_shipment_checklist_items").select("*").eq("shipment_id", body.id).neq("status", "done");
      const pendingTypes = (items ?? []).map(i => i.document_type as string);

      const { data: processed } = await supabase.from("export_processed_files").select("drive_file_id").eq("shipment_id", body.id);
      const processedIds = new Set((processed ?? []).map(p => p.drive_file_id as string));

      const files = await listFolderFiles(shipment.drive_folder_id);
      const newFiles = files.filter(f => !processedIds.has(f.id));

      const results: { fileName: string; verdict: string; matchedType?: string; notes: string }[] = [];

      for (const file of newFiles) {
        const supported = file.mimeType === "application/pdf" || file.mimeType.startsWith("image/");
        if (!supported) {
          await supabase.from("export_processed_files").insert({
            shipment_id: body.id, drive_file_id: file.id, file_name: file.name,
            verdict: "unclear", notes: `Unsupported file type (${file.mimeType}) — needs manual review`,
          });
          results.push({ fileName: file.name, verdict: "unclear", notes: `File type ${file.mimeType} can't be auto-reviewed` });
          continue;
        }

        let verdict = "unclear", matchedType: string | undefined, notes = "", confidence = 0;
        try {
          const base64 = await downloadFileAsBase64(file.id);
          const blocks: Anthropic.ContentBlockParam[] = [{
            type: file.mimeType === "application/pdf" ? "document" : "image",
            source: { type: "base64", media_type: file.mimeType as "application/pdf", data: base64 },
          } as Anthropic.ContentBlockParam, {
            type: "text",
            text: `This file is a document uploaded for an export shipment (Buyer: ${shipment.buyer_name}, Country: ${shipment.country || "unspecified"}).
Documents still needed for this shipment's checklist: ${pendingTypes.length > 0 ? pendingTypes.join(", ") : "(none pending)"}.

Identify what this document actually is, and whether it looks like a genuine, relevant document for THIS shipment (matches the buyer/country where visible; not a duplicate, a blank template, an unrelated invoice, or garbage). Return ONLY strict JSON, no markdown fences:
{"matchesChecklistType": string|null, "confidence": number (0-1), "verdict": "matched"|"irrelevant"|"suspicious"|"unclear", "notes": string}
"matchesChecklistType" must be exactly one of the pending document names above, or null if it doesn't clearly match any of them.`,
          }];

          const resp = await anthropic.messages.create({
            model: REVIEW_MODEL, max_tokens: 500,
            messages: [{ role: "user", content: blocks }],
          });
          logUsage("Export Dept - Doc Review", REVIEW_MODEL, resp.usage.input_tokens, resp.usage.output_tokens);
          const raw = resp.content[0].type === "text" ? resp.content[0].text : "";
          const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
          verdict = parsed.verdict || "unclear";
          matchedType = parsed.matchesChecklistType || undefined;
          notes = parsed.notes || "";
          confidence = Number(parsed.confidence) || 0;
        } catch (err) {
          notes = err instanceof Error ? err.message : "AI review failed";
        }

        await supabase.from("export_processed_files").insert({
          shipment_id: body.id, drive_file_id: file.id, file_name: file.name,
          matched_document_type: matchedType || null, confidence, verdict, notes,
        });

        if (verdict === "matched" && matchedType) {
          const item = (items ?? []).find(i => i.document_type === matchedType);
          if (item) {
            await supabase.from("export_shipment_checklist_items").update({
              status: "in_review", matched_file_id: file.id, matched_file_name: file.name,
              matched_file_link: file.webViewLink, ai_confidence: confidence, ai_notes: notes,
              updated_at: new Date().toISOString(),
            }).eq("id", item.id);

            await notifyEvent({
              event: "export_doc_matched", refId: `${body.id}:${file.id}`, dedupe: true,
              subject: `Document received — ${matchedType} (${shipment.buyer_name})`,
              text: `"${file.name}" was matched to "${matchedType}" for ${shipment.buyer_name}. Confidence ${(confidence * 100).toFixed(0)}%. Please confirm in the checklist.\n${notes}`,
            });
          }
        } else if (verdict === "suspicious" || verdict === "unclear") {
          await notifyEvent({
            event: "export_doc_needs_review", refId: `${body.id}:${file.id}`, dedupe: true,
            subject: `Export doc needs review — ${shipment.buyer_name}`,
            text: `"${file.name}" uploaded for ${shipment.buyer_name} could not be confidently matched (${verdict}). ${notes}`,
          });
        }

        results.push({ fileName: file.name, verdict, matchedType, notes });
      }

      return Response.json({ scanned: newFiles.length, results });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
