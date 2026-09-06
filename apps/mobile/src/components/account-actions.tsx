import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { textStyles, useAppTheme } from '@/constants/tokens';

const AccountActions = createContext({ deleteAccount: () => {} });

export function AccountActionsProvider({ children }: { children: ReactNode }) {
  const remove = useMutation(api.accountDeletion.deleteCurrentAccount);
  const { signOut } = useAuthActions();
  const [deleting, setDeleting] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const started = useRef(false);
  const committed = useRef(false);
  const t = useAppTheme();

  // Unmount authenticated subscriptions before deletion invalidates their data.
  // The effect starts only after that loading state has committed.
  useEffect(() => {
    if (!deleting || started.current || signOutFailed) return;
    started.current = true;
    void (async () => {
      try {
        if (!committed.current) await remove({});
        committed.current = true;
        await signOut();
        setDeleting(false);
      } catch (error) {
        if (committed.current) setSignOutFailed(true);
        else {
          const message = error instanceof Error ? error.message : 'Please try again.';
          if (Platform.OS === 'web') globalThis.alert(message);
          else Alert.alert('Could not delete account', message);
          setDeleting(false);
        }
      } finally {
        started.current = false;
      }
    })();
  }, [deleting, signOutFailed, remove, signOut]);

  return <AccountActions.Provider value={{ deleteAccount: () => { committed.current = false; setDeleting(true); } }}>
    {deleting ? <View style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      {signOutFailed ? <>
        <Text accessibilityRole="alert" style={[textStyles.body, { color: t.text }]}>Your account is deleted. Finish signing out on this device.</Text>
        <Pressable accessibilityRole="button" onPress={() => setSignOutFailed(false)} style={{ padding: 16 }}>
          <Text style={[textStyles.button, { color: t.text }]}>Retry sign out</Text>
        </Pressable>
      </> : <>
        <ActivityIndicator color={t.strong} />
        <Text accessibilityRole="alert" style={[textStyles.body, { color: t.text }]}>Deleting your account…</Text>
      </>}
    </View> : children}
  </AccountActions.Provider>;
}

export function useAccountActions() { return useContext(AccountActions); }
