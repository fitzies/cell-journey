import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type DbCtx = QueryCtx | MutationCtx;

export const MAX_GROUP_MEMBERSHIPS = 500;
export const MAX_GROUP_ACTIVITY_PERIODS = 4_000;

export function isInActivityPeriod(
  period: Doc<"membershipActivityPeriods">,
  at: number,
) {
  return period.startedAt <= at && (period.endedAt === undefined || at < period.endedAt);
}

export function isLegacyMembershipActiveAt(
  membership: Doc<"memberships">,
  at: number,
) {
  return membership.joinedAt <= at &&
    (membership.endedAt === undefined || at < membership.endedAt);
}

export function isMembershipActiveAtFromRows(
  membership: Doc<"memberships">,
  periods: Doc<"membershipActivityPeriods">[],
  at: number,
) {
  if (periods.length === 0) return isLegacyMembershipActiveAt(membership, at);
  return periods.some((period) => isInActivityPeriod(period, at));
}

export async function periodsForMembership(
  ctx: DbCtx,
  membershipId: Id<"memberships">,
) {
  const periods = await ctx.db
    .query("membershipActivityPeriods")
    .withIndex("by_membership_and_startedAt", (q) =>
      q.eq("membershipId", membershipId),
    )
    .take(201);
  if (periods.length > 200) {
    throw new Error("Membership has too many activity periods for this operation");
  }
  return periods;
}

export async function isMembershipActiveAt(
  ctx: DbCtx,
  membership: Doc<"memberships">,
  at: number,
) {
  return isMembershipActiveAtFromRows(
    membership,
    await periodsForMembership(ctx, membership._id),
    at,
  );
}

export async function loadGroupMembershipActivity(
  ctx: DbCtx,
  groupId: Id<"groups">,
) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .take(MAX_GROUP_MEMBERSHIPS + 1);
  if (memberships.length > MAX_GROUP_MEMBERSHIPS) {
    throw new Error("This group is too large for the attendance worklist");
  }

  const periods = await ctx.db
    .query("membershipActivityPeriods")
    .withIndex("by_group_and_startedAt", (q) => q.eq("groupId", groupId))
    .take(MAX_GROUP_ACTIVITY_PERIODS + 1);
  if (periods.length > MAX_GROUP_ACTIVITY_PERIODS) {
    throw new Error("This group's activity history is too large for the attendance worklist");
  }

  const periodsByMembership = new Map<
    Id<"memberships">,
    Doc<"membershipActivityPeriods">[]
  >();
  for (const period of periods) {
    const rows = periodsByMembership.get(period.membershipId) ?? [];
    rows.push(period);
    periodsByMembership.set(period.membershipId, rows);
  }

  return { memberships, periods, periodsByMembership };
}

export async function openActivityPeriod(
  ctx: MutationCtx,
  membership: Doc<"memberships">,
  startedAt: number,
) {
  const periods = await periodsForMembership(ctx, membership._id);
  const open = periods.find((period) => period.endedAt === undefined);
  if (open) throw new Error("Membership already has an open activity period");

  for (const period of periods) {
    // A newly opened interval has no end, so every existing interval must be
    // entirely before (or end exactly at) the new half-open boundary.
    if (
      period.startedAt >= startedAt ||
      period.endedAt === undefined ||
      period.endedAt > startedAt
    ) {
      throw new Error("Membership activity periods cannot overlap");
    }
  }

  const now = Date.now();
  return await ctx.db.insert("membershipActivityPeriods", {
    membershipId: membership._id,
    profileId: membership.profileId,
    groupId: membership.groupId,
    startedAt,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Closes the current activity interval. Legacy active rows are first widened
 * into a period beginning at joinedAt so the transition is atomic and no
 * event-time eligibility is lost during rollout.
 */
export async function closeActivityPeriod(
  ctx: MutationCtx,
  membership: Doc<"memberships">,
  endedAt: number,
) {
  const periods = await periodsForMembership(ctx, membership._id);
  let open = periods.find((period) => period.endedAt === undefined);

  if (!open && periods.length === 0) {
    const periodId = await ctx.db.insert("membershipActivityPeriods", {
      membershipId: membership._id,
      profileId: membership.profileId,
      groupId: membership.groupId,
      startedAt: membership.joinedAt,
      createdAt: endedAt,
      updatedAt: endedAt,
    });
    open = (await ctx.db.get(periodId)) ?? undefined;
  }

  if (!open) throw new Error("Membership has no open activity period");
  if (endedAt < open.startedAt) throw new Error("Activity period end is before its start");

  await ctx.db.patch(open._id, { endedAt, updatedAt: endedAt });
  return open._id;
}
