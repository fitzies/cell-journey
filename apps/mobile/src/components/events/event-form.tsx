import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { fonts, radius, surfaceShadow, useAppTheme } from '@/constants/tokens';
import { nextFridayEvening, startOfToday } from '@/lib/date';

export type EventForm = {
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

export function defaultEventForm(): EventForm {
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

export function parseEventForm(form: EventForm, earliestStartAt: number): { ok: true; value: { title: string; venue: string; word: string; worship: string; remarks: string; startAt: number; endAt: number } } | { ok: false; message: string } {
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

export function EventFormFields({ form, saving, onChange }: { form: EventForm; saving: boolean; onChange: (patch: Partial<EventForm>) => void }) {
  const [pickerField, setPickerField] = useState<PickerField | null>(null);
  const pickerValue = pickerField === 'date' ? dateFromInput(form.date) : dateFromTimeInput(form, pickerField === 'startTime' ? form.startTime : form.endTime);
  const pickerMode = pickerField === 'date' ? 'date' : 'time';
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
    if (!saving) setPickerField(field);
  };
  return <>
    <View style={styles.formGrid}>
      <FormField label="Title" value={form.title} onChangeText={(title) => onChange({ title })} placeholder="Cell Group" returnKeyType="next" editable={!saving} />
      <FormField label="Venue" value={form.venue} onChangeText={(venue) => onChange({ venue })} placeholder="Home or meeting room (optional)" returnKeyType="next" editable={!saving} />
      <View style={styles.timeRow}>
        <FormField label="Word" value={form.word} onChangeText={(word) => onChange({ word })} placeholder="Name (optional)" returnKeyType="next" editable={!saving} containerStyle={styles.timeField} />
        <FormField label="Worship" value={form.worship} onChangeText={(worship) => onChange({ worship })} placeholder="Name (optional)" returnKeyType="next" editable={!saving} containerStyle={styles.timeField} />
      </View>
      {Platform.OS === 'ios' ? (
        <CompactPickerField label="Date" value={dateFromInput(form.date)} mode="date" disabled={saving} minimumDate={new Date(startOfToday())} onChange={(selected) => updateFromPicker('date', selected)} />
      ) : Platform.OS === 'web' ? (
        <FormField label="Date" value={form.date} onChangeText={(date) => onChange({ date })} placeholder="YYYY-MM-DD" editable={!saving} />
      ) : (
        <PickerButton label="Date" value={formatReadableDate(form.date)} disabled={saving} selected={pickerField === 'date'} onPress={() => openPicker('date')} />
      )}
      <View style={styles.timeRow}>
        {Platform.OS === 'ios' ? (
          <>
            <CompactPickerField label="Starts" value={dateFromTimeInput(form, form.startTime)} mode="time" disabled={saving} onChange={(selected) => updateFromPicker('startTime', selected)} containerStyle={styles.timeField} />
            <CompactPickerField label="Ends" value={dateFromTimeInput(form, form.endTime)} mode="time" disabled={saving} onChange={(selected) => updateFromPicker('endTime', selected)} containerStyle={styles.timeField} />
          </>
        ) : Platform.OS === 'web' ? (
          <>
            <FormField label="Starts" value={form.startTime} onChangeText={(startTime) => onChange({ startTime })} placeholder="19:30" editable={!saving} containerStyle={styles.timeField} />
            <FormField label="Ends" value={form.endTime} onChangeText={(endTime) => onChange({ endTime })} placeholder="21:30" editable={!saving} containerStyle={styles.timeField} />
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
  </>;
}

function CompactPickerField({ label, value, mode, minimumDate, onChange, disabled, containerStyle }: { label: string; value: Date; mode: 'date' | 'time'; minimumDate?: Date; onChange: (selected: Date) => void; disabled?: boolean; containerStyle?: StyleProp<ViewStyle> }) {
  const t = useAppTheme();
  return (
    <View style={[styles.fieldWrap, disabled && styles.disabledField, containerStyle]}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <View style={[styles.compactPickerBox, { backgroundColor: t.surface, ...surfaceShadow(t, 'button') }]}>
        <DateTimePicker
          accessibilityLabel={label}
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
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pickerButton,
          { backgroundColor: t.surface, ...surfaceShadow(t, 'button'), transform: [{ scale: pressed && !disabled ? 0.99 : 1 }] },
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
      <View style={{ borderRadius: radius.lg, backgroundColor: t.surface, ...surfaceShadow(t, 'button') }}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={t.muted}
          {...props}
          style={[styles.input, { color: t.ink }, props.style]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  formGrid: { gap: 12 },
  fieldWrap: { flex: 1 },
  disabledField: { opacity: 0.58 },
  label: { marginBottom: 7, fontFamily: fonts.bodyMedium, fontSize: 13, letterSpacing: 0.3 },
  input: { minHeight: 50, borderRadius: radius.lg, paddingHorizontal: 14, fontFamily: fonts.bodySemiBold, fontSize: 15.5 },
  notesInput: { minHeight: 88, paddingTop: 13, paddingBottom: 13 },
  compactPickerBox: { minHeight: 50, borderRadius: radius.lg, paddingHorizontal: 8, alignItems: 'flex-start', justifyContent: 'center' },
  pickerButton: { minHeight: 50, borderRadius: radius.lg, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pickerValue: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15.5 },
  pickerHint: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.1, textTransform: 'uppercase' },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeField: { minWidth: 0 },
});
