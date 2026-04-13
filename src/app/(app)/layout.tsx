"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, CalendarDays, User, ClipboardCheck, Users } from "lucide-react";
import { JoinGroupFlow } from "@/components/join-group-flow";
import { OnboardingFlow } from "@/components/onboarding-flow";

const memberTabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/profile", label: "Profile", icon: User },
];

const leaderTabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/members", label: "Members", icon: Users },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useQuery(api.users.getCurrentUser);
  const membership = useQuery(api.memberships.getCurrentMembership);

  // Loading state
  if (user === undefined || membership === undefined) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  // New user — show onboarding before anything else
  if (!user.serviceAttending) {
    return <OnboardingFlow userName={user.name ?? ""} />;
  }

  // No membership or not active — show join flow
  if (!membership || membership.status !== "active") {
    return <JoinGroupFlow membership={membership} />;
  }

  const tabs = user.role === "leader" || user.role === "admin" ? leaderTabs : memberTabs;

  return (
    <div className="flex flex-col min-h-svh">
      <main className="flex-1 pb-16">{children}</main>
      <TabBar tabs={tabs} />
    </div>
  );
}

function TabBar({
  tabs,
}: {
  tabs: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-14">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
