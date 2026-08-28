import {
  DESKTOP_AUTH_TTL_MS,
  DESKTOP_CODE_CHALLENGE_METHOD,
  buildCallbackRedirect,
  validateAuthorizeInput,
} from "./contract.ts";
import type { DesktopAuthCrypto } from "./crypto.ts";
import type { DesktopAuthStore } from "./store.ts";

export type AuthorizeDesktopInput = {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  nonce: string;
  redirectUri: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
};

export type AuthorizeDesktopResult =
  | { ok: true; redirect: string }
  | { ok: false; error: string; status: number };

export type ExchangeDesktopInput = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  nonce: string;
};

export type ExchangeDesktopResult =
  | { ok: true; access_token: string; refresh_token: string; token_type: "bearer" }
  | { ok: false; error: string; status: number };

export async function authorizeDesktop(
  store: DesktopAuthStore,
  crypto: DesktopAuthCrypto,
  input: AuthorizeDesktopInput,
  now = Date.now()
): Promise<AuthorizeDesktopResult> {
  const invalid = validateAuthorizeInput(input);
  if (invalid) return { ok: false, error: invalid, status: 400 };
  if (!input.userId || !input.accessToken || !input.refreshToken) {
    return { ok: false, error: "unauthorized", status: 401 };
  }

  const code = crypto.randomCode();
  const record = {
    codeHash: crypto.hash(code),
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: DESKTOP_CODE_CHALLENGE_METHOD,
    stateHash: crypto.hash(input.state),
    nonceHash: crypto.hash(input.nonce),
    redirectUri: input.redirectUri,
    userId: input.userId,
    accessTokenEnc: crypto.encrypt(input.accessToken),
    refreshTokenEnc: crypto.encrypt(input.refreshToken),
    expiresAt: now + DESKTOP_AUTH_TTL_MS,
    usedAt: null,
    createdAt: now,
  };

  try {
    await store.insert(record);
  } catch {
    return { ok: false, error: "server_error", status: 500 };
  }

  return {
    ok: true,
    redirect: buildCallbackRedirect(input.redirectUri, { code, state: input.state }),
  };
}

export async function exchangeDesktopToken(
  store: DesktopAuthStore,
  crypto: DesktopAuthCrypto,
  input: ExchangeDesktopInput,
  now = Date.now()
): Promise<ExchangeDesktopResult> {
  if (!input.code || !input.codeVerifier || !input.redirectUri || !input.nonce) {
    return { ok: false, error: "invalid_request", status: 400 };
  }

  const codeHash = crypto.hash(input.code);
  let record;
  try {
    record = await store.get(codeHash);
  } catch {
    return { ok: false, error: "server_error", status: 500 };
  }

  if (!record) return { ok: false, error: "invalid_grant", status: 400 };
  if (record.usedAt != null) return { ok: false, error: "already_used", status: 400 };
  if (record.expiresAt <= now) return { ok: false, error: "expired", status: 400 };

  const challenge = crypto.pkceChallenge(input.codeVerifier);
  if (challenge !== record.codeChallenge) {
    return { ok: false, error: "invalid_grant", status: 400 };
  }
  if (crypto.hash(input.nonce) !== record.nonceHash) {
    return { ok: false, error: "invalid_grant", status: 400 };
  }
  if (input.redirectUri !== record.redirectUri) {
    return { ok: false, error: "invalid_grant", status: 400 };
  }

  let consumed;
  try {
    consumed = await store.consume(codeHash, now);
  } catch {
    return { ok: false, error: "server_error", status: 500 };
  }
  if (consumed.status === "already_used") {
    return { ok: false, error: "already_used", status: 400 };
  }
  if (consumed.status !== "ok") {
    return { ok: false, error: consumed.status === "expired" ? "expired" : "invalid_grant", status: 400 };
  }

  try {
    return {
      ok: true,
      access_token: crypto.decrypt(consumed.record.accessTokenEnc),
      refresh_token: crypto.decrypt(consumed.record.refreshTokenEnc),
      token_type: "bearer",
    };
  } catch {
    return { ok: false, error: "server_error", status: 500 };
  }
}

export function cancelDesktopRedirect(redirectUri: string, state: string): AuthorizeDesktopResult {
  try {
    return {
      ok: true,
      redirect: buildCallbackRedirect(redirectUri, {
        error: "access_denied",
        state,
        errorDescription: "The user cancelled sign-in.",
      }),
    };
  } catch {
    return { ok: false, error: "invalid_redirect_uri", status: 400 };
  }
}
