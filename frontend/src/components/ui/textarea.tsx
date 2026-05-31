import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[13px] leading-relaxed transition-all duration-200 ease-out outline-none placeholder:text-white/20 focus:border-white/[0.12] focus:bg-white/[0.03] focus:ring-2 focus:ring-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive/50 aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-[13px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
