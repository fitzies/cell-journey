import { Alert, Pressable } from 'react-native';
import type { MemberActionsProps } from './member-actions.types';

export function MemberActions({ name, children, width, height, inactive, disabled, onChangeStatus, onRemove }: MemberActionsProps) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Actions for ${name}`}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={() => Alert.alert(name, undefined, [
      { text: inactive ? 'Reactivate' : 'Mark inactive', onPress: onChangeStatus },
      { text: 'Remove from group', style: 'destructive', onPress: onRemove },
      { text: 'Cancel', style: 'cancel' },
    ])}
    style={{ width, height, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
  >
    {children}
  </Pressable>;
}
