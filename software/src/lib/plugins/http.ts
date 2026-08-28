const UA = "G-AID/0.1 (desktop geophysics assistant; Orchestra plugins)";

export async function fetchJson(url: string, timeoutMs = 5000, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function clip(text: string, max = 900): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}
