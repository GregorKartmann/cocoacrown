import { useState } from 'react';
import { BRANCHES, LAB_FLOOR, RESEARCH, RESEARCH_BY_ID, type ResearchId } from '../../config/research';
import { formatDuration, formatNumber } from '../../core/format';
import { artUrl } from '../../render/assets';
import { nextRank, nodeState, rank, whyNot, type NodeState } from '../../sim/research';
import { useGameVersion, useStore } from '../useGame';
import { Sheet } from './Hud';

const FRAME: Record<NodeState | 'ausgewaehlt', string> = {
  gesperrt: 'forschung/rahmen/gesperrt',
  verfuegbar: 'forschung/rahmen/verfuegbar',
  aktiv: 'forschung/rahmen/aktiv',
  abgeschlossen: 'forschung/rahmen/abgeschlossen',
  maximal: 'forschung/rahmen/maximal',
  ausgewaehlt: 'forschung/rahmen/ausgewaehlt',
};

const STATE_LABEL: Record<NodeState, string> = {
  gesperrt: 'Gesperrt',
  verfuegbar: 'Verfügbar',
  aktiv: 'In Arbeit',
  abgeschlossen: 'Erforscht',
  maximal: 'Maximalrang',
};

export function ResearchToken({ size = 20 }: { size?: number }) {
  return <img className="icon-img" src={artUrl('forschung/forschungsmarke')} alt="" width={size} height={size} style={{ width: size, height: size }} draggable={false} />;
}

export function ResearchSheet({ onClose }: { onClose: () => void }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const r = s.research;
  const firstPick = (): ResearchId => r.active?.id ?? RESEARCH.find((n) => whyNot(s, n.id) === null)?.id ?? RESEARCH[0].id;
  const [sel, setSel] = useState<ResearchId>(firstPick);
  const node = RESEARCH_BY_ID[sel];
  const cur = rank(s, sel);
  const next = nextRank(s, sel);
  const block = whyNot(s, sel);
  const req = node.requires ? RESEARCH_BY_ID[node.requires.id] : null;
  const running = r.active?.id === sel ? r.active : null;

  const blockText: Record<Exclude<typeof block, null>, string> = {
    closed: `Das Rezeptlabor öffnet mit der ${LAB_FLOOR + 1}. Etage.`,
    max: 'Höchster Rang erreicht.',
    locked: req ? `Braucht zuerst „${req.name}“ auf Rang ${node.requires!.rank}.` : 'Noch gesperrt.',
    busy: 'Das Labor arbeitet gerade an einer anderen Forschung.',
    points: next ? `Dir fehlen noch ${next.cost - r.points} Rezeptpunkte.` : '',
  };

  return (
    <Sheet title="Rezeptlabor" sub="Forschung bleibt beim Markenverkauf erhalten" icon={<img className="icon-img" src={artUrl('forschung/labortisch')} alt="" style={{ width: 42, height: 42 }} />} onClose={onClose}>
      <div className="lab" data-testid="research-sheet" style={{ backgroundImage: `url(${artUrl('forschung/labor')})` }}>
        <div className="lab-head">
          <span className="lab-points" data-testid="research-points">
            <ResearchToken size={26} /> <b>{formatNumber(r.points, s.settings.notation, 0)}</b> Rezeptpunkte
          </span>
          {r.active ? (
            <div className="lab-active">
              <span>
                In Arbeit: <b>{RESEARCH_BY_ID[r.active.id].name}</b> Rang {rank(s, r.active.id) + 1} · noch {formatDuration(Math.ceil(r.active.remaining))}
              </span>
              <div className="bar">
                <i style={{ width: `${(1 - r.active.remaining / r.active.total) * 100}%` }} />
              </div>
            </div>
          ) : (
            <div className="lab-active idle">{r.open ? 'Das Labor ist frei – wähle eine Forschung.' : `Öffnet mit der ${LAB_FLOOR + 1}. Etage.`}</div>
          )}
        </div>
        <div className="tree">
          {BRANCHES.map((b) => (
            <div className="branch" key={b.id} style={{ ['--accent' as string]: b.accent }}>
              <img className="branch-icon" src={artUrl(b.icon)} alt="" draggable={false} />
              <span className="branch-name">{b.name}</span>
              {RESEARCH.filter((n) => n.branch === b.id).map((n, k) => {
                const st = r.open ? nodeState(s, n.id) : 'gesperrt';
                const rk = rank(s, n.id);
                const lit = !n.requires || rank(s, n.requires.id) >= n.requires.rank;
                return (
                  <div className="node-wrap" key={n.id}>
                    {k > 0 && <span className={`link ${lit ? 'lit' : ''}`} />}
                    <button
                      className={`rnode ${sel === n.id ? 'sel' : ''}`}
                      data-state={st}
                      data-testid={`node-${n.id}`}
                      aria-pressed={sel === n.id}
                      aria-label={`${n.name}, ${STATE_LABEL[st]}, Rang ${rk} von ${n.maxRank}`}
                      onClick={() => setSel(n.id)}
                    >
                      <img className="frame" src={artUrl(FRAME[st === 'aktiv' ? 'aktiv' : sel === n.id ? 'ausgewaehlt' : st])} alt="" draggable={false} />
                      <img className="sym" src={artUrl(`forschung/symbole/${n.id}`)} alt="" draggable={false} />
                      <span className="pips">
                        {rk}/{n.maxRank}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="rdetail" data-testid="research-detail">
        <h3>
          {node.name} <small>Rang {cur}/{node.maxRank}</small>
        </h3>
        <p className="rnow">{cur > 0 ? `Jetzt: ${node.effect(cur)}` : `Pro Rang: ${node.perRank}`}</p>
        {next && <p className="rnext">Nächster Rang: {node.effect(next.rank)}</p>}
        {running ? (
          <p className="rnext">Läuft gerade – fertig in {formatDuration(Math.ceil(running.remaining))}.</p>
        ) : (
          block && block !== 'max' && <p className="rblock">{blockText[block]}</p>
        )}
        <button className="btn mint block buy-btn" disabled={block !== null} data-testid="research-start" onClick={() => store.research(sel)}>
          {running ? (
            `In Arbeit · noch ${formatDuration(Math.ceil(running.remaining))}`
          ) : next ? (
            <>
              Erforschen · {next.cost} <ResearchToken size={18} /> · {formatDuration(next.duration)}
            </>
          ) : (
            'Maximalrang erreicht'
          )}
        </button>
      </div>
      <p className="flavor">
        Rezeptpunkte gibt es für jeden Meilenstein (Level 10, 25, 50 …), jede neue Etage und jeden Auftrag – in jedem Durchlauf neu, für den Markenverkauf
        gibt es 3 extra. Es läuft immer eine Forschung gleichzeitig, auch während du nicht spielst.
      </p>
    </Sheet>
  );
}
