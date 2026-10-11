import { useEffect } from 'react';

/** Closes a modal-like card on Escape; ignores IME composition. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
}
