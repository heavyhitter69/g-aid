import { USER_CAPABILITY_IDS, type UserCapabilityId } from "./types.ts";
import { isRegisteredCapability } from "./registry.ts";

const STEP_TO_CAPABILITY: Record<string, UserCapabilityId> = {
  diurnal: "mag.diurnal",
  igrf: "mag.igrf",
  headingLag: "mag.headingLag",
  level: "mag.level",
  grid: "mag.grid",
  rtp: "mag.rtp",
  derivatives: "mag.derivatives",
  lineaments: "mag.lineaments",
  gis: "mag.gis",
};

export function capabilityFromStepKey(key: string): UserCapabilityId | undefined {
  return STEP_TO_CAPABILITY[key];
}

export function stepKeyFromCapability(id: UserCapabilityId): string {
  const found = Object.entries(STEP_TO_CAPABILITY).find(([, value]) => value === id);
  return found?.[0] || id;
}

export function capabilitiesFromSteps(steps: Record<string, boolean>): UserCapabilityId[] {
  const ids: UserCapabilityId[] = [];
  for (const [key, enabled] of Object.entries(steps)) {
    if (!enabled) continue;
    const id = STEP_TO_CAPABILITY[key];
    if (id) ids.push(id);
  }
  return ids;
}

export function stepsFromCapabilities(ids: string[]): Record<string, boolean> {
  const steps: Record<string, boolean> = {};
  for (const key of Object.keys(STEP_TO_CAPABILITY)) steps[key] = false;
  for (const id of ids) {
    if (!isRegisteredCapability(id)) continue;
    steps[stepKeyFromCapability(id)] = true;
  }
  return steps;
}

/** Natural language may propose ids; the registry decides what exists. */
export function proposeCapabilitiesFromMessage(message: string, previous: UserCapabilityId[] = []): UserCapabilityId[] {
  const m = message.toLowerCase();
  const next = new Set(previous);
  const onlyDiurnal = /\b(only|just)\s+diurnal\b|\bdiurnal\s+only\b/.test(m);
  if (onlyDiurnal) {
    return ["mag.diurnal"];
  }

  const deny = (re: RegExp, id: UserCapabilityId) => {
    if (re.test(m)) next.delete(id);
  };
  const grant = (re: RegExp, id: UserCapabilityId) => {
    if (re.test(m) && isRegisteredCapability(id)) next.add(id);
  };

  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(rtp|reduction to (the )?pole)\b/, "mag.rtp");
  grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\b(rtp|reduction to (the )?pole)\b|\bdo rtp\b/, "mag.rtp");

  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(igrf|main field)\b/, "mag.igrf");
  grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\bigrf\b/, "mag.igrf");

  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(levell?ing|tie[ -]?lines?|microlevell?ing)\b/, "mag.level");
  grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\b(levell?ing|tie[ -]?lines?)\b/, "mag.level");

  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(heading|lag)\b/, "mag.headingLag");
  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(grid(?:ding)?)\b/, "mag.grid");
  grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\bgrid/, "mag.grid");
  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(derivative|magmap|analytic signal|lineament)\b/, "mag.derivatives");
  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(diurnal)\b/, "mag.diurnal");

  if (/\brtp\b|reduction to (the )?pole/.test(m) && !/skip|omit|without|no rtp/.test(m)) {
    next.add("mag.rtp");
  }
  if (/\bdiurnal\b/.test(m) && !/skip|omit|without|no diurnal/.test(m)) next.add("mag.diurnal");
  if (/\bigrf\b/.test(m) && !/skip|omit|without/.test(m)) next.add("mag.igrf");

  return USER_CAPABILITY_IDS.filter((id) => next.has(id));
}

export function unregisteredProposal(message: string): string | undefined {
  const m = message.toLowerCase();
  if (/\b(gravity|bouguer|free[\s-]?air|mgal)\b/.test(m)) return "gravity";
  if (/\b(ert|resistivity|pseudosection)\b/.test(m)) return "ert";
  if (/\b(seismic|segy|nmo)\b/.test(m)) return "seismic";
  if (/\b(gpr|ground[\s-]?penetrating)\b/.test(m)) return "gpr";
  if (/\bradiometr/.test(m)) return "radiometrics";
  return undefined;
}
