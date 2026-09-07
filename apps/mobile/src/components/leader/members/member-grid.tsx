import { ProfileAvatar } from '@/components/profile-avatar';
import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedRef, useReducedMotion, type AnimatedRef } from 'react-native-reanimated';
import Sortable, { type SortableGridDragEndParams, type SortableGridRenderItem } from 'react-native-sortables';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { getProfileDisplayName } from '@/lib/name';
import { MemberActions } from './member-actions';
import { memberStatus, type MemberSection, type MemberRow, type MemberStatus, type MemberView } from './types';

type MemberGridProps = {
  sections: MemberSection[];
  view: MemberView;
  header: ReactNode;
  disabled: boolean;
  canReorder: boolean;
  onReorder: (status: MemberStatus, rows: MemberRow[]) => Promise<void>;
  onChangeStatus: (row: MemberRow, status: MemberStatus) => void;
  onRemove: (row: MemberRow) => void;
  onViewProfile: (row: MemberRow) => void;
  revision: number;
  dragging: boolean;
  onDraggingChange: (dragging: boolean) => void;
};

export function MemberGrid({ sections, header, ...props }: MemberGridProps) {
  const t = useAppTheme();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  return <Animated.ScrollView ref={scrollRef} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    {header}
    {sections.map((section) => <View key={section.status} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: t.text }]}>{section.title}</Text>
        <Text style={[styles.sectionCount, { color: t.muted }]}>{section.rows.length === section.totalCount ? section.totalCount : `${section.rows.length} of ${section.totalCount}`}</Text>
      </View>
      {section.rows.length ? <MemberSectionGrid
        {...props}
        rows={section.rows}
        scrollRef={scrollRef}
        canReorder={props.canReorder && section.rows.length > 1}
        onReorder={(rows) => props.onReorder(section.status, rows)}
      /> : <Text style={[styles.emptyMessage, { color: t.muted }]}>{section.emptyMessage}</Text>}
    </View>)}
  </Animated.ScrollView>;
}

function MemberSectionGrid({ rows, view, disabled, canReorder, onReorder, onChangeStatus, onRemove, onViewProfile, onDraggingChange, revision, dragging, scrollRef }: Omit<MemberGridProps, 'sections' | 'header' | 'onReorder'> & {
  rows: MemberRow[];
  scrollRef: AnimatedRef<Animated.ScrollView>;
  onReorder: (rows: MemberRow[]) => Promise<void>;
}) {
  const t = useAppTheme();
  const { fontScale, width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const dragStarted = useRef(false);
  useLayoutEffect(() => { dragStarted.current = false; }, [revision]);
  const isList = view === 'list';
  const avatarSize = isList ? 44 : 64;
  const columns = isList || fontScale > 1.4 || width < 340 ? 1 : 2;
  const itemWidth = (width - 40 - (columns - 1) * 12) / columns;
  const nameWidth = isList ? itemWidth - avatarSize - 12 : itemWidth;
  const nameHeight = Math.max(44, 44 * fontScale);

  const finishDrag = useCallback(({ data }: SortableGridDragEndParams<MemberRow>) => {
    onDraggingChange(false);
    if (!dragStarted.current) return;
    dragStarted.current = false;
    void onReorder(data);
  }, [onDraggingChange, onReorder]);

  const renderItem = useCallback<SortableGridRenderItem<MemberRow>>(({ item, index }) => {
    const name = getProfileDisplayName(item.profile, 'Unnamed member');
    const move = (offset: number) => {
      if (!canReorder || disabled || dragging) return;
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= rows.length) return;
      const next = [...rows];
      next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      void onReorder(next);
    };
    return <View style={[isList ? styles.row : styles.tile, { backgroundColor: t.background }, isList && { borderBottomColor: t.soft }]}>
      <Sortable.Handle style={{ width: avatarSize, height: avatarSize }}>
        <View
          accessible={canReorder && !disabled}
          accessibilityLabel={`Reorder ${name}`}
          accessibilityHint="Hold and drag the avatar to rearrange. Tap the name for member actions."
          accessibilityRole="adjustable"
          accessibilityValue={{ min: 1, max: rows.length, now: index + 1, text: `Position ${index + 1} of ${rows.length}` }}
          accessibilityActions={[
            ...(canReorder && !disabled && !dragging && index > 0 ? [{ name: 'decrement', label: 'Move earlier' }] : []),
            ...(canReorder && !disabled && !dragging && index < rows.length - 1 ? [{ name: 'increment', label: 'Move later' }] : []),
          ]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'decrement') move(-1);
            if (nativeEvent.actionName === 'increment') move(1);
          }}
          style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, backgroundColor: t.soft }]}
        ><ProfileAvatar photoUrl={item.profile?.photoUrl} name={name} size={avatarSize} /></View>
      </Sortable.Handle>
      <MemberActions
        name={name}
        width={nameWidth}
        height={nameHeight}
        status={memberStatus(item)}
        disabled={disabled || dragging}
        onChangeStatus={(status) => onChangeStatus(item, status)}
        onRemove={() => onRemove(item)}
        onViewProfile={() => onViewProfile(item)}
      >
        <View style={[styles.nameButton, isList && styles.rowName, { width: nameWidth, height: nameHeight }]}>
          <Text numberOfLines={2} style={[styles.name, isList && styles.rowText, { color: t.text }]}>{name}</Text>
        </View>
      </MemberActions>
    </View>;
  }, [canReorder, disabled, dragging, onChangeStatus, onReorder, onRemove, onViewProfile, rows, t, isList, avatarSize, nameWidth, nameHeight]);

  return <Sortable.Grid
      // Reattach drag handlers on focus without remounting the ScrollView.
      key={revision}
      data={rows}
      renderItem={renderItem}
      keyExtractor={(row) => row.membership._id}
      columns={columns}
      rowGap={isList ? 0 : 16}
      columnGap={12}
      customHandle
      sortEnabled={canReorder && !disabled}
      dragActivationDelay={350}
      dragActivationFailOffset={8}
      strategy="insert"
      overDrag="vertical"
      scrollableRef={scrollRef}
      autoScrollActivationOffset={60}
      hapticsEnabled
      activeItemScale={reducedMotion ? 1 : 1.06}
      inactiveItemOpacity={1}
      activeItemShadowOpacity={0.12}
      activationAnimationDuration={reducedMotion ? 0 : 160}
      dropAnimationDuration={reducedMotion ? 0 : 180}
      onDragStart={() => {
        dragStarted.current = true;
        onDraggingChange(true);
        AccessibilityInfo.announceForAccessibility('Member picked up. Drag to rearrange.');
      }}
      onDragEnd={finishDrag}
    />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 110 },
  section: { marginTop: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  sectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 18, lineHeight: 24 },
  sectionCount: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  emptyMessage: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  tile: { minHeight: 148, alignItems: 'center', borderRadius: radius.lg, paddingTop: 16, paddingBottom: 12 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  nameButton: { minHeight: 44, width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  rowName: { alignItems: 'flex-start', paddingTop: 0 },
  rowText: { textAlign: 'left', paddingHorizontal: 0 },
  name: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, letterSpacing: 0.3, textAlign: 'center', paddingHorizontal: 10 },
});
