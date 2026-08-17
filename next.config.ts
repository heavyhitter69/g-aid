import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(process.env.NODE_ENV === "production" ? { output: "standalone" } : {}),
  serverExternalPackages: ["xlsx", "mammoth"],
  outputFileTracingExcludes: {
    "*": [
      "python/**",
      "electron/**",
      "dist_desktop/**",
      "resources/**",
    ],
  },
};

export default nextConfig;
