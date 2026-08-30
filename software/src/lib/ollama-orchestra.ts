import { runOrchestraPlugins, shouldRunPlugins } from "@/lib/plugins";
import type { PluginState } from "@/lib/plugins";
import {
  chatPreamble,
  classifyDirectQuestion,
  identityAnswer,
  listedNameMatches,
  ORCHESTRA_ALIAS,
  ORCHESTRA_BASE,
  ORCHESTRA_FAST_ALIAS,
  resolveRoleFromListed,
  roleForSpeed,
  unavailableMessage,
  type CompletedRunCite,
  type ModelRole,
} from "@/lib/model-role";

const OLLAMA = "http://127.0.0.1:11434";
export const ORCHESTRA_MODEL = ORCHESTRA_ALIAS;
export const FAST_MODEL = ORCHESTRA_FAST_ALIAS;
export const BASE_MODEL = ORCHESTRA_BASE;

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

export function orchestraSystemPrompt(prompt = "", pluginNotes = "", role: ModelRole = roleForSpeed("fast")): string {
  const notes = pluginNotes.trim()
    ? `\nPlugin notes retrieved just now — use only if they are relevant to this question; ignore the rest:\n${pluginNotes.trim()}`
    : "";
  return `${role.systemPrompt}\n${calendarFacts(prompt)}${notes}`;
}

export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

async function ollamaJson(pathname: string, init?: RequestInit, timeoutMs = 60000): Promise<Response> {
  return fetch(`${OLLAMA}${pathname}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
  });
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

async function createAliasIfMissing(role: ModelRole, names: string[]): Promise<boolean> {
  if (listedNameMatches(names, role.alias)) return true;
  if (!listedNameMatches(names, role.base)) return false;
  const from = names.find((name) => listedNameMatches([name], role.base)) || role.base;
  const body = {
    model: role.alias,
    from,
    system: role.systemPrompt,
    stream: false,
    parameters: { temperature: role.temperature, num_ctx: role.numCtx },
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

export async function resolveLiveRole(speed: "fast" | "thinking"): Promise<ReturnType<typeof resolveRoleFromListed>> {
  if (!(await pingOllama())) {
    const role = roleForSpeed(speed);
    return { ok: false, role, error: unavailableMessage(role, "Ollama is not running.") };
  }
  const names = await listedModels();
  const resolved = resolveRoleFromListed(names, speed);
  if (!resolved.ok) return resolved;
  if (resolved.needsCreate) {
    const created = await createAliasIfMissing(resolved.role, names);
    if (!created) {
      return {
        ok: false,
        role: resolved.role,
        error: unavailableMessage(resolved.role, `I could not create \`${resolved.role.alias}\` from the installed \`${resolved.role.base}\`.`),
      };
    }
  }
  return resolved;
}

function stripThinkTags(text: string): string {
  return text.replace(/<\/?(?:think|思考)>/gi, "");
}

function cannedStream(text: string, preamble: Record<string, unknown>, epilogue: Record<string, unknown> = { type: "synthesis_complete" }): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`\x00${JSON.stringify(preamble)}\n`));
      controller.enqueue(encoder.encode(text));
      controller.enqueue(encoder.encode(`\n\x02${JSON.stringify(epilogue)}\n`));
      controller.close();
    },
  });
}

export async function streamOrchestra(
  prompt: string,
  options?: {
    lookupQuery?: string;
    pluginState?: Partial<PluginState>;
    speed?: "fast" | "thinking";
    resumePartial?: string;
    userText?: string;
    completedRuns?: CompletedRunCite[];
    reasoningSummary?: string[];
  }
): Promise<ReadableStream<Uint8Array>> {
  const speed = options?.speed === "thinking" ? "thinking" : "fast";
  const role = roleForSpeed(speed);
  const userText = (options?.userText || options?.lookupQuery || "").trim();
  const direct = classifyDirectQuestion(userText);
  const resolved = await resolveLiveRole(speed);

  if (direct) {
    const text = identityAnswer(direct, resolved, options?.completedRuns || []);
    const preambleRole = resolved.ok ? resolved.role : role;
    return cannedStream(text, chatPreamble(preambleRole, { reasoningSummary: options?.reasoningSummary }));
  }

  if (!resolved.ok) {
    throw new ModelUnavailableError(resolved.error);
  }

  const encoder = new TextEncoder();
  const lookupQuery = (options?.lookupQuery || "").trim();
  const isPlanning = prompt.includes("G-AID_PLANNING");
  const willLookup = Boolean(lookupQuery) && !isPlanning && speed === "fast" && shouldRunPlugins(lookupQuery);
  const resumePartial = (options?.resumePartial || "").trim();
  const preamble = chatPreamble(resolved.role, {
    plugins: willLookup,
    reasoningSummary: options?.reasoningSummary,
  });

  return new ReadableStream({
    async start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      send(`\x00${JSON.stringify(preamble)}\n`);
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
          { role: "system", content: orchestraSystemPrompt(prompt, pluginNotes, resolved.role) },
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
          model: resolved.model,
          messages,
          stream: true,
          think: resolved.role.think,
          keep_alive: "60m",
          options: {
            temperature: resolved.role.temperature,
            num_ctx: resolved.role.numCtx,
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
          if (response.status === 404) {
            throw new ModelUnavailableError(unavailableMessage(resolved.role, `Ollama returned 404 for \`${resolved.model}\`.`));
          }
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
            let data: { done?: boolean; message?: { thinking?: string; content?: string } };
            try {
              data = JSON.parse(line);
            } catch {
              continue;
            }
            void data.message?.thinking;
            const visibleContent = stripThinkTags(data.message?.content || "");
            if (visibleContent) send(visibleContent);
            if (data.done) break;
          }
        }
      } catch (error) {
        failed = error instanceof Error ? error.message : "Unknown error";
      } finally {
        send(
          `\n\x02${JSON.stringify(
            failed
              ? { type: "stream_error", message: failed }
              : { type: "synthesis_complete" }
          )}\n`
        );
        controller.close();
      }
    },
  });
}
