/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as auth from "../auth.js";
import type * as authIssuer from "../authIssuer.js";
import type * as authKeys from "../authKeys.js";
import type * as entitlements from "../entitlements.js";
import type * as http from "../http.js";
import type * as progress from "../progress.js";
import type * as whop from "../whop.js";
import type * as whopAuth from "../whopAuth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  auth: typeof auth;
  authIssuer: typeof authIssuer;
  authKeys: typeof authKeys;
  entitlements: typeof entitlements;
  http: typeof http;
  progress: typeof progress;
  whop: typeof whop;
  whopAuth: typeof whopAuth;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
