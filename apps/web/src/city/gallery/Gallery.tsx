import { Component, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, View } from '@react-three/drei';
import {
  CATALOG, CATALOG_VERSION, CHUNK_SIZE, CITY_LIMITS, AssetCategorySchema, DistrictKindSchema, chunkKey, generateFallbackChunk, planChunk, resolveParams, seedFromWorldId,
  type AssetCategory, type CatalogEntry, type ChunkCoord, type ChunkManifest, type DistrictKind, type ParamValues, type QuestCategory,
} from '@vibequest/shared';
import { ASSET_COMPONENTS } from '../assets';
import { ChunkRenderer } from '../ChunkRenderer';
import './gallery.css';

// Visual review page for the city component library (CITY_GENERATION §4, §10). Dev-only route /__gallery.

type Variant = { label: string; params: ParamValues; filled?: boolean };

/** Defaults, every numeric extreme, every enum value, the flipped boolean, and a sockets-filled combination. */
function variantsFor(entry: CatalogEntry): Variant[] {
  const out: Variant[] = [{ label: 'default', params: {} }];
  for (const [key, spec] of Object.entries(entry.params)) {
    if (spec.type === 'number' || spec.type === 'int') out.push({ label: `${key}=${spec.min}`, params: { [key]: spec.min } }, { label: `${key}=${spec.max}`, params: { [key]: spec.max } });
    else if (spec.type === 'enum') { for (const value of spec.values) if (value !== spec.default) out.push({ label: `${key}=${value}`, params: { [key]: value } }); }
    else if (spec.type === 'boolean') out.push({ label: `${key}=${!spec.default}`, params: { [key]: !spec.default } });
  }
  if (entry.sockets(resolveParams(entry)).length) out.push({ label: 'sockets filled', params: {}, filled: true });
  return out;
}

const attachable = (kind: string) => CATALOG.find((entry) => entry.placement === 'socket' && entry.attachesTo?.includes(kind as never));

/** Collision metadata sanity: params resolve, positive footprint, solids/walkables inside the footprint (5 cm tolerance). */
function checkEntry(entry: CatalogEntry): string[] {
  const problems: string[] = [];
  for (const variant of variantsFor(entry)) {
    try {
      const params = resolveParams(entry, variant.params);
      const { w, d, h } = entry.footprint(params);
      if (!(w > 0 && d > 0 && h >= 0)) problems.push(`${variant.label}: empty footprint`);
      const { solids, walkable } = entry.collision(params);
      for (const r of [...solids, ...walkable]) if (r.minX < -w / 2 - .05 || r.maxX > w / 2 + .05 || r.minZ < -d / 2 - .05 || r.maxZ > d / 2 + .05) problems.push(`${variant.label}: collision outside footprint`);
    } catch (error) { problems.push(`${variant.label}: ${(error as Error).message}`); }
  }
  return [...new Set(problems)];
}

class Boundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const rad = (deg: number) => deg * Math.PI / 180;

function Lights() {
  return <><ambientLight intensity={.5} /><hemisphereLight args={['#c9b8ff', '#ffd1a8', .7]} /><directionalLight position={[12, 24, 14]} intensity={2.2} /></>;
}

function Overlay({ entry, params }: { entry: CatalogEntry; params: ParamValues }) {
  const { solids, walkable } = entry.collision(params);
  const { h } = entry.footprint(params);
  return <group>
    {solids.map((r, i) => <mesh key={`s${i}`} position={[(r.minX + r.maxX) / 2, Math.max(h, .2) / 2, (r.minZ + r.maxZ) / 2]}><boxGeometry args={[r.maxX - r.minX, Math.max(h, .2), r.maxZ - r.minZ]} /><meshBasicMaterial color="#ff2d2d" wireframe /></mesh>)}
    {walkable.map((r, i) => <mesh key={`w${i}`} position={[(r.minX + r.maxX) / 2, .03, (r.minZ + r.maxZ) / 2]} rotation-x={-Math.PI / 2}><planeGeometry args={[r.maxX - r.minX, r.maxZ - r.minZ]} /><meshBasicMaterial color="#2dd36f" transparent opacity={.45} /></mesh>)}
    {entry.sockets(params).map((s) => <mesh key={s.id} position={[s.x, s.y, s.z]}><sphereGeometry args={[.12, 8, 8]} /><meshBasicMaterial color="#3b5bdb" /></mesh>)}
  </group>;
}

function EntryModel({ entry, variant, overlay }: { entry: CatalogEntry; variant: Variant; overlay: boolean }) {
  const params = resolveParams(entry, variant.params);
  const Asset = ASSET_COMPONENTS[entry.id];
  const { w, d, h } = entry.footprint(params);
  const size = Math.max(w, d, h, 1);
  return <>
    <PerspectiveCamera makeDefault position={[size * .9, size * .8, size * 1.3]} fov={40} near={.05} far={size * 20} onUpdate={(camera) => camera.lookAt(0, h / 3, 0)} />
    <Lights />
    <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[w + 2, d + 2]} /><meshBasicMaterial color="#efe6da" /></mesh>
    {Asset && <Asset params={params} still lod={0} seed={1} />}
    {variant.filled && entry.sockets(params).map((socket) => {
      const child = attachable(socket.kind);
      const ChildAsset = child && ASSET_COMPONENTS[child.id];
      return ChildAsset ? <group key={socket.id} position={[socket.x, socket.y, socket.z]} rotation-y={rad(socket.facing)}><ChildAsset params={resolveParams(child)} still lod={0} seed={1} /></group> : null;
    })}
    {overlay && <Overlay entry={entry} params={params} />}
  </>;
}

function Cell({ entry, variant, overlay }: { entry: CatalogEntry; variant: Variant; overlay: boolean }) {
  const [failed, setFailed] = useState(false);
  const missing = !ASSET_COMPONENTS[entry.id];
  return <figure className="gallery-cell" data-testid="gallery-variant" data-status={failed ? 'error' : missing ? 'missing-component' : 'ok'}>
    <View className="gallery-view"><Boundary onError={() => setFailed(true)}><EntryModel entry={entry} variant={variant} overlay={overlay} /></Boundary></View>
    <figcaption>{variant.label}</figcaption>
  </figure>;
}

function EntryCard({ entry, overlay }: { entry: CatalogEntry; overlay: boolean }) {
  const problems = useMemo(() => checkEntry(entry), [entry]);
  return <article className="gallery-entry" data-testid="gallery-entry" data-asset-id={entry.id} data-valid={problems.length === 0} data-review={entry.review}>
    <header>
      <h3>{entry.id} <small>v{entry.version} · {entry.component}</small></h3>
      <p>{entry.description}</p>
      <p className="gallery-meta">{entry.districts.join(', ')} · {entry.placement}{entry.capabilities.length ? ` · ${entry.capabilities.join(', ')}` : ''} · ~{entry.cost.triangles} tris / {entry.cost.drawCalls} calls{entry.cost.instanced ? ' · instanced' : ''} · <b className={entry.review}>{entry.review}</b></p>
      {problems.length > 0 && <ul className="gallery-problems">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
    </header>
    <div className="gallery-variants">{variantsFor(entry).map((variant) => <Cell key={variant.label} entry={entry} variant={variant} overlay={overlay} />)}</div>
  </article>;
}

const QUEST_CONTEXT = { missionId: 'Q1' as const, weights: { 'drink-vendor': 1, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 } satisfies Record<QuestCategory, number> };
const WORLD_ID = 'gallery-world';

/** Nearest planned chunk of this district within 12 chunks of the origin; its 3×3 neighbourhood is the kit sample. */
function neighbourhood(district: DistrictKind): { centre: ChunkCoord; manifests: ChunkManifest[] } | null {
  const seed = seedFromWorldId(WORLD_ID);
  for (let ring = 0; ring <= 12; ring++) for (let cx = -ring; cx <= ring; cx++) for (let cz = -ring; cz <= ring; cz++) {
    if (Math.max(Math.abs(cx), Math.abs(cz)) !== ring || planChunk(seed, { cx, cz }).district !== district) continue;
    const manifests: ChunkManifest[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) manifests.push(generateFallbackChunk(WORLD_ID, seed, { cx: cx + dx, cz: cz + dz }, QUEST_CONTEXT));
    return { centre: { cx, cz }, manifests };
  }
  return null;
}

function Stats({ output }: { output: React.RefObject<HTMLDListElement | null> }) {
  const gl = useThree((state) => state.gl);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < .5 || !output.current) return;
    last.current = clock.elapsedTime;
    const { calls, triangles } = gl.info.render;
    const node = output.current;
    node.dataset.triangles = String(triangles); node.dataset.drawCalls = String(calls);
    node.dataset.withinBudget = String(triangles <= CITY_LIMITS.maxTriangles && calls <= CITY_LIMITS.maxDrawCalls);
    node.querySelector('[data-k=tris]')!.textContent = `${triangles} / ${CITY_LIMITS.maxTriangles}`;
    node.querySelector('[data-k=calls]')!.textContent = `${calls} / ${CITY_LIMITS.maxDrawCalls}`;
  });
  return null;
}

function Neighbourhood() {
  const [district, setDistrict] = useState<DistrictKind>('shopping');
  const output = useRef<HTMLDListElement>(null);
  const sample = useMemo(() => { try { return neighbourhood(district); } catch { return null; } }, [district]);
  const estimate = sample?.manifests.reduce((sum, manifest) => sum + manifest.placements.reduce((total, placement) => total + (CATALOG.find((entry) => entry.id === placement.assetId)?.cost.triangles ?? 0), 0), 0) ?? 0;
  const centre = sample ? { x: (sample.centre.cx + .5) * CHUNK_SIZE, z: (sample.centre.cz + .5) * CHUNK_SIZE } : { x: 0, z: 0 };
  return <section className="gallery-neighbourhood" data-testid="gallery-neighbourhood" data-district={district} data-chunks={sample?.manifests.length ?? 0}>
    <h2>3 × 3 fixture neighbourhood</h2>
    <label>District kit <select value={district} onChange={(event) => setDistrict(event.target.value as DistrictKind)} data-testid="gallery-district">{DistrictKindSchema.options.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
    {sample ? <p>Centre chunk {chunkKey(sample.centre)} · {sample.manifests.reduce((n, m) => n + m.placements.length, 0)} placements · catalog estimate ~{estimate} tris</p> : <p data-testid="gallery-no-sample">No planned {district} chunk within 12 chunks.</p>}
    <dl ref={output} className="gallery-budget" data-testid="gallery-budget"><dt>Triangles</dt><dd data-k="tris">…</dd><dt>Draw calls</dt><dd data-k="calls">…</dd></dl>
    {sample && <Canvas key={chunkKey(sample.centre)} className="gallery-neighbourhood-canvas" camera={{ position: [centre.x + 55, 70, centre.z + 75], fov: 50, far: 600 }} onCreated={({ camera }) => camera.lookAt(centre.x, 0, centre.z)}>
      <color attach="background" args={['#ffd1a8']} /><Lights />
      {sample.manifests.map((manifest) => <ChunkRenderer key={chunkKey(manifest.coord)} manifest={manifest} centre={centre} far={false} still={false} />)}
      <Stats output={output} />
    </Canvas>}
  </section>;
}

export function Gallery() {
  const container = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<AssetCategory>('building');
  const [overlay, setOverlay] = useState(true);
  const counts = Object.fromEntries(AssetCategorySchema.options.map((name) => [name, CATALOG.filter((entry) => entry.category === name).length])) as Record<AssetCategory, number>;
  const approved = CATALOG.filter((entry) => entry.review === 'approved').length;
  const ok = CATALOG.length >= 60 && Object.values(counts).every((n) => n > 0);
  return <div ref={container} className="gallery" data-testid="gallery">
    <header className="gallery-header">
      <h1>City component library <small>{CATALOG_VERSION}</small></h1>
      <p data-testid="gallery-summary" data-total={CATALOG.length} data-approved={approved} data-ok={ok}>
        {CATALOG.length} entries ({approved} approved){ok ? '' : ' — needs ≥ 60 entries spanning every category'}
      </p>
      <nav>{AssetCategorySchema.options.map((name) => <button key={name} aria-pressed={category === name} data-testid={`gallery-tab-${name}`} data-count={counts[name]} onClick={() => setCategory(name)}>{name} ({counts[name]})</button>)}</nav>
      <label><input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} /> Collision overlay (solids red, walkable green, sockets blue)</label>
    </header>
    <main className="gallery-grid">{CATALOG.filter((entry) => entry.category === category).map((entry) => <EntryCard key={entry.id} entry={entry} overlay={overlay} />)}</main>
    <Neighbourhood />
    <Canvas className="gallery-port" eventSource={container as React.RefObject<HTMLElement>}><View.Port /></Canvas>
  </div>;
}
