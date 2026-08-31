/**
 * The account roles the server can actually send.
 *
 * Prisma's `UserRole` is `USER | ADMIN` and nothing else. The app used to type every
 * role field as `string` and test for a `"SUPERADMIN"` tier alongside `"ADMIN"` — a
 * comparison the database can never satisfy, so those branches were dead without
 * anything saying so. Typing the wire fields as this union is what turns the next such
 * comparison into a compile error instead of a branch that quietly never runs.
 */
export type UserRole = "USER" | "ADMIN";

/**
 * The one admin test the app makes.
 *
 * Deliberately takes a plain `string`: these values arrive over the wire, so at runtime
 * a field typed `UserRole` can still hold anything a future server sends. Only the
 * exact role the server grants admin to counts — an unknown or malformed role is not an
 * admin. This is presentation and navigation only; every admin endpoint still enforces
 * `requireMobileAdmin` server-side.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN";
}
