import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-ink placeholder:text-soft border-control h-9 w-full min-w-0 rounded-input border bg-card px-3 py-1 text-body transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-small file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent",
        "aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
