import type { CatalogRecord, ProjectCatalog } from "./types.ts";
import { VECTOR_ROLES, type VectorRoleAssignment, type VectorRoleId } from "./geojson-contract.ts";

export function applyReviewedVectorRole(record: CatalogRecord, role: VectorRoleId): CatalogRecord {
  if (!VECTOR_ROLES.includes(role)) {
    throw new Error("Vector role must be a declared layer purpose.");
  }
  const assignment: VectorRoleAssignment = {
    role,
    reviewed: true,
    reviewedAt: new Date().toISOString(),
    source: "user-assigned",
  };
  return {
    ...record,
    vectorRole: assignment,
    provenance: {
      ...record.provenance,
      notes: [
        ...(record.provenance.notes || []),
        `User assigned vector role '${role}'. This is source-layer purpose, not an AI geological interpretation.`,
      ],
    },
  };
}

export function mergeVectorRoleFromPrevious(
  record: CatalogRecord,
  previous?: ProjectCatalog | null
): CatalogRecord {
  const prior = previous?.records.find((item) => item.id === record.id);
  if (!prior?.vectorRole?.reviewed) return record;
  try {
    return applyReviewedVectorRole(record, prior.vectorRole.role);
  } catch {
    return record;
  }
}
