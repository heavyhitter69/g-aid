import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  DESKTOP_AUTH_TTL_MS,
  DESKTOP_CLIENT_ID,
  DESKTOP_CODE_CHALLENGE_METHOD,
  DESKTOP_GAID_REDIRECT_URI,
  buildBrowserAuthUrl,
  buildCallbackRedirect,
  callbackContainsSecrets,
  callbackRedirectMatchesAttempt,
  isAllowedAuthBaseUrl,
  isAllowedRedirectUri,
  parseDesktopAuthCallback,
  pkceS256Challenge,
  readDesktopAuthRequest,
  resolveAuthBaseUrl,
} from "./desktop-auth/contract.ts";
import { createDesktopAuthCrypto } from "./desktop-auth/crypto.ts";
import { authorizeDesktop, cancelDesktopRedirect, exchangeDesktopToken } from "./desktop-auth/flow.ts";
import {
  MemoryDesktopAuthLimiter,
  resolveDesktopAuthLimiter,
} from "./desktop-auth/limiter.ts";
import { MemoryDesktopAuthStore } from "./desktop-auth/store.ts";

const require = createRequire(import.meta.url);
const electronAuth = require("../../electron/desktop-auth.js");

let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok  ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`not ok  ${name}`);
      console.error(err);
    });
}

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: pkceS256Challenge(verifier) };
}

function sampleRequest(redirectUri = "http://127.0.0.1:47822/auth/callback") {
  const pkce = pkcePair();
  return {
    clientId: DESKTOP_CLIENT_ID,
    codeChallenge: pkce.challenge,
    codeChallengeMethod: DESKTOP_CODE_CHALLENGE_METHOD,
    state: randomBytes(24).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
    redirectUri,
    verifier: pkce.verifier,
  };
}

await test("PKCE S256 matches Node crypto base64url(SHA-256)", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(pkceS256Challenge(verifier), expected);
  assert.equal(electronAuth.pkceS256Challenge(verifier), expected);
});

await test("redirect URI allowlist accepts gaid and loopback only", () => {
  assert.equal(isAllowedRedirectUri(DESKTOP_GAID_REDIRECT_URI), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:8765/auth/callback"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:8765/auth/callback"), true);
  assert.equal(electronAuth.isAllowedRedirectUri("http://127.0.0.1:8765/auth/callback"), true);
  assert.equal(isAllowedRedirectUri("http://192.168.1.9:8765/auth/callback"), false);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:8765/auth/callback/extra"), false);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1/auth/callback"), false);
  assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
  assert.equal(isAllowedRedirectUri("gaid://auth/callback?code=abc"), false);
  assert.equal(isAllowedRedirectUri("https://example.test/auth/callback"), false);
});

await test("callback parser accepts code/state and rejects tokens or extra keys", () => {
  const loopback = parseDesktopAuthCallback("http://127.0.0.1:8765/auth/callback?code=abc&state=xyz");
  assert.equal(loopback.ok, true);
  if (loopback.ok && loopback.code) {
    assert.equal(loopback.code, "abc");
    assert.equal(loopback.state, "xyz");
  }
  const gaid = parseDesktopAuthCallback("gaid://auth/callback?code=abc&state=xyz");
  assert.equal(gaid.ok, true);
  const cancelled = parseDesktopAuthCallback("gaid://auth/callback?error=access_denied&state=xyz");
  assert.equal(cancelled.ok, true);
  if (cancelled.ok && cancelled.error) assert.equal(cancelled.error, "access_denied");

  assert.equal(parseDesktopAuthCallback("gaid://auth/callback?access_token=tok&refresh_token=r").ok, false);
  assert.equal(parseDesktopAuthCallback("gaid://auth/callback#access_token=tok&refresh_token=r").ok, false);
  assert.equal(
    parseDesktopAuthCallback("http://127.0.0.1:8765/auth/callback?code=abc&state=xyz&access_token=tok").ok,
    false
  );
  assert.equal(
    parseDesktopAuthCallback("http://127.0.0.1:8765/auth/callback?code=abc&state=xyz&extra=1").ok,
    false
  );
  assert.equal(electronAuth.parseDesktopAuthCallback("javascript:alert(1)").ok, false);
  assert.equal(callbackContainsSecrets("gaid://auth/callback?access_token=secret"), true);
});

await test("callback redirect builder never includes tokens", () => {
  const url = buildCallbackRedirect("http://127.0.0.1:8765/auth/callback", { code: "abc", state: "xyz" });
  assert.equal(url.includes("access_token"), false);
  assert.equal(url.includes("refresh_token"), false);
  assert.match(url, /code=abc/);
  const denied = buildCallbackRedirect(DESKTOP_GAID_REDIRECT_URI, { error: "access_denied", state: "xyz" });
  assert.match(denied, /error=access_denied/);
  assert.equal(denied.includes("access_token"), false);
});

await test("GAID_AUTH_BASE_URL is required for packaged builds and is not a baked-in hostname", () => {
  assert.equal(
    resolveAuthBaseUrl({ isPackaged: true, envValue: "", localDevOrigin: "http://127.0.0.1:3000" }),
    ""
  );
  assert.equal(
    electronAuth.resolveAuthBaseUrl({
      isPackaged: true,
      envValue: "",
      localDevOrigin: "http://127.0.0.1:3000",
    }),
    ""
  );
  assert.equal(
    resolveAuthBaseUrl({ isPackaged: false, envValue: "", localDevOrigin: "http://127.0.0.1:3000" }),
    "http://127.0.0.1:3000"
  );
  assert.equal(
    resolveAuthBaseUrl({ isPackaged: true, envValue: "http://127.0.0.1:4010" }),
    "http://127.0.0.1:4010"
  );
  assert.equal(isAllowedAuthBaseUrl("https://example.test"), true);
  assert.equal(isAllowedAuthBaseUrl("http://10.0.0.2"), false);
  assert.equal(read("src/lib/desktop-auth/contract.ts").includes("g-aid.io"), false);
  assert.equal(read("electron/desktop-auth.js").includes("g-aid.io"), false);
  assert.equal(read("electron/main.js").includes("g-aid.io"), false);
});

await test("browser auth URL keeps PKCE params and no tokens", () => {
  const req = sampleRequest();
  const url = buildBrowserAuthUrl("http://127.0.0.1:3000", req, "login");
  const parsed = new URL(url);
  assert.equal(parsed.origin, "http://127.0.0.1:3000");
  assert.equal(parsed.pathname, "/auth/desktop");
  const request = readDesktopAuthRequest(parsed.searchParams);
  assert.ok(request);
  assert.equal(request?.redirectUri, req.redirectUri);
  assert.equal(url.includes("access_token"), false);
});

await test("memory store authorize+token round-trip with local loopback", async () => {
  const store = new MemoryDesktopAuthStore();
  const crypto = createDesktopAuthCrypto("test-desktop-auth-token-key");
  const req = sampleRequest("http://127.0.0.1:47822/auth/callback");
  const authorized = await authorizeDesktop(store, crypto, {
    ...req,
    userId: "user-1",
    accessToken: "access-local",
    refreshToken: "refresh-local",
  });
  assert.equal(authorized.ok, true);
  if (!authorized.ok) return;
  assert.equal(authorized.redirect.includes("access_token"), false);
  const callback = parseDesktopAuthCallback(authorized.redirect);
  assert.equal(callback.ok, true);
  if (!callback.ok || !callback.code) throw new Error("expected code");
  const exchanged = await exchangeDesktopToken(store, crypto, {
    code: callback.code,
    codeVerifier: req.verifier,
    redirectUri: req.redirectUri,
    nonce: req.nonce,
  });
  assert.equal(exchanged.ok, true);
  if (!exchanged.ok) return;
  assert.equal(exchanged.access_token, "access-local");
  assert.equal(exchanged.refresh_token, "refresh-local");

  const duplicate = await exchangeDesktopToken(store, crypto, {
    code: callback.code,
    codeVerifier: req.verifier,
    redirectUri: req.redirectUri,
    nonce: req.nonce,
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error, "invalid_grant");
});

await test("gaid:// redirect round-trip", async () => {
  const store = new MemoryDesktopAuthStore();
  const crypto = createDesktopAuthCrypto("test-desktop-auth-token-key");
  const req = sampleRequest(DESKTOP_GAID_REDIRECT_URI);
  const authorized = await authorizeDesktop(store, crypto, {
    ...req,
    userId: "user-1",
    accessToken: "gaid-access",
    refreshToken: "gaid-refresh",
  });
  assert.equal(authorized.ok, true);
  if (!authorized.ok) return;
  const callback = parseDesktopAuthCallback(authorized.redirect);
  assert.equal(callback.ok, true);
  if (!callback.ok || !callback.code) throw new Error("expected code");
  const exchanged = await exchangeDesktopToken(store, crypto, {
    code: callback.code,
    codeVerifier: req.verifier,
    redirectUri: DESKTOP_GAID_REDIRECT_URI,
    nonce: req.nonce,
  });
  assert.equal(exchanged.ok, true);
  if (exchanged.ok) assert.equal(exchanged.access_token, "gaid-access");
});

await test("cancel, expiry, wrong verifier, wrong nonce, and wrong state", async () => {
  const store = new MemoryDesktopAuthStore();
  const crypto = createDesktopAuthCrypto("test-desktop-auth-token-key");
  const req = sampleRequest();
  const cancelled = cancelDesktopRedirect(req.redirectUri, req.state);
  assert.equal(cancelled.ok, true);
  if (cancelled.ok) {
    const parsed = parseDesktopAuthCallback(cancelled.redirect);
    assert.equal(parsed.ok, true);
    if (parsed.ok && parsed.error) assert.equal(parsed.error, "access_denied");
  }

  const t0 = 1_000_000;
  const authorized = await authorizeDesktop(
    store,
    crypto,
    {
      ...req,
      userId: "user-1",
      accessToken: "access-local",
      refreshToken: "refresh-local",
    },
    t0
  );
  assert.equal(authorized.ok, true);
  if (!authorized.ok) return;
  const callback = parseDesktopAuthCallback(authorized.redirect);
  if (!callback.ok || !callback.code) throw new Error("expected code");

  const wrongVerifier = await exchangeDesktopToken(
    store,
    crypto,
    {
      code: callback.code,
      codeVerifier: randomBytes(32).toString("base64url"),
      redirectUri: req.redirectUri,
      nonce: req.nonce,
    },
    t0
  );
  assert.equal(wrongVerifier.ok, false);
  if (!wrongVerifier.ok) assert.equal(wrongVerifier.error, "invalid_grant");

  const wrongNonce = await exchangeDesktopToken(
    store,
    crypto,
    {
      code: callback.code,
      codeVerifier: req.verifier,
      redirectUri: req.redirectUri,
      nonce: randomBytes(24).toString("base64url"),
    },
    t0
  );
  assert.equal(wrongNonce.ok, false);
  if (!wrongNonce.ok) assert.equal(wrongNonce.error, "invalid_grant");

  const expired = await exchangeDesktopToken(
    store,
    crypto,
    {
      code: callback.code,
      codeVerifier: req.verifier,
      redirectUri: req.redirectUri,
      nonce: req.nonce,
    },
    t0 + DESKTOP_AUTH_TTL_MS + 1
  );
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.error, "invalid_grant");
});

await test("Electron loopback controller exchanges code locally without tokens in the browser URL", async () => {
  let opened = "";
  let session: { access_token: string; refresh_token: string } | null = null;
  let sessionResolve: (value: { access_token: string; refresh_token: string }) => void = () => {};
  const sessionPromise = new Promise<{ access_token: string; refresh_token: string }>((resolve) => {
    sessionResolve = resolve;
  });
  const controller = electronAuth.createPublicLoginController({
    isPackaged: false,
    envValue: "http://127.0.0.1:3010",
    openExternal: async (url: string) => {
      opened = url;
    },
    fetchImpl: async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { code: string; code_verifier: string; redirect_uri: string };
      assert.ok(body.code_verifier);
      assert.ok(body.redirect_uri.startsWith("http://127.0.0.1:"));
      assert.equal(body.code, "the-code");
      return {
        ok: true,
        json: async () => ({ access_token: "at", refresh_token: "rt" }),
      };
    },
    onSession: (value: { access_token: string; refresh_token: string }) => {
      session = value;
      sessionResolve(value);
    },
    onError: (error: { code: string; message: string }) => {
      throw new Error(`unexpected error: ${error.code} ${error.message}`);
    },
  });
  const started = await controller.start("login");
  assert.equal(started.started, true);
  assert.equal("browserUrl" in started, false);
  assert.equal("redirectUri" in started, false);
  assert.equal(opened.includes("access_token"), false);
  assert.match(opened, /^http:\/\/127\.0\.0\.1:3010\/auth\/desktop\?/);
  const browser = new URL(opened);
  const redirectUri = browser.searchParams.get("redirect_uri") || "";
  const state = browser.searchParams.get("state") || "";
  const response = await fetch(`${redirectUri}?code=the-code&state=${encodeURIComponent(state)}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("access_token"), false);
  session = await Promise.race([
    sessionPromise,
    new Promise<{ access_token: string; refresh_token: string }>((_, reject) => {
      setTimeout(() => reject(new Error("timed out waiting for token exchange")), 2000);
    }),
  ]);
  assert.deepEqual(session, { access_token: "at", refresh_token: "rt" });
  await controller.cancel();
});

await test("Electron packaged gaid:// callback ignores wrong state and token URLs", async () => {
  let fetchCount = 0;
  let error: { code: string } | null = null;
  const controller = electronAuth.createPublicLoginController({
    isPackaged: true,
    envValue: "http://127.0.0.1:3010",
    openExternal: async () => {},
    fetchImpl: async () => {
      fetchCount += 1;
      return { ok: true, json: async () => ({ access_token: "at", refresh_token: "rt" }) };
    },
    onSession: () => {},
    onError: (value: { code: string }) => {
      error = value;
    },
  });
  const started = await controller.start("login");
  assert.equal(started.started, true);
  assert.equal("browserUrl" in started, false);
  assert.equal("redirectUri" in started, false);
  await controller.handleIncomingUrl("gaid://auth/callback?code=stolen&state=other-state");
  assert.equal(fetchCount, 0);
  await controller.handleIncomingUrl("gaid://auth/callback?access_token=tok&refresh_token=r");
  assert.equal(fetchCount, 0);
  assert.equal(error?.code, "invalid_callback");
  await controller.cancel();
});

await test("packaged controller without GAID_AUTH_BASE_URL stays unconfigured", async () => {
  const controller = electronAuth.createPublicLoginController({
    isPackaged: true,
    envValue: "",
    localDevOrigin: "http://127.0.0.1:3000",
    openExternal: async () => {
      throw new Error("should not open a browser");
    },
    onSession: () => {},
    onError: () => {},
  });
  assert.equal(controller.isConfigured(), false);
  const started = await controller.start("login");
  assert.equal(started.started, false);
  assert.equal(started.reason, "not_configured");
});

await test("source scan: handoff paths no longer put tokens in URLs", () => {
  const files = [
    "src/lib/desktop.ts",
    "src/app/auth/desktop/page.tsx",
    "src/app/auth/desktop/confirm/page.tsx",
    "src/app/auth/desktop/done/page.tsx",
    "src/components/shared/desktop-session.tsx",
    "electron/main.js",
    "electron/preload.js",
  ];
  for (const rel of files) {
    const text = read(rel);
    assert.equal(text.includes("desktopHandoffUrl"), false, rel);
    assert.equal(text.includes("parseGaidAuthUrl"), false, rel);
    assert.equal(text.includes("__gaid/auth"), false, rel);
    assert.equal(text.includes("getPendingAuthUrl"), false, rel);
  }
  assert.equal(read("src/lib/desktop.ts").includes("access_token"), false);
  assert.equal(read("src/app/auth/desktop/confirm/page.tsx").includes("access_token"), false);
  assert.equal(read("src/app/auth/desktop/done/page.tsx").includes("access_token"), false);
  assert.match(read("src/app/auth/desktop/confirm/page.tsx"), /callbackRedirectMatchesAttempt/);
  assert.match(read("electron/main.js"), /GAID_AUTH_BASE_URL/);
  assert.match(read("electron/main.js"), /isAllowedDesktopAuthIpc/);
  assert.match(read("electron/main.js"), /redactSensitiveText/);
  assert.match(read("electron/main.js"), /pendingAuthSession\.take/);
  assert.match(read("supabase-schema.sql"), /desktop_auth_codes/);
  assert.match(read("supabase-schema.sql"), /force row level security/i);
  assert.match(read("supabase-schema.sql"), /revoke all on table public\.desktop_auth_codes/i);
  assert.match(read("src/lib/desktop-auth/server.ts"), /import "server-only"/);
  assert.match(read("src/lib/desktop-auth/runtime.ts"), /import "server-only"/);
  assert.match(read("src/lib/desktop-auth/supabase-store.ts"), /import "server-only"/);
  assert.match(read("src/app/signin/page.tsx"), /Online sign-in is not configured yet|PublicLoginUnconfiguredNotice/);
});

await test("confirm page only follows the exact validated redirect URI", () => {
  const loopback = "http://127.0.0.1:47822/auth/callback";
  const ok = buildCallbackRedirect(loopback, { code: "abc", state: "xyzxyzxyzxyzxyzxyz" });
  assert.equal(callbackRedirectMatchesAttempt(ok, loopback, "xyzxyzxyzxyzxyzxyz"), true);
  assert.equal(
    callbackRedirectMatchesAttempt(
      buildCallbackRedirect("http://127.0.0.1:9/auth/callback", { code: "abc", state: "xyzxyzxyzxyzxyzxyz" }),
      loopback,
      "xyzxyzxyzxyzxyzxyz"
    ),
    false
  );
  assert.equal(callbackRedirectMatchesAttempt(ok, loopback, "other-state"), false);
  assert.equal(
    callbackRedirectMatchesAttempt(`gaid://auth/callback?code=abc&state=xyzxyzxyzxyzxyzxyz`, loopback, "xyzxyzxyzxyzxyzxyz"),
    false
  );
});

await test("exchange failures collapse to invalid_grant", async () => {
  const store = new MemoryDesktopAuthStore();
  const crypto = createDesktopAuthCrypto("test-desktop-auth-token-key");
  const missing = await exchangeDesktopToken(store, crypto, {
    code: "",
    codeVerifier: "x",
    redirectUri: "http://127.0.0.1:1/auth/callback",
    nonce: "y",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, "invalid_grant");
});

await test("in-memory limiter allows a burst then 429; production fail-closes", () => {
  const limiter = new MemoryDesktopAuthLimiter(1000, 3, () => 1_000);
  assert.equal(limiter.allow("10.0.0.1").allowed, true);
  assert.equal(limiter.allow("10.0.0.1").allowed, true);
  assert.equal(limiter.allow("10.0.0.1").allowed, true);
  const denied = limiter.allow("10.0.0.1");
  assert.equal(denied.allowed, false);
  if (!denied.allowed) assert.equal(denied.status, 429);
  assert.equal(limiter.allow("10.0.0.2").allowed, true);
  const production = resolveDesktopAuthLimiter({ nodeEnv: "production" }).allow("10.0.0.1");
  assert.equal(production.allowed, false);
  if (!production.allowed) {
    assert.equal(production.status, 503);
    assert.equal("error" in production && production.error, "rate_limit_unavailable");
  }
  const development = resolveDesktopAuthLimiter({ nodeEnv: "development" }).allow("unique-dev-key");
  assert.equal(development.allowed, true);
});

await test("Electron IPC sender validation and one-time pending session retrieval", () => {
  const win = { id: 1, isDestroyed: () => false };
  const other = { id: 2, isDestroyed: () => false };
  const sender = { isDestroyed: () => false, getURL: () => "http://localhost:47821/signin" };
  const allowed = electronAuth.isAllowedDesktopAuthIpcSender(
    { sender, senderFrame: { url: "http://localhost:47821/workspace" } },
    {
      windows: [win],
      fromWebContents: () => win,
      localOrigin: "http://localhost:47821",
    }
  );
  assert.equal(allowed, true);

  const wrongWindow = electronAuth.isAllowedDesktopAuthIpcSender(
    { sender, senderFrame: { url: "http://localhost:47821/workspace" } },
    {
      windows: [win],
      fromWebContents: () => other,
      localOrigin: "http://localhost:47821",
    }
  );
  assert.equal(wrongWindow, false);

  const wrongOrigin = electronAuth.isAllowedDesktopAuthIpcSender(
    { sender, senderFrame: { url: "https://evil.example/steal" } },
    {
      windows: [win],
      fromWebContents: () => win,
      localOrigin: "http://localhost:47821",
    }
  );
  assert.equal(wrongOrigin, false);

  const missing = electronAuth.isAllowedDesktopAuthIpcSender(null, {
    windows: [win],
    fromWebContents: () => win,
    localOrigin: "http://localhost:47821",
  });
  assert.equal(missing, false);

  const holder = electronAuth.createPendingSessionHolder();
  holder.set({ access_token: "at", refresh_token: "rt" });
  assert.deepEqual(holder.peek(), { access_token: "at", refresh_token: "rt" });
  assert.deepEqual(holder.take(), { access_token: "at", refresh_token: "rt" });
  assert.equal(holder.take(), null);
  assert.equal(holder.peek(), null);
});

await test("callback and log redaction strips codes, state, nonce, and error descriptions", () => {
  const raw =
    "gaid://auth/callback?code=secret-code&state=secret-state&error_description=user%20cancelled";
  const redacted = electronAuth.redactSensitiveText(raw);
  assert.equal(redacted.includes("secret-code"), false);
  assert.equal(redacted.includes("secret-state"), false);
  assert.equal(redacted.includes("user cancelled"), false);
  assert.equal(redacted.includes("[redacted]"), true);
  const login =
    "http://127.0.0.1:3010/auth/desktop?code_challenge=abc&state=st&nonce=nn&redirect_uri=http://127.0.0.1:9/auth/callback";
  const redactedLogin = electronAuth.redactSensitiveText(login);
  assert.equal(redactedLogin.includes("code_challenge=abc"), false);
  assert.equal(redactedLogin.includes("state=st"), false);
  assert.equal(redactedLogin.includes("nonce=nn"), false);
  const main = read("electron/main.js");
  assert.match(main, /redactSensitiveText/);
  assert.match(main, /console\.log\(text\)/);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
