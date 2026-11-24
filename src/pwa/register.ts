import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the service worker (offline cache). When a new version has been
 * downloaded, the game asks the player before reloading so a running session
 * is saved first instead of being interrupted.
 */
export function registerPwa(onUpdate: (apply: () => void) => void) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        onUpdate(() => void update(true));
      },
      onRegisteredSW(_url, reg) {
        if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
      },
    });
  } catch {
    /* sandboxed contexts may forbid service workers – the game still runs */
  }
}
