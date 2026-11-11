"use client";

import { createContext, useContext } from "react";

import type { Id } from "@/lib/api";

export type DashboardRole = {
  isAdmin: boolean;
  /** Regions a regional leader looks after. Empty for admins. */
  regions: Array<{ _id: Id<"regions">; name: string }>;
};

const DashboardRoleContext = createContext<DashboardRole>({ isAdmin: false, regions: [] });

export const DashboardRoleProvider = DashboardRoleContext.Provider;

export function useDashboardRole() {
  return useContext(DashboardRoleContext);
}
