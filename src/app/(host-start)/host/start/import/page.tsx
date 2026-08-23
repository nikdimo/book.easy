import { NewListingImport } from "@/components/host/v2/listings/new-listing-import";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";

export const metadata = { title: "Import your listing" };

export default async function NewListingImportPage() {
  const [, t] = await Promise.all([requireHostPage(), getT()]);
  return <NewListingImport t={t} />;
}
