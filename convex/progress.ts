import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const tradeJournalEntryValidator = v.object({
  createdAt: v.number(),
  day: v.number(),
  id: v.string(),
  notes: v.string(),
  pnl: v.string(),
  result: v.union(v.literal("win"), v.literal("loss"), v.literal("breakeven"), v.literal("note")),
  ticker: v.string(),
});

const activePlanObjectValidator = v.object({
  challengeMode: v.union(v.literal("sol"), v.literal("usdc")),
  challengeStartDate: v.string(),
  goals: v.object({
    sol: v.number(),
    usdc: v.number(),
  }),
  notes: v.string(),
  planPreset: v.optional(v.union(v.literal("flexible"), v.literal("og"))),
  sizingMode: v.union(v.literal("conservative"), v.literal("pullupso")),
  startedAt: v.number(),
  starts: v.object({
    sol: v.number(),
    usdc: v.number(),
  }),
  timeframe: v.union(v.literal("default"), v.literal("3"), v.literal("5"), v.literal("7"), v.literal("14"), v.literal("21"), v.literal("30"), v.literal("45"), v.literal("60"), v.literal("75")),
  tradeJournal: v.array(tradeJournalEntryValidator),
});

const activePlanValidator = v.union(activePlanObjectValidator, v.null());

const planHistoryValidator = v.array(v.object({
  activePlan: activePlanObjectValidator,
  archivedAt: v.number(),
  id: v.string(),
  progress: v.object({
    checkedDays: v.array(v.number()),
    completions: v.number(),
  }),
  reason: v.union(v.literal("completed"), v.literal("restarted")),
}));

type ActivePlanInput = {
  challengeMode: "sol" | "usdc";
  challengeStartDate: string;
  goals: {
    sol: number;
    usdc: number;
  };
  notes: string;
  planPreset?: "flexible" | "og";
  sizingMode: "conservative" | "pullupso";
  startedAt: number;
  starts: {
    sol: number;
    usdc: number;
  };
  timeframe: "default" | "3" | "5" | "7" | "14" | "21" | "30" | "45" | "60" | "75";
  tradeJournal: {
    createdAt: number;
    day: number;
    id: string;
    notes: string;
    pnl: string;
    result: "win" | "loss" | "breakeven" | "note";
    ticker: string;
  }[];
} | null;

async function requireUserIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Sign in to save progress.");
  }
  return identity;
}

async function getOptionalUserIdentity(ctx: QueryCtx | MutationCtx) {
  return await ctx.auth.getUserIdentity();
}

async function getProgressForUser(ctx: QueryCtx | MutationCtx, identity: { subject: string; tokenIdentifier: string }) {
  const current = await ctx.db
    .query("progress")
    .withIndex("by_user_identifier", (q) => q.eq("userIdentifier", identity.tokenIdentifier))
    .unique();

  if (current) return current;

  return await ctx.db
    .query("progress")
    .withIndex("by_user_subject", (q) => q.eq("userSubject", identity.subject))
    .unique();
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getOptionalUserIdentity(ctx);
    if (!identity) return emptyProgress();

    const progress = await getProgressForUser(ctx, identity);

    return {
      activePlan: progress?.activePlan ?? null,
      planHistory: progress?.planHistory ?? [],
      sol: {
        checkedDays: progress?.solCheckedDays ?? progress?.checkedDays ?? [],
        completions: progress?.solCompletions ?? progress?.completions ?? 0,
      },
      usdc: {
        checkedDays: progress?.usdcCheckedDays ?? [],
        completions: progress?.usdcCompletions ?? 0,
      },
    };
  },
});

function emptyProgress() {
  return {
    activePlan: null,
    planHistory: [],
    sol: {
      checkedDays: [],
      completions: 0,
    },
    usdc: {
      checkedDays: [],
      completions: 0,
    },
  };
}

export const set = mutation({
  args: {
    sol: v.object({
      checkedDays: v.array(v.number()),
      completions: v.number(),
    }),
    usdc: v.object({
      checkedDays: v.array(v.number()),
      completions: v.number(),
    }),
    activePlan: activePlanValidator,
    planHistory: planHistoryValidator,
  },
  handler: async (ctx, args) => {
    const identity = await requireUserIdentity(ctx);
    const solCheckedDays = sanitizeCheckedDays(args.sol.checkedDays);
    const solCompletions = clampCompletions(args.sol.completions);
    const usdcCheckedDays = sanitizeCheckedDays(args.usdc.checkedDays);
    const usdcCompletions = clampCompletions(args.usdc.completions);
    const existing = await getProgressForUser(ctx, identity);

    if (existing) {
      await ctx.db.patch(existing._id, {
        checkedDays: solCheckedDays,
        completions: solCompletions,
        solCheckedDays,
        solCompletions,
        usdcCheckedDays,
        usdcCompletions,
        activePlan: sanitizeActivePlan(args.activePlan),
        planHistory: sanitizePlanHistory(args.planHistory),
        updatedAt: Date.now(),
        userIdentifier: identity.tokenIdentifier,
        userSubject: identity.subject,
      });
    } else {
      await ctx.db.insert("progress", {
        checkedDays: solCheckedDays,
        completions: solCompletions,
        solCheckedDays,
        solCompletions,
        usdcCheckedDays,
        usdcCompletions,
        activePlan: sanitizeActivePlan(args.activePlan),
        planHistory: sanitizePlanHistory(args.planHistory),
        updatedAt: Date.now(),
        userIdentifier: identity.tokenIdentifier,
        userSubject: identity.subject,
      });
    }

    return null;
  },
});

function sanitizeCheckedDays(checkedDays: number[]) {
  return [...new Set(checkedDays)]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 75)
    .sort((a, b) => a - b);
}

function clampCompletions(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), 100);
}

function sanitizeActivePlan(activePlan: ActivePlanInput) {
  if (!activePlan) return null;
  return {
    challengeMode: activePlan.challengeMode,
    challengeStartDate: /^\d{4}-\d{2}-\d{2}$/.test(activePlan.challengeStartDate) ? activePlan.challengeStartDate : "",
    goals: {
      sol: sanitizePositiveNumber(activePlan.goals.sol),
      usdc: sanitizePositiveNumber(activePlan.goals.usdc),
    },
    notes: activePlan.notes.slice(0, 5000),
    planPreset: sanitizePlanPreset(activePlan),
    sizingMode: activePlan.sizingMode,
    startedAt: Number.isFinite(activePlan.startedAt) ? activePlan.startedAt : Date.now(),
    starts: {
      sol: sanitizePositiveNumber(activePlan.starts.sol),
      usdc: sanitizePositiveNumber(activePlan.starts.usdc),
    },
    timeframe: activePlan.timeframe,
    tradeJournal: activePlan.tradeJournal.map(sanitizeTradeJournalEntry).slice(0, 250),
  };
}

function sanitizePositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function sanitizePlanPreset(activePlan: NonNullable<ActivePlanInput>): "flexible" | "og" {
  if (activePlan.planPreset !== "og") return "flexible";
  if (activePlan.challengeMode !== "sol" || activePlan.timeframe !== "default" || activePlan.sizingMode !== "conservative") return "flexible";
  return "og";
}

function sanitizePlanHistory(planHistory: {
  activePlan: NonNullable<ActivePlanInput>;
  archivedAt: number;
  id: string;
  progress: {
    checkedDays: number[];
    completions: number;
  };
  reason: "completed" | "restarted";
}[]) {
  return planHistory.map((item) => ({
    activePlan: sanitizeActivePlan(item.activePlan)!,
    archivedAt: Number.isFinite(item.archivedAt) ? item.archivedAt : Date.now(),
    id: item.id.slice(0, 80),
    progress: {
      checkedDays: sanitizeCheckedDays(item.progress.checkedDays),
      completions: clampCompletions(item.progress.completions),
    },
    reason: item.reason,
  })).slice(0, 50);
}

function sanitizeTradeJournalEntry(entry: NonNullable<ActivePlanInput>["tradeJournal"][number]) {
  return {
    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
    day: Number.isInteger(entry.day) && entry.day >= 1 && entry.day <= 75 ? entry.day : 1,
    id: entry.id.slice(0, 80),
    notes: entry.notes.slice(0, 1000),
    pnl: entry.pnl.slice(0, 32),
    result: entry.result,
    ticker: entry.ticker.slice(0, 32),
  };
}
