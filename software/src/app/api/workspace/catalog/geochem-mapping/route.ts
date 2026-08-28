import type { NextRequest } from "next/server";
import { loadProjectCatalog, writeProjectCatalog } from "@/lib/catalog";
import { applyReviewedGeochemMapping } from "@/lib/catalog/geochem-mapping";
import type { GeochemColumnMapping } from "@/lib/catalog/geochem-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  let body: {
    root?: string;
    catalogId?: string;
    mapping?: GeochemColumnMapping;
    crs?: string;
    units?: string;
    medium?: string;
    lab?: string;
    method?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const root = typeof body.root === "string" ? body.root.trim() : "";
  const catalogId = typeof body.catalogId === "string" ? body.catalogId.trim() : "";
  if (!root || !catalogId || !body.mapping) {
    return Response.json({ error: "root, catalogId, and mapping are required" }, { status: 400 });
  }
  const catalog = loadProjectCatalog(root);
  if (!catalog) return Response.json({ error: "catalog not found" }, { status: 404 });
  const record = catalog.records.find((item) => item.id === catalogId);
  if (!record) return Response.json({ error: "catalog record not found" }, { status: 404 });
  if (record.adapterId !== "geochem-csv" && record.adapterId !== "geochem-xyz") {
    return Response.json({ error: "Geochemistry mapping applies only to G-AID GEOCHEM catalog records." }, { status: 400 });
  }
  try {
    const updated = applyReviewedGeochemMapping(record, body.mapping, {
      crs: body.crs,
      units: body.units,
      medium: body.medium,
      lab: body.lab,
      method: body.method,
    });
    const next = {
      ...catalog,
      records: catalog.records.map((item) => (item.id === catalogId ? updated : item)),
    };
    writeProjectCatalog(next);
    return Response.json(next);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
