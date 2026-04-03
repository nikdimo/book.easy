"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PROPERTY_TYPES } from "@/lib/constants";

interface SearchFiltersProps {
  amenities: { id: string; name: string; category: string }[];
}

export function SearchFilters({ amenities }: SearchFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [city, setCity] = useState(searchParams.get("city") || "");
  const [guests, setGuests] = useState(searchParams.get("guests") || "");
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") || "");
  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") || "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") || "");
  const [propertyType, setPropertyType] = useState(searchParams.get("propertyType") || "");
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(
    searchParams.getAll("amenities")
  );

  function applyFilters() {
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (guests) params.set("guests", guests);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    if (propertyType) params.set("propertyType", propertyType);
    selectedAmenities.forEach((a) => params.append("amenities", a));

    startTransition(() => {
      router.push(`/properties?${params.toString()}`);
    });
  }

  function clearFilters() {
    setCity("");
    setGuests("");
    setMinPrice("");
    setMaxPrice("");
    setCheckIn("");
    setCheckOut("");
    setPropertyType("");
    setSelectedAmenities([]);
    startTransition(() => {
      router.push("/properties");
    });
  }

  function toggleAmenity(name: string) {
    setSelectedAmenities((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  const hasFilters = city || guests || minPrice || maxPrice || checkIn || checkOut || propertyType || selectedAmenities.length > 0;

  const filterContent = (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Location</Label>
        <Input placeholder="City or area" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Check-in</Label>
          <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Check-out</Label>
          <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Guests</Label>
        <Input type="number" min="1" placeholder="Number of guests" value={guests} onChange={(e) => setGuests(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Min price</Label>
          <Input type="number" min="0" placeholder="€0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Max price</Label>
          <Input type="number" min="0" placeholder="Any" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Property type</Label>
        <div className="grid grid-cols-2 gap-2">
          {PROPERTY_TYPES.map((type) => (
            <Button
              key={type.value}
              type="button"
              variant={propertyType === type.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPropertyType(propertyType === type.value ? "" : type.value)}
            >
              {type.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Amenities</Label>
        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
          {amenities.map((amenity) => (
            <label key={amenity.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={selectedAmenities.includes(amenity.name)}
                onCheckedChange={() => toggleAmenity(amenity.name)}
              />
              {amenity.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={applyFilters} className="flex-1" disabled={isPending}>
          <Search className="h-4 w-4 mr-2" />
          {isPending ? "Searching..." : "Apply Filters"}
        </Button>
        {hasFilters && (
          <Button variant="outline" onClick={clearFilters}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop filters */}
      <aside className="hidden lg:block w-72 shrink-0">
        <div className="sticky top-20 border rounded-lg p-4">
          <h3 className="font-semibold mb-4">Filters</h3>
          {filterContent}
        </div>
      </aside>

      {/* Mobile filter sheet */}
      <div className="lg:hidden mb-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filters
              {hasFilters && (
                <Badge className="ml-2">{[city, guests, minPrice, maxPrice, checkIn, checkOut, propertyType, ...selectedAmenities].filter(Boolean).length}</Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{filterContent}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center bg-primary text-primary-foreground text-xs font-medium rounded-full h-5 min-w-5 px-1.5 ${className}`}>
      {children}
    </span>
  );
}
