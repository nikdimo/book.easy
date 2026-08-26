import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTranslatableUserContent,
  translateEmailUserContent,
} from "@/lib/email/user-content-translation";

/**
 * Every test here mocks `fetch`. Nothing in this file may reach Google: a test suite
 * that calls a billed external API is a test suite nobody runs offline, and one that
 * quietly passes when the key is missing is worse than none.
 *
 * The behaviour under test is mostly about what happens when translation *doesn't*
 * work. An email is not a page that can re-render — a booking confirmation delayed
 * behind a stalled endpoint is a guest who does not know their stay is confirmed. So
 * the contract is: translate when it is quick and safe, and otherwise get out of the
 * way with the original text and no error.
 */

const ORIGINAL_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const ORIGINAL_TIMEOUT = process.env.GOOGLE_TRANSLATE_TIMEOUT_MS;

function mockTranslateResponse(
  translations: { translatedText: string; detectedSourceLanguage?: string }[],
) {
  // Typed with the arguments `fetch` is actually called with, so the assertions below
  // can read the request body without casting.
  return vi.fn(async (url: string, init: RequestInit) => {
    // Asserted on every call rather than in one test: whatever else changes, this
    // must always be the official Cloud Translation endpoint, reached by POST.
    expect(url.startsWith("https://translation.googleapis.com/language/translate/v2?key=")).toBe(
      true,
    );
    expect(init.method).toBe("POST");
    return new Response(JSON.stringify({ data: { translations } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

/** The JSON body of the one request the mock received. */
function requestBody(fetchMock: ReturnType<typeof mockTranslateResponse>) {
  return JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
    q: string[];
    target: string;
    format: string;
  };
}

beforeEach(() => {
  process.env.GOOGLE_TRANSLATE_API_KEY = "test-key";
  delete process.env.GOOGLE_TRANSLATE_TIMEOUT_MS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.GOOGLE_TRANSLATE_API_KEY;
  else process.env.GOOGLE_TRANSLATE_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_TIMEOUT === undefined) delete process.env.GOOGLE_TRANSLATE_TIMEOUT_MS;
  else process.env.GOOGLE_TRANSLATE_TIMEOUT_MS = ORIGINAL_TIMEOUT;
});

describe("isTranslatableUserContent", () => {
  it("accepts the prose a person actually writes", () => {
    expect(isTranslatableUserContent("Ќе пристигнеме околу 20 часот.")).toBe(true);
    expect(isTranslatableUserContent("The boiler is broken, sorry.")).toBe(true);
  });

  it("refuses a booking reference", () => {
    // The one string in the email that has to survive byte for byte: it is what the
    // guest quotes to support and what the host searches their inbox for.
    expect(isTranslatableUserContent("LH-2026-ABCDEFGH")).toBe(false);
    expect(isTranslatableUserContent("lh-2026-abcdefgh")).toBe(false);
  });

  it("refuses a currency code", () => {
    expect(isTranslatableUserContent("MKD")).toBe(false);
    expect(isTranslatableUserContent("EUR")).toBe(false);
  });

  it("refuses a bare URL", () => {
    expect(isTranslatableUserContent("https://lingerhomes.com/properties/villa")).toBe(
      false,
    );
    expect(isTranslatableUserContent("www.example.com/a/b")).toBe(false);
  });

  it("refuses prose containing protected or sensitive details", () => {
    expect(
      isTranslatableUserContent(
        "Open https://lingerhomes.com/bookings/LH-2026-ABCDEFGH for the details.",
      ),
    ).toBe(false);
    expect(isTranslatableUserContent("Email me at host@example.com when you arrive.")).toBe(
      false,
    );
    expect(isTranslatableUserContent("Please transfer EUR 50 to IBAN MK07250120000058984.")).toBe(
      false,
    );
    expect(isTranslatableUserContent("My one-time password is 123456.")).toBe(false);
  });

  it("refuses what has nothing to translate", () => {
    expect(isTranslatableUserContent(null)).toBe(false);
    expect(isTranslatableUserContent(undefined)).toBe(false);
    expect(isTranslatableUserContent("")).toBe(false);
    expect(isTranslatableUserContent("   ")).toBe(false);
    expect(isTranslatableUserContent("2026-08-25 · 4")).toBe(false);
  });

  it("refuses text far longer than a note, a reason or a preview", () => {
    expect(isTranslatableUserContent("a".repeat(50))).toBe(true);
    expect(isTranslatableUserContent("word ".repeat(400))).toBe(false);
  });
});

describe("translateEmailUserContent", () => {
  it("translates and reports the original alongside it", async () => {
    const fetchMock = mockTranslateResponse([
      { translatedText: "Ще пристигнем около 20 ч.", detectedSourceLanguage: "mk" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const [result] = await translateEmailUserContent(
      ["Ќе пристигнеме околу 20 часот."],
      "bg",
    );

    expect(result.machineTranslated).toBe(true);
    expect(result.text).toBe("Ще пристигнем около 20 ч.");
    expect(result.original).toBe("Ќе пристигнеме околу 20 часот.");
    expect(result.detectedSourceLanguage).toBe("mk");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends one request for every field in the email", async () => {
    // A booking email has a listing title, sometimes a reason and sometimes a note.
    // Three round trips would be three chances to time out on one send.
    const fetchMock = mockTranslateResponse([
      { translatedText: "Villa au bord du lac", detectedSourceLanguage: "mk" },
      { translatedText: "La chaudière est cassée.", detectedSourceLanguage: "mk" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const results = await translateEmailUserContent(
      ["Вила покрај езеро", "Бојлерот е расипан.", null],
      "fr",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = requestBody(fetchMock);
    expect(body.q).toEqual(["Вила покрај езеро", "Бојлерот е расипан."]);
    expect(body.target).toBe("fr");
    expect(body.format).toBe("text");
    expect(results.map((result) => result.text)).toEqual([
      "Villa au bord du lac",
      "La chaudière est cassée.",
      "",
    ]);
  });

  it("keeps position when only some values are translatable", async () => {
    const fetchMock = mockTranslateResponse([
      { translatedText: "Seeblick", detectedSourceLanguage: "mk" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const [reference, title, missing] = await translateEmailUserContent(
      ["LH-2026-ABCDEFGH", "Поглед на езеро", null],
      "de",
    );

    expect(reference).toEqual({
      text: "LH-2026-ABCDEFGH",
      original: "LH-2026-ABCDEFGH",
      machineTranslated: false,
    });
    expect(title.text).toBe("Seeblick");
    expect(missing.text).toBe("");
    expect(requestBody(fetchMock).q).toEqual(["Поглед на езеро"]);
  });

  it("never sends an embedded reference, URL, email address, or payment detail to Google", async () => {
    const fetchMock = mockTranslateResponse([
      { translatedText: "Seeblick", detectedSourceLanguage: "mk" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const protectedValues = [
      "See booking LH-2026-ABCDEFGH before arrival.",
      "Open https://example.com/private to pay.",
      "Write to guest@example.com tomorrow.",
      "Send EUR 50 to IBAN MK07250120000058984.",
    ];
    const results = await translateEmailUserContent(
      [...protectedValues, "Поглед на езеро"],
      "de",
    );

    expect(requestBody(fetchMock).q).toEqual(["Поглед на езеро"]);
    expect(results.slice(0, protectedValues.length).map((result) => result.text)).toEqual(
      protectedValues,
    );
    expect(results.at(-1)?.text).toBe("Seeblick");
  });

  it("does not call the API at all without a key", async () => {
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
    const fetchMock = mockTranslateResponse([{ translatedText: "nope" }]);
    vi.stubGlobal("fetch", fetchMock);

    const [result] = await translateEmailUserContent(["Здраво"], "de");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: "Здраво",
      original: "Здраво",
      machineTranslated: false,
    });
  });

  it("sends the original when the request times out", async () => {
    // The failure that matters most. `AbortSignal.timeout` rejects with this.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    );

    const [result] = await translateEmailUserContent(["Бојлерот е расипан."], "de");

    expect(result.machineTranslated).toBe(false);
    expect(result.text).toBe("Бојлерот е расипан.");
  });

  it("sends the original when the API returns an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota exceeded", { status: 429 })));

    const [result] = await translateEmailUserContent(["Здраво"], "fr");

    expect(result.machineTranslated).toBe(false);
    expect(result.text).toBe("Здраво");
  });

  it("sends the original when the response body is not what it should be", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 200 })));

    const [result] = await translateEmailUserContent(["Здраво"], "fr");

    expect(result.machineTranslated).toBe(false);
    expect(result.text).toBe("Здраво");
  });

  it("sends the original when the API returns the wrong number of translations", async () => {
    const fetchMock = mockTranslateResponse([{ translatedText: "Bonjour" }]);
    vi.stubGlobal("fetch", fetchMock);

    const results = await translateEmailUserContent(["Здраво", "Довидување"], "fr");

    expect(results.every((result) => !result.machineTranslated)).toBe(true);
    expect(results.map((result) => result.text)).toEqual(["Здраво", "Довидување"]);
  });

  it("does not label text that was already in the recipient's language", async () => {
    // Google echoes the input back. Labelling that as a translation would print an
    // identical "original" underneath it for no reason.
    vi.stubGlobal(
      "fetch",
      mockTranslateResponse([
        { translatedText: "Le chauffe-eau est cassé.", detectedSourceLanguage: "fr" },
      ]),
    );

    const [result] = await translateEmailUserContent(["Le chauffe-eau est cassé."], "fr");

    expect(result.machineTranslated).toBe(false);
    expect(result.text).toBe("Le chauffe-eau est cassé.");
  });

  it("decodes the entities Google returns even in text mode", async () => {
    // Left alone, a host's "B&B" reaches the guest as "B&amp;B" in a plain-text email.
    vi.stubGlobal(
      "fetch",
      mockTranslateResponse([
        {
          translatedText: "L&#39;h&#xF4;te &amp; le &quot;B&amp;B&quot;",
          detectedSourceLanguage: "mk",
        },
      ]),
    );

    const [result] = await translateEmailUserContent(["домаќин и гостин"], "fr");

    expect(result.text).toBe('L\'hôte & le "B&B"');
  });

  it("never rejects, whatever fetch does", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(translateEmailUserContent(["Здраво"], "de")).resolves.toEqual([
      { text: "Здраво", original: "Здраво", machineTranslated: false },
    ]);
  });

  it("honours a configured timeout", async () => {
    process.env.GOOGLE_TRANSLATE_TIMEOUT_MS = "50";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: "Hallo" }] } }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const [result] = await translateEmailUserContent(["Здраво"], "de");

    expect(result.text).toBe("Hallo");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("how a machine translation reaches the recipient", () => {
  it("labels it and prints the untouched original underneath", async () => {
    const { renderBookingEmail } = await import("@/lib/email/booking-template");

    const html = renderBookingEmail({
      preheader: "Ihre Anfrage",
      eyebrow: "Neue Buchungsanfrage",
      headline: "Ana möchte bei Ihnen übernachten",
      intro: "Gästenachricht: “Wir kommen gegen 20 Uhr an.”",
      reference: "LH-2026-ABCDEFGH",
      listingTitle: "Seeblick",
      listingHref: "https://example.com/p/seeblick",
      location: "Ohrid, MK",
      details: [{ label: "Anreise", value: "25. Aug. 2026" }],
      buttons: [{ label: "Anfrage prüfen", href: "https://example.com/h/1" }],
      translationNote: {
        notice: "Automatisch von Google übersetzt.",
        originalLabel: "Original im Wortlaut:",
        originals: ["Ќе пристигнеме околу 20 часот."],
      },
    });

    expect(html).toContain("Automatisch von Google übersetzt.");
    expect(html).toContain("Original im Wortlaut:");
    // The words the guest actually typed, unaltered, in the email itself — not a
    // link to them and not a paraphrase.
    expect(html).toContain("Ќе пристигнеме околу 20 часот.");
  });

  it("says nothing at all when nothing was translated", async () => {
    const { renderBookingEmail } = await import("@/lib/email/booking-template");

    const html = renderBookingEmail({
      preheader: "p",
      eyebrow: "e",
      headline: "h",
      intro: "i",
      reference: "LH-2026-ABCDEFGH",
      listingTitle: "Seeblick",
      listingHref: "https://example.com/p/seeblick",
      location: "Ohrid, MK",
      details: [],
      buttons: [],
    });

    expect(html).not.toContain("Google");
    expect(html).not.toContain("Original");
  });

  it("escapes an original that contains markup", async () => {
    const { renderBookingEmail } = await import("@/lib/email/booking-template");

    const html = renderBookingEmail({
      preheader: "p",
      eyebrow: "e",
      headline: "h",
      intro: "i",
      reference: "LH-2026-ABCDEFGH",
      listingTitle: "Seeblick",
      listingHref: "https://example.com/p/seeblick",
      location: "Ohrid, MK",
      details: [],
      buttons: [],
      translationNote: {
        notice: "Automatically translated by Google.",
        originalLabel: "Original as written:",
        originals: ["<script>alert(1)</script> B&B"],
      },
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("B&amp;B");
  });
});
