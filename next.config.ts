import path from "node:path";
import type { NextConfig } from "next";

const distDir = process.env.NEXT_BUILD_DIR?.trim() || ".next";
const deployTsconfig = process.env.NEXT_BUILD_DIR?.trim()
  ? "tsconfig.deploy.json"
  : "tsconfig.json";
const isProduction = process.env.NODE_ENV === "production";

// Static CSP keeps public pages cacheable. Inline scripts/styles are currently needed
// by Next.js and the Google Translate/Maps integrations; the remaining directives still
// prevent framing, plugins, unexpected form targets, and unapproved remote resources.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://www.googletagmanager.com https://maps.googleapis.com https://maps.gstatic.com https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com`,
  "style-src 'self' 'unsafe-inline' https://translate.googleapis.com https://www.gstatic.com https://fonts.googleapis.com",
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

/*
 * `/host` is the one public URL for the host product. The implementation still lives
 * under `/host/v2` internally so the retired route files can remain in the tree during
 * the migration, but before-files rewrites make the new panel win over those files while
 * keeping the clean URL in the browser.
 *
 * Redirects preserve old bookmarks and sent links. They are temporary (307), so this
 * migration is never cached forever by a browser. `/admin` is intentionally absent: it
 * is the separate staff moderation product, not the host panel.
 */
type RedirectRule = Awaited<ReturnType<NonNullable<NextConfig["redirects"]>>>[number];
type RewriteRule = { source: string; destination: string };

export const hostV1Redirects: RedirectRule[] = [
  // The temporary implementation URL is no longer public branding.
  { source: "/host/v2", destination: "/host", permanent: false },
  { source: "/host/v2/:path*", destination: "/host/:path*", permanent: false },
  { source: "/host/mobile", destination: "/host", permanent: false },

  // Listing creation. The classic wizard carried its draft in `?draft=`; `/host/start/resume`
  // is the V2 route that reopens an owned draft at the step it stopped on, and it verifies
  // ownership itself. Ordered before the `:id` rules below, which would otherwise treat
  // "new" as a listing id.
  {
    source: "/host/listings/new",
    has: [{ type: "query", key: "draft" }],
    destination: "/host/start/resume",
    permanent: false,
  },
  { source: "/host/listings/new", destination: "/host/start/new", permanent: false },

  { source: "/host/listings/:id/edit", destination: "/host/listings/:id", permanent: false },
  // The new panel has no standalone promotion page: promotions are a calendar lens, opened
  // on one listing via `?listing=`. An id that is not this host's simply is not in the
  // calendar payload, so the parameter grants nothing.
  {
    source: "/host/listings/:id/promotion",
    destination: "/host/calendar?listing=:id",
    permanent: false,
  },

  // Classic terminology remains compatible with the new navigation labels.
  { source: "/host/bookings", destination: "/host/reservations", permanent: false },
  {
    source: "/host/bookings/:id",
    destination: "/host/reservations/:id",
    permanent: false,
  },

  { source: "/host/inbox", destination: "/host/messages", permanent: false },
  { source: "/host/inbox/:id", destination: "/host/messages/:id", permanent: false },
];

/** Clean public Host URLs mapped to the already-proven new-panel route files. */
export const hostCanonicalRewrites: RewriteRule[] = [
  { source: "/host", destination: "/host/v2" },
  { source: "/host/calendar", destination: "/host/v2/calendar" },
  { source: "/host/listings", destination: "/host/v2/listings" },
  { source: "/host/listings/:id", destination: "/host/v2/listings/:id" },
  {
    source: "/host/listings/:id/:section",
    destination: "/host/v2/listings/:id/:section",
  },
  { source: "/host/reservations", destination: "/host/v2/reservations" },
  { source: "/host/reservations/:id", destination: "/host/v2/reservations/:id" },
  { source: "/host/messages", destination: "/host/v2/messages" },
  { source: "/host/messages/:id", destination: "/host/v2/messages/:id" },
];

const nextConfig: NextConfig = {
  // Production deploys build into a staging directory, then atomically promote it
  // to .next only after every build check succeeds. `next start` does not set the
  // override, so it always serves the promoted .next directory.
  distDir,
  // Candidate deploys build beside the live `.next` directory. Their type check must
  // ignore the live build's generated route validators, which can legitimately refer
  // to routes removed by the candidate source. The deploy config still checks all
  // source and the candidate build's own generated route types.
  typescript: {
    tsconfigPath: deployTsconfig,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return hostV1Redirects;
  },
  async rewrites() {
    return { beforeFiles: hostCanonicalRewrites };
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
    // AVIF first, WebP for everything that can't take it. Listing photos are already
    // lossy phone JPEGs, so the re-encode is a second generation loss and the format
    // has to buy back the headroom. NOTE for the proxy in front of this app: the
    // variant is chosen from the request's `Accept` header, so nginx has to forward
    // it and must not cache these responses without honouring `Vary: Accept`.
    formats: ["image/avif", "image/webp"],
    // An allowlist, not a default, since Next 16 — `quality={85}` anywhere in the app
    // fails unless the number appears here. 75 stays for cards and thumbnails, where
    // the extra bytes buy nothing; 85 is for the gallery, where the photo is the
    // content and 75 visibly muddies an interior shot.
    qualities: [75, 85],
    // Uploaded photos never change behind their URL, so the 4 hour default just means
    // re-encoding the same file forever — which on a single VPS is paid for by
    // whichever visitor arrives first, and AVIF is the slow one to encode.
    minimumCacheTTL: 2678400,
  },
};

export default nextConfig;
