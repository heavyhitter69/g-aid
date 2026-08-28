import { PLUGIN_CATALOG, isPluginEnabled } from "./catalog";
import {
  lookupDuckDuckGo,
  lookupIgrf,
  lookupNews,
  lookupNoaaSwpc,
  lookupNoaaWmm,
  lookupUsgsQuakes,
  lookupWikipedia,
} from "./providers";
import type { PluginLookup, PluginNote, PluginSecrets, PluginState } from "./types";

const LOOKUPS: Record<string, PluginLookup> = {
  wikipedia: lookupWikipedia,
  "web-search": lookupDuckDuckGo,
  igrf: lookupIgrf,
  "noaa-wmm": lookupNoaaWmm,
  "noaa-swpc": lookupNoaaSwpc,
  news: lookupNews,
  "usgs-quakes": lookupUsgsQuakes,
};

export function shouldRunPlugins(query: string): boolean {
  const text = query.trim();
  if (!text || text.length > 400) return false;
  if (/^(hey|hi|hello|yo|sup|ok|okay|thanks|thank you|yes|no|yep|nope|proceed|go ahead)[.!?]*$/i.test(text)) {
    return false;
  }
  if (/--- (?:File Context|Workspace) ---|GROUND TRUTH|G-AID_PLANNING|Implementation Plan|PLAN MODE/.test(text)) return false;
  if (/[\\/].+\.(grd|tif|tiff|xyz|csv|gdb|shp)\b/i.test(text)) return false;
  return PLUGIN_CATALOG.some((plugin) => plugin.match.test(text));
}

export async function runOrchestraPlugins(
  query: string,
  state?: Partial<PluginState>
): Promise<{ notes: PluginNote[]; text: string; ids: string[] }> {
  if (!shouldRunPlugins(query)) return { notes: [], text: "", ids: [] };
  const enabled = state?.enabled;
  const secrets: PluginSecrets = state?.secrets || {};
  const matched = PLUGIN_CATALOG.filter(
    (plugin) => isPluginEnabled(plugin.id, enabled) && plugin.match.test(query)
  ).slice(0, 4);
  if (!matched.length) return { notes: [], text: "", ids: [] };

  const settled = await Promise.allSettled(
    matched.map(async (plugin) => {
      const lookup = LOOKUPS[plugin.id];
      if (!lookup) return null;
      const text = (await lookup(query, secrets)).trim();
      if (!text) return null;
      return { id: plugin.id, title: plugin.name, text } satisfies PluginNote;
    })
  );

  const notes = settled
    .map((entry) => (entry.status === "fulfilled" ? entry.value : null))
    .filter((entry): entry is PluginNote => Boolean(entry));

  const text = notes.map((note) => `[${note.title}] ${note.text}`).join("\n");
  return { notes, text, ids: notes.map((note) => note.id) };
}
