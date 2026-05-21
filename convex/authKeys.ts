"use node";

import { exportJWK, importPKCS8, importSPKI, SignJWT } from "jose";

const AUDIENCE = "convex";

export function getAuthIssuer() {
  const issuer = process.env.CONVEX_SITE_URL?.trim();
  if (!issuer) {
    throw new Error("CONVEX_SITE_URL is not configured.");
  }
  return issuer;
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

  const key = await importPKCS8(privateKeyPem, "RS256");
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
