import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { AppScreen, EmptyNotice, LoadingState } from "@/components/ui";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { AvailabilityResponse, apiFetch } from "@/lib/api";
import { useApiError } from "@/lib/use-api-error";

export default function AvailabilityScreen() {
  const describeError = useApiError();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setData(
        await apiFetch<AvailabilityResponse>(
          `/api/mobile/v1/listings/${id}/availability`
        )
      );
    } catch (caught) {
      setError(describeError(caught, "Could not load calendar"));
    }
  }, [describeError, id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <AppScreen
      eyebrow=""
      title="Availability & pricing"
      subtitle={
        data?.listing.title ??
        "Select a date range, then apply availability or pricing actions."
      }
      onRefresh={load}
    >
      {!data && !error ? <LoadingState /> : null}
      {error ? (
        <EmptyNotice title="Calendar unavailable" description={error} onRetry={load} />
      ) : null}
      {data && data.listing.baseNightlyRate == null ? (
        <EmptyNotice
          title="Listing pricing is missing"
          description="Add pricing on the listing edit page before managing the calendar."
        />
      ) : null}
      {data?.listing.baseNightlyRate != null && id ? (
        <AvailabilityCalendar data={data} listingId={id} reload={load} />
      ) : null}
    </AppScreen>
  );
}
