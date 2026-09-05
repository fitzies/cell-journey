import { useConvexAuth, useQuery } from 'convex/react';
import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { DynamicColorIOS } from 'react-native';
import { useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

const nativeTint = DynamicColorIOS({ light: '#111111', dark: '#F5F5F3' });
const nativeMuted = DynamicColorIOS({ light: '#666663', dark: '#A3A3A0' });
const nativeLine = DynamicColorIOS({ light: '#D9D9D5', dark: '#30302E' });
const nativeIcons = {
  profile: require('../../../assets/images/solar-tabs/profile.png'),
  home: require('../../../assets/images/solar-tabs/home.png'),
  schedule: require('../../../assets/images/solar-tabs/schedule.png'),
  attendance: require('../../../assets/images/solar-tabs/attendance.png'),
} as const;

export default function MemberTabs() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.currentOrNull, isAuthenticated ? {} : 'skip');
  const { context } = useGroups();

  if (isLoading || (isAuthenticated && profile === undefined)) return <LoadingState />;
  if (!isAuthenticated) return <Redirect href="/(auth)" />;
  if (profile === null) return <Redirect href="/(onboarding)" />;
  if (context === undefined) return <LoadingState />;
  if (context.memberGroups.length === 0) return <Redirect href="/(onboarding)" />;

  return (
    <NativeTabs
      blurEffect="systemDefault"
      iconColor={{ default: nativeMuted, selected: nativeTint }}
      shadowColor={nativeLine}
      tintColor={nativeTint}
    >
      <NativeTabs.Trigger name="home" accessibilityLabel="Home">
        <NativeTabs.Trigger.Icon src={nativeIcons.home} renderingMode="template" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule" accessibilityLabel="Events">
        <NativeTabs.Trigger.Icon src={nativeIcons.schedule} renderingMode="template" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="attendance" accessibilityLabel="Attendance">
        <NativeTabs.Trigger.Icon src={nativeIcons.attendance} renderingMode="template" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" accessibilityLabel="Profile">
        <NativeTabs.Trigger.Icon src={nativeIcons.profile} renderingMode="template" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
