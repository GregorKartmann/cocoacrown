import { useCallback, useEffect, useRef, useState } from 'react';
import { BONUS_INFO } from '../config/content';
import { BALANCE } from '../config/balance';
import { formatMoney } from '../core/format';
import { audio, haptic } from '../audio/audio';
import type { GameStore, UiEvent } from '../game/GameStore';
import { World } from '../render/World';
import type { StationId } from '../sim/types';
import { GameContext } from './useGame';
import { BottomNav, OfflineDialog, QuestCard, Toasts, TopBar, type ToastItem } from './components/Hud';
import { StationSheet, UnlockSheet } from './components/StationSheet';
import { HireReveal, ManagerSheet, stationName } from './components/ManagerSheet';
import { OverviewSheet, QuestsSheet, SettingsSheet, StatsSheet } from './components/MenuSheets';

type SheetState =
  | { kind: 'station'; id: StationId }
  | { kind: 'unlock'; floor: number }
  | { kind: 'managers'; target?: StationId }
  | { kind: 'overview' }
  | { kind: 'quests' }
  | { kind: 'stats' }
  | { kind: 'settings' };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function App({ store, updateAvailable, onUpdate }: { store: GameStore; updateAvailable: boolean; onUpdate: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [bump, setBump] = useState(0);
  const [reveal, setReveal] = useState<string | null>(null);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((text: string, tone?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2900);
  }, []);

  // Pixi world
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const world = new World();
    worldRef.current = world;
    void world.init(host, store, {
      openStation: (id) => setSheet({ kind: 'station', id }),
      openManagers: (id) => setSheet({ kind: 'managers', target: id }),
      openUnlock: (floor) => setSheet({ kind: 'unlock', floor }),
      feedback: (k) => {
        const hap = store.state.settings.haptics;
        if (k === 'tap') {
          audio.play('tap');
          haptic(hap, 6);
        } else if (k === 'fail') {
          audio.play('fail');
          haptic(hap, 20);
        } else if (k === 'skill') {
          audio.play('skill');
          haptic(hap, 25);
        } else if (k === 'sale') audio.play('sale');
        else if (k === 'batch') audio.play('batch');
      },
      moneyAnchor: () => {
        const el = document.getElementById('money-anchor');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
      moneyBump: () => setBump((b) => b + 1),
      insets: () => {
        const top = topRef.current?.getBoundingClientRect().bottom ?? 120;
        const bottomTop = bottomRef.current?.getBoundingClientRect().top ?? window.innerHeight - 150;
        return { top, bottom: window.innerHeight - bottomTop };
      },
    });
    if (location.search.includes('debug')) {
      (window as unknown as { __cc: unknown }).__cc = {
        store,
        positions: () => world.debugPositions(),
        give: (v: number) => {
          store.state.money = store.state.money.add(v);
          store.notify(true);
        },
        focus: (id: StationId) => world.focus(id),
        world,
      };
    }
    return () => {
      world.destroy();
      worldRef.current = null;
    };
  }, [store]);

  // UI events → sound, toasts
  useEffect(() => {
    return store.onUiEvent((e: UiEvent) => {
      const n = store.state.settings.notation;
      const hap = store.state.settings.haptics;
      switch (e.type) {
        case 'toast':
          toast(e.text, e.tone);
          break;
        case 'unlock':
          audio.play('unlock');
          haptic(hap, 40);
          toast(`Neue Etage gebaut: ${stationName(`f${e.floor}` as StationId)}!`, 'gold');
          setTimeout(() => worldRef.current?.focus(`f${e.floor}` as StationId), 150);
          break;
        case 'upgrade':
          audio.play(e.milestone ? 'milestone' : 'upgrade');
          haptic(hap, e.milestone ? 30 : 10);
          if (e.milestone) toast(`Meilenstein erreicht: ${stationName(e.station)}!`, 'gold');
          break;
        case 'golden':
          audio.play('golden');
          haptic(hap, 30);
          if (e.reward.kind === 'cash') toast(`Geldregen: +${formatMoney(e.reward.amount, n)}`, 'gold');
          else if (e.reward.kind === 'rush') toast(`Goldrausch! Alle Etagen ×${e.reward.factor} Tempo für ${e.reward.duration} s`, 'gold');
          else toast(`Express! Aufzug und Lieferwagen ×${e.reward.factor} Tempo für ${e.reward.duration} s`, 'gold');
          break;
        case 'quest':
          audio.play('claim');
          haptic(hap, 20);
          toast(`Auftrag erledigt: +${formatMoney(e.reward, n)}`, 'good');
          setBump((b) => b + 1);
          break;
        case 'hire':
          audio.play('hire');
          break;
        case 'skill': {
          const m = store.state.managers.find((x) => x.id === e.managerId);
          if (m) {
            const r = BALANCE.managers.rarities[m.rarity];
            toast(`${BONUS_INFO[m.bonus].active} aktiv für ${r.duration} s`, 'gold');
          }
          audio.play('skill');
          break;
        }
        case 'fail':
          audio.play('fail');
          haptic(hap, 20);
          break;
        default:
          break;
      }
    });
  }, [store, toast]);

  // settings → audio
  useEffect(() => {
    const apply = () => {
      audio.setSfx(store.state.settings.sound);
      audio.setMusic(store.state.settings.music);
    };
    apply();
    return store.subscribe(apply);
  }, [store]);

  // first gesture unlocks audio (autoplay policies, iOS)
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // visibility / lifecycle
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        store.onHidden();
        worldRef.current?.pause(true);
        audio.suspend();
      } else {
        store.handleAbsence();
        worldRef.current?.pause(false);
        audio.resume();
      }
    };
    const onHide = () => store.onHidden();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [store]);

  // install prompt (Android/desktop Chrome)
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  // block pinch / double-tap zoom on iOS
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', prevent);
    document.addEventListener('dblclick', prevent);
    return () => {
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('dblclick', prevent);
    };
  }, []);

  const close = useCallback(() => setSheet(null), []);
  const openStation = useCallback((id: StationId) => {
    setSheet({ kind: 'station', id });
    worldRef.current?.focus(id);
  }, []);

  return (
    <GameContext.Provider value={store}>
      <div className="app">
        <div className="world-host" ref={hostRef} data-testid="world" />
        <TopBar onSettings={() => setSheet({ kind: 'settings' })} onStation={openStation} bump={bump} refEl={topRef} />
        <div className="bottom-ui" ref={bottomRef}>
          <QuestCard onFocus={(id) => worldRef.current?.focus(id)} onClaim={() => store.claimQuest()} />
          <BottomNav onOpen={(w) => setSheet({ kind: w } as SheetState)} refEl={null} />
        </div>
        <Toasts items={toasts} />
        {updateAvailable && (
          <div className="toasts" style={{ top: 'auto', bottom: 'calc(var(--safe-bottom) + 170px)', pointerEvents: 'auto' }}>
            <div className="toast gold" style={{ animation: 'toastIn 0.3s ease' }}>
              Neue Version verfügbar{' '}
              <button className="btn small gold" onClick={onUpdate} style={{ marginLeft: 8, minHeight: 30 }}>
                Aktualisieren
              </button>
            </div>
          </div>
        )}

        {sheet?.kind === 'station' && <StationSheet id={sheet.id} onClose={close} onManagers={(id) => setSheet({ kind: 'managers', target: id })} />}
        {sheet?.kind === 'unlock' && <UnlockSheet floor={sheet.floor} onClose={close} />}
        {sheet?.kind === 'managers' && <ManagerSheet target={sheet.target} onClose={close} onHired={(id) => setReveal(id)} />}
        {sheet?.kind === 'overview' && <OverviewSheet onClose={close} onStation={openStation} />}
        {sheet?.kind === 'quests' && <QuestsSheet onClose={close} />}
        {sheet?.kind === 'stats' && <StatsSheet onClose={close} />}
        {sheet?.kind === 'settings' && (
          <SettingsSheet
            onClose={close}
            installPrompt={!!installEvt}
            onInstall={() => {
              void installEvt?.prompt();
              setInstallEvt(null);
            }}
          />
        )}
        {reveal && <HireReveal managerId={reveal} onClose={() => setReveal(null)} />}
        <OfflineDialog
          onCollect={() => {
            store.dismissOffline();
            audio.unlock();
            audio.play('claim');
            setBump((b) => b + 1);
          }}
        />
        {store.blockedByOtherTab && (
          <div className="dialog-wrap">
            <div className="dialog panel">
              <h2>Schon geöffnet</h2>
              <p>Cocoa Crown läuft bereits in einem anderen Tab oder Fenster. Damit kein Fortschritt doppelt gezählt wird, spielst du bitte dort weiter.</p>
            </div>
          </div>
        )}
      </div>
    </GameContext.Provider>
  );
}
