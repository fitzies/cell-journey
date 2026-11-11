import {
  formatDateOfBirth,
  normalizeDateOfBirth,
  normalizeSingaporePhone,
  sexLabels,
  sexOptions,
  type Sex,
} from '@cell-journey/domain';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fonts, radius, spacing, textStyles, useAppTheme } from '@/constants/tokens';

export type PersonalDetailsValues = {
  /** YYYY-MM-DD or empty. */
  dateOfBirth: string;
  sex: Sex | null;
  /** As typed: local 8 digits, optionally with spaces or +65. */
  phone: string;
};

export type PersonalDetailField = 'dateOfBirth' | 'sex' | 'phone';

export const emptyPersonalDetails: PersonalDetailsValues = { dateOfBirth: '', sex: null, phone: '' };

/** Shows a stored "+6591234567" as the 8 local digits users type. */
export function phoneInputValue(phone: string | null | undefined) {
  if (!phone) return '';
  const match = /^\+65(\d{4})(\d{4})$/.exec(phone);
  return match ? `${match[1]} ${match[2]}` : phone;
}

export function personalDetailsFromProfile(profile?: { dateOfBirth?: string | null; sex?: Sex | null; phone?: string | null } | null): PersonalDetailsValues {
  return {
    dateOfBirth: profile?.dateOfBirth ?? '',
    sex: profile?.sex ?? null,
    phone: phoneInputValue(profile?.phone),
  };
}

export function personalDetailError(field: PersonalDetailField, values: PersonalDetailsValues) {
  if (field === 'dateOfBirth' && values.dateOfBirth && !normalizeDateOfBirth(values.dateOfBirth)) {
    return 'Enter a real date of birth in the past.';
  }
  if (field === 'phone' && values.phone.trim() && !normalizeSingaporePhone(values.phone)) {
    return 'Enter an 8-digit Singapore number.';
  }
  return null;
}

/** Validated values ready for the backend. Empty fields become null. */
export function personalDetailsPayload(values: PersonalDetailsValues) {
  for (const field of ['dateOfBirth', 'phone'] as const) {
    const error = personalDetailError(field, values);
    if (error) return { ok: false as const, error };
  }
  return {
    ok: true as const,
    value: {
      dateOfBirth: values.dateOfBirth ? normalizeDateOfBirth(values.dateOfBirth) : null,
      sex: values.sex,
      phone: values.phone.trim() ? normalizeSingaporePhone(values.phone) : null,
    },
  };
}

function dateFromValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  // Picker dates are local; noon avoids timezone rollovers.
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : new Date(1995, 0, 1, 12);
}

function valueFromDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type Tone = 'onboarding' | 'form';

/**
 * Date of birth, sex and phone inputs. Every field is optional, and each can be
 * shown on its own (`fields`) for single-field editors.
 */
export function PersonalDetailsFields({
  values,
  onChange,
  disabled = false,
  fields = ['dateOfBirth', 'sex', 'phone'],
  tone = 'form',
  autoFocusPhone = false,
}: {
  values: PersonalDetailsValues;
  onChange: (values: PersonalDetailsValues) => void;
  disabled?: boolean;
  fields?: PersonalDetailField[];
  tone?: Tone;
  autoFocusPhone?: boolean;
}) {
  const t = useAppTheme();
  const [androidPicker, setAndroidPicker] = useState(false);
  const set = <K extends keyof PersonalDetailsValues>(key: K, value: PersonalDetailsValues[K]) => onChange({ ...values, [key]: value });
  const onboarding = tone === 'onboarding';
  const labelStyle = onboarding ? [styles.onboardingLabel, { color: t.muted }] : [textStyles.body, { color: t.muted }];
  const inputStyle = onboarding
    ? [styles.onboardingInput, { backgroundColor: t.surface, borderColor: t.line, color: t.ink }]
    : [styles.formInput, { backgroundColor: t.soft, color: t.ink }];
  // Web types the date by hand; wait for a full date before flagging it.
  const dateError = Platform.OS === 'web' && values.dateOfBirth.length < 10 ? null : personalDetailError('dateOfBirth', values);
  const phoneError = personalDetailError('phone', values);
  const maximumDate = new Date();
  const minimumDate = new Date(1900, 0, 1);

  return <View style={styles.fields}>
    {fields.includes('dateOfBirth') ? <View style={styles.field}>
      <Text style={labelStyle}>Date of birth</Text>
      {Platform.OS === 'web' ? <TextInput
        accessibilityLabel="Date of birth"
        value={values.dateOfBirth}
        onChangeText={(value) => set('dateOfBirth', value.replace(/[^\d-]/g, '').slice(0, 10))}
        editable={!disabled}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={t.muted}
        inputMode="numeric"
        style={inputStyle}
      /> : values.dateOfBirth ? <View style={styles.dateRow}>
        {Platform.OS === 'ios' ? <DateTimePicker
          accessibilityLabel="Date of birth"
          value={dateFromValue(values.dateOfBirth)}
          mode="date"
          display="compact"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          disabled={disabled}
          themeVariant="light"
          onChange={(event, selected) => { if (event.type !== 'dismissed' && selected) set('dateOfBirth', valueFromDate(selected)); }}
        /> : <Pressable accessibilityRole="button" accessibilityLabel={`Date of birth, ${formatDateOfBirth(values.dateOfBirth)}. Change`} disabled={disabled} onPress={() => setAndroidPicker(true)} style={[inputStyle, styles.dateButton]}>
          <Text style={[onboarding ? styles.onboardingValue : textStyles.button, { color: t.ink }]}>{formatDateOfBirth(values.dateOfBirth)}</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Clear date of birth" disabled={disabled} hitSlop={8} onPress={() => set('dateOfBirth', '')}>
          <Text style={[textStyles.button, { color: t.muted }]}>Clear</Text>
        </Pressable>
      </View> : <Pressable accessibilityRole="button" accessibilityLabel="Add date of birth" disabled={disabled}
        onPress={() => {
          if (Platform.OS === 'android') setAndroidPicker(true);
          else set('dateOfBirth', valueFromDate(dateFromValue('')));
        }}
        style={[inputStyle, styles.dateButton]}>
        <Text style={[onboarding ? styles.onboardingValue : textStyles.button, { color: t.muted }]}>Add date of birth</Text>
      </Pressable>}
      {dateError ? <Text accessibilityLiveRegion="polite" style={[textStyles.body, { color: t.danger }]}>{dateError}</Text> : null}
      {Platform.OS === 'android' && androidPicker ? <DateTimePicker
        value={dateFromValue(values.dateOfBirth)}
        mode="date"
        maximumDate={maximumDate}
        minimumDate={minimumDate}
        onChange={(event, selected) => {
          setAndroidPicker(false);
          if (event.type !== 'dismissed' && selected) set('dateOfBirth', valueFromDate(selected));
        }}
      /> : null}
    </View> : null}

    {fields.includes('sex') ? <View style={styles.field}>
      <Text style={labelStyle}>Sex</Text>
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {sexOptions.map((option) => {
          const selected = values.sex === option;
          return <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} aria-checked={selected}
            disabled={disabled}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); set('sex', selected ? null : option); }}
            style={({ pressed }) => [styles.choice, onboarding && styles.onboardingChoice, {
              backgroundColor: selected ? t.selected : onboarding ? t.surface : t.soft,
              borderColor: selected ? t.accent : onboarding ? t.line : 'transparent',
              opacity: pressed ? 0.8 : 1,
            }]}>
            <Text style={[textStyles.button, { color: selected ? t.accent : t.ink }]}>{sexLabels[option]}</Text>
          </Pressable>;
        })}
      </View>
    </View> : null}

    {fields.includes('phone') ? <View style={styles.field}>
      <Text style={labelStyle}>Phone</Text>
      <View style={[inputStyle, styles.phoneWrap]}>
        <Text style={[onboarding ? styles.onboardingValue : textStyles.body, { color: t.muted }]}>+65</Text>
        <TextInput
          accessibilityLabel="Phone number"
          autoFocus={autoFocusPhone}
          value={values.phone}
          onChangeText={(value) => set('phone', value.replace(/[^\d\s+]/g, '').slice(0, 14))}
          editable={!disabled}
          keyboardType="phone-pad"
          inputMode="tel"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="9123 4567"
          placeholderTextColor={t.muted}
          style={[onboarding ? styles.onboardingValue : textStyles.body, styles.phoneInput, { color: t.ink }]}
        />
      </View>
      {phoneError && values.phone.replace(/\D/g, '').length >= 8 ? <Text accessibilityLiveRegion="polite" style={[textStyles.body, { color: t.danger }]}>{phoneError}</Text> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  fields: { gap: spacing.lg },
  field: { gap: spacing.sm },
  onboardingLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  onboardingInput: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: 16, minHeight: 56, fontFamily: fonts.bodySemiBold, fontSize: 18 },
  onboardingValue: { fontFamily: fonts.bodySemiBold, fontSize: 18 },
  formInput: { ...textStyles.body, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 44 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  dateButton: { justifyContent: 'center', flexShrink: 1 },
  choices: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1, minHeight: 44, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  onboardingChoice: { minHeight: 52, borderRadius: radius.lg },
  phoneWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  phoneInput: { flex: 1, minHeight: 40, paddingVertical: 0 },
});
