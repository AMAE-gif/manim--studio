import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[13px] transition-all duration-200 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-white/20 focus-visible:border-white/[0.12] focus-visible:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-white/[0.04] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-[13px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
