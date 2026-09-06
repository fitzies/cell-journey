import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import { EventDetailEditor, type EventDetail } from './event-detail-editor';
import { dateFromInput, formatReadableDate, formatReadableTime, type EventForm } from './event-form';

const detailChips = [
  { field: 'word', label: 'Word', icon: { ios: 'book', android: 'menu_book', web: 'menu_book' } },
  { field: 'worship', label: 'Worship', icon: { ios: 'music.note', android: 'music_note', web: 'music_note' } },
  { field: 'remarks', label: 'Note', icon: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' } },
] as const;

function CanvasIcon({ name, size = 19 }: { name: SymbolViewProps['name']; size?: number }) {
  const t = useAppTheme();
  return <SymbolView name={name} size={size} tintColor={t.muted} />;
}

export function EventCanvas({ groupName, form, saving, onChange, earliestStartAt }: {
  earliestStartAt?: number;
  groupName: string;
  form: EventForm;
  saving: boolean;
  onChange: (patch: Partial<EventForm>) => void;
}) {
  const t = useAppTheme();
  const [editing, setEditing] = useState<EventDetail | null>(null);
  const date = dateFromInput(form.date);
  const open = (field: EventDetail) => {
    if (saving) return;
    Keyboard.dismiss();
    setEditing(field);
  };
  return <View style={saving && styles.disabled}>
    <View style={styles.context}>
      <CanvasIcon name={{ ios: 'person.2', android: 'group', web: 'group' }} size={14} />
      <Text style={[styles.caption, styles.flex, { color: t.muted }]}>For {groupName}</Text>
    </View>
    <View style={styles.titleWrap}>
      <Text accessible={false} aria-hidden importantForAccessibility="no-hide-descendants" style={[styles.title, styles.titleMeasure]}>{form.title || 'Name your gathering'}{'\u200b'}</Text>
      <TextInput
        accessibilityLabel="Event title"
        value={form.title}
        onChangeText={(title) => onChange({ title })}
        editable={!saving}
        placeholder="Name your gathering"
        placeholderTextColor={t.muted}
        multiline
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        textAlignVertical="top"
        style={[styles.title, StyleSheet.absoluteFill, { color: t.ink }]}
      />
    </View>
    <Text style={[styles.caption, { color: t.muted }]}>Tap the title to make it yours.</Text>

    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Change date and times, ${formatReadableDate(form.date)}, ${formatReadableTime(form.startTime)} to ${formatReadableTime(form.endTime)}`}
      disabled={saving}
      onPress={() => open('when')}
      style={({ pressed }) => [styles.dateCard, { backgroundColor: pressed ? t.soft : t.surface, ...surfaceShadow(t) }]}
    >
      <View style={styles.dateTile}>
        <Text style={[styles.month, { color: t.muted }]}>{date.toLocaleDateString('en-SG', { month: 'short' }).toUpperCase()}</Text>
        <Text style={[styles.day, { color: t.ink }]}>{date.getDate()}</Text>
      </View>
      <View style={[styles.flex, styles.dateCopy]}>
        <Text style={[textStyles.button, { color: t.ink }]}>{formatReadableDate(form.date)}</Text>
        <Text style={[styles.caption, { color: t.muted }]}>{formatReadableTime(form.startTime)} – {formatReadableTime(form.endTime)}</Text>
      </View>
      <CanvasIcon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={12} />
    </Pressable>

    <Pressable
      accessibilityRole="button"
      accessibilityLabel={form.venue ? `Edit place, ${form.venue}` : 'Add a place'}
      disabled={saving}
      onPress={() => open('venue')}
      style={({ pressed }) => [styles.place, { opacity: pressed ? 0.65 : 1 }]}
    >
      <CanvasIcon name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} />
      <View style={[styles.flex, styles.dateCopy]}>
        <Text style={[textStyles.body, { color: t.ink }]}>{form.venue || 'Add a place'}</Text>
        {!form.venue ? <Text style={[styles.caption, { color: t.muted }]}>It can be decided later</Text> : null}
      </View>
      <CanvasIcon name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={12} />
    </Pressable>
    <View style={[styles.divider, { backgroundColor: t.track }]} />
    <View style={styles.details}>
      <Text accessibilityRole="header" style={[textStyles.section, { color: t.ink }]}>A few details</Text>
      <View style={styles.chips}>
        {detailChips.map(({ field, label, icon }) => <Pressable
          key={field}
          accessibilityRole="button"
          accessibilityLabel={`${form[field] ? 'Edit' : 'Add'} ${label}${form[field] ? `, ${form[field]}` : ''}`}
          disabled={saving}
          onPress={() => open(field)}
          style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? t.soft : t.surface, ...surfaceShadow(t, 'button') }]}
        >
          <CanvasIcon name={icon} size={16} />
          <Text numberOfLines={1} style={[styles.chipText, { color: t.ink }]}>{form[field] ? field === 'remarks' ? 'Note added' : form[field] : label}</Text>
          <CanvasIcon name={form[field] ? { ios: 'checkmark', android: 'check', web: 'check' } : { ios: 'plus', android: 'add', web: 'add' }} size={13} />
        </Pressable>)}
      </View>
      {form.remarks ? <Text style={[textStyles.body, styles.note, { color: t.muted }]}>{form.remarks}</Text> : null}
    </View>
    {editing ? <EventDetailEditor
      field={editing}
      earliestStartAt={earliestStartAt}
      form={form}
      onClose={() => setEditing(null)}
      onApply={(patch) => { if (!saving) onChange(patch); setEditing(null); }}
    /> : null}
  </View>;
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.58 },
  flex: { flex: 1, minWidth: 0 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 22 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 34, lineHeight: 40, letterSpacing: -1.1, padding: 0, paddingBottom: 5, minHeight: 45 },
  titleWrap: { minHeight: 45 },
  titleMeasure: { opacity: 0 },
  dateCard: { marginTop: 28, borderRadius: radius.lg, borderCurve: 'continuous', minHeight: 94, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
  dateTile: { alignItems: 'center', minWidth: 40 },
  month: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 0.6 },
  day: { fontFamily: fonts.bodySemiBold, fontSize: 30, lineHeight: 34, letterSpacing: -0.8 },
  dateCopy: { gap: 5 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 22, minHeight: 82 },
  divider: { height: 1 },
  details: { paddingTop: 26, gap: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: radius.pill },
  chipText: { flexShrink: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  note: { marginTop: 9 },
});
