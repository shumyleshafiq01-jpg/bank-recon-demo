/**
 * POST /api/chat — Bank Reconciliation chat agent.
 * Only discusses bank reconciliation topics.
 */

import Anthropic from "@anthropic-ai/sdk";

type Msg = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are a Bank Reconciliation AI Agent. You ONLY discuss bank reconciliation topics — nothing else. If the user asks about anything unrelated, politely redirect them back to bank reconciliation.

Your role:
1. Guide the user through the bank reconciliation process step by step
2. Explain findings from the reconciliation analysis
3. Help the user understand discrepancies between bank statements and journal ledgers
4. Suggest corrective journal entries when needed
5. Generate updated journal ledgers when the user approves corrections

Bank reconciliation knowledge:
- You understand bank statements (deposits, withdrawals, fees, interest)
- You understand journal ledgers / general ledgers (debits, credits, account codes)
- You can identify: missing entries, timing differences, bank charges not posted, outstanding cheques, deposits in transit, errors, unauthorized transactions
- You format journal entries as: DR [Account] Amount / CR [Account] Amount
- Currency: default to PKR unless the user specifies otherwise
- Always require user approval before making any changes

Tone: Professional, clear, helpful. No markdown formatting — use plain text with simple structure.

Current context about the user's session is provided in each message. Use it to give contextual responses.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages: Msg[] = body.messages ?? [];
    const context = body.context ?? {};

    if (messages.length === 0) {
      return Response.json({ error: "No messages" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: return a canned response when no API key
      return Response.json({
        reply: getFallbackReply(messages[messages.length - 1]?.content ?? "", context),
      });
    }

    const client = new Anthropic({ apiKey });

    // Add context to the system prompt
    const contextStr = `\n\nCurrent session state: Step=${context.step ?? "unknown"}, Period=${context.startDate ?? "not set"} to ${context.endDate ?? "not set"}, Bank files=${context.bankFilesCount ?? 0}, Ledger files=${context.ledgerFilesCount ?? 0}, Has results=${context.hasResults ?? false}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT + contextStr,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    return Response.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[chat] error:", msg);
    return Response.json({
      reply: "I encountered an error processing your request. Please try again.",
    });
  }
}

/** Fallback when no API key is configured — still gives a useful demo */
function getFallbackReply(lastMsg: string, context: Record<string, unknown>): string {
  const lower = lastMsg.toLowerCase();

  if (context.step === "results" || lower.includes("updated") || lower.includes("generate") || lower.includes("approve") || lower.includes("correction")) {
    return `Based on the reconciliation analysis, here are the recommended corrective entries:

CORRECTIVE JOURNAL ENTRIES:

1. Bank charges not recorded:
   DR  Bank Charges Expense    [Amount from analysis]
   CR  Cash at Bank            [Amount from analysis]

2. Outstanding deposits:
   DR  Cash at Bank            [Amount]
   CR  Accounts Receivable     [Amount]

These entries will be applied to produce an updated journal ledger once you confirm. Shall I proceed with these corrections?`;
  }

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I'm your Bank Reconciliation Agent. I'm here to help you match your bank statements against your journal ledger, identify discrepancies, and suggest corrections. How can I help you today?";
  }

  if (lower.includes("what") && (lower.includes("recon") || lower.includes("do"))) {
    return `Bank reconciliation is the process of matching transactions in your bank statement with entries in your journal/general ledger to ensure they agree.

I help by:
1. Comparing both documents transaction by transaction
2. Identifying missing entries on either side
3. Flagging discrepancies (amount differences, date mismatches)
4. Detecting bank charges, fees, or interest not yet recorded
5. Suggesting corrective journal entries
6. Generating an updated ledger after your approval

Let's start — select your reconciliation period using the panel on the left.`;
  }

  return "I'm your Bank Reconciliation Agent. I can help you with anything related to matching your bank statement with your journal ledger. Please use the panel on the left to upload your documents, or ask me any questions about the reconciliation process.";
}
