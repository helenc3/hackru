/** Returns keyboard focus to the world canvas after a panel closes (next frame, once the panel has unmounted). */
export const focusWorld = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus());
