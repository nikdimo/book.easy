import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingAvailabilityOverview } from "@/lib/services/listing-availability-overview.service";
import { getHostCalendarListingContext } from "@/lib/services/host-calendar-workspace.service";
import { getT } from "@/lib/i18n/t";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { AvailabilitySummary } from "@/components/host/v2/editor/availability-summary";
import { AvailabilityDefaultEditor } from "@/components/host/v2/editor/availability-default-editor";

/**
 * Availability: the listing's default here, particular dates on the calendar.
 *
 * Every read is scoped to this host inside its own query, so a listing that is not
 * theirs is `notFound()` rather than a page that tells them it exists. The one thing
 * this route can change — how an untouched future date begins — goes through the same
 * server action the calendar used to call, which re-checks ownership on its own.
 *
 * Two reads rather than one because they answer different questions. The overview is
 * the narrow "what is open and what is blocked" summary; the calendar context is the
 * blocks, windows and reservations the review model needs to say what changing the
 * default would actually do to this listing's dates.
 *
 * `attention` never names this section: every listing has a stored default, so there is
 * no unfinished state here for the rail to flag.
 */
export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, t] = await Promise.all([requireHostPage(), getT()]);
  const [listing, overview, context] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingAvailabilityOverview(id, user.id),
    // The catalog locale, so the money and date patterns in the confirmation match the
    // words around them rather than whatever locale data the browser happens to ship.
    getHostCalendarListingContext(id, user.id, t.locale),
  ]);
  if (!listing || !overview || !context) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="availability"
      attention={listing.attention}
      previewSlug={listing.slug}
      previewStatus={listing.status}
    >
      <AvailabilitySummary
        overview={overview}
        defaultsEditor={<AvailabilityDefaultEditor context={context} />}
        t={t}
      />
    </EditorFrame>
  );
}
