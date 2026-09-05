import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";

const mocks = vi.hoisted(() => ({ pathname: "/host" }));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
// The workspaces reach the server actions they can trigger, and those reach next-auth,
// which imports `next/server` — not resolvable under the plain Node test environment.
// Nothing here calls an action; these render assertions only need the modules to load.
vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({ update: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));

import { HostV2Nav } from "@/components/host/v2/host-v2-nav";
import { HostInboxShell } from "@/components/host/v2/messages/host-inbox-shell";
import { Avatar } from "@/components/host/v2/messages/inbox-surface";
import { HostCalendarWorkspace } from "@/components/host/v2/calendar/host-calendar-workspace";
import { HostReservationsWorkspace } from "@/components/host/v2/reservations/host-reservations-workspace";

const formats = buildCalendarFormats("en", ["EUR"]);

/**
 * Calendar and Reservations rendered no `<h1>` at all: their heading outline started at
 * the month name and the stream's group labels. Both use the header's underlined tab as
 * their visible title, which a screen reader cannot see — so the title is there for it
 * alone, exactly as the listings overview already does.
 */
describe("the section headings", () => {
  it("names the Calendar page even when there is nothing to schedule", () => {
    const html = renderToStaticMarkup(
      <HostCalendarWorkspace
        data={{
          today: "2026-03-10",
          horizonEnd: "2027-09-10",
          horizonMonths: 18,
          formats,
          listings: [],
        }}
        requestedListingId={null}
        intent={null}
        requestedRange={null}
      />
    );

    expect(html).toContain('<h1 class="sr-only">Calendar</h1>');
  });

  it("names the Reservations page even when there is nothing on it", () => {
    const html = renderToStaticMarkup(
      <HostReservationsWorkspace
        data={{
          today: "2026-03-10",
          now: "2026-03-10T09:00:00.000Z",
          formats,
          properties: [],
          reservations: [],
        }}
      />
    );

    expect(html).toContain('<h1 class="sr-only">Reservations</h1>');
  });
});

/**
 * The panel shipped its preview-era name in the navigation landmark a screen reader
 * announces. (The browser tab is the other place; that one is asserted where the Today
 * page is already mounted with its server dependencies, in `today-page.test.tsx`.)
 */
describe("what the panel calls itself", () => {
  it("no longer announces the navigation as a preview", () => {
    const html = renderToStaticMarkup(<HostV2Nav />);

    expect(html).toContain('aria-label="Host panel"');
    expect(html).not.toContain("New host panel");
  });
});

/**
 * The inbox claims a fixed height below `md`, because the panel is an ordinary scrolling
 * document there and its panes need something to scroll inside. It used to subtract only
 * the shell's bottom padding and not the account row above it, so the document came out
 * 48px taller than the viewport and a chat screen scrolled for no reason.
 */
describe("the inbox on a phone", () => {
  it("subtracts everything the shell puts around it, via the shell's own variable", () => {
    const html = renderToStaticMarkup(
      <HostInboxShell conversations={[]}>
        <div />
      </HostInboxShell>
    );

    expect(html).toContain("h-[calc(100dvh-var(--host-panel-mobile-chrome))]");
    // The old arithmetic knew about the padding and not about the account row.
    expect(html).not.toContain("h-[calc(100dvh-6rem)]");
  });

  it("is measured against a chrome height the shell actually publishes", () => {
    // The shell renders the brand mark through `next/font`, which has no runtime here,
    // so this reads the declaration rather than the rendered class. What matters is that
    // the variable the inbox subtracts is defined somewhere, and defined once.
    const shell = readFileSync(
      path.join(process.cwd(), "src/components/host/v2/host-v2-shell.tsx"),
      "utf8",
    );

    expect(shell).toContain("[--host-panel-mobile-chrome:9rem]");
    // 9rem is the 3rem account row plus the 6rem of bottom padding below it. If either
    // moves, both this and the row's own classes have to move together.
    expect(shell).toContain('className="flex shrink-0 items-center justify-end px-5 pt-3 md:hidden"');
    expect(shell).toContain("pb-24");
  });
});

/**
 * `img-src` allows Google's avatar host and no other, so a picture from anywhere else is
 * blocked before it paints — with nothing the page can observe but the load failing. The
 * initial has to be the answer to that, not only to "no picture was ever stored".
 */
describe("a guest's avatar", () => {
  it("shows the initial when there is no picture", () => {
    const html = renderToStaticMarkup(<Avatar name="Elena" image={null} />);
    expect(html).toContain("E");
    expect(html).not.toContain("<img");
  });

  it("falls back to the initial when the picture fails to load", () => {
    // `renderToStaticMarkup` drops event handlers, so the wiring is asserted at source
    // and the rendered fallback above proves what it falls back to.
    const source = readFileSync(
      path.join(process.cwd(), "src/components/host/v2/messages/inbox-surface.tsx"),
      "utf8",
    );
    expect(source).toContain("onError={() => setFailedUrl(image)}");
    expect(source).toContain("image && !failed");
  });

  it("gives a picture that has never failed a chance to load", () => {
    const html = renderToStaticMarkup(
      <Avatar name="Elena" image="https://lh3.googleusercontent.com/a/x" />
    );
    expect(html).toContain('src="https://lh3.googleusercontent.com/a/x"');
  });
});
