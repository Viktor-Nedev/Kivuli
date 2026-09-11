/**
 * Registers the service worker, and the guards around doing so.
 *
 * Three conditions, each earning its place:
 *
 *   - **Production only.** A worker registered against the Vite dev server
 *     intercepts HMR and turns every edit into a cache-debugging session.
 *   - **`?nosw` opts out.** If a bad build is ever cached, this is the recovery
 *     that needs no devtools: open the site with `?nosw` and nothing registers.
 *   - **After `load`.** Installing a worker competes with the first paint
 *     otherwise, and the first paint is what a reader is waiting for.
 *
 * Registration failure is swallowed. A browser without service workers, or one
 * on an insecure origin, should get the ordinary online app rather than an
 * error — offline support is an addition here, never a dependency.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  if (window.location.search.includes('nosw')) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is optional. Nothing above it should fail because of it.
    });
  });
}

/**
 * Clears every cache and unregisters the worker.
 *
 * The escape hatch for the one failure mode that survives a reload: a shell
 * cached from a broken build. Exposed on `window` in production so it can be
 * run from a phone's remote console, where `?nosw` is awkward to type.
 */
export function resetServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return Promise.resolve();
  return navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .then(() => (('caches' in window) ? caches.keys() : Promise.resolve([] as string[])))
    .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .then(() => undefined);
}
