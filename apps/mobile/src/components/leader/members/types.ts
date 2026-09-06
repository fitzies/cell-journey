import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/lib/api';
export type MemberRow = FunctionReturnType<typeof api.groups.listMembers>[number];
export type MemberStatus = 'active' | 'inactive';
