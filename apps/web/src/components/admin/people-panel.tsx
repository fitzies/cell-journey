"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

import { PanelLoading, SearchInput } from "./panel-ui";
import { PeopleManagementControls } from "./people-management-controls";
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
      cell: ({ row }) => <PersonIdentity row={row.original} />,
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
            {!row.original.memberGroups.length && !row.original.ledGroups.length ? <span className="text-muted-foreground">None</span> : null}
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
      cell: ({ row }) => <PeopleManagementControls person={row.original} groups={groups ?? []} />,
    },
  ], [groups]);

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
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-w-56 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/15">
        {initials || "?"}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.user.email ?? "No email"}</p>
      </div>
    </div>
  );
}
