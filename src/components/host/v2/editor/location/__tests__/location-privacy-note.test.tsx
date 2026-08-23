import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocationPrivacyNote } from "@/components/host/v2/editor/location/location-privacy-note";
import type { Resolved } from "@/lib/i18n/t";

/** Source-locale resolver: every key falls back to its English literal, which is what
 *  an untranslated request renders with. */
const resolve = (_key: string, source: string): Resolved => ({
  text: source,
  translated: false,
});

function render(props: { area: string; city: string; country: string }) {
  return renderToStaticMarkup(
    <LocationPrivacyNote resolve={resolve} {...props} />,
  );
}

describe("LocationPrivacyNote", () => {
  it("quotes the exact public line back to the host", () => {
    const html = render({
      area: "Centar",
      city: "Skopje",
      country: "North Macedonia",
    });

    expect(html).toContain("Guests see");
    expect(html).toContain("Centar, Skopje, North Macedonia");
  });

  it("skips an area the host has not filled in rather than leaving a stray comma", () => {
    const html = render({ area: "", city: "Skopje", country: "North Macedonia" });

    expect(html).toContain("Skopje, North Macedonia");
    expect(html).not.toContain(", Skopje");
  });

  it("says what is still private, so the street number is never a guess", () => {
    const html = render({ area: "", city: "Skopje", country: "North Macedonia" });

    expect(html).toContain("street address, pin and Street View stay private");
  });

  it("asks for the missing fields when there is no public line yet", () => {
    const html = render({ area: "", city: "", country: "" });

    expect(html).toContain("area, city and country");
    expect(html).not.toContain("Guests see<");
  });

  it("marks the host's own place names as not for machine translation", () => {
    const html = render({
      area: "Centar",
      city: "Skopje",
      country: "North Macedonia",
    });

    expect(html).toMatch(/notranslate[^>]*>Centar, Skopje, North Macedonia/);
  });
});
