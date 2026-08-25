import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/branding";

const origin = (process.env.NEXT_PUBLIC_APP_URL || SITE_URL).replace(/\/$/, "");

/*
 * Chiefly here to advertise the sitemap, which is how the listing and photo-tour
 * URLs get discovered without waiting for a crawler to walk in from the homepage.
 * The disallow list is the signed-in half of the product: every path below is
 * already gated, so this saves crawl budget rather than protecting anything.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/host",
        "/account",
        "/messages",
        "/login",
        "/register",
        "/bookings/confirm",
        // Single-use token URLs. Nothing to index, and a crawler following one
        // would be acting on a link meant for one recipient.
        "/marketing/confirm",
        "/unsubscribe",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
