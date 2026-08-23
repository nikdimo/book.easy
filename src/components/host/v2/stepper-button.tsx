"use client";

import { cn } from "@/lib/utils";

/**
 * The one plus/minus button the host panel uses.
 *
 * Every counter in the new-listing flow used to draw its own: a filled circle on the
 * basics step, a bigger filled circle on the price step, a borderless one inside a
 * bordered pill on the house rules step, a rounded square in the calendar. Same control,
 * four looks. This is the single answer — a filled circle, 44px on a phone because these
 * are thumb-operated, tightened to 36px where there is a pointer.
 *
 * Disabled means "you are at the bound", so it stays visible and loses only its contrast
 * rather than fading out: the host needs to see the button that takes them back.
 */
export function StepperButton({
  label,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-800 md:size-9",
        "transition-colors duration-150 hover:bg-slate-200 motion-reduce:transition-none",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
        "disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-slate-100",
        className,
      )}
    >
      {children}
    </button>
  );
}
