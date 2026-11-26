import { TREASURY } from '../../config/treasury';
import { formatNumber } from '../../core/format';
import { artUrl } from '../../render/assets';
import { crownsFree, treasuryCost, treasuryRank } from '../../sim/treasury';
import { useGameVersion, useStore } from '../useGame';

/** Kronen-Schatzkammer: the painted vault as a banner, the start bonuses below it. */
export function TreasuryPanel() {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  const free = crownsFree(s);
  return (
    <div className="treasury" data-testid="treasury">
      <div className="treasury-hero">
        <div className="treasury-head">
          <img src={artUrl('schatzkammer/symbole/kronen')} alt="" />
          <b data-testid="crowns-free">{formatNumber(free, n, 0)}</b>
          <span>
            {free === 1 ? 'freie Krone' : 'freie Kronen'} · {formatNumber(s.prestige.crowns, n, 0)} gesamt
          </span>
        </div>
      </div>
      <p className="treasury-note">
        <img src={artUrl('schatzkammer/symbole/dauerhaft')} alt="" />
        Ausgegebene Kronen behalten ihren Einkommensbonus. Jeder Bonus wirkt sofort und nach jedem Verkauf.
      </p>
      <div className="treasury-list">
        {TREASURY.map((b) => {
          const rank = treasuryRank(s, b.id);
          const cost = treasuryCost(s, b.id);
          const max = cost === null;
          const value = rank > 0 ? b.short(b.values[rank - 1]) : null;
          const next = max ? null : b.short(b.values[rank]);
          return (
            <div className={`treasury-row ${rank > 0 ? 'owned' : ''}`} key={b.id} data-testid={`treasury-${b.id}`}>
              <span className="treasury-icon">
                <img src={artUrl(b.icon)} alt="" />
              </span>
              <div className="treasury-body">
                <b>{b.name}</b>
                <small>{b.desc}</small>
                <span className="treasury-value">
                  <span className="treasury-pips" aria-label={`Rang ${rank} von ${b.costs.length}`}>
                    {b.costs.map((_, k) => (
                      <i key={k} className={k < rank ? 'on' : ''} />
                    ))}
                  </span>
                  {max ? `${value} (höchster Rang)` : value ? `${value} → ${next}` : `→ ${next}`}
                </span>
              </div>
              {max ? (
                <img className="treasury-done" src={artUrl('schatzkammer/symbole/dauerhaft')} alt="Höchster Rang" />
              ) : (
                <button className="btn gold small" disabled={free < cost} onClick={() => store.buyTreasury(b.id)} data-testid={`buy-${b.id}`}>
                  <img src={artUrl('schatzkammer/symbole/kronen')} alt="" />
                  {cost}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
