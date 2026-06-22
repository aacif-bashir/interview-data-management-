import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mongoose/mongodb are auto-externalized in Next 16, but we list mongoose
  // explicitly so the intent is clear and stays stable across upgrades.
  serverExternalPackages: ["mongoose"],
};

export default nextConfig;
