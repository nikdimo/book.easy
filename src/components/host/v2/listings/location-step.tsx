"use client";

import { MapPin, Search, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Tx, useI18n } from "@/lib/i18n/client";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { hostStartRouteOf } from "@/lib/host-start-draft";
import { reviewHref } from "@/lib/host/v2/listing-flow-return";
import { ListingFlowFooter } from "./listing-flow-footer";
import { LocationPreviewAnimation } from "./location-preview-animation";
import { AddressModal } from "./address-modal";
import { useHostStartDraft } from "./host-start-draft-provider";
import { RegionalSettingsTrigger } from "@/components/shared/regional-settings-trigger";

export function LocationStep({
  propertyType,
  spaceType,
  returnToReview = false,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  /** Reached from the Review screen's "Edit". */
  returnToReview?: boolean;
}) {
  const i18n = useI18n();
  const { data, save } = useHostStartDraft();
  const [address, setAddress] = useState(data.address || "");
  const [addressOpen, setAddressOpen] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  const backHref = returnToReview ? reviewHref(query) : `/host/start/space-type?${query}`;
  // The address the modal saves is the whole of what Review's location row shows, so a
  // host who came from there is finished once it is stored — the capacity screen after
  // it is the next question of a walk they are not on.
  const nextHref = returnToReview ? reviewHref(query) : `/host/start/basics?${query}`;

  return (
    <>
      <main className="flex min-h-0 flex-1 px-0 pb-0 pt-0 lg:items-center lg:px-8 lg:pb-24 lg:pt-3">
        <div className="fixed right-4 top-4 z-30 flex items-center gap-2 lg:hidden">
          <RegionalSettingsTrigger />
          <Link href="/host/listings" aria-label={i18n.resolve("host.v2.location.close", "Close").text} className="grid size-10 place-items-center rounded-full bg-white/90 text-slate-950 shadow-sm backdrop-blur"><X className="size-5" aria-hidden /></Link>
        </div>
        <div className="mx-auto grid w-full max-w-[1020px] items-center gap-0 lg:grid-cols-[420px_464px] lg:justify-between lg:gap-16">
          <section className="relative z-10 -mt-8 mx-auto w-full max-w-none rounded-t-[2rem] bg-white px-5 pb-10 pt-12 text-center lg:order-first lg:mx-0 lg:mt-0 lg:max-w-[440px] lg:rounded-none lg:px-0 lg:py-0">
            <h1 className="font-heading text-[2.5rem] font-semibold leading-[1] tracking-[-0.04em] text-slate-950 sm:text-[3.25rem] lg:text-[clamp(2.75rem,3vw,3.5rem)]">
              <Tx
                k="host.v2.location.heading"
                source="Set up your listing"
              />
            </h1>
            <p className="mx-auto mt-5 max-w-[420px] text-base leading-6 text-slate-500 lg:text-lg">
              <Tx
                k="host.v2.location.hint"
                source="It’s easy to create a great listing—let’s start with your address."
              />
            </p>

            <label className="mt-8 block text-left lg:mt-10" htmlFor="listing-address">
              <span className="sr-only">
                <Tx k="host.v2.location.address_label" source="Property address" />
              </span>
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
                <input
                  id="listing-address"
                  ref={addressInputRef}
                  type="search"
                  autoComplete="street-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  onFocus={() => setAddressOpen(true)}
                  placeholder={
                    i18n.resolve(
                      "host.v2.location.address_placeholder",
                      "Enter your address",
                    ).text
                  }
                  className="min-h-14 w-full rounded-full border border-slate-300 bg-white py-3 pl-12 pr-12 text-sm text-slate-950 outline-none transition-shadow placeholder:text-slate-500 focus-visible:border-slate-950 focus-visible:ring-2 focus-visible:ring-slate-400"
                />
                <MapPin
                  className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-slate-700"
                  aria-hidden
                />
              </span>
            </label>
            <p className="mx-auto mt-5 hidden max-w-[430px] text-center text-sm leading-5 text-slate-500 lg:block">
              <Tx
                k="host.v2.location.privacy"
                source="You can confirm the exact map position before your listing goes live."
              />
            </p>
          </section>

          <aside
            className="order-first mx-auto w-full max-w-none lg:order-last lg:max-w-[464px]"
            aria-label={
              i18n.resolve(
                "host.v2.location.preview_label",
                "Listing preview animation",
              ).text
            }
          >
            <LocationPreviewAnimation />
          </aside>
        </div>
      </main>

      <ListingFlowFooter
        backHref={backHref}
        onNext={() => setAddressOpen(true)}
        phaseOneProgress={60}
        hideOnMobile
      />
      <AddressModal
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        returnFocusTo={addressInputRef}
        initialAddress={address}
        onContinue={async (location) => {
          const saved = await save({
            address: location.address,
            city: location.city,
            area: location.area,
            postalCode: location.postalCode,
            country: location.country,
            latitude: String(location.pin.latitude),
            longitude: String(location.pin.longitude),
            locationSource: location.pin.source,
            locationConfirmed: "true",
            geocodingProvider: location.pin.provider,
            geocodingPlaceId: location.pin.placeId,
            currentStepId: "details",
            currentRoute: hostStartRouteOf(nextHref),
          });
          if (saved) window.location.assign(nextHref);
        }}
      />
    </>
  );
}
