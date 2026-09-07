import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/lib/api';
export type MemberRow = FunctionReturnType<typeof api.groups.listMembers>[number];
export type MemberStatus = 'active' | 'inactive';
export type MemberFilter = MemberStatus | 'all';
export type MemberView = 'grid' | 'list';
export type MemberSort = 'saved' | 'name';

export type MembersOptions = {
  view: MemberView;
  status: MemberFilter;
  sort: MemberSort;
  disabled: boolean;
  onView: (view: MemberView) => void;
  onStatus: (status: MemberFilter) => void;
  onSort: (sort: MemberSort) => void;
};
