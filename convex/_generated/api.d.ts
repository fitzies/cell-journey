/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as authProfiles from "../authProfiles.js";
import type * as devAccountProvisioning from "../devAccountProvisioning.js";
import type * as emailOtp from "../emailOtp.js";
import type * as emailOtpRateLimit from "../emailOtpRateLimit.js";
import type * as events from "../events.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as joinRequestFlow from "../joinRequestFlow.js";
import type * as membershipActivity from "../membershipActivity.js";
import type * as membershipOrdering from "../membershipOrdering.js";
import type * as migrations from "../migrations.js";
import type * as profiles from "../profiles.js";
import type * as seed from "../seed.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  attendance: typeof attendance;
  auth: typeof auth;
  authProfiles: typeof authProfiles;
  devAccountProvisioning: typeof devAccountProvisioning;
  emailOtp: typeof emailOtp;
  emailOtpRateLimit: typeof emailOtpRateLimit;
  events: typeof events;
  groups: typeof groups;
  http: typeof http;
  joinRequestFlow: typeof joinRequestFlow;
  membershipActivity: typeof membershipActivity;
  membershipOrdering: typeof membershipOrdering;
  migrations: typeof migrations;
  profiles: typeof profiles;
  seed: typeof seed;
  validators: typeof validators;
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
