"use client";

import { useId, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { availabilityDefaultDraft } from "@/lib/host/v2/calendar-listing-draft";
import type { HostCalendarListingContext } from "@/lib/host/v2/calendar-types";
import {
  ListingReviewDialog,
  useListingReview,
} from "@/components/host/v2/editor/listing-review";

/**
 * The listing's default availability: the one editable home for it.
 *
 * It used to live in the calendar, on a screen headed "All future dates", beside the
 * listing's visibility and its minimum stay — three different promises sharing one
 * confirmation and one save button. Here it is one question with two answers, and the
 * answers are sentences rather than states: a host does not think "my listing is in
 * CLOSED mode", they think "guests can only book the dates I open".
 *
 * Visibility is deliberately not here. A listing can be visible and unbookable, and it
 * can have bookable dates while nobody can find it; folding the two controls together
 * is how a host ends up hiding their listing when they meant to stop taking bookings
 * for a month. Visibility stays on the listings page, where it already is.
 *
 * **It does not autosave.** Everything else in this editor does, and this deliberately
 * breaks that pattern: the setting moves every future date at once and decides whether
 * the listing appears in an undated search at all, so it is staged and confirmed with
 * the consequences spelled out — the same review the calendar has always required.
 */
export function AvailabilityDefaultEditor({
  context,
}: {
  context: HostCalendarListingContext;
}) {
  const i18n = useI18n();
  const groupId = useId();
  const saved = context.listing.availabilityMode;
  const [chosen, setChosen] = useState<"OPEN" | "CLOSED">(saved);
  const { plan, pending, review, close, confirm } = useListingReview(context);

  const draft = useMemo(
    () => availabilityDefaultDraft(chosen, context.listing),
    [chosen, context.listing],
  );

  const options = [
    {
      value: "OPEN" as const,
      label: i18n.resolve(
        "host.editor.availability.default_open",
        "Available by default",
      ).text,
      help: i18n.resolve(
        "host.editor.availability.default_open_help",
        "Future dates can be booked unless you block them.",
      ).text,
    },
    {
      value: "CLOSED" as const,
      label: i18n.resolve(
        "host.editor.availability.default_closed",
        "Only dates I open",
      ).text,
      help: i18n.resolve(
        "host.editor.availability.default_closed_help",
        "Future dates cannot be booked until you open them.",
      ).text,
    },
  ];

  return (
    <section
      aria-labelledby={`${groupId}-heading`}
      className="mt-6 rounded-2xl border border-slate-200 p-5"
    >
      <h3
        id={`${groupId}-heading`}
        className="text-sm font-semibold text-slate-900"
      >
        {
          i18n.resolve(
            "host.editor.availability.defaults_title",
            "Default availability",
          ).text
        }
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {
          i18n.resolve(
            "host.editor.availability.defaults_lead",
            "How every future date starts out, before you open or block anything.",
          ).text
        }
      </p>

      {/* Real radios in a real group: the two answers are one choice, arrow keys move
          between them, and each carries its own explanation through `aria-describedby`
          rather than leaving a screen reader with two labels and no difference. */}
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-heading`}
        className="mt-4 flex flex-col gap-2"
      >
        {options.map((option) => {
          const id = `${groupId}-${option.value}`;
          const selected = chosen === option.value;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                // The ring and the checked radio both carry the state, so the choice
                // is never colour alone.
                selected
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200 hover:bg-slate-50",
              )}
            >
              <input
                type="radio"
                id={id}
                name={`${groupId}-mode`}
                value={option.value}
                checked={selected}
                disabled={pending}
                aria-describedby={`${id}-help`}
                onChange={() => setChosen(option.value)}
                className="mt-0.5 size-4 shrink-0 accent-slate-900"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">
                  {option.label}
                </span>
                <span
                  id={`${id}-help`}
                  className="mt-0.5 block text-sm leading-6 text-slate-600"
                >
                  {option.help}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!draft || pending}
          onClick={() => draft && review(draft)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none disabled:bg-slate-100 disabled:text-slate-400"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {
            i18n.resolve(
              "host.editor.availability.review_cta",
              "Review this change",
            ).text
          }
        </button>
        {/* Said next to the button rather than in the dialog alone: the reassurance is
            most useful while the host is deciding whether to press it. */}
        <p className="text-sm leading-6 text-slate-500">
          {draft
            ? i18n.resolve(
                "host.editor.availability.defaults_pending",
                "Nothing changes until you confirm.",
              ).text
            : i18n.resolve(
                "host.editor.availability.defaults_current",
                "This is the current setting.",
              ).text}
        </p>
      </div>

      <ListingReviewDialog
        context={context}
        plan={plan}
        pending={pending}
        onClose={close}
        onConfirm={confirm}
      />
    </section>
  );
}
