const UA = "G-AID/0.1 (desktop geophysics assistant)";
const MAX_NOTES = 1500;

export function shouldLookupWeb(text: string): boolean {
  const query = text.trim();
  if (!query || query.length > 400) return false;
  if (/^(ok|okay|thanks|thank you|yes|no|yep|nope|proceed|go ahead)\.?$/i.test(query)) {
    return false;
  }
  if (/--- (?:File Context|Workspace) ---|GROUND TRUTH|G-AID_PLANNING|Implementation Plan|PLAN MODE/.test(query)) {
    return false;
  }
  if (/[\\/].+\.(grd|tif|tiff|xyz|csv|gdb|shp)\b/i.test(query)) return false;
  return (
    /[?]/.test(query) ||
    /\b(who|what|when|where|which|latest|current|news|today|this year|next year|president|election|happened|independence|holiday|capital)\b/i.test(
      query
    )
  );
}

async function fetchJson(url: string, timeoutMs = 4000): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function wikipediaNotes(query: string): Promise<string> {
  const searchUrl =
    "https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json" +
    `&search=${encodeURIComponent(query)}`;
  const search = (await fetchJson(searchUrl)) as [string, string[], string[], string[]];
  const title = search?.[1]?.[0];
  const hint = search?.[2]?.[0] || "";
  if (!title) return "";
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const summary = (await fetchJson(summaryUrl)) as {
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  const extract = (summary.extract || hint).replace(/\s+/g, " ").trim();
  if (!extract) return "";
  const page = summary.content_urls?.desktop?.page || "";
  return page ? `${extract} (${page})` : extract;
}

async function duckDuckGoNotes(query: string): Promise<string> {
  const url =
    "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&no_redirect=1" +
    `&q=${encodeURIComponent(query)}`;
  const data = (await fetchJson(url)) as {
    AbstractText?: string;
    AbstractURL?: string;
    Answer?: string;
    Heading?: string;
  };
  const bits = [data.Answer, data.AbstractText].map((entry) => (entry || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!bits.length) return "";
  const source = data.AbstractURL || data.Heading || "";
  return source ? `${bits.join(" ")} (${source})` : bits.join(" ");
}

export async function lookupWeb(query: string): Promise<string> {
  const q = query.trim();
  if (!shouldLookupWeb(q)) return "";
  const parts = await Promise.allSettled([wikipediaNotes(q), duckDuckGoNotes(q)]);
  const notes = parts
    .map((part) => (part.status === "fulfilled" ? part.value : ""))
    .filter(Boolean);
  if (!notes.length) return "";
  const unique = [...new Set(notes)];
  let text = unique.join("\n");
  if (text.length > MAX_NOTES) text = `${text.slice(0, MAX_NOTES - 1)}…`;
  return text;
}
