import * as Haptics from 'expo-haptics';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, useAppTheme } from '@/constants/tokens';

type RosterSection = 'active' | 'inactive';

export type OrderedRosterEntry<T> = {
  id: string;
  value: T;
  reorderable?: boolean;
};

type ListItem<T> =
  | { key: string; kind: 'header'; section: RosterSection }
  | { key: string; kind: 'row'; section: RosterSection; entry: OrderedRosterEntry<T> }
  | { key: string; kind: 'empty'; section: RosterSection };

type OrderedRosterScreenProps<T> = {
  eyebrow: string;
  title: string;
  hint?: string;
  headerContent?: ReactNode;
  activeRows: OrderedRosterEntry<T>[];
  inactiveRows: OrderedRosterEntry<T>[];
  activeTitle?: string;
  activeDescription?: string;
  activeEmptyText?: string;
  inactiveTitle?: string;
  inactiveDescription?: string;
  inactiveEmptyText?: string;
  showSections?: boolean;
  canReorder?: boolean;
  reorderControls?: 'rail' | 'inline-handle';
  showReorderHint?: boolean;
  reorderAccessibilityLabel?: (entry: OrderedRosterEntry<T>) => string;
  renderRow: (entry: OrderedRosterEntry<T>, reorderHandle?: ReactNode) => ReactNode;
  onReorder?: (section: RosterSection, rows: OrderedRosterEntry<T>[]) => Promise<void>;
  onReorderError?: (error: unknown) => void;
};

function idsFor<T>(rows: OrderedRosterEntry<T>[]) {
  return rows.map((row) => row.id);
}

function rowsFromOrder<T>(order: string[], source: OrderedRosterEntry<T>[]) {
  const byId = new Map(source.map((row) => [row.id, row]));
  const ordered = order.map((id) => byId.get(id)).filter((row): row is OrderedRosterEntry<T> => Boolean(row));
  const orderedIds = new Set(order);
  return [...ordered, ...source.filter((row) => !orderedIds.has(row.id))];
}

export function OrderedRosterScreen<T>({
  eyebrow,
  title,
  hint,
  headerContent,
  activeRows,
  inactiveRows,
  activeTitle = 'Active members',
  activeDescription,
  activeEmptyText = 'No active members.',
  inactiveTitle = 'Inactive · optional',
  inactiveDescription = 'Not required for attendance.',
  inactiveEmptyText = 'No inactive members.',
  showSections = true,
  canReorder = false,
  reorderControls = 'rail',
  showReorderHint = true,
  reorderAccessibilityLabel,
  renderRow,
  onReorder,
  onReorderError,
}: OrderedRosterScreenProps<T>) {
  const t = useAppTheme();
  const [activeOrder, setActiveOrder] = useState(() => idsFor(activeRows));
  const [inactiveOrder, setInactiveOrder] = useState(() => idsFor(inactiveRows));
  const [savingOrder, setSavingOrder] = useState(false);

  const orderedActive = useMemo(() => rowsFromOrder(activeOrder, activeRows), [activeOrder, activeRows]);
  const orderedInactive = useMemo(() => rowsFromOrder(inactiveOrder, inactiveRows), [inactiveOrder, inactiveRows]);

  const data = useMemo<ListItem<T>[]>(() => {
    if (!showSections) return [];
    return [
      { key: 'header:active', kind: 'header', section: 'active' },
      ...(orderedActive.length
        ? orderedActive.map((entry) => ({ key: `active:${entry.id}`, kind: 'row' as const, section: 'active' as const, entry }))
        : [{ key: 'empty:active', kind: 'empty' as const, section: 'active' as const }]),
      { key: 'header:inactive', kind: 'header', section: 'inactive' },
      ...(orderedInactive.length
        ? orderedInactive.map((entry) => ({ key: `inactive:${entry.id}`, kind: 'row' as const, section: 'inactive' as const, entry }))
        : [{ key: 'empty:inactive', kind: 'empty' as const, section: 'inactive' as const }]),
    ];
  }, [orderedActive, orderedInactive, showSections]);

  const commitOrder = async (section: RosterSection, nextRows: OrderedRosterEntry<T>[], previousRows: OrderedRosterEntry<T>[]) => {
    if (!onReorder || savingOrder) return;
    const nextIds = idsFor(nextRows);
    if (nextIds.join('|') === idsFor(previousRows).join('|')) return;
    if (section === 'active') setActiveOrder(nextIds);
    else setInactiveOrder(nextIds);
    setSavingOrder(true);
    try {
      await onReorder(section, nextRows.filter((row) => row.reorderable !== false));
    } catch (error) {
      if (section === 'active') setActiveOrder(idsFor(previousRows));
      else setInactiveOrder(idsFor(previousRows));
      onReorderError?.(error);
    } finally {
      setSavingOrder(false);
    }
  };

  const moveRow = (section: RosterSection, id: string, direction: -1 | 1) => {
    const rows = section === 'active' ? orderedActive : orderedInactive;
    const from = rows.findIndex((row) => row.id === id);
    if (from < 0) return;
    let to = from + direction;
    while (to >= 0 && to < rows.length && rows[to].reorderable === false) to += direction;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[from], next[to]] = [next[to], next[from]];
    void Haptics.selectionAsync().catch(() => {});
    void commitOrder(section, next, rows);
  };

  const finishDrag = ({ data: nextData, from }: { data: ListItem<T>[]; from: number }) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const dragged = data[from];
    if (!dragged || dragged.kind !== 'row') return;
    const section = dragged.section;
    const previous = section === 'active' ? orderedActive : orderedInactive;
    const next = nextData
      .filter((item): item is Extract<ListItem<T>, { kind: 'row' }> => item.kind === 'row' && item.section === section)
      .map((item) => item.entry);
    void commitOrder(section, next, previous);
  };

  const header = (
    <>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: t.accent }]}>{eyebrow}</Text>
        <Text style={[styles.title, { color: t.ink }]}>{title}</Text>
        {hint ? <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text> : null}
      </View>
      {headerContent}
    </>
  );

  const renderListItem = ({ item, drag, isActive }: RenderItemParams<ListItem<T>>) => {
    if (item.kind === 'header') {
      const isInactive = item.section === 'inactive';
      const rows = isInactive ? orderedInactive : orderedActive;
      const description = isInactive ? inactiveDescription : activeDescription;
      return (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: t.ink }]}>{isInactive ? inactiveTitle : activeTitle}</Text>
            <Text style={[styles.sectionMeta, { color: t.muted }]}>{rows.length}</Text>
          </View>
          {description ? <Text style={[styles.sectionDescription, { color: t.muted }]}>{description}</Text> : null}
          {showReorderHint && canReorder && rows.filter((row) => row.reorderable !== false).length > 1 ? (
            <Text style={[styles.reorderHint, { color: t.muted }]}>
              {reorderControls === 'inline-handle'
                ? 'Hold the handle to reorder.'
                : Platform.OS === 'web'
                  ? 'Use the arrow controls to set the order.'
                  : 'Hold the grip to drag, or use the arrow controls.'}
            </Text>
          ) : null}
        </View>
      );
    }

    if (item.kind === 'empty') {
      return (
        <View style={[styles.emptyRow, { backgroundColor: t.surface, borderColor: t.line }]}>
          <Text style={[styles.emptyText, { color: t.muted }]}>{item.section === 'active' ? activeEmptyText : inactiveEmptyText}</Text>
        </View>
      );
    }

    const sectionRows = item.section === 'active' ? orderedActive : orderedInactive;
    const reorderableRows = sectionRows.filter((row) => row.reorderable !== false);
    const reorderIndex = reorderableRows.findIndex((row) => row.id === item.entry.id);
    const showReorderControl = canReorder && item.entry.reorderable !== false;
    const rowCanReorder = showReorderControl && reorderableRows.length > 1;
    const dragEnabled = rowCanReorder && Platform.OS !== 'web' && !savingOrder;
    const positionLabel = `Position ${reorderIndex + 1} of ${reorderableRows.length}`;
    const handleLabel = reorderAccessibilityLabel?.(item.entry) ?? 'Reorder member';
    const moveWithMenu = () => {
      Alert.alert(handleLabel, positionLabel, [
        ...(reorderIndex > 0
          ? [{ text: 'Move up', onPress: () => moveRow(item.section, item.entry.id, -1) }]
          : []),
        ...(reorderIndex < reorderableRows.length - 1
          ? [{ text: 'Move down', onPress: () => moveRow(item.section, item.entry.id, 1) }]
          : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    };
    const inlineHandle = showReorderControl && reorderControls === 'inline-handle'
      ? Platform.OS === 'web'
        ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={handleLabel}
              accessibilityHint={rowCanReorder ? 'Moves this member one position each time it is pressed.' : undefined}
              disabled={!rowCanReorder || savingOrder}
              onPress={() => moveRow(item.section, item.entry.id, reorderIndex < reorderableRows.length - 1 ? 1 : -1)}
              style={({ pressed }) => [
                styles.inlineHandle,
                { opacity: !rowCanReorder || savingOrder ? 0.35 : pressed ? 0.55 : 1 },
              ]}
            >
              <Text style={[styles.inlineHandleText, { color: t.muted }]}>⠿</Text>
            </Pressable>
          )
        : (
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel={handleLabel}
              accessibilityValue={{
                min: 1,
                max: reorderableRows.length,
                now: reorderIndex + 1,
                text: positionLabel,
              }}
              accessibilityActions={[
                ...(reorderIndex > 0 ? [{ name: 'decrement' as const, label: 'Move up' }] : []),
                ...(reorderIndex < reorderableRows.length - 1 ? [{ name: 'increment' as const, label: 'Move down' }] : []),
              ]}
              disabled={!dragEnabled}
              delayLongPress={180}
              onPress={moveWithMenu}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'decrement') moveRow(item.section, item.entry.id, -1);
                if (event.nativeEvent.actionName === 'increment') moveRow(item.section, item.entry.id, 1);
              }}
              onLongPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                drag();
              }}
              style={({ pressed }) => [
                styles.inlineHandle,
                { opacity: !rowCanReorder || savingOrder ? 0.35 : pressed || isActive ? 0.55 : 1 },
              ]}
            >
              <Text style={[styles.inlineHandleText, { color: t.muted }]}>⠿</Text>
            </Pressable>
          )
      : undefined;

    return (
      <View style={[styles.rosterRow, { opacity: isActive ? 0.92 : 1 }]}>
        <View style={styles.rowContent}>{renderRow(item.entry, inlineHandle)}</View>
        {rowCanReorder && reorderControls === 'rail' ? (
          <View style={[styles.orderRail, { backgroundColor: t.soft, borderColor: t.line }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Move up"
              disabled={savingOrder || reorderIndex <= 0}
              onPress={() => moveRow(item.section, item.entry.id, -1)}
              style={({ pressed }) => [styles.orderButton, { opacity: savingOrder || reorderIndex <= 0 ? 0.28 : pressed ? 0.55 : 1 }]}
            >
              <Text style={[styles.arrow, { color: t.ink }]}>↑</Text>
            </Pressable>
            {Platform.OS !== 'web' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Hold and drag to reorder. Position ${reorderIndex + 1} of ${reorderableRows.length}`}
                disabled={!dragEnabled}
                delayLongPress={180}
                onLongPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  drag();
                }}
                style={({ pressed }) => [styles.grip, { borderColor: t.line, opacity: pressed || isActive ? 0.55 : 1 }]}
              >
                <Text style={[styles.gripText, { color: t.muted }]}>≡</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Move down"
              disabled={savingOrder || reorderIndex >= reorderableRows.length - 1}
              onPress={() => moveRow(item.section, item.entry.id, 1)}
              style={({ pressed }) => [styles.orderButton, { opacity: savingOrder || reorderIndex >= reorderableRows.length - 1 ? 0.28 : pressed ? 0.55 : 1 }]}
            >
              <Text style={[styles.arrow, { color: t.ink }]}>↓</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const commonProps = {
    data,
    keyExtractor: (item: ListItem<T>) => item.key,
    ListHeaderComponent: header,
    showsVerticalScrollIndicator: false,
    contentContainerStyle: styles.content,
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.background }]}>
      {Platform.OS === 'web' ? (
        <FlatList
          {...commonProps}
          renderItem={({ item, index }) => renderListItem({ item, isActive: false, drag: () => {}, getIndex: () => index })}
        />
      ) : (
        <DraggableFlatList
          {...commonProps}
          renderItem={renderListItem}
          activationDistance={8}
          autoscrollSpeed={120}
          autoscrollThreshold={80}
          onDragEnd={finishDrag}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 108 },
  header: { marginBottom: 24 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2.6, textTransform: 'uppercase' },
  title: { marginTop: 12, fontFamily: fonts.display, fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  hint: { marginTop: 10, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  sectionHeader: { marginTop: 28, marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 18, letterSpacing: -0.3 },
  sectionMeta: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  sectionDescription: { marginTop: 5, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
  reorderHint: { marginTop: 7, fontFamily: fonts.bodyMedium, fontSize: 11.5, lineHeight: 17 },
  rosterRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 10 },
  rowContent: { flex: 1, minWidth: 0 },
  orderRail: { width: 42, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  orderButton: { width: 42, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontFamily: fonts.bodyBold, fontSize: 18 },
  grip: { width: 28, height: 30, borderTopWidth: 1, borderBottomWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gripText: { fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 22, transform: [{ rotate: '90deg' }] },
  inlineHandle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  inlineHandleText: { fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 22 },
  emptyRow: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 18, marginBottom: 10 },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});
