import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingState } from '@/components/onboarding/ui';
import { ActionButton, EmptyState, LeaderScreen, RowCard, SectionHeader } from '@/components/leader/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { formatDateParts, formatDay, formatTimeRange, nextFridayEvening, startOfToday } from '@/lib/date';
import { api, type Doc, type Id } from '@/lib/api';

type EventForm = {
  title: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
};

type PickerField = 'date' | 'startTime' | 'endTime';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateInput(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeInput(ms: number) {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateFromInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return new Date(startOfToday());
  const [, yearRaw, monthRaw, dayRaw] = match;
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw), 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return new Date(startOfToday());
  return date;
}

function dateFromTimeInput(form: EventForm, value: string) {
  const date = dateFromInput(form.date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return date;
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

function formatReadableDate(value: string) {
  return new Intl.DateTimeFormat('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(dateFromInput(value));
}

function formatReadableTime(value: string) {
  return new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit' }).format(dateFromTimeInput({ title: '', location: '', date: formatDateInput(startOfToday()), startTime: value, endTime: value }, value));
}

function defaultForm(): EventForm {
  const startAt = nextFridayEvening();
  return {
    title: 'Cell Gathering',
    location: '',
    date: formatDateInput(startAt),
    startTime: formatTimeInput(startAt),
    endTime: formatTimeInput(startAt + 2 * 60 * 60 * 1000),
  };
}

function formFromEvent(event: Doc<'events'>): EventForm {
  return {
    title: event.title,
    location: event.location,
    date: formatDateInput(event.startAt),
    startTime: formatTimeInput(event.startAt),
    endTime: formatTimeInput(event.endAt),
  };
}

function parseEventForm(form: EventForm, earliestStartAt: number): { ok: true; value: { title: string; location: string; startAt: number; endAt: number } } | { ok: false; message: string } {
  const title = form.title.trim();
  const location = form.location.trim();
  if (!title) return { ok: false, message: 'Add a title for this gathering.' };
  if (!location) return { ok: false, message: 'Add a location, even if it is TBC.' };

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.date.trim());
  if (!dateMatch) return { ok: false, message: 'Use the date format YYYY-MM-DD.' };

  const startMatch = /^(\d{1,2}):(\d{2})$/.exec(form.startTime.trim());
  const endMatch = /^(\d{1,2}):(\d{2})$/.exec(form.endTime.trim());
  if (!startMatch || !endMatch) return { ok: false, message: 'Use 24-hour time, for example 19:30.' };

  const [, yearRaw, monthRaw, dayRaw] = dateMatch;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const startHour = Number(startMatch[1]);
  const startMinute = Number(startMatch[2]);
  const endHour = Number(endMatch[1]);
  const endMinute = Number(endMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return { ok: false, message: 'Enter a real calendar date.' };
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return { ok: false, message: 'Enter a valid 24-hour time.' };

  const start = new Date(year, month - 1, day, startHour, startMinute, 0, 0);
  const end = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return { ok: false, message: 'Enter a real calendar date.' };
  if (start.getTime() < earliestStartAt) return { ok: false, message: 'Events must be scheduled for today or later.' };
  if (end.getTime() <= start.getTime()) return { ok: false, message: 'End time must be after the start time.' };

  return { ok: true, value: { title, location, startAt: start.getTime(), endAt: end.getTime() } };
}

export default function LeaderScheduleScreen() {
  const [from] = useState(() => startOfToday());
  const [form, setForm] = useState<EventForm>(() => defaultForm());
  const [editingId, setEditingId] = useState<Id<'events'> | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyEventId, setBusyEventId] = useState<Id<'events'> | null>(null);
  const profile = useQuery(api.profiles.current, {});
  const hasGroup = Boolean(profile?.leaderGroupId);
  const events = useQuery(api.events.listMine, { from, limit: 30 });
  const create = useMutation(api.events.create);
  const update = useMutation(api.events.update);
  const cancel = useMutation(api.events.cancel);

  const editingEvent = useMemo(() => events?.find((event) => event._id === editingId) ?? null, [editingId, events]);

  if (profile === undefined || events === undefined) return <LoadingState />;

  if (!hasGroup) {
    return (
      <LeaderScreen eyebrow="Schedule" title="Plan gatherings." hint="Your leader account is not assigned yet.">
        <EmptyState title="No group assigned." body="Once assigned, you’ll be able to create events for your group." />
      </LeaderScreen>
    );
  }

  const openCreateForm = () => {
    setEditingId(null);
    setForm(defaultForm());
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingId(null);
  };

  const submitForm = async () => {
    const parsed = parseEventForm(form, from);
    if (!parsed.ok) {
      Alert.alert('Check event details', parsed.message);
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await update({ eventId: editingId, ...parsed.value });
      } else {
        await create(parsed.value);
      }
      setForm(defaultForm());
      setEditingId(null);
      setFormOpen(false);
    } catch (err) {
      Alert.alert(editingId ? 'Could not update event' : 'Could not create event', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (event: Doc<'events'>) => {
    setEditingId(event._id);
    setForm(formFromEvent(event));
    setFormOpen(true);
  };

  const confirmCancel = (event: Doc<'events'>) => {
    Alert.alert('Cancel event?', 'Members will no longer see this gathering. Attendance history stays saved.', [
      { text: 'Keep event', style: 'cancel' },
      {
        text: 'Cancel event',
        style: 'destructive',
        onPress: async () => {
          setBusyEventId(event._id);
          try {
            await cancel({ eventId: event._id });
            if (editingId === event._id) closeForm();
          } catch (err) {
            Alert.alert('Could not cancel', err instanceof Error ? err.message : 'Please try again.');
          } finally {
            setBusyEventId(null);
          }
        },
      },
    ]);
  };

  return (
    <LeaderScreen eyebrow="Schedule" title="Plan gatherings." hint="Keep the schedule clean. Add details only when you need them.">
      <ActionButton filled label="Create event" onPress={openCreateForm} />

      <SectionHeader title="Upcoming events" meta={`${events.length} total`} />
      {events.length ? (
        <View style={{ gap: 10 }}>
          {events.map((event) => (
            <EventRow
              key={event._id}
              event={event}
              disabled={saving || busyEventId !== null}
              busy={busyEventId === event._id}
              onEdit={() => startEdit(event)}
              onCancel={() => confirmCancel(event)}
            />
          ))}
        </View>
      ) : (
        <EmptyState title="No events yet." body="Create your first event so members can see the schedule and check in during the attendance window." />
      )}

      <EventFormModal
        visible={formOpen}
        form={form}
        editingTitle={editingEvent?.title ?? null}
        saving={saving}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onSubmit={submitForm}
        onClose={closeForm}
      />
    </LeaderScreen>
  );
}

function EventFormModal({ visible, form, editingTitle, saving, onChange, onSubmit, onClose }: { visible: boolean; form: EventForm; editingTitle: string | null; saving: boolean; onChange: (patch: Partial<EventForm>) => void; onSubmit: () => void; onClose: () => void }) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const [pickerField, setPickerField] = useState<PickerField | null>(null);
  const editing = Boolean(editingTitle);

  const pickerValue = pickerField === 'date' ? dateFromInput(form.date) : pickerField === 'startTime' ? dateFromTimeInput(form, form.startTime) : dateFromTimeInput(form, form.endTime);
  const pickerMode = pickerField === 'date' ? 'date' : 'time';

  useEffect(() => {
    if (!visible) setPickerField(null);
  }, [visible]);

  const updateFromPicker = (field: PickerField, selected: Date) => {
    if (field === 'date') onChange({ date: formatDateInput(selected.getTime()) });
    if (field === 'startTime') onChange({ startTime: formatTimeInput(selected.getTime()) });
    if (field === 'endTime') onChange({ endTime: formatTimeInput(selected.getTime()) });
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setPickerField(null);
    if (event.type === 'dismissed' || !selected || !pickerField) return;
    updateFromPicker(pickerField, selected);
  };

  const openPicker = (field: PickerField) => {
    if (saving) return;
    setPickerField(field);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.line, paddingBottom: Math.max(18, insets.bottom + 10) }]}>
          <View style={[styles.sheetHandle, { backgroundColor: t.line }]} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.formEyebrow, { color: t.accent }]}>{editing ? 'Editing event' : 'New event'}</Text>
              <Text style={[styles.formTitle, { color: t.ink }]}>{editing ? editingTitle : 'Add gathering details'}</Text>
            </View>
            <Pressable disabled={saving} onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.closeButton, { backgroundColor: t.soft, opacity: saving ? 0.45 : 1, transform: [{ scale: pressed && !saving ? 0.96 : 1 }] }]}>
              <Text style={[styles.closeText, { color: t.ink }]}>×</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            <View style={styles.formGrid}>
              <FormField label="Title" value={form.title} onChangeText={(title) => onChange({ title })} placeholder="Cell Gathering" returnKeyType="next" editable={!saving} />
              <FormField label="Location" value={form.location} onChangeText={(location) => onChange({ location })} placeholder="Home, church room, or TBC" returnKeyType="next" editable={!saving} />
              {Platform.OS === 'ios' ? (
                <CompactPickerField label="Date" value={dateFromInput(form.date)} mode="date" disabled={saving} minimumDate={new Date(startOfToday())} onChange={(selected) => updateFromPicker('date', selected)} />
              ) : (
                <PickerButton label="Date" value={formatReadableDate(form.date)} disabled={saving} selected={pickerField === 'date'} onPress={() => openPicker('date')} />
              )}
              <View style={styles.timeRow}>
                {Platform.OS === 'ios' ? (
                  <>
                    <CompactPickerField label="Starts" value={dateFromTimeInput(form, form.startTime)} mode="time" disabled={saving} onChange={(selected) => updateFromPicker('startTime', selected)} containerStyle={styles.timeField} />
                    <CompactPickerField label="Ends" value={dateFromTimeInput(form, form.endTime)} mode="time" disabled={saving} onChange={(selected) => updateFromPicker('endTime', selected)} containerStyle={styles.timeField} />
                  </>
                ) : (
                  <>
                    <PickerButton label="Starts" value={formatReadableTime(form.startTime)} disabled={saving} selected={pickerField === 'startTime'} onPress={() => openPicker('startTime')} containerStyle={styles.timeField} />
                    <PickerButton label="Ends" value={formatReadableTime(form.endTime)} disabled={saving} selected={pickerField === 'endTime'} onPress={() => openPicker('endTime')} containerStyle={styles.timeField} />
                  </>
                )}
              </View>
            </View>

            {Platform.OS === 'android' && pickerField ? (
              <DateTimePicker
                value={pickerValue}
                mode={pickerMode}
                display="default"
                minimumDate={pickerField === 'date' ? new Date(startOfToday()) : undefined}
                onChange={onPickerChange}
              />
            ) : null}

            <Text style={[styles.helper, { color: t.muted }]}>Choose native date and time controls. End time must be after start time.</Text>
            <View style={styles.formActions}>
              <ActionButton filled label={saving ? 'Saving…' : editing ? 'Save changes' : 'Create event'} disabled={saving} onPress={onSubmit} />
              <ActionButton label="Not now" disabled={saving} onPress={onClose} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CompactPickerField({ label, value, mode, minimumDate, onChange, disabled, containerStyle }: { label: string; value: Date; mode: 'date' | 'time'; minimumDate?: Date; onChange: (selected: Date) => void; disabled?: boolean; containerStyle?: StyleProp<ViewStyle> }) {
  const t = useAppTheme();
  return (
    <View style={[styles.fieldWrap, disabled && styles.disabledField, containerStyle]}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <View style={[styles.compactPickerBox, { backgroundColor: t.background, borderColor: t.line }]}>
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          minimumDate={minimumDate}
          disabled={disabled}
          onChange={(event, selected) => {
            if (event.type === 'dismissed' || !selected) return;
            onChange(selected);
          }}
        />
      </View>
    </View>
  );
}

function PickerButton({ label, value, onPress, disabled, selected, containerStyle }: { label: string; value: string; onPress: () => void; disabled?: boolean; selected?: boolean; containerStyle?: StyleProp<ViewStyle> }) {
  const t = useAppTheme();
  return (
    <View style={[styles.fieldWrap, disabled && styles.disabledField, containerStyle]}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pickerButton,
          { backgroundColor: t.background, borderColor: selected ? t.accent : t.line, transform: [{ scale: pressed && !disabled ? 0.99 : 1 }] },
        ]}
      >
        <Text style={[styles.pickerValue, { color: selected ? t.accent : t.ink }]}>{value}</Text>
        <Text style={[styles.pickerHint, { color: t.muted }]}>Tap</Text>
      </Pressable>
    </View>
  );
}

function FormField({ label, containerStyle, ...props }: { label: string; containerStyle?: StyleProp<ViewStyle> } & TextInputProps) {
  const t = useAppTheme();
  const editable = props.editable !== false;
  return (
    <View style={[styles.fieldWrap, !editable && styles.disabledField, containerStyle]}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[styles.input, { backgroundColor: t.background, borderColor: t.line, color: t.ink }, props.style]}
      />
    </View>
  );
}

function EventRow({ event, disabled, busy, onEdit, onCancel }: { event: Doc<'events'>; disabled: boolean; busy: boolean; onEdit: () => void; onCancel: () => void }) {
  const t = useAppTheme();
  const date = formatDateParts(event.startAt);
  return (
    <RowCard
      mark={<View style={[styles.dateMark, { backgroundColor: t.soft }]}><Text style={[styles.dateDay, { color: t.ink }]}>{date.day}</Text><Text style={[styles.dateMonth, { color: t.muted }]}>{date.month}</Text></View>}
      title={event.title}
      detail={`${formatDay(event.startAt)} · ${formatTimeRange(event.startAt, event.endAt)}\n${event.location}`}
    >
      <View style={styles.rowActions}>
        <View style={styles.rowAction}><ActionButton label="Edit" disabled={disabled} onPress={onEdit} /></View>
        <View style={styles.rowAction}><ActionButton label={busy ? 'Cancelling…' : 'Cancel'} danger disabled={disabled} onPress={onCancel} /></View>
      </View>
    </RowCard>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.34)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 18 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 999, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetBody: { paddingTop: 18, paddingBottom: 8 },
  closeButton: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  closeText: { marginTop: -2, fontFamily: fonts.bodySemiBold, fontSize: 26, lineHeight: 28 },
  formEyebrow: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.7, textTransform: 'uppercase' },
  formTitle: { marginTop: 6, fontFamily: fonts.bodyBold, fontSize: 20, letterSpacing: -0.4 },
  formGrid: { gap: 12 },
  fieldWrap: { flex: 1 },
  disabledField: { opacity: 0.58 },
  label: { marginBottom: 7, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, fontFamily: fonts.bodySemiBold, fontSize: 15.5 },
  compactPickerBox: { minHeight: 50, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 8, alignItems: 'flex-start', justifyContent: 'center' },
  pickerButton: { minHeight: 50, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pickerValue: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15.5 },
  pickerHint: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.1, textTransform: 'uppercase' },
  pickerPanel: { marginTop: 12, borderWidth: 1, borderRadius: radius.xl, padding: 10, overflow: 'hidden' },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeField: { minWidth: 0 },
  helper: { marginTop: 12, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  formActions: { marginTop: 16, gap: 9 },
  dateMark: { width: 48, borderRadius: 16, paddingVertical: 9, alignItems: 'center' },
  dateDay: { fontFamily: fonts.bodyBold, fontSize: 18 },
  dateMonth: { marginTop: 3, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.1 },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rowAction: { flex: 1 },
});
