import type { AgentProfile, Discipline, DisciplineId } from "@/types";

export const DISCIPLINES: Discipline[] = [
  {
    id: "seismic",
    name: "Seismic Interpretation",
    shortName: "Seismic",
    description: "Reflection tomography, velocity modeling, and horizon tracking",
    icon: "waves",
    color: "#ffffff",
    datasets: ["SEG-Y volumes", "Shot gathers", "Velocity models"],
    workflows: ["Stack processing", "Migration", "Attribute extraction"],
  },
  {
    id: "resistivity",
    name: "Electrical Resistivity",
    shortName: "Resistivity",
    description: "ERT, IP, and induced polarization subsurface imaging",
    icon: "zap",
    color: "#e5e5e5",
    datasets: ["ERT profiles", "IP chargeability", "Borehole logs"],
    workflows: ["Inversion", "Joint interpretation", "Anomaly mapping"],
  },
  {
    id: "groundwater",
    name: "Groundwater Exploration",
    shortName: "Groundwater",
    description: "Aquifer characterization and water table mapping",
    icon: "droplets",
    color: "#d4d4d4",
    datasets: ["TDEM soundings", "Magnetotelluric", "Well logs"],
    workflows: ["Aquifer delineation", "Salinity mapping", "Recharge analysis"],
  },
  {
    id: "oil-gas",
    name: "Oil & Gas",
    shortName: "Oil & Gas",
    description: "Reservoir geophysics and prospect evaluation",
    icon: "fuel",
    color: "#a3a3a3",
    datasets: ["3D seismic", "Well ties", "Rock physics"],
    workflows: ["Prospect ranking", "AVO analysis", "Reservoir characterization"],
  },
  {
    id: "mining",
    name: "Mining Exploration",
    shortName: "Mining",
    description: "Ore body detection and structural mapping",
    icon: "pickaxe",
    color: "#737373",
    datasets: ["Gravity grids", "EM surveys", "Drill core"],
    workflows: ["Target generation", "Depth estimation", "Resource modeling"],
  },
  {
    id: "gravity-magnetic",
    name: "Gravity & Magnetic",
    shortName: "Grav/Mag",
    description: "Potential field interpretation and modeling",
    icon: "compass",
    color: "#525252",
    datasets: ["Bouguer gravity", "TMI/RTP magnetic", "Gradient tensors"],
    workflows: ["Regional-residual separation", "Euler deconvolution", "3D inversion"],
  },
  {
    id: "environmental",
    name: "Environmental Geophysics",
    shortName: "Environmental",
    description: "Contaminant plume mapping and site characterization",
    icon: "leaf",
    color: "#404040",
    datasets: ["GPR profiles", "EM conductivity", "Resistivity tomography"],
    workflows: ["Plume delineation", "UXO detection", "Landfill mapping"],
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
    seismic: "Seismic Horizon & Attribute Agent",
    resistivity: "Electrical Resistivity Interpretation Agent",
    groundwater: "Hydrogeophysical Characterization Agent",
    "oil-gas": "Reservoir Geophysics Agent",
    mining: "Mineral Exploration Targeting Agent",
    "gravity-magnetic": "Potential Field Modeling Agent",
    environmental: "Environmental Site Characterization Agent",
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
