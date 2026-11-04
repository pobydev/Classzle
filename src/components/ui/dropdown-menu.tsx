"use client"

import * as React from "react"
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu"

import { Check } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

const DropdownMenu = MenuPrimitive.Root
const DropdownMenuTrigger = MenuPrimitive.Trigger

function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="dropdown-menu-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          "z-50 min-w-[200px] rounded-card border border-line bg-card p-1 text-body text-ink shadow-lift outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  danger = false,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-input px-2.5 py-2 text-small outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        danger
          ? "text-danger data-[highlighted]:bg-danger-wash"
          : "text-ink data-[highlighted]:bg-wash",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn("px-2.5 pt-2 pb-1 text-caption font-semibold text-soft", className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("my-1 h-px bg-line", className)} {...props} />
}

const ITEM = "relative flex cursor-pointer items-center gap-2 rounded-input py-2 pr-2.5 pl-8 text-small text-ink outline-none select-none data-[highlighted]:bg-wash data-[disabled]:pointer-events-none data-[disabled]:opacity-50"

function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(ITEM, className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator><Check size={14} weight="bold" className="text-accent" /></MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup

function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(ITEM, className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator><span className="size-2 rounded-full bg-accent" /></MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

export {
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
}
