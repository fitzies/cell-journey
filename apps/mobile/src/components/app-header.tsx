import { router, Stack } from 'expo-router';
import { Platform } from 'react-native';
import { leaderAccessLabel, useGroups } from '@/components/group-context';
import { useAppTheme } from '@/constants/tokens';
import { memberMenuSections } from './leader/members/menu-options';
import type { AppHeaderProps } from './app-header.types';
export type { AppHeaderProps, AppMode } from './app-header.types';

const switcherIcon = require('@/assets/images/toolbar/transfer-horizontal-linear.png');

export function AppHeader({ title, mode, profile = false, eventActions, membersOptions }: AppHeaderProps) {
  const t = useAppTheme();

  return (
    <>
      <Stack.Screen options={{ headerShown: true }} />
      <Stack.Header
        style={{ backgroundColor: t.background, color: t.ink, shadowColor: 'transparent' }}
      />
      <Stack.Title style={{ color: t.ink, fontSize: 22, fontWeight: '600', textAlign: 'left' }}>{title}</Stack.Title>
      {profile ? <Stack.Screen.BackButton displayMode="minimal" /> : null}
      <ContextToolbar mode={mode} eventActions={eventActions} membersOptions={membersOptions} />
    </>
  );
}

function ContextToolbar({ mode, eventActions, membersOptions }: Pick<AppHeaderProps, 'mode' | 'eventActions' | 'membersOptions'>) {
  const groups = useGroups();
  const t = useAppTheme();
  const canSwitch = groups.memberGroups.length + groups.ledGroups.length > 1;

  const hasEventActions = Boolean(eventActions?.onCreate || eventActions?.onImport);
  if (!canSwitch && !hasEventActions && !membersOptions) return null;

  return (
    <Stack.Toolbar placement="right" tintColor={t.ink}>
      {eventActions?.onCreate || eventActions?.onImport ? (
        <Stack.Toolbar.Menu
          accessibilityLabel="Add events"
          title="Add events"
          icon={require('@/assets/images/toolbar/plus.png')}
          iconRenderingMode="template"
          disabled={eventActions.disabled}
        >
          {eventActions.onCreate ? <Stack.Toolbar.MenuAction onPress={eventActions.onCreate}>Create event</Stack.Toolbar.MenuAction> : null}
          {eventActions.onImport ? <Stack.Toolbar.MenuAction onPress={eventActions.onImport}>Import CSV / XLSX</Stack.Toolbar.MenuAction> : null}
        </Stack.Toolbar.Menu>
      ) : null}
      {membersOptions ? (
        <Stack.Toolbar.Menu
          accessibilityLabel="Member view and filters"
          title="Member view and filters"
          icon={require('@/assets/images/toolbar/filter.png')}
          iconRenderingMode="template"
          disabled={membersOptions.disabled}
        >
          {memberMenuSections(membersOptions).map((section) => (
            <Stack.Toolbar.Menu key={section.title} inline title={section.title}>
              {section.items.map((item) => (
                <Stack.Toolbar.MenuAction key={item.label} isOn={item.selected} onPress={item.onPress}>
                  {item.label}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          ))}
        </Stack.Toolbar.Menu>
      ) : null}
      {canSwitch ? <Stack.Toolbar.Menu
        accessibilityLabel="Switch group or mode"
        icon={switcherIcon}
        iconRenderingMode="template"
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
                {Platform.OS === 'android' ? `Member · ${group.name}` : group.name}
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
                {Platform.OS === 'android'
                  ? `Leader · ${group.name} · ${leaderAccessLabel(group.accessRole)}`
                  : group.name}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        ) : null}
      </Stack.Toolbar.Menu> : null}
    </Stack.Toolbar>
  );
}
