import { Button, Divider, Host, Menu, RNHostView } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, disabled } from '@expo/ui/swift-ui/modifiers';
import { useColorScheme } from 'react-native';
import { useAppTheme } from '@/constants/tokens';
import type { MemberActionsProps } from './member-actions.types';

export function MemberActions({ name, children, width, height, inactive, disabled: isDisabled, onChangeStatus, onRemove }: MemberActionsProps) {
  const t = useAppTheme();
  const scheme = useColorScheme();
  return (
    <Host style={{ width, height }} colorScheme={scheme === 'dark' ? 'dark' : 'light'} seedColor={t.strong}>
      <Menu
        label={<RNHostView matchContents>{children}</RNHostView>}
        modifiers={[buttonStyle('plain'), disabled(isDisabled), accessibilityLabel(`Actions for ${name}`)]}
      >
        <Button
          label={inactive ? 'Reactivate' : 'Mark inactive'}
          systemImage={inactive ? 'person.badge.plus' : 'person.crop.circle.badge.minus'}
          onPress={onChangeStatus}
        />
        <Divider />
        <Button label="Remove from group" systemImage="person.crop.circle.badge.xmark" role="destructive" onPress={onRemove} />
      </Menu>
    </Host>
  );
}
