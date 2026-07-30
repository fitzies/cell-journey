import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ConnectedStatus = "active" | "inactive";

type DbCtx = QueryCtx | MutationCtx;

export function membershipRank(membership: Doc<"memberships">) {
  return membership.sortOrder ?? membership.joinedAt;
}

export function compareMemberships(
  left: Doc<"memberships">,
  right: Doc<"memberships">,
) {
  const statusDelta = statusRank(left.status) - statusRank(right.status);
  if (statusDelta !== 0) return statusDelta;
  const orderDelta = membershipRank(left) - membershipRank(right);
  if (orderDelta !== 0) return orderDelta;
  const joinedDelta = left.joinedAt - right.joinedAt;
  if (joinedDelta !== 0) return joinedDelta;
  return left._id.localeCompare(right._id);
}

function statusRank(status: Doc<"memberships">["status"]) {
  if (status === "active") return 0;
  if (status === "inactive") return 1;
  return 2;
}

export async function connectedMembershipsForGroup(
  ctx: DbCtx,
  groupId: Id<"groups">,
) {
  const active = await ctx.db
    .query("memberships")
    .withIndex("by_group_status", (q) =>
      q.eq("groupId", groupId).eq("status", "active"),
    )
    .take(501);
  const inactive = await ctx.db
    .query("memberships")
    .withIndex("by_group_status", (q) =>
      q.eq("groupId", groupId).eq("status", "inactive"),
    )
    .take(501);
  if (active.length + inactive.length > 500) {
    throw new Error("This group is too large for member ordering");
  }
  return [...active, ...inactive].sort(compareMemberships);
}

export async function nextSortOrder(
  ctx: DbCtx,
  groupId: Id<"groups">,
  status: ConnectedStatus,
) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_group_status", (q) =>
      q.eq("groupId", groupId).eq("status", status),
    )
    .take(501);
  if (memberships.length > 500) {
    throw new Error("This member section is too large for ordering");
  }
  if (memberships.length === 0) return 0;
  return Math.max(...memberships.map(membershipRank)) + 1;
}
