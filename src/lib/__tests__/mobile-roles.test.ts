import { describe, expect, it } from "vitest";
import { isAdminRole } from "../../../mobile/src/lib/roles";

/**
 * The mobile app's admin test.
 *
 * The app used to ask `role === "ADMIN" || role === "SUPERADMIN"` in six places.
 * `UserRole` in Prisma is `USER | ADMIN`, so the second half was a branch no real
 * account could ever take. Everything that decides "is this an admin" on the phone now
 * routes through this one predicate: the Admin tab's visibility, the admin stack's
 * redirect guard, the Admins filter and role pill in user management, the profile and
 * account badges, and the "from support" styling on a support case reply.
 *
 * Presentation and navigation only — the server enforces the real boundary. What is
 * under test here is that the predicate names exactly one admin role and nothing else.
 */
describe("mobile isAdminRole", () => {
  it("treats ADMIN as an admin", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
  });

  it("does not treat a plain USER as an admin", () => {
    expect(isAdminRole("USER")).toBe(false);
  });

  it("grants nothing to a role the database cannot hold", () => {
    // The exact string the removed branches compared against. It never named a real
    // role; if it is ever sent, it must not be mistaken for one.
    expect(isAdminRole("SUPERADMIN")).toBe(false);
    expect(isAdminRole("SUPER_ADMIN")).toBe(false);
    expect(isAdminRole("OWNER")).toBe(false);
  });

  it("is exact, not lenient", () => {
    expect(isAdminRole("admin")).toBe(false);
    expect(isAdminRole(" ADMIN")).toBe(false);
    expect(isAdminRole("ADMINISTRATOR")).toBe(false);
    expect(isAdminRole("")).toBe(false);
  });

  it("handles a missing role — signed out, or a payload without one", () => {
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});
