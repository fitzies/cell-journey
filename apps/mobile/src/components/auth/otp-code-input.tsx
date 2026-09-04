import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fonts, radius, useAppTheme } from '@/constants/tokens';

const CODE_LENGTH = 8;

function cleanCode(value: string) {
  return value.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export function OtpCodeInput({
  value,
  onChange,
  disabled = false,
  invalid = false,
  accessibilityHint = 'Enter or paste the code sent to your email',
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  accessibilityHint?: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const t = useAppTheme();
  const clean = cleanCode(value);

  return (
    <Pressable accessible={false} onPress={() => inputRef.current?.focus()} style={styles.wrapper}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.boxRow}
      >
        {Array.from({ length: CODE_LENGTH }).map((_, index) => {
          const isActive = !disabled && clean.length === index;
          const isFilled = Boolean(clean[index]);
          return (
            <View
              key={index}
              style={[
                styles.box,
                {
                  backgroundColor: t.surface,
                  borderColor: invalid ? t.danger : isActive || isFilled ? t.accent : t.line,
                },
                isActive && { backgroundColor: t.selected },
              ]}
            >
              <Text style={[styles.digit, { color: t.ink }]}>{clean[index] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        accessibilityLabel="Eight-digit sign-in code"
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        autoComplete={Platform.OS === 'android' ? 'email-otp' : 'one-time-code'}
        autoFocus
        caretHidden
        contextMenuHidden={false}
        editable={!disabled}
        importantForAutofill="yes"
        keyboardType="number-pad"
        onChangeText={(nextValue) => onChange(cleanCode(nextValue))}
        selectionColor="transparent"
        style={styles.input}
        textContentType="oneTimeCode"
        value={clean}
      />
    </Pressable>
  );
}

export const OTP_CODE_LENGTH = CODE_LENGTH;

const styles = StyleSheet.create({
  wrapper: { minHeight: 64, position: 'relative' },
  boxRow: { flexDirection: 'row', gap: 5 },
  box: {
    alignItems: 'center',
    aspectRatio: 0.72,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    flex: 1,
    justifyContent: 'center',
  },
  digit: {
    fontFamily: fonts.mono,
    fontSize: 21,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  input: {
    bottom: 0,
    color: 'transparent',
    left: 0,
    opacity: 0.01,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
