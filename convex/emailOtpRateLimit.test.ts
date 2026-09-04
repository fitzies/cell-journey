import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import {
  EMAIL_OTP_GLOBAL_LIMIT,
  EMAIL_OTP_MAX_FAILED_ATTEMPTS,
  EMAIL_OTP_PER_ADDRESS_LIMIT,
  EMAIL_OTP_WINDOW_MS,
} from "./emailOtpRateLimit";
import { makeTest } from "../test/convexBackendTestHelpers";

describe("email OTP issuance limits", () => {
  test("allows three requests per address, then rejects the fourth", async () => {
    const t = makeTest();
    const now = 2_000_000_000_000;

    for (let index = 0; index < EMAIL_OTP_PER_ADDRESS_LIMIT; index += 1) {
      await t.mutation(internal.emailOtpRateLimit.reserveIssuance, {
        emailHash: "address-hash",
        now: now + index,
      });
    }

    await expect(
      t.mutation(internal.emailOtpRateLimit.reserveIssuance, {
        emailHash: "address-hash",
        now: now + EMAIL_OTP_PER_ADDRESS_LIMIT,
      }),
    ).rejects.toThrow("Too many code requests");
  });

  test("applies a global cap across different addresses", async () => {
    const t = makeTest();
    const now = 2_000_000_000_000;

    await t.run(async (ctx) => {
      for (let index = 0; index < EMAIL_OTP_GLOBAL_LIMIT; index += 1) {
        await ctx.db.insert("authEmailOtpRequests", {
          emailHash: `address-${index}`,
          createdAt: now + index,
        });
      }
    });

    await expect(
      t.mutation(internal.emailOtpRateLimit.reserveIssuance, {
        emailHash: "new-address",
        now: now + EMAIL_OTP_GLOBAL_LIMIT,
      }),
    ).rejects.toThrow("Email sign-in is busy");
  });

  test("expires the window and removes stale rows in bounded batches", async () => {
    const t = makeTest();
    const now = 2_000_000_000_000;
    const staleTime = now - EMAIL_OTP_WINDOW_MS - 1;

    await t.run(async (ctx) => {
      for (let index = 0; index < 55; index += 1) {
        await ctx.db.insert("authEmailOtpRequests", {
          emailHash: "stale-address",
          createdAt: staleTime,
        });
      }
    });

    await t.mutation(internal.emailOtpRateLimit.reserveIssuance, {
      emailHash: "stale-address",
      now,
    });

    const remainingStale = await t.run((ctx) =>
      ctx.db
        .query("authEmailOtpRequests")
        .withIndex("by_createdAt", (q) =>
          q.lt("createdAt", now - EMAIL_OTP_WINDOW_MS),
        )
        .take(100),
    );
    expect(remainingStale).toHaveLength(5);
  });
});

describe("email OTP code lifecycle", () => {
  async function reserveAndStore(
    t: ReturnType<typeof makeTest>,
    options: {
      emailHash?: string;
      codeHash?: string;
      now?: number;
      expiresAt?: number;
    } = {},
  ) {
    const emailHash = options.emailHash ?? "address-hash";
    const codeHash = options.codeHash ?? "correct-code-hash";
    const now = options.now ?? 2_000_000_000_000;
    const requestId = await t.mutation(
      internal.emailOtpRateLimit.reserveIssuance,
      { emailHash, now },
    );
    await t.mutation(internal.emailOtpRateLimit.storeDeliveredCode, {
      requestId,
      emailHash,
      codeHash,
      expiresAt: options.expiresAt ?? now + 15 * 60 * 1000,
      now,
    });
    return { emailHash, codeHash, now };
  }

  test("delivery failure leaves the prior valid code intact", async () => {
    const t = makeTest();
    const stored = await reserveAndStore(t);

    await t.mutation(internal.emailOtpRateLimit.reserveIssuance, {
      emailHash: stored.emailHash,
      now: stored.now + 1,
    });
    const result = await t.mutation(
      internal.emailOtpRateLimit.verifyAndConsumeCode,
      {
        emailHash: stored.emailHash,
        codeHash: stored.codeHash,
        now: stored.now + 2,
      },
    );
    expect(result).toBe("verified");
  });

  test("successful delivery atomically replaces the prior code", async () => {
    const t = makeTest();
    const stored = await reserveAndStore(t);
    const requestId = await t.mutation(
      internal.emailOtpRateLimit.reserveIssuance,
      { emailHash: stored.emailHash, now: stored.now + 1 },
    );
    await t.mutation(internal.emailOtpRateLimit.storeDeliveredCode, {
      requestId,
      emailHash: stored.emailHash,
      codeHash: "replacement-code-hash",
      expiresAt: stored.now + 15 * 60 * 1000,
      now: stored.now + 1,
    });

    expect(
      await t.mutation(internal.emailOtpRateLimit.verifyAndConsumeCode, {
        emailHash: stored.emailHash,
        codeHash: stored.codeHash,
        now: stored.now + 2,
      }),
    ).toBe("invalid");
    expect(
      await t.mutation(internal.emailOtpRateLimit.verifyAndConsumeCode, {
        emailHash: stored.emailHash,
        codeHash: "replacement-code-hash",
        now: stored.now + 3,
      }),
    ).toBe("verified");
  });

  test("consumes expired codes", async () => {
    const t = makeTest();
    const stored = await reserveAndStore(t, {
      expiresAt: 2_000_000_000_000,
    });

    expect(
      await t.mutation(internal.emailOtpRateLimit.verifyAndConsumeCode, {
        emailHash: stored.emailHash,
        codeHash: stored.codeHash,
        now: stored.now + 1,
      }),
    ).toBe("expired");
    expect(
      await t.mutation(internal.emailOtpRateLimit.verifyAndConsumeCode, {
        emailHash: stored.emailHash,
        codeHash: stored.codeHash,
        now: stored.now + 2,
      }),
    ).toBe("invalid");
  });

  test("counts failures and consumes the code at the attempt limit", async () => {
    const t = makeTest();
    const stored = await reserveAndStore(t);

    for (let attempt = 1; attempt < EMAIL_OTP_MAX_FAILED_ATTEMPTS; attempt += 1) {
      expect(
        await t.mutation(internal.emailOtpRateLimit.verifyAndConsumeCode, {
          emailHash: stored.emailHash,
          codeHash: `wrong-${attempt}`,
          now: stored.now + attempt,
        }),
      ).toBe("invalid");
    }

    expect(
      await t.mutation(internal.emailOtpRateLimit.verifyAndConsumeCode, {
        emailHash: stored.emailHash,
        codeHash: "last-wrong-attempt",
        now: stored.now + EMAIL_OTP_MAX_FAILED_ATTEMPTS,
      }),
    ).toBe("tooManyAttempts");
    expect(
      await t.mutation(internal.emailOtpRateLimit.verifyAndConsumeCode, {
        emailHash: stored.emailHash,
        codeHash: stored.codeHash,
        now: stored.now + EMAIL_OTP_MAX_FAILED_ATTEMPTS + 1,
      }),
    ).toBe("invalid");
  });

  test("marks a reused auth account as verified", async () => {
    const t = makeTest();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "Person@Example.COM" }),
    );

    await t.mutation(internal.emailOtpRateLimit.ensureVerifiedUser, {
      userId,
      email: "person@example.com",
    });

    expect(await t.run((ctx) => ctx.db.get(userId))).toMatchObject({
      email: "person@example.com",
      emailVerificationTime: expect.any(Number),
    });
  });
});
