/** Set only by Playwright before page scripts run; ordinary browsers retain full quality. */
declare global {
  interface Window { __VIBEQUEST_TEST_PROFILE__?: { lightweight: boolean; movementMultiplier: number } }
}
export function testProfile() {
  const profile = typeof window === 'undefined' ? undefined : window.__VIBEQUEST_TEST_PROFILE__;
  return { lightweight: profile?.lightweight === true, movementMultiplier: profile?.movementMultiplier === 4 ? 4 : 1 };
}
