import { ImportListingForm } from "@/components/host/v2/listings/import-listing-form";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { getT, T } from "@/lib/i18n/t";

/**
 * Second screen of the new-listing flow, same field and same column as the first.
 *
 * Exit goes back one step rather than out to the panel: a host who picked "Import" and
 * changed their mind wants the two choices again, not their listings.
 */
export function NewListingImport({ t }: { t: Awaited<ReturnType<typeof getT>> }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-950">
      <NewListingHeader
        t={t}
        exitHref="/host/start"
        exitLabel={<T t={t} k="host.v2.import.back" source="Back" />}
      />
      <main className="flex flex-1 items-center px-5 pb-16 pt-6 md:px-8 md:pb-24">
        <div className="mx-auto w-full max-w-[30rem]">
          <h1 className="font-heading text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-950 sm:text-[2rem]">
            <T t={t} k="host.v2.import.heading" source="Import your listing" />
          </h1>
          <p className="mt-4 text-sm leading-[1.7] text-slate-500">
            <T
              t={t}
              k="host.v2.import.intro"
              source="Paste the link and we'll bring over the photos, description and amenities. You can edit everything before it goes live."
            />
          </p>
          <ImportListingForm />
        </div>
      </main>
    </div>
  );
}
