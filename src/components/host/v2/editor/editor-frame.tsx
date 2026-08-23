import { EditorNav } from "@/components/host/v2/editor/editor-nav";
import { EditorSectionFooter } from "@/components/host/v2/editor/editor-section-footer";
import { listingPreviewable } from "@/lib/host/v2/listing-status";

/**
 * Everything under the header: the section navigation and the pane the section renders
 * into.
 *
 * The frame owns the scroll boundary so a section does not have to. From `md` up `main`
 * is the scroll container, which is what lets the photos workspace keep a sticky rooms
 * rail beside a scrolling grid without the page growing a second scrollbar behind it.
 */
export function EditorFrame({
  listingId,
  section,
  complete,
  previewSlug,
  previewStatus,
  sectionFooter = true,
  children,
}: {
  listingId: string;
  section: string;
  complete: string[];
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
    // Every breakpoint here is `lg`, matching where EditorNav swaps its chip row for the
    // rail. Splitting them — a row layout at `md` while the navigation is still a
    // horizontal scroller — laid the chip row out as a flex column beside the content and
    // pushed the page into horizontal overflow.
    <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col px-4 sm:px-5 lg:min-h-0 lg:flex-row lg:gap-6 lg:px-6">
      <EditorNav listingId={listingId} current={section} complete={complete} />
      <main className="flex min-w-0 flex-1 flex-col pb-16 lg:min-h-0 lg:overflow-y-auto lg:pb-6">
        {children}
        {sectionFooter && (
          <EditorSectionFooter
            listingId={listingId}
            current={section}
            complete={complete}
            previewSlug={canPreview ? previewSlug : undefined}
          />
        )}
      </main>
    </div>
  );
}
