import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LoadingState } from '@/components/onboarding/ui';
import { ActionButton, Card, LeaderScreen, Mark, RowCard, SectionHeader } from '@/components/leader/ui';
import { fonts, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';

const regionLabels: Record<string, string> = {
  north: 'North', south: 'South', east: 'East', west: 'West', central: 'Central', northeast: 'Northeast', northwest: 'Northwest', southeast: 'Southeast', southwest: 'Southwest',
};

function initials(name?: string) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return 'CJ';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export default function LeaderProfileScreen() {
  const t = useAppTheme();
  const { signOut } = useAuthActions();
  const profile = useQuery(api.profiles.current, {});
  const group = useQuery(api.groups.getMyGroup, {});
  const services = useQuery(api.groups.listServices, {});
  const [busy, setBusy] = useState(false);

  const serviceNames = useMemo(() => {
    if (!profile || !services) return [];
    return services.filter((service) => profile.serviceIds.includes(service._id)).map((service) => service.name);
  }, [profile, services]);

  if (profile === undefined || group === undefined || services === undefined) return <LoadingState />;

  const displayName = profile?.preferredName?.trim() || profile?.fullName?.trim() || 'Leader';
  const region = profile?.singaporeRegion ? regionLabels[profile.singaporeRegion] : 'Not set';

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      router.replace('/(auth)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LeaderScreen eyebrow="Profile" title="Leader profile." hint="Your assignment and visible profile details.">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent }}>
            <Text style={{ color: t.accentInk, fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.6 }}>{initials(displayName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontFamily: fonts.bodyBold, fontSize: 21, letterSpacing: -0.45 }}>{displayName}</Text>
            <Text style={{ color: t.muted, marginTop: 5, fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase' }}>Leader</Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="Assignment" />
      <RowCard mark={<Mark>⌁</Mark>} title={group?.name ?? 'No assigned group'} detail={group ? 'You lead this group' : 'Ask the app owner to assign your group in Convex.'} />

      <SectionHeader title="Profile info" />
      <View style={{ gap: 10 }}>
        <RowCard mark={<Mark>✦</Mark>} title="Services" detail={serviceNames.length ? serviceNames.join(', ') : 'Not set'} />
        <RowCard mark={<Mark>◇</Mark>} title="Region" detail={region} />
        <RowCard mark={<Mark>○</Mark>} title="Full name" detail={profile?.fullName ?? 'Not set'} />
      </View>

      <View style={{ marginTop: 30 }}>
        <ActionButton label={busy ? 'Signing out…' : 'Sign out'} disabled={busy} onPress={handleSignOut} />
      </View>
    </LeaderScreen>
  );
}
