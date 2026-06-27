import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * firebase-admin pulls in jwks-rsa → jose (ESM-only).
   * Listing it here tells Next.js / Turbopack to leave these packages as
   * native Node require() calls instead of bundling them, which prevents
   * the "ERR_REQUIRE_ESM" crash at runtime on Vercel.
   */
  serverExternalPackages: [
    "firebase-admin",
    "firebase-admin/app",
    "firebase-admin/auth",
    "firebase-admin/firestore",
    "jwks-rsa",
    "jose",
  ],
};

export default nextConfig;
