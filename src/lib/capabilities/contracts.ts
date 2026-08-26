import type { CatalogRecord, ProjectCatalog } from "../catalog/types.ts";
import { findRecord } from "../catalog/summarize.ts";
import { expandCapabilityIds } from "./compile.ts";
import { isRegisteredCapability } from "./registry.ts";
import type { BoundInput, CompiledDag } from "./types.ts";

export interface ContractIssue {
  level: "blocker" | "warning" | "note";
  code: string;
  message: string;
}

function hasIAndD(parameters: { inclination?: number; declination?: number }): boolean {
  return typeof parameters.inclination === "number" && typeof parameters.declination === "number";
}

function boundSupported(inputs: BoundInput[], adapterId: string): BoundInput[] {
  return inputs.filter(
    (item) =>
      item.supportStatus === "supported" &&
      (item.adapterId === adapterId || item.kind === adapterId || (adapterId === "gsm19" && item.kind === "gsm19-base"))
  );
}

export function unsupportedBoundInputs(inputs: BoundInput[], catalog?: ProjectCatalog | null): BoundInput[] {
  return inputs.filter((item) => {
    if (item.supportStatus && item.supportStatus !== "supported") return true;
    if (!item.catalogId) return true;
    if (!catalog) return false;
    const record = findRecord(catalog, item.catalogId);
    if (!record) return true;
    return record.supportStatus !== "supported";
  });
}

export function validateCapabilityContracts(options: {
  capabilityIds: string[];
  inputs: BoundInput[];
  parameters: { inclination?: number; declination?: number; surveyDate?: string; baseReference?: string };
  catalog?: ProjectCatalog | null;
  dag?: CompiledDag | null;
}): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const ids = options.capabilityIds.filter(Boolean);
  const expanded = expandCapabilityIds(ids);
  for (const id of ids) {
    if (!isRegisteredCapability(id)) {
      issues.push({
        level: "blocker",
        code: "unregistered_capability",
        message: `${id} is not a registered capability. Gravity, ERT, seismic, GPR, GIS processing, and other packs are not in this release.`,
      });
    }
  }

  const bad = unsupportedBoundInputs(options.inputs, options.catalog);
  if (bad.length) {
    issues.push({
      level: "blocker",
      code: "unsupported_catalog_input",
      message:
        "Recognised-unsupported and unknown catalog records cannot bind to a capability. Bind supported MagArrow and GSM-19 records only.",
    });
  }

  const magarrow = boundSupported(options.inputs, "magarrow");
  const gsm19 = boundSupported(options.inputs, "gsm19");
  const needsRoverBase = expanded.includes("mag.diurnal");
  if (needsRoverBase && options.inputs.length) {
    if (magarrow.length === 0 && gsm19.length === 0) {
      issues.push({
        level: "blocker",
        code: "no_mag_files",
        message: "Diurnal correction needs supported MagArrow and GSM-19 catalog records. I will not search the folder by extension.",
      });
    } else if (magarrow.length === 0 || gsm19.length === 0) {
      issues.push({
        level: "blocker",
        code: "incomplete_mag",
        message:
          magarrow.length === 0
            ? "Diurnal correction needs MagArrow rover catalog records as well as the GSM-19 base."
            : "Diurnal correction needs GSM-19 base-station catalog records as well as MagArrow rover data.",
      });
    }
  }

  if (ids.includes("mag.rtp")) {
    const hasIgrf = ids.includes("mag.igrf");
    if (!hasIgrf && !hasIAndD(options.parameters)) {
      issues.push({
        level: "blocker",
        code: "rtp_needs_field_params",
        message:
          "RTP needs a valid grid plus inclination and declination, or mag.igrf as the documented source of those field parameters. I will not invent I/D or silently add IGRF.",
      });
    }
  }

  if (expanded.includes("mag.grid") && options.inputs.length && magarrow.length === 0) {
    issues.push({
      level: "blocker",
      code: "grid_needs_corrected_spatial",
      message: "Gridding needs diurnally corrected MagArrow spatial data. I will not grid raw or unsupported tables.",
    });
  }

  return issues;
}

export function catalogRecordsForInputs(inputs: BoundInput[], catalog: ProjectCatalog | null): CatalogRecord[] {
  if (!catalog) return [];
  return inputs
    .map((item) => findRecord(catalog, item.catalogId))
    .filter((record): record is CatalogRecord => Boolean(record));
}

export type { UserCapabilityId };
