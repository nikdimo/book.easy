"use client";

import { useActionState, useState } from "react";
import { Percent, Sparkles, X } from "lucide-react";
import { saveListingPromotion } from "@/lib/actions/promotion.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
      title: "No promotion",
      description: "Guests pay your normal rates and cleaning fee.",
      icon: X,
    },
    {
      value: "PERCENT_DISCOUNT",
      title: "Percentage discount",
      description: "Discount the accommodation price by 5% to 50%.",
      icon: Percent,
    },
    {
      value: "FREE_CLEANING",
      title: "Free cleaning",
      description:
        cleaningFee > 0
          ? `Guests save your €${cleaningFee.toFixed(2)} cleaning fee.`
          : "Add a cleaning fee before selecting this offer.",
      icon: Sparkles,
      disabled: cleaningFee <= 0,
    },
  ];

  const offerText =
    type === "PERCENT_DISCOUNT"
      ? `${percent || "0"}% off`
      : type === "FREE_CLEANING"
        ? "Free cleaning"
        : "No promotion";
  const eligibilityText =
    type !== "NONE" && eligibility === "MINIMUM"
      ? ` · ${minimumNights || "0"}+ nights`
      : "";

  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="eligibility" value={eligibility} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Choose an offer</legend>
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
        <div className="max-w-xs space-y-2">
          <Label htmlFor="discountPercent">Discount percentage</Label>
          <div className="flex items-center gap-2">
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
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
      )}

      {type !== "NONE" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">
            Which stays receive this offer?
          </legend>
          <label className="flex items-center gap-3 rounded-lg border p-3">
            <input
              type="radio"
              checked={eligibility === "ALL"}
              onChange={() => setEligibility("ALL")}
            />
            <span>
              <span className="block font-medium">All bookable stays</span>
              <span className="block text-sm text-muted-foreground">
                Your normal {listingMinimumNights}-night listing minimum still applies.
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
                Only stays of at least this many nights
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
                Shorter stays remain bookable at the normal price.
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {type !== "NONE" && (
        <div className="rounded-xl bg-muted/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Guests will see
          </p>
          <p className="mt-1 font-semibold">
            {offerText}
            {eligibilityText}
          </p>
        </div>
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
