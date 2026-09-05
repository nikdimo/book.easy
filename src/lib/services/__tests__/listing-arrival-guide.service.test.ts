import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listingFindFirst: vi.fn(),
  bookingAggregate: vi.fn(),
  guideFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst },
    booking: { aggregate: mocks.bookingAggregate },
    listingArrivalGuide: { findUnique: mocks.guideFindUnique },
  },
}));

import {
  getGuestArrivalGuide,
  getListingArrivalGuideEditorData,
  getPublicArrivalGuide,
} from "@/lib/services/listing-arrival-guide.service";
import { ARRIVAL_CREDENTIAL_RELEASE_HOURS } from "@/lib/host/v2/listing-arrival-guide";

/** A host who has filled the whole section in, credentials included. */
const STORED_GUIDE = {
  directions: "Second gate past the bakery.",
  checkInMethod: "KEYPAD",
  checkInMethodInstructions: "The keypad code is 4821.",
  wifiNetwork: "Villa-Guest",
  wifiPassword: "correct-horse-battery",
  houseManual: "The boiler switch is behind the kitchen door.",
  checkoutInstructions: [{ kind: "LOCK_UP", note: "" }],
  interactionPreference: "SAY_HELLO",
};

const CHECK_IN = new Date("2026-10-01T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;
/** An instant safely inside the release window, and one safely outside it. */
const AFTER_RELEASE = new Date(
  CHECK_IN.getTime() - (ARRIVAL_CREDENTIAL_RELEASE_HOURS - 1) * HOUR,
);
const BEFORE_RELEASE = new Date(
  CHECK_IN.getTime() - (ARRIVAL_CREDENTIAL_RELEASE_HOURS + 1) * HOUR,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listingFindFirst.mockResolvedValue({
    id: "listing-1",
    slug: "seaside-apartment",
    status: "APPROVED",
    checkInTime: "14:15",
    checkInEndTime: null,
    checkOutTime: null,
    maxGuests: 4,
    petPolicy: null,
    smokingPolicy: null,
    eventPolicy: null,
    quietHoursPolicy: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    additionalRules: null,
    arrivalGuide: { ...STORED_GUIDE, reviewedAt: null },
  });
  mocks.bookingAggregate.mockResolvedValue({ _max: { guestCount: 3 } });
  mocks.guideFindUnique.mockResolvedValue(STORED_GUIDE);
});

describe("getListingArrivalGuideEditorData", () => {
  it("scopes the read to the signed-in host", async () => {
    await getListingArrivalGuideEditorData("listing-1", "host-1");

    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }),
    );
  });

  it("returns a listing the host does not own as not found", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    await expect(
      getListingArrivalGuideEditorData("listing-1", "host-2"),
    ).resolves.toBeNull();
  });

  it("gives the host everything, credentials included", async () => {
    const data = await getListingArrivalGuideEditorData("listing-1", "host-1");

    expect(data?.guide.wifiPassword).toBe("correct-horse-battery");
    expect(data?.guide.checkInMethodInstructions).toBe("The keypad code is 4821.");
  });

  it("reads the stay times without losing an imported minute-level value", async () => {
    const data = await getListingArrivalGuideEditorData("listing-1", "host-1");

    expect(data?.rules.checkInTime).toBe("14:15");
    expect(data?.rules.checkInEndTime).toBe("");
    expect(data?.rules.checkOutTime).toBe("");
  });

  it("describes an empty guide for a host who has never opened the section", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "seaside-apartment",
      status: "DRAFT",
      checkInTime: "15:00",
      checkInEndTime: null,
      checkOutTime: "11:00",
      maxGuests: 2,
      petPolicy: null,
      smokingPolicy: null,
      eventPolicy: null,
      quietHoursPolicy: null,
      quietHoursStart: null,
      quietHoursEnd: null,
      additionalRules: null,
      arrivalGuide: null,
    });

    const data = await getListingArrivalGuideEditorData("listing-1", "host-1");

    expect(data?.guide.wifiPassword).toBe("");
    expect(data?.guide.checkInMethod).toBeNull();
    expect(data?.reviewedAt).toBeNull();
  });
});

describe("getGuestArrivalGuide", () => {
  it("withholds everything gated until the booking is confirmed", async () => {
    const guide = await getGuestArrivalGuide(
      "listing-1",
      { status: "PENDING", checkIn: CHECK_IN },
      AFTER_RELEASE,
    );

    expect(guide.directions).toBeNull();
    expect(guide.wifiPassword).toBeNull();
    expect(guide.checkInMethodInstructions).toBeNull();
    // But it says there is something to wait for, so the guest does not think the host
    // forgot.
    expect(guide.hasWithheldDirections).toBe(true);
    expect(guide.hasWithheldCredentials).toBe(true);
  });

  it("releases directions on confirmation and credentials only near check-in", async () => {
    const early = await getGuestArrivalGuide(
      "listing-1",
      { status: "CONFIRMED", checkIn: CHECK_IN },
      BEFORE_RELEASE,
    );

    expect(early.directions).toBe("Second gate past the bakery.");
    expect(early.wifiPassword).toBeNull();
    expect(early.wifiNetwork).toBeNull();
    expect(early.houseManual).toBeNull();
    expect(early.hasWithheldCredentials).toBe(true);

    const late = await getGuestArrivalGuide(
      "listing-1",
      { status: "CONFIRMED", checkIn: CHECK_IN },
      AFTER_RELEASE,
    );

    expect(late.wifiPassword).toBe("correct-horse-battery");
    expect(late.wifiNetwork).toBe("Villa-Guest");
    expect(late.checkInMethodInstructions).toBe("The keypad code is 4821.");
    expect(late.houseManual).toBe("The boiler switch is behind the kitchen door.");
    expect(late.hasWithheldCredentials).toBe(false);
  });

  it("takes the credentials back when a confirmed stay is cancelled", async () => {
    const guide = await getGuestArrivalGuide(
      "listing-1",
      { status: "CANCELLED", checkIn: CHECK_IN },
      AFTER_RELEASE,
    );

    expect(guide.wifiPassword).toBeNull();
    expect(guide.directions).toBeNull();
  });

  it("shares the public parts with anyone who has a booking at all", async () => {
    const guide = await getGuestArrivalGuide(
      "listing-1",
      { status: "PENDING", checkIn: CHECK_IN },
      BEFORE_RELEASE,
    );

    expect(guide.checkInMethod).toBe("KEYPAD");
    expect(guide.interactionPreference).toBe("SAY_HELLO");
    expect(guide.checkoutInstructions).toEqual([{ kind: "LOCK_UP", note: "" }]);
  });

  it("does not claim something is withheld when the host wrote nothing", async () => {
    mocks.guideFindUnique.mockResolvedValue(null);

    const guide = await getGuestArrivalGuide(
      "listing-1",
      { status: "PENDING", checkIn: CHECK_IN },
      BEFORE_RELEASE,
    );

    expect(guide.hasWithheldDirections).toBe(false);
    expect(guide.hasWithheldCredentials).toBe(false);
  });
});

describe("getPublicArrivalGuide", () => {
  it("never selects a secret column", async () => {
    await getPublicArrivalGuide("listing-1");

    const select = mocks.guideFindUnique.mock.calls[0]?.[0]?.select ?? {};
    for (const secret of [
      "wifiPassword",
      "wifiNetwork",
      "checkInMethodInstructions",
      "houseManual",
      "directions",
    ]) {
      expect(select).not.toHaveProperty(secret);
    }
  });

  it("returns only the three fields a stranger may read", async () => {
    mocks.guideFindUnique.mockResolvedValue({
      checkInMethod: "LOCKBOX",
      checkoutInstructions: [{ kind: "THROW_TRASH", note: "Bins are by the gate." }],
      interactionPreference: "APP_ONLY",
    });

    await expect(getPublicArrivalGuide("listing-1")).resolves.toEqual({
      checkInMethod: "LOCKBOX",
      checkoutInstructions: [{ kind: "THROW_TRASH", note: "Bins are by the gate." }],
      interactionPreference: "APP_ONLY",
    });
  });
});
