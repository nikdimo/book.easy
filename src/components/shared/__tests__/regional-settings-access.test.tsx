import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getTForLocale } from "@/lib/i18n/t";
import { REGIONAL_SETTINGS_OPEN_EVENT } from "@/components/shared/regional-settings-event";
import { RegionalSettingsTrigger } from "@/components/shared/regional-settings-trigger";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { HostV2Shell } from "@/components/host/v2/host-v2-shell";

vi.mock("next/font/google", () => ({
  Fredoka: () => ({ className: "font-wordmark" }),
}));

// The panel's navigation reads the current route to mark its active section. Outside
// the router there is none, and this test is not about the navigation.
vi.mock("next/navigation", () => ({
  usePathname: () => "/host",
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: async () => null }),
  signOut: async () => {},
}));

/**
 * Reaching language and currency from the two surfaces that had no way to.
 *
 * The host panel opens the shared dialog from its account menu; the new-listing flow
 * has no account menu at all, so its header carries the same opener. Both go through
 * one event to one dialog — the point of these tests is that neither surface grew a
 * preference picker of its own.
 */
describe("the new-listing header", () => {
  it("offers a language and currency control beside the way out", async () => {
    const t = await getTForLocale("en");

    const html = renderToStaticMarkup(
      <NewListingHeader t={t} exitHref="/host/listings" />,
    );

    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Language and currency");
    // The exit is still there, and still an ordinary link.
    expect(html).toContain('href="/host/listings"');
    expect(html).toContain(">Exit<");
  });

  it("names both current selections on the control itself", async () => {
    const t = await getTForLocale("en");

    const html = renderToStaticMarkup(
      <NewListingHeader t={t} exitHref="/host/listings" />,
    );

    // The fallbacks outside a provider: English, and the platform base currency.
    expect(html).toContain("EN");
    expect(html).toContain("EUR");
    expect(html).toContain("Language and currency: English, Euro");
  });

  it("carries the control on every step, including the one that hides on mobile", async () => {
    const t = await getTForLocale("en");

    const html = renderToStaticMarkup(
      <NewListingHeader t={t} exitHref="/host/listings" hideOnMobile />,
    );

    expect(html).toContain('aria-haspopup="dialog"');
  });
});

describe("the shared trigger", () => {
  it("is a button that opens a dialog rather than a picker of its own", () => {
    const html = renderToStaticMarkup(<RegionalSettingsTrigger />);

    expect(html).toContain('type="button"');
    expect(html).toContain('aria-haspopup="dialog"');
    // No list, no options, nothing stored here.
    expect(html).not.toContain("<select");
    expect(html).not.toContain('role="listbox"');
  });

  it("keeps its codes out of the machine translator's reach", () => {
    const html = renderToStaticMarkup(<RegionalSettingsTrigger />);

    expect(html).toContain("notranslate");
    expect(html).toContain('translate="no"');
  });

  it("opens the dialog through the one shared channel", () => {
    // Named rather than inlined anywhere: a second string here would be a control that
    // silently opens nothing.
    expect(REGIONAL_SETTINGS_OPEN_EVENT).toBe("regional-settings:open");
  });
});

describe("the host panel shell", () => {
  it("mounts the regional-settings dialog once for the whole panel", async () => {
    const t = await getTForLocale("en");

    const html = renderToStaticMarkup(
      <HostV2Shell
        userName="Nikola Dimovski"
        userEmail="host@example.com"
        t={t}
        regionalSettings={<div data-testid="regional-settings-dialog" />}
      >
        <p>Panel</p>
      </HostV2Shell>,
    );

    expect(html.match(/data-testid="regional-settings-dialog"/g)).toHaveLength(1);
  });
});
