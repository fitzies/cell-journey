import { MenuView, type MenuAction, type MenuComponentRef } from '@expo/ui/community/menu';
import { useRef } from 'react';
import { Pressable, View } from 'react-native';
import type { ProfileGroupMenuProps } from './profile-group-menu';

export function ProfileGroupMenu(props: ProfileGroupMenuProps) {
  const menuRef = useRef<MenuComponentRef>(null);
  const selected = props.entries.find(entry => entry.id === props.selectedId && entry.mode === props.mode);
  const actions: MenuAction[] = (['member', 'leader'] as const).flatMap(mode => {
    const entries = props.entries.filter(entry => entry.mode === mode);
    if (!entries.length) return [];
    return [{
      id: `section:${mode}`,
      title: mode === 'member' ? 'Member' : 'Leader',
      displayInline: true,
      subactions: [
        // Material inline sections omit their title, so include a disabled label.
        { id: `label:${mode}`, title: mode === 'member' ? 'Member' : 'Leader', attributes: { disabled: true } },
        ...entries.map((entry): MenuAction => ({
          id: `${entry.mode}:${entry.id}`,
          title: entry.mode === 'leader' && entry.role ? `${entry.name} · ${entry.role}` : entry.name,
          state: entry.id === props.selectedId && entry.mode === props.mode ? 'on' : 'off',
          attributes: { disabled: props.disabled },
        })),
      ],
    }];
  });
  if (props.onLeave && selected) {
    actions.push({ id: 'leave', title: `Leave ${selected.name}`, attributes: { destructive: true, disabled: props.disabled } });
  }

  // MenuView's outer Android trigger has no disabled prop. Remove that trigger
  // while busy so neither touch nor accessibility can open a stale menu.
  if (props.disabled) {
    return <View accessible accessibilityRole="button" accessibilityLabel="Switch group or mode" accessibilityState={{ disabled: true }}>
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {props.children}
      </View>
    </View>;
  }

  return (
    <MenuView
      ref={menuRef}
      actions={actions}
      style={{ alignSelf: 'stretch' }}
      onPressAction={({ nativeEvent }) => {
        if (props.disabled) return;
        if (nativeEvent.event === 'leave') {
          props.onLeave?.();
          return;
        }
        const entry = props.entries.find(item => `${item.mode}:${item.id}` === nativeEvent.event);
        if (entry) props.onSelect(entry);
      }}
    >
      <Pressable
        accessibilityLabel={`Switch group or mode${selected ? `, ${selected.name}, ${selected.role}` : ''}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: props.disabled }}
        disabled={props.disabled}
        onPress={() => menuRef.current?.show()}
      >
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {props.children}
        </View>
      </Pressable>
    </MenuView>
  );
}
