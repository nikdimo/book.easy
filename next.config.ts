import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prefer project lockfile over a parent directory lockfile (e.g. user home).
  outputFileTracingRoot: path.join(process.cwd()),
  serverExternalPackages: ["@prisma/client", "prisma"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
