import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-body font-semibold transition-all active:scale-[.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 aria-invalid:border-danger",
  {
    variants: {
      variant: {
        // 채운 버튼은 이것 하나뿐입니다 (brand/DESIGN.md).
        default: "bg-accent text-white hover:bg-accent-hover",
        // 위험한 버튼은 채우지 않습니다.
        destructive:
          "border border-danger bg-card text-danger hover:bg-danger-wash",
        outline:
          "border border-hairline bg-card text-ink hover:bg-wash hover:border-ring",
        secondary:
          "bg-surface-hover text-ink hover:bg-line",
        ghost:
          "text-soft hover:bg-surface-hover hover:text-ink",
        link: "text-accent underline-offset-4 hover:underline hover:text-accent-ink",
      },
      size: {
        default: "h-[38px] px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 text-small gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
