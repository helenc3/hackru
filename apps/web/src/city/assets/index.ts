import type { AssetComponent } from './types';
import { buildingsResidentialAssets } from './buildings-residential';
import { buildingsCommercialAssets } from './buildings-commercial';
import { storefrontAssets } from './storefront';
import { streetAssets } from './street';
import { landscapeAssets } from './landscape';
import { waterfrontAssets } from './waterfront';
import { anchorsAssets } from './anchors';

export type { AssetComponent, AssetProps } from './types';
export const ASSET_COMPONENTS: Record<string, AssetComponent> = { ...buildingsResidentialAssets, ...buildingsCommercialAssets, ...storefrontAssets, ...streetAssets, ...landscapeAssets, ...waterfrontAssets, ...anchorsAssets };
