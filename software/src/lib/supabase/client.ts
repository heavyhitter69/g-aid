/**
 * supabase/client.ts
 * Browser-side Supabase client — safe to import in "use client" components.
 */

import { createBrowserClient } from "@supabase/ssr";
import { isUsableSupabaseConfig } from "./config";

export { isUsableSupabaseConfig };

export function hasSupabaseConfig(): boolean {
  return isUsableSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createClient() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase is not configured. Local desktop verification does not require a remote auth project.");
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
