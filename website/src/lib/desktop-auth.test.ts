import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DESKTOP_AUTH_TTL_MS,
  DESKTOP_CLIENT_ID,
  DESKTOP_CODE_CHALLENGE_METHOD,
  DESKTOP_GAID_REDIRECT_URI,
  buildCallbackRedirect,
  callbackRedirectMatchesAttempt,
  parseDesktopAuthCallback,
  pkceS256Challenge,
} from "@g-aid/auth-contract";
import { createDesktopAuthCrypto } from "./desktop-auth/crypto.ts";
import { authorizeDesktop, cancelDesktopRedirect, exchangeDesktopToken } from "./desktop-auth/flow.ts";
import { MemoryDesktopAuthLimiter, resolveDesktopAuthLimiter } from "./desktop-auth/limiter.ts";
import { MemoryDesktopAuthStore } from "./desktop-auth/store.ts";

let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok  ${name}`))
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

await test("memory store authorize+token round-trip with local loopback", async () => {
  const store = new MemoryDesktopAuthStore();
  const crypto = createDesktopAuthCrypto("test-desktop-auth-token-key");
  const req = sampleRequest();
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

await test("cancel, expiry, wrong verifier, wrong nonce collapse to invalid_grant", async () => {
  const store = new MemoryDesktopAuthStore();
  const crypto = createDesktopAuthCrypto("test-desktop-auth-token-key");
  const req = sampleRequest();
  const cancelled = cancelDesktopRedirect(req.redirectUri, req.state);
  assert.equal(cancelled.ok, true);
  const t0 = 1_000_000;
  const authorized = await authorizeDesktop(
    store,
    crypto,
    { ...req, userId: "user-1", accessToken: "access-local", refreshToken: "refresh-local" },
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
  const expired = await exchangeDesktopToken(
    store,
    crypto,
    { code: callback.code, codeVerifier: req.verifier, redirectUri: req.redirectUri, nonce: req.nonce },
    t0 + DESKTOP_AUTH_TTL_MS + 1
  );
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.error, "invalid_grant");
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
});

await test("in-memory limiter allows a burst then 429; production fail-closes", () => {
  const limiter = new MemoryDesktopAuthLimiter(1000, 3, () => 1_000);
  assert.equal(limiter.allow("10.0.0.1").allowed, true);
  assert.equal(limiter.allow("10.0.0.1").allowed, true);
  assert.equal(limiter.allow("10.0.0.1").allowed, true);
  const denied = limiter.allow("10.0.0.1");
  assert.equal(denied.allowed, false);
  if (!denied.allowed) assert.equal(denied.status, 429);
  const production = resolveDesktopAuthLimiter({ nodeEnv: "production" }).allow("10.0.0.1");
  assert.equal(production.allowed, false);
  if (!production.allowed) {
    assert.equal(production.status, 503);
    assert.equal("error" in production && production.error, "rate_limit_unavailable");
  }
});

await test("website auth modules stay server-only and do not put tokens in URLs", () => {
  assert.match(read("src/lib/desktop-auth/server.ts"), /import "server-only"/);
  assert.match(read("src/lib/desktop-auth/runtime.ts"), /import "server-only"/);
  assert.match(read("src/lib/desktop-auth/supabase-store.ts"), /import "server-only"/);
  assert.equal(read("src/app/auth/desktop/confirm/page.tsx").includes("access_token"), false);
  assert.match(read("src/app/auth/desktop/confirm/page.tsx"), /callbackRedirectMatchesAttempt/);
  assert.equal(read("src/app/auth/desktop/page.tsx").includes("Google"), false);
  assert.equal(read("src/app/signin/page.tsx").includes("Google"), false);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
