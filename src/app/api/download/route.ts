import { NextRequest, NextResponse } from "next/server";
import {
  fetchDownloadCatalog,
  type InstallerPlatform,
} from "@/lib/public-download";

function platformFrom(request: NextRequest): InstallerPlatform {
  const platform = request.nextUrl.searchParams.get("platform");
  if (platform === "mac" || platform === "linux" || platform === "win") return platform;
  return "win";
}

/**
 * GET /api/download?info=1
 * JSON catalog of the latest GitHub Release (or published: false).
 *
 * GET /api/download?platform=win
 * Redirects to the installer when a real release asset exists; otherwise 404 JSON.
 */
export async function GET(request: NextRequest) {
  const catalog = await fetchDownloadCatalog();
  if (request.nextUrl.searchParams.get("info") === "1") {
    return NextResponse.json(catalog);
  }

  const platform = platformFrom(request);
  const asset = catalog.platforms[platform];
  if (!catalog.published || !asset) {
    return NextResponse.json(
      { available: false, error: catalog.message, published: false },
      { status: 404 }
    );
  }
  return NextResponse.redirect(asset.url, 302);
}

export async function HEAD(request: NextRequest) {
  const catalog = await fetchDownloadCatalog();
  const platform = platformFrom(request);
  const asset = catalog.platforms[platform];
  if (!catalog.published || !asset) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Length": asset.size.toString(),
      "X-Filename": asset.name,
    },
  });
}
