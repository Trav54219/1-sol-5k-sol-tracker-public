import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const ACTIVE_STATUSES = new Set(["active", "trialing", "completed"]);
const REVALIDATE_AFTER_MS = 6 * 60 * 60 * 1000;

export type EntitlementStatus = {
  configured: boolean;
  hasAccess: boolean;
  status: "active" | "inactive" | "none";
  membershipId: string | null;
  expiresAt: number | null;
  lastValidatedAt: number | null;
  needsRevalidation: boolean;
  message: string | null;
};

async function getIdentity(ctx: QueryCtx | MutationCtx) {
  return await ctx.auth.getUserIdentity();
}

async function getRecordForSubject(ctx: QueryCtx | MutationCtx, userSubject: string) {
  return await ctx.db
    .query("entitlements")
    .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
    .unique();
}

function isWhopConfigured() {
  return Boolean(process.env.WHOP_API_KEY?.trim());
}

function isBypassEnabled() {
  return process.env.WHOP_ACCESS_BYPASS === "true";
}

export function entitlementAllowsAccess(record: {
  status: string;
  expiresAt?: number | null;
  lastValidatedAt: number;
} | null) {
  if (!isWhopConfigured() || isBypassEnabled()) return true;
  if (!record) return false;
  if (!ACTIVE_STATUSES.has(record.status)) return false;
  if (record.expiresAt && record.expiresAt <= Date.now()) return false;
  if (Date.now() - record.lastValidatedAt > REVALIDATE_AFTER_MS) return false;
  return true;
}

export async function requireEntitlementAccess(ctx: QueryCtx | MutationCtx) {
  const identity = await getIdentity(ctx);
  if (!identity) {
    throw new Error("Sign in to use the tracker.");
  }

  if (!isWhopConfigured() || isBypassEnabled()) {
    return identity;
  }

  const record = await getRecordForSubject(ctx, identity.subject);
  if (!entitlementAllowsAccess(record)) {
    throw new Error("Active Whop membership required. Enter your license key or renew on Whop.");
  }

  return identity;
}

export const getStatus = query({
  args: {},
  handler: async (ctx): Promise<EntitlementStatus> => {
    const identity = await getIdentity(ctx);
    const configured = isWhopConfigured();

    if (!configured || isBypassEnabled()) {
      return {
        configured,
        hasAccess: true,
        status: "active",
        membershipId: null,
        expiresAt: null,
        lastValidatedAt: null,
        needsRevalidation: false,
        message: isBypassEnabled() ? "License checks bypassed for development." : null,
      };
    }

    if (!identity) {
      return {
        configured: true,
        hasAccess: false,
        status: "none",
        membershipId: null,
        expiresAt: null,
        lastValidatedAt: null,
        needsRevalidation: false,
        message: "Sign in, then enter your Whop license key.",
      };
    }

    const record = await getRecordForSubject(ctx, identity.subject);
    if (!record) {
      return {
        configured: true,
        hasAccess: false,
        status: "none",
        membershipId: null,
        expiresAt: null,
        lastValidatedAt: null,
        needsRevalidation: false,
        message: "Enter the license key from your Whop purchase email or orders page.",
      };
    }

    const hasAccess = entitlementAllowsAccess(record);
    const needsRevalidation = Date.now() - record.lastValidatedAt > REVALIDATE_AFTER_MS;

    return {
      configured: true,
      hasAccess,
      status: hasAccess ? "active" : "inactive",
      membershipId: record.membershipId,
      expiresAt: record.expiresAt ?? null,
      lastValidatedAt: record.lastValidatedAt,
      needsRevalidation,
      message: hasAccess
        ? null
        : record.status === "inactive"
          ? "Your membership is inactive. Renew on Whop to continue."
          : "Re-validate your license key to continue.",
    };
  },
});

export const upsertFromValidation = internalMutation({
  args: {
    userSubject: v.string(),
    userIdentifier: v.string(),
    licenseKeyHash: v.string(),
    membershipId: v.string(),
    status: v.string(),
    expiresAt: v.union(v.number(), v.null()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await getRecordForSubject(ctx, args.userSubject);
    const payload = {
      userSubject: args.userSubject,
      userIdentifier: args.userIdentifier,
      licenseKeyHash: args.licenseKeyHash,
      membershipId: args.membershipId,
      status: args.active ? args.status : "inactive",
      expiresAt: args.expiresAt ?? undefined,
      lastValidatedAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("entitlements", payload);
  },
});

export const getRecordForRefresh = internalQuery({
  args: {
    userSubject: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await getRecordForSubject(ctx, args.userSubject);
    if (!record) return null;
    return {
      membershipId: record.membershipId,
      licenseKeyHash: record.licenseKeyHash,
    };
  },
});

export const markInactive = internalMutation({
  args: {
    userSubject: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await getRecordForSubject(ctx, args.userSubject);
    if (!existing) return null;

    await ctx.db.patch(existing._id, {
      status: "inactive",
      updatedAt: Date.now(),
      lastValidatedAt: Date.now(),
    });
    return null;
  },
});
