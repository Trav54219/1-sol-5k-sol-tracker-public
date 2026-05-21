"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { checkWhopMembershipAccess, whopAccessIdentifier } from "./whop";

function getWhopApiKey() {
  return process.env.WHOP_API_KEY?.trim() ?? "";
}

function isBypassEnabled() {
  return process.env.WHOP_ACCESS_BYPASS === "true";
}

function whopUserIdFromSubject(subject: string) {
  return subject.startsWith("whop:") ? subject.slice("whop:".length) : null;
}

export const refreshAccess = action({
  args: {
    experienceId: v.optional(v.string()),
    accessPassId: v.optional(v.string()),
    companyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { ok: false as const, message: "Sign in from Whop to use the tracker." };
    }

    const apiKey = getWhopApiKey();
    if (!apiKey || isBypassEnabled()) {
      return { ok: true as const, message: null };
    }

    const whopUserId = whopUserIdFromSubject(identity.subject);
    if (!whopUserId) {
      return { ok: false as const, message: "Invalid Whop session. Reload the app from Whop." };
    }

    const access = await checkWhopMembershipAccess({
      userId: whopUserId,
      experienceId: args.experienceId,
      accessPassId: args.accessPassId,
      companyId: args.companyId,
    });

    if (!access.ok) {
      await ctx.runMutation(internal.entitlements.markInactive, {
        userSubject: identity.subject,
      });
      return { ok: false as const, message: access.message };
    }

    const accessId = whopAccessIdentifier(whopUserId);
    await ctx.runMutation(internal.entitlements.upsertFromValidation, {
      userSubject: identity.subject,
      userIdentifier: identity.tokenIdentifier,
      licenseKeyHash: accessId,
      membershipId: access.membershipId,
      status: access.status,
      expiresAt: access.expiresAt,
      active: true,
    });

    return { ok: true as const, message: null };
  },
});
