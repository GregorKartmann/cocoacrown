import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource/fraunces/latin-800.css';
import '@fontsource/fraunces/latin-900.css';
import './ui/styles.css';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { GameStore } from './game/GameStore';
import { initEventClock } from './game/clock';
import { SaveManager, indexedDbBackend, localStorageBackend, memoryBackend, type SaveBackend } from './save/storage';
import { createGame } from './sim/init';
import { App } from './ui/App';
import { registerPwa } from './pwa/register';
import { artUrl, loadArt } from './render/assets';

/** Resolves with the fallback if `p` has not settled after `ms` (a hung IndexedDB or lock must never block the start). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback());
    }, ms);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(fallback());
      },
    );
  });
}

function localStorageWorks(): boolean {
  try {
    const k = 'cocoa-crown:probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function fallbackBackend(): { backend: SaveBackend; kind: 'local' | 'memory' } {
  return localStorageWorks() ? { backend: localStorageBackend(), kind: 'local' } : { backend: memoryBackend(), kind: 'memory' };
}

async function pickBackend(): Promise<{ backend: SaveBackend; kind: 'idb' | 'local' | 'memory' }> {
  try {
    const b = indexedDbBackend();
    const ok = await withTimeout(
      b.read('probe').then(() => true),
      2500,
      () => false,
    );
    if (ok) return { backend: b, kind: 'idb' };
  } catch {
    /* IndexedDB missing or forbidden */
  }
  return fallbackBackend();
}

/** Only one tab may run the simulation, otherwise offline time could be credited twice. */
function acquireSingleTabLock(): Promise<boolean> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks?.request) return Promise.resolve(true);
  return new Promise((resolve) => {
    try {
      locks
        .request('cocoa-crown-game', { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          return new Promise<void>(() => undefined); // hold for the page lifetime
        })
        .catch(() => resolve(true));
    } catch {
      resolve(true); // sandboxed frames may forbid the Locks API
    }
  });
}

export interface BootProgress {
  art: number;
  label: string;
}

async function boot(onProgress: (p: BootProgress) => void): Promise<{ store: GameStore; notice: string | null }> {
  let artP = 0;
  let label = 'Grafiken werden geladen …';
  const report = () => onProgress({ art: artP, label });
  report();
  const fonts = withTimeout(
    Promise.all([document.fonts?.load('600 16px Fredoka'), document.fonts?.load('800 16px Fraunces'), document.fonts?.load('700 16px Fraunces')]).then(() => undefined),
    2000,
    () => undefined,
  );
  const art = loadArt((p, done, total) => {
    artP = p;
    label = done < total ? `Grafiken ${done} von ${total}` : 'Spielstand wird geöffnet …';
    report();
  });
  const [picked, owner, artResult] = await Promise.all([pickBackend(), withTimeout(acquireSingleTabLock(), 1500, () => true), art, fonts]);
  label = 'Spielstand wird geöffnet …';
  report();

  let saves = new SaveManager(picked.backend);
  let kind = picked.kind;
  let loaded = await withTimeout(saves.load(), 4000, () => null);
  if (!loaded) {
    // IndexedDB answered the probe but hangs on reading: continue with the synchronous copy
    const fb = fallbackBackend();
    saves = new SaveManager(fb.backend);
    kind = fb.kind;
    loaded = await saves.load();
  }
  let notice: string | null = null;
  if (loaded.source === 'backup') notice = 'Der letzte Spielstand war beschädigt – die Sicherung wurde geladen.';
  if (loaded.source === 'none' && loaded.error) notice = 'Spielstand konnte nicht gelesen werden – neues Spiel gestartet.';
  if (kind === 'memory') notice = 'In dieser Vorschau kann nicht gespeichert werden – der Fortschritt geht beim Schließen verloren.';
  if (artResult.failed.length) console.warn('[cocoa-crown] Grafiken nicht geladen:', artResult.failed);
  initEventClock(location.search);
  const store = new GameStore(loaded.state ?? createGame(), saves);
  if (!owner) store.blockedByOtherTab = true;
  else {
    store.resume();
    store.start();
  }
  return { store, notice };
}

function Root() {
  const [ready, setReady] = useState<{ store: GameStore; notice: string | null } | null>(null);
  const [progress, setProgress] = useState<BootProgress>({ art: 0, label: 'Grafiken werden geladen …' });
  const [failure, setFailure] = useState<string | null>(null);
  const [update, setUpdate] = useState<null | (() => void)>(null);
  useEffect(() => {
    boot(setProgress).then(
      (r) => {
        setReady(r);
        if (r.notice) setTimeout(() => r.store.emit({ type: 'toast', text: r.notice!, tone: 'warn' }), 600);
      },
      (e: unknown) => setFailure(e instanceof Error ? e.message : String(e)),
    );
    try {
      registerPwa((apply) => setUpdate(() => apply));
    } catch {
      /* no service worker in sandboxed previews */
    }
  }, []);
  if (!ready)
    return (
      <div className="loading">
        <div className="logo">
          <img src={artUrl('oberflaeche/krone')} alt="" width={84} />
          <b>Cocoa Crown</b>
          <span>Die Manufaktur öffnet …</span>
          <div className="bar gold" style={{ width: 200, marginTop: 8 }}>
            <i style={{ width: `${Math.round(progress.art * 100)}%` }} />
          </div>
          <small className="loading-step" data-testid="loading-step">
            {failure ? `Start fehlgeschlagen: ${failure}` : progress.label}
          </small>
          {failure && (
            <button className="btn gold" style={{ marginTop: 10 }} onClick={() => location.reload()}>
              Neu laden
            </button>
          )}
        </div>
      </div>
    );
  return (
    <App
      store={ready.store}
      updateAvailable={!!update}
      onUpdate={() => {
        ready.store.onHidden();
        update?.();
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
