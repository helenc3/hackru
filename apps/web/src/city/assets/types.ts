import type { ParamValues } from '@vibequest/shared';

/**
 * Props every catalog component receives. `params` are already resolved and validated by
 * resolveParams (defaults filled). Components render in entry-local space: origin at the
 * footprint centre on the ground, +z is the front; ChunkRenderer applies position/rotation.
 * Geometry must match the entry's footprint()/collision() for the same params.
 */
export type AssetProps = { params: ParamValues; still: boolean; lod: 0 | 1 | 2; seed: number };
export type AssetComponent = (props: AssetProps) => React.ReactNode;
