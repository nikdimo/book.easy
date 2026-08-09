"use client";

import type { ReactNode } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { Tx, translatedClass, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The bits of the host calendar's editor sheet that the pre-publish wizard also
 * needs. Both surfaces edit the same three things — blocked dates, custom prices,
 * dated promotions — and the wizard's copy of the UI had drifted into a different
 * design, so the shared pieces live here rather than being written twice.
 *
 * Deliberately free of server-action imports: the wizard is a long client bundle
 * and should not pull the calendar's action graph in just to draw a switch.
 */

/**
 * The commit row stays on screen instead of waiting at the end of a long scroll.
 * The negative margins cancel the sheet body's own p-6 so it spans the sheet.
 */
export const STICKY_FOOTER =
  "sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-background/95 px-6 py-4 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] backdrop-blur";

/**
 * Drops the cents: €62.40 becomes €62, not €60. Snapping to a 5 or a 10 moves the
 * price by a euro or more in whichever direction the multiple happens to fall,
 * which is a pricing decision the host did not make — the only thing worth losing
 * here is the fractional tail a percentage adjustment leaves behind.
 */
export function roundToCleanPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

/**
 * "Guests will see …" — the offer read back in the guest's words. Four surfaces
 * showed this (calendar sheet, pre-publish plan, the standalone promotion form,
 * the wizard's launch offer) from four copies of the same markup, which had
 * already drifted apart. `headline` is the offer itself; `children` is for the
 * per-surface notes underneath, which should use OFFER_PREVIEW_NOTE.
 */
export function OfferPreview({
  headline,
  children,
}: {
  headline: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-primary/7 p-3">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase md:text-[0.65rem]">
          <Tx k="host.promotion.preview_label" source="Guests will see" />
        </p>
        <p className="mt-0.5 text-sm font-semibold">{headline}</p>
        {children}
      </div>
    </div>
  );
}

export const OFFER_PREVIEW_NOTE = "mt-0.5 text-sm text-muted-foreground md:text-xs";

export function StandardPricingSummary({
  baseNightlyRate,
  cleaningFee,
  minNights,
  currency,
  locale,
  onEdit,
}: {
  baseNightlyRate: number;
  cleaningFee: number;
  minNights: number;
  currency: string;
  locale: string;
  onEdit: () => void;
}) {
  const i18n = useI18n();
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const minimumStay = i18n.plural(
    "host.calendar.standard_pricing.minimum_nights",
    minNights,
    "{n} night",
    "{n} nights",
  );

  return (
    <section
      aria-labelledby="standard-pricing-heading"
      className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="standard-pricing-heading" className="font-semibold">
            <Tx
              k="host.calendar.standard_pricing.title"
              source="Standard pricing"
            />
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground md:text-xs">
            <Tx
              k="host.calendar.standard_pricing.hint"
              source="Used on dates without a custom date price."
            />
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden="true" />
          <Tx k="host.calendar.standard_pricing.edit" source="Edit" />
        </Button>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/35 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">
            <Tx
              k="host.calendar.standard_pricing.base_price"
              source="Base price"
            />
          </dt>
          <dd className="mt-0.5 text-sm font-semibold">
            <span className="notranslate" translate="no">
              {money.format(baseNightlyRate)}
            </span>{" "}
            <span className="font-normal text-muted-foreground">
              <Tx
                k="host.calendar.standard_pricing.per_night"
                source="/ night"
              />
            </span>
          </dd>
        </div>
        <div className="rounded-xl bg-muted/35 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">
            <Tx
              k="host.calendar.standard_pricing.cleaning_fee"
              source="Cleaning fee"
            />
          </dt>
          <dd className="mt-0.5 text-sm font-semibold">
            <span className="notranslate" translate="no">
              {money.format(cleaningFee)}
            </span>{" "}
            <span className="font-normal text-muted-foreground">
              <Tx
                k="host.calendar.standard_pricing.per_stay"
                source="/ stay"
              />
            </span>
          </dd>
        </div>
        <div className="rounded-xl bg-muted/35 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">
            <Tx
              k="host.calendar.standard_pricing.minimum_stay"
              source="Minimum stay"
            />
          </dt>
          <dd className="mt-0.5 text-sm font-semibold">
            <span className={translatedClass(minimumStay)}>
              {minimumStay.text}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function OptionToggle({
  checked,
  label,
  description,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-xl border p-3 text-left transition-colors",
        disabled && "cursor-not-allowed opacity-60",
        checked
          ? "border-primary bg-primary/5"
          : "bg-muted/20 enabled:hover:border-primary/30",
      )}
    >
      <span>
        <span className="block text-sm md:text-xs font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs md:text-[0.65rem] text-muted-foreground">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/25",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}
