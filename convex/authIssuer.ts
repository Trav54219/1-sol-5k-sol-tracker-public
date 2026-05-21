export function getAuthIssuer() {
  const issuer = process.env.CONVEX_SITE_URL?.trim();
  if (!issuer) {
    throw new Error("CONVEX_SITE_URL is not configured.");
  }
  return issuer;
}
