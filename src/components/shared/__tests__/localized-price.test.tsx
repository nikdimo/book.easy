import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalizedPrice } from "../localized-price";

describe("LocalizedPrice", () => {
  it("protects locale-formatted currency from machine translation", () => {
    const html = renderToStaticMarkup(
      <LocalizedPrice amount={180} currency="EUR" locale="mk" />
    );

    expect(html).toContain('class="notranslate"');
    expect(html).toContain('translate="no"');
    expect(html).toContain("180");
  });
});
