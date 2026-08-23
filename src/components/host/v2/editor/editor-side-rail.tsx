import type { ReactNode } from "react";

/**
 * The shared editor rail used by dense workspaces such as Photos and Amenities.
 *
 * It owns the width, sticky position and independent overflow behavior. The contents stay
 * workspace-specific: photos needs drag targets and room actions, while amenities only
 * needs category filters.
 */
export function EditorSideRail({
  children,
  footer,
  label,
}: {
  children: ReactNode;
  footer?: ReactNode;
  label: string;
}) {
  return (
    <aside
      aria-label={label}
      className="sticky top-[3.75rem] hidden max-h-[calc(100dvh-9rem)] w-60 shrink-0 self-start border-l border-slate-100 pl-4 xl:flex xl:flex-col"
    >
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">{children}</ul>
      {footer}
    </aside>
  );
}

/** Keeps a rail's heading in the same sticky toolbar row as the workspace actions. */
export function EditorSideRailHeading({ children }: { children: ReactNode }) {
  return (
    <div className="hidden w-60 shrink-0 border-l border-slate-100 pl-4 xl:block">
      <h2 className="text-sm font-medium text-slate-900">{children}</h2>
    </div>
  );
}
