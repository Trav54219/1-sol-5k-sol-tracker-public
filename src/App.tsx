import { Fragment, useEffect, useMemo, useState } from "react";
import { days, FINAL, fmt, fmtSizing, getSizingAmount, LS_KEY, phases, type SizingMode, TOTAL_DAYS } from "./trackerData";

const SIZING_MODE_KEY = "sol_speedrun_sizing_mode";

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
  remoteCheckedDays?: number[];
  remoteLoading?: boolean;
  onRemoteChange?: (checkedDays: number[]) => void | Promise<void>;
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

export default function App({ auth, remoteCheckedDays, remoteLoading = false, onRemoteChange }: AppProps) {
  const [localChecked, setLocalChecked] = useState(() => loadLocalChecked());
  const [currentPhase, setCurrentPhase] = useState(0);
  const [sizingMode, setSizingMode] = useState<SizingMode>(() => loadSizingMode());
  const checked = useMemo(
    () => new Set(remoteCheckedDays ?? [...localChecked]),
    [localChecked, remoteCheckedDays],
  );
  const checkedList = useMemo(() => [...checked].sort((a, b) => a - b), [checked]);
  const totalDone = checked.size;
  const overallPct = ((totalDone / TOTAL_DAYS) * 100).toFixed(1);

  useEffect(() => {
    if (remoteCheckedDays) {
      setLocalChecked(new Set(remoteCheckedDays));
      saveLocalChecked(new Set(remoteCheckedDays));
    }
  }, [remoteCheckedDays]);

  useEffect(() => {
    try {
      localStorage.setItem(SIZING_MODE_KEY, sizingMode);
    } catch {
      // Sizing mode still works for this session if local storage is blocked.
    }
  }, [sizingMode]);

  const persist = (next: Set<number>) => {
    const nextList = [...next].sort((a, b) => a - b);
    setLocalChecked(next);
    saveLocalChecked(next);
    void onRemoteChange?.(nextList);
  };

  const toggleDay = (day: number, isChecked: boolean) => {
    const next = new Set(checked);
    if (isChecked) next.add(day);
    else next.delete(day);
    persist(next);
  };

  const resetAll = () => persist(new Set());
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
            <p className="subtitle">Best case · 12-15 hrs/day · QB 0.04 → 4.5 SOL cap · 73 trading days</p>
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
          <Stat label="3 SOL QB" value="Day 42" />
          <Stat label="4.5 cap" value="Day 57" />
          <Stat label="Total gain" value="~5,000x" />
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
        {auth?.isSignedIn ? `Synced days: ${checkedList.length}` : "Guest progress is saved in this browser until you sign in."}
      </div>
    </>
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
              <td><span className="qb-cell" style={{ color: phase.color }}>{fmtSizing(quickBuy)} SOL</span></td>
              <td>
                <span className="qb-cell" style={{ color: phase.color }}>{quickBuyPct}%</span>
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
          <strong>Day 42</strong> - 3 SOL QB unlocked<br />
          Portfolio: ~540 SOL<br /><br />
          <strong>Day 57</strong> - 4.5 SOL cap reached<br />
          Portfolio: ~1,900 SOL<br /><br />
          <strong>Day 73</strong> - 5,000 SOL reached
        </div>
      </div>
      <div className="note-card">
        <div className="note-title">Phase 1 is the grind</div>
        <div className="note-body">
          Days 1-16 at 0.04-0.2 SOL QB feel painfully slow but they are <strong>the most important</strong>.<br />
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
    </section>
  );
}
