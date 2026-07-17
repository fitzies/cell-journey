import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { GroupSwitcher, useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { ActionButton, EmptyState, LeaderScreen, Mark, RowCard, SectionHeader } from '@/components/leader/ui';
import { fonts, useAppTheme } from '@/constants/tokens';
import { formatDay, formatTimeRange, startOfToday } from '@/lib/date';
import { api, type Id } from '@/lib/api';

export default function LeaderAttendanceScreen() {
  const t = useAppTheme();
  const [from] = useState(() => startOfToday());
  const [selectedId, setSelectedId] = useState<Id<'events'> | null>(null);
  const { context, selectedLeaderGroup: group } = useGroups();
  const hasGroup = Boolean(group);
  const events = useQuery(api.events.listForGroup, group ? { groupId: group._id, from, limit: 20 } : 'skip');
  const members = useQuery(api.groups.listMembers, group ? { groupId: group._id } : 'skip');
  const selectedEvent = events?.find((event) => event._id === selectedId) ?? events?.[0] ?? null;
  const attendance = useQuery(api.attendance.listForEvent, selectedEvent && hasGroup ? { eventId: selectedEvent._id } : 'skip');
  const mark = useMutation(api.attendance.markForMember);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (context === undefined || (hasGroup && (events === undefined || members === undefined || (selectedEvent && attendance === undefined)))) return <LoadingState />;

  if (!hasGroup) {
    return (
      <LeaderScreen eyebrow="Attendance" title="Mark the room." hint="Your leader account is not assigned yet.">
        <EmptyState title="No group assigned." body="Once assigned, you’ll be able to mark attendance for your members." />
      </LeaderScreen>
    );
  }

  const eventRows = events ?? [];
  const memberRows = members ?? [];
  const attendanceRows = attendance ?? [];
  const statusByProfile = new Map(attendanceRows.map((row) => [row.profileId, row.finalStatus ?? row.memberSubmittedStatus ?? null]));

  const markMember = async (profileId: Id<'userProfiles'>, status: 'present' | 'absent') => {
    if (!selectedEvent) return;
    setBusyId(profileId);
    try {
      await mark({ eventId: selectedEvent._id, profileId, status });
    } catch (err) {
      Alert.alert('Could not mark attendance', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <LeaderScreen eyebrow="Attendance" title="Mark the room." hint="Choose an event, then record who was present.">
      <GroupSwitcher mode="leader" />
      <SectionHeader title="Event" />
      {eventRows.length ? (
        <View style={{ gap: 8 }}>
          {eventRows.slice(0, 4).map((event) => {
            const selected = selectedEvent?._id === event._id;
            return (
              <Pressable key={event._id} onPress={() => setSelectedId(event._id)} style={({ pressed }) => ({ borderWidth: 1, borderColor: selected ? t.accent : t.line, backgroundColor: selected ? t.selected : t.surface, borderRadius: 18, padding: 14, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
                <Text style={{ color: selected ? t.accent : t.ink, fontFamily: fonts.bodySemiBold, fontSize: 16 }}>{event.title}</Text>
                <Text style={{ color: t.muted, marginTop: 4, fontFamily: fonts.body, fontSize: 13 }}>{formatDay(event.startAt)} · {formatTimeRange(event.startAt, event.endAt)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <EmptyState title="No events to mark." body="Create an event in Schedule before taking attendance." />
      )}

      <SectionHeader title="Members" meta={`${memberRows.length} total`} />
      {selectedEvent && memberRows.length ? (
        <View style={{ gap: 10 }}>
          {memberRows.map(({ profile: memberProfile }) => {
            if (!memberProfile) return null;
            const current = statusByProfile.get(memberProfile._id);
            return (
              <RowCard key={memberProfile._id} mark={<Mark success={current === 'present'} danger={current === 'absent'}>{current === 'present' ? '✓' : current === 'absent' ? '—' : '?'}</Mark>} title={memberProfile.preferredName || memberProfile.fullName || 'Unnamed member'} detail={current ? `Marked ${current}` : 'Not marked yet'}>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <ActionButton label={busyId === memberProfile._id ? 'Saving…' : 'Present'} filled disabled={busyId !== null} onPress={() => markMember(memberProfile._id, 'present')} />
                  <ActionButton label="Absent" danger disabled={busyId !== null} onPress={() => markMember(memberProfile._id, 'absent')} />
                </View>
              </RowCard>
            );
          })}
        </View>
      ) : selectedEvent ? (
        <EmptyState title="No active members." body="Approved members will appear here for attendance marking." />
      ) : null}
    </LeaderScreen>
  );
}
