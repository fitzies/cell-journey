"use client";

import { useMutation } from "convex/react";
import { useEffect, useState, useTransition } from "react";
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

export function GroupLeadershipControls({ group, people }: { group: GroupRow; people: UserRow[] }) {
  const setLeader = useMutation(api.admin.setGroupLeader);
  const assignCoLeader = useMutation(api.admin.assignCoLeader);
  const revokeCoLeader = useMutation(api.admin.revokeCoLeader);
  const [primaryValue, setPrimaryValue] = useState(group.group.leaderProfileId ?? "none");
  const [coLeaderValue, setCoLeaderValue] = useState("choose-co-leader");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setPrimaryValue(group.group.leaderProfileId ?? "none"), [group.group.leaderProfileId]);

  const coLeaderProfileIds = new Set(group.coLeaders.map((coLeader) => coLeader.profile._id));
  const availableCoLeaders = people.filter((person) =>
    person.profile._id !== group.group.leaderProfileId && !coLeaderProfileIds.has(person.profile._id),
  );

  function run(task: () => Promise<unknown>, onSuccess?: () => void, onError?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
        onSuccess?.();
      } catch (err) {
        onError?.();
        setError(err instanceof Error ? err.message : "Could not update leadership");
      }
    });
  }

  function changePrimary(next: string) {
    const previous = primaryValue;
    setPrimaryValue(next);
    run(
      () => setLeader({
        groupId: group.group._id,
        profileId: next === "none" ? null : next as Id<"userProfiles">,
      }),
      undefined,
      () => setPrimaryValue(previous),
    );
  }

  function selectCoLeader(next: string) {
    setCoLeaderValue(next);
    if (next === "choose-co-leader") return;
    run(
      () => assignCoLeader({ groupId: group.group._id, profileId: next as Id<"userProfiles"> }),
      () => setCoLeaderValue("choose-co-leader"),
      () => setCoLeaderValue("choose-co-leader"),
    );
  }

  return (
    <div className="flex min-w-64 items-center justify-between gap-3 py-1">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm">{group.leaderName ?? "No primary leader"}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {group.leaderName ? <Badge variant="secondary" className="text-[11px]">Primary</Badge> : null}
          {group.coLeaders.length ? <Badge variant="outline" className="text-[11px]">{group.coLeaders.length} co-leader{group.coLeaders.length === 1 ? "" : "s"}</Badge> : null}
          {!group.leaderName && !group.coLeaders.length ? <span className="text-xs text-muted-foreground">Needs leadership</span> : null}
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" aria-label={`Manage leadership for ${group.group.name}`}>
            <Settings2 className="h-3.5 w-3.5" />
            Manage
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage leadership</DialogTitle>
            <DialogDescription>{group.group.name} · {group.group.code}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Primary leader</p>
              <Select value={primaryValue} onValueChange={changePrimary} disabled={pending}>
                <SelectTrigger aria-label={`Primary leader for ${group.group.name}`}><SelectValue placeholder="Assign primary leader" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No primary leader</SelectItem>
                  {people.map((person) => {
                    const isCoLeader = coLeaderProfileIds.has(person.profile._id);
                    return <SelectItem key={person.profile._id} value={person.profile._id}>{profileDisplayName(person.profile, person.displayName)}{isCoLeader ? " (make primary)" : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Co-leaders</p>
              {group.coLeaders.length ? (
                <div className="divide-y rounded-md border">
                  {group.coLeaders.map((coLeader) => (
                    <div key={coLeader.assignment._id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="truncate">{profileDisplayName(coLeader.profile, "Unnamed person")}</span>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => run(() => revokeCoLeader({ assignmentId: coLeader.assignment._id }))} aria-label={`Revoke ${profileDisplayName(coLeader.profile, "co-leader")} as co-leader`}>Revoke</Button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">None assigned</p>}
              <Select value={coLeaderValue} onValueChange={selectCoLeader} disabled={pending || availableCoLeaders.length === 0}>
                <SelectTrigger aria-label={`Add co-leader to ${group.group.name}`}><SelectValue placeholder="Assign co-leader" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="choose-co-leader">Assign co-leader…</SelectItem>
                  {availableCoLeaders.map((person) => <SelectItem key={person.profile._id} value={person.profile._id}>{profileDisplayName(person.profile, person.displayName)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
