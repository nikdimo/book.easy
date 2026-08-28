"use client";

import {
  BedDouble,
  Check,
  DoorOpen,
  House,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Tx, translatedClass, useI18n } from "@/lib/i18n/client";
import { resolveListingSpaceTypeLabel } from "@/lib/i18n/property-type-labels";
import {
  allowedListingSpaceTypes,
  type ListingSpaceTypeValue,
} from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { cn } from "@/lib/utils";
import { reviewHref } from "@/lib/host/v2/listing-flow-return";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

const SPACE_TYPE_ICONS: Record<ListingSpaceTypeValue, LucideIcon> = {
  ENTIRE_PLACE: House,
  PRIVATE_ROOM: DoorOpen,
  SHARED_ROOM: Users,
  HOTEL_ROOM: BedDouble,
};

function resolveSpaceTypeDescription(
  translator: ReturnType<typeof useI18n>,
  value: ListingSpaceTypeValue,
  fallback: string,
) {
  switch (value) {
    case "ENTIRE_PLACE":
      return translator.resolve(
        "host.space_type.entire_place_description",
        "Guests have the whole property to themselves.",
      );
    case "PRIVATE_ROOM":
      return translator.resolve(
        "host.space_type.private_room_description",
        "Guests have a private room and may share other spaces.",
      );
    case "SHARED_ROOM":
      return translator.resolve(
        "host.space_type.shared_room_description",
        "Guests sleep in a room or area shared with others.",
      );
    case "HOTEL_ROOM":
      return translator.resolve(
        "host.space_type.hotel_room_description",
        "Guests book a private room in a hotel or similar property.",
      );
    default:
      return { text: fallback, translated: false };
  }
}

export function SpaceTypeStep({
  propertyType,
  initialSpaceType,
  returnToReview = false,
}: {
  propertyType: PropertyTypeOption;
  initialSpaceType?: ListingSpaceTypeValue;
  /** Reached from the Review screen's "Edit", directly or through the property type. */
  returnToReview?: boolean;
}) {
  const i18n = useI18n();
  const { data, save } = useHostStartDraft();
  const [selectedType, setSelectedType] = useState<ListingSpaceTypeValue | "">(
    initialSpaceType ?? data.spaceType ?? "",
  );
  /** Shown once the host has tried to move on, not while they are still reading the
   *  three options — the same live-Next-with-an-error pattern the rest of the flow uses
   *  rather than a disabled control that explains nothing. */
  const [showError, setShowError] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const options = allowedListingSpaceTypes(propertyType.value);
  const flowQuery = (space: ListingSpaceTypeValue) =>
    `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(space)}`;
  // Back needs an answer to address Review with, and the one the draft holds is the one
  // this screen arrived carrying. Without it there is nothing to return to yet, so Back
  // stays the step behind.
  const backHref =
    returnToReview && initialSpaceType
      ? reviewHref(flowQuery(initialSpaceType))
      : `/host/start/property-type?propertyType=${encodeURIComponent(propertyType.value)}`;
  const nextHref = selectedType
    ? returnToReview
      ? reviewHref(flowQuery(selectedType))
      : `/host/start/location?${flowQuery(selectedType)}`
    : null;

  return (
    <>
      <main className="flex flex-1 px-5 pb-28 pt-6 md:px-8 md:pb-32 md:pt-10">
        <div className="mx-auto w-full max-w-5xl">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Tx k="host.v2.space_type.eyebrow" source="Guest access" />
          </p>
          <h1
            id="space-type-heading"
            className="mt-3 max-w-2xl font-heading text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-950 sm:text-[2rem] md:text-[2.35rem]"
          >
            <Tx k="host.v2.space_type.heading" source="What will guests book?" />
          </h1>
          <p id="space-type-hint" className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
            <Tx
              k="host.v2.space_type.hint"
              source="Choose the option that matches how you rent out your place."
            />
          </p>

          <div
            ref={groupRef}
            role="radiogroup"
            aria-labelledby="space-type-heading"
            aria-describedby="space-type-hint space-type-error"
            aria-required="true"
            aria-invalid={showError && !selectedType}
            className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {options.map((option) => {
              const selected = selectedType === option.value;
              const label = resolveListingSpaceTypeLabel(i18n, option.value);
              const description = resolveSpaceTypeDescription(
                i18n,
                option.value,
                option.description,
              );
              const Icon = SPACE_TYPE_ICONS[option.value];

              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedType(option.value)}
                  className={cn(
                    "group relative flex min-h-24 cursor-pointer flex-col rounded-2xl bg-white p-4 text-left shadow-[0_3px_14px_rgba(15,23,42,0.08)] outline-none transition-[box-shadow,transform,background-color] hover:-translate-y-0.5 hover:shadow-[0_7px_20px_rgba(15,23,42,0.12)] active:translate-y-0 focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2",
                    selected &&
                      "bg-slate-100 shadow-[0_8px_22px_rgba(15,23,42,0.16)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.2)]",
                  )}
                >
                  <span className="flex w-full items-center gap-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-800 transition-colors group-hover:bg-slate-100",
                        selected && "bg-white text-slate-950 group-hover:bg-white",
                      )}
                    >
                      <Icon className="size-5" strokeWidth={1.6} aria-hidden />
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 font-heading text-base font-semibold text-slate-950",
                        translatedClass(label),
                      )}
                      translate={label.translated ? "no" : undefined}
                    >
                      {label.text}
                    </span>
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 text-transparent transition-colors",
                        selected && "bg-slate-950 text-white",
                      )}
                      aria-hidden
                    >
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                  </span>
                  <span
                    className={cn(
                      "mt-2.5 block text-[0.8125rem] leading-5 text-slate-500",
                      translatedClass(description),
                    )}
                    translate={description.translated ? "no" : undefined}
                  >
                    {description.text}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Always in the tree, so the live region exists to announce into rather than
              being created at the moment it has something to say. */}
          <p
            id="space-type-error"
            role="alert"
            className="mt-6 text-sm text-rose-600 empty:hidden"
          >
            {showError && !selectedType
              ? i18n.resolve(
                  "host.v2.space_type.error_required",
                  "Choose what guests will book.",
                ).text
              : null}
          </p>
        </div>
      </main>

      {/* Shared footer, same reason as the step before it. */}
      <ListingFlowFooter
        nextHref={nextHref ?? undefined}
        backHref={backHref}
        nextLabel={returnToReview ? "Save and review" : "Continue"}
        onNext={async () => {
          if (!nextHref || !selectedType) {
            setShowError(true);
            groupRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
            return;
          }
          const saved = await save({
            propertyType: propertyType.value,
            spaceType: selectedType,
            currentStepId: "location",
          });
          if (saved) window.location.assign(nextHref);
        }}
        phaseOneProgress={40}
      />
    </>
  );
}
