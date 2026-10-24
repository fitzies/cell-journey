import { useConvexConnectionState } from 'convex/react';
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { AppHeaderProps } from '@/components/app-header';
import { textStyles, useAppTheme } from '@/constants/tokens';
import { ActionButton, EmptyState, LeaderScreen } from './ui';

// Keeps the real header in place and shows a skeleton of the screen while data loads.
export function LeaderLoadingState({ title, eventActions, contentStyle, children }: PropsWithChildren<{
  title: string;
  eventActions?: AppHeaderProps['eventActions'];
  contentStyle?: StyleProp<ViewStyle>;
}>) {
  return <LeaderScreen title={title} eventActions={eventActions} contentStyle={contentStyle}>
    <LeaderConnectionNotice />
    {children}
  </LeaderScreen>;
}

export function LeaderConnectionNotice() {
  const t = useAppTheme();
  const { isWebSocketConnected: online } = useConvexConnectionState();
  if (online) return null;
  return <Text accessibilityLiveRegion="polite" style={[textStyles.body, styles.notice, { color: t.muted }]}>
    Connection lost. Reconnect to get updates and make changes.
  </Text>;
}

export function LeaderLoadError({ title, body, retry }: { title: string; body: string; retry: () => Promise<void> }) {
  return <LeaderScreen title={title}>
    <EmptyState title={body} body="Check your connection and try again." />
    <View style={styles.retry}><ActionButton label="Try again" onPress={() => void retry()} /></View>
  </LeaderScreen>;
}

const styles = StyleSheet.create({
  notice: { marginVertical: 12, lineHeight: 22 },
  retry: { marginTop: 16 },
});
