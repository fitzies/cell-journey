import { Redirect, type ErrorBoundaryProps } from 'expo-router';
import { View } from 'react-native';
import { useLeaderEventsLayout } from '@/components/leader-navigation-context';
import { useEventActions } from '@/components/events/event-actions';
import { EventSection } from '@/components/leader/events-feed';
import { ActionButton, EmptyState, LeaderScreen } from '@/components/leader/ui';
import { LeaderConnectionNotice, LeaderLoadError, LeaderLoadingState } from '@/components/leader/query-state';
import { LEADER_EVENT_PAGE_SIZE, useLeaderTabEvents } from '@/components/leader/use-tab-events';

export default function LeaderScheduleScreen() {
  const layout = useLeaderEventsLayout();
  return layout === 'combined' ? <Redirect href="/(leader-tabs)/attendance" /> : <PlannedEvents />;
}

function PlannedEvents() {
  const { context, group, results, status, loadMore } = useLeaderTabEvents('upcoming');
  const { eventActions, importModal } = useEventActions(group);
  if (context === undefined || (group && status === 'LoadingFirstPage')) {
    return <LeaderLoadingState title="Events" label="Loading events…" />;
  }
  return <LeaderScreen title="Events" eventActions={eventActions}>
    <LeaderConnectionNotice />
    {!group ? <EmptyState title="No group assigned." body="Once assigned, your gatherings will appear here." /> : <>
      <EventSection showHeading={false} title="Upcoming" rows={results.map((event) => ({ event, kind: 'upcoming' }))} limited={status !== 'Exhausted'} detailTab="schedule" />
      {!results.length && status === 'Exhausted' ? <EmptyState title="No upcoming gatherings." body="Use + to create an event or import your schedule." /> : null}
      {status === 'CanLoadMore' || status === 'LoadingMore' ? <View>
        <ActionButton label={status === 'LoadingMore' ? 'Loading…' : 'More events'} disabled={status === 'LoadingMore'} onPress={() => loadMore(LEADER_EVENT_PAGE_SIZE)} />
      </View> : null}
    </>}
    {importModal}
  </LeaderScreen>;
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <LeaderLoadError title="Events" body="Couldn't load events." retry={retry} />;
}
