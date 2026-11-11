/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountDeletion from "../accountDeletion.js";
import type * as admin from "../admin.js";
import type * as appConfig from "../appConfig.js";
import type * as attendance from "../attendance.js";
import type * as attendanceHeatmap from "../attendanceHeatmap.js";
import type * as auth from "../auth.js";
import type * as authProfiles from "../authProfiles.js";
import type * as crons from "../crons.js";
import type * as dashboardAccess from "../dashboardAccess.js";
import type * as dashboardAttendance from "../dashboardAttendance.js";
import type * as devAccountProvisioning from "../devAccountProvisioning.js";
import type * as devEventSamples from "../devEventSamples.js";
import type * as emailOtp from "../emailOtp.js";
import type * as emailOtpRateLimit from "../emailOtpRateLimit.js";
import type * as events from "../events.js";
import type * as groupDetails from "../groupDetails.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as inviteEmails from "../inviteEmails.js";
import type * as joinRequestFlow from "../joinRequestFlow.js";
import type * as lib_profilePhoto from "../lib/profilePhoto.js";
import type * as memberAdding from "../memberAdding.js";
import type * as membershipActivity from "../membershipActivity.js";
import type * as membershipOrdering from "../membershipOrdering.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as personalDetails from "../personalDetails.js";
import type * as profilePhotos from "../profilePhotos.js";
import type * as profiles from "../profiles.js";
import type * as regions from "../regions.js";
import type * as seed from "../seed.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountDeletion: typeof accountDeletion;
  admin: typeof admin;
  appConfig: typeof appConfig;
  attendance: typeof attendance;
  attendanceHeatmap: typeof attendanceHeatmap;
  auth: typeof auth;
  authProfiles: typeof authProfiles;
  crons: typeof crons;
  dashboardAccess: typeof dashboardAccess;
  dashboardAttendance: typeof dashboardAttendance;
  devAccountProvisioning: typeof devAccountProvisioning;
  devEventSamples: typeof devEventSamples;
  emailOtp: typeof emailOtp;
  emailOtpRateLimit: typeof emailOtpRateLimit;
  events: typeof events;
  groupDetails: typeof groupDetails;
  groups: typeof groups;
  http: typeof http;
  inviteEmails: typeof inviteEmails;
  joinRequestFlow: typeof joinRequestFlow;
  "lib/profilePhoto": typeof lib_profilePhoto;
  memberAdding: typeof memberAdding;
  membershipActivity: typeof membershipActivity;
  membershipOrdering: typeof membershipOrdering;
  migrations: typeof migrations;
  notifications: typeof notifications;
  personalDetails: typeof personalDetails;
  profilePhotos: typeof profilePhotos;
  profiles: typeof profiles;
  regions: typeof regions;
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
