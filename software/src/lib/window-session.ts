const SESSION_KEY = "gaid-window-session";

export interface WindowSession {
  workspaceRoot: string | null;
  currentProject: string | null;
}

export function isFreshWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("fresh") === "1";
}

export function conversationFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("conversation");
}

export function readWindowSession(): WindowSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as WindowSession) : null;
  } catch {
    return null;
  }
}

export function writeWindowSession(session: WindowSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore quota */
  }
}
