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
        // The Listings add button established peach as the quiet active surface. The
        // orange thumb carries the state, so "on" is clear without turning every row
        // into a saturated orange alert.
        "data-[state=checked]:bg-[#fde7dc] data-[state=unchecked]:bg-slate-300",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9774f]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 rounded-full shadow-sm ring-0 transition-[transform,background-color]",
          "data-[state=checked]:bg-[#d9774f] data-[state=unchecked]:bg-white",
          "data-[state=checked]:translate-x-[1.125rem] data-[state=unchecked]:translate-x-0.5"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
