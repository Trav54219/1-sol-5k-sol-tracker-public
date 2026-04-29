export const FINAL = 5000;
export const TOTAL_DAYS = 73;
export const LS_KEY = "sol_speedrun_checked";

export type SizingMode = "conservative" | "pullupso";

export type Phase = {
  id: number;
  label: string;
  days: number;
  color: string;
  bg: string;
  border: string;
};

export type DayPlan = {
  day: number;
  start: number;
  end: number;
  phase: number;
  unlock: string | null;
  milestone?: string;
};

export const phases: Phase[] = [
  { id: 1, label: "Phase 1 · Days 1-16 · 1→16 SOL · Micro grind", days: 16, color: "#0a7c52", bg: "rgba(10,124,82,0.06)", border: "rgba(10,124,82,0.22)" },
  { id: 2, label: "Phase 2 · Days 17-27 · 16→86 SOL · Building base", days: 11, color: "#1a56a0", bg: "rgba(26,86,160,0.06)", border: "rgba(26,86,160,0.22)" },
  { id: 3, label: "Phase 3 · Days 28-38 · 86→364 SOL · Scaling up", days: 11, color: "#a05f00", bg: "rgba(160,95,0,0.06)", border: "rgba(160,95,0,0.22)" },
  { id: 4, label: "Phase 4 · Days 39-42 · 364→569 SOL · 3 SOL target", days: 4, color: "#7c1fa0", bg: "rgba(124,31,160,0.06)", border: "rgba(124,31,160,0.22)" },
  { id: 5, label: "Phase 5 · Days 43-57 · 569→1980 SOL · Upper tier", days: 15, color: "#0e7490", bg: "rgba(14,116,144,0.06)", border: "rgba(14,116,144,0.22)" },
  { id: 6, label: "Phase 6 · Days 58-73 · 1980→5030 SOL · Endgame", days: 16, color: "#8a6800", bg: "rgba(138,104,0,0.06)", border: "rgba(138,104,0,0.22)" },
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
  { day: 72, start: 4476.46, end: 4745.04, phase: 6, unlock: null }, { day: 73, start: 4745.04, end: 5029.74, phase: 6, unlock: null, milestone: "5,000 SOL" },
];

const mbByDay = [
  { from: 1, mb: "0.04 SOL" }, { from: 4, mb: "0.06 SOL" }, { from: 8, mb: "0.1 SOL" }, { from: 12, mb: "0.15 SOL" },
  { from: 14, mb: "0.2 SOL" }, { from: 16, mb: "0.3 SOL" }, { from: 18, mb: "0.4 SOL" }, { from: 20, mb: "0.5 SOL" },
  { from: 22, mb: "0.65 SOL" }, { from: 24, mb: "0.85 SOL" }, { from: 27, mb: "1 SOL" }, { from: 29, mb: "1.25 SOL" },
  { from: 31, mb: "1.5 SOL" }, { from: 33, mb: "1.75 SOL" }, { from: 35, mb: "2 SOL" }, { from: 37, mb: "2.25 SOL" },
  { from: 39, mb: "2.5 SOL" }, { from: 41, mb: "2.75 SOL" }, { from: 42, mb: "3 SOL" }, { from: 44, mb: "3.25 SOL" },
  { from: 46, mb: "3.5 SOL" }, { from: 48, mb: "3.75 SOL" }, { from: 51, mb: "4 SOL" }, { from: 54, mb: "4.25 SOL" },
  { from: 57, mb: "4.5 SOL" },
];

export function getMBValue(day: number) {
  let maxBuy = 0.04;
  for (const entry of mbByDay) {
    if (day >= entry.from) maxBuy = parseFloat(entry.mb);
  }
  return maxBuy;
}

export function getMB(day: number) {
  return `${fmtSizing(getMBValue(day))} SOL`;
}

export function getSizingAmount(day: number, stack: number, mode: SizingMode) {
  if (mode === "conservative") return getMBValue(day);
  return getPullupsoSizing(stack);
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
