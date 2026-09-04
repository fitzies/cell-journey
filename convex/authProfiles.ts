type GoogleProfile = {
  sub: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
};

export function normalizeGoogleProfile(profile: GoogleProfile) {
  return {
    id: profile.sub,
    name: profile.name ?? undefined,
    email:
      typeof profile.email === "string"
        ? profile.email.trim().toLowerCase()
        : undefined,
    image: profile.picture ?? undefined,
  };
}
