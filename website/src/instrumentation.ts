import { isUsableSupabaseConfig } from "./lib/supabase/config";

export function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  const ok = isUsableSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (ok) {
    console.info("[g-aid] website auth project: configured");
    return;
  }
  console.info(
    "[g-aid] website auth project: not configured — put Project URL + anon key in website/.env.local (not repo root or software/) and restart npm run dev:website"
  );
}
