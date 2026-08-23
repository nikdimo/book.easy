import { AddressStep } from "@/components/host/v2/listings/address-step";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";

export const metadata = { title: "Confirm your address" };

export default async function AddressPage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t] = await Promise.all([searchParams, requireHostPage(), getT()]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  const initialAddress = Array.isArray(params.address) ? params.address[0] : params.address;
  return <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950 md:h-dvh md:overflow-hidden"><NewListingHeader t={t} exitHref="/host/listings" /><AddressStep propertyType={propertyType} spaceType={spaceType} initialAddress={initialAddress} /></div>;
}
