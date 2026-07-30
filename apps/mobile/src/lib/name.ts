export type ProfileName = {
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  fullName?: string | null;
};

function clean(value?: string | null) {
  return value?.trim() ?? '';
}

/** The person's complete name, preferring confirmed structured fields. */
export function getProfileFullName(profile?: ProfileName | null, fallback = '') {
  if (!profile) return fallback;
  const structuredName = [clean(profile.firstName), clean(profile.lastName)].filter(Boolean).join(' ');
  return structuredName || clean(profile.fullName) || fallback;
}

/** The name used in the UI. A preferred name remains the first choice. */
export function getProfileDisplayName(profile?: ProfileName | null, fallback = '') {
  if (!profile) return fallback;
  return clean(profile.preferredName) || getProfileFullName(profile, fallback);
}

export function getProfileGreetingName(profile?: ProfileName | null, fallback = 'there') {
  return getProfileDisplayName(profile).split(/\s+/)[0] || fallback;
}
