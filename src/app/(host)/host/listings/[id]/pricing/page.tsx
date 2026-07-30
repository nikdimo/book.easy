import { redirect } from "next/navigation";

export default async function PricingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/host/listings/${id}/availability`);
}
