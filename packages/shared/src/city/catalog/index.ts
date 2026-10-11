import { ParamSpecSchema, type AssetId, type CatalogEntry, type DistrictKind, type ParamValues } from '../contracts.js';
import { TEXT_CATALOG } from '../text-catalog.js';
import { buildingsResidentialEntries } from './buildings-residential.js';
import { buildingsCommercialEntries } from './buildings-commercial.js';
import { storefrontEntries } from './storefront.js';
import { streetEntries } from './street.js';
import { landscapeEntries } from './landscape.js';
export { treeHeightScale } from './landscape.js';
import { waterfrontEntries } from './waterfront.js';
import { anchorsEntries } from './anchors.js';

/** Bump when any entry's geometry, params, or sockets change; cached manifests record it. */
export const CATALOG_VERSION = 'catalog-2';
export const CATALOG: readonly CatalogEntry[] = [...buildingsResidentialEntries, ...buildingsCommercialEntries, ...storefrontEntries, ...streetEntries, ...landscapeEntries, ...waterfrontEntries, ...anchorsEntries];
const byId = new Map<string, CatalogEntry>(CATALOG.map((entry) => [entry.id, entry]));
if (byId.size !== CATALOG.length) throw new Error('Duplicate catalog asset ID.');
for (const entry of CATALOG) for (const spec of Object.values(entry.params)) ParamSpecSchema.parse(spec);

export function catalogEntry(id: AssetId | string): CatalogEntry | undefined { return byId.get(id); }

/** Fill defaults and reject unknown or out-of-range params. Throws with a reason; never clamps silently. */
export function resolveParams(entry: CatalogEntry, raw: ParamValues = {}): ParamValues {
  for (const key of Object.keys(raw)) if (!(key in entry.params)) throw new Error(`${entry.id}: unknown param ${key}`);
  const out: ParamValues = {};
  for (const [key, spec] of Object.entries(entry.params)) {
    const value = raw[key] ?? spec.default;
    switch (spec.type) {
      case 'number': case 'int':
        if (typeof value !== 'number' || value < spec.min || value > spec.max || (spec.type === 'int' && !Number.isInteger(value))) throw new Error(`${entry.id}: ${key} out of range`);
        break;
      case 'enum': if (typeof value !== 'string' || !spec.values.includes(value)) throw new Error(`${entry.id}: ${key} not an allowed value`); break;
      case 'boolean': if (typeof value !== 'boolean') throw new Error(`${entry.id}: ${key} must be boolean`); break;
      case 'text': if (typeof value !== 'string' || !(value in TEXT_CATALOG[spec.catalog])) throw new Error(`${entry.id}: ${key} is not a reviewed ${spec.catalog} key`); break;
    }
    out[key] = value;
  }
  return out;
}

/** Compact machine-readable catalog for Claude, filtered by district; connector and quest assets always included. */
export function catalogForPrompt(districts: readonly DistrictKind[]) {
  return CATALOG.filter((entry) => entry.review === 'approved' && (entry.category === 'anchor' || entry.category === 'waterfront' || entry.category === 'street' || entry.districts.some((district) => districts.includes(district))))
    .map((entry) => {
      const defaults = resolveParams(entry);
      return { id: entry.id, category: entry.category, description: entry.description, districts: entry.districts, placement: entry.placement, attachesTo: entry.attachesTo, params: entry.params, footprintAtDefaults: entry.footprint(defaults), sockets: entry.sockets(defaults).map(({ id, kind }) => ({ id, kind })), capabilities: entry.capabilities, clearance: entry.clearance };
    });
}
