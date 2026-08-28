/**
 * supabase/server.ts
 * Server-side Supabase client — for use in Server Components, Route Handlers, and middleware.
 * Uses @supabase/ssr to correctly read/write cookies.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignore — Server Components cannot set cookies.
            // The middleware is responsible for refreshing the session.
          }
        },
      },
    }
  );
}
