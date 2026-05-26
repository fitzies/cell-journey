"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CheckCircle2, CircleAlert, LogOut, Plus, Search, Shield, UserRoundCog, UsersRound } from "lucide-react";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type Id } from "@/lib/api";
import { cn } from "@/lib/utils";

type UserRow = FunctionReturnType<typeof api.admin.listUsers>[number];
type GroupRow = FunctionReturnType<typeof api.admin.listGroups>[number];
type RequestRows = FunctionReturnType<typeof api.admin.listPendingJoinRequests>;

function initialCode(name: string) {
  return name.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
}

function roleBadge(role: "member" | "leader") {
  return role === "leader" ? <Badge>Leader</Badge> : <Badge variant="secondary">Member</Badge>;
}

export default function AdminPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.admin.me, isAuthenticated ? {} : "skip");

  if (isLoading || (isAuthenticated && me === undefined)) return <LoadingScreen />;
  if (!isAuthenticated) return <SignInScreen />;
  if (!me?.isAdmin) return <NoAccess reason={me?.reason ?? "notAllowed"} email={me?.email ?? null} />;

  return <AdminDashboard adminName={me.name || me.email || "Admin"} />;
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm bg-card/80">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <div className="h-3 w-3 animate-pulse rounded-full bg-primary" /> Loading admin…
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
    await signIn("google", { redirectTo: window.location.href });
  }

  return (
    <main className="grid min-h-screen place-items-center px-6 py-10">
      <Card className="w-full max-w-xl overflow-hidden border-primary/10 bg-card">
        <CardHeader className="p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">Cell Journey Admin</p>
          <CardTitle className="mt-3 font-serif text-4xl tracking-[-0.045em]">Quiet tools for group setup.</CardTitle>
          <CardDescription className="max-w-md pt-2 text-base leading-7">
            Sign in to create groups, assign leaders, and keep member placements tidy.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <Button className="h-12 w-full" onClick={handleSignIn} disabled={busy}>
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
    ? "Set ADMIN_EMAILS in your Convex environment variables first."
    : "This Google account is not in the admin allowlist.";

  return (
    <main className="grid min-h-screen place-items-center px-6 py-10">
      <Card className="w-full max-w-xl">
        <CardHeader className="p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive text-destructive-foreground">
            <CircleAlert className="h-5 w-5" />
          </div>
          <CardTitle className="font-serif text-3xl tracking-[-0.04em]">Admin access blocked.</CardTitle>
          <CardDescription className="pt-2 text-base leading-7">{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-8 pb-8">
          {email ? <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Signed in as {email}</p> : null}
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function AdminDashboard({ adminName }: { adminName: string }) {
  const { signOut } = useAuthActions();
  const [search, setSearch] = useState("");
  const users = useQuery(api.admin.listUsers, { search, limit: 200 });
  const groups = useQuery(api.admin.listGroups, { limit: 200 });
  const requests = useQuery(api.admin.listPendingJoinRequests, { limit: 50 });

  const memberCount = users?.filter((row) => row.profile.role === "member").length ?? 0;
  const leaderCount = users?.filter((row) => row.profile.role === "leader").length ?? 0;
  const activeGroups = groups?.filter((row) => row.group.isActive).length ?? 0;

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 rounded-[2rem] bg-primary p-6 text-primary-foreground sm:flex-row sm:items-end lg:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] opacity-75">Admin dashboard</p>
            <h1 className="mt-3 max-w-2xl font-serif text-4xl leading-none tracking-[-0.055em] sm:text-5xl">Set up groups without the noise.</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 opacity-80">Create groups, promote leaders, and move members while preserving history.</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">{adminName}</Badge>
            <Button variant="secondary" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Groups" value={activeGroups} detail="active groups" icon={<UsersRound className="h-4 w-4" />} />
          <MetricCard label="Leaders" value={leaderCount} detail="assigned leaders" icon={<UserRoundCog className="h-4 w-4" />} />
          <MetricCard label="Pending" value={requests?.length ?? 0} detail="join requests" icon={<CheckCircle2 className="h-4 w-4" />} />
        </section>

        <Tabs defaultValue="groups" className="w-full">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <TabsList>
              <TabsTrigger value="groups">Groups</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="requests">Join requests</TabsTrigger>
            </TabsList>
            <CreateGroupDialog />
          </div>

          <TabsContent value="groups">
            <GroupsPanel groups={groups} users={users} />
          </TabsContent>
          <TabsContent value="users">
            <UsersPanel search={search} setSearch={setSearch} users={users} groups={groups} />
          </TabsContent>
          <TabsContent value="requests">
            <RequestsPanel requests={requests} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function MetricCard({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: ReactNode }) {
  return (
    <Card className="bg-card/85">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-serif text-4xl tracking-[-0.05em]">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary">{icon}</div>
      </CardContent>
    </Card>
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
        <Button><Plus className="h-4 w-4" /> Create group</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>Groups get a join code that members enter during onboarding.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input id="group-name" value={name} onChange={(event) => { setName(event.target.value); if (!code) setCode(initialCode(event.target.value)); }} placeholder="Bukit Timah Cell" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-code">Group code</Label>
            <Input id="group-code" value={code} maxLength={6} minLength={6} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="BTIMH" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create group"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupsPanel({ groups, users }: { groups: GroupRow[] | undefined; users: UserRow[] | undefined }) {
  const leaders = useMemo(() => users?.filter((row) => row.profile.role === "leader" || !row.profile.currentGroupId) ?? [], [users]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl tracking-[-0.04em]">Groups</CardTitle>
        <CardDescription>Create groups and assign exactly one leader per group.</CardDescription>
      </CardHeader>
      <CardContent>
        {!groups ? <EmptyLine text="Loading groups…" /> : groups.length === 0 ? <EmptyLine text="No groups yet. Create the first one." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Leader</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((row) => (
                <TableRow key={row.group._id}>
                  <TableCell className="font-semibold">{row.group.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{row.group.code}</Badge></TableCell>
                  <TableCell className="min-w-56"><LeaderSelect group={row} leaders={leaders} /></TableCell>
                  <TableCell>{row.activeMemberCount}</TableCell>
                  <TableCell>{row.group.isActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Archived</Badge>}</TableCell>
                  <TableCell className="text-right"><EditGroupDialog group={row} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LeaderSelect({ group, leaders }: { group: GroupRow; leaders: UserRow[] }) {
  const setLeader = useMutation(api.admin.setGroupLeader);
  const [value, setValue] = useState(group.group.leaderProfileId ?? "none");
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    setValue(next);
    startTransition(async () => {
      await setLeader({ groupId: group.group._id, profileId: next === "none" ? null : next as Id<"userProfiles"> });
    });
  }

  return (
    <Select value={value} onValueChange={change} disabled={pending}>
      <SelectTrigger className="max-w-64">
        <SelectValue placeholder="Assign leader" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No leader</SelectItem>
        {leaders.map((row) => <SelectItem key={row.profile._id} value={row.profile._id}>{row.displayName}</SelectItem>)}
      </SelectContent>
    </Select>
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
      <DialogTrigger asChild><Button variant="outline" size="sm">Edit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
          <DialogDescription>Archive instead of deleting so history stays intact.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Name</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="grid gap-2"><Label>Code</Label><Input value={code} maxLength={6} minLength={6} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} /></div>
          <div className="grid gap-2"><Label>Status</Label><Select value={active} onValueChange={setActive}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersPanel({ search, setSearch, users, groups }: { search: string; setSearch: (value: string) => void; users: UserRow[] | undefined; groups: GroupRow[] | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl tracking-[-0.04em]">Users</CardTitle>
        <CardDescription>Promote members to leaders or place members into groups.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, role, group…" />
        </div>
        {!users ? <EmptyLine text="Loading users…" /> : users.length === 0 ? <EmptyLine text="No users found." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Member group</TableHead>
                <TableHead>Leader group</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((row) => <UserTableRow key={row.profile._id} row={row} groups={groups ?? []} />)}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function UserTableRow({ row, groups }: { row: UserRow; groups: GroupRow[] }) {
  const activeGroups = groups.filter((item) => item.group.isActive);
  const assignMember = useMutation(api.admin.assignMemberToGroup);
  const removeMember = useMutation(api.admin.removeMemberFromGroup);
  const demoteLeader = useMutation(api.admin.demoteLeader);
  const setLeader = useMutation(api.admin.setGroupLeader);
  const [groupValue, setGroupValue] = useState(row.profile.currentGroupId ?? "none");
  const [leaderGroupValue, setLeaderGroupValue] = useState(row.profile.leaderGroupId ?? "none");
  const [pending, startTransition] = useTransition();

  function changeMemberGroup(next: string) {
    setGroupValue(next);
    startTransition(async () => {
      if (next === "none") await removeMember({ profileId: row.profile._id });
      else await assignMember({ profileId: row.profile._id, groupId: next as Id<"groups"> });
    });
  }

  function promoteTo(next: string) {
    setLeaderGroupValue(next);
    startTransition(async () => {
      if (next !== "none") await setLeader({ groupId: next as Id<"groups">, profileId: row.profile._id });
    });
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-semibold">{row.displayName}</div>
        <div className="text-sm text-muted-foreground">{row.user.email ?? "No email"}</div>
      </TableCell>
      <TableCell>{roleBadge(row.profile.role)}</TableCell>
      <TableCell>{row.currentGroupName ?? <span className="text-muted-foreground">None</span>}</TableCell>
      <TableCell>{row.leaderGroupName ?? <span className="text-muted-foreground">None</span>}</TableCell>
      <TableCell>
        <div className="flex flex-col items-end gap-2">
          {row.profile.role === "leader" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={pending}>Demote to member</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Demote leader?</AlertDialogTitle><AlertDialogDescription>{row.displayName} will lose leader access and their group will have no leader until reassigned.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => startTransition(async () => { await demoteLeader({ profileId: row.profile._id }); })}>Demote</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Select value={groupValue} onValueChange={changeMemberGroup} disabled={pending}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Member group" /></SelectTrigger>
                <SelectContent><SelectItem value="none">No member group</SelectItem>{activeGroups.map((group) => <SelectItem key={group.group._id} value={group.group._id}>{group.group.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={leaderGroupValue} onValueChange={promoteTo} disabled={pending}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Promote to leader" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Promote to…</SelectItem>{activeGroups.map((group) => <SelectItem key={group.group._id} value={group.group._id}>{group.group.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function RequestsPanel({ requests }: { requests: RequestRows | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl tracking-[-0.04em]">Join requests</CardTitle>
        <CardDescription>Quick visibility only. Leaders can still approve from mobile.</CardDescription>
      </CardHeader>
      <CardContent>
        {!requests ? <EmptyLine text="Loading requests…" /> : requests.length === 0 ? <EmptyLine text="No pending join requests." /> : (
          <div className="space-y-3">
            {requests.map((row) => (
              <div key={row.request._id} className="rounded-3xl border bg-background p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{row.profile?.preferredName || row.profile?.fullName || "Unnamed member"}</p>
                    <p className="text-sm text-muted-foreground">Requested {row.group?.name ?? "Unknown group"}</p>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className={cn("rounded-3xl border bg-background p-6 text-sm text-muted-foreground")}>
      {text}
      <Separator className="mt-6 opacity-0" />
    </div>
  );
}
