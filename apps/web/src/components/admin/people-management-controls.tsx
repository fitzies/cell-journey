"use client";

import { useMutation } from "convex/react";
import { useState, useTransition } from "react";
import { Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Id } from "@/lib/api";

import { profileDisplayName } from "./profile-display-name";
import type { GroupRow, UserRow } from "./types";

export function PeopleManagementControls({ person, groups }: { person: UserRow; groups: GroupRow[] }) {
  const assignMember = useMutation(api.admin.assignMemberToGroup);
  const removeMembership = useMutation(api.admin.removeMembership);
  const setLeader = useMutation(api.admin.setGroupLeader);
  const assignCoLeader = useMutation(api.admin.assignCoLeader);
  const revokeCoLeader = useMutation(api.admin.revokeCoLeader);
  const [memberValue, setMemberValue] = useState("choose-member");
  const [primaryValue, setPrimaryValue] = useState("choose-primary");
  const [coLeaderValue, setCoLeaderValue] = useState("choose-co-leader");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<unknown>, onSuccess?: () => void, onError?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
        onSuccess?.();
      } catch (err) {
        onError?.();
        setError(err instanceof Error ? err.message : "Could not update assignments");
      }
    });
  }

  const activeGroups = groups.filter((item) => item.group.isActive);
  const availableMemberships = activeGroups.filter((group) => !person.memberGroups.some((item) => item.groupId === group.group._id));
  const availableLeadership = activeGroups.filter((group) => !person.ledGroups.some((item) => item.groupId === group.group._id));
  const name = profileDisplayName(person.profile, person.displayName);

  return (
    <div className="flex justify-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" aria-label={`Manage assignments for ${name}`}>
            <Settings2 className="h-3.5 w-3.5" />
            Manage
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage assignments</DialogTitle>
            <DialogDescription>{name}{person.user.email ? ` · ${person.user.email}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Memberships</p>
              {person.memberGroups.length ? (
                <div className="divide-y rounded-md border">
                  {person.memberGroups.map((group) => (
                    <div key={group.groupId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="truncate">{group.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                        disabled={pending}
                        onClick={() => run(() => removeMembership({ profileId: person.profile._id, groupId: group.groupId }))}
                        aria-label={`Remove membership in ${group.name}`}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">No memberships</p>}
              <Select
                value={memberValue}
                onValueChange={(next) => {
                  setMemberValue(next);
                  if (next === "choose-member") return;
                  run(
                    () => assignMember({ profileId: person.profile._id, groupId: next as Id<"groups"> }),
                    () => setMemberValue("choose-member"),
                    () => setMemberValue("choose-member"),
                  );
                }}
                disabled={pending || availableMemberships.length === 0}
              >
                <SelectTrigger aria-label={`Add membership for ${name}`}><SelectValue placeholder="Add membership" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="choose-member">Add membership…</SelectItem>
                  {availableMemberships.map((group) => <SelectItem key={group.group._id} value={group.group._id}>{group.group.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Leadership</p>
              {person.ledGroups.length ? (
                <div className="divide-y rounded-md border">
                  {person.ledGroups.map((group) => {
                    const assignment = groups
                      .find((item) => item.group._id === group.groupId)
                      ?.coLeaders.find((coLeader) => coLeader.profile._id === person.profile._id)
                      ?.assignment;
                    return (
                      <div key={group.groupId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {group.name}
                          <span className="ml-1.5 text-xs text-muted-foreground">{group.accessRole === "owner" ? "Primary" : "Co-leader"}</span>
                        </span>
                        {group.accessRole === "owner" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                            disabled={pending}
                            onClick={() => run(() => setLeader({ groupId: group.groupId, profileId: null }))}
                            aria-label={`Unassign primary leader of ${group.name}`}
                          >
                            Unassign
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                            disabled={pending || !assignment}
                            title={assignment ? undefined : "Unavailable right now"}
                            onClick={() => assignment && run(() => revokeCoLeader({ assignmentId: assignment._id }))}
                            aria-label={`Revoke co-leader of ${group.name}`}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-muted-foreground">No leadership assignments</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={primaryValue}
                  onValueChange={(next) => {
                    setPrimaryValue(next);
                    if (next === "choose-primary") return;
                    run(
                      () => setLeader({ groupId: next as Id<"groups">, profileId: person.profile._id }),
                      () => setPrimaryValue("choose-primary"),
                      () => setPrimaryValue("choose-primary"),
                    );
                  }}
                  disabled={pending || availableLeadership.length === 0}
                >
                  <SelectTrigger aria-label={`Assign ${name} as primary leader`}>
                    <SelectValue placeholder="Assign primary…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="choose-primary">Assign primary…</SelectItem>
                    {availableLeadership.map((group) => <SelectItem key={group.group._id} value={group.group._id}>{group.group.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select
                  value={coLeaderValue}
                  onValueChange={(next) => {
                    setCoLeaderValue(next);
                    if (next === "choose-co-leader") return;
                    run(
                      () => assignCoLeader({ groupId: next as Id<"groups">, profileId: person.profile._id }),
                      () => setCoLeaderValue("choose-co-leader"),
                      () => setCoLeaderValue("choose-co-leader"),
                    );
                  }}
                  disabled={pending || availableLeadership.length === 0}
                >
                  <SelectTrigger aria-label={`Assign ${name} as co-leader`}>
                    <SelectValue placeholder="Assign co-leader…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="choose-co-leader">Assign co-leader…</SelectItem>
                    {availableLeadership.map((group) => <SelectItem key={group.group._id} value={group.group._id}>{group.group.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
