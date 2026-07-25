export function getMapCoordinatesForListing(listing: {
  property: {
    latitude?: number | null;
    longitude?: number | null;
  };
}): { lat: number; lng: number } | null {
  const { latitude: lat, longitude: lng } = listing.property;
  if (
    lat == null ||
    lng == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  return { lat, lng };
}
