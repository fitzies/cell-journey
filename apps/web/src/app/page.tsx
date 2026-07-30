"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  LogOut,
  Minus,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { GroupLeadershipControls } from "@/components/admin/group-leadership-controls";
import { PanelLoading, SearchInput } from "@/components/admin/panel-ui";
import { PeoplePanel } from "@/components/admin/people-panel";
import { profileDisplayName } from "@/components/admin/profile-display-name";
import type {
  AttendanceRow,
  GroupRow,
  RequestRow,
  RequestRows,
  UserRow,
} from "@/components/admin/types";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { ModeToggle } from "@/components/mode-toggle";
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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";

const DAY = 24 * 60 * 60 * 1000;

type Period = "30" | "90" | "180";

function initialCode(name: string) {
  return name.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(timestamp);
}

export default function AdminPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.admin.me, isAuthenticated ? {} : "skip");

  if (isLoading || (isAuthenticated && me === undefined)) return <LoadingScreen />;
  if (!isAuthenticated) return <SignInScreen />;
  if (!me?.isAdmin) return <NoAccess reason={me?.reason ?? "notAllowed"} email={me?.email ?? null} />;

  return <AdminDashboard />;
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Loading admin
        </CardContent>
      </Card>
    </main>
  );
}

function SignInScreen() {
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    try {
      await signIn("google", { redirectTo: window.location.href });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-6 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-5 p-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-muted">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl tracking-[-0.03em]">Cell Journey Admin</CardTitle>
            <CardDescription>Attendance and group operations in one place.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <Button className="w-full" onClick={handleSignIn} disabled={busy}>
            {busy ? "Opening Google…" : "Continue with Google"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function NoAccess({ reason, email }: { reason: string; email: string | null }) {
  const { signOut } = useAuthActions();
  const message = reason === "notConfigured"
    ? "Set ADMIN_EMAILS in your Convex environment variables."
    : "This account is not on the admin allowlist.";

  return (
    <main className="grid min-h-screen place-items-center px-6 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-5 p-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-destructive/10 text-destructive">
            <CircleAlert className="h-4 w-4" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl tracking-[-0.03em]">Access unavailable</CardTitle>
            <CardDescription>{message}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-8 pb-8">
          {email ? <p className="text-sm text-muted-foreground">Signed in as {email}</p> : null}
          <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
        </CardContent>
      </Card>
    </main>
  );
}

function AdminDashboard() {
  const { signOut } = useAuthActions();
  const [tab, setTab] = useState("attendance");
  const [period, setPeriod] = useState<Period>("90");
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const range = useMemo(() => {
    const to = Date.now();
    return { from: to - Number(period) * DAY, to };
  }, [period]);

  const {
    results: attendance,
    status: attendanceStatus,
    loadMore: loadMoreAttendance,
  } = usePaginatedQuery(api.admin.listGroupAttendance, range, { initialNumItems: 10 });
  const needsManagementData = tab === "groups" || tab === "people";
  const users = useQuery(api.admin.listUsers, needsManagementData ? { limit: 250 } : "skip");
  const groups = useQuery(api.admin.listGroups, needsManagementData ? { limit: 200 } : "skip");
  const requests = useQuery(api.admin.listPendingJoinRequests, { limit: 100 });

  const attendanceRows = useMemo(() => {
    const search = attendanceSearch.trim().toLowerCase();
    if (!search) return attendance;
    return attendance.filter((row) =>
      [row.group.name, row.group.code, row.leaderName].filter(Boolean).join(" ").toLowerCase().includes(search),
    );
  }, [attendance, attendanceSearch]);

  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    if (!search) return users ?? [];
    return (users ?? []).filter((row) =>
      [
        row.displayName,
        row.user.email,
        ...row.memberGroups.map((group) => group.name),
        ...row.ledGroups.map((group) => group.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [userSearch, users]);

  const totals = useMemo(() => {
    const rows = attendance.filter((row) => row.group.isActive);
    const present = rows.reduce((sum, row) => sum + row.presentCount, 0);
    const expected = rows.reduce((sum, row) => sum + row.expectedCount, 0);
    return {
      rate: expected === 0 ? null : present / expected,
      present,
      expected,
      events: rows.reduce((sum, row) => sum + row.eventCount, 0),
      needsAttention: rows.filter((row) => row.eventCount > 0 && (row.attendanceRate ?? 1) < 0.7).length,
    };
  }, [attendance]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium tracking-[-0.01em]">Cell Journey</p>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void signOut()}>
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Overview</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Attendance dashboard</h1>
          </div>
          <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
            <SelectTrigger className="w-36" aria-label="Attendance period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Attendance" value={formatPercent(totals.rate)} detail={`${totals.present} of ${totals.expected} expected`} />
          <MetricCard label="Groups shown" value={attendance.filter((row) => row.group.isActive).length} detail="active groups loaded" />
          <MetricCard label="Events" value={totals.events} detail={`last ${period} days`} />
          <MetricCard label="Below 70%" value={totals.needsAttention} detail="groups to review" />
        </section>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="groups">Groups</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="requests">Requests{requests?.length ? ` (${requests.length})` : ""}</TabsTrigger>
            </TabsList>
            <CreateGroupDialog />
          </div>

          <TabsContent value="attendance">
            <AttendancePanel
              rows={attendanceRows}
              loading={attendanceStatus === "LoadingFirstPage"}
              loadingMore={attendanceStatus === "LoadingMore"}
              canLoadMore={attendanceStatus === "CanLoadMore"}
              loadMore={() => loadMoreAttendance(10)}
              search={attendanceSearch}
              setSearch={setAttendanceSearch}
            />
          </TabsContent>
          <TabsContent value="groups">
            <GroupsPanel groups={groups} users={users} />
          </TabsContent>
          <TabsContent value="people">
            <PeoplePanel
              search={userSearch}
              setSearch={setUserSearch}
              users={filteredUsers}
              groups={groups}
              loading={users === undefined}
            />
          </TabsContent>
          <TabsContent value="requests">
            <RequestsPanel requests={requests} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function AttendancePanel({
  rows,
  loading,
  loadingMore,
  canLoadMore,
  loadMore,
  search,
  setSearch,
}: {
  rows: AttendanceRow[];
  loading: boolean;
  loadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  const [showEmptyState, setShowEmptyState] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowEmptyState(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowEmptyState(true), 1500);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  const columns = useMemo<ColumnDef<AttendanceRow>[]>(() => [
    {
      accessorFn: (row) => row.group.name,
      id: "group",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Group" />,
      cell: ({ row }) => (
        <div className="min-w-44">
          <p className="font-medium">{row.original.group.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.original.leaderName ?? "No leader"}</p>
        </div>
      ),
    },
    {
      accessorFn: (row) => row.attendanceRate ?? -1,
      id: "attendance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Attendance" />,
      cell: ({ row }) => {
        const rate = row.original.attendanceRate;
        return (
          <div className="min-w-40 space-y-2">
            <div className="flex items-center justify-between gap-4 tabular-nums">
              <span className="font-medium">{formatPercent(rate)}</span>
              <span className="text-xs text-muted-foreground">{row.original.presentCount}/{row.original.expectedCount}</span>
            </div>
            <Progress value={(rate ?? 0) * 100} aria-label={`${row.original.group.name} attendance`} />
          </div>
        );
      },
    },
    {
      accessorFn: (row) => row.rateChange ?? -100,
      id: "trend",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Change" />,
      cell: ({ row }) => <RateChange value={row.original.rateChange} />,
    },
    {
      accessorKey: "activeMemberCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Members" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.activeMemberCount}</span>,
    },
    {
      accessorKey: "eventCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Events" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.eventCount}</span>,
    },
    {
      accessorFn: (row) => row.lastEvent?.startAt ?? 0,
      id: "lastEvent",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last event" />,
      cell: ({ row }) => row.original.lastEvent ? (
        <div className="min-w-32">
          <p className="text-sm">{formatDate(row.original.lastEvent.startAt)}</p>
          <p className="mt-0.5 max-w-40 truncate text-xs text-muted-foreground">{row.original.lastEvent.title}</p>
        </div>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorFn: (row) => row.group.isActive,
      id: "status",
      header: "Status",
      cell: ({ row }) => row.original.group.isActive
        ? <Badge variant="secondary">Active</Badge>
        : <Badge variant="outline">Archived</Badge>,
    },
  ], []);

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Group attendance</CardTitle>
          <CardDescription className="mt-1">Weighted by expected attendance across completed events.</CardDescription>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search groups" />
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !showEmptyState ? (
          <PanelLoading />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            emptyMessage="No attendance data yet. It will appear after the first completed event."
          />
        )}
        {loading && showEmptyState ? (
          <p className="text-xs text-muted-foreground">Still checking for updates…</p>
        ) : null}
        {rows.some((row) => !row.isComplete) ? (
          <p className="text-xs text-muted-foreground">Some high-volume groups reached the analytics safety limit. Their figures may be partial.</p>
        ) : null}
        {canLoadMore || loadingMore ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more groups"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RateChange({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const points = Math.round(Math.abs(value) * 100);
  if (points === 0) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3.5 w-3.5" />0 pts</span>;
  const positive = value > 0;
  return (
    <span className={positive ? "inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400" : "inline-flex items-center gap-1 text-xs text-destructive"}>
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {points} pts
    </span>
  );
}

function CreateGroupDialog() {
  const createGroup = useMutation(api.admin.createGroup);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await createGroup({ name, code: code || undefined });
        setName("");
        setCode("");
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create group");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus />Create group</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>Members use the six-character code during onboarding.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!code) setCode(initialCode(event.target.value));
              }}
              placeholder="Bukit Timah Cell"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-code">Code</Label>
            <Input
              id="group-code"
              value={code}
              maxLength={6}
              minLength={6}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="BTIMAH"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupsPanel({ groups, users }: { groups: GroupRow[] | undefined; users: UserRow[] | undefined }) {
  const leaders = useMemo(() => users ?? [], [users]);
  const columns = useMemo<ColumnDef<GroupRow>[]>(() => [
    {
      accessorFn: (row) => row.group.name,
      id: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Group" />,
      cell: ({ row }) => <span className="font-medium">{row.original.group.name}</span>,
    },
    {
      accessorFn: (row) => row.group.code,
      id: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => <Badge variant="outline" className="font-mono font-normal">{row.original.group.code}</Badge>,
    },
    {
      accessorFn: (row) => [
        row.leaderName,
        ...row.coLeaders.map((coLeader) => coLeader.displayName),
      ].filter(Boolean).join(", "),
      id: "leadership",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Leadership" />,
      cell: ({ row }) => <GroupLeadershipControls group={row.original} people={leaders} />,
    },
    {
      accessorKey: "activeMemberCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Members" />,
    },
    {
      accessorFn: (row) => row.group.isActive,
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => row.original.group.isActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Archived</Badge>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <div className="text-right"><EditGroupDialog group={row.original} /></div>,
    },
  ], [leaders]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
        <CardDescription>Assign a primary leader and co-leaders, then manage group status.</CardDescription>
      </CardHeader>
      <CardContent>
        {!groups ? <PanelLoading /> : <DataTable columns={columns} data={groups} emptyMessage="No groups yet." />}
      </CardContent>
    </Card>
  );
}

function EditGroupDialog({ group }: { group: GroupRow }) {
  const updateGroup = useMutation(api.admin.updateGroup);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.group.name);
  const [code, setCode] = useState(group.group.code);
  const [active, setActive] = useState(group.group.isActive ? "active" : "archived");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await updateGroup({ groupId: group.group._id, name, code, isActive: active === "active" });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update group");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm">Edit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
          <DialogDescription>Archive groups to preserve their history.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Name</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="grid gap-2"><Label>Code</Label><Input value={code} maxLength={6} minLength={6} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} /></div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={active} onValueChange={setActive}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestsPanel({ requests }: { requests: RequestRows | undefined }) {
  const columns = useMemo<ColumnDef<RequestRow>[]>(() => [
    {
      accessorFn: (row) => profileDisplayName(row.profile, "Unnamed member"),
      id: "member",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Member" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue("member")}</span>,
    },
    {
      accessorFn: (row) => row.group?.name ?? "Unknown group",
      id: "group",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Group" />,
    },
    {
      accessorFn: (row) => row.request.requestedAt,
      id: "requested",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Requested" />,
      cell: ({ row }) => formatDate(row.original.request.requestedAt),
    },
    {
      id: "status",
      header: "Status",
      cell: () => <Badge variant="secondary">Pending</Badge>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <RequestActions row={row.original} />,
    },
  ], []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join requests</CardTitle>
        <CardDescription>Approve or reject pending group requests.</CardDescription>
      </CardHeader>
      <CardContent>
        {!requests ? <PanelLoading /> : <DataTable columns={columns} data={requests} emptyMessage="No pending requests." />}
      </CardContent>
    </Card>
  );
}

function RequestActions({ row }: { row: RequestRow }) {
  const approveJoinRequest = useMutation(api.admin.approveJoinRequest);
  const rejectJoinRequest = useMutation(api.admin.rejectJoinRequest);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const displayName = profileDisplayName(row.profile, "this member");

  async function approve() {
    setBusy("approve");
    try {
      await approveJoinRequest({ joinRequestId: row.request._id });
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy("reject");
    try {
      await rejectJoinRequest({ joinRequestId: row.request._id });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" disabled={busy !== null} onClick={() => void approve()}>{busy === "approve" ? "Approving…" : "Approve"}</Button>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button size="sm" variant="outline" disabled={busy !== null}>Reject</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject request?</AlertDialogTitle>
            <AlertDialogDescription>{displayName} can submit another group code after this request is rejected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void reject()}>
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
