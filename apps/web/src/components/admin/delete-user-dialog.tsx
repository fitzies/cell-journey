"use client";

import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { profileDisplayName } from "./profile-display-name";
import type { UserRow } from "./types";

export function DeleteUserDialog({ person }: { person: UserRow }) {
  const deleteUser = useMutation(api.admin.deleteUser);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const name = profileDisplayName(person.profile, person.displayName);

  async function remove() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await deleteUser({ profileId: person.profile._id });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this user. Please try again.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <AlertDialog open={open} onOpenChange={(next) => {
    if (submitting.current) return;
    setError(null);
    setOpen(next);
  }}>
    <AlertDialogTrigger asChild>
      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" aria-label={`Delete ${name}`}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
        <AlertDialogDescription>
          This permanently removes {person.user.email || name}&apos;s account, profile details and photo, and ends all memberships and leadership assignments. Historical attendance remains under &quot;Deleted member&quot;. This cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <Button variant="destructive" disabled={pending} onClick={remove}>
          {pending ? "Deleting…" : "Delete user"}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
