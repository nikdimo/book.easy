import { DoorOpen, LogOut, MessageCircle } from "lucide-react";
import { getPublicArrivalGuide } from "@/lib/services/listing-arrival-guide.service";
import {
  checkInMethodLabel,
  checkoutInstructionLabel,
  checkoutInstructionText,
  interactionPreferenceLabel,
} from "@/lib/i18n/arrival-guide-labels";
import { getT, T } from "@/lib/i18n/t";

/**
 * The part of a host's arrival guide a guest may read before they book.
 *
 * It exists because the editor promises it does. Each of those three fields is marked
 * `PUBLIC` in `ARRIVAL_FIELD_VISIBILITY`, and the host is told "Anyone can read this before
 * they book" on the line above the Save button — so there has to be somewhere they can.
 * Checkout instructions are the ones that matter: "strip the beds and start the dishwasher"
 * is a term of the stay, and a guest who only meets it on the morning they leave has been
 * asked for something they never agreed to.
 *
 * Nothing here can be a secret. It reads through `getPublicArrivalGuide`, whose `select`
 * does not name a single credential column, so the worst a bug in this file can do is show
 * a guest the wrong public sentence.
 */
export async function PublicArrivalSummary({ listingId }: { listingId: string }) {
  const [t, guide] = await Promise.all([getT(), getPublicArrivalGuide(listingId)]);

  if (
    !guide ||
    (guide.checkInMethod === null &&
      guide.checkoutInstructions.length === 0 &&
      guide.interactionPreference === null)
  ) {
    return null;
  }

  return (
    <section aria-labelledby="arrival-summary-heading" className="space-y-4">
      <h2 id="arrival-summary-heading" className="text-xl font-semibold">
        <T t={t} k="listing.arrival.public_heading" source="Arriving and leaving" />
      </h2>

      <dl className="space-y-4 text-sm">
        {guide.checkInMethod && (
          <div className="flex items-start gap-3">
            <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="text-muted-foreground">
                <T t={t} k="listing.arrival.public_method" source="Check-in" />
              </dt>
              <dd className="mt-0.5 font-medium">
                {checkInMethodLabel(t, guide.checkInMethod)}
              </dd>
            </div>
          </div>
        )}

        {guide.checkoutInstructions.length > 0 && (
          <div className="flex items-start gap-3">
            <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="text-muted-foreground">
                <T
                  t={t}
                  k="listing.arrival.public_checkout"
                  source="Before you leave"
                />
              </dt>
              <dd className="mt-0.5">
                <ul className="space-y-1">
                  {guide.checkoutInstructions.map((instruction) => (
                    <li key={instruction.kind}>
                      <span className="font-medium">
                        {checkoutInstructionLabel(t, instruction.kind)}
                      </span>
                      {checkoutInstructionText(t, instruction) && (
                        <span
                          className="text-muted-foreground"
                          data-user-generated-content
                          translate="yes"
                        >
                          {" — "}
                          {checkoutInstructionText(t, instruction)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </div>
        )}

        {guide.interactionPreference && (
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="text-muted-foreground">
                <T
                  t={t}
                  k="listing.arrival.public_interaction"
                  source="During your stay"
                />
              </dt>
              <dd className="mt-0.5">
                {interactionPreferenceLabel(t, guide.interactionPreference)}
              </dd>
            </div>
          </div>
        )}
      </dl>
    </section>
  );
}
