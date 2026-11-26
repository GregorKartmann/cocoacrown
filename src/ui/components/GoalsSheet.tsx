import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, BADGE_ART, BADGE_NAME, CATEGORIES, DAILY_BY_ID, DAILY_REWARD, GOAL_ICON, STREAK, streakBadge, type Achievement, type DailyTemplate } from '../../config/goals';
import { QUESTS } from '../../config/quests';
import { formatDuration, formatMoney, formatNumber, formatRate } from '../../core/format';
import { artUrl } from '../../render/assets';
import { achievementProgress, claimableAchievements, claimableDaily, isClaimed, rewardText, secondsToMidnight, visibleStreak } from '../../sim/goals';
import type { GameState } from '../../sim/types';
import { useGameVersion, useStore } from '../useGame';
import { IconCheck, IconQuest } from '../icons';
import { Sheet } from './Hud';

export type GoalsTab = 'daily' | 'achievements' | 'quests';

function Art({ k, size, className }: { k: string; size: number; className?: string }) {
  return <img className={className ?? 'icon-img'} src={artUrl(k)} alt="" style={{ width: size, height: size, objectFit: 'contain' }} draggable={false} />;
}

/** Title of a daily goal with its target filled in. */
export function dailyTitle(s: GameState, t: DailyTemplate, target: number): string {
  const n = t.metric === 'activeValueShipped' ? formatMoney(target, s.settings.notation) : formatNumber(target, s.settings.notation, 0);
  return t.title.replace('{n}', n);
}

/** Everything that waits for a tap in this sheet (for the nav dot). */
export function goalsAttention(s: GameState): number {
  return claimableAchievements(s).length + claimableDaily(s) + s.rewards.goldenBeans;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Rewards() {
  const store = useStore();
  const r = store.state.rewards;
  if (r.freeHires <= 0 && r.goldenBeans <= 0) return null;
  return (
    <div className="reward-strip" data-testid="reward-strip">
      <span className="section-title">Deine Belohnungen</span>
      {r.freeHires > 0 && (
        <div className="reward-item">
          <Art k={GOAL_ICON.manager} size={28} />
          <span>
            <b>{r.freeHires}× Manager kostenlos</b>
            <small>wird bei der nächsten Einstellung im Manager-Menü genutzt</small>
          </span>
        </div>
      )}
      {r.goldenBeans > 0 && (
        <div className="reward-item">
          <Art k={GOAL_ICON.bean} size={28} />
          <span>
            <b>{r.goldenBeans}× Goldene Bohne</b>
            <small>Geld oder Tempo-Bonus, sofort</small>
          </span>
          <button className="btn gold small" onClick={() => store.redeemBean()} data-testid="redeem-bean">
            Einlösen
          </button>
        </div>
      )}
    </div>
  );
}

function DailyTab() {
  const store = useStore();
  const s = store.state;
  const now = useNow();
  const streak = visibleStreak(s, now);
  const doneToday = s.daily.lastCompleteDay === s.daily.day && s.daily.day !== '';
  const nextHire = !s.daily.streakHireGiven || streak < STREAK.hireAt ? Math.max(STREAK.hireAt, streak + 1) : null;
  const nextBean = (Math.floor(streak / STREAK.beanEvery) + 1) * STREAK.beanEvery;
  const next = nextHire !== null && nextHire < nextBean ? { day: nextHire, text: 'Manager kostenlos' } : { day: nextBean, text: 'Goldene Bohne' };
  return (
    <>
      <div className="streak-card">
        <Art k={streakBadge(streak)} size={64} className="streak-flame" />
        <div>
          <div className="streak-days">
            <b>{streak}</b> {streak === 1 ? 'Tag' : 'Tage'} in Folge
          </div>
          <small>
            {doneToday ? 'Heute geschafft – morgen geht es weiter.' : 'Erfülle alle drei Ziele, damit der Tag zählt.'} Tag {next.day}: {next.text}.
          </small>
        </div>
      </div>
      <div className="daily-reset">Neue Ziele in {formatDuration(secondsToMidnight(now, s.daily.tz))}</div>
      {s.daily.goals.map((g, i) => {
        const t = DAILY_BY_ID[g.id];
        if (!t) return null;
        const done = g.progress >= g.target;
        const frac = Math.min(1, g.progress / g.target);
        const label = t.metric === 'activeSeconds' ? `${formatDuration(Math.floor(g.progress))} / ${formatDuration(g.target)}` : t.metric === 'activeValueShipped' ? `${Math.floor(frac * 100)} %` : `${Math.floor(g.progress)}/${g.target}`;
        return (
          <div className={`goal-row ${done ? 'done' : ''} ${g.claimed ? 'claimed' : ''}`} key={g.id} data-testid={`daily-${i}`}>
            <span className="goal-icon">
              <Art k={GOAL_ICON[t.icon]} size={30} />
            </span>
            <div className="goal-body">
              <span className="goal-slot">{t.slot}</span>
              <b>{dailyTitle(s, t, g.target)}</b>
              <div className="goal-meta">
                <div className="bar gold">
                  <i style={{ width: `${frac * 100}%` }} />
                </div>
                <span>{label}</span>
              </div>
            </div>
            {g.claimed ? (
              <span className="goal-done">
                <Art k={GOAL_ICON.done} size={26} />
              </span>
            ) : (
              <button className="btn gold small" disabled={!done} onClick={() => store.claimDaily(i)} data-testid={`claim-daily-${i}`}>
                +{DAILY_REWARD.amount} <Art k={GOAL_ICON.research} size={16} />
              </button>
            )}
          </div>
        );
      })}
      <p className="flavor">Tagesziele zählen nur, was du aktiv spielst – Offline-Zeit zählt nicht. Jedes Ziel bringt 2 Rezeptpunkte, die Serie kostenlose Manager und Goldene Bohnen.</p>
    </>
  );
}

/** Groups the tiers of a series into one entry; single achievements stay alone. */
function groupSeries(list: Achievement[]): Achievement[][] {
  const out: Achievement[][] = [];
  const bySeries = new Map<string, Achievement[]>();
  for (const a of list) {
    if (!a.series) {
      out.push([a]);
      continue;
    }
    let g = bySeries.get(a.series);
    if (!g) {
      g = [];
      bySeries.set(a.series, g);
      out.push(g);
    }
    g.push(a);
  }
  return out;
}

function progressText(s: GameState, a: Achievement, p: number): string {
  if (a.text) return a.text(s);
  const n = s.settings.notation;
  if (a.unit === 'time') return `${formatDuration(p)} / ${formatDuration(a.target)}`;
  if (a.unit === 'money') return `${formatMoney(p, n)} / ${formatMoney(a.target, n)}`;
  if (a.unit === 'rate') return `${formatRate(p, n)} / ${formatRate(a.target, n)}`;
  return `${formatNumber(p, n, 0)}/${formatNumber(a.target, n, 0)}`;
}

function AchievementRow({ tiers }: { tiers: Achievement[] }) {
  const store = useStore();
  const s = store.state;
  // the lowest tier not yet collected; a finished series shows its top tier
  const idx = tiers.findIndex((t) => !isClaimed(s, t.id));
  const a = tiers[idx === -1 ? tiers.length - 1 : idx];
  const p = achievementProgress(s, a);
  const reached = p >= a.target;
  const got = isClaimed(s, a.id);
  const done = tiers.filter((t) => isClaimed(s, t.id)).length;
  return (
    <div className={`ach-row ${reached ? 'reached' : ''} ${got ? 'claimed' : ''}`} data-testid={`ach-${a.id}`}>
      <span className="ach-badge">
        <Art k={BADGE_ART[a.badge]} size={44} className="medal" />
        <Art k={GOAL_ICON[a.icon]} size={20} className="ach-symbol" />
      </span>
      <div className="goal-body">
        <b>{a.title}</b>
        {a.hint && <small className="ach-hint">{a.hint}</small>}
        <div className="goal-meta">
          <div className="bar gold">
            <i style={{ width: `${Math.min(1, p / a.target) * 100}%` }} />
          </div>
          <span>{progressText(s, a, p)}</span>
        </div>
        {tiers.length > 1 ? (
          <div className="ach-tiers" aria-label={`Stufe ${Math.min(done + 1, tiers.length)} von ${tiers.length}`}>
            {tiers.map((t) => {
              const state = isClaimed(s, t.id) ? 'got' : achievementProgress(s, t) >= t.target ? 'ready' : 'open';
              return (
                <span key={t.id} className={`tier ${state} ${t.id === a.id ? 'now' : ''}`} title={`${BADGE_NAME[t.badge]}: ${t.title}`}>
                  <Art k={BADGE_ART[t.badge]} size={17} className="tier-medal" />
                </span>
              );
            })}
            <small className="ach-reward">{got ? 'Alle Stufen abgeholt' : `${BADGE_NAME[a.badge]} · ${rewardText(a.reward)}`}</small>
          </div>
        ) : (
          <small className="ach-reward">Belohnung: {rewardText(a.reward)}</small>
        )}
      </div>
      {got ? (
        <span className="goal-done">
          <Art k={GOAL_ICON.done} size={26} />
        </span>
      ) : reached ? (
        <button className="btn gold small" onClick={() => store.claimAchievement(a.id)} data-testid={`claim-ach-${a.id}`}>
          Abholen
        </button>
      ) : null}
    </div>
  );
}

function AchievementsTab() {
  const store = useStore();
  const s = store.state;
  const total = ACHIEVEMENTS.length;
  const claimed = ACHIEVEMENTS.filter((a) => isClaimed(s, a.id)).length;
  return (
    <>
      <div className="ach-summary">
        <b>{claimed}</b> von {total} Erfolgen abgeholt
        <span className="ach-medals">
          {(['platin', 'diamant'] as const).map((b) => (
            <span key={b}>
              <Art k={BADGE_ART[b]} size={18} /> {ACHIEVEMENTS.filter((a) => a.badge === b && isClaimed(s, a.id)).length}
            </span>
          ))}
        </span>
      </div>
      {CATEGORIES.map((c) => {
        const list = ACHIEVEMENTS.filter((a) => a.category === c.id);
        if (!list.length) return null;
        return (
          <div className="ach-cat" key={c.id}>
            <div className="ach-cat-head">
              <Art k={c.badge} size={34} />
              <span>{c.name}</span>
            </div>
            {groupSeries(list).map((tiers) => (
              <AchievementRow key={tiers[0].id} tiers={tiers} />
            ))}
          </div>
        );
      })}
    </>
  );
}

function QuestsTab() {
  const store = useStore();
  const s = store.state;
  const n = s.settings.notation;
  return (
    <>
      <div className="ach-summary">
        <b>{Math.min(s.quest.index, QUESTS.length)}</b> von {QUESTS.length} Aufträgen erledigt
      </div>
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
      {s.quest.index >= QUESTS.length && <p className="flavor">Alle Aufträge erledigt – die Tagesziele halten dich weiter auf Trab.</p>}
    </>
  );
}

export function GoalsSheet({ onClose, initial = 'daily' }: { onClose: () => void; initial?: GoalsTab }) {
  useGameVersion();
  const store = useStore();
  const s = store.state;
  const [tab, setTab] = useState<GoalsTab>(initial);
  const dots = { daily: claimableDaily(s), achievements: claimableAchievements(s).length, quests: s.quest.index < QUESTS.length && QUESTS[s.quest.index].progress(s) >= QUESTS[s.quest.index].target ? 1 : 0 };
  return (
    <Sheet title="Ziele" sub="Tagesziele, Erfolge und Aufträge" icon={<IconQuest size={40} />} onClose={onClose}>
      <div className="tabs goal-tabs" role="tablist">
        {(
          [
            ['daily', 'Täglich'],
            ['achievements', 'Erfolge'],
            ['quests', 'Aufträge'],
          ] as [GoalsTab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} data-testid={`tab-${id}`}>
            {label}
            {dots[id] > 0 && <span className="tab-dot">{dots[id]}</span>}
          </button>
        ))}
      </div>
      <Rewards />
      {tab === 'daily' && <DailyTab />}
      {tab === 'achievements' && <AchievementsTab />}
      {tab === 'quests' && <QuestsTab />}
    </Sheet>
  );
}
