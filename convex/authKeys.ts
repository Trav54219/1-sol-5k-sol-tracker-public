"use node";

import { createPrivateKey, type KeyObject } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { exportJWK, importPKCS8, importSPKI, SignJWT, type CryptoKey } from "jose";

import { getAuthIssuer } from "./authIssuer";

const AUDIENCE = "convex";

async function importSigningKey(privateKeyPem: string): Promise<CryptoKey | KeyObject> {
  if (privateKeyPem.includes("BEGIN PRIVATE KEY")) {
    return await importPKCS8(privateKeyPem, "RS256");
  }
  // openssl genrsa produces PKCS#1 ("RSA PRIVATE KEY"); jose only accepts PKCS#8 via importPKCS8.
  return createPrivateKey(privateKeyPem);
}

export async function mintAccessToken({
  subject,
  email,
}: {
  subject: string;
  email?: string | null;
}) {
  const privateKeyPem = process.env.AUTH_JWT_PRIVATE_KEY?.trim();
  if (!privateKeyPem) {
    throw new Error("AUTH_JWT_PRIVATE_KEY is not configured in Convex.");
  }

  const key = await importSigningKey(privateKeyPem);
  const issuer = getAuthIssuer();

  return await new SignJWT({
    ...(email ? { email } : {}),
  })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

export const jwksJson = internalAction({
  args: {},
  handler: async () => getJwksJson(),
});

export async function getJwksJson() {
  const publicKeyPem = process.env.AUTH_JWT_PUBLIC_KEY?.trim();
  if (!publicKeyPem) {
    throw new Error("AUTH_JWT_PUBLIC_KEY is not configured in Convex.");
  }

  const key = await importSPKI(publicKeyPem, "RS256");
  const jwk = await exportJWK(key);
  return {
    keys: [{ ...jwk, alg: "RS256", use: "sig", kid: "sol-tracker-1" }],
  };
}
