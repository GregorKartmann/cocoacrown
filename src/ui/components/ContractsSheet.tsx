import { useEffect, useState } from 'react';
import { BALANCE } from '../../config/balance';
import { CUSTOMERS, CUSTOMER_BY_ID, SEAL_ART } from '../../config/contracts';
import type { GoalReward } from '../../config/goals';
import { rewardText } from '../../sim/goals';
import { formatMoney, formatNumber } from '../../core/format';
import { artUrl } from '../../render/assets';
import { contractShare, customerUnlocked, nextCustomer, rufStep } from '../../sim/contracts';
import type { ActiveContract, ContractOffer, GameState } from '../../sim/types';
import { useGameVersion, useStore } from '../useGame';
import { Sheet } from './Hud';

const art = (k: string) => artUrl(k);

/** 12:34 or 1:02:03 */
export function clock(seconds: number): string {
  const t = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** "500 Trüffelboxen" or "Ware für 1,2 Mio. €". */
export function orderText(s: GameState, o: Pick<ContractOffer, 'kind' | 'floor' | 'target'>): string {
  const n = s.settings.notation;
  if (o.kind === 'value') return `Ware für ${formatMoney(o.target, n)}`;
  const def = BALANCE.floors[o.floor];
  return `${formatNumber(o.target, n, 0)} ${o.target.eq(1) ? def.product : def.productPlural}`;
}

function bonusArt(r: GoalReward): string {
  if (r.kind === 'recipePoints') return 'forschung/forschungsmarke';
  if (r.kind === 'goldenBean') return 'produkte/goldene_kakaobohne';
  return 'oberflaeche/manager';
}

function Pay({ s, o }: { s: GameState; o: ContractOffer }) {
  return (
    <div className="ct-pay">
      <span>
        <img src={art('oberflaeche/muenze')} alt="" />
        {formatMoney(o.pay, s.settings.notation)}
      </span>
      <span>
        <img src={art('vertraege/symbole/ruf')} alt="" />+{o.ruf} Ruf
      </span>
      {o.bonus && (
        <span>
          <img src={art(bonusArt(o.bonus))} alt="" />
          {rewardText(o.bonus)}
        </span>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<ActiveContract['status'], string> = {
  active: 'Vertrag aktiv',
  delivered: 'Pünktlich geliefert',
  failed: 'Frist abgelaufen',
};
const STATUS_SEAL: Record<ActiveContract['status'], string> = {
  active: SEAL_ART.active,
  delivered: SEAL_ART.delivered,
  failed: SEAL_ART.failed,
};

function ActiveCard() {
  const store = useStore();
  const s = store.state;
  const a = s.contracts.active!;
  const c = CUSTOMER_BY_ID[a.customer];
  const share = contractShare(a);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={`ct-paper big ${a.status}`} data-testid="contract-active">
      <img className="ct-seal" src={art(STATUS_SEAL[a.status])} alt="" />
      <div className="ct-head">
        <img className="ct-crest" src={art(c.icon)} alt="" />
        <div>
          <b>{c.name}</b>
          <small>{c.motto}</small>
        </div>
      </div>
      <div className="ct-order">{orderText(s, a)}</div>
      <div className="ct-progress">
        <div className="bar gold">
          <i style={{ width: `${share * 100}%` }} />
        </div>
        <span>{Math.floor(share * 100)} %</span>
      </div>
      <div className="ct-line">
        <span className="ct-status">{STATUS_TEXT[a.status]}</span>
        {a.status === 'active' && (
          <span className="ct-time">
            <img src={art('vertraege/symbole/frist')} alt="" />
            noch {clock(a.remaining)}
          </span>
        )}
      </div>
      <Pay s={s} o={a} />
      <div className="ct-actions">
        {a.status === 'delivered' && (
          <button className="btn gold block" onClick={() => store.closeContract()} data-testid="contract-claim">
            Bezahlung abholen
          </button>
        )}
        {a.status === 'failed' && (
          <button className="btn block" onClick={() => store.closeContract()} data-testid="contract-dismiss">
            Vertrag ablegen
          </button>
        )}
        {a.status === 'active' && (
          <button
            className={`btn small ${confirm ? 'red' : 'ghost'}`}
            onClick={() => {
              if (!confirm) {
                setConfirm(true);
                setTimeout(() => setConfirm(false), 4000);
                return;
              }
              store.cancelContract();
            }}
            data-testid="contract-cancel"
          >
            {confirm ? 'Wirklich zurückgeben?' : 'Vertrag zurückgeben'}
          </button>
        )}
      </div>
    </div>
  );
}

function OfferCard({ slot }: { slot: number }) {
  const store = useStore();
  const s = store.state;
  const o = s.contracts.offers[slot];
  if (!o) {
    const wait = Math.max(0, s.contracts.slotAt[slot] - s.simTime);
    return (
      <div className="ct-paper empty">
        <img className="ct-seal faded" src={art(SEAL_ART.offer)} alt="" />
        <span>Neues Angebot in {clock(wait)}</span>
      </div>
    );
  }
  const c = CUSTOMER_BY_ID[o.customer];
  const busy = !!s.contracts.active;
  return (
    <div className="ct-paper" data-testid={`offer-${slot}`}>
      <img className="ct-seal" src={art(SEAL_ART.offer)} alt="" />
      <div className="ct-head">
        <img className="ct-crest" src={art(c.icon)} alt="" />
        <div>
          <b>{c.name}</b>
          <small>Angebot</small>
        </div>
      </div>
      <div className="ct-order">{orderText(s, o)}</div>
      <div className="ct-line">
        <span className="ct-time">
          <img src={art('vertraege/symbole/frist')} alt="" />
          Frist {Math.round(o.seconds / 60)} min
        </span>
      </div>
      <Pay s={s} o={o} />
      <div className="ct-actions">
        <button className="btn mint" disabled={busy} onClick={() => store.acceptContract(slot)} data-testid={`accept-${slot}`}>
          {busy ? 'Erst laufenden Vertrag abschließen' : 'Annehmen'}
        </button>
        <button className="btn small ghost" onClick={() => store.declineOffer(slot)} aria-label="Angebot ablehnen" data-testid={`decline-${slot}`}>
          Ablehnen
        </button>
      </div>
    </div>
  );
}

export function ContractsSheet({ onClose }: { onClose: () => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const c = s.contracts;
  const next = nextCustomer(s);
  const step = rufStep(s);
  const frac = step.to === null ? 1 : Math.min(1, (c.ruf - step.from) / Math.max(1, step.to - step.from));
  return (
    <Sheet
      title="Lieferverträge"
      sub={next ? `Ruf ${c.ruf} · ${next.name} ab ${next.ruf}` : `Ruf ${c.ruf} · alle Kunden bestellen`}
      icon={<img src={art(SEAL_ART.offer)} alt="" />}
      onClose={onClose}
      className="contracts-sheet"
    >
      <div className="ct-ruf" data-testid="ruf">
        <img src={art('vertraege/symbole/ruf')} alt="" />
        <div>
          <div className="bar gold">
            <i style={{ width: `${frac * 100}%` }} />
          </div>
          <small>
            {next ? `${c.ruf} / ${next.ruf} Ruf bis zum nächsten Kunden` : `${c.ruf} Ruf – du bist Hoflieferant`} · {c.delivered} geliefert
          </small>
        </div>
      </div>
      {c.active && (
        <>
          <div className="section-title">Laufender Vertrag</div>
          <ActiveCard />
        </>
      )}
      <div className="section-title">Angebote</div>
      <p className="flavor">Liefere die bestellte Ware vor Ablauf der Frist. Gezählt wird, was die Etage ab jetzt fertigstellt – auch während du weg bist.</p>
      {c.offers.map((_, k) => (
        <OfferCard key={k} slot={k} />
      ))}
      <div className="section-title">Kunden</div>
      <div className="ct-customers">
        {CUSTOMERS.map((cu) => {
          const open = customerUnlocked(s, cu);
          return (
            <div className={`ct-customer ${open ? 'open' : ''}`} key={cu.id}>
              <img src={art(cu.icon)} alt="" />
              <span>{cu.name}</span>
              <small>{open ? (cu.kind === 'value' ? 'Warenwert' : cu.floors.map((f) => f + 1).join(', ').replace(/, (\d)$/, ' oder $1') + '. Etage') : `ab ${cu.ruf} Ruf`}</small>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/** Compact strip above the quest card while a contract runs. */
export function ContractStrip({ onOpen }: { onOpen: () => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const a = s.contracts.active;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!a) return null;
  const c = CUSTOMER_BY_ID[a.customer];
  const share = contractShare(a);
  return (
    <button className={`ct-strip panel ${a.status}`} onClick={onOpen} data-testid="contract-strip">
      <img className="ct-strip-crest" src={art(c.icon)} alt="" />
      <div className="ct-strip-body">
        <div className="ct-strip-title">{a.status === 'delivered' ? 'Geliefert! Bezahlung abholen' : a.status === 'failed' ? 'Frist abgelaufen' : orderText(s, a)}</div>
        <div className="bar gold">
          <i style={{ width: `${share * 100}%` }} />
        </div>
      </div>
      <span className="ct-strip-time">
        {a.status === 'active' ? (
          <>
            <img src={art('vertraege/symbole/frist')} alt="" />
            {clock(a.remaining)}
          </>
        ) : (
          <img src={art(STATUS_SEAL[a.status])} alt="" className="ct-strip-seal" />
        )}
      </span>
    </button>
  );
}
