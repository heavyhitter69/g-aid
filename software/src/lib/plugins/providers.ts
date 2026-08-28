import { clip, fetchJson } from "./http";
import { resolveLocation, yearFromQuery } from "./location";
import type { PluginLookup } from "./types";

export const lookupWikipedia: PluginLookup = async (query) => {
  const search = (await fetchJson(
    "https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json" +
      `&search=${encodeURIComponent(query)}`
  )) as [string, string[], string[], string[]];
  const title = search?.[1]?.[0];
  const hint = search?.[2]?.[0] || "";
  if (!title) return "";
  const summary = (await fetchJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`
  )) as { extract?: string; content_urls?: { desktop?: { page?: string } } };
  const extract = clip(summary.extract || hint, 700);
  if (!extract) return "";
  const page = summary.content_urls?.desktop?.page || "";
  return page ? `${extract} Source: ${page}` : extract;
};

export const lookupDuckDuckGo: PluginLookup = async (query) => {
  const data = (await fetchJson(
    "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&no_redirect=1" +
      `&q=${encodeURIComponent(query)}`
  )) as { AbstractText?: string; AbstractURL?: string; Answer?: string };
  const bits = [data.Answer, data.AbstractText].map((entry) => clip(entry || "", 500)).filter(Boolean);
  if (!bits.length) return "";
  return data.AbstractURL ? `${bits.join(" ")} Source: ${data.AbstractURL}` : bits.join(" ");
};

async function igrfFromPython(lat: number, lon: number, year: number): Promise<string> {
  const response = await fetch("http://127.0.0.1:8000/api/v1/igrf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lon, alt_km: 0, year }),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`local IGRF ${response.status}`);
  const data = (await response.json()) as {
    f?: number;
    inclination?: number;
    declination?: number;
    year?: number;
    extrapolated?: boolean;
    source?: string;
  };
  if (!Number.isFinite(data.f)) throw new Error("local IGRF empty");
  const extra = data.extrapolated ? " (SV extrapolated)" : "";
  return `Local IGRF-13${extra} at ${lat.toFixed(4)}, ${lon.toFixed(4)}, year ${data.year ?? year}: F=${data.f?.toFixed(1)} nT, I=${data.inclination?.toFixed(2)}°, D=${data.declination?.toFixed(2)}°.`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return Number.NaN;
}

async function igrfFromBgs(lat: number, lon: number, year: number): Promise<string> {
  const url =
    "https://geomag.bgs.ac.uk/web_service/GMModels/igrf/13/" +
    `?latitude=${lat}&longitude=${lon}&altitude=0&year=${year.toFixed(3)}&format=json`;
  const data = asRecord(await fetchJson(url, 6000));
  const result = asRecord(data["geomagnetic-field-model-result"] ?? data.result ?? data);
  const field = asRecord(result["field-value"] ?? result.field ?? result);
  const f = num(field, "total-intensity-nT", "F", "f");
  const inc = num(field, "inclination-degree", "I", "inclination");
  const dec = num(field, "declination-degree", "D", "declination");
  if (!Number.isFinite(f)) throw new Error("BGS IGRF empty");
  return `BGS IGRF-13 at ${lat.toFixed(4)}, ${lon.toFixed(4)}, year ${year.toFixed(2)}: F=${f.toFixed(1)} nT, I=${inc.toFixed(2)}°, D=${dec.toFixed(2)}°.`;
}

async function noaaCalculator(lat: number, lon: number, year: number, model: "IGRF" | "WMM"): Promise<string> {
  const date = new Date();
  const y = Math.floor(year) || date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const url =
    "https://www.ngdc.noaa.gov/geomag-web/calculators/calculateIgrfwmm" +
    `?lat1=${lat}&lon1=${lon}&model=${model}&startYear=${y}&startMonth=${month}&startDay=${day}&resultFormat=json`;
  const data = asRecord(await fetchJson(url, 7000));
  const result = data.result;
  const row = asRecord(Array.isArray(result) ? result[0] : result ?? data);
  const f = num(row, "totalintensity", "ti", "F");
  const inc = num(row, "inclination", "I");
  const dec = num(row, "declination", "D");
  if (!Number.isFinite(f) && !Number.isFinite(dec)) throw new Error(`NOAA ${model} empty`);
  const parts = [`NOAA ${model} at ${lat.toFixed(4)}, ${lon.toFixed(4)}, ${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`];
  if (Number.isFinite(f)) parts.push(`F=${f.toFixed(1)} nT`);
  if (Number.isFinite(inc)) parts.push(`I=${inc.toFixed(2)}°`);
  if (Number.isFinite(dec)) parts.push(`D=${dec.toFixed(2)}°`);
  return `${parts[0]}: ${parts.slice(1).join(", ")}.`;
}

export const lookupIgrf: PluginLookup = async (query) => {
  const loc = resolveLocation(query);
  if (!loc) {
    return "IGRF plugin is on. Give a lat/lon (for example 5.67, -0.02) or a place (Tema, Accra, Tamale).";
  }
  const year = yearFromQuery(query);
  try {
    return await igrfFromPython(loc.lat, loc.lon, year);
  } catch {
    try {
      return await igrfFromBgs(loc.lat, loc.lon, year);
    } catch {
      return noaaCalculator(loc.lat, loc.lon, year, "IGRF");
    }
  }
};

export const lookupNoaaWmm: PluginLookup = async (query) => {
  const loc = resolveLocation(query);
  if (!loc) return "";
  return noaaCalculator(loc.lat, loc.lon, yearFromQuery(query), "WMM");
};

export const lookupNoaaSwpc: PluginLookup = async () => {
  const [kpRaw, alertRaw] = await Promise.allSettled([
    fetchJson("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", 5000),
    fetchJson("https://services.swpc.noaa.gov/json/alerts.json", 5000),
  ]);
  const lines: string[] = [];
  if (kpRaw.status === "fulfilled" && Array.isArray(kpRaw.value) && kpRaw.value.length) {
    const last = kpRaw.value[kpRaw.value.length - 1] as { time_tag?: string; kp_index?: number; estimated_kp?: number };
    const kp = last.kp_index ?? last.estimated_kp;
    if (kp != null) lines.push(`NOAA SWPC planetary Kp ≈ ${kp} at ${last.time_tag || "latest"}.`);
  }
  if (alertRaw.status === "fulfilled" && Array.isArray(alertRaw.value)) {
    const recent = (alertRaw.value as { issue_datetime?: string; message?: string }[])
      .slice(0, 3)
      .map((entry) => clip(entry.message || "", 180))
      .filter(Boolean);
    if (recent.length) lines.push(`SWPC alerts: ${recent.join(" | ")}`);
  }
  return lines.join(" ");
};

export const lookupNews: PluginLookup = async (query, secrets) => {
  const key = secrets.newsApiKey?.trim();
  if (key) {
    const data = (await fetchJson(
      "https://newsapi.org/v2/everything?pageSize=5&sortBy=publishedAt&language=en" +
        `&q=${encodeURIComponent(query)}&apiKey=${encodeURIComponent(key)}`,
      6000
    )) as { articles?: { title?: string; source?: { name?: string }; url?: string }[] };
    const articles = (data.articles || []).slice(0, 5);
    if (articles.length) {
      return articles
        .map((article) => `${article.title || ""} (${article.source?.name || "NewsAPI"})`)
        .filter(Boolean)
        .join("; ");
    }
  }
  const data = (await fetchJson(
    "https://api.gdeltproject.org/api/v2/doc/doc?mode=ArtList&maxrecords=5&format=json&sort=DateDesc" +
      `&query=${encodeURIComponent(query)}`,
    7000
  )) as { articles?: { title?: string; url?: string; seendate?: string }[] };
  const articles = data.articles || [];
  if (!articles.length) return "";
  return articles
    .slice(0, 5)
    .map((article) => `${article.title || ""} ${article.seendate ? `(${article.seendate})` : ""}`.trim())
    .join("; ");
};

export const lookupUsgsQuakes: PluginLookup = async () => {
  const data = (await fetchJson(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
    6000
  )) as {
    features?: { properties?: { mag?: number; place?: string; time?: number } }[];
  };
  const features = data.features || [];
  if (!features.length) return "USGS: no M4.5+ events in the past week.";
  return features
    .slice(0, 6)
    .map((feature) => {
      const mag = feature.properties?.mag;
      const place = feature.properties?.place;
      const when = feature.properties?.time ? new Date(feature.properties.time).toISOString().slice(0, 16) : "";
      return `M${mag} ${place} ${when}`.trim();
    })
    .join("; ");
};
