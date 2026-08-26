"use client";

import { useState } from "react";
import {
  PaymentArrangementsEditor,
} from "@/components/host/v2/editor/payment-arrangements/payment-arrangements-editor";
import {
  normalizePaymentArrangementsDraft,
  paymentArrangementsAreComplete,
  type PaymentArrangementsDraft,
} from "@/components/host/v2/editor/payment-arrangements/payment-arrangements-model";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

/** Required listing-creation step. Private templates are optional, but the public
 * accepted-method answer is not: a guest must know their choices before requesting. */
export function PaymentArrangementsStep({
  propertyType,
  spaceType,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
}) {
  const { data, save } = useHostStartDraft();
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  const [draft, setDraft] = useState<PaymentArrangementsDraft>(() =>
    normalizePaymentArrangementsDraft({
      methodCodes: data.acceptedPaymentMethods ?? [],
      otherLabel: data.paymentMethodOther ?? null,
      instructionTemplates: data.paymentInstructionTemplates ?? {},
    }),
  );
  const complete = paymentArrangementsAreComplete(draft);

  return (
    <>
      <main className="flex-1 px-5 pb-32 pt-4 md:px-8 md:pb-32">
        <PaymentArrangementsEditor
          initialValue={{ ...draft, reviewedAt: null }}
          onSave={() => undefined}
          onChange={(next) => setDraft(next)}
          showSubmit={false}
        />
      </main>
      <ListingFlowFooter
        {...(complete
          ? {
              nextHref: `/host/start/availability?${query}`,
              onNext: async () => {
                const normalized = normalizePaymentArrangementsDraft(draft);
                if (
                  await save({
                    acceptedPaymentMethods: normalized.methodCodes,
                    paymentMethodOther: normalized.otherLabel,
                    paymentInstructionTemplates:
                      normalized.instructionTemplates ?? {},
                    currentStepId: "specialOffer",
                  })
                ) {
                  window.location.assign(`/host/start/availability?${query}`);
                }
              },
            }
          : { onNext: () => undefined })}
        backHref={`/host/start/price?${query}`}
        phaseOneProgress={100}
        phaseTwoProgress={100}
        phaseThreeProgress={40}
        nextLabel="Next"
      />
    </>
  );
}
