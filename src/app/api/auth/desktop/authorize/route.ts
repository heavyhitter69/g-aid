import { NextResponse, type NextRequest } from "next/server";
import { isUsableSupabaseConfig } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authorizeDesktop, cancelDesktopRedirect } from "@/lib/desktop-auth/flow";
import { desktopAuthStoreConfigured, getDesktopAuthRuntime } from "@/lib/desktop-auth/runtime";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const clientId = String(body.client_id ?? "");
  const codeChallenge = String(body.code_challenge ?? "");
  const codeChallengeMethod = String(body.code_challenge_method ?? "");
  const state = String(body.state ?? "");
  const nonce = String(body.nonce ?? "");
  const redirectUri = String(body.redirect_uri ?? "");

  if (body.cancel === true) {
    const cancelled = cancelDesktopRedirect(redirectUri, state);
    if (!cancelled.ok) {
      return NextResponse.json({ error: cancelled.error }, { status: cancelled.status });
    }
    return NextResponse.json({ redirect: cancelled.redirect });
  }

  if (!isUsableSupabaseConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    return NextResponse.json({ error: "authentication_unconfigured" }, { status: 503 });
  }
  if (!desktopAuthStoreConfigured()) {
    return NextResponse.json({ error: "desktop_auth_unconfigured" }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user || !data.session.access_token || !data.session.refresh_token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let runtime;
  try {
    runtime = getDesktopAuthRuntime();
  } catch {
    return NextResponse.json({ error: "desktop_auth_unconfigured" }, { status: 503 });
  }

  const result = await authorizeDesktop(runtime.store, runtime.crypto, {
    clientId,
    codeChallenge,
    codeChallengeMethod,
    state,
    nonce,
    redirectUri,
    userId: data.session.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ redirect: result.redirect });
}
