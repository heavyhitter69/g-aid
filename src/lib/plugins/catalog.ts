import type { PluginManifest } from "./types";

export const PLUGIN_CATALOG: PluginManifest[] = [
  {
    id: "wikipedia",
    name: "Wikipedia",
    publisher: "Wikimedia",
    version: "1.0.0",
    category: "reference",
    description: "Encyclopedic lookup for holidays, places, and public facts.",
    detail:
      "Uses the Wikipedia search and page-summary APIs. Does not send survey files. Best for names, history, and definitions.",
    match: /[?]|who|what|when|where|which|independence|holiday|capital|president/i,
    defaultEnabled: true,
    network: true,
  },
  {
    id: "web-search",
    name: "Web Search",
    publisher: "DuckDuckGo",
    version: "1.0.0",
    category: "reference",
    description: "Instant answers for general questions when Wikipedia is thin.",
    detail: "DuckDuckGo Instant Answer API only. No survey paths are included in the query.",
    match: /[?]|who|what|when|where|latest|current|this year/i,
    defaultEnabled: true,
    network: true,
  },
  {
    id: "igrf",
    name: "IGRF-13",
    publisher: "IAGA / BGS / G-AID",
    version: "13.0.0",
    category: "magnetics",
    description: "Evaluate IGRF total field, inclination, and declination at a point.",
    detail:
      "Prefers the local G-AID IGRF-13 kernel. If the engine is offline, uses the BGS IGRF web service, then NOAA NCEI. Pass lat/lon or a place name (Accra, Tema, Tamale, …).",
    match: /\bigrf\b|\bwmm\b|declination|inclination|magnetic (field|intensity)|world magnetic/i,
    defaultEnabled: true,
    network: true,
  },
  {
    id: "noaa-wmm",
    name: "NOAA WMM",
    publisher: "NOAA NCEI",
    version: "1.0.0",
    category: "magnetics",
    description: "World Magnetic Model field from NOAA’s geomagnetic calculator.",
    detail: "NOAA NCEI calculateIgrfwmm with model=WMM. Use for navigation-style declination alongside IGRF.",
    match: /\bwmm\b|world magnetic|noaa.*(declination|igrf|wmm)|declination/i,
    defaultEnabled: true,
    network: true,
  },
  {
    id: "noaa-swpc",
    name: "NOAA Space Weather",
    publisher: "NOAA SWPC",
    version: "1.0.0",
    category: "space-weather",
    description: "Live Kp index, SWPC alerts, and solar-wind snapshot.",
    detail: "Reads NOAA Space Weather Prediction Center JSON feeds. Useful before mag surveys and for storm days.",
    match: /\bnoaa\b|space weather|k-?index|\bkp\b|solar wind|geomagnetic storm|swpc|aurora/i,
    defaultEnabled: true,
    network: true,
  },
  {
    id: "news",
    name: "News",
    publisher: "GDELT / NewsAPI",
    version: "1.0.0",
    category: "news",
    description: "Recent headlines. Optional NewsAPI key for fuller coverage.",
    detail:
      "Default is GDELT (no key). Paste a NewsAPI.org key for article search. Queries are the user’s question only — not workspace files.",
    match: /\bnews\b|headline|current affairs|latest|today in/i,
    defaultEnabled: true,
    needsKey: true,
    keyLabel: "NewsAPI key (optional)",
    network: true,
  },
  {
    id: "usgs-quakes",
    name: "USGS Earthquakes",
    publisher: "USGS",
    version: "1.0.0",
    category: "seismology",
    description: "M4.5+ earthquakes from the past week.",
    detail: "USGS GeoJSON feed. Use when the user asks about recent seismicity or events.",
    match: /\bearthquake|seismic event|usgs|magnitude|tremor/i,
    defaultEnabled: true,
    network: true,
  },
];

export const PLUGIN_CATEGORIES: { id: PluginManifest["category"]; label: string }[] = [
  { id: "magnetics", label: "Magnetics" },
  { id: "space-weather", label: "Space weather" },
  { id: "seismology", label: "Seismology" },
  { id: "news", label: "News" },
  { id: "reference", label: "Reference" },
];

export function defaultPluginEnabled(): Record<string, boolean> {
  return Object.fromEntries(PLUGIN_CATALOG.map((plugin) => [plugin.id, plugin.defaultEnabled]));
}

export function isPluginEnabled(id: string, enabled?: Record<string, boolean>): boolean {
  if (enabled && Object.prototype.hasOwnProperty.call(enabled, id)) return Boolean(enabled[id]);
  return PLUGIN_CATALOG.find((plugin) => plugin.id === id)?.defaultEnabled ?? false;
}

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGIN_CATALOG.find((plugin) => plugin.id === id);
}
