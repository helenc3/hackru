import { useEffect, useState } from 'react';
import { DataTexture, NearestFilter, RedFormat } from 'three';
import { testProfile } from './test-profile';
import { Outlines } from '@react-three/drei';

/** Shared "Toon Spike × Powerpuff × Genshin" look: ink outlines, 3-step cel ramp, candy palette. */
export const INK = '#2a1838';
export const candy = {
  ink: INK, inkSoft: '#4b3561', lavender: '#c9b8ff', peach: '#ffd1a8', sky: '#8fd3ff',
  sand: '#f7e3b5', paving: '#f2c99a', grass: '#9fe07a', grassDeep: '#6cc24a',
  coral: '#ff8a65', raspberry: '#d94f6b', plum: '#7a2e4a', lemon: '#ffd166', mint: '#8fd6c1', teal: '#3fa7d6',
  lantern: '#ff4d5e', blossom: '#ffb3d9', osmanthus: '#ffd97a', bark: '#8b5a3c', cream: '#fff6e8',
  skin: '#ffe0bd', skinWarm: '#f6c9a0', lime: '#7ed957', navy: '#3b5bdb', mustard: '#e0a93a', silver: '#d9d4e7',
} as const;

// Three hard steps: deep shadow, mid tone, lit. Nearest filtering keeps the bands crisp.
let ramp: DataTexture | undefined;
export function gradientMap(): DataTexture {
  if (!ramp) {
    ramp = new DataTexture(new Uint8Array([70, 160, 255]), 3, 1, RedFormat);
    ramp.minFilter = ramp.magFilter = NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}

/**
 * Cel material plus inverted-hull ink outline. Use as the material slot of a mesh:
 * `<mesh><boxGeometry /><Toon color={candy.coral} /></mesh>`.
 * `thickness` is in screen pixels (drei's default, non-screenspace path), so lines stay
 * constant-width at any camera distance. Set `outline={false}` for flat ground planes.
 */
export function Toon({ color, outline = true, thickness = 2.4, emissive, emissiveIntensity = 0, transparent, opacity }: {
  color: string; outline?: boolean; thickness?: number; emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number;
}) {
  return <>
    <meshToonMaterial color={color} gradientMap={gradientMap()} emissive={emissive ?? '#000000'} emissiveIntensity={emissiveIntensity} transparent={transparent} opacity={opacity} />
    {outline && !testProfile().lightweight && <Outlines color={INK} thickness={thickness} />}
  </>;
}

/** True when the OS asks for reduced motion; bobbing, sparkles and UI bounce switch off. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced || testProfile().lightweight;
}
