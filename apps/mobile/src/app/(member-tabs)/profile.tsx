import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GroupSwitcher, ModeSwitchButton, useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { EditProfileSheet } from '@/components/profile/EditProfileSheet';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';
import { getProfileDisplayName } from '@/lib/name';

const regionLabels: Record<string, string> = {
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

function initials(name?: string) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return 'CJ';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export default function MemberProfileScreen() {
  const t = useAppTheme();
  const { signOut } = useAuthActions();
  const profile = useQuery(api.profiles.current, {});
  const { context, selectedMemberGroup } = useGroups();
  const group = selectedMemberGroup?.group ?? null;
  const services = useQuery(api.groups.listServices, {});
  const leaveGroup = useMutation(api.groups.leaveGroup);
  const [busy, setBusy] = useState<'leave' | 'signOut' | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const serviceNames = useMemo(() => {
    if (!profile || !services) return [];
    return services.filter((service) => profile.serviceIds.includes(service._id)).map((service) => service.name);
  }, [profile, services]);

  if (profile === undefined || context === undefined || services === undefined) return <LoadingState />;

  const displayName = getProfileDisplayName(profile, 'Member');
  const region = profile?.singaporeRegion ? regionLabels[profile.singaporeRegion] : 'Not set';

  const confirmLeave = () => {
    Alert.alert(
      'Leave this group?',
      context.memberGroups.length > 1 ? 'Your other groups stay active. Past attendance remains saved.' : 'Your past attendance stays saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave group',
          style: 'destructive',
          onPress: async () => {
            setBusy('leave');
            try {
              if (!group) return;
              await leaveGroup({ groupId: group._id });
              router.replace('/(onboarding)');
            } catch (err) {
              Alert.alert('Could not leave group', err instanceof Error ? err.message : 'Please try again.');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const handleSignOut = async () => {
    setBusy('signOut');
    try {
      await signOut();
      router.replace('/(auth)');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: t.accent }]}>PROFILE</Text>
          <Text style={[styles.title, { color: t.ink }]}>Your details.</Text>
          <Text style={[styles.hint, { color: t.muted }]}>Manage your member profile and current cell group.</Text>
        </View>

        <View style={[styles.identityCard, { backgroundColor: t.surface, borderColor: t.line }]}>
          <View style={[styles.avatar, { backgroundColor: t.accent }]}>
            <Text style={[styles.avatarText, { color: t.accentInk }]}>{initials(displayName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: t.ink }]}>{displayName}</Text>
            <Text style={[styles.role, { color: t.muted }]}>Member</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.ink }]}>Cell groups</Text>
          <GroupSwitcher mode="member" />
          <InfoCard title={group?.name ?? 'No active group'} detail={`${context.memberGroups.length} active membership${context.memberGroups.length === 1 ? '' : 's'}`} mark="⌁" />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.ink }]}>Profile info</Text>
          <View style={styles.infoList}>
            <InfoCard title="Services" detail={serviceNames.length ? serviceNames.join(', ') : 'Not set'} mark="✦" />
            <InfoCard title="Region" detail={region} mark="◇" />
            <InfoCard title="First name" detail={profile?.firstName?.trim() || 'Not confirmed'} mark="○" />
            <InfoCard title="Last name" detail={profile?.lastName?.trim() || 'Not confirmed'} mark="○" />
          </View>
        </View>

        <View style={styles.actions}>
          <ActionButton label="Edit profile details" filled disabled={!profile || busy !== null} onPress={() => setEditOpen(true)} />
          <ActionButton label="Join another group" disabled={busy !== null} onPress={() => router.push('/(onboarding)/group-code')} />
          {context.pendingRequests.length > 0 ? <ActionButton label={`Pending requests (${context.pendingRequests.length})`} disabled={busy !== null} onPress={() => router.push('/(onboarding)/pending')} /> : null}
          <ModeSwitchButton current="member" />
          <ActionButton label={busy === 'leave' ? 'Leaving…' : 'Leave selected group'} danger disabled={!group || busy !== null} onPress={confirmLeave} />
          <ActionButton label={busy === 'signOut' ? 'Signing out…' : 'Sign out'} disabled={busy !== null} onPress={handleSignOut} />
        </View>
      </ScrollView>
      <EditProfileSheet visible={editOpen} profile={profile} services={services} onClose={() => setEditOpen(false)} />
    </SafeAreaView>
  );
}

function InfoCard({ title, detail, mark }: { title: string; detail: string; mark: string }) {
  const t = useAppTheme();
  return (
    <View style={[styles.infoCard, { backgroundColor: t.surface, borderColor: t.line }]}>
      <View style={[styles.infoMark, { backgroundColor: t.soft }]}>
        <Text style={{ color: t.accent, fontFamily: fonts.bodyBold }}>{mark}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoTitle, { color: t.ink }]}>{title}</Text>
        <Text style={[styles.infoDetail, { color: t.muted }]}>{detail}</Text>
      </View>
    </View>
  );
}

function ActionButton({ label, onPress, danger, disabled, filled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean; filled?: boolean }) {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        { borderColor: filled ? t.accent : t.line, backgroundColor: filled ? t.accent : t.surface, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed && !disabled ? 0.985 : 1 }] },
      ]}
    >
      <Text style={[styles.actionText, { color: filled ? t.accentInk : danger ? t.danger : t.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 108 },
  header: { marginBottom: 24 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2.6 },
  title: { marginTop: 12, fontFamily: fonts.display, fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  hint: { marginTop: 10, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  identityCard: { borderWidth: 1, borderRadius: 28, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.6 },
  name: { fontFamily: fonts.bodyBold, fontSize: 21, letterSpacing: -0.45 },
  role: { marginTop: 5, fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase' },
  section: { marginTop: 28 },
  sectionTitle: { marginBottom: 12, fontFamily: fonts.bodyBold, fontSize: 18, letterSpacing: -0.3 },
  infoList: { gap: 10 },
  infoCard: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  infoMark: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.25 },
  infoDetail: { marginTop: 4, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
  actions: { marginTop: 30, gap: 10 },
  action: { minHeight: 54, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  actionText: { fontFamily: fonts.bodySemiBold, fontSize: 16, letterSpacing: -0.2 },
});
