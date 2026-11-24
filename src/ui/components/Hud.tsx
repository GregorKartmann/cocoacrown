import { useEffect, useState, type ReactNode } from 'react';
import { formatDuration, formatMoney, formatNumber, formatRate } from '../../core/format';
import { currentQuest } from '../../sim/actions';
import { crownsAvailable, prestigeUnlocked } from '../../sim/formulas';
import { RESEARCH, RESEARCH_BY_ID, type ResearchId } from '../../config/research';
import { R, whyNot } from '../../sim/research';
import type { StationId } from '../../sim/types';
import { useGameVersion, useStore } from '../useGame';
import { IconBolt, IconBox, IconClose, IconCoin, IconCrown, IconFactory, IconGear, IconGift, IconLab, IconLift, IconManager, IconQuest, IconStats, IconTruck, IconWatch } from '../icons';

/* ------------------------------------------------------------------ */

export function Sheet({ title, sub, onClose, children, icon }: { title: string; sub?: string; onClose: () => void; children: ReactNode; icon?: ReactNode }) {
  // A sheet opened by a tap in the game world must not receive that tap's
  // follow-up "click" (ghost click), so it ignores input for a moment.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 350);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" onClick={() => armed && onClose()} />
      <div className="sheet panel" role="dialog" aria-label={title} style={armed ? undefined : { pointerEvents: 'none' }}>
        <div className="sheet-head">
          {icon}
          <h2>
            {title}
            {sub && <span className="sub">{sub}</span>}
          </h2>
          <button className="btn close-btn" onClick={onClose} aria-label="Schließen">
            <IconClose />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

export function TopBar({
  onSettings,
  onStation,
  onPrestige,
  bump,
  refEl,
}: {
  onSettings: () => void;
  onStation: (id: StationId) => void;
  onPrestige: () => void;
  bump: number;
  refEl: React.Ref<HTMLDivElement>;
}) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  const flow = store.flow();
  const measured = store.income.rate();
  const [bumping, setBumping] = useState(false);
  useEffect(() => {
    if (!bump) return;
    setBumping(true);
    const t = setTimeout(() => setBumping(false), 160);
    return () => clearTimeout(t);
  }, [bump]);
  const showBottleneck = s.stats.vanTrips > 0;
  const claimable = prestigeUnlocked(s) ? crownsAvailable(s) : 0;
  const topFloor = s.floors.reduce((m, f, i) => (f.unlocked ? i : m), 0);
  const prodStation = (`f${topFloor}`) as StationId;
  const chips: { id: StationId; key: 'production' | 'lift' | 'ship'; label: string; icon: ReactNode; v: string }[] = [
    // shown as money per second (sale price incl. crowns), so the chips match the income line
    { id: prodStation, key: 'production', label: 'Produktion', icon: <IconBox />, v: formatRate(flow.production.mul(flow.priceFactor), n) },
    { id: 'lift', key: 'lift', label: 'Aufzug', icon: <IconLift />, v: formatRate(flow.lift.mul(flow.priceFactor), n) },
    { id: 'ship', key: 'ship', label: 'Versand', icon: <IconTruck />, v: formatRate(flow.ship.mul(flow.priceFactor), n) },
  ];
  return (
    <div className="topbar" ref={refEl}>
      <div className="money-row">
        <div className={`money panel ${bumping ? 'bump' : ''}`}>
          <span className="coin" id="money-anchor">
            <IconCoin size={38} />
          </span>
          <div className="money-text">
            <span className="money-value" data-testid="money">
              {formatMoney(s.money, n)}
            </span>
            <span className="money-rate">+{formatRate(measured, n)}</span>
          </div>
        </div>
        {prestigeUnlocked(s) && (
          <button className={`btn icon-btn crown-btn ${claimable > 0 ? 'ready' : ''}`} onClick={onPrestige} aria-label="Marke verkaufen" data-testid="crown-btn">
            <IconCrown size={30} />
            {claimable > 0 && <span className="crown-badge">+{formatNumber(claimable, n, 0)}</span>}
          </button>
        )}
        <button className="btn icon-btn" onClick={onSettings} aria-label="Einstellungen">
          <IconGear size={30} />
        </button>
      </div>
      <div className="flow" aria-label="Logistikkette">
        {chips.map((c) => (
          <button key={c.key} className={`flow-chip ${showBottleneck && flow.bottleneck === c.key ? 'bottleneck' : ''}`} onClick={() => onStation(c.id)}>
            {c.icon}
            <span className="v">
              <span className="k">{showBottleneck && flow.bottleneck === c.key ? 'Engpass' : c.label}</span>
              <span className="n">{c.v}</span>
            </span>
          </button>
        ))}
      </div>
      {s.boosts.length > 0 && (
        <div className="boosts">
          {s.boosts.map((b) => (
            <span key={b.kind} className="boost">
              <IconBolt />
              {b.kind === 'rush' ? 'Goldrausch' : 'Express'} ×{b.factor} · {Math.ceil(b.remaining)} s
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function QuestCard({ onFocus, onClaim }: { onFocus: (id: StationId) => void; onClaim: () => void }) {
  useGameVersion();
  const store = useStore();
  const q = currentQuest(store.state);
  const [open, setOpen] = useState(true);
  if (!q) return null;
  const n = store.state.settings.notation;
  const frac = Math.min(1, q.progress / q.def.target);
  const progressText = q.def.target >= 100 ? `${Math.round(frac * 100)} %` : `${Math.floor(q.progress)}/${q.def.target}`;
  return (
    <div
      className={`quest panel ${q.done ? 'done' : ''}`}
      onClick={() => {
        if (q.done) return;
        setOpen((o) => !o);
        if (q.def.focus) onFocus(q.def.focus);
      }}
      data-testid="quest"
    >
      <div className="qicon">{q.done ? <IconGift size={28} /> : <IconQuest size={28} />}</div>
      <div className="qbody">
        <div className="qtitle">{q.def.title}</div>
        {open && <div className="qtext">{q.def.text}</div>}
        <div className="qmeta">
          <div className="bar gold">
            <i style={{ width: `${frac * 100}%` }} />
          </div>
          <span>{progressText}</span>
          <span>+{formatMoney(q.def.reward, n)}</span>
        </div>
      </div>
      {q.done && (
        <button
          className="btn gold small"
          onClick={(e) => {
            e.stopPropagation();
            onClaim();
          }}
          data-testid="claim"
        >
          <IconGift size={18} /> Abholen
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function BottomNav({ onOpen, refEl }: { onOpen: (what: 'overview' | 'managers' | 'quests' | 'research' | 'stats') => void; refEl: React.Ref<HTMLDivElement> }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const readySkill = s.managers.some((m) => m.assignedTo && m.skillCooldown <= 0 && m.skillActive <= 0);
  const unmanaged = s.floors.some((f) => f.unlocked && !f.managerId) || !s.lift.managerId || !s.ship.managerId;
  const q = currentQuest(s);
  const labIdle = s.research.open && !s.research.active && RESEARCH.some((n) => whyNot(s, n.id) === null);
  return (
    <nav className="nav panel" ref={refEl}>
      <button onClick={() => onOpen('overview')} data-testid="nav-overview">
        <IconFactory size={30} />
        Werk
      </button>
      <button onClick={() => onOpen('managers')} data-testid="nav-managers">
        <IconManager size={30} />
        Manager
        {(unmanaged || readySkill) && <span className="dot" />}
      </button>
      <button onClick={() => onOpen('quests')}>
        <IconQuest size={30} />
        Aufträge
        {q?.done && <span className="dot" />}
      </button>
      <button onClick={() => onOpen('research')} data-testid="nav-research" className={s.research.open ? '' : 'locked'}>
        <IconLab size={30} />
        Labor
        {labIdle && <span className="dot" />}
      </button>
      <button onClick={() => onOpen('stats')}>
        <IconStats size={30} />
        Statistik
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------ */

export interface ToastItem {
  id: number;
  text: string;
  tone?: string;
}

export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function OfflineDialog({ onCollect }: { onCollect: () => void }) {
  useGameVersion();
  const store = useStore();
  const r = store.offlineReport;
  if (!r) return null;
  const n = store.state.settings.notation;
  const stageName = r.bottleneck === 'lift' ? 'der Aufzug' : r.bottleneck === 'ship' ? 'der Versand' : 'die Produktion';
  const worstFloor = r.floorStallShare.reduce((best, v, i) => (v > best.v ? { i, v } : best), { i: -1, v: 0 });
  return (
    <div className="dialog-wrap">
      <div className="dialog panel" data-testid="offline-dialog">
        <div className="burst" />
        <IconWatch size={56} />
        <br />
        <span className="ribbon">Willkommen zurück!</span>
        <h2>Deine Manufaktur hat weitergearbeitet</h2>
        <p>
          Du warst {formatDuration(r.awaySeconds)} weg
          {r.capped ? ` – angerechnet werden höchstens ${formatDuration(R.offlineSeconds(store.state))}` : ''}.
        </p>
        <div className="big-amount">
          <IconCoin size={38} /> {formatMoney(r.earned, n)}
        </div>
        <p>Produzierte Ware im Wert von {formatMoney(r.produced, n)}.</p>
        {r.researchDone.length > 0 && <p>Im Rezeptlabor fertig geworden: {r.researchDone.map((id) => RESEARCH_BY_ID[id as ResearchId]?.name ?? id).join(', ')}.</p>}
        {worstFloor.v > 0.25 && (
          <p>
            Engpass: {stageName}. Etage {worstFloor.i + 1} war {Math.round(worstFloor.v * 100)} % der Zeit voll – hier lohnt sich jetzt ein Upgrade.
          </p>
        )}
        <button className="btn gold block buy-btn" onClick={onCollect} style={{ marginTop: 10 }} data-testid="collect">
          Einsammeln
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

