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
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
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
const DIALOG_BASE =
  "fixed z-50 grid gap-4 bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"

const DIALOG_CENTERED =
  "top-1/2 left-1/2 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 sm:max-w-sm data-open:zoom-in-95 data-closed:zoom-out-95"

const DIALOG_SHEET = [
  // Mobile: bottom sheet.
  "inset-x-0 bottom-0 top-auto max-h-[90dvh] w-full rounded-t-2xl rounded-b-none p-4",
  "pb-[calc(1rem+env(safe-area-inset-bottom))]",
  "data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
  // Desktop: the centered dialog again.
  "md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:max-h-none md:max-w-[calc(100%-2rem)]",
  "md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:pb-4",
  "md:data-open:zoom-in-95 md:data-closed:zoom-out-95",
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
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon
              />
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
      className={cn("flex flex-col gap-2", className)}
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
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
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
        "font-heading text-base leading-none font-medium",
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
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
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
