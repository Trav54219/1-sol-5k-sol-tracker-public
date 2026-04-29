import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  progress: defineTable({
    checkedDays: v.array(v.number()),
    completions: v.optional(v.number()),
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
