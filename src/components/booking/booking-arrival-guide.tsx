import { DoorOpen, Lock, LogOut, MessageCircle, Wifi } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGuestArrivalGuide } from "@/lib/services/listing-arrival-guide.service";
import {
  ARRIVAL_CREDENTIAL_RELEASE_HOURS,
  type CheckoutInstruction,
} from "@/lib/host/v2/listing-arrival-guide";
import {
  checkInMethodLabel,
  checkoutInstructionLabel,
  checkoutInstructionText,
  interactionPreferenceLabel,
} from "@/lib/i18n/arrival-guide-labels";
import { formatDate } from "@/lib/utils/format";
import { getT, T, ti } from "@/lib/i18n/t";

/**
 * The host's arrival guide, as much of it as this guest has earned.
 *
 * Nothing is filtered here. `getGuestArrivalGuide` has already decided what this booking
 * may see, and a field it withheld is `null` rather than hidden — so a door code the guest
 * is not entitled to never reached the browser, let alone the DOM. This component's only
 * judgement is what to say in place of a field that is not here yet, and that is worth
 * saying: a guest who sees nothing assumes the host has not bothered, and messages them
 * about it at eleven at night.
 *
 * The card does not render at all for a stay with nothing in it — no guide, nothing
 * withheld — because an empty "Getting in" card is a worse answer than no card.
 */
export async function BookingArrivalGuide({
  listingId,
  booking,
}: {
  listingId: string;
  booking: { status: string; checkIn: Date };
}) {
  const [t, guide] = await Promise.all([getT(), getGuestArrivalGuide(listingId, booking)]);

  const hasContent =
    guide.directions !== null ||
    guide.checkInMethod !== null ||
    guide.checkInMethodInstructions !== null ||
    guide.wifiNetwork !== null ||
    guide.wifiPassword !== null ||
    guide.houseManual !== null ||
    guide.checkoutInstructions.length > 0 ||
    guide.interactionPreference !== null;

  if (!hasContent && !guide.hasWithheldDirections && !guide.hasWithheldCredentials) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DoorOpen className="h-4 w-4" />
          <T t={t} k="account.arrival_guide.heading" source="Getting in" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {guide.checkInMethod && (
          <Detail
            label={t.resolve("account.arrival_guide.method", "Check-in method").text}
            value={checkInMethodLabel(t, guide.checkInMethod)}
          />
        )}

        {guide.directions && (
          <Detail
            label={t.resolve("account.arrival_guide.directions", "Directions").text}
            value={guide.directions}
          />
        )}

        {guide.checkInMethodInstructions && (
          <Detail
            label={
              t.resolve("account.arrival_guide.instructions", "How to get in").text
            }
            value={guide.checkInMethodInstructions}
            /* A door code is the one thing on this page a guest reads aloud in a taxi and
               types with cold hands. It gets its own emphasis, and it is never translated
               by the Google layer — a "translated" keypad code is a wrong keypad code. */
            emphasis
          />
        )}

        {(guide.wifiNetwork || guide.wifiPassword) && (
          <div>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Wifi className="h-3.5 w-3.5" />
              <T t={t} k="account.arrival_guide.wifi" source="Wi-Fi" />
            </p>
            <dl className="mt-1 space-y-0.5">
              {guide.wifiNetwork && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">
                    <T t={t} k="account.arrival_guide.wifi_network" source="Network" />
                  </dt>
                  <dd className="notranslate font-medium" translate="no">
                    {guide.wifiNetwork}
                  </dd>
                </div>
              )}
              {guide.wifiPassword && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">
                    <T t={t} k="account.arrival_guide.wifi_password" source="Password" />
                  </dt>
                  <dd className="notranslate font-mono font-medium" translate="no">
                    {guide.wifiPassword}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {guide.houseManual && (
          <Detail
            label={t.resolve("account.arrival_guide.manual", "House manual").text}
            value={guide.houseManual}
          />
        )}

        {/* What is still to come, and when. Stated for a guest who has some of the guide
            already as well as for one who has none of it. */}
        {(guide.hasWithheldDirections || guide.hasWithheldCredentials) && (
          <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {booking.status === "CONFIRMED"
                ? guide.credentialsUnlockAt
                  ? ti(
                      t,
                      "account.arrival_guide.unlock_date",
                      "Your host has added door and Wi-Fi details. They appear here on {date}, {hours} hours before check-in.",
                      {
                        date: formatDate(guide.credentialsUnlockAt),
                        hours: ARRIVAL_CREDENTIAL_RELEASE_HOURS,
                      },
                    ).text
                  : t.resolve(
                      "account.arrival_guide.unlock_soon",
                      "Your host has added more arrival details, which appear here shortly before check-in.",
                    ).text
                : ti(
                    t,
                    "account.arrival_guide.unlock_after_confirmation",
                    "Once the host confirms this booking you will get directions, and the door and Wi-Fi details {hours} hours before check-in.",
                    { hours: ARRIVAL_CREDENTIAL_RELEASE_HOURS },
                  ).text}
            </span>
          </p>
        )}

        {guide.checkoutInstructions.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <LogOut className="h-3.5 w-3.5" />
              <T
                t={t}
                k="account.arrival_guide.checkout"
                source="Before you leave"
              />
            </p>
            <ul className="mt-1 space-y-1">
              {guide.checkoutInstructions.map((instruction: CheckoutInstruction) => (
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
          </div>
        )}

        {guide.interactionPreference && (
          <p className="flex items-start gap-2 text-muted-foreground">
            <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{interactionPreferenceLabel(t, guide.interactionPreference)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p
        className={`mt-1 whitespace-pre-line ${emphasis ? "font-medium" : ""}`}
        // Host-authored, so it gets the same treatment as the description: translated on
        // request rather than replaced, and never rewritten in storage.
        data-user-generated-content
        translate={emphasis ? "no" : "yes"}
      >
        {value}
      </p>
    </div>
  );
}
