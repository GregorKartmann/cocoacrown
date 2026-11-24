import { useRef, useState } from 'react';
import { canVibrate, isIos } from '../../audio/audio';
import { BALANCE } from '../../config/balance';
import { QUESTS } from '../../config/quests';
import { formatDuration, formatMoney, formatMultiplier, formatNumber, formatRate } from '../../core/format';
import { quoteUpgrade } from '../../sim/actions';
import { analyzeFlow, crownFactor, floorStats, liftStats, prestigeUnlocked, shipStats } from '../../sim/formulas';
import type { StationId } from '../../sim/types';
import { useGameVersion, useStore } from '../useGame';
import { Sheet } from './Hud';
import { IconCheck, IconCrown, IconFactory, IconGear, IconQuest, IconSound, IconStats } from '../icons';
import { stationName } from './ManagerSheet';
import { DEV_STATUS, APP_VERSION } from '../devStatus';

export function OverviewSheet({ onClose, onStation }: { onClose: () => void; onStation: (id: StationId) => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  const flow = analyzeFlow(s);
  const mode = s.settings.buyMode;
  const items: { id: StationId; level: number; rate: string; hasMgr: boolean; hot: boolean }[] = [];
  s.floors.forEach((f, i) => {
    if (!f.unlocked) return;
    items.push({ id: `f${i}` as StationId, level: f.level, rate: formatRate(floorStats(s, i).rate, n), hasMgr: !!f.managerId, hot: flow.bottleneck === 'production' });
  });
  items.push({ id: 'lift', level: s.lift.level, rate: formatRate(liftStats(s).rate, n), hasMgr: !!s.lift.managerId, hot: flow.bottleneck === 'lift' });
  items.push({ id: 'ship', level: s.ship.level, rate: formatRate(shipStats(s).rate, n), hasMgr: !!s.ship.managerId, hot: flow.bottleneck === 'ship' });
  return (
    <Sheet title="Werksübersicht" sub="Alle Stationen auf einen Blick" icon={<IconFactory size={40} />} onClose={onClose}>
      <p className="flavor">
        Dein Einkommen ist so hoch wie die langsamste Stufe: Produktion {formatRate(flow.production.mul(flow.priceFactor), n)}, Aufzug{' '}
        {formatRate(flow.lift.mul(flow.priceFactor), n)}, Versand {formatRate(flow.ship.mul(flow.priceFactor), n)}.
        {flow.priceFactor !== 1 && ` Verkaufspreis ×${formatNumber(flow.priceFactor, n, 2)}.`}
      </p>
      <div className="buy-modes">
        {([1, 10, 25, 100, 'max'] as const).map((md) => (
          <button key={String(md)} className={md === mode ? 'on' : ''} onClick={() => store.setSettings({ buyMode: md })}>
            {md === 'max' ? 'MAX' : `×${md}`}
          </button>
        ))}
      </div>
      {items.map((it) => {
        const q = quoteUpgrade(s, it.id, mode);
        return (
          <div key={it.id} className="mgr-card" style={it.hot ? { borderColor: '#b83a31', background: '#fff1ee' } : undefined}>
            <div className="info" onClick={() => onStation(it.id)} style={{ cursor: 'pointer' }}>
              <div className="name">{stationName(it.id)}</div>
              Level {it.level} · {it.rate}
              {!it.hasMgr && <div style={{ color: '#b83a31' }}>Ohne Manager – läuft nur per Tipp</div>}
              {it.hot && <div style={{ color: '#b83a31', fontWeight: 700 }}>Engpass</div>}
            </div>
            <button className="btn mint small" disabled={!q.affordable} onClick={() => store.buy(it.id, mode)}>
              +{q.levels}
              <span className="sub">{formatMoney(q.cost, n)}</span>
            </button>
          </div>
        );
      })}
    </Sheet>
  );
}

export function QuestsSheet({ onClose }: { onClose: () => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  return (
    <Sheet title="Aufträge" sub={`${Math.min(s.quest.index, QUESTS.length)} von ${QUESTS.length} erledigt`} icon={<IconQuest size={40} />} onClose={onClose}>
      {QUESTS.map((q, i) => {
        const done = i < s.quest.index;
        const current = i === s.quest.index;
        const p = Math.min(q.target, q.progress(s));
        return (
          <div key={q.id} className={`quest-row ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
            <span className="chk">{done ? <IconCheck size={16} /> : i + 1}</span>
            <div>
              <b>{q.title}</b>
              {current && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  {q.text} ({q.target >= 100 ? `${Math.floor((p / q.target) * 100)} %` : `${Math.floor(p)}/${q.target}`})
                </div>
              )}
            </div>
            <span className="r">{i > s.quest.index ? '???' : `+${formatMoney(q.reward, n)}`}</span>
          </div>
        );
      })}
      {s.quest.index >= QUESTS.length && (
        <p className="flavor">Alle Aufträge der Manufaktur erledigt. Forschung, Prestige und neue Werke folgen in der nächsten Ausbaustufe.</p>
      )}
    </Sheet>
  );
}

export function StatsSheet({ onClose, onPrestige }: { onClose: () => void; onPrestige: () => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  const st = s.stats;
  const rows: [string, string][] = [
    ['Insgesamt verdient', formatMoney(st.totalEarned, n)],
    ['Aktuelles Einkommen (gemessen)', formatRate(store.income.rate(), n)],
    ['Theoretisches Einkommen', formatRate(analyzeFlow(s).income, n)],
    ['Gespielte Zeit', formatDuration(st.playSeconds)],
    ['Offline gutgeschrieben', formatDuration(st.offlineSeconds)],
    ['Fertige Chargen', formatNumber(st.batches, n, 0)],
    ['Aufzugsfahrten', formatNumber(st.liftTrips, n, 0)],
    ['Lieferungen', formatNumber(st.vanTrips, n, 0)],
    ['Tipps', formatNumber(st.taps, n, 0)],
    ['Goldene Kakaobohnen', formatNumber(st.goldenCaught, n, 0)],
    ['Manager eingestellt', formatNumber(st.managersHired, n, 0)],
    ['Fähigkeiten eingesetzt', formatNumber(st.skillsUsed, n, 0)],
    ['Kronen', `${formatNumber(s.prestige.crowns, n, 0)} (Einkommen ${formatMultiplier(crownFactor(s))})`],
    ['Marke verkauft', `${formatNumber(s.prestige.runs, n, 0)}×`],
    ['Schnellster Weg zur 5. Etage', s.prestige.bestFloor5 === null ? '–' : formatDuration(s.prestige.bestFloor5)],
    ['Dieser Durchlauf', `${formatDuration(st.playSeconds - s.prestige.runStartPlay)} · ${formatMoney(st.totalEarned.sub(s.prestige.runStartEarned), n)}`],
  ];
  return (
    <Sheet title="Statistik" icon={<IconStats size={40} />} onClose={onClose}>
      <table className="stats">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td className="now">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn gold block" style={{ marginTop: 12 }} onClick={onPrestige} data-testid="open-prestige">
        <IconCrown size={22} /> {prestigeUnlocked(s) ? 'Marke verkaufen …' : 'Marke verkaufen (ab der 5. Etage)'}
      </button>
    </Sheet>
  );
}

export function SettingsSheet({ onClose, installPrompt, onInstall }: { onClose: () => void; installPrompt: boolean; onInstall: () => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  // Inside a host page (e.g. the Claude artifact preview) the game cannot be installed:
  // a home-screen shortcut would open the host page, not the game.
  const embedded = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const toggle = (k: 'sound' | 'music' | 'haptics', label: string) => (
    <div className="toggle-row">
      <span>
        {k === 'sound' && <IconSound size={24} />}
        {label}
      </span>
      <button className={`switch ${s[k] ? 'on' : ''}`} role="switch" aria-checked={s[k]} aria-label={label} onClick={() => store.setSettings({ [k]: !s[k] })} />
    </div>
  );

  const doExport = () => {
    const text = store.exportSave();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `cocoa-crown-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMsg('Spielstand exportiert.');
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(store.exportSave());
      setMsg('Spielstand in die Zwischenablage kopiert. Füge ihn als .json-Datei ein, um ihn später zu importieren.');
    } catch {
      setMsg('Kopieren ist hier nicht erlaubt – nutze „Als Datei“.');
    }
  };

  const doImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      store.importSave(await f.text());
      setMsg('Spielstand geladen.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Import fehlgeschlagen.');
    }
  };

  return (
    <Sheet title="Einstellungen" icon={<IconGear size={40} />} onClose={onClose}>
      {toggle('sound', 'Geräusche')}
      {toggle('music', 'Musik')}
      {(canVibrate || isIos) && toggle('haptics', isIos && !canVibrate ? 'Vibration (ab iOS 18)' : 'Vibration')}
      <div className="toggle-row">
        <span>Zahlen</span>
        <div className="seg">
          <button className={s.notation === 'short' ? 'on' : ''} onClick={() => store.setSettings({ notation: 'short' })}>
            1,2 Mio.
          </button>
          <button className={s.notation === 'scientific' ? 'on' : ''} onClick={() => store.setSettings({ notation: 'scientific' })}>
            1,2e6
          </button>
        </div>
      </div>

      <div className="section-title">Spielstand</div>
      <p className="flavor">Wird automatisch auf diesem Gerät gespeichert. Für einen Gerätewechsel oder als Sicherung kannst du ihn als Datei exportieren.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <button className="btn small" onClick={doExport}>
          Als Datei
        </button>
        <button className="btn small" onClick={() => void doCopy()}>
          Kopieren
        </button>
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          Importieren
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e.target.files?.[0])} />
      {msg && <div className="install-hint">{msg}</div>}
      {store.saveError && <div className="install-hint">Speichern fehlgeschlagen: {store.saveError}</div>}
      <button
        className="btn red block"
        style={{ marginTop: 10 }}
        onClick={() => {
          if (confirmReset < 1) setConfirmReset(1);
          else {
            store.resetGame();
            setConfirmReset(0);
            onClose();
          }
        }}
      >
        {confirmReset ? 'Wirklich alles löschen? Nochmal tippen' : 'Neu beginnen'}
      </button>

      <div className="section-title">App</div>
      {embedded && (
        <div className="install-hint">
          In dieser Vorschau lässt sich Cocoa Crown nicht als App installieren. Ein Symbol auf dem Home-Bildschirm öffnet nur die Vorschau-Seite, und die startet dort nicht. Als
          echte App mit eigenem Symbol und Offline-Start braucht das Spiel eine eigene Webadresse.
        </div>
      )}
      {!embedded && !standalone && installPrompt && (
        <button className="btn mint block" onClick={onInstall}>
          Als App installieren
        </button>
      )}
      {standalone && <p className="flavor">Läuft als installierte App.</p>}
      {!embedded && !standalone && !isIos && !installPrompt && (
        <div className="install-hint">Zum Installieren im Browsermenü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.</div>
      )}
      {!embedded && !standalone && isIos && (
        <div className="install-hint">
          Auf dem iPhone: In Safari auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen. Danach startet Cocoa Crown wie eine App und funktioniert offline.
        </div>
      )}

      <div className="section-title">Entwicklungsstand · Version {APP_VERSION}</div>
      <ul className="status-list">
        {DEV_STATUS.map((d) => (
          <li key={d.text}>
            <span className={`st ${d.done ? 'ok' : 'open'}`}>{d.done ? 'fertig' : 'offen'}</span>
            <span>{d.text}</span>
          </li>
        ))}
      </ul>
      <p className="flavor" style={{ marginTop: 10 }}>
        Offline-Ertrag: bis zu {formatDuration(BALANCE.offline.maxSeconds)} pro Abwesenheit, mit derselben Simulation wie im laufenden Spiel.
      </p>
    </Sheet>
  );
}
