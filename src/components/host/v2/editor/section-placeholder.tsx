import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { T, type Translator } from "@/lib/i18n/t";

export function SectionPlaceholder({
  listingId,
  label,
  t,
  handoff,
  destination = "classic",
}: {
  listingId: string;
  label: string;
  t: Translator;
  handoff?: string;
  destination?: "classic" | "calendar";
}) {
  const opensCalendar = destination === "calendar";

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="max-w-sm text-center">
        <h2 className="text-lg font-medium text-slate-900">{label}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {handoff ?? <T t={t} k="host.editor.section_pending" source="This section is moving into the new editor. For now you can still edit it in the classic listing editor." />}
        </p>
        <Link
          href={
            opensCalendar
              ? `/host/v2/calendar?listing=${encodeURIComponent(listingId)}`
              : `/host/listings/${listingId}/edit`
          }
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#fde7dc] px-5 text-sm font-semibold text-[#8f3d21] transition-colors hover:bg-[#f9d7c6] focus-visible:bg-[#f9d7c6] focus-visible:outline-none"
        >
          {opensCalendar ? (
            <T t={t} k="host.editor.open_calendar_cta" source="Open Calendar" />
          ) : (
            <T t={t} k="host.editor.open_classic_cta" source="Open the classic editor" />
          )}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
