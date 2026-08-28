import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  DESKTOP_CLIENT_ID,
  DESKTOP_CODE_CHALLENGE_METHOD,
  DESKTOP_GAID_REDIRECT_URI,
  buildBrowserAuthUrl,
  callbackContainsSecrets,
  isAllowedRedirectUri,
  parseDesktopAuthCallback,
  pkceS256Challenge,
  resolveAuthBaseUrl,
} from "@g-aid/auth-contract";

const require = createRequire(import.meta.url);
const electronAuth = require("../../electron/desktop-auth.js");

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

await test("PKCE S256 matches Node crypto and Electron", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(pkceS256Challenge(verifier), expected);
  assert.equal(electronAuth.pkceS256Challenge(verifier), expected);
});

await test("Electron redirect allowlist matches the shared contract", () => {
  assert.equal(isAllowedRedirectUri(DESKTOP_GAID_REDIRECT_URI), true);
  assert.equal(electronAuth.isAllowedRedirectUri("http://127.0.0.1:8765/auth/callback"), true);
  assert.equal(electronAuth.isAllowedRedirectUri("https://example.test/auth/callback"), false);
});

await test("packaged Electron stays unconfigured without GAID_AUTH_BASE_URL", () => {
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
    electronAuth.resolveAuthBaseUrl({
      isPackaged: false,
      envValue: "",
      localDevOrigin: "",
    }),
    ""
  );
  assert.equal(read("electron/desktop-auth.js").includes("g-aid.io"), false);
  assert.equal(read("electron/main.js").includes("g-aid.io"), false);
  assert.match(read("electron/main.js"), /getLocalDevOrigin: \(\) => ""/);
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

await test("Electron IPC sender validation and one-time pending session retrieval", () => {
  const win = { id: 1, isDestroyed: () => false };
  const other = { id: 2, isDestroyed: () => false };
  const sender = { isDestroyed: () => false, getURL: () => "http://localhost:47821/signin" };
  assert.equal(
    electronAuth.isAllowedDesktopAuthIpcSender(
      { sender, senderFrame: { url: "http://localhost:47821/workspace" } },
      { windows: [win], fromWebContents: () => win, localOrigin: "http://localhost:47821" }
    ),
    true
  );
  assert.equal(
    electronAuth.isAllowedDesktopAuthIpcSender(
      { sender, senderFrame: { url: "http://localhost:47821/workspace" } },
      { windows: [win], fromWebContents: () => other, localOrigin: "http://localhost:47821" }
    ),
    false
  );
  assert.equal(
    electronAuth.isAllowedDesktopAuthIpcSender(
      { sender, senderFrame: { url: "https://evil.example/steal" } },
      { windows: [win], fromWebContents: () => win, localOrigin: "http://localhost:47821" }
    ),
    false
  );
  const holder = electronAuth.createPendingSessionHolder();
  holder.set({ access_token: "at", refresh_token: "rt" });
  assert.deepEqual(holder.take(), { access_token: "at", refresh_token: "rt" });
  assert.equal(holder.take(), null);
});

await test("callback and log redaction strips codes, state, nonce, and error descriptions", () => {
  const raw = "gaid://auth/callback?code=secret-code&state=secret-state&error_description=user%20cancelled";
  const redacted = electronAuth.redactSensitiveText(raw);
  assert.equal(redacted.includes("secret-code"), false);
  assert.equal(redacted.includes("secret-state"), false);
  assert.equal(redacted.includes("[redacted]"), true);
  const main = read("electron/main.js");
  assert.match(main, /redactSensitiveText/);
  assert.match(main, /console\.log\(text\)/);
  assert.equal(callbackContainsSecrets("http://127.0.0.1:1/auth/callback?access_token=x"), true);
  assert.equal(parseDesktopAuthCallback("javascript:alert(1)").ok, false);
  const pkce = pkcePair();
  const url = buildBrowserAuthUrl("http://127.0.0.1:3010", {
    clientId: DESKTOP_CLIENT_ID,
    codeChallenge: pkce.challenge,
    codeChallengeMethod: DESKTOP_CODE_CHALLENGE_METHOD,
    state: randomBytes(24).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
    redirectUri: "http://127.0.0.1:9/auth/callback",
  });
  assert.equal(url.includes("access_token"), false);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
