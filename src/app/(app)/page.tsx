"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";

// Dummy data
const DUMMY_SESSIONS = [
  { status: "present" as const, date: "Fri, 4 Apr 2025" },
  { status: "absent" as const, date: "Fri, 28 Mar 2025" },
  { status: "rest" as const, date: "Fri, 21 Mar 2025" },
];

const DUMMY_MEMBERS = [
  { name: "James L.", initials: "JL" },
  { name: "Sarah A.", initials: "SA" },
  { name: "Paul N.", initials: "PN" },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const sessionConfig = {
  present: {
    icon: CheckCircle2,
    label: "Present",
    className: "text-foreground",
  },
  absent: {
    icon: XCircle,
    label: "Absent",
    className: "text-muted-foreground",
  },
  rest: {
    icon: MinusCircle,
    label: "Rest week",
    className: "text-muted-foreground/60",
  },
};

export default function HomePage() {
  const membership = useQuery(api.memberships.getCurrentMembership);
  const currentUser = useQuery(api.users.getCurrentUser);

  return (
    <div className="px-5 pt-12 pb-8 space-y-8">
      {/* Greeting */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {getGreeting()}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {currentUser?.name ?? ""}
        </h1>
        {membership?.group ? (
          <Badge variant="outline" className="mt-3 rounded-full">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-foreground/40" />
            {membership.group.name}
          </Badge>
        ) : (
          <Badge variant="outline" className="mt-3 rounded-full">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-foreground/40" />
            Cornerstone Cell &middot; Group 7
          </Badge>
        )}
      </div>

      {/* Next Meeting */}
      <Card className="bg-primary text-primary-foreground border-0 shadow-none">
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/60">
              Next meeting
            </p>
            <Badge variant="secondary" className="rounded-full text-xs">
              In 5 days
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight leading-tight">
            Cell Group<br />Meeting
          </h2>
          <p className="text-sm text-primary-foreground/70">
            Fri, 18 Apr &nbsp;&middot;&nbsp; 8:00 PM &nbsp;&middot;&nbsp; Block 42 Lounge
          </p>
        </CardContent>
      </Card>

      {/* Attendance Rate */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Attendance rate
        </p>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-bold tracking-tight">75%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Last 12 sessions</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">9 / 12</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sessions attended</p>
          </div>
        </div>
        <Progress value={75} className="h-2" />
      </div>

      {/* Recent Sessions */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Recent sessions
        </p>
        <div className="space-y-3">
          {DUMMY_SESSIONS.map((session, i) => {
            const config = sessionConfig[session.status];
            const Icon = config.icon;
            return (
              <div key={i} className="flex items-center gap-3">
                <Icon className={`size-5 ${config.className}`} />
                <div>
                  <p className="text-sm font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">{session.date}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Your Group */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Your group
        </p>
        <div className="flex gap-3">
          {DUMMY_MEMBERS.map((member) => (
            <div key={member.initials} className="flex items-center gap-2 rounded-full border px-3 py-1.5">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs font-medium">
                  {member.initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{member.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
