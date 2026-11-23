import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // CIS statements and other PDFs are uploaded through the app (signed-in Batt staff only).
    serverActions: { bodySizeLimit: "16mb" },
  },
};

export default nextConfig;
