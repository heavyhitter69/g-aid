import type { NextRequest } from "next/server";
import { loadProjectCatalog, refreshProjectCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const root = request.nextUrl.searchParams.get("root")?.trim() || "";
  if (!root) return Response.json({ error: "root is required" }, { status: 400 });
  const catalog = loadProjectCatalog(root);
  if (!catalog) return Response.json({ error: "catalog not found" }, { status: 404 });
  return Response.json(catalog);
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { root?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const root = typeof body.root === "string" ? body.root.trim() : "";
  if (!root) return Response.json({ error: "root is required" }, { status: 400 });
  try {
    const catalog = refreshProjectCatalog(root);
    return Response.json(catalog);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
