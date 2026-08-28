import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isUsableSupabaseConfig } from "../supabase/config.ts";
import type { ConsumeResult, DesktopAuthCodeRecord, DesktopAuthStore } from "./store.ts";

type Row = {
  code_hash: string;
  code_challenge: string;
  code_challenge_method: "S256";
  state_hash: string;
  nonce_hash: string;
  redirect_uri: string;
  user_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

function fromRow(row: Row): DesktopAuthCodeRecord {
  return {
    codeHash: row.code_hash,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: row.code_challenge_method,
    stateHash: row.state_hash,
    nonceHash: row.nonce_hash,
    redirectUri: row.redirect_uri,
    userId: row.user_id,
    accessTokenEnc: row.access_token_enc,
    refreshTokenEnc: row.refresh_token_enc,
    expiresAt: Date.parse(row.expires_at),
    usedAt: row.used_at ? Date.parse(row.used_at) : null,
    createdAt: Date.parse(row.created_at),
  };
}

export class SupabaseDesktopAuthStore implements DesktopAuthStore {
  constructor(private readonly client: SupabaseClient) {}

  async get(codeHash: string): Promise<DesktopAuthCodeRecord | null> {
    const { data, error } = await this.client
      .from("desktop_auth_codes")
      .select(
        "code_hash, code_challenge, code_challenge_method, state_hash, nonce_hash, redirect_uri, user_id, access_token_enc, refresh_token_enc, expires_at, used_at, created_at"
      )
      .eq("code_hash", codeHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data as Row) : null;
  }

  async insert(record: DesktopAuthCodeRecord): Promise<void> {
    const { error } = await this.client.from("desktop_auth_codes").insert({
      code_hash: record.codeHash,
      code_challenge: record.codeChallenge,
      code_challenge_method: record.codeChallengeMethod,
      state_hash: record.stateHash,
      nonce_hash: record.nonceHash,
      redirect_uri: record.redirectUri,
      user_id: record.userId,
      access_token_enc: record.accessTokenEnc,
      refresh_token_enc: record.refreshTokenEnc,
      expires_at: new Date(record.expiresAt).toISOString(),
      used_at: record.usedAt ? new Date(record.usedAt).toISOString() : null,
      created_at: new Date(record.createdAt).toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async consume(codeHash: string, now: number): Promise<ConsumeResult> {
    const nowIso = new Date(now).toISOString();
    const { data, error } = await this.client
      .from("desktop_auth_codes")
      .update({ used_at: nowIso })
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .select(
        "code_hash, code_challenge, code_challenge_method, state_hash, nonce_hash, redirect_uri, user_id, access_token_enc, refresh_token_enc, expires_at, used_at, created_at"
      )
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return { status: "ok", record: fromRow(data as Row) };

    const existing = await this.client
      .from("desktop_auth_codes")
      .select(
        "code_hash, code_challenge, code_challenge_method, state_hash, nonce_hash, redirect_uri, user_id, access_token_enc, refresh_token_enc, expires_at, used_at, created_at"
      )
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data) return { status: "missing" };
    const record = fromRow(existing.data as Row);
    if (record.usedAt != null) return { status: "already_used" };
    return { status: "expired", record };
  }
}

export function createSupabaseDesktopAuthStore(): SupabaseDesktopAuthStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isUsableSupabaseConfig(url, serviceKey)) {
    throw new Error("desktop_auth_store_unconfigured");
  }
  const client = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseDesktopAuthStore(client);
}
