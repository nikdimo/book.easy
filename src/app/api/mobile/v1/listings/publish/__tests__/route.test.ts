import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitNewListing: vi.fn(),
}));

vi.mock("@/lib/actions/listing.actions", () => ({
  submitNewListing: mocks.submitNewListing,
}));

vi.mock("@/lib/mobile-api", () => ({
  mobileOptions: vi.fn(),
  requireMobileHost: vi.fn(async () => ({ user: { id: "host-1" } })),
  mobileJson: vi.fn(
    (_request: Request, body: unknown, init?: ResponseInit) =>
      Response.json(body, init)
  ),
}));

import { POST } from "@/app/api/mobile/v1/listings/publish/route";

describe("mobile listing publication", () => {
  beforeEach(() => {
    mocks.submitNewListing.mockReset();
  });

  it("forwards the complete pre-publish plan to the canonical action", async () => {
    const prePublishPlan = {
      blocks: [{ startDate: "2026-09-10", endDate: "2026-09-12" }],
      openDates: [{ startDate: "2026-10-01", endDate: "2026-10-05" }],
      datePrices: [],
      offers: [],
      availabilityStart: { mode: "selected" },
    };
    mocks.submitNewListing.mockImplementation(
      async (formData: FormData, draftId: string | null) => {
        expect(draftId).toBe("draft-1");
        expect(JSON.parse(String(formData.get("prePublishPlan")))).toEqual(
          prePublishPlan
        );
        return { listingId: "listing-1" };
      }
    );

    const response = await POST(
      new Request("http://localhost/api/mobile/v1/listings/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Lake house",
          draftId: "draft-1",
          prePublishPlan,
        }),
      })
    );

    expect(response).toBeDefined();
    if (!response) throw new Error("Expected a mobile publish response");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ listingId: "listing-1" });
  });

  it("does not invent available-now when the client omits the plan", async () => {
    mocks.submitNewListing.mockImplementation(async (formData: FormData) => {
      expect(formData.get("prePublishPlan")).toBeNull();
      return { error: "Confirm when guests can start booking before publishing." };
    });

    const response = await POST(
      new Request("http://localhost/api/mobile/v1/listings/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Legacy client listing" }),
      })
    );

    expect(response).toBeDefined();
    if (!response) throw new Error("Expected a mobile publish response");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Confirm when guests can start booking before publishing.",
    });
  });
});
