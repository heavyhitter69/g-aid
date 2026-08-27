export function isDesktop(): boolean {
  return typeof window !== "undefined" && Boolean(window.gaidDesktop?.isDesktop);
}

export function parseGaidAuthUrl(url: string): {
  access_token: string;
  refresh_token: string;
} | null {
  try {
    const parsed = new URL(url);
    const fromHash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const fromQuery = parsed.searchParams;
    const access_token =
      fromHash.get("access_token") || fromQuery.get("access_token") || "";
    const refresh_token =
      fromHash.get("refresh_token") || fromQuery.get("refresh_token") || "";
    if (!access_token || !refresh_token) return null;
    return { access_token, refresh_token };
  } catch {
    return null;
  }
}

export function desktopHandoffUrl(accessToken: string, refreshToken: string): string {
  const params = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const origin =
    typeof window !== "undefined" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin)
      ? window.location.origin
      : "";
  if (origin) {
    return `${origin}/__gaid/auth?${params.toString()}`;
  }
  return `gaid://auth/callback?${params.toString()}`;
}

export function isDesktopHandoff(searchParams: URLSearchParams | { get: (key: string) => string | null }): boolean {
  return searchParams.get("desktop") === "1";
}
