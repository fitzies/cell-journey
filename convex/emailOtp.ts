import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import {
  createAccount,
  type GenericActionCtxWithAuthConfig,
} from "@convex-dev/auth/server";
import { Resend as ResendAPI } from "resend";
import type { Value } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

const OTP_LENGTH = 8;
const OTP_MAX_AGE_MS = 15 * 60 * 1000;
const OTP_ALPHABET = "0123456789";
const DEFAULT_EMAIL_FROM = "Cell Journey <onboarding@resend.dev>";

type AuthEnvironment = Record<string, string | undefined>;

export type DevOtpConfig = {
  email: string;
  code: string;
};

export type ResendOtpConfig = {
  apiKey: string;
  otpSecret: string;
  from: string;
};

type OtpEmail = {
  apiKey: string;
  from: string;
  to: string;
  token: string;
  idempotencyKey: string;
};

type ResendOtpDependencies = {
  now: () => number;
  generateCode: () => string;
  sendEmail: (message: OtpEmail) => Promise<void>;
};

export function normalizeOtpEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateOtpEmail(value: Value | undefined) {
  if (typeof value !== "string") {
    throw new Error("Enter a valid email address");
  }

  const email = normalizeOtpEmail(value);
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Enter a valid email address");
  }
  return email;
}

async function hmacSha256(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashOtpEmail(value: string, otpSecret: string) {
  return await hmacSha256(`email:${normalizeOtpEmail(value)}`, otpSecret);
}

export async function hashOtpCode(
  emailHash: string,
  code: string,
  otpSecret: string,
) {
  return await hmacSha256(`code:${emailHash}:${code}`, otpSecret);
}

export function generateNumericOtp() {
  const random: RandomReader = {
    read(bytes) {
      crypto.getRandomValues(bytes as Uint8Array<ArrayBuffer>);
    },
  };

  return generateRandomString(random, OTP_ALPHABET, OTP_LENGTH);
}

function emailMarkup(token: string) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f3ee;font-family:Arial,sans-serif;color:#24211d">
    <div style="max-width:520px;margin:0 auto;padding:40px 24px">
      <div style="background:#ffffff;border-radius:18px;padding:32px;border:1px solid #e5e0d7">
        <p style="margin:0 0 10px;font-size:14px;color:#6f675d">CELL JOURNEY</p>
        <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25">Your sign-in code</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#544d45">Enter this code in the app. It expires in 15 minutes.</p>
        <div style="font-size:34px;letter-spacing:8px;font-weight:700;padding:18px 20px;background:#f5f3ee;border-radius:12px;text-align:center">${token}</div>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#756e65">If you did not request this code, you can ignore this email.</p>
      </div>
    </div>
  </body>
</html>`;
}

function resendErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Unknown Resend error";
}

async function sendOtpEmail(message: OtpEmail) {
  const resend = new ResendAPI(message.apiKey);
  const { error } = await resend.emails.send(
    {
      from: message.from,
      to: [message.to],
      subject: "Your Cell Journey sign-in code",
      text: `Your Cell Journey sign-in code is ${message.token}. It expires in 15 minutes.`,
      html: emailMarkup(message.token),
    },
    { idempotencyKey: message.idempotencyKey },
  );

  if (error) {
    throw new Error(`Could not send sign-in code: ${resendErrorMessage(error)}`);
  }
}

const defaultResendOtpDependencies: ResendOtpDependencies = {
  now: Date.now,
  generateCode: generateNumericOtp,
  sendEmail: sendOtpEmail,
};

export function getResendOtpConfig(
  environment: AuthEnvironment = process.env,
): ResendOtpConfig {
  const apiKey = environment.AUTH_RESEND_KEY ?? "";
  const otpSecret = environment.AUTH_OTP_SECRET ?? "";
  if (!apiKey) throw new Error("AUTH_RESEND_KEY is not configured");
  if (otpSecret.length < 32) {
    throw new Error("AUTH_OTP_SECRET must contain at least 32 characters");
  }

  return {
    apiKey,
    otpSecret,
    from: environment.AUTH_EMAIL?.trim() || DEFAULT_EMAIL_FROM,
  };
}

export function getDevOtpConfig(
  environment: AuthEnvironment = process.env,
): DevOtpConfig | null {
  if (environment.AUTH_DEV_LOGIN_ENABLED !== "true") return null;

  const email = normalizeOtpEmail(environment.AUTH_DEV_EMAIL ?? "");
  const code = environment.AUTH_DEV_CODE ?? "";

  if (!email) {
    throw new Error("AUTH_DEV_EMAIL is required when dev login is enabled");
  }
  if (!/^\d{8}$/.test(code)) {
    throw new Error(
      "AUTH_DEV_CODE must be exactly 8 digits when dev login is enabled",
    );
  }

  return { email, code };
}

export async function requestResendOtp(
  email: string,
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  config: ResendOtpConfig,
  dependencies: ResendOtpDependencies = defaultResendOtpDependencies,
) {
  const now = dependencies.now();
  const emailHash = await hashOtpEmail(email, config.otpSecret);
  const requestId = await ctx.runMutation(
    internal.emailOtpRateLimit.reserveIssuance,
    { emailHash, now },
  );

  const token = dependencies.generateCode();
  await dependencies.sendEmail({
    apiKey: config.apiKey,
    from: config.from,
    to: email,
    token,
    idempotencyKey: `email-otp/${requestId}`,
  });

  await ctx.runMutation(internal.emailOtpRateLimit.storeDeliveredCode, {
    requestId,
    emailHash,
    codeHash: await hashOtpCode(emailHash, token, config.otpSecret),
    expiresAt: now + OTP_MAX_AGE_MS,
    now,
  });
  return null;
}

export async function verifyResendOtp(
  email: string,
  code: string,
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  config: ResendOtpConfig,
) {
  const emailHash = await hashOtpEmail(email, config.otpSecret);
  const result = await ctx.runMutation(
    internal.emailOtpRateLimit.verifyAndConsumeCode,
    {
      emailHash,
      codeHash: await hashOtpCode(emailHash, code, config.otpSecret),
      now: Date.now(),
    },
  );

  if (result === "expired") throw new Error("Verification code expired");
  if (result === "tooManyAttempts") {
    throw new Error("Too many incorrect attempts. Request a new code");
  }
  if (result !== "verified") throw new Error("Invalid verification code");

  const { user } = await createAccount<DataModel>(ctx, {
    provider: "resend-otp",
    account: { id: email },
    profile: {
      email,
      emailVerificationTime: Date.now(),
    },
    shouldLinkViaEmail: true,
  });
  await ctx.runMutation(internal.emailOtpRateLimit.ensureVerifiedUser, {
    userId: user._id,
    email,
  });
  return { userId: user._id };
}

export async function authorizeResendOtp(
  credentials: Partial<Record<string, Value | undefined>>,
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
) {
  const email = validateOtpEmail(credentials.email);
  if (credentials.code === undefined) {
    return await requestResendOtp(email, ctx, getResendOtpConfig());
  }
  if (
    typeof credentials.code !== "string" ||
    !/^\d{8}$/.test(credentials.code)
  ) {
    throw new Error("Invalid verification code");
  }
  return await verifyResendOtp(
    email,
    credentials.code,
    ctx,
    getResendOtpConfig(),
  );
}

export const ResendOTP = ConvexCredentials<DataModel>({
  id: "resend-otp",
  authorize: authorizeResendOtp,
});

export function validateDevLoginCredentials(
  credentials: Partial<Record<string, Value | undefined>>,
  config: DevOtpConfig,
) {
  const email =
    typeof credentials.email === "string"
      ? normalizeOtpEmail(credentials.email)
      : "";
  const code = typeof credentials.code === "string" ? credentials.code : "";

  if (email !== config.email || code !== config.code) {
    throw new Error("Invalid dev login credentials");
  }

  return email;
}

export async function authorizeDevLogin(
  credentials: Partial<Record<string, Value | undefined>>,
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  config: DevOtpConfig,
) {
  const email = validateDevLoginCredentials(credentials, config);
  const { user } = await createAccount<DataModel>(ctx, {
    provider: "dev-otp",
    account: { id: email },
    profile: {
      email,
      emailVerificationTime: Date.now(),
    },
    shouldLinkViaEmail: true,
  });
  await ctx.runMutation(internal.emailOtpRateLimit.ensureVerifiedUser, {
    userId: user._id,
    email,
  });
  await ctx.runMutation(internal.devAccountProvisioning.provision, {
    userId: user._id,
    email,
  });

  return { userId: user._id };
}

export function createDevLoginProvider(config: DevOtpConfig) {
  return ConvexCredentials<DataModel>({
    id: "dev-otp",
    authorize: async (credentials, ctx) =>
      await authorizeDevLogin(credentials, ctx, config),
  });
}

export function getDevLoginProvider(environment: AuthEnvironment = process.env) {
  const config = getDevOtpConfig(environment);
  return config ? createDevLoginProvider(config) : null;
}
