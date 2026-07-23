// POST /api/assistant — platform-wide help chatbot.
// A HELP assistant grounded in the Kafi platform knowledge base; it explains
// how to use modules and answers process questions. It does not take actions.

import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth";
import { logUsage } from "@/lib/usage-tracker";
import { buildSystemPrompt } from "@/lib/assistant-kb";

const anthropic = new Anthropic();
const MODEL = "claude-haiku-4-5";

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const messages: Msg[] = (body.messages ?? []).slice(-12); // cap history
    const currentPath: string = body.currentPath || "/";
    if (messages.length === 0) return Response.json({ error: "No messages" }, { status: 400 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ reply: "The assistant isn't configured yet (no API key). Ask your administrator to set ANTHROPIC_API_KEY." });
    }

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: buildSystemPrompt(currentPath),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    if (response.usage) logUsage("Kafi Assistant", MODEL, response.usage.input_tokens, response.usage.output_tokens);

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text).join(" ").trim();

    return Response.json({ reply });
  } catch (err) {
    console.error("[assistant] error:", err instanceof Error ? err.message : err);
    return Response.json({ reply: "Sorry, I hit an error. Please try again." });
  }
}
