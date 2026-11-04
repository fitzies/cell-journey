import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, surfaceShadow, useAppTheme } from '@/constants/tokens';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// Minimal month grid for members: filled days have a gathering, the ring is today.
export function EventCalendar({ events }: { events: { startAt: number }[] }) {
  const t = useAppTheme();
  const today = new Date();
  const [offset, setOffset] = useState(0);
  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const eventDays = useMemo(() => new Set(events.map((event) => dayKey(new Date(event.startAt)))), [events]);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: month.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  while (cells.length % 7) cells.push(null);

  const label = new Intl.DateTimeFormat('en-SG', {
    month: 'long',
    ...(month.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  }).format(month);
  const todayKey = dayKey(today);

  return (
    <View style={[styles.card, { backgroundColor: t.surface, ...surfaceShadow(t) }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.month, { color: t.text }]}>{label}</Text>
        <View style={styles.nav}>
          <NavButton direction="left" disabled={offset <= 0} onPress={() => setOffset((value) => value - 1)} />
          <NavButton direction="right" onPress={() => setOffset((value) => value + 1)} />
        </View>
      </View>
      <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {WEEKDAYS.map((day, i) => <Text key={i} style={[styles.cell, styles.weekday, { color: t.muted }]}>{day}</Text>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.row}>
          {cells.slice(week * 7, week * 7 + 7).map((date, i) => {
            if (!date) return <View key={i} style={styles.cell} />;
            const key = dayKey(date);
            const hasEvent = eventDays.has(key);
            const isToday = key === todayKey;
            const isPast = !isToday && date < today;
            return (
              <View
                key={i}
                style={styles.cell}
                accessible={hasEvent}
                accessibilityLabel={hasEvent ? `${new Intl.DateTimeFormat('en-SG', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)}, gathering` : undefined}
              >
                <View style={[styles.day, hasEvent && { backgroundColor: t.primary }, isToday && !hasEvent && { borderWidth: 1.5, borderColor: t.text }]}>
                  <Text style={[styles.dayText, { color: hasEvent ? t.accentInk : isPast ? t.muted : t.text }, (hasEvent || isToday) && styles.dayStrong]}>
                    {date.getDate()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function NavButton({ direction, disabled = false, onPress }: { direction: 'left' | 'right'; disabled?: boolean; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === 'left' ? 'Previous month' : 'Next month'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.navButton, { opacity: disabled ? 0.25 : pressed ? 0.5 : 1 }]}
    >
      <SymbolView
        name={{ ios: `chevron.${direction}`, android: `chevron_${direction}`, web: `chevron_${direction}` }}
        size={14}
        tintColor={t.text}
        weight="semibold"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 24, padding: 14, borderRadius: radius.lg },
  header: { marginBottom: 8, paddingLeft: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontFamily: fonts.bodySemiBold, fontSize: 15, letterSpacing: -0.2 },
  nav: { flexDirection: 'row', gap: 4 },
  navButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  cell: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  weekday: { height: 22, fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 22, textAlign: 'center' },
  day: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: fonts.body, fontSize: 13, fontVariant: ['tabular-nums'] },
  dayStrong: { fontFamily: fonts.bodySemiBold },
});
