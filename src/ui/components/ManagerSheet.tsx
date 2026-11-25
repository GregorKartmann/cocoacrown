import { useState } from 'react';
import { BALANCE } from '../../config/balance';
import { BONUS_INFO, CATEGORY_NAMES, bonusTitle } from '../../config/content';
import { formatMoney, formatMultiplier } from '../../core/format';
import { categoryOf } from '../../sim/actions';
import { managerHireCost } from '../../sim/formulas';
import type { Manager, ManagerCategory, StationId } from '../../sim/types';
import { useGameVersion, useStore } from '../useGame';
import { Sheet } from './Hud';
import { IconManager, Portrait } from '../icons';

const FLOOR_NAMES = ['Röstnibs', 'Trinkkakao', 'Tafeln', 'Pralinen', 'Trüffel', 'Nougat', 'Ruby', 'Signature-Box'];

export function stationName(id: StationId): string {
  if (id === 'lift') return 'Aufzug';
  if (id === 'ship') return 'Versand';
  const i = Number(id.slice(1));
  return `Etage ${i + 1} · ${FLOOR_NAMES[i]}`;
}

export function bonusLine(m: Manager): string {
  const r = BALANCE.managers.rarities[m.rarity];
  if (m.bonus === 'cost') return `−${Math.round(r.costCut * 100)} % Upgradekosten · Fähigkeit: weitere −50 % für ${r.duration} s`;
  return `+${Math.round(r.passive * 100)} % ${BONUS_INFO[m.bonus].passive} · Fähigkeit: ${formatMultiplier(r.active)} für ${r.duration} s`;
}

function ManagerCard({ m, target, onAssign }: { m: Manager; target?: StationId; onAssign: (id: StationId | null) => void }) {
  const store = useStore();
  const s = store.state;
  const r = BALANCE.managers.rarities[m.rarity];
  const stations: StationId[] =
    m.category === 'floor' ? s.floors.map((f, i) => (f.unlocked ? (`f${i}` as StationId) : null)).filter((x): x is StationId => !!x) : [m.category];
  const assignTarget = target && categoryOf(target) === m.category ? target : stations.find((st) => !s.managers.some((x) => x.assignedTo === st)) ?? stations[0];
  return (
    <div className="mgr-card">
      <Portrait m={m} />
      <div className="info">
        <div className="name">{m.name}</div>
        <span className={`rarity r${m.rarity}`}>{r.name}</span> {bonusTitle(m.category, m.bonus)}
        <div>{bonusLine(m)}</div>
        <div style={{ color: 'var(--ink-soft)' }}>{m.assignedTo ? `Arbeitet: ${stationName(m.assignedTo)}` : 'Frei'}</div>
      </div>
      <div className="actions">
        {m.assignedTo === assignTarget ? (
          <button className="btn small" onClick={() => onAssign(null)}>
            Abziehen
          </button>
        ) : (
          <button className="btn mint small" onClick={() => onAssign(assignTarget)}>
            {assignTarget && m.category === 'floor' ? `Etage ${Number(assignTarget.slice(1)) + 1}` : 'Zuweisen'}
          </button>
        )}
        {m.assignedTo && (
          <button className="btn gold small" disabled={m.skillCooldown > 0 || m.skillActive > 0} onClick={() => store.skill(m.id)}>
            {m.skillActive > 0 ? `${Math.ceil(m.skillActive)} s` : m.skillCooldown > 0 ? `${Math.ceil(m.skillCooldown / 60)} min` : 'Fähigkeit'}
          </button>
        )}
      </div>
    </div>
  );
}

export function ManagerSheet({ target, onClose, onHired }: { target?: StationId; onClose: () => void; onHired: (id: string) => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  const [cat, setCat] = useState<ManagerCategory>(target ? categoryOf(target) : 'floor');
  const cost = managerHireCost(s, cat);
  const list = s.managers.filter((m) => m.category === cat).sort((a, b) => b.rarity - a.rarity || (a.assignedTo ? -1 : 1));
  const total = BALANCE.managers.rarities.reduce((t, r) => t + r.weight, 0);
  const hireTarget: StationId | undefined =
    target && categoryOf(target) === cat
      ? target
      : cat === 'floor'
        ? (s.floors.map((f, i) => (f.unlocked && !f.managerId ? (`f${i}` as StationId) : null)).find((x) => x) ?? undefined)
        : cat === 'lift'
          ? s.lift.managerId
            ? undefined
            : 'lift'
          : s.ship.managerId
            ? undefined
            : 'ship';
  const targetHasManager = hireTarget ? s.managers.some((m) => m.assignedTo === hireTarget) : false;

  return (
    <Sheet title="Manager" sub={target ? `für ${stationName(target)}` : 'Automatisierung und Fähigkeiten'} icon={<IconManager size={40} />} onClose={onClose}>
      <div className="tabs">
        {(['floor', 'lift', 'ship'] as ManagerCategory[]).map((c) => (
          <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>
            {CATEGORY_NAMES[c]}
          </button>
        ))}
      </div>
      <div className="hire-box">
        <div className="t">
          <b>Neuen Manager einstellen</b>
          <br />
          Zufällige Seltenheit und Spezialisierung.
          {hireTarget && !targetHasManager && <> Wird direkt {stationName(hireTarget)} zugewiesen.</>}
          <div className="odds">
            {BALANCE.managers.rarities.map((r, i) => (
              <span key={r.id} className={`rarity r${i}`}>
                {r.name} {Math.round((r.weight / total) * 100)} %
              </span>
            ))}
          </div>
        </div>
        <button
          className="btn mint small"
          disabled={s.rewards.freeHires <= 0 && s.money.lt(cost)}
          onClick={() => {
            const id = store.hire(cat, hireTarget && !targetHasManager ? hireTarget : undefined);
            if (id) onHired(id);
          }}
          data-testid="hire"
        >
          Einstellen
          <span className="sub">{s.rewards.freeHires > 0 ? `kostenlos (${s.rewards.freeHires}×)` : formatMoney(cost, n)}</span>
        </button>
      </div>
      {list.length === 0 && <p className="flavor">Noch keine Manager in dieser Abteilung.</p>}
      {list.map((m) => (
        <ManagerCard key={m.id} m={m} target={target} onAssign={(st) => store.assign(m.id, st)} />
      ))}
      <p className="flavor" style={{ marginTop: 12 }}>
        Fähigkeiten aktivierst du auch direkt in der Spielwelt: Tippe auf das leuchtende Porträt an der Station. Danach braucht ein Manager {Math.round(BALANCE.managers.skillCooldown / 60)} Minuten Pause.
      </p>
    </Sheet>
  );
}

export function HireReveal({ managerId, onClose }: { managerId: string; onClose: () => void }) {
  const store = useStore();
  const m = store.state.managers.find((x) => x.id === managerId);
  if (!m) return null;
  const r = BALANCE.managers.rarities[m.rarity];
  return (
    <div className="dialog-wrap" onClick={onClose}>
      <div className="dialog panel" onClick={(e) => e.stopPropagation()} data-testid="hire-reveal">
        {m.rarity >= 1 && <div className="burst" />}
        <span className={`rarity r${m.rarity}`} style={{ fontSize: 14, padding: '2px 12px' }}>
          {r.name}
        </span>
        <div style={{ margin: '12px auto 6px', width: 128, height: 128 }}>
          <Portrait m={m} size={128} />
        </div>
        <h2>{m.name}</h2>
        <p>
          <b>{bonusTitle(m.category, m.bonus)}</b> · {CATEGORY_NAMES[m.category]}
        </p>
        <p>{bonusLine(m)}</p>
        <p>{m.assignedTo ? `Arbeitet ab sofort: ${stationName(m.assignedTo)}.` : 'Weise den Manager einer Station zu.'}</p>
        <button className="btn mint block" onClick={onClose} style={{ marginTop: 8 }}>
          Willkommen im Team!
        </button>
      </div>
    </div>
  );
}
