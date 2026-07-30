import { afterEach, describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import {
  makeTest,
  resetBackendTestState,
  seedGroup,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

describe("bounded migration backfills", () => {
  test("membership activity backfill caps pages, supports dry-run, and remains auditable", async () => {
    const t = makeTest();
    const owner = await seedProfile(t, "Migration Owner");
    const groupId = await seedGroup(t, owner.profileId, "MIGRATE");
    await t.run(async (ctx) => {
      for (let index = 0; index < 55; index += 1) {
        await ctx.db.insert("memberships", {
          profileId: owner.profileId,
          groupId,
          status: "active",
          joinedAt: index + 1,
        });
      }
    });

    const dryRun = await t.mutation(
      internal.migrations.backfillMembershipActivityAndSortOrder,
      {
        paginationOpts: { numItems: 1_000, cursor: null },
        dryRun: true,
      },
    );
    expect(dryRun).toMatchObject({
      processed: 50,
      dryRun: true,
      pageSizeCap: 50,
      sortOrdersToPatch: 50,
      sortOrdersPatched: 0,
      periodsToInsert: 50,
      periodsInserted: 0,
      isComplete: false,
    });
    const afterDryRun = await t.run(async (ctx) => ({
      memberships: await ctx.db.query("memberships").take(100),
      periods: await ctx.db.query("membershipActivityPeriods").take(100),
    }));
    expect(afterDryRun.memberships.every((row) => row.sortOrder === undefined)).toBe(true);
    expect(afterDryRun.periods).toHaveLength(0);

    const first = await t.mutation(
      internal.migrations.backfillMembershipActivityAndSortOrder,
      { paginationOpts: { numItems: 1_000, cursor: null } },
    );
    expect(first).toMatchObject({
      processed: 50,
      sortOrdersPatched: 50,
      periodsInserted: 50,
      isComplete: false,
    });
    const second = await t.mutation(
      internal.migrations.backfillMembershipActivityAndSortOrder,
      {
        paginationOpts: { numItems: 1_000, cursor: first.continueCursor },
      },
    );
    expect(second).toMatchObject({
      processed: 5,
      sortOrdersPatched: 5,
      periodsInserted: 5,
      isComplete: true,
    });

    const idempotent = await t.mutation(
      internal.migrations.backfillMembershipActivityAndSortOrder,
      { paginationOpts: { numItems: 50, cursor: null } },
    );
    expect(idempotent).toMatchObject({
      sortOrdersToPatch: 0,
      sortOrdersPatched: 0,
      periodsToInsert: 0,
      periodsInserted: 0,
    });

    const firstAudit = await t.query(internal.migrations.auditMembershipActivityReadiness, {
      paginationOpts: { numItems: 1_000, cursor: null },
    });
    expect(firstAudit).toMatchObject({
      checkedMemberships: 50,
      isComplete: false,
      issues: [],
    });
    const finalAudit = await t.query(internal.migrations.auditMembershipActivityReadiness, {
      paginationOpts: { numItems: 1_000, cursor: firstAudit.continueCursor },
    });
    expect(finalAudit).toMatchObject({
      checkedMemberships: 5,
      isComplete: true,
      issues: [],
    });
  });
});
