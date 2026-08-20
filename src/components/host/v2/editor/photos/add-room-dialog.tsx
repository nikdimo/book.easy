"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SpaceIcon } from "@/components/shared/space-icon";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import { interpolate, useI18n } from "@/lib/i18n/client";

/**
 * Picking a space to add.
 *
 * Grouped and searchable rather than one long list, and it never asks for a number: if
 * the listing already has two bedrooms, choosing Bedroom makes Bedroom 3. Making the host
 * both pick a type and type "3" would be asking them to do arithmetic the editor already
 * did.
 */
export function AddRoomDialog({
  open,
  onOpenChange,
  roomTypes,
  rooms,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomTypes: CatalogRoomType[];
  rooms: ListingRoomSummary[];
  onAdd: (roomType: CatalogRoomType) => void;
}) {
  const { resolve } = useI18n();
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms) {
      map.set(room.roomTypeId, (map.get(room.roomTypeId) ?? 0) + 1);
    }
    return map;
  }, [rooms]);

  const groups = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const matching = roomTypes.filter((roomType) => {
      // A type that cannot repeat and is already on the listing is not a choice — leaving
      // it in the grid greyed out would just be a thing to try clicking.
      if (!roomType.isRepeatable && (counts.get(roomType.id) ?? 0) > 0) return false;
      if (!term) return true;
      return (
        roomType.label.toLocaleLowerCase().includes(term) ||
        roomType.name.toLocaleLowerCase().includes(term)
      );
    });

    const byCategory = new Map<string, { label: string; items: CatalogRoomType[] }>();
    for (const roomType of matching) {
      const entry = byCategory.get(roomType.category.id);
      if (entry) entry.items.push(roomType);
      else
        byCategory.set(roomType.category.id, {
          label: roomType.category.label,
          items: [roomType],
        });
    }
    return [...byCategory.values()];
  }, [counts, query, roomTypes]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent className="max-h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-slate-100 p-5 pb-4">
          <DialogTitle className="text-base">
            {resolve("host.editor.photos.add_room_title", "Add a room or space").text}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {
              resolve(
                "host.editor.photos.add_room_help",
                "Pick a space. We number it for you if you already have one.",
              ).text
            }
          </DialogDescription>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={resolve("host.editor.photos.search_spaces", "Search spaces").text}
            className="mt-3 h-10 rounded-full"
          />
        </DialogHeader>

        <div className="max-h-[55dvh] overflow-y-auto p-4">
          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {
                interpolate(
                  resolve("host.editor.photos.no_spaces", "No space matches {query}."),
                  { query },
                ).text
              }
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-4 last:mb-0">
                <p className="mb-1.5 px-1 text-xs font-medium text-slate-500">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map((roomType) => {
                    const existing = counts.get(roomType.id) ?? 0;
                    return (
                      <button
                        key={roomType.id}
                        type="button"
                        onClick={() => onAdd(roomType)}
                        className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
                      >
                        <SpaceIcon
                          name={roomType.icon}
                          className="size-4 shrink-0 text-slate-400"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-sm text-slate-800"
                            translate={roomType.translated ? "no" : undefined}
                          >
                            {roomType.label}
                          </span>
                          {existing > 0 && (
                            <span className="block truncate text-[11px] text-slate-400">
                              {
                                interpolate(
                                  resolve(
                                    "host.editor.photos.already_have",
                                    "You have {count}",
                                  ),
                                  { count: existing },
                                ).text
                              }
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
