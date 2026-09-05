import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  pathname: "/host/listings/listing-1",
  saveState: "idle" as "idle" | "saving" | "saved" | "error",
  refresh: vi.fn(),
  submitForReview: vi.fn(),
  unpublishListing: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/host/v2/editor/save-state", () => ({
  useSaveState: () => mocks.saveState,
}));
vi.mock("@/lib/actions/listing.actions", () => ({
  submitForReview: mocks.submitForReview,
  unpublishListing: mocks.unpublishListing,
}));

import { EditorHeader } from "@/components/host/v2/editor/editor-header";

// A literal `title` attribute reads as product copy to the i18n lint, so the fixture
// name is a value, exactly as the neighbouring listing tests pass it.
const listingTitle = "Seaside apartment";
const otherTitle = "Lake house";

function render(status = "APPROVED") {
  return renderToStaticMarkup(
    <EditorHeader
      listingId="listing-1"
      title={listingTitle}
      status={status}
      statusLabel="Approved"
      statusLabels={{ APPROVED: "Approved", UNPUBLISHED: "Unpublished" }}
      slug="seaside-apartment"
      coverUrl={null}
      listings={[
        { id: "listing-1", title: listingTitle, status: "APPROVED", coverUrl: null },
        { id: "listing-2", title: otherTitle, status: "APPROVED", coverUrl: null },
      ]}
    />
  );
}

beforeEach(() => {
  mocks.pathname = "/host/listings/listing-1";
  mocks.saveState = "idle";
  vi.clearAllMocks();
});

/**
 * Switching listing keeps the host on the section they were reading. The header used to
 * read the section from a fixed segment index that only matched the internal `/host/v2`
 * route, so on the public URL it was always `undefined` and every switch landed on the
 * other listing's Overview.
 *
 * The switcher's rows live inside a Radix dropdown, which renders nothing at all until
 * it is opened and there is no DOM here to open it — the same reason
 * `classic-panel-links.test.ts` asserts against source. So the derivation itself is
 * covered as a pure function in `editor-section-from-pathname.test.ts`, and what is
 * asserted here is that this file goes through it rather than counting segments again.
 */
describe("the listing switcher", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/host/v2/editor/editor-header.tsx"),
    "utf8",
  );

  it("derives the open section through the shared reader", () => {
    expect(source).toContain("editorSectionFromPathname(pathname)");
  });

  it("never counts path segments, which is what got it wrong", () => {
    expect(source).not.toMatch(/pathname\.split\("\/"\)\[\d+\]/);
  });

  it("builds the other listing's href from that section", () => {
    expect(source).toContain("editorSectionHref(listing.id, section)");
  });
});

/**
 * A failed autosave is the one state in this header a host must not miss. It used to
 * hide its label below `sm` — a bare red dot on a phone — and, unlike the saving/saved
 * branch beside it, carried no live region at all, so assistive technology was told
 * nothing at any width.
 */
describe("the save indicator", () => {
  it("says what happened in words, with no width at which the text is hidden", () => {
    mocks.saveState = "error";
    const html = render();

    expect(html).toContain("Not saved");
    // `hidden sm:inline` is what used to wrap the label.
    expect(html).not.toMatch(/hidden sm:inline[^>]*>\s*Not saved/);
  });

  it("announces the failure to assistive technology", () => {
    mocks.saveState = "error";
    const html = render();

    expect(html).toContain('role="alert"');
    expect(html).toContain("Your last change was not saved.");
  });

  it("still reports the quiet states politely rather than as alerts", () => {
    mocks.saveState = "saving";
    const saving = render();
    expect(saving).toContain('aria-live="polite"');
    expect(saving).not.toContain('role="alert"');

    mocks.saveState = "idle";
    expect(render()).not.toContain('aria-live');
  });
});

/**
 * Publishing had exactly one home in the whole panel — a switch on the listings row,
 * hidden below `sm` and absent from the grid — so a host on a phone could not take a
 * listing off the site at all. The editor is where a host finishes a listing, so it is
 * where the action to put it on the site belongs.
 */
describe("the publish control", () => {
  it("offers Publish for a listing that is not on the site", () => {
    const html = render("UNPUBLISHED");
    expect(html).toContain("Publish");
  });

  it("does not offer Publish for a listing that is already live", () => {
    // A live listing gets "Hide" in the overflow menu instead, which Radix keeps in a
    // closed portal until it is opened.
    const html = render("APPROVED");
    expect(html).not.toContain(">Publish<");
  });

  it("offers nothing for a status the host does not own", () => {
    // `submitForReview` refuses a suspended listing, so a control here would be a
    // button that can only fail.
    const html = render("SUSPENDED");
    expect(html).not.toContain(">Publish<");
  });
});
