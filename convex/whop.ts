"use node";

import { createHash } from "node:crypto";
import { getWhopSdk } from "./whopAuth";

const WHOP_V2_BASE = "https://api.whop.com/api/v2";
const WHOP_V1_BASE = "https://api.whop.com/api/v1";
const METADATA_USER_KEY = "whop_user_id";
const WHOP_ACCESS_SOURCE = "whop-membership";

export type WhopAccessCheckResult =
  | {
      ok: true;
      membershipId: string;
      status: string;
      expiresAt: number | null;
    }
  | {
      ok: false;
      code: "no_access" | "misconfigured" | "network";
      message: string;
    };

export function whopAccessIdentifier(userId: string) {
  return createHash("sha256").update(`${WHOP_ACCESS_SOURCE}:${userId}`).digest("hex");
}

function readHasAccess(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.hasAccess === "boolean") return record.hasAccess;
  if (typeof record.has_access === "boolean") return record.has_access;
  const nested = record.hasAccessToExperience ?? record.hasAccessToAccessPass ?? record.hasAccessToCompany;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.hasAccess === "boolean") return nestedRecord.hasAccess;
    if (typeof nestedRecord.has_access === "boolean") return nestedRecord.has_access;
  }
  return false;
}

export async function checkWhopMembershipAccess({
  userId,
  experienceId,
  accessPassId,
  companyId,
}: {
  userId: string;
  experienceId?: string;
  accessPassId?: string;
  companyId?: string;
}): Promise<WhopAccessCheckResult> {
  const sdk = getWhopSdk();
  if (!sdk) {
    return {
      ok: false,
      code: "misconfigured",
      message: "Whop API is not configured on the server.",
    };
  }

  const resolvedExperienceId = experienceId?.trim() || process.env.WHOP_EXPERIENCE_ID?.trim() || "";
  const resolvedAccessPassId = accessPassId?.trim() || process.env.WHOP_ACCESS_PASS_ID?.trim() || "";
  const resolvedCompanyId = companyId?.trim() || process.env.WHOP_COMPANY_ID?.trim() || "";

  try {
    if (resolvedExperienceId) {
      const result = await sdk.access.checkIfUserHasAccessToExperience({
        experienceId: resolvedExperienceId,
        userId,
      });
      if (readHasAccess(result)) {
        return {
          ok: true,
          membershipId: resolvedExperienceId,
          status: "active",
          expiresAt: null,
        };
      }
    }

    if (resolvedAccessPassId) {
      const result = await sdk.access.checkIfUserHasAccessToAccessPass({
        accessPassId: resolvedAccessPassId,
        userId,
      });
      if (readHasAccess(result)) {
        return {
          ok: true,
          membershipId: resolvedAccessPassId,
          status: "active",
          expiresAt: null,
        };
      }
    }

    if (resolvedCompanyId) {
      const result = await sdk.access.checkIfUserHasAccessToCompany({
        companyId: resolvedCompanyId,
        userId,
      });
      if (readHasAccess(result)) {
        return {
          ok: true,
          membershipId: resolvedCompanyId,
          status: "active",
          expiresAt: null,
        };
      }
    }

    if (!resolvedExperienceId && !resolvedAccessPassId && !resolvedCompanyId) {
      return {
        ok: false,
        code: "misconfigured",
        message:
          "Set WHOP_EXPERIENCE_ID on Convex (from your Whop experience URL) or open the app from inside Whop.",
      };
    }

    return {
      ok: false,
      code: "no_access",
      message:
        "No active Whop membership found for this course. Purchase or renew on Whop, then reload this page.",
    };
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Could not verify your Whop membership. Try again in a moment.",
    };
  }
}

export type WhopValidationResult =
  | {
      ok: true;
      membershipId: string;
      status: string;
      expiresAt: number | null;
    }
  | {
      ok: false;
      code: "invalid" | "expired" | "bound_to_other_account" | "misconfigured" | "network";
      message: string;
    };

export function hashLicenseKey(licenseKey: string) {
  return createHash("sha256").update(licenseKey.trim()).digest("hex");
}

export function normalizeLicenseKey(licenseKey: string) {
  return licenseKey.trim();
}

export async function validateLicenseWithWhop({
  licenseKey,
  whopUserId,
  apiKey,
}: {
  licenseKey: string;
  whopUserId: string;
  apiKey: string;
}): Promise<WhopValidationResult> {
  const normalizedKey = normalizeLicenseKey(licenseKey);
  if (!normalizedKey) {
    return { ok: false, code: "invalid", message: "Enter your Whop license key." };
  }

  try {
    const response = await fetch(
      `${WHOP_V2_BASE}/memberships/${encodeURIComponent(normalizedKey)}/validate_license`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            [METADATA_USER_KEY]: whopUserId,
          },
        }),
      },
    );

    if (response.status === 400) {
      const body = await safeJson(response);
      const message = typeof body?.message === "string" ? body.message : "";
      if (/metadata|bound|device|hwid/i.test(message)) {
        return {
          ok: false,
          code: "bound_to_other_account",
          message:
            "This license key is already linked to another account. Reset it in your Whop orders or contact support.",
        };
      }
      return {
        ok: false,
        code: "expired",
        message: "This membership is not active. Renew on Whop to regain access.",
      };
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          code: "misconfigured",
          message: "License validation is misconfigured on the server. Contact the site owner.",
        };
      }
      return {
        ok: false,
        code: "invalid",
        message: "That license key could not be validated. Double-check the key from your Whop receipt.",
      };
    }

    const membership = await safeJson(response);
    const membershipId = typeof membership?.id === "string" ? membership.id : normalizedKey;
    const status = typeof membership?.status === "string" ? membership.status : "active";
    const expiresAt = parseExpiresAt(membership);

    if (!isActiveMembershipStatus(status)) {
      return {
        ok: false,
        code: "expired",
        message: "Your Whop membership is not active. Renew to continue using the tracker.",
      };
    }

    return {
      ok: true,
      membershipId,
      status,
      expiresAt,
    };
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Could not reach Whop to validate your license. Try again in a moment.",
    };
  }
}

export async function refreshMembershipWithWhop({
  membershipId,
  apiKey,
}: {
  membershipId: string;
  apiKey: string;
}): Promise<WhopValidationResult> {
  try {
    const response = await fetch(`${WHOP_V1_BASE}/memberships/${encodeURIComponent(membershipId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: false,
          code: "invalid",
          message: "Membership not found. Re-enter your license key from Whop.",
        };
      }
      return {
        ok: false,
        code: "network",
        message: "Could not refresh your membership status. Try again shortly.",
      };
    }

    const membership = await safeJson(response);
    const status = typeof membership?.status === "string" ? membership.status : "unknown";
    const expiresAt = parseExpiresAt(membership);

    if (!isActiveMembershipStatus(status)) {
      return {
        ok: false,
        code: "expired",
        message: "Your Whop plan has expired. Renew to unlock the tracker again.",
      };
    }

    return {
      ok: true,
      membershipId,
      status,
      expiresAt,
    };
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Could not reach Whop to refresh access. Try again in a moment.",
    };
  }
}

function isActiveMembershipStatus(status: string) {
  const normalized = status.toLowerCase();
  return normalized === "active" || normalized === "trialing" || normalized === "completed";
}

function parseExpiresAt(membership: Record<string, unknown> | null) {
  if (!membership) return null;

  const candidates = [
    membership.expires_at,
    membership.expiration_date,
    membership.renewal_period_end,
    membership.valid_until,
  ];

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 1_000_000_000_000 ? value : value * 1000;
    }
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

async function safeJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
