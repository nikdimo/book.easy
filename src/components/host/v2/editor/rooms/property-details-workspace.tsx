"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bath, Bed, BedDouble, Check, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EDITOR_GROUP_DIVIDER,
  EDITOR_GROUP_HEADING,
} from "@/components/host/v2/editor/editor-group";
import { beginSave, endSave } from "@/components/host/v2/editor/save-state";
import { AddRoomDialog } from "@/components/host/v2/editor/photos/add-room-dialog";
import { SelectField } from "@/components/shared/select-field";
import { SpaceIcon } from "@/components/shared/space-icon";
import { updateListingPropertyDetails } from "@/lib/actions/listing-property-details.actions";
import { addListingRoom, deleteListingRoom, renameListingRoom } from "@/lib/actions/listing-photos.actions";
import { allowedListingSpaceTypes } from "@/lib/types/listing-space-type";
import { BATHROOMS_MAX, BEDROOMS_MAX, BEDS_MAX, listingPropertyDetailsIssues, type ListingPropertyDetailsInput } from "@/lib/host/v2/listing-property-details";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";

const SAVE_DELAY = 600;

/** One of the two types the editor counts with a stepper, as the server resolved it. */
interface CountedType {
  id: string;
  isRepeatable: boolean;
}

/** A queued room mutation. Adds and deletes go through one worker in the order the host
 *  pressed them, because four quick taps on plus have to become four bedrooms. */
type RoomOp =
  | { kind: "add"; roomTypeId: string }
  /** `note` is said only once the server has actually done it. */
  | { kind: "delete"; roomId: string; note?: string };

/** Which room is being renamed, and what the host has typed so far. */
interface RenameState {
  id: string;
  draft: string;
}

function same(a: ListingPropertyDetailsInput, b: ListingPropertyDetailsInput) {
  return a.propertyType === b.propertyType && a.spaceType === b.spaceType && a.bedrooms === b.bedrooms && a.beds === b.beds && a.bathrooms === b.bathrooms;
}

export function PropertyDetailsWorkspace({ listingId, stored, propertyTypes, rooms, roomTypes, countedTypes }: {
  listingId: string;
  stored: ListingPropertyDetailsInput;
  propertyTypes: PropertyTypeOption[];
  rooms: ListingRoomSummary[];
  roomTypes: CatalogRoomType[];
  countedTypes: { bedroom: CountedType | null; bathroom: CountedType | null };
}) {
  const router = useRouter();
  const { resolve } = useI18n();
  const [value, setValue] = useState(stored);
  const [roomDialog, setRoomDialog] = useState(false);
  const confirmed = useRef(stored);
  const queued = useRef<ListingPropertyDetailsInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const issues = listingPropertyDetailsIssues(value);

  const flush = useCallback(async () => {
    if (saving.current) return;
    // Bedrooms and bathrooms are not edited here — they are how many rooms of each type
    // the listing has, and the server rewrites them on every add and delete. Stamping
    // the server's current numbers onto the payload stops a property-type edit made
    // after a room was added from carrying the pre-add count back with it.
    const next = queued.current && { ...queued.current, bedrooms: stored.bedrooms, bathrooms: stored.bathrooms };
    if (!next || same(next, confirmed.current) || Object.keys(listingPropertyDetailsIssues(next)).length) return;
    queued.current = null;
    saving.current = true;
    beginSave();
    try {
      const result = await updateListingPropertyDetails(listingId, next);
      if (result.error || result.issues || !result.stored) {
        endSave(true);
        if (mounted.current) {
          toast.error(
            result.error ??
              resolve(
                "host.editor.property_details.save_failed",
                "Those details couldn't be saved.",
              ).text,
          );
        }
      } else {
        confirmed.current = result.stored;
        endSave();
      }
    } catch {
      endSave(true);
      if (mounted.current) {
        toast.error(
          resolve(
            "host.editor.property_details.save_error",
            "We couldn't save that. Check your connection and try again.",
          ).text,
        );
      }
    } finally {
      saving.current = false;
      if (queued.current && !same(queued.current, confirmed.current)) void flushRef.current();
    }
  }, [listingId, resolve, stored.bathrooms, stored.bedrooms]);
  useEffect(() => { flushRef.current = flush; }, [flush]);
  useEffect(() => () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); void flushRef.current(); }, []);

  const change = useCallback((next: ListingPropertyDetailsInput, immediate = false) => {
    setValue(next); queued.current = next;
    if (timer.current) clearTimeout(timer.current);
    if (immediate) void flushRef.current();
    else timer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY);
  }, []);
  const spaceTypes = useMemo(() => allowedListingSpaceTypes(value.propertyType, value.spaceType), [value.propertyType, value.spaceType]);

  // ─── Rooms ──────────────────────────────────────────────────────────────────
  // The room rows are the truth. The bedroom and bathroom numbers above them are how
  // many rows there are, so the stepper and the trash can cannot end up telling the
  // host two different things about the same listing.

  const queue = useRef<RoomOp[]>([]);
  const running = useRef(false);
  const awaitingRefresh = useRef(false);
  /** Rooms the host has asked for but the server has not created yet, per type. */
  const [pendingAdds, setPendingAdds] = useState<Record<string, number>>({});
  /** Rooms already on their way out, hidden from the list while the delete lands. */
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set<string>());
  const [confirmDelete, setConfirmDelete] = useState<ListingRoomSummary | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);

  // Fresh server data has landed: whatever the host was shown optimistically is now
  // either real or was rejected, and either way the rows below are the answer.
  useEffect(() => {
    if (!awaitingRefresh.current || running.current || queue.current.length > 0) return;
    awaitingRefresh.current = false;
    setPendingAdds({});
    setRemoving(new Set<string>());
  }, [rooms]);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    beginSave();
    let failed = false;
    try {
      for (let op = queue.current.shift(); op; op = queue.current.shift()) {
        const result = op.kind === "add"
          ? await addListingRoom(listingId, op.roomTypeId)
          : await deleteListingRoom(listingId, op.roomId);
        if (result.error) {
          failed = true;
          toast.error(result.error);
          break;
        }
        if (op.kind === "delete" && op.note) toast.success(op.note);
      }
    } catch {
      failed = true;
      toast.error("We couldn't update that room.");
    } finally {
      // Anything still queued was sitting behind a failure. Dropping it and re-reading
      // the server beats replaying onto a state we no longer know.
      queue.current = [];
      running.current = false;
      awaitingRefresh.current = true;
      endSave(failed);
      if (failed) {
        // Put the rows back now rather than waiting on a refresh that may return the
        // same data it already had — a failed delete leaves the list unchanged.
        setPendingAdds({});
        setRemoving(new Set<string>());
      }
      router.refresh();
    }
  }, [listingId, router]);

  const enqueue = useCallback((op: RoomOp) => {
    queue.current.push(op);
    void pump();
  }, [pump]);

  const visibleRooms = useMemo(
    () => rooms.filter((room) => !removing.has(room.id)),
    [removing, rooms],
  );
  const roomsOfType = useCallback(
    (roomTypeId: string) =>
      visibleRooms
        .filter((room) => room.roomTypeId === roomTypeId)
        .sort((a, b) => a.ordinal - b.ordinal),
    [visibleRooms],
  );

  const addRoomOfType = useCallback((roomTypeId: string) => {
    setPendingAdds((current) => ({ ...current, [roomTypeId]: (current[roomTypeId] ?? 0) + 1 }));
    enqueue({ kind: "add", roomTypeId });
  }, [enqueue]);

  const removeRoom = useCallback((room: ListingRoomSummary) => {
    setRemoving((current) => new Set(current).add(room.id));
    enqueue({
      kind: "delete",
      roomId: room.id,
      // Where the photos went is worth saying, but only once it is true.
      note: room.photoCount > 0
        ? interpolate(
            resolve("host.editor.rooms.removed_with_photos", "{room} removed. {count} photos are now unassigned in Photos."),
            { room: room.name, count: room.photoCount },
          ).text
        : undefined,
    });
  }, [enqueue, resolve]);

  const askToRemove = useCallback((room: ListingRoomSummary) => {
    // An empty room costs one tap of plus to bring back, so it goes without a question.
    // A room holding photos does not: the photos survive, but the host should hear that
    // from us before they go looking for them.
    if (room.photoCount > 0) setConfirmDelete(room);
    else removeRoom(room);
  }, [removeRoom]);

  /** Minus takes the last room of the type — cancelling a queued add first, so a host who
   *  overshoots by one tap gets that tap back instead of losing a room they meant to keep. */
  const removeLastOfType = useCallback((roomTypeId: string) => {
    const queuedAdd = queue.current.findIndex(
      (op) => op.kind === "add" && op.roomTypeId === roomTypeId,
    );
    if (queuedAdd >= 0) {
      queue.current.splice(queuedAdd, 1);
      setPendingAdds((current) => ({ ...current, [roomTypeId]: Math.max(0, (current[roomTypeId] ?? 0) - 1) }));
      return;
    }
    const list = roomsOfType(roomTypeId);
    const last = list[list.length - 1];
    if (last) askToRemove(last);
  }, [askToRemove, roomsOfType]);

  const submitRename = useCallback((room: ListingRoomSummary, draft: string) => {
    setRenaming(null);
    if (draft.trim() === room.name.trim()) return;
    void (async () => {
      beginSave();
      try {
        const result = await renameListingRoom(listingId, room.id, draft);
        if (result.error) { endSave(true); toast.error(result.error); return; }
        endSave();
        awaitingRefresh.current = true;
        router.refresh();
      } catch {
        endSave(true);
        toast.error("We couldn't rename that room.");
      }
    })();
  }, [listingId, router]);

  const bedroom = countedTypes.bedroom;
  const bathroom = countedTypes.bathroom;
  const countedIds = useMemo(
    () => new Set([bedroom?.id, bathroom?.id].filter((id): id is string => Boolean(id))),
    [bathroom?.id, bedroom?.id],
  );
  const otherRooms = visibleRooms.filter((room) => !countedIds.has(room.roomTypeId));

  const groupProps = {
    renaming,
    onStartRename: setRenaming,
    onCancelRename: () => setRenaming(null),
    onSubmitRename: submitRename,
    onDeleteRoom: askToRemove,
  };

  return (
    <div className="mx-auto w-full max-w-2xl py-6 pb-16 md:py-10">
      {/* The rail, the browser tab and — on a phone — the filled chip all name this
          section already. Kept for the document outline and for screen readers, which
          have no rail to read. */}
      <header className="sr-only"><h1><Tx k="host.editor.rooms.heading" source="Property details" /></h1></header>

      <section aria-labelledby="property-kind-heading">
        <h2 id="property-kind-heading" className={EDITOR_GROUP_HEADING}><Tx k="host.editor.rooms.property_type" source="Property type" /></h2>
        {/* The application Select, not a native one: the menu is ours on every platform
            rather than the OS drawing its own list in its own font. The trigger keeps
            this screen's field shape — the same rounded-xl slate box the space-type
            buttons below it use. */}
        <SelectField
          ariaLabel={resolve("host.editor.rooms.property_type", "Property type").text}
          value={value.propertyType}
          onValueChange={(propertyType) => change({ ...value, propertyType }, true)}
          options={propertyTypes.map((type) => ({ value: type.value, label: type.label }))}
          invalid={Boolean(issues.propertyType)}
          className="mt-2 min-h-12 rounded-xl border-slate-200 bg-slate-50 px-4 text-base shadow-none data-[size=default]:h-auto md:data-[size=default]:h-auto"
        />
        {issues.propertyType && <p role="alert" className="mt-1 text-sm text-rose-600"><Tx k="host.editor.rooms.property_type_error" source="Choose a property type." /></p>}
      </section>

      <section className={EDITOR_GROUP_DIVIDER} aria-labelledby="space-type-heading">
        <h2 id="space-type-heading" className={EDITOR_GROUP_HEADING}><Tx k="host.editor.rooms.space_type" source="What guests book" /></h2>
        <div role="radiogroup" aria-labelledby="space-type-heading" className="mt-2 grid gap-2 sm:grid-cols-2">
          {spaceTypes.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value.spaceType === option.value} onClick={() => change({ ...value, spaceType: option.value }, true)} className={cn("min-h-14 rounded-xl bg-slate-50 px-4 text-left text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400", value.spaceType === option.value && "bg-slate-900 text-white hover:bg-slate-800")}>{option.label}</button>)}
        </div>
      </section>

      <section className={EDITOR_GROUP_DIVIDER} aria-labelledby="rooms-heading">
        <h2 id="rooms-heading" className={EDITOR_GROUP_HEADING}><Tx k="host.editor.rooms.spaces" source="Rooms and spaces" /></h2>
        <p className="mt-1 text-sm text-slate-500"><Tx k="host.editor.rooms.spaces_help" source="These are the rooms you sort photos into. Adding one here adds it in Photos too." /></p>

        <div className="mt-3 divide-y divide-slate-200">
          <CountedGroup
            {...groupProps}
            icon={BedDouble}
            label={resolve("host.editor.rooms.bedrooms", "Bedrooms").text}
            type={bedroom}
            max={BEDROOMS_MAX}
            rooms={bedroom ? roomsOfType(bedroom.id) : []}
            pending={bedroom ? pendingAdds[bedroom.id] ?? 0 : 0}
            fallbackCount={stored.bedrooms}
            onAdd={addRoomOfType}
            onRemoveLast={removeLastOfType}
          />
          <CountedGroup
            {...groupProps}
            icon={Bath}
            label={resolve("host.editor.rooms.bathrooms", "Bathrooms").text}
            type={bathroom}
            max={BATHROOMS_MAX}
            rooms={bathroom ? roomsOfType(bathroom.id) : []}
            pending={bathroom ? pendingAdds[bathroom.id] ?? 0 : 0}
            fallbackCount={stored.bathrooms}
            onAdd={addRoomOfType}
            onRemoveLast={removeLastOfType}
          />

          {/* Beds are not a room — nothing in the taxonomy models one — so this stays a
              plain number on the listing rather than pretending to be a row count. */}
          <div className="flex min-h-16 items-center gap-3 py-2">
            <Bed className="size-5 text-slate-400" aria-hidden />
            <span className="flex-1 text-sm text-slate-700">
              {resolve("host.editor.rooms.beds", "Beds").text}
              <span className="ml-1.5 text-xs text-slate-400">{resolve("host.editor.rooms.beds_hint", "across every room").text}</span>
            </span>
            <StepperButtons
              label={resolve("host.editor.rooms.beds", "Beds").text}
              value={value.beds}
              max={BEDS_MAX}
              onDecrement={() => change({ ...value, beds: value.beds - 1 })}
              onIncrement={() => change({ ...value, beds: value.beds + 1 })}
            />
          </div>
        </div>
      </section>

      <section className={EDITOR_GROUP_DIVIDER} aria-labelledby="other-spaces-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="other-spaces-heading" className={EDITOR_GROUP_HEADING}><Tx k="host.editor.rooms.other_spaces" source="Other spaces" /></h2>
          <button
            type="button"
            onClick={() => setRoomDialog(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-4 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <Plus className="size-4" aria-hidden />
            <Tx k="host.editor.rooms.add" source="Add space" />
          </button>
        </div>
        {otherRooms.length ? (
          <ul className="mt-2 divide-y divide-slate-200">
            {otherRooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                renaming={renaming?.id === room.id ? renaming : null}
                onStartRename={() => setRenaming({ id: room.id, draft: room.name })}
                onDraft={(draft) => setRenaming({ id: room.id, draft })}
                onSubmitRename={(draft) => submitRename(room, draft)}
                onCancelRename={() => setRenaming(null)}
                onDelete={() => askToRemove(room)}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
            <Tx k="host.editor.rooms.empty_spaces" source="A kitchen, a balcony, a terrace — add the spaces you have photos of." />
          </p>
        )}
      </section>

      <AddRoomDialog open={roomDialog} onOpenChange={setRoomDialog} roomTypes={roomTypes} rooms={rooms} onAdd={(type) => { setRoomDialog(false); addRoomOfType(type.id); }} />

      <Dialog open={confirmDelete !== null} onOpenChange={(next) => { if (!next) setConfirmDelete(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {interpolate(resolve("host.editor.rooms.delete_title", "Remove {room}?"), { room: confirmDelete?.name ?? "" }).text}
            </DialogTitle>
            <DialogDescription>
              {interpolate(
                resolve("host.editor.rooms.delete_body", "Its {count} photos stay in Photos as unassigned, so nothing is lost — you can sort them into another room."),
                { count: confirmDelete?.photoCount ?? 0 },
              ).text}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setConfirmDelete(null)} className="min-h-11 rounded-full px-4 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400">
              {resolve("host.editor.rooms.delete_cancel", "Keep it").text}
            </button>
            <button
              type="button"
              onClick={() => { const room = confirmDelete; setConfirmDelete(null); if (room) removeRoom(room); }}
              className="min-h-11 rounded-full bg-rose-600 px-4 text-sm font-medium text-white outline-none transition hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              {resolve("host.editor.rooms.delete_confirm", "Remove room").text}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A stepper whose number is the length of the list beneath it. */
function CountedGroup({ icon: Icon, label, type, max, rooms, pending, fallbackCount, onAdd, onRemoveLast, onDeleteRoom, renaming, onStartRename, onCancelRename, onSubmitRename }: {
  icon: typeof Bed;
  label: string;
  type: CountedType | null;
  max: number;
  rooms: ListingRoomSummary[];
  pending: number;
  /** What `Listing.bedrooms` says — shown only when the taxonomy has no type to count. */
  fallbackCount: number;
  onAdd: (roomTypeId: string) => void;
  onRemoveLast: (roomTypeId: string) => void;
  onDeleteRoom: (room: ListingRoomSummary) => void;
  renaming: RenameState | null;
  onStartRename: (state: RenameState) => void;
  onCancelRename: () => void;
  onSubmitRename: (room: ListingRoomSummary, draft: string) => void;
}) {
  const { resolve } = useI18n();
  const count = type ? rooms.length + pending : fallbackCount;
  // An admin can mark a type non-repeatable, and `addListingRoom` refuses the second one.
  // Capping the stepper here means plus goes quiet instead of erroring on every press.
  const ceiling = type ? (type.isRepeatable ? max : 1) : max;

  return (
    <div className="py-2">
      <div className="flex min-h-16 items-center gap-3">
        <Icon className="size-5 text-slate-400" aria-hidden />
        <span className="flex-1 text-sm text-slate-700">{label}</span>
        <StepperButtons
          label={label}
          value={count}
          max={ceiling}
          disabled={!type}
          onDecrement={() => { if (type) onRemoveLast(type.id); }}
          onIncrement={() => { if (type) onAdd(type.id); }}
        />
      </div>

      {type && (rooms.length > 0 || pending > 0) && (
        <ul className="ml-8 divide-y divide-slate-100 border-t border-slate-100">
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              compact
              renaming={renaming?.id === room.id ? renaming : null}
              onStartRename={() => onStartRename({ id: room.id, draft: room.name })}
              onDraft={(draft) => onStartRename({ id: room.id, draft })}
              onSubmitRename={(draft) => onSubmitRename(room, draft)}
              onCancelRename={onCancelRename}
              onDelete={() => onDeleteRoom(room)}
            />
          ))}
          {Array.from({ length: pending }, (_, index) => (
            <li key={`pending-${index}`} className="min-h-14 py-2 text-sm text-slate-400">
              {resolve("host.editor.rooms.adding", "Adding…").text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoomRow({ room, compact = false, renaming, onStartRename, onDraft, onSubmitRename, onCancelRename, onDelete }: {
  room: ListingRoomSummary;
  compact?: boolean;
  renaming: RenameState | null;
  onStartRename: () => void;
  onDraft: (draft: string) => void;
  onSubmitRename: (draft: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
}) {
  const { resolve } = useI18n();
  const photos = room.photoCount === 0
    ? resolve("host.editor.rooms.no_photos", "No photos yet").text
    : interpolate(resolve("host.editor.rooms.photo_count", "{count} photos"), { count: room.photoCount }).text;

  if (renaming) {
    return (
      <li className="flex min-h-14 items-center gap-2 py-2">
        {!compact && <SpaceIcon name={room.icon} className="size-5 shrink-0 text-slate-400" />}
        <input
          autoFocus
          value={renaming.draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmitRename(renaming.draft);
            if (event.key === "Escape") onCancelRename();
          }}
          aria-label={resolve("host.editor.rooms.rename_label", "Room name").text}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        />
        <button type="button" onClick={() => onSubmitRename(renaming.draft)} aria-label={resolve("host.editor.rooms.rename_save", "Save name").text} className="grid size-11 shrink-0 place-items-center rounded-full text-slate-500 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400"><Check className="size-4" aria-hidden /></button>
        <button type="button" onClick={onCancelRename} aria-label={resolve("host.editor.rooms.rename_cancel", "Cancel").text} className="grid size-11 shrink-0 place-items-center rounded-full text-slate-400 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400"><X className="size-4" aria-hidden /></button>
      </li>
    );
  }

  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      {!compact && <SpaceIcon name={room.icon} className="size-5 shrink-0 text-slate-400" />}
      <button
        type="button"
        onClick={onStartRename}
        className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <span className="flex items-center gap-1.5 text-sm text-slate-700">
          <span className="truncate" translate={room.translated ? "no" : undefined}>{room.name}</span>
          <Pencil className="size-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" aria-hidden />
        </span>
        <span className="truncate text-xs text-slate-400">{photos}</span>
      </button>
      <button
        type="button"
        aria-label={interpolate(resolve("host.editor.rooms.delete_room", "Remove {room}"), { room: room.name }).text}
        onClick={onDelete}
        className="grid size-11 shrink-0 place-items-center rounded-full text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
}

function StepperButtons({ label, value, max, disabled = false, onDecrement, onIncrement }: {
  label: string;
  value: number;
  max: number;
  disabled?: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const { resolve } = useI18n();
  const thing = label.toLocaleLowerCase();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={interpolate(resolve("host.editor.rooms.one_fewer", "One {thing} fewer"), { thing }).text}
        disabled={disabled || value <= 0}
        onClick={onDecrement}
        className="grid size-11 place-items-center rounded-full bg-slate-100 outline-none transition hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-35"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <output aria-label={`${label}: ${value}`} className="w-8 text-center text-base tabular-nums">{value}</output>
      <button
        type="button"
        aria-label={interpolate(resolve("host.editor.rooms.one_more", "One {thing} more"), { thing }).text}
        disabled={disabled || value >= max}
        onClick={onIncrement}
        className="grid size-11 place-items-center rounded-full bg-slate-100 outline-none transition hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-35"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
