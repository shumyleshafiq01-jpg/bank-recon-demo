import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse uses fs — tell webpack it's server-only
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
