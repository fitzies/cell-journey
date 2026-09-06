import { useConvexConnectionState } from 'convex/react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { textStyles, useAppTheme } from '@/constants/tokens';
import { ActionButton, EmptyState, LeaderScreen } from './ui';

export function LeaderLoadingState({ title, label }: { title: string; label: string }) {
  const t = useAppTheme();
  const { isWebSocketConnected: online } = useConvexConnectionState();
  return <LeaderScreen title={title} contentStyle={styles.loadingContent}>
    <View accessibilityLiveRegion="polite" style={styles.loading}>
      <ActivityIndicator color={t.muted} accessibilityLabel={label} />
      <Text style={[textStyles.section, styles.loadingTitle, { color: t.ink }]}>{online ? label : 'Connecting…'}</Text>
    </View>
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
  loadingContent: { flexGrow: 1, justifyContent: 'center', paddingTop: 24, paddingBottom: 24 },
  loading: { gap: 14, alignItems: 'center' },
  loadingTitle: { textAlign: 'center' },
  notice: { marginVertical: 12, lineHeight: 22 },
  retry: { marginTop: 16 },
});
