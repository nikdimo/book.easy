"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, CircleAlert, Ellipsis, Loader2, Play, Plus, RotateCcw, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EditorPhoto } from "@/lib/services/listing-editor.service";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import type { UploadTask } from "./use-photo-upload";
import { Tx, useI18n } from "@/lib/i18n/client";

/**
 * One photo in the grid.
 *
 * Nothing is painted over the image at rest except the cover mark and, in All photos, the
 * room it belongs to — a permanently visible toolbar on every tile would make a wall of
 * chrome out of the thing the host came here to look at. The rest appears on hover, on
 * focus, or once selection mode is on, where the checkbox has to be visible to be usable
 * on a touch screen.
 */
export function PhotoTile({
  photo,
  roomLabel,
  roomTranslated,
  rooms,
  roomTypes,
  selected,
  selecting,
  onToggleSelect,
  onSetListingCover,
  onSetRoomCover,
  onMoveTo,
  onMoveToRoomType,
  onDelete,
}: {
  photo: EditorPhoto;
  roomLabel: string;
  roomTranslated: boolean;
  rooms: ListingRoomSummary[];
  roomTypes: CatalogRoomType[];
  selected: boolean;
  selecting: boolean;
  onToggleSelect: (id: string, additive: boolean) => void;
  onSetListingCover: (id: string) => void;
  onSetRoomCover: (id: string) => void;
  onMoveTo: (id: string, roomId: string | null) => void;
  onMoveToRoomType: (id: string, roomTypeId: string) => void;
  onDelete: (id: string) => void;
}) {
  const { resolve } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id, data: { type: "photo", roomId: photo.roomId } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative aspect-square overflow-hidden rounded-lg bg-slate-100 ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      {/* The image is the drag handle and the selection target at once: a separate grip
          would spend a corner of every tile on something the whole tile can do. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(event) => onToggleSelect(photo.id, event.shiftKey || event.metaKey)}
        aria-pressed={selected}
        aria-label={
          resolve("host.editor.photos.select_photo", "Select photo").text
        }
        className="absolute inset-0 h-full w-full cursor-grab touch-manipulation select-none active:cursor-grabbing"
      >
        {photo.mediaType === "VIDEO" ? (
          <>
            <video
              src={photo.url}
              className="pointer-events-none h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="grid size-9 place-items-center rounded-full bg-black/55 text-white">
                <Play className="size-4 fill-current" aria-hidden />
              </span>
            </span>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.url}
            alt={photo.alt ?? ""}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
          />
        )}
      </button>

      {selected && (
        <span
          className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-inset ring-[#0f172a]"
          aria-hidden
        />
      )}

      {/* Checkbox: always there once anything is selected, hover-only before that. */}
      <span
        className={`pointer-events-none absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full border transition-opacity ${
          selected
            ? "border-[#0f172a] bg-[#0f172a] text-white opacity-100"
            : "border-white/80 bg-black/25 text-transparent"
        } ${selecting || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
      >
        <Check className="size-3" aria-hidden />
      </span>

      {photo.isPrimary && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm">
          <Tx k="host.editor.photos.cover" source="Cover" />
        </span>
      )}

      {roomLabel && (
        <span
          className="pointer-events-none absolute bottom-1.5 right-1.5 max-w-[calc(100%-0.75rem)] truncate rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-white"
          translate={roomTranslated ? "no" : undefined}
        >
          {roomLabel}
        </span>
      )}

      <div className="absolute right-1 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:opacity-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={resolve("host.editor.photos.photo_actions", "Photo actions").text}
            className="grid size-7 place-items-center rounded-full bg-white/95 text-slate-700 shadow-sm transition-colors hover:bg-white"
          >
            <Ellipsis className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {!photo.isPrimary && photo.mediaType === "IMAGE" && (
              <DropdownMenuItem onSelect={() => onSetListingCover(photo.id)}>
                <Tx
                  k="host.editor.photos.set_listing_cover"
                  source="Set as listing cover"
                />
              </DropdownMenuItem>
            )}
            {photo.roomId && (
              <DropdownMenuItem onSelect={() => onSetRoomCover(photo.id)}>
                <Tx k="host.editor.photos.set_room_cover" source="Set as room cover" />
              </DropdownMenuItem>
            )}
            {/* The menu path matters as much as dragging: it is the only one that works
                with a keyboard, on a phone, or for a host who simply prefers menus. */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Tx k="host.editor.photos.move_to" source="Move to" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
                <DropdownMenuItem
                  disabled={photo.roomId === null}
                  onSelect={() => onMoveTo(photo.id, null)}
                >
                  <Tx k="host.editor.photos.unassigned" source="Other / Unassigned" />
                </DropdownMenuItem>
                {(rooms.length > 0 || roomTypes.length > 0) && <DropdownMenuSeparator />}
                {rooms.map((room) => (
                  <DropdownMenuItem
                    key={room.id}
                    disabled={room.id === photo.roomId}
                    onSelect={() => onMoveTo(photo.id, room.id)}
                  >
                    <span
                      className="truncate"
                      translate={room.translated ? "no" : undefined}
                    >
                      {room.name}
                    </span>
                  </DropdownMenuItem>
                ))}
                {rooms.length > 0 && roomTypes.length > 0 && <DropdownMenuSeparator />}
                {roomTypes.map((roomType) => (
                  <DropdownMenuItem
                    key={roomType.id}
                    onSelect={() => onMoveToRoomType(photo.id, roomType.id)}
                  >
                    <span className="truncate" translate={roomType.translated ? "no" : undefined}>
                      {roomType.label}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(photo.id)}>
              <Tx k="host.editor.photos.delete" source="Delete" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** A file still on its way up. It holds the same grid cell the finished photo will take,
 *  so the layout does not jump when the upload lands. */
export function UploadTile({
  task,
  onDismiss,
}: {
  task: UploadTask;
  onDismiss: (id: string) => void;
}) {
  const failed = task.status === "error";
  const width =
    task.status === "processing" ? 95 : task.status === "queued" ? 6 : Math.max(6, task.progress);

  return (
    <li className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
      {task.mediaType === "VIDEO" ? (
        <video src={task.previewUrl} className="h-full w-full object-cover" muted playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={task.previewUrl} alt="" className="h-full w-full object-cover" />
      )}
      <div
        className={`absolute inset-0 flex flex-col justify-end p-2 text-white ${
          failed ? "bg-black/65" : "bg-gradient-to-t from-black/70 to-black/5"
        }`}
      >
        {failed ? (
          <>
            <p className="flex items-start gap-1 text-[10px] leading-tight text-white/90">
              <CircleAlert className="mt-px size-3 shrink-0" aria-hidden />
              <span className="line-clamp-2">{task.error}</span>
            </p>
            <button
              type="button"
              onClick={() => onDismiss(task.id)}
              className="mt-1.5 inline-flex items-center gap-1 self-start rounded-md border border-white/40 px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-white/10"
            >
              <X className="size-3" aria-hidden />
              <Tx k="host.editor.photos.dismiss" source="Dismiss" />
            </button>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1 text-[10px]">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {task.progress}%
            </span>
            <span className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/30">
              <span
                className="block h-full rounded-full bg-white transition-[width] duration-200"
                style={{ width: `${width}%` }}
              />
            </span>
          </>
        )}
      </div>
    </li>
  );
}

/** A quiet last grid cell keeps the next action where the host's eyes already are after
 * reviewing the current gallery. */
export function AddPhotoTile({ onAdd }: { onAdd: () => void }) {
  return (
    <li className="aspect-square">
      <button
        type="button"
        onClick={onAdd}
        className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none"
      >
        <Plus className="size-5" aria-hidden />
        <span className="mt-1 text-xs font-medium">
          <Tx k="host.editor.photos.add_photo" source="Add photo" />
        </span>
      </button>
    </li>
  );
}

/** The retry affordance for a failed upload, offered once rather than per tile. */
export function RetryHint({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1.5 text-sm text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
    >
      <RotateCcw className="size-3.5" aria-hidden />
      <Tx k="host.editor.photos.retry_failed" source="Retry failed uploads" />
    </button>
  );
}
