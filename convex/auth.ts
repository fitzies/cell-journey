import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      }
      return ctx.db.insert("users", {
        name: args.profile.name ?? undefined,
        email: args.profile.email ?? undefined,
        image: args.profile.image ?? undefined,
        role: "member",
      });
    },
  },
});
