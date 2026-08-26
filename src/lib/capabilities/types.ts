/**
 * Live scientific capability model. Magnetic operations are the only
 * registered, executable capabilities in this release.
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
  role: "rover" | "base" | "corrected-points" | "grid";
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
  domain: "magnetics";
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
  capabilityId: UserCapabilityId | "mag.prereq";
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
}
