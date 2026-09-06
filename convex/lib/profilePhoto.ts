import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Call only after the enclosing query has authorized access to this profile.
export async function withProfilePhoto(ctx: QueryCtx, profile: Doc<"userProfiles"> | null) {
  return profile ? {
    ...profile,
    photoUrl: profile.avatarStorageId ? await ctx.storage.getUrl(profile.avatarStorageId) : null,
  } : null;
}
