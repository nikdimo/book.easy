"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, Ellipsis, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SpaceIcon } from "@/components/shared/space-icon";
import { EditorSideRail } from "@/components/host/v2/editor/editor-side-rail";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import { Tx, useI18n } from "@/lib/i18n/client";

export const UNASSIGNED_DROP_ID = "room-drop:unassigned";
export const roomDropId = (roomId: string) => `room-drop:${roomId}`;
export const roomTypeDropId = (roomTypeId: string) => `roomtype-drop:${roomTypeId}`;

/**
 * The right rail: compact rows that are also the drop targets.
 *
 * Rows rather than cards. A card per room would turn eight spaces into eight boxes and
 * push the last of them off screen, and the rail's whole value is that every room stays
 * reachable while the host scrolls a hundred photos past it.
 *
 * The rail stays pinned while the photo pane scrolls. Only its rows scroll when the
 * catalog is taller than the available viewport, leaving its add action reachable.
 */
export function RoomsPanel({
  rooms,
  suggestions,
  unassignedCount,
  pendingSuggestedDrops,
  activeRoomFilter,
  onFilter,
  onAddRoom,
  onRenameRoom,
  onDeleteRoom,
}: {
  rooms: ListingRoomSummary[];
  /** Spaces this listing has none of yet, split into standard and uncommon groups. */
  suggestions: CatalogRoomType[];
  unassignedCount: number;
  /** A just-dropped suggested space while its room record is being created. */
  pendingSuggestedDrops: ReadonlyMap<string, number>;
  activeRoomFilter: string | null | undefined;
  onFilter: (roomId: string | null | undefined) => void;
  onAddRoom: () => void;
  onRenameRoom: (room: ListingRoomSummary) => void;
  onDeleteRoom: (room: ListingRoomSummary) => void;
}) {
  const { resolve } = useI18n();
  const [showMore, setShowMore] = useState(false);
  const standardSuggestions = suggestions.filter((roomType) => roomType.isStandard);
  const moreSuggestions = suggestions.filter((roomType) => !roomType.isStandard);
  const addRoom = (
    <button
      type="button"
      onClick={onAddRoom}
      className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[#0f172a] transition-colors hover:bg-[#f1f5f9] focus-visible:outline-none"
    >
      <Plus className="size-4" aria-hidden />
      {resolve("host.editor.photos.add_room", "Add room or space").text}
    </button>
  );

  return (
    <EditorSideRail
      label={resolve("host.editor.photos.rooms_heading", "Rooms and spaces").text}
      footer={addRoom}
    >
          <UnassignedRow
            count={unassignedCount}
            active={activeRoomFilter === null}
            onFilter={onFilter}
          />

          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              active={activeRoomFilter === room.id}
              onFilter={onFilter}
              onRename={onRenameRoom}
              onDelete={onDeleteRoom}
            />
          ))}

          {/* Common spaces stay exposed as immediate drop targets. */}
          {standardSuggestions.map((roomType) => (
            <SuggestedRow
              key={roomType.id}
              roomType={roomType}
              pendingCount={pendingSuggestedDrops.get(roomType.id) ?? 0}
            />
          ))}

          {moreSuggestions.length > 0 && (
            <li className="pt-1">
              <button
                type="button"
                onClick={() => setShowMore((current) => !current)}
                aria-expanded={showMore}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none"
              >
                <ChevronDown
                  className={`size-3.5 shrink-0 transition-transform ${showMore ? "" : "-rotate-90"}`}
                  aria-hidden
                />
                <Tx k="host.editor.photos.more_spaces" source="More spaces" />
                <span className="ml-auto text-xs font-normal tabular-nums text-slate-400">
                  {moreSuggestions.length}
                </span>
              </button>

              {showMore && (
                <ul className="mt-0.5 space-y-0.5 border-l border-slate-100 pl-2">
                  {moreSuggestions.map((roomType) => (
                    <SuggestedRow
                      key={roomType.id}
                      roomType={roomType}
                      pendingCount={pendingSuggestedDrops.get(roomType.id) ?? 0}
                    />
                  ))}
                </ul>
              )}
            </li>
          )}
    </EditorSideRail>
  );
}

/** The drag-over look, shared by every drop target so a photo in the air always means the
 *  same thing. Fill and weight only — an outline on a row this size reads as a defect. */
const OVER = "bg-slate-900 text-white";

function RoomRow({
  room,
  active,
  onFilter,
  onRename,
  onDelete,
}: {
  room: ListingRoomSummary;
  active: boolean;
  onFilter: (roomId: string | null | undefined) => void;
  onRename: (room: ListingRoomSummary) => void;
  onDelete: (room: ListingRoomSummary) => void;
}) {
  const { resolve } = useI18n();
  const { setNodeRef, isOver } = useDroppable({
    id: roomDropId(room.id),
    data: { type: "room", roomId: room.id },
  });

  return (
    <li
      ref={setNodeRef}
      className={`group relative flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
        isOver ? OVER : active ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      <SpaceIcon
        name={room.icon}
        className={`size-3.5 shrink-0 ${isOver ? "text-white" : "text-slate-400"}`}
      />
      <button
        type="button"
        onClick={() => onFilter(active ? undefined : room.id)}
        className="min-w-0 flex-1 truncate text-left text-sm after:absolute after:inset-0 focus-visible:outline-none"
        translate={room.translated ? "no" : undefined}
      >
        {room.name}
      </button>
      <span
        className={`shrink-0 text-xs tabular-nums group-hover:hidden ${
          isOver ? "text-white" : "text-slate-400"
        }`}
      >
        {room.photoCount}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={resolve("host.editor.photos.room_actions", "Room actions").text}
          className="relative z-10 hidden size-6 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none group-hover:grid data-[state=open]:grid"
        >
          <Ellipsis className="size-3.5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => onRename(room)}>
            <Tx k="host.editor.photos.rename_room" source="Rename" />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onFilter(room.id)}>
            <Tx k="host.editor.photos.show_only" source="Show only this room" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(room)}>
            <Tx k="host.editor.photos.delete_room" source="Delete room" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** A standard space the listing does not have yet. It is deliberately a drop target, not
 *  a button: clicking a zero-count row must never create a room. */
function SuggestedRow({
  roomType,
  pendingCount,
}: {
  roomType: CatalogRoomType;
  pendingCount: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: roomTypeDropId(roomType.id),
    data: { type: "roomType", roomTypeId: roomType.id },
  });

  return (
    <li
      ref={setNodeRef}
      className={`relative flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
        isOver || pendingCount > 0 ? OVER : ""
      }`}
    >
      <SpaceIcon
        name={roomType.icon}
        className={`size-3.5 shrink-0 ${isOver || pendingCount > 0 ? "text-white" : "text-slate-300"}`}
      />
      <span
        className={`min-w-0 flex-1 truncate text-left text-sm ${
          isOver || pendingCount > 0 ? "text-white" : "text-slate-400"
        }`}
        translate={roomType.translated ? "no" : undefined}
      >
        {roomType.label}
      </span>
      <span
        className={`shrink-0 text-xs tabular-nums ${
          isOver || pendingCount > 0 ? "text-white" : "text-slate-300"
        }`}
      >
        {pendingCount}
      </span>
    </li>
  );
}

function UnassignedRow({
  count,
  active,
  onFilter,
}: {
  count: number;
  active: boolean;
  onFilter: (roomId: string | null | undefined) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: UNASSIGNED_DROP_ID,
    data: { type: "room", roomId: null },
  });

  return (
    <li
      ref={setNodeRef}
      className={`relative mb-1 flex items-center gap-2 rounded-lg border-b border-slate-100 px-2 py-1.5 pb-2.5 transition-colors ${
        isOver ? OVER : active ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      <button
        type="button"
        onClick={() => onFilter(active ? undefined : null)}
        className={`min-w-0 flex-1 truncate text-left text-sm after:absolute after:inset-0 focus-visible:outline-none ${
          isOver ? "" : count > 0 ? "font-medium text-slate-900" : "text-slate-500"
        }`}
      >
        <Tx k="host.editor.photos.unassigned" source="Other / Unassigned" />
      </button>
      <span
        className={`shrink-0 text-xs tabular-nums ${
          isOver ? "text-white" : "text-slate-400"
        }`}
      >
        {count}
      </span>
    </li>
  );
}
