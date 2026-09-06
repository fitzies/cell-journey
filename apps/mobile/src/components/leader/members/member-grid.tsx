import { ProfileAvatar } from '@/components/profile-avatar';
import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedRef, useReducedMotion } from 'react-native-reanimated';
import Sortable, { type SortableGridDragEndParams, type SortableGridRenderItem } from 'react-native-sortables';
import { fonts, radius, useAppTheme } from '@/constants/tokens';
import { getProfileDisplayName } from '@/lib/name';
import { MemberActions } from './member-actions';
import type { MemberRow } from './types';

export function MemberGrid({ rows, header, emptyState, disabled, canReorder, onReorder, onChangeStatus, onRemove, onDraggingChange }: {
  rows: MemberRow[];
  header: ReactNode;
  emptyState: ReactNode;
  disabled: boolean;
  canReorder: boolean;
  onReorder: (rows: MemberRow[]) => Promise<void>;
  onChangeStatus: (row: MemberRow) => void;
  onRemove: (row: MemberRow) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const t = useAppTheme();
  const { fontScale, width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [dragging, setDragging] = useState(false);
  const dragStarted = useRef(false);
  const columns = fontScale > 1.4 || width < 340 ? 1 : 2;
  const itemWidth = (width - 40 - (columns - 1) * 12) / columns;
  const nameHeight = Math.max(44, 44 * fontScale);

  const finishDrag = useCallback(({ data }: SortableGridDragEndParams<MemberRow>) => {
    setDragging(false);
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
    return <View style={[styles.tile, { backgroundColor: t.background }]}>
      <Sortable.Handle style={styles.avatarHandle}>
        <View
          accessible
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
          style={[styles.avatar, { backgroundColor: t.soft }]}
        ><ProfileAvatar photoUrl={item.profile?.photoUrl} name={name} size={64} /></View>
      </Sortable.Handle>
      <MemberActions
        name={name}
        width={itemWidth}
        height={nameHeight}
        inactive={item.membership.status === 'inactive'}
        disabled={disabled || dragging}
        onChangeStatus={() => onChangeStatus(item)}
        onRemove={() => onRemove(item)}
      >
        <View style={[styles.nameButton, { width: itemWidth, height: nameHeight }]}>
          <Text numberOfLines={2} style={[styles.name, { color: t.text }]}>{name}</Text>
        </View>
      </MemberActions>
    </View>;
  }, [canReorder, disabled, dragging, onChangeStatus, onReorder, onRemove, rows, t, itemWidth, nameHeight]);

  return <Animated.ScrollView ref={scrollRef} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    {header}
    {rows.length ? <Sortable.Grid
      data={rows}
      renderItem={renderItem}
      keyExtractor={(row) => row.membership._id}
      columns={columns}
      rowGap={16}
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
        setDragging(true);
        onDraggingChange(true);
        AccessibilityInfo.announceForAccessibility('Member picked up. Drag to rearrange.');
      }}
      onDragEnd={finishDrag}
    /> : emptyState}
  </Animated.ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 110 },
  tile: { minHeight: 148, alignItems: 'center', borderRadius: radius.lg, paddingTop: 16, paddingBottom: 12 },
  avatarHandle: { width: 64, height: 64 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.bodySemiBold, fontSize: 22, letterSpacing: -0.7 },
  nameButton: { minHeight: 44, width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  name: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, letterSpacing: 0.3, textAlign: 'center', paddingHorizontal: 10 },
  empty: { paddingVertical: 40, textAlign: 'center', fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20 },
});
