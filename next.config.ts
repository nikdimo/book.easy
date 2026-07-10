import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prefer project lockfile over a parent directory lockfile (e.g. user home).
  outputFileTracingRoot: path.join(process.cwd()),
  serverExternalPackages: ["@prisma/client", "prisma"],
  images: {
    // Real listing photos are same-origin (`/uploads/...`) and don't need a remote
    // pattern at all. `picsum.photos` is allowlisted only because prisma/seed.ts still
    // seeds demo listings with it — drop this entry once seed data is replaced with
    // real content (see docs/planning/phase-1-scope.md launch checklist).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
};

export default nextConfig;
