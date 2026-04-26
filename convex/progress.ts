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
    const identity = await requireUserIdentity(ctx);
    const progress = await getProgressForUser(ctx, identity);

    return {
      checkedDays: progress?.checkedDays ?? [],
      completions: progress?.completions ?? 0,
    };
  },
});

export const set = mutation({
  args: {
    checkedDays: v.array(v.number()),
    completions: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireUserIdentity(ctx);
    const checkedDays = [...new Set(args.checkedDays)]
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 73)
      .sort((a, b) => a - b);
    const completions = clampCompletions(args.completions ?? 0);
    const existing = await getProgressForUser(ctx, identity);

    if (existing) {
      await ctx.db.patch(existing._id, {
        checkedDays,
        completions,
        updatedAt: Date.now(),
        userIdentifier: identity.tokenIdentifier,
        userSubject: identity.subject,
      });
    } else {
      await ctx.db.insert("progress", {
        checkedDays,
        completions,
        updatedAt: Date.now(),
        userIdentifier: identity.tokenIdentifier,
        userSubject: identity.subject,
      });
    }

    return null;
  },
});

function clampCompletions(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), 100);
}
