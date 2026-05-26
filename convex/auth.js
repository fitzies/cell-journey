import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

// Allow our Expo dev-client and Expo Go redirect schemes. Convex Auth rejects
// any redirectTo that isn't explicitly whitelisted here.
function isAllowedRedirect(redirectTo) {
  if (typeof redirectTo !== "string") return false;
  if (redirectTo.startsWith("cell-journey://")) return true; // dev client + standalone
  if (redirectTo.startsWith("exp://")) return true; // Expo Go
  if (redirectTo.startsWith("http://localhost")) return true; // web dev
  if (redirectTo.startsWith("https://localhost")) return true;

  const allowedWebOrigins = (process.env.WEB_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedWebOrigins.some((origin) => redirectTo.startsWith(origin))) return true;

  return false;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async redirect({ redirectTo }) {
      if (!isAllowedRedirect(redirectTo)) {
        throw new Error(`Invalid redirectTo URI: ${redirectTo}`);
      }
      return redirectTo;
    },
  },
});
