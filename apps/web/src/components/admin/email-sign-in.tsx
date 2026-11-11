"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { type FormEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CODE_LENGTH = 8;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/** Uses the fixed development login for the configured dev email, outside production only. */
function emailProvider(email: string) {
  if (process.env.NODE_ENV === "production") return "resend-otp";
  const devEmail = normalizeEmail(process.env.NEXT_PUBLIC_AUTH_DEV_EMAIL ?? "");
  return devEmail && email === devEmail ? "dev-otp" : "resend-otp";
}

function deliveryError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("rate") || message.includes("too many")) {
    return "Too many codes were requested. Wait a few minutes, then try again.";
  }
  return "We couldn't send a code. Check the address and try again.";
}

export function EmailSignIn() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const normalized = normalizeEmail(email);
  const provider = emailProvider(normalized);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    if (provider === "dev-otp") {
      setStep("code");
      return;
    }
    setBusy(true);
    try {
      await signIn("resend-otp", { email: normalized });
      setStep("code");
    } catch (err) {
      setError(deliveryError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== CODE_LENGTH) return;
    setError(null);
    setBusy(true);
    try {
      const result = await signIn(provider, { email: normalized, code });
      if (!result.signingIn) setError("That code didn't work. Check it and try again.");
    } catch {
      setError("That code didn't work, or it has expired. Check it or request a new one.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-code`}>Sign-in code</Label>
          <Input
            id={`${formId}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            maxLength={CODE_LENGTH}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
            placeholder="8-digit code"
            className="font-mono tracking-[0.3em]"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {provider === "dev-otp" ? `Use the development code for ${normalized}.` : `We sent a code to ${normalized}.`}
          </p>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy || code.length !== CODE_LENGTH}>{busy ? "Checking…" : "Sign in"}</Button>
        <Button type="button" variant="ghost" onClick={() => { setStep("email"); setCode(""); setError(null); }} disabled={busy}>
          Use a different email
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={`${formId}-email`}>Email</Label>
        <Input
          id={`${formId}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" variant="outline" disabled={busy || !normalized}>{busy ? "Sending code…" : "Continue with email"}</Button>
    </form>
  );
}
