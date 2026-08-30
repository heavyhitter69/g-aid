/**
 * supabase/client.ts
 * Browser-side Supabase client — safe to import in "use client" components.
 */

import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseAnonKey, publicSupabaseUrl } from "./browser-env";
import { isUsableSupabaseConfig } from "./config";

export { isUsableSupabaseConfig };

export function hasSupabaseConfig(): boolean {
  return isUsableSupabaseConfig(publicSupabaseUrl(), publicSupabaseAnonKey());
}

export function createClient() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase is not configured. Local desktop verification does not require a remote auth project.");
  }
  return createBrowserClient(publicSupabaseUrl(), publicSupabaseAnonKey());
}
