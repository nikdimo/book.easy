import { EditorNav } from "@/components/host/v2/editor/editor-nav";

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
  children,
}: {
  listingId: string;
  section: string;
  complete: string[];
  children: React.ReactNode;
}) {
  return (
    // Every breakpoint here is `lg`, matching where EditorNav swaps its chip row for the
    // rail. Splitting them — a row layout at `md` while the navigation is still a
    // horizontal scroller — laid the chip row out as a flex column beside the content and
    // pushed the page into horizontal overflow.
    <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col px-4 sm:px-5 lg:min-h-0 lg:flex-row lg:gap-6 lg:px-6">
      <EditorNav listingId={listingId} current={section} complete={complete} />
      <main className="flex min-w-0 flex-1 flex-col pb-16 lg:min-h-0 lg:overflow-y-auto lg:pb-6">
        {children}
      </main>
    </div>
  );
}
