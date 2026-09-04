import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { claimInvitedProfileForAuthUser } from "./profiles";

export const EMAIL_OTP_WINDOW_MS = 10 * 60 * 1000;
export const EMAIL_OTP_PER_ADDRESS_LIMIT = 3;
export const EMAIL_OTP_GLOBAL_LIMIT = 100;
export const EMAIL_OTP_MAX_FAILED_ATTEMPTS = 5;
const CLEANUP_BATCH_SIZE = 50;

export const reserveIssuance = internalMutation({
  args: {
    emailHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, { emailHash, now }) => {
    const windowStart = now - EMAIL_OTP_WINDOW_MS;

    const addressRequests = await ctx.db
      .query("authEmailOtpRequests")
      .withIndex("by_emailHash_and_createdAt", (q) =>
        q.eq("emailHash", emailHash).gte("createdAt", windowStart),
      )
      .take(EMAIL_OTP_PER_ADDRESS_LIMIT);
    if (addressRequests.length >= EMAIL_OTP_PER_ADDRESS_LIMIT) {
      throw new Error("Too many code requests. Try again in 10 minutes");
    }

    const globalRequests = await ctx.db
      .query("authEmailOtpRequests")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", windowStart))
      .take(EMAIL_OTP_GLOBAL_LIMIT);
    if (globalRequests.length >= EMAIL_OTP_GLOBAL_LIMIT) {
      throw new Error("Email sign-in is busy. Try again in 10 minutes");
    }

    const staleRequests = await ctx.db
      .query("authEmailOtpRequests")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", windowStart))
      .take(CLEANUP_BATCH_SIZE);
    for (const request of staleRequests) {
      await ctx.db.delete(request._id);
    }

    return await ctx.db.insert("authEmailOtpRequests", {
      emailHash,
      createdAt: now,
    });
  },
});

export const storeDeliveredCode = internalMutation({
  args: {
    requestId: v.id("authEmailOtpRequests"),
    emailHash: v.string(),
    codeHash: v.string(),
    expiresAt: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.emailHash !== args.emailHash) {
      throw new Error("OTP issuance reservation not found");
    }

    const expiredCodes = await ctx.db
      .query("authEmailOtpCodes")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", args.now))
      .take(CLEANUP_BATCH_SIZE);
    for (const code of expiredCodes) {
      await ctx.db.delete(code._id);
    }

    const existing = await ctx.db
      .query("authEmailOtpCodes")
      .withIndex("by_emailHash", (q) => q.eq("emailHash", args.emailHash))
      .unique();
    const value = {
      requestId: args.requestId,
      emailHash: args.emailHash,
      codeHash: args.codeHash,
      expiresAt: args.expiresAt,
      failedAttempts: 0,
      createdAt: args.now,
    };
    if (existing) await ctx.db.replace(existing._id, value);
    else await ctx.db.insert("authEmailOtpCodes", value);
    return null;
  },
});

export const verifyAndConsumeCode = internalMutation({
  args: {
    emailHash: v.string(),
    codeHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, { emailHash, codeHash, now }) => {
    const activeCode = await ctx.db
      .query("authEmailOtpCodes")
      .withIndex("by_emailHash", (q) => q.eq("emailHash", emailHash))
      .unique();
    if (!activeCode) return "invalid" as const;

    if (activeCode.expiresAt < now) {
      await ctx.db.delete(activeCode._id);
      return "expired" as const;
    }
    if (activeCode.codeHash === codeHash) {
      await ctx.db.delete(activeCode._id);
      return "verified" as const;
    }

    const failedAttempts = activeCode.failedAttempts + 1;
    if (failedAttempts >= EMAIL_OTP_MAX_FAILED_ATTEMPTS) {
      await ctx.db.delete(activeCode._id);
      return "tooManyAttempts" as const;
    }

    await ctx.db.patch(activeCode._id, { failedAttempts });
    return "invalid" as const;
  },
});

export const ensureVerifiedUser = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
  },
  handler: async (ctx, { userId, email }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Authenticated user not found");

    const normalizedEmail = email.trim().toLowerCase();
    if (user.email && user.email.trim().toLowerCase() !== normalizedEmail) {
      throw new Error("Authenticated account email does not match");
    }

    await ctx.db.patch(userId, {
      email: normalizedEmail,
      emailVerificationTime: Date.now(),
    });
    await claimInvitedProfileForAuthUser(ctx, userId);
    return null;
  },
});
