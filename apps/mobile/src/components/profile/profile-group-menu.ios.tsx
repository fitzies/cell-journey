import { Button, Host, Menu, RNHostView, Section, Toggle } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled } from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import type { ProfileGroupMenuProps } from './profile-group-menu';

export function ProfileGroupMenu(props: ProfileGroupMenuProps) {
  const selected = props.entries.find(entry => entry.id === props.selectedId && entry.mode === props.mode);
  return (
    <Host matchContents={{ vertical: true }} style={{ alignSelf: 'stretch' }} ignoreSafeArea="all">
      <Menu
        modifiers={[
          disabled(props.disabled),
          accessibilityLabel(`Switch group or mode${selected ? `, ${selected.name}, ${selected.role}` : ''}`),
        ]}
        label={(
          <RNHostView matchContents>
            <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {props.children}
            </View>
          </RNHostView>
        )}
      >
        {(['member', 'leader'] as const).map(mode => {
          const entries = props.entries.filter(entry => entry.mode === mode);
          return entries.length ? (
            <Section key={mode} title={mode === 'member' ? 'Member' : 'Leader'}>
              {entries.map(entry => (
                <Toggle
                  key={`${entry.mode}:${entry.id}`}
                  label={entry.mode === 'leader' && entry.role ? `${entry.name} · ${entry.role}` : entry.name}
                  isOn={entry.id === props.selectedId && entry.mode === props.mode}
                  modifiers={[disabled(props.disabled)]}
                  onIsOnChange={() => { if (!props.disabled) props.onSelect(entry); }}
                />
              ))}
            </Section>
          ) : null;
        })}
        {props.onLeave && selected ? (
          <Section>
            <Button
              label={`Leave ${selected.name}`}
              role="destructive"
              modifiers={[disabled(props.disabled)]}
              onPress={() => { if (!props.disabled) props.onLeave?.(); }}
            />
          </Section>
        ) : null}
      </Menu>
    </Host>
  );
}
