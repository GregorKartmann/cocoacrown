import { createStore, get, setMany, del } from 'idb-keyval';
import { decodeSave, encodeSave, SaveError, type SaveEnvelope } from './serialize';
import type { GameState } from '../sim/types';

const MAIN = 'save-main';
const BACKUP = 'save-backup';
const EMERGENCY = 'cocoa-crown:emergency';

/**
 * Local persistence with a main and a backup slot written in one IndexedDB
 * transaction. If the main slot is damaged, the backup is used. Falls back to
 * localStorage when IndexedDB is unavailable (e.g. some private modes).
 */
export interface SaveBackend {
  read(key: string): Promise<unknown>;
  writeMany(entries: [string, unknown][]): Promise<void>;
  remove(key: string): Promise<void>;
}

export function indexedDbBackend(): SaveBackend {
  const store = createStore('cocoa-crown', 'saves');
  return {
    read: (k) => get(k, store),
    writeMany: (entries) => setMany(entries, store),
    remove: (k) => del(k, store),
  };
}

export function localStorageBackend(): SaveBackend {
  return {
    async read(k) {
      const v = localStorage.getItem(`cocoa-crown:${k}`);
      return v ? JSON.parse(v) : undefined;
    },
    async writeMany(entries) {
      for (const [k, v] of entries) localStorage.setItem(`cocoa-crown:${k}`, JSON.stringify(v));
    },
    async remove(k) {
      localStorage.removeItem(`cocoa-crown:${k}`);
    },
  };
}

/** Last resort when the sandbox forbids both IndexedDB and localStorage: the game runs, but nothing persists. */
export function memoryBackend(): SaveBackend {
  const m = new Map<string, unknown>();
  return {
    async read(k) {
      return m.get(k);
    },
    async writeMany(entries) {
      for (const [k, v] of entries) m.set(k, v);
    },
    async remove(k) {
      m.delete(k);
    },
  };
}

export interface LoadResult {
  state: GameState | null;
  /** 'main' | 'backup' | 'none' */
  source: 'main' | 'backup' | 'none';
  error?: string;
  savedAt?: number;
}

export class SaveManager {
  private lastGood: SaveEnvelope | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private backend: SaveBackend) {}

  async load(): Promise<LoadResult> {
    const errors: string[] = [];
    const candidates: { env: SaveEnvelope; state: GameState; source: 'main' | 'backup' }[] = [];
    const tryDecode = (raw: unknown, source: 'main' | 'backup') => {
      if (!raw) return;
      try {
        candidates.push({ env: raw as SaveEnvelope, state: decodeSave(raw), source });
      } catch (e) {
        errors.push(e instanceof SaveError || e instanceof Error ? e.message : String(e));
      }
    };
    const main = await this.backend.read(MAIN).catch(() => undefined);
    tryDecode(main, 'main');
    // The synchronous emergency copy written on page hide wins if it is newer
    // (an asynchronous IndexedDB write may be cut off when the page closes).
    try {
      const em = typeof localStorage !== 'undefined' ? localStorage.getItem(EMERGENCY) : null;
      if (em) tryDecode(JSON.parse(em), 'main');
    } catch {
      /* storage unavailable */
    }
    if (!candidates.length) {
      const backup = await this.backend.read(BACKUP).catch(() => undefined);
      tryDecode(backup, 'backup');
    }
    if (!candidates.length) return { state: null, source: 'none', error: errors.join(' / ') || undefined };
    candidates.sort((a, b) => b.env.savedAt - a.env.savedAt);
    const best = candidates[0];
    this.lastGood = best.env;
    return { state: best.state, source: best.source, error: errors.join(' / ') || undefined, savedAt: best.env.savedAt };
  }

  /** Synchronous emergency copy for page hide / unload (localStorage). */
  saveSync(s: GameState, now = Date.now()): void {
    try {
      localStorage.setItem(EMERGENCY, JSON.stringify(encodeSave(s, now)));
    } catch {
      /* quota or private mode – the IndexedDB save still runs */
    }
  }

  /** Serialised writes: a new save never overtakes an older one in flight. */
  save(s: GameState, now = Date.now()): Promise<void> {
    const env = encodeSave(s, now);
    const previous = this.lastGood;
    this.writing = this.writing
      .catch(() => undefined)
      .then(async () => {
        const entries: [string, unknown][] = [[MAIN, env]];
        if (previous) entries.push([BACKUP, previous]);
        await this.backend.writeMany(entries);
        this.lastGood = env;
      });
    return this.writing;
  }

  async wipe(): Promise<void> {
    await this.writing.catch(() => undefined);
    await this.backend.remove(MAIN);
    await this.backend.remove(BACKUP);
    try {
      localStorage.removeItem(EMERGENCY);
    } catch {
      /* ignore */
    }
    this.lastGood = null;
  }
}

/** Export file content: the same envelope as stored, pretty-printed. */
export function exportSaveText(s: GameState, now = Date.now()): string {
  return JSON.stringify(encodeSave(s, now), null, 2);
}

export function importSaveText(text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError('Die Datei ist kein Cocoa-Crown-Spielstand.');
  }
  return decodeSave(parsed);
}
