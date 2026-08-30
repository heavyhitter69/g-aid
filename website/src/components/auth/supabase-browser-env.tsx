"use client";

import { injectPublicSupabaseEnv } from "@/lib/supabase/browser-env";

export function SupabaseBrowserEnv({
  url,
  anonKey,
  children,
}: {
  url: string;
  anonKey: string;
  children: React.ReactNode;
}) {
  injectPublicSupabaseEnv(url, anonKey);
  return children;
}
