export interface LogSample {
  depth: number;
  value: number | null;
}

export interface LogTrack {
  mnemonic: string;
  units: string;
  description: string;
  semantics: "unknown" | string;
  nullGaps: number;
  samples: LogSample[];
}

export interface BoreholeLog {
  kind: "borehole-log";
  wellId: string;
  depthIndex: string;
  depthUnits: string;
  depthReference: string;
  nullValue?: number;
  lasVersion?: string;
  wrap?: string;
  selectedCurves: string[];
  tracks: LogTrack[];
  trajectoryComputed: boolean;
  catalogId?: string;
  checksum?: string;
  warnings: string[];
  headerProvenance: Record<string, string>;
}

export function isBoreholeLogPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return /borehole_tracks\.json$/.test(n) || /borehole_canonical\.csv$/.test(n);
}

export function isBoreholeCollarPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return /borehole_collar\.geojson$/.test(n);
}

export function parseBoreholeTracks(text: string, path = ""): BoreholeLog | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw.kind !== "borehole-log" && !/borehole_tracks/.test(path)) return null;
    const tracksIn = Array.isArray(raw.tracks) ? raw.tracks : [];
    const tracks: LogTrack[] = tracksIn.map((item) => {
      const track = item as Record<string, unknown>;
      const samplesRaw = Array.isArray(track.samples) ? track.samples : [];
      return {
        mnemonic: String(track.mnemonic || ""),
        units: String(track.units || ""),
        description: String(track.description || ""),
        semantics: String(track.semantics || "unknown"),
        nullGaps: typeof track.null_gaps === "number" ? track.null_gaps : 0,
        samples: samplesRaw.map((sample) => {
          const row = sample as Record<string, unknown>;
          const depth = Number(row.depth);
          const value = row.value == null || row.value === "" ? null : Number(row.value);
          return {
            depth,
            value: value == null || !Number.isFinite(value) ? null : value,
          };
        }),
      };
    });
    return {
      kind: "borehole-log",
      wellId: String(raw.well_id || ""),
      depthIndex: String(raw.depth_index || "DEPT"),
      depthUnits: String(raw.depth_units || ""),
      depthReference: String(raw.depth_reference || "measured depth"),
      nullValue: typeof raw.null_value === "number" ? raw.null_value : undefined,
      lasVersion: typeof raw.las_version === "string" ? raw.las_version : undefined,
      wrap: typeof raw.wrap === "string" ? raw.wrap : undefined,
      selectedCurves: Array.isArray(raw.selected_curves) ? raw.selected_curves.map(String) : tracks.map((t) => t.mnemonic),
      tracks,
      trajectoryComputed: Boolean(raw.trajectory_computed),
      catalogId: typeof raw.catalog_id === "string" ? raw.catalog_id : undefined,
      checksum: typeof raw.checksum === "string" ? raw.checksum : undefined,
      warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
      headerProvenance:
        raw.header_provenance && typeof raw.header_provenance === "object"
          ? (raw.header_provenance as Record<string, string>)
          : {},
    };
  } catch {
    return null;
  }
}
