import type { ListingEditorOverview } from "@/lib/services/listing-editor.service";
import { EditorHalves } from "@/components/host/v2/editor/editor-halves";
import { EditorNav } from "@/components/host/v2/editor/editor-nav";
import { EditorSpaceCards } from "@/components/host/v2/editor/editor-space-cards";
import { EditorSectionFooter } from "@/components/host/v2/editor/editor-section-footer";
import { listingPreviewable } from "@/lib/host/v2/listing-status";

/**
 * Everything under the header for the "Your space" half: the halves toggle, the section
 * navigation and the pane the section renders into.
 *
 * The frame owns the scroll boundary so a section does not have to. From `md` up `main`
 * is the scroll container, which is what lets the photos workspace keep a sticky rooms
 * rail beside a scrolling grid without the page growing a second scrollbar behind it.
 */
export function EditorFrame({
  listingId,
  section,
  attention,
  overview,
  previewSlug,
  previewStatus,
  sectionFooter = true,
  children,
}: {
  listingId: string;
  section: string;
  /** Section slugs with an open task, from `editorAttentionSlugs`. */
  attention: string[];
  /**
   * The listing, for the left column's summary lines — "12 photos", "Ohrid, North
   * Macedonia". It is exactly what `getListingEditorHeader` returns, which every page here
   * already awaits, so passing it costs no extra query. `null` is handled: the cards fall
   * back to their labels alone.
   */
  overview: ListingEditorOverview | null;
  /** Public slug, so the footer can offer a real preview. Omitted only by callers that
   *  have not loaded the listing header. */
  previewSlug?: string;
  /** The listing's status. The public page only exists for an approved listing, so the
   *  preview is withheld rather than pointed at a 404. */
  previewStatus?: string;
  /** Overview renders the full section list itself, with real summaries attached, so it
   *  turns the footer's copy of that list off rather than printing it twice. */
  sectionFooter?: boolean;
  children: React.ReactNode;
}) {
  const canPreview =
    previewSlug !== undefined &&
    (previewStatus === undefined || listingPreviewable(previewStatus));


  return (
    // The toggle owns the width and the outer column; this row is only the split between
    // the rail and the pane. Every breakpoint here is `lg`, matching where EditorNav swaps
    // its chip row for the rail. Splitting them — a row layout at `md` while the
    // navigation is still a horizontal scroller — laid the chip row out as a flex column
    // beside the content and pushed the page into horizontal overflow.
    <EditorHalves listingId={listingId} half="space">
      {/* No horizontal padding from `lg` up: the left column owns its own, and the
          divider on its right edge has to reach the full height of the frame rather
          than floating inside a gutter. */}
      <div className="flex min-w-0 flex-1 flex-col px-4 sm:px-5 lg:min-h-0 lg:flex-row lg:px-0">
        <EditorNav listingId={listingId} current={section} attention={attention} />
        <EditorSpaceCards
          listingId={listingId}
          current={section}
          overview={overview}
          attention={attention}
        />
        <main className="flex min-w-0 flex-1 flex-col pb-16 lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:pb-6">
          {children}
          {sectionFooter && (
            <EditorSectionFooter
              listingId={listingId}
              current={section}
              attention={attention}
              previewSlug={canPreview ? previewSlug : undefined}
            />
          )}
        </main>
      </div>
    </EditorHalves>
  );
}
