/**
 * Public installer catalog. Looks up GitHub Releases; does not invent assets.
 * When no release exists, the website must show an unavailable state — not a fake download.
 */

export type InstallerPlatform = "win" | "mac" | "linux";

export type InstallerAsset = {
  name: string;
  url: string;
  size: number;
};

export type DownloadCatalog = {
  published: boolean;
  version: string | null;
  publishedAt: string | null;
  platforms: Partial<Record<InstallerPlatform, InstallerAsset>>;
  message: string;
};

export const GITHUB_OWNER = "heavyhitter69";
export const GITHUB_REPO = "g-aid";
export const NO_PUBLIC_RELEASE_MESSAGE =
  "No public installer release has been published yet. G-AID is a local desktop workspace; signed installers are not available from this site.";

type GithubAsset = {
  name?: string;
  browser_download_url?: string;
  size?: number;
};

type GithubRelease = {
  tag_name?: string;
  name?: string;
  published_at?: string;
  assets?: GithubAsset[];
};

export function emptyDownloadCatalog(message = NO_PUBLIC_RELEASE_MESSAGE): DownloadCatalog {
  return {
    published: false,
    version: null,
    publishedAt: null,
    platforms: {},
    message,
  };
}

export function matchPlatformAsset(
  assets: GithubAsset[],
  platform: InstallerPlatform
): InstallerAsset | null {
  for (const asset of assets) {
    const name = (asset.name || "").toLowerCase();
    const url = asset.browser_download_url;
    const size = typeof asset.size === "number" ? asset.size : 0;
    if (!url) continue;
    if (platform === "win" && name.endsWith(".exe") && !name.includes("uninstall")) {
      return { name: asset.name || "installer.exe", url, size };
    }
    if (platform === "mac" && name.endsWith(".dmg")) {
      return { name: asset.name || "installer.dmg", url, size };
    }
    if (platform === "linux" && (name.endsWith(".appimage") || name.endsWith(".deb"))) {
      return { name: asset.name || "installer.AppImage", url, size };
    }
  }
  return null;
}

export function catalogFromGithubRelease(release: GithubRelease | null | undefined): DownloadCatalog {
  if (!release || !Array.isArray(release.assets) || release.assets.length === 0) {
    return emptyDownloadCatalog();
  }
  const platforms: DownloadCatalog["platforms"] = {};
  for (const platform of ["win", "mac", "linux"] as const) {
    const asset = matchPlatformAsset(release.assets, platform);
    if (asset) platforms[platform] = asset;
  }
  if (Object.keys(platforms).length === 0) {
    return emptyDownloadCatalog(
      "A GitHub release exists, but it does not include Mac, Windows, or Linux installers."
    );
  }
  return {
    published: true,
    version: release.tag_name || release.name || null,
    publishedAt: release.published_at || null,
    platforms,
    message: "",
  };
}

export async function fetchDownloadCatalog(fetcher: typeof fetch = fetch): Promise<DownloadCatalog> {
  try {
    const res = await fetcher(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "G-AID-Download-Service",
        },
      }
    );
    if (res.status === 404) return emptyDownloadCatalog();
    if (!res.ok) {
      return emptyDownloadCatalog("Could not check GitHub Releases for installers. Try again later.");
    }
    const release = (await res.json()) as GithubRelease;
    return catalogFromGithubRelease(release);
  } catch {
    return emptyDownloadCatalog("Could not check GitHub Releases for installers. Try again later.");
  }
}
