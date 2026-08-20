"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, Ellipsis } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SpaceIcon } from "@/components/shared/space-icon";
import type { EditorPhoto } from "@/lib/services/listing-editor.service";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import { Tx, useI18n } from "@/lib/i18n/client";
import { PhotoTile } from "./photo-tile";
import { roomDropId, UNASSIGNED_DROP_ID } from "./rooms-panel";

/**
 * One room in the By room view.
 *
 * A title, a count, a grid, and a hairline — not a card. Cards inside a page that is
 * already a pane would be boxes inside boxes, and on a property with nine spaces the
 * padding alone would push the third room below the fold.
 *
 * The whole section is a drop target, so a room with no photos yet is still somewhere a
 * host can drag to. That is the case the rail cannot cover in this view.
 */
export function RoomSection({
  room,
  photos,
  gridClass,
  rooms,
  roomTypes,
  selection,
  onToggleSelect,
  onSetListingCover,
  onSetRoomCover,
  onMoveTo,
  onMoveToRoomType,
  onDelete,
  onRename,
  onRemove,
}: {
  /** null is the Other / Unassigned bucket, which has no room actions of its own. */
  room: ListingRoomSummary | null;
  photos: EditorPhoto[];
  gridClass: string;
  rooms: ListingRoomSummary[];
  roomTypes: CatalogRoomType[];
  selection: Set<string>;
  onToggleSelect: (id: string, additive: boolean) => void;
  onSetListingCover: (id: string) => void;
  onSetRoomCover: (id: string) => void;
  onMoveTo: (id: string, roomId: string | null) => void;
  onMoveToRoomType: (id: string, roomTypeId: string) => void;
  onDelete: (id: string) => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const i18n = useI18n();
  const { resolve } = i18n;
  const [collapsed, setCollapsed] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: room ? roomDropId(room.id) : UNASSIGNED_DROP_ID,
    data: { type: "room", roomId: room?.id ?? null },
  });

  // The unassigned bucket only earns space when something is in it. An empty "Other"
  // heading at the bottom of every organised listing would be a permanent reminder of
  // nothing.
  if (!room && photos.length === 0) return null;

  const name = room
    ? room.name
    : resolve("host.editor.photos.unassigned", "Other / Unassigned").text;

  return (
    <section
      ref={setNodeRef}
      // Fill only while a photo is over it — no outline. Same language the rail speaks,
      // so a drag means one thing wherever it lands.
      className={`-mx-2 rounded-xl px-2 py-1 transition-colors ${
        isOver ? "bg-[#fde7dc]" : ""
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-expanded={!collapsed}
          className="grid size-6 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <ChevronDown
            className={`size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            aria-hidden
          />
        </button>
        {room && <SpaceIcon name={room.icon} className="size-4 shrink-0 text-slate-400" />}
        <h3
          className="min-w-0 truncate text-sm font-medium text-slate-900"
          translate={room && !room.translated ? "no" : undefined}
        >
          {name}
        </h3>
        <span className="shrink-0 text-xs text-slate-400">
          {
            i18n.plural(
              "host.editor.photos.photo_count",
              photos.length,
              "{n} photo",
              "{n} photos",
            ).text
          }
        </span>

        {room && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={resolve("host.editor.photos.room_actions", "Room actions").text}
              className="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Ellipsis className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onRename}>
                <Tx k="host.editor.photos.rename_room" source="Rename" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Tx k="host.editor.photos.delete_room" source="Delete room" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!collapsed &&
        (photos.length === 0 ? (
          <p className="px-1 py-6 text-sm text-slate-400">
            <Tx
              k="host.editor.photos.room_empty"
              source="Drag photos here, or use Move to on a photo."
            />
          </p>
        ) : (
          <SortableContext
            items={photos.map((photo) => photo.id)}
            strategy={rectSortingStrategy}
          >
            <ul className={`mt-2 grid gap-2 ${gridClass}`}>
              {photos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  roomLabel=""
                  roomTranslated={false}
                  rooms={rooms}
                  roomTypes={roomTypes}
                  selected={selection.has(photo.id)}
                  selecting={selection.size > 0}
                  onToggleSelect={onToggleSelect}
                  onSetListingCover={onSetListingCover}
                  onSetRoomCover={onSetRoomCover}
                  onMoveTo={onMoveTo}
                  onMoveToRoomType={onMoveToRoomType}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </SortableContext>
        ))}
    </section>
  );
}
