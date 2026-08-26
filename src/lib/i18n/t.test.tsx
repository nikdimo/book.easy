import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TWithValues, type Translator } from "@/lib/i18n/t";

function translator(text: string, translated: boolean): Translator {
  return {
    locale: "en",
    requestedLocale: "en",
    catalogReady: true,
    messages: {},
    resolve: () => ({ text, translated }),
  };
}

describe("TWithValues", () => {
  it("wraps fallback grammar and values in stable spans", () => {
    const html = renderToStaticMarkup(
      <TWithValues
        t={translator("{type} in {city}", false)}
        k="property_card.type_in_city"
        source="{type} in {city}"
        values={{ type: "Apartment", city: "Bitola" }}
        protectedValues={["city"]}
      />,
    );

    expect(html).toBe(
      '<span>Apartment</span><span> in </span><span class="notranslate" translate="no">Bitola</span>',
    );
  });

  it("protects reviewed grammar while leaving unprotected values translatable", () => {
    const html = renderToStaticMarkup(
      <TWithValues
        t={translator("{type} во {city}", true)}
        k="property_card.type_in_city"
        source="{type} in {city}"
        values={{ type: "Apartment", city: "Bitola" }}
        protectedValues={["city"]}
      />,
    );

    expect(html).toBe(
      '<span>Apartment</span><span class="notranslate" translate="no"> во </span><span class="notranslate" translate="no">Bitola</span>',
    );
  });
});
