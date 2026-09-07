import { Alert, Pressable } from 'react-native';
import type { MemberActionsProps } from './member-actions.types';

export function MemberActions({ name, children, width, height, status, disabled, onViewProfile, onChangeStatus, onRemove }: MemberActionsProps) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Actions for ${name}`}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={() => Alert.alert(name, undefined, [
      { text: 'View profile', onPress: onViewProfile },
      { text: 'Change status', onPress: () => Alert.alert('Member status', undefined, [
        ...(['active', 'inactive', 'visitor'] as const).filter((value) => value !== status).map((value) => ({ text: value === 'visitor' ? 'Mark as visitor' : `Mark ${value}`, onPress: () => onChangeStatus(value) })),
        { text: 'Cancel', style: 'cancel' },
      ]) },
      { text: 'Remove from group', style: 'destructive', onPress: onRemove },
    ], { cancelable: true })}
    style={{ width, height, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
  >
    {children}
  </Pressable>;
}
