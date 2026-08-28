import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(process.env.NODE_ENV === "production" ? { output: "standalone" } : {}),
  transpilePackages: ["@g-aid/auth-contract", "@g-aid/branding"],
};

export default nextConfig;
