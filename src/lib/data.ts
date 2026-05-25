import type { AgentProfile, Discipline, DisciplineId } from "@/types";

export const DISCIPLINES: Discipline[] = [
  {
    id: "exploration",
    name: "Exploration Geophysics",
    shortName: "Exploration",
    description: "Subsurface imaging for resource exploration and mapping",
    icon: "compass",
    color: "#ffffff",
    datasets: ["Seismic surveys", "Gravity grids", "Magnetic maps"],
    workflows: ["Basin modeling", "Target generation", "Prospect evaluation"],
  },
  {
    id: "environmental",
    name: "Environmental Geophysics",
    shortName: "Environmental",
    description: "Contaminant plume mapping and site characterization",
    icon: "leaf",
    color: "#e5e5e5",
    datasets: ["GPR profiles", "EM conductivity", "Resistivity tomography"],
    workflows: ["Plume delineation", "UXO detection", "Landfill mapping"],
  },
  {
    id: "seismology",
    name: "Seismology",
    shortName: "Seismology",
    description: "Earthquake monitoring, wave propagation, and crustal imaging",
    icon: "waves",
    color: "#d4d4d4",
    datasets: ["Continuous waveforms", "Event catalogs", "Focal mechanisms"],
    workflows: ["Phase picking", "Hypocenter location", "Tomography"],
  },
  {
    id: "hydrogeophysics",
    name: "Hydrogeophysics",
    shortName: "Hydrogeophysics",
    description: "Aquifer characterization and groundwater flow monitoring",
    icon: "droplets",
    color: "#a3a3a3",
    datasets: ["TDEM soundings", "ERT profiles", "Well logs"],
    workflows: ["Aquifer delineation", "Salinity mapping", "Recharge analysis"],
  },
  {
    id: "data-analysis",
    name: "Geophysical Data Analysis",
    shortName: "Data Analysis",
    description: "Advanced signal processing and data inversion techniques",
    icon: "activity",
    color: "#737373",
    datasets: ["Raw sensor data", "Time-series", "Multi-modal arrays"],
    workflows: ["Noise reduction", "Signal processing", "Joint inversion"],
  },
  {
    id: "geotechnical",
    name: "Geotechnical Geophysics",
    shortName: "Geotechnical",
    description: "Near-surface site investigations for engineering projects",
    icon: "pickaxe",
    color: "#525252",
    datasets: ["MASW profiles", "Seismic refraction", "GPR"],
    workflows: ["Bedrock mapping", "Void detection", "Soil stiffness"],
  },
  {
    id: "geomatics",
    name: "Geomatics",
    shortName: "Geomatics",
    description: "Spatial data acquisition, geodesy, and precision surveying",
    icon: "map",
    color: "#7c9fc2",
    datasets: ["LiDAR point clouds", "GNSS baselines", "Photogrammetry DEMs"],
    workflows: ["Control network adjustment", "DEM generation", "Change detection"],
  },
];

export const FEATURES = [
  {
    title: "AI Interpretation Agents",
    description: "Discipline-specialized multi-agent systems for automated subsurface interpretation",
    icon: "brain",
  },
  {
    title: "Workflow Automation",
    description: "Visual pipeline builder with intelligent node suggestions and execution monitoring",
    icon: "workflow",
  },
  {
    title: "Scientific Visualization",
    description: "Publication-grade plots, 3D subsurface previews, and interactive anomaly overlays",
    icon: "chart",
  },
  {
    title: "Real-Time Processing",
    description: "Live inversion monitoring with streaming data validation and QC metrics",
    icon: "activity",
  },
  {
    title: "Cloud Workspaces",
    description: "Collaborative project environments with versioned datasets and audit trails",
    icon: "cloud",
  },
  {
    title: "Multi-Agent Collaboration",
    description: "Orchestrated agent teams for cross-disciplinary interpretation workflows",
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
      "Automated anomaly detection with confidence scoring",
      "Geologically-constrained inversion guidance",
      "Multi-dataset fusion and cross-validation",
      "Natural language interpretation summaries",
      "Workflow optimization recommendations",
    ],
    workflows: disciplineData.workflows,
    datasets: disciplineData.datasets,
    tools: [
      "Inversion Engine v4.2",
      "QC Dashboard",
      "3D Subsurface Viewer",
      "Report Generator",
      "Uncertainty Quantifier",
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
