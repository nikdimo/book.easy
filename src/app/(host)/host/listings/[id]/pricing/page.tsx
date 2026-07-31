import { CalendarLensPage } from "../_calendar/lens-page";

export const metadata = { title: "Pricing" };

export default async function PricingPage({
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
      lens="pricing"
    />
  );
}
