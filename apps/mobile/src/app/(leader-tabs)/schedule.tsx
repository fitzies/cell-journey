import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GroupSwitcher, useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { ActionButton, EmptyState, LeaderScreen, RowCard, SectionHeader } from '@/components/leader/ui';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { formatDateParts, formatDay, formatTimeRange, nextFridayEvening, startOfToday } from '@/lib/date';
import { MAX_EVENT_IMPORT_FILE_BYTES, parseEventImport, type EventImportPreview } from '@/lib/event-import';
import { api, type Doc, type Id } from '@/lib/api';

type EventForm = {
  title: string;
  venue: string;
  word: string;
  worship: string;
  remarks: string;
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
  const form = { title: '', venue: '', word: '', worship: '', remarks: '', date: formatDateInput(startOfToday()), startTime: value, endTime: value };
  return new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit' }).format(dateFromTimeInput(form, value));
}

function defaultForm(): EventForm {
  const startAt = nextFridayEvening();
  return {
    title: 'Cell Group',
    venue: '',
    word: '',
    worship: '',
    remarks: '',
    date: formatDateInput(startAt),
    startTime: formatTimeInput(startAt),
    endTime: formatTimeInput(startAt + 2 * 60 * 60 * 1000),
  };
}

function formFromEvent(event: Doc<'events'>): EventForm {
  return {
    title: event.title,
    venue: event.venue ?? event.location ?? '',
    word: event.word ?? '',
    worship: event.worship ?? '',
    remarks: event.remarks ?? '',
    date: formatDateInput(event.startAt),
    startTime: formatTimeInput(event.startAt),
    endTime: formatTimeInput(event.endAt),
  };
}

function parseEventForm(form: EventForm, earliestStartAt: number): { ok: true; value: { title: string; venue: string; word: string; worship: string; remarks: string; startAt: number; endAt: number } } | { ok: false; message: string } {
  const title = form.title.trim();
  if (!title) return { ok: false, message: 'Add a title for this gathering.' };

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

  return {
    ok: true,
    value: {
      title,
      venue: form.venue.trim(),
      word: form.word.trim(),
      worship: form.worship.trim(),
      remarks: form.remarks.trim(),
      startAt: start.getTime(),
      endAt: end.getTime(),
    },
  };
}

export default function LeaderScheduleScreen() {
  const [from] = useState(() => startOfToday());
  const [form, setForm] = useState<EventForm>(() => defaultForm());
  const [editingId, setEditingId] = useState<Id<'events'> | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickingFile, setPickingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<EventImportPreview | null>(null);
  const [busyEventId, setBusyEventId] = useState<Id<'events'> | null>(null);
  const { context, selectedLeaderGroup: group } = useGroups();
  const hasGroup = Boolean(group);
  const events = useQuery(api.events.listForGroup, group ? { groupId: group._id, from, limit: 30 } : 'skip');
  const create = useMutation(api.events.createForGroup);
  const importEvents = useMutation(api.events.importForGroup);
  const update = useMutation(api.events.update);
  const cancel = useMutation(api.events.cancel);

  const editingEvent = useMemo(() => events?.find((event) => event._id === editingId) ?? null, [editingId, events]);

  if (context === undefined || (hasGroup && events === undefined)) return <LoadingState />;

  if (!hasGroup) {
    return (
      <LeaderScreen eyebrow="Schedule" title="Plan gatherings." hint="Your leader account is not assigned yet.">
        <EmptyState title="No group assigned." body="Once assigned, you’ll be able to create events for your group." />
      </LeaderScreen>
    );
  }

  const eventRows = events ?? [];

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
        if (!group) throw new Error('Select a group first');
        await create({ groupId: group._id, ...parsed.value });
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

  const pickImportFile = async () => {
    setPickingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) throw new Error('No file was selected.');
      if (asset.size && asset.size > MAX_EVENT_IMPORT_FILE_BYTES) throw new Error('Choose a file smaller than 5 MB.');

      const data = asset.file
        ? await asset.file.arrayBuffer()
        : await new ExpoFile(asset.uri).arrayBuffer();
      if (data.byteLength > MAX_EVENT_IMPORT_FILE_BYTES) throw new Error('Choose a file smaller than 5 MB.');
      setImportPreview(parseEventImport(data, asset.name));
    } catch (err) {
      Alert.alert('Could not read file', err instanceof Error ? err.message : 'Choose a CSV or XLSX file and try again.');
    } finally {
      setPickingFile(false);
    }
  };

  const confirmImport = async () => {
    if (!group || !importPreview) return;
    const validEvents = importPreview.rows.flatMap((row) => row.event ? [row.event] : []);
    if (validEvents.length !== importPreview.rows.length) return;

    setImporting(true);
    try {
      const result = await importEvents({
        groupId: group._id,
        sourceType: importPreview.sourceType,
        fileName: importPreview.fileName,
        events: validEvents,
      });
      setImportPreview(null);
      Alert.alert('Events imported', `${result.insertedCount} ${result.insertedCount === 1 ? 'event is' : 'events are'} now in the schedule.`);
    } catch (err) {
      Alert.alert('Could not import events', err instanceof Error ? err.message : 'Nothing was imported. Please try again.');
    } finally {
      setImporting(false);
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
      <GroupSwitcher mode="leader" />
      <View style={styles.topActions}>
        <View style={styles.topAction}><ActionButton filled label="Create event" disabled={pickingFile || importing} onPress={openCreateForm} /></View>
        <View style={styles.topAction}><ActionButton label={pickingFile ? 'Opening…' : 'Import CSV / XLSX'} disabled={pickingFile || importing} onPress={pickImportFile} /></View>
      </View>

      <SectionHeader title="Upcoming events" meta={`${eventRows.length} total`} />
      {eventRows.length ? (
        <View style={{ gap: 10 }}>
          {eventRows.map((event) => (
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
      <ImportPreviewModal
        preview={importPreview}
        importing={importing}
        onConfirm={confirmImport}
        onClose={() => {
          if (!importing) setImportPreview(null);
        }}
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
              <FormField label="Title" value={form.title} onChangeText={(title) => onChange({ title })} placeholder="Cell Group" returnKeyType="next" editable={!saving} />
              <FormField label="Venue" value={form.venue} onChangeText={(venue) => onChange({ venue })} placeholder="Home or meeting room (optional)" returnKeyType="next" editable={!saving} />
              <View style={styles.timeRow}>
                <FormField label="Word" value={form.word} onChangeText={(word) => onChange({ word })} placeholder="Name (optional)" returnKeyType="next" editable={!saving} containerStyle={styles.timeField} />
                <FormField label="Worship" value={form.worship} onChangeText={(worship) => onChange({ worship })} placeholder="Name (optional)" returnKeyType="next" editable={!saving} containerStyle={styles.timeField} />
              </View>
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
              <FormField
                label="Remarks"
                value={form.remarks}
                onChangeText={(remarks) => onChange({ remarks })}
                placeholder="Anything members should know (optional)"
                multiline
                textAlignVertical="top"
                editable={!saving}
                style={styles.notesInput}
              />
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

            <Text style={[styles.helper, { color: t.muted }]}>Title, date, and times are required. Venue, Word, Worship, and Remarks can be left empty.</Text>
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

function ImportPreviewModal({ preview, importing, onConfirm, onClose }: { preview: EventImportPreview | null; importing: boolean; onConfirm: () => void; onClose: () => void }) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  if (!preview) return null;

  const invalidCount = preview.rows.filter((row) => row.errors.length > 0).length;
  const warningCount = preview.rows.filter((row) => row.warnings.length > 0).length;
  const readyCount = preview.rows.length - invalidCount;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, styles.importSheet, { backgroundColor: t.surface, borderColor: t.line, paddingBottom: Math.max(18, insets.bottom + 10) }]}>
          <View style={[styles.sheetHandle, { backgroundColor: t.line }]} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.formEyebrow, { color: invalidCount ? t.danger : t.accent }]}>Import preview</Text>
              <Text style={[styles.formTitle, { color: t.ink }]} numberOfLines={1}>{preview.fileName}</Text>
              <Text style={[styles.previewSummary, { color: t.muted }]}>
                {invalidCount
                  ? `${invalidCount} ${invalidCount === 1 ? 'row needs' : 'rows need'} attention · nothing will import yet`
                  : `${readyCount} ${readyCount === 1 ? 'event' : 'events'} ready · ${preview.sourceType.toUpperCase()}${warningCount ? ` · ${warningCount} past` : ''}`}
              </Text>
            </View>
            <Pressable disabled={importing} onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.closeButton, { backgroundColor: t.soft, opacity: importing ? 0.45 : 1, transform: [{ scale: pressed && !importing ? 0.96 : 1 }] }]}>
              <Text style={[styles.closeText, { color: t.ink }]}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.previewList}>
            {preview.rows.map((row) => {
              const valid = row.errors.length === 0;
              const hasWarning = row.warnings.length > 0;
              const details = row.event ? [
                row.event.venue ? `Venue · ${row.event.venue}` : null,
                row.event.word ? `Word · ${row.event.word}` : null,
                row.event.worship ? `Worship · ${row.event.worship}` : null,
              ].filter(Boolean) : [];
              return (
                <View key={row.sourceRow} style={[styles.previewRow, { backgroundColor: t.background, borderColor: valid ? hasWarning ? t.accent : t.line : t.danger }]}>
                  <View style={[styles.previewMark, { backgroundColor: valid ? t.soft : t.danger }]}>
                    <Text style={[styles.previewMarkText, { color: valid ? t.accent : t.accentInk }]}>{valid ? hasWarning ? '•' : '✓' : '!'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.previewTitle, { color: t.ink }]} numberOfLines={1}>{row.title}</Text>
                    <Text style={[styles.previewMeta, { color: t.muted }]}>{row.dateLabel} · {row.timeLabel} · row {row.sourceRow}</Text>
                    {details.map((detail) => <Text key={detail} style={[styles.previewDetail, { color: t.muted }]}>{detail}</Text>)}
                    {row.event?.remarks ? <Text style={[styles.previewRemarks, { color: t.ink }]}>{row.event.remarks}</Text> : null}
                    {row.warnings.map((warning) => <Text key={warning} style={[styles.previewWarning, { color: t.accent }]}>{warning}</Text>)}
                    {row.errors.map((error) => <Text key={error} style={[styles.previewError, { color: t.danger }]}>{error}</Text>)}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.previewActions}>
            <ActionButton filled label={importing ? 'Importing…' : `Import ${readyCount} ${readyCount === 1 ? 'event' : 'events'}`} disabled={importing || invalidCount > 0} onPress={onConfirm} />
            <ActionButton label={invalidCount ? 'Close and fix file' : 'Not now'} disabled={importing} onPress={onClose} />
          </View>
        </View>
      </View>
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
  const venue = event.venue ?? event.location;
  const detail = [
    `${formatDay(event.startAt)} · ${formatTimeRange(event.startAt, event.endAt)}`,
    venue,
  ].filter(Boolean).join('\n');
  const people = [
    event.word ? `Word · ${event.word}` : null,
    event.worship ? `Worship · ${event.worship}` : null,
  ].filter(Boolean).join('   ');
  return (
    <RowCard
      mark={<View style={[styles.dateMark, { backgroundColor: t.soft }]}><Text style={[styles.dateDay, { color: t.ink }]}>{date.day}</Text><Text style={[styles.dateMonth, { color: t.muted }]}>{date.month}</Text></View>}
      title={event.title}
      detail={detail}
    >
      {people ? <Text style={[styles.eventExtra, { color: t.muted }]}>{people}</Text> : null}
      {event.remarks ? <Text style={[styles.eventRemarks, { color: t.ink }]}>{event.remarks}</Text> : null}
      <View style={styles.rowActions}>
        <View style={styles.rowAction}><ActionButton label="Edit" disabled={disabled} onPress={onEdit} /></View>
        <View style={styles.rowAction}><ActionButton label={busy ? 'Cancelling…' : 'Cancel'} danger disabled={disabled} onPress={onCancel} /></View>
      </View>
    </RowCard>
  );
}

const styles = StyleSheet.create({
  topActions: { flexDirection: 'row', gap: 8 },
  topAction: { flex: 1, minWidth: 0 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.34)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 18 },
  importSheet: { maxHeight: '92%' },
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
  notesInput: { minHeight: 88, paddingTop: 13, paddingBottom: 13 },
  compactPickerBox: { minHeight: 50, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 8, alignItems: 'flex-start', justifyContent: 'center' },
  pickerButton: { minHeight: 50, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pickerValue: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15.5 },
  pickerHint: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.1, textTransform: 'uppercase' },
  pickerPanel: { marginTop: 12, borderWidth: 1, borderRadius: radius.xl, padding: 10, overflow: 'hidden' },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeField: { minWidth: 0 },
  helper: { marginTop: 12, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  formActions: { marginTop: 16, gap: 9 },
  previewSummary: { marginTop: 7, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  previewList: { paddingTop: 18, paddingBottom: 12, gap: 9 },
  previewRow: { borderWidth: 1, borderRadius: radius.lg, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  previewMark: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  previewMarkText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  previewTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  previewMeta: { marginTop: 4, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17 },
  previewDetail: { marginTop: 3, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17 },
  previewRemarks: { marginTop: 5, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17 },
  previewWarning: { marginTop: 5, fontFamily: fonts.bodySemiBold, fontSize: 12.5, lineHeight: 17 },
  previewError: { marginTop: 5, fontFamily: fonts.bodySemiBold, fontSize: 12.5, lineHeight: 17 },
  previewActions: { gap: 9 },
  dateMark: { width: 48, borderRadius: 16, paddingVertical: 9, alignItems: 'center' },
  dateDay: { fontFamily: fonts.bodyBold, fontSize: 18 },
  dateMonth: { marginTop: 3, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.1 },
  eventExtra: { marginTop: 9, fontFamily: fonts.bodySemiBold, fontSize: 12.5, lineHeight: 18 },
  eventRemarks: { marginTop: 5, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rowAction: { flex: 1 },
});
