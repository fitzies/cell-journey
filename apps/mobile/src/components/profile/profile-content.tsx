import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import type { ProfileField } from './profile-field-model';
import { ProfileServicesMenu, type ProfileServicesMenuProps } from './profile-services-menu';
import { ProfileGroupMenu, type ProfileGroupMenuProps } from './profile-group-menu';

export type ProfileContentProps = {
  displayName: string;
  fullName?: string;
  email: string | null;
  groupSummary: ProfileGroupSummaryData | null;
  photoUrl?: string | null;
  uploadingPhoto?: boolean;
  onPhoto: () => void;
  onDeleteAccount: () => void;
  roleLabel: string;
  serviceNames: string[];
  locationTitle: string;
  locationSubtitle: string;
  groupName: string | null;
  groupRoleLabel: string;
  groupCount: number;
  mode: 'member' | 'leader';
  pendingCount: number;
  busy: boolean;
  canEdit: boolean;
  onEdit: (field: ProfileField) => void;
  serviceMenu: Omit<ProfileServicesMenuProps, 'children' | 'disabled'>;
  groupMenu: Omit<ProfileGroupMenuProps, 'children' | 'disabled'>;
  onGroups: () => void;
  onJoin: () => void;
  onPending: () => void;
  onSignOut: () => void;
};

const icons = {
  name: { ios: 'person', android: 'person_outline', web: 'person_outline' },
  photo: { ios: 'photo', android: 'photo', web: 'photo' },
  services: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  groups: { ios: 'person.2', android: 'group', web: 'group' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  join: { ios: 'plus', android: 'add', web: 'add' },
  pending: { ios: 'clock', android: 'schedule', web: 'schedule' },
  signOut: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  deleteAccount: { ios: 'trash', android: 'delete_outline', web: 'delete_outline' },
} as const;

function ProfileIcon({ name, size = 19 }: { name: SymbolViewProps['name']; size?: number }) {
  const t = useAppTheme();
  return <SymbolView name={name} size={size} tintColor={t.strong} />;
}

export function ProfileRow({ icon, title, detail, count, disabled = false, onPress, divider = true, destructive = false, actionIcon = icons.chevron }: {
  icon: SymbolViewProps['name']; title: string; detail?: string; count?: number;
  disabled?: boolean; onPress?: () => void; divider?: boolean; destructive?: boolean;
  actionIcon?: SymbolViewProps['name'];
}) {
  const t = useAppTheme();
  const content = <>
    <ProfileIcon name={icon} />
    <View style={styles.flex}>
      <Text style={[textStyles.button, { color: destructive ? t.danger : t.text }]}>{title}</Text>
      {detail ? <Text style={[textStyles.body, styles.rowDetail, { color: t.muted }]}>{detail}</Text> : null}
    </View>
    {count !== undefined ? <Text style={[textStyles.body, styles.badge, { color: t.text, backgroundColor: t.soft }]}>{count}</Text> : onPress ? <ProfileIcon name={actionIcon} size={12} /> : null}
  </>;
  return <View>
    {onPress ? <Pressable accessibilityRole="button" accessibilityLabel={[title, detail, count].filter((value) => value !== undefined).join(', ')}
      accessibilityState={{ disabled }} aria-disabled={disabled} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}>
      {content}
    </Pressable> : <View accessible accessibilityLabel={[title, detail].filter(Boolean).join(', ')} style={styles.row}>{content}</View>}
    {divider ? <View style={[styles.divider, { backgroundColor: t.track }]} /> : null}
  </View>;
}

export function ProfileEmailRow({ email }: { email: string | null }) {
  return <ProfileRow icon={{ ios: 'envelope', android: 'mail_outline', web: 'mail_outline' }} title="Email" detail={email || 'Not set'}
    actionIcon={{ ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }}
    onPress={email ? () => {
      void Linking.openURL(`mailto:${encodeURIComponent(email)}`).catch(() => Alert.alert('Couldn’t open email', 'Set up a mail app on your device, then try again.'));
    } : undefined} />;
}

type ProfileGroupSummaryData = {
  joinedAt: number;
  attendanceRate: number | null;
  presentEvents: number;
  totalPastEvents: number;
};

export function ProfileGroupSummary({ groupName, summary }: { groupName: string; summary: ProfileGroupSummaryData }) {
  const t = useAppTheme();
  const joined = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' }).format(summary.joinedAt);
  const attendance = summary.attendanceRate === null ? 'No past events yet'
    : `${Math.round(summary.attendanceRate * 100)}% · ${summary.presentEvents} of ${summary.totalPastEvents} past events`;
  return <View style={styles.membershipSummary}>
    <Text accessibilityRole="header" style={[textStyles.section, { color: t.text }]}>{groupName}</Text>
    <ProfileRow icon={{ ios: 'calendar.badge.plus', android: 'event', web: 'event' }} title="Joined group" detail={joined} />
    <ProfileRow icon={{ ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' }} title="Attendance rate" detail={attendance} divider={false} />
  </View>;
}

export function ProfileIdentity({ displayName, photoUrl, subtitle }: { displayName: string; photoUrl?: string | null; subtitle: string }) {
  const t = useAppTheme();
  const initials = displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? '').join('') || 'CJ';
  return (
    <View style={styles.identity}>
      <View accessible={false} style={[styles.avatar, { backgroundColor: t.soft, ...surfaceShadow(t) }]}>
        {photoUrl ? <Image source={{ uri: photoUrl }} contentFit="cover" cachePolicy="memory" style={styles.avatarPhoto} />
          : <Text accessible={false} style={[textStyles.title, { color: t.text }]}>{initials}</Text>}
      </View>
      <View style={styles.identityCopy}>
        <Text accessibilityRole="header" style={[textStyles.title, styles.centered, { color: t.text }]}>{displayName}</Text>
        <Text style={[textStyles.body, styles.centered, { color: t.muted }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

export function ProfileContent({
  displayName, fullName = displayName, email, groupSummary, photoUrl, uploadingPhoto, onPhoto, onDeleteAccount, roleLabel, serviceNames, locationTitle, locationSubtitle,
  groupName, groupRoleLabel, groupCount, mode, pendingCount, busy, canEdit,
  onEdit, serviceMenu, groupMenu, onGroups, onJoin, onPending, onSignOut,
}: ProfileContentProps) {
  const t = useAppTheme();
  const [section, setSection] = useState<'details' | 'groups'>('details');
  const groupCountLabel = mode === 'leader'
    ? `${groupCount} leadership group${groupCount === 1 ? '' : 's'}`
    : `${groupCount} active membership${groupCount === 1 ? '' : 's'}`;
  const editDisabled = busy || !canEdit;

  return <View>
    <ProfileIdentity displayName={displayName} photoUrl={photoUrl} subtitle={roleLabel} />

    <View accessibilityRole="tablist" style={[styles.sections, { borderBottomColor: t.track }]}>
      {(['details', 'groups'] as const).map((value) => <Pressable key={value} accessibilityRole="tab"
        accessibilityLabel={value === 'details' ? 'Details' : `Groups, ${groupCount}`}
        accessibilityState={{ selected: section === value }} aria-selected={section === value}
        onPress={() => setSection(value)} style={[styles.sectionTab, { borderBottomColor: section === value ? t.strong : 'transparent' }]}>
        <Text style={[textStyles.button, { color: section === value ? t.text : t.muted }]}>{value === 'details' ? 'Details' : 'Groups'}</Text>
        {value === 'groups' ? <Text style={[textStyles.body, { color: t.muted }]}>{groupCount}</Text> : null}
      </Pressable>)}
    </View>

    {section === 'details' ? <View>
      <ProfileRow icon={icons.name} title="Name" detail={fullName} disabled={editDisabled} onPress={() => onEdit('name')} />
      <ProfileEmailRow email={email} />
      <ProfileRow icon={icons.photo} title="Profile photo" detail={uploadingPhoto ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add a photo'} disabled={editDisabled} onPress={onPhoto} />
      <ProfileServicesMenu {...serviceMenu} disabled={editDisabled}>
        <ProfileRow icon={icons.services} title="Services" detail={serviceNames.join(', ') || 'Not set'} disabled={editDisabled} onPress={() => onEdit('services')} />
      </ProfileServicesMenu>
      <ProfileRow icon={icons.location} title="Postal district" detail={`${locationSubtitle} · ${locationTitle}`} disabled={editDisabled} onPress={() => onEdit('postal')} divider={false} />
      {groupName && groupSummary ? <ProfileGroupSummary groupName={groupName} summary={groupSummary} /> : null}
      <View style={styles.signOut}><ProfileRow icon={icons.signOut} title="Sign out" disabled={busy} onPress={onSignOut} divider={false} /></View>
      <ProfileRow icon={icons.deleteAccount} title="Delete account" disabled={busy} onPress={onDeleteAccount} divider={false} destructive />
    </View> : <View style={styles.groupSection}>
      <ProfileGroupMenu {...groupMenu} disabled={busy}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${groupName ?? 'No active group'}, ${groupCountLabel}. View groups`}
        accessibilityState={{ disabled: busy }} aria-disabled={busy} disabled={busy} onPress={onGroups}
        style={({ pressed }) => [styles.groupCard, { backgroundColor: pressed ? t.soft : t.surface, ...surfaceShadow(t) }]}>
        <View style={styles.groupTop}>
          <ProfileIcon name={icons.groups} />
          <Text style={[textStyles.body, styles.flex, { color: t.muted }]}>{mode === 'leader' ? 'Leading' : 'Selected group'}</Text>
          {groupName ? <Text style={[textStyles.body, { color: t.muted }]}>{groupRoleLabel}</Text> : null}
        </View>
        <Text style={[textStyles.section, { color: t.text }]}>{groupName ?? 'No active group'}</Text>
        <View style={styles.groupBottom}>
          <Text style={[textStyles.body, styles.flex, { color: t.muted }]}>{groupCountLabel}</Text>
          <ProfileIcon name={icons.chevron} size={12} />
        </View>
      </Pressable>
      </ProfileGroupMenu>
      <ProfileGroupMenu {...groupMenu} disabled={busy}>
        <ProfileRow icon={icons.groups} title="Switch group or mode" disabled={busy} onPress={onGroups} />
      </ProfileGroupMenu>
      {mode === 'member' ? <>
        <ProfileRow icon={icons.join} title="Join another group" disabled={busy} onPress={onJoin} />
        {pendingCount > 0 ? <ProfileRow icon={icons.pending} title="Pending requests" count={pendingCount} disabled={busy} onPress={onPending} divider={false} /> : null}
      </> : null}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  centered: { textAlign: 'center' },
  identity: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  avatar: { minWidth: 72, minHeight: 72, padding: spacing.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  avatarPhoto: { position: 'absolute', width: 72, height: 72, borderRadius: 36 },
  identityCopy: { gap: spacing.xs, alignItems: 'center', alignSelf: 'stretch' },
  sections: { flexDirection: 'row', gap: spacing.xl, borderBottomWidth: 1 },
  sectionTab: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 2, paddingHorizontal: spacing.xs },
  row: { minHeight: 64, paddingVertical: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowDetail: { marginTop: spacing.xs },
  divider: { height: 1 },
  badge: { minWidth: 28, textAlign: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, overflow: 'hidden' },
  signOut: { marginTop: spacing.xl },
  membershipSummary: { marginTop: spacing.xl },
  groupSection: { paddingTop: spacing.lg },
  groupCard: { padding: spacing.lg, borderRadius: radius.lg },
  groupTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  groupBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
});
