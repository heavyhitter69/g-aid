export function isDesktop(): boolean {
  return typeof window !== "undefined" && Boolean(window.gaidDesktop?.isDesktop);
}

export function isDesktopHandoff(
  searchParams: URLSearchParams | { get: (key: string) => string | null }
): boolean {
  return searchParams.get("desktop") === "1";
}
