/**
 * How a room is named on screen. Pure and shared, because the server renders the first
 * paint and the client renames rooms optimistically after a drag — two different answers
 * to "what is this room called" is exactly the bug this avoids.
 *
 * The rule: a host's own display name wins; otherwise the type carries a number only
 * when the listing actually has more than one room of that type. "Bedroom 1" on a
 * one-bedroom flat is false precision, and "Kitchen 1" reads as a mistake.
 */
export function roomDisplayName({
  displayName,
  typeLabel,
  ordinal,
  sameTypeCount,
}: {
  displayName: string | null;
  typeLabel: string;
  ordinal: number;
  sameTypeCount: number;
}): string {
  const custom = displayName?.trim();
  if (custom) return custom;
  return sameTypeCount > 1 ? `${typeLabel} ${ordinal}` : typeLabel;
}

/**
 * The number a new room of this type should take. Deliberately max + 1 rather than
 * "count + 1": after deleting Bedroom 2 of three, the next bedroom has to be 4, or it
 * would collide with the Bedroom 3 the host is still looking at.
 */
export function nextOrdinal(existingOrdinals: number[]): number {
  return existingOrdinals.reduce((highest, value) => Math.max(highest, value), 0) + 1;
}
