import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { LoadingState } from '@/components/onboarding/ui';
import { ActionButton, EmptyState, LeaderScreen, RowCard, SectionHeader } from '@/components/leader/ui';
import { fonts, useAppTheme } from '@/constants/tokens';
import { formatDateParts, formatDay, formatTimeRange, nextFridayEvening, startOfToday } from '@/lib/date';
import { api, type Doc } from '@/lib/api';

export default function LeaderScheduleScreen() {
  const [from] = useState(() => startOfToday());
  const profile = useQuery(api.profiles.current, {});
  const hasGroup = Boolean(profile?.leaderGroupId);
  const events = useQuery(api.events.listMine, { from, limit: 30 });
  const create = useMutation(api.events.create);
  const cancel = useMutation(api.events.cancel);
  const [busy, setBusy] = useState(false);

  if (profile === undefined || events === undefined) return <LoadingState />;

  if (!hasGroup) {
    return (
      <LeaderScreen eyebrow="Schedule" title="Plan gatherings." hint="Your leader account is not assigned yet.">
        <EmptyState title="No group assigned." body="Once assigned, you’ll be able to create events for your group." />
      </LeaderScreen>
    );
  }

  const createSample = async () => {
    const startAt = nextFridayEvening();
    setBusy(true);
    try {
      await create({ title: 'Cell Gathering', location: 'TBC', startAt, endAt: startAt + 2 * 60 * 60 * 1000 });
    } catch (err) {
      Alert.alert('Could not create event', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LeaderScreen eyebrow="Schedule" title="Plan gatherings." hint="Simple event management for your group schedule.">
      <ActionButton filled label={busy ? 'Creating…' : 'Create sample event'} disabled={busy} onPress={createSample} />

      <SectionHeader title="Upcoming events" meta={`${events.length} total`} />
      {events.length ? (
        <View style={{ gap: 10 }}>
          {events.map((event) => <EventRow key={event._id} event={event} onCancel={() => {
            Alert.alert('Cancel event?', 'Members will no longer see this gathering.', [
              { text: 'Keep event', style: 'cancel' },
              { text: 'Cancel event', style: 'destructive', onPress: () => cancel({ eventId: event._id }).catch((err) => Alert.alert('Could not cancel', err instanceof Error ? err.message : 'Please try again.')) },
            ]);
          }} />)}
        </View>
      ) : (
        <EmptyState title="No events yet." body="Create a sample event to populate the member schedule and home screens." />
      )}
    </LeaderScreen>
  );
}

function EventRow({ event, onCancel }: { event: Doc<'events'>; onCancel: () => void }) {
  const t = useAppTheme();
  const date = formatDateParts(event.startAt);
  return (
    <RowCard
      mark={<View style={{ width: 48, borderRadius: 16, paddingVertical: 9, alignItems: 'center', backgroundColor: t.soft }}><Text style={{ color: t.ink, fontFamily: fonts.bodyBold, fontSize: 18 }}>{date.day}</Text><Text style={{ color: t.muted, marginTop: 3, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.1 }}>{date.month}</Text></View>}
      title={event.title}
      detail={`${formatDay(event.startAt)} · ${formatTimeRange(event.startAt, event.endAt)}\n${event.location}`}
      right={<ActionButton label="Cancel" danger onPress={onCancel} />}
    />
  );
}
