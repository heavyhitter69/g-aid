/**
 * Pass through a Python orchestrate stream and patch the epilogue JSON
 * so the desktop client can show the plan card without a PyInstaller rebuild.
 */

import { TEMP_PLAN_ID } from "@/lib/workspace-file-ids";

function planTextFrom(patch: Record<string, unknown>, extras: Record<string, unknown>): string {
  const fromPatch = patch.implementationPlanContent;
  if (typeof fromPatch === "string" && fromPatch.trim()) return fromPatch;
  const fromExtras = extras.implementationPlanContent;
  if (typeof fromExtras === "string" && fromExtras.trim()) return fromExtras;
  return "";
}

function planFileUpdate(planText: string) {
  return {
    id: TEMP_PLAN_ID,
    name: TEMP_PLAN_ID,
    type: "file" as const,
    path: TEMP_PLAN_ID,
    content: planText,
    open: true,
    temporary: true,
  };
}

export function patchStreamEpilogue(
  source: ReadableStream<Uint8Array>,
  patch: Record<string, unknown>,
  onComplete?: (rawText: string) => void
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let pending = new Uint8Array(0);
  let rawText = "";
  let sentEpilogue = false;

  const concat = (a: Uint8Array, b: Uint8Array) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  };

  const findByte = (buf: Uint8Array, value: number, start = 0) => {
    for (let i = start; i < buf.length; i++) {
      if (buf[i] === value) return i;
    }
    return -1;
  };

  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending = concat(pending, value);
          rawText += decoder.decode(value, { stream: true });

          const epilogueAt = findByte(pending, 0x02);
          if (epilogueAt < 0) {
            controller.enqueue(pending);
            pending = new Uint8Array(0);
            continue;
          }

          if (epilogueAt > 0) {
            controller.enqueue(pending.slice(0, epilogueAt));
          }

          const newline = findByte(pending, 0x0a, epilogueAt + 1);
          if (newline < 0) {
            pending = pending.slice(epilogueAt);
            continue;
          }

          const jsonBytes = pending.slice(epilogueAt + 1, newline);
          let extras: Record<string, unknown> = {};
          try {
            extras = JSON.parse(new TextDecoder().decode(jsonBytes));
          } catch {
            extras = { type: "synthesis_complete" };
          }
          const planText = planTextFrom(patch, extras);
          const existingUpdates = Array.isArray(extras.projectFilesUpdates)
            ? extras.projectFilesUpdates
            : [];
          const merged = {
            ...extras,
            ...patch,
            implementationPlanContent: planText,
            projectFilesUpdates: planText
              ? [...existingUpdates, planFileUpdate(planText)]
              : extras.projectFilesUpdates,
          };
          const encoded = new TextEncoder().encode(`\x02${JSON.stringify(merged)}\n`);
          controller.enqueue(encoded);
          sentEpilogue = true;
          pending = pending.slice(newline + 1);
        }

        if (pending.length) controller.enqueue(pending);
        if (!sentEpilogue) {
          const planText = planTextFrom(patch, {});
          controller.enqueue(
            new TextEncoder().encode(
              `\n\x02${JSON.stringify({
                type: "synthesis_complete",
                ...patch,
                implementationPlanContent: planText,
                projectFilesUpdates: planText ? [planFileUpdate(planText)] : undefined,
              })}\n`
            )
          );
        }
        onComplete?.(rawText);
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
