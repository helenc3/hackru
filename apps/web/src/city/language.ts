import { createContext, useContext } from 'react';
import { text, type GameLanguage, type TextCatalogName } from '@vibequest/shared';

export const CityLanguageContext = createContext<GameLanguage>('zh');
export function useCityText(catalog: TextCatalogName, key: string): string {
  const language = useContext(CityLanguageContext);
  const row = text(catalog, key);
  return (language === 'en' ? row?.english : row?.zh) ?? '';
}
