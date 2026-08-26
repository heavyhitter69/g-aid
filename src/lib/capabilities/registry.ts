import { USER_CAPABILITY_IDS, type ScientificCapability, type UserCapabilityId } from "./types.ts";

function mag(partial: ScientificCapability): ScientificCapability {
  return partial;
}

const CAPABILITIES: ScientificCapability[] = [
  mag({
    id: "mag.diurnal",
    version: "1.0.0",
    title: "Diurnal correction",
    description: "Correct MagArrow rover samples with a GSM-19 base station.",
    domain: "magnetics",
    kernelNodeIds: [
      "file_discovery",
      "flight_path_cleaner",
      "time_synchronizer",
      "diurnal_corrector",
      "qc_engine",
    ],
    dependsOn: [],
    inputRoles: [
      {
        role: "rover",
        adapterIds: ["magarrow"],
        required: true,
        description: "Supported MagArrow airborne catalog records",
      },
      {
        role: "base",
        adapterIds: ["gsm19"],
        required: true,
        description: "Supported GSM-19 base-station catalog records",
      },
    ],
    outputs: [
      { id: "airborne_corrected", type: "table", description: "Diurnally corrected MagArrow samples", viewer: "table" },
      { id: "qc_report", type: "qc", description: "Diurnal QC statistics", viewer: "json" },
    ],
    parameters: {
      baseReference: {
        type: "string",
        required: true,
        description: "GSM-19 reference: mean_base, median_base, or first_sample",
        defaultValue: "mean_base",
      },
      surveyDate: { type: "string", required: false, description: "Survey date YYYY-MM-DD if GSM-19 header has no /ID stamp" },
    },
    metadataRequirements: ["rover timestamps", "base timestamps", "magnetic field nT"],
    scientificConstraints: [
      "Requires both MagArrow rover and GSM-19 base catalog records.",
      "Does not invent a survey date if the GSM-19 header has none.",
    ],
    qcRequirements: ["temporal overlap", "outlier report", "reference value recorded"],
    viewerTypes: ["table", "json"],
    interpretationLimits: [
      "Diurnal correction removes base-station variation only. It is not IGRF, levelling, or RTP.",
    ],
    expectedArtifacts: ["airborne_corrected.csv", "base_station_canonical.csv", "qc_report.json"],
  }),
  mag({
    id: "mag.igrf",
    version: "1.0.0",
    title: "IGRF removal",
    description: "Subtract IGRF-13 at each sample.",
    domain: "magnetics",
    kernelNodeIds: ["igrf_corrector"],
    dependsOn: ["mag.diurnal"],
    inputRoles: [{ role: "corrected-points", adapterIds: ["magarrow"], required: true, description: "Diurnally corrected points" }],
    outputs: [
      { id: "igrf_residual", type: "table", description: "IGRF residual nT plus I/D", viewer: "table" },
      { id: "igrf_qc", type: "qc", description: "Mean inclination/declination", viewer: "json" },
    ],
    parameters: {
      decimalYear: { type: "number", required: false, description: "Override survey decimal year" },
      surveyAltitudeM: { type: "number", required: false, description: "Default altitude when z is missing", units: "m" },
    },
    metadataRequirements: ["geodetic lat/lon", "timestamp or decimalYear"],
    scientificConstraints: ["IGRF-13 official SV window is 2020.0–2025.0; outside that range SV is extrapolated."],
    qcRequirements: ["mean I and D written", "extrapolation flag"],
    viewerTypes: ["table", "json"],
    interpretationLimits: ["Residual is not RTP. Do not interpret uncorrected TMI as crustal anomaly after this step alone."],
    expectedArtifacts: ["airborne_igrf.csv", "igrf_qc.json"],
  }),
  mag({
    id: "mag.headingLag",
    version: "1.0.0",
    title: "Heading and lag",
    description: "Heading correction and reciprocal-line lag.",
    domain: "magnetics",
    kernelNodeIds: ["heading_lag_corrector"],
    dependsOn: ["mag.diurnal"],
    inputRoles: [{ role: "corrected-points", adapterIds: ["magarrow"], required: true, description: "Corrected MagArrow points" }],
    outputs: [{ id: "heading_lag", type: "table", description: "Heading/lag corrected samples", viewer: "table" }],
    parameters: {},
    metadataRequirements: ["track coordinates", "line structure for lag"],
    scientificConstraints: ["Lag is applied only when reciprocal lines support an estimate."],
    qcRequirements: ["heading RMS", "lag samples or reason not applied"],
    viewerTypes: ["table", "json"],
    interpretationLimits: ["Does not replace tie-line levelling."],
    expectedArtifacts: ["airborne_heading_lag.csv", "heading_lag_qc.json"],
  }),
  mag({
    id: "mag.level",
    version: "1.0.0",
    title: "Tie-line levelling",
    description: "Statistical levelling of traverses against ties, then microlevelling.",
    domain: "magnetics",
    kernelNodeIds: ["tie_line_leveler", "microleveller"],
    dependsOn: ["mag.diurnal"],
    inputRoles: [{ role: "corrected-points", adapterIds: ["magarrow"], required: true, description: "Corrected MagArrow points" }],
    outputs: [{ id: "leveled", type: "table", description: "Levelled samples", viewer: "table" }],
    parameters: {
      tieRadiusM: { type: "number", required: false, description: "Tie intersection radius", units: "m", defaultValue: 25 },
    },
    metadataRequirements: ["line_id or geometry that distinguishes ties from traverses"],
    scientificConstraints: ["Ties are held; traverses shift. Requires identifiable tie/traverse structure."],
    qcRequirements: ["shift statistics", "microlevel applied flag"],
    viewerTypes: ["table", "json"],
    interpretationLimits: ["Levelling can suppress geologic signal along-line if mis-parameterised."],
    expectedArtifacts: ["airborne_leveled.csv", "airborne_microleveled.csv", "leveling_qc.json"],
  }),
  mag({
    id: "mag.grid",
    version: "1.0.0",
    title: "Minimum-curvature grid",
    description: "Grid diurnally corrected spatial samples.",
    domain: "magnetics",
    kernelNodeIds: ["mag_gridder"],
    dependsOn: ["mag.diurnal"],
    inputRoles: [{ role: "corrected-points", adapterIds: ["magarrow"], required: true, description: "Corrected MagArrow points with x/y" }],
    outputs: [{ id: "tmi_grid", type: "grid", description: "TMI residual grid", viewer: "map" }],
    parameters: {
      cellSizeM: { type: "number", required: false, description: "Grid cell size", units: "m" },
      gridTension: { type: "number", required: false, description: "Spline tension", defaultValue: 0.25 },
    },
    metadataRequirements: ["spatial x/y", "corrected magnetic values"],
    scientificConstraints: ["Requires diurnally corrected spatial data. Does not grid raw unsupported tables."],
    qcRequirements: ["crs_epsg", "cell size", "grid dimensions"],
    viewerTypes: ["map", "ascii-grid"],
    interpretationLimits: ["Gridding interpolates; it is not a measurement. Cell size must be justified by line spacing."],
    expectedArtifacts: ["tmi_grid.asc", "tmi_grid.npz", "grid_qc.json"],
  }),
  mag({
    id: "mag.rtp",
    version: "1.0.0",
    title: "Reduction to the pole",
    description: "FFT RTP of a TMI grid using inclination and declination.",
    domain: "magnetics",
    kernelNodeIds: ["rtp_filter"],
    dependsOn: ["mag.grid"],
    inputRoles: [{ role: "grid", adapterIds: ["magarrow"], required: true, description: "TMI grid from mag.grid" }],
    outputs: [{ id: "rtp_grid", type: "grid", description: "RTP or documented RTE fallback", viewer: "map" }],
    parameters: {
      inclination: { type: "number", required: false, description: "Magnetic inclination", units: "degrees" },
      declination: { type: "number", required: false, description: "Magnetic declination", units: "degrees" },
      forceRtp: { type: "boolean", required: false, description: "Force RTP at low latitude instead of RTE", defaultValue: false },
    },
    metadataRequirements: ["valid TMI grid", "inclination and declination, or IGRF QC from mag.igrf"],
    scientificConstraints: [
      "RTP requires a valid grid plus field parameters or mag.igrf as a documented source of I/D.",
      "At |I|<10° the kernel writes RTE unless forceRtp is set.",
    ],
    qcRequirements: ["I and D recorded", "low-latitude warning", "RTE fallback documented if used"],
    viewerTypes: ["map"],
    interpretationLimits: [
      "RTP assumes induced magnetisation dominated by the present field. Remanence is not recovered.",
    ],
    expectedArtifacts: ["rtp_grid.asc", "rtp_qc.json"],
  }),
  mag({
    id: "mag.derivatives",
    version: "1.0.0",
    title: "MAGMAP derivatives",
    description: "FFT analytic signal, vertical derivatives, tilt, continuation, Euler solutions.",
    domain: "magnetics",
    kernelNodeIds: ["fft_derivatives", "euler_deconvolution"],
    dependsOn: ["mag.grid"],
    inputRoles: [{ role: "grid", adapterIds: ["magarrow"], required: true, description: "RTP or TMI grid" }],
    outputs: [
      { id: "magmap", type: "grid", description: "Derivative grids", viewer: "map" },
      { id: "euler", type: "vector", description: "Euler solutions", viewer: "table" },
    ],
    parameters: {
      continuationHeightM: { type: "number", required: false, description: "Upward continuation height", units: "m", defaultValue: 50 },
      structuralIndex: { type: "number", required: false, description: "Euler structural index", defaultValue: 1 },
    },
    metadataRequirements: ["grid from mag.grid (RTP preferred when mag.rtp ran)"],
    scientificConstraints: ["Derivatives amplify noise. Euler depths are model-dependent."],
    qcRequirements: ["source grid named", "product manifest"],
    viewerTypes: ["map", "table"],
    interpretationLimits: ["Derivative maps are enhancement products, not unique geology."],
    expectedArtifacts: ["analytic_signal.asc", "1vd.asc", "euler_solutions.csv", "magmap_manifest.json"],
  }),
  mag({
    id: "mag.lineaments",
    version: "1.0.0",
    title: "Lineament extraction",
    description: "THD non-maximum suppression lineaments.",
    domain: "magnetics",
    kernelNodeIds: ["lineament_extractor"],
    dependsOn: ["mag.derivatives"],
    inputRoles: [{ role: "grid", adapterIds: ["magarrow"], required: true, description: "THD or TMI grid" }],
    outputs: [{ id: "lineaments", type: "vector", description: "Lineament polylines", viewer: "map" }],
    parameters: {
      lineamentPercentile: { type: "number", required: false, description: "THD percentile threshold", defaultValue: 85 },
    },
    metadataRequirements: ["THD grid from mag.derivatives, or TMI grid fallback"],
    scientificConstraints: ["Lineaments are edge detections, not mapped faults."],
    qcRequirements: ["count of lineaments"],
    viewerTypes: ["map"],
    interpretationLimits: ["Do not treat extracted lineaments as field-verified structures."],
    expectedArtifacts: ["lineaments.geojson", "lineaments_qc.json"],
  }),
  mag({
    id: "mag.gis",
    version: "1.0.0",
    title: "GIS and report export",
    description: "Write GeoJSON flight path, maps, workbook, and report from magnetic products.",
    domain: "magnetics",
    kernelNodeIds: ["gis_export", "excel_export_adapter", "report_export_adapter"],
    dependsOn: ["mag.diurnal"],
    inputRoles: [{ role: "corrected-points", adapterIds: ["magarrow"], required: true, description: "Corrected points and any grids already written" }],
    outputs: [
      { id: "flight_path", type: "vector", description: "Flight path GeoJSON", viewer: "map" },
      { id: "workbook", type: "workbook", description: "Excel export", viewer: "file" },
      { id: "report", type: "report", description: "Run report", viewer: "file" },
    ],
    parameters: {},
    metadataRequirements: ["products already in the run folder"],
    scientificConstraints: ["Export only. Does not compute new geophysics."],
    qcRequirements: ["files written under G-AID Output"],
    viewerTypes: ["map", "file"],
    interpretationLimits: ["Exports inherit the limits of upstream magnetic products."],
    expectedArtifacts: ["flight_path.geojson", "diurnal_analysis.xlsx"],
  }),
];

const BY_ID = new Map(CAPABILITIES.map((capability) => [capability.id, capability]));

export function listCapabilities(): ScientificCapability[] {
  return CAPABILITIES.slice();
}

export function getCapability(id: string): ScientificCapability | undefined {
  return BY_ID.get(id as UserCapabilityId);
}

export function isRegisteredCapability(id: string): id is UserCapabilityId {
  return BY_ID.has(id as UserCapabilityId);
}

export function capabilityVersionMap(): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const capability of CAPABILITIES) versions[capability.id] = capability.version;
  return versions;
}

export { USER_CAPABILITY_IDS };
