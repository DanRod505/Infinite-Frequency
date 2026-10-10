/** Keeps the current seed in the URL so a course can be reproduced and shared (GDD §4.4). */
export function setUrlSeed(seed: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
}
