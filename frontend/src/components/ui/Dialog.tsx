import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close
export function DialogContent({ children, className, ...props }: RadixDialog.DialogContentProps) {
  return <RadixDialog.Portal><RadixDialog.Overlay className="dialog-overlay" />
    <RadixDialog.Content className={cn('dialog-content', className)} {...props}>
      {children}
      <RadixDialog.Close className="dialog-close" aria-label="Close dialog"><X size={16} /></RadixDialog.Close>
    </RadixDialog.Content>
  </RadixDialog.Portal>
}
export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('dialog-header', className)} {...props} />
}
export function DialogTitle({ className, ...props }: RadixDialog.DialogTitleProps) {
  return <RadixDialog.Title className={cn('dialog-title', className)} {...props} />
}
export function DialogDescription({ className, ...props }: RadixDialog.DialogDescriptionProps) {
  return <RadixDialog.Description className={cn('dialog-description', className)} {...props} />
}
export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('dialog-footer', className)}>{children}</div>
}
