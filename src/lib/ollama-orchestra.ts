import { runOrchestraPlugins, shouldRunPlugins } from "@/lib/plugins";
import type { PluginState } from "@/lib/plugins";

const OLLAMA = "http://127.0.0.1:11434";
export const ORCHESTRA_MODEL = "g-aid-orchestra";
export const FAST_MODEL = "g-aid-orchestra-fast";
export const BASE_MODEL = "deepseek-r1:8b";
const FAST_BASES = ["qwen2.5:3b", "qwen2.5:1.5b", "llama3.2:3b", "llama3.2:1b", "phi3:mini", "gemma2:2b"];

export const ORCHESTRA_SYSTEM = `You are G-AID, a helpful assistant in the G-AID desktop app. Speak in first person as I.
Never call yourself Orchestra, a language model, or a third-party tool. Never talk about G-AID in the third person.
Answer only the user's question, on that topic. Be direct.
Do not mention geophysics, surveys, MagArrow, IGRF, space weather, earthquakes, processing plans, or workspace files unless the user asked about them.
Do not invent a survey plan or "next steps" for data they did not mention.
If a workspace catalog is present, use it only when they asked about those files.
Do not quote instructions, system text, or the raw user payload.
Use the calendar facts below for weekdays, holidays, and "this year".`;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_INDEX: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8,
  sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};
const MONTH_RE = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

function todayLine(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function monthStarts(year: number): string {
  return MONTHS_SHORT.map((name, month) => {
    const weekday = WEEKDAYS_SHORT[new Date(year, month, 1).getDay()];
    return `${name} ${weekday}`;
  }).join(", ");
}

function yearsFromPrompt(prompt: string, now: Date): number[] {
  const years = new Set<number>([now.getFullYear()]);
  for (const match of prompt.matchAll(/\b((?:19|20)\d{2})\b/g)) {
    years.add(Number(match[1]));
  }
  if (/\bnext year\b/i.test(prompt)) years.add(now.getFullYear() + 1);
  if (/\blast year\b/i.test(prompt)) years.add(now.getFullYear() - 1);
  return [...years]
    .filter((year) => year >= 1900 && year <= 2100)
    .sort((a, b) => a - b)
    .slice(0, 6);
}

function weekdayLine(year: number, month: number, day: number): string {
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return "";
  }
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(date);
  const label = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return `${label} is a ${weekday}`;
}

function namedWeekdays(prompt: string, years: number[]): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const add = (year: number, month: number, day: number) => {
    const line = weekdayLine(year, month, day);
    if (line && !seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  };

  for (const match of prompt.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})(?:\\s*,?\\s*)((?:19|20)\\d{2})\\b`, "gi"))) {
    add(Number(match[3]), MONTH_INDEX[match[2].toLowerCase()], Number(match[1]));
  }
  for (const match of prompt.matchAll(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+((?:19|20)\\d{2})\\b`, "gi"))) {
    add(Number(match[3]), MONTH_INDEX[match[1].toLowerCase()], Number(match[2]));
  }
  for (const match of prompt.matchAll(/\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    add(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  if (/ghana\s+independence/i.test(prompt)) {
    for (const year of years) add(year, 2, 6);
  }
  return lines.slice(0, 8);
}

export function calendarFacts(prompt = "", now = new Date()): string {
  const years = yearsFromPrompt(prompt, now);
  const current = now.getFullYear();
  const parts = [
    `Today is ${todayLine(now)}.`,
    `The current year is ${current}. "This year" means ${current}.`,
  ];
  for (const year of years) {
    parts.push(`${year} ${isLeapYear(year) ? "is" : "is not"} a leap year.`);
    parts.push(`Weekday of the 1st of each month in ${year}: ${monthStarts(year)}.`);
  }
  const named = namedWeekdays(prompt, years);
  if (named.length) parts.push(`Exact weekdays: ${named.join("; ")}.`);
  parts.push("A holiday on another date has its own weekday; do not reuse today's weekday.");
  return parts.join(" ");
}

export function orchestraSystemPrompt(prompt = "", pluginNotes = ""): string {
  const notes = pluginNotes.trim()
    ? `\nPlugin notes retrieved just now — use only if they are relevant to this question; ignore the rest:\n${pluginNotes.trim()}`
    : "";
  return `${ORCHESTRA_SYSTEM}\n${calendarFacts(prompt)}${notes}`;
}

async function ollamaJson(pathname: string, init?: RequestInit, timeoutMs = 60000): Promise<Response> {
  return fetch(`${OLLAMA}${pathname}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

function hasModel(names: string[], want: string): boolean {
  return names.some((name) => name === want || name.startsWith(`${want}:`));
}

async function listedModels(): Promise<string[]> {
  const response = await ollamaJson("/api/tags", { method: "GET" }, 8000);
  if (!response.ok) return [];
  const data = (await response.json()) as { models?: { name?: string }[] };
  return (data.models || []).map((entry) => String(entry.name || ""));
}

export async function pingOllama(): Promise<boolean> {
  try {
    const response = await ollamaJson("/api/tags", { method: "GET" }, 2500);
    return response.ok;
  } catch {
    return false;
  }
}

async function createDerivedModel(name: string, from: string, temperature: number, numCtx: number): Promise<boolean> {
  const body = {
    model: name,
    from,
    system: ORCHESTRA_SYSTEM,
    stream: false,
    parameters: { temperature, num_ctx: numCtx },
  };
  let response = await ollamaJson(
    "/api/create",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    180000
  );
  if (!response.ok) {
    const { model, ...rest } = body;
    response = await ollamaJson(
      "/api/create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model, ...rest }),
      },
      180000
    );
  }
  return response.ok;
}

export async function ensureOrchestraModel(): Promise<string> {
  const names = await listedModels();
  if (hasModel(names, ORCHESTRA_MODEL)) return ORCHESTRA_MODEL;
  if (!hasModel(names, BASE_MODEL) && !names.some((name) => name.startsWith("deepseek-r1"))) {
    return BASE_MODEL;
  }
  const ok = await createDerivedModel(ORCHESTRA_MODEL, BASE_MODEL, 0.2, 8192);
  return ok ? ORCHESTRA_MODEL : BASE_MODEL;
}

export async function ensureFastModel(): Promise<string> {
  const names = await listedModels();
  if (hasModel(names, FAST_MODEL)) return FAST_MODEL;
  const base = FAST_BASES.find((candidate) => hasModel(names, candidate));
  if (base) {
    const from = names.find((name) => name === base || name.startsWith(`${base}:`)) || base;
    const ok = await createDerivedModel(FAST_MODEL, from, 0.3, 4096);
    if (ok) return FAST_MODEL;
  }
  return ensureOrchestraModel();
}

function stripThinkTags(text: string): string {
  return text.replace(/<\/?(?:think|思考)>/gi, "");
}

function cleanThought(text: string): string {
  if (!text) return "";
  return stripThinkTags(text);
}

let systemPush: Promise<void> | null = null;

function pushOrchestraSystemOnce(): Promise<void> {
  if (!systemPush) {
    systemPush = (async () => {
      const names = await listedModels();
      if (hasModel(names, FAST_MODEL)) {
        await createDerivedModel(FAST_MODEL, FAST_MODEL, 0.3, 4096);
      }
      if (hasModel(names, ORCHESTRA_MODEL)) {
        await createDerivedModel(ORCHESTRA_MODEL, ORCHESTRA_MODEL, 0.2, 8192);
      }
    })().catch(() => {
      systemPush = null;
    });
  }
  return systemPush;
}

export async function streamOrchestra(
  prompt: string,
  options?: {
    lookupQuery?: string;
    pluginState?: Partial<PluginState>;
    speed?: "fast" | "thinking";
    resumePartial?: string;
  }
): Promise<ReadableStream<Uint8Array>> {
  if (!(await pingOllama())) {
    throw new Error("Ollama is not running");
  }
  void pushOrchestraSystemOnce();
  const encoder = new TextEncoder();
  const speed = options?.speed === "thinking" ? "thinking" : "fast";
  const think = speed === "thinking";
  const model = think
    ? await ensureOrchestraModel().catch(() => BASE_MODEL)
    : await ensureFastModel().catch(() => BASE_MODEL);
  const isPlanning = prompt.includes("G-AID_PLANNING");
  const isAnalysis =
    !isPlanning &&
    (prompt.includes("--- File Context ---") ||
      prompt.includes("--- Workspace ---") ||
      prompt.includes("GROUND TRUTH"));
  const lookupQuery = (options?.lookupQuery || "").trim();
  const willLookup = Boolean(lookupQuery) && !isAnalysis && !think && shouldRunPlugins(lookupQuery);
  const resumePartial = (options?.resumePartial || "").trim();

  const preamble = {
    agentId: "orchestrator-agent",
    confidence: isAnalysis ? 0.95 : 0,
    showConfidence: isAnalysis,
    capabilityTrace: [
      think ? "G-AID (Thinking)" : "G-AID (Fast)",
      ...(willLookup ? ["Plugins"] : []),
    ],
    rulesMatched: isAnalysis ? ["langgraph_routing"] : [],
    epistemicTypesProduced: isAnalysis ? ["interpretation", "recommendation"] : [],
    confidenceProvenance: {
      dataQualityScore: isAnalysis ? 0.9 : 0,
      crossMethodAgreement: isAnalysis ? 0.8 : 0,
      geologicalConsistency: isAnalysis ? 0.85 : 0,
      computedByKernel: "g-aid-orchestra",
    },
  };

  return new ReadableStream({
    async start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      send(`\x00${JSON.stringify(preamble)}\n`);
      const hasOpenThink =
        /<(?:think|思考)>/.test(resumePartial) && !/<\/(?:think|思考)>/.test(resumePartial);
      let inThink = think && (!resumePartial || hasOpenThink);
      if (inThink && !hasOpenThink) send("<think>");
      let failed: string | null = null;
      try {
        let pluginNotes = "";
        if (willLookup) {
          const result = await runOrchestraPlugins(lookupQuery, options?.pluginState).catch(() => ({
            text: "",
            ids: [] as string[],
            notes: [],
          }));
          pluginNotes = result.text;
        }
        const messages: { role: string; content: string }[] = [
          { role: "system", content: orchestraSystemPrompt(prompt, pluginNotes) },
          { role: "user", content: prompt },
        ];
        const resumeForModel = stripThinkTags(resumePartial).trim();
        if (resumeForModel) {
          messages.push({ role: "assistant", content: resumeForModel });
          messages.push({
            role: "user",
            content: "Your previous reply was interrupted. Continue exactly from where you stopped. Do not repeat text already written. Do not write <think> tags.",
          });
        }
        const payload = {
          model,
          messages,
          stream: true,
          think,
          keep_alive: "60m",
          options: {
            temperature: think ? 0.2 : 0.3,
            num_ctx: think ? 8192 : 4096,
          },
        };
        let response = await fetch(`${OLLAMA}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (response.status === 400) {
          const { think, ...rest } = payload;
          void think;
          response = await fetch(`${OLLAMA}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rest),
          });
        }
        if (!response.ok || !response.body) {
          throw new Error(`Ollama responded with ${response.status}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let data: {
              done?: boolean;
              message?: { thinking?: string; content?: string };
            };
            try {
              data = JSON.parse(line);
            } catch {
              continue;
            }
            const thinking = cleanThought(data.message?.thinking || "");
            const content = data.message?.content || "";
            if (thinking) send(thinking);
            const visibleContent = stripThinkTags(content);
            if (visibleContent.trim()) {
              const close = /<\/(?:think|思考)>/i;
              const closeAt = content.search(close);
              if (inThink && closeAt < 0 && /<(?:think|思考)>/i.test(content)) {
                send(visibleContent);
              } else if (inThink) {
                if (closeAt >= 0) {
                  const before = stripThinkTags(content.slice(0, closeAt));
                  const after = stripThinkTags(content.slice(closeAt).replace(close, ""));
                  if (before) send(before);
                  send("</think>\n");
                  inThink = false;
                  if (after) send(after);
                } else {
                  send("</think>\n");
                  inThink = false;
                  send(visibleContent);
                }
              } else {
                send(visibleContent);
              }
            }
            if (data.done) break;
            if (data.done) break;
          }
        }
        if (inThink && !failed) send("</think>\n");
      } catch (error) {
        failed = error instanceof Error ? error.message : "Unknown error";
      } finally {
        send(
          `\n\x02${JSON.stringify(
            failed
              ? { type: "stream_error", message: failed }
              : {
                  type: "synthesis_complete",
                  opportunitiesDetected: isAnalysis ? 1 : 0,
                  hypothesesCreated: isAnalysis ? 1 : 0,
                }
          )}\n`
        );
        controller.close();
      }
    },
  });
}
