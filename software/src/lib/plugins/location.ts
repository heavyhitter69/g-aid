const PLACES: Record<string, { lat: number; lon: number; name: string }> = {
  accra: { lat: 5.6037, lon: -0.187, name: "Accra" },
  tema: { lat: 5.6698, lon: -0.0166, name: "Tema" },
  tamale: { lat: 9.4034, lon: -0.8424, name: "Tamale" },
  kumasi: { lat: 6.6885, lon: -1.6244, name: "Kumasi" },
  takoradi: { lat: 4.8845, lon: -1.7554, name: "Takoradi" },
  lagos: { lat: 6.5244, lon: 3.3792, name: "Lagos" },
  abuja: { lat: 9.0765, lon: 7.3986, name: "Abuja" },
  johannesburg: { lat: -26.2041, lon: 28.0473, name: "Johannesburg" },
  nairobi: { lat: -1.2921, lon: 36.8219, name: "Nairobi" },
  perth: { lat: -31.9505, lon: 115.8605, name: "Perth" },
  kalgoorlie: { lat: -30.7489, lon: 121.465, name: "Kalgoorlie" },
  toronto: { lat: 43.6532, lon: -79.3832, name: "Toronto" },
  denver: { lat: 39.7392, lon: -104.9903, name: "Denver" },
  london: { lat: 51.5074, lon: -0.1278, name: "London" },
  ghana: { lat: 5.6037, lon: -0.187, name: "Accra, Ghana" },
};

function hemisphere(value: number, hemi: string | undefined, negative: string): number {
  if (!hemi) return value;
  return new RegExp(negative, "i").test(hemi) ? -Math.abs(value) : Math.abs(value);
}

export function resolveLocation(query: string): { lat: number; lon: number; label: string } | null {
  const named = query.match(
    /(-?\d+(?:\.\d+)?)\s*[°]?\s*([NS])[,;\s]+(-?\d+(?:\.\d+)?)\s*[°]?\s*([EW])/i
  );
  if (named) {
    const lat = hemisphere(Number(named[1]), named[2], "S");
    const lon = hemisphere(Number(named[3]), named[4], "W");
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
    }
  }
  const labeled = query.match(
    /\blat(?:itude)?\s*[:=]?\s*(-?\d+(?:\.\d+)?).{0,32}lon(?:gitude)?\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i
  );
  if (labeled) {
    const lat = Number(labeled[1]);
    const lon = Number(labeled[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
    }
  }
  const pair = query.match(/(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/);
  if (pair) {
    const lat = Number(pair[1]);
    const lon = Number(pair[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
    }
  }
  const lower = query.toLowerCase();
  for (const [key, place] of Object.entries(PLACES)) {
    if (lower.includes(key)) return { lat: place.lat, lon: place.lon, label: place.name };
  }
  return null;
}

export function yearFromQuery(query: string): number {
  const now = new Date();
  const fallback = now.getFullYear() + (now.getMonth() + 1) / 12;
  const match = query.match(/\b((?:19|20)\d{2})(?:\.(\d+))?\b/);
  if (!match) return fallback;
  const year = Number(match[1]);
  if (match[2]) return year + Number(`0.${match[2]}`);
  return year + (now.getMonth() + 1) / 12;
}
