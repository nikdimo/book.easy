"use client";

import {
  AlertTriangle,
  BedDouble,
  CalendarRange,
  Check,
  Clock,
  Home,
  Images,
  MapPin,
  PencilLine,
  Sparkles,
  Tag,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/currency/convert";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { flowStepHref, publishBlockers } from "@/lib/host/v2/listing-publish-readiness";
import { houseRulesFromDraft } from "@/lib/host/v2/listing-house-rules-draft";
import {
  houseRulesRowData,
  houseRulesSnapshot,
} from "@/lib/host/v2/listing-house-rules";
import { houseRuleLines } from "@/lib/i18n/house-rules-labels";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { LISTING_SPACE_TYPES, type ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { cn } from "@/lib/utils";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

/**
 * The last screen of the create flow: everything the host answered, in one list, and a
 * Publish button.
 *
 * UI only, and unusually literally so. Every earlier step in this flow keeps its answers
 * in its own component and drops them on navigation — the flow carries only
 * `propertyType` and `spaceType`, in the URL. So the only two rows this screen can fill
 * with real values are those two; the rest say where their answer will come from once
 * the phase is stitched together, rather than printing an invented address, price or
 * photo count that no host ever typed.
 *
 * Publishing is the same story: it moves this component to its confirmation state and
 * nothing else. No action, no draft, no write. The confirmation says so in the copy,
 * because a success screen that looks real is exactly how a prototype gets mistaken for
 * a live listing.
 */
export function ReviewStep({
  propertyType,
  spaceType,
  today,
  initialPublished = false,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** Today as a civil date in the marketplace's zone, from the server, so the "that date
   *  has passed" blocker agrees with the publish gate rather than with whatever zone the
   *  host's browser happens to be in. */
  today?: string;
  /** Test seam, and the reason the confirmation is reachable in a static render. */
  initialPublished?: boolean;
}) {
  const i18n = useI18n();
  const { locale, resolve } = i18n;
  const { data } = useHostStartDraft();
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  const [published, setPublished] = useState(initialPublished);
  /** What the server refused, once it has. Kept apart from the blockers computed from
   *  the draft: it is the one message this screen could not have predicted — a currency
   *  that stopped being quotable, a draft changed in another tab — and it has to appear
   *  next to a list that still looks complete. */
  const [publishError, setPublishError] = useState<string | null>(null);

  /**
   * The last gate before publishing, and the only one that sees the whole draft.
   *
   * Every step already refuses to navigate on its own invalid fields, so a host who
   * walked the flow arrives here with an empty list. It fills for the drafts that did
   * not arrive that way — legacy rows from the classic wizard, imported listings,
   * cross-step conflicts, and anything a second tab changed underneath this one — and
   * every entry links to the step that owns it.
   */
  // The draft's own values, not the flow's URL: `publishHostStartDraft` builds its
  // payload from the stored draft, so measuring the URL's property type here would hide
  // exactly the mismatch that then fails the publish.
  const blockers = publishBlockers(data, { today });

  const spaceTypeLabel =
    LISTING_SPACE_TYPES.find((option) => option.value === spaceType)?.label ?? spaceType;
  /** What a row shows when the flow has not carried its answer this far. Written once:
   *  eight rows repeating the same sentence in eight slightly different ways is how a
   *  prototype starts reading as eight unrelated bugs. */
  const unavailable = resolve("host.v2.review.value_pending", "Not provided").text;
  // The draft's rules as a guest would read them. Built through the same snapshot shape
  // a booking freezes, so this row, the listing page and the booking sheet all say the
  // same thing about the same draft.
  const houseRulesSummary = houseRuleLines(
    i18n,
    houseRulesSnapshot(houseRulesRowData(houseRulesFromDraft(data))),
  );
  const availability = data.prePublishPlan?.availabilityStart;
  // Through the catalog like every other line on this screen. These three read as
  // English sentences to a host reading the flow in Macedonian otherwise.
  const availabilityLabel =
    availability?.mode === "now"
      ? resolve("host.v2.review.availability_now", "Available now").text
      : availability?.mode === "from"
        ? interpolate(
            resolve("host.v2.review.availability_from", "Available from {date}"),
            { date: availability.startDate },
          ).text
        : availability?.mode === "selected"
          ? resolve(
              "host.v2.review.availability_selected",
              "Only on dates you open",
            ).text
          : unavailable;

  if (published) return <PublishedConfirmation backHref={`/host/start/review?${query}`} onBack={() => setPublished(false)} />;

  return (
    <>
      <main className="flex-1 px-5 pb-32 pt-6 md:px-8 md:pb-32 md:pt-10">
        <div className="mx-auto w-full max-w-[39rem]">
          <h1 className="font-heading text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[2rem]">
            <Tx k="host.v2.review.heading" source="Review your listing" />
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            <Tx
              k="host.v2.review.hint"
              source="Here's what you've told us so far. You can change any of it before or after you publish."
            />
          </p>

          <dl className="mt-[clamp(1.25rem,3vh,2rem)] divide-y divide-slate-200 border-y border-slate-200">
            <ReviewRow
              icon={Home}
              label={resolve("host.v2.review.row_property", "Property and guest space").text}
              value={`${propertyType.label} · ${spaceTypeLabel}`}
              editHref={`/host/start/property-type?${query}`}
            />
            <ReviewRow
              icon={MapPin}
              label={resolve("host.v2.review.row_location", "Location").text}
              value={[data.address, data.city, data.country].filter(Boolean).join(", ") || unavailable}
              editHref={`/host/start/location?${query}`}
            />
            <ReviewRow
              icon={BedDouble}
              label={resolve("host.v2.review.row_capacity", "Guests, bedrooms and beds").text}
              value={
                interpolate(
                  resolve(
                    "host.v2.review.capacity_value",
                    "{guests} guests · {bedrooms} bedrooms · {beds} beds",
                  ),
                  {
                    guests: data.maxGuests ?? "—",
                    bedrooms: data.bedrooms ?? "—",
                    beds: data.beds ?? "—",
                  },
                ).text
              }
              editHref={`/host/start/basics?${query}`}
            />
            <ReviewRow
              icon={Sparkles}
              label={resolve("host.v2.review.row_amenities", "Amenities").text}
              value={
                interpolate(
                  resolve("host.v2.review.amenities_value", "{count} amenities"),
                  { count: data.amenityIds?.length ?? 0 },
                ).text
              }
              editHref={`/host/start/amenities?${query}`}
            />
            <ReviewRow
              icon={Images}
              label={resolve("host.v2.review.row_photos", "Photos").text}
              value={
                interpolate(
                  resolve("host.v2.review.photos_value", "{count} photos"),
                  {
                    count:
                      data.mediaItems?.filter((item) => item.mediaType === "IMAGE")
                        .length ?? 0,
                  },
                ).text
              }
              editHref={`/host/start/photos?${query}`}
            />
            <ReviewRow
              icon={PencilLine}
              label={resolve("host.v2.review.row_description", "Title and description").text}
              value={data.title || unavailable}
              editHref={`/host/start/description?${query}`}
            />
            <ReviewRow
              icon={Tag}
              label={resolve("host.v2.review.row_price", "Price").text}
              /* The listing's own currency and the reading locale, not the platform
                 default and not English: this row states what a guest will be charged,
                 and the draft has carried its currency since it was created. Omitting
                 the locale formatted every review screen with English separators
                 whatever language the host was reading. */
              value={
                data.baseNightlyRate
                  ? interpolate(
                      resolve("host.v2.review.price_per_night", "{price} per night"),
                      {
                        price: formatMoney(
                          Number(data.baseNightlyRate),
                          data.currency ?? DEFAULT_CURRENCY,
                          locale,
                        ),
                      },
                    ).text
                  : unavailable
              }
              editHref={`/host/start/price?${query}`}
            />
            <ReviewRow
              icon={WalletCards}
              label={
                resolve(
                  "host.v2.review.row_payment_methods",
                  "Payment methods",
                ).text
              }
              value={
                data.acceptedPaymentMethods?.length
                  ? `${data.acceptedPaymentMethods.length} ${resolve(
                      "host.v2.review.payment_methods_selected",
                      "selected",
                    ).text}`
                  : unavailable
              }
              editHref={`/host/start/payment-arrangements?${query}`}
            />
            <ReviewRow
              icon={CalendarRange}
              label={resolve("host.v2.review.row_availability", "Availability").text}
              value={availabilityLabel}
              editHref={`/host/start/availability?${query}`}
            />
            <ReviewRow
              icon={Clock}
              label={resolve("host.v2.review.row_house_rules", "House rules").text}
              /* Every rule the draft carries, in the same words the guest will read
                 them in — `houseRuleLines` is the function the public listing page and
                 the booking sheet also render from, so Review cannot summarise the
                 rules differently from the page it is a review of. Unanswered policies
                 are absent rather than listed as blanks; the blockers above already
                 name those, with a link to the step that fixes them. */
              value={houseRulesSummary
                .map((line) => `${line.label}: ${line.value}`)
                .join(" · ")}
              editHref={`/host/start/house-rules?${query}`}
            />
          </dl>

          {blockers.length > 0 ? (
            <section
              aria-labelledby="listing-flow-review-blockers"
              className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4"
            >
              <h2
                id="listing-flow-review-blockers"
                className="flex items-center gap-2 text-sm font-semibold text-rose-800"
              >
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <Tx
                  k="host.v2.review.blockers_heading"
                  source="Finish these before you publish"
                />
              </h2>
              <ul className="mt-3 space-y-3">
                {blockers.map((blocker) => (
                  <li
                    key={blocker.step + ":" + blocker.message}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm leading-6 text-rose-800"
                  >
                    <span className="min-w-0 flex-1">{blocker.message}</span>
                    <Link
                      href={flowStepHref(blocker.step, query)}
                      className="shrink-0 font-semibold underline underline-offset-4 hover:text-rose-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                    >
                      <Tx k="host.v2.review.blocker_fix" source="Fix this" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Always in the tree, so the live region exists to announce into rather than
              being created at the moment it has something to say. A refusal the draft
              could not predict lands here, in place, rather than only in a toast that
              scrolls away. */}
          <p
            id="listing-flow-review-error"
            role="alert"
            className="mt-6 text-sm text-rose-600 empty:hidden"
          >
            {publishError}
          </p>

          <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <Tx
              k="host.v2.review.prototype_note"
              source="Publishing makes this listing live. You can edit every detail later from your listings dashboard."
            />
          </p>
        </div>
      </main>

      <ListingFlowFooter
        backHref={`/host/start/house-rules?${query}`}
        onNext={async () => {
          if (blockers.length > 0) {
            // Nothing is sent while this screen already knows the answer: the host is
            // pointed at the list above rather than shown a refusal they could have read
            // here first.
            setPublishError(
              resolve(
                "host.v2.review.blocked",
                "Finish the items listed above before publishing.",
              ).text,
            );
            document
              .getElementById("listing-flow-review-blockers")
              ?.scrollIntoView({ block: "center" });
            return;
          }
          setPublishError(null);
          try {
            const response = await fetch("/api/host-start/draft", { method: "POST" });
            const result = (await response.json()) as
              | { success: true; listingId: string; slug: string }
              | { error: string };
            if ("error" in result) {
              // The action's own sentences, never a raw Zod dump: `submitNewListing`
              // runs its failures through `firstZodMessage`, so what arrives here is
              // already the schema's own host-facing wording.
              setPublishError(result.error);
              toast.error(result.error);
              return;
            }
            setPublished(true);
          } catch {
            const message = resolve(
              "host.v2.review.publish_failed",
              "Your listing could not be published. Check your connection and try again.",
            ).text;
            setPublishError(message);
            toast.error(message);
          }
        }}
        phaseOneProgress={100}
        phaseTwoProgress={100}
        phaseThreeProgress={100}
        nextLabel="Publish listing"
      />
    </>
  );
}

/**
 * The confirmation.
 *
 * Celebratory shape, honest words: the heading says the walkthrough is finished rather
 * than that a listing is live, and the line under it says in as many words that nothing
 * was published. Back returns to the summary, so the prototype can be walked again
 * without starting from the property type.
 */
function PublishedConfirmation({
  backHref,
  onBack,
}: {
  backHref: string;
  onBack: () => void;
}) {
  return (
    <>
      <main className="flex min-h-0 flex-1 items-center px-5 pb-28 pt-6 md:px-8 md:pb-24 md:pt-2">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-12 md:grid-cols-2 md:gap-20">
          <section>
            <p className="text-sm font-semibold text-slate-600">
              <Tx k="host.v2.review.done_eyebrow" source="Listing published" />
            </p>
            <h1 className="mt-3 font-heading text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.035em] text-slate-950 sm:text-[3.25rem]">
              <Tx k="host.v2.review.done_heading" source="Your place is live" />
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-500">
              <Tx
                k="host.v2.review.done_body"
                source="Guests can now find your listing and request available stays."
              />
            </p>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-500">
              <Tx
                k="host.v2.review.done_next"
                source="You can update photos, pricing, availability, and every other detail from your listings dashboard."
              />
            </p>
          </section>
          <div className="relative mx-auto grid aspect-square w-full max-w-[min(24rem,calc(100dvh-13rem))] place-items-center rounded-[2.5rem] bg-slate-100">
            <Home className="size-36 text-slate-900" strokeWidth={1.1} aria-hidden />
            <span className="absolute right-8 top-8 grid size-12 place-items-center rounded-full bg-slate-950 text-white">
              <Check className="size-6" aria-hidden />
            </span>
          </div>
        </div>
      </main>
      <ListingFlowFooter
        backHref={backHref}
        onBack={onBack}
        nextHref="/host/listings"
        phaseOneProgress={100}
        phaseTwoProgress={100}
        phaseThreeProgress={100}
        nextLabel="Back to listings"
      />
    </>
  );
}

/**
 * One summary row.
 *
 * A description list rather than a card grid: nine rows of label-and-value are a list,
 * and the phone width this flow is built for has no room for anything else. The edit
 * link carries the flow's query, so jumping back to a step and returning does not lose
 * the property type.
 */
function ReviewRow({
  icon: Icon,
  label,
  value,
  editHref,
  muted = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  editHref: string;
  /** A placeholder rather than the host's own answer — set in grey, so the two are never
   *  mistaken for each other. */
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 py-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-sm font-medium text-slate-900">{label}</dt>
        <dd className={cn("mt-1 text-sm leading-6", muted ? "text-slate-400" : "text-slate-600")}>
          {value}
        </dd>
      </div>
      <Link
        href={editHref}
        className="inline-flex min-h-11 shrink-0 items-center self-center text-sm font-semibold text-slate-900 underline underline-offset-4 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 md:min-h-0"
      >
        <Tx k="host.v2.review.edit" source="Edit" />
      </Link>
    </div>
  );
}
