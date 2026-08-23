"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import {
  CAPACITY_BOUNDS,
  capacityCountFromDraft,
  clampCapacity,
  listingCapacityIssues,
  type CapacityField,
} from "@/lib/host/v2/listing-capacity";
import { Tx } from "@/lib/i18n/client";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { StepperButton } from "@/components/host/v2/stepper-button";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

type Counts = Record<CapacityField, number>;

export function BasicsStep({ propertyType, spaceType }: { propertyType: PropertyTypeOption; spaceType: ListingSpaceTypeValue }) {
  const { data, save } = useHostStartDraft();
  /** Read through the shared parser rather than a bare `Number()`: a draft written by
   *  the classic wizard carries "" for a count the host never reached, and `Number("")`
   *  is a perfectly finite 0 — which is how the guest counter used to open on zero and
   *  then be refused by publishing. Blank falls back, and anything real is clamped into
   *  the bounds `listingFormSchema` enforces. */
  const [counts, setCounts] = useState<Counts>({
    guests: capacityCountFromDraft(data.maxGuests, "guests", 1),
    bedrooms: capacityCountFromDraft(data.bedrooms, "bedrooms", 1),
    beds: capacityCountFromDraft(data.beds, "beds", 1),
    bathrooms: capacityCountFromDraft(data.bathrooms, "bathrooms", 1),
  });
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  const setCount = (key: CapacityField, next: number) =>
    setCounts((current) => ({ ...current, [key]: clampCapacity(next, key) }));
  /** Belt and braces: the steppers clamp, and so does the read above, so this should
   *  never be true. It is the assertion that keeps it that way — a future change to
   *  either clamp fails here rather than by writing a capacity publishing refuses. */
  const issues = listingCapacityIssues(counts);
  const invalid = Object.keys(issues).length > 0;

  return (
    <>
      <main className="flex min-h-0 flex-1 px-5 pb-28 pt-6 md:items-center md:px-8 md:pb-24 md:pt-2">
        <div className="mx-auto w-full max-w-[49rem]">
          <h1 className="font-heading text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[2rem] md:whitespace-nowrap">
            <Tx k="host.v2.basics.heading" source="Share some basics about your place" />
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            <Tx k="host.v2.basics.hint" source="You’ll add more details later, like bed types." />
          </p>
          <div className="mt-[clamp(1rem,3vh,2rem)]">
            <Counter label="Guests" value={counts.guests} field="guests" onChange={(value) => setCount("guests", value)} />
            <Counter label="Bedrooms" value={counts.bedrooms} field="bedrooms" onChange={(value) => setCount("bedrooms", value)} />
            <Counter label="Beds" value={counts.beds} field="beds" onChange={(value) => setCount("beds", value)} />
            <Counter label="Bathrooms" value={counts.bathrooms} field="bathrooms" onChange={(value) => setCount("bathrooms", value)} />
          </div>
        </div>
      </main>
      <ListingFlowFooter
        {...(invalid ? {} : { nextHref: `/host/start/phase-one-complete?${query}` })}
        backHref={`/host/start/address?${query}`}
        onNext={async () => {
          if (invalid) {
            // Out-of-range counts are pulled back into range rather than saved: the host
            // is left on this screen looking at numbers publishing would accept.
            setCounts((current) => ({
              guests: clampCapacity(current.guests, "guests"),
              bedrooms: clampCapacity(current.bedrooms, "bedrooms"),
              beds: clampCapacity(current.beds, "beds"),
              bathrooms: clampCapacity(current.bathrooms, "bathrooms"),
            }));
            return;
          }
          const saved = await save({
            maxGuests: String(counts.guests),
            bedrooms: String(counts.bedrooms),
            beds: String(counts.beds),
            bathrooms: String(counts.bathrooms),
            currentStepId: "amenities",
          });
          if (saved) window.location.assign(`/host/start/phase-one-complete?${query}`);
        }}
        phaseOneProgress={92}
        nextLabel="Next"
      />
    </>
  );
}

function Counter({ label, value, field, onChange }: { label: string; value: number; field: CapacityField; onChange: (value: number) => void }) {
  const { min, max } = CAPACITY_BOUNDS[field];
  return (
    <div className="flex min-h-[clamp(4rem,10vh,5rem)] items-center justify-between border-b border-slate-200 py-3 md:py-4">
      <span className="text-base text-slate-950">{label}</span>
      <span className="flex items-center gap-4">
        <StepperButton label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus className="size-4" aria-hidden />
        </StepperButton>
        <output className="w-5 text-center text-base" aria-label={`${label}: ${value}`}>{value}</output>
        <StepperButton label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus className="size-4" aria-hidden />
        </StepperButton>
      </span>
    </div>
  );
}
