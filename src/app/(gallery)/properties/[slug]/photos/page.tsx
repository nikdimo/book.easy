import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PhotoTour } from "@/components/public/photo-tour";
import { getListingBySlug } from "@/lib/services/property.service";
import { getT } from "@/lib/i18n/t";

/*
 * The photo tour is its own URL rather than a dialog over the listing, which is
 * what every large travel site settled on and what a dialog cannot give you:
 * the back button closes the gallery instead of leaving the page, a single photo
 * is linkable, and search engines can index the images. It sits outside the
 * `(public)` group on purpose — that layout supplies the header, footer and
 * scroll shell, and a takeover wants none of them.
 */

interface PhotoTourPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PhotoTourPageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: "Not Found" };
  const t = await getT();

  return {
    title: `${listing.title} · ${t.resolve("gallery.photos", "Photos").text}`,
    alternates: { canonical: `/properties/${slug}/photos` },
  };
}

export default async function PhotoTourPage({ params }: PhotoTourPageProps) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing || listing.images.length === 0) notFound();

  return (
    // `useSearchParams` needs a boundary to suspend against while the client
    // bundle hydrates; the grid is what the visitor asked for, so the fallback
    // is just its surface rather than a spinner.
    <Suspense fallback={<div className="h-dvh bg-background" />}>
      <PhotoTour slug={slug} images={listing.images} />
    </Suspense>
  );
}
