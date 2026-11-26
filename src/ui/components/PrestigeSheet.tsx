import { useEffect, useState } from 'react';
import { BALANCE } from '../../config/balance';
import { formatDuration, formatMoney, formatMultiplier, formatNumber } from '../../core/format';
import { crownFactorFor, crownStepStart, crownsAvailable, nextCrownAt, prestigeUnlocked } from '../../sim/formulas';
import type { GameState } from '../../sim/types';
import { artUrl } from '../../render/assets';
import { useGameVersion, useStore } from '../useGame';
import { IconCrown, IconLock } from '../icons';
import { Sheet } from './Hud';
import { TreasuryPanel } from './TreasuryPanel';
import { TREASURY } from '../../config/treasury';
import { crownsFree, treasuryCost } from '../../sim/treasury';

/** Estimated time to the 5th floor after the sale, from the player's own best time (see BALANCE.prestige). */
export function floor5Estimate(s: GameState, crownsAfter: number): number | null {
  const best = s.prestige.bestFloor5;
  if (best === null) return null;
  const ratio = crownFactorFor(s.prestige.crowns, s) / crownFactorFor(crownsAfter, s);
  return best * Math.pow(ratio, BALANCE.prestige.estimateExponent);
}

/** Progress (0..1) toward the next claimable crown. */
function nextCrownProgress(s: GameState): number {
  const from = crownStepStart(s);
  const to = nextCrownAt(s);
  const span = to.sub(from);
  if (span.lte(0)) return 0;
  return Math.max(0, Math.min(1, s.stats.totalEarned.sub(from).div(span).toNumber()));
}

export function PrestigeSheet({ onClose, initial }: { onClose: () => void; initial?: 'sale' | 'treasury' }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  const [confirm, setConfirm] = useState(false);
  const hasTreasury = s.prestige.crowns > 0;
  const [tab, setTab] = useState<'sale' | 'treasury'>(initial === 'treasury' && hasTreasury ? 'treasury' : 'sale');
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);

  const unlocked = prestigeUnlocked(s);
  const gain = crownsAvailable(s);
  const now = s.prestige.crowns;
  const after = now + gain;
  const est = floor5Estimate(s, after);
  const managersKept = s.managers.length;

  const tabs = hasTreasury && (
    <div className="tabs two" role="tablist">
      <button role="tab" aria-selected={tab === 'sale'} className={tab === 'sale' ? 'on' : ''} onClick={() => setTab('sale')} data-testid="ptab-sale">
        Marke verkaufen
      </button>
      <button role="tab" aria-selected={tab === 'treasury'} className={tab === 'treasury' ? 'on' : ''} onClick={() => setTab('treasury')} data-testid="ptab-treasury">
        Schatzkammer
        {TREASURY.some((b) => {
          const c = treasuryCost(s, b.id);
          return c !== null && c <= crownsFree(s);
        }) && <span className="tab-dot">!</span>}
      </button>
    </div>
  );

  if (tab === 'treasury')
    return (
      <Sheet title="Kronen-Schatzkammer" sub="Dauerhafte Startboni für jeden Neustart" icon={<img src={artUrl('schatzkammer/symbole/schatzkammer')} alt="" />} onClose={onClose}>
        {tabs}
        <TreasuryPanel />
      </Sheet>
    );

  return (
    <Sheet title="Marke verkaufen" sub="Neustart mit dauerhaftem Bonus" icon={<IconCrown size={40} />} onClose={onClose}>
      {tabs}
      <div className="prestige-hero" data-testid="prestige-sheet">
        <img className="brand-facade" src={artUrl('hintergruende/fassade_alternativ')} alt="" draggable={false} />
        <div className="crowns-now">
          <IconCrown size={30} />
          <span>
            <b>{formatNumber(now, n, 0)}</b> {now === 1 ? 'Krone' : 'Kronen'} · Einkommen {formatMultiplier(crownFactorFor(now, s))}
          </span>
        </div>
        {unlocked ? (
          <div className="big-amount crowns-gain" data-testid="prestige-gain">
            +{formatNumber(gain, n, 0)} {gain === 1 ? 'Krone' : 'Kronen'}
          </div>
        ) : (
          <div className="prestige-locked">
            <IconLock size={22} /> Verfügbar, sobald du die 5. Etage gebaut hast.
          </div>
        )}
        <div className="crown-progress">
          <div className="bar gold">
            <i style={{ width: `${nextCrownProgress(s) * 100}%` }} />
          </div>
          <small>
            Nächste Krone bei {formatMoney(nextCrownAt(s), n)} Gesamtumsatz (jetzt {formatMoney(s.stats.totalEarned, n)})
          </small>
        </div>
      </div>

      {unlocked && gain > 0 && (
        <table className="stats">
          <tbody>
            <tr>
              <td>Kronen</td>
              <td className="now">{formatNumber(now, n, 0)}</td>
              <td className="next">{formatNumber(after, n, 0)}</td>
            </tr>
            <tr>
              <td>Einkommen auf alles</td>
              <td className="now">{formatMultiplier(crownFactorFor(now, s))}</td>
              <td className="next">{formatMultiplier(crownFactorFor(after, s))}</td>
            </tr>
            {est !== null && s.prestige.bestFloor5 !== null && s.prestige.bestFloor5 >= 60 && (
              <tr>
                <td>Bis zur 5. Etage (ca.)</td>
                <td className="now">{formatDuration(s.prestige.bestFloor5)}</td>
                <td className="next">{formatDuration(est)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <div className="keep-lose">
        <div>
          <div className="section-title">Bleibt</div>
          <ul>
            <li>Kronen und ihr Einkommensbonus</li>
            <li>Schatzkammer-Boni – sie greifen direkt beim Neustart</li>
            <li>Ruf und Kunden der Lieferverträge</li>
            <li>
              {managersKept} Manager – sie kehren an ihre Etage zurück, sobald du sie neu baust
            </li>
            <li>Rezeptlabor: alle Forschungen und Rezeptpunkte</li>
            <li>Aufträge, Statistik und Einstellungen</li>
          </ul>
        </div>
        <div>
          <div className="section-title">Wird zurückgesetzt</div>
          <ul>
            <li>Geld und alle Level</li>
            <li>Etagen 2–8</li>
            <li>Aufzug, Versand und Lieferwagen</li>
            <li>Laufende Boni</li>
            <li>Laufender Liefervertrag und Angebote</li>
          </ul>
        </div>
      </div>

      <p className="flavor">
        Kronen wachsen mit der Wurzel deines Gesamtumsatzes: Wer länger wartet, bekommt mehr – aber jede weitere Krone dauert länger. Ab 100 Kronen gilt die
        vierte Wurzel. Gib Kronen in der Schatzkammer für Startboni aus; ihr Einkommensbonus bleibt dabei erhalten.
      </p>

      <button
        className={`btn ${confirm ? 'red' : 'mint'} block buy-btn`}
        disabled={!unlocked || gain < 1}
        data-testid="sell-brand"
        onClick={() => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          setConfirm(false);
          store.sellBrand();
        }}
      >
        {!unlocked || gain < 1 ? 'Noch keine neue Krone' : confirm ? 'Wirklich verkaufen? Nochmal tippen' : `Marke verkaufen · +${formatNumber(gain, n, 0)} ${gain === 1 ? 'Krone' : 'Kronen'}`}
      </button>
    </Sheet>
  );
}

/** Shown right after the sale. */
export function BrandSoldDialog({ crowns, onClose, onTreasury }: { crowns: number; onClose: () => void; onTreasury?: () => void }) {
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="dialog-wrap" onClick={() => armed && onClose()}>
      <div className="dialog panel" onClick={(e) => e.stopPropagation()} data-testid="brand-sold">
        <div className="burst" />
        <img className="brand-facade" src={artUrl('hintergruende/fassade_alternativ')} alt="" draggable={false} />
        <br />
        <span className="ribbon">Marke verkauft!</span>
        <h2>Eine neue Manufaktur beginnt</h2>
        <div className="big-amount crowns-gain">
          +{formatNumber(crowns, n, 0)} {crowns === 1 ? 'Krone' : 'Kronen'}
        </div>
        <p>
          Du besitzt jetzt {formatNumber(s.prestige.crowns, n, 0)} Kronen. Alles bringt ab sofort {formatMultiplier(crownFactorFor(s.prestige.crowns, s))} Einkommen.
        </p>
        {s.managers.length > 0 && <p>Deine Manager warten schon: Sie übernehmen ihre Etage wieder, sobald sie gebaut ist.</p>}
        {crownsFree(s) > 0 && onTreasury && (
          <button className="btn gold block" onClick={onTreasury} style={{ marginTop: 10 }} data-testid="brand-sold-treasury">
            <img src={artUrl('schatzkammer/symbole/schatzkammer')} alt="" style={{ width: 24, height: 24, verticalAlign: -6, marginRight: 6 }} />
            Zur Schatzkammer · {formatNumber(crownsFree(s), n, 0)} freie Kronen
          </button>
        )}
        <button className="btn mint block buy-btn" onClick={onClose} style={{ marginTop: 10 }} data-testid="brand-sold-ok">
          Los geht&apos;s
        </button>
      </div>
    </div>
  );
}
