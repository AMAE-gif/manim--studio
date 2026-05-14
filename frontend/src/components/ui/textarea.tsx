import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[14px] leading-relaxed transition-all duration-200 ease-out outline-none placeholder:text-white/25 focus:border-white/[0.15] focus:bg-white/[0.05] focus:ring-2 focus:ring-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive/50 aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-[14px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
