import { NextResponse, type NextRequest } from "next/server";
import {
  desktopAuthClientKey,
  desktopAuthStoreConfigured,
  exchangeDesktopToken,
  getDesktopAuthLimiter,
  getDesktopAuthRuntime,
} from "@/lib/desktop-auth/server";

export async function POST(request: NextRequest) {
  const decision = getDesktopAuthLimiter().allow(desktopAuthClientKey(request.headers));
  if (!decision.allowed) {
    if (decision.status === 503) {
      return NextResponse.json({ error: decision.error }, { status: 503 });
    }
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  if (!desktopAuthStoreConfigured()) {
    return NextResponse.json({ error: "desktop_auth_unconfigured" }, { status: 503 });
  }

  let runtime;
  try {
    runtime = getDesktopAuthRuntime();
  } catch {
    return NextResponse.json({ error: "desktop_auth_unconfigured" }, { status: 503 });
  }

  const result = await exchangeDesktopToken(runtime.store, runtime.crypto, {
    code: String(body.code ?? ""),
    codeVerifier: String(body.code_verifier ?? ""),
    redirectUri: String(body.redirect_uri ?? ""),
    nonce: String(body.nonce ?? ""),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    token_type: result.token_type,
  });
}
