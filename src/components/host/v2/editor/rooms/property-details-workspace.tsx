"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bath, Bed, BedDouble, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  EDITOR_GROUP_DIVIDER,
  EDITOR_GROUP_HEADING,
} from "@/components/host/v2/editor/editor-group";
import { beginSave, endSave } from "@/components/host/v2/editor/save-state";
import { AddRoomDialog } from "@/components/host/v2/editor/photos/add-room-dialog";
import { SpaceIcon } from "@/components/shared/space-icon";
import { updateListingPropertyDetails } from "@/lib/actions/listing-property-details.actions";
import { addListingRoom, deleteListingRoom, renameListingRoom } from "@/lib/actions/listing-photos.actions";
import { allowedListingSpaceTypes } from "@/lib/types/listing-space-type";
import { BATHROOMS_MAX, BEDROOMS_MAX, BEDS_MAX, listingPropertyDetailsIssues, type ListingPropertyDetailsInput } from "@/lib/host/v2/listing-property-details";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import { Tx, useI18n } from "@/lib/i18n/client";

const SAVE_DELAY = 600;

function same(a: ListingPropertyDetailsInput, b: ListingPropertyDetailsInput) {
  return a.propertyType === b.propertyType && a.spaceType === b.spaceType && a.bedrooms === b.bedrooms && a.beds === b.beds && a.bathrooms === b.bathrooms;
}

export function PropertyDetailsWorkspace({ listingId, stored, propertyTypes, rooms, roomTypes }: {
  listingId: string;
  stored: ListingPropertyDetailsInput;
  propertyTypes: PropertyTypeOption[];
  rooms: ListingRoomSummary[];
  roomTypes: CatalogRoomType[];
}) {
  const router = useRouter();
  const { resolve } = useI18n();
  const [value, setValue] = useState(stored);
  const [roomDialog, setRoomDialog] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);
  const confirmed = useRef(stored);
  const queued = useRef<ListingPropertyDetailsInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const issues = listingPropertyDetailsIssues(value);

  const flush = useCallback(async () => {
    if (saving.current) return;
    const next = queued.current;
    if (!next || same(next, confirmed.current) || Object.keys(listingPropertyDetailsIssues(next)).length) return;
    queued.current = null;
    saving.current = true;
    beginSave();
    try {
      const result = await updateListingPropertyDetails(listingId, next);
      if (result.error || result.issues || !result.stored) {
        endSave(true);
        if (mounted.current) toast.error(result.error ?? "Those details couldn't be saved.");
      } else {
        confirmed.current = result.stored;
        endSave();
      }
    } catch {
      endSave(true);
      if (mounted.current) toast.error("We couldn't save that. Check your connection and try again.");
    } finally {
      saving.current = false;
      if (queued.current && !same(queued.current, confirmed.current)) void flushRef.current();
    }
  }, [listingId]);
  useEffect(() => { flushRef.current = flush; }, [flush]);
  useEffect(() => () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); void flushRef.current(); }, []);

  const change = useCallback((next: ListingPropertyDetailsInput, immediate = false) => {
    setValue(next); queued.current = next;
    if (timer.current) clearTimeout(timer.current);
    if (immediate) void flushRef.current();
    else timer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY);
  }, []);
  const spaceTypes = useMemo(() => allowedListingSpaceTypes(value.propertyType, value.spaceType), [value.propertyType, value.spaceType]);

  async function roomWork(work: () => Promise<{ error?: string }>) {
    if (roomBusy) return;
    setRoomBusy(true); beginSave();
    try { const result = await work(); if (result.error) { endSave(true); toast.error(result.error); return; } endSave(); router.refresh(); }
    catch { endSave(true); toast.error("We couldn't update that room."); }
    finally { setRoomBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-6 pb-16 md:py-10">
      {/* The rail, the browser tab and — on a phone — the filled chip all name this
          section already. Kept for the document outline and for screen readers, which
          have no rail to read. */}
      <header className="sr-only"><h1><Tx k="host.editor.rooms.heading" source="Property details" /></h1></header>

      <section aria-labelledby="property-kind-heading">
        <h2 id="property-kind-heading" className={EDITOR_GROUP_HEADING}><Tx k="host.editor.rooms.property_type" source="Property type" /></h2>
        <select aria-label={resolve("host.editor.rooms.property_type", "Property type").text} value={value.propertyType} onChange={(event) => change({ ...value, propertyType: event.target.value }, true)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
          {propertyTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        {issues.propertyType && <p role="alert" className="mt-1 text-sm text-rose-600"><Tx k="host.editor.rooms.property_type_error" source="Choose a property type." /></p>}
      </section>

      <section className={EDITOR_GROUP_DIVIDER} aria-labelledby="space-type-heading">
        <h2 id="space-type-heading" className={EDITOR_GROUP_HEADING}><Tx k="host.editor.rooms.space_type" source="What guests book" /></h2>
        <div role="radiogroup" aria-labelledby="space-type-heading" className="mt-2 grid gap-2 sm:grid-cols-2">
          {spaceTypes.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value.spaceType === option.value} onClick={() => change({ ...value, spaceType: option.value }, true)} className={cn("min-h-14 rounded-xl bg-slate-50 px-4 text-left text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400", value.spaceType === option.value && "bg-slate-900 text-white hover:bg-slate-800")}>{option.label}</button>)}
        </div>
      </section>

      <section className={EDITOR_GROUP_DIVIDER} aria-labelledby="capacity-heading">
        <h2 id="capacity-heading" className={EDITOR_GROUP_HEADING}><Tx k="host.editor.rooms.counts" source="Rooms and beds" /></h2>
        <div className="mt-2 divide-y divide-slate-200">
          <Stepper icon={BedDouble} label="Bedrooms" value={value.bedrooms} max={BEDROOMS_MAX} onChange={(bedrooms) => change({ ...value, bedrooms })} />
          <Stepper icon={Bed} label="Beds" value={value.beds} max={BEDS_MAX} onChange={(beds) => change({ ...value, beds })} />
          <Stepper icon={Bath} label="Bathrooms" value={value.bathrooms} max={BATHROOMS_MAX} onChange={(bathrooms) => change({ ...value, bathrooms })} />
        </div>
      </section>

      <section className={EDITOR_GROUP_DIVIDER} aria-labelledby="room-config-heading">
        <div className="flex items-center justify-between gap-4"><h2 id="room-config-heading" className={EDITOR_GROUP_HEADING}><Tx k="host.editor.rooms.configuration" source="Room configuration" /></h2><button type="button" onClick={() => setRoomDialog(true)} className="min-h-11 rounded-full px-4 text-sm font-semibold text-[#0f172a] outline-none hover:bg-[#f1f5f9] focus-visible:ring-2 focus-visible:ring-[#0f172a]"><Tx k="host.editor.rooms.add" source="Add room or space" /></button></div>
        {rooms.length ? <ul className="mt-2 divide-y divide-slate-200">{rooms.map((room) => <li key={room.id} className="flex min-h-14 items-center gap-3 py-2"><SpaceIcon name={room.icon} className="size-5 text-slate-400" /><button type="button" disabled={roomBusy} onClick={() => { const next = window.prompt("Room name", room.name); if (next !== null) void roomWork(() => renameListingRoom(listingId, room.id, next)); }} className="min-h-11 min-w-0 flex-1 truncate text-left text-sm text-slate-700 outline-none focus-visible:underline">{room.name}</button><button type="button" disabled={roomBusy} aria-label={`Delete ${room.name}`} onClick={() => { if (window.confirm(`Delete ${room.name}? Assigned photos will stay in Photos as unassigned.`)) void roomWork(() => deleteListingRoom(listingId, room.id)); }} className="grid size-11 place-items-center rounded-full text-slate-400 outline-none hover:bg-slate-100 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-slate-400"><Trash2 className="size-4" aria-hidden /></button></li>)}</ul> : <p className="mt-3 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500"><Tx k="host.editor.rooms.empty" source="No rooms configured yet." /></p>}
      </section>
      <AddRoomDialog open={roomDialog} onOpenChange={setRoomDialog} roomTypes={roomTypes} rooms={rooms} onAdd={(type) => { setRoomDialog(false); void roomWork(() => addListingRoom(listingId, type.id)); }} />
    </div>
  );
}

function Stepper({ icon: Icon, label, value, max, onChange }: { icon: typeof Bed; label: string; value: number; max: number; onChange: (value: number) => void }) {
  return <div className="flex min-h-16 items-center gap-3 py-2"><Icon className="size-5 text-slate-400" aria-hidden /><span className="flex-1 text-sm text-slate-700">{label}</span><button type="button" aria-label={`One ${label.toLowerCase()} fewer`} disabled={value <= 0} onClick={() => onChange(value - 1)} className="grid size-11 place-items-center rounded-full bg-slate-100 outline-none hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-35"><Minus className="size-4" aria-hidden /></button><output aria-label={`${label}: ${value}`} className="w-8 text-center text-base tabular-nums">{value}</output><button type="button" aria-label={`One ${label.toLowerCase()} more`} disabled={value >= max} onClick={() => onChange(value + 1)} className="grid size-11 place-items-center rounded-full bg-slate-100 outline-none hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-35"><Plus className="size-4" aria-hidden /></button></div>;
}
