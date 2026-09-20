"use client";

import { useQuery } from "convex/react";
import { Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { api, type Id } from "@/lib/api";

import { ProfileAvatar } from "./profile-avatar";
import { PanelLoading, SearchInput } from "./panel-ui";

function formatJoinedAt(timestamp: number) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(timestamp);
}

export function GroupMembersDialog({
  groupId,
  groupName,
  groupCode,
}: {
  groupId: Id<"groups">;
  groupName: string;
  groupCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const members = useQuery(api.admin.listGroupMembers, open ? { groupId } : "skip");

  const query = search.trim().toLowerCase();
  const filtered = (members ?? []).filter((member) =>
    !query
      ? true
      : [member.displayName, member.email].filter(Boolean).join(" ").toLowerCase().includes(query),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" aria-label={`View members of ${groupName}`}>
          <Users className="h-3.5 w-3.5" />
          View members
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Members</DialogTitle>
          <DialogDescription>{groupName} · {groupCode}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto py-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search members" />
          {members === undefined ? (
            <PanelLoading />
          ) : filtered.length ? (
            <ul className="divide-y rounded-md border">
              {filtered.map((member) => (
                <li key={member.membershipId} className="flex items-center gap-3 px-3 py-2.5">
                  <ProfileAvatar photoUrl={member.profile.photoUrl} name={member.displayName || "Unnamed member"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{member.displayName || "Unnamed member"}</p>
                      {member.memberClass === "visitor" ? (
                        <Badge variant="outline" className="shrink-0 text-[11px] text-muted-foreground">Visitor</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {member.email ?? "No email"} · Joined {formatJoinedAt(member.joinedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {search.trim() ? "No members match your search." : "No active members in this group."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
