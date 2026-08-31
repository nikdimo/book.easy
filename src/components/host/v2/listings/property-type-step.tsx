"use client";

import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { PropertyTypeIcon } from "@/components/shared/property-type-icon";
import { Tx, translatedClass, useI18n } from "@/lib/i18n/client";
import {
  resolvePropertyTypeDescription,
  resolvePropertyTypeLabel,
} from "@/lib/i18n/property-type-labels";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { cn } from "@/lib/utils";
import { reviewHref } from "@/lib/host/v2/listing-flow-return";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

/**
 * UI-only first step for the from-scratch flow.
 *
 * The selection lives in local state and is carried to the next UI-only screen in the
 * URL. No draft, cookie, local-storage entry, or server mutation is created here.
 */
export function PropertyTypeStep({
  propertyTypes,
  initialPropertyType,
  returnToReview = false,
  spaceType,
}: {
  propertyTypes: PropertyTypeOption[];
  initialPropertyType?: string;
  /** Reached from the Review screen's "Edit". */
  returnToReview?: boolean;
  /** The space type the flow already carries, so a host who came from Review can be
   *  sent back there — Review is addressed by both answers — and so the next screen
   *  opens on the choice they made rather than empty. */
  spaceType?: string;
}) {
  const i18n = useI18n();
  const { data, save } = useHostStartDraft();
  const [selectedType, setSelectedType] = useState(
    initialPropertyType ?? data.propertyType ?? "",
  );
  /** The error appears once the host has tried to move on, not while they are still
   *  reading the tiles. Same pattern as Price and Availability: Next is a live control
   *  that says what is missing, never a dead disabled one that says nothing. */
  const [showError, setShowError] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  // Even from Review this step hands off to the space type rather than returning: the
  // property type decides which space types are offered at all, so a changed answer
  // here can leave the stored one no longer allowed. The marker rides along, and the
  // screen after it is the one that returns.
  const nextHref = selectedType
    ? `/host/start/space-type?propertyType=${encodeURIComponent(selectedType)}${spaceType ? `&spaceType=${encodeURIComponent(spaceType)}` : ""}${returnToReview ? "&returnTo=review" : ""}`
    : null;
  const backHref =
    returnToReview && spaceType
      ? reviewHref(
          `propertyType=${encodeURIComponent(initialPropertyType ?? selectedType)}&spaceType=${encodeURIComponent(spaceType)}`,
        )
      : "/host/start";

  return (
    <>
      <main className="flex flex-1 px-5 pb-28 pt-6 md:px-8 md:pb-32 md:pt-10">
        <div className="mx-auto w-full max-w-5xl">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Tx k="host.v2.property_type.eyebrow" source="Your property" />
          </p>
          <h1
            id="property-type-heading"
            className="mt-3 max-w-2xl font-heading text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-950 sm:text-[2rem] md:text-[2.35rem]"
          >
            <Tx
              k="host.v2.property_type.heading"
              source="What kind of place are you listing?"
            />
          </h1>
          <p id="property-type-hint" className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
            <Tx
              k="host.v2.property_type.hint"
              source="Choose the closest match. You can change this later."
            />
          </p>

          {propertyTypes.length > 0 ? (
            <div
              ref={groupRef}
              role="radiogroup"
              aria-labelledby="property-type-heading"
              aria-describedby="property-type-hint property-type-error"
              aria-required="true"
              aria-invalid={showError && !selectedType}
              className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {propertyTypes.map((type) => {
                const selected = selectedType === type.value;
                const label = resolvePropertyTypeLabel(i18n, type.value, type.label);
                const description = resolvePropertyTypeDescription(
                  i18n,
                  type.value,
                  type.description,
                );

                return (
                  <button
                    key={type.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedType(type.value)}
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
                        <PropertyTypeIcon name={type.icon} className="size-5" strokeWidth={1.6} />
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
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">
              <Tx
                k="host.v2.property_type.empty"
                source="Property types are not available right now. Please try again later."
              />
            </div>
          )}

          {/* Always in the tree, so the live region is there to announce into rather
              than being created at the moment it has something to say. */}
          <p
            id="property-type-error"
            role="alert"
            className="mt-6 text-sm text-rose-600 empty:hidden"
          >
            {showError && !selectedType
              ? i18n.resolve(
                  "host.v2.property_type.error_required",
                  "Choose the kind of place you are listing.",
                ).text
              : null}
          </p>
        </div>
      </main>

      {/* The shared footer, not a local copy: Back and Continue have to land on the
          same two x-positions here as on every later step. */}
      <ListingFlowFooter
        nextHref={nextHref ?? undefined}
        backHref={backHref}
        onNext={async () => {
          if (!nextHref) {
            // Nothing is written and nothing navigates: the host is told what is
            // missing and left on the tile they have to pick from.
            setShowError(true);
            groupRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
            return;
          }
          const saved = await save({
            propertyType: selectedType,
            currentStepId: "spaceType",
            // Literal rather than read off `nextHref`: this step hands off to the
            // space type even when it was reached from Review, so its href carries
            // the return marker and its route never varies.
            currentRoute: "space-type",
          });
          if (saved) window.location.assign(nextHref);
        }}
        phaseOneProgress={20}
      />
    </>
  );
}
