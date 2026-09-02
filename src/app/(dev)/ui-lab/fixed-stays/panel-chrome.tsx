import { cn } from "@/lib/utils";

/**
 * The small parts every screen of the editing panel is built from.
 *
 * All of them are the real panel's, restated here rather than invented: the band comes
 * from `manage-calendar-panel.tsx`, where one bordered strip states what the screen
 * below it is acting on and keeps the same box in the same place on the menu and on
 * every editor under it; the primary action is that panel's own full-width `#0f172a`
 * button; the section heading is the weight `SummaryRow` gives a menu row's label, so a
 * heading and a row read as the same size of thing.
 *
 * They live in their own file because the fixed-stay editor and the panel that hosts it
 * both need them, and a shared parent importing from its own child is how an import
 * cycle starts.
 */

/**
 * What this screen is acting on.
 *
 * The real panel names the selected dates here. Everything in this prototype is
 * listing-wide, so it names the listing's future instead — but it is the same strip in
 * the same position, so a host moving between the two halves of the panel is not asked
 * to look somewhere new for the answer.
 */
export function PanelBand({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <div className="mx-1 mb-2 flex items-center gap-2 rounded-[0.625rem] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <h3 className="text-[0.75rem] font-semibold text-slate-600">{title}</h3>
        <p className="mt-0.5 text-[0.6875rem] leading-4 text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

/** A block inside a focused editor: a heading, an optional fact beside it, its content. */
export function PanelSection({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id={id} className="text-[0.875rem] font-semibold text-slate-900">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The panel's one strong control, full width because the column is 23rem wide. */
export const PRIMARY_BUTTON = cn(
  "min-h-11 w-full bg-[#0f172a] text-white hover:bg-[#1e293b]",
  "disabled:bg-slate-100 disabled:text-slate-400",
);

/** Beside it, or under it: the way out of a step, never the way through one. */
export const QUIET_BUTTON =
  "min-h-11 w-full text-[0.875rem] font-semibold text-slate-600 hover:bg-slate-50";

/** The one line a host is owed when the panel refuses. Always mounted, so it has
 *  somewhere to announce into rather than being created with something to say. */
export function PanelAlert({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className="text-[0.8125rem] leading-5 text-rose-600 empty:hidden"
    >
      {children}
    </p>
  );
}

/** A fact the panel states but this prototype does not let anyone change. */
export function PrototypeNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-slate-100 pt-2 text-[0.75rem] leading-4 text-slate-400">
      {children}
    </p>
  );
}

/** A read-only listing default, in the shape the real panel reports one. */
export function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="min-w-0 flex-1 text-[0.75rem] text-slate-500">{label}</dt>
      <dd className="shrink-0 text-right text-[0.8125rem] font-medium text-slate-900">
        {value}
      </dd>
    </div>
  );
}
