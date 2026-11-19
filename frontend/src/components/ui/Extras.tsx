import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { FormProvider, type FieldValues, type UseFormReturn } from 'react-hook-form'
import { cn } from '@/lib/utils'

export function Calendar({ className, ...props }: DayPickerProps) {
  return <DayPicker className={cn('calendar-root', className)} {...props} />
}

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export function PopoverContent({ className, align = 'center', sideOffset = 5, ...props }: PopoverPrimitive.PopoverContentProps) {
  return <PopoverPrimitive.Portal><PopoverPrimitive.Content className={cn('popover-content', className)} align={align} sideOffset={sideOffset} {...props} /></PopoverPrimitive.Portal>
}

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export function SheetContent({ className, children, ...props }: DialogPrimitive.DialogContentProps) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay" />
    <DialogPrimitive.Content className={cn('sheet-content', className)} {...props}>{children}</DialogPrimitive.Content>
  </DialogPrimitive.Portal>
}
export const SheetTitle = DialogPrimitive.Title
export const SheetDescription = DialogPrimitive.Description

export const Tabs = TabsPrimitive.Root
export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps) {
  return <TabsPrimitive.List className={cn('tabs-list', className)} {...props} />
}
export function TabsTrigger({ className, ...props }: TabsPrimitive.TabsTriggerProps) {
  return <TabsPrimitive.Trigger className={cn('tabs-trigger', className)} {...props} />
}
export function TabsContent({ className, ...props }: TabsPrimitive.TabsContentProps) {
  return <TabsPrimitive.Content className={cn('tabs-content', className)} {...props} />
}

export function TooltipProvider(props: TooltipPrimitive.TooltipProviderProps) { return <TooltipPrimitive.Provider {...props} /> }
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger
export function TooltipContent({ className, sideOffset = 5, ...props }: TooltipPrimitive.TooltipContentProps) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content className={cn('tooltip-content', className)} sideOffset={sideOffset} {...props} /></TooltipPrimitive.Portal>
}

export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }: SeparatorPrimitive.SeparatorProps) {
  return <SeparatorPrimitive.Root className={cn('separator', `separator-${orientation}`, className)} orientation={orientation} decorative={decorative} {...props} />
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} aria-hidden="true" {...props} />
}

export function Form<T extends FieldValues>({ form, children }: { form: UseFormReturn<T>; children: React.ReactNode }) {
  return <FormProvider {...form}>{children}</FormProvider>
}
