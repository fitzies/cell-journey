import { getPostalDistrict } from '@cell-journey/domain';
import { useConvexAuth, useQuery } from 'convex/react';
import { Redirect, router, Stack, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { ActivityIndicator, Button, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '@/components/leader/ui';
import { ProfileEmailRow, ProfileGroupSummary, ProfileIdentity, ProfileRow } from '@/components/profile/profile-content';
import { textStyles, useAppTheme } from '@/constants/tokens';
import { api } from '@/lib/api';
import { getProfileDisplayName, getProfileFullName } from '@/lib/name';
import { getProfileLocationLabel } from '@/lib/profile-location';

function closeProfile() {
  if (router.canDismiss()) router.dismiss();
  else router.replace('/(leader-tabs)/members');
}

function ProfileHeader() {
  const t = useAppTheme();
  return <>
    <Stack.Screen options={{ title: '', ...(Platform.OS === 'web' ? {
      headerRight: () => <Button title="Close" color={t.ink} onPress={closeProfile} />,
    } : {}) }} />
    {Platform.OS !== 'web' ? <Stack.Toolbar placement="right" tintColor={t.ink}>
      <Stack.Toolbar.Button accessibilityLabel="Close member profile" icon={Platform.OS === 'ios' ? 'xmark' : require('@/assets/images/toolbar/close.png')} iconRenderingMode="template" separateBackground onPress={closeProfile} />
    </Stack.Toolbar> : null}
  </>;
}

export default function MemberProfileScreen() {
  const params = useLocalSearchParams<{ groupId?: string | string[]; membershipId?: string | string[] }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const groupId = typeof params.groupId === 'string' ? params.groupId : '';
  const membershipId = typeof params.membershipId === 'string' ? params.membershipId : '';
  // Keep the requested group and membership fixed even if the selected group changes.
  const member = useQuery(api.groups.getMemberProfile, isAuthenticated && groupId && membershipId
    ? { groupId, membershipId } : 'skip');

  if (!isLoading && !isAuthenticated) return <Redirect href="/" />;
  const district = getPostalDistrict(member?.profile.postalDistrict);

  return <>
    <ProfileHeader />
    {isLoading || (groupId && membershipId && member === undefined) ? <View style={styles.loading}>
      <ActivityIndicator color={t.muted} accessibilityLabel="Loading member profile" />
      <Text style={[textStyles.body, { color: t.muted }]}>Loading profile…</Text>
    </View> : !member ? <View style={styles.message}>
      <Text style={[textStyles.title, { color: t.text }]}>Profile unavailable</Text>
      <Text style={[textStyles.body, { color: t.muted }]}>This member may have left the group, or your access may have changed.</Text>
    </View> : <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
      <ProfileIdentity displayName={getProfileDisplayName(member.profile, 'Member')} photoUrl={member.profile.photoUrl}
        subtitle={`${member.groupName} · ${member.status === 'visitor' ? 'Visitor' : member.status === 'active' ? 'Active' : 'Inactive'}`} />
      <View style={[styles.details, { borderTopColor: t.track }]}>
        <ProfileRow icon={{ ios: 'person', android: 'person_outline', web: 'person_outline' }} title="Full name" detail={getProfileFullName(member.profile, 'Not set')} />
        <ProfileEmailRow email={member.email} />
        <ProfileRow icon={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }} title="Services" detail={member.serviceNames.join(', ') || 'Not set'} />
        <ProfileRow icon={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} title="Postal district"
          detail={district ? `District ${district.number} · ${district.area}` : getProfileLocationLabel(member.profile)} divider={false} />
      </View>
      <ProfileGroupSummary groupName={member.groupName} summary={member.groupSummary} />
    </ScrollView>}
  </>;
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const t = useAppTheme();
  return <>
    <ProfileHeader />
    <View style={styles.message}>
      <Text style={[textStyles.title, { color: t.text }]}>Couldn’t load profile</Text>
      <Text style={[textStyles.body, { color: t.muted }]}>Check your connection and group access, then try again.</Text>
      <ActionButton label="Try again" onPress={() => void retry()} />
    </View>
  </>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12 },
  details: { borderTopWidth: StyleSheet.hairlineWidth },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  message: { padding: 24, gap: 16 },
});
