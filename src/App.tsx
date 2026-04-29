import { Fragment, useEffect, useMemo, useState } from "react";
import { days, FINAL, fmt, fmtSizing, getSizingAmount, LS_KEY, phases, type SizingMode, TOTAL_DAYS } from "./trackerData";

const SIZING_MODE_KEY = "sol_speedrun_sizing_mode";
const COMPLETIONS_KEY = "sol_speedrun_completions";
const CHALLENGE_START_DATE_KEY = "sol_speedrun_challenge_start_date";
const COMPLETION_GOAL = 100;

type AuthState = {
  configured: boolean;
  canSync: boolean;
  isLoading: boolean;
  isSignedIn: boolean;
  userLabel: string | null;
  signIn?: () => void | Promise<void>;
  signOut?: () => void | Promise<void>;
};

type AppProps = {
  auth?: AuthState;
  remoteProgress?: ProgressSnapshot;
  remoteLoading?: boolean;
  onRemoteChange?: (progress: ProgressSnapshot) => void | Promise<void>;
};

export type ProgressSnapshot = {
  checkedDays: number[];
  completions: number;
};

function loadLocalChecked() {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
  } catch {
    return new Set<number>();
  }
}

function saveLocalChecked(checked: Set<number>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...checked]));
  } catch {
    // Local storage can be unavailable in private or restricted browser modes.
  }
}

function loadLocalCompletions() {
  try {
    return clampCompletions(Number(JSON.parse(localStorage.getItem(COMPLETIONS_KEY) || "0")));
  } catch {
    return 0;
  }
}

function saveLocalCompletions(completions: number) {
  try {
    localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(clampCompletions(completions)));
  } catch {
    // Local storage can be unavailable in private or restricted browser modes.
  }
}

function loadLocalStartDate() {
  try {
    const saved = localStorage.getItem(CHALLENGE_START_DATE_KEY) || "";
    return isDateInputValue(saved) ? saved : "";
  } catch {
    return "";
  }
}

function saveLocalStartDate(startDate: string) {
  try {
    if (startDate) localStorage.setItem(CHALLENGE_START_DATE_KEY, startDate);
    else localStorage.removeItem(CHALLENGE_START_DATE_KEY);
  } catch {
    // The date selector still works for this session if local storage is blocked.
  }
}

function clampCompletions(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), COMPLETION_GOAL);
}

function isDateInputValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateInput(value: string) {
  if (!isDateInputValue(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function addCalendarDays(date: Date, daysToAdd: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + daysToAdd);
  return next;
}

function formatGoalDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function loadSizingMode(): SizingMode {
  try {
    return localStorage.getItem(SIZING_MODE_KEY) === "pullupso" ? "pullupso" : "conservative";
  } catch {
    return "conservative";
  }
}

export function getLocalCheckedDays() {
  return [...loadLocalChecked()].sort((a, b) => a - b);
}

export function getLocalProgress(): ProgressSnapshot {
  return {
    checkedDays: getLocalCheckedDays(),
    completions: loadLocalCompletions(),
  };
}

export default function App({ auth, remoteProgress, remoteLoading = false, onRemoteChange }: AppProps) {
  const [localChecked, setLocalChecked] = useState(() => loadLocalChecked());
  const [localCompletions, setLocalCompletions] = useState(() => loadLocalCompletions());
  const [currentPhase, setCurrentPhase] = useState(0);
  const [sizingMode, setSizingMode] = useState<SizingMode>(() => loadSizingMode());
  const [challengeStartDate, setChallengeStartDate] = useState(() => loadLocalStartDate());
  const checked = useMemo(
    () => new Set(remoteProgress?.checkedDays ?? [...localChecked]),
    [localChecked, remoteProgress],
  );
  const completions = remoteProgress?.completions ?? localCompletions;
  const checkedList = useMemo(() => [...checked].sort((a, b) => a - b), [checked]);
  const totalDone = checked.size;
  const overallPct = ((totalDone / TOTAL_DAYS) * 100).toFixed(1);
  const isChallengeComplete = totalDone === TOTAL_DAYS;

  useEffect(() => {
    if (remoteProgress) {
      const nextChecked = new Set(remoteProgress.checkedDays);
      setLocalChecked(nextChecked);
      setLocalCompletions(remoteProgress.completions);
      saveLocalChecked(nextChecked);
      saveLocalCompletions(remoteProgress.completions);
    }
  }, [remoteProgress]);

  useEffect(() => {
    try {
      localStorage.setItem(SIZING_MODE_KEY, sizingMode);
    } catch {
      // Sizing mode still works for this session if local storage is blocked.
    }
  }, [sizingMode]);

  useEffect(() => {
    saveLocalStartDate(challengeStartDate);
  }, [challengeStartDate]);

  const persist = (next: Set<number>, nextCompletions = completions) => {
    const nextList = [...next].sort((a, b) => a - b);
    const sanitizedCompletions = clampCompletions(nextCompletions);
    setLocalChecked(next);
    setLocalCompletions(sanitizedCompletions);
    saveLocalChecked(next);
    saveLocalCompletions(sanitizedCompletions);
    void onRemoteChange?.({ checkedDays: nextList, completions: sanitizedCompletions });
  };

  const toggleDay = (day: number, isChecked: boolean) => {
    const next = new Set(checked);
    if (isChecked) next.add(day);
    else next.delete(day);
    persist(next);
  };

  const resetAll = () => persist(new Set());
  const logCompletion = () => {
    if (!isChallengeComplete || completions >= COMPLETION_GOAL) return;
    persist(new Set(), completions + 1);
  };
  const adjustCompletions = (delta: number) => {
    persist(checked, completions + delta);
  };
  const resetCompletions = () => {
    persist(checked, 0);
  };
  const visibleDays = currentPhase === 0 ? days : days.filter((day) => day.phase === currentPhase);

  return (
    <>
      <header className="header">
        <div className="logo-line">
          <div className="dot" />
          <span className="logo-text">Full Speedrun · 1 SOL Start</span>
        </div>
        <div className="header-main">
          <div>
            <h1>
              1 SOL → <span>5,000 SOL</span>
            </h1>
            <p className="subtitle">Best case · 12-15 hrs/day · MB 0.04 → 4.5 SOL cap · 73 trading days</p>
            <a className="rules-link" href="https://trading-rules.vercel.app/" rel="noopener noreferrer" target="_blank">
              Trading rules
            </a>
          </div>
          <AuthControls auth={auth} remoteLoading={remoteLoading} />
        </div>
        <div className="summary-row">
          <Stat label="Timeline" value="73 days" />
          <Stat label="Start" value="1 SOL" />
          <Stat label="Final goal" value="5,000 SOL" />
          <Stat label="3 SOL MB" value="Day 42" />
          <Stat label="4.5 cap" value="Day 57" />
          <Stat label="5K completed" value={`${completions}/${COMPLETION_GOAL}`} />
        </div>
        <SizingToggle mode={sizingMode} onChange={setSizingMode} />
      </header>

      <section className="tracker">
        <div className="tracker-top">
          <div>
            <div className="tracker-title">Overall progress</div>
            <div className="tracker-count">{totalDone} / 73</div>
            <div className="tracker-sub">{overallPct}% of roadmap complete</div>
          </div>
          <button className="reset-btn" onClick={resetAll} type="button">
            reset all
          </button>
        </div>
        <div className="main-track">
          <div className="main-fill" style={{ width: `${overallPct}%` }} />
        </div>
        <CompletionCounter
          completions={completions}
          isComplete={isChallengeComplete}
          onAdjustCompletions={adjustCompletions}
          onLogCompletion={logCompletion}
          onResetCompletions={resetCompletions}
        />
        <ChallengeDatePlanner
          completedDays={totalDone}
          startDate={challengeStartDate}
          onStartDateChange={setChallengeStartDate}
        />
        <div className="phase-bars">
          {phases.map((phase) => {
            const phaseDays = days.filter((day) => day.phase === phase.id);
            const doneDays = phaseDays.filter((day) => checked.has(day.day)).length;
            return (
              <div className="phase-bar-item" key={phase.id}>
                <div className="phase-bar-label">
                  <span style={{ color: phase.color }}>P{phase.id}</span>
                  <span>{doneDays}/{phase.days}</span>
                </div>
                <div className="phase-bar-track">
                  <div
                    className="phase-bar-fill"
                    style={{ width: `${(doneDays / phaseDays.length) * 100}%`, background: phase.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <nav className="phase-nav" aria-label="Phase filters">
        <button
          className="pnav"
          onClick={() => setCurrentPhase(0)}
          style={{ background: "var(--bg2)", borderColor: "var(--border2)", color: "var(--muted2)", opacity: currentPhase === 0 ? 1 : 0.6 }}
          type="button"
        >
          All 73 days
        </button>
        {phases.map((phase) => (
          <button
            className="pnav"
            key={phase.id}
            onClick={() => setCurrentPhase(phase.id)}
            style={{ background: phase.bg, borderColor: phase.border, color: phase.color, opacity: currentPhase === phase.id ? 1 : 0.6 }}
            type="button"
          >
            Phase {phase.id}
          </button>
        ))}
      </nav>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="cb-col" />
              <th>Day</th>
              <th>SOL range</th>
              <th>Daily gain</th>
              <th>Max buy</th>
              <th>Size % of stack</th>
              <th>Progress to 5,000</th>
            </tr>
          </thead>
          <tbody>
            <TrackerRows daysToRender={visibleDays} checked={checked} onToggle={toggleDay} sizingMode={sizingMode} />
          </tbody>
        </table>
      </div>

      <Notes />
      <div className="sync-debug" aria-live="polite">
        {auth?.isSignedIn ? `Synced days: ${checkedList.length} · completions: ${completions}/${COMPLETION_GOAL}` : "Guest progress is saved in this browser until you sign in."}
      </div>
    </>
  );
}

function CompletionCounter({
  completions,
  isComplete,
  onAdjustCompletions,
  onLogCompletion,
  onResetCompletions,
}: {
  completions: number;
  isComplete: boolean;
  onAdjustCompletions: (delta: number) => void;
  onLogCompletion: () => void;
  onResetCompletions: () => void;
}) {
  const [adjustBy, setAdjustBy] = useState(1);
  const pct = Math.min((completions / COMPLETION_GOAL) * 100, 100);
  const sanitizedAdjustBy = Math.min(Math.max(Math.trunc(adjustBy) || 1, 1), COMPLETION_GOAL);

  return (
    <div className={isComplete ? "completion-counter ready" : "completion-counter"}>
      <div className="completion-copy">
        <span className="completion-label">5k SOL completed</span>
        <strong>{completions}/{COMPLETION_GOAL}</strong>
        <div className="completion-adjust" aria-label="Adjust completion count">
          <button onClick={() => onAdjustCompletions(-sanitizedAdjustBy)} type="button">-{sanitizedAdjustBy}</button>
          <label>
            <span>adjust by</span>
            <input
              min={1}
              max={COMPLETION_GOAL}
              onChange={(event) => setAdjustBy(Number(event.currentTarget.value))}
              type="number"
              value={adjustBy}
            />
          </label>
          <button onClick={() => onAdjustCompletions(sanitizedAdjustBy)} type="button">+{sanitizedAdjustBy}</button>
          <button className="completion-reset-btn" onClick={onResetCompletions} type="button">reset</button>
        </div>
        <span className="completion-hint">
          {isComplete ? "All 73 days checked. Log this run and start the next one." : `${COMPLETION_GOAL - completions} runs left to master the challenge.`}
        </span>
      </div>
      <div className="completion-action">
        <span className="completion-mini-track">
          <span className="completion-mini-fill" style={{ width: `${pct}%` }} />
        </span>
        {isComplete ? (
          <button className="completion-btn" disabled={completions >= COMPLETION_GOAL} onClick={onLogCompletion} type="button">
            log completion
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ChallengeDatePlanner({
  completedDays,
  startDate,
  onStartDateChange,
}: {
  completedDays: number;
  startDate: string;
  onStartDateChange: (startDate: string) => void;
}) {
  const parsedStartDate = parseDateInput(startDate);
  const completedDayOffset = Math.max(completedDays, 1);
  const remainingDays = Math.max(TOTAL_DAYS - completedDays, 0);
  const finishDate = parsedStartDate ? addCalendarDays(parsedStartDate, TOTAL_DAYS - completedDayOffset) : null;

  return (
    <div className="challenge-date-planner">
      <label className="challenge-date-field">
        <span className="completion-label">Challenge start date</span>
        <input
          onChange={(event) => onStartDateChange(event.currentTarget.value)}
          type="date"
          value={startDate}
        />
      </label>
      <div className="challenge-date-result">
        <span className="completion-label">Expected goal date</span>
        <strong>{finishDate ? formatGoalDate(finishDate) : "Select a start date"}</strong>
        <span className="completion-hint">
          {completedDays > 0
            ? `${completedDays}/${TOTAL_DAYS} days checked. ${remainingDays} days left.`
            : "Day 73 is counted as the goal day."}
        </span>
      </div>
    </div>
  );
}

function SizingToggle({ mode, onChange }: { mode: SizingMode; onChange: (mode: SizingMode) => void }) {
  return (
    <section className="sizing-toggle" aria-label="Sizing mode">
      <button
        aria-pressed={mode === "conservative"}
        className={mode === "conservative" ? "sizing-option active" : "sizing-option"}
        onClick={() => onChange("conservative")}
        type="button"
      >
        <span>Conservative sizing</span>
        <small>Current beginner max-buy ladder</small>
      </button>
      <button
        aria-pressed={mode === "pullupso"}
        className={mode === "pullupso" ? "sizing-option active" : "sizing-option"}
        onClick={() => onChange("pullupso")}
        type="button"
      >
        <span>Pullupso sizing</span>
        <small>Faster snowball, capped as port grows</small>
      </button>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function AuthControls({ auth, remoteLoading }: { auth?: AuthState; remoteLoading: boolean }) {
  const [authError, setAuthError] = useState<string | null>(null);

  if (!auth?.configured) {
    return (
      <div className="auth-card">
        <div className="auth-title">Sign-in not configured</div>
        <p>Add your Convex and WorkOS env vars to enable cloud progress.</p>
      </div>
    );
  }

  if (auth.isLoading) {
    return <div className="auth-card">Checking session...</div>;
  }

  if (auth.isSignedIn) {
    return (
      <div className="auth-card">
        <div className="auth-title">Signed in</div>
        <p>
          {auth.userLabel}
          {auth.canSync ? (remoteLoading ? " · syncing..." : " · progress synced") : " · sync connecting..."}
        </p>
        <button className="auth-btn secondary" onClick={() => void auth.signOut?.()} type="button">
          Sign out
        </button>
      </div>
    );
  }

  const handleSignIn = async () => {
    setAuthError(null);

    try {
      await auth.signIn?.();
    } catch (error) {
      console.error(error);
      setAuthError("Sign-in could not start. Check the configured WorkOS redirect URL and allowed origin.");
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-title">Save your progress</div>
      <p>Sign in to sync checked days across devices.</p>
      <button className="auth-btn" onClick={() => void handleSignIn()} type="button">
        Sign in
      </button>
      {authError ? <p className="auth-error">{authError}</p> : null}
    </div>
  );
}

function TrackerRows({
  daysToRender,
  checked,
  onToggle,
  sizingMode,
}: {
  daysToRender: typeof days;
  checked: Set<number>;
  onToggle: (day: number, isChecked: boolean) => void;
  sizingMode: SizingMode;
}) {
  let lastPhase = -1;

  return (
    <>
      {daysToRender.map((row) => {
        const phase = phases.find((candidate) => candidate.id === row.phase)!;
        const phaseDays = days.filter((day) => day.phase === row.phase);
        const doneDays = phaseDays.filter((day) => checked.has(day.day)).length;
        const includeDivider = row.phase !== lastPhase;
        lastPhase = row.phase;
        const gain = row.end - row.start;
        const pct = ((gain / row.start) * 100).toFixed(1);
        const progress = Math.min((row.end / FINAL) * 100, 100).toFixed(1);
        const quickBuy = getSizingAmount(row.day, row.start, sizingMode);
        const quickBuyPct = ((quickBuy / row.start) * 100).toFixed(1);
        const isChecked = checked.has(row.day);

        return (
          <Fragment key={row.day}>
            {includeDivider && (
              <tr className="phase-divider" key={`phase-${row.phase}`}>
                <td colSpan={7} style={{ borderLeft: `2px solid ${phase.color}` }}>
                  <div className="divider-inner">
                    <span>{phase.label}</span>
                    <div className="divider-prog">
                      <div className="divider-track">
                        <div className="divider-fill" style={{ background: phase.color, width: `${(doneDays / phaseDays.length) * 100}%` }} />
                      </div>
                      <span className="divider-count">{doneDays}/{phaseDays.length} done</span>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            <tr
              className={isChecked ? "row-done" : ""}
              key={row.day}
              style={{ borderLeft: `2px solid ${phase.color}`, background: row.milestone ? phase.bg : undefined }}
            >
              <td className="cb-col">
                <div className="cb-wrap">
                  <input
                    checked={isChecked}
                    className="day-cb"
                    onChange={(event) => onToggle(row.day, event.currentTarget.checked)}
                    type="checkbox"
                  />
                </div>
              </td>
              <td><span className="day-num">Day {row.day}</span></td>
              <td>
                <span className="sol-range">
                  {fmt(row.start)}<span className="arrow">→</span>
                  <span className="end-sol" style={{ color: phase.color }}>{fmt(row.end)} SOL</span>
                </span>
                {row.milestone ? <Badge label={row.milestone} phase={phase} /> : row.unlock ? <Badge label={`${fmtSizing(quickBuy)} SOL unlocked`} phase={phase} /> : null}
              </td>
              <td>
                <span className="daily-gain" style={{ color: phase.color }}>+{fmt(gain)} SOL</span>
                <span className="pct-gain">(+{pct}%)</span>
              </td>
              <td><span className="mb-cell" style={{ color: phase.color }}>{fmtSizing(quickBuy)} SOL</span></td>
              <td>
                <span className="mb-cell" style={{ color: phase.color }}>{quickBuyPct}%</span>
                <span className="pct-gain"> of stack</span>
              </td>
              <td>
                <span className="progress-label">{progress}%</span>
                <span className="prog-bar-wrap">
                  <span className="prog-bar-inner" style={{ width: `${progress}%`, background: phase.color }} />
                </span>
              </td>
            </tr>
          </Fragment>
        );
      })}
    </>
  );
}

function Badge({ label, phase }: { label: string; phase: { bg: string; color: string; border: string } }) {
  return <span className="badge" style={{ background: phase.bg, color: phase.color, border: `0.5px solid ${phase.border}` }}>{label}</span>;
}

function Notes() {
  const [showSizingGuide, setShowSizingGuide] = useState(false);

  return (
    <section className="notes-section">
      <div className="note-card">
        <div className="note-title">Daily % by phase</div>
        <div className="note-body">
          Phase 1 (1-16 SOL): <strong>~18-20%</strong><br />
          Phase 2 (16-86 SOL): <strong>~15-17%</strong><br />
          Phase 3 (86-364 SOL): <strong>~13-15%</strong><br />
          Phase 4 (364-569 SOL): <strong>~12%</strong><br />
          Phase 5 (569-1,980 SOL): <strong>~8-10%</strong><br />
          Phase 6 (1,980-5,000 SOL): <strong>~6%</strong>
        </div>
      </div>
      <div className="note-card">
        <div className="note-title">3 key milestones</div>
        <div className="note-body">
          <strong>Day 42</strong> - 3 SOL MB unlocked<br />
          Portfolio: ~540 SOL<br /><br />
          <strong>Day 57</strong> - 4.5 SOL cap reached<br />
          Portfolio: ~1,900 SOL<br /><br />
          <strong>Day 73</strong> - 5,000 SOL reached
        </div>
      </div>
      <div className="note-card">
        <div className="note-title">Phase 1 is the grind</div>
        <div className="note-body">
          Days 1-16 at 0.04-0.2 SOL MB feel painfully slow but they are <strong>the most important</strong>.<br />
          Every habit you build here - hold discipline, no tilt, cut fast - <strong>carries to every phase after</strong>.
        </div>
      </div>
      <div className="note-card">
        <div className="note-title">Reality check</div>
        <div className="note-body">
          This is <strong>zero bad days, best-case markets</strong>.<br />
          Real timeline: add <strong>15-25 days</strong> for off sessions.<br />
          At Phase 5+ a single tilt day can cost you a week. The stop-loss rule becomes non-negotiable.
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Pullupso 3 SOL to 2,000 SOL in 7 days tips</div>
        <div className="note-body">
          Source: <a href="https://x.com/pullupso" target="_blank" rel="noopener noreferrer">@pullupso on X</a>
          <button className="guide-toggle" onClick={() => setShowSizingGuide((current) => !current)} type="button">
            {showSizingGuide ? "Hide sizing guide" : "Show sizing guide"}
          </button>
          {showSizingGuide ? (
            <div className="pullupso-quote">
              <p>Sizing and tips/ tricks i used to go from 3 sol to 2000 sol in 7 days.</p>
              <p>2-5+ Use .5 - 1 sol (scalp pumpfuns for .2-.5 or more just sell when u think chart goes down) DO THIS OVER AND OVER TIL around 10+ SOL or until ur happy or u feel like u get the hang of it, literally just break even or sell in 10-20% losses if ur cutting. ( .3 is also good, but this is my preference to snowball quick early on, and juice out .5-1 sol pnls)</p>
              <p>5-20+ use .5-3 Scalp and try bid 12-25k mc coins at bottom of abt to grad, method below (20+ category)</p>
              <p>20+ 2/3 normal bid 5 max bid</p>
              <p>do this all the way until u can size 5 into potential runners and cut in loss for 1-2 sol or play conviction on fresh migrates but still stick to new pairs on abt to grad and filter coins by spam hiding dogshit (0 min - 120 mins) filter ( THIS IS WHEN U CAN BUY 3-5% OF PUMPFUNS AND MAKE THE MOST MONEY YOU'VE SEEN SO FAR) this is where you predominantly try to catch 150-600k toppers on pump ( 2 sol on 20k entry = 20 sol at 200k)</p>
              <p>50+ : adopt ur own trading style which u can figure out from ur own mentality, or your emotions towards winning certain amounts and losing (this part is a learning curve and is the difference between hitting 100+ sol PnL's and 20 sol pnls, however )</p>
              <p>100-300 sol : avoid conviction plays that are off new pairs unless bottomed. Play METAs size 1-10% of ur port into every trade u make and cut in 20-50% losses, YOU SHOULD BE HOLDING MORE AT THIS BALANCE and playing to hit runners.</p>
              <p>300+ Don't oversize (THIS PORT IS A SIZE TRAP), play ur mentality, WAIT FOR RUNNERS (SOMETHING U SHOULD BE DOING EXCLUSIVELY) Do not overtrade and don't over-size stick to 1-10% rule and in the small circumstance, take a chance on a 30-50 sol bid, I will also note that above 100 sol you SHOULD be DCA'ing with multiple bids and bidding 2-5 times every time u buy, and leave space to DCA (buy lower than ur average to lower ur average entry) into anything.</p>
              <p>NOTE:</p>
              <p>A port above 150k USD isn't necessary for this market and u should be stabling into prices u like. When the time comes I'll make another tweet on sizing in current market conditions.</p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Bear market tip</div>
        <div className="note-body">
          Source: <a href="https://x.com/0xIT4I" target="_blank" rel="noopener noreferrer">@0xIT4I on X</a>
          <div className="pullupso-quote">
            <p>
              <a href="https://x.com/0xIT4I/status/2048425543696101776?s=20" target="_blank" rel="noopener noreferrer">
                Easiest way to survive a bear market as an onchain trader is to only touch coins which are dramatically different.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Risk management</div>
        <div className="note-body">
          Source: <a href="https://x.com/tradingpepefrog" target="_blank" rel="noopener noreferrer">@tradingpepefrog on X</a>
          <div className="pullupso-quote">
            <p>
              <a href="https://x.com/tradingpepefrog/status/2048446835577201069?s=46" target="_blank" rel="noopener noreferrer">
                Risk management is 2 sided.
                <br /><br />
                If you did not bet HUGE enough on something with fantastic odds and payoff, you have terrible risk management.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Catching runners</div>
        <div className="note-body">
          Source: <a href="https://x.com/ferbsol" target="_blank" rel="noopener noreferrer">@ferbsol on X</a>
          <div className="pullupso-quote">
            <p>
              <a href="https://x.com/ferbsol/status/1927664021353767226" target="_blank" rel="noopener noreferrer">
                To catch a runner early, a few things need to align:
                <br /><br />
                You haven't been wrecked recently
                <br /><br />
                You're actively in memescope mode
                <br /><br />
                You're playing with money you can lose
                <br /><br />
                You've got the balls to buy, and the patience to hold
                <br /><br />
                You do some basic due diligence
                <br /><br />
                You don't sell on the first fud
                <br /><br />
                And you try to predict how big the narrative could become.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Estimating ceilings</div>
        <div className="note-body">
          Source: <a href="https://x.com/gr3gor14n" target="_blank" rel="noopener noreferrer">@gr3gor14n on X</a>
          <div className="pullupso-quote">
            <p>
              <a href="https://x.com/gr3gor14n/status/2049039199958147511?s=20" target="_blank" rel="noopener noreferrer">
                Estimate the ceiling of the coin before you buy. This was at minimum a 2 million mcap narrative. Therefore you could have bought both this one, and the OG and still ended up in big profits. Then once you have your position, reassess your ceilings based on volume/holders/kols calling. GL next time
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Narrative selection guide (N.A.R.R.A.T.I.V.E)</div>
        <div className="note-body narrative-mini-guide">
          <div className="narrative-mini-row">
            <span className="narrative-mini-letter">N</span>
            <div>
              <strong>News</strong>
              <p>Breaking news events - macro, geopolitical, viral headlines</p>
            </div>
            <span className="narrative-mini-tag">e.g. $TARIFF, $WAR</span>
          </div>
          <div className="narrative-mini-row">
            <span className="narrative-mini-letter">A</span>
            <div>
              <strong>Animal</strong>
              <p>Dog, cat, frog, bear - creature-based coins and species trends</p>
            </div>
            <span className="narrative-mini-tag">e.g. $DOGE, $PEPE</span>
          </div>
          <div className="narrative-mini-row">
            <span className="narrative-mini-letter">R</span>
            <div>
              <strong>Relevant</strong>
              <p>Timely to current market cycle - fits the meta, on-trend narrative</p>
            </div>
            <span className="narrative-mini-tag">cycle fit</span>
          </div>
          <div className="narrative-mini-row">
            <span className="narrative-mini-letter">R</span>
            <div>
              <strong>Real world events</strong>
              <p>Political figures, sports moments, celebrity culture, entertainment</p>
            </div>
            <span className="narrative-mini-tag">e.g. $TRUMP, $SUPERBOWL</span>
          </div>
          <div className="narrative-mini-row">
            <span className="narrative-mini-letter">A</span>
            <div>
              <strong>AI</strong>
              <p>Artificial intelligence theme - agent coins, AI mascots, tech hype</p>
            </div>
            <span className="narrative-mini-tag">e.g. $GOAT, $AIXBT</span>
          </div>
          <div className="narrative-mini-row">
            <span className="narrative-mini-letter">T</span>
            <div>
              <strong>Tech</strong>
              <p>Blockchain launches, L2s, protocol upgrades driving ecosystem memes</p>
            </div>
            <span className="narrative-mini-tag">chain-native hype</span>
          </div>
          <div className="narrative-mini-row">
            <span className="narrative-mini-letter">I</span>
            <div>
              <strong>Influencer / KOL</strong>
              <p>Celebrity, creator, or KOL-backed coins - social reach as catalyst</p>
            </div>
            <span className="narrative-mini-tag">e.g. $HAWK, $JENNER</span>
          </div>
          <div className="narrative-mini-row">
            <span className="narrative-mini-letter">V</span>
            <div>
              <strong>Viral</strong>
              <p>Internet meme culture - TikTok trends, X posts, Reddit, viral moments</p>
            </div>
            <span className="narrative-mini-tag">e.g. $MOODENG</span>
          </div>
          <div className="narrative-mini-row">
            <span className="narrative-mini-letter">E</span>
            <div>
              <strong>Exchange listing</strong>
              <p>CEX or major DEX listing as the narrative catalyst - liquidity event</p>
            </div>
            <span className="narrative-mini-tag">CEX pump</span>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Narrative selection guide advanced</div>
        <div className="note-body narrative-guide">
          <strong>CERTAIN PROFIT</strong>
          <p><strong>C - Community:</strong> Tokens built around strong, engaged communities with active Discord/Telegram groups, dedicated holders, and organic grassroots momentum that drives sustained interest beyond initial hype.</p>
          <p><strong>E - Event-driven:</strong> Coins launched in response to specific scheduled events like product launches, conferences, token unlocks, or anticipated announcements that create predictable volatility windows.</p>
          <p><strong>R - Relevant:</strong> Narratives that tap into current cultural zeitgeist, trending topics, or conversations dominating social media and mainstream attention at the exact moment of launch.</p>
          <p><strong>T - Tech:</strong> Projects leveraging technical innovations like novel token mechanics, on-chain utilities, smart contract features, or blockchain infrastructure improvements that differentiate them from pure meme plays.</p>
          <p><strong>A - Animal:</strong> Classic memecoin category featuring dogs, cats, frogs, and other creatures that have historically performed well due to broad appeal, visual recognizability, and emotional connection.</p>
          <p><strong>I - Intelligence/AI:</strong> Tokens centered on artificial intelligence themes, AI agents, autonomous systems, or machine learning narratives that capitalize on the explosive interest in AI technology.</p>
          <p><strong>N - News:</strong> Reactive launches tied to breaking news stories, viral moments, or unexpected headlines that create immediate attention and trading opportunities within hours of the event.</p>
          <p><strong>P - Political:</strong> Coins referencing politicians, elections, policy decisions, or government events that benefit from high media coverage and passionate supporter bases willing to "vote with their wallets".</p>
          <p><strong>R - Original:</strong> First-of-its-kind concepts or truly novel narrative angles that haven't been exploited yet, giving traders the psychological appeal of discovering something genuinely new.</p>
          <p><strong>O - Offensive/Satire:</strong> Edgy, provocative, or culturally subversive memes that leverage internet culture, dark humor, or controversial themes to generate viral spread through shock value and shareability.</p>
          <p><strong>F - Financial:</strong> Tokens that parody or reference trading culture, Wall Street terminology, financial institutions, market mechanics, or investment themes that resonate with the crypto trader demographic.</p>
          <p><strong>I - Influencer/Celebrity:</strong> Launches tied to specific public figures, content creators, or celebrities whose personal brand and follower base can drive immediate volume and social proof.</p>
          <p><strong>T - Timing:</strong> The meta-narrative of being first to market with any breaking narrative, where speed of deployment matters more than the specific category—capturing the 2-hour launch window after major events for maximum impact.</p>
          <p><strong>M - Mascot/Brand:</strong> Tokens based on existing corporate mascots, brand characters, or recognizable logos that leverage established visual IP for instant recognition and nostalgia.</p>
          <p><strong>S - Slogan/Catchphrase:</strong> Coins built around famous sayings, viral quotes, catchphrases from movies/TV, or memorable one-liners that have cultural staying power and instant recognition.</p>
          <p><strong>L - Location/Geography:</strong> Tokens tied to specific cities, countries, regions, or places that tap into local pride, nationalism, or geographic community identity.</p>
          <p><strong>H - Historical/Nostalgia:</strong> References to historical figures, past events, retro gaming, 90s/2000s internet culture, or nostalgic themes that evoke emotional memories.</p>
          <p><strong>D - Derivative/Spin-off:</strong> Direct plays on existing successful memecoins (like "Baby X", "Mini X", "X 2.0") that ride coattails of proven narratives with slight variations.</p>
          <p><strong>V - Viral Trend:</strong> Tokens based on TikTok trends, YouTube phenomena, Twitter/X moments, or rapidly spreading internet content that hasn't yet been monetized.</p>
          <p><strong>W - World Event:</strong> Global happenings like sports championships, natural disasters, space missions, scientific breakthroughs, or international incidents that dominate headlines.</p>
          <p><strong>U - Utility Promise:</strong> Memecoins that claim future functionality, gaming integration, NFT collections, or ecosystem building (even if speculative) to justify holding beyond pure speculation.</p>
          <p><strong>X - X-Rated/Adult:</strong> NSFW themes, adult entertainment references, or sexually suggestive content that targets a specific market segment willing to trade edgier material.</p>
          <p><strong>K - Kayfabe/Wrestling:</strong> Coins that create ongoing storylines, rivalries, character arcs, or competitive narratives between different tokens to maintain engagement.</p>
          <p><strong>B - Blockchain-Native:</strong> Tokens that embody the identity of their specific chain to rally tribal community loyalty around the ecosystem.</p>
          <p><strong>Y - Yolo/Degen:</strong> Pure gambling/casino-themed coins, "send it" culture, risk-taking mentality, or meta-commentary on degenerate trading behavior itself.</p>
          <p><strong>J - Joke/Parody:</strong> Direct parodies of serious crypto projects, mocking traditional finance, or satirical takes on the crypto industry itself.</p>
          <p><strong>Q - Quality/Blue-chip:</strong> Established memecoins that have "graduated" to CEX listings and are treated as longer-term holds rather than pure pumps.</p>
          <p><strong>Z - Zodiac/Mystical:</strong> Astrology, spiritual themes, mysticism, fortune-telling, or esoteric/occult references that tap into metaphysical communities.</p>
          <p><strong>E - Emoji/Symbol:</strong> Tokens represented primarily by emojis or symbols rather than words that communicate purely through visual shorthand.</p>
          <p><strong>R - Rivalry/Feud:</strong> Coins created specifically to compete with or mock another memecoin, creating tribal warfare between holder communities.</p>
          <p><strong>C - Chain-Specific Platform:</strong> Tokens tied to specific launchpads or platforms that inherit the platform's user base.</p>
          <p><strong>A - Archive/Meta-Meme:</strong> Projects that archive meme culture itself or provide commentary on the memecoin phenomenon.</p>
          <p><strong>I - Irony/Absurdist:</strong> Deliberately nonsensical or absurdist concepts that lean into meaninglessness as the point.</p>
          <p><strong>F - Food/Beverage:</strong> Tokens based on food items, drinks, restaurant brands, or culinary culture that tap into universal food appreciation.</p>
          <p><strong>S - Sports/Team:</strong> Coins tied to specific sports, teams, athletes, championships, or sporting events that leverage fan tribalism and competitive passion.</p>
          <p><strong>R - Religion/Spiritual:</strong> Faith-based memecoins targeting religious communities with ethical/values-aligned narratives.</p>
          <p><strong>C - Color/Aesthetic:</strong> Tokens defined primarily by a color scheme or visual aesthetic rather than concept.</p>
          <p><strong>N - NFT-Derivative:</strong> Memecoins launched by existing NFT projects that leverage established NFT communities and IP.</p>
          <p><strong>M - Music/Sound:</strong> References to songs, musicians, genres, sound effects, or audio memes that have cultural resonance beyond visual content.</p>
          <p><strong>T - TV/Movie:</strong> Specific references to television shows, movies, or streaming content.</p>
          <p><strong>G - Gaming Character:</strong> Specific video game characters, gaming franchises, or esports personalities.</p>
          <p><strong>O - Occupation/Profession:</strong> Tokens themed around specific jobs, professions, or career archetypes.</p>
          <p><strong>E - Elon-Specific:</strong> Tokens specifically tied to Elon Musk due to his unique market-moving power and dedicated sub-narrative.</p>
          <p><strong>C - Cartoon/Animation:</strong> Specific cartoon characters or animation styles from established media properties.</p>
          <p><strong>M - Meta-Commentary:</strong> Coins that explicitly comment on the memecoin phenomenon itself, the absurdity of crypto trading, or are self-aware about being memes.</p>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Narrative tiers</div>
        <div className="note-body narrative-guide">
          <strong>All Tiers Combined</strong>
          <p><strong>Tier 1 (Hot/Reactive):</strong> News, Political, Event-driven, Elon-Specific, Viral Trend, World Event, Timing</p>
          <p><strong>Tier 2 (Cultural):</strong> Animal, Influencer/Celebrity, Slogan/Catchphrase, Mascot/Brand, Food/Beverage, Sports/Team, Music/Sound, TV/Movie, Cartoon/Animation</p>
          <p><strong>Tier 3 (Technical):</strong> Intelligence/AI, Tech, Blockchain-Native, NFT-Derivative, Utility Promise, Chain-Specific Platform</p>
          <p><strong>Tier 4 (Meta):</strong> Community, Original, Quality/Blue-chip, Archive/Meta-Meme, Meta-Commentary, Relevant</p>
          <p><strong>Tier 5 (Niche):</strong> Religion/Spiritual, Location/Geography, Historical/Nostalgia, Zodiac/Mystical, Color/Aesthetic, Occupation/Profession, Gaming Character, Emoji/Symbol, Yolo/Degen, Offensive/Satire, Joke/Parody, Financial, Rivalry/Feud, Derivative/Spin-off, Kayfabe/Wrestling, X-Rated/Adult, Irony/Absurdist</p>
        </div>
      </div>
    </section>
  );
}
