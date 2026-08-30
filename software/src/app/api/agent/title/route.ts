import type { NextRequest } from "next/server";

import { conversationTitleFromText, isPlaceholderTopic } from "@/lib/conversation-title";
import { ORCHESTRA_FAST_ALIAS } from "@/lib/model-role";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanTitle(raw: string): string {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<思考>[\s\S]*?<\/思考>/gi, "").trim();
  const line = text
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith("<") && !/^thinking/i.test(entry) && !isPlaceholderTopic(entry));
  text = (line || text).replace(/^["'“”‘’#*\-\s]+|["'“”‘’.,:;]+$/g, "").trim();
  text = text.replace(/\s+/g, " ");
  if (text.length > 60) text = `${text.slice(0, 57)}…`;
  return isPlaceholderTopic(text) ? "" : text;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { message?: string; reply?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body.message || "").slice(0, 600);
  const reply = (body.reply || "").replace(/<think>[\s\S]*?<\/think>/gi, "").slice(0, 800);
  if (!message.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const fallback = conversationTitleFromText(message);
  const prompt = `Write a short conversation title of 3 to 7 words for this chat. Reply with the title only. No quotes, no punctuation, no explanation.\n\nUser: ${message}\nAssistant: ${reply || "(pending)"}`;

  const payload = {
    model: ORCHESTRA_FAST_ALIAS,
    messages: [{ role: "user", content: prompt }],
    stream: false,
    think: false,
    options: { temperature: 0.1, num_predict: 48 },
  };

  try {
    let response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });

    if (response.status === 400) {
      const { think, ...withoutThink } = payload;
      void think;
      response = await fetch("http://127.0.0.1:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withoutThink),
        signal: AbortSignal.timeout(12000),
      });
    }

    if (!response.ok) {
      return Response.json({ title: fallback || "New conversation" });
    }

    const data = await response.json();
    const title = cleanTitle(data?.message?.content || "");
    return Response.json({ title: title || fallback || "New conversation" });
  } catch {
    return Response.json({ title: fallback || "New conversation" });
  }
}
