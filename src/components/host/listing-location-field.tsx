"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { parseCoordsFromMapsText } from "@/lib/utils/parse-maps-link";
import { resolveMapsLink } from "@/lib/actions/listing.actions";

const ListingLocationPickerInner = dynamic(
  () => import("./listing-location-picker-inner"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] w-full animate-pulse rounded-lg bg-muted" />
    ),
  }
);

const DEFAULT_CENTER: [number, number] = [41.6086, 21.7453]; // Skopje

export function ListingLocationField({
  initialLat,
  initialLng,
}: {
  initialLat?: number | null;
  initialLng?: number | null;
}) {
  const [lat, setLat] = React.useState(initialLat ?? DEFAULT_CENTER[0]);
  const [lng, setLng] = React.useState(initialLng ?? DEFAULT_CENTER[1]);
  const [hasPin, setHasPin] = React.useState(
    initialLat != null && initialLng != null
  );
  const [linkValue, setLinkValue] = React.useState("");
  const [resolving, setResolving] = React.useState(false);

  function setPosition(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    setHasPin(true);
  }

  async function applyLink() {
    const text = linkValue.trim();
    if (!text) return;

    const direct = parseCoordsFromMapsText(text);
    if (direct) {
      setPosition(direct.lat, direct.lng);
      toast.success("Pin updated from link");
      return;
    }

    setResolving(true);
    try {
      const result = await resolveMapsLink(text);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setPosition(result.lat, result.lng);
      toast.success("Pin updated from link");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="maps-link">Google Maps link (optional)</Label>
        <div className="flex gap-2">
          <Input
            id="maps-link"
            placeholder="Paste a Google Maps link or 'lat, lng'"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void applyLink();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={() => void applyLink()} disabled={resolving}>
            {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use link"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Or click the map to drop a pin, or drag the pin to fine-tune it.
        </p>
      </div>

      <ListingLocationPickerInner lat={lat} lng={lng} onChange={setPosition} />

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        {hasPin ? (
          <span>
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </span>
        ) : (
          <span>No pin set yet — defaults to the city center.</span>
        )}
      </div>

      {hasPin && (
        <>
          <input type="hidden" name="latitude" value={lat} />
          <input type="hidden" name="longitude" value={lng} />
        </>
      )}
    </div>
  );
}
