/**
 * Desktop public-login contract (authorization code + PKCE).
 * Client-safe: no node:crypto, no tokens in URLs.
 */

import { sha256Utf8Hex } from "../sha256.ts";

export const DESKTOP_CLIENT_ID = "gaid-desktop";
export const DESKTOP_CODE_CHALLENGE_METHOD = "S256";
export const DESKTOP_CALLBACK_PATH = "/auth/callback";
export const DESKTOP_GAID_REDIRECT_URI = "gaid://auth/callback";
export const DESKTOP_AUTH_TTL_MS = 120_000;
export const DESKTOP_AUTH_QUERY_KEYS = [
  "client_id",
  "code_challenge",
  "code_challenge_method",
  "state",
  "nonce",
  "redirect_uri",
] as const;

const CALLBACK_QUERY_KEYS = new Set(["code", "state", "error", "error_description"]);
const TOKEN_NAME = /access_token|refresh_token|id_token/i;

export type DesktopAuthRequest = {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: typeof DESKTOP_CODE_CHALLENGE_METHOD;
  state: string;
  nonce: string;
  redirectUri: string;
};

export type DesktopAuthCallback =
  | { ok: true; code: string; state: string; error?: undefined }
  | { ok: true; error: string; errorDescription?: string; state: string; code?: undefined }
  | { ok: false; reason: string };

export function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa !== "function") {
    throw new Error("base64 encoding is unavailable");
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function pkceS256Challenge(verifier: string): string {
  return base64UrlFromBytes(hexToBytes(sha256Utf8Hex(verifier)));
}

export function sha256Hex(value: string): string {
  return sha256Utf8Hex(value);
}

function looksLikeBase64Url(value: string, minLen: number): boolean {
  return value.length >= minLen && /^[A-Za-z0-9_-]+$/.test(value);
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}

export function isAllowedAuthBaseUrl(value: string): boolean {
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

export function resolveAuthBaseUrl(options: {
  isPackaged: boolean;
  envValue?: string | null;
  localDevOrigin?: string | null;
}): string {
  const envValue = (options.envValue ?? "").trim().replace(/\/+$/, "");
  if (envValue) return isAllowedAuthBaseUrl(envValue) ? envValue : "";
  if (!options.isPackaged) {
    const local = (options.localDevOrigin ?? "").trim().replace(/\/+$/, "");
    if (local && isAllowedAuthBaseUrl(local)) return local;
  }
  return "";
}

export function isAllowedRedirectUri(value: string): boolean {
  if (!value || TOKEN_NAME.test(value)) return false;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return false;
    if (parsed.hash && parsed.hash !== "#") return false;
    if ([...parsed.searchParams.keys()].length > 0) return false;

    if (parsed.protocol === "gaid:") {
      return (
        parsed.hostname.toLowerCase() === "auth" &&
        normalizePath(parsed.pathname) === "/callback"
      );
    }

    if (parsed.protocol !== "http:") return false;
    if (!isLoopbackHostname(parsed.hostname)) return false;
    if (!parsed.port) return false;
    const port = Number(parsed.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
    return normalizePath(parsed.pathname) === DESKTOP_CALLBACK_PATH;
  } catch {
    return false;
  }
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

export function parseDesktopAuthCallback(url: string): DesktopAuthCallback {
  if (!url || TOKEN_NAME.test(url)) {
    return { ok: false, reason: "tokens_in_url" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  const redirectBase = `${parsed.protocol}//${parsed.host}${normalizePath(parsed.pathname)}`;
  const gaidBase = parsed.protocol === "gaid:" ? `gaid://${parsed.hostname}${normalizePath(parsed.pathname)}` : "";
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

  const state = parsed.searchParams.get("state") ?? "";
  if (!state) return { ok: false, reason: "missing_state" };

  const error = parsed.searchParams.get("error");
  if (error) {
    return {
      ok: true,
      error,
      errorDescription: parsed.searchParams.get("error_description") ?? undefined,
      state,
    };
  }

  const code = parsed.searchParams.get("code") ?? "";
  if (!code) return { ok: false, reason: "missing_code" };
  return { ok: true, code, state };
}

export function buildCallbackRedirect(
  redirectUri: string,
  params: { code: string; state: string } | { error: string; state: string; errorDescription?: string }
): string {
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new Error("redirect_not_allowed");
  }
  const url = new URL(redirectUri);
  if ("code" in params) {
    url.searchParams.set("code", params.code);
    url.searchParams.set("state", params.state);
  } else {
    url.searchParams.set("error", params.error);
    url.searchParams.set("state", params.state);
    if (params.errorDescription) {
      url.searchParams.set("error_description", params.errorDescription);
    }
  }
  const result = url.toString();
  if (TOKEN_NAME.test(result)) {
    throw new Error("tokens_in_url");
  }
  return result;
}

export function readDesktopAuthRequest(
  searchParams: URLSearchParams | { get: (key: string) => string | null }
): DesktopAuthRequest | null {
  const clientId = searchParams.get("client_id") ?? "";
  const codeChallenge = searchParams.get("code_challenge") ?? "";
  const method = searchParams.get("code_challenge_method") ?? "";
  const state = searchParams.get("state") ?? "";
  const nonce = searchParams.get("nonce") ?? "";
  const redirectUri = searchParams.get("redirect_uri") ?? "";
  if (clientId !== DESKTOP_CLIENT_ID) return null;
  if (method !== DESKTOP_CODE_CHALLENGE_METHOD) return null;
  if (!looksLikeBase64Url(codeChallenge, 43)) return null;
  if (!looksLikeBase64Url(state, 16)) return null;
  if (!looksLikeBase64Url(nonce, 16)) return null;
  if (!isAllowedRedirectUri(redirectUri)) return null;
  return {
    clientId,
    codeChallenge,
    codeChallengeMethod: DESKTOP_CODE_CHALLENGE_METHOD,
    state,
    nonce,
    redirectUri,
  };
}

export function desktopAuthRequestQuery(
  request: DesktopAuthRequest,
  extra?: Record<string, string>
): string {
  const params = new URLSearchParams();
  params.set("client_id", request.clientId);
  params.set("code_challenge", request.codeChallenge);
  params.set("code_challenge_method", request.codeChallengeMethod);
  params.set("state", request.state);
  params.set("nonce", request.nonce);
  params.set("redirect_uri", request.redirectUri);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  return params.toString();
}

export function buildBrowserAuthUrl(
  authBaseUrl: string,
  request: DesktopAuthRequest,
  mode: "login" | "signup" = "login"
): string {
  const base = authBaseUrl.replace(/\/+$/, "");
  if (!isAllowedAuthBaseUrl(base)) {
    throw new Error("auth_base_not_allowed");
  }
  if (mode === "signup") {
    return `${base}/signup?desktop=1&${desktopAuthRequestQuery(request)}`;
  }
  return `${base}/auth/desktop?mode=login&${desktopAuthRequestQuery(request)}`;
}

export function validateAuthorizeInput(input: {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  nonce: string;
  redirectUri: string;
}): string | null {
  if (input.clientId !== DESKTOP_CLIENT_ID) return "invalid_client";
  if (input.codeChallengeMethod !== DESKTOP_CODE_CHALLENGE_METHOD) return "invalid_request";
  if (!looksLikeBase64Url(input.codeChallenge, 43)) return "invalid_request";
  if (!looksLikeBase64Url(input.state, 16)) return "invalid_request";
  if (!looksLikeBase64Url(input.nonce, 16)) return "invalid_request";
  if (!isAllowedRedirectUri(input.redirectUri)) return "invalid_redirect_uri";
  return null;
}

export function callbackContainsSecrets(url: string): boolean {
  return TOKEN_NAME.test(url);
}

export function withDesktopAuthQuery(
  path: string,
  request: DesktopAuthRequest | null,
  extra?: Record<string, string>
): string {
  const question = path.indexOf("?");
  const base = question >= 0 ? path.slice(0, question) : path;
  const params = new URLSearchParams(question >= 0 ? path.slice(question + 1) : "");
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  if (request) {
    const fromRequest = new URLSearchParams(desktopAuthRequestQuery(request));
    for (const [key, value] of fromRequest.entries()) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
