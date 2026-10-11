import { test as base } from '@playwright/test';

export const test = base.extend<{ renderProfile: 'lightweight' | 'full'; movementMultiplier: number }>({
  renderProfile: ['lightweight', { option: true }],
  movementMultiplier: [1, { option: true }],
  page: async ({ page, renderProfile }, use) => {
    if (renderProfile === 'lightweight') await page.emulateMedia({ reducedMotion: 'reduce' });
    await use(page);
  },
  context: async ({ context, renderProfile, movementMultiplier }, use) => {
    await context.addInitScript((profile) => {
      Object.defineProperty(window, '__VIBEQUEST_TEST_PROFILE__', { value: profile });
    }, { lightweight: renderProfile === 'lightweight', movementMultiplier });
    await use(context);
  },
});
export { expect, type Page, type Locator } from '@playwright/test';
