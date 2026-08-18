/** The marketplace's civil-date boundary, shared conceptually with the web/server
 * `NEXT_PUBLIC_BOOKING_TIME_ZONE` / `BOOKING_TIME_ZONE` rule. Expo only exposes
 * variables prefixed with EXPO_PUBLIC_, so native has the equivalent override. */
export const MOBILE_MARKETPLACE_TIME_ZONE =
  process.env.EXPO_PUBLIC_BOOKING_TIME_ZONE || "Europe/Skopje";

/** Returns YYYY-MM-DD in the marketplace timezone, independent of the device's
 * timezone. This prevents native from rejecting a date that the server still calls
 * today (or accepting yesterday around midnight). */
export function marketplaceTodayYmd(
  now: Date = new Date(),
  timeZone: string = MOBILE_MARKETPLACE_TIME_ZONE
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
