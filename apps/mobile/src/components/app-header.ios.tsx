import { router, Stack } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { leaderAccessLabel, useGroups } from '@/components/group-context';
import { useAppTheme } from '@/constants/tokens';

import type { AppHeaderProps } from './app-header.types';
export type { AppHeaderProps, AppMode } from './app-header.types';

export function AppHeader({ title, mode, profile = false, eventActions }: AppHeaderProps) {
  const t = useAppTheme();
  const isTabTitle = !profile && ['Home', 'Attendance', 'Events', 'Members', 'Profile'].includes(title);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <Stack.Header
        style={{ backgroundColor: t.background, color: t.ink, shadowColor: 'transparent' }}
      />
      {isTabTitle ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.View hidesSharedBackground>
            <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: t.ink }]}>{title}</Text>
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      ) : null}
      {profile ? <Stack.Screen.BackButton displayMode="minimal" /> : null}
      <ContextToolbar mode={mode} eventActions={eventActions} />
    </>
  );
}

const styles = StyleSheet.create({
  // Leaving fontFamily unset uses SF Pro and its native semibold weight.
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.7 },
});

function ContextToolbar({ mode, eventActions }: Pick<AppHeaderProps, 'mode' | 'eventActions'>) {
  const groups = useGroups();
  const t = useAppTheme();
  const canSwitch = groups.memberGroups.length + groups.ledGroups.length > 1;

  const hasEventActions = Boolean(eventActions?.onCreate || eventActions?.onImport);
  if (!canSwitch && !hasEventActions) return null;

  return (
    <Stack.Toolbar placement="right" tintColor={t.ink}>
      {eventActions?.onCreate || eventActions?.onImport ? (
        <Stack.Toolbar.Menu
          accessibilityLabel="Add events"
          title="Add events"
          icon="plus"
          separateBackground
          disabled={eventActions.disabled}
        >
          {eventActions.onCreate ? <Stack.Toolbar.MenuAction onPress={eventActions.onCreate}>Create event</Stack.Toolbar.MenuAction> : null}
          {eventActions.onImport ? <Stack.Toolbar.MenuAction onPress={eventActions.onImport}>Import CSV / XLSX</Stack.Toolbar.MenuAction> : null}
        </Stack.Toolbar.Menu>
      ) : null}
      {canSwitch ? <Stack.Toolbar.Menu
        accessibilityLabel="Switch group or mode"
        icon="person.2.fill"
        separateBackground
        title="Switch group or mode"
      >
        {groups.memberGroups.length ? (
          <Stack.Toolbar.Menu inline title="Member">
            {groups.memberGroups.map(({ group }) => (
              <Stack.Toolbar.MenuAction
                key={`member:${group._id}`}
                isOn={mode === 'member' && group._id === groups.selectedMemberGroupId}
                onPress={() => {
                  groups.selectMemberGroup(group._id);
                  if (mode !== 'member') router.replace('/(member-tabs)/home');
                }}
              >
                {group.name}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        ) : null}
        {groups.ledGroups.length ? (
          <Stack.Toolbar.Menu inline title="Leader">
            {groups.ledGroups.map((group) => (
              <Stack.Toolbar.MenuAction
                key={`leader:${group._id}`}
                isOn={mode === 'leader' && group._id === groups.selectedLeaderGroupId}
                onPress={() => {
                  groups.selectLeaderGroup(group._id);
                  if (mode !== 'leader') router.replace('/(leader-tabs)/home');
                }}
                subtitle={leaderAccessLabel(group.accessRole)}
              >
                {group.name}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        ) : null}
      </Stack.Toolbar.Menu> : null}
    </Stack.Toolbar>
  );
}
