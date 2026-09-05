/**
 * Every word the arrival guide is said in, in one place.
 *
 * Three surfaces render this content — the host's editor, the guest's booking page, and
 * the public listing page for the parts that are public — and a host who picks "Lockbox"
 * must see the guest told the same word. Keeping the wording here rather than at each
 * call site is what makes that true by construction instead of by review.
 *
 * The resolver is the narrow slice of a translator that both the server's `Translator` and
 * the client's `useI18n()` already satisfy, so the same functions run on both. Every key
 * and source string below is a literal argument to `resolve`, which is what the extractor
 * (`scripts/extract-ui-strings.ts`) reads — a table of key/source pairs would be invisible
 * to it and the catalog would silently lose these strings.
 *
 * Keys are namespaced `listing.arrival.*` rather than `host.*` wherever a guest can read
 * the string too, matching how `house-rules-labels.ts` splits them. Copy that only the
 * host ever sees keeps a `host.editor.arrival.*` key.
 */

import {
  CHECKOUT_INSTRUCTION_KINDS,
  CHECK_IN_METHODS,
  INTERACTION_PREFERENCES,
  type CheckInMethod,
  type CheckoutInstructionKind,
  type InteractionPreference,
} from "@/lib/host/v2/listing-arrival-guide";

/** What both translators have in common. */
export interface ArrivalLabelResolver {
  resolve(key: string, source: string): { text: string; translated: boolean };
}

export interface ArrivalChoice<T extends string> {
  value: T;
  label: string;
  /** One line on what choosing this means, shown under the choice. */
  description: string;
}

// ─── Check-in method ─────────────────────────────────────────────────────────────

export function checkInMethodLabel(t: ArrivalLabelResolver, method: CheckInMethod): string {
  switch (method) {
    case "SMART_LOCK":
      return t.resolve("listing.arrival.check_in_method.smart_lock", "Smart lock").text;
    case "KEYPAD":
      return t.resolve("listing.arrival.check_in_method.keypad", "Keypad").text;
    case "LOCKBOX":
      return t.resolve("listing.arrival.check_in_method.lockbox", "Lockbox").text;
    case "BUILDING_STAFF":
      return t.resolve("listing.arrival.check_in_method.building_staff", "Building staff").text;
    case "IN_PERSON":
      return t.resolve("listing.arrival.check_in_method.in_person", "In-person greeting").text;
    case "OTHER":
      return t.resolve("listing.arrival.check_in_method.other", "Other").text;
  }
}

function checkInMethodHint(t: ArrivalLabelResolver, method: CheckInMethod): string {
  switch (method) {
    case "SMART_LOCK":
      return t.resolve(
        "listing.arrival.check_in_method.smart_lock_hint",
        "Guests will use a code or app to open a wifi-connected lock.",
      ).text;
    case "KEYPAD":
      return t.resolve(
        "listing.arrival.check_in_method.keypad_hint",
        "Guests will use the code you provide to open an electronic lock.",
      ).text;
    case "LOCKBOX":
      return t.resolve(
        "listing.arrival.check_in_method.lockbox_hint",
        "Guests will use a code you provide to open a small safe that has a key inside.",
      ).text;
    case "BUILDING_STAFF":
      return t.resolve(
        "listing.arrival.check_in_method.building_staff_hint",
        "Someone will be available 24 hours a day to let guests in.",
      ).text;
    case "IN_PERSON":
      return t.resolve(
        "listing.arrival.check_in_method.in_person_hint",
        "Guests will meet you or your co-host to pick up keys.",
      ).text;
    case "OTHER":
      return t.resolve(
        "listing.arrival.check_in_method.other_hint",
        "Guests will use a different method not listed here.",
      ).text;
  }
}

export function checkInMethodChoices(
  t: ArrivalLabelResolver,
): ArrivalChoice<CheckInMethod>[] {
  return CHECK_IN_METHODS.map((method) => ({
    value: method,
    label: checkInMethodLabel(t, method),
    description: checkInMethodHint(t, method),
  }));
}

/**
 * The prompt over the instructions box, which changes with the method.
 *
 * A keypad host is being asked for a code and needs telling that it is stored as one; a
 * host whose neighbour holds the key is being asked for a sentence. One generic prompt
 * would be wrong for both, and the wrong one is the one that gets a code pasted into a
 * public field.
 */
export function checkInInstructionsPrompt(
  t: ArrivalLabelResolver,
  method: CheckInMethod,
): string {
  switch (method) {
    case "SMART_LOCK":
      return t.resolve(
        "listing.arrival.check_in_instructions.smart_lock",
        "Which app or code opens the lock, and what to do if it does not respond.",
      ).text;
    case "KEYPAD":
      return t.resolve(
        "listing.arrival.check_in_instructions.keypad",
        "The code, where the keypad is, and which button confirms it.",
      ).text;
    case "LOCKBOX":
      return t.resolve(
        "listing.arrival.check_in_instructions.lockbox",
        "Where the lockbox is and the code that opens it.",
      ).text;
    case "BUILDING_STAFF":
      return t.resolve(
        "listing.arrival.check_in_instructions.building_staff",
        "Where to find the desk or porter, and what to ask for.",
      ).text;
    case "IN_PERSON":
      return t.resolve(
        "listing.arrival.check_in_instructions.in_person",
        "Where to meet, and how the guest should let you know they have arrived.",
      ).text;
    case "OTHER":
      return t.resolve(
        "listing.arrival.check_in_instructions.other",
        "Describe how your guests get in.",
      ).text;
  }
}

// ─── Checkout instructions ───────────────────────────────────────────────────────

export function checkoutInstructionLabel(
  t: ArrivalLabelResolver,
  kind: CheckoutInstructionKind,
): string {
  switch (kind) {
    case "GATHER_TOWELS":
      return t.resolve("listing.arrival.checkout.gather_towels", "Gather used towels").text;
    case "THROW_TRASH":
      return t.resolve("listing.arrival.checkout.throw_trash", "Throw trash away").text;
    case "TURN_THINGS_OFF":
      return t.resolve("listing.arrival.checkout.turn_things_off", "Turn things off").text;
    case "LOCK_UP":
      return t.resolve("listing.arrival.checkout.lock_up", "Lock up").text;
    case "RETURN_KEYS":
      return t.resolve("listing.arrival.checkout.return_keys", "Return keys").text;
    case "ADDITIONAL_REQUESTS":
      return t.resolve("listing.arrival.checkout.additional", "Additional requests").text;
  }
}

/**
 * The sentence a guest reads when the host added the instruction but wrote nothing of
 * their own.
 *
 * These are the default, not a placeholder: a host who ticks "Lock up" and writes nothing
 * has still said something useful, and printing the title alone would leave the guest
 * guessing which door. `ADDITIONAL_REQUESTS` has no default because it is nothing but the
 * host's own words — an empty one is dropped rather than stored.
 */
export function checkoutInstructionDefault(
  t: ArrivalLabelResolver,
  kind: CheckoutInstructionKind,
): string {
  switch (kind) {
    case "GATHER_TOWELS":
      return t.resolve(
        "listing.arrival.checkout.gather_towels_default",
        "Leave used towels in one place, for example in the bathroom.",
      ).text;
    case "THROW_TRASH":
      return t.resolve(
        "listing.arrival.checkout.throw_trash_default",
        "Put rubbish and recycling in the bins the host has shown you.",
      ).text;
    case "TURN_THINGS_OFF":
      return t.resolve(
        "listing.arrival.checkout.turn_things_off_default",
        "Switch off the lights, the air conditioning and any appliances.",
      ).text;
    case "LOCK_UP":
      return t.resolve(
        "listing.arrival.checkout.lock_up_default",
        "Close the windows and lock the door behind you.",
      ).text;
    case "RETURN_KEYS":
      return t.resolve(
        "listing.arrival.checkout.return_keys_default",
        "Leave the keys where the host asked you to leave them.",
      ).text;
    case "ADDITIONAL_REQUESTS":
      return "";
  }
}

/** The placeholder in the host's own note box — an example rather than an instruction, so
 *  a host who types over it is not deleting something that looked required. */
export function checkoutInstructionPlaceholder(
  t: ArrivalLabelResolver,
  kind: CheckoutInstructionKind,
): string {
  return kind === "ADDITIONAL_REQUESTS"
    ? t.resolve(
        "listing.arrival.checkout.additional_placeholder",
        "Anything else you would like guests to do before they go.",
      ).text
    : t.resolve(
        "listing.arrival.checkout.note_placeholder",
        "Add your own wording (optional)",
      ).text;
}

export function checkoutInstructionChoices(
  t: ArrivalLabelResolver,
): ArrivalChoice<CheckoutInstructionKind>[] {
  return CHECKOUT_INSTRUCTION_KINDS.map((kind) => ({
    value: kind,
    label: checkoutInstructionLabel(t, kind),
    description: checkoutInstructionDefault(t, kind),
  }));
}

/** What the guest actually reads for one stored instruction: the host's words if they
 *  wrote any, the standard sentence otherwise. */
export function checkoutInstructionText(
  t: ArrivalLabelResolver,
  instruction: { kind: CheckoutInstructionKind; note: string },
): string {
  return instruction.note || checkoutInstructionDefault(t, instruction.kind);
}

// ─── Interaction preference ──────────────────────────────────────────────────────

export function interactionPreferenceLabel(
  t: ArrivalLabelResolver,
  preference: InteractionPreference,
): string {
  switch (preference) {
    case "APP_ONLY":
      return t.resolve(
        "listing.arrival.interaction.app_only",
        "I won't be available in person, and prefer communicating through the app.",
      ).text;
    case "SAY_HELLO":
      return t.resolve(
        "listing.arrival.interaction.say_hello",
        "I like to say hello in person, but keep to myself otherwise.",
      ).text;
    case "SOCIABLE":
      return t.resolve(
        "listing.arrival.interaction.sociable",
        "I like socializing and spending time with guests.",
      ).text;
    case "NO_PREFERENCE":
      return t.resolve(
        "listing.arrival.interaction.no_preference",
        "No preference — I follow my guests' lead.",
      ).text;
  }
}

export function interactionPreferenceChoices(
  t: ArrivalLabelResolver,
): { value: InteractionPreference; label: string }[] {
  return INTERACTION_PREFERENCES.map((preference) => ({
    value: preference,
    label: interactionPreferenceLabel(t, preference),
  }));
}

// ─── Visibility notes ────────────────────────────────────────────────────────────

/**
 * The line under each editor that says who will read what the host is typing.
 *
 * It is the most important sentence on these screens. A host deciding whether to put a
 * door code in a box needs to know the answer *while they are looking at the box*, not in
 * a help centre — so every editor carries one of these, and the three wordings map exactly
 * onto `ARRIVAL_FIELD_VISIBILITY`.
 */
export function arrivalVisibilityNote(
  t: ArrivalLabelResolver,
  visibility: "PUBLIC" | "BOOKED" | "PRE_ARRIVAL",
): string {
  switch (visibility) {
    case "PUBLIC":
      return t.resolve(
        "listing.arrival.visibility.public",
        "Anyone can read this before they book",
      ).text;
    case "BOOKED":
      return t.resolve(
        "listing.arrival.visibility.booked",
        "Shared once a booking is confirmed",
      ).text;
    case "PRE_ARRIVAL":
      return t.resolve(
        "listing.arrival.visibility.pre_arrival",
        "Shared 48 hours before check-in",
      ).text;
  }
}
