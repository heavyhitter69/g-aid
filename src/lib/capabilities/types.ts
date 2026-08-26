/**
 * Live scientific capability model. Magnetics and gravity are the registered packs.
 */

export const USER_CAPABILITY_IDS = [
  "mag.diurnal",
  "mag.igrf",
  "mag.headingLag",
  "mag.level",
  "mag.grid",
  "mag.rtp",
  "mag.derivatives",
  "mag.lineaments",
  "mag.gis",
  "grav.ingest",
  "grav.freeair",
  "grav.bouguer",
  "grav.grid",
  "grav.residual",
  "grav.gis",
  "grav.interpret",
] as const;

export type UserCapabilityId = (typeof USER_CAPABILITY_IDS)[number];

export type ReviewStatus = "accepted" | "refused" | "needs-data";

export interface CapabilityParameter {
  type: "string" | "number" | "boolean";
  required: boolean;
  description: string;
  defaultValue?: string | number | boolean;
  units?: string;
}

export interface CapabilityInputRole {
  role: "rover" | "base" | "corrected-points" | "grid" | "gravity-stations";
  adapterIds: string[];
  required: boolean;
  description: string;
}

export interface CapabilityOutput {
  id: string;
  type: "table" | "grid" | "vector" | "qc" | "report" | "workbook";
  description: string;
  viewer?: string;
}

export interface ScientificCapability {
  id: UserCapabilityId;
  version: string;
  title: string;
  description: string;
  domain: "magnetics" | "gravity";
  kernelNodeIds: string[];
  dependsOn: UserCapabilityId[];
  inputRoles: CapabilityInputRole[];
  outputs: CapabilityOutput[];
  parameters: Record<string, CapabilityParameter>;
  metadataRequirements: string[];
  scientificConstraints: string[];
  qcRequirements: string[];
  viewerTypes: string[];
  interpretationLimits: string[];
  expectedArtifacts: string[];
}

export interface CompiledDagNode {
  id: string;
  capabilityId: UserCapabilityId | "mag.prereq" | "grav.prereq";
  capabilityVersion?: string;
  label: string;
  dependencies: string[];
}

export interface CompiledDag {
  nodes: CompiledDagNode[];
  requestedCapabilityIds: UserCapabilityId[];
  capabilityVersions: Record<string, string>;
}

export interface ReviewDecision {
  at: string;
  message: string;
  status: ReviewStatus;
  capabilityId?: UserCapabilityId | string;
  reason: string;
}

export interface BoundInput {
  catalogId: string;
  path: string;
  kind?: string;
  size?: number;
  checksum?: string;
  supportStatus?: string;
  adapterId?: string | null;
  formatId?: string;
  columnMapping?: {
    x: string;
    y: string;
    gObs: string;
    elevation?: string;
    stationId?: string;
    datetime?: string;
    latitude?: string;
    reviewed: boolean;
    reviewedAt?: string;
  };
  elevationDatum?: string;
  units?: string;
  crs?: string;
}
