import { CalendarLensPage } from "../_calendar/lens-page";

export const metadata = { title: "Availability" };

export default async function AvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <CalendarLensPage
      params={params}
      searchParams={searchParams}
      lens="availability"
    />
  );
}
