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
  isPlanPresetId,
  isTimeframeId,
  LS_KEY,
  sanitizeChallengeFinal,
  sanitizeChallengeStart,
  type ChallengeConfig,
  type ChallengeMode,
  type DayPlan,
  type Phase,
  type PlanPresetId,
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
const PLAN_PRESET_KEY = "sol_speedrun_plan_preset";
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

type SellFeePreset = Omit<FeePreset, "buySize">;

const SELL_FEE_PRESETS: SellFeePreset[] = [
  {
    name: "Preset 1",
    slippage: "100%",
    priority: "0.0001",
    bribe: "0.0001",
    autoFee: "Off",
    maxFee: "0.01",
    mevMode: "Off",
  },
  {
    name: "Preset 2",
    slippage: "100%",
    priority: "0.001",
    bribe: "0.004",
    autoFee: "Off",
    maxFee: "0.1",
    mevMode: "Off",
  },
  {
    name: "Preset 3",
    slippage: "100%",
    priority: "0.0006",
    bribe: "0.004",
    autoFee: "Off",
    maxFee: "0.1",
    mevMode: "Off",
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

type TradeJournalEntry = {
  id: string;
  createdAt: number;
  day: number;
  ticker: string;
  result: "win" | "loss" | "breakeven" | "note";
  pnl: string;
  notes: string;
};

type ActivePlanSnapshot = {
  challengeMode: ChallengeMode;
  challengeStartDate: string;
  goals: ChallengeGoals;
  notes: string;
  planPreset: PlanPresetId;
  sizingMode: SizingMode;
  startedAt: number;
  starts: ChallengeStarts;
  timeframe: TimeframeId;
  tradeJournal: TradeJournalEntry[];
};

type PlanHistoryItem = {
  id: string;
  activePlan: ActivePlanSnapshot;
  archivedAt: number;
  reason: "completed" | "restarted";
  progress: ModeProgressSnapshot;
};

export type ProgressSnapshot = Record<ChallengeMode, ModeProgressSnapshot> & {
  activePlan: ActivePlanSnapshot | null;
  planHistory: PlanHistoryItem[];
};

type LegacyProgressSnapshot = {
  activePlan?: Partial<ActivePlanSnapshot> | null;
  checkedDays?: number[];
  completions?: number;
  planHistory?: Partial<PlanHistoryItem>[];
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
    activePlan: null,
    planHistory: [],
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
    activePlan: normalizeActivePlan(progress?.activePlan),
    planHistory: normalizePlanHistory(progress?.planHistory),
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

function normalizeActivePlan(plan?: Partial<ActivePlanSnapshot> | null): ActivePlanSnapshot | null {
  if (!plan) return null;
  let starts = normalizeChallengeStarts(plan.starts);
  let goals = normalizeChallengeGoals(plan.goals, starts);
  const planChallengeMode = typeof plan.challengeMode === "string" && isChallengeMode(plan.challengeMode) ? plan.challengeMode : "sol";
  const planTimeframe = typeof plan.timeframe === "string" && isTimeframeId(plan.timeframe) ? plan.timeframe : "default";
  const sizingMode = plan.sizingMode === "pullupso" ? "pullupso" : "conservative";
  let planPreset: PlanPresetId = plan.planPreset === "og" ? "og" : "flexible";
  if (planPreset === "og" && (planChallengeMode !== "sol" || planTimeframe !== "default" || sizingMode !== "conservative")) {
    planPreset = "flexible";
  }
  if (planPreset === "og" && planChallengeMode === "sol") {
    const fixed = getPlanChallengeInputs("og", "sol", starts, goals);
    starts = normalizeChallengeStarts(fixed.starts);
    goals = normalizeChallengeGoals(fixed.goals, starts);
  }
  return {
    challengeMode: planChallengeMode,
    challengeStartDate: typeof plan.challengeStartDate === "string" && isDateInputValue(plan.challengeStartDate) ? plan.challengeStartDate : "",
    goals,
    notes: typeof plan.notes === "string" ? plan.notes.slice(0, 5000) : "",
    planPreset,
    sizingMode,
    startedAt: typeof plan.startedAt === "number" && Number.isFinite(plan.startedAt) ? plan.startedAt : Date.now(),
    starts,
    timeframe: planTimeframe,
    tradeJournal: normalizeTradeJournal(plan.tradeJournal),
  };
}

function normalizeTradeJournal(entries?: Partial<TradeJournalEntry>[]) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry, index) => {
      const day = typeof entry.day === "number" && Number.isInteger(entry.day) && entry.day >= 1 && entry.day <= 75 ? entry.day : 1;
      return {
        id: typeof entry.id === "string" && entry.id ? entry.id : `journal-${Date.now()}-${index}`,
        createdAt: typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
        day,
        ticker: typeof entry.ticker === "string" ? entry.ticker.slice(0, 32) : "",
        result: entry.result === "win" || entry.result === "loss" || entry.result === "breakeven" || entry.result === "note" ? entry.result : "note",
        pnl: typeof entry.pnl === "string" ? entry.pnl.slice(0, 32) : "",
        notes: typeof entry.notes === "string" ? entry.notes.slice(0, 1000) : "",
      };
    })
    .slice(0, 250);
}

function normalizePlanHistory(history?: Partial<PlanHistoryItem>[]) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item, index) => {
      const activePlan = normalizeActivePlan(item.activePlan);
      if (!activePlan) return null;
      return {
        id: typeof item.id === "string" && item.id ? item.id : `history-${Date.now()}-${index}`,
        activePlan,
        archivedAt: typeof item.archivedAt === "number" && Number.isFinite(item.archivedAt) ? item.archivedAt : Date.now(),
        reason: item.reason === "completed" ? "completed" : "restarted",
        progress: normalizeModeProgress(item.progress),
      };
    })
    .filter((item): item is PlanHistoryItem => item !== null)
    .slice(0, 50);
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

function formatShortDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
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

function normalizeChallengeStarts(starts?: Partial<ChallengeStarts>): ChallengeStarts {
  return {
    sol: sanitizeChallengeStart(starts?.sol ?? CHALLENGES.sol.defaultStart, CHALLENGES.sol),
    usdc: sanitizeChallengeStart(starts?.usdc ?? CHALLENGES.usdc.defaultStart, CHALLENGES.usdc),
  };
}

function normalizeChallengeGoals(goals: Partial<ChallengeGoals> | undefined, starts: ChallengeStarts): ChallengeGoals {
  return {
    sol: sanitizeChallengeFinal(goals?.sol ?? CHALLENGES.sol.defaultFinal, { ...CHALLENGES.sol, start: starts.sol }),
    usdc: sanitizeChallengeFinal(goals?.usdc ?? CHALLENGES.usdc.defaultFinal, { ...CHALLENGES.usdc, start: starts.usdc }),
  };
}

/** OG + SOL always uses the canonical 1 → 5k track; custom start/goal only apply in Custom sprint ("flexible"). */
function getPlanChallengeInputs(
  planPreset: PlanPresetId,
  activeChallengeMode: ChallengeMode,
  starts: ChallengeStarts,
  goals: ChallengeGoals,
): { starts: ChallengeStarts; goals: ChallengeGoals } {
  if (planPreset === "og" && activeChallengeMode === "sol") {
    return {
      starts: { ...starts, sol: CHALLENGES.sol.defaultStart },
      goals: { ...goals, sol: CHALLENGES.sol.defaultFinal },
    };
  }
  return { starts, goals };
}

function loadTimeframe(): TimeframeId {
  try {
    const saved = localStorage.getItem(TIMEFRAME_KEY);
    return isTimeframeId(saved) ? saved : "default";
  } catch {
    return "default";
  }
}

function loadPlanPreset(): PlanPresetId {
  try {
    const saved = localStorage.getItem(PLAN_PRESET_KEY);
    return isPlanPresetId(saved) ? saved : "flexible";
  } catch {
    return "flexible";
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

function formatGuideUnit(value: number, challenge: ChallengeConfig, plus = false) {
  if (challenge.unit === "USDC") {
    return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value * challenge.start)}${plus ? "+" : ""}`;
  }

  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/^0\./, ".")}${plus ? "+" : ""} SOL`;
}

function formatGuideRange(min: number, max: number, challenge: ChallengeConfig, plus = false) {
  if (challenge.unit === "USDC") {
    return `${formatGuideUnit(min, challenge)}-${formatGuideUnit(max, challenge, plus)}`;
  }

  const minLabel = min.toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/^0\./, ".");
  const maxLabel = max.toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/^0\./, ".");
  return `${minLabel}-${maxLabel}${plus ? "+" : ""} SOL`;
}

function createActivePlanSnapshot({
  challengeMode,
  challengeStartDate,
  challengeGoals,
  challengeStarts,
  notes = "",
  planPreset = "flexible",
  sizingMode,
  timeframe,
  startedAt = Date.now(),
  tradeJournal = [],
}: {
  challengeMode: ChallengeMode;
  challengeStartDate: string;
  challengeGoals: ChallengeGoals;
  challengeStarts: ChallengeStarts;
  notes?: string;
  planPreset?: PlanPresetId;
  sizingMode: SizingMode;
  timeframe: TimeframeId;
  startedAt?: number;
  tradeJournal?: TradeJournalEntry[];
}): ActivePlanSnapshot {
  const starts = normalizeChallengeStarts(challengeStarts);
  let coercedPreset: PlanPresetId = planPreset === "og" ? "og" : "flexible";
  if (coercedPreset === "og" && (challengeMode !== "sol" || timeframe !== "default" || sizingMode !== "conservative")) {
    coercedPreset = "flexible";
  }
  return {
    challengeMode,
    challengeStartDate: isDateInputValue(challengeStartDate) ? challengeStartDate : "",
    goals: normalizeChallengeGoals(challengeGoals, starts),
    notes: notes.slice(0, 5000),
    planPreset: coercedPreset,
    sizingMode,
    startedAt,
    starts,
    timeframe,
    tradeJournal: normalizeTradeJournal(tradeJournal),
  };
}

function isSameActivePlan(left: ActivePlanSnapshot | null, right: ActivePlanSnapshot | null) {
  if (!left || !right) return left === right;
  return (
    left.challengeMode === right.challengeMode &&
    left.challengeStartDate === right.challengeStartDate &&
    left.notes === right.notes &&
    left.planPreset === right.planPreset &&
    left.sizingMode === right.sizingMode &&
    left.timeframe === right.timeframe &&
    left.starts.sol === right.starts.sol &&
    left.starts.usdc === right.starts.usdc &&
    left.goals.sol === right.goals.sol &&
    left.goals.usdc === right.goals.usdc &&
    JSON.stringify(left.tradeJournal) === JSON.stringify(right.tradeJournal)
  );
}

function archivePlan(history: PlanHistoryItem[], activePlan: ActivePlanSnapshot, progress: ModeProgressSnapshot, reason: PlanHistoryItem["reason"]) {
  return [
    {
      id: `plan-${Date.now()}`,
      activePlan,
      archivedAt: Date.now(),
      reason,
      progress,
    },
    ...history,
  ].slice(0, 50);
}

export function getLocalCheckedDays() {
  return loadLocalProgressByMode().sol.checkedDays;
}

export function getLocalProgress(): ProgressSnapshot {
  return loadLocalProgressByMode();
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ConfirmAction = "reset-all" | "reset-completions" | "restart-plan" | null;

export default function App({ auth, remoteProgress, remoteLoading = false, onRemoteChange }: AppProps) {
  const [localProgress, setLocalProgress] = useState(() => loadLocalProgressByMode());
  const [currentPhase, setCurrentPhase] = useState(0);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>(() => loadChallengeMode());
  const [challengeStarts, setChallengeStarts] = useState<ChallengeStarts>(() => loadChallengeStarts());
  const [challengeGoals, setChallengeGoals] = useState<ChallengeGoals>(() => loadChallengeGoals());
  const [sizingMode, setSizingMode] = useState<SizingMode>(() => loadSizingMode());
  const [timeframe, setTimeframe] = useState<TimeframeId>(() => loadTimeframe());
  const [planPreset, setPlanPreset] = useState<PlanPresetId>(() => loadPlanPreset());
  const [challengeStartDate, setChallengeStartDate] = useState(() => loadLocalStartDate());
  const solPrice = useSolPrice();
  const planChallengeInputs = useMemo(
    () => getPlanChallengeInputs(planPreset, challengeMode, challengeStarts, challengeGoals),
    [challengeGoals, challengeMode, challengeStarts, planPreset],
  );
  const challenge = useMemo(
    () =>
      getChallengeConfig(
        challengeMode,
        planChallengeInputs.goals[challengeMode],
        planChallengeInputs.starts[challengeMode],
      ),
    [challengeMode, planChallengeInputs],
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
  const activePlan = localProgress.activePlan;
  const draftPlan = useMemo(
    () => createActivePlanSnapshot({
      challengeMode,
      challengeStartDate,
      challengeGoals: planChallengeInputs.goals,
      challengeStarts: planChallengeInputs.starts,
      notes: activePlan?.notes,
      planPreset,
      sizingMode,
      timeframe,
      startedAt: activePlan?.startedAt,
      tradeJournal: activePlan?.tradeJournal,
    }),
    [activePlan?.notes, activePlan?.startedAt, activePlan?.tradeJournal, planChallengeInputs, challengeMode, challengeStartDate, planPreset, sizingMode, timeframe],
  );
  const hasPlanChanges = !isSameActivePlan(activePlan, draftPlan);
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
      if (nextRemoteProgress.activePlan) {
        const nextPlan = nextRemoteProgress.activePlan;
        setChallengeMode(nextPlan.challengeMode);
        setChallengeStarts(nextPlan.starts);
        setChallengeGoals(nextPlan.goals);
        setSizingMode(nextPlan.sizingMode);
        setTimeframe(nextPlan.timeframe);
        setChallengeStartDate(nextPlan.challengeStartDate);
        setPlanPreset(nextPlan.planPreset);
      }
    }
  }, [remoteProgress]);

  useEffect(() => {
    if (planPreset !== "og") return;
    if (challengeMode !== "sol" || timeframe !== "default" || sizingMode !== "conservative") {
      setPlanPreset("flexible");
    }
  }, [challengeMode, planPreset, sizingMode, timeframe]);

  useEffect(() => {
    try {
      localStorage.setItem(PLAN_PRESET_KEY, planPreset);
    } catch {
      // Preset still applies for this session if local storage is blocked.
    }
  }, [planPreset]);

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

  const persistSnapshot = (nextProgress: ProgressSnapshot) => {
    setLocalProgress(nextProgress);
    for (const mode of CHALLENGE_MODES) {
      saveLocalModeProgress(mode, nextProgress[mode]);
    }
    if (!onRemoteChange || !auth?.isSignedIn) return;
    setSaveStatus("saving");
    void Promise.resolve(onRemoteChange(nextProgress))
      .then(() => {
        setSaveStatus("saved");
        window.setTimeout(() => setSaveStatus("idle"), 1800);
      })
      .catch((error: unknown) => {
        console.error(error);
        setSaveStatus("error");
      });
  };

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
    persistSnapshot(nextProgress);
  };

  const toggleDay = (day: number, isChecked: boolean) => {
    const next = new Set(checked);
    if (isChecked) next.add(day);
    else next.delete(day);
    persist(next);
  };

  const resetAll = () => {
    persist(new Set());
    setConfirmAction(null);
  };
  const logCompletion = () => {
    if (!isChallengeComplete || completions >= COMPLETION_GOAL) return;
    const archivedPlan = activePlan ?? draftPlan;
    persistSnapshot({
      ...localProgress,
      activePlan: {
        ...draftPlan,
        startedAt: Date.now(),
      },
      planHistory: archivePlan(localProgress.planHistory, archivedPlan, {
        checkedDays: checkedList,
        completions,
      }, "completed"),
      [challengeMode]: {
        checkedDays: [],
        completions: clampCompletions(completions + 1),
      },
    });
  };
  const adjustCompletions = (delta: number) => {
    persist(checked, completions + delta);
  };
  const resetCompletions = () => {
    persist(checked, 0);
    setConfirmAction(null);
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
  const saveCurrentPlan = () => {
    const inputs = getPlanChallengeInputs(planPreset, challengeMode, challengeStarts, challengeGoals);
    persistSnapshot({
      ...localProgress,
      activePlan: createActivePlanSnapshot({
        challengeMode,
        challengeStartDate,
        challengeGoals: inputs.goals,
        challengeStarts: inputs.starts,
        notes: activePlan?.notes,
        planPreset,
        sizingMode,
        timeframe,
        startedAt: activePlan?.startedAt,
        tradeJournal: activePlan?.tradeJournal,
      }),
    });
  };
  const updatePlanNotes = (notes: string) => {
    persistSnapshot({
      ...localProgress,
      activePlan: {
        ...(activePlan ?? draftPlan),
        notes: notes.slice(0, 5000),
      },
    });
  };
  const addTradeJournalEntry = (entry: Omit<TradeJournalEntry, "id" | "createdAt">) => {
    const basePlan = activePlan ?? draftPlan;
    persistSnapshot({
      ...localProgress,
      activePlan: {
        ...basePlan,
        tradeJournal: normalizeTradeJournal([
          {
            ...entry,
            id: `trade-${Date.now()}`,
            createdAt: Date.now(),
          },
          ...basePlan.tradeJournal,
        ]),
      },
    });
  };
  const removeTradeJournalEntry = (entryId: string) => {
    if (!activePlan) return;
    persistSnapshot({
      ...localProgress,
      activePlan: {
        ...activePlan,
        tradeJournal: activePlan.tradeJournal.filter((entry) => entry.id !== entryId),
      },
    });
  };
  const exportBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      progress: localProgress,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sol-speedrun-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const restartPlan = () => {
    const archivedPlan = activePlan ?? draftPlan;
    const shouldArchive = activePlan || totalDone > 0 || completions > 0;
    const inputs = getPlanChallengeInputs(planPreset, challengeMode, challengeStarts, challengeGoals);
    persistSnapshot({
      ...localProgress,
      activePlan: createActivePlanSnapshot({
        challengeMode,
        challengeStartDate,
        challengeGoals: inputs.goals,
        challengeStarts: inputs.starts,
        notes: activePlan?.notes,
        planPreset,
        sizingMode,
        timeframe,
        tradeJournal: activePlan?.tradeJournal,
      }),
      planHistory: shouldArchive
        ? archivePlan(localProgress.planHistory, archivedPlan, {
            checkedDays: checkedList,
            completions,
          }, "restarted")
        : localProgress.planHistory,
      [challengeMode]: {
        checkedDays: [],
        completions: 0,
      },
    });
    setConfirmAction(null);
  };
  const requestResetAll = () => {
    if (confirmAction === "reset-all") resetAll();
    else setConfirmAction("reset-all");
  };
  const requestResetCompletions = () => {
    if (confirmAction === "reset-completions") resetCompletions();
    else setConfirmAction("reset-completions");
  };
  const requestRestartPlan = () => {
    if (confirmAction === "restart-plan") restartPlan();
    else setConfirmAction("restart-plan");
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
            <div className="rules-links">
              <a className="rules-link" href="https://trading-rules.vercel.app/" rel="noopener noreferrer" target="_blank">
                Trading rules
              </a>
              <a className="rules-link" href="https://docs.google.com/document/d/1-1u3RloZfi9kPz6p750DruFAKaHRg5SfpFCgLa8byO4/edit?tab=t.0" rel="noopener noreferrer" target="_blank">
                Boom Bust Book
              </a>
            </div>
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
        <PlanPresetToggle
          onChange={(next) => {
            if (next === "og") {
              setPlanPreset("og");
              setChallengeMode("sol");
              setTimeframe("default");
              setSizingMode("conservative");
            } else {
              setPlanPreset("flexible");
            }
          }}
          preset={planPreset}
        />
        <ChallengeModeToggle goals={challengeGoals} mode={challengeMode} onChange={setChallengeMode} planPreset={planPreset} starts={challengeStarts} />
        <ChallengeGoalEditor goals={challengeGoals} onGoalChange={updateChallengeGoal} onStartChange={updateChallengeStart} planPreset={planPreset} starts={challengeStarts} />
        <TimeframeToggle disabled={planPreset === "og"} timeframe={timeframe} onChange={setTimeframe} />
        <SizingToggle disabled={planPreset === "og"} mode={sizingMode} onChange={setSizingMode} />
        {planPreset === "og" ? <p className="og-lock-hint">OG locks the original 73-day curve and conservative max-buy ladder (4.5 SOL cap). Switch to Custom sprint to change timeframe or Pullupso sizing.</p> : null}
        <PlanControls
          activePlan={activePlan}
          challenge={challenge}
          hasPlanChanges={hasPlanChanges}
          hasProgress={totalDone > 0 || completions > 0}
          isRestartConfirming={confirmAction === "restart-plan"}
          onExportBackup={exportBackup}
          onRestartPlan={requestRestartPlan}
          onSavePlan={saveCurrentPlan}
          onStartPlan={restartPlan}
        />
      </header>

      <section className="tracker">
        <div className="tracker-top">
          <div>
            <div className="tracker-title">Overall progress</div>
            <div className="tracker-count">{totalDone} / {totalDays}</div>
            <div className="tracker-sub">{overallPct}% of roadmap complete</div>
          </div>
          <button className={confirmAction === "reset-all" ? "reset-btn confirming" : "reset-btn"} onClick={requestResetAll} type="button">
            {confirmAction === "reset-all" ? "confirm reset" : "reset all"}
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
          onResetCompletions={requestResetCompletions}
          resetConfirming={confirmAction === "reset-completions"}
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
        <PlanNotes notes={activePlan?.notes ?? ""} onChange={updatePlanNotes} />
        <TradeJournal entries={activePlan?.tradeJournal ?? []} onAdd={addTradeJournalEntry} onRemove={removeTradeJournalEntry} totalDays={totalDays} />
        <PlanHistory history={localProgress.planHistory} />
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
        <SyncStatus auth={auth} checkedDays={checkedList.length} completions={completions} saveStatus={saveStatus} />
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
  resetConfirming,
  totalDays,
  challenge,
}: {
  completions: number;
  isComplete: boolean;
  onAdjustCompletions: (delta: number) => void;
  onLogCompletion: () => void;
  onResetCompletions: () => void;
  resetConfirming: boolean;
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
          <button className={resetConfirming ? "completion-reset-btn confirming" : "completion-reset-btn"} onClick={onResetCompletions} type="button">{resetConfirming ? "confirm reset" : "reset"}</button>
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
  planPreset,
  starts,
}: {
  goals: ChallengeGoals;
  mode: ChallengeMode;
  onChange: (mode: ChallengeMode) => void;
  planPreset: PlanPresetId;
  starts: ChallengeStarts;
}) {
  return (
    <section className="challenge-toggle" aria-label="Challenge mode">
      {(Object.keys(CHALLENGES) as ChallengeMode[]).map((challengeMode) => {
        const inputs = getPlanChallengeInputs(planPreset, challengeMode, starts, goals);
        const challenge = getChallengeConfig(challengeMode, inputs.goals[challengeMode], inputs.starts[challengeMode]);
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
  planPreset,
  starts,
}: {
  goals: ChallengeGoals;
  onGoalChange: (mode: ChallengeMode, goal: number) => void;
  onStartChange: (mode: ChallengeMode, start: number) => void;
  planPreset: PlanPresetId;
  starts: ChallengeStarts;
}) {
  return (
    <section className="goal-editor" aria-label="Challenge goals">
      {(Object.keys(CHALLENGES) as ChallengeMode[]).map((mode) => {
        const base = CHALLENGES[mode];
        const solLocked = planPreset === "og" && mode === "sol";
        const inputs = getPlanChallengeInputs(planPreset, mode, starts, goals);
        const rowChallenge = getChallengeConfig(mode, inputs.goals[mode], inputs.starts[mode]);
        return (
          <label className={`goal-field${solLocked ? " goal-field-locked" : ""}`} key={mode}>
            <span>{base.unit} challenge</span>
            <div className="goal-input-wrap">
              <small>Start</small>
              <input
                disabled={solLocked}
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
                disabled={solLocked}
                min={starts[mode]}
                onChange={(event) => onGoalChange(mode, Number(event.currentTarget.value))}
                step="any"
                type="number"
                value={goals[mode]}
              />
              <small>{base.unit}</small>
            </div>
            <em>{rowChallenge.startLabel} to {rowChallenge.finalLabel}</em>
            {solLocked ? <span className="og-lock-hint">Saved for Custom sprint. OG always uses 1 SOL → 5,000 SOL.</span> : null}
          </label>
        );
      })}
    </section>
  );
}

function PlanPresetToggle({ preset, onChange }: { preset: PlanPresetId; onChange: (preset: PlanPresetId) => void }) {
  return (
    <section className="plan-preset-toggle" aria-label="Plan track">
      <button
        aria-pressed={preset === "og"}
        className={preset === "og" ? "preset-option active" : "preset-option"}
        onClick={() => onChange("og")}
        type="button"
      >
        <span>OG · 1 SOL to 5k</span>
        <small>73-day curve · conservative ladder · 4.5 SOL max buy cap</small>
      </button>
      <button
        aria-pressed={preset === "flexible"}
        className={preset === "flexible" ? "preset-option active" : "preset-option"}
        onClick={() => onChange("flexible")}
        type="button"
      >
        <span>Custom sprint</span>
        <small>Pick timeframe and sizing</small>
      </button>
    </section>
  );
}

function TimeframeToggle({ disabled, timeframe, onChange }: { disabled?: boolean; timeframe: TimeframeId; onChange: (timeframe: TimeframeId) => void }) {
  return (
    <section aria-disabled={disabled ?? false} className={disabled ? "timeframe-toggle disabled" : "timeframe-toggle"} aria-label="Timeframe">
      {TIMEFRAME_OPTIONS.map((option) => (
        <button
          aria-pressed={timeframe === option.id}
          className={timeframe === option.id ? "timeframe-option active" : "timeframe-option"}
          disabled={disabled}
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

function ShikamaruOneSolTakeProfitStrategyCard() {
  return (
    <div className="note-card pullupso-card">
      <div className="note-title">Shikamaru · 1 SOL and take profit strategy</div>
      <div className="note-body">
        <div className="pullupso-quote">
          <p>This strategy is called 1 SOL and Take Profit.</p>
          <p>
            The idea is simple: there are enough coins launched in any given month on Pump.fun to profit at least $1,000,000 or 10,000 SOL from a pure mathematical
            standpoint. Because of that, the goal is not to chase everything, overtrade, or force scalps on every new pair. The goal is to identify narratives where
            there is a high probability that the coin will let you profit at some point in the future, assuming the coin and chart continue to respect your thesis at
            a certain market cap price point.
          </p>
          <p>
            My thesis is that no matter how bad market conditions are, there are still enough coins reaching certain market caps and volume levels to profit at
            least 100 to 5,000 SOL per day. That is possible without having to scalp new pairs if I do not want to, although that is still an option. It is also
            part of my thesis that I can get there while keeping my max bid size at no more than 1 SOL on every buy.
          </p>
          <p>
            This mainly only works when you are only buying A+ narratives and minimizing your losses — so you need to win more than you lose to make up for the
            losses.
          </p>
          <p>This is where the Shikamaru part comes in.</p>
          <p>
            Shikamaru would not trade memecoins with chaos, emotion, or random conviction. He would trade with minimal effort, maximum efficiency, and strict logic. He
            would not marry bags. He would not force entries. He would not waste energy trying to predict every candle. He would only take trades where the setup is
            clean, the narrative is clear, the thesis makes sense, and the target is already defined before entry.
          </p>
          <p>
            <strong>The process is:</strong>
          </p>
          <p>Identify the narrative.</p>
          <p>Build the thesis on the coin.</p>
          <p>Choose the market cap or price level where the thesis should be rewarded.</p>
          <p>Enter with a max bid size of 1 SOL or less.</p>
          <p>Set the take profit in advance.</p>
          <p>Wait.</p>
          <p>
            If the take profit hits in 10 minutes, that is fine. If it hits in a week, that is also fine. The point is not to overmanage the trade. The point is to
            let narratives and price expansion do the work once the position is placed.
          </p>
          <p>
            This strategy assumes that enough coins and narratives eventually reach the price they deserve. Because of that, the edge is not in reacting emotionally.
            The edge is in selecting the right narratives, getting positioned early enough, sizing safely, and letting time and volume work in your favor.
          </p>
          <p>
            This is not a scalp-only strategy, even though scalping remains an option. This is a 1 SOL max bid, thesis-based, set-take-profit system built around
            patience, repetition, and numbers. N equals coins. N equals narratives. The more quality thesis-driven positions placed across strong narratives, the
            higher the probability that enough of them will reach target and compound into serious size.
          </p>
          <p>The goal is not to be hyperactive. The goal is to be efficient.</p>
          <p>That is the Shikamaru style.</p>
        </div>
      </div>
    </div>
  );
}

function ClukzPullupsoSizingAdvice() {
  return (
    <div className="note-card pullupso-card">
      <div className="note-title">Clukz · patience, edge &amp; sizing discipline</div>
      <div className="note-body">
        Source:{" "}
        <a href="https://x.com/clukz/status/2034755462818902160" rel="noopener noreferrer" target="_blank">
          @clukz on X
        </a>
        <div className="pullupso-quote">
          <p>Sit on your hands and maximize patience until 100k+ narratives come out that you can bid early.</p>
          <p>You are NOT better than cented.</p>
          <p>You can NOT gamble on slop.</p>
          <p>Volume is NOT good and ceilings are LOW.</p>
          <p>You do NOT have the entire chain tracking your wallet.</p>
          <p>You are NOT streaming to 500+ viewers.</p>
          <p>
            Use your brain, if you don&apos;t have the skills, stop trying to compete with the relentless new pair flippers, experienced deployers, and splitnow
            drillers. Find your own edge.
          </p>
          <p>
            The market sucks and sentiment is at an all-time low. Yet still, there are at least 3-5 decent coins that you can reasonably catch every day. Even
            while being an unknown trader.
          </p>
          <p>
            Again, it&apos;s all about PATIENCE. Patience patience patience patience patience patience patience patience patience patience
          </p>
          <p>
            Preserve your capital until the opportunities fall into your lap. It takes immense mental strength but that&apos;s what you need to surpass the 95% of
            unprofitable traders.
          </p>
          <p>
            Fuck your gambling addictions and fuck the &quot;never stop clicking&quot; mindset. Stop being stubborn and adjust your style according to the
            current conditions.
          </p>
        </div>
      </div>
    </div>
  );
}

function SizingToggle({ disabled, mode, onChange }: { disabled?: boolean; mode: SizingMode; onChange: (mode: SizingMode) => void }) {
  return (
    <section aria-disabled={disabled ?? false} className={disabled ? "sizing-toggle disabled" : "sizing-toggle"} aria-label="Sizing mode">
      <button
        aria-pressed={mode === "conservative"}
        className={mode === "conservative" ? "sizing-option active" : "sizing-option"}
        disabled={disabled}
        onClick={() => onChange("conservative")}
        type="button"
      >
        <span>Conservative sizing</span>
        <small>Current beginner max-buy ladder</small>
      </button>
      <button
        aria-pressed={mode === "pullupso"}
        className={mode === "pullupso" ? "sizing-option active" : "sizing-option"}
        disabled={disabled}
        onClick={() => onChange("pullupso")}
        type="button"
      >
        <span>Pullupso sizing</span>
        <small>Faster snowball, capped as port grows</small>
      </button>
    </section>
  );
}

function PlanControls({
  activePlan,
  challenge,
  hasPlanChanges,
  hasProgress,
  isRestartConfirming,
  onExportBackup,
  onRestartPlan,
  onSavePlan,
  onStartPlan,
}: {
  activePlan: ActivePlanSnapshot | null;
  challenge: ChallengeConfig;
  hasPlanChanges: boolean;
  hasProgress: boolean;
  isRestartConfirming: boolean;
  onExportBackup: () => void;
  onRestartPlan: () => void;
  onSavePlan: () => void;
  onStartPlan: () => void;
}) {
  const planStatus = activePlan
    ? hasPlanChanges
      ? "Current inputs differ from your saved active plan."
      : `Active plan saved for ${challenge.startLabel} to ${challenge.finalLabel}.`
    : "No active plan saved yet. Save one before tracking this run.";

  return (
    <section className="plan-controls" aria-label="Active plan">
      <div>
        <span className="completion-label">Active plan</span>
        <strong>{activePlan ? "Plan saved" : "Ready to start"}</strong>
        <p>{planStatus}</p>
      </div>
      <div className="plan-actions">
        <button className="plan-btn primary" disabled={activePlan !== null && !hasPlanChanges} onClick={activePlan ? onSavePlan : onStartPlan} type="button">
          {activePlan ? "Update saved plan" : "Start plan"}
        </button>
        <button className="plan-btn secondary" disabled={!activePlan && !hasProgress} onClick={onRestartPlan} type="button">
          {isRestartConfirming ? "Confirm restart" : "Restart from day 1"}
        </button>
        <button className="plan-btn secondary" onClick={onExportBackup} type="button">
          Export backup
        </button>
      </div>
    </section>
  );
}

function PlanNotes({ notes, onChange }: { notes: string; onChange: (notes: string) => void }) {
  return (
    <section className="plan-panel" aria-label="Plan notes">
      <div className="plan-panel-head">
        <div>
          <span className="completion-label">Plan notes</span>
          <strong>Run context</strong>
        </div>
        <span className="completion-hint">Saved with the active plan and archived with history.</span>
      </div>
      <textarea
        className="plan-notes-input"
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Why this plan, what to focus on, mistakes to avoid..."
        value={notes}
      />
    </section>
  );
}

function TradeJournal({
  entries,
  onAdd,
  onRemove,
  totalDays,
}: {
  entries: TradeJournalEntry[];
  onAdd: (entry: Omit<TradeJournalEntry, "id" | "createdAt">) => void;
  onRemove: (entryId: string) => void;
  totalDays: number;
}) {
  const [day, setDay] = useState(1);
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<TradeJournalEntry["result"]>("note");
  const [pnl, setPnl] = useState("");
  const [notes, setNotes] = useState("");

  const submitEntry = () => {
    if (!ticker.trim() && !notes.trim()) return;
    onAdd({
      day: Math.min(Math.max(Math.trunc(day) || 1, 1), totalDays),
      ticker: ticker.trim(),
      result,
      pnl: pnl.trim(),
      notes: notes.trim(),
    });
    setTicker("");
    setResult("note");
    setPnl("");
    setNotes("");
  };

  return (
    <section className="plan-panel" aria-label="Trade journal">
      <div className="plan-panel-head">
        <div>
          <span className="completion-label">Trade journal</span>
          <strong>Active run log</strong>
        </div>
        <span className="completion-hint">{entries.length} entries saved with this plan.</span>
      </div>
      <div className="journal-form">
        <label>
          <span>Day</span>
          <input min={1} max={totalDays} onChange={(event) => setDay(Number(event.currentTarget.value))} type="number" value={day} />
        </label>
        <label>
          <span>Ticker</span>
          <input onChange={(event) => setTicker(event.currentTarget.value)} placeholder="SOL / coin" value={ticker} />
        </label>
        <label>
          <span>Result</span>
          <select onChange={(event) => setResult(event.currentTarget.value as TradeJournalEntry["result"])} value={result}>
            <option value="note">Note</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
          </select>
        </label>
        <label>
          <span>PnL</span>
          <input onChange={(event) => setPnl(event.currentTarget.value)} placeholder="+0.2 SOL" value={pnl} />
        </label>
        <label className="journal-notes-field">
          <span>Notes</span>
          <input onChange={(event) => setNotes(event.currentTarget.value)} placeholder="Setup, mistake, rule followed..." value={notes} />
        </label>
        <button className="plan-btn primary" onClick={submitEntry} type="button">Add entry</button>
      </div>
      <div className="journal-list">
        {entries.length === 0 ? <p className="empty-copy">No trades logged yet.</p> : null}
        {entries.map((entry) => (
          <article className="journal-entry" key={entry.id}>
            <div>
              <strong>{entry.ticker || "Untitled trade"}</strong>
              <span>Day {entry.day} · {entry.result}{entry.pnl ? ` · ${entry.pnl}` : ""}</span>
              {entry.notes ? <p>{entry.notes}</p> : null}
            </div>
            <button className="mini-remove-btn" onClick={() => onRemove(entry.id)} type="button">remove</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function PlanHistory({ history }: { history: PlanHistoryItem[] }) {
  return (
    <section className="plan-panel" aria-label="Plan history">
      <div className="plan-panel-head">
        <div>
          <span className="completion-label">Plan history</span>
          <strong>Past runs</strong>
        </div>
        <span className="completion-hint">{history.length} archived plans.</span>
      </div>
      <div className="history-list">
        {history.length === 0 ? <p className="empty-copy">Restart or complete a plan to archive it here.</p> : null}
        {history.map((item) => {
          const inputs = getPlanChallengeInputs(
            item.activePlan.planPreset,
            item.activePlan.challengeMode,
            item.activePlan.starts,
            item.activePlan.goals,
          );
          const mode = item.activePlan.challengeMode;
          const challenge = getChallengeConfig(mode, inputs.goals[mode], inputs.starts[mode]);
          return (
            <article className="history-item" key={item.id}>
              <div>
                <strong>
                  {item.activePlan.planPreset === "og" ? <span className="og-badge">OG</span> : null}
                  {challenge.startLabel} to {challenge.finalLabel}
                </strong>
                <span>{item.reason} · {item.progress.checkedDays.length} days checked · {item.progress.completions} completions</span>
              </div>
              <time>{formatShortDate(item.archivedAt)}</time>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SyncStatus({
  auth,
  checkedDays,
  completions,
  saveStatus,
}: {
  auth?: AuthState;
  checkedDays: number;
  completions: number;
  saveStatus: SaveStatus;
}) {
  if (!auth?.isSignedIn) return <>Guest progress is saved in this browser until you sign in.</>;
  if (saveStatus === "saving") return <>Saving to cloud...</>;
  if (saveStatus === "saved") return <>Saved to cloud · {checkedDays} days · completions: {completions}/{COMPLETION_GOAL}</>;
  if (saveStatus === "error") return <>Save failed. Check your connection and Convex dev server.</>;
  return <>Cloud sync ready · {checkedDays} days · completions: {completions}/{COMPLETION_GOAL}</>;
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
  if (!auth?.configured) {
    return (
      <div className="auth-card">
        <div className="auth-title">Sign-in not configured</div>
        <p>Add your Convex and Whop env vars to enable cloud progress.</p>
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

  return (
    <div className="auth-card">
      <div className="auth-title">Activate to sync</div>
      <p>Open Sol Tracker inside Whop and confirm membership on the access screen to save progress to the cloud.</p>
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
      <div className="fee-settings-head fee-settings-subhead">
        <div>
          <span className="completion-label">Fee settings</span>
          <strong>Sell preset guide</strong>
        </div>
        <span className="completion-hint">Use presets 1, 2, and 3 from left to right.</span>
      </div>
      <div className="fee-preset-grid">
        {SELL_FEE_PRESETS.map((preset) => (
          <article className="fee-preset-card" key={preset.name}>
            <div className="fee-preset-top">
              <span>{preset.name}</span>
              <strong>Sell settings</strong>
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
  const isUsdcGuide = challenge.unit === "USDC";
  const guideStart = isUsdcGuide ? "$300 SOL" : formatGuideUnit(3, challenge);
  const guideGoal = isUsdcGuide ? "$200,000 SOL" : formatGuideUnit(2000, challenge);
  const earlyStackRange = isUsdcGuide ? "$200-$500+" : formatGuideRange(2, 5, challenge, true);
  const earlyBidRange = isUsdcGuide ? "$50-$100" : formatGuideRange(0.5, 1, challenge);
  const earlyHappyTarget = isUsdcGuide ? "10+ SOL" : formatGuideUnit(10, challenge, true);
  const smallCutRange = isUsdcGuide ? "$20-$50" : formatGuideRange(0.2, 0.5, challenge);
  const alternateEarlyBid = isUsdcGuide ? "$30" : formatGuideUnit(0.3, challenge);
  const midStackRange = isUsdcGuide ? "$500-$2000" : formatGuideRange(5, 20, challenge, true);
  const midBidRange = isUsdcGuide ? "$50-$300" : formatGuideRange(0.5, 3, challenge);
  const upperCategory = isUsdcGuide ? "$2000" : formatGuideUnit(20, challenge, true);
  const upperStack = isUsdcGuide ? "$2000" : formatGuideUnit(20, challenge, true);
  const upperNormalBid = isUsdcGuide ? "$200-$300" : formatGuideRange(2, 3, challenge);
  const upperMaxBid = isUsdcGuide ? "$500" : formatGuideUnit(5, challenge);
  const runnerSize = isUsdcGuide ? "$500" : formatGuideUnit(5, challenge);
  const cutLossRange = isUsdcGuide ? "$100-$200" : formatGuideRange(1, 2, challenge);
  const exampleEntry = isUsdcGuide ? "$200" : formatGuideUnit(2, challenge);
  const exampleExit = isUsdcGuide ? "$2000" : formatGuideUnit(20, challenge);
  const styleStack = isUsdcGuide ? "$500" : formatGuideUnit(50, challenge, true);
  const largeStackRange = isUsdcGuide ? "$10000-$30000" : formatGuideRange(100, 300, challenge);
  const oversizedStack = isUsdcGuide ? "$30000" : formatGuideUnit(300, challenge, true);
  const chanceBidRange = isUsdcGuide ? "$3000-$5000" : formatGuideRange(30, 50, challenge);
  const dcaStack = isUsdcGuide ? "$10000" : formatGuideUnit(100, challenge);
  const largePnlTarget = isUsdcGuide ? "$10000+" : `${dcaStack}+`;
  const mediumPnlTarget = isUsdcGuide ? "$2000+" : upperStack;

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
      <div className="note-card pullupso-card evaluating-coins-card">
        <div className="note-title">Evaluating coins</div>
        <div className="note-body evaluating-coins-grid">
          <div className="evaluating-coins-row">
            <strong>New pairs</strong>
            <p>Only buy coins you can see at least going to <span>$10k-$15k</span>.</p>
          </div>
          <div className="evaluating-coins-row">
            <strong>Final stretch</strong>
            <p>Only buy coins you can see at least going to <span>$30k-$60k</span>.</p>
          </div>
          <div className="evaluating-coins-row">
            <strong>Migrated coins</strong>
            <p>Only buy coins you can see going to at least <span>$100k-$150k+</span>.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card price-targets-card">
        <div className="note-title">Price targets</div>
        <div className="note-body price-targets-grid">
          <div className="price-target-row">
            <strong>Consensus targets</strong>
            <p>Good coins usually have price targets. Assume most people will respect your targets or the market's consensus targets for where the coin deserves to be.</p>
          </div>
          <div className="price-target-row">
            <strong>Let narratives cook</strong>
            <p>People are slow. Give strong narratives a few minutes, hours, or even days for the thesis to fully play out, especially when you have alpha others do not.</p>
          </div>
          <div className="price-target-row">
            <strong>Thesis over entry</strong>
            <p>If something falls below your entry, do not sell just because you are red. Sell when the thesis is completely invalidated.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card pre-trade-checklist-card">
        <div className="note-title">Pre trade checklist</div>
        <div className="note-body">
          <p className="pre-trade-checklist-note">Mainly applies to final stretch coins.</p>
          <div className="pre-trade-checklist-grid">
            <div className="pre-trade-checklist-row">
              <strong>1. Identify the call</strong>
              <p>Find and confirm the call in Gem Bot before doing anything else.</p>
            </div>
            <div className="pre-trade-checklist-row">
              <strong>2. Check and research</strong>
              <p>Review ticker, name, narrative, community, whether it is in meta, and whether it fits the narrative selection guide.</p>
            </div>
            <div className="pre-trade-checklist-row">
              <strong>3. Predefine risk</strong>
              <p>Know how much you are willing to lose if the thesis gets invalidated.</p>
            </div>
            <div className="pre-trade-checklist-row">
              <strong>4. Set price target</strong>
              <p>Ask if the coin can go to $40k, $50k, $60k, $100k, etc. based on your research, then stick with the thesis and target.</p>
            </div>
            <div className="pre-trade-checklist-row">
              <strong>5. Execute and hold</strong>
              <p>Buy, hold through dips if the narrative is good, and loop back to the original thesis when doubt hits.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Pullupso {guideStart} to {guideGoal} in 7 days tips</div>
        <div className="note-body">
          Source: <a href="https://x.com/pullupso" target="_blank" rel="noopener noreferrer">@pullupso on X</a>
          <div className="pullupso-quote">
            <p>Sizing and tips/tricks used to go from {guideStart} to {guideGoal} in 7 days.</p>
            <p>{earlyStackRange} Use {earlyBidRange} (scalp pumpfuns for {smallCutRange} or more just sell when u think chart goes down) DO THIS OVER AND OVER TIL around {earlyHappyTarget} or until ur happy or u feel like u get the hang of it, literally just break even or sell in 10-20% losses if ur cutting. ({alternateEarlyBid} is also good, but this is my preference to snowball quick early on, and juice out {earlyBidRange} pnls)</p>
            <p>{midStackRange} use {midBidRange} Scalp and try bid 12-25k mc coins at bottom of abt to grad, method below ({upperCategory} category)</p>
            <p>{upperStack} {upperNormalBid} normal bid {upperMaxBid} max bid</p>
            <p>do this all the way until u can size {runnerSize} into potential runners and cut in loss for {cutLossRange} or play conviction on fresh migrates but still stick to new pairs on abt to grad and filter coins by spam hiding dogshit (0 min - 120 mins) filter ( THIS IS WHEN U CAN BUY 3-5% OF PUMPFUNS AND MAKE THE MOST MONEY YOU'VE SEEN SO FAR) this is where you predominantly try to catch 150-600k toppers on pump ( {exampleEntry} on 20k entry = {exampleExit} at 200k)</p>
            <p>{styleStack} : adopt ur own trading style which u can figure out from ur own mentality, or your emotions towards winning certain amounts and losing (this part is a learning curve and is the difference between hitting {largePnlTarget} PnL's and {mediumPnlTarget} pnls, however )</p>
            <p>{largeStackRange} : avoid conviction plays that are off new pairs unless bottomed. Play METAs size 1-10% of ur port into every trade u make and cut in 20-50% losses, YOU SHOULD BE HOLDING MORE AT THIS BALANCE and playing to hit runners.</p>
            <p>{oversizedStack} Don't oversize (THIS PORT IS A SIZE TRAP), play ur mentality, WAIT FOR RUNNERS (SOMETHING U SHOULD BE DOING EXCLUSIVELY) Do not overtrade and don't over-size stick to 1-10% rule and in the small circumstance, take a chance on a {chanceBidRange} bid, I will also note that above {dcaStack} you SHOULD be DCA'ing with multiple bids and bidding 2-5 times every time u buy, and leave space to DCA (buy lower than ur average to lower ur average entry) into anything.</p>
            <p>NOTE:</p>
            <p>A port above 150k USD isn't necessary for this market and u should be stabling into prices u like. When the time comes I'll make another tweet on sizing in current market conditions.</p>
          </div>
        </div>
      </div>
      <ShikamaruOneSolTakeProfitStrategyCard />
      <ClukzPullupsoSizingAdvice />
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
      <div className="note-card pullupso-card">
        <div className="note-title">Reality check on high-entry buys</div>
        <div className="note-body">
          Source: <a href="https://x.com/cap100x" target="_blank" rel="noopener noreferrer">@cap100x on X</a>
          <div className="pullupso-quote">
            <p>
              <a href="https://x.com/cap100x/status/2048581578452828523?s=46" target="_blank" rel="noopener noreferrer">
                no ur just wasting ur time buying coins this high and wasting more time tweeting about it for attention -
                <br /><br />
                buying lowcaps, compound ur money and grow.
                <br /><br />
                u just look retarded buying $20 in a 5.4m coin and posting about it, maybe some delusional bagworkers will say good job but be realistic
                <br /><br />
                coming from someone who not too long ago was BROKE and lost his port MANY times.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Reality of becoming a full-time trader</div>
        <div className="note-body">
          Source: <a href="https://x.com/cryptomikli" target="_blank" rel="noopener noreferrer">@cryptomikli on X</a>
          <div className="pullupso-quote">
            <p>
              <a href="https://x.com/cryptomikli/status/2048463400758288774?s=46" target="_blank" rel="noopener noreferrer">
                Flood explains why most traders fail and how to avoid it: "Trading is like financial combat. If you're making money, you're taking it from someone else"
                <br /><br />
                "If you're trying to be a full-time trader, set aside enough capital to cover all your expenses for six months to a year. Put that money into T bills or a very safe blend of assets, not equities. That's your untouchable bucket, so you don't have to think about expenses and you know you're covered for a year"
                <br /><br />
                "Then you have your long-only or relatively safe bucket, where you either identify if you actually have alpha or just hold quality assets that appreciate over time. After that, you have your actively traded bucket"
                <br /><br />
                "I have no empathy for people who say they lost everything because of a mistake like a resting limit order or getting filled during a crash. You should never have all your assets on a single exchange because of user error risk. If you do, you're not a serious person"
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">gh0strider tweet</div>
        <div className="note-body">
          Source: <a href="https://x.com/0xghostrider" target="_blank" rel="noopener noreferrer">@0xghostrider on X</a>
          <div className="pullupso-quote">
            <p>
              <a href="https://x.com/0xghostrider/status/2048273413031247970?s=46" target="_blank" rel="noopener noreferrer">
                Zero utility in following sound money management protocols in the current gambling economy when you are trying to get the wheels off the ground.
                <br /><br />
                Doesn't matter if you're trying to trade, become a streamer, launch ecom store, info product, personal brand, it's all gambling in the initial stages.
                <br /><br />
                Every grand slam in the modern era is sparked by a degenerate play and it ain't worth embarking on any of these journeys for a lesser outcome.
                <br /><br />
                Can thank your lucky stars if your sensitivity to money reflexes were ripped out from an early age so you can commit to punting for 10+ years until one of your ventures inevitably moons.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">decu trading advice $250,000 PNL to $1,000,0000 in 6 months</div>
        <div className="note-body">
          Source: <a href="https://x.com/notdecu" target="_blank" rel="noopener noreferrer">@notdecu on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer"><strong>1. Stick to what works for you</strong></a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">Whether it's high-caps, mid-caps, or even deving, everyone has a niche.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">In my case, I have seen success in new pairs and unfortunately, I am not the best at the rest.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">So that is what I'll be talking about here.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer"><strong>2. You need to find a way to filter out bad coins from the good ones.</strong></a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">What's a good way to do that? Tracking dev wallets.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">To find the good ones: Analyze previous performances through their wallet. Stay chronically online to spot recurring names.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">Which brings me to my next point.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer"><strong>3. Unfortunately, it is hard to trench new pairs only being online 2-3 hours a day.</strong></a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">You have to know what's already ran, understand the current meta, and recognize exactly how coins are moving.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">Even if you aren't trading, just staring at the scope/charts is the best way to build your edge.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer"><strong>4. When you buy a coin, make sure to inspect every detail: name, ticker, dev wallet, and holders.</strong></a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">With vamps everywhere, even a tiny misspelling or a bearish image is a red flag. If you don't catch the small mistakes, the market will.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">Also, if a coin is getting volume and global fees look like this it is most likely a rug:</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer"><strong>5. Lastly, I want to say a big part of trading is just the mental game.</strong></a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">You usually think you are pvping others when most of the time you are pvping yourself.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">One small hesitation could be the reason you miss out on that one cook.</a></p>
            <p><a href="https://x.com/notdecu/status/2049865699598672039" target="_blank" rel="noopener noreferrer">Goodluck and see you on the scope 😎</a></p>
            <p><a href="https://x.com/notdecu/status/2050010079777144915" target="_blank" rel="noopener noreferrer"><strong>Decu Risk Management</strong></a></p>
            <p><a href="https://x.com/notdecu/status/2050010079777144915" target="_blank" rel="noopener noreferrer">Thank you! Yes, as far as risk management I try to cut losses around 40% or less because the tax on sell puts me over.</a></p>
            <p><a href="https://x.com/notdecu/status/2050010079777144915" target="_blank" rel="noopener noreferrer">Also I try to stick to my strategy in buying lowcaps which leaves me not much to lose. Also the pattern recognition helps for me to understand life span of certain type of coins.</a></p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Being able to quick buy new narratives but not enough conviction to hold</div>
        <div className="note-body">
          Source: <a href="https://x.com/zukiyopnls" target="_blank" rel="noopener noreferrer">@zukiyopnls on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              <a href="https://x.com/zukiyopnls/status/2049016741959721286?s=46" target="_blank" rel="noopener noreferrer">
                Alright it deadass isn't funny anymore, no troll how tf do I hold, I'm moving like Dv/Cented with the quick buys, but right now holding is deadass the biggest issue
              </a>
            </p>
            <p><strong>Replies</strong></p>
            <p>
              <a href="https://x.com/Megga/status/2049353413259939907" target="_blank" rel="noopener noreferrer">
                <strong>@Megga:</strong> bid with size ur comfy with and just set a price target on what u think it'll go to and clip around there if thesis is the same
              </a>
            </p>
            <p>
              <a href="https://x.com/XScharo/status/2049358794136904087" target="_blank" rel="noopener noreferrer">
                <strong>@XScharo:</strong> do your research on the coin real quick, you should be able to price it in quickly - based on that u just hold ur conviction if ur conviction can play out in 12s good if it needs 15min okay
              </a>
            </p>
            <p>
              <a href="https://x.com/_zeldr1ss/status/2049137766970093995" target="_blank" rel="noopener noreferrer">
                <strong>@_zeldr1ss:</strong> if u dont have conviction to hold then ur not buying the right coins
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">How people lose their ports</div>
        <div className="note-body">
          Source: <a href="https://x.com/LevanInSolana/status/2051734006757011605" target="_blank" rel="noopener noreferrer">@LevanInSolana on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p><strong>Replies</strong></p>
            <p>
              <a href="https://x.com/WaiterG/status/2051756739687567752" target="_blank" rel="noopener noreferrer">
                <strong>@WaiterG:</strong> Happens to a lot everyone thinks it can’t happen to them but one over leveraged play will cause you to go on a bad streak and take you over the edge everyone thinks it can’t happen to them even with how much they’ve seen it but it still can
              </a>
            </p>
            <p>
              <a href="https://x.com/jacexbt/status/2051881272285524400" target="_blank" rel="noopener noreferrer">
                <strong>@jacexbt:</strong> it doesnt feel real the money until you hold it, littersly only spent crypto on ubereats for food to keep trenching then rage traded and gambled away 5 figs and felt nothing, its hard to describe why
              </a>
            </p>
            <p>
              <a href="https://x.com/NachSOL/status/2051786963376546146" target="_blank" rel="noopener noreferrer">
                <strong>@NachSOL:</strong> cause u size up with ur port if u wanna make more
              </a>
            </p>
            <p>
              <a href="https://x.com/MasterBlastorTV/status/2051748142731640878" target="_blank" rel="noopener noreferrer">
                <strong>@MasterBlastorTV:</strong> Once you get used to bigger and bigger sizes, people have a really hard time downsizing
              </a>
            </p>
            <p>
              <a href="https://x.com/ecomsin" target="_blank" rel="noopener noreferrer">
                <strong>@ecomsin:</strong> terrible risk management meeting a big enough ego
              </a>
            </p>
            <p>
              <a href="https://x.com/ishallrise777/status/2051757665345486880" target="_blank" rel="noopener noreferrer">
                <strong>@ishallrise777:</strong> Slow burns and fast spirals. 1K loss 2k loss here and there add up when you don’t manage the r/r properly. People who do make it holding things they believe in will hold things they believe in to the ground. Personally I myself need to learn to sit and wait for the next play out.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">place high expectations on yourself</div>
        <div className="note-body">
          Source: <a href="https://x.com/onchainsorcerer/status/1979243563801285021" target="_blank" rel="noopener noreferrer">@onchainsorcerer on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              <a href="https://x.com/onchainsorcerer/status/1979243563801285021" target="_blank" rel="noopener noreferrer">
                i think a trader&apos;s theoretical ceiling is raised when they learn to be kind to themselves. you don&apos;t make it anywhere without embracing who you are. life is so much more vibrant than the dark corners of self-doubt. its important to place high expectations on yourself, its quintessential to give yourself time to achieve them
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">The Cognitive Game: How Top Traders Think in Chaos</div>
        <div className="note-body">
          Source: <a href="https://x.com/Cypherpunkgod1" target="_blank" rel="noopener noreferrer">@Cypherpunkgod1 on X</a>
          <div className="pullupso-quote decu-advice-quote cognitive-thread-quote">
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459508943417407" target="_blank" rel="noopener noreferrer">
                <strong>The Cognitive Game: How Top Traders Think in Chaos</strong> — Twitter thread
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459511879356446" target="_blank" rel="noopener noreferrer">
                Most people think memecoin trading is about speed, who apes first, who sells last, who spots the next meta before everyone else.
                <br /><br />
                But if you zoom out, the ones who consistently survive the volatility aren&apos;t just &quot;early.&quot; They think differently.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459516790931586" target="_blank" rel="noopener noreferrer">
                They don&apos;t chase hype. They analyze attention.
                <br /><br />
                They don&apos;t gamble on emotion. They exploit it.
                <br /><br />
                They treat the market not as a casino, but as a psychological ecosystem, one they&apos;ve learned to navigate with surgical precision.
                <br /><br />
                This is the cognitive blueprint behind that mindset.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459520913903788" target="_blank" rel="noopener noreferrer">
                <strong>The Illusion of Skill</strong>
                <br /><br />
                Everyone believes they have skill in the market.
                <br /><br />
                Few actually do.
                <br /><br />
                Because skill in crypto isn&apos;t about chart lines or tokenomics — it&apos;s about how clearly you can think under pressure.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459525670277278" target="_blank" rel="noopener noreferrer">
                It&apos;s your ability to understand why you&apos;re buying, what others are seeing, and when their perception will align with yours.
                <br /><br />
                Every consistent winner, no matter how chaotic their process appears, is operating on one truth:
                <br /><br />
                the market is a mirror of human emotion.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459529550012648" target="_blank" rel="noopener noreferrer">
                Every candle, every wick, every chart pattern — all of it is just psychology, made visible.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459534578970912" target="_blank" rel="noopener noreferrer">
                <strong>Attention: The Real Liquidity</strong>
                <br /><br />
                The market doesn&apos;t run on capital.
                <br /><br />
                It runs on attention.
                <br /><br />
                Attention is oxygen — the lifeblood of every token. Without it, no narrative breathes.
                <br /><br />
                And attention follows patterns, not randomness
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459539037569184" target="_blank" rel="noopener noreferrer">
                Novelty: people chase what feels new.
                <br /><br />
                Emotion: the strongest stories make you feel something.
                <br /><br />
                Conflict: drama sustains engagement.
                <br /><br />
                Authority: validation from trusted figures accelerates adoption.
                <br /><br />
                Storytelling: humans remember narratives, not metrics.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459543017918696" target="_blank" rel="noopener noreferrer">
                If you understand how attention moves, you already understand how price moves.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459546767626549" target="_blank" rel="noopener noreferrer">
                <strong>Anticipation: The Hidden Meta</strong>
                <br /><br />
                The rarest trading skill isn&apos;t entry or exit, it&apos;s timing attention.
                <br /><br />
                The best traders don&apos;t react to hype; they pre-position for it.
                <br /><br />
                They notice subtle shifts — a format catching fire, a cultural overlap forming, a whale moving before a narrative hit
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459550689268167" target="_blank" rel="noopener noreferrer">
                They see the shadow of the trend before the light hits it.
                <br /><br />
                That&apos;s not luck. That&apos;s pattern recognition trained through exposure.
                <br /><br />
                Anticipation is game theory with a psychological engine.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459555114332485" target="_blank" rel="noopener noreferrer">
                <strong>Information Asymmetry and Narrative Translation</strong>
                <br /><br />
                Every profitable trade is rooted in asymmetry — you either know something others don&apos;t, or you interpret the same information faster.
                <br /><br />
                But raw data isn&apos;t enough. Everyone sees the same on-chain analytics, the same charts.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459559123992918" target="_blank" rel="noopener noreferrer">
                The real difference lies in translation — turning information into narrative potential.
                <br /><br />
                The blockchain gives you numbers.
                <br /><br />
                Your cognition turns them into meaning.
                <br /><br />
                And meaning is what drives the crowd.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459563859644504" target="_blank" rel="noopener noreferrer">
                That&apos;s why the best traders sound more like storytellers than analysts.
                <br /><br />
                They don&apos;t trade tokens — they trade perception gaps.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459567965655106" target="_blank" rel="noopener noreferrer">
                <strong>IQ Isn&apos;t the Edge - Emotional Calibration Is</strong>
                <br /><br />
                You can have the highest IQ in the room and still blow up your account.
                <br /><br />
                You can have the lowest and still print.
                <br /><br />
                Why? Because the market doesn&apos;t reward intelligence, it rewards emotional control.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459571790844161" target="_blank" rel="noopener noreferrer">
                Low-IQ traders often lose because they overtrade and overbelieve in luck.
                <br /><br />
                High-IQ traders often lose because they can&apos;t detach from their own logic.
                <br /><br />
                The real alpha is clarity under stress — the ability to stay rational when your body is in fight-or-flight mode.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459576534622507" target="_blank" rel="noopener noreferrer">
                <strong>Adaptation Over Conviction</strong>
                <br /><br />
                Conviction is important. But conviction without adaptation is suicide.
                <br /><br />
                Markets evolve faster than human beliefs.
                <br /><br />
                By the time you&apos;ve formed an opinion, the meta has shifted three layers ahead.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459580187861147" target="_blank" rel="noopener noreferrer">
                The best traders treat conviction like code, something meant to be rewritten, not worshiped.
                <br /><br />
                The moment you become rigid, your edge decays.
                <br /><br />
                Adaptation is survival. Conviction is inertia. Know the difference.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459584747008473" target="_blank" rel="noopener noreferrer">
                <strong>The Internal Loop</strong>
                <br /><br />
                Every trade you make is an echo of your psychology.
                <br /><br />
                If you can&apos;t audit your own emotions, you can&apos;t audit your trades.
                <br /><br />
                Fear, greed, boredom — these are your real open positions.
                <br /><br />
                Your subconscious is the invisible trader sitting beside you, making decisions....
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459589251760636" target="_blank" rel="noopener noreferrer">
                you&apos;ll justify later.
                <br /><br />
                The more self-aware you are, the sharper your cognitive edge becomes.
                <br /><br />
                Because no signal, no system, no alpha will save you from a foggy mind.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459593496342725" target="_blank" rel="noopener noreferrer">
                <strong>The Market Is a Mirror</strong>
                <br /><br />
                You don&apos;t need more indicators.
                <br /><br />
                You need better introspection.
                <br /><br />
                Memecoins might look chaotic, irrational, absurd — but beneath the noise, they&apos;re governed by structure.
                <br /><br />
                Attention fuels them.
                <br /><br />
                Anticipation monetizes them....
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459598483444117" target="_blank" rel="noopener noreferrer">
                Emotion distorts them.
                <br /><br />
                Adaptation refines them.
                <br /><br />
                The traders who understand these loops aren&apos;t just making money.
                <br /><br />
                They&apos;re decoding human behavior in real time.
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/1979459602606399544" target="_blank" rel="noopener noreferrer">
                And once you see that, once you truly see it — you&apos;ll realize the market was never random.
                <br /><br />
                It was just reflecting us all along.
                <br /><br />
                &quot;The chart is human nature rendered visible.&quot;
              </a>
            </p>
            <p>
              <a href="https://x.com/Cypherpunkgod1/status/2051394665111265730?s=20" target="_blank" rel="noopener noreferrer">
                Every trade you make is an echo of your psychology.
                <br /><br />
                If you can&apos;t audit your own emotions, you can&apos;t audit your trades.
                <br /><br />
                Fear, greed, boredom — these are your real open positions.
                <br /><br />
                Your subconscious is the invisible trader sitting beside you, making decisions.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Cented advice for new pairs</div>
        <div className="note-body">
          Source: <a href="https://x.com/flipski77" target="_blank" rel="noopener noreferrer">@flipski77 on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              <a href="https://x.com/flipski77/status/2051479124321910947?s=20" target="_blank" rel="noopener noreferrer">
                Good advice - only thing I can say is that you want to be in these coins BEFORE the noise. You want to anticipate what coins are going to go viral and you&apos;ll always get the wallets after you. Other thing is don&apos;t block out new pairs because while you can lose the most there
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Cooker advice</div>
        <div className="note-body">
          Source: <a href="https://x.com/CookerFlips" target="_blank" rel="noopener noreferrer">@CookerFlips on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              <a href="https://x.com/CookerFlips/status/2051471862023209107?s=20" target="_blank" rel="noopener noreferrer">
                Being unprofitable solely from trenching boils down to two things (one or both)
              </a>
            </p>
            <p>
              <a href="https://x.com/CookerFlips/status/2051471862023209107?s=20" target="_blank" rel="noopener noreferrer">
                Doing too much (scalping/reentering/selling too early/etc) when you&apos;re good at finding decent stuff but you end up doing too much so u exit before u make decent profit
              </a>
            </p>
            <p>
              <a href="https://x.com/CookerFlips/status/2051471862023209107?s=20" target="_blank" rel="noopener noreferrer">
                Or
              </a>
            </p>
            <p>
              <a href="https://x.com/CookerFlips/status/2051471862023209107?s=20" target="_blank" rel="noopener noreferrer">
                Gambling with no sense of direction (this one is a harder one to fix) which essentially is not understanding the market or current meta or space or whatever
              </a>
            </p>
            <p>
              <a href="https://x.com/CookerFlips/status/2051471862023209107?s=20" target="_blank" rel="noopener noreferrer">
                The first one, its easy to fix, if u notice that you&apos;re nice at finding most good runners, just buy and walk away more often aka do less aka less is more
              </a>
            </p>
            <p>
              <a href="https://x.com/CookerFlips/status/2051471862023209107?s=20" target="_blank" rel="noopener noreferrer">
                The second one takes a bit of learning and adapting which luckily anyone can get good at; just sometimes people longer to grasp than others
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Sue&apos;s cheat sheet</div>
        <div className="note-body narrative-guide sue-cheat-sheet">
          <div className="sue-cheat-sheet-list">
            <p><strong>1. Before I Enter - Pre-Trade</strong></p>
            <ul>
              <li>Am I early?</li><li>Is the dev a good bag worker?</li><li>Bundle healthy or selling sides?</li><li>Coin health: narrative, deployer, holders</li><li>What&apos;s my win condition?</li><li>What&apos;s the ceiling for this?</li><li>Am I overexposing myself?</li><li>Crime token or narrative/tech?</li><li>Check twitter + Dev history</li><li>Who funded the dev?</li><li>Active community?</li><li>No PVP?</li><li>Virality is what you&apos;re betting on!</li>
            </ul>
            <p><strong>2. While Holding - Stay Honest</strong></p>
            <ul>
              <li>Would I buy here right now?</li><li>Checking trade activity + holders</li><li>Making sure no big coin gets deployed that can cause a lot of fomo</li><li>Is volume fading?</li><li>Are bundles/insiders still holding?</li><li>Check dev funded wallet</li><li>Am I making excuses to hold?</li>
            </ul>
            <p><strong>3. Time to Peace Out - Exit With Reason</strong></p>
            <ul>
              <li>Am I selling with REASON?</li><li>Are there marginal buyers left?</li><li>Would I buy here?</li><li>What&apos;s the ceiling?</li><li>Is PA stagnant + volume fading?</li><li>Team/insiders dumping?</li><li>Nobody got broke taking profit</li>
            </ul>
            <p><strong>4. Mindset &amp; Psyche - Stay Sharp</strong></p>
            <ul>
              <li>Market doesn&apos;t care about my emotions</li><li>Never let a big win turn into a loss</li><li>Be robotic - mental fortitude is everything</li><li>Comparison = theft of joy - play my game</li><li>When it looks too easy, be careful</li><li>Take profit, move on - short memory</li><li>Develop a system, make it efficient</li><li>Journal mistakes - private TG channel</li><li>Label every step - think like a computer</li><li>Trading shouldn&apos;t stop me living</li>
            </ul>
            <p><strong>5. Coin Health - The Doctor</strong></p>
            <ul>
              <li>Narrative - current meta?</li><li>Deployer - rug history?</li><li>Win cond. - 10x trigger?</li><li>Holders - smart money?</li><li>Distribution - team supply?</li><li>Age - fresh/stale?</li><li>Relevancy - still talked?</li><li>Asymmetry - R/R ratio</li>
            </ul>
            <p><strong>6. Position &amp; Risk - Size With Intent</strong></p>
            <ul>
              <li>Never overexpose</li><li>Size by conviction, not fomo</li><li>Use bet size I&apos;m okay with zeroing</li><li>PvP: bid smaller, wait for winner, then size</li><li>Really low entry? leave a moonbag (if narrative/meme is good) - the R/R is too good</li><li>Book profits -&gt; storage wallet on big days</li><li>&quot;Am I a buyer here&quot; &gt; &quot;how high can this go&quot;</li>
            </ul>
            <p><strong>7. Market Conditions - When to Play</strong></p>
            <ul>
              <li>No edge = don&apos;t play - the best trade is no trade</li><li>Bad markets: trade less, observe more</li><li>Identify the meta</li><li>What chain is hottest? sol or eth?</li><li>Holders market or flippers market?</li>
            </ul>
            <p><strong>8. Always</strong></p>
            <ul>
              <li>Sell with a reason</li><li>Ask &quot;would I buy here right now?&quot;</li><li>Check bundle + insider behaviour</li><li>Journal mistakes -&gt; if/then rules</li><li>Bad markets: trade less, observe more</li><li>Book profits to storage wallet</li><li>Curate feed - quality over quantity</li><li>Stay objective - the market is honest</li>
            </ul>
            <p><strong>9. Never</strong></p>
            <ul>
              <li>Overexpose - ever</li><li>Trade when emotional</li><li>Trade when I&apos;m not fully locked in</li><li>Chase if I missed (early or nothing)</li><li>Blindly tail wallets</li><li>Ape calls without my own analysis</li><li>Let a big win turn into a loss</li>
            </ul>
            <p><strong>10. Best Hours - EST (Eastern Standard Time)</strong></p>
            <ul>
              <li>9:00am - 11:00am Warm up</li><li>11:00 am - 1:00pm Peak</li><li>2:00pm - 3:00pm Dead - skip</li><li>3:00pm - 10:00pm Peak</li><li>After 10:00pm Wind down</li>
            </ul>
            <p><strong>11. Mantras to Remember - Pin to Brain</strong></p>
            <ul>
              <li>never let a big win turn into a loss</li><li>a position I hold is a position I buy at any given moment</li><li>if there&apos;s no edge, the best trade is no trade</li><li>early, or NOTHING</li><li>the market doesn&apos;t know, care about, or desire my emotions</li><li>comparison is the theft of joy - play my own game</li><li>great traders sell with reason</li><li>when it looks too easy, be careful</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Stop bidding slop, start bidding good narratives</div>
        <div className="note-body">
          Source: <a href="https://x.com/heishimmy/status/2051900972595863653" target="_blank" rel="noopener noreferrer">@heishimmy on X</a>
          <div className="pullupso-quote decu-advice-quote cognitive-thread-quote">
            <p>
              <a href="https://x.com/heishimmy/status/2051900972595863653" target="_blank" rel="noopener noreferrer">
                Gone are the days where you can make money on mid tier bullshit narratives.
              </a>
            </p>
            <p>
              <a href="https://x.com/heishimmy/status/2051900972595863653" target="_blank" rel="noopener noreferrer">
                It has to be an S tier narrative in order to fight off the bundle rape and do well past migration.
              </a>
            </p>
            <p>
              <a href="https://x.com/heishimmy/status/2051900972595863653" target="_blank" rel="noopener noreferrer">
                Going to reduce my clicks going forward and just sit on my hands until I see those narras.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">wallet onchain opsec</div>
        <div className="note-body">
          Source: <a href="https://x.com/RuneCrypto_/status/2051688699478323625?s=20" target="_blank" rel="noopener noreferrer">@RuneCrypto_ on X</a>
          <div className="pullupso-quote decu-advice-quote cognitive-thread-quote">
            <p>
              <a href="https://x.com/RuneCrypto_/status/2051688699478323625?s=20" target="_blank" rel="noopener noreferrer">
                View tweet
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
