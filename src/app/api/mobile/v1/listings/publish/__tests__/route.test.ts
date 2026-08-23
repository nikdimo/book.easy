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

describe("mobile listing publication — house rules", () => {
  beforeEach(() => {
    mocks.submitNewListing.mockReset();
    mocks.submitNewListing.mockResolvedValue({ listingId: "listing-1" });
  });

  /** The FormData the route handed the canonical action. */
  async function publish(body: Record<string, unknown>): Promise<FormData> {
    let captured: FormData | undefined;
    mocks.submitNewListing.mockImplementation(async (formData: FormData) => {
      captured = formData;
      return { listingId: "listing-1" };
    });
    await POST(
      new Request("http://localhost/api/mobile/v1/listings/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    if (!captured) throw new Error("Expected the route to call submitNewListing");
    return captured;
  }

  it("forwards the arrival times, which this route used to drop on the floor", async () => {
    // They were missing from the field list entirely, so a mobile publish silently
    // discarded times the host had already stored on the draft.
    const formData = await publish({
      title: "Lake house",
      checkInTime: "16:00",
      checkOutTime: "10:00",
    });

    expect(formData.get("checkInTime")).toBe("16:00");
    expect(formData.get("checkOutTime")).toBe("10:00");
  });

  it("forwards every structured rule the app collected", async () => {
    const formData = await publish({
      title: "Lake house",
      maxGuests: 6,
      petPolicy: "ASK_HOST",
      smokingPolicy: "OUTDOORS_ONLY",
      eventPolicy: "NOT_ALLOWED",
      quietHoursPolicy: "SET",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      additionalRules: "No shoes indoors.",
    });

    expect(formData.get("maxGuests")).toBe("6");
    expect(formData.get("petPolicy")).toBe("ASK_HOST");
    expect(formData.get("smokingPolicy")).toBe("OUTDOORS_ONLY");
    expect(formData.get("eventPolicy")).toBe("NOT_ALLOWED");
    expect(formData.get("quietHoursPolicy")).toBe("SET");
    expect(formData.get("quietHoursStart")).toBe("22:00");
    expect(formData.get("quietHoursEnd")).toBe("08:00");
    expect(formData.get("additionalRules")).toBe("No shoes indoors.");
  });

  it("sends nothing for a rule an older client does not know about", async () => {
    // Which the publish schema then stores as NULL — unanswered, not refused.
    const formData = await publish({ title: "Lake house" });

    expect(formData.get("petPolicy")).toBeNull();
    expect(formData.get("quietHoursPolicy")).toBeNull();
  });
});
