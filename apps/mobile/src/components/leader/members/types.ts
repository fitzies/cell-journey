import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/lib/api';
export type MemberRow = FunctionReturnType<typeof api.groups.listMembers>[number];
export type MemberStatus = 'active' | 'inactive' | 'visitor';
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

export function memberStatus(row: MemberRow): MemberStatus {
  if (row.membership.status === 'inactive') return 'inactive';
  return row.membership.memberClass === 'visitor' ? 'visitor' : 'active';
}
