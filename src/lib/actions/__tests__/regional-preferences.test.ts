import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two writes that make a language and a currency choice outlive the tab it was
 * made in: a cookie for this browser, and a row on the account for every other one.
 *
 * Both actions are deliberately best-effort about the account half — picking a
 * currency must never fail because a database is briefly unreachable — so these tests
 * also pin the failure behaviour, which is the half that is easy to regress into a
 * thrown error on a public page.
 */
const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  cookieGet: vi.fn(() => undefined as { value: string } | undefined),
  auth: vi.fn(async () => ({ user: { id: "user-1" } }) as unknown),
  userUpdate: vi.fn(async () => ({})),
  revalidateTag: vi.fn(),
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  getLanguageByCode: vi.fn(async () => ({
    code: "mk",
    isDefault: false,
    isEnabled: true,
  })),
  incrementLanguageSelection: vi.fn(async () => {}),
  rateLimit: vi.fn(() => ({ success: true })),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet, get: mocks.cookieGet }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: vi.fn(),
  // `currency.actions` pulls in the rate table's module for its cache tag, and that
  // module wraps its fetch at import time.
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { user: { update: mocks.userUpdate } } }));
vi.mock("@/lib/rate-limit", () => ({
  clientIpFromHeaders: () => "127.0.0.1",
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: vi.fn(),
}));
vi.mock("@/lib/data/language.repository", () => ({
  addLanguageRecord: vi.fn(),
  countLanguages: vi.fn(),
  deleteLanguageByCode: vi.fn(),
  getLanguageByCode: mocks.getLanguageByCode,
  incrementLanguageSelection: mocks.incrementLanguageSelection,
  reorderLanguages: vi.fn(),
  updateLanguageAiTranslation: vi.fn(),
  updateLanguageEnabled: vi.fn(),
}));

import { setDisplayCurrency } from "@/lib/actions/currency.actions";
import { recordLanguageSelection } from "@/lib/actions/language.actions";
import {
  DISPLAY_CURRENCY_COOKIE,
  DISPLAY_CURRENCY_EXPLICIT_COOKIE,
} from "@/lib/currency/currency-preference";

/** The value written for one cookie by the last call, or null when it was not set. */
function cookieValue(name: string): string | null {
  const call = mocks.cookieSet.mock.calls.findLast(
    (args) => args[0] === name,
  ) as [string, string, unknown] | undefined;
  return call ? call[1] : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.userUpdate.mockResolvedValue({});
  mocks.rateLimit.mockReturnValue({ success: true });
  mocks.getLanguageByCode.mockResolvedValue({
    code: "mk",
    isDefault: false,
    isEnabled: true,
  });
});

describe("setDisplayCurrency", () => {
  it("stores the choice on the account so it survives into another browser", async () => {
    await expect(setDisplayCurrency("dkk")).resolves.toMatchObject({
      success: true,
      currency: "DKK",
    });

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { displayCurrency: "DKK" },
    });
  });

  it("writes the cookie and marks it as a deliberate choice", async () => {
    await setDisplayCurrency("DKK");

    expect(cookieValue(DISPLAY_CURRENCY_COOKIE)).toBe("DKK");
    // Without the marker the proxy treats the cookie as a detected default, which an
    // account preference would then outrank on the very next request.
    expect(cookieValue(DISPLAY_CURRENCY_EXPLICIT_COOKIE)).toBe("1");
  });

  it("refuses a malformed code, and writes nothing at all", async () => {
    // Not merely invalid — this value carries cookie punctuation, and the resolved
    // code is interpolated straight back into a `Set-Cookie` header by the proxy.
    await expect(setDisplayCurrency("EU R; path=/")).resolves.toMatchObject({
      error: expect.any(String),
    });

    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("still applies the choice in this browser when the account write fails", async () => {
    mocks.userUpdate.mockRejectedValue(new Error("database down"));

    await expect(setDisplayCurrency("DKK")).resolves.toMatchObject({ success: true });

    expect(cookieValue(DISPLAY_CURRENCY_COOKIE)).toBe("DKK");
  });

  it("stores nothing on an account for a signed-out visitor", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(setDisplayCurrency("DKK")).resolves.toMatchObject({ success: true });

    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(cookieValue(DISPLAY_CURRENCY_COOKIE)).toBe("DKK");
  });
});

describe("recordLanguageSelection", () => {
  it("stores the chosen language on the account", async () => {
    await recordLanguageSelection("mk");

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { locale: "mk" },
    });
  });

  it("stores a switch back to the default language too", async () => {
    mocks.getLanguageByCode.mockResolvedValue({
      code: "en",
      isDefault: true,
      isEnabled: true,
    });

    await recordLanguageSelection("en");

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { locale: "en" },
    });
  });

  it("stores the language even when the selection counter is rate limited", async () => {
    mocks.rateLimit.mockReturnValue({ success: false });

    await recordLanguageSelection("mk");

    expect(mocks.userUpdate).toHaveBeenCalled();
    expect(mocks.incrementLanguageSelection).not.toHaveBeenCalled();
  });

  it("ignores a malformed locale rather than storing it", async () => {
    await recordLanguageSelection("not a locale");

    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
