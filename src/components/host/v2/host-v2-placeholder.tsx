import Link from "next/link";
import { ArrowRight, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getT, T } from "@/lib/i18n/t";

export async function HostV2Placeholder({
  surface,
  currentHref,
}: {
  surface: "calendar" | "listings" | "reservations";
  currentHref: string;
}) {
  const t = await getT();
  const copy = (() => {
    switch (surface) {
      case "calendar":
        return {
          title: t.resolve("host.v2.calendar.title", "Calendar workbench"),
          description: t.resolve(
            "host.v2.calendar.description",
            "This will become the full-width operational calendar with a compact editing workbench above the selected dates. The current calendar remains available while we build and compare it.",
          ),
        };
      case "listings":
        return {
          title: t.resolve("host.v2.listings.title", "Listings and launch review"),
          description: t.resolve(
            "host.v2.listings.description",
            "This is the first surface we will redesign: compact listing truth, guided editing, live guest preview, and a final launch review that explains exactly what guests can see and book.",
          ),
        };
      case "reservations":
        return {
          title: t.resolve("host.v2.reservations.title", "Reservations"),
          description: t.resolve(
            "host.v2.reservations.description",
            "The new reservations surface will prioritize past, today, and upcoming stays with compact filters and clear actions instead of oversized empty states.",
          ),
        };
    }
  })();

  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
      <div className="mb-6 grid size-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
        <Construction className="size-6" aria-hidden />
      </div>
      <p className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-[#a94420]">
        <T t={t} k="host.v2.preview_label" source="New panel preview" />
      </p>
      <h1 className="font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-tight">
        <span className={copy.title.translated ? "notranslate" : undefined}>
          {copy.title.text}
        </span>
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
        <span className={copy.description.translated ? "notranslate" : undefined}>
          {copy.description.text}
        </span>
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild className="rounded-full">
          <Link href={currentHref}>
            <T
              t={t}
              k="host.v2.open_current_surface"
              source="Open this in the current panel"
            />
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button variant="outline" asChild className="rounded-full">
          <Link href="/host/v2">
            <T t={t} k="host.v2.back_today" source="Back to Today" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
