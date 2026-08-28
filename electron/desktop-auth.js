"use strict";

const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

const CLIENT_ID = "gaid-desktop";
const CALLBACK_PATH = "/auth/callback";
const GAID_REDIRECT_URI = "gaid://auth/callback";
const TTL_MS = 120000;
const CALLBACK_QUERY_KEYS = new Set(["code", "state", "error", "error_description"]);
const TOKEN_NAME = /access_token|refresh_token|id_token/i;

function base64Url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function generatePkce() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = pkceS256Challenge(verifier);
  const state = base64Url(crypto.randomBytes(24));
  const nonce = base64Url(crypto.randomBytes(24));
  return { verifier, challenge, state, nonce };
}

function pkceS256Challenge(verifier) {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

function isLoopbackHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

function isAllowedAuthBaseUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === "https:") return Boolean(parsed.hostname);
    if (parsed.protocol === "http:") return isLoopbackHostname(parsed.hostname);
    return false;
  } catch {
    return false;
  }
}

function resolveAuthBaseUrl(options) {
  const envValue = String((options && options.envValue) || "").trim().replace(/\/+$/, "");
  if (envValue) return isAllowedAuthBaseUrl(envValue) ? envValue : "";
  if (!(options && options.isPackaged)) {
    const local = String((options && options.localDevOrigin) || "").trim().replace(/\/+$/, "");
    if (local && isAllowedAuthBaseUrl(local)) return local;
  }
  return "";
}

function isAllowedRedirectUri(value) {
  if (!value || TOKEN_NAME.test(value)) return false;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return false;
    if (parsed.hash && parsed.hash !== "#") return false;
    if ([...parsed.searchParams.keys()].length > 0) return false;
    if (parsed.protocol === "gaid:") {
      return parsed.hostname.toLowerCase() === "auth" && normalizePath(parsed.pathname) === "/callback";
    }
    if (parsed.protocol !== "http:") return false;
    if (!isLoopbackHostname(parsed.hostname)) return false;
    if (!parsed.port) return false;
    const port = Number(parsed.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
    return normalizePath(parsed.pathname) === CALLBACK_PATH;
  } catch {
    return false;
  }
}

function parseDesktopAuthCallback(url) {
  if (!url || TOKEN_NAME.test(url)) {
    return { ok: false, reason: "tokens_in_url" };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  const redirectBase = `${parsed.protocol}//${parsed.host}${normalizePath(parsed.pathname)}`;
  const gaidBase =
    parsed.protocol === "gaid:" ? `gaid://${parsed.hostname}${normalizePath(parsed.pathname)}` : "";
  if (!isAllowedRedirectUri(redirectBase) && !isAllowedRedirectUri(gaidBase)) {
    return { ok: false, reason: "redirect_not_allowed" };
  }
  if (parsed.hash && parsed.hash !== "#") {
    return { ok: false, reason: "hash_not_allowed" };
  }
  for (const key of parsed.searchParams.keys()) {
    if (!CALLBACK_QUERY_KEYS.has(key)) {
      return { ok: false, reason: "unexpected_query_key" };
    }
  }
  const state = parsed.searchParams.get("state") || "";
  if (!state) return { ok: false, reason: "missing_state" };
  const error = parsed.searchParams.get("error");
  if (error) {
    return {
      ok: true,
      error,
      errorDescription: parsed.searchParams.get("error_description") || undefined,
      state,
    };
  }
  const code = parsed.searchParams.get("code") || "";
  if (!code) return { ok: false, reason: "missing_code" };
  return { ok: true, code, state };
}

function buildBrowserAuthUrl(authBaseUrl, request, mode) {
  const base = String(authBaseUrl || "").replace(/\/+$/, "");
  if (!isAllowedAuthBaseUrl(base)) {
    throw new Error("auth_base_not_allowed");
  }
  const params = new URLSearchParams({
    client_id: request.clientId,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
    state: request.state,
    nonce: request.nonce,
    redirect_uri: request.redirectUri,
  });
  if (mode === "signup") {
    return `${base}/signup?desktop=1&${params.toString()}`;
  }
  return `${base}/auth/desktop?mode=login&${params.toString()}`;
}

function loopbackHtml(title, body) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;background:#0b0b0b;color:#eee;padding:48px;">
  <h1>${title}</h1>
  <p>${body}</p>
</body></html>`;
}

function startLoopbackServer(portHint, onCallback) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const host = req.headers.host || "127.0.0.1";
      const full = `http://${host}${req.url || "/"}`;
      const parsedPath = new URL(full, "http://127.0.0.1").pathname;
      if (normalizePath(parsedPath) !== CALLBACK_PATH) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const parsed = parseDesktopAuthCallback(full);
      const ok = parsed.ok && !parsed.error;
      res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8" });
      res.end(
        loopbackHtml(
          ok ? "Signed in" : parsed.ok && parsed.error === "access_denied" ? "Sign-in cancelled" : "Sign-in could not finish",
          ok
            ? "You can close this window and return to G-AID."
            : "Return to G-AID and try again. This page does not contain account tokens."
        ),
        () => {
          onCallback(full);
        }
      );
    });
    server.once("error", reject);
    server.listen(portHint || 0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && address.port;
      resolve({
        server,
        port,
        redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
        close() {
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

function createPublicLoginController(options) {
  const fetchImpl = options.fetchImpl || fetch;
  const openExternal = options.openExternal;
  const onSession = options.onSession;
  const onError = options.onError;
  let attempt = null;

  function clearTimer() {
    if (attempt && attempt.timer) {
      clearTimeout(attempt.timer);
      attempt.timer = null;
    }
  }

  async function cancel(reason) {
    clearTimer();
    const current = attempt;
    attempt = null;
    if (current && current.loopback) {
      try {
        await current.loopback.close();
      } catch {
        /* ignore */
      }
    }
    if (reason && onError) onError(reason);
  }

  function configuredBase() {
    return resolveAuthBaseUrl({
      isPackaged: Boolean(options.isPackaged),
      envValue: typeof options.getEnvAuthBase === "function" ? options.getEnvAuthBase() : options.envValue,
      localDevOrigin:
        typeof options.getLocalDevOrigin === "function" ? options.getLocalDevOrigin() : options.localDevOrigin,
    });
  }

  async function handleCallback(url) {
    if (!attempt) {
      const parsed = parseDesktopAuthCallback(url);
      if (!parsed.ok && parsed.reason === "tokens_in_url") {
        onError({ code: "invalid_callback", message: "Sign-in callback contained tokens and was ignored." });
      }
      return;
    }
    const parsed = parseDesktopAuthCallback(url);
    if (!parsed.ok) {
      if (parsed.reason === "tokens_in_url") {
        await cancel({
          code: "invalid_callback",
          message: "Sign-in callback contained tokens and was ignored.",
        });
      }
      return;
    }
    if (parsed.state !== attempt.state) {
      return;
    }
    if (parsed.error) {
      await cancel({
        code: parsed.error,
        message: parsed.errorDescription || parsed.error,
      });
      return;
    }

    const current = attempt;
    clearTimer();
    attempt = null;

    try {
      const response = await fetchImpl(`${current.authBaseUrl}/api/auth/desktop/token`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          code: parsed.code,
          code_verifier: current.verifier,
          redirect_uri: current.redirectUri,
          nonce: current.nonce,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token || !data.refresh_token) {
        onError({
          code: data.error || "token_exchange_failed",
          message: "Could not complete sign-in.",
        });
        return;
      }
      onSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
    } catch {
      onError({ code: "token_exchange_failed", message: "Could not complete sign-in." });
    } finally {
      if (current.loopback) {
        try {
          await current.loopback.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  return {
    isConfigured() {
      return Boolean(configuredBase());
    },
    authBaseUrl() {
      return configuredBase();
    },
    async start(mode) {
      await cancel();
      const authBaseUrl = configuredBase();
      if (!authBaseUrl) {
        onError({
          code: "not_configured",
          message: "Online sign-in is not configured yet",
        });
        return { started: false, reason: "not_configured" };
      }

      const pkce = generatePkce();
      let loopback = null;
      let redirectUri = GAID_REDIRECT_URI;
      if (!options.isPackaged) {
        loopback = await startLoopbackServer(0, (url) => {
          void handleCallback(url);
        });
        redirectUri = loopback.redirectUri;
      }

      const request = {
        clientId: CLIENT_ID,
        codeChallenge: pkce.challenge,
        state: pkce.state,
        nonce: pkce.nonce,
        redirectUri,
      };
      const browserUrl = buildBrowserAuthUrl(authBaseUrl, request, mode === "signup" ? "signup" : "login");
      attempt = {
        ...pkce,
        authBaseUrl,
        redirectUri,
        loopback,
        timer: setTimeout(() => {
          void cancel({ code: "expired", message: "Sign-in timed out. Try again from G-AID." });
        }, TTL_MS),
      };
      await openExternal(browserUrl);
      return { started: true, redirectUri, browserUrl };
    },
    cancel,
    handleIncomingUrl(url) {
      return handleCallback(url);
    },
  };
}

module.exports = {
  CLIENT_ID,
  CALLBACK_PATH,
  GAID_REDIRECT_URI,
  TTL_MS,
  generatePkce,
  pkceS256Challenge,
  isAllowedAuthBaseUrl,
  resolveAuthBaseUrl,
  isAllowedRedirectUri,
  parseDesktopAuthCallback,
  buildBrowserAuthUrl,
  startLoopbackServer,
  createPublicLoginController,
};
