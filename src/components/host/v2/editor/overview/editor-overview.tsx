import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  ImageIcon,
  MapPin,
} from "lucide-react";
import { formatMoney } from "@/lib/currency/convert";
import { editorAttentionItems } from "@/lib/host/v2/editor-overview";
import {
  EDITOR_NAV_GROUPS,
  EDITOR_OVERVIEW_SLUG,
  editorSectionHref,
  findEditorSection,
  type EditorNavItem,
} from "@/lib/host/v2/editor-sections";
import { listingVisibility } from "@/lib/host/v2/listing-status";
import { resolveEditorLabel } from "@/lib/i18n/editor-label";
import { resolveListingStatus } from "@/lib/i18n/status-labels";
import {
  T,
  t as text,
  ti,
  tPlural,
  type TextTranslator,
  type Translator,
} from "@/lib/i18n/t";
import type { ListingEditorOverview } from "@/lib/services/listing-editor.service";

/**
 * The listing editor's front page.
 *
 * Opening a listing used to drop the host straight into Photos, which answers a
 * question they had not asked yet. This screen answers the one they did: *what state is
 * this listing in, and what still needs doing?* — and then gets out of the way. It is
 * an index, not a step: every section is one click from here in any order, and nothing
 * on it is a wizard.
 *
 * Every number on it is read from the listing, and every "needs attention" row comes
 * from `editorAttentionItems`, which is built on the same completion set that ticks the
 * rail. There is no second opinion about what "done" means, and nothing is flagged for
 * being merely optional.
 *
 * Rendered on the server so money, counts and status text arrive as finished strings —
 * the same reason the Availability and Pricing panes are server components.
 */

function SummaryLine({
  icon: Icon,
  children,
}: {
  icon: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-slate-600">
      <Icon className="size-3.5 shrink-0 text-slate-400" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

/** The short fact under a section's name. Absent where there is no honest fact to give
 *  — an arrival guide has no count and no state, so it gets no invented one. */
/** Exported so the editor's left column can label its cards with the same line the
 *  overview's cards use — one summary per section, not two that could disagree. */
export function sectionSummary(
  slug: string,
  overview: ListingEditorOverview,
  t: TextTranslator,
): string | null {
  switch (slug) {
    case "photos":
      return overview.photoCount === 0
        ? text(t, "host.editor.overview.summary.no_photos", "No photos yet")
        : tPlural(
            t,
            "host.editor.overview.summary.photos",
            overview.photoCount,
            "{n} photo",
            "{n} photos",
          ).text;
    case "basics":
      return overview.completeSections.includes("basics")
        ? text(t, "host.editor.overview.summary.basics_done", "Title and description are set")
        : text(t, "host.editor.overview.summary.basics_todo", "Still missing a title or a description");
    case "rooms":
      return overview.roomCount === 0
        ? text(t, "host.editor.overview.summary.no_rooms", "No rooms added yet")
        : tPlural(
            t,
            "host.editor.overview.summary.rooms",
            overview.roomCount,
            "{n} room or space",
            "{n} rooms and spaces",
          ).text;
    case "location":
      return (
        overview.locationLabel ??
        text(t, "host.editor.overview.summary.no_location", "No address yet")
      );
    case "amenities":
      return overview.amenityCount === 0
        ? text(t, "host.editor.overview.summary.no_amenities", "Nothing selected yet")
        : tPlural(
            t,
            "host.editor.overview.summary.amenities",
            overview.amenityCount,
            "{n} amenity",
            "{n} amenities",
          ).text;
    case "house-rules":
      return overview.houseRulesReviewed
        ? text(t, "host.editor.overview.summary.rules_done", "Reviewed")
        : text(t, "host.editor.overview.summary.rules_todo", "Not reviewed yet");
    case "payment-arrangements":
      return overview.paymentMethodsReviewed
        ? text(t, "host.editor.overview.summary.payment_done", "Reviewed")
        : text(t, "host.editor.overview.summary.payment_todo", "Not answered yet");
    case "pricing":
      return overview.nightlyRate
        ? ti(t, "host.editor.overview.summary.nightly", "{price} per night", {
            price: formatMoney(
              overview.nightlyRate.amount,
              overview.nightlyRate.currency,
              t.locale,
            ),
          }).text
        : text(t, "host.editor.overview.summary.no_price", "No nightly price set");
    case "availability":
      // The same two plain-language answers the Availability section itself offers, so
      // the card and the page it opens never describe the setting differently.
      return overview.availabilityMode === "CLOSED"
        ? text(t, "host.editor.availability.default_closed", "Only dates I open")
        : text(t, "host.editor.availability.default_open", "Available by default");
    default:
      return null;
  }
}

function SectionCard({
  item,
  listingId,
  overview,
  t,
}: {
  item: EditorNavItem;
  listingId: string;
  overview: ListingEditorOverview;
  t: Translator;
}) {
  const label = resolveEditorLabel(t, item.key, item.source);
  const summary = sectionSummary(item.slug, overview, t);
  const needsAttention = overview.attention.includes(item.slug);

  return (
    <li>
      <Link
        href={item.href(listingId)}
        className="flex h-full min-h-[4.5rem] items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1">
          <span
            className="flex items-center gap-1.5 text-sm font-medium text-slate-900"
            translate={label.translated ? "no" : undefined}
          >
            <span className="min-w-0 truncate">{label.text}</span>
            {/* The same mark the rail carries, so a card and a rail row never say
                different things about one section. */}
            {needsAttention && (
              <CircleAlert className="size-3.5 shrink-0 text-amber-600" aria-hidden />
            )}
          </span>
          {summary && (
            <span className="mt-0.5 block truncate text-sm text-slate-600">{summary}</span>
          )}
        </span>
        <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden />
      </Link>
    </li>
  );
}

export function EditorOverview({
  overview,
  t,
}: {
  overview: ListingEditorOverview;
  t: Translator;
}) {
  const status = resolveListingStatus(t, overview.status);
  const live = listingVisibility(overview.status) === "LIVE";
  const attention = editorAttentionItems({
    completeSections: overview.completeSections,
    hasPricing: overview.nightlyRate !== null,
    bookingRulesReady: overview.bookingRulesReady,
    streetViewSet: overview.streetViewSet,
  });

  return (
    <div className="mx-auto w-full max-w-3xl py-6 md:py-10">
      {/* The rail, the header and the browser tab all name this page; the heading is
          kept for the outline a screen reader reads, which has none of them. */}
      <h2 className="sr-only">
        <T t={t} k="host.editor.section.overview" source="Listing overview" />
      </h2>

      {/* Summary card. */}
      <section
        aria-label={text(t, "host.editor.overview.summary_label", "Listing summary")}
        className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:gap-5"
      >
        <span className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:aspect-square sm:w-28">
          {overview.coverUrl ? (
            <Image
              src={overview.coverUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 112px, 100vw"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
              <ImageIcon className="size-6" aria-hidden />
              <span className="px-2 text-center text-xs">
                <T t={t} k="host.editor.overview.no_cover" source="No cover photo" />
              </span>
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-lg font-semibold text-slate-900"
            data-user-generated-content
            translate="yes"
          >
            {overview.title}
          </h3>
          <div className="mt-1 space-y-1">
            <SummaryLine icon={MapPin}>
              {overview.locationLabel ? (
                <span data-user-generated-content translate="yes">
                  {overview.locationLabel}
                </span>
              ) : (
                <T
                  t={t}
                  k="host.editor.overview.summary.no_location"
                  source="No address yet"
                />
              )}
            </SummaryLine>
            <SummaryLine icon={live ? CheckCircle2 : CircleAlert}>
              {status.text}
            </SummaryLine>
          </div>

          {/* Only offered when a guest could actually open it: the public page exists
              for approved listings alone, so showing it on a draft would hand the host
              a link to a 404 and call it a preview. */}
          {live && (
            <Link
              href={`/properties/${overview.slug}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none"
            >
              <T t={t} k="host.editor.overview.view_as_guest" source="View as guest" />
              <ExternalLink className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </section>

      {/* Needs your attention. */}
      <section aria-labelledby="overview-attention" className="mt-8">
        <h3 id="overview-attention" className="text-base font-semibold text-slate-900">
          <T
            t={t}
            k="host.editor.overview.attention_title"
            source="Needs your attention"
          />
        </h3>

        {attention.length === 0 ? (
          <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-slate-600">
            <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden />
            <T
              t={t}
              k="host.editor.overview.attention_none"
              source="Nothing needs attention. Every section of this listing is filled in and it has a price."
            />
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {attention.map((item) => {
              const section = findEditorSection(item.slug);
              const label = section
                ? resolveEditorLabel(t, section.key, section.source)
                : { text: item.slug, translated: false };
              return (
                <li key={item.key}>
                  <Link
                    href={editorSectionHref(overview.id, item.slug)}
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 transition-colors hover:bg-amber-50 focus-visible:bg-amber-50 focus-visible:outline-none"
                  >
                    <CircleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-medium text-slate-900"
                        translate={label.translated ? "no" : undefined}
                      >
                        {label.text}
                      </span>
                      <span className="block text-sm text-slate-600">
                        {resolveEditorLabel(t, item.key, item.source).text}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* All sections, in the same order and the same groups as the left column — and
          hidden from `lg` up for exactly that reason. Above the split the column is always
          on screen beside this page, so repeating it here would show the same nine cards
          twice at once. Below the split there is no column, only a chip row, and this is
          the only place a host can see the whole listing at a glance. */}
      <section aria-labelledby="overview-sections" className="mt-10 lg:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="overview-sections" className="text-base font-semibold text-slate-900">
            <T t={t} k="host.editor.overview.sections_title" source="All sections" />
          </h3>
          <p className="text-sm text-slate-500">
            {attention.length === 0
              ? text(t, "host.editor.attention_clear", "Nothing needs attention")
              : tPlural(
                  t,
                  "host.editor.attention_count",
                  attention.length,
                  "{n} thing needs your attention",
                  "{n} things need your attention",
                ).text}
          </p>
        </div>

        {EDITOR_NAV_GROUPS.filter((group) => group.id !== "overview").map((group) => (
          <div key={group.id} className="mt-6">
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {resolveEditorLabel(t, group.key, group.source).text}
            </h4>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {group.items
                .filter((item) => item.slug !== EDITOR_OVERVIEW_SLUG)
                .map((item) => (
                  <SectionCard
                    key={item.slug}
                    item={item}
                    listingId={overview.id}
                    overview={overview}
                    t={t}
                  />
                ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
