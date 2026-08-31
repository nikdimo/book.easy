"use client";

import { Tx } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { ListingFlowFooter } from "./listing-flow-footer";
import { PhaseTwoIllustration } from "./phase-two-illustration";
import { useHostStartDraft } from "./host-start-draft-provider";

/**
 * The transition between phase two and phase three, and the twin of
 * `PhaseOneComplete` — same two-column layout, same typography, same progress line, so
 * the two pauses in the flow read as one recurring beat rather than two screens that
 * happen to congratulate the host.
 *
 * What it shows is what phase two produced: amenities, photos, a title and a
 * description. Nothing is written here either — the flow still carries its whole state
 * in the URL.
 */
export function PhaseTwoComplete({
  propertyType,
  spaceType,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
}) {
  const { save } = useHostStartDraft();
  const router = useRouter();
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  const nextHref = `/host/start/price?${query}`;

  return (
    <>
      <main className="flex min-h-0 flex-1 items-center px-5 pb-28 pt-6 md:px-8 md:pb-24 md:pt-2">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-12 md:grid-cols-2 md:gap-20">
          <section>
            <p className="text-sm font-semibold text-slate-600">
              <Tx k="host.v2.phase_two_complete.eyebrow" source="Phase 2 complete" />
            </p>
            <h1 className="mt-3 font-heading text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.035em] text-slate-950 sm:text-[3.25rem]">
              <Tx k="host.v2.phase_two_complete.heading" source="Your place stands out" />
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-500">
              <Tx
                k="host.v2.phase_two_complete.hint"
                source="Amenities, photos and your description are in place. Next, you’ll set your price, your availability and your house rules — then publish."
              />
            </p>
          </section>

          <PhaseTwoIllustration />
        </div>
      </main>

      <ListingFlowFooter
        backHref={`/host/start/description?${query}&descriptionView=description`}
        nextHref={nextHref}
        onNext={async () => {
          if (await save({ currentStepId: "pricing", currentRoute: "price" })) {
            router.push(nextHref);
          }
        }}
        phaseOneProgress={100}
        phaseTwoProgress={100}
        nextLabel="Next"
      />
    </>
  );
}
