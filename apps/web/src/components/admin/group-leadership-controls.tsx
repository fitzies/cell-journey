"use client";

import { useMutation } from "convex/react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
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
    <div className="min-w-64 space-y-3 py-1">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Primary leader</p>
        <Select value={primaryValue} onValueChange={changePrimary} disabled={pending}>
          <SelectTrigger className="w-56" aria-label={`Primary leader for ${group.group.name}`}><SelectValue placeholder="Assign primary leader" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No primary leader</SelectItem>
            {people.map((person) => {
              const isCoLeader = coLeaderProfileIds.has(person.profile._id);
              return (
                <SelectItem key={person.profile._id} value={person.profile._id}>
                  {profileDisplayName(person.profile, person.displayName)}{isCoLeader ? " (make primary)" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Co-leaders</p>
        {group.coLeaders.length ? (
          <div className="space-y-1">
            {group.coLeaders.map((coLeader) => (
              <div key={coLeader.assignment._id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{profileDisplayName(coLeader.profile, "Unnamed person")}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  disabled={pending}
                  onClick={() => run(() => revokeCoLeader({ assignmentId: coLeader.assignment._id }))}
                  aria-label={`Revoke ${profileDisplayName(coLeader.profile, "co-leader")} as co-leader`}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">None assigned</p>}
        <Select value={coLeaderValue} onValueChange={selectCoLeader} disabled={pending || availableCoLeaders.length === 0}>
          <SelectTrigger className="h-9 w-56" aria-label={`Add co-leader to ${group.group.name}`}><SelectValue placeholder="Assign co-leader" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="choose-co-leader">Assign co-leader…</SelectItem>
            {availableCoLeaders.map((person) => (
              <SelectItem key={person.profile._id} value={person.profile._id}>
                {profileDisplayName(person.profile, person.displayName)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? <p className="max-w-56 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
