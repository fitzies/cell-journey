"use client";

import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ChevronRight,
  Bell,
  Moon,
  Shield,
  HelpCircle,
  LogOut,
  Mail,
  Church,
  Users,
} from "lucide-react";

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
    <div className="px-5 pt-12 pb-8 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Cell Journey
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Profile</h1>
      </div>

      {/* User card */}
      <Card className="shadow-none border">
        <CardContent className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarImage src={user.image} alt={user.name ?? ""} />
            <AvatarFallback className="text-base font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold truncate">
              {user.name ?? "—"}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {user.email}
            </p>
            <Badge variant="outline" className="mt-1.5 rounded-full capitalize">
              {user.role}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Group info */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          My group
        </p>
        <Card className="shadow-none border">
          <CardContent className="space-y-3">
            <SettingsRow
              icon={Users}
              label="Group"
              value={membership?.group?.name ?? "—"}
            />
            <SettingsRow
              icon={Church}
              label="Service attending"
              value={user.serviceAttending ?? "Not set"}
            />
            <SettingsRow
              icon={Mail}
              label="Email"
              value={user.email ?? "—"}
            />
          </CardContent>
        </Card>
      </div>

      {/* Preferences */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Preferences
        </p>
        <Card className="shadow-none border">
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Notifications</span>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Moon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Dark mode</span>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Support */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Support
        </p>
        <Card className="shadow-none border">
          <CardContent className="space-y-1">
            <LinkRow icon={Shield} label="Privacy policy" />
            <LinkRow icon={HelpCircle} label="Help & feedback" />
          </CardContent>
        </Card>
      </div>

      {/* Sign out */}
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => signOut()}
      >
        <LogOut className="size-4" />
        Sign out
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Cell Journey v1.0.0
      </p>
    </div>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-medium capitalize">{value}</span>
    </div>
  );
}

function LinkRow({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button className="flex w-full items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}
