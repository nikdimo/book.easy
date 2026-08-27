"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ImagePlus, LayoutGrid, Loader2, Plus, Rows3, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import { EditorSideRailHeading } from "@/components/host/v2/editor/editor-side-rail";
import { withSaveState } from "@/components/host/v2/editor/save-state";
import {
  addListingRoom,
  addListingPhotos,
  assignPhotosToRoom,
  deleteListingPhotos,
  deleteListingRoom,
  renameListingRoom,
  reorderListingPhotos,
  reorderRoomPhotos,
  setListingCoverPhoto,
  setRoomCoverPhoto,
} from "@/lib/actions/listing-photos.actions";
import { roomDisplayName } from "@/lib/rooms/room-name";
import type { EditorPhoto } from "@/lib/services/listing-editor.service";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import type { ListingMediaTypeValue } from "@/lib/types/listing-media";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { AddRoomDialog } from "./add-room-dialog";
import { GRID_CLASS, ROOM_GRID_CLASS, setDensity, useDensity, type Density } from "./density";
import { AddPhotoTile, PhotoTile, UploadTile } from "./photo-tile";
import { RoomsPanel } from "./rooms-panel";
import { SelectionBar } from "./selection-bar";
import { usePhotoUpload } from "./use-photo-upload";
import { RoomSection } from "./room-section";

type View = "all" | "rooms";
/** `undefined` means no filter, `null` means the unassigned bucket. */
type RoomFilter = string | null | undefined;

function eventCoordinates(event: Event): { x: number; y: number } | null {
  if (event instanceof MouseEvent || event instanceof PointerEvent) {
    return { x: event.clientX, y: event.clientY };
  }
  if (event instanceof TouchEvent) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return null;
}

/**
 * The Photos workspace.
 *
 * Local state is authoritative for the session: every action applies here first, then
 * goes to the server, and reverts with a toast if the server disagrees. There is no
 * `router.refresh()` in the happy path — refetching after each drag would repaint a
 * hundred thumbnails to confirm something the host already watched happen.
 */
export function PhotosWorkspace({
  listingId,
  photos: initialPhotos,
  rooms: initialRooms,
  roomTypes,
}: {
  listingId: string;
  photos: EditorPhoto[];
  rooms: ListingRoomSummary[];
  roomTypes: CatalogRoomType[];
}) {
  const i18n = useI18n();
  const { resolve } = i18n;
  const density = useDensity();

  const [photos, setPhotos] = useState(initialPhotos);
  const [rooms, setRooms] = useState(initialRooms);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View>("all");
  const [filter, setFilter] = useState<RoomFilter>(undefined);
  const [addingRoom, setAddingRoom] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragGrabPoint, setDragGrabPoint] = useState<{ x: number; y: number } | null>(null);
  const [pendingSuggestedDrops, setPendingSuggestedDrops] = useState<Map<string, number>>(
    () => new Map(),
  );
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = usePhotoUpload({
    onUploaded: async (item) => {
      await commitUpload(item);
    },
  });

  // ── Derived ────────────────────────────────────────────────────────────────

  const roomsWithCounts = useMemo(() => {
    const counts = new Map<string, EditorPhoto[]>();
    for (const photo of photos) {
      if (!photo.roomId) continue;
      const bucket = counts.get(photo.roomId);
      if (bucket) bucket.push(photo);
      else counts.set(photo.roomId, [photo]);
    }
    for (const bucket of counts.values()) bucket.sort((a, b) => a.roomOrder - b.roomOrder);
    return rooms.map((room) => {
      const inRoom = counts.get(room.id) ?? [];
      return { ...room, photoCount: inRoom.length, coverUrl: inRoom[0]?.url ?? null };
    });
  }, [photos, rooms]);

  const photosByRoom = useMemo(() => {
    const map = new Map<string, EditorPhoto[]>();
    for (const room of rooms) map.set(room.id, []);
    const unassigned: EditorPhoto[] = [];
    for (const photo of photos) {
      if (photo.roomId && map.has(photo.roomId)) map.get(photo.roomId)!.push(photo);
      else unassigned.push(photo);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.roomOrder - b.roomOrder);
    return { map, unassigned };
  }, [photos, rooms]);

  const unassignedCount = photosByRoom.unassigned.length;

  const visiblePhotos = useMemo(() => {
    if (filter === undefined) return photos;
    if (filter === null) return photos.filter((photo) => !photo.roomId);
    return photos.filter((photo) => photo.roomId === filter);
  }, [filter, photos]);

  /** Spaces the listing has none of, offered as zero-count drop targets. The rail keeps
   *  standard ones visible and folds uncommon ones into More spaces. */
  const suggestions = useMemo(() => {
    const owned = new Set(rooms.map((room) => room.roomTypeId));
    return roomTypes.filter((roomType) => !owned.has(roomType.id));
  }, [roomTypes, rooms]);

  /** Every not-yet-created type is a Move to destination, not just the small set shown
   * in the rail as standard suggested spaces. */
  const availableRoomTypes = useMemo(() => {
    const owned = new Set(rooms.map((room) => room.roomTypeId));
    return roomTypes.filter((roomType) => !owned.has(roomType.id));
  }, [roomTypes, rooms]);

  const roomNameById = useMemo(() => {
    const map = new Map<string, { name: string; translated: boolean }>();
    for (const room of roomsWithCounts) {
      map.set(room.id, { name: room.name, translated: room.translated });
    }
    return map;
  }, [roomsWithCounts]);

  // ── Server sync ────────────────────────────────────────────────────────────

  /**
   * Applies an optimistic change, then the matching server call, and puts the previous
   * state back if the server refuses. The snapshot is taken before the optimistic write,
   * so a revert restores exactly what the host was looking at.
   */
  const commit = useCallback(
    async (
      apply: () => void,
      call: () => Promise<{ error?: string } | undefined>,
      onDone?: (message: string | null) => void,
    ) => {
      const previousPhotos = photos;
      const previousRooms = rooms;
      apply();
      const result = await withSaveState(call);
      if (result?.error) {
        setPhotos(previousPhotos);
        setRooms(previousRooms);
        toast.error(result.error);
        return false;
      }
      onDone?.(null);
      return true;
    },
    [photos, rooms],
  );

  const commitUpload = useCallback(
    async (item: { url: string; mediaType: ListingMediaTypeValue }) => {
      const result = await withSaveState(() => addListingPhotos(listingId, [item]));
      if (result.error || !result.ids?.length) {
        toast.error(result.error ?? "That photo could not be saved.");
        return;
      }
      const id = result.ids[0];
      setPhotos((current) => [
        ...current,
        {
          id,
          url: item.url,
          mediaType: item.mediaType,
          alt: null,
          displayOrder: current.length,
          isPrimary: current.length === 0 && item.mediaType === "IMAGE",
          roomId: null,
          roomOrder: 0,
        },
      ]);
    },
    [listingId],
  );

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string, additive: boolean) => {
    setSelection((current) => {
      const next = new Set(additive ? current : current.has(id) ? current : current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  /** Acting on a photo that is not part of the selection acts on that photo alone —
   *  otherwise a menu opened on an unselected tile would silently move six others. */
  const targets = useCallback(
    (id: string) => (selection.has(id) ? [...selection] : [id]),
    [selection],
  );

  // ── Actions ────────────────────────────────────────────────────────────────

  const moveToRoom = useCallback(
    async (
      photoIds: string[],
      roomId: string | null,
      /** Passed when the room was created a moment ago and is not in the name map yet. */
      knownName?: string,
    ) => {
      if (photoIds.length === 0) return;
      const target = roomId ? (knownName ?? roomNameById.get(roomId)?.name) : null;
      const ids = new Set(photoIds);
      const maxOrder = roomId
        ? Math.max(-1, ...photos.filter((p) => p.roomId === roomId).map((p) => p.roomOrder))
        : -1;

      const ok = await commit(
        () =>
          setPhotos((current) => {
            let offset = 0;
            return current.map((photo) => {
              if (!ids.has(photo.id)) return photo;
              offset += 1;
              return { ...photo, roomId, roomOrder: roomId ? maxOrder + offset : 0 };
            });
          }),
        () => assignPhotosToRoom(listingId, photoIds, roomId),
      );

      if (ok) {
        clearSelection();
        toast.success(
          interpolate(
            resolve("host.editor.photos.moved", "{count} moved to {room}"),
            {
              count: photoIds.length,
              room:
                target ?? resolve("host.editor.photos.unassigned", "Other / Unassigned").text,
            },
          ).text,
        );
      }
    },
    [clearSelection, commit, listingId, photos, resolve, roomNameById],
  );

  const removePhotos = useCallback(
    async (photoIds: string[]) => {
      if (photoIds.length === 0) return;
      const ids = new Set(photoIds);
      const ok = await commit(
        () => setPhotos((current) => current.filter((photo) => !ids.has(photo.id))),
        () => deleteListingPhotos(listingId, photoIds),
      );
      if (ok) {
        clearSelection();
        toast.success(
          i18n.plural(
            "host.editor.photos.deleted",
            photoIds.length,
            "{n} photo deleted",
            "{n} photos deleted",
          ).text,
        );
      }
    },
    [clearSelection, commit, i18n, listingId],
  );

  const confirmDelete = useCallback(
    (photoIds: string[]) => {
      // Bulk deletion is the one place a plain toast is not enough: the count is the
      // whole risk, and an undo that has to re-upload files is not an undo.
      if (photoIds.length > 1) {
        const message = interpolate(
          resolve("host.editor.photos.confirm_delete", "Delete {count} photos?"),
          { count: photoIds.length },
        ).text;
        if (!window.confirm(message)) return;
      }
      void removePhotos(photoIds);
    },
    [removePhotos, resolve],
  );

  const makeListingCover = useCallback(
    async (photoId: string) => {
      const ok = await commit(
        () =>
          setPhotos((current) =>
            current.map((photo) => ({ ...photo, isPrimary: photo.id === photoId })),
          ),
        () => setListingCoverPhoto(listingId, photoId),
      );
      if (ok) {
        toast.success(resolve("host.editor.photos.cover_updated", "Cover photo updated").text);
      }
    },
    [commit, listingId, resolve],
  );

  const makeRoomCover = useCallback(
    async (photoId: string) => {
      const photo = photos.find((row) => row.id === photoId);
      if (!photo?.roomId) return;
      const roomId = photo.roomId;
      const ok = await commit(
        () =>
          setPhotos((current) => {
            const rest = current
              .filter((row) => row.roomId === roomId && row.id !== photoId)
              .sort((a, b) => a.roomOrder - b.roomOrder)
              .map((row, index) => [row.id, index + 1] as const);
            const orders = new Map(rest);
            return current.map((row) =>
              row.id === photoId
                ? { ...row, roomOrder: 0 }
                : orders.has(row.id)
                  ? { ...row, roomOrder: orders.get(row.id)! }
                  : row,
            );
          }),
        () => setRoomCoverPhoto(listingId, roomId, photoId),
      );
      if (ok) {
        toast.success(
          resolve("host.editor.photos.room_cover_updated", "Room cover updated").text,
        );
      }
    },
    [commit, listingId, photos, resolve],
  );

  /** Creates the room and hands the caller the new row, so a drop onto a suggested space
   *  can create it and move the photos in one gesture. */
  const createRoom = useCallback(
    async (
      roomType: CatalogRoomType,
      { announce = true }: { announce?: boolean } = {},
    ): Promise<ListingRoomSummary | null> => {
      setAddingRoom(false);
      const result = await withSaveState(() => addListingRoom(listingId, roomType.id));
      if (result.error || !result.roomId) {
        toast.error(result.error ?? "That room could not be added.");
        return null;
      }
      const sameType = rooms.filter((room) => room.roomTypeId === roomType.id);
      const ordinal = sameType.reduce((high, room) => Math.max(high, room.ordinal), 0) + 1;
      const created: ListingRoomSummary = {
        id: result.roomId,
        roomTypeId: roomType.id,
        roomTypeKey: roomType.key,
        name: roomDisplayName({
          displayName: null,
          typeLabel: roomType.label,
          ordinal,
          sameTypeCount: sameType.length + 1,
        }),
        translated: roomType.translated,
        icon: roomType.icon,
        ordinal,
        sortOrder: rooms.length,
        photoCount: 0,
        coverUrl: null,
      };
      // Adding the second room of a type renames the first one — "Bedroom" only becomes
      // "Bedroom 1" once there is a Bedroom 2 to tell it apart from.
      setRooms((current) => [
        ...current.map((room) =>
          room.roomTypeId === roomType.id && !room.name.match(/\s\d+$/)
            ? {
                ...room,
                name: roomDisplayName({
                  displayName: null,
                  typeLabel: roomType.label,
                  ordinal: room.ordinal,
                  sameTypeCount: sameType.length + 1,
                }),
              }
            : room,
        ),
        created,
      ]);
      // A drop says its own "6 moved to Bedroom", so the creation toast would be the
      // second notification for one gesture.
      if (announce) {
        toast.success(
          interpolate(resolve("host.editor.photos.room_created", "{room} created"), {
            room: created.name,
          }).text,
        );
      }
      return created;
    },
    [listingId, resolve, rooms],
  );

  const renameRoom = useCallback(
    async (room: ListingRoomSummary) => {
      const next = window.prompt(
        resolve("host.editor.photos.rename_prompt", "What should this space be called?").text,
        room.name,
      );
      if (next === null) return;
      const trimmed = next.trim();
      const ok = await commit(
        () =>
          setRooms((current) =>
            current.map((row) =>
              row.id === room.id
                ? { ...row, name: trimmed || row.name, translated: trimmed ? false : row.translated }
                : row,
            ),
          ),
        () => renameListingRoom(listingId, room.id, trimmed),
      );
      if (ok) toast.success(resolve("host.editor.photos.room_renamed", "Room renamed").text);
    },
    [commit, listingId, resolve],
  );

  const removeRoom = useCallback(
    async (room: ListingRoomSummary) => {
      const count = photosByRoom.map.get(room.id)?.length ?? 0;
      const message =
        count > 0
          ? interpolate(
              resolve(
                "host.editor.photos.confirm_delete_room",
                "Remove {room}? Its {count} photos stay in Other / Unassigned.",
              ),
              { room: room.name, count },
            ).text
          : interpolate(resolve("host.editor.photos.confirm_remove_room", "Remove {room}?"), {
              room: room.name,
            }).text;
      if (!window.confirm(message)) return;

      const ok = await commit(
        () => {
          setRooms((current) => current.filter((row) => row.id !== room.id));
          setPhotos((current) =>
            current.map((photo) =>
              photo.roomId === room.id ? { ...photo, roomId: null, roomOrder: 0 } : photo,
            ),
          );
        },
        () => deleteListingRoom(listingId, room.id),
      );
      if (ok) {
        if (filter === room.id) setFilter(undefined);
        toast.success(
          interpolate(resolve("host.editor.photos.room_removed", "{room} removed"), {
            room: room.name,
          }).text,
        );
      }
    },
    [commit, filter, listingId, photosByRoom.map, resolve],
  );

  /** Dropping onto a suggested space: create it, then move the photos in. One gesture,
   *  one result, and the host never had to set the room up first. */
  const dropOnSuggestion = useCallback(
    async (roomTypeId: string, photoIds: string[]) => {
      const roomType = roomTypes.find((row) => row.id === roomTypeId);
      if (!roomType) return;
      if (photoIds.length > 0) {
        setPendingSuggestedDrops((current) => {
          const next = new Map(current);
          next.set(roomTypeId, photoIds.length);
          return next;
        });
      }
      try {
        const created = await createRoom(roomType, { announce: photoIds.length === 0 });
        if (!created || photoIds.length === 0) return;
        await moveToRoom(photoIds, created.id, created.name);
      } finally {
        setPendingSuggestedDrops((current) => {
          if (!current.has(roomTypeId)) return current;
          const next = new Map(current);
          next.delete(roomTypeId);
          return next;
        });
      }
    },
    [createRoom, moveToRoom, roomTypes],
  );

  // ── Drag and drop ──────────────────────────────────────────────────────────

  // Mouse drags start after a small move so an ordinary click still selects; touch drags
  // need a press-and-hold so a swipe down the grid still scrolls the page.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const draggedIds = dragging ? targets(dragging) : [];

  function handleDragStart(event: DragStartEvent) {
    setDragging(String(event.active.id));
    const point = eventCoordinates(event.activatorEvent);
    const rect = event.active.rect.current.initial;
    setDragGrabPoint(
      point && rect ? { x: point.x - rect.left, y: point.y - rect.top } : null,
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDragging(null);
    setDragGrabPoint(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const moving = targets(activeId);

    // Dropped on a room rail row, a suggested space, or a room section in By room.
    const overData = over.data.current as
      | { type?: string; roomId?: string | null; roomTypeId?: string }
      | undefined;
    if (overData?.type === "roomType" && overData.roomTypeId) {
      await dropOnSuggestion(overData.roomTypeId, moving);
      return;
    }
    if (overData?.type === "room") {
      const roomId = overData.roomId ?? null;
      const alreadyThere = moving.every(
        (id) => photos.find((photo) => photo.id === id)?.roomId === roomId,
      );
      if (alreadyThere) return;
      await moveToRoom(moving, roomId);
      return;
    }

    if (activeId === overId) return;

    const source = photos.find((photo) => photo.id === activeId);
    const target = photos.find((photo) => photo.id === overId);
    if (!source || !target) return;

    // Dropped onto a photo in another room: that is a reassignment, and the drop position
    // is where it lands in the new room's order.
    if (view === "rooms" && source.roomId !== target.roomId) {
      await moveToRoom(moving, target.roomId);
      return;
    }

    if (view === "rooms") {
      const roomId = source.roomId;
      const inRoom = (roomId ? photosByRoom.map.get(roomId) : photosByRoom.unassigned) ?? [];
      const from = inRoom.findIndex((photo) => photo.id === activeId);
      const to = inRoom.findIndex((photo) => photo.id === overId);
      if (from === -1 || to === -1) return;
      const ordered = arrayMove(inRoom, from, to);
      const orders = new Map(ordered.map((photo, index) => [photo.id, index]));

      if (!roomId) {
        // Unassigned has no room order of its own — its sequence is the listing's.
        await reorderAll(ordered.map((photo) => photo.id));
        return;
      }
      await commit(
        () =>
          setPhotos((current) =>
            current.map((photo) =>
              orders.has(photo.id) ? { ...photo, roomOrder: orders.get(photo.id)! } : photo,
            ),
          ),
        () => reorderRoomPhotos(listingId, roomId, ordered.map((photo) => photo.id)),
      );
      return;
    }

    // All photos: a plain gallery reorder.
    const from = photos.findIndex((photo) => photo.id === activeId);
    const to = photos.findIndex((photo) => photo.id === overId);
    if (from === -1 || to === -1) return;
    await reorderAll(arrayMove(photos, from, to).map((photo) => photo.id));
  }

  const reorderAll = useCallback(
    async (orderedIds: string[]) => {
      const position = new Map(orderedIds.map((id, index) => [id, index]));
      await commit(
        () =>
          setPhotos((current) =>
            [...current]
              .sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0))
              .map((photo, index) => ({ ...photo, displayOrder: index })),
          ),
        () => reorderListingPhotos(listingId, orderedIds),
      );
    },
    [commit, listingId],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const nothingYet = photos.length === 0 && upload.tasks.length === 0;

  function openFilePicker() {
    fileInput.current?.click();
  }

  const fileField = (
    <input
      ref={fileInput}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,.heic,.heif,.mp4,.mov,.webm"
      multiple
      className="sr-only"
      onChange={(event) => {
        const files = event.target.files;
        if (files?.length) void upload.upload(files);
        event.target.value = "";
      }}
    />
  );

  if (nothingYet) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        {fileField}
        <div className="max-w-sm text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <ImagePlus className="size-6" aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-medium text-slate-900">
            <Tx k="host.editor.photos.empty_title" source="Add photos of your place" />
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            <Tx
              k="host.editor.photos.empty_copy"
              source="Help guests understand what they are booking."
            />
          </p>
          <button
            type="button"
            onClick={openFilePicker}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f1f5f9] px-5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#e2e8f0] focus-visible:bg-[#e2e8f0] focus-visible:outline-none"
          >
            <Upload className="size-4" aria-hidden />
            <Tx k="host.editor.photos.upload" source="Upload photos" />
          </button>
          <p className="mt-3 text-xs text-slate-500">
            <Tx
              k="host.editor.photos.empty_hint"
              source="You can organise photos by room afterwards."
            />
          </p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      id="listing-photos-dnd"
      sensors={sensors}
      collisionDetection={(args) => {
        // The pointer is the unambiguous answer wherever something is under it. Where
        // nothing is — the gap between tiles, the margin beside the pane — fall back to
        // what the dragged photo actually overlaps. The nearest centre is the wrong
        // question to ask here: with a rail of rooms and a pane of sections on screen it
        // always has an answer, so a room nowhere near the cursor lights up.
        const underPointer = pointerWithin(args);
        return underPointer.length > 0 ? underPointer : rectIntersection(args);
      }}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
      onDragCancel={() => {
        setDragging(null);
        setDragGrabPoint(null);
      }}
    >
      {fileField}

      <div className="flex flex-col">
        {/* The header already says which listing this is and the nav already says Photos,
            so a title and a subtitle here would spend the first band of the workspace
            repeating both. One row: what you are looking at, and what you can do to it. */}
        <h1 className="sr-only">
          <Tx k="host.editor.photos.title" source="Photos" />
        </h1>

        <div className="sticky top-14 z-10 flex items-center bg-white/95 py-3 backdrop-blur lg:top-0">
          {/* This column has exactly the same width as the photo pane below it, keeping
              its actions from drifting across the rooms rail on wide screens. */}
          <div className="flex min-w-0 flex-1 items-center gap-2 pr-4">
            <div className="flex shrink-0 rounded-full bg-slate-100 p-0.5">
              <ViewTab active={view === "all"} onClick={() => setView("all")}>
                <Tx k="host.editor.photos.view_all" source="All photos" />
              </ViewTab>
              <ViewTab active={view === "rooms"} onClick={() => setView("rooms")}>
                <Tx k="host.editor.photos.view_rooms" source="By room" />
              </ViewTab>
            </div>

            <div className="ml-auto flex items-center gap-1">
            {/* Density is a pointer-device affordance: a phone is three across whatever
                this says, so the control stays out of the way there. */}
            <div className="hidden shrink-0 items-center gap-0.5 min-[480px]:flex">
              <DensityButton
                value="small"
                current={density}
                label={resolve("host.editor.photos.density_small", "Small thumbnails").text}
              >
                <Rows3 className="size-4" aria-hidden />
              </DensityButton>
              <DensityButton
                value="medium"
                current={density}
                label={resolve("host.editor.photos.density_medium", "Medium thumbnails").text}
              >
                <LayoutGrid className="size-4" aria-hidden />
              </DensityButton>
              <DensityButton
                value="large"
                current={density}
                label={resolve("host.editor.photos.density_large", "Large thumbnails").text}
              >
                <Square className="size-4" aria-hidden />
              </DensityButton>
            </div>
            {view === "rooms" && (
              <button
                type="button"
                onClick={() => setAddingRoom(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none"
              >
                <Plus className="size-3.5" aria-hidden />
                <Tx k="host.editor.photos.add_room_short" source="Add room" />
              </button>
            )}
            <button
              type="button"
              onClick={openFilePicker}
              disabled={upload.uploading}
              className="ml-1 inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full bg-[#f1f5f9] px-4 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#e2e8f0] disabled:opacity-60 focus-visible:outline-none"
            >
              {upload.uploading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-4" aria-hidden />
              )}
              <span className="hidden sm:inline">
                <Tx k="host.editor.photos.upload" source="Upload photos" />
              </span>
              <span className="sm:hidden">
                <Tx k="host.editor.photos.upload_short" source="Upload" />
              </span>
            </button>
            </div>
          </div>

          {/* The rail title belongs to its own column, aligned with the actions rather
              than beginning a second header lower down beside the first row of photos. */}
          <EditorSideRailHeading>
            <Tx k="host.editor.photos.rooms_heading" source="Rooms and spaces" />
          </EditorSideRailHeading>
        </div>

        {/* The unassigned nudge: a quiet line, and only while there is something to do
            about it. A permanent warning block for a normal state would be noise. */}
        {unassignedCount > 0 && filter === undefined && view === "all" && (
          <button
            type="button"
            onClick={() => setFilter(null)}
            className="mb-2 self-start text-sm text-slate-500 underline-offset-4 transition-colors hover:text-slate-900 hover:underline"
          >
            {
              i18n.plural(
                "host.editor.photos.need_room",
                unassignedCount,
                "{n} photo needs a room",
                "{n} photos need a room",
              ).text
            }
          </button>
        )}

        {filter !== undefined && (
          <button
            type="button"
            onClick={() => setFilter(undefined)}
            className="mb-2 self-start text-sm text-slate-500 underline-offset-4 transition-colors hover:text-slate-900 hover:underline"
          >
            <Tx k="host.editor.photos.clear_filter" source="Show all photos" />
          </button>
        )}

        <div className="flex gap-4">
          <div className="flex min-w-0 flex-1 flex-col">
            {view === "all" ? (
              <SortableContext
                items={visiblePhotos.map((photo) => photo.id)}
                strategy={rectSortingStrategy}
              >
                <ul className={`grid gap-2 ${GRID_CLASS[density]}`}>
                  {visiblePhotos.map((photo) => (
                    <PhotoTile
                      key={photo.id}
                      photo={photo}
                      roomLabel={
                        photo.roomId
                          ? (roomNameById.get(photo.roomId)?.name ?? "")
                          : resolve("host.editor.photos.unassigned", "Other / Unassigned").text
                      }
                      roomTranslated={
                        photo.roomId
                          ? (roomNameById.get(photo.roomId)?.translated ?? false)
                          : false
                      }
                      rooms={roomsWithCounts}
                      roomTypes={availableRoomTypes}
                      selected={selection.has(photo.id)}
                      selecting={selection.size > 0}
                      onToggleSelect={toggleSelect}
                      onSetListingCover={makeListingCover}
                      onSetRoomCover={makeRoomCover}
                      onMoveTo={(id, roomId) => void moveToRoom(targets(id), roomId)}
                      onMoveToRoomType={(id, roomTypeId) =>
                        void dropOnSuggestion(roomTypeId, targets(id))
                      }
                      onDelete={(id) => confirmDelete(targets(id))}
                    />
                  ))}
                  {upload.tasks.map((task) => (
                    <UploadTile key={task.id} task={task} onDismiss={upload.dismiss} />
                  ))}
                  {!upload.uploading && <AddPhotoTile onAdd={openFilePicker} />}
                </ul>
              </SortableContext>
            ) : (
              <div className="space-y-6">
                {roomsWithCounts
                  .filter((room) => (photosByRoom.map.get(room.id)?.length ?? 0) > 0)
                  .map((room) => (
                  <RoomSection
                    key={room.id}
                    room={room}
                    photos={photosByRoom.map.get(room.id) ?? []}
                    gridClass={ROOM_GRID_CLASS[density]}
                    rooms={roomsWithCounts}
                    roomTypes={availableRoomTypes}
                    selection={selection}
                    onToggleSelect={toggleSelect}
                    onSetListingCover={makeListingCover}
                    onSetRoomCover={makeRoomCover}
                    onMoveTo={(id, roomId) => void moveToRoom(targets(id), roomId)}
                    onMoveToRoomType={(id, roomTypeId) =>
                      void dropOnSuggestion(roomTypeId, targets(id))
                    }
                    onDelete={(id) => confirmDelete(targets(id))}
                    onRename={() => void renameRoom(room)}
                    onRemove={() => void removeRoom(room)}
                  />
                  ))}
                <RoomSection
                  room={null}
                  photos={photosByRoom.unassigned}
                  gridClass={ROOM_GRID_CLASS[density]}
                  rooms={roomsWithCounts}
                  roomTypes={availableRoomTypes}
                  selection={selection}
                  onToggleSelect={toggleSelect}
                  onSetListingCover={makeListingCover}
                  onSetRoomCover={makeRoomCover}
                  onMoveTo={(id, roomId) => void moveToRoom(targets(id), roomId)}
                  onMoveToRoomType={(id, roomTypeId) =>
                    void dropOnSuggestion(roomTypeId, targets(id))
                  }
                  onDelete={(id) => confirmDelete(targets(id))}
                  onRename={() => undefined}
                  onRemove={() => undefined}
                />
                {upload.tasks.length > 0 && (
                  <ul className={`grid gap-2 ${ROOM_GRID_CLASS[density]}`}>
                    {upload.tasks.map((task) => (
                      <UploadTile key={task.id} task={task} onDismiss={upload.dismiss} />
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => setAddingRoom(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-4 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <Plus className="size-4" aria-hidden />
                  <Tx k="host.editor.photos.add_room" source="Add room or space" />
                </button>
              </div>
            )}

            <SelectionBar
              count={selection.size}
              rooms={roomsWithCounts}
              roomTypes={availableRoomTypes}
              onMoveTo={(roomId) => void moveToRoom([...selection], roomId)}
              onMoveToRoomType={(roomTypeId) =>
                void dropOnSuggestion(roomTypeId, [...selection])
              }
              onDelete={() => confirmDelete([...selection])}
              onClear={clearSelection}
            />
          </div>

          <RoomsPanel
            rooms={roomsWithCounts}
            suggestions={suggestions}
            unassignedCount={unassignedCount}
            pendingSuggestedDrops={pendingSuggestedDrops}
            activeRoomFilter={filter}
            onFilter={setFilter}
            onAddRoom={() => setAddingRoom(true)}
            onRenameRoom={(room) => void renameRoom(room)}
            onDeleteRoom={(room) => void removeRoom(room)}
          />
        </div>
      </div>

      <AddRoomDialog
        open={addingRoom}
        onOpenChange={setAddingRoom}
        roomTypes={roomTypes}
        rooms={roomsWithCounts}
        onAdd={(roomType) => void createRoom(roomType)}
      />

      {/* The dragged photo follows the cursor with a count when several are moving, so
          "seven photos are going here" is legible without reading the rail. */}
      <DragOverlay>
        {dragging ? (
          <div
            className="absolute size-24 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg bg-slate-200 shadow-2xl ring-2 ring-white"
            style={{
              left: dragGrabPoint?.x ?? "50%",
              top: dragGrabPoint?.y ?? "50%",
            }}
          >
            {(() => {
              const photo = photos.find((row) => row.id === dragging);
              if (!photo || photo.mediaType === "VIDEO") return null;
              // eslint-disable-next-line @next/next/no-img-element
              return <img src={photo.url} alt="" className="h-full w-full object-cover" />;
            })()}
            {draggedIds.length > 1 && (
              <span className="absolute -right-1.5 -top-1.5 grid min-w-6 place-items-center rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white">
                {draggedIds.length}
              </span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function DensityButton({
  value,
  current,
  label,
  children,
}: {
  value: Density;
  current: Density;
  label: string;
  children: React.ReactNode;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => setDensity(value)}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`grid size-8 place-items-center rounded-full transition-colors ${
        active ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
