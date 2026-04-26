import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  progress: defineTable({
    checkedDays: v.array(v.number()),
    updatedAt: v.number(),
    userSubject: v.string(),
  }).index("by_user_subject", ["userSubject"]),
});
