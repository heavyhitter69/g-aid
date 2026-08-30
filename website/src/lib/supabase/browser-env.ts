/**
 * Public Supabase project values for the browser.
 * Layout injects what the website Node process loaded from website/.env.local
 * so the login form does not depend on Next inlining NEXT_PUBLIC_ into this module.
 */

let url = "";
let anonKey = "";
let injected = false;

export function injectPublicSupabaseEnv(nextUrl: string, nextKey: string) {
  url = (nextUrl ?? "").trim();
  anonKey = (nextKey ?? "").trim();
  injected = true;
}

export function publicSupabaseUrl(): string {
  if (injected) return url;
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
}

export function publicSupabaseAnonKey(): string {
  if (injected) return anonKey;
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
}
