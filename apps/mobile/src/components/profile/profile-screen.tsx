import { getPostalDistrict } from '@cell-journey/domain';
import { useAuthActions } from '@convex-dev/auth/react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader, type AppMode } from '@/components/app-header';
import { leaderAccessLabel, useGroups } from '@/components/group-context';
import { LoadingState } from '@/components/onboarding/ui';
import { useAppTheme } from '@/constants/tokens';
import { api, type Id } from '@/lib/api';
import { getProfileDisplayName } from '@/lib/name';
import { getProfileLocationLabel } from '@/lib/profile-location';
import { ProfileContent } from './profile-content';
import { ProfileGroupsSheet } from './profile-groups-sheet';
import { ProfileFieldDialog } from './profile-field-dialog';
import type { ProfileField, ProfileFieldValues } from './profile-field-model';
import { pickProfilePhoto } from '@/lib/profile-photo';
import { useAccountActions } from '@/components/account-actions';

export function ProfileScreen({ mode }: { mode: AppMode }) {
  const t = useAppTheme();
  const { signOut } = useAuthActions();
  const { deleteAccount } = useAccountActions();
  const photoUrl = useQuery(api.profilePhotos.current, {});
  const uploadPhoto = useAction(api.profilePhotos.upload);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const profile = useQuery(api.profiles.current, {});
  const services = useQuery(api.groups.listServices, {});
  const groups = useGroups();
  const leaveGroup = useMutation(api.groups.leaveGroup);
  const updateProfile = useMutation(api.profiles.updateProfileField);
  const [editing, setEditing] = useState<ProfileField | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  if (profile === undefined || services === undefined || groups.context === undefined) return <LoadingState />;

  const leader = mode === 'leader';
  const selected = leader ? groups.selectedLeaderGroup : groups.selectedMemberGroup?.group;
  const entries = leader
    ? groups.ledGroups.map((group) => ({ id: group._id, name: group.name, role: leaderAccessLabel(group.accessRole) }))
    : groups.memberGroups.map(({ group }) => ({ id: group._id, name: group.name, role: 'Member' }));
  const district = getPostalDistrict(profile?.postalDistrict);
  const serviceNames = services.filter((service) => profile?.serviceIds.includes(service._id)).map((service) => service.name);
  const activeServiceIds = profile?.serviceIds.filter(id => services.some(service => service._id === id)) ?? [];
  const initialValues: ProfileFieldValues = {
    firstName: profile?.firstName ?? '', lastName: profile?.lastName ?? '',
    postalSector: '', serviceIds: activeServiceIds,
  };
  const saveField = async (field: ProfileField, values: ProfileFieldValues) => {
    if (!profile || busyRef.current) throw new Error('Please wait and try again.');
    busyRef.current = true;
    setBusy(true);
    try {
      const change = field === 'name'
        ? { field, firstName: values.firstName.trim(), lastName: values.lastName.trim() }
        : field === 'services' ? { field, serviceIds: values.serviceIds }
          : { field, postalSector: values.postalSector };
      await updateProfile({ change });
    } finally { busyRef.current = false; setBusy(false); }
  };
  const toggleService = (id: Id<'services'>) => {
    if (busyRef.current) return;
    const serviceIds = activeServiceIds.includes(id) ? activeServiceIds.filter(value => value !== id) : [...activeServiceIds, id];
    if (!serviceIds.length) return;
    void saveField('services', { ...initialValues, serviceIds }).catch(error => {
      Alert.alert('Could not save services', error instanceof Error ? error.message : 'Please try again.');
    });
  };
  const changePhoto = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const bytes = await pickProfilePhoto();
      if (!bytes) return;
      setUploadingPhoto(true);
      await uploadPhoto({ bytes });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try another photo.';
      if (Platform.OS === 'web') globalThis.alert(message);
      else Alert.alert('Could not update photo', message);
    } finally { busyRef.current = false; setBusy(false); setUploadingPhoto(false); }
  };

  const run = async (action: () => Promise<void>, title: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await action(); }
    catch (error) { Alert.alert(title, error instanceof Error ? error.message : 'Please try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const confirm = (title: string, message: string, label: string, action: () => void) => {
    if (busyRef.current) return;
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`${title}\n\n${message}`)) action();
    } else Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: label, style: 'destructive', onPress: action }]);
  };
  const confirmLeave = () => {
    if (leader || !selected) return;
    // Capture the displayed group before confirmation; switching context cannot change the target.
    const target = selected;
    confirm(`Leave ${target.name}?`, 'Your other groups stay active. Past attendance remains saved.', 'Leave group', () => {
      void run(async () => {
        await leaveGroup({ groupId: target._id });
        setGroupsOpen(false);
        if (groups.memberGroups.length <= 1) router.replace('/(onboarding)');
      }, 'Could not leave group');
    });
  };

  return <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: t.background }]}>
    <AppHeader title="Profile" mode={mode} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <ProfileContent
        mode={mode}
        displayName={getProfileDisplayName(profile, leader ? 'Leader' : 'Member')}
        fullName={profile?.fullName}
        photoUrl={photoUrl}
        uploadingPhoto={uploadingPhoto}
        onPhoto={() => { void changePhoto(); }}
        onDeleteAccount={() => confirm('Delete your account?', 'This permanently removes your account, personal profile details and photo. All group memberships and leadership end. Historical group records remain under “Deleted member”. This cannot be undone.', 'Delete account', deleteAccount)}
        roleLabel={leader ? 'Leader' : 'Member'}
        serviceNames={serviceNames}
        locationTitle={district?.area ?? getProfileLocationLabel(profile)}
        locationSubtitle={district ? `District ${district.number}` : 'Postal district'}
        groupName={selected?.name ?? null}
        groupRoleLabel={leader && groups.selectedLeaderGroup ? leaderAccessLabel(groups.selectedLeaderGroup.accessRole) : 'Member'}
        groupCount={entries.length}
        pendingCount={groups.context.pendingRequests.length}
        busy={busy}
        canEdit={Boolean(profile)}
        onEdit={field => { if (!busyRef.current) setEditing(field); }}
        serviceMenu={{ services, selectedIds: activeServiceIds, onToggle: toggleService }}
        groupMenu={{
          mode, selectedId: selected?._id ?? null,
          entries: [
            ...groups.memberGroups.map(({ group }) => ({ id: group._id, name: group.name, mode: 'member' as const, role: 'Member' })),
            ...groups.ledGroups.map(group => ({ id: group._id, name: group.name, mode: 'leader' as const, role: leaderAccessLabel(group.accessRole) })),
          ],
          onSelect: entry => {
            if (busyRef.current) return;
            if (entry.mode === 'leader') groups.selectLeaderGroup(entry.id as Id<'groups'>);
            else groups.selectMemberGroup(entry.id as Id<'groups'>);
            if (entry.mode !== mode) router.replace(entry.mode === 'leader' ? '/(leader-tabs)/profile' : '/(member-tabs)/profile');
          },
          onLeave: !leader && selected ? confirmLeave : undefined,
        }}
        onGroups={() => setGroupsOpen(true)}
        onJoin={() => router.push('/(onboarding)/group-code')}
        onPending={() => router.push('/(onboarding)/pending')}
        onSignOut={() => confirm('Sign out?', 'You can sign back in to access your groups and attendance history.', 'Sign out', () => {
          void run(async () => { await signOut(); router.replace('/(auth)'); }, 'Could not sign out');
        })}
      />
    </ScrollView>
    {editing && profile ? <ProfileFieldDialog key={`${profile._id}:${editing}`} field={editing}
      initial={initialValues} services={services} onSave={values => saveField(editing, values)} onClose={() => setEditing(null)} /> : null}
    {groupsOpen ? <ProfileGroupsSheet
      mode={mode}
      entries={entries}
      selectedId={selected?._id ?? null}
      busy={busy}
      onClose={() => { if (!busyRef.current) setGroupsOpen(false); }}
      onSelect={(id) => { if (busyRef.current) return; if (leader) groups.selectLeaderGroup(id); else groups.selectMemberGroup(id); }}
      onLeave={!leader && selected ? confirmLeave : undefined}
    /> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 108 },
});
