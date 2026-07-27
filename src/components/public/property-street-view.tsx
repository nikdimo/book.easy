"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tx, useI18n } from "@/lib/i18n/client";

export function PropertyStreetView({
  latitude,
  longitude,
  panoId,
  heading,
  pitch,
}: {
  latitude: number;
  longitude: number;
  panoId: string;
  heading: number;
  pitch: number;
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const i18n = useI18n();
  if (!key) return null;

  const params = new URLSearchParams({
    key,
    pano: panoId,
    location: `${latitude},${longitude}`,
    heading: String(heading),
    pitch: String(pitch),
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="link" size="sm" className="h-auto px-0">
          <Eye className="h-4 w-4" />
          <Tx k="listing.see_street_view" source="See street view" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            <Tx k="listing.street_view" source="Street view" />
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <div className="overflow-hidden rounded-xl border">
            <iframe
              title={
                i18n.resolve(
                  "listing.street_view_selected_by_host",
                  "Street view selected by the host"
                ).text
              }
              className="h-[min(70vh,620px)] min-h-80 w-full"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              src={`https://www.google.com/maps/embed/v1/streetview?${params.toString()}`}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
