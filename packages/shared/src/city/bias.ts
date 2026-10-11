import { QuestCategorySchema, type ExplorationState, type MissionId, type QuestCategory } from '../contracts.js';
import { BIAS_RULES } from './contracts.js';

/** Categories each quest makes relevant (CITY_GENERATION §8). */
const QUEST_CATEGORIES: Record<MissionId, readonly QuestCategory[]> = {
  Q1: ['drink-vendor'],
  Q2: ['direction-helper', 'hotel-landmark'],
  Q3: ['river-viewpoint', 'photo-passerby'],
};

/**
 * Placement weights for the active quest. A relevant category not encountered for ~3 active minutes or
 * 6 newly visited chunks ramps from 1× to the 1.5× cap (reached at 3× the absence threshold); weights are then
 * normalized to mean 1 across all categories, so a boost is modest and never exceeds the cap.
 */
export function questWeights(missionId: MissionId, exploration: ExplorationState): Record<QuestCategory, number> {
  const relevant = QUEST_CATEGORIES[missionId];
  const raw = Object.fromEntries(QuestCategorySchema.options.map((category) => {
    if (!relevant.includes(category)) return [category, 1];
    const last = exploration.lastEncounter[category] ?? { activeMs: 0, visitedChunks: 0 };
    const absence = Math.max((exploration.activeMs - last.activeMs) / BIAS_RULES.absenceMs, (exploration.visitedChunkKeys.length - last.visitedChunks) / BIAS_RULES.absenceChunks);
    return [category, absence < 1 ? 1 : Math.min(BIAS_RULES.maxBoost, 1 + (BIAS_RULES.maxBoost - 1) * (absence - 1) / 2)];
  })) as Record<QuestCategory, number>;
  const mean = Object.values(raw).reduce((sum, weight) => sum + weight, 0) / QuestCategorySchema.options.length;
  return Object.fromEntries(Object.entries(raw).map(([category, weight]) => [category, weight / mean])) as Record<QuestCategory, number>;
}

/** An actual encounter (proximity) resets that category's absence clock. */
export function recordEncounters(exploration: ExplorationState, categories: readonly QuestCategory[]): ExplorationState {
  if (!categories.length) return exploration;
  const stamp = { activeMs: exploration.activeMs, visitedChunks: exploration.visitedChunkKeys.length };
  return { ...exploration, lastEncounter: { ...exploration.lastEncounter, ...Object.fromEntries(categories.map((category) => [category, stamp])) } };
}
