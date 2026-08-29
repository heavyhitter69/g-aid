import { isUsableSupabaseConfig } from "@/lib/supabase/config";

/** Local tester probe: whether this website process loaded a usable public project. No secrets. */
export function GET() {
  return Response.json({
    configured: isUsableSupabaseConfig(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ),
  });
}
