import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
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
} from "./index.ts";

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

await test("PKCE S256 matches Node crypto base64url(SHA-256)", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(pkceS256Challenge(verifier), expected);
});

await test("redirect URI allowlist accepts gaid and loopback only", () => {
  assert.equal(isAllowedRedirectUri(DESKTOP_GAID_REDIRECT_URI), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:8765/auth/callback"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:8765/auth/callback"), true);
  assert.equal(isAllowedRedirectUri("http://192.168.1.9:8765/auth/callback"), false);
  assert.equal(isAllowedRedirectUri("https://example.test/auth/callback"), false);
  assert.equal(isAllowedRedirectUri("gaid://auth/callback?code=abc"), false);
});

await test("callback parser rejects tokens and extra keys", () => {
  const loopback = parseDesktopAuthCallback("http://127.0.0.1:8765/auth/callback?code=abc&state=xyz");
  assert.equal(loopback.ok, true);
  assert.equal(parseDesktopAuthCallback("gaid://auth/callback?access_token=tok&refresh_token=r").ok, false);
  assert.equal(callbackContainsSecrets("gaid://auth/callback?access_token=secret"), true);
});

await test("callback builder and confirm binding stay on the stored redirect", () => {
  const loopback = "http://127.0.0.1:47822/auth/callback";
  const ok = buildCallbackRedirect(loopback, { code: "abc", state: "xyzxyzxyzxyzxyzxyz" });
  assert.equal(ok.includes("access_token"), false);
  assert.equal(callbackRedirectMatchesAttempt(ok, loopback, "xyzxyzxyzxyzxyzxyz"), true);
  assert.equal(callbackRedirectMatchesAttempt(ok, loopback, "other-state"), false);
});

await test("packaged auth base URL is required and not a baked-in hostname", () => {
  assert.equal(resolveAuthBaseUrl({ isPackaged: true, envValue: "", localDevOrigin: "http://127.0.0.1:3000" }), "");
  assert.equal(resolveAuthBaseUrl({ isPackaged: false, envValue: "", localDevOrigin: "http://127.0.0.1:3000" }), "http://127.0.0.1:3000");
  assert.equal(isAllowedAuthBaseUrl("https://example.test"), true);
  assert.equal(isAllowedAuthBaseUrl("http://10.0.0.2"), false);
  const req = {
    clientId: "gaid-desktop",
    codeChallenge: "a".repeat(43),
    codeChallengeMethod: "S256" as const,
    state: "b".repeat(16),
    nonce: "c".repeat(16),
    redirectUri: DESKTOP_GAID_REDIRECT_URI,
  };
  const url = buildBrowserAuthUrl("http://127.0.0.1:3000", req, "login");
  assert.equal(new URL(url).pathname, "/auth/desktop");
  assert.ok(readDesktopAuthRequest(new URL(url).searchParams));
  assert.equal(url.includes("access_token"), false);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
