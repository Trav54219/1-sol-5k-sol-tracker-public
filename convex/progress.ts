import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

async function requireUserSubject(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Sign in to save progress.");
  }
  return identity.subject;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userSubject = await requireUserSubject(ctx);
    const progress = await ctx.db
      .query("progress")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .unique();

    return progress?.checkedDays ?? [];
  },
});

export const set = mutation({
  args: {
    checkedDays: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const userSubject = await requireUserSubject(ctx);
    const checkedDays = [...new Set(args.checkedDays)]
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 73)
      .sort((a, b) => a - b);
    const existing = await ctx.db
      .query("progress")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { checkedDays, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("progress", { checkedDays, updatedAt: Date.now(), userSubject });
    }

    return null;
  },
});
