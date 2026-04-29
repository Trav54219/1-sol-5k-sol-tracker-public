export const FINAL = 5000;
export const TOTAL_DAYS = 73;
export const LS_KEY = "sol_speedrun_checked";

export type SizingMode = "conservative" | "pullupso";
export type TimeframeId = "default" | "7" | "14" | "21" | "30" | "45" | "60" | "75";

export type Phase = {
  id: number;
  label: string;
  days: number;
  color: string;
  bg: string;
  border: string;
};

type PhaseBase = Omit<Phase, "label" | "days"> & {
  name: string;
};

export type DayPlan = {
  day: number;
  start: number;
  end: number;
  phase: number;
  unlock: string | null;
  milestone?: string;
};

export type TimeframeOption = {
  id: TimeframeId;
  label: string;
  days: number;
  detail: string;
};

export type TimeframePlan = {
  option: TimeframeOption;
  days: DayPlan[];
  phases: Phase[];
  dailyGrowthRate: number;
};

export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { id: "default", label: "Regular", days: TOTAL_DAYS, detail: "Original 73-day curve" },
  { id: "7", label: "7 days", days: 7, detail: "Extreme sprint" },
  { id: "14", label: "14 days", days: 14, detail: "Two-week sprint" },
  { id: "21", label: "21 days", days: 21, detail: "Three-week sprint" },
  { id: "30", label: "30 days", days: 30, detail: "One-month push" },
  { id: "45", label: "45 days", days: 45, detail: "Fast plan" },
  { id: "60", label: "60 days", days: 60, detail: "Accelerated plan" },
  { id: "75", label: "75 days", days: 75, detail: "Slightly slower plan" },
];

const phaseBases: PhaseBase[] = [
  { id: 1, name: "Micro grind", color: "#0a7c52", bg: "rgba(10,124,82,0.06)", border: "rgba(10,124,82,0.22)" },
  { id: 2, name: "Building base", color: "#1a56a0", bg: "rgba(26,86,160,0.06)", border: "rgba(26,86,160,0.22)" },
  { id: 3, name: "Scaling up", color: "#a05f00", bg: "rgba(160,95,0,0.06)", border: "rgba(160,95,0,0.22)" },
  { id: 4, name: "3 SOL target", color: "#7c1fa0", bg: "rgba(124,31,160,0.06)", border: "rgba(124,31,160,0.22)" },
  { id: 5, name: "Upper tier", color: "#0e7490", bg: "rgba(14,116,144,0.06)", border: "rgba(14,116,144,0.22)" },
  { id: 6, name: "Endgame", color: "#8a6800", bg: "rgba(138,104,0,0.06)", border: "rgba(138,104,0,0.22)" },
];

export const days: DayPlan[] = [
  { day: 1, start: 1.0, end: 1.2, phase: 1, unlock: null }, { day: 2, start: 1.2, end: 1.44, phase: 1, unlock: null },
  { day: 3, start: 1.44, end: 1.73, phase: 1, unlock: null }, { day: 4, start: 1.73, end: 2.08, phase: 1, unlock: "0.06 SOL" },
  { day: 5, start: 2.08, end: 2.48, phase: 1, unlock: null }, { day: 6, start: 2.48, end: 2.95, phase: 1, unlock: null },
  { day: 7, start: 2.95, end: 3.51, phase: 1, unlock: null }, { day: 8, start: 3.51, end: 4.16, phase: 1, unlock: "0.1 SOL" },
  { day: 9, start: 4.16, end: 4.94, phase: 1, unlock: null }, { day: 10, start: 4.94, end: 5.87, phase: 1, unlock: null },
  { day: 11, start: 5.87, end: 6.97, phase: 1, unlock: null }, { day: 12, start: 6.97, end: 8.27, phase: 1, unlock: "0.15 SOL" },
  { day: 13, start: 8.27, end: 9.76, phase: 1, unlock: null }, { day: 14, start: 9.76, end: 11.52, phase: 1, unlock: "0.2 SOL" },
  { day: 15, start: 11.52, end: 13.57, phase: 1, unlock: null }, { day: 16, start: 13.57, end: 15.93, phase: 1, unlock: "0.3 SOL" },
  { day: 17, start: 15.93, end: 18.62, phase: 2, unlock: null }, { day: 18, start: 18.62, end: 21.77, phase: 2, unlock: "0.4 SOL" },
  { day: 19, start: 21.77, end: 25.47, phase: 2, unlock: null }, { day: 20, start: 25.47, end: 29.8, phase: 2, unlock: "0.5 SOL" },
  { day: 21, start: 29.8, end: 34.89, phase: 2, unlock: null }, { day: 22, start: 34.89, end: 40.82, phase: 2, unlock: "0.65 SOL" },
  { day: 23, start: 40.82, end: 47.56, phase: 2, unlock: null }, { day: 24, start: 47.56, end: 55.38, phase: 2, unlock: "0.85 SOL" },
  { day: 25, start: 55.38, end: 64.24, phase: 2, unlock: null }, { day: 26, start: 64.24, end: 74.52, phase: 2, unlock: null },
  { day: 27, start: 74.52, end: 86.04, phase: 2, unlock: "1 SOL" }, { day: 28, start: 86.04, end: 98.95, phase: 3, unlock: null },
  { day: 29, start: 98.95, end: 113.79, phase: 3, unlock: "1.25 SOL" }, { day: 30, start: 113.79, end: 130.37, phase: 3, unlock: null },
  { day: 31, start: 130.37, end: 148.62, phase: 3, unlock: "1.5 SOL" }, { day: 32, start: 148.62, end: 169.43, phase: 3, unlock: null },
  { day: 33, start: 169.43, end: 193.15, phase: 3, unlock: "1.75 SOL" }, { day: 34, start: 193.15, end: 220.19, phase: 3, unlock: null },
  { day: 35, start: 220.19, end: 251.02, phase: 3, unlock: "2 SOL" }, { day: 36, start: 251.02, end: 284.65, phase: 3, unlock: null },
  { day: 37, start: 284.65, end: 322.46, phase: 3, unlock: "2.25 SOL" }, { day: 38, start: 322.46, end: 364.38, phase: 3, unlock: null },
  { day: 39, start: 364.38, end: 407.31, phase: 4, unlock: "2.5 SOL" }, { day: 40, start: 407.31, end: 455.39, phase: 4, unlock: null },
  { day: 41, start: 455.39, end: 509.24, phase: 4, unlock: "2.75 SOL" }, { day: 42, start: 509.24, end: 569.35, phase: 4, unlock: "3 SOL", milestone: "3 SOL MB" },
  { day: 43, start: 569.35, end: 626.29, phase: 5, unlock: null }, { day: 44, start: 626.29, end: 688.92, phase: 5, unlock: "3.25 SOL" },
  { day: 45, start: 688.92, end: 757.81, phase: 5, unlock: null }, { day: 46, start: 757.81, end: 826.01, phase: 5, unlock: "3.5 SOL" },
  { day: 47, start: 826.01, end: 900.35, phase: 5, unlock: null }, { day: 48, start: 900.35, end: 981.38, phase: 5, unlock: "3.75 SOL" },
  { day: 49, start: 981.38, end: 1069.7, phase: 5, unlock: null }, { day: 50, start: 1069.7, end: 1155.28, phase: 5, unlock: null },
  { day: 51, start: 1155.28, end: 1247.7, phase: 5, unlock: "4 SOL" }, { day: 52, start: 1247.7, end: 1347.52, phase: 5, unlock: null },
  { day: 53, start: 1347.52, end: 1455.32, phase: 5, unlock: null }, { day: 54, start: 1455.32, end: 1571.75, phase: 5, unlock: "4.25 SOL" },
  { day: 55, start: 1571.75, end: 1697.49, phase: 5, unlock: null }, { day: 56, start: 1697.49, end: 1833.29, phase: 5, unlock: null },
  { day: 57, start: 1833.29, end: 1979.95, phase: 5, unlock: "4.5 SOL", milestone: "4.5 SOL cap" },
  { day: 58, start: 1979.95, end: 2098.75, phase: 6, unlock: null }, { day: 59, start: 2098.75, end: 2224.67, phase: 6, unlock: null },
  { day: 60, start: 2224.67, end: 2358.15, phase: 6, unlock: null }, { day: 61, start: 2358.15, end: 2499.64, phase: 6, unlock: null },
  { day: 62, start: 2499.64, end: 2649.61, phase: 6, unlock: null }, { day: 63, start: 2649.61, end: 2808.59, phase: 6, unlock: null },
  { day: 64, start: 2808.59, end: 2977.1, phase: 6, unlock: null }, { day: 65, start: 2977.1, end: 3155.73, phase: 6, unlock: null },
  { day: 66, start: 3155.73, end: 3345.07, phase: 6, unlock: null }, { day: 67, start: 3345.07, end: 3545.78, phase: 6, unlock: null },
  { day: 68, start: 3545.78, end: 3758.52, phase: 6, unlock: null }, { day: 69, start: 3758.52, end: 3984.03, phase: 6, unlock: null },
  { day: 70, start: 3984.03, end: 4223.07, phase: 6, unlock: null }, { day: 71, start: 4223.07, end: 4476.46, phase: 6, unlock: null },
  { day: 72, start: 4476.46, end: 4745.04, phase: 6, unlock: null }, { day: 73, start: 4745.04, end: 5029.74, phase: 6, unlock: null, milestone: "Goal reached" },
];

export const phases = buildPhases(days, TOTAL_DAYS);

const conservativeLadder = [
  { minStack: 1, mb: 0.04 }, { minStack: 1.73, mb: 0.06 }, { minStack: 3.51, mb: 0.1 }, { minStack: 6.97, mb: 0.15 },
  { minStack: 9.76, mb: 0.2 }, { minStack: 13.57, mb: 0.3 }, { minStack: 18.62, mb: 0.4 }, { minStack: 25.47, mb: 0.5 },
  { minStack: 34.89, mb: 0.65 }, { minStack: 47.56, mb: 0.85 }, { minStack: 74.52, mb: 1 }, { minStack: 98.95, mb: 1.25 },
  { minStack: 130.37, mb: 1.5 }, { minStack: 169.43, mb: 1.75 }, { minStack: 220.19, mb: 2 }, { minStack: 284.65, mb: 2.25 },
  { minStack: 364.38, mb: 2.5 }, { minStack: 455.39, mb: 2.75 }, { minStack: 509.24, mb: 3 }, { minStack: 626.29, mb: 3.25 },
  { minStack: 757.81, mb: 3.5 }, { minStack: 900.35, mb: 3.75 }, { minStack: 1155.28, mb: 4 }, { minStack: 1455.32, mb: 4.25 },
  { minStack: 1833.29, mb: 4.5 },
];

export function getMBValue(day: number) {
  return getConservativeSizing(days[Math.max(day - 1, 0)]?.start ?? 1);
}

export function getMB(day: number) {
  return `${fmtSizing(getMBValue(day))} SOL`;
}

export function getSizingAmount(_day: number, stack: number, mode: SizingMode) {
  if (mode === "conservative") return getConservativeSizing(stack);
  return getPullupsoSizing(stack);
}

export function getConservativeSizing(stack: number) {
  return getConservativeSizingEntry(stack).mb;
}

export function getConservativeSizingEntry(stack: number) {
  let maxBuy = conservativeLadder[0].mb;
  let threshold = conservativeLadder[0].minStack;
  for (const entry of conservativeLadder) {
    if (stack >= entry.minStack) {
      maxBuy = entry.mb;
      threshold = entry.minStack;
    }
  }
  return { mb: maxBuy, threshold };
}

export function getTimeframePlan(timeframeId: TimeframeId): TimeframePlan {
  const option = TIMEFRAME_OPTIONS.find((candidate) => candidate.id === timeframeId) ?? TIMEFRAME_OPTIONS[0];
  const planDays = option.id === "default" ? days : generateDays(option.days);
  return {
    option,
    days: planDays,
    phases: buildPhases(planDays, option.days),
    dailyGrowthRate: getDailyGrowthRate(option.days),
  };
}

export function isTimeframeId(value: string | null): value is TimeframeId {
  return TIMEFRAME_OPTIONS.some((option) => option.id === value);
}

function generateDays(totalDays: number) {
  const dailyMultiplier = Math.pow(FINAL, 1 / totalDays);
  const phaseDayCounts = getPhaseDayCounts(totalDays);
  const planDays: DayPlan[] = [];
  let previousConservativeSize = getConservativeSizing(1);

  for (let index = 0; index < totalDays; index += 1) {
    const day = index + 1;
    const start = day === 1 ? 1 : Math.pow(dailyMultiplier, index);
    const end = day === totalDays ? FINAL : Math.pow(dailyMultiplier, day);
    const conservativeSize = getConservativeSizing(start);
    const phase = getPhaseForDay(day, phaseDayCounts);
    const unlock = conservativeSize > previousConservativeSize ? `${fmtSizing(conservativeSize)} SOL` : null;
    const milestone = day === totalDays ? "Goal reached" : getMilestone(conservativeSize, previousConservativeSize);

    planDays.push({
      day,
      start: roundPlanAmount(start),
      end: roundPlanAmount(end),
      phase,
      unlock,
      milestone,
    });
    previousConservativeSize = conservativeSize;
  }

  return planDays;
}

function buildPhases(planDays: DayPlan[], totalDays: number): Phase[] {
  const phaseDayCounts = getPhaseDayCounts(totalDays);
  let startDay = 1;
  return phaseBases.map((base, index) => {
    const phaseDays = phaseDayCounts[index];
    const endDay = startDay + phaseDays - 1;
    const first = planDays[startDay - 1];
    const last = planDays[endDay - 1];
    const label = `Phase ${base.id} · Days ${startDay}-${endDay} · ${fmt(first.start)}→${fmt(last.end)} SOL · ${base.name}`;
    startDay = endDay + 1;

    return {
      id: base.id,
      label,
      days: phaseDays,
      color: base.color,
      bg: base.bg,
      border: base.border,
    };
  });
}

function getPhaseDayCounts(totalDays: number) {
  if (totalDays === TOTAL_DAYS) return [16, 11, 11, 4, 15, 16];

  const ratios = [16, 11, 11, 4, 15, 16].map((count) => count / TOTAL_DAYS);
  const rawCounts = ratios.map((ratio) => ratio * totalDays);
  const counts = rawCounts.map((count) => Math.max(Math.floor(count), 1));
  let remaining = totalDays - counts.reduce((sum, count) => sum + count, 0);

  const remainders = rawCounts
    .map((count, index) => ({ index, remainder: count - Math.floor(count) }))
    .sort((a, b) => b.remainder - a.remainder);

  while (remaining > 0) {
    for (const { index } of remainders) {
      if (remaining <= 0) break;
      counts[index] += 1;
      remaining -= 1;
    }
  }

  while (remaining < 0) {
    for (const { index } of [...remainders].reverse()) {
      if (remaining >= 0) break;
      if (counts[index] <= 1) continue;
      counts[index] -= 1;
      remaining += 1;
    }
  }

  return counts;
}

function getPhaseForDay(day: number, phaseDayCounts: number[]) {
  let endDay = 0;
  for (let index = 0; index < phaseDayCounts.length; index += 1) {
    endDay += phaseDayCounts[index];
    if (day <= endDay) return index + 1;
  }
  return phaseDayCounts.length;
}

function getDailyGrowthRate(totalDays: number) {
  return Math.pow(FINAL, 1 / totalDays) - 1;
}

function getMilestone(currentSize: number, previousSize: number) {
  if (currentSize >= 4.5 && previousSize < 4.5) return "4.5 SOL cap";
  if (currentSize >= 3 && previousSize < 3) return "3 SOL MB";
  return undefined;
}

function roundPlanAmount(value: number) {
  if (value >= 1000) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function getPullupsoSizing(stack: number) {
  if (stack < 2) return clamp(stack * 0.12, 0.04, 0.2);
  if (stack < 5) return clamp(stack * 0.24, 0.5, 1);
  if (stack < 20) return clamp(stack * 0.15, 0.5, 3);
  if (stack < 50) return clamp(stack * 0.12, 2, 5);
  if (stack < 100) return clamp(stack * 0.1, 5, 8);
  if (stack < 300) return clamp(stack * 0.08, 8, 20);
  if (stack < 1000) return clamp(stack * 0.05, 20, 35);
  return clamp(stack * 0.025, 35, 50);
}

export function fmtSizing(n: number) {
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, "");
  if (n >= 1) return n.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  return n.toFixed(2).replace(/0$/, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function fmt(n: number) {
  if (n >= 1000) return n.toLocaleString("en", { maximumFractionDigits: 0 });
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}
