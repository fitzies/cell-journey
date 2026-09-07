import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { leaderAccessLabel, useGroups } from '@/components/group-context';
import { SolarIcon } from '@/components/solar-tab-icon';
import { fonts, radius, surfaceShadow, useAppTheme } from '@/constants/tokens';
import type { Id } from '@/lib/api';
import { memberMenuSections } from './leader/members/menu-options';
import type { MembersOptions } from './leader/members/types';
import type { AppHeaderProps, AppMode } from './app-header.types';
export type { AppHeaderProps, AppMode } from './app-header.types';

export function AppHeader({ title, mode, eventActions, membersOptions }: AppHeaderProps) {
  const t = useAppTheme();

  return (
    <Stack.Screen
      options={{
        headerShown: true,
        title,
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: t.background },
        headerTintColor: t.ink,
        headerTitleAlign: 'left',
        headerTitleStyle: { color: t.ink, fontFamily: 'system-ui', fontWeight: '600', fontSize: 22 },
        headerRight: () => (
          <View style={styles.actions}>
            {eventActions?.onCreate || eventActions?.onImport ? <EventMenuButton actions={eventActions} /> : null}
            {membersOptions ? <MembersMenuButton options={membersOptions} /> : null}
            <ContextMenuButton mode={mode} />
          </View>
        ),
      }}
    />
  );
}

function MembersMenuButton({ options }: { options: MembersOptions }) {
  const t = useAppTheme();
  return (
    <details
      style={{ position: 'relative', fontFamily: 'system-ui', fontSize: 14 }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary
        aria-label="Member view and filters"
        aria-disabled={options.disabled}
        onClick={(event) => { if (options.disabled) event.preventDefault(); }}
        style={{ listStyle: 'none', cursor: options.disabled ? 'default' : 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: options.disabled ? 0.45 : 1 }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M6 12h12M9 18h6" /></svg>
      </summary>
      <div style={{ position: 'absolute', top: 44, right: 0, width: 240, maxHeight: '70vh', overflowY: 'auto', borderRadius: 12, padding: 8, background: t.surface, boxShadow: '0 6px 24px #0002' }}>
        {memberMenuSections(options).map((section) => (
          <fieldset key={section.title} disabled={options.disabled} style={{ border: 0, margin: 0, padding: '8px 0' }}>
            <legend style={{ color: t.muted, fontSize: 12, padding: '0 10px' }}>{section.title}</legend>
            {section.items.map((item) => (
              <label key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 10px', color: t.ink, cursor: 'pointer' }}>
                <input type="radio" name={`member-${section.title}`} checked={item.selected} onChange={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open');
                  item.onPress();
                }} style={{ accentColor: t.ink }} />
                {item.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </details>
  );
}

function EventMenuButton({ actions }: { actions: NonNullable<AppHeaderProps['eventActions']> }) {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <View style={styles.menuAnchor}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add events"
        accessibilityState={{ expanded: open, disabled: actions.disabled }}
        disabled={actions.disabled}
        onPress={() => setOpen((value) => !value)}
        style={[styles.iconButton, { opacity: actions.disabled ? 0.45 : 1 }]}
      >
        <Text style={{ color: t.ink, fontSize: 26 }}>+</Text>
      </Pressable>
      {open ? (
        <View accessibilityRole="menu" style={[styles.menu, surfaceShadow(t), { backgroundColor: t.surface }]}>
          {actions.onCreate ? <Pressable accessibilityRole="menuitem" style={styles.menuItem} onPress={() => run(actions.onCreate!)}><Text style={[styles.menuText, { color: t.ink }]}>Create event</Text></Pressable> : null}
          {actions.onImport ? <Pressable accessibilityRole="menuitem" style={styles.menuItem} onPress={() => run(actions.onImport!)}><Text style={[styles.menuText, { color: t.ink }]}>Import CSV / XLSX</Text></Pressable> : null}
        </View>
      ) : null}
    </View>
  );
}

function ContextMenuButton({ mode }: { mode: AppMode }) {
  const t = useAppTheme();
  const groups = useGroups();
  const [open, setOpen] = useState(false);
  const canSwitch = groups.memberGroups.length + groups.ledGroups.length > 1;

  const select = (nextMode: AppMode, groupId: Id<'groups'>) => {
    setOpen(false);
    if (nextMode === 'member') {
      groups.selectMemberGroup(groupId);
      if (mode !== 'member') router.replace('/(member-tabs)/home');
    } else {
      groups.selectLeaderGroup(groupId);
      if (mode !== 'leader') router.replace('/(leader-tabs)/home');
    }
  };

  if (!canSwitch) return null;

  return (
    <View style={styles.menuAnchor}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch group or mode"
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        onPress={() => setOpen((value) => !value)}
        style={styles.iconButton}
      >
        <SolarIcon name="transfer-horizontal-linear" color={t.strong} />
      </Pressable>
      {open ? (
        <View accessibilityRole="menu" style={[styles.menu, surfaceShadow(t), { backgroundColor: t.surface }]}>
          {groups.memberGroups.length ? <Text style={[styles.menuLabel, { color: t.muted }]}>Member</Text> : null}
          {groups.memberGroups.map(({ group }) => {
            const selected = mode === 'member' && group._id === groups.selectedMemberGroupId;
            return (
              <Pressable key={group._id} accessibilityRole="menuitem" accessibilityState={{ selected }} onPress={() => select('member', group._id)} style={styles.menuItem}>
                <Text style={[styles.menuText, { color: t.ink }]}>{group.name}</Text>
                {selected ? <Text style={[styles.check, { color: t.ink }]}>✓</Text> : null}
              </Pressable>
            );
          })}
          {groups.ledGroups.length ? <Text style={[styles.menuLabel, { color: t.muted }]}>Leader</Text> : null}
          {groups.ledGroups.map((group) => {
            const selected = mode === 'leader' && group._id === groups.selectedLeaderGroupId;
            return (
              <Pressable key={group._id} accessibilityRole="menuitem" accessibilityState={{ selected }} onPress={() => select('leader', group._id)} style={styles.menuItem}>
                <Text style={[styles.menuText, { color: t.ink }]}>{group.name} · {leaderAccessLabel(group.accessRole)}</Text>
                {selected ? <Text style={[styles.check, { color: t.ink }]}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuAnchor: { position: 'relative' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menu: { position: 'absolute', top: 44, right: 0, width: 260, borderRadius: radius.md, padding: 8, shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 18 },
  menuLabel: { marginTop: 8, marginBottom: 4, paddingHorizontal: 10, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  menuItem: { minHeight: 42, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14 },
  check: { fontFamily: fonts.bodyBold, fontSize: 14 },
});
