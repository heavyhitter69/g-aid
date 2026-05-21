import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-plotly.js", "plotly.js"],
  devIndicators: false,
};

export default nextConfig;
