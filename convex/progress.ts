import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

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
