import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { GroupSwitcher, ModeSwitchButton, useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { EditProfileSheet } from '@/components/profile/EditProfileSheet';
import { ActionButton, Card, LeaderScreen, Mark, RowCard, SectionHeader } from '@/components/leader/ui';
import { fonts, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';
import { getProfileDisplayName } from '@/lib/name';

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
  const { context, selectedLeaderGroup: group } = useGroups();
  const services = useQuery(api.groups.listServices, {});
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const serviceNames = useMemo(() => {
    if (!profile || !services) return [];
    return services.filter((service) => profile.serviceIds.includes(service._id)).map((service) => service.name);
  }, [profile, services]);

  if (profile === undefined || context === undefined || services === undefined) return <LoadingState />;

  const displayName = getProfileDisplayName(profile, 'Leader');
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

      <View style={{ marginTop: 14 }}>
        <ActionButton filled label="Edit profile details" disabled={!profile || busy} onPress={() => setEditOpen(true)} />
      </View>

      <SectionHeader title="Leadership groups" />
      <GroupSwitcher mode="leader" />
      <RowCard mark={<Mark>⌁</Mark>} title={group?.name ?? 'No assigned group'} detail={group ? `You lead ${context.ledGroups.length} group${context.ledGroups.length === 1 ? '' : 's'}` : 'Ask the app owner to assign a group.'} />

      <SectionHeader title="Profile info" />
      <View style={{ gap: 10 }}>
        <RowCard mark={<Mark>✦</Mark>} title="Services" detail={serviceNames.length ? serviceNames.join(', ') : 'Not set'} />
        <RowCard mark={<Mark>◇</Mark>} title="Region" detail={region} />
        <RowCard mark={<Mark>○</Mark>} title="First name" detail={profile?.firstName?.trim() || 'Not confirmed'} />
        <RowCard mark={<Mark>○</Mark>} title="Last name" detail={profile?.lastName?.trim() || 'Not confirmed'} />
      </View>

      <View style={{ marginTop: 30, gap: 10 }}>
        <ModeSwitchButton current="leader" />
        <ActionButton label={busy ? 'Signing out…' : 'Sign out'} disabled={busy} onPress={handleSignOut} />
      </View>

      <EditProfileSheet visible={editOpen} profile={profile} services={services} onClose={() => setEditOpen(false)} />
    </LeaderScreen>
  );
}
