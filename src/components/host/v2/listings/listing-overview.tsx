"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays, ImageIcon, LayoutGrid, List } from "lucide-react";
import {
  AddListingActions,
  AddListingMenu,
} from "@/components/host/v2/listings/add-listing-menu";
import { ListingActionsMenu } from "@/components/host/v2/listings/listing-actions-menu";
import {
  ListingModerationNotice,
  isModerationBlocked,
} from "@/components/host/v2/listings/listing-moderation-notice";
import { DeleteDraftControl } from "@/components/host/v2/listings/delete-draft-control";
import {
  ListingVisibilitySwitch,
  isVisibilitySwitchable,
} from "@/components/host/v2/listings/listing-visibility-switch";
import { useListingStateLabel } from "@/components/host/v2/listings/listing-state-label";
import {
  isActionableState,
  resolveListingState,
  type ListingState,
} from "@/lib/host/listing-state";
import type { HostListingOverviewItem } from "@/lib/services/host-listing-overview.service";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";

/**
 * The listings overview: a photo, a name, and one sentence about what is true right now.
 *
 * Two views, because they answer different questions. The list answers "does anything
 * need me?" and is the default, since that is why a host opens this page. The grid
 * answers "which one is this?" and therefore shows the photo large and almost nothing
 * else — it still carries a badge for a listing in trouble, so switching view can never
 * hide a problem.
 */

const VIEW_KEY = "host-v2-listings-view";
/** Below this, a search box is furniture: a host can see every listing at once, so the
 *  control only adds something to look past. */
const CONTROLS_THRESHOLD = 8;

type View = "list" | "grid";

type DraftItem = {
  id: string;
  title: string;
  step: number;
  totalSteps: number;
  stepTitle: string;
};

/**
 * The remembered view, read as an external store rather than as state seeded in an
 * effect. The server has no `localStorage`, so the choice cannot be known during the
 * first render; `useSyncExternalStore` renders the server snapshot through hydration and
 * swaps to the stored one immediately after, which an effect-and-setState pair only
 * imitates at the cost of a second render pass.
 */
let cachedView: View | null = null;
const viewListeners = new Set<() => void>();

function subscribeView(onChange: () => void) {
  viewListeners.add(onChange);
  return () => viewListeners.delete(onChange);
}

function getStoredView(): View {
  if (cachedView === null) {
    cachedView = window.localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  }
  return cachedView;
}

function getServerView(): View {
  return "list";
}

function storeView(next: View) {
  cachedView = next;
  window.localStorage.setItem(VIEW_KEY, next);
  viewListeners.forEach((listener) => listener());
}

const DOT: Record<string, string> = {
  APPROVED: "bg-emerald-500",
  PENDING_REVIEW: "bg-amber-500",
  REJECTED: "bg-rose-500",
  SUSPENDED: "bg-rose-500",
  UNPUBLISHED: "bg-slate-400",
  DRAFT: "bg-slate-400",
  ARCHIVED: "bg-slate-300",
};

/** Statuses that mean something went wrong, and so are worth a filled badge rather than
 *  a dot. `Approved` is the ordinary case and should never shout. */
const LOUD = new Set(["REJECTED", "SUSPENDED"]);

export function ListingOverview({
  listings,
  drafts,
  statusLabels,
}: {
  listings: HostListingOverviewItem[];
  drafts: DraftItem[];
  /** Resolved on the server, where the full catalog lives, and passed down so the row
   *  does not re-resolve the same seven strings for every listing. */
  statusLabels: Record<string, string>;
}) {
  const { resolve } = useI18n();
  const label = useListingStateLabel();
  const view = useSyncExternalStore(subscribeView, getStoredView, getServerView);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Archiving is how a host gets a listing out of the way, so an archived row sitting in
  // the main list would undo the only thing the action is for. They stay one click away
  // rather than behind a tab, which would otherwise be a permanent two-tab header for
  // hosts who have never archived anything.
  const archived = listings.filter((listing) => listing.status === "ARCHIVED");
  const active = listings.filter((listing) => listing.status !== "ARCHIVED");
  const shown = showArchived ? [...active, ...archived] : active;

  const showSearch = active.length + drafts.length > CONTROLS_THRESHOLD;
  const needle = query.trim().toLocaleLowerCase();
  const searching = showSearch && needle.length > 0;
  const visible = searching
    ? shown.filter((listing) =>
        `${listing.title} ${listing.city}`.toLocaleLowerCase().includes(needle)
      )
    : shown;
  const visibleDrafts = searching
    ? drafts.filter((draft) => draft.title.toLocaleLowerCase().includes(needle))
    : drafts;

  const searchLabel = resolve("host.v2.listings.search", "Search your listings").text;

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* The visible title is gone — the header already says Listings, and repeating it
          costs the first screenful of a page whose whole job is the rows. It stays for a
          screen reader, which has no equivalent of "look at the underlined nav item". */}
      <h1 className="sr-only">
        <Tx k="host.v2.listings.heading" source="Your listings" />
      </h1>

      <div className="flex items-center gap-3 py-4">
        {showSearch ? (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
            className="h-10 w-full max-w-sm rounded-full border border-slate-200 px-4 text-sm outline-none transition-colors placeholder:text-slate-400 focus-visible:border-[#0f172a]"
          />
        ) : (
          <span className="flex-1" />
        )}
        <div className="ml-auto flex items-center gap-1">
          <ViewButton
            active={view === "list"}
            onClick={() => storeView("list")}
            label={resolve("host.v2.listings.view_list", "List view").text}
          >
            <List className="size-5" aria-hidden />
          </ViewButton>
          <ViewButton
            active={view === "grid"}
            onClick={() => storeView("grid")}
            label={resolve("host.v2.listings.view_grid", "Grid view").text}
          >
            <LayoutGrid className="size-5" aria-hidden />
          </ViewButton>
          <span className="mx-2 h-5 w-px bg-slate-200" aria-hidden />
          {/* Two ways to start, both reachable from the row of controls that is present
              in every view — see add-listing-menu.tsx. */}
          <AddListingMenu />
        </div>
      </div>

      {listings.length === 0 && drafts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          {view === "list" ? (
            // White, with hairlines between rows rather than a tinted block. A grey panel
            // behind grey photo placeholders reads as one muddy mass, and it spends the
            // page's only tint on the rows, leaving nothing for hover to say.
            <div className="divide-y divide-slate-100 border-y border-slate-100">
              {visible.length === 0 && visibleDrafts.length === 0 ? (
                <p className="px-2 py-12 text-center text-sm text-slate-500">
                  <Tx
                    k="host.v2.listings.no_matches"
                    source="No listings match your search."
                  />
                </p>
              ) : (
                <>
                  {visibleDrafts.map((draft) => (
                    <DraftRow key={draft.id} draft={draft} />
                  ))}
                  {visible.map((listing) => (
                    <ListingRow
                      key={listing.id}
                      listing={listing}
                      state={resolveListingState(listing)}
                      label={label}
                      statusLabel={statusLabels[listing.status] ?? listing.status}
                    />
                  ))}
                </>
              )}
            </div>
          ) : (
            visible.length === 0 ? (
              // The list view has always had this line; the grid rendered an empty block
              // instead, so a search with no hits looked like a broken page. A host whose
              // only work in progress is a draft gets told where drafts live rather than
              // that nothing matched a search they did not run.
              <p className="px-2 py-12 text-center text-sm text-slate-500">
                {searching ? (
                  <Tx
                    k="host.v2.listings.no_matches"
                    source="No listings match your search."
                  />
                ) : (
                  <Tx
                    k="host.v2.listings.drafts_in_list"
                    source="Your unfinished drafts appear in list view."
                  />
                )}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((listing) => (
                  <ListingTile
                    key={listing.id}
                    listing={listing}
                    state={resolveListingState(listing)}
                    label={label}
                    statusLabel={statusLabels[listing.status] ?? listing.status}
                  />
                ))}
              </div>
            )
          )}

          {archived.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((current) => !current)}
              className="rounded-full px-1 text-sm font-medium text-slate-500 underline-offset-4 transition-colors hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
            >
              {
                interpolate(
                  showArchived
                    ? resolve("host.v2.listings.hide_archived", "Hide archived listings")
                    : resolve(
                        "host.v2.listings.show_archived",
                        "Show {count} archived listings"
                      ),
                  { count: archived.length }
                ).text
              }
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`grid size-9 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a] ${
        active ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function StatusMark({ status, label }: { status: string; label: string }) {
  if (LOUD.has(status)) {
    return (
      <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
        {label}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span
        className={`size-[7px] rounded-full ${DOT[status] ?? "bg-slate-400"}`}
        aria-hidden
      />
      <span className="text-sm text-slate-600">{label}</span>
    </span>
  );
}

function CalendarButton({ listingId, title }: { listingId: string; title: string }) {
  const { resolve } = useI18n();
  const label = interpolate(
    resolve("host.v2.listings.calendar_for", "Dates and prices for {title}"),
    { title }
  ).text;
  return (
    <Link
      // The listing travels as a query parameter rather than a route segment: the
      // calendar is one workspace over every property, and a path per listing would
      // make it look like a different page each time. An id the payload does not
      // contain is ignored there, so a stale link opens the default property.
      href={`/host/calendar?listing=${encodeURIComponent(listingId)}`}
      aria-label={label}
      title={label}
      onClick={(event) => event.stopPropagation()}
      className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
    >
      <CalendarDays className="size-4" aria-hidden />
    </Link>
  );
}

function Thumb({ url, className }: { url: string | null; className: string }) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-slate-100 ${className}`}
    >
      {url ? (
        <Image src={url} alt="" fill sizes="96px" className="object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-slate-300">
          <ImageIcon className="size-5" aria-hidden />
        </div>
      )}
    </div>
  );
}

function ListingRow({
  listing,
  state,
  label,
  statusLabel,
}: {
  listing: HostListingOverviewItem;
  state: ListingState;
  label: ReturnType<typeof useListingStateLabel>;
  statusLabel: string;
}) {
  const line = label(state);
  // The moderator's own words replace the state line when the state was only going to
  // say "rejected — open the listing to see why". A rejected listing whose calendar is
  // also broken keeps its sync line and gains the note below it, so neither fact hides
  // the other.
  const blocked = isModerationBlocked(listing.status);
  const restatesBlock = state.code === "REJECTED" || state.code === "SUSPENDED";
  return (
    <div
      className={`group relative flex min-h-20 gap-4 rounded-xl px-3 transition-colors hover:bg-slate-50 ${
        blocked ? "items-start py-1" : "items-center"
      }`}
    >
      <Thumb
        url={listing.imageUrl}
        className={`h-14 w-20 ${blocked ? "mt-4" : ""}`}
      />
      <div className="min-w-0 flex-1 py-3">
        {/* The link spans the row via `after:absolute`, so the whole row opens the editor
            while the controls stacked above it keep their own hit areas. */}
        <Link
          href={`/host/listings/${listing.id}`}
          className="after:absolute after:inset-0 focus-visible:outline-none"
        >
          <span
            className="block truncate font-medium text-slate-900"
            data-user-generated-content
            translate="yes"
          >
            {listing.title}
          </span>
        </Link>
        {blocked && restatesBlock ? null : (
          <span
            className={`mt-0.5 block truncate text-sm ${line.className}`}
            translate={line.translated ? "no" : undefined}
          >
            {line.text}
          </span>
        )}
        {blocked && (
          <ListingModerationNotice
            status={listing.status}
            note={listing.moderationNote}
          />
        )}
      </div>

      {/* `relative z-10`, like every other control in this row: the row's link covers
          the whole row with an `after:absolute` overlay, and an unpositioned control
          sits underneath it — so clicking the switch opened the editor instead of
          listing or unlisting. */}
      <div className="relative z-10 hidden sm:block">
        {isVisibilitySwitchable(listing.status) ? (
          <ListingVisibilitySwitch
            listingId={listing.id}
            title={listing.title}
            status={listing.status}
          />
        ) : (
          <StatusMark status={listing.status} label={statusLabel} />
        )}
      </div>

      {/* Dates and prices is the job a host comes back to weekly, so it stays visible
          rather than joining the archive-and-delete menu. */}
      <CalendarButton listingId={listing.id} title={listing.title} />
      <ListingActionsMenu
        listingId={listing.id}
        slug={listing.slug}
        title={listing.title}
        status={listing.status}
      />
    </div>
  );
}

function DraftRow({ draft }: { draft: DraftItem }) {
  const { resolve } = useI18n();
  const line = interpolate(
    resolve(
      "host.v2.listings.state.draft_step",
      "Stopped at step {step} of {total} — {title}"
    ),
    { step: draft.step, total: draft.totalSteps, title: draft.stepTitle }
  );
  return (
    <div className="group relative flex min-h-20 items-center gap-4 rounded-xl px-3 transition-colors hover:bg-slate-50">
      <div className="grid h-14 w-20 shrink-0 place-items-center rounded-xl border border-dashed border-slate-200 text-slate-300">
        <ImageIcon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 py-3">
        <Link
          href={`/host/start/resume?draft=${encodeURIComponent(draft.id)}`}
          className="after:absolute after:inset-0 focus-visible:outline-none"
        >
          <span className="block truncate font-medium text-slate-900">{draft.title}</span>
        </Link>
        <span
          className="mt-0.5 block truncate text-sm text-slate-500"
          translate={line.translated ? "no" : undefined}
        >
          {line.text}
        </span>
      </div>
      <div className="hidden sm:block">
        <StatusMark
          status="DRAFT"
          label={resolve("host.listings.draft_badge", "Draft").text}
        />
      </div>
      <DeleteDraftControl draftId={draft.id} title={draft.title} />
    </div>
  );
}

function ListingTile({
  listing,
  state,
  label,
  statusLabel,
}: {
  listing: HostListingOverviewItem;
  state: ListingState;
  label: ReturnType<typeof useListingStateLabel>;
  statusLabel: string;
}) {
  const line = label(state);
  const flagged = isActionableState(state);
  return (
    <div className="group relative">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-slate-300">
            <ImageIcon className="size-6" aria-hidden />
          </div>
        )}
        <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow-sm">
          <span
            className={`size-[7px] rounded-full ${DOT[listing.status] ?? "bg-slate-400"}`}
            aria-hidden
          />
          <span className="text-xs font-medium text-slate-800">{statusLabel}</span>
        </span>
        {/* The whole reason the grid is safe to use: a problem stays visible here rather
            than living only in the list view's sentence. */}
        {flagged && (
          <span
            className={`absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium shadow-sm ${line.className}`}
            title={line.text}
            translate={line.translated ? "no" : undefined}
          >
            {line.short}
          </span>
        )}
        <ListingActionsMenu
          listingId={listing.id}
          slug={listing.slug}
          title={listing.title}
          status={listing.status}
          className="absolute right-2 top-2 bg-white/95 opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        />
      </div>
      <Link
        href={`/host/listings/${listing.id}`}
        className="mt-3 block after:absolute after:inset-x-0 after:bottom-0 after:top-0 focus-visible:outline-none"
      >
        <span
          className="block truncate font-medium text-slate-900"
          data-user-generated-content
          translate="yes"
        >
          {listing.title}
        </span>
        <span className="mt-0.5 block truncate text-sm text-slate-500" translate="yes">
          {listing.city}
        </span>
      </Link>
      {/* Clamped to two lines with the full text on hover: the tile is a photo card, and
          a paragraph under it would push the next row of the grid out of alignment. The
          tile's overlay link still covers this, so a click anywhere opens the editor —
          which is where the host fixes what the note is complaining about. */}
      <ListingModerationNotice
        status={listing.status}
        note={listing.moderationNote}
        compact
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-100 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-slate-900">
        <Tx k="host.v2.listings.empty_title" source="Start your first listing" />
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
        <Tx
          k="host.v2.listings.empty_copy"
          source="Add your home and we'll walk you through photos, prices, and the dates you want to host."
        />
      </p>
      <AddListingActions />
    </div>
  );
}
