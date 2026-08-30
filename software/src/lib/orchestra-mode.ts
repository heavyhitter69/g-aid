import { detectAnalysisIntent } from "@/lib/workspace-index";

export type OrchestraChoice = "auto" | "fast" | "thinking";
export type OrchestraSpeed = "fast" | "thinking";

export const ORCHESTRA_CHOICES: { id: OrchestraChoice; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Orchestra Fast for chat, Orchestra for survey work" },
  { id: "fast", label: "G-AID Orchestra Fast", hint: "Quick replies and ordinary conversation" },
  { id: "thinking", label: "G-AID Orchestra", hint: "Workspace investigation and planning" },
];

export function orchestraSpeedLabel(speed: OrchestraSpeed): string {
  return speed === "thinking" ? "G-AID Orchestra" : "G-AID Orchestra Fast";
}

export function pickerLabel(choice: OrchestraChoice, preview: OrchestraSpeed): string {
  if (choice === "auto") return `Auto · ${preview === "thinking" ? "Orchestra" : "Orchestra Fast"}`;
  return orchestraSpeedLabel(choice);
}

export function looksAnalytical(userText: string): boolean {
  if (detectAnalysisIntent(userText)) return true;
  return /\b(rtp|igrf|diurnal|bouguer|invert|lineament|proceed|pseudosection|residual|heading|lag|tie[\s-]?line|radiometr|ternary)\b/i.test(
    userText
  ) || /\b(process|analyse|analyze|correct|reduce|grid)\b.+\b(mag|magnetic|survey|gravity|ert|seismic|radiometr)\b/i.test(
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
