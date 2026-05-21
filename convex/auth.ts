"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { mintAccessToken } from "./authKeys";
import {
  hashLicenseKey,
  normalizeLicenseKey,
  validateLicenseWithWhop,
} from "./whop";

function isBypassEnabled() {
  return process.env.WHOP_ACCESS_BYPASS === "true";
}

function subjectForWhopUser(userId: string) {
  return `whop:${userId}`;
}

export const signInWithLicense = action({
  args: {
    licenseKey: v.string(),
    whopUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.WHOP_API_KEY?.trim() ?? "";
    if (!apiKey && !isBypassEnabled()) {
      return { ok: false as const, message: "Whop API key is not configured on the server." };
    }

    const whopUser = args.whopUserId ? { userId: args.whopUserId, appId: process.env.WHOP_APP_ID ?? "" } : null;
    const licenseKey = normalizeLicenseKey(args.licenseKey);
    if (!licenseKey) {
      return { ok: false as const, message: "Enter your Whop license key." };
    }

    let userSubject: string;
    let userIdentifier: string;
    let userLabel: string | null = null;

    if (isBypassEnabled()) {
      const bypassId = whopUser?.userId ?? "dev-user";
      userSubject = subjectForWhopUser(bypassId);
      userIdentifier = `${userSubject}|bypass`;
      userLabel = "Development user";
    } else {
      if (!whopUser) {
        return {
          ok: false as const,
          message: "Open this app from Whop so we can verify your account, then paste your license key.",
        };
      }

      const validation = await validateLicenseWithWhop({
        licenseKey,
        whopUserId: whopUser.userId,
        apiKey,
      });

      if (!validation.ok) {
        return { ok: false as const, message: validation.message };
      }

      await ctx.runMutation(internal.entitlements.upsertFromValidation, {
        userSubject: subjectForWhopUser(whopUser.userId),
        userIdentifier: `${subjectForWhopUser(whopUser.userId)}|${hashLicenseKey(licenseKey)}`,
        licenseKeyHash: hashLicenseKey(licenseKey),
        membershipId: validation.membershipId,
        status: validation.status,
        expiresAt: validation.expiresAt,
        active: true,
      });

      userSubject = subjectForWhopUser(whopUser.userId);
      userIdentifier = `${userSubject}|${hashLicenseKey(licenseKey)}`;
      userLabel = whopUser.userId;
    }

    try {
      const accessToken = await mintAccessToken({
        subject: userSubject,
        email: userLabel,
      });

      return {
        ok: true as const,
        accessToken,
        userLabel,
        message: "License activated. Welcome back.",
      };
    } catch (error) {
      console.error(error);
      return {
        ok: false as const,
        message: "Server auth keys are not configured. Contact the site owner.",
      };
    }
  },
});
