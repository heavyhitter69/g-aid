import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(process.env.NODE_ENV === "production" ? { output: "standalone" } : {}),
  serverExternalPackages: ["xlsx", "mammoth"],
};

export default nextConfig;
