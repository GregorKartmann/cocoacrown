import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameStore } from '../game/GameStore';

export const GameContext = createContext<GameStore | null>(null);

export function useStore(): GameStore {
  const s = useContext(GameContext);
  if (!s) throw new Error('GameStore fehlt');
  return s;
}

/** Re-renders at most ~10×/s (the store throttles notifications). */
export function useGameVersion(): number {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}
