/** Automatic whole-page translation is intentionally kept away from operational
 * surfaces. A mistranslated payment status, booking deadline, or admin action can
 * cause real harm; public discovery pages can safely offer the broader fallback. */
const OPERATIONAL_PATH_PREFIXES = [
  "/account",
  "/admin",
  "/bookings",
  "/host",
  "/messages",
  "/mobile-auth",
] as const;

export function automaticTranslationAllowedForPath(pathname: string): boolean {
  return !OPERATIONAL_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

