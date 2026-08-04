"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        // A 10% scrim left the page reading as still-interactive, so the panel never
        // looked like it sat above anything. A third of black plus a light blur
        // pushes the page back without hiding the context behind the dialog.
        "fixed inset-0 isolate z-50 bg-black/35 duration-200 supports-backdrop-filter:backdrop-blur-[3px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

// A centered modal is the wrong shape for a thumb: it floats mid-screen, away from
// where the hand is, and a tall one fights the keyboard. `variant="sheet"` pins the
// content to the bottom edge below `md` — full width, rounded top, safe-area padded,
// sliding up rather than zooming — and reverts to the centered dialog from `md` up.
// Every edge inset is driven by `--dialog-inset` / `--dialog-pb` so the footer, which
// bleeds to the panel edges, can cancel the padding without hardcoding it — and so the
// bottom sheet can fold the home-indicator inset into the same value and still end up
// with a footer band that reaches the true bottom edge.
const DIALOG_BASE = [
  "fixed z-50 grid gap-4 bg-popover text-sm text-popover-foreground outline-none",
  "[--dialog-inset:1.25rem] [--dialog-pb:var(--dialog-inset)]",
  "p-[var(--dialog-inset)] pb-[var(--dialog-pb)]",
  // A hairline ring alone reads flat against a blurred page; the two-layer shadow
  // gives the panel a contact shadow plus a wide ambient one, so it lifts.
  "ring-1 ring-foreground/10",
  "shadow-[0_1.5rem_4rem_-1rem_rgb(0_0_0/0.3),0_0.5rem_1.5rem_-0.75rem_rgb(0_0_0/0.15)]",
  "duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
].join(" ")

const DIALOG_CENTERED = [
  "top-1/2 left-1/2 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl",
  "sm:max-w-sm sm:[--dialog-inset:1.5rem]",
  "data-open:zoom-in-95 data-open:slide-in-from-bottom-1 data-closed:zoom-out-95",
].join(" ")

const DIALOG_SHEET = [
  // Mobile: bottom sheet.
  "inset-x-0 bottom-0 top-auto max-h-[90dvh] w-full rounded-t-2xl rounded-b-none",
  "[--dialog-pb:calc(var(--dialog-inset)_+_env(safe-area-inset-bottom))]",
  "data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
  // Desktop: the centered dialog again. The max-width cap is not optional — without
  // one `w-full` stretches the panel to the whole viewport, which is what a sheet
  // means on a phone and nothing anyone wants on a monitor.
  "md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:max-h-none md:w-[calc(100vw-2rem)] md:max-w-md",
  "md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl",
  "md:[--dialog-inset:1.5rem] md:[--dialog-pb:var(--dialog-inset)]",
  "md:data-open:zoom-in-95 md:data-open:slide-in-from-bottom-1 md:data-closed:zoom-out-95",
].join(" ")

function DialogContent({
  className,
  children,
  showCloseButton = true,
  variant = "dialog",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  variant?: "dialog" | "sheet"
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(
          DIALOG_BASE,
          variant === "sheet" ? DIALOG_SHEET : DIALOG_CENTERED,
          className
        )}
        {...props}
      >
        {/* The grabber is the one affordance that tells a phone user the panel is a
            sheet they can dismiss downward. Absolute so it lives in the top padding
            instead of taking a grid row and pushing every sheet's content down. */}
        {variant === "sheet" && (
          <span
            aria-hidden
            className="absolute inset-x-0 top-2 mx-auto h-1 w-9 rounded-full bg-foreground/15 md:hidden"
          />
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2.5 right-2.5 z-10 rounded-full text-muted-foreground hover:text-foreground"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // Bleeds to the panel edges by cancelling the content padding, so the band
        // and its border read as part of the panel rather than a boxed-in strip.
        // `inherit` on the corners keeps it square under a bottom sheet and rounded
        // under a centered dialog without either shape knowing about the other.
        "-mx-[var(--dialog-inset)] -mb-[var(--dialog-pb)]",
        "px-[var(--dialog-inset)] pt-[var(--dialog-inset)] pb-[var(--dialog-pb)]",
        "flex flex-col-reverse gap-2 rounded-b-[inherit] border-t bg-muted/40",
        "sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        // `leading-none` collided with itself the moment a title wrapped to two
        // lines, which every translated title eventually does.
        "font-heading text-base leading-snug font-semibold tracking-tight text-balance",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm leading-relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
