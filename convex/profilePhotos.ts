import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
import { requireCurrentProfile } from "./profiles";
import type { Id } from "./_generated/dataModel";

const MAX_PHOTO_BYTES = 512 * 1024;

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db.query("userProfiles").withIndex("by_userId", q => q.eq("userId", userId)).unique();
    return profile?.avatarStorageId ? await ctx.storage.getUrl(profile.avatarStorageId) : null;
  },
});

export const attach = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, { userId, storageId }) => {
    const profile = await requireCurrentProfile(ctx);
    if (profile.userId !== userId || !(await ctx.db.get(userId))) throw new Error("Account is no longer available");
    const oldPhoto = profile.avatarStorageId;
    await ctx.db.patch(profile._id, { avatarStorageId: storageId, updatedAt: Date.now() });
    if (oldPhoto && oldPhoto !== storageId) await ctx.storage.delete(oldPhoto);
  },
});

// An authenticated action owns the upload and attachment together. Clients cannot
// attach someone else's storage ID, and failed/deleted-account uploads are removed.
export const upload = action({
  args: { bytes: v.bytes() },
  handler: async (ctx, { bytes }): Promise<Id<"_storage">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const data = new Uint8Array(bytes);
    if (data.length > MAX_PHOTO_BYTES) throw new Error("The profile photo must be smaller than 512 KB");
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
      throw new Error("Choose a valid JPEG photo");
    }
    const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/jpeg" }));
    try {
      await ctx.runMutation(internal.profilePhotos.attach, { userId, storageId });
      return storageId;
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
  },
});
