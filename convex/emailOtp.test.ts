import type { GenericActionCtxWithAuthConfig } from "@convex-dev/auth/server";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import {
  authorizeDevLogin,
  authorizeResendOtp,
  createDevLoginProvider,
  generateNumericOtp,
  getDevOtpConfig,
  getResendOtpConfig,
  hashOtpCode,
  hashOtpEmail,
  normalizeOtpEmail,
  requestResendOtp,
  ResendOTP,
  validateDevLoginCredentials,
  validateOtpEmail,
  verifyResendOtp,
} from "./emailOtp";

const OTP_SECRET = "test-secret-with-at-least-32-characters";
const RESEND_CONFIG = {
  apiKey: "test-resend-key",
  otpSecret: OTP_SECRET,
  from: "Cell Journey <test@example.com>",
};

function actionCtx(runMutation: ReturnType<typeof vi.fn>) {
  return {
    runMutation,
  } as unknown as GenericActionCtxWithAuthConfig<DataModel>;
}

describe("email OTP credentials provider", () => {
  test("normalizes and validates email addresses", () => {
    expect(normalizeOtpEmail("  Person@Example.COM ")).toBe(
      "person@example.com",
    );
    expect(validateOtpEmail(" Person@Example.COM ")).toBe(
      "person@example.com",
    );
    expect(() => validateOtpEmail("not-an-email")).toThrow(
      "Enter a valid email address",
    );
  });

  test("requires separate Resend and OTP secrets", () => {
    expect(() => getResendOtpConfig({})).toThrow(
      "AUTH_RESEND_KEY is not configured",
    );
    expect(() =>
      getResendOtpConfig({
        AUTH_RESEND_KEY: "test-key",
        AUTH_OTP_SECRET: "too-short",
      }),
    ).toThrow("AUTH_OTP_SECRET must contain at least 32 characters");

    expect(
      getResendOtpConfig({
        AUTH_RESEND_KEY: "test-key",
        AUTH_OTP_SECRET: OTP_SECRET,
      }),
    ).toEqual({
      apiKey: "test-key",
      otpSecret: OTP_SECRET,
      from: "Cell Journey <onboarding@resend.dev>",
    });
  });

  test("generates varied eight-digit codes", () => {
    const codes = Array.from({ length: 32 }, generateNumericOtp);

    expect(codes.every((code) => /^\d{8}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(1);
  });

  test("uses normalized, secret-keyed hashes", async () => {
    const first = await hashOtpEmail(" Person@Example.COM ", OTP_SECRET);
    const second = await hashOtpEmail("person@example.com", OTP_SECRET);
    const otherSecret = await hashOtpEmail(
      "person@example.com",
      `${OTP_SECRET}-different`,
    );

    expect(first).toBe(second);
    expect(first).not.toBe(otherSecret);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashOtpCode(first, "12345678", OTP_SECRET)).not.toBe(
      await hashOtpCode(first, "87654321", OTP_SECRET),
    );
  });

  test("reserves, delivers, then stores the delivered code", async () => {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce("authEmailOtpRequests|request")
      .mockResolvedValueOnce(null);
    const sendEmail = vi.fn().mockResolvedValue(undefined);

    await expect(
      requestResendOtp(
        "person@example.com",
        actionCtx(runMutation),
        RESEND_CONFIG,
        {
          now: () => 2_000_000_000_000,
          generateCode: () => "12345678",
          sendEmail,
        },
      ),
    ).resolves.toBeNull();

    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(runMutation.mock.invocationCallOrder[0]).toBeLessThan(
      sendEmail.mock.invocationCallOrder[0],
    );
    expect(sendEmail.mock.invocationCallOrder[0]).toBeLessThan(
      runMutation.mock.invocationCallOrder[1],
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "person@example.com",
        token: "12345678",
        idempotencyKey: "email-otp/authEmailOtpRequests|request",
      }),
    );
    expect(runMutation.mock.calls[1][1]).toMatchObject({
      requestId: "authEmailOtpRequests|request",
      expiresAt: 2_000_000_900_000,
    });
  });

  test("does not store a code when delivery fails", async () => {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce("authEmailOtpRequests|request");
    const sendEmail = vi.fn().mockRejectedValue(new Error("Delivery failed"));

    await expect(
      requestResendOtp(
        "person@example.com",
        actionCtx(runMutation),
        RESEND_CONFIG,
        {
          now: () => 2_000_000_000_000,
          generateCode: () => "12345678",
          sendEmail,
        },
      ),
    ).rejects.toThrow("Delivery failed");
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  test("does not deliver or store when issuance is throttled", async () => {
    const runMutation = vi
      .fn()
      .mockRejectedValue(new Error("Too many code requests"));
    const sendEmail = vi.fn();

    await expect(
      requestResendOtp(
        "person@example.com",
        actionCtx(runMutation),
        RESEND_CONFIG,
        {
          now: () => 2_000_000_000_000,
          generateCode: () => "12345678",
          sendEmail,
        },
      ),
    ).rejects.toThrow("Too many code requests");
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("creates a verified account only after the code is consumed", async () => {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce("verified")
      .mockResolvedValueOnce({
        account: { _id: "authAccounts|email" },
        user: { _id: "users|email" },
      });

    await expect(
      verifyResendOtp(
        "person@example.com",
        "12345678",
        actionCtx(runMutation),
        RESEND_CONFIG,
      ),
    ).resolves.toEqual({ userId: "users|email" });

    expect(runMutation).toHaveBeenCalledTimes(3);
    expect(runMutation.mock.calls[1]).toEqual([
      "auth:store",
      expect.objectContaining({
        args: expect.objectContaining({
          type: "createAccountFromCredentials",
          provider: "resend-otp",
          account: { id: "person@example.com" },
          profile: expect.objectContaining({
            email: "person@example.com",
            emailVerificationTime: expect.any(Number),
          }),
          shouldLinkViaEmail: true,
        }),
      }),
    ]);
    expect(runMutation.mock.calls[2][1]).toEqual({
      userId: "users|email",
      email: "person@example.com",
    });
  });

  test("preserves the resend-otp provider id", () => {
    expect(
      (ResendOTP as unknown as { options: { id: string } }).options.id,
    ).toBe("resend-otp");
  });

  test("rejects malformed codes before accessing OTP storage", async () => {
    const runMutation = vi.fn();

    await expect(
      authorizeResendOtp(
        { email: "person@example.com", code: "not-a-code" },
        actionCtx(runMutation),
      ),
    ).rejects.toThrow("Invalid verification code");
    expect(runMutation).not.toHaveBeenCalled();
  });
});

describe("development OTP provider", () => {
  test("is disabled unless the flag is exactly true", () => {
    expect(
      getDevOtpConfig({
        AUTH_DEV_LOGIN_ENABLED: "false",
        AUTH_DEV_EMAIL: "dev@celljourney.test",
        AUTH_DEV_CODE: "42424242",
      }),
    ).toBeNull();
    expect(
      getDevOtpConfig({
        AUTH_DEV_LOGIN_ENABLED: "TRUE",
        AUTH_DEV_EMAIL: "dev@celljourney.test",
        AUTH_DEV_CODE: "42424242",
      }),
    ).toBeNull();
  });

  test("fails closed when enabled credentials are missing or malformed", () => {
    expect(() =>
      getDevOtpConfig({
        AUTH_DEV_LOGIN_ENABLED: "true",
        AUTH_DEV_CODE: "42424242",
      }),
    ).toThrow("AUTH_DEV_EMAIL is required");

    expect(() =>
      getDevOtpConfig({
        AUTH_DEV_LOGIN_ENABLED: "true",
        AUTH_DEV_EMAIL: "dev@celljourney.test",
        AUTH_DEV_CODE: "1234",
      }),
    ).toThrow("AUTH_DEV_CODE must be exactly 8 digits");
  });

  test("accepts the fixed code only for the configured address", () => {
    const config = getDevOtpConfig({
      AUTH_DEV_LOGIN_ENABLED: "true",
      AUTH_DEV_EMAIL: " DEV@CellJourney.Test ",
      AUTH_DEV_CODE: "42424242",
    });

    expect(
      validateDevLoginCredentials(
        { email: " DEV@CellJourney.Test ", code: "42424242" },
        config!,
      ),
    ).toBe("dev@celljourney.test");
    expect(() =>
      validateDevLoginCredentials(
        { email: "other@example.com", code: "42424242" },
        config!,
      ),
    ).toThrow("Invalid dev login credentials");

    const provider = createDevLoginProvider(config!);
    expect(
      (provider as unknown as { options: { id: string } }).options.id,
    ).toBe("dev-otp");
  });

  test("creates a verified, email-linkable account after validation", async () => {
    const runMutation = vi.fn().mockResolvedValue({
      account: { _id: "authAccounts|dev" },
      user: { _id: "users|dev" },
    });

    await expect(
      authorizeDevLogin(
        { email: "dev@celljourney.test", code: "42424242" },
        actionCtx(runMutation),
        { email: "dev@celljourney.test", code: "42424242" },
      ),
    ).resolves.toEqual({ userId: "users|dev" });

    expect(runMutation).toHaveBeenCalledWith(
      "auth:store",
      expect.objectContaining({
        args: expect.objectContaining({
          provider: "dev-otp",
          shouldLinkViaEmail: true,
        }),
      }),
    );
    expect(runMutation).toHaveBeenNthCalledWith(
      3,
      internal.devAccountProvisioning.provision,
      { userId: "users|dev", email: "dev@celljourney.test" },
    );
  });

  test("does not touch auth storage for invalid dev credentials", async () => {
    const runMutation = vi.fn();

    await expect(
      authorizeDevLogin(
        { email: "other@example.com", code: "42424242" },
        actionCtx(runMutation),
        { email: "dev@celljourney.test", code: "42424242" },
      ),
    ).rejects.toThrow("Invalid dev login credentials");
    expect(runMutation).not.toHaveBeenCalled();
  });
});
