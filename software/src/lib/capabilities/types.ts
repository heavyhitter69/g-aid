/**
 * Live scientific capability model. Magnetics, gravity, ERT, radiometrics, GPR, LAS borehole, documented GeoJSON vectors, and documented geochemistry are the registered packs.
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
  "grav.terrain_near_zone",
  "grav.terrain_intermediate_zone",
  "grav.terrain_far_zone",
  "grav.grid",
  "grav.residual",
  "grav.gis",
  "grav.interpret",
  "ert.ingest",
  "ert.pseudosection",
  "ert.invert2d",
  "ert.gis",
  "ert.interpret",
  "rad.ingest",
  "rad.grid",
  "rad.ternary",
  "rad.ratios",
  "rad.gis",
  "rad.interpret",
  "gpr.ingest",
  "gpr.process",
  "gpr.migrate",
  "gpr.gis",
  "gpr.interpret",
  "borehole.ingest_las",
  "borehole.view_logs",
  "borehole.map_collar",
  "borehole.interpret",
  "gis.vector_ingest",
  "gis.vector_view",
  "gis.spatial_overlap",
  "gis.export_vector",
  "gis.interpret",
  "gis.raster_inspect",
  "gis.raster_view",
  "gis.terrain_view",
  "geochem.ingest",
  "geochem.qc",
  "geochem.map_points",
  "geochem.summary",
  "geochem.display_transform",
  "geochem.interpret",
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
  role: "rover" | "base" | "corrected-points" | "grid" | "gravity-stations" | "dem" | "ert-measurements" | "radiometric-stations" | "gpr-section" | "well-log" | "gis-vector" | "gis-raster" | "geochem-samples";
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
  domain: "magnetics" | "gravity" | "resistivity" | "radiometrics" | "gpr" | "borehole" | "gis" | "geochemistry";
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
  /** omitted means supported for existing magnetic/gravity ids */
  supportLevel?: "supported" | "experimental";
}

export interface CompiledDagNode {
  id: string;
  capabilityId: UserCapabilityId | "mag.prereq" | "grav.prereq" | "ert.prereq" | "rad.prereq" | "gpr.prereq" | "borehole.prereq" | "gis.prereq" | "geochem.prereq";
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
  radioMapping?: {
    x: string;
    y: string;
    line: string;
    k?: string;
    eu?: string;
    eth?: string;
    tc?: string;
    reviewed: boolean;
    reviewedAt?: string;
  };
  geochemMapping?: {
    sampleId: string;
    x: string;
    y: string;
    medium?: string;
    elements: Array<{
      column: string;
      symbol: string;
      units: string;
      qualifierColumn?: string;
      detectionLimitColumn?: string;
    }>;
    qcFlag?: string;
    batch?: string;
    date?: string;
    lab?: string;
    method?: string;
    reviewed: boolean;
    reviewedAt?: string;
  };
  sampleMedium?: string;
  lab?: string;
  analyticalMethod?: string;
  detectionLimitTreatment?: string;
  radioQuantity?: string;
  correctionHistory?: string;
  acquisitionPlatform?: string;
  instrument?: string;
  elevationDatum?: string;
  units?: string;
  crs?: string;
  bbox?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  cellSizeM?: number;
  dtNs?: number;
  dxM?: number;
  antennaMHz?: number;
  velocityMs?: number;
  wellId?: string;
  curves?: string[];
  curveUnits?: string[];
  nullValue?: number;
  startDepth?: number;
  stopDepth?: number;
  step?: number;
  wrap?: string;
  lasVersion?: string;
  depthIndex?: string;
  depthUnits?: string;
  collarX?: number;
  collarY?: number;
  collarZ?: number;
  coordinateKind?: "geographic" | "easting-northing" | "unknown";
  locationQuality?: "documented" | "user-confirmed" | "missing";
  collarMappable?: boolean;
  geometryTypes?: string[];
  attributeNames?: string[];
  vectorRole?: {
    role: "geology" | "structure" | "tenure" | "alteration" | "mine-feature" | "sample-location" | "generic-vector";
    reviewed: boolean;
    reviewedAt?: string;
    source: "user-assigned" | "unassigned";
  };
  geojsonContract?: "rfc7946" | "legacy-geojson" | "g-aid-custom-import";
  crsSource?: "rfc7946" | "legacy-crs" | "companion-prj" | "epsg-comment" | "user-confirmed" | "shapefile-prj" | "geotiff-geokeys";
  axisOrder?: "lon-lat" | "lat-lon" | "east-north" | "unknown";
  coordinateOrder?: "lon-lat" | "lat-lon" | "east-north" | "unknown";
}
