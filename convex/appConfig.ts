import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, query } from "./_generated/server";
import { leaderEventsLayoutValidator } from "./validators";

export const mobile = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getAuthUserId(ctx))) throw new Error("Not authenticated");
    const config = await ctx.db.query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", "mobile")).unique();
    return { leaderEventsLayout: config?.leaderEventsLayout ?? "split" as const };
  },
});

// Developer-only control through the Convex dashboard/CLI. Mobile clients cannot
// call this mutation, and hiding a tab never changes backend permissions.
export const setLeaderEventsLayout = internalMutation({
  args: { layout: leaderEventsLayoutValidator },
  handler: async (ctx, { layout }) => {
    const config = await ctx.db.query("appConfig")
      .withIndex("by_key", (q) => q.eq("key", "mobile")).unique();
    const value = { leaderEventsLayout: layout, updatedAt: Date.now() };
    if (config) await ctx.db.patch(config._id, value);
    else await ctx.db.insert("appConfig", { key: "mobile", ...value });
    return layout;
  },
});
