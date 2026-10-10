import type { CueDefinition, MissionDefinition, NpcDefinition } from '../contracts.js';

// Deliberately empty: authored graphs, NPCs, and cues belong to Segment-001.
export const missions: readonly MissionDefinition[] = [];
export const npcs: readonly NpcDefinition[] = [];
export const cues: readonly CueDefinition[] = [];
export { sceneManifest } from './scene-manifest.js';
