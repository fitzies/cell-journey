import { formatPostalDistrict } from '@cell-journey/domain';
import type { Doc } from '@/lib/api';

const legacyRegionLabels: Record<string, string> = {
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
  central: 'Central',
  northeast: 'Northeast',
  northwest: 'Northwest',
  southeast: 'Southeast',
  southwest: 'Southwest',
};

export function getProfileLocationLabel(
  profile: Pick<Doc<'userProfiles'>, 'postalDistrict' | 'singaporeRegion'> | null | undefined,
  fallback = 'Not set',
) {
  if (!profile) return fallback;
  const postalDistrict = formatPostalDistrict(profile.postalDistrict);
  if (postalDistrict) return postalDistrict;
  if (profile.singaporeRegion) return legacyRegionLabels[profile.singaporeRegion] ?? fallback;
  return fallback;
}
