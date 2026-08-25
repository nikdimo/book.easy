import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/branding";
import { getListingsForSitemap } from "@/lib/services/property.service";

/*
 * Regenerated hourly rather than at build time: without this the whole sitemap is
 * baked into the deployment, and a listing approved afterwards would stay invisible
 * to crawlers until the next deploy.
 */
export const revalidate = 3600;

const origin = (process.env.NEXT_PUBLIC_APP_URL || SITE_URL).replace(/\/$/, "");

/** Photo URLs are stored same-origin and relative (`/uploads/...`), but a sitemap
 * only accepts absolute ones. Anything already absolute — the seeded picsum demo
 * content — is passed through untouched. */
function absolute(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: origin, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/properties`, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${origin}/newsletter`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/cookies`, changeFrequency: "yearly", priority: 0.2 },
  ];

  let listings: Awaited<ReturnType<typeof getListingsForSitemap>> = [];
  try {
    listings = await getListingsForSitemap();
  } catch {
    // A sitemap that omits listings is recoverable; one that 500s teaches the
    // crawler the URL is broken, so a database blip degrades to the static pages.
    return staticEntries;
  }

  const listingEntries = listings.flatMap((listing) => {
    const photos = listing.images.map((image) => absolute(image.url));
    const listingUrl = `${origin}/properties/${listing.slug}`;

    const entries: MetadataRoute.Sitemap = [
      {
        url: listingUrl,
        lastModified: listing.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      },
    ];

    // The photo tour is only worth submitting when it has something to show, and
    // it is where the images are declared: it is the page that actually presents
    // them, so that is the URL Google should return an image result against.
    if (photos.length > 0) {
      entries.push({
        url: `${listingUrl}/photos`,
        lastModified: listing.updatedAt,
        changeFrequency: "weekly",
        priority: 0.5,
        images: photos,
      });
    }

    return entries;
  });

  return [...staticEntries, ...listingEntries];
}
