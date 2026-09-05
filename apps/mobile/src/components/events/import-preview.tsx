import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '@/components/leader/ui';
import { fonts, radius, surfaceShadow, textStyles, useAppTheme } from '@/constants/tokens';
import type { EventImportPreview } from '@/lib/event-import';

export function ImportPreviewModal({ preview, importing, onConfirm, onClose, groupName }: { groupName: string; preview: EventImportPreview | null; importing: boolean; onConfirm: () => void; onClose: () => void }) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  if (!preview) return null;

  const invalidCount = preview.rows.filter((row) => row.errors.length > 0).length;
  const warningCount = preview.rows.filter((row) => row.warnings.length > 0).length;
  const readyCount = preview.rows.length - invalidCount;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheet, styles.importSheet, { backgroundColor: t.surface, ...surfaceShadow(t), paddingBottom: Math.max(18, insets.bottom + 10) }]}>
          <View style={[styles.sheetHandle, { backgroundColor: t.line }]} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.formEyebrow, { color: invalidCount ? t.danger : t.accent }]}>Import preview</Text>
              <Text style={[styles.formTitle, { color: t.ink }]} numberOfLines={1}>{preview.fileName}</Text>
              <Text style={[styles.previewSummary, { color: t.muted }]}>{groupName}</Text>
              <Text style={[styles.previewSummary, { color: t.muted }]}>
                {invalidCount
                  ? `${invalidCount} ${invalidCount === 1 ? 'row needs' : 'rows need'} attention · nothing will import yet`
                  : `${readyCount} ${readyCount === 1 ? 'event' : 'events'} ready · ${preview.sourceType.toUpperCase()}${warningCount ? ` · ${warningCount} past` : ''}`}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close import preview" disabled={importing} onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.closeButton, { backgroundColor: t.surface, ...surfaceShadow(t, 'button'), opacity: importing ? 0.45 : 1, transform: [{ scale: pressed && !importing ? 0.96 : 1 }] }]}>
              <Text style={[styles.closeText, { color: t.ink }]}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.previewList}>
            {preview.rows.map((row) => {
              const valid = row.errors.length === 0;
              const hasWarning = row.warnings.length > 0;
              const details = row.event ? [
                row.event.venue ? `Venue · ${row.event.venue}` : null,
                row.event.word ? `Word · ${row.event.word}` : null,
                row.event.worship ? `Worship · ${row.event.worship}` : null,
              ].filter(Boolean) : [];
              return (
                <View key={row.sourceRow} style={[styles.previewRow, { backgroundColor: t.background, borderColor: valid ? hasWarning ? t.accent : t.line : t.danger }]}>
                  <View style={[styles.previewMark, { backgroundColor: valid ? t.soft : t.danger }]}>
                    <Text style={[styles.previewMarkText, { color: valid ? t.accent : t.accentInk }]}>{valid ? hasWarning ? '•' : '✓' : '!'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.previewTitle, { color: t.ink }]} numberOfLines={1}>{row.title}</Text>
                    <Text style={[styles.previewMeta, { color: t.muted }]}>{row.dateLabel} · {row.timeLabel} · row {row.sourceRow}</Text>
                    {details.map((detail) => <Text key={detail} style={[styles.previewDetail, { color: t.muted }]}>{detail}</Text>)}
                    {row.event?.remarks ? <Text style={[styles.previewRemarks, { color: t.ink }]}>{row.event.remarks}</Text> : null}
                    {row.warnings.map((warning) => <Text key={warning} style={[styles.previewWarning, { color: t.accent }]}>{warning}</Text>)}
                    {row.errors.map((error) => <Text key={error} style={[styles.previewError, { color: t.danger }]}>{error}</Text>)}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.previewActions}>
            <ActionButton filled label={importing ? 'Importing…' : `Import ${readyCount} ${readyCount === 1 ? 'event' : 'events'}`} disabled={importing || invalidCount > 0 || readyCount === 0} onPress={onConfirm} />
            <ActionButton label={invalidCount ? 'Close and fix file' : 'Not now'} disabled={importing} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.34)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 18 },
  importSheet: { maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 999, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  closeButton: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  closeText: { marginTop: -2, fontFamily: fonts.bodySemiBold, fontSize: 26, lineHeight: 28 },
  formEyebrow: { fontFamily: fonts.bodyBold, fontSize: 10.5, letterSpacing: 1.7, textTransform: 'uppercase' },
  formTitle: { ...textStyles.title, marginTop: 6 },
  previewSummary: { marginTop: 7, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  previewList: { paddingTop: 18, paddingBottom: 12, gap: 9 },
  previewRow: { borderWidth: 1, borderRadius: radius.lg, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  previewMark: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  previewMarkText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  previewTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  previewMeta: { marginTop: 4, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17 },
  previewDetail: { marginTop: 3, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17 },
  previewRemarks: { marginTop: 5, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17 },
  previewWarning: { marginTop: 5, fontFamily: fonts.bodySemiBold, fontSize: 12.5, lineHeight: 17 },
  previewError: { marginTop: 5, fontFamily: fonts.bodySemiBold, fontSize: 12.5, lineHeight: 17 },
  previewActions: { gap: 9 },
});
