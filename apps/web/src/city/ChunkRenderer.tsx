import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Color, Matrix4, Mesh, Object3D, type Group, type InstancedMesh, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { catalogEntry, chunkOrigin, resolveParams, type CatalogEntry, type ChunkManifest, type DistrictKind, type ParamValues, type Placement, type Position, type Road } from '@vibequest/shared';
import { ASSET_COMPONENTS } from './assets';
import { candy, SceneryOutlines, Toon } from '../world/toon';

/** Distance bands (m) for detail levels; beyond FAR only instanced proxies remain. */
export const LOD_NEAR = 18;
export const LOD_FAR = 40;
const DEG = Math.PI / 180;

export const districtGround: Record<DistrictKind, string> = {
  shopping: '#f2d2a6', historic: '#e9c9a4', residential: '#e6dcc4', office: '#d9dbe3', waterfront: '#efe0bf', park: candy.grass, industrial: '#cfc8bd',
};
const roadColor: Record<Road['kind'], string> = { avenue: '#7d7a8c', street: '#938fa0', lane: '#d8bf9a', promenade: '#ead6ad' };
const proxyColor: Record<CatalogEntry['category'], string> = { building: '#d9b8a0', storefront: '#d9b8a0', street: '#8a8698', landscape: candy.grassDeep, waterfront: '#b9c6cc', anchor: candy.coral };

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Neutral stand-in for an asset ID whose component is not authored yet. */
function MissingAsset({ size }: { size: { w: number; d: number; h: number } }) {
  return <mesh position={[0, size.h / 2, 0]}><boxGeometry args={[size.w, size.h, size.d]} /><Toon color="#c8c3d4" thickness={1.5} /></mesh>;
}

type Resolved = { placement: Placement; entry: CatalogEntry | undefined; params: ParamValues; size: { w: number; d: number; h: number } };
function resolve(placement: Placement): Resolved {
  const entry = catalogEntry(placement.assetId);
  try {
    if (!entry) throw new Error('unknown');
    const params = resolveParams(entry, placement.params);
    return { placement, entry, params, size: entry.footprint(params) };
  } catch { return { placement, entry: undefined, params: {}, size: { w: 1, d: 1, h: 1 } }; }
}

function Asset({ item, children, lod, still }: { item: Resolved; children?: React.ReactNode; lod: 0 | 1 | 2; still: boolean }) {
  const Component = item.entry ? ASSET_COMPONENTS[item.entry.id] : undefined;
  return <>
    {Component ? <Component params={item.params} still={still} lod={lod} seed={seedOf(item.placement.id)} /> : <MissingAsset size={item.size} />}
    {children}
  </>;
}

/** Placements attached to a parent socket render inside the parent's transform at the socket pose. */
function Attached({ item, byParent, lod, still }: { item: Resolved; byParent: Map<string, Resolved[]>; lod: 0 | 1 | 2; still: boolean }) {
  const sockets = item.entry ? item.entry.sockets(item.params) : [];
  // Preserve the character, without forcing its building or vendor stand to full detail.
  const assetLod = item.entry?.id.startsWith('an.npc.') ? 0 : lod;
  return <SceneryOutlines.Provider value={assetLod === 0}><Asset item={item} lod={assetLod} still={still}>
    {(byParent.get(item.placement.id) ?? []).map((child) => {
      const socket = sockets.find((entry) => entry.id === child.placement.attachTo!.socketId);
      if (!socket) return null;
      return <group key={child.placement.id} position={[socket.x, socket.y, socket.z]} rotation={[0, socket.facing * DEG, 0]}>
        <Attached item={child} byParent={byParent} lod={lod} still={still} />
      </group>;
    })}
  </Asset></SceneryOutlines.Provider>;
}

// ---------------------------------------------------------------- static batching
// Every toon mesh costs two draws (surface + ink hull). After mount, static meshes under a batch root
// are merged per material: toon surfaces share one vertex-coloured mesh, hulls merge per thickness,
// textured signs per texture. Sources move to an unrendered layer (children keep rendering), so
// unmount/rebuild restores them. Transparent materials (glass, neon flicker, fades in progress) stay
// separate. A node with userData.batch === 'self' animates as a unit: its subtree batches into itself.
const HIDDEN_LAYER = 31;
/** Batches split into square cells (m) so frustum culling still drops what the camera can't see. */
const BATCH_CELL = 20;
type Bucket = { material: Material; colour: boolean; uv: boolean; parts: BufferGeometry[]; sources: Mesh[]; renderOrder: number };

function bucketKey(material: Material): { key: string; colour: boolean; uv: boolean } | null {
  const m = material as Material & { color?: Color; emissive?: Color; emissiveIntensity?: number; map?: { uuid: string } | null; gradientMap?: { uuid: string } | null; uniforms?: Record<string, { value: unknown }>; isShaderMaterial?: boolean; isMeshToonMaterial?: boolean; toneMapped?: boolean };
  if (m.transparent || m.vertexColors) return null;
  if (m.isShaderMaterial) return m.uniforms?.thickness ? { key: `hull|${m.uniforms.thickness.value}|${(m.uniforms.color!.value as Color).getHexString()}|${m.side}`, colour: false, uv: false } : null;
  if (m.map) return { key: `tex|${m.type}|${m.map.uuid}|${m.color?.getHexString()}|${m.side}|${m.toneMapped}`, colour: false, uv: true };
  if (m.isMeshToonMaterial) return { key: `toon|${m.emissive?.getHexString()}|${m.emissiveIntensity}|${m.side}|${m.gradientMap?.uuid}`, colour: true, uv: false };
  return null;
}

function prepare(mesh: Mesh, matrix: Matrix4, bucket: Bucket): BufferGeometry | null {
  const source = mesh.geometry;
  const position = source.getAttribute('position');
  if (!position || (bucket.uv && !source.getAttribute('uv'))) return null;
  const part = new BufferGeometry();
  part.setAttribute('position', position.clone());
  if (source.getAttribute('normal')) part.setAttribute('normal', source.getAttribute('normal').clone()); else part.computeVertexNormals();
  if (bucket.uv) part.setAttribute('uv', source.getAttribute('uv').clone());
  if (bucket.colour) {
    const { r, g, b } = (mesh.material as Material & { color: Color }).color;
    const colours = new Float32Array(position.count * 3);
    for (let i = 0; i < colours.length; i += 3) { colours[i] = r; colours[i + 1] = g; colours[i + 2] = b; }
    part.setAttribute('color', new BufferAttribute(colours, 3));
  }
  // Merging needs every part indexed; keep shared vertices rather than expanding triangles.
  const index = source.index ? Array.from(source.index.array) : Array.from({ length: position.count }, (_, i) => i);
  // A mirrored transform flips winding; swap two corners per triangle so culling still matches.
  if (matrix.determinant() < 0) for (let t = 0; t + 2 < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2]!, index[t + 1]!];
  part.setIndex(index);
  part.applyMatrix4(matrix);
  return part;
}

/** Merge static meshes under `root` into it; returns the undo. */
function bake(root: Object3D): () => void {
  root.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  const undo: (() => void)[] = [];
  const visit = (node: Object3D) => {
    if (!node.visible) return;
    if (node !== root && node.userData.batch === 'self') { undo.push(bake(node)); return; }
    const mesh = node as Mesh;
    if (node !== root && mesh.isMesh && !(mesh as InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material) && !mesh.morphTargetInfluences?.length && !node.userData.batched) {
      const kind = bucketKey(mesh.material);
      if (kind) {
        const matrix = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
        const key = `${kind.key}|${Math.floor(matrix.elements[12] / BATCH_CELL)},${Math.floor(matrix.elements[14] / BATCH_CELL)}`;
        let bucket = buckets.get(key);
        if (!bucket) buckets.set(key, bucket = { material: mesh.material, colour: kind.colour, uv: kind.uv, parts: [], sources: [], renderOrder: mesh.renderOrder });
        const part = prepare(mesh, matrix, bucket);
        if (part) { bucket.parts.push(part); bucket.sources.push(mesh); }
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  for (const bucket of buckets.values()) {
    const merged = bucket.parts.length > 1 ? mergeGeometries(bucket.parts) : null;
    for (const part of bucket.parts) part.dispose();
    if (!merged) continue;
    const material = bucket.material.clone();
    if (bucket.colour) { (material as Material & { color: Color }).color.set('#ffffff'); material.vertexColors = true; }
    const batched = new Mesh(merged, material);
    batched.renderOrder = bucket.renderOrder;
    batched.userData.batched = true;
    root.add(batched);
    const masks = bucket.sources.map((source) => source.layers.mask);
    for (const source of bucket.sources) source.layers.set(HIDDEN_LAYER);
    undo.push(() => {
      root.remove(batched); merged.dispose(); material.dispose();
      bucket.sources.forEach((source, i) => { source.layers.mask = masks[i]!; });
    });
  }
  return () => { for (const step of undo.reverse()) step(); };
}

/** Children render normally, then their static meshes are merged; rebuilt whenever `version` changes. */
function Batched({ version, children, ...props }: { version: unknown; children: React.ReactNode } & React.ComponentProps<'group'>) {
  const ref = useRef<Group>(null);
  useLayoutEffect(() => (ref.current ? bake(ref.current) : undefined), [version]);
  return <group ref={ref} {...props}>{children}</group>;
}

const dummy = new Object3D();
const tint = new Color();
const isTree = (item: Resolved) => item.entry?.id.startsWith('ls.tree.') === true;

/** Two draws per chunk retain a tree silhouette, seasonal colour and a visible trunk. */
function TreeProxies({ items, origin }: { items: Resolved[]; origin: Position }) {
  const canopy = useRef<InstancedMesh>(null);
  const trunk = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!canopy.current || !trunk.current) return;
    items.forEach((item, i) => {
      const { w, d } = item.size;
      const h = item.size.h * .85;
      const trunkHeight = h * .6;
      dummy.position.set(origin.x + item.placement.x, trunkHeight / 2, origin.z + item.placement.z);
      dummy.rotation.set(0, item.placement.rotation * DEG, 0);
      dummy.scale.set(w * .055, trunkHeight, d * .055);
      dummy.updateMatrix();
      trunk.current!.setMatrixAt(i, dummy.matrix);
      const colour = item.entry?.id === 'ls.tree.osmanthus' && item.params.bloom === true ? candy.osmanthus
        : item.params.season === 'autumn' ? '#f0b64a' : item.params.season === 'spring' ? '#b6e88a' : candy.grassDeep;
      for (let lobe = 0; lobe < 3; lobe++) {
        const side = lobe === 0 ? 0 : lobe === 1 ? 1 : -1;
        const offset = side * w * .22;
        const angle = item.placement.rotation * DEG;
        dummy.position.set(origin.x + item.placement.x + offset * Math.cos(angle), h * (side === 0 ? .72 : .62), origin.z + item.placement.z - offset * Math.sin(angle));
        const radius = Math.min(w, d) * (side === 0 ? .33 : .28);
        dummy.scale.setScalar(radius);
        dummy.updateMatrix();
        canopy.current!.setMatrixAt(i * 3 + lobe, dummy.matrix);
        canopy.current!.setColorAt(i * 3 + lobe, tint.set(colour));
      }
    });
    for (const mesh of [canopy.current, trunk.current]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [items, origin]);
  if (!items.length) return null;
  return <>
    <instancedMesh ref={trunk} args={[undefined, undefined, items.length]}><cylinderGeometry args={[.7, 1, 1, 6]} /><Toon color={candy.bark} outline={false} /></instancedMesh>
    <instancedMesh ref={canopy} args={[undefined, undefined, items.length * 3]}><sphereGeometry args={[1, 8, 6]} /><Toon color="#ffffff" outline={false} /></instancedMesh>
  </>;
}

/** One instanced draw for every distant prop/building in a chunk: footprint-sized boxes. */
function Proxies({ items, origin }: { items: Resolved[]; origin: Position }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((item, i) => {
      const { w, d, h } = item.size;
      dummy.position.set(origin.x + item.placement.x, h / 2, origin.z + item.placement.z);
      dummy.rotation.set(0, item.placement.rotation * DEG, 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tint.set(proxyColor[item.entry?.category ?? 'building']));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, origin]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]}><boxGeometry /><Toon color="#ffffff" outline={false} /></instancedMesh>;
}

function roadRect(road: Road) {
  const half = road.width / 2;
  const minX = Math.min(road.from.x, road.to.x) - half, maxX = Math.max(road.from.x, road.to.x) + half;
  const minZ = Math.min(road.from.z, road.to.z) - half, maxZ = Math.max(road.from.z, road.to.z) + half;
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

/**
 * Renders one committed manifest: district ground, roads, water, level bridge decks, and catalog
 * placements with distance LOD. `centre` is the (quantized) player position used for LOD; `far`
 * chunks (outside the visible 3 × 3) render ground, roads, water and instanced proxies only.
 */
export const ChunkRenderer = memo(function ChunkRenderer({ manifest, centre, far, still }: { manifest: ChunkManifest; centre: Position; far: boolean; still: boolean }) {
  const origin = useMemo(() => chunkOrigin(manifest.coord), [manifest.coord]);
  const resolved = useMemo(() => manifest.placements.map(resolve), [manifest]);
  const layout = useMemo(() => {
    const byParent = new Map<string, Resolved[]>();
    const roots: { item: Resolved; lod: 0 | 1 | 2 }[] = [];
    const proxies: Resolved[] = [];
    for (const item of resolved) {
      if (item.placement.attachTo) {
        const list = byParent.get(item.placement.attachTo.placementId) ?? [];
        list.push(item); byParent.set(item.placement.attachTo.placementId, list);
        continue;
      }
      const d = Math.hypot(origin.x + item.placement.x - centre.x, origin.z + item.placement.z - centre.z);
      if (item.entry && d > item.entry.lod.cullDistance) continue;
      const lod = d < LOD_NEAR ? 0 : d < LOD_FAR ? 1 : 2;
      // Instanced-cost props show full detail only up close; everything distant is a proxy.
      if (far || lod === 2 || (lod === 1 && item.entry?.cost.instanced && !isTree(item))) proxies.push(item);
      else roots.push({ item, lod });
    }
    return { byParent, roots, proxies };
  }, [resolved, origin, centre, far]);
  const ground = districtGround[manifest.district];
  const placementGroup = ({ item }: { item: Resolved }) => ({ position: [item.placement.x, 0, item.placement.z] as [number, number, number], rotation: [0, item.placement.rotation * DEG, 0] as [number, number, number],
    userData: { clearView: item.entry?.category === 'building' ? 'fade' : 'solid', placementId: item.placement.id } });
  // NPC assemblies stay live together, including their stands; never bake an animated child into scenery.
  const hasNpc = (item: Resolved) => item.entry?.id.startsWith('an.npc.') ||
    (layout.byParent.get(item.placement.id) ?? []).some((child) => child.entry?.id.startsWith('an.npc.'));
  // Near buildings batch per placement so ClearView can fade them one at a time; near anchors stay live.
  // Everything else joins the chunk batch (trees still fade: their sway group is its own batch).
  const own = (root: { item: Resolved; lod: number }) => hasNpc(root.item) || (root.lod === 0 && (root.item.entry?.category === 'building' || root.item.entry?.category === 'anchor'));
  const near = layout.roots.filter(own);
  const boxProxies = useMemo(() => layout.proxies.filter((item) => !isTree(item)), [layout]);
  const treeProxies = useMemo(() => layout.proxies.filter(isTree), [layout]);
  return <>
    <group position={[origin.x, 0, origin.z]}>
      {/* Ground, water, roads, decks and placements: one batch per chunk (split into culling cells). */}
      <Batched version={layout}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, -.03, 20]}><planeGeometry args={[40, 40]} /><Toon color={ground} outline={false} /></mesh>
        {manifest.water.map((water) => <mesh key={water.id} rotation={[-Math.PI / 2, 0, 0]} position={[(water.rect.minX + water.rect.maxX) / 2, -.02, (water.rect.minZ + water.rect.maxZ) / 2]}>
          <planeGeometry args={[water.rect.maxX - water.rect.minX, water.rect.maxZ - water.rect.minZ]} />
          <Toon color={water.kind === 'river' ? '#5aa9d6' : '#7cc3e0'} outline={false} />
        </mesh>)}
        {manifest.roads.map((road) => { const r = roadRect(road); return <mesh key={road.id} rotation={[-Math.PI / 2, 0, 0]} position={[r.x, road.kind === 'avenue' ? -.01 : -.012, r.z]}><planeGeometry args={[r.w, r.d]} /><Toon color={roadColor[road.kind]} outline={false} /></mesh>; })}
        {/* Level walkable decks (CITY_GENERATION §7): collision treats them as walkable over water. */}
        {manifest.bridges.map((bridge) => <mesh key={bridge.id} position={[(bridge.rect.minX + bridge.rect.maxX) / 2, .06, (bridge.rect.minZ + bridge.rect.maxZ) / 2]} userData={{ clearView: 'solid' }}>
          <boxGeometry args={[bridge.rect.maxX - bridge.rect.minX, .12, bridge.rect.maxZ - bridge.rect.minZ]} /><Toon color="#c9b79c" thickness={1.6} outline={Math.hypot(origin.x + (bridge.rect.minX + bridge.rect.maxX) / 2 - centre.x, origin.z + (bridge.rect.minZ + bridge.rect.maxZ) / 2 - centre.z) < LOD_NEAR} />
        </mesh>)}
        {layout.roots.filter((root) => !own(root)).map((root) => <group key={root.item.placement.id} {...placementGroup(root)}>
          <Attached item={root.item} byParent={layout.byParent} lod={root.lod} still={still} />
        </group>)}
      </Batched>
      {near.map((root) => root.item.entry?.category === 'anchor'
        ? <group key={root.item.placement.id} {...placementGroup(root)}><Attached item={root.item} byParent={layout.byParent} lod={root.lod} still={still} /></group>
        : <Batched key={root.item.placement.id} version={layout} {...placementGroup(root)}><Attached item={root.item} byParent={layout.byParent} lod={root.lod} still={still} /></Batched>)}
    </group>
    <Proxies items={boxProxies} origin={origin} />
    <TreeProxies items={treeProxies} origin={origin} />
  </>;
});
