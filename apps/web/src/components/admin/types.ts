import type { FunctionReturnType } from "convex/server";

import { api } from "@/lib/api";

export type UserRow = FunctionReturnType<typeof api.admin.listUsers>[number];
export type GroupRow = FunctionReturnType<typeof api.admin.listGroups>[number];
export type RequestRows = FunctionReturnType<typeof api.admin.listPendingJoinRequests>;
export type RequestRow = RequestRows[number];
export type ServiceRow = FunctionReturnType<typeof api.admin.listServices>[number];
export type AttendanceRow = FunctionReturnType<typeof api.admin.listGroupAttendance>["page"][number];
export type DashboardMe = FunctionReturnType<typeof api.admin.me>;
export type RegionRow = FunctionReturnType<typeof api.regions.list>[number];
export type MemberAttendanceResult = FunctionReturnType<typeof api.admin.groupMemberAttendance>;
export type MemberAttendanceRow = MemberAttendanceResult["members"][number];
export type PersonAttendance = { present: number; expected: number };
