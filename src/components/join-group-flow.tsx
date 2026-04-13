"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MembershipWithGroup = {
  status: "pending" | "active" | "left" | "rejected";
  group: { name: string } | null;
} | null;

export function JoinGroupFlow({
  membership,
}: {
  membership: MembershipWithGroup;
}) {
  if (membership?.status === "pending") {
    return <PendingView groupName={membership.group?.name ?? "Unknown"} />;
  }

  return <EnterCodeView />;
}

function EnterCodeView() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const joinGroup = useMutation(api.memberships.joinGroup);
  const { signOut } = useAuthActions();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setError("");
    setIsSubmitting(true);
    try {
      const result = await joinGroup({ code: trimmed });
      if (result && "error" in result && result.error) {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/icon.svg" alt="Cell Journey" className="w-10 h-10" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Join a Group
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the code your cell group leader gave you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. A3X9KQ"
            className="h-12 text-center text-lg font-mono tracking-widest"
            maxLength={6}
            autoComplete="off"
          />
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button
            type="submit"
            className="h-11"
            disabled={!code.trim() || isSubmitting}
          >
            {isSubmitting ? "Joining..." : "Request to Join"}
          </Button>
        </form>

        <button
          onClick={() => signOut()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function PendingView({ groupName }: { groupName: string }) {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
        <img src="/icon.svg" alt="Cell Journey" className="w-10 h-10" />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Request Sent
          </h1>
          <p className="text-sm text-muted-foreground">
            Your request to join <span className="font-medium text-foreground">{groupName}</span> has
            been sent. Your leader will approve it shortly.
          </p>
        </div>
      </div>
    </div>
  );
}
