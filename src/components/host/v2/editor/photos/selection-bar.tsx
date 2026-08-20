"use client";

import { Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * What you can do with the photos you have selected.
 *
 * It floats over the grid instead of sitting in the toolbar, for two reasons: it exists
 * only while there is a selection, so reserving a row for it permanently would leave a
 * gap most of the time; and appearing in place means the grid never shifts under the
 * cursor at the moment the host clicks. On a phone it lands where the thumb already is.
 */
export function SelectionBar({
  count,
  rooms,
  roomTypes,
  onMoveTo,
  onMoveToRoomType,
  onDelete,
  onClear,
}: {
  count: number;
  rooms: ListingRoomSummary[];
  roomTypes: CatalogRoomType[];
  onMoveTo: (roomId: string | null) => void;
  onMoveToRoomType: (roomTypeId: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const { resolve } = useI18n();
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4 md:sticky md:bottom-4 md:pt-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-slate-900 py-1.5 pl-4 pr-1.5 text-white shadow-lg">
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {
            interpolate(resolve("host.editor.photos.selected", "{count} selected"), {
              count,
            }).text
          }
        </span>

        <span className="mx-1 h-4 w-px shrink-0 bg-white/20" aria-hidden />

        <DropdownMenu>
          <DropdownMenuTrigger className="shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-white/15 focus-visible:bg-white/20 focus-visible:outline-none">
            {resolve("host.editor.photos.move_to_room", "Move to").text}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            side="top"
            className="max-h-72 w-52 overflow-y-auto"
          >
            <DropdownMenuItem onSelect={() => onMoveTo(null)}>
              {resolve("host.editor.photos.unassigned", "Other / Unassigned").text}
            </DropdownMenuItem>
            {(rooms.length > 0 || roomTypes.length > 0) && <DropdownMenuSeparator />}
            {rooms.map((room) => (
              <DropdownMenuItem key={room.id} onSelect={() => onMoveTo(room.id)}>
                <span className="truncate" translate={room.translated ? "no" : undefined}>
                  {room.name}
                </span>
              </DropdownMenuItem>
            ))}
            {rooms.length > 0 && roomTypes.length > 0 && <DropdownMenuSeparator />}
            {roomTypes.map((roomType) => (
              <DropdownMenuItem key={roomType.id} onSelect={() => onMoveToRoomType(roomType.id)}>
                <span className="truncate" translate={roomType.translated ? "no" : undefined}>
                  {roomType.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={onDelete}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-white/15 focus-visible:bg-white/20 focus-visible:outline-none"
        >
          <Trash2 className="size-4" aria-hidden />
          <span className="hidden sm:inline">
            {resolve("host.editor.photos.delete", "Delete").text}
          </span>
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label={resolve("host.editor.photos.clear_selection", "Clear selection").text}
          className="grid size-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/15 focus-visible:bg-white/20 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
