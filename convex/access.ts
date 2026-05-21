"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  hashLicenseKey,
  normalizeLicenseKey,
  refreshMembershipWithWhop,
} from "./whop";

function getWhopApiKey() {
  return process.env.WHOP_API_KEY?.trim() ?? "";
}

function isBypassEnabled() {
  return process.env.WHOP_ACCESS_BYPASS === "true";
}

export const refreshAccess = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { ok: false as const, message: "Sign in with your license key." };
    }

    const apiKey = getWhopApiKey();
    if (!apiKey || isBypassEnabled()) {
      return { ok: true as const, message: null };
    }

    const entitlement = await ctx.runQuery(internal.entitlements.getRecordForRefresh, {
      userSubject: identity.subject,
    });

    if (!entitlement?.membershipId) {
      return { ok: false as const, message: "No license on file. Enter your Whop license key." };
    }

    const validation = await refreshMembershipWithWhop({
      membershipId: entitlement.membershipId,
      apiKey,
    });

    if (!validation.ok) {
      await ctx.runMutation(internal.entitlements.markInactive, {
        userSubject: identity.subject,
      });
      return { ok: false as const, message: validation.message };
    }

    await ctx.runMutation(internal.entitlements.upsertFromValidation, {
      userSubject: identity.subject,
      userIdentifier: identity.tokenIdentifier,
      licenseKeyHash: entitlement.licenseKeyHash,
      membershipId: validation.membershipId,
      status: validation.status,
      expiresAt: validation.expiresAt,
      active: true,
    });

    return { ok: true as const, message: null };
  },
});
