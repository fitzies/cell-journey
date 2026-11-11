"use client";

import { normalizeSingaporePhone, sexLabels, sexOptions, type Sex } from "@cell-journey/domain";
import { useMutation, useQuery } from "convex/react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api, type Id } from "@/lib/api";

import { useDashboardRole } from "./access-context";

const NONE = "none";

export function CreateUserDialog() {
  const createInvitedProfile = useMutation(api.admin.createInvitedProfile);
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [groupId, setGroupId] = useState(NONE);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState(NONE);
  const [phone, setPhone] = useState("");
  const { isAdmin } = useDashboardRole();
  const groups = useQuery(api.admin.listGroups, open ? { limit: 200 } : "skip");
  const activeGroups = (groups ?? [])
    .filter((row) => row.group.isActive)
    .sort((a, b) => a.group.name.localeCompare(b.group.name));
  const groupRequired = !isAdmin;
  const phoneInvalid = phone.trim() !== "" && normalizeSingaporePhone(phone) === null;
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
      setGroupId(NONE);
      setDateOfBirth("");
      setSex(NONE);
      setPhone("");
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
          ...(groupId !== NONE ? { groupId: groupId as Id<"groups"> } : {}),
          ...(dateOfBirth ? { dateOfBirth } : {}),
          ...(sex !== NONE ? { sex: sex as Sex } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            They will claim this profile when they sign in with the same email.
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
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-group`}>Group{groupRequired ? "" : " (optional)"}</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id={`${formId}-group`}><SelectValue placeholder="Choose a group" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} disabled={groupRequired}>{groupRequired ? "Choose a group" : "No group yet"}</SelectItem>
                {activeGroups.map((row) => <SelectItem key={row.group._id} value={row.group._id}>{row.group.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {groupId === NONE ? "Pick a group to add them straight away." : "They'll be added to this group and emailed."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-dob`}>Date of birth (optional)</Label>
              <Input
                id={`${formId}-dob`}
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-sex`}>Sex (optional)</Label>
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger id={`${formId}-sex`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {sexOptions.map((option) => <SelectItem key={option} value={option}>{sexLabels[option]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-phone`}>Phone (optional)</Label>
            <Input
              id={`${formId}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="9123 4567"
              aria-invalid={phoneInvalid || undefined}
            />
            <p className={phoneInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {phoneInvalid ? "Enter an 8-digit Singapore number." : "Singapore numbers only. +65 is added for you."}
            </p>
          </div>
          {error ? <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>Cancel</Button>
          <Button
            type="submit"
            form={formId}
            disabled={pending || !firstName.trim() || !lastName.trim() || !email.trim() || phoneInvalid || (groupRequired && groupId === NONE)}
          >
            {pending ? <><Spinner />Creating…</> : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
