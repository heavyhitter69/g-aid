import type { NextConfig } from "next";

const lightBuild = process.env.GAID_LIGHT_BUILD === "1";

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
  ...(lightBuild
    ? {
        typescript: { ignoreBuildErrors: true },
        experimental: { cpus: 1, workerThreads: false },
        webpack: (config) => {
          config.parallelism = 1;
          return config;
        },
      }
    : {}),
};

export default nextConfig;
