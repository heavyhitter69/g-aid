import { detectAnalysisIntent } from "@/lib/workspace-index";

export type OrchestraChoice = "auto" | "fast" | "thinking";
export type OrchestraSpeed = "fast" | "thinking";

export const ORCHESTRA_CHOICES: { id: OrchestraChoice; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Fast for chat, Thinking for analysis" },
  { id: "fast", label: "G-AID Orchestra (Fast)", hint: "Quick replies, no long think" },
  { id: "thinking", label: "G-AID Orchestra (Thinking)", hint: "DeepSeek R1 for survey work" },
];

export function orchestraSpeedLabel(speed: OrchestraSpeed): string {
  return speed === "thinking" ? "G-AID Orchestra (Thinking)" : "G-AID Orchestra (Fast)";
}

export function pickerLabel(choice: OrchestraChoice, preview: OrchestraSpeed): string {
  if (choice === "auto") return `Auto · ${preview === "thinking" ? "Thinking" : "Fast"}`;
  return orchestraSpeedLabel(choice);
}

export function looksAnalytical(userText: string): boolean {
  if (detectAnalysisIntent(userText)) return true;
  return /\b(rtp|igrf|diurnal|bouguer|invert|lineament|proceed|pseudosection|residual|heading|lag|tie[\s-]?line)\b/i.test(
    userText
  ) || /\b(process|analyse|analyze|correct|reduce|grid)\b.+\b(mag|magnetic|survey|gravity|ert|seismic)\b/i.test(
    userText
  );
}

export function resolveOrchestraSpeed(
  userText: string,
  options: { choice?: OrchestraChoice | string; planTurn?: boolean } = {}
): OrchestraSpeed {
  const choice = (options.choice || "auto") as OrchestraChoice;
  if (choice === "fast") return "fast";
  if (choice === "thinking") return "thinking";
  if (options.planTurn) return "thinking";
  if (looksAnalytical(userText)) return "thinking";
  return "fast";
}
