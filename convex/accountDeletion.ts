import { getAuthUserId } from "@convex-dev/auth/server";
import { hmac } from "@oslojs/crypto/hmac";
import { SHA256 } from "@oslojs/crypto/sha2";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";

const BATCH_SIZE = 50;

/** Removes identity immediately; bounded jobs remove dependent records afterwards. */
export const deleteCurrentAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user) {
      // A second device or a retried response can still present the old JWT.
      // The first transaction already erased identity and queued profile cleanup.
      await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupAuth, { userId });
      return null;
    }
    const profiles = await ctx.db.query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId)).take(2);
    if (profiles.length > 1) throw new Error("Multiple profiles are linked to this account");
    const deletedAt = Date.now();
    const profile = profiles[0];
    if (profile) {
      if (profile.avatarStorageId) await ctx.storage.delete(profile.avatarStorageId);
      // Keep the foreign-key target for shared group history, never the identity.
      // Replacing rather than patching also removes future optional personal fields.
      await ctx.db.replace(profile._id, {
        role: "member",
        onboardingStatus: "profileIncomplete",
        fullName: "Deleted member",
        serviceIds: [],
        createdAt: deletedAt,
        updatedAt: deletedAt,
      });
      await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupProfile, {
        profileId: profile._id, deletedAt, stage: "groups", cursor: null,
      });
    }
    const email = user.email?.trim().toLowerCase();
    if (email) {
      const rate = await ctx.db.query("authRateLimits")
        .withIndex("identifier", (q) => q.eq("identifier", email)).unique();
      if (rate) await ctx.db.delete(rate._id);
      const secret = process.env.AUTH_OTP_SECRET;
      if (secret) {
        const encoder = new TextEncoder();
        const emailHash = Array.from(hmac(SHA256, encoder.encode(secret), encoder.encode(`email:${email}`)),
          (byte) => byte.toString(16).padStart(2, "0")).join("");
        await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupOtp, { emailHash, deletedAt });
      }
    }
    // Existing JWTs cannot resolve a profile; refresh cannot restore a deleted user.
    await ctx.db.delete(userId);
    await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupAuth, { userId });
    return null;
  },
});

const stages = ["groups", "coLeaders", "memberships", "periods", "attendance", "requests", "push"] as const;
const profileStage = v.union(...stages.map((stage) => v.literal(stage)));

export const cleanupProfile = internalMutation({
  args: { profileId: v.id("userProfiles"), deletedAt: v.number(), stage: profileStage, cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profileId, deletedAt, stage, cursor } = args;
    const options = { cursor, numItems: BATCH_SIZE };
    let continuation: { isDone: boolean; continueCursor: string };
    if (stage === "groups") {
      const result = await ctx.db.query("groups").withIndex("by_leader", (q) => q.eq("leaderProfileId", profileId)).paginate(options);
      for (const row of result.page) await ctx.db.patch(row._id, { leaderProfileId: undefined, updatedAt: deletedAt });
      continuation = result;
    } else if (stage === "coLeaders") {
      const result = await ctx.db.query("coLeaderAssignments").withIndex("by_profile_and_status", (q) => q.eq("profileId", profileId)).paginate(options);
      for (const row of result.page) await ctx.db.delete(row._id);
      continuation = result;
    } else if (stage === "memberships") {
      const result = await ctx.db.query("memberships").withIndex("by_profile_group", (q) => q.eq("profileId", profileId)).paginate(options);
      for (const row of result.page) await ctx.db.patch(row._id, {
        ...(row.status === "active" || row.status === "inactive" ? { status: "left" as const, endedAt: deletedAt } : {}),
        endReason: undefined, joinRequestId: undefined,
      });
      continuation = result;
    } else if (stage === "periods") {
      const result = await ctx.db.query("membershipActivityPeriods").withIndex("by_profile_and_group_and_startedAt", (q) => q.eq("profileId", profileId)).paginate(options);
      for (const row of result.page) {
        if (row.endedAt === undefined) await ctx.db.patch(row._id, { endedAt: Math.max(row.startedAt, deletedAt), updatedAt: deletedAt });
      }
      continuation = result;
    } else if (stage === "attendance") {
      const result = await ctx.db.query("attendance").withIndex("by_profile", (q) => q.eq("profileId", profileId)).paginate(options);
      for (const row of result.page) await ctx.db.patch(row._id, { finalizationNote: undefined });
      continuation = result;
    } else if (stage === "requests") {
      const result = await ctx.db.query("joinRequests").withIndex("by_profile", (q) => q.eq("profileId", profileId)).paginate(options);
      for (const row of result.page) await ctx.db.delete(row._id);
      continuation = result;
    } else {
      const result = await ctx.db.query("pushTokens").withIndex("by_profile_active", (q) => q.eq("profileId", profileId)).paginate(options);
      for (const row of result.page) await ctx.db.delete(row._id);
      continuation = result;
    }
    const nextStage = continuation.isDone ? stages[stages.indexOf(stage) + 1] : stage;
    if (nextStage) await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupProfile, {
      ...args, stage: nextStage, cursor: continuation.isDone ? null : continuation.continueCursor,
    });
    return null;
  },
});

export const cleanupAuth = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const sessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).take(BATCH_SIZE);
    for (const session of sessions) {
      await ctx.db.delete(session._id);
      await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupSession, { sessionId: session._id });
    }
    const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).take(BATCH_SIZE);
    for (const account of accounts) {
      const rate = await ctx.db.query("authRateLimits").withIndex("identifier", (q) => q.eq("identifier", account._id)).unique();
      if (rate) await ctx.db.delete(rate._id);
      await ctx.db.delete(account._id);
      await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupAccountCodes, { accountId: account._id });
    }
    if (sessions.length === BATCH_SIZE || accounts.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupAuth, { userId });
    }
    return null;
  },
});

export const cleanupSession = internalMutation({
  args: { sessionId: v.id("authSessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const tokens = await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", sessionId)).take(BATCH_SIZE);
    for (const token of tokens) await ctx.db.delete(token._id);
    const verifiers = await ctx.db.query("authVerifiers").withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId)).take(BATCH_SIZE);
    for (const verifier of verifiers) await ctx.db.delete(verifier._id);
    if (tokens.length === BATCH_SIZE || verifiers.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupSession, { sessionId });
    }
    return null;
  },
});

export const cleanupAccountCodes = internalMutation({
  args: { accountId: v.id("authAccounts") },
  returns: v.null(),
  handler: async (ctx, { accountId }) => {
    const codes = await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", accountId)).take(BATCH_SIZE);
    for (const code of codes) await ctx.db.delete(code._id);
    if (codes.length === BATCH_SIZE) await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupAccountCodes, { accountId });
    return null;
  },
});

export const cleanupOtp = internalMutation({
  args: { emailHash: v.string(), deletedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { emailHash, deletedAt }) => {
    const code = await ctx.db.query("authEmailOtpCodes").withIndex("by_emailHash", (q) => q.eq("emailHash", emailHash)).unique();
    if (code && code.createdAt <= deletedAt) await ctx.db.delete(code._id);
    const requests = await ctx.db.query("authEmailOtpRequests")
      .withIndex("by_emailHash_and_createdAt", (q) => q.eq("emailHash", emailHash).lte("createdAt", deletedAt)).take(BATCH_SIZE);
    for (const request of requests) await ctx.db.delete(request._id);
    if (requests.length === BATCH_SIZE) await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupOtp, { emailHash, deletedAt });
    return null;
  },
});
