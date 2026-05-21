"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { mintAccessToken } from "./authKeys";
import { checkWhopMembershipAccess, whopAccessIdentifier } from "./whop";

function isBypassEnabled() {
  return process.env.WHOP_ACCESS_BYPASS === "true";
}

function subjectForWhopUser(userId: string) {
  return `whop:${userId}`;
}

async function grantWhopAccess(
  ctx: ActionCtx,
  {
    whopUserId,
    experienceId,
    accessPassId,
    companyId,
  }: {
    whopUserId: string;
    experienceId?: string;
    accessPassId?: string;
    companyId?: string;
  },
) {
  const userSubject = subjectForWhopUser(whopUserId);
  const accessId = whopAccessIdentifier(whopUserId);

  if (isBypassEnabled()) {
    return {
      ok: true as const,
      userSubject,
      userIdentifier: `${userSubject}|bypass`,
      userLabel: "Development user",
      message: "Signed in (development bypass).",
    };
  }

  const apiKey = process.env.WHOP_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return { ok: false as const, message: "Whop API key is not configured on the server." };
  }

  const access = await checkWhopMembershipAccess({
    userId: whopUserId,
    experienceId,
    accessPassId,
    companyId,
  });

  if (!access.ok) {
    return { ok: false as const, message: access.message };
  }

  await ctx.runMutation(internal.entitlements.upsertFromValidation, {
    userSubject,
    userIdentifier: `${userSubject}|${accessId}`,
    licenseKeyHash: accessId,
    membershipId: access.membershipId,
    status: access.status,
    expiresAt: access.expiresAt,
    active: true,
  });

  return {
    ok: true as const,
    userSubject,
    userIdentifier: `${userSubject}|${accessId}`,
    userLabel: whopUserId,
    message: "Whop membership verified. Welcome back.",
  };
}

export const signInWithWhop = action({
  args: {
    whopUserId: v.string(),
    experienceId: v.optional(v.string()),
    accessPassId: v.optional(v.string()),
    companyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const whopUserId = args.whopUserId.trim();
    if (!whopUserId) {
      return { ok: false as const, message: "Open this app from Whop so we can verify your account." };
    }

    const granted = await grantWhopAccess(ctx, {
      whopUserId,
      experienceId: args.experienceId,
      accessPassId: args.accessPassId,
      companyId: args.companyId,
    });

    if (!granted.ok) {
      return { ok: false as const, message: granted.message };
    }

    try {
      const accessToken = await mintAccessToken({
        subject: granted.userSubject,
        email: granted.userLabel,
      });

      return {
        ok: true as const,
        accessToken,
        userLabel: granted.userLabel,
        message: granted.message,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("mintAccessToken failed:", detail);
      if (detail.includes("AUTH_JWT_PRIVATE_KEY") || detail.includes("CONVEX_SITE_URL")) {
        return {
          ok: false as const,
          message: "Server auth keys are not configured. Contact the site owner.",
        };
      }
      return {
        ok: false as const,
        message: "Could not issue a sign-in token. Try again or contact support.",
      };
    }
  },
});
