import type { ReactNode } from 'react';
import { BALANCE, type FloorDef, type LogisticsMilestone, type Milestone } from '../../config/balance';
import { BONUS_INFO, FLOOR_FLAVOR, bonusTitle } from '../../config/content';
import { formatMoney, formatMultiplier, formatNumber, formatRate } from '../../core/format';
import { quoteUpgrade } from '../../sim/actions';
import { analyzeFlow, crownsMissingFor, floorIndex, floorStatsAt, floorUnlockCost, liftStatsAt, managerOf, nextFloorMilestone, nextLogisticsMilestone, previousMilestoneLevel, shipStatsAt, oberhausFactor } from '../../sim/formulas';
import type { BuyMode, StationId } from '../../sim/types';
import { useGameVersion, useStore } from '../useGame';
import { Sheet } from './Hud';
import { IconLift, IconLock, IconProduct, IconTruck, IconUpgrade, IconWarn, Portrait } from '../icons';

const MODES: BuyMode[] = [1, 10, 25, 100, 'max'];

function Row({ k, now, next }: { k: string; now: string; next?: string }) {
  return (
    <tr>
      <td>{k}</td>
      <td className="now">{now}</td>
      <td className={`next ${!next || next === now ? 'same' : ''}`}>{next && next !== now ? `→ ${next}` : ''}</td>
    </tr>
  );
}

function milestoneText(m: Milestone | LogisticsMilestone, kind: 'floor' | 'lift' | 'ship'): string {
  const parts: string[] = [];
  if ('effect' in m) parts.push(m.effect === 'speed' ? `Tempo ${formatMultiplier(m.factor)}` : `Menge ${formatMultiplier(m.factor)}`);
  if ('capacity' in m && m.capacity) parts.push(`Kapazität ${formatMultiplier(m.capacity)}`);
  if ('speed' in m && m.speed) parts.push(`Tempo ${formatMultiplier(m.speed)}`);
  if ('worker' in m && m.worker) parts.push('+1 Arbeiter');
  if ('vehicle' in m && m.vehicle) parts.push('+1 Lieferwagen');
  if ('tier' in m && m.tier) parts.push(kind === 'floor' ? 'neue Maschinenstufe' : 'neue Ausbaustufe');
  return parts.join(' · ');
}

export function StationSheet({ id, onClose, onManagers }: { id: StationId; onClose: () => void; onManagers: (id: StationId) => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  const mode = s.settings.buyMode;
  const q = quoteUpgrade(s, id, mode);
  const levels = q.levels;
  const flow = analyzeFlow(s);
  const m = managerOf(s, id);

  let title = '';
  let sub = '';
  let icon: ReactNode = null;
  let level = 1;
  let rows: ReactNode = null;
  let flavor = '';
  let ms: { next: Milestone | LogisticsMilestone | null; prev: number; kind: 'floor' | 'lift' | 'ship' };
  let bottleneck = false;

  if (id === 'lift') {
    const a = liftStatsAt(s, s.lift.level);
    const b = liftStatsAt(s, s.lift.level + levels);
    level = s.lift.level;
    title = 'Lastenaufzug';
    sub = `Level ${level} · Transport`;
    icon = <IconLift size={40} />;
    flavor = 'Fährt nach oben, lädt Etage für Etage und kehrt um, sobald er voll ist. Mehr Etagen bedeuten längere Fahrten.';
    rows = (
      <>
        <Row k="Ladung pro Fahrt" now={formatMoney(a.capacity, n)} next={formatMoney(b.capacity, n)} />
        <Row k="Fahrzeit bis oben" now={`${formatNumber(a.tripTime, n, 1)} s`} next={`${formatNumber(b.tripTime, n, 1)} s`} />
        {oberhausFactor(s) > 1 && <Row k="Oberhaus-Ausbau" now={formatMultiplier(oberhausFactor(s))} />}
        <Row k="Transportleistung" now={formatRate(a.rate, n)} next={formatRate(b.rate, n)} />
        <Row k="Versandlager" now={formatMoney(a.depotCap, n)} next={formatMoney(b.depotCap, n)} />
      </>
    );
    ms = { next: nextLogisticsMilestone(level, BALANCE.lift.milestones), prev: previousMilestoneLevel(level, BALANCE.lift.milestones), kind: 'lift' };
    bottleneck = flow.bottleneck === 'lift';
  } else if (id === 'ship') {
    const a = shipStatsAt(s, s.ship.level);
    const b = shipStatsAt(s, s.ship.level + levels);
    level = s.ship.level;
    title = 'Versand';
    sub = `Level ${level} · Lieferwagen-Flotte`;
    icon = <IconTruck size={44} />;
    flavor = 'Die Lieferwagen holen Ware aus dem Versandlager und verkaufen sie in der Stadt. Erst dort entsteht Geld.';
    rows = (
      <>
        <Row k="Lieferwagen" now={`${a.vans}`} next={`${b.vans}`} />
        <Row k="Ladung pro Runde" now={formatMoney(a.capacity, n)} next={formatMoney(b.capacity, n)} />
        <Row k="Rundfahrt" now={`${formatNumber(a.roundTrip, n, 1)} s`} next={`${formatNumber(b.roundTrip, n, 1)} s`} />
        <Row k="Verkaufsleistung" now={formatRate(a.rate, n)} next={formatRate(b.rate, n)} />
        {a.priceFactor !== 1 && <Row k="Verkaufspreis" now={formatMultiplier(a.priceFactor)} />}
        {oberhausFactor(s) > 1 && <Row k="Oberhaus-Ausbau" now={formatMultiplier(oberhausFactor(s))} />}
      </>
    );
    ms = { next: nextLogisticsMilestone(level, BALANCE.shipping.milestones), prev: previousMilestoneLevel(level, BALANCE.shipping.milestones), kind: 'ship' };
    bottleneck = flow.bottleneck === 'ship';
  } else {
    const i = floorIndex(id);
    const def = BALANCE.floors[i];
    const f = s.floors[i];
    level = f.level;
    const a = floorStatsAt(s, i, level);
    const b = floorStatsAt(s, i, level + levels);
    title = def.productPlural;
    sub = `Etage ${i + 1} · ${def.machine} · Level ${level}`;
    icon = <IconProduct floor={i} size={42} />;
    flavor = FLOOR_FLAVOR[i];
    rows = (
      <>
        <Row k="Menge pro Zyklus" now={`${formatNumber(a.unitsPerCycle, n, 0)} Stk.`} next={`${formatNumber(b.unitsPerCycle, n, 0)} Stk.`} />
        <Row k="Zykluszeit" now={`${formatNumber(a.cycle, n, 2)} s`} next={`${formatNumber(b.cycle, n, 2)} s`} />
        <Row k="Wert pro Stück" now={formatMoney(def.unitValue, n)} />
        <Row k="Wert pro Charge" now={formatMoney(a.batch, n)} next={formatMoney(b.batch, n)} />
        <Row k="Produktion" now={formatRate(a.rate, n)} next={formatRate(b.rate, n)} />
        <Row k="Zwischenlager" now={formatMoney(a.bufferCap, n)} next={formatMoney(b.bufferCap, n)} />
        <Row k="Arbeiter" now={`${a.workers}`} next={`${b.workers}`} />
      </>
    );
    ms = { next: nextFloorMilestone(level), prev: previousMilestoneLevel(level, BALANCE.floorMilestones), kind: 'floor' };
    bottleneck = flow.bottleneck === 'production';
  }

  const msFrac = ms.next ? (level - ms.prev) / (ms.next.level - ms.prev) : 1;
  const missing = q.affordable ? null : q.cost.sub(s.money);
  const r = m ? BALANCE.managers.rarities[m.rarity] : null;

  return (
    <Sheet title={title} sub={sub} icon={icon} onClose={onClose}>
      <p className="flavor">{flavor}</p>
      {bottleneck && (
        <div className="install-hint" style={{ borderColor: '#b83a31', background: '#ffe9e5', marginBottom: 10 }}>
          <IconWarn size={18} /> <b>Engpass:</b> Diese Stufe bremst gerade deine ganze Kette. Ein Upgrade hier erhöht dein Einkommen direkt.
        </div>
      )}
      <table className="stats">
        <tbody>{rows}</tbody>
      </table>

      {ms.next && (
        <>
          <div className="section-title">Nächster Meilenstein</div>
          <div className="milestone">
            <div className="m-text">
              <b>Level {ms.next.level}</b>
              {milestoneText(ms.next, ms.kind)}
              <div className="bar gold">
                <i style={{ width: `${Math.max(0, Math.min(1, msFrac)) * 100}%` }} />
              </div>
            </div>
          </div>
        </>
      )}

      <div className="buy-modes" role="group" aria-label="Anzahl">
        {MODES.map((md) => (
          <button key={String(md)} className={md === mode ? 'on' : ''} onClick={() => store.setSettings({ buyMode: md })}>
            {md === 'max' ? 'MAX' : `×${md}`}
          </button>
        ))}
      </div>
      <button className="btn mint block buy-btn" disabled={!q.affordable || q.atMax} onClick={() => store.buy(id, mode)} data-testid="buy">
        {!q.atMax && <IconUpgrade size={20} />} {q.atMax ? 'Maximales Level' : `Verbessern +${levels} Level`}
        {!q.atMax && <span className="sub">{formatMoney(q.cost, n)}</span>}
      </button>
      {missing && !q.atMax && <div className="missing">Es fehlen noch {formatMoney(missing, n)}.</div>}

      <div className="section-title">Manager</div>
      {m && r ? (
        <div className="mgr-card">
          <Portrait m={m} />
          <div className="info">
            <div className="name">{m.name}</div>
            <span className={`rarity r${m.rarity}`}>{r.name}</span> {bonusTitle(m.category, m.bonus)}
            <div>
              {m.bonus === 'cost' ? `−${Math.round(r.costCut * 100)} % Upgradekosten` : `+${Math.round(r.passive * 100)} % ${BONUS_INFO[m.bonus].passive}`}
            </div>
          </div>
          <div className="actions">
            <button className="btn gold small" disabled={m.skillCooldown > 0 || m.skillActive > 0} onClick={() => store.skill(m.id)}>
              {m.skillActive > 0 ? `Aktiv ${Math.ceil(m.skillActive)} s` : m.skillCooldown > 0 ? `${Math.ceil(m.skillCooldown)} s` : 'Fähigkeit'}
            </button>
            <button className="btn small" onClick={() => onManagers(id)}>
              Wechseln
            </button>
          </div>
        </div>
      ) : (
        <div className="hire-box">
          <div className="t">
            <b>Noch kein Manager.</b> Ohne Manager startet jeder Arbeitsgang erst nach einem Tipp. Ein Manager automatisiert die Station – auch während du offline bist.
          </div>
          <button className="btn mint small" onClick={() => onManagers(id)}>
            Einstellen
          </button>
        </div>
      )}
    </Sheet>
  );
}

export function UnlockSheet({ floor, onClose }: { floor: number; onClose: () => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  const def = BALANCE.floors[floor] as FloorDef | undefined;
  if (!def || s.floors[floor].unlocked) return null;
  const cost = floorUnlockCost(floor);
  const st = floorStatsAt(s, floor, 1);
  const crownsMissing = crownsMissingFor(s, floor);
  const can = s.money.gte(cost) && crownsMissing === 0;
  const prevUnlocked = floor === 0 || s.floors[floor - 1].unlocked;
  return (
    <Sheet title={`Etage ${floor + 1}: ${def.productPlural}`} sub={def.machine} icon={<IconProduct floor={floor} size={42} />} onClose={onClose}>
      <p className="flavor">{FLOOR_FLAVOR[floor]}</p>
      <table className="stats">
        <tbody>
          <Row k="Wert pro Stück" now={formatMoney(def.unitValue, n)} />
          <Row k="Produktion auf Level 1" now={formatRate(st.rate, n)} />
          <Row k="Zykluszeit" now={`${def.baseCycle} s`} />
        </tbody>
      </table>
      {def.logistics ? (
        <p className="flavor oberhaus" style={{ marginTop: 10 }}>
          <b>Oberhaus-Ausbau:</b> Mit dieser Etage bekommen Aufzug und Lieferwagen größere Kabinen und Laderäume – ihre Kapazität steigt um ×{def.logistics}. Die
          Fahrt des Aufzugs wird trotzdem etwas länger.
        </p>
      ) : (
        <p className="flavor" style={{ marginTop: 10 }}>
          Achtung: Jede neue Etage verlängert die Fahrt des Aufzugs. Behalte die Logistik im Blick.
        </p>
      )}
      {def.crowns ? (
        <p className={`flavor crown-gate${crownsMissing > 0 ? ' locked' : ''}`} style={{ marginTop: 8 }} data-testid="crown-gate">
          <b>Kronen-Siegel:</b> Diese Etage lässt sich erst ab {def.crowns} Kronen bauen. Ausgegebene Kronen zählen mit.
          {crownsMissing > 0 ? ` Dir fehlen noch ${crownsMissing}.` : ' Bedingung erfüllt.'}
        </p>
      ) : null}
      <button
        className="btn gold block buy-btn"
        disabled={!can || !prevUnlocked}
        onClick={() => {
          if (store.unlock(floor)) onClose();
        }}
        data-testid="unlock"
      >
        {!can && <IconLock size={18} />} Etage bauen
        <span className="sub">{formatMoney(cost, n)}</span>
      </button>
      {s.money.lt(cost) && <div className="missing">Es fehlen noch {formatMoney(cost.sub(s.money), n)}.</div>}
    </Sheet>
  );
}
