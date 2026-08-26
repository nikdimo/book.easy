import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingEditorOverview } from "@/lib/services/listing-editor.service";

const mocks = vi.hoisted(() => ({
  requireHostPage: vi.fn(),
  getListingEditorOverview: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("@/lib/auth-helpers", () => ({ requireHostPage: mocks.requireHostPage }));
vi.mock("@/lib/services/listing-editor.service", () => ({
  getListingEditorOverview: mocks.getListingEditorOverview,
}));
vi.mock("@/lib/i18n/t", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n/t")>()),
  // The real one reads request cookies; the source locale is what an untranslated
  // request renders with and is all this route's assertions need.
  getT: async () => ({
    locale: "en",
    messages: {},
    resolve: (_key: string, source: string) => ({ text: source, translated: false }),
  }),
}));

import ListingEditorOverviewPage from "../page";

const overview: ListingEditorOverview = {
  id: "listing-1",
  title: "Sunny loft",
  status: "APPROVED",
  slug: "sunny-loft",
  coverUrl: null,
  locationLabel: "Skopje, North Macedonia",
  photoCount: 4,
  roomCount: 2,
  amenityCount: 5,
  nightlyRate: { amount: 45, currency: "EUR" },
  availabilityMode: "OPEN",
  houseRulesReviewed: true,
  paymentMethodsReviewed: true,
  completeSections: ["photos", "basics", "rooms", "location", "payment-arrangements", "house-rules"],
};

async function render() {
  const element = await ListingEditorOverviewPage({
    params: Promise.resolve({ id: "listing-1" }),
  });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireHostPage.mockResolvedValue({ id: "host-1" });
  mocks.getListingEditorOverview.mockResolvedValue(overview);
});

describe("the base listing editor route", () => {
  it("opens the Listing overview instead of redirecting to Photos", async () => {
    const html = await render();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(html).toContain("Needs your attention");
    expect(html).toContain("All sections");
    expect(html).toContain("Sunny loft");
  });

  it("still links to every section, so nothing about task-based editing changes", async () => {
    const html = await render();
    expect(html).toContain('href="/host/listings/listing-1/photos"');
    expect(html).toContain('href="/host/listings/listing-1/availability"');
    expect(html).toContain('href="/host/listings/listing-1/payment-arrangements"');
    expect(html).toContain('href="/host/calendar?listing=listing-1"');
  });

  it("marks Overview as the active navigation item", async () => {
    const html = await render();
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/host/listings/listing-1"');
  });

  it("requires a signed-in host before reading anything", async () => {
    mocks.requireHostPage.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(render()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getListingEditorOverview).not.toHaveBeenCalled();
  });

  it("scopes the read to the signed-in host", async () => {
    await render();
    expect(mocks.getListingEditorOverview).toHaveBeenCalledWith("listing-1", "host-1");
  });

  it("is not found when the listing is not this host's", async () => {
    // The service resolves `null` for a listing that is not the host's — the same
    // answer it gives for one that does not exist, so nothing leaks either way.
    mocks.getListingEditorOverview.mockResolvedValue(null);

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
