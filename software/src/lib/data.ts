import type { AgentProfile, Discipline, DisciplineId } from "@/types";

export const DISCIPLINES: Discipline[] = [
  {
    id: "exploration",
    name: "Exploration Geophysics",
    shortName: "Exploration",
    description: "Local magnetics and gravity grid work for exploration folders",
    icon: "compass",
    color: "#ffffff",
    datasets: ["Magnetic grids", "Gravity grids", "Survey catalogs"],
    workflows: ["Magnetics pack", "Gravity near-zone", "Zoned planar gravity"],
  },
  {
    id: "environmental",
    name: "Environmental Geophysics",
    shortName: "Environmental",
    description: "Near-surface GPR and ERT files on disk, with experimental invert2d",
    icon: "leaf",
    color: "#e5e5e5",
    datasets: ["GPR radargrams", "ERT profiles"],
    workflows: ["GPR 1.0", "ERT ingest", "Experimental invert2d"],
  },
  {
    id: "seismology",
    name: "Seismology",
    shortName: "Seismology",
    description: "Application area only — waveform picking and hypocenter location are not in Shipment 13",
    icon: "waves",
    color: "#d4d4d4",
    datasets: ["Not in Shipment 13"],
    workflows: ["Out of scope"],
  },
  {
    id: "hydrogeophysics",
    name: "Hydrogeophysics",
    shortName: "Hydrogeophysics",
    description: "ERT sections and LAS borehole logs; not a coupled aquifer modeller",
    icon: "droplets",
    color: "#a3a3a3",
    datasets: ["ERT profiles", "LAS 2.0 well logs"],
    workflows: ["ERT ingest", "LAS collar mapping"],
  },
  {
    id: "data-analysis",
    name: "Geophysical Data Analysis",
    shortName: "Data Analysis",
    description: "Local catalog DAG, pack QC, and 2D map previews",
    icon: "activity",
    color: "#737373",
    datasets: ["Supported survey files on disk"],
    workflows: ["Catalog", "Pack nodes", "2D maps"],
  },
  {
    id: "geotechnical",
    name: "Geotechnical Geophysics",
    shortName: "Geotechnical",
    description: "Site folders with GPR, ERT, and GIS vectors — not MASW or SPT fusion",
    icon: "pickaxe",
    color: "#525252",
    datasets: ["GPR", "ERT", "Shapefiles / GeoJSON"],
    workflows: ["GPR 1.0", "ERT ingest", "Vector overlays"],
  },
  {
    id: "geomatics",
    name: "Geomatics",
    shortName: "Geomatics",
    description: "GeoJSON CRS84 and shapefiles with topology-aware holes — not LiDAR or GNSS",
    icon: "map",
    color: "#7c9fc2",
    datasets: ["GeoJSON CRS84", "Shapefiles"],
    workflows: ["Vector ingest", "Polygon holes", "Map overlay"],
  },
];

export const FEATURES = [
  {
    title: "Local survey catalog",
    description: "Index survey files on disk and run a processing DAG without uploading data to a cloud workspace",
    icon: "brain",
  },
  {
    title: "Magnetics and gravity packs",
    description: "Magnetics processing plus gravity near-zone and zoned planar corrections. Complete Bouguer is not auto-granted",
    icon: "workflow",
  },
  {
    title: "2D maps and sections",
    description: "Grid maps, vector overlays, ERT pseudosections, GPR radargrams, LAS logs, and geochem plots in the desktop workspace",
    icon: "chart",
  },
  {
    title: "Ingest with stated limits",
    description: "ERT ingest and experimental invert2d, radiometrics 1.0, GPR 1.0, LAS 2.0, GEOCHEM 1.0, GeoJSON CRS84, and shapefiles",
    icon: "activity",
  },
  {
    title: "Runs on your machine",
    description: "Electron desktop app with an optional local Ollama assistant. No hosted inference or browser demo",
    icon: "cloud",
  },
  {
    title: "Honest support boundaries",
    description: "Unsupported formats and production inversions are refused or labelled experimental instead of silently faked",
    icon: "users",
  },
];

export function getAgentForDiscipline(discipline: DisciplineId): AgentProfile {
  const disciplineData = DISCIPLINES.find((d) => d.id === discipline)!;
  const agentNames: Record<DisciplineId, string> = {
    exploration: "Exploration Geophysics Agent",
    environmental: "Environmental Site Characterization Agent",
    seismology: "Seismology Analysis Agent",
    hydrogeophysics: "Hydrogeophysical Characterization Agent",
    "data-analysis": "Geophysical Data Analysis Agent",
    geotechnical: "Geotechnical Engineering Agent",
    geomatics: "Geomatics & Spatial Analysis Agent",
  };

  return {
    id: `agent-${discipline}`,
    name: agentNames[discipline],
    discipline,
    capabilities: [
      "Local catalog of supported survey files",
      "Pack-specific processing with QC warnings",
      "2D map and section previews",
      "Optional local Ollama assistant in the desktop app",
      "Stated limits instead of silent fakes",
    ],
    workflows: disciplineData.workflows,
    datasets: disciplineData.datasets,
    tools: [
      "Local processing DAG",
      "Grid and vector maps",
      "Pack QC reports",
      "Optional local Ollama",
    ],
  };
}

export const AI_INSIGHTS = [
  {
    id: "1",
    title: "High-Resistivity Anomaly Cluster",
    confidence: 0.94,
    severity: "warning" as const,
    summary:
      "A discrete resistivity high (>450 Ω·m) at 12–18 m depth correlates with a known quartz vein trend on Line 4.",
    recommendation:
      "Recommend infill ERT profile at station 840E with dipole spacing 2 m for target confirmation.",
  },
  {
    id: "2",
    title: "Conductive Layer Continuity",
    confidence: 0.87,
    severity: "info" as const,
    summary:
      "The conductive overburden (15–35 Ω·m) shows lateral continuity across Lines 2–6, consistent with clay-rich alluvium.",
    recommendation:
      "Incorporate borehole BH-03 resistivity log to constrain upper boundary in 2.5D inversion.",
  },
  {
    id: "3",
    title: "Suggested Drilling Zone",
    confidence: 0.91,
    severity: "critical" as const,
    summary:
      "Integrated resistivity and IP chargeability anomaly at (E 842, N 1205) exceeds 2σ background threshold.",
    recommendation:
      "Priority drill target: inclined core hole 45° azimuth 120°, depth 35 m.",
  },
];
