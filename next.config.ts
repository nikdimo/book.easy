import path from "node:path";
import type { NextConfig } from "next";

const distDir = process.env.NEXT_BUILD_DIR?.trim() || ".next";
const isProduction = process.env.NODE_ENV === "production";

// Static CSP keeps public pages cacheable. Inline scripts/styles are currently needed
// by Next.js and the Google Translate/Maps integrations; the remaining directives still
// prevent framing, plugins, unexpected form targets, and unapproved remote resources.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://www.googletagmanager.com https://maps.googleapis.com https://maps.gstatic.com https://translate.google.com https://translate.googleapis.com`,
  "style-src 'self' 'unsafe-inline' https://translate.googleapis.com",
  "img-src 'self' blob: data: https://*.google.com https://*.googleapis.com https://*.gstatic.com https://*.googleusercontent.com https://*.tile.openstreetmap.org",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self'${isProduction ? "" : " ws: http://localhost:* http://127.0.0.1:*"} https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://*.googleapis.com https://*.gstatic.com https://translate.google.com`,
  `frame-src 'self'${isProduction ? "" : " http://localhost:* http://127.0.0.1:*"} https://www.google.com`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Production deploys build into a staging directory, then atomically promote it
  // to .next only after every build check succeeds. `next start` does not set the
  // override, so it always serves the promoted .next directory.
  distDir,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
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
