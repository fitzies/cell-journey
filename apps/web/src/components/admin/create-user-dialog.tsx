"use client";

import { useMutation } from "convex/react";
import { UserPlus } from "lucide-react";
import { type FormEvent, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";

export function CreateUserDialog() {
  const createInvitedProfile = useMutation(api.admin.createInvitedProfile);
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formId = useId();
  const errorId = `${formId}-error`;

  function setDialogOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    setError(null);
    if (nextOpen) {
      setFirstName("");
      setLastName("");
      setEmail("");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createInvitedProfile({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
        });
        setDialogOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create this person");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1 sm:flex-none">
          <UserPlus />Create user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            You can assign this person to groups now. They will claim this profile when they sign in with the same email.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-4 py-2">
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-first-name`}>First name</Label>
              <Input
                id={`${formId}-first-name`}
                name="given-name"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-last-name`}>Last name</Label>
              <Input
                id={`${formId}-last-name`}
                name="family-name"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-email`}>Email</Label>
            <Input
              id={`${formId}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              required
            />
            <p className="text-xs text-muted-foreground">Use the email they will choose when signing in.</p>
          </div>
          {error ? <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>Cancel</Button>
          <Button
            type="submit"
            form={formId}
            disabled={pending || !firstName.trim() || !lastName.trim() || !email.trim()}
          >
            {pending ? <><Spinner />Creating…</> : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
