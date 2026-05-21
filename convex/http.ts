import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthIssuer } from "./authKeys";

const http = httpRouter();

http.route({
  path: "/.well-known/openid-configuration",
  method: "GET",
  handler: httpAction(async () => {
    const issuer = getAuthIssuer();
    return new Response(
      JSON.stringify({
        issuer,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }),
});

http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const jwks = await ctx.runAction(internal.authKeys.jwksJson, {});
      return new Response(JSON.stringify(jwks), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error(error);
      return new Response(JSON.stringify({ keys: [] }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/whop/session",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = request.headers.get("x-whop-user-token");
    const user = await ctx.runAction(internal.whopAuth.resolveSession, { token });

    if (!user) {
      return new Response(JSON.stringify({ ok: false, message: "Not signed in to Whop." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ...user }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
