import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CHALLENGES,
  TIMEFRAME_OPTIONS,
  formatChallengeAmount,
  formatChallengeSizing,
  getChallengeConfig,
  getMilestoneLabel,
  getTimeframePlan,
  getSizingAmount,
  isChallengeMode,
  isTimeframeId,
  LS_KEY,
  sanitizeChallengeFinal,
  sanitizeChallengeStart,
  type ChallengeConfig,
  type ChallengeMode,
  type DayPlan,
  type Phase,
  type SizingMode,
  type TimeframeId,
} from "./trackerData";

const CHALLENGE_MODE_KEY = "sol_speedrun_challenge_mode";
const SOL_CHALLENGE_START_KEY = "sol_speedrun_sol_start";
const USDC_CHALLENGE_START_KEY = "sol_speedrun_usdc_start";
const SOL_CHALLENGE_GOAL_KEY = "sol_speedrun_sol_goal";
const USDC_CHALLENGE_GOAL_KEY = "sol_speedrun_usdc_goal";
const SIZING_MODE_KEY = "sol_speedrun_sizing_mode";
const TIMEFRAME_KEY = "sol_speedrun_timeframe";
const COMPLETIONS_KEY = "sol_speedrun_completions";
const CHALLENGE_START_DATE_KEY = "sol_speedrun_challenge_start_date";
const COMPLETION_GOAL = 100;
const CHALLENGE_MODES: ChallengeMode[] = ["sol", "usdc"];
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_PRICE_URL = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;
const SOL_PRICE_REFRESH_MS = 30_000;

type SolPriceStatus = "loading" | "ready" | "error";

type SolPriceState = {
  price: number | null;
  status: SolPriceStatus;
  updatedAt: number | null;
};

type FeePreset = {
  name: string;
  buySize: string;
  slippage: string;
  priority: string;
  bribe: string;
  autoFee: string;
  maxFee: string;
  mevMode: string;
};

const FEE_PRESETS: FeePreset[] = [
  {
    name: "Preset 1",
    buySize: "Under 0.5 SOL buys",
    slippage: "100%",
    priority: "0.0001",
    bribe: "0.0001",
    autoFee: "Off",
    maxFee: "0.01",
    mevMode: "Off",
  },
  {
    name: "Preset 2",
    buySize: "0.5-1 SOL buys",
    slippage: "100%",
    priority: "0.001",
    bribe: "0.01",
    autoFee: "Off",
    maxFee: "0.1",
    mevMode: "Reduced",
  },
  {
    name: "Preset 3",
    buySize: "1+ SOL buys",
    slippage: "10000%",
    priority: "0.0001",
    bribe: "0.0001",
    autoFee: "On",
    maxFee: "0.1",
    mevMode: "Reduced",
  },
];

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

type ChallengeGoals = Record<ChallengeMode, number>;
type ChallengeStarts = Record<ChallengeMode, number>;
type ModeProgressSnapshot = {
  checkedDays: number[];
  completions: number;
};

export type ProgressSnapshot = Record<ChallengeMode, ModeProgressSnapshot>;

type LegacyProgressSnapshot = {
  checkedDays?: number[];
  completions?: number;
  sol?: Partial<ModeProgressSnapshot>;
  usdc?: Partial<ModeProgressSnapshot>;
};

function getCheckedStorageKey(mode: ChallengeMode) {
  return `${LS_KEY}_${mode}`;
}

function getCompletionsStorageKey(mode: ChallengeMode) {
  return `${COMPLETIONS_KEY}_${mode}`;
}

function loadLocalChecked(mode: ChallengeMode) {
  try {
    const saved = localStorage.getItem(getCheckedStorageKey(mode));
    const fallback = mode === "sol" ? localStorage.getItem(LS_KEY) : null;
    return new Set<number>(JSON.parse(saved ?? fallback ?? "[]"));
  } catch {
    return new Set<number>();
  }
}

function saveLocalChecked(mode: ChallengeMode, checked: Set<number>) {
  try {
    localStorage.setItem(getCheckedStorageKey(mode), JSON.stringify([...checked]));
  } catch {
    // Local storage can be unavailable in private or restricted browser modes.
  }
}

function loadLocalCompletions(mode: ChallengeMode) {
  try {
    const saved = localStorage.getItem(getCompletionsStorageKey(mode));
    const fallback = mode === "sol" ? localStorage.getItem(COMPLETIONS_KEY) : null;
    return clampCompletions(Number(JSON.parse(saved ?? fallback ?? "0")));
  } catch {
    return 0;
  }
}

function saveLocalCompletions(mode: ChallengeMode, completions: number) {
  try {
    localStorage.setItem(getCompletionsStorageKey(mode), JSON.stringify(clampCompletions(completions)));
  } catch {
    // Local storage can be unavailable in private or restricted browser modes.
  }
}

function loadLocalProgressByMode(): ProgressSnapshot {
  return {
    sol: {
      checkedDays: [...loadLocalChecked("sol")].sort((a, b) => a - b),
      completions: loadLocalCompletions("sol"),
    },
    usdc: {
      checkedDays: [...loadLocalChecked("usdc")].sort((a, b) => a - b),
      completions: loadLocalCompletions("usdc"),
    },
  };
}

export function normalizeProgressSnapshot(progress: LegacyProgressSnapshot | null | undefined): ProgressSnapshot {
  const fallback = progress ?? undefined;
  return {
    sol: normalizeModeProgress(progress?.sol, fallback),
    usdc: normalizeModeProgress(progress?.usdc),
  };
}

function normalizeModeProgress(progress?: Partial<ModeProgressSnapshot>, fallback?: LegacyProgressSnapshot): ModeProgressSnapshot {
  const checkedDays = progress?.checkedDays ?? fallback?.checkedDays ?? [];
  const completions = progress?.completions ?? fallback?.completions ?? 0;
  return {
    checkedDays: Array.isArray(checkedDays) ? checkedDays : [],
    completions: clampCompletions(completions),
  };
}

function saveLocalModeProgress(mode: ChallengeMode, progress: ModeProgressSnapshot) {
  saveLocalChecked(mode, new Set(progress.checkedDays));
  saveLocalCompletions(mode, progress.completions);
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

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function calendarDaysBetween(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / msPerDay);
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

function loadChallengeMode(): ChallengeMode {
  try {
    const saved = localStorage.getItem(CHALLENGE_MODE_KEY);
    return isChallengeMode(saved) ? saved : "sol";
  } catch {
    return "sol";
  }
}

function getGoalStorageKey(mode: ChallengeMode) {
  return mode === "sol" ? SOL_CHALLENGE_GOAL_KEY : USDC_CHALLENGE_GOAL_KEY;
}

function getStartStorageKey(mode: ChallengeMode) {
  return mode === "sol" ? SOL_CHALLENGE_START_KEY : USDC_CHALLENGE_START_KEY;
}

function loadChallengeStart(mode: ChallengeMode) {
  const challenge = CHALLENGES[mode];
  try {
    const saved = localStorage.getItem(getStartStorageKey(mode));
    return sanitizeChallengeStart(saved ? Number(saved) : challenge.defaultStart, challenge);
  } catch {
    return challenge.defaultStart;
  }
}

function saveChallengeStart(mode: ChallengeMode, start: number) {
  try {
    localStorage.setItem(getStartStorageKey(mode), String(start));
  } catch {
    // Start edits still work for this session if local storage is blocked.
  }
}

function loadChallengeGoal(mode: ChallengeMode) {
  const challenge = CHALLENGES[mode];
  try {
    const saved = localStorage.getItem(getGoalStorageKey(mode));
    return sanitizeChallengeFinal(saved ? Number(saved) : challenge.defaultFinal, challenge);
  } catch {
    return challenge.defaultFinal;
  }
}

function saveChallengeGoal(mode: ChallengeMode, goal: number) {
  try {
    localStorage.setItem(getGoalStorageKey(mode), String(goal));
  } catch {
    // Goal edits still work for this session if local storage is blocked.
  }
}

function loadChallengeGoals(): ChallengeGoals {
  return {
    sol: loadChallengeGoal("sol"),
    usdc: loadChallengeGoal("usdc"),
  };
}

function loadChallengeStarts(): ChallengeStarts {
  return {
    sol: loadChallengeStart("sol"),
    usdc: loadChallengeStart("usdc"),
  };
}

function loadTimeframe(): TimeframeId {
  try {
    const saved = localStorage.getItem(TIMEFRAME_KEY);
    return isTimeframeId(saved) ? saved : "default";
  } catch {
    return "default";
  }
}

function useSolPrice(): SolPriceState {
  const [solPrice, setSolPrice] = useState<SolPriceState>({
    price: null,
    status: "loading",
    updatedAt: null,
  });

  useEffect(() => {
    let isMounted = true;
    let timeoutId: number | undefined;
    let controller: AbortController | null = null;

    const fetchPrice = async () => {
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch(SOL_PRICE_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`Jupiter price request failed: ${response.status}`);

        const data = await response.json();
        const nextPrice = Number(data?.[SOL_MINT]?.usdPrice);
        if (!Number.isFinite(nextPrice) || nextPrice <= 0) throw new Error("Jupiter price response did not include a valid SOL price.");

        if (isMounted) {
          setSolPrice({
            price: nextPrice,
            status: "ready",
            updatedAt: Date.now(),
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
        if (isMounted) {
          setSolPrice((current) => ({
            ...current,
            status: current.price ? "ready" : "error",
          }));
        }
      } finally {
        if (isMounted) {
          timeoutId = window.setTimeout(fetchPrice, SOL_PRICE_REFRESH_MS);
        }
      }
    };

    void fetchPrice();

    return () => {
      isMounted = false;
      controller?.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return solPrice;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatSolUsdEquivalent(value: number, challenge: ChallengeConfig, solPrice: number | null) {
  if (challenge.unit !== "SOL" || !solPrice) return null;
  return `≈ ${formatUsd(value * solPrice)}`;
}

function formatSolPriceUpdatedAt(updatedAt: number | null) {
  if (!updatedAt) return "Waiting for Jupiter";
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(updatedAt)}`;
}

export function getLocalCheckedDays() {
  return loadLocalProgressByMode().sol.checkedDays;
}

export function getLocalProgress(): ProgressSnapshot {
  return loadLocalProgressByMode();
}

export default function App({ auth, remoteProgress, remoteLoading = false, onRemoteChange }: AppProps) {
  const [localProgress, setLocalProgress] = useState(() => loadLocalProgressByMode());
  const [currentPhase, setCurrentPhase] = useState(0);
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>(() => loadChallengeMode());
  const [challengeStarts, setChallengeStarts] = useState<ChallengeStarts>(() => loadChallengeStarts());
  const [challengeGoals, setChallengeGoals] = useState<ChallengeGoals>(() => loadChallengeGoals());
  const [sizingMode, setSizingMode] = useState<SizingMode>(() => loadSizingMode());
  const [timeframe, setTimeframe] = useState<TimeframeId>(() => loadTimeframe());
  const [challengeStartDate, setChallengeStartDate] = useState(() => loadLocalStartDate());
  const solPrice = useSolPrice();
  const challenge = useMemo(
    () => getChallengeConfig(challengeMode, challengeGoals[challengeMode], challengeStarts[challengeMode]),
    [challengeMode, challengeGoals, challengeStarts],
  );
  const timeframePlan = useMemo(() => getTimeframePlan(timeframe, challenge), [timeframe, challenge]);
  const planDays = timeframePlan.days;
  const planPhases = timeframePlan.phases;
  const totalDays = timeframePlan.option.days;
  const targetBuyAmount = challenge.targetBuyMultiplier * challenge.start;
  const capAmount = challenge.capMultiplier * challenge.start;
  const targetBuyDay = planDays.find((day) => getSizingAmount(day.day, day.start, "conservative", challenge) >= targetBuyAmount)?.day;
  const capDay = planDays.find((day) => getSizingAmount(day.day, day.start, "conservative", challenge) >= capAmount)?.day;
  const normalizedRemoteProgress = useMemo(() => normalizeProgressSnapshot(remoteProgress), [remoteProgress]);
  const activeProgress = remoteProgress ? normalizedRemoteProgress[challengeMode] : localProgress[challengeMode];
  const checked = useMemo(() => new Set(activeProgress.checkedDays), [activeProgress]);
  const completions = activeProgress.completions;
  const checkedList = useMemo(() => [...checked].filter((day) => day <= totalDays).sort((a, b) => a - b), [checked, totalDays]);
  const checkedForPlan = useMemo(() => new Set(checkedList), [checkedList]);
  const totalDone = checkedForPlan.size;
  const overallPct = ((totalDone / totalDays) * 100).toFixed(1);
  const isChallengeComplete = totalDone === totalDays;

  useEffect(() => {
    if (remoteProgress) {
      const nextRemoteProgress = normalizeProgressSnapshot(remoteProgress);
      setLocalProgress(nextRemoteProgress);
      for (const mode of CHALLENGE_MODES) {
        saveLocalModeProgress(mode, nextRemoteProgress[mode]);
      }
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
    try {
      localStorage.setItem(CHALLENGE_MODE_KEY, challengeMode);
    } catch {
      // Challenge mode still works for this session if local storage is blocked.
    }
  }, [challengeMode]);

  useEffect(() => {
    saveChallengeGoal("sol", challengeGoals.sol);
    saveChallengeGoal("usdc", challengeGoals.usdc);
  }, [challengeGoals]);

  useEffect(() => {
    saveChallengeStart("sol", challengeStarts.sol);
    saveChallengeStart("usdc", challengeStarts.usdc);
  }, [challengeStarts]);

  useEffect(() => {
    try {
      localStorage.setItem(TIMEFRAME_KEY, timeframe);
    } catch {
      // Timeframe selection still works for this session if local storage is blocked.
    }
  }, [timeframe]);

  useEffect(() => {
    saveLocalStartDate(challengeStartDate);
  }, [challengeStartDate]);

  const persist = (next: Set<number>, nextCompletions = completions) => {
    const nextList = [...next].sort((a, b) => a - b);
    const sanitizedCompletions = clampCompletions(nextCompletions);
    const nextProgress = {
      ...localProgress,
      [challengeMode]: {
        checkedDays: nextList,
        completions: sanitizedCompletions,
      },
    };
    setLocalProgress(nextProgress);
    saveLocalChecked(challengeMode, next);
    saveLocalCompletions(challengeMode, sanitizedCompletions);
    void onRemoteChange?.(nextProgress);
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
  const updateChallengeGoal = (mode: ChallengeMode, goal: number) => {
    setChallengeGoals((current) => ({
      ...current,
      [mode]: sanitizeChallengeFinal(goal, { ...CHALLENGES[mode], start: challengeStarts[mode] }),
    }));
  };
  const updateChallengeStart = (mode: ChallengeMode, start: number) => {
    const nextStart = sanitizeChallengeStart(start, CHALLENGES[mode]);
    setChallengeStarts((current) => ({
      ...current,
      [mode]: nextStart,
    }));
    setChallengeGoals((current) => ({
      ...current,
      [mode]: sanitizeChallengeFinal(current[mode], { ...CHALLENGES[mode], start: nextStart }),
    }));
  };
  const visibleDays = currentPhase === 0 ? planDays : planDays.filter((day) => day.phase === currentPhase);

  return (
    <>
      <header className="header">
        <div className="logo-line">
          <div className="dot" />
          <span className="logo-text">Full Speedrun · {challenge.startLabel} Start</span>
        </div>
        <div className="header-main">
          <div>
            <h1>
              {challenge.startLabel} → <span>{challenge.finalLabel}</span>
            </h1>
            <p className="subtitle">
              Best case · 12-15 hrs/day · {timeframePlan.option.label} · {(timeframePlan.dailyGrowthRate * 100).toFixed(1)}% daily target
            </p>
            <a className="rules-link" href="https://trading-rules.vercel.app/" rel="noopener noreferrer" target="_blank">
              Trading rules
            </a>
          </div>
          <AuthControls auth={auth} remoteLoading={remoteLoading} />
        </div>
        <div className="summary-row">
          <Stat label="Timeline" value={`${totalDays} days`} />
          <Stat label="Live SOL" value={solPrice.price ? formatUsd(solPrice.price) : solPrice.status === "error" ? "Unavailable" : "Loading..."} hint={formatSolPriceUpdatedAt(solPrice.updatedAt)} />
          <Stat label="Start" value={challenge.startLabel} hint={formatSolUsdEquivalent(challenge.start, challenge, solPrice.price) ?? undefined} />
          <Stat label="Final goal" value={challenge.finalLabel} hint={formatSolUsdEquivalent(challenge.final, challenge, solPrice.price) ?? undefined} />
          <Stat label={`${formatChallengeSizing(targetBuyAmount, challenge)} MB`} value={targetBuyDay ? `Day ${targetBuyDay}` : "N/A"} />
          <Stat label={`${formatChallengeSizing(capAmount, challenge)} cap`} value={capDay ? `Day ${capDay}` : "N/A"} />
          <Stat label={`${challenge.completedLabel} completed`} value={`${completions}/${COMPLETION_GOAL}`} />
        </div>
        <ChallengeModeToggle goals={challengeGoals} mode={challengeMode} onChange={setChallengeMode} starts={challengeStarts} />
        <ChallengeGoalEditor goals={challengeGoals} onGoalChange={updateChallengeGoal} onStartChange={updateChallengeStart} starts={challengeStarts} />
        <TimeframeToggle timeframe={timeframe} onChange={setTimeframe} />
        <SizingToggle mode={sizingMode} onChange={setSizingMode} />
      </header>

      <section className="tracker">
        <div className="tracker-top">
          <div>
            <div className="tracker-title">Overall progress</div>
            <div className="tracker-count">{totalDone} / {totalDays}</div>
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
          totalDays={totalDays}
          challenge={challenge}
        />
        <ChallengeDatePlanner
          completedDays={totalDone}
          startDate={challengeStartDate}
          totalDays={totalDays}
          onStartDateChange={setChallengeStartDate}
        />
        <PaceIndicator completedDays={totalDone} startDate={challengeStartDate} totalDays={totalDays} />
        <RequiredGrowthCard challenge={challenge} completedDays={totalDone} planDays={planDays} totalDays={totalDays} />
        <FeeSettings />
        <div className="phase-bars">
          {planPhases.map((phase) => {
            const phaseDays = planDays.filter((day) => day.phase === phase.id);
            const doneDays = phaseDays.filter((day) => checkedForPlan.has(day.day)).length;
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
          All {totalDays} days
        </button>
        {planPhases.map((phase) => (
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
              <th>{challenge.unit} range</th>
              <th>Daily gain</th>
              <th>Max buy</th>
              <th>Size % of stack</th>
              <th>Progress to {challenge.finalLabel}</th>
            </tr>
          </thead>
          <tbody>
            <TrackerRows
              daysToRender={visibleDays}
              checked={checkedForPlan}
              onToggle={toggleDay}
              phases={planPhases}
              planDays={planDays}
              sizingMode={sizingMode}
              challenge={challenge}
              solPrice={solPrice.price}
            />
          </tbody>
        </table>
      </div>

      <Notes dailyGrowthRate={timeframePlan.dailyGrowthRate} phases={planPhases} planDays={planDays} totalDays={totalDays} challenge={challenge} />
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
  totalDays,
  challenge,
}: {
  completions: number;
  isComplete: boolean;
  onAdjustCompletions: (delta: number) => void;
  onLogCompletion: () => void;
  onResetCompletions: () => void;
  totalDays: number;
  challenge: ChallengeConfig;
}) {
  const [adjustBy, setAdjustBy] = useState(1);
  const pct = Math.min((completions / COMPLETION_GOAL) * 100, 100);
  const sanitizedAdjustBy = Math.min(Math.max(Math.trunc(adjustBy) || 1, 1), COMPLETION_GOAL);

  return (
    <div className={isComplete ? "completion-counter ready" : "completion-counter"}>
      <div className="completion-copy">
        <span className="completion-label">{challenge.completedLabel} completed</span>
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
          {isComplete ? `All ${totalDays} days checked. Log this run and start the next one.` : `${COMPLETION_GOAL - completions} runs left to master the challenge.`}
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
  totalDays,
  onStartDateChange,
}: {
  completedDays: number;
  startDate: string;
  totalDays: number;
  onStartDateChange: (startDate: string) => void;
}) {
  const parsedStartDate = parseDateInput(startDate);
  const completedDayOffset = Math.max(completedDays, 1);
  const remainingDays = Math.max(totalDays - completedDays, 0);
  const finishDate = parsedStartDate ? addCalendarDays(parsedStartDate, totalDays - completedDayOffset) : null;

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
            ? `${completedDays}/${totalDays} days checked. ${remainingDays} days left.`
            : `Day ${totalDays} is counted as the goal day.`}
        </span>
      </div>
    </div>
  );
}

function PaceIndicator({ completedDays, startDate, totalDays }: { completedDays: number; startDate: string; totalDays: number }) {
  const parsedStartDate = parseDateInput(startDate);

  if (!parsedStartDate) {
    return (
      <div className="pace-card neutral">
        <div>
          <span className="completion-label">Pace</span>
          <strong>Select a start date</strong>
        </div>
        <span className="completion-hint">Your pace will compare checked days against the selected timeframe.</span>
      </div>
    );
  }

  const elapsedDays = calendarDaysBetween(parsedStartDate, new Date());

  if (elapsedDays < 0) {
    return (
      <div className="pace-card neutral">
        <div>
          <span className="completion-label">Pace</span>
          <strong>Starts in {Math.abs(elapsedDays)} days</strong>
        </div>
        <span className="completion-hint">Pace tracking begins on your challenge start date.</span>
      </div>
    );
  }

  const expectedDays = Math.min(elapsedDays + 1, totalDays);
  const delta = completedDays - expectedDays;
  const status = delta > 0 ? "ahead" : delta < 0 ? "behind" : "on pace";
  const statusCopy = delta === 0 ? "Exactly on pace" : `${Math.abs(delta)} day${Math.abs(delta) === 1 ? "" : "s"} ${status}`;

  return (
    <div className={`pace-card ${status}`}>
      <div>
        <span className="completion-label">Pace</span>
        <strong>{statusCopy}</strong>
      </div>
      <span className="completion-hint">
        {completedDays}/{totalDays} checked vs {expectedDays}/{totalDays} expected for this plan.
      </span>
    </div>
  );
}

function RequiredGrowthCard({
  challenge,
  completedDays,
  planDays,
  totalDays,
}: {
  challenge: ChallengeConfig;
  completedDays: number;
  planDays: DayPlan[];
  totalDays: number;
}) {
  const currentDay = Math.min(completedDays, planDays.length);
  const currentBalance = currentDay > 0 ? planDays[currentDay - 1].end : challenge.start;
  const remainingDays = Math.max(totalDays - completedDays, 0);
  const requiredDailyRate = remainingDays > 0 ? Math.pow(challenge.final / currentBalance, 1 / remainingDays) - 1 : 0;
  const nextTarget = remainingDays > 0 ? currentBalance * (1 + requiredDailyRate) : challenge.final;
  const nextProfit = Math.max(nextTarget - currentBalance, 0);
  const cardState = requiredDailyRate > 1 ? "behind" : requiredDailyRate < 0.2 ? "ahead" : "neutral";

  return (
    <div className={`pace-card ${cardState}`}>
      <div>
        <span className="completion-label">Needed from here</span>
        <strong>{remainingDays > 0 ? `${(requiredDailyRate * 100).toFixed(1)}% daily` : "Goal reached"}</strong>
      </div>
      <span className="completion-hint">
        {remainingDays > 0
          ? `${formatChallengeAmount(currentBalance, challenge)} now. Need about +${formatChallengeAmount(nextProfit, challenge)} next day for ${remainingDays} days.`
          : `You reached ${challenge.finalLabel} for this run.`}
      </span>
    </div>
  );
}

function ChallengeModeToggle({
  goals,
  mode,
  onChange,
  starts,
}: {
  goals: ChallengeGoals;
  mode: ChallengeMode;
  onChange: (mode: ChallengeMode) => void;
  starts: ChallengeStarts;
}) {
  return (
    <section className="challenge-toggle" aria-label="Challenge mode">
      {(Object.keys(CHALLENGES) as ChallengeMode[]).map((challengeMode) => {
        const challenge = getChallengeConfig(challengeMode, goals[challengeMode], starts[challengeMode]);
        return (
          <button
            aria-pressed={mode === challenge.mode}
            className={mode === challenge.mode ? "challenge-option active" : "challenge-option"}
            key={challenge.mode}
            onClick={() => onChange(challenge.mode)}
            type="button"
          >
            <span>{challenge.name}</span>
            <small>{challenge.startLabel} to {challenge.finalLabel}</small>
          </button>
        );
      })}
    </section>
  );
}

function ChallengeGoalEditor({
  goals,
  onGoalChange,
  onStartChange,
  starts,
}: {
  goals: ChallengeGoals;
  onGoalChange: (mode: ChallengeMode, goal: number) => void;
  onStartChange: (mode: ChallengeMode, start: number) => void;
  starts: ChallengeStarts;
}) {
  return (
    <section className="goal-editor" aria-label="Challenge goals">
      {(Object.keys(CHALLENGES) as ChallengeMode[]).map((mode) => {
        const base = CHALLENGES[mode];
        const challenge = getChallengeConfig(mode, goals[mode], starts[mode]);
        return (
          <label className="goal-field" key={mode}>
            <span>{base.unit} challenge</span>
            <div className="goal-input-wrap">
              <small>Start</small>
              <input
                min={0.000001}
                onChange={(event) => onStartChange(mode, Number(event.currentTarget.value))}
                step="any"
                type="number"
                value={starts[mode]}
              />
              <small>{base.unit}</small>
            </div>
            <div className="goal-input-wrap">
              <small>Goal</small>
              <input
                min={starts[mode]}
                onChange={(event) => onGoalChange(mode, Number(event.currentTarget.value))}
                step="any"
                type="number"
                value={goals[mode]}
              />
              <small>{base.unit}</small>
            </div>
            <em>{base.startLabel} to {challenge.finalLabel}</em>
          </label>
        );
      })}
    </section>
  );
}

function TimeframeToggle({ timeframe, onChange }: { timeframe: TimeframeId; onChange: (timeframe: TimeframeId) => void }) {
  return (
    <section className="timeframe-toggle" aria-label="Timeframe">
      {TIMEFRAME_OPTIONS.map((option) => (
        <button
          aria-pressed={timeframe === option.id}
          className={timeframe === option.id ? "timeframe-option active" : "timeframe-option"}
          key={option.id}
          onClick={() => onChange(option.id)}
          type="button"
        >
          <span>{option.label}</span>
          <small>{option.detail}</small>
        </button>
      ))}
    </section>
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
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
  phases,
  planDays,
  sizingMode,
  challenge,
  solPrice,
}: {
  daysToRender: DayPlan[];
  checked: Set<number>;
  onToggle: (day: number, isChecked: boolean) => void;
  phases: Phase[];
  planDays: DayPlan[];
  sizingMode: SizingMode;
  challenge: ChallengeConfig;
  solPrice: number | null;
}) {
  let lastPhase = -1;

  return (
    <>
      {daysToRender.map((row) => {
        const phase = phases.find((candidate) => candidate.id === row.phase)!;
        const phaseDays = planDays.filter((day) => day.phase === row.phase);
        const doneDays = phaseDays.filter((day) => checked.has(day.day)).length;
        const includeDivider = row.phase !== lastPhase;
        lastPhase = row.phase;
        const gain = row.end - row.start;
        const pct = ((gain / row.start) * 100).toFixed(1);
        const progress = Math.min((row.end / challenge.final) * 100, 100).toFixed(1);
        const quickBuy = getSizingAmount(row.day, row.start, sizingMode, challenge);
        const quickBuyPct = ((quickBuy / row.start) * 100).toFixed(1);
        const isChecked = checked.has(row.day);
        const startUsd = formatSolUsdEquivalent(row.start, challenge, solPrice);
        const endUsd = formatSolUsdEquivalent(row.end, challenge, solPrice);
        const gainUsd = formatSolUsdEquivalent(gain, challenge, solPrice);
        const quickBuyUsd = formatSolUsdEquivalent(quickBuy, challenge, solPrice);

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
                  {formatChallengeAmount(row.start, challenge)}<span className="arrow">→</span>
                  <span className="end-sol" style={{ color: phase.color }}>{formatChallengeAmount(row.end, challenge)}</span>
                </span>
                {startUsd && endUsd ? <span className="usd-equivalent">{startUsd} → {endUsd}</span> : null}
                {row.milestone ? <Badge label={getMilestoneLabel(row.milestone, challenge)} phase={phase} /> : row.unlock ? <Badge label={`${formatChallengeSizing(quickBuy, challenge)} unlocked`} phase={phase} /> : null}
              </td>
              <td>
                <span className="daily-gain" style={{ color: phase.color }}>+{formatChallengeAmount(gain, challenge)}</span>
                <span className="pct-gain">(+{pct}%)</span>
                {gainUsd ? <span className="usd-equivalent">{gainUsd}</span> : null}
              </td>
              <td>
                <span className="mb-cell" style={{ color: phase.color }}>{formatChallengeSizing(quickBuy, challenge)}</span>
                {quickBuyUsd ? <span className="usd-equivalent">{quickBuyUsd}</span> : null}
              </td>
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

function FeeSettings() {
  return (
    <section className="fee-settings" aria-label="Fee settings">
      <div className="fee-settings-head">
        <div>
          <span className="completion-label">Fee settings</span>
          <strong>Buy preset guide</strong>
        </div>
        <span className="completion-hint">Match preset to SOL buy size before entering.</span>
      </div>
      <div className="fee-preset-grid">
        {FEE_PRESETS.map((preset) => (
          <article className="fee-preset-card" key={preset.name}>
            <div className="fee-preset-top">
              <span>{preset.name}</span>
              <strong>{preset.buySize}</strong>
            </div>
            <dl className="fee-preset-values">
              <div>
                <dt>Slippage</dt>
                <dd>{preset.slippage}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{preset.priority}</dd>
              </div>
              <div>
                <dt>Bribe</dt>
                <dd>{preset.bribe}</dd>
              </div>
              <div>
                <dt>Auto fee</dt>
                <dd>{preset.autoFee}</dd>
              </div>
              <div>
                <dt>Max fee</dt>
                <dd>{preset.maxFee}</dd>
              </div>
              <div>
                <dt>MEV</dt>
                <dd>{preset.mevMode}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function Notes({
  dailyGrowthRate,
  phases,
  planDays,
  totalDays,
  challenge,
}: {
  dailyGrowthRate: number;
  phases: Phase[];
  planDays: DayPlan[];
  totalDays: number;
  challenge: ChallengeConfig;
}) {
  const [showSizingGuide, setShowSizingGuide] = useState(false);
  const targetBuyAmount = challenge.targetBuyMultiplier * challenge.start;
  const capAmount = challenge.capMultiplier * challenge.start;
  const targetBuyDay = planDays.find((day) => getSizingAmount(day.day, day.start, "conservative", challenge) >= targetBuyAmount);
  const capDay = planDays.find((day) => getSizingAmount(day.day, day.start, "conservative", challenge) >= capAmount);
  const goalDay = planDays[planDays.length - 1];
  const phaseOne = phases[0];
  const phaseOneDays = planDays.filter((day) => day.phase === phaseOne.id);
  const phaseOneStart = phaseOneDays[0];
  const phaseOneEnd = phaseOneDays[phaseOneDays.length - 1];
  const phaseOneMinBuy = getSizingAmount(phaseOneStart.day, phaseOneStart.start, "conservative", challenge);
  const phaseOneMaxBuy = getSizingAmount(phaseOneEnd.day, phaseOneEnd.start, "conservative", challenge);
  const phaseFive = phases.find((phase) => phase.id === 5);
  const phaseFiveStartDay = phaseFive ? planDays.find((day) => day.phase === phaseFive.id)?.day : null;
  const bufferMin = Math.max(1, Math.ceil(totalDays * 0.2));
  const bufferMax = Math.max(bufferMin + 1, Math.ceil(totalDays * 0.35));
  const phaseRates = phases.map((phase) => {
    const phaseDays = planDays.filter((day) => day.phase === phase.id);
    const first = phaseDays[0];
    const last = phaseDays[phaseDays.length - 1];
    const avgRate = phaseDays.reduce((sum, day) => sum + ((day.end - day.start) / day.start), 0) / phaseDays.length;
    return { phase, first, last, avgRate };
  });

  return (
    <section className="notes-section">
      <div className="note-card">
        <div className="note-title">Daily % by phase</div>
        <div className="note-body">
          {phaseRates.map(({ phase, first, last, avgRate }) => (
            <Fragment key={phase.id}>
              Phase {phase.id} ({formatChallengeAmount(first.start, challenge)}-{formatChallengeAmount(last.end, challenge)}): <strong>~{(avgRate * 100).toFixed(1)}%</strong><br />
            </Fragment>
          ))}
        </div>
      </div>
      <div className="note-card">
        <div className="note-title">3 key milestones</div>
        <div className="note-body">
          {targetBuyDay ? (
            <>
              <strong>Day {targetBuyDay.day}</strong> - {formatChallengeSizing(targetBuyAmount, challenge)} max buy unlocked<br />
              Portfolio after target: ~{formatChallengeAmount(targetBuyDay.end, challenge)}<br /><br />
            </>
          ) : null}
          {capDay ? (
            <>
              <strong>Day {capDay.day}</strong> - {formatChallengeSizing(capAmount, challenge)} cap reached<br />
              Portfolio after target: ~{formatChallengeAmount(capDay.end, challenge)}<br /><br />
            </>
          ) : null}
          <strong>Day {goalDay.day}</strong> - {challenge.finalLabel} reached
        </div>
      </div>
      <div className="note-card">
        <div className="note-title">Phase 1 is the grind</div>
        <div className="note-body">
          Days {phaseOneStart.day}-{phaseOneEnd.day} at {formatChallengeSizing(phaseOneMinBuy, challenge)}-{formatChallengeSizing(phaseOneMaxBuy, challenge)} max buys are the foundation for this {totalDays}-day plan.<br />
          The full plan needs about <strong>{(dailyGrowthRate * 100).toFixed(1)}%</strong> per day, so early discipline is <strong>the most important</strong>.<br />
          Every habit you build here - hold discipline, no tilt, cut fast - <strong>carries to every phase after</strong>.
        </div>
      </div>
      <div className="note-card">
        <div className="note-title">Reality check</div>
        <div className="note-body">
          This {totalDays}-day version is <strong>zero bad days, best-case markets</strong>.<br />
          Real timeline: add <strong>{bufferMin}-{bufferMax} days</strong> for off sessions.<br />
          {phaseFiveStartDay ? `At Phase 5+ around Day ${phaseFiveStartDay},` : "At Phase 5+,"} a single tilt day can cost you a week. The stop-loss rule becomes non-negotiable.
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
        <div className="note-title">Pullupso scanning advice</div>
        <div className="note-body">
          Source: <a href="https://x.com/pullupso" target="_blank" rel="noopener noreferrer">@pullupso on X</a>
          <div className="pullupso-quote">
            <p><strong>Watch for insta migrates:</strong> buy first, then look at the chart, then sell if it is bad.</p>
            <p><strong>Scan new pairs:</strong> wait for anything decent instead of forcing trades.</p>
            <p><strong>Hide bad almost-graduated tokens:</strong> remove weak ABT-to-graduate coins so the decent setups stand out.</p>
            <p><strong>Look for difference:</strong> wait for something different than the current stock coins and forced meta. You want decent force behind it, or a good meme that is actually showing up.</p>
            <p><strong>Keep it simple:</strong> if it looks good, buy it. If the deeper check says it is bad, sell it.</p>
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
