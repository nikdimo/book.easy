"use client";

import { Tx } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { ListingFlowFooter } from "./listing-flow-footer";
import { PhaseCompleteIllustration } from "./phase-complete-illustration";
import { useHostStartDraft } from "./host-start-draft-provider";

export function PhaseOneComplete({ propertyType, spaceType }: { propertyType: PropertyTypeOption; spaceType: ListingSpaceTypeValue }) {
  const { save } = useHostStartDraft();
  const router = useRouter();
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  const nextHref = `/host/start/amenities?${query}`;
  return (
    <>
      <main className="flex min-h-0 flex-1 items-center px-5 pb-28 pt-6 md:px-8 md:pb-24 md:pt-2">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-12 md:grid-cols-2 md:gap-20">
          <section>
            <p className="text-sm font-semibold text-slate-600"><Tx k="host.v2.phase_one_complete.eyebrow" source="Phase 1 complete" /></p>
            <h1 className="mt-3 font-heading text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.035em] text-slate-950 sm:text-[3.25rem]">
              <Tx k="host.v2.phase_one_complete.heading" source="Your place has a foundation" />
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-500">
              <Tx k="host.v2.phase_one_complete.hint" source="Next, you’ll make it stand out with amenities, photos, a title and a description." />
            </p>
          </section>
          <PhaseCompleteIllustration />
        </div>
      </main>
      <ListingFlowFooter
        backHref={`/host/start/basics?${query}`}
        nextHref={nextHref}
        onNext={async () => {
          if (await save({ currentStepId: "amenities", currentRoute: "amenities" })) {
            router.push(nextHref);
          }
        }}
        phaseOneProgress={100}
        nextLabel="Next"
      />
    </>
  );
}
