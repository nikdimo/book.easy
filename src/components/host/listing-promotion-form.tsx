"use client";

import { useActionState, useState } from "react";
import { CalendarRange, Percent, Sparkles, X } from "lucide-react";
import { saveListingPromotion } from "@/lib/actions/promotion.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { OfferPreview } from "@/components/host/calendar-editor-ui";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";

type PromotionChoice = "NONE" | "PERCENT_DISCOUNT" | "FREE_CLEANING";

export function ListingPromotionForm({
  listingId,
  cleaningFee,
  listingMinimumNights,
  initialPromotion,
}: {
  listingId: string;
  cleaningFee: number;
  listingMinimumNights: number;
  initialPromotion: {
    type: "PERCENT_DISCOUNT" | "FREE_CLEANING";
    discountPercent: number | null;
    minimumNights: number | null;
  } | null;
}) {
  const action = saveListingPromotion.bind(null, listingId);
  const { resolve } = useI18n();
  const [state, formAction, pending] = useActionState(action, {});
  const [type, setType] = useState<PromotionChoice>(
    initialPromotion?.type ?? "NONE"
  );
  const [eligibility, setEligibility] = useState<"ALL" | "MINIMUM">(
    initialPromotion?.minimumNights ? "MINIMUM" : "ALL"
  );
  const [percent, setPercent] = useState(
    String(initialPromotion?.discountPercent ?? 10)
  );
  const [minimumNights, setMinimumNights] = useState(
    String(initialPromotion?.minimumNights ?? Math.max(3, listingMinimumNights))
  );

  const options: {
    value: PromotionChoice;
    title: string;
    description: string;
    icon: typeof X;
    disabled?: boolean;
  }[] = [
    {
      value: "NONE",
      title: resolve("host.promotion.none_title", "No promotion").text,
      description: resolve(
        "host.promotion.none_description",
        "Guests pay your normal rates and cleaning fee.",
      ).text,
      icon: X,
    },
    {
      value: "PERCENT_DISCOUNT",
      title: resolve("host.promotion.percent_title", "Percentage discount").text,
      description: resolve(
        "host.promotion.percent_description",
        "Discount the accommodation price by 5% to 50%.",
      ).text,
      icon: Percent,
    },
    {
      value: "FREE_CLEANING",
      title: resolve("host.promotion.cleaning_title", "Free cleaning").text,
      description:
        cleaningFee > 0
          ? interpolate(
              resolve(
                "host.promotion.cleaning_description",
                "Guests save your €{amount} cleaning fee.",
              ),
              { amount: cleaningFee.toFixed(2) },
            ).text
          : resolve(
              "host.promotion.cleaning_needs_fee",
              "Add a cleaning fee before selecting this offer.",
            ).text,
      icon: Sparkles,
      disabled: cleaningFee <= 0,
    },
  ];

  const offerText =
    type === "PERCENT_DISCOUNT"
      ? interpolate(resolve("host.promotion.summary_percent", "{percent}% off"), {
          percent: percent || "0",
        }).text
      : type === "FREE_CLEANING"
        ? resolve("host.promotion.cleaning_title", "Free cleaning").text
        : resolve("host.promotion.none_title", "No promotion").text;
  const eligibilityText =
    type !== "NONE" && eligibility === "MINIMUM"
      ? interpolate(
          resolve("host.promotion.summary_minimum", " · {nights}+ nights"),
          { nights: minimumNights || "0" },
        ).text
      : "";
  const recommendedOffers = [
    {
      percent: 15,
      nights: 5,
      title: resolve("host.promotion.recommended", "Recommended").text,
      description: resolve(
        "host.promotion.offer_15",
        "15% off stays of 5+ nights",
      ).text,
    },
    {
      percent: 20,
      nights: 10,
      title: resolve("host.promotion.long_stay", "Long stay").text,
      description: resolve(
        "host.promotion.offer_20",
        "20% off stays of 10+ nights",
      ).text,
    },
    {
      percent: 30,
      nights: 30,
      title: resolve("host.promotion.monthly_stay", "Monthly stay").text,
      description: resolve(
        "host.promotion.offer_30",
        "30% off stays of 30+ nights",
      ).text,
    },
  ];

  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="eligibility" value={eligibility} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">
          <Tx k="host.promotion.ready_made" source="Ready-made offers" />
        </legend>
        <p className="text-sm text-muted-foreground">
          <Tx
            k="host.promotion.ready_made_hint"
            source="Choose a proven offer with one click, then save when you are ready."
          />
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {recommendedOffers.map((offer) => {
            const selected =
              type === "PERCENT_DISCOUNT" &&
              percent === String(offer.percent) &&
              eligibility === "MINIMUM" &&
              minimumNights === String(offer.nights);
            return (
              <button
                key={offer.nights}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setType("PERCENT_DISCOUNT");
                  setPercent(String(offer.percent));
                  setEligibility("MINIMUM");
                  setMinimumNights(String(offer.nights));
                }}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:border-primary/40"
                )}
              >
                <CalendarRange className="mb-3 size-5" aria-hidden="true" />
                <span className="block font-semibold">{offer.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {offer.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">
          <Tx k="host.promotion.choose" source="Choose an offer" />
        </legend>
        <div className="grid gap-3 md:grid-cols-3">
          {options.map((option) => {
            const Icon = option.icon;
            const selected = type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                aria-pressed={selected}
                onClick={() => setType(option.value)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-primary/40",
                  option.disabled && "cursor-not-allowed opacity-50"
                )}
              >
                <Icon className="mb-3 size-5" aria-hidden="true" />
                <span className="block font-semibold">{option.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {type === "PERCENT_DISCOUNT" && (
        <div className="space-y-3">
          <Label htmlFor="discountPercent">
            <Tx k="host.promotion.discount_label" source="Discount percentage" />
          </Label>
          <div className="flex flex-wrap gap-2">
            {[10, 15, 20, 30].map((value) => (
              <Button
                key={value}
                type="button"
                variant={percent === String(value) ? "default" : "outline"}
                className="min-w-16"
                onClick={() => setPercent(String(value))}
              >
                {value}%
              </Button>
            ))}
          </div>
          <div className="flex max-w-xs items-center gap-2">
            <Input
              id="discountPercent"
              name="discountPercent"
              type="number"
              min={5}
              max={50}
              step={1}
              required
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
            />
            <span className="text-sm text-muted-foreground">
              <Tx k="host.promotion.custom_percent" source="% custom" />
            </span>
          </div>
        </div>
      )}

      {type !== "NONE" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">
            <Tx
              k="host.promotion.eligibility_question"
              source="Which stays receive this offer?"
            />
          </legend>
          <label className="flex items-center gap-3 rounded-lg border p-3">
            <input
              type="radio"
              checked={eligibility === "ALL"}
              onChange={() => setEligibility("ALL")}
            />
            <span>
              <span className="block font-medium">
                <Tx k="host.promotion.all_stays" source="All bookable stays" />
              </span>
              <span className="block text-sm text-muted-foreground">
                {
                  interpolate(
                    resolve(
                      "host.promotion.listing_minimum_note",
                      "Your normal {nights}-night listing minimum still applies.",
                    ),
                    { nights: listingMinimumNights },
                  ).text
                }
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border p-3">
            <input
              type="radio"
              className="mt-1"
              checked={eligibility === "MINIMUM"}
              onChange={() => setEligibility("MINIMUM")}
            />
            <span className="space-y-2">
              <span className="block font-medium">
                <Tx
                  k="host.promotion.minimum_option"
                  source="Only stays of at least this many nights"
                />
              </span>
              <Input
                name="minimumNights"
                type="number"
                min={1}
                max={365}
                required={eligibility === "MINIMUM"}
                disabled={eligibility !== "MINIMUM"}
                value={minimumNights}
                onChange={(event) => setMinimumNights(event.target.value)}
                className="w-28"
              />
              <span className="block text-sm text-muted-foreground">
                <Tx
                  k="host.promotion.minimum_hint"
                  source="Shorter stays remain bookable at the normal price."
                />
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {type !== "NONE" && (
        <OfferPreview
          headline={
            <>
              {offerText}
              {eligibilityText}
            </>
          }
        />
      )}

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-green-700">
          {state.success}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save special offer"}
      </Button>
    </form>
  );
}
