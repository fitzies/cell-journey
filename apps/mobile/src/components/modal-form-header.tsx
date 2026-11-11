import { Stack } from 'expo-router';
import { Button, Platform } from 'react-native';
import { useAppTheme } from '@/constants/tokens';

/**
 * Header for full-screen form modals: native close on the left and a Done
 * checkmark on the right, matching the create-event modal.
 */
export function ModalFormHeader({ title, onClose, onDone, doneLabel, doneDisabled, closeDisabled }: {
  title: string;
  onClose: () => void;
  onDone?: () => void;
  doneLabel: string;
  doneDisabled?: boolean;
  closeDisabled?: boolean;
}) {
  const t = useAppTheme();
  return <>
    <Stack.Screen options={{ title, ...(Platform.OS === 'web' ? {
      headerLeft: () => <Button title="×" accessibilityLabel="Close" color={t.ink} disabled={closeDisabled} onPress={onClose} />,
      headerRight: onDone ? () => <Button title={doneLabel} color={t.ink} disabled={doneDisabled} onPress={onDone} /> : undefined,
    } : {}) }} />
    {Platform.OS !== 'web' ? <>
      <Stack.Toolbar placement="left" tintColor={t.ink}>
        <Stack.Toolbar.Button accessibilityLabel="Close" icon={Platform.OS === 'ios' ? 'xmark' : require('@/assets/images/toolbar/close.png')} iconRenderingMode="template" disabled={closeDisabled} separateBackground onPress={onClose} />
      </Stack.Toolbar>
      {onDone ? <Stack.Toolbar placement="right" tintColor={t.ink}>
        <Stack.Toolbar.Button accessibilityLabel={doneLabel} icon={Platform.OS === 'ios' ? 'checkmark' : require('@/assets/images/toolbar/checkmark.png')} iconRenderingMode="template" disabled={doneDisabled} separateBackground onPress={onDone} />
      </Stack.Toolbar> : null}
    </> : null}
  </>;
}
