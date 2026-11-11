"use client";

import { formatSingaporePhone } from "@cell-journey/domain";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { useDashboardRole } from "./access-context";
import { ProfileAvatar } from "./profile-avatar";
import { PanelLoading, SearchInput } from "./panel-ui";
import { PeopleManagementControls } from "./people-management-controls";
import { DeleteUserDialog } from "./delete-user-dialog";
import { profileDisplayName } from "./profile-display-name";
import type { GroupRow, PersonAttendance, UserRow } from "./types";

function attendanceRate(stats: PersonAttendance | undefined) {
  return stats && stats.expected > 0 ? stats.present / stats.expected : null;
}

export function PeoplePanel({
  search,
  setSearch,
  users,
  groups,
  loading,
  attendance,
  attendanceLoading,
  periodLabel,
}: {
  search: string;
  setSearch: (value: string) => void;
  users: UserRow[];
  groups: GroupRow[] | undefined;
  loading: boolean;
  attendance: Map<string, PersonAttendance>;
  attendanceLoading: boolean;
  periodLabel: string;
}) {
  const { isAdmin } = useDashboardRole();
  const columns = useMemo<ColumnDef<UserRow>[]>(() => [
    {
      accessorFn: (row) => profileDisplayName(row.profile, row.displayName),
      id: "user",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Person" />,
      cell: ({ row }) => <PersonIdentity row={row.original} />,
    },
    {
      accessorFn: (row) => attendanceRate(attendance.get(row.profile._id)) ?? -1,
      id: "attendance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Attendance" />,
      cell: ({ row }) => {
        if (attendanceLoading) return <span className="text-xs text-muted-foreground" role="status">Loading…</span>;
        const stats = attendance.get(row.original.profile._id);
        const rate = attendanceRate(stats);
        if (!stats || rate === null) {
          return (
            <div className="min-w-32">
              <span className="text-muted-foreground">—</span>
              <p className="text-xs text-muted-foreground">No events</p>
            </div>
          );
        }
        const name = profileDisplayName(row.original.profile, row.original.displayName);
        return (
          <div className="min-w-32 space-y-2" title={`${stats.present} of ${stats.expected} events in the ${periodLabel}`}>
            <div className="flex items-center justify-between gap-4 tabular-nums">
              <span className="font-medium">{Math.round(rate * 100)}%</span>
              <span className="text-xs text-muted-foreground">{stats.present}/{stats.expected}</span>
            </div>
            <Progress value={rate * 100} aria-label={`${name} attendance`} />
          </div>
        );
      },
    },
    {
      accessorKey: "accountStatus",
      id: "accountStatus",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
      cell: ({ row }) => row.original.accountStatus === "awaitingSignIn" ? (
        <Badge variant="outline" className="text-muted-foreground">Awaiting sign-in</Badge>
      ) : (
        <Badge variant="secondary">Active</Badge>
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
            {primaryGroups.length ? <Badge className="border-transparent bg-primary/15 text-primary">Primary leader</Badge> : null}
            {coLeaderGroups.length ? <Badge variant="outline" className="text-muted-foreground">Co-leader</Badge> : null}
            {row.original.regionalRegions.length ? (
              <Badge
                className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300"
                title={row.original.regionalRegions.map((region) => region.name).join(", ")}
              >
                Regional leader
              </Badge>
            ) : null}
            {!row.original.memberGroups.length && !row.original.ledGroups.length && !row.original.regionalRegions.length ? <span className="text-muted-foreground">None</span> : null}
          </div>
        );
      },
    },
    {
      accessorFn: (row) => [
        ...row.memberGroups.map((group) => group.name),
        ...row.ledGroups.map((group) => group.name),
      ].join(", "),
      id: "groups",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Groups" />,
      cell: ({ row }) => {
        const memberships = row.original.memberGroups;
        const leadership = row.original.ledGroups;
        if (!memberships.length && !leadership.length) return <span className="text-muted-foreground">None</span>;
        return (
          <div className="flex max-w-80 flex-wrap gap-1.5">
            {memberships.map((group) => <Badge key={`member-${group.groupId}`} variant="outline" className="text-muted-foreground">{group.name}</Badge>)}
            {leadership.map((group) => (
              <Badge key={`led-${group.groupId}`} variant="outline">
                {group.name}
                <span className="text-muted-foreground">· {group.accessRole === "owner" ? "Primary" : "Co-lead"}</span>
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <div className="flex justify-end gap-2">
        <PeopleManagementControls person={row.original} groups={groups ?? []} />
        {isAdmin ? <DeleteUserDialog person={row.original} /> : null}
      </div>,
    },
  ], [groups, attendance, attendanceLoading, periodLabel, isAdmin]);

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>People</CardTitle>
          <CardDescription className="mt-1">Manage memberships and primary leader or co-leader assignments per person.</CardDescription>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search people" />
      </CardHeader>
      <CardContent>
        {loading ? <PanelLoading /> : <DataTable columns={columns} data={users} getRowId={(row) => row.profile._id} emptyMessage="No people found." />}
      </CardContent>
    </Card>
  );
}

function PersonIdentity({ row }: { row: UserRow }) {
  const name = profileDisplayName(row.profile, row.displayName);

  return (
    <div className="flex min-w-56 items-center gap-3">
      <ProfileAvatar photoUrl={row.profile.photoUrl} name={name} />
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.user.email ?? "No email"}</p>
        {row.profile.phone ? (
          <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">{formatSingaporePhone(row.profile.phone)}</p>
        ) : null}
      </div>
    </div>
  );
}
