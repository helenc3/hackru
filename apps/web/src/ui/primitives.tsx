import { Button as RadixButton, IconButton as RadixIconButton, Theme, type ButtonProps } from '@radix-ui/themes';
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

/** Radix controls keep the game's existing visual classes and native form semantics. */
export function Button({ className = 'button secondary', type = 'button', ...props }: ButtonProps) {
  const Control = className.includes('icon-button') ? RadixIconButton : RadixButton;
  return <Control className={className} type={type} {...props} />;
}
export function GameDialog({ children, onClose, onEscape, label, dismissible = true }: { children: ReactNode; label?: string; onClose?: () => void; onEscape?: (event: KeyboardEvent) => void; dismissible?: boolean }) {
  return <Dialog.Root open modal={false} onOpenChange={(open) => { if (!open && dismissible) onClose?.(); }}><Dialog.Portal><Theme asChild><Dialog.Content asChild aria-describedby={undefined} {...(label ? { 'aria-labelledby': undefined, 'aria-label': label } : {})}
    onEscapeKeyDown={(event) => { if (!dismissible || event.isComposing) event.preventDefault(); onEscape?.(event); }}
    onInteractOutside={(event) => event.preventDefault()}
    onCloseAutoFocus={(event) => { event.preventDefault(); document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus(); }}>
    {children}
  </Dialog.Content></Theme></Dialog.Portal></Dialog.Root>;
}
export { Card, Badge, TextArea, TextField, RadioGroup, Select, Theme } from '@radix-ui/themes';
export { Dialog };
