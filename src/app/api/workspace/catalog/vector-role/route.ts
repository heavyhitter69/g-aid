import type { NextRequest } from "next/server";
import { loadProjectCatalog, writeProjectCatalog } from "@/lib/catalog";
import { applyReviewedVectorRole } from "@/lib/catalog/vector-role";
import { VECTOR_ROLES, type VectorRoleId } from "@/lib/catalog/geojson-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  let body: { root?: string; catalogId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const root = typeof body.root === "string" ? body.root.trim() : "";
  const catalogId = typeof body.catalogId === "string" ? body.catalogId.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!root || !catalogId || !role) {
    return Response.json({ error: "root, catalogId, and role are required" }, { status: 400 });
  }
  if (!(VECTOR_ROLES as readonly string[]).includes(role)) {
    return Response.json({ error: "Vector role must be a declared layer purpose." }, { status: 400 });
  }
  const catalog = loadProjectCatalog(root);
  if (!catalog) return Response.json({ error: "catalog not found" }, { status: 404 });
  const record = catalog.records.find((item) => item.id === catalogId);
  if (!record) return Response.json({ error: "catalog record not found" }, { status: 404 });
  if (record.adapterId !== "geojson") {
    return Response.json({ error: "Vector roles apply only to GeoJSON catalog records." }, { status: 400 });
  }
  try {
    const updated = applyReviewedVectorRole(record, role as VectorRoleId);
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
