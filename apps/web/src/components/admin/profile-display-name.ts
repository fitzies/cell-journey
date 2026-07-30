export type NameProfile = {
  displayName?: string | null;
  preferredName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
};

export function profileDisplayName(profile: NameProfile | null | undefined, fallback: string) {
  const structuredName = [profile?.firstName?.trim(), profile?.lastName?.trim()]
    .filter(Boolean)
    .join(" ");

  return profile?.displayName?.trim()
    || profile?.preferredName?.trim()
    || structuredName
    || profile?.fullName?.trim()
    || fallback;
}
