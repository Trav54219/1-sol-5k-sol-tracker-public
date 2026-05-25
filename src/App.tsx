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
import { ALPHA_PLAYBOOK_LESSONS } from "./alphaPlaybookLessons";
import { FORTUNE_PLAYBOOK_LESSONS } from "./fortunePlaybookLessons";
import { SOL_MAFIA_PLAYBOOK_LESSONS } from "./solMafiaPlaybookLessons";
import { SOL_MAFIA_OBSERVATIONS } from "./solMafiaObservations";
import type { MemecoinMindsetLesson } from "./memecoinMindsetLessons";
import { MEMECOIN_MINDSET_LESSONS } from "./memecoinMindsetLessons";
import { STRATEGY_PLAYBOOK_LESSONS } from "./strategyPlaybookLessons";

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
            <div className="header-actions-row">
              <div className="rules-links">
                <a className="rules-link" href="https://trading-rules.vercel.app/" rel="noopener noreferrer" target="_blank">
                  Trading rules
                </a>
              </div>
              <TradeHours />
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

const TRADE_HOURS_REGIONS = [
  { id: "EU", session: "EU session", utc: "8:00–17:00 UTC", est: "4:00 am–1:00 pm EST" },
  { id: "Asia", session: "Asia session", utc: "00:00–09:00 UTC", est: "7:00 pm–4:00 am EST" },
  { id: "NA", session: "NA session", utc: "18:00–00:00 UTC", est: "1:00 pm–7:00 pm EST" },
] as const;

function TradeHours() {
  return (
    <div className="trade-hours" aria-label="Trade hours by region">
      <p className="trade-hours-line trade-hours-line-title">
        <span className="trade-hours-label">Trade hours</span>
      </p>
      {TRADE_HOURS_REGIONS.map((region, index) => (
        <p className="trade-hours-line" key={region.id}>
          <strong className="trade-hours-region">{region.id}</strong>{" "}
          <span>{region.utc}</span>
          <span className="trade-hours-sep"> · </span>
          <span>{region.est}</span>
          {index < TRADE_HOURS_REGIONS.length - 1 ? <span className="trade-hours-pipe"> |</span> : null}
        </p>
      ))}
    </div>
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

function PlaybookLessonGrid({ lessons }: { lessons: readonly MemecoinMindsetLesson[] }) {
  return (
    <div className="memecoin-mindset-grid">
      {lessons.map((lesson) => (
        <article className="memecoin-mindset-lesson" key={lesson.num + lesson.title}>
          <span className="memecoin-mindset-num" aria-hidden="true">
            {lesson.num}
          </span>
          <div>
            <strong className="memecoin-mindset-lesson-title">{lesson.title}</strong>
            <ul>
              {lesson.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
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
        <div className="note-title">How you make your first 100k in 2 months trading</div>
        <div className="note-body">
          Source:{" "}
          <a href="https://x.com/Charrquant/status/2057528304132059364" target="_blank" rel="noopener noreferrer">
            @Charrquant on X
          </a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              <a href="https://x.com/Charrquant/status/2057528304132059364" target="_blank" rel="noopener noreferrer">
                This is how you make your first 100k in 2 months trading:
              </a>
            </p>
            <p>
              <a href="https://x.com/Charrquant/status/2057528304132059364" target="_blank" rel="noopener noreferrer">
                Cut off everyone you know in real life or on the internet (they are just distracting you).
              </a>
            </p>
            <p>
              <a href="https://x.com/Charrquant/status/2057528304132059364" target="_blank" rel="noopener noreferrer">
                Fully lock in and identify the goals you have and need to achieve.
              </a>
            </p>
            <p>
              <a href="https://x.com/Charrquant/status/2057528304132059364" target="_blank" rel="noopener noreferrer">
                Live like a caveman, staring at your screen for 18h and fully using your brain.
              </a>
            </p>
            <p>
              <a href="https://x.com/Charrquant/status/2057528304132059364" target="_blank" rel="noopener noreferrer">
                Don&apos;t compare yourself to anyone or care about them; it gives you FOMO which you don&apos;t need.
              </a>
            </p>
            <p>
              <a href="https://x.com/Charrquant/status/2057528304132059364" target="_blank" rel="noopener noreferrer">
                Use your brain
              </a>
            </p>
            <p>
              <a href="https://x.com/Charrquant/status/2057528304132059364" target="_blank" rel="noopener noreferrer">
                Grow alone and build yourself alone with God.
              </a>
            </p>
            <p>
              <a href="https://x.com/Charrquant/status/2057528304132059364" target="_blank" rel="noopener noreferrer">
                Try this for one month and I swear to God you will make at least 10k
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Multi-millionaire from memecoins at 18</div>
        <div className="note-body">
          <p className="note-intro">$50 and 6 months of hard work (thread)</p>
          Source:{" "}
          <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
            @absolquant on X
          </a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                <strong>Backstory</strong>
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                I was 18, moving house to house with divorced parents while my dad was financially struggling. Seeing that my whole childhood carved how important money and stability are for quality of life.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                I worked 4 jobs at once while still in high school because I thought that was the only way to be truly wealthy — how wrong I was. While balancing 12th grade and those jobs, a friend{" "}
              </a>
              <a href="https://x.com/tilcrypto" target="_blank" rel="noopener noreferrer">
                @tilcrypto
              </a>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                , who was already in crypto, crossed my path.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                I reached out for basic advice. A simple message changed my life in ways I could not imagine.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Below: the advice I originally received plus what I used to become a multi-millionaire at 18, about a year into trading.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                <strong>1. People, groups &amp; networking</strong>
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Not trading alone matters enormously. A large part of becoming profitable is losing money — you learn faster with a group than alone. Multiple people = multiple lessons, not just your own mistakes.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Groups also drive communication: hundreds of times I&apos;ve been doom-scrolling TikTok and someone in call yells a coin with a quick thesis; I enter and hit huge profits. Example: moltbook — friend{" "}
              </a>
              <a href="https://x.com/prettyoverr" target="_blank" rel="noopener noreferrer">
                @prettyoverr
              </a>{" "}
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                called it in voice and I hit a $17,000 winner. Alone, I never would have seen it.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                <strong>2. Strategy &amp; market understanding</strong>
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                My style: in and out fast, avoid larger market-cap plays. Your edge may be my weakness and vice versa — find your comfortable ground. I trade off CT or frontrunning CT. Memes are attention-based; size potential market caps by how much attention you think the narrative gets.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Rare example: MOODENG — baby hippo going viral everywhere. Blue-arrow moment = when MOODENG first hit most Twitter trackers. $100 from a Twitter notification could have become ~$1.15M (very rare, but shows how important tools are). Takeaway: market-cap ceiling. After a viral hippo runs to ~600M, what will the next viral hippo run to? Usually far less — that&apos;s a derivative (similar lore to a prior runner). MOODENG&apos;s &quot;brother&quot; almost never touches the original top.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Before buy/sell: is this an original narrative (no similar coins before)? What makes a narrative good? Virality: Could big figures interact? Will normal people talk about it? How funny is the meme? (Attention is everything.) Originality: If it&apos;s the 15th coin in a narrative that already ran, odds are low. Wow factor: If the story genuinely impresses you — crazy, rare, hilarious with friends — you may be in a runner.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                <strong>3. Risk, portfolio &amp; trade management</strong>
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Beginners: risk no more than 5% of total SOL port per trade (1 SOL → max ~0.05 SOL buys until confident). Lose and learn without torching the stack. When profits scale above port: take profit to stables/real money daily. Friends making $100k+/mo holding extra SOL all month, then SOL -40% — watched seven-figure bags shrink because they only needed 100 SOL/day to trade.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                If you need 100 SOL to trade daily and make 200 SOL that day, sell the 100 SOL profit. Every time. You&apos;re a meme trader, not a stock quant — you don&apos;t know where SOL goes in days/weeks. SELL PROFITS DAILY NO MATTER SOL PRICE.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                On KOLs and chart noise: don&apos;t exit because &quot;Cupsey blasted&quot; or price dips slightly under entry. Trade your vision and your R/R — not other traders. Sheep behavior teaches nothing; learn as an individual.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                <strong>4. Psychology, mindset &amp; consistency</strong>
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Mindset is half the game. Gym built my consistency — weak/victim mindset? Sign up, learn slow improvement. No closed mindset in entrepreneurship; learn from everyone and every piece of content (including checking things yourself instead of default &quot;scam&quot;).
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Consistency = long learning with little reward until a bump — most quit at 50% effort after a few months. This niche is brutally competitive; long-stayers outperform. Stick through hard stretches. Trenching without profit? Journal every trade — what went wrong vs right — not slop-and-pray. My style could bankrupt you; yours could bankrupt me. Styles differ.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Losses are growth; each loss is closer to the big win. Treat them as learning curves, not defeat. Track losses/mistakes daily — consistency + realizing mistakes + time = fast growth.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                <strong>5. Tools, wallets &amp; infrastructure</strong>
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Essentials: trading platform (Axiom is my pick), CT tracker, wallet tracker (Axiom), trading in group calls. Without those four you will struggle — many free options; I use Axiom as trading browser (referral for fee rakeback if you want 20% off fees on signup).
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Multi-wallets: don&apos;t touch until port &gt;100 SOL. Used to spread supply under the radar (5×3% looks better than one 15% wallet) — but multi-wallet = more risk; you&apos;re saying one wallet isn&apos;t enough profit and you want to risk more.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                <strong>Wallet tracking:</strong> DO NOT COPYTRADE. You learn nothing and usually lose. Use tracking to find coins you wouldn&apos;t see and spot volume/trends faster — not to mirror wallets.
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                <strong>Final summary</strong>
              </a>
            </p>
            <p>
              <a href="https://x.com/absolquant" target="_blank" rel="noopener noreferrer">
                Memecoins changed my life and my family&apos;s for the better — I want the same for everyone reading this. Put your all in; there is no other space like memecoins — take advantage while it&apos;s here; it won&apos;t last forever. Written entirely off the dome, zero AI — authentic from my brain. Thank you if you made it this far.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">50-100 SOL/month now → 2k at peak trenches</div>
        <div className="note-body">
          Source:{" "}
          <a href="https://x.com/pinkprintersol" target="_blank" rel="noopener noreferrer">
            @pinkprintersol on X
          </a>
          <div className="pullupso-quote">
            <p>
              <a href="https://x.com/pinkprintersol" target="_blank" rel="noopener noreferrer">
                Making 50–100 SOL a month in current conditions translates to 2k SOL a month once trenches go back to the 2024 peak.
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #1</div>
        <div className="note-body">
          <p>
            <strong>On holding:</strong> If the narrative is really, really good, people will not want to hard rape it at bonding — and even if it does get hard raped at bonding, it will eventually get bought up to the price target the narrative/coin deserves. Don&apos;t sell on the first FUD if the narrative is genuinely good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #2</div>
        <div className="note-body">
          <p>
            <strong>On comparison:</strong> Compare the narrative to every other coin out as well. If everything else is really dogshit, people will just want to blast or bid the best coin up — especially true in EU time when volume is slower.
          </p>
          <p>
            <strong>On who&apos;s trenching:</strong> Buy stuff Gen Z (19–27) predominantly white guys would buy — that&apos;s the majority archetype of people in the trenches.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #3</div>
        <div className="note-body">
          <p>
            <strong>On new pairs (and any coin):</strong> Buy things that are original, relevant, in meta, and unique — something you&apos;ve never seen before. These are also the coins most likely to get buys on new pairs. Goal on new pairs: buy coins where people have no choice but to buy on top of you because the coin is that good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-4-card">
        <div className="note-title">Travis tip #4</div>
        <div className="note-body">
          <p className="travis-tip-4-lead">
            Don&apos;t start grinding new pairs until <strong className="travis-tip-4-em">all</strong> of the following are checked:
          </p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                1
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Kolscan rank</strong>
                <p>
                  You have a tracked wallet on Kolscan where you&apos;re ranking near the top 10 on the monthly leaderboard for PNL.
                </p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                2
              </span>
              <div>
                <strong className="travis-tip-4-item-title">3–6 SOL quick buys</strong>
                <p>
                  You can comfortably quick-buy 3–6 SOL on new pairs and it&apos;s not a huge chunk of your portfolio or net worth.
                </p>
                <p className="travis-tip-4-example">
                  Example: ~3.7k SOL in the wallet — even losing, you don&apos;t notice or see Axiom balance down even 1 SOL (top-right).
                </p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                3
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Multi-wallet flow</strong>
                <p>You can use 2–3 wallets comfortably when trading.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                4
              </span>
              <div>
                <strong className="travis-tip-4-item-title">No panic jeets</strong>
                <p>
                  You don&apos;t feel the need to jeet out of the coin quickly because you&apos;re scared to lose money or your port is low.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #5</div>
        <div className="note-body">
          <p>
            <strong>On nightly animal / community coins:</strong> Almost every day there&apos;s a nightly animal or community coin — if the narrative is good enough, it runs to at least $80k–$200k+.
          </p>
          <p>
            It&apos;s almost always an animal coin for the most part. Most traders notice this pattern and will bid it and <strong>hold</strong> if the narrative for the animal or community is good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #6</div>
        <div className="note-body">
          <p>
            <strong>When deciding whether to buy:</strong> Ask yourself — &quot;What else are you even going to buy right now?&quot; — when evaluating the coin and whether it&apos;s good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #7 — understanding incentives</div>
        <div className="note-body">
          <p>
            Traders on CT are here to extract the most possible with the least amount of effort. If someone is positioned in a good narrative and it migrates — if the coin is truly that good — they&apos;ll want to maximize profit. That means ideally it&apos;s a -EV move to dump their whole supply at $30k if they know the coin can go to at least $100k.
          </p>
          <p>
            <strong>For you:</strong> don&apos;t be afraid to buy at $40k if you believe it deserves $100k, just because you&apos;re scared of getting dumped on. If the narrative is good, it will hit its target.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #8</div>
        <div className="note-body">
          <p>
            <strong>On main vs PvP:</strong> When there&apos;s a main and then a PvP launches — if most people get wrecked on the main, they&apos;re less inclined to buy the PvP (down on the main, exhausted).
          </p>
          <p>Only buy the PvP if the PvP is actually valid, or you&apos;re able to quick-buy first tx.</p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #9</div>
        <div className="note-body">
          <p>
            <strong>Setup until 8 figures:</strong> Until you&apos;re at 8 figures where 3 SOL is essentially nothing, you most likely don&apos;t need a Twitter tracker — just Gem Bot on the left and Axiom on the right.
          </p>
          <p>
            If you&apos;re playing new pairs: hold <strong>X</strong> for tweet hover, then quick buy if the narrative is good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #10</div>
        <div className="note-body">
          <p>
            <strong>Remember you&apos;re buying memecoins:</strong> On new pairs — or buying coins in general — left-curve them a bit. If people don&apos;t buy, they don&apos;t like the joke (or what others may call the narrative).
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #11</div>
        <div className="note-body">
          <p>
            <strong>EU vs NA migration standards:</strong> Standards for coins to migrate are a lot lower in EU time vs NA time — less volume. If you see a coin in EU and think it&apos;s good enough to catch bids or run up, bid and hold until migration or about $15k–$20k.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #12</div>
        <div className="note-body">
          <p>
            <strong>Elon coin in EU time:</strong> If it&apos;s an Elon coin in EU and the tweet or narrative is centered — bid it and hold through migration, then hodl a bit. There is literally nothing else that will come out in EU time that will top it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #13</div>
        <div className="note-body">
          <p>
            <strong>First tx Elon / giga runners — EU window:</strong> Your best chance at first-txing an Elon narrative or a giga-million runner is EU time — roughly{" "}
            <strong>5pm–8am EST</strong>, mainly around the <strong>8pm EST</strong> mark.
          </p>
          <p>
            <strong>Case study:</strong> me first-txing ewon musk at $3.5k market cap, jeeting, and it went to $2M market cap.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #14</div>
        <div className="note-body">
          <p>
            <strong>Screen time for 100 SOL/day:</strong> Be online as long as possible every day if the goal is at least 100 SOL/day. From a numbers perspective — if you see most of the good coins each day and you&apos;re online to catch and bid them, the probability you make more money goes up (obviously with proper risk management, being selective, and actually <strong>holding</strong>).
          </p>
          <p>
            Screen time pays off, especially on a low port. If you&apos;re low on capital, the resource you have more of is <strong>time</strong> — use it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card">
        <div className="note-title">Travis tip #15</div>
        <div className="note-body">
          <p className="travis-tip-15-lead">
            If new pairs aren&apos;t your game — you don&apos;t have to play their game.
          </p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Don&apos;t fight DV &amp; Cupsey on new pairs</strong>
              <p>
                No need to scrap for 0.5–1 SOL on an $8k topper while they run 8 wallets. They mostly skip coins they don&apos;t already have floor on — that&apos;s new pairs.
              </p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Play the 200k topper game instead</strong>
              <p>Sit on your hands. Be patient. Bid real size on the 2–3</p>
              <p className="travis-tip-15-em-line">200k toppers</p>
              <p>at</p>
              <p className="travis-tip-15-em-line">$15k–$20k</p>
              <p>market cap.</p>
              <p>You&apos;ll likely make more SOL than grinding new pairs.</p>
              <p className="travis-tip-15-em-line">Quality over quantity.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Hold with conviction</strong>
              <p>
                Holding a narrative beats buying new pairs and dumping at $10k. That path teaches bad habits — and turns you into a jeet long term.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-16-card">
        <div className="note-title">Travis tip #16 — most important tip</div>
        <div className="note-body">
          <p className="travis-tip-16-lead">Trade during EU, Asia, and NA hours</p>
          <div className="travis-tip-16-sessions">
            {TRADE_HOURS_REGIONS.map((region) => (
              <div className="travis-tip-16-session" key={region.id}>
                <strong className="travis-tip-16-session-title">{region.session}</strong>
                <p className="travis-tip-16-time">{region.utc}</p>
                <p className="travis-tip-16-eq">=</p>
                <p className="travis-tip-16-time">{region.est}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-17-card">
        <div className="note-title">Travis tip #17</div>
        <div className="note-body">
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Front-run wallets — smart degen toasts on</strong>
              <p>
                Have any front-run wallets you track tagged with <strong className="travis-tip-17-em">smart degen toasts on</strong> so you see them immediately.
              </p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Wallet tracking — 1 SOL minimum on charts</strong>
              <p>
                For wallet tracking, set a <strong className="travis-tip-17-em">minimum 1 SOL buys</strong> filter on charts so you only see meaningful size — that&apos;s how you get <strong className="travis-tip-17-em">confluence</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-18-card">
        <div className="note-title">Travis tip #18</div>
        <div className="note-body">
          <p className="travis-tip-16-lead">During Asia and EU time — one of the only good narratives out right now.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Bid ~$20k on Gem Bot</strong>
              <p>
                Bidding at <strong className="travis-tip-17-em">$20k</strong> is safer on Gem Bot during these sessions — you can feel comfortable holding longer.
              </p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Less violent than NA</strong>
              <p>
                Fewer violent dips and sell-offs vs NA — people know it&apos;s lower volume and don&apos;t want to jeet or sell early.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-19-card">
        <div className="note-title">Travis tip #19</div>
        <div className="note-body">
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Undoxxed wallet</strong>
              <p>
                If you&apos;re an undoxxed wallet, your edge will be <strong className="travis-tip-17-em">wallet tracking</strong> and{" "}
                <strong className="travis-tip-17-em">front running</strong>.
              </p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Heavily tracked / doxxed wallet</strong>
              <p>
                If you&apos;re a heavily tracked doxxed wallet, your edge will be <strong className="travis-tip-17-em">flipping new pairs</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-20-card">
        <div className="note-title">Travis tip #20</div>
        <div className="note-body">
          <p className="travis-tip-16-lead">
            Most people on-chain don&apos;t trade like Cupsey or Cented — they&apos;re a small minority.
          </p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Undoxxed holders — buy &amp; hold narratives</strong>
              <p>
                Lots of people making money are undoxxed — one of the only ways they can make money is{" "}
                <strong className="travis-tip-17-em">buying and holding good narratives</strong>. Keep that in mind.
              </p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Not every coin is a $25k topper</strong>
              <p>
                Stop thinking every coin is a $25k topper. If it&apos;s actually good and consolidating in{" "}
                <strong className="travis-tip-17-em">final stretch before migration</strong>, don&apos;t be afraid to bid when you know for certain the narrative is good.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #21</div>
        <div className="note-body">
          <p>
            Instead of thinking whether this coin can migrate, evaluate the narrative itself — if it&apos;s good enough, migration is investable. All coins get brought up to the price they deserve.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #22</div>
        <div className="note-body">
          <p>
            Buy stuff where, when people see it pop up on migration, they will blast or bid. This is especially true when bidding those coins at ~$20k and scalping to sell for a 2-5x.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #23</div>
        <div className="note-body">
          <p>Red and green candles are a picture of the market&apos;s reaction to a coin.</p>
          <p>
            If there&apos;s a bunch of sell pressure early, early buyers don&apos;t like the narrative enough — they don&apos;t think it deserves to be held and will get destroyed before migration.
          </p>
          <p>
            If there&apos;s a lot of buy pressure, or a minimal absence of sell pressure with price slowly grinding up, the market deems the narrative or coin good enough to bond.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #24</div>
        <div className="note-body">
          <p>
            Trading and executing your game plan and edge should be <strong>extremely boring</strong> — never get high or low after a W. Execute like a robot, follow your plan, and <strong>WAIT</strong> for your setups and the looks you like.
          </p>
          <p>
            It&apos;s like basketball: you can&apos;t force shots — you have to let them come to you and take advantage of what the defense gives you.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #25</div>
        <div className="note-body">
          <p>
            <strong>As a mindset:</strong> It&apos;s almost never a lack of volume — it&apos;s almost always just a lack of good narratives available at the moment. There&apos;s millions of capital sidelined that is ready and waiting to blast once good or S-tier narratives pop up or arrive. (Ex: Elon getting a new dog and naming it.)
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #26</div>
        <div className="note-body">
          <p>
            Be <strong>absolutely cool</strong> with being boring and not doing anything for hours if there&apos;s nothing you deem good or you don&apos;t like the setup.
          </p>
          <p>
            <strong>Never</strong> buy things out of boredom or because you haven&apos;t bought anything for hours — sit on your hands.
          </p>
          <p>You do not have the entire chain tracking your wallet.</p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #27</div>
        <div className="note-body">
          <p>
            <strong>Most people do not want to trade like Cented and Cupsey.</strong> Understand that the vast majority of wallets and traders who are undoxxed and making money are <strong>front-running and wallet tracking.</strong>
          </p>
          <p className="travis-tip-footnote">
            Everyone is wallet tracking — that&apos;s how the large majority of undoxxed traders are making their money.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-28-card">
        <div className="note-title">Travis tip #28</div>
        <div className="note-body">
          <p className="travis-tip-28-lead">
            Whenever there&apos;s a new Gem Bot call, make it a <strong className="travis-tip-17-em">non-negotiable habit</strong> to read everything about the coin:
          </p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Do your homework before you bid</strong>
              <p>
                Tweet, website, ticker, picture, name — understanding the narrative. Always know exactly what you&apos;re buying and holding.
              </p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Case study</strong>
              <p>
                This is how I jeeted <strong className="travis-tip-17-em">$EWON</strong> and <strong className="travis-tip-17-em">$SCAM</strong> — just because I was too lazy to read the tweets and understand the narratives.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #29</div>
        <div className="note-body">
          <p>
            Make it a habit to start checking the <strong>Balanced</strong> tab frequently in Gem Bot when trading — win rate is higher.
          </p>
          <p>
            If the narrative is good and it shows up in Balanced, you can almost always get at least a <strong>1.5x</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #30</div>
        <div className="note-body">
          <p>
            To make money on a coin you know will go up, you may have to hold the coin <strong>longer than you&apos;re comfortable with</strong> to let the thesis play out.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #31</div>
        <div className="note-body">
          <p>
            When looking at a coin and evaluating, also keep in mind the <strong>dev wallet that launched</strong> — especially if you already have it tracked.
          </p>
          <p>If their previous coins went really high, that&apos;s a good sign. Other people will take that into account too.</p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #32</div>
        <div className="note-body">
          <p>
            If the narrative or tweet is overly <strong>complicated or convoluted</strong>, that doesn&apos;t mean the coin is bad — but people are more inclined to buy things where the narrative is <strong>simple and easy to understand</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #33</div>
        <div className="note-body">
          <p>
            If a lot of the other coins launching suck right now, the best coin — or the one that stands out the most — is more than likely going to be bid higher, as there&apos;s nothing else to buy comparatively speaking.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-34-card">
        <div className="note-title">Travis tip #34</div>
        <div className="note-body">
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Buy, set TP, walk away</strong>
              <p>
                If you identify a coin and you believe it&apos;s actually good — buy it and set take profit. Yeah, there may be some dips and it may fall below your entry on the way up. But don&apos;t be afraid to buy, set TP for a
              </p>
              <p className="travis-tip-15-em-line">1.5x</p>
              <p className="travis-tip-15-em-line">2x</p>
              <p>, and walk away from the computer.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Don&apos;t stare at dips</strong>
              <p>
                Staring at the chart obsessively on dips will more than likely cause you to jeet or sell early before the coin reaches its full potential.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #35</div>
        <div className="note-body">
          <p>
            For the most part, <strong>trust the market caps Gem Bot called the coins at</strong> — more than likely there is a reason. If the coin is good, it will go up over time.
          </p>
          <p>
            <strong>Main goal:</strong> stop fading decent coins that get called just because price action doesn&apos;t look the greatest.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-36-card">
        <div className="note-title">Travis tip #36</div>
        <div className="note-body">
          <p className="travis-tip-28-lead">
            Most new-pairs traders like <strong className="travis-tip-17-em">Cented</strong>, <strong className="travis-tip-17-em">DV</strong>, and{" "}
            <strong className="travis-tip-17-em">Cupsey</strong> dump at <strong className="travis-tip-17-em">$10k</strong> — however, sometimes there are narratives holding a tiny bit in the middle around <strong className="travis-tip-17-em">$9k</strong> where you still know the narrative is good.
          </p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Bid with them if you have capital</strong>
              <p>
                If you have the capital, don&apos;t be afraid to bid with them if you think it&apos;s good. If you get dumped on, you get dumped on — that&apos;s fine.
              </p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Early bid on a guaranteed (or almost guaranteed) runner</strong>
              <p>
                You&apos;ll win a good amount of the time off an early bid on a guaranteed runner or almost-guaranteed runner — especially true during slow markets and EU time.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #37</div>
        <div className="note-body">
          <p>
            Assume — <strong>most of the time, not all</strong> — that new-pairs traders, if the narrative is good, will try to hold or not dump a token that has bonding potential if it&apos;s actually good.
          </p>
          <p>
            Not always applicable in <strong>NA</strong>, but <strong>EU time</strong> this is true for a good majority of the time.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-38-card">
        <div className="note-title">Travis tip #38</div>
        <div className="note-body">
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Volume and coins come in waves</strong>
              <p>
                Volume and coins running throughout the day come in waves. If a coin runs and you miss it, you might have to wait a couple hours before the next good coin comes up — and that&apos;s okay.
              </p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Coins are like trains</strong>
              <p>There&apos;s always another one.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">There&apos;s always enough SOL</strong>
              <p>No matter what, there&apos;s enough Solana in a month to make</p>
              <p className="travis-tip-15-em-line">$100k/mo</p>
              <p>— and there&apos;s always enough Solana in a day to make at least</p>
              <p className="travis-tip-15-em-line">100 SOL a day</p>
              <p>.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #39</div>
        <div className="note-body">
          <p>
            Always have <strong>Cipher Telegram</strong> and <strong>Gem Bot</strong> open when trading — and always be watching your <strong>wallet tracker</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #40</div>
        <div className="note-body">
          <p>
            Always be <strong>actively scanning</strong>. If you&apos;re passive when trading or scanning, you&apos;re wasting your time.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-41-card">
        <div className="note-title">Travis tip #41</div>
        <div className="note-body">
          <p className="travis-tip-28-lead">
            <strong className="travis-tip-17-em">Stop jeeting Gem Bot calls so early.</strong> Even if it dips a lot, if the narrative is decent — not everything is only up. Dips are okay.
          </p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Be firm and hold</strong>
              <p>Know that you&apos;re early since you&apos;re using Gem Bot.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-42-card">
        <div className="note-title">Travis tip #42</div>
        <div className="note-body">
          <p className="travis-tip-28-lead">
            <strong className="travis-tip-17-em">Tweet plays and Elon tweets</strong> will get sniped and often do a{" "}
            <strong className="travis-tip-17-em">Christmas tree</strong> pattern — that&apos;s because all the first-tx buyers dumped.
          </p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Bid the bottom and hold</strong>
              <p>If the narrative is good, bid the bottom and hold. Most people will buy it back up if it&apos;s decent.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #43</div>
        <div className="note-body">
          <p>
            If you want consistent <strong>$100k months</strong>, keep farming <strong>2–3x</strong> with the occasional hold for a <strong>7x+</strong> on good narratives — do that over and over until <strong>100 SOL days</strong> are easy.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #44</div>
        <div className="note-body">
          <p>
            Occasionally check the <strong>Gem Bot trending</strong> page for coins that were called a while ago but are doing slow climbs / run-ups.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #45</div>
        <div className="note-body">
          <p>
            For your mental health, don&apos;t check <strong>Twitter</strong>, <strong>TikTok</strong>, <strong>Instagram</strong>, or <strong>Kolscan</strong> — so you can stop comparing yourself.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-46-card">
        <div className="note-title">Travis tip #46</div>
        <div className="note-body">
          <p className="travis-tip-28-lead">
            <strong className="travis-tip-17-em">Wallet tracking exits:</strong> if you enter because you see a wallet you like in, don&apos;t automatically jeet just because you see them sell.
          </p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Evaluate your own exit</strong>
              <p>You don&apos;t know their plan — decide on your own terms.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #47</div>
        <div className="note-body">
          <p>
            If you&apos;re looking at a coin and you see a <strong>skinny chart</strong> — sell candles are small, buy candles are small, but the chart is <strong>rapidly moving up</strong> — you might be in a runner.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #48</div>
        <div className="note-body">
          <p>Don&apos;t be afraid to take risks bidding a coin to grow your port.</p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #49</div>
        <div className="note-body">
          <p>
            Once you smash through low-port psychology and fear, that&apos;s when you can start going faster and bidding more coins without being scared it goes to zero.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #50</div>
        <div className="note-body">
          <p>
            I&apos;m pretty much online for almost every runner — I just have to be not afraid to bid it. <strong>(Based on past experience.)</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #51</div>
        <div className="note-body">
          <p>
            When buying or holding a coin, if you think <strong>&quot;this needs a DEX payment and this goes&quot;</strong> — you should most likely hold the coin for a bit.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card travis-tip-52-card">
        <div className="note-title">Travis tip #52</div>
        <div className="note-body">
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Get exposure when you&apos;re scared</strong>
              <p>
                If you see a coin that&apos;s good and you&apos;re afraid to enter, get some exposure to it through your{" "}
                <strong className="travis-tip-17-em">Solana-funded account</strong>.
              </p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Pick your mode for the day</strong>
              <p>Decide how you&apos;re going to trade for the day:</p>
              <p className="travis-tip-15-em-line">live trading</p>
              <p>or</p>
              <p className="travis-tip-15-em-line">funded account</p>
              <p>.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #53</div>
        <div className="note-body">
          <p>
            Don&apos;t get fudded out of entering if you see flipper or dumper KOLs in the mix with your front-run wallets — especially on a runner. If the narrative is good, that&apos;s a reason they&apos;re bidding or blasting high.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #54</div>
        <div className="note-body">
          <p>
            <strong>New Pairs</strong> (NA and EU) on weekends is not bad — bundle snipers still exist, but people let good narratives run a bit.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #55</div>
        <div className="note-body">
          <p>
            You can&apos;t assume every <strong>new pair</strong> is going to be a <strong>bundle drill</strong> — that mindset prevents you from buying.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #56</div>
        <div className="note-body">
          <p>
            On <strong>New Pairs</strong>, it&apos;s <strong>quick buy or no buy</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #57</div>
        <div className="note-body">
          <p>
            Don&apos;t strain your brain on <strong>new pairs</strong> overthinking every narrative — let it come to you. <strong>Conserve your energy.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #58</div>
        <div className="note-body">
          <p>
            Trust your own <strong>narrative analysis</strong> &amp; <strong>conviction</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #59</div>
        <div className="note-body">
          <p>
            Be grateful for the smaller days — even if it&apos;s only like <strong>5–20 SOL.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #60 — trade like Shai</div>
        <div className="note-body">
          <p>
            Get to your spots — don&apos;t force trades. Let the good narratives come to you and <strong>be open.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #61</div>
        <div className="note-body">
          <p>
            <strong>New Pairs:</strong> wait for actual good narratives.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #62</div>
        <div className="note-body">
          <p>
            Don&apos;t get shaken out or scared when you see <strong>cented</strong> buy with you on a new pair.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #63</div>
        <div className="note-body">
          <p>
            Watch the <strong>trades panel</strong> and tracked wallets for bid sizes above <strong>3–5 SOL</strong> — that usually means they like the narrative.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #64 — final stretch</div>
        <div className="note-body">
          <p>
            Look for coins where momentum is <strong>only up</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #65</div>
        <div className="note-body">
          <p>
            Trade the <strong>narratives</strong>, not the price action.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #66</div>
        <div className="note-body">
          <p>
            People are always looking for something to buy at <strong>migration</strong> if the narrative is good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #67 — final stretch</div>
        <div className="note-body">
          <p>
            Look for things that have been chilling on <strong>Final Stretch</strong> for a minute — consolidating, haven&apos;t been dumped — especially if you catch it in your peripheral while you were staring at new pairs.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #68 — final stretch</div>
        <div className="note-body">
          <p>
            If you&apos;re on <strong>Final Stretch</strong> and see a smart degen wallet who bought earlier — and you&apos;re contemplating buying — if you have the port, <strong>take a punt at it.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #69</div>
        <div className="note-body">
          <p>
            Understand <strong>volume vamps</strong> — if something is running a lot of the volume, CT is focused on that one thing and it may not be the one you&apos;re currently staring at.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #70</div>
        <div className="note-body">
          <p>
            Be able to switch your mindset and targets from <strong>New Pairs thinking</strong> to <strong>holding quickly</strong> if you see something on Final Stretch that you have a feeling can go.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #71</div>
        <div className="note-body">
          <p>
            Stop jeeting a new pair because you&apos;re afraid of getting <strong>full stacked</strong> on — or because you see a known KOL flipper buy after you. Hold it a bit. This gets easier as your port gets bigger.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #72 — new pairs</div>
        <div className="note-body">
          <p>
            On <strong>New Pairs</strong>: buy, then research more.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #73 — new pairs</div>
        <div className="note-body">
          <p>
            Hundreds of people are staring at <strong>new pairs</strong> waiting for something good or different.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #74 — new pairs</div>
        <div className="note-body">
          <p>
            On <strong>New Pairs</strong> you&apos;re evaluating the narrative based on the tweet or context, then quickly deciding if picture, name, ticker, and packaging are good on the coin — then buying.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #75 — new pairs</div>
        <div className="note-body">
          <p>
            On <strong>New Pairs</strong>, good narratives won&apos;t get destroyed to complete zero immediately if it&apos;s good — unless you quick-bought a <strong>bundle snipe that&apos;s through</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #76 — new pairs</div>
        <div className="note-body">
          <p>
            If you&apos;re going to play <strong>new pairs</strong>, you can print a calm <strong>20–100 SOL a day</strong> only buying good-quality new pairs and not slop — on a single wallet, without risking too much of your port every play.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #77</div>
        <div className="note-body">
          <p>
            If you see <strong>vamps</strong> or <strong>PvP</strong>, sometimes it&apos;s bullish for the main narratives — it kinda validates the main more.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #78 — new pairs</div>
        <div className="note-body">
          <p>
            Most people&apos;s mindset on <strong>new pairs</strong> is to try to be early to good narratives and hold a bit.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #79 — new pairs</div>
        <div className="note-body">
          <p>
            Most people won&apos;t want to destroy a coin/narrative on <strong>new pairs</strong> if it&apos;s good — they want to let it run for a bit.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #80 — new pairs</div>
        <div className="note-body">
          <p>
            On <strong>New Pairs</strong>, trade the narrative — not the chart or price action.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #81 — new pairs</div>
        <div className="note-body">
          <p>
            Don&apos;t FOMO or fall for <strong>fake vol</strong> on new pairs — <strong>snipe bundles</strong>. Most new pairs are never worth top blast FOMOing into; you risk a worse entry.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #82</div>
        <div className="note-body">
          <p>
            If you buy something and it goes up really fast, don&apos;t just jeet it — it probably means it&apos;s really good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #83 — new pairs</div>
        <div className="note-body">
          <p>
            Do <strong>not</strong> play new pairs when my mom is home and wants me doing stuff.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #84</div>
        <div className="note-body">
          <p>
            Actually <strong>understand the narrative</strong> before buying.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #85 — new pairs</div>
        <div className="note-body">
          <p>
            Be wary of <strong>new pairs</strong> that get crazy vol and market cap rising when they literally came out a second ago — most of the time it&apos;s <strong>sniper farms and bundling</strong>. Real vol isn&apos;t that crazy; new pairs don&apos;t get instantly bought up by more than 15 people at once organically.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #86 — final stretch</div>
        <div className="note-body">
          <p>
            Don&apos;t FOMO on <strong>Final Stretch</strong> unless the narrative is actually good and you can see buy pressure pushing it to <strong>migration.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #87</div>
        <div className="note-body">
          <p>
            Don&apos;t buy from <strong>poor devs</strong> — unprofitable, or if <strong>Absol</strong> is getting rekt. Don&apos;t buy an Absol deploy unless the narrative is good — he&apos;ll start deploying slop when he&apos;s taken losses.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #88</div>
        <div className="note-body">
          <p>
            Never get <strong>attached</strong> to coins and their prices.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #89</div>
        <div className="note-body">
          <p>
            <strong>Scared money don&apos;t make money.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #90 — migration plays</div>
        <div className="note-body">
          <p>
            On <strong>migration plays</strong>, if you know where the narrative can go higher, it&apos;s ranging a bit, and <strong>Gem Bot</strong> called it at that exact market cap — take a chance at bidding it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-4-card">
        <div className="note-title">Travis tip #91 — scanning coins</div>
        <div className="note-body">
          <p className="travis-tip-4-lead">When scanning coins, in order of priority:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                1
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Tweet / narrative</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                2
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Picture</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                3
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Ticker</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                4
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Coin name</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #92</div>
        <div className="note-body">
          <p>
            Read the <strong>whole tweet</strong> when buying the token.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #93</div>
        <div className="note-body">
          <p>
            Never trade <strong>angry</strong> or <strong>desperate</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #94</div>
        <div className="note-body">
          <p>
            Let other people <strong>move coins up for you</strong> — KOLs who are heavily tracked — assuming you get in <strong>before them</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #95 — tweet plays</div>
        <div className="note-body">
          <p>
            Expect <strong>migration dumps</strong> on tweet plays — but if it&apos;s good, it will reverse.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card">
        <div className="note-title">Travis tip #96 — who won&apos;t dump on each other</div>
        <div className="note-body">
          <p className="travis-tip-15-lead">
            Understand who&apos;s friends with who and who won&apos;t dump on each other:
          </p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Group A</strong>
              <p>Cupsey, DV, Jack Duval, Ethan Prosper, Kreo, Waddles</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Group B</strong>
              <p>Cented, Kadenox, Sliderrzz</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Group C</strong>
              <p>Til Crypto, Absol Quant</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #97</div>
        <div className="note-body">
          <p>
            Decide on playing <strong>one style at a time</strong>, not two — <strong>New Pairs</strong> or <strong>Final Stretch</strong> holds.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #98</div>
        <div className="note-body">
          <p>
            Not every bit of sell pressure is a <strong>full stack</strong> — sometimes it&apos;s just people taking partials.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #99</div>
        <div className="note-body">
          <p>
            Not everything is a <strong>10k topper</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #100</div>
        <div className="note-body">
          <p>
            A bit of <strong>sell pressure</strong> if you&apos;re early is normal — don&apos;t jeet your whole bag because of it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #101</div>
        <div className="note-body">
          <p>
            If the rate of good coins coming out is slow and volume is a bit low — and you&apos;re in a good narrative early — people are less likely to jeet on you, since they&apos;ll have to wait until the next good one comes out.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #102</div>
        <div className="note-body">
          <p>
            If the narrative is good, don&apos;t get <strong>fudded out</strong> by bundles and snipes in the beginning.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #103</div>
        <div className="note-body">
          <p>
            <strong>Narratives</strong> and potential <strong>future catalysts</strong> are what drive price up.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #104</div>
        <div className="note-body">
          <p>
            Don&apos;t let a previous loss prevent you from taking a chance on a new good coin.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #105 — new pairs</div>
        <div className="note-body">
          <p>
            On <strong>New Pairs</strong>, wait for something good — your only mindset should be looking for <strong>good narratives</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #106</div>
        <div className="note-body">
          <p>
            Never trade when my mom makes me angry for the day.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #107 — gem bot</div>
        <div className="note-body">
          <p>
            Take note of coins that get called on <strong>Gem Bot</strong> where the chart looks a bit weird — it might be <strong>crimed up</strong>. You could potentially profit on it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #108</div>
        <div className="note-body">
          <p>
            If you see a variety of different tracked wallets bidding on the way up, the coin is probably pretty good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #109 — new pairs</div>
        <div className="note-body">
          <p>
            Never get FOMO on <strong>new pairs</strong> — you don&apos;t have to be in 100 new pairs a day. That&apos;s how you get chopped up.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #110</div>
        <div className="note-body">
          <p>
            Always think about the narrative when trading a coin — that means reading the tweet.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #111</div>
        <div className="note-body">
          <p>
            Always start out with a <strong>daily trading budget</strong> and a <strong>daily stop loss</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #112</div>
        <div className="note-body">
          <p>
            Stop giving a fuck about other traders&apos; PnLs on the day, week, or month — it does nothing for you. It just distracts you and makes you feel bad.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #113</div>
        <div className="note-body">
          <p>
            Liquidity is always moving enough to where you can make at least <strong>250 SOL a day</strong> — you just have to be positioned accordingly and hold.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #114</div>
        <div className="note-body">
          <p>
            If you see a coin and you&apos;re thinking about front running <strong>Gem Bot</strong>, just hold and wait for <strong>Gem Bot</strong> to officially call it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #115</div>
        <div className="note-body">
          <p>
            If you&apos;re not seeing a lot of <strong>front-run wallets</strong> in your token, it might not be a great coin you can hold for a bit.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #116</div>
        <div className="note-body">
          <p>
            You just have to hold a coin successfully once to know you can do it multiple times. Just have to be cool with the dips.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #117</div>
        <div className="note-body">
          <p>
            Ideally buy coins and narratives you&apos;ve never seen before that are good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #118</div>
        <div className="note-body">
          <p>
            When you grow your port to a bigger size, start tailing some <strong>front-run wallets</strong> more.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #119</div>
        <div className="note-body">
          <p>
            Sometimes zoom out on the chart if you&apos;re thinking of selling because of dips.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #120</div>
        <div className="note-body">
          <p>
            If you see a coin/narrative you DD on and you can immediately get bullish on it and be like &quot;this is so good,&quot; you should definitely hold the coin for a bit — even through the expected <strong>post-migration dump</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #121</div>
        <div className="note-body">
          <p>
            Look at the <strong>trades panel</strong> and the <strong>bid buy sizes</strong> — if it&apos;s like <strong>5+ SOL</strong> a trade or 2 traders think this can double. Only applicable if the narrative is objectively good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #122</div>
        <div className="note-body">
          <p>
            Check the <strong>dev wallet</strong> for <strong>past launched tokens</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #123</div>
        <div className="note-body">
          <p>
            Don&apos;t blindly ape <strong>balanced calls</strong> — check if they&apos;re good first.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #124</div>
        <div className="note-body">
          <p>
            Be cautious of calls from <strong>Gembot</strong> on <strong>newer coins</strong> — they could be good, but watch for a lot of <strong>KOLs</strong> and <strong>multi-wallet supply</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #125</div>
        <div className="note-body">
          <p>
            Buy <strong>narratives</strong> people would want to <strong>buy and hold</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #126</div>
        <div className="note-body">
          <p>
            Stop <strong>mid-curving coins</strong> — <strong>average trencher on-chain</strong> is dumb af.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #127</div>
        <div className="note-body">
          <p>
            <strong>Thesis</strong> should be <strong>simple</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #128</div>
        <div className="note-body">
          <p>
            Watch for coins that enter <strong>Gembot trending</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #129 — final stretch</div>
        <div className="note-body">
          <p>
            If you get <strong>early entry</strong> on something at like <strong>20–60k</strong> and it&apos;s a <strong>Final Stretch</strong> coin and you know it&apos;s good — <strong>hold</strong> and don&apos;t sell until it&apos;s almost certain it&apos;s hitting <strong>near zero</strong> at some point.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #130</div>
        <div className="note-body">
          <p>
            If you see a good coin on <strong>Gembot</strong>, bid it — doesn&apos;t matter if you bid on <strong>live</strong> or <strong>funded</strong>. You&apos;re not poor; you have <strong>capital</strong>, so stop acting like you don&apos;t.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #131 — new pairs / final stretch</div>
        <div className="note-body">
          <p>
            When <strong>volume</strong> is low on <strong>new pairs</strong> or there&apos;s a lack of good narratives, people will just end up bidding the <strong>Final Stretch</strong> cooks to <strong>migration</strong> — most of these are/can be <strong>Gembot</strong> calls.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #132</div>
        <div className="note-body">
          <p>
            Try to <strong>front-run Gembot</strong> when you can and you have the <strong>port</strong> to allow it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #133</div>
        <div className="note-body">
          <p>
            If a coin is <strong>consolidating</strong> and almost none of the <strong>top holders</strong> are <strong>in profit</strong>, it&apos;s gonna <strong>dump</strong> more — more than likely.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #134</div>
        <div className="note-body">
          <p>
            Don&apos;t buy <strong>slop deploys</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #135</div>
        <div className="note-body">
          <p>
            If you want exposure to a coin, your <strong>bid size</strong> should be in proportion to your <strong>confidence</strong> and how long you&apos;re <strong>willing to hold</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #136</div>
        <div className="note-body">
          <p>
            Take note of those <strong>.sol wallets</strong> on my tracker — especially when they bid <strong>2–3 SOL</strong>. For some reason they&apos;re <strong>early</strong> on a lot of <strong>narratives</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #137</div>
        <div className="note-body">
          <p>
            Don&apos;t be afraid to play <strong>metas</strong> and <strong>derivs</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #138</div>
        <div className="note-body">
          <p>
            Bid coins where, if they were to <strong>migrate</strong>, they <strong>stand out</strong> compared to others — where people have <strong>no choice but to bid</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #139</div>
        <div className="note-body">
          <p>
            Don&apos;t ignore the <strong>top trader wallets</strong> I have tracked — <strong>front run</strong> them. They are top traders for a reason: they identified good coins early and held. Don&apos;t copy trade them, but use them for <strong>confluence</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #140</div>
        <div className="note-body">
          <p>
            Don&apos;t ignore the <strong>.sol wallets</strong> I have tracked either.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #141</div>
        <div className="note-body">
          <p>
            <strong>Top 10, 20, 100 holders</strong> I have tracked could just be wallets who bought, <strong>round tripped</strong>, and forgot — not the case all the time, but keep in mind.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #142</div>
        <div className="note-body">
          <p>
            Only buy stuff where you know at minimum you can make <strong>1 SOL</strong> on them.
          </p>
          <p>
            Even in the worst case — if you <strong>round trip</strong> — you&apos;re cool with only making <strong>1 SOL</strong> on it or max losing <strong>1 SOL</strong> on it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #143</div>
        <div className="note-body">
          <p>
            If I&apos;m gonna track <strong>top wallets</strong>, only keep them on if their X&apos;s are <strong>500%+</strong> or PNL is <strong>$40k+</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #144</div>
        <div className="note-body">
          <p>
            Bid coins where the <strong>narrative</strong> makes people <strong>feel something</strong> — an emotion like <strong>happiness, warmth</strong>, or feeling bad like it&apos;s a <strong>sad story</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #145</div>
        <div className="note-body">
          <p>
            Always check <strong>website</strong> and <strong>social</strong> on a coin — if it looks good, there will be <strong>buyers on top of you</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #146</div>
        <div className="note-body">
          <p>
            Before you buy a coin, ask yourself: will you get a couple <strong>buyers on top of you</strong>?
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #147</div>
        <div className="note-body">
          <p>
            Don&apos;t just enter a trade because of a <strong>single wallet</strong> — you need <strong>confluence.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #148</div>
        <div className="note-body">
          <p>
            Up until a couple thousand <strong>SOL</strong> and you move out, just stalk <strong>Gem Bot</strong> and wait for something good.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #149</div>
        <div className="note-body">
          <p>
            Don&apos;t try to predict price — that&apos;s not your job. Play <strong>narrative</strong> and <strong>flow</strong>; don&apos;t try to time the top. <strong>Take profits on the way up</strong> so even if you lose, your <strong>downside is mitigated.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #150</div>
        <div className="note-body">
          <p>
            If you see a <strong>skinny chart</strong> pattern run up with very little sells, it&apos;s probably <strong>crime</strong> — so you should bid it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #151</div>
        <div className="note-body">
          <p>
            If you can&apos;t hold your position, you probably <strong>sized in way too much.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #152</div>
        <div className="note-body">
          <p>
            If you see less than a <strong>15 minute</strong> difference between <strong>bonded coin times</strong> on <strong>migration</strong>, that means <strong>volume is good.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #153</div>
        <div className="note-body">
          <p>
            Don&apos;t be afraid to bid <strong>pico bottom</strong> on coins that are <strong>dipping</strong> — just make sure you do it in a <strong>size that doesn&apos;t wreck you</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #154</div>
        <div className="note-body">
          <p>
            Buy stuff people <strong>won&apos;t want to destroy pre migration</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #155</div>
        <div className="note-body">
          <p>
            As long as you have <strong>3–4 wins</strong> for every <strong>1 loss</strong>, you can <strong>scale your port infinitely</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #156</div>
        <div className="note-body">
          <p>
            Stop thinking too much about the <strong>downside</strong> before entering a trade — think of the <strong>upside potential gain</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #157</div>
        <div className="note-body">
          <p>
            Control your <strong>ADHD</strong> and <strong>hold coins</strong> — even if volume is slow or fast, you don&apos;t have to <strong>schizo press every button</strong> just because the coin went up or <strong>dipped a bit</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #158 — new pairs</div>
        <div className="note-body">
          <p>
            If you&apos;re on <strong>new pairs</strong>, even if you have <strong>tracked wallets turned off</strong>, don&apos;t <strong>jeet</strong> just because you don&apos;t see <strong>tracks on the chart.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #159</div>
        <div className="note-body">
          <p>
            Make <strong>minimum buy size 0.8</strong> on charts.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #160</div>
        <div className="note-body">
          <p>
            Sometimes you&apos;ll just be <strong>too early</strong> to a coin — <strong>it is what it is.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #161</div>
        <div className="note-body">
          <p>
            Don&apos;t let anyone shame you for being a <strong>good trader</strong> and <strong>profitable</strong> — you&apos;re here to <strong>make money.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #162 — new pairs</div>
        <div className="note-body">
          <p>
            On <strong>new pairs</strong>, make sure you have every <strong>tracked wallet toggled on</strong> — you need to know <strong>who&apos;s in your coin</strong> and <strong>who can destroy the chart</strong> on you.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #163 — new pairs</div>
        <div className="note-body">
          <p>
            Just &apos;cause you <strong>quick buy</strong> a <strong>new pair</strong> and you see <strong>Cented buy</strong> right after you doesn&apos;t mean he&apos;s gonna automatically <strong>dump on you</strong> — you don&apos;t have to <strong>jeet your position</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #164</div>
        <div className="note-body">
          <p>
            If you see a <strong>smart degen wallet</strong> that <strong>bid early</strong> and it&apos;s <strong>ranging pre migration</strong>, look into it.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #165</div>
        <div className="note-body">
          <p>
            Sometimes coins are just <strong>not worth migrating</strong> — and that&apos;s okay. You can <strong>sit on your hands</strong> for a bit; you don&apos;t need to <strong>bid everything</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #166 — new pairs</div>
        <div className="note-body">
          <p>
            Do <strong>not</strong> try to bid in the <strong>12k range</strong> on those <strong>new pairs rainbow charts</strong>. However, <strong>do bid</strong> on those <strong>slower run up coins</strong> where there&apos;s not a crazy amount of <strong>sell pressure from multi wallets</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #167</div>
        <div className="note-body">
          <p>
            After enough time on the charts, you can tell when something is a <strong>multi wallet through bundle</strong> based on <strong>price action</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #168</div>
        <div className="note-body">
          <p>
            Not every retrace is <strong>permanent</strong> — sometimes it&apos;s <strong>temporary</strong> or a <strong>shakeout</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #169</div>
        <div className="note-body">
          <p>
            On <strong>new pairs</strong>, <strong>final stretch</strong>, and <strong>migrated</strong> — most people have the <strong>same filters</strong>, so if you see something that&apos;s good and know it&apos;s good, <strong>other people will see it</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #170</div>
        <div className="note-body">
          <p>
            If it&apos;s an <strong>agent mode narrative</strong> and <strong>agent mode</strong> just now starts turning on — you can <strong>bid it</strong> when it just turns on, and most of the time it <strong>goes up</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #171 — new pairs / final stretch</div>
        <div className="note-body">
          <p>
            If you&apos;re scanning <strong>new pairs</strong> and nothing good is coming out, but you see something <strong>holding strong on final stretch</strong> and it&apos;s a <strong>good narrative</strong> — <strong>bid it</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis tip #172</div>
        <div className="note-body">
          <p>
            You actually need to be an <strong>active participant</strong> and <strong>pay attention</strong> when you&apos;re trading memecoins — always be <strong>scanning</strong>, always be <strong>hunting for opportunities</strong> to make money. <strong>Fast &amp; slow things.</strong>
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-4-card">
        <div className="note-title">Travis quick analysis acronym — CORTA</div>
        <div className="note-body">
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                C
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Community/Charity</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                O
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Original / Unique</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                R
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Relevant</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                T
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Tech</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                A
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Animal</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis gem bot tip</div>
        <div className="note-body">
          <p>
            If you see the 🔥 on <strong>Gem Bot</strong> and it&apos;s on the <strong>2x filter</strong> stat — start taking more bids.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis gem bot tip</div>
        <div className="note-body">
          <p>
            Take note of the <strong>average</strong>, the <strong>median</strong>, and the <strong>symbol</strong> next to the <strong>Risky</strong>, <strong>Balanced</strong>, and <strong>Conservative</strong> sections.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis gem bot tip</div>
        <div className="note-body">
          <p>
            If you&apos;re in a position, stop cutting it so early because you&apos;re scared it&apos;s gonna top or go down — <strong>let it breathe</strong> a bit.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis gem bot tip</div>
        <div className="note-body">
          <p>
            Understand whether coins are hitting <strong>2–3x</strong> because of <strong>new pairs / KOL volume</strong> or <strong>community slow cook volume</strong>. If it&apos;s <strong>community slow cook volume</strong> — start bidding <strong>Final Stretch</strong>. If it&apos;s coming from <strong>new pairs / KOL volume</strong> — start bidding <strong>new pairs</strong>.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis gem bot tip</div>
        <div className="note-body">
          <p>
            Keep in mind the <strong>up/down multiple %</strong> to the left of the <strong>peak</strong> on <strong>Gem Bot</strong> calls.
          </p>
        </div>
      </div>
      <div className="note-card travis-tip-card">
        <div className="note-title">Travis gem bot tip</div>
        <div className="note-body">
          <p>
            Watch for coins where if you&apos;re holding them and they enter the <strong>Gem Bot trending page</strong> — if they&apos;re good, the coin will get <strong>blasted</strong> or at least <strong>bid up some more</strong>.
          </p>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Playing new pairs — @bigwarzeth</div>
        <div className="note-body">
          Source: <a href="https://x.com/bigwarzeth" target="_blank" rel="noopener noreferrer">@bigwarzeth on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>I have genuine respect for anyone who can trench new launches all day right now.</p>
            <p>Not because I think you&apos;re smart but because I genuinely don&apos;t understand how you do it.</p>
            <p>It&apos;s the same trash repackaged as slightly different trash every few minutes.</p>
            <p><strong>Pattern recognition helps.</strong></p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Making decisions — @IAmAlenSultanic</div>
        <div className="note-body">
          Source: <a href="https://x.com/IAmAlenSultanic" target="_blank" rel="noopener noreferrer">@IAmAlenSultanic on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>If there&apos;s one ability you need to succeed, it&apos;s the ability to make decisions.</p>
            <p>Most people are terrible at making decisions, and that&apos;s why people who are good at making decisions end up making decisions for them.</p>
            <p>They decide what they work on.</p>
            <p>When they show up.</p>
            <p>When they take lunch.</p>
            <p>When they clock out.</p>
            <p>And how much they get paid.</p>
            <p>Get good at making decisions, or someone will make them for you.</p>
            <p>— Alen</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">High quality decisions — Jeff Bezos</div>
        <div className="note-body">
          Source: Jeff Bezos
          <div className="pullupso-quote decu-advice-quote">
            <p>
              Bezos said that as a senior executive: &quot;you get paid to make a <strong>small number of high quality decisions</strong>.&quot; He then added: &quot;If I make, like, <strong>three good decisions a day</strong>, that&apos;s enough. And they should be as <strong>high quality</strong> as I can make them.&quot;
            </p>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card">
        <div className="note-title">Mental note — funded vs live blocks</div>
        <div className="note-body">
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Plan the day before you trade</strong>
              <p>Decide which blocks you&apos;ll grind your <strong>funded account</strong> and when you&apos;ll grind <strong>live</strong>.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Funded first</strong>
              <p>Prioritize getting your <strong>payout</strong> and passing your <strong>eval profit target</strong> for the day before grinding live.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-4-card">
        <div className="note-title">3 parts to trading a coin</div>
        <div className="note-body">
          <p className="travis-tip-4-lead">
            There are <strong className="travis-tip-4-em">3 parts</strong> to trading a coin:
          </p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                1
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Identifying the narrative</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                2
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Deciding whether it&apos;s worth a buy</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                3
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Determining how high it can go</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Playing the game right (tontheneko)</div>
        <div className="note-body">
          Source: <a href="https://x.com/tontheneko" target="_blank" rel="noopener noreferrer">@tontheneko on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>&quot;This is completely wrong, and you easily can.&quot;</p>
            <p>You just need to play the game right.</p>
            <p><strong className="travis-tip-15-section-title">Playing the game right means:</strong></p>
          </div>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                ·
              </span>
              <div>
                <strong className="travis-tip-4-item-title">You shouldn&apos;t gamble.</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                ·
              </span>
              <div>
                <strong className="travis-tip-4-item-title">You should have patience.</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                ·
              </span>
              <div>
                <strong className="travis-tip-4-item-title">You should understand what you are buying.</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                ·
              </span>
              <div>
                <strong className="travis-tip-4-item-title">You should take profits.</strong>
              </div>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              These are also how I used to trade. I currently don&apos;t trade like this — I only know what I&apos;m buying and the rest I don&apos;t do. Take lessons from your own and others&apos; mistakes.
            </p>
            <p>
              If you spare time to learn and have patience to hold good things you believe in — instead of gambling and rotating all the time (after understanding what you buy) — you can easily turn <strong>$1.5k to $300k</strong> in memecoins. Maybe not in 10 days, maybe in 100 days — but that&apos;s still a gain no other place can offer.
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Stay feeling broke (theisaacsomto)</div>
        <div className="note-body">
          Source: <a href="https://x.com/theisaacsomto" target="_blank" rel="noopener noreferrer">@theisaacsomto on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>When money starts coming in, keep buying things — assets preferably.</p>
            <p>Stay feeling broke — it&apos;ll fuel the grind.</p>
            <p>A huge sum sitting in your wallet is a dangerous illusion of safety tbh.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Paper trade first (WhiteWhaleLabs)</div>
        <div className="note-body">
          Source: <a href="https://x.com/WhiteWhaleLabs" target="_blank" rel="noopener noreferrer">@WhiteWhaleLabs on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              If every person new to crypto was forced to paper trade their first 3–12 months, we would have many more crypto millionaires. Unfortunately the tuition in this space is some of the highest on the planet.
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Exiting your 20s (0xGhostRider)</div>
        <div className="note-body">
          Source: <a href="https://x.com/0xghostrider" target="_blank" rel="noopener noreferrer">@0xGhostRider on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>You want to exit your 20s under the following circumstances:</p>
          </div>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Zero&apos;d out from experimenting</strong>
              <p>47 careers, multiple full-throttle business attempts, indiscriminate risk on trades/wagers, abundance of life wisdom, wildly desensitized to numbers on screen.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Massive momentum in one realm</strong>
              <p>About to print a ton of bread and lay foundation for early 30s.</p>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>Definitely don&apos;t want to land on a massive bag of cash at 22 — almost guaranteed you eject and blow it all, end up mentally ill.</p>
            <p>Also don&apos;t want to emerge at 30 without any battle scars and having played it even remotely safe.</p>
            <p>Middle always cucked.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">What kind of memecoin trader are you? (pongsie100x)</div>
        <div className="note-body">
          Source: <a href="https://x.com/pongsie100x" target="_blank" rel="noopener noreferrer">@pongsie100x on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              You need to decide what kind of <strong>memecoin trader</strong> you are:
            </p>
          </div>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                ·
              </span>
              <div>
                <strong className="travis-tip-4-item-title">10 losses, one runner</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                ·
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Quick profit flips</strong>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">
                ·
              </span>
              <div>
                <strong className="travis-tip-4-item-title">Holding community projects</strong>
              </div>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>Don&apos;t try to be all 3 — focus on one.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Ask why it pumped or dumped (himgajria)</div>
        <div className="note-body">
          Source: <a href="https://x.com/himgajria" target="_blank" rel="noopener noreferrer">@himgajria on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              As a trader, anything that pumps or dumps — regardless of whether you were in it — creates an obligation to ask why, save its pattern in your mental models, and make sure you don&apos;t miss the next one.
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Buy what others will think is good (dxrnell)</div>
        <div className="note-body">
          Source: <a href="https://x.com/dxrnell" target="_blank" rel="noopener noreferrer">@dxrnell on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              Stop buying memecoins because you think they&apos;re good. Start buying them because you think other people will think they&apos;re good. Those are two completely different things.
            </p>
            <p>
              You might think a coin is terrible — but if it resonates with a crowd it can run to millions. You might think a coin is incredible — but if nobody else agrees, your thesis is worthless.
            </p>
            <p>
              The market doesn&apos;t care about your opinion. It cares about <strong>collective attention</strong>.
            </p>
            <p>
              People believed a dog in a hat shouldn&apos;t be worth billions — but it was, because a larger group of people thought it was. Your job is to <strong>predict what other people will want</strong>.
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">10 SOL → 500 SOL in 6 weeks (kreo444 thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/kreo444" target="_blank" rel="noopener noreferrer">@kreo444 on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              I went from 10 SOL (~$1,800 at the time) to 500 SOL (~$100,000) in a month and a half. Experience and lessons in this thread.
            </p>
            <p>
              99% of coins are scams or trash — have tools to identify them. Paid groups like @potionalpha and @Shocked are favorites; free option: @TopblastFNF.
            </p>
            <p>
              Twitter trackers, wallet trackers, bundle checkers, Twitter re-use, site re-use checks. Paid groups pay off fast — you see where other people&apos;s eyes are on the market.
            </p>
            <p>
              Most important: a group / people to trade with — friends from paid groups or IRL. More eyes = whoever gets information first usually wins.
            </p>
            <p>
              Favorite group: @YogurtVerse — limited members, not oversaturated, smart traders with great calls/alpha.
            </p>
            <p>
              <strong>Platform:</strong> loves Photon — fast, charts don&apos;t lag, new pairs don&apos;t lag, best fills. Memescope: sniper count, top-10 holder %, search CA on X, dev token tab for past rugs.
            </p>
            <p>
              Sniper bots help post-migration entries/exits — no need to buy one; @BloomTradingBot has it free. Early fills on migrating volume, snipe CAs from X, insta-sell after dev sells.
            </p>
            <p><strong className="travis-tip-15-section-title">Mentality (from thread):</strong></p>
          </div>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Don&apos;t emotionally trade.</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Don&apos;t FOMO.</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Stick to your own conviction.</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Don&apos;t chase losses.</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Don&apos;t let FUD get to you — rage trading after a loss costs more than the first loss.</strong></div>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>
              Don&apos;t force trades. If meta is unclear or market is dry, sideline. Big win example: Sunday AI larps — sidelined 10 hours until a tweet, then bought. Only 11 tokens traded in 10 hours that day.
            </p>
            <p><strong>Your size ≠ their size.</strong></p>
            <p>
              Don&apos;t ape 10–25 SOL because whales do. Smaller port → start 0.1–0.5 SOL; size up only with conviction.
            </p>
            <p>
              Comparison is the thief of joy. Everyone starts somewhere. Crazy PNL on X isn&apos;t your requirement — traders like @OnlyTerp make 100k+/month taking profit aggressively. Round-tripped an extra 10–20 SOL chasing flex PNL. Aggressively take 2–5x until you build the port. You will paper 10–50x and hate yourself — part of the game.
            </p>
            <p>
              Wallet tracking: everyone tracks public wallets — don&apos;t blind copy trade. Use it to see where eyes are, then DYOR.
            </p>
            <p>
              No real playbook — learn through experience and intuition. Analyze why coins worked or failed. You&apos;re a trader, not a community member &quot;investing.&quot; P is P — take it and move on.
            </p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Practice makes permanent — trading muscle memory</div>
        <div className="note-body">
          Source: <a href="https://x.com/sonder_crypto" target="_blank" rel="noopener noreferrer">@sonder_crypto on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>My first Muay Thai coach told me practice makes permanent, not perfect.</p>
            <p>This applies to trading — you get shaped by the conditions you start in. After hundreds of trades you get used to the way things are.</p>
            <p>The problem is when conditions change and your muscle memory doesn&apos;t. The new pair warrior falls behind when the meta shifts.</p>
            <p>The guy who holds for longer when ceilings were higher gets rinsed when bearish conditions take over.</p>
            <p>It&apos;s important to be mindful of this so you don&apos;t get caught when things change. The best time to start believing is when everyone is overly bearish — and vice versa.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">2.2 SOL → 100k in a month (waddles_eth thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/waddles_eth" target="_blank" rel="noopener noreferrer">@waddles_eth on X</a>
          <p className="travis-tip-4-lead">
            I turned 2.2 SOL into 100k in just under a month with zero trading experience trading memecoins — here&apos;s how:
          </p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">1</span>
              <div>
                <strong className="travis-tip-4-item-title">Finding an alpha group</strong>
                <p>A community that gives you information impossible to find on your own is essential if you want to make money.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">2</span>
              <div>
                <strong className="travis-tip-4-item-title">Take profits</strong>
                <p>Give up the moon-or-dust mindset unless your port supports it. Be aggressive if you&apos;re growing from a small port.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">3</span>
              <div>
                <strong className="travis-tip-4-item-title">Do not get emotionally attached</strong>
                <p>The moment you get attached is when you start losing a lot. If you sell out of a coin, you must disassociate from it.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">4</span>
              <div>
                <strong className="travis-tip-4-item-title">Find like-minded people</strong>
                <p>A smaller circle can get you key alpha before it even hits alpha groups.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">5</span>
              <div>
                <strong className="travis-tip-4-item-title">Do not fall for the FUD</strong>
                <p>People will try to FUD you out of a big bag. When you make plays, have conviction. DYOR.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">6</span>
              <div>
                <strong className="travis-tip-4-item-title">Follow people who move the market</strong>
                <p>Expand your sources, but make sure they&apos;re useful — look for individuals who can move the market.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">7</span>
              <div>
                <strong className="travis-tip-4-item-title">Study being fast</strong>
                <p>When you trade, stay locked in — no distractions. At a moment&apos;s notice something can drop or alpha can hit and you&apos;ll be late.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">8</span>
              <div>
                <strong className="travis-tip-4-item-title">Know your port</strong>
                <p>Only you know your port — and how much you&apos;re comfortable losing.</p>
              </div>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>End of thread: questions welcome via DM. <em>Quo non ascendam?</em></p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Legitimate 10x opportunities per day</div>
        <div className="note-body">
          Source: <a href="https://x.com/pinkprintersol" target="_blank" rel="noopener noreferrer">@pinkprintersol on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Roughly 200–1,000+ legitimate 10x opportunities per 24 hours.</p>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-4-card">
        <div className="note-title">Sage unc withdrawal rules</div>
        <div className="note-body">
          Source: <a href="https://x.com/watchking69" target="_blank" rel="noopener noreferrer">@watchking69 on X</a>
          <p className="travis-tip-4-lead">
            If you make money in crypto, <strong className="travis-tip-4-em">sage unc advice:</strong>
          </p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">1</span>
              <div>
                <strong className="travis-tip-4-item-title">First withdrawal</strong>
                <p>Should give you <strong>post-tax 6–12 months</strong> run rate at your current lifestyle.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">2</span>
              <div>
                <strong className="travis-tip-4-item-title">Second withdrawal</strong>
                <p>Ideally buy physical assets — not for investment, just to offramp more liquidity: watches, physical gold, collectibles (Pokémon, TCG, etc.) if you&apos;re into that.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">3</span>
              <div>
                <strong className="travis-tip-4-item-title">Third withdrawal</strong>
                <p>Try to double your run rate.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">4</span>
              <div>
                <strong className="travis-tip-4-item-title">Monthly salary</strong>
                <p>Continuously take out a set monthly amount you call your &quot;salary.&quot;</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">5</span>
              <div>
                <strong className="travis-tip-4-item-title">Every new big win</strong>
                <p>Take a huge chunk and invest in SPY (post-tax) or buy more physical assets.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">6</span>
              <div>
                <strong className="travis-tip-4-item-title">Never recycle withdrawals</strong>
                <p>None of the money withdrawn should <strong>ever</strong> come back into the game, no matter what.</p>
              </div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">7</span>
              <div>
                <strong className="travis-tip-4-item-title">Repeat</strong>
                <p>Repeat #5 and occasionally #1.</p>
              </div>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>If you zero out, start the same way you did before — get a job, save money, start again. Just don&apos;t use capital from this list to re-start.</p>
            <p><strong>Guaranteed your survivability rate will increase +100,000% if you stay disciplined.</strong></p>
          </div>
        </div>
      </div>
      <div className="note-card travis-tip-card travis-tip-15-card">
        <div className="note-title">Skip daily income goals</div>
        <div className="note-body">
          Source: <a href="https://x.com/shaams" target="_blank" rel="noopener noreferrer">@shaams on X</a>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Don&apos;t chase &quot;$100/day&quot; or &quot;$10k/mo&quot;</strong>
              <p>Another thing new traders get wrong: focusing on making &quot;$100/day&quot; or &quot;$10k/mo.&quot; That&apos;s a concept manipulated by crypto course sellers to lure you into scams.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Crypto isn&apos;t linear</strong>
              <p>Regardless of your experience level — even GCR probably has dry spells where he makes $0 (or is negative), then randomly hits a big trade.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Become the best trader, not a number</strong>
              <p>Rather than setting monetary goals, just try to become the best trader possible. The money and opportunities will come, eventually, to those who stay consistent.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">How to find a good narrative</div>
        <div className="note-body">
          Source: <a href="https://x.com/0xyunss" target="_blank" rel="noopener noreferrer">@0xyunss on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p><strong>How to find a good narrative</strong></p>
            <p><strong>Is it a viral post?</strong></p>
            <p>Probably — some tokens are created off viral news, tweets, or something blowing up. That&apos;s a good thing.</p>
            <p><strong>But how viral is it?</strong></p>
            <p>Decide if virality will last or only 1–2 days ahead — otherwise skip. &quot;Justice for ____&quot; is blurry: if news faded, the token usually won&apos;t survive. Elon/Trump tweets you can play fast — but beware. Example: $right (9X8VSUD8yhYbHtR3KdKeCynhZTNfgTKMEufgnCympump) — from a viral post.</p>
            <p><strong>Is it memeable?</strong></p>
            <p>If it&apos;s built on a viral meme or clip reusable for days, weeks, or even years, it mostly survives. $right is a good example: viral post, tied to a hot new AI model, memeable. Example: $hero — American boy punching, went viral as &quot;American hero.&quot;</p>
            <p><strong>Is it tied to one entity or very dependent on one person?</strong></p>
            <p>I avoid this — don&apos;t love gambling. Most Bags-style projects tied to one entity: skip. Won&apos;t survive much; entity denies it → rugged. Example: $toly — Solana posted a video, token pumped; Toly changed PFP to match. If you have faith/conviction waiting on news like that, gambling this narration can work.</p>
            <p><strong>Is it an animal?</strong></p>
            <p>Animal tickers are favorites for crypto bros — important pets, zoo animals, great story = good narration. Easy to PvP. When animal tickers go viral they can be huge (e.g. $penguin — every X space, gov, symbol status).</p>
            <p><strong>Is it a utility project, LLMs, or AI agents?</strong></p>
            <p>Hard to decide. I research dev history: serial rugger? doxxed? How dev communicates with community helps spot rugs (at least for a day). Check X community/posts for that.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Put in the work — on-chain owes you nothing</div>
        <div className="note-body">
          Source: <a href="https://x.com/TheRealZrool" target="_blank" rel="noopener noreferrer">@TheRealZrool on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>So tired of reading horrible takes from &quot;traders&quot; who have genuinely never been early to a narrative in their life.</p>
            <p>Let me make it very clear:</p>
            <p>You are lazy. You never put in the work. You expected you could show up 25 minutes after 90% of people online already knew what the coin was about, recklessly top-blast, and still make money?</p>
            <p>Bundlers, streamers, and first tx&apos;ers are not &quot;scammers&quot; or people who &quot;should be put in jail.&quot; They are better than you — and you hate it because you are forced to buy on top of them. You would never sit there 15 hours a day and scan like they do.</p>
            <p>On-chain is a free-for-all. No one owes you anything. Stop bitching about others because you never put the work in. Simple as that.</p>
            <p>Buy the coin if you think it&apos;s going higher. If it doesn&apos;t, <strong>you</strong> lost because you were wrong — not because someone was there before you.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Bet size &amp; EV mastery</div>
        <div className="note-body">
          Source: <a href="https://x.com/MisakaTrades" target="_blank" rel="noopener noreferrer">@MisakaTrades on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>The only thing you need to be successful in crypto or any financial field is mastering bet size &amp; EV.</p>
            <p>When you accomplish mastery in those two, consider everything else taken care of.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Zero-sum game — grinders vs entitled CT</div>
        <div className="note-body">
          Source: <a href="https://x.com/clukz" target="_blank" rel="noopener noreferrer">@clukz on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Seeing washed-up entitled CT uncs wish death upon newgen traders for being profitable is so funny.</p>
            <p>You had hundreds of chances to make generational wealth over the years and retire — yet you&apos;re sitting here hating on grinders putting in 16 hours a day under the worst possible conditions for a tiny chance at making it out. Against gruesome competition, by the way.</p>
            <p>Keep covering up your inability to switch risk-off with a facade of righteousness. Someone has to lose — and this time it&apos;s you. Did we forget it&apos;s a zero-sum game? Someone thought the same exact thing about you at one point.</p>
            <p>Holding times are indifferent to each other in terms of morality. Everyone here has the same intention of making money — for what reason does your laid-back trading style deserve more success than others?</p>
            <p>In no way am I glorifying current conditions. I would absolutely love to conviction-hold coins for days/weeks and hit potentially monumental trades. Maybe that works again someday — but it doesn&apos;t right now.</p>
            <p>Why should anyone be expected to lose for <strong>your</strong> sake?</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">New to the trenches — 1 year of advice</div>
        <div className="note-body">
          Source: <a href="https://x.com/ferbsol" target="_blank" rel="noopener noreferrer">@ferbsol on X</a>
          <p className="travis-tip-4-lead">If you&apos;re new to the trenches, here&apos;s 1 year of 12h/day advice:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Never get cocky</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Never get too depressed</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Never act like you&apos;re always winning</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Get some friends (easier with NFTs, still possible with fnfs)</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Talk about your losses with friends</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">If you find something early, share it with your friends</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Only buy the amount you can sleep on</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Never full port (I did a couple times — none worked out well)</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Never try to hold more than 2% of the supply (I had 2% of PNUT — felt huge at $10M with the dick fud, so I sold)</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Never dump on your friends for 3–5 SOL profits</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Share your wins to motivate others</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Never doxx yourself</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Never talk about your money in real life</strong></div>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Copytrade interesting wallets — not Kolscan KOLs</div>
        <div className="note-body">
          Source: <a href="https://x.com/latuche95" target="_blank" rel="noopener noreferrer">@latuche95 on X</a>

          <div className="pullupso-quote decu-advice-quote">
            <p>Stop copytrading Kolscan (you can include me if you wish).</p>
            <p>You must copytrade interesting R/R wallets — people with over 75% success IMO, who aren&apos;t trading a lot.</p>
            <p>This is a lot of research — but it&apos;s worth it.</p>
            <p>Stop being regular — become something special, something else.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Adapt or die — market changes fast</div>
        <div className="note-body">
          Source: <a href="https://x.com/dezmadeit" target="_blank" rel="noopener noreferrer">@dezmadeit on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>What worked months ago doesn&apos;t work now. I&apos;ve learned you need to pick up on changes in the market quickly.</p>
            <p>You also need to set yourself up to be in a position to adjust on the fly — either to protect capital or seize opportunity.</p>
            <p>Slow feet don&apos;t eat. Adapt or die.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Low port — be picky</div>
        <div className="note-body">
          Source: <a href="https://x.com/ratwizardx" target="_blank" rel="noopener noreferrer">@ratwizardx on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Best thing you can do when low port: be picky, go for the vamps, look for an edge — anything to build the port.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Hyperfocus on your winning play types</div>
        <div className="note-body">
          Source: <a href="https://x.com/Bancrypto__" target="_blank" rel="noopener noreferrer">@Bancrypto__ on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>I think the best thing you can do is identify what types of plays (topblast / quick buy / hold for weeks / etc.) usually make you the most money and what types usually lose you the most — then hyperfocus on avoiding the plays you lose on and hyperfocus on finding the plays you win on.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Path to profitability — 3 pillars</div>
        <div className="note-body">
          <div className="pullupso-quote decu-advice-quote">
            <p>The path to profitability becomes simpler when you understand it&apos;s a game of consistency and math.</p>
            <p><strong>Three pillars: win rate, R/R, frequency. You can master two at a time.</strong></p>
            <p>Study profitable traders with a &lt;10% win rate and extreme outliers — runners held to 100x+.</p>
            <p>Then study profitable traders with a &gt;70% win rate scalping pumpfuns for a 2x, sometimes even 50%, trading an absurd number of coins daily.</p>
            <p>You&apos;ll notice traders who gamble dust, hoard supply on low caps, and don&apos;t sell a cent till 8-figure valuations.</p>
            <p>Then there are those locked in 18 hrs/day scalping every Elon/Trump news tweet.</p>
            <p>Can you do both? Good question — I have yet to see a trader who ticks all three boxes (very high daily trade frequency, able to hold for multiples, with a 70%+ win rate).</p>
            <p>Keep it consistent and don&apos;t deviate from your playbook — very rarely do you have to break your own rules.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Scalp first — play your own game</div>
        <div className="note-body">
          Source: <a href="https://x.com/tarnish" target="_blank" rel="noopener noreferrer">@tarnish on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>BTW if you&apos;re new to trading, you don&apos;t have to hold coins for multiple X&apos;s to make money.</p>
            <p>IMO the best way I built capital was scalping coins until I had enough SOL to hold coins for longer periods.</p>
            <p>Big PnLs are cool — but at the end of the day it&apos;s you vs you. Play your own game.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">All you need to succeed</div>
        <div className="note-body">
          Source: <a href="https://x.com/notsxlty" target="_blank" rel="noopener noreferrer">@notsxlty on X</a>
          <p className="travis-tip-4-lead"><strong>This is all you need to succeed:</strong></p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Memescope</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Twitter tracker</strong></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">·</span>
              <div><strong className="travis-tip-4-item-title">Patience</strong></div>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Notes from $GOAT — session timing</div>
        <div className="note-body">
          Source: <a href="https://x.com/tradinghoex" target="_blank" rel="noopener noreferrer">@tradinghoex on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Notes from a trader that caught $GOAT:</p>
            <p>If something with potential is holding up during dead hours (8pm EST–3am), I usually bid the tail end of the bleed before the US session wakes up to bid late. Mitigates risk IMO for waking up early — found GOAT this way.</p>
            <p>East session has a culture gap on memes, unless it&apos;s something globally viral.</p>
            <p>8–10pm EST is when they are extremely careful when looking at new pairs.</p>
            <p>Culture gap: memes that drive volume in the US don&apos;t tend to translate well with other countries during the night — vol falls off a cliff because of that.</p>
            <p>Stay disciplined, stick to your rules, and don&apos;t overtrade.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Learn distribution on low caps</div>
        <div className="note-body">
          Source: <a href="https://x.com/adel_crypto" target="_blank" rel="noopener noreferrer">@adel_crypto on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Highly recommend you put in the effort and learn how distribution works on low caps.</p>
            <p>Goal: at a quick glance, tell if someone can kill the chart. Saves me at least 10 times a day — and would save you countless re-deposits.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Memescope patience — the real challenge</div>
        <div className="note-body">
          Source: <a href="https://x.com/notsxlty" target="_blank" rel="noopener noreferrer">@notsxlty on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Having the patience to sit at memescope without getting bored all day is the real challenge.</p>
            <p>If you want it badly enough though, you&apos;ll obsess over it.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">How to trench (zinceth)</div>
        <div className="note-body">
          Source: <a href="https://x.com/zinceth/status/1877156555583533170" target="_blank" rel="noopener noreferrer">@zinceth on X</a>
          <p className="travis-tip-15-lead">How to trench — forwarded from Telegram. Long post, very valuable — strategies that made multi 6 figs in ~30 hours.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Alpha groups</strong>
              <p>Be in alpha groups (paid, FnF, etc.) — almost necessary IMO. Voice chat with people locked in on trenches is a cheat code. You shouldn&apos;t miss anything.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Pump vision workflow</strong>
              <p>Sit on pump vision and look at every single coin that&apos;s migrating. When you&apos;ve checked all migrations, check new pairs until something else is migrating. Ideally see every migration + a majority of new pairs. Only filter on new pairs: market cap above 8888 (less noise).</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Checking a coin</strong>
              <p>Go to socials and site. AI project: check GitHub, tech, what the project is. DOX&apos;d dev: check GitHub for long consistent coding history, repos, contributions. No DOX + no ton of GitHub activity proving goated dev: read code on GitHub. Learn to spot bullshit — check commits (stolen ReadMe renamed?), paste code into ChatGPT for AI-generated check, or tools like SEEKER to scan GitHubs. ALWAYS look for CA on Twitter or site. If CA is on Twitter, make sure the site links to that exact Twitter (fake Twitter risk). Site or GitHub linking to proper Twitter that posted CA = confirmation.</p>
              <p>Do all steps in under a minute if you want to cook. Nearly impossible to get pumpfun AI coins now unless you&apos;re cracked.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Hackathon cook example</strong>
              <p>Found hackathon projects that hadn&apos;t launched a token — turned on Twitter notifications. Project tweeted token going live shortly. Opened phone, Pump Vision, bought every single coin named that project for 30 minutes. Almost all fakes at $5k–$6k MC — barely lost on fakes. One was real: $250 → $55k+ (would&apos;ve been $300k–$400k at top).</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Win rate reality</strong>
              <p>Trenching: you will lose 95% of trades. Normal — best trenchers admit it. Your 5% wins pay for all losses and more. To get good: more time in market, learn what you&apos;re doing wrong. Goal (life + crypto): never make the same mistake more than once. Everyone will repeat mistakes — but that should be the goal.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Small ports warning</strong>
              <p>Trenching is NOT great for small ports. You might think 1 SOL → $100k is possible — odds extremely low. Better off swinging conviction plays for free 50%–100% gains and taking profits.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Patience after you enter</div>
        <div className="note-body">
          Source: <a href="https://x.com/game_for_one" target="_blank" rel="noopener noreferrer">@game_for_one on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Most traders associate patience with waiting for the right setup — but that&apos;s only the first step.</p>
            <p>The harder patience — what separates good from great outcomes — is patience <strong>after</strong> entering a trade.</p>
            <p>Once a position is on, emotions take over. Temptation to act, protect, optimize, rotate increases. The longer nothing happens, the more discomfort builds.</p>
            <p>This isn&apos;t conventional discipline — it&apos;s managing the psychological burden of uncertainty. You don&apos;t know if you&apos;re early, wrong, or too impatient. That ambiguity wears on you.</p>
            <p>What&apos;s often missed: the best trades are rarely obvious when you&apos;re in them. They require enduring boredom, doubt, or underperformance. Sitting through that without flinching takes more mental strength than people realize.</p>
            <p>Many cut winners early because they can&apos;t tolerate the unknown — they prefer certainty even if it means leaving money on the table.</p>
            <p>To capture full value of a good trade: patience isn&apos;t passive — it&apos;s a conscious decision not to act when everything in your psychology is pushing you toward action.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Don&apos;t revisit played-out trades</div>
        <div className="note-body">
          Source: <a href="https://x.com/game_for_one" target="_blank" rel="noopener noreferrer">@game_for_one on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>One of the easiest ways to give back gains is revisiting trades that have already played out.</p>
            <p>You catch the move, take the win — but now you&apos;re anchored to the coin, convinced there&apos;s more left. What you&apos;re really doing is trading the memory of a good setup, not the reality in front of you.</p>
            <p>By the time you return, dynamics have usually shifted — new participants, new flows, changed incentives. But you&apos;re still fixated on price action, assuming it means the same thing as before.</p>
            <p>This is how recency bias and the endowment effect creep in — overvaluing what&apos;s familiar and ignoring that edge comes from context, not comfort.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Comfortable port — easier to take profit</div>
        <div className="note-body">
          Source: <a href="https://x.com/miragemunny" target="_blank" rel="noopener noreferrer">@miragemunny on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Ironically — once you trade your portfolio up to a decent, stable, &quot;comfortable&quot; value, it becomes so much easier to take profit from trades in the trenches.</p>
            <p>When you are most hungry, you are most susceptible to round-tripping.</p>
            <p>Ironic, fascinating.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Breathe, reflect, adapt — gambler vs trader</div>
        <div className="note-body">
          Source: <a href="https://x.com/kilorippy" target="_blank" rel="noopener noreferrer">@kilorippy on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Your life has been a roller coaster the last year or so. Portfolio hit 6 figs with joy in your eyes — later it all got wiped in weeks/months. Now you&apos;re stuck in a loop.</p>
            <p>The loop: hyper gambling / &quot;emotional trading.&quot; You burnt your last few SOL thinking you&apos;ll make it work this time. You fear you need to make it out right now or time runs out — betting against the market instead of adapting. Rinsing SOL like nothing because you lost 6 figs.</p>
            <p>Breathe, reflect, adapt. Have you asked if what you&apos;re doing will satisfy your family, future, or God? Was fast money the journey — or were you trying to become a &quot;good&quot; trader? Which was it?</p>
            <p>A gambler doesn&apos;t know when to stop; a good trader knows when to step back. This CT &quot;lock in&quot; push is nonsense — you&apos;re hyper gambling instead of learning.</p>
            <p>Adapt and journal mistakes each step as you progress. You will have to adapt — that&apos;s the only way to make it.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">.1 SOL to 7 figures in 1 year (Euris thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/Euris_x/status/1904646537180819838" target="_blank" rel="noopener noreferrer">@Euris_x on X</a>
          <p className="travis-tip-15-lead">How I traded .1 SOL to multiple 7 figures in 1 year — for traders just starting or stuck in the same place. Won&apos;t cover basics (Phantom, etc.).</p>
          <p className="travis-tip-15-lead">I use @tradewithPhoton / Photon (ref) — most success with them. Thread</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Trading groups</strong>
              <p>— find one: @Shocked, @PastelAlpha, @potionalpha, @YogurtVerse (paid but worth it). Connections inside matter more — become friends, get added to FnF closed-circle trading.</p>
              <p><strong>Take it seriously:</strong> 2–3 hours/day won&apos;t cut it when starting — treat as full time if you can afford to.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Starting balance</strong>
              <p>$20 / .1 SOL isn&apos;t achievable like back then. Start at least 1 SOL, work up. 10+ SOL is fine — but more starting SOL often = faster blow-up; don&apos;t overexpose.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">What runs</strong>
              <p>tweets, tech/utility (if not fake), viral memes/animals, good dev projects (art or tech). Groups give tweet monitors on market-moving people.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Tweet-based coins</strong>
              <p>(Elon, Trump, etc.): sell majority while pumping, leave small moonbag — they usually retrace hard.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Viral memes</strong>
              <p>(moodeng, pwease, routine, etc.): position by how viral it really is. If everyone + web2 corps posting, can go way higher. Groups often ping entries on big memes.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Tech / utility / AI</strong>
              <p>— hardest, pays well. Many are larp/fake (hacked accounts, broken tech). Research at launch: links, companies, doxxed devs, plans, new vs recycled tech. Truth terminal, arc, snai, swarms, etc. ran — early research on real working tech usually pays.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Stack profit early</strong>
              <p>— low port can&apos;t roundtrip gains to loss (most projects do now). Take 50–80% gains.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Track wallets</strong>
              <p>— most bots have trackers built in. Confluence: @Ga__ke, @traderpow, @ShockedJS, @404flipped (find on Twitter / @kolscan). See what others trade — NOT copy every move, but watch what they&apos;re buying.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Fud</strong>
              <p>every token gets fud — distinguish real info (often valid on tech/utility from experienced researchers) vs baseless fud to shake you out.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Don&apos;t chase</strong>
              <p>before FOMO top-blast, ask if it can 2–5x from here. If not, skip. 90% of daily runners don&apos;t last the day. Big bags shill &quot;it&apos;s good&quot; — memes/animals compared to past runners = false hopium; 9/10 overvalued, not worth whole port for small gain/big loss.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Unit size</strong>
              <p>set amount, don&apos;t drift. 2 SOL port → max ~0.25 SOL per token. Hard mental stops -30% to -50% — don&apos;t marry bags; cut and move on.</p>
              <p><strong>Under 10 SOL:</strong> best success not trading above ~250k MC — more upside below, slower/harder 2–3x above; many top at 400–700k. Stick to low caps with multi-million runner potential. Didn&apos;t change buy size until 100 SOL — patience early.</p>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>You&apos;re a trader — goal is money. Don&apos;t marry dead bags because meme is funny or friends say it&apos;s good. At low port you can&apos;t skip taking profit.</p>
            <p>Small friend group in crypto — trade together, comms, win as group vs solo (exit liquidity most of the time).</p>
            <p>You will lose a lot starting — winners keep trying. Takes time before profitable, worth it. Ask questions in comments (easier than DMs).</p>
          </div>
        </div>
      </div>

      <div className="note-card pullupso-card">
        <div className="note-title">Wallet tracking for alpha — intention</div>
        <div className="note-body">
          Source: <a href="https://x.com/iqwaller" target="_blank" rel="noopener noreferrer">@iqwaller on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p><strong>On wallet tracking for alpha</strong></p>
            <p>Finding wallets of people who can actually trade is rare — but they exist. Not talking 2-minute holds. Wallets where buys/sells on the chart + a little TA show deep intention in those trades.</p>
            <p>If you reduced wallet tracking to &quot;pings&quot; — wake up call to sleuth again (including me). Look at Solscan, GMGN: where on the chart did they buy, what&apos;s their decision-making like? Profitability is just the first criterion — the meat is buy/sell zones and what part of the token lifecycle they traded.</p>
            <p>Wallet tracking has never been about pings for me — always about <strong>intention</strong>. The moment you find out &quot;why,&quot; defining confluence wallets gets easier.</p>
            <p>I still have &quot;news&quot; wallets — inform what&apos;s happening and when. Not the topic. The topic is <strong>confluence wallets</strong>. Put more effort into finding them. They exist.</p>
            <p>— Mr Waller</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Your future if you don&apos;t make it this cycle</div>
        <div className="note-body">
          Source: <a href="https://x.com/GRITCULT" target="_blank" rel="noopener noreferrer">@GRITCULT on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>You&apos;re in your mid 30s. You just round-tripped 8 figs — back down to 5. You spent your 20s hyper-gambling, spending all day replying to internet celebrities.</p>
            <p>You have no transferable skills, no friends, no family, no dating prospects.</p>
            <p>Your future if you don&apos;t make it this cycle.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">Your problem is size (Mr Waller)</div>
        <div className="note-body">
          Source: <a href="https://x.com/iqwaller" target="_blank" rel="noopener noreferrer">@iqwaller on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Read this. You&apos;re not terrible at trading. Your problem is size. Size gives you the opportunity to lose.</p>
            <p>Gake sizes 100 SOL into 5 plays in 24 hours. 3 go to shit, 2 do 10x. Gake makes 2000 SOL off 500 SOL invested — fat PNL. No one looks at the huge Ls. Worth it? Yes. You&apos;re probably equally skilled or better — but not equipped with ammunition to lose. Check favorite traders&apos; wallets: huge losses, ~four large wins. The sacrifice is pain to acquire size — the singular hardest part. With size, bear or bull, you&apos;ll make money. Certainty.</p>
            <p><strong>To acquire size — two options:</strong></p>
          </div>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">1</span>
              <div><p>Slowly compound 2x–3x wins on mid/low caps above 200k until 50 SOL minimum — then 2–3 SOL gambles on super low MC, hold for Valhalla (not as easy as it looks).</p></div>
            </div>
            <div className="travis-tip-4-item">
              <span className="travis-tip-4-num" aria-hidden="true">2</span>
              <div><p>5 SOL port — consistently size 0.5 into best low-cap narratives, sell 4x–5x until you build (extremely hard too).</p></div>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>Either way, the pain is building size.</p>
            <p>After size: you bully everyone. Buy $10k of a meta leader, sure of your 2x — do that consistently through the bull. But first, acquire size. Good luck.</p>
            <p>— Mr Waller</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Don&apos;t be lazy in your 20s</div>
        <div className="note-body">
          Source: <a href="https://x.com/assasin_eth" target="_blank" rel="noopener noreferrer">@assasin_eth on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Being lazy in your 20s is one of the worst mistakes you can make in life.</p>
            <p>Take advantage of those years, live below your means, and take risks — even harder later if you have responsibilities, family, children, etc.</p>
            <p>Don&apos;t be like most people who will live their lives with regrets; act now.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Owari weekly notes — PVE, thesis, 5–10x only</div>
        <div className="note-body">
          Source: <a href="https://x.com/OwariETH" target="_blank" rel="noopener noreferrer">@OwariETH on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>New notes this week — past 24 hrs, coins over $1M as reference for endless opportunities.</p>
            <p>Coin being strong = for a reason (why sell when it&apos;s strong?). If holding dead coins — selling out of emotion or confirmation?</p>
            <p>ONLY buy with confirmation and a clear thesis. Majority of trenchers&apos; biggest losses: no socials / no info FOMO right before a DS rape candle. Gooncoin / gork / dupe / useless were <strong>obvious narratives</strong> — simple thesis on potential, not guessing if AI dev is legit. Only entry and sizing weren&apos;t obvious.</p>
            <p>Remove emotions, reset, next trade — literal $50M coins again and again. After Dupe: multiple $10–30M coins.</p>
            <p>PVE only. Less trades. Less noise.</p>
            <p>&quot;Free 2x with size&quot; is a psyop — risking -99% for +100%.</p>
            <p>5–10x opportunities only.</p>
            <p><strong>DCA once.</strong> Bid at $1M and it&apos;s down? Don&apos;t DCA every 10k MC drop. Bid once more, be selective — or DCA into death of a weak coin. One of the only ways to fuck up this cycle; 5 wins wiped by one oversized loss.</p>
            <p><strong>Always another trade.</strong> After the first majority move, next leg is a gamble. Example: KOL blast + big influencers in a few hours — anything after is gamble.</p>
            <p><strong>Don&apos;t fear money. Don&apos;t trade PNL or the chart — trade the narrative.</strong> Don&apos;t stare at red/green candles or PnL up/down; look at narrative and possibilities. Think twice before selling — why are you slamming the red button?</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Accountability — every loss is yours</div>
        <div className="note-body">
          Source: <a href="https://x.com/MVsaga7" target="_blank" rel="noopener noreferrer">@MVsaga7 on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>No good trader I know has ever blamed someone else after a bad trade. They understand any loss is always their own fault — even if someone else told them to buy it, they still blame themselves.</p>
            <p>You have to be this extreme to make it. Learn accountability.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">~300k in 30 days — simple memecoin strategy</div>
        <div className="note-body">
          Source: <a href="https://x.com/saint_pablo123" target="_blank" rel="noopener noreferrer">@saint_pablo123 on X</a>
          <p className="travis-tip-15-lead">I&apos;ve made almost $300k in the last 30 days with a super simple memecoin trading strategy — how you can do the same (thread).</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Time is everything</strong>
              <p>— trade Europe session 2pm–10pm EST. Easier to spot runners, less PvP.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Stick to new pairs</strong>
              <p>— don&apos;t look at post-migration unless it&apos;s the next moodeng. New pairs = best way to make money day in, day out. Fresh narratives and volume.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Risk 2–5% per trade</strong>
              <p>20 SOL port → ~0.5 SOL per play, take profit at 2x, ride by vol and narrative quality. Never full port — that&apos;s gambling.</p>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p><strong>Summary:</strong> Scan new pairs in Europe session, ape 2–5% of port per trade. Look for profit / initials at 2x, cut losses at -20% to -50%. You won&apos;t make as much at first — skills sharpen, money flows over time.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Patience — don&apos;t chase volume</div>
        <div className="note-body">
          Source: <a href="https://x.com/bandeez" target="_blank" rel="noopener noreferrer">@bandeez on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Something every trencher on CT needs to hear: with new volume coming in, you&apos;ll catch yourself chasing it — either (1) rinsing your port or (2) getting lucky (fine, but you can&apos;t rely on luck).</p>
            <p>It&apos;s okay to be sidelined sometimes — don&apos;t jump into volume just because KOLs are buying. They have money to gamble. Sit back, wait for something real and actually good. Patience will be your best friend. All it takes is one good trade and you&apos;re set.</p>
            <p>As volume keeps rising — to new people: it isn&apos;t as easy as it seems. You will win a lot and lose a lot. Take losses as lessons to better yourself as a trader.</p>
            <p>Good luck to everyone out there. Keep clicking every day — your time will come.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">$10 to $1k/day — just cook</div>
        <div className="note-body">
          Source: <a href="https://x.com/0xpeely" target="_blank" rel="noopener noreferrer">@0xpeely on X</a>
          <p className="travis-tip-4-lead">This is how you go from $10 to $1k/day:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">Wake up</strong></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">Open Pump.fun new pairs</strong></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">Load tweet trackers</strong></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">Scan TG group chats</strong></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">Eyes glued to screen</strong></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">No FOMO</strong></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">Wait for the one</strong></div></div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>That&apos;s it. Nothing else. Just cook.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">How to trade memecoins in 2025 (30 tips)</div>
        <div className="note-body">
          Source: <a href="https://x.com/yaevwastaken" target="_blank" rel="noopener noreferrer">@yaevwastaken on X</a>
          <p className="travis-tip-15-lead">How to trade memecoins in 2025 — 30 tips/tricks for new and struggling traders (thread).</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Part 1 — The basics</strong>
              <p>1) No platform/extension makes you better — put in time. 2) Join a group (@ProsperityDAO_, @shocked, or find free traders). 3) Follow the right people; unfollow daily garbage shills. 4) Paranoid about links/downloads or get drained. 5) Don&apos;t touch leverage. 6) Memecoins = X/TikTok. 7) Learn culture fast — jokes, terms, respected KOLs. 8) Don&apos;t expect $5k/day week one — you&apos;re vs people doing 12h/day for a year. 9) Income outside trading to redeposit if needed. 10) Don&apos;t send rugs with botted volume to chats — chart spikes unnatural, holders often have no SOL (ask your chat if unsure).</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Part 2 — Tools / fees / filters</strong>
              <p>Don&apos;t overcrowd setup — X monitor + wallet tracker, keep simple. 10 great wallets &gt; 50 decent. Fees 0.001/0.001 OK on low port until MEV protection. Find wallets: graduated pairs &gt;250k → top traders → Cielo for daily/weekly/monthly PnL — consistent profit, low size traded = add + label style. Filters won&apos;t make you good overnight (author shares their filters in thread).</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Part 3 — Trading</strong>
              <p>Watch liquidity sucks/PvP — second tab on pulse/memescope while in a coin. Narrative + ceiling vs similar coins = top skill. Cut losses fast on small port; more risk when bigger. 7/10+ people get the joke = good sign. TikTok animal coins often weak (many repeats). Split-second decisions matter. Betas/derivatives weaker — usually main runner (exceptions exist). Sub 100 SOL: always take initials; bigger port + great narrative = trim higher (situational, better with low entry). 5–30 selective bids/day can beat 500 forced bids. Stop forcing — sometimes nothing to buy.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Part 4 — Mental</strong>
              <p>Remove FOMO on missed entries — always another coin. Bad days/weeks happen — trust your ability. Bad day → step away; rage trading halves ports in days. Trade in the right mental state — loss streaks = 10x worse trading. Can&apos;t half-ass this; high screen time needed if you want to learn.</p>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>Hope this helped — ask in replies if you want any point expanded.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">Tips for memecoins (oxy_fx)</div>
        <div className="note-body">
          Source: <a href="https://x.com/oxy_fx" target="_blank" rel="noopener noreferrer">@oxy_fx on X</a>
          <p className="travis-tip-4-lead">Tips for memecoins</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">1</span><div><strong className="travis-tip-4-item-title">Active on good days</strong><p>— judge market by BTC: bullish day / consolidating bullish range (~100k example) = good; downtrend or chop low vol bearish (just above support) = ass.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">2</span><div><strong className="travis-tip-4-item-title">Keep an eye on everything</strong><p>— learn by observing running coins and market environment (titcoin, housecoin → expect other xxxcoins like useless). Pattern recognition is essential.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">3</span><div><strong className="travis-tip-4-item-title">Best runners are unique</strong><p>— e.g. $useless from bonk tweet, bonk chain, organic runner premise. Find unique early → narrative good, bid → traction on socials → hold/bid more.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">4</span><div><strong className="travis-tip-4-item-title">Patience</strong><p>— don&apos;t waste capital on betas at 10k; 99.5% new launches bundled, zero in minutes. Wait for migration, see post-bond reaction; consolidation after bond often good. (Bundling new pairs = never make it.)</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">5</span><div><strong className="travis-tip-4-item-title">Bid strength</strong><p>— coin about to fly, bid that. Don&apos;t bid betas for &quot;higher RR&quot; — you&apos;ll get chopped.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">6</span><div><strong className="travis-tip-4-item-title">Don&apos;t copy trade</strong><p>— watched 7+ KOLs jeet useless under 200k. Most lack vision for long-term; not who you aspire to for big R/R.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">7</span><div><strong className="travis-tip-4-item-title">Don&apos;t panic sell</strong><p>— every meme does 50–80% retrace at least once before up-only. Learn natural retrace vs bundled jeet (never 100% foolproof).</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">8</span><div><strong className="travis-tip-4-item-title">Session plan</strong><p>— some days 5–10x new pairs; some days new pairs raped, holders rewarded for hours/days. Analyze migrated pairs pre-session; holding vs jeeting headspace.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">9</span><div><strong className="travis-tip-4-item-title">Mental</strong><p>— emotional over outcomes = over-risking. Go outside, long break until calm headspace returns.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">10</span><div><strong className="travis-tip-4-item-title">Selling</strong><p>— realistic target per coin (narrative, possibilities, uniqueness). Partials along the way. No one tells you when to sell; don&apos;t be last bag holder.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">11</span><div><strong className="travis-tip-4-item-title">Consistency</strong><p>— won&apos;t make it in days/weeks/months; years — but if you want it, you&apos;ll get it. Good luck, see you on chain.</p></div></div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">When you&apos;ve actually made it</div>
        <div className="note-body">
          Source: <a href="https://x.com/ZssBecker" target="_blank" rel="noopener noreferrer">@ZssBecker on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>The goal is to become so rich that you actively feel the need to hide it and play it down — because it&apos;s too much for most people to comprehend.</p>
            <p><strong>This is when you have actually made it.</strong></p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">$500 → $270K — new pairs setup (m4rk3r)</div>
        <div className="note-body">
          Source: <a href="https://x.com/m4rk3r" target="_blank" rel="noopener noreferrer">@m4rk3r on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>How I turned &lt;$500 into $270K+ since late Feb on Axiom trading low-cap memecoins — same setup (thread).</p>
            <p>I mainly buy <strong>new pairs</strong> — fresh coins. You can&apos;t lose more than a capped % (depends on MC when you buy) if you&apos;re early enough. I trade EU session: 2am–10am EST.</p>
            <p><strong>How to find the right new pair?</strong> Narrative. What makes a coin stand out: virality, memeability, or a topic posted by a large account online.</p>
            <p>Never ape more than you can afford to lose.</p>
            <p>When new, you will lose — keep buys low vs port size. Never overtrade or you rinse.</p>
            <p>Identify a good narrative.</p>
            <p>Biggest problem: jeeting too early. Minimize by picking strong narrative (virality etc.), hold, slowly take profit from 2x onward.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">New method — about to grad filter</div>
        <div className="note-body">
          Source: <a href="https://x.com/Saint_pablo123" target="_blank" rel="noopener noreferrer">@Saint_pablo123 on X</a>
          <p className="travis-tip-4-lead">New method — game changing, change with it:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">Change about-to-grad filters to 30 mins</strong></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">See what coins are still not dead (15k–35k)</strong></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">Check if community is good</strong></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><strong className="travis-tip-4-item-title">Wait for dip and ape with size</strong></div></div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Go where conditions are best — no chain bias</div>
        <div className="note-body">
          Source: <a href="https://x.com/sonder_crypto" target="_blank" rel="noopener noreferrer">@sonder_crypto on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>As a trader, being overly loyal to one chain can hold you back.</p>
            <p>Always be on the lookout for new opportunities. Your job is to go where the conditions are best — without bias.</p>
            <p>Some of the best opportunities show up in places you least expect.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">.4 SOL → 8 → 1.9 → 10 — comeback arc</div>
        <div className="note-body">
          Source: <a href="https://x.com/inquixit" target="_blank" rel="noopener noreferrer">@inquixit on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>How I went .4 SOL → 8 SOL in 1 week → back to 1.9 in 2 days → back to 10 SOL in 1 day (thread).</p>
            <p>Started at .4 SOL after emotionally trading away cycle profits. Rock bottom — but if you did it once you can do it again. Locked in. Took a break after the rinse to calm down before the comeback.</p>
            <p>After the break: 14 hours on screen ~2 days, waited for what felt like a guaranteed runner. Faded many that ran to millions — didn&apos;t think they&apos;d go that high. Finally found the coin that would boost the port.</p>
            <p>Full-ported .4 SOL into $GM early, sold 2x at $250k. Spidey senses: bigger than $250k topper. Full-ported .8 back in at $200k, trimmed from 3x up. Coin sent to $5M — avg exit ~$1.6M MC → just above 2 SOL (moonbag left, then nuked). Confidence boost — comeback is possible.</p>
            <p>Found a thread by @pullupso — followed it, scalped to 8 SOL in a week. Scalping isn&apos;t scalable with shitty R/R: 1 SOL, three +10% wins = +.3, one -.5 trade = wiped progress and negative. Chased scalps down to 1.9 SOL.</p>
            <p>Thanks to @pdadx and @fshmatt — stop scalping, wait for almost guaranteed runners. No unnecessary losses on shit scalps. Port back up in ONE day: patient all day, 2–5x trades, initials at 2x, trim higher.</p>
            <p>How the one-day comeback happened — you can too: extremely patient, selective, THINK before dumb shit. Still far from full comeback but will make it. Follow rules, smart decisions. We all gonna make it Inshallah.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Learn how to think or stay poor</div>
        <div className="note-body">
          Source: <a href="https://x.com/notthreadguy" target="_blank" rel="noopener noreferrer">@notthreadguy on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Learn how to think or stay poor.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Not profit until it&apos;s cash</div>
        <div className="note-body">
          Source: <a href="https://x.com/FlippingProfits" target="_blank" rel="noopener noreferrer">@FlippingProfits on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Some of you are experiencing something like this — it&apos;s much needed. Trust me: every green trade after this will feel like a blessing and you will hold your profits close.</p>
            <p>From my view it&apos;s always been: it&apos;s not profit until it&apos;s cash.</p>
            <p>If you stop chasing your dreams when an obstacle appears, it wasn&apos;t meant for you. Keep dreaming and find a way to make it reality.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Take your life-changing money</div>
        <div className="note-body">
          Source: <a href="https://x.com/FlippingProfits" target="_blank" rel="noopener noreferrer">@FlippingProfits on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Stop being retarded and not taking your life-changing money, please. You truly don&apos;t want to stay in this casino forever.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">You don&apos;t need to stare at memescope</div>
        <div className="note-body">
          Source: <a href="https://x.com/notsxlty" target="_blank" rel="noopener noreferrer">@notsxlty on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>I feel like a lot of people think you need to actively stare at memescope to win/learn.</p>
            <p>Honestly: memescope open + a Discord/TG tab with good trenchers is enough. Stare when vol is hot; when it&apos;s not, do other things — video games, build a product, literally anything.</p>
            <p>Many trenchers do nothing else but stare at pump vision all day. Effective if you&apos;re actually learning + making money (maybe upper 1% of active traders) — but never worth throwing away the rest of your life, career, education, whatever for something as volatile and insane as this industry.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Alpha funnel — about to migrate (Feed_SOL)</div>
        <div className="note-body">
          Source: <a href="https://x.com/Feed_SOL" target="_blank" rel="noopener noreferrer">@Feed_SOL on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Feels like most coins topping at 150–200k MC rn. Wild million-runners getting rare — be real with conditions. So how do you find the ones that&apos;ll print?</p>
            <p>Every ~3–4 minutes: check the about to migrate column. Then three things: 1) Community + who&apos;s in there — what they pushed before and ATH market cap 2) Wallet tracking 3) Narrative fit + virality. Lowkey this is the alpha funnel rn.</p>
            <p><strong>Entry:</strong> matters more than ever. Ape around 40k–50k MC. Above that, risk climbs fast. Below that, still roulette unless conviction + data/insider.</p>
            <p><strong>Exit:</strong> ruthless. Take profit at 3x–4x. Don&apos;t dream 20x unless it&apos;s obviously the next cult run. 150–200k MC feels like local top range.</p>
            <p>Adapt or die poor. Don&apos;t cry about volume — use it. Slow cooks are annoying but the cook is in patience. Frontload research. Sell to chasers. Simple.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">10 SOL → $100K in 3 weeks (Bancrypto / Nova)</div>
        <div className="note-body">
          Source: <a href="https://x.com/Bancrypto__" target="_blank" rel="noopener noreferrer">@Bancrypto__ on X</a>
          <p className="travis-tip-15-lead">How I traded 10 SOL into ~$100k in &lt;3 weeks using @TradeonNova (thread).</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Two main cash cows</strong>
              <p>Buying OG coins before they ran (memory from last year — won&apos;t break down). Ape new creations between 10k–20k.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">About to graduate tab filters</strong>
              <p>Age = 25 mins, MC 10,000–30,000. Main focus — filter junk, see gems.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Entry MCs</strong>
              <p>10k, 15k, 20k. 10k = more gamble (max ~50% loss, high rug risk, don&apos;t do often). Good narrative + ATH 15k–20k in &lt;5 mins → topblast; momentum often sends to 30k–40k, support ~20k. Late → wait for dip to 20k.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">40k topper signals</strong>
              <p>beta (depends on main runner height / main vs side beta), not unique enough narrative, not enough bagworkers or posting potential.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">400k+ topper signals</strong>
              <p>unique/outstanding narrative, main runner or main beta with 10M+ main, bagworkers / community forming, high volume (optional), KOL with 400k+ motion bullposting.</p>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>You NEED 10–50x+ plays at least ~every 15th trade or you won&apos;t make up for losses.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Show up every day — understand narratives</div>
        <div className="note-body">
          Source: <a href="https://x.com/kreo444" target="_blank" rel="noopener noreferrer">@kreo444 on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Biggest advice for new traders: show up every day. It&apos;ll eventually pay off — I promise.</p>
            <p>I got lazy and unmotivated in the slow market earlier this month and barely traded — then stayed on 14 hours a day again and it&apos;s paying off.</p>
            <p>Noticed a shift: a lot of people don&apos;t try to understand narratives themselves — they just buy volume. Step back, understand sentiment of what and why coins run, adapt accordingly — rather than blind aping.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">Fold pre &amp; pocket aces — risk calibration</div>
        <div className="note-body">
          Source: <a href="https://x.com/thiccyth0t" target="_blank" rel="noopener noreferrer">@thiccyth0t on X</a>
          <p className="travis-tip-15-lead">Two ways we miscalibrate risk: risk too much on low conviction; risk too little on high conviction. Lessons from poker and trading — fold pre principle and pocket ace principle.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Fold pre principle</strong>
              <p>Poker forums: complicated hand history → top reply &quot;fold pre&quot; — you never should have played it. Skip nuance; simplest fix is don&apos;t enter low-conviction spots. Everyone says cut losers early; fold pre = avoid low-conviction bets entirely.</p>
              <p>Trading: low-conviction trade → refuse to stop out, double/triple down until breakeven or blow up. Losing money distorts judgment — left-tail doom spiral. Life martingales: unhappy relationship (&quot;so much history&quot;), dead-end job (&quot;one more year&quot;).</p>
              <p>Litmus test: if free of the commitment at no cost, would you choose it today? Re-enter the position? Get back in the relationship? Reapply for the job? Fold pre, cut losers, fail fast — same law. Sunk cost kills asymmetric bets. Small risks hide fat left tails on time, money, emotions.</p>
              <p>Prolonged negative feedback loops teach: games/weed years, poker bankrolls in rage, relationship too long, startup you didn&apos;t believe in. Each scar → distrust impulsive cliffs. Fold earlier, avoid certain hands altogether.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Pocket ace principle</strong>
              <p>— when you&apos;re dealt pocket aces, bet the house. Winner-takes-most, power laws. In poker, top ~20 starting hands capture almost all profit; rest bleed back. Trading is messier — every situation different, adverse selection lurking. Never absolute certainty — but the market marks to market; recalibrate.</p>
              <p>Stan Druckenmiller: greatest trades look obvious after. Most effective: prepare for few times a year money is on the floor (e.g. post-election memecoin frenzy). One good trade can fund a lifetime.</p>
              <p>Life is most nebulous — blurred hand, infinite deck, counterfactuals years later as regret. Biggest pots (friendships, mentors, purpose, love) need lucky draws and aggressive conviction bets.</p>
              <p>Few pocket aces sized in life: friends, trading firm, mentors — felt obvious. Explore intersection of what you enjoy and what makes money; when right person/opportunity appears, drop everything and commit when incentives align like a great trade.</p>
              <p>People overplay marginal hands. Old people wishing they took more risk = cultural counterfactual. Power-law world: pocket aces are rare. If you&apos;re playing an okay hand when aces arrive, you miss them. Stretch imagination. Cultivate patience. Wait — refuse to trade &quot;great&quot; for merely &quot;good.&quot; Trust the nonlinear payoff will come.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">80–90% brain power on self-sabotage</div>
        <div className="note-body">
          Source: <a href="https://x.com/xansnds" target="_blank" rel="noopener noreferrer">@xansnds on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>I&apos;m truly convinced 80–90% of my brain power is used for self-sabotage — and same with my actions. It&apos;s actually crazy thinking about it.</p>
            <p>Like 90% of my actions sabotage myself in some way; 10% move me forward. I&apos;m so good at finding leverage I&apos;ve built several businesses and accomplished various small things in spite of that.</p>
            <p>I once got a peek at not actively self-sabotaging for one goal only — getting a 6-pack in 60 days. That legit felt easy; I wasn&apos;t hungry. Harder to <em>not</em> get a 6-pack than to get it. Meanwhile the rest of my actions sabotaged other parts of life; only ~5% moved me forward.</p>
            <p>Insane to imagine what I&apos;ll accomplish spending even 50% not sabotaging myself — let alone 90%. I legit could change the world.</p>
            <p>I have to heal this trauma and live up to my potential. This is a requirement.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">On-chain — the first $100K</div>
        <div className="note-body">
          Source: <a href="https://x.com/watchingmarkets" target="_blank" rel="noopener noreferrer">@watchingmarkets on X</a>
          <p className="travis-tip-15-lead">Sleepless nights, endless meme watchlists, chasing every meta — portfolio ATHs come and go. Hardest phase taught me how to turn losses into a path to $100K.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Protect capital like oxygen</strong>
              <p>— never sleep overexposed. Convert to SOL (or stable base) before bed no matter how bullish. Stay in the game.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Day trading &gt; blind holding</strong>
              <p>— for most on-chain assets, short-term volatility + daily profits compound faster than long holds.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Ditch FOMO</strong>
              <p>— don&apos;t buy green candles. Buy support, buy low, hold ATHs longer.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Cash is your safety net</strong>
              <p>— rotate profits from SOL into fiat regularly. Liquidity to seize opportunities without being trapped in a dip.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Trust skills and gut</strong>
              <p>— experience over market noise. Don&apos;t be greedy — 20% on a day trade is massive; consistent gains beat moonshots that rarely last.</p>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>On-chain rewards discipline over emotion. Review wins and losses. Small smart trades stack to $100K faster than you think.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Fool&apos;s mentality vs Him&apos;s mentality</div>
        <div className="note-body">
          Source: <a href="https://x.com/himgajria" target="_blank" rel="noopener noreferrer">@himgajria on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>&quot;The asset I decided not to invest in ended up being a runner. It&apos;s over for me&quot; — Fool&apos;s mentality.</p>
            <p>Liquidity is always moving. As long as you&apos;re ahead of said liquidity, you&apos;ll win.</p>
            <p>&quot;You&apos;re only as good as your next win, not your last one&quot; — Him&apos;s mentality.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Hold through dips — trust the process</div>
        <div className="note-body">
          Source: <a href="https://x.com/bandeez" target="_blank" rel="noopener noreferrer">@bandeez on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>June has been my best month trading — last trade of the month was the cherry on top.</p>
            <p>People ask: how do you hold through so many dips? Not scared of roundtripping? Crypto is all about risk — you have to be willing to take the risk of roundtripping / possibly losing. What do we have to lose? Opportunity is constant. Trust yourself — it will work eventually.</p>
            <p>Study common narratives — shit gets easier to recognize, it will click. Taking enough profit where you&apos;re comfortable to roundtrip helps a lot. Just study this — it helps so much.</p>
            <p>You are no different than anyone else. Keep pushing and you will see progress — I promise. Only gets better from here.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">10 SOL challenge — skill diff, not gambling</div>
        <div className="note-body">
          Source: <a href="https://x.com/kayz_ce" target="_blank" rel="noopener noreferrer">@kayz_ce on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Started this wallet with 10 SOL at the start of the month to challenge myself — ground up again. Not my most profitable month (capped by bankroll early), but proves anyone can make it with any size portfolio.</p>
            <p>It took me: 2.5 weeks for first 100 SOL · 1 week for second 100 SOL · 3 days for third 100 SOL.</p>
            <p>Everyone says memecoins are &quot;gambling&quot; — it&apos;s genuinely a skill issue. Real skill you can master and become consistently profitable over a longer timeframe.</p>
            <p>Going hard now without limiting myself (need to cook back 6-figure months). GL and keep grinding — it&apos;s always a skill diff; mindset is what&apos;s holding you back.</p>
            <p>70–80% skill, 20–30% luck. Luck and variance play a part — but skill makes you profitable over the long run. Once you find a strategy that works and manage risk and emotions, you&apos;ll see how much of a skill diff it really is.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">750 SOL in June — consistency is key</div>
        <div className="note-body">
          Source: <a href="https://x.com/bandeez" target="_blank" rel="noopener noreferrer">@bandeez on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>750 SOL in June (~$115k) — best realized month. Cut trades in half, improved a lot. Still room to grow — you can always improve; never cut yourself short. Getting easier over time.</p>
            <p>July goal: stay consistent, try not to have red days. Small wins add up fast. Sit on your hands, patience, limit trades. Don&apos;t force — no FOMO from KOLs on one coin that slow-bleeds to zero.</p>
            <p>Stay in your lane, find your conviction — never let conviction rely on others. Nothing to something in 4 months. Anyone can do it. Put in time and effort. Never stop clicking.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">Trading secrets no one tells you</div>
        <div className="note-body">
          Source: <a href="https://x.com/greenytrades" target="_blank" rel="noopener noreferrer">@greenytrades on X</a>
          <p className="travis-tip-4-lead">Trading secrets no one will tell you (but you need to hear):</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">1</span><div><p>Most pros lose sometimes — big. Difference: they control risk and stay in the game.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">2</span><div><p>Mindset &gt; system. Best indicators fail if you&apos;re impulsive or emotional.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">3</span><div><p>Backtests can lie — past ≠ future.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">4</span><div><p>Nobody cares about your trades. Market has no feelings — don&apos;t take losses personally.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">5</span><div><p>Liquidity is your real best friend. No liquidity = no exit.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">6</span><div><p>Edge fades over time. Adapt or die.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">7</span><div><p>Patience beats brilliance. Boring traders often outperform flashy ones.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">8</span><div><p>Position sizing is 80% of the battle.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">9</span><div><p>You will never perfect trading — you just keep improving.</p></div></div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">$1M in 30 days — small bankroll (full thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/tilcrypto" target="_blank" rel="noopener noreferrer">@tilcrypto on X</a>
          <p className="travis-tip-4-lead">How I made over $1,000,000 in 30 days — and how you can too with a small bankroll. (Full thread)</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">1</span><div><p><strong>Only look at new pairs</strong> — if you&apos;re playing this game for daily 100x&apos;s you won&apos;t need any other tab. Don&apos;t filter new pairs either; you don&apos;t want to miss anything. Photon setup</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">2</span><div><p><strong>You must have a CT tracker</strong> — when any okay narrative appears, click buy on any ticker / name that resembles what was said in the tweet the best. Don&apos;t panic or be afraid to spam click if it&apos;s a good tweet.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">3</span><div><p><strong>Example in action:</strong> Trump simply posts the launch of TruthFi exchange — snipe it at launch, buy lots of tickers in case one doesn&apos;t run, and hold until one is sniped on Ray.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">4</span><div><p><strong>If CT tracker is dead: buy anything with a pulse</strong> — @frankdegods has said this too: anything that gets a few new holders and you quickly look at and decide is good might be the next giga runner. Only buy these sub $10k to lower risk.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">5</span><div><p><strong>Use filters on about-to-graduate</strong> to remove almost all bundled coins — but also get a sense of what is graduating in the current market and what you&apos;re going to look for on new pairs.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">6</span><div><p><strong>Have zero emotion</strong> — even if this is a lot of money to ape into shitcoins ($500–$2,000), especially on a low cap. Any emotions will make you fumble the bag.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">7</span><div><p><strong>Always ask yourself:</strong> will someone buy this coin off me at $500k? At $2M? At $5M? If no one will buy your tokens off you at $500k and they&apos;re currently at $100k, lower your price targets to more reasonable levels.</p></div></div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">Sebastian trade recap (thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/saint_pablo123" target="_blank" rel="noopener noreferrer">@saint_pablo123 on X</a>
          <p className="travis-tip-15-lead">Being consistent is important — small wins add up. Breakdown of today&apos;s trades.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Biggest trade: $tinfoil</strong>
              <p>Someone with motion tweeted it and changed their pfp — it was @mst1287</p>
              <p>Narrative around conspiracy theories about the bonk cabal is strong and has lore</p>
              <p>Object on head (tin hat) creates a cult with a good template for art</p>
              <p>I aped post-migration for my biggest win.</p>
              <p>Only possible with the right filters in final stretch and migrated — otherwise hidden gems like this go under the radar.</p>
              <p>Explains all filters in latest YT vid — must watch: filter breakdown</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Another big win: $b_M</strong>
              <p>Playing with size post-Ray seems better on bonk than new pairs. Token had Truth Terminal lore surrounding the BONK meta we&apos;re in. Top holders were rich and have hit big bonk plays in the past — thought maybe a cabal running the coin. Was right.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Cented advice — avg vs great trenchers (thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/flipski77/status/1942442040144298321" target="_blank" rel="noopener noreferrer">@flipski77 on X</a> · @mars1kz
          <div className="pullupso-quote decu-advice-quote">
            <p>If you guys have any questions about memecoins, drop them below and I&apos;ll give you realistic advice.</p>
            <p><strong>@mars1kz:</strong> What do you think separates the average trencher from a good one?</p>
            <p><strong>Intuition and grind</strong></p>
            <p>IMO — I&apos;ve met so many people (undoxxed wallets), myself included in the beginning, who just put in the work and have made over $1M. The biggest separation is intuition and speed — being able to see something and know it&apos;s good without researching is the key.</p>
            <p>Buying quickly based off intuition, then researching to calculate how high you think the coin can go — that&apos;s what separates the avg from the elite.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">How to actually win in memecoins — lessons from the 1%</div>
        <div className="note-body">
          Source: <a href="https://x.com/kaythedoc/status/1936291261637591329" target="_blank" rel="noopener noreferrer">@kaythedoc on X</a>
          <p className="travis-tip-15-lead">Top 1% of people trading memecoins — 99% lose in this space. Not a get-rich-quick guide; a long-form breakdown of strategies that helped survive and thrive over the past year.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">1. Culture and knowledge are everything</strong>
              <p>Your first job: understand why every single coin runs. If a coin sends, ask — tweet? Who tweeted? Follow them. Culture coin? Some memes don&apos;t make logical sense until you see the narrative. Housecoin made zero sense at first — then @LexaproTrader and @blknoiz06 behind it: can&apos;t afford housing, buy Housecoin instead — a movement, a cult. That&apos;s why it ran.</p>
              <p>Gork hit $70M MC — not just Elon eventually. Way before, smart traders noticed core XAI employees following it. Early signal = context. Every runner has a reason. If you don&apos;t know it, you&apos;re not learning.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">2. Wallet tracking is a tool — not a crutch</strong>
              <p>Never copy trade blindly — that&apos;s how you get dumped on. Smart wallets know they&apos;re tracked. Buy at $5K → instant $10K from followers = easy EL. Don&apos;t follow wallets hoping to get rich. Instead: study how traders behave; watch consensus buys (especially $100K–$200K+ MC); learn wallet behavior patterns. Real edge = unknown wallets — public ones are overfished and bot-tracked. Known wallets = macro trend confirmation, not entries.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">3. Every trader has a style</strong>
              <p><strong>@Ga__ke</strong> — Gake is a size buyer above $100K MC. If Gake buys your coin, it&apos;ll likely rip — but for me that&apos;s a late signal. Front-run by asking: is this good enough for Gake before he&apos;s in?</p>
              <p><strong>@Euris_x</strong> — one of the best lore traders. Dominates low caps on Pump.fun — narrative hunter in fresh pairs, meme potential, early cult vibes. Faster than you — but learn what lore he likes from his trades.</p>
              <p>Don&apos;t just track what someone buys. Understand why they buy. That&apos;s how you build your own edge.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">4. Have the right tools</strong>
              <p>If you&apos;re still using Phantom, you&apos;re losing. Narratives form and die in minutes — need speed, context, execution. Axiom / Photon / Trojan, TG bots for fast buying + deployer alerts + wallet tracking, real-time dashboards (fresh pairs, wallet moves, social context). 10x+ players have faster execution — edge isn&apos;t just knowledge, it&apos;s reaction time. Equip yourself or get left behind.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">5. Reset your portfolio every week — don&apos;t size up too early</strong>
              <p>1 SOL → 100 SOL doesn&apos;t mean you trade like you have 100 SOL. Small fish job: find a consistently winning strategy — stay small, reset mindset, preserve capital. Greed ends runs: 10–20 SOL per play, emotionally attached, bad entries, broke. Even now: focus sub-$100K MC; personal cap ~$50K–$100K MC. Miss runs — don&apos;t miss capital preservation. Glorify 50x all you want; if you can&apos;t hold the stack, the 50x means nothing. Preserve capital — last long enough to actually become good.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Closing thoughts</strong>
              <p>Memecoins are chaotic, emotional, brutally fast — but beatable if you play the right game. Learn culture, track the right people, study traders, build a toolkit, don&apos;t chase — understand. If you don&apos;t know the why behind a coin, you don&apos;t belong in it. Good luck. Don&apos;t fade the memes — and remember: no crying in the casino.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">How to actually fix your trading</div>
        <div className="note-body">
          Source: <a href="https://x.com/Luckshuryy" target="_blank" rel="noopener noreferrer">@Luckshuryy on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Build your own system. Following a third party is only temporary — you need to be self-sufficient. Being regimented and organised helps a lot. Have a routine preparing for the day ahead (not just trading): clean your desk, workout, lay it all out.</p>
            <p>The clearer you are on rules/process, the less ambiguous and erratic your inputs — much more consistent execution. Prep these three questions:</p>
            <p>Where do you want to get involved?</p>
            <p>What do you want to see to enter? Where is your trade idea invalidated? If planned ahead, they instantly improve how you trade.</p>
            <p><strong>Learn to take losses properly</strong> — comfortable mentally with losing trades. Understand leverage for position sizing. Know exactly how much you lose when stop hits. A written plan makes losing just part of the process. Wins compound over a long enough horizon if you stay in the game.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Narratives — what would a good trader do?</div>
        <div className="note-body">
          Source: <a href="https://x.com/ecomsin" target="_blank" rel="noopener noreferrer">@ecomsin on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Being able to understand narratives and figuring out why you think other people will buy has tremendously helped grow my port.</p>
            <p><strong>Think to yourself before you enter...</strong></p>
            <p>What would a good trader do?</p>
            <p>vs. What would a bad trader do?</p>
            <p>Just took this trade with huge conviction —</p>
            <p><strong>ENTRY</strong> (27k → sold 55.3k) for 90% gains.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">Applicably — swing big, scenarios, learn</div>
        <div className="note-body">
          Source: <a href="https://x.com/comfortablylong" target="_blank" rel="noopener noreferrer">@comfortablylong on X</a>
          <p className="travis-tip-4-lead">Applicably:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">1</span><div><p>Swing big when it&apos;s obvious</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">2</span><div><p>Draw overly conservative max upside scenarios, and overly aggressive max downside scenarios before entering</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">3</span><div><p>Spend most of your time learning and having fun when the above doesn&apos;t exist</p></div></div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>Utterly pathetic that most struggle with pt 3.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">Wallet tracking — what it is &amp; how to make money (thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/kunleofweb3" target="_blank" rel="noopener noreferrer">@kunleofweb3 on X</a>
          <p className="travis-tip-15-lead">Wallet Tracking: What it is and How you can make money from it.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <p>Simplest form: tracking wallet activities — what they buy, sell, bridge, send, receive. Monitoring every on-chain transaction of a particular wallet.</p>
              <p>Not solely for profit — insight on where smart money is going confirms bias on the next narrative. Can also be used as security. This thread narrows to how it can make you tons of money.</p>
              <p>Some people are smarter — better understanding, access to info you don&apos;t. Wallet tracking lets you follow them and do what they do.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Method 1 — Study on-chain activity of runners</strong>
              <p>Runner at $10M MC — some bought sub $100k. Don&apos;t stress: track their wallet for a future cook. Filter to wallets who got in early, held their bag, and made good % PnL (not raw PnL alone — $50k at $5M vs $100 at $100k).</p>
              <p><strong>Top Traders workflow:</strong></p>
              <div className="travis-tip-4-checklist">
                <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Top Traders section — check amount bought/sold (sell supply must not exceed buy)</p></div></div>
                <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Pick good % PnL — copy wallet address</p></div></div>
                <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Cross-check W rate on @AxiomExchange — 60%+ is good</p></div></div>
                <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Study wallet&apos;s next 2–3 buys — if good, fine to copy. If many copytraders and every buy instantly pumps, copy with caution (dump risk)</p></div></div>
              </div>
              <p><strong>Example: $testicle</strong> (~$16M MC) — wallet bought $4,840 at ~$7.4M, sold same supply for $114.8k. Copy address, study next purchases, copytrade if good. Educational only — don&apos;t copy that wallet.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Method 2 — Study clusters</strong>
              <p>BSC trenches: found a core Binance team wallet, made good money copy trading — studied clusters. Good/insider traders use new wallets, don&apos;t repeat — study relative transfers/clusters. Have a CZ wallet? Check its cluster — wallets it interacted with. Funding wallet likely funds new wallets too; intra-wallet transfers. Real-time clusters on Solscan, BscScan, etc.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Track wallets &amp; get realtime alerts</strong>
              <p>Uses @ray_bronze_bot (TG link); add wallet, name it, activate — alerts on buy/sell/transfer. Saves manual tracking.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">Brain vs. instinct — why you keep hesitating (most important)</div>
        <div className="note-body">
          Source: <a href="https://x.com/degn34/status/2019370272034275646" target="_blank" rel="noopener noreferrer">@degn34 on X</a>
          <p className="travis-tip-15-lead">Brain vs. Instinct: Why You Keep Hesitating. Another article — just read it. You get lazy to commit to a trade too; let&apos;s explore that. February PnL calendar (so far): some say you&apos;re making money, some say you&apos;re washed — for me, given my experience, this is lazy. Self-audit led to the theories below. (Once you get money, advice goes — full your mouth.) I promise I don&apos;t have money, lmao. These writings are from self-assessment on the journey to be better.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">The real reason you&apos;re not winning: you don&apos;t trust yourself</strong>
              <p>For a long time I thought the problem was technical — better entries, indicators, timing, info. Blamed market, luck, volatility. The real issue was simpler and harder: I don&apos;t consistently trust myself — behaviorally, not motivational quotes.</p>
              <p>See a coin, calm nudge: &quot;This can go.&quot; Instead of acting — open memescope, scan lower caps, hunt something shinier. Not chasing upside. Avoiding commitment. Self-trust is a habit: act, size reasonably, give it time — or abandon when something shinier appears. Ignore your signal enough and your brain learns your thoughts are optional. You destroy edge not because instincts are bad, but because you never honor them long enough to pay you.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Discipline is often fear in logic&apos;s clothes</strong>
              <p>&quot;Discipline&quot; and waiting for better entries often = fear in logic&apos;s clothes — fear of being wrong, losing, sitting in uncertainty. Good coins give acceptable entries, not perfect ones. Perfect is often avoiding responsibility. Low caps felt easier — gamble if dead, smart if pumped, no identity risk. Larger narrative / mid-cap plays: wrong = says something about you — so you avoid trades you actually believed in. That avoidance cost more than any bad entry.</p>
              <p>Most traders don&apos;t lack edge — they lack self-trust consistency. They see setups, feel instincts, understand narratives — but don&apos;t stay loyal to their own view long enough for probability to work. Hesitate, second-guess, outsource conviction to Twitter, wait for strangers to confirm what they already felt — then watch the move without them.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Self-trust consistency (boring but it works)</strong>
              <p>See something you like, enter reasonable size, define where you&apos;re wrong, let it work, accept outcome, repeat. Demand every trade win → only act when certainty exists → certainty never exists. Contract: sometimes wrong, don&apos;t punish yourself for participating. Stop hovering, hopping, shiny-object surfing — stability makes money.</p>
              <p><strong>Rule that changed everything:</strong> max three thesis trades at any time. Want a fourth? Close one. No endless scanning, infinite maybes, dopamine surfing. Forced focus. Boring. Effective.</p>
              <p>Winning traders aren&apos;t smarter/faster/luckier — more consistent with their own decisions. They&apos;re not right all the time; they don&apos;t abandon themselves. Honor your own perspective. Self-trust feels like quiet commitment — almost nobody has it. That&apos;s why it works.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Self-trust has to be earned</strong>
              <p>Untrained instincts + &quot;trust yourself&quot; = expensive delusion. Still learning narratives or accumulation vs distribution? You have guesses — small size, high reps, low ego. Build the thing that will later deserve trust. The self-trust problem hits after reps — you&apos;ve caught moves, had winners, know when something is setting up — but still don&apos;t act consistently. Psychological interference becomes the bottleneck.</p>
              <p>Early job: feedback loop, not blind trust. Track ideas — what you thought would happen and why; check reality. 100–200 times. Notice setups/narratives/signals that work for you. Then self-trust is relevant.</p>
              <p>Self-trust isn&apos;t blind all-in — &quot;I&apos;ve seen this before, allocate accordingly, let it play without interfering.&quot; Trust the process, not certainty on one trade.</p>
              <p>Early: exit the moment price goes red — every candle = proof you&apos;re wrong, cut before the bounce, protect ego. Later: hold losers too long — conviction became stubbornness. Balance: trust yourself enough to take the trade; trust the market enough to tell you when you&apos;re wrong. Not fear keeping you out, not ego keeping you in — honest self-assessment + behavioral consistency.</p>
              <p>Ask: don&apos;t trust myself because I ignore signals I know are real? → psychological problem — honor decisions, track results. Or because I haven&apos;t put in reps? → knowledge problem — build the feedback loop. Not the same problem; confusing them = blow up from overconfidence or paralysis from underconfidence. Goal: perspective tested enough that trust is justified — then act accordingly. With love ❤️ &gt; 34.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">Memecoins are jokes — core thesis</div>
        <div className="note-body">
          Source: <a href="https://x.com/NikolaiHauckx" target="_blank" rel="noopener noreferrer">@NikolaiHauckx on X</a>
          <p className="travis-tip-4-lead">Core thesis: Memecoins were never broken — people forgot what they are: jokes. The space got too serious, overcomplicated, and forced, killing the organic fun that makes them work.</p>
          <p className="travis-tip-4-lead">Key advice:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">1</span><div><p>Stop forcing the joke — you can&apos;t hammer the same narrative and expect it to land. Jokes spread when genuinely funny/resonant, not repetition or hype.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">2</span><div><p>Don&apos;t overcomplicate — endless narrative crafting, serious marketing, or trying to &quot;make&quot; something funny kills the vibe. Keep it light, organic, meme-like.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">3</span><div><p>Return to the roots — humor, virality, fun — not influencer pumps, cabals, or serious-project treatment. Let traction build naturally.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">4</span><div><p>Question the seriousness — ruined by turning jokes into forced &quot;investments&quot; with heavy promotion. Go back to playful, unfaked energy.</p></div></div>
          </div>
          <p className="travis-tip-4-lead">Journal action items:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>For any new coin: Is this actually funny/organic, or am I forcing a narrative?</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Track: did the community spread it naturally, or was it pushed by big accounts?</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Reminder: If the joke doesn&apos;t land on its own, no amount of repetition will save it.</p></div></div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">Actionable memecoin advice — 3 core pillars</div>
        <div className="note-body">
          Source: <a href="https://x.com/millodos/status/2038750651342016862" target="_blank" rel="noopener noreferrer">@millodos on X</a>
          <p className="travis-tip-15-lead">Actionable memecoin trading advice for your journal — 3 core pillars (from video)</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">1. Be selective with entries</strong>
              <p>Stop throwing darts at random coins. Quickly understand the narrative — what does this token represent? Why might it run? Only buy with immediate conviction from data (MCAP, volume, token age, community signals).</p>
              <p><strong>Journal prompt:</strong> For every entry, write 1–2 sentences on the narrative and why this specific coin (not others).</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">2. Be concise in analysis</strong>
              <p>Keep it simple and fast — don&apos;t overcomplicate with endless research. Use tools like Axiom Pro (Pulse dashboard) for real-time new pairs, migrated coins, volume, and filters. Focus on volume, market cap momentum, token age.</p>
              <p><strong>Journal prompt:</strong> Note your exact filters/setup and how quickly you decided (aim under 1–2 minutes per scan).</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">3. Be confident (destroy hesitation)</strong>
              <p>Biggest barrier is psychological — hesitation, FOMO, second-guessing. Treat every position as risk capital you&apos;re willing to lose. Once analysis checks out, execute without overthinking.</p>
              <p><strong>Journal prompt:</strong> After each trade, rate confidence (1–10) and note hesitation moments. Review weekly to track improvement.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">My 2025 memecoin journey — reflection workbook</div>
        <div className="note-body">
          Source: <a href="https://x.com/elGodric/status/2004260002156974480" target="_blank" rel="noopener noreferrer">@elGodric on X</a>
          <p className="travis-tip-15-lead"><strong>My 2025 Memecoin Journey — A Personal Reflection Workbook.</strong> Markets reveal patterns in us. Same mistakes repeat because we never slow down to examine why. Reflection surfaces emotional triggers, false beliefs, rationalizations, and habits. This isn&apos;t performance or optimization — it&apos;s awareness. Reflection is preparation for 2026.</p>
          <p className="travis-tip-15-lead">How to use: Not one sitting. Pick a section, sit with it, write honestly. Obvious questions and uncomfortable ones both matter. Skip what doesn&apos;t apply; return to what keeps resurfacing. Blank PDF in thread replies.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Who I was at the start of 2025</strong>
              <p><strong>My mindset walking in:</strong> What I believed about memecoin trading · My expectations vs reality · The trader I thought I&apos;d become · My relationship with money and risk</p>
              <p><strong>Why I started:</strong> What drew me to memecoins · What I was running toward · What I was running from · The life change I hoped for</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">The psychological journey</strong>
              <p><strong>Emotional patterns I discovered:</strong> When did greed take over? · When did fear paralyze me? · How did I handle winning streaks? · How did I cope with losing streaks? · What triggered my worst decisions?</p>
              <p><strong>The lies I told myself:</strong> &quot;This time is different because...&quot; · &quot;I&apos;ll sell when it hits X...&quot; · &quot;Everyone else is making it, why not me?&quot; · &quot;Just one more trade...&quot; · Other delusions</p>
              <p><strong>Moments of clarity:</strong> Times I saw myself clearly · When discipline felt impossible · When I broke my own rules · When I finally learned the lesson</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Strategy evolution</strong>
              <p><strong>How my approach changed:</strong> January strategy · Mid-year adjustments · December reality · What forced me to adapt</p>
              <p><strong>What I thought mattered vs what actually mattered:</strong> Thought: · Reality:</p>
              <p><strong>My real edge (if I have one):</strong> What I&apos;m actually good at · What I&apos;m terrible at · What I pretend to know · Where I add alpha</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Mindset battles</strong>
              <p><strong>The internal conflicts:</strong> Conviction vs doubt · FOMO vs patience · Holding vs selling · Learning vs earning</p>
              <p><strong>Cognitive biases that wrecked me:</strong> Confirmation bias examples · Sunk cost fallacy moments · Anchoring to old prices · Survivorship bias</p>
              <p><strong>When I was most rational:</strong> Conditions that brought out my best · Environment that kept me grounded · People who kept me honest</p>
              <p><strong>When I lost my mind:</strong> Triggers that made me irrational · Warning signs I ignored · How I justified bad trades</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">The hardest truths</strong>
              <p><strong>About myself:</strong> The uncomfortable truth about my discipline · What I value more than money · My actual risk tolerance vs stated · The type of trader I really am</p>
              <p><strong>About the game:</strong> What no one tells you · The part that never gets easier · Why most fail · What success actually costs</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Personal growth markers</strong>
              <p>Before 2025, I would have... / Now I... · Skills I actually developed (trading + life skills) · What changed in how I think · How I handle uncertainty now · My relationship with failure</p>
              <p><strong>The person I&apos;m becoming:</strong> Positive changes I see · Negative patterns emerging · Values being tested · Identity shifts</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Relationships &amp; community</strong>
              <p><strong>How trading changed my relationships:</strong> With family · With friends · With CT / community · With myself</p>
              <p><strong>Who I listened to:</strong> Voices that helped · Voices that hurt · When I should&apos;ve trusted myself · When I should&apos;ve asked for help</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">The reckoning</strong>
              <p><strong>Painful admissions:</strong> Money I lost that I couldn&apos;t afford · Promises I broke to myself · Times I was dishonest · Opportunities I wasted</p>
              <p><strong>What I&apos;m proud of:</strong> Times I showed restraint · When I admitted I was wrong · Moments of genuine growth · Values I didn&apos;t compromise</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Looking inward for 2026</strong>
              <p><strong>Questions I&apos;m sitting with:</strong> Am I trading my life away? · Is this sustainable? · What am I actually optimizing for? · Who do I want to become?</p>
              <p><strong>Non-negotiables going forward:</strong> Lines I won&apos;t cross · Habits I won&apos;t break · Standards I&apos;ll maintain · People I&apos;ll protect</p>
              <p><strong>What needs to change:</strong> In my strategy · In my mindset · In my environment · In my life</p>
              <p><strong>What stays the same:</strong> Core principles · Support system · Why I&apos;m here · What grounds me</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">My promise to myself</strong>
              <p>I will... · I won&apos;t... · I accept that...</p>
              <p><strong>The one thing I need to remember</strong> — write your core truth here; if forgotten, it costs everything you&apos;ve learned.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">Why you keep losing — mind &amp; brain in trading</div>
        <div className="note-body">
          Source: <a href="https://x.com/degn34" target="_blank" rel="noopener noreferrer">@degn34 on X</a>
          <p className="travis-tip-15-lead">Why You Keep Losing: The Truth About Your Mind and Brain in Trading. Small port or rebuilding — it&apos;s not because you&apos;re bad. Your brain is under pressure, and pressure changes how you think. When my account was small, every trade carried life weight: losses = sliding backward / not good enough; wins = validation. That emotional load destroyed decisions before I noticed.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">The war inside your head</strong>
              <p>Your brain doesn&apos;t want you to trade well — it wants relief from boredom, fear, restlessness, sexual tension, the discomfort of sitting still while charts move. It whispers: take a trade, force something, anything but emptiness. Most &quot;intuition&quot; is your nervous system begging for dopamine. Slow days: hollow without stimulation → scan harder, lower standards, invent opportunity. Not discipline — emotional regulation. Low capital makes every trade matter too much — you trade outcomes, not setups (&quot;Can this save my day?&quot;). Patience and risk control walk out together.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">What changed everything</strong>
              <p>Letting go of needing confidence. Confidence is unstable (last trade, balance, mood). Neutrality helps: okay whether you trade, win, lose, or feel bored. Boring is where consistency lives.</p>
              <p>Stopped relying on willpower — designed brain rules: trade limits, fixed risk %, walk away after losses, cap green days before excitement. Urgency = compromised. Excitement = biased. Tired, hungry, overstimulated, horny, restless — even good setups become bad trades. Your body knows before your mind admits it.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">The one-minute rule</strong>
              <p>Urge to enter → wait 60 seconds. Real setups stay; most vanish (internal pressure, not opportunity).</p>
              <p>After red: &quot;make it back&quot; = pain avoidance, not a plan — less activity, not more. Sit with red days. After green: confidence inflates, caution drops — stopping while winning protects best decisions from becoming worst. Most losses = unmanaged internal pressure, not bad chart analysis.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Mind vs brain</strong>
              <p>Mind keeps score, compares your rebuild to someone&apos;s $50k day. Brain wants immediate relief: slow-day trade = dopamine; chase loss = erase pain; post-win rush = lower caution when you need it most. Urges disguise as intuition (&quot;this feels right,&quot; &quot;one more press&quot;).</p>
              <p><strong>How to fix it:</strong> Before any trade — label the feeling (boredom, fear, excitement, impatience, ego). Ask: &quot;Am I responding to a setup, or reacting to a feeling?&quot; If feeling → don&apos;t trade. Build a system where weak mental moments can&apos;t destroy progress. Fixed risk, trade limits, step away after losses/wins, walk when physically/mentally off.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Patience</strong>
              <p>Trusting process when mind screams to do something now. Missing a trade ≠ failure; forcing one while panicked = failure. Slow-day itch with nothing clean → brain wants stimulation — close the app; no trade is valid.</p>
              <p>Rules must be non-negotiable — exceptions become daily reasons to break them ($70 rebuild: bent rules almost always red). Respect how your brain works → trading becomes a process that compounds.</p>
              <p>You&apos;re not broken — aware is the first requirement. Edge isn&apos;t better setups, intelligence, speed, or confidence — it&apos;s managing the person taking trades. Know when your mind lies and your brain begs for relief. Master that first; consistency becomes who you are. With love 💖 &gt; 34.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">The fish &amp; monkey methodology</div>
        <div className="note-body">
          Source: <a href="https://x.com/0xIT41" target="_blank" rel="noopener noreferrer">@0xIT41 on X</a>
          <p className="travis-tip-15-lead">We all have a trading nature. Fish — aim for the shore every day; consistent gains over life-changing stories. Monkeys — want it big and exciting. First step: understand your core. Next: stay loyal to it.</p>
          <p className="travis-tip-15-lead">Loyalty = avoiding useless cope. Monkey: don&apos;t cope over roundtripping. Fish: don&apos;t cope over papering moonshots. Own your nature → adapt to market stages — different markets reward different breeds.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Fish in a believers market</strong>
              <p>Stay a fish — add to your system: <strong>always keep a 10% moonbag</strong></p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Monkey in a jeet market</strong>
              <p>Stay a monkey — add to your system: <strong>always secure initials</strong></p>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>Fish cry on trees, monkeys scream in the ocean — keep loyal to your system or be raped by the cat.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Asymmetrical opportunities always exist</div>
        <div className="note-body">
          Source: <a href="https://x.com/0xMerp" target="_blank" rel="noopener noreferrer">@0xMerp on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Maybe I&apos;m delusional — but I think there will always be some sort of asymmetrical opportunities in our space. Anybody who thinks otherwise might be retarded.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Best coins often have the worst R/R</div>
        <div className="note-body">
          Source: <a href="https://x.com/C1phervoyager" target="_blank" rel="noopener noreferrer">@C1phervoyager on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Some thoughts: the &quot;best&quot; coins are often the worst R/R.</p>
            <p>When something is obviously real — quality launch, working product, clean team, real users, revenue — safest capital shows first (funds, bigger accounts, slow money). Great if you want to park size. Not great if you&apos;re playing for asymmetry like most on CT.</p>
            <p>Speculation has always run crypto — 24/7 attention market in a TikTok society. Nobody wants to sit 5 months for a clean 3–5x while 10 new narratives skyrocket in a week.</p>
            <p>Highest R/R usually lives where uncertainty is highest: new metas, new distribution, messy narratives — can go to zero fast, can reprice 10x+ when coordination comes. The miner meme: no diamonds when everyone knows something is good. That&apos;s why people revive metas like AI — not because it&apos;s crazily good, because it&apos;s unpriceable.</p>
            <p>How do you price a vibecode GitHub that could change how software gets built when the only liquid market is a token chart? Reflexive bids, social premiums, constant re-coordination attempts.</p>
            <p>Good projects don&apos;t die — they become priced. Once priced, you&apos;re not hunting gems, you&apos;re underwriting a business.</p>
            <p>Both views can coexist — but most people confuse them or midcurve the next thing because of it.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">The psychology of greed in day trading</div>
        <div className="note-body">
          Source: <a href="https://x.com/elGodric" target="_blank" rel="noopener noreferrer">@elGodric on X</a>
          <p className="travis-tip-4-lead">Greed isn&apos;t just wanting more money — it&apos;s a neurochemical hijack. Big green P&amp;L (yours or someone else&apos;s) triggers dopamine like a jackpot. Prefrontal cortex gets drowned by limbic &quot;NOW! MORE!&quot; — you abandon edge, oversize, revenge trade, chase setups that aren&apos;t there. Almost every blown retail account has greed (often + envy) at the crime scene.</p>
          <p className="travis-tip-4-lead">3 practical steps the moment greed or envy hits:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">1</span><div><p><strong>Ten-second physiological reset</strong> — chest tightness, heat, urge to click buy on something unplanned → stand up, look away. 5 slow nasal breaths (4s inhale, 6s exhale). Activates parasympathetic system; lowers cortisol/dopamine. Most impulsive trades happen within 30 seconds of the spike — break that window.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">2</span><div><p><strong>Ask the &quot;funeral question&quot; out loud</strong> — &quot;If this trade blows up my account, can I look in the mirror tomorrow and say I followed my plan?&quot; Verbalizing engages language center + prefrontal cortex — shifts from short-term reward to long-term identity: I am a disciplined trader.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">3</span><div><p><strong>Envy → data exercise (60 seconds max)</strong> — someone&apos;s massive green day → open notes and write: their posted win · their probable risk (?) · their screen time/experience (?) · sample size (1 day) · your edge today (actual setup or &quot;none&quot;). Turns emotion into rational audit — usually comparing your Chapter 3 to a highlight reel / survivorship bias.</p></div></div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>Do all three every time greed/envy spikes — cut 80–90% of emotional mistakes. Remaining 10–20% = human; manage with position sizing and you still compound. Most traders won&apos;t survive long enough because nobody talks about psychology.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Finding rhythm — selective in slow markets</div>
        <div className="note-body">
          Source: <a href="https://x.com/jijo_exe" target="_blank" rel="noopener noreferrer">@jijo_exe on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Was out of rhythm the last 2 days but started finding it again today. Sidelined on some bigger narratives — trying new methods to stay in touch with different metas so they don&apos;t keep passing by.</p>
            <p>Slower periods force you to find new edges.</p>
            <p>Being selective is the edge right now.</p>
            <p>If you aren&apos;t willing to stare at new pairs for long periods until the right coin is in front of you, you don&apos;t want it bad enough — you&apos;ll just zero your port. Current conditions give you no option but to improve in some capacity.</p>
            <p>Still hopeful for the coming weeks.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">$180 → $1,800 in a week — memecoin thread</div>
        <div className="note-body">
          Source: <a href="https://x.com/treysocial/status/1950781535373713792" target="_blank" rel="noopener noreferrer">@treysocial on X</a>
          <p className="travis-tip-15-lead">If I wanted to turn $180 into $1,800 in a week trading memecoins — here&apos;s how. Not the best trader; ~$150k this month, some days only a few hours. Lost ~$1,200 first month. Tried every strategy — many work. Safest path: low volume / strong narrative coins. Starting with $180 → don&apos;t take high risk until you build the port.</p>
          <p className="travis-tip-4-lead">Rules to follow:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">1</span><div><p>Buy goes -5% from entry → sell</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">2</span><div><p>Fall in love with the sell button — 10–25% sells, low fees (.0001)</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">3</span><div><p>Stay away from risky high-volume plays</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">4</span><div><p>Work for your bag — if you join a community, like every comment, interact; social proof brings money</p></div></div>
          </div>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Goal: strong narrative</strong>
              <p>Coins not moving too fast + strong narrative. Narrative means:</p>
              <p>Lots of attention / people talking for days to come · Cult-like following developing · Longevity — cannot be replaced by another coin</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">With $180 (1 SOL)</strong>
              <p>Bid .1–.2 if fairly new · .3–.5 if more experienced. (Axiom @trey referral) Profitable in the 1–5 SOL range is the hardest part — once you learn to scale, it&apos;s simple math: $50 → $100 → $200 → $600 on consistent 2x&apos;s.</p>
              <p>Don&apos;t wait for miracle plays. Last 7 days many sells ~50% gains — aggressive profit when starting; miracle plays when you have more to risk.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Example: Dogcoin (~$1M)</strong>
              <p>Community coin with time to research. Narrative: Bonk launchpad talks about &quot;dog coin&quot; so often it should be a real coin.</p>
              <p>They&apos;ll keep saying dog coin (mascot is a dog) · Chance of public endorsement → bullish, higher · Simple concept: dog + coin · Bonk supports communities — this one markets for their company (no-brainer)</p>
              <p>One play like this could take $100 → $1,000+. Be precise — don&apos;t buy low potential or instant -50% setups. 1–4 plays can turn $100 → $200–$1,000+. Patient, max research — you shouldn&apos;t be asking &quot;is this good?&quot; if you did enough work, you&apos;ll know.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Silence and boredom build something real</div>
        <div className="note-body">
          Source: <a href="https://x.com/moadghajate" target="_blank" rel="noopener noreferrer">@moadghajate on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>People don&apos;t realize how much silence and boredom it takes to build something real.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">Trench skillset — master 3 of 4</div>
        <div className="note-body">
          Source: <a href="https://x.com/kom3thazine" target="_blank" rel="noopener noreferrer">@kom3thazine on X</a>
          <p className="travis-tip-15-lead">Trench skillset: to be great (or among the best), master or be advanced in 3 of 4 skills.</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">1. Wallet tracking</strong>
              <p>Most average traders lean advanced here — trends to shorter hold times. Always good to have a plethora of wallets: good traders who spot narratives faster or &quot;insider.&quot; Sleuth enough → right wallets or copytrade gains — but you&apos;re online most of the day; rarely the &quot;wagmi&quot; trade unless lucky (and you&apos;d probably paper anyway) due to noise from other confluence traders.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">2. Execution</strong>
              <p>Gauge how high narrative or valuation can go — mindshare, mechanics, catalysts = the ceiling. Size off risk management and the entry the market gives → exit when catalysts/attention shift or die at your believed top.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">3. Narrative hunting</strong>
              <p>Your DYOR — research if meme/utility can multiply days/weeks/months/years out. Find a good narrative → thesis on why it&apos;s great, undervalued, moon potential, catalysts that prove it. Rarer skill — your own mind, knowledge, experience for targets and invalidations. Master this + execution → higher % of traders.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">4. Mentality</strong>
              <p>Self-aware of state — momentum after wins or coming off a losing streak — but implement discipline. Know what trades you win consistently or prefer from past experience.</p>
              <p>Emotional control: trade best mood, clear mind, zero distractions. Don&apos;t trade frustrated — miss trades or lose money; confidence in yourself first. Know when to take finger off trigger — don&apos;t succumb to FOMO or bad conditions where you have no edge.</p>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p><strong>Conclusion:</strong> Master at least 3 → probably high-skilled above the rest. Trade like the best → be like the best. Always a student; never let money build ego — confidence ≠ ego. Stay humble; bigger fish always exist.</p>
            <p>Shoutout @wallahitrader for the diagram in voice chat.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">A hint of stupidity to pull it off</div>
        <div className="note-body">
          Source: <a href="https://x.com/Powelltrades" target="_blank" rel="noopener noreferrer">@Powelltrades on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Trading is one of those things where you need a hint of stupidity to pull it off.</p>
            <p>Lost $13,000 over 9 months when I started — every month negative. Money I could not afford to lose; all my job income disappearing. Wanted to quit every month. Convinced the market knew my orders and hunted me. Felt stupid; it was draining.</p>
            <p>Kept improving and maturing. Unshakable belief I could pull it off — knew when it first clicked, I could gain it all back in no time.</p>
            <p>Found my model, found my rules, stuck to them — made it all back in 1 month. Most unreal feeling ever.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">Open letter — do something with your life</div>
        <div className="note-body">
          Source: <a href="https://x.com/benroy" target="_blank" rel="noopener noreferrer">@benroy on X</a>
          <p className="travis-tip-4-lead">If you&apos;re young and you make a lot of money this cycle — an open letter to actually go do something with your lives:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Pay off debt</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Be intentional and hang out with your family</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Use financial freedom to learn new skills</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Pursue a cool career arc without worrying about salary</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Invest in being a great friend to people that matter</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Start a company or non-profit in an area you care about</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Use capital to build an empire and extend reach (for good)</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Be generous with your time</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Get married &amp; start your own family</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Fund people working on important projects</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Make art</p></div></div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>Whatever it is — don&apos;t fall for the psyops of lambos, watches, penthouses, first-class holidays, drugs, and the mostly vapor bullshit version of rich life sold to you. Nice things aren&apos;t morally wrong — go for it — but you won&apos;t find much meaning there. I know staggeringly rich people who hate their lives.</p>
            <p>Instead: act, live, create, take risk, face your life, care, build — take advantage of being in the right place at the right time with crypto + work ethic to use the moment.</p>
            <p>You&apos;ve been given a Super Mario invincibility star — life on easy mode. Framing shouldn&apos;t be &quot;hell yeah I can fuck off to the beach&quot; — it should be: &quot;Look at everything I&apos;ve been given — I wonder how much I could accomplish with this.&quot;</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">$0–$10K again — low mcap playbook (thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/ShrekCrypto_" target="_blank" rel="noopener noreferrer">@ShrekCrypto_ on X</a>
          <p className="travis-tip-15-lead">Started with $20 — now 7 figures+. If starting $0–$10k again, trading only low mcap (5–10k). (4 years experience.) Skipping basics — use @AxiomExchange for trading (referral for lower fees).</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <p>Stay under $20k mcap.</p>
              <p>Before any trade ask: what pumps? what narrative can run? how high? exit plan?</p>
              <p><strong>First 3 checks:</strong> holders, socials, relevancy. Buy in-meta — e.g. dog coin pumping 1–10M → chase new cat in same meta.</p>
            </div>
            <div className="travis-tip-15-section">
              <p>Always have holder tab open — stay away when multiple holders are linked (@AxiomExchange built-in). Check SOL balance, top 100 trades — hold long or sell at 2x? All holders holding similar 1–3 SOL = likely bundler/manipulated chart → <strong>STAY AWAY.</strong></p>
              <p>Different criteria at different market caps.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Volume</strong>
              <p>— not indicators; personal observation after hours/day on memecoins (real vs fake). <strong>CHECK HOLDERS</strong> — chart can look primed and you still get rugged.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">Entry &amp; exit</strong>
              <p>Stick to strategy. Small port — don&apos;t chase 10–100x; go for 2–3x (more reps, almost always W). Sell 33% at 3x → initial back, rest moonbag or trim tops. Price impact: 2 SOL sell at $10k mcap can lose ~50% of profits.</p>
            </div>
            <div className="travis-tip-15-section">
              <p><strong>Bundled ≠ always bad</strong> — utilities/insiders shake charts; some biggest wins sneaking early insider plays. Don&apos;t 100% ignore bundles.</p>
            </div>
            <div className="travis-tip-15-section">
              <p><strong>Quit copy trading Cupsey/streamers</strong> — lose 90% of the time. Do track wallets: early projects show volume — know where it came from. Cupsey/streamer copy-trader volume → usually fade unless high/consistent — then wait for those wallets to sell, then enter.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">FI lessons — 10 things learned (thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/CookerFlips" target="_blank" rel="noopener noreferrer">@CookerFlips on X</a>
          <p className="travis-tip-4-lead">2016–2019: nearly every week on /r/Fire/. Achieved FI (RE if wanted) — things learned along the way:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">1</span><div><strong className="travis-tip-4-item-title">Opportunities are endless</strong><p>if you know where to look — pitfall is doing too much at once. Hone one area/niche; great at one thing &gt; mediocre at many.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">2</span><div><strong className="travis-tip-4-item-title">Rome wasn&apos;t built in a day</strong><p>— time, consistent work, smart choices, luck. People see results not the grind. OK to take 1–2 years to build a foundation.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">3</span><div><strong className="travis-tip-4-item-title">Lose it as fast as you make it</strong><p>— especially in our space. No over-leverage, no all-in. Made $20k on options instantly, then lost $50k just as fast.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">4</span><div><strong className="travis-tip-4-item-title">Diversify</strong><p>— ETFs/stocks, liquid cash, crypto. Know your brokerage (Fidelity/Schwab/Vanguard if American).</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">5</span><div><strong className="travis-tip-4-item-title">Multiple income streams</strong><p>— after niche, automate/passive enough to handle more. Aim passive &gt; average salary so active day-to-day failing doesn&apos;t leave you dry. SWE → crypto side → @PastelAlpha + FT job + sneakers → FBA → automated 95% FBA while running Pastel + job; plus dropshipping, FB ads, surveys, etc.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">6</span><div><strong className="travis-tip-4-item-title">Sacrifices</strong><p>— you choose how to deal. 2021–2022 hardest mentally; gave up social life, health/time management wrecked. Something has to give — rebalance when it does.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">7</span><div><strong className="travis-tip-4-item-title">No money replaces friendships, relationships, parents, health.</strong><p>Always more money to make — don&apos;t lose sight of what matters.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">8</span><div><strong className="travis-tip-4-item-title">Find a mentor</strong><p>— learn from those who walked the path. You don&apos;t know everything; guidance makes it 10x easier.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">9</span><div><strong className="travis-tip-4-item-title">Don&apos;t give up</strong><p>— resilient mindset &gt; work ethic alone. Fail a lot before you make it; fuck up → pick up, learn.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">10</span><div><strong className="travis-tip-4-item-title">Enjoy the process</strong><p>— money/time mean nothing without fun. Treat yourself; celebrate small wins; make the journey exciting. Late night writing — good night frens.</p></div></div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">Things I wish I knew before trading memecoins</div>
        <div className="note-body">
          Source: <a href="https://x.com/fomomofosol" target="_blank" rel="noopener noreferrer">@fomomofosol on X</a>
          <p className="travis-tip-4-lead">Things I wish I knew before trading memecoins:</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Buying the top feels worse than missing the pump</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Devs can stealth dump on fresh wallets (bundles) — use tools to check bubble maps</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>2x &gt; 0x — always take profit</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Wallet tracking + chart pattern recognition = massive edge</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>No volume = no exit</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Alpha chats are mid. Friends &gt; followers. Print with people who actually care.</p></div></div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">10 SOL → 1000 SOL in under 2 weeks</div>
        <div className="note-body">
          Source: <a href="https://x.com/AxisAce101" target="_blank" rel="noopener noreferrer">@AxisAce101 on X</a>
          <p className="travis-tip-15-lead">Tips that took a challenge wallet from 10 SOL → 1000 SOL in less than 2 weeks:</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <p><strong>Started</strong> scalping new pairs pre-bonding — plays that ran to $40k+ and came back to $20–25k (ideally dex paid), or coins with a narrative you liked. Aim: 1 SOL for 2x+, take profit on the way up, leave a moonbag. Rinse and repeat.</p>
            </div>
            <div className="travis-tip-15-section">
              <p><strong>Every 5 SOL</strong> made → put into a sub-$10M coin with solid narrative, at least a week old (e.g. KORI at $4M). Kept scalping new pairs while aping &quot;runners of the day.&quot;</p>
            </div>
            <div className="travis-tip-15-section">
              <p><strong>Any Elon or big news</strong> coin with good volume — ape more size (usually &lt;20 SOL). Over time: stack SOL + stack convictions. Now 3 coins held long in the wallet.</p>
            </div>
            <div className="travis-tip-15-section">
              <p><strong>Main thing:</strong> work non-stop until you have an eye for what&apos;s good vs bad. Sounds simple — people blow ports in hours.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-15-card">
        <div className="note-title">Perfect trencher — the game of risk</div>
        <div className="note-body">
          Source: <a href="https://x.com/dv3333333" target="_blank" rel="noopener noreferrer">@dv3333333 on X</a>
          <p className="travis-tip-15-lead">Perfect trencher: the game of risk — every day is another opportunity to improve. Time off streaming to reflect and sharpen the blade. Much experience running a port from absolute zero → some bad habits. Skills to be successful:</p>
          <div className="travis-tip-15-sections">
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">65% — Mental game</strong>
              <p>Trading is a mental war — outlook on coins/narratives stays glass half full. Avoid &quot;this is ass / why is this going&quot; — there&apos;s always a reason something runs; someone sees it. Even weak narrative → stay exposed in some form.</p>
              <p>VC with diverse thinkers = better calls + chill vibes. Drop ego — blast without perfect entry; maximize opportunities, not perfection. Hesitation = EL. Early entry = max extraction. Take losses like a pro — small bag stings; fear of loss is hesitation in disguise.</p>
              <p>Master the meta: volume rotation game — hold through PvP — hedge instantly for sure profit — conviction holding.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">20% — Buy speed &amp; narrative sourcing</strong>
              <p>Price in narratives; understand tops/price targets in any market conditions.</p>
            </div>
            <div className="travis-tip-15-section">
              <strong className="travis-tip-15-section-title">15% — DD &amp; information edge</strong>
              <p>Information war — secure edge first: dev/deployer, funding, article truth &amp; larp, on-chain sentiment, narrative sourcing. Before others → you win, you rob the bank.</p>
            </div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p>Correct decisions at the best time — catch lightning in a bottle. Not perfect; struggle with many of these — day in/day out strive to improve.</p>
            <p>Only you can make your own luck.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">$10K — the gamble that could change everything</div>
        <div className="note-body">
          Source: <a href="https://x.com/route2fi" target="_blank" rel="noopener noreferrer">@route2fi on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Let&apos;s say you have $10k — everything you own after years at McDonald&apos;s. You live in your mother&apos;s basement. You&apos;re 28. Friends and classmates pass you by — good jobs, marriage, houses, cars. You want that too, but who wants a guy at home with a shitty job.</p>
            <p>Fuck it — there must be a way out. Reddit: retire in 30 years via S&amp;P 500. Problem: you want change <strong>now</strong>. No 30 years; no education; McD won&apos;t save you fast.</p>
            <p>More Reddit → crypto → Twitter CT. Something clicks. Losers like you gambling small net worths hoping to get rich extremely fast. You roll the dice.</p>
            <p>Hooked on memecoins — <strong>10x or nothing</strong>. What do you have to lose? Life sucks anyway — gamble it all. Lose → try again next month with the $2k paycheck; life stays the same.</p>
            <p>But if you win — you fucking change your life.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">0.1 SOL → ~150 SOL in 1 month (thread)</div>
        <div className="note-body">
          Source: <a href="https://x.com/Euris_x" target="_blank" rel="noopener noreferrer">@Euris_x on X</a>
          <p className="travis-tip-4-lead">How I went from 0.1 SOL (~$18) to ~150 SOL (~$23,400) in 1 month.</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">1</span><div><strong className="travis-tip-4-item-title">Find an alpha group</strong><p>Can&apos;t do this solo with a tiny port. @yogurt_eth &amp; @YogurtVerse — best group from the start.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">2</span><div><strong className="travis-tip-4-item-title">Aggressively take profit</strong><p>Don&apos;t fear missing 5–10x from early TP. Full-port 0.1, out at +50%. No capital to risk going to 0. If it goes to millions you&apos;ll hate yourself — slow grind; % is key.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">3</span><div><strong className="travis-tip-4-item-title">Don&apos;t chase</strong><p>Up fast, down faster. Many top-blasts → instant free fall. Not worth it if you aren&apos;t early.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">4</span><div><strong className="travis-tip-4-item-title">Cut losses early</strong><p>You&apos;ll lose a lot — part of the process. Down 25–40% → cut. Rarely reverses from -50%; right decision in the moment.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">5</span><div><strong className="travis-tip-4-item-title">Don&apos;t fall for FUD</strong><p>Fudded out at -50%, hour later 5x from entry. DYOR + trust intuition — fud is a lie ~75% of the time.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">6</span><div><strong className="travis-tip-4-item-title">You&apos;re a trader, not a community member</strong><p>Stop bag holding. 95% won&apos;t hit $1B — take profit and move on. Get rich, not send stickers all day.</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">7</span><div><strong className="travis-tip-4-item-title">Your size ≠ someone else&apos;s</strong><p>Had to full-port 0.1 while others threw 10 SOL. Stick to unit size — don&apos;t blow the port. Still ape .25–.5 on sub-50k; most go to 0. 10 SOL port buying 5 SOL on 20k rug = half the port gone — ape smaller, loss hurts less.</p></div></div>
          </div>
          <div className="pullupso-quote decu-advice-quote">
            <p><strong>End:</strong> Traders not community members — you don&apos;t have money to &quot;invest&quot; for fun. Make bread and move on.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Betting on yourself — consequence</div>
        <div className="note-body">
          Source: <a href="https://x.com/thedulab" target="_blank" rel="noopener noreferrer">@thedulab on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>The consequence of betting on yourself: you&apos;ll never be able to apply for a job again. Not that nobody will hire you — it&apos;ll just feel like a humiliation ritual every time.</p>
            <p>Self-belief becomes a spiritual drug that won&apos;t let you beg for validation. Convince us why we should acknowledge your existence. Let our little AI screener dictate your future? No — you should be telling me why I should join you.</p>
            <p>Not an objective knock on employment — opportunities now come from referrals, introductions, serendipity with people who see you as you see yourself. You can no longer accept working for, only with.</p>
            <p>When one big door opens, exit routes close behind you — fewer options, higher quality. Understand the psychological trade. Whether it&apos;s worth it is up to you; there&apos;s only one way to find out.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">Locked in 2024 — memescope 18 hours</div>
        <div className="note-body">
          Source: <a href="https://x.com/malikonchain" target="_blank" rel="noopener noreferrer">@malikonchain on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>Shed a tear today thinking about how good it felt in 2024 — locked in all day in the trenches. Didn&apos;t check Instagram, didn&apos;t watch YouTube, nothing — just memescope 18 hours a day, averaging ~$50k/month throughout that year.</p>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card travis-tip-4-card">
        <div className="note-title">If you can afford a nice car — buy it</div>
        <div className="note-body">
          Source: <a href="https://x.com/mrplentyhoes" target="_blank" rel="noopener noreferrer">@mrplentyhoes on X</a>
          <p className="travis-tip-4-lead">If you can afford a nice car — buy it.</p>
          <div className="travis-tip-4-checklist">
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Girls love getting picked up in them</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Super fun to own and drive</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Flex on social media and get connections in your city</p></div></div>
            <div className="travis-tip-4-item"><span className="travis-tip-4-num" aria-hidden="true">·</span><div><p>Doesn&apos;t have to be a Pagani — a Benz or BMW works. Buy it in your 20s.</p></div></div>
          </div>
        </div>
      </div>
      <div className="note-card pullupso-card">
        <div className="note-title">25× annual spend — before you quit the job</div>
        <div className="note-body">
          Source: <a href="https://x.com/mahasr199" target="_blank" rel="noopener noreferrer">@mahasr199 on X</a>
          <div className="pullupso-quote decu-advice-quote">
            <p>You need 25 times your annual spend to not think about having a job.</p>
            <p>If you spend $250k/year (basic lifestyle for a family), that number is $6.25mm.</p>
            <p>Makes no sense to get rid of active before hitting that.</p>
            <p>Really you want to overshoot that to have breathing room.</p>
          </div>
        </div>
      </div>
      <div className="note-card trade-hours-styles-card">
        <div className="note-title">Trade hours — trading styles</div>
        <div className="note-body">
          <div className="trade-hours-styles-sections">
            <div className="trade-hours-styles-block">
              <strong className="trade-hours-styles-region">NA</strong>
              <p>New Pairs</p>
            </div>
            <div className="trade-hours-styles-block">
              <strong className="trade-hours-styles-region">Asia</strong>
              <p>Final Stretch + Migration</p>
            </div>
            <div className="trade-hours-styles-block">
              <strong className="trade-hours-styles-region">EU</strong>
              <p>New Pairs + Final Stretch</p>
            </div>
          </div>
        </div>
      </div>
      <div className="note-card memecoin-mindset-card">
        <div className="note-title memecoin-mindset-heading">Millionaire memecoin mindset</div>
        <div className="note-body">
          <p className="memecoin-mindset-subtitle">
            30 lessons from Crypto Chris&apos;s mindset series — the mental edge most traders skip.
          </p>
          <PlaybookLessonGrid lessons={MEMECOIN_MINDSET_LESSONS} />
          <p className="playbook-attribution">Based on Crypto Chris&apos;s Millionaire Memecoin Mindset Series</p>
        </div>
      </div>
      <div className="note-card playbook-section-card">
        <div className="note-title playbook-section-title">Strategy playbook</div>
        <div className="note-body">
          <p className="memecoin-mindset-subtitle">
            Tactical breakdowns from Sebastian Orellana — filters, setups, and execution frameworks.
          </p>
          <PlaybookLessonGrid lessons={STRATEGY_PLAYBOOK_LESSONS} />
          <p className="playbook-attribution">Based on Sebastian Orellana&apos;s YouTube strategy breakdowns</p>
        </div>
      </div>
      <div className="note-card playbook-section-card">
        <div className="note-title playbook-section-title">The alpha playbook</div>
        <div className="note-body">
          <p className="memecoin-mindset-subtitle">
            Key frameworks from James Wang — the Alpha Filter, scalping systems, risk management, and narrative-driven execution.
          </p>
          <PlaybookLessonGrid lessons={ALPHA_PLAYBOOK_LESSONS} />
          <p className="playbook-attribution">Based on James Wang&apos;s YouTube strategy breakdowns</p>
        </div>
      </div>
      <div className="note-card playbook-section-card">
        <div className="note-title playbook-section-title">The fortune playbook</div>
        <div className="note-body">
          <p className="memecoin-mindset-subtitle">
            Narrative-driven strategies, risk frameworks, and execution systems broken down from Alex Choi&apos;s videos.
          </p>
          <PlaybookLessonGrid lessons={FORTUNE_PLAYBOOK_LESSONS} />
          <p className="playbook-attribution">Based on Alex Choi&apos;s YouTube strategy breakdowns</p>
        </div>
      </div>
      <div className="note-card playbook-section-card">
        <div className="note-title playbook-section-title">Sol Mafia playbook</div>
        <div className="note-body">
          <p className="memecoin-mindset-subtitle">
            Memecoin trading systems, tool setups, and daily execution from Ethan Prosper&apos;s videos.
          </p>
          <PlaybookLessonGrid lessons={SOL_MAFIA_PLAYBOOK_LESSONS} />
          <p className="playbook-attribution">Based on Ethan Prosper&apos;s YouTube strategy breakdowns</p>
          <div className="note-subsection playbook-observation">
            <p className="note-subsection-title">Observation</p>
            <p className="memecoin-mindset-subtitle">
              <em>On slow cooks, liquidity, and sitting still in the trenches.</em>
            </p>
            <div className="playbook-observation-list">
              {SOL_MAFIA_OBSERVATIONS.map((observation, index) => (
                <div key={index} className="playbook-observation-item">
                  <p>{observation.text}</p>
                  {observation.xHandle ? (
                    <p className="playbook-observation-source">
                      <a
                        href={`https://x.com/${observation.xHandle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        @{observation.xHandle} on X
                      </a>
                    </p>
                  ) : null}
                  {observation.author ? (
                    <p className="playbook-observation-source">{observation.author}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
