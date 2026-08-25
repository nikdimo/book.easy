import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: authMock }));

import { GET } from "./route";

describe("GET /host/start/new", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("redirects an authenticated host without leaking the proxy localhost origin", async () => {
    authMock.mockResolvedValue({
      user: { id: "host-1", isHost: true, role: "USER" },
    });

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/host/start/property-type");
    expect(response.headers.get("location")).not.toContain("localhost");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("keeps the sign-in redirect relative too", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/login");
  });
});
