import { useConvexAuth, useQuery } from 'convex/react';
import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { DynamicColorIOS } from 'react-native';
import { useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { api } from '@/lib/api';

const nativeTint = DynamicColorIOS({ light: '#92400e', dark: '#c2956a' });

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
    <NativeTabs tintColor={nativeTint}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule">
        <NativeTabs.Trigger.Icon sf="calendar" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="attendance">
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.rectangle', selected: 'checkmark.rectangle.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
