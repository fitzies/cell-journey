import { useMutation } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { router } from 'expo-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { AppHeaderProps } from '@/components/app-header.types';
import { useGroups } from '@/components/group-context';
import { api, type Id } from '@/lib/api';
import { MAX_EVENT_IMPORT_FILE_BYTES, parseEventImport, type EventImportPreview } from '@/lib/event-import';
import { ImportPreviewModal } from './import-preview';

type EventActionGroup = ReturnType<typeof useGroups>['selectedLeaderGroup'];
type PendingImport = { groupId: Id<'groups'>; groupName: string; preview: EventImportPreview };

export function useEventActions(group: EventActionGroup) {
  const { ledGroups } = useGroups();
  const groupsRef = useRef(ledGroups);
  useLayoutEffect(() => { groupsRef.current = ledGroups; }, [ledGroups]);
  const busyRef = useRef(false);
  const [pickingFile, setPickingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const importEvents = useMutation(api.events.importForGroup);

  const openCreate = () => {
    if (!group?.capabilities.createEvents || busyRef.current) return;
    router.push({ pathname: '/create-event', params: { groupId: group._id } });
  };

  const pickImportFile = async () => {
    if (!group?.capabilities.importEvents || busyRef.current || pendingImport) return;
    // Keep the destination fixed even if the selected group changes while the picker is open.
    const target = { groupId: group._id, groupName: group.name };
    busyRef.current = true;
    setPickingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('No file was selected.');
      if (asset.size && asset.size > MAX_EVENT_IMPORT_FILE_BYTES) throw new Error('Choose a file smaller than 5 MB.');
      const data = asset.file ? await asset.file.arrayBuffer() : await new ExpoFile(asset.uri).arrayBuffer();
      if (data.byteLength > MAX_EVENT_IMPORT_FILE_BYTES) throw new Error('Choose a file smaller than 5 MB.');
      if (!groupsRef.current.find((candidate) => candidate._id === target.groupId)?.capabilities.importEvents) {
        throw new Error('You no longer have permission to import events for this group.');
      }
      setPendingImport({ ...target, preview: parseEventImport(data, asset.name) });
    } catch (error) {
      Alert.alert('Could not read file', error instanceof Error ? error.message : 'Choose a CSV or XLSX file and try again.');
    } finally {
      busyRef.current = false;
      setPickingFile(false);
    }
  };

  const confirmImport = async () => {
    if (!pendingImport || busyRef.current) return;
    if (!groupsRef.current.find((candidate) => candidate._id === pendingImport.groupId)?.capabilities.importEvents) {
      Alert.alert('Access changed', 'You no longer have permission to import events for this group.');
      return;
    }
    const { preview, groupId } = pendingImport;
    const events = preview.rows.flatMap((row) => row.event && row.errors.length === 0 ? [row.event] : []);
    if (!events.length || events.length !== preview.rows.length) return;
    busyRef.current = true;
    setImporting(true);
    try {
      const result = await importEvents({ groupId, sourceType: preview.sourceType, fileName: preview.fileName, events });
      setPendingImport(null);
      Alert.alert('Events imported', `${result.insertedCount} ${result.insertedCount === 1 ? 'event is' : 'events are'} now in ${pendingImport.groupName}.`);
    } catch (error) {
      Alert.alert('Could not import events', error instanceof Error ? error.message : 'Nothing was imported. Please try again.');
    } finally {
      busyRef.current = false;
      setImporting(false);
    }
  };

  const eventActions: AppHeaderProps['eventActions'] = {
    onCreate: group?.capabilities.createEvents ? openCreate : undefined,
    onImport: group?.capabilities.importEvents ? pickImportFile : undefined,
    disabled: pickingFile || importing || pendingImport !== null,
  };

  return {
    eventActions,
    importModal: <ImportPreviewModal
      preview={pendingImport?.preview ?? null}
      groupName={pendingImport?.groupName ?? ''}
      importing={importing}
      onConfirm={confirmImport}
      onClose={() => { if (!busyRef.current) setPendingImport(null); }}
    />,
  };
}
