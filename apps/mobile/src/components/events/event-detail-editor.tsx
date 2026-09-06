import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Button, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, textStyles, useAppTheme } from '@/constants/tokens';
import { startOfToday } from '@/lib/date';
import { dateFromInput, dateFromTimeInput, formatDateInput, formatReadableDate, formatReadableTime, formatTimeInput, parseEventForm, type EventForm } from './event-form';

export type EventDetail = 'when' | 'venue' | 'word' | 'worship' | 'remarks';
type PickerField = 'date' | 'startTime' | 'endTime';
const copy = {
  when: { title: 'The evening', hint: 'Pick a date and a little time together.', label: '', placeholder: '' },
  venue: { title: "Where we're meeting", hint: 'A home, a room, or somewhere familiar.', label: 'Place', placeholder: "e.g. Daniel's home" },
  word: { title: 'Sharing the Word', hint: 'Who would you like to put down? You can leave it open.', label: 'Name', placeholder: 'Add a name' },
  worship: { title: 'Leading worship', hint: 'Who would you like to put down? You can leave it open.', label: 'Name', placeholder: 'Add a name' },
  remarks: { title: 'A note for the group', hint: 'Anything useful to know before the gathering.', label: 'Note', placeholder: 'Bring something to share…' },
};

// Draft changes stay in this editor until Apply; closing it leaves the canvas intact.
export function EventDetailEditor({ field, form, onClose, onApply, earliestStartAt = startOfToday() }: {
  earliestStartAt?: number;
  field: EventDetail;
  form: EventForm;
  onClose: () => void;
  onApply: (patch: Partial<EventForm>) => void;
}) {
  const t = useAppTheme();
  const dark = useColorScheme() === 'dark';
  const reduceMotion = useReducedMotion();
  const buttonColor = Platform.OS === 'android' && dark ? t.accentInk : t.ink;
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(form);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<PickerField | null>(null);
  const [shown, setShown] = useState(false);
  const details = copy[field];
  const change = (key: keyof EventForm, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError('');
  };
  const changeDate = (key: PickerField, date: Date) => change(key, key === 'date' ? formatDateInput(date.getTime()) : formatTimeInput(date.getTime()));
  const apply = () => {
    if (field === 'when') {
      // Validate the schedule independently of an unfinished title on the canvas.
      const result = parseEventForm({ ...draft, title: draft.title.trim() || 'Cell Group' }, earliestStartAt);
      if (!result.ok) { setError(result.message); return; }
      onApply({ date: draft.date, startTime: draft.startTime, endTime: draft.endTime });
    } else onApply({ [field]: draft[field].trim() });
  };
  return <Modal visible transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} onShow={() => setShown(true)} statusBarTranslucent>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityLabel="Cancel editing" accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: t.surface, marginTop: insets.top + 16, marginBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.toolbar}>
          <Button title="Cancel" color={buttonColor} onPress={onClose} />
          <Button title="Apply" color={buttonColor} onPress={apply} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={[textStyles.title, { color: t.ink }]}>{details.title}</Text>
          <Text style={[textStyles.body, styles.hint, { color: t.muted }]}>{details.hint}</Text>
          {field === 'when' ? <View style={styles.schedule}>
            {(['date', 'startTime', 'endTime'] as const).map((key) => {
              const label = key === 'date' ? 'Date' : key === 'startTime' ? 'From' : 'Until';
              const value = key === 'date' ? dateFromInput(draft.date) : dateFromTimeInput(draft, draft[key]);
              return <View key={key} style={[styles.scheduleRow, { borderBottomColor: t.track }]}>
                <Text style={[textStyles.body, { color: t.muted }]}>{label}</Text>
                {Platform.OS === 'ios' ? <DateTimePicker
                  accessibilityLabel={label}
                  value={value}
                  mode={key === 'date' ? 'date' : 'time'}
                  display="compact"
                  minimumDate={key === 'date' && Number.isFinite(earliestStartAt) ? new Date(earliestStartAt) : undefined}
                  themeVariant={dark ? 'dark' : 'light'}
                  onChange={(event, selected) => { if (event.type !== 'dismissed' && selected) changeDate(key, selected); }}
                /> : Platform.OS === 'android' ? <Pressable accessibilityRole="button" accessibilityLabel={`Change ${label}`} onPress={() => setPicker(key)} style={styles.pickerButton}>
                  <Text style={[textStyles.button, { color: t.ink }]}>{key === 'date' ? formatReadableDate(draft.date) : formatReadableTime(draft[key])}</Text>
                </Pressable> : <TextInput accessibilityLabel={label} value={draft[key]} onChangeText={(value) => change(key, value)} placeholder={key === 'date' ? 'YYYY-MM-DD' : '19:30'} placeholderTextColor={t.muted} style={[styles.webPicker, { color: t.ink, backgroundColor: t.background }]} />}
              </View>;
            })}
          </View> : <View>
            <Text style={[styles.label, { color: t.muted }]}>{details.label}</Text>
            {shown ? <TextInput
              autoFocus
              accessibilityLabel={details.label}
              value={draft[field]}
              onChangeText={(value) => change(field, value)}
              placeholder={details.placeholder}
              placeholderTextColor={t.muted}
              multiline={field === 'remarks'}
              textAlignVertical={field === 'remarks' ? 'top' : 'center'}
              returnKeyType={field === 'remarks' ? 'default' : 'done'}
              onSubmitEditing={field === 'remarks' ? undefined : apply}
              style={[styles.input, field === 'remarks' && styles.notes, { color: t.ink, backgroundColor: t.background }]}
            /> : null}
          </View>}
          {error ? <Text accessibilityRole="alert" style={[textStyles.body, styles.error, { color: t.danger }]}>{error}</Text> : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
    {Platform.OS === 'android' && picker ? <DateTimePicker
      value={picker === 'date' ? dateFromInput(draft.date) : dateFromTimeInput(draft, draft[picker])}
      mode={picker === 'date' ? 'date' : 'time'}
      minimumDate={picker === 'date' && Number.isFinite(earliestStartAt) ? new Date(earliestStartAt) : undefined}
      onChange={(event, selected) => { setPicker(null); if (event.type !== 'dismissed' && selected) changeDate(picker, selected); }}
    /> : null}
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '85%', width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: radius.lg, overflow: 'hidden' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  content: { paddingHorizontal: 22, paddingBottom: 26 },
  hint: { marginTop: 10, marginBottom: 26 },
  label: { fontFamily: fonts.body, fontSize: 13, marginBottom: 10 },
  input: { borderRadius: radius.sm, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 17 },
  notes: { minHeight: 130 },
  schedule: { gap: 12 },
  scheduleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1 },
  pickerButton: { minHeight: 44, justifyContent: 'center', flexShrink: 1 },
  webPicker: { minHeight: 44, padding: 10, borderRadius: radius.sm, fontFamily: fonts.body, fontSize: 16 },
  error: { marginTop: 18 },
});
