"use client";

import { useMutation, useQuery } from "convex/react";
import { Map as MapIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useId, useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { api, type Id } from "@/lib/api";

import { PanelLoading } from "./panel-ui";
import { ProfileAvatar } from "./profile-avatar";
import { profileDisplayName } from "./profile-display-name";
import type { GroupRow, RegionRow, UserRow } from "./types";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function RegionsPanel({ groups, users }: { groups: GroupRow[] | undefined; users: UserRow[] | undefined }) {
  const regions = useQuery(api.regions.list);
  const unassigned = (groups ?? []).filter((row) => !row.region && row.group.isActive);

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Regions</CardTitle>
          <CardDescription className="mt-1">
            Group cells into regions. Regional leaders sign in to this dashboard and manage only the groups in their regions.
          </CardDescription>
        </div>
        <RegionNameDialog mode="create" />
      </CardHeader>
      <CardContent className="space-y-4">
        {regions === undefined ? (
          <PanelLoading />
        ) : regions.length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
            <MapIcon className="h-5 w-5 text-muted-foreground" />
            <p className="font-medium">No regions yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">Create a region, add its groups, then choose who leads it.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {regions.map((row) => (
              <RegionCard key={row.region._id} row={row} groups={groups ?? []} users={users ?? []} />
            ))}
          </div>
        )}
        {regions?.length && unassigned.length ? (
          <p className="text-xs text-muted-foreground">
            {unassigned.length} active {unassigned.length === 1 ? "group has" : "groups have"} no region yet.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RegionCard({ row, groups, users }: { row: RegionRow; groups: GroupRow[]; users: UserRow[] }) {
  const removeRegion = useMutation(api.regions.remove);
  const assignLeader = useMutation(api.regions.assignLeader);
  const removeLeader = useMutation(api.regions.removeLeader);
  const setGroupRegion = useMutation(api.regions.setGroupRegion);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [leaderValue, setLeaderValue] = useState("choose");
  const [groupValue, setGroupValue] = useState("choose");

  function run(task: () => Promise<unknown>, reset?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch (err) {
        setError(errorMessage(err, "Could not update this region"));
      } finally {
        reset?.();
      }
    });
  }

  const leaderIds = new Set(row.leaders.map((leader) => leader.profileId));
  const leaderCandidates = users
    .filter((person) => !leaderIds.has(person.profile._id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const groupIds = new Set(row.groups.map((group) => group._id));
  const groupCandidates = groups
    .filter((group) => !groupIds.has(group.group._id))
    .sort((a, b) => a.group.name.localeCompare(b.group.name));

  return (
    <div className="space-y-5 rounded-xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-[-0.02em]">{row.region.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.groups.length} {row.groups.length === 1 ? "group" : "groups"} · {row.leaders.length} regional {row.leaders.length === 1 ? "leader" : "leaders"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <RegionNameDialog mode="rename" regionId={row.region._id} currentName={row.region.name} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Delete ${row.region.name}`} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {row.region.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Its groups stay, but without a region. Its regional leaders lose dashboard access unless they lead another region.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => run(() => removeRegion({ regionId: row.region._id }))}
                >
                  Delete region
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <section className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Regional leaders</h4>
        {row.leaders.length ? (
          <ul className="space-y-2">
            {row.leaders.map((leader) => (
              <li key={leader.assignmentId} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileAvatar photoUrl={leader.photoUrl} name={leader.displayName} />
                  <span className="truncate text-sm font-medium">{leader.displayName}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => removeLeader({ assignmentId: leader.assignmentId }))}
                  aria-label={`Remove ${leader.displayName} as regional leader`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No regional leader yet.</p>
        )}
        <Select
          value={leaderValue}
          disabled={pending}
          onValueChange={(profileId) => {
            setLeaderValue(profileId);
            run(
              () => assignLeader({ regionId: row.region._id, profileId: profileId as Id<"userProfiles"> }),
              () => setLeaderValue("choose"),
            );
          }}
        >
          <SelectTrigger aria-label={`Add a regional leader to ${row.region.name}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="choose" disabled>Add a regional leader…</SelectItem>
            {leaderCandidates.map((person) => (
              <SelectItem key={person.profile._id} value={person.profile._id}>
                {profileDisplayName(person.profile, person.displayName)}
                {person.user.email ? <span className="text-muted-foreground"> · {person.user.email}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Groups</h4>
        {row.groups.length ? (
          <div className="flex flex-wrap gap-1.5">
            {row.groups.map((group) => (
              <Badge key={group._id} variant="outline" className="gap-1 py-1 pr-1">
                {group.name}
                {!group.isActive ? <span className="text-muted-foreground">· Archived</span> : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setGroupRegion({ groupId: group._id, regionId: null }))}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${group.name} from ${row.region.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No groups in this region.</p>
        )}
        <Select
          value={groupValue}
          disabled={pending}
          onValueChange={(groupId) => {
            setGroupValue(groupId);
            run(
              () => setGroupRegion({ groupId: groupId as Id<"groups">, regionId: row.region._id }),
              () => setGroupValue("choose"),
            );
          }}
        >
          <SelectTrigger aria-label={`Add a group to ${row.region.name}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="choose" disabled>Add a group…</SelectItem>
            {groupCandidates.map((group) => (
              <SelectItem key={group.group._id} value={group.group._id}>
                {group.group.name}
                {group.region ? <span className="text-muted-foreground"> · moves from {group.region.name}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function RegionNameDialog(
  props: { mode: "create" } | { mode: "rename"; regionId: Id<"regions">; currentName: string },
) {
  const createRegion = useMutation(api.regions.create);
  const renameRegion = useMutation(api.regions.rename);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formId = useId();
  const isCreate = props.mode === "create";

  function setDialogOpen(next: boolean) {
    setOpen(next);
    setError(null);
    if (next) setName(isCreate ? "" : props.currentName);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (props.mode === "create") await createRegion({ name });
        else await renameRegion({ regionId: props.regionId, name });
        setDialogOpen(false);
      } catch (err) {
        setError(errorMessage(err, "Could not save this region"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        {isCreate ? (
          <Button className="w-full sm:w-auto"><Plus />New region</Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={`Rename ${props.currentName}`}><Pencil className="h-4 w-4" /></Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCreate ? "New region" : "Rename region"}</DialogTitle>
          <DialogDescription>{isCreate ? "For example West, North-East or Zone 3." : "Groups and regional leaders stay as they are."}</DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-2 py-2">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <Input id={`${formId}-name`} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} autoFocus required />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>Cancel</Button>
          <Button type="submit" form={formId} disabled={pending || !name.trim()}>
            {pending ? "Saving…" : isCreate ? "Create region" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
