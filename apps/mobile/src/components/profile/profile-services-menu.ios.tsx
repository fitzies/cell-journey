import { Host, Menu, RNHostView, Toggle } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled } from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import type { ProfileServicesMenuProps } from './profile-services-menu';

export function ProfileServicesMenu(props: ProfileServicesMenuProps) {
  return <Host matchContents={{ vertical: true }} style={{ alignSelf: 'stretch' }} ignoreSafeArea="all">
    <Menu modifiers={[disabled(props.disabled), accessibilityLabel(`Services, ${props.services.filter(service => props.selectedIds.includes(service._id)).map(service => service.name).join(', ') || 'Not set'}`)]} label={
      <RNHostView matchContents><View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{props.children}</View></RNHostView>
    }>
      {props.services.map(service => <Toggle key={service._id} label={service.name}
        isOn={props.selectedIds.includes(service._id)}
        modifiers={[disabled(props.disabled || (props.selectedIds.length === 1 && props.selectedIds.includes(service._id)))]}
        onIsOnChange={() => props.onToggle(service._id)} />)}
    </Menu>
  </Host>;
}
