import { NextRequest, NextResponse } from "next/server";

const GITHUB_OWNER = "heavyhitter69";
const GITHUB_REPO = "g-aid";

/**
 * GET /api/download?platform=win&arch=x64
 * Redirects the user to the latest GitHub Release asset for their platform.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") || "win";

  try {
    // Fetch the latest release from GitHub API
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
      next: { revalidate: 3600 }, // Cache for 1 hour to avoid API rate limits
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "G-AID-Download-Service"
      }
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: "No releases found on GitHub." }, { status: 404 });
      }
      throw new Error(`GitHub API returned ${res.status}`);
    }

    const release = await res.json();
    let assetUrl: string | null = null;

    // Find the right asset based on platform
    for (const asset of release.assets) {
      const name = asset.name.toLowerCase();
      
      if (platform === "win" && name.endsWith(".exe") && !name.includes("uninstall")) {
        assetUrl = asset.browser_download_url;
        break;
      }
      
      if (platform === "mac" && name.endsWith(".dmg")) {
        assetUrl = asset.browser_download_url;
        break;
      }
      
      if (platform === "linux" && name.endsWith(".AppImage")) {
        assetUrl = asset.browser_download_url;
        break;
      }
    }

    if (!assetUrl) {
      return NextResponse.json(
        { error: `Installer for platform "${platform}" not found in the latest release.` },
        { status: 404 }
      );
    }

    // Redirect the browser straight to the GitHub download URL
    return NextResponse.redirect(assetUrl, 302);
    
  } catch (err) {
    console.error("Download redirect error:", err);
    return NextResponse.json({ error: "Failed to locate download link." }, { status: 500 });
  }
}

/**
 * HEAD /api/download?platform=win&arch=x64
 * Returns metadata about the installer (file size) from the GitHub API.
 */
export async function HEAD(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") || "win";

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
      next: { revalidate: 3600 },
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "G-AID-Download-Service"
      }
    });

    if (!res.ok) return new NextResponse(null, { status: res.status === 404 ? 404 : 500 });

    const release = await res.json();
    let assetSize: number | null = null;
    let assetName: string | null = null;

    for (const asset of release.assets) {
      const name = asset.name.toLowerCase();
      
      if (platform === "win" && name.endsWith(".exe") && !name.includes("uninstall")) {
        assetSize = asset.size;
        assetName = asset.name;
        break;
      }
      if (platform === "mac" && name.endsWith(".dmg")) {
        assetSize = asset.size;
        assetName = asset.name;
        break;
      }
      if (platform === "linux" && name.endsWith(".AppImage")) {
        assetSize = asset.size;
        assetName = asset.name;
        break;
      }
    }

    if (!assetSize) return new NextResponse(null, { status: 404 });

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Length": assetSize.toString(),
        "X-Filename": assetName || "installer",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
