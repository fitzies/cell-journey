import { useMutation, useQuery } from 'convex/react';
import { Redirect, router } from 'expo-router';
import { Alert, View } from 'react-native';
import { LoadingState, Note, OnboardingShell, PrimaryButton } from '@/components/onboarding/ui';
import { api, type Id } from '@/lib/api';

export default function PendingScreen() {
  const context = useQuery(api.profiles.currentContext, {});
  const cancel = useMutation(api.groups.cancelJoinRequest);
  if (context === undefined) return <LoadingState />;

  if (context.pendingRequests.length === 0) {
    if (context.memberGroups.length > 0) return <Redirect href="/(member-tabs)/home" />;
    if (context.ledGroups.length > 0) return <Redirect href="/(leader-tabs)/home" />;
    return <Redirect href="/(onboarding)/group-code" />;
  }

  const cancelRequest = (joinRequestId: Id<'joinRequests'>, name: string) => {
    Alert.alert('Cancel request?', `Cancel your request to join ${name}?`, [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => void cancel({ joinRequestId }) },
    ]);
  };

  const hasMembership = context.memberGroups.length > 0;
  return (
    <OnboardingShell
      pending
      animationKey="pending"
      title="Waiting for leader approval."
      hint={hasMembership ? 'You can keep using your existing groups while these are reviewed.' : 'A leader will review each request.'}
      footer={
        <View style={{ gap: 10 }}>
          <PrimaryButton ghost label="Join another group" onPress={() => router.push('/(onboarding)/group-code')} />
          {hasMembership ? <PrimaryButton label="Back to app" onPress={() => router.replace('/(member-tabs)/home')} /> : null}
        </View>
      }
    >
      <View style={{ marginTop: 4, gap: 10 }}>
        {context.pendingRequests.map(({ request, group }) => (
          <View key={request._id}>
            <Note badge="TE" title={group.name} body="Leader notified" />
            <PrimaryButton ghost label="Cancel this request" onPress={() => cancelRequest(request._id, group.name)} />
          </View>
        ))}
      </View>
    </OnboardingShell>
  );
}
