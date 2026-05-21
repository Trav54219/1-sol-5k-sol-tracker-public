import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const tradeJournalEntry = v.object({
  createdAt: v.number(),
  day: v.number(),
  id: v.string(),
  notes: v.string(),
  pnl: v.string(),
  result: v.union(v.literal("win"), v.literal("loss"), v.literal("breakeven"), v.literal("note")),
  ticker: v.string(),
});

const activePlan = v.object({
  challengeMode: v.union(v.literal("sol"), v.literal("usdc")),
  challengeStartDate: v.string(),
  goals: v.object({
    sol: v.number(),
    usdc: v.number(),
  }),
  notes: v.optional(v.string()),
  planPreset: v.optional(v.union(v.literal("flexible"), v.literal("og"))),
  sizingMode: v.union(v.literal("conservative"), v.literal("pullupso")),
  startedAt: v.number(),
  starts: v.object({
    sol: v.number(),
    usdc: v.number(),
  }),
  timeframe: v.union(v.literal("default"), v.literal("3"), v.literal("5"), v.literal("7"), v.literal("14"), v.literal("21"), v.literal("30"), v.literal("45"), v.literal("60"), v.literal("75")),
  tradeJournal: v.optional(v.array(tradeJournalEntry)),
});

export default defineSchema({
  entitlements: defineTable({
    expiresAt: v.optional(v.number()),
    lastValidatedAt: v.number(),
    licenseKeyHash: v.string(),
    membershipId: v.string(),
    status: v.string(),
    updatedAt: v.number(),
    userIdentifier: v.string(),
    userSubject: v.string(),
  })
    .index("by_user_subject", ["userSubject"]),
  progress: defineTable({
    activePlan: v.optional(v.union(activePlan, v.null())),
    checkedDays: v.array(v.number()),
    completions: v.optional(v.number()),
    planHistory: v.optional(v.array(v.object({
      activePlan,
      archivedAt: v.number(),
      id: v.string(),
      progress: v.object({
        checkedDays: v.array(v.number()),
        completions: v.number(),
      }),
      reason: v.union(v.literal("completed"), v.literal("restarted")),
    }))),
    solCheckedDays: v.optional(v.array(v.number())),
    solCompletions: v.optional(v.number()),
    usdcCheckedDays: v.optional(v.array(v.number())),
    usdcCompletions: v.optional(v.number()),
    updatedAt: v.number(),
    userIdentifier: v.optional(v.string()),
    userSubject: v.string(),
  })
    .index("by_user_identifier", ["userIdentifier"])
    .index("by_user_subject", ["userSubject"]),
});
