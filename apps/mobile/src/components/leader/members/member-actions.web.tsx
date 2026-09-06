import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import type { MemberActionsProps } from './member-actions.types';

export function MemberActions({ name, children, width, height, inactive, disabled, onChangeStatus, onRemove }: MemberActionsProps) {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${name}`} accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => setOpen(true)} style={{ width, height }}>
      {children}
    </Pressable>
    <Modal visible={open && !disabled} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close member actions" accessibilityRole="button" onPress={() => setOpen(false)} />
        <View accessibilityViewIsModal style={[styles.menu, surfaceShadow(t), { backgroundColor: t.surface }]}>
          <Text style={[textStyles.section, { color: t.text }]}>{name}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onChangeStatus(); }} style={styles.action}>
            <Text style={[textStyles.button, { color: t.text }]}>{inactive ? 'Reactivate' : 'Mark inactive'}</Text>
          </Pressable>
          <View style={{ height: 1, backgroundColor: t.track, marginTop: 8 }} />
          <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onRemove(); }} style={styles.action}>
            <Text style={[textStyles.button, { color: t.danger }]}>Remove from group</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.action}><Text style={[textStyles.body, { color: t.muted }]}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0005', padding: 24 },
  menu: { width: '100%', maxWidth: 340, padding: 20, borderRadius: radius.lg },
  action: { minHeight: 48, justifyContent: 'center', marginTop: 8 },
});
