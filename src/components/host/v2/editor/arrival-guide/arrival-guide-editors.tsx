"use client";

import { useState } from "react";
import {
  ArrowLeft,
  BellRing,
  DoorOpen,
  KeyRound,
  Lightbulb,
  Lock,
  MoreHorizontal,
  Plus,
  Smartphone,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ArrivalDetail,
  ArrivalFieldGroup,
  ArrivalProseField,
  ArrivalTextField,
} from "@/components/host/v2/editor/arrival-guide/arrival-detail";
import {
  CHECKOUT_INSTRUCTION_FREE_TEXT,
  CHECK_IN_INSTRUCTIONS_MAX,
  CHECKOUT_NOTE_MAX,
  DIRECTIONS_MAX,
  HOUSE_MANUAL_MAX,
  INTERACTION_PREFERENCES,
  WIFI_NETWORK_MAX,
  WIFI_PASSWORD_MAX,
  checkInMethodNeedsCode,
  type CheckInMethod,
  type CheckoutInstruction,
  type CheckoutInstructionKind,
  type ListingArrivalGuideInput,
} from "@/lib/host/v2/listing-arrival-guide";
import {
  checkInInstructionsPrompt,
  checkInMethodChoices,
  checkInMethodLabel,
  checkoutInstructionChoices,
  checkoutInstructionLabel,
  checkoutInstructionPlaceholder,
  interactionPreferenceLabel,
} from "@/lib/i18n/arrival-guide-labels";
import { useI18n } from "@/lib/i18n/client";

/**
 * The seven cards that own fields on `ListingArrivalGuide`.
 *
 * Every one of them is a controlled view over the section's single `guide` state: they
 * change it, they never save it. Saving belongs to `ArrivalGuideSection`, which is what
 * lets a host edit the Wi-Fi card, glance at the house manual and come back to a Save
 * button that still knows there is something to save.
 */
export interface EditorProps {
  guide: ListingArrivalGuideInput;
  onChange: (next: ListingArrivalGuideInput) => void;
  /** Whether this card differs from what the server last confirmed. */
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

/** Shared by every editor's Save button, resolved once per pane. */
function useSaveLabels() {
  const { resolve } = useI18n();
  return {
    saveLabel: resolve("host.editor.arrival.save", "Save").text,
    savingLabel: resolve("host.editor.arrival.saving", "Saving…").text,
  };
}

// ─── Directions ──────────────────────────────────────────────────────────────────

export function DirectionsEditor({ guide, onChange, dirty, saving, onSave }: EditorProps) {
  const { resolve } = useI18n();
  const labels = useSaveLabels();

  return (
    <ArrivalDetail
      title={resolve("host.editor.arrival.topic.directions", "Directions").text}
      subtitle={
        resolve(
          "host.editor.arrival.directions_hint",
          "Let guests know how to get to your place. Include any tips for parking and public transportation.",
        ).text
      }
      visibility="BOOKED"
      dirty={dirty}
      saving={saving}
      onSave={onSave}
      {...labels}
    >
      <ArrivalProseField
        id="arrival-directions"
        label={resolve("host.editor.arrival.topic.directions", "Directions").text}
        value={guide.directions}
        onChange={(directions) => onChange({ ...guide, directions })}
        placeholder={
          resolve(
            "host.editor.arrival.directions_placeholder",
            "Turn off the main road at the bakery, then it is the second gate on the left. There is space for one car in front of the house.",
          ).text
        }
        maxLength={DIRECTIONS_MAX}
        rows={10}
      />
    </ArrivalDetail>
  );
}

// ─── Check-in method ─────────────────────────────────────────────────────────────

const METHOD_ICONS: Record<CheckInMethod, typeof KeyRound> = {
  SMART_LOCK: Smartphone,
  KEYPAD: Lock,
  LOCKBOX: KeyRound,
  BUILDING_STAFF: BellRing,
  IN_PERSON: Users,
  OTHER: MoreHorizontal,
};

/**
 * Two steps in one pane, which is how Airbnb does it: pick the method, then describe it.
 *
 * The step is component state rather than a URL, because the second step is meaningless
 * without the first — a link straight to "describe your lockbox" for a host who has not
 * said they have one is a page that cannot be rendered. Opening the card with a method
 * already chosen starts on the details, since that is what a host coming back to change
 * their code is here for.
 */
export function CheckInMethodEditor({
  guide,
  onChange,
  dirty,
  saving,
  onSave,
}: EditorProps) {
  const { resolve } = useI18n();
  const labels = useSaveLabels();
  const [choosing, setChoosing] = useState(guide.checkInMethod === null);
  const method = guide.checkInMethod;

  if (choosing || method === null) {
    return (
      <ArrivalDetail
        title={
          resolve("host.editor.arrival.check_in_method_heading", "Select a check-in method")
            .text
        }
        visibility="PUBLIC"
        {...labels}
      >
        <ul className="space-y-3">
          {checkInMethodChoices({ resolve }).map((choice) => {
            const Icon = METHOD_ICONS[choice.value];
            return (
              <li key={choice.value}>
                <button
                  type="button"
                  data-selected={method === choice.value}
                  onClick={() => {
                    // Changing the method clears instructions that described the old one:
                    // "the key is under the pot" left behind on a smart lock is worse than
                    // no instructions at all, because the guest will believe it.
                    onChange({
                      ...guide,
                      checkInMethod: choice.value,
                      checkInMethodInstructions:
                        method === choice.value ? guide.checkInMethodInstructions : "",
                    });
                    setChoosing(false);
                  }}
                  className="ag-card flex w-full items-start gap-3 px-4 py-4 text-start"
                >
                  <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-[1.125rem]">
                      {choice.label}
                    </span>
                    <span className="mt-1 block text-sm leading-[1.125rem] text-[var(--ag-foggy)]">
                      {choice.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </ArrivalDetail>
    );
  }

  const secret = checkInMethodNeedsCode(method);

  return (
    <ArrivalDetail
      title={checkInMethodLabel({ resolve }, method)}
      subtitle={checkInInstructionsPrompt({ resolve }, method)}
      visibility="PRE_ARRIVAL"
      dirty={dirty}
      saving={saving}
      onSave={onSave}
      {...labels}
    >
      <button
        type="button"
        onClick={() => setChoosing(true)}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {resolve("host.editor.arrival.change_method", "Choose a different method").text}
      </button>

      <ArrivalProseField
        id="arrival-check-in-instructions"
        label={checkInInstructionsPrompt({ resolve }, method)}
        value={guide.checkInMethodInstructions}
        onChange={(checkInMethodInstructions) =>
          onChange({ ...guide, checkInMethodInstructions })
        }
        maxLength={CHECK_IN_INSTRUCTIONS_MAX}
        rows={7}
      />

      {secret && (
        // Said next to the box rather than in a help article, because this is the one
        // moment the host is holding the code and deciding where to put it.
        <p className="mt-4 flex gap-2 rounded-lg bg-[var(--ag-faint)] p-3 text-[0.8125rem] leading-[1.125rem] text-[var(--ag-foggy)]">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {
              resolve(
                "host.editor.arrival.code_warning",
                "This is the only place a door code belongs. Never put one in your listing description, your title or a photo caption — those are public.",
              ).text
            }
          </span>
        </p>
      )}
    </ArrivalDetail>
  );
}

// ─── Wifi ────────────────────────────────────────────────────────────────────────

export function WifiEditor({ guide, onChange, dirty, saving, onSave }: EditorProps) {
  const { resolve } = useI18n();
  const labels = useSaveLabels();

  return (
    <ArrivalDetail
      title={resolve("host.editor.arrival.topic.wifi", "Wifi details").text}
      visibility="PRE_ARRIVAL"
      dirty={dirty}
      saving={saving}
      onSave={onSave}
      {...labels}
    >
      <div className="space-y-3">
        <ArrivalFieldGroup>
          <ArrivalTextField
            id="arrival-wifi-network"
            label={resolve("host.editor.arrival.wifi_network", "Wifi network name").text}
            value={guide.wifiNetwork}
            onChange={(wifiNetwork) => onChange({ ...guide, wifiNetwork })}
            maxLength={WIFI_NETWORK_MAX}
          />
        </ArrivalFieldGroup>
        <ArrivalFieldGroup>
          <ArrivalTextField
            id="arrival-wifi-password"
            label={resolve("host.editor.arrival.wifi_password", "Wifi password").text}
            value={guide.wifiPassword}
            onChange={(wifiPassword) => onChange({ ...guide, wifiPassword })}
            maxLength={WIFI_PASSWORD_MAX}
            // Shown, not masked. The host is copying it off the back of a router and needs
            // to check it character by character; a masked field is how a wrong password
            // gets saved and then blamed on the guest.
            type="text"
          />
        </ArrivalFieldGroup>
      </div>
    </ArrivalDetail>
  );
}

// ─── House manual ────────────────────────────────────────────────────────────────

export function HouseManualEditor({ guide, onChange, dirty, saving, onSave }: EditorProps) {
  const { resolve } = useI18n();
  const labels = useSaveLabels();

  return (
    <ArrivalDetail
      title={resolve("host.editor.arrival.topic.house_manual", "House manual").text}
      subtitle={
        resolve(
          "host.editor.arrival.house_manual_hint",
          "Give guests tips about your space, like how to access the internet and use the TV.",
        ).text
      }
      visibility="PRE_ARRIVAL"
      dirty={dirty}
      saving={saving}
      onSave={onSave}
      {...labels}
    >
      <ArrivalProseField
        id="arrival-house-manual"
        label={resolve("host.editor.arrival.topic.house_manual", "House manual").text}
        value={guide.houseManual}
        onChange={(houseManual) => onChange({ ...guide, houseManual })}
        maxLength={HOUSE_MANUAL_MAX}
        rows={14}
      />
    </ArrivalDetail>
  );
}

// ─── Checkout instructions ───────────────────────────────────────────────────────

export function CheckoutInstructionsEditor({
  guide,
  onChange,
  dirty,
  saving,
  onSave,
}: EditorProps) {
  const { resolve } = useI18n();
  const labels = useSaveLabels();
  const [picking, setPicking] = useState(false);

  const chosen = guide.checkoutInstructions;
  const taken = new Set(chosen.map((entry) => entry.kind));
  const available = checkoutInstructionChoices({ resolve }).filter(
    (choice) => !taken.has(choice.value),
  );

  const set = (next: CheckoutInstruction[]) =>
    onChange({ ...guide, checkoutInstructions: next });

  return (
    <ArrivalDetail
      title={
        resolve("host.editor.arrival.topic.checkout_instructions", "Checkout instructions")
          .text
      }
      subtitle={
        resolve(
          "host.editor.arrival.checkout_hint",
          "Explain what's essential for guests to do before they leave. Anyone can read these before they book.",
        ).text
      }
      visibility="PUBLIC"
      dirty={dirty}
      saving={saving}
      onSave={onSave}
      {...labels}
    >
      {chosen.length > 0 && (
        <ul className="mb-4 space-y-3">
          {chosen.map((instruction) => (
            <li key={instruction.kind} className="ag-card px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-[1.125rem]">
                    {checkoutInstructionLabel({ resolve }, instruction.kind)}
                  </p>
                  <textarea
                    aria-label={checkoutInstructionLabel({ resolve }, instruction.kind)}
                    value={instruction.note}
                    onChange={(event) =>
                      set(
                        chosen.map((entry) =>
                          entry.kind === instruction.kind
                            ? { ...entry, note: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    placeholder={checkoutInstructionPlaceholder({ resolve }, instruction.kind)}
                    maxLength={CHECKOUT_NOTE_MAX}
                    rows={2}
                    className="ag-prose-input mt-1 text-sm leading-[1.25rem]"
                    data-user-generated-content
                    translate="yes"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    set(chosen.filter((entry) => entry.kind !== instruction.kind))
                  }
                  aria-label={
                    resolve("host.editor.arrival.remove_instruction", "Remove instruction")
                      .text
                  }
                  className="shrink-0 rounded-full p-2 text-[var(--ag-foggy)] transition-colors hover:bg-[var(--ag-faint)] hover:text-[var(--ag-hof)]"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {picking ? (
        // Airbnb opens this as a third column on a wide screen. Inline is the same list in
        // the same order, and it is the only version of it that works on a phone without a
        // second full-screen layer over a pane the host has not saved yet.
        <div className="ag-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {
                resolve("host.editor.arrival.choose_instruction", "Choose an instruction")
                  .text
              }
            </p>
            <button
              type="button"
              onClick={() => setPicking(false)}
              aria-label={resolve("host.editor.arrival.cancel", "Cancel").text}
              className="rounded-full p-1.5 text-[var(--ag-foggy)] transition-colors hover:bg-[var(--ag-faint)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {available.map((choice) => (
              <li key={choice.value}>
                <button
                  type="button"
                  onClick={() => {
                    set([...chosen, { kind: choice.value, note: "" }]);
                    setPicking(false);
                  }}
                  className="ag-card block w-full px-4 py-3 text-start"
                >
                  <span className="block text-sm font-medium leading-[1.125rem]">
                    {choice.label}
                  </span>
                  {choice.description && (
                    <span className="mt-1 block text-sm leading-[1.125rem] text-[var(--ag-foggy)]">
                      {choice.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        available.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="ag-card flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium"
          >
            <Plus className="size-4" aria-hidden />
            {resolve("host.editor.arrival.add_instructions", "Add instructions").text}
          </button>
        )
      )}
    </ArrivalDetail>
  );
}

// ─── Interaction preferences ─────────────────────────────────────────────────────

export function InteractionEditor({ guide, onChange, dirty, saving, onSave }: EditorProps) {
  const { resolve } = useI18n();
  const labels = useSaveLabels();

  return (
    <ArrivalDetail
      title={
        resolve("host.editor.arrival.interaction_heading", "Interaction with guests").text
      }
      subtitle={
        resolve(
          "host.editor.arrival.interaction_hint",
          "Let guests know if you enjoy spending time with them or prefer a hands-off approach.",
        ).text
      }
      visibility="PUBLIC"
      dirty={dirty}
      saving={saving}
      onSave={onSave}
      {...labels}
    >
      {/* A radiogroup rather than a list of buttons: these four are one answer, and a
          screen reader should say "2 of 4" while moving between them with an arrow key. */}
      <ul role="radiogroup" aria-label={
        resolve("host.editor.arrival.interaction_heading", "Interaction with guests").text
      } className="space-y-3">
        {INTERACTION_PREFERENCES.map((preference) => {
          const selected = guide.interactionPreference === preference;
          return (
            <li key={preference}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                data-selected={selected}
                onClick={() =>
                  onChange({
                    ...guide,
                    // Pressing the chosen one again clears it. Every other answer in this
                    // section can be taken back, and an accidental tap that permanently
                    // commits a listing to "I like socializing" would be the exception.
                    interactionPreference: selected ? null : preference,
                  })
                }
                className="ag-card flex w-full items-center gap-3 px-4 py-4 text-start"
              >
                <span className="min-w-0 flex-1 text-sm leading-[1.25rem]">
                  {interactionPreferenceLabel({ resolve }, preference)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "size-5 shrink-0 rounded-full border transition-colors",
                    selected
                      ? "border-[6px] border-[var(--ag-hof)]"
                      : "border-[var(--ag-bobo)]",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </ArrivalDetail>
  );
}

// ─── Guidebooks ──────────────────────────────────────────────────────────────────

/**
 * The one card with nothing behind it yet.
 *
 * It is here rather than hidden because a host who knows Airbnb will look for it, and an
 * absent card reads as a missing feature they have to go and hunt for. Saying plainly that
 * it is not built is shorter than the search they would otherwise do, and it names the
 * thing that *does* work today.
 */
export function GuidebooksEditor({ listingId }: { listingId: string }) {
  const { resolve } = useI18n();

  return (
    <ArrivalDetail
      title={resolve("host.editor.arrival.guidebooks_heading", "Create a guidebook").text}
      subtitle={
        resolve(
          "host.editor.arrival.guidebooks_hint",
          "Guidebooks let you share the places you would send a friend to — restaurants, beaches, the good bakery.",
        ).text
      }
      visibility="PUBLIC"
      saveLabel={resolve("host.editor.arrival.save", "Save").text}
      savingLabel={resolve("host.editor.arrival.saving", "Saving…").text}
    >
      <div className="ag-card flex items-start gap-3 p-4">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-[var(--ag-foggy)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-[1.25rem]">
            {
              resolve(
                "host.editor.arrival.guidebooks_soon",
                "Guidebooks are not available yet",
              ).text
            }
          </p>
          <p className="mt-1 text-sm leading-[1.25rem] text-[var(--ag-foggy)]">
            {
              resolve(
                "host.editor.arrival.guidebooks_meanwhile",
                "Until they are, the house manual is the place for local tips — guests get it before they arrive, and it takes as much text as you want to write.",
              ).text
            }
          </p>
          <a
            href={`/host/listings/${listingId}/arrival-guide/house-manual`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
          >
            <DoorOpen className="size-4" aria-hidden />
            {resolve("host.editor.arrival.open_house_manual", "Open the house manual").text}
          </a>
        </div>
      </div>
    </ArrivalDetail>
  );
}

/** Exported for the section root's switch, so the mapping from slug to editor lives in one
 *  place rather than being a chain of conditionals inside a layout component. */
export type CheckoutKind = CheckoutInstructionKind;
export const CHECKOUT_FREE_TEXT = CHECKOUT_INSTRUCTION_FREE_TEXT;
