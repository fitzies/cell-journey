"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function HomePage() {
  const membership = useQuery(api.memberships.getCurrentMembership);

  return (
    <div className="px-5 pt-12">
      <h1 className="text-xl font-semibold tracking-tight">Home</h1>
      {membership?.group && (
        <p className="mt-1 text-sm text-muted-foreground">
          {membership.group.name}
        </p>
      )}
      <div className="mt-8 flex flex-col items-center justify-center text-center text-sm text-muted-foreground py-20">
        <p>Upcoming meetings and attendance will appear here.</p>
      </div>
    </div>
  );
}
