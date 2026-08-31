import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who the mobile API calls an admin, and what the session endpoint tells the app.
 *
 * `requireMobileAdmin` used to accept `"ADMIN"` or `"SUPERADMIN"`, and the session
 * endpoint computed `canManageProperties` the same way. Prisma's `UserRole` is
 * `USER | ADMIN`, so the second arm was unreachable — but `role` is typed `string` on
 * the session, so it was also the shape that would have let any unrecognised role
 * through if one were ever added to the check. These tests pin the allowlist to exactly
 * one role.
 *
 * `auth()` is stubbed because next-auth does not resolve under vitest; the bearer-token
 * case below goes through the real Postgres read instead, so both arms of
 * `requireMobileUser` are covered.
 */

const mocks = vi.hoisted(() => ({
  session: { current: null as { user: Record<string, unknown> } | null },
  tokenUserId: { current: null as string | null },
}));

vi.mock("@/lib/auth", () => ({
  auth: async () => mocks.session.current,
}));

vi.mock("@/lib/mobile-session-token", () => ({
  bearerToken: (request: Request) =>
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
  readMobileSessionToken: async () => mocks.tokenUserId.current,
}));

import { db } from "@/lib/db";
import { requireMobileAdmin, requireMobileUser } from "@/lib/mobile-api";
import { GET as getSession } from "@/app/api/mobile/v1/session/route";

const request = (init?: RequestInit) =>
  new Request("https://example.test/api/mobile/v1/session", init);

/** Signs in as a user with this shape, without touching the database. */
function signedInAs(user: Record<string, unknown>) {
  mocks.session.current = { user: { id: "user-1", isHost: false, ...user } };
}

const createdUserIds: string[] = [];

async function createUser(role: "USER" | "ADMIN", isHost = false) {
  const user = await db.user.create({
    data: {
      email: `test-${role.toLowerCase()}-${randomUUID()}@example.test`,
      name: `Test ${role}`,
      role,
      isHost,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

beforeEach(() => {
  mocks.session.current = null;
  mocks.tokenUserId.current = null;
});

afterEach(async () => {
  if (createdUserIds.length) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
  }
});

describe("requireMobileAdmin", () => {
  it("denies a plain USER", async () => {
    signedInAs({ role: "USER" });

    const access = await requireMobileAdmin(request());

    expect("response" in access).toBe(true);
    const response = (access as { response: Response }).response;
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
  });

  it("allows an ADMIN", async () => {
    signedInAs({ role: "ADMIN" });

    const access = await requireMobileAdmin(request());

    expect("response" in access).toBe(false);
    expect((access as { user: { role: string } }).user.role).toBe("ADMIN");
  });

  it("allows an ADMIN read through the real bearer-token path", async () => {
    // The token proves who signed in; the role is read fresh from Postgres. This is the
    // path an installed app takes, and it is the only one that sees the real enum.
    const admin = await createUser("ADMIN");
    mocks.tokenUserId.current = admin.id;

    const access = await requireMobileAdmin(
      request({ headers: { authorization: "Bearer token" } })
    );

    expect("response" in access).toBe(false);
    expect((access as { user: { id: string } }).user.id).toBe(admin.id);
  });

  it("denies a USER read through the real bearer-token path", async () => {
    const user = await createUser("USER");
    mocks.tokenUserId.current = user.id;

    const access = await requireMobileAdmin(
      request({ headers: { authorization: "Bearer token" } })
    );

    expect("response" in access).toBe(true);
    expect((access as { response: Response }).response.status).toBe(403);
  });

  it("grants nothing to a role the database cannot hold", async () => {
    // `role` is `string` on the session type, so an unrecognised value is expressible
    // even though no row can carry one. It must be refused, not waved through.
    for (const role of ["SUPERADMIN", "SUPER_ADMIN", "admin", "OWNER", ""]) {
      signedInAs({ role });

      const access = await requireMobileAdmin(request());

      expect("response" in access, `role ${JSON.stringify(role)}`).toBe(true);
      expect((access as { response: Response }).response.status).toBe(403);
    }
  });

  it("still refuses an unauthenticated caller before it looks at any role", async () => {
    const access = await requireMobileUser(request());

    expect("response" in access).toBe(true);
    expect((access as { response: Response }).response.status).toBe(401);
  });
});

describe("GET /api/mobile/v1/session", () => {
  async function sessionFor(user: Record<string, unknown>) {
    signedInAs(user);
    const response = await getSession(request());
    // The handler's declared return widens to `Response | undefined` only because the
    // stubbed `auth()` above makes the unauthenticated arm unreachable to the checker.
    if (!response) throw new Error("the session route returned no response");
    return (await response.json()) as {
      user: { role: string; isHost: boolean; canManageProperties: boolean };
    };
  }

  it("tells a regular guest they cannot manage properties", async () => {
    const body = await sessionFor({ role: "USER", isHost: false });

    expect(body.user.role).toBe("USER");
    expect(body.user.isHost).toBe(false);
    expect(body.user.canManageProperties).toBe(false);
  });

  it("lets a host manage properties", async () => {
    const body = await sessionFor({ role: "USER", isHost: true });

    expect(body.user.canManageProperties).toBe(true);
  });

  it("lets an admin manage properties without being a host", async () => {
    const body = await sessionFor({ role: "ADMIN", isHost: false });

    expect(body.user.role).toBe("ADMIN");
    expect(body.user.canManageProperties).toBe(true);
  });

  it("does not let an unrecognised role in through canManageProperties", async () => {
    const body = await sessionFor({ role: "SUPERADMIN", isHost: false });

    expect(body.user.canManageProperties).toBe(false);
  });
});
