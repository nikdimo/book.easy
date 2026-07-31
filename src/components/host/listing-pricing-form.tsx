"use client";

import { useActionState } from "react";
import { Banknote, CalendarDays, Sparkles } from "lucide-react";
import { saveListingPricing } from "@/lib/actions/pricing.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ListingPricingForm({
  listingId,
  baseNightlyRate,
  cleaningFee,
  minNights,
  currency,
}: {
  listingId: string;
  baseNightlyRate: number;
  cleaningFee: number;
  minNights: number;
  currency: string;
}) {
  const action = saveListingPricing.bind(null, listingId);
  const [state, formAction, pending] = useActionState(action, {});
  const fields = [
    {
      name: "baseNightlyRate",
      label: "Nightly rate",
      description: "Your standard price before fees and discounts.",
      defaultValue: baseNightlyRate,
      min: 1,
      step: "0.01",
      suffix: `${currency} / night`,
      icon: Banknote,
    },
    {
      name: "cleaningFee",
      label: "Cleaning fee",
      description: "A one-time fee added to each stay.",
      defaultValue: cleaningFee,
      min: 0,
      step: "0.01",
      suffix: `${currency} / stay`,
      icon: Sparkles,
    },
    {
      name: "minNights",
      label: "Minimum stay",
      description: "The shortest stay guests can book.",
      defaultValue: minNights,
      min: 1,
      step: "1",
      suffix: "nights",
      icon: CalendarDays,
    },
  ];

  return (
    <form action={formAction} className="space-y-5">
      <div className="overflow-hidden rounded-xl border">
        {fields.map((field) => {
          const Icon = field.icon;
          return (
            <div
              key={field.name}
              className="flex flex-col gap-4 border-b p-4 last:border-b-0 sm:flex-row sm:items-center"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Label htmlFor={field.name} className="text-base font-semibold">
                  {field.label}
                </Label>
                <p className="text-sm text-muted-foreground">{field.description}</p>
              </div>
              <div className="flex items-center gap-2 sm:w-52">
                <Input
                  id={field.name}
                  name={field.name}
                  type="number"
                  min={field.min}
                  step={field.step}
                  defaultValue={field.defaultValue}
                  required
                  className="text-right font-semibold tabular-nums"
                />
                <span className="w-20 shrink-0 text-sm md:text-xs text-muted-foreground">
                  {field.suffix}
                </span>
              </div>
            </div>
          );
        })}
      </div>

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
        {pending ? "Saving…" : "Save pricing"}
      </Button>
    </form>
  );
}
