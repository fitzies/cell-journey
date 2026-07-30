"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { useMemo, useState, useTransition } from "react";

import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Id } from "@/lib/api";

import { PanelLoading, SearchInput } from "./panel-ui";
import { profileDisplayName } from "./profile-display-name";
import type { GroupRow, UserRow } from "./types";

export function PeoplePanel({
  search,
  setSearch,
  users,
  groups,
  loading,
}: {
  search: string;
  setSearch: (value: string) => void;
  users: UserRow[];
  groups: GroupRow[] | undefined;
  loading: boolean;
}) {
  const columns = useMemo<ColumnDef<UserRow>[]>(() => [
    {
      accessorFn: (row) => profileDisplayName(row.profile, row.displayName),
      id: "user",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Person" />,
      cell: ({ row }) => (
        <div className="min-w-48">
          <p className="font-medium">{profileDisplayName(row.original.profile, row.original.displayName)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.original.user.email ?? "No email"}</p>
        </div>
      ),
    },
    {
      accessorFn: (row) => `${row.memberGroups.length}:${row.ledGroups.map((group) => group.accessRole).join(":")}`,
      id: "capabilities",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Access" />,
      cell: ({ row }) => {
        const primaryGroups = row.original.ledGroups.filter((group) => group.accessRole === "owner");
        const coLeaderGroups = row.original.ledGroups.filter((group) => group.accessRole === "coLeader");
        return (
          <div className="flex flex-wrap gap-1.5">
            {row.original.memberGroups.length ? <Badge variant="secondary">Member</Badge> : null}
            {primaryGroups.length ? <Badge>Primary leader</Badge> : null}
            {coLeaderGroups.length ? <Badge variant="outline">Co-leader</Badge> : null}
            {!row.original.memberGroups.length && !row.original.ledGroups.length ? <span className="text-muted-foreground">None</span> : null}
          </div>
        );
      },
    },
    {
      accessorFn: (row) => row.memberGroups.map((group) => group.name).join(", "),
      id: "memberGroup",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Member groups" />,
      cell: ({ row }) => row.original.memberGroups.length ? (
        <div className="flex max-w-64 flex-wrap gap-1">{row.original.memberGroups.map((group) => <Badge key={group.groupId} variant="outline">{group.name}</Badge>)}</div>
      ) : <span className="text-muted-foreground">None</span>,
    },
    {
      accessorFn: (row) => row.ledGroups.map((group) => `${group.name} ${group.accessRole}`).join(", "),
      id: "leaderGroup",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Leads" />,
      cell: ({ row }) => row.original.ledGroups.length ? (
        <div className="flex max-w-72 flex-wrap gap-1">
          {row.original.ledGroups.map((group) => (
            <Badge key={group.groupId} variant="outline" className="gap-1 font-normal">
              {group.name}
              <span className="text-muted-foreground">· {group.accessRole === "owner" ? "Primary" : "Co-leader"}</span>
            </Badge>
          ))}
        </div>
      ) : <span className="text-muted-foreground">None</span>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <PeopleActions row={row.original} groups={groups ?? []} />,
    },
  ], [groups]);

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>People</CardTitle>
          <CardDescription className="mt-1">Manage memberships and primary leader or co-leader assignments independently.</CardDescription>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search people" />
      </CardHeader>
      <CardContent>
        {loading ? <PanelLoading /> : <DataTable columns={columns} data={users} emptyMessage="No people found." />}
      </CardContent>
    </Card>
  );
}

function PeopleActions({ row, groups }: { row: UserRow; groups: GroupRow[] }) {
  const activeGroups = groups.filter((item) => item.group.isActive);
  const assignMember = useMutation(api.admin.assignMemberToGroup);
  const removeMembership = useMutation(api.admin.removeMembership);
  const setLeader = useMutation(api.admin.setGroupLeader);
  const assignCoLeader = useMutation(api.admin.assignCoLeader);
  const revokeCoLeader = useMutation(api.admin.revokeCoLeader);
  const [memberValue, setMemberValue] = useState("choose-member");
  const [primaryValue, setPrimaryValue] = useState("choose-primary");
  const [coLeaderValue, setCoLeaderValue] = useState("choose-co-leader");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<unknown>, reset?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update assignments");
      } finally {
        reset?.();
      }
    });
  }

  const availableMemberships = activeGroups.filter((group) => !row.memberGroups.some((item) => item.groupId === group.group._id));
  const availableLeadership = activeGroups.filter((group) => !row.ledGroups.some((item) => item.groupId === group.group._id));

  return (
    <div className="min-w-[36rem] space-y-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        {row.memberGroups.map((group) => (
          <Button key={`member-${group.groupId}`} variant="outline" size="sm" disabled={pending} onClick={() => run(() => removeMembership({ profileId: row.profile._id, groupId: group.groupId }))}>
            Remove membership · {group.name}
          </Button>
        ))}
        {row.ledGroups.map((group) => {
          if (group.accessRole === "owner") {
            return (
              <Button key={`primary-${group.groupId}`} variant="outline" size="sm" disabled={pending} onClick={() => run(() => setLeader({ groupId: group.groupId, profileId: null }))}>
                Unassign primary · {group.name}
              </Button>
            );
          }

          const assignment = groups
            .find((item) => item.group._id === group.groupId)
            ?.coLeaders.find((coLeader) => coLeader.profile._id === row.profile._id)
            ?.assignment;
          return (
            <Button
              key={`co-leader-${group.groupId}`}
              variant="outline"
              size="sm"
              disabled={pending || !assignment}
              onClick={() => assignment && run(() => revokeCoLeader({ assignmentId: assignment._id }))}
              title={assignment ? undefined : "Open the group row to manage this co-leader"}
            >
              Revoke co-leader · {group.name}
            </Button>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Select value={memberValue} onValueChange={(next) => {
          setMemberValue(next);
          if (next !== "choose-member") run(
            () => assignMember({ profileId: row.profile._id, groupId: next as Id<"groups"> }),
            () => setMemberValue("choose-member"),
          );
        }} disabled={pending || availableMemberships.length === 0}>
          <SelectTrigger className="w-44" aria-label={`Add membership for ${profileDisplayName(row.profile, "this person")}`}><SelectValue placeholder="Add membership" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="choose-member">Add membership…</SelectItem>
            {availableMemberships.map((group) => <SelectItem key={group.group._id} value={group.group._id}>{group.group.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={primaryValue} onValueChange={(next) => {
          setPrimaryValue(next);
          if (next !== "choose-primary") run(
            () => setLeader({ groupId: next as Id<"groups">, profileId: row.profile._id }),
            () => setPrimaryValue("choose-primary"),
          );
        }} disabled={pending || availableLeadership.length === 0}>
          <SelectTrigger className="w-44" aria-label={`Assign ${profileDisplayName(row.profile, "this person")} as primary leader`}><SelectValue placeholder="Assign primary" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="choose-primary">Assign primary…</SelectItem>
            {availableLeadership.map((group) => <SelectItem key={group.group._id} value={group.group._id}>{group.group.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={coLeaderValue} onValueChange={(next) => {
          setCoLeaderValue(next);
          if (next !== "choose-co-leader") run(
            () => assignCoLeader({ groupId: next as Id<"groups">, profileId: row.profile._id }),
            () => setCoLeaderValue("choose-co-leader"),
          );
        }} disabled={pending || availableLeadership.length === 0}>
          <SelectTrigger className="w-44" aria-label={`Assign ${profileDisplayName(row.profile, "this person")} as co-leader`}><SelectValue placeholder="Assign co-leader" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="choose-co-leader">Assign co-leader…</SelectItem>
            {availableLeadership.map((group) => <SelectItem key={group.group._id} value={group.group._id}>{group.group.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {error ? <p className="text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
