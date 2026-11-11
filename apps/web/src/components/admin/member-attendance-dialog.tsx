"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { api, type Id } from "@/lib/api";
import { cn } from "@/lib/utils";

import { PanelLoading, SearchInput } from "./panel-ui";
import { ProfileAvatar } from "./profile-avatar";
import type { MemberAttendanceResult, MemberAttendanceRow } from "./types";

type EventStatus = MemberAttendanceRow["statuses"][number];

const statusStyles: Record<EventStatus, string> = {
  present: "bg-primary",
  absent: "bg-destructive/70",
  unmarked: "bg-amber-400/80 dark:bg-amber-500/70",
  notMember: "border border-dashed border-muted-foreground/40 bg-transparent",
};

const statusLabels: Record<EventStatus, string> = {
  present: "Present",
  absent: "Absent",
  unmarked: "Not marked",
  notMember: "Not a member yet",
};

const memberStatusLabels: Record<MemberAttendanceRow["status"], string> = {
  active: "Active",
  visitor: "Visitor",
  inactive: "Inactive",
  former: "Former",
};

function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(timestamp);
}

export function MemberAttendanceDialog({
  group,
  range,
  periodLabel,
  onOpenChange,
}: {
  group: { _id: Id<"groups">; name: string } | null;
  range: { from: number; to: number };
  periodLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  const data = useQuery(
    api.admin.groupMemberAttendance,
    group ? { groupId: group._id, from: range.from, to: range.to } : "skip",
  );

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{group?.name ?? "Group"} attendance</DialogTitle>
          <DialogDescription>Each member&apos;s attendance across completed events in the {periodLabel}.</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 overflow-y-auto px-6 pb-1">
          {data === undefined ? <PanelLoading /> : <MemberAttendanceContent data={data} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberAttendanceContent({ data }: { data: MemberAttendanceResult }) {
  const [search, setSearch] = useState("");
  const members = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? data.members.filter((member) => member.displayName.toLowerCase().includes(query)) : data.members;
  }, [data.members, search]);
  const belowTarget = data.members.filter((member) => member.rate !== null && member.rate < 0.7).length;
  const unmarked = data.members.reduce((sum, member) => sum + member.unmarked, 0);

  const columns = useMemo<ColumnDef<MemberAttendanceRow>[]>(() => [
    {
      accessorKey: "displayName",
      id: "member",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Member" />,
      cell: ({ row }) => (
        <div className="flex min-w-48 items-center gap-3">
          <ProfileAvatar photoUrl={row.original.photoUrl} name={row.original.displayName} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.displayName}</p>
            <Badge
              variant={row.original.status === "active" ? "secondary" : "outline"}
              className={cn("mt-1", row.original.status !== "active" && "text-muted-foreground")}
            >
              {memberStatusLabels[row.original.status]}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      accessorFn: (row) => row.rate ?? -1,
      id: "rate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Attendance" />,
      cell: ({ row }) => row.original.expected === 0 ? (
        <span className="text-sm text-muted-foreground">No events</span>
      ) : (
        <div className="min-w-36 space-y-2">
          <div className="flex items-center justify-between gap-4 tabular-nums">
            <span className="font-medium">{formatPercent(row.original.rate)}</span>
            <span className="text-xs text-muted-foreground">{row.original.present}/{row.original.expected}</span>
          </div>
          <Progress value={(row.original.rate ?? 0) * 100} aria-label={`${row.original.displayName} attendance`} />
        </div>
      ),
    },
    {
      accessorKey: "present",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Present" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.present}</span>,
    },
    {
      accessorKey: "absent",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Absent" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.absent}</span>,
    },
    {
      accessorKey: "unmarked",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Not marked" />,
      cell: ({ row }) => (
        <span className={cn("tabular-nums", row.original.unmarked > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
          {row.original.unmarked}
        </span>
      ),
    },
    {
      accessorFn: (row) => row.lastPresentAt ?? 0,
      id: "lastPresent",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last attended" />,
      cell: ({ row }) => row.original.lastPresentAt
        ? <span className="whitespace-nowrap text-sm">{formatDate(row.original.lastPresentAt)}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "events",
      header: "Events",
      cell: ({ row }) => <EventStrip statuses={row.original.statuses} events={data.events} />,
    },
  ], [data.events]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Attendance" value={formatPercent(data.totals.rate)} detail={`${data.totals.present} of ${data.totals.expected} expected`} />
        <Stat label="Events" value={data.events.length} detail="completed" />
        <Stat label="Below 70%" value={belowTarget} detail={`of ${data.members.length} members`} />
        <Stat label="Not marked" value={unmarked} detail="member-events to record" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Legend />
        <SearchInput value={search} onChange={setSearch} placeholder="Search members" />
      </div>
      <DataTable
        columns={columns}
        data={members}
        getRowId={(row) => row.profileId}
        emptyMessage={search.trim() ? "No members match your search." : "No members in this period."}
      />
      {!data.isComplete ? (
        <p className="text-xs text-muted-foreground">This group reached the analytics safety limit. Figures may be partial.</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Event legend">
      {(Object.keys(statusLabels) as EventStatus[]).map((status) => (
        <li key={status} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-[3px]", statusStyles[status])} />
          {statusLabels[status]}
        </li>
      ))}
    </ul>
  );
}

function EventStrip({ statuses, events }: { statuses: EventStatus[]; events: MemberAttendanceResult["events"] }) {
  if (events.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex min-w-24 max-w-64 flex-wrap gap-1" role="list">
      {statuses.map((status, index) => {
        const event = events[index];
        const label = `${event ? `${event.title}, ${formatDate(event.startAt)}` : "Event"}: ${statusLabels[status]}`;
        return (
          <span
            key={event?._id ?? index}
            role="listitem"
            title={label}
            aria-label={label}
            className={cn("h-3 w-3 rounded-[3px]", statusStyles[status])}
          />
        );
      })}
    </div>
  );
}
