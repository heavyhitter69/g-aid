/** Treat missing or placeholder auth env as unconfigured so local desktop work can run. */

export function isUsableSupabaseConfig(url?: string, key?: string): boolean {
  if (!url || !key) return false;
  const lowerUrl = url.toLowerCase();
  const lowerKey = key.toLowerCase();
  if (lowerUrl.includes("placeholder") || lowerKey.includes("placeholder")) return false;
  if (!/^https:\/\//i.test(url)) return false;
  return true;
}
