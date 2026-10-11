import { useSyncExternalStore } from 'react';
let settings = { muted: false, music: 1, speakers: 1 };
const listeners = new Set<() => void>();
export function updateAudioSettings(next: Partial<typeof settings>) {
  settings = { ...settings, ...next };
  listeners.forEach((listener) => listener());
}
export function useAudioSettings() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => settings);
}
