/** Treat missing or placeholder auth env as unconfigured so local desktop work can run. */

export function isUsableSupabaseConfig(url?: string, key?: string): boolean {
  const trimmedUrl = url?.trim() ?? "";
  const trimmedKey = key?.trim() ?? "";
  if (!trimmedUrl || !trimmedKey) return false;
  const lowerUrl = trimmedUrl.toLowerCase();
  const lowerKey = trimmedKey.toLowerCase();
  if (lowerUrl.includes("placeholder") || lowerKey.includes("placeholder")) return false;
  if (!/^https:\/\//i.test(trimmedUrl)) return false;
  return true;
}
