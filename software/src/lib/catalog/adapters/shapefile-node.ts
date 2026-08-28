import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  inspectShapefileDataset,
  type ShapefileInspect,
  type ShapefileSidecars,
} from "../shapefile-contract.ts";
import { UNASSIGNED_VECTOR_ROLE } from "../geojson-contract.ts";

function present(absPath: string): boolean {
  try {
    return fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

function sha256(absPath: string): string | undefined {
  try {
    return createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
  } catch {
    return undefined;
  }
}

/** Node-only full sidecar parse. Do not import from client catalog adapters. */
export function inspectShapefilePath(absPath: string, siblingNames?: string[]): ShapefileInspect {
  const filename = path.basename(absPath);
  const stem = filename.replace(/\.shp$/i, "");
  const names = new Set((siblingNames || []).map((name) => name.toLowerCase()));
  const dir = path.dirname(absPath);
  const find = (ext: string) => {
    const wanted = `${stem.toLowerCase()}${ext}`;
    const match = [...names].find((name) => name === wanted);
    return match ? path.join(dir, match) : path.join(dir, `${stem}${ext}`);
  };
  const shxPath = find(".shx");
  const dbfPath = find(".dbf");
  const prjPath = find(".prj");
  const cpgPath = find(".cpg");
  const sidecars: ShapefileSidecars = {
    shp: true,
    shx: present(shxPath),
    dbf: present(dbfPath),
    prj: present(prjPath),
    cpg: present(cpgPath),
  };
  let shp = Buffer.alloc(0);
  try {
    shp = fs.readFileSync(absPath);
  } catch (err) {
    return {
      looksLikeShapefile: false,
      sidecars,
      geometryTypes: [],
      featureCount: 0,
      validFeatureCount: 0,
      attributeNames: [],
      locationQuality: "missing",
      vectorRole: UNASSIGNED_VECTOR_ROLE,
      errors: [`Shapefile could not be read: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
  return inspectShapefileDataset({
    shp,
    shx: sidecars.shx ? fs.readFileSync(shxPath) : undefined,
    dbf: sidecars.dbf ? fs.readFileSync(dbfPath) : undefined,
    prjText: sidecars.prj ? fs.readFileSync(prjPath, "utf8") : undefined,
    cpgText: sidecars.cpg ? fs.readFileSync(cpgPath, "utf8") : undefined,
    sidecars,
    checksums: {
      shp: sha256(absPath),
      shx: sidecars.shx ? sha256(shxPath) : undefined,
      dbf: sidecars.dbf ? sha256(dbfPath) : undefined,
      prj: sidecars.prj ? sha256(prjPath) : undefined,
      cpg: sidecars.cpg ? sha256(cpgPath) : undefined,
    },
  });
}
