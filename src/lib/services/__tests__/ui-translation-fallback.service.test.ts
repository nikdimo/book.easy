import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  languages: vi.fn(),
  uiStrings: vi.fn(),
  translations: vi.fn(),
  upsert: vi.fn(),
  anthropic: vi.fn(),
  gemini: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
    language: { findMany: mocks.languages },
    uiString: { findMany: mocks.uiStrings },
    uiTranslation: {
      findMany: mocks.translations,
      upsert: mocks.upsert,
    },
  },
}));
vi.mock("@/lib/ai/anthropic", () => ({
  translateBatchToLocales: mocks.anthropic,
}));
vi.mock("@/lib/ai/gemini", () => ({
  translateBatchToLocalesWithGemini: mocks.gemini,
}));

import { syncTranslations } from "@/lib/services/ui-translation.service";

describe("translation provider fallback integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "configured-but-invalid";
    process.env.GOOGLE_API_KEY = "configured-google-key";
    mocks.queryRaw.mockResolvedValue([{ owner: "test-owner" }]);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    mocks.languages.mockResolvedValue([
      { code: "mk", name: "Македонски", sortOrder: 1 },
    ]);
    mocks.uiStrings.mockResolvedValue(
      Array.from({ length: 500 }, (_, index) => ({
        key: `test.key.${index}`,
        sourceText: `Source ${index}`,
      })),
    );
    mocks.translations.mockResolvedValue([]);
    mocks.upsert.mockResolvedValue({});
    mocks.anthropic.mockRejectedValue(
      new Error("401 authentication_error: invalid API key"),
    );
    mocks.gemini
      .mockImplementationOnce(
        async (
          texts: Record<string, string>,
          targets: readonly { code: string }[],
        ) =>
          Object.fromEntries(
            targets.map(({ code }) => [
              code,
              Object.fromEntries(
                Object.keys(texts).map((key) => [key, `Translated ${key}`]),
              ),
            ]),
          ),
      )
      .mockRejectedValueOnce(
        new Error(
          "Gemini 429: quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier quotaValue 20",
        ),
      );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  it("stops making Gemini calls after a daily quota failure mid-run", async () => {
    const [result] = await syncTranslations();

    expect(mocks.anthropic).toHaveBeenCalledTimes(1);
    expect(mocks.gemini).toHaveBeenCalledTimes(2);
    expect(Object.keys(mocks.gemini.mock.calls[0][0])).toHaveLength(40);
    expect(Object.keys(mocks.gemini.mock.calls[1][0])).toHaveLength(200);
    expect(result).toMatchObject({
      locale: "mk",
      translated: 40,
      failed: 460,
    });
    expect(result.errors).toHaveLength(3);
    expect(result.errors[1]).toContain("Skipped after provider configuration failure");
  });
});
