import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, SRGBColorSpace, WebGLRenderTarget, type Group } from 'three';
import { VISIBLE_RADIUS_CHUNKS, chunkOf, chunkOrigin, type ChunkManifest, type Position } from '@vibequest/shared';
import { ChunkRenderer } from './ChunkRenderer';
import type { CityHandle } from './use-city';
import { candy, Toon, useReducedMotion } from '../world/toon';
import { Sky } from '../world/decor';
import { ClearView } from '../world/ClearView';
import { digestHex, registerCapture } from '../world/photo-capture';
import type { Runtime } from '../world/runtime';

/** Meshes beyond this Chebyshev chunk radius unload; their manifests stay in the city store. */
export const MESH_RADIUS_CHUNKS = 2;
const LOD_STEP = 4;

/** Sky dome and a mist floor follow the player so the streamed city never shows the void. */
function Surroundings({ runtime }: { runtime: React.RefObject<Runtime> }) {
  const group = useRef<Group>(null);
  useFrame(() => { const p = runtime.current.position; group.current?.position.set(p.x, 0, p.z); });
  return <group ref={group}>
    <group scale={2}><Sky /></group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.06, 0]}><planeGeometry args={[400, 400]} /><Toon color="#e9d6c0" outline={false} /></mesh>
  </group>;
}

/** Nearest point on any water rect (rivers preferred) to `spot`, in world coordinates. */
export function nearestWater(manifests: Iterable<ChunkManifest>, spot: Position): Position | null {
  let best: { point: Position; score: number } | null = null;
  for (const manifest of manifests) {
    const origin = chunkOrigin(manifest.coord);
    for (const water of manifest.water) {
      const point = { x: Math.max(origin.x + water.rect.minX, Math.min(spot.x, origin.x + water.rect.maxX)), z: Math.max(origin.z + water.rect.minZ, Math.min(spot.z, origin.z + water.rect.maxZ)) };
      const score = Math.hypot(point.x - spot.x, point.z - spot.z) * (water.kind === 'river' ? 1 : 1.5);
      if (!best || score < best.score) best = { point, score };
    }
  }
  return best?.point ?? null;
}

/** Registers the NPC-triggered photo: a second camera frames the player with the water behind them. */
function PhotoCamera({ city }: { city: CityHandle }) {
  const { gl, scene } = useThree();
  const manifests = useRef(city.manifests);
  manifests.current = city.manifests;
  useEffect(() => {
    registerCapture(async (spot, viewpoint) => {
      const water = nearestWater(manifests.current.values(), spot) ?? viewpoint;
      const length = Math.hypot(water.x - spot.x, water.z - spot.z) || 1;
      const dir = { x: (water.x - spot.x) / length, z: (water.z - spot.z) / length };
      const width = 800, height = 500;
      const camera = new PerspectiveCamera(50, width / height, .1, 200);
      camera.position.set(spot.x - dir.x * 5, 1.8, spot.z - dir.z * 5);
      camera.lookAt(spot.x + dir.x * 3, 1.3, spot.z + dir.z * 3);
      camera.updateMatrixWorld();
      const target = new WebGLRenderTarget(width, height);
      target.texture.colorSpace = SRGBColorSpace;
      const pixels = new Uint8Array(width * height * 4);
      try {
        gl.setRenderTarget(target);
        gl.render(scene, camera);
        gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      } finally { gl.setRenderTarget(null); target.dispose(); }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const image = new ImageData(width, height);
      for (let row = 0; row < height; row++) image.data.set(pixels.subarray((height - 1 - row) * width * 4, (height - row) * width * 4), row * width * 4); // GL rows are bottom-up
      canvas.getContext('2d')!.putImageData(image, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', .85);
      return { dataUrl, digest: await digestHex(dataUrl) };
    });
    return () => registerCapture(null);
  }, [gl, scene]);
  return null;
}

/** The streamed city: committed manifests within the mesh radius of `position`; the visible 3 × 3 in full. */
export function CityScene({ city, runtime, position }: { city: CityHandle; runtime: React.RefObject<Runtime>; position: Position }) {
  const still = useReducedMotion();
  const centreChunk = chunkOf(position);
  const qx = Math.round(position.x / LOD_STEP) * LOD_STEP, qz = Math.round(position.z / LOD_STEP) * LOD_STEP;
  const centre = useMemo(() => ({ x: qx, z: qz }), [qx, qz]);
  const shown = [...city.manifests.values()].flatMap((manifest) => {
    const ring = Math.max(Math.abs(manifest.coord.cx - centreChunk.cx), Math.abs(manifest.coord.cz - centreChunk.cz));
    return ring <= MESH_RADIUS_CHUNKS ? [{ manifest, far: ring > VISIBLE_RADIUS_CHUNKS }] : [];
  });
  return <>
    <color attach="background" args={[candy.peach]} />
    <fog attach="fog" args={['#ffd9c2', 45, 110]} />
    <Surroundings runtime={runtime} />
    {/* Toon rim approximation: warm key, cool lavender fill on shadow sides, soft sky/ground bounce. */}
    <ambientLight intensity={.3} />
    <hemisphereLight args={[candy.lavender, candy.peach, .65]} />
    <directionalLight position={[12, 24, 14]} intensity={2.4} color="#fff1dc" />
    <directionalLight position={[-14, 10, -10]} intensity={.55} color={candy.lavender} />
    <ClearView runtime={runtime}>
      {shown.map(({ manifest, far }) => <ChunkRenderer key={`${manifest.worldId}|${manifest.coord.cx},${manifest.coord.cz}`} manifest={manifest} centre={centre} far={far} still={still} />)}
    </ClearView>
    <PhotoCamera city={city} />
  </>;
}
