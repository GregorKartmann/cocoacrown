import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DECOR_NAMES, DOORS, LAST_DOOR, LAST_FEATURE_DOOR, SHOP, WINTER_FLOORS, WINTER_MANAGER_NAME, type Decor, type DoorReward, type Perk } from '../../config/winter';
import { formatDuration, formatNumber } from '../../core/format';
import { artUrl } from '../../render/assets';
import { eventNow } from '../../game/clock';
import type { UiEvent } from '../../game/GameStore';
import {
  autoDoor,
  batchStars,
  buildDoor,
  daysUntil,
  door,
  doorState,
  doorsWaiting,
  eventRunning,
  floorAuto,
  floorAvailable,
  marketOpen,
  msToNextDoor,
  nextDoubling,
  ownedDecor,
  rewardLabel,
  shopBought,
  shopPrice,
  shopStock,
  starsPerSecond,
  upgradeCost,
  winterOfflineHours,
  type AdventPhase,
  type DoorState,
} from '../../sim/winter';
import type { GameState } from '../../sim/types';
import { useGameVersion, useStore } from '../useGame';
import { Sheet } from './Hud';

export type WinterTab = 'factory' | 'calendar' | 'market';

const ZIMTSTERN = 'winter/oberflaeche/zimtstern';

function Art({ k, size, className, style }: { k: string; size: number; className?: string; style?: CSSProperties }) {
  return <img className={className ?? 'icon-img'} src={artUrl(k)} alt="" style={{ width: size, height: size, objectFit: 'contain', ...style }} draggable={false} />;
}

const stars = (s: GameState, v: number) => formatNumber(v, s.settings.notation, 0);

const DECOR_ART: Record<Decor, string> = {
  schneefall: 'winter/effekte/schneeflocke',
  girlande: 'winter/deko/tannengirlande',
  lichterbogen: 'winter/deko/lichterkette_bogen',
  lichterturm: 'winter/deko/lichterkette_turm',
  baum: 'winter/deko/weihnachtsbaum',
  schneedach: 'winter/deko/fabrikdach_schnee',
};

const PERK_ART: Record<Perk, string> = {
  markt: 'winter/oberflaeche/winter_siegel',
  auto0: 'winter/maschinen/lebkuchenofen',
  auto1: 'winter/maschinen/glasierstation',
  auto2: 'winter/maschinen/festdosen_presse',
  floor1: 'winter/produkte/lebkuchenherz',
  floor2: 'winter/produkte/adventsdose',
  mehr25: 'winter/produkte/gewuerzlebkuchen',
  mehr50: 'winter/requisiten/mehl_und_gewuerze',
  offline: 'oberflaeche/offline',
  tagesziele: 'oberflaeche/auftraege',
};

export function rewardArt(r: DoorReward): string {
  switch (r.kind) {
    case 'stars':
      return ZIMTSTERN;
    case 'recipePoints':
      return 'forschung/forschungsmarke';
    case 'goldenBean':
      return 'produkte/goldene_kakaobohne';
    case 'managerHireCredit':
      return 'oberflaeche/manager';
    case 'weihnachtsmanager':
      return 'winter/figuren/weihnachtsmanager_portrait';
    case 'perk':
      return PERK_ART[r.perk];
    case 'decor':
      return DECOR_ART[r.decor];
  }
}

function rewardChip(r: DoorReward): string {
  return r.kind === 'decor' ? DECOR_NAMES[r.decor] : rewardLabel(r);
}

/** Taps waiting in the event (button badge). */
export function winterAttention(s: GameState, p: AdventPhase): number {
  return doorsWaiting(s, p);
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(eventNow());
  useEffect(() => {
    const t = setInterval(() => setNow(eventNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function phaseLine(p: AdventPhase, now: number): string {
  if (p.kind === 'preview') {
    const d = daysUntil(now, p.startsAt);
    return d <= 1 ? 'Morgen öffnet das 1. Türchen' : `Das 1. Türchen öffnet in ${d} Tagen`;
  }
  if (p.kind === 'active') {
    if (p.day <= LAST_FEATURE_DOOR) return `${p.day}. Dezember · Türchen ${p.day} ist offen`;
    return p.day === 25 ? '1. Weihnachtstag · Bonus-Türchen' : 'Letzter Tag des Events';
  }
  if (p.kind === 'ended') return 'Das Advent-Event ist vorbei';
  return '';
}

/* ------------------------------------------------------------------------- */
/* Manufaktur                                                                  */
/* ------------------------------------------------------------------------- */

interface Float {
  id: number;
  floor: number;
  text: string;
}

function FloorCard({ i, floats }: { i: number; floats: Float[] }) {
  const store = useStore();
  const s = store.state;
  const p = store.advent;
  const def = WINTER_FLOORS[i];
  const f = s.winter.floors[i];
  const running = eventRunning(p);
  const auto = floorAuto(s, i);
  const available = floorAvailable(s, i);

  if (!f.built) {
    const canBuild = running && available;
    return (
      <div className={`wf-card locked ${canBuild ? 'buildable' : ''}`} data-testid={`wf-${i}`}>
        <img className="wf-bg" src={artUrl(def.bg)} alt="" draggable={false} />
        <img className="wf-machine" src={artUrl(def.machineArt)} alt="" draggable={false} />
        <div className="wf-plate">
          {i + 1} · {def.name}
        </div>
        <div className="wf-lock">
          {canBuild ? (
            <button className="btn gold" onClick={() => store.winterBuild(i)} disabled={s.winter.stars < def.build} data-testid={`wf-build-${i}`}>
              Bauen · {stars(s, def.build)} <Art k={ZIMTSTERN} size={18} />
            </button>
          ) : (
            <span className="wf-lock-text">
              <Art k="oberflaeche/gesperrt" size={22} />
              {running || p.kind === 'preview' ? `Ab Türchen ${buildDoor(i)} · ${def.product}` : def.product}
            </span>
          )}
        </div>
      </div>
    );
  }

  const cost = upgradeCost(s, i);
  const per = batchStars(s, i);
  const next = nextDoubling(f.level);
  const tapHint = running && !auto && !f.running;
  return (
    <div
      className={`wf-card ${f.running ? 'running' : ''} ${running ? '' : 'frozen'}`}
      onClick={() => running && store.winterTap(i)}
      role="button"
      aria-label={`${def.name} antippen`}
      data-testid={`wf-${i}`}
    >
      <img className="wf-bg" src={artUrl(def.bg)} alt="" draggable={false} />
      <img className="wf-prop" src={artUrl(def.prop)} alt="" draggable={false} />
      <img className="wf-machine" src={artUrl(def.machineArt)} alt="" draggable={false} />
      <div className="wf-plate">
        {i + 1} · {def.name}
      </div>
      <div className="wf-level">
        <small>Stufe</small>
        <b>{f.level}</b>
      </div>
      {tapHint && <div className="wf-hint">Tippen!</div>}
      {auto && (
        <div className="wf-auto">
          <Art k="winter/effekte/goldglanz" size={14} /> Wichtel {i === 0 ? 'backt' : i === 1 ? 'glasiert' : 'packt'}
        </div>
      )}
      {floats
        .filter((x) => x.floor === i)
        .map((x) => (
          <div key={x.id} className="wf-float">
            <Art k={ZIMTSTERN} size={18} />
            {x.text}
          </div>
        ))}
      <div className="wf-foot" onClick={(e) => e.stopPropagation()}>
        <div className="wf-progress">
          <div className="bar gold">
            <i style={{ width: `${Math.min(1, f.progress) * 100}%` }} />
          </div>
          <span>
            +{stars(s, per)} <Art k={ZIMTSTERN} size={13} /> · {def.cycle} s{f.level < next && <em> · ×2 ab Stufe {next}</em>}
          </span>
        </div>
        <button className="btn gold small wf-up" onClick={() => store.winterUpgrade(i)} disabled={!running || s.winter.stars < cost} data-testid={`wf-up-${i}`}>
          <Art k="oberflaeche/upgrade" size={16} /> {stars(s, cost)}
        </button>
      </div>
    </div>
  );
}

function FactoryTab() {
  const store = useStore();
  const s = store.state;
  const p = store.advent;
  const [floats, setFloats] = useState<Float[]>([]);
  const id = useRef(0);
  useEffect(
    () =>
      store.onUiEvent((e: UiEvent) => {
        if (e.type !== 'winterBatch') return;
        const f: Float = { id: ++id.current, floor: e.floor, text: `+${formatNumber(e.stars, store.state.settings.notation, 0)}` };
        setFloats((l) => [...l.slice(-5), f]);
        setTimeout(() => setFloats((l) => l.filter((x) => x.id !== f.id)), 1100);
      }),
    [store],
  );
  const nikolaus = s.managers.some((m) => m.name === WINTER_MANAGER_NAME);
  const autoNext = [0, 1, 2].find((i) => s.winter.floors[i].built && !floorAuto(s, i));
  let tip: string;
  if (p.kind === 'preview') tip = 'Die Bäckerei backt schon – tippe auf den Ofen und sammle Zimtsterne. Ab dem 1. Dezember öffnet jeden Tag ein Türchen mit neuen Etagen, Wichteln und Geschenken.';
  else if (p.kind === 'ended') tip = `Danke fürs Mitbacken! Du hast ${stars(s, s.winter.earned)} Zimtsterne gesammelt.${nikolaus ? ' Ich bleibe in deiner Kakao-Manufaktur.' : ''}`;
  else if (autoNext !== undefined) tip = `Tippe auf eine Etage, um eine Charge zu starten. Ab Türchen ${autoDoor(autoNext)} hilft ein Wichtel und arbeitet allein weiter – auch wenn du weg bist (bis ${winterOfflineHours(s)} h).`;
  else tip = `Alle Wichtel arbeiten. Während du weg bist, läuft die Manufaktur bis zu ${winterOfflineHours(s)} Stunden weiter.`;
  return (
    <>
      {s.winter.floors.map((_, i) => (
        <FloorCard key={i} i={i} floats={floats} />
      ))}
      <div className="w-host">
        <img src={artUrl('winter/figuren/weihnachtsmanager')} alt="" draggable={false} />
        <div className="w-bubble">
          <b>{nikolaus || p.kind !== 'preview' ? WINTER_MANAGER_NAME : 'Der Weihnachtsmanager'}</b>
          <span>{tip}</span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Adventskalender                                                             */
/* ------------------------------------------------------------------------- */

const DOOR_ART: Record<DoorState, string> = {
  locked: 'winter/advent/tuer_gesperrt',
  available: 'winter/advent/tuer_verfuegbar',
  open: 'winter/advent/tuer_geoeffnet',
  claimed: 'winter/advent/tuer_abgeholt',
};

function CalendarTab({ onDoor }: { onDoor: (day: number) => void }) {
  const store = useStore();
  const s = store.state;
  const p = store.advent;
  const now = useNow();
  const today = p.kind === 'active' ? p.day : 0;
  return (
    <>
      <div className="w-cal">
        <div className="w-cal-grid">
          {DOORS.map((d) => {
            const st = doorState(s, d.day, p);
            return (
              <button
                key={d.day}
                className={`w-door ${st} ${d.day === today ? 'today' : ''} ${d.day > LAST_FEATURE_DOOR ? 'bonus' : ''}`}
                onClick={() => onDoor(d.day)}
                aria-label={`Türchen ${d.day}`}
                data-testid={`door-${d.day}`}
              >
                <img src={artUrl(DOOR_ART[st])} alt="" draggable={false} />
                <span className="w-door-n">{d.day}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="w-cal-note">
        {p.kind === 'preview' && `Ab 1. Dezember um Mitternacht öffnet jeden Tag ein Türchen – noch ${daysUntil(now, p.startsAt)} ${daysUntil(now, p.startsAt) === 1 ? 'Tag' : 'Tage'}.`}
        {p.kind === 'active' && p.day < LAST_DOOR && `Nächstes Türchen in ${formatDuration(msToNextDoor(now) / 1000)}. Verpasste Türchen kannst du bis zum 26. Dezember nachholen.`}
        {p.kind === 'active' && p.day === LAST_DOOR && 'Heute ist der letzte Tag: Hol dir alle offenen Türchen bis Mitternacht.'}
        {p.kind === 'ended' && `Du hast ${s.winter.claimed.length} von ${LAST_DOOR} Türchen geöffnet.`}
      </p>
    </>
  );
}

function DoorDialog({ day, onClose }: { day: number; onClose: () => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const p = store.advent;
  const d = door(day)!;
  const st = doorState(s, day, p);
  const [justClaimed, setJustClaimed] = useState(false);
  const locked = st === 'locked';
  const showRewards = !locked || s.winter.claimed.includes(day);
  const hasManager = d.rewards.some((r) => r.kind === 'weihnachtsmanager');
  return (
    <div className="dialog-wrap" onClick={onClose}>
      <div className={`dialog panel w-door-dialog ${st}`} onClick={(e) => e.stopPropagation()} data-testid="door-dialog">
        <div className="w-door-day">Türchen {day}</div>
        {locked ? (
          <>
            <img className="w-door-big" src={artUrl(DOOR_ART.locked)} alt="" draggable={false} />
            <h2>Noch verschlossen</h2>
            <p>{p.kind === 'ended' ? 'Das Advent-Event ist vorbei.' : `Dieses Türchen öffnet am ${day}. Dezember um Mitternacht.`}</p>
          </>
        ) : (
          <>
            <div className="w-gift-stage">
              {hasManager ? (
                <img className="w-gift-figure" src={artUrl('winter/figuren/weihnachtsmanager')} alt="" draggable={false} />
              ) : (
                <img className={`w-gift ${justClaimed || st === 'claimed' ? 'done' : ''}`} src={artUrl('winter/oberflaeche/adventsgeschenk')} alt="" draggable={false} />
              )}
              <img className="w-glint" src={artUrl('winter/effekte/goldglanz')} alt="" draggable={false} />
            </div>
            <h2>{d.title}</h2>
            <p>{d.text}</p>
          </>
        )}
        {showRewards && (
          <div className="w-rewards">
            {d.rewards.map((r, k) => (
              <span className="w-reward" key={k}>
                <Art k={rewardArt(r)} size={30} />
                {rewardChip(r)}
              </span>
            ))}
          </div>
        )}
        <div className="dialog-actions">
          {st === 'open' && (
            <button
              className="btn gold"
              onClick={() => {
                if (store.claimDoor(day)) setJustClaimed(true);
              }}
              data-testid="door-claim"
            >
              Abholen
            </button>
          )}
          {st !== 'open' && (
            <button className="btn" onClick={onClose} data-testid="door-close">
              {justClaimed ? 'Fröhliche Weihnachten!' : 'Schließen'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Wintermarkt                                                                 */
/* ------------------------------------------------------------------------- */

function MarketTab() {
  const store = useStore();
  const s = store.state;
  const p = store.advent;
  const open = marketOpen(s, p);
  const owned = ownedDecor(s);
  return (
    <>
      {!open && (
        <div className="w-note">
          <Art k="oberflaeche/gesperrt" size={24} />
          {p.kind === 'ended' ? 'Der Wintermarkt hat für dieses Jahr geschlossen.' : 'Der Wintermarkt öffnet mit Türchen 1 am 1. Dezember.'}
        </div>
      )}
      {open && <p className="flavor">Jede Ware gibt es einmal am Tag – um Mitternacht wird nachgefüllt.</p>}
      {SHOP.map((item) => {
        const stock = shopStock(s, item, p);
        const price = shopPrice(s, item);
        const bought = shopBought(s, item.id);
        return (
          <div className={`w-shop-row ${stock}`} key={item.id} data-testid={`shop-${item.id}`}>
            <span className="w-shop-icon">
              <Art k={item.icon} size={40} />
            </span>
            <div className="goal-body">
              <b>{item.name}</b>
              <small>{item.text}</small>
              <small className="w-shop-count">
                {bought}/{item.max} gekauft
              </small>
            </div>
            {stock === 'soldOut' ? (
              <span className="w-shop-state">Ausverkauft</span>
            ) : stock === 'today' ? (
              <span className="w-shop-state">Morgen wieder</span>
            ) : (
              <button className="btn gold small" disabled={!open || s.winter.stars < price} onClick={() => store.buyWinter(item.id)} data-testid={`buy-${item.id}`}>
                {stars(s, price)} <Art k={ZIMTSTERN} size={16} />
              </button>
            )}
          </div>
        );
      })}
      <div className="section-title">Winterdeko für deinen Turm</div>
      <div className="w-decor">
        {(Object.keys(DECOR_NAMES) as Decor[]).map((k) => {
          const day = DOORS.find((d) => d.rewards.some((r) => r.kind === 'decor' && r.decor === k))!.day;
          const has = owned.has(k);
          return (
            <div className={`w-decor-item ${has ? 'has' : ''}`} key={k}>
              <Art k={DECOR_ART[k]} size={40} />
              <span>{has ? DECOR_NAMES[k] : `Türchen ${day}`}</span>
            </div>
          );
        })}
      </div>
      <div className="toggle-row">
        <span>Winterdeko im Dezember zeigen</span>
        <button className={`switch ${s.settings.winterDecor ? 'on' : ''}`} role="switch" aria-checked={s.settings.winterDecor} aria-label="Winterdeko" onClick={() => store.setSettings({ winterDecor: !s.settings.winterDecor })} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------- */

export function WinterSheet({ onClose, initial }: { onClose: () => void; initial?: WinterTab }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const p = store.advent;
  const now = useNow();
  const waiting = doorsWaiting(s, p);
  const [tab, setTab] = useState<WinterTab>(initial ?? (waiting > 0 ? 'calendar' : 'factory'));
  const [dialog, setDialog] = useState<number | null>(null);
  const rate = starsPerSecond(s, true);
  const affordable = marketOpen(s, p) ? SHOP.filter((x) => shopStock(s, x, p) === 'available' && s.winter.stars >= shopPrice(s, x)).length : 0;
  const dots: Record<WinterTab, number> = { factory: 0, calendar: waiting, market: affordable };
  return (
    <Sheet
      title="Lebkuchen-Manufaktur"
      sub={phaseLine(p, now)}
      icon={<img src={artUrl('winter/oberflaeche/winterfabrik')} alt="" draggable={false} />}
      onClose={onClose}
      className="winter-sheet"
    >
      <div className="w-stars" data-testid="winter-stars">
        <Art k={ZIMTSTERN} size={34} />
        <b>{stars(s, s.winter.stars)}</b>
        <span>Zimtsterne{rate > 0 && eventRunning(p) ? ` · +${formatNumber(rate, s.settings.notation, 1)}/s` : ''}</span>
      </div>
      <div className="tabs goal-tabs" role="tablist">
        {(
          [
            ['factory', 'Manufaktur'],
            ['calendar', 'Kalender'],
            ['market', 'Wintermarkt'],
          ] as [WinterTab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} data-testid={`wtab-${id}`}>
            {label}
            {dots[id] > 0 && <span className="tab-dot">{dots[id]}</span>}
          </button>
        ))}
      </div>
      {tab === 'factory' && <FactoryTab />}
      {tab === 'calendar' && (
        <CalendarTab
          onDoor={(day) => {
            if (doorState(s, day, p) === 'available') store.openDoor(day);
            setDialog(day);
          }}
        />
      )}
      {tab === 'market' && <MarketTab />}
      {dialog !== null && <DoorDialog day={dialog} onClose={() => setDialog(null)} />}
    </Sheet>
  );
}

/** Round button on the main screen (November to 31 December). */
export function WinterButton({ onOpen, style }: { onOpen: () => void; style?: CSSProperties }) {
  useGameVersion();
  const store = useStore();
  const p = store.advent;
  if (p.kind === 'off') return null;
  const n = doorsWaiting(store.state, p);
  return (
    <button className={`winter-btn ${n > 0 ? 'ready' : ''}`} style={style} onClick={onOpen} aria-label="Advent-Event öffnen" data-testid="winter-btn">
      <img src={artUrl('winter/oberflaeche/winterfabrik')} alt="" draggable={false} />
      <span className="winter-btn-label">{p.kind === 'preview' ? 'Advent' : p.kind === 'active' ? `${p.day}. Dez` : 'Advent'}</span>
      {n > 0 && <span className="winter-btn-badge">{n}</span>}
    </button>
  );
}
