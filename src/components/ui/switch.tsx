"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none",
        // "On" is the darker track, which is the one reading the panel already uses
        // for ink. A tinted track with a dark thumb was the old peach pairing; with
        // the tint gone it left "on" lighter than "off", which reads backwards.
        //
        // Dark grey rather than the near-black used for primary buttons: a switch is
        // a state, not an action, and a row of full-ink tracks pulled harder than the
        // one thing on the page that is actually asking to be pressed.
        "data-[state=checked]:bg-slate-700 data-[state=unchecked]:bg-slate-300",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 rounded-full shadow-sm ring-0 transition-[transform,background-color]",
          "bg-white",
          "data-[state=checked]:translate-x-[1.125rem] data-[state=unchecked]:translate-x-0.5"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
