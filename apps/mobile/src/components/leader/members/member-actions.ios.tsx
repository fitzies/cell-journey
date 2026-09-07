import { Button, Divider, Host, Menu, RNHostView } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, disabled } from '@expo/ui/swift-ui/modifiers';
import { useColorScheme } from 'react-native';
import { useAppTheme } from '@/constants/tokens';
import type { MemberActionsProps } from './member-actions.types';

export function MemberActions({ name, children, width, height, status, disabled: isDisabled, onViewProfile, onChangeStatus, onRemove }: MemberActionsProps) {
  const t = useAppTheme();
  const scheme = useColorScheme();
  return (
    <Host style={{ width, height }} colorScheme={scheme === 'dark' ? 'dark' : 'light'} seedColor={t.strong}>
      <Menu
        label={<RNHostView matchContents>{children}</RNHostView>}
        modifiers={[buttonStyle('plain'), disabled(isDisabled), accessibilityLabel(`Actions for ${name}`)]}
      >
        <Button label="View profile" systemImage="person.crop.circle" onPress={onViewProfile} />
        <Divider />
        {status !== 'active' ? <Button label="Mark active" systemImage="person.badge.plus" onPress={() => onChangeStatus('active')} /> : null}
        {status !== 'inactive' ? <Button label="Mark inactive" systemImage="person.crop.circle.badge.minus" onPress={() => onChangeStatus('inactive')} /> : null}
        {status !== 'visitor' ? <Button label="Mark as visitor" systemImage="person.crop.circle.badge.questionmark" onPress={() => onChangeStatus('visitor')} /> : null}
        <Divider />
        <Button label="Remove from group" systemImage="person.crop.circle.badge.xmark" role="destructive" onPress={onRemove} />
      </Menu>
    </Host>
  );
}
