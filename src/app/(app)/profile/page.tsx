"use client";

import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function ProfilePage() {
  const user = useQuery(api.users.getCurrentUser);
  const membership = useQuery(api.memberships.getCurrentMembership);
  const { signOut } = useAuthActions();

  if (!user) return null;

  const initials = (user.name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="px-5 pt-12">
      <h1 className="text-xl font-semibold tracking-tight">Profile</h1>

      <div className="mt-6 flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarImage src={user.image} alt={user.name ?? ""} />
          <AvatarFallback className="text-sm font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-medium">{user.name ?? "—"}</span>
          <span className="text-sm text-muted-foreground">{user.email}</span>
        </div>
      </div>

      <Separator className="my-6" />

      <div className="flex flex-col gap-4">
        <Row label="Role" value={user.role} />
        <Row
          label="Group"
          value={membership?.group?.name ?? "—"}
        />
        <Row
          label="Service Attending"
          value={user.serviceAttending ?? "Not set"}
        />
      </div>

      <Separator className="my-6" />

      <Button
        variant="outline"
        className="w-full"
        onClick={() => signOut()}
      >
        Sign Out
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium capitalize">{value}</span>
    </div>
  );
}
