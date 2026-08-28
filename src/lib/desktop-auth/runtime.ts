import { isUsableSupabaseConfig } from "../supabase/config.ts";
import { createDesktopAuthCrypto, desktopAuthTokenKey, type DesktopAuthCrypto } from "./crypto.ts";
import { createSupabaseDesktopAuthStore } from "./supabase-store.ts";
import { getMemoryDesktopAuthStore, type DesktopAuthStore } from "./store.ts";

export function desktopAuthStoreConfigured(): boolean {
  if ((process.env.GAID_DESKTOP_AUTH_STORE ?? "").trim() === "memory") {
    return Boolean(desktopAuthTokenKey() || process.env.NODE_ENV !== "production");
  }
  return Boolean(
    isUsableSupabaseConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) &&
      desktopAuthTokenKey()
  );
}

export function getDesktopAuthRuntime(): { store: DesktopAuthStore; crypto: DesktopAuthCrypto } {
  const envKey = desktopAuthTokenKey();
  const useMemory = (process.env.GAID_DESKTOP_AUTH_STORE ?? "").trim() === "memory";
  const secret =
    envKey ||
    (useMemory && process.env.NODE_ENV !== "production" ? "dev-only-desktop-auth-memory-key" : "");
  const crypto = createDesktopAuthCrypto(secret);
  const store = useMemory ? getMemoryDesktopAuthStore() : createSupabaseDesktopAuthStore();
  return { store, crypto };
}
